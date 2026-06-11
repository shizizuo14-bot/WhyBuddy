/**
 * WhyBuddy V5.1 Full-Path Acceptance Test Plan — Batch 3a: runtime projection & persistence.
 * Spec: docs/V5.1-full-path-test-plan.md (§2 scenarios S21, S22; §4 edges 9/113/114/115/116/117).
 *
 * Scope of THIS file:
 *  - S21 (🟡) runtime projection & replay
 *      · P3 (✅ core): assertDeriveReadOnly — DERIVE leaves authoritative STATE deep-equal, only
 *        graph.nodes[].status may change (rich session).
 *      · 🟡 P3 residual forward assertion: saveSessionState's persisted result still carries the
 *        node-status projection (node status persisted WITH state) -> encoded it.fails.
 *      · 🟡 incremental derive: full-recompute today, "only 1 node recomputes" -> encoded it.fails.
 *      · Replay isolation by sessionId through the durable store (load/list isolate sessions).
 *  - S22 (🟡) persistence & session isolation
 *      · save a converged session, load it back by the SAME sessionId, assert
 *        goal/artifacts/staleArtifactIds/decisionLedger fully restored, then continue with a
 *        challenge (resume from breakpoint).
 *      · dual-session isolation: session A's challenge does not affect session B's stale set.
 *      · 🟡 "client defaults to InMemory, refresh loses state": the InMemory round-trip contract is
 *        proven directly; the genuinely-unwired browser-refresh-persistence behavior (default store
 *        must be a durable HttpWhyBuddySessionStore — B-5) is encoded as an it.fails forward
 *        assertion by simulating a refresh with a FRESH (empty) store instance.
 *
 * Every assertion is mechanical / binary, sourced ONLY from V5SessionState, the durable store
 * contract, and pure runtime helpers (deriveNodeStatus / assertDeriveReadOnly) — never human
 * judgement.
 *
 * STORE NOTE: `InMemoryWhyBuddySessionStore` is NOT exported from whybuddy-runtime.ts (only the
 * default instance is installed internally). To drive "two sessions through the InMemory store" as
 * the doc asks while staying fully isolated per-test, this file installs a local
 * `TestInMemorySessionStore` that mirrors the runtime's in-memory impl byte-for-byte (same meta /
 * createdAt / lastActive / listSessions shape), via setWhyBuddySessionStore in beforeEach and
 * restores the original store in afterEach so no state leaks across tests or files.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createInitialSessionState,
  orchestrateReasoningTurn,
  deriveNodeStatus,
  invalidateForIntervention,
  saveSessionState,
  loadOrCreateSessionState,
  listWhyBuddySessions,
  deleteWhyBuddySession,
  setWhyBuddySessionStore,
  getWhyBuddySessionStore,
  type WhyBuddySessionStore,
} from './whybuddy-runtime';
import { assertDeriveReadOnly } from './whybuddy-derive-readonly-guard';
import { buildClearStateWithTrustedReport, COMPLEX_GOAL_TEXT } from './whybuddy-fullpath-fixtures';
import type { V5SessionState, UserIntervention } from '@shared/blueprint/v5-reasoning-state';

// ---------------------------------------------------------------------------------------
// Local in-memory store mirroring the runtime's (unexported) InMemoryWhyBuddySessionStore.
// Same module-level Map + meta semantics so the durable-store contract is exercised faithfully.
// ---------------------------------------------------------------------------------------
class TestInMemorySessionStore implements WhyBuddySessionStore {
  private readonly store = new Map<string, V5SessionState>();
  private readonly meta = new Map<string, { createdAt: string; lastActive: string }>();

  async load(sessionId: string): Promise<V5SessionState | undefined> {
    const s = this.store.get(sessionId);
    if (s) {
      const m = this.meta.get(sessionId);
      if (m) return { ...s, createdAt: m.createdAt, lastActive: m.lastActive } as any;
    }
    return s;
  }

  async save(state: V5SessionState): Promise<V5SessionState> {
    const sessionId = state.sessionId || 'whybuddy-local-proto';
    const now = new Date().toISOString();
    const existingMeta = this.meta.get(sessionId);
    const createdAt = existingMeta?.createdAt || now;
    const saved = { ...state, sessionId, lastActive: now } as any;
    if (!saved.createdAt) saved.createdAt = createdAt;
    this.store.set(sessionId, saved);
    this.meta.set(sessionId, { createdAt, lastActive: now });
    return saved;
  }

  clear(): void {
    this.store.clear();
    this.meta.clear();
  }

  listSessions() {
    const out: any[] = [];
    for (const [sid, s] of this.store) {
      const m = this.meta.get(sid);
      out.push({
        sessionId: sid,
        goal: s.goal?.text || '',
        createdAt: m?.createdAt || (s as any).createdAt,
        lastActive: m?.lastActive || (s as any).lastActive,
        artifactCount: (s.artifacts || []).length,
        phase: (s as any).runtimePhase,
      });
    }
    return out;
  }

  deleteSession(sessionId: string): void {
    this.store.delete(sessionId);
    this.meta.delete(sessionId);
  }
}

let originalStore: WhyBuddySessionStore;

beforeEach(() => {
  originalStore = getWhyBuddySessionStore();
  setWhyBuddySessionStore(new TestInMemorySessionStore());
});

afterEach(() => {
  setWhyBuddySessionStore(originalStore);
});

/** A second, distinct session (one orchestrate turn) for isolation assertions. */
function buildSimpleSession(sessionId: string): V5SessionState {
  const s = createInitialSessionState(COMPLEX_GOAL_TEXT, sessionId);
  const { newState } = orchestrateReasoningTurn(s, { turnId: `${sessionId}-t1`, userText: '分析安全风险' });
  return newState;
}

// =====================================================================================
// S21 · 运行时投影与回放（runtime projection & replay）🟡
// =====================================================================================

describe('S21 · runtime projection & replay', () => {
  it('P3 (core): deriveNodeStatus leaves authoritative STATE deep-equal, only graph.nodes[].status may change (rich session)', () => {
    const { state } = buildClearStateWithTrustedReport('S21-p3');
    // Rich session sanity: real nodes + artifacts + decisions to project over.
    expect((state.graph?.nodes || []).length).toBeGreaterThan(0);
    expect((state.artifacts || []).length).toBeGreaterThan(0);
    expect((state.decisionLedger || []).length).toBeGreaterThan(0);

    const before = structuredClone(state);
    const after = deriveNodeStatus(state);

    // Input not mutated.
    expect(state).toEqual(before);
    // The guard throws on any authoritative-field write; only graph.nodes[].status may differ.
    assertDeriveReadOnly(before, after);
  });

  it('Replay isolation by sessionId: loading session A never surfaces session B events/artifacts', async () => {
    const a = buildClearStateWithTrustedReport('S21-iso-A');
    const b = buildSimpleSession('S21-iso-B');

    await saveSessionState(a.state);
    await saveSessionState(b);

    // listWhyBuddySessions surfaces both, keyed by sessionId.
    const list = await listWhyBuddySessions();
    const ids = list.map((e: any) => e.sessionId);
    expect(ids).toContain('S21-iso-A');
    expect(ids).toContain('S21-iso-B');

    // Load each back by id: STATE is isolated by sessionId.
    const loadedA = await loadOrCreateSessionState('S21-iso-A');
    const loadedB = await loadOrCreateSessionState('S21-iso-B');
    expect(loadedA.sessionId).toBe('S21-iso-A');
    expect(loadedB.sessionId).toBe('S21-iso-B');

    // Session A's artifact ids and session B's artifact ids are disjoint (no cross-session bleed).
    const aArtIds = new Set((loadedA.artifacts || []).map((x) => x.id));
    const bArtIds = new Set((loadedB.artifacts || []).map((x) => x.id));
    for (const id of aArtIds) expect(bArtIds.has(id)).toBe(false);
    // A's trusted report is present in A and absent from B.
    expect(aArtIds.has(a.reportId)).toBe(true);
    expect(bArtIds.has(a.reportId)).toBe(false);

    // Conversation streams are isolated too (B's turn id never appears in A).
    const aConvIds = (loadedA.conversation || []).map((c: any) => c.id).join('|');
    expect(aConvIds).not.toMatch(/S21-iso-B/);
  });

  // 🟡 P3 RESIDUAL (reported, not worked around): the node-status PROJECTION is still persisted
  // WITH state. saveSessionState calls deriveNodeStatus(state) before store.save, so the durable
  // record carries graph.nodes[].status (a DERIVE projection) rather than excluding it. The doc's
  // forward assertion is "saveSessionState serialized result must NOT contain node status
  // projection"; it.fails so it flips green the day the projection is moved out of durable STATE.
  it.fails(
    'P3 residual: the persisted (saved) state should NOT carry the node-status projection (projection still lives in durable STATE today)',
    async () => {
      const { state } = buildClearStateWithTrustedReport('S21-residual');
      const saved = await saveSessionState(state);
      // Expected once the projection is moved out of STATE: no persisted node carries `status`.
      const anyNodeHasStatus = (saved.graph?.nodes || []).some(
        (n: any) => Object.prototype.hasOwnProperty.call(n, 'status')
      );
      expect(anyNodeHasStatus).toBe(false);
    }
  );

  // 🟡 INCREMENTAL DERIVE (reported, not worked around): deriveNodeStatus is a FULL recompute — it
  // recomputes every node's status from authoritative data on every call. The doc wants "mark 1
  // node dirty -> derive recomputes only 1". To probe this we corrupt EVERY node's status to a
  // sentinel and count how many derive rewrites; an incremental (1-dirty) derive would rewrite at
  // most 1, but the full recompute rewrites many. Encoded it.fails so it flips green the day an
  // incremental derive (dirty-set aware) lands.
  it.fails(
    'incremental derive: marking nodes dirty should recompute only the dirty node (full recompute today)',
    () => {
      const { state } = buildClearStateWithTrustedReport('S21-incremental');
      // Corrupt all node statuses to a sentinel so any recompute is observable.
      const corrupted: V5SessionState = {
        ...state,
        graph: {
          ...state.graph,
          nodes: (state.graph?.nodes || []).map((n: any) => ({ ...n, status: 'pending' })),
        },
      };
      const after = deriveNodeStatus(corrupted);
      const beforeNodes = corrupted.graph.nodes || [];
      const afterNodes = after.graph?.nodes || [];
      const changed = afterNodes.filter(
        (n: any, i: number) => n.status !== (beforeNodes[i] as any).status
      ).length;
      // Sanity: there are several nodes to recompute (so "only 1" is a meaningful claim).
      expect(beforeNodes.length).toBeGreaterThan(1);
      // Expected once incremental derive lands: at most 1 node recomputes per dirty mark.
      expect(changed).toBeLessThanOrEqual(1);
    }
  );
});

// =====================================================================================
// S22 · 持久化与会话隔离（persistence & session isolation）🟡
// =====================================================================================

describe('S22 · persistence & session isolation', () => {
  it('round-trip: a converged session reloads by the SAME sessionId with goal/artifacts/staleArtifactIds/decisionLedger fully restored, then resumes a challenge from the breakpoint', async () => {
    const sessionId = 'S22-roundtrip';
    const { state, reportId, riskId } = buildClearStateWithTrustedReport(sessionId);
    expect(state.goal.status).toBe('clear');

    // Persist (saveSessionState derives before save), then load back by the SAME sessionId.
    await saveSessionState(state);
    const restored = await loadOrCreateSessionState(sessionId);

    // Full restoration of the authoritative fields the doc names.
    expect(restored.goal.status).toBe('clear');
    expect(restored.goal.text).toBe(state.goal.text);
    expect((restored.artifacts || []).map((a) => a.id).sort()).toEqual(
      (state.artifacts || []).map((a) => a.id).sort()
    );
    expect(restored.staleArtifactIds || []).toEqual(state.staleArtifactIds || []);
    expect((restored.decisionLedger || []).map((d) => d.id)).toEqual(
      (state.decisionLedger || []).map((d) => d.id)
    );
    // The trusted report survived the round-trip with its trust intact.
    const restoredReport = (restored.artifacts || []).find((a) => a.id === reportId);
    expect(restoredReport).toBeTruthy();
    expect(['gated_pass', 'audited']).toContain(restoredReport!.trustLevel);

    // Resume from the breakpoint: challenge the restored conclusion (continue into S4 territory).
    const challenged = invalidateForIntervention(restored, {
      targetArtifactId: riskId,
      intent: 'challenge',
      text: '刷新恢复后继续挑战这个风险结论',
    } as UserIntervention);

    // C-2 downgrade still works on the restored state, and the cascade staled the report.
    expect(challenged.goal.status).toBe('needs_refinement');
    expect(challenged.staleArtifactIds).toContain(riskId);
    expect(challenged.staleArtifactIds).toContain(reportId);

    // The resumed state persists back under the same sessionId (no session restart).
    const resaved = await saveSessionState(challenged);
    expect(resaved.sessionId).toBe(sessionId);
  });

  it('dual-session isolation: session A\'s challenge does not affect session B\'s stale set', async () => {
    const aBuilt = buildClearStateWithTrustedReport('S22-iso-A');
    const bBuilt = buildClearStateWithTrustedReport('S22-iso-B');

    await saveSessionState(aBuilt.state);
    await saveSessionState(bBuilt.state);

    // Challenge ONLY session A, then persist A.
    const aChallenged = invalidateForIntervention(aBuilt.state, {
      targetArtifactId: aBuilt.riskId,
      intent: 'challenge',
      text: '只挑战 A 会话',
    } as UserIntervention);
    expect(aChallenged.staleArtifactIds.length).toBeGreaterThan(0);
    await saveSessionState(aChallenged);

    // Reload both: A carries the new stale set; B is untouched.
    const loadedA = await loadOrCreateSessionState('S22-iso-A');
    const loadedB = await loadOrCreateSessionState('S22-iso-B');

    expect(loadedA.staleArtifactIds).toContain(aBuilt.riskId);
    expect(loadedA.goal.status).toBe('needs_refinement');

    // B's stale set is still empty and B's conclusion is still clear (no cross-session leakage).
    expect(loadedB.staleArtifactIds || []).toEqual([]);
    expect(loadedB.goal.status).toBe('clear');
  });

  it('deleteWhyBuddySession removes only the targeted session (isolation on delete)', async () => {
    await saveSessionState(buildClearStateWithTrustedReport('S22-del-A').state);
    await saveSessionState(buildClearStateWithTrustedReport('S22-del-B').state);

    await deleteWhyBuddySession('S22-del-A');

    const ids = (await listWhyBuddySessions()).map((e: any) => e.sessionId);
    expect(ids).not.toContain('S22-del-A');
    expect(ids).toContain('S22-del-B');
  });

  // 🟡 REFRESH-PERSISTENCE (reported, not worked around): the client defaults to an in-memory store,
  // so a real browser refresh (a fresh module load with a fresh, empty store) loses all state. This
  // cannot be expressed as a literal browser refresh in a unit test, so it is modeled by swapping in
  // a FRESH (empty) store instance — exactly what a reload of the default InMemory store would be —
  // and asserting the previously-saved session is recoverable. With the InMemory default it is NOT
  // (the new instance is empty). Encoded it.fails so it flips green the day the page defaults to a
  // durable HttpWhyBuddySessionStore (B-5) and the round-trip survives a fresh store instance.
  it.fails(
    'refresh persistence: a session saved before "refresh" should be recoverable after a fresh store instance (durable default not wired — B-5)',
    async () => {
      const sessionId = 'S22-refresh';
      const { state } = buildClearStateWithTrustedReport(sessionId);
      await saveSessionState(state);

      // Simulate a browser refresh: the default InMemory store is re-created empty on reload.
      setWhyBuddySessionStore(new TestInMemorySessionStore());

      // loadOrCreateSessionState returns a freshly-CREATED session (not the saved one) because the
      // new store is empty -> the saved converged conclusion is lost. Expected once a durable
      // default is wired: the saved 'clear' goal survives the refresh.
      const afterRefresh = await loadOrCreateSessionState(sessionId);
      expect(afterRefresh.goal.status).toBe('clear');
    }
  );
});
