/**
 * PBI 145 — deterministic, procedural geometry for the two vehicle visual classes.
 *
 * Geometry is authored in the PBI 023 chassis frame: metres, +Z forward, +X right, origin at the
 * rigid-body origin. Parts are merged per material group so a vehicle costs one draw call per
 * group, and the wheel is one cylinder shared by its four pivot hierarchies. Normals are flat per
 * box face and radial on the wheel, so the boxes read as vehicles instead of smooth blobs. Nothing
 * here reads or writes simulation state; the geometry is identical for every instance of a
 * class/LOD.
 */
export type VehicleMaterialGroup =
  'BODY' | 'HEADLIGHT' | 'TAILLIGHT' | 'BRAKE' | 'SIGNAL_LEFT' | 'SIGNAL_RIGHT' | 'WHEEL';
export type VehicleLod = 'NEAR' | 'MID' | 'FAR';
export interface VehicleGeometryGroup {
  readonly group: VehicleMaterialGroup;
  readonly positions: readonly number[];
  readonly normals: readonly number[];
  readonly indices: readonly number[];
  /** Linear RGBA vertex colours; the shared BODY material multiplies them. */
  readonly colors: readonly number[];
}
export interface VehicleGeometrySet {
  readonly lod: VehicleLod;
  readonly groups: readonly VehicleGeometryGroup[];
  readonly wheel: VehicleGeometryGroup | null;
  readonly vertices: number;
  readonly indices: number;
  /** positions/normals (3+3 floats) + RGBA colours (4 floats) + Uint32 indices. */
  readonly gpuBytes: number;
}
export const VEHICLE_VERTEX_BYTES = 40;
export const VEHICLE_INDEX_BYTES = 4;
export type VehicleClassKey = 'sedan' | 'compact';
export interface VehicleBoxPart {
  readonly group: Exclude<VehicleMaterialGroup, 'WHEEL'>;
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly color: readonly [number, number, number];
}
export interface VehicleClassGeometrySpec {
  readonly classId: VehicleClassKey;
  readonly paint: readonly [number, number, number];
  readonly wheelRadiusM: number;
  readonly wheelWidthM: number;
  readonly parts: readonly VehicleBoxPart[];
}
const GLASS: readonly [number, number, number] = [0.06, 0.1, 0.13];
const TRIM: readonly [number, number, number] = [0.05, 0.05, 0.06];
const WHITE: readonly [number, number, number] = [1, 0.96, 0.86];
const RED: readonly [number, number, number] = [0.9, 0.06, 0.05];
const AMBER: readonly [number, number, number] = [1, 0.55, 0.05];
const TIRE: readonly [number, number, number] = [0.045, 0.045, 0.05];
const RIM: readonly [number, number, number] = [0.62, 0.64, 0.68];
const part = (
  group: VehicleBoxPart['group'],
  center: readonly [number, number, number],
  size: readonly [number, number, number],
  color: readonly [number, number, number],
): VehicleBoxPart => ({ group, center, size, color });

/** Sedan and compact share the American low-rise language; roofs, bumpers and lamps are separate. */
const SPECS: Readonly<Record<VehicleClassKey, VehicleClassGeometrySpec>> = Object.freeze({
  sedan: Object.freeze({
    classId: 'sedan',
    paint: [0.16, 0.24, 0.36] as const,
    wheelRadiusM: 0.32,
    wheelWidthM: 0.22,
    parts: Object.freeze([
      part('BODY', [0, 0.02, 0], [1.72, 0.42, 4.35], [0.16, 0.24, 0.36]),
      part('BODY', [0, 0.26, 1.38], [1.66, 0.14, 1.42], [0.16, 0.24, 0.36]),
      part('BODY', [0, 0.52, -0.18], [1.56, 0.5, 1.98], [0.16, 0.24, 0.36]),
      part('BODY', [0, 0.79, -0.22], [1.48, 0.08, 1.66], [0.16, 0.24, 0.36]),
      part('BODY', [0, 0.26, -1.6], [1.66, 0.14, 1.06], [0.16, 0.24, 0.36]),
      part('BODY', [0, 0.56, 0.86], [1.46, 0.34, 0.06], GLASS),
      part('BODY', [0, 0.56, -1.06], [1.46, 0.3, 0.06], GLASS),
      part('BODY', [-0.78, 0.56, -0.12], [0.05, 0.3, 1.44], GLASS),
      part('BODY', [0.78, 0.56, -0.12], [0.05, 0.3, 1.44], GLASS),
      part('BODY', [0, -0.05, 2.2], [1.76, 0.22, 0.18], TRIM),
      part('BODY', [0, -0.05, -2.2], [1.76, 0.22, 0.18], TRIM),
      part('BODY', [0, -0.2, 0], [1.58, 0.16, 3.5], TRIM),
      part('BODY', [-0.9, 0.44, 0.78], [0.18, 0.1, 0.12], TRIM),
      part('BODY', [0.9, 0.44, 0.78], [0.18, 0.1, 0.12], TRIM),
      part('HEADLIGHT', [-0.6, 0.14, 2.19], [0.34, 0.14, 0.06], WHITE),
      part('HEADLIGHT', [0.6, 0.14, 2.19], [0.34, 0.14, 0.06], WHITE),
      part('TAILLIGHT', [-0.62, 0.16, -2.19], [0.3, 0.12, 0.05], RED),
      part('TAILLIGHT', [0.62, 0.16, -2.19], [0.3, 0.12, 0.05], RED),
      part('BRAKE', [-0.62, 0.16, -2.24], [0.26, 0.1, 0.04], RED),
      part('BRAKE', [0.62, 0.16, -2.24], [0.26, 0.1, 0.04], RED),
      part('SIGNAL_LEFT', [-0.82, 0.18, 2.17], [0.12, 0.1, 0.05], AMBER),
      part('SIGNAL_LEFT', [-0.84, 0.16, -2.19], [0.1, 0.1, 0.05], AMBER),
      part('SIGNAL_RIGHT', [0.82, 0.18, 2.17], [0.12, 0.1, 0.05], AMBER),
      part('SIGNAL_RIGHT', [0.84, 0.16, -2.19], [0.1, 0.1, 0.05], AMBER),
    ]),
  }),
  compact: Object.freeze({
    classId: 'compact',
    paint: [0.72, 0.36, 0.12] as const,
    wheelRadiusM: 0.29,
    wheelWidthM: 0.2,
    parts: Object.freeze([
      part('BODY', [0, 0.0, 0], [1.56, 0.4, 3.95], [0.72, 0.36, 0.12]),
      part('BODY', [0, 0.24, 1.2], [1.5, 0.14, 1.35], [0.72, 0.36, 0.12]),
      part('BODY', [0, 0.52, -0.22], [1.44, 0.56, 1.72], [0.72, 0.36, 0.12]),
      part('BODY', [0, 0.83, -0.26], [1.36, 0.08, 1.42], [0.72, 0.36, 0.12]),
      part('BODY', [0, 0.24, -1.48], [1.5, 0.14, 0.92], [0.72, 0.36, 0.12]),
      part('BODY', [0, 0.58, 0.66], [1.34, 0.38, 0.06], GLASS),
      part('BODY', [0, 0.56, -0.98], [1.34, 0.32, 0.06], GLASS),
      part('BODY', [-0.72, 0.58, -0.2], [0.05, 0.32, 1.24], GLASS),
      part('BODY', [0.72, 0.58, -0.2], [0.05, 0.32, 1.24], GLASS),
      part('BODY', [0, -0.08, 2.0], [1.6, 0.22, 0.18], TRIM),
      part('BODY', [0, -0.08, -2.0], [1.6, 0.22, 0.18], TRIM),
      part('BODY', [0, -0.22, 0], [1.42, 0.16, 3.2], TRIM),
      part('BODY', [-0.82, 0.44, 0.56], [0.18, 0.1, 0.12], TRIM),
      part('BODY', [0.82, 0.44, 0.56], [0.18, 0.1, 0.12], TRIM),
      part('HEADLIGHT', [-0.52, 0.12, 1.99], [0.32, 0.14, 0.06], WHITE),
      part('HEADLIGHT', [0.52, 0.12, 1.99], [0.32, 0.14, 0.06], WHITE),
      part('TAILLIGHT', [-0.54, 0.18, -1.99], [0.3, 0.14, 0.05], RED),
      part('TAILLIGHT', [0.54, 0.18, -1.99], [0.3, 0.14, 0.05], RED),
      part('BRAKE', [-0.54, 0.18, -2.04], [0.24, 0.1, 0.04], RED),
      part('BRAKE', [0.54, 0.18, -2.04], [0.24, 0.1, 0.04], RED),
      part('SIGNAL_LEFT', [-0.74, 0.2, 1.97], [0.12, 0.1, 0.05], AMBER),
      part('SIGNAL_LEFT', [-0.76, 0.18, -1.99], [0.1, 0.1, 0.05], AMBER),
      part('SIGNAL_RIGHT', [0.74, 0.2, 1.97], [0.12, 0.1, 0.05], AMBER),
      part('SIGNAL_RIGHT', [0.76, 0.18, -1.99], [0.1, 0.1, 0.05], AMBER),
    ]),
  }),
});
export function vehicleGeometrySpec(classId: VehicleClassKey): VehicleClassGeometrySpec {
  if (!Object.hasOwn(SPECS, classId))
    throw new RangeError(`Unknown vehicle visual class ${classId}`);
  return SPECS[classId];
}
/** MID drops mirrors and side windows; FAR keeps a single merged silhouette. */
function partsFor(classId: VehicleClassKey, lod: VehicleLod): readonly VehicleBoxPart[] {
  const spec = vehicleGeometrySpec(classId);
  if (lod === 'NEAR') return spec.parts;
  const omitted = (candidate: VehicleBoxPart): boolean => {
    const [x, y, z] = candidate.center;
    const mirror = Math.abs(x) > 0.85 && Math.abs(z) < 1.05 && y > 0.3;
    const sideWindow = Math.abs(x) > 0.6 && candidate.size[0] < 0.08;
    return candidate.group === 'BODY' && (mirror || sideWindow);
  };
  if (lod === 'MID')
    return spec.parts.filter(
      (candidate) => !omitted(candidate) && !candidate.group.startsWith('SIGNAL'),
    );
  return spec.parts.filter((candidate) => {
    if (candidate.group !== 'BODY') return false;
    const [x, , z] = candidate.center;
    return Math.abs(x) < 0.05 && [0, 1.2, 1.38].some((target) => Math.abs(z - target) < 1.4);
  });
}

const FACES: readonly (readonly [number, number, number])[][] = [
  [
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ],
  [
    [1, -1, -1],
    [-1, -1, -1],
    [-1, 1, -1],
    [1, 1, -1],
  ],
  [
    [1, -1, 1],
    [1, -1, -1],
    [1, 1, -1],
    [1, 1, 1],
  ],
  [
    [-1, -1, -1],
    [-1, -1, 1],
    [-1, 1, 1],
    [-1, 1, -1],
  ],
  [
    [-1, 1, 1],
    [1, 1, 1],
    [1, 1, -1],
    [-1, 1, -1],
  ],
  [
    [-1, -1, -1],
    [1, -1, -1],
    [1, -1, 1],
    [-1, -1, 1],
  ],
];
const FACE_NORMALS: readonly (readonly [number, number, number])[] = [
  [0, 0, 1],
  [0, 0, -1],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
];
/** Four vertices per face keep normals flat; shared corners would average into a dark dome. */
function addBox(
  positions: number[],
  normals: number[],
  indices: number[],
  colors: number[],
  box: VehicleBoxPart,
): void {
  const [cx, cy, cz] = box.center;
  const [sx, sy, sz] = box.size;
  const half = [sx / 2, sy / 2, sz / 2] as const;
  for (const [faceIndex, corners] of FACES.entries()) {
    const start = positions.length / 3;
    for (const corner of corners) {
      positions.push(cx + corner[0] * half[0], cy + corner[1] * half[1], cz + corner[2] * half[2]);
      const normal = FACE_NORMALS[faceIndex]!;
      normals.push(normal[0], normal[1], normal[2]);
      colors.push(box.color[0], box.color[1], box.color[2], 1);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
}
/** Cylinder along +X (the documented wheel spin axis), closed with two triangle fans. */
function addWheel(
  positions: number[],
  normals: number[],
  indices: number[],
  colors: number[],
  radiusM: number,
  widthM: number,
  segments = 12,
): void {
  const half = widthM / 2;
  const start = positions.length / 3;
  for (const x of [-half, half])
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const y = Math.cos(angle);
      const z = Math.sin(angle);
      positions.push(x, y * radiusM, z * radiusM);
      normals.push(0, y, z);
      colors.push(TIRE[0], TIRE[1], TIRE[2], 1);
    }
  for (const x of [-half, half]) {
    const center = positions.length / 3;
    positions.push(x, 0, 0);
    normals.push(x < 0 ? -1 : 1, 0, 0);
    colors.push(RIM[0], RIM[1], RIM[2], 1);
    for (let index = 0; index < segments; index += 1) {
      const a = start + (x < 0 ? 0 : segments) + index;
      const b = start + (x < 0 ? 0 : segments) + ((index + 1) % segments);
      if (x < 0) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  }
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const a = start + index;
    const b = start + next;
    const c = start + segments + next;
    const d = start + segments + index;
    indices.push(a, b, c, a, c, d);
  }
}
function bytes(vertices: number, indices: number): number {
  return vertices * VEHICLE_VERTEX_BYTES + indices * VEHICLE_INDEX_BYTES;
}
function groupOf(
  group: VehicleMaterialGroup,
  positions: number[],
  normals: number[],
  indices: number[],
  colors: number[],
): VehicleGeometryGroup {
  return Object.freeze({
    group,
    positions: Object.freeze(positions),
    normals: Object.freeze(normals),
    indices: Object.freeze(indices),
    colors: Object.freeze(colors),
  });
}
/** Deterministic build; no scene, clock, random seed or caller mutation. */
export function buildVehicleGeometry(
  classId: VehicleClassKey,
  lod: VehicleLod,
): VehicleGeometrySet {
  const parts = partsFor(classId, lod);
  const groups: VehicleGeometryGroup[] = [];
  for (const group of [
    'BODY',
    'HEADLIGHT',
    'TAILLIGHT',
    'BRAKE',
    'SIGNAL_LEFT',
    'SIGNAL_RIGHT',
  ] as const) {
    const members = parts.filter((candidate) => candidate.group === group);
    if (!members.length) continue;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];
    for (const member of members) addBox(positions, normals, indices, colors, member);
    groups.push(groupOf(group, positions, normals, indices, colors));
  }
  const spec = vehicleGeometrySpec(classId);
  let wheel: VehicleGeometryGroup | null = null;
  if (lod !== 'FAR') {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];
    addWheel(positions, normals, indices, colors, spec.wheelRadiusM, spec.wheelWidthM);
    wheel = groupOf('WHEEL', positions, normals, indices, colors);
    groups.push(wheel);
  }
  let vertices = 0;
  let indices = 0;
  for (const group of groups) {
    vertices += group.positions.length / 3;
    indices += group.indices.length;
  }
  return Object.freeze({
    lod,
    groups: Object.freeze(groups),
    wheel,
    vertices,
    indices,
    gpuBytes: bytes(vertices, indices),
  });
}
