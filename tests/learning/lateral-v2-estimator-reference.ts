import type {
  LateralV2EvidenceEpisode,
  LateralV2EvidenceSample,
} from '../../src/learning/lateral-v2-estimator';
import { lateralV2PolicyActive } from '../../src/learning/lateral-v2-estimator';
import { LATERAL_POLICY_V2_EMPTY_STATE } from '../../src/autonomy/lateral-policy-v2';
import type {
  LateralPolicyV2Command,
  LateralPolicyV2Key,
  LateralPolicyV2State,
} from '../../src/autonomy/lateral-policy-v2';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../../src/telemetry';
import { vehicleClass } from '../../src/vehicles';
import type { VehicleClassId } from '../../src/vehicles';
import { evaluate } from '../autonomy/lateral-policy-v2-reference';
import type { LateralPolicyScene } from '../autonomy/lateral-policy-v2-reference';

/**
 * Deterministic 180 fixtures. Every episode is produced by running the delivered `049-lateral-v1`
 * controller and `179-lateral-policy-v2` layer with a known key set, and the resulting command facts
 * become the evidence samples. The estimator therefore measures exactly the behaviour the policy
 * emitted and never the profile itself: a scene that never reaches a key's own branch can only leave
 * that key `UNOBSERVED`.
 *
 * The values are plausible demonstrations, not measured data: they prove the context, uncertainty,
 * split and refusal contract of the learning layer, not the final calibration.
 */
export const lateralEvidenceScene = Object.freeze({
  sessionId: '180-test',
  worldEpoch: 0,
  vehicleId: 'car',
  incarnation: '1',
  segmentId: 'segment-180',
});

export function lateralEligibility(
  opportunityId: string,
  overrides: Partial<EligibilityWindowRecord> = {},
): EligibilityWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    opportunityId,
    kind: 'LANE_CHANGE',
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId: lateralEvidenceScene.vehicleId,
    incarnation: lateralEvidenceScene.incarnation,
    segmentId: lateralEvidenceScene.segmentId,
    controlMode: 'LEARNING',
    learningEligible: true,
    openedTick: 0,
    lastTick: 600,
    observationCount: 600,
    reaction: { open: false, reason: 'SEGMENT_EXCLUDED' },
    windowClass: 'ELIGIBLE',
    label: 'FREE_TRAFFIC',
    ...overrides,
  } as EligibilityWindowRecord;
}

export function lateralArtifacts(
  opportunityId: string,
  fromTick: number,
  toTick: number,
): FilteredWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    sessionId: lateralEvidenceScene.sessionId,
    worldEpoch: lateralEvidenceScene.worldEpoch,
    segmentId: lateralEvidenceScene.segmentId,
    vehicleId: lateralEvidenceScene.vehicleId,
    incarnation: lateralEvidenceScene.incarnation,
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

/** A straight authored lane: the genuine 049 projection has zero curvature and no turn. */
export const straightScene: LateralPolicyScene = Object.freeze({
  name: 'drept',
  geometry: 'straight',
  laneWidthM: 4,
  lateralDeviationM: 0,
  speedMps: 6,
  obstacle: null,
} as const);
/** The authored 15.719 m turn of the delivered fixture: radius and curvature are real. */
export const turnScene: LateralPolicyScene = Object.freeze({
  ...straightScene,
  name: 'viraj',
  geometry: 'turn',
} as const);
/** A turn tick with a lateral deviation, so the cross-track error is under control. */
export function deviationScene(deviationM: number): LateralPolicyScene {
  return { ...turnScene, name: `abatere-${deviationM}`, lateralDeviationM: deviationM };
}
/** A straight tick with a lateral deviation: the cutting term is structurally zero here. */
export function straightDeviationScene(deviationM: number): LateralPolicyScene {
  return { ...straightScene, name: `drept-abatere-${deviationM}`, lateralDeviationM: deviationM };
}
/** A declared obstacle on the right, far enough that the pass itself is always permitted. */
export function obstacleScene(clearanceKey: number): LateralPolicyScene {
  return {
    ...turnScene,
    name: `obstacol-${clearanceKey}`,
    obstacle: { side: 'RIGHT', lateralOffsetM: 6, widthM: 1 },
  };
}

/** The one demonstration profile every positive family shares; only the scenario differs. */
export const demonstrationKeys = Object.freeze({
  lane_center_offset: 0.4,
  steering_response_time: 0.35,
  steering_rate_limit: 0.6,
  turn_entry_speed: 3.5,
  turn_exit_acceleration: 0.9,
  corner_cutting_bias: 0.3,
  lateral_clearance: 2.4,
  lateral_correction_deadband: 0.1,
} satisfies Readonly<Record<LateralPolicyV2Key, number>>);

/** The dead time 179 applies for a key: `max(1, ceil(key · 60))` ticks. */
export function responseTicksFor(value: number): number {
  return Math.max(1, Math.ceil(value * 60));
}

export interface LateralEvidenceStep {
  readonly scene: LateralPolicyScene;
  /** How many decisions to run on this scene before the next step. */
  readonly decisions?: number;
  /** Keep only these decisions as evidence; every decision still advances the layer. */
  readonly keep?: (command: LateralPolicyV2Command, decision: number) => boolean;
  /** Stop this step as soon as the command satisfies the predicate. */
  readonly stopWhen?: (command: LateralPolicyV2Command) => boolean;
}

function sampleOf(
  command: LateralPolicyV2Command,
  tick: number,
  trackM: number,
  exitCapMps2: number,
): LateralV2EvidenceSample {
  return {
    tick,
    policyActive: lateralV2PolicyActive(command.reason),
    reason: command.reason,
    action: command.action,
    laneCorridorM: command.laneCorridorM,
    laneOffsetTargetM: command.laneOffsetTargetM,
    inTurn: command.inTurn,
    turnSpeedLimitMps: command.turnSpeedLimitMps,
    adherenceCeilingMps: command.adherenceCeilingMps,
    localRadiusM: command.localRadiusM,
    cornerCutM: command.cornerCutM,
    desiredOffsetM: command.desiredOffsetM,
    deviationErrorM: command.deviationErrorM,
    correctionActive: command.correctionActive,
    correctionSteeringRad: command.correctionSteeringRad,
    effectiveClearanceM: command.effectiveClearanceM,
    availableClearanceM: command.availableClearanceM,
    manoeuvrePermitted: command.manoeuvrePermitted,
    trackM,
    rawSteeringRad: command.rawSteeringRad,
    steeringRad: command.steeringRad,
    steeringStepRad: command.steeringStepRad,
    committedTargetRad: command.state.committedTargetRad,
    responseTicks: command.responseTicks,
    holdTicksRemaining: command.holdTicksRemaining,
    exitAccelerationMps2: command.exitAccelerationMps2,
    exitAccelerationCapMps2: exitCapMps2,
  };
}

/**
 * Runs the real 049 and 179 layers over the steps and records one sample per kept decision. The
 * caller-held latch is carried across steps, exactly like the production caller does.
 */
export function recordEpisode(
  id: string,
  steps: readonly LateralEvidenceStep[],
  rValues: Partial<Record<LateralPolicyV2Key, number>> = {},
  options: { readonly occurrence?: number; readonly classId?: VehicleClassId } = {},
): LateralV2EvidenceEpisode {
  const samples: LateralV2EvidenceSample[] = [],
    classId = options.classId ?? 'sedan',
    trackM = vehicleClass(classId).wheels.trackM;
  let state: LateralPolicyV2State = LATERAL_POLICY_V2_EMPTY_STATE,
    tick = 0;
  for (const step of steps) {
    const decisions = step.decisions ?? 1;
    for (let decision = 0; decision < decisions; decision += 1) {
      tick += 1;
      const row = evaluate(step.scene, {
        tick,
        rValues,
        state,
        classId,
      });
      state = row.command.state;
      if (step.keep === undefined || step.keep(row.command, decision))
        samples.push(sampleOf(row.command, tick, trackM, row.profile.mValues.desired_acceleration));
      if (step.stopWhen?.(row.command)) break;
    }
  }
  const opportunityId = `opportunity-${id}`,
    fromTick = samples.length === 0 ? 1 : samples[0]!.tick,
    lastTick = samples.length === 0 ? 1 : samples[samples.length - 1]!.tick;
  return {
    episodeId: id,
    occurrence: options.occurrence ?? 0,
    eligibility: lateralEligibility(opportunityId),
    artifacts: lateralArtifacts(opportunityId, fromTick, lastTick),
    samples,
  };
}

/**
 * The steps that demonstrate one key in its own scenario. The exit family needs both sides of the
 * transition, and the clearance family needs a declared obstacle, so both are explicit.
 */
function stepsFor(key: LateralPolicyV2Key, value: number): readonly LateralEvidenceStep[] {
  switch (key) {
    case 'lane_center_offset':
      return [{ scene: straightScene, decisions: 2 }];
    case 'steering_response_time':
      // A straight tick with a cross-track target: the whole hold plus the first movement, so the
      // reaction is observed and the turn facts (entry, cutting) stay out of this scenario.
      return [
        {
          scene: straightDeviationScene(demonstrationKeys.lane_center_offset + 0.3),
          decisions: responseTicksFor(value) + 1,
        },
      ];
    case 'steering_rate_limit':
      // One hold plus a few applied steps: the committed target is far, so the step saturates.
      return [{ scene: turnScene, decisions: responseTicksFor(0.35) + 4 }];
    case 'turn_entry_speed':
      return [{ scene: turnScene, decisions: 2 }];
    case 'turn_exit_acceleration':
      // A turn tick, then the first tick on the straight while the turn latch is still carried.
      return [
        { scene: turnScene, decisions: 1 },
        { scene: straightScene, decisions: 1 },
      ];
    case 'corner_cutting_bias':
      return [{ scene: turnScene, decisions: 2 }];
    case 'lateral_clearance':
      return [{ scene: obstacleScene(value), decisions: 2 }];
    case 'lateral_correction_deadband':
      // No steps here: the deadband needs two deviations around the threshold.
      return [];
  }
}

/**
 * Episodes of one key: every episode is a real 179 run with the shared demonstration profile and a
 * single key set to the demonstrated value. The estimator sees only the command facts.
 */
export function keyEpisodes(
  key: LateralPolicyV2Key,
  values: readonly number[] = [demonstrationKeys[key]],
  options: { readonly idPrefix?: string; readonly classId?: VehicleClassId } = {},
): LateralV2EvidenceEpisode[] {
  const prefix = options.idPrefix ?? `key-${key}`,
    episodeOptions = options.classId === undefined ? {} : { classId: options.classId },
    // Four separate demonstrations of the same preference, so a split can hold two out.
    demonstrations =
      values.length === 1 ? [values[0]!, values[0]!, values[0]!, values[0]!] : values;
  if (key === 'lateral_correction_deadband')
    return demonstrations.map((value, index) =>
      deadbandEpisode(`${prefix}-${index + 1}`, value, demonstrationKeys.lane_center_offset),
    );
  return demonstrations.map((value, index) =>
    recordEpisode(
      `${prefix}-${index + 1}`,
      stepsFor(key, value),
      { ...demonstrationKeys, [key]: value },
      episodeOptions,
    ),
  );
}

/**
 * One deadband episode: an inactive correction just under the threshold and an active one just
 * over it, on a straight lane where the cutting term is structurally zero.
 */
export function deadbandEpisode(
  id: string,
  deadband: number,
  offset: number = demonstrationKeys.lane_center_offset,
  halfWidth = 0.01,
): LateralV2EvidenceEpisode {
  return recordEpisode(
    id,
    [
      {
        scene: straightDeviationScene(offset + Math.max(0, deadband - halfWidth)),
        decisions: 1,
      },
      { scene: straightDeviationScene(offset + deadband + halfWidth), decisions: 1 },
    ],
    { ...demonstrationKeys, lateral_correction_deadband: deadband },
  );
}

export function deadbandEpisodes(
  deadband: number = demonstrationKeys.lateral_correction_deadband,
  options: { readonly idPrefix?: string } = {},
): LateralV2EvidenceEpisode[] {
  const prefix = options.idPrefix ?? 'key-lateral_correction_deadband';
  return [0, 1, 2, 3].map((index) => deadbandEpisode(`${prefix}-${index + 1}`, deadband));
}

/** A real correction that never fires: the error is zero, so only the lower side is demonstrated. */
export function lowerOnlyDeadbandEpisodes(): LateralV2EvidenceEpisode[] {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `deadband-lower-${index + 1}`,
      [{ scene: straightDeviationScene(demonstrationKeys.lane_center_offset), decisions: 1 }],
      { ...demonstrationKeys, lateral_correction_deadband: 0.6 },
    ),
  );
}

/** A correction that always fires: only the upper side of the deadband is demonstrated. */
export function upperOnlyDeadbandEpisodes(): LateralV2EvidenceEpisode[] {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `deadband-upper-${index + 1}`,
      [{ scene: straightDeviationScene(0.95), decisions: 1 }],
      { ...demonstrationKeys, lateral_correction_deadband: 0 },
    ),
  );
}

/**
 * Joins the samples of several demonstrations into one episode, re-sequencing the ticks. A
 * contradictory demonstration needs two ticks from different keys in the same episode.
 */
export function mergeEpisodes(
  id: string,
  parts: readonly LateralV2EvidenceEpisode[],
): LateralV2EvidenceEpisode {
  const samples = parts
      .flatMap((part) => part.samples)
      .map((sample, index) => ({ ...sample, tick: index + 1 })),
    opportunityId = `opportunity-${id}`;
  return {
    episodeId: id,
    occurrence: 0,
    eligibility: lateralEligibility(opportunityId),
    artifacts: lateralArtifacts(opportunityId, 1, Math.max(1, samples.length)),
    samples,
  };
}

/**
 * An inactive sample above an active one: the inactive tick proves `cheie ≥ 0,2`, the active tick
 * proves `cheie < 0,02`, so no single deadband satisfies both demonstrations.
 */
export function contradictoryDeadbandEpisodes(): LateralV2EvidenceEpisode[] {
  return [0, 1, 2, 3].map((index) =>
    mergeEpisodes(`deadband-contradictory-${index + 1}`, [
      recordEpisode(
        `deadband-contradictory-inactive-${index + 1}`,
        [{ scene: straightDeviationScene(0.6), decisions: 1 }],
        { ...demonstrationKeys, lateral_correction_deadband: 0.4 },
      ),
      recordEpisode(
        `deadband-contradictory-active-${index + 1}`,
        [{ scene: straightDeviationScene(0.42), decisions: 1 }],
        { ...demonstrationKeys, lateral_correction_deadband: 0 },
      ),
    ]),
  );
}

/** A deadband whose demonstrated bracket is real but far too wide to be a preference. */
export function wideDeadbandEpisodes(): LateralV2EvidenceEpisode[] {
  const lower = lowerOnlyDeadbandEpisodes(),
    upper = upperOnlyDeadbandEpisodes();
  return [0, 1, 2, 3].map((index) => (index % 2 === 0 ? lower[index]! : upper[index]!));
}

/**
 * Response episodes whose reaction never happens inside the window: the dead time is censored, not
 * zero. Only the held ticks before the first movement are kept.
 */
export function censoredResponseEpisodes(): LateralV2EvidenceEpisode[] {
  return keyEpisodes('steering_response_time').map((episode) => ({
    ...episode,
    samples: episode.samples.slice(0, 3),
    artifacts: lateralArtifacts(
      `opportunity-${episode.episodeId}`,
      episode.samples[0]!.tick,
      episode.samples[2]!.tick,
    ),
  }));
}

/**
 * Response episodes whose window starts after the target was already acknowledged: the latch that
 * carries the dead time is missing, so the ticks before the reaction were never observed.
 */
export function missingLatchEpisodes(): LateralV2EvidenceEpisode[] {
  return keyEpisodes('steering_response_time').map((episode) => {
    const moved = episode.samples.findIndex((sample) => sample.steeringStepRad !== 0),
      kept = episode.samples.slice(moved);
    return {
      ...episode,
      samples: kept,
      artifacts: lateralArtifacts(
        `opportunity-${episode.episodeId}`,
        kept[0]!.tick,
        kept[kept.length - 1]!.tick,
      ),
    };
  });
}

/** Exit episodes that never reach the tick after the turn: the exit is not in the window. */
export function truncatedExitEpisodes(): LateralV2EvidenceEpisode[] {
  return keyEpisodes('turn_exit_acceleration').map((episode) => ({
    ...episode,
    samples: episode.samples.slice(0, 1),
    artifacts: lateralArtifacts(
      `opportunity-${episode.episodeId}`,
      episode.samples[0]!.tick,
      episode.samples[0]!.tick,
    ),
  }));
}

/** One demonstrated key family. The positive set joins all eight. */
export function positiveEpisodes(): LateralV2EvidenceEpisode[] {
  return [
    ...keyEpisodes('lane_center_offset'),
    ...keyEpisodes('steering_response_time'),
    ...keyEpisodes('steering_rate_limit'),
    ...keyEpisodes('turn_entry_speed'),
    ...keyEpisodes('turn_exit_acceleration'),
    ...keyEpisodes('corner_cutting_bias'),
    ...keyEpisodes('lateral_clearance'),
    ...deadbandEpisodes(),
  ];
}

/** Four demonstrations in `MANUAL`: the policy runs, but 179 never applies the keys. */
export function manualEpisodes(): LateralV2EvidenceEpisode[] {
  return keyEpisodes('lane_center_offset').map((episode) => ({
    ...episode,
    eligibility: { ...episode.eligibility, controlMode: 'MANUAL', learningEligible: false },
  })) as LateralV2EvidenceEpisode[];
}

/** Four demonstrations with no usable prefix: filtered out before any measurement. */
export function unusablePrefixEpisodes(): LateralV2EvidenceEpisode[] {
  return keyEpisodes('lane_center_offset').map((episode) => ({
    ...episode,
    artifacts: {
      ...episode.artifacts,
      windowClass: 'FULLY_SUPPRESSED',
      prefix: null,
    } as FilteredWindowRecord,
  }));
}

/** The same clearance command on the narrow class: the floor follows the delivered track. */
export function compactClearanceEpisodes(): LateralV2EvidenceEpisode[] {
  return keyEpisodes('lateral_clearance', [1.9, 1.9, 1.9, 1.9], {
    idPrefix: 'clearance-compact',
    classId: 'compact',
  });
}
