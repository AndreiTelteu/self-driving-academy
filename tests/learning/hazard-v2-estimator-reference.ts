import type { BehaviorActor, BehaviorScope } from '../../src/autonomy/behavior-fsm';
import { HAZARD_POLICY_V2_LIMITS } from '../../src/autonomy/hazard-policy-v2';
import type {
  HazardPolicyV2Command,
  HazardPolicyV2Key,
  HazardPolicyV2MKey,
} from '../../src/autonomy/hazard-policy-v2';
import type { OpportunityKind } from '../../src/telemetry';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../../src/telemetry';
import { deriveOpportunitySeed, randomUnit } from '../../src/sessions';
import type { RoadSurfaceId } from '../../src/vehicles';
import type {
  HazardV2EvidenceEpisode,
  HazardV2EvidenceSample,
} from '../../src/learning/hazard-v2-estimator';
import { hazardV2PolicyActive } from '../../src/learning/hazard-v2-estimator';
import {
  evaluate,
  hazardPolicyMValues,
  realObstacle,
  realStimulus,
} from '../autonomy/hazard-policy-v2-reference';
import type { HazardPolicyScene } from '../autonomy/hazard-policy-v2-reference';
import {
  createPedestrianWorld,
  pedestrianTarget,
  vehicleBefore,
} from '../world/pedestrians-fixture';

/**
 * Deterministic 184 fixtures. The policy facts are not hand-written numbers:
 *
 * - Every crossing comes from a real `164-pedestrians-v1` run over the authored neighbourhood: the
 *   pedestrian identity, the crossing length, the walk speed and the remaining crossing time are the
 *   ones the delivered module reports. The ego distance in front of the crossing line is the
 *   scenario's own, exactly like the 183 fixture, so the gap over the pedestrian is chosen, not
 *   invented by the estimator.
 * - Every obstacle and every stimulus comes from a real `165-hazards-v1` world, and every command is
 *   produced by the delivered `183-hazard-policy-v2` layer with a known key set.
 * - The evidence sample is the projection of that command: no R value of the profile ever reaches
 *   the sample. The four M values of the episode are declared separately, because the two clearance
 *   caps and the reaction delay cannot be inverted without them.
 *
 * The values are plausible demonstrations, not measured data: they prove the context, the two
 * identifiability traps, the uncertainty, the split and the refusal contract of the learning layer,
 * not the final calibration of a style.
 */
export const hazardEvidenceScene = Object.freeze({
  sessionId: '184-test',
  worldEpoch: 0,
  actor: { id: 'car', incarnation: 1 } as BehaviorActor,
  scope: { sessionId: '184-test', worldEpoch: 0 } as BehaviorScope,
  seed: 0x5eed_0184,
  profileId: '184-fixture',
  versionId: '184-fixture-v1',
});

/** The style the fixture demonstrates. Every value is inside the 092 catalog range. */
export const TRUE_HAZARD_PROFILE: Readonly<Record<HazardPolicyV2Key, number>> = Object.freeze({
  pedestrian_yield_probability: 0.5,
  pedestrian_clearance: 2.5,
  hazard_reaction_delay: 0.8,
  obstacle_clearance: 2.4,
  emergency_brake_intensity: 0.65,
  evasive_steer_willingness: 0.3,
  crosswalk_approach_speed: 6,
  horn_use_probability: 0.25,
});

export interface RealCrossing {
  readonly pedestrianId: string;
  readonly crosswalkId: string;
  readonly crossingLengthM: number;
  readonly walkSpeedMps: number;
  /** Seconds the pedestrian still needs to clear the ego path, exactly `remaining / walkSpeed`. */
  readonly crossingRemainingS: number;
}
let cachedCrossings: readonly RealCrossing[] | null = null;
/**
 * Two real pedestrians of the same authored crosswalk: `pedestriansPerCrosswalk: 2` gives the two
 * directions of the link, so the identities and the walking speeds are the module's own. The ego is
 * a scripted 2 m/s approach from 60 m, slow enough that both pedestrians really start to cross.
 */
export function realCrossings(): readonly RealCrossing[] {
  if (cachedCrossings !== null) return cachedCrossings;
  const world = createPedestrianWorld({ seed: 4711, pedestriansPerCrosswalk: 2 }),
    target = pedestrianTarget(world.getLinks()),
    ids = world
      .getPedestrians()
      .filter((pedestrian) => pedestrian.crosswalkId === target.crosswalkId)
      .map((pedestrian) => pedestrian.pedestrianId),
    found = new Map<string, RealCrossing>();
  let distance = 60;
  for (let tick = 0; tick < 3600 && found.size < ids.length; tick += 1) {
    world.step({
      tick,
      vehicles: [vehicleBefore(target, distance, 2)],
      vehiclesComplete: true,
    });
    for (const pedestrianId of ids) {
      const snapshot = world.getPedestrian(pedestrianId);
      if (snapshot === null || snapshot.state !== 'CROSSING' || found.has(pedestrianId)) continue;
      found.set(
        pedestrianId,
        Object.freeze({
          pedestrianId,
          crosswalkId: target.crosswalkId,
          crossingLengthM: snapshot.crossingLengthM,
          walkSpeedMps: snapshot.walkSpeedMps,
          crossingRemainingS: snapshot.crossingRemainingM / snapshot.walkSpeedMps,
        }),
      );
    }
    distance -= 2 / HAZARD_POLICY_V2_LIMITS.tickHz;
  }
  if (found.size < 2)
    throw new Error('The real 164 fixture did not produce two crossing pedestrians');
  cachedCrossings = Object.freeze([...found.values()]);
  return cachedCrossings;
}

/** The opportunity keys whose deterministic sample of `sampleKey` lands in `(minimum, maximum]`. */
export function opportunityKeys(
  sampleKey: string,
  amount: number,
  minimum: number,
  maximum: number,
  prefix: string,
  seed: number = hazardEvidenceScene.seed,
): string[] {
  const keys: string[] = [];
  for (let index = 0; keys.length < amount; index += 1) {
    const key = `${prefix}-${index}`,
      sample = randomUnit(deriveOpportunitySeed(seed, key), sampleKey, 0);
    if (sample > minimum && sample <= maximum) keys.push(key);
  }
  return keys;
}
/** The sample 183 will draw for this opportunity and channel: asserted, never recomputed by hand. */
export function sampleOfOpportunity(
  sampleKey: string,
  opportunityKey: string,
  seed: number = hazardEvidenceScene.seed,
): number {
  return randomUnit(deriveOpportunitySeed(seed, opportunityKey), sampleKey, 0);
}

interface EpisodeStep {
  readonly tick: number;
  readonly scene: HazardPolicyScene;
  readonly opportunityKey: string;
  readonly rValues?: Partial<Record<HazardPolicyV2Key, number>>;
  readonly mValues?: Partial<Record<HazardPolicyV2MKey, number>>;
  /** Overrides of the recorded M facts, used by the identifiability demonstrations. */
  readonly declaredM?: Partial<{
    readonly comfortDecelerationMps2: number | null;
    readonly brakeReactionDelayS: number | null;
  }>;
}
function declaredMOf(step: EpisodeStep) {
  const values = { ...hazardPolicyMValues, ...step.mValues };
  return {
    comfortDecelerationMps2:
      step.declaredM?.comfortDecelerationMps2 === undefined
        ? values.comfort_deceleration
        : step.declaredM.comfortDecelerationMps2,
    brakeReactionDelayS:
      step.declaredM?.brakeReactionDelayS === undefined
        ? values.brake_reaction_delay
        : step.declaredM.brakeReactionDelayS,
    curveLateralAccelMps2: values.curve_lateral_accel,
    yieldTimeGapS: values.yield_time_gap,
  };
}
function sampleOf(command: HazardPolicyV2Command, step: EpisodeStep): HazardV2EvidenceSample {
  return {
    tick: command.decisionTick,
    speedMps: step.scene.speedMps,
    postedLimitMps: command.postedLimitMps,
    policyActive: hazardV2PolicyActive(command.reason),
    reason: command.reason,
    action: command.action,
    geometry: {
      classId: command.geometry.classId,
      widthM: command.geometry.widthM,
      brakeAccelerationMps2: command.geometry.brakeAccelerationMps2,
      adhesionLimitMps2: command.geometry.adhesionLimitMps2,
      brakeCapabilityMps2: command.geometry.brakeCapabilityMps2,
    },
    surfaceId: command.surfaceId,
    declaredM: declaredMOf(step),
    pedestrian:
      command.pedestrian === null
        ? null
        : {
            pedestrianId: command.pedestrian.pedestrianId,
            state: command.pedestrian.state,
            distanceM: command.pedestrian.distanceM,
            crossingRemainingS: command.pedestrian.crossingRemainingS,
            gapS: command.pedestrian.gapS,
            yieldGapS: command.pedestrian.yieldGapS,
            mandatoryYield: command.pedestrian.mandatoryYield,
            sample: command.pedestrian.sample,
            yielded: command.pedestrian.yielded,
          },
    obstacleId: step.scene.obstacle?.obstacleId ?? null,
    clearance: {
      pedestrian: command.clearance.pedestrian,
      obstacle: command.clearance.obstacle,
    },
    reaction: command.reaction,
    emergencyBrake: command.emergencyBrake,
    evasion: command.evasion,
    crosswalk: command.crosswalk,
    horn: command.horn,
  };
}
export function hazardEligibility(
  id: string,
  kind: OpportunityKind,
  overrides: Partial<EligibilityWindowRecord> = {},
): EligibilityWindowRecord {
  return {
    windowId: `window-${id}`,
    opportunityId: id,
    kind,
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId: 'car',
    incarnation: '1',
    segmentId: 'segment-184',
    controlMode: 'LEARNING',
    learningEligible: true,
    openedTick: 0,
    lastTick: 200_000,
    observationCount: 200_000,
    reaction: { open: false, reason: 'SEGMENT_EXCLUDED' },
    windowClass: 'ELIGIBLE',
    label: 'FREE_TRAFFIC',
    ...overrides,
  } as EligibilityWindowRecord;
}
export function hazardArtifacts(
  id: string,
  fromTick: number,
  toTick: number,
): FilteredWindowRecord {
  return {
    windowId: `window-${id}`,
    sessionId: hazardEvidenceScene.sessionId,
    worldEpoch: hazardEvidenceScene.worldEpoch,
    segmentId: 'segment-184',
    vehicleId: 'car',
    incarnation: '1',
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: fromTick,
    endTick: toTick,
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    artifacts: [],
    artifactCount: 0,
    boundaryTick: null,
    boundaryCause: null,
    suppressed: null,
    openedTick: fromTick,
    lastTick: toTick,
    observationCount: toTick - fromTick + 1,
    windowClass: 'PREFIX_ELIGIBLE',
    prefix: { fromTick, toTick, ticks: toTick - fromTick + 1 },
  } as FilteredWindowRecord;
}
export function hazardEpisode(
  id: string,
  kind: OpportunityKind,
  steps: readonly EpisodeStep[],
  occurrence = 0,
): HazardV2EvidenceEpisode {
  if (steps.length === 0) throw new Error(`Episode ${id} has no decision`);
  const samples = steps.map((step) => {
    const { command } = evaluate(step.scene, {
      tick: step.tick,
      opportunityKey: step.opportunityKey,
      rValues: step.rValues,
      mValues: step.mValues,
      seed: hazardEvidenceScene.seed,
    });
    return sampleOf(command, step);
  });
  return {
    episodeId: id,
    occurrence,
    eligibility: hazardEligibility(id, kind),
    artifacts: hazardArtifacts(id, samples[0]!.tick, samples[samples.length - 1]!.tick),
    samples,
  };
}

/** A crossing fact of the real 164 module at a scenario-chosen ego distance. */
function crossingAt(crossing: RealCrossing, speedMps: number, marginS = 4) {
  return {
    pedestrianId: crossing.pedestrianId,
    state: 'CROSSING' as const,
    // `distance / speed − remaining = marginS`, so the yield is discretionary at `yield_time_gap` 3 s.
    distanceM: speedMps * (crossing.crossingRemainingS + marginS),
    crossingRemainingS: crossing.crossingRemainingS,
  };
}
const YIELD_RANGES = Object.freeze({
  yields: [0.05, 0.45] as const,
  passes: [0.55, 0.95] as const,
});

/**
 * The pedestrian set: sixteen episodes, each with the two real pedestrians of the same crosswalk.
 * One opportunity yields and one does not, so every episode has the same demonstrated rate 1/2 and
 * the deterministic split cannot unbalance the estimate against the validation set.
 */
export function pedestrianEpisodes(): HazardV2EvidenceEpisode[] {
  const crossings = realCrossings(),
    first = crossings[0]!,
    second = crossings[1]!;
  return Array.from({ length: 24 }, (_unused, index) => {
    const yieldKey = opportunityKeys(
        HAZARD_POLICY_V2_LIMITS.yieldSampleKey,
        1,
        YIELD_RANGES.yields[0],
        YIELD_RANGES.yields[1],
        `yield-yes-${index}`,
      )[0]!,
      passKey = opportunityKeys(
        HAZARD_POLICY_V2_LIMITS.yieldSampleKey,
        1,
        YIELD_RANGES.passes[0],
        YIELD_RANGES.passes[1],
        `yield-no-${index}`,
      )[0]!,
      base = 1_000 + index * 10,
      speed = 3;
    return hazardEpisode(`pedestrian-${index}`, 'YIELD', [
      {
        tick: base,
        opportunityKey: yieldKey,
        scene: {
          name: 'traversare cedată',
          description: 'pietonul real al traversării, cu marjă peste `yield_time_gap`',
          speedMps: speed,
          pedestrian: crossingAt(first, speed),
        },
        rValues: TRUE_HAZARD_PROFILE,
      },
      {
        tick: base + 1,
        opportunityKey: passKey,
        scene: {
          name: 'traversare necedată',
          description: 'al doilea pieton real al aceleiași traversări, cu marjă peste prag',
          speedMps: speed,
          pedestrian: crossingAt(second, speed),
        },
        rValues: TRUE_HAZARD_PROFILE,
      },
    ]);
  });
}

/** The obstacle clearance set: a real authored cone, approached from twelve to nineteen metres. */
export function obstacleClearanceEpisodes(): HazardV2EvidenceEpisode[] {
  return Array.from({ length: 8 }, (_unused, index) => {
    const distance = 12 + index,
      base = 2_000 + index * 10;
    return hazardEpisode(`obstacle-clearance-${index}`, 'STOP', [
      {
        tick: base,
        opportunityKey: `obstacle-clearance-${index}`,
        scene: {
          name: 'spațiul față de obstacol',
          description: `conul real la ${distance} m, cu cheia peste podeaua fizică de 1,70 m`,
          speedMps: 6,
          obstacle: coneAt(distance),
        },
        rValues: TRUE_HAZARD_PROFILE,
      },
    ]);
  });
}
function coneAt(distanceM: number) {
  return realObstacle(distanceM, { type: 'CONE', halfSizeM: { x: 0.3, y: 0.5, z: 0.3 } });
}

/** The reaction set: eight real stimuli whose feasible delay is far above the demonstrated one. */
const REACTION_STIMULI: readonly (readonly [number, number])[] = Object.freeze([
  [38, 8],
  [45, 7],
  [50, 9],
  [42, 7.5],
  [44, 8.5],
  [47, 7.2],
  [52, 9.5],
  [38, 6.5],
]);
export function reactionEpisodes(): HazardV2EvidenceEpisode[] {
  return REACTION_STIMULI.map(([distance, speed], index) =>
    hazardEpisode(`reaction-${index}`, 'STOP', [
      {
        tick: 3_000 + index * 10,
        opportunityKey: `reaction-${index}`,
        scene: {
          name: 'reacție la pericol',
          description: `stimulul real 165 la ${distance} m, cu ${speed} m/s: întârzierea totală rămâne sub plafonul fezabil`,
          speedMps: speed,
          stimulus: realStimulus(distance, speed),
        },
        rValues: TRUE_HAZARD_PROFILE,
      },
    ]),
  );
}

/** The emergency set: the same observable stimuli on the delivered dry asphalt. */
export function emergencyEpisodes(): HazardV2EvidenceEpisode[] {
  return REACTION_STIMULI.map(([distance, speed], index) =>
    hazardEpisode(`emergency-${index}`, 'STOP', [
      {
        tick: 4_000 + index * 10,
        opportunityKey: `emergency-${index}`,
        scene: {
          name: 'frânare de urgență',
          description: `același stimul real 165, cu aderența uscată: intensitatea rămâne sub plafonul de anvelopă`,
          speedMps: speed,
          stimulus: realStimulus(distance, speed),
        },
        rValues: TRUE_HAZARD_PROFILE,
      },
    ]),
  );
}

const EVASION_RANGES = Object.freeze({
  accepted: [0.26, 0.295] as const,
  refused: [0.305, 0.34] as const,
});
function evasiveScene(side: 'LEFT' | 'RIGHT') {
  return {
    name: 'ocolire',
    description:
      'conul real la 20 m, cu 4,50 m de spațiu lateral declarat: ocolirea este posibilă fizic',
    speedMps: 8,
    postedLimitMps: 15,
    obstacle: coneAt(20),
    evasion: { side, lateralSpaceM: 4.5, timeToObstacleS: 0.6 },
  } satisfies HazardPolicyScene;
}
/**
 * The evasion set: sixteen opportunities, each episode carrying one accepted side and one refused
 * side of the same authored barrier, so every episode demonstrates both bounds of the same
 * probability and the split cannot separate the two sides.
 */
export function evasionEpisodes(): HazardV2EvidenceEpisode[] {
  return Array.from({ length: 8 }, (_unused, index) => {
    const accepted = opportunityKeys(
        HAZARD_POLICY_V2_LIMITS.evasionSampleKey,
        1,
        EVASION_RANGES.accepted[0],
        EVASION_RANGES.accepted[1],
        `evasion-yes-${index}`,
      )[0]!,
      refused = opportunityKeys(
        HAZARD_POLICY_V2_LIMITS.evasionSampleKey,
        1,
        EVASION_RANGES.refused[0],
        EVASION_RANGES.refused[1],
        `evasion-no-${index}`,
      )[0]!,
      base = 5_000 + index * 10;
    return hazardEpisode(`evasion-${index}`, 'YIELD', [
      {
        tick: base,
        opportunityKey: accepted,
        scene: evasiveScene('LEFT'),
        rValues: TRUE_HAZARD_PROFILE,
      },
      {
        tick: base + 1,
        opportunityKey: refused,
        scene: evasiveScene('RIGHT'),
        rValues: TRUE_HAZARD_PROFILE,
      },
    ]);
  });
}

/** The crosswalk set: a real authored crossing, commanded below the posted limit. */
export function crosswalkEpisodes(): HazardV2EvidenceEpisode[] {
  const crosswalkId = realCrossings()[0]!.crosswalkId;
  return Array.from({ length: 8 }, (_unused, index) =>
    hazardEpisode(`crosswalk-${index}`, 'STOP', [
      {
        tick: 6_000 + index * 10,
        opportunityKey: `crosswalk-${index}`,
        scene: {
          name: 'apropiere de trecere',
          description: `trecerea reală ${crosswalkId}, la 25 m de linia autorată, cu limita postată de 15 m/s`,
          speedMps: 15,
          postedLimitMps: 15,
          crosswalk: { crosswalkId, distanceM: 25, postedLimitMps: 15 },
        },
        rValues: TRUE_HAZARD_PROFILE,
      },
    ]),
  );
}

const HORN_RANGES = Object.freeze({
  used: [0.21, 0.245] as const,
  refused: [0.255, 0.31] as const,
});
/** The horn set: one used and one unused real opportunity per episode, both permitted. */
export function hornEpisodes(): HazardV2EvidenceEpisode[] {
  return Array.from({ length: 8 }, (_unused, index) => {
    const used = opportunityKeys(
        HAZARD_POLICY_V2_LIMITS.hornSampleKey,
        1,
        HORN_RANGES.used[0],
        HORN_RANGES.used[1],
        `horn-yes-${index}`,
      )[0]!,
      refused = opportunityKeys(
        HAZARD_POLICY_V2_LIMITS.hornSampleKey,
        1,
        HORN_RANGES.refused[0],
        HORN_RANGES.refused[1],
        `horn-no-${index}`,
      )[0]!;
    return hazardEpisode(`horn-${index}`, 'YIELD', [
      {
        tick: 7_000 + index * 10,
        opportunityKey: used,
        scene: hornScene(`horn-used-184-${index}`),
        rValues: TRUE_HAZARD_PROFILE,
      },
      {
        tick: 7_000 + index * 10 + 1,
        opportunityKey: refused,
        scene: hornScene(`horn-refused-184-${index}`),
        rValues: TRUE_HAZARD_PROFILE,
      },
    ]);
  });
}
function hornScene(opportunityId: string): HazardPolicyScene {
  return {
    name: 'claxon',
    description: 'oportunitate reală de claxon 165, cu claxonul permis de lume',
    speedMps: 8,
    postedLimitMps: 15,
    horn: { opportunityId, permitted: true },
  };
}

/** The delivered positive set: sixty-four episodes covering all eight keys. */
export function positiveEpisodes(): HazardV2EvidenceEpisode[] {
  return [
    ...pedestrianEpisodes(),
    ...obstacleClearanceEpisodes(),
    ...reactionEpisodes(),
    ...emergencyEpisodes(),
    ...evasionEpisodes(),
    ...crosswalkEpisodes(),
    ...hornEpisodes(),
  ];
}

/** Clearance evidence whose stream did not record the M deceleration that composed the profile. */
export function clearanceWithoutMEpisodes(): HazardV2EvidenceEpisode[] {
  const crossings = realCrossings(),
    speed = 3;
  return Array.from({ length: 4 }, (_unused, index) =>
    hazardEpisode(`clearance-no-m-${index}`, 'YIELD', [
      {
        tick: 8_000 + index * 10,
        opportunityKey: `clearance-no-m-${index}`,
        scene: {
          name: 'spațiu fără M',
          description:
            'traversare reală și con real, într-un flux care nu a înregistrat confortul M',
          speedMps: speed,
          pedestrian: crossingAt(crossings[0]!, speed),
          obstacle: coneAt(12),
        },
        rValues: TRUE_HAZARD_PROFILE,
        declaredM: { comfortDecelerationMps2: null },
      },
    ]),
  );
}
/** Clearance evidence whose declared M does not reproduce the reported cap. */
export function clearanceWithWrongMEpisodes(): HazardV2EvidenceEpisode[] {
  const crossings = realCrossings(),
    speed = 3;
  return Array.from({ length: 4 }, (_unused, index) =>
    hazardEpisode(`clearance-wrong-m-${index}`, 'YIELD', [
      {
        tick: 8_500 + index * 10,
        opportunityKey: `clearance-wrong-m-${index}`,
        scene: {
          name: 'spațiu cu M greșit',
          description:
            'aceleași fapte reale, dar fluxul declară 3 m/s² în loc de confortul de 2 m/s² folosit',
          speedMps: speed,
          pedestrian: crossingAt(crossings[0]!, speed),
          obstacle: coneAt(12),
        },
        rValues: TRUE_HAZARD_PROFILE,
        declaredM: { comfortDecelerationMps2: 3 },
      },
    ]),
  );
}
/** Both clearances demonstrated under the physical floor: only `key <= minimum` is visible. */
export function floorClearanceEpisodes(): HazardV2EvidenceEpisode[] {
  const crossings = realCrossings(),
    speed = 3;
  return Array.from({ length: 4 }, (_unused, index) =>
    hazardEpisode(`clearance-floor-${index}`, 'YIELD', [
      {
        tick: 9_000 + index * 10,
        opportunityKey: `clearance-floor-${index}`,
        scene: {
          name: 'spațiu sub podea',
          description:
            'pieton real și barieră reală, cu o cheie sub minimele fizice `lățime + rezervă` (2,30 m) și `lățime/2 + cutie + rezervă` (3,40 m)',
          speedMps: speed,
          pedestrian: crossingAt(crossings[0]!, speed),
          obstacle: realObstacle(12),
        },
        rValues: { ...TRUE_HAZARD_PROFILE, pedestrian_clearance: 0.4, obstacle_clearance: 0.3 },
      },
    ]),
  );
}
/** A hazard already inside the effective clearance: 0 m/s at any key value. */
export function hazardInMarginEpisodes(): HazardV2EvidenceEpisode[] {
  const crossings = realCrossings(),
    speed = 3;
  return Array.from({ length: 4 }, (_unused, index) =>
    hazardEpisode(`hazard-margin-${index}`, 'YIELD', [
      {
        tick: 9_500 + index * 10,
        opportunityKey: `hazard-margin-${index}`,
        scene: {
          name: 'hazard în marjă',
          description:
            'pietonul real la 1,0 m de linie și conul real la 0,5 m: ambele spații sunt deja consumate',
          speedMps: speed,
          pedestrian: {
            pedestrianId: crossings[0]!.pedestrianId,
            state: 'CROSSING',
            distanceM: 1,
            crossingRemainingS: crossings[0]!.crossingRemainingS,
          },
          obstacle: coneAt(0.5),
        },
        rValues: TRUE_HAZARD_PROFILE,
      },
    ]),
  );
}
/** A fast, close stimulus: the demanded delay exceeds what the room still allows. */
export function saturatedReactionEpisodes(): HazardV2EvidenceEpisode[] {
  return Array.from({ length: 4 }, (_unused, index) =>
    hazardEpisode(`reaction-saturated-${index}`, 'STOP', [
      {
        tick: 10_000 + index * 10,
        opportunityKey: `reaction-saturated-${index}`,
        scene: {
          name: 'reacție saturată',
          description: 'stimul real la 20 m cu 12 m/s: plafonul de oprire taie întârzierea cerută',
          speedMps: 12,
          stimulus: realStimulus(20, 12),
        },
        rValues: { ...TRUE_HAZARD_PROFILE, hazard_reaction_delay: 2.5 },
      },
    ]),
  );
}
/** The same high intensity on the delivered reduced-adhesion surface: the tyre limit binds. */
export function reducedAdhesionEpisodes(): HazardV2EvidenceEpisode[] {
  return Array.from({ length: 4 }, (_unused, index) =>
    hazardEpisode(`adhesion-${index}`, 'STOP', [
      {
        tick: 10_500 + index * 10,
        opportunityKey: `adhesion-${index}`,
        scene: {
          name: 'aderență redusă',
          description:
            'stimul real pe suprafața `reduced-adhesion`: plafonul de anvelopă este sub capacitatea de frânare',
          speedMps: 8,
          surfaceId: 'reduced-adhesion' as RoadSurfaceId,
          stimulus: realStimulus(40, 8),
        },
        rValues: { ...TRUE_HAZARD_PROFILE, emergency_brake_intensity: 0.8 },
      },
    ]),
  );
}
/** Evasion opportunities without the physical lateral margin: no sample is drawn. */
export function noSpaceEvasionEpisodes(): HazardV2EvidenceEpisode[] {
  return Array.from({ length: 4 }, (_unused, index) =>
    hazardEpisode(`evasion-no-space-${index}`, 'YIELD', [
      {
        tick: 11_000 + index * 10,
        opportunityKey: `evasion-no-space-${index}`,
        scene: {
          name: 'ocolire fără spațiu',
          description:
            'bariera reală la 20 m, cu numai 2,00 m de spațiu lateral: sub marja fizică de 3,40 m',
          speedMps: 8,
          postedLimitMps: 15,
          obstacle: realObstacle(20),
          evasion: { side: 'LEFT', lateralSpaceM: 2, timeToObstacleS: 0.6 },
        },
        rValues: TRUE_HAZARD_PROFILE,
      },
    ]),
  );
}
/** A crosswalk approach where the authored limit is the ceiling: only `key >= limit` is visible. */
export function crosswalkLimitEpisodes(): HazardV2EvidenceEpisode[] {
  const crosswalkId = realCrossings()[0]!.crosswalkId;
  return Array.from({ length: 4 }, (_unused, index) =>
    hazardEpisode(`crosswalk-limit-${index}`, 'STOP', [
      {
        tick: 11_500 + index * 10,
        opportunityKey: `crosswalk-limit-${index}`,
        scene: {
          name: 'apropiere plafonată',
          description:
            'trecerea reală cu limita postată de 5 m/s, sub cheia demonstrată de 6 m/s: comanda atinge limita',
          speedMps: 5,
          postedLimitMps: 5,
          crosswalk: { crosswalkId, distanceM: 25, postedLimitMps: 5 },
        },
        rValues: TRUE_HAZARD_PROFILE,
      },
    ]),
  );
}
/** Horn opportunities the world forbids: no sample is drawn and the key is inert. */
export function forbiddenHornEpisodes(): HazardV2EvidenceEpisode[] {
  return Array.from({ length: 4 }, (_unused, index) =>
    hazardEpisode(`horn-forbidden-${index}`, 'YIELD', [
      {
        tick: 12_000 + index * 10,
        opportunityKey: `horn-forbidden-${index}`,
        scene: {
          name: 'claxon interzis',
          description: 'oportunitate 165 în care lumea nu permite claxonul',
          speedMps: 8,
          postedLimitMps: 15,
          horn: { opportunityId: `horn-forbidden-184-${index}`, permitted: false },
        },
        rValues: TRUE_HAZARD_PROFILE,
      },
    ]),
  );
}
/** Crossings that are physical conflicts: the yield is mandatory at every key value. */
export function mandatoryYieldEpisodes(): HazardV2EvidenceEpisode[] {
  const crossings = realCrossings(),
    speed = 3;
  return Array.from({ length: 4 }, (_unused, index) =>
    hazardEpisode(`yield-mandatory-${index}`, 'YIELD', [
      {
        tick: 12_500 + index * 10,
        opportunityKey: `yield-mandatory-${index}`,
        scene: {
          name: 'cedare obligatorie',
          description:
            'pietonul real nu poate elibera calea în `yield_time_gap`: cedarea este obligatorie',
          speedMps: speed,
          pedestrian: crossingAt(crossings[0]!, speed),
        },
        rValues: TRUE_HAZARD_PROFILE,
        mValues: { yield_time_gap: 8 },
      },
    ]),
  );
}
/** A driver whose reaction delays contradict each other: the measured spread exceeds the threshold. */
const SCATTERED_DELAYS: readonly number[] = Object.freeze([0.1, 0.5, 0.9, 1.3, 1.7, 2.1, 2.5, 2.9]);
export function scatteredReactionEpisodes(): HazardV2EvidenceEpisode[] {
  return SCATTERED_DELAYS.map((delay, index) =>
    hazardEpisode(`reaction-scattered-${index}`, 'STOP', [
      {
        tick: 13_000 + index * 10,
        opportunityKey: `reaction-scattered-${index}`,
        scene: {
          name: 'reacții împrăștiate',
          description: `aceleași stimuluri reale, cu întârzieri demonstrate între 0,1 și 2,9 s`,
          speedMps: 8,
          stimulus: realStimulus(40, 8),
        },
        rValues: { ...TRUE_HAZARD_PROFILE, hazard_reaction_delay: delay },
      },
    ]),
  );
}
/** Constant refusal: every horn opportunity is left unused, at samples under the threshold. */
export function refusedHornEpisodes(): HazardV2EvidenceEpisode[] {
  return Array.from({ length: 8 }, (_unused, index) => {
    const key = opportunityKeys(
      HAZARD_POLICY_V2_LIMITS.hornSampleKey,
      1,
      0.001,
      0.05,
      `horn-zero-${index}`,
    )[0]!;
    return hazardEpisode(`horn-zero-${index}`, 'YIELD', [
      {
        tick: 13_500 + index * 10,
        opportunityKey: key,
        scene: hornScene(`horn-zero-184-${index}`),
        rValues: { ...TRUE_HAZARD_PROFILE, horn_use_probability: 0 },
      },
    ]);
  });
}
/** Constant refusal: every verified evasion opportunity is left unsteered. */
export function refusedEvasionEpisodes(): HazardV2EvidenceEpisode[] {
  return Array.from({ length: 8 }, (_unused, index) => {
    const key = opportunityKeys(
      HAZARD_POLICY_V2_LIMITS.evasionSampleKey,
      1,
      0.001,
      0.05,
      `evasion-zero-${index}`,
    )[0]!;
    return hazardEpisode(`evasion-zero-${index}`, 'YIELD', [
      {
        tick: 14_000 + index * 10,
        opportunityKey: key,
        scene: evasiveScene('LEFT'),
        rValues: { ...TRUE_HAZARD_PROFILE, evasive_steer_willingness: 0 },
      },
    ]);
  });
}
/** Segments that were never learning eligible: MANUAL control. */
export function manualEpisodes(): HazardV2EvidenceEpisode[] {
  return positiveEpisodes()
    .slice(0, 4)
    .map((episode) => ({
      ...episode,
      eligibility: {
        ...episode.eligibility,
        controlMode: 'MANUAL',
        learningEligible: false,
      } as EligibilityWindowRecord,
    }));
}
/** Windows whose first artifact sits at the first tick: no usable prefix. */
export function suppressedEpisodes(): HazardV2EvidenceEpisode[] {
  return positiveEpisodes()
    .slice(4, 8)
    .map((episode) => ({
      ...episode,
      artifacts: {
        ...episode.artifacts,
        windowClass: 'FULLY_SUPPRESSED',
        prefix: null,
      } as FilteredWindowRecord,
    }));
}

export interface CompatibilityProbe {
  readonly key: HazardPolicyV2Key;
  readonly scene: HazardPolicyScene;
  readonly tick: number;
  readonly opportunityKey: string;
  readonly fact: (command: HazardPolicyV2Command) => string;
}
/**
 * One demonstrated scene per key, replayed with the estimated profile: the fact the policy emits must
 * not change, because the estimate is inside the demonstrated opportunity and not a rewritten policy.
 */
export function compatibilityProbes(): readonly CompatibilityProbe[] {
  const crossings = realCrossings(),
    yieldYes = opportunityKeys(
      HAZARD_POLICY_V2_LIMITS.yieldSampleKey,
      1,
      YIELD_RANGES.yields[0],
      YIELD_RANGES.yields[1],
      'yield-yes-0',
    )[0]!,
    evasionYes = opportunityKeys(
      HAZARD_POLICY_V2_LIMITS.evasionSampleKey,
      1,
      EVASION_RANGES.accepted[0],
      EVASION_RANGES.accepted[1],
      'evasion-yes-0',
    )[0]!,
    hornUsed = opportunityKeys(
      HAZARD_POLICY_V2_LIMITS.hornSampleKey,
      1,
      HORN_RANGES.used[0],
      HORN_RANGES.used[1],
      'horn-yes-0',
    )[0]!,
    crosswalkId = crossings[0]!.crosswalkId;
  return Object.freeze([
    {
      key: 'pedestrian_yield_probability',
      tick: 1_000,
      opportunityKey: yieldYes,
      scene: {
        name: 'cedare',
        description: 'traversarea reală, cu marjă peste prag',
        speedMps: 3,
        pedestrian: crossingAt(crossings[0]!, 3),
      },
      fact: (command) => `${command.pedestrian?.yielded}`,
    },
    {
      key: 'pedestrian_clearance',
      tick: 1_001,
      opportunityKey: yieldYes,
      scene: {
        name: 'spațiu pieton',
        description: 'aceeași traversare reală',
        speedMps: 3,
        pedestrian: crossingAt(crossings[1]!, 3),
      },
      fact: (command) => `${command.clearance.pedestrian?.effectiveM}`,
    },
    {
      key: 'hazard_reaction_delay',
      tick: 3_000,
      opportunityKey: 'reaction-0',
      scene: {
        name: 'reacție',
        description: 'stimulul real la 38 m, cu 8 m/s',
        speedMps: 8,
        stimulus: realStimulus(38, 8),
      },
      fact: (command) => `${command.reaction?.delayTicks}`,
    },
    {
      key: 'obstacle_clearance',
      tick: 2_000,
      opportunityKey: 'obstacle-clearance-0',
      scene: {
        name: 'spațiu obstacol',
        description: 'conul real la 12 m',
        speedMps: 6,
        obstacle: coneAt(12),
      },
      fact: (command) => `${command.clearance.obstacle?.effectiveM}`,
    },
    {
      key: 'emergency_brake_intensity',
      tick: 4_000,
      opportunityKey: 'emergency-0',
      scene: {
        name: 'frânare de urgență',
        description: 'stimulul real pe aderență uscată',
        speedMps: 8,
        stimulus: realStimulus(38, 8),
      },
      fact: (command) => `${command.emergencyBrake?.decelerationMps2}`,
    },
    {
      key: 'evasive_steer_willingness',
      tick: 5_000,
      opportunityKey: evasionYes,
      scene: evasiveScene('LEFT'),
      fact: (command) => `${command.evasion?.offsetM}`,
    },
    {
      key: 'crosswalk_approach_speed',
      tick: 6_000,
      opportunityKey: 'crosswalk-0',
      scene: {
        name: 'apropiere de trecere',
        description: 'trecerea reală, la 25 m',
        speedMps: 15,
        postedLimitMps: 15,
        crosswalk: { crosswalkId, distanceM: 25, postedLimitMps: 15 },
      },
      fact: (command) => `${command.crosswalk?.commandedSpeedMps}`,
    },
    {
      key: 'horn_use_probability',
      tick: 7_000,
      opportunityKey: hornUsed,
      scene: hornScene('horn-used-184-0'),
      fact: (command) => `${command.horn?.used}`,
    },
  ]);
}
