import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  evaluateInverseLearning,
  generateDemonstration,
  INVERSE_LEARNING_VERSION,
  inverseIdentifiabilityRules,
  inverseProfileIds,
  inverseScenarioIds,
  inverseTolerances,
  knownProfiles,
  realInverseLearningPorts,
  scenarioOwners,
} from '../../src/experiments';
import type {
  InverseLearningPorts,
  InverseLearningReport,
  InverseScenarioResult,
} from '../../src/experiments';
import { estimateSpeedParameters, parameterEvidenceSpecs } from '../../src/learning';
import { parameterDefinitions } from '../../src/profiles';

const M_KEYS = parameterEvidenceSpecs.map((spec) => spec.key);
const report = evaluateInverseLearning();

function scenario(alias: string): InverseScenarioResult {
  const found = report.scenarios.find((entry) => entry.scenarioId === alias);
  assert.ok(found, `missing scenario ${alias}`);
  return found;
}

function keyOf(alias: string, key: string) {
  const found = scenario(alias).results.find((entry) => entry.key === key);
  assert.ok(found, `missing ${alias}/${key}`);
  return found;
}

test('105 declares four known profiles with exactly the 24 M-key targets', () => {
  assert.deepEqual(
    knownProfiles.map((profile) => profile.profileId),
    [...inverseProfileIds],
  );
  for (const profile of knownProfiles) {
    assert.equal(profile.targets.length, 24);
    assert.deepEqual(profile.targets.map((entry) => entry.key).sort(), [...M_KEYS].sort());
    for (const target of profile.targets) {
      const spec = parameterEvidenceSpecs.find((entry) => entry.key === target.key);
      assert.ok(spec, `unknown key ${target.key}`);
      assert.ok(target.value >= spec.min && target.value <= spec.max);
    }
  }
  // R/extension keys are absent from every fixture.
  const extensionKeys = parameterDefinitions
    .filter((entry) => entry.implementationStage === 'extension')
    .map((entry) => entry.key);
  assert.ok(extensionKeys.length > 0);
  for (const profile of knownProfiles)
    assert.ok(profile.targets.every((entry) => !extensionKeys.includes(entry.key)));
});

test('105 every M key has one explicit tolerance and a concrete justification', () => {
  assert.equal(inverseTolerances.length, 24);
  assert.deepEqual(inverseTolerances.map((entry) => entry.key).sort(), [...M_KEYS].sort());
  const signatures = new Set<string>();
  const justifications = new Set<string>();
  for (const entry of inverseTolerances) {
    assert.ok(entry.absoluteTolerance >= 0);
    assert.ok(entry.relativeTolerance >= 0);
    assert.ok(entry.absoluteTolerance + entry.relativeTolerance > 0);
    assert.ok(entry.justifiedBy.length > 40, `${entry.key} justification is too thin`);
    assert.ok(entry.context.length > 10);
    signatures.add(`${entry.absoluteTolerance}:${entry.relativeTolerance}`);
    justifications.add(entry.justifiedBy);
  }
  assert.ok(signatures.size > 8, 'tolerances must not be one uniform default');
  assert.equal(justifications.size, 24, 'each justification must be key-specific');
});

test('105 identifiability rules cover every key and mark varied-speed and opposed-outcome needs', () => {
  assert.equal(inverseIdentifiabilityRules.length, 24);
  assert.deepEqual(
    inverseIdentifiabilityRules.map((entry) => entry.key).sort(),
    [...M_KEYS].sort(),
  );
  const varied = inverseIdentifiabilityRules
    .filter((entry) => entry.requiresVariedSpeeds)
    .map((entry) => entry.key);
  assert.deepEqual(varied.sort(), [
    'following_min_gap',
    'following_speed_gain',
    'following_time_headway',
  ]);
  const opposed = inverseIdentifiabilityRules
    .filter((entry) => entry.requiresOpposedOutcomes)
    .map((entry) => entry.key);
  assert.deepEqual(opposed.sort(), [
    'lane_change_back_gap',
    'lane_change_front_gap',
    'lane_change_speed_gain',
    'yield_time_gap',
  ]);
});

test('105 runs all four profiles through the real estimators with 24/24 keys inside tolerance', () => {
  for (const profile of inverseProfileIds) {
    const entry = scenario(`PROFILE_${profile}`);
    assert.equal(entry.kind, 'PROFILE');
    assert.equal(entry.keys, 24);
    assert.equal(entry.results.length, 24);
    assert.equal(entry.outsideTolerance, 0, `${profile} has an outside-tolerance key`);
    assert.equal(entry.noEstimate, 0);
    assert.equal(entry.passed, true);
    assert.equal(entry.withinTolerance, 24);
  }
});

test('105 every evaluated key result is derived from a real estimator candidate', () => {
  for (const entry of report.scenarios)
    for (const result of entry.results) {
      assert.ok(
        ['CANDIDATE', 'UNOBSERVED', 'UNIDENTIFIED', 'REFUSED'].includes(result.estimatorStatus),
        `unexpected estimator status ${result.estimatorStatus}`,
      );
      if (result.status === 'WITHIN_TOLERANCE' && result.estimate !== null)
        assert.ok(result.absoluteError! <= result.tolerance.effective + 1e-9);
      if (result.interval !== null)
        assert.ok(result.interval[0] <= result.interval[1], 'reported intervals must be coherent');
    }
});

test('105 prudent, impulsive, reckless and mixed estimates are distinguishable where identified', () => {
  const values = (key: string) =>
    inverseProfileIds.map((profile) => keyOf(`PROFILE_${profile}`, key).estimate);
  for (const key of ['speed_delta_urban', 'desired_acceleration', 'following_time_headway']) {
    const estimates = values(key);
    assert.ok(
      estimates.every((value) => value !== null),
      `${key} must be numeric`,
    );
    assert.equal(new Set(estimates).size, 4, `${key} must separate the four profiles`);
  }
  assert.ok(values('speed_delta_urban')[0]! < values('speed_delta_urban')[2]!);
  assert.ok(values('desired_acceleration')[0]! < values('desired_acceleration')[2]!);
  assert.ok(values('following_time_headway')[0]! > values('following_time_headway')[2]!);
  // Interval keys separate the profiles through their observed interval.
  const gaps = inverseProfileIds.map(
    (profile) => keyOf(`PROFILE_${profile}`, 'lane_change_front_gap').interval,
  );
  assert.ok(gaps.every((interval) => interval !== null));
  assert.notDeepEqual(gaps[0], gaps[1]);
  assert.notDeepEqual(gaps[2], gaps[3]);
});

test('105 demonstrations are independent scenario streams with deterministic seeds', () => {
  const seeds = new Set<number>();
  for (const scenarioId of inverseScenarioIds) {
    const demonstration = generateDemonstration('PRUDENT', scenarioId);
    assert.equal(demonstration.scenarioId, scenarioId);
    assert.equal(demonstration.owner, scenarioOwners[scenarioId]);
    assert.deepEqual(
      [...demonstration.contributingKeys].sort(),
      parameterEvidenceSpecs
        .filter((spec) => spec.estimatorOwner === scenarioOwners[scenarioId])
        .map((spec) => spec.key)
        .sort(),
    );
    seeds.add(demonstration.seed);
  }
  assert.equal(seeds.size, inverseScenarioIds.length);
  assert.deepEqual(
    generateDemonstration('MIXED', 'FREE_FLOW'),
    generateDemonstration('MIXED', 'FREE_FLOW'),
  );
  assert.notEqual(
    generateDemonstration('PRUDENT', 'FREE_FLOW').seed,
    generateDemonstration('MIXED', 'FREE_FLOW').seed,
  );
});

test('105 generated observations are the input of the real 094 estimator', () => {
  const demonstration = generateDemonstration('RECKLESS', 'FREE_FLOW');
  const result = estimateSpeedParameters(demonstration.evidence, demonstration.observations.speed);
  const target = keyOf('PROFILE_RECKLESS', 'speed_delta_urban').target;
  assert.ok(Math.abs(result.candidates.speed_delta_urban.value! - target) <= 0.2);
  assert.equal(
    result.candidates.speed_delta_urban.value,
    keyOf('PROFILE_RECKLESS', 'speed_delta_urban').estimate,
  );
});

test('105 sparse evidence identifies nothing and never returns a fabricated estimate', () => {
  const sparse = scenario('SPARSE_EVIDENCE');
  assert.equal(sparse.probe, 'SPARSE_EVIDENCE');
  assert.equal(sparse.results.length, 24);
  assert.equal(sparse.withinTolerance, 0);
  assert.equal(sparse.notIdentifiable, 24);
  assert.equal(sparse.outsideTolerance, 0);
  assert.ok(sparse.results.every((result) => result.estimate === null));
  assert.ok(sparse.results.every((result) => result.interval === null));
  for (const key of ['following_time_headway', 'red_stop_probability', 'lane_change_front_gap']) {
    const result = keyOf('SPARSE_EVIDENCE', key);
    assert.equal(result.status, 'NOT_IDENTIFIABLE');
    assert.equal(result.estimate, null);
    assert.equal(result.identifiable, false);
  }
  assert.equal(keyOf('SPARSE_EVIDENCE', 'following_time_headway').evidence.status, 'INSUFFICIENT');
  assert.equal(keyOf('SPARSE_EVIDENCE', 'lane_change_front_gap').evidence.status, 'NO_EVIDENCE');
});

test('105 contradictory evidence stays unidentifiable instead of being averaged', () => {
  const contradictory = scenario('CONTRADICTORY_EVIDENCE');
  assert.equal(contradictory.outsideTolerance, 0);
  for (const key of [
    'following_time_headway',
    'following_min_gap',
    'yield_time_gap',
    'lane_change_front_gap',
    'lane_change_back_gap',
    'lane_change_speed_gain',
  ]) {
    const result = keyOf('CONTRADICTORY_EVIDENCE', key);
    assert.equal(result.status, 'NOT_IDENTIFIABLE');
    assert.equal(result.reason, 'CONTRADICTORY_EVIDENCE');
    assert.equal(result.estimate, null);
    assert.equal(result.interval, null);
  }
});

test('105 rejects an injected precise value for an unidentifiable key', () => {
  const injected: InverseLearningPorts = Object.freeze({
    ...realInverseLearningPorts,
    following: ((evidence, observations) => {
      const real = realInverseLearningPorts.following(evidence, observations);
      return Object.freeze({
        ...real,
        candidates: Object.freeze({
          ...real.candidates,
          following_time_headway: Object.freeze({
            ...real.candidates.following_time_headway,
            status: 'CANDIDATE' as const,
            value: 2.5,
            quality: 1,
          }),
        }),
      });
    }) as InverseLearningPorts['following'],
  });
  const injectedReport = evaluateInverseLearning({ ports: injected });
  const result = injectedReport.scenarios
    .find((entry) => entry.scenarioId === 'SPARSE_EVIDENCE')!
    .results.find((entry) => entry.key === 'following_time_headway')!;
  assert.equal(result.status, 'NOT_IDENTIFIABLE');
  assert.equal(result.estimate, null);
  assert.equal(result.identifiable, false);
  assert.equal(result.reason, 'UNIDENTIFIABLE_ESTIMATOR_VALUE_REJECTED');
});

test('105 reports a deliberately wrong estimate as an outside-tolerance failure', () => {
  const probe = scenario('OUT_OF_TOLERANCE_PROBE');
  assert.equal(probe.probe, 'OUT_OF_TOLERANCE');
  assert.equal(probe.expectedFailure, true);
  assert.equal(probe.outsideTolerance, 1);
  assert.equal(probe.passed, true, 'the detector works when it retains the failure');
  assert.deepEqual(probe.retainedFailures, ['speed_delta_urban:OUTSIDE_TOLERANCE']);
  const result = keyOf('OUT_OF_TOLERANCE_PROBE', 'speed_delta_urban');
  assert.equal(result.status, 'OUTSIDE_TOLERANCE');
  assert.ok(result.estimate !== null);
  assert.ok(result.absoluteError! > result.tolerance.effective);
  assert.ok(report.overall.retainedProbeFailures >= 1);
});

test('105 is deterministic across two runs and never uses Math.random', () => {
  assert.equal(
    JSON.stringify(evaluateInverseLearning()),
    JSON.stringify(evaluateInverseLearning()),
  );
  const source = readFileSync('src/experiments/inverse-learning.ts', 'utf8');
  assert.ok(!source.includes('Math.random('));
  assert.ok(source.includes('randomUnit'));
  assert.ok(source.includes(INVERSE_LEARNING_VERSION));
});

test('105 does not mutate the parameter registry or the known-profile fixtures', () => {
  const before = JSON.stringify(parameterDefinitions);
  const frozenKnown = JSON.stringify(knownProfiles);
  evaluateInverseLearning();
  assert.equal(JSON.stringify(parameterDefinitions), before);
  assert.equal(JSON.stringify(knownProfiles), frozenKnown);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.scenarios), true);
  assert.equal(Object.isFrozen(report.overall), true);
  assert.ok(
    parameterDefinitions
      .filter((definition) => definition.implementationStage === 'initial_learning_target')
      .every((definition) => definition.estimable === false),
  );
});

test('105 aggregate counts match the per-key results of every scenario', () => {
  const sum = (predicate: (status: string) => boolean) =>
    report.scenarios.reduce(
      (total, entry) => total + entry.results.filter((result) => predicate(result.status)).length,
      0,
    );
  assert.equal(report.contract.keys.length, 24);
  assert.equal(report.overall.keysEvaluated, report.scenarios.length * 24);
  assert.equal(
    report.overall.withinTolerance,
    sum((status) => status === 'WITHIN_TOLERANCE'),
  );
  assert.equal(
    report.overall.outsideTolerance,
    sum((status) => status === 'OUTSIDE_TOLERANCE'),
  );
  assert.equal(
    report.overall.notIdentifiable,
    sum((status) => status === 'NOT_IDENTIFIABLE'),
  );
  assert.equal(
    report.overall.noEstimate,
    sum((status) => status === 'NO_ESTIMATE'),
  );
  for (const entry of report.scenarios) {
    assert.equal(
      entry.withinTolerance + entry.outsideTolerance + entry.notIdentifiable + entry.noEstimate,
      entry.results.length,
    );
    assert.equal(entry.keys, entry.results.length);
    assert.equal(entry.retainedFailures.length, entry.outsideTolerance + entry.noEstimate);
  }
  assert.equal(report.overall.profileFailures, 0);
});

test('105 unknown profiles and scenarios fail closed', () => {
  assert.throws(
    () => generateDemonstration('UNKNOWN' as never, 'FREE_FLOW'),
    /Unknown inverse profile/,
  );
  assert.throws(
    () => generateDemonstration('PRUDENT', 'UNKNOWN' as never),
    /Unknown inverse scenario/,
  );
  assert.notEqual(JSON.stringify(report), '{}');
});

test('105 report retains every NOT_IDENTIFIABLE result without a numeric estimate', () => {
  const base: InverseLearningReport = report;
  for (const entry of base.scenarios)
    for (const result of entry.results)
      if (result.status === 'NOT_IDENTIFIABLE') {
        assert.equal(result.estimate, null);
        assert.equal(result.interval, null);
        assert.equal(result.identifiable, false);
      }
});
