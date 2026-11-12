import { STOP_PRIORITY_POLICY_LIMITS } from '../../src/autonomy';
import {
  STOP_PRIORITY_ESTIMATOR_KEYS,
  STOP_PRIORITY_ESTIMATOR_LIMITS,
  estimateStopPriorityStyle,
} from '../../src/learning/stop-priority-estimator';
import type {
  StopPriorityEstimatorKey,
  StopPriorityEstimatorResult,
  StopPriorityKeyEstimate,
} from '../../src/learning/stop-priority-estimator';
import { getParameterDefinition } from '../../src/profiles';
import { evaluate } from '../autonomy/stop-priority-policy-reference';
import {
  allwayBracketEpisodes,
  allwayContradictoryEpisodes,
  allwayFirstArrivalEpisodes,
  allwayHoldOnlyEpisodes,
  allwayNotReleasedEpisodes,
  allwayScene,
  allwayTurnOnlyEpisodes,
  blockedBracketEpisodes,
  blockedCeilingEpisodes,
  blockedContradictoryEpisodes,
  blockedDeclaredExitEpisodes,
  blockedDenialOnlyEpisodes,
  blockedEntryDenial,
  blockedEntryGrant,
  blockedGrantOnlyEpisodes,
  blockedScene,
  blockedVetoEpisodes,
  cappedRollingEpisodes,
  manualEpisodes,
  mixedRollingCapEpisodes,
  noisyRollingEpisodes,
  positiveEpisodes,
  priorityBracketEpisodes,
  priorityClaimOnlyEpisodes,
  priorityContradictoryEpisodes,
  priorityGrantedEpisodes,
  priorityInertEpisodes,
  priorityUnknownSeparationEpisodes,
  priorityYieldOnlyEpisodes,
  refusalScene,
  rollingScene,
  rollingStopEpisodes,
  wideAllwayEpisodes,
  wideBlockedEpisodes,
  widePriorityEpisodes,
  zeroAllwayEpisodes,
} from './stop-priority-estimator-reference';

export interface StopPriorityReportCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface StopPriorityReportRow {
  readonly key: StopPriorityEstimatorKey;
  readonly scenario: StopPriorityKeyEstimate['scenario'];
  readonly unit: string;
  readonly context: string;
  readonly status: StopPriorityKeyEstimate['status'];
  readonly value: number | null;
  readonly uncertainty: number | null;
  readonly uncertaintyThreshold: number;
  readonly estimateEpisodes: number;
  readonly validationEpisodes: number;
  readonly validationStatus: StopPriorityKeyEstimate['validation']['status'];
  readonly validationValue: number | null;
  readonly validationError: number | null;
  readonly validationTolerance: number;
  readonly reason: string | null;
}
export interface StopPriorityReportUnobserved {
  readonly key: StopPriorityEstimatorKey;
  readonly scenario: StopPriorityKeyEstimate['scenario'];
  readonly demonstration: string;
  readonly status: StopPriorityKeyEstimate['status'];
  readonly value: number | null;
  readonly reason: string | null;
  readonly excluded: Readonly<Record<string, number>>;
  readonly validationStatus: StopPriorityKeyEstimate['validation']['status'];
}
export interface StopPriorityReport {
  readonly version: '176-stop-priority-estimator-v1';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly rows: readonly StopPriorityReportRow[];
  readonly unobserved: readonly StopPriorityReportUnobserved[];
  readonly groupConstraints: readonly {
    readonly id: string;
    readonly keys: readonly string[];
    readonly explanation: string;
  }[];
  readonly refusals: readonly { readonly episodeId: string; readonly reason: string }[];
  readonly split: {
    readonly seed: number;
    readonly admitted: number;
    readonly disjoint: boolean;
  };
  readonly compatibility: {
    readonly policyVersion: '175-stop-priority-policy-v1';
    readonly candidateOnly: boolean;
    readonly changesPolicySemantics: boolean;
    readonly rollingStopCapMps: number;
    readonly priorityFloorS: number;
    readonly blockedEntryCap: number;
    readonly rollThroughSpeedMps: number | null;
    readonly rollingStopReason: string;
    readonly rollingStopCapped: boolean;
    readonly requiredGapS: number | null;
    readonly claimedGapS: number;
    readonly claimed: boolean;
    readonly yieldedGapS: number;
    readonly yielded: boolean;
    readonly patienceHoldS: number;
    readonly holdReason: string;
    readonly patienceTurnS: number;
    readonly turnReason: string;
    readonly grantDraw: number;
    readonly grantReason: string;
    readonly grantGranted: boolean | null;
    readonly denialDraw: number;
    readonly denialReason: string;
    readonly denialGranted: boolean | null;
  };
  readonly determinism: {
    readonly seed: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly StopPriorityReportCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
    readonly candidateKeys: number;
    readonly unobservedKeys: number;
  };
}

const seed = 176;
const scenarios = {
  positive: { episodes: positiveEpisodes() },
  rollingOnly: { episodes: rollingStopEpisodes() },
  priorityOnly: { episodes: priorityBracketEpisodes() },
  allwayOnly: { episodes: allwayBracketEpisodes() },
  blockedOnly: { episodes: blockedBracketEpisodes() },
  zeroPatience: { episodes: zeroAllwayEpisodes() },
  rollingNoisy: { episodes: noisyRollingEpisodes() },
  rollingCapped: { episodes: cappedRollingEpisodes() },
  rollingMixedCap: { episodes: mixedRollingCapEpisodes() },
  priorityClaimsOnly: { episodes: priorityClaimOnlyEpisodes() },
  priorityYieldsOnly: { episodes: priorityYieldOnlyEpisodes() },
  priorityContradictory: { episodes: priorityContradictoryEpisodes() },
  priorityWide: { episodes: widePriorityEpisodes() },
  priorityInert: { episodes: priorityInertEpisodes() },
  priorityGranted: { episodes: priorityGrantedEpisodes() },
  priorityUnknown: { episodes: priorityUnknownSeparationEpisodes() },
  allwayTurnsOnly: { episodes: allwayTurnOnlyEpisodes() },
  allwayHoldsOnly: { episodes: allwayHoldOnlyEpisodes() },
  allwayContradictory: { episodes: allwayContradictoryEpisodes() },
  allwayWide: { episodes: wideAllwayEpisodes() },
  allwayFirst: { episodes: allwayFirstArrivalEpisodes() },
  allwayHeld: { episodes: allwayNotReleasedEpisodes() },
  blockedGrantsOnly: { episodes: blockedGrantOnlyEpisodes() },
  blockedDenialsOnly: { episodes: blockedDenialOnlyEpisodes() },
  blockedCeiling: { episodes: blockedCeilingEpisodes() },
  blockedVeto: { episodes: blockedVetoEpisodes() },
  blockedDeclared: { episodes: blockedDeclaredExitEpisodes() },
  blockedContradictory: { episodes: blockedContradictoryEpisodes() },
  blockedWide: { episodes: wideBlockedEpisodes() },
  manual: { episodes: manualEpisodes() },
  tiny: { episodes: rollingStopEpisodes([1.2, 1.2, 1.2]) },
  empty: { episodes: [] },
} as const;

function runSet(key: keyof typeof scenarios): StopPriorityEstimatorResult {
  return estimateStopPriorityStyle({ episodes: scenarios[key].episodes, splitSeed: seed });
}
function digest(result: StopPriorityEstimatorResult): string {
  const text = JSON.stringify(result);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): StopPriorityReportCheck {
  return Object.freeze({ id, pass, detail });
}
function row(entry: StopPriorityKeyEstimate): StopPriorityReportRow {
  return {
    key: entry.key,
    scenario: entry.scenario,
    unit: entry.unit,
    context: entry.eligibleContext,
    status: entry.status,
    value: entry.value,
    uncertainty: entry.uncertainty,
    uncertaintyThreshold: entry.uncertaintyThreshold,
    estimateEpisodes: entry.sourceEpisodes,
    validationEpisodes: entry.validation.episodes,
    validationStatus: entry.validation.status,
    validationValue: entry.validation.value,
    validationError: entry.validation.error,
    validationTolerance: entry.validation.tolerance,
    reason: entry.reason,
  };
}
function unobservedRow(
  key: StopPriorityEstimatorKey,
  demonstration: string,
  result: StopPriorityEstimatorResult,
): StopPriorityReportUnobserved {
  const entry = result.keys[key];
  return {
    key,
    scenario: entry.scenario,
    demonstration,
    status: entry.status,
    value: entry.value,
    reason: entry.reason,
    excluded: entry.excluded,
    validationStatus: entry.validation.status,
  };
}
function near(actual: number | null, expected: number, tolerance: number): boolean {
  return actual !== null && Math.abs(actual - expected) <= tolerance;
}
function number(value: number | null, digits = 4): string {
  return value === null ? '—' : value.toFixed(digits);
}

export function runStopPriorityEstimatorReport(): StopPriorityReport {
  const positive = runSet('positive'),
    rollingOnly = runSet('rollingOnly'),
    priorityOnly = runSet('priorityOnly'),
    allwayOnly = runSet('allwayOnly'),
    blockedOnly = runSet('blockedOnly'),
    zeroPatience = runSet('zeroPatience'),
    rollingNoisy = runSet('rollingNoisy'),
    rollingCapped = runSet('rollingCapped'),
    rollingMixedCap = runSet('rollingMixedCap'),
    priorityClaimsOnly = runSet('priorityClaimsOnly'),
    priorityYieldsOnly = runSet('priorityYieldsOnly'),
    priorityContradictory = runSet('priorityContradictory'),
    priorityWide = runSet('priorityWide'),
    priorityInert = runSet('priorityInert'),
    priorityGranted = runSet('priorityGranted'),
    priorityUnknown = runSet('priorityUnknown'),
    allwayTurnsOnly = runSet('allwayTurnsOnly'),
    allwayHoldsOnly = runSet('allwayHoldsOnly'),
    allwayContradictory = runSet('allwayContradictory'),
    allwayWide = runSet('allwayWide'),
    allwayFirst = runSet('allwayFirst'),
    allwayHeld = runSet('allwayHeld'),
    blockedGrantsOnly = runSet('blockedGrantsOnly'),
    blockedDenialsOnly = runSet('blockedDenialsOnly'),
    blockedCeiling = runSet('blockedCeiling'),
    blockedVeto = runSet('blockedVeto'),
    blockedDeclared = runSet('blockedDeclared'),
    blockedContradictory = runSet('blockedContradictory'),
    blockedWide = runSet('blockedWide'),
    manualSet = runSet('manual'),
    tiny = runSet('tiny'),
    empty = runSet('empty'),
    duplicateRun = runSet('positive'),
    parameters = STOP_PRIORITY_ESTIMATOR_KEYS.map((key) => {
      const definition = getParameterDefinition(key);
      return {
        key,
        unit: definition.unit,
        minimum: definition.min,
        maximum: definition.max,
        defaultValue: definition.default,
      };
    }),
    rows = STOP_PRIORITY_ESTIMATOR_KEYS.map((key) => row(positive.keys[key])),
    unobservedRows = [
      unobservedRow(
        'rolling_stop_speed',
        'comenzi plafonate la 2,5 m/s: cheia peste plafon nu este identificabilă',
        rollingCapped,
      ),
      unobservedRow(
        'rolling_stop_speed',
        'viteze reale împrăștiate între 0,2 și 2,5 m/s',
        rollingNoisy,
      ),
      unobservedRow(
        'rolling_stop_speed',
        'demonstrații care pretind simultan ≤ 2,5 m/s și > 2,5 m/s',
        rollingMixedCap,
      ),
      unobservedRow('rolling_stop_speed', 'demonstrații MANUAL, neeligibile', manualSet),
      unobservedRow(
        'priority_assertiveness',
        'doar revendicări, fără limită superioară',
        priorityClaimsOnly,
      ),
      unobservedRow(
        'priority_assertiveness',
        'doar cedări, fără limită inferioară',
        priorityYieldsOnly,
      ),
      unobservedRow(
        'priority_assertiveness',
        'revendicare sub o cedare: limite incompatibile',
        priorityContradictory,
      ),
      unobservedRow(
        'priority_assertiveness',
        'limită reală, dar prea largă (0,07–0,60)',
        priorityWide,
      ),
      unobservedRow(
        'priority_assertiveness',
        'yield_time_gap la podeaua de 3 s: cheia este inertă',
        priorityInert,
      ),
      unobservedRow(
        'priority_assertiveness',
        '052 a acordat prioritatea: nicio revendicare',
        priorityGranted,
      ),
      unobservedRow('priority_assertiveness', 'refuz 052 fără separator raportat', priorityUnknown),
      unobservedRow(
        'allway_stop_patience',
        'doar eliberări, fără limită inferioară',
        allwayTurnsOnly,
      ),
      unobservedRow('allway_stop_patience', 'doar țineri, fără limită superioară', allwayHoldsOnly),
      unobservedRow(
        'allway_stop_patience',
        'ținere peste o eliberare: limite incompatibile',
        allwayContradictory,
      ),
      unobservedRow('allway_stop_patience', 'limită reală, dar prea largă (2–9 s)', allwayWide),
      unobservedRow(
        'allway_stop_patience',
        'primul sosit la all-way stop: niciodată întârziat',
        allwayFirst,
      ),
      unobservedRow(
        'allway_stop_patience',
        'apropiere 051 încă în STOP, fără eliberare',
        allwayHeld,
      ),
      unobservedRow(
        'blocked_intersection_entry_probability',
        'veto de intersecție blocată, fără eșantion',
        blockedVeto,
      ),
      unobservedRow(
        'blocked_intersection_entry_probability',
        'spațiu de ieșire declarat: eșantionul este ocolit',
        blockedDeclared,
      ),
      unobservedRow(
        'blocked_intersection_entry_probability',
        'doar acceptări, fără limită superioară',
        blockedGrantsOnly,
      ),
      unobservedRow(
        'blocked_intersection_entry_probability',
        'doar așteptări sub plafon, fără limită inferioară',
        blockedDenialsOnly,
      ),
      unobservedRow(
        'blocked_intersection_entry_probability',
        'acceptare lângă plafonul de 0,5: cheia peste plafon nu se vede',
        blockedCeiling,
      ),
      unobservedRow(
        'blocked_intersection_entry_probability',
        'acceptare sub o așteptare: limite incompatibile',
        blockedContradictory,
      ),
      unobservedRow(
        'blocked_intersection_entry_probability',
        'limită reală, dar prea largă (0,02–0,49)',
        blockedWide,
      ),
      unobservedRow('blocked_intersection_entry_probability', 'set fără episoade', empty),
    ],
    refused = estimateStopPriorityStyle({
      splitSeed: seed,
      episodes: [...manualEpisodes(), rollingStopEpisodes()[0]!, rollingStopEpisodes()[0]!],
    }),
    values = Object.fromEntries(
      STOP_PRIORITY_ESTIMATOR_KEYS.map((key) => [key, positive.keys[key].value!]),
    ) as Record<StopPriorityEstimatorKey, number>,
    rollingCommand = evaluate(rollingScene, {
      rValues: values,
      mValues: { stop_full_probability: 0 },
    }).command,
    requiredGapS = evaluate(refusalScene(5), {
      rValues: values,
      mValues: { yield_time_gap: 6 },
    }).command.requiredGapS,
    claimedGapS = requiredGapS ?? 5,
    claimedCommand = evaluate(refusalScene(claimedGapS), {
      rValues: values,
      mValues: { yield_time_gap: 6 },
    }).command,
    yieldedGapS = Math.max(0.2, claimedGapS - 0.05),
    yieldedCommand = evaluate(refusalScene(yieldedGapS), {
      rValues: values,
      mValues: { yield_time_gap: 6 },
    }).command,
    patienceHoldS = Math.max(0, values.allway_stop_patience - 0.1),
    holdCommand = evaluate(allwayScene(patienceHoldS), { rValues: values }).command,
    patienceTurnS = values.allway_stop_patience + 0.1,
    turnCommand = evaluate(allwayScene(patienceTurnS), { rValues: values }).command,
    grant = blockedEntryGrant(0),
    grantCommand = evaluate(blockedScene(), {
      rValues: values,
      opportunityKey: grant.opportunityKey,
    }).command,
    denial = blockedEntryDenial(0),
    denialCommand = evaluate(blockedScene(), {
      rValues: values,
      opportunityKey: denial.opportunityKey,
    }).command,
    rejectedInvalid = (() => {
      const episode = rollingStopEpisodes()[0]!;
      try {
        estimateStopPriorityStyle({
          splitSeed: seed,
          episodes: [
            {
              ...episode,
              samples: [
                { ...episode.samples[0]!, rollThroughSpeedMps: Number.NaN },
                ...episode.samples.slice(1),
              ],
            },
          ],
        });
        return false;
      } catch (error) {
        return error instanceof Error && /stop\/priority evidence/i.test(error.message);
      }
    })(),
    checks: StopPriorityReportCheck[] = [
      check(
        'scenario-rolling',
        rollingOnly.keys.rolling_stop_speed.status === 'CANDIDATE' &&
          near(rollingOnly.keys.rolling_stop_speed.value, 1.2, 1e-9) &&
          rollingOnly.keys.priority_assertiveness.status === 'UNOBSERVED' &&
          rollingOnly.keys.allway_stop_patience.status === 'UNOBSERVED' &&
          rollingOnly.keys.blocked_intersection_entry_probability.status === 'UNOBSERVED',
        `rolling-only speed ${number(rollingOnly.keys.rolling_stop_speed.value)} m/s; assertiveness, patience and entry stay unobserved`,
      ),
      check(
        'scenario-priority',
        priorityOnly.keys.priority_assertiveness.status === 'CANDIDATE' &&
          near(priorityOnly.keys.priority_assertiveness.value, 0.3667, 0.01) &&
          priorityOnly.keys.rolling_stop_speed.status === 'UNOBSERVED' &&
          priorityOnly.keys.allway_stop_patience.status === 'UNOBSERVED' &&
          priorityOnly.keys.blocked_intersection_entry_probability.status === 'UNOBSERVED',
        `refusal-only assertiveness ${number(priorityOnly.keys.priority_assertiveness.value)} ratio; the other three stay unobserved`,
      ),
      check(
        'scenario-allway',
        allwayOnly.keys.allway_stop_patience.status === 'CANDIDATE' &&
          near(allwayOnly.keys.allway_stop_patience.value, 4, 1e-9) &&
          allwayOnly.keys.rolling_stop_speed.status === 'UNOBSERVED' &&
          allwayOnly.keys.priority_assertiveness.status === 'UNOBSERVED' &&
          allwayOnly.keys.blocked_intersection_entry_probability.status === 'UNOBSERVED',
        `all-way-only patience ${number(allwayOnly.keys.allway_stop_patience.value)} s; the other three stay unobserved`,
      ),
      check(
        'scenario-blocked',
        blockedOnly.keys.blocked_intersection_entry_probability.status === 'CANDIDATE' &&
          near(
            blockedOnly.keys.blocked_intersection_entry_probability.value,
            (grant.sample + denial.sample) / 2,
            1e-9,
          ) &&
          blockedOnly.keys.rolling_stop_speed.status === 'UNOBSERVED' &&
          blockedOnly.keys.priority_assertiveness.status === 'UNOBSERVED' &&
          blockedOnly.keys.allway_stop_patience.status === 'UNOBSERVED',
        `entry-only probability ${number(blockedOnly.keys.blocked_intersection_entry_probability.value)} between the draws ${number(grant.sample)} and ${number(denial.sample)}`,
      ),
      check(
        'zero-patience-observed',
        zeroPatience.keys.allway_stop_patience.status === 'CANDIDATE' &&
          zeroPatience.keys.allway_stop_patience.value === 0 &&
          zeroPatience.keys.allway_stop_patience.reason === null &&
          zeroPatience.keys.allway_stop_patience.validation.status === 'VALIDATED',
        'a release at 0 s is a demonstrated patience of zero, not missing evidence',
      ),
      check(
        'uncertainty-reported',
        rows.every(
          (entry) =>
            entry.uncertainty !== null &&
            entry.uncertainty > 0 &&
            entry.uncertainty <= entry.uncertaintyThreshold,
        ),
        rows
          .map(
            (entry) =>
              `${entry.key} ${number(entry.uncertainty)} <= ${entry.uncertaintyThreshold} ${entry.unit}`,
          )
          .join(', '),
      ),
      check(
        'uncertainty-rolling',
        rollingNoisy.keys.rolling_stop_speed.status === 'UNOBSERVED' &&
          rollingNoisy.keys.rolling_stop_speed.reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
          rollingNoisy.keys.rolling_stop_speed.uncertainty !== null &&
          rollingNoisy.keys.rolling_stop_speed.uncertainty >
            rollingNoisy.keys.rolling_stop_speed.uncertaintyThreshold,
        `scattered speeds measure ±${number(rollingNoisy.keys.rolling_stop_speed.uncertainty)} m/s > ${rollingNoisy.keys.rolling_stop_speed.uncertaintyThreshold} and stay unobserved`,
      ),
      check(
        'uncertainty-assertiveness',
        priorityWide.keys.priority_assertiveness.status === 'UNOBSERVED' &&
          priorityWide.keys.priority_assertiveness.reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
          priorityWide.keys.priority_assertiveness.uncertainty !== null &&
          priorityWide.keys.priority_assertiveness.uncertainty >
            priorityWide.keys.priority_assertiveness.uncertaintyThreshold,
        `a 0.07–0.60 bound measures ±${number(priorityWide.keys.priority_assertiveness.uncertainty)} > ${priorityWide.keys.priority_assertiveness.uncertaintyThreshold} and stays unobserved`,
      ),
      check(
        'uncertainty-patience',
        allwayWide.keys.allway_stop_patience.status === 'UNOBSERVED' &&
          allwayWide.keys.allway_stop_patience.reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
          allwayWide.keys.allway_stop_patience.uncertainty !== null &&
          allwayWide.keys.allway_stop_patience.uncertainty >
            allwayWide.keys.allway_stop_patience.uncertaintyThreshold,
        `a 2–9 s bound measures ±${number(allwayWide.keys.allway_stop_patience.uncertainty)} s and stays unobserved`,
      ),
      check(
        'uncertainty-entry',
        blockedWide.keys.blocked_intersection_entry_probability.status === 'UNOBSERVED' &&
          blockedWide.keys.blocked_intersection_entry_probability.reason ===
            'UNCERTAINTY_ABOVE_THRESHOLD' &&
          blockedWide.keys.blocked_intersection_entry_probability.uncertainty !== null &&
          blockedWide.keys.blocked_intersection_entry_probability.uncertainty >
            blockedWide.keys.blocked_intersection_entry_probability.uncertaintyThreshold,
        `a wide draw interval measures ±${number(blockedWide.keys.blocked_intersection_entry_probability.uncertainty)} > ${blockedWide.keys.blocked_intersection_entry_probability.uncertaintyThreshold} and stays unobserved`,
      ),
      check(
        'validation-split',
        rows.every(
          (entry) =>
            entry.validationStatus === 'VALIDATED' &&
            entry.validationEpisodes >= STOP_PRIORITY_ESTIMATOR_LIMITS.minimumValidationEpisodes &&
            entry.estimateEpisodes >= STOP_PRIORITY_ESTIMATOR_LIMITS.minimumEstimateEpisodes,
        ),
        `seed ${seed}: every key validates on held-out episodes (${rows.map((entry) => `${entry.key} ${entry.estimateEpisodes}+${entry.validationEpisodes}`).join(', ')})`,
      ),
      check(
        'validation-too-small',
        tiny.keys.rolling_stop_speed.status === 'CANDIDATE' &&
          tiny.keys.rolling_stop_speed.validation.status === 'TOO_SMALL' &&
          tiny.keys.rolling_stop_speed.validation.episodes === 1,
        `three episodes leave ${tiny.keys.rolling_stop_speed.validation.episodes} held-out episode, reported as ${tiny.keys.rolling_stop_speed.validation.status}`,
      ),
      check(
        'rolling-cap',
        rollingCapped.keys.rolling_stop_speed.reason === 'ROLLING_STOP_CAP_SATURATED' &&
          rollingCapped.keys.rolling_stop_speed.value === null &&
          rollingCapped.keys.rolling_stop_speed.excluded.ROLLING_STOP_CAP_SATURATED === 4 &&
          rollingMixedCap.keys.rolling_stop_speed.reason === 'ROLLING_STOP_CAP_INCONSISTENT',
        'a capped command proves only `key > 2,5 m/s`, and a set that mixes both sides of the cap has no value',
      ),
      check(
        'assertiveness-floor',
        priorityInert.keys.priority_assertiveness.reason === 'ASSERTIVENESS_INERT_AT_FLOOR' &&
          priorityInert.keys.priority_assertiveness.excluded.ASSERTIVENESS_INERT_AT_FLOOR === 4 &&
          priorityClaimsOnly.keys.priority_assertiveness.reason ===
            'ASSERTIVENESS_UPPER_BOUND_UNOBSERVED' &&
          priorityYieldsOnly.keys.priority_assertiveness.reason ===
            'ASSERTIVENESS_LOWER_BOUND_UNOBSERVED',
        'below the 3 s floor the M threshold decides and nothing is measured; a single inequality is only a bound',
      ),
      check(
        'assertiveness-no-decision',
        priorityGranted.keys.priority_assertiveness.reason === 'PRIORITY_NOT_REFUSED' &&
          priorityUnknown.keys.priority_assertiveness.reason === 'PRIORITY_SEPARATION_UNKNOWN' &&
          priorityContradictory.keys.priority_assertiveness.reason ===
            'CONTRADICTORY_ASSERTIVENESS_BOUNDS',
        'a granted priority and an unknown separation are not claim observations, and two incompatible bounds have no value',
      ),
      check(
        'patience-context',
        allwayFirst.keys.allway_stop_patience.reason === 'ALLWAY_FIRST_ARRIVAL' &&
          allwayFirst.keys.allway_stop_patience.excluded.ALLWAY_FIRST_ARRIVAL === 4 &&
          allwayHeld.keys.allway_stop_patience.reason === 'ALLWAY_STOP_NOT_RELEASED' &&
          allwayTurnsOnly.keys.allway_stop_patience.reason === 'ALLWAY_LOWER_BOUND_UNOBSERVED' &&
          allwayHoldsOnly.keys.allway_stop_patience.reason === 'ALLWAY_UPPER_BOUND_UNOBSERVED',
        'the first arrival and a held 051 STOP never observe patience; one-sided demonstrations remain bounds',
      ),
      check(
        'entry-veto',
        blockedVeto.keys.blocked_intersection_entry_probability.reason ===
          'BLOCKED_INTERSECTION_VETO' &&
          blockedVeto.keys.blocked_intersection_entry_probability.excluded
            .BLOCKED_INTERSECTION_VETO === 4 &&
          blockedDeclared.keys.blocked_intersection_entry_probability.reason ===
            'EXIT_SPACE_DECLARED',
        'the veto decides before the draw and a declared exit bypasses it, so neither proves the probability',
      ),
      check(
        'entry-ceiling',
        blockedCeiling.keys.blocked_intersection_entry_probability.reason ===
          'BLOCKED_ENTRY_CAP_SATURATED' &&
          blockedCeiling.keys.blocked_intersection_entry_probability.value === null &&
          blockedContradictory.keys.blocked_intersection_entry_probability.reason ===
            'CONTRADICTORY_BLOCKED_ENTRY_BOUNDS' &&
          blockedGrantsOnly.keys.blocked_intersection_entry_probability.reason ===
            'BLOCKED_ENTRY_UPPER_BOUND_UNOBSERVED',
        'above the 0.5 cap the key is invisible, hard refusal and acceptance bounds can contradict, and a single side stays unobserved',
      ),
      check(
        'shared-channel-separation',
        rollingOnly.keys.priority_assertiveness.status === 'UNOBSERVED' &&
          priorityOnly.keys.rolling_stop_speed.status === 'UNOBSERVED' &&
          allwayOnly.keys.blocked_intersection_entry_probability.status === 'UNOBSERVED' &&
          blockedOnly.keys.allway_stop_patience.status === 'UNOBSERVED',
        'a rolling stop never supplies a claim, a refusal never supplies a crawl speed, and an entry draw never proves patience',
      ),
      check(
        'no-fabricated-values',
        [...rows, ...unobservedRows].every((entry) =>
          entry.status === 'CANDIDATE' ? entry.value !== null : entry.value === null,
        ) && unobservedRows.every((entry) => entry.reason !== null),
        `${unobservedRows.length} unobserved demonstrations carry value null and an explicit reason`,
      ),
      check(
        'group-constraints',
        positive.groupConstraints.length === 6 &&
          positive.groupConstraints.every(
            (entry) =>
              entry.explanation.length > 40 &&
              entry.keys.every((key) => STOP_PRIORITY_ESTIMATOR_KEYS.includes(key)),
          ),
        positive.groupConstraints.map((entry) => entry.id).join(', '),
      ),
      check(
        'invalid-input-refused',
        rejectedInvalid && refused.refusedEpisodes.length === 5,
        `NaN rolling speed refused; ${refused.refusedEpisodes.map((entry) => `${entry.episodeId}:${entry.reason}`).join(', ')}`,
      ),
      check('determinism', digest(positive) === digest(duplicateRun), `digest ${digest(positive)}`),
      check(
        'catalog-ranges',
        rows.every((entry) => {
          const definition = getParameterDefinition(entry.key);
          return (
            entry.value !== null &&
            entry.value >= definition.min &&
            entry.value <= definition.max &&
            entry.unit === definition.unit &&
            positive.keys[entry.key].clamped === false
          );
        }),
        rows.map((entry) => `${entry.key} ${number(entry.value)} ${entry.unit}`).join(', '),
      ),
      check(
        'policy-compatibility',
        rollingCommand.reason === 'ROLLING_STOP_AT_SPEED' &&
          rollingCommand.rollThroughSpeedMps === values.rolling_stop_speed &&
          claimedCommand.reason === 'PRIORITY_CLAIMED' &&
          yieldedCommand.reason === 'PRIORITY_YIELD' &&
          holdCommand.reason === 'ALLWAY_PATIENCE' &&
          turnCommand.reason === 'ALLWAY_TURN' &&
          grantCommand.reason === 'BLOCKED_ENTRY_ACCEPTED' &&
          denialCommand.reason === 'BLOCKED_ENTRY_WAIT',
        `175 reads the estimate without a semantic change: crawl ${number(rollingCommand.rollThroughSpeedMps)} m/s, required gap ${number(requiredGapS)} s (${number(claimedGapS)} claimed / ${number(yieldedGapS)} yielded), patience ${number(values.allway_stop_patience)} s held at ${number(patienceHoldS)} s and turned at ${number(patienceTurnS)} s, entry accepted at draw ${number(grant.sample)} and waited at draw ${number(denial.sample)}`,
      ),
    ],
    passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '176-stop-priority-estimator-v1',
    parameters,
    rows,
    unobserved: unobservedRows,
    groupConstraints: positive.groupConstraints.map((entry) => ({
      id: entry.id,
      keys: entry.keys,
      explanation: entry.explanation,
    })),
    refusals: refused.refusedEpisodes,
    split: {
      seed,
      admitted: positive.admittedEpisodes.length,
      disjoint: new Set(positive.admittedEpisodes).size === positive.admittedEpisodes.length,
    },
    compatibility: {
      policyVersion: STOP_PRIORITY_POLICY_LIMITS.version,
      candidateOnly: positive.compatibility.candidateOnly,
      changesPolicySemantics: positive.compatibility.changesPolicySemantics,
      rollingStopCapMps: positive.compatibility.rollingStopCapMps,
      priorityFloorS: positive.compatibility.priorityFloorS,
      blockedEntryCap: positive.compatibility.blockedEntryCap,
      rollThroughSpeedMps: rollingCommand.rollThroughSpeedMps,
      rollingStopReason: rollingCommand.reason,
      rollingStopCapped: rollingCommand.rollingStopCapped,
      requiredGapS,
      claimedGapS,
      claimed: claimedCommand.priorityClaimed,
      yieldedGapS,
      yielded: yieldedCommand.stopRequested,
      patienceHoldS,
      holdReason: holdCommand.reason,
      patienceTurnS,
      turnReason: turnCommand.reason,
      grantDraw: grant.sample,
      grantReason: grantCommand.reason,
      grantGranted: grantCommand.blockedEntryGranted,
      denialDraw: denial.sample,
      denialReason: denialCommand.reason,
      denialGranted: denialCommand.blockedEntryGranted,
    },
    determinism: {
      seed,
      digest: digest(positive),
      repeatedDigest: digest(duplicateRun),
    },
    checks,
    summary: {
      checks: checks.length,
      passed,
      pass: passed === checks.length,
      candidateKeys: rows.filter((entry) => entry.status === 'CANDIDATE').length,
      unobservedKeys: unobservedRows.filter((entry) => entry.status === 'UNOBSERVED').length,
    },
  };
}

export function stopPriorityEstimatorReportMarkdown(report: StopPriorityReport): string {
  const row = (entry: StopPriorityReportRow) =>
      `| \`${entry.key}\` | \`${entry.scenario}\` | ${entry.context} | ${number(entry.value)} ${entry.unit} | ±${number(entry.uncertainty)} ${entry.unit} | ${entry.uncertaintyThreshold} ${entry.unit} | ${entry.validationStatus}, ${entry.validationEpisodes} episoade, valoare ${number(entry.validationValue)}, eroare ${number(entry.validationError)} ≤ ${entry.validationTolerance} |`,
    unobserved = (entry: StopPriorityReportUnobserved) =>
      `| \`${entry.key}\` | \`${entry.scenario}\` | ${entry.demonstration} | ${entry.status} | ${entry.reason ?? '—'} | ${
        Object.entries(entry.excluded)
          .map(([reason, count]) => `${reason}×${count}`)
          .join(', ') || '—'
      } |`;
  return [
    '# 176 — învățare extinsă pentru stop și prioritate',
    '',
    'Generat de `scripts/run-v2-stop-learning-report.mjs` din contractul `176-stop-priority-estimator-v1`.',
    'Fiecare cheie se estimează numai din scenariul ei eligibil; o cheie fără dovezi suficiente rămâne `UNOBSERVED`, nu primește o valoare inventată.',
    '',
    '## Cheie → scenariu → context → estimare → incertitudine → validare independentă',
    '',
    '| Cheie | Scenariu | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |',
    '| --- | --- | --- | ---: | ---: | ---: | --- |',
    ...report.rows.map(row),
    '',
    `Split explicit cu seed ${report.split.seed}: ${report.split.admitted} episoade admise, fără suprapunere între estimare și validare.`,
    '',
    '## Cazuri fără dovezi identificabile',
    '',
    '| Cheie | Scenariu | Demonstrație | Stare | Motiv | Excluderi |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.unobserved.map(unobserved),
    '',
    '## Constrângeri de grup',
    '',
    ...report.groupConstraints.map(
      (entry) => `- \`${entry.id}\` (${entry.keys.join(', ')}): ${entry.explanation}`,
    ),
    '',
    '## Intrări refuzate',
    '',
    ...report.refusals.map((entry) => `- \`${entry.episodeId}\`: ${entry.reason}`),
    '',
    '## Compatibilitate cu 175',
    '',
    `- Rolling stop: **${number(report.compatibility.rollThroughSpeedMps)} m/s** → \`${report.compatibility.rollingStopReason}\` (plafon aplicat: ${report.compatibility.rollingStopCapped}).`,
    `- Asertivitate: cerință efectivă **${number(report.compatibility.requiredGapS)} s**; ${report.compatibility.claimedGapS} s revendicat (${report.compatibility.claimed}), ${report.compatibility.yieldedGapS} s cedat (${report.compatibility.yielded}).`,
    `- Răbdare all-way: **${number(report.compatibility.patienceHoldS)} s** sub cheie → \`${report.compatibility.holdReason}\`; ${number(report.compatibility.patienceTurnS)} s → \`${report.compatibility.turnReason}\`.`,
    `- Intrare blocată: eșantion ${number(report.compatibility.grantDraw)} → \`${report.compatibility.grantReason}\` (${report.compatibility.grantGranted}); eșantion ${number(report.compatibility.denialDraw)} → \`${report.compatibility.denialReason}\` (${report.compatibility.denialGranted}).`,
    `- Versiune politică: \`${report.compatibility.policyVersion}\`, candidat-only ${report.compatibility.candidateOnly}, semantică schimbată ${report.compatibility.changesPolicySemantics}, plafon rolling ${report.compatibility.rollingStopCapMps} m/s, podea asertivitate ${report.compatibility.priorityFloorS} s, plafon intrare ${report.compatibility.blockedEntryCap}.`,
    '',
    '## Determinism',
    '',
    `- Seed ${report.determinism.seed}: \`${report.determinism.digest}\`.`,
    `- Rulare repetată: \`${report.determinism.repeatedDigest}\`.`,
    '',
    '## Catalog 092',
    '',
    '| Cheie | Interval | Implicit | Unitate |',
    '| --- | ---: | ---: | --- |',
    ...report.parameters.map(
      (entry) =>
        `| \`${entry.key}\` | ${entry.minimum}–${entry.maximum} | ${entry.defaultValue} | ${entry.unit} |`,
    ),
    '',
    '## Verificări',
    '',
    ...report.checks.map(
      (entry) => `- ${entry.pass ? 'PASS' : 'FAIL'} \`${entry.id}\`: ${entry.detail}`,
    ),
    '',
    `**Sumar: ${report.summary.passed}/${report.summary.checks} verificări, ${report.summary.candidateKeys} chei candidate, ${report.summary.unobservedKeys} demonstrații neobservate, ${report.summary.pass ? 'PASS' : 'FAIL'}.**`,
    '',
  ].join('\n');
}

export type { StopPriorityEstimatorKey };
