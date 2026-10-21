import assert from 'node:assert/strict';
import test from 'node:test';
import { PROFILE_CONTINUITY_VERSION, createOpportunityDecisionMemo } from '../../src/fleet';
import type {
  FleetRegistry,
  OpportunityDecisionMemo,
  OpportunityDecisionSampler,
  OpportunityMemoInput,
} from '../../src/fleet';
import {
  applyActivationDuringManeuver,
  createSignalDecisionSampler,
  readManeuverSnapshot,
} from '../../src/app';
import type { SignalDecisionSampler } from '../../src/app';
import { signalOpportunityKey } from '../../src/autonomy';
import type { SignalPolicyDecision } from '../../src/autonomy';
import {
  CONTINUITY_BASE_VERSION,
  CONTINUITY_NEXT_VERSION,
  CONTINUITY_SEED,
  CONTINUITY_SESSION,
  continuityFixture,
  laneChangeRead,
  manualRead,
  redObservation,
  signalProfile,
} from './profile-continuity-fixture';
import type { ContinuityFixture } from './profile-continuity-fixture';

interface ApplyExtra<T> {
  readonly memo?: OpportunityDecisionMemo<T>;
  readonly sampler?: OpportunityDecisionSampler<T>;
}

function apply<T>(fixture: ContinuityFixture, extra: ApplyExtra<T> = {}) {
  return applyActivationDuringManeuver({
    ...fixture.sources,
    activation: fixture.activation,
    tick: 1,
    ...extra,
  });
}

function opportunity(phaseStartedTick: number, vehicleId: string): string {
  return signalOpportunityKey({
    sessionId: CONTINUITY_SESSION,
    worldEpoch: 1,
    vehicleId,
    incarnation: 1,
    intersectionId: 'junction',
    movementId: 'west-straight',
    phaseStartedTick,
  });
}

function signalSampler(
  fixture: ContinuityFixture,
  versionId: string,
  counter: { calls: number },
  observation = redObservation(),
): SignalDecisionSampler {
  const base = createSignalDecisionSampler({
    seed: CONTINUITY_SEED,
    scope: { sessionId: CONTINUITY_SESSION, worldEpoch: 1 },
    profile: signalProfile(versionId),
    observation,
    speedMps: fixture.motion.speedMps,
    incarnation: 1,
  });
  return (input: OpportunityMemoInput) => {
    counter.calls += 1;
    return base(input);
  };
}

interface RedSetup {
  readonly memo: OpportunityDecisionMemo<SignalPolicyDecision>;
  readonly sampler: SignalDecisionSampler;
  readonly counter: { calls: number };
  readonly opportunityId: string;
  readonly sample: ReturnType<OpportunityDecisionMemo<SignalPolicyDecision>['decideOnce']>;
}

function redSetup(fixture: ContinuityFixture): RedSetup {
  const counter = { calls: 0 };
  const memo = createOpportunityDecisionMemo<SignalPolicyDecision>();
  const sampler = signalSampler(fixture, CONTINUITY_BASE_VERSION, counter);
  const opportunityId = opportunity(0, fixture.vehicleId);
  const sample = memo.decideOnce(
    {
      vehicleId: fixture.vehicleId,
      opportunityId,
      occurrence: 1,
      tick: 0,
      profileVersion: CONTINUITY_BASE_VERSION,
    },
    sampler,
  );
  fixture.signal.current = {
    opportunityId,
    occurrence: 1,
    decision: sample.decision,
    sampledTick: sample.sampledTick,
    profileVersion: sample.profileVersion,
  };
  fixture.authority.current = manualRead();
  return { memo, sampler, counter, opportunityId, sample };
}

test('111 readManeuverSnapshot reads the accepted state and keeps absent pieces null', () => {
  const fixture = continuityFixture();
  const bare = readManeuverSnapshot(fixture.sources, 0);
  assert.notEqual(bare, null);
  assert.equal(bare?.version, PROFILE_CONTINUITY_VERSION);
  assert.equal(bare?.vehicleId, fixture.vehicleId);
  assert.equal(bare?.tick, 0);
  assert.deepEqual(bare?.positionM, fixture.motion.positionM);
  assert.equal(bare?.speedMps, 11.25);
  assert.equal(bare?.headingRad, 0.42);
  assert.equal(bare?.controlMode, 'AUTO');
  assert.equal(bare?.appliedProfileVersion, CONTINUITY_BASE_VERSION);
  assert.equal(bare?.laneChange, null);
  assert.equal(bare?.signalOpportunity, null);
  assert.equal(bare?.manual, null);

  fixture.laneChange.current = laneChangeRead('COMMITTED', 0.4);
  fixture.authority.current = manualRead();
  const red = redSetup(fixture);
  const full = readManeuverSnapshot(fixture.sources, 0);
  assert.deepEqual(full?.laneChange, {
    phase: 'COMMITTED',
    targetLaneId: 'lane-par',
    startedTick: 0,
    progress: 0.4,
    lastChangeTick: 0,
  });
  assert.equal(full?.signalOpportunity?.opportunityId, red.opportunityId);
  assert.equal(full?.signalOpportunity?.decision, 'STOP:STOP_LINE_APPROACH');
  assert.equal(full?.signalOpportunity?.profileVersion, CONTINUITY_BASE_VERSION);
  assert.equal(full?.manual?.seat, 'PLAYER');
  assert.equal(full?.manual?.command?.commandId, 'command-7');
});

test('111 activation during a turn keeps position, speed and heading exactly', () => {
  const fixture = continuityFixture();
  fixture.publish();
  fixture.setTick(1);
  const before = readManeuverSnapshot(fixture.sources, 0);
  const result = apply(fixture);
  assert.equal(result.status, 'APPLIED');
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.after?.positionM, before?.positionM);
  assert.equal(result.after?.speedMps, before?.speedMps);
  assert.equal(result.after?.headingRad, before?.headingRad);
  assert.equal(result.after?.appliedProfileVersion, CONTINUITY_NEXT_VERSION);
  assert.equal(result.report?.status, 'APPLIED');
});

test('111 activation during a lane change keeps phase, target, start tick and progress', () => {
  const fixture = continuityFixture();
  fixture.laneChange.current = laneChangeRead('COMMITTED', 0.4);
  fixture.publish();
  fixture.setTick(1);
  const before = readManeuverSnapshot(fixture.sources, 0);
  const result = apply(fixture);
  assert.equal(result.status, 'APPLIED');
  assert.deepEqual(result.after?.laneChange, before?.laneChange);
  assert.equal(result.after?.laneChange?.phase, 'COMMITTED');
  assert.equal(result.after?.laneChange?.targetLaneId, 'lane-par');
  assert.equal(result.after?.laneChange?.progress, 0.4);
  assert.equal(result.violations.includes('LANE_CHANGE_CANCELLED'), false);
});

test('111 activation at a red light reuses the evaluated opportunity without resampling', () => {
  const fixture = continuityFixture();
  fixture.laneChange.current = laneChangeRead('COMMITTED', 0.4);
  fixture.publish();
  fixture.setTick(1);
  const red = redSetup(fixture);
  const before = readManeuverSnapshot(fixture.sources, 0);
  const result = apply(fixture, { memo: red.memo, sampler: red.sampler });
  assert.equal(result.status, 'APPLIED');
  assert.deepEqual(result.after?.signalOpportunity, before?.signalOpportunity);
  assert.equal(result.after?.signalOpportunity?.decision, red.sample.signature);
  assert.equal(result.after?.signalOpportunity?.profileVersion, CONTINUITY_BASE_VERSION);
  assert.equal(red.counter.calls, 1);
  assert.equal(red.memo.stats().sampled, 1);
  assert.equal(red.memo.stats().cached, 1);
});

test('111 a new opportunity after activation samples with the new active version', () => {
  const fixture = continuityFixture();
  fixture.publish();
  fixture.setTick(1);
  const red = redSetup(fixture);
  const result = apply(fixture, { memo: red.memo, sampler: red.sampler });
  assert.equal(result.status, 'APPLIED');
  const counterV2 = { calls: 0 };
  const samplerV2 = signalSampler(fixture, CONTINUITY_NEXT_VERSION, counterV2, {
    ...redObservation(),
    tick: 60,
  });
  const nextId = opportunity(600, fixture.vehicleId);
  const next = red.memo.decideOnce(
    {
      vehicleId: fixture.vehicleId,
      opportunityId: nextId,
      occurrence: 2,
      tick: 61,
      profileVersion: CONTINUITY_NEXT_VERSION,
    },
    samplerV2,
  );
  assert.equal(counterV2.calls, 1);
  assert.equal(next.profileVersion, CONTINUITY_NEXT_VERSION);
  assert.equal(next.decision.profileVersionId, CONTINUITY_NEXT_VERSION);
  assert.equal(next.signature, 'STOP:STOP_LINE_APPROACH');
  assert.notEqual(nextId, red.opportunityId);
  assert.equal(
    red.memo.peek({
      vehicleId: fixture.vehicleId,
      opportunityId: red.opportunityId,
      occurrence: 1,
      tick: 0,
      profileVersion: CONTINUITY_BASE_VERSION,
    })?.profileVersion,
    CONTINUITY_BASE_VERSION,
  );
});

test('111 the manual seat and held command survive activation and are not taken over', () => {
  const fixture = continuityFixture();
  fixture.registry.updateState(fixture.vehicleId, { tick: 0, controlMode: 'MANUAL' });
  fixture.authority.current = manualRead();
  fixture.publish();
  fixture.setTick(1);
  const before = readManeuverSnapshot(fixture.sources, 0);
  const result = apply(fixture);
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.manualPreserved, true);
  assert.equal(result.after?.controlMode, 'MANUAL');
  assert.deepEqual(result.after?.manual, before?.manual);
  assert.equal(result.after?.manual?.seat, 'PLAYER');
  assert.equal(result.after?.manual?.command?.commandId, 'command-7');
  assert.equal(result.after?.manual?.command?.throttle, 0.4);
  assert.equal(result.violations.includes('CONTROL_MODE_CHANGED'), false);
  assert.equal(result.violations.includes('MANUAL_COMMAND_OVERRIDDEN'), false);
});

test('111 an injected speed reset blocks certification and keeps the real applied report', () => {
  const fixture = continuityFixture();
  fixture.publish();
  fixture.setTick(1);
  let reads = 0;
  const result = applyActivationDuringManeuver({
    ...fixture.sources,
    vehicle: {
      vehicleId: fixture.vehicleId,
      read: () => {
        reads += 1;
        return reads === 1 ? fixture.motion : { ...fixture.motion, speedMps: 0 };
      },
    },
    activation: fixture.activation,
    tick: 1,
  });
  assert.equal(reads, 2);
  assert.equal(result.report?.status, 'APPLIED');
  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(result.violations, ['SPEED_CHANGED']);
  assert.equal(result.after?.speedMps, 0);
  assert.equal(
    fixture.registry.state(fixture.vehicleId)?.appliedProfileVersion,
    CONTINUITY_NEXT_VERSION,
  );
});

test('111 missing vehicle, foreign activation and stale tick are closed errors', () => {
  const fixture = continuityFixture();
  fixture.publish();
  fixture.setTick(1);
  const missing = applyActivationDuringManeuver({
    ...fixture.sources,
    vehicle: { vehicleId: 'vehicle-missing', read: () => fixture.motion },
    activation: fixture.activation,
    tick: 1,
  });
  assert.equal(missing.status, 'REJECTED');
  assert.equal(missing.rejection?.code, 'VEHICLE_MISSING');

  const foreign = continuityFixture(CONTINUITY_BASE_VERSION, {
    profileId: 'foreign-profile',
  });
  const wrongProfile = applyActivationDuringManeuver({
    ...fixture.sources,
    activation: foreign.activation,
    tick: 1,
  });
  assert.equal(wrongProfile.status, 'REJECTED');
  assert.equal(wrongProfile.rejection?.code, 'FOREIGN_ACTIVATION');

  fixture.registry.updateState(fixture.vehicleId, { tick: 4 });
  const stale = applyActivationDuringManeuver({
    ...fixture.sources,
    activation: fixture.activation,
    tick: 2,
  });
  assert.equal(stale.status, 'REJECTED');
  assert.equal(stale.rejection?.code, 'STALE_TICK');
});

test('111 sixty frames after activation apply nothing, resample nothing and drift nothing', () => {
  const fixture = continuityFixture();
  fixture.laneChange.current = laneChangeRead('COMMITTED', 0.4);
  fixture.publish();
  fixture.setTick(1);
  const red = redSetup(fixture);
  const applied = apply(fixture, { memo: red.memo, sampler: red.sampler });
  assert.equal(applied.status, 'APPLIED');
  const reference = applied.after;
  let idle = 0;
  for (let tick = 2; tick <= 60; tick += 1) {
    fixture.setTick(tick);
    if (fixture.activation.applyAt(tick).status === 'IDLE') idle += 1;
    const sample = red.memo.decideOnce(
      {
        vehicleId: fixture.vehicleId,
        opportunityId: red.opportunityId,
        occurrence: 1,
        tick,
        profileVersion: CONTINUITY_NEXT_VERSION,
      },
      red.sampler,
    );
    assert.equal(sample.sampledTick, red.sample.sampledTick);
    const snapshot = readManeuverSnapshot(fixture.sources, tick);
    assert.deepEqual(snapshot?.positionM, reference?.positionM);
    assert.equal(snapshot?.speedMps, reference?.speedMps);
    assert.equal(snapshot?.headingRad, reference?.headingRad);
    assert.deepEqual(snapshot?.laneChange, reference?.laneChange);
    assert.deepEqual(snapshot?.signalOpportunity, reference?.signalOpportunity);
  }
  assert.equal(idle, 59);
  assert.equal(red.counter.calls, 1);
  assert.equal(fixture.activation.stats().applied, 1);
  assert.equal(fixture.activation.stats().vehiclesUpdated, 64);
});

test('111 the only fleet writes are tick and appliedProfileVersion', () => {
  const patches: { readonly vehicleId: string; readonly keys: readonly string[] }[] = [];
  let added = 0;
  let removed = 0;
  const wrap = (base: FleetRegistry): FleetRegistry => ({
    get configuration() {
      return base.configuration;
    },
    context: () => base.context(),
    get: (vehicleId: string) => base.get(vehicleId),
    state: (vehicleId: string) => base.state(vehicleId),
    list: () => base.list(),
    addVehicle: (...args) => {
      added += 1;
      return base.addVehicle(...args);
    },
    updateState: (vehicleId: string, patch: unknown) => {
      patches.push({ vehicleId, keys: Object.keys(patch as object).sort() });
      return base.updateState(vehicleId, patch);
    },
    removeVehicle: (vehicleId: string) => {
      removed += 1;
      return base.removeVehicle(vehicleId);
    },
    counts: () => base.counts(),
    report: () => base.report(),
    dispose: () => base.dispose(),
  });
  const fixture = continuityFixture(CONTINUITY_BASE_VERSION, { wrap });
  fixture.publish();
  fixture.setTick(1);
  const result = apply(fixture);
  assert.equal(result.status, 'APPLIED');
  assert.equal(patches.length, 64);
  for (const patch of patches)
    assert.deepEqual(patch.keys, ['appliedProfileVersion', 'tick'], patch.vehicleId);
  assert.equal(added, 0);
  assert.equal(removed, 0);
  assert.equal(fixture.registry.list().length, 64);
});
