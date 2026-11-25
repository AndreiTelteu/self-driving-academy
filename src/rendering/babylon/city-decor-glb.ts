/**
 * PBI 254 — imported GLB street furniture, drawn as thin instances.
 *
 * Trees, street lamps and benches come from the CC0 Innerscene kit instead of procedural
 * geometry. Each model is instantiated once and the resulting meshes carry one thin-instance
 * matrix buffer with every item of the plan, so the draw-call budget stays at "one per mesh per
 * model" no matter how many items exist.
 *
 * Orientation follows the PBI 146 plan convention exactly: the plan rotation is `Ry(rotationY)`
 * applied to a template whose own forward is `+Z` (bench seat, lamp arm) — the per-kind yaw offset
 * below only compensates for the imported model's own forward axis.
 */
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import {
  TREE_KINDS,
  type CityDecorItem,
  type CityDecorKind,
  type CityDecorPlan,
} from '../city-decor';
import type { GlbModelLibrary } from './glb-model-library';

/** Model id and yaw offset (radians) per decor kind handled by the GLB kit. */
interface GlbDecorMapping {
  readonly id: string;
  readonly yaw: number;
}
const GLB_DECOR: ReadonlyMap<CityDecorKind, GlbDecorMapping> = new Map<
  CityDecorKind,
  GlbDecorMapping
>([
  ['tree', { id: 'decor:tree', yaw: 0 }],
  ['tree-maple', { id: 'decor:tree', yaw: 1.9 }],
  ['tree-oak', { id: 'decor:tree', yaw: 4.1 }],
  // The lamp arm reaches +X in the model; +90° turns it onto the plan's +Z forward.
  ['street-lamp', { id: 'decor:street-lamp', yaw: Math.PI / 2 }],
  // The bench seat faces +Z in the model, which is already the plan forward.
  ['bench', { id: 'decor:bench', yaw: 0 }],
]);

export const GLB_DECOR_KINDS: readonly CityDecorKind[] = Object.freeze([
  ...TREE_KINDS,
  'street-lamp',
  'bench',
]);

export interface GlbDecorBatches {
  readonly meshes: readonly Mesh[];
  readonly items: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly gpuBytes: number;
  dispose(): void;
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Deterministic per-item scale, matching the PBI 146 variation the procedural trees used. */
function scaleFor(item: CityDecorItem): number {
  const h = hash(item.id);
  return 0.85 + ((h >>> 8) % 31) / 100;
}

export function createGlbDecorBatches(
  scene: Scene,
  parent: TransformNode,
  plan: CityDecorPlan,
  models: GlbModelLibrary,
): GlbDecorBatches {
  const meshes: Mesh[] = [];
  let items = 0;
  let vertices = 0;
  let triangles = 0;
  let gpuBytes = 0;

  const byModel = new Map<string, CityDecorItem[]>();
  for (const item of plan.items) {
    const mapping = GLB_DECOR.get(item.kind);
    if (!mapping) continue;
    const bucket = byModel.get(mapping.id) ?? [];
    bucket.push(item);
    byModel.set(mapping.id, bucket);
  }

  for (const [id, bucket] of byModel) {
    const entries = models.instantiate(id, scene, `city-decor:${id}`, { cloneMaterials: false });
    if (!entries) continue;
    const modelMeshes: Mesh[] = [];
    for (const node of entries.rootNodes) {
      const candidates = (node as unknown as { getChildMeshes?: () => Mesh[] }).getChildMeshes
        ? (node as unknown as { getChildMeshes: () => Mesh[] }).getChildMeshes()
        : [node as unknown as Mesh];
      for (const mesh of candidates) modelMeshes.push(mesh);
      if (
        typeof (node as unknown as { getTotalVertices?: unknown }).getTotalVertices === 'function'
      )
        modelMeshes.push(node as unknown as Mesh);
    }
    const unique = [...new Set(modelMeshes)];
    if (unique.length === 0) continue;

    const matrices = new Float32Array(bucket.length * 16);
    for (let index = 0; index < bucket.length; index += 1) {
      const item = bucket[index]!;
      const mapping = GLB_DECOR.get(item.kind)!;
      const scale = scaleFor(item);
      const matrix = Matrix.Compose(
        new Vector3(scale, scale, scale),
        Quaternion.RotationYawPitchRoll(item.rotationY + mapping.yaw, 0, 0),
        new Vector3(item.x, 0, item.z),
      );
      matrix.copyToArray(matrices, index * 16);
    }

    for (const mesh of unique) {
      mesh.parent = parent;
      mesh.position.setAll(0);
      mesh.rotationQuaternion = Quaternion.Identity();
      mesh.scaling.setAll(1);
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.isVisible = true; // thin instances need a visible source
      mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
      meshes.push(mesh);
      vertices += mesh.getTotalVertices();
      triangles += mesh.getTotalIndices() / 3;
      gpuBytes += matrices.byteLength;
    }
    items += bucket.length;
  }

  return Object.freeze({
    meshes: Object.freeze(meshes),
    items,
    vertices,
    triangles,
    gpuBytes,
    dispose(): void {
      for (const mesh of meshes) if (!mesh.isDisposed()) mesh.dispose(false, false);
    },
  });
}
