import { createRideDropoff } from '../../src/fleet';
import type { DropoffDecision, RideDropoff } from '../../src/fleet';
import {
  MISSION_CATALOG_NAMESPACE,
  createCampaignMissionCatalog,
  createMissionTracker,
  parseMissionCatalog,
} from '../../src/missions';
import type { MissionCatalog, MissionDefinition, MissionTracker } from '../../src/missions';
import { createEventBus } from '../../src/simulation';
import type { EventBus, SimulationEvent } from '../../src/simulation';
import { createRideLifecycleWorld } from '../fleet/ride-fsm-fixture';
import { zoneCenter } from '../fleet/dropoff-fixture';

/**
 * 116 mission fixture. Events are plain contract values validated by the real
 * `parseSimulationEvent`; the tracker consumes them directly or through a real 007 bus.
 */
export const MISSION_SESSION_ID = 'session-116-missions';
export const MISSION_WORLD_EPOCH = 1;
export const MISSION_NAMESPACE = MISSION_CATALOG_NAMESPACE;
export const MISSION_PROFILE_ID = 'profile:116';
export const MISSION_SCENARIO_ID = 'scenario:mission-schema-116';

type EventType = SimulationEvent['type'];

interface Envelope {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly eventId: string;
  readonly tick: number;
  readonly entityIds: readonly string[];
  readonly type: EventType;
  readonly payload: Readonly<Record<string, unknown>>;
}

export function missionEvent(
  type: EventType,
  eventId: string,
  tick: number,
  entityIds: readonly string[],
  payload: Readonly<Record<string, unknown>>,
): Envelope {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: MISSION_SESSION_ID,
    worldEpoch: MISSION_WORLD_EPOCH,
    eventId,
    tick,
    entityIds: [...entityIds],
    type,
    payload,
  };
}

export function manualStart(
  eventId: string,
  tick: number,
  vehicleId: string,
  controlMode: 'MANUAL' | 'LEARNING' = 'MANUAL',
): Envelope {
  return missionEvent('MANUAL_START', eventId, tick, [vehicleId], { vehicleId, controlMode });
}

export function manualEnd(
  eventId: string,
  tick: number,
  vehicleId: string,
  controlMode: 'MANUAL' | 'LEARNING' = 'MANUAL',
): Envelope {
  return missionEvent('MANUAL_END', eventId, tick, [vehicleId], { vehicleId, controlMode });
}

export function dropoff(
  eventId: string,
  tick: number,
  vehicleId: string,
  rideId: string,
): Envelope {
  return missionEvent('DROPOFF', eventId, tick, [vehicleId, rideId], { vehicleId, rideId });
}

export function pickup(eventId: string, tick: number, vehicleId: string, rideId: string): Envelope {
  return missionEvent('PICKUP', eventId, tick, [vehicleId, rideId], { vehicleId, rideId });
}

export function collision(
  eventId: string,
  tick: number,
  vehicleId: string,
  otherEntityId = 'obstacle:116',
): Envelope {
  return missionEvent('COLLISION', eventId, tick, [vehicleId, otherEntityId], {
    vehicleId,
    otherEntityId,
    impulseNs: 1200,
  });
}

export function profileActivate(
  eventId: string,
  tick: number,
  profileId: string,
  versionId: string,
  learningEpoch = 1,
  activationTick = tick,
): Envelope {
  return missionEvent('PROFILE_ACTIVATE', eventId, tick, [profileId], {
    profileId,
    versionId,
    learningEpoch,
    activationTick,
  });
}

export function fullStop(
  eventId: string,
  tick: number,
  vehicleId: string,
  opportunityId: string,
  durationS: number,
): Envelope {
  return missionEvent('FULL_STOP', eventId, tick, [vehicleId], {
    vehicleId,
    opportunityId,
    durationS,
  });
}

export function laneChangeCompleted(
  eventId: string,
  tick: number,
  vehicleId: string,
  opportunityId: string,
  fromLaneId: string,
  toLaneId: string,
): Envelope {
  return missionEvent('LANE_CHANGE_COMPLETED', eventId, tick, [vehicleId], {
    vehicleId,
    opportunityId,
    fromLaneId,
    toLaneId,
  });
}

export function leaderAcquired(
  eventId: string,
  tick: number,
  vehicleId: string,
  leaderId: string,
  gapM: number,
): Envelope {
  return missionEvent('LEADER_ACQUIRED', eventId, tick, [vehicleId, leaderId], {
    vehicleId,
    leaderId,
    gapM,
  });
}

export function createMissionTestCatalog(
  missions: readonly MissionDefinition[] = createCampaignMissionCatalog(MISSION_NAMESPACE).missions,
  namespace: string = MISSION_NAMESPACE,
): MissionCatalog {
  return parseMissionCatalog({
    schemaVersion: 1,
    units: 'SI',
    version: '116-mission-schema-v1',
    namespace,
    missions,
  });
}

export function testMission(overrides: Partial<MissionDefinition> = {}): MissionDefinition {
  return {
    schemaVersion: 1,
    units: 'SI',
    missionId: 'test-mission',
    version: '1',
    title: 'Test mission',
    objectives: [
      {
        objectiveId: 'dropoffs',
        kind: 'DROPOFFS',
        label: 'Complete rides',
        target: 1,
        difficultyTargets: { NORMAL: 1 },
        minDurationS: null,
        profileId: null,
      },
    ],
    rewards: [
      { rewardId: 'xp', kind: 'XP', amount: 100, unlockId: null },
      {
        rewardId: 'unlock',
        kind: 'UNLOCK_CHALLENGE',
        amount: 0,
        unlockId: 'challenge:mission-test',
      },
    ],
    replay: {
      profileSource: 'CURRENT',
      snapshotId: null,
      scenarioId: null,
      comparisonProfileIds: [],
    },
    windowTicks: null,
    incidentBudget: null,
    prerequisites: [],
    ...overrides,
  };
}

export function createMissionTestTracker(
  options: {
    readonly catalog?: MissionCatalog;
    readonly bus?: EventBus;
  } = {},
): MissionTracker {
  return createMissionTracker({
    catalog: options.catalog ?? createMissionTestCatalog(),
    ...(options.bus === undefined ? {} : { bus: options.bus }),
    context: { sessionId: MISSION_SESSION_ID, worldEpoch: MISSION_WORLD_EPOCH },
  });
}

export function createMissionTestBus(): EventBus {
  return createEventBus({
    sessionId: MISSION_SESSION_ID,
    worldEpoch: MISSION_WORLD_EPOCH,
  });
}

export function publishAll(bus: EventBus, events: readonly unknown[]): void {
  for (const event of events) {
    const result = bus.publish(event);
    if (result.status !== 'delivered' || result.failures.length > 0)
      throw new Error(
        `Event fixture publication failed: ${result.status}/${result.failures.length}`,
      );
  }
}

export interface RealRideDropoff {
  readonly event: Envelope;
  readonly rideId: string;
  readonly taxiId: string;
  readonly tick: number;
  readonly decision: DropoffDecision;
}

export interface RealRideDropoffs {
  readonly dropoffs: readonly RealRideDropoff[];
  readonly rideLifecycle: ReturnType<typeof createRideLifecycleWorld>;
  readonly dropoff: RideDropoff;
  dispose(): void;
}

/**
 * Real 057 fleet, real 059 schedule, real 060 assignments, real 061 lifecycle and real 063
 * dropoff decisions. Each completion is the source of one real-shaped 007 `DROPOFF` event.
 */
export function realRideDropoffs(count = 3): RealRideDropoffs {
  const rideLifecycle = createRideLifecycleWorld({
    requestCount: count,
    openTaxis: count,
    assignedCount: count,
  });
  const map = rideLifecycle.dispatcherWorld.map;
  const dropoffModule = createRideDropoff({ map, lifecycle: rideLifecycle.lifecycle });
  const dropoffs: RealRideDropoff[] = [];
  let sequence = 20;
  for (const [index, assignment] of rideLifecycle.assignments.entries()) {
    if (index >= count) break;
    const rideId = rideLifecycle.lifecycle.begin({
      requestId: assignment.requestId,
      eventId: `assigned:${assignment.requestId}`,
      tick: sequence,
    }).ride.rideId;
    rideLifecycle.lifecycle.apply({
      rideId,
      eventId: `pickup-arrived:${rideId}`,
      event: 'ARRIVED_PICKUP',
      tick: sequence + 2,
    });
    rideLifecycle.lifecycle.apply({
      rideId,
      eventId: `pickup-boarded:${rideId}`,
      event: 'PICKUP_COMPLETE',
      tick: sequence + 3,
    });
    const center = zoneCenter(map, assignment.dropoffZoneId);
    const required = dropoffModule.requiredDwellTicks;
    const baseTick = sequence + 10;
    let decision: DropoffDecision | null = null;
    for (let offset = 0; offset <= required; offset += 1)
      decision = dropoffModule.observe({
        rideId,
        taxiId: assignment.taxiId,
        tick: baseTick + offset,
        positionM: center,
        speedMps: 0,
      });
    sequence = baseTick + required + 10;
    if (decision === null || decision.status !== 'COMPLETED' || decision.completion === null)
      throw new Error('Real 063 dropoff did not complete in the mission fixture');
    const completion = decision.completion;
    dropoffs.push({
      event: dropoff(
        `dropoff:${completion.rideId}:${completion.tick}`,
        completion.tick,
        completion.taxiId,
        completion.rideId,
      ),
      rideId: completion.rideId,
      taxiId: completion.taxiId,
      tick: completion.tick,
      decision,
    });
  }
  return Object.freeze({
    dropoffs: Object.freeze(dropoffs),
    rideLifecycle,
    dropoff: dropoffModule,
    dispose(): void {
      dropoffModule.dispose();
      rideLifecycle.lifecycle.dispose();
    },
  });
}
