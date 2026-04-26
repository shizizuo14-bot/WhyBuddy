import type { AddressInfo } from 'node:net';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTaskRouter } from '../routes/tasks.js';
import db from '../db/index.js';
import { MissionRuntime } from '../tasks/mission-runtime.js';
import { MissionStore } from '../tasks/mission-store.js';

async function startServer(
  runtime: MissionRuntime,
  fetchImpl?: typeof fetch,
) {
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', createTaskRouter(runtime, { fetchImpl }));

  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const { port } = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

describe('tasks routes', () => {
  let runtime: MissionRuntime;
  let server: ReturnType<express.Express['listen']> | null = null;
  let baseUrl = '';

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
      if (!server) {
        resolve();
        return;
      }

      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    server = null;
  });

  it('returns recent tasks from GET /api/tasks', async () => {
    const task = runtime.createTask({
      kind: 'chat',
      title: 'Summarize relay state',
      sourceText: 'Need a stable summary',
      stageLabels: [
        { key: 'receive', label: 'Receive task' },
        { key: 'understand', label: 'Understand problem' },
      ],
    });
    runtime.markMissionRunning(
      task.id,
      'understand',
      'Scanning current state',
      42
    );

    const response = await fetch(`${baseUrl}/api/tasks?limit=10`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      tasks: [
        {
          id: task.id,
          title: 'Summarize relay state',
          status: 'running',
          progress: 42,
        },
      ],
    });
  });

  it('creates a mission from POST /api/tasks with the fixed mission stages', async () => {
    const response = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        kind: 'chat',
        sourceText: 'Help me plan a relay rollout across Feishu and Cube.',
        topicId: 'thread_123',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.task).toMatchObject({
      kind: 'chat',
      topicId: 'thread_123',
      stages: [
        { key: 'receive', label: 'Receive task', status: 'pending' },
        { key: 'understand', label: 'Understand request', status: 'pending' },
        { key: 'plan', label: 'Build execution plan', status: 'pending' },
        { key: 'provision', label: 'Provision execution runtime', status: 'pending' },
        { key: 'execute', label: 'Run execution', status: 'pending' },
        { key: 'finalize', label: 'Finalize mission', status: 'pending' },
      ],
    });
  });

  it('auto-dispatches nl-command missions when requested at creation time', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      expect(url).toContain('/api/executor/jobs');
      expect(init?.method).toBe('POST');

      return new Response(
        JSON.stringify({
          ok: true,
          accepted: true,
          missionId: 'ignored-by-route',
          jobId: 'job_auto_dispatch',
          receivedAt: new Date().toISOString(),
          status: 'queued',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    });

    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }

      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    const started = await startServer(runtime, fetchImpl as unknown as typeof fetch);
    server = started.server;
    baseUrl = started.baseUrl;

    const response = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        kind: 'nl-command',
        title: 'Write a Fibonacci script',
        sourceText: 'Write a Python script that prints the first 20 Fibonacci numbers.',
        autoDispatch: true,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(body).toMatchObject({
      ok: true,
      dispatchAccepted: true,
      task: {
        kind: 'nl-command',
        status: 'running',
        currentStageKey: 'execute',
        executor: {
          jobId: 'job_auto_dispatch',
          status: 'queued',
        },
      },
    });
  });

  it('returns a task detail from GET /api/tasks/:id', async () => {
    const task = runtime.createTask({
      kind: 'chat',
      title: 'Inspect task detail route',
      stageLabels: [{ key: 'receive', label: 'Receive task' }],
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      task: {
        id: task.id,
        title: 'Inspect task detail route',
        status: 'queued',
      },
    });
  });

  it('returns mission projection view from GET /api/tasks/:id/projection', async () => {
    const task = runtime.createTask({
      kind: 'chat',
      title: 'Projection detail route',
      sourceText: 'Project workflow into mission route',
      topicId: 'session-route',
      projection: {
        workflowId: 'wf-route',
        instanceId: 'wf-route',
        replayId: 'replay-route-detail',
        sessionId: 'session-route',
        sourceApp: 'web-aigc',
      },
      stageLabels: [{ key: 'receive', label: 'Receive task' }],
    });
    db.createWorkflow('wf-route', 'Project workflow into mission route', []);
    db.updateWorkflow('wf-route', {
      status: 'running',
      current_stage: 'plan',
      started_at: '2026-04-24T09:00:00.000Z',
      results: {
        input: {
          sourceApp: 'web-aigc',
          sessionId: 'session-route',
        },
      },
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/projection`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      missionId: task.id,
      projection: {
        missionId: task.id,
        links: {
          workflowId: 'wf-route',
          instanceId: 'wf-route',
          replayId: 'replay-route-detail',
          sessionId: 'session-route',
          sourceApp: 'web-aigc',
        },
        autopilotSummary: {
          version: 'server-autopilot-projection/v1',
          source: 'mission-projection',
          destination: {
            id: task.id,
            goal: 'Projection detail route',
            request: 'Project workflow into mission route',
            constraints: ['Mission kind: chat', 'Source app: web-aigc'],
            successCriteria: ['Mission completes its current route'],
            deliverables: ['Mission result package'],
            missingInfo: [],
          },
          route: {
            id: 'wf-route',
            mode: 'fast',
            status: 'pending',
            progress: 0,
            currentStageKey: null,
            takeoverPointIds: [],
            candidateRoutes: expect.any(Array),
          },
          driveState: {
            state: 'understanding',
            blocked: false,
            waitingForUser: false,
            riskLevel: 'unknown',
          },
          takeover: {
            required: false,
            blocking: false,
          },
          execution: {
            currentStepStatus: 'pending',
          },
          recovery: {
            state: 'healthy',
          },
          evidence: {
            trustLevel: 'partial',
            correlation: {
              missionId: task.id,
              workflowId: 'wf-route',
              replayId: 'replay-route-detail',
              sessionId: 'session-route',
              timelineId: `${task.id}:timeline`,
            },
          },
          explanation: {
            telemetrySignals: expect.arrayContaining([
              'mission.status:queued',
            ]),
          },
          bindings: {
            missionId: task.id,
            workflowId: 'wf-route',
            executorJobId: null,
            instanceId: 'wf-route',
          },
        },
        orchestration: {
          status: 'queued',
          currentStageKey: null,
          currentStageLabel: null,
          blockingReason: null,
          bindings: {
            missionId: task.id,
            workflowId: 'wf-route',
            instanceId: 'wf-route',
            decisionId: null,
            executorJobId: null,
          },
          controlActions: {
            available: ['pause', 'mark-blocked', 'terminate'],
            lastAction: null,
          },
          wait: {
            active: false,
            reason: null,
            decisionId: null,
            timeoutAt: null,
          },
          replan: {
            required: false,
            active: false,
            attempt: 1,
            reason: null,
            triggerAction: null,
            updatedAt: null,
          },
        },
      },
    });
    expect(body.projection.autopilotSummary.route.candidateRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'wf-route:fast',
          mode: 'fast',
          selected: true,
          recommended: true,
        }),
        expect.objectContaining({
          id: 'wf-route:standard',
          mode: 'standard',
          selected: false,
        }),
      ]),
    );
    expect(body.projection.autopilotSummary.execution.availableActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'run',
          scope: 'stage',
          enabled: true,
          reason: 'Continue the current mission stage.',
        }),
        expect.objectContaining({
          type: 'replan',
          scope: 'route',
          enabled: true,
          reason: 'Adapt the active route before more work is dispatched.',
        }),
      ]),
    );
    expect(body.projection.autopilotSummary.destination.constraints).toEqual(
      expect.arrayContaining([
        'Mission kind: chat',
        'Source app: web-aigc',
      ]),
    );
    expect(body.projection.autopilotSummary.destination.successCriteria).toEqual([
      'Mission completes its current route',
    ]);
    expect(body.projection.autopilotSummary.destination.deliverables).toEqual([
      'Mission result package',
    ]);
    expect(body.projection.autopilotSummary.destination.missingInfo).toEqual([]);
    expect(body.projection.autopilotSummary.recovery).toMatchObject({
      state: 'healthy',
      deviationCategory: 'none',
      suggestedActions: ['retry', 'replan'],
      canAutoRecover: true,
    });
    expect(body.projection.autopilotSummary.evidence).toMatchObject({
      eventCount: 1,
      artifactCount: 0,
      trustLevel: 'partial',
      correlation: {
        missionId: task.id,
        workflowId: 'wf-route',
        replayId: 'replay-route-detail',
        sessionId: 'session-route',
        timelineId: `${task.id}:timeline`,
        routeIds: ['wf-route:fast', 'wf-route:standard', 'wf-route:deep'],
        decisionIds: [],
        operatorActionIds: [],
        auditEventIds: [],
        lineageIds: [],
      },
      gaps: expect.arrayContaining([
        'No artifacts captured yet',
      ]),
    });
    expect(body.projection.autopilotSummary.evidence.correlation.routeStageKeys).toEqual([
      'receive',
    ]);
    expect(body.projection.autopilotSummary.evidence.correlation.runtimeEventIds).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${task.id}:event:`),
      ]),
    );
    expect(body.projection.autopilotSummary.route.evidence).toMatchObject({
      lastEventType: 'route.selected',
      lastEventAt: expect.any(String),
      events: expect.arrayContaining([
        expect.objectContaining({
          eventType: 'route.recommended',
          actor: 'planner',
          toRouteId: 'wf-route:fast',
        }),
        expect.objectContaining({
          eventType: 'route.selected',
          actor: 'planner',
          toRouteId: 'wf-route:fast',
        }),
      ]),
    });
    expect(body.projection.autopilotSummary.explanation).toMatchObject({
      current: 'Mission created: Projection detail route',
      currentState: {
        summary: 'Mission created: Projection detail route',
        driveState: 'understanding',
        missionStatus: 'queued',
        currentStageKey: null,
        currentStageLabel: null,
        workflowStatus: 'running',
        workflowStage: 'plan',
        sources: expect.arrayContaining([
          'mission-runtime',
          'workflow-runtime',
        ]),
      },
      recommendationReasons: expect.arrayContaining([
        'Derived from mission intent, current risk, and runtime readiness.',
      ]),
      recommendationDetails: [
        expect.objectContaining({
          kind: 'route',
          source: 'route-planner',
          routeId: 'wf-route:fast',
          summary: 'Derived from mission intent, current risk, and runtime readiness.',
        }),
      ],
      remainingSteps: {
        currentStepKey: null,
        currentStepLabel: null,
        parallelBranchCount: 0,
        replanChangeSummary: null,
        pendingSteps: expect.arrayContaining([
          expect.objectContaining({
            key: 'receive',
            label: 'Receive task',
            status: 'pending',
            isCurrent: false,
          }),
        ]),
      },
      evidenceHints: expect.arrayContaining([
        'No artifacts captured yet',
      ]),
      telemetrySignals: expect.arrayContaining([
        'mission.status:queued',
        'drive.state:understanding',
        'recovery.state:healthy',
      ]),
    });
    expect(body.projection.graph).toMatchObject({
      instanceId: 'wf-route',
      workflowId: 'wf-route',
      missionId: task.id,
      sessionId: 'session-route',
      links: {
        workflowId: 'wf-route',
        missionId: task.id,
        sessionId: 'session-route',
        replayId: 'replay-route-detail',
      },
    });
    expect(body.projection.workflow).toMatchObject({
      id: 'wf-route',
      sessionId: 'session-route',
      sourceApp: 'web-aigc',
    });
    expect(body.projection.session).toMatchObject({
      sessionId: 'session-route',
    });
  });

  it('projects waiting decisions as autopilot takeover summary', async () => {
    const task = runtime.createTask({
      kind: 'chat',
      title: 'Projection takeover route',
      sourceText: 'Decide which route should continue',
      topicId: 'session-takeover',
      projection: {
        sessionId: 'session-takeover',
      },
      stageLabels: [
        { key: 'receive', label: 'Receive task' },
        { key: 'plan', label: 'Build execution plan' },
      ],
    });
    runtime.markMissionRunning(task.id, 'plan', 'Preparing route options', 34);
    runtime.waitOnMission(task.id, 'route selection', 'Need route selection', 48, {
      decisionId: 'decision-route-choice',
      type: 'multi-choice',
      prompt: 'Choose the route to continue',
      options: [
        { id: 'fast', label: 'Fast route' },
        { id: 'safe', label: 'Safe route', description: 'Prefer lower risk' },
      ],
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/projection`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projection).toMatchObject({
      autopilotSummary: {
        destination: {
          id: task.id,
          goal: 'Projection takeover route',
          request: 'Decide which route should continue',
          constraints: ['Mission kind: chat'],
          successCriteria: ['Mission completes its current route'],
          deliverables: ['Mission result package'],
          missingInfo: ['route selection'],
        },
        route: {
          mode: 'fast',
          currentStageKey: 'plan',
          currentStageLabel: 'Build execution plan',
          takeoverPointIds: ['decision-route-choice'],
          selectedRouteId: expect.stringContaining(':fast'),
        },
        driveState: {
          state: 'takeover-required',
          waitingForUser: true,
          riskLevel: 'medium',
        },
        takeover: {
          required: true,
          blocking: true,
          type: 'route-selection',
          reason: 'route selection',
          prompt: 'Choose the route to continue',
          decisionId: 'decision-route-choice',
          options: [
            { id: 'fast', label: 'Fast route' },
            {
              id: 'safe',
              label: 'Safe route',
              description: 'Prefer lower risk',
            },
          ],
          urgency: 'medium',
        },
        execution: {
          currentStepStatus: 'waiting',
          availableActions: expect.arrayContaining([
            expect.objectContaining({
              type: 'wait',
              scope: 'stage',
              reason: 'Hold the current stage until route selection is resolved.',
            }),
            expect.objectContaining({
              type: 'resume',
              scope: 'mission',
              reason: 'Resume once route selection is resolved.',
            }),
            expect.objectContaining({
              type: 'replan',
              scope: 'route',
              reason: 'Replan the active route around route selection.',
            }),
          ]),
        },
        recovery: {
          state: 'takeover-required',
          deviationCategory: 'route-deviation',
          needsHuman: true,
          canAutoRecover: true,
          suggestedActions: ['retry', 'replan'],
        },
        evidence: {
          eventCount: 3,
          trustLevel: 'partial',
          correlation: {
            missionId: task.id,
            workflowId: task.id,
            replayId: null,
            sessionId: 'session-takeover',
            timelineId: `${task.id}:timeline`,
            decisionIds: ['decision-route-choice'],
            auditEventIds: [],
            lineageIds: [],
          },
          gaps: expect.arrayContaining([
            'No artifacts captured yet',
            'Waiting mission has no resolved decision history yet',
          ]),
          timeline: expect.arrayContaining([
            expect.objectContaining({
              type: 'drive_state_change',
              label: 'progress',
            }),
            expect.objectContaining({
              type: 'takeover',
              label: 'waiting',
              status: 'waiting',
            }),
          ]),
        },
        explanation: {
          current: 'route selection',
          currentState: {
            summary: 'route selection',
            driveState: 'takeover-required',
            missionStatus: 'waiting',
            currentStageKey: 'plan',
            currentStageLabel: 'Build execution plan',
            sources: expect.arrayContaining(['mission-runtime', 'takeover-state']),
          },
          nextSteps: expect.arrayContaining(['Receive task', 'Build execution plan']),
          recommendationDetails: expect.arrayContaining([
            expect.objectContaining({
              kind: 'route',
              source: 'route-planner',
              routeId: expect.stringContaining(':fast'),
              decisionId: 'decision-route-choice',
            }),
            expect.objectContaining({
              kind: 'action',
              actionType: 'wait',
              takeoverType: 'route-selection',
              decisionId: 'decision-route-choice',
              source: 'recovery-engine',
            }),
            expect.objectContaining({
              kind: 'takeover',
              takeoverType: 'route-selection',
              decisionId: 'decision-route-choice',
              source: 'takeover-state',
              summary: 'Choose the route to continue',
            }),
          ]),
          remainingSteps: {
            currentStepKey: 'plan',
            currentStepLabel: 'Build execution plan',
            parallelBranchCount: 0,
            replanChangeSummary: null,
            pendingSteps: expect.arrayContaining([
              expect.objectContaining({
                key: 'plan',
                label: 'Build execution plan',
                status: 'running',
                isCurrent: true,
              }),
            ]),
          },
          riskSummary: expect.arrayContaining(['Awaiting route selection']),
          evidenceHints: expect.arrayContaining([
            'No artifacts captured yet',
          ]),
          telemetrySignals: expect.arrayContaining([
            'mission.status:waiting',
            'drive.state:takeover-required',
            'recovery.state:takeover-required',
          ]),
        },
      },
      orchestration: {
        status: 'waiting',
        currentStageKey: 'plan',
        currentStageLabel: 'Build execution plan',
        blockingReason: 'route selection',
        bindings: {
          missionId: task.id,
          workflowId: null,
          instanceId: null,
          decisionId: 'decision-route-choice',
          executorJobId: null,
        },
        controlActions: {
          available: ['mark-blocked', 'terminate'],
          lastAction: null,
        },
        wait: {
          active: true,
          reason: 'route selection',
          decisionId: 'decision-route-choice',
        },
        replan: {
          required: false,
          active: false,
          attempt: 1,
          triggerAction: null,
        },
      },
    });
    expect(body.projection.autopilotSummary.destination.missingInfo).toEqual([
      body.projection.autopilotSummary.takeover.reason,
    ]);
    expect(body.projection.autopilotSummary.destination.confidence).toMatchObject({
      level: 'medium',
      reason: 'Pending clarification: route selection',
      signals: expect.arrayContaining([
        'waiting-for-input',
        'decision-prompt-present',
        'source-text-present',
      ]),
    });
    expect(body.projection.autopilotSummary.destination.missingInfoDetails).toEqual([
      {
        item: 'route selection',
        impact: 'Route selection cannot continue until this input is resolved.',
        blocking: true,
        clarification: 'Choose the route to continue',
      },
    ]);
    expect(body.projection.autopilotSummary.destination.suggestedClarifications).toEqual([
      'Choose the route to continue',
    ]);
    expect(body.projection.autopilotSummary.destination.taskType).toBe(
      'coordination',
    );
    expect(body.projection.autopilotSummary.destination.auxiliaryTaskTypes).toEqual([]);
    expect(body.projection.autopilotSummary.destination.constraints).toEqual([
      'Mission kind: chat',
    ]);
    expect(body.projection.autopilotSummary.destination.successCriteria).toEqual([
      'Mission completes its current route',
    ]);
    expect(body.projection.autopilotSummary.destination.deliverables).toEqual([
      'Mission result package',
    ]);
  });

  it('projects resolved route-selection history as the authoritative selected route', async () => {
    const task = runtime.createTask({
      kind: 'chat',
      title: 'Projection resolved route selection',
      sourceText: 'Keep the selected route aligned after user confirmation',
      projection: {
        workflowId: 'wf-route-selected',
      },
      stageLabels: [
        { key: 'receive', label: 'Receive task' },
        { key: 'plan', label: 'Build execution plan' },
        { key: 'execute', label: 'Run execution' },
      ],
    });

    runtime.markMissionRunning(task.id, 'execute', 'User picked the safer route', 58);
    runtime.updateMission(task.id, current => {
      current.decisionHistory = [
        {
          decisionId: 'decision-route-selected',
          type: 'multi-choice',
          prompt: 'Choose the route to continue',
          options: [
            { id: 'fast', label: 'Fast route' },
            { id: 'safe', label: 'Safe route' },
          ],
          payload: {
            candidateRoutes: [
              {
                optionId: 'fast',
                routeId: 'wf-route-selected:fast',
                label: 'Fast route',
              },
              {
                optionId: 'safe',
                routeId: 'wf-route-selected:safe',
                label: 'Safe route',
              },
            ],
            recommendedRouteId: 'wf-route-selected:fast',
          },
          resolved: {
            optionId: 'safe',
            optionLabel: 'Safe route',
            freeText: 'Prefer the safer route before external publish.',
            metadata: {
              formData: {
                selectedRouteOptionId: 'safe',
                selectedRouteLabel: 'Safe route',
                selectedRouteId: 'wf-route-selected:safe',
                changedReason: 'Prefer the safer route before external publish.',
              },
            },
          },
          submittedAt: Date.now() - 2_000,
          submittedBy: 'operator@example.com',
          reason: 'Prefer the safer route before external publish.',
          stageKey: 'execute',
        },
      ];
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/projection`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projection.autopilotSummary.route).toMatchObject({
      id: 'wf-route-selected',
      recommendedRouteId: 'wf-route-selected:fast',
      selectedRouteId: 'wf-route-selected:safe',
      selectionStatus: 'user-selected',
      selected: {
        id: 'wf-route-selected:safe',
        label: 'Safe route',
        selected: true,
      },
      selectedRoute: {
        id: 'wf-route-selected:safe',
        label: 'Safe route',
        selected: true,
      },
      selection: {
        status: 'user-selected',
        mode: 'user_selected',
        changedBy: 'user',
        changedReason: 'Prefer the safer route before external publish.',
      },
      evidence: {
        lastEventType: 'route.selected',
        events: expect.arrayContaining([
          expect.objectContaining({
            eventType: 'route.selected',
            actor: 'user',
            fromRouteId: 'wf-route-selected:fast',
            toRouteId: 'wf-route-selected:safe',
            reason: 'Prefer the safer route before external publish.',
          }),
        ]),
      },
    });
    expect(body.projection.autopilotSummary.destination.taskType).toBe('coordination');
    expect(body.projection.autopilotSummary.route.candidateRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'wf-route-selected:safe',
          label: 'Safe route',
          selected: true,
          recommended: false,
        }),
      ]),
    );
    expect(body.projection.autopilotSummary.evidence.correlation).toMatchObject({
      workflowId: 'wf-route-selected',
      recommendedRouteId: 'wf-route-selected:fast',
      selectedRouteId: 'wf-route-selected:safe',
      decisionIds: ['decision-route-selected'],
    });
    expect(body.projection.autopilotSummary.explanation.currentState).toMatchObject({
      routeSelectionStatus: 'user-selected',
      selectedRouteId: 'wf-route-selected:safe',
    });
    expect(body.projection.autopilotSummary.explanation.remainingSteps).toMatchObject({
      selectedRouteId: 'wf-route-selected:safe',
      routeSelectionStatus: 'user-selected',
    });
  });

  it('propagates route-selection decisions from submit to projection route summary', async () => {
    const task = runtime.createTask({
      kind: 'chat',
      title: 'Projection route decision handoff',
      sourceText: 'Route selection should flow into the authoritative summary',
      projection: {
        workflowId: 'wf-route-submit',
      },
      stageLabels: [
        { key: 'receive', label: 'Receive task' },
        { key: 'plan', label: 'Build execution plan' },
        { key: 'execute', label: 'Run execution' },
      ],
    });

    runtime.markMissionRunning(task.id, 'plan', 'Waiting for route confirmation', 46);
    runtime.waitOnMission(task.id, 'route selection', 'Need route selection', 52, {
      decisionId: 'decision-route-submit',
      type: 'multi-choice',
      prompt: 'Choose the route to continue',
      allowFreeText: true,
      options: [
        { id: 'fast', label: 'Fast route' },
        { id: 'safe', label: 'Safe route' },
      ],
      payload: {
        candidateRoutes: [
          {
            optionId: 'fast',
            routeId: 'wf-route-submit:fast',
            label: 'Fast route',
          },
          {
            optionId: 'safe',
            routeId: 'wf-route-submit:safe',
            label: 'Safe route',
          },
        ],
        recommendedRouteId: 'wf-route-submit:fast',
      },
    });

    const decisionResponse = await fetch(`${baseUrl}/api/tasks/${task.id}/decision`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        optionId: 'safe',
        freeText: 'Need lower risk due to budget approval delay',
        submittedBy: 'operator-route',
      }),
    });
    const decisionBody = await decisionResponse.json();

    expect(decisionResponse.status).toBe(200);
    expect(decisionBody).toMatchObject({
      ok: true,
      decision: {
        optionId: 'safe',
        optionLabel: 'Safe route',
        freeText: 'Need lower risk due to budget approval delay',
        metadata: {
          formData: {
            selectedRouteOptionId: 'safe',
            selectedRouteLabel: 'Safe route',
            selectedRouteId: 'wf-route-submit:safe',
            recommendedRouteId: 'wf-route-submit:fast',
            replanRequested: true,
            changedReason: 'Need lower risk due to budget approval delay',
          },
        },
      },
      task: {
        id: task.id,
        status: 'running',
      },
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/projection`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projection.autopilotSummary.route).toMatchObject({
      id: 'wf-route-submit',
      recommendedRouteId: 'wf-route-submit:fast',
      selectedRouteId: 'wf-route-submit:safe',
      selectionStatus: 'replanned',
      changeReason: 'Need lower risk due to budget approval delay',
      selected: {
        id: 'wf-route-submit:safe',
        label: 'Safe route',
        selected: true,
      },
      selectedRoute: {
        id: 'wf-route-submit:safe',
        label: 'Safe route',
        selected: true,
      },
      selection: {
        status: 'replanned',
        mode: 'user_selected',
        changedBy: 'user',
        changedReason: 'Need lower risk due to budget approval delay',
      },
      evidence: {
        lastEventType: 'route.replanned',
        events: expect.arrayContaining([
          expect.objectContaining({
            eventType: 'route.replanned',
            actor: 'user',
            fromRouteId: 'wf-route-submit:fast',
            toRouteId: 'wf-route-submit:safe',
            reason: 'Need lower risk due to budget approval delay',
          }),
        ]),
      },
      replan: {
        active: true,
        reason: 'Need lower risk due to budget approval delay',
        fromRouteId: 'wf-route-submit:fast',
        toRouteId: 'wf-route-submit:safe',
        triggeredBy: 'user',
      },
    });
    expect(body.projection.autopilotSummary.destination.taskType).toBe('coordination');
    expect(body.projection.autopilotSummary.evidence.correlation).toMatchObject({
      workflowId: 'wf-route-submit',
      recommendedRouteId: 'wf-route-submit:fast',
      selectedRouteId: 'wf-route-submit:safe',
      decisionIds: ['decision-route-submit'],
    });
    expect(body.projection.autopilotSummary.explanation.currentState).toMatchObject({
      routeSelectionStatus: 'replanned',
      selectedRouteId: 'wf-route-submit:safe',
    });
    expect(body.projection.autopilotSummary.explanation.recommendationDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'route',
          routeId: 'wf-route-submit:safe',
          routeSelectionStatus: 'replanned',
        }),
        expect.objectContaining({
          kind: 'replan',
          routeId: 'wf-route-submit:safe',
          routeSelectionStatus: 'replanned',
          source: 'mission-runtime',
          summary: 'Need lower risk due to budget approval delay',
        }),
      ]),
    );
    expect(body.projection.autopilotSummary.explanation.remainingSteps).toMatchObject({
      selectedRouteId: 'wf-route-submit:safe',
      routeSelectionStatus: 'replanned',
      replanChangeSummary: 'Need lower risk due to budget approval delay',
    });
    expect(body.projection.orchestration.replan).toMatchObject({
      required: true,
      active: true,
      attempt: 1,
      reason: 'Need lower risk due to budget approval delay',
      triggerAction: 'system',
      updatedAt: expect.any(String),
    });
  });

  it('falls back to decision payload candidateRoutes when selectedRouteId is absent from formData', async () => {
    const task = runtime.createTask({
      kind: 'chat',
      title: 'Projection route payload fallback',
      sourceText: 'Keep route selection aligned when only option metadata is persisted',
      projection: {
        workflowId: 'wf-route-payload-fallback',
      },
      stageLabels: [
        { key: 'receive', label: 'Receive task' },
        { key: 'plan', label: 'Build execution plan' },
        { key: 'execute', label: 'Run execution' },
      ],
    });

    runtime.markMissionRunning(task.id, 'execute', 'Waiting for the safer route handoff', 59);
    runtime.updateMission(task.id, current => {
      current.decisionHistory = [
        {
          decisionId: 'decision-route-payload-fallback',
          type: 'multi-choice',
          prompt: 'Choose the route to continue',
          options: [
            { id: 'fast', label: 'Fast route' },
            { id: 'safe', label: 'Safe route' },
          ],
          payload: {
            candidateRoutes: [
              {
                optionId: 'fast',
                routeId: 'wf-route-payload-fallback:fast',
                label: 'Fast route',
              },
              {
                optionId: 'safe',
                routeId: 'wf-route-payload-fallback:safe',
                label: 'Safe route',
              },
            ],
            recommendedRouteId: 'wf-route-payload-fallback:fast',
          },
          resolved: {
            optionId: 'safe',
            optionLabel: 'Safe route',
            freeText: 'Prefer the safer route before publish.',
            metadata: {
              formData: {
                selectedRouteOptionId: 'safe',
                changedReason: 'Prefer the safer route before publish.',
              },
            },
          },
          submittedAt: Date.now() - 2_000,
          submittedBy: 'operator@example.com',
          reason: 'Prefer the safer route before publish.',
          stageKey: 'execute',
        },
      ];
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/projection`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projection.autopilotSummary.route).toMatchObject({
      id: 'wf-route-payload-fallback',
      recommendedRouteId: 'wf-route-payload-fallback:fast',
      selectedRouteId: 'wf-route-payload-fallback:safe',
      selectionStatus: 'user-selected',
      selected: {
        id: 'wf-route-payload-fallback:safe',
        label: 'Safe route',
        selected: true,
      },
      selectedRoute: {
        id: 'wf-route-payload-fallback:safe',
        label: 'Safe route',
        selected: true,
      },
      selection: {
        status: 'user-selected',
        mode: 'user_selected',
        changedBy: 'user',
        changedReason: 'Prefer the safer route before publish.',
      },
      evidence: {
        lastEventType: 'route.selected',
        events: expect.arrayContaining([
          expect.objectContaining({
            eventType: 'route.selected',
            actor: 'user',
            fromRouteId: 'wf-route-payload-fallback:fast',
            toRouteId: 'wf-route-payload-fallback:safe',
            reason: 'Prefer the safer route before publish.',
          }),
        ]),
      },
    });
    expect(body.projection.autopilotSummary.evidence.correlation).toMatchObject({
      workflowId: 'wf-route-payload-fallback',
      recommendedRouteId: 'wf-route-payload-fallback:fast',
      selectedRouteId: 'wf-route-payload-fallback:safe',
      decisionIds: ['decision-route-payload-fallback'],
    });
    expect(body.projection.orchestration.replan).toMatchObject({
      required: false,
      active: false,
      attempt: 1,
      reason: null,
      triggerAction: null,
      updatedAt: null,
    });
  });

  it('projects retry-driven orchestration state for replan-aware views', async () => {
    const task = runtime.createTask({
      kind: 'nl-command',
      title: 'Projection replan route',
      sourceText: 'Retry the orchestration after a failed run',
      stageLabels: [
        { key: 'receive', label: 'Receive task' },
        { key: 'plan', label: 'Build execution plan' },
        { key: 'execute', label: 'Run execution' },
      ],
    });

    runtime.markMissionRunning(task.id, 'execute', 'Initial execution failed', 63);
    runtime.failMission(task.id, 'Executor crashed while applying the route');
    runtime.updateMission(task.id, current => {
      current.operatorActions = [
        {
          id: 'action-retry',
          action: 'retry',
          createdAt: Date.now() - 500,
          result: 'completed',
          requestedBy: 'operator@example.com',
          reason: 'Retry after executor crash',
          detail: 'Retry requested. Attempt 2 queued for execution.',
        },
      ];
      current.attempt = 2;
      current.status = 'queued';
      current.progress = 0;
      current.currentStageKey = 'plan';
      current.operatorState = 'active';
      current.blocker = undefined;
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/projection`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projection.orchestration).toMatchObject({
      status: 'queued',
      currentStageKey: 'plan',
      currentStageLabel: 'Build execution plan',
      blockingReason: null,
      bindings: {
        missionId: task.id,
        workflowId: null,
        instanceId: null,
        decisionId: null,
        executorJobId: null,
      },
      controlActions: {
        available: ['pause', 'mark-blocked', 'terminate'],
        lastAction: {
          action: 'retry',
          result: 'completed',
          requestedBy: 'operator@example.com',
          reason: 'Retry after executor crash',
        },
      },
      wait: {
        active: false,
        reason: null,
        decisionId: null,
      },
      replan: {
        required: true,
        active: true,
        attempt: 2,
        reason: 'Retry after executor crash',
        triggerAction: 'retry',
      },
    });
    expect(body.projection.orchestration.controlActions.recent).toHaveLength(1);
    expect(body.projection.orchestration.replan.updatedAt).toBe(
      body.projection.orchestration.controlActions.lastAction.createdAt,
    );
    expect(body.projection.autopilotSummary.route).toMatchObject({
      mode: 'fast',
      status: 'pending',
      currentStageKey: 'plan',
      changeReason: 'Retry after executor crash',
      selectedRouteId: expect.stringContaining(':fast'),
      recommendedRouteId: expect.stringContaining(':fast'),
    });
    expect(body.projection.autopilotSummary.execution).toMatchObject({
      currentStepKey: 'plan',
      currentStepLabel: 'Build execution plan',
      currentStepStatus: 'pending',
      parallelBranchCount: 0,
      blockedReasons: [],
      availableActions: expect.arrayContaining([
        expect.objectContaining({
          type: 'run',
          reason: 'Continue executing Build execution plan.',
        }),
        expect.objectContaining({
          type: 'retry',
          reason: 'Retry the mission from the latest safe checkpoint.',
        }),
        expect.objectContaining({
          type: 'replan',
          reason: 'Replan the route before retrying execution.',
        }),
      ]),
    });
    expect(body.projection.autopilotSummary.recovery).toMatchObject({
      state: 'healthy',
      deviationCategory: 'none',
      attemptedActions: ['retry'],
      suggestedActions: ['retry', 'replan'],
      needsHuman: false,
      canAutoRecover: true,
    });
    expect(body.projection.autopilotSummary.evidence).toMatchObject({
      eventCount: 3,
      latestEventType: 'failed',
      trustLevel: 'partial',
      correlation: {
        missionId: task.id,
        workflowId: task.id,
        replayId: null,
        sessionId: null,
        timelineId: `${task.id}:timeline`,
        decisionIds: [],
        operatorActionIds: ['action-retry'],
        auditEventIds: [],
        lineageIds: [],
      },
    });
    expect(body.projection.autopilotSummary.route.evidence).toMatchObject({
      lastEventType: 'route.replanned',
      lastEventAt: expect.any(String),
      events: expect.arrayContaining([
        expect.objectContaining({
          eventType: 'route.recommended',
          actor: 'planner',
          toRouteId: expect.stringContaining(':fast'),
        }),
        expect.objectContaining({
          eventType: 'route.replanned',
          actor: 'runtime',
          reason: 'Retry after executor crash',
          toRouteId: expect.stringContaining(':fast'),
        }),
      ]),
    });
    expect(body.projection.autopilotSummary.route.replan).toMatchObject({
      active: true,
      reason: 'Retry after executor crash',
      fromRouteId: null,
      toRouteId: expect.stringContaining(':fast'),
      triggeredBy: 'runtime',
    });
    expect(body.projection.autopilotSummary.evidence.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'drive_state_change',
          label: 'progress',
        }),
        expect.objectContaining({
          label: 'failed',
        }),
        expect.objectContaining({
          type: 'operator_action',
          label: 'retry',
          status: 'done',
        }),
      ]),
    );
    expect(body.projection.autopilotSummary.explanation).toMatchObject({
      current: 'Executor crashed while applying the route',
      currentState: {
        summary: 'Executor crashed while applying the route',
        driveState: 'replanning',
        missionStatus: 'queued',
        currentStageKey: 'plan',
        currentStageLabel: 'Build execution plan',
        sources: expect.arrayContaining(['mission-runtime', 'recovery-engine']),
      },
      nextSteps: expect.arrayContaining(['Receive task', 'Build execution plan']),
      recommendationReasons: expect.arrayContaining([
        'Derived from mission intent, current risk, and runtime readiness.',
      ]),
      recommendationDetails: expect.arrayContaining([
        expect.objectContaining({
          kind: 'route',
          source: 'route-planner',
          routeId: expect.stringContaining(':fast'),
        }),
        expect.objectContaining({
          kind: 'action',
          actionType: 'replan',
          source: 'recovery-engine',
          routeId: expect.stringContaining(':fast'),
        }),
        expect.objectContaining({
          kind: 'replan',
          actionType: 'replan',
          source: 'recovery-engine',
          routeId: expect.stringContaining(':fast'),
          summary: 'Retry after executor crash',
        }),
      ]),
      remainingSteps: {
        currentStepKey: 'plan',
        currentStepLabel: 'Build execution plan',
        parallelBranchCount: 0,
        replanChangeSummary: 'Retry after executor crash',
        pendingSteps: expect.arrayContaining([
          expect.objectContaining({
            key: 'receive',
            label: 'Receive task',
            status: 'pending',
            isCurrent: false,
          }),
          expect.objectContaining({
            key: 'plan',
            label: 'Build execution plan',
            status: 'pending',
            isCurrent: true,
          }),
        ]),
      },
      riskSummary: [],
      evidenceHints: expect.arrayContaining([
        'No artifacts captured yet',
      ]),
      telemetrySignals: expect.arrayContaining([
        'mission.status:queued',
        'drive.state:replanning',
        'recovery.state:healthy',
      ]),
    });
    expect(body.projection.autopilotSummary.evidence.correlation.operatorActionIds).toEqual([
      'action-retry',
    ]);
    expect(
      body.projection.autopilotSummary.explanation.remainingSteps.replanChangeSummary,
    ).toBe(body.projection.autopilotSummary.route.replan.reason);
    expect(
      body.projection.autopilotSummary.explanation.recommendationDetails.find(
        (item: { kind: string }) => item.kind === 'replan',
      )?.summary,
    ).toBe(body.projection.autopilotSummary.route.replan.reason);
  });

  it('keeps destination summary stable for running missions without projection links', async () => {
    const task = runtime.createTask({
      kind: 'chat',
      title: 'Running destination summary',
      sourceText: [
        'Prepare a concise launch brief.',
        'Success criteria: deliver architecture review deck; capture rollback plan.',
        'Constraints: use internal evidence only; keep output bilingual.',
      ].join('\n'),
      summary:
        'Definition of done: committee can review the deck without follow-up questions.',
      stageLabels: [
        { key: 'receive', label: 'Receive task' },
        { key: 'plan', label: 'Build execution plan' },
      ],
    });

    runtime.markMissionRunning(task.id, 'plan', 'Drafting the launch brief', 42);
    runtime.updateMission(task.id, current => {
      current.summary =
        'Definition of done: committee can review the deck without follow-up questions.';
      current.artifacts = [
        {
          kind: 'file',
          name: 'launch-brief.md',
          path: 'artifacts/launch-brief.md',
        },
      ];
      current.securitySummary = {
        level: 'internal',
      };
      current.decision = {
        type: 'confirmation',
        prompt: 'Requirements: keep customer names redacted before final delivery.',
        options: [{ id: 'continue', label: 'Continue' }],
      };
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/projection`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projection.autopilotSummary.destination).toMatchObject({
      id: task.id,
      goal: 'Running destination summary',
      request:
        'Prepare a concise launch brief. Success criteria: deliver architecture review deck; capture rollback plan. Constraints: use internal evidence only; keep output bilingual.',
      constraints: expect.arrayContaining([
        'Mission kind: chat',
        'Security level: internal',
        'use internal evidence only',
        'keep output bilingual.',
        'keep customer names redacted before final delivery.',
      ]),
      successCriteria: expect.arrayContaining([
        'Mission summary is available',
        'Artifacts are produced',
        'deliver architecture review deck',
        'capture rollback plan.',
        'committee can review the deck without follow-up questions.',
      ]),
      deliverables: ['launch-brief.md'],
      missingInfo: [],
    });
    expect(body.projection.autopilotSummary.destination.request).toBe(
      task.sourceText.replace(/\s+/g, ' '),
    );
    expect(body.projection.autopilotSummary.destination.missingInfoDetails).toEqual([]);
    expect(
      body.projection.autopilotSummary.destination.suggestedClarifications,
    ).toBeUndefined();
    expect(body.projection.autopilotSummary.destination.subGoals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Build execution plan',
          source: 'mission-stage',
          status: 'running',
        }),
      ]),
    );
    expect(body.projection.autopilotSummary.destination.constraints).not.toContain(
      expect.stringContaining('Source app:'),
    );
  });

  it('aligns autopilot correlation and bindings with resolved projection links', async () => {
    const task = runtime.createTask({
      kind: 'chat',
      title: 'Projection link alignment',
      sourceText: 'Align resolved workflow projection links into autopilot summary',
      topicId: 'topic-link-alignment',
      projection: {
        workflowId: 'wf-links',
      },
      stageLabels: [
        { key: 'receive', label: 'Receive task' },
        { key: 'plan', label: 'Build execution plan' },
      ],
    });
    db.createWorkflow('wf-links', 'Align workflow projection links', []);
    db.updateWorkflow('wf-links', {
      status: 'running',
      current_stage: 'plan',
      started_at: '2026-04-24T10:00:00.000Z',
      results: {
        input: {
          sourceApp: 'workflow-console',
          sessionId: 'session-from-workflow',
          projection: {
            instanceId: 'wf-links-instance',
            replayId: 'replay-from-workflow',
          },
        },
      },
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/projection`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projection).toMatchObject({
      links: {
        workflowId: 'wf-links',
        instanceId: 'wf-links-instance',
        sessionId: 'session-from-workflow',
        replayId: 'replay-from-workflow',
        sourceApp: 'workflow-console',
      },
      autopilotSummary: {
        destination: {
          id: task.id,
          goal: 'Projection link alignment',
          request: 'Align resolved workflow projection links into autopilot summary',
          constraints: ['Mission kind: chat', 'Source app: workflow-console'],
          successCriteria: ['Mission completes its current route'],
          deliverables: ['Mission result package'],
          missingInfo: [],
        },
        bindings: {
          missionId: task.id,
          workflowId: 'wf-links',
          instanceId: 'wf-links-instance',
          executorJobId: null,
        },
        evidence: {
          correlation: {
            missionId: task.id,
            workflowId: 'wf-links',
            replayId: 'replay-from-workflow',
            sessionId: 'session-from-workflow',
            timelineId: `${task.id}:timeline`,
          },
        },
        route: {
          id: 'wf-links',
          selectedRouteId: 'wf-links:fast',
          recommendedRouteId: 'wf-links:fast',
          selected: {
            id: 'wf-links:fast',
          },
          selectedRoute: {
            id: 'wf-links:fast',
          },
          replan: {
            active: false,
            reason: null,
            fromRouteId: null,
            toRouteId: null,
            triggeredBy: null,
          },
        },
        explanation: {
          currentState: {
            workflowStatus: 'running',
            workflowStage: 'plan',
            sources: expect.arrayContaining(['workflow-runtime']),
          },
          recommendationDetails: expect.arrayContaining([
            expect.objectContaining({
              kind: 'route',
              source: 'route-planner',
              routeId: 'wf-links:fast',
              decisionId: null,
            }),
          ]),
          remainingSteps: {
            replanChangeSummary: null,
          },
          telemetrySignals: expect.arrayContaining([
            'mission.status:queued',
            'recovery.state:healthy',
          ]),
        },
      },
      orchestration: {
        bindings: {
          missionId: task.id,
          workflowId: 'wf-links',
          instanceId: 'wf-links-instance',
        },
        replan: {
          required: false,
          active: false,
          attempt: 1,
          reason: null,
          triggerAction: null,
          updatedAt: null,
        },
      },
    });
    expect(body.projection.autopilotSummary.evidence.correlation).toEqual(
      expect.objectContaining({
        missionId: body.projection.autopilotSummary.bindings.missionId,
        workflowId: body.projection.autopilotSummary.bindings.workflowId,
        replayId: body.projection.links.replayId,
        sessionId: body.projection.links.sessionId,
      }),
    );
    expect(body.projection.autopilotSummary.destination.constraints).toEqual(
      expect.arrayContaining([
        'Mission kind: chat',
        'Source app: workflow-console',
      ]),
    );
    expect(body.projection.autopilotSummary.destination.successCriteria).toEqual([
      'Mission completes its current route',
    ]);
    expect(body.projection.autopilotSummary.destination.deliverables).toEqual([
      'Mission result package',
    ]);
    expect(body.projection.autopilotSummary.destination.missingInfo).toEqual([]);
    expect(body.projection.autopilotSummary.route.id).toBe(
      body.projection.autopilotSummary.bindings.workflowId,
    );
    expect(
      body.projection.autopilotSummary.explanation.recommendationDetails[0].routeId,
    ).toBe(body.projection.autopilotSummary.route.selectedRouteId);
    expect(body.projection.graph).toMatchObject({
      instanceId: 'wf-links-instance',
      workflowId: 'wf-links',
      missionId: task.id,
      sessionId: 'session-from-workflow',
      links: {
        workflowId: 'wf-links',
        missionId: task.id,
        sessionId: 'session-from-workflow',
        replayId: 'replay-from-workflow',
      },
    });
    expect(body.projection.orchestration.bindings.workflowId).toBe(
      body.projection.links.workflowId,
    );
    expect(body.projection.orchestration.bindings.instanceId).toBe(
      body.projection.links.instanceId,
    );
    expect(body.projection.autopilotSummary.bindings.instanceId).toBe(
      body.projection.links.instanceId,
    );
    expect(body.projection.autopilotSummary.evidence.correlation.workflowId).toBe(
      body.projection.orchestration.bindings.workflowId,
    );
    expect(body.projection.autopilotSummary.evidence.correlation.sessionId).toBe(
      body.projection.links.sessionId,
    );
    expect(body.projection.autopilotSummary.evidence.correlation.replayId).toBe(
      body.projection.links.replayId,
    );
    expect(body.projection.autopilotSummary.route.selection).toMatchObject({
      status: 'recommended',
      mode: 'planner_default',
      locked: false,
      canSwitch: true,
      switchRequiresConfirmation: false,
      changedBy: 'planner',
      changedReason: null,
    });
    expect(body.projection.autopilotSummary.route.replan.reason).toBe(
      body.projection.autopilotSummary.explanation.remainingSteps.replanChangeSummary,
    );
  });

  it('bridges fallback decision context and resolved links into autopilot summary correlation', async () => {
    const task = runtime.createTask({
      kind: 'chat',
      title: 'Projection fallback decision alignment',
      sourceText: 'Align waiting decision context without an explicit decision id',
      topicId: 'topic-fallback-decision',
      projection: {
        workflowId: 'wf-fallback-decision',
      },
      stageLabels: [
        { key: 'receive', label: 'Receive task' },
        { key: 'plan', label: 'Build execution plan' },
      ],
    });

    db.createWorkflow(
      'wf-fallback-decision',
      'Align waiting decision context without an explicit decision id',
      [],
    );
    db.updateWorkflow('wf-fallback-decision', {
      status: 'running',
      current_stage: 'plan',
      started_at: '2026-04-24T10:30:00.000Z',
      results: {
        input: {
          sourceApp: 'workflow-console',
          sessionId: 'session-fallback-decision',
          projection: {
            instanceId: 'wf-fallback-decision-instance',
            replayId: 'replay-fallback-decision',
          },
        },
      },
    });

    runtime.markMissionRunning(task.id, 'plan', 'Waiting for a route choice', 41);
    runtime.waitOnMission(task.id, 'route selection', 'Need route selection', 47, {
      type: 'multi-choice',
      prompt: 'Choose a route to continue',
      options: [
        { id: 'fast', label: 'Fast route' },
        { id: 'deep', label: 'Deep route' },
      ],
    });
    runtime.updateMission(task.id, current => {
      current.decisionHistory = [
        {
          decisionId: 'decision-history-fallback',
          type: 'multi-choice',
          prompt: 'Previously reviewed route options',
          options: [
            { id: 'safe', label: 'Safe route' },
            { id: 'fast', label: 'Fast route' },
          ],
          resolved: {
            optionId: 'safe',
            optionLabel: 'Safe route',
          },
          submittedAt: Date.now() - 2_000,
          submittedBy: 'reviewer@example.com',
          reason: 'Previous checkpoint',
          stageKey: 'plan',
        },
      ];
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/projection`);
    const body = await response.json();
    const fallbackDecisionId = task.id;

    expect(response.status).toBe(200);
    expect(body.projection.links).toMatchObject({
      workflowId: 'wf-fallback-decision',
      instanceId: 'wf-fallback-decision-instance',
      replayId: 'replay-fallback-decision',
      sessionId: 'session-fallback-decision',
      sourceApp: 'workflow-console',
    });
    expect(body.projection.autopilotSummary.bindings).toMatchObject({
      missionId: task.id,
      workflowId: 'wf-fallback-decision',
      instanceId: 'wf-fallback-decision-instance',
      executorJobId: null,
    });
    expect(body.projection.orchestration.bindings).toMatchObject({
      missionId: task.id,
      workflowId: 'wf-fallback-decision',
      instanceId: 'wf-fallback-decision-instance',
      decisionId: fallbackDecisionId,
      executorJobId: null,
    });
    expect(body.projection.orchestration.wait).toMatchObject({
      active: true,
      reason: 'route selection',
      decisionId: fallbackDecisionId,
    });
    expect(body.projection.autopilotSummary.takeover).toMatchObject({
      required: true,
      blocking: true,
      type: 'route-selection',
      reason: 'route selection',
      prompt: 'Choose a route to continue',
      decisionId: fallbackDecisionId,
    });
    expect(body.projection.autopilotSummary.route).toMatchObject({
      id: 'wf-fallback-decision',
      takeoverPointIds: [fallbackDecisionId],
      selectedRouteId: 'wf-fallback-decision:fast',
      recommendedRouteId: 'wf-fallback-decision:fast',
      selectionStatus: 'alternatives-available',
      selected: {
        id: 'wf-fallback-decision:fast',
      },
      selectedRoute: {
        id: 'wf-fallback-decision:fast',
      },
      selection: {
        status: 'alternatives-available',
        changedAt: expect.any(String),
      },
    });
    expect(body.projection.autopilotSummary.evidence.correlation).toMatchObject({
      missionId: task.id,
      workflowId: 'wf-fallback-decision',
      replayId: 'replay-fallback-decision',
      sessionId: 'session-fallback-decision',
      timelineId: `${task.id}:timeline`,
      routeIds: [
        'wf-fallback-decision:fast',
        'wf-fallback-decision:standard',
        'wf-fallback-decision:deep',
      ],
      recommendedRouteId: 'wf-fallback-decision:fast',
      selectedRouteId: 'wf-fallback-decision:fast',
      routeStageKeys: ['receive', 'plan'],
      currentStepKey: 'plan',
    });
    expect(body.projection.autopilotSummary.evidence.correlation.decisionIds).toEqual(
      expect.arrayContaining([fallbackDecisionId, 'decision-history-fallback']),
    );
    expect(body.projection.autopilotSummary.evidence.correlation.decisionIds).toHaveLength(2);
    expect(body.projection.autopilotSummary.explanation.currentState).toMatchObject({
      workflowStatus: 'running',
      workflowStage: 'plan',
      routeSelectionStatus: 'alternatives-available',
      selectedRouteId: 'wf-fallback-decision:fast',
      correlationTimelineId: `${task.id}:timeline`,
      sources: expect.arrayContaining(['workflow-runtime', 'takeover-state']),
    });
    expect(body.projection.autopilotSummary.explanation.remainingSteps).toMatchObject({
      currentStepKey: 'plan',
      currentStepLabel: 'Build execution plan',
      selectedRouteId: 'wf-fallback-decision:fast',
      routeSelectionStatus: 'alternatives-available',
    });
    expect(body.projection.autopilotSummary.explanation.recommendationDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'route',
          routeId: 'wf-fallback-decision:fast',
          decisionId: fallbackDecisionId,
          routeSelectionStatus: 'alternatives-available',
          correlationTimelineId: `${task.id}:timeline`,
        }),
        expect.objectContaining({
          kind: 'action',
          decisionId: fallbackDecisionId,
          routeSelectionStatus: 'alternatives-available',
          correlationTimelineId: `${task.id}:timeline`,
        }),
        expect.objectContaining({
          kind: 'takeover',
          decisionId: fallbackDecisionId,
          routeSelectionStatus: 'alternatives-available',
          correlationTimelineId: `${task.id}:timeline`,
        }),
      ]),
    );
  });

  it('keeps route replan, evidence correlation, and orchestration bindings aligned after workflow-derived link resolution', async () => {
    const task = runtime.createTask({
      kind: 'nl-command',
      title: 'Projection replan link alignment',
      sourceText: 'Retry with workflow-derived projection links',
      projection: {
        workflowId: 'wf-replan-links',
      },
      stageLabels: [
        { key: 'receive', label: 'Receive task' },
        { key: 'plan', label: 'Build execution plan' },
        { key: 'execute', label: 'Run execution' },
      ],
    });

    db.createWorkflow('wf-replan-links', 'Retry with aligned projection links', []);
    db.updateWorkflow('wf-replan-links', {
      status: 'running',
      current_stage: 'plan',
      started_at: '2026-04-24T11:00:00.000Z',
      results: {
        input: {
          sourceApp: 'workflow-console',
          sessionId: 'session-replan-links',
          projection: {
            instanceId: 'wf-replan-links-instance',
            replayId: 'replay-replan-links',
          },
        },
      },
    });

    runtime.markMissionRunning(task.id, 'execute', 'Initial execution failed', 61);
    runtime.failMission(task.id, 'Executor crashed after route handoff');
    runtime.updateMission(task.id, current => {
      current.operatorActions = [
        {
          id: 'action-retry-links',
          action: 'retry',
          createdAt: Date.now() - 750,
          result: 'completed',
          requestedBy: 'operator-links@example.com',
          reason: 'Retry after route handoff crash',
          detail: 'Retry requested after workflow-backed route handoff failed.',
        },
      ];
      current.attempt = 2;
      current.status = 'queued';
      current.progress = 0;
      current.currentStageKey = 'plan';
      current.operatorState = 'active';
      current.blocker = undefined;
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/projection`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projection.links).toMatchObject({
      workflowId: 'wf-replan-links',
      instanceId: 'wf-replan-links-instance',
      sessionId: 'session-replan-links',
      replayId: 'replay-replan-links',
      sourceApp: 'workflow-console',
    });
    expect(body.projection.autopilotSummary.bindings).toMatchObject({
      missionId: task.id,
      workflowId: 'wf-replan-links',
      instanceId: 'wf-replan-links-instance',
      executorJobId: null,
    });
    expect(body.projection.orchestration.bindings).toMatchObject({
      missionId: task.id,
      workflowId: 'wf-replan-links',
      instanceId: 'wf-replan-links-instance',
      decisionId: null,
      executorJobId: null,
    });
    expect(body.projection.autopilotSummary.evidence.correlation).toMatchObject({
      missionId: task.id,
      workflowId: 'wf-replan-links',
      replayId: 'replay-replan-links',
      sessionId: 'session-replan-links',
      operatorActionIds: ['action-retry-links'],
    });
    expect(body.projection.autopilotSummary.route).toMatchObject({
      id: 'wf-replan-links',
      selectedRouteId: 'wf-replan-links:fast',
      recommendedRouteId: 'wf-replan-links:fast',
      changeReason: 'Retry after route handoff crash',
      replan: {
        active: true,
        reason: 'Retry after route handoff crash',
        fromRouteId: null,
        toRouteId: 'wf-replan-links:fast',
        triggeredBy: 'runtime',
      },
      evidence: {
        lastEventType: 'route.replanned',
      },
    });
    expect(body.projection.autopilotSummary.route.selection).toMatchObject({
      status: 'replanned',
      mode: 'runtime_replanned',
      locked: false,
      canSwitch: true,
      switchRequiresConfirmation: false,
      changedReason: 'Retry after route handoff crash',
      changedBy: 'runtime',
    });
    expect(body.projection.autopilotSummary.explanation.currentState).toMatchObject({
      workflowStatus: 'running',
      workflowStage: 'plan',
    });
    expect(body.projection.autopilotSummary.route.selection.changedReason).toBe(
      body.projection.autopilotSummary.route.replan.reason,
    );
    expect(body.projection.autopilotSummary.route.selection.changedBy).toBe(
      body.projection.autopilotSummary.route.replan.triggeredBy,
    );
    expect(body.projection.autopilotSummary.explanation.remainingSteps.replanChangeSummary).toBe(
      body.projection.autopilotSummary.route.replan.reason,
    );
    expect(
      body.projection.autopilotSummary.explanation.recommendationDetails.find(
        (item: { kind: string }) => item.kind === 'replan',
      ),
    ).toMatchObject({
      routeId: 'wf-replan-links:fast',
      summary: 'Retry after route handoff crash',
      source: 'recovery-engine',
    });
    expect(body.projection.graph).toMatchObject({
      workflowId: 'wf-replan-links',
      instanceId: 'wf-replan-links-instance',
      sessionId: 'session-replan-links',
      links: {
        workflowId: 'wf-replan-links',
        replayId: 'replay-replan-links',
        sessionId: 'session-replan-links',
      },
    });
  });

  it('returns mission session view from GET /api/tasks/:id/session', async () => {
    const task = runtime.createTask({
      kind: 'chat',
      title: 'Session detail route',
      sourceText: 'Return mission session view',
      topicId: 'session-task',
      projection: {
        sessionId: 'session-task',
      },
      stageLabels: [{ key: 'receive', label: 'Receive task' }],
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/session`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      missionId: task.id,
      links: {
        sessionId: 'session-task',
      },
      session: {
        sessionId: 'session-task',
        user: 'session-task',
      },
    });
    expect(Array.isArray(body.memoryEntries)).toBe(true);
  });

  it('keeps mission session links aligned with projection links for replay-aware consumers', async () => {
    const task = runtime.createTask({
      kind: 'chat',
      title: 'Session projection link alignment',
      sourceText: 'Replay consumers should inherit resolved projection links',
      topicId: 'topic-session-links',
      projection: {
        workflowId: 'wf-session-links',
      },
      stageLabels: [{ key: 'receive', label: 'Receive task' }],
    });

    db.createWorkflow(
      'wf-session-links',
      'Replay consumers should inherit resolved projection links',
      [],
    );
    db.updateWorkflow('wf-session-links', {
      status: 'running',
      current_stage: 'plan',
      started_at: '2026-04-24T12:00:00.000Z',
      results: {
        input: {
          sourceApp: 'workflow-console',
          sessionId: 'session-linked',
          projection: {
            instanceId: 'wf-session-links-instance',
            replayId: 'replay-session-links',
          },
        },
      },
    });

    const [projectionResponse, sessionResponse] = await Promise.all([
      fetch(`${baseUrl}/api/tasks/${task.id}/projection`),
      fetch(`${baseUrl}/api/tasks/${task.id}/session`),
    ]);
    const projectionBody = await projectionResponse.json();
    const sessionBody = await sessionResponse.json();

    expect(projectionResponse.status).toBe(200);
    expect(sessionResponse.status).toBe(200);
    expect(projectionBody.projection.links).toMatchObject({
      workflowId: 'wf-session-links',
      instanceId: 'wf-session-links-instance',
      sessionId: 'session-linked',
      replayId: 'replay-session-links',
      sourceApp: 'workflow-console',
    });
    expect(sessionBody.links).toEqual(projectionBody.projection.links);
    expect(sessionBody.session).toMatchObject({
      sessionId: 'session-linked',
      sourceApp: 'workflow-console',
    });
    expect(Array.isArray(sessionBody.memoryEntries)).toBe(true);
  });

  it('submits a waiting decision and resumes mission progress', async () => {
    const task = runtime.createChatTask('Decision task');
    runtime.markMissionRunning(task.id, 'receive', 'Task accepted', 10);
    runtime.waitOnMission(task.id, 'product direction', 'Need a direction', 42, {
      prompt: 'Choose a path',
      options: [
        { id: 'continue', label: 'Continue' },
        { id: 'report', label: 'Report only' },
      ],
    });

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/decision`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        optionId: 'continue',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      decision: {
        optionId: 'continue',
        optionLabel: 'Continue',
      },
      task: {
        id: task.id,
        status: 'running',
      },
    });
    expect(runtime.getTask(task.id)?.waitingFor).toBeUndefined();
    expect(runtime.getTask(task.id)?.decision).toBeUndefined();
  });

  it('returns recent task events from GET /api/tasks/:id/events', async () => {
    const task = runtime.createChatTask('Task events');
    runtime.markMissionRunning(task.id, 'understand', 'Reading mission details', 18);
    runtime.logMission(task.id, 'Collected first batch of notes', 'info', 22);

    const response = await fetch(`${baseUrl}/api/tasks/${task.id}/events?limit=3`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      missionId: task.id,
    });
    expect(body.events).toHaveLength(3);
    expect(body.events.map((event: { message: string }) => event.message)).toContain(
      'Collected first batch of notes'
    );
  });

  it('returns 404 for missing task detail', async () => {
    const response = await fetch(`${baseUrl}/api/tasks/task_missing`);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Task not found' });
  });

  it('returns 400 when POST /api/tasks is missing title and source text', async () => {
    const response = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ kind: 'chat' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'title or sourceText is required' });
  });
});
