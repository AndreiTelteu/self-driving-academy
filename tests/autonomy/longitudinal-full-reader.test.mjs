import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLongitudinalFullRun } from '../../scripts/longitudinal-full-validation.mjs';
import { assertLongitudinalPowerComparable } from '../../scripts/longitudinal-full-power.mjs';
const budget = { proposedBudgets: { laptop: { authoritativeTickP95Ms: 8, rapierStepP95Ms: 5 } } };
function scenario(full = false, cost = 1) {
  const protocol = {
    mode: full ? 'full' : 'preflight',
    warmupTicks: full ? 1800 : 30,
    measuredTicks: full ? 7200 : 60,
  };
  const warmupWallMs = (protocol.warmupTicks * 1000) / 60,
    measuredWallMs = (protocol.measuredTicks * 1000) / 60;
  const run = {
    count: 70,
    checkedBodyStates: 70 * (protocol.warmupTicks + protocol.measuredTicks),
    nativePopulation: { vehicles: 70, bodies: 70, colliders: 71 },
    targetReasonCounts: {
      FREE_ROAD: Math.floor((70 * (protocol.warmupTicks + protocol.measuredTicks)) / 6),
    },
    phaseCounts: { TRACKING: 70 * (protocol.warmupTicks + protocol.measuredTicks) },
    firstMissing: [],
    observer: true,
    sampleBytes: protocol.measuredTicks * 3 * 8,
    samples: {
      tickMs: Array(protocol.measuredTicks).fill(cost),
      stageMs: Array(protocol.measuredTicks).fill(1),
      rapierStepMs: Array(protocol.measuredTicks).fill(1),
    },
    tickP95Ms: cost,
    stageP95Ms: 1,
    rapierStepP95Ms: 1,
    warmupWallMs,
    measuredWallMs,
    elapsedWallMs: warmupWallMs + measuredWallMs,
    maxDeadlineLatenessMs: 0,
    cleanup: {
      body: { entities: 0, subscriptions: 0 },
      road: { cachedContexts: 0, identities: 0 },
      behavior: { actors: 0, identities: 0, decisions: 0 },
      controller: { vehicles: 0 },
      longitudinal: { actors: 0, identities: 0, cachedTargets: 0 },
    },
    calls: 70 * protocol.measuredTicks,
    ownMeanMs: 0.01,
  };
  return { protocol, run };
}
test('047 full reader distinguishes technical preflight from full numeric acceptance', () => {
  const technical = scenario(false, 20);
  technical.run.elapsedWallMs *= 2;
  assert.doesNotThrow(() =>
    validateLongitudinalFullRun(technical.run, 'after', technical.protocol, budget),
  );
  const full = scenario(true, 20);
  assert.throws(
    () => validateLongitudinalFullRun(full.run, 'after', full.protocol, budget),
    /captured tick budget/,
  );
  const accepted = scenario(true);
  assert.doesNotThrow(() =>
    validateLongitudinalFullRun(accepted.run, 'after', accepted.protocol, budget),
  );
});
test('047 aggregated diagnostics retain numerical FAIL records while enforcing every technical gate', () => {
  const { run, protocol } = scenario(true, 20);
  run.elapsedWallMs *= 2;
  const failures = [];
  assert.doesNotThrow(() => validateLongitudinalFullRun(run, 'after', protocol, budget, failures));
  assert.deepEqual(
    failures.map((failure) => failure.message),
    ['Native fixed60Hz wall throughput', 'Normal captured tick budget'],
  );
  run.cleanup.controller.vehicles = 1;
  assert.throws(() => validateLongitudinalFullRun(run, 'after', protocol, budget, []));
});
test('047 full reader rejects lost/nonfinite raw samples, falsified percentile, shortened wall, throughput loss and retained ownership', () => {
  const mutations = [
    (run) => {
      run.samples.tickMs.pop();
    },
    (run) => {
      run.samples.rapierStepMs[0] = NaN;
    },
    (run) => {
      run.tickP95Ms = 0;
    },
    (run) => {
      run.warmupWallMs = 1;
    },
    (run) => {
      run.measuredWallMs = 1;
    },
    (run) => {
      run.elapsedWallMs *= 2;
    },
    (run) => {
      run.cleanup.longitudinal.cachedTargets = 1;
    },
    (run) => {
      run.calls--;
    },
  ];
  for (const [index, mutation] of mutations.entries()) {
    const { run, protocol } = scenario(index === 5);
    mutation(run);
    assert.throws(() => validateLongitudinalFullRun(run, 'after', protocol, budget));
  }
});
test('047 full reader binds absent-lane diagnostics to finite readback, bounded counts and preserved native population', () => {
  const { run, protocol } = scenario();
  run.targetReasonCounts.FREE_ROAD--;
  run.targetReasonCounts.INCOMPLETE_CONTEXT = 1;
  run.phaseCounts.TRACKING--;
  run.phaseCounts.RELEASED = 1;
  run.firstMissing = [
    {
      tick: 6,
      actor: { id: 'car-0', incarnation: 1 },
      positionM: { x: 1, y: 1, z: 1 },
      velocityMps: { x: 0, y: 0, z: 0 },
      contextReason: 'INCOMPLETE_CONTEXT',
      targetReason: 'INCOMPLETE_CONTEXT',
    },
  ];
  assert.doesNotThrow(() => validateLongitudinalFullRun(run, 'after', protocol, budget));
  for (const mutate of [
    (copy) => {
      copy.nativePopulation.bodies--;
    },
    (copy) => {
      copy.checkedBodyStates--;
    },
    (copy) => {
      copy.targetReasonCounts.fictional = 1;
    },
    (copy) => {
      copy.phaseCounts.RELEASED = 0;
    },
    (copy) => {
      copy.firstMissing[0].positionM.x = Infinity;
    },
    (copy) => {
      copy.firstMissing[0].targetReason = 'FREE_ROAD';
    },
    (copy) => {
      copy.firstMissing.push(copy.firstMissing[0]);
    },
  ]) {
    const copy = structuredClone(run);
    mutate(copy);
    assert.throws(() => validateLongitudinalFullRun(copy, 'after', protocol, budget));
  }
});
test('047 full power reader rejects changed scheme/status and unknown identification while recording changing charge separately', () => {
  const start = {
    capturedAt: '2026-10-12T00:00:00Z',
    powerGuid: '381b4222-f694-41f0-9685-ff5bb260df2e',
    batteries: [{ deviceId: 'battery', batteryStatus: 2, estimatedChargeRemaining: 80 }],
    thermals: null,
    energySaver: null,
    preciseAllocatorBytes: null,
    systemPowerStatusRead: true,
    acLineStatus: 1,
    batterySaverFlag: 0,
  };
  const end = {
    ...start,
    capturedAt: '2026-10-12T01:00:00Z',
    batteries: [{ ...start.batteries[0], estimatedChargeRemaining: 85 }],
  };
  assert.doesNotThrow(() => assertLongitudinalPowerComparable(start, end));
  assert.throws(
    () =>
      assertLongitudinalPowerComparable(start, {
        ...end,
        powerGuid: 'a1841308-3541-4fab-bc81-f71556f20b4a',
      }),
    /scheme changed/,
  );
  assert.throws(
    () =>
      assertLongitudinalPowerComparable(start, {
        ...end,
        acLineStatus: 0,
      }),
    /source changed/,
  );
  assert.throws(
    () => assertLongitudinalPowerComparable(start, { ...end, powerGuid: null }),
    /unavailable/,
  );
  assert.doesNotThrow(() =>
    assertLongitudinalPowerComparable(start, {
      ...end,
      batteries: [{ ...end.batteries[0], batteryStatus: 3 }],
    }),
  );
  assert.throws(
    () => assertLongitudinalPowerComparable(start, { ...end, batterySaverFlag: 1 }),
    /saver flag changed/,
  );
  assert.throws(
    () => assertLongitudinalPowerComparable(start, { ...end, acLineStatus: 255 }),
    /unknown/,
  );
});
