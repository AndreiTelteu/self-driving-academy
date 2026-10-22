import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import {
  CITY_DECOR_KINDS,
  CITY_DECOR_VERSION,
  buildCityDecorGeometry,
  cityDecorBudget,
  cityDecorInventory,
  cityDecorManifest,
  createCityDecorPlan,
  verifyCityDecor,
} from '../../src/rendering';
import type { CityDecorPlan } from '../../src/rendering';
import { createCityDecorScene } from '../../src/rendering/babylon/city-decor-scene';
import { createCityScene } from '../../src/rendering/babylon/city-scene';
import {
  createCityLayout,
  createCityLayoutReport,
  createNeighbourhoodMap,
  verifyCityAlignment,
} from '../../src/world';
import type { CityPlanarElement } from '../../src/world';

const map = createNeighbourhoodMap();
const layout = createCityLayout(map);
const plan = createCityDecorPlan(layout);

function inside(point: { x: number; z: number }, footprint: readonly { x: number; z: number }[]) {
  let result = false;
  for (
    let index = 0, previous = footprint.length - 1;
    index < footprint.length;
    previous = index++
  ) {
    const a = footprint[index]!;
    const b = footprint[previous]!;
    if (
      a.z > point.z !== b.z > point.z &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x
    )
      result = !result;
  }
  return result;
}

test('the decor plan is deterministic, non-empty and versioned', () => {
  const again = createCityDecorPlan(layout);
  assert.deepEqual(plan, again);
  assert.equal(plan.version, CITY_DECOR_VERSION);
  assert.ok(plan.items.length > 150, `items ${plan.items.length}`);
  assert.ok(plan.cells.length > 0);
  assert.ok(plan.sidewalkRibbons > 0);
  const total = CITY_DECOR_KINDS.reduce((sum, kind) => sum + plan.countsByKind[kind], 0);
  assert.equal(total, plan.items.length);
  for (const kind of ['street-lamp', 'tree', 'trash-can', 'bench', 'hydrant', 'sign'] as const)
    assert.ok(plan.countsByKind[kind] > 0, `${kind} placed`);
  // Same input without mutation: the layout is only read.
  assert.equal(JSON.stringify(layout), JSON.stringify(createCityLayout(map)));
});

test('every item sits on a sidewalk/service zone and clears traffic geometry', () => {
  const issues = verifyCityDecor(plan, layout);
  assert.deepEqual(issues, []);
  const forbidden = layout.elements.filter(
    (element): element is CityPlanarElement =>
      element.kind === 'LANE_SURFACE' ||
      element.kind === 'INTERSECTION_SURFACE' ||
      element.kind === 'CROSSWALK' ||
      element.kind === 'STOP_LINE' ||
      element.kind === 'LANE_MARKING',
  );
  const allowed = layout.elements.filter(
    (element): element is CityPlanarElement =>
      element.kind === 'SIDEWALK' || element.kind === 'SERVICE_ZONE',
  );
  for (const item of plan.items) {
    assert.ok(
      !forbidden.some((element) => inside(item, element.footprintM)),
      `${item.id} on traffic`,
    );
    assert.ok(
      allowed.some((element) => inside(item, element.footprintM)),
      `${item.id} off sidewalk`,
    );
    const [ix, iz] = item.cell.split(':').map(Number) as [number, number];
    assert.ok(item.x >= ix * plan.cellSizeM && item.x < (ix + 1) * plan.cellSizeM);
    assert.ok(item.z >= iz * plan.cellSizeM && item.z < (iz + 1) * plan.cellSizeM);
  }
});

test('a decor item forced onto a lane is rejected by the independent check', () => {
  const lane = layout.elements.find(
    (element): element is CityPlanarElement => element.kind === 'LANE_SURFACE',
  )!;
  const center = lane.footprintM.reduce(
    (sum, vertex) => ({
      x: sum.x + vertex.x / lane.footprintM.length,
      z: sum.z + vertex.z / lane.footprintM.length,
    }),
    { x: 0, z: 0 },
  );
  const tampered: CityDecorPlan = {
    ...plan,
    items: [{ ...plan.items[0]!, x: center.x, z: center.z, cell: '0:0' }],
  };
  const issues = verifyCityDecor(tampered, layout);
  assert.ok(
    issues.some((issue) => issue.includes('clearance')),
    issues.join(', '),
  );
});

test('merged cell geometry is deterministic and reports exact bytes', () => {
  const first = buildCityDecorGeometry(plan);
  const second = buildCityDecorGeometry(plan);
  assert.deepEqual(first, second);
  assert.equal(first.length, plan.cells.length);
  let vertices = 0;
  let indicesCount = 0;
  for (const cell of first) {
    assert.equal(cell.positions.length / 3, cell.vertices);
    assert.equal(cell.positions.length, cell.normals.length);
    assert.equal(cell.positions.length / 3, cell.colors.length / 4);
    assert.ok(cell.indices.every((index) => index < cell.vertices));
    assert.equal(cell.gpuBytes, cell.vertices * 40 + cell.indicesCount * 4);
    vertices += cell.vertices;
    indicesCount += cell.indicesCount;
  }
  assert.ok(vertices > 10_000, `vertices ${vertices}`);
  assert.ok(indicesCount % 3 === 0);
});

test('the decor manifest passes PBI 223 on every preset with an explicit inventory', () => {
  for (const preset of ['LOW', 'MEDIUM', 'HIGH'] as const) {
    const result = cityDecorBudget(plan, preset);
    assert.equal(result.accepted, true, JSON.stringify(result.diagnostics));
    assert.equal(result.totals.transferBytes, 0);
    assert.equal(result.totals.textureGpuBytes, 0);
    assert.equal(result.totals.shaderVariants, 2);
    assert.ok(result.totals.geometryGpuBytes > 0);
  }
  const manifest = cityDecorManifest(plan);
  const inventory = cityDecorInventory(plan);
  assert.equal(inventory.length, manifest.assets.length - 1);
  for (const asset of manifest.assets) {
    if (asset.id === 'city-decor:materials') {
      assert.equal(asset.shaderVariants, 2);
      assert.equal(asset.geometryGpuBytes, 0);
      continue;
    }
    const entry = inventory.find((candidate) => candidate.id === asset.id);
    assert.ok(entry, `inventory ${asset.id}`);
    assert.equal(entry.costBytes, asset.geometryGpuBytes);
    assert.ok(entry.source.trim() && /original/i.test(entry.license));
  }
});

test('36 cells are one mesh each, identity is local and disposal is exact', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const baseline = {
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    nodes: scene.transformNodes.length,
  };
  const decor = createCityDecorScene(scene, layout);
  assert.equal(decor.stats.meshes, decor.plan.cells.length);
  assert.equal(decor.stats.drawCalls, decor.stats.meshes);
  assert.ok(decor.stats.meshes <= 64, `cells ${decor.stats.meshes}`);
  assert.equal(decor.stats.items, plan.items.length);
  const geometry = buildCityDecorGeometry(plan);
  assert.equal(
    decor.stats.vertices,
    geometry.reduce((sum, cell) => sum + cell.vertices, 0),
  );
  for (const cell of decor.plan.cells) {
    const mesh = decor.meshForCell(cell)!;
    assert.ok(mesh);
    assert.equal(decor.itemsInCell(cell).length > 0, true);
    for (const item of decor.itemsInCell(cell)) assert.equal(item.cell, cell);
    const data = mesh.getVerticesData('position')!;
    assert.equal(data.length / 3, geometry.find((entry) => entry.cell === cell)!.vertices);
  }
  decor.dispose();
  decor.dispose();
  assert.deepEqual(
    {
      meshes: scene.meshes.length,
      materials: scene.materials.length,
      nodes: scene.transformNodes.length,
    },
    baseline,
  );
  assert.equal(decor.meshForCell(decor.plan.cells[0]!), null);
});

test('city plus decor keeps the PBI 042 map semantics and alignment intact', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const city = createCityScene(scene, layout);
  const decor = createCityDecorScene(scene, layout);
  const report = createCityLayoutReport(layout, city.getRenderedElementIds());
  assert.deepEqual(report.missingRenderedElementIds, []);
  assert.deepEqual(report.unknownRenderedElementIds, []);
  assert.deepEqual(report.phantomElementIds, []);
  assert.deepEqual(verifyCityAlignment(map, layout), []);
  assert.deepEqual(city.layout, layout);
  assert.equal(decor.plan.items.length > 0, true);
  decor.dispose();
  city.dispose();
  scene.dispose();
  engine.dispose();
});

test('a caller-owned decor material is borrowed, not disposed', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const material = new StandardMaterial('caller-decor', scene);
  const decor = createCityDecorScene(scene, layout, { material });
  decor.dispose();
  assert.equal(scene.materials.includes(material), true);
  material.dispose(false, false);
  scene.dispose();
  engine.dispose();
});
