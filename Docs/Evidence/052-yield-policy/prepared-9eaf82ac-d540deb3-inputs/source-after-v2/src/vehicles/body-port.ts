import type { VehicleState } from './contracts';

export type BodyTransform = VehicleState['transform'];
export type BodyVector = VehicleState['velocityMps'];
export interface BodyIdentity {
  readonly entityId: string;
  readonly handle: number;
  readonly generation: number;
}
export interface BodyState {
  readonly identity: BodyIdentity;
  readonly transform: BodyTransform;
  readonly velocityMps: BodyVector;
}
export interface BodyPublicationCosts {
  readonly readbackMs: number;
  readonly dispatchMs: number;
  readonly bodies: number;
}
export interface PhysicsBodyPort {
  bodyIdentity(entityId: string): BodyIdentity | undefined;
  entityForBodyHandle(handle: number): BodyIdentity | undefined;
  readBody(identity: BodyIdentity): BodyState;
  setPose(identity: BodyIdentity, transform: BodyTransform): void;
  setBodyVelocity(identity: BodyIdentity, velocityMps: BodyVector): void;
  removeBody(identity: BodyIdentity): boolean;
  subscribeBody(
    identity: BodyIdentity,
    listener: (state: BodyState, tick: number) => void,
  ): () => void;
  publishBodies(tick: number, measure?: boolean): BodyPublicationCosts;
  bodyResources(): { entities: number; subscriptions: number };
}

/** Both ports use metres, Y-up, +Z forward, +X right and xyzw. Never mirror/normalize. */
export function copyBodyVector(value: BodyVector): BodyVector {
  if (![value.x, value.y, value.z].every(Number.isFinite))
    throw new RangeError('Invalid body vector');
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}
export function copyBodyTransform(value: BodyTransform): BodyTransform {
  const positionM = copyBodyVector(value.positionM);
  const q = value.rotationQuaternion;
  if (
    ![q.x, q.y, q.z, q.w].every(Number.isFinite) ||
    Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) > 1e-6
  )
    throw new RangeError('Invalid body quaternion');
  return Object.freeze({
    positionM,
    rotationQuaternion: Object.freeze({ x: q.x, y: q.y, z: q.z, w: q.w }),
  });
}

export interface PhysicsScenePort {
  presentVehicle(
    state: Pick<VehicleState, 'vehicleId' | 'sessionId' | 'worldEpoch' | 'tick' | 'transform'>,
  ): boolean;
}
/** Scene ownership stays with composition root; removing physics never disposes scene resources. */
export function connectPhysicsBodyToScene(
  bodies: PhysicsBodyPort,
  identity: BodyIdentity,
  scene: PhysicsScenePort,
  context: { readonly sessionId: string; readonly worldEpoch: number },
): () => void {
  if (
    typeof context.sessionId !== 'string' ||
    !context.sessionId.trim() ||
    !Number.isSafeInteger(context.worldEpoch) ||
    context.worldEpoch < 0
  )
    throw new RangeError('Invalid physics scene identity');
  const { sessionId, worldEpoch } = context;
  return bodies.subscribeBody(identity, (state, tick) => {
    scene.presentVehicle({
      vehicleId: identity.entityId,
      sessionId,
      worldEpoch,
      tick,
      transform: state.transform,
    });
  });
}
