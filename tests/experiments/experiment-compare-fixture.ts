import {
  createBehaviorMetrics,
  createComfortMetrics,
  runExperimentRerun,
} from '../../src/experiments';
import type {
  BehaviorMetricsSnapshot,
  ComfortMetricsSnapshot,
  ExperimentCompareCohort,
  ExperimentCompareMetricPair,
  ExperimentCompareRequest,
  ExperimentCompareVisibility,
  ExperimentCompareVisibilityFact,
  ExperimentRerunCompleted,
  ExperimentRerunProfile,
  ExperimentRerunRequest,
} from '../../src/experiments';
import type { ParameterKey } from '../../src/profiles';
import {
  RERUN_FIXTURE,
  createRerunFixture,
  createRerunProfile,
  createRerunScenario,
  publishRerunProfile,
  rerunRequest,
} from './experiment-rerun-fixture';

/**
 * Deterministic fixture for PBI 143.
 *
 * Every cohort is a real `runExperimentRerun` over the real 140 fixture (the 206 capture of the
 * 70-vehicle world at tick 60) with the real 105 profiles published through the real 041 boundary.
 * Nothing about the rerun is re-implemented: the comparison reads the results 142 produced.
 *
 * The suite covers the three controlled cases of the PBI verification plus a multi-seed sample:
 *
 * 1. `identical-pair` — two profile versions with exactly the same seven policy values, so the
 *    control must report zero differences.
 * 2. `isolated-red-stop-probability` — the cautious profile against the same profile with only
 *    `red_stop_probability` set to 0, so every red-like opportunity must differ by that parameter
 *    alone.
 * 3. `isolated-red-stop-line-offset` — only `red_stop_line_offset` changes (1.2 m → 5 m, the catalog
 *    maximum), so only the opportunities whose 4 m stop line crosses the new offset differ.
 * 4. `complex-seed-*` — the real PRUDENT/IMPULSIVE pair (seven keys differ) on three base seeds,
 *    142 000/142 001/142 002, which is the multi-seed sample the docs ask for.
 *
 * Visibility is a declared controlled fixture fact, not a measurement: the camera of this fixture
 * sees `taxi-01`..`taxi-08`, so 8 of the 24 authored opportunities are visible and 16 are invisible.
 * The real game supplies the same fact from the camera contract instead.
 */

/** The seven policy keys a compare decision depends on. */
export const COMPARE_PROFILE_KEYS: readonly ParameterKey[] = Object.freeze([
  'red_stop_probability',
  'green_start_delay',
  'red_stop_line_offset',
  'late_red_brake_threshold',
  'stop_full_probability',
  'stop_dwell_time',
  'stop_line_offset',
] as ParameterKey[]);

/** The vehicles this controlled fixture declares inside the camera view. */
export const COMPARE_VISIBLE_VEHICLES: readonly string[] = Object.freeze(
  Array.from({ length: 8 }, (_, index) => `taxi-${String(index + 1).padStart(2, '0')}`),
);

export const COMPARE_FIXTURE = Object.freeze({
  suiteId: 'suite-143-compare',
  baseSeeds: Object.freeze([142_000, 142_001, 142_002]),
  opportunities: RERUN_FIXTURE.opportunityCount,
  visibleOpportunities: 8,
  invisibleOpportunities: 16,
  versionIds: Object.freeze({
    identicalLeft: 'prudent-143-identical-left@1',
    identicalRight: 'prudent-143-identical-right@1',
    isolatedProbability: 'prudent-143-isolated-probability@1',
    isolatedOffset: 'prudent-143-isolated-offset@1',
    prudent: 'prudent-143@1',
    impulsive: 'impulsive-143@1',
  }),
  cohortIds: Object.freeze({
    identical: 'identical-pair',
    probability: 'isolated-red-stop-probability',
    offset: 'isolated-red-stop-line-offset',
    complex: Object.freeze(['complex-seed-142000', 'complex-seed-142001', 'complex-seed-142002']),
  }),
});

/** Runs one real 142 cohort; a refusal is a fixture bug, so it throws with the reason. */
export function runCompareCohort(
  profiles: readonly ExperimentRerunProfile[],
  baseSeed: number = RERUN_FIXTURE.baseSeed,
  overrides: Partial<ExperimentRerunRequest> = {},
): ExperimentRerunCompleted {
  const fixture = createRerunFixture();
  const result = runExperimentRerun(
    rerunRequest(fixture, {
      baseSeed,
      profiles: Object.freeze([...profiles]),
      ...overrides,
    }),
    fixture.ports,
  );
  if (result.status !== 'RERUN')
    throw new Error(`143 fixture: the 142 rerun refused: ${JSON.stringify(result).slice(0, 400)}`);
  return result;
}

/** Visibility facts bound to the real decision tick of every authored opportunity. */
export function compareVisibility(
  rerun: ExperimentRerunCompleted,
  source: ExperimentCompareVisibility['source'] = 'CONTROLLED_FIXTURE',
): ExperimentCompareVisibility {
  const run = rerun.runs[0];
  if (run === undefined) throw new Error('143 fixture: the rerun has no run');
  const visible = new Set(COMPARE_VISIBLE_VEHICLES);
  const facts: ExperimentCompareVisibilityFact[] = run.decisions.map((decision) =>
    Object.freeze({
      opportunityKey: decision.opportunityKey,
      decisionTick: decision.decisionTick,
      visible: visible.has(decision.vehicleId),
    }),
  );
  return Object.freeze({ source, facts: Object.freeze(facts) });
}

function prudent(versionId: string, overrides: Partial<Record<ParameterKey, number>> = {}) {
  return publishRerunProfile('PRUDENT', versionId, overrides);
}

function impulsive(versionId: string) {
  return publishRerunProfile('IMPULSIVE', versionId);
}

export interface CompareFixture {
  readonly cohorts: readonly ExperimentCompareCohort[];
  request(overrides?: Partial<ExperimentCompareRequest>): ExperimentCompareRequest;
  /** Visibility for a rerun, so a probe can break exactly one fact. */
  visibilityOf(rerun: ExperimentRerunCompleted): ExperimentCompareVisibility;
}

/** The six real cohorts, each run once. */
export function createCompareFixture(): CompareFixture {
  const identical = runCompareCohort([
    prudent(COMPARE_FIXTURE.versionIds.identicalLeft),
    prudent(COMPARE_FIXTURE.versionIds.identicalRight),
  ]);
  const probability = runCompareCohort([
    prudent(COMPARE_FIXTURE.versionIds.prudent),
    prudent(COMPARE_FIXTURE.versionIds.isolatedProbability, { red_stop_probability: 0 }),
  ]);
  const offset = runCompareCohort([
    prudent(COMPARE_FIXTURE.versionIds.prudent),
    prudent(COMPARE_FIXTURE.versionIds.isolatedOffset, { red_stop_line_offset: 5 }),
  ]);
  const complex = COMPARE_FIXTURE.baseSeeds.map((baseSeed) =>
    runCompareCohort(
      [
        prudent(COMPARE_FIXTURE.versionIds.prudent),
        impulsive(COMPARE_FIXTURE.versionIds.impulsive),
      ],
      baseSeed,
    ),
  );
  const complexCohorts: ExperimentCompareCohort[] = complex.map((rerun, index) =>
    Object.freeze({
      cohortId: COMPARE_FIXTURE.cohortIds.complex[index] ?? `complex-${index}`,
      caseKind: 'COMPLEX_STYLE' as const,
      rerun,
      visibility: compareVisibility(rerun),
    }),
  );
  const cohorts: readonly ExperimentCompareCohort[] = Object.freeze([
    Object.freeze({
      cohortId: COMPARE_FIXTURE.cohortIds.identical,
      caseKind: 'IDENTICAL_PROFILE' as const,
      rerun: identical,
      visibility: compareVisibility(identical),
    }),
    Object.freeze({
      cohortId: COMPARE_FIXTURE.cohortIds.probability,
      caseKind: 'ISOLATED_PARAMETER' as const,
      targetParameter: 'red_stop_probability' as const,
      rerun: probability,
      visibility: compareVisibility(probability, 'CAMERA'),
    }),
    Object.freeze({
      cohortId: COMPARE_FIXTURE.cohortIds.offset,
      caseKind: 'ISOLATED_PARAMETER' as const,
      targetParameter: 'red_stop_line_offset' as const,
      rerun: offset,
      visibility: compareVisibility(offset),
    }),
    ...complexCohorts,
  ]);
  return Object.freeze({
    cohorts,
    request(overrides: Partial<ExperimentCompareRequest> = {}): ExperimentCompareRequest {
      return Object.freeze({
        suiteId: COMPARE_FIXTURE.suiteId,
        cohorts,
        ...overrides,
      });
    },
    visibilityOf: (rerun: ExperimentRerunCompleted) => compareVisibility(rerun),
  });
}

/* ------------------------------------------------------------------ metrics */

/**
 * Two real read models for the delta layer. The 138 aggregate is built through the real incremental
 * API from two resolved STOP opportunities (one success, one violation); the 139 aggregate is built
 * from one real passenger interval. They are fixture aggregates, not a measurement of the rerun, and
 * the evidence says so.
 */
export function behaviorSnapshotFor(violations: boolean): BehaviorMetricsSnapshot {
  const behavior = createBehaviorMetrics();
  behavior.ingest({
    eventId: 'compare:stop:1',
    kind: 'OPPORTUNITY_RESOLVED',
    opportunityId: 'stop-143-1',
    occurrence: 1,
    opportunityKind: 'STOP',
    vehicleId: 'taxi-01',
    resolvedTick: 61,
    outcome: 'STOPPED',
    success: true,
    violation: false,
    reactionTicks: null,
    dwellTicks: 90,
    headwaySeconds: null,
    speedMps: 0,
    limitMps: null,
  });
  if (violations) {
    behavior.ingest({
      eventId: 'compare:stop:2',
      kind: 'OPPORTUNITY_RESOLVED',
      opportunityId: 'stop-143-2',
      occurrence: 1,
      opportunityKind: 'STOP',
      vehicleId: 'taxi-02',
      resolvedTick: 62,
      outcome: 'CROSSED_WITHOUT_STOP',
      success: false,
      violation: true,
      reactionTicks: null,
      dwellTicks: null,
      headwaySeconds: null,
      speedMps: 3,
      limitMps: null,
    });
  }
  return behavior.snapshot({ tick: 84 });
}

export function comfortSnapshotFor(accelerations: readonly number[]): ComfortMetricsSnapshot {
  const comfort = createComfortMetrics();
  accelerations.forEach((acceleration, index) => {
    comfort.ingest({
      eventId: `compare:interval:${index}`,
      kind: 'PASSENGER_INTERVAL',
      rideId: 'ride-143',
      vehicleId: 'taxi-01',
      controlMode: 'AUTO',
      learningEligible: false,
      fromTick: 61 + index * 10,
      toTick: 71 + index * 10,
      durationSeconds: 10,
      longitudinalAccelerationMps2: acceleration,
      lateralAccelerationMps2: null,
      lateralLimitMps2: null,
    });
  });
  return comfort.snapshot({ tick: 84 });
}

/** The 138/139 pairs, bound to the first complex cohort and its real PRUDENT/IMPULSIVE pair. */
export function compareMetrics(): readonly ExperimentCompareMetricPair[] {
  const cohortId = COMPARE_FIXTURE.cohortIds.complex[0] ?? 'complex-seed-142000';
  const behaviorLeft = behaviorSnapshotFor(false).overall.violationRate;
  const behaviorRight = behaviorSnapshotFor(true).overall.violationRate;
  const comfortLeft = comfortSnapshotFor([1.2]).overall;
  const comfortRight = comfortSnapshotFor([1.2, 3]).overall;
  return Object.freeze([
    Object.freeze({
      cohortId,
      leftProfileVersionId: COMPARE_FIXTURE.versionIds.prudent,
      rightProfileVersionId: COMPARE_FIXTURE.versionIds.impulsive,
      source: 'BEHAVIOR_138' as const,
      id: 'overall.violationRate',
      unit: '%',
      left: Object.freeze({
        state: behaviorLeft.state,
        value: behaviorLeft.value,
        sampleSize: behaviorLeft.sampleSize,
      }),
      right: Object.freeze({
        state: behaviorRight.state,
        value: behaviorRight.value,
        sampleSize: behaviorRight.sampleSize,
      }),
    }),
    Object.freeze({
      cohortId,
      leftProfileVersionId: COMPARE_FIXTURE.versionIds.prudent,
      rightProfileVersionId: COMPARE_FIXTURE.versionIds.impulsive,
      source: 'COMFORT_139' as const,
      id: 'overall.meanAccelerationAbsMps2',
      unit: 'm/s²',
      left: Object.freeze({
        state: 'AVAILABLE' as const,
        value: comfortLeft.meanAccelerationAbsMps2,
        sampleSize: comfortLeft.intervals,
      }),
      right: Object.freeze({
        state: 'AVAILABLE' as const,
        value: comfortRight.meanAccelerationAbsMps2,
        sampleSize: comfortRight.intervals,
      }),
    }),
  ]);
}

/** A fixture request with the 138/139 deltas attached. */
export function compareRequest(fixture: CompareFixture): ExperimentCompareRequest {
  return fixture.request({ metrics: compareMetrics() });
}

/** A profile with a raw, unpublished parameter map, to build invalid isolated probes. */
export function rawCompareProfile(
  versionId: string,
  parameters: Readonly<Record<string, number>>,
): ExperimentRerunProfile {
  return publishRerunProfile(
    'PRUDENT',
    versionId,
    parameters as Partial<Record<ParameterKey, number>>,
  );
}

/** The real 105 profile with one or more policy keys overridden, for probe cohorts. */
export function compareProfile(
  profileId: 'PRUDENT' | 'IMPULSIVE',
  versionId: string,
  overrides: Partial<Record<ParameterKey, number>> = {},
): ExperimentRerunProfile {
  return publishRerunProfile(profileId, versionId, overrides);
}

/** A 142 result that refused the snapshot, to prove the compare layer carries the refusal. */
export function runRefusedCompareCohort():
  ExperimentRerunCompleted | { readonly status: 'REFUSED' } {
  const world = createRerunFixture();
  return runExperimentRerun(
    rerunRequest(world, {
      snapshot: {
        ...world.snapshot,
        storedVersions: {
          engineVersion: 'babylon-9.28.0',
          physicsVersion: 'ammo-0.4.0',
          mapVersion: 'city-v2',
        },
      },
    }),
    world.ports,
  );
}

/** Re-exported so the report can name the scenario without importing 142 internals twice. */
export const COMPARE_SCENARIO_ID = RERUN_FIXTURE.scenarioId;

/** The unchanged PRUDENT profile, useful for probes that need a valid reference. */
export function comparePrudentProfile(): ExperimentRerunProfile {
  return createRerunProfile('PRUDENT');
}

/** A fresh scenario, so a probe can change one authored opportunity without touching the fixture. */
export function compareScenario() {
  return createRerunScenario();
}
