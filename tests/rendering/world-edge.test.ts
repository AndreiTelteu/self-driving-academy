/**
 * PBI 242 — terenul, dealurile și parapetul: geometrie determinist, continuă și ieftină.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { createWorldEdgeScene } from '../../src/rendering/babylon/world-edge-scene';
import { WORLD_EDGE_PRESETS } from '../../src/rendering/quality-policy';
import {
  WORLD_EDGE_POLICY,
  buildGuardRail,
  buildWorldEdgeTerrain,
  createTerrainHeight,
} from '../../src/rendering/world-edge';
import { createCityLayout, createNeighbourhoodMap, deriveWorldLimit } from '../../src/world';

const layout = createCityLayout(createNeighbourhoodMap());
const worldLimit = deriveWorldLimit(layout);
const { limit, extent } = worldLimit;

test('terenul este plat între oraș și parapet și începe exact la marginea orașului', () => {
  const terrain = buildWorldEdgeTerrain(worldLimit, 48);
  const perLoop = 48 * 4;
  const level = Math.fround(WORLD_EDGE_POLICY.apronLevelM);
  // Bucla 0 (peretele) și bucla 1 (terenul) sunt chiar marginea orașului; peretele este la cota străzii.
  for (let index = 0; index < perLoop; index += 1) {
    for (const [loop, expected] of [
      [0, 0],
      [1, level],
      [2, level],
    ] as const) {
      const base = (loop * perLoop + index) * 3;
      assert.equal(terrain.positions[base + 1], expected, `bucla ${loop}`);
      if (loop < 2) {
        const x = terrain.positions[base]!;
        const z = terrain.positions[base + 2]!;
        assert.ok(x >= extent.minX - 1e-3 && x <= extent.maxX + 1e-3);
        assert.ok(z >= extent.minZ - 1e-3 && z <= extent.maxZ + 1e-3);
      }
    }
  }
  // Marginea orașului este suprafața de bază, nu zebra care o depășește.
  assert.ok(extent.minZ > -4 && extent.maxZ < 724.1, JSON.stringify(extent));
  const height = createTerrainHeight(limit);
  for (let x = limit.minX; x <= limit.maxX; x += 37)
    for (let z = limit.minZ; z <= limit.maxZ; z += 37)
      assert.equal(Math.fround(height(x, z)), level);
  assert.equal(Math.fround(height(limit.maxX + WORLD_EDGE_POLICY.bermStartM, 360)), level);
  assert.ok(height(limit.maxX + 40, 360) > 1, 'taluzul urcă în spatele parapetului');
});

test('relieful ajunge la dealuri și creste, iar orizontul nu este o linie dreaptă', () => {
  const terrain = buildWorldEdgeTerrain(worldLimit, 72);
  assert.ok(terrain.maxHeightM > 60 && terrain.maxHeightM < 300, `înălțime ${terrain.maxHeightM}`);
  // Ultima buclă (cea mai îndepărtată): înălțimile variază, deci silueta nu este o linie.
  const perLoop = 72 * 4;
  const lastLoop = terrain.loops - 1;
  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < perLoop; index += 1) {
    const y = terrain.positions[(lastLoop * perLoop + index) * 3 + 1]!;
    min = Math.min(min, y);
    max = Math.max(max, y);
  }
  assert.ok(max - min > 40, `creasta variază cu ${(max - min).toFixed(1)} m`);
  // Se întinde peste planul îndepărtat al camerei din compunere (3000 m) de la limită.
  const farX = terrain.positions[(lastLoop * perLoop + 0) * 3]!;
  assert.ok(limit.minX - farX >= 2400, `bucla îndepărtată la ${limit.minX - farX} m de limită`);
});

test('terenul este determinist, finit și cu normale în sus', () => {
  const a = buildWorldEdgeTerrain(worldLimit, 28);
  const b = buildWorldEdgeTerrain(worldLimit, 28);
  assert.deepEqual(Array.from(a.positions), Array.from(b.positions));
  assert.deepEqual(Array.from(a.colors), Array.from(b.colors));
  assert.deepEqual(Array.from(a.indices), Array.from(b.indices));
  assert.ok(a.positions.every(Number.isFinite) && a.colors.every(Number.isFinite));
  assert.ok(a.colors.every((value) => value >= 0 && value <= 1));
  const normals: number[] = [];
  VertexData.ComputeNormals(Array.from(a.positions), Array.from(a.indices), normals);
  let down = 0;
  for (let index = 1; index < normals.length; index += 3) if (normals[index]! < 0) down += 1;
  assert.equal(down, 0, 'toate normalele privesc în sus');
  // Indici valizi și fără triunghiuri degenerate între bucle.
  assert.ok(a.indices.every((value) => value < a.positions.length / 3));
});

test('parapetul înconjoară limita: stâlp în fiecare colț, câte o grindă pe câmp', () => {
  for (const spacing of [4, 8]) {
    const rail = buildGuardRail(limit, spacing);
    assert.equal(rail.posts.length, rail.beams.length);
    const perimeter = 2 * (limit.maxX - limit.minX) + 2 * (limit.maxZ - limit.minZ);
    assert.ok(Math.abs(rail.posts.length - perimeter / spacing) < 8);
    // Fiecare colț al limitei are un stâlp (decalat cu postOutsetM spre exterior).
    for (const [cx, cz] of [
      [limit.minX, limit.minZ],
      [limit.maxX, limit.minZ],
      [limit.maxX, limit.maxZ],
      [limit.minX, limit.maxZ],
    ] as const)
      assert.ok(
        rail.posts.some(
          (post) =>
            Math.abs(post.x - cx) <= WORLD_EDGE_POLICY.postOutsetM + 1e-9 &&
            Math.abs(post.z - cz) <= WORLD_EDGE_POLICY.postOutsetM + 1e-9,
        ),
      );
    // Parapetul este în afara limitei, deci nu intră în dreptunghiul jucabil.
    for (const beam of rail.beams)
      assert.ok(
        beam.x <= limit.minX ||
          beam.x >= limit.maxX ||
          beam.z <= limit.minZ ||
          beam.z >= limit.maxZ,
        'grinda este pe linia limitei sau dincolo de ea',
      );
  }
});

for (const preset of ['LOW', 'MEDIUM', 'HIGH'] as const) {
  test(`${preset}: scena de margine are 3 desenări, fără transparență, și se eliberează complet`, () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const before = { meshes: scene.meshes.length, materials: scene.materials.length };
    const edge = createWorldEdgeScene(scene, layout, preset);
    assert.equal(edge.stats.drawCalls, 3);
    assert.equal(scene.meshes.length - before.meshes, 3);
    assert.equal(scene.materials.length - before.materials, 3);
    assert.equal(
      edge.postMesh.thinInstanceCount,
      edge.guardRail.posts.length,
      'stâlpii sunt instanțe subțiri',
    );
    assert.ok(scene.meshes.every((mesh) => !mesh.material || mesh.material.alpha === 1));
    const tier = WORLD_EDGE_PRESETS[preset];
    assert.equal(edge.terrain.segmentsPerSide, tier.terrainSegmentsPerSide);
    edge.dispose();
    assert.equal(scene.meshes.length, before.meshes);
    assert.equal(scene.materials.length, before.materials);
    scene.dispose();
    engine.dispose();
  });
}

test('LOW este mai ieftin decât HIGH: mai puține vârfuri și stâlpi', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const low = createWorldEdgeScene(scene, layout, 'LOW');
  const high = createWorldEdgeScene(scene, layout, 'HIGH');
  assert.ok(low.stats.vertices < high.stats.vertices);
  assert.ok(low.stats.posts < high.stats.posts);
  assert.ok(low.stats.triangles < 20_000, `LOW: ${low.stats.triangles} triunghiuri`);
  low.dispose();
  high.dispose();
  scene.dispose();
  engine.dispose();
});
