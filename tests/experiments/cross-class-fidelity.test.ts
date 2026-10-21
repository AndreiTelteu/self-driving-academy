import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CROSS_CLASS_FIDELITY_VERSION,
  MECHANICAL_CAPABILITY_COPY_CODE,
  crossClassCapability,
  crossClassIds,
  crossClassKeys,
  crossClassStyleIds,
  crossClassStyleSources,
  crossClassStyleTarget,
  crossClassTolerances,
  crossClassTrendKeys,
  evaluateCrossClassFidelity,
  evaluateModeFidelity,
  generateClassDemonstration,
  unrepresentableBehaviourIds,
} from '../../src/experiments';
import {
  evaluateInverseLearning,
  generateDemonstration,
  knownProfiles,
} from '../../src/experiments';
import { estimateSpeedParameters } from '../../src/learning';
import { parameterDefinitions, parameterRegistry } from '../../src/profiles';
import type { KnownProfileTarget } from '../../src/experiments';

const report = evaluateCrossClassFidelity();

function runOf(style: string, classId: string) {
  const found = report.runs.find((entry) => entry.style === style && entry.classId === classId);
  assert.ok(found, `missing run ${style}/${classId}`);
  return found;
}

function trendOf(key: string) {
  const found = report.trend.find((entry) => entry.key === key);
  assert.ok(found, `missing trend ${key}`);
  return found;
}

test('106 declares two real classes, two 105-derived styles and eight keys', () => {
  assert.equal(report.version, CROSS_CLASS_FIDELITY_VERSION);
  assert.equal(CROSS_CLASS_FIDELITY_VERSION, '106-cross-class-fidelity-v1');
  assert.deepEqual([...crossClassIds], ['sedan', 'compact']);
  assert.deepEqual([...crossClassStyleIds], ['CAUTIOUS', 'ASSERTIVE']);
  assert.equal(crossClassKeys.length, 8);
  assert.equal(crossClassTrendKeys.length, 8);
  assert.equal(crossClassTolerances.length, 8);
  assert.equal(report.contract.keys.length, 8);
  assert.equal(report.contract.referenceClass, 'sedan');
  assert.equal(report.contract.toleranceSource, '105-inverse-learning-v1');
  assert.equal(report.runs.length, 4);
  assert.equal(report.trend.length, 8);
});

test('106 style targets are literally the 105 known-profile targets', () => {
  for (const style of crossClassStyleIds) {
    const profileId = crossClassStyleSources[style];
    const profile = knownProfiles.find((entry) => entry.profileId === profileId);
    assert.ok(profile, `missing 105 profile ${profileId}`);
    for (const key of crossClassKeys) {
      const target: KnownProfileTarget | undefined = profile.targets.find(
        (entry) => entry.key === key,
      );
      assert.ok(target, `105 profile ${profileId} has no target ${key}`);
      assert.equal(crossClassStyleTarget(style, key), target.value);
    }
  }
});

test('106 demonstrations are deterministic and use distinct derived seeds per class', () => {
  const sedan = generateClassDemonstration('ASSERTIVE', 'sedan', 'LONGITUDINAL');
  const compact = generateClassDemonstration('ASSERTIVE', 'compact', 'LONGITUDINAL');
  assert.deepEqual(sedan, generateClassDemonstration('ASSERTIVE', 'sedan', 'LONGITUDINAL'));
  assert.notEqual(sedan.seed, compact.seed);
  assert.equal(sedan.capability.classId, 'sedan');
  assert.equal(compact.capability.classId, 'compact');
  assert.notEqual(sedan.capability.maxAccelerationMps2, compact.capability.maxAccelerationMps2);
  assert.notDeepEqual(
    sedan.acceleration[0]!.normalized.features.raw,
    compact.acceleration[0]!.normalized.features.raw,
  );
  assert.throws(() => generateClassDemonstration('UNKNOWN' as never, 'sedan', 'FREE_FLOW'));
  assert.throws(() => generateClassDemonstration('CAUTIOUS', 'van' as never, 'FREE_FLOW'));
  assert.throws(() => generateClassDemonstration('CAUTIOUS', 'sedan', 'UNKNOWN' as never));
});

test('106 same style demand normalizes to the same fraction while raw SI differs', () => {
  for (const style of crossClassStyleIds) {
    const sedan = runOf(style, 'sedan');
    const compact = runOf(style, 'compact');
    for (const channel of ['acceleration', 'deceleration', 'lateral'] as const) {
      const difference = Math.abs(
        sedan.mechanical.normalizedP50[channel] - compact.mechanical.normalizedP50[channel],
      );
      assert.ok(difference <= 0.05, `${style}/${channel} normalized difference ${difference}`);
    }
    for (const channel of ['accelerationMps2', 'decelerationMps2', 'lateralMps2'] as const) {
      const difference = Math.abs(
        sedan.mechanical.rawP50[channel] - compact.mechanical.rawP50[channel],
      );
      assert.ok(difference > 0.05, `${style}/${channel} raw difference ${difference}`);
    }
  }
});

test('106 both classes preserve the cautious < assertive style ordering', () => {
  assert.equal(report.trendPreserved, true);
  for (const row of report.trend) {
    assert.equal(row.classOrderPreserved.sedan, true, `${row.key} sedan order`);
    assert.equal(row.classOrderPreserved.compact, true, `${row.key} compact order`);
    assert.equal(row.orderPreserved, true, `${row.key} combined order`);
  }
  const acceleration = trendOf('desired_acceleration');
  assert.ok(acceleration.estimates.sedan.cautious! < acceleration.estimates.sedan.assertive!);
  assert.ok(acceleration.estimates.compact.cautious! < acceleration.estimates.compact.assertive!);
  const reaction = trendOf('brake_reaction_delay');
  assert.ok(reaction.estimates.sedan.cautious! > reaction.estimates.sedan.assertive!);
  assert.ok(reaction.estimates.compact.cautious! > reaction.estimates.compact.assertive!);
});

test('106 normalized estimates agree across classes within every per-key tolerance', () => {
  assert.equal(report.normalizedAgreement, true);
  for (const row of report.trend) {
    assert.equal(row.normalizedAgreement, true, `${row.key} agreement ${row.agreement}`);
    assert.ok(row.agreement <= row.tolerance.effective, `${row.key} outside its tolerance`);
  }
  const curve = trendOf('curve_lateral_accel');
  assert.equal(curve.tolerance.source, '106-CLASS-RECONSTRUCTION');
  assert.ok(curve.tolerance.effective > curve.agreement);
});

test('106 raw mechanical values differ and are never copied into the common profile', () => {
  assert.equal(report.mechanicalCopied, false);
  assert.equal(report.mechanicalCopyCode, null);
  for (const style of crossClassStyleIds) {
    const row = trendOf('desired_acceleration');
    assert.equal(row.mechanical?.differs, true, `${style} raw values must differ`);
    const profile = report.commonProfiles.find((entry) => entry.style === style);
    assert.ok(profile);
    assert.equal(profile.mechanicalCopied, false);
    assert.deepEqual(profile.copiedKeys, []);
  }
  const rawAcceleration = runOf('ASSERTIVE', 'compact').mechanical.rawP50.accelerationMps2;
  assert.notEqual(
    report.commonProfiles.find((entry) => entry.style === 'ASSERTIVE')!.parameters
      .desired_acceleration,
    rawAcceleration,
  );
});

test('106 injecting a class ceiling as a profile value is flagged as MECHANICAL_CAPABILITY_COPIED', () => {
  const ceiling = crossClassCapability('sedan').maxAccelerationMps2;
  const injected = evaluateCrossClassFidelity({
    commonProfileOverrides: { desired_acceleration: ceiling },
  });
  assert.equal(injected.mechanicalCopied, true);
  assert.equal(injected.mechanicalCopyCode, MECHANICAL_CAPABILITY_COPY_CODE);
  assert.equal(injected.overall.pass, false);
  for (const profile of injected.commonProfiles) {
    assert.equal(profile.mechanicalCopied, true);
    assert.ok(profile.copiedKeys.includes('desired_acceleration'));
    assert.ok(profile.copyFindings.some((finding) => finding.source === 'CLASS_CAPABILITY'));
  }
});

test('106 the common profile applies identically to TAXI and CIVILIAN without class overrides', () => {
  for (const profile of report.commonProfiles) {
    assert.equal(profile.sameAcrossDriverKinds, true);
    assert.equal(profile.appliedToBothClasses, true);
    assert.equal(profile.fleetApplication.length, 2);
    assert.deepEqual(
      profile.fleetApplication.map((application) => application.driverKind),
      ['TAXI', 'CIVILIAN'],
    );
    const [taxi, civilian] = profile.fleetApplication;
    assert.deepEqual(taxi!.parameters, civilian!.parameters);
    assert.deepEqual([...taxi!.classes], ['sedan', 'compact']);
    assert.deepEqual([...civilian!.classes], ['sedan', 'compact']);
    for (const application of profile.fleetApplication)
      assert.equal(application.classSpecificOverrides.length, 0);
  }
  assert.equal(report.overall.commonProfileSameAcrossKinds, true);
  assert.equal(report.overall.commonProfileNoClassOverrides, true);
});

test('106 the same route in MANUAL never changes the profile', () => {
  const manual = evaluateModeFidelity({ mode: 'MANUAL', eligible: false, sameRoute: true });
  assert.equal(manual.reason, 'MANUAL_NO_LEARNING');
  assert.equal(manual.profileChanged, false);
  assert.equal(manual.candidate, null);
  assert.equal(manual.versionId, null);
  assert.equal(manual.delta, null);
  assert.equal(manual.gate.status, 'REJECTED');
  assert.equal(manual.gate.reason, 'MANUAL_SEGMENT_NOT_LEARNABLE');
  assert.equal(manual.publication.published, false);
  assert.equal(manual.publication.storeWrites, 0);
});

test('106 eligible LEARNING on the same route produces a candidate tied to real evidence', () => {
  const learning = evaluateModeFidelity({ mode: 'LEARNING', eligible: true, sameRoute: true });
  assert.equal(learning.reason, 'LEARNING_ACCEPTED');
  assert.equal(learning.profileChanged, true);
  assert.equal(learning.gate.status, 'VALID');
  assert.ok(learning.candidate !== null);
  assert.ok(learning.versionId !== null);
  assert.ok(learning.delta !== null);
  assert.equal(learning.delta.published, false);
  assert.equal(learning.delta.learned, false);
  assert.equal(learning.evidence?.status, 'READY');
  assert.equal(learning.evidence?.distinctEpisodes, 4);
  assert.ok(learning.delta.learningWeight > 0);
  assert.equal(learning.publication.published, false);
  assert.equal(learning.publication.storeWrites, 0);
  assert.equal(learning.publication.fleetMutations, 0);
});

test('106 ineligible LEARNING never changes the profile', () => {
  const ineligible = evaluateModeFidelity({
    mode: 'LEARNING',
    eligible: false,
    sameRoute: true,
  });
  assert.equal(ineligible.reason, 'INELIGIBLE');
  assert.equal(ineligible.profileChanged, false);
  assert.equal(ineligible.candidate, null);
  assert.equal(ineligible.versionId, null);
  assert.equal(ineligible.delta, null);
  assert.equal(ineligible.gate.status, 'REJECTED');
  assert.equal(ineligible.gate.reason, 'SEGMENT_INELIGIBLE');
});

test('106 MANUAL and LEARNING share an identical physical route and state', () => {
  const manual = evaluateModeFidelity({ mode: 'MANUAL', eligible: false, sameRoute: true });
  const learning = evaluateModeFidelity({ mode: 'LEARNING', eligible: true, sameRoute: true });
  assert.deepEqual(manual.route, learning.route);
  assert.equal(manual.route.routeDigest, learning.route.routeDigest);
  assert.equal(manual.route.observationDigest, learning.route.observationDigest);
  assert.equal(report.modeFidelity.routeIdentical, true);
  assert.equal(report.overall.sameRoute, true);
  const split = evaluateModeFidelity({
    mode: 'LEARNING',
    eligible: true,
    sameRoute: false,
  });
  assert.notEqual(split.route.routeDigest, manual.route.routeDigest);
});

test('106 an out-of-scope manoeuvre is UNREPRESENTABLE with null estimate and no fabricated key', () => {
  assert.equal(report.unrepresentable.length, unrepresentableBehaviourIds.length);
  assert.deepEqual(
    report.unrepresentable.map((entry) => entry.behaviour),
    [...unrepresentableBehaviourIds],
  );
  for (const entry of report.unrepresentable) {
    assert.equal(entry.result, 'UNREPRESENTABLE');
    assert.equal(entry.estimate, null);
    assert.equal(entry.key, null);
    assert.equal(entry.value, null);
    assert.ok(entry.reason.length > 0);
    assert.ok(entry.detail.length > 0);
  }
  assert.equal(report.outOfScopeManoeuvre.behaviour, 'HAZARD_AVOIDANCE');
  assert.equal(report.outOfScopeManoeuvre.manoeuvre, 'EVASIVE_SWERVE_AROUND_HAZARD');
  assert.equal(report.outOfScopeManoeuvre.result, 'UNREPRESENTABLE');
  assert.equal(report.outOfScopeManoeuvre.estimate, null);
  assert.equal(
    report.unrepresentable.some((entry) => 'key' in entry && entry.key === null),
    true,
  );
});

test('106 reuses the 105 harness and the real 094 estimator instead of a private model', () => {
  const demonstration = generateDemonstration('PRUDENT', 'FREE_FLOW');
  const speed = estimateSpeedParameters(demonstration.evidence, demonstration.observations.speed);
  const inverse = evaluateInverseLearning();
  const prudent = inverse.scenarios.find((scenario) => scenario.scenarioId === 'PROFILE_PRUDENT');
  assert.ok(prudent);
  const recovered = prudent.results.find((entry) => entry.key === 'speed_delta_urban');
  assert.ok(recovered);
  assert.equal(speed.candidates.speed_delta_urban.value, recovered.estimate);
  assert.equal(speed.candidates.speed_delta_urban.status, 'CANDIDATE');
});

test('106 is deterministic and never uses Math.random or a wall clock', () => {
  assert.equal(
    JSON.stringify(evaluateCrossClassFidelity()),
    JSON.stringify(evaluateCrossClassFidelity()),
  );
  const source = readFileSync('src/experiments/cross-class-fidelity.ts', 'utf8');
  assert.ok(!source.includes('Math.random('));
  assert.ok(source.includes('randomUnit'));
  assert.ok(source.includes('deriveScenarioSeed'));
  assert.ok(!source.includes('Date.now'));
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.runs), true);
  assert.equal(Object.isFrozen(report.overall), true);
  assert.equal(Object.isFrozen(report.modeFidelity.learningEligible), true);
});

test('106 never mutates the registry, fleet kinds or publication state', () => {
  const definitionsBefore = JSON.stringify(parameterDefinitions);
  const estimableBefore = parameterDefinitions.map((entry) => entry.estimable);
  const first = evaluateCrossClassFidelity();
  const second = evaluateCrossClassFidelity();
  assert.equal(JSON.stringify(parameterDefinitions), definitionsBefore);
  assert.deepEqual(
    parameterDefinitions.map((entry) => entry.estimable),
    estimableBefore,
  );
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.overall.storeWrites, 0);
  assert.equal(first.overall.fleetMutations, 0);
  assert.equal(first.overall.profilePublications, 0);
  assert.equal(parameterRegistry.speed_delta_urban.estimable, false);
  assert.equal(parameterRegistry.desired_acceleration.estimable, false);
  for (const run of first.runs) for (const row of run.keys) assert.ok(row.tolerance.effective > 0);
});

test('106 report counts and frozen rows sum to the per-run results', () => {
  assert.equal(report.overall.styles, 2);
  assert.equal(report.overall.classes, 2);
  assert.equal(report.overall.runs, 4);
  assert.equal(report.overall.keys, 8);
  assert.equal(report.overall.keyRows, 32);
  const rows = report.runs.reduce((total, run) => total + run.keys.length, 0);
  assert.equal(rows, report.overall.keyRows);
  for (const run of report.runs) {
    assert.equal(run.keys.length, crossClassKeys.length);
    assert.equal(run.mechanical.episodeCount, 4);
    assert.equal(run.demonstrationSeeds.freeFlow >= 0, true);
    assert.equal(run.demonstrationSeeds.longitudinal >= 0, true);
  }
  assert.equal(report.classes.length, 2);
  assert.equal(report.modeFidelity.manualMatchesActualGate, true);
  assert.equal(report.modeFidelity.learningEligibleMatchesActualGate, true);
  assert.equal(report.modeFidelity.learningIneligibleMatchesActualGate, true);
  assert.equal(report.overall.pass, true);
});
