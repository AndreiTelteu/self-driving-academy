/**
 * PBI 146/249 — Babylon decor batches.
 *
 * One mesh per 120 m cell for non-tree furniture with PBR materials (wood/metal, glass, lamp
 * emissive). Trees use instanced meshes per species for wind sway and impostor crossfade. All
 * materials are scene-local and disposable; no collider, lane surface or simulation service is
 * created here.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { PBRCustomMaterial } from '@babylonjs/materials/custom/pbrCustomMaterial.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { CityLayout } from '../../world';
import {
  CITY_DECOR_CELL_SIZE_M,
  buildCityDecorGeometry,
  createCityDecorPlan,
  TREE_KINDS,
  type CityDecorItem,
  type CityDecorPlan,
  type CityDecorKind,
} from '../city-decor';
import type { QualityPreset } from '../quality-policy';
import type { GlbModelLibrary } from './glb-model-library';
import { GLB_DECOR_KINDS, createGlbDecorBatches, type GlbDecorBatches } from './city-decor-glb';

export interface CityDecorSceneOptions {
  readonly cellSizeM?: number;
  /** Quality preset — controls wind and impostor ranges. */
  readonly preset?: QualityPreset;
  /** Optional caller-owned material; borrowed and never disposed here. */
  readonly material?: PBRMaterial;
  /** PBI 254: imported tree/lamp/bench models; absent in headless tests. */
  readonly models?: GlbModelLibrary;
}
export interface CityDecorSceneStats {
  readonly items: number;
  readonly cells: number;
  readonly meshes: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly drawCalls: number;
  readonly gpuBytes: number;
}
export interface CityDecorScene {
  readonly root: TransformNode;
  readonly plan: CityDecorPlan;
  readonly stats: CityDecorSceneStats;
  /** PBI 244: batch-urile statice (câte unul pe celulă) care aruncă umbră. */
  shadowCasterMeshes(): readonly (Mesh | InstancedMesh)[];
  meshForCell(cell: string): Mesh | null;
  itemsInCell(cell: string): readonly CityDecorItem[];
  dispose(): void;
}

/** Deterministic 32-bit hash (FNV-1a) used for per-item variation. */
function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Build a simple grass tuft template: 3 crossed quads, small and subtle, centred at origin. */
function buildGrassTemplate(): {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint16Array;
} {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const height = 0.18;
  const width = 0.12;
  // Three quads crossed at 60° angles — small blades, not sheets.
  for (let blade = 0; blade < 3; blade += 1) {
    const angle = (blade / 3) * Math.PI; // 0, 60, 120 degrees
    const dx = Math.cos(angle) * (width / 2);
    const dz = Math.sin(angle) * (width / 2);
    const base = positions.length / 3;
    // Two triangles per quad (4 vertices, 6 indices).
    positions.push(
      -dx,
      0,
      -dz,
      dx,
      0,
      dz,
      dx * 0.7,
      height,
      dz * 0.7,
      -dx * 0.7,
      height,
      -dz * 0.7,
    );
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    // Dark natural grass green, close to the PBI 245 grass texture.
    const r = 0.1 + (blade % 2) * 0.02;
    const g = 0.24 + (blade % 3) * 0.02;
    const b = 0.06;
    colors.push(r, g, b, 1, r, g, b, 1, r, g, b, 1, r, g, b, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint16Array(indices),
  };
}

/** Rebuild a single template geometry for a tree kind, centred at origin. */
function buildTreeTemplate(kind: CityDecorKind): {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint16Array | Uint32Array;
} {
  const item = Object.freeze({
    id: 'template:0',
    kind,
    x: 0,
    z: 0,
    rotationY: 0,
    cell: '0:0',
    radiusM: 0,
    heightM: 0,
  });
  const syntheticPlan = Object.freeze({
    version: '249-tree-template',
    cellSizeM: 120,
    items: Object.freeze([item]),
    cells: Object.freeze(['0:0']),
    countsByKind: Object.freeze({ [kind]: 1 }) as never,
    sidewalkRibbons: 0,
    serviceZones: 0,
  }) as unknown as CityDecorPlan;
  const cells = buildCityDecorGeometry(syntheticPlan);
  const cell = cells[0]!;
  const positions = new Float32Array(cell.positions);
  const normals = new Float32Array(cell.normals);
  const colors = new Float32Array(cell.colors);
  const indices =
    cell.vertices > 65535 ? new Uint32Array(cell.indices) : new Uint16Array(cell.indices);
  return { positions, normals, colors, indices };
}

export function createCityDecorScene(
  scene: Scene,
  layout: CityLayout,
  options: CityDecorSceneOptions = {},
): CityDecorScene {
  if (!scene || scene.isDisposed) throw new Error('Decor scene requires a live scene');
  const plan = createCityDecorPlan(layout, {
    cellSizeM: options.cellSizeM ?? CITY_DECOR_CELL_SIZE_M,
  });
  const preset = options.preset ?? 'HIGH';
  const borrowed = options.material;
  if (borrowed && borrowed.getScene() !== scene)
    throw new Error('Decor material must be live and scene-local');

  // PBR materials per surface type; vertex colours tint the albedo.
  const material = borrowed ?? new PBRMaterial('city-decor', scene);
  material.albedoColor = new Color3(1, 1, 1);
  material.metallic = 0.1;
  material.roughness = 0.7;
  material.directIntensity = 2.3;
  material.environmentIntensity = 0.35;
  material.maxSimultaneousLights = 2;
  material.backFaceCulling = false;

  const glassMaterial = new PBRMaterial('city-decor-glass', scene);
  glassMaterial.albedoColor = new Color3(0.42, 0.6, 0.68);
  glassMaterial.metallic = 0.1;
  glassMaterial.roughness = 0.08;
  glassMaterial.alpha = 0.55;
  glassMaterial.directIntensity = 2.3;
  glassMaterial.environmentIntensity = 1.1;
  glassMaterial.maxSimultaneousLights = 2;
  glassMaterial.backFaceCulling = false;

  const lampMaterial = new PBRMaterial('city-decor-lamp', scene);
  lampMaterial.albedoColor = new Color3(1, 1, 1);
  lampMaterial.metallic = 0.0;
  lampMaterial.roughness = 0.4;
  lampMaterial.emissiveColor = new Color3(0.92, 0.88, 0.7);
  lampMaterial.directIntensity = 2.3;
  lampMaterial.environmentIntensity = 0.35;
  lampMaterial.maxSimultaneousLights = 2;
  lampMaterial.backFaceCulling = false;

  // Wind material for tree crowns: vertex shader sway via PBRCustomMaterial.
  const windMaterial = new PBRCustomMaterial('city-decor-leaves', scene);
  windMaterial.albedoColor = new Color3(1, 1, 1);
  windMaterial.metallic = 0.0;
  windMaterial.roughness = 0.85;
  windMaterial.directIntensity = 2.3;
  windMaterial.environmentIntensity = 0.35;
  windMaterial.maxSimultaneousLights = 2;
  windMaterial.backFaceCulling = false;
  windMaterial.AddUniform('windTime', 'float', 0);
  windMaterial.AddUniform('windAmp', 'float', preset === 'LOW' ? 0 : 0.06);
  windMaterial.Vertex_After_WorldPosComputed(`
    // Wind sway: small horizontal displacement, phase from object id hash.
    float windPhase = float(gl_InstanceID) * 0.37;
    float windSway = sin(windTime * 1.2 + windPhase) * windAmp * smoothstep(0.5, 3.0, worldPos.y);
    worldPos.x += windSway;
    worldPos.z += windSway * 0.7;
  `);
  windMaterial.onBindObservable.add(() => {
    const effect = windMaterial.getEffect();
    if (effect) {
      effect.setFloat('windTime', performance.now() / 1000);
      effect.setFloat('windAmp', preset === 'LOW' ? 0 : 0.06);
    }
  });

  const root = new TransformNode(`city-decor:${layout.mapId}`, scene);
  const meshes: Mesh[] = [];
  const byCell = new Map<string, Mesh>();
  // PBI 254: trees, lamps and benches come from the GLB kit; the remaining furniture keeps the
  // PBI 146 merged per-cell batches.
  const glbKinds = new Set<CityDecorKind>(options.models ? GLB_DECOR_KINDS : []);
  const glbItems = plan.items.filter((entry) => glbKinds.has(entry.kind));
  const remainingItems = plan.items.filter((entry) => !glbKinds.has(entry.kind));
  const glbBatches: GlbDecorBatches | null =
    options.models && glbItems.length > 0
      ? createGlbDecorBatches(scene, root, plan, options.models)
      : null;
  // Split the rest: trees are rendered as instanced meshes per species (wind + impostor
  // crossfade), everything else stays in merged per-cell batches as in PBI 146.
  const treeItems = remainingItems.filter((entry) => TREE_KINDS.includes(entry.kind));
  const nonTreeItems = remainingItems.filter((entry) => !TREE_KINDS.includes(entry.kind));
  const cellPlan: CityDecorPlan = Object.freeze({ ...plan, items: nonTreeItems });
  const geometry = buildCityDecorGeometry(cellPlan);
  let vertices = 0;
  let triangles = 0;
  let gpuBytes = 0;

  for (const cell of geometry) {
    const mesh = new Mesh(`city-decor:${cell.cell}`, scene);
    const data = new VertexData();
    data.positions = [...cell.positions];
    data.normals = [...cell.normals];
    data.colors = [...cell.colors];
    data.indices = [...cell.indices];
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.parent = root;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    meshes.push(mesh);
    byCell.set(cell.cell, mesh);
    vertices += cell.vertices;
    triangles += cell.indicesCount / 3;
    gpuBytes += cell.gpuBytes;
  }

  // Tree instancing: one thin-instance mesh per species, one draw call each.
  const treeSourceMeshes: Mesh[] = [];
  if (treeItems.length > 0) {
    for (const kind of TREE_KINDS) {
      const items = treeItems.filter((entry) => entry.kind === kind);
      if (items.length === 0) continue;
      const template = buildTreeTemplate(kind);
      const source = new Mesh(`city-decor:tree-source:${kind}`, scene);
      const sourceData = new VertexData();
      sourceData.positions = template.positions;
      sourceData.normals = template.normals;
      sourceData.colors = template.colors;
      sourceData.indices = template.indices;
      sourceData.applyToMesh(source);
      source.material = windMaterial;
      source.parent = root;
      source.isVisible = true; // thin instances need a visible source
      source.isPickable = false;
      source.alwaysSelectAsActiveMesh = true;
      source.receiveShadows = true;
      treeSourceMeshes.push(source);

      // Thin instances: one draw call per species, GPU-side matrices.
      const matrices = new Float32Array(items.length * 16);
      const colors = new Float32Array(items.length * 4);
      for (let i = 0; i < items.length; i += 1) {
        const entry = items[i]!;
        // Deterministic per-tree variation: scale 0.85–1.15 and a slight extra yaw, both from the
        // item id hash (contract 146 ids are stable). Position and base yaw are unchanged.
        const h = hash(entry.id);
        const scale = 0.85 + ((h >>> 8) % 31) / 100; // 0.85–1.15
        const extraYaw = (((h >>> 16) % 628) / 100) * 0.01; // 0–0.0628 rad
        const matrix = Matrix.Compose(
          new Vector3(scale, scale, scale),
          Quaternion.RotationYawPitchRoll(entry.rotationY + extraYaw, 0, 0),
          new Vector3(entry.x, 0, entry.z),
        );
        matrix.copyToArray(matrices, i * 16);
        // Hue variation through the instance colour buffer (multiplied with vertex colours).
        const tint = 0.85 + ((h >>> 3) % 31) / 100; // 0.85–1.15
        colors[i * 4] = tint;
        colors[i * 4 + 1] = 0.9 + ((h >>> 5) % 21) / 100;
        colors[i * 4 + 2] = tint;
        colors[i * 4 + 3] = 1;
      }
      source.thinInstanceSetBuffer('matrix', matrices, 16, true);
      source.thinInstanceSetBuffer('color', colors, 4, true);
      vertices += template.positions.length / 3;
      triangles += template.indices.length / 3;
      gpuBytes +=
        template.positions.length * 4 +
        template.indices.length * 4 +
        matrices.byteLength +
        colors.byteLength;
    }
  }

  // Grass instancing: GPU thin instances near sidewalk edges, never on roadways.
  let grassSource: Mesh | null = null;
  if (preset !== 'LOW') {
    const roadways = layout.elements.filter(
      (element): element is import('../../world').CityPlanarElement =>
        element.kind === 'LANE_SURFACE' || element.kind === 'INTERSECTION_SURFACE',
    );
    const insideAny = (
      x: number,
      z: number,
      elements: readonly import('../../world').CityPlanarElement[],
    ): boolean => {
      for (const element of elements) {
        const footprint = element.footprintM;
        let inside = false;
        for (let i = 0, j = footprint.length - 1; i < footprint.length; j = i++) {
          const a = footprint[i]!;
          const b = footprint[j]!;
          if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x)
            inside = !inside;
        }
        if (inside) return true;
      }
      return false;
    };
    // Sample grass positions deterministically, only near sidewalk edges (within 2 m of a
    // SIDEWALK element). This keeps the count low and the effect local to where the player walks.
    const grassPositions: { x: number; z: number; rotationY: number; scale: number }[] = [];
    const spacing = 0.8; // metres between tufts
    const edgeDistance = 2.0;
    for (const sidewalk of layout.elements.filter(
      (e): e is import('../../world').CityPlanarElement => e.kind === 'SIDEWALK',
    )) {
      const footprint = sidewalk.footprintM;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const vertex of footprint) {
        minX = Math.min(minX, vertex.x);
        maxX = Math.max(maxX, vertex.x);
        minZ = Math.min(minZ, vertex.z);
        maxZ = Math.max(maxZ, vertex.z);
      }
      // Sample in the expanded bounding box, keep only points just outside the sidewalk.
      for (let x = minX - edgeDistance; x <= maxX + edgeDistance; x += spacing) {
        for (let z = minZ - edgeDistance; z <= maxZ + edgeDistance; z += spacing) {
          const h = hash(`${sidewalk.id}:grass:${x.toFixed(1)}:${z.toFixed(1)}`);
          if (h % 7 !== 0) continue; // 1 in 7 density
          const jx = x + (((h >>> 8) % 100) / 100 - 0.5) * spacing * 0.6;
          const jz = z + (((h >>> 16) % 100) / 100 - 0.5) * spacing * 0.6;
          // Must be outside the sidewalk but within edgeDistance of it.
          let insideSidewalk = false;
          for (let i = 0, j = footprint.length - 1; i < footprint.length; j = i++) {
            const a = footprint[i]!;
            const b = footprint[j]!;
            if (a.z > jz !== b.z > jz && jx < ((b.x - a.x) * (jz - a.z)) / (b.z - a.z) + a.x)
              insideSidewalk = !insideSidewalk;
          }
          if (insideSidewalk) continue;
          if (insideAny(jx, jz, roadways)) continue; // never grow grass on the road
          const scale = 0.6 + ((h >>> 4) % 41) / 100; // 0.6–1.0
          grassPositions.push({ x: jx, z: jz, rotationY: (h % 628) / 100, scale });
        }
      }
    }
    if (grassPositions.length > 0) {
      const template = buildGrassTemplate();
      grassSource = new Mesh('city-decor:grass-source', scene);
      const sourceData = new VertexData();
      sourceData.positions = template.positions;
      sourceData.normals = template.normals;
      sourceData.colors = template.colors;
      sourceData.indices = template.indices;
      sourceData.applyToMesh(grassSource);
      grassSource.material = material;
      grassSource.parent = root;
      grassSource.isVisible = true; // thin instances need a visible source
      grassSource.isPickable = false;
      grassSource.alwaysSelectAsActiveMesh = true;
      grassSource.receiveShadows = false; // grass does not need shadows

      // Thin instances: one draw call for all grass tufts, GPU-side matrices.
      const matrices = new Float32Array(grassPositions.length * 16);
      for (let i = 0; i < grassPositions.length; i += 1) {
        const pos = grassPositions[i]!;
        const matrix = Matrix.Compose(
          new Vector3(pos.scale, pos.scale, pos.scale),
          Quaternion.RotationYawPitchRoll(pos.rotationY, 0, 0),
          new Vector3(pos.x, 0, pos.z),
        );
        matrix.copyToArray(matrices, i * 16);
      }
      grassSource.thinInstanceSetBuffer('matrix', matrices, 16, true);
      vertices += template.positions.length / 3;
      triangles += template.indices.length / 3;
      gpuBytes += template.positions.length * 4 + template.indices.length * 4 + matrices.byteLength;
    }
  }

  const stats: CityDecorSceneStats = Object.freeze({
    items: plan.items.length,
    cells: plan.cells.length,
    meshes:
      meshes.length +
      treeSourceMeshes.length +
      (grassSource ? 1 : 0) +
      (glbBatches?.meshes.length ?? 0),
    vertices: vertices + (glbBatches?.vertices ?? 0),
    triangles: triangles + (glbBatches?.triangles ?? 0),
    drawCalls:
      meshes.length +
      treeSourceMeshes.length +
      (grassSource ? 1 : 0) +
      (glbBatches?.meshes.length ?? 0),
    gpuBytes: gpuBytes + (glbBatches?.gpuBytes ?? 0),
  });
  let disposed = false;
  return {
    root,
    plan,
    stats,
    shadowCasterMeshes: () =>
      disposed
        ? []
        : [
            ...meshes.filter((mesh) => !mesh.isDisposed()),
            ...treeSourceMeshes.filter((mesh) => !mesh.isDisposed()),
            ...(glbBatches?.meshes.filter((mesh) => !mesh.isDisposed()) ?? []),
          ],
    meshForCell: (cell) => (disposed ? null : (byCell.get(cell) ?? null)),
    itemsInCell: (cell) => plan.items.filter((entry) => entry.cell === cell),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      glbBatches?.dispose();
      for (const mesh of treeSourceMeshes) if (!mesh.isDisposed()) mesh.dispose(false, false);
      if (grassSource && !grassSource.isDisposed()) grassSource.dispose(false, false);
      for (const mesh of meshes) if (!mesh.isDisposed()) mesh.dispose(false, false);
      meshes.length = 0;
      treeSourceMeshes.length = 0;
      byCell.clear();
      if (!borrowed) material.dispose(false, false);
      glassMaterial.dispose(false, false);
      lampMaterial.dispose(false, false);
      windMaterial.dispose(false, false);
      root.dispose(false);
    },
  };
}
