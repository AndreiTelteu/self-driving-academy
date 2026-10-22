/**
 * PBI 146 — spatial city decor derived from the PBI 042 layout.
 *
 * The plan places only original procedural street furniture (lamps, trees, benches, hydrants,
 * bins, meters, signs and bus shelters) on sidewalk ribbons and next to service zones. It never
 * edits the layout, never paints on lanes/intersections/crosswalks and never creates colliders.
 * Geometry is merged per 120 m cell so static batches stay spatially local; one shared material
 * serves all cells. Source and licence are explicit for every kind.
 */
import { checkAssetManifest, type AssetBudgetManifest, type BudgetedAsset } from './asset-budgets';
import type { QualityPreset } from './quality-policy';
import type { CityLayout, CityPlanarElement } from '../world';

export const CITY_DECOR_VERSION = '146-city-decor-v1';
export const CITY_DECOR_CELL_SIZE_M = 120;
export const CITY_DECOR_VERTEX_BYTES = 40;
export const CITY_DECOR_INDEX_BYTES = 4;
export type CityDecorKind =
  | 'street-lamp'
  | 'tree'
  | 'bench'
  | 'hydrant'
  | 'trash-can'
  | 'bus-shelter'
  | 'parking-meter'
  | 'sign';
export const CITY_DECOR_KINDS: readonly CityDecorKind[] = Object.freeze([
  'street-lamp',
  'tree',
  'bench',
  'hydrant',
  'trash-can',
  'bus-shelter',
  'parking-meter',
  'sign',
]);
export interface CityDecorItem {
  readonly id: string;
  readonly kind: CityDecorKind;
  readonly x: number;
  readonly z: number;
  readonly rotationY: number;
  readonly cell: string;
  readonly radiusM: number;
  readonly heightM: number;
}
export interface CityDecorPlan {
  readonly version: typeof CITY_DECOR_VERSION;
  readonly cellSizeM: number;
  readonly items: readonly CityDecorItem[];
  readonly cells: readonly string[];
  readonly countsByKind: Readonly<Record<CityDecorKind, number>>;
  readonly sidewalkRibbons: number;
  readonly serviceZones: number;
}
export interface CityDecorCellGeometry {
  readonly cell: string;
  readonly positions: readonly number[];
  readonly normals: readonly number[];
  readonly colors: readonly number[];
  readonly indices: readonly number[];
  readonly vertices: number;
  readonly indicesCount: number;
  readonly gpuBytes: number;
}
interface Point {
  readonly x: number;
  readonly z: number;
}
type TemplatePart =
  | {
      readonly type: 'box';
      readonly center: readonly [number, number, number];
      readonly size: readonly [number, number, number];
      readonly color: readonly [number, number, number];
    }
  | {
      readonly type: 'cylinder';
      readonly center: readonly [number, number, number];
      readonly radius: number;
      readonly height: number;
      readonly color: readonly [number, number, number];
      readonly segments?: number;
    }
  | {
      readonly type: 'cone';
      readonly center: readonly [number, number, number];
      readonly radius: number;
      readonly height: number;
      readonly color: readonly [number, number, number];
      readonly segments?: number;
    };
const METAL: readonly [number, number, number] = [0.32, 0.33, 0.35];
const DARK: readonly [number, number, number] = [0.11, 0.12, 0.13];
const WOOD: readonly [number, number, number] = [0.42, 0.27, 0.14];
const GREEN: readonly [number, number, number] = [0.16, 0.36, 0.16];
const DEEP_GREEN: readonly [number, number, number] = [0.1, 0.27, 0.12];
const BARK: readonly [number, number, number] = [0.28, 0.19, 0.11];
const RED: readonly [number, number, number] = [0.62, 0.09, 0.07];
const GLASS: readonly [number, number, number] = [0.42, 0.6, 0.68];
const LAMP: readonly [number, number, number] = [0.92, 0.88, 0.7];
const SIGN_GREEN: readonly [number, number, number] = [0.12, 0.36, 0.22];
const BIN_GREEN: readonly [number, number, number] = [0.14, 0.3, 0.22];
const TEMPLATES: Readonly<Record<CityDecorKind, readonly TemplatePart[]>> = Object.freeze({
  'street-lamp': [
    { type: 'cylinder', center: [0, 2.4, 0], radius: 0.09, height: 4.8, color: METAL },
    { type: 'box', center: [0, 4.78, 0.45], size: [0.12, 0.12, 1.0], color: METAL },
    { type: 'box', center: [0, 4.7, 0.9], size: [0.36, 0.14, 0.3], color: LAMP },
  ],
  tree: [
    { type: 'cylinder', center: [0, 1.35, 0], radius: 0.17, height: 2.7, color: BARK },
    { type: 'cone', center: [0, 3.5, 0], radius: 1.5, height: 2.6, color: GREEN },
    { type: 'cone', center: [0, 4.7, 0], radius: 1.05, height: 1.9, color: DEEP_GREEN },
  ],
  bench: [
    { type: 'box', center: [0, 0.46, 0], size: [1.8, 0.09, 0.52], color: WOOD },
    { type: 'box', center: [0, 0.78, -0.24], size: [1.8, 0.48, 0.07], color: WOOD },
    { type: 'box', center: [-0.72, 0.22, 0], size: [0.08, 0.44, 0.46], color: METAL },
    { type: 'box', center: [0.72, 0.22, 0], size: [0.08, 0.44, 0.46], color: METAL },
  ],
  hydrant: [
    { type: 'cylinder', center: [0, 0.4, 0], radius: 0.17, height: 0.8, color: RED },
    { type: 'box', center: [0, 0.84, 0], size: [0.3, 0.12, 0.3], color: RED },
    { type: 'box', center: [0.19, 0.55, 0], size: [0.12, 0.12, 0.12], color: METAL },
    { type: 'box', center: [-0.19, 0.55, 0], size: [0.12, 0.12, 0.12], color: METAL },
  ],
  'trash-can': [
    { type: 'cylinder', center: [0, 0.45, 0], radius: 0.28, height: 0.9, color: BIN_GREEN },
    { type: 'cylinder', center: [0, 0.93, 0], radius: 0.3, height: 0.07, color: DARK },
  ],
  'bus-shelter': [
    { type: 'box', center: [-0.65, 1.1, -0.5], size: [0.08, 2.2, 0.08], color: METAL },
    { type: 'box', center: [0.65, 1.1, -0.5], size: [0.08, 2.2, 0.08], color: METAL },
    { type: 'box', center: [-0.65, 1.1, 0.5], size: [0.08, 2.2, 0.08], color: METAL },
    { type: 'box', center: [0.65, 1.1, 0.5], size: [0.08, 2.2, 0.08], color: METAL },
    { type: 'box', center: [0, 2.26, 0], size: [1.6, 0.1, 1.24], color: DARK },
    { type: 'box', center: [0, 1.3, -0.58], size: [1.46, 1.8, 0.06], color: GLASS },
    { type: 'box', center: [0, 0.5, 0.25], size: [1.2, 0.09, 0.36], color: WOOD },
  ],
  'parking-meter': [
    { type: 'cylinder', center: [0, 0.65, 0], radius: 0.05, height: 1.3, color: METAL },
    { type: 'box', center: [0, 1.42, 0], size: [0.18, 0.3, 0.12], color: DARK },
  ],
  sign: [
    { type: 'cylinder', center: [0, 1.3, 0], radius: 0.05, height: 2.6, color: METAL },
    { type: 'box', center: [0, 2.3, 0], size: [0.5, 0.6, 0.04], color: SIGN_GREEN },
  ],
});
/** Radius used for clearance and the per-kind footprint; heights are presentation-only. */
const CLEARANCE: Readonly<Record<CityDecorKind, { radiusM: number; heightM: number }>> =
  Object.freeze({
    'street-lamp': { radiusM: 0.4, heightM: 4.9 },
    tree: { radiusM: 0.55, heightM: 5.7 },
    bench: { radiusM: 0.85, heightM: 0.9 },
    hydrant: { radiusM: 0.35, heightM: 0.9 },
    'trash-can': { radiusM: 0.4, heightM: 1.0 },
    'bus-shelter': { radiusM: 0.95, heightM: 2.4 },
    'parking-meter': { radiusM: 0.3, heightM: 1.6 },
    sign: { radiusM: 0.35, heightM: 2.6 },
  });
const RULES: readonly { kind: CityDecorKind; spacingM: number; offsetM: number }[] = Object.freeze([
  { kind: 'street-lamp', spacingM: 34, offsetM: 0.62 },
  { kind: 'tree', spacingM: 23, offsetM: 0.6 },
  { kind: 'trash-can', spacingM: 41, offsetM: 0.55 },
  { kind: 'parking-meter', spacingM: 47, offsetM: 0.62 },
  { kind: 'bench', spacingM: 63, offsetM: 0.55 },
  { kind: 'hydrant', spacingM: 97, offsetM: 0.55 },
  { kind: 'sign', spacingM: 71, offsetM: 0.66 },
]);
const FORBIDDEN: readonly CityPlanarElement['kind'][] = Object.freeze([
  'LANE_SURFACE',
  'LANE_MARKING',
  'INTERSECTION_SURFACE',
  'STOP_LINE',
  'CROSSWALK',
  'BUILDING',
]);
const ALLOWED: readonly CityPlanarElement['kind'][] = Object.freeze(['SIDEWALK', 'SERVICE_ZONE']);
/** Stable 32-bit hash so placement does not depend on iteration order or a random seed. */
function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}
function centroid(footprint: readonly { x: number; z: number }[]): Point {
  let x = 0;
  let z = 0;
  for (const vertex of footprint) {
    x += vertex.x;
    z += vertex.z;
  }
  return { x: x / footprint.length, z: z / footprint.length };
}
function centerline(element: CityPlanarElement): Point[] {
  const half = element.footprintM.length / 2;
  if (element.topology === 'RIBBON' && half >= 2) {
    const points: Point[] = [];
    for (let index = 0; index < half; index += 1) {
      const left = element.footprintM[index]!;
      const right = element.footprintM[element.footprintM.length - 1 - index]!;
      points.push({ x: (left.x + right.x) / 2, z: (left.z + right.z) / 2 });
    }
    return points;
  }
  const footprint = element.footprintM;
  if (footprint.length === 4) {
    // Sidewalk quads are authored as closed rectangles; the two shortest edges are the ends.
    const edges = footprint.map((vertex, index) => {
      const next = footprint[(index + 1) % footprint.length]!;
      return {
        a: vertex,
        b: next,
        length: Math.hypot(next.x - vertex.x, next.z - vertex.z),
      };
    });
    const shortest = [...edges].sort((left, right) => left.length - right.length).slice(0, 2);
    if (shortest.every((edge) => edge.length > 0.2))
      return shortest.map((edge) => ({
        x: (edge.a.x + edge.b.x) / 2,
        z: (edge.a.z + edge.b.z) / 2,
      }));
  }
  return [centroid(footprint)];
}
function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1)
    total += Math.hypot(
      points[index]!.x - points[index - 1]!.x,
      points[index]!.z - points[index - 1]!.z,
    );
  return total;
}
function sample(points: readonly Point[], distanceM: number): { point: Point; heading: number } {
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length === 0) continue;
    if (walked + length >= distanceM || index === points.length - 1) {
      const t = Math.max(0, Math.min(1, (distanceM - walked) / length));
      return {
        point: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t },
        heading: Math.atan2(b.x - a.x, b.z - a.z),
      };
    }
    walked += length;
  }
  const only = points[0] ?? { x: 0, z: 0 };
  return { point: only, heading: 0 };
}
function insidePolygon(point: Point, footprint: readonly { x: number; z: number }[]): boolean {
  let inside = false;
  for (
    let index = 0, previous = footprint.length - 1;
    index < footprint.length;
    previous = index, index += 1
  ) {
    const a = footprint[index]!;
    const b = footprint[previous]!;
    if (
      a.z > point.z !== b.z > point.z &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
}
function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = dx * dx + dz * dz;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length));
  return Math.hypot(point.x - (a.x + t * dx), point.z - (a.z + t * dz));
}
function distanceToFootprint(point: Point, footprint: readonly { x: number; z: number }[]): number {
  if (insidePolygon(point, footprint)) return 0;
  let best = Infinity;
  for (let index = 0; index < footprint.length; index += 1)
    best = Math.min(
      best,
      distanceToSegment(point, footprint[index]!, footprint[(index + 1) % footprint.length]!),
    );
  return best;
}
function clearOfForbidden(
  point: Point,
  radiusM: number,
  forbidden: readonly CityPlanarElement[],
): boolean {
  for (const element of forbidden)
    if (distanceToFootprint(point, element.footprintM) <= radiusM) return false;
  return true;
}
function onAllowed(point: Point, radiusM: number, allowed: readonly CityPlanarElement[]): boolean {
  for (const element of allowed) {
    if (distanceToFootprint(point, element.footprintM) <= radiusM) return true;
    if (insidePolygon(point, element.footprintM)) return true;
  }
  return false;
}
function cellId(x: number, z: number, sizeM: number): string {
  return `${Math.floor(x / sizeM)}:${Math.floor(z / sizeM)}`;
}
function item(
  kind: CityDecorKind,
  x: number,
  z: number,
  rotationY: number,
  cellSizeM: number,
  id: string,
): CityDecorItem {
  return Object.freeze({
    id,
    kind,
    x,
    z,
    rotationY,
    cell: cellId(x, z, cellSizeM),
    radiusM: CLEARANCE[kind].radiusM,
    heightM: CLEARANCE[kind].heightM,
  });
}
/**
 * Deterministic decor plan. Only sidewalk ribbons and the sidewalk nearest a service zone produce
 * items; every candidate is rejected if its clearance circle reaches a lane, marking, junction,
 * crosswalk, stop line or building.
 */
export function createCityDecorPlan(
  layout: CityLayout,
  options: { readonly cellSizeM?: number } = {},
): CityDecorPlan {
  if (!layout || !Array.isArray(layout.elements)) throw new Error('Decor requires a city layout');
  const cellSizeM = options.cellSizeM ?? CITY_DECOR_CELL_SIZE_M;
  if (!Number.isFinite(cellSizeM) || cellSizeM < 20)
    throw new RangeError('Invalid decor cell size');
  const count = Object.fromEntries(CITY_DECOR_KINDS.map((kind) => [kind, 0])) as Record<
    CityDecorKind,
    number
  >;
  const items: CityDecorItem[] = [];
  const forbidden = layout.elements.filter(
    (element): element is CityPlanarElement =>
      element.kind !== 'SIGNAL_HEAD' && FORBIDDEN.includes(element.kind),
  );
  const allowed = layout.elements.filter(
    (element): element is CityPlanarElement =>
      element.kind !== 'SIGNAL_HEAD' && ALLOWED.includes(element.kind),
  );
  const sidewalks = layout.elements.filter(
    (element): element is CityPlanarElement =>
      element.kind === 'SIDEWALK' && element.footprintM.length >= 4,
  );
  const add = (candidate: CityDecorItem): boolean => {
    if (items.length >= 2400) return false;
    if (!clearOfForbidden(candidate, candidate.radiusM, forbidden)) return false;
    if (!onAllowed(candidate, 0.05, allowed)) return false;
    items.push(candidate);
    count[candidate.kind] += 1;
    return true;
  };
  for (const sidewalk of sidewalks) {
    const points = centerline(sidewalk);
    const length = pathLength(points);
    if (length < 12) continue;
    for (const rule of RULES) {
      const seed = 4 + (hash(`${sidewalk.id}:${rule.kind}`) % Math.max(1, rule.spacingM - 8));
      for (let distance = seed; distance <= length - 4; distance += rule.spacingM) {
        const { point, heading } = sample(points, distance);
        const side = hash(`${sidewalk.id}:${rule.kind}:${distance}`) % 2 === 0 ? 1 : -1;
        const x = point.x + Math.cos(heading) * rule.offsetM * side;
        const z = point.z - Math.sin(heading) * rule.offsetM * side;
        add(
          item(
            rule.kind,
            x,
            z,
            heading,
            cellSizeM,
            `decor:${rule.kind}:${sidewalk.id}:${Math.round(distance)}`,
          ),
        );
      }
    }
  }
  // A bus shelter sits on the sidewalk segment closest to each service zone, with two meters.
  const serviceZones = layout.elements.filter(
    (element): element is CityPlanarElement =>
      element.kind === 'SERVICE_ZONE' && element.footprintM.length >= 3,
  );
  for (const zone of serviceZones.slice(0, 8)) {
    const target = centroid(zone.footprintM);
    let best: { point: Point; heading: number; distance: number } | null = null;
    for (const sidewalk of sidewalks) {
      const points = centerline(sidewalk);
      const length = pathLength(points);
      for (let distance = 4; distance <= length - 4; distance += 3) {
        const sample_ = sample(points, distance);
        const away = Math.hypot(sample_.point.x - target.x, sample_.point.z - target.z);
        if (!best || away < best.distance) best = { ...sample_, distance: away };
      }
    }
    if (!best || best.distance > 30) continue;
    add(
      item(
        'bus-shelter',
        best.point.x,
        best.point.z,
        best.heading,
        cellSizeM,
        `decor:bus-shelter:${zone.id}`,
      ),
    );
    for (const offset of [-5.5, 5.5]) {
      const angle = best.heading;
      add(
        item(
          'parking-meter',
          best.point.x + Math.cos(angle) * offset,
          best.point.z - Math.sin(angle) * offset,
          angle,
          cellSizeM,
          `decor:parking-meter:${zone.id}:${offset}`,
        ),
      );
    }
  }
  const cells = [...new Set(items.map((entry) => entry.cell))].sort();
  return Object.freeze({
    version: CITY_DECOR_VERSION,
    cellSizeM,
    items: Object.freeze(items),
    cells: Object.freeze(cells),
    countsByKind: Object.freeze(count),
    sidewalkRibbons: sidewalks.length,
    serviceZones: serviceZones.length,
  });
}
/** Independent clearance/localisation check used by the tests and the probe. */
export function verifyCityDecor(plan: CityDecorPlan, layout: CityLayout): readonly string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const forbidden = layout.elements.filter(
    (element): element is CityPlanarElement =>
      element.kind !== 'SIGNAL_HEAD' && FORBIDDEN.includes(element.kind),
  );
  const allowed = layout.elements.filter(
    (element): element is CityPlanarElement =>
      element.kind !== 'SIGNAL_HEAD' && ALLOWED.includes(element.kind),
  );
  for (const entry of plan.items) {
    if (!entry.id.trim() || ids.has(entry.id)) issues.push(`duplicate/invalid item ${entry.id}`);
    ids.add(entry.id);
    if (entry.cell !== cellId(entry.x, entry.z, plan.cellSizeM))
      issues.push(`${entry.id}: cell mismatch`);
    if (!clearOfForbidden(entry, entry.radiusM, forbidden))
      issues.push(`${entry.id}: clearance intersects traffic geometry`);
    if (!onAllowed(entry, 0.05, allowed)) issues.push(`${entry.id}: outside sidewalk/service zone`);
    if (!Number.isFinite(entry.rotationY)) issues.push(`${entry.id}: invalid rotation`);
  }
  if (!plan.items.length) issues.push('empty decor plan');
  for (const cell of plan.cells)
    if (
      !plan.items.some((entry) => entry.cell === cell) ||
      plan.items
        .filter((entry) => entry.cell === cell)
        .some((entry) => {
          const [ix, iz] = cell.split(':').map(Number) as [number, number];
          return (
            entry.x < ix * plan.cellSizeM ||
            entry.x >= (ix + 1) * plan.cellSizeM ||
            entry.z < iz * plan.cellSizeM ||
            entry.z >= (iz + 1) * plan.cellSizeM
          );
        })
    )
      issues.push(`cell ${cell}: item outside cell bounds`);
  return Object.freeze(issues);
}
function pushBox(
  positions: number[],
  normals: number[],
  indices: number[],
  colors: number[],
  part: Extract<TemplatePart, { type: 'box' }>,
): void {
  const [cx, cy, cz] = part.center;
  const [sx, sy, sz] = part.size;
  const half = [sx / 2, sy / 2, sz / 2] as const;
  const faces = [
    {
      normal: [0, 0, 1],
      corners: [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
    },
    {
      normal: [0, 0, -1],
      corners: [
        [1, -1, -1],
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
      ],
    },
    {
      normal: [1, 0, 0],
      corners: [
        [1, -1, 1],
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
      ],
    },
    {
      normal: [-1, 0, 0],
      corners: [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
      ],
    },
    {
      normal: [0, 1, 0],
      corners: [
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
        [-1, 1, -1],
      ],
    },
    {
      normal: [0, -1, 0],
      corners: [
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1],
      ],
    },
  ] as const;
  for (const face of faces) {
    const start = positions.length / 3;
    for (const corner of face.corners) {
      positions.push(cx + corner[0] * half[0], cy + corner[1] * half[1], cz + corner[2] * half[2]);
      normals.push(face.normal[0], face.normal[1], face.normal[2]);
      colors.push(part.color[0], part.color[1], part.color[2], 1);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
}
function pushCylinder(
  positions: number[],
  normals: number[],
  indices: number[],
  colors: number[],
  part: Extract<TemplatePart, { type: 'cylinder' | 'cone' }>,
  cone: boolean,
): void {
  const segments = part.segments ?? 8;
  const [cx, cy, cz] = part.center;
  // Centered vertical extent: cylinders use the given height, cones taper to a point.
  const bottom = cy - part.height / 2;
  const top = cone ? bottom + part.height : cy + part.height / 2;
  const start = positions.length / 3;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const nx = Math.sin(angle);
    const nz = Math.cos(angle);
    positions.push(cx + nx * part.radius, bottom, cz + nz * part.radius);
    normals.push(nx, 0, nz);
    colors.push(part.color[0], part.color[1], part.color[2], 1);
  }
  const ringTop = positions.length / 3;
  if (cone) {
    positions.push(cx, top, cz);
    normals.push(0, 1, 0);
    colors.push(part.color[0], part.color[1], part.color[2], 1);
    for (let index = 0; index < segments; index += 1)
      indices.push(start + index, start + ((index + 1) % segments), ringTop);
    // Base cap (down).
    const center = positions.length / 3;
    positions.push(cx, bottom, cz);
    normals.push(0, -1, 0);
    colors.push(part.color[0], part.color[1], part.color[2], 1);
    for (let index = 0; index < segments; index += 1)
      indices.push(center, start + index, start + ((index + 1) % segments));
    return;
  }
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const nx = Math.sin(angle);
    const nz = Math.cos(angle);
    positions.push(cx + nx * part.radius, top, cz + nz * part.radius);
    normals.push(nx, 0, nz);
    colors.push(part.color[0], part.color[1], part.color[2], 1);
  }
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    indices.push(
      start + index,
      start + next,
      ringTop + next,
      start + index,
      ringTop + next,
      ringTop + index,
    );
  }
  for (const [y, normal] of [
    [bottom, -1],
    [top, 1],
  ] as const) {
    const center = positions.length / 3;
    positions.push(cx, y, cz);
    normals.push(0, normal, 0);
    colors.push(part.color[0], part.color[1], part.color[2], 1);
    for (let index = 0; index < segments; index += 1)
      if (normal < 0) indices.push(center, start + index, start + ((index + 1) % segments));
      else indices.push(center, ringTop + ((index + 1) % segments), ringTop + index);
  }
}
function templateGeometry(kind: CityDecorKind) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  for (const part of TEMPLATES[kind]) {
    if (part.type === 'box') pushBox(positions, normals, indices, colors, part);
    else pushCylinder(positions, normals, indices, colors, part, part.type === 'cone');
  }
  return { positions, normals, indices, colors };
}
const TEMPLATE_CACHE = new Map<CityDecorKind, ReturnType<typeof templateGeometry>>();
function templateFor(kind: CityDecorKind) {
  const existing = TEMPLATE_CACHE.get(kind);
  if (existing) return existing;
  const built = templateGeometry(kind);
  TEMPLATE_CACHE.set(kind, built);
  return built;
}
/** Merge template copies into one geometry set per spatial cell; no per-item meshes. */
export function buildCityDecorGeometry(plan: CityDecorPlan): readonly CityDecorCellGeometry[] {
  const groups = new Map<
    string,
    { positions: number[]; normals: number[]; indices: number[]; colors: number[] }
  >();
  for (const entry of plan.items) {
    const cell = groups.get(entry.cell) ?? {
      positions: [],
      normals: [],
      indices: [],
      colors: [],
    };
    groups.set(entry.cell, cell);
    const template = templateFor(entry.kind);
    const cos = Math.cos(entry.rotationY);
    const sin = Math.sin(entry.rotationY);
    const offset = cell.positions.length / 3;
    for (let index = 0; index < template.positions.length; index += 3) {
      const x = template.positions[index]!;
      const y = template.positions[index + 1]!;
      const z = template.positions[index + 2]!;
      cell.positions.push(x * cos + z * sin + entry.x, y, -x * sin + z * cos + entry.z);
      const nx = template.normals[index]!;
      const ny = template.normals[index + 1]!;
      const nz = template.normals[index + 2]!;
      cell.normals.push(nx * cos + nz * sin, ny, -nx * sin + nz * cos);
    }
    cell.colors.push(...template.colors);
    for (const index of template.indices) cell.indices.push(offset + index);
  }
  const result: CityDecorCellGeometry[] = [];
  for (const cell of [...groups.keys()].sort()) {
    const geometry = groups.get(cell)!;
    const vertices = geometry.positions.length / 3;
    const indicesCount = geometry.indices.length;
    result.push(
      Object.freeze({
        cell,
        positions: Object.freeze(geometry.positions),
        normals: Object.freeze(geometry.normals),
        colors: Object.freeze(geometry.colors),
        indices: Object.freeze(geometry.indices),
        vertices,
        indicesCount,
        gpuBytes: vertices * CITY_DECOR_VERTEX_BYTES + indicesCount * CITY_DECOR_INDEX_BYTES,
      }),
    );
  }
  return Object.freeze(result);
}
function templateBytes(kind: CityDecorKind): number {
  const template = templateFor(kind);
  return (
    (template.positions.length / 3) * CITY_DECOR_VERTEX_BYTES +
    template.indices.length * CITY_DECOR_INDEX_BYTES
  );
}
export function cityDecorManifest(
  plan: CityDecorPlan,
  options: { readonly criticalCodeTransferBytes?: number } = {},
): AssetBudgetManifest {
  const criticalCodeTransferBytes = options.criticalCodeTransferBytes ?? 0;
  if (!Number.isSafeInteger(criticalCodeTransferBytes) || criticalCodeTransferBytes < 0)
    throw new RangeError('Invalid critical code transfer');
  const assets: BudgetedAsset[] = CITY_DECOR_KINDS.map((kind) =>
    Object.freeze({
      id: `city-decor:${kind}`,
      firstRide: false,
      transferBytes: 0,
      geometryGpuBytes: templateBytes(kind) * plan.countsByKind[kind],
      textureGpuBytes: 0,
      shaderVariants: 0,
    }),
  );
  assets.push(
    Object.freeze({
      id: 'city-decor:materials',
      firstRide: false,
      transferBytes: 0,
      geometryGpuBytes: 0,
      textureGpuBytes: 0,
      shaderVariants: 2,
    }),
  );
  return Object.freeze({
    version: CITY_DECOR_VERSION,
    criticalCodeTransferBytes,
    decoderWasmBytes: 0,
    decoderWorkspaceBytes: 0,
    assets: Object.freeze(assets),
  });
}
export function cityDecorBudget(plan: CityDecorPlan, preset: QualityPreset) {
  return checkAssetManifest(cityDecorManifest(plan), preset);
}
export interface CityDecorInventoryEntry {
  readonly id: string;
  readonly kind: CityDecorKind;
  readonly type: 'PROCEDURAL_MESH';
  readonly version: string;
  readonly role: 'OPTIONAL';
  readonly source: string;
  readonly license: string;
  readonly count: number;
  readonly costBytes: number;
}
const INVENTORY_SOURCE =
  'Original procedural street furniture authored in this repository (PBI 146)';
const INVENTORY_LICENSE = 'Project license — original work, no third-party asset';
export function cityDecorInventory(plan: CityDecorPlan): readonly CityDecorInventoryEntry[] {
  return Object.freeze(
    CITY_DECOR_KINDS.map((kind) =>
      Object.freeze({
        id: `city-decor:${kind}`,
        kind,
        type: 'PROCEDURAL_MESH' as const,
        version: CITY_DECOR_VERSION,
        role: 'OPTIONAL' as const,
        source: INVENTORY_SOURCE,
        license: INVENTORY_LICENSE,
        count: plan.countsByKind[kind],
        costBytes: templateBytes(kind) * plan.countsByKind[kind],
      }),
    ),
  );
}
