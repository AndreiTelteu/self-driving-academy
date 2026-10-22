import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type {
  CityElementKind,
  CityLayout,
  CityPlanarElement,
  CitySignalHeadElement,
} from '../../world';

/**
 * Deterministic Babylon builder for the neighbourhood derived by `createCityLayout`.
 *
 * Ownership is scene-local and disposable: every mesh, material and geometry created here is
 * released by `dispose()`, and no simulation service or map authoring happens in this module.
 * Element geometry is written in absolute map coordinates, so the rendered transform of an element
 * is exactly the layout footprint and can be compared with the map by tests without guessing a
 * pivot. Repeated paint and architecture are merged into one mesh per material; lane surfaces and
 * signal heads stay individual because their identity carries traffic meaning.
 */
export type CityMaterialKey =
  | 'asphalt'
  | 'intersection'
  | 'marking'
  | 'sidewalk'
  | 'curb'
  | 'building'
  | 'service'
  | 'ground'
  | 'housing'
  | 'lampRed'
  | 'lampAmber'
  | 'lampGreen';

export interface CitySceneOptions {
  /** Optional caller-owned materials; listed keys are borrowed and never disposed here. */
  readonly materials?: Partial<Readonly<Record<CityMaterialKey, StandardMaterial>>>;
}

export interface CitySceneStats {
  readonly elements: number;
  readonly meshes: number;
  readonly batches: number;
  readonly individualElements: number;
  readonly mergedElements: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly elementsByKind: Readonly<Record<CityElementKind, number>>;
}

export interface CitySceneResourceCounts {
  readonly meshes: number;
  readonly materials: number;
  readonly geometries: number;
  readonly nodes: number;
}

export interface CityScene {
  readonly root: TransformNode;
  readonly layout: CityLayout;
  readonly stats: CitySceneStats;
  /** Element IDs that produced geometry, in layout order. */
  getRenderedElementIds(): readonly string[];
  /** Mesh created for an element, or null when the element is unknown/disposed. */
  meshFor(elementId: string): Mesh | null;
  /** Lamp mesh of a signal head (null for every other kind). */
  lampFor(elementId: string): Mesh | null;
  getResourceCounts(): CitySceneResourceCounts;
  dispose(): void;
}

interface GeometryBuilder {
  readonly positions: number[];
  readonly indices: number[];
  readonly color: CityMaterialKey;
}

const PALETTE: Readonly<Record<CityMaterialKey, readonly [number, number, number]>> = Object.freeze(
  {
    asphalt: [0.1, 0.11, 0.13],
    intersection: [0.13, 0.14, 0.16],
    marking: [0.96, 0.94, 0.8],
    sidewalk: [0.62, 0.6, 0.56],
    curb: [0.75, 0.74, 0.7],
    building: [0.55, 0.47, 0.4],
    service: [0.16, 0.42, 0.55],
    ground: [0.24, 0.28, 0.2],
    housing: [0.03, 0.035, 0.04],
    lampRed: [1, 0.05, 0.03],
    lampAmber: [1, 0.6, 0.02],
    lampGreen: [0.05, 1, 0.2],
  },
);
const EMISSIVE: readonly CityMaterialKey[] = [
  'marking',
  'service',
  'lampRed',
  'lampAmber',
  'lampGreen',
];
const BUILDERS: readonly CityMaterialKey[] = [
  'asphalt',
  'intersection',
  'marking',
  'sidewalk',
  'curb',
  'building',
  'service',
  'ground',
  'housing',
  'lampRed',
  'lampAmber',
  'lampGreen',
];

type Point = { readonly x: number; readonly y: number; readonly z: number };
const point = (x: number, z: number, y = 0): Point => ({ x, y, z });

/** Signed Y of the triangle normal: positive means the face points up. */
function normalY(a: Point, b: Point, c: Point): number {
  return (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
}
/**
 * Flat quads are oriented upward so a caller material that culls back faces (for example the
 * PBI016 daylight palette) cannot hide the map. Babylon's front face follows the emitted winding.
 */
function pushQuad(builder: GeometryBuilder, corners: readonly Point[], baseY: number): void {
  const start = builder.positions.length / 3;
  for (const corner of corners) builder.positions.push(corner.x, baseY, corner.z);
  const ccw = normalY(corners[0]!, corners[1]!, corners[2]!) <= 0;
  if (ccw) builder.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  else builder.indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
}
/** Ribbon footprints store the left edge forward and the right edge backward. */
function pushRibbon(builder: GeometryBuilder, footprint: readonly Point[], baseY: number): void {
  const half = footprint.length / 2;
  if (footprint.length < 4 || footprint.length % 2 !== 0) {
    pushPolygon(builder, footprint, baseY);
    return;
  }
  for (let index = 0; index < half - 1; index += 1) {
    const left = footprint[index]!;
    const nextLeft = footprint[index + 1]!;
    const right = footprint[footprint.length - 1 - index]!;
    const nextRight = footprint[footprint.length - 2 - index]!;
    pushQuad(builder, [left, nextLeft, nextRight, right], baseY);
  }
}
function pushPolygon(builder: GeometryBuilder, footprint: readonly Point[], baseY: number): void {
  const start = builder.positions.length / 3;
  for (const corner of footprint) builder.positions.push(corner.x, baseY, corner.z);
  const ccw = normalY(footprint[0]!, footprint[1]!, footprint[2]!) <= 0;
  for (let index = 1; index < footprint.length - 1; index += 1)
    if (ccw) builder.indices.push(start, start + index, start + index + 1);
    else builder.indices.push(start, start + index + 1, start + index);
}
function pushPrism(
  builder: GeometryBuilder,
  footprint: readonly Point[],
  baseY: number,
  heightM: number,
): void {
  const top = baseY + heightM;
  const roofStart = builder.positions.length / 3;
  for (const corner of footprint) builder.positions.push(corner.x, top, corner.z);
  const roofCcw = normalY(footprint[0]!, footprint[1]!, footprint[2]!) <= 0;
  for (let index = 1; index < footprint.length - 1; index += 1)
    if (roofCcw) builder.indices.push(roofStart, roofStart + index, roofStart + index + 1);
    else builder.indices.push(roofStart, roofStart + index + 1, roofStart + index);
  const centerX = footprint.reduce((sum, vertex) => sum + vertex.x, 0) / footprint.length;
  const centerZ = footprint.reduce((sum, vertex) => sum + vertex.z, 0) / footprint.length;
  for (let index = 0; index < footprint.length; index += 1) {
    const a = footprint[index]!;
    const b = footprint[(index + 1) % footprint.length]!;
    const start = builder.positions.length / 3;
    builder.positions.push(a.x, baseY, a.z, b.x, baseY, b.z, b.x, top, b.z, a.x, top, a.z);
    // Outward wall normal: away from the footprint centroid.
    const outward =
      -(b.z - a.z) * ((a.x + b.x) / 2 - centerX) + (b.x - a.x) * ((a.z + b.z) / 2 - centerZ);
    if (outward >= 0)
      builder.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    else builder.indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
  }
}
function pushBox(
  builder: GeometryBuilder,
  center: Point,
  size: { readonly x: number; readonly y: number; readonly z: number },
  rotationY: number,
): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const rotate = (x: number, z: number): Point => ({
    x: x * cos + z * sin + center.x,
    y: 0,
    z: -x * sin + z * cos + center.z,
  });
  const halfX = size.x / 2;
  const halfY = size.y / 2;
  const halfZ = size.z / 2;
  const bottom = center.y - halfY;
  const top = center.y + halfY;
  const corners = [
    rotate(-halfX, -halfZ),
    rotate(halfX, -halfZ),
    rotate(halfX, halfZ),
    rotate(-halfX, halfZ),
  ];
  const start = builder.positions.length / 3;
  for (const corner of corners) builder.positions.push(corner.x, bottom, corner.z);
  for (const corner of corners) builder.positions.push(corner.x, top, corner.z);
  const face = (a: number, b: number, c: number, d: number): void => {
    builder.indices.push(start + a, start + b, start + c, start + a, start + c, start + d);
  };
  face(4, 5, 6, 7);
  face(0, 1, 5, 4);
  face(1, 2, 6, 5);
  face(2, 3, 7, 6);
  face(3, 0, 4, 7);
}
function markingCenterline(element: CityPlanarElement): Point[] {
  const half = element.footprintM.length / 2;
  if (element.topology !== 'RIBBON' || half < 2)
    return element.footprintM.map((vertex) => point(vertex.x, vertex.z));
  const line: Point[] = [];
  for (let index = 0; index < half; index += 1) {
    const left = element.footprintM[index]!;
    const right = element.footprintM[element.footprintM.length - 1 - index]!;
    line.push(point((left.x + right.x) / 2, (left.z + right.z) / 2));
  }
  return line;
}
function polylineLength(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1)
    total += Math.hypot(
      points[index]!.x - points[index - 1]!.x,
      points[index]!.z - points[index - 1]!.z,
    );
  return total;
}
function sampleAt(points: readonly Point[], distanceM: number): Point {
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (walked + length >= distanceM || index === points.length - 1) {
      const t = length === 0 ? 0 : Math.max(0, Math.min(1, (distanceM - walked) / length));
      return point(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    }
    walked += length;
  }
  return points[points.length - 1]!;
}
function ribbonBetween(a: Point, b: Point, widthM: number): Point[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (length === 0) return [];
  const nx = (-dz / length) * (widthM / 2);
  const nz = (dx / length) * (widthM / 2);
  return [
    point(a.x + nx, a.z + nz),
    point(b.x + nx, b.z + nz),
    point(b.x - nx, b.z - nz),
    point(a.x - nx, a.z - nz),
  ];
}
function colorForPlanar(element: CityPlanarElement): CityMaterialKey {
  switch (element.kind) {
    case 'INTERSECTION_SURFACE':
      return 'intersection';
    case 'LANE_MARKING':
    case 'STOP_LINE':
    case 'CROSSWALK':
      return 'marking';
    case 'SERVICE_ZONE':
      return 'service';
    case 'GROUND':
      return 'ground';
    case 'SIDEWALK':
      return 'sidewalk';
    case 'CURB':
      return 'curb';
    case 'BUILDING':
      return 'building';
    default:
      return 'asphalt';
  }
}
function pushCrosswalk(builder: GeometryBuilder, element: CityPlanarElement): void {
  const xs = element.footprintM.map((vertex) => vertex.x);
  const zs = element.footprintM.map((vertex) => vertex.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  // Zebra bars run along the vehicle direction and repeat across the band's long axis.
  const axis = element.stripeAxis ?? 'X';
  const longMin = axis === 'X' ? minX : minZ;
  const longMax = axis === 'X' ? maxX : maxZ;
  const span = longMax - longMin;
  const count = Math.max(2, element.stripeCount);
  const pitch = span / count;
  for (let index = 0; index < count; index += 1) {
    const start = longMin + pitch * (index + 0.18);
    const end = start + pitch * 0.64;
    const corners =
      axis === 'X'
        ? [
            point(start, minZ + 0.2),
            point(end, minZ + 0.2),
            point(end, maxZ - 0.2),
            point(start, maxZ - 0.2),
          ]
        : [
            point(minX + 0.2, start),
            point(maxX - 0.2, start),
            point(maxX - 0.2, end),
            point(minX + 0.2, end),
          ];
    pushQuad(builder, corners, element.baseYM);
  }
}
function pushMarking(
  builder: GeometryBuilder,
  element: CityPlanarElement,
  layout: CityLayout,
): void {
  if (element.paint !== 'DASHED') {
    pushRibbon(builder, element.footprintM, element.baseYM);
    return;
  }
  const centerline = markingCenterline(element);
  const total = polylineLength(centerline);
  if (total === 0) return;
  const dash = layout.options.dashLengthM;
  const gap = layout.options.dashGapM;
  for (let start = 0; start < total; start += dash + gap) {
    const end = Math.min(total, start + dash);
    if (end - start < 0.05) continue;
    const quad = ribbonBetween(
      sampleAt(centerline, start),
      sampleAt(centerline, end),
      layout.options.markingWidthM,
    );
    if (quad.length === 4) pushQuad(builder, quad, element.baseYM);
  }
}

/** Scene-local presentation owner; never reads simulation state or mutates the layout. */
export function createCityScene(
  scene: Scene,
  layout: CityLayout,
  options: CitySceneOptions = {},
): CityScene {
  if (!scene || scene.isDisposed) throw new Error('City scene requires a live scene');
  if (!layout || !Array.isArray(layout.elements) || typeof layout.mapId !== 'string')
    throw new Error('City scene requires a derived layout');
  const borrowed = new Map<CityMaterialKey, StandardMaterial>();
  for (const [key, material] of Object.entries(options.materials ?? {})) {
    if (!(key in PALETTE)) throw new Error(`Unknown city material ${key}`);
    if (!material || material.getScene() !== scene)
      throw new Error('City materials must be live and scene-local');
    borrowed.set(key as CityMaterialKey, material);
  }
  const materials = new Map<CityMaterialKey, StandardMaterial>();
  const ownedMaterials: StandardMaterial[] = [];
  for (const key of BUILDERS) {
    const supplied = borrowed.get(key);
    if (supplied) {
      materials.set(key, supplied);
      continue;
    }
    const material = new StandardMaterial(`city:${key}`, scene);
    const rgb = PALETTE[key];
    material.diffuseColor = new Color3(rgb[0], rgb[1], rgb[2]);
    material.specularColor = Color3.Black();
    material.maxSimultaneousLights = 2;
    material.backFaceCulling = false;
    if (EMISSIVE.includes(key)) {
      material.disableLighting = true;
      material.emissiveColor = material.diffuseColor;
    }
    materials.set(key, material);
    ownedMaterials.push(material);
  }
  const root = new TransformNode(`city:${layout.mapId}`, scene);
  const builders = new Map<CityMaterialKey, GeometryBuilder>();
  const builderFor = (color: CityMaterialKey): GeometryBuilder => {
    const existing = builders.get(color);
    if (existing) return existing;
    const created: GeometryBuilder = { positions: [], indices: [], color };
    builders.set(color, created);
    return created;
  };
  const meshes: Mesh[] = [];
  const meshByElement = new Map<string, Mesh>();
  const lampByElement = new Map<string, Mesh>();
  const rendered: string[] = [];
  const kindCounts = new Map<CityElementKind, number>();
  let mergedElements = 0;
  let individualElements = 0;

  const createMesh = (name: string, builder: GeometryBuilder): Mesh => {
    if (builder.positions.length === 0) throw new Error('Empty city geometry');
    const mesh = new Mesh(`city:${name}`, scene);
    const data = new VertexData();
    data.positions = builder.positions;
    data.indices = builder.indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(builder.positions, builder.indices, normals);
    data.normals = normals;
    data.applyToMesh(mesh);
    mesh.material = materials.get(builder.color) ?? null;
    mesh.parent = root;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    meshes.push(mesh);
    return mesh;
  };
  const count = (kind: CityElementKind): void => {
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  };

  // Individual lane surfaces: identity matters for traffic alignment.
  for (const element of layout.elements) {
    if (element.kind !== 'LANE_SURFACE') continue;
    const builder: GeometryBuilder = { positions: [], indices: [], color: 'asphalt' };
    pushRibbon(builder, element.footprintM, element.baseYM);
    meshByElement.set(element.id, createMesh(`lane:${element.laneId ?? element.id}`, builder));
    rendered.push(element.id);
    individualElements += 1;
    count(element.kind);
  }

  // Batched planar elements: one merged mesh per material.
  for (const element of layout.elements) {
    if (element.kind === 'LANE_SURFACE' || element.kind === 'SIGNAL_HEAD') continue;
    const builder = builderFor(colorForPlanar(element));
    if (element.kind === 'BUILDING')
      pushPrism(builder, element.footprintM, element.baseYM, element.heightM);
    else if (element.kind === 'CROSSWALK') pushCrosswalk(builder, element);
    else if (element.kind === 'LANE_MARKING') pushMarking(builder, element, layout);
    else if (element.topology === 'RIBBON') pushRibbon(builder, element.footprintM, element.baseYM);
    else pushPolygon(builder, element.footprintM, element.baseYM);
    mergedElements += 1;
    rendered.push(element.id);
    count(element.kind);
  }

  // Individual signal heads: post + housing plus a lamp mesh carrying the authored state.
  for (const element of layout.elements) {
    if (element.kind !== 'SIGNAL_HEAD') continue;
    const head = element as CitySignalHeadElement;
    const rotationY = Math.atan2(Math.cos(head.facingRad), Math.sin(head.facingRad));
    const housing: GeometryBuilder = { positions: [], indices: [], color: 'housing' };
    pushBox(
      housing,
      point(head.positionM.x, head.positionM.z, head.postHeightM / 2),
      { x: 0.16, y: head.postHeightM, z: 0.16 },
      rotationY,
    );
    pushBox(
      housing,
      point(head.positionM.x, head.positionM.z, head.postHeightM),
      { x: head.housingWidthM, y: head.housingHeightM, z: head.housingDepthM },
      rotationY,
    );
    meshByElement.set(head.id, createMesh(`head:${head.id}`, housing));
    const lampColor: CityMaterialKey =
      head.lampState === 'GREEN'
        ? 'lampGreen'
        : head.lampState === 'YELLOW'
          ? 'lampAmber'
          : 'lampRed';
    const lamp: GeometryBuilder = { positions: [], indices: [], color: lampColor };
    pushBox(
      lamp,
      point(
        head.positionM.x + Math.cos(head.facingRad) * (head.housingDepthM / 2 + 0.02),
        head.positionM.z + Math.sin(head.facingRad) * (head.housingDepthM / 2 + 0.02),
        head.postHeightM + 0.28,
      ),
      { x: 0.28, y: 0.28, z: 0.08 },
      rotationY,
    );
    lampByElement.set(head.id, createMesh(`lamp:${head.id}`, lamp));
    rendered.push(head.id);
    individualElements += 1;
    count(head.kind);
  }

  const batches: Mesh[] = [];
  for (const [color, builder] of [...builders].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (builder.positions.length === 0) continue;
    batches.push(createMesh(`batch:${color}`, builder));
  }
  builders.clear();

  let vertices = 0;
  let triangles = 0;
  for (const mesh of meshes) {
    vertices += mesh.getTotalVertices();
    triangles += mesh.getTotalIndices() / 3;
  }
  const byKind: Record<CityElementKind, number> = {
    LANE_SURFACE: 0,
    LANE_MARKING: 0,
    INTERSECTION_SURFACE: 0,
    STOP_LINE: 0,
    CROSSWALK: 0,
    SIGNAL_HEAD: 0,
    SERVICE_ZONE: 0,
    GROUND: 0,
    SIDEWALK: 0,
    CURB: 0,
    BUILDING: 0,
  };
  for (const [kind, value] of kindCounts) byKind[kind] = value;
  const stats: CitySceneStats = Object.freeze({
    elements: rendered.length,
    meshes: meshes.length,
    batches: batches.length,
    individualElements,
    mergedElements,
    vertices,
    triangles,
    elementsByKind: Object.freeze(byKind),
  });
  let disposed = false;
  return {
    root,
    layout,
    stats,
    getRenderedElementIds: () => Object.freeze([...rendered]),
    meshFor(elementId: string): Mesh | null {
      if (disposed || scene.isDisposed) return null;
      return meshByElement.get(elementId) ?? null;
    },
    lampFor(elementId: string): Mesh | null {
      if (disposed || scene.isDisposed) return null;
      return lampByElement.get(elementId) ?? null;
    },
    getResourceCounts: () => ({
      meshes: disposed ? 0 : meshes.filter((mesh) => !mesh.isDisposed()).length,
      materials: disposed ? 0 : materials.size,
      geometries: disposed ? 0 : meshes.filter((mesh) => !mesh.isDisposed()).length,
      nodes: disposed ? 0 : 1,
    }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const mesh of meshes) if (!mesh.isDisposed()) mesh.dispose(false, false);
      meshes.length = 0;
      meshByElement.clear();
      lampByElement.clear();
      for (const material of ownedMaterials) material.dispose(false, false);
      ownedMaterials.length = 0;
      materials.clear();
      root.dispose(false);
    },
  };
}
