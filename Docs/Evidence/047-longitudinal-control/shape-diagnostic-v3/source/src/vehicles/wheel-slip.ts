import type { CarProjection, PhysicsVector } from './physics';
/** Kinematic diagnostic at the physical wheel centre, not an added tyre force/model. */
export function wheelLateralSpeedsMps(state: CarProjection): readonly number[] {
  const q = state.rotation;
  const rotate = (v: PhysicsVector): PhysicsVector => {
    const tx = 2 * (q.y * v.z - q.z * v.y),
      ty = 2 * (q.z * v.x - q.x * v.z),
      tz = 2 * (q.x * v.y - q.y * v.x);
    return {
      x: v.x + q.w * tx + q.y * tz - q.z * ty,
      y: v.y + q.w * ty + q.z * tx - q.x * tz,
      z: v.z + q.w * tz + q.x * ty - q.y * tx,
    };
  };
  const omega = state.angularVelocityRadps;
  return Object.freeze(
    state.wheels.map((wheel) => {
      if (!wheel.inContact) return 0;
      const r = rotate(wheel.localPositionM);
      const side = rotate({
        x: Math.cos(wheel.steeringRad),
        y: 0,
        z: -Math.sin(wheel.steeringRad),
      });
      const velocity = {
        x: state.velocity.x + omega.y * r.z - omega.z * r.y,
        y: state.velocity.y + omega.z * r.x - omega.x * r.z,
        z: state.velocity.z + omega.x * r.y - omega.y * r.x,
      };
      return Math.abs(velocity.x * side.x + velocity.y * side.y + velocity.z * side.z);
    }),
  );
}
