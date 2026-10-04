import {
  choice,
  contextFields,
  fields,
  list,
  nullable,
  number,
  readContext,
  requireContract,
  text,
  tick,
} from '../sessions';
import type { ContractContext } from '../sessions';
import { controlModes } from '../vehicles';
import type { ControlMode } from '../vehicles';

interface EventPayloadMap {
  MANUAL_START: { readonly vehicleId: string; readonly controlMode: ControlMode };
  MANUAL_END: { readonly vehicleId: string; readonly controlMode: ControlMode };
  LEADER_ACQUIRED: { readonly vehicleId: string; readonly leaderId: string; readonly gapM: number };
  SIGNAL_CHANGED: { readonly signalId: string; readonly state: 'RED' | 'YELLOW' | 'GREEN' };
  STOP_APPROACH: {
    readonly vehicleId: string;
    readonly opportunityId: string;
    readonly stopLineId: string;
  };
  STOP_LINE_CROSSED: {
    readonly vehicleId: string;
    readonly opportunityId: string;
    readonly stopLineId: string;
  };
  FULL_STOP: {
    readonly vehicleId: string;
    readonly opportunityId: string;
    readonly durationS: number;
  };
  LANE_CHANGE_STARTED: {
    readonly vehicleId: string;
    readonly opportunityId: string;
    readonly fromLaneId: string;
    readonly toLaneId: string;
  };
  LANE_CHANGE_COMPLETED: {
    readonly vehicleId: string;
    readonly opportunityId: string;
    readonly fromLaneId: string;
    readonly toLaneId: string;
  };
  COLLISION: {
    readonly vehicleId: string;
    readonly otherEntityId: string;
    readonly impulseNs: number;
  };
  PICKUP: { readonly vehicleId: string; readonly rideId: string };
  DROPOFF: { readonly vehicleId: string; readonly rideId: string };
  PROFILE_ACTIVATE: {
    readonly profileId: string;
    readonly versionId: string;
    readonly learningEpoch: number;
    readonly activationTick: number;
  };
  VEHICLE_RECOVERED: { readonly vehicleId: string; readonly recoveryPointId: string };
  WORLD_RESET: { readonly previousWorldEpoch: number; readonly reason: 'SCENARIO_RESET' };
  DESTRUCTIBLE_BROKEN: {
    readonly objectId: string;
    readonly instigatorId: string | null;
    readonly impulseNs: number;
  };
}

export type SimulationEvent = {
  [K in keyof EventPayloadMap]: ContractContext & {
    readonly eventId: string;
    readonly tick: number;
    readonly entityIds: readonly string[];
    readonly type: K;
    readonly payload: Readonly<EventPayloadMap[K]>;
  };
}[keyof EventPayloadMap];

export function parseSimulationEvent(value: unknown): SimulationEvent {
  const data = fields(value, [...contextFields, 'eventId', 'tick', 'entityIds', 'type', 'payload']);
  const eventTick = tick(data.tick);
  const entityIds = list(data.entityIds, text);
  requireContract(new Set(entityIds).size === entityIds.length, 'Duplicate event entity IDs');
  const context = readContext(data);
  const base = { ...context, eventId: text(data.eventId), tick: eventTick, entityIds };
  const referencedEntity = (value: unknown): string => {
    const id = text(value);
    requireContract(entityIds.includes(id), 'Payload entity missing from entityIds');
    return id;
  };
  switch (data.type) {
    case 'MANUAL_START':
    case 'MANUAL_END': {
      const p = fields(data.payload, ['vehicleId', 'controlMode']);
      const mode = choice(p.controlMode, controlModes);
      requireContract(mode !== 'AUTO', 'Manual intervention event requires MANUAL or LEARNING');
      return Object.freeze({
        ...base,
        type: data.type,
        payload: Object.freeze({ vehicleId: referencedEntity(p.vehicleId), controlMode: mode }),
      });
    }
    case 'LEADER_ACQUIRED': {
      const p = fields(data.payload, ['vehicleId', 'leaderId', 'gapM']);
      const vehicleId = referencedEntity(p.vehicleId);
      const leaderId = referencedEntity(p.leaderId);
      requireContract(vehicleId !== leaderId, 'Vehicle cannot be its own leader');
      return Object.freeze({
        ...base,
        type: data.type,
        payload: Object.freeze({
          vehicleId,
          leaderId,
          gapM: number(p.gapM, 0),
        }),
      });
    }
    case 'SIGNAL_CHANGED': {
      const p = fields(data.payload, ['signalId', 'state']);
      return Object.freeze({
        ...base,
        type: data.type,
        payload: Object.freeze({
          signalId: referencedEntity(p.signalId),
          state: choice(p.state, ['RED', 'YELLOW', 'GREEN']),
        }),
      });
    }
    case 'STOP_APPROACH':
    case 'STOP_LINE_CROSSED': {
      const p = fields(data.payload, ['vehicleId', 'opportunityId', 'stopLineId']);
      return Object.freeze({
        ...base,
        type: data.type,
        payload: Object.freeze({
          vehicleId: referencedEntity(p.vehicleId),
          opportunityId: text(p.opportunityId),
          stopLineId: text(p.stopLineId),
        }),
      });
    }
    case 'FULL_STOP': {
      const p = fields(data.payload, ['vehicleId', 'opportunityId', 'durationS']);
      return Object.freeze({
        ...base,
        type: data.type,
        payload: Object.freeze({
          vehicleId: referencedEntity(p.vehicleId),
          opportunityId: text(p.opportunityId),
          durationS: number(p.durationS, 0),
        }),
      });
    }
    case 'LANE_CHANGE_STARTED':
    case 'LANE_CHANGE_COMPLETED': {
      const p = fields(data.payload, ['vehicleId', 'opportunityId', 'fromLaneId', 'toLaneId']);
      const fromLaneId = text(p.fromLaneId);
      const toLaneId = text(p.toLaneId);
      requireContract(fromLaneId !== toLaneId, 'Lane change requires distinct lanes');
      return Object.freeze({
        ...base,
        type: data.type,
        payload: Object.freeze({
          vehicleId: referencedEntity(p.vehicleId),
          opportunityId: text(p.opportunityId),
          fromLaneId,
          toLaneId,
        }),
      });
    }
    case 'COLLISION': {
      const p = fields(data.payload, ['vehicleId', 'otherEntityId', 'impulseNs']);
      const vehicleId = referencedEntity(p.vehicleId);
      const otherEntityId = referencedEntity(p.otherEntityId);
      requireContract(vehicleId !== otherEntityId, 'Collision requires two entities');
      return Object.freeze({
        ...base,
        type: data.type,
        payload: Object.freeze({ vehicleId, otherEntityId, impulseNs: number(p.impulseNs, 0) }),
      });
    }
    case 'PICKUP':
    case 'DROPOFF': {
      const p = fields(data.payload, ['vehicleId', 'rideId']);
      return Object.freeze({
        ...base,
        type: data.type,
        payload: Object.freeze({
          vehicleId: referencedEntity(p.vehicleId),
          rideId: text(p.rideId),
        }),
      });
    }
    case 'PROFILE_ACTIVATE': {
      const p = fields(data.payload, ['profileId', 'versionId', 'learningEpoch', 'activationTick']);
      const activationTick = tick(p.activationTick);
      requireContract(activationTick >= eventTick, 'Profile activation cannot target past tick');
      return Object.freeze({
        ...base,
        type: data.type,
        payload: Object.freeze({
          profileId: text(p.profileId),
          versionId: text(p.versionId),
          learningEpoch: tick(p.learningEpoch),
          activationTick,
        }),
      });
    }
    case 'VEHICLE_RECOVERED': {
      const p = fields(data.payload, ['vehicleId', 'recoveryPointId']);
      return Object.freeze({
        ...base,
        type: data.type,
        payload: Object.freeze({
          vehicleId: referencedEntity(p.vehicleId),
          recoveryPointId: text(p.recoveryPointId),
        }),
      });
    }
    case 'WORLD_RESET': {
      const p = fields(data.payload, ['previousWorldEpoch', 'reason']);
      const previousWorldEpoch = tick(p.previousWorldEpoch);
      requireContract(
        context.worldEpoch === previousWorldEpoch + 1,
        'Reset must increment world epoch',
      );
      return Object.freeze({
        ...base,
        type: data.type,
        payload: Object.freeze({
          previousWorldEpoch,
          reason: choice(p.reason, ['SCENARIO_RESET']),
        }),
      });
    }
    case 'DESTRUCTIBLE_BROKEN': {
      const p = fields(data.payload, ['objectId', 'instigatorId', 'impulseNs']);
      return Object.freeze({
        ...base,
        type: data.type,
        payload: Object.freeze({
          objectId: referencedEntity(p.objectId),
          instigatorId: nullable(p.instigatorId, referencedEntity),
          impulseNs: number(p.impulseNs, 0),
        }),
      });
    }
    default:
      requireContract(false, 'Unsupported event type');
  }
}
