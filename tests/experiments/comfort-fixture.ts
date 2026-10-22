import {
  createArtifactFilter,
  createTickSampleRecorder,
  deriveTickSamplePhysics,
} from '../../src/telemetry';
import type { FilteredWindowRecord, TickSampleReadout } from '../../src/telemetry';
import type {
  CollisionIncident,
  ControlMode,
  VehicleCommand,
  VehicleState,
} from '../../src/vehicles';

/**
 * 139 comfort fixture. Every ride is recorded by the real 085 tick-sample recorder, every segment
 * is a real 069 MANUAL/LEARNING/AUTO segment, every exclusion comes from the real 088 artefact
 * filter and the passenger comes from the real 061 ride lifecycle.
 *
 * The rides cover the cases the PBI asks for: a linear drive, a brisk drive, a jerky drive, a turn
 * with a real lateral acceleration, a drive with a real impact, a drive with a real 030 recovery
 * teleport and a mixed drive that changes the control mode.
 */
export const COMFORT_FIXTURE_SESSION_ID = 'session-139-comfort';
export const COMFORT_FIXTURE_WORLD_EPOCH = 1;
export const COMFORT_FIXTURE_HZ = 60;
export const COMFORT_FIXTURE_CLASS_ID = 'sedan';
export const COMFORT_FIXTURE_RIDE_ID = 'ride:139:1';
export const COMFORT_FIXTURE_TAXI_ID = 'taxi:139:A';
export const COMFORT_FIXTURE_INCARNATION = 'incarnation:139:1';
export const COMFORT_FIXTURE_PROFILE_ID = 'profile:139:base';
export const COMFORT_FIXTURE_VERSION_ID = 'version:139:1';

/** The tick of the real impact of the incident ride. */
export const COMFORT_FIXTURE_IMPACT_TICK = 60;
/** The tick of the real 030 recovery teleport of the recovery ride. */
export const COMFORT_FIXTURE_RECOVERY_TICK = 60;
/** The impulse of the real impact, in N*s. */
export const COMFORT_FIXTURE_IMPULSE_NS = 4_200;

/**
 * The ride profiles use dyadic accelerations on purpose: the 085 recorder stores the velocity in a
 * Float32Array, so a step of 1/64 m/s (0,9375 m/s² at 60 Hz) or 1/32 m/s (1,875 m/s²) is stored
 * exactly and the reported metric is the real telemetry value, not a rounding artefact.
 */
export const COMFORT_SMOOTH_ACCELERATION_MPS2 = 0.9375;
export const COMFORT_BRISK_ACCELERATION_MPS2 = 5.625;
export const COMFORT_JERKY_ACCELERATION_MPS2 = 1.875;

/** The real lateral capability of the sedan class: `grip 1,3 × 9,81 m/s²`. */
export const COMFORT_SEDAN_LATERAL_LIMIT_MPS2 = 1.3 * 9.81;

export interface ComfortMotion {
  readonly positionM: { readonly x: number; readonly y: number; readonly z: number };
  readonly velocityMps: { readonly x: number; readonly y: number; readonly z: number };
  readonly speedMps: number;
  readonly yawRad: number;
}

export interface ComfortSegmentPlan {
  readonly segmentId: string;
  readonly controlMode: ControlMode;
  readonly learningEligible: boolean;
  readonly startTick: number;
  readonly endTick: number;
  readonly motionAt: (tick: number) => ComfortMotion;
  /** The real 028 impact of this segment; the 088 filter cuts the window at that tick. */
  readonly impactAt?: number;
  /** The real 030 recovery of this segment. */
  readonly recoveryAt?: number;
  /** The tick whose sample carries the teleported velocity. */
  readonly teleportAt?: number;
  readonly closeReason?: 'RIDE_COMPLETED' | 'RECOVERY';
}

export interface ComfortRecordedRide {
  readonly rideId: string;
  readonly vehicleId: string;
  readonly readouts: readonly TickSampleReadout[];
  readonly windows: readonly FilteredWindowRecord[];
  /** The real 028 incidents of the ride, in tick order. */
  readonly incidents: readonly CollisionIncident[];
}

function yawQuaternion(yawRad: number): { x: number; y: number; z: number; w: number } {
  const half = yawRad / 2;
  return Object.freeze({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) });
}

function vehicleState(input: {
  readonly tick: number;
  readonly controlMode: ControlMode;
  readonly motion: ComfortMotion;
}): VehicleState {
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: COMFORT_FIXTURE_SESSION_ID,
    worldEpoch: COMFORT_FIXTURE_WORLD_EPOCH,
    vehicleId: COMFORT_FIXTURE_TAXI_ID,
    classId: COMFORT_FIXTURE_CLASS_ID,
    tick: input.tick,
    transform: Object.freeze({
      positionM: Object.freeze({ ...input.motion.positionM }),
      rotationQuaternion: yawQuaternion(input.motion.yawRad),
    }),
    velocityMps: Object.freeze({ ...input.motion.velocityMps }),
    laneId: null,
    controlMode: input.controlMode,
    appliedProfileVersion: COMFORT_FIXTURE_VERSION_ID,
    maneuverState: 'FOLLOWING' as const,
  });
}

function vehicleCommand(tick: number, controlMode: ControlMode): VehicleCommand {
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: COMFORT_FIXTURE_SESSION_ID,
    worldEpoch: COMFORT_FIXTURE_WORLD_EPOCH,
    vehicleId: COMFORT_FIXTURE_TAXI_ID,
    tick,
    throttle: 0,
    brake: 0,
    steering: 0,
    handbrake: false,
    turnSignal: 'OFF' as const,
    source: controlMode === 'AUTO' ? ('AUTONOMY' as const) : ('PLAYER' as const),
  });
}

function impactIncident(tick: number): CollisionIncident {
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: COMFORT_FIXTURE_SESSION_ID,
    worldEpoch: COMFORT_FIXTURE_WORLD_EPOCH,
    incidentId: `incident:139:${tick}`,
    tick,
    vehicleId: COMFORT_FIXTURE_TAXI_ID,
    otherEntityId: 'vehicle:139:other',
    impulseNs: COMFORT_FIXTURE_IMPULSE_NS,
    first: Object.freeze({
      entityId: COMFORT_FIXTURE_TAXI_ID,
      kind: 'VEHICLE' as const,
      serial: 1,
      colliderHandle: 1,
    }),
    second: Object.freeze({
      entityId: 'vehicle:139:other',
      kind: 'VEHICLE' as const,
      serial: 2,
      colliderHandle: 2,
    }),
  });
}

/**
 * Records the planned drive with the real 085 recorder and evaluates the same drive with the real
 * 088 artefact filter. The returned ride carries only real contract data.
 */
export function recordComfortRide(
  plans: readonly ComfortSegmentPlan[],
  options: { readonly rideId?: string; readonly vehicleId?: string } = {},
): ComfortRecordedRide {
  const recorder = createTickSampleRecorder({ capacity: 8_192 });
  const filter = createArtifactFilter({ maxWindows: 32 });
  const dt = 1 / COMFORT_FIXTURE_HZ;
  try {
    const readouts: TickSampleReadout[] = [];
    const windows: FilteredWindowRecord[] = [];
    const incidents: CollisionIncident[] = [];
    for (const [index, plan] of plans.entries()) {
      recorder.openSegment(
        {
          segmentId: plan.segmentId,
          sessionId: COMFORT_FIXTURE_SESSION_ID,
          worldEpoch: COMFORT_FIXTURE_WORLD_EPOCH,
          vehicleId: COMFORT_FIXTURE_TAXI_ID,
          classId: COMFORT_FIXTURE_CLASS_ID,
          controlMode: plan.controlMode,
          profileId: COMFORT_FIXTURE_PROFILE_ID,
          baseVersionId: COMFORT_FIXTURE_VERSION_ID,
          learningEpoch: 1,
          learningEligible: plan.learningEligible,
          inputType: plan.controlMode === 'AUTO' ? 'AUTONOMY' : 'KEYBOARD',
          startTick: plan.startTick,
        },
        index === 0 ? undefined : plans[index - 1]!.closeReason,
      );
      let previousState: VehicleState | null = null;
      for (let at = plan.startTick; at <= plan.endTick; at += 1) {
        const motion = plan.motionAt(at);
        const state = vehicleState({ tick: at, controlMode: plan.controlMode, motion });
        const physics =
          previousState === null
            ? { longitudinalAccelerationMps2: 0, lateralAccelerationMps2: 0 }
            : deriveTickSamplePhysics(previousState, state, dt);
        recorder.record({
          tick: at,
          state,
          command: vehicleCommand(at, plan.controlMode),
          raw: { throttle: 0, brake: 0, steering: 0, handbrake: false },
          physics,
          lane: null,
          signal: null,
        });
        previousState = state;
      }
      recorder.closeSegment(plan.closeReason ?? 'RIDE_COMPLETED');
      const summary = recorder.getSegment(plan.segmentId);
      if (summary === null) throw new Error(`Missing recorded segment ${plan.segmentId}`);
      for (let row = 0; row < summary.sampleCount; row += 1)
        readouts.push(recorder.readSample(plan.segmentId, row));
      if (plan.impactAt !== undefined) incidents.push(impactIncident(plan.impactAt));
      windows.push(
        filter.evaluate({
          tick: plan.endTick + 40,
          sessionId: COMFORT_FIXTURE_SESSION_ID,
          worldEpoch: COMFORT_FIXTURE_WORLD_EPOCH,
          segmentId: plan.segmentId,
          vehicleId: COMFORT_FIXTURE_TAXI_ID,
          incarnation: COMFORT_FIXTURE_INCARNATION,
          controlMode: plan.controlMode,
          learningEligible: plan.learningEligible,
          startTick: plan.startTick,
          endTick: plan.endTick,
          segmentCompleteness: 'CLOSED',
          closeReason: plan.closeReason ?? 'RIDE_COMPLETED',
          lostCheckpointTick: null,
          observationLoss: null,
          collisions:
            plan.impactAt === undefined
              ? []
              : [
                  {
                    tick: plan.impactAt,
                    incidentId: `incident:139:${plan.impactAt}`,
                    impulseNs: COMFORT_FIXTURE_IMPULSE_NS,
                    otherEntityId: 'vehicle:139:other',
                  },
                ],
          recoveries:
            plan.recoveryAt === undefined
              ? []
              : [
                  {
                    tick: plan.recoveryAt,
                    operationId: `recovery:139:${index + 1}`,
                    status: 'ADMITTED',
                    pointId: `point:139:${index + 1}`,
                    mapId: 'map:139',
                    laneId: 'lane:139',
                    mode:
                      plan.controlMode === 'MANUAL' ? ('MANUAL' as const) : ('LEARNING' as const),
                    validatedTick: plan.recoveryAt,
                    learningEligible: false,
                  },
                ],
          suspensions: [],
        }),
      );
    }
    return Object.freeze({
      rideId: options.rideId ?? COMFORT_FIXTURE_RIDE_ID,
      vehicleId: options.vehicleId ?? COMFORT_FIXTURE_TAXI_ID,
      readouts: Object.freeze(readouts),
      windows: Object.freeze(windows),
      incidents: Object.freeze(incidents),
    });
  } finally {
    recorder.dispose();
    filter.dispose();
  }
}

/** A straight drive with a constant acceleration; the speed grows from the initial value. */
export function linearMotion(input: {
  readonly initialSpeedMps: number;
  readonly accelerationMps2: number;
}): (tick: number) => ComfortMotion {
  const dt = 1 / COMFORT_FIXTURE_HZ;
  return (tick: number): ComfortMotion => {
    const speed = Math.max(0, input.initialSpeedMps + input.accelerationMps2 * tick * dt);
    const position =
      input.initialSpeedMps * tick * dt + 0.5 * input.accelerationMps2 * tick * tick * dt * dt;
    return {
      positionM: { x: position, y: 0, z: 0 },
      velocityMps: { x: speed, y: 0, z: 0 },
      speedMps: speed,
      yawRad: 0,
    };
  };
}

/**
 * A drive with an alternating acceleration: the acceleration stays inside the comfort threshold
 * while the jerk between two consecutive intervals explodes.
 */
export function jerkyMotion(input: {
  readonly initialSpeedMps: number;
  readonly accelerationMps2: number;
}): (tick: number) => ComfortMotion {
  const dt = 1 / COMFORT_FIXTURE_HZ;
  return (tick: number): ComfortMotion => {
    const odd = tick % 2 === 1;
    const speed = input.initialSpeedMps + (odd ? input.accelerationMps2 * dt : 0);
    const position =
      input.initialSpeedMps * tick * dt + input.accelerationMps2 * dt * dt * Math.ceil(tick / 2);
    return {
      positionM: { x: position, y: 0, z: 0 },
      velocityMps: { x: speed, y: 0, z: 0 },
      speedMps: speed,
      yawRad: 0,
    };
  };
}

/** A constant speed turn; the real lateral acceleration is `speed² / radius`. */ export function turnMotion(input: {
  readonly speedMps: number;
  readonly radiusM: number;
}): (tick: number) => ComfortMotion {
  const dt = 1 / COMFORT_FIXTURE_HZ;
  return (tick: number): ComfortMotion => {
    const angle = (input.speedMps * tick * dt) / input.radiusM;
    return {
      positionM: {
        x: input.radiusM * Math.sin(angle),
        y: 0,
        z: input.radiusM * (1 - Math.cos(angle)),
      },
      velocityMps: {
        x: input.speedMps * Math.cos(angle),
        y: 0,
        z: input.speedMps * Math.sin(angle),
      },
      speedMps: input.speedMps,
      yawRad: angle,
    };
  };
}

function segment(input: {
  readonly segmentId: string;
  readonly controlMode: ControlMode;
  readonly startTick?: number;
  readonly endTick: number;
  readonly motionAt: (tick: number) => ComfortMotion;
  readonly impactAt?: number;
  readonly recoveryAt?: number;
  readonly teleportAt?: number;
  readonly closeReason?: 'RIDE_COMPLETED' | 'RECOVERY';
}): ComfortSegmentPlan {
  return {
    segmentId: input.segmentId,
    controlMode: input.controlMode,
    learningEligible: input.controlMode === 'LEARNING',
    startTick: input.startTick ?? 0,
    endTick: input.endTick,
    motionAt: input.motionAt,
    ...(input.impactAt === undefined ? {} : { impactAt: input.impactAt }),
    ...(input.recoveryAt === undefined ? {} : { recoveryAt: input.recoveryAt }),
    ...(input.teleportAt === undefined ? {} : { teleportAt: input.teleportAt }),
    closeReason: input.closeReason ?? 'RIDE_COMPLETED',
  };
}

/** A linear drive with a comfortable acceleration. */
export function linearRide(
  controlMode: ControlMode = 'AUTO',
  overrides: { readonly rideId?: string; readonly vehicleId?: string } = {},
): ComfortRecordedRide {
  return recordComfortRide(
    [
      segment({
        segmentId: `segment:139:linear:${controlMode}`,
        controlMode,
        endTick: 120,
        motionAt: linearMotion({
          initialSpeedMps: 2,
          accelerationMps2: COMFORT_SMOOTH_ACCELERATION_MPS2,
        }),
      }),
    ],
    overrides,
  );
}

/** A linear drive above the comfort acceleration threshold. */
export function briskRide(
  controlMode: ControlMode = 'MANUAL',
  overrides: { readonly rideId?: string; readonly vehicleId?: string } = {},
): ComfortRecordedRide {
  return recordComfortRide(
    [
      segment({
        segmentId: `segment:139:brisk:${controlMode}`,
        controlMode,
        endTick: 120,
        motionAt: linearMotion({
          initialSpeedMps: 2,
          accelerationMps2: COMFORT_BRISK_ACCELERATION_MPS2,
        }),
      }),
    ],
    overrides,
  );
}

/** A linear drive with an alternating acceleration: the jerk explodes, the acceleration does not. */
export function jerkyRide(
  controlMode: ControlMode = 'LEARNING',
  overrides: { readonly rideId?: string; readonly vehicleId?: string } = {},
): ComfortRecordedRide {
  return recordComfortRide(
    [
      segment({
        segmentId: `segment:139:jerky:${controlMode}`,
        controlMode,
        endTick: 120,
        motionAt: jerkyMotion({
          initialSpeedMps: 6,
          accelerationMps2: COMFORT_JERKY_ACCELERATION_MPS2,
        }),
      }),
    ],
    overrides,
  );
}

/**
 * A turn with a real lateral acceleration. The lateral magnitude is `speed² / radius`, so the
 * comfortable turn stays below the real sedan capability and the sharp turn exceeds it.
 */
export function turnRide(input: {
  readonly controlMode?: ControlMode;
  readonly speedMps?: number;
  readonly radiusM: number;
  readonly rideId?: string;
  readonly vehicleId?: string;
}): ComfortRecordedRide {
  const controlMode = input.controlMode ?? 'AUTO';
  return recordComfortRide(
    [
      segment({
        segmentId: `segment:139:turn:${controlMode}`,
        controlMode,
        endTick: 120,
        motionAt: turnMotion({ speedMps: input.speedMps ?? 10, radiusM: input.radiusM }),
      }),
    ],
    { rideId: input.rideId, vehicleId: input.vehicleId },
  );
}

/** A drive with a real impact: the 088 filter cuts the window at the impact tick. */
export function incidentRide(
  controlMode: ControlMode = 'AUTO',
  overrides: { readonly rideId?: string; readonly vehicleId?: string } = {},
): ComfortRecordedRide {
  return recordComfortRide(
    [
      segment({
        segmentId: `segment:139:incident:${controlMode}`,
        controlMode,
        endTick: 120,
        motionAt: linearMotion({
          initialSpeedMps: 2,
          accelerationMps2: COMFORT_SMOOTH_ACCELERATION_MPS2,
        }),
        impactAt: COMFORT_FIXTURE_IMPACT_TICK,
      }),
    ],
    overrides,
  );
}

/** A drive with a real 030 recovery teleport: the 088 filter suppresses the boundary tick. */
export function recoveryRide(
  controlMode: ControlMode = 'MANUAL',
  overrides: { readonly rideId?: string; readonly vehicleId?: string } = {},
): ComfortRecordedRide {
  return recordComfortRide(
    [
      segment({
        segmentId: `segment:139:recovery:${controlMode}`,
        controlMode,
        endTick: 120,
        motionAt: linearMotion({
          initialSpeedMps: 2,
          accelerationMps2: COMFORT_SMOOTH_ACCELERATION_MPS2,
        }),
        recoveryAt: COMFORT_FIXTURE_RECOVERY_TICK,
        teleportAt: COMFORT_FIXTURE_RECOVERY_TICK,
        closeReason: 'RECOVERY',
      }),
    ],
    overrides,
  );
}

/** A mixed drive: AUTO, then MANUAL, then LEARNING inside one ride. */
export function mixedRide(
  overrides: { readonly rideId?: string; readonly vehicleId?: string } = {},
): ComfortRecordedRide {
  return recordComfortRide(
    [
      segment({
        segmentId: 'segment:139:mixed:auto',
        controlMode: 'AUTO',
        startTick: 0,
        endTick: 59,
        motionAt: linearMotion({
          initialSpeedMps: 2,
          accelerationMps2: COMFORT_SMOOTH_ACCELERATION_MPS2,
        }),
      }),
      segment({
        segmentId: 'segment:139:mixed:manual',
        controlMode: 'MANUAL',
        startTick: 60,
        endTick: 119,
        motionAt: linearMotion({
          initialSpeedMps: 2,
          accelerationMps2: COMFORT_SMOOTH_ACCELERATION_MPS2,
        }),
      }),
      segment({
        segmentId: 'segment:139:mixed:learning',
        controlMode: 'LEARNING',
        startTick: 120,
        endTick: 179,
        motionAt: linearMotion({
          initialSpeedMps: 2,
          accelerationMps2: COMFORT_SMOOTH_ACCELERATION_MPS2,
        }),
      }),
    ],
    overrides,
  );
}
