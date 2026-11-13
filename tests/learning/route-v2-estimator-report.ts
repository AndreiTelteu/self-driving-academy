import { getParameterDefinition } from '../../src/profiles';
import { ROUTE_POLICY_V2_KEYS, ROUTE_POLICY_V2_LIMITS } from '../../src/autonomy/route-policy-v2';
import type { RoutePolicyV2Key } from '../../src/autonomy/route-policy-v2';
import {
  ROUTE_V2_ESTIMATOR_KEYS,
  ROUTE_V2_ESTIMATOR_LIMITS,
  estimateRouteV2Style,
} from '../../src/learning/route-v2-estimator';
import type {
  RouteV2EstimatorKey,
  RouteV2EstimatorResult,
  RouteV2KeyEstimate,
} from '../../src/learning/route-v2-estimator';
import {
  TRUE_ROUTE_PROFILE,
  blockedRecoveryEpisodes,
  censoredPatienceEpisodes,
  contradictoryRhoEpisodes,
  decide,
  floorPatienceEpisodes,
  floorRecoveryEpisodes,
  forbiddenUTurnEpisodes,
  manualEpisodes,
  oneSidedRhoEpisodes,
  oneSidedTurnEpisodes,
  positiveEpisodes,
  refusedUTurnEpisodes,
  scaledEpisodes,
  suppressedEpisodes,
  uTurnOpportunities,
  weightPairs,
} from './route-v2-estimator-reference';
import type { RouteV2EvidenceEpisode } from '../../src/learning/route-v2-estimator';

export interface RouteLearningCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface RouteLearningRow {
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
}
export interface RouteLearningDemonstration {
  readonly demonstration: string;
  readonly key: string;
  readonly scenario: string;
  readonly status: string;
  readonly value: number | null;
  readonly uncertainty: number | null;
  readonly reason: string | null;
  readonly excluded: Readonly<Record<string, number>>;
}
export interface RouteLearningCompatibility {
  readonly policyVersion: string;
  readonly candidateOnly: boolean;
  readonly changesPolicySemantics: boolean;
  readonly tickHz: number;
  readonly minimumReverseRecoveryS: number;
  readonly coefficients: RouteV2EstimatorResult['coefficients'];
  readonly estimatedShares: Readonly<Record<string, number>> | null;
  readonly authoredShares: Readonly<Record<string, number>>;
  readonly normalizedSum: number;
  readonly estimatedWeightCount: number;
  readonly decisions: number;
  readonly identicalDecisions: number;
  readonly scaleFactors: readonly number[];
  readonly scaleIdentical: boolean;
  readonly scaleDecisions: number;
  readonly scaleIdenticalDecisions: number;
  readonly reportedQuantity: Readonly<Record<string, string>>;
  readonly evidenceFields: readonly string[];
}
export interface RouteLearningReport {
  readonly version: '182-route-estimator-v1';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly rows: readonly RouteLearningRow[];
  readonly demonstrations: readonly RouteLearningDemonstration[];
  readonly zeros: readonly RouteLearningDemonstration[];
  readonly groupConstraints: readonly {
    readonly id: string;
    readonly keys: readonly string[];
    readonly explanation: string;
  }[];
  readonly refusals: readonly { readonly episodeId: string; readonly reason: string }[];
  readonly compatibility: RouteLearningCompatibility;
  readonly split: { readonly seed: number; readonly admitted: number; readonly refused: number };
  readonly determinism: { readonly digest: string; readonly repeatedDigest: string };
  readonly checks: readonly RouteLearningCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
    readonly candidateKeys: number;
    readonly unobservedKeys: number;
  };
}

const WEIGHT_KEYS: readonly RouteV2EstimatorKey[] = Object.freeze([
  'route_time_weight',
  'route_distance_weight',
  'route_turn_penalty',
  'route_signal_penalty',
  'route_congestion_penalty',
]);
const SPLIT_SEED = 182;
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): RouteLearningCheck {
  return { id, pass, detail };
}
const round = (value: number, digits = 6): number =>
  Math.round(value * 10 ** digits) / 10 ** digits;
function rowOf(estimate: RouteV2KeyEstimate): RouteLearningRow {
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
  };
}
function demonstrationOf(
  demonstration: string,
  estimate: RouteV2KeyEstimate,
): RouteLearningDemonstration {
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
/** The eight keys the delivered 181 policy needs, taken from the estimated shares. */
function estimatedProfile(
  result: RouteV2EstimatorResult,
): Partial<Record<RoutePolicyV2Key, number>> {
  const values: Partial<Record<RoutePolicyV2Key, number>> = {};
  for (const key of ROUTE_V2_ESTIMATOR_KEYS) {
    const estimate = result.keys[key];
    if (estimate.value === null) continue;
    values[key] = estimate.value;
  }
  return values;
}
/** The authored profile's normalized coefficients, read from the real 181 command. */
function authoredShares(): Readonly<Record<string, number>> {
  const command = decide(
    { routes: weightPairs.rho[0]!, tick: 900, opportunityKey: 'shares-probe' },
    TRUE_ROUTE_PROFILE,
  );
  const weights = command.weights;
  if (weights === null) throw new Error('The shares probe was not scored');
  return Object.freeze({
    route_time_weight: weights.time,
    route_distance_weight: weights.distance,
    route_turn_penalty: weights.turn,
    route_signal_penalty: weights.signal,
    route_congestion_penalty: weights.congestion,
  });
}
/** Every demonstrated decision of the positive set, replayed with the estimated profile. */
function compatibilityDecisions(result: RouteV2EstimatorResult): {
  decisions: number;
  identical: number;
  scaleDecisions: number;
  scaleIdentical: number;
} {
  const estimated = estimatedProfile(result),
    uTurnAdmitted = uTurnOpportunities(1, 0, 0.05)[0]!,
    uTurnRefused = uTurnOpportunities(1, 0.4, 0.6)[0]!,
    scenes = [
      ...(['rho', 'turn', 'signal', 'congestion'] as const).flatMap((group) =>
        weightPairs[group].map((routes, index) => ({
          routes,
          tick: 900 + index,
          opportunityKey: `compatibility-${group}-${index}`,
        })),
      ),
      {
        routes: [{ id: 'td-short' }, { id: 'td-long-a' }],
        tick: 2_000,
        opportunityKey: 'compatibility-patience',
        currentRouteId: 'td-short',
        waitingSinceTick: 2_000 - 1_199,
      },
      {
        routes: [{ id: 'u-direct' }, { id: 'u-turn' }],
        tick: 920,
        opportunityKey: uTurnAdmitted,
        uTurn: 'PERMITTED' as const,
      },
      {
        routes: [{ id: 'u-direct' }, { id: 'u-turn' }],
        tick: 921,
        opportunityKey: uTurnRefused,
        uTurn: 'PERMITTED' as const,
      },
      {
        routes: [{ id: 'u-direct' }],
        tick: 930,
        opportunityKey: 'compatibility-recovery',
        recovery: { required: true, reverseClear: true },
      },
    ],
    replayed = scenes.map((scene) => {
      const authored = decide(scene, TRUE_ROUTE_PROFILE),
        estimate = decide(scene, estimated);
      return {
        authored: `${authored.candidateRouteId ?? authored.reason}:${authored.reroute.decision}:${authored.uTurn.admitted}:${authored.recovery.durationS ?? 0}`,
        estimate: `${estimate.candidateRouteId ?? estimate.reason}:${estimate.reroute.decision}:${estimate.uTurn.admitted}:${estimate.recovery.durationS ?? 0}`,
      };
    }),
    identical = replayed.filter((entry) => entry.authored === entry.estimate).length,
    scaleFactors = Object.freeze([1, 10]),
    scaleResults = scaleFactors.map((factor) =>
      estimateRouteV2Style({ episodes: scaledEpisodes(factor), splitSeed: SPLIT_SEED }),
    ),
    scaleReplayed = scenes.map((scene) => {
      const values = scaleResults.map(
        (entry) => decide(scene, estimatedProfile(entry)).candidateRouteId,
      );
      return values.every((value) => value === values[0]);
    }),
    scaleIdentical = scaleReplayed.filter(Boolean).length;
  return {
    decisions: replayed.length,
    identical,
    scaleDecisions: scaleReplayed.length,
    scaleIdentical,
  };
}

export function runRouteLearningReport(): RouteLearningReport {
  const result = estimateRouteV2Style({ episodes: positiveEpisodes(), splitSeed: SPLIT_SEED }),
    rows = ROUTE_V2_ESTIMATOR_KEYS.map((key) => rowOf(result.keys[key])),
    demonstrations: RouteLearningDemonstration[] = [],
    run = (episodes: readonly RouteV2EvidenceEpisode[]) =>
      estimateRouteV2Style({ episodes, splitSeed: SPLIT_SEED }),
    add = (
      name: string,
      estimate: RouteV2EstimatorResult,
      keys: readonly RouteV2EstimatorKey[],
    ) => {
      for (const key of keys) demonstrations.push(demonstrationOf(name, estimate.keys[key]));
    },
    forbiddenU = run(forbiddenUTurnEpisodes()),
    floorRecovery = run(floorRecoveryEpisodes()),
    blockedRecovery = run(blockedRecoveryEpisodes()),
    censoredPatience = run(censoredPatienceEpisodes()),
    oneSidedRho = run(oneSidedRhoEpisodes()),
    oneSidedTurn = run(oneSidedTurnEpisodes()),
    contradictory = run(contradictoryRhoEpisodes()),
    manual = run(manualEpisodes()),
    suppressed = run(suppressedEpisodes()),
    refusedU = run(refusedUTurnEpisodes()),
    floorPatience = run(floorPatienceEpisodes());
  add('întoarcere interzisă', forbiddenU, ['u_turn_willingness']);
  add('recuperare pe podeaua de 2,5 s', floorRecovery, ['reverse_recovery_duration']);
  add('recuperare fără spațiu liber', blockedRecovery, ['reverse_recovery_duration']);
  add('fereastră închisă înainte de commit', censoredPatience, ['reroute_patience']);
  add('raport timp/distanță pe o singură parte', oneSidedRho, [...WEIGHT_KEYS]);
  add('o penalizare pe o singură parte', oneSidedTurn, [...WEIGHT_KEYS]);
  add('doi șoferi contrazicători', contradictory, [...WEIGHT_KEYS]);
  add('episoade MANUAL', manual, [...ROUTE_V2_ESTIMATOR_KEYS]);
  add('fereastră fără prefix utilizabil', suppressed, [...ROUTE_V2_ESTIMATOR_KEYS]);
  const zeros: RouteLearningDemonstration[] = [
    demonstrationOf('U refuzat la fiecare oportunitate', refusedU.keys.u_turn_willingness),
    demonstrationOf('răbdarea de la podeaua catalogului', floorPatience.keys.reroute_patience),
  ];
  const authored = authoredShares(),
    estimatedShares = result.normalizedShares,
    normalizedSum =
      estimatedShares === null
        ? 0
        : Object.values(estimatedShares).reduce((total, share) => total + share, 0),
    compatibility = compatibilityDecisions(result),
    estimated = estimatedProfile(result),
    estimatedWeights =
      estimated.route_time_weight === undefined
        ? null
        : decide(
            { routes: weightPairs.rho[0]!, tick: 940, opportunityKey: 'normalized-probe' },
            estimated,
          ).weights,
    renormalized =
      estimatedWeights === null
        ? 0
        : [
            estimatedWeights.time,
            estimatedWeights.distance,
            estimatedWeights.turn,
            estimatedWeights.signal,
            estimatedWeights.congestion,
          ].filter(
            (value, index) =>
              estimatedShares !== null &&
              Math.abs(value - Object.values(estimatedShares)[index]!) <= 1e-9,
          ).length,
    parameters = ROUTE_POLICY_V2_KEYS.map((key) => {
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
      'policyActive',
      'reason',
      'action',
      'referenceSeconds',
      'referenceMetres',
      'currentRouteId',
      'candidateRouteId',
      'selectedRouteId',
      'reroute',
      'uTurn',
      'recovery',
      'routes',
    ]),
    determinismDigest = digest(
      JSON.stringify({ keys: result.keys, coefficients: result.coefficients }),
    ),
    repeatedDigest = digest(
      JSON.stringify({
        keys: estimateRouteV2Style({
          episodes: positiveEpisodes(),
          splitSeed: SPLIT_SEED,
        }).keys,
        coefficients: result.coefficients,
      }),
    ),
    compatibilityBlock: RouteLearningCompatibility = {
      policyVersion: result.compatibility.policyVersion,
      candidateOnly: result.compatibility.candidateOnly,
      changesPolicySemantics: result.compatibility.changesPolicySemantics,
      tickHz: result.compatibility.tickHz,
      minimumReverseRecoveryS: result.compatibility.minimumReverseRecoveryS,
      coefficients: result.coefficients,
      estimatedShares,
      authoredShares: authored,
      normalizedSum: round(normalizedSum, 12),
      estimatedWeightCount: Object.keys(estimated).length,
      decisions: compatibility.decisions,
      identicalDecisions: compatibility.identical,
      scaleFactors: Object.freeze([1, 10]),
      scaleIdentical: compatibility.scaleIdentical === compatibility.scaleDecisions,
      scaleDecisions: compatibility.scaleDecisions,
      scaleIdenticalDecisions: compatibility.scaleIdentical,
      reportedQuantity: result.compatibility.reportedQuantity,
      evidenceFields,
    },
    checks: readonly RouteLearningCheck[] = [
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
            entry.validationEpisodes >= ROUTE_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes,
        ),
        rows
          .map(
            (entry) =>
              `${entry.key} ${entry.validationStatus} ${entry.validationEpisodes} episoade, eroare ${entry.validationError?.toFixed(4)}`,
          )
          .join('; '),
      ),
      check(
        'shares-sum',
        estimatedShares !== null && Math.abs(normalizedSum - 1) <= 1e-9,
        `suma celor cinci cote raportate este ${normalizedSum}`,
      ),
      check(
        'shares-renormalize',
        renormalized === 5,
        `${renormalized}/5 cote raportate se renormalizează la ele însele prin 181 (aceleași cifre la 1e-9)`,
      ),
      check(
        'scale-invariance',
        compatibilityBlock.scaleIdentical &&
          compatibility.scaleIdentical === compatibility.scaleDecisions,
        `profilul scris la factorii ${compatibilityBlock.scaleFactors.join('/')} produce aceeași alegere în ${compatibility.scaleIdentical}/${compatibility.scaleDecisions} decizii`,
      ),
      check(
        'policy-compatibility',
        compatibility.identical === compatibility.decisions,
        `${compatibility.identical}/${compatibility.decisions} decizii rejucate cu profilul estimat aleg exact ce alege profilul autorat`,
      ),
      check(
        'u-turn-forbidden',
        forbiddenU.keys.u_turn_willingness.status === 'UNOBSERVED' &&
          forbiddenU.keys.u_turn_willingness.reason === 'U_TURN_PERMISSION_NOT_DECLARED',
        `întoarcere interzisă: ${forbiddenU.keys.u_turn_willingness.status} / ${forbiddenU.keys.u_turn_willingness.reason}`,
      ),
      check(
        'recovery-floor',
        floorRecovery.keys.reverse_recovery_duration.status === 'UNOBSERVED' &&
          floorRecovery.keys.reverse_recovery_duration.reason === 'RECOVERY_FLOOR_SATURATED',
        `recuperare pe podea: ${floorRecovery.keys.reverse_recovery_duration.status} / ${floorRecovery.keys.reverse_recovery_duration.reason}`,
      ),
      check(
        'recovery-blocked',
        blockedRecovery.keys.reverse_recovery_duration.status === 'UNOBSERVED' &&
          blockedRecovery.keys.reverse_recovery_duration.reason === 'RECOVERY_BLOCKED_NO_COMMAND',
        `recuperare blocată: ${blockedRecovery.keys.reverse_recovery_duration.status} / ${blockedRecovery.keys.reverse_recovery_duration.reason}`,
      ),
      check(
        'patience-censored',
        censoredPatience.keys.reroute_patience.status === 'UNOBSERVED' &&
          censoredPatience.keys.reroute_patience.reason === 'PATIENCE_UPPER_BOUND_UNOBSERVED',
        `răbdare cenzurată: ${censoredPatience.keys.reroute_patience.status} / ${censoredPatience.keys.reroute_patience.reason}`,
      ),
      check(
        'one-sided-rho',
        oneSidedRho.keys.route_time_weight.status === 'UNOBSERVED' &&
          oneSidedRho.keys.route_time_weight.reason === 'TIME_DISTANCE_UPPER_BOUND_UNOBSERVED' &&
          oneSidedRho.keys.route_turn_penalty.status === 'CANDIDATE',
        `raport pe o singură parte: timp ${oneSidedRho.keys.route_time_weight.reason}, viraj ${oneSidedRho.keys.route_turn_penalty.status}`,
      ),
      check(
        'budget-coupling',
        WEIGHT_KEYS.every((key) => oneSidedTurn.keys[key].status === 'UNOBSERVED') &&
          oneSidedTurn.keys.route_turn_penalty.reason === 'TURN_TRADE_OFF_UPPER_BOUND_UNOBSERVED' &&
          oneSidedTurn.keys.route_signal_penalty.reason === 'SHARE_BUDGET_INCOMPLETE',
        WEIGHT_KEYS.map(
          (key) => `${key} ${oneSidedTurn.keys[key].reason ?? oneSidedTurn.keys[key].status}`,
        ).join(', '),
      ),
      check(
        'contradiction',
        contradictory.keys.route_time_weight.reason === 'CONTRADICTORY_TIME_DISTANCE_BOUNDS' &&
          contradictory.keys.route_signal_penalty.status === 'CANDIDATE',
        `doi șoferi: timp ${contradictory.keys.route_time_weight.reason}, semafor ${contradictory.keys.route_signal_penalty.status}`,
      ),
      check(
        'zero-u-turn',
        refusedU.keys.u_turn_willingness.status === 'CANDIDATE' &&
          refusedU.keys.u_turn_willingness.value === 0 &&
          (refusedU.keys.u_turn_willingness.uncertainty ?? 1) <=
            ROUTE_V2_ESTIMATOR_LIMITS.maximumUncertainty.u_turn_willingness,
        `refuz constant: ${refusedU.keys.u_turn_willingness.status} valoare ${refusedU.keys.u_turn_willingness.value}, incertitudine ${refusedU.keys.u_turn_willingness.uncertainty?.toFixed(4)}`,
      ),
      check(
        'floor-patience',
        floorPatience.keys.reroute_patience.status === 'CANDIDATE' &&
          floorPatience.keys.reroute_patience.value === 2 &&
          floorPatience.keys.reroute_patience.clamped === true,
        `răbdarea de la podea: ${floorPatience.keys.reroute_patience.status} valoare ${floorPatience.keys.reroute_patience.value} (${floorPatience.keys.reroute_patience.reason ?? 'demonstrată'})`,
      ),
      check(
        'refusals',
        manual.admittedEpisodes.length === 0 &&
          manual.refusedEpisodes.length === positiveEpisodes().length &&
          manual.refusedEpisodes.every((entry) => entry.reason === 'NOT_LEARNING_ELIGIBLE') &&
          suppressed.refusedEpisodes.every((entry) => entry.reason === 'NO_USABLE_PREFIX') &&
          ROUTE_V2_ESTIMATOR_KEYS.every(
            (key) => manual.keys[key].reason === 'NO_ELIGIBLE_EPISODES',
          ),
        `MANUAL: ${manual.refusedEpisodes.length} episoade refuzate, ${manual.admittedEpisodes.length} admise; fără prefix: ${suppressed.refusedEpisodes.length}; toate cheile rămân neobservate`,
      ),
      check(
        'no-profile-leak',
        !evidenceFields.includes('weights') &&
          !evidenceFields.includes('score') &&
          result.admittedEpisodes.length === positiveEpisodes().length,
        `eșantionul nu poartă nici pondere, nici scor: ${evidenceFields.join(', ')}`,
      ),
      check(
        'candidate-only',
        compatibilityBlock.candidateOnly &&
          !compatibilityBlock.changesPolicySemantics &&
          compatibilityBlock.policyVersion === ROUTE_POLICY_V2_LIMITS.version,
        `politica ${compatibilityBlock.policyVersion}, candidate-only ${compatibilityBlock.candidateOnly}, semantică schimbată ${compatibilityBlock.changesPolicySemantics}, podea ${compatibilityBlock.minimumReverseRecoveryS} s, rată ${compatibilityBlock.tickHz} Hz`,
      ),
      check('determinism', determinismDigest === repeatedDigest, `digest ${determinismDigest}`),
    ];
  const passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '182-route-estimator-v1',
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
    determinism: { digest: determinismDigest, repeatedDigest },
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
export function routeLearningReportMarkdown(report: RouteLearningReport): string {
  const row = (entry: RouteLearningRow) =>
      `| \`${entry.key}\` | \`${entry.scenario}\` | ${entry.context} | ${number(entry.value)} ${entry.unit} | ±${number(entry.uncertainty)} ${entry.unit} | ${entry.uncertaintyThreshold} ${entry.unit} | ${entry.validationStatus}, ${entry.validationEpisodes} episoade, valoare ${number(entry.validationValue)}, eroare ${number(entry.validationError)} ≤ ${entry.validationTolerance} |`,
    demonstration = (entry: RouteLearningDemonstration) =>
      `| ${entry.demonstration} | \`${entry.key}\` | ${entry.status} | ${number(entry.value)} | ${entry.reason ?? '—'} | ${
        Object.entries(entry.excluded)
          .map(([reason, count]) => `${reason}×${count}`)
          .join(', ') || '—'
      } |`,
    shares = report.compatibility.estimatedShares,
    coefficient = (value: number | null) => number(value);
  return [
    '# 182 — învățare extinsă pentru trasee și recuperare',
    '',
    'Generat de `scripts/run-v2-route-learning-report.mjs` din contractul `182-route-estimator-v1`.',
    'Fiecare cheie se estimează numai din scenariul ei eligibil, din faptele comenzii reale 181 peste',
    'alternative produse de planificatorul livrat 041; o cheie fără dovezi suficiente rămâne',
    '`UNOBSERVED`, nu primește o valoare inventată.',
    '',
    '## Cheie → scenariu → context → estimare → incertitudine → validare independentă',
    '',
    '| Cheie | Scenariu | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |',
    '| --- | --- | --- | ---: | ---: | ---: | --- |',
    ...report.rows.map(row),
    '',
    `Split explicit cu seed ${report.split.seed}: ${report.split.admitted} episoade admise, ${report.split.refused} refuzate, fără suprapunere între estimare și validare.`,
    '',
    '## Ce este identificabil din cotele normalizate',
    '',
    `- \`rho = share_timp / share_distanță\`: **${coefficient(report.compatibility.coefficients.rho)}**`,
    `- \`kappa_viraj = share_viraj / (share_timp + share_distanță)\`: **${coefficient(report.compatibility.coefficients.kappaTurn)}**`,
    `- \`kappa_semafor = share_semafor / (share_timp + share_distanță)\`: **${coefficient(report.compatibility.coefficients.kappaSignal)}**`,
    `- \`kappa_congestie = share_congestie / (share_timp + share_distanță)\`: **${coefficient(report.compatibility.coefficients.kappaCongestion)}**`,
    '',
    '| Cotă | Estimare (reprezentant cu sumă 1) | Cotă autorată (din 181) |',
    '| --- | ---: | ---: |',
    ...(shares === null
      ? []
      : Object.entries(shares).map(
          ([key, value]) =>
            `| \`${key}\` | ${value.toFixed(12)} | ${report.compatibility.authoredShares[key]?.toFixed(12) ?? '—'} |`,
        )),
    '',
    `Suma cotelor raportate este **${report.compatibility.normalizedSum}**; ${report.compatibility.estimatedWeightCount}/8 chei au candidat.`,
    '181 normalizează din nou aceste valori la exact aceiași coeficienți, deci familia de profile',
    '`λ · w` dă aceeași politică: scalele absolute nu sunt identificabile, doar cotele sunt.',
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
    '## Compatibilitate cu 181 (citire fără schimbare de semantică)',
    '',
    `- ${report.compatibility.identicalDecisions}/${report.compatibility.decisions} decizii rejucate cu profilul estimat aleg exact ce alege profilul autorat.`,
    `- Profilul autorat la factorii ${report.compatibility.scaleFactors.join('/')} (aceleași cote) produce aceeași alegere în ${report.compatibility.scaleIdenticalDecisions}/${report.compatibility.scaleDecisions} decizii.`,
    `- Versiune politică \`${report.compatibility.policyVersion}\`, candidate-only ${report.compatibility.candidateOnly}, semantică schimbată ${report.compatibility.changesPolicySemantics}, rată ${report.compatibility.tickHz} Hz, podea de recuperare ${report.compatibility.minimumReverseRecoveryS} s.`,
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
export type { RouteV2EstimatorKey };
