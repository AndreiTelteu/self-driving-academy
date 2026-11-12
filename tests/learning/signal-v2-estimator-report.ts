import { SIGNAL_POLICY_V2_LIMITS } from '../../src/autonomy';
import {
  SIGNAL_V2_ESTIMATOR_KEYS,
  SIGNAL_V2_ESTIMATOR_LIMITS,
  estimateSignalPolicyStyleV2,
} from '../../src/learning/signal-v2-estimator';
import type {
  SignalV2EstimatorKey,
  SignalV2EstimatorResult,
  SignalV2KeyEstimate,
} from '../../src/learning/signal-v2-estimator';
import { getParameterDefinition } from '../../src/profiles';
import {
  evaluate,
  findYellowOpportunity,
  opportunityKeyFor,
} from '../autonomy/signal-policy-v2-reference';
import {
  commitLowerBoundEpisodes,
  commitUpperBoundEpisodes,
  contradictoryCommitEpisodes,
  contradictoryGapEpisodes,
  crossingOpportunityTicks,
  greenLaunchEpisodes,
  greenLaunchHeldEpisodes,
  greenLaunchMovingEpisodes,
  lateBrakeEpisodes,
  manualEpisodes,
  noisyLaunchEpisodes,
  noisyYellowEpisodes,
  positiveEpisodes,
  redRunBracketEpisodes,
  redRunLowerOnlyEpisodes,
  redRunNotProposedEpisodes,
  redRunSafetyCapEpisodes,
  redRunUnknownGapEpisodes,
  redRunUpperOnlyEpisodes,
  wideCommitEpisodes,
  wideGapEpisodes,
  yellowCommitEpisodes,
  yellowFeasibilityEpisodes,
  yellowTrialsBelowMinimumEpisodes,
  zeroYellowEpisodes,
} from './signal-v2-estimator-reference';

export interface SignalReportCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface SignalReportRow {
  readonly key: SignalV2EstimatorKey;
  readonly scenario: SignalV2KeyEstimate['scenario'];
  readonly unit: string;
  readonly context: string;
  readonly status: SignalV2KeyEstimate['status'];
  readonly value: number | null;
  readonly uncertainty: number | null;
  readonly uncertaintyThreshold: number;
  readonly estimateEpisodes: number;
  readonly validationEpisodes: number;
  readonly validationStatus: SignalV2KeyEstimate['validation']['status'];
  readonly validationValue: number | null;
  readonly validationError: number | null;
  readonly validationTolerance: number;
  readonly reason: string | null;
}
export interface SignalReportUnobserved {
  readonly key: SignalV2EstimatorKey;
  readonly scenario: SignalV2KeyEstimate['scenario'];
  readonly demonstration: string;
  readonly status: SignalV2KeyEstimate['status'];
  readonly value: number | null;
  readonly reason: string | null;
  readonly excluded: Readonly<Record<string, number>>;
  readonly validationStatus: SignalV2KeyEstimate['validation']['status'];
}
export interface SignalReport {
  readonly version: '174-signal-estimator-v2';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly rows: readonly SignalReportRow[];
  readonly unobserved: readonly SignalReportUnobserved[];
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
    readonly policyVersion: '173-signal-policy-v2';
    readonly candidateOnly: boolean;
    readonly changesPolicySemantics: boolean;
    readonly redRunSafetyCapS: number;
    readonly maximumLaunchAccelerationMps2: number;
    readonly yellowStopSample: number;
    readonly yellowStopReason: string;
    readonly yellowProceedSample: number;
    readonly yellowProceedReason: string;
    readonly commitTimeS: number | null;
    readonly commitReason: string;
    readonly sampledTimeS: number | null;
    readonly sampledReason: string;
    readonly requiredRedGapS: number | null;
    readonly acceptedGapS: number;
    readonly accepted: boolean | null;
    readonly rejectedGapS: number;
    readonly rejected: boolean | null;
    readonly launchAccelerationMps2: number | null;
  };
  readonly determinism: {
    readonly seed: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly SignalReportCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
    readonly candidateKeys: number;
    readonly unobservedKeys: number;
  };
}

const seed = 174;
const scenarios = {
  positive: { episodes: positiveEpisodes() },
  yellowOnly: { episodes: yellowFeasibilityEpisodes() },
  commitOnly: { episodes: yellowCommitEpisodes() },
  redOnly: { episodes: redRunBracketEpisodes() },
  launchOnly: { episodes: greenLaunchEpisodes() },
  zeroStop: { episodes: zeroYellowEpisodes() },
  noisyYellow: { episodes: noisyYellowEpisodes() },
  noisyLaunch: { episodes: noisyLaunchEpisodes() },
  commitLowerOnly: { episodes: commitLowerBoundEpisodes() },
  commitUpperOnly: { episodes: commitUpperBoundEpisodes() },
  commitWide: { episodes: wideCommitEpisodes() },
  commitContradictory: { episodes: contradictoryCommitEpisodes() },
  lateBrake: { episodes: lateBrakeEpisodes() },
  gapUpperOnly: { episodes: redRunUpperOnlyEpisodes() },
  gapLowerOnly: { episodes: redRunLowerOnlyEpisodes() },
  gapSafetyCap: { episodes: redRunSafetyCapEpisodes() },
  gapContradictory: { episodes: contradictoryGapEpisodes() },
  gapWide: { episodes: wideGapEpisodes() },
  gapUnknown: { episodes: redRunUnknownGapEpisodes() },
  gapNotProposed: { episodes: redRunNotProposedEpisodes() },
  launchHeld: { episodes: greenLaunchHeldEpisodes() },
  launchMoving: { episodes: greenLaunchMovingEpisodes() },
  trialsBelowMinimum: { episodes: yellowTrialsBelowMinimumEpisodes() },
  manual: { episodes: manualEpisodes() },
  tiny: { episodes: yellowFeasibilityEpisodes([0.8, 0.8, 0.8]) },
  empty: { episodes: [] },
} as const;

function runSet(key: keyof typeof scenarios): SignalV2EstimatorResult {
  return estimateSignalPolicyStyleV2({ episodes: scenarios[key].episodes, splitSeed: seed });
}
function digest(result: SignalV2EstimatorResult): string {
  const text = JSON.stringify(result);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): SignalReportCheck {
  return Object.freeze({ id, pass, detail });
}
function row(entry: SignalV2KeyEstimate): SignalReportRow {
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
  key: SignalV2EstimatorKey,
  demonstration: string,
  result: SignalV2EstimatorResult,
): SignalReportUnobserved {
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

export function runSignalEstimatorReport(): SignalReport {
  const positive = runSet('positive'),
    yellowOnly = runSet('yellowOnly'),
    commitOnly = runSet('commitOnly'),
    redOnly = runSet('redOnly'),
    launchOnly = runSet('launchOnly'),
    zeroStop = runSet('zeroStop'),
    noisyYellow = runSet('noisyYellow'),
    noisyLaunch = runSet('noisyLaunch'),
    commitLowerOnly = runSet('commitLowerOnly'),
    commitUpperOnly = runSet('commitUpperOnly'),
    commitWide = runSet('commitWide'),
    commitContradictory = runSet('commitContradictory'),
    lateBrake = runSet('lateBrake'),
    gapUpperOnly = runSet('gapUpperOnly'),
    gapLowerOnly = runSet('gapLowerOnly'),
    gapSafetyCap = runSet('gapSafetyCap'),
    gapContradictory = runSet('gapContradictory'),
    gapWide = runSet('gapWide'),
    gapUnknown = runSet('gapUnknown'),
    gapNotProposed = runSet('gapNotProposed'),
    launchHeld = runSet('launchHeld'),
    launchMoving = runSet('launchMoving'),
    trialsBelowMinimum = runSet('trialsBelowMinimum'),
    manualSet = runSet('manual'),
    tiny = runSet('tiny'),
    empty = runSet('empty'),
    duplicateRun = runSet('positive'),
    parameters = SIGNAL_V2_ESTIMATOR_KEYS.map((key) => {
      const definition = getParameterDefinition(key);
      return {
        key,
        unit: definition.unit,
        minimum: definition.min,
        maximum: definition.max,
        defaultValue: definition.default,
      };
    }),
    rows = SIGNAL_V2_ESTIMATOR_KEYS.map((key) => row(positive.keys[key])),
    unobservedRows = [
      unobservedRow(
        'yellow_stop_probability',
        'oportunități sub pragul de eșantioane',
        trialsBelowMinimum,
      ),
      unobservedRow(
        'yellow_stop_probability',
        'opt rate de oprire reale, dar împrăștiate (0–1)',
        noisyYellow,
      ),
      unobservedRow('yellow_stop_probability', 'demonstrații MANUAL, neeligibile', manualSet),
      unobservedRow(
        'yellow_commit_time',
        'doar apropieri angajate, fără limită superioară',
        commitLowerOnly,
      ),
      unobservedRow(
        'yellow_commit_time',
        'doar apropieri eșantionate, fără limită inferioară',
        commitUpperOnly,
      ),
      unobservedRow('yellow_commit_time', 'limite reale, dar prea largi (0,4–4,0 s)', commitWide),
      unobservedRow(
        'yellow_commit_time',
        'două limite incompatibile în același episod',
        commitContradictory,
      ),
      unobservedRow(
        'yellow_commit_time',
        'oprire M de frânare târzie, care precede orizontul',
        lateBrake,
      ),
      unobservedRow(
        'red_run_gap_acceptance',
        'doar traversări acceptate, fără limită inferioară',
        gapUpperOnly,
      ),
      unobservedRow(
        'red_run_gap_acceptance',
        'doar refuzuri peste plasa de siguranță',
        gapLowerOnly,
      ),
      unobservedRow(
        'red_run_gap_acceptance',
        'toate refuzurile sub plasa de siguranță de 3 s',
        gapSafetyCap,
      ),
      unobservedRow(
        'red_run_gap_acceptance',
        'acceptare sub un refuz, imposibil de satisfăcut',
        gapContradictory,
      ),
      unobservedRow('red_run_gap_acceptance', 'limită reală, dar prea largă (3–8 s)', gapWide),
      unobservedRow('red_run_gap_acceptance', 'gap conflictual necunoscut', gapUnknown),
      unobservedRow(
        'red_run_gap_acceptance',
        '050 păstrează oprirea, nicio traversare propusă',
        gapNotProposed,
      ),
      unobservedRow('green_launch_acceleration', 'ținerea M de la verde încă activă', launchHeld),
      unobservedRow(
        'green_launch_acceleration',
        'eliberare din mișcare, nu plecare de pe loc',
        launchMoving,
      ),
      unobservedRow(
        'green_launch_acceleration',
        'patru plecări reale, dar împrăștiate (0,3–6)',
        noisyLaunch,
      ),
      unobservedRow('yellow_stop_probability', 'set fără episoade', empty),
    ],
    refused = estimateSignalPolicyStyleV2({
      splitSeed: seed,
      episodes: [
        ...manualEpisodes(),
        yellowFeasibilityEpisodes()[0]!,
        yellowFeasibilityEpisodes()[0]!,
      ],
    }),
    values = Object.fromEntries(
      SIGNAL_V2_ESTIMATOR_KEYS.map((key) => [key, positive.keys[key].value!]),
    ) as Record<SignalV2EstimatorKey, number>,
    yellowScene = {
      state: 'YELLOW',
      speed: 12,
      distanceToStopLineM: 37,
      phaseRemainingS: 20,
      conflictGapS: null,
    } as const,
    stopOpportunity = findYellowOpportunity((sample) => sample < values.yellow_stop_probability),
    proceedOpportunity = findYellowOpportunity(
      (sample) => sample >= values.yellow_stop_probability,
    ),
    stopCommand = evaluate(yellowScene, {
      rValues: values,
      opportunityKey: stopOpportunity.opportunityKey,
    }).command,
    proceedCommand = evaluate(yellowScene, {
      rValues: values,
      opportunityKey: proceedOpportunity.opportunityKey,
    }).command,
    commitCommand = evaluate(
      {
        state: 'YELLOW',
        speed: 10,
        distanceToStopLineM: 21,
        phaseRemainingS: 20,
        conflictGapS: null,
      },
      { rValues: values },
    ).command,
    sampledCommand = evaluate(
      {
        state: 'YELLOW',
        speed: 10,
        distanceToStopLineM: 22,
        phaseRemainingS: 20,
        conflictGapS: null,
      },
      { rValues: values },
    ).command,
    crossing = opportunityKeyFor(crossingOpportunityTicks(1)[0]!),
    acceptedCommand = evaluate(
      { state: 'RED', speed: 10, distanceToStopLineM: 11, phaseRemainingS: 20, conflictGapS: 4.5 },
      { rValues: values, mValues: { red_stop_probability: 0.5 }, opportunityKey: crossing },
    ).command,
    rejectedCommand = evaluate(
      { state: 'RED', speed: 10, distanceToStopLineM: 11, phaseRemainingS: 20, conflictGapS: 4.4 },
      { rValues: values, mValues: { red_stop_probability: 0.5 }, opportunityKey: crossing },
    ).command,
    launchCommand = evaluate(
      {
        state: 'GREEN',
        speed: 0,
        distanceToStopLineM: null,
        phaseRemainingS: 10,
        conflictGapS: null,
      },
      { rValues: values },
    ).command,
    rejectedInvalid = (() => {
      const episode = yellowFeasibilityEpisodes()[0]!;
      try {
        estimateSignalPolicyStyleV2({
          splitSeed: seed,
          episodes: [
            {
              ...episode,
              samples: [
                { ...episode.samples[0]!, speedMps: Number.NaN },
                ...episode.samples.slice(1),
              ],
            },
          ],
        });
        return false;
      } catch (error) {
        return error instanceof Error && /signal evidence/i.test(error.message);
      }
    })(),
    checks: SignalReportCheck[] = [
      check(
        'scenario-yellow',
        yellowOnly.keys.yellow_stop_probability.status === 'CANDIDATE' &&
          near(yellowOnly.keys.yellow_stop_probability.value, 0.8, 0.15) &&
          yellowOnly.keys.yellow_commit_time.status === 'UNOBSERVED' &&
          yellowOnly.keys.red_run_gap_acceptance.status === 'UNOBSERVED' &&
          yellowOnly.keys.green_launch_acceleration.status === 'UNOBSERVED',
        `yellow-only stop rate ${number(yellowOnly.keys.yellow_stop_probability.value)} probability; engagement, red run and launch stay unobserved`,
      ),
      check(
        'scenario-commit',
        commitOnly.keys.yellow_commit_time.status === 'CANDIDATE' &&
          near(commitOnly.keys.yellow_commit_time.value, 2, 0.2) &&
          commitOnly.keys.yellow_stop_probability.status === 'UNOBSERVED' &&
          commitOnly.keys.red_run_gap_acceptance.status === 'UNOBSERVED' &&
          commitOnly.keys.green_launch_acceleration.status === 'UNOBSERVED',
        `commitment-only horizon ${number(commitOnly.keys.yellow_commit_time.value)} s; the other three stay unobserved`,
      ),
      check(
        'scenario-red',
        redOnly.keys.red_run_gap_acceptance.status === 'CANDIDATE' &&
          near(redOnly.keys.red_run_gap_acceptance.value, 4.5, 1e-9) &&
          redOnly.keys.yellow_stop_probability.status === 'UNOBSERVED' &&
          redOnly.keys.yellow_commit_time.status === 'UNOBSERVED' &&
          redOnly.keys.green_launch_acceleration.status === 'UNOBSERVED',
        `red-run-only gap ${number(redOnly.keys.red_run_gap_acceptance.value)} s; the yellow keys and launch stay unobserved`,
      ),
      check(
        'scenario-launch',
        launchOnly.keys.green_launch_acceleration.status === 'CANDIDATE' &&
          near(launchOnly.keys.green_launch_acceleration.value, 1.5, 1e-9) &&
          launchOnly.keys.yellow_stop_probability.status === 'UNOBSERVED' &&
          launchOnly.keys.yellow_commit_time.status === 'UNOBSERVED' &&
          launchOnly.keys.red_run_gap_acceptance.status === 'UNOBSERVED',
        `launch-only acceleration ${number(launchOnly.keys.green_launch_acceleration.value)} m/s²; the other three stay unobserved`,
      ),
      check(
        'zero-stop-observed',
        zeroStop.keys.yellow_stop_probability.status === 'CANDIDATE' &&
          zeroStop.keys.yellow_stop_probability.value === 0 &&
          zeroStop.keys.yellow_stop_probability.reason === null &&
          zeroStop.keys.yellow_stop_probability.validation.status === 'VALIDATED',
        'a demonstrated stop rate of zero is a real zero, not missing evidence',
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
        'uncertainty-yellow',
        noisyYellow.keys.yellow_stop_probability.status === 'UNOBSERVED' &&
          noisyYellow.keys.yellow_stop_probability.reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
          noisyYellow.keys.yellow_stop_probability.value === null &&
          noisyYellow.keys.yellow_stop_probability.uncertainty !== null &&
          noisyYellow.keys.yellow_stop_probability.uncertainty >
            noisyYellow.keys.yellow_stop_probability.uncertaintyThreshold,
        `scattered stop rates measure ${number(noisyYellow.keys.yellow_stop_probability.uncertainty)} > ${noisyYellow.keys.yellow_stop_probability.uncertaintyThreshold} and stay unobserved`,
      ),
      check(
        'uncertainty-launch',
        noisyLaunch.keys.green_launch_acceleration.status === 'UNOBSERVED' &&
          noisyLaunch.keys.green_launch_acceleration.reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
          noisyLaunch.keys.green_launch_acceleration.uncertainty !== null &&
          noisyLaunch.keys.green_launch_acceleration.uncertainty >
            noisyLaunch.keys.green_launch_acceleration.uncertaintyThreshold,
        `scattered launches measure ${number(noisyLaunch.keys.green_launch_acceleration.uncertainty)} m/s² > ${noisyLaunch.keys.green_launch_acceleration.uncertaintyThreshold} and stay unobserved`,
      ),
      check(
        'uncertainty-commit',
        commitWide.keys.yellow_commit_time.status === 'UNOBSERVED' &&
          commitWide.keys.yellow_commit_time.reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
          commitWide.keys.yellow_commit_time.uncertainty !== null &&
          commitWide.keys.yellow_commit_time.uncertainty >
            commitWide.keys.yellow_commit_time.uncertaintyThreshold,
        `a 0.4–4.0 s bound measures ±${number(commitWide.keys.yellow_commit_time.uncertainty)} s and stays unobserved`,
      ),
      check(
        'uncertainty-gap',
        gapWide.keys.red_run_gap_acceptance.status === 'UNOBSERVED' &&
          gapWide.keys.red_run_gap_acceptance.reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
          gapWide.keys.red_run_gap_acceptance.uncertainty !== null &&
          gapWide.keys.red_run_gap_acceptance.uncertainty >
            gapWide.keys.red_run_gap_acceptance.uncertaintyThreshold,
        `a 3–8 s bound measures ±${number(gapWide.keys.red_run_gap_acceptance.uncertainty)} s and stays unobserved`,
      ),
      check(
        'validation-split',
        rows.every(
          (entry) =>
            entry.validationStatus === 'VALIDATED' &&
            entry.validationEpisodes >= SIGNAL_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes &&
            entry.estimateEpisodes >= SIGNAL_V2_ESTIMATOR_LIMITS.minimumEstimateEpisodes,
        ),
        `seed ${seed}: every key validates on held-out episodes (${rows.map((entry) => `${entry.key} ${entry.estimateEpisodes}+${entry.validationEpisodes}`).join(', ')})`,
      ),
      check(
        'validation-too-small',
        tiny.keys.yellow_stop_probability.status === 'CANDIDATE' &&
          tiny.keys.yellow_stop_probability.validation.status === 'TOO_SMALL' &&
          tiny.keys.yellow_stop_probability.validation.episodes === 1,
        `three episodes leave ${tiny.keys.yellow_stop_probability.validation.episodes} held-out episode, reported as ${tiny.keys.yellow_stop_probability.validation.status}`,
      ),
      check(
        'unobserved-safety-cap',
        gapSafetyCap.keys.red_run_gap_acceptance.reason === 'RED_RUN_SAFETY_CAP' &&
          gapSafetyCap.keys.red_run_gap_acceptance.value === null &&
          gapSafetyCap.keys.red_run_gap_acceptance.excluded.RED_RUN_SAFETY_CAP === 4 &&
          gapNotProposed.keys.red_run_gap_acceptance.reason === 'RED_RUN_NOT_PROPOSED',
        'below the 3 s safety cap the cap decides, and a 050 stop proposes no crossing at all',
      ),
      check(
        'unobserved-unknown-gap',
        gapUnknown.keys.red_run_gap_acceptance.reason === 'RED_RUN_GAP_UNKNOWN' &&
          gapUnknown.keys.red_run_gap_acceptance.value === null &&
          gapUnknown.keys.red_run_gap_acceptance.excluded.RED_RUN_GAP_UNKNOWN === 4,
        'an unknown conflict gap refuses the crossing and proves no key value',
      ),
      check(
        'unobserved-bounds',
        commitLowerOnly.keys.yellow_commit_time.reason === 'COMMIT_UPPER_BOUND_UNOBSERVED' &&
          commitUpperOnly.keys.yellow_commit_time.reason === 'COMMIT_LOWER_BOUND_UNOBSERVED' &&
          commitContradictory.keys.yellow_commit_time.reason === 'CONTRADICTORY_COMMIT_BOUNDS' &&
          lateBrake.keys.yellow_commit_time.reason === 'COMMIT_PREEMPTED_BY_LATE_BRAKE' &&
          gapUpperOnly.keys.red_run_gap_acceptance.reason === 'RED_RUN_LOWER_BOUND_UNOBSERVED' &&
          gapLowerOnly.keys.red_run_gap_acceptance.reason === 'RED_RUN_UPPER_BOUND_UNOBSERVED' &&
          gapContradictory.keys.red_run_gap_acceptance.reason === 'CONTRADICTORY_GAP_BOUNDS',
        'a single inequality is a bound, two incompatible demonstrations have no value, and the M late brake precedes the horizon',
      ),
      check(
        'unobserved-green-launch',
        launchHeld.keys.green_launch_acceleration.reason === 'GREEN_LAUNCH_HELD_BY_DELAY' &&
          launchMoving.keys.green_launch_acceleration.reason === 'GREEN_LAUNCH_NOT_FROM_STANDSTILL',
        'the M start delay and a release from motion are not launch observations',
      ),
      check(
        'shared-channel-separation',
        commitOnly.keys.yellow_stop_probability.status === 'UNOBSERVED' &&
          yellowOnly.keys.yellow_commit_time.reason === 'COMMIT_LOWER_BOUND_UNOBSERVED' &&
          redOnly.keys.yellow_commit_time.status === 'UNOBSERVED' &&
          launchOnly.keys.red_run_gap_acceptance.status === 'UNOBSERVED',
        'an engagement approach never supplies a compliance trial, and a red run never proves the yellow keys',
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
              entry.keys.every((key) => SIGNAL_V2_ESTIMATOR_KEYS.includes(key)),
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
        stopCommand.reason === 'YELLOW_STOP' &&
          proceedCommand.reason === 'YELLOW_PROCEED' &&
          commitCommand.reason === 'YELLOW_COMMIT' &&
          sampledCommand.sampledUnit !== null &&
          acceptedCommand.redRunAccepted === true &&
          acceptedCommand.requiredRedGapS === 4.5 &&
          rejectedCommand.redRunAccepted === false &&
          launchCommand.launchAccelerationMps2 === positive.keys.green_launch_acceleration.value,
        `173 reads the estimate without a semantic change: yellow samples ${number(stopOpportunity.sample)} → ${stopCommand.reason} and ${number(proceedOpportunity.sample)} → ${proceedCommand.reason}, engagement ${number(commitCommand.timeToLineS)} s → ${commitCommand.reason}, required red gap ${number(acceptedCommand.requiredRedGapS)} s (4.5 accepted / 4.4 rejected), launch ${number(launchCommand.launchAccelerationMps2)} m/s²`,
      ),
    ],
    passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '174-signal-estimator-v2',
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
      policyVersion: SIGNAL_POLICY_V2_LIMITS.version,
      candidateOnly: positive.compatibility.candidateOnly,
      changesPolicySemantics: positive.compatibility.changesPolicySemantics,
      redRunSafetyCapS: positive.compatibility.redRunSafetyCapS,
      maximumLaunchAccelerationMps2: positive.compatibility.maximumLaunchAccelerationMps2,
      yellowStopSample: stopOpportunity.sample,
      yellowStopReason: stopCommand.reason,
      yellowProceedSample: proceedOpportunity.sample,
      yellowProceedReason: proceedCommand.reason,
      commitTimeS: commitCommand.timeToLineS,
      commitReason: commitCommand.reason,
      sampledTimeS: sampledCommand.timeToLineS,
      sampledReason: sampledCommand.reason,
      requiredRedGapS: acceptedCommand.requiredRedGapS,
      acceptedGapS: 4.5,
      accepted: acceptedCommand.redRunAccepted,
      rejectedGapS: 4.4,
      rejected: rejectedCommand.redRunAccepted,
      launchAccelerationMps2: launchCommand.launchAccelerationMps2,
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

export function signalEstimatorReportMarkdown(report: SignalReport): string {
  const row = (entry: SignalReportRow) =>
      `| \`${entry.key}\` | \`${entry.scenario}\` | ${entry.context} | ${number(entry.value)} ${entry.unit} | ±${number(entry.uncertainty)} ${entry.unit} | ${entry.uncertaintyThreshold} ${entry.unit} | ${entry.validationStatus}, ${entry.validationEpisodes} episoade, valoare ${number(entry.validationValue)}, eroare ${number(entry.validationError)} ≤ ${entry.validationTolerance} |`,
    unobservedRow = (entry: SignalReportUnobserved) =>
      `| \`${entry.key}\` | \`${entry.scenario}\` | ${entry.demonstration} | ${entry.status} | ${entry.reason ?? '—'} | ${
        Object.entries(entry.excluded)
          .map(([reason, count]) => `${reason}×${count}`)
          .join(', ') || '—'
      } |`;
  return [
    '# 174 — învățare extinsă pentru semafoare',
    '',
    'Generat de `scripts/run-v2-signal-learning-report.mjs` din contractul `174-signal-estimator-v2`.',
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
    '## Compatibilitate cu 173',
    '',
    `- Eșantion de galben sub probabilitate: ${number(report.compatibility.yellowStopSample)} → \`${report.compatibility.yellowStopReason}\`; peste probabilitate: ${number(report.compatibility.yellowProceedSample)} → \`${report.compatibility.yellowProceedReason}\`.`,
    `- Apropiere la ${number(report.compatibility.commitTimeS)} s → \`${report.compatibility.commitReason}\`; apropiere la ${number(report.compatibility.sampledTimeS)} s → \`${report.compatibility.sampledReason}\` (eșantionată).`,
    `- Gap pe roșu: cerință efectivă **${number(report.compatibility.requiredRedGapS)} s**; ${report.compatibility.acceptedGapS} s acceptat (${report.compatibility.accepted}), ${report.compatibility.rejectedGapS} s refuzat (${report.compatibility.rejected}).`,
    `- Accelerație de plecare la verde: **${number(report.compatibility.launchAccelerationMps2)} m/s²**.`,
    `- Versiune politică: \`${report.compatibility.policyVersion}\`, candidat-only ${report.compatibility.candidateOnly}, semantică schimbată ${report.compatibility.changesPolicySemantics}, plasă de siguranță ${report.compatibility.redRunSafetyCapS} s, plafon de plecare ${report.compatibility.maximumLaunchAccelerationMps2} m/s².`,
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

export type { SignalV2EstimatorKey };
