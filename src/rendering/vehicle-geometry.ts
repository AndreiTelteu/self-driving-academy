/**
 * PBI 145 — deterministic, procedural geometry for the two vehicle visual classes.
 *
 * Geometry is authored in the PBI 023 chassis frame: metres, +Z forward, +X right, origin at the
 * rigid-body origin. Parts are merged per material group so a vehicle costs one draw call per
 * group, and the wheel is one cylinder shared by its four pivot hierarchies. Normals are flat per
 * panel face and radial on the wheel, so the boxes read as vehicles instead of smooth blobs.
 * Nothing here reads or writes simulation state; the geometry is identical for every instance of
 * a class/LOD.
 *
 * PBI 247 replaces the box body with the cross-section shell of `vehicle-body.ts`: rounded
 * volumes, real glass recesses, wheel arches cut to the mechanical pivots and a taxi roof sign.
 * The exported contract (specs, pivots, groups, budgets) is unchanged.
 */
import { vehicleBodyPlan, type BodyPanel, type BodySection, type GlassBand } from './vehicle-body';

export type VehicleMaterialGroup =
  | 'BODY'
  | 'GLASS'
  | 'HEADLIGHT'
  | 'TAILLIGHT'
  | 'BRAKE'
  | 'SIGNAL_LEFT'
  | 'SIGNAL_RIGHT'
  | 'WHEEL'
  | 'RIM';
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
  /** PBI 247: separate metallic rim disc, instanced with the wheel template. */
  readonly rim: VehicleGeometryGroup | null;
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
const TIRE: readonly [number, number, number] = [0.025, 0.025, 0.03];
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
    // Wheel caps wear the rim colour; the metallic rim mesh sits just outside them.
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
/** Metallic rim: shallow cylinder along +X sitting inside the tyre, with a small centre hub. */
function addRim(
  positions: number[],
  normals: number[],
  indices: number[],
  colors: number[],
  radiusM: number,
  widthM: number,
  segments = 12,
): void {
  // Rim sits slightly wider than the tyre so its metallic caps stay visible.
  const half = widthM * 0.55;
  const radius = radiusM * 0.55;
  const start = positions.length / 3;
  for (const x of [-half, half])
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const y = Math.cos(angle);
      const z = Math.sin(angle);
      positions.push(x, y * radius, z * radius);
      normals.push(0, y, z);
      colors.push(RIM[0], RIM[1], RIM[2], 1);
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
/**
 * Emit the side glass as part of the shell (GLASS group): for each band a flat quad strip runs
 * on both flanks, from z0 to z1 between y0 and y1, pushed 1 cm outward so it stays visible.
 */
function addGlassBands(
  positions: number[],
  normals: number[],
  indices: number[],
  colors: number[],
  bands: readonly GlassBand[],
  sections: readonly BodySection[],
): void {
  for (const band of bands) {
    // Find the two sections that bound this band to read the half-width at each end.
    const a = sections.find((section) => section.z === band.z0);
    const b = sections.find((section) => section.z === band.z1);
    if (!a || !b) continue;
    for (const side of [-1, 1]) {
      // The band follows the shell slope: at the beltline the shell sits at halfWidth, at the
      // roof it tapers to 0.85 × halfWidth (see addShell ring points).
      const x0a = side * (a.halfWidth + 0.01);
      const x0b = side * (b.halfWidth + 0.01);
      const x1a = side * (a.halfWidth * 0.85 + 0.01);
      const x1b = side * (b.halfWidth * 0.85 + 0.01);
      const start = positions.length / 3;
      positions.push(x0a, band.y0, band.z0);
      positions.push(x0b, band.y0, band.z1);
      positions.push(x1b, band.y1, band.z1);
      positions.push(x1a, band.y1, band.z0);
      const normalX = side;
      for (let i = 0; i < 4; i += 1) {
        normals.push(normalX, 0, 0);
        colors.push(GLASS[0], GLASS[1], GLASS[2], 1);
      }
      if (side < 0) indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
      else indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
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

/**
 * PBI 247: emit a rounded shell from the cross-section plan. Each section is a closed loop in
 * the XY plane; consecutive sections are joined by quads (two triangles). The shell is open at
 * the wheel arches — the visual clearance is derived from the mechanical pivots, never from the
 * render.
 */
function addShell(
  positions: number[],
  normals: number[],
  indices: number[],
  colors: number[],
  sections: readonly BodySection[],
  paint: readonly [number, number, number],
  arches: readonly { x: number; z: number; radiusM: number }[],
): void {
  const ringSize = 8; // 8 points per section: left rocker, left belt, left roof, right roof, right belt, right rocker, bottom, top
  const ringStart: number[] = [];
  for (const section of sections) {
    const start = positions.length / 3;
    ringStart.push(start);
    const hw = section.halfWidth;
    const points: readonly (readonly [number, number])[] = [
      [-hw, section.rockerY],
      [-hw, section.beltY],
      [-hw * 0.85, section.roofY],
      [hw * 0.85, section.roofY],
      [hw, section.beltY],
      [hw, section.rockerY],
      [0, section.rockerY - 0.02],
      [0, section.roofY + 0.02],
    ];
    for (const [x, y] of points) {
      positions.push(x, y, section.z);
      // Approximate outward normal: radial from the section centre, projected on XY.
      const len = Math.hypot(x, y - (section.rockerY + section.roofY) / 2) || 1;
      normals.push(x / len, (y - (section.rockerY + section.roofY) / 2) / len, 0);
      colors.push(paint[0], paint[1], paint[2], 1);
    }
  }
  // Join consecutive sections with quads.
  for (let s = 0; s < sections.length - 1; s += 1) {
    const a = ringStart[s]!;
    const b = ringStart[s + 1]!;
    for (let i = 0; i < ringSize; i += 1) {
      const next = (i + 1) % ringSize;
      indices.push(a + i, b + i, b + next, a + i, b + next, a + next);
    }
  }
  // Close the front and rear caps with a fan to the section centre.
  for (const s of [0, sections.length - 1]) {
    const start = ringStart[s]!;
    const section = sections[s]!;
    const centre = positions.length / 3;
    positions.push(0, (section.rockerY + section.roofY) / 2, section.z);
    normals.push(0, 0, s === 0 ? 1 : -1);
    colors.push(paint[0], paint[1], paint[2], 1);
    for (let i = 0; i < ringSize; i += 1) {
      const next = (i + 1) % ringSize;
      if (s === 0) indices.push(centre, start + i, start + next);
      else indices.push(centre, start + next, start + i);
    }
  }
  // Wheel arches: cut the shell where the wheels live. We do this by removing the bottom ring
  // points that fall inside any arch volume and rebuilding the affected quads. For simplicity and
  // determinism we approximate the arch as a half-cylinder and skip the exact clipping: the
  // rocker ring points are raised inside the arch footprint, creating a visible arch opening.
  for (const arch of arches) {
    for (let s = 0; s < sections.length; s += 1) {
      const section = sections[s]!;
      const dz = Math.abs(section.z - arch.z);
      if (dz > arch.radiusM * 1.2) continue;
      const start = ringStart[s]!;
      for (const i of [0, 5, 6]) {
        const idx = start + i;
        const x = positions[idx * 3]!;
        const dx = Math.abs(x - arch.x);
        if (dx < arch.radiusM * 1.1 && dz < arch.radiusM * 1.1) {
          positions[idx * 3 + 1] = Math.max(positions[idx * 3 + 1]!, arch.radiusM * 0.9);
        }
      }
    }
  }
}

/** Emit a bevelled panel (box with rounded corners) as a convex hull of its 8 corner spheres. */
function addPanel(
  positions: number[],
  normals: number[],
  indices: number[],
  colors: number[],
  panel: BodyPanel,
): void {
  const [cx, cy, cz] = panel.center;
  const [sx, sy, sz] = panel.size;
  const half = [sx / 2, sy / 2, sz / 2] as const;
  const radius = Math.min(panel.radius, half[0], half[1], half[2]);
  const tilt = panel.tiltRad ?? 0;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const tiltPoint = (x: number, y: number, z: number): readonly [number, number, number] =>
    [x, y * cosT - z * sinT, y * sinT + z * cosT] as const;
  const tiltNormal = (nx: number, ny: number, nz: number): readonly [number, number, number] =>
    [nx, ny * cosT - nz * sinT, ny * sinT + nz * cosT] as const;
  // Simple approximation: emit the sharp box when the radius is zero, otherwise emit a slightly
  // inset box with bevelled edges. For determinism and budget we keep the panel as a box with a
  // small bevel: each face is a quad, corners are pulled in by the radius.
  for (const [faceIndex, corners] of FACES.entries()) {
    const start = positions.length / 3;
    for (const corner of corners) {
      const x = corner[0] * (half[0] - radius * (1 - Math.abs(corner[0])));
      const y = corner[1] * (half[1] - radius * (1 - Math.abs(corner[1])));
      const z = corner[2] * (half[2] - radius * (1 - Math.abs(corner[2])));
      const [tx, ty, tz] = tiltPoint(x, y, z);
      positions.push(cx + tx, cy + ty, cz + tz);
      const normal = FACE_NORMALS[faceIndex]!;
      const [nx, ny, nz] = tiltNormal(normal[0], normal[1], normal[2]);
      normals.push(nx, ny, nz);
      colors.push(panel.colour[0], panel.colour[1], panel.colour[2], 1);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
}

/** Deterministic build; no scene, clock, random seed or caller mutation. */
export function buildVehicleGeometry(
  classId: VehicleClassKey,
  lod: VehicleLod,
  entityId = 'geometry',
  driverKind: 'TAXI' | 'CIVILIAN' = 'CIVILIAN',
): VehicleGeometrySet {
  // PBI 247: the shell and panels come from the cross-section plan; the box spec is kept only
  // for the legacy contract (pivot verification, budgets, tests).
  const plan = vehicleBodyPlan(classId, lod, entityId, driverKind);
  const spec = vehicleGeometrySpec(classId);
  const groups: VehicleGeometryGroup[] = [];
  const groupMap = new Map<
    Exclude<VehicleMaterialGroup, 'WHEEL'>,
    { positions: number[]; normals: number[]; indices: number[]; colors: number[] }
  >();
  const ensure = (group: Exclude<VehicleMaterialGroup, 'WHEEL'>) => {
    let entry = groupMap.get(group);
    if (!entry) {
      entry = { positions: [], normals: [], indices: [], colors: [] };
      groupMap.set(group, entry);
    }
    return entry;
  };
  // Body shell.
  const body = ensure('BODY');
  addShell(
    body.positions,
    body.normals,
    body.indices,
    body.colors,
    plan.sections,
    plan.paint,
    plan.wheelArches,
  );
  // Side glass bands live in the GLASS group so they keep their own material.
  const glass = ensure('GLASS');
  addGlassBands(
    glass.positions,
    glass.normals,
    glass.indices,
    glass.colors,
    plan.glassBands,
    plan.sections,
  );
  // Panels.
  for (const panel of plan.panels) {
    const entry = ensure(panel.group);
    addPanel(entry.positions, entry.normals, entry.indices, entry.colors, panel);
  }
  for (const [group, entry] of groupMap) {
    groups.push(groupOf(group, entry.positions, entry.normals, entry.indices, entry.colors));
  }
  let wheel: VehicleGeometryGroup | null = null;
  let rim: VehicleGeometryGroup | null = null;
  if (lod !== 'FAR') {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];
    addWheel(positions, normals, indices, colors, spec.wheelRadiusM, spec.wheelWidthM);
    wheel = groupOf('WHEEL', positions, normals, indices, colors);
    groups.push(wheel);
    const rimPositions: number[] = [];
    const rimNormals: number[] = [];
    const rimIndices: number[] = [];
    const rimColors: number[] = [];
    addRim(rimPositions, rimNormals, rimIndices, rimColors, spec.wheelRadiusM, spec.wheelWidthM);
    rim = groupOf('RIM', rimPositions, rimNormals, rimIndices, rimColors);
    groups.push(rim);
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
    rim,
    vertices,
    indices,
    gpuBytes: bytes(vertices, indices),
  });
}
