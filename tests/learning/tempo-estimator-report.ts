import { compileSpeedPolicyProfile } from '../../src/autonomy/speed-policy';
import {
  TEMPO_ESTIMATOR_KEYS,
  TEMPO_ESTIMATOR_LIMITS,
  estimateSpeedPolicyTempo,
} from '../../src/learning/tempo-estimator';
import type {
  TempoEstimatorKey,
  TempoEstimatorResult,
  TempoKeyEstimate,
} from '../../src/learning/tempo-estimator';
import { getParameterDefinition } from '../../src/profiles';
import { evaluate, speedProfileDocument } from '../autonomy/speed-policy-reference';
import {
  arterialEpisodes,
  contradictoryDeadbandEpisodes,
  coveringDeadbandEpisodes,
  deadbandEpisodes,
  overtakeEpisodes,
  positiveEpisodes,
  shortCruiseEpisodes,
  tempoEpisode,
  tempoSample,
  trafficDominatedArterialEpisodes,
  trafficDominatedOvertakeEpisodes,
  variabilityEpisodes,
} from './tempo-estimator-reference';

export interface TempoReportCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface TempoReportRow {
  readonly key: TempoEstimatorKey;
  readonly unit: string;
  readonly context: string;
  readonly status: TempoKeyEstimate['status'];
  readonly value: number | null;
  readonly uncertaintyMps: number | null;
  readonly uncertaintyThresholdMps: number;
  readonly estimateEpisodes: number;
  readonly validationEpisodes: number;
  readonly validationStatus: TempoKeyEstimate['validation']['status'];
  readonly validationValue: number | null;
  readonly validationErrorMps: number | null;
  readonly validationToleranceMps: number;
  readonly reason: string | null;
}
export interface TempoReportUnobserved {
  readonly key: TempoEstimatorKey;
  readonly scenario: string;
  readonly status: TempoKeyEstimate['status'];
  readonly value: number | null;
  readonly reason: string | null;
  readonly excluded: Readonly<Record<string, number>>;
  readonly validationStatus: TempoKeyEstimate['validation']['status'];
}
export interface TempoReport {
  readonly version: '168-tempo-estimator-v1';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly rows: readonly TempoReportRow[];
  readonly unobserved: readonly TempoReportUnobserved[];
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
  readonly determinism: {
    readonly seed: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly TempoReportCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
    readonly candidateKeys: number;
    readonly unobservedKeys: number;
  };
}

const seed = 168;
const scenarios = {
  positive: { episodes: positiveEpisodes() },
  arterialOnly: { episodes: arterialEpisodes() },
  cruiseOnly: { episodes: variabilityEpisodes() },
  overtakeOnly: { episodes: overtakeEpisodes() },
  deadbandOnly: { episodes: deadbandEpisodes() },
  noisyArterial: { episodes: arterialEpisodes([1, 3, 7, 9]) },
  tinyArterial: { episodes: arterialEpisodes([3.9, 4.1, 4]) },
  arterialTraffic: { episodes: trafficDominatedArterialEpisodes() },
  overtakeTraffic: { episodes: trafficDominatedOvertakeEpisodes() },
  shortCruise: { episodes: shortCruiseEpisodes() },
  coveringDeadband: { episodes: coveringDeadbandEpisodes() },
  contradictoryDeadband: { episodes: contradictoryDeadbandEpisodes() },
} as const;

function run(key: keyof typeof scenarios): TempoEstimatorResult {
  return estimateSpeedPolicyTempo({ episodes: scenarios[key].episodes, splitSeed: seed });
}
function digest(result: TempoEstimatorResult): string {
  const text = JSON.stringify(result);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): TempoReportCheck {
  return Object.freeze({ id, pass, detail });
}
function row(key: TempoEstimatorKey, entry: TempoKeyEstimate): TempoReportRow {
  return {
    key,
    unit: entry.unit,
    context: entry.eligibleContext,
    status: entry.status,
    value: entry.value,
    uncertaintyMps: entry.uncertaintyMps,
    uncertaintyThresholdMps: entry.uncertaintyThresholdMps,
    estimateEpisodes: entry.sourceEpisodes,
    validationEpisodes: entry.validation.episodes,
    validationStatus: entry.validation.status,
    validationValue: entry.validation.value,
    validationErrorMps: entry.validation.errorMps,
    validationToleranceMps: entry.validation.toleranceMps,
    reason: entry.reason,
  };
}
function unobserved(
  key: TempoEstimatorKey,
  scenario: string,
  result: TempoEstimatorResult,
): TempoReportUnobserved {
  const entry = result.keys[key];
  return {
    key,
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

export function runTempoEstimatorReport(): TempoReport {
  const positive = run('positive'),
    arterialOnly = run('arterialOnly'),
    cruiseOnly = run('cruiseOnly'),
    overtakeOnly = run('overtakeOnly'),
    deadbandOnly = run('deadbandOnly'),
    noisy = run('noisyArterial'),
    tiny = run('tinyArterial'),
    arterialTraffic = run('arterialTraffic'),
    overtakeTraffic = run('overtakeTraffic'),
    shortCruise = run('shortCruise'),
    covering = run('coveringDeadband'),
    contradiction = run('contradictoryDeadband'),
    duplicateRun = run('positive'),
    parameters = TEMPO_ESTIMATOR_KEYS.map((key) => {
      const definition = getParameterDefinition(key);
      return {
        key,
        unit: definition.unit,
        minimum: definition.min,
        maximum: definition.max,
        defaultValue: definition.default,
      };
    }),
    rows = TEMPO_ESTIMATOR_KEYS.map((key) => row(key, positive.keys[key])),
    unobservedRows = [
      unobserved('speed_delta_arterial', 'arterial samples capped by a slow lead', arterialTraffic),
      unobserved(
        'cruise_speed_variability',
        'cruise stretches shorter than 600 ticks',
        shortCruise,
      ),
      unobserved('overtake_speed_bonus', 'overtakes at the 167 traffic envelope', overtakeTraffic),
      unobserved('cruise_accel_deadband', 'every step stays inside the band', covering),
      unobserved('cruise_accel_deadband', 'held and moved steps contradict', contradiction),
    ],
    refused = estimateSpeedPolicyTempo({
      splitSeed: seed,
      episodes: [
        tempoEpisode('manual-demo', [tempoSample(0, 12)], {
          eligibilityOverrides: { controlMode: 'MANUAL', learningEligible: false },
        }),
        tempoEpisode('duplicate-demo', [tempoSample(0, 12)]),
        tempoEpisode('duplicate-demo', [tempoSample(1, 12)]),
      ],
    }),
    values = Object.fromEntries(
      TEMPO_ESTIMATOR_KEYS.map((key) => [key, positive.keys[key].value!]),
    ),
    profile = compileSpeedPolicyProfile(speedProfileDocument(undefined, values)),
    command = evaluate(profile, { target: null, observation: { roadKind: 'ARTERIAL' } }),
    arterialDelta = positive.keys.speed_delta_arterial.value!,
    variability = positive.keys.cruise_speed_variability.value!,
    deadband = positive.keys.cruise_accel_deadband.value!,
    rejectedInvalid = (() => {
      try {
        estimateSpeedPolicyTempo({
          splitSeed: seed,
          episodes: [tempoEpisode('nan-speed', [tempoSample(0, Number.NaN)])],
        });
        return false;
      } catch (error) {
        return error instanceof Error && /tempo evidence/i.test(error.message);
      }
    })(),
    checks: TempoReportCheck[] = [
      check(
        'context-arterial',
        arterialOnly.keys.speed_delta_arterial.status === 'CANDIDATE' &&
          near(arterialOnly.keys.speed_delta_arterial.value, 4, 0.2) &&
          arterialOnly.keys.cruise_speed_variability.status === 'UNOBSERVED' &&
          arterialOnly.keys.overtake_speed_bonus.status === 'UNOBSERVED' &&
          arterialOnly.keys.cruise_accel_deadband.reason === 'NO_TARGET_STEPS',
        `arterial-only estimate ${arterialOnly.keys.speed_delta_arterial.value?.toFixed(3) ?? 'null'} m/s; cruise, overtake and deadband stay unobserved`,
      ),
      check(
        'context-cruise',
        cruiseOnly.keys.cruise_speed_variability.status === 'CANDIDATE' &&
          near(cruiseOnly.keys.cruise_speed_variability.value, 1.2, 0.05) &&
          cruiseOnly.keys.cruise_accel_deadband.status === 'UNOBSERVED' &&
          cruiseOnly.keys.cruise_accel_deadband.reason === 'NO_TARGET_STEPS',
        `cruise-only variability ${cruiseOnly.keys.cruise_speed_variability.value?.toFixed(3) ?? 'null'} m/s; deadband is not inferred from the same dispersion`,
      ),
      check(
        'context-overtake',
        overtakeOnly.keys.overtake_speed_bonus.status === 'CANDIDATE' &&
          near(overtakeOnly.keys.overtake_speed_bonus.value, 2, 0.001) &&
          overtakeOnly.keys.cruise_speed_variability.status === 'UNOBSERVED',
        `overtake-only bonus ${overtakeOnly.keys.overtake_speed_bonus.value?.toFixed(3) ?? 'null'} m/s`,
      ),
      check(
        'context-deadband',
        deadbandOnly.keys.cruise_accel_deadband.status === 'CANDIDATE' &&
          near(deadbandOnly.keys.cruise_accel_deadband.value, 0.325, 1e-9) &&
          near(deadbandOnly.keys.cruise_accel_deadband.uncertaintyMps, 0.075, 1e-9) &&
          deadbandOnly.keys.speed_delta_arterial.status === 'UNOBSERVED',
        `deadband ${deadbandOnly.keys.cruise_accel_deadband.value?.toFixed(3) ?? 'null'} ± ${deadbandOnly.keys.cruise_accel_deadband.uncertaintyMps?.toFixed(3) ?? 'null'} m/s from held and moved steps only`,
      ),
      check(
        'uncertainty-reported',
        rows.every(
          (entry) =>
            entry.uncertaintyMps !== null &&
            entry.uncertaintyMps > 0 &&
            entry.uncertaintyMps <= entry.uncertaintyThresholdMps,
        ),
        rows
          .map(
            (entry) =>
              `${entry.key} ${entry.uncertaintyMps?.toFixed(3)} <= ${entry.uncertaintyThresholdMps}`,
          )
          .join(', '),
      ),
      check(
        'uncertainty-threshold',
        noisy.keys.speed_delta_arterial.status === 'UNOBSERVED' &&
          noisy.keys.speed_delta_arterial.reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
          noisy.keys.speed_delta_arterial.value === null &&
          noisy.keys.speed_delta_arterial.uncertaintyMps !== null &&
          noisy.keys.speed_delta_arterial.uncertaintyMps >
            noisy.keys.speed_delta_arterial.uncertaintyThresholdMps,
        `noisy arterial uncertainty ${noisy.keys.speed_delta_arterial.uncertaintyMps?.toFixed(3) ?? 'null'} > ${noisy.keys.speed_delta_arterial.uncertaintyThresholdMps} m/s keeps the key unobserved`,
      ),
      check(
        'validation-split',
        rows
          .filter((entry) => entry.key !== 'cruise_accel_deadband')
          .every(
            (entry) =>
              entry.validationStatus === 'VALIDATED' &&
              entry.validationEpisodes >= TEMPO_ESTIMATOR_LIMITS.minimumValidationEpisodes &&
              entry.estimateEpisodes >= TEMPO_ESTIMATOR_LIMITS.minimumEstimateEpisodes,
          ) &&
          positive.keys.cruise_accel_deadband.validation.status === 'VALIDATED' &&
          positive.keys.cruise_accel_deadband.validation.episodes === 2,
        `seed ${seed}: continuous keys validate on held-out episodes; deadband validates on ${positive.keys.cruise_accel_deadband.validation.episodes} held-out episodes`,
      ),
      check(
        'validation-too-small',
        tiny.keys.speed_delta_arterial.status === 'CANDIDATE' &&
          tiny.keys.speed_delta_arterial.validation.status === 'TOO_SMALL',
        `three arterial episodes leave ${tiny.keys.speed_delta_arterial.validation.episodes} held-out episode(s), reported as ${tiny.keys.speed_delta_arterial.validation.status}`,
      ),
      check(
        'unobserved-arterial-traffic',
        arterialTraffic.keys.speed_delta_arterial.status === 'UNOBSERVED' &&
          arterialTraffic.keys.speed_delta_arterial.reason === 'TRAFFIC_DOMINATED' &&
          arterialTraffic.keys.speed_delta_arterial.value === null &&
          arterialTraffic.keys.speed_delta_arterial.excluded.TRAFFIC_CONSTRAINED === 3,
        `3 arterial episodes excluded at the 167 traffic envelope`,
      ),
      check(
        'unobserved-overtake-traffic',
        overtakeTraffic.keys.overtake_speed_bonus.status === 'UNOBSERVED' &&
          overtakeTraffic.keys.overtake_speed_bonus.reason === 'TRAFFIC_DOMINATED' &&
          overtakeTraffic.keys.overtake_speed_bonus.excluded.TRAFFIC_DOMINATED === 2,
        '2 overtakes at the traffic envelope cannot prove a style bonus',
      ),
      check(
        'unobserved-short-cruise',
        shortCruise.keys.cruise_speed_variability.status === 'UNOBSERVED' &&
          shortCruise.keys.cruise_speed_variability.excluded.SHORT_CRUISE_CYCLE === 3,
        '3 cruise stretches shorter than one full 600-tick cycle are excluded',
      ),
      check(
        'unobserved-covering-deadband',
        covering.keys.cruise_accel_deadband.status === 'UNOBSERVED' &&
          covering.keys.cruise_accel_deadband.reason === 'DEADBAND_UPPER_BOUND_UNOBSERVED',
        'a band that holds every observed step has no upper bound',
      ),
      check(
        'unobserved-contradictory-deadband',
        contradiction.keys.cruise_accel_deadband.status === 'UNOBSERVED' &&
          contradiction.keys.cruise_accel_deadband.reason === 'CONTRADICTORY_STEP_BOUNDS',
        'a held 0.5 m/s step and a moved 0.3 m/s step leave no admissible interval',
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
              entry.keys.every((key) => TEMPO_ESTIMATOR_KEYS.includes(key)),
          ),
        positive.groupConstraints.map((entry) => entry.id).join(', '),
      ),
      check(
        'invalid-input-refused',
        rejectedInvalid && refused.refusedEpisodes.length === 2,
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
        rows
          .map((entry) => `${entry.key} ${entry.value?.toFixed(3) ?? 'null'} ${entry.unit}`)
          .join(', '),
      ),
      check(
        'policy-compatibility',
        command.reason === 'SPEED_POLICY' &&
          command.deadbandMps === deadband &&
          command.baseStyleMps === 13.9 + arterialDelta &&
          command.styleCeilingMps === 13.9 + arterialDelta &&
          command.committedTargetMps <= command.styleCeilingMps &&
          command.committedTargetMps >= command.styleCeilingMps - variability - deadband,
        `167 reads base ${command.baseStyleMps.toFixed(3)} m/s, ceiling ${command.styleCeilingMps.toFixed(3)} m/s, deadband ${command.deadbandMps.toFixed(3)} m/s, commit ${command.committedTargetMps.toFixed(3)} m/s`,
      ),
    ],
    passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '168-tempo-estimator-v1',
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

export function tempoEstimatorReportMarkdown(report: TempoReport): string {
  const number = (value: number | null, digits = 3) =>
      value === null ? '—' : value.toFixed(digits),
    row = (entry: TempoReportRow) =>
      `| \`${entry.key}\` | ${entry.context} | ${number(entry.value)} ${entry.unit} | ±${number(entry.uncertaintyMps)} ${entry.unit} | ${entry.uncertaintyThresholdMps} ${entry.unit} | ${entry.validationStatus}, ${entry.validationEpisodes} episoade, valoare ${number(entry.validationValue)}, eroare ${number(entry.validationErrorMps)} ≤ ${entry.validationToleranceMps} |`,
    unobservedRow = (entry: TempoReportUnobserved) =>
      `| \`${entry.key}\` | ${entry.scenario} | ${entry.status} | ${entry.reason ?? '—'} | ${
        Object.entries(entry.excluded)
          .map(([reason, count]) => `${reason}×${count}`)
          .join(', ') || '—'
      } |`;
  return [
    '# 168 — învățare pentru viteză și ritm',
    '',
    'Generat de `scripts/run-v2-speed-learning-report.mjs` din contractul `168-tempo-estimator-v1`.',
    'Fiecare cheie se estimează numai din faptul ei eligibil; o cheie fără dovezi suficiente rămâne `UNOBSERVED`, nu primește o valoare inventată.',
    '',
    '## Cheie → context → estimare → incertitudine → validare independentă',
    '',
    '| Cheie | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    ...report.rows.map(row),
    '',
    `Split explicit cu seed ${report.split.seed}: ${report.split.admitted} episoade admise, fără suprapunere între estimare și validare.`,
    '',
    '## Cazuri fără dovezi identificabile',
    '',
    '| Cheie | Scenariu | Stare | Motiv | Excluderi |',
    '| --- | --- | --- | --- | --- |',
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

export type { TempoEstimatorKey };
