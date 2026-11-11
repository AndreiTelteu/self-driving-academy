import {
  EXPERIMENT_COMPARE_VERSION,
  experimentCompareRerunDivergences,
  readExperimentComparison,
} from '../../src/experiments';
import type {
  ExperimentCompareCohort,
  ExperimentCompareMetricPair,
  ExperimentCompareReady,
  ExperimentCompareRefused,
  ExperimentCompareResult,
  ExperimentRerunCompleted,
} from '../../src/experiments';
import {
  COMPARE_FIXTURE,
  compareMetrics,
  compareProfile,
  compareRequest,
  createCompareFixture,
  runCompareCohort,
  runRefusedCompareCohort,
} from './experiment-compare-fixture';

/**
 * Deterministic evidence transcript for PBI 143.
 *
 * The suite is the real 140 fixture rerun by the real 142 contract six times: an identical profile
 * pair, two isolated one-parameter scenarios, and the real PRUDENT/IMPULSIVE pair on three base
 * seeds. Every number below is measured on that run; there is no wall clock and no `Math.random`, so
 * `--check` compares the transcript byte for byte.
 */

/** Pinned contract of the fixture comparison; a change in 140/142/050/051 shows up here at once. */
const PINNED = Object.freeze({
  cohorts: 6,
  evaluations: 288,
  decisions: 144,
  divergent: 43,
  identical: 101,
  threshold: 37,
  geometry: 6,
  distinctCauses: 2,
  distinctParameters: 4,
  signalDivergences: 22,
  stopDivergences: 21,
  coexisting: 3,
  coexistenceOpportunities: 20,
  evaluatedOpportunities: 144,
  visible: 96,
  invisible: 192,
  fromTick: 61,
  toTick: 84,
  ticks: 24,
  baseSeeds: 3,
  scenarioSeeds: 3,
  opportunitySeeds: 72,
  divergentMin: 10,
  divergentMax: 20,
  probabilityDivergences: 10,
  offsetDivergences: 2,
  metrics: 2,
  behaviorDelta: 50,
  comfortDelta: 0.9,
  refusals: 5,
});

export interface ExperimentCompareCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ExperimentCompareRefusalProbe {
  readonly probe: string;
  readonly codes: readonly string[];
  readonly paths: readonly string[];
  readonly detail: string;
}

export interface ExperimentCompareEvidenceReport {
  readonly version: typeof EXPERIMENT_COMPARE_VERSION;
  readonly suiteId: string;
  readonly sources: Readonly<{ rerun: string; policiesEvaluated: number }>;
  readonly distribution: Readonly<{
    cohorts: number;
    evaluations: number;
    decisions: number;
    divergent: number;
    identical: number;
    causes: Readonly<Record<string, number>>;
    parameters: readonly { key: string; count: number; share: number | null }[];
    categories: readonly {
      kind: string;
      opportunities: number;
      evaluations: number;
      divergent: number;
    }[];
    unattributed: number;
    seedDivergences: number;
    distinctCauses: number;
    distinctParameters: number;
    dominant: { key: string; count: number; share: number | null } | null;
    criterionSatisfied: boolean;
    singleParameterOnlyCases: readonly string[];
  }>;
  readonly exposure: Readonly<{
    evaluations: number;
    visible: number;
    invisible: number;
    visibleFraction: number | null;
    evaluatedOpportunities: number;
    windows: readonly { fromTick: number; toTick: number; ticks: number; cohorts: number }[];
    sources: readonly string[];
    perCohort: readonly {
      cohortId: string;
      evaluations: number;
      visible: number;
      invisible: number;
    }[];
  }>;
  readonly seeds: Readonly<{
    baseSeeds: readonly number[];
    baseSeedHex: readonly string[];
    scenarioSeeds: readonly number[];
    scenarioSeedHex: readonly string[];
    distinctBaseSeeds: number;
    distinctScenarioSeeds: number;
    distinctOpportunitySeeds: number;
    perSeed: readonly {
      baseSeed: number;
      scenarioSeedHex: string;
      cohorts: number;
      decisions: number;
      divergent: number;
      parameters: readonly string[];
    }[];
  }>;
  readonly uncertainty: Readonly<{
    status: string;
    seeds: number;
    cohorts: number;
    evaluations: number;
    decisions: number;
    divergences: number;
    divergentMin: number;
    divergentMax: number;
    divergentSpread: number;
    generalizable: boolean;
    statement: string;
    limitations: readonly string[];
  }>;
  readonly isolated: readonly {
    cohortId: string;
    targetParameter: string;
    unit: string;
    left: number;
    right: number;
    changedParameters: readonly string[];
    onlyTargetChanged: boolean;
    divergences: number;
    namedParameters: readonly string[];
    foreignParameters: readonly string[];
    attributable: boolean;
  }[];
  readonly coexistence: Readonly<{
    total: number;
    coexisting: number;
    singleCause: number;
    opportunities: readonly {
      opportunityKey: string;
      kind: string;
      distinctCauses: number;
      distinctParameters: number;
      coexists: boolean;
      causes: readonly { cohortId: string; cause: string; parameter: string | null }[];
    }[];
  }>;
  readonly metrics: readonly {
    id: string;
    source: string;
    unit: string;
    left: number | null;
    right: number | null;
    delta: number | null;
    state: string;
    direction: string | null;
  }[];
  readonly divergences: readonly {
    cohortId: string;
    opportunityKey: string;
    kind: string;
    decisionTick: number;
    leftAction: string;
    rightAction: string;
    cause: string;
    parameter: string | null;
  }[];
  readonly repeat: Readonly<{ signature: string; identical: boolean; rerunUnchanged: boolean }>;
  readonly refusals: readonly ExperimentCompareRefusalProbe[];
  readonly checks: readonly ExperimentCompareCheck[];
  readonly summary: Readonly<{ probes: number; checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): ExperimentCompareCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function probe(name: string, result: ExperimentCompareResult): ExperimentCompareRefusalProbe {
  const refused: ExperimentCompareRefused = (() => {
    if (result.status !== 'REFUSED') throw new Error(`143 report: ${name} did not refuse`);
    return result;
  })();
  return Object.freeze({
    probe: name,
    codes: refused.codes,
    paths: refused.paths,
    detail: refused.detail,
  });
}

function readReference(): {
  readonly read: ExperimentCompareReady;
  readonly fixture: ReturnType<typeof createCompareFixture>;
} {
  const fixture = createCompareFixture();
  const result = readExperimentComparison(compareRequest(fixture));
  if (result.status !== 'READY')
    throw new Error(`143 report: the reference comparison refused: ${result.detail}`);
  return { read: result, fixture };
}

export function runExperimentCompareReport(): ExperimentCompareEvidenceReport {
  const { read, fixture } = readReference();
  const before = JSON.stringify(fixture.cohorts.map((cohort) => cohort.rerun));
  const repeat = readExperimentComparison(compareRequest(fixture));
  if (repeat.status !== 'READY') throw new Error('143 report: the repeated read refused');
  const after = JSON.stringify(fixture.cohorts.map((cohort) => cohort.rerun));

  const firstCohort = fixture.cohorts[0] as ExperimentCompareCohort;
  const missingFact = readExperimentComparison({
    ...fixture.request(),
    cohorts: [
      Object.freeze({
        ...firstCohort,
        visibility: Object.freeze({
          source: 'CONTROLLED_FIXTURE' as const,
          facts: Object.freeze(firstCohort.visibility.facts.slice(1)),
        }),
      }),
    ],
  });
  const firstFact = firstCohort.visibility.facts[0];
  if (firstFact === undefined) throw new Error('143 report: the first cohort has no fact');
  const shiftedTick = readExperimentComparison({
    ...fixture.request(),
    cohorts: [
      Object.freeze({
        ...firstCohort,
        visibility: Object.freeze({
          ...firstCohort.visibility,
          facts: Object.freeze([
            Object.freeze({ ...firstFact, decisionTick: firstFact.decisionTick + 1 }),
            ...firstCohort.visibility.facts.slice(1),
          ]),
        }),
      }),
    ],
  });
  const duplicate = readExperimentComparison({
    ...fixture.request(),
    cohorts: [firstCohort, firstCohort],
  });
  const notIsolated = (() => {
    const rerun = runCompareCohort([
      compareProfile('PRUDENT', 'probe-left@1', { red_stop_probability: 1 }),
      compareProfile('PRUDENT', 'probe-right@1', {
        red_stop_probability: 0,
        stop_dwell_time: 3,
      }),
    ]);
    return readExperimentComparison({
      ...fixture.request(),
      cohorts: [
        Object.freeze({
          cohortId: 'probe-two-parameters',
          caseKind: 'ISOLATED_PARAMETER' as const,
          targetParameter: 'red_stop_probability' as const,
          rerun,
          visibility: fixture.visibilityOf(rerun),
        }),
      ],
    });
  })();
  const refusedRerun = readExperimentComparison({
    ...fixture.request(),
    cohorts: [
      Object.freeze({
        cohortId: 'probe-refused-rerun',
        caseKind: 'COMPLEX_STYLE' as const,
        rerun: runRefusedCompareCohort() as unknown as ExperimentRerunCompleted,
        visibility: Object.freeze({ source: 'CONTROLLED_FIXTURE' as const, facts: [] }),
      }),
    ],
  });
  const unboundMetric = readExperimentComparison({
    ...compareRequest(fixture),
    metrics: [
      Object.freeze({
        ...(compareMetrics()[0] as ExperimentCompareMetricPair),
        cohortId: 'no-such-cohort',
      }),
    ],
  });

  const reported = fixture.cohorts.reduce(
    (total, cohort) => total + experimentCompareRerunDivergences(cohort.rerun),
    0,
  );
  const isolatedProbability = read.isolated.find(
    (entry) => entry.cohortId === COMPARE_FIXTURE.cohortIds.probability,
  );
  const isolatedOffset = read.isolated.find(
    (entry) => entry.cohortId === COMPARE_FIXTURE.cohortIds.offset,
  );
  const coexistenceExample = read.coexistence.opportunities.find(
    (row) => row.opportunityKey === 'opportunity-15',
  );
  const behavior = read.metrics.find((entry) => entry.source === 'BEHAVIOR_138');
  const comfort = read.metrics.find((entry) => entry.source === 'COMFORT_139');
  const dominant = read.distribution.dominantParameter;

  const checks: ExperimentCompareCheck[] = [
    check('version', EXPERIMENT_COMPARE_VERSION, read.version, '143 compare read model'),
    check('rerun-source', '142-experiment-rerun-v1', read.sources.rerun, 'reads the 142 contract'),
    check('policies-evaluated', 0, read.sources.policiesEvaluated, 'no 050/051 call in this layer'),
    check('cohorts', PINNED.cohorts, read.distribution.cohorts, 'controlled cases plus multi-seed'),
    check('evaluations', PINNED.evaluations, read.exposure.evaluations, 'opportunities × profiles'),
    check(
      'decisions',
      PINNED.decisions,
      read.distribution.decisions,
      'one decision per opportunity',
    ),
    check(
      'divergent',
      PINNED.divergent,
      read.distribution.divergent,
      'differences reported by 142',
    ),
    check('identical', PINNED.identical, read.distribution.identical, 'unchanged opportunities'),
    check(
      'divergent-equals-142-sum',
      reported,
      read.distribution.divergent,
      'the compare count is the 142 count, not a re-derivation',
    ),
    check(
      'identical-control',
      0,
      read.cohorts.find((cohort) => cohort.cohortId === COMPARE_FIXTURE.cohortIds.identical)
        ?.attribution.divergent ?? -1,
      'identical parameters produce no difference',
    ),
    check(
      'cause-threshold',
      PINNED.threshold,
      read.distribution.causes.PROBABILITY_THRESHOLD,
      'threshold',
    ),
    check(
      'cause-geometry',
      PINNED.geometry,
      read.distribution.causes.GEOMETRY_PARAMETER,
      'geometry',
    ),
    check(
      'distinct-causes',
      PINNED.distinctCauses,
      read.distribution.distinctCauses,
      'two causes coexist',
    ),
    check(
      'distinct-parameters',
      PINNED.distinctParameters,
      read.distribution.distinctParameters,
      'four parameters, never one',
    ),
    check(
      'dominant-share-below-one',
      true,
      dominant === null ? false : (dominant.share ?? 1) < 1,
      'no parameter explains every difference',
    ),
    check(
      'criterion-satisfied',
      true,
      read.distribution.criterionSatisfied,
      'acceptance criterion 1',
    ),
    check('unattributed', 0, read.distribution.unattributed, 'no UNCLASSIFIED divergence'),
    check(
      'signal-divergences',
      PINNED.signalDivergences,
      read.distribution.categories[0]?.divergent ?? -1,
      'SIGNAL',
    ),
    check(
      'stop-divergences',
      PINNED.stopDivergences,
      read.distribution.categories[1]?.divergent ?? -1,
      'STOP',
    ),
    check(
      'coexisting',
      PINNED.coexisting,
      read.coexistence.coexisting,
      'same opportunity, two causes',
    ),
    check(
      'coexistence-example',
      2,
      coexistenceExample?.distinctCauses ?? -1,
      'opportunity-15: threshold in one cohort, geometry in another',
    ),
    check(
      'evaluated-opportunities',
      PINNED.evaluatedOpportunities,
      read.exposure.evaluatedOpportunities,
      'authored opportunities across cohorts',
    ),
    check('visible', PINNED.visible, read.exposure.visible, 'declared visible evaluations'),
    check('invisible', PINNED.invisible, read.exposure.invisible, 'declared invisible evaluations'),
    check(
      'exposure-window',
      `${PINNED.fromTick}-${PINNED.toTick}/${PINNED.ticks}`,
      `${read.exposure.windows[0]?.fromTick ?? -1}-${read.exposure.windows[0]?.toTick ?? -1}/${read.exposure.windows[0]?.ticks ?? -1}`,
      'real tick window',
    ),
    check('base-seeds', PINNED.baseSeeds, read.seeds.distinctBaseSeeds, 'three base seeds'),
    check(
      'scenario-seeds',
      PINNED.scenarioSeeds,
      read.seeds.distinctScenarioSeeds,
      'one scenario seed each',
    ),
    check(
      'opportunity-seeds',
      PINNED.opportunitySeeds,
      read.seeds.distinctOpportunitySeeds,
      'distinct (taxi, event) seeds',
    ),
    check(
      'seed-spread',
      `${PINNED.divergentMin}-${PINNED.divergentMax}`,
      `${read.uncertainty.divergentMin}-${read.uncertainty.divergentMax}`,
      'real per-seed min and max',
    ),
    check('multi-seed', 'MULTI_SEED_SAMPLE', read.uncertainty.status, 'declared sample kind'),
    check('not-generalizable', false, read.uncertainty.generalizable, 'declared limitation'),
    check(
      'isolated-probability-only-target',
      true,
      isolatedProbability?.onlyTargetChanged ?? false,
      'only red_stop_probability changes',
    ),
    check(
      'isolated-probability-divergences',
      PINNED.probabilityDivergences,
      isolatedProbability?.divergences ?? -1,
      'every red-like opportunity differs',
    ),
    check(
      'isolated-probability-attributed',
      true,
      isolatedProbability?.attributable ?? false,
      'no foreign parameter named',
    ),
    check(
      'isolated-offset-only-target',
      true,
      isolatedOffset?.onlyTargetChanged ?? false,
      'only red_stop_line_offset changes',
    ),
    check(
      'isolated-offset-divergences',
      PINNED.offsetDivergences,
      isolatedOffset?.divergences ?? -1,
      'the 4 m stop lines cross the new offset',
    ),
    check(
      'isolated-offset-attributed',
      true,
      isolatedOffset?.attributable ?? false,
      'no foreign parameter named',
    ),
    check('metric-pairs', PINNED.metrics, read.metrics.length, '138 and 139 read models'),
    check('behavior-delta', PINNED.behaviorDelta, behavior?.delta ?? Number.NaN, 'violationRate'),
    check(
      'comfort-delta',
      PINNED.comfortDelta,
      comfort?.delta ?? Number.NaN,
      'mean |acceleration|',
    ),
    check(
      'repeat-signature',
      read.signature,
      repeat.signature,
      'the same request produces the same signature',
    ),
    check('rerun-not-mutated', true, before === after, 'the 142 results are read only'),
  ];

  const refusedProbes = [
    probe('exposure-incomplete', missingFact),
    probe('exposure-tick-mismatch', shiftedTick),
    probe('cohort-duplicate', duplicate),
    probe('isolated-two-parameters', notIsolated),
    probe('refused-rerun', refusedRerun),
  ];
  checks.push(
    check('refusal-probes', PINNED.refusals, refusedProbes.length, 'closed refusal codes'),
    check(
      'refusal-exposure',
      'EXPOSURE_INCOMPLETE',
      refusedProbes[0]?.codes[0] ?? 'none',
      'missing fact',
    ),
    check(
      'refusal-tick',
      'EXPOSURE_TICK_MISMATCH',
      refusedProbes[1]?.codes[0] ?? 'none',
      'shifted tick',
    ),
    check(
      'refusal-duplicate',
      'COHORT_DUPLICATE',
      refusedProbes[2]?.codes[0] ?? 'none',
      'two cohorts',
    ),
    check(
      'refusal-isolation',
      true,
      refusedProbes[3]?.codes.includes('ISOLATED_PARAMETER_NOT_ISOLATED') ?? false,
      'two parameters',
    ),
    check('refusal-rerun', 'RERUN_NOT_READY', refusedProbes[4]?.codes[0] ?? 'none', 'refused 142'),
    check(
      'refusal-metric',
      true,
      unboundMetric.status === 'REFUSED' && unboundMetric.codes.includes('METRIC_UNBOUND'),
      'a metric must be bound to a real cohort pair',
    ),
  );

  const passed = checks.filter((entry) => entry.pass).length;

  return Object.freeze({
    version: EXPERIMENT_COMPARE_VERSION,
    suiteId: read.suiteId,
    sources: read.sources,
    distribution: Object.freeze({
      cohorts: read.distribution.cohorts,
      evaluations: read.distribution.evaluations,
      decisions: read.distribution.decisions,
      divergent: read.distribution.divergent,
      identical: read.distribution.identical,
      causes: read.distribution.causes,
      parameters: read.distribution.parameters.map((row) =>
        Object.freeze({ key: row.key, count: row.count, share: row.share }),
      ),
      categories: read.distribution.categories.map((row) =>
        Object.freeze({
          kind: row.kind,
          opportunities: row.opportunities,
          evaluations: row.evaluations,
          divergent: row.divergent,
        }),
      ),
      unattributed: read.distribution.unattributed,
      seedDivergences: read.distribution.seedDivergences,
      distinctCauses: read.distribution.distinctCauses,
      distinctParameters: read.distribution.distinctParameters,
      dominant: dominant === null ? null : Object.freeze({ ...dominant }),
      criterionSatisfied: read.distribution.criterionSatisfied,
      singleParameterOnlyCases: read.distribution.singleParameterOnlyCases,
    }),
    exposure: Object.freeze({
      evaluations: read.exposure.evaluations,
      visible: read.exposure.visible,
      invisible: read.exposure.invisible,
      visibleFraction: read.exposure.visibleFraction,
      evaluatedOpportunities: read.exposure.evaluatedOpportunities,
      windows: read.exposure.windows.map((window) =>
        Object.freeze({
          fromTick: window.fromTick,
          toTick: window.toTick,
          ticks: window.ticks,
          cohorts: window.cohorts.length,
        }),
      ),
      sources: read.exposure.sources,
      perCohort: read.cohorts.map((cohort) =>
        Object.freeze({
          cohortId: cohort.cohortId,
          evaluations: cohort.exposure.evaluations,
          visible: cohort.exposure.visible,
          invisible: cohort.exposure.invisible,
        }),
      ),
    }),
    seeds: Object.freeze({
      baseSeeds: read.seeds.baseSeeds,
      baseSeedHex: read.seeds.perSeed.map((row) => row.baseSeedHex),
      scenarioSeeds: read.seeds.scenarioSeeds,
      scenarioSeedHex: read.seeds.perSeed.map((row) => row.scenarioSeedHex),
      distinctBaseSeeds: read.seeds.distinctBaseSeeds,
      distinctScenarioSeeds: read.seeds.distinctScenarioSeeds,
      distinctOpportunitySeeds: read.seeds.distinctOpportunitySeeds,
      perSeed: read.seeds.perSeed.map((row) =>
        Object.freeze({
          baseSeed: row.baseSeed,
          scenarioSeedHex: row.scenarioSeedHex,
          cohorts: row.cohorts,
          decisions: row.decisions,
          divergent: row.divergent,
          parameters: row.parameters,
        }),
      ),
    }),
    uncertainty: Object.freeze({
      status: read.uncertainty.status,
      seeds: read.uncertainty.seeds,
      cohorts: read.uncertainty.cohorts,
      evaluations: read.uncertainty.evaluations,
      decisions: read.uncertainty.decisions,
      divergences: read.uncertainty.divergences,
      divergentMin: read.uncertainty.divergentMin,
      divergentMax: read.uncertainty.divergentMax,
      divergentSpread: read.uncertainty.divergentSpread,
      generalizable: read.uncertainty.generalizable,
      statement: read.uncertainty.statement,
      limitations: read.uncertainty.limitations,
    }),
    isolated: read.isolated.map((entry) =>
      Object.freeze({
        cohortId: entry.cohortId,
        targetParameter: entry.targetParameter,
        unit: entry.unit,
        left: entry.left,
        right: entry.right,
        changedParameters: entry.changedParameters,
        onlyTargetChanged: entry.onlyTargetChanged,
        divergences: entry.divergences,
        namedParameters: entry.namedParameters,
        foreignParameters: entry.foreignParameters,
        attributable: entry.attributable,
      }),
    ),
    coexistence: Object.freeze({
      total: read.coexistence.total,
      coexisting: read.coexistence.coexisting,
      singleCause: read.coexistence.singleCause,
      opportunities: read.coexistence.opportunities.map((row) =>
        Object.freeze({
          opportunityKey: row.opportunityKey,
          kind: row.kind,
          distinctCauses: row.distinctCauses,
          distinctParameters: row.distinctParameters,
          coexists: row.coexists,
          causes: row.causes.map((entry) =>
            Object.freeze({
              cohortId: entry.cohortId,
              cause: entry.cause,
              parameter: entry.parameter,
            }),
          ),
        }),
      ),
    }),
    metrics: read.metrics.map((entry) =>
      Object.freeze({
        id: entry.id,
        source: entry.source,
        unit: entry.unit,
        left: entry.left,
        right: entry.right,
        delta: entry.delta,
        state: entry.state,
        direction: entry.direction,
      }),
    ),
    divergences: read.cohorts.flatMap((cohort) =>
      cohort.divergences.map((row) =>
        Object.freeze({
          cohortId: cohort.cohortId,
          opportunityKey: row.opportunityKey,
          kind: row.kind,
          decisionTick: row.decisionTick,
          leftAction: row.leftAction,
          rightAction: row.rightAction,
          cause: row.cause,
          parameter: row.parameter,
        }),
      ),
    ),
    repeat: Object.freeze({
      signature: repeat.signature,
      identical: repeat.signature === read.signature,
      rerunUnchanged: before === after,
    }),
    refusals: Object.freeze(refusedProbes),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      probes: refusedProbes.length,
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
  });
}

function table(rows: readonly (readonly string[])[], header: readonly string[]): string {
  const lines = [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
  return lines.join('\n');
}

function formatNumber(value: number | null): string {
  if (value === null) return '—';
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded).replace('.', ',');
}

export function experimentCompareReportMarkdown(report: ExperimentCompareEvidenceReport): string {
  const parameterRows = report.distribution.parameters.map((row) => [
    row.key,
    String(row.count),
    row.share === null ? '—' : `${Math.round(row.share * 1000) / 10}%`,
  ]);
  const categoryRows = report.distribution.categories.map((row) => [
    row.kind,
    String(row.opportunities),
    String(row.evaluations),
    String(row.divergent),
  ]);
  const exposureRows = report.exposure.perCohort.map((row) => [
    row.cohortId,
    String(row.evaluations),
    String(row.visible),
    String(row.invisible),
  ]);
  const seedRows = report.seeds.perSeed.map((row) => [
    String(row.baseSeed),
    row.scenarioSeedHex,
    String(row.cohorts),
    String(row.decisions),
    String(row.divergent),
    row.parameters.join(', ') || '—',
  ]);
  const isolatedRows = report.isolated.map((row) => [
    row.cohortId,
    row.targetParameter,
    `${formatNumber(row.left)} → ${formatNumber(row.right)} ${row.unit}`,
    String(row.divergences),
    row.onlyTargetChanged ? 'da' : 'nu',
    row.foreignParameters.join(', ') || '—',
    row.attributable ? 'atribuit țintei' : 'atribuire incompletă',
  ]);
  const coexistenceRows = report.coexistence.opportunities
    .filter((row) => row.coexists)
    .map((row) => [
      row.opportunityKey,
      row.kind,
      row.causes.map((entry) => `${entry.cause}/${entry.parameter ?? '—'}`).join(' + '),
      String(row.distinctCauses),
    ]);
  const metricRows = report.metrics.map((row) => [
    row.id,
    row.source,
    formatNumber(row.left),
    formatNumber(row.right),
    row.delta === null ? '—' : `${row.delta > 0 ? '+' : ''}${formatNumber(row.delta)}`,
    row.state,
  ]);
  const checkRows = report.checks.map((entry) => [
    entry.name,
    String(entry.expected),
    String(entry.actual),
    entry.pass ? 'PASS' : 'FAIL',
  ]);
  const refRows = report.refusals.map((entry) => [
    entry.probe,
    entry.codes.join(', '),
    entry.paths.length === 0 ? '—' : entry.paths.join(', '),
  ]);
  const divergenceRows = report.divergences.map((row) => [
    row.cohortId,
    row.opportunityKey,
    row.kind,
    String(row.decisionTick),
    row.leftAction,
    row.rightAction,
    row.cause,
    row.parameter ?? '—',
  ]);
  return [
    '# 143 — comparație A/B cu distribuții și dovezi',
    '',
    `Contract \`${report.version}\`. Citește rezultatele \`${report.sources.rerun}\` fără să re-derive diferențele; sursa politicilor în acest strat: ${report.sources.policiesEvaluated} evaluări.`,
    '',
    '## Distribuția cauzelor',
    '',
    table(
      [
        ['cohorte', String(report.distribution.cohorts)],
        ['evaluări', String(report.distribution.evaluations)],
        ['decizii comparate', String(report.distribution.decisions)],
        ['diferențe', String(report.distribution.divergent)],
        ['identice', String(report.distribution.identical)],
        ['prag de probabilitate', String(report.distribution.causes.PROBABILITY_THRESHOLD ?? 0)],
        ['parametru de geometrie', String(report.distribution.causes.GEOMETRY_PARAMETER ?? 0)],
        ['divergențe din seed', String(report.distribution.seedDivergences)],
        ['neatribuite', String(report.distribution.unattributed)],
        ['cauze distincte', String(report.distribution.distinctCauses)],
        ['parametri distincți', String(report.distribution.distinctParameters)],
        [
          'cel mai frecvent parametru',
          report.distribution.dominant === null
            ? '—'
            : `${report.distribution.dominant.key} (${report.distribution.dominant.count}, ${report.distribution.dominant.share === null ? '—' : `${Math.round(report.distribution.dominant.share * 1000) / 10}%`})`,
        ],
        [
          'criteriu „nu un singur parametru”',
          report.distribution.criterionSatisfied ? 'îndeplinit' : 'încălcat',
        ],
      ],
      ['Măsură', 'Valoare'],
    ),
    '',
    '### Pe parametri',
    '',
    table(parameterRows, ['Parametru', 'Diferențe', 'Pondere']),
    '',
    '### Pe categorii',
    '',
    table(categoryRows, ['Categorie', 'Oportunități', 'Evaluări', 'Diferențe']),
    '',
    '### Cauze care coexistă',
    '',
    table(coexistenceRows, ['Oportunitate', 'Tip', 'Cauze și parametri', 'Cauze distincte']),
    '',
    `Total: ${report.coexistence.total} oportunități cu diferențe, ${report.coexistence.coexisting} cu două cauze, ${report.coexistence.singleCause} cu o singură cauză.`,
    '',
    '## Expunere',
    '',
    table(
      [
        ['evaluări', String(report.exposure.evaluations)],
        ['oportunități evaluate', String(report.exposure.evaluatedOpportunities)],
        ['vizibile', String(report.exposure.visible)],
        ['invizibile', String(report.exposure.invisible)],
        [
          'fracție vizibilă',
          report.exposure.visibleFraction === null
            ? 'indisponibilă'
            : `${Math.round(report.exposure.visibleFraction * 1000) / 10}%`,
        ],
        [
          'fereastră',
          report.exposure.windows
            .map(
              (window) =>
                `tick ${window.fromTick}–${window.toTick} (${window.ticks} tickuri, ${window.cohorts} cohorte)`,
            )
            .join('; ') || '—',
        ],
        ['sursa faptului de vizibilitate', report.exposure.sources.join(', ')],
      ],
      ['Măsură', 'Valoare'],
    ),
    '',
    table(exposureRows, ['Cohortă', 'Evaluări', 'Vizibile', 'Invizibile']),
    '',
    '## Seed-uri și incertitudine',
    '',
    table(seedRows, [
      'Seed de bază',
      'Seed scenariu',
      'Cohorte',
      'Decizii',
      'Diferențe',
      'Parametri raportați',
    ]),
    '',
    `Seed-uri distincte: ${report.seeds.distinctBaseSeeds} de bază, ${report.seeds.distinctScenarioSeeds} de scenariu, ${report.seeds.distinctOpportunitySeeds} de oportunitate.`,
    '',
    `**${report.uncertainty.status}** · diferențe pe seed între ${report.uncertainty.divergentMin} și ${report.uncertainty.divergentMax} (spread ${report.uncertainty.divergentSpread}); generalizabil: ${report.uncertainty.generalizable}.`,
    '',
    report.uncertainty.statement,
    '',
    ...report.uncertainty.limitations.map((limitation) => `- ${limitation}`),
    '',
    '## Scenarii izolate',
    '',
    table(isolatedRows, [
      'Cohortă',
      'Parametru țintă',
      'Valori',
      'Diferențe',
      'Doar ținta',
      'Alți parametri raportați',
      'Verdict',
    ]),
    '',
    '## Indicatori 138/139',
    '',
    table(metricRows, ['Indicator', 'Sursă', 'Stânga', 'Dreapta', 'Diferență', 'Stare']),
    '',
    '## Toate diferențele raportate de 142',
    '',
    table(divergenceRows, [
      'Cohortă',
      'Oportunitate',
      'Tip',
      'Tick',
      'Stânga',
      'Dreapta',
      'Cauză',
      'Parametru',
    ]),
    '',
    '## Probe de refuz',
    '',
    table(refRows, ['Probă', 'Coduri', 'Căi']),
    '',
    '## Verificări',
    '',
    table(checkRows, ['Verificare', 'Așteptat', 'Real', 'Rezultat']),
    '',
    `Rezumat: ${report.summary.passed}/${report.summary.checks} verificări, ${report.summary.probes} probe de refuz, ${report.summary.pass ? 'PASS' : 'FAIL'}.`,
    '',
  ].join('\n');
}
