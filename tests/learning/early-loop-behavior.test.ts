import assert from 'node:assert/strict';
import test from 'node:test';
import { EARLY_LOOP_KEYS } from '../../src/learning/early-loop';
import {
  EARLY_LOOP_ACTORS,
  STYLE_TOLERANCE,
  canonicalStopSample,
  runEarlyLoopDemo,
} from '../harness/early-loop-204-fixture';
import type { EarlyLoopDemo, ScenarioRun } from '../harness/early-loop-204-fixture';

let cached: EarlyLoopDemo | undefined;
function demo(): EarlyLoopDemo {
  cached ??= runEarlyLoopDemo();
  return cached;
}

function close(actual: number, expected: number) {
  assert.ok(
    Math.abs(actual - expected) <= STYLE_TOLERANCE,
    `expected ${expected} within ${STYLE_TOLERANCE}, received ${actual}`,
  );
}

function baseValue(run: ScenarioRun, key: (typeof EARLY_LOOP_KEYS)[number]): number {
  return run.composed.values[key].base;
}

test('the bounded blend, not the raw candidate, reaches 046/047/051', () => {
  const current = demo();
  const baseTarget = current.base.actors[0]!.targetMps;
  const unit = canonicalStopSample().unit;
  for (const id of ['prudent', 'risky'] as const) {
    const run = current.scenarios[id];
    assert(run.evidence.every((row) => row.status === 'READY'));
    assert(run.candidates.every((row) => row.status === 'CANDIDATE'));
    for (const key of EARLY_LOOP_KEYS) {
      const value = run.composed.values[key];
      assert.notEqual(value.candidate, null);
      // 25% × quality(1) is a strict blend; a raw candidate application would fail both checks.
      close(value.blend, 0.25);
      close(value.value, value.base + 0.25 * (value.candidate! - value.base));
      assert.notEqual(value.value, value.candidate);
    }
    close(run.tokens.cruise.values.speed_delta_urban, run.composed.values.speed_delta_urban.value);
    close(
      run.tokens.longitudinal.values.desired_acceleration,
      run.composed.values.desired_acceleration.value,
    );
    close(run.tokens.stop.stopFullProbability, run.composed.values.stop_full_probability.value);
    // 046 realizes the blended delta on the authored 044 lane (posted limit 10 m/s).
    close(run.actors[0]!.targetMps, baseTarget + run.composed.values.speed_delta_urban.value);
    assert.notEqual(
      run.actors[0]!.targetMps,
      baseTarget + run.candidates.find((row) => row.key === 'speed_delta_urban')!.value!,
    );
    // 047 realizes the blended desired acceleration after the jerk ramp.
    close(run.actors[0]!.accelerationMps2, run.composed.values.desired_acceleration.value);
    assert.equal(run.actors[0]!.phase, 'TRACKING');
    // 051 samples exactly the blended probability.
    close(run.stop.canonical.probability, run.composed.values.stop_full_probability.value);
    assert.equal(
      run.stop.canonical.role,
      unit < run.composed.values.stop_full_probability.value ? 'FULL' : 'ROLLING',
    );
    assert.equal(run.stop.rate.total, 40);
    assert.equal(run.stop.rate.full + run.stop.rate.rolling, 40);
  }
  // The three keys each distinguish the two independent evidence sets.
  assert.notEqual(
    current.scenarios.prudent.actors[0]!.targetMps,
    current.scenarios.risky.actors[0]!.targetMps,
  );
  assert.notEqual(
    current.scenarios.prudent.actors[0]!.accelerationMps2,
    current.scenarios.risky.actors[0]!.accelerationMps2,
  );
  assert.ok(
    current.scenarios.prudent.stop.rate.full > current.scenarios.risky.stop.rate.full,
    'prudent full-stop count must exceed risky',
  );
  assert.equal(current.scenarios.prudent.stop.canonical.role, 'FULL');
  assert.equal(current.scenarios.risky.stop.canonical.role, 'ROLLING');
});

test('three taxis and two civilians receive the same learned style', () => {
  for (const id of ['prudent', 'risky', 'no-evidence'] as const) {
    const run = demo().scenarios[id];
    assert.equal(run.actors.length, EARLY_LOOP_ACTORS.length);
    assert.equal(run.actors.filter((actor) => actor.kind === 'TAXI').length, 3);
    assert.equal(run.actors.filter((actor) => actor.kind === 'CIVIL').length, 2);
    assert(
      new Set(run.actors.map((actor) => actor.classId)).size > 1,
      'the fixture must mix vehicle classes so style and mechanics stay separate',
    );
    const reference = run.actors[0]!;
    for (const actor of run.actors) {
      close(actor.targetMps, reference.targetMps);
      close(actor.accelerationMps2, reference.accelerationMps2);
      assert.equal(actor.targetReason, reference.targetReason);
      assert.equal(actor.phase, reference.phase);
    }
    const stopReference = run.stop.actors[0]!;
    assert.equal(run.stop.actors.length, 5);
    for (const outcome of run.stop.actors) {
      assert.equal(outcome.role, stopReference.role);
      assert.equal(outcome.action, stopReference.action);
      assert.equal(outcome.stopRequested, stopReference.stopRequested);
      close(outcome.probability, stopReference.probability);
      close(outcome.probability, run.composed.values.stop_full_probability.value);
    }
  }
});

test('MANUAL compiles nothing, observes zero episodes and leaves the base profile unchanged', () => {
  const run = demo();
  assert.equal(run.manual.earlyLoop, null);
  assert.equal(run.manual.controllerTokens, null);
  assert.equal(run.manual.evidenceEpisodes, 0);
  assert.equal(run.manual.profileUnchanged, true);
  assert.equal(run.manual.maximumParameterDelta, 0);
  assert.deepEqual(run.manual.after, run.manual.before);
  assert.notEqual(run.scenarios.prudent.tokens.profile.versionId, run.baseProfile.versionId);
});

test('a key without evidence is left exactly at base while the demonstrated key moves', () => {
  const run = demo();
  const base = run.base;
  const expected = {
    speed_delta_urban: {
      target: base.actors[0]!.targetMps - 0.25,
      acceleration: base.actors[0]!.accelerationMps2,
      full: base.stop.rate.full,
    },
    desired_acceleration: {
      target: base.actors[0]!.targetMps,
      acceleration: 1.35,
      full: base.stop.rate.full,
    },
    stop_full_probability: {
      target: base.actors[0]!.targetMps,
      acceleration: base.actors[0]!.accelerationMps2,
      full: 29,
    },
  } as const;
  for (const key of EARLY_LOOP_KEYS) {
    const mixed = run.mixed[key];
    for (const other of EARLY_LOOP_KEYS) {
      const value = mixed.composed.values[other];
      close(value.base, run.baseProfile.parameters[other]);
      if (other === key) {
        assert.notEqual(value.value, value.base);
        close(value.blend, 0.25);
        continue;
      }
      // A plausible wrong implementation that defaults or reuses a candidate would move this.
      assert.equal(value.candidate, null);
      assert.equal(value.blend, 0);
      assert.equal(value.value, value.base);
      assert.notEqual(value.unchangedReason, null);
      assert.equal(mixed.tokens.profile.parameters[other], run.baseProfile.parameters[other]);
      assert.equal(mixed.tokens.profile.provenanceByParameter[other], 'BASE');
    }
    close(mixed.actors[0]!.targetMps, expected[key].target);
    close(mixed.actors[0]!.accelerationMps2, expected[key].acceleration);
    assert.equal(mixed.stop.rate.full, expected[key].full);
  }
});

test('no-evidence AUTO is numerically identical to the base profile', () => {
  const run = demo();
  const noEvidence = run.scenarios['no-evidence'];
  for (const key of EARLY_LOOP_KEYS) {
    const value = noEvidence.composed.values[key];
    assert.equal(value.candidate, null);
    assert.equal(value.blend, 0);
    assert.equal(value.value, run.baseProfile.parameters[key]);
    assert.equal(value.base, run.baseProfile.parameters[key]);
    assert.notEqual(value.unchangedReason, null);
  }
  const baseKeys = Object.keys(run.baseProfile.parameters);
  assert.equal(Object.keys(noEvidence.tokens.profile.parameters).length, baseKeys.length);
  for (const key of baseKeys) {
    assert.equal(noEvidence.tokens.profile.parameters[key], run.baseProfile.parameters[key]);
    assert.equal(
      noEvidence.tokens.profile.unitsByParameter[key],
      run.baseProfile.unitsByParameter[key],
    );
    assert.equal(
      noEvidence.tokens.profile.provenanceByParameter[key],
      run.baseProfile.provenanceByParameter[key],
    );
  }
  assert.equal(noEvidence.actors.length, run.base.actors.length);
  for (let index = 0; index < run.base.actors.length; index++) {
    close(noEvidence.actors[index]!.targetMps, run.base.actors[index]!.targetMps);
    close(noEvidence.actors[index]!.accelerationMps2, run.base.actors[index]!.accelerationMps2);
  }
  assert.equal(noEvidence.stop.rate.full, run.base.stop.rate.full);
  assert.equal(noEvidence.stop.canonical.role, run.base.stop.canonical.role);
  for (const outcome of noEvidence.stop.actors)
    close(outcome.probability, run.baseProfile.parameters.stop_full_probability);
  assert.equal(
    noEvidence.tokens.stop.stopFullProbability,
    run.baseProfile.parameters.stop_full_probability,
  );
  assert.equal(baseValue(noEvidence, 'stop_full_probability'), 0.6);
});
