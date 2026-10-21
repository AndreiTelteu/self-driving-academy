import assert from 'node:assert/strict';
import test from 'node:test';
import {
  learningGate24Markdown,
  readLearningGate24,
  runInverseLearningValidation,
  runLearningEdgeCaseRegressions,
} from '../../src/app';
import {
  LEARNING_GATE24_VERSION,
  gateEstimatorKeySets,
  learningGate24MKeys,
  learningGate24Reasons,
} from '../../src/experiments';
import type {
  GateEstimatorKeySet,
  InverseEvaluationStatus,
  InverseScenarioResult,
  LearningGate24Input,
  LearningGate24Report,
} from '../../src/experiments';
import { parameterEvidenceSpecs } from '../../src/learning';
import type { ParameterEvidenceSpec } from '../../src/learning';
import { parameterDefinitions, parameterRegistry } from '../../src/profiles';
import { opportunityKinds } from '../../src/telemetry';

const inverse = runInverseLearningValidation();
const edgeCases = runLearningEdgeCaseRegressions();
const report = readLearningGate24({ inverseReport: inverse, edgeCaseReport: edgeCases });
const specByKey = new Map(parameterEvidenceSpecs.map((spec) => [spec.key, spec]));
const registryMKeys = parameterDefinitions
  .filter((definition) => definition.implementationStage === 'initial_learning_target')
  .map((definition) => definition.key);

function injected(matrix: LearningGate24Input): LearningGate24Report {
  return readLearningGate24({ matrix, inverseReport: inverse, edgeCaseReport: edgeCases });
}

function rowOf(target: LearningGate24Report, key: string) {
  const row = target.matrix.find((entry) => entry.key === key);
  assert.ok(row, `missing gate row ${key}`);
  return row;
}

function withoutEstimatorKey(key: string): GateEstimatorKeySet[] {
  return gateEstimatorKeySets.map((entry) => ({
    owner: entry.owner,
    keys: entry.keys.filter((candidate) => candidate !== key),
  }));
}

function withoutSpec(key: string): ParameterEvidenceSpec[] {
  return parameterEvidenceSpecs.filter((spec) => spec.key !== key);
}

function withoutScenarioKey(key: string): InverseScenarioResult[] {
  return inverse.scenarios.map((scenario) => ({
    ...scenario,
    results: scenario.results.filter((row) => row.key !== key),
  }));
}

function withScenarioStatus(
  scenarioId: string,
  key: string,
  status: InverseEvaluationStatus,
): InverseScenarioResult[] {
  return inverse.scenarios.map((scenario) =>
    scenario.scenarioId === scenarioId
      ? {
          ...scenario,
          results: scenario.results.map((row) => (row.key === key ? { ...row, status } : row)),
        }
      : scenario,
  );
}

test('108 derives exactly the 24 M keys, with no R keys and no duplicates', () => {
  assert.equal(report.version, LEARNING_GATE24_VERSION);
  assert.equal(learningGate24MKeys.length, 24);
  assert.equal(report.matrix.length, 24);
  assert.deepEqual(
    report.matrix.map((row) => row.key),
    registryMKeys,
  );
  assert.equal(new Set(report.matrix.map((row) => row.key)).size, 24);
  for (const row of report.matrix) {
    assert.equal(parameterRegistry[row.key].implementationStage, 'initial_learning_target');
    assert.equal(row.implementationStage, 'initial_learning_target');
  }
  assert.equal(
    report.matrix.some((row) => String(row.key).includes('arterial')),
    false,
  );
  assert.equal(report.mKeySetMatches092, true);
  assert.deepEqual(report.duplicateMKeys, []);
  assert.deepEqual(report.foreignKeys, []);
  assert.deepEqual(report.matrixErrors, []);
});

test('108 every real M key resolves estimator, 093 spec, opportunity, 105 scenario and 107 coverage', () => {
  for (const row of report.matrix) {
    const spec = specByKey.get(row.key);
    assert.ok(spec, `missing 093 spec ${row.key}`);
    assert.ok(row.estimatorOwner, `missing estimator ${row.key}`);
    assert.equal(row.channel, spec.channel);
    assert.deepEqual(row.contexts, spec.contexts);
    assert.equal(row.unit, spec.unit);
    assert.ok(row.opportunities.length > 0, `missing opportunity ${row.key}`);
    assert.equal(row.scenarios.length, 4);
    assert.equal(row.scenariosWithinTolerance, 4);
    assert.ok(row.edgeCaseIds.length > 0, `missing edge case ${row.key}`);
    assert.equal(row.validated, true);
    assert.deepEqual(row.reasons, []);
  }
});

test('108 the current real data closes the gate at 24/24 without hiding a failure', () => {
  assert.equal(report.gateStatus, 'CLOSED');
  assert.equal(report.counts.validated, 24);
  assert.equal(report.counts.unvalidated, 0);
  assert.equal(report.counts.matrixRows, 24);
  assert.deepEqual(report.unvalidated, []);
  assert.equal(
    report.gateStatus === 'CLOSED',
    report.unvalidated.length === 0 && report.mKeySetMatches092 && report.matrixErrors.length === 0,
  );
});

test('108 a missing estimator leaves the key unvalidated and the gate OPEN', () => {
  const target = injected({ estimatorKeySets: withoutEstimatorKey('lane_change_cooldown') });
  const row = rowOf(target, 'lane_change_cooldown');
  assert.equal(target.gateStatus, 'OPEN');
  assert.equal(row.estimatorOwner, null);
  assert.deepEqual(row.reasons, ['NO_ESTIMATOR']);
  assert.deepEqual(target.unvalidated, [
    { key: 'lane_change_cooldown', reasons: ['NO_ESTIMATOR'] },
  ]);
  assert.equal(target.counts.validated, 23);
});

test('108 a missing 093 evidence spec leaves the key unvalidated and the gate OPEN', () => {
  const target = injected({ evidenceSpecs: withoutSpec('stop_dwell_time') });
  const row = rowOf(target, 'stop_dwell_time');
  assert.equal(target.gateStatus, 'OPEN');
  assert.equal(row.channel, null);
  assert.deepEqual(row.contexts, []);
  assert.deepEqual(row.reasons, ['NO_EVIDENCE_SPEC']);
  assert.deepEqual(target.unvalidated, [{ key: 'stop_dwell_time', reasons: ['NO_EVIDENCE_SPEC'] }]);
});

test('108 a missing 086 opportunity kind leaves the key unvalidated and the gate OPEN', () => {
  const target = injected({
    opportunityKinds: opportunityKinds.filter((kind) => kind !== 'RED' && kind !== 'LANE_CHANGE'),
  });
  assert.equal(target.gateStatus, 'OPEN');
  assert.deepEqual(rowOf(target, 'red_stop_probability').reasons, ['NO_OPPORTUNITY']);
  assert.deepEqual(rowOf(target, 'late_red_brake_threshold').reasons, ['NO_OPPORTUNITY']);
  assert.deepEqual(rowOf(target, 'lane_change_cooldown').reasons, ['NO_OPPORTUNITY']);
  assert.equal(rowOf(target, 'green_start_delay').validated, true);
  assert.deepEqual(
    target.unvalidated.map((entry) => entry.key),
    [
      'red_stop_probability',
      'red_stop_line_offset',
      'late_red_brake_threshold',
      'lane_change_front_gap',
      'lane_change_back_gap',
      'lane_change_speed_gain',
      'lane_change_cooldown',
    ],
  );
});

test('108 a missing 105 scenario row is NO_SCENARIO, not an assumed pass', () => {
  const target = injected({ inverseScenarios: withoutScenarioKey('green_start_delay') });
  const row = rowOf(target, 'green_start_delay');
  assert.equal(target.gateStatus, 'OPEN');
  assert.deepEqual(row.scenarios, []);
  assert.equal(row.scenariosWithinTolerance, 0);
  assert.deepEqual(row.reasons, ['NO_SCENARIO']);
  assert.equal(target.unvalidated[0]?.key, 'green_start_delay');
});

test('108 a failed 105 scenario is retained as SCENARIO_FAILED', () => {
  const target = injected({
    inverseScenarios: withScenarioStatus(
      'PROFILE_PRUDENT',
      'speed_delta_urban',
      'OUTSIDE_TOLERANCE',
    ),
  });
  const row = rowOf(target, 'speed_delta_urban');
  assert.equal(target.gateStatus, 'OPEN');
  assert.equal(row.scenarios.length, 4);
  assert.equal(row.scenariosWithinTolerance, 3);
  assert.deepEqual(row.reasons, ['SCENARIO_FAILED']);
  assert.equal(
    row.scenarios.find((entry) => entry.profileId === 'PRUDENT')?.status,
    'OUTSIDE_TOLERANCE',
  );
});

test('108 a missing 107 context case is NO_EDGE_CASE and keeps the gate OPEN', () => {
  const positiveWithoutLeader = edgeCases.cases.filter(
    (entry) => !(entry.kind === 'POSITIVE' && entry.contextsObserved.includes('LEADER')),
  );
  const target = injected({ edgeCases: positiveWithoutLeader });
  const row = rowOf(target, 'following_time_headway');
  assert.equal(target.gateStatus, 'OPEN');
  assert.deepEqual(row.edgeCaseIds, []);
  assert.deepEqual(row.reasons, ['NO_EDGE_CASE']);
  assert.equal(rowOf(target, 'speed_delta_urban').validated, true);
});

test('108 a duplicate estimator owner is DUPLICATE_OWNER and invalidates the key', () => {
  const target = injected({
    estimatorKeySets: [...gateEstimatorKeySets, { owner: '095', keys: ['speed_delta_urban'] }],
  });
  const row = rowOf(target, 'speed_delta_urban');
  assert.equal(target.gateStatus, 'OPEN');
  assert.deepEqual(row.estimatorOwners, ['094', '095']);
  assert.deepEqual(row.reasons, ['DUPLICATE_OWNER']);
  assert.equal(target.matrixErrors.length, 0);
});

test('108 a foreign estimator key is reported and opens the gate without inventing a row', () => {
  const target = injected({
    estimatorKeySets: [...gateEstimatorKeySets, { owner: '094', keys: ['speed_delta_arterial'] }],
  });
  assert.equal(target.gateStatus, 'OPEN');
  assert.deepEqual(target.foreignKeys, ['speed_delta_arterial']);
  assert.deepEqual(target.matrixErrors, ['FOREIGN_KEY']);
  assert.equal(target.unvalidated.length, 0);
  assert.equal(target.matrix.length, 24);
});

test('108 an injected M-key set that is not exactly the 092 24 stays OPEN', () => {
  const target = injected({ mKeys: [...learningGate24MKeys, 'speed_delta_arterial'] });
  assert.equal(target.gateStatus, 'OPEN');
  assert.equal(target.mKeySetMatches092, false);
  assert.equal(target.matrix.length, 25);
  assert.ok(target.matrixErrors.includes('M_KEY_SET_MISMATCH'));
  assert.ok(target.matrixErrors.includes('FOREIGN_KEY'));
  const foreign = rowOf(target, 'speed_delta_arterial');
  assert.equal(foreign.estimatorOwner, null);
  assert.equal(foreign.channel, null);
  assert.ok(foreign.reasons.includes('NO_ESTIMATOR'));
  assert.ok(foreign.reasons.includes('NO_EVIDENCE_SPEC'));
});

test('108 carrier and dedicated opportunities are explicit, disjoint and counted', () => {
  assert.equal(report.counts.carrierKeys, 12);
  assert.equal(report.counts.dedicatedKeys, 12);
  assert.equal(report.counts.carrierOpportunities, 16);
  assert.deepEqual(report.carrierKeys, [
    'speed_delta_urban',
    'speed_delta_residential',
    'curve_lateral_accel',
    'intersection_approach_speed',
    'desired_acceleration',
    'comfort_deceleration',
    'acceleration_jerk',
    'brake_reaction_delay',
    'following_time_headway',
    'following_min_gap',
    'queue_standstill_gap',
    'following_speed_gain',
  ]);
  assert.equal(
    report.dedicatedKeys.some((key) => report.carrierKeys.includes(key)),
    false,
  );
  const carrierKinds = new Set(
    report.matrix
      .filter((row) => row.opportunityRole === 'CARRIER')
      .flatMap((row) => row.opportunities.map((entry) => entry.kind)),
  );
  assert.deepEqual([...carrierKinds].sort(), ['GREEN', 'STOP']);
  for (const row of report.matrix) {
    assert.ok(row.opportunities.every((entry) => entry.role === row.opportunityRole));
    if (row.opportunityRole === 'CARRIER') {
      assert.equal(
        row.opportunities.some((entry) => ['RED', 'YIELD', 'LANE_CHANGE'].includes(entry.kind)),
        false,
      );
    }
  }
});

test('108 the report and signature are deterministic and change with a real failure', () => {
  const again = readLearningGate24({ inverseReport: inverse, edgeCaseReport: edgeCases });
  assert.deepEqual(again, report);
  assert.equal(again.signature, report.signature);
  const failed = injected({
    inverseScenarios: withScenarioStatus(
      'PROFILE_RECKLESS',
      'stop_dwell_time',
      'OUTSIDE_TOLERANCE',
    ),
  });
  assert.notEqual(failed.signature, report.signature);
});

test('108 the matrix matches the current 105 results instead of a stale copy', () => {
  assert.equal(report.counts.scenarioResults, 96);
  for (const row of report.matrix) {
    for (const scenario of row.scenarios) {
      const source = inverse.scenarios.find((entry) => entry.scenarioId === scenario.scenarioId);
      assert.ok(source, `missing 105 scenario ${scenario.scenarioId}`);
      const result = source.results.find((entry) => entry.key === row.key);
      assert.ok(result, `missing 105 result ${scenario.scenarioId}/${row.key}`);
      assert.equal(scenario.status, result.status);
      assert.equal(scenario.estimate, result.estimate);
      assert.deepEqual(scenario.interval, result.interval);
      assert.equal(scenario.tolerance, result.tolerance.effective);
      assert.equal(scenario.withinTolerance, result.status === 'WITHIN_TOLERANCE');
    }
  }
});

test('108 is frozen, uses only closed reasons and performs no store or fleet write', () => {
  const before = JSON.stringify(parameterRegistry);
  assert.deepEqual(report.effects, {
    profilePublications: 0,
    storeWrites: 0,
    fleetMutations: 0,
  });
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.matrix), true);
  for (const row of report.matrix) {
    assert.equal(Object.isFrozen(row), true);
    assert.ok(row.reasons.every((reason) => learningGate24Reasons.includes(reason)));
  }
  for (const key of learningGate24MKeys) assert.equal(parameterRegistry[key].estimable, false);
  assert.equal(JSON.stringify(parameterRegistry), before);
});

test('108 the evidence table prints all 24 rows, the gate, carrier keys and unvalidated list', () => {
  const markdown = learningGate24Markdown(report);
  for (const row of report.matrix) assert.ok(markdown.includes(row.key), row.key);
  assert.match(markdown, /gate: \*\*CLOSED\*\*/);
  assert.match(markdown, /Carrier keys \(12\)/);
  assert.match(markdown, /Dedicated keys \(12\)/);
  assert.match(markdown, /## Unvalidated keys\n\nNone\./);
  assert.ok(markdown.includes(report.signature));
});
