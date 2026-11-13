import { getParameterDefinition } from '../../src/profiles';
import {
  HAZARD_POLICY_V2_KEYS,
  HAZARD_POLICY_V2_LIMITS,
} from '../../src/autonomy/hazard-policy-v2';
import type { HazardPolicyV2Key } from '../../src/autonomy/hazard-policy-v2';
import {
  HAZARD_V2_ESTIMATOR_KEYS,
  HAZARD_V2_ESTIMATOR_LIMITS,
  estimateHazardV2Style,
} from '../../src/learning/hazard-v2-estimator';
import type {
  HazardV2EstimatorKey,
  HazardV2EstimatorResult,
  HazardV2EvidenceEpisode,
  HazardV2KeyEstimate,
} from '../../src/learning/hazard-v2-estimator';
import {
  TRUE_HAZARD_PROFILE,
  clearanceWithWrongMEpisodes,
  clearanceWithoutMEpisodes,
  compatibilityProbes,
  crosswalkLimitEpisodes,
  floorClearanceEpisodes,
  forbiddenHornEpisodes,
  hazardInMarginEpisodes,
  manualEpisodes,
  mandatoryYieldEpisodes,
  noSpaceEvasionEpisodes,
  positiveEpisodes,
  reducedAdhesionEpisodes,
  refusedEvasionEpisodes,
  refusedHornEpisodes,
  saturatedReactionEpisodes,
  scatteredReactionEpisodes,
  suppressedEpisodes,
} from './hazard-v2-estimator-reference';
import { evaluate } from '../autonomy/hazard-policy-v2-reference';

export interface HazardLearningCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface HazardLearningRow {
  readonly key: string;
  readonly scenario: string;
  readonly context: string;
  readonly status: string;
  readonly value: number | null;
  readonly unit: string;
  readonly uncertainty: number | null;
  readonly uncertaintyThreshold: number;
  readonly sourceEpisodes: number;
  readonly sourceSamples: number;
  readonly validationStatus: string;
  readonly validationEpisodes: number;
  readonly validationValue: number | null;
  readonly validationError: number | null;
  readonly validationTolerance: number;
  readonly reason: string | null;
  readonly excluded: Readonly<Record<string, number>>;
}
export interface HazardLearningDemonstration {
  readonly demonstration: string;
  readonly key: string;
  readonly scenario: string;
  readonly status: string;
  readonly value: number | null;
  readonly uncertainty: number | null;
  readonly reason: string | null;
  readonly excluded: Readonly<Record<string, number>>;
}
export interface HazardLearningProbe {
  readonly key: string;
  readonly authored: string;
  readonly estimate: string;
  readonly identical: boolean;
}
export interface HazardLearningCompatibility {
  readonly policyVersion: string;
  readonly candidateOnly: boolean;
  readonly changesPolicySemantics: boolean;
  readonly mReadByPolicy: readonly string[];
  readonly tickHz: number;
  readonly clearanceReserveM: number;
  readonly standardGravityMps2: number;
  readonly probes: readonly HazardLearningProbe[];
  readonly identicalProbes: number;
  readonly reportedQuantity: Readonly<Record<string, string>>;
  readonly evidenceFields: readonly string[];
}
export interface HazardLearningReport {
  readonly version: '184-hazard-estimator-v1';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly rows: readonly HazardLearningRow[];
  readonly demonstrations: readonly HazardLearningDemonstration[];
  readonly zeros: readonly HazardLearningDemonstration[];
  readonly groupConstraints: readonly {
    readonly id: string;
    readonly keys: readonly string[];
    readonly explanation: string;
  }[];
  readonly refusals: readonly { readonly episodeId: string; readonly reason: string }[];
  readonly compatibility: HazardLearningCompatibility;
  readonly split: { readonly seed: number; readonly admitted: number; readonly refused: number };
  readonly determinism: { readonly digest: string; readonly repeatedDigest: string };
  readonly checks: readonly HazardLearningCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
    readonly candidateKeys: number;
    readonly unobservedKeys: number;
  };
}

const SPLIT_SEED = 184;
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): HazardLearningCheck {
  return { id, pass, detail };
}
const round = (value: number, digits = 6): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
function rowOf(estimate: HazardV2KeyEstimate): HazardLearningRow {
  return {
    key: estimate.key,
    scenario: estimate.scenario,
    context: estimate.eligibleContext,
    status: estimate.status,
    value: estimate.value,
    unit: estimate.unit,
    uncertainty: estimate.uncertainty,
    uncertaintyThreshold: estimate.uncertaintyThreshold,
    sourceEpisodes: estimate.sourceEpisodes,
    sourceSamples: estimate.sourceSamples,
    validationStatus: estimate.validation.status,
    validationEpisodes: estimate.validation.episodes,
    validationValue: estimate.validation.value,
    validationError: estimate.validation.error,
    validationTolerance: estimate.validation.tolerance,
    reason: estimate.reason,
    excluded: estimate.excluded,
  };
}
function demonstrationOf(
  demonstration: string,
  estimate: HazardV2KeyEstimate,
): HazardLearningDemonstration {
  return {
    demonstration,
    key: estimate.key,
    scenario: estimate.scenario,
    status: estimate.status,
    value: estimate.value,
    uncertainty: estimate.uncertainty,
    reason: estimate.reason,
    excluded: estimate.excluded,
  };
}
/** The eight estimated keys, rounded to the report precision that the policy reads back. */
function estimatedProfile(
  result: HazardV2EstimatorResult,
): Partial<Record<HazardPolicyV2Key, number>> {
  const values: Partial<Record<HazardPolicyV2Key, number>> = {};
  for (const key of HAZARD_V2_ESTIMATOR_KEYS) {
    const estimate = result.keys[key];
    if (estimate.value === null) continue;
    values[key] = round(estimate.value);
  }
  return values;
}
/** Every demonstrated scene replayed with the estimated profile: the emitted fact must not change. */
function compatibilityProbesOf(result: HazardV2EstimatorResult): {
  readonly probes: readonly HazardLearningProbe[];
  readonly identical: number;
} {
  const estimated = estimatedProfile(result),
    probes = compatibilityProbes().map((probe) => {
      const authored = probe.fact(
          evaluate(probe.scene, {
            tick: probe.tick,
            opportunityKey: probe.opportunityKey,
            rValues: TRUE_HAZARD_PROFILE,
          }).command,
        ),
        estimate = probe.fact(
          evaluate(probe.scene, {
            tick: probe.tick,
            opportunityKey: probe.opportunityKey,
            rValues: estimated,
          }).command,
        );
      return {
        key: probe.key,
        authored,
        estimate,
        identical: authored === estimate,
      };
    });
  return { probes, identical: probes.filter((probe) => probe.identical).length };
}

export function runHazardLearningReport(): HazardLearningReport {
  const episodes = positiveEpisodes(),
    result = estimateHazardV2Style({ episodes, splitSeed: SPLIT_SEED }),
    rows = HAZARD_V2_ESTIMATOR_KEYS.map((key) => rowOf(result.keys[key])),
    run = (list: readonly HazardV2EvidenceEpisode[]) =>
      estimateHazardV2Style({ episodes: list, splitSeed: SPLIT_SEED }),
    demonstrations: HazardLearningDemonstration[] = [],
    add = (
      name: string,
      estimate: HazardV2EstimatorResult,
      keys: readonly HazardV2EstimatorKey[],
    ) => {
      for (const key of keys) demonstrations.push(demonstrationOf(name, estimate.keys[key]));
    },
    withoutM = run(clearanceWithoutMEpisodes()),
    wrongM = run(clearanceWithWrongMEpisodes()),
    floor = run(floorClearanceEpisodes()),
    margin = run(hazardInMarginEpisodes()),
    saturated = run(saturatedReactionEpisodes()),
    adhesion = run(reducedAdhesionEpisodes()),
    noSpace = run(noSpaceEvasionEpisodes()),
    crosswalkLimit = run(crosswalkLimitEpisodes()),
    forbiddenHorn = run(forbiddenHornEpisodes()),
    mandatory = run(mandatoryYieldEpisodes()),
    scattered = run(scatteredReactionEpisodes()),
    manual = run(manualEpisodes()),
    suppressed = run(suppressedEpisodes()),
    refusedHorn = run(refusedHornEpisodes()),
    refusedEvasion = run(refusedEvasionEpisodes());
  add('flux fără decelerația de confort M', withoutM, [
    'pedestrian_clearance',
    'obstacle_clearance',
  ]);
  add('decelerație de confort M declarată greșit', wrongM, [
    'pedestrian_clearance',
    'obstacle_clearance',
  ]);
  add('spațiu demonstrat sub podeaua fizică', floor, [
    'pedestrian_clearance',
    'obstacle_clearance',
  ]);
  add('hazard deja în marjă, comandă 0 m/s', margin, [
    'pedestrian_clearance',
    'obstacle_clearance',
  ]);
  add('reacție saturată de plafonul de oprire', saturated, ['hazard_reaction_delay']);
  add('frânare de urgență pe aderență redusă', adhesion, ['emergency_brake_intensity']);
  add('ocolire fără spațiul lateral verificat', noSpace, ['evasive_steer_willingness']);
  add('apropiere de trecere plafonată de limită', crosswalkLimit, ['crosswalk_approach_speed']);
  add('claxon interzis de lume', forbiddenHorn, ['horn_use_probability']);
  add('cedare obligatorie la fiecare traversare', mandatory, ['pedestrian_yield_probability']);
  add('reacții împrăștiate peste pragul de incertitudine', scattered, ['hazard_reaction_delay']);
  add('episoade MANUAL', manual, [...HAZARD_V2_ESTIMATOR_KEYS]);
  add('fereastră fără prefix utilizabil', suppressed, [...HAZARD_V2_ESTIMATOR_KEYS]);
  const zeros: HazardLearningDemonstration[] = [
    demonstrationOf(
      'claxon nefolosit la fiecare oportunitate',
      refusedHorn.keys.horn_use_probability,
    ),
    demonstrationOf(
      'ocolire refuzată la fiecare oportunitate',
      refusedEvasion.keys.evasive_steer_willingness,
    ),
  ];
  const compatibility = compatibilityProbesOf(result),
    parameters = HAZARD_POLICY_V2_KEYS.map((key) => {
      const definition = getParameterDefinition(key);
      return {
        key,
        unit: definition.unit,
        minimum: definition.min,
        maximum: definition.max,
        defaultValue: definition.default,
      };
    }),
    evidenceFields = Object.freeze([
      'tick',
      'speedMps',
      'postedLimitMps',
      'policyActive',
      'reason',
      'action',
      'geometry',
      'surfaceId',
      'declaredM',
      'pedestrian',
      'obstacleId',
      'clearance',
      'reaction',
      'emergencyBrake',
      'evasion',
      'crosswalk',
      'horn',
    ]),
    compatibilityBlock: HazardLearningCompatibility = {
      policyVersion: result.compatibility.policyVersion,
      candidateOnly: result.compatibility.candidateOnly,
      changesPolicySemantics: result.compatibility.changesPolicySemantics,
      mReadByPolicy: result.compatibility.mReadByPolicy,
      tickHz: result.compatibility.tickHz,
      clearanceReserveM: result.compatibility.clearanceReserveM,
      standardGravityMps2: result.compatibility.standardGravityMps2,
      probes: compatibility.probes,
      identicalProbes: compatibility.identical,
      reportedQuantity: result.compatibility.reportedQuantity,
      evidenceFields,
    },
    clearanceKeys = Object.freeze(['pedestrian_clearance', 'obstacle_clearance'] as const),
    checks: readonly HazardLearningCheck[] = [
      check(
        'catalog',
        parameters.length === 8 &&
          parameters.every(
            (entry) =>
              entry.minimum < entry.maximum &&
              entry.defaultValue >= entry.minimum &&
              entry.defaultValue <= entry.maximum,
          ),
        parameters
          .map((entry) => `${entry.key} ${entry.minimum}-${entry.maximum} ${entry.unit}`)
          .join(', '),
      ),
      check(
        'contexts',
        new Set(rows.map((entry) => entry.scenario)).size === 8 &&
          new Set(rows.map((entry) => entry.context)).size === 8,
        `8 scenarii și 8 contexte eligibile distincte: ${rows
          .map((entry) => `${entry.key}->${entry.scenario}`)
          .join(', ')}`,
      ),
      check(
        'candidates',
        rows.every((entry) => entry.status === 'CANDIDATE'),
        rows
          .map((entry) => `${entry.key} ${entry.value?.toFixed(4) ?? '—'} ${entry.unit}`)
          .join(', '),
      ),
      check(
        'uncertainty',
        rows.every(
          (entry) =>
            entry.uncertainty !== null &&
            entry.uncertainty > 0 &&
            entry.uncertainty <= entry.uncertaintyThreshold,
        ),
        rows
          .map(
            (entry) =>
              `${entry.key} ±${entry.uncertainty?.toFixed(4)}/${entry.uncertaintyThreshold}`,
          )
          .join(', '),
      ),
      check(
        'validation',
        rows.every(
          (entry) =>
            entry.validationStatus === 'VALIDATED' &&
            entry.validationEpisodes >= HAZARD_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes,
        ),
        rows
          .map(
            (entry) =>
              `${entry.key} ${entry.validationStatus} ${entry.validationEpisodes} episoade, eroare ${entry.validationError?.toFixed(4)}`,
          )
          .join('; '),
      ),
      check(
        'clearance-m-unknown',
        clearanceKeys.every(
          (key) =>
            withoutM.keys[key].status === 'UNOBSERVED' &&
            withoutM.keys[key].reason === 'CLEARANCE_M_UNKNOWN',
        ),
        clearanceKeys
          .map((key) => `${key} ${withoutM.keys[key].status} / ${withoutM.keys[key].reason}`)
          .join(', '),
      ),
      check(
        'clearance-m-inconsistent',
        clearanceKeys.every(
          (key) =>
            wrongM.keys[key].status === 'UNOBSERVED' &&
            wrongM.keys[key].reason === 'CLEARANCE_M_INCONSISTENT',
        ),
        clearanceKeys
          .map((key) => `${key} ${wrongM.keys[key].status} / ${wrongM.keys[key].reason}`)
          .join(', '),
      ),
      check(
        'clearance-floor',
        clearanceKeys.every(
          (key) =>
            floor.keys[key].status === 'UNOBSERVED' &&
            floor.keys[key].reason === 'CLEARANCE_FLOOR_SATURATED',
        ),
        clearanceKeys
          .map(
            (key) =>
              `${key} ${floor.keys[key].status} / ${floor.keys[key].reason} (${Object.entries(
                floor.keys[key].excluded,
              )
                .map(([reason, amount]) => `${reason}×${amount}`)
                .join(', ')})`,
          )
          .join(', '),
      ),
      check(
        'clearance-margin',
        clearanceKeys.every(
          (key) =>
            margin.keys[key].status === 'UNOBSERVED' &&
            margin.keys[key].reason === 'CLEARANCE_ROOM_EXHAUSTED',
        ),
        clearanceKeys
          .map((key) => `${key} ${margin.keys[key].status} / ${margin.keys[key].reason}`)
          .join(', '),
      ),
      check(
        'reaction-saturation',
        saturated.keys.hazard_reaction_delay.status === 'UNOBSERVED' &&
          saturated.keys.hazard_reaction_delay.reason === 'REACTION_DELAY_SATURATED',
        `reacție saturată: ${saturated.keys.hazard_reaction_delay.status} / ${saturated.keys.hazard_reaction_delay.reason}`,
      ),
      check(
        'adhesion-cap',
        adhesion.keys.emergency_brake_intensity.status === 'UNOBSERVED' &&
          adhesion.keys.emergency_brake_intensity.reason === 'ADHESION_CAP_SATURATED',
        `aderență redusă: ${adhesion.keys.emergency_brake_intensity.status} / ${adhesion.keys.emergency_brake_intensity.reason}`,
      ),
      check(
        'evasion-no-space',
        noSpace.keys.evasive_steer_willingness.status === 'UNOBSERVED' &&
          noSpace.keys.evasive_steer_willingness.reason === 'EVASION_NO_SPACE',
        `ocolire fără spațiu: ${noSpace.keys.evasive_steer_willingness.status} / ${noSpace.keys.evasive_steer_willingness.reason}`,
      ),
      check(
        'crosswalk-limit',
        crosswalkLimit.keys.crosswalk_approach_speed.status === 'UNOBSERVED' &&
          crosswalkLimit.keys.crosswalk_approach_speed.reason === 'CROSSWALK_LIMIT_SATURATED',
        `trecere plafonată: ${crosswalkLimit.keys.crosswalk_approach_speed.status} / ${crosswalkLimit.keys.crosswalk_approach_speed.reason}`,
      ),
      check(
        'horn-forbidden',
        forbiddenHorn.keys.horn_use_probability.status === 'UNOBSERVED' &&
          forbiddenHorn.keys.horn_use_probability.reason === 'HORN_FORBIDDEN',
        `claxon interzis: ${forbiddenHorn.keys.horn_use_probability.status} / ${forbiddenHorn.keys.horn_use_probability.reason}`,
      ),
      check(
        'yield-mandatory',
        mandatory.keys.pedestrian_yield_probability.status === 'UNOBSERVED' &&
          mandatory.keys.pedestrian_yield_probability.reason ===
            'PEDESTRIAN_ALL_CROSSINGS_MANDATORY' &&
          mandatory.keys.pedestrian_clearance.status === 'CANDIDATE',
        `cedare obligatorie: ${mandatory.keys.pedestrian_yield_probability.status} / ${mandatory.keys.pedestrian_yield_probability.reason}, spațiul rămâne ${mandatory.keys.pedestrian_clearance.status}`,
      ),
      check(
        'reaction-uncertainty',
        scattered.keys.hazard_reaction_delay.status === 'UNOBSERVED' &&
          scattered.keys.hazard_reaction_delay.reason === 'UNCERTAINTY_ABOVE_THRESHOLD',
        `reacții împrăștiate: ${scattered.keys.hazard_reaction_delay.status} / ${scattered.keys.hazard_reaction_delay.reason}, incertitudine ${scattered.keys.hazard_reaction_delay.uncertainty?.toFixed(4)} > ${scattered.keys.hazard_reaction_delay.uncertaintyThreshold}`,
      ),
      check(
        'zero-horn',
        refusedHorn.keys.horn_use_probability.status === 'CANDIDATE' &&
          refusedHorn.keys.horn_use_probability.value === 0 &&
          (refusedHorn.keys.horn_use_probability.uncertainty ?? 1) <=
            HAZARD_V2_ESTIMATOR_LIMITS.maximumUncertainty.horn_use_probability,
        `refuz constant: ${refusedHorn.keys.horn_use_probability.status} valoare ${refusedHorn.keys.horn_use_probability.value}, incertitudine ${refusedHorn.keys.horn_use_probability.uncertainty?.toFixed(4)}`,
      ),
      check(
        'zero-evasion',
        refusedEvasion.keys.evasive_steer_willingness.status === 'CANDIDATE' &&
          refusedEvasion.keys.evasive_steer_willingness.value === 0 &&
          (refusedEvasion.keys.evasive_steer_willingness.uncertainty ?? 1) <=
            HAZARD_V2_ESTIMATOR_LIMITS.maximumUncertainty.evasive_steer_willingness,
        `ocolire refuzată constant: ${refusedEvasion.keys.evasive_steer_willingness.status} valoare ${refusedEvasion.keys.evasive_steer_willingness.value}, incertitudine ${refusedEvasion.keys.evasive_steer_willingness.uncertainty?.toFixed(4)}`,
      ),
      check(
        'refusals',
        manual.admittedEpisodes.length === 0 &&
          manual.refusedEpisodes.every((entry) => entry.reason === 'NOT_LEARNING_ELIGIBLE') &&
          suppressed.refusedEpisodes.every((entry) => entry.reason === 'NO_USABLE_PREFIX') &&
          HAZARD_V2_ESTIMATOR_KEYS.every(
            (key) => manual.keys[key].reason === 'NO_ELIGIBLE_EPISODES',
          ),
        `MANUAL: ${manual.refusedEpisodes.length} episoade refuzate, ${manual.admittedEpisodes.length} admise; fără prefix: ${suppressed.refusedEpisodes.length}; toate cheile rămân neobservate`,
      ),
      check(
        'policy-facts-only',
        !evidenceFields.includes('profile') &&
          !evidenceFields.includes('values') &&
          !evidenceFields.includes('rValues') &&
          result.admittedEpisodes.length === episodes.length,
        `eșantionul poartă numai fapte ale comenzii 183: ${evidenceFields.join(', ')}`,
      ),
      check(
        'policy-compatibility',
        compatibility.identical === compatibility.probes.length,
        `${compatibility.identical}/${compatibility.probes.length} fapte rejucate cu profilul estimat sunt identice cu cele ale profilului autorat (${compatibility.probes
          .map((probe) => `${probe.key}:${probe.authored}=${probe.estimate}`)
          .join(', ')})`,
      ),
      check(
        'candidate-only',
        compatibilityBlock.candidateOnly &&
          !compatibilityBlock.changesPolicySemantics &&
          compatibilityBlock.policyVersion === HAZARD_POLICY_V2_LIMITS.version &&
          compatibilityBlock.mReadByPolicy.length === 4,
        `politica ${compatibilityBlock.policyVersion}, candidate-only ${compatibilityBlock.candidateOnly}, semantică schimbată ${compatibilityBlock.changesPolicySemantics}, M citite ${compatibilityBlock.mReadByPolicy.join('/')}, rată ${compatibilityBlock.tickHz} Hz`,
      ),
      check(
        'determinism',
        digest(JSON.stringify(result.keys)) ===
          digest(JSON.stringify(run(positiveEpisodes()).keys)),
        `digest ${digest(JSON.stringify(result.keys))}`,
      ),
    ];
  const passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '184-hazard-estimator-v1',
    parameters,
    rows,
    demonstrations,
    zeros,
    groupConstraints: result.groupConstraints.map((entry) => ({
      id: entry.id,
      keys: [...entry.keys],
      explanation: entry.explanation,
    })),
    refusals: result.refusedEpisodes.map((entry) => ({
      episodeId: entry.episodeId,
      reason: entry.reason,
    })),
    compatibility: compatibilityBlock,
    split: {
      seed: SPLIT_SEED,
      admitted: result.admittedEpisodes.length,
      refused: result.refusedEpisodes.length,
    },
    determinism: {
      digest: digest(JSON.stringify(result.keys)),
      repeatedDigest: digest(JSON.stringify(run(positiveEpisodes()).keys)),
    },
    checks,
    summary: {
      checks: checks.length,
      passed,
      pass: passed === checks.length,
      candidateKeys: rows.filter((entry) => entry.status === 'CANDIDATE').length,
      unobservedKeys: rows.filter((entry) => entry.status === 'UNOBSERVED').length,
    },
  };
}

const number = (value: number | null, digits = 4): string =>
  value === null ? '—' : value.toFixed(digits);
export function hazardLearningReportMarkdown(report: HazardLearningReport): string {
  const row = (entry: HazardLearningRow) =>
      `| \`${entry.key}\` | \`${entry.scenario}\` | ${entry.context} | ${number(entry.value)} ${entry.unit} | ±${number(entry.uncertainty)} ${entry.unit} | ${entry.uncertaintyThreshold} ${entry.unit} | ${entry.validationStatus}, ${entry.validationEpisodes} episoade, valoare ${number(entry.validationValue)}, eroare ${number(entry.validationError)} ≤ ${entry.validationTolerance} |`,
    demonstration = (entry: HazardLearningDemonstration) =>
      `| ${entry.demonstration} | \`${entry.key}\` | ${entry.status} | ${number(entry.value)} | ${entry.reason ?? '—'} | ${
        Object.entries(entry.excluded)
          .map(([reason, amount]) => `${reason}×${amount}`)
          .join(', ') || '—'
      } |`;
  return [
    '# 184 — învățare extinsă pentru pietoni și pericole',
    '',
    'Generat de `scripts/run-v2-hazard-learning-report.mjs` din contractul `184-hazard-estimator-v1`.',
    'Fiecare cheie se estimează numai din scenariul ei eligibil, din faptele comenzii reale 183 peste',
    'traversări 164 reale și stimuluri 165 reale; o cheie fără dovezi suficiente rămâne `UNOBSERVED`,',
    'nu primește o valoare inventată.',
    '',
    '## Cheie → scenariu → context → estimare → incertitudine → validare independentă',
    '',
    '| Cheie | Scenariu | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |',
    '| --- | --- | --- | ---: | ---: | ---: | --- |',
    ...report.rows.map(row),
    '',
    `Split explicit cu seed ${report.split.seed}: ${report.split.admitted} episoade admise, ${report.split.refused} refuzate, fără suprapunere între estimare și validare.`,
    '',
    '## Cele două capcane de identificabilitate',
    '',
    `- Plafoanele de spațiu depind de M: \`pedestrian_clearance\` și \`obstacle_clearance\` sunt ` +
      `\`sqrt(2 · comfort_deceleration · cameră)\`, deci inversarea cere decelerația de confort din ` +
      `același tick. Fără ea cheia nu se izolează de M.`,
    `- \`hazard_reaction_delay\` este \`min(brake_reaction_delay + cheie, plafon de oprire)\`: o ` +
      `valoare saturată nu spune nimic despre cheie și nu devine estimare.`,
    '',
    '## Cazuri fără dovezi identificabile',
    '',
    '| Demonstrație | Cheie | Stare | Valoare | Motiv | Excluderi |',
    '| --- | --- | --- | ---: | --- | --- |',
    ...report.demonstrations.map(demonstration),
    '',
    '## Zerouri demonstrate',
    '',
    '| Demonstrație | Cheie | Stare | Valoare | Motiv | Excluderi |',
    '| --- | --- | --- | ---: | --- | --- |',
    ...report.zeros.map(demonstration),
    '',
    '## Constrângeri de grup',
    '',
    ...report.groupConstraints.map(
      (entry) => `- \`${entry.id}\` (${entry.keys.join(', ')}): ${entry.explanation}`,
    ),
    '',
    '## Intrări refuzate',
    '',
    ...(report.refusals.length === 0
      ? [
          'Niciuna: toate episoadele setului pozitiv sunt `LEARNING` eligibile cu prefix utilizabil.',
        ]
      : report.refusals.map((entry) => `- \`${entry.episodeId}\`: ${entry.reason}`)),
    '',
    '## Compatibilitate cu 183 (citire fără schimbare de semantică)',
    '',
    '| Cheie | Fapt autorat | Fapt estimat | Identic |',
    '| --- | --- | --- | --- |',
    ...report.compatibility.probes.map(
      (probe) =>
        `| \`${probe.key}\` | ${probe.authored} | ${probe.estimate} | ${probe.identical ? 'da' : 'nu'} |`,
    ),
    '',
    `- ${report.compatibility.identicalProbes}/${report.compatibility.probes.length} fapte rejucate cu profilul estimat sunt identice cu profilul autorat.`,
    `- Versiune politică \`${report.compatibility.policyVersion}\`, candidate-only ${report.compatibility.candidateOnly}, semantică schimbată ${report.compatibility.changesPolicySemantics}, rată ${report.compatibility.tickHz} Hz, rezervă de spațiu ${report.compatibility.clearanceReserveM} m, gravitație ${report.compatibility.standardGravityMps2} m/s².`,
    `- Chei M citite de politică: ${report.compatibility.mReadByPolicy.join(', ')}.`,
    `- Cantități raportate: ${Object.entries(report.compatibility.reportedQuantity)
      .map(([key, value]) => `\`${key}\` = ${value}`)
      .join('; ')}.`,
    '',
    '## Determinism',
    '',
    `- Seed ${report.split.seed}: \`${report.determinism.digest}\`.`,
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
    `**Sumar: ${report.summary.passed}/${report.summary.checks} verificări, ${report.summary.candidateKeys} chei candidate, ${report.summary.unobservedKeys} chei neobservate, ${report.summary.pass ? 'PASS' : 'FAIL'}.**`,
    '',
  ].join('\n');
}
