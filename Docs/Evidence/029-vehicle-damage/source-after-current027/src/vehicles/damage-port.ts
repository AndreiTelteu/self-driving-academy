import type { ContractContext } from '../sessions';
import type { BodyIdentity } from './body-port';
import type { CollisionIdentitySource } from './collision-port';

export const DAMAGE_CONFIG = Object.freeze({
  version: '029-onset-impulse-v1',
  vehicles: 110,
  historyRecords: 4096,
  serializedHistoryBytes: 4 * 1024 * 1024,
  idCodeUnits: 256,
  operationIdCodeUnits: 2048,
  damagedEquivalentDeltaVelocityMps: 2,
  immobilizedEquivalentDeltaVelocityMps: 8,
  damagedThrottleMagnitudeLimit: 0.5,
});
export type VehicleAvailability = 'AVAILABLE' | 'DAMAGED' | 'IMMOBILIZED';
export interface VehicleMobilityEffect {
  readonly throttleMagnitudeLimit: number;
  readonly minimumBrake: number;
}
/** Pure realization seam: does not own physics or alter mechanical parameters. */
export interface VehicleAvailabilityProvider {
  readAvailability(
    identity: BodyIdentity,
    context: ContractContext,
    tick: number,
  ): VehicleMobilityEffect;
}
export interface DamageIdentityPort {
  bodyIdentity(entityId: string): BodyIdentity | undefined;
  readonly collisionSource: CollisionIdentitySource;
}
export interface DamageProjection extends VehicleMobilityEffect {
  readonly identity: BodyIdentity;
  readonly availability: VehicleAvailability;
  readonly massKg: number;
  readonly lastIncidentId: string | null;
  readonly lastOperationTick: number;
}
export interface DamageHistoryRecord extends ContractContext {
  readonly kind: 'INCIDENT' | 'RECOVERY';
  readonly operationId: string;
  readonly tick: number;
  readonly vehicleIds: readonly string[];
  readonly bodyGenerations: readonly number[];
  readonly collisionSerials: readonly number[];
  readonly impulseNs: number | null;
  readonly otherEntityId: string | null;
}
