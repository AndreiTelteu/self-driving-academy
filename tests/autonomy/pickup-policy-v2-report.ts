import { getParameterDefinition } from '../../src/profiles';
import {
  PICKUP_POLICY_V2_KEYS,
  PICKUP_POLICY_V2_LIMITS,
  PICKUP_POLICY_V2_M_KEYS,
} from '../../src/autonomy/pickup-policy-v2';
import type { PickupPolicyV2Command, PickupPolicyV2Key } from '../../src/autonomy/pickup-policy-v2';
import {
  civilOnlyService,
  defaultPickupPolicyValues,
  evaluate,
  occupiedAccelerationScene,
  occupiedLateralScene,
  pickupApproachScene,
  pickupCurbScene,
  pickupDwellScene,
  pickupPrecisionScene,
  pickupPolicyMValues,
  pickupService,
  realRideFacts,
  scenario,
  scenarioRows,
} from './pickup-policy-v2-reference';
import type { PickupPolicyScene } from './pickup-policy-v2-reference';

export interface PickupPolicyCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface PickupPolicyEffect {
  readonly key: PickupPolicyV2Key;
  readonly scenario: string;
  readonly keyUnit: string;
  readonly unit: string;
  readonly lowValue: number;
  readonly highValue: number;
  readonly lowOutcome: number;
  readonly highOutcome: number;
  readonly difference: number;
  readonly coupling: boolean;
  readonly note: string;
}
export interface PickupPolicySafetyRow {
  readonly id: string;
  readonly limit: string;
  readonly key: PickupPolicyV2Key;
  readonly scenario: string;
  readonly unit: string;
  readonly lowValue: number;
  readonly lowOutcome: number;
  readonly highValue: number;
  readonly highOutcome: number;
  readonly difference: number;
  readonly verdict: string;
}
export interface PickupPolicyMandatoryRow {
  readonly key: PickupPolicyV2Key;
  readonly scenario: string;
  readonly lowValue: number;
  readonly highValue: number;
  readonly identical: boolean;
  readonly lowStopAllowed: boolean;
  readonly highStopAllowed: boolean;
  readonly lowBlockedReason: string | null;
  readonly highBlockedReason: string | null;
}
export interface PickupPolicyOccupancyRow {
  readonly rideState: string;
  readonly aboard: boolean;
  readonly lowScaleMps2: number;
  readonly highScaleMps2: number;
  readonly inert: boolean;
  readonly cappedBy: string;
}
export interface PickupPolicyBlockerRow {
  readonly id: string;
  readonly scenario: string;
  readonly blockedReason: string;
  readonly stopAllowed: boolean;
  readonly preferenceInert: boolean;
  readonly detail: string;
}
export interface PickupPolicyReport {
  readonly version: '185-pickup-policy-v2';
  readonly fixture: Readonly<{
    mapId: string;
    rideId: string;
    taxiId: string;
    pickupZoneId: string;
    dropoffZoneId: string;
    toPickup: string;
    pickup: string;
    toDropoff: string;
    dropoff: string;
    completed: string;
    pickupLengthM: number;
    pickupStopOffsetM: number;
    pickupCurbBandM: number;
    dropoffLengthM: number;
    dropoffStopOffsetM: number;
    dropoffCurbBandM: number;
    civilOnlyZoneId: string;
  }>;
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly scenarios: readonly { readonly name: string; readonly scenario: string }[];
  readonly effects: readonly PickupPolicyEffect[];
  readonly separation: readonly PickupPolicyEffect[];
  readonly couplings: readonly PickupPolicyEffect[];
  readonly mandatoryStability: readonly PickupPolicyMandatoryRow[];
  readonly preferenceGrid: Readonly<{
    readonly scenarios: readonly string[];
    readonly valuesPerKey: number;
    readonly cases: number;
    readonly violations: number;
    readonly mandatoryChanges: number;
    readonly detail: string;
  }>;
  readonly blockers: readonly PickupPolicyBlockerRow[];
  readonly safety: readonly PickupPolicySafetyRow[];
  readonly departure: Readonly<{
    readonly unconfirmedAtTenSeconds: boolean;
    readonly unconfirmedReason: string | null;
    readonly confirmedAtLowKey: boolean;
    readonly confirmedAtHighKey: boolean;
    readonly confirmedHighReason: string | null;
    readonly confirmedNotStationary: boolean;
  }>;
  readonly compliance: readonly PickupPolicyCheck[];
  readonly compatibility: Readonly<{
    readonly comfortDeceleration: readonly {
      readonly comfortDecelerationMps2: number;
      readonly feasibleSpeedMps: number;
    }[];
    readonly dwell: readonly {
      readonly stopDwellTimeS: number;
      readonly effectiveAtMinimumKeyS: number;
      readonly effectiveAtMaximumKeyS: number;
    }[];
    readonly acceleration: readonly {
      readonly desiredAccelerationMps2: number;
      readonly scale: number;
      readonly commandedMps2: number;
      readonly cappedBy: string;
    }[];
    readonly lateralAccel: readonly {
      readonly curveLateralAccelMps2: number;
      readonly scale: number;
      readonly commandedMps2: number;
      readonly cappedBy: string;
    }[];
    readonly mUnits: Readonly<Record<string, string>>;
    readonly rUnits: Readonly<Record<string, string>>;
  }>;
  readonly occupancy: readonly PickupPolicyOccupancyRow[];
  readonly thresholds: Readonly<{
    readonly pickup: Readonly<Record<string, number | string | boolean | null>>;
    readonly dropoff: Readonly<Record<string, number | string | boolean | null>>;
  }>;
  readonly determinism: Readonly<{
    readonly decisions: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  }>;
  readonly checks: readonly PickupPolicyCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}
export const pickupRanges: Readonly<Record<PickupPolicyV2Key, readonly [number, number]>> =
  Object.freeze({
    pickup_approach_speed: [0.5, 8],
    pickup_curb_distance: [0.1, 2],
    pickup_stop_precision: [0.2, 5],
    pickup_dwell_time: [1, 10],
    dropoff_approach_speed: [0.5, 8],
    dropoff_curb_distance: [0.1, 2],
    occupied_acceleration_scale: [0.3, 1.5],
    occupied_lateral_accel_scale: [0.3, 1.5],
  });
export const expectedUnits: Readonly<Record<PickupPolicyV2Key, string>> = Object.freeze({
  pickup_approach_speed: 'm/s',
  pickup_curb_distance: 'm',
  pickup_stop_precision: 'm',
  pickup_dwell_time: 's',
  dropoff_approach_speed: 'm/s',
  dropoff_curb_distance: 'm',
  occupied_acceleration_scale: 'ratio',
  occupied_lateral_accel_scale: 'ratio',
});
export const expectedMUnits: Readonly<Record<string, string>> = Object.freeze({
  desired_acceleration: 'm/s²',
  comfort_deceleration: 'm/s²',
  curve_lateral_accel: 'm/s²',
  stop_dwell_time: 's',
});
const round = (value: number, digits = 6): number =>
  Math.round(value * 10 ** digits) / 10 ** digits;
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): PickupPolicyCheck {
  return { id, pass, detail };
}
function effectRow(
  scene: PickupPolicyScene,
  key: PickupPolicyV2Key,
  unit: string,
  note: string,
  measure: (command: PickupPolicyV2Command) => number,
  coupling = false,
): PickupPolicyEffect {
  const [lowValue, highValue] = pickupRanges[key],
    lowOutcome = measure(evaluate(scene, { rValues: { [key]: lowValue } }).command),
    highOutcome = measure(evaluate(scene, { rValues: { [key]: highValue } }).command);
  return {
    key,
    scenario: scene.name,
    keyUnit: getParameterDefinition(key).unit,
    unit,
    lowValue,
    highValue,
    lowOutcome,
    highOutcome,
    difference: highOutcome - lowOutcome,
    coupling,
    note,
  };
}
interface SafetyOptions {
  readonly mValues?: Partial<Record<(typeof PICKUP_POLICY_V2_M_KEYS)[number], number>>;
  readonly surfaceId?: 'dry-asphalt' | 'reduced-adhesion';
  readonly scene?: PickupPolicyScene;
}
function safetyRow(
  id: string,
  limit: string,
  scene: PickupPolicyScene,
  key: PickupPolicyV2Key,
  unit: string,
  measure: (command: PickupPolicyV2Command) => number,
  verdict: string,
  options: SafetyOptions = {},
): PickupPolicySafetyRow {
  const [lowValue, highValue] = pickupRanges[key],
    effectiveScene =
      options.surfaceId === undefined ? scene : { ...scene, surfaceId: options.surfaceId },
    low = measure(
      evaluate(effectiveScene, { rValues: { [key]: lowValue }, mValues: options.mValues }).command,
    ),
    high = measure(
      evaluate(effectiveScene, { rValues: { [key]: highValue }, mValues: options.mValues }).command,
    );
  return {
    id,
    limit,
    key,
    scenario: effectiveScene.name,
    unit,
    lowValue,
    lowOutcome: low,
    highValue,
    highOutcome: high,
    difference: high - low,
    verdict,
  };
}
const curbEffective = (command: PickupPolicyV2Command): number => command.curb?.effectiveM ?? 0;
const precisionEffective = (command: PickupPolicyV2Command): number =>
  command.precision?.effectiveM ?? 0;
const approachSpeed = (command: PickupPolicyV2Command): number =>
  command.approach?.commandedSpeedMps ?? 0;
const dwellEffective = (command: PickupPolicyV2Command): number => command.dwell?.effectiveS ?? 0;
const accelCommanded = (command: PickupPolicyV2Command): number =>
  command.passenger.acceleration.commandedMps2;
const lateralCommanded = (command: PickupPolicyV2Command): number =>
  command.passenger.lateralAccel.commandedMps2;

export function runPickupPolicyReport(): PickupPolicyReport {
  const facts = realRideFacts(),
    parameters = PICKUP_POLICY_V2_KEYS.map((key) => {
      const definition = getParameterDefinition(key);
      return {
        key,
        unit: definition.unit,
        minimum: definition.min,
        maximum: definition.max,
        defaultValue: definition.default,
      };
    }),
    effects = scenarioRows.map((row) =>
      effectRow(row.scene, row.key, row.unit, row.note, row.measure),
    ),
    separation: PickupPolicyEffect[] = [];
  for (const row of scenarioRows) {
    const own = defaultPickupPolicyValues[row.key];
    for (const key of PICKUP_POLICY_V2_KEYS) {
      if (key === row.key) continue;
      const [lowValue, highValue] = pickupRanges[key],
        lowOutcome = row.measure(
          evaluate(row.scene, { rValues: { [row.key]: own, [key]: lowValue } }).command,
        ),
        highOutcome = row.measure(
          evaluate(row.scene, { rValues: { [row.key]: own, [key]: highValue } }).command,
        ),
        coupling = lowOutcome !== highOutcome;
      separation.push({
        key,
        scenario: row.name,
        keyUnit: getParameterDefinition(key).unit,
        unit: row.unit,
        lowValue,
        highValue,
        lowOutcome,
        highOutcome,
        difference: highOutcome - lowOutcome,
        coupling,
        note: coupling
          ? `cuplaj explicit: \`${key}\` mișcă rezultatul scenariului ${row.name}`
          : `\`${key}\` este inertă în scenariul ${row.name}`,
      });
    }
  }
  const couplings = separation.filter((entry) => entry.coupling),
    preferenceKeys: readonly PickupPolicyV2Key[] = [
      'pickup_approach_speed',
      'pickup_curb_distance',
      'pickup_stop_precision',
      'pickup_dwell_time',
    ],
    // The mandatory envelope is compared in a scene where every preference channel exists.
    stabilityScene = pickupCurbScene(),
    mandatoryStability: PickupPolicyMandatoryRow[] = preferenceKeys.map((key) => {
      const [lowValue, highValue] = pickupRanges[key],
        low = evaluate(stabilityScene, { rValues: { [key]: lowValue } }).command,
        high = evaluate(stabilityScene, { rValues: { [key]: highValue } }).command;
      return {
        key,
        scenario: stabilityScene.name,
        lowValue,
        highValue,
        identical: JSON.stringify(low.mandatory) === JSON.stringify(high.mandatory),
        lowStopAllowed: low.mandatory?.stopAllowed === true,
        highStopAllowed: high.mandatory?.stopAllowed === true,
        lowBlockedReason: low.mandatory?.blockedReason ?? null,
        highBlockedReason: high.mandatory?.blockedReason ?? null,
      };
    }),
    preferenceValues = preferenceKeys.map((key) => {
      const [low, high] = pickupRanges[key];
      return [low, (low + high) / 2, high] as const;
    }),
    gridScenes = [pickupApproachScene(), pickupCurbScene()],
    grid = (() => {
      let cases = 0,
        violations = 0,
        mandatoryChanges = 0;
      const details: string[] = [];
      for (const gridScene of gridScenes) {
        const baseline = JSON.stringify(
          evaluate(gridScene, { rValues: { ...defaultPickupPolicyValues } }).command.mandatory,
        );
        for (const approach of preferenceValues[0])
          for (const curb of preferenceValues[1])
            for (const precision of preferenceValues[2])
              for (const dwell of preferenceValues[3]) {
                cases += 1;
                const command = evaluate(gridScene, {
                    rValues: {
                      pickup_approach_speed: approach,
                      pickup_curb_distance: curb,
                      pickup_stop_precision: precision,
                      pickup_dwell_time: dwell,
                    },
                  }).command,
                  mandatory = command.mandatory;
                if (JSON.stringify(mandatory) !== baseline) mandatoryChanges += 1;
                const approachCommand = command.approach,
                  curbCommand = command.curb,
                  precisionCommand = command.precision;
                const inside =
                  mandatory !== null &&
                  mandatory.stopAllowed &&
                  curbCommand !== null &&
                  curbCommand.effectiveM >= curbCommand.minimumM - 1e-9 &&
                  curbCommand.effectiveM <= curbCommand.maximumM + 1e-9 &&
                  precisionCommand !== null &&
                  precisionCommand.windowFromM >= -1e-9 &&
                  precisionCommand.windowToM <= mandatory.lengthM + 1e-9 &&
                  approachCommand !== null &&
                  approachCommand.projectedStopOffsetM <= mandatory.lengthM + 1e-9 &&
                  approachCommand.stoppingDistanceM <=
                    Math.max(gridScene.service?.distanceToStopM ?? 0, 0) + 1e-9 &&
                  command.departure.mayDepart === false;
                if (!inside) {
                  violations += 1;
                  if (details.length < 3)
                    details.push(
                      `${gridScene.name}: viteză ${approach}, bordură ${curb}, precizie ${precision}, staționare ${dwell}`,
                    );
                }
              }
      }
      return {
        scenarios: gridScenes.map((entry) => entry.name),
        valuesPerKey: 3,
        cases,
        violations,
        mandatoryChanges,
        detail: `**${cases - violations}/${cases}** cazuri respectă pragul obligatoriu; ${mandatoryChanges} schimbări ale blocului obligatoriu${details.length > 0 ? `; exemple: ${details.join(', ')}` : ''}`,
      };
    })(),
    civilOnlyScene: PickupPolicyScene = {
      name: 'zonă fără acces TAXI',
      description:
        'zona reală `sz:2-2` este DROPOFF cu acces numai CIVIL: niciun taxi nu poate opri acolo',
      speedMps: 0,
      rideState: 'TO_DROPOFF',
      service: civilOnlyService(),
    },
    beyondScene: PickupPolicyScene = {
      name: 'oprire peste zona marcată',
      description: 'ego deja după ieșirea din zona reală de pickup, la 1,00 m peste ea',
      speedMps: 0,
      rideState: 'TO_PICKUP',
      service: pickupService({
        distanceToStopM: -(facts.pickupStop.lengthM - facts.pickupStop.stopOffsetM) - 1,
      }),
    },
    mismatchScene: PickupPolicyScene = {
      name: 'serviciu incompatibil cu zona',
      description:
        'faza DROPOFF declarată pe o zonă autorată PICKUP: tipul zonei nu admite serviciul',
      speedMps: 0,
      rideState: 'TO_DROPOFF',
      service: pickupService({ phase: 'DROPOFF' }),
    },
    blockerRow = (
      id: string,
      scene: PickupPolicyScene,
      expected: string,
    ): PickupPolicyBlockerRow => {
      const outcomes = preferenceKeys.map((key) => {
          const [low, high] = pickupRanges[key];
          return [
            evaluate(scene, { rValues: { [key]: low } }).command,
            evaluate(scene, { rValues: { [key]: high } }).command,
          ] as const;
        }),
        verdicts = outcomes.map(
          ([low, high]) =>
            [
              low.mandatory?.stopAllowed,
              high.mandatory?.stopAllowed,
              low.mandatory?.blockedReason,
              high.mandatory?.blockedReason,
            ] as const,
        ),
        inert = verdicts.every(
          ([lowAllowed, highAllowed, lowReason, highReason]) =>
            lowAllowed === false && highAllowed === false && lowReason === highReason,
        );
      return {
        id,
        scenario: scene.name,
        blockedReason: expected,
        stopAllowed: false,
        preferenceInert: inert,
        detail: `la toate cele patru extreme de preferință: oprirea este refuzată cu \`${expected}\``,
      };
    },
    blockers: readonly PickupPolicyBlockerRow[] = [
      blockerRow('civil-only', civilOnlyScene, 'ZONE_NOT_TAXI'),
      blockerRow('beyond-zone', beyondScene, 'STOP_BEYOND_ZONE'),
      blockerRow('kind-mismatch', mismatchScene, 'ZONE_KIND_MISMATCH'),
    ],
    safety: readonly PickupPolicySafetyRow[] = [
      safetyRow(
        'curb-band',
        'banda autorată a bordurii',
        pickupCurbScene(),
        'pickup_curb_distance',
        'm',
        curbEffective,
        'minimul de 0,10 m este ridicat la 0,15 m, iar maximul de 2,00 m este plafonat la 1,20 m: caroseria rămâne în bay, nu pe bordură și nu în banda de circulație',
      ),
      safetyRow(
        'precision-window',
        'fereastra de oprire în zona marcată',
        pickupPrecisionScene(),
        'pickup_stop_precision',
        'm',
        precisionEffective,
        'toleranța efectivă nu coboară sub 0,05 m (dovada 062) și nu depășește semilățimea punctului marcat (2,75 m), deci fereastra rămâne în bay',
      ),
      safetyRow(
        'approach-cap',
        'plafonul cinematic de apropiere',
        pickupApproachScene(),
        'pickup_approach_speed',
        'm/s',
        approachSpeed,
        'viteza este `min(cheie, sqrt(2 · comfort · distanță))`: distanța de oprire nu depășește distanța până la punctul marcat',
      ),
      safetyRow(
        'dwell-floor',
        'minimul de staționare',
        pickupDwellScene(),
        'pickup_dwell_time',
        's',
        dwellEffective,
        '1 s este ridicat la 3 s (dwell-ul de îmbarcare 062); nicio valoare nu permite plecarea fără confirmarea 061',
      ),
      safetyRow(
        'accel-adhesion-cap',
        'plafonul de aderență (accelerație)',
        occupiedAccelerationScene(),
        'occupied_acceleration_scale',
        'm/s²',
        accelCommanded,
        'cu pasager la bord, scara cere 1,5 × 4 m/s², dar aderența redusă a anvelopei oprește la 4,463550 m/s²',
        {
          mValues: { desired_acceleration: 4, comfort_deceleration: 8 },
          surfaceId: 'reduced-adhesion',
        },
      ),
      safetyRow(
        'lateral-adhesion-cap',
        'plafonul de aderență (lateral)',
        occupiedLateralScene(),
        'occupied_lateral_accel_scale',
        'm/s²',
        lateralCommanded,
        'cu pasager la bord, scara cere 1,5 × 8 m/s², dar aderența redusă oprește la 4,463550 m/s²',
        { mValues: { curve_lateral_accel: 8 }, surfaceId: 'reduced-adhesion' },
      ),
    ],
    departureUnconfirmedScene: PickupPolicyScene = {
      ...pickupDwellScene(),
      dwellElapsedS: 10,
    },
    departureConfirmedScene: PickupPolicyScene = {
      ...pickupDwellScene(),
      rideState: 'TO_DROPOFF',
      dwellElapsedS: 3.2,
    },
    departure = (() => {
      const unconfirmed = evaluate(departureUnconfirmedScene, {
          rValues: { pickup_dwell_time: 10 },
        }).command,
        confirmedLow = evaluate(departureConfirmedScene, {
          rValues: { pickup_dwell_time: 1 },
        }).command,
        confirmedHigh = evaluate(departureConfirmedScene, {
          rValues: { pickup_dwell_time: 10 },
        }).command,
        notStationary = evaluate(
          { ...departureConfirmedScene, speedMps: 1 },
          { rValues: { pickup_dwell_time: 1 } },
        ).command;
      return {
        unconfirmedAtTenSeconds: unconfirmed.departure.mayDepart,
        unconfirmedReason: unconfirmed.departure.reason,
        confirmedAtLowKey: confirmedLow.departure.mayDepart,
        confirmedAtHighKey: confirmedHigh.departure.mayDepart,
        confirmedHighReason: confirmedHigh.departure.reason,
        confirmedNotStationary: notStationary.departure.mayDepart,
      };
    })(),
    compatComfort = [2, 2.5, 8].map((comfort) => ({
      comfortDecelerationMps2: comfort,
      feasibleSpeedMps: round(
        evaluate(pickupApproachScene(), {
          rValues: { pickup_approach_speed: pickupRanges.pickup_approach_speed[1] },
          mValues: { comfort_deceleration: comfort },
        }).command.approach?.feasibleSpeedMps ?? 0,
      ),
    })),
    compatDwell = [0, 1, 4].map((stopDwell) => ({
      stopDwellTimeS: stopDwell,
      effectiveAtMinimumKeyS:
        evaluate(pickupDwellScene(), {
          mValues: { stop_dwell_time: stopDwell },
          rValues: { pickup_dwell_time: pickupRanges.pickup_dwell_time[0] },
        }).command.dwell?.effectiveS ?? 0,
      effectiveAtMaximumKeyS:
        evaluate(pickupDwellScene(), {
          mValues: { stop_dwell_time: stopDwell },
          rValues: { pickup_dwell_time: pickupRanges.pickup_dwell_time[1] },
        }).command.dwell?.effectiveS ?? 0,
    })),
    compatAcceleration = [0.5, 1.5, 4].map((desired) => {
      const command = evaluate(occupiedAccelerationScene(), {
          mValues: { desired_acceleration: desired },
          rValues: { occupied_acceleration_scale: 0.85 },
        }).command,
        scale = command.passenger.acceleration;
      return {
        desiredAccelerationMps2: desired,
        scale: 0.85,
        commandedMps2: round(scale.commandedMps2),
        cappedBy: scale.cappedBy,
      };
    }),
    compatLateral = [1, 2.5, 8].map((curve) => {
      const command = evaluate(occupiedLateralScene(), {
          mValues: { curve_lateral_accel: curve },
          rValues: { occupied_lateral_accel_scale: 0.85 },
        }).command,
        scale = command.passenger.lateralAccel;
      return {
        curveLateralAccelMps2: curve,
        scale: 0.85,
        commandedMps2: round(scale.commandedMps2),
        cappedBy: scale.cappedBy,
      };
    }),
    occupancy: readonly PickupPolicyOccupancyRow[] = (
      ['TO_PICKUP', 'PICKUP', 'TO_DROPOFF', 'DROPOFF', 'COMPLETED'] as const
    ).map((rideState) => {
      const scene: PickupPolicyScene = { ...occupiedAccelerationScene(), rideState },
        low = evaluate(scene, {
          rValues: { occupied_acceleration_scale: pickupRanges.occupied_acceleration_scale[0] },
        }).command,
        high = evaluate(scene, {
          rValues: { occupied_acceleration_scale: pickupRanges.occupied_acceleration_scale[1] },
        }).command;
      return {
        rideState,
        aboard: high.passenger.aboard,
        lowScaleMps2: round(low.passenger.acceleration.commandedMps2),
        highScaleMps2: round(high.passenger.acceleration.commandedMps2),
        inert:
          low.passenger.acceleration.commandedMps2 === high.passenger.acceleration.commandedMps2,
        cappedBy: high.passenger.acceleration.cappedBy,
      };
    }),
    thresholds = {
      pickup: {
        zoneId: facts.pickupStop.zoneId,
        kind: facts.pickupStop.kind,
        taxiAccess: facts.pickupStop.taxiAccess,
        lengthM: facts.pickupStop.lengthM,
        stopOffsetM: facts.pickupStop.stopOffsetM,
        curbBandM: facts.pickupStop.curbBandM,
        curbMinimumM: PICKUP_POLICY_V2_LIMITS.minimumCurbClearanceM,
        curbMaximumM: round(facts.pickupStop.curbBandM - 1.8),
        dwellMinimumS: Math.max(
          PICKUP_POLICY_V2_LIMITS.boardingDwellS,
          pickupPolicyMValues.stop_dwell_time,
        ),
        precisionFloorM: PICKUP_POLICY_V2_LIMITS.physicalPositionToleranceM,
        precisionMaximumM: round(
          Math.min(
            facts.pickupStop.stopOffsetM,
            facts.pickupStop.lengthM - facts.pickupStop.stopOffsetM,
          ),
        ),
        entryOffsetM: facts.pickupStop.stopOffsetM,
        insideZone: true,
        stopAllowed: true,
        blockedReason: null,
      },
      dropoff: {
        zoneId: facts.dropoffStop.zoneId,
        kind: facts.dropoffStop.kind,
        taxiAccess: facts.dropoffStop.taxiAccess,
        lengthM: facts.dropoffStop.lengthM,
        stopOffsetM: facts.dropoffStop.stopOffsetM,
        curbBandM: facts.dropoffStop.curbBandM,
        curbMinimumM: PICKUP_POLICY_V2_LIMITS.minimumCurbClearanceM,
        curbMaximumM: round(facts.dropoffStop.curbBandM - 1.8),
        dwellMinimumS: Math.max(
          PICKUP_POLICY_V2_LIMITS.boardingDwellS,
          pickupPolicyMValues.stop_dwell_time,
        ),
        precisionFloorM: PICKUP_POLICY_V2_LIMITS.physicalPositionToleranceM,
        precisionMaximumM: round(
          Math.min(
            facts.dropoffStop.stopOffsetM,
            facts.dropoffStop.lengthM - facts.dropoffStop.stopOffsetM,
          ),
        ),
        entryOffsetM: facts.dropoffStop.stopOffsetM,
        insideZone: true,
        stopAllowed: true,
        blockedReason: null,
      },
    },
    fingerprint = () =>
      JSON.stringify(
        scenarioRows.flatMap((row) => {
          const [low, high] = pickupRanges[row.key];
          return [
            evaluate(row.scene, { rValues: { [row.key]: low } }).command,
            evaluate(row.scene, { rValues: { [row.key]: high } }).command,
          ];
        }),
      ),
    determinismDigest = digest(fingerprint()),
    repeatedDigest = digest(fingerprint()),
    discretionary = pickupCurbScene(),
    manual = evaluate(discretionary, { authority: 'MANUAL' }).command,
    stale = evaluate(discretionary, {
      observation: { ...evaluate(discretionary).input.observation, tick: scenario.tick + 1 },
    }).command,
    foreignActor = evaluate(discretionary, {
      observation: {
        ...evaluate(discretionary).input.observation,
        actor: { id: 'other', incarnation: 1 },
      },
    }).command,
    foreignScope = evaluate(discretionary, {
      observation: { ...evaluate(discretionary).input.observation, sessionId: 'other' },
    }).command,
    missingProfile = evaluate(discretionary, { profile: null }).command,
    refusals = {
      foreignProfile: (() => {
        try {
          evaluate(discretionary, { profile: { ...evaluate(discretionary).profile } });
          return 'ADMITTED';
        } catch {
          return 'REFUSED';
        }
      })(),
      wrongObservation: (() => {
        try {
          evaluate(discretionary, {
            observation: {
              ...evaluate(discretionary).input.observation,
              version: '185-pickup-observation-v0' as '185-pickup-observation-v1',
            },
          });
          return 'ADMITTED';
        } catch {
          return 'REFUSED';
        }
      })(),
      wrongMechanics: (() => {
        try {
          evaluate(discretionary, {
            observation: {
              ...evaluate(discretionary).input.observation,
              mechanics: { version: '023-mechanics-v0' as '023-mechanics-v1', classId: 'sedan' },
            },
          });
          return 'ADMITTED';
        } catch {
          return 'REFUSED';
        }
      })(),
      unknownRideState: (() => {
        try {
          evaluate(discretionary, {
            observation: {
              ...evaluate(discretionary).input.observation,
              rideState: 'BOARDING' as 'TO_PICKUP',
            },
          });
          return 'ADMITTED';
        } catch {
          return 'REFUSED';
        }
      })(),
      phaseMismatch: (() => {
        try {
          evaluate(discretionary, {
            observation: {
              ...evaluate(discretionary).input.observation,
              service: { ...discretionary.service!, phase: 'DROPOFF' },
            },
          });
          return 'ADMITTED';
        } catch {
          return 'REFUSED';
        }
      })(),
      negativeDistance: (() => {
        try {
          evaluate(discretionary, {
            observation: {
              ...evaluate(discretionary).input.observation,
              service: { ...discretionary.service!, distanceToStopM: -2000 },
            },
          });
          return 'ADMITTED';
        } catch {
          return 'REFUSED';
        }
      })(),
      stopOffsetOutsideBay: (() => {
        try {
          evaluate(discretionary, {
            observation: {
              ...evaluate(discretionary).input.observation,
              service: { ...discretionary.service!, stopOffsetM: 9 },
            },
          });
          return 'ADMITTED';
        } catch {
          return 'REFUSED';
        }
      })(),
    },
    compliance: readonly PickupPolicyCheck[] = [
      check(
        'mandatory-stability',
        mandatoryStability.every(
          (entry) =>
            entry.identical &&
            entry.lowStopAllowed &&
            entry.highStopAllowed &&
            entry.lowBlockedReason === null &&
            entry.highBlockedReason === null,
        ),
        mandatoryStability
          .map(
            (entry) =>
              `\`${entry.key}\` ${entry.lowValue} / ${entry.highValue} → bloc obligatoriu ${entry.identical ? 'identic' : 'diferit'}`,
          )
          .join('; '),
      ),
      check(
        'preference-grid',
        grid.cases === 162 && grid.violations === 0 && grid.mandatoryChanges === 0,
        grid.detail,
      ),
      check(
        'blockers',
        blockers.every((entry) => entry.preferenceInert && !entry.stopAllowed),
        blockers
          .map(
            (entry) =>
              `${entry.id}: oprit=${String(entry.stopAllowed)}, inerție=${String(entry.preferenceInert)}`,
          )
          .join('; '),
      ),
      check(
        'curb-and-precision',
        safety[0]!.lowOutcome === PICKUP_POLICY_V2_LIMITS.minimumCurbClearanceM &&
          safety[0]!.highOutcome === 1.2 &&
          safety[1]!.lowOutcome === pickupRanges.pickup_stop_precision[0] &&
          safety[1]!.highOutcome === 2.75,
        `${safety[0]!.lowOutcome} → ${safety[0]!.highOutcome} m; precizie ${safety[1]!.lowOutcome} → ${safety[1]!.highOutcome} m`,
      ),
      check(
        'approach-cap',
        safety[2]!.highOutcome < pickupRanges.pickup_approach_speed[1] &&
          round(safety[2]!.highOutcome) === round(Math.sqrt(2 * 2 * 7.75)),
        `${safety[2]!.lowOutcome} → ${round(safety[2]!.highOutcome)} m/s (plafon cinematic ${round(Math.sqrt(2 * 2 * 7.75))})`,
      ),
      check(
        'dwell-floor',
        safety[3]!.lowOutcome === PICKUP_POLICY_V2_LIMITS.boardingDwellS &&
          safety[3]!.highOutcome === pickupRanges.pickup_dwell_time[1],
        `${safety[3]!.lowOutcome} → ${safety[3]!.highOutcome} s`,
      ),
      check(
        'occupied-caps',
        round(safety[4]!.lowOutcome) === 1.2 &&
          round(safety[4]!.highOutcome) === 4.46355 &&
          round(safety[5]!.lowOutcome) === 2.4 &&
          round(safety[5]!.highOutcome) === 4.46355,
        `accelerație ${round(safety[4]!.lowOutcome)} → ${round(safety[4]!.highOutcome)} m/s²; lateral ${round(safety[5]!.lowOutcome)} → ${round(safety[5]!.highOutcome)} m/s²`,
      ),
      check(
        'departure-gate',
        departure.unconfirmedAtTenSeconds === false &&
          departure.unconfirmedReason === 'SERVICE_NOT_CONFIRMED' &&
          departure.confirmedAtLowKey === true &&
          departure.confirmedAtHighKey === false &&
          departure.confirmedHighReason === 'DWELL_PENDING' &&
          departure.confirmedNotStationary === false,
        `neconfirmat la 10 s: ${String(departure.unconfirmedAtTenSeconds)} (${String(departure.unconfirmedReason)}); confirmat 3,2 s: cheie 1 → ${String(departure.confirmedAtLowKey)}, cheie 10 → ${String(departure.confirmedAtHighKey)} (${String(departure.confirmedHighReason)}); în mișcare → ${String(departure.confirmedNotStationary)}`,
      ),
      check(
        'occupancy',
        occupancy
          .filter((entry) => entry.aboard)
          .map((entry) => entry.rideState)
          .join(',') === 'TO_DROPOFF,DROPOFF' &&
          occupancy.every(
            (entry) =>
              entry.inert === !entry.aboard &&
              (entry.aboard
                ? entry.lowScaleMps2 !== entry.highScaleMps2
                : entry.lowScaleMps2 === entry.highScaleMps2),
          ),
        occupancy
          .map((entry) => `${entry.rideState}: ${entry.lowScaleMps2} / ${entry.highScaleMps2} m/s²`)
          .join('; '),
      ),
      check(
        'm-comfort',
        compatComfort[0]!.feasibleSpeedMps < compatComfort[1]!.feasibleSpeedMps &&
          compatComfort[1]!.feasibleSpeedMps < compatComfort[2]!.feasibleSpeedMps,
        compatComfort
          .map((entry) => `${entry.comfortDecelerationMps2} → ${entry.feasibleSpeedMps}`)
          .join(' / '),
      ),
      check(
        'm-dwell',
        compatDwell.every(
          (entry) =>
            entry.effectiveAtMinimumKeyS === Math.max(3, entry.stopDwellTimeS) &&
            entry.effectiveAtMaximumKeyS === 10,
        ),
        compatDwell
          .map(
            (entry) =>
              `M ${entry.stopDwellTimeS} s → ${entry.effectiveAtMinimumKeyS} / ${entry.effectiveAtMaximumKeyS} s`,
          )
          .join('; '),
      ),
      check(
        'm-acceleration',
        compatAcceleration[0]!.commandedMps2 === 0.425 &&
          compatAcceleration[1]!.commandedMps2 === 1.275 &&
          compatAcceleration[2]!.commandedMps2 === 2 &&
          compatAcceleration[2]!.cappedBy === 'COMFORT',
        compatAcceleration
          .map(
            (entry) =>
              `${entry.desiredAccelerationMps2} → ${entry.commandedMps2} (${entry.cappedBy})`,
          )
          .join('; '),
      ),
      check(
        'm-lateral',
        compatLateral[0]!.commandedMps2 === 0.85 &&
          compatLateral[1]!.commandedMps2 === 2.125 &&
          compatLateral[2]!.commandedMps2 === 6.8,
        compatLateral
          .map((entry) => `${entry.curveLateralAccelMps2} → ${entry.commandedMps2}`)
          .join('; '),
      ),
      check(
        'effects',
        effects.length === 8 && effects.every((entry) => entry.difference !== 0),
        effects
          .map(
            (entry) =>
              `${entry.key} ${entry.lowOutcome.toFixed(3)} → ${entry.highOutcome.toFixed(3)}`,
          )
          .join('; '),
      ),
      check(
        'separation',
        separation.length === 56 && couplings.length === 0,
        `${separation.length - couplings.length}/${separation.length} perechi inerte, ${couplings.length} cuplaje`,
      ),
      check('determinism', determinismDigest === repeatedDigest, `digest ${determinismDigest}`),
      check(
        'admission',
        manual.reason === 'NO_AUTO_AUTHORITY' &&
          manual.action === 'UNAVAILABLE' &&
          stale.reason === 'FOREIGN_OR_STALE_OBSERVATION' &&
          foreignActor.reason === 'FOREIGN_OR_STALE_OBSERVATION' &&
          foreignScope.reason === 'FOREIGN_OR_STALE_OBSERVATION' &&
          missingProfile.reason === 'MISSING_PROFILE' &&
          Object.values(refusals).every((value) => value === 'REFUSED'),
        `manual ${manual.reason}, vechi ${stale.reason}, actor ${foreignActor.reason}, sesiune ${foreignScope.reason}, profil lipsă ${missingProfile.reason}; refuzuri: ${Object.entries(
          refusals,
        )
          .map(([key, value]) => `${key} ${value}`)
          .join(', ')}`,
      ),
      check(
        'units',
        parameters.every((entry) => entry.unit === expectedUnits[entry.key as PickupPolicyV2Key]) &&
          PICKUP_POLICY_V2_M_KEYS.every(
            (key) => getParameterDefinition(key).unit === expectedMUnits[key],
          ),
        `R: ${parameters.map((entry) => `${entry.key} ${entry.unit}`).join(', ')}; M: ${PICKUP_POLICY_V2_M_KEYS.map((key) => `${key} ${getParameterDefinition(key).unit}`).join(', ')}`,
      ),
      check(
        'catalog',
        parameters.length === 8 &&
          parameters.every(
            (entry) =>
              entry.minimum === pickupRanges[entry.key as PickupPolicyV2Key][0] &&
              entry.maximum === pickupRanges[entry.key as PickupPolicyV2Key][1] &&
              entry.defaultValue >= entry.minimum &&
              entry.defaultValue <= entry.maximum,
          ),
        parameters
          .map((entry) => `${entry.key} ${entry.minimum}-${entry.maximum} → ${entry.defaultValue}`)
          .join(', '),
      ),
    ],
    passed = compliance.filter((entry) => entry.pass).length;
  return {
    version: '185-pickup-policy-v2',
    fixture: {
      mapId: facts.map.mapId,
      rideId: facts.rideId,
      taxiId: facts.taxiId,
      pickupZoneId: facts.pickupZoneId,
      dropoffZoneId: facts.dropoffZoneId,
      toPickup: facts.toPickup,
      pickup: facts.pickup,
      toDropoff: facts.toDropoff,
      dropoff: facts.dropoff,
      completed: facts.completed,
      pickupLengthM: facts.pickupStop.lengthM,
      pickupStopOffsetM: facts.pickupStop.stopOffsetM,
      pickupCurbBandM: facts.pickupStop.curbBandM,
      dropoffLengthM: facts.dropoffStop.lengthM,
      dropoffStopOffsetM: facts.dropoffStop.stopOffsetM,
      dropoffCurbBandM: facts.dropoffStop.curbBandM,
      civilOnlyZoneId: facts.civilOnlyStop.zoneId,
    },
    parameters,
    scenarios: scenarioRows.map((row) => ({ name: row.name, scenario: row.scene.description })),
    effects,
    separation,
    couplings,
    mandatoryStability,
    preferenceGrid: grid,
    blockers,
    safety,
    departure,
    compliance,
    compatibility: {
      comfortDeceleration: compatComfort,
      dwell: compatDwell,
      acceleration: compatAcceleration,
      lateralAccel: compatLateral,
      mUnits: Object.fromEntries(
        PICKUP_POLICY_V2_M_KEYS.map((key) => [key, getParameterDefinition(key).unit]),
      ),
      rUnits: Object.fromEntries(
        PICKUP_POLICY_V2_KEYS.map((key) => [key, getParameterDefinition(key).unit]),
      ),
    },
    occupancy,
    thresholds,
    determinism: {
      decisions: scenarioRows.length * 2,
      digest: determinismDigest,
      repeatedDigest,
    },
    checks: compliance,
    summary: { checks: compliance.length, passed, pass: passed === compliance.length },
  };
}

export function pickupPolicyReportMarkdown(report: PickupPolicyReport): string {
  const effectRows = (entries: readonly PickupPolicyEffect[]) =>
    entries
      .map(
        (entry) =>
          `| \`${entry.key}\` | ${entry.scenario} | ${entry.lowValue} | ${entry.lowOutcome.toFixed(3)} | ${entry.highValue} | ${entry.highOutcome.toFixed(3)} | ${entry.difference.toFixed(3)} | ${entry.unit} |`,
      )
      .join('\n');
  const separationRows = (entries: readonly PickupPolicyEffect[]) =>
    entries
      .map(
        (entry) =>
          `| \`${entry.key}\` | ${entry.scenario} | ${entry.lowValue} | ${entry.highValue} | ${entry.difference.toFixed(3)} | ${entry.coupling ? '**cuplaj**' : 'inerță'} |`,
      )
      .join('\n');
  return [
    '# 185 — raport politică pentru pickup și confortul pasagerilor',
    '',
    'Generat de `scripts/run-v2-pickup-policy-report.mjs` din contractul `185-pickup-policy-v2`.',
    'Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei.',
    'Zonele de serviciu, punctul de oprire și adâncimea bay-ului vin din harta autorată 032; starea',
    'ocupată vine din ciclul real 061; geometria și aderența din clasele 023 și suprafețele 026.',
    '',
    '## Scenariile',
    '',
    '| Scenariu | Descriere |',
    '| --- | --- |',
    ...report.scenarios.map((entry) => `| ${entry.name} | ${entry.scenario} |`),
    '',
    '## Efectul izolat al fiecărei chei',
    '',
    '| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    effectRows(report.effects),
    '',
    '## Pragurile obligatorii ale opririi',
    '',
    '| Zonă | Tip | TAXI | Lungime (m) | Punct (m) | Bandă bordură (m) | Bordură min/max (m) | Dwell min (s) | Precizie min/max (m) |',
    '| --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- |',
    ...(['pickup', 'dropoff'] as const).map((name) => {
      const entry = report.thresholds[name];
      return `| \`${String(entry.zoneId)}\` | ${String(entry.kind)} | ${entry.taxiAccess === true ? 'da' : 'nu'} | ${String(entry.lengthM)} | ${String(entry.stopOffsetM)} | ${String(entry.curbBandM)} | ${String(entry.curbMinimumM)} / ${String(entry.curbMaximumM)} | ${String(entry.dwellMinimumS)} | ${String(entry.precisionFloorM)} / ${String(entry.precisionMaximumM)} |`;
    }),
    '',
    '## Preferința nu mută pragul obligatoriu',
    '',
    '| Cheie | Scenariu | Joasă | Ridicată | Bloc identic | Oprire permisă la ambele | Motiv blocat |',
    '| --- | --- | ---: | ---: | --- | --- | --- |',
    ...report.mandatoryStability.map(
      (entry) =>
        `| \`${entry.key}\` | ${entry.scenario} | ${entry.lowValue} | ${entry.highValue} | ${entry.identical ? 'da' : 'nu'} | ${entry.lowStopAllowed && entry.highStopAllowed ? 'da' : 'nu'} | ${String(entry.lowBlockedReason ?? entry.highBlockedReason ?? '—')} |`,
    ),
    '',
    `Grilă de preferințe: ${report.preferenceGrid.detail}`,
    '',
    '| Blocaj | Scenariu | Motiv | Oprire permisă | Inerție la orice preferință |',
    '| --- | --- | --- | --- | --- |',
    ...report.blockers.map(
      (entry) =>
        `| ${entry.id} | ${entry.scenario} | \`${entry.blockedReason}\` | ${entry.stopAllowed ? 'da' : 'nu'} | ${entry.preferenceInert ? 'da' : 'nu'} |`,
    ),
    '',
    '## Cele șase limite de siguranță',
    '',
    '| Limită | Cheie | Scenariu | Joasă | Rezultat joasă | Ridicată | Rezultat ridicată | Unitate | Verdict |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
    ...report.safety.map(
      (entry) =>
        `| ${entry.limit} | \`${entry.key}\` | ${entry.scenario} | ${entry.lowValue} | ${entry.lowOutcome.toFixed(3)} | ${entry.highValue} | ${entry.highOutcome.toFixed(3)} | ${entry.unit} | ${entry.verdict} |`,
    ),
    '',
    `Poarta de plecare: neconfirmat la 10 s → \`${String(report.departure.unconfirmedAtTenSeconds)}\` (${String(report.departure.unconfirmedReason)}); confirmat la 3,2 s → cheie 1 \`${String(report.departure.confirmedAtLowKey)}\`, cheie 10 \`${String(report.departure.confirmedAtHighKey)}\` (${String(report.departure.confirmedHighReason)}); în mișcare \`${String(report.departure.confirmedNotStationary)}\`.`,
    '',
    '## Separarea cheilor',
    '',
    'Cheia scenariului rămâne la valoarea implicită din catalog, iar fiecare altă cheie este dusă de',
    `la minim la maxim: **${report.separation.length - report.couplings.length}/${report.separation.length}** perechi sunt inerte în scenariul lor.`,
    '',
    '| Cheie | Scenariu | Valoare joasă | Valoare ridicată | Diferență | Separată |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    separationRows(report.separation),
    '',
    '## Starea ocupată',
    '',
    '| Stare 061 | Pasager la bord | Scală minimă (m/s²) | Scală maximă (m/s²) | Inertă fără pasager | Plafon |',
    '| --- | --- | ---: | ---: | --- | --- |',
    ...report.occupancy.map(
      (entry) =>
        `| ${entry.rideState} | ${entry.aboard ? 'da' : 'nu'} | ${entry.lowScaleMps2} | ${entry.highScaleMps2} | ${entry.inert ? 'da' : 'nu'} | ${entry.cappedBy} |`,
    ),
    '',
    '## Compatibilitate cu cheile M',
    '',
    '| `comfort_deceleration` (m/s²) | Plafon cinematic de apropiere (m/s) |',
    '| ---: | ---: |',
    ...report.compatibility.comfortDeceleration.map(
      (entry) => `| ${entry.comfortDecelerationMps2} | ${entry.feasibleSpeedMps} |`,
    ),
    '',
    '| `stop_dwell_time` (s) | Efectiv la cheie 1 s | Efectiv la cheie 10 s |',
    '| ---: | ---: | ---: |',
    ...report.compatibility.dwell.map(
      (entry) =>
        `| ${entry.stopDwellTimeS} | ${entry.effectiveAtMinimumKeyS} | ${entry.effectiveAtMaximumKeyS} |`,
    ),
    '',
    '| `desired_acceleration` (m/s²) | Scară 0,85 | Comandat (m/s²) | Plafon |',
    '| ---: | ---: | ---: | --- |',
    ...report.compatibility.acceleration.map(
      (entry) =>
        `| ${entry.desiredAccelerationMps2} | ${entry.scale} | ${entry.commandedMps2} | ${entry.cappedBy} |`,
    ),
    '',
    '| `curve_lateral_accel` (m/s²) | Scară 0,85 | Comandat (m/s²) | Plafon |',
    '| ---: | ---: | ---: | --- |',
    ...report.compatibility.lateralAccel.map(
      (entry) =>
        `| ${entry.curveLateralAccelMps2} | ${entry.scale} | ${entry.commandedMps2} | ${entry.cappedBy} |`,
    ),
    '',
    `- Unități M: ${Object.entries(report.compatibility.mUnits)
      .map(([key, unit]) => `\`${key}\` ${unit}`)
      .join(', ')}.`,
    `- Unități R: ${Object.entries(report.compatibility.rUnits)
      .map(([key, unit]) => `\`${key}\` ${unit}`)
      .join(', ')}.`,
    '',
    '## Parametrii din catalog',
    '',
    '| Cheie | Unitate | Minim | Maxim | Default |',
    '| --- | --- | ---: | ---: | ---: |',
    ...report.parameters.map(
      (entry) =>
        `| \`${entry.key}\` | ${entry.unit} | ${entry.minimum} | ${entry.maximum} | ${entry.defaultValue} |`,
    ),
    '',
    '## Determinism',
    '',
    `- ${report.determinism.decisions} decizii: \`${report.determinism.digest}\`.`,
    `- Rulare repetată: \`${report.determinism.repeatedDigest}\`.`,
    '',
    '## Verificări',
    '',
    ...report.checks.map(
      (entry) => `- ${entry.pass ? 'PASS' : 'FAIL'} \`${entry.id}\`: ${entry.detail}`,
    ),
    '',
    `**Sumar: ${report.summary.passed}/${report.summary.checks} verificări, ${report.summary.pass ? 'PASS' : 'FAIL'}.**`,
    '',
  ].join('\n');
}
