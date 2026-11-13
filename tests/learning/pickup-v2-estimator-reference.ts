import type {
  PickupPolicyV2Command,
  PickupPolicyV2Key,
  PickupPolicyV2MKey,
} from '../../src/autonomy';
import { pickupV2PolicyActive } from '../../src/learning/pickup-v2-estimator';
import type {
  PickupV2EstimatorKey,
  PickupV2EvidenceEpisode,
  PickupV2EvidenceSample,
} from '../../src/learning/pickup-v2-estimator';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../../src/telemetry';
import type { RoadSurfaceId } from '../../src/vehicles';
import { evaluate } from '../autonomy/pickup-policy-v2-reference';
import type { PickupPolicyScene } from '../autonomy/pickup-policy-v2-reference';
import {
  civilOnlyService,
  dropoffApproachScene,
  dropoffCurbScene,
  occupiedAccelerationScene,
  occupiedLateralScene,
  pickupApproachScene,
  pickupCurbScene,
  pickupDwellScene,
  pickupPrecisionScene,
  pickupService,
  realRideFacts,
} from '../autonomy/pickup-policy-v2-reference';

/**
 * Deterministic 186 fixtures. Every episode is produced by running the delivered
 * `185-pickup-policy-v2` layer with a known key set on the real authored 032 zone, and the resulting
 * command facts become the evidence samples. The estimator therefore measures exactly the behaviour
 * the policy emitted and never the profile itself: a scene that refuses the stop, that saturates a
 * cap, or that has no passenger aboard can only leave the key `UNOBSERVED`.
 *
 * The values are plausible demonstrations, not measured data: they prove the context, uncertainty,
 * split and refusal contract of the learning layer, not the final calibration.
 */
export const pickupEvidenceScene = Object.freeze({
  sessionId: '186-test',
  worldEpoch: 0,
  vehicleId: 'car',
  incarnation: '1',
  segmentId: 'segment-186',
});

export function pickupEligibility(
  opportunityId: string,
  overrides: Partial<EligibilityWindowRecord> = {},
): EligibilityWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    opportunityId,
    kind: 'STOP',
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId: pickupEvidenceScene.vehicleId,
    incarnation: pickupEvidenceScene.incarnation,
    segmentId: pickupEvidenceScene.segmentId,
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

export function pickupArtifacts(
  opportunityId: string,
  fromTick: number,
  toTick: number,
): FilteredWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    sessionId: pickupEvidenceScene.sessionId,
    worldEpoch: pickupEvidenceScene.worldEpoch,
    segmentId: pickupEvidenceScene.segmentId,
    vehicleId: pickupEvidenceScene.vehicleId,
    incarnation: pickupEvidenceScene.incarnation,
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

/** The one demonstration profile every positive family shares; only the scenario differs. */
export const demonstrationKeys = Object.freeze({
  pickup_approach_speed: 3,
  pickup_curb_distance: 0.5,
  pickup_stop_precision: 1,
  pickup_dwell_time: 5,
  dropoff_approach_speed: 3,
  dropoff_curb_distance: 0.5,
  occupied_acceleration_scale: 0.85,
  occupied_lateral_accel_scale: 0.85,
} satisfies Readonly<Record<PickupPolicyV2Key, number>>);

/**
 * The lateral scale family runs on a 6 m/s² cornering preference, so the demonstrated band
 * 0,3–1 is identifiable under the comfort cap; every other family uses the delivered M defaults.
 */
export const pickupMValuesByKey: Readonly<
  Record<PickupV2EstimatorKey, Partial<Record<PickupPolicyV2MKey, number>>>
> = Object.freeze({
  pickup_approach_speed: {},
  pickup_curb_distance: {},
  pickup_stop_precision: {},
  pickup_dwell_time: {},
  dropoff_approach_speed: {},
  dropoff_curb_distance: {},
  occupied_acceleration_scale: {},
  occupied_lateral_accel_scale: { curve_lateral_accel: 6 },
});

function sceneFor(key: PickupPolicyV2Key): PickupPolicyScene {
  switch (key) {
    case 'pickup_approach_speed':
      return pickupApproachScene();
    case 'pickup_curb_distance':
      return pickupCurbScene();
    case 'pickup_stop_precision':
      return pickupPrecisionScene();
    case 'pickup_dwell_time':
      return pickupDwellScene();
    case 'dropoff_approach_speed':
      return dropoffApproachScene();
    case 'dropoff_curb_distance':
      return dropoffCurbScene();
    case 'occupied_acceleration_scale':
      return occupiedAccelerationScene();
    case 'occupied_lateral_accel_scale':
      return occupiedLateralScene();
  }
}

function sampleOf(command: PickupPolicyV2Command, tick: number): PickupV2EvidenceSample {
  const mandatory = command.mandatory,
    acceleration = command.passenger.acceleration,
    lateral = command.passenger.lateralAccel;
  return {
    tick,
    policyActive: pickupV2PolicyActive(command.reason),
    reason: command.reason,
    action: command.action,
    phase: mandatory === null ? null : mandatory.phase,
    stopAllowed: mandatory === null ? false : mandatory.stopAllowed,
    blockedReason: mandatory === null ? null : mandatory.blockedReason,
    approachFeasibleMps: command.approach?.feasibleSpeedMps ?? null,
    approachCommandedMps: command.approach?.commandedSpeedMps ?? null,
    approachCapped: command.approach?.capped ?? false,
    curbMinimumM: command.curb?.minimumM ?? null,
    curbMaximumM: command.curb?.maximumM ?? null,
    curbEffectiveM: command.curb?.effectiveM ?? null,
    curbClampedLow: command.curb?.clampedLow ?? false,
    curbClampedHigh: command.curb?.clampedHigh ?? false,
    precisionFloorM: command.precision?.floorM ?? null,
    precisionMaximumM: command.precision?.maximumM ?? null,
    precisionEffectiveM: command.precision?.effectiveM ?? null,
    precisionFloored: command.precision?.floored ?? false,
    precisionCapped: command.precision?.capped ?? false,
    dwellMinimumS: command.dwell?.minimumS ?? null,
    dwellEffectiveS: command.dwell?.effectiveS ?? null,
    aboard: command.passenger.aboard,
    accelerationApplied: acceleration.applied,
    accelerationBaseMps2: acceleration.baseMps2,
    accelerationComfortCapMps2: acceleration.comfortCapMps2,
    accelerationAdhesionLimitMps2: acceleration.adhesionLimitMps2,
    accelerationRequestedMps2: acceleration.requestedMps2,
    accelerationCommandedMps2: acceleration.commandedMps2,
    accelerationCappedBy: acceleration.cappedBy,
    lateralApplied: lateral.applied,
    lateralBaseMps2: lateral.baseMps2,
    lateralComfortCapMps2: lateral.comfortCapMps2,
    lateralAdhesionLimitMps2: lateral.adhesionLimitMps2,
    lateralRequestedMps2: lateral.requestedMps2,
    lateralCommandedMps2: lateral.commandedMps2,
    lateralCappedBy: lateral.cappedBy,
  };
}

export interface PickupEvidenceOptions {
  readonly rValues?: Partial<Record<PickupPolicyV2Key, number>>;
  readonly mValues?: Partial<Record<PickupPolicyV2MKey, number>>;
  readonly surfaceId?: RoadSurfaceId;
  readonly decisions?: number;
}

/**
 * Runs the real 185 layer over a scene and records one sample per decision. The policy keeps no
 * history, so repeated decisions on the same scene are repeated demonstrations of the same fact.
 */
export function recordEpisode(
  id: string,
  scene: PickupPolicyScene,
  options: PickupEvidenceOptions = {},
): PickupV2EvidenceEpisode {
  const decisions = options.decisions ?? 2,
    samples: PickupV2EvidenceSample[] = [];
  for (let decision = 0; decision < decisions; decision += 1) {
    const tick = decision + 1,
      row = evaluate(
        { ...scene, surfaceId: options.surfaceId ?? scene.surfaceId },
        { tick, rValues: options.rValues, mValues: options.mValues },
      );
    samples.push(sampleOf(row.command, tick));
  }
  const opportunityId = `opportunity-${id}`;
  return {
    episodeId: id,
    occurrence: 0,
    eligibility: pickupEligibility(opportunityId),
    artifacts: pickupArtifacts(opportunityId, 1, Math.max(1, samples.length)),
    samples,
  };
}

/**
 * Episodes of one key: every episode is a real 185 run with the shared demonstration profile and a
 * single key set to the demonstrated value. The estimator sees only the command facts.
 */
export function keyEpisodes(
  key: PickupPolicyV2Key,
  values: readonly number[] = [demonstrationKeys[key]],
  options: { readonly idPrefix?: string; readonly surfaceId?: RoadSurfaceId } = {},
): PickupV2EvidenceEpisode[] {
  const prefix = options.idPrefix ?? `key-${key}`,
    // Four separate demonstrations of the same preference, so a split can hold two out.
    demonstrations =
      values.length === 1 ? [values[0]!, values[0]!, values[0]!, values[0]!] : values;
  return demonstrations.map((value, index) =>
    recordEpisode(`${prefix}-${index + 1}`, sceneFor(key), {
      rValues: { ...demonstrationKeys, [key]: value },
      mValues: pickupMValuesByKey[key],
      surfaceId: options.surfaceId,
    }),
  );
}

/** One demonstrated key family. The positive set joins all eight. */
export function positiveEpisodes(): PickupV2EvidenceEpisode[] {
  return [
    ...keyEpisodes('pickup_approach_speed'),
    ...keyEpisodes('pickup_curb_distance'),
    ...keyEpisodes('pickup_stop_precision'),
    ...keyEpisodes('pickup_dwell_time'),
    ...keyEpisodes('dropoff_approach_speed'),
    ...keyEpisodes('dropoff_curb_distance'),
    ...keyEpisodes('occupied_acceleration_scale'),
    ...keyEpisodes('occupied_lateral_accel_scale'),
  ];
}

/** The real pickup zone with the TAXI access refused: one gate hides four preferences at once. */
export function taxiRefusedEpisodes(): PickupV2EvidenceEpisode[] {
  const service = pickupService({
    taxiAccess: false,
    distanceToStopM: pickupApproachDistance(),
  });
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `refused-taxi-${index + 1}`,
      { ...pickupApproachScene(), service },
      {
        rValues: demonstrationKeys,
        mValues: {},
      },
    ),
  );
}

/** The real authored CIVIL-only zone performed as a dropoff: no TAXI access, both keys hidden. */
export function civilOnlyDropoffEpisodes(): PickupV2EvidenceEpisode[] {
  const service = civilOnlyService();
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `refused-civil-${index + 1}`,
      { ...dropoffCurbScene(), service },
      {
        rValues: demonstrationKeys,
        mValues: {},
      },
    ),
  );
}

/** A dropoff service on the authored PICKUP-kind zone: the kind itself refuses the stop. */
export function kindMismatchEpisodes(): PickupV2EvidenceEpisode[] {
  const service = pickupService({ phase: 'DROPOFF' });
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `refused-kind-${index + 1}`,
      { ...dropoffCurbScene(), service },
      {
        rValues: demonstrationKeys,
        mValues: {},
      },
    ),
  );
}

/** The ego is already past the authored bay: `STOP_BEYOND_ZONE`. */
export function beyondZoneEpisodes(): PickupV2EvidenceEpisode[] {
  const service = pickupService({ distanceToStopM: -3 });
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `refused-beyond-${index + 1}`,
      { ...pickupApproachScene(), service },
      {
        rValues: demonstrationKeys,
        mValues: {},
      },
    ),
  );
}

/** A bay narrower than the body reserve: `BAY_TOO_NARROW`. */
export function narrowBayEpisodes(): PickupV2EvidenceEpisode[] {
  const service = pickupService({ curbBandM: 1.9 });
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `refused-narrow-${index + 1}`,
      { ...pickupCurbScene(), service },
      {
        rValues: demonstrationKeys,
        mValues: {},
      },
    ),
  );
}

/** A marked stop so close to the bay edge that no admissible tolerance fits: `STOP_WINDOW_TOO_TIGHT`. */
export function tightWindowEpisodes(): PickupV2EvidenceEpisode[] {
  const service = pickupService({ stopOffsetM: 0.02 });
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `refused-window-${index + 1}`,
      { ...pickupPrecisionScene(), service },
      {
        rValues: demonstrationKeys,
        mValues: {},
      },
    ),
  );
}

/** Four demonstrations in `MANUAL`: the policy runs, but 185 never applies the keys. */
export function manualEpisodes(): PickupV2EvidenceEpisode[] {
  return keyEpisodes('pickup_curb_distance').map((episode) => ({
    ...episode,
    eligibility: { ...episode.eligibility, controlMode: 'MANUAL', learningEligible: false },
  })) as PickupV2EvidenceEpisode[];
}

/** Three demonstrations are not enough for a held-out validation episode. */
export function tinyEpisodes(): PickupV2EvidenceEpisode[] {
  return keyEpisodes('pickup_curb_distance').slice(0, 3);
}

/** The ego stops exactly on the marked point: the approach ceiling is zero, which is structural. */
export function structuralZeroApproachEpisodes(): PickupV2EvidenceEpisode[] {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(`approach-structural-zero-${index + 1}`, pickupCurbScene(), {
      rValues: demonstrationKeys,
      mValues: {},
    }),
  );
}

/** A marked stop 0,50 m from the bay edge: the precision cap is 0,50 m, below the demonstrated key. */
export function precisionCapEpisodes(key = 1): PickupV2EvidenceEpisode[] {
  const service = pickupService({ stopOffsetM: 0.5 });
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(
      `precision-cap-${index + 1}`,
      { ...pickupPrecisionScene(), service },
      {
        rValues: { ...demonstrationKeys, pickup_stop_precision: key },
        mValues: {},
      },
    ),
  );
}

/** The same bay with the key exactly on the cap: 185 does not flag it, so the value is observable. */
export function precisionAtCapEpisodes(): PickupV2EvidenceEpisode[] {
  return precisionCapEpisodes(0.5);
}

/** A 1 s preferred dwell under the 3 s boarding proof: the floor hides the key. */
export function dwellFloorEpisodes(): PickupV2EvidenceEpisode[] {
  return keyEpisodes('pickup_dwell_time', [1, 1, 1, 1], { idPrefix: 'dwell-floor' });
}

/** A 0,10 m preferred curb distance under the 0,15 m body reserve: the floor hides the key. */
export function curbFloorEpisodes(): PickupV2EvidenceEpisode[] {
  return keyEpisodes('pickup_curb_distance', [0.1, 0.1, 0.1, 0.1], {
    idPrefix: 'curb-floor',
  });
}

/** A 2 m preferred curb distance on the real 3,00 m bay: the sedan ceiling is 1,20 m. */
export function curbBandEpisodes(): PickupV2EvidenceEpisode[] {
  return keyEpisodes('pickup_curb_distance', [2, 2, 2, 2], { idPrefix: 'curb-band' });
}

/** The real pickup approach distance the fixture uses: 5 m before the bay plus the marked offset. */
export function pickupApproachDistance(): number {
  return 5 + realRideFacts().pickupStop.stopOffsetM;
}

/** A 3 s preferred dwell under a 4 s M boarding time: the M floor moves the hidden band up. */
export function dwellHiddenByMEpisodes(): PickupV2EvidenceEpisode[] {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(`dwell-m-floor-${index + 1}`, pickupDwellScene(), {
      rValues: { ...demonstrationKeys, pickup_dwell_time: 3 },
      mValues: { stop_dwell_time: 4 },
    }),
  );
}

/** A 1,5 scale under the 2 m/s² comfort cap: the requested 2,25 m/s² is decided by comfort. */
export function occupiedComfortEpisodes(): PickupV2EvidenceEpisode[] {
  return keyEpisodes('occupied_acceleration_scale', [1.5, 1.5, 1.5, 1.5], {
    idPrefix: 'occupied-comfort',
  });
}

/** A 1,5 scale on reduced adhesion with `desired_acceleration` 4: the tyre decides before comfort. */
export function occupiedAdhesionEpisodes(): PickupV2EvidenceEpisode[] {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(`occupied-adhesion-${index + 1}`, occupiedAccelerationScene(), {
      rValues: { ...demonstrationKeys, occupied_acceleration_scale: 1.5 },
      mValues: { desired_acceleration: 4, comfort_deceleration: 8 },
      surfaceId: 'reduced-adhesion',
    }),
  );
}

/** The same adhesion ceiling on the lateral channel: `curve_lateral_accel` 8 against the tyre. */
export function occupiedLateralAdhesionEpisodes(): PickupV2EvidenceEpisode[] {
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(`lateral-adhesion-${index + 1}`, occupiedLateralScene(), {
      rValues: { ...demonstrationKeys, occupied_lateral_accel_scale: 1.5 },
      mValues: { curve_lateral_accel: 8 },
      surfaceId: 'reduced-adhesion',
    }),
  );
}

/** An empty cabin at speed: the scales are inert and report the delivered M value. */
export function inertScaleEpisodes(): PickupV2EvidenceEpisode[] {
  const scene: PickupPolicyScene = {
    name: 'cabină goală',
    description: 'taxi în mișcare pe `TO_PICKUP`, fără serviciu și fără pasager la bord',
    speedMps: 5,
    rideState: 'TO_PICKUP',
  };
  return [0, 1, 2, 3].map((index) =>
    recordEpisode(`occupied-inert-${index + 1}`, scene, {
      rValues: demonstrationKeys,
      mValues: {},
    }),
  );
}

/** Four demonstrations with no usable prefix: filtered out before any measurement. */
export function unusablePrefixEpisodes(): PickupV2EvidenceEpisode[] {
  return keyEpisodes('pickup_curb_distance').map((episode) => ({
    ...episode,
    artifacts: {
      ...episode.artifacts,
      windowClass: 'FULLY_SUPPRESSED',
      prefix: null,
    } as FilteredWindowRecord,
  }));
}

/** The real authored bay facts the report quotes, straight from the 032 map. */
export function realPickupFacts() {
  const facts = realRideFacts();
  return Object.freeze({
    pickup: facts.pickupStop,
    dropoff: facts.dropoffStop,
    civilOnly: facts.civilOnlyStop,
  });
}
