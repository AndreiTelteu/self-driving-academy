import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILDING_MODULES,
  planBuildingModules,
  type BuildingModulePlacement,
} from '../../src/rendering/building-modules';
import { createCityLayout, createNeighbourhoodMap } from '../../src/world';

const layout = createCityLayout(createNeighbourhoodMap());

function buildingBox(elementId: string) {
  const element = layout.elements.find((candidate) => candidate.id === elementId);
  assert.ok(element && element.kind === 'BUILDING');
  const xs = element.footprintM.map((vertex) => vertex.x);
  const zs = element.footprintM.map((vertex) => vertex.z);
  return {
    element,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

test('255: street-level building modules are deterministic and stay on their block', () => {
  const first = planBuildingModules(layout);
  const second = planBuildingModules(layout);
  assert.deepEqual(first, second);
  assert.ok(first.length > 300, `module placements: ${first.length}`);
  const buildingIds = new Set(
    layout.elements.filter((element) => element.kind === 'BUILDING').map((element) => element.id),
  );
  const withModules = new Set(first.map((placement) => placement.elementId));
  assert.deepEqual([...withModules].sort(), [...buildingIds].sort(), 'every block has a module');
  const counts = new Map<string, number>();
  for (const placement of first) {
    assert.ok(Number.isFinite(placement.x) && Number.isFinite(placement.z));
    assert.ok(placement.scale >= 0.4 && placement.scale <= 1.35);
    const spec = BUILDING_MODULES[placement.modelId];
    assert.ok(spec, placement.modelId);
    const box = buildingBox(placement.elementId);
    // Centrul poate sta în interiorul blocului, dar nu mai mult de adâncimea modelului.
    const tolerance = Math.max(spec.widthM, spec.depthM) * placement.scale;
    assert.ok(placement.x >= box.minX - tolerance && placement.x <= box.maxX + tolerance);
    assert.ok(placement.z >= box.minZ - tolerance && placement.z <= box.maxZ + tolerance);
    assert.equal(placement.y, box.element.baseYM);
    // Scara uniformă: modelul nu depășește înălțimea blocului cu mai mult de 10%.
    assert.ok(spec.heightM * placement.scale <= box.element.heightM * 1.1);
    counts.set(placement.modelId, (counts.get(placement.modelId) ?? 0) + 1);
  }
  // Toate tipologiile sunt folosite de orașul real.
  assert.deepEqual([...counts.keys()].sort(), Object.keys(BUILDING_MODULES).sort());
});

test('255: a corner placement keeps its front facing the street and its body inside', () => {
  const placements = planBuildingModules(layout);
  const north = placements.find((placement: BuildingModulePlacement) => placement.yawRad === 0);
  assert.ok(north);
  const box = buildingBox(north.elementId);
  assert.ok(Math.abs(north.z) > 0);
  assert.ok(north.z <= box.maxZ + 1e-6);
  const south = placements.find((placement) => Math.abs(placement.yawRad - Math.PI) < 1e-9);
  assert.ok(south);
  assert.ok(south.z >= buildingBox(south.elementId).minZ - 1e-6);
  const east = placements.find((placement) => Math.abs(placement.yawRad - Math.PI / 2) < 1e-9);
  assert.ok(east);
  assert.ok(east.x <= buildingBox(east.elementId).maxX + 1e-6);
});
