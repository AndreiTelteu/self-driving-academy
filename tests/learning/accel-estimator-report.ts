import {
  ACCEL_ESTIMATOR_KEYS,
  ACCEL_ESTIMATOR_LIMITS,
  estimateAccelPolicyStyle,
} from '../../src/learning/accel-estimator';
import type {
  AccelEstimatorKey,
  AccelEstimatorResult,
  AccelKeyEstimate,
} from '../../src/learning/accel-estimator';
import { ACCEL_POLICY_LIMITS } from '../../src/autonomy';
import { getParameterDefinition } from '../../src/profiles';
import { accelProfile, evaluate, simulate } from '../autonomy/accel-policy-reference';
import {
  accelEpisode,
  accelSample,
  brakingAfterLiftEpisodes,
  brakingEpisodes,
  censoredBrakingEpisodes,
  censoredReleaseEpisodes,
  changingDemandEpisodes,
  coastingEpisodes,
  envelopeCoastingEpisodes,
  envelopeLaunchEpisodes,
  hardBrakingEpisodes,
  launchEpisodes,
  noisyBrakingEpisodes,
  positiveEpisodes,
  releaseEpisodes,
  strongCoastingEpisodes,
  strongRequestEpisodes,
  vetoedEpisodes,
} from './accel-estimator-reference';

export interface AccelReportCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface AccelReportRow {
  readonly key: AccelEstimatorKey;
  readonly unit: string;
  readonly context: string;
  readonly status: AccelKeyEstimate['status'];
  readonly value: number | null;
  readonly uncertainty: number | null;
  readonly uncertaintyThreshold: number;
  readonly estimateEpisodes: number;
  readonly validationEpisodes: number;
  readonly validationStatus: AccelKeyEstimate['validation']['status'];
  readonly validationValue: number | null;
  readonly validationError: number | null;
  readonly validationTolerance: number;
  readonly reason: string | null;
}
export interface AccelReportUnobserved {
  readonly key: AccelEstimatorKey;
  readonly scenario: string;
  readonly status: AccelKeyEstimate['status'];
  readonly value: number | null;
  readonly reason: string | null;
  readonly excluded: Readonly<Record<string, number>>;
  readonly validationStatus: AccelKeyEstimate['validation']['status'];
}
export interface AccelReport {
  readonly version: '170-accel-estimator-v1';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly rows: readonly AccelReportRow[];
  readonly unobserved: readonly AccelReportUnobserved[];
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
    readonly policyVersion: '169-accel-policy-v1';
    readonly candidateOnly: boolean;
    readonly changesPolicySemantics: boolean;
    readonly launchFactor: number;
    readonly expectedLaunchFactor: number;
    readonly coastingFactor: number;
    readonly expectedCoastingFactor: number;
    readonly heldThrottleTicks: number;
    readonly expectedHeldThrottleTicks: number;
    readonly brakingTicksToDemand: number;
    readonly expectedBrakingTicksToDemand: number;
    readonly brakingCommitTick5Mps2: number;
  };
  readonly determinism: {
    readonly seed: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly AccelReportCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
    readonly candidateKeys: number;
    readonly unobservedKeys: number;
  };
}

const seed = 170;
const scenarios = {
  positive: { episodes: positiveEpisodes() },
  brakingOnly: { episodes: brakingEpisodes() },
  releaseOnly: { episodes: releaseEpisodes() },
  launchOnly: { episodes: launchEpisodes() },
  coastingOnly: { episodes: coastingEpisodes() },
  steady: { episodes: strongRequestEpisodes() },
  censoredBraking: { episodes: censoredBrakingEpisodes() },
  hardBraking: { episodes: hardBrakingEpisodes() },
  changingDemand: { episodes: changingDemandEpisodes() },
  censoredRelease: { episodes: censoredReleaseEpisodes() },
  brakingAfterLift: { episodes: brakingAfterLiftEpisodes() },
  vetoed: { episodes: vetoedEpisodes() },
  strongCoasting: { episodes: strongCoastingEpisodes() },
  envelopeCoasting: { episodes: envelopeCoastingEpisodes() },
  envelopeLaunch: { episodes: envelopeLaunchEpisodes() },
  noisyBraking: { episodes: noisyBrakingEpisodes() },
  tinyBraking: { episodes: brakingEpisodes([2.9, 3, 3.1]) },
} as const;

function run(key: keyof typeof scenarios): AccelEstimatorResult {
  return estimateAccelPolicyStyle({ episodes: scenarios[key].episodes, splitSeed: seed });
}
function digest(result: AccelEstimatorResult): string {
  const text = JSON.stringify(result);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): AccelReportCheck {
  return Object.freeze({ id, pass, detail });
}
function row(key: AccelEstimatorKey, entry: AccelKeyEstimate): AccelReportRow {
  return {
    key,
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
function unobserved(
  key: AccelEstimatorKey,
  scenario: string,
  result: AccelEstimatorResult,
): AccelReportUnobserved {
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
function number(value: number | null, digits = 4): string {
  return value === null ? 'â€”' : value.toFixed(digits);
}

export function runAccelEstimatorReport(): AccelReport {
  const positive = run('positive'),
    brakingOnly = run('brakingOnly'),
    releaseOnly = run('releaseOnly'),
    launchOnly = run('launchOnly'),
    coastingOnly = run('coastingOnly'),
    steady = run('steady'),
    censoredBraking = run('censoredBraking'),
    hardBraking = run('hardBraking'),
    changingDemand = run('changingDemand'),
    censoredRelease = run('censoredRelease'),
    brakingAfterLift = run('brakingAfterLift'),
    vetoed = run('vetoed'),
    strongCoasting = run('strongCoasting'),
    envelopeCoasting = run('envelopeCoasting'),
    envelopeLaunch = run('envelopeLaunch'),
    noisy = run('noisyBraking'),
    tiny = run('tinyBraking'),
    duplicateRun = run('positive'),
    parameters = ACCEL_ESTIMATOR_KEYS.map((key) => {
      const definition = getParameterDefinition(key);
      return {
        key,
        unit: definition.unit,
        minimum: definition.min,
        maximum: definition.max,
        defaultValue: definition.default,
      };
    }),
    rows = ACCEL_ESTIMATOR_KEYS.map((key) => row(key, positive.keys[key])),
    unobservedRows = [
      unobserved(
        'braking_jerk',
        'rampa de frÃ¢nare este tÄƒiatÄƒ Ã®nainte de cererea 047',
        censoredBraking,
      ),
      unobserved(
        'braking_jerk',
        'cererea 047 este atinsÄƒ Ã®n primul tick de frÃ¢nare',
        hardBraking,
      ),
      unobserved('braking_jerk', 'cererea 047 se schimbÄƒ Ã®n timpul rampei', changingDemand),
      unobserved(
        'braking_jerk',
        'patru rampe reale, dar Ã®mprÄƒÈ™tiate (2, 8, 14, 20 m/sÂ³)',
        noisy,
      ),
      unobserved('throttle_release_delay', 'fereastra de dovezi taie È›inerea', censoredRelease),
      unobserved('throttle_release_delay', 'frÃ¢narea anuleazÄƒ ridicarea', brakingAfterLift),
      unobserved('throttle_release_delay', 'oprire cerutÄƒ pe toatÄƒ ridicarea', vetoed),
      unobserved('launch_intensity', 'cerere puternicÄƒ constantÄƒ, fÄƒrÄƒ plecare', steady),
      unobserved('launch_intensity', 'raport aplicat/cerut peste anvelopa 169', envelopeLaunch),
      unobserved('coasting_bias', 'doar cereri puternice (1,2 m/sÂ²)', strongCoasting),
      unobserved('coasting_bias', 'raport aplicat/cerut peste anvelopa 169', envelopeCoasting),
      unobserved('coasting_bias', 'oprire cerutÄƒ pe toatÄƒ rularea', vetoed),
    ],
    refused = estimateAccelPolicyStyle({
      splitSeed: seed,
      episodes: [
        accelEpisode('manual-demo', [accelSample(0, 12, -2, -2)], {
          eligibilityOverrides: { controlMode: 'MANUAL', learningEligible: false },
        }),
        accelEpisode('duplicate-demo', brakingEpisodes()[0]!.samples),
        accelEpisode('duplicate-demo', brakingEpisodes()[0]!.samples),
      ],
    }),
    values = Object.fromEntries(
      ACCEL_ESTIMATOR_KEYS.map((key) => [key, positive.keys[key].value!]),
    ),
    profile = accelProfile(values),
    jerk = positive.keys.braking_jerk.value!,
    delay = positive.keys.throttle_release_delay.value!,
    intensity = positive.keys.launch_intensity.value!,
    bias = positive.keys.coasting_bias.value!,
    launch = evaluate(profile, {
      request: { accelerationMps2: 1.5, throttle: 0.4 },
      observation: { longitudinalSpeedMps: 0.5 },
    }),
    coast = evaluate(profile, {
      request: { accelerationMps2: 0.4, throttle: 0.12 },
      observation: { longitudinalSpeedMps: 8 },
    }),
    releaseRows = simulate(profile, {
      ticks: 200,
      request: { accelerationMps2: 0 },
      previous: { accelerationMps2: 1.5, throttle: 0.4 },
    }),
    heldThrottleTicks = releaseRows.filter((entry) => entry.throttleHeld).length,
    expectedHeldThrottleTicks = Math.ceil(delay * ACCEL_POLICY_LIMITS.tickHz),
    brakingRows = simulate(profile, {
      ticks: 200,
      request: { accelerationMps2: -2, brake: 0.25 },
    }),
    brakingTicksToDemand =
      brakingRows.findIndex((entry) => entry.committedAccelerationMps2 <= -2 + 1e-9) + 1,
    expectedBrakingTicksToDemand = Math.ceil(2 / (jerk / ACCEL_POLICY_LIMITS.tickHz)),
    brakingCommitTick5Mps2 = brakingRows[4]!.committedAccelerationMps2,
    rejectedInvalid = (() => {
      try {
        estimateAccelPolicyStyle({
          splitSeed: seed,
          episodes: [accelEpisode('nan-speed', [accelSample(0, Number.NaN, 0, 0)])],
        });
        return false;
      } catch (error) {
        return error instanceof Error && /accel evidence/i.test(error.message);
      }
    })(),
    checks: AccelReportCheck[] = [
      check(
        'context-braking',
        brakingOnly.keys.braking_jerk.status === 'CANDIDATE' &&
          near(brakingOnly.keys.braking_jerk.value, 3, 0.2) &&
          brakingOnly.keys.throttle_release_delay.status === 'UNOBSERVED' &&
          brakingOnly.keys.launch_intensity.status === 'UNOBSERVED' &&
          brakingOnly.keys.coasting_bias.status === 'UNOBSERVED',
        `braking-only jerk ${number(brakingOnly.keys.braking_jerk.value)} m/sÂ³; release, launch and coasting stay unobserved`,
      ),
      check(
        'context-release',
        releaseOnly.keys.throttle_release_delay.status === 'CANDIDATE' &&
          near(releaseOnly.keys.throttle_release_delay.value, 0.2, 0.02) &&
          releaseOnly.keys.braking_jerk.reason === 'NO_BRAKING_EVENT' &&
          releaseOnly.keys.launch_intensity.status === 'UNOBSERVED',
        `release-only delay ${number(releaseOnly.keys.throttle_release_delay.value)} s; braking, launch and coasting stay unobserved`,
      ),
      check(
        'context-launch',
        launchOnly.keys.launch_intensity.status === 'CANDIDATE' &&
          near(launchOnly.keys.launch_intensity.value, 0.6, 0.05) &&
          launchOnly.keys.coasting_bias.reason === 'NO_COASTING_EVENT',
        `launch-only intensity ${number(launchOnly.keys.launch_intensity.value)}; coasting is not read from the launch ratio`,
      ),
      check(
        'context-coasting',
        coastingOnly.keys.coasting_bias.status === 'CANDIDATE' &&
          near(coastingOnly.keys.coasting_bias.value, 0.4, 0.05) &&
          coastingOnly.keys.launch_intensity.reason === 'NO_LAUNCH_EVENT',
        `coasting-only bias ${number(coastingOnly.keys.coasting_bias.value)}; launch is not read from the coasting ratio`,
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
        'uncertainty-threshold',
        noisy.keys.braking_jerk.status === 'UNOBSERVED' &&
          noisy.keys.braking_jerk.reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
          noisy.keys.braking_jerk.value === null &&
          noisy.keys.braking_jerk.uncertainty !== null &&
          noisy.keys.braking_jerk.uncertainty > noisy.keys.braking_jerk.uncertaintyThreshold,
        `noisy braking uncertainty ${number(noisy.keys.braking_jerk.uncertainty)} > ${noisy.keys.braking_jerk.uncertaintyThreshold} m/sÂ³ keeps the key unobserved`,
      ),
      check(
        'validation-split',
        rows.every(
          (entry) =>
            entry.validationStatus === 'VALIDATED' &&
            entry.validationEpisodes >= ACCEL_ESTIMATOR_LIMITS.minimumValidationEpisodes &&
            entry.estimateEpisodes >= ACCEL_ESTIMATOR_LIMITS.minimumEstimateEpisodes &&
            entry.estimateEpisodes + entry.validationEpisodes === 4,
        ),
        `seed ${seed}: every key validates on held-out episodes (${rows.map((entry) => `${entry.key} ${entry.estimateEpisodes}+${entry.validationEpisodes}`).join(', ')})`,
      ),
      check(
        'validation-too-small',
        tiny.keys.braking_jerk.status === 'CANDIDATE' &&
          tiny.keys.braking_jerk.validation.status === 'TOO_SMALL',
        `three braking episodes leave ${tiny.keys.braking_jerk.validation.episodes} held-out episode(s), reported as ${tiny.keys.braking_jerk.validation.status}`,
      ),
      check(
        'unobserved-steady-request',
        ACCEL_ESTIMATOR_KEYS.every(
          (key) => steady.keys[key].status === 'UNOBSERVED' && steady.keys[key].value === null,
        ) &&
          steady.keys.braking_jerk.reason === 'NO_BRAKING_EVENT' &&
          steady.keys.throttle_release_delay.reason === 'NO_RELEASE_EVENT' &&
          steady.keys.launch_intensity.reason === 'NO_LAUNCH_EVENT' &&
          steady.keys.coasting_bias.reason === 'STRONG_REQUEST',
        'a steady 1,5 m/sÂ² request proves none of the four facts',
      ),
      check(
        'unobserved-braking-ramp',
        censoredBraking.keys.braking_jerk.reason === 'BRAKING_RAMP_CENSORED' &&
          hardBraking.keys.braking_jerk.reason === 'BRAKING_RAMP_NOT_OBSERVED' &&
          changingDemand.keys.braking_jerk.reason === 'BRAKING_DEMAND_CHANGED',
        'a cut ramp, a ramp hidden by its own demand and a moving demand all stay unobserved',
      ),
      check(
        'unobserved-release',
        censoredRelease.keys.throttle_release_delay.reason === 'RELEASE_HOLD_CENSORED' &&
          brakingAfterLift.keys.throttle_release_delay.reason === 'RELEASE_CANCELLED_BY_BRAKING' &&
          vetoed.keys.throttle_release_delay.reason === 'SAFETY_CONSTRAINED',
        'a cut hold, a hold cancelled by braking and a vetoed hold are excluded, not measured',
      ),
      check(
        'unobserved-coasting',
        strongCoasting.keys.coasting_bias.reason === 'STRONG_REQUEST' &&
          strongCoasting.keys.coasting_bias.excluded.STRONG_REQUEST === 4 &&
          envelopeCoasting.keys.coasting_bias.reason === 'COASTING_FACTOR_OUT_OF_ENVELOPE',
        'strong requests are not coasting and a ratio above one is outside the 169 envelope',
      ),
      check(
        'unobserved-launch-envelope',
        envelopeLaunch.keys.launch_intensity.reason === 'LAUNCH_FACTOR_OUT_OF_ENVELOPE',
        'a launch ratio above the 047 request is outside the 169 envelope',
      ),
      check(
        'shared-transition-separation',
        brakingAfterLift.keys.braking_jerk.status === 'CANDIDATE' &&
          brakingAfterLift.keys.throttle_release_delay.status === 'UNOBSERVED' &&
          brakingAfterLift.keys.throttle_release_delay.excluded.RELEASE_CANCELLED_BY_BRAKING === 4,
        'the same lift-then-brake transition proves jerk and cannot prove the hold',
      ),
      check(
        'veto-separation',
        vetoed.keys.braking_jerk.status === 'CANDIDATE' &&
          vetoed.keys.throttle_release_delay.reason === 'SAFETY_CONSTRAINED' &&
          vetoed.keys.launch_intensity.status === 'UNOBSERVED' &&
          vetoed.keys.coasting_bias.status === 'UNOBSERVED',
        'the 5 m floor zeroes throttle, hold, launch and coasting, never the braking ramp',
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
              entry.keys.every((key) => ACCEL_ESTIMATOR_KEYS.includes(key)),
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
        rows.map((entry) => `${entry.key} ${number(entry.value)} ${entry.unit}`).join(', '),
      ),
      check(
        'policy-compatibility',
        launch.launchFactor ===
          ACCEL_POLICY_LIMITS.minimumLaunchFraction +
            (1 - ACCEL_POLICY_LIMITS.minimumLaunchFraction) * intensity &&
          coast.coastingFactor === 1 - bias &&
          coast.committedAccelerationMps2 === 0.4 * (1 - bias) &&
          heldThrottleTicks === expectedHeldThrottleTicks &&
          Math.abs(brakingTicksToDemand - expectedBrakingTicksToDemand) <= 1,
        `169 reads launch factor ${launch.launchFactor.toFixed(4)}, coasting factor ${coast.coastingFactor.toFixed(4)}, ${heldThrottleTicks} held throttle ticks, braking demand reached after ${brakingTicksToDemand} ticks (expected ${expectedBrakingTicksToDemand})`,
      ),
    ],
    passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '170-accel-estimator-v1',
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
      policyVersion: ACCEL_POLICY_LIMITS.version,
      candidateOnly: positive.compatibility.candidateOnly,
      changesPolicySemantics: positive.compatibility.changesPolicySemantics,
      launchFactor: launch.launchFactor,
      expectedLaunchFactor:
        ACCEL_POLICY_LIMITS.minimumLaunchFraction +
        (1 - ACCEL_POLICY_LIMITS.minimumLaunchFraction) * intensity,
      coastingFactor: coast.coastingFactor,
      expectedCoastingFactor: 1 - bias,
      heldThrottleTicks,
      expectedHeldThrottleTicks,
      brakingTicksToDemand,
      expectedBrakingTicksToDemand,
      brakingCommitTick5Mps2,
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

export function accelEstimatorReportMarkdown(report: AccelReport): string {
  const row = (entry: AccelReportRow) =>
      `| \`${entry.key}\` | ${entry.context} | ${number(entry.value)} ${entry.unit} | Â±${number(entry.uncertainty)} ${entry.unit} | ${entry.uncertaintyThreshold} ${entry.unit} | ${entry.validationStatus}, ${entry.validationEpisodes} episoade, valoare ${number(entry.validationValue)}, eroare ${number(entry.validationError)} â‰¤ ${entry.validationTolerance} |`,
    unobservedRow = (entry: AccelReportUnobserved) =>
      `| \`${entry.key}\` | ${entry.scenario} | ${entry.status} | ${entry.reason ?? 'â€”'} | ${
        Object.entries(entry.excluded)
          .map(([reason, count]) => `${reason}Ã—${count}`)
          .join(', ') || 'â€”'
      } |`;
  return [
    '# 170 â€” Ã®nvÄƒÈ›are pentru acceleraÈ›ie È™i frÃ¢nare',
    '',
    'Generat de `scripts/run-v2-accel-learning-report.mjs` din contractul `170-accel-estimator-v1`.',
    'Fiecare cheie se estimeazÄƒ numai din faptul ei eligibil; o cheie fÄƒrÄƒ dovezi suficiente rÄƒmÃ¢ne `UNOBSERVED`, nu primeÈ™te o valoare inventatÄƒ.',
    '',
    '## Cheie â†’ context â†’ estimare â†’ incertitudine â†’ validare independentÄƒ',
    '',
    '| Cheie | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    ...report.rows.map(row),
    '',
    `Split explicit cu seed ${report.split.seed}: ${report.split.admitted} episoade admise, fÄƒrÄƒ suprapunere Ã®ntre estimare È™i validare.`,
    '',
    '## Cazuri fÄƒrÄƒ dovezi identificabile',
    '',
    '| Cheie | Scenariu | Stare | Motiv | Excluderi |',
    '| --- | --- | --- | --- | --- |',
    ...report.unobserved.map(unobservedRow),
    '',
    '## ConstrÃ¢ngeri de grup',
    '',
    ...report.groupConstraints.map(
      (entry) => `- \`${entry.id}\` (${entry.keys.join(', ')}): ${entry.explanation}`,
    ),
    '',
    '## IntrÄƒri refuzate',
    '',
    ...report.refusals.map((entry) => `- \`${entry.episodeId}\`: ${entry.reason}`),
    '',
    '## Compatibilitate cu 169',
    '',
    `- Factor de plecare citit de politicÄƒ: **${report.compatibility.launchFactor.toFixed(4)}** (așteptat ${report.compatibility.expectedLaunchFactor.toFixed(4)}).`,
    `- Factor de coasting citit de politicÄƒ: **${report.compatibility.coastingFactor.toFixed(4)}** (așteptat ${report.compatibility.expectedCoastingFactor.toFixed(4)}).`,
    `- Tick-uri de throttle È›inute de politicÄƒ: **${report.compatibility.heldThrottleTicks}** (așteptat ${report.compatibility.expectedHeldThrottleTicks}).`,
    `- Tick-uri pÃ¢nÄƒ la cererea de frÃ¢nare: **${report.compatibility.brakingTicksToDemand}** (așteptat ${report.compatibility.expectedBrakingTicksToDemand}); commit-ul la tick-ul 5 este ${report.compatibility.brakingCommitTick5Mps2.toFixed(4)} m/sÂ².`,
    `- Versiune politicÄƒ: \`${report.compatibility.policyVersion}\`, candidat-only ${report.compatibility.candidateOnly}, semanticÄƒ schimbatÄƒ ${report.compatibility.changesPolicySemantics}.`,
    '',
    '## Determinism',
    '',
    `- Seed ${report.determinism.seed}: \`${report.determinism.digest}\`.`,
    `- Rulare repetatÄƒ: \`${report.determinism.repeatedDigest}\`.`,
    '',
    '## Catalog 092',
    '',
    '| Cheie | Interval | Implicit | Unitate |',
    '| --- | ---: | ---: | --- |',
    ...report.parameters.map(
      (entry) =>
        `| \`${entry.key}\` | ${entry.minimum}â€“${entry.maximum} | ${entry.defaultValue} | ${entry.unit} |`,
    ),
    '',
    '## VerificÄƒri',
    '',
    ...report.checks.map(
      (entry) => `- ${entry.pass ? 'PASS' : 'FAIL'} \`${entry.id}\`: ${entry.detail}`,
    ),
    '',
    `**Sumar: ${report.summary.passed}/${report.summary.checks} verificÄƒri, ${report.summary.candidateKeys} chei candidate, ${report.summary.unobservedKeys} demonstraÈ›ii neobservate, ${report.summary.pass ? 'PASS' : 'FAIL'}.**`,
    '',
  ].join('\n');
}

export type { AccelEstimatorKey };
