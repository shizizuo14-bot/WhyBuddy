import type { AddressInfo } from 'node:net';
import { generateKeyPairSync } from 'node:crypto';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuditEventType } from '../../shared/audit/contracts.js';
import type {
  MissionDecision,
  MissionDecisionOption,
  MissionRecord,
} from '../../shared/mission/contracts.js';
import { BUILTIN_DECISION_TEMPLATES } from '../../shared/mission/decision-templates.js';
import {
  submitMissionDecision,
  type MissionDecisionRuntime,
} from '../tasks/mission-decision.js';
import { AuditChain } from '../audit/audit-chain.js';
import { AuditCollector } from '../audit/audit-collector.js';
import { installAuditHooks } from '../audit/audit-hooks.js';
import { TimestampProvider } from '../audit/timestamp-provider.js';
import { createTaskRouter, createDecisionTemplatesRouter } from '../routes/tasks.js';
import { MissionRuntime } from '../tasks/mission-runtime.js';
import { MissionStore } from '../tasks/mission-store.js';

/* ─── Mock MissionDecisionRuntime ─── */

function createMockRuntime(initialTasks: MissionRecord[] = []): MissionDecisionRuntime & {
  tasks: Map<string, MissionRecord>;
} {
  const tasks = new Map<string, MissionRecord>();
  for (const t of initialTasks) {
    tasks.set(t.id, structuredClone(t));
  }

  return {
    tasks,
    getTask(id: string) {
      const t = tasks.get(id);
      return t ? structuredClone(t) : undefined;
    },
    resumeMissionFromDecision(id, submission) {
      const t = tasks.get(id);
      if (!t) return undefined;
      if (submission.historyEntry) {
        const history = t.decisionHistory ? [...t.decisionHistory] : [];
        history.push(structuredClone(submission.historyEntry));
        t.decisionHistory = history;
      }
      t.status = 'running';
      t.waitingFor = undefined;
      t.decision = undefined;
      t.updatedAt = Date.now();
      tasks.set(id, t);
      return structuredClone(t);
    },
  };
}

function makeWaitingTask(
  id: string,
  decision: MissionDecision,
  overrides: Partial<MissionRecord> = {},
): MissionRecord {
  return {
    id,
    kind: 'chat',
    title: 'Test task',
    status: 'waiting',
    progress: 50,
    currentStageKey: 'execute',
    stages: [{ key: 'execute', label: 'Run execution', status: 'running' }],
    waitingFor: decision.prompt,
    decision,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    events: [],
    ...overrides,
  };
}

/* ─── Unit Tests ─── */

describe('submitMissionDecision — requiresComment validation', () => {
  it('returns 400 when option has requiresComment=true and freeText is empty', () => {
    const decision: MissionDecision = {
      prompt: 'Approve the plan?',
      options: [
        { id: 'approve', label: 'Approve' },
        { id: 'reject', label: 'Reject', requiresComment: true },
      ],
    };
    const task = makeWaitingTask('task_1', decision);
    const runtime = createMockRuntime([task]);

    const result = submitMissionDecision(runtime, 'task_1', {
      optionId: 'reject',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.statusCode).toBe(400);
      expect(result.error).toContain('comment');
    }
  });

  it('succeeds when option has requiresComment=true and freeText is provided', () => {
    const decision: MissionDecision = {
      prompt: 'Approve the plan?',
      options: [
        { id: 'approve', label: 'Approve' },
        { id: 'reject', label: 'Reject', requiresComment: true },
      ],
      allowFreeText: true,
    };
    const task = makeWaitingTask('task_2', decision);
    const runtime = createMockRuntime([task]);

    const result = submitMissionDecision(runtime, 'task_2', {
      optionId: 'reject',
      freeText: 'Needs more detail on step 3',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.optionId).toBe('reject');
      expect(result.decision.freeText).toBe('Needs more detail on step 3');
    }
  });

  it('accepts request-info clarification when free text is bound to a comment option', () => {
    const decision: MissionDecision = {
      prompt: 'Clarify the delivery scope',
      type: 'request-info',
      allowFreeText: false,
      options: [
        { id: 'skip', label: 'Skip for now' },
        {
          id: 'request-details',
          label: 'Request details',
          requiresComment: true,
        },
      ],
      decisionId: 'dec_request_info_comment_1',
    };
    const task = makeWaitingTask('task_request_info_comment_1', decision);
    const runtime = createMockRuntime([task]);

    const result = submitMissionDecision(runtime, 'task_request_info_comment_1', {
      optionId: 'request-details',
      freeText: 'Only the CN launch scope is in scope for this run.',
      submittedBy: 'operator-clarify',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision).toMatchObject({
        optionId: 'request-details',
        optionLabel: 'Request details',
        freeText: 'Only the CN launch scope is in scope for this run.',
      });
      expect(result.task.decisionHistory?.at(-1)).toMatchObject({
        decisionId: 'dec_request_info_comment_1',
        type: 'request-info',
        submittedBy: 'operator-clarify',
        reason: 'Only the CN launch scope is in scope for this run.',
        resolved: {
          optionId: 'request-details',
          optionLabel: 'Request details',
          freeText: 'Only the CN launch scope is in scope for this run.',
        },
      });
    }
  });

  it('rejects request-info free-text only submission when allowFreeText is disabled', () => {
    const decision: MissionDecision = {
      prompt: 'Clarify the missing data',
      type: 'request-info',
      allowFreeText: false,
      options: [{ id: 'submit', label: 'Submit clarification' }],
    };
    const task = makeWaitingTask('task_request_info_no_freetext_1', decision);
    const runtime = createMockRuntime([task]);

    const result = submitMissionDecision(runtime, 'task_request_info_no_freetext_1', {
      freeText: 'Need more detail on the target region.',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.statusCode).toBe(400);
      expect(result.error).toContain('free text only');
    }
  });
});

describe('submitMissionDecision — decision history append', () => {
  it('appends a DecisionHistoryEntry after successful decision', () => {
    const decision: MissionDecision = {
      prompt: 'Choose direction',
      options: [
        { id: 'left', label: 'Go Left' },
        { id: 'right', label: 'Go Right' },
      ],
      type: 'multi-choice',
      decisionId: 'dec_test_001',
    };
    const task = makeWaitingTask('task_3', decision);
    const runtime = createMockRuntime([task]);

    const result = submitMissionDecision(runtime, 'task_3', { optionId: 'left' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const history = result.task.decisionHistory ?? [];
      expect(history).toHaveLength(1);
      expect(history[0].decisionId).toBe('dec_test_001');
      expect(history[0].type).toBe('multi-choice');
      expect(history[0].resolved.optionId).toBe('left');
      expect(history[0].resolved.optionLabel).toBe('Go Left');
      expect(history[0].submittedAt).toBeGreaterThan(0);
    }
  });

  it('accumulates multiple decisions in decisionHistory', () => {
    const decision1: MissionDecision = {
      prompt: 'Step 1',
      options: [{ id: 'a', label: 'A' }],
      decisionId: 'dec_1',
    };
    const task = makeWaitingTask('task_4', decision1);
    const runtime = createMockRuntime([task]);

    // First decision
    const r1 = submitMissionDecision(runtime, 'task_4', { optionId: 'a' });
    expect(r1.ok).toBe(true);

    // submitMissionDecision appends history to the returned task clone.
    // Sync that history back into the mock store so the second call sees it.
    if (r1.ok) {
      const inner = runtime.tasks.get('task_4')!;
      inner.decisionHistory = structuredClone(r1.task.decisionHistory ?? []);
      inner.status = 'waiting';
      inner.decision = {
        prompt: 'Step 2',
        options: [{ id: 'b', label: 'B' }],
        decisionId: 'dec_2',
      };
      inner.waitingFor = 'Step 2';
      runtime.tasks.set('task_4', inner);
    }

    // Second decision
    const r2 = submitMissionDecision(runtime, 'task_4', { optionId: 'b' });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      const history = r2.task.decisionHistory ?? [];
      expect(history).toHaveLength(2);
      expect(history[0].decisionId).toBe('dec_1');
      expect(history[1].decisionId).toBe('dec_2');
    }
  });

  it('returns alreadyResolved when idempotentIfNotWaiting is enabled for an already resumed task', () => {
    const decision: MissionDecision = {
      prompt: 'Choose direction',
      options: [
        { id: 'left', label: 'Go Left' },
        { id: 'right', label: 'Go Right' },
      ],
      type: 'multi-choice',
      decisionId: 'dec_idempotent_resume_1',
    };
    const task = makeWaitingTask('task_idempotent_resume_1', decision);
    const runtime = createMockRuntime([task]);

    const firstResult = submitMissionDecision(runtime, 'task_idempotent_resume_1', {
      optionId: 'left',
      submittedBy: 'operator-idempotent',
    });

    expect(firstResult.ok).toBe(true);
    if (!firstResult.ok) {
      return;
    }

    const secondResult = submitMissionDecision(
      runtime,
      'task_idempotent_resume_1',
      {
        optionId: 'left',
        submittedBy: 'operator-idempotent',
      },
      {
        idempotentIfNotWaiting: true,
      },
    );

    expect(secondResult.ok).toBe(true);
    if (secondResult.ok) {
      expect(secondResult.alreadyResolved).toBe(true);
      expect(secondResult.task.status).toBe('running');
      expect(secondResult.detail).toContain('already processed');
      expect(secondResult.task.decisionHistory).toHaveLength(1);
      expect(secondResult.task.decisionHistory?.at(-1)).toMatchObject({
        decisionId: 'dec_idempotent_resume_1',
        submittedBy: 'operator-idempotent',
        resolved: {
          optionId: 'left',
          optionLabel: 'Go Left',
        },
      });
    }
  });

  it('preserves web-aigc metadata in resolved decision and history', () => {
    const decision: MissionDecision = {
      prompt: 'Choose direction',
      options: [
        { id: 'left', label: 'Go Left' },
        { id: 'right', label: 'Go Right' },
      ],
      type: 'custom-action',
      decisionId: 'dec_hitl_selection_1',
      payload: {
        nodeType: 'selection',
        nodeId: 'node-selection-1',
        sessionId: 'sess-1',
        interactionId: 'int-1',
        branchKey: 'branch-left',
      },
    };
    const task = makeWaitingTask('task_hitl_1', decision);
    const runtime = createMockRuntime([task]);

    const result = submitMissionDecision(runtime, 'task_hitl_1', {
      optionId: 'left',
      metadata: {
        nodeType: 'selection',
        nodeId: 'node-selection-1',
        sessionId: 'sess-1',
        interactionId: 'int-1',
        branchKey: 'branch-left',
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.metadata?.nodeType).toBe('selection');
      expect(result.decision.metadata?.nodeId).toBe('node-selection-1');
      expect(result.decision.metadata?.sessionId).toBe('sess-1');
      expect(result.decision.metadata?.interactionId).toBe('int-1');
      expect(result.decision.metadata?.branchKey).toBe('branch-left');

      const history = result.task.decisionHistory ?? [];
      expect(history).toHaveLength(1);
      expect(history[0].nodeId).toBe('node-selection-1');
      expect(history[0].nodeType).toBe('selection');
      expect(history[0].sessionId).toBe('sess-1');
      expect(history[0].interactionId).toBe('int-1');
      expect(history[0].branchKey).toBe('branch-left');
      expect(history[0].resolved.metadata?.sessionId).toBe('sess-1');
    }
  });

  it('persists submittedBy into decision history', () => {
    const decision: MissionDecision = {
      prompt: 'Choose a path',
      options: [
        { id: 'left', label: 'Go Left' },
        { id: 'right', label: 'Go Right' },
      ],
      decisionId: 'dec_submitter_1',
    };
    const task = makeWaitingTask('task_submitter_1', decision);
    const runtime = createMockRuntime([task]);

    const result = submitMissionDecision(runtime, 'task_submitter_1', {
      optionId: 'left',
      submittedBy: 'operator-alice',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const history = result.task.decisionHistory ?? [];
      expect(history).toHaveLength(1);
      expect(history[0].submittedBy).toBe('operator-alice');
    }
  });

  it('preserves route-selection semantics in resolved decision metadata and history', () => {
    const decision: MissionDecision = {
      prompt: 'Choose the route to continue',
      options: [
        { id: 'fast', label: 'Fast route' },
        { id: 'safe', label: 'Safe route', requiresComment: true },
      ],
      type: 'multi-choice',
      decisionId: 'dec_route_selection_history_1',
      payload: {
        candidateRoutes: [
          {
            optionId: 'fast',
            routeId: 'wf-route:fast',
            label: 'Fast route',
          },
          {
            optionId: 'safe',
            routeId: 'wf-route:safe',
            label: 'Safe route',
          },
        ],
        recommendedRouteId: 'wf-route:fast',
      },
    };
    const task = makeWaitingTask('task_route_selection_history_1', decision, {
      waitingFor: 'route selection',
    });
    const runtime = createMockRuntime([task]);

    const result = submitMissionDecision(runtime, 'task_route_selection_history_1', {
      optionId: 'safe',
      freeText: 'Need lower risk due to budget approval delay',
      submittedBy: 'operator-route',
      metadata: {
        nodeType: 'selection',
        nodeId: 'node-route-selection-1',
        sessionId: 'session-route-selection-1',
        interactionId: 'interaction-route-selection-1',
        branchKey: 'branch-route-selection-1',
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision).toMatchObject({
        optionId: 'safe',
        optionLabel: 'Safe route',
        freeText: 'Need lower risk due to budget approval delay',
        metadata: {
          nodeType: 'selection',
          nodeId: 'node-route-selection-1',
          sessionId: 'session-route-selection-1',
          interactionId: 'interaction-route-selection-1',
          branchKey: 'branch-route-selection-1',
          formData: {
            selectedRouteOptionId: 'safe',
            selectedRouteLabel: 'Safe route',
            selectedRouteId: 'wf-route:safe',
            recommendedRouteId: 'wf-route:fast',
            replanRequested: true,
            changedReason: 'Need lower risk due to budget approval delay',
          },
        },
      });

      expect(result.task.decisionHistory?.at(-1)).toMatchObject({
        decisionId: 'dec_route_selection_history_1',
        type: 'multi-choice',
        submittedBy: 'operator-route',
        nodeType: 'selection',
        nodeId: 'node-route-selection-1',
        sessionId: 'session-route-selection-1',
        interactionId: 'interaction-route-selection-1',
        branchKey: 'branch-route-selection-1',
        reason: 'Need lower risk due to budget approval delay',
        resolved: {
          optionId: 'safe',
          optionLabel: 'Safe route',
          freeText: 'Need lower risk due to budget approval delay',
          metadata: {
            formData: {
              selectedRouteOptionId: 'safe',
              selectedRouteLabel: 'Safe route',
              selectedRouteId: 'wf-route:safe',
              recommendedRouteId: 'wf-route:fast',
              replanRequested: true,
              changedReason: 'Need lower risk due to budget approval delay',
            },
          },
        },
      });
      expect(result.task.decisionHistory?.at(-1)?.resolved.metadata?.formData).toMatchObject({
        selectedRouteId: 'wf-route:safe',
        recommendedRouteId: 'wf-route:fast',
        replanRequested: true,
        changedReason: 'Need lower risk due to budget approval delay',
      });
    }
  });

  it('normalizes param_collection attachment fields in resolved decision metadata', () => {
    const decision: MissionDecision = {
      prompt: 'Collect attachments',
      options: [{ id: 'submit', label: 'Submit' }],
      type: 'custom-action',
      decisionId: 'dec_param_attachment_1',
      payload: {
        nodeType: 'param_collection',
        fieldDefinitions: [
          {
            key: 'attachment',
            label: '附件',
            type: 'attachment',
            required: true,
          },
          {
            key: 'title',
            label: '标题',
            type: 'text',
            required: true,
          },
        ],
      },
    };
    const task = makeWaitingTask('task_param_attachment_1', decision);
    const runtime = createMockRuntime([task]);

    const result = submitMissionDecision(runtime, 'task_param_attachment_1', {
      optionId: 'submit',
      metadata: {
        nodeType: 'param_collection',
        formData: {
          title: '附件收集',
          attachment: {
            kind: 'attachment',
            ref: 'artifact-1',
            name: 'spec.pdf',
            source: 'manual',
          },
        },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.metadata?.formData).toEqual({
        title: '附件收集',
        attachment: {
          kind: 'attachment',
          ref: 'artifact-1',
          name: 'spec.pdf',
          source: 'manual',
        },
      });
      expect(result.task.decisionHistory?.at(-1)?.resolved.metadata?.formData).toEqual({
        title: '附件收集',
        attachment: {
          kind: 'attachment',
          ref: 'artifact-1',
          name: 'spec.pdf',
          source: 'manual',
        },
      });
    }
  });

  it('accepts attachment references in param_collection formData', () => {
    const decision: MissionDecision = {
      prompt: 'Collect attachments',
      options: [{ id: 'submit', label: 'Submit' }],
      type: 'custom-action',
      decisionId: 'dec_param_attachment_ref_1',
      payload: {
        nodeType: 'param_collection',
        fieldDefinitions: [
          {
            key: 'attachment',
            label: '附件',
            type: 'attachment',
            required: true,
          },
        ],
      },
    };
    const task = makeWaitingTask('task_param_attachment_ref_1', decision);
    const runtime = createMockRuntime([task]);

    const result = submitMissionDecision(runtime, 'task_param_attachment_ref_1', {
      optionId: 'submit',
      metadata: {
        nodeType: 'param_collection',
        formData: {
          attachment: 'artifact-ref-9',
        },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.metadata?.formData).toEqual({
        attachment: {
          kind: 'attachment',
          ref: 'artifact-ref-9',
        },
      });
    }
  });
});

describe('submitMissionDecision — multi-step decision chain', () => {
  it('when orchestrator puts task back into waiting, task enters waiting again with new decision', async () => {
    // Use MissionRuntime + MissionStore to simulate the multi-step chain.
    // Note: Both MissionStore.resolveWaiting and submitMissionDecision append
    // to decisionHistory, so each decision produces 2 history entries when
    // going through the real runtime. We verify the chain behavior here.
    const store = new MissionStore();
    const missionRuntime = new MissionRuntime({ store, autoRecover: false });

    const task = missionRuntime.createChatTask('Multi-step test');
    missionRuntime.markMissionRunning(task.id, 'execute', 'Running', 50);
    missionRuntime.waitOnMission(task.id, 'first decision', 'Choose path', 50, {
      prompt: 'Choose path',
      options: [
        { id: 'path-a', label: 'Path A' },
        { id: 'path-b', label: 'Path B' },
      ],
    });

    // Submit first decision — task should resume to running
    const result = submitMissionDecision(missionRuntime, task.id, { optionId: 'path-a' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.task.status).toBe('running');
      // decisionHistory should have entries (from resolveWaiting + submitMissionDecision)
      expect(result.task.decisionHistory!.length).toBeGreaterThanOrEqual(1);
    }

    // Simulate orchestrator putting task back into waiting (nextDecision)
    missionRuntime.waitOnMission(task.id, 'confirm path A', 'Confirm?', 55, {
      prompt: 'Confirm path A?',
      options: [
        { id: 'confirm', label: 'Confirm' },
        { id: 'cancel', label: 'Cancel' },
      ],
    });

    const afterWait = missionRuntime.getTask(task.id);
    expect(afterWait?.status).toBe('waiting');
    expect(afterWait?.decision?.prompt).toBe('Confirm path A?');

    // Submit second decision
    const result2 = submitMissionDecision(missionRuntime, task.id, { optionId: 'confirm' });
    expect(result2.ok).toBe(true);
    if (result2.ok) {
      expect(result2.task.status).toBe('running');
      // History should have grown from both decisions
      const historyLen = result2.task.decisionHistory!.length;
      expect(historyLen).toBeGreaterThanOrEqual(2);
    }
  });
});

/* ─── API Endpoint Tests ─── */

async function startServer(runtime: MissionRuntime) {
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', createTaskRouter(runtime));
  app.use('/api/decision-templates', createDecisionTemplatesRouter());

  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

function createAuditTestCollector() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const chain = new AuditChain({
    privateKey: privateKey.export({ type: 'sec1', format: 'pem' }) as string,
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  });
  const collector = new AuditCollector(chain, new TimestampProvider());
  return { chain, collector };
}

describe('API endpoints', () => {
  let runtime: MissionRuntime;
  let server: ReturnType<express.Express['listen']> | null = null;
  let baseUrl = '';
  let auditCollector: AuditCollector | null = null;
  let auditChain: AuditChain | null = null;

  beforeEach(async () => {
    runtime = new MissionRuntime({
      store: new MissionStore(),
      autoRecover: false,
    });
    const started = await startServer(runtime);
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) { resolve(); return; }
      server.close(err => err ? reject(err) : resolve());
    });
    auditCollector?.destroy();
    auditCollector = null;
    auditChain = null;
    server = null;
  });

  it('GET /api/tasks/:id/decisions returns decision history', async () => {
    const task = runtime.createChatTask('Decision history test');
    runtime.markMissionRunning(task.id, 'execute', 'Running', 50);
    runtime.waitOnMission(task.id, 'approval', 'Approve?', 50, {
      prompt: 'Approve?',
      options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
      decisionId: 'dec_api_1',
    });

    // Submit a decision
    await fetch(`${baseUrl}/api/tasks/${task.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ optionId: 'yes' }),
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/decisions`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.missionId).toBe(task.id);
    expect(body.decisions).toBeInstanceOf(Array);
    expect(body.decisions.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/decision-templates returns built-in templates', async () => {
    const response = await fetch(`${baseUrl}/api/decision-templates`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.templates).toBeInstanceOf(Array);
    expect(body.templates.length).toBe(BUILTIN_DECISION_TEMPLATES.length);
    expect(body.templates.map((t: { templateId: string }) => t.templateId)).toContain(
      'execution-plan-approval'
    );
    expect(body.templates.map((t: { templateId: string }) => t.templateId)).toContain(
      'stage-gate'
    );
    expect(body.templates.map((t: { templateId: string }) => t.templateId)).toContain(
      'risk-confirmation'
    );

    const approvalTemplate = body.templates.find(
      (template: { templateId: string }) =>
        template.templateId === 'execution-plan-approval'
    );
    expect(approvalTemplate).toBeDefined();
    expect(
      approvalTemplate.defaultOptions.map(
        (option: { id: string; label: string }) => option.id
      )
    ).toContain('modify');
    expect(
      approvalTemplate.defaultOptions.map(
        (option: { id: string; label: string }) => option.label
      )
    ).toContain('Modify');
  });

  it('POST /api/tasks/:id/decision keeps web-aigc metadata on task history', async () => {
    const task = runtime.createChatTask('HITL selection metadata test');
    runtime.markMissionRunning(task.id, 'execute', 'Running', 50);
    runtime.waitOnMission(task.id, 'selection', 'Choose a branch', 50, {
      prompt: 'Choose a branch',
      options: [
        { id: 'branch-a', label: 'Branch A' },
        { id: 'branch-b', label: 'Branch B' },
      ],
      type: 'custom-action',
      decisionId: 'dec_api_hitl_1',
      payload: {
        nodeType: 'selection',
        nodeId: 'node-selection-api-1',
        sessionId: 'session-api-1',
        interactionId: 'interaction-api-1',
      },
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        optionId: 'branch-a',
        metadata: {
          nodeType: 'selection',
          nodeId: 'node-selection-api-1',
          sessionId: 'session-api-1',
          interactionId: 'interaction-api-1',
          branchKey: 'branch-a',
        },
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.decision.metadata.nodeId).toBe('node-selection-api-1');
    expect(body.decision.metadata.sessionId).toBe('session-api-1');
    expect(body.decision.metadata.interactionId).toBe('interaction-api-1');
    expect(body.task.decisionHistory).toBeInstanceOf(Array);
    expect(body.task.decisionHistory.at(-1).nodeId).toBe('node-selection-api-1');
    expect(body.task.decisionHistory.at(-1).nodeType).toBe('selection');
    expect(body.task.decisionHistory.at(-1).sessionId).toBe('session-api-1');
    expect(body.task.decisionHistory.at(-1).interactionId).toBe('interaction-api-1');
    expect(body.task.decisionHistory.at(-1).branchKey).toBe('branch-a');
  });

  it('POST /api/tasks/:id/decision returns alreadyResolved for duplicate submits after resume', async () => {
    const task = runtime.createChatTask('Idempotent resume api test');
    runtime.markMissionRunning(task.id, 'execute', 'Running', 50);
    runtime.waitOnMission(task.id, 'approval', 'Approve the recovery plan', 50, {
      prompt: 'Approve the recovery plan?',
      options: [
        { id: 'approve', label: 'Approve' },
        { id: 'revise', label: 'Revise' },
      ],
      decisionId: 'dec_api_idempotent_resume_1',
    });

    const firstResponse = await fetch(`${baseUrl}/api/tasks/${task.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        optionId: 'approve',
        submittedBy: 'operator-api-idempotent',
      }),
    });
    const firstBody = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstBody.ok).toBe(true);
    expect(firstBody.alreadyResolved).toBe(false);
    expect(firstBody.task.status).toBe('running');
    expect(firstBody.task.decisionHistory).toHaveLength(1);

    const secondResponse = await fetch(`${baseUrl}/api/tasks/${task.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        optionId: 'approve',
        submittedBy: 'operator-api-idempotent',
      }),
    });
    const secondBody = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(secondBody.ok).toBe(true);
    expect(secondBody.alreadyResolved).toBe(true);
    expect(secondBody.detail).toContain('already processed');
    expect(secondBody.task.status).toBe('running');
    expect(secondBody.task.decisionHistory).toHaveLength(1);
    expect(secondBody.task.decisionHistory.at(-1)).toMatchObject({
      decisionId: 'dec_api_idempotent_resume_1',
      submittedBy: 'operator-api-idempotent',
      resolved: {
        optionId: 'approve',
        optionLabel: 'Approve',
      },
    });
  });

  it('POST /api/tasks/:id/decision accepts request-info free-text clarification when allowFreeText is enabled', async () => {
    const task = runtime.createChatTask('Free-text clarification test');
    runtime.markMissionRunning(task.id, 'execute', 'Running', 50);
    runtime.waitOnMission(task.id, 'clarify scope', 'Need more detail', 50, {
      prompt: 'Please clarify the delivery scope',
      type: 'request-info',
      allowFreeText: true,
      placeholder: 'Describe the missing detail',
      options: [{ id: 'submit', label: 'Submit clarification' }],
      decisionId: 'dec_request_info_api_1',
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        freeText: 'Please focus on the CN launch plan and exclude the global rollout.',
        submittedBy: 'operator-clarify',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.decision.freeText).toBe(
      'Please focus on the CN launch plan and exclude the global rollout.',
    );
    expect(body.decision.optionId).toBeUndefined();
    expect(body.decision.optionLabel).toBeUndefined();
    expect(body.task.status).toBe('running');
    expect(body.task.decisionHistory).toBeInstanceOf(Array);
    expect(body.task.decisionHistory.at(-1)).toMatchObject({
      decisionId: 'dec_request_info_api_1',
      type: 'request-info',
      submittedBy: 'operator-clarify',
      reason: 'Please focus on the CN launch plan and exclude the global rollout.',
      resolved: {
        freeText: 'Please focus on the CN launch plan and exclude the global rollout.',
      },
    });
    expect(body.task.decisionHistory.at(-1).resolved.optionId).toBeUndefined();
  });

  it('POST /api/tasks/:id/decision accepts request-info clarification bound to a comment option', async () => {
    const task = runtime.createChatTask('Comment-bound clarification test');
    runtime.markMissionRunning(task.id, 'execute', 'Running', 50);
    runtime.waitOnMission(task.id, 'clarify scope', 'Need more detail', 50, {
      prompt: 'Please clarify the delivery scope',
      type: 'request-info',
      allowFreeText: false,
      options: [
        { id: 'skip', label: 'Skip for now' },
        {
          id: 'request-details',
          label: 'Request details',
          requiresComment: true,
        },
      ],
      decisionId: 'dec_request_info_api_comment_1',
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        optionId: 'request-details',
        freeText: 'Only the CN launch plan is in scope; defer the global rollout.',
        submittedBy: 'operator-clarify',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.decision).toMatchObject({
      optionId: 'request-details',
      optionLabel: 'Request details',
      freeText: 'Only the CN launch plan is in scope; defer the global rollout.',
    });
    expect(body.task.status).toBe('running');
    expect(body.task.decisionHistory.at(-1)).toMatchObject({
      decisionId: 'dec_request_info_api_comment_1',
      type: 'request-info',
      submittedBy: 'operator-clarify',
      reason: 'Only the CN launch plan is in scope; defer the global rollout.',
      resolved: {
        optionId: 'request-details',
        optionLabel: 'Request details',
        freeText: 'Only the CN launch plan is in scope; defer the global rollout.',
      },
    });
  });

  it('POST /api/tasks/:id/decision persists submittedBy to decision history', async () => {
    const task = runtime.createChatTask('Submitted by propagation test');
    runtime.markMissionRunning(task.id, 'execute', 'Running', 50);
    runtime.waitOnMission(task.id, 'approval', 'Approve?', 50, {
      prompt: 'Approve?',
      options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
      decisionId: 'dec_api_submitter_1',
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        optionId: 'yes',
        submittedBy: 'operator-bob',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.task.decisionHistory).toBeInstanceOf(Array);
    expect(body.task.decisionHistory.at(-1).submittedBy).toBe('operator-bob');
  });

  it('POST /api/tasks/:id/decision records audit decision_submitted entry', async () => {
    const audit = createAuditTestCollector();
    auditChain = audit.chain;
    auditCollector = audit.collector;
    installAuditHooks({ collector: auditCollector });

    const task = runtime.createTask({
      kind: 'chat',
      title: 'Audit decision submission test',
      projection: {
        workflowId: 'wf-audit-hitl',
        instanceId: 'instance-audit-hitl',
        replayId: 'replay-audit-hitl',
      },
      stageLabels: [{ key: 'execute', label: 'Execute' }],
    });
    runtime.markMissionRunning(task.id, 'execute', 'Running', 50);
    runtime.waitOnMission(task.id, 'selection', 'Choose a branch', 50, {
      prompt: 'Choose a branch',
      options: [
        { id: 'branch-a', label: 'Branch A' },
        { id: 'branch-b', label: 'Branch B' },
      ],
      decisionId: 'dec_audit_hitl_1',
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        optionId: 'branch-a',
        submittedBy: 'operator-audit',
        metadata: {
          nodeType: 'selection',
          nodeId: 'node-selection-1',
          sessionId: 'session-audit-1',
          interactionId: 'interaction-audit-1',
          branchKey: 'branch-a',
        },
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(auditChain).not.toBeNull();

    const count = auditChain!.getEntryCount();
    expect(count).toBeGreaterThan(0);
    const entries = auditChain!.getEntries(0, count - 1);
    const decisionEntry = entries.find(
      entry =>
        entry.event.eventType === AuditEventType.DECISION_MADE &&
        entry.event.metadata?.eventKey === 'human.decision_submitted',
    );

    expect(decisionEntry).toBeDefined();
    expect(decisionEntry?.event.actor).toMatchObject({
      type: 'user',
      id: 'operator-audit',
    });
    expect(decisionEntry?.event.resource).toMatchObject({
      type: 'mission',
      id: task.id,
      name: 'node-selection-1',
    });
    expect(decisionEntry?.event.context).toMatchObject({
      sessionId: 'session-audit-1',
    });
    expect(decisionEntry?.event.metadata).toMatchObject({
      eventKey: 'human.decision_submitted',
      workflowId: 'wf-audit-hitl',
      instanceId: 'instance-audit-hitl',
      missionId: task.id,
      decisionId: 'dec_audit_hitl_1',
      nodeId: 'node-selection-1',
      nodeType: 'selection',
      submittedBy: 'operator-audit',
      optionId: 'branch-a',
      optionLabel: 'Branch A',
      interactionId: 'interaction-audit-1',
      branchKey: 'branch-a',
    });
  });

  it('POST /api/tasks/:id/decision records param_collection audit summary when formData is submitted', async () => {
    const audit = createAuditTestCollector();
    auditChain = audit.chain;
    auditCollector = audit.collector;
    installAuditHooks({ collector: auditCollector });

    const task = runtime.createTask({
      kind: 'chat',
      title: 'Param collection audit test',
      projection: {
        workflowId: 'wf-audit-param',
        instanceId: 'instance-audit-param',
        replayId: 'replay-audit-param',
      },
      stageLabels: [{ key: 'execute', label: 'Execute' }],
    });
    runtime.markMissionRunning(task.id, 'execute', 'Running', 50);
    runtime.waitOnMission(task.id, 'collect params', 'Collect structured params', 50, {
      prompt: 'Collect parameters',
      options: [{ id: 'submit', label: 'Submit' }],
      decisionId: 'dec_param_collection_1',
      type: 'custom-action',
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        optionId: 'submit',
        submittedBy: 'operator-param',
        metadata: {
          nodeType: 'param_collection',
          nodeId: 'node-param-1',
          sessionId: 'session-param-1',
          interactionId: 'interaction-param-1',
          formData: {
            region: 'cn',
            priority: 3,
            approved: true,
          },
        },
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(auditChain).not.toBeNull();

    const count = auditChain!.getEntryCount();
    expect(count).toBeGreaterThan(0);
    const entries = auditChain!.getEntries(0, count - 1);
    const paramEntry = entries.find(
      entry =>
        entry.event.eventType === AuditEventType.DECISION_MADE &&
        entry.event.metadata?.eventKey === 'human.param_collection_submitted',
    );

    expect(paramEntry).toBeDefined();
    expect(paramEntry?.event.actor).toMatchObject({
      type: 'user',
      id: 'operator-param',
    });
    expect(paramEntry?.event.resource).toMatchObject({
      type: 'mission',
      id: task.id,
      name: 'node-param-1',
    });
    expect(paramEntry?.event.metadata).toMatchObject({
      eventKey: 'human.param_collection_submitted',
      workflowId: 'wf-audit-param',
      instanceId: 'instance-audit-param',
      missionId: task.id,
      decisionId: 'dec_param_collection_1',
      nodeId: 'node-param-1',
      nodeType: 'param_collection',
      submittedBy: 'operator-param',
      fieldCount: 3,
      formFieldKeys: ['approved', 'priority', 'region'],
      hasInteractionId: true,
    });
    expect(body.decision.metadata.nodeId).toBe('node-param-1');
    expect(body.task.decisionHistory.at(-1).nodeId).toBe('node-param-1');
    expect(body.task.decisionHistory.at(-1).nodeType).toBe('param_collection');
    expect(body.task.decisionHistory.at(-1).sessionId).toBe('session-param-1');
    expect(body.task.decisionHistory.at(-1).interactionId).toBe('interaction-param-1');
  });

  it('POST /api/tasks/:id/decision accepts param_collection attachment metadata objects', async () => {
    const task = runtime.createChatTask('Param attachment api test');
    runtime.markMissionRunning(task.id, 'execute', 'Running', 50);
    runtime.waitOnMission(task.id, 'collect params', 'Collect attachment params', 50, {
      prompt: 'Collect attachment params',
      options: [{ id: 'submit', label: 'Submit' }],
      decisionId: 'dec_param_attachment_api_1',
      type: 'custom-action',
      payload: {
        nodeType: 'param_collection',
        fieldDefinitions: [
          {
            key: 'attachment',
            label: '附件',
            type: 'attachment',
            required: true,
          },
          {
            key: 'title',
            label: '标题',
            type: 'text',
            required: true,
          },
        ],
      },
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        optionId: 'submit',
        metadata: {
          nodeType: 'param_collection',
          formData: {
            title: '附件任务',
            attachment: {
              kind: 'attachment',
              ref: 'artifact-api-1',
              name: 'brief.docx',
              source: 'manual',
            },
          },
        },
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.decision.metadata.formData).toEqual({
      title: '附件任务',
      attachment: {
        kind: 'attachment',
        ref: 'artifact-api-1',
        name: 'brief.docx',
        source: 'manual',
      },
    });
  });

  it('POST /api/tasks/:id/decision accepts request-info param_collection submissions and persists history metadata', async () => {
    const task = runtime.createChatTask('Request-info param collection api test');
    runtime.markMissionRunning(task.id, 'execute', 'Running', 50);
    runtime.waitOnMission(task.id, 'clarify inputs', 'Need structured parameters', 50, {
      prompt: 'Please provide the missing launch parameters',
      options: [{ id: 'submit', label: 'Submit parameters' }],
      decisionId: 'dec_request_info_param_api_1',
      type: 'request-info',
      payload: {
        nodeType: 'param_collection',
        nodeId: 'node-request-param-1',
        sessionId: 'session-request-param-1',
        interactionId: 'interaction-request-param-1',
        branchKey: 'branch-request-param-1',
        fieldDefinitions: [
          {
            key: 'region',
            label: 'Region',
            type: 'selection',
            required: true,
            options: [
              { value: 'cn', label: 'CN' },
              { value: 'global', label: 'Global' },
            ],
          },
          {
            key: 'priority',
            label: 'Priority',
            type: 'number',
            required: true,
          },
          {
            key: 'attachment',
            label: 'Attachment',
            type: 'attachment',
          },
        ],
      },
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        optionId: 'submit',
        submittedBy: 'operator-param-request',
        metadata: {
          nodeType: 'param_collection',
          nodeId: 'node-request-param-1',
          sessionId: 'session-request-param-1',
          interactionId: 'interaction-request-param-1',
          branchKey: 'branch-request-param-1',
          formData: {
            region: 'cn',
            priority: '4',
            attachment: 'artifact-request-param-1',
          },
        },
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.task.status).toBe('running');
    expect(body.decision).toMatchObject({
      optionId: 'submit',
      optionLabel: 'Submit parameters',
      metadata: {
        nodeType: 'param_collection',
        nodeId: 'node-request-param-1',
        sessionId: 'session-request-param-1',
        interactionId: 'interaction-request-param-1',
        branchKey: 'branch-request-param-1',
        formData: {
          region: 'cn',
          priority: 4,
          attachment: {
            kind: 'attachment',
            ref: 'artifact-request-param-1',
          },
        },
      },
    });
    expect(body.task.decisionHistory.at(-1)).toMatchObject({
      decisionId: 'dec_request_info_param_api_1',
      type: 'request-info',
      submittedBy: 'operator-param-request',
      nodeId: 'node-request-param-1',
      sessionId: 'session-request-param-1',
      nodeType: 'param_collection',
      interactionId: 'interaction-request-param-1',
      branchKey: 'branch-request-param-1',
      resolved: {
        optionId: 'submit',
        optionLabel: 'Submit parameters',
        metadata: {
          formData: {
            region: 'cn',
            priority: 4,
            attachment: {
              kind: 'attachment',
              ref: 'artifact-request-param-1',
            },
          },
        },
      },
    });
  });

  it('POST /api/tasks/:id/decision rejects timed out waiting input', async () => {
    const task = runtime.createChatTask('Timed waiting decision test');
    runtime.markMissionRunning(task.id, 'execute', 'Running', 50);
    runtime.waitOnMission(task.id, 'user input', 'Need details', 50, {
      prompt: 'Provide missing details',
      options: [{ id: 'submit', label: 'Submit' }],
      timeoutAt: Date.now() - 1_000,
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        optionId: 'submit',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('timed out');
    expect(runtime.getTask(task.id)?.status).toBe('waiting');
  });
});
