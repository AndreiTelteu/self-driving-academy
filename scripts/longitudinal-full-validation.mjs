import assert from 'node:assert/strict';
const p95 = (values) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * 0.95)];
/** Pure per-arm reader. Preflight is technical; only full arms apply numeric budgets. */
export function validateLongitudinalFullRun(run, phase, protocol, budget, numericFailures = null) {
  function numeric(condition, message) {
    if (numericFailures === null) assert(condition, message);
    else if (!condition)
      numericFailures.push({
        phase,
        count: run.count,
        pair: run.pair,
        observer: run.observer,
        message,
      });
  }
  const ticks = protocol.warmupTicks + protocol.measuredTicks;
  assert([70, 110].includes(run.count));
  assert.equal(run.checkedBodyStates, run.count * ticks);
  assert.deepEqual(run.nativePopulation, {
    vehicles: run.count,
    bodies: run.count,
    colliders: run.count + 1,
  });
  const reasons = [
    'FREE_ROAD',
    'MECHANICAL_COVERAGE_CAP',
    'INTERSECTION_APPROACH',
    'CURVE_PREFERENCE',
    'BEHAVIOR_STOP',
    'BEHAVIOR_YIELD',
    'BEHAVIOR_BLOCKED',
    'BEHAVIOR_SERVICE',
    'MECHANICALLY_INFEASIBLE_RADIUS',
    'NO_AUTO_AUTHORITY',
    'MISSING_PROFILE',
    'MISSING_CONTEXT',
    'FOREIGN_CONTEXT',
    'STALE_CONTEXT',
    'CONTEXT_DISCONTINUITY',
    'INCOMPLETE_CONTEXT',
    'MISSING_BEHAVIOR',
    'FOREIGN_OR_STALE_BEHAVIOR',
    'PROFILE_VERSION_MISMATCH',
    'MISSING_ROAD_FACTS',
    'FOREIGN_ROAD_FACTS',
    'UNSUPPORTED_ROAD_KIND',
  ];
  let refreshes = 0;
  for (let tick = 1; tick <= ticks; tick++)
    for (let actor = tick % 6; actor < run.count; actor += 6) refreshes++;
  for (const [key, value] of Object.entries(run.targetReasonCounts)) {
    assert(reasons.includes(key));
    assert(Number.isSafeInteger(value) && value > 0 && value <= refreshes);
  }
  assert.equal(
    Object.values(run.targetReasonCounts).reduce((sum, value) => sum + value, 0),
    refreshes,
  );
  for (const [key, value] of Object.entries(run.phaseCounts)) {
    assert(['RELEASED', 'TRACKING', 'BRAKING', 'REACTION_DELAY'].includes(key));
    assert(Number.isSafeInteger(value) && value > 0 && value <= run.count * ticks);
  }
  assert.equal(
    Object.values(run.phaseCounts).reduce((sum, value) => sum + value, 0),
    run.count * ticks,
  );
  assert(Array.isArray(run.firstMissing) && run.firstMissing.length <= run.count);
  assert.equal(
    new Set(run.firstMissing.map((entry) => entry.actor.id)).size,
    run.firstMissing.length,
  );
  for (const entry of run.firstMissing) {
    assert.deepEqual(Object.keys(entry.actor).sort(), ['id', 'incarnation']);
    assert(/^car-\d{1,3}$/.test(entry.actor.id));
    assert(Number(entry.actor.id.slice(4)) < run.count);
    assert(Number.isSafeInteger(entry.actor.incarnation) && entry.actor.incarnation > 0);
    assert(Number.isSafeInteger(entry.tick) && entry.tick > 0 && entry.tick <= ticks);
    assert.equal(entry.targetReason, 'INCOMPLETE_CONTEXT');
    assert.equal(entry.contextReason, 'INCOMPLETE_CONTEXT');
    for (const vector of [entry.positionM, entry.velocityMps]) {
      assert.deepEqual(Object.keys(vector).sort(), ['x', 'y', 'z']);
      assert(Object.values(vector).every(Number.isFinite));
    }
  }
  if (run.firstMissing.length) {
    assert(run.targetReasonCounts.INCOMPLETE_CONTEXT >= run.firstMissing.length);
    assert(run.phaseCounts.RELEASED >= run.firstMissing.length);
  }
  const length = run.observer ? protocol.measuredTicks : 0;
  assert.equal(run.sampleBytes, length * 3 * 8);
  assert.deepEqual(Object.keys(run.samples), ['tickMs', 'stageMs', 'rapierStepMs']);
  for (const samples of Object.values(run.samples)) {
    assert.equal(samples.length, length);
    assert(samples.every((value) => Number.isFinite(value) && value >= 0));
  }
  for (const [metric, channel] of [
    ['tickP95Ms', 'tickMs'],
    ['stageP95Ms', 'stageMs'],
    ['rapierStepP95Ms', 'rapierStepMs'],
  ])
    assert.equal(run[metric], run.observer ? p95(run.samples[channel]) : null);
  assert(run.warmupWallMs >= (protocol.warmupTicks * 1000) / 60);
  assert(run.measuredWallMs >= (protocol.measuredTicks * 1000) / 60);
  assert(run.elapsedWallMs >= ((protocol.warmupTicks + protocol.measuredTicks) * 1000) / 60);
  for (const key of ['warmupWallMs', 'measuredWallMs', 'elapsedWallMs'])
    assert(Number.isFinite(run[key]) && run[key] > 0, 'Finite positive native elapsed duration');
  if (protocol.mode === 'full')
    numeric(
      ((protocol.warmupTicks + protocol.measuredTicks) * 1000) / 60 / run.elapsedWallMs >= 0.98,
      'Native fixed60Hz wall throughput',
    );
  assert(Number.isFinite(run.maxDeadlineLatenessMs) && run.maxDeadlineLatenessMs >= 0);
  for (const [category, keys] of [
    ['body', ['entities', 'subscriptions']],
    ['road', ['cachedContexts', 'identities']],
    ['behavior', ['actors', 'identities', 'decisions']],
    ['controller', ['vehicles']],
  ])
    for (const key of keys) assert.equal(run.cleanup[category][key], 0);
  if (phase === 'after')
    for (const key of ['actors', 'identities', 'cachedTargets'])
      assert.equal(run.cleanup.longitudinal[key], 0);
  assert.equal(
    run.calls,
    phase === 'after' && run.observer ? run.count * protocol.measuredTicks : 0,
  );
  if (run.calls) assert(Number.isFinite(run.ownMeanMs) && run.ownMeanMs >= 0);
  else assert.equal(run.ownMeanMs, null);
  if (protocol.mode === 'full' && run.count === 70 && run.observer) {
    numeric(
      run.tickP95Ms <= budget.proposedBudgets.laptop.authoritativeTickP95Ms,
      'Normal captured tick budget',
    );
    numeric(
      run.rapierStepP95Ms <= budget.proposedBudgets.laptop.rapierStepP95Ms,
      'Normal captured Rapier budget',
    );
  }
}
