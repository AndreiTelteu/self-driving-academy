import type { ContractContext } from '../../src/sessions';
import { parseV2ContextScenario } from '../../src/telemetry';
import type { V2ContextCategory, V2ContextScenario } from '../../src/telemetry';

/**
 * Deterministic frame builders for the 163 V2 context scenarios. Every frame is assembled from the
 * real contracts (085/069 telemetry sample, 007 event stream, 030 hazard shape, 033/219 route fact,
 * 061 ride fact) and then parsed by `parseV2ContextScenario`, so a scenario cannot carry a value the
 * contracts would refuse.
 */

const V2_CONTEXT_FIXTURE: ContractContext = Object.freeze({
  schemaVersion: 1,
  units: 'SI',
  sessionId: '163-v2-contexts',
  worldEpoch: 1,
});

const VEHICLE_ID = 'taxi-1';
const BASE_PROFILE = 'style-v1';

let eventSequence = 0;

export function resetV2EventSequence(): void {
  eventSequence = 0;
}

export interface V2SampleSpec {
  readonly roadType?: 'RESIDENTIAL' | 'URBAN' | 'ARTERIAL';
  readonly speedLimitMps?: number;
  readonly curvaturePerM?: number;
  readonly leaderId?: string | null;
  readonly leaderGapM?: number | null;
  readonly signalId?: string | null;
  readonly signalState?: 'RED' | 'YELLOW' | 'GREEN' | null;
  readonly stopLineId?: string | null;
  readonly distanceToStopLineM?: number | null;
  readonly conflictEntityIds?: readonly string[];
  readonly rideId?: string | null;
  readonly throttle?: number;
  readonly brake?: number;
  readonly steering?: number;
  readonly turnSignal?: 'OFF' | 'LEFT' | 'RIGHT' | 'HAZARD';
  readonly speedMps?: number;
  readonly longitudinalAccelerationMps2?: number;
  readonly lateralAccelerationMps2?: number;
  readonly excludedReason?:
    'COLLISION_IMPULSE' | 'RECOVERY' | 'TELEPORT' | 'PAUSE' | 'FOCUS_LOST' | null;
}

export interface V2FrameSpec {
  readonly sample?: V2SampleSpec;
  readonly events?: readonly Record<string, unknown>[];
  readonly hazards?: readonly Record<string, unknown>[];
  readonly route?: Record<string, unknown> | null;
  readonly service?: Record<string, unknown> | null;
  readonly driverActions?: readonly Record<string, unknown>[];
}

export function v2Sample(tick: number, spec: V2SampleSpec = {}): Record<string, unknown> {
  const leaderId = spec.leaderId ?? null;
  const leaderGapM = spec.leaderGapM ?? null;
  const signalId = spec.signalId ?? null;
  const signalState = spec.signalState ?? null;
  const stopLineId = spec.stopLineId ?? null;
  const distanceToStopLineM = spec.distanceToStopLineM ?? null;
  if ((leaderId === null) !== (leaderGapM === null))
    throw new Error('Fixture leader context must be complete');
  if ((signalId === null) !== (signalState === null))
    throw new Error('Fixture signal context must be complete');
  if ((stopLineId === null) !== (distanceToStopLineM === null))
    throw new Error('Fixture stop-line context must be complete');
  const speedMps = spec.speedMps ?? 10;
  return {
    tick,
    state: {
      ...V2_CONTEXT_FIXTURE,
      vehicleId: VEHICLE_ID,
      classId: 'sedan',
      tick,
      transform: {
        positionM: { x: 0, y: 0.5, z: tick * 0.05 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      },
      velocityMps: { x: 0, y: 0, z: speedMps },
      laneId: 'lane-1',
      controlMode: 'LEARNING',
      appliedProfileVersion: BASE_PROFILE,
      maneuverState: 'FOLLOWING',
    },
    command: {
      ...V2_CONTEXT_FIXTURE,
      vehicleId: VEHICLE_ID,
      tick,
      throttle: spec.throttle ?? 0.4,
      brake: spec.brake ?? 0,
      steering: spec.steering ?? 0,
      handbrake: false,
      turnSignal: spec.turnSignal ?? 'OFF',
      source: 'PLAYER',
    },
    rawInput: {
      throttle: spec.throttle ?? 0.4,
      brake: spec.brake ?? 0,
      steering: spec.steering ?? 0,
      handbrake: false,
    },
    longitudinalAccelerationMps2: spec.longitudinalAccelerationMps2 ?? 0.2,
    lateralAccelerationMps2: spec.lateralAccelerationMps2 ?? 0,
    capabilities: {
      maxAccelerationMps2: 6,
      maxDecelerationMps2: 8,
      maxLateralAccelerationMps2: 5,
    },
    context: {
      roadType: spec.roadType ?? 'URBAN',
      speedLimitMps: spec.speedLimitMps ?? 13.9,
      curvaturePerM: spec.curvaturePerM ?? 0,
      leaderId,
      leaderGapM,
      signalId,
      signalState,
      stopLineId,
      distanceToStopLineM,
      conflictEntityIds: [...(spec.conflictEntityIds ?? [])],
      rideId: spec.rideId ?? null,
    },
    excludedReason: spec.excludedReason ?? null,
  };
}

export function v2Event(
  tick: number,
  type: string,
  payload: Record<string, unknown>,
  entityIds: readonly string[],
): Record<string, unknown> {
  eventSequence += 1;
  return {
    ...V2_CONTEXT_FIXTURE,
    eventId: `163-event-${String(eventSequence).padStart(3, '0')}`,
    tick,
    entityIds: [...entityIds],
    type,
    payload,
  };
}

export function v2Frame(tick: number, spec: V2FrameSpec = {}): Record<string, unknown> {
  return {
    tick,
    sample: v2Sample(tick, spec.sample ?? {}),
    events: [...(spec.events ?? [])],
    hazards: [...(spec.hazards ?? [])],
    route: spec.route ?? null,
    service: spec.service ?? null,
    driverActions: [...(spec.driverActions ?? [])],
  };
}

export function v2Scenario(
  scenarioId: string,
  category: V2ContextCategory | null,
  title: string,
  frames: readonly Record<string, unknown>[],
): V2ContextScenario {
  return parseV2ContextScenario({ scenarioId, category, title, frames });
}

export function pedestrian(entityId: string, observable = true): Record<string, unknown> {
  return { entityId, kind: 'PEDESTRIAN', radiusM: 0.4, active: true, observable };
}

export function obstacle(entityId: string, observable = true): Record<string, unknown> {
  return { entityId, kind: 'OBSTACLE', radiusM: 0.8, active: true, observable };
}

export interface V2RouteSpec {
  readonly status?: 'READY' | 'BLOCKED';
  readonly alternatives?: number;
  readonly selectedIndex?: number;
  readonly costSeconds?: number;
  readonly turnCount?: number;
  readonly signalCount?: number;
  readonly congestedAlternatives?: number;
  readonly blockedLaneIds?: readonly string[];
  readonly recoveryStage?: 'NONE' | 'WAITING' | 'REROUTE' | 'RECOVERY' | 'STAY_BLOCKED';
  readonly uTurnAvailable?: boolean;
}

export function v2Route(spec: V2RouteSpec = {}): Record<string, unknown> {
  const alternatives = spec.alternatives ?? 2;
  return {
    status: spec.status ?? 'READY',
    alternatives,
    selectedIndex: spec.selectedIndex ?? 0,
    costSeconds: spec.costSeconds ?? 90,
    turnCount: spec.turnCount ?? 0,
    signalCount: spec.signalCount ?? 0,
    congestedAlternatives: spec.congestedAlternatives ?? 0,
    blockedLaneIds: [...(spec.blockedLaneIds ?? [])],
    recoveryStage: spec.recoveryStage ?? 'NONE',
    uTurnAvailable: spec.uTurnAvailable ?? false,
    source: 'ROUTE_PLANNER',
  };
}

export interface V2ServiceSpec {
  readonly phase?: 'TO_PICKUP' | 'AT_PICKUP' | 'TO_DROPOFF' | 'AT_DROPOFF';
  readonly curbDistanceM?: number;
  readonly stopPrecisionM?: number;
  readonly passengerOnboard?: boolean;
}

export function v2Service(spec: V2ServiceSpec = {}): Record<string, unknown> {
  return {
    phase: spec.phase ?? 'TO_PICKUP',
    curbDistanceM: spec.curbDistanceM ?? 0.5,
    stopPrecisionM: spec.stopPrecisionM ?? 1,
    passengerOnboard: spec.passengerOnboard ?? false,
    source: 'RIDE_FSM',
  };
}
