import type { VehicleAvailabilityProvider } from './damage-port';
import type { ContractContext } from '../sessions';
import type { BodyIdentity } from './body-port';
import type { ControlMode, VehicleCommand } from './contracts';
import type { PhysicsCosts, PhysicsInput } from './physics';

export const CONTROLLER_LIMITS = Object.freeze({
  version: '024-unified-command-v1',
  vehicles: 110,
  packets: 220,
  authorityChanges: 110,
  idCodeUnits: 256,
  targetTicks: 6,
  hz: 60,
});
export interface VehicleActuationInput extends PhysicsInput {
  readonly handbrake: boolean;
}
/** World stays caller-owned. This port cannot teleport or change vehicle mechanics. */
export interface VehicleActuationPort {
  bodyIdentity(entityId: string): BodyIdentity | undefined;
  step(inputs: ReadonlyMap<string, VehicleActuationInput>, measure?: boolean): PhysicsCosts;
}
export interface VehicleCommandPacket {
  readonly identity: BodyIdentity;
  readonly command: VehicleCommand;
}
export interface VehicleAuthorityChange {
  readonly identity: BodyIdentity;
  readonly mode: ControlMode;
}
export interface VehicleControllerTick {
  readonly tick: number;
  readonly dtSeconds: number;
}
export interface VehicleControlProjection {
  readonly identity: BodyIdentity;
  readonly mode: ControlMode;
  readonly tick: number;
  readonly targetTick: number | null;
  readonly raw: VehicleCommand | null;
  readonly command: VehicleCommand;
  readonly turnSignal: VehicleCommand['turnSignal'];
  readonly signalStartedTick: number | null;
  readonly leftIndicatorOn: boolean;
  readonly rightIndicatorOn: boolean;
}
export interface VehicleControllerFrame {
  readonly tick: number;
  readonly controls: readonly VehicleControlProjection[];
  readonly ignoredCommands: readonly {
    readonly vehicleId: string;
    readonly source: VehicleCommand['source'];
    readonly reason: 'NO_AUTHORITY';
  }[];
  readonly physics: PhysicsCosts;
}
export interface VehicleController {
  register(identity: BodyIdentity): void;
  remove(identity: BodyIdentity): boolean;
  step(
    frame: VehicleControllerTick,
    packets?: unknown,
    authorityChanges?: unknown,
    measure?: boolean,
  ): VehicleControllerFrame;
  readControl(identity: BodyIdentity): VehicleControlProjection | undefined;
  suspend(): void;
  resume(): void;
  getStats(): {
    readonly context: ContractContext;
    readonly tick: number;
    readonly vehicles: number;
    readonly targets: number;
    readonly projections: number;
    readonly players: number;
    readonly retainedBatches: 0;
    readonly lastIgnoredCount: number;
    readonly suspended: boolean;
    readonly disposed: boolean;
    readonly fault: { readonly attemptedTick: number; readonly stage: 'ACTUATION' } | null;
  };
  dispose(): void;
}

export interface VehicleControllerOptions {
  readonly availability?: VehicleAvailabilityProvider;
}
