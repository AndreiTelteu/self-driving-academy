import { LANE_POLICY_V2_LIMITS } from '../../src/autonomy';
import {
  LANE_V2_ESTIMATOR_KEYS,
  LANE_V2_ESTIMATOR_LIMITS,
  estimateLaneV2Style,
} from '../../src/learning/lane-v2-estimator';
import type {
  LaneV2EstimatorKey,
  LaneV2EstimatorResult,
  LaneV2KeyEstimate,
} from '../../src/learning/lane-v2-estimator';
import { getParameterDefinition } from '../../src/profiles';
import { evaluate, progressAfterStart, run } from '../autonomy/lane-policy-v2-reference';
import {
  alternatingIndicatorEpisodes,
  durationEpisodes,
  indicatorEpisodes,
  indicatorOff,
  indicatorOn,
  leadEpisodes,
  leftScene,
  manualEpisodes,
  positiveEpisodes,
  rightPassContradictoryEpisodes,
  rightPassEpisodes,
  rightPassForbiddenEpisodes,
  rightPassGrant,
  rightPassGrantOnlyEpisodes,
  rightPassRefusal,
  rightPassRefusalOnlyEpisodes,
  rightScene,
  unsignalledDurationEpisodes,
  wideRightPassEpisodes,
  zeroIndicatorEpisodes,
  zeroLeadEpisodes,
} from './lane-v2-estimator-reference';

export interface LaneReportCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface LaneReportRow {
  readonly key: LaneV2EstimatorKey;
  readonly scenario: LaneV2KeyEstimate['scenario'];
  readonly unit: string;
  readonly context: string;
  readonly status: LaneV2KeyEstimate['status'];
  readonly value: number | null;
  readonly uncertainty: number | null;
  readonly uncertaintyThreshold: number;
  readonly estimateEpisodes: number;
  readonly validationEpisodes: number;
  readonly validationStatus: LaneV2KeyEstimate['validation']['status'];
  readonly validationValue: number | null;
  readonly validationError: number | null;
  readonly validationTolerance: number;
  readonly reason: string | null;
}
export interface LaneReportUnobserved {
  readonly key: LaneV2EstimatorKey;
  readonly scenario: LaneV2KeyEstimate['scenario'];
  readonly demonstration: string;
  readonly status: LaneV2KeyEstimate['status'];
  readonly value: number | null;
  readonly reason: string | null;
  readonly excluded: Readonly<Record<string, number>>;
  readonly validationStatus: LaneV2KeyEstimate['validation']['status'];
}
export interface LaneReport {
  readonly version: '178-lane-estimator-v2';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly rows: readonly LaneReportRow[];
  readonly unobserved: readonly LaneReportUnobserved[];
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
    readonly policyVersion: '177-lane-policy-v2';
    readonly candidateOnly: boolean;
    readonly changesPolicySemantics: boolean;
    readonly tickHz: number;
    readonly minimumManoeuvreDurationS: number;
    readonly durationTicks: number;
    readonly durationProgressAfter30: number;
    readonly durationFloorTicks: number;
    readonly durationCeilingTicks: number;
    readonly durationReason: string;
    readonly leadTicks: number;
    readonly leadFirstReason: string;
    readonly leadFinalReason: string;
    readonly leadProgressAtStart: number;
    readonly indicatorKey: number;
    readonly indicatorOnSample: number;
    readonly indicatorOnUsed: boolean;
    readonly indicatorOffSample: number;
    readonly indicatorOffUsed: boolean;
    readonly grantDraw: number;
    readonly grantGranted: boolean | null;
    readonly grantReason: string;
    readonly refusalDraw: number;
    readonly refusalGranted: boolean | null;
    readonly refusalReason: string;
  };
  readonly determinism: {
    readonly seed: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly LaneReportCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
    readonly candidateKeys: number;
    readonly unobservedKeys: number;
  };
}

const seed = 178;
const noisyDuration = durationEpisodes([1.5, 2.5, 3.5, 4.5], { idPrefix: 'noisy', from: 700 }),
  noisyLead = leadEpisodes([1.5, 2.5, 3.5, 4.5], { idPrefix: 'lead-noisy', from: 800 }),
  floorDuration = durationEpisodes([0.5, 0.5, 1, 1], { idPrefix: 'floor', from: 500 }),
  mixedFloorDuration = durationEpisodes([0.5, 2, 0.5, 2], { idPrefix: 'mixed', from: 600 }),
  censoredLead = leadEpisodes([5, 5, 5, 5], { idPrefix: 'lead-censored', from: 1000 }).map(
    (episode) => ({
      ...episode,
      samples: episode.samples.filter((sample) => sample.manoeuvreStartTick === null),
    }),
  ),
  unsignalledDuration = unsignalledDurationEpisodes(),
  tiny = durationEpisodes([2, 2, 2], { idPrefix: 'tiny', from: 1100 });

const scenarios = {
  positive: { episodes: positiveEpisodes() },
  durationOnly: { episodes: durationEpisodes() },
  leadOnly: { episodes: leadEpisodes() },
  indicatorOnly: { episodes: indicatorEpisodes() },
  rightPassOnly: { episodes: rightPassEpisodes() },
  zeroLead: { episodes: zeroLeadEpisodes() },
  zeroIndicator: { episodes: zeroIndicatorEpisodes() },
  alternatingIndicator: { episodes: alternatingIndicatorEpisodes() },
  noisyDuration: { episodes: noisyDuration },
  noisyLead: { episodes: noisyLead },
  floorDuration: { episodes: floorDuration },
  mixedFloorDuration: { episodes: mixedFloorDuration },
  censoredLead: { episodes: censoredLead },
  unsignalledDuration: { episodes: unsignalledDuration },
  grantOnly: { episodes: rightPassGrantOnlyEpisodes() },
  refusalOnly: { episodes: rightPassRefusalOnlyEpisodes() },
  contradictoryPass: { episodes: rightPassContradictoryEpisodes() },
  widePass: { episodes: wideRightPassEpisodes() },
  precondition: { episodes: rightPassForbiddenEpisodes() },
  manual: { episodes: manualEpisodes() },
  tiny: { episodes: tiny },
  empty: { episodes: [] },
} as const;

function runSet(key: keyof typeof scenarios): LaneV2EstimatorResult {
  return estimateLaneV2Style({ episodes: scenarios[key].episodes, splitSeed: seed });
}
function digest(result: LaneV2EstimatorResult): string {
  const text = JSON.stringify(result);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): LaneReportCheck {
  return Object.freeze({ id, pass, detail });
}
function row(entry: LaneV2KeyEstimate): LaneReportRow {
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
  key: LaneV2EstimatorKey,
  demonstration: string,
  result: LaneV2EstimatorResult,
): LaneReportUnobserved {
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

export function runLaneV2EstimatorReport(): LaneReport {
  const positive = runSet('positive'),
    durationOnly = runSet('durationOnly'),
    leadOnly = runSet('leadOnly'),
    indicatorOnly = runSet('indicatorOnly'),
    rightPassOnly = runSet('rightPassOnly'),
    zeroLead = runSet('zeroLead'),
    zeroIndicator = runSet('zeroIndicator'),
    alternatingIndicator = runSet('alternatingIndicator'),
    noisyDurationSet = runSet('noisyDuration'),
    noisyLeadSet = runSet('noisyLead'),
    floorDurationSet = runSet('floorDuration'),
    mixedFloor = runSet('mixedFloorDuration'),
    censoredLeadSet = runSet('censoredLead'),
    unsignalledLead = runSet('unsignalledDuration'),
    grantOnly = runSet('grantOnly'),
    refusalOnly = runSet('refusalOnly'),
    contradictoryPass = runSet('contradictoryPass'),
    widePass = runSet('widePass'),
    precondition = runSet('precondition'),
    manualSet = runSet('manual'),
    tinySet = runSet('tiny'),
    empty = runSet('empty'),
    duplicateRun = runSet('positive'),
    parameters = LANE_V2_ESTIMATOR_KEYS.map((key) => {
      const definition = getParameterDefinition(key);
      return {
        key,
        unit: definition.unit,
        minimum: definition.min,
        maximum: definition.max,
        defaultValue: definition.default,
      };
    }),
    rows = LANE_V2_ESTIMATOR_KEYS.map((key) => row(positive.keys[key])),
    unobservedRows = [
      unobservedRow(
        'lane_change_duration',
        'manevre care ating podeaua de 1 s (chei 0,5–1 s): banda nu este identificabilă',
        floorDurationSet,
      ),
      unobservedRow(
        'lane_change_duration',
        'manevre care pretind simultan podeaua și o durată exactă',
        mixedFloor,
      ),
      unobservedRow(
        'lane_change_duration',
        'durate reale împrăștiate între 1,5 și 4,5 s',
        noisyDurationSet,
      ),
      unobservedRow('lane_change_duration', 'demonstrații MANUAL, neeligibile', manualSet),
      unobservedRow(
        'signal_lead_time',
        'manevre fără indicator: avansul nu există',
        unsignalledLead,
      ),
      unobservedRow(
        'signal_lead_time',
        'manevre semnalizate a căror mișcare nu a pornit: avans cenzat',
        censoredLeadSet,
      ),
      unobservedRow(
        'signal_lead_time',
        'avansuri reale împrăștiate între 1,5 și 4,5 s',
        noisyLeadSet,
      ),
      unobservedRow(
        'signal_use_probability',
        'episoade contradictorii, fără indicator în unele și mereu în altele',
        alternatingIndicator,
      ),
      unobservedRow(
        'signal_use_probability',
        'prea puține oportunități distincte pentru o rată',
        durationOnly,
      ),
      unobservedRow(
        'pass_on_right_probability',
        'hartă care interzice, nu declară sau nu acoperă spațiul: niciun eșantion extras',
        precondition,
      ),
      unobservedRow(
        'pass_on_right_probability',
        'doar acceptări, fără limită superioară',
        grantOnly,
      ),
      unobservedRow(
        'pass_on_right_probability',
        'doar refuzuri, fără limită inferioară',
        refusalOnly,
      ),
      unobservedRow(
        'pass_on_right_probability',
        'acceptare peste un refuz: limite incompatibile',
        contradictoryPass,
      ),
      unobservedRow(
        'pass_on_right_probability',
        'limită reală, dar prea largă (0,05–0,47)',
        widePass,
      ),
      unobservedRow('pass_on_right_probability', 'set fără episoade', empty),
    ],
    refused = estimateLaneV2Style({
      splitSeed: seed,
      episodes: [...manualEpisodes(), durationEpisodes()[0]!, durationEpisodes()[0]!],
    }),
    values = Object.fromEntries(
      LANE_V2_ESTIMATOR_KEYS.map((key) => [key, positive.keys[key].value!]),
    ) as Record<LaneV2EstimatorKey, number>,
    durationProgress = progressAfterStart(leftScene, {
      rValues: { signal_use_probability: 0, lane_change_duration: values.lane_change_duration },
      advanceTicks: 30,
    }),
    durationFloor = progressAfterStart(leftScene, {
      rValues: { signal_use_probability: 0, lane_change_duration: 0.5 },
      advanceTicks: 0,
    }),
    durationCeiling = progressAfterStart(leftScene, {
      rValues: { signal_use_probability: 0, lane_change_duration: 5 },
      advanceTicks: 0,
    }),
    indicatorOnOpportunity = indicatorOn(0)[0]!,
    indicatorOffOpportunity = indicatorOff(0)[0]!,
    leadRun = run(leftScene, {
      rValues: {
        signal_use_probability: 1,
        signal_lead_time: values.signal_lead_time,
        lane_change_duration: values.lane_change_duration,
      },
      opportunityKey: indicatorOnOpportunity.opportunityKey,
      ticks: 400,
      stopWhen: (command) => command.action === 'LANE_CHANGE',
    }),
    leadTicks = leadRun.commands.length - 1,
    grant = rightPassGrant(0),
    refusal = rightPassRefusal(0),
    grantCommand = evaluate(rightScene, {
      rValues: { ...values, signal_use_probability: 0 },
      opportunityKey: grant.opportunityKey,
    }).command,
    refusalCommand = evaluate(rightScene, {
      rValues: { ...values, signal_use_probability: 0 },
      opportunityKey: refusal.opportunityKey,
    }).command,
    indicatorOnCommand = evaluate(leftScene, {
      rValues: values,
      opportunityKey: indicatorOnOpportunity.opportunityKey,
    }).command,
    indicatorOffCommand = evaluate(leftScene, {
      rValues: values,
      opportunityKey: indicatorOffOpportunity.opportunityKey,
    }).command,
    rejectedInvalid = (() => {
      const episode = durationEpisodes()[0]!;
      try {
        estimateLaneV2Style({
          splitSeed: seed,
          episodes: [
            {
              ...episode,
              samples: [
                { ...episode.samples[0]!, lateralProgress: Number.NaN },
                ...episode.samples.slice(1),
              ],
            },
          ],
        });
        return false;
      } catch (error) {
        return error instanceof Error && /lane evidence/i.test(error.message);
      }
    })(),
    checks: LaneReportCheck[] = [
      check(
        'scenario-duration',
        durationOnly.keys.lane_change_duration.status === 'CANDIDATE' &&
          near(durationOnly.keys.lane_change_duration.value, 1.9917, 0.01) &&
          durationOnly.keys.signal_lead_time.status === 'UNOBSERVED' &&
          durationOnly.keys.signal_use_probability.status === 'UNOBSERVED' &&
          durationOnly.keys.pass_on_right_probability.status === 'UNOBSERVED',
        `duration-only duration ${number(durationOnly.keys.lane_change_duration.value)} s; lead, indicator and right pass stay unobserved`,
      ),
      check(
        'scenario-lead',
        leadOnly.keys.signal_lead_time.status === 'CANDIDATE' &&
          near(leadOnly.keys.signal_lead_time.value, 1.9917, 0.01) &&
          leadOnly.keys.lane_change_duration.status === 'UNOBSERVED' &&
          leadOnly.keys.signal_use_probability.status === 'UNOBSERVED' &&
          leadOnly.keys.pass_on_right_probability.status === 'UNOBSERVED',
        `lead-only lead ${number(leadOnly.keys.signal_lead_time.value)} s; duration, indicator and right pass stay unobserved`,
      ),
      check(
        'scenario-indicator',
        indicatorOnly.keys.signal_use_probability.status === 'CANDIDATE' &&
          near(indicatorOnly.keys.signal_use_probability.value, 0.4, 1e-9) &&
          indicatorOnly.keys.lane_change_duration.status === 'UNOBSERVED' &&
          indicatorOnly.keys.pass_on_right_probability.status === 'UNOBSERVED',
        `indicator-only probability ${number(indicatorOnly.keys.signal_use_probability.value)} over distinct opportunities; duration and right pass stay unobserved`,
      ),
      check(
        'scenario-right-pass',
        rightPassOnly.keys.pass_on_right_probability.status === 'CANDIDATE' &&
          near(
            rightPassOnly.keys.pass_on_right_probability.value,
            (grant.sample + refusal.sample) / 2,
            1e-9,
          ) &&
          rightPassOnly.keys.lane_change_duration.status === 'UNOBSERVED' &&
          rightPassOnly.keys.signal_use_probability.status === 'UNOBSERVED',
        `right-pass-only probability ${number(rightPassOnly.keys.pass_on_right_probability.value)} between the draws ${number(grant.sample)} and ${number(refusal.sample)}`,
      ),
      check(
        'zero-lead-observed',
        zeroLead.keys.signal_lead_time.status === 'CANDIDATE' &&
          zeroLead.keys.signal_lead_time.value === 0 &&
          zeroLead.keys.signal_lead_time.reason === null &&
          zeroLead.keys.signal_lead_time.validation.status === 'VALIDATED',
        'signalling that starts the movement in the same tick is a demonstrated lead of 0 s, not missing evidence',
      ),
      check(
        'zero-indicator-observed',
        zeroIndicator.keys.signal_use_probability.status === 'CANDIDATE' &&
          zeroIndicator.keys.signal_use_probability.value === 0 &&
          zeroIndicator.keys.signal_use_probability.reason === null &&
          zeroIndicator.keys.signal_use_probability.validation.status === 'VALIDATED',
        'forty opportunities without a single indicator are a demonstrated zero probability',
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
        'uncertainty-duration',
        noisyDurationSet.keys.lane_change_duration.status === 'UNOBSERVED' &&
          noisyDurationSet.keys.lane_change_duration.reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
          noisyDurationSet.keys.lane_change_duration.uncertainty !== null &&
          noisyDurationSet.keys.lane_change_duration.uncertainty >
            noisyDurationSet.keys.lane_change_duration.uncertaintyThreshold,
        `scattered durations measure ±${number(noisyDurationSet.keys.lane_change_duration.uncertainty)} s > ${noisyDurationSet.keys.lane_change_duration.uncertaintyThreshold} and stay unobserved`,
      ),
      check(
        'uncertainty-lead',
        noisyLeadSet.keys.signal_lead_time.status === 'UNOBSERVED' &&
          noisyLeadSet.keys.signal_lead_time.reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
          noisyLeadSet.keys.signal_lead_time.uncertainty !== null &&
          noisyLeadSet.keys.signal_lead_time.uncertainty >
            noisyLeadSet.keys.signal_lead_time.uncertaintyThreshold,
        `scattered leads measure ±${number(noisyLeadSet.keys.signal_lead_time.uncertainty)} s > ${noisyLeadSet.keys.signal_lead_time.uncertaintyThreshold} and stay unobserved`,
      ),
      check(
        'uncertainty-indicator',
        alternatingIndicator.keys.signal_use_probability.status === 'UNOBSERVED' &&
          alternatingIndicator.keys.signal_use_probability.reason ===
            'UNCERTAINTY_ABOVE_THRESHOLD' &&
          alternatingIndicator.keys.signal_use_probability.uncertainty !== null &&
          alternatingIndicator.keys.signal_use_probability.uncertainty >
            alternatingIndicator.keys.signal_use_probability.uncertaintyThreshold,
        `never-versus-always indicator episodes measure ±${number(alternatingIndicator.keys.signal_use_probability.uncertainty)} > ${alternatingIndicator.keys.signal_use_probability.uncertaintyThreshold} and stay unobserved`,
      ),
      check(
        'uncertainty-right-pass',
        widePass.keys.pass_on_right_probability.status === 'UNOBSERVED' &&
          widePass.keys.pass_on_right_probability.reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
          widePass.keys.pass_on_right_probability.uncertainty !== null &&
          widePass.keys.pass_on_right_probability.uncertainty >
            widePass.keys.pass_on_right_probability.uncertaintyThreshold,
        `a 0.05–0.47 bound measures ±${number(widePass.keys.pass_on_right_probability.uncertainty)} > ${widePass.keys.pass_on_right_probability.uncertaintyThreshold} and stays unobserved`,
      ),
      check(
        'validation-split',
        rows.every(
          (entry) =>
            entry.validationStatus === 'VALIDATED' &&
            entry.validationEpisodes >= LANE_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes &&
            entry.estimateEpisodes >= LANE_V2_ESTIMATOR_LIMITS.minimumEstimateEpisodes,
        ),
        `seed ${seed}: every key validates on held-out episodes (${rows.map((entry) => `${entry.key} ${entry.estimateEpisodes}+${entry.validationEpisodes}`).join(', ')})`,
      ),
      check(
        'validation-too-small',
        tinySet.keys.lane_change_duration.status === 'CANDIDATE' &&
          tinySet.keys.lane_change_duration.validation.status === 'TOO_SMALL' &&
          tinySet.keys.lane_change_duration.validation.episodes === 1,
        `three episodes leave ${tinySet.keys.lane_change_duration.validation.episodes} held-out episode, reported as ${tinySet.keys.lane_change_duration.validation.status}`,
      ),
      check(
        'duration-floor',
        floorDurationSet.keys.lane_change_duration.reason === 'DURATION_FLOOR_SATURATED' &&
          floorDurationSet.keys.lane_change_duration.value === null &&
          mixedFloor.keys.lane_change_duration.reason === 'DURATION_FLOOR_INCONSISTENT' &&
          mixedFloor.keys.lane_change_duration.excluded.DURATION_FLOOR_INCONSISTENT === 1,
        'the explicit one-second floor makes every key in 0.5–1 s produce the same 60 ticks, so that band stays unobserved and a set that mixes the floor with an exact duration has no value',
      ),
      check(
        'lead-requires-indicator',
        unsignalledLead.keys.signal_lead_time.status === 'UNOBSERVED' &&
          unsignalledLead.keys.signal_lead_time.value === null &&
          unsignalledLead.keys.signal_lead_time.reason === 'SIGNAL_LEAD_WITHOUT_INDICATOR' &&
          unsignalledLead.keys.signal_lead_time.excluded.SIGNAL_LEAD_WITHOUT_INDICATOR === 4 &&
          censoredLeadSet.keys.signal_lead_time.reason === 'SIGNAL_LEAD_CENSORED' &&
          censoredLeadSet.keys.signal_lead_time.excluded.SIGNAL_LEAD_CENSORED === 4 &&
          positive.keys.signal_lead_time.status === 'CANDIDATE',
        'without the indicator there is no lead, a signalled manoeuvre whose movement never started is only a censored wait, and only a started signalled manoeuvre measures the key',
      ),
      check(
        'right-pass-precondition',
        precondition.keys.pass_on_right_probability.reason === 'RIGHT_PASS_PRECONDITION' &&
          precondition.keys.pass_on_right_probability.excluded.RIGHT_PASS_PRECONDITION === 4 &&
          rightPassForbiddenEpisodes().every((episode) =>
            episode.samples.every((sample) => sample.rightOvertakeSample === null),
          ),
        'a forbidden, undeclared or too-tight right lane refuses the manoeuvre before the draw, so it says nothing about the probability',
      ),
      check(
        'right-pass-bounds',
        grantOnly.keys.pass_on_right_probability.reason === 'RIGHT_PASS_UPPER_BOUND_UNOBSERVED' &&
          refusalOnly.keys.pass_on_right_probability.reason ===
            'RIGHT_PASS_LOWER_BOUND_UNOBSERVED' &&
          contradictoryPass.keys.pass_on_right_probability.reason ===
            'CONTRADICTORY_RIGHT_PASS_BOUNDS' &&
          contradictoryPass.keys.pass_on_right_probability.excluded
            .CONTRADICTORY_RIGHT_PASS_BOUNDS === 4,
        'a grant is only a lower bound, a refusal only an upper bound, and a grant above a refusal has no intersection',
      ),
      check(
        'indicator-trials',
        positive.keys.signal_use_probability.uncertainty !== null &&
          positive.keys.signal_use_probability.sourceSamples >=
            LANE_V2_ESTIMATOR_LIMITS.minimumIndicatorOpportunities &&
          positive.keys.signal_use_probability.validation.status === 'VALIDATED',
        `the rate rests on ${positive.keys.signal_use_probability.sourceSamples} distinct opportunities, not on frames`,
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
        positive.groupConstraints.length === 5 &&
          positive.groupConstraints.every(
            (entry) =>
              entry.explanation.length > 40 &&
              entry.keys.every((key) => LANE_V2_ESTIMATOR_KEYS.includes(key)),
          ),
        positive.groupConstraints.map((entry) => entry.id).join(', '),
      ),
      check(
        'invalid-input-refused',
        rejectedInvalid && refused.refusedEpisodes.length === 5,
        `NaN lateral progress refused; ${refused.refusedEpisodes.map((entry) => `${entry.episodeId}:${entry.reason}`).join(', ')}`,
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
        durationProgress.durationTicks ===
          Math.ceil(values.lane_change_duration * LANE_V2_ESTIMATOR_LIMITS.tickHz) &&
          durationProgress.progress === 30 / durationProgress.durationTicks &&
          leadTicks === Math.ceil(values.signal_lead_time * LANE_V2_ESTIMATOR_LIMITS.tickHz) &&
          leadRun.commands[0]!.reason === 'SIGNAL_LEAD' &&
          leadRun.commands[leadTicks]!.reason === 'SIGNAL_LEAD_COMPLETE' &&
          indicatorOnCommand.signalUsed ===
            indicatorOnOpportunity.sample < values.signal_use_probability &&
          indicatorOffCommand.signalUsed ===
            indicatorOffOpportunity.sample < values.signal_use_probability &&
          grantCommand.rightOvertakeGranted === true &&
          refusalCommand.rightOvertakeGranted === false,
        `177 reads the estimate without a semantic change: ${durationProgress.durationTicks} ticks of lateral movement at ${number(durationProgress.progress)} after 30 ticks, ${leadTicks} lead ticks, indicator ${indicatorOnCommand.signalUsed ? 'on' : 'off'} at draw ${number(indicatorOnOpportunity.sample)} and ${indicatorOffCommand.signalUsed ? 'on' : 'off'} at ${number(indicatorOffOpportunity.sample)}, right pass granted at draw ${number(grant.sample)} and refused at ${number(refusal.sample)}`,
      ),
    ],
    passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '178-lane-estimator-v2',
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
      policyVersion: LANE_POLICY_V2_LIMITS.version,
      candidateOnly: positive.compatibility.candidateOnly,
      changesPolicySemantics: positive.compatibility.changesPolicySemantics,
      tickHz: positive.compatibility.tickHz,
      minimumManoeuvreDurationS: positive.compatibility.minimumManoeuvreDurationS,
      durationTicks: durationProgress.durationTicks,
      durationProgressAfter30: durationProgress.progress,
      durationFloorTicks: durationFloor.durationTicks,
      durationCeilingTicks: durationCeiling.durationTicks,
      durationReason: durationProgress.started.reason,
      leadTicks,
      leadFirstReason: leadRun.commands[0]!.reason,
      leadFinalReason: leadRun.commands[leadTicks]!.reason,
      leadProgressAtStart: leadRun.commands[leadTicks]!.lateralProgress ?? 0,
      indicatorKey: values.signal_use_probability,
      indicatorOnSample: indicatorOnOpportunity.sample,
      indicatorOnUsed: indicatorOnCommand.signalUsed,
      indicatorOffSample: indicatorOffOpportunity.sample,
      indicatorOffUsed: indicatorOffCommand.signalUsed,
      grantDraw: grant.sample,
      grantGranted: grantCommand.rightOvertakeGranted,
      grantReason: grantCommand.reason,
      refusalDraw: refusal.sample,
      refusalGranted: refusalCommand.rightOvertakeGranted,
      refusalReason: refusalCommand.reason,
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

export function laneV2EstimatorReportMarkdown(report: LaneReport): string {
  const row = (entry: LaneReportRow) =>
      `| \`${entry.key}\` | \`${entry.scenario}\` | ${entry.context} | ${number(entry.value)} ${entry.unit} | ±${number(entry.uncertainty)} ${entry.unit} | ${entry.uncertaintyThreshold} ${entry.unit} | ${entry.validationStatus}, ${entry.validationEpisodes} episoade, valoare ${number(entry.validationValue)}, eroare ${number(entry.validationError)} ≤ ${entry.validationTolerance} |`,
    unobserved = (entry: LaneReportUnobserved) =>
      `| \`${entry.key}\` | \`${entry.scenario}\` | ${entry.demonstration} | ${entry.status} | ${entry.reason ?? '—'} | ${
        Object.entries(entry.excluded)
          .map(([reason, count]) => `${reason}×${count}`)
          .join(', ') || '—'
      } |`;
  return [
    '# 178 — învățare extinsă pentru schimbare de bandă și depășire',
    '',
    'Generat de `scripts/run-v2-lane-learning-report.mjs` din contractul `178-lane-estimator-v2`.',
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
    '## Compatibilitate cu 177',
    '',
    `- Durată: **${report.compatibility.durationTicks} tick-uri** de mișcare laterală, progres ${number(report.compatibility.durationProgressAfter30)} după 30 de tick-uri (\`${report.compatibility.durationReason}\`); podeaua de 1 s dă ${report.compatibility.durationFloorTicks} tick-uri, iar plafonul de 5 s dă ${report.compatibility.durationCeilingTicks}.`,
    `- Avans: **${report.compatibility.leadTicks} tick-uri** între indicator și prima mișcare (\`${report.compatibility.leadFirstReason}\` → \`${report.compatibility.leadFinalReason}\`), cu progres lateral ${number(report.compatibility.leadProgressAtStart)} la pornire.`,
    `- Indicator: cheia ${number(report.compatibility.indicatorKey)} → eșantion ${number(report.compatibility.indicatorOnSample)} ${report.compatibility.indicatorOnUsed ? 'pornește' : 'nu pornește'} indicatorul, eșantion ${number(report.compatibility.indicatorOffSample)} ${report.compatibility.indicatorOffUsed ? 'pornește' : 'nu pornește'} indicatorul.`,
    `- Depășire prin dreapta: eșantion ${number(report.compatibility.grantDraw)} → \`${report.compatibility.grantReason}\` (${report.compatibility.grantGranted}); eșantion ${number(report.compatibility.refusalDraw)} → \`${report.compatibility.refusalReason}\` (${report.compatibility.refusalGranted}).`,
    `- Versiune politică: \`${report.compatibility.policyVersion}\`, candidat-only ${report.compatibility.candidateOnly}, semantică schimbată ${report.compatibility.changesPolicySemantics}, rată de tick ${report.compatibility.tickHz} Hz, podea de manevră ${report.compatibility.minimumManoeuvreDurationS} s.`,
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

export type { LaneV2EstimatorKey };
