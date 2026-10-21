import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_FLEET_COUNTS,
  PROFILE_CONTINUITY_VERSION,
  createFleetRegistry,
  createOpportunityDecisionMemo,
  createProfileActivation,
  createProfileActivationSource,
  publishWithContinuity,
  verifyContinuity,
} from '../../src/fleet';
import type { ManeuverSnapshot, OpportunityMemoInput, ProfileActivation } from '../../src/fleet';

const VEHICLE = 'vehicle-1';
const ACTIVATION = { vehicleId: VEHICLE, versionId: 'v2', tick: 1 } as const;

function snapshot(overrides: Partial<ManeuverSnapshot> = {}): ManeuverSnapshot {
  return {
    version: PROFILE_CONTINUITY_VERSION,
    vehicleId: VEHICLE,
    tick: 0,
    positionM: { x: 1.5, y: 0.25, z: 80 },
    speedMps: 9.5,
    headingRad: 0.2,
    controlMode: 'AUTO',
    appliedProfileVersion: 'v1',
    laneChange: {
      phase: 'COMMITTED',
      targetLaneId: 'lane-par',
      startedTick: 10,
      progress: 0.5,
      lastChangeTick: 10,
    },
    signalOpportunity: {
      opportunityId: 'signal-op-1',
      occurrence: 1,
      decision: 'STOP:STOP_LINE_APPROACH',
      sampledTick: 10,
      profileVersion: 'v1',
    },
    manual: {
      seat: 'PLAYER',
      mode: 'MANUAL',
      command: {
        commandId: 'cmd-1',
        throttle: 0.4,
        brake: 0,
        steering: 0.1,
        handbrake: false,
      },
    },
    ...overrides,
  };
}

function after(overrides: Partial<ManeuverSnapshot> = {}): ManeuverSnapshot {
  return snapshot({ tick: 1, appliedProfileVersion: 'v2', ...overrides });
}

function memoInput(overrides: Partial<OpportunityMemoInput> = {}): OpportunityMemoInput {
  return {
    vehicleId: VEHICLE,
    opportunityId: 'signal-op-1',
    occurrence: 1,
    tick: 10,
    profileVersion: 'v1',
    ...overrides,
  };
}

function samplerFor(decision: string) {
  return (input: OpportunityMemoInput) => ({
    decision: { signature: decision },
    profileVersion: input.profileVersion,
    signature: decision,
  });
}

function configuration(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'session-111-fleet',
    worldEpoch: 1,
    scenarioId: 'city-fixture',
    seed: 20261021,
    namespace: 'city:fixture:continuity-fleet',
    taxiCount: DEFAULT_FLEET_COUNTS.taxis,
    civilianCount: DEFAULT_FLEET_COUNTS.civilians,
    profile: { profileId: 'city-profile', versionId: 'v1' },
  };
}

interface World {
  readonly registry: ReturnType<typeof createFleetRegistry>;
  readonly activation: ProfileActivation;
  readonly vehicleId: string;
}

function world(): World {
  let current = 0;
  const source = createProfileActivationSource({ profileId: 'city-profile', versionId: 'v1' });
  const registry = createFleetRegistry(configuration(), { profileSource: source });
  const activation = createProfileActivation({
    registry,
    source,
    engineVersion: 'engine-1',
    clock: () => current,
    now: () => '2026-10-21T00:00:00Z',
  });
  activation.publish({
    profileId: 'city-profile',
    versionId: 'v2',
    engineVersion: 'engine-1',
    publishedAtTick: 0,
    activateAtTick: 1,
    reason: 'learned segment applied',
    origin: 'LEARNED',
    idempotencyKey: 'fleet-key-1',
  });
  current = 1;
  return { registry, activation, vehicleId: registry.list()[0]!.vehicleId };
}

test('111 only the applied version and tick may differ across an activation', () => {
  assert.deepEqual(verifyContinuity(snapshot(), after(), ACTIVATION), []);
});

test('111 injected position, speed, heading and control-mode changes are closed violations', () => {
  const cases: readonly [string, Partial<ManeuverSnapshot>][] = [
    ['POSITION_CHANGED', { positionM: { x: 1.5001, y: 0.25, z: 80 } }],
    ['SPEED_CHANGED', { speedMps: 0 }],
    ['HEADING_CHANGED', { headingRad: 0.2000001 }],
    ['CONTROL_MODE_CHANGED', { controlMode: 'MANUAL' }],
  ];
  for (const [code, overrides] of cases)
    assert.deepEqual(verifyContinuity(snapshot(), after(overrides), ACTIVATION), [code]);
});

test('111 a cancelled, restarted or progressed lane change is LANE_CHANGE_CANCELLED', () => {
  const cases: readonly Partial<ManeuverSnapshot>[] = [
    { laneChange: null },
    {
      laneChange: {
        phase: 'IDLE',
        targetLaneId: null,
        startedTick: null,
        progress: 0,
        lastChangeTick: 10,
      },
    },
    {
      laneChange: {
        phase: 'COMMITTED',
        targetLaneId: 'lane-par',
        startedTick: 11,
        progress: 0.5,
        lastChangeTick: 10,
      },
    },
    {
      laneChange: {
        phase: 'COMMITTED',
        targetLaneId: 'lane-par',
        startedTick: 10,
        progress: 0.6,
        lastChangeTick: 10,
      },
    },
  ];
  for (const overrides of cases)
    assert.deepEqual(verifyContinuity(snapshot(), after(overrides), ACTIVATION), [
      'LANE_CHANGE_CANCELLED',
    ]);
});

test('111 a released seat or changed held command is MANUAL_COMMAND_OVERRIDDEN', () => {
  const released = after({
    manual: { seat: 'NONE', mode: null, command: null },
  });
  assert.deepEqual(verifyContinuity(snapshot(), released, ACTIVATION), [
    'MANUAL_COMMAND_OVERRIDDEN',
  ]);
  const changedThrottle = after({
    manual: {
      seat: 'PLAYER',
      mode: 'MANUAL',
      command: {
        commandId: 'cmd-1',
        throttle: 0.5,
        brake: 0,
        steering: 0.1,
        handbrake: false,
      },
    },
  });
  assert.deepEqual(verifyContinuity(snapshot(), changedThrottle, ACTIVATION), [
    'MANUAL_COMMAND_OVERRIDDEN',
  ]);
});

test('111 an altered or lost evaluated opportunity is OPPORTUNITY_RESAMPLED', () => {
  const altered = after({
    signalOpportunity: {
      opportunityId: 'signal-op-1',
      occurrence: 1,
      decision: 'PROCEED:CROSS_RED_BY_PROFILE',
      sampledTick: 10,
      profileVersion: 'v1',
    },
  });
  assert.deepEqual(verifyContinuity(snapshot(), altered, ACTIVATION), ['OPPORTUNITY_RESAMPLED']);
  const lost = after({ signalOpportunity: null });
  assert.deepEqual(verifyContinuity(snapshot(), lost, ACTIVATION), ['OPPORTUNITY_RESAMPLED']);
});

test('111 a version that did not reach the vehicle is VERSION_NOT_APPLIED', () => {
  assert.deepEqual(verifyContinuity(snapshot(), snapshot({ tick: 1 }), ACTIVATION), [
    'VERSION_NOT_APPLIED',
  ]);
});

test('111 the memo samples once per opportunity across versions and samples a new one', () => {
  const memo = createOpportunityDecisionMemo<{ readonly signature: string }>();
  let calls = 0;
  const sampler = (input: OpportunityMemoInput) => {
    calls += 1;
    return samplerFor('STOP:STOP_LINE_APPROACH')(input);
  };
  const first = memo.decideOnce(memoInput(), sampler);
  const replayed = memo.decideOnce(memoInput({ tick: 11, profileVersion: 'v2' }), sampler);
  assert.equal(calls, 1);
  assert.equal(replayed, first);
  assert.equal(replayed.profileVersion, 'v1');
  assert.deepEqual(memo.stats(), {
    version: PROFILE_CONTINUITY_VERSION,
    capacity: 256,
    size: 1,
    decisions: 2,
    cached: 1,
    sampled: 1,
    evictions: 0,
  });
  const fresh = memo.decideOnce(
    memoInput({ opportunityId: 'signal-op-2', occurrence: 2, profileVersion: 'v2' }),
    sampler,
  );
  assert.equal(calls, 2);
  assert.equal(fresh.profileVersion, 'v2');
  assert.equal(memo.stats().sampled, 2);
  assert.equal(memo.stats().cached, 1);
});

test('111 the memo is bounded, evicts deterministically and exposes counters', () => {
  const memo = createOpportunityDecisionMemo<number>({ capacity: 2 });
  let calls = 0;
  const sampler = (input: OpportunityMemoInput) => {
    calls += 1;
    return { decision: calls, profileVersion: input.profileVersion, signature: `d-${calls}` };
  };
  memo.decideOnce(memoInput({ opportunityId: 'a' }), sampler);
  memo.decideOnce(memoInput({ opportunityId: 'b' }), sampler);
  const third = memo.decideOnce(memoInput({ opportunityId: 'c' }), sampler);
  assert.equal(third.decision, 3);
  assert.equal(memo.peek(memoInput({ opportunityId: 'a' })), null);
  assert.notEqual(memo.peek(memoInput({ opportunityId: 'c' })), null);
  assert.equal(memo.stats().size, 2);
  assert.equal(memo.stats().evictions, 1);
  assert.equal(memo.stats().sampled, 3);
  assert.throws(() => createOpportunityDecisionMemo({ capacity: 0 }));
});

test('111 publishWithContinuity applies the real 110 command and certifies continuity', () => {
  const setup = world();
  const before = snapshot({
    vehicleId: setup.vehicleId,
    appliedProfileVersion: 'v1',
  });
  const memo = createOpportunityDecisionMemo<{ readonly signature: string }>();
  let calls = 0;
  const sampler = (input: OpportunityMemoInput) => {
    calls += 1;
    return samplerFor('STOP:STOP_LINE_APPROACH')(input);
  };
  const key = {
    vehicleId: setup.vehicleId,
    opportunityId: 'signal-op-1',
    occurrence: 1,
    tick: 10,
    profileVersion: 'v1',
  };
  memo.decideOnce(key, sampler);
  const result = publishWithContinuity({
    activation: setup.activation,
    before,
    read: (tick: number) =>
      snapshot({
        vehicleId: setup.vehicleId,
        tick,
        appliedProfileVersion: 'v2',
        laneChange: before.laneChange,
        signalOpportunity: before.signalOpportunity,
        manual: before.manual,
      }),
    tick: 1,
    memo,
    sampler,
  });
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.report.status, 'APPLIED');
  assert.deepEqual(result.violations, []);
  assert.equal(calls, 1);
  assert.equal(result.opportunityChecked, true);
  assert.equal(result.memoStats?.cached, 1);
  assert.equal(setup.registry.state(setup.vehicleId)?.appliedProfileVersion, 'v2');
  assert.equal(setup.registry.state(setup.vehicleId)?.tick, 1);
});

test('111 publishWithContinuity keeps the real applied report and reports an injected reset', () => {
  const setup = world();
  const before = snapshot({ vehicleId: setup.vehicleId, signalOpportunity: null });
  const result = publishWithContinuity({
    activation: setup.activation,
    before,
    read: (tick: number) =>
      snapshot({
        vehicleId: setup.vehicleId,
        tick,
        appliedProfileVersion: 'v2',
        speedMps: 0,
        signalOpportunity: null,
      }),
    tick: 1,
  });
  assert.equal(result.report.status, 'APPLIED');
  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(result.violations, ['SPEED_CHANGED']);
  assert.equal(result.after?.speedMps, 0);
});

test('111 publishWithContinuity does not resample the evaluated opportunity after activation', () => {
  const setup = world();
  const before = snapshot({ vehicleId: setup.vehicleId });
  const memo = createOpportunityDecisionMemo<{ readonly signature: string }>();
  let calls = 0;
  const sampler = (input: OpportunityMemoInput) => {
    calls += 1;
    return samplerFor('STOP:STOP_LINE_APPROACH')(input);
  };
  const key = {
    vehicleId: setup.vehicleId,
    opportunityId: 'signal-op-1',
    occurrence: 1,
    tick: 10,
    profileVersion: 'v1',
  };
  const first = memo.decideOnce(key, sampler);
  const result = publishWithContinuity({
    activation: setup.activation,
    before,
    read: (tick: number) =>
      snapshot({ vehicleId: setup.vehicleId, tick, appliedProfileVersion: 'v2' }),
    tick: 1,
    memo,
    sampler,
  });
  assert.equal(result.status, 'APPLIED');
  assert.equal(calls, 1);
  assert.equal(memo.stats().cached, 1);
  assert.equal(memo.peek({ ...key, profileVersion: 'v2' })?.decision, first.decision);
});
