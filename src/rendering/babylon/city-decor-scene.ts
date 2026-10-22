/**
 * PBI 146 — Babylon decor batches.
 *
 * One mesh per 120 m cell with a shared vertex-colour material: static batches stay spatially
 * local, draw calls equal occupied cells, and the layout is only read. Ownership is scene-local and
 * disposable; no collider, lane surface or simulation service is created here.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { CityLayout } from '../../world';
import {
  CITY_DECOR_CELL_SIZE_M,
  buildCityDecorGeometry,
  createCityDecorPlan,
  type CityDecorItem,
  type CityDecorPlan,
} from '../city-decor';

export interface CityDecorSceneOptions {
  readonly cellSizeM?: number;
  /** Optional caller-owned material; borrowed and never disposed here. */
  readonly material?: StandardMaterial;
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
  meshForCell(cell: string): Mesh | null;
  itemsInCell(cell: string): readonly CityDecorItem[];
  dispose(): void;
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
  const borrowed = options.material;
  if (borrowed && borrowed.getScene() !== scene)
    throw new Error('Decor material must be live and scene-local');
  const material = borrowed ?? new StandardMaterial('city-decor', scene);
  material.diffuseColor = new Color3(1, 1, 1);
  material.specularColor = Color3.Black();
  material.maxSimultaneousLights = 2;
  material.backFaceCulling = false;
  const root = new TransformNode(`city-decor:${layout.mapId}`, scene);
  const meshes: Mesh[] = [];
  const byCell = new Map<string, Mesh>();
  const geometry = buildCityDecorGeometry(plan);
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
  const stats: CityDecorSceneStats = Object.freeze({
    items: plan.items.length,
    cells: plan.cells.length,
    meshes: meshes.length,
    vertices,
    triangles,
    drawCalls: meshes.length,
    gpuBytes,
  });
  let disposed = false;
  return {
    root,
    plan,
    stats,
    meshForCell: (cell) => (disposed ? null : (byCell.get(cell) ?? null)),
    itemsInCell: (cell) => plan.items.filter((entry) => entry.cell === cell),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const mesh of meshes) if (!mesh.isDisposed()) mesh.dispose(false, false);
      meshes.length = 0;
      byCell.clear();
      if (!borrowed) material.dispose(false, false);
      root.dispose(false);
    },
  };
}
