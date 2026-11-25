/**
 * PBI 255 — instanțierea modulelor de clădire GLB de la nivelul străzii.
 *
 * Un singur mesh per tipologie, cu thin instances pentru toate plasările planului pur
 * (`building-modules.ts`): draw calls constante, indiferent câte module are orașul. Materialele
 * aparțin bibliotecii de modele și nu sunt modificate aici.
 */
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { BuildingModulePlacement } from '../building-modules';
import type { GlbModelLibrary } from './glb-model-library';

export interface BuildingModuleBatches {
  readonly meshes: readonly Mesh[];
  readonly placements: number;
  readonly models: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly gpuBytes: number;
  dispose(): void;
}

export function createBuildingModuleBatches(
  scene: Scene,
  parent: TransformNode,
  placements: readonly BuildingModulePlacement[],
  models: GlbModelLibrary,
): BuildingModuleBatches {
  const meshes: Mesh[] = [];
  let placed = 0;
  let vertices = 0;
  let triangles = 0;
  let gpuBytes = 0;
  const byModel = new Map<string, BuildingModulePlacement[]>();
  for (const placement of placements) {
    const bucket = byModel.get(placement.modelId) ?? [];
    bucket.push(placement);
    byModel.set(placement.modelId, bucket);
  }
  for (const [id, bucket] of byModel) {
    const entries = models.instantiate(id, scene, `city-building:${id}`, {
      cloneMaterials: false,
    });
    if (!entries) continue;
    const found: Mesh[] = [];
    for (const node of entries.rootNodes) {
      const candidate = node as unknown as Mesh;
      if (typeof (candidate as { getTotalVertices?: unknown }).getTotalVertices === 'function')
        found.push(candidate);
      const children = (node as { getChildMeshes?: () => Mesh[] }).getChildMeshes;
      if (typeof children === 'function') found.push(...children.call(node));
    }
    const unique = [...new Set(found)];
    if (unique.length === 0) continue;
    // O casă are 14–50 de noduri; le contopim pe material, ca instanțierea să coste câteva draw
    // calls per tipologie, nu câteva zeci, iar fiecare mesh să aibă un singur material partajat.
    const byMaterial = new Map<Material, Mesh[]>();
    for (const mesh of unique) {
      const material = mesh.material;
      if (!material) continue;
      const group = byMaterial.get(material) ?? [];
      group.push(mesh);
      byMaterial.set(material, group);
    }
    const renderMeshes: Mesh[] = [];
    for (const [material, group] of byMaterial) {
      const merged =
        group.length > 1 ? Mesh.MergeMeshes(group, true, true, undefined, false, false) : group[0]!;
      if (!merged) continue;
      merged.material = material;
      merged.name = `city-building:${id}:${material.name}`;
      renderMeshes.push(merged);
    }
    if (renderMeshes.length === 0) continue;
    const matrices = new Float32Array(bucket.length * 16);
    for (let index = 0; index < bucket.length; index += 1) {
      const placement = bucket[index]!;
      Matrix.Compose(
        new Vector3(placement.scale, placement.scale, placement.scale),
        Quaternion.RotationYawPitchRoll(placement.yawRad, 0, 0),
        new Vector3(placement.x, placement.y, placement.z),
      ).copyToArray(matrices, index * 16);
    }
    for (const mesh of renderMeshes) {
      mesh.parent = parent;
      mesh.position.setAll(0);
      mesh.rotationQuaternion = Quaternion.Identity();
      mesh.scaling.setAll(1);
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.isVisible = true;
      mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
      meshes.push(mesh);
      vertices += mesh.getTotalVertices();
      triangles += mesh.getTotalIndices() / 3;
      gpuBytes += matrices.byteLength;
    }
    placed += bucket.length;
  }
  return Object.freeze({
    meshes: Object.freeze(meshes),
    placements: placed,
    models: byModel.size,
    vertices,
    triangles,
    gpuBytes,
    dispose(): void {
      for (const mesh of meshes) if (!mesh.isDisposed()) mesh.dispose(false, false);
    },
  });
}
