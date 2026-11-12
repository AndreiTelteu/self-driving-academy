import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { createCityScene } from '../../src/rendering/babylon/city-scene';
import type { CityScene } from '../../src/rendering/babylon/city-scene';
import {
  createCityLayout,
  createCityLayoutReport,
  createLaneGraph,
  createNeighbourhoodMap,
} from '../../src/world';
import type { CityLayout, CityPlanarElement } from '../../src/world';

const map = createNeighbourhoodMap();
const layout = createCityLayout(map);
const graph = createLaneGraph(map);

function withScene(run: (scene: Scene, city: CityScene) => void): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const city = createCityScene(scene, layout);
  try {
    run(scene, city);
  } finally {
    city.dispose();
    scene.dispose();
    engine.dispose();
  }
}
function verticesOf(mesh: AbstractMesh) {
  const data = mesh.getVerticesData('position');
  assert.ok(data, 'mesh has positions');
  const points: { x: number; y: number; z: number }[] = [];
  for (let index = 0; index < data.length; index += 3)
    points.push({ x: data[index]!, y: data[index + 1]!, z: data[index + 2]! });
  return points;
}
/** Vertices of one element inside its merged host: an element is a slice, not a mesh. */
function elementVerticesOf(city: CityScene, elementId: string) {
  const geometry = city.elementGeometry(elementId);
  assert.ok(geometry, `${elementId} merged slice`);
  const data = geometry.host.getVerticesData('position');
  assert.ok(data, `${elementId} host has positions`);
  const points: { x: number; y: number; z: number }[] = [];
  for (let index = geometry.offset; index < geometry.offset + geometry.count; index += 1)
    points.push({ x: data[index * 3]!, y: data[index * 3 + 1]!, z: data[index * 3 + 2]! });
  return points;
}
function key(point: { x: number; y: number; z: number }): string {
  return `${point.x.toFixed(4)}|${point.y.toFixed(4)}|${point.z.toFixed(4)}`;
}
/** Independent distance from a rendered vertex to the directed lane centreline. */
function distanceToPolyline(
  point: { readonly x: number; readonly z: number },
  polyline: readonly { readonly x: number; readonly z: number }[],
): number {
  let best = Infinity;
  for (let index = 1; index < polyline.length; index += 1) {
    const a = polyline[index - 1]!;
    const b = polyline[index]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = dx * dx + dz * dz;
    const t =
      length === 0
        ? 0
        : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length));
    best = Math.min(best, Math.hypot(point.x - (a.x + t * dx), point.z - (a.z + t * dz)));
  }
  return best;
}

test('the Babylon scene renders every layout element with few draw calls and thin instances', () => {
  withScene((scene, city) => {
    const rendered = city.getRenderedElementIds();
    assert.equal(rendered.length, layout.elements.length);
    assert.deepEqual([...rendered].sort(), layout.elements.map((element) => element.id).sort());
    assert.equal(city.stats.elements, layout.elements.length);
    assert.equal(city.stats.mergedElements + city.stats.instancedElements, layout.elements.length);
    assert.deepEqual(city.stats.elementsByKind, layout.stats.elementsByKind);
    assert.ok(city.stats.batches >= 4, `batches ${city.stats.batches}`);
    assert.ok(city.stats.meshes >= city.stats.batches);
    assert.ok(city.stats.vertices > 0 && city.stats.triangles > 0);
    assert.equal(
      city.stats.instancedElements,
      layout.stats.elementsByKind.SIGNAL_HEAD,
      'signal heads are the repeated objects',
    );
    // Instancing is what turns the per-element meshes into a fixed number of hosts.
    assert.equal(city.stats.meshes, city.stats.drawCalls);
    assert.ok(
      city.stats.meshes <= 16,
      `${city.stats.elements} elements in ${city.stats.meshes} meshes`,
    );
    assert.equal(city.stats.thinInstances, layout.stats.elementsByKind.SIGNAL_HEAD * 3);
    assert.ok(city.stats.frozenMaterials > 0, 'owned static materials are frozen');
    // Every signal head has a housing host and a lamp host; nothing else does.
    const heads = layout.elements.filter((element) => element.kind === 'SIGNAL_HEAD');
    assert.equal(heads.length, layout.stats.signalHeads);
    for (const head of heads) {
      assert.ok(city.meshFor(head.id));
      assert.ok(city.lampFor(head.id));
      assert.ok(city.instanceIndexFor(head.id, 'post') !== null);
      assert.ok(city.instanceIndexFor(head.id, 'housing') !== null);
      assert.ok(city.instanceIndexFor(head.id, 'lamp') !== null);
    }
    assert.ok(scene.meshes.some((mesh) => mesh.name.includes('lamp')));
    // No rendered counterpart is missing or unknown when the report is fed the real ids.
    const report = createCityLayoutReport(layout, rendered);
    assert.deepEqual(report.missingRenderedElementIds, []);
    assert.deepEqual(report.unknownRenderedElementIds, []);
    assert.deepEqual(report.phantomElementIds, []);
  });
});

test('lane surfaces sit exactly on the lane-graph centreline and width', () => {
  withScene((_scene, city) => {
    for (const lane of map.lanes) {
      const element = layout.elements.find(
        (candidate) => candidate.kind === 'LANE_SURFACE' && candidate.laneId === lane.id,
      )!;
      const mesh = city.meshFor(element.id);
      assert.ok(mesh, `${lane.id} mesh`);
      const points = elementVerticesOf(city, element.id);
      const path = graph.getDirectedPath(lane.id)!;
      assert.equal(points.length, 4 * (path.points.length - 1));
      for (const vertex of points) {
        const distance = distanceToPolyline(vertex, path.points);
        assert.ok(
          Math.abs(distance - lane.widthM / 2) <= 1e-6,
          `${lane.id} vertex is half a width from the centreline (${distance})`,
        );
      }
      // A shifted or resized ribbon changes the cross-axis extent.
      const xs = points.map((vertex) => vertex.x);
      const zs = points.map((vertex) => vertex.z);
      const heading = Math.atan2(
        graph.getDirectedPath(lane.id)!.points.at(-1)!.z -
          graph.getDirectedPath(lane.id)!.points[0]!.z,
        graph.getDirectedPath(lane.id)!.points.at(-1)!.x -
          graph.getDirectedPath(lane.id)!.points[0]!.x,
      );
      const across = Math.abs(Math.cos(heading)) < 0.5 ? xs : zs;
      assert.ok(
        Math.abs(Math.max(...across) - Math.min(...across) - lane.widthM) <= 1e-6,
        `${lane.id} rendered width`,
      );
    }
  });
});

test('batched paint, markings and signal heads keep their source coordinates', () => {
  withScene((scene, city) => {
    const batchVertices = new Set<string>();
    for (const mesh of scene.meshes) {
      if (!mesh.name.startsWith('city:batch:')) continue;
      for (const vertex of verticesOf(mesh)) batchVertices.add(key(vertex));
    }
    let checked = 0;
    for (const element of layout.elements) {
      if (element.kind === 'SIGNAL_HEAD' || element.kind === 'LANE_SURFACE') continue;
      if (
        element.kind !== 'STOP_LINE' &&
        element.kind !== 'LANE_MARKING' &&
        element.kind !== 'CROSSWALK'
      )
        continue;
      const planar = element as CityPlanarElement;
      if (element.kind === 'CROSSWALK') {
        // Crosswalk bars are generated inside the declared band.
        const xs = planar.footprintM.map((vertex) => vertex.x);
        const zs = planar.footprintM.map((vertex) => vertex.z);
        const minX = Math.min(...xs);
        const minZ = Math.min(...zs);
        const inside = [...batchVertices].some((entry) => {
          const [x, , z] = entry.split('|').map(Number) as [number, number, number];
          return (
            x > minX - 1e-6 &&
            x < Math.max(...xs) + 1e-6 &&
            z > minZ - 1e-6 &&
            z < Math.max(...zs) + 1e-6
          );
        });
        assert.ok(inside, `${element.id} has stripes inside its band`);
        checked += 1;
        continue;
      }
      if (element.kind === 'LANE_MARKING' && planar.paint === 'DASHED') {
        // Dashes are generated from the declared ribbon centreline; its midpoint must be painted.
        const half = planar.footprintM.length / 2;
        const left = planar.footprintM[0]!;
        const right = planar.footprintM[planar.footprintM.length - 1]!;
        const target = key({
          x: (left.x + right.x) / 2,
          y: planar.baseYM,
          z: (left.z + right.z) / 2,
        });
        const nearby = [...batchVertices].some((entry) => {
          const [x, , z] = entry.split('|').map(Number) as [number, number, number];
          return Math.hypot(x - (left.x + right.x) / 2, z - (left.z + right.z) / 2) < 0.2;
        });
        assert.ok(nearby, `${element.id} dashes start at its declared ribbon`);
        void target;
        void half;
        checked += 1;
        continue;
      }
      for (const vertex of planar.footprintM)
        assert.ok(
          batchVertices.has(key({ ...vertex, y: planar.baseYM })),
          `${element.id} vertex painted`,
        );
      checked += 1;
    }
    assert.ok(checked > 200, `checked ${checked}`);
    // Signal head instances reproduce the baked boxes exactly: position, rotation and scale.
    for (const head of layout.elements) {
      if (head.kind !== 'SIGNAL_HEAD') continue;
      const rotationY = Math.atan2(Math.cos(head.facingRad), Math.sin(head.facingRad));
      for (const [part, scale, center] of [
        [
          'post',
          { x: 0.16, y: head.postHeightM, z: 0.16 },
          { x: head.positionM.x, y: head.postHeightM / 2, z: head.positionM.z },
        ] as const,
        [
          'housing',
          { x: head.housingWidthM, y: head.housingHeightM, z: head.housingDepthM },
          { x: head.positionM.x, y: head.postHeightM, z: head.positionM.z },
        ] as const,
      ]) {
        const index = city.instanceIndexFor(head.id, part)!;
        const host = city.signalHostFor(head.id, part)!;
        const matrix = host.thinInstanceGetWorldMatrices()[index];
        assert.ok(matrix, `${head.id} ${part} matrix`);
        const translation = matrix.getTranslation();
        // Instance matrices live in a Float32Array, so equality means float32-exact (0,1 mm).
        assert.ok(Math.abs(translation.x - center.x) <= 1e-4, `${head.id} ${part} x`);
        assert.ok(Math.abs(translation.y - center.y) <= 1e-4, `${head.id} ${part} y`);
        assert.ok(Math.abs(translation.z - center.z) <= 1e-4, `${head.id} ${part} z`);
        assert.ok(Math.abs(matrix.getRow(0)!.length() - scale.x) <= 1e-4, `${head.id} ${part} sx`);
        assert.ok(Math.abs(matrix.getRow(1)!.length() - scale.y) <= 1e-4, `${head.id} ${part} sy`);
        assert.ok(Math.abs(matrix.getRow(2)!.length() - scale.z) <= 1e-4, `${head.id} ${part} sz`);
        // The local +X axis points where pushBox rotated it: (cos, 0, -sin).
        const axis = matrix.getRow(0)!.normalizeToNew();
        assert.ok(
          Math.abs(axis.x - Math.cos(rotationY)) <= 1e-4 &&
            Math.abs(axis.z + Math.sin(rotationY)) <= 1e-4,
          `${head.id} ${part} rotation`,
        );
      }
      const bounds = city.elementBounds(head.id)!;
      assert.ok(Math.abs((bounds[0]! + bounds[3]!) / 2 - head.positionM.x) <= 0.2);
      assert.ok(Math.abs((bounds[2]! + bounds[5]!) / 2 - head.positionM.z) <= 0.2);
      assert.ok(bounds[1]! >= -1e-6);
      assert.ok(
        Math.abs(bounds[4]! - (head.postHeightM + head.housingHeightM / 2)) <= 1e-5,
        `${head.id} top`,
      );
    }
  });
});

test('a missing or moved head is observable from the rendered meshes', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const tampered = JSON.parse(JSON.stringify(layout)) as CityLayout;
  const heads = tampered.elements.filter((element) => element.kind === 'SIGNAL_HEAD');
  const victim = heads[0]!;
  (victim as { positionM: unknown }).positionM = Object.freeze({
    x: (victim as unknown as { positionM: { x: number; z: number } }).positionM.x + 0.5,
    y: 0,
    z: (victim as unknown as { positionM: { x: number; z: number } }).positionM.z,
  });
  const city = createCityScene(scene, tampered);
  const bounds = city.elementBounds(victim.id)!;
  assert.ok(Math.abs((bounds[0]! + bounds[3]!) / 2 - victim.positionM.x) <= 0.2);
  const originalPosition = layout.elements.find((element) => element.id === victim.id) as
    { positionM: { x: number; z: number } } | undefined;
  assert.ok(originalPosition);
  assert.ok(Math.abs((bounds[0]! + bounds[3]!) / 2 - originalPosition.positionM.x) > 0.3);
  city.dispose();
  scene.dispose();
  engine.dispose();
});

test('disposal returns the scene to zero resources and is idempotent', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const baseline = scene.meshes.length;
  const city = createCityScene(scene, layout);
  assert.ok(city.getResourceCounts().meshes >= 12);
  assert.equal(city.getResourceCounts().meshes, city.stats.meshes);
  assert.ok(city.getResourceCounts().materials > 0);
  assert.equal(city.getResourceCounts().nodes, 1);
  city.dispose();
  city.dispose();
  assert.deepEqual(city.getResourceCounts(), { meshes: 0, materials: 0, geometries: 0, nodes: 0 });
  assert.equal(scene.meshes.length, baseline);
  assert.equal(scene.materials.length, 0);
  assert.equal(scene.geometries.length, 0);
  assert.equal(scene.transformNodes.length, 0);
  assert.equal(city.meshFor(layout.elements[0]!.id), null);
  assert.equal(city.lampFor(layout.elements[0]!.id), null);
  // The scene stays usable: a second city builds and disposes on the same engine.
  const again = createCityScene(scene, layout);
  assert.equal(again.stats.meshes, city.stats.meshes);
  again.dispose();
  assert.equal(scene.meshes.length, baseline);
  scene.dispose();
  engine.dispose();
});

test('two independent builds are byte-identical and borrow caller materials', () => {
  const first = new NullEngine();
  const firstScene = new Scene(first);
  const second = new NullEngine();
  const secondScene = new Scene(second);
  const checksum = (scene: Scene): string => {
    const parts: string[] = [];
    for (const mesh of [...scene.meshes].sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const data = mesh.getVerticesData('position');
      assert.ok(data);
      let hash = 2166136261;
      for (const value of data) {
        hash ^= Math.round(value * 1000);
        hash = Math.imul(hash, 16777619);
      }
      parts.push(`${mesh.name}:${hash >>> 0}:${mesh.getTotalIndices()}`);
    }
    return parts.join(';');
  };
  const owned = new StandardMaterial('caller-marking', firstScene);
  const cityA = createCityScene(firstScene, layout, { materials: { marking: owned } });
  const cityB = createCityScene(secondScene, layout);
  assert.equal(checksum(firstScene), checksum(secondScene));
  assert.deepEqual({ ...cityA.stats, frozenMaterials: 0 }, { ...cityB.stats, frozenMaterials: 0 });
  // Only owned materials are frozen: the caller's material stays mutable.
  assert.equal(owned.isFrozen, false, 'borrowed material is never frozen');
  assert.equal(cityA.stats.frozenMaterials, cityB.stats.frozenMaterials - 1);
  cityA.dispose();
  assert.equal(firstScene.materials.includes(owned), true, 'borrowed material is not disposed');
  owned.dispose();
  cityB.dispose();
  firstScene.dispose();
  secondScene.dispose();
  first.dispose();
  second.dispose();
});
