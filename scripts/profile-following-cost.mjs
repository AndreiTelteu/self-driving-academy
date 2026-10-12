// Diagnostic microprofile only; not a hardware/budget/acceptance capture or baseline replacement.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { evaluateCruiseTarget } from '../src/autonomy/cruise-targets.ts';
import {
  compileFollowingProfile,
  evaluateFollowingTarget,
  getFollowingStats,
} from '../src/autonomy/following.ts';
import { followingProfile } from '../tests/autonomy/following-reference.ts';
import { createFollowingTargetFixture } from '../tests/autonomy/following-target-fixture.ts';
import { immutable } from './wheel-capture-source.mjs';
const profile = compileFollowingProfile(followingProfile()),
  fixture = createFollowingTargetFixture(
    profile.longitudinal.cruise,
    { id: 'car', incarnation: 1 },
    { sessionId: '048-diagnostic', worldEpoch: 0 },
  );
try {
  const frame = fixture.input(1, 5, 14, 4),
    input = {
      cruiseInput: frame.cruiseInput,
      roadContext: frame.roadContext,
      observation: frame.observation,
      profile,
    },
    base = frame.cruise;
  const spread = () =>
    Object.freeze({
      ...base,
      reason: 'FOLLOWING_PREFERENCE',
      targetMps: 4,
      postedDeviationMps: -6,
      exceedsLateralAdvisory: false,
    });
  const fixed = () =>
    Object.freeze({
      version: base.version,
      sessionId: base.sessionId,
      worldEpoch: base.worldEpoch,
      actor: base.actor,
      decisionTick: base.decisionTick,
      sourceTick: base.sourceTick,
      profileVersionId: base.profileVersionId,
      engineVersion: base.engineVersion,
      behaviorReason: base.behaviorReason,
      reason: 'FOLLOWING_PREFERENCE',
      targetMps: 4,
      preferredRoadMps: base.preferredRoadMps,
      preferredCurveMps: base.preferredCurveMps,
      preferredApproachMps: base.preferredApproachMps,
      styleTargetMps: base.styleTargetMps,
      postedDeviationMps: -6,
      mechanicalCoverageCapMps: base.mechanicalCoverageCapMps,
      mechanicalVersion: base.mechanicalVersion,
      lateralAdvisoryMps: base.lateralAdvisoryMps,
      exceedsLateralAdvisory: false,
    });
  assert.deepEqual(fixed(), spread());
  const functions = {
      cruise: () => evaluateCruiseTarget(frame.cruiseInput),
      following: () => evaluateFollowingTarget(input),
      spread,
      fixed,
    },
    descriptorCalls = {};
  for (const [name, fn] of Object.entries(functions)) {
    let count = 0;
    const original = Object.getOwnPropertyDescriptor;
    Object.getOwnPropertyDescriptor = (...args) => {
      count++;
      return original(...args);
    };
    try {
      for (let i = 0; i < 100; i++) fn();
    } finally {
      Object.getOwnPropertyDescriptor = original;
    }
    descriptorCalls[name] = count / 100;
  }
  const runs = [];
  for (let pass = 0; pass < 3; pass++) {
    const results = {};
    for (const name of pass % 2
      ? ['fixed', 'spread', 'following', 'cruise']
      : ['cruise', 'following', 'spread', 'fixed']) {
      const fn = functions[name];
      for (let i = 0; i < 1000; i++) fn();
      const begin = performance.now();
      for (let i = 0; i < 10000; i++) fn();
      results[name] = (performance.now() - begin) / 10000;
    }
    runs.push(results);
  }
  assert.equal(getFollowingStats().scratchRetainedFields, 0);
  const result = {
    scope:
      'DIAGNOSTIC_ONLY: synthetic repeated input, real-clock means and descriptor counts; not acceptance, full raw timing or fleet throughput.',
    descriptorCalls,
    meanMsPerCall: runs,
    stats: getFollowingStats(),
  };
  const label = process.argv[2];
  assert(/^[a-z0-9-]+$/.test(label));
  await immutable('Docs/Evidence/048-following/' + label + '.json', result);
  console.log(JSON.stringify(result));
} finally {
  fixture.dispose();
}
