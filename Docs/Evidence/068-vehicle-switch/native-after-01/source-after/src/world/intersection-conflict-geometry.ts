import type { Vector3 } from '../vehicles';
export interface EnvelopeContact {
  readonly segmentA: number;
  readonly segmentB: number;
  readonly positionA: Vector3;
  readonly positionB: Vector3;
  readonly distanceM: number;
}
const EPS = 1e-9;
const cross = (x: number, z: number, u: number, v: number) => x * v - z * u;
function projection(p: Vector3, a: Vector3, b: Vector3): Vector3 {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    length = dx * dx + dz * dz;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length));
  return Object.freeze({ x: a.x + t * dx, y: a.y + t * (b.y - a.y), z: a.z + t * dz });
}
function closest(a: Vector3, b: Vector3, c: Vector3, d: Vector3) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    ux = d.x - c.x,
    uz = d.z - c.z;
  const divisor = cross(dx, dz, ux, uz);
  if (divisor !== 0) {
    const t = cross(c.x - a.x, c.z - a.z, ux, uz) / divisor;
    const u = cross(c.x - a.x, c.z - a.z, dx, dz) / divisor;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1)
      return {
        positionA: Object.freeze({ x: a.x + t * dx, y: a.y + t * (b.y - a.y), z: a.z + t * dz }),
        positionB: Object.freeze({ x: c.x + u * ux, y: c.y + u * (d.y - c.y), z: c.z + u * uz }),
        distanceM: 0,
      };
  }
  const pairs = [
    [a, projection(a, c, d)],
    [b, projection(b, c, d)],
    [projection(c, a, b), c],
    [projection(d, a, b), d],
  ];
  let result = { positionA: pairs[0][0], positionB: pairs[0][1], distanceM: Infinity };
  for (const [positionA, positionB] of pairs) {
    const distanceM = Math.hypot(positionA.x - positionB.x, positionA.z - positionB.z);
    if (distanceM < result.distanceM) result = { positionA, positionB, distanceM };
  }
  return result;
}
/** Conservative X/Z swept corridor; separated height ranges never conflict. */
export function intersectionEnvelopeContact(
  a: readonly Vector3[],
  b: readonly Vector3[],
  radiusM: number,
  heightToleranceM: number,
  admit: () => void,
): EnvelopeContact | null {
  for (let i = 1; i < a.length; i++)
    for (let j = 1; j < b.length; j++) {
      admit();
      const p = a[i - 1],
        q = a[i],
        r = b[j - 1],
        s = b[j];
      if (
        Math.min(p.y, q.y) > Math.max(r.y, s.y) + heightToleranceM ||
        Math.min(r.y, s.y) > Math.max(p.y, q.y) + heightToleranceM
      )
        continue;
      const found = closest(p, q, r, s);
      if (found.distanceM <= radiusM + EPS)
        return Object.freeze({ segmentA: i - 1, segmentB: j - 1, ...found });
    }
  return null;
}
