import type { RideState } from '../../src/fleet';
import { comfortTelemetryFromTickSamples } from '../../src/missions';
import type { ComfortSegmentFacts, ComfortSpeedSample, ComfortTelemetry } from '../../src/missions';
import {
  createArtifactFilter,
  createTickSampleRecorder,
  deriveTickSamplePhysics,
} from '../../src/telemetry';
import type { FilteredWindowRecord, TickSampleReadout } from '../../src/telemetry';
import type { VehicleCommand, VehicleState } from '../../src/vehicles';

/**
 * 121 comfort fixture. Every ride is recorded by the real 085 tick-sample recorder, every segment
 * is a real 069 MANUAL/LEARNING segment, every exclusion comes from the real 088 artefact filter
 * and the passenger comes from the real 061 ride lifecycle.
 */
export const COMFORT_SESSION_ID = 'session-121-comfort';
export const COMFORT_WORLD_EPOCH = 1;
export const COMFORT_RIDE_ID = 'ride:121:1';
export const COMFORT_TAXI_ID = 'taxi:121:A';
export const COMFORT_INCARNATION = 'incarnation:121:1';
export const COMFORT_PROFILE_ID = 'profile:121:base';
export const COMFORT_BASE_VERSION_ID = 'version:121:1';
export const COMFORT_HZ = 60;

/** The tick at which the 030 recovery is validated and the vehicle is teleported. */
export const RECOVERY_TICK = 60;
/** The speed the vehicle gains through the recovery teleport. */
export const RECOVERY_SPEED_JUMP_MPS = 12;

/**
 * The ride profiles use dyadic accelerations on purpose: the 085 recorder stores the velocity in a
 * Float32Array, and a step of 1/64 m/s (0,9375 m/s² at 60 Hz) or 1/32 m/s (1,875 m/s²) is stored
 * exactly, so the reported metric is the real telemetry value and not a rounding artefact.
 */
export const COMFORT_SMOOTH_ACCELERATION_MPS2 = 0.9375;
export const COMFORT_BRISK_ACCELERATION_MPS2 = 5.625;
export const COMFORT_JERKY_ACCELERATION_MPS2 = 1.875;

export interface DriveSegmentPlan {
  readonly segmentId: string;
  readonly startTick: number;
  /** Inclusive last tick of the segment. */
  readonly endTick: number;
  /** Longitudinal acceleration in m/s² for one absolute tick. */
  readonly accelerationAt: (tick: number) => number;
  /** The 030 recovery fact of this segment; the tick must be inside the segment. */
  readonly recoveryAt?: number;
  /** The tick whose sample carries the teleported velocity. */
  readonly teleportAt?: number;
  /** Real 069 close reason; a recovery closes the segment. */
  readonly closeReason: 'RIDE_COMPLETED' | 'RECOVERY';
}

export interface ComfortRideFixture {
  readonly rideId: string;
  readonly vehicleId: string;
  readonly rideState: RideState;
  readonly segments: readonly ComfortSegmentFacts[];
  readonly startTick: number;
  readonly endTick: number;
  readonly samples: readonly ComfortSpeedSample[];
  readonly artifactWindows: readonly FilteredWindowRecord[];
}

export interface RecordedRide {
  readonly ride: ComfortRideFixture;
  readonly telemetry: ComfortTelemetry;
  readonly readouts: readonly TickSampleReadout[];
}

const IDENTITY = Object.freeze({
  x: 0,
  y: 0,
  z: 0,
  w: 1,
});

function vehicleState(input: {
  readonly tick: number;
  readonly positionM: number;
  readonly speedMps: number;
}): VehicleState {
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: COMFORT_SESSION_ID,
    worldEpoch: COMFORT_WORLD_EPOCH,
    vehicleId: COMFORT_TAXI_ID,
    classId: 'sedan' as const,
    tick: input.tick,
    transform: Object.freeze({
      positionM: Object.freeze({ x: input.positionM, y: 0, z: 0 }),
      rotationQuaternion: IDENTITY,
    }),
    velocityMps: Object.freeze({ x: input.speedMps, y: 0, z: 0 }),
    laneId: null,
    controlMode: 'LEARNING' as const,
    appliedProfileVersion: COMFORT_BASE_VERSION_ID,
    maneuverState: 'FOLLOWING' as const,
  });
}

function vehicleCommand(input: {
  readonly tick: number;
  readonly accelerationMps2: number;
}): VehicleCommand {
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: COMFORT_SESSION_ID,
    worldEpoch: COMFORT_WORLD_EPOCH,
    vehicleId: COMFORT_TAXI_ID,
    tick: input.tick,
    throttle: Math.min(1, Math.max(0, input.accelerationMps2 / 3)),
    brake: Math.min(1, Math.max(0, -input.accelerationMps2 / 6)),
    steering: 0,
    handbrake: false,
    turnSignal: 'OFF' as const,
    source: 'PLAYER' as const,
  });
}

/**
 * Records the planned drive with the real 085 recorder and evaluates the same drive with the real
 * 088 artefact filter. The returned ride carries only real contract data.
 *
 * The 085 recorder refuses a physics value outside ±100 m/s², and a recovery is not a physical
 * acceleration: the recovery sets the velocity, so the teleported tick is recorded with a zero
 * longitudinal acceleration and the 088 filter marks the tick as the `TELEPORT` artefact.
 */
export function recordRide(
  plans: readonly DriveSegmentPlan[],
  options: { readonly rideState?: RideState; readonly initialSpeedMps?: number } = {},
): RecordedRide {
  const recorder = createTickSampleRecorder({ capacity: 8_192 });
  const filter = createArtifactFilter({ maxWindows: 32 });
  const dt = 1 / COMFORT_HZ;
  try {
    let speed = options.initialSpeedMps ?? 0;
    let position = 0;
    const readouts: TickSampleReadout[] = [];
    const windows: FilteredWindowRecord[] = [];
    const segments: ComfortSegmentFacts[] = [];
    for (const [index, plan] of plans.entries()) {
      recorder.openSegment(
        {
          segmentId: plan.segmentId,
          sessionId: COMFORT_SESSION_ID,
          worldEpoch: COMFORT_WORLD_EPOCH,
          vehicleId: COMFORT_TAXI_ID,
          classId: 'sedan',
          controlMode: 'LEARNING',
          profileId: COMFORT_PROFILE_ID,
          baseVersionId: COMFORT_BASE_VERSION_ID,
          learningEpoch: 1,
          learningEligible: true,
          inputType: 'KEYBOARD',
          startTick: plan.startTick,
        },
        index === 0 ? undefined : plans[index - 1]!.closeReason,
      );
      let previousState: VehicleState | null = null;
      for (let at = plan.startTick; at <= plan.endTick; at += 1) {
        const acceleration = plan.accelerationAt(at);
        speed = Math.max(0, speed + acceleration * dt);
        const teleported = plan.teleportAt === at;
        if (teleported) {
          speed += RECOVERY_SPEED_JUMP_MPS;
          position += 5;
        }
        position += speed * dt;
        const state = vehicleState({ tick: at, positionM: position, speedMps: speed });
        const physics =
          teleported || previousState === null
            ? { longitudinalAccelerationMps2: 0, lateralAccelerationMps2: 0 }
            : deriveTickSamplePhysics(previousState, state, dt);
        recorder.record({
          tick: at,
          state,
          command: vehicleCommand({ tick: at, accelerationMps2: acceleration }),
          raw: {
            throttle: Math.min(1, Math.max(0, acceleration / 3)),
            brake: Math.min(1, Math.max(0, -acceleration / 6)),
            steering: 0,
            handbrake: false,
          },
          physics,
          lane: null,
          signal: null,
        });
        previousState = state;
      }
      recorder.closeSegment(plan.closeReason);
      const summary = recorder.getSegment(plan.segmentId);
      if (summary === null) throw new Error(`Missing recorded segment ${plan.segmentId}`);
      segments.push(
        Object.freeze({
          segmentId: summary.segmentId,
          controlMode: summary.controlMode,
          learningEligible: summary.learningEligible,
          startTick: summary.startTick,
          endTick: summary.endTick ?? plan.endTick,
        }),
      );
      for (let row = 0; row < summary.sampleCount; row += 1)
        readouts.push(recorder.readSample(plan.segmentId, row));
      windows.push(
        filter.evaluate({
          tick: plan.endTick + 40,
          sessionId: COMFORT_SESSION_ID,
          worldEpoch: COMFORT_WORLD_EPOCH,
          segmentId: plan.segmentId,
          vehicleId: COMFORT_TAXI_ID,
          incarnation: COMFORT_INCARNATION,
          controlMode: 'LEARNING',
          learningEligible: true,
          startTick: plan.startTick,
          endTick: plan.endTick,
          segmentCompleteness: 'CLOSED',
          closeReason: plan.closeReason,
          lostCheckpointTick: null,
          observationLoss: null,
          collisions: [],
          recoveries:
            plan.recoveryAt === undefined
              ? []
              : [
                  {
                    tick: plan.recoveryAt,
                    operationId: `recovery:121:${index + 1}`,
                    status: 'ADMITTED',
                    pointId: `point:121:${index + 1}`,
                    mapId: 'map:121',
                    laneId: 'lane:121',
                    mode: 'LEARNING',
                    validatedTick: plan.recoveryAt,
                    learningEligible: false,
                  },
                ],
          suspensions: [],
        }),
      );
    }
    const telemetry = comfortTelemetryFromTickSamples(readouts);
    return {
      ride: Object.freeze({
        rideId: COMFORT_RIDE_ID,
        vehicleId: COMFORT_TAXI_ID,
        rideState: options.rideState ?? 'TO_DROPOFF',
        segments: Object.freeze(segments),
        startTick: segments[0]!.startTick,
        endTick: segments[segments.length - 1]!.endTick,
        samples: telemetry.samples,
        artifactWindows: Object.freeze(windows),
      }),
      telemetry,
      readouts: Object.freeze(readouts),
    };
  } finally {
    recorder.dispose();
    filter.dispose();
  }
}

/** One LEARNING segment with a constant acceleration. */
function singleSegmentPlan(input: {
  readonly segmentId: string;
  readonly startTick?: number;
  readonly endTick: number;
  readonly accelerationAt: (tick: number) => number;
  readonly recoveryAt?: number;
  readonly teleportAt?: number;
  readonly closeReason?: 'RIDE_COMPLETED' | 'RECOVERY';
}): DriveSegmentPlan {
  return {
    segmentId: input.segmentId,
    startTick: input.startTick ?? 0,
    endTick: input.endTick,
    accelerationAt: input.accelerationAt,
    ...(input.recoveryAt === undefined ? {} : { recoveryAt: input.recoveryAt }),
    ...(input.teleportAt === undefined ? {} : { teleportAt: input.teleportAt }),
    closeReason: input.closeReason ?? 'RIDE_COMPLETED',
  };
}

/** Lin: acceleration constant at 0,5 m/s². */
export function smoothRide(overrides: Partial<ComfortRideFixture> = {}): ComfortRideFixture {
  return Object.freeze({
    ...recordRide(
      [
        singleSegmentPlan({
          segmentId: 'segment:121:smooth',
          endTick: 120,
          accelerationAt: () => COMFORT_SMOOTH_ACCELERATION_MPS2,
        }),
      ],
      { initialSpeedMps: 2 },
    ).ride,
    ...overrides,
  });
}

/** Brusc: acceleration constant at 5 m/s², over the acceleration threshold. */
export function briskRide(overrides: Partial<ComfortRideFixture> = {}): ComfortRideFixture {
  return Object.freeze({
    ...recordRide(
      [
        singleSegmentPlan({
          segmentId: 'segment:121:brisk',
          endTick: 120,
          accelerationAt: () => COMFORT_BRISK_ACCELERATION_MPS2,
        }),
      ],
      { initialSpeedMps: 2 },
    ).ride,
    ...overrides,
  });
}

/** Jerky: alternating ±2 m/s² keeps the acceleration at the threshold while the jerk explodes. */
export function jerkyRide(overrides: Partial<ComfortRideFixture> = {}): ComfortRideFixture {
  return Object.freeze({
    ...recordRide(
      [
        singleSegmentPlan({
          segmentId: 'segment:121:jerky',
          endTick: 120,
          accelerationAt: (tick) =>
            tick % 2 === 0 ? COMFORT_JERKY_ACCELERATION_MPS2 : -COMFORT_JERKY_ACCELERATION_MPS2,
        }),
      ],
      { initialSpeedMps: 6 },
    ).ride,
    ...overrides,
  });
}

/**
 * Recuperare: the 030 recovery closes the first segment and the drive continues in a new one. The
 * real 088 window suppresses the recovery boundary tick, so the teleport never reaches the metric.
 */
function recoveryPlans(): readonly DriveSegmentPlan[] {
  return [
    singleSegmentPlan({
      segmentId: 'segment:121:before-recovery',
      endTick: RECOVERY_TICK - 1,
      accelerationAt: () => COMFORT_SMOOTH_ACCELERATION_MPS2,
      recoveryAt: RECOVERY_TICK - 1,
      closeReason: 'RECOVERY',
    }),
    singleSegmentPlan({
      segmentId: 'segment:121:after-recovery',
      startTick: RECOVERY_TICK,
      endTick: 120,
      accelerationAt: () => COMFORT_SMOOTH_ACCELERATION_MPS2,
      teleportAt: RECOVERY_TICK,
    }),
  ];
}

export function recoveryRide(overrides: Partial<ComfortRideFixture> = {}): ComfortRideFixture {
  return Object.freeze({
    ...recordRide(recoveryPlans(), { initialSpeedMps: 2 }).ride,
    ...overrides,
  });
}

/** The same drive without the real 088 window: the teleport looks like a comfort violation. */
export function recoveryRideWithoutWindows(): ComfortRideFixture {
  const recorded = recordRide(recoveryPlans(), { initialSpeedMps: 2 });
  return Object.freeze({ ...recorded.ride, artifactWindows: Object.freeze([]) });
}

/**
 * Recuperare cu segment deschis: the same recovery stays inside one open segment, so the 088
 * window suppresses the boundary tick and everything after it.
 */
export function tailRecoveryRide(overrides: Partial<ComfortRideFixture> = {}): ComfortRideFixture {
  return Object.freeze({
    ...recordRide(
      [
        singleSegmentPlan({
          segmentId: 'segment:121:tail-recovery',
          endTick: 120,
          accelerationAt: () => COMFORT_SMOOTH_ACCELERATION_MPS2,
          recoveryAt: RECOVERY_TICK,
          teleportAt: RECOVERY_TICK,
        }),
      ],
      { initialSpeedMps: 2 },
    ).ride,
    ...overrides,
  });
}

/** A clean 088 window without artefacts: the suppression spans stay empty. */
export function cleanWindows(): readonly FilteredWindowRecord[] {
  return recordRide([
    singleSegmentPlan({
      segmentId: 'segment:121:clean',
      endTick: 120,
      accelerationAt: () => COMFORT_SMOOTH_ACCELERATION_MPS2,
    }),
  ]).ride.artifactWindows;
}

/** The real 085 telemetry of a smooth ride, for the acceleration cross-check. */
export function smoothTelemetry(): ComfortTelemetry {
  return recordRide(
    [
      singleSegmentPlan({
        segmentId: 'segment:121:smooth',
        endTick: 120,
        accelerationAt: () => COMFORT_SMOOTH_ACCELERATION_MPS2,
      }),
    ],
    { initialSpeedMps: 2 },
  ).telemetry;
}
