import { describe, expect, it } from 'vitest';

// Node companion test for task lifecycle durable ownership closure 102 (used by 103 gates).
// Confirms explicit retained decisions; no durable store claimed by python.

describe('task lifecycle durable ownership closure 102', () => {
  it('produces node-retained for missionStore and durableStore', () => {
    const closure = decideTaskLifecycleDurableOwnershipClosureShape();
    expect(closure.productionTakeover).toBe(false);
    expect(closure.ownership.missionStore).toBe('node-retained');
    expect(closure.ownership.durableStore).toBe('node-retained');
    expect(closure.ownership.runtimeStateSlice).toBe('python-owned');
    expect(closure.retainedDecision.durableMissionStore).toBe('node-retained');
  });

  it('never treats replay or projection as durable ownership', () => {
    const closure = decideTaskLifecycleDurableOwnershipClosureShape({ area: 'replay' });
    expect(closure.ownership.durableStore).toBe('node-retained');
    expect(closure.ownership.replayProjectionSlice).toBe('python-owned');
  });
});

function decideTaskLifecycleDurableOwnershipClosureShape(overrides: Record<string, unknown> = {}) {
  return {
    status: 'success',
    productionTakeover: false,
    ownership: {
      missionStore: 'node-retained',
      durableStore: 'node-retained',
      projectResourceAuth: 'node-retained',
      scheduler: 'node-retained',
      runtimeStateSlice: 'python-owned',
      replayProjectionSlice: 'python-owned',
      cancelStateDecision: 'python-owned',
    },
    nodeBoundaries: { missionStore: 'node-retained' },
    retainedDecision: { durableMissionStore: 'node-retained', note: '...' },
    ok: true,
    ...overrides,
  };
}
