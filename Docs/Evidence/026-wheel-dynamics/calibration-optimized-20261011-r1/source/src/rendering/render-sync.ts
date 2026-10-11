import {
  validateEntityId,
  validateVisualIdentity,
  validateVisualTransform,
  type VisualTransform,
  type VisualWorldIdentity,
} from './scene-contract';

export interface RenderWheelPose {
  readonly wheelId: string;
  /** Local neutral pose, metres; +X spin axis, +Y steering axis. */
  readonly transform: VisualTransform;
  /** Continuous, unwrapped angle in radians; do not reduce modulo 2π at capture. */
  readonly spinRad: number;
  readonly steeringRad: number;
}
export interface RenderVehiclePose {
  readonly vehicleId: string;
  /** Changes whenever an entity ID is reused, even inside one world epoch. */
  readonly incarnation: string;
  readonly transform: VisualTransform;
  readonly wheels: readonly RenderWheelPose[];
}
export interface RenderSnapshot extends VisualWorldIdentity {
  readonly tick: number;
  readonly vehicles: readonly RenderVehiclePose[];
}

export function validateRenderSnapshot(snapshot: RenderSnapshot): void {
  validateVisualIdentity(snapshot);
  if (
    !Number.isSafeInteger(snapshot.tick) ||
    snapshot.tick < 0 ||
    !Array.isArray(snapshot.vehicles)
  )
    throw new Error('Invalid render snapshot');
  const ids = new Set<string>();
  for (const vehicle of snapshot.vehicles) {
    validateEntityId(vehicle.vehicleId);
    validateEntityId(vehicle.incarnation);
    validateVisualTransform(vehicle.transform);
    if (ids.has(vehicle.vehicleId) || !Array.isArray(vehicle.wheels))
      throw new Error('Duplicate entity or missing wheels');
    ids.add(vehicle.vehicleId);
    const wheelIds = new Set<string>();
    for (const wheel of vehicle.wheels) {
      validateEntityId(wheel.wheelId);
      validateVisualTransform(wheel.transform);
      if (
        wheelIds.has(wheel.wheelId) ||
        !Number.isFinite(wheel.spinRad) ||
        !Number.isFinite(wheel.steeringRad)
      )
        throw new Error('Invalid wheel pose');
      wheelIds.add(wheel.wheelId);
    }
  }
}

const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

/** Shortest-arc unit-quaternion slerp, including equivalent q/-q and near-parallel poses. */
function interpolateTransform(a: VisualTransform, b: VisualTransform, t: number): VisualTransform {
  const qa = a.rotationQuaternion,
    qb = b.rotationQuaternion;
  const dot = qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w;
  const sign = dot < 0 ? -1 : 1;
  const cosine = Math.min(1, Math.abs(dot));
  const angle = Math.acos(cosine);
  const sine = Math.sin(angle);
  const wa = cosine > 0.9995 ? 1 - t : Math.sin((1 - t) * angle) / sine;
  const wb = (cosine > 0.9995 ? t : Math.sin(t * angle) / sine) * sign;
  const q = {
    x: qa.x * wa + qb.x * wb,
    y: qa.y * wa + qb.y * wb,
    z: qa.z * wa + qb.z * wb,
    w: qa.w * wa + qb.w * wb,
  };
  const norm = Math.hypot(q.x, q.y, q.z, q.w);
  return Object.freeze({
    positionM: Object.freeze({
      x: lerp(a.positionM.x, b.positionM.x, t),
      y: lerp(a.positionM.y, b.positionM.y, t),
      z: lerp(a.positionM.z, b.positionM.z, t),
    }),
    rotationQuaternion: Object.freeze({
      x: q.x / norm,
      y: q.y / norm,
      z: q.z / norm,
      w: q.w / norm,
    }),
  });
}

/** Pure presentation projection; owns no physics, clock, history or mutable input references. */
export function interpolateRenderSnapshots(
  previous: RenderSnapshot | null,
  current: RenderSnapshot | null,
  alpha: number,
): RenderSnapshot | null {
  if (!current) return null;
  validateRenderSnapshot(current);
  if (previous) validateRenderSnapshot(previous);
  const t = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
  const continuous =
    previous &&
    previous.sessionId === current.sessionId &&
    previous.worldEpoch === current.worldEpoch &&
    previous.tick + 1 === current.tick;
  const prior = new Map((continuous ? previous.vehicles : []).map((v) => [v.vehicleId, v]));
  const vehicles = current.vehicles.map((vehicle) => {
    const candidate = prior.get(vehicle.vehicleId);
    const a = candidate?.incarnation === vehicle.incarnation ? candidate : vehicle;
    const wheels = new Map(a.wheels.map((w) => [w.wheelId, w]));
    return Object.freeze({
      vehicleId: vehicle.vehicleId,
      incarnation: vehicle.incarnation,
      transform: interpolateTransform(a.transform, vehicle.transform, t),
      wheels: Object.freeze(
        vehicle.wheels.map((wheel) => {
          const before = wheels.get(wheel.wheelId) ?? wheel;
          return Object.freeze({
            wheelId: wheel.wheelId,
            transform: interpolateTransform(before.transform, wheel.transform, t),
            spinRad: lerp(before.spinRad, wheel.spinRad, t),
            steeringRad: lerp(before.steeringRad, wheel.steeringRad, t),
          });
        }),
      ),
    });
  });
  return Object.freeze({
    sessionId: current.sessionId,
    worldEpoch: current.worldEpoch,
    tick: current.tick,
    vehicles: Object.freeze(vehicles),
  });
}
