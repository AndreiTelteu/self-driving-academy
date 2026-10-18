import {
  boolean,
  choice,
  contextFields,
  fields,
  list,
  nullable,
  number,
  readContext,
  requireContract,
  sameWorld,
  text,
  tick,
} from '../sessions';
import type { ContractContext } from '../sessions';
import { parseSimulationEvent } from '../simulation';
import type { SimulationEvent } from '../simulation';
import { controlModes, parseVehicleCommand, parseVehicleState } from '../vehicles';
import type { ControlMode, VehicleCommand, VehicleState } from '../vehicles';

export interface TelemetrySample {
  readonly tick: number;
  readonly state: VehicleState;
  readonly command: VehicleCommand;
  readonly rawInput: {
    readonly throttle: number;
    readonly brake: number;
    readonly steering: number;
    readonly handbrake: boolean;
  };
  readonly longitudinalAccelerationMps2: number;
  readonly lateralAccelerationMps2: number;
  readonly capabilities: {
    readonly maxAccelerationMps2: number;
    readonly maxDecelerationMps2: number;
    readonly maxLateralAccelerationMps2: number;
  };
  readonly context: {
    readonly roadType: 'RESIDENTIAL' | 'URBAN' | 'ARTERIAL';
    readonly speedLimitMps: number;
    readonly curvaturePerM: number;
    readonly leaderId: string | null;
    readonly leaderGapM: number | null;
    readonly signalId: string | null;
    readonly signalState: 'RED' | 'YELLOW' | 'GREEN' | null;
    readonly stopLineId: string | null;
    readonly distanceToStopLineM: number | null;
    readonly conflictEntityIds: readonly string[];
    readonly rideId: string | null;
  };
  readonly excludedReason:
    'COLLISION_IMPULSE' | 'RECOVERY' | 'TELEPORT' | 'PAUSE' | 'FOCUS_LOST' | null;
}

export function parseTelemetrySample(value: unknown): TelemetrySample {
  const data = fields(value, [
    'tick',
    'state',
    'command',
    'rawInput',
    'longitudinalAccelerationMps2',
    'lateralAccelerationMps2',
    'capabilities',
    'context',
    'excludedReason',
  ]);
  const sampleTick = tick(data.tick);
  const state = parseVehicleState(data.state);
  const command = parseVehicleCommand(data.command);
  requireContract(
    sampleTick === state.tick &&
      sampleTick === command.tick &&
      state.vehicleId === command.vehicleId &&
      sameWorld(state, command),
    'Sample state/command identity mismatch',
  );
  requireContract(
    command.source === (state.controlMode === 'AUTO' ? 'AUTONOMY' : 'PLAYER'),
    'Command source does not match mode',
  );
  const input = fields(data.rawInput, ['throttle', 'brake', 'steering', 'handbrake']);
  const capabilities = fields(data.capabilities, [
    'maxAccelerationMps2',
    'maxDecelerationMps2',
    'maxLateralAccelerationMps2',
  ]);
  const context = fields(data.context, [
    'roadType',
    'speedLimitMps',
    'curvaturePerM',
    'leaderId',
    'leaderGapM',
    'signalId',
    'signalState',
    'stopLineId',
    'distanceToStopLineM',
    'conflictEntityIds',
    'rideId',
  ]);
  const leaderId = nullable(context.leaderId, text);
  const leaderGapM = nullable(context.leaderGapM, (value) => number(value, 0));
  const signalId = nullable(context.signalId, text);
  const signalState = nullable(context.signalState, (value) =>
    choice(value, ['RED', 'YELLOW', 'GREEN']),
  );
  const stopLineId = nullable(context.stopLineId, text);
  const distanceToStopLineM = nullable(context.distanceToStopLineM, number);
  requireContract(
    (leaderId === null) === (leaderGapM === null) && leaderId !== state.vehicleId,
    'Leader context mismatch',
  );
  requireContract((signalId === null) === (signalState === null), 'Signal context mismatch');
  requireContract(
    (stopLineId === null) === (distanceToStopLineM === null),
    'Stop-line context mismatch',
  );
  return Object.freeze({
    tick: sampleTick,
    state,
    command,
    rawInput: Object.freeze({
      throttle: number(input.throttle, 0, 1),
      brake: number(input.brake, 0, 1),
      steering: number(input.steering, -1, 1),
      handbrake: boolean(input.handbrake),
    }),
    longitudinalAccelerationMps2: number(data.longitudinalAccelerationMps2),
    lateralAccelerationMps2: number(data.lateralAccelerationMps2),
    capabilities: Object.freeze({
      maxAccelerationMps2: number(capabilities.maxAccelerationMps2, Number.MIN_VALUE),
      maxDecelerationMps2: number(capabilities.maxDecelerationMps2, Number.MIN_VALUE),
      maxLateralAccelerationMps2: number(capabilities.maxLateralAccelerationMps2, Number.MIN_VALUE),
    }),
    context: Object.freeze({
      roadType: choice(context.roadType, ['RESIDENTIAL', 'URBAN', 'ARTERIAL']),
      speedLimitMps: number(context.speedLimitMps, 0),
      curvaturePerM: number(context.curvaturePerM),
      leaderId,
      leaderGapM,
      signalId,
      signalState,
      stopLineId,
      distanceToStopLineM,
      conflictEntityIds: list(context.conflictEntityIds, text),
      rideId: nullable(context.rideId, text),
    }),
    excludedReason: nullable(data.excludedReason, (value) =>
      choice(value, ['COLLISION_IMPULSE', 'RECOVERY', 'TELEPORT', 'PAUSE', 'FOCUS_LOST']),
    ),
  });
}

export const segmentCloseReasons = [
  'RETURN_TO_AUTO',
  'MODE_CHANGE',
  'RIDE_COMPLETED',
  'VEHICLE_SWITCH',
  'PROFILE_CHANGE',
  'CONTROL_PREFERENCES_CHANGE',
  'SESSION_CHANGE',
  'WORLD_RESET',
  'RECOVERY',
  'ROLLOVER',
  'SHUTDOWN',
  'DATA_LOSS',
] as const;
export interface InterventionSegment extends ContractContext {
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly controlMode: ControlMode;
  readonly learningEligible: boolean;
  readonly playerId: string;
  readonly profileId: string;
  readonly baseVersionId: string;
  readonly learningEpoch: number;
  readonly controlPreferencesVersion: string;
  readonly startTick: number;
  readonly endTick: number | null;
  readonly closeReason: (typeof segmentCloseReasons)[number] | null;
  readonly engineVersion: string;
  readonly mapVersion: string;
  readonly inputType: 'KEYBOARD' | 'GAMEPAD' | 'AUTONOMY';
  readonly samples: readonly TelemetrySample[];
  readonly events: readonly SimulationEvent[];
  readonly completeness: 'OPEN' | 'CLOSED' | 'INCOMPLETE';
}

export function parseInterventionSegment(value: unknown): InterventionSegment {
  const data = fields(value, [
    ...contextFields,
    'segmentId',
    'vehicleId',
    'controlMode',
    'learningEligible',
    'playerId',
    'profileId',
    'baseVersionId',
    'learningEpoch',
    'controlPreferencesVersion',
    'startTick',
    'endTick',
    'closeReason',
    'engineVersion',
    'mapVersion',
    'inputType',
    'samples',
    'events',
    'completeness',
  ]);
  const context = readContext(data);
  const controlMode = choice(data.controlMode, controlModes);
  const learningEligible = boolean(data.learningEligible);
  requireContract(
    !learningEligible || controlMode === 'LEARNING',
    'Only LEARNING can produce demonstrations',
  );
  const inputType = choice(data.inputType, ['KEYBOARD', 'GAMEPAD', 'AUTONOMY']);
  requireContract(
    (controlMode === 'AUTO') === (inputType === 'AUTONOMY'),
    'Input type does not match mode',
  );
  const startTick = tick(data.startTick);
  const endTick = nullable(data.endTick, tick);
  const closeReason = nullable(data.closeReason, (value) => choice(value, segmentCloseReasons));
  const completeness = choice(data.completeness, ['OPEN', 'CLOSED', 'INCOMPLETE']);
  requireContract(
    (completeness === 'OPEN') === (endTick === null) &&
      (completeness === 'OPEN') === (closeReason === null),
    'Segment closure metadata mismatch',
  );
  requireContract(endTick === null || endTick >= startTick, 'Segment ends before start');
  const vehicleId = text(data.vehicleId);
  const baseVersionId = text(data.baseVersionId);
  const samples = list(data.samples, parseTelemetrySample);
  let previousTick = -1;
  for (const sample of samples) {
    requireContract(
      sample.tick > previousTick &&
        sample.tick >= startTick &&
        (endTick === null || sample.tick <= endTick),
      'Sample ticks must increase within segment',
    );
    requireContract(
      sameWorld(context, sample.state) &&
        sample.state.vehicleId === vehicleId &&
        sample.state.controlMode === controlMode &&
        sample.state.appliedProfileVersion === baseVersionId,
      'Sample does not belong to segment',
    );
    previousTick = sample.tick;
  }
  const events = list(data.events, parseSimulationEvent);
  previousTick = -1;
  const eventIds = new Set<string>();
  for (const event of events) {
    requireContract(
      event.tick >= previousTick &&
        event.tick >= startTick &&
        (endTick === null || event.tick <= endTick),
      'Event ticks must be ordered within segment',
    );
    requireContract(
      sameWorld(context, event) && !eventIds.has(event.eventId),
      'Event world mismatch or duplicate event',
    );
    if ('vehicleId' in event.payload)
      requireContract(
        event.payload.vehicleId === vehicleId,
        'Event vehicle does not belong to segment',
      );
    eventIds.add(event.eventId);
    previousTick = event.tick;
  }
  return Object.freeze({
    ...context,
    segmentId: text(data.segmentId),
    vehicleId,
    controlMode,
    learningEligible,
    playerId: text(data.playerId),
    profileId: text(data.profileId),
    baseVersionId,
    learningEpoch: tick(data.learningEpoch),
    controlPreferencesVersion: text(data.controlPreferencesVersion),
    startTick,
    endTick,
    closeReason,
    engineVersion: text(data.engineVersion),
    mapVersion: text(data.mapVersion),
    inputType,
    samples,
    events,
    completeness,
  });
}
