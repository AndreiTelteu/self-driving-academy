import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type {
  CityElementKind,
  CityLayout,
  CityPlanarElement,
  CitySignalHeadElement,
} from '../../world';
import { deriveRoadFill } from '../road-surface';
import {
  planBuildingFacade,
  resolveStyleMap,
  facadeStyleSpec,
  groundFloorKind,
  type FacadeDetail,
  type BuildingFacadePlan,
} from '../building-facades';
import { SURFACE_TILE_M, type SurfaceMaterials } from './surface-materials';

/**
 * Deterministic Babylon builder for the neighbourhood derived by `createCityLayout`.
 *
 * Ownership is scene-local and disposable: every mesh, material and geometry created here is
 * released by `dispose()`, and no simulation service or map authoring happens in this module.
 * Element geometry is written in absolute map coordinates, so the rendered transform of an element
 * is exactly the layout footprint and can be compared with the map by tests without guessing a
 * pivot.
 *
 * Presentation, not identity: repeated paint and architecture are merged into one mesh per
 * material, lane surfaces are merged into a single surface mesh, and the 26 signal heads are thin
 * instances of one unit box per part (post, housing, lamp). The layout keeps every element ID:
 * `elementGeometry` returns the vertex slice of a merged element, `instanceIndexFor` returns the
 * index inside a thin batch, and `elementBounds` returns the same world bounds the per-element
 * meshes used to expose. Instance matrices are authored with the exact position/rotation/scale of
 * the previous baked boxes, so instancing changes the draw calls, not the geometry on screen.
 */
/**
 * PBI 246 — cheile de material ale clădirilor: trei ziduri texturate (cărămidă, tencuială, beton),
 * sticlă reflectorizantă IBL și tâmplărie/cornișe. Le cheamă `surfaces.cityMaterials()` când
 * suprafețele PBR sunt active; altfel clădirile revin la `building` plat.
 */
export type BuildingCityMaterialKey =
  | 'buildingWallBrick'
  | 'buildingWallPlaster'
  | 'buildingWallConcrete'
  | 'buildingGlass'
  | 'buildingGlassLit'
  | 'buildingTrim';

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
  | 'lampGreen'
  | BuildingCityMaterialKey;

export interface CitySceneOptions {
  /** Optional caller-owned materials; listed keys are borrowed and never disposed here. */
  readonly materials?: Partial<Readonly<Record<CityMaterialKey, Material>>>;
  /**
   * PBI 245: materialele PBR ale suprafețelor (asfalt, marcaje, trotuar, bordură, iarbă). Cheile lor
   * sunt împrumutate (proprietarul le îngheață și le eliberează); în plus, dacă `wear` este activ,
   * se adaugă o fâșie de uzură în benzile roților. Fără `surfaces`, orașul folosește materialele
   * `StandardMaterial` plate ca înainte (testele de geometrie rămân rapide).
   */
  readonly surfaces?: SurfaceMaterials;
  /** Urmele de uzură ale roților (numai cu `surfaces`; MEDIUM/HIGH). */
  readonly wearStrips?: boolean;
  /**
   * PBI 246: nivelul de detaliu al fațadelor. LOW = mase netede (ca înainte); MEDIUM = ferestre
   * retrasate, parter distinct, cornișă/parapet; HIGH = + interioare false, grilaje, detalii de
   * acoperiș (AC, ventilație, rezervor). Implicit 'medium'.
   */
  readonly facadeDetail?: FacadeDetail;
}

export interface CitySceneStats {
  readonly elements: number;
  /** Enabled meshes the renderer would submit, i.e. draw calls, not instances. */
  readonly meshes: number;
  readonly drawCalls: number;
  /** Static meshes carrying merged geometry (one per material). */
  readonly batches: number;
  /** Elements merged into a shared mesh. */
  readonly mergedElements: number;
  /** Elements drawn as thin instances of a shared unit box. */
  readonly instancedElements: number;
  readonly thinBatches: number;
  readonly thinInstances: number;
  readonly frozenMaterials: number;
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

/**
 * PBI 246 — lotul unei clădiri: lotul de material are `parts`, iar fiecare parte e o clădire
 * întreagă (slice contiguu, deci `elementBounds`/`elementGeometry` rămân corecte); la `createMesh`
 * părțile se concatenează în ordinea de emitere într-un singur buffer cu un singur material.
 */
interface BuildingBatch {
  readonly key: CityMaterialKey;
  readonly parts: GeometryBuilder[];
  /** Vârfurile emise până acum (offsetul următoarei părți în meshul final). */
  vertexCount: number;
}
interface BuildingEmit {
  readonly wall: GeometryBuilder;
  readonly glass: GeometryBuilder;
  /** 252: geamurile aprinse (submulțime deterministă) au lot propriu, ca să poată emite noaptea. */
  readonly glassLit: GeometryBuilder;
  readonly trim: GeometryBuilder;
}

/** Slice of a merged host mesh that belongs to one layout element, in vertices. */
export interface CityElementGeometry {
  readonly host: Mesh;
  readonly offset: number;
  readonly count: number;
}

export type CitySignalPart = 'post' | 'housing' | 'lamp';

export interface CityScene {
  readonly root: TransformNode;
  readonly layout: CityLayout;
  readonly stats: CitySceneStats;
  /** Element IDs that produced geometry, in layout order. */
  getRenderedElementIds(): readonly string[];
  /** Mesh that carries an element's geometry (a merged batch or a thin-instance host). */
  meshFor(elementId: string): Mesh | null;
  /**
   * PBI 244: meshurile statice care aruncă umbră (clădirile și stâlpii/carcasele semafoarelor).
   * Carosabilul, trotuarul, bordura și terenul doar primesc umbre.
   */
  shadowCasterMeshes(): readonly Mesh[];
  /** PBI 245: meshurile cu material PBR (excluse din lumina de rezervă; vezi `excludeFromLegacyAmbient`). */
  surfaceMeshes(): readonly Mesh[];
  /** Lamp host of a signal head (null for every other kind). */
  lampFor(elementId: string): Mesh | null;
  /** Merged vertex slice of an element, or null for an instanced element. */
  elementGeometry(elementId: string): CityElementGeometry | null;
  /** Index inside the thin batch of a signal part, or null. */
  instanceIndexFor(elementId: string, part: CitySignalPart): number | null;
  /** Thin-instance host that carries a signal part (diagnostics and tests). */
  signalHostFor(elementId: string, part: CitySignalPart): Mesh | null;
  /** World AABB of the element as `[minX, minY, minZ, maxX, maxY, maxZ]`. */
  elementBounds(elementId: string): readonly number[] | null;
  getResourceCounts(): CitySceneResourceCounts;
  /**
   * PBI 252: 0 = zi, 1 = noapte. Aprinde numai ferestrele marcate `lit` de planul 246 (lotul
   * `buildingGlassLit`), nu toată sticla; determinismul planului rămâne sursa.
   */
  setNightFactor(factor: number): void;
  dispose(): void;
}

/**
 * PBI 245 — originea locală a mapării UV pentru un element (trotuarul își începe dalele la colțul lui) și,
 * pentru bordură, axa transversală, ca textura să acopere lățimea de 0,2 m.
 */
interface UvOrigin {
  readonly from: number;
  readonly x: number;
  readonly z: number;
  readonly across: 'x' | 'z' | null;
  readonly acrossMin: number;
  readonly acrossSize: number;
}
interface GeometryBuilder {
  readonly positions: number[];
  readonly indices: number[];
  readonly color: CityMaterialKey;
  readonly origins: UvOrigin[];
  /** PBI 246: culori pe vârf (numai loturile de fațadă); vid = fără atribut color. */
  readonly colors: number[];
}

const PALETTE: Readonly<Record<CityMaterialKey, readonly [number, number, number]>> = Object.freeze(
  {
    asphalt: [0.19, 0.2, 0.22],
    intersection: [0.22, 0.23, 0.25],
    marking: [0.82, 0.8, 0.72],
    sidewalk: [0.62, 0.6, 0.56],
    curb: [0.75, 0.74, 0.7],
    building: [0.55, 0.47, 0.4],
    service: [0.16, 0.42, 0.55],
    ground: [0.24, 0.28, 0.2],
    housing: [0.03, 0.035, 0.04],
    lampRed: [1, 0.05, 0.03],
    lampAmber: [1, 0.6, 0.02],
    lampGreen: [0.05, 1, 0.2],
    // 246: loturi de fațadă — neutru, culoarea reală vine pe vârf (sau din materialul PBR împrumutat).
    buildingWallBrick: [0.62, 0.4, 0.3],
    buildingWallPlaster: [0.78, 0.75, 0.68],
    buildingWallConcrete: [0.6, 0.6, 0.58],
    buildingGlass: [0.3, 0.4, 0.48],
    // 252: ferestrele aprinse au propria bucată, ca emisia de noapte să fie per fereastră.
    buildingGlassLit: [0.62, 0.5, 0.3],
    buildingTrim: [0.7, 0.68, 0.62],
  },
);
// PBI 245: marcajele nu mai sunt emisive (vopsea iluminată normal); rămân emisive zonele de serviciu și lămpile.
const EMISSIVE: readonly CityMaterialKey[] = ['service', 'lampRed', 'lampAmber', 'lampGreen'];
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
  'buildingWallBrick',
  'buildingWallPlaster',
  'buildingWallConcrete',
  'buildingGlass',
  'buildingGlassLit',
  'buildingTrim',
];
/**
 * PBI 242 — offset de adâncime pe material (negativ = mai aproape de cameră). Vezi documentul 30:
 * carosabil/intersecție 0, marcaje și zone de serviciu -2, teren +1 (sub trotuar și clădiri).
 */
export const DEPTH_BIAS: Readonly<
  Partial<Record<CityMaterialKey, Readonly<{ factor: number; units: number }>>>
> = Object.freeze({
  marking: Object.freeze({ factor: -2, units: -2 }),
  service: Object.freeze({ factor: -1, units: -1 }),
  ground: Object.freeze({ factor: 1, units: 1 }),
});
/** Signal head parts share one unit box: post, housing and lamp differ only by matrix. */
const POST_SIZE_M = 0.16;
const LAMP_SIZE = Object.freeze({ x: 0.28, y: 0.28, z: 0.08 });
const LAMP_OFFSET_M = 0.02;
const LAMP_HEIGHT_OFFSET_M = 0.28;

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
/**
 * PBI 246: `pushPrism` (masa oarbă de dinainte de fațade) nu mai este folosit de clădiri; orientarea
 * pereților o moștenesc `pushRect`/`pushBand` (aceeași regulă `outward` ca aici).
 * Perete vertical de la cota 0 la `topM` pe segmentul a→b, cu normala spre `outward` (unitară).
 * Orientarea este verificată prin produsul vectorial, ca la `pushQuad`, nu presupusă.
 */
function pushWall(
  builder: GeometryBuilder,
  a: Point,
  b: Point,
  topM: number,
  outward: { readonly x: number; readonly z: number },
): void {
  const start = builder.positions.length / 3;
  builder.positions.push(a.x, 0, a.z, b.x, 0, b.z, b.x, topM, b.z, a.x, topM, a.z);
  // Normala fețelor (a, b, sus-b): (b − a) × (0,1,0) în sistemul Babylon cu mâna stângă.
  const nx = -(b.z - a.z);
  const nz = b.x - a.x;
  if (nx * outward.x + nz * outward.z >= 0)
    builder.indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
  else builder.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}
/** Muchia dinspre carosabil a unei borduri (latura lungă exterioară a benzii de bordură). */
function curbFace(
  element: CityPlanarElement,
): { a: Point; b: Point; topM: number; outward: { x: number; z: number } } | null {
  const side = element.id.split(':').pop();
  const xs = element.footprintM.map((vertex) => vertex.x);
  const zs = element.footprintM.map((vertex) => vertex.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const topM = element.baseYM;
  switch (side) {
    case 'S':
      return { a: point(minX, minZ), b: point(maxX, minZ), topM, outward: { x: 0, z: -1 } };
    case 'N':
      return { a: point(minX, maxZ), b: point(maxX, maxZ), topM, outward: { x: 0, z: 1 } };
    case 'W':
      return { a: point(minX, minZ), b: point(minX, maxZ), topM, outward: { x: -1, z: 0 } };
    case 'E':
      return { a: point(maxX, minZ), b: point(maxX, maxZ), topM, outward: { x: 1, z: 0 } };
    default:
      return null;
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

// --- 246: emiterea fațadelor ------------------------------------------------------------------------

/**
 * Vârfurile unui dreptunghi pe un perete: `along` de-a lungul peretelui (m), `yOut` = înălțime.
 * `insetM` este pozitiv spre EXTERIOR (piesa iese din perete), negativ = retras în gol.
 * Ordinea muchiilor `sides` mai jos plus învârtirea (0,2,1 / 0,3,2) dau normala spre exterior
 * pentru toate cele patru laturi (aceeași regulă ca `pushPrism`, verificată în shadows.test.ts).
 */
type WallFrame = {
  readonly ax: number; // originea peretelui (vârful footprint-ului)
  readonly az: number;
  readonly dirX: number; // unitar, de-a lungul peretelui
  readonly dirZ: number;
  readonly outX: number; // unitar, spre exterior
  readonly outZ: number;
  readonly baseY: number;
};
const pushRect = (
  builder: GeometryBuilder,
  frame: WallFrame,
  along0: number,
  along1: number,
  y0: number,
  y1: number,
  insetM: number,
  color: readonly [number, number, number],
): void => {
  const start = builder.positions.length / 3;
  const px = frame.ax + frame.dirX * along0 + frame.outX * insetM;
  const pz = frame.az + frame.dirZ * along0 + frame.outZ * insetM;
  const qx = frame.ax + frame.dirX * along1 + frame.outX * insetM;
  const qz = frame.az + frame.dirZ * along1 + frame.outZ * insetM;
  const yb = frame.baseY + y0;
  const yt = frame.baseY + y1;
  builder.positions.push(px, yb, pz, qx, yb, qz, qx, yt, qz, px, yt, pz);
  for (let vertex = 0; vertex < 4; vertex += 1) builder.colors.push(color[0], color[1], color[2]);
  // Orientare verificată matematic (nu presupusă): pentru orice inset, normala (b−a)×(0,1,0)
  // arată spre exterior cu învârtirea (0,2,1) — convenția ComputeNormals, aceeași ca `pushWall`.
  const nx = -(qz - pz);
  const nz = qx - px;
  if (nx * frame.outX + nz * frame.outZ >= 0)
    builder.indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
  else builder.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
};
/** Bandă orizontală (cornișă, parapet, prag): față verticală + capac superior la `insetM`. */
const pushBand = (
  builder: GeometryBuilder,
  frame: WallFrame,
  along0: number,
  along1: number,
  y0: number,
  y1: number,
  insetM: number,
  color: readonly [number, number, number],
): void => {
  pushRect(builder, frame, along0, along1, y0, y1, insetM, color);
  if (insetM === 0) return; // bandă în planul peretelui: fără capac (ar fi degenerat, normala = 0).
  // Capacul orizontal: un quad de la planul peretelui până la muchia exterioară a benzii, normală +Y.
  const start = builder.positions.length / 3;
  const a0x = frame.ax + frame.dirX * along0;
  const a0z = frame.az + frame.dirZ * along0;
  const a1x = frame.ax + frame.dirX * along1;
  const a1z = frame.az + frame.dirZ * along1;
  const top = frame.baseY + y1;
  builder.positions.push(
    a0x,
    top,
    a0z,
    a1x,
    top,
    a1z,
    a1x + frame.outX * insetM,
    top,
    a1z + frame.outZ * insetM,
    a0x + frame.outX * insetM,
    top,
    a0z + frame.outZ * insetM,
  );
  for (let vertex = 0; vertex < 4; vertex += 1) builder.colors.push(color[0], color[1], color[2]);
  // Ordinea depinde de semnul lui insetM: capacul trebuie să aibă normala +Y.
  if (insetM > 0) builder.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  else builder.indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
};

/** PBI 246: emite fațadele unei clădiri în loturile de zid/sticlă/tâmplărie (culori pe vârf). */
function emitBuildingFacades(
  element: CityPlanarElement,
  plan: BuildingFacadePlan,
  detail: FacadeDetail,
  wallBuilder: GeometryBuilder,
  glassBuilder: GeometryBuilder,
  glassLitBuilder: GeometryBuilder,
  trimBuilder: GeometryBuilder,
): void {
  const xs = element.footprintM.map((vertex) => vertex.x);
  const zs = element.footprintM.map((vertex) => vertex.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const baseY = element.baseYM;
  const topY = baseY + element.heightM;
  const palette = plan.palette;
  const wallColor = palette.wall;
  const trimColor = palette.trim;
  const glassLit: readonly [number, number, number] = [0.62, 0.5, 0.3];
  const sillOut = 0.04; // pragul iese 4 cm din fațadă
  const glassInset = -0.14; // sticla retrasă în gol (negativ = spre interior)

  // Laturile footprint-ului (cvadrilater 042): 0=S (minZ), 1=E (maxX), 2=N (maxZ), 3=W (minX).
  const sides = [
    { a: point(minX, minZ), b: point(maxX, minZ), out: { x: 0, z: -1 } },
    { a: point(maxX, minZ), b: point(maxX, maxZ), out: { x: 1, z: 0 } },
    { a: point(maxX, maxZ), b: point(minX, maxZ), out: { x: 0, z: 1 } },
    { a: point(minX, maxZ), b: point(minX, minZ), out: { x: -1, z: 0 } },
  ] as const;

  for (const wallPlan of plan.walls) {
    const side = sides[wallPlan.side];
    if (!side) continue;
    const dx = side.b.x - side.a.x;
    const dz = side.b.z - side.a.z;
    const length = Math.hypot(dx, dz) || 1;
    const frame: WallFrame = {
      ax: side.a.x,
      az: side.a.z,
      dirX: dx / length,
      dirZ: dz / length,
      outX: side.out.x,
      outZ: side.out.z,
      baseY,
    };
    // Golurile pe acest perete, sortate pe verticală apoi orizontal: ferestrele planului.
    const openings = [...wallPlan.windows].sort((p, q) =>
      p.yBaseM === q.yBaseM ? p.alongM - q.alongM : p.yBaseM - q.yBaseM,
    );
    if (detail === 'low' || openings.length === 0) {
      // LOW sau perete orb: peretele întreg, culoarea stilului.
      pushRect(wallBuilder, frame, 0, wallPlan.lengthM, 0, element.heightM, 0, wallColor);
      continue;
    }
    // Zid + ferestre retrasate: zidul rămâne pe planul fațadei; ferestrele sunt dreptunghiuri
    // de sticlă retrase, cu tâmplărie (prag + montanți) pe lotul de trim.
    const wallTop = element.heightM;
    const visible = openings
      .map((win) => ({
        a0: Math.max(0, win.alongM - win.widthM / 2),
        a1: Math.min(wallPlan.lengthM, win.alongM + win.widthM / 2),
        y0: win.yBaseM,
        y1: Math.min(win.yBaseM + win.heightM, wallTop),
        lit: win.lit,
      }))
      .filter((win) => win.a1 - win.a0 > 0.05 && win.y1 - win.y0 > 0.05 && win.y0 < wallTop - 0.02)
      .sort((p, q) => (p.y0 === q.y0 ? p.a0 - q.a0 : p.y0 - q.y0));
    // Zidul se emite o dată pe rând: o bandă continuă, cu goluri numai la ferestrele rândului.
    // Rosturile dintre rânduri și marginile peretelui rămân zid plin, deci nu există fisuri.
    let rowBottom = 0;
    const rows = [...new Set(visible.map((win) => win.y0))].sort((a, b) => a - b);
    for (const rowY of rows) {
      if (rowY > rowBottom + 0.02)
        pushRect(wallBuilder, frame, 0, wallPlan.lengthM, rowBottom, rowY, 0, wallColor);
      const rowWindows = visible.filter((win) => win.y0 === rowY);
      let cursor = 0;
      for (const win of rowWindows) {
        if (win.a0 > cursor + 0.02)
          pushRect(wallBuilder, frame, cursor, win.a0, rowY, win.y1, 0, wallColor);
        cursor = Math.max(cursor, win.a1);
        // Sticla retrasă + tâmplăria. Ferestrele aprinse merg în lotul lor (252).
        pushRect(
          win.lit ? glassLitBuilder : glassBuilder,
          frame,
          win.a0,
          win.a1,
          win.y0,
          win.y1,
          glassInset,
          win.lit ? glassLit : palette.glass,
        );
        pushBand(
          trimBuilder,
          frame,
          win.a0 - sillOut,
          win.a1 + sillOut,
          Math.max(0.02, win.y0 - 0.1),
          win.y0,
          sillOut,
          trimColor,
        );
        pushRect(
          trimBuilder,
          frame,
          win.a0 - sillOut,
          win.a1 + sillOut,
          win.y1,
          win.y1 + 0.08,
          0,
          trimColor,
        );
        pushRect(trimBuilder, frame, win.a0 - 0.05, win.a0 + 0.02, win.y0, win.y1, 0.04, trimColor);
        pushRect(trimBuilder, frame, win.a1 - 0.02, win.a1 + 0.05, win.y0, win.y1, 0.04, trimColor);
        if (plan.mullions) {
          const mid = (win.a0 + win.a1) / 2;
          pushRect(trimBuilder, frame, mid - 0.025, mid + 0.025, win.y0, win.y1, 0.05, trimColor);
          const midY = (win.y0 + win.y1) / 2;
          pushRect(trimBuilder, frame, win.a0, win.a1, midY - 0.02, midY + 0.02, 0.05, trimColor);
        }
      }
      if (cursor < wallPlan.lengthM - 0.02)
        pushRect(
          wallBuilder,
          frame,
          cursor,
          wallPlan.lengthM,
          rowY,
          rowWindows[0]!.y1,
          0,
          wallColor,
        );
      rowBottom = rowWindows[0]!.y1;
    }
    if (rowBottom < wallTop - 0.02)
      pushRect(wallBuilder, frame, 0, wallPlan.lengthM, rowBottom, wallTop, 0, wallColor);
    // Cornișă în consolă la coroană (iese din fațadă) sau parapet pe muchia acoperișului.
    // (`detail === 'low'` nu ajunge aici: peretele orb a ieșit deja din buclă.)
    if (plan.cornice) {
      pushBand(
        trimBuilder,
        frame,
        0,
        wallPlan.lengthM,
        element.heightM - 0.35,
        element.heightM - 0.1,
        0.18,
        trimColor,
      );
    } else if (plan.parapetHeightM > 0) {
      pushBand(
        trimBuilder,
        frame,
        0,
        wallPlan.lengthM,
        element.heightM,
        element.heightM + plan.parapetHeightM,
        0,
        wallColor,
      );
    }
  }

  // Acoperișul: placă la `topY` (culoare de zid întunecată) + detalii (AC, ventilație, rezervor).
  const roofColor: readonly [number, number, number] = [
    wallColor[0] * 0.55,
    wallColor[1] * 0.55,
    wallColor[2] * 0.55,
  ];
  const roofStart = wallBuilder.positions.length / 3;
  const roofQuad = [point(minX, minZ), point(maxX, minZ), point(maxX, maxZ), point(minX, maxZ)];
  for (const corner of roofQuad) wallBuilder.positions.push(corner.x, topY, corner.z);
  for (let vertex = 0; vertex < 4; vertex += 1)
    wallBuilder.colors.push(roofColor[0], roofColor[1], roofColor[2]);
  // Placa de acoperiș: footprint-ul 042 este [minX/minZ, maxX/minZ, maxX/maxZ, minX/maxZ] (CCW);
  // fața din față în Babylon este cea cu învârtirea orară, deci ordinea directă dă normala +Y.
  wallBuilder.indices.push(
    roofStart,
    roofStart + 1,
    roofStart + 2,
    roofStart,
    roofStart + 2,
    roofStart + 3,
  );
  if (detail !== 'low') {
    for (const unit of plan.roofDetails) {
      const color = palette.trim;
      pushBox(
        trimBuilder,
        point(centerX + unit.offsetX, centerZ + unit.offsetZ, topY + unit.heightM / 2),
        { x: unit.sizeXM, y: unit.heightM, z: unit.sizeZM },
        0,
      );
      // `pushBox` nu scrie culori: le completăm aici, ca lotul să aibă atributul complet.
      for (let vertex = 0; vertex < 8; vertex += 1)
        trimBuilder.colors.push(color[0], color[1], color[2]);
    }
  }
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
const NO_ORIGIN: UvOrigin = Object.freeze({
  from: 0,
  x: 0,
  z: 0,
  across: null,
  acrossMin: 0,
  acrossSize: 1,
});
/** Dimensiunea dalei (m) a texturii fiecărui material; cele fără textură folosesc 4 m. */
function uvTileM(color: CityMaterialKey): number {
  switch (color) {
    case 'asphalt':
    case 'intersection':
      return SURFACE_TILE_M.asphalt;
    case 'marking':
      return SURFACE_TILE_M.marking;
    case 'sidewalk':
      return SURFACE_TILE_M.sidewalk;
    case 'ground':
      return SURFACE_TILE_M.ground;
    case 'buildingWallBrick':
    case 'buildingWallPlaster':
    case 'buildingWallConcrete':
      return SURFACE_TILE_M.facadeWall;
    default:
      return 4;
  }
}
/**
 * PBI 245 — UV-uri în coordonate de lume: metri / dimensiunea dalei, deci textura nu se întinde pe o
 * suprafață mare și nu apare repetiția evidentă a unei dale mari întinse. Fețele orizontale se mapează
 * pe (x, z); pereții (normala aproape orizontală) pe (distanța de-a lungul peretelui, y). Vârfurile nu sunt
 * partajate între fețe, deci normala vârfului este cea a fețe.
 *
 * Trotuarul își pornește dalele la colțul elementului (rosturile cad pe marginea trotuarului); bordura
 * mapează lățimea elementului pe întreaga lățime a texturii (teșitura de pe ambele muchii) și rosturile
 * se repetă la 1,5 m pe lungime.
 */
function surfaceUvs(
  builder: GeometryBuilder,
  positions: readonly number[],
  normals: readonly number[],
): number[] {
  const count = positions.length / 3;
  const uvs = new Array<number>(count * 2);
  const origins = builder.origins;
  const tile = uvTileM(builder.color);
  let active = -1;
  for (let vertex = 0; vertex < count; vertex += 1) {
    while (active + 1 < origins.length && origins[active + 1]!.from <= vertex) active += 1;
    const origin = active >= 0 ? origins[active]! : NO_ORIGIN;
    const x = positions[vertex * 3]!;
    const y = positions[vertex * 3 + 1]!;
    const z = positions[vertex * 3 + 2]!;
    const nx = normals[vertex * 3]!;
    const nz = normals[vertex * 3 + 2]!;
    const wall = Math.abs(normals[vertex * 3 + 1]!) < 0.5;
    const alongIsX = Math.abs(nx) < Math.abs(nz);
    let u: number;
    let v: number;
    if (builder.color === 'curb') {
      const along = SURFACE_TILE_M.curbAlong;
      if (wall) {
        u = 0.3 + 1.5 * y;
        v = (alongIsX ? x : z) / along;
      } else if (origin.across) {
        u = ((origin.across === 'x' ? x : z) - origin.acrossMin) / origin.acrossSize;
        v = (origin.across === 'x' ? z : x) / along;
      } else {
        u = 0.5;
        v = (x + z) / along;
      }
    } else if (wall) {
      u = (alongIsX ? x - origin.x : z - origin.z) / tile;
      v = y / tile;
    } else {
      u = (x - origin.x) / tile;
      v = (z - origin.z) / tile;
    }
    uvs[vertex * 2] = u;
    uvs[vertex * 2 + 1] = v;
  }
  return uvs;
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
  const borrowed = new Map<CityMaterialKey, Material>();
  const surfaceMaterials = options.surfaces?.cityMaterials() ?? {};
  const supplied = { ...surfaceMaterials, ...(options.materials ?? {}) };
  for (const [key, material] of Object.entries(supplied)) {
    if (!(key in PALETTE)) throw new Error(`Unknown city material ${key}`);
    if (!material || material.getScene() !== scene)
      throw new Error('City materials must be live and scene-local');
    borrowed.set(key as CityMaterialKey, material);
  }
  const materials = new Map<CityMaterialKey, Material>();
  const ownedMaterials: StandardMaterial[] = [];
  for (const key of BUILDERS) {
    const lent = borrowed.get(key);
    if (lent) {
      materials.set(key, lent);
      continue;
    }
    const material = new StandardMaterial(`city:${key}`, scene);
    const rgb = PALETTE[key];
    material.diffuseColor = new Color3(rgb[0], rgb[1], rgb[2]);
    material.specularColor = Color3.Black();
    material.maxSimultaneousLights = 2;
    material.backFaceCulling = false;
    // 246: loturile de fațadă poartă culoarea stilului pe vârf; diffuseColor rămâne multiplicatorul.
    if (key.startsWith('buildingWall') || key === 'buildingGlass' || key === 'buildingTrim') {
      material.diffuseColor = Color3.White();
      material.specularColor =
        key === 'buildingGlass' ? new Color3(0.35, 0.35, 0.35) : Color3.Black();
    }
    // PBI 242: ordinea pe verticală se păstrează cu offset de adâncime (polygon offset / depth bias),
    // nu cu înălțimi alese pe ochi. Pe tot lanțul 0 (carosabil) < 0,015 (treceri) < 0,02 (marcaje)
    // cotele rămân cele ale lui 042; offsetul garantează că marcajul câștigă și când rezoluția
    // depth buffer-ului la distanță depășește cei 2 cm, iar terenul de sub trotuar pierde.
    const bias = DEPTH_BIAS[key];
    if (bias) {
      material.zOffset = bias.factor;
      material.zOffsetUnits = bias.units;
    }
    if (EMISSIVE.includes(key)) {
      material.disableLighting = true;
      material.emissiveColor = material.diffuseColor;
    }
    materials.set(key, material);
    ownedMaterials.push(material);
  }
  const root = new TransformNode(`city:${layout.mapId}`, scene);
  const newBuilder = (color: CityMaterialKey): GeometryBuilder => ({
    positions: [],
    indices: [],
    color,
    origins: [],
    colors: [],
  });
  const builders = new Map<CityMaterialKey, GeometryBuilder>();
  const builderFor = (color: CityMaterialKey): GeometryBuilder => {
    const existing = builders.get(color);
    if (existing) return existing;
    const created = newBuilder(color);
    builders.set(color, created);
    return created;
  };
  /** PBI 246: loturile de fațadă păstrează fiecare clădire contiguu (slice = clădirea întreagă). */
  const buildingBatches = new Map<CityMaterialKey, BuildingBatch>();
  const buildingEmitFor = (
    wallKey: CityMaterialKey,
    glassKey: CityMaterialKey,
    glassLitKey: CityMaterialKey,
    trimKey: CityMaterialKey,
  ): BuildingEmit => {
    const part = (key: CityMaterialKey): GeometryBuilder => {
      const batch = buildingBatches.get(key) ?? { key, parts: [], vertexCount: 0 };
      if (!buildingBatches.has(key)) buildingBatches.set(key, batch);
      const builder = newBuilder(key);
      batch.parts.push(builder);
      return builder;
    };
    return {
      wall: part(wallKey),
      glass: part(glassKey),
      glassLit: part(glassLitKey),
      trim: part(trimKey),
    };
  };
  /** PBI 246: lotul de zid al stilului (cărămidă/tencuială/beton PBR) sau `building` plat. */
  const wallKeyFor = (material: 'brick' | 'plaster' | 'concrete'): CityMaterialKey => {
    const key: CityMaterialKey =
      material === 'brick'
        ? 'buildingWallBrick'
        : material === 'plaster'
          ? 'buildingWallPlaster'
          : 'buildingWallConcrete';
    return borrowed.has(key) ? key : 'building';
  };
  const meshes: Mesh[] = [];
  const hostByMaterial = new Map<CityMaterialKey, Mesh>();
  const mergedRanges = new Map<string, { key: CityMaterialKey; offset: number; count: number }>();
  const headInstances = new Map<
    string,
    {
      post: number;
      housing: number;
      lamp: number;
      lampColor: CityMaterialKey;
      lampHost: Mesh;
      housingHost: Mesh;
    }
  >();
  const rendered: string[] = [];
  const kindCounts = new Map<CityElementKind, number>();
  let mergedElements = 0;
  let instancedElements = 0;

  const applyGeometry = (
    mesh: Mesh,
    positions: readonly number[],
    indices: readonly number[],
    uvBuilder?: GeometryBuilder,
    colors?: readonly number[],
  ) => {
    const data = new VertexData();
    data.positions = [...positions];
    data.indices = [...indices];
    const normals: number[] = [];
    VertexData.ComputeNormals(data.positions, data.indices, normals);
    data.normals = normals;
    if (uvBuilder) data.uvs = surfaceUvs(uvBuilder, positions, normals);
    // 246: loturile de fațadă poartă culoarea stilului pe vârf (parțial = lipsă = alb).
    if (colors && colors.length > 0) {
      const full = new Array<number>(positions.length).fill(1);
      for (let index = 0; index < colors.length; index += 1) full[index] = colors[index]!;
      data.colors = full;
    }
    data.applyToMesh(mesh);
  };
  const createMesh = (name: string, builder: GeometryBuilder): Mesh => {
    if (builder.positions.length === 0) throw new Error('Empty city geometry');
    const mesh = new Mesh(`city:${name}`, scene);
    applyGeometry(
      mesh,
      builder.positions,
      builder.indices,
      builder,
      builder.colors.length > 0 ? builder.colors : undefined,
    );
    mesh.material = materials.get(builder.color) ?? null;
    mesh.parent = root;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    meshes.push(mesh);
    return mesh;
  };
  /** PBI 246: lotul de fațadă = concatenarea părților (fiecare parte o clădire, slice contiguu). */
  const createBuildingMesh = (name: string, batch: BuildingBatch): Mesh => {
    const merged = newBuilder(batch.key);
    for (const part of batch.parts) {
      // 252: geamurile aprinse există numai pe HIGH; pe MEDIUM lotul lor rămâne gol și nu se emite.
      if (part.positions.length === 0) continue;
      const offset = merged.positions.length / 3;
      merged.positions.push(...part.positions);
      merged.colors.push(...part.colors);
      for (const index of part.indices) merged.indices.push(index + offset);
    }
    return createMesh(name, merged);
  };
  /** Thin-instance host: one shared unit box, per-instance matrices, never a per-element mesh. */
  const createHost = (name: string, material: Material, matrices: readonly Matrix[]) => {
    const unit: GeometryBuilder = newBuilder('housing');
    pushBox(unit, point(0, 0, 0), { x: 1, y: 1, z: 1 }, 0);
    const mesh = new Mesh(`city:${name}`, scene);
    applyGeometry(mesh, unit.positions, unit.indices);
    mesh.material = material;
    mesh.parent = root;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    if (matrices.length === 0) throw new Error('Empty city instance batch');
    const buffer = new Float32Array(matrices.length * 16);
    matrices.forEach((matrix, index) => matrix.copyToArray(buffer, index * 16));
    mesh.thinInstanceSetBuffer('matrix', buffer, 16, true);
    mesh.thinInstanceRefreshBoundingInfo(true);
    meshes.push(mesh);
    return mesh;
  };
  const count = (kind: CityElementKind): void => {
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  };
  const record = (elementId: string, builder: GeometryBuilder, from: number): void => {
    mergedRanges.set(elementId, {
      key: builder.color,
      offset: from,
      count: builder.positions.length / 3 - from,
    });
  };
  /** 246: slice-ul unei clădiri într-un lot de fațadă — offset cumulat + lungimea propriei părți. */
  const recordBuildingSlice = (
    elementId: string,
    batchKey: CityMaterialKey,
    offset: number,
    count: number,
  ): void => {
    mergedRanges.set(elementId, { key: batchKey, offset, count });
  };

  // Lane surfaces are merged into the asphalt batch: the identity that matters for traffic is the
  // element ID and its vertex slice, not a mesh per lane.
  for (const element of layout.elements) {
    if (element.kind !== 'LANE_SURFACE') continue;
    const builder = builderFor('asphalt');
    const from = builder.positions.length / 3;
    pushRibbon(builder, element.footprintM, element.baseYM);
    record(element.id, builder, from);
    rendered.push(element.id);
    mergedElements += 1;
    count(element.kind);
  }
  // PBI 242: rosturile dintre benzi (mediana de 0,8 m, intervalul de 0,3 m dintre benzile unei
  // artere) sunt umplute cu asfalt în același batch, la aceeași cotă și fără suprapunere cu benzile,
  // deci nu apare nici z-fighting, nici `clearColor` sub marcajul axial. Fâșiile nu sunt elemente
  // ale lumii: nu au slice înregistrat și nu intră în `rendered`.
  const roadFill = deriveRoadFill(layout);
  for (const strip of roadFill.strips)
    pushQuad(builderFor('asphalt'), strip.footprintM, strip.baseYM);

  // PBI 242, cauza a doua a dungii de cer: trotuarul (0,14 m), bordura (0,16 m) și terenul (0,06 m)
  // sunt plăci plate peste carosabilul de la cota 0, iar layout-ul nu are fața verticală a bordurii.
  // Un fascicul razant dinspre stradă trece prin crăpătura de la marginea carosabilului pe sub plăci
  // și ajunge la `clearColor` (verificat prin ray-cast în `tests/rendering/curb-faces.test.ts`).
  // Fața bordurii este geometrie de prezentare (nu element al lumii) și folosește materialul bordurii.
  for (const element of layout.elements) {
    if (element.kind !== 'CURB') continue;
    const face = curbFace(element);
    if (face) pushWall(builderFor('curb'), face.a, face.b, face.topM, face.outward);
  }
  // Colțurile blocului: trotuarele N/S acoperă colțul pe toată adâncimea lor (2,4 m), iar bordurile
  // E/V se opresc înaintea lui, deci capetele benzilor N/S au nevoie de câte un perete (la cota
  // trotuarului, plus cota bordurii pe fâșia ei de 0,2 m), altfel colțul lasă o crăpătură spre cer.
  for (const candidate of layout.elements) {
    if (candidate.kind !== 'SIDEWALK') continue;
    const element = candidate as CityPlanarElement;
    const side = element.id.split(':').pop();
    if (side !== 'N' && side !== 'S') continue;
    const xs = element.footprintM.map((vertex) => vertex.x);
    const zs = element.footprintM.map((vertex) => vertex.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const curb = layout.elements.find(
      (candidate) =>
        candidate.kind === 'CURB' && candidate.id === element.id.replace('walk:', 'curb:'),
    ) as CityPlanarElement | undefined;
    const builder = builderFor('curb');
    for (const [x, outwardX] of [
      [minX, -1],
      [maxX, 1],
    ] as const) {
      pushWall(builder, point(x, minZ), point(x, maxZ), element.baseYM, { x: outwardX, z: 0 });
      if (curb) {
        const curbZs = curb.footprintM.map((vertex) => vertex.z);
        pushWall(
          builder,
          point(x, Math.min(...curbZs)),
          point(x, Math.max(...curbZs)),
          curb.baseYM,
          {
            x: outwardX,
            z: 0,
          },
        );
      }
    }
  }

  // PBI 246: planurile de fațadă se rezolvă o singură dată pe scenă (stiluri anti-repetiție pe
  // vecini, parterul din clasa benzii celei mai apropiate). La LOW nu se emit detalii.
  const facadeDetail: FacadeDetail = options.facadeDetail ?? 'medium';
  const buildingIds = layout.elements
    .filter((element) => element.kind === 'BUILDING')
    .map((element) => element.id);
  const styleMap = resolveStyleMap(layout.mapId, buildingIds);
  const arterialCount = layout.lanes.filter((lane) => lane.roadClass === 'ARTERIAL').length;
  const lanePoint = (index: number): { x: number; z: number } => {
    const surface = layout.elements.find(
      (element) => element.id === layout.lanes[index]!.surfaceElementId,
    ) as CityPlanarElement | undefined;
    if (!surface) return { x: 0, z: 0 };
    const xs = surface.footprintM.map((vertex) => vertex.x);
    const zs = surface.footprintM.map((vertex) => vertex.z);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      z: (Math.min(...zs) + Math.max(...zs)) / 2,
    };
  };

  // Batched planar elements: one merged mesh per material.
  for (const element of layout.elements) {
    if (element.kind === 'LANE_SURFACE' || element.kind === 'SIGNAL_HEAD') continue;
    let builder: GeometryBuilder;
    let from: number;
    let buildingParts: readonly GeometryBuilder[] | null = null;
    if (element.kind === 'BUILDING') {
      const planar = element as CityPlanarElement;
      const fpx = planar.footprintM.map((vertex) => vertex.x);
      const fpz = planar.footprintM.map((vertex) => vertex.z);
      const center = {
        x: (Math.min(...fpx) + Math.max(...fpx)) / 2,
        z: (Math.min(...fpz) + Math.max(...fpz)) / 2,
      };
      const ground = groundFloorKind(center, layout.lanes, lanePoint, arterialCount);
      const styleId = styleMap.get(element.id) ?? 'brickClassic';
      const style = facadeStyleSpec(styleId);
      const plan = planBuildingFacade(planar, style, ground, facadeDetail);
      const wallKey = wallKeyFor(plan.material);
      const glassKey: CityMaterialKey = borrowed.has('buildingGlass')
        ? 'buildingGlass'
        : 'building';
      const glassLitKey: CityMaterialKey = borrowed.has('buildingGlassLit')
        ? 'buildingGlassLit'
        : glassKey;
      const trimKey: CityMaterialKey = borrowed.has('buildingTrim') ? 'buildingTrim' : 'building';
      const emit = buildingEmitFor(wallKey, glassKey, glassLitKey, trimKey);
      builder = emit.wall;
      // 246: pe orice lot (plat sau PBR) fiecare clădire este o parte contiguă; offsetul slice-ului
      // este cumulatul vârfurilor emise până la ea în lot (nu poziția din partea ei, mereu 0).
      // La fallback toate cele trei părți (zid/sticlă/tâmplărie) cad în același lot, deci toate
      // consumă vârfuri din același buffer, în ordinea zid → sticlă → tâmplărie.
      const batch = buildingBatches.get(wallKey)!;
      from = batch.vertexCount;
      emitBuildingFacades(
        planar,
        plan,
        facadeDetail,
        emit.wall,
        emit.glass,
        emit.glassLit,
        emit.trim,
      );
      buildingParts = [emit.wall, emit.glass, emit.glassLit, emit.trim];
      for (const part of buildingParts)
        if (part.color === wallKey) batch.vertexCount += part.positions.length / 3;
    } else {
      builder = builderFor(colorForPlanar(element));
      from = builder.positions.length / 3;
      if (element.kind === 'CROSSWALK') pushCrosswalk(builder, element);
      else if (element.kind === 'LANE_MARKING') pushMarking(builder, element, layout);
      else if (element.topology === 'RIBBON')
        pushRibbon(builder, element.footprintM, element.baseYM);
      else pushPolygon(builder, element.footprintM, element.baseYM);
    }
    if (element.kind === 'SIDEWALK' || element.kind === 'CURB') {
      const footprint = (element as CityPlanarElement).footprintM;
      const xs = footprint.map((vertex) => vertex.x);
      const zs = footprint.map((vertex) => vertex.z);
      const minX = Math.min(...xs);
      const minZ = Math.min(...zs);
      const sizeX = Math.max(...xs) - minX;
      const sizeZ = Math.max(...zs) - minZ;
      const across = sizeX <= sizeZ ? 'x' : 'z';
      builder.origins.push({
        from,
        x: minX,
        z: minZ,
        across,
        acrossMin: across === 'x' ? minX : minZ,
        acrossSize: Math.max(1e-3, across === 'x' ? sizeX : sizeZ),
      });
    }
    if (element.kind === 'BUILDING') {
      // La fallback toate cele trei părți sunt în același lot (slice = suma lor); altfel numai zidul.
      let sliceCount = 0;
      for (const part of buildingParts ?? [])
        if (part.color === builder.color) sliceCount += part.positions.length / 3;
      recordBuildingSlice(element.id, builder.color, from, sliceCount);
    } else record(element.id, builder, from);
    mergedElements += 1;
    rendered.push(element.id);
    count(element.kind);
  }

  const batches: Mesh[] = [];
  // 246: întâi loturile de fațadă (o clădire = o parte contiguă), apoi loturile simple.
  for (const [key, batch] of [...buildingBatches].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    // Pe LOW nu există ferestre: loturile de sticlă/tâmplărie rămân goale și nu se emit deloc.
    if (batch.parts.every((part) => part.positions.length === 0)) continue;
    const mesh = createBuildingMesh(`batch:${key}`, batch);
    hostByMaterial.set(key, mesh);
    batches.push(mesh);
  }
  for (const [color, builder] of [...builders].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (builder.positions.length === 0) continue;
    const mesh = createMesh(`batch:${color}`, builder);
    hostByMaterial.set(color, mesh);
    batches.push(mesh);
  }
  builders.clear();

  // PBI 245: urmele de uzură ale roților — două fâșii de 0,5 m pe fiecare bandă, la ±0,82 m de axă
  // (ecartamentul unei mașini ~1,6 m), cu alpha blend peste asfalt; numai MEDIUM/HIGH.
  let wearMesh: Mesh | null = null;
  const wearMaterial = options.surfaces?.materials.wear;
  if (options.wearStrips && wearMaterial) {
    const wearPositions: number[] = [];
    const wearUvs: number[] = [];
    const wearIndices: number[] = [];
    for (const element of layout.elements) {
      if (element.kind !== 'LANE_SURFACE' || element.topology !== 'RIBBON') continue;
      const line = markingCenterline(element);
      if (line.length < 2) continue;
      for (const side of [-1, 1]) {
        const first = wearPositions.length / 3;
        let walked = 0;
        for (let index = 0; index < line.length; index += 1) {
          const a = line[Math.max(0, index - 1)]!;
          const b = line[Math.min(line.length - 1, index + 1)]!;
          const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          const nx = -(b.z - a.z) / length;
          const nz = (b.x - a.x) / length;
          if (index > 0)
            walked += Math.hypot(
              line[index]!.x - line[index - 1]!.x,
              line[index]!.z - line[index - 1]!.z,
            );
          for (const edge of [-0.21, 0.21]) {
            const offset = side * 0.82 + edge;
            wearPositions.push(
              line[index]!.x + nx * offset,
              element.baseYM,
              line[index]!.z + nz * offset,
            );
            wearUvs.push(edge < 0 ? 0 : 1, walked / SURFACE_TILE_M.wearAlong);
          }
        }
        for (let index = 0; index < line.length - 1; index += 1) {
          const i0 = first + index * 2;
          const i1 = first + index * 2 + 1;
          const i2 = first + index * 2 + 2;
          const i3 = first + index * 2 + 3;
          const ax = wearPositions[i0 * 3]!;
          const az = wearPositions[i0 * 3 + 2]!;
          const normal = normalY(
            point(ax, az),
            point(wearPositions[i1 * 3]!, wearPositions[i1 * 3 + 2]!),
            point(wearPositions[i2 * 3]!, wearPositions[i2 * 3 + 2]!),
          );
          if (normal <= 0) wearIndices.push(i0, i1, i2, i1, i3, i2);
          else wearIndices.push(i0, i2, i1, i1, i2, i3);
        }
      }
    }
    if (wearIndices.length > 0) {
      wearMesh = new Mesh('city:wear', scene);
      const data = new VertexData();
      data.positions = wearPositions;
      data.indices = wearIndices;
      data.uvs = wearUvs;
      data.normals = wearPositions.map((_, index) => (index % 3 === 1 ? 1 : 0));
      data.applyToMesh(wearMesh);
      wearMesh.material = wearMaterial;
      wearMesh.parent = root;
      wearMesh.receiveShadows = true;
      wearMesh.isPickable = false;
      wearMesh.alphaIndex = 1;
      meshes.push(wearMesh);
    }
  }

  // Signal heads: post, housing and lamp are instances of one unit box. Matrices reproduce the
  // exact position/rotation/scale of the previously baked boxes.
  const posts: Matrix[] = [];
  const housings: Matrix[] = [];
  const lamps = new Map<CityMaterialKey, Matrix[]>();
  const headParts = new Map<
    string,
    {
      readonly post: number;
      readonly housing: number;
      readonly lamp: number;
      readonly lampColor: CityMaterialKey;
    }
  >();
  let headIndex = 0;
  const lampCounters = new Map<CityMaterialKey, number>();
  for (const element of layout.elements) {
    if (element.kind !== 'SIGNAL_HEAD') continue;
    const head = element as CitySignalHeadElement;
    const rotationY = Math.atan2(Math.cos(head.facingRad), Math.sin(head.facingRad));
    const rotation = Quaternion.RotationYawPitchRoll(rotationY, 0, 0);
    posts.push(
      Matrix.Compose(
        new Vector3(POST_SIZE_M, head.postHeightM, POST_SIZE_M),
        rotation,
        new Vector3(head.positionM.x, head.postHeightM / 2, head.positionM.z),
      ),
    );
    housings.push(
      Matrix.Compose(
        new Vector3(head.housingWidthM, head.housingHeightM, head.housingDepthM),
        rotation,
        new Vector3(head.positionM.x, head.postHeightM, head.positionM.z),
      ),
    );
    const lampColor: CityMaterialKey =
      head.lampState === 'GREEN'
        ? 'lampGreen'
        : head.lampState === 'YELLOW'
          ? 'lampAmber'
          : 'lampRed';
    const lampMatrices = lamps.get(lampColor) ?? [];
    lamps.set(lampColor, lampMatrices);
    lampMatrices.push(
      Matrix.Compose(
        new Vector3(LAMP_SIZE.x, LAMP_SIZE.y, LAMP_SIZE.z),
        rotation,
        new Vector3(
          head.positionM.x + Math.cos(head.facingRad) * (head.housingDepthM / 2 + LAMP_OFFSET_M),
          head.postHeightM + LAMP_HEIGHT_OFFSET_M,
          head.positionM.z + Math.sin(head.facingRad) * (head.housingDepthM / 2 + LAMP_OFFSET_M),
        ),
      ),
    );
    const lampIndex = lampCounters.get(lampColor) ?? 0;
    lampCounters.set(lampColor, lampIndex + 1);
    headParts.set(head.id, { post: headIndex, housing: headIndex, lamp: lampIndex, lampColor });
    headIndex += 1;
  }
  const housingMaterial = materials.get('housing')!;
  const postHost = createHost('signal:post', housingMaterial, posts);
  const housingHost = createHost('signal:housing', housingMaterial, housings);
  const lampHosts = new Map<CityMaterialKey, Mesh>();
  for (const color of ['lampRed', 'lampAmber', 'lampGreen'] as const) {
    const matrices = lamps.get(color);
    if (!matrices || matrices.length === 0) continue;
    lampHosts.set(color, createHost(`signal:${color}`, materials.get(color)!, matrices));
  }
  for (const [id, parts] of headParts) {
    const lampHost = lampHosts.get(parts.lampColor);
    if (!lampHost) throw new Error('Missing city lamp batch');
    headInstances.set(id, { ...parts, lampHost, housingHost });
    rendered.push(id);
    instancedElements += 1;
    count('SIGNAL_HEAD');
  }

  // One float32 buffer per host: instance indices follow the layout order of each part.
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
  let frozenMaterials = 0;
  for (const material of ownedMaterials) {
    material.freeze();
    if (material.isFrozen) frozenMaterials += 1;
  }
  const thinInstances = posts.length + housings.length + headParts.size;
  const stats: CitySceneStats = Object.freeze({
    elements: rendered.length,
    meshes: meshes.length,
    drawCalls: meshes.length,
    batches: batches.length,
    mergedElements,
    instancedElements,
    thinBatches: 2 + lampHosts.size,
    thinInstances,
    frozenMaterials,
    vertices,
    triangles,
    elementsByKind: Object.freeze(byKind),
  });
  let disposed = false;
  let nightFactor = 0;
  const litGlass = hostByMaterial.get('buildingGlassLit')?.material ?? null;
  const serviceMaterial = materials.get('service') ?? null;
  const applyNightFactor = (): void => {
    // Emisia este radianță liniară: la 1 aprinde geamurile cald, sub pragul de bloom (241), ca să
    // nu transforme fiecare fereastră într-un bec. Geamurile neaprinse rămân sticla reflectorizantă.
    if (litGlass) {
      const emissive = (litGlass as { emissiveColor?: Color3 }).emissiveColor;
      const color = new Color3(1.05 * nightFactor, 0.66 * nightFactor, 0.26 * nightFactor);
      if (emissive) emissive.copyFrom(color);
      else (litGlass as unknown as { emissiveColor: Color3 }).emissiveColor = color;
    }
    // Zonele de serviciu erau emisive cyan pentru lizibilitate pe timp de zi; noaptea rămânând
    // un dreptunghi luminos pe carosabil, se sting treptat până la 20% din valoarea de zi.
    if (serviceMaterial) {
      const rgb = PALETTE.service;
      const scale = 1 - 0.8 * nightFactor;
      const color = new Color3(rgb[0] * scale, rgb[1] * scale, rgb[2] * scale);
      const material = serviceMaterial as unknown as {
        emissiveColor: Color3;
        diffuseColor?: Color3;
      };
      material.emissiveColor = color;
      if (material.diffuseColor) material.diffuseColor.copyFrom(color);
    }
  };
  applyNightFactor();
  const corners = [-0.5, 0.5];
  const expand = (
    matrix: Matrix,
    bounds: { min: Vector3; max: Vector3 } | null,
  ): { min: Vector3; max: Vector3 } => {
    const result = bounds ?? {
      min: new Vector3(
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY,
      ),
      max: new Vector3(
        Number.NEGATIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ),
    };
    for (const x of corners)
      for (const y of corners)
        for (const z of corners) {
          const world = Vector3.TransformCoordinates(new Vector3(x, y, z), matrix);
          result.min.minimizeInPlace(world);
          result.max.maximizeInPlace(world);
        }
    return result;
  };
  return {
    root,
    layout,
    stats,
    getRenderedElementIds: () => Object.freeze([...rendered]),
    surfaceMeshes: () =>
      disposed
        ? []
        : Object.freeze(
            [
              ...[...hostByMaterial]
                .filter(([key]) => key in surfaceMaterials)
                .map(([, mesh]) => mesh),
              ...(wearMesh ? [wearMesh] : []),
            ].filter((mesh) => !mesh.isDisposed()),
          ),
    shadowCasterMeshes: () =>
      disposed
        ? []
        : Object.freeze(
            [
              hostByMaterial.get('building'),
              hostByMaterial.get('buildingWallBrick'),
              hostByMaterial.get('buildingWallPlaster'),
              hostByMaterial.get('buildingWallConcrete'),
              hostByMaterial.get('buildingTrim'),
              hostByMaterial.get('buildingGlass'),
              postHost,
              housingHost,
            ].filter((mesh): mesh is Mesh => !!mesh && !mesh.isDisposed()),
          ),
    meshFor(elementId: string): Mesh | null {
      if (disposed || scene.isDisposed) return null;
      const instance = headInstances.get(elementId);
      if (instance) return instance.housingHost;
      const range = mergedRanges.get(elementId);
      return range ? (hostByMaterial.get(range.key) ?? null) : null;
    },
    lampFor(elementId: string): Mesh | null {
      if (disposed || scene.isDisposed) return null;
      return headInstances.get(elementId)?.lampHost ?? null;
    },
    elementGeometry(elementId: string): CityElementGeometry | null {
      if (disposed || scene.isDisposed) return null;
      const range = mergedRanges.get(elementId);
      const host = range ? hostByMaterial.get(range.key) : null;
      if (!range || !host) return null;
      return Object.freeze({ host, offset: range.offset, count: range.count });
    },
    instanceIndexFor(elementId: string, part: CitySignalPart): number | null {
      if (disposed || scene.isDisposed) return null;
      const instance = headInstances.get(elementId);
      if (!instance) return null;
      return part === 'post'
        ? instance.post
        : part === 'housing'
          ? instance.housing
          : instance.lamp;
    },
    signalHostFor(elementId: string, part: CitySignalPart): Mesh | null {
      if (disposed || scene.isDisposed) return null;
      const instance = headInstances.get(elementId);
      if (!instance) return null;
      if (part === 'post') return postHost;
      return part === 'housing' ? housingHost : instance.lampHost;
    },
    elementBounds(elementId: string): readonly number[] | null {
      if (disposed || scene.isDisposed) return null;
      let bounds: { min: Vector3; max: Vector3 } | null = null;
      const instance = headInstances.get(elementId);
      if (instance) {
        bounds = expand(posts[instance.post]!, bounds);
        bounds = expand(housings[instance.housing]!, bounds);
        const lampMatrices = lamps.get(instance.lampColor);
        if (lampMatrices?.[instance.lamp]) bounds = expand(lampMatrices[instance.lamp]!, bounds);
      } else {
        const range = mergedRanges.get(elementId);
        const host = range ? hostByMaterial.get(range.key) : null;
        const positions = host?.getVerticesData('position');
        if (!range || !positions) return null;
        const min = new Vector3(
          Number.POSITIVE_INFINITY,
          Number.POSITIVE_INFINITY,
          Number.POSITIVE_INFINITY,
        );
        const max = new Vector3(
          Number.NEGATIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
        );
        for (let index = range.offset; index < range.offset + range.count; index += 1) {
          min.minimizeInPlaceFromFloats(
            positions[index * 3]!,
            positions[index * 3 + 1]!,
            positions[index * 3 + 2]!,
          );
          max.maximizeInPlaceFromFloats(
            positions[index * 3]!,
            positions[index * 3 + 1]!,
            positions[index * 3 + 2]!,
          );
        }
        bounds = { min, max };
      }
      return Object.freeze([
        bounds.min.x,
        bounds.min.y,
        bounds.min.z,
        bounds.max.x,
        bounds.max.y,
        bounds.max.z,
      ]);
    },
    getResourceCounts: () => ({
      meshes: disposed ? 0 : meshes.filter((mesh) => !mesh.isDisposed()).length,
      materials: disposed ? 0 : materials.size,
      geometries: disposed ? 0 : meshes.filter((mesh) => !mesh.isDisposed()).length,
      nodes: disposed ? 0 : 1,
    }),
    setNightFactor(factor: number): void {
      if (!Number.isFinite(factor) || factor < 0 || factor > 1)
        throw new Error('Night factor must be between 0 and 1');
      if (disposed) return;
      nightFactor = factor;
      applyNightFactor();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const mesh of meshes) if (!mesh.isDisposed()) mesh.dispose(false, false);
      meshes.length = 0;
      mergedRanges.clear();
      headInstances.clear();
      hostByMaterial.clear();
      lampHosts.clear();
      for (const material of ownedMaterials) material.dispose(false, false);
      ownedMaterials.length = 0;
      materials.clear();
      root.dispose(false);
    },
  };
}
