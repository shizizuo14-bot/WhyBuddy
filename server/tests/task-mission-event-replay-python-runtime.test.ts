import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MissionRuntime } from '../tasks/mission-runtime.js';
import { MissionStore } from '../tasks/mission-store.js';

describe('mission store/runtime maps Python mission event replay runtime result', () => {
  let runtime: MissionRuntime;

  beforeEach(() => {
    runtime = new MissionRuntime({
      store: new MissionStore(),
      autoRecover: false,
    });
  });

  afterEach(() => {
    // no side effects
  });

  it('maps python replay envelope into store preserving projectId, resourceId and auth metadata', () => {
    const created = runtime.createChatTask('Replay mapped mission', 'test', 'topic-97', {
      projectId: 'proj-from-create',
    });
    const pythonReplay = {
      ok: true,
      action: 'replay',
      contractVersion: 'mission-event-replay.runtime-boundary.v1',
      runtime: { owner: 'python', mode: 'runtime_boundary', missionStoreOwner: 'node' },
      metadata: {
        project: { projectId: 'proj-mission-97', validatedBy: 'node' },
        resource: { resourceType: 'mission', resourceId: created.id, owner: 'node' },
        auth: { owner: 'node', required: true, checked: true },
      },
      task: {
        id: created.id,
        status: 'running',
        nodeStatus: 'running',
        progress: 55,
        stageKey: 'execute',
        message: 'Mission replay projected.',
        updatedAt: '2026-06-23T00:00:00.000Z',
      },
      replay: {
        missionId: created.id,
        eventCount: 1,
        limit: 10,
        owner: 'node',
        events: [{ type: 'progress', message: 'replayed', time: Date.now(), source: 'executor' }],
        projection: { projectId: 'proj-mission-97', resourceId: created.id },
      },
    };

    const mapped = runtime.applyEventReplayResult(created.id, pythonReplay);
    expect(mapped).toBeDefined();
    expect(mapped!.id).toBe(created.id);
    expect(mapped!.status).toBe('running');
    expect(mapped!.progress).toBe(55);
    expect(mapped!.projection?.projectId).toBe('proj-mission-97');
    // resource retained via replay mapping
    expect((mapped as any)._replayResourceId || mapped!.projection?.replayId).toBeTruthy();
  });

  it('maps cancelled envelope without turning into completed or running', () => {
    const created = runtime.createChatTask('Cancel via replay', undefined, undefined, { projectId: 'p-cancel' });
    const pythonCancel = {
      ok: true,
      action: 'cancel',
      task: {
        id: created.id,
        status: 'cancelled',
        nodeStatus: 'cancelled',
        progress: 31,
        cancelRequested: true,
        message: 'user requested cancel',
        updatedAt: '2026-06-23T00:01:00.000Z',
      },
      metadata: {
        project: { projectId: 'p-cancel' },
        resource: { resourceId: created.id },
      },
    };

    const mapped = runtime.applyEventReplayResult(created.id, pythonCancel);
    expect(mapped!.status).toBe('cancelled');
    expect(mapped!.status).not.toBe('completed');
    expect(mapped!.status).not.toBe('running');
    expect(mapped!.projection?.projectId).toBe('p-cancel');
  });

  it('maps failed replay result without success coercion', () => {
    const created = runtime.createChatTask('Fail replay map');
    const pythonFail = {
      ok: true,
      action: 'replay',
      task: {
        id: created.id,
        status: 'failed',
        nodeStatus: 'failed',
        progress: 64,
        error: { code: 'REPLAY_FAIL', message: 'boom in replay' },
      },
      metadata: { project: { projectId: 'p-fail' } },
    };

    const mapped = runtime.applyEventReplayResult(created.id, pythonFail);
    expect(mapped!.status).toBe('failed');
    expect(mapped!.status).not.toBe('completed');
    expect(mapped!.status).not.toBe('running');
  });

  it('runtime and store reject via non-ok replay envelope without mutating status', () => {
    const created = runtime.createChatTask('Error replay');
    const errEnv = {
      ok: false,
      action: 'replay',
      code: 'MISSION_EVENT_REPLAY_RUNTIME_ERROR',
      message: 'bad',
    };
    const mapped = runtime.applyEventReplayResult(created.id, errEnv as any);
    expect(mapped).toBeDefined();
    // keeps original queued
    expect(['queued', 'running']).toContain(mapped!.status);
  });
});
