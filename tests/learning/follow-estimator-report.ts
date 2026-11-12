import { FOLLOW_POLICY_LIMITS } from '../../src/autonomy';
import {
  FOLLOW_ESTIMATOR_KEYS,
  FOLLOW_ESTIMATOR_LIMITS,
  estimateFollowPolicyStyle,
} from '../../src/learning/follow-estimator';
import type {
  FollowEstimatorKey,
  FollowEstimatorResult,
  FollowKeyEstimate,
} from '../../src/learning/follow-estimator';
import { getParameterDefinition } from '../../src/profiles';
import { evaluate, followProfile, run, state } from '../autonomy/follow-policy-reference';
import {
  bandUpperUnobservedEpisodes,
  censoredHoldEpisodes,
  closingEpisodes,
  closingWithoutCapEpisodes,
  contradictoryBandEpisodes,
  cutInEpisodes,
  cutInWithoutReductionEpisodes,
  hysteresisEpisodes,
  interruptedHoldEpisodes,
  leaderChangeEpisodes,
  manualEpisodes,
  noisyCutInEpisodes,
  noisyDelayEpisodes,
  oneSidedBandEpisodes,
  positiveEpisodes,
} from './follow-estimator-reference';

export interface FollowReportCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface FollowReportRow {
  readonly key: FollowEstimatorKey;
  readonly episode: FollowKeyEstimate['episode'];
  readonly unit: string;
  readonly context: string;
  readonly status: FollowKeyEstimate['status'];
  readonly value: number | null;
  readonly uncertainty: number | null;
  readonly uncertaintyThreshold: number;
  readonly estimateEpisodes: number;
  readonly validationEpisodes: number;
  readonly validationStatus: FollowKeyEstimate['validation']['status'];
  readonly validationValue: number | null;
  readonly validationError: number | null;
  readonly validationTolerance: number;
  readonly reason: string | null;
}
export interface FollowReportUnobserved {
  readonly key: FollowEstimatorKey;
  readonly episode: FollowKeyEstimate['episode'];
  readonly scenario: string;
  readonly status: FollowKeyEstimate['status'];
  readonly value: number | null;
  readonly reason: string | null;
  readonly excluded: Readonly<Record<string, number>>;
  readonly validationStatus: FollowKeyEstimate['validation']['status'];
}
export interface FollowReport {
  readonly version: '172-follow-estimator-v1';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly rows: readonly FollowReportRow[];
  readonly unobserved: readonly FollowReportUnobserved[];
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
    readonly policyVersion: '171-follow-policy-v1';
    readonly candidateOnly: boolean;
    readonly changesPolicySemantics: boolean;
    readonly cutInCommittedMps: number;
    readonly expectedCutInMps: number;
    readonly ttcCapMps: number | null;
    readonly expectedTtcCapMps: number;
    readonly leaderHoldTicks: number;
    readonly expectedLeaderHoldTicks: number;
    readonly hysteresisHeldInside: boolean;
    readonly hysteresisHeldOutside: boolean;
  };
  readonly determinism: {
    readonly seed: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly FollowReportCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
    readonly candidateKeys: number;
    readonly unobservedKeys: number;
  };
}

const seed = 172;
const scenarios = {
  positive: { episodes: positiveEpisodes() },
  cutInOnly: { episodes: cutInEpisodes() },
  closingOnly: { episodes: closingEpisodes() },
  leaderChangeOnly: { episodes: leaderChangeEpisodes() },
  hysteresisOnly: { episodes: hysteresisEpisodes() },
  zeroDelay: { episodes: leaderChangeEpisodes([0, 0, 0, 0]) },
  noisyCutIn: { episodes: noisyCutInEpisodes() },
  noisyDelay: { episodes: noisyDelayEpisodes() },
  cutInWithoutReduction: { episodes: cutInWithoutReductionEpisodes() },
  closingWithoutCap: { episodes: closingWithoutCapEpisodes() },
  censoredHold: { episodes: censoredHoldEpisodes() },
  interruptedHold: { episodes: interruptedHoldEpisodes() },
  bandWithoutUpper: { episodes: bandUpperUnobservedEpisodes() },
  oneSidedBand: { episodes: oneSidedBandEpisodes() },
  contradictoryBand: { episodes: contradictoryBandEpisodes() },
  manual: { episodes: manualEpisodes() },
  tiny: { episodes: cutInEpisodes([0.7, 0.7, 0.7]) },
  empty: { episodes: [] },
} as const;

function runSet(key: keyof typeof scenarios): FollowEstimatorResult {
  return estimateFollowPolicyStyle({ episodes: scenarios[key].episodes, splitSeed: seed });
}
function digest(result: FollowEstimatorResult): string {
  const text = JSON.stringify(result);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): FollowReportCheck {
  return Object.freeze({ id, pass, detail });
}
function row(entry: FollowKeyEstimate): FollowReportRow {
  return {
    key: entry.key,
    episode: entry.episode,
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
  key: FollowEstimatorKey,
  scenario: string,
  result: FollowEstimatorResult,
): FollowReportUnobserved {
  const entry = result.keys[key];
  return {
    key,
    episode: entry.episode,
    scenario,
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
export function runFollowEstimatorReport(): FollowReport {
  const positive = runSet('positive'),
    cutInOnly = runSet('cutInOnly'),
    closingOnly = runSet('closingOnly'),
    leaderChangeOnly = runSet('leaderChangeOnly'),
    hysteresisOnly = runSet('hysteresisOnly'),
    zeroDelay = runSet('zeroDelay'),
    noisyCutIn = runSet('noisyCutIn'),
    noisyDelay = runSet('noisyDelay'),
    cutInWithoutReduction = runSet('cutInWithoutReduction'),
    closingWithoutCap = runSet('closingWithoutCap'),
    censoredHold = runSet('censoredHold'),
    interruptedHold = runSet('interruptedHold'),
    bandWithoutUpper = runSet('bandWithoutUpper'),
    oneSidedBand = runSet('oneSidedBand'),
    contradictoryBand = runSet('contradictoryBand'),
    manualSet = runSet('manual'),
    tiny = runSet('tiny'),
    empty = runSet('empty'),
    duplicateRun = runSet('positive'),
    parameters = FOLLOW_ESTIMATOR_KEYS.map((key) => {
      const definition = getParameterDefinition(key);
      return {
        key,
        unit: definition.unit,
        minimum: definition.min,
        maximum: definition.max,
        defaultValue: definition.default,
      };
    }),
    rows = FOLLOW_ESTIMATOR_KEYS.map((key) => row(positive.keys[key])),
    unobservedRows = [
      unobservedRow(
        'cutin_brake_response',
        'cut-in fără reducere oferită de 048',
        cutInWithoutReduction,
      ),
      unobservedRow(
        'cutin_brake_response',
        'patru reacții reale, dar împrăștiate (0,1–1)',
        noisyCutIn,
      ),
      unobservedRow(
        'closing_ttc_threshold',
        'apropiere reală fără plafon activ',
        closingWithoutCap,
      ),
      unobservedRow('leader_change_delay', 'ținere tăiată de fereastra de dovezi', censoredHold),
      unobservedRow('leader_change_delay', 'ținere întreruptă de o reducere', interruptedHold),
      unobservedRow('leader_change_delay', 'întârzieri reale, dar împrăștiate (0–2 s)', noisyDelay),
      unobservedRow(
        'following_hysteresis',
        'bandă depășită, dar nicio ieșire observată',
        bandWithoutUpper,
      ),
      unobservedRow(
        'following_hysteresis',
        'oscilație doar deasupra decalajului dorit',
        oneSidedBand,
      ),
      unobservedRow('following_hysteresis', 'două benzi incompatibile', contradictoryBand),
      unobservedRow('cutin_brake_response', 'demonstrații MANUAL, neeligibile', manualSet),
      unobservedRow('closing_ttc_threshold', 'set fără episoade', empty),
    ],
    refused = estimateFollowPolicyStyle({
      splitSeed: seed,
      episodes: [...manualEpisodes(), cutInEpisodes()[0]!, cutInEpisodes()[0]!],
    }),
    values = Object.fromEntries(
      FOLLOW_ESTIMATOR_KEYS.map((key) => [key, positive.keys[key].value!]),
    ) as Record<FollowEstimatorKey, number>,
    profile = followProfile(values),
    settled = evaluate(profile, { egoSpeed: 15, leadGap: 40, leadSpeed: 15, leaderId: 'a' }),
    cutInCommand = evaluate(
      profile,
      { egoSpeed: 15, leadGap: 18, leadSpeed: 12, leaderId: 'b', cutIn: true },
      { state: settled.state, offset: 1 },
    ),
    expectedCutIn =
      settled.committedTargetMps -
      values.cutin_brake_response * (settled.committedTargetMps - cutInCommand.requestedTargetMps),
    closingCommand = evaluate(
      profile,
      { egoSpeed: 18, leadGap: 60, leadSpeed: 4, leaderId: 'a', cruiseTargetMps: 30 },
      { offset: 2 },
    ),
    expectedTtcCap = 4 + (60 - FOLLOW_POLICY_LIMITS.minimumLeadGapM) / values.closing_ttc_threshold,
    holdRun = run(
      profile,
      [
        { egoSpeed: 12, leadGap: 20, leadSpeed: 12, leaderId: 'a', leaderIncarnation: 1 },
        ...Array.from({ length: 14 }, () => ({
          egoSpeed: 12,
          leadGap: 60,
          leadSpeed: 20,
          leaderId: 'b',
          leaderIncarnation: 1,
        })),
      ],
      { initial: state() },
    ),
    leaderHoldTicks = holdRun.filter((entry) => entry.bindingConstraint === 'LEADER_DELAY').length,
    expectedLeaderHoldTicks = Math.ceil(values.leader_change_delay * FOLLOW_POLICY_LIMITS.tickHz),
    heldState = {
      ...state(),
      leaderId: 'a',
      leaderIncarnation: 10,
      committedTargetMps: 12.8,
    },
    hysteresisHeldInside = evaluate(
      profile,
      { egoSpeed: 12, leadGap: 25.4, leadSpeed: 12, leaderId: 'a' },
      { state: heldState },
    ).hysteresisHeld,
    hysteresisHeldOutside = evaluate(
      profile,
      { egoSpeed: 12, leadGap: 25.8, leadSpeed: 12, leaderId: 'a' },
      { state: heldState },
    ).hysteresisHeld,
    rejectedInvalid = (() => {
      const episode = cutInEpisodes()[0]!;
      try {
        estimateFollowPolicyStyle({
          splitSeed: seed,
          episodes: [
            {
              ...episode,
              samples: [
                { ...episode.samples[0]!, egoSpeedMps: Number.NaN },
                ...episode.samples.slice(1),
              ],
            },
          ],
        });
        return false;
      } catch (error) {
        return error instanceof Error && /follow evidence/i.test(error.message);
      }
    })(),
    checks: FollowReportCheck[] = [
      check(
        'context-cutin',
        cutInOnly.keys.cutin_brake_response.status === 'CANDIDATE' &&
          near(cutInOnly.keys.cutin_brake_response.value, 0.7, 1e-9) &&
          cutInOnly.keys.closing_ttc_threshold.reason === 'NO_CLOSING_EPISODE' &&
          cutInOnly.keys.leader_change_delay.reason === 'NO_LEADER_CHANGE' &&
          cutInOnly.keys.following_hysteresis.reason === 'NO_HYSTERESIS_EPISODE',
        `cut-in-only response ${number(cutInOnly.keys.cutin_brake_response.value)} ratio; the other three keys stay unobserved`,
      ),
      check(
        'context-closing',
        closingOnly.keys.closing_ttc_threshold.status === 'CANDIDATE' &&
          near(closingOnly.keys.closing_ttc_threshold.value, 3, 1e-6) &&
          closingOnly.keys.cutin_brake_response.reason === 'NO_CUT_IN_EPISODE' &&
          closingOnly.keys.leader_change_delay.reason === 'NO_LEADER_CHANGE',
        `closing-only threshold ${number(closingOnly.keys.closing_ttc_threshold.value)} s; cut-in and delay stay unobserved`,
      ),
      check(
        'context-leader-change',
        leaderChangeOnly.keys.leader_change_delay.status === 'CANDIDATE' &&
          near(
            leaderChangeOnly.keys.leader_change_delay.value,
            0.2,
            1 / FOLLOW_ESTIMATOR_LIMITS.tickHz,
          ) &&
          leaderChangeOnly.keys.cutin_brake_response.reason === 'NO_CUT_IN_EPISODE' &&
          leaderChangeOnly.keys.closing_ttc_threshold.reason === 'NO_CLOSING_EPISODE',
        `leader-change-only delay ${number(leaderChangeOnly.keys.leader_change_delay.value)} s; cut-in and closing stay unobserved`,
      ),
      check(
        'context-hysteresis',
        hysteresisOnly.keys.following_hysteresis.status === 'CANDIDATE' &&
          near(hysteresisOnly.keys.following_hysteresis.value, 1, 1e-9) &&
          hysteresisOnly.keys.cutin_brake_response.reason === 'NO_CUT_IN_EPISODE' &&
          hysteresisOnly.keys.leader_change_delay.reason === 'NO_LEADER_CHANGE',
        `hysteresis-only band ${number(hysteresisOnly.keys.following_hysteresis.value)} m; cut-in and delay stay unobserved`,
      ),
      check(
        'zero-delay-observed',
        zeroDelay.keys.leader_change_delay.status === 'CANDIDATE' &&
          zeroDelay.keys.leader_change_delay.value === 0 &&
          zeroDelay.keys.leader_change_delay.reason === null &&
          zeroDelay.keys.leader_change_delay.validation.status === 'VALIDATED',
        'a demonstrated adoption without delay is a real zero, not missing evidence',
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
        'uncertainty-threshold-cutin',
        noisyCutIn.keys.cutin_brake_response.status === 'UNOBSERVED' &&
          noisyCutIn.keys.cutin_brake_response.reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
          noisyCutIn.keys.cutin_brake_response.value === null &&
          noisyCutIn.keys.cutin_brake_response.uncertainty !== null &&
          noisyCutIn.keys.cutin_brake_response.uncertainty >
            noisyCutIn.keys.cutin_brake_response.uncertaintyThreshold,
        `scattered cut-in reactions measure ${number(noisyCutIn.keys.cutin_brake_response.uncertainty)} > ${noisyCutIn.keys.cutin_brake_response.uncertaintyThreshold} and stay unobserved`,
      ),
      check(
        'uncertainty-threshold-delay',
        noisyDelay.keys.leader_change_delay.status === 'UNOBSERVED' &&
          noisyDelay.keys.leader_change_delay.reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
          noisyDelay.keys.leader_change_delay.value === null &&
          noisyDelay.keys.leader_change_delay.uncertainty !== null &&
          noisyDelay.keys.leader_change_delay.uncertainty >
            noisyDelay.keys.leader_change_delay.uncertaintyThreshold,
        `delays from 0 to 2 s measure ${number(noisyDelay.keys.leader_change_delay.uncertainty)} s > ${noisyDelay.keys.leader_change_delay.uncertaintyThreshold} s and stay unobserved`,
      ),
      check(
        'validation-split',
        rows.every(
          (entry) =>
            entry.validationStatus === 'VALIDATED' &&
            entry.validationEpisodes >= FOLLOW_ESTIMATOR_LIMITS.minimumValidationEpisodes &&
            entry.estimateEpisodes >= FOLLOW_ESTIMATOR_LIMITS.minimumEstimateEpisodes &&
            entry.estimateEpisodes + entry.validationEpisodes === 4,
        ),
        `seed ${seed}: every key validates on held-out episodes (${rows.map((entry) => `${entry.key} ${entry.estimateEpisodes}+${entry.validationEpisodes}`).join(', ')})`,
      ),
      check(
        'validation-too-small',
        tiny.keys.cutin_brake_response.status === 'CANDIDATE' &&
          tiny.keys.cutin_brake_response.validation.status === 'TOO_SMALL' &&
          tiny.keys.cutin_brake_response.validation.episodes === 1,
        `three cut-in episodes leave ${tiny.keys.cutin_brake_response.validation.episodes} held-out episode, reported as ${tiny.keys.cutin_brake_response.validation.status}`,
      ),
      check(
        'unobserved-cutin-without-reduction',
        cutInWithoutReduction.keys.cutin_brake_response.status === 'UNOBSERVED' &&
          cutInWithoutReduction.keys.cutin_brake_response.value === null &&
          cutInWithoutReduction.keys.cutin_brake_response.reason === 'CUT_IN_WITHOUT_REDUCTION' &&
          cutInWithoutReduction.keys.cutin_brake_response.excluded.CUT_IN_WITHOUT_REDUCTION === 4,
        'a cut-in that asks for more speed offers no reduction to measure',
      ),
      check(
        'unobserved-closing-not-bound',
        closingWithoutCap.keys.closing_ttc_threshold.status === 'UNOBSERVED' &&
          closingWithoutCap.keys.closing_ttc_threshold.value === null &&
          closingWithoutCap.keys.closing_ttc_threshold.reason === 'TTC_CAP_NOT_BOUND',
        'a real closing whose cap never binds leaves only a bound, not a threshold',
      ),
      check(
        'unobserved-censored-hold',
        censoredHold.keys.leader_change_delay.status === 'UNOBSERVED' &&
          censoredHold.keys.leader_change_delay.value === null &&
          censoredHold.keys.leader_change_delay.reason === 'LEADER_HOLD_CENSORED',
        'a hold cut by the evidence window is reported as censored, not measured',
      ),
      check(
        'unobserved-interrupted-hold',
        interruptedHold.keys.leader_change_delay.status === 'UNOBSERVED' &&
          interruptedHold.keys.leader_change_delay.value === null &&
          interruptedHold.keys.leader_change_delay.reason ===
            'LEADER_HOLD_INTERRUPTED_BY_REDUCTION' &&
          interruptedHold.keys.leader_change_delay.excluded.LEADER_HOLD_INTERRUPTED_BY_REDUCTION ===
            4,
        'a brake during the hold is adopted at once, so the delay is not read from it',
      ),
      check(
        'unobserved-band-bounds',
        bandWithoutUpper.keys.following_hysteresis.reason === 'HYSTERESIS_UPPER_BOUND_UNOBSERVED' &&
          oneSidedBand.keys.following_hysteresis.reason === 'NO_BAND_OSCILLATION' &&
          contradictoryBand.keys.following_hysteresis.reason === 'CONTRADICTORY_BAND_BOUNDS',
        'a missing escape, a one-sided drift and two incompatible bands all stay unobserved',
      ),
      check(
        'shared-channel-separation',
        cutInOnly.keys.closing_ttc_threshold.status === 'UNOBSERVED' &&
          closingOnly.keys.cutin_brake_response.status === 'UNOBSERVED' &&
          hysteresisOnly.keys.cutin_brake_response.status === 'UNOBSERVED' &&
          hysteresisOnly.keys.closing_ttc_threshold.status === 'UNOBSERVED',
        'a cut-in never proves the TTC threshold and a closing never proves the cut-in reaction',
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
        positive.groupConstraints.length === 4 &&
          positive.groupConstraints.every(
            (entry) =>
              entry.explanation.length > 40 &&
              entry.keys.every((key) => FOLLOW_ESTIMATOR_KEYS.includes(key)),
          ),
        positive.groupConstraints.map((entry) => entry.id).join(', '),
      ),
      check(
        'invalid-input-refused',
        rejectedInvalid && refused.refusedEpisodes.length === 5,
        `NaN speed refused; ${refused.refusedEpisodes.map((entry) => `${entry.episodeId}:${entry.reason}`).join(', ')}`,
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
        near(cutInCommand.committedTargetMps, expectedCutIn, 1e-9) &&
          near(closingCommand.ttcCapMps, expectedTtcCap, 1e-9) &&
          near(closingCommand.committedTargetMps, expectedTtcCap, 1e-9) &&
          leaderHoldTicks === expectedLeaderHoldTicks &&
          hysteresisHeldInside === true &&
          hysteresisHeldOutside === false,
        `171 reads cut-in commitment ${number(cutInCommand.committedTargetMps)} m/s (expected ${number(expectedCutIn)}), contact cap ${number(closingCommand.ttcCapMps)} m/s (expected ${number(expectedTtcCap)}), ${leaderHoldTicks} held ticks for ${number(values.leader_change_delay)} s, hysteresis held ${hysteresisHeldInside}/${hysteresisHeldOutside}`,
      ),
    ],
    passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '172-follow-estimator-v1',
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
      policyVersion: FOLLOW_POLICY_LIMITS.version,
      candidateOnly: positive.compatibility.candidateOnly,
      changesPolicySemantics: positive.compatibility.changesPolicySemantics,
      cutInCommittedMps: cutInCommand.committedTargetMps,
      expectedCutInMps: expectedCutIn,
      ttcCapMps: closingCommand.ttcCapMps,
      expectedTtcCapMps: expectedTtcCap,
      leaderHoldTicks,
      expectedLeaderHoldTicks,
      hysteresisHeldInside,
      hysteresisHeldOutside,
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

export function followEstimatorReportMarkdown(report: FollowReport): string {
  const row = (entry: FollowReportRow) =>
      `| \`${entry.key}\` | \`${entry.episode}\` | ${entry.context} | ${number(entry.value)} ${entry.unit} | ±${number(entry.uncertainty)} ${entry.unit} | ${entry.uncertaintyThreshold} ${entry.unit} | ${entry.validationStatus}, ${entry.validationEpisodes} episoade, valoare ${number(entry.validationValue)}, eroare ${number(entry.validationError)} ≤ ${entry.validationTolerance} |`,
    unobservedRow = (entry: FollowReportUnobserved) =>
      `| \`${entry.key}\` | \`${entry.episode}\` | ${entry.scenario} | ${entry.status} | ${entry.reason ?? '—'} | ${
        Object.entries(entry.excluded)
          .map(([reason, count]) => `${reason}×${count}`)
          .join(', ') || '—'
      } |`;
  return [
    '# 172 — învățare extinsă pentru urmărire și distanțe',
    '',
    'Generat de `scripts/run-v2-follow-learning-report.mjs` din contractul `172-follow-estimator-v1`.',
    'Fiecare cheie se estimează numai din episodul ei eligibil; o cheie fără dovezi suficiente rămâne `UNOBSERVED`, nu primește o valoare inventată.',
    '',
    '## Cheie → episod → context → estimare → incertitudine → validare independentă',
    '',
    '| Cheie | Episod | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |',
    '| --- | --- | --- | ---: | ---: | ---: | --- |',
    ...report.rows.map(row),
    '',
    `Split explicit cu seed ${report.split.seed}: ${report.split.admitted} episoade admise, fără suprapunere între estimare și validare.`,
    '',
    '## Cazuri fără dovezi identificabile',
    '',
    '| Cheie | Episod | Scenariu | Stare | Motiv | Excluderi |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.unobserved.map(unobservedRow),
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
    '## Compatibilitate cu 171',
    '',
    `- Ținta commitată pe episodul de cut-in: **${number(report.compatibility.cutInCommittedMps)} m/s** (așteptat ${number(report.compatibility.expectedCutInMps)} m/s).`,
    `- Plafonul de contact pe episodul de apropiere: **${number(report.compatibility.ttcCapMps)} m/s** (așteptat ${number(report.compatibility.expectedTtcCapMps)} m/s).`,
    `- Tick-uri de ținere a liderului nou: **${report.compatibility.leaderHoldTicks}** (așteptat ${report.compatibility.expectedLeaderHoldTicks}).`,
    `- Histerezis în interiorul benzii / în afara benzii: **${report.compatibility.hysteresisHeldInside}** / **${report.compatibility.hysteresisHeldOutside}**.`,
    `- Versiune politică: \`${report.compatibility.policyVersion}\`, candidat-only ${report.compatibility.candidateOnly}, semantică schimbată ${report.compatibility.changesPolicySemantics}.`,
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

export type { FollowEstimatorKey };
