import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPERIMENT_COMPARE_VERSION,
  experimentComparePolicyKeys,
  experimentCompareRefusalCodes,
  experimentCompareRerunDivergences,
  readExperimentComparison,
} from '../../src/experiments';
import type {
  ExperimentCompareCohort,
  ExperimentCompareDivergenceRow,
  ExperimentCompareMetricPair,
  ExperimentCompareReady,
  ExperimentCompareRefused,
  ExperimentRerunCompleted,
} from '../../src/experiments';
import {
  COMPARE_FIXTURE,
  COMPARE_VISIBLE_VEHICLES,
  compareMetrics,
  compareProfile,
  compareRequest,
  createCompareFixture,
  runCompareCohort,
  runRefusedCompareCohort,
} from './experiment-compare-fixture';

/**
 * PBI 143 tests. The suite is the real 140 fixture rerun by the real 142 contract: the snapshot is
 * the 206 capture at tick 60, the profiles are the real 105 profiles published through 041, and the
 * decisions come from the real 050/051 policies. Nothing here re-evaluates a policy, so every number
 * is either a 142 result or an aggregate of one.
 */

const fixture = createCompareFixture();
const result = readExperimentComparison(compareRequest(fixture));

function ready(value: typeof result): ExperimentCompareReady {
  if (value.status !== 'READY') throw new Error(`Expected READY, got ${JSON.stringify(value)}`);
  return value;
}

function refused(value: typeof result): ExperimentCompareRefused {
  if (value.status !== 'REFUSED') throw new Error('Expected REFUSED');
  return value;
}

const read = ready(result);

test('143 the comparison reads the 142 divergences instead of re-deriving them', () => {
  assert.equal(read.version, EXPERIMENT_COMPARE_VERSION);
  assert.equal(read.sources.rerun, '142-experiment-rerun-v1');
  assert.equal(read.sources.policiesEvaluated, 0);
  const reported = fixture.cohorts.reduce(
    (total, cohort) => total + experimentCompareRerunDivergences(cohort.rerun),
    0,
  );
  assert.equal(read.distribution.divergent, reported);
  assert.equal(read.distribution.divergent, 43);
  assert.equal(read.distribution.decisions, 144);
  // Every divergence row is the 142 row unchanged: same opportunity, tick, cause and parameter.
  const complex = fixture.cohorts.find((cohort) => cohort.cohortId === 'complex-seed-142000');
  assert.ok(complex !== undefined);
  const source = complex.rerun.comparisons[0];
  assert.ok(source !== undefined);
  const rows = read.cohorts.find((cohort) => cohort.cohortId === complex.cohortId);
  assert.ok(rows !== undefined);
  assert.equal(rows.attribution.divergent, source.divergent);
  for (const [index, divergence] of source.divergences.entries()) {
    const row: ExperimentCompareDivergenceRow | undefined = rows.divergences[index];
    assert.ok(row !== undefined);
    assert.equal(row.opportunityKey, divergence.opportunityKey);
    assert.equal(row.decisionTick, divergence.decisionTick);
    assert.equal(row.cause, divergence.cause);
    assert.equal(row.parameter, divergence.parameter);
    assert.equal(row.leftAction, divergence.left.action);
    assert.equal(row.rightAction, divergence.right.action);
  }
});

test('143 the read model never mutates the 142 results it reads', () => {
  const before = JSON.stringify(
    fixture.cohorts.map((cohort) => ({ id: cohort.cohortId, rerun: cohort.rerun })),
  );
  const again = ready(readExperimentComparison(compareRequest(fixture)));
  const after = JSON.stringify(
    fixture.cohorts.map((cohort) => ({ id: cohort.cohortId, rerun: cohort.rerun })),
  );
  assert.equal(before, after);
  assert.equal(again.signature, read.signature);
});

test('143 the cause distribution is not collapsed onto one parameter', () => {
  const distribution = read.distribution;
  assert.equal(distribution.distinctCauses, 2);
  assert.equal(distribution.distinctParameters, 4);
  assert.deepEqual(
    distribution.parameters.map((row) => [row.key, row.count]),
    [
      ['red_stop_probability', 20],
      ['stop_full_probability', 17],
      ['stop_dwell_time', 4],
      ['red_stop_line_offset', 2],
    ],
  );
  assert.equal(distribution.causes.PROBABILITY_THRESHOLD, 37);
  assert.equal(distribution.causes.GEOMETRY_PARAMETER, 6);
  assert.equal(distribution.causes.UNCLASSIFIED, 0);
  assert.equal(distribution.unattributed, 0);
  assert.equal(distribution.withoutParameter, 0);
  assert.equal(distribution.attributed, distribution.divergent);
  assert.deepEqual(
    distribution.categories.map((row) => [row.kind, row.divergent, row.evaluations]),
    [
      ['SIGNAL', 22, 144],
      ['STOP', 21, 144],
    ],
  );
  const dominant = distribution.dominantParameter;
  assert.ok(dominant !== null);
  assert.equal(dominant.key, 'red_stop_probability');
  assert.ok((dominant.share ?? 1) < 1);
  assert.equal(distribution.caseKinds.COMPLEX_STYLE.allOnOneParameter, false);
  assert.deepEqual([...distribution.singleParameterOnlyCases], []);
  assert.equal(distribution.criterionSatisfied, true);
});

test('143 one opportunity is explained by two different causes (coexistence)', () => {
  assert.equal(read.coexistence.coexisting, 3);
  assert.equal(read.coexistence.total, 20);
  const coexistence = read.coexistence.opportunities.find(
    (row) => row.opportunityKey === 'opportunity-15',
  );
  assert.ok(coexistence !== undefined);
  assert.equal(coexistence.coexists, true);
  assert.equal(coexistence.distinctCauses, 2);
  assert.deepEqual(
    coexistence.causes.map((entry) => [entry.cohortId, entry.cause, entry.parameter]),
    [
      ['isolated-red-stop-probability', 'PROBABILITY_THRESHOLD', 'red_stop_probability'],
      ['isolated-red-stop-line-offset', 'GEOMETRY_PARAMETER', 'red_stop_line_offset'],
      ['complex-seed-142000', 'PROBABILITY_THRESHOLD', 'red_stop_probability'],
    ],
  );
  const dwell = read.coexistence.opportunities.find(
    (row) => row.opportunityKey === 'opportunity-20',
  );
  assert.ok(dwell !== undefined);
  assert.deepEqual([...new Set(dwell.causes.map((entry) => entry.cause))].sort(), [
    'GEOMETRY_PARAMETER',
    'PROBABILITY_THRESHOLD',
  ]);
  assert.ok(
    read.coexistence.opportunities
      .filter((row) => row.coexists)
      .every((row) => row.distinctCauses >= 2 && row.distinctParameters >= 2),
  );
});

test('143 the isolated scenarios change exactly one parameter at a time', () => {
  assert.equal(read.isolated.length, 2);
  const probability = read.isolated.find(
    (entry) => entry.cohortId === COMPARE_FIXTURE.cohortIds.probability,
  );
  const offset = read.isolated.find((entry) => entry.cohortId === COMPARE_FIXTURE.cohortIds.offset);
  assert.ok(probability !== undefined && offset !== undefined);
  assert.equal(probability.targetParameter, 'red_stop_probability');
  assert.equal(probability.unit, 'probability');
  assert.deepEqual([...probability.changedParameters], ['red_stop_probability']);
  assert.equal(probability.onlyTargetChanged, true);
  assert.deepEqual([...probability.namedParameters], ['red_stop_probability']);
  assert.deepEqual([...probability.foreignParameters], []);
  assert.equal(probability.left, 1);
  assert.equal(probability.right, 0);
  assert.equal(probability.divergences, 10);
  assert.equal(probability.targetNamed, 10);
  assert.equal(probability.attributable, true);
  assert.equal(offset.targetParameter, 'red_stop_line_offset');
  assert.equal(offset.unit, 'm');
  assert.equal(offset.minimum, 0);
  assert.equal(offset.maximum, 5);
  assert.equal(offset.left, 1.2);
  assert.equal(offset.right, 5);
  assert.deepEqual([...offset.namedParameters], ['red_stop_line_offset']);
  assert.equal(offset.divergences, 2);
  assert.equal(offset.attributable, true);
  for (const target of experimentComparePolicyKeys) assert.equal(typeof target, 'string');
});

test('143 the identical-profile control reports zero differences', () => {
  const identical = read.cohorts.find(
    (cohort) => cohort.cohortId === COMPARE_FIXTURE.cohortIds.identical,
  );
  assert.ok(identical !== undefined);
  assert.equal(identical.attribution.divergent, 0);
  assert.equal(identical.attribution.identical, 24);
  assert.equal(identical.attribution.distinctParameters, 0);
  assert.equal(identical.attribution.allOnOneParameter, false);
  assert.deepEqual([...identical.divergences], []);
});

test('143 exposure counts evaluated, visible and invisible opportunities on a real window', () => {
  const exposure = read.exposure;
  assert.equal(exposure.declared, true);
  assert.equal(COMPARE_VISIBLE_VEHICLES.length, 8);
  assert.equal(exposure.evaluatedOpportunities, 144);
  assert.equal(exposure.evaluations, 288);
  assert.equal(exposure.visible, 96);
  assert.equal(exposure.invisible, 192);
  assert.equal(exposure.visibleFraction, 0.333333);
  assert.deepEqual([...exposure.sources], ['CAMERA', 'CONTROLLED_FIXTURE']);
  assert.equal(exposure.windows.length, 1);
  const window = exposure.windows[0];
  assert.ok(window !== undefined);
  assert.equal(window.fromTick, 61);
  assert.equal(window.toTick, 84);
  assert.equal(window.ticks, 24);
  assert.equal(window.cohorts.length, 6);
  const cohort = read.cohorts[0];
  assert.ok(cohort !== undefined);
  assert.equal(cohort.exposure.evaluatedOpportunities, 24);
  assert.equal(cohort.exposure.evaluations, 48);
  assert.equal(cohort.exposure.visible, 16);
  assert.equal(cohort.exposure.invisible, 32);
  assert.equal(cohort.exposure.facts, 24);
  assert.deepEqual(
    cohort.exposure.profiles.map((profile) => [
      profile.evaluated,
      profile.visible,
      profile.invisible,
    ]),
    [
      [24, 8, 16],
      [24, 8, 16],
    ],
  );
});

test('143 the seed count and the uncertainty are declared, not hidden in a mean', () => {
  const seeds = read.seeds;
  assert.deepEqual([...seeds.baseSeeds], [142_000, 142_001, 142_002]);
  assert.equal(seeds.distinctBaseSeeds, 3);
  assert.equal(seeds.distinctScenarioSeeds, 3);
  assert.equal(seeds.distinctOpportunitySeeds, 72);
  assert.deepEqual(
    seeds.perSeed.map((row) => [row.baseSeed, row.divergent, row.identical]),
    [
      [142_000, 20, 76],
      [142_001, 13, 11],
      [142_002, 10, 14],
    ],
  );
  assert.deepEqual(
    [...(seeds.perSeed[1]?.parameters ?? [])],
    ['red_stop_probability', 'stop_dwell_time', 'stop_full_probability'],
  );
  const uncertainty = read.uncertainty;
  assert.equal(uncertainty.status, 'MULTI_SEED_SAMPLE');
  assert.equal(uncertainty.seeds, 3);
  assert.equal(uncertainty.cohorts, 6);
  assert.equal(uncertainty.decisions, 144);
  assert.equal(uncertainty.divergences, 43);
  assert.equal(uncertainty.divergentMin, 10);
  assert.equal(uncertainty.divergentMax, 20);
  assert.equal(uncertainty.divergentSpread, 10);
  assert.equal(uncertainty.generalizable, false);
  assert.match(uncertainty.statement, /3 seed-uri distincte/);
  assert.match(uncertainty.statement, /între 10 și 20/);
  assert.match(uncertainty.statement, /nu se raportează un interval de încredere/);
  assert.equal(uncertainty.limitations.length, 4);
});

test('143 138/139 deltas come from the read models and never from a fabricated zero', () => {
  assert.equal(read.metrics.length, 2);
  const behavior = read.metrics.find((entry) => entry.source === 'BEHAVIOR_138');
  assert.ok(behavior !== undefined);
  assert.equal(behavior.state, 'DELTA');
  assert.equal(behavior.left, 0);
  assert.equal(behavior.right, 50);
  assert.equal(behavior.delta, 50);
  assert.equal(behavior.direction, 'HIGHER');
  assert.equal(behavior.leftSampleSize, 1);
  assert.equal(behavior.rightSampleSize, 2);
  const comfort = read.metrics.find((entry) => entry.source === 'COMFORT_139');
  assert.ok(comfort !== undefined);
  assert.equal(comfort.left, 1.2);
  assert.equal(comfort.right, 2.1);
  assert.equal(comfort.delta, 0.9);
  assert.equal(comfort.unit, 'm/s²');

  const unavailable = ready(
    readExperimentComparison({
      ...compareRequest(fixture),
      metrics: [
        {
          ...(compareMetrics()[0] as ExperimentCompareMetricPair),
          right: Object.freeze({ state: 'UNAVAILABLE' as const, value: null, sampleSize: null }),
        },
      ],
    }),
  );
  const row = unavailable.metrics[0];
  assert.ok(row !== undefined);
  assert.equal(row.state, 'UNAVAILABLE');
  assert.equal(row.delta, null);
  assert.equal(row.reason, 'RIGHT_UNAVAILABLE');
  assert.equal(row.direction, null);
});

test('143 an incomplete exposure or a wrong visibility tick is refused', () => {
  const missing = refused(
    readExperimentComparison({
      ...fixture.request(),
      cohorts: [
        {
          ...(fixture.cohorts[0] as ExperimentCompareCohort),
          visibility: Object.freeze({
            source: 'CONTROLLED_FIXTURE' as const,
            facts: Object.freeze(
              (fixture.cohorts[0] as ExperimentCompareCohort).visibility.facts.slice(1),
            ),
          }),
        },
      ],
    }),
  );
  assert.deepEqual([...missing.codes], ['EXPOSURE_INCOMPLETE']);
  assert.ok(missing.paths.some((path) => path.startsWith('cohorts[0].visibility.facts')));

  const cohort = fixture.cohorts[0] as ExperimentCompareCohort;
  const first = cohort.visibility.facts[0];
  assert.ok(first !== undefined);
  const moved = Object.freeze({
    ...cohort.visibility,
    facts: Object.freeze([
      Object.freeze({ ...first, decisionTick: first.decisionTick + 1 }),
      ...cohort.visibility.facts.slice(1),
    ]),
  });
  const mismatch = refused(
    readExperimentComparison({
      ...fixture.request(),
      cohorts: [Object.freeze({ ...cohort, visibility: moved })],
    }),
  );
  assert.deepEqual([...mismatch.codes], ['EXPOSURE_TICK_MISMATCH']);
  const unknownSource = refused(
    readExperimentComparison({
      ...fixture.request(),
      cohorts: [
        Object.freeze({
          ...cohort,
          visibility: Object.freeze({ ...cohort.visibility, source: 'GUESS' as never }),
        }),
      ],
    }),
  );
  assert.ok(unknownSource.codes.includes('VISIBILITY_SOURCE_INVALID'));
});

test('143 a scenario that changes two parameters cannot claim isolation', () => {
  const left = compareProfile('PRUDENT', 'two-param-left@1', { red_stop_probability: 1 });
  const right = compareProfile('PRUDENT', 'two-param-right@1', {
    red_stop_probability: 0,
    stop_dwell_time: 3,
  });
  const changed = runCompareCohort([left, right]);
  const refusedResult = refused(
    readExperimentComparison({
      ...fixture.request(),
      cohorts: [
        Object.freeze({
          cohortId: 'two-parameters',
          caseKind: 'ISOLATED_PARAMETER' as const,
          targetParameter: 'red_stop_probability' as const,
          rerun: changed,
          visibility: fixture.visibilityOf(changed),
        }),
      ],
    }),
  );
  assert.ok(refusedResult.codes.includes('ISOLATED_PARAMETER_NOT_ISOLATED'));
});

test('143 the control cases are enforced and duplicate cohorts are refused', () => {
  const cohort = fixture.cohorts[0] as ExperimentCompareCohort;
  const duplicate = refused(
    readExperimentComparison({ ...fixture.request(), cohorts: [cohort, cohort] }),
  );
  assert.ok(duplicate.codes.includes('COHORT_DUPLICATE'));

  const identicalWithChange = runCompareCohort([
    compareProfile('PRUDENT', 'fake-identical-left@1'),
    compareProfile('PRUDENT', 'fake-identical-right@1', { stop_dwell_time: 3 }),
  ]);
  const differs = refused(
    readExperimentComparison({
      ...fixture.request(),
      cohorts: [
        Object.freeze({
          cohortId: 'fake-identical',
          caseKind: 'IDENTICAL_PROFILE' as const,
          rerun: identicalWithChange,
          visibility: fixture.visibilityOf(identicalWithChange),
        }),
      ],
    }),
  );
  assert.ok(differs.codes.includes('IDENTICAL_PROFILE_DIFFERS'));

  const notComplex = refused(
    readExperimentComparison({
      ...fixture.request(),
      cohorts: [
        Object.freeze({
          cohortId: 'not-complex',
          caseKind: 'COMPLEX_STYLE' as const,
          rerun: identicalWithChange,
          visibility: fixture.visibilityOf(identicalWithChange),
        }),
      ],
    }),
  );
  assert.ok(notComplex.codes.includes('COMPLEX_STYLE_NOT_COMPLEX'));
});

test('143 a refused 142 result is carried as a refusal, not silently compared', () => {
  const refusedRerun = runRefusedCompareCohort();
  const refusedResult = refused(
    readExperimentComparison({
      ...fixture.request(),
      cohorts: [
        Object.freeze({
          cohortId: 'refused-rerun',
          caseKind: 'COMPLEX_STYLE' as const,
          rerun: refusedRerun as unknown as ExperimentRerunCompleted,
          visibility: Object.freeze({ source: 'CONTROLLED_FIXTURE' as const, facts: [] }),
        }),
      ],
    }),
  );
  assert.deepEqual([...refusedResult.codes], ['RERUN_NOT_READY']);
});

test('143 an invalid request throws the closed input error', () => {
  assert.throws(
    () => readExperimentComparison({ suiteId: 'x', cohorts: [] }),
    /at least one cohort/,
  );
  assert.throws(
    () =>
      readExperimentComparison({
        suiteId: '',
        cohorts: [fixture.cohorts[0] as ExperimentCompareCohort],
      }),
    /bounded text/,
  );
  assert.throws(
    () =>
      readExperimentComparison({
        suiteId: 'x',
        cohorts: [
          Object.freeze({
            ...(fixture.cohorts[0] as ExperimentCompareCohort),
            caseKind: 'GUESS' as never,
          }),
        ],
      }),
    /Expected one of/,
  );
  assert.deepEqual(
    [...experimentCompareRefusalCodes].includes('ISOLATED_PARAMETER_NOT_ISOLATED'),
    true,
  );
});
