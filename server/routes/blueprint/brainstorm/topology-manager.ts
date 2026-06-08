/**
 * topology-manager.ts — Topology Manager for the real multi-agent brainstorm
 * collaboration engine (autopilot-brainstorm-real-collaboration, R5).
 *
 * Pure, synchronous, NEVER-THROWS. Core contract: for ANY input, the manager
 * returns a single VALID, EXECUTABLE topology — if a named topology is supplied
 * and legal it is honored, otherwise it falls back to a default topology with a
 * recorded `fallbackReason`.
 *
 * A topology declares who critiques whom (challenger -> target), who synthesizes,
 * and the min/max round bounds. The default topology strings the participating
 * roles into an ACYCLIC critique chain (each role critiques the next; the last
 * role does NOT point back to the first), guaranteeing the critique relation
 * graph is a DAG so deliberation rounds can converge.
 *
 * Validation rules (R5.4 / R5.5):
 *   - every critiqueEdge endpoint (challenger & target) must be a session
 *     participant, else "unknown_role";
 *   - no self-loops (challenger !== target), else "self_loop";
 *   - the critique relation graph must be acyclic (DFS cycle detection), else
 *     "cyclic";
 *   - a multi-participant topology must declare at least one critique edge
 *     (otherwise it degenerates to a fixed all-parallel no-interaction shape),
 *     else "empty_edges";
 *   - minRounds <= maxRounds && maxRounds >= 1, otherwise the rounds are CLAMPED
 *     (not a fallback) to sane bounds.
 *
 * Any validation failure -> return `buildDefaultTopology(participatingRoleIds)`
 * with `fallbackReason` set. The whole resolution path is wrapped so a malformed
 * runtime input can never throw.
 *
 * @see .kiro/specs/autopilot-brainstorm-real-collaboration/design.md §1
 */

import type {
  BrainstormRoleId,
  BrainstormTopology,
  TopologyCritiqueEdge,
} from "../../../../shared/blueprint/brainstorm-contracts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Reason a named topology was rejected and the default was used instead (R5.4). */
export type TopologyFallbackReason =
  | "missing"
  | "unknown_role"
  | "cyclic"
  | "empty_edges"
  | "self_loop";

/** Input to {@link resolveTopology}. */
export interface ResolveTopologyInput {
  /** Session participants (from `session.crewMembers`). */
  participatingRoleIds: BrainstormRoleId[];
  /** Optional configurable named topology (from stage-config / decision). */
  named?: BrainstormTopology | null;
}

/** Result of {@link resolveTopology} — `topology` is ALWAYS valid & executable. */
export interface ResolveTopologyResult {
  topology: BrainstormTopology;
  usedDefault: boolean;
  fallbackReason?: TopologyFallbackReason;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MIN_ROUNDS = 2;
const DEFAULT_MAX_ROUNDS = 5;
/** Fallback synthesizer when no participants are available. */
const FALLBACK_SYNTHESIZER: BrainstormRoleId = "decider";

// ---------------------------------------------------------------------------
// Internal helpers (all defensive / never-throw)
// ---------------------------------------------------------------------------

/** Returns true when `value` is a non-empty string after trimming. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Sanitize a raw role list into a de-duplicated array of non-empty role ids.
 * Order is preserved (first occurrence wins). Never throws.
 */
function sanitizeRoleIds(raw: unknown): BrainstormRoleId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BrainstormRoleId[] = [];
  for (const item of raw) {
    if (isNonEmptyString(item) && !seen.has(item)) {
      seen.add(item);
      out.push(item as BrainstormRoleId);
    }
  }
  return out;
}

/**
 * Clamp a raw round value to a finite integer >= `min`, falling back to
 * `fallback` when the value is not a usable number.
 */
function clampRound(raw: unknown, min: number, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  const floored = Math.floor(raw);
  return floored < min ? min : floored;
}

/**
 * Detect a directed cycle in the critique relation graph using iterative DFS
 * with white/gray/black coloring. Self-loops are treated as cycles. Never
 * throws.
 */
function hasCycle(edges: TopologyCritiqueEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const edge of edges) {
    const from = edge.challenger;
    const to = edge.target;
    nodes.add(from);
    nodes.add(to);
    const list = adjacency.get(from);
    if (list) list.push(to);
    else adjacency.set(from, [to]);
  }

  // 0 = unvisited (white), 1 = in-progress (gray), 2 = done (black).
  const color = new Map<string, number>();

  for (const start of nodes) {
    if (color.get(start) === 2) continue;
    // Iterative DFS stack of [node, childIndex].
    const stack: Array<{ node: string; index: number }> = [
      { node: start, index: 0 },
    ];
    color.set(start, 1);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbors = adjacency.get(frame.node) ?? [];
      if (frame.index >= neighbors.length) {
        color.set(frame.node, 2);
        stack.pop();
        continue;
      }
      const next = neighbors[frame.index];
      frame.index += 1;
      const nextColor = color.get(next) ?? 0;
      if (nextColor === 1) {
        // Back-edge into an in-progress node -> cycle.
        return true;
      }
      if (nextColor === 0) {
        color.set(next, 1);
        stack.push({ node: next, index: 0 });
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the default topology (R5.1): participating roles strung into an ACYCLIC
 * critique chain — each role critiques the next, the last role does NOT point
 * back to the first (so the relation graph is a DAG). The synthesizer is
 * `"decider"` when present, otherwise the first participant. Rounds default to
 * `[2, 5]`. A single role yields an empty critique edge set (single-agent
 * monologue, equivalent to the prior all-parallel-no-interaction behavior).
 *
 * Never throws; tolerates malformed / empty input.
 */
export function buildDefaultTopology(
  roleIds: BrainstormRoleId[],
): BrainstormTopology {
  const participants = sanitizeRoleIds(roleIds);

  const critiqueEdges: TopologyCritiqueEdge[] = [];
  for (let i = 0; i < participants.length - 1; i += 1) {
    critiqueEdges.push({
      challenger: participants[i],
      target: participants[i + 1],
    });
  }

  const synthesizerRoleId: BrainstormRoleId = participants.includes("decider")
    ? "decider"
    : participants[0] ?? FALLBACK_SYNTHESIZER;

  return {
    name: "default",
    participants,
    critiqueEdges,
    synthesizerRoleId,
    minRounds: DEFAULT_MIN_ROUNDS,
    maxRounds: DEFAULT_MAX_ROUNDS,
  };
}

/**
 * Validate a topology against the session roster. Returns the first failing
 * {@link TopologyFallbackReason}, or `null` when the topology is legal.
 *
 * Round bounds are intentionally NOT validated here — they are clamped by
 * {@link resolveTopology} rather than triggering a fallback. Never throws.
 */
export function validateTopology(
  t: BrainstormTopology,
  roleIds: BrainstormRoleId[],
): TopologyFallbackReason | null {
  if (t === null || typeof t !== "object") return "missing";

  const participants = sanitizeRoleIds(roleIds);
  const roster = new Set<string>(participants);

  const edges = Array.isArray(t.critiqueEdges) ? t.critiqueEdges : [];

  // A multi-participant topology with no critique edges degenerates into a
  // fixed all-parallel no-interaction shape (R5.2) -> reject so the default
  // collaborative chain is used. A single participant legitimately has no edges.
  if (edges.length === 0) {
    return participants.length > 1 ? "empty_edges" : null;
  }

  for (const edge of edges) {
    if (edge === null || typeof edge !== "object") return "unknown_role";
    const { challenger, target } = edge;
    if (!isNonEmptyString(challenger) || !isNonEmptyString(target)) {
      return "unknown_role";
    }
    if (!roster.has(challenger) || !roster.has(target)) {
      return "unknown_role";
    }
    if (challenger === target) {
      return "self_loop";
    }
  }

  if (hasCycle(edges)) {
    return "cyclic";
  }

  return null;
}

/**
 * Resolve a topology for a brainstorm session (R5.2 / R5.3 / R5.4).
 *
 * - No named topology -> default (reason `"missing"`).
 * - Named topology that fails validation -> default (reason = the failure).
 * - Legal named topology -> honored, with round bounds clamped to sane values.
 *
 * ALWAYS returns a valid, executable topology. Never throws.
 */
export function resolveTopology(
  input: ResolveTopologyInput,
): ResolveTopologyResult {
  let roleIds: BrainstormRoleId[] = [];
  try {
    roleIds = sanitizeRoleIds(input?.participatingRoleIds);
    const named = input?.named;

    if (named === null || named === undefined) {
      return {
        topology: buildDefaultTopology(roleIds),
        usedDefault: true,
        fallbackReason: "missing",
      };
    }

    const reason = validateTopology(named, roleIds);
    if (reason !== null) {
      return {
        topology: buildDefaultTopology(roleIds),
        usedDefault: true,
        fallbackReason: reason,
      };
    }

    // Legal named topology: honor it, clamping rounds (R5: maxRounds >= 1,
    // minRounds <= maxRounds).
    const maxRounds = clampRound(named.maxRounds, 1, DEFAULT_MAX_ROUNDS);
    const minRoundsRaw = clampRound(named.minRounds, 1, DEFAULT_MIN_ROUNDS);
    const minRounds = Math.min(minRoundsRaw, maxRounds);

    return {
      topology: {
        name: isNonEmptyString(named.name) ? named.name : "configured",
        participants: sanitizeRoleIds(named.participants),
        critiqueEdges: named.critiqueEdges,
        synthesizerRoleId: isNonEmptyString(named.synthesizerRoleId)
          ? named.synthesizerRoleId
          : roleIds[0] ?? FALLBACK_SYNTHESIZER,
        minRounds,
        maxRounds,
      },
      usedDefault: false,
    };
  } catch {
    // Conservative side-channel: any unexpected runtime failure falls back to a
    // valid default rather than propagating.
    return {
      topology: buildDefaultTopology(roleIds),
      usedDefault: true,
      fallbackReason: "missing",
    };
  }
}
