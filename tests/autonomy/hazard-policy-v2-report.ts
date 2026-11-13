import { getParameterDefinition } from '../../src/profiles';
import {
  HAZARD_POLICY_V2_KEYS,
  HAZARD_POLICY_V2_LIMITS,
  HAZARD_POLICY_V2_M_KEYS,
} from '../../src/autonomy/hazard-policy-v2';
import type { HazardPolicyV2Command, HazardPolicyV2Key } from '../../src/autonomy/hazard-policy-v2';
import {
  FIXTURE_LANE,
  defaultHazardPolicyValues,
  emergencyScene,
  evaluate,
  evasionScene,
  hazardPolicyMValues,
  hornScene,
  pedestrianScene,
  reactionScene,
  realCrossing,
  realObstacle,
  realStimulus,
  scenario,
  scenarioRows,
  sceneOf,
} from './hazard-policy-v2-reference';
import type { HazardPolicyScene } from './hazard-policy-v2-reference';

export interface HazardPolicyCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface HazardPolicyEffect {
  readonly key: string;
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
export interface HazardPolicySafetyRow {
  readonly id: string;
  readonly limit: string;
  readonly key: HazardPolicyV2Key;
  readonly scenario: string;
  readonly unit: string;
  readonly lowValue: number;
  readonly lowOutcome: number;
  readonly highValue: number;
  readonly highOutcome: number;
  readonly difference: number;
  readonly verdict: string;
}
export interface HazardPolicyCompatibility {
  readonly comfortDeceleration: readonly {
    readonly comfortDecelerationMps2: number;
    readonly speedCapMps: number;
  }[];
  readonly reactionDelay: readonly {
    readonly brakeReactionDelayS: number;
    readonly inheritedDelayS: number;
    readonly demandedDelayS: number;
    readonly delayTicks: number;
    readonly saturated: boolean;
  }[];
  readonly lateralAccel: readonly {
    readonly curveLateralAccelMps2: number;
    readonly lateralAccelMps2: number;
    readonly reachableOffsetM: number;
    readonly offsetM: number;
  }[];
  readonly yieldGap: readonly {
    readonly yieldTimeGapS: number;
    readonly gapS: number;
    readonly mandatoryYield: boolean;
    readonly yieldedAtZero: boolean;
    readonly yieldedAtOne: boolean;
  }[];
  readonly mUnits: Readonly<Record<string, string>>;
  readonly rUnits: Readonly<Record<string, string>>;
}
export interface HazardPolicyGeometryRow {
  readonly classId: string;
  readonly surfaceId: string;
  readonly widthM: number;
  readonly brakeAccelerationMps2: number;
  readonly grip: number;
  readonly tireGripScale: number;
  readonly adhesionLimitMps2: number;
  readonly brakeCapabilityMps2: number;
  readonly pedestrianFloorM: number;
  readonly coneFloorM: number;
  readonly barrierFloorM: number;
}
export interface HazardPolicyReport {
  readonly version: '183-hazard-policy-v2';
  readonly fixture: Readonly<{
    crosswalkId: string;
    laneId: string;
    pedestrianId: string;
    crossingLengthM: number;
    walkSpeedMps: number;
    crossingRemainingS: number;
    waitingDistanceM: number;
    crossingDistanceM: number;
    obstacleLaneId: string;
    obstacleAtM: number;
    headingRad: number;
  }>;
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly scenarios: readonly { readonly name: string; readonly scenario: string }[];
  readonly effects: readonly HazardPolicyEffect[];
  readonly separation: readonly HazardPolicyEffect[];
  readonly couplings: readonly HazardPolicyEffect[];
  readonly safety: readonly HazardPolicySafetyRow[];
  readonly compliance: readonly {
    readonly id: string;
    readonly pass: boolean;
    readonly detail: string;
  }[];
  readonly compatibility: HazardPolicyCompatibility;
  readonly geometry: readonly HazardPolicyGeometryRow[];
  readonly samples: Readonly<{
    readonly repeated: boolean;
    readonly otherOpportunityDiffers: boolean;
    readonly otherSeedDiffers: boolean;
    readonly hornWithoutPermission: number | null;
    readonly evasionWithoutSpace: number | null;
    readonly yieldWhileWaiting: number | null;
  }>;
  readonly determinism: {
    readonly decisions: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly HazardPolicyCheck[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
}

const ranges: Readonly<Record<HazardPolicyV2Key, readonly [number, number]>> = Object.freeze({
  pedestrian_yield_probability: [0, 1],
  pedestrian_clearance: [0.1, 6],
  hazard_reaction_delay: [0, 3],
  obstacle_clearance: [0.1, 4],
  emergency_brake_intensity: [0, 1],
  evasive_steer_willingness: [0, 1],
  crosswalk_approach_speed: [0.5, 15],
  horn_use_probability: [0, 1],
});
export const expectedUnits: Readonly<Record<HazardPolicyV2Key, string>> = Object.freeze({
  pedestrian_yield_probability: 'probability',
  pedestrian_clearance: 'm',
  hazard_reaction_delay: 's',
  obstacle_clearance: 'm',
  emergency_brake_intensity: 'ratio',
  evasive_steer_willingness: 'probability',
  crosswalk_approach_speed: 'm/s',
  horn_use_probability: 'probability',
});
export const expectedMUnits: Readonly<Record<string, string>> = Object.freeze({
  comfort_deceleration: 'm/s²',
  brake_reaction_delay: 's',
  curve_lateral_accel: 'm/s²',
  yield_time_gap: 's',
});
function effectRow(
  scene: HazardPolicyScene,
  key: HazardPolicyV2Key,
  unit: string,
  note: string,
  measure: (command: HazardPolicyV2Command) => number,
  coupling = false,
): HazardPolicyEffect {
  const [lowValue, highValue] = ranges[key],
    low = evaluate(scene, { rValues: { [key]: lowValue } }).command,
    high = evaluate(scene, { rValues: { [key]: highValue } }).command,
    lowOutcome = measure(low),
    highOutcome = measure(high);
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
function safetyRow(
  id: string,
  limit: string,
  scene: HazardPolicyScene,
  key: HazardPolicyV2Key,
  unit: string,
  measure: (command: HazardPolicyV2Command) => number,
  verdict: string,
): HazardPolicySafetyRow {
  const [lowValue, highValue] = ranges[key],
    low = evaluate(scene, { rValues: { [key]: lowValue } }).command,
    high = evaluate(scene, { rValues: { [key]: highValue } }).command,
    lowOutcome = measure(low),
    highOutcome = measure(high);
  return {
    id,
    limit,
    key,
    scenario: scene.name,
    unit,
    lowValue,
    lowOutcome,
    highValue,
    highOutcome,
    difference: highOutcome - lowOutcome,
    verdict,
  };
}
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): HazardPolicyCheck {
  return { id, pass, detail };
}
const round = (value: number, digits = 3): number =>
  Math.round(value * 10 ** digits) / 10 ** digits;
const pedestrianEffective = (command: HazardPolicyV2Command): number =>
  command.clearance.pedestrian?.effectiveM ?? 0;
const obstacleEffective = (command: HazardPolicyV2Command): number =>
  command.clearance.obstacle?.effectiveM ?? 0;
const reactionDelay = (command: HazardPolicyV2Command): number => command.reaction?.delayS ?? 0;
const brakeDeceleration = (command: HazardPolicyV2Command): number =>
  command.emergencyBrake?.decelerationMps2 ?? 0;
const evasionOffset = (command: HazardPolicyV2Command): number => command.evasion?.offsetM ?? 0;
const hornUsed = (command: HazardPolicyV2Command): number => (command.horn?.used === true ? 1 : 0);
const yielded = (command: HazardPolicyV2Command): number =>
  command.pedestrian?.yielded === true ? 1 : 0;

export function runHazardPolicyReport(): HazardPolicyReport {
  const parameters = HAZARD_POLICY_V2_KEYS.map((key) => {
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
    separation: HazardPolicyEffect[] = [];
  for (const row of scenarioRows) {
    // The row's own key stays at its catalog default, so a coupling can surface in both directions.
    const own = defaultHazardPolicyValues[row.key];
    for (const key of HAZARD_POLICY_V2_KEYS) {
      if (key === row.key) continue;
      const [lowValue, highValue] = ranges[key],
        otherLow = evaluate(row.scene, { rValues: { [row.key]: own, [key]: lowValue } }).command,
        otherHigh = evaluate(row.scene, { rValues: { [row.key]: own, [key]: highValue } }).command,
        lowOutcome = row.measure(otherLow),
        highOutcome = row.measure(otherHigh),
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
    // The pedestrian is already inside the physical margin: no value may advance any further.
    pedestrianInsideScene = pedestrianScene(1, 'WAITING', 6),
    // The authored barrier is wider than the catalog clearance can ever be.
    obstacleInsideScene: HazardPolicyScene = {
      name: 'obstacol în marjă',
      description:
        'bariera reală la 2,50 m: marja fizică a cutiei late este peste orice valoare de catalog',
      speedMps: 6,
      postedLimitMps: 15,
      obstacle: realObstacle(2.5),
    },
    // A real onset 16 m ahead: the remaining room allows less than the catalog reaction maximum.
    cappedReactionScene: HazardPolicyScene = {
      name: 'reacție plafonată',
      description: `stimulul real 165 apărut la ${realStimulus(16, 8).distanceM.toFixed(3)} m cu 8 m/s: spațiul nu permite 3 s de întârziere`,
      speedMps: 8,
      postedLimitMps: 15,
      stimulus: realStimulus(16, 8),
    },
    reducedAdhesionScene: () => HazardPolicyScene = () => ({
      ...emergencyScene(),
      name: 'frânare pe aderență redusă',
      description: `același stimul, pe suprafața livrată \`reduced-adhesion\`: aderența fizică este sub capacitatea de frânare`,
      surfaceId: 'reduced-adhesion',
    }),
    noSpaceScene: () => HazardPolicyScene = () => ({
      name: 'ocolire fără spațiu',
      description:
        'bariera reală la 20 m, cu 3,00 m de spațiu lateral declarat: sub marja fizică de 3,40 m',
      speedMps: 8,
      postedLimitMps: 15,
      obstacle: realObstacle(20),
      evasion: { side: 'LEFT', lateralSpaceM: 3, timeToObstacleS: 0.6 },
    }),
    forbiddenHornScene: () => HazardPolicyScene = () => ({
      ...hornScene(),
      name: 'claxon interzis',
      description: 'aceeași oportunitate reală, dar lumea nu permite claxonul aici',
      horn: { opportunityId: 'horn-opportunity-183', permitted: false },
    }),
    mandatoryYieldScene = pedestrianScene(12, 'CROSSING', 6),
    safety: readonly HazardPolicySafetyRow[] = [
      safetyRow(
        'mandatory-yield',
        'cedare obligatorie',
        mandatoryYieldScene,
        'pedestrian_yield_probability',
        'decizie',
        yielded,
        'un pieton care nu poate elibera calea în timpul M `yield_time_gap` este o cedare obligatorie la orice valoare a cheii',
      ),
      safetyRow(
        'pedestrian-floor',
        'minim de spațiu (pieton)',
        pedestrianInsideScene,
        'pedestrian_clearance',
        'm',
        pedestrianEffective,
        'minimul de catalog de 0,10 m este ridicat la lățimea vehiculului plus rezervă (2,30 m pentru sedan)',
      ),
      safetyRow(
        'obstacle-floor',
        'minim de spațiu (obstacol)',
        obstacleInsideScene,
        'obstacle_clearance',
        'm',
        obstacleEffective,
        'marja fizică a cutiei late (3,40 m) nu poate fi coborâtă de nicio valoare de catalog',
      ),
      safetyRow(
        'reaction-cap',
        'plafon de reacție',
        cappedReactionScene,
        'hazard_reaction_delay',
        's',
        reactionDelay,
        'întârzierea este saturată la maximul fezabil: frânarea mai poate opri în spațiul rămas',
      ),
      safetyRow(
        'adhesion-cap',
        'plafon de aderență',
        reducedAdhesionScene(),
        'emergency_brake_intensity',
        'm/s²',
        brakeDeceleration,
        'frânarea de urgență nu depășește aderența disponibilă, oricare ar fi intensitatea',
      ),
      safetyRow(
        'evasion-no-space',
        'subordonarea ocolirii',
        noSpaceScene(),
        'evasive_steer_willingness',
        'm',
        evasionOffset,
        'fără spațiul lateral verificat, cheia este inertă la ambele extremități',
      ),
      safetyRow(
        'horn-forbidden',
        'subordonarea claxonului',
        forbiddenHornScene(),
        'horn_use_probability',
        'decizie',
        hornUsed,
        'unde claxonul este interzis, eșantionul nu se trage și cheia este inertă',
      ),
    ],
    clearanceScene = pedestrianScene(12, 'WAITING', 6),
    compatClearance = [2, 2.5, 8].map((comfort) => ({
      comfortDecelerationMps2: comfort,
      speedCapMps: round(
        evaluate(clearanceScene, { mValues: { comfort_deceleration: comfort } }).command.clearance
          .pedestrian?.speedCapMps ?? 0,
        6,
      ),
    })),
    compatReaction = [0, 0.5, 3].map((inherited) => {
      const command = evaluate(reactionScene(), {
          mValues: { brake_reaction_delay: inherited },
        }).command,
        reaction = command.reaction!;
      return {
        brakeReactionDelayS: inherited,
        inheritedDelayS: reaction.inheritedDelayS,
        demandedDelayS: round(reaction.demandedDelayS, 6),
        delayTicks: reaction.delayTicks,
        saturated: reaction.saturated,
      };
    }),
    compatLateral = [2.5, 8].map((lateralAccel) => {
      const command = evaluate(evasionScene(), {
          rValues: { evasive_steer_willingness: 1 },
          mValues: { curve_lateral_accel: lateralAccel },
        }).command,
        evasion = command.evasion!;
      return {
        curveLateralAccelMps2: lateralAccel,
        lateralAccelMps2: round(evasion.lateralAccelMps2, 6),
        reachableOffsetM: round(evasion.reachableOffsetM, 6),
        offsetM: round(evasion.offsetM, 6),
      };
    }),
    compatYield = [3, 8].map((gap) => {
      const low = evaluate(sceneOf('pedestrian_yield_probability'), {
          rValues: { pedestrian_yield_probability: 0 },
          mValues: { yield_time_gap: gap },
        }).command,
        high = evaluate(sceneOf('pedestrian_yield_probability'), {
          rValues: { pedestrian_yield_probability: 1 },
          mValues: { yield_time_gap: gap },
        }).command;
      return {
        yieldTimeGapS: gap,
        gapS: round(high.pedestrian?.gapS ?? 0, 6),
        mandatoryYield: high.pedestrian?.mandatoryYield === true,
        yieldedAtZero: low.pedestrian?.yielded === true,
        yieldedAtOne: high.pedestrian?.yielded === true,
      };
    }),
    geometry: readonly HazardPolicyGeometryRow[] = (
      [
        ['sedan', 'dry-asphalt'],
        ['compact', 'dry-asphalt'],
        ['sedan', 'reduced-adhesion'],
      ] as const
    ).map(([classId, surfaceId]) => {
      const command = evaluate(
          {
            name: `geometrie ${classId}/${surfaceId}`,
            description: 'o bandă liberă, fără hazard: numai geometria și aderența livrate',
            speedMps: 5,
            postedLimitMps: 15,
            classId,
            surfaceId,
          },
          {},
        ).command,
        geometryOf = command.geometry,
        widthM = geometryOf.widthM;
      return {
        classId,
        surfaceId,
        widthM,
        brakeAccelerationMps2: geometryOf.brakeAccelerationMps2,
        grip: geometryOf.grip,
        tireGripScale: command.tireGripScale,
        adhesionLimitMps2: round(geometryOf.adhesionLimitMps2, 6),
        brakeCapabilityMps2: round(geometryOf.brakeCapabilityMps2, 6),
        pedestrianFloorM: round(widthM + HAZARD_POLICY_V2_LIMITS.clearanceReserveM, 6),
        coneFloorM: round(widthM / 2 + 0.3 + HAZARD_POLICY_V2_LIMITS.clearanceReserveM, 6),
        barrierFloorM: round(widthM / 2 + 2 + HAZARD_POLICY_V2_LIMITS.clearanceReserveM, 6),
      };
    }),
    sampleScene: HazardPolicyScene = {
      ...hornScene(),
      pedestrian: pedestrianScene(30, 'CROSSING', 3).pedestrian,
      obstacle: realObstacle(20),
      evasion: { side: 'LEFT', lateralSpaceM: 4.5, timeToObstacleS: 0.6 },
    },
    sampleOf = (options: Parameters<typeof evaluate>[1]) => {
      const command = evaluate(sampleScene, options).command;
      return {
        yieldSample: command.pedestrian?.sample ?? null,
        evasionSample: command.evasion?.sample ?? null,
        hornSample: command.horn?.sample ?? null,
      };
    },
    firstSamples = sampleOf({}),
    secondSamples = sampleOf({}),
    otherOpportunity = sampleOf({ opportunityKey: '183-hazard-opportunity-other' }),
    otherSeed = sampleOf({ seed: 7 }),
    samples: HazardPolicyReport['samples'] = {
      repeated: JSON.stringify(firstSamples) === JSON.stringify(secondSamples),
      otherOpportunityDiffers:
        otherOpportunity.hornSample !== firstSamples.hornSample ||
        otherOpportunity.evasionSample !== firstSamples.evasionSample ||
        otherOpportunity.yieldSample !== firstSamples.yieldSample,
      otherSeedDiffers:
        otherSeed.hornSample !== firstSamples.hornSample ||
        otherSeed.evasionSample !== firstSamples.evasionSample ||
        otherSeed.yieldSample !== firstSamples.yieldSample,
      hornWithoutPermission:
        evaluate(forbiddenHornScene(), {
          rValues: { horn_use_probability: 1 },
        }).command.horn?.sample ?? null,
      evasionWithoutSpace:
        evaluate(noSpaceScene(), {
          rValues: { evasive_steer_willingness: 1 },
        }).command.evasion?.sample ?? null,
      yieldWhileWaiting:
        evaluate(pedestrianScene(12, 'WAITING', 6), {
          rValues: { pedestrian_yield_probability: 1 },
        }).command.pedestrian?.sample ?? null,
    },
    compatibility: HazardPolicyCompatibility = {
      comfortDeceleration: compatClearance,
      reactionDelay: compatReaction,
      lateralAccel: compatLateral,
      yieldGap: compatYield,
      mUnits: Object.fromEntries(
        HAZARD_POLICY_V2_M_KEYS.map((key) => [key, getParameterDefinition(key).unit]),
      ),
      rUnits: Object.fromEntries(
        HAZARD_POLICY_V2_KEYS.map((key) => [key, getParameterDefinition(key).unit]),
      ),
    },
    floorLow = evaluate(pedestrianInsideScene, {
      rValues: { pedestrian_clearance: ranges.pedestrian_clearance[0] },
    }).command,
    floorHigh = evaluate(pedestrianInsideScene, {
      rValues: { pedestrian_clearance: ranges.pedestrian_clearance[1] },
    }).command,
    obstacleFloorLow = evaluate(obstacleInsideScene, {
      rValues: { obstacle_clearance: ranges.obstacle_clearance[0] },
    }).command,
    obstacleFloorHigh = evaluate(obstacleInsideScene, {
      rValues: { obstacle_clearance: ranges.obstacle_clearance[1] },
    }).command,
    cappedLow = evaluate(cappedReactionScene, {
      rValues: { hazard_reaction_delay: ranges.hazard_reaction_delay[0] },
    }).command,
    cappedHigh = evaluate(cappedReactionScene, {
      rValues: { hazard_reaction_delay: ranges.hazard_reaction_delay[1] },
    }).command,
    adhesionLow = evaluate(reducedAdhesionScene(), {
      rValues: { emergency_brake_intensity: 0.5 },
    }).command,
    adhesionHigh = evaluate(reducedAdhesionScene(), {
      rValues: { emergency_brake_intensity: 1 },
    }).command,
    dryTop = evaluate(emergencyScene(), { rValues: { emergency_brake_intensity: 1 } }).command,
    noSpaceLow = evaluate(noSpaceScene(), {
      rValues: { evasive_steer_willingness: 0 },
    }).command,
    noSpaceHigh = evaluate(noSpaceScene(), {
      rValues: { evasive_steer_willingness: 1 },
    }).command,
    spaceLow = evaluate(evasionScene(), {
      rValues: { evasive_steer_willingness: 0 },
    }).command,
    spaceHigh = evaluate(evasionScene(), {
      rValues: { evasive_steer_willingness: 1 },
    }).command,
    hornForbidden = evaluate(forbiddenHornScene(), {
      rValues: { horn_use_probability: 1 },
    }).command,
    hornPermittedLow = evaluate(hornScene(), {
      rValues: { horn_use_probability: 0 },
    }).command,
    hornPermittedHigh = evaluate(hornScene(), {
      rValues: { horn_use_probability: 1 },
    }).command,
    yieldLow = evaluate(mandatoryYieldScene, {
      rValues: { pedestrian_yield_probability: 0 },
    }).command,
    yieldHigh = evaluate(mandatoryYieldScene, {
      rValues: { pedestrian_yield_probability: 1 },
    }).command,
    discretionary = sceneOf('pedestrian_yield_probability'),
    discretionaryLow = evaluate(discretionary, {
      rValues: { pedestrian_yield_probability: 0 },
    }).command,
    discretionaryHigh = evaluate(discretionary, {
      rValues: { pedestrian_yield_probability: 1 },
    }).command,
    sedan = geometry[0],
    compact = geometry[1],
    reduced = geometry[2],
    compliance: readonly {
      readonly id: string;
      readonly pass: boolean;
      readonly detail: string;
    }[] = [
      {
        id: 'pedestrian-floor',
        pass:
          round(floorLow.clearance.pedestrian?.effectiveM ?? 0, 6) ===
            round(sedan.pedestrianFloorM, 6) &&
          round(floorHigh.clearance.pedestrian?.effectiveM ?? 0, 6) ===
            ranges.pedestrian_clearance[1] &&
          floorLow.clearance.pedestrian?.floored === true &&
          floorLow.commandedSpeedMps === 0 &&
          floorHigh.commandedSpeedMps === 0,
        detail: `0,10 m → ${round(floorLow.clearance.pedestrian?.effectiveM ?? 0, 3)} m (ridicat), 6 m → ${round(floorHigh.clearance.pedestrian?.effectiveM ?? 0, 3)} m; viteza comandată ${floorLow.commandedSpeedMps} / ${floorHigh.commandedSpeedMps} m/s`,
      },
      {
        id: 'obstacle-floor',
        pass:
          round(obstacleFloorLow.clearance.obstacle?.effectiveM ?? 0, 6) ===
            round(sedan.barrierFloorM, 6) &&
          round(obstacleFloorHigh.clearance.obstacle?.effectiveM ?? 0, 6) ===
            ranges.obstacle_clearance[1] &&
          obstacleFloorLow.clearance.obstacle?.floored === true &&
          obstacleFloorLow.commandedSpeedMps === 0 &&
          obstacleFloorHigh.commandedSpeedMps === 0,
        detail: `0,10 m → ${round(obstacleFloorLow.clearance.obstacle?.effectiveM ?? 0, 3)} m (ridicat), 4 m → ${round(obstacleFloorHigh.clearance.obstacle?.effectiveM ?? 0, 3)} m; viteza comandată ${obstacleFloorLow.commandedSpeedMps} / ${obstacleFloorHigh.commandedSpeedMps} m/s`,
      },
      {
        id: 'reaction-cap',
        pass:
          cappedHigh.reaction?.saturated === true &&
          cappedHigh.reaction?.delayS === cappedHigh.reaction?.maximumFeasibleDelayS &&
          (cappedHigh.reaction?.delayS ?? 0) < ranges.hazard_reaction_delay[1] &&
          (cappedHigh.reaction?.stoppingMarginM ?? -1) >= -1e-9 &&
          cappedLow.reaction?.saturated === false &&
          (cappedLow.reaction?.stoppingMarginM ?? -1) > 0,
        detail: `${ranges.hazard_reaction_delay[0]} s → ${round(cappedLow.reaction?.delayS ?? 0, 3)} s (marjă ${round(cappedLow.reaction?.stoppingMarginM ?? 0, 3)} m), ${ranges.hazard_reaction_delay[1]} s → ${round(cappedHigh.reaction?.delayS ?? 0, 3)} s (saturat, marjă ${round(cappedHigh.reaction?.stoppingMarginM ?? 0, 3)} m)`,
      },
      {
        id: 'adhesion-cap',
        pass:
          adhesionHigh.emergencyBrake?.adhesionLimited === true &&
          adhesionLow.emergencyBrake?.adhesionLimited === false &&
          round(adhesionHigh.emergencyBrake?.decelerationMps2 ?? 0, 6) ===
            round(reduced.adhesionLimitMps2, 6) &&
          round(adhesionLow.emergencyBrake?.decelerationMps2 ?? 0, 6) === 4 &&
          round(dryTop.emergencyBrake?.decelerationMps2 ?? 0, 6) === 8,
        detail: `aderență redusă: 0,5 → ${round(adhesionLow.emergencyBrake?.decelerationMps2 ?? 0, 6)} m/s², 1 → ${round(adhesionHigh.emergencyBrake?.decelerationMps2 ?? 0, 6)} m/s² (cerut ${round(adhesionHigh.emergencyBrake?.requestedDecelerationMps2 ?? 0, 6)}); uscat 1 → ${round(dryTop.emergencyBrake?.decelerationMps2 ?? 0, 6)} m/s²`,
      },
      {
        id: 'evasion-subordination',
        pass:
          noSpaceLow.evasion?.feasible === false &&
          noSpaceHigh.evasion?.feasible === false &&
          noSpaceLow.evasion?.offsetM === 0 &&
          noSpaceHigh.evasion?.offsetM === 0 &&
          spaceLow.evasion?.offsetM === 0 &&
          (spaceHigh.evasion?.offsetM ?? 0) > 0 &&
          (spaceHigh.evasion?.offsetM ?? 0) <= (spaceHigh.evasion?.spareM ?? 0) + 1e-9,
        detail: `fără spațiu (3,00 m < ${round(noSpaceHigh.evasion?.requiredSpaceM ?? 0, 3)} m): ${noSpaceLow.evasion?.offsetM} / ${noSpaceHigh.evasion?.offsetM} m; cu spațiu: ${spaceLow.evasion?.offsetM} → ${round(spaceHigh.evasion?.offsetM ?? 0, 3)} m`,
      },
      {
        id: 'horn-subordination',
        pass:
          hornForbidden.horn?.sample === null &&
          hornForbidden.horn?.used === false &&
          hornForbidden.reason === 'HORN_FORBIDDEN' &&
          hornPermittedLow.horn?.used === false &&
          hornPermittedHigh.horn?.used === true &&
          hornPermittedHigh.horn?.sample !== null,
        detail: `interzis: eșantion ${String(hornForbidden.horn?.sample)}, folosit ${String(hornForbidden.horn?.used)}; permis: 0 → ${String(hornPermittedLow.horn?.used)}, 1 → ${String(hornPermittedHigh.horn?.used)}`,
      },
      {
        id: 'mandatory-yield',
        pass:
          yieldLow.pedestrian?.mandatoryYield === true &&
          yieldLow.pedestrian?.yielded === true &&
          yieldHigh.pedestrian?.yielded === true &&
          discretionaryLow.pedestrian?.mandatoryYield === false &&
          discretionaryLow.pedestrian?.yielded === false &&
          discretionaryHigh.pedestrian?.yielded === true,
        detail: `obligatoriu (marjă ${round(yieldLow.pedestrian?.gapS ?? 0, 3)} s < ${yieldLow.pedestrian?.yieldGapS} s): cedare ${String(yieldLow.pedestrian?.yielded)} la 0; discreționar (marjă ${round(discretionaryLow.pedestrian?.gapS ?? 0, 3)} s): ${String(discretionaryLow.pedestrian?.yielded)} → ${String(discretionaryHigh.pedestrian?.yielded)}`,
      },
      {
        id: 'm-comfort',
        pass:
          compatClearance[0]!.speedCapMps < compatClearance[1]!.speedCapMps &&
          compatClearance[1]!.speedCapMps < compatClearance[2]!.speedCapMps,
        detail: `comfort_deceleration 2 / 2,5 / 8 m/s² → plafon ${compatClearance.map((entry) => entry.speedCapMps).join(' / ')} m/s`,
      },
      {
        id: 'm-reaction',
        pass:
          compatReaction.every(
            (entry) =>
              entry.inheritedDelayS === entry.brakeReactionDelayS &&
              Math.abs(entry.demandedDelayS - (entry.brakeReactionDelayS + 0.5)) < 1e-9,
          ) &&
          compatReaction[0]!.delayTicks === 30 &&
          compatReaction[1]!.delayTicks === 60,
        detail: `delay M 0 / 0,5 / 3 s + 0,5 s R → ${compatReaction.map((entry) => `${entry.demandedDelayS} s (${entry.delayTicks} tick-uri)`).join(' / ')}`,
      },
      {
        id: 'm-lateral',
        pass:
          compatLateral[1]!.reachableOffsetM > compatLateral[0]!.reachableOffsetM &&
          compatLateral[1]!.offsetM > compatLateral[0]!.offsetM,
        detail: `curve_lateral_accel 2,5 → ${compatLateral[0]!.offsetM} m, 8 → ${compatLateral[1]!.offsetM} m`,
      },
      {
        id: 'm-yield-gap',
        pass:
          compatYield[0]!.mandatoryYield === false &&
          compatYield[0]!.yieldedAtZero === false &&
          compatYield[0]!.yieldedAtOne === true &&
          compatYield[1]!.mandatoryYield === true &&
          compatYield[1]!.yieldedAtZero === true,
        detail: `yield_time_gap 3 s → obligatoriu ${String(compatYield[0]!.mandatoryYield)} (0 → ${String(compatYield[0]!.yieldedAtZero)}, 1 → ${String(compatYield[0]!.yieldedAtOne)}); 8 s → obligatoriu ${String(compatYield[1]!.mandatoryYield)} (0 → ${String(compatYield[1]!.yieldedAtZero)})`,
      },
      {
        id: 'geometry',
        pass:
          sedan.widthM === 1.8 &&
          compact.widthM === 1.6 &&
          sedan.pedestrianFloorM === 2.3 &&
          compact.pedestrianFloorM === 2.1 &&
          round(sedan.adhesionLimitMps2, 6) === 12.753 &&
          round(reduced.adhesionLimitMps2, 6) === 4.46355 &&
          sedan.brakeCapabilityMps2 === 8 &&
          compact.brakeCapabilityMps2 === 9,
        detail: `lățimi ${sedan.widthM} / ${compact.widthM} m; aderență ${sedan.adhesionLimitMps2} / ${compact.adhesionLimitMps2} / ${reduced.adhesionLimitMps2} m/s²; capacitate ${sedan.brakeCapabilityMps2} / ${compact.brakeCapabilityMps2} m/s²`,
      },
    ],
    fingerprint = () =>
      JSON.stringify(
        scenarioRows.flatMap((row) => {
          const [low, high] = ranges[row.key];
          return [
            evaluate(row.scene, { rValues: { [row.key]: low } }).command,
            evaluate(row.scene, { rValues: { [row.key]: high } }).command,
          ];
        }),
      ),
    determinismDigest = digest(fingerprint()),
    repeatedDigest = digest(fingerprint()),
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
    foreignProfile = (() => {
      try {
        evaluate(discretionary, { profile: { ...evaluate(discretionary).profile } });
        return 'ADMITTED';
      } catch {
        return 'REFUSED';
      }
    })(),
    wrongObservationVersion = (() => {
      try {
        evaluate(discretionary, {
          observation: {
            ...evaluate(discretionary).input.observation,
            version: '183-hazard-observation-v0' as '183-hazard-observation-v1',
          },
        });
        return 'ADMITTED';
      } catch {
        return 'REFUSED';
      }
    })(),
    inconsistentCrossing = (() => {
      try {
        evaluate(discretionary, {
          observation: {
            ...evaluate(discretionary).input.observation,
            pedestrian: {
              pedestrianId: 'p',
              state: 'CROSSING',
              distanceM: 10,
              crossingRemainingS: null,
            },
          },
        });
        return 'ADMITTED';
      } catch {
        return 'REFUSED';
      }
    })(),
    negativeDistance = (() => {
      try {
        evaluate(discretionary, {
          observation: {
            ...evaluate(discretionary).input.observation,
            pedestrian: {
              pedestrianId: 'p',
              state: 'WAITING',
              distanceM: -1,
              crossingRemainingS: null,
            },
          },
        });
        return 'ADMITTED';
      } catch {
        return 'REFUSED';
      }
    })(),
    wrongMechanics = (() => {
      try {
        evaluate(discretionary, {
          observation: {
            ...evaluate(discretionary).input.observation,
            mechanics: {
              version: '023-mechanics-v0' as '023-mechanics-v1',
              classId: 'sedan',
            },
          },
        });
        return 'ADMITTED';
      } catch {
        return 'REFUSED';
      }
    })(),
    checks: readonly HazardPolicyCheck[] = [
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
        'units',
        parameters.every((entry) => entry.unit === expectedUnits[entry.key as HazardPolicyV2Key]) &&
          HAZARD_POLICY_V2_M_KEYS.every((key) => compatibility.mUnits[key] === expectedMUnits[key]),
        `R: ${parameters.map((entry) => `${entry.key} ${entry.unit}`).join(', ')}; M: ${Object.entries(
          compatibility.mUnits,
        )
          .map(([key, unit]) => `${key} ${unit}`)
          .join(', ')}`,
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
      check(
        'safety-clearance',
        compliance[0]!.pass && compliance[1]!.pass,
        `${compliance[0]!.detail}; ${compliance[1]!.detail}`,
      ),
      check('safety-reaction', compliance[2]!.pass, compliance[2]!.detail),
      check('safety-adhesion', compliance[3]!.pass, compliance[3]!.detail),
      check('safety-evasion', compliance[4]!.pass, compliance[4]!.detail),
      check('safety-horn', compliance[5]!.pass, compliance[5]!.detail),
      check('mandatory-yield', compliance[6]!.pass, compliance[6]!.detail),
      check(
        'm-compatible',
        compliance[7]!.pass &&
          compliance[8]!.pass &&
          compliance[9]!.pass &&
          compliance[10]!.pass &&
          compatibility.rUnits.pedestrian_clearance === 'm' &&
          compatibility.rUnits.hazard_reaction_delay === 's' &&
          compatibility.rUnits.emergency_brake_intensity === 'ratio' &&
          compatibility.rUnits.evasive_steer_willingness === 'probability' &&
          compatibility.rUnits.crosswalk_approach_speed === 'm/s' &&
          compatibility.rUnits.horn_use_probability === 'probability' &&
          compatibility.rUnits.pedestrian_yield_probability === 'probability' &&
          compatibility.rUnits.obstacle_clearance === 'm' &&
          Object.values(hazardPolicyMValues).every((value) => Number.isFinite(value)),
        `${compliance[7]!.detail}; ${compliance[8]!.detail}; ${compliance[9]!.detail}; ${compliance[10]!.detail}`,
      ),
      check('geometry', compliance[11]!.pass, compliance[11]!.detail),
      check(
        'samples',
        samples.repeated &&
          samples.otherOpportunityDiffers &&
          samples.otherSeedDiffers &&
          samples.hornWithoutPermission === null &&
          samples.evasionWithoutSpace === null &&
          samples.yieldWhileWaiting === null,
        `repetare identică ${samples.repeated}, altă oportunitate diferă ${samples.otherOpportunityDiffers}, alt seed diferă ${samples.otherSeedDiffers}, eșantioane absente: claxon ${String(samples.hornWithoutPermission)}, ocolire ${String(samples.evasionWithoutSpace)}, așteptare ${String(samples.yieldWhileWaiting)}`,
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
          foreignProfile === 'REFUSED' &&
          wrongObservationVersion === 'REFUSED' &&
          inconsistentCrossing === 'REFUSED' &&
          negativeDistance === 'REFUSED' &&
          wrongMechanics === 'REFUSED',
        `manual ${manual.reason}, vechi ${stale.reason}, actor ${foreignActor.reason}, sesiune ${foreignScope.reason}, profil lipsă ${missingProfile.reason}; refuzate: token ${foreignProfile}, versiune ${wrongObservationVersion}, traversare inconsistentă ${inconsistentCrossing}, distanță negativă ${negativeDistance}, mecanică ${wrongMechanics}`,
      ),
    ];
  const passed = checks.filter((entry) => entry.pass).length,
    crossing = realCrossing();
  return {
    version: '183-hazard-policy-v2',
    fixture: {
      crosswalkId: crossing.crosswalkId,
      laneId: crossing.laneId,
      pedestrianId: crossing.pedestrianId,
      crossingLengthM: round(crossing.crossingLengthM, 6),
      walkSpeedMps: round(crossing.walkSpeedMps, 6),
      crossingRemainingS: round(crossing.crossingRemainingS, 6),
      waitingDistanceM: round(crossing.waitingDistanceM, 6),
      crossingDistanceM: round(crossing.crossingDistanceM, 6),
      obstacleLaneId: FIXTURE_LANE.id,
      obstacleAtM: FIXTURE_LANE.obstacleAtM,
      headingRad: round(FIXTURE_LANE.headingRad, 6),
    },
    parameters,
    scenarios: scenarioRows.map((row) => ({ name: row.name, scenario: row.scene.description })),
    effects,
    separation,
    couplings,
    safety,
    compliance,
    compatibility,
    geometry,
    samples,
    determinism: {
      decisions: scenarioRows.length * 2,
      digest: determinismDigest,
      repeatedDigest,
    },
    checks,
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}

export function hazardPolicyReportMarkdown(report: HazardPolicyReport): string {
  const effectHeader = [
    '| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  const effectRows = (entries: readonly HazardPolicyEffect[]) =>
    entries
      .map(
        (entry) =>
          `| \`${entry.key}\` | ${entry.scenario} | ${entry.lowValue} | ${entry.lowOutcome.toFixed(3)} | ${entry.highValue} | ${entry.highOutcome.toFixed(3)} | ${entry.difference.toFixed(3)} | ${entry.unit} |`,
      )
      .join('\n');
  const separationRows = (entries: readonly HazardPolicyEffect[]) =>
    entries
      .map(
        (entry) =>
          `| \`${entry.key}\` | ${entry.scenario} | ${entry.lowValue} | ${entry.highValue} | ${entry.difference.toFixed(3)} | ${entry.coupling ? '**cuplaj**' : 'inertă'} |`,
      )
      .join('\n');
  const safetyRows = (entries: readonly HazardPolicySafetyRow[]) =>
    entries
      .map(
        (entry) =>
          `| ${entry.id} | \`${entry.key}\` | ${entry.scenario} | ${entry.lowValue} | ${entry.lowOutcome.toFixed(3)} | ${entry.highValue} | ${entry.highOutcome.toFixed(3)} | ${entry.unit} | ${entry.verdict} |`,
      )
      .join('\n');
  return [
    '# 183 — raport politică extinsă pentru pietoni și pericole',
    '',
    'Generat de `scripts/run-v2-hazard-policy-report.mjs` din contractul `183-hazard-policy-v2`.',
    'Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei.',
    'Faptele de pieton vin dintr-o traversare reală `164-pedestrians-v1`, iar faptele de obstacol și',
    'stimul din lumea reală `165-hazards-v1`; geometria și aderența vin din clasele `023` și suprafețele',
    '`026`.',
    '',
    '## Scenariile',
    '',
    '| Scenariu | Descriere |',
    '| --- | --- |',
    ...report.scenarios.map((entry) => `| ${entry.name} | ${entry.scenario} |`),
    '',
    '## Efectul izolat al fiecărei chei',
    '',
    ...effectHeader,
    effectRows(report.effects),
    '',
    '## Separarea cheilor',
    '',
    'Cheia scenariului rămâne la valoarea implicită din catalog, iar fiecare altă cheie este dusă de',
    `la minim la maxim: **${report.separation.length - report.couplings.length}/${report.separation.length}** perechi sunt inerte în scenariul lor,`,
    'deci nicio cheie nu se amestecă în canalul alteia.',
    '',
    '| Cheie | Scenariu | Valoare joasă | Valoare ridicată | Diferență | Separată |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    separationRows(report.separation),
    '',
    '## Cele patru limite de siguranță',
    '',
    '| Limită | Cheie | Scenariu | Joasă | Rezultat joasă | Ridicată | Rezultat ridicată | Unitate | Verdict |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
    safetyRows(report.safety),
    '',
    `- Minimul de spațiu: \`max(cheie, trackM + ${HAZARD_POLICY_V2_LIMITS.clearanceReserveM} m)\` pentru un pieton și \`max(cheie, trackM / 2 + halfWidth + ${HAZARD_POLICY_V2_LIMITS.clearanceReserveM} m)\` pentru un obstacol; un hazard deja în marjă comandă 0 m/s la orice valoare.`,
    '- Plafonul de reacție: întârzierea este `min(cheie + M brake_reaction_delay, (cameră − v² / (2 · capability)) / v)`; o valoare peste plafon este saturată și raportată.',
    '- Plafonul de aderență: decelerația este `min(cheie · brakeAcceleration, grip · tireGripScale · g)`; pe `reduced-adhesion` limita fizică este 4,463550 m/s², sub capacitatea de 8 m/s².',
    '- Subordonarea: fără spațiul lateral verificat, `evasive_steer_willingness` este inertă; unde claxonul este interzis, `horn_use_probability` este inertă și eșantionul nu se trage.',
    '',
    '## Compatibilitate cu cheile M',
    '',
    '| `comfort_deceleration` (m/s²) | Plafon de viteză la pieton (m/s) |',
    '| ---: | ---: |',
    ...report.compatibility.comfortDeceleration.map(
      (entry) => `| ${entry.comfortDecelerationMps2} | ${entry.speedCapMps} |`,
    ),
    '',
    '| `brake_reaction_delay` (s) | Moștenit (s) | Cerut cu 0,5 s R (s) | Tick-uri | Saturație |',
    '| ---: | ---: | ---: | ---: | --- |',
    ...report.compatibility.reactionDelay.map(
      (entry) =>
        `| ${entry.brakeReactionDelayS} | ${entry.inheritedDelayS} | ${entry.demandedDelayS} | ${entry.delayTicks} | ${entry.saturated ? 'da' : 'nu'} |`,
    ),
    '',
    '| `curve_lateral_accel` (m/s²) | Accelerație laterală folosită | Deplasare realizabilă (m) | Deplasare commitată (m) |',
    '| ---: | ---: | ---: | ---: |',
    ...report.compatibility.lateralAccel.map(
      (entry) =>
        `| ${entry.curveLateralAccelMps2} | ${entry.lateralAccelMps2} | ${entry.reachableOffsetM} | ${entry.offsetM} |`,
    ),
    '',
    '| `yield_time_gap` (s) | Marjă reală (s) | Cedare obligatorie | Cedare la 0 | Cedare la 1 |',
    '| ---: | ---: | --- | --- | --- |',
    ...report.compatibility.yieldGap.map(
      (entry) =>
        `| ${entry.yieldTimeGapS} | ${entry.gapS} | ${entry.mandatoryYield ? 'da' : 'nu'} | ${entry.yieldedAtZero ? 'da' : 'nu'} | ${entry.yieldedAtOne ? 'da' : 'nu'} |`,
    ),
    '',
    `- Unități M: ${Object.entries(report.compatibility.mUnits)
      .map(([key, unit]) => `\`${key}\` ${unit}`)
      .join(', ')}.`,
    `- Unități R: ${Object.entries(report.compatibility.rUnits)
      .map(([key, unit]) => `\`${key}\` ${unit}`)
      .join(', ')}.`,
    '',
    '## Geometria și aderența livrate',
    '',
    '| Clasă | Suprafață | Lățime (m) | Frânare (m/s²) | Aderență (m/s²) | Capacitate (m/s²) | Marja pieton (m) | Marja con (m) | Marja barieră (m) |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.geometry.map(
      (entry) =>
        `| ${entry.classId} | ${entry.surfaceId} | ${entry.widthM} | ${entry.brakeAccelerationMps2} | ${entry.adhesionLimitMps2} | ${entry.brakeCapabilityMps2} | ${entry.pedestrianFloorM} | ${entry.coneFloorM} | ${entry.barrierFloorM} |`,
    ),
    '',
    '## Eșantioane per oportunitate',
    '',
    `- Reevaluarea aceleiași oportunități dă aceleași eșantioane: **${report.samples.repeated}**.`,
    `- Altă oportunitate diferă: **${report.samples.otherOpportunityDiffers}**; alt seed diferă: **${report.samples.otherSeedDiffers}**.`,
    `- Fără permisiune de claxon eșantionul este \`${String(report.samples.hornWithoutPermission)}\`, fără spațiu lateral \`${String(report.samples.evasionWithoutSpace)}\`, iar la un pieton care așteaptă \`${String(report.samples.yieldWhileWaiting)}\`.`,
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
