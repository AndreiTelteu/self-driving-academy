import type { VehicleState } from '../vehicles';

/** Existing domain projection; no fixed-tick dependency or domain service execution. */
export type VisualVehicleState = Pick<
  VehicleState,
  'vehicleId' | 'sessionId' | 'worldEpoch' | 'tick' | 'transform'
>;
export type VisualTransform = VehicleState['transform'];
export interface VisualWorldIdentity {
  readonly sessionId: string;
  readonly worldEpoch: number;
}

export function validateVisualIdentity(identity: VisualWorldIdentity): void {
  if (
    !identity ||
    typeof identity.sessionId !== 'string' ||
    !identity.sessionId.trim() ||
    !Number.isSafeInteger(identity.worldEpoch) ||
    identity.worldEpoch < 0
  )
    throw new Error('Invalid visual world identity');
}

export function validateEntityId(id: string): void {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Invalid entityId');
}

/** Presentation boundary validation; never mutates or normalizes authoritative input. */
export function validateVisualTransform(transform: VisualTransform): void {
  if (!transform?.positionM || !transform.rotationQuaternion) throw new Error('Invalid transform');
  const p = transform.positionM,
    q = transform.rotationQuaternion;
  if (
    ![p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(
      (v) => typeof v === 'number' && Number.isFinite(v),
    ) ||
    Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) > 1e-6
  )
    throw new Error('Transform requires finite metres and normalized quaternion');
}
