import type { ContractContext } from '../../src/sessions';
import {
  createManualTrip,
  MANUAL_TRIP_LIMITS,
  type ManualTrip,
  type ManualTripMode,
  type ManualTripOptions,
  type ManualTripProfile,
} from '../../src/app/manual-trip';
import { createControlAuthority } from '../../src/input/control-authority';
import { createModeControls } from '../../src/input/mode-controls';
import { createVehicleSelection } from '../../src/input/vehicle-selection';
import type { VehicleSelectionPorts } from '../../src/input/vehicle-selection';
import { createVehicleController } from '../../src/vehicles/controller';
import type {
  BodyIdentity,
  ControlMode,
  VehicleCommand,
  VehicleControlProjection,
} from '../../src/vehicles';
import { parseVehicleCommand, parseVehicleState } from '../../src/vehicles/contracts';
import { createRideDropoff, createRidePickup } from '../../src/fleet';
import type { DispatchAssignment, RideDropoff, RidePickup } from '../../src/fleet';
import { parseTelemetrySample } from '../../src/telemetry';
import type { TelemetrySample } from '../../src/telemetry';
import type { TakeoverPhysicalState } from '../../src/autonomy';
import { createRideLifecycleWorld, disposeRideLifecycleWorld } from '../fleet/ride-fsm-fixture';
import type { RideLifecycleWorld } from '../fleet/ride-fsm-fixture';
import { zoneCenter } from '../fleet/pickup-fixture';

/** The 072 probe world: real 057/059/060/061/062/063 + real 066/067/068/069 composition. */
export const TRIP_CONTEXT: ContractContext = Object.freeze({
  schemaVersion: 1,
  units: 'SI',
  sessionId: 'session:072',
  worldEpoch: 0,
});

export const TRIP_PROFILE: ManualTripProfile = Object.freeze({
  playerId: 'player:072',
  profileId: 'style:072',
  baseVersionId: 'style-v1',
  learningEpoch: 1,
  controlPreferencesVersion: 'keys-1',
  engineVersion: 'engine-072',
  mapVersion: 'map-neighbourhood',
  inputType: 'KEYBOARD',
  values: Object.freeze({
    desired_acceleration: 2.6,
    comfort_deceleration: 3.1,
    following_time_headway: 1.8,
    stop_full_probability: 0.6,
  }),
  proofs: Object.freeze({
    desired_acceleration: 2,
    comfort_deceleration: 1,
    following_time_headway: 4,
    stop_full_probability: 0,
  }),
});

const PLAYER_OBSERVATION = Object.freeze(['speed_delta_urban', 'following_time_headway']);
const LEARNING_OBSERVATION = Object.freeze(['speed_delta_urban', 'desired_acceleration']);

export interface TripTimeline {
  readonly beginTick: number;
  readonly firstStepTick: number;
  readonly boardingTick: number;
  readonly driveStartTick: number;
  readonly driveTicks: number;
  readonly driveSpeedMps: number;
  readonly dropoffStartTick: number;
  readonly completionTick: number;
  readonly pickupDwellTicks: number;
  readonly dropoffDwellTicks: number;
  readonly pickupCenter: Readonly<{ x: number; y: number; z: number }>;
  readonly dropoffCenter: Readonly<{ x: number; y: number; z: number }>;
}

export interface ManualTripWorld {
  readonly context: ContractContext;
  readonly rideWorld: RideLifecycleWorld;
  readonly assignment: DispatchAssignment;
  readonly taxi: BodyIdentity;
  readonly profile: ManualTripProfile;
  readonly pickup: RidePickup;
  readonly dropoff: RideDropoff;
  readonly options: ManualTripOptions;
  readonly trip: ManualTrip;
  readonly timeline: TripTimeline;
  /** Advances the real 066 authority without inventing a ride or a segment. */
  advanceAuthorityTo(tick: number): void;
  begin(): ReturnType<ManualTrip['begin']>;
  requestMode(mode: ManualTripMode, atTick?: number): ReturnType<ManualTrip['requestMode']>;
  step(atTick: number): ReturnType<ManualTrip['step']>;
  runTo(tick: number): void;
  suspend(): void;
  resume(): void;
  setSelected(identity: BodyIdentity | null): void;
  setLearningEligible(value: boolean | null): void;
  setObservation(source: 'PLAYER' | 'LEARNING' | 'NONE'): void;
  /** Injects a discontinuity into the host physical readback at/after `atTick`; never writes the real state. */
  setPhysicalDiscontinuity(atTick: number, offsetM: number): void;
  dispose(): void;
}

export function createManualTripWorld(): ManualTripWorld {
  const rideWorld = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 }),
    assignment = rideWorld.assignments[0];
  if (assignment === undefined) throw new Error('The 072 fixture has no assignment');
  const context = TRIP_CONTEXT,
    taxi: BodyIdentity = Object.freeze({
      entityId: assignment.taxiId,
      handle: 1,
      generation: 1,
    }),
    identities = new Map<string, BodyIdentity>([[taxi.entityId, taxi]]),
    bodyIdentity = (id: string) => identities.get(id),
    pickups = createRidePickup({
      map: rideWorld.dispatcherWorld.map,
      lifecycle: rideWorld.lifecycle,
    }),
    dropoffs = createRideDropoff({
      map: rideWorld.dispatcherWorld.map,
      lifecycle: rideWorld.lifecycle,
    }),
    controller = createVehicleController(context, {
      bodyIdentity,
      step() {
        return {
          controllerMs: 0,
          stepMs: 0,
          queryMs: 0,
          bridgeMs: 0,
          totalMs: 0,
          queryCount: 0,
          bridgeCalls: 0,
        };
      },
    }),
    authority = createControlAuthority(context, controller, {
      bodyIdentity,
      clearOldPlayer: () => undefined,
    }),
    modes = createModeControls(context, {
      readAuthority: () => authority.getStats(),
      selectedIdentity: () => selected,
      bodyIdentity,
    }),
    selectionPorts: VehicleSelectionPorts = {
      readAuthority: () => authority.getStats(),
      bodyIdentity,
      readPresentation: (identity) => ({
        identity,
        kind: 'TAXI',
        visible: true,
        selectable: true,
      }),
      readCameraTarget: () => taxi,
      selectCamera: () => undefined,
      clearInput: () => undefined,
      readAssignment: (identity) => ({
        context,
        identity,
        routeFingerprint: `route:${identity.entityId}`,
        tripFingerprint: `trip:${identity.entityId}`,
      }),
      readBoundary: () => null,
      closeBoundary: () => undefined,
    },
    selection = createVehicleSelection(context, selectionPorts);
  authority.register(taxi);
  selection.register(taxi, 'TAXI');

  const map = rideWorld.dispatcherWorld.map,
    pickupCenter = zoneCenter(map, assignment.pickupZoneId),
    dropoffCenter = zoneCenter(map, assignment.dropoffZoneId),
    distanceM = Math.hypot(dropoffCenter.x - pickupCenter.x, dropoffCenter.z - pickupCenter.z),
    driveTicks = Math.max(60, Math.min(600, Math.ceil((distanceM / 20) * 60))),
    driveSeconds = driveTicks / MANUAL_TRIP_LIMITS.tickHz,
    driveSpeedMps = distanceM / driveSeconds,
    beginTick = 10,
    firstStepTick = beginTick + 1,
    boardingTick = firstStepTick + pickups.requiredDwellTicks,
    driveStartTick = boardingTick + 1,
    dropoffStartTick = driveStartTick + driveTicks,
    completionTick = dropoffStartTick + dropoffs.requiredDwellTicks,
    timeline: TripTimeline = Object.freeze({
      beginTick,
      firstStepTick,
      boardingTick,
      driveStartTick,
      driveTicks,
      driveSpeedMps,
      dropoffStartTick,
      completionTick,
      pickupDwellTicks: pickups.requiredDwellTicks,
      dropoffDwellTicks: dropoffs.requiredDwellTicks,
      pickupCenter,
      dropoffCenter,
    });

  let learningEligible: boolean | null = true,
    observationSource: 'PLAYER' | 'LEARNING' | 'NONE' = 'LEARNING',
    selected: BodyIdentity | null = taxi,
    discontinuity: { readonly atTick: number; readonly offsetM: number } | null = null,
    rideId: string | null = null;

  function atPosition(atTick: number) {
    if (atTick < driveStartTick) return { x: pickupCenter.x, y: pickupCenter.y, z: pickupCenter.z };
    if (atTick >= dropoffStartTick) return dropoffCenter;
    const progress = (atTick - driveStartTick) / driveTicks;
    return {
      x: pickupCenter.x + (dropoffCenter.x - pickupCenter.x) * progress,
      y: pickupCenter.y + (dropoffCenter.y - pickupCenter.y) * progress,
      z: pickupCenter.z + (dropoffCenter.z - pickupCenter.z) * progress,
    };
  }

  function velocityAt(atTick: number) {
    if (atTick < driveStartTick || atTick >= dropoffStartTick) return { x: 0, y: 0, z: 0 };
    return {
      x: (dropoffCenter.x - pickupCenter.x) / driveSeconds,
      y: 0,
      z: (dropoffCenter.z - pickupCenter.z) / driveSeconds,
    };
  }

  function stateAt(atTick: number) {
    const mode: ControlMode = authority.getStats().seat?.mode ?? 'AUTO';
    return parseVehicleState({
      ...context,
      vehicleId: taxi.entityId,
      classId: 'sedan',
      tick: atTick,
      transform: {
        positionM: atPosition(atTick),
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      },
      velocityMps: velocityAt(atTick),
      laneId: null,
      controlMode: mode,
      appliedProfileVersion: TRIP_PROFILE.baseVersionId,
      maneuverState: 'IDLE',
    });
  }

  function command(
    atTick: number,
    source: 'PLAYER' | 'AUTONOMY',
    values: Partial<Pick<VehicleCommand, 'throttle' | 'brake' | 'steering'>> = {},
  ): VehicleCommand {
    return parseVehicleCommand({
      ...context,
      vehicleId: taxi.entityId,
      tick: atTick,
      source,
      throttle: 0,
      brake: 0,
      steering: 0,
      handbrake: false,
      turnSignal: 'OFF',
      ...values,
    });
  }

  function packets(atTick: number) {
    return [
      { identity: taxi, command: command(atTick, 'AUTONOMY', { throttle: 0.15 }) },
      {
        identity: taxi,
        command: command(atTick, 'PLAYER', { throttle: 0.4, steering: 0.1 }),
      },
    ];
  }

  function telemetry(
    atTick: number,
    state: ReturnType<typeof stateAt>,
    control: VehicleControlProjection | null,
  ): TelemetrySample {
    const mode: ManualTripMode = state.controlMode,
      fallback = command(atTick, mode === 'AUTO' ? 'AUTONOMY' : 'PLAYER'),
      effective = control?.command ?? fallback,
      raw = control?.raw ?? effective;
    return parseTelemetrySample({
      tick: atTick,
      state,
      command: effective,
      rawInput: {
        throttle: raw.throttle,
        brake: raw.brake,
        steering: raw.steering,
        handbrake: raw.handbrake,
      },
      longitudinalAccelerationMps2: 1.2,
      lateralAccelerationMps2: 0.1,
      capabilities: {
        maxAccelerationMps2: 6,
        maxDecelerationMps2: 8,
        maxLateralAccelerationMps2: 5,
      },
      context: {
        roadType: 'URBAN',
        speedLimitMps: 13,
        curvaturePerM: 0,
        leaderId: null,
        leaderGapM: null,
        signalId: null,
        signalState: null,
        stopLineId: null,
        distanceToStopLineM: null,
        conflictEntityIds: [],
        rideId,
      },
      excludedReason: null,
    });
  }

  function physical(atTick: number): TakeoverPhysicalState {
    const state = stateAt(atTick),
      offset = discontinuity !== null && atTick >= discontinuity.atTick ? discontinuity.offsetM : 0;
    return Object.freeze({
      tick: atTick,
      positionM: Object.freeze({
        ...state.transform.positionM,
        x: state.transform.positionM.x + offset,
      }),
      headingRad: 0,
      velocityMps: Object.freeze({ ...state.velocityMps }),
      yawRateRadps: 0,
      drivetrainDirection: 'FORWARD' as const,
      damage: 0,
    });
  }

  const options: ManualTripOptions = {
    context,
    lifecycle: rideWorld.lifecycle,
    pickup: pickups,
    dropoff: dropoffs,
    authority,
    modes,
    selection,
    taxiIdentity: taxi,
    profile: TRIP_PROFILE,
    ownerId: 'trip:072',
    readState: stateAt,
    readTelemetry: telemetry,
    readObservation: (_atTick: number, _state: ReturnType<typeof stateAt>, mode: ControlMode) => {
      if (observationSource === 'NONE') return [];
      if (observationSource === 'LEARNING')
        return mode === 'LEARNING' ? LEARNING_OBSERVATION : PLAYER_OBSERVATION;
      return PLAYER_OBSERVATION;
    },
    readLearningEligibility: () => learningEligible,
    continuity: {
      graph: rideWorld.dispatcherWorld.graph,
      readPhysical: physical,
      readReentry: () => null,
    },
  };
  const trip = createManualTrip(options);

  function advanceAuthorityTo(atTick: number): void {
    runTo(atTick);
  }

  function step(atTick: number) {
    const result = trip.step({ tick: atTick, packets: packets(atTick) });
    if (result.accepted && rideId === null) {
      const ride = rideWorld.lifecycle.rideFor(assignment.requestId);
      rideId = ride?.rideId ?? null;
    }
    return result;
  }

  function runTo(tick: number): void {
    while (authority.getStats().tick < tick) step(authority.getStats().tick + 1);
  }

  return {
    context,
    rideWorld,
    assignment,
    taxi,
    profile: TRIP_PROFILE,
    pickup: pickups,
    dropoff: dropoffs,
    options,
    trip,
    timeline,
    advanceAuthorityTo,
    begin() {
      const result = trip.begin({
        requestId: assignment.requestId,
        eventId: `assigned:${assignment.requestId}`,
        tick: authority.getStats().tick,
        taxiId: taxi.entityId,
      });
      if (result.accepted) rideId = result.rideId;
      return result;
    },
    requestMode(mode, atTick = authority.getStats().tick) {
      return trip.requestMode({ tick: atTick, mode });
    },
    step,
    runTo,
    suspend() {
      authority.suspend();
    },
    resume() {
      authority.resume();
    },
    setSelected(identity) {
      selected = identity;
    },
    setLearningEligible(value) {
      learningEligible = value;
    },
    setObservation(source) {
      observationSource = source;
    },
    setPhysicalDiscontinuity(atTick, offsetM) {
      discontinuity = Object.freeze({ atTick, offsetM });
    },
    dispose() {
      trip.dispose();
      pickups.dispose();
      dropoffs.dispose();
      modes.dispose();
      selection.dispose();
      authority.dispose();
      controller.dispose();
      disposeRideLifecycleWorld(rideWorld);
    },
  };
}

/** Runs the real timeline up to `tick` with no intervention. */
export function driveTo(world: ManualTripWorld, tick: number): void {
  world.runTo(tick);
}
