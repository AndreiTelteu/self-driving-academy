/**
 * PBI 238 — coliziunea mașinii conduse cu solidele statice ale orașului.
 *
 * Compunerea 236 integra mașina fără nicio coliziune, așa că trecea prin copaci, stâlpi, bănci și
 * clădiri. Modulul este pur și determinist (fără DOM, Babylon, ceas sau `Math.random`) și refolosește
 * contractele existente: clădirile sunt exact blocatoarele lumii de mers 192 (poligoane convexe), iar
 * decorul este planul 146 cu raza lui de footprint. Corpul mașinii este dreptunghiul rotit
 * (`halfExtentsM`, yaw), nu doar centrul. Mișcarea este măturată în sub-pași mai mici decât cea mai
 * subțire țintă, iar o penetrare se rezolvă cu translația minimă (alunecare), nu cu un zid invizibil.
 *
 * Convenția de yaw este cea a compunerii: înainte = (sin yaw, cos yaw), dreapta = (cos yaw, −sin yaw).
 */
import type { WalkBlocker } from '../character';
import type { CityDecorItem } from '../rendering';

export const VEHICLE_COLLISION_VERSION = '238-vehicle-collision-v1' as const;

export const VEHICLE_COLLISION_POLICY = Object.freeze({
  contract: VEHICLE_COLLISION_VERSION,
  /** Pasul maxim al unui sub-pas de mătura: sub raza celui mai subțire obstacol (hidrantul, 0,35 m). */
  maxSubstepM: 0.1,
  /** Distanța suplimentară cu care o rezolvare depășește penetrarea, ca să nu rămână în atingere. */
  skinM: 1e-4,
  maxResolvePasses: 6,
  cellSizeM: 8,
});

export interface VehiclePose {
  readonly x: number;
  readonly z: number;
  readonly yawRad: number;
}

export interface VehicleBody {
  readonly halfX: number;
  readonly halfZ: number;
}

export interface VehicleContact {
  readonly id: string;
  /** Direcția (unitară) în care trebuie împinsă mașina ca să iasă din obstacol. */
  readonly nx: number;
  readonly nz: number;
  readonly depthM: number;
}

export interface VehicleSweep {
  readonly pose: VehiclePose;
  readonly blocked: boolean;
  /** Suma normalizată a normalelor de contact; null când nu a fost nicio atingere sau se anulează. */
  readonly normal: Readonly<{ x: number; z: number }> | null;
  readonly hits: readonly string[];
}

export interface VehicleCollisionWorld {
  readonly policy: typeof VEHICLE_COLLISION_POLICY;
  readonly obstacleCount: number;
  contacts(pose: VehiclePose, body: VehicleBody): readonly VehicleContact[];
  /** Cea mai mare penetrare; 0 când corpul este liber. */
  deepestPenetrationM(pose: VehiclePose, body: VehicleBody): number;
  sweep(from: VehiclePose, to: VehiclePose, body: VehicleBody): VehicleSweep;
}

interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

type Obstacle =
  | {
      readonly id: string;
      readonly kind: 'CIRCLE';
      readonly bounds: Bounds;
      readonly x: number;
      readonly z: number;
      readonly r: number;
    }
  | {
      readonly id: string;
      readonly kind: 'POLYGON';
      readonly bounds: Bounds;
      readonly vertices: readonly Readonly<{ x: number; z: number }>[];
    };

interface Mtv {
  readonly nx: number;
  readonly nz: number;
  readonly depthM: number;
}

function corners(pose: VehiclePose, body: VehicleBody): readonly [number, number][] {
  const fx = Math.sin(pose.yawRad);
  const fz = Math.cos(pose.yawRad);
  const rx = Math.cos(pose.yawRad);
  const rz = -Math.sin(pose.yawRad);
  const out: [number, number][] = [];
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const)
    out.push([
      pose.x + rx * body.halfX * sx + fx * body.halfZ * sz,
      pose.z + rz * body.halfX * sx + fz * body.halfZ * sz,
    ]);
  return out;
}

function boundsOfPose(pose: VehiclePose, body: VehicleBody): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of corners(pose, body)) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

function circleMtv(
  pose: VehiclePose,
  body: VehicleBody,
  cx: number,
  cz: number,
  r: number,
): Mtv | null {
  const fx = Math.sin(pose.yawRad);
  const fz = Math.cos(pose.yawRad);
  const rx = Math.cos(pose.yawRad);
  const rz = -Math.sin(pose.yawRad);
  const dx = cx - pose.x;
  const dz = cz - pose.z;
  const a = dx * rx + dz * rz;
  const b = dx * fx + dz * fz;
  const clampedA = Math.max(-body.halfX, Math.min(body.halfX, a));
  const clampedB = Math.max(-body.halfZ, Math.min(body.halfZ, b));
  const da = a - clampedA;
  const db = b - clampedB;
  const distance = Math.hypot(da, db);
  if (distance > 1e-9) {
    if (distance >= r) return null;
    // De la centrul cercului spre cel mai apropiat punct al corpului.
    const la = -da / distance;
    const lb = -db / distance;
    return { nx: rx * la + fx * lb, nz: rz * la + fz * lb, depthM: r - distance };
  }
  // Centrul cercului este în interiorul corpului: ieșirea pe axa cu cea mai mică adâncime.
  const insideA = body.halfX - Math.abs(a);
  const insideB = body.halfZ - Math.abs(b);
  if (insideA < insideB) {
    const s = a >= 0 ? -1 : 1;
    return { nx: rx * s, nz: rz * s, depthM: insideA + r };
  }
  const s = b >= 0 ? -1 : 1;
  return { nx: fx * s, nz: fz * s, depthM: insideB + r };
}

function polygonMtv(
  pose: VehiclePose,
  body: VehicleBody,
  vertices: readonly Readonly<{ x: number; z: number }>[],
): Mtv | null {
  const box = corners(pose, body);
  const axes: [number, number][] = [
    [Math.cos(pose.yawRad), -Math.sin(pose.yawRad)],
    [Math.sin(pose.yawRad), Math.cos(pose.yawRad)],
  ];
  for (let index = 0; index < vertices.length; index += 1) {
    const a = vertices[index]!;
    const b = vertices[(index + 1) % vertices.length]!;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const length = Math.hypot(ex, ez);
    if (length > 1e-12) axes.push([ez / length, -ex / length]);
  }
  let best: Mtv | null = null;
  for (const [ax, az] of axes) {
    let minA = Infinity;
    let maxA = -Infinity;
    for (const [x, z] of box) {
      const p = x * ax + z * az;
      minA = Math.min(minA, p);
      maxA = Math.max(maxA, p);
    }
    let minB = Infinity;
    let maxB = -Infinity;
    for (const v of vertices) {
      const p = v.x * ax + v.z * az;
      minB = Math.min(minB, p);
      maxB = Math.max(maxB, p);
    }
    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
    if (overlap <= 0) return null;
    if (best === null || overlap < best.depthM) {
      const flip = minA + maxA < minB + maxB ? -1 : 1;
      best = { nx: ax * flip, nz: az * flip, depthM: overlap };
    }
  }
  return best;
}

export interface VehicleCollisionOptions {
  /** Blocatoarele lumii de mers 192 (clădirile). */
  readonly blockers: readonly WalkBlocker[];
  /** Planul de decor 146; fiecare item este un solid cu raza lui de footprint. */
  readonly decor: readonly CityDecorItem[];
}

/** Lumea de coliziune a mașinii: o grilă uniformă peste solidele statice, fără alocare pe tick. */
export function createVehicleCollisionWorld(
  options: VehicleCollisionOptions,
): VehicleCollisionWorld {
  const policy = VEHICLE_COLLISION_POLICY;
  const obstacles: Obstacle[] = [];
  for (const blocker of options.blockers)
    obstacles.push(
      Object.freeze({
        id: blocker.id,
        kind: 'POLYGON' as const,
        bounds: blocker.polygon.bounds,
        vertices: blocker.polygon.vertices,
      }),
    );
  for (const item of options.decor)
    obstacles.push(
      Object.freeze({
        id: item.id,
        kind: 'CIRCLE' as const,
        bounds: Object.freeze({
          minX: item.x - item.radiusM,
          maxX: item.x + item.radiusM,
          minZ: item.z - item.radiusM,
          maxZ: item.z + item.radiusM,
        }),
        x: item.x,
        z: item.z,
        r: item.radiusM,
      }),
    );
  const grid = new Map<string, number[]>();
  const cellOf = (value: number): number => Math.floor(value / policy.cellSizeM);
  obstacles.forEach((obstacle, index) => {
    for (let cx = cellOf(obstacle.bounds.minX); cx <= cellOf(obstacle.bounds.maxX); cx += 1)
      for (let cz = cellOf(obstacle.bounds.minZ); cz <= cellOf(obstacle.bounds.maxZ); cz += 1) {
        const key = `${cx}:${cz}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(index);
        else grid.set(key, [index]);
      }
  });

  const contacts = (pose: VehiclePose, body: VehicleBody): readonly VehicleContact[] => {
    const box = boundsOfPose(pose, body);
    const seen = new Set<number>();
    const found: VehicleContact[] = [];
    for (let cx = cellOf(box.minX); cx <= cellOf(box.maxX); cx += 1)
      for (let cz = cellOf(box.minZ); cz <= cellOf(box.maxZ); cz += 1) {
        const bucket = grid.get(`${cx}:${cz}`);
        if (!bucket) continue;
        for (const index of bucket) {
          if (seen.has(index)) continue;
          seen.add(index);
          const obstacle = obstacles[index]!;
          const b = obstacle.bounds;
          if (b.maxX < box.minX || b.minX > box.maxX || b.maxZ < box.minZ || b.minZ > box.maxZ)
            continue;
          const mtv =
            obstacle.kind === 'CIRCLE'
              ? circleMtv(pose, body, obstacle.x, obstacle.z, obstacle.r)
              : polygonMtv(pose, body, obstacle.vertices);
          if (mtv && mtv.depthM > 0) found.push(Object.freeze({ id: obstacle.id, ...mtv }));
        }
      }
    found.sort((a, b) => b.depthM - a.depthM || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return Object.freeze(found);
  };

  /** Împinge corpul afară din toate solidele; null dacă nu se poate (strivit între două). */
  const resolve = (
    start: VehiclePose,
    body: VehicleBody,
    normal: { x: number; z: number },
    hits: Set<string>,
  ): VehiclePose | null => {
    let pose = start;
    for (let pass = 0; pass < policy.maxResolvePasses; pass += 1) {
      const found = contacts(pose, body);
      const deepest = found[0];
      if (!deepest) return pose;
      const push = deepest.depthM + policy.skinM;
      pose = { x: pose.x + deepest.nx * push, z: pose.z + deepest.nz * push, yawRad: pose.yawRad };
      normal.x += deepest.nx;
      normal.z += deepest.nz;
      hits.add(deepest.id);
    }
    return contacts(pose, body).length === 0 ? pose : null;
  };

  return Object.freeze({
    policy,
    obstacleCount: obstacles.length,
    contacts,
    deepestPenetrationM(pose: VehiclePose, body: VehicleBody): number {
      return contacts(pose, body)[0]?.depthM ?? 0;
    },
    sweep(from: VehiclePose, to: VehiclePose, body: VehicleBody): VehicleSweep {
      const travel = Math.hypot(to.x - from.x, to.z - from.z);
      const swing = Math.abs(to.yawRad - from.yawRad) * Math.hypot(body.halfX, body.halfZ);
      const steps = Math.max(1, Math.ceil(Math.max(travel, swing) / policy.maxSubstepM));
      const normal = { x: 0, z: 0 };
      const hits = new Set<string>();
      let pose = from;
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        const candidate: VehiclePose = {
          x: from.x + (to.x - from.x) * t,
          z: from.z + (to.z - from.z) * t,
          yawRad: from.yawRad + (to.yawRad - from.yawRad) * t,
        };
        const resolved = resolve(candidate, body, normal, hits);
        if (resolved === null) {
          // Strivită între solide: rămâne în ultima poziție liberă, cu normala opusă mișcării.
          const length = travel || 1;
          return Object.freeze({
            pose,
            blocked: true,
            normal: Object.freeze({ x: -(to.x - from.x) / length, z: -(to.z - from.z) / length }),
            hits: Object.freeze([...hits]),
          });
        }
        pose = resolved;
      }
      const length = Math.hypot(normal.x, normal.z);
      return Object.freeze({
        pose,
        blocked: hits.size > 0,
        normal:
          length > 1e-9 ? Object.freeze({ x: normal.x / length, z: normal.z / length }) : null,
        hits: Object.freeze([...hits]),
      });
    },
  });
}
