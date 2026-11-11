import { getParameterDefinition } from '../profiles';
import type { ParameterKey } from '../profiles';
import {
  EXPERIMENT_RERUN_VERSION,
  experimentRerunDivergenceCauses,
  experimentRerunOpportunityKinds,
  experimentRerunPolicyKeys,
} from './experiment-rerun';
import type {
  ExperimentRerunComparison,
  ExperimentRerunCompleted,
  ExperimentRerunDivergence,
  ExperimentRerunDivergenceCause,
  ExperimentRerunOpportunityKind,
} from './experiment-rerun';

/**
 * 143 A/B comparison with distributions and evidence.
 *
 * The comparison is a **read model over the 142 rerun results**, never a second derivation:
 * `readExperimentComparison` consumes finished `142-experiment-rerun-v1` results and copies the
 * divergences 142 already reported (opportunity, tick, both decisions, cause, parameter) together
 * with its own `causeCounts`, `parameterCounts`, `profileDifferences` and reproducibility
 * declaration. It never re-evaluates the 050/051 policies, never re-samples a seed and never
 * re-classifies a divergence, so a compare run cannot disagree with the rerun that produced it.
 *
 * What this layer adds on top of the rerun is exactly what an experiment report needs and the
 * rerun does not own:
 *
 * 1. **A cause distribution that is never collapsed onto one parameter.** Every divergence keeps the
 *    cause and parameter 142 named; the read model aggregates causes, parameters, opportunity
 *    categories and unattributed cases separately, and reports when the *same opportunity* is
 *    explained by two different causes in two controlled cohorts (`coexistence`).
 * 2. **Exposure with real counts.** The authored opportunity instances are the evaluated set; each
 *    one carries a visibility fact (camera or explicitly controlled fixture) bound to its decision
 *    tick, so the read model can say how many opportunities were evaluated, how many were visible
 *    and invisible, on which tick window — and refuses an incomplete visibility set instead of
 *    guessing.
 * 3. **A declared sample size.** Distinct base seeds, scenario seeds and opportunity seeds are
 *    counted, the per-seed divergence counts are kept side by side with their real minimum and
 *    maximum, and the uncertainty is stated explicitly: this sample describes these decisions, it is
 *    not an estimate for other seeds or for the live city.
 * 4. **Isolated scenarios that change one parameter.** An `ISOLATED_PARAMETER` cohort is accepted
 *    only when exactly one profile parameter differs and it is the declared target; the read model
 *    then proves that only the target was named by the divergences, so a single-parameter claim
 *    cannot be faked with a complex pair.
 * 5. **Metric deltas read from 138/139.** Optional pairs are bound to a cohort and a profile pair; a
 *    value that either side marked unavailable produces `UNAVAILABLE`, never a fabricated zero.
 */

export const EXPERIMENT_COMPARE_VERSION = '143-experiment-compare-v1' as const;

/** The three controlled cases the PBI verification asks for. */
export const experimentCompareCaseKinds = [
  'IDENTICAL_PROFILE',
  'ISOLATED_PARAMETER',
  'COMPLEX_STYLE',
] as const;
export type ExperimentCompareCaseKind = (typeof experimentCompareCaseKinds)[number];

/** Where the visible/invisible fact comes from; it is never inferred from a count. */
export const experimentCompareVisibilitySources = ['CAMERA', 'CONTROLLED_FIXTURE'] as const;
export type ExperimentCompareVisibilitySource = (typeof experimentCompareVisibilitySources)[number];

/** The already aggregated read models a delta may be read from. */
export const experimentCompareMetricSources = ['BEHAVIOR_138', 'COMFORT_139'] as const;
export type ExperimentCompareMetricSource = (typeof experimentCompareMetricSources)[number];

/** Closed refusal codes; a refusal names every affected cohort or path, not only the first one. */
export const experimentCompareRefusalCodes = [
  /** The 142 result inside a cohort is not a completed rerun. */
  'RERUN_NOT_READY',
  /** The 142 result was produced by a different rerun contract version. */
  'RERUN_VERSION_MISMATCH',
  /** A 142 comparison no longer proves the same request/seed/state. */
  'RERUN_INCONSISTENT',
  /** Two cohorts share one id, so the suite cannot be addressed. */
  'COHORT_DUPLICATE',
  /** A pairwise case kind was given more than one comparison. */
  'COHORT_NOT_PAIRWISE',
  /** The identical-profile control actually differs in a parameter. */
  'IDENTICAL_PROFILE_DIFFERS',
  /** The identical-profile control still diverged, so it is not a control. */
  'IDENTICAL_PROFILE_DIVERGED',
  /** A complex-style case differs in fewer than two parameters, so it is not a complex style. */
  'COMPLEX_STYLE_NOT_COMPLEX',
  /** An isolated cohort lacks a target parameter, or the target is not a policy key. */
  'ISOLATED_TARGET_MISSING',
  /** An isolated cohort differs in more than the target, or in something else. */
  'ISOLATED_PARAMETER_NOT_ISOLATED',
  /** The visibility facts do not cover exactly the evaluated opportunities. */
  'EXPOSURE_INCOMPLETE',
  /** A visibility fact is bound to a tick that is not the decision tick of its opportunity. */
  'EXPOSURE_TICK_MISMATCH',
  /** The visibility fact declares no supported source. */
  'VISIBILITY_SOURCE_INVALID',
  /** A metric pair names a cohort or a profile pair the suite does not contain. */
  'METRIC_UNBOUND',
  /** A metric pair is malformed (missing id/unit or a non-numeric available value). */
  'METRIC_INVALID',
] as const;
export type ExperimentCompareRefusalCode = (typeof experimentCompareRefusalCodes)[number];

export const experimentCompareInputCodes = ['INVALID_REQUEST'] as const;
export type ExperimentCompareInputCode = (typeof experimentCompareInputCodes)[number];

export class ExperimentCompareError extends Error {
  readonly code: ExperimentCompareInputCode;
  readonly path: string;

  constructor(code: ExperimentCompareInputCode, message: string, path: string) {
    super(message);
    this.name = 'ExperimentCompareError';
    this.code = code;
    this.path = path;
  }
}

/* ------------------------------------------------------------------ request */

/** One visibility fact per evaluated opportunity, bound to the tick it was evaluated at. */
export interface ExperimentCompareVisibilityFact {
  readonly opportunityKey: string;
  readonly decisionTick: number;
  readonly visible: boolean;
}

export interface ExperimentCompareVisibility {
  readonly source: ExperimentCompareVisibilitySource;
  readonly facts: readonly ExperimentCompareVisibilityFact[];
}

/** One already aggregated 138/139 value, as the producing read model returned it. */
export interface ExperimentCompareMetricValue {
  readonly state: 'AVAILABLE' | 'UNAVAILABLE';
  readonly value: number | null;
  readonly sampleSize: number | null;
}

export interface ExperimentCompareMetricPair {
  /** The cohort whose profile pair produced the two values. */
  readonly cohortId: string;
  readonly leftProfileVersionId: string;
  readonly rightProfileVersionId: string;
  readonly source: ExperimentCompareMetricSource;
  readonly id: string;
  readonly unit: string;
  readonly left: ExperimentCompareMetricValue;
  readonly right: ExperimentCompareMetricValue;
}

export interface ExperimentCompareCohort {
  /** Stable suite-local label; a cohort is one scenario run through one profile pair. */
  readonly cohortId: string;
  readonly caseKind: ExperimentCompareCaseKind;
  /** The finished 142 result; it is read, never recomputed and never mutated. */
  readonly rerun: ExperimentRerunCompleted;
  /** `ISOLATED_PARAMETER` only: the one parameter that is allowed to differ. */
  readonly targetParameter?: ParameterKey;
  readonly visibility: ExperimentCompareVisibility;
}

export interface ExperimentCompareRequest {
  readonly suiteId: string;
  readonly cohorts: readonly ExperimentCompareCohort[];
  /** Optional 138/139 deltas, each bound to one cohort profile pair. */
  readonly metrics?: readonly ExperimentCompareMetricPair[];
}

/* ------------------------------------------------------------------- result */

/** One divergence, copied from 142 with the profile pair that produced it. */
export interface ExperimentCompareDivergenceRow {
  readonly cohortId: string;
  readonly caseKind: ExperimentCompareCaseKind;
  readonly leftProfileVersionId: string;
  readonly rightProfileVersionId: string;
  readonly opportunityKey: string;
  readonly kind: ExperimentRerunOpportunityKind;
  readonly decisionTick: number;
  readonly vehicleId: string;
  readonly cause: ExperimentRerunDivergenceCause;
  readonly parameter: string | null;
  readonly leftAction: string;
  readonly leftReason: string;
  readonly rightAction: string;
  readonly rightReason: string;
  readonly leftSampledUnit: number | null;
  readonly rightSampledUnit: number | null;
  readonly leftThreshold: number | null;
  readonly rightThreshold: number | null;
}

export interface ExperimentCompareParameterRow {
  readonly key: string;
  readonly count: number;
  /** `count / divergent`, or `null` when nothing diverged. */
  readonly share: number | null;
}

export interface ExperimentCompareCategoryRow {
  readonly kind: ExperimentRerunOpportunityKind;
  readonly opportunities: number;
  /** opportunity instances × profiles, i.e. the decisions actually compared. */
  readonly evaluations: number;
  readonly divergent: number;
}

/** Per-cohort attribution summary; the read model never merges it into one parameter. */
export interface ExperimentCompareAttribution {
  readonly divergent: number;
  readonly identical: number;
  readonly unattributed: number;
  readonly seedDivergences: number;
  readonly withoutParameter: number;
  readonly distinctCauses: number;
  readonly distinctParameters: number;
  readonly dominantParameter: ExperimentCompareParameterRow | null;
  /** True only when every divergence names the same single parameter. */
  readonly allOnOneParameter: boolean;
}

export interface ExperimentCompareProfileExposure {
  readonly profileId: string;
  readonly profileVersionId: string;
  readonly evaluated: number;
  readonly visible: number;
  readonly invisible: number;
  readonly visibleFraction: number | null;
}

export interface ExperimentCompareCohortExposure {
  readonly source: ExperimentCompareVisibilitySource;
  readonly facts: number;
  readonly evaluatedOpportunities: number;
  /** opportunity instances × profiles: every decision that was exposed and counted. */
  readonly evaluations: number;
  readonly visible: number;
  readonly invisible: number;
  readonly visibleFraction: number | null;
  readonly tickWindow: Readonly<{ fromTick: number; toTick: number; ticks: number }>;
  readonly profiles: readonly ExperimentCompareProfileExposure[];
}

export interface ExperimentCompareIsolatedRead {
  readonly cohortId: string;
  readonly targetParameter: ParameterKey;
  readonly unit: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly left: number;
  readonly right: number;
  /** Every key whose value really differs between the two profile versions. */
  readonly changedParameters: readonly string[];
  /** Exactly one key differs and it is the target. */
  readonly onlyTargetChanged: boolean;
  readonly divergences: number;
  /** Parameters named by the 142 divergences of this cohort, sorted. */
  readonly namedParameters: readonly string[];
  /** Named parameters that are not the target; empty for a valid isolated scenario. */
  readonly foreignParameters: readonly string[];
  readonly targetNamed: number;
  /** No foreign parameter is named, and a divergence that exists names the target. */
  readonly attributable: boolean;
}

export interface ExperimentCompareCohortRead {
  readonly cohortId: string;
  readonly caseKind: ExperimentCompareCaseKind;
  readonly targetParameter: ParameterKey | null;
  readonly profileVersionIds: readonly string[];
  readonly scenario: Readonly<{
    scenarioId: string;
    ticks: number;
    fromTick: number;
    toTick: number;
    opportunities: number;
    kinds: Readonly<Record<string, number>>;
    profiles: number;
    comparisons: number;
  }>;
  readonly seed: Readonly<{
    baseSeed: number;
    baseSeedHex: string;
    scenarioSeed: number;
    scenarioSeedHex: string;
    opportunitySeeds: number;
    profileIdentityInSeed: false;
  }>;
  readonly attribution: ExperimentCompareAttribution;
  readonly causes: Readonly<Record<ExperimentRerunDivergenceCause, number>>;
  readonly parameters: readonly ExperimentCompareParameterRow[];
  readonly categories: readonly ExperimentCompareCategoryRow[];
  readonly divergences: readonly ExperimentCompareDivergenceRow[];
  readonly exposure: ExperimentCompareCohortExposure;
  readonly isolated: ExperimentCompareIsolatedRead | null;
}

export interface ExperimentCompareDistribution {
  readonly cohorts: number;
  readonly evaluations: number;
  readonly decisions: number;
  readonly identical: number;
  readonly divergent: number;
  readonly causes: Readonly<Record<ExperimentRerunDivergenceCause, number>>;
  readonly parameters: readonly ExperimentCompareParameterRow[];
  readonly categories: readonly ExperimentCompareCategoryRow[];
  readonly unattributed: number;
  readonly seedDivergences: number;
  readonly withoutParameter: number;
  readonly attributed: number;
  readonly distinctCauses: number;
  readonly distinctParameters: number;
  readonly dominantParameter: ExperimentCompareParameterRow | null;
  readonly caseKinds: Readonly<
    Record<
      ExperimentCompareCaseKind,
      Readonly<{
        cohorts: number;
        divergent: number;
        distinctParameters: number;
        allOnOneParameter: boolean;
      }>
    >
  >;
  /** Cohorts of a complex style whose divergences all name one parameter; must stay empty. */
  readonly singleParameterOnlyCases: readonly string[];
  /** Criterion 1: no complex-style result attributes every difference to one parameter. */
  readonly criterionSatisfied: boolean;
}

export interface ExperimentCompareWindow {
  readonly fromTick: number;
  readonly toTick: number;
  readonly ticks: number;
  readonly cohorts: readonly string[];
  readonly sources: readonly ExperimentCompareVisibilitySource[];
}

export interface ExperimentCompareExposureSummary {
  readonly evaluations: number;
  readonly visible: number;
  readonly invisible: number;
  readonly visibleFraction: number | null;
  readonly evaluatedOpportunities: number;
  readonly windows: readonly ExperimentCompareWindow[];
  readonly sources: readonly ExperimentCompareVisibilitySource[];
  /** Explicit: a visibility fact is declared by the caller, never guessed from a count. */
  readonly declared: true;
}

export interface ExperimentCompareSeedRow {
  readonly baseSeed: number;
  readonly baseSeedHex: string;
  readonly scenarioSeedHex: string;
  readonly cohorts: number;
  readonly decisions: number;
  readonly identical: number;
  readonly divergent: number;
  readonly unattributed: number;
  readonly parameters: readonly string[];
}

export interface ExperimentCompareSeeds {
  readonly baseSeeds: readonly number[];
  readonly scenarioSeeds: readonly number[];
  readonly distinctBaseSeeds: number;
  readonly distinctScenarioSeeds: number;
  /** Distinct opportunity seeds across every cohort and every authored opportunity. */
  readonly distinctOpportunitySeeds: number;
  readonly perSeed: readonly ExperimentCompareSeedRow[];
}

export interface ExperimentCompareUncertainty {
  readonly status: 'SINGLE_SEED_SAMPLE' | 'MULTI_SEED_SAMPLE';
  readonly seeds: number;
  readonly cohorts: number;
  readonly evaluations: number;
  readonly decisions: number;
  readonly divergences: number;
  /** Real per-seed minimum and maximum of the divergence count; no interval is invented. */
  readonly divergentMin: number;
  readonly divergentMax: number;
  readonly divergentSpread: number;
  readonly generalizable: false;
  readonly statement: string;
  readonly limitations: readonly string[];
}

/** The same opportunity explained by two different causes in two controlled cohorts. */
export interface ExperimentCompareOpportunityCauses {
  readonly opportunityKey: string;
  readonly kind: ExperimentRerunOpportunityKind;
  readonly causes: readonly Readonly<{
    cohortId: string;
    caseKind: ExperimentCompareCaseKind;
    baseSeed: number;
    decisionTick: number;
    cause: ExperimentRerunDivergenceCause;
    parameter: string | null;
  }>[];
  readonly distinctCauses: number;
  readonly distinctParameters: number;
  readonly coexists: boolean;
}

export interface ExperimentCompareCoexistence {
  readonly opportunities: readonly ExperimentCompareOpportunityCauses[];
  readonly total: number;
  readonly coexisting: number;
  /** Opportunities whose divergences name one cause under every cohort. */
  readonly singleCause: number;
}

export interface ExperimentCompareMetricDelta {
  readonly cohortId: string;
  readonly leftProfileVersionId: string;
  readonly rightProfileVersionId: string;
  readonly source: ExperimentCompareMetricSource;
  readonly id: string;
  readonly unit: string;
  readonly left: number | null;
  readonly right: number | null;
  readonly leftSampleSize: number | null;
  readonly rightSampleSize: number | null;
  /** `right - left`, only when both sides are genuinely available. */
  readonly delta: number | null;
  readonly state: 'DELTA' | 'UNAVAILABLE';
  readonly reason: 'LEFT_UNAVAILABLE' | 'RIGHT_UNAVAILABLE' | null;
  readonly direction: 'HIGHER' | 'LOWER' | 'EQUAL' | null;
}

export interface ExperimentCompareReady {
  readonly status: 'READY';
  readonly version: typeof EXPERIMENT_COMPARE_VERSION;
  readonly suiteId: string;
  readonly cohorts: readonly ExperimentCompareCohortRead[];
  readonly distribution: ExperimentCompareDistribution;
  readonly exposure: ExperimentCompareExposureSummary;
  readonly seeds: ExperimentCompareSeeds;
  readonly uncertainty: ExperimentCompareUncertainty;
  readonly isolated: readonly ExperimentCompareIsolatedRead[];
  readonly coexistence: ExperimentCompareCoexistence;
  readonly metrics: readonly ExperimentCompareMetricDelta[];
  /** Deterministic digest of the whole read, for UI cache skips and freshness checks. */
  readonly signature: string;
  /** Structural: the whole read was built from finished 142 results, never from a policy call. */
  readonly sources: Readonly<{ rerun: typeof EXPERIMENT_RERUN_VERSION; policiesEvaluated: 0 }>;
}

export interface ExperimentCompareRefused {
  readonly status: 'REFUSED';
  readonly version: typeof EXPERIMENT_COMPARE_VERSION;
  readonly suiteId: string;
  readonly codes: readonly ExperimentCompareRefusalCode[];
  readonly paths: readonly string[];
  readonly detail: string;
}

export type ExperimentCompareResult = ExperimentCompareReady | ExperimentCompareRefused;

/* ---------------------------------------------------------------- internals */

const POLICY_KEYS: readonly string[] = Array.from(
  new Set<string>([
    ...experimentRerunPolicyKeys.SIGNAL.map((key) => String(key)),
    ...experimentRerunPolicyKeys.STOP.map((key) => String(key)),
  ]),
).sort();

interface Issue {
  readonly code: ExperimentCompareRefusalCode;
  readonly path: string;
  readonly detail: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function boundedText(value: unknown, path: string, maximum = 96): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new ExperimentCompareError('INVALID_REQUEST', 'Expected bounded text', path);
  }
  if (value.length > maximum) {
    throw new ExperimentCompareError(
      'INVALID_REQUEST',
      `Expected at most ${maximum} characters`,
      path,
    );
  }
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ExperimentCompareError('INVALID_REQUEST', 'Expected a finite number', path);
  }
  return value;
}

function safeInteger(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new ExperimentCompareError(
      'INVALID_REQUEST',
      `Expected a safe integer >= ${minimum}`,
      path,
    );
  }
  return value;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function share(count: number, total: number): number | null {
  return total === 0 ? null : round6(count / total);
}

function seedHex(seed: number): string {
  return seed.toString(16).padStart(8, '0');
}

/** Deterministic canonical text; used only for equality digests, never as a storage format. */
function canonicalText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalText(entry)).join(',')}]`;
  if (isPlainRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalText(value[key])}`).join(',')}}`;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (value === undefined) return 'null';
  return JSON.stringify(value);
}

/** 32-bit `FNV-1a` over the canonical text, identical on every platform. */
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    hash = Math.imul(hash ^ (code & 0xff), 0x01000193);
    hash = Math.imul(hash ^ (code >>> 8), 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0).toString(16).padStart(8, '0');
}

function emptyCauses(): Record<ExperimentRerunDivergenceCause, number> {
  const causes = {} as Record<ExperimentRerunDivergenceCause, number>;
  for (const cause of experimentRerunDivergenceCauses) causes[cause] = 0;
  return causes;
}

function parameterRows(counts: Readonly<Record<string, number>>, divergent: number) {
  return Object.freeze(
    Object.keys(counts)
      .sort((left, right) => {
        const difference = (counts[right] ?? 0) - (counts[left] ?? 0);
        return difference !== 0 ? difference : left < right ? -1 : 1;
      })
      .map((key) =>
        Object.freeze({ key, count: counts[key] ?? 0, share: share(counts[key] ?? 0, divergent) }),
      ),
  );
}

function dominantParameterRow(
  rows: readonly ExperimentCompareParameterRow[],
): ExperimentCompareParameterRow | null {
  return rows[0] ?? null;
}

function uniqueSortedNumbers(values: readonly number[]): readonly number[] {
  return Object.freeze([...new Set(values)].sort((left, right) => left - right));
}

function uniqueSortedText(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

/** The evaluated decision identity of one run, copied from the 142 decisions. */
interface DecisionRow {
  readonly opportunityKey: string;
  readonly kind: ExperimentRerunOpportunityKind;
  readonly decisionTick: number;
  readonly vehicleId: string;
}

function decisionRows(rerun: ExperimentRerunCompleted): readonly DecisionRow[] {
  const run = rerun.runs[0];
  if (run === undefined) return Object.freeze([]);
  return Object.freeze(
    run.decisions.map((decision) =>
      Object.freeze({
        opportunityKey: decision.opportunityKey,
        kind: decision.kind,
        decisionTick: decision.decisionTick,
        vehicleId: decision.vehicleId,
      }),
    ),
  );
}

function divergenceRows(
  cohort: ExperimentCompareCohort,
  comparison: ExperimentRerunComparison,
): readonly ExperimentCompareDivergenceRow[] {
  return Object.freeze(
    comparison.divergences.map((divergence: ExperimentRerunDivergence) =>
      Object.freeze({
        cohortId: cohort.cohortId,
        caseKind: cohort.caseKind,
        leftProfileVersionId: comparison.leftProfileVersionId,
        rightProfileVersionId: comparison.rightProfileVersionId,
        opportunityKey: divergence.opportunityKey,
        kind: divergence.kind,
        decisionTick: divergence.decisionTick,
        vehicleId: divergence.left.vehicleId,
        cause: divergence.cause,
        parameter: divergence.parameter,
        leftAction: divergence.left.action,
        leftReason: divergence.left.reason,
        rightAction: divergence.right.action,
        rightReason: divergence.right.reason,
        leftSampledUnit: divergence.left.sampledUnit,
        rightSampledUnit: divergence.right.sampledUnit,
        leftThreshold: divergence.left.threshold,
        rightThreshold: divergence.right.threshold,
      }),
    ),
  );
}

interface RowSummary {
  readonly attribution: ExperimentCompareAttribution;
  readonly causes: Readonly<Record<ExperimentRerunDivergenceCause, number>>;
  readonly parameters: Readonly<Record<string, number>>;
}

function summarizeRows(
  rows: readonly ExperimentCompareDivergenceRow[],
  comparisons: readonly ExperimentRerunComparison[],
): RowSummary {
  const causes = emptyCauses();
  const parameters: Record<string, number> = {};
  let unattributed = 0;
  let seedDivergences = 0;
  let withoutParameter = 0;
  for (const row of rows) {
    causes[row.cause] = (causes[row.cause] ?? 0) + 1;
    if (row.parameter === null) withoutParameter += 1;
    else parameters[row.parameter] = (parameters[row.parameter] ?? 0) + 1;
    if (row.cause === 'UNCLASSIFIED') unattributed += 1;
    if (row.cause === 'SEED_DIVERGENCE') seedDivergences += 1;
  }
  const divergent = rows.length;
  const identical = comparisons.reduce((total, comparison) => total + comparison.identical, 0);
  const rowsByCount = parameterRows(parameters, divergent);
  const distinctParameters = rowsByCount.length;
  const distinctCauses = experimentRerunDivergenceCauses.filter(
    (cause) => (causes[cause] ?? 0) > 0,
  ).length;
  return Object.freeze({
    causes: Object.freeze(causes),
    parameters: Object.freeze({ ...parameters }),
    attribution: Object.freeze({
      divergent,
      identical,
      unattributed,
      seedDivergences,
      withoutParameter,
      distinctCauses,
      distinctParameters,
      dominantParameter: dominantParameterRow(rowsByCount),
      allOnOneParameter:
        divergent > 0 &&
        distinctParameters === 1 &&
        withoutParameter === 0 &&
        (rowsByCount[0]?.count ?? 0) === divergent,
    }),
  });
}

function categoryRows(
  decisions: readonly DecisionRow[],
  divergenceRowsValue: readonly ExperimentCompareDivergenceRow[],
  profiles: number,
): readonly ExperimentCompareCategoryRow[] {
  return Object.freeze(
    experimentRerunOpportunityKinds.map((kind) => {
      const opportunities = decisions.filter((decision) => decision.kind === kind).length;
      const divergent = divergenceRowsValue.filter((row) => row.kind === kind).length;
      return Object.freeze({
        kind,
        opportunities,
        evaluations: opportunities * profiles,
        divergent,
      });
    }),
  );
}

function exposureOf(
  cohort: ExperimentCompareCohort,
  facts: ReadonlyMap<string, ExperimentCompareVisibilityFact>,
  decisions: readonly DecisionRow[],
  rerun: ExperimentRerunCompleted,
): ExperimentCompareCohortExposure {
  const profiles = rerun.runs.map((run) => {
    const visible = run.decisions.filter(
      (decision) => facts.get(decision.opportunityKey)?.visible === true,
    ).length;
    return Object.freeze({
      profileId: run.profileId,
      profileVersionId: run.profileVersionId,
      evaluated: run.decisions.length,
      visible,
      invisible: run.decisions.length - visible,
      visibleFraction: share(visible, run.decisions.length),
    });
  });
  const evaluations = profiles.reduce((total, profile) => total + profile.evaluated, 0);
  const visible = profiles.reduce((total, profile) => total + profile.visible, 0);
  return Object.freeze({
    source: cohort.visibility.source,
    facts: facts.size,
    evaluatedOpportunities: new Set(decisions.map((decision) => decision.opportunityKey)).size,
    evaluations,
    visible,
    invisible: evaluations - visible,
    visibleFraction: share(visible, evaluations),
    tickWindow: Object.freeze({
      fromTick: rerun.scenario.fromTick,
      toTick: rerun.scenario.toTick,
      ticks: rerun.scenario.ticks,
    }),
    profiles: Object.freeze(profiles),
  });
}

function readVisibility(
  cohort: ExperimentCompareCohort,
  decisions: readonly DecisionRow[],
  index: number,
  issues: Issue[],
): ReadonlyMap<string, ExperimentCompareVisibilityFact> {
  const path = `cohorts[${index}].visibility`;
  const visibility = cohort.visibility;
  if (!(experimentCompareVisibilitySources as readonly string[]).includes(visibility.source)) {
    issues.push({
      code: 'VISIBILITY_SOURCE_INVALID',
      path: `${path}.source`,
      detail: `${String(visibility.source)} is not a supported visibility source`,
    });
  }
  const facts = new Map<string, ExperimentCompareVisibilityFact>();
  for (const fact of visibility.facts) {
    if (facts.has(fact.opportunityKey)) {
      issues.push({
        code: 'EXPOSURE_INCOMPLETE',
        path: `${path}.facts.${fact.opportunityKey}`,
        detail: `The opportunity ${fact.opportunityKey} has more than one visibility fact`,
      });
      continue;
    }
    facts.set(fact.opportunityKey, fact);
  }
  for (const decision of decisions) {
    const fact = facts.get(decision.opportunityKey);
    if (fact === undefined) {
      issues.push({
        code: 'EXPOSURE_INCOMPLETE',
        path: `${path}.facts.${decision.opportunityKey}`,
        detail: `The evaluated opportunity ${decision.opportunityKey} has no visibility fact`,
      });
      continue;
    }
    if (fact.decisionTick !== decision.decisionTick) {
      issues.push({
        code: 'EXPOSURE_TICK_MISMATCH',
        path: `${path}.facts.${decision.opportunityKey}.decisionTick`,
        detail: `The visibility fact is bound to tick ${fact.decisionTick}, but the opportunity is decided at tick ${decision.decisionTick}`,
      });
    }
  }
  const evaluated = new Set(decisions.map((decision) => decision.opportunityKey));
  for (const key of facts.keys()) {
    if (evaluated.has(key)) continue;
    issues.push({
      code: 'EXPOSURE_INCOMPLETE',
      path: `${path}.facts.${key}`,
      detail: `The visibility fact ${key} names an opportunity the scenario does not evaluate`,
    });
  }
  return facts;
}

function readIsolated(
  cohort: ExperimentCompareCohort,
  comparison: ExperimentRerunComparison,
  rows: readonly ExperimentCompareDivergenceRow[],
  index: number,
  issues: Issue[],
): ExperimentCompareIsolatedRead | null {
  if (cohort.caseKind !== 'ISOLATED_PARAMETER') return null;
  const path = `cohorts[${index}].targetParameter`;
  const target = cohort.targetParameter;
  if (target === undefined || !POLICY_KEYS.includes(String(target))) {
    issues.push({
      code: 'ISOLATED_TARGET_MISSING',
      path,
      detail: `An isolated scenario must name one of ${POLICY_KEYS.join(', ')}`,
    });
    return null;
  }
  const changed = comparison.profileDifferences.filter((entry) => entry.differs);
  if (changed.length !== 1 || changed[0]?.key !== target) {
    issues.push({
      code: 'ISOLATED_PARAMETER_NOT_ISOLATED',
      path,
      detail: `Only ${target} may differ, but the profile versions differ in ${changed.map((entry) => entry.key).join(', ') || 'no key'}`,
    });
    return null;
  }
  const definition = getParameterDefinition(target);
  const value = comparison.profileDifferences.find((entry) => entry.key === target);
  const named = uniqueSortedText(
    rows.map((row) => row.parameter).filter((parameter): parameter is string => parameter !== null),
  );
  const foreign = Object.freeze(named.filter((parameter) => parameter !== target));
  const targetNamed = rows.filter((row) => row.parameter === target).length;
  if (foreign.length > 0) {
    issues.push({
      code: 'ISOLATED_PARAMETER_NOT_ISOLATED',
      path,
      detail: `The isolated ${target} scenario also names ${foreign.join(', ')}`,
    });
    return null;
  }
  return Object.freeze({
    cohortId: cohort.cohortId,
    targetParameter: target,
    unit: definition.unit,
    minimum: definition.min,
    maximum: definition.max,
    left: value?.left ?? Number.NaN,
    right: value?.right ?? Number.NaN,
    changedParameters: Object.freeze(changed.map((entry) => entry.key)),
    onlyTargetChanged: changed.length === 1 && changed[0]?.key === target,
    divergences: rows.length,
    namedParameters: named,
    foreignParameters: foreign,
    targetNamed,
    attributable: foreign.length === 0 && (rows.length === 0 || targetNamed === rows.length),
  });
}

function checkCaseKind(
  cohort: ExperimentCompareCohort,
  comparisons: readonly ExperimentRerunComparison[],
  index: number,
  issues: Issue[],
): void {
  const base = `cohorts[${index}]`;
  const pairwise =
    cohort.caseKind === 'IDENTICAL_PROFILE' || cohort.caseKind === 'ISOLATED_PARAMETER';
  if (pairwise && comparisons.length !== 1) {
    issues.push({
      code: 'COHORT_NOT_PAIRWISE',
      path: `${base}.rerun.comparisons`,
      detail: `${cohort.caseKind} compares exactly two profile versions, but the rerun has ${comparisons.length} comparisons`,
    });
  }
  const comparison = comparisons[0];
  if (comparison === undefined) return;
  const changed = comparison.profileDifferences.filter((entry) => entry.differs);
  if (cohort.caseKind === 'IDENTICAL_PROFILE' && changed.length > 0) {
    issues.push({
      code: 'IDENTICAL_PROFILE_DIFFERS',
      path: `${base}.rerun.comparisons[0].profileDifferences`,
      detail: `The identical-profile control differs in ${changed.map((entry) => entry.key).join(', ')}`,
    });
  }
  if (cohort.caseKind === 'IDENTICAL_PROFILE' && comparison.divergent > 0) {
    issues.push({
      code: 'IDENTICAL_PROFILE_DIVERGED',
      path: `${base}.rerun.comparisons[0].divergences`,
      detail: `The identical-profile control still has ${comparison.divergent} divergent opportunities`,
    });
  }
  if (cohort.caseKind === 'COMPLEX_STYLE' && changed.length < 2) {
    issues.push({
      code: 'COMPLEX_STYLE_NOT_COMPLEX',
      path: `${base}.rerun.comparisons[0].profileDifferences`,
      detail: `A complex style changes at least two parameters, but this pair changes ${changed.length}`,
    });
  }
}

function compareRequest(request: ExperimentCompareRequest): void {
  if (!isPlainRecord(request)) {
    throw new ExperimentCompareError('INVALID_REQUEST', 'Expected a request object', 'request');
  }
  boundedText(request.suiteId, 'request.suiteId');
  const cohorts = request.cohorts;
  if (!Array.isArray(cohorts) || cohorts.length === 0) {
    throw new ExperimentCompareError(
      'INVALID_REQUEST',
      'A comparison reads at least one cohort',
      'request.cohorts',
    );
  }
  cohorts.forEach((cohort, index) => {
    if (!isPlainRecord(cohort)) {
      throw new ExperimentCompareError(
        'INVALID_REQUEST',
        'Expected a cohort object',
        `request.cohorts[${index}]`,
      );
    }
    boundedText(cohort.cohortId, `request.cohorts[${index}].cohortId`);
    if (!(experimentCompareCaseKinds as readonly string[]).includes(String(cohort.caseKind))) {
      throw new ExperimentCompareError(
        'INVALID_REQUEST',
        `Expected one of ${experimentCompareCaseKinds.join(', ')}`,
        `request.cohorts[${index}].caseKind`,
      );
    }
    if (!isPlainRecord(cohort.rerun)) {
      throw new ExperimentCompareError(
        'INVALID_REQUEST',
        'Expected a 142 result',
        `request.cohorts[${index}].rerun`,
      );
    }
    if (!isPlainRecord(cohort.visibility) || !Array.isArray(cohort.visibility.facts)) {
      throw new ExperimentCompareError(
        'INVALID_REQUEST',
        'Expected a visibility fact list',
        `request.cohorts[${index}].visibility`,
      );
    }
    if (cohort.targetParameter !== undefined)
      boundedText(cohort.targetParameter, `request.cohorts[${index}].targetParameter`);
  });
  if (request.metrics !== undefined) {
    if (!Array.isArray(request.metrics)) {
      throw new ExperimentCompareError(
        'INVALID_REQUEST',
        'Expected a metric pair list',
        'request.metrics',
      );
    }
    request.metrics.forEach((pair, index) => {
      if (!isPlainRecord(pair)) {
        throw new ExperimentCompareError(
          'INVALID_REQUEST',
          'Expected a metric pair',
          `request.metrics[${index}]`,
        );
      }
      boundedText(pair.cohortId, `request.metrics[${index}].cohortId`);
      boundedText(pair.id, `request.metrics[${index}].id`);
      boundedText(pair.unit, `request.metrics[${index}].unit`);
      if (!(experimentCompareMetricSources as readonly string[]).includes(String(pair.source))) {
        throw new ExperimentCompareError(
          'INVALID_REQUEST',
          `Expected one of ${experimentCompareMetricSources.join(', ')}`,
          `request.metrics[${index}].source`,
        );
      }
      for (const side of ['left', 'right'] as const) {
        const value = pair[side];
        if (
          !isPlainRecord(value) ||
          (value.state !== 'AVAILABLE' && value.state !== 'UNAVAILABLE')
        ) {
          throw new ExperimentCompareError(
            'INVALID_REQUEST',
            'Expected an AVAILABLE/UNAVAILABLE metric value',
            `request.metrics[${index}].${side}`,
          );
        }
        if (value.value !== null)
          finiteNumber(value.value, `request.metrics[${index}].${side}.value`);
        if (value.sampleSize !== null)
          safeInteger(value.sampleSize, `request.metrics[${index}].${side}.sampleSize`);
      }
    });
  }
}

function metricDeltas(
  request: ExperimentCompareRequest,
  cohorts: readonly ExperimentCompareCohortRead[],
  issues: Issue[],
): readonly ExperimentCompareMetricDelta[] {
  const pairs = request.metrics ?? [];
  return Object.freeze(
    pairs.map((pair, index) => {
      const cohort = cohorts.find((entry) => entry.cohortId === pair.cohortId);
      if (cohort === undefined) {
        issues.push({
          code: 'METRIC_UNBOUND',
          path: `metrics[${index}].cohortId`,
          detail: `No cohort ${pair.cohortId} exists in this suite`,
        });
      } else if (
        !cohort.profileVersionIds.includes(pair.leftProfileVersionId) ||
        !cohort.profileVersionIds.includes(pair.rightProfileVersionId) ||
        pair.leftProfileVersionId === pair.rightProfileVersionId
      ) {
        issues.push({
          code: 'METRIC_UNBOUND',
          path: `metrics[${index}]`,
          detail: `The cohort ${pair.cohortId} does not compare ${pair.leftProfileVersionId} with ${pair.rightProfileVersionId}`,
        });
      }
      for (const side of ['left', 'right'] as const) {
        const value = pair[side];
        if (value.state === 'AVAILABLE' && value.value === null) {
          issues.push({
            code: 'METRIC_INVALID',
            path: `metrics[${index}].${side}.value`,
            detail: 'An AVAILABLE metric value must carry a number',
          });
        }
      }
      const left = pair.left.value;
      const right = pair.right.value;
      const available =
        pair.left.state === 'AVAILABLE' &&
        pair.right.state === 'AVAILABLE' &&
        left !== null &&
        right !== null &&
        Number.isFinite(left) &&
        Number.isFinite(right);
      const reason = available
        ? null
        : pair.left.state === 'UNAVAILABLE' || left === null
          ? ('LEFT_UNAVAILABLE' as const)
          : ('RIGHT_UNAVAILABLE' as const);
      const delta = available ? round6(right - left) : null;
      return Object.freeze({
        cohortId: pair.cohortId,
        leftProfileVersionId: pair.leftProfileVersionId,
        rightProfileVersionId: pair.rightProfileVersionId,
        source: pair.source,
        id: pair.id,
        unit: pair.unit,
        left: left === null ? null : round6(left),
        right: right === null ? null : round6(right),
        leftSampleSize: pair.left.sampleSize,
        rightSampleSize: pair.right.sampleSize,
        delta,
        state: available ? ('DELTA' as const) : ('UNAVAILABLE' as const),
        reason,
        direction:
          delta === null
            ? null
            : delta > 0
              ? ('HIGHER' as const)
              : delta < 0
                ? ('LOWER' as const)
                : ('EQUAL' as const),
      });
    }),
  );
}

/* -------------------------------------------------------------------- entry */

/**
 * Reads a finished 142 suite and reports the A/B comparison.
 *
 * Each cohort is one 142 result: the scenario, the profile pair and the start state already come
 * from the rerun, so the diff, the seed addressing and the cause classification are 142's. This
 * function only aggregates them, binds an explicit visibility fact to every evaluated opportunity,
 * counts the distinct seeds and states what the sample can and cannot conclude.
 */
export function readExperimentComparison(
  request: ExperimentCompareRequest,
): ExperimentCompareResult {
  compareRequest(request);
  const issues: Issue[] = [];
  const cohortReads: ExperimentCompareCohortRead[] = [];
  const allRows: ExperimentCompareDivergenceRow[] = [];
  const seen = new Set<string>();

  request.cohorts.forEach((cohort, index) => {
    const base = `cohorts[${index}]`;
    if (seen.has(cohort.cohortId)) {
      issues.push({
        code: 'COHORT_DUPLICATE',
        path: `${base}.cohortId`,
        detail: `The cohort id ${cohort.cohortId} is used twice`,
      });
      return;
    }
    seen.add(cohort.cohortId);
    const rerun = cohort.rerun;
    if (rerun.status !== 'RERUN') {
      issues.push({
        code: 'RERUN_NOT_READY',
        path: `${base}.rerun.status`,
        detail: `The 142 result is ${String(rerun.status)} and carries no comparison`,
      });
      return;
    }
    if (rerun.version !== EXPERIMENT_RERUN_VERSION) {
      issues.push({
        code: 'RERUN_VERSION_MISMATCH',
        path: `${base}.rerun.version`,
        detail: `Expected ${EXPERIMENT_RERUN_VERSION}, found ${String(rerun.version)}`,
      });
      return;
    }
    const inconsistent = rerun.comparisons.filter(
      (comparison) => !comparison.sameRequest || !comparison.sameSeed || !comparison.sameState,
    );
    if (inconsistent.length > 0) {
      issues.push({
        code: 'RERUN_INCONSISTENT',
        path: `${base}.rerun.comparisons`,
        detail: `${inconsistent.length} 142 comparisons no longer prove the same request, seed and state`,
      });
      return;
    }
    checkCaseKind(cohort, rerun.comparisons, index, issues);
    const decisions = decisionRows(rerun);
    const facts = readVisibility(cohort, decisions, index, issues);
    const rows = Object.freeze(
      rerun.comparisons.flatMap((comparison) => [...divergenceRows(cohort, comparison)]),
    );
    const comparison = rerun.comparisons[0];
    if (comparison === undefined) {
      issues.push({
        code: 'RERUN_NOT_READY',
        path: `${base}.rerun.comparisons`,
        detail: 'The 142 result carries no profile comparison',
      });
      return;
    }
    const isolated = readIsolated(cohort, comparison, rows, index, issues);
    const summary = summarizeRows(rows, rerun.comparisons);
    const profiles = rerun.runs.length;
    allRows.push(...rows);
    cohortReads.push(
      Object.freeze({
        cohortId: cohort.cohortId,
        caseKind: cohort.caseKind,
        targetParameter: cohort.targetParameter ?? null,
        profileVersionIds: Object.freeze(rerun.runs.map((run) => run.profileVersionId)),
        scenario: Object.freeze({
          scenarioId: rerun.scenario.scenarioId,
          ticks: rerun.scenario.ticks,
          fromTick: rerun.scenario.fromTick,
          toTick: rerun.scenario.toTick,
          opportunities: rerun.scenario.opportunities,
          kinds: rerun.scenario.kinds,
          profiles,
          comparisons: rerun.comparisons.length,
        }),
        seed: Object.freeze({
          baseSeed: rerun.seed.baseSeed,
          baseSeedHex: rerun.seed.baseSeedHex,
          scenarioSeed: rerun.seed.scenarioSeed,
          scenarioSeedHex: rerun.seed.scenarioSeedHex,
          opportunitySeeds: new Set(rerun.addressing.map((entry) => entry.opportunitySeed)).size,
          profileIdentityInSeed: false as const,
        }),
        attribution: summary.attribution,
        causes: summary.causes,
        parameters: parameterRows(summary.parameters, summary.attribution.divergent),
        categories: categoryRows(decisions, rows, profiles),
        divergences: rows,
        exposure: exposureOf(cohort, facts, decisions, rerun),
        isolated,
      }),
    );
  });

  const deltas = metricDeltas(request, cohortReads, issues);

  if (issues.length > 0) {
    const codes = Object.freeze(
      [...new Set(issues.map((issue) => issue.code))].sort() as ExperimentCompareRefusalCode[],
    );
    return Object.freeze({
      status: 'REFUSED' as const,
      version: EXPERIMENT_COMPARE_VERSION,
      suiteId: request.suiteId,
      codes,
      paths: Object.freeze(uniqueSortedText(issues.map((issue) => issue.path))),
      detail: issues.map((issue) => `${issue.code} at ${issue.path}: ${issue.detail}`).join('; '),
    });
  }

  const causes = emptyCauses();
  const parameters: Record<string, number> = {};
  let evaluations = 0;
  let decisionsTotal = 0;
  let identical = 0;
  let divergent = 0;
  let unattributed = 0;
  let withoutParameter = 0;
  let seedDivergences = 0;
  const categoryTotals = new Map<
    ExperimentRerunOpportunityKind,
    { opportunities: number; evaluations: number; divergent: number }
  >();
  for (const kind of experimentRerunOpportunityKinds)
    categoryTotals.set(kind, { opportunities: 0, evaluations: 0, divergent: 0 });
  for (const cohort of cohortReads) {
    evaluations += cohort.exposure.evaluations;
    decisionsTotal += cohort.attribution.divergent + cohort.attribution.identical;
    identical += cohort.attribution.identical;
    divergent += cohort.attribution.divergent;
    unattributed += cohort.attribution.unattributed;
    withoutParameter += cohort.attribution.withoutParameter;
    seedDivergences += cohort.attribution.seedDivergences;
    for (const cause of experimentRerunDivergenceCauses)
      causes[cause] = (causes[cause] ?? 0) + (cohort.causes[cause] ?? 0);
    for (const row of cohort.parameters)
      parameters[row.key] = (parameters[row.key] ?? 0) + row.count;
    for (const category of cohort.categories) {
      const total = categoryTotals.get(category.kind);
      if (total === undefined) continue;
      total.opportunities += category.opportunities;
      total.evaluations += category.evaluations;
      total.divergent += category.divergent;
    }
  }
  const parameterRowsValue = parameterRows(parameters, divergent);
  const attributed = divergent - withoutParameter;
  const distinctCauses = experimentRerunDivergenceCauses.filter(
    (cause) => (causes[cause] ?? 0) > 0,
  ).length;

  const caseKinds = {} as Record<
    ExperimentCompareCaseKind,
    { cohorts: number; divergent: number; distinctParameters: number; allOnOneParameter: boolean }
  >;
  for (const kind of experimentCompareCaseKinds)
    caseKinds[kind] = { cohorts: 0, divergent: 0, distinctParameters: 0, allOnOneParameter: false };
  for (const cohort of cohortReads) {
    const entry = caseKinds[cohort.caseKind];
    entry.cohorts += 1;
    entry.divergent += cohort.attribution.divergent;
    entry.distinctParameters = Math.max(
      entry.distinctParameters,
      cohort.attribution.distinctParameters,
    );
    entry.allOnOneParameter = entry.allOnOneParameter || cohort.attribution.allOnOneParameter;
  }
  const singleParameterOnlyCases = Object.freeze(
    cohortReads
      .filter(
        (cohort) => cohort.caseKind === 'COMPLEX_STYLE' && cohort.attribution.allOnOneParameter,
      )
      .map((cohort) => cohort.cohortId),
  );

  const distribution: ExperimentCompareDistribution = Object.freeze({
    cohorts: cohortReads.length,
    evaluations,
    decisions: decisionsTotal,
    identical,
    divergent,
    causes: Object.freeze(causes),
    parameters: parameterRowsValue,
    categories: Object.freeze(
      experimentRerunOpportunityKinds.map((kind) => {
        const total = categoryTotals.get(kind) ?? {
          opportunities: 0,
          evaluations: 0,
          divergent: 0,
        };
        return Object.freeze({ kind, ...total });
      }),
    ),
    unattributed,
    seedDivergences,
    withoutParameter,
    attributed,
    distinctCauses,
    distinctParameters: parameterRowsValue.length,
    dominantParameter: dominantParameterRow(parameterRowsValue),
    caseKinds: Object.freeze(caseKinds),
    singleParameterOnlyCases,
    criterionSatisfied: singleParameterOnlyCases.length === 0,
  });

  const windows = new Map<
    string,
    {
      fromTick: number;
      toTick: number;
      ticks: number;
      cohorts: string[];
      sources: Set<ExperimentCompareVisibilitySource>;
    }
  >();
  for (const cohort of cohortReads) {
    const key = `${cohort.exposure.tickWindow.fromTick}-${cohort.exposure.tickWindow.toTick}`;
    const entry = windows.get(key) ?? {
      fromTick: cohort.exposure.tickWindow.fromTick,
      toTick: cohort.exposure.tickWindow.toTick,
      ticks: cohort.exposure.tickWindow.ticks,
      cohorts: [],
      sources: new Set<ExperimentCompareVisibilitySource>(),
    };
    entry.cohorts.push(cohort.cohortId);
    entry.sources.add(cohort.exposure.source);
    windows.set(key, entry);
  }
  const visible = cohortReads.reduce((total, cohort) => total + cohort.exposure.visible, 0);
  const exposure: ExperimentCompareExposureSummary = Object.freeze({
    evaluations,
    visible,
    invisible: evaluations - visible,
    visibleFraction: share(visible, evaluations),
    evaluatedOpportunities: cohortReads.reduce(
      (total, cohort) => total + cohort.exposure.evaluatedOpportunities,
      0,
    ),
    windows: Object.freeze(
      [...windows.values()].map((entry) =>
        Object.freeze({
          fromTick: entry.fromTick,
          toTick: entry.toTick,
          ticks: entry.ticks,
          cohorts: Object.freeze([...entry.cohorts]),
          sources: Object.freeze([
            ...[...entry.sources].sort(),
          ] as ExperimentCompareVisibilitySource[]),
        }),
      ),
    ),
    sources: Object.freeze(
      [
        ...new Set(cohortReads.map((cohort) => cohort.exposure.source)),
      ].sort() as ExperimentCompareVisibilitySource[],
    ),
    declared: true as const,
  });

  const baseSeeds = uniqueSortedNumbers(
    request.cohorts.map((cohort) => cohort.rerun.seed.baseSeed),
  );
  const scenarioSeeds = uniqueSortedNumbers(
    request.cohorts.map((cohort) => cohort.rerun.seed.scenarioSeed),
  );
  const opportunitySeeds = uniqueSortedNumbers(
    request.cohorts.flatMap((cohort) =>
      cohort.rerun.addressing.map((entry) => entry.opportunitySeed),
    ),
  );
  const perSeed = Object.freeze(
    baseSeeds.map((baseSeed) => {
      const matched = request.cohorts.filter((cohort) => cohort.rerun.seed.baseSeed === baseSeed);
      const matchedReads = cohortReads.filter((cohort) =>
        matched.some((entry) => entry.cohortId === cohort.cohortId),
      );
      const parametersForSeed = uniqueSortedText(
        matchedReads.flatMap((cohort) => cohort.parameters.map((row) => row.key)),
      );
      return Object.freeze({
        baseSeed,
        baseSeedHex: seedHex(baseSeed),
        scenarioSeedHex: matched[0]?.rerun.seed.scenarioSeedHex ?? '00000000',
        cohorts: matched.length,
        decisions: matchedReads.reduce(
          (total, cohort) => total + cohort.attribution.divergent + cohort.attribution.identical,
          0,
        ),
        identical: matchedReads.reduce((total, cohort) => total + cohort.attribution.identical, 0),
        divergent: matchedReads.reduce((total, cohort) => total + cohort.attribution.divergent, 0),
        unattributed: matchedReads.reduce(
          (total, cohort) => total + cohort.attribution.unattributed,
          0,
        ),
        parameters: parametersForSeed,
      });
    }),
  );
  const seeds: ExperimentCompareSeeds = Object.freeze({
    baseSeeds,
    scenarioSeeds,
    distinctBaseSeeds: baseSeeds.length,
    distinctScenarioSeeds: scenarioSeeds.length,
    distinctOpportunitySeeds: opportunitySeeds.length,
    perSeed,
  });

  const divergenceCounts = perSeed.map((row) => row.divergent);
  const divergentMin = divergenceCounts.length === 0 ? 0 : Math.min(...divergenceCounts);
  const divergentMax = divergenceCounts.length === 0 ? 0 : Math.max(...divergenceCounts);
  const uncertainty: ExperimentCompareUncertainty = Object.freeze({
    status:
      baseSeeds.length >= 2 ? ('MULTI_SEED_SAMPLE' as const) : ('SINGLE_SEED_SAMPLE' as const),
    seeds: baseSeeds.length,
    cohorts: cohortReads.length,
    evaluations,
    decisions: decisionsTotal,
    divergences: divergent,
    divergentMin,
    divergentMax,
    divergentSpread: divergentMax - divergentMin,
    generalizable: false as const,
    statement:
      baseSeeds.length >= 2
        ? `Eșantionul are ${baseSeeds.length} seed-uri distincte, ${cohortReads.length} cohorte și ${decisionsTotal} decizii comparate; numărătoarea divergențelor pe seed variază între ${divergentMin} și ${divergentMax}. Rezultatul descrie exact aceste rulări; nu este o estimare pentru alte seed-uri, alte profiluri sau orașul live și nu se raportează un interval de încredere.`
        : `Eșantionul are un singur seed (${baseSeeds.length} valoare distinctă), ${cohortReads.length} cohorte și ${decisionsTotal} decizii comparate. Rezultatul descrie exact aceste rulări; nu se poate generaliza la alte seed-uri sau la orașul live și nu se raportează un interval de încredere.`,
    limitations: Object.freeze([
      'Divergențele sunt cele raportate de 142 pentru oportunitățile scenariului; traiectoriile divergente pot produce oportunități diferite în lumea reală.',
      'Vizibilitatea este un fapt declarat de apelant (camera reală sau fixture controlat), nu o rază trasată de acest modul.',
      'Eșantionul este mic și controlat: numerele sunt exacte pentru aceste rulări, nu rate pentru populație.',
      'Reproductibilitatea este promisă numai pe aceeași platformă, cu același snapshot și același seed de bază.',
    ]),
  });

  const opportunityCauses = new Map<
    string,
    ExperimentCompareOpportunityCauses['causes'][number][]
  >();
  const opportunityKinds = new Map<string, ExperimentRerunOpportunityKind>();
  const cohortSeeds = new Map(
    request.cohorts.map((cohort) => [cohort.cohortId, cohort.rerun.seed.baseSeed]),
  );
  for (const row of allRows) {
    opportunityKinds.set(row.opportunityKey, row.kind);
    const entries = opportunityCauses.get(row.opportunityKey) ?? [];
    entries.push(
      Object.freeze({
        cohortId: row.cohortId,
        caseKind: row.caseKind,
        baseSeed: cohortSeeds.get(row.cohortId) ?? 0,
        decisionTick: row.decisionTick,
        cause: row.cause,
        parameter: row.parameter,
      }),
    );
    opportunityCauses.set(row.opportunityKey, entries);
  }
  const opportunityRows = Object.freeze(
    [...opportunityCauses.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([opportunityKey, entries]) => {
        const causeNames = uniqueSortedText(entries.map((entry) => entry.cause));
        const parametersNamed = uniqueSortedText(
          entries
            .map((entry) => entry.parameter)
            .filter((parameter): parameter is string => parameter !== null),
        );
        return Object.freeze({
          opportunityKey,
          kind: opportunityKinds.get(opportunityKey) ?? 'SIGNAL',
          causes: Object.freeze(entries),
          distinctCauses: causeNames.length,
          distinctParameters: parametersNamed.length,
          coexists: causeNames.length >= 2,
        });
      }),
  );
  const coexistence: ExperimentCompareCoexistence = Object.freeze({
    opportunities: opportunityRows,
    total: opportunityRows.length,
    coexisting: opportunityRows.filter((row) => row.coexists).length,
    singleCause: opportunityRows.filter((row) => row.distinctCauses === 1).length,
  });

  const isolated = Object.freeze(
    cohortReads
      .map((cohort) => cohort.isolated)
      .filter((entry): entry is ExperimentCompareIsolatedRead => entry !== null),
  );

  const signature = digest(
    canonicalText({
      version: EXPERIMENT_COMPARE_VERSION,
      suiteId: request.suiteId,
      distribution,
      exposure,
      seeds,
      uncertainty,
      coexistence,
      isolated,
      metrics: deltas,
    }),
  );

  return Object.freeze({
    status: 'READY' as const,
    version: EXPERIMENT_COMPARE_VERSION,
    suiteId: request.suiteId,
    cohorts: Object.freeze(cohortReads),
    distribution,
    exposure,
    seeds,
    uncertainty,
    isolated,
    coexistence,
    metrics: deltas,
    signature,
    sources: Object.freeze({
      rerun: EXPERIMENT_RERUN_VERSION,
      policiesEvaluated: 0 as const,
    }),
  });
}

/** Reads only the divergence counts 142 already reported, for a freshness cross-check. */
export function experimentCompareRerunDivergences(rerun: ExperimentRerunCompleted): number {
  return rerun.comparisons.reduce((total, comparison) => total + comparison.divergent, 0);
}

/** The seven profile keys the 142 policies read; an isolated target must be one of them. */
export const experimentComparePolicyKeys: readonly ParameterKey[] = Object.freeze(
  POLICY_KEYS as ParameterKey[],
);
