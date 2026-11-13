import { PICKUP_POLICY_V2_LIMITS } from '../../src/autonomy';
import {
  PICKUP_V2_ESTIMATOR_KEYS,
  PICKUP_V2_ESTIMATOR_LIMITS,
  estimatePickupV2Style,
} from '../../src/learning/pickup-v2-estimator';
import type {
  PickupV2EstimatorKey,
  PickupV2EstimatorResult,
  PickupV2KeyEstimate,
} from '../../src/learning/pickup-v2-estimator';
import { getParameterDefinition } from '../../src/profiles';
import { evaluate } from '../autonomy/pickup-policy-v2-reference';
import {
  beyondZoneEpisodes,
  civilOnlyDropoffEpisodes,
  dwellFloorEpisodes,
  dwellHiddenByMEpisodes,
  inertScaleEpisodes,
  keyEpisodes,
  kindMismatchEpisodes,
  manualEpisodes,
  narrowBayEpisodes,
  occupiedAdhesionEpisodes,
  occupiedComfortEpisodes,
  occupiedLateralAdhesionEpisodes,
  pickupMValuesByKey,
  positiveEpisodes,
  precisionAtCapEpisodes,
  precisionCapEpisodes,
  realPickupFacts,
  structuralZeroApproachEpisodes,
  taxiRefusedEpisodes,
  tightWindowEpisodes,
  tinyEpisodes,
  unusablePrefixEpisodes,
} from './pickup-v2-estimator-reference';

export interface PickupLearningCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface PickupLearningRow {
  readonly key: PickupV2EstimatorKey;
  readonly scenario: PickupV2KeyEstimate['scenario'];
  readonly unit: string;
  readonly context: string;
  readonly status: PickupV2KeyEstimate['status'];
  readonly value: number | null;
  readonly uncertainty: number | null;
  readonly uncertaintyThreshold: number;
  readonly estimateEpisodes: number;
  readonly validationEpisodes: number;
  readonly validationStatus: PickupV2KeyEstimate['validation']['status'];
  readonly validationValue: number | null;
  readonly validationError: number | null;
  readonly validationTolerance: number;
  readonly reason: string | null;
}
export interface PickupLearningUnobserved {
  readonly key: PickupV2EstimatorKey;
  readonly scenario: PickupV2KeyEstimate['scenario'];
  readonly demonstration: string;
  readonly status: PickupV2KeyEstimate['status'];
  readonly value: number | null;
  readonly uncertainty: number | null;
  readonly reason: string | null;
  readonly excluded: Readonly<Record<string, number>>;
  readonly validationStatus: PickupV2KeyEstimate['validation']['status'];
}
export interface PickupLearningCompatibility {
  readonly policyVersion: '185-pickup-policy-v2';
  readonly candidateOnly: boolean;
  readonly changesPolicySemantics: boolean;
  readonly tickHz: number;
  readonly boardingDwellS: number;
  readonly minimumCurbClearanceM: number;
  readonly physicalPositionToleranceM: number;
  readonly pickupZoneId: string;
  readonly dropoffZoneId: string;
  readonly bayLengthM: number;
  readonly stopOffsetM: number;
  readonly curbBandM: number;
  readonly curbMinimumM: number;
  readonly curbMaximumM: number;
  readonly approachDistanceM: number;
  readonly approachFeasibleMps: number;
  readonly approachCommandedMps: number;
  readonly approachStoppingDistanceM: number;
  readonly approachProjectedStopOffsetM: number;
  readonly curbEffectiveM: number;
  readonly precisionEffectiveM: number;
  readonly precisionWindowFromM: number;
  readonly precisionWindowToM: number;
  readonly dwellEffectiveS: number;
  readonly dwellMinimumS: number;
  readonly dropoffApproachMps: number;
  readonly dropoffCurbM: number;
  readonly accelerationCommandedMps2: number;
  readonly accelerationBaseMps2: number;
  readonly accelerationCap: string;
  readonly lateralCommandedMps2: number;
  readonly lateralBaseMps2: number;
  readonly lateralCap: string;
}
export interface PickupLearningReport {
  readonly version: '186-pickup-estimator-v1';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly rows: readonly PickupLearningRow[];
  readonly unobserved: readonly PickupLearningUnobserved[];
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
  readonly compatibility: PickupLearningCompatibility;
  readonly determinism: {
    readonly seed: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly PickupLearningCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
    readonly candidateKeys: number;
    readonly unobservedKeys: number;
  };
}

const seed = 186;
/**
 * Scattered demonstration values, one per episode and all distinct: whatever pair the deterministic
 * split keeps for the estimate, the measured dispersion exceeds the per-key threshold. Every value
 * stays inside the catalog and inside the context the key needs (above the dwell floor, inside the
 * curb band, under every cap).
 */
const noisyValues: Readonly<Record<PickupV2EstimatorKey, readonly number[]>> = Object.freeze({
  pickup_approach_speed: [2, 2.8, 3.6, 4.4],
  pickup_curb_distance: [0.3, 0.6, 0.9, 1.2],
  pickup_stop_precision: [0.4, 0.85, 1.3, 1.75],
  pickup_dwell_time: [3.2, 4.1, 5, 5.9],
  dropoff_approach_speed: [2, 2.8, 3.6, 4.4],
  dropoff_curb_distance: [0.3, 0.6, 0.9, 1.2],
  occupied_acceleration_scale: [0.4, 0.7, 1, 1.3],
  occupied_lateral_accel_scale: [0.3, 0.53, 0.76, 0.99],
});

const scenarios = {
  positive: positiveEpisodes(),
  pickupApproach: keyEpisodes('pickup_approach_speed'),
  pickupCurb: keyEpisodes('pickup_curb_distance'),
  pickupPrecision: keyEpisodes('pickup_stop_precision'),
  pickupDwell: keyEpisodes('pickup_dwell_time'),
  dropoffApproach: keyEpisodes('dropoff_approach_speed'),
  dropoffCurb: keyEpisodes('dropoff_curb_distance'),
  occupiedAcceleration: keyEpisodes('occupied_acceleration_scale'),
  occupiedLateral: keyEpisodes('occupied_lateral_accel_scale'),
  approachSaturated: keyEpisodes('pickup_approach_speed', [8, 8, 8, 8]),
  structuralZero: structuralZeroApproachEpisodes(),
  curbFloor: keyEpisodes('pickup_curb_distance', [0.1, 0.1, 0.1, 0.1]),
  curbBand: keyEpisodes('pickup_curb_distance', [2, 2, 2, 2]),
  precisionCap: precisionCapEpisodes(),
  precisionAtCap: precisionAtCapEpisodes(),
  dwellFloor: dwellFloorEpisodes(),
  dwellMFloor: dwellHiddenByMEpisodes(),
  occupiedComfort: occupiedComfortEpisodes(),
  occupiedAdhesion: occupiedAdhesionEpisodes(),
  lateralAdhesion: occupiedLateralAdhesionEpisodes(),
  inert: inertScaleEpisodes(),
  taxiRefused: taxiRefusedEpisodes(),
  civilDropoff: civilOnlyDropoffEpisodes(),
  kindMismatch: kindMismatchEpisodes(),
  beyond: beyondZoneEpisodes(),
  narrow: narrowBayEpisodes(),
  tight: tightWindowEpisodes(),
  minApproach: keyEpisodes('pickup_approach_speed', [0.5, 0.5, 0.5, 0.5]),
  minPrecision: keyEpisodes('pickup_stop_precision', [0.2, 0.2, 0.2, 0.2]),
  minAcceleration: keyEpisodes('occupied_acceleration_scale', [0.3, 0.3, 0.3, 0.3]),
  curbFloorValue: keyEpisodes('pickup_curb_distance', [0.15, 0.15, 0.15, 0.15]),
  manual: manualEpisodes(),
  unusablePrefix: unusablePrefixEpisodes(),
  tiny: tinyEpisodes(),
  empty: [],
} as const satisfies Readonly<Record<string, readonly unknown[]>>;

function runSet(name: keyof typeof scenarios): PickupV2EstimatorResult {
  return estimatePickupV2Style({ episodes: scenarios[name], splitSeed: seed });
}
function digest(result: PickupV2EstimatorResult): string {
  const text = JSON.stringify(result);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): PickupLearningCheck {
  return Object.freeze({ id, pass, detail });
}
function row(entry: PickupV2KeyEstimate): PickupLearningRow {
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
  key: PickupV2EstimatorKey,
  demonstration: string,
  result: PickupV2EstimatorResult,
): PickupLearningUnobserved {
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

export function runPickupV2EstimatorReport(): PickupLearningReport {
  const positive = runSet('positive'),
    pickupApproach = runSet('pickupApproach'),
    pickupCurb = runSet('pickupCurb'),
    pickupPrecision = runSet('pickupPrecision'),
    pickupDwell = runSet('pickupDwell'),
    dropoffApproach = runSet('dropoffApproach'),
    dropoffCurb = runSet('dropoffCurb'),
    occupiedAcceleration = runSet('occupiedAcceleration'),
    occupiedLateral = runSet('occupiedLateral'),
    approachSaturated = runSet('approachSaturated'),
    structuralZero = runSet('structuralZero'),
    curbFloor = runSet('curbFloor'),
    curbBand = runSet('curbBand'),
    precisionCap = runSet('precisionCap'),
    precisionAtCap = runSet('precisionAtCap'),
    dwellFloor = runSet('dwellFloor'),
    dwellMFloor = runSet('dwellMFloor'),
    occupiedComfort = runSet('occupiedComfort'),
    occupiedAdhesion = runSet('occupiedAdhesion'),
    lateralAdhesion = runSet('lateralAdhesion'),
    inert = runSet('inert'),
    taxiRefused = runSet('taxiRefused'),
    civilDropoff = runSet('civilDropoff'),
    kindMismatch = runSet('kindMismatch'),
    beyond = runSet('beyond'),
    narrow = runSet('narrow'),
    tight = runSet('tight'),
    minApproach = runSet('minApproach'),
    minPrecision = runSet('minPrecision'),
    minAcceleration = runSet('minAcceleration'),
    curbFloorValue = runSet('curbFloorValue'),
    manualSet = runSet('manual'),
    unusablePrefix = runSet('unusablePrefix'),
    tinySet = runSet('tiny'),
    empty = runSet('empty'),
    duplicates = estimatePickupV2Style({
      splitSeed: seed,
      episodes: [...manualEpisodes(), positiveEpisodes()[0]!, positiveEpisodes()[0]!],
    }),
    noiseSets = Object.fromEntries(
      PICKUP_V2_ESTIMATOR_KEYS.map((key) => [
        key,
        estimatePickupV2Style({
          splitSeed: seed,
          episodes: keyEpisodes(key, noisyValues[key], { idPrefix: `noisy-${key}` }),
        }),
      ]),
    ) as Record<PickupV2EstimatorKey, PickupV2EstimatorResult>,
    parameters = PICKUP_V2_ESTIMATOR_KEYS.map((key) => {
      const definition = getParameterDefinition(key);
      return {
        key,
        unit: definition.unit,
        minimum: definition.min,
        maximum: definition.max,
        defaultValue: definition.default,
      };
    }),
    rows = PICKUP_V2_ESTIMATOR_KEYS.map((key) => row(positive.keys[key])),
    unobservedRows = [
      unobservedRow(
        'pickup_approach_speed',
        'cheie de 8 m/s pe apropierea reală de 7,75 m: plafonul cinematic de 5,567764 m/s o taie',
        approachSaturated,
      ),
      unobservedRow(
        'pickup_approach_speed',
        'ego oprit exact pe punctul marcat: plafonul este 0 m/s, un zero structural, nu o preferință',
        structuralZero,
      ),
      unobservedRow(
        'pickup_curb_distance',
        'cheie de 0,10 m sub rezerva de caroserie: comanda este podeaua de 0,15 m',
        curbFloor,
      ),
      unobservedRow(
        'pickup_curb_distance',
        'cheie de 2 m pe bay-ul real de 3,00 m: plafonul sedanului este 1,20 m',
        curbBand,
      ),
      unobservedRow(
        'pickup_stop_precision',
        'cheie de 1 m pe un punct marcat la 0,50 m de margine: plafonul este 0,50 m',
        precisionCap,
      ),
      unobservedRow(
        'pickup_dwell_time',
        'cheie de 1 s sub dovada de îmbarcare de 3 s: comanda este podeaua',
        dwellFloor,
      ),
      unobservedRow(
        'pickup_dwell_time',
        'cheie de 3 s sub un M `stop_dwell_time` de 4 s: podeaua M urcă la 4 s',
        dwellMFloor,
      ),
      unobservedRow(
        'occupied_acceleration_scale',
        'cheie de 1,5 cu `desired_acceleration` 1,5: confortul taie cererea de 2,25 m/s² la 2 m/s²',
        occupiedComfort,
      ),
      unobservedRow(
        'occupied_acceleration_scale',
        'cheie de 1,5 pe `reduced-adhesion` cu `desired` 4: anvelopa taie la 4,46355 m/s²',
        occupiedAdhesion,
      ),
      unobservedRow(
        'occupied_lateral_accel_scale',
        'cheie de 1,5 pe `reduced-adhesion` cu `curve_lateral_accel` 8: anvelopa taie la 4,46355 m/s²',
        lateralAdhesion,
      ),
      unobservedRow(
        'occupied_acceleration_scale',
        'cabină goală (`TO_PICKUP`): scara longitudinală este inertă',
        inert,
      ),
      unobservedRow(
        'occupied_lateral_accel_scale',
        'cabină goală (`TO_PICKUP`): scara laterală este inertă',
        inert,
      ),
      unobservedRow(
        'pickup_approach_speed',
        'zonă reală cu accesul TAXI refuzat: refuzul ascunde toate cele patru preferințe de pickup',
        taxiRefused,
      ),
      unobservedRow(
        'pickup_curb_distance',
        'zonă reală cu accesul TAXI refuzat: refuzul ascunde toate cele patru preferințe de pickup',
        taxiRefused,
      ),
      unobservedRow(
        'pickup_stop_precision',
        'zonă reală cu accesul TAXI refuzat: refuzul ascunde toate cele patru preferințe de pickup',
        taxiRefused,
      ),
      unobservedRow(
        'pickup_dwell_time',
        'zonă reală cu accesul TAXI refuzat: refuzul ascunde toate cele patru preferințe de pickup',
        taxiRefused,
      ),
      unobservedRow(
        'dropoff_curb_distance',
        'zona reală `sz:2-2`, numai CIVIL: cele două preferințe de dropoff sunt ascunse',
        civilDropoff,
      ),
      unobservedRow(
        'dropoff_approach_speed',
        'fază DROPOFF pe o zonă autorată PICKUP: tipul zonei refuză oprirea',
        kindMismatch,
      ),
      unobservedRow(
        'pickup_approach_speed',
        'ego la 3,00 m după punctul marcat, deci după ieșirea din bay',
        beyond,
      ),
      unobservedRow(
        'pickup_curb_distance',
        'bay de 1,90 m, mai îngust decât ecartamentul plus rezerva de 0,15 m',
        narrow,
      ),
      unobservedRow(
        'pickup_stop_precision',
        'punct marcat la 0,02 m de marginea bay-ului: nicio toleranță admisibilă nu încape',
        tight,
      ),
      unobservedRow('pickup_curb_distance', 'demonstrații MANUAL, neeligibile', manualSet),
      unobservedRow('pickup_curb_distance', 'demonstrații fără prefix utilizabil', unusablePrefix),
      unobservedRow('pickup_curb_distance', 'set fără episoade', empty),
    ],
    values = Object.fromEntries(
      PICKUP_V2_ESTIMATOR_KEYS.map((key) => [key, positive.keys[key].value!]),
    ) as Record<PickupV2EstimatorKey, number>,
    facts = realPickupFacts(),
    pickupApproachDistanceM = 5 + facts.pickup.stopOffsetM,
    approachCommand = evaluate(
      {
        name: 'compatibilitate apropiere',
        description: 'apropierea reală de pickup la viteza estimată',
        speedMps: 3,
        rideState: 'TO_PICKUP',
        service: {
          zoneId: facts.pickup.zoneId,
          zoneKind: facts.pickup.kind,
          phase: 'PICKUP',
          taxiAccess: facts.pickup.taxiAccess,
          distanceToStopM: pickupApproachDistanceM,
          lengthM: facts.pickup.lengthM,
          stopOffsetM: facts.pickup.stopOffsetM,
          curbBandM: facts.pickup.curbBandM,
          curbDistanceM: 0.5,
        },
      },
      { rValues: values },
    ).command,
    curbCommand = evaluate(
      {
        name: 'compatibilitate bordură',
        description: 'oprire pe punctul marcat, cu preferința de bordură estimată',
        speedMps: 0,
        rideState: 'TO_PICKUP',
        service: {
          zoneId: facts.pickup.zoneId,
          zoneKind: facts.pickup.kind,
          phase: 'PICKUP',
          taxiAccess: facts.pickup.taxiAccess,
          distanceToStopM: 0,
          lengthM: facts.pickup.lengthM,
          stopOffsetM: facts.pickup.stopOffsetM,
          curbBandM: facts.pickup.curbBandM,
          curbDistanceM: values.pickup_curb_distance,
        },
      },
      { rValues: values },
    ).command,
    dropoffCommand = evaluate(
      {
        name: 'compatibilitate dropoff',
        description: 'apropierea reală de dropoff, cu pasager la bord',
        speedMps: 3,
        rideState: 'TO_DROPOFF',
        service: {
          zoneId: facts.dropoff.zoneId,
          zoneKind: facts.dropoff.kind,
          phase: 'DROPOFF',
          taxiAccess: facts.dropoff.taxiAccess,
          distanceToStopM: 5 + facts.dropoff.stopOffsetM,
          lengthM: facts.dropoff.lengthM,
          stopOffsetM: facts.dropoff.stopOffsetM,
          curbBandM: facts.dropoff.curbBandM,
          curbDistanceM: 0.5,
        },
      },
      { rValues: values },
    ).command,
    accelerationCommand = evaluate(
      {
        name: 'compatibilitate accelerație ocupată',
        description: 'pasager la bord, fără serviciu',
        speedMps: 5,
        rideState: 'TO_DROPOFF',
      },
      { rValues: values },
    ).command,
    lateralCommand = evaluate(
      {
        name: 'compatibilitate lateral ocupat',
        description: 'pasager la bord, fără serviciu, pe preferința M a familiei laterale',
        speedMps: 5,
        rideState: 'TO_DROPOFF',
      },
      {
        rValues: values,
        mValues: pickupMValuesByKey.occupied_lateral_accel_scale,
      },
    ).command,
    rejectedInvalid = (() => {
      const episode = positiveEpisodes()[0]!;
      try {
        estimatePickupV2Style({
          splitSeed: seed,
          episodes: [
            {
              ...episode,
              samples: [
                { ...episode.samples[0]!, approachCommandedMps: Number.NaN },
                ...episode.samples.slice(1),
              ],
            },
          ],
        });
        return false;
      } catch (error) {
        return error instanceof Error && /pickup evidence/i.test(error.message);
      }
    })(),
    checks: PickupLearningCheck[] = [
      check(
        'contexts-eight-distinct',
        PICKUP_V2_ESTIMATOR_KEYS.length === 8 &&
          new Set(PICKUP_V2_ESTIMATOR_KEYS.map((key) => positive.keys[key].scenario)).size === 8 &&
          Object.values(positive.keys).every((entry) => entry.eligibleContext.length > 80),
        `opt chei și opt scenarii distincte: ${PICKUP_V2_ESTIMATOR_KEYS.map(
          (key) => `${key}=${positive.keys[key].scenario}`,
        ).join(', ')}`,
      ),
      check(
        'scenario-pickup-approach',
        pickupApproach.keys.pickup_approach_speed.status === 'CANDIDATE' &&
          near(pickupApproach.keys.pickup_approach_speed.value, 3, 1e-9) &&
          pickupApproach.keys.dropoff_approach_speed.status === 'UNOBSERVED' &&
          pickupApproach.keys.dropoff_curb_distance.status === 'UNOBSERVED' &&
          pickupApproach.keys.occupied_acceleration_scale.status === 'UNOBSERVED',
        `apropiere reală de 7,75 m: ${number(
          pickupApproach.keys.pickup_approach_speed.value,
        )} m/s; faza de dropoff și scările rămân neobservate`,
      ),
      check(
        'scenario-pickup-curb',
        pickupCurb.keys.pickup_curb_distance.status === 'CANDIDATE' &&
          near(pickupCurb.keys.pickup_curb_distance.value, 0.5, 1e-9) &&
          pickupCurb.keys.dropoff_curb_distance.status === 'UNOBSERVED',
        `oprit pe punctul marcat: bordură ${number(
          pickupCurb.keys.pickup_curb_distance.value,
        )} m; a doua preferință de bordură rămâne neobservată`,
      ),
      check(
        'scenario-pickup-precision',
        pickupPrecision.keys.pickup_stop_precision.status === 'CANDIDATE' &&
          near(pickupPrecision.keys.pickup_stop_precision.value, 1, 1e-9) &&
          pickupPrecision.keys.occupied_lateral_accel_scale.status === 'UNOBSERVED',
        `fereastră marcată de 2,75 m: toleranță ${number(
          pickupPrecision.keys.pickup_stop_precision.value,
        )} m`,
      ),
      check(
        'scenario-pickup-dwell',
        pickupDwell.keys.pickup_dwell_time.status === 'CANDIDATE' &&
          near(pickupDwell.keys.pickup_dwell_time.value, 5, 1e-9) &&
          pickupDwell.keys.dropoff_approach_speed.status === 'UNOBSERVED',
        `peste podeaua de 3 s: staționare ${number(pickupDwell.keys.pickup_dwell_time.value)} s`,
      ),
      check(
        'scenario-dropoff-approach',
        dropoffApproach.keys.dropoff_approach_speed.status === 'CANDIDATE' &&
          near(dropoffApproach.keys.dropoff_approach_speed.value, 3, 1e-9) &&
          dropoffApproach.keys.pickup_approach_speed.status === 'UNOBSERVED',
        `apropiere de dropoff ${number(
          dropoffApproach.keys.dropoff_approach_speed.value,
        )} m/s; preferințele de pickup rămân neobservate`,
      ),
      check(
        'scenario-dropoff-curb',
        dropoffCurb.keys.dropoff_curb_distance.status === 'CANDIDATE' &&
          near(dropoffCurb.keys.dropoff_curb_distance.value, 0.5, 1e-9) &&
          dropoffCurb.keys.pickup_curb_distance.status === 'UNOBSERVED',
        `bordură de dropoff ${number(
          dropoffCurb.keys.dropoff_curb_distance.value,
        )} m; bordură de pickup neobservată`,
      ),
      check(
        'scenario-occupied-acceleration',
        occupiedAcceleration.keys.occupied_acceleration_scale.status === 'CANDIDATE' &&
          near(occupiedAcceleration.keys.occupied_acceleration_scale.value, 0.85, 1e-9) &&
          occupiedAcceleration.keys.pickup_approach_speed.status === 'UNOBSERVED',
        `pasager la bord, fără serviciu: scară ${number(
          occupiedAcceleration.keys.occupied_acceleration_scale.value,
        )}; niciun fapt de oprire`,
      ),
      check(
        'scenario-occupied-lateral',
        occupiedLateral.keys.occupied_lateral_accel_scale.status === 'CANDIDATE' &&
          near(occupiedLateral.keys.occupied_lateral_accel_scale.value, 0.85, 1e-9) &&
          occupiedLateral.keys.dropoff_curb_distance.status === 'UNOBSERVED',
        `același pasager, canalul lateral: scară ${number(
          occupiedLateral.keys.occupied_lateral_accel_scale.value,
        )}`,
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
        PICKUP_V2_ESTIMATOR_KEYS.every(
          (key) =>
            noiseSets[key].keys[key].status === 'UNOBSERVED' &&
            noiseSets[key].keys[key].reason === 'UNCERTAINTY_ABOVE_THRESHOLD' &&
            noiseSets[key].keys[key].uncertainty !== null &&
            noiseSets[key].keys[key].uncertainty! > noiseSets[key].keys[key].uncertaintyThreshold,
        ),
        PICKUP_V2_ESTIMATOR_KEYS.map(
          (key) =>
            `${key} ±${number(noiseSets[key].keys[key].uncertainty)} > ${noiseSets[key].keys[key].uncertaintyThreshold}`,
        ).join(', '),
      ),
      check(
        'validation-split',
        rows.every(
          (entry) =>
            entry.validationStatus === 'VALIDATED' &&
            entry.validationEpisodes >= PICKUP_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes &&
            entry.estimateEpisodes >= PICKUP_V2_ESTIMATOR_LIMITS.minimumEstimateEpisodes,
        ),
        `seed ${seed}: fiecare cheie se validează pe episoade ținute deoparte (${rows
          .map((entry) => `${entry.key} ${entry.estimateEpisodes}+${entry.validationEpisodes}`)
          .join(', ')})`,
      ),
      check(
        'validation-too-small',
        tinySet.keys.pickup_curb_distance.status === 'CANDIDATE' &&
          tinySet.keys.pickup_curb_distance.validation.status === 'TOO_SMALL' &&
          tinySet.keys.pickup_curb_distance.validation.episodes === 1,
        `trei episoade lasă ${tinySet.keys.pickup_curb_distance.validation.episodes} episod de validare, raportat ${tinySet.keys.pickup_curb_distance.validation.status}`,
      ),
      check(
        'low-band-is-honest',
        near(minApproach.keys.pickup_approach_speed.value, 0.5, 1e-9) &&
          near(minPrecision.keys.pickup_stop_precision.value, 0.2, 1e-9) &&
          near(minAcceleration.keys.occupied_acceleration_scale.value, 0.3, 1e-9) &&
          near(curbFloorValue.keys.pickup_curb_distance.value, 0.15, 1e-9) &&
          curbFloor.keys.pickup_curb_distance.reason === 'CURB_DISTANCE_FLOOR_SATURATED' &&
          dwellFloor.keys.pickup_dwell_time.reason === 'PICKUP_DWELL_FLOOR_SATURATED',
        'minimul catalogului rămâne candidat demonstrat (0,5 m/s, 0,2 m, 0,3), iar benzile ascunse de podea sunt raportate saturate, nu ca valori',
      ),
      check(
        'structural-zero-not-a-preference',
        structuralZero.keys.pickup_approach_speed.status === 'UNOBSERVED' &&
          structuralZero.keys.pickup_approach_speed.value === null &&
          structuralZero.keys.pickup_approach_speed.reason === 'PICKUP_APPROACH_SPEED_SATURATED',
        'un plafon de 0 m/s la punctul marcat este structural: nu devine o preferință de 0 m/s',
      ),
      check(
        'refusal-taxi-masks-four',
        [
          'pickup_approach_speed',
          'pickup_curb_distance',
          'pickup_stop_precision',
          'pickup_dwell_time',
        ].every(
          (key) =>
            taxiRefused.keys[key as PickupV2EstimatorKey].status === 'UNOBSERVED' &&
            taxiRefused.keys[key as PickupV2EstimatorKey].value === null &&
            taxiRefused.keys[key as PickupV2EstimatorKey].reason ===
              'PREFERENCE_MASKED_BY_ZONE_ACCESS' &&
            taxiRefused.keys[key as PickupV2EstimatorKey].excluded.ZONE_NOT_TAXI === 4,
        ) && approachSaturated.keys.pickup_approach_speed.status === 'UNOBSERVED',
        'accesul TAXI refuzat lasă neobservate simultan toate cele patru preferințe de pickup, deși comanda 185 raportează în continuare un număr pe tick-ul blocat',
      ),
      check(
        'refusal-civil-only-dropoff',
        civilDropoff.keys.dropoff_curb_distance.reason === 'PREFERENCE_MASKED_BY_ZONE_ACCESS' &&
          civilDropoff.keys.dropoff_approach_speed.reason === 'PREFERENCE_MASKED_BY_ZONE_ACCESS' &&
          civilDropoff.keys.dropoff_curb_distance.excluded.ZONE_NOT_TAXI === 4,
        'zona reală `sz:2-2` fără TAXI ascunde ambele preferințe de dropoff',
      ),
      check(
        'refusal-kind-mismatch',
        kindMismatch.keys.dropoff_approach_speed.reason === 'PREFERENCE_MASKED_BY_ZONE_KIND' &&
          kindMismatch.keys.dropoff_curb_distance.reason === 'PREFERENCE_MASKED_BY_ZONE_KIND',
        'o fază de dropoff pe o zonă PICKUP este refuzată de tipul zonei, nu de preferință',
      ),
      check(
        'refusal-beyond-zone',
        beyond.keys.pickup_approach_speed.reason === 'PREFERENCE_MASKED_BY_BEYOND_ZONE' &&
          beyond.keys.pickup_curb_distance.excluded.STOP_BEYOND_ZONE === 4,
        'un ego după ieșirea din bay nu demonstrează nicio preferință de oprire',
      ),
      check(
        'refusal-narrow-bay',
        narrow.keys.pickup_curb_distance.reason === 'PREFERENCE_MASKED_BY_NARROW_BAY' &&
          narrow.keys.pickup_curb_distance.excluded.BAY_TOO_NARROW === 4,
        'un bay mai îngust decât ecartamentul plus rezervă refuză oprirea înainte de orice cheie',
      ),
      check(
        'refusal-tight-window',
        tight.keys.pickup_stop_precision.reason === 'PREFERENCE_MASKED_BY_STOP_WINDOW' &&
          tight.keys.pickup_stop_precision.excluded.STOP_WINDOW_TOO_TIGHT === 4,
        'o fereastră de oprire sub toleranța fizică refuză oprirea, deci și precizia',
      ),
      check(
        'precision-cap-ambiguous',
        precisionCap.keys.pickup_stop_precision.status === 'UNOBSERVED' &&
          precisionCap.keys.pickup_stop_precision.value === null &&
          precisionCap.keys.pickup_stop_precision.reason ===
            'PICKUP_STOP_PRECISION_CAP_SATURATED' &&
          near(precisionAtCap.keys.pickup_stop_precision.value, 0.5, 1e-9),
        `cheia de 1 m pe un plafon de 0,5 m rămâne saturată; cheia exact 0,5 m rămâne observabilă (${number(
          precisionAtCap.keys.pickup_stop_precision.value,
        )} m)`,
      ),
      check(
        'curb-both-sides',
        curbFloor.keys.pickup_curb_distance.reason === 'CURB_DISTANCE_FLOOR_SATURATED' &&
          curbBand.keys.pickup_curb_distance.reason === 'CURB_DISTANCE_BAND_SATURATED' &&
          curbFloor.keys.pickup_curb_distance.value === null &&
          curbBand.keys.pickup_curb_distance.value === null,
        'banda autorată este un clamp cu două laturi: podeaua de 0,15 m și plafonul de 1,20 m sunt raportate ca saturații, nu ca valori',
      ),
      check(
        'dwell-floor',
        dwellFloor.keys.pickup_dwell_time.reason === 'PICKUP_DWELL_FLOOR_SATURATED' &&
          dwellMFloor.keys.pickup_dwell_time.reason === 'PICKUP_DWELL_FLOOR_SATURATED' &&
          dwellFloor.keys.pickup_dwell_time.value === null &&
          dwellMFloor.keys.pickup_dwell_time.value === null,
        'podeaua de îmbarcare de 3 s și un M `stop_dwell_time` de 4 s ascund banda de sub ele',
      ),
      check(
        'occupied-comfort-cap',
        occupiedComfort.keys.occupied_acceleration_scale.status === 'UNOBSERVED' &&
          occupiedComfort.keys.occupied_acceleration_scale.value === null &&
          occupiedComfort.keys.occupied_acceleration_scale.reason ===
            'OCCUPIED_ACCELERATION_SCALE_CAP_SATURATED',
        'cheia de 1,5 cere 2,25 m/s², dar confortul comandă 2 m/s²: plafonul nu este estimarea cheii',
      ),
      check(
        'occupied-adhesion-cap',
        occupiedAdhesion.keys.occupied_acceleration_scale.reason ===
          'OCCUPIED_ACCELERATION_SCALE_CAP_SATURATED' &&
          lateralAdhesion.keys.occupied_lateral_accel_scale.reason ===
            'OCCUPIED_LATERAL_ACCEL_SCALE_CAP_SATURATED' &&
          occupiedAdhesion.keys.occupied_acceleration_scale.value === null &&
          lateralAdhesion.keys.occupied_lateral_accel_scale.value === null,
        'pe `reduced-adhesion` anvelopa de 4,46355 m/s² taie înaintea scării, pe ambele canale',
      ),
      check(
        'occupied-inert-without-passenger',
        inert.keys.occupied_acceleration_scale.reason === 'PASSENGER_NOT_ABOARD' &&
          inert.keys.occupied_lateral_accel_scale.reason === 'PASSENGER_NOT_ABOARD' &&
          inert.keys.occupied_acceleration_scale.value === null,
        'fără pasager la bord scara nu se aplică, deci valorile raportate nu sunt dovezi',
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
        positive.groupConstraints.length === 10 &&
          positive.groupConstraints.every(
            (entry) =>
              entry.explanation.length > 120 &&
              entry.keys.every((key) => PICKUP_V2_ESTIMATOR_KEYS.includes(key)),
          ) &&
          positive.groupConstraints.some(
            (entry) => entry.id === 'TAXI_REFUSAL_HIDES_ALL_FOUR_PICKUP_PREFERENCES',
          ) &&
          positive.groupConstraints.some(
            (entry) => entry.id === 'OCCUPIED_SCALES_CAPPED_BY_COMFORT_AND_ADHESION',
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
        near(
          approachCommand.approach?.commandedSpeedMps ?? null,
          values.pickup_approach_speed,
          1e-9,
        ) &&
          near(curbCommand.curb?.effectiveM ?? null, values.pickup_curb_distance, 1e-9) &&
          near(curbCommand.precision?.effectiveM ?? null, values.pickup_stop_precision, 1e-9) &&
          near(curbCommand.dwell?.effectiveS ?? null, values.pickup_dwell_time, 1e-9) &&
          near(
            dropoffCommand.approach?.commandedSpeedMps ?? null,
            values.dropoff_approach_speed,
            1e-9,
          ) &&
          near(dropoffCommand.curb?.effectiveM ?? null, values.dropoff_curb_distance, 1e-9) &&
          near(
            accelerationCommand.passenger.acceleration.commandedMps2,
            values.occupied_acceleration_scale *
              accelerationCommand.passenger.acceleration.baseMps2,
            1e-9,
          ) &&
          accelerationCommand.passenger.acceleration.cappedBy === 'NONE' &&
          near(
            lateralCommand.passenger.lateralAccel.commandedMps2,
            values.occupied_lateral_accel_scale * lateralCommand.passenger.lateralAccel.baseMps2,
            1e-9,
          ) &&
          lateralCommand.passenger.lateralAccel.cappedBy === 'NONE' &&
          approachCommand.approach !== null &&
          approachCommand.approach.commandedSpeedMps <=
            approachCommand.approach.feasibleSpeedMps + 1e-9 &&
          approachCommand.approach.stoppingDistanceM <= pickupApproachDistanceM + 1e-9,
        `185 citește estimarea fără schimbare de semantică: apropiere ${number(
          approachCommand.approach?.commandedSpeedMps ?? null,
        )} m/s, bordură ${number(curbCommand.curb?.effectiveM ?? null)} m, precizie ${number(
          curbCommand.precision?.effectiveM ?? null,
        )} m, staționare ${number(curbCommand.dwell?.effectiveS ?? null)} s, dropoff ${number(
          dropoffCommand.approach?.commandedSpeedMps ?? null,
        )} m/s și ${number(dropoffCommand.curb?.effectiveM ?? null)} m, accelerație ${number(
          accelerationCommand.passenger.acceleration.commandedMps2,
        )} m/s² (${accelerationCommand.passenger.acceleration.cappedBy}), lateral ${number(
          lateralCommand.passenger.lateralAccel.commandedMps2,
        )} m/s² (${lateralCommand.passenger.lateralAccel.cappedBy})`,
      ),
    ],
    passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '186-pickup-estimator-v1',
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
      policyVersion: PICKUP_POLICY_V2_LIMITS.version,
      candidateOnly: positive.compatibility.candidateOnly,
      changesPolicySemantics: positive.compatibility.changesPolicySemantics,
      tickHz: positive.compatibility.tickHz,
      boardingDwellS: positive.compatibility.boardingDwellS,
      minimumCurbClearanceM: positive.compatibility.minimumCurbClearanceM,
      physicalPositionToleranceM: positive.compatibility.physicalPositionToleranceM,
      pickupZoneId: facts.pickup.zoneId,
      dropoffZoneId: facts.dropoff.zoneId,
      bayLengthM: facts.pickup.lengthM,
      stopOffsetM: facts.pickup.stopOffsetM,
      curbBandM: facts.pickup.curbBandM,
      curbMinimumM: curbCommand.curb?.minimumM ?? 0,
      curbMaximumM: curbCommand.curb?.maximumM ?? 0,
      approachDistanceM: pickupApproachDistanceM,
      approachFeasibleMps: approachCommand.approach?.feasibleSpeedMps ?? 0,
      approachCommandedMps: approachCommand.approach?.commandedSpeedMps ?? 0,
      approachStoppingDistanceM: approachCommand.approach?.stoppingDistanceM ?? 0,
      approachProjectedStopOffsetM: approachCommand.approach?.projectedStopOffsetM ?? 0,
      curbEffectiveM: curbCommand.curb?.effectiveM ?? 0,
      precisionEffectiveM: curbCommand.precision?.effectiveM ?? 0,
      precisionWindowFromM: curbCommand.precision?.windowFromM ?? 0,
      precisionWindowToM: curbCommand.precision?.windowToM ?? 0,
      dwellEffectiveS: curbCommand.dwell?.effectiveS ?? 0,
      dwellMinimumS: curbCommand.dwell?.minimumS ?? 0,
      dropoffApproachMps: dropoffCommand.approach?.commandedSpeedMps ?? 0,
      dropoffCurbM: dropoffCommand.curb?.effectiveM ?? 0,
      accelerationCommandedMps2: accelerationCommand.passenger.acceleration.commandedMps2,
      accelerationBaseMps2: accelerationCommand.passenger.acceleration.baseMps2,
      accelerationCap: accelerationCommand.passenger.acceleration.cappedBy,
      lateralCommandedMps2: lateralCommand.passenger.lateralAccel.commandedMps2,
      lateralBaseMps2: lateralCommand.passenger.lateralAccel.baseMps2,
      lateralCap: lateralCommand.passenger.lateralAccel.cappedBy,
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

export function pickupV2EstimatorReportMarkdown(report: PickupLearningReport): string {
  const row = (entry: PickupLearningRow) =>
      `| \`${entry.key}\` | \`${entry.scenario}\` | ${entry.context} | ${number(entry.value)} ${entry.unit} | ±${number(entry.uncertainty)} ${entry.unit} | ${entry.uncertaintyThreshold} ${entry.unit} | ${entry.validationStatus}, ${entry.validationEpisodes} episoade, valoare ${number(entry.validationValue)}, eroare ${number(entry.validationError)} ≤ ${entry.validationTolerance} |`,
    unobserved = (entry: PickupLearningUnobserved) =>
      `| \`${entry.key}\` | \`${entry.scenario}\` | ${entry.demonstration} | ${entry.status} | ${entry.reason ?? '—'} | ${
        Object.entries(entry.excluded)
          .map(([reason, count]) => `${reason}×${count}`)
          .join(', ') || '—'
      } |`;
  return [
    '# 186 — învățare extinsă pentru pickup și confortul pasagerilor',
    '',
    'Generat de `scripts/run-v2-pickup-learning-report.mjs` din contractul `186-pickup-estimator-v1`.',
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
    '## Compatibilitate cu 185',
    '',
    `- Zonele reale: pickup \`${report.compatibility.pickupZoneId}\`, dropoff \`${report.compatibility.dropoffZoneId}\`; bay de **${number(report.compatibility.bayLengthM, 2)} m**, punct marcat la ${number(report.compatibility.stopOffsetM, 2)} m, adâncime ${number(report.compatibility.curbBandM, 2)} m.`,
    `- Apropiere: **${number(report.compatibility.approachCommandedMps)} m/s**, plafonul cinematic ${number(report.compatibility.approachFeasibleMps)} m/s la ${number(report.compatibility.approachDistanceM)} m; distanța de oprire ${number(report.compatibility.approachStoppingDistanceM)} m, proiecția opririi ${number(report.compatibility.approachProjectedStopOffsetM)} m.`,
    `- Bordură: **${number(report.compatibility.curbEffectiveM)} m** în banda [${number(report.compatibility.curbMinimumM)}, ${number(report.compatibility.curbMaximumM)}] m.`,
    `- Precizie: **${number(report.compatibility.precisionEffectiveM)} m**, fereastra [${number(report.compatibility.precisionWindowFromM)}, ${number(report.compatibility.precisionWindowToM)}] m.`,
    `- Staționare: **${number(report.compatibility.dwellEffectiveS)} s** peste podeaua de ${number(report.compatibility.dwellMinimumS)} s.`,
    `- Dropoff: **${number(report.compatibility.dropoffApproachMps)} m/s** și **${number(report.compatibility.dropoffCurbM)} m**.`,
    `- Accelerația ocupată: **${number(report.compatibility.accelerationCommandedMps2)} m/s²** = cheie · ${number(report.compatibility.accelerationBaseMps2)} m/s², plafon \`${report.compatibility.accelerationCap}\`.`,
    `- Accelerația laterală ocupată: **${number(report.compatibility.lateralCommandedMps2)} m/s²** = cheie · ${number(report.compatibility.lateralBaseMps2)} m/s², plafon \`${report.compatibility.lateralCap}\`.`,
    `- Versiune politică: \`${report.compatibility.policyVersion}\`, candidat-only ${report.compatibility.candidateOnly}, semantică schimbată ${report.compatibility.changesPolicySemantics}, rată de tick ${report.compatibility.tickHz} Hz, dovada de poziție ${report.compatibility.physicalPositionToleranceM} m, rezerva de caroserie ${report.compatibility.minimumCurbClearanceM} m.`,
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

export type { PickupV2EstimatorKey };
