import {
  boolean,
  choice,
  contextFields,
  fields,
  nullable,
  number,
  readContext,
  requireContract,
  text,
  tick,
  record,
} from '../sessions';
import type { ContractContext } from '../sessions';
import type { DriveIntent } from './drivetrain';

export const controlModes = ['AUTO', 'MANUAL', 'LEARNING'] as const;
export type ControlMode = (typeof controlModes)[number];
export const maneuverStates = [
  'IDLE',
  'FOLLOWING',
  'STOPPING',
  'TURNING',
  'LANE_CHANGING',
  'RECOVERING',
] as const;

export interface VehicleCommand extends ContractContext {
  readonly vehicleId: string;
  readonly tick: number;
  readonly throttle: number;
  readonly brake: number;
  readonly steering: number;
  readonly handbrake: boolean;
  readonly turnSignal: 'OFF' | 'LEFT' | 'RIGHT' | 'HAZARD';
  readonly source: 'AUTONOMY' | 'PLAYER';
  readonly driveIntent?: DriveIntent;
}

export function parseVehicleCommand(value: unknown): VehicleCommand {
  const own = record(value);
  const directional = Object.hasOwn(own, 'driveIntent');
  const data = fields(own, [
    ...contextFields,
    'vehicleId',
    'tick',
    'throttle',
    'brake',
    'steering',
    'handbrake',
    'turnSignal',
    'source',
    ...(directional ? ['driveIntent'] : []),
  ]);
  let driveIntent: DriveIntent | undefined;
  if (directional) {
    const intent = fields(data.driveIntent, ['version', 'direction', 'shiftBrake']);
    requireContract(
      intent.version === '027-braking-reverse-v1',
      'Unsupported drivetrain intent version',
    );
    driveIntent = Object.freeze({
      version: '027-braking-reverse-v1',
      direction: choice(intent.direction, ['NONE', 'FORWARD', 'REVERSE']),
      shiftBrake: number(intent.shiftBrake, 0, 1),
    });
    requireContract(
      driveIntent.direction !== 'NONE' || data.throttle === 0,
      'Neutral direction cannot request propulsion',
    );
  }
  return Object.freeze({
    ...readContext(data),
    vehicleId: text(data.vehicleId),
    tick: tick(data.tick),
    throttle: number(data.throttle, 0, 1),
    brake: number(data.brake, 0, 1),
    steering: number(data.steering, -1, 1),
    handbrake: boolean(data.handbrake),
    turnSignal: choice(data.turnSignal, ['OFF', 'LEFT', 'RIGHT', 'HAZARD']),
    source: choice(data.source, ['AUTONOMY', 'PLAYER']),
    ...(driveIntent ? { driveIntent } : {}),
  });
}

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function parseVector3(value: unknown): Vector3 {
  const data = fields(value, ['x', 'y', 'z']);
  return Object.freeze({ x: number(data.x), y: number(data.y), z: number(data.z) });
}

export interface VehicleState extends ContractContext {
  readonly vehicleId: string;
  readonly classId: string;
  readonly tick: number;
  readonly transform: {
    readonly positionM: Vector3;
    readonly rotationQuaternion: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly w: number;
    };
  };
  readonly velocityMps: Vector3;
  readonly laneId: string | null;
  readonly controlMode: ControlMode;
  readonly appliedProfileVersion: string;
  readonly maneuverState: (typeof maneuverStates)[number];
}

export function parseVehicleState(value: unknown): VehicleState {
  const data = fields(value, [
    ...contextFields,
    'vehicleId',
    'classId',
    'tick',
    'transform',
    'velocityMps',
    'laneId',
    'controlMode',
    'appliedProfileVersion',
    'maneuverState',
  ]);
  const transform = fields(data.transform, ['positionM', 'rotationQuaternion']);
  const rotation = fields(transform.rotationQuaternion, ['x', 'y', 'z', 'w']);
  const quaternion = Object.freeze({
    x: number(rotation.x, -1, 1),
    y: number(rotation.y, -1, 1),
    z: number(rotation.z, -1, 1),
    w: number(rotation.w, -1, 1),
  });
  requireContract(
    Math.abs(Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w) - 1) <= 1e-6,
    'Quaternion must be normalized',
  );
  return Object.freeze({
    ...readContext(data),
    vehicleId: text(data.vehicleId),
    classId: text(data.classId),
    tick: tick(data.tick),
    transform: Object.freeze({
      positionM: parseVector3(transform.positionM),
      rotationQuaternion: quaternion,
    }),
    velocityMps: parseVector3(data.velocityMps),
    laneId: nullable(data.laneId, text),
    controlMode: choice(data.controlMode, controlModes),
    appliedProfileVersion: text(data.appliedProfileVersion),
    maneuverState: choice(data.maneuverState, maneuverStates),
  });
}
