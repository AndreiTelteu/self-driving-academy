export interface CameraPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface CameraObstacle {
  readonly min: CameraPoint;
  readonly max: CameraPoint;
}
const axes = ['x', 'y', 'z'] as const;
const blend = (a: CameraPoint, b: CameraPoint, t: number): CameraPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
function contains(point: CameraPoint, box: CameraObstacle, radius: number) {
  return axes.every(
    (axis) => point[axis] > box.min[axis] - radius && point[axis] < box.max[axis] + radius,
  );
}
function contact(
  from: CameraPoint,
  to: CameraPoint,
  box: CameraObstacle,
  radius: number,
): number | null {
  let entry = 0,
    exit = 1;
  for (const axis of axes) {
    const delta = to[axis] - from[axis],
      min = box.min[axis] - radius,
      max = box.max[axis] + radius;
    if (Math.abs(delta) < 1e-12) {
      if (from[axis] < min || from[axis] > max) return null;
      continue;
    }
    const a = (min - from[axis]) / delta,
      b = (max - from[axis]) / delta;
    entry = Math.max(entry, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (entry > exit) return null;
  }
  return entry;
}

/** Conservative sphere sweep against expanded world AABBs; null means no safe placement. */
export function resolveCameraObstacles(
  from: CameraPoint,
  to: CameraPoint,
  radius: number,
  boxes: readonly CameraObstacle[],
): CameraPoint | null {
  if (
    !Number.isFinite(radius) ||
    radius <= 0 ||
    ![from.x, from.y, from.z, to.x, to.y, to.z].every(Number.isFinite)
  )
    throw new Error('Invalid camera sweep');
  for (const box of boxes)
    if (
      !axes.every(
        (a) =>
          Number.isFinite(box.min[a]) && Number.isFinite(box.max[a]) && box.min[a] <= box.max[a],
      )
    )
      throw new Error('Invalid camera obstacle');
  let result = to;
  let fraction = 1;
  for (const box of boxes) {
    if (contains(from, box, radius)) continue; // Recovery below handles starting penetration explicitly.
    const hit = contact(from, to, box, radius);
    if (hit !== null) fraction = Math.min(fraction, Math.max(0, hit - 1e-4));
  }
  result = blend(from, to, fraction);
  // Deterministic, bounded depenetration for moving walls/impact and first-person seat penetration.
  for (let pass = 0; pass < boxes.length * 2 + 1; pass++) {
    const box = boxes.find((b) => contains(result, b, radius));
    if (!box) return result;
    let best = Infinity,
      next = result;
    for (const axis of axes)
      for (const side of [box.min[axis] - radius - 0.001, box.max[axis] + radius + 0.001]) {
        const distance = Math.abs(side - result[axis]);
        if (distance < best) {
          best = distance;
          next = { ...result, [axis]: side };
        }
      }
    result = next;
  }
  return null;
}
