import { LATERAL_POLICY_V2_LIMITS } from '../../src/autonomy';
import {
  LATERAL_V2_ESTIMATOR_KEYS,
  LATERAL_V2_ESTIMATOR_LIMITS,
  estimateLateralV2Style,
} from '../../src/learning/lateral-v2-estimator';
import type {
  LateralV2EstimatorKey,
  LateralV2EstimatorResult,
  LateralV2KeyEstimate,
} from '../../src/learning/lateral-v2-estimator';
import { getParameterDefinition } from '../../src/profiles';
import { evaluate, firstMovement, run, turnState } from '../autonomy/lateral-policy-v2-reference';
import {
  censoredResponseEpisodes,
  compactClearanceEpisodes,
  contradictoryDeadbandEpisodes,
  deadbandEpisodes,
  demonstrationKeys,
  keyEpisodes,
  lowerOnlyDeadbandEpisodes,
  manualEpisodes,
  missingLatchEpisodes,
  obstacleScene,
  positiveEpisodes,
  straightDeviationScene,
  straightScene,
  truncatedExitEpisodes,
  turnScene,
  unusablePrefixEpisodes,
  upperOnlyDeadbandEpisodes,
  wideDeadbandEpisodes,
} from './lateral-v2-estimator-reference';

export interface LateralLearningCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface LateralLearningRow {
  readonly key: LateralV2EstimatorKey;
  readonly scenario: LateralV2KeyEstimate['scenario'];
  readonly unit: string;
  readonly context: string;
  readonly status: LateralV2KeyEstimate['status'];
  readonly value: number | null;
  readonly uncertainty: number | null;
  readonly uncertaintyThreshold: number;
  readonly estimateEpisodes: number;
  readonly validationEpisodes: number;
  readonly validationStatus: LateralV2KeyEstimate['validation']['status'];
  readonly validationValue: number | null;
  readonly validationError: number | null;
  readonly validationTolerance: number;
  readonly reason: string | null;
}
export interface LateralLearningUnobserved {
  readonly key: LateralV2EstimatorKey;
  readonly scenario: LateralV2KeyEstimate['scenario'];
  readonly demonstration: string;
  readonly status: LateralV2KeyEstimate['status'];
  readonly value: number | null;
  readonly uncertainty: number | null;
  readonly reason: string | null;
  readonly excluded: Readonly<Record<string, number>>;
  readonly validationStatus: LateralV2KeyEstimate['validation']['status'];
}
export interface LateralLearningCompatibility {
  readonly policyVersion: '179-lateral-policy-v2';
  readonly candidateOnly: boolean;
  readonly changesPolicySemantics: boolean;
  readonly tickHz: number;
  readonly maximumSteeringRateRadPerS: number;
  readonly corridorM: number;
  readonly laneOffsetTargetM: number;
  readonly responseTicks: number;
  readonly rateStepRad: number;
  readonly rateRadPerS: number;
  readonly turnSpeedLimitMps: number | null;
  readonly adherenceCeilingMps: number | null;
  readonly exitAccelerationMps2: number;
  readonly exitCapMps2: number;
  readonly cornerCutM: number;
  readonly clearanceM: number;
  readonly clearanceFloorM: number;
  readonly permittedManoeuvre: boolean;
  readonly deadbandLowErrorActive: boolean;
  readonly deadbandHighErrorActive: boolean;
  readonly deadbandError: number;
  readonly corridorSaturatedTargetM: number;
  readonly corridorSaturatedKeyM: number;
  readonly rateCeilingStepRad: number;
  readonly rateCeilingKey: number;
}
export interface LateralLearningReport {
  readonly version: '180-lateral-estimator-v2';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly rows: readonly LateralLearningRow[];
  readonly unobserved: readonly LateralLearningUnobserved[];
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
  readonly compatibility: LateralLearningCompatibility;
  readonly determinism: {
    readonly seed: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly LateralLearningCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
    readonly candidateKeys: number;
    readonly unobservedKeys: number;
  };
}

const seed = 180;
/**
 * Scattered demonstration values, one per episode and all distinct: whatever pair the deterministic
 * split keeps for the estimate, the measured dispersion exceeds the per-key threshold.
 */
const noisyValues: Readonly<Record<LateralV2EstimatorKey, readonly number[]>> = Object.freeze({
  lane_center_offset: [0, 0.3, 0.6, 0.85],
  steering_response_time: [0.1, 0.5, 0.9, 1.3],
  steering_rate_limit: [0.1, 0.55, 1, 1.45],
  turn_entry_speed: [1.5, 3.2, 4.6, 6],
  turn_exit_acceleration: [0.25, 0.65, 1.05, 1.45],
  corner_cutting_bias: [0, 0.3, 0.6, 0.9],
  lateral_clearance: [2.05, 2.35, 2.65, 2.95],
  lateral_correction_deadband: [0.1, 0.1, 0.1, 0.1],
});

const scenarios = {
  positive: positiveEpisodes(),
  offsetOnly: keyEpisodes('lane_center_offset'),
  responseOnly: keyEpisodes('steering_response_time'),
  rateOnly: keyEpisodes('steering_rate_limit'),
  entryOnly: keyEpisodes('turn_entry_speed'),
  exitOnly: keyEpisodes('turn_exit_acceleration'),
  cutOnly: keyEpisodes('corner_cutting_bias'),
  clearanceOnly: keyEpisodes('lateral_clearance'),
  deadbandOnly: deadbandEpisodes(),
  rateCeiling: keyEpisodes('steering_rate_limit', [4, 4, 4, 4]),
  clearanceFloor: keyEpisodes('lateral_clearance', [0.5, 0.5, 0.8, 1.2]),
  clearanceCompact: compactClearanceEpisodes(),
  entryCeiling: keyEpisodes('turn_entry_speed', [18, 18, 18, 18]),
  exitCap: keyEpisodes('turn_exit_acceleration', [6, 6, 6, 6]),
  offsetCorridor: keyEpisodes('lane_center_offset', [1, 1, 1, 1]),
  zeroOffset: keyEpisodes('lane_center_offset', [0, 0, 0, 0]),
  zeroCut: keyEpisodes('corner_cutting_bias', [0, 0, 0, 0]),
  responseCensored: censoredResponseEpisodes(),
  responseMissingLatch: missingLatchEpisodes(),
  exitTruncated: truncatedExitEpisodes(),
  deadbandLower: lowerOnlyDeadbandEpisodes(),
  deadbandUpper: upperOnlyDeadbandEpisodes(),
  deadbandContradictory: contradictoryDeadbandEpisodes(),
  deadbandWide: wideDeadbandEpisodes(),
  manual: manualEpisodes(),
  unusablePrefix: unusablePrefixEpisodes(),
  tiny: keyEpisodes('lane_center_offset').slice(0, 3),
  empty: [],
} as const satisfies Readonly<Record<string, readonly unknown[]>>;

function runSet(name: keyof typeof scenarios): LateralV2EstimatorResult {
  return estimateLateralV2Style({ episodes: scenarios[name], splitSeed: seed });
}
function digest(result: LateralV2EstimatorResult): string {
  const text = JSON.stringify(result);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): LateralLearningCheck {
  return Object.freeze({ id, pass, detail });
}
function row(entry: LateralV2KeyEstimate): LateralLearningRow {
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
  key: LateralV2EstimatorKey,
  demonstration: string,
  result: LateralV2EstimatorResult,
): LateralLearningUnobserved {
  const entry = result.keys[key];
  return {
    key,
    scenario: entry.scenario,
    demonstration,
    status: entry.status,
    value: entry.value,
    uncertainty: entry.uncertainty,
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
/**
 * A scenario isolates a key when it observes that key and leaves every fact the scene cannot
 * produce unobserved: a straight tick has no turn, no exit and no declared obstacle, so those keys
 * must stay `UNOBSERVED` there.
 */
function isolates(
  result: LateralV2EstimatorResult,
  key: LateralV2EstimatorKey,
  absent: readonly LateralV2EstimatorKey[],
): boolean {
  return (
    result.keys[key].status === 'CANDIDATE' &&
    absent.every((entry) => result.keys[entry].status === 'UNOBSERVED')
  );
}
function absentText(
  result: LateralV2EstimatorResult,
  keys: readonly LateralV2EstimatorKey[],
): string {
  return keys.map((key) => `${key}=${result.keys[key].status}`).join(', ');
}

export function runLateralV2EstimatorReport(): LateralLearningReport {
  const positive = runSet('positive'),
    offsetOnly = runSet('offsetOnly'),
    responseOnly = runSet('responseOnly'),
    rateOnly = runSet('rateOnly'),
    entryOnly = runSet('entryOnly'),
    exitOnly = runSet('exitOnly'),
    cutOnly = runSet('cutOnly'),
    clearanceOnly = runSet('clearanceOnly'),
    deadbandOnly = runSet('deadbandOnly'),
    rateCeiling = runSet('rateCeiling'),
    clearanceFloor = runSet('clearanceFloor'),
    clearanceCompact = runSet('clearanceCompact'),
    entryCeiling = runSet('entryCeiling'),
    exitCap = runSet('exitCap'),
    offsetCorridor = runSet('offsetCorridor'),
    zeroOffset = runSet('zeroOffset'),
    zeroCut = runSet('zeroCut'),
    responseCensored = runSet('responseCensored'),
    responseMissingLatch = runSet('responseMissingLatch'),
    exitTruncated = runSet('exitTruncated'),
    deadbandLower = runSet('deadbandLower'),
    deadbandUpper = runSet('deadbandUpper'),
    deadbandContradictory = runSet('deadbandContradictory'),
    deadbandWide = runSet('deadbandWide'),
    manualSet = runSet('manual'),
    unusablePrefix = runSet('unusablePrefix'),
    tinySet = runSet('tiny'),
    empty = runSet('empty'),
    duplicates = estimateLateralV2Style({
      splitSeed: seed,
      episodes: [...manualEpisodes(), positiveEpisodes()[0]!, positiveEpisodes()[0]!],
    }),
    noiseSets = Object.fromEntries(
      LATERAL_V2_ESTIMATOR_KEYS.map((key) => [
        key,
        estimateLateralV2Style({
          splitSeed: seed,
          episodes:
            key === 'lateral_correction_deadband'
              ? wideDeadbandEpisodes()
              : keyEpisodes(key, noisyValues[key], { idPrefix: `noisy-${key}` }),
        }),
      ]),
    ) as Record<LateralV2EstimatorKey, LateralV2EstimatorResult>,
    parameters = LATERAL_V2_ESTIMATOR_KEYS.map((key) => {
      const definition = getParameterDefinition(key);
      return {
        key,
        unit: definition.unit,
        minimum: definition.min,
        maximum: definition.max,
        defaultValue: definition.default,
      };
    }),
    rows = LATERAL_V2_ESTIMATOR_KEYS.map((key) => row(positive.keys[key])),
    unobservedRows = [
      unobservedRow(
        'lane_center_offset',
        'deplasări de +1 m pe o bandă de 4 m: coridorul de 0,9 m le plafonează',
        offsetCorridor,
      ),
      unobservedRow(
        'steering_response_time',
        'fereastră tăiată înainte de reacție: timpul mort este cenzat',
        responseCensored,
      ),
      unobservedRow(
        'steering_response_time',
        'fereastră care începe după recunoașterea țintei: latch-ul lipsește',
        responseMissingLatch,
      ),
      unobservedRow(
        'steering_rate_limit',
        'cheie de 4 rad/s: pasul este plafonat la 1,5 rad/s',
        rateCeiling,
      ),
      unobservedRow(
        'turn_entry_speed',
        'cheie de 18 m/s: intrarea este plafonată de aderență la 6,269 m/s',
        entryCeiling,
      ),
      unobservedRow(
        'turn_exit_acceleration',
        'cheie de 6 m/s²: ieșirea este plafonată de cheia M la 1,5 m/s²',
        exitCap,
      ),
      unobservedRow(
        'turn_exit_acceleration',
        'fereastră care nu conține tick-ul de după viraj',
        exitTruncated,
      ),
      unobservedRow(
        'lateral_clearance',
        'chei de 0,5–1,2 m: podeaua de 2,0 m a sedanului le ascunde',
        clearanceFloor,
      ),
      unobservedRow(
        'lateral_correction_deadband',
        'corecție care nu se activează niciodată: doar limita inferioară',
        deadbandLower,
      ),
      unobservedRow(
        'lateral_correction_deadband',
        'corecție care se activează mereu: doar limita superioară',
        deadbandUpper,
      ),
      unobservedRow(
        'lateral_correction_deadband',
        'inactivă la eroarea de 0,2 m și activă la 0,02 m: limite incompatibile',
        deadbandContradictory,
      ),
      unobservedRow(
        'lateral_correction_deadband',
        'interval real, dar prea larg (0–0,55 m) pentru un prag de 0,12 m',
        deadbandWide,
      ),
      unobservedRow('lane_center_offset', 'demonstrații MANUAL, neeligibile', manualSet),
      unobservedRow('lane_center_offset', 'demonstrații fără prefix utilizabil', unusablePrefix),
      unobservedRow('lane_center_offset', 'set fără episoade', empty),
    ],
    values = Object.fromEntries(
      LATERAL_V2_ESTIMATOR_KEYS.map((key) => [key, positive.keys[key].value!]),
    ) as Record<LateralV2EstimatorKey, number>,
    offsetCommand = evaluate(straightScene, { rValues: values }).command,
    responseMovement = firstMovement(straightScene, { rValues: values }),
    movement = firstMovement(turnScene, { rValues: values }),
    entryCommand = evaluate(turnScene, { rValues: values }).command,
    exitCommand = evaluate(straightScene, {
      rValues: values,
      state: turnState(turnScene),
    }).command,
    cutCommand = evaluate(turnScene, { rValues: values }).command,
    clearanceCommand = evaluate(obstacleScene(values.lateral_clearance), {
      rValues: values,
    }).command,
    floorCommand = evaluate(straightScene, {
      rValues: { ...values, lateral_clearance: 0.5 },
    }).command,
    deadbandLow = evaluate(straightDeviationScene(0.4 + values.lateral_correction_deadband), {
      rValues: values,
    }).command,
    deadbandHigh = evaluate(
      straightDeviationScene(0.4 + values.lateral_correction_deadband + 0.001),
      { rValues: values },
    ).command,
    saturatedOffset = evaluate(straightScene, {
      rValues: { ...values, lane_center_offset: 1 },
    }).command,
    ceilingMovement = firstMovement(turnScene, {
      rValues: { ...values, steering_rate_limit: 4 },
    }),
    fullRun = run(turnScene, { rValues: values, ticks: 30 }),
    rejectedInvalid = (() => {
      const episode = positiveEpisodes()[0]!;
      try {
        estimateLateralV2Style({
          splitSeed: seed,
          episodes: [
            {
              ...episode,
              samples: [
                { ...episode.samples[0]!, laneOffsetTargetM: Number.NaN },
                ...episode.samples.slice(1),
              ],
            },
          ],
        });
        return false;
      } catch (error) {
        return error instanceof Error && /lateral evidence/i.test(error.message);
      }
    })(),
    checks: LateralLearningCheck[] = [
      check(
        'contexts-eight-distinct',
        LATERAL_V2_ESTIMATOR_KEYS.length === 8 &&
          new Set(LATERAL_V2_ESTIMATOR_KEYS.map((key) => positive.keys[key].scenario)).size === 8 &&
          Object.values(positive.keys).every((entry) => entry.eligibleContext.length > 80),
        `opt chei și opt scenarii distincte: ${LATERAL_V2_ESTIMATOR_KEYS.map(
          (key) => `${key}=${positive.keys[key].scenario}`,
        ).join(', ')}`,
      ),
      check(
        'scenario-offset',
        isolates(offsetOnly, 'lane_center_offset', [
          'turn_entry_speed',
          'corner_cutting_bias',
          'turn_exit_acceleration',
          'lateral_clearance',
        ]) &&
          near(
            offsetOnly.keys.lane_center_offset.value,
            demonstrationKeys.lane_center_offset,
            1e-9,
          ),
        `bandă dreaptă: offset ${number(offsetOnly.keys.lane_center_offset.value)} m; ${absentText(
          offsetOnly,
          [
            'turn_entry_speed',
            'corner_cutting_bias',
            'turn_exit_acceleration',
            'lateral_clearance',
          ],
        )}`,
      ),
      check(
        'scenario-response',
        isolates(responseOnly, 'steering_response_time', [
          'turn_entry_speed',
          'corner_cutting_bias',
          'turn_exit_acceleration',
          'lateral_clearance',
        ]) &&
          near(responseOnly.keys.steering_response_time.value, (21 - 0.5) / 60, 1e-9) &&
          responseOnly.keys.steering_response_time.uncertainty !== null &&
          responseOnly.keys.steering_response_time.uncertainty! <= 0.02 + 1e-9,
        `țintă de cross-track pe drum drept: ${number(
          responseOnly.keys.steering_response_time.value,
        )} s = 20,5/60; ${absentText(responseOnly, [
          'turn_entry_speed',
          'corner_cutting_bias',
          'turn_exit_acceleration',
          'lateral_clearance',
        ])}`,
      ),
      check(
        'scenario-rate',
        isolates(rateOnly, 'steering_rate_limit', [
          'turn_exit_acceleration',
          'lateral_clearance',
        ]) &&
          near(
            rateOnly.keys.steering_rate_limit.value,
            demonstrationKeys.steering_rate_limit,
            1e-9,
          ),
        `pas saturat în viraj: ${number(rateOnly.keys.steering_rate_limit.value)} rad/s; ${absentText(
          rateOnly,
          ['turn_exit_acceleration', 'lateral_clearance'],
        )}`,
      ),
      check(
        'scenario-entry',
        isolates(entryOnly, 'turn_entry_speed', [
          'turn_exit_acceleration',
          'lateral_clearance',
          'steering_response_time',
        ]) && near(entryOnly.keys.turn_entry_speed.value, demonstrationKeys.turn_entry_speed, 1e-9),
        `viraj de 15,7 m: intrare ${number(
          entryOnly.keys.turn_entry_speed.value,
        )} m/s; ${absentText(entryOnly, [
          'turn_exit_acceleration',
          'lateral_clearance',
          'steering_response_time',
        ])}`,
      ),
      check(
        'scenario-exit',
        isolates(exitOnly, 'turn_exit_acceleration', [
          'lateral_clearance',
          'steering_response_time',
        ]) &&
          near(
            exitOnly.keys.turn_exit_acceleration.value,
            demonstrationKeys.turn_exit_acceleration,
            1e-9,
          ),
        `tick-ul de după viraj: ieșire ${number(
          exitOnly.keys.turn_exit_acceleration.value,
        )} m/s²; ${absentText(exitOnly, ['lateral_clearance', 'steering_response_time'])}`,
      ),
      check(
        'scenario-cut',
        isolates(cutOnly, 'corner_cutting_bias', [
          'turn_exit_acceleration',
          'lateral_clearance',
          'steering_response_time',
        ]) &&
          near(cutOnly.keys.corner_cutting_bias.value, demonstrationKeys.corner_cutting_bias, 1e-9),
        `tăiere în viraj: ${number(cutOnly.keys.corner_cutting_bias.value)}; ${absentText(cutOnly, [
          'turn_exit_acceleration',
          'lateral_clearance',
          'steering_response_time',
        ])}`,
      ),
      check(
        'scenario-clearance',
        isolates(clearanceOnly, 'lateral_clearance', [
          'turn_exit_acceleration',
          'steering_response_time',
        ]) &&
          near(
            clearanceOnly.keys.lateral_clearance.value,
            demonstrationKeys.lateral_clearance,
            1e-9,
          ),
        `obstacol declarat la 6 m: spațiu ${number(
          clearanceOnly.keys.lateral_clearance.value,
        )} m; ${absentText(clearanceOnly, ['turn_exit_acceleration', 'steering_response_time'])}`,
      ),
      check(
        'scenario-deadband',
        isolates(deadbandOnly, 'lateral_correction_deadband', [
          'turn_entry_speed',
          'corner_cutting_bias',
          'turn_exit_acceleration',
          'lateral_clearance',
        ]) &&
          near(
            deadbandOnly.keys.lateral_correction_deadband.value,
            demonstrationKeys.lateral_correction_deadband,
            1e-9,
          ),
        `inactivă la 0,09 m și activă la 0,11 m: bandă ${number(
          deadbandOnly.keys.lateral_correction_deadband.value,
        )} m; ${absentText(deadbandOnly, [
          'turn_entry_speed',
          'corner_cutting_bias',
          'turn_exit_acceleration',
          'lateral_clearance',
        ])}`,
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
              `${entry.key} ±${number(entry.uncertainty)} ≤ ${entry.uncertaintyThreshold} ${entry.unit}`,
          )
          .join(', '),
      ),
      check(
        'uncertainty-per-key-threshold',
        LATERAL_V2_ESTIMATOR_KEYS.every(
          (key) =>
            noiseSets[key].keys[key].status === 'UNOBSERVED' &&
            noiseSets[key].keys[key].reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
            noiseSets[key].keys[key].uncertainty !== null &&
            noiseSets[key].keys[key].uncertainty! > noiseSets[key].keys[key].uncertaintyThreshold,
        ),
        LATERAL_V2_ESTIMATOR_KEYS.map(
          (key) =>
            `${key} ±${number(noiseSets[key].keys[key].uncertainty)} > ${noiseSets[key].keys[key].uncertaintyThreshold}`,
        ).join(', '),
      ),
      check(
        'validation-split',
        rows.every(
          (entry) =>
            entry.validationStatus === 'VALIDATED' &&
            entry.validationEpisodes >= LATERAL_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes &&
            entry.estimateEpisodes >= LATERAL_V2_ESTIMATOR_LIMITS.minimumEstimateEpisodes,
        ),
        `seed ${seed}: fiecare cheie se validează pe episoade ținute deoparte (${rows
          .map((entry) => `${entry.key} ${entry.estimateEpisodes}+${entry.validationEpisodes}`)
          .join(', ')})`,
      ),
      check(
        'validation-too-small',
        tinySet.keys.lane_center_offset.status === 'CANDIDATE' &&
          tinySet.keys.lane_center_offset.validation.status === 'TOO_SMALL' &&
          tinySet.keys.lane_center_offset.validation.episodes === 1,
        `trei episoade lasă ${tinySet.keys.lane_center_offset.validation.episodes} episod de validare, raportat ${tinySet.keys.lane_center_offset.validation.status}`,
      ),
      check(
        'zero-offset-demostrat',
        zeroOffset.keys.lane_center_offset.status === 'CANDIDATE' &&
          zeroOffset.keys.lane_center_offset.value === 0 &&
          zeroOffset.keys.lane_center_offset.reason === null,
        'o țintă exact pe centrul benzii este un zero demonstrat, nu dovezi lipsă',
      ),
      check(
        'zero-cut-demostrat',
        zeroCut.keys.corner_cutting_bias.status === 'CANDIDATE' &&
          zeroCut.keys.corner_cutting_bias.value === 0 &&
          zeroCut.keys.corner_cutting_bias.reason === null,
        'o tăiere de 0 m într-un viraj real este un zero demonstrat, distinct de lipsa virajului',
      ),
      check(
        'rate-ceiling',
        rateCeiling.keys.steering_rate_limit.status === 'UNOBSERVED' &&
          rateCeiling.keys.steering_rate_limit.value === null &&
          rateCeiling.keys.steering_rate_limit.reason === 'STEERING_RATE_CEILING_SATURATED' &&
          near(
            ceilingMovement.stepRad * 60,
            LATERAL_V2_ESTIMATOR_LIMITS.maximumSteeringRateRadPerS,
            1e-9,
          ),
        `patru chei de 4 rad/s produc același pas de ${number(ceilingMovement.stepRad)} rad/tick, adică ${number(ceilingMovement.stepRad * 60)} rad/s: cheia rămâne neobservată`,
      ),
      check(
        'clearance-floor',
        clearanceFloor.keys.lateral_clearance.status === 'UNOBSERVED' &&
          clearanceFloor.keys.lateral_clearance.value === null &&
          clearanceFloor.keys.lateral_clearance.reason === 'LATERAL_CLEARANCE_FLOOR_SATURATED' &&
          clearanceFloor.keys.lateral_clearance.excluded.LATERAL_CLEARANCE_FLOOR_SATURATED === 4,
        `cheile de 0,5–1,2 m sunt ascunse de podeaua de ${number(floorCommand.effectiveClearanceM)} m a sedanului`,
      ),
      check(
        'clearance-floor-follows-class',
        clearanceCompact.keys.lateral_clearance.status === 'CANDIDATE' &&
          near(clearanceCompact.keys.lateral_clearance.value, 1.9, 1e-9),
        `aceeași comandă de 1,9 m este exactă pe clasa compact (podeaua 1,8 m) și plafonată pe sedan (2,0 m)`,
      ),
      check(
        'entry-adherence-ceiling',
        entryCeiling.keys.turn_entry_speed.status === 'UNOBSERVED' &&
          entryCeiling.keys.turn_entry_speed.value === null &&
          entryCeiling.keys.turn_entry_speed.reason === 'TURN_ENTRY_ADHERENCE_SATURATED' &&
          entryCeiling.keys.turn_entry_speed.excluded.TURN_ENTRY_ADHERENCE_SATURATED === 4 &&
          near(entryCommand.adherenceCeilingMps, 6.268769, 1e-5),
        `cheia de 18 m/s este plafonată de aderență la ${number(entryCommand.adherenceCeilingMps)} m/s: intrarea peste plafon nu este observabilă`,
      ),
      check(
        'exit-m-cap',
        exitCap.keys.turn_exit_acceleration.status === 'UNOBSERVED' &&
          exitCap.keys.turn_exit_acceleration.value === null &&
          exitCap.keys.turn_exit_acceleration.reason === 'TURN_EXIT_ACCELERATION_SATURATED' &&
          near(exitCommand.exitAccelerationMps2, 0.9, 1e-9),
        'cheia de 6 m/s² este plafonată de cheia M `desired_acceleration` la 1,5 m/s²: valoarea de ieșire rămâne doar o margine',
      ),
      check(
        'offset-corridor',
        offsetCorridor.keys.lane_center_offset.status === 'UNOBSERVED' &&
          offsetCorridor.keys.lane_center_offset.value === null &&
          offsetCorridor.keys.lane_center_offset.reason === 'OFFSET_CORRIDOR_SATURATED' &&
          near(saturatedOffset.laneOffsetTargetM, saturatedOffset.laneCorridorM, 1e-9) &&
          near(saturatedOffset.laneCorridorM, 0.9, 1e-9),
        `cheile de +1 m sunt plafonate la coridorul de ${number(saturatedOffset.laneCorridorM)} m: ținta dovedește doar |cheie| ≥ coridor`,
      ),
      check(
        'response-latch',
        responseCensored.keys.steering_response_time.reason === 'RESPONSE_CENSORED' &&
          responseMissingLatch.keys.steering_response_time.reason === 'RESPONSE_LATCH_MISSING' &&
          responseOnly.keys.steering_response_time.status === 'CANDIDATE',
        'o fereastră tăiată înainte de reacție cenzează timpul mort, iar una care începe după recunoașterea țintei nu are latch de măsurat',
      ),
      check(
        'exit-window',
        exitTruncated.keys.turn_exit_acceleration.reason === 'NO_TURN_EXIT_EPISODE' &&
          exitOnly.keys.turn_exit_acceleration.status === 'CANDIDATE',
        'ieșirea se măsoară numai pe tick-ul de tranziție; o fereastră care se oprește în viraj nu are ieșire',
      ),
      check(
        'deadband-bounds',
        deadbandLower.keys.lateral_correction_deadband.reason ===
          'DEADBAND_UPPER_BOUND_UNOBSERVED' &&
          deadbandUpper.keys.lateral_correction_deadband.reason ===
            'DEADBAND_LOWER_BOUND_UNOBSERVED' &&
          deadbandContradictory.keys.lateral_correction_deadband.reason ===
            'CONTRADICTORY_DEADBAND_BOUNDS' &&
          deadbandContradictory.keys.lateral_correction_deadband.excluded
            .CONTRADICTORY_DEADBAND_BOUNDS === 4 &&
          deadbandWide.keys.lateral_correction_deadband.reason === 'UNCERTAINTY_ABOVE_THRESHOLD',
        'o singură latură este doar o margine, două limite incompatibile nu au valoare, iar un interval prea larg rămâne neobservat',
      ),
      check(
        'no-fabricated-values',
        [...rows, ...unobservedRows].every((entry) =>
          entry.status === 'CANDIDATE' ? entry.value !== null : entry.value === null,
        ) && unobservedRows.every((entry) => entry.reason !== null),
        `${unobservedRows.length} demonstrații neobservate au valoare null și motiv explicit`,
      ),
      check(
        'group-constraints',
        positive.groupConstraints.length === 7 &&
          positive.groupConstraints.every(
            (entry) =>
              entry.explanation.length > 120 &&
              entry.keys.every((key) => LATERAL_V2_ESTIMATOR_KEYS.includes(key)),
          ),
        positive.groupConstraints.map((entry) => entry.id).join(', '),
      ),
      check(
        'invalid-input-refused',
        rejectedInvalid &&
          duplicates.refusedEpisodes.filter((entry) => entry.reason === 'NOT_LEARNING_ELIGIBLE')
            .length === 4 &&
          duplicates.refusedEpisodes.filter((entry) => entry.reason === 'DUPLICATE_EPISODE')
            .length === 1,
        `o valoare NaN este refuzată; ${duplicates.refusedEpisodes
          .map((entry) => `${entry.episodeId}:${entry.reason}`)
          .join(', ')}`,
      ),
      check(
        'determinism',
        digest(positive) === digest(runSet('positive')),
        `digest ${digest(positive)}`,
      ),
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
        near(offsetCommand.laneOffsetTargetM, values.lane_center_offset, 1e-9) &&
          responseMovement.delayTicks === 21 &&
          near(movement.stepRad, values.steering_rate_limit / 60, 1e-9) &&
          near(entryCommand.turnSpeedLimitMps, values.turn_entry_speed, 1e-9) &&
          near(exitCommand.exitAccelerationMps2, values.turn_exit_acceleration, 1e-9) &&
          near(
            Math.abs(cutCommand.cornerCutM),
            values.corner_cutting_bias * cutCommand.laneCorridorM,
            1e-9,
          ) &&
          near(clearanceCommand.effectiveClearanceM, values.lateral_clearance, 1e-9) &&
          near(floorCommand.effectiveClearanceM, 2, 1e-9) &&
          deadbandLow.correctionActive === false &&
          deadbandHigh.correctionActive === true &&
          fullRun.commands.length === 30 &&
          fullRun.commands.every(
            (command) =>
              Math.abs(command.steeringStepRad) <= values.steering_rate_limit / 60 + 1e-9,
          ),
        `179 citește estimarea fără schimbare de semantică: offset ${number(offsetCommand.laneOffsetTargetM)} m, ${responseMovement.delayTicks} tick-uri până la reacție, pas ${number(movement.stepRad)} rad/tick (${number(values.steering_rate_limit)} rad/s), intrare ${number(entryCommand.turnSpeedLimitMps)} m/s sub plafonul ${number(entryCommand.adherenceCeilingMps)} m/s, ieșire ${number(exitCommand.exitAccelerationMps2)} m/s², tăiere ${number(cutCommand.cornerCutM)} m, spațiu ${number(clearanceCommand.effectiveClearanceM)} m, bandă moartă inactivă la ${number(0.4 + values.lateral_correction_deadband)} m și activă la ${number(0.401 + values.lateral_correction_deadband)} m, ${fullRun.commands.length} tick-uri sub limita de ${number(values.steering_rate_limit / 60)} rad/tick`,
      ),
    ],
    passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '180-lateral-estimator-v2',
    parameters,
    rows,
    unobserved: unobservedRows,
    groupConstraints: positive.groupConstraints.map((entry) => ({
      id: entry.id,
      keys: entry.keys,
      explanation: entry.explanation,
    })),
    refusals: duplicates.refusedEpisodes,
    split: {
      seed,
      admitted: positive.admittedEpisodes.length,
      disjoint: new Set(positive.admittedEpisodes).size === positive.admittedEpisodes.length,
    },
    compatibility: {
      policyVersion: LATERAL_POLICY_V2_LIMITS.version,
      candidateOnly: positive.compatibility.candidateOnly,
      changesPolicySemantics: positive.compatibility.changesPolicySemantics,
      tickHz: positive.compatibility.tickHz,
      maximumSteeringRateRadPerS: positive.compatibility.maximumSteeringRateRadPerS,
      corridorM: offsetCommand.laneCorridorM,
      laneOffsetTargetM: offsetCommand.laneOffsetTargetM,
      responseTicks: responseMovement.delayTicks,
      rateStepRad: movement.stepRad,
      rateRadPerS: movement.stepRad * 60,
      turnSpeedLimitMps: entryCommand.turnSpeedLimitMps,
      adherenceCeilingMps: entryCommand.adherenceCeilingMps,
      exitAccelerationMps2: exitCommand.exitAccelerationMps2,
      exitCapMps2: 1.5,
      cornerCutM: cutCommand.cornerCutM,
      clearanceM: clearanceCommand.effectiveClearanceM,
      clearanceFloorM: floorCommand.effectiveClearanceM,
      permittedManoeuvre: clearanceCommand.manoeuvrePermitted,
      deadbandLowErrorActive: deadbandLow.correctionActive,
      deadbandHighErrorActive: deadbandHigh.correctionActive,
      deadbandError: values.lateral_correction_deadband,
      corridorSaturatedTargetM: saturatedOffset.laneOffsetTargetM,
      corridorSaturatedKeyM: 1,
      rateCeilingStepRad: ceilingMovement.stepRad,
      rateCeilingKey: 4,
    },
    determinism: {
      seed,
      digest: digest(positive),
      repeatedDigest: digest(runSet('positive')),
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

export function lateralV2EstimatorReportMarkdown(report: LateralLearningReport): string {
  const row = (entry: LateralLearningRow) =>
      `| \`${entry.key}\` | \`${entry.scenario}\` | ${entry.context} | ${number(entry.value)} ${entry.unit} | ±${number(entry.uncertainty)} ${entry.unit} | ${entry.uncertaintyThreshold} ${entry.unit} | ${entry.validationStatus}, ${entry.validationEpisodes} episoade, valoare ${number(entry.validationValue)}, eroare ${number(entry.validationError)} ≤ ${entry.validationTolerance} |`,
    unobserved = (entry: LateralLearningUnobserved) =>
      `| \`${entry.key}\` | \`${entry.scenario}\` | ${entry.demonstration} | ${entry.status} | ${entry.reason ?? '—'} | ${
        Object.entries(entry.excluded)
          .map(([reason, count]) => `${reason}×${count}`)
          .join(', ') || '—'
      } |`;
  return [
    '# 180 — învățare extinsă pentru control lateral și viraje',
    '',
    'Generat de `scripts/run-v2-lateral-learning-report.mjs` din contractul `180-lateral-estimator-v2`.',
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
    '## Compatibilitate cu 179',
    '',
    `- Coridorul 049 al benzii de 4 m: **${number(report.compatibility.corridorM)} m**; deplasarea estimată ${number(report.compatibility.laneOffsetTargetM)} m este chiar ținta raportată, iar cheia de ${report.compatibility.corridorSaturatedKeyM} m este plafonată la ${number(report.compatibility.corridorSaturatedTargetM)} m.`,
    `- Timpul mort: **${report.compatibility.responseTicks} tick-uri** până la prima reacție, adică \`ceil(cheie · 60)\` pentru cheia estimată.`,
    `- Rata: pasul aplicat este **${number(report.compatibility.rateStepRad)} rad/tick** = ${number(report.compatibility.rateRadPerS)} rad/s; cheia de ${report.compatibility.rateCeilingKey} rad/s produce ${number(report.compatibility.rateCeilingStepRad)} rad/tick, adică plafonul de ${report.compatibility.maximumSteeringRateRadPerS} rad/s.`,
    `- Intrarea în viraj: **${number(report.compatibility.turnSpeedLimitMps)} m/s** sub plafonul de aderență ${number(report.compatibility.adherenceCeilingMps)} m/s.`,
    `- Ieșirea din viraj: **${number(report.compatibility.exitAccelerationMps2)} m/s²**, sub plafonul M \`desired_acceleration\` de ${number(report.compatibility.exitCapMps2)} m/s².`,
    `- Tăierea virajului: **${number(report.compatibility.cornerCutM)} m** = cheie · coridor.`,
    `- Spațiul lateral: **${number(report.compatibility.clearanceM)} m** peste podeaua de ${number(report.compatibility.clearanceFloorM)} m; manevra permisă ${report.compatibility.permittedManoeuvre}.`,
    `- Banda moartă: inactivă la eroarea de ${number(report.compatibility.deadbandError)} m (${report.compatibility.deadbandLowErrorActive}) și activă imediat peste ea (${report.compatibility.deadbandHighErrorActive}).`,
    `- Versiune politică: \`${report.compatibility.policyVersion}\`, candidat-only ${report.compatibility.candidateOnly}, semantică schimbată ${report.compatibility.changesPolicySemantics}, rată de tick ${report.compatibility.tickHz} Hz.`,
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

export type { LateralV2EstimatorKey };
