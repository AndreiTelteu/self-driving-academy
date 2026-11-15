/**
 * PBI 242 — scena Babylon a terenului de dincolo de oraș, a dealurilor îndepărtate și a parapetului.
 *
 * Trei desenări pe orice preset: terenul (un singur mesh cu culori pe vârf), stâlpii și grinzile
 * parapetului (instanțe subțiri ale unei cutii unitare). Nimic de aici nu are coliziune și nu citește
 * simularea; zidurile care opresc mașina și personajul sunt blocatoare ale lumii de mers (vezi
 * `world-limit`). Resursele sunt ale scenei și se eliberează complet la `dispose`.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { CityLayout, WorldLimit } from '../../world';
import { WORLD_EDGE_PRESETS, type QualityPreset } from '../quality-policy';
import {
  WORLD_EDGE_POLICY,
  buildGuardRail,
  buildWorldEdgeTerrain,
  type GuardRail,
  type WorldEdgeTerrain,
} from '../world-edge';

export interface WorldEdgeSceneStats {
  readonly meshes: number;
  readonly drawCalls: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly posts: number;
  readonly beams: number;
  readonly maxTerrainHeightM: number;
}

export interface WorldEdgeScene {
  readonly root: TransformNode;
  readonly limit: WorldLimit;
  readonly terrain: WorldEdgeTerrain;
  readonly guardRail: GuardRail;
  readonly terrainMesh: Mesh;
  readonly postMesh: Mesh;
  readonly beamMesh: Mesh;
  readonly stats: WorldEdgeSceneStats;
  dispose(): void;
}

function unitBox(): VertexData {
  const data = new VertexData();
  const h = 0.5;
  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  // Șase fețe cu normale proprii (muchii ascuțite), orientate spre exterior în mâna stângă.
  const faces: {
    n: [number, number, number];
    u: [number, number, number];
    v: [number, number, number];
  }[] = [
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [0, 0, 1], u: [-1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
  ];
  for (const face of faces) {
    const start = positions.length / 3;
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      positions.push(
        (face.n[0] + face.u[0] * a + face.v[0] * b) * h,
        (face.n[1] + face.u[1] * a + face.v[1] * b) * h,
        (face.n[2] + face.u[2] * a + face.v[2] * b) * h,
      );
      normals.push(...face.n);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  return data;
}

export function createWorldEdgeScene(
  scene: Scene,
  layout: CityLayout,
  preset: QualityPreset,
): WorldEdgeScene {
  if (!scene || scene.isDisposed) throw new Error('World edge requires a live scene');
  const tier = WORLD_EDGE_PRESETS[preset];
  if (!tier) throw new Error(`Unknown quality preset ${String(preset)}`);
  const limit = layout.worldLimit;
  const terrain = buildWorldEdgeTerrain(limit, tier.terrainSegmentsPerSide);
  const guardRail = buildGuardRail(limit.limit, tier.postSpacingM);
  const policy = WORLD_EDGE_POLICY;
  const root = new TransformNode(`world-edge:${layout.mapId}`, scene);

  const groundMaterial = new StandardMaterial('world-edge:terrain', scene);
  groundMaterial.diffuseColor = new Color3(1, 1, 1);
  groundMaterial.specularColor = Color3.Black();
  groundMaterial.maxSimultaneousLights = 2;
  groundMaterial.backFaceCulling = false;
  const steelMaterial = new StandardMaterial('world-edge:steel', scene);
  steelMaterial.diffuseColor = new Color3(0.66, 0.68, 0.7);
  steelMaterial.specularColor = new Color3(0.12, 0.12, 0.12);
  steelMaterial.maxSimultaneousLights = 2;
  steelMaterial.backFaceCulling = false;
  const postMaterial = new StandardMaterial('world-edge:post', scene);
  postMaterial.diffuseColor = new Color3(0.42, 0.42, 0.4);
  postMaterial.specularColor = Color3.Black();
  postMaterial.maxSimultaneousLights = 2;
  postMaterial.backFaceCulling = false;
  const materials = [groundMaterial, steelMaterial, postMaterial];

  const terrainMesh = new Mesh('world-edge:terrain', scene);
  const terrainData = new VertexData();
  terrainData.positions = Array.from(terrain.positions);
  terrainData.indices = Array.from(terrain.indices);
  terrainData.colors = Array.from(terrain.colors);
  const normals: number[] = [];
  VertexData.ComputeNormals(terrainData.positions, terrainData.indices, normals);
  terrainData.normals = normals;
  terrainData.applyToMesh(terrainMesh);
  terrainMesh.material = groundMaterial;
  terrainMesh.parent = root;
  terrainMesh.receiveShadows = true;
  terrainMesh.isPickable = false;
  terrainMesh.hasVertexAlpha = false;
  terrainMesh.freezeWorldMatrix();

  const makeHost = (
    name: string,
    material: StandardMaterial,
    matrices: readonly Matrix[],
  ): Mesh => {
    const mesh = new Mesh(`world-edge:${name}`, scene);
    unitBox().applyToMesh(mesh);
    mesh.material = material;
    mesh.parent = root;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    const buffer = new Float32Array(matrices.length * 16);
    matrices.forEach((matrix, index) => matrix.copyToArray(buffer, index * 16));
    mesh.thinInstanceSetBuffer('matrix', buffer, 16, true);
    mesh.thinInstanceRefreshBoundingInfo(true);
    return mesh;
  };
  const posts = guardRail.posts.map((post) =>
    Matrix.Compose(
      new Vector3(policy.postM.width, policy.postM.height, policy.postM.width),
      Quaternion.Identity(),
      new Vector3(post.x, policy.postM.height / 2, post.z),
    ),
  );
  const beams = guardRail.beams.map((beam) =>
    Matrix.Compose(
      new Vector3(beam.lengthM, policy.railBeamM.height, policy.railBeamM.thickness),
      Quaternion.RotationYawPitchRoll(beam.yawRad, 0, 0),
      new Vector3(beam.x, policy.railHeightM, beam.z),
    ),
  );
  const postMesh = makeHost('posts', postMaterial, posts);
  const beamMesh = makeHost('beams', steelMaterial, beams);
  const meshes = [terrainMesh, postMesh, beamMesh];
  for (const material of materials) material.freeze();

  let vertices = 0;
  let triangles = 0;
  for (const mesh of meshes) {
    vertices += mesh.getTotalVertices();
    triangles += mesh.getTotalIndices() / 3;
  }
  const stats: WorldEdgeSceneStats = Object.freeze({
    meshes: meshes.length,
    drawCalls: meshes.length,
    vertices,
    triangles,
    posts: posts.length,
    beams: beams.length,
    maxTerrainHeightM: terrain.maxHeightM,
  });
  let disposed = false;
  return {
    root,
    limit,
    terrain,
    guardRail,
    terrainMesh,
    postMesh,
    beamMesh,
    stats,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const mesh of meshes) if (!mesh.isDisposed()) mesh.dispose(false, false);
      for (const material of materials) material.dispose(false, false);
      root.dispose(false);
    },
  };
}
