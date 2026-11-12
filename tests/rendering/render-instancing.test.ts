/// <reference lib="dom" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import '@babylonjs/core/Meshes/instancedMesh.js';
import { VEHICLE_LOD_DISTANCES_M, selectVehicleLod } from '../../src/rendering/vehicle-visuals';
import { LOD_HYSTERESIS_M } from '../../src/rendering/lod-policy';
import { BabylonCellBatches } from '../../src/rendering/babylon/cell-batches';
import { VehiclePickingRegistry } from '../../src/rendering/babylon/vehicle-picking-registry';
import { BabylonVehiclePicker } from '../../src/rendering/babylon/vehicle-picking';
import { createCityScene } from '../../src/rendering/babylon/city-scene';
import { createCityLayout, createNeighbourhoodMap } from '../../src/world';

/**
 * PBI 157 — instancing must not change what the player picks.
 *
 * The same 70 vehicles are built twice on the real contracts: once as ordinary meshes (the
 * pre-instancing shape) and once as thin instances of one batch behind `VehiclePickingRegistry`.
 * A fixed grid of screen rays must resolve to exactly the same entity ID in both worlds, including
 * after a batch reorder, a removal and a LOD switch.
 */
const layout = createCityLayout(createNeighbourhoodMap());

const GRID: readonly (readonly [number, number])[] = Object.freeze(
  Array.from({ length: 48 }, (_, index) => {
    const column = index % 12;
    const row = Math.floor(index / 12);
    return [16 + column * 40, 24 + row * 52] as const;
  }),
);

function vehicleMatrices(): Matrix[] {
  return Array.from({ length: 70 }, (_, index) => {
    const x = (index % 10) * 2.6 - 12;
    const z = Math.floor(index / 10) * 5.4;
    return Matrix.Translation(x, 0.6, z);
  });
}

function world(mode: 'normal' | 'thin') {
  const engine = new NullEngine();
  engine.getCaps().instancedArrays = true;
  const scene = new Scene(engine);
  const camera = new FreeCamera('camera', new Vector3(0, 3.2, -16), scene);
  camera.setTarget(new Vector3(0, 1, 4));
  const picking = new VehiclePickingRegistry(scene);
  const picker = new BabylonVehiclePicker(scene, picking);
  const source = CreateBox('vehicle', { width: 1.8, height: 1.2, depth: 3.5 }, scene);
  source.material = new StandardMaterial('body', scene);
  const matrices = vehicleMatrices();
  const ids = matrices.map((_, index) => `vehicle-${index}`);
  const batches = new BabylonCellBatches(scene, picking);
  if (mode === 'normal') {
    source.setEnabled(false);
    for (let index = 0; index < matrices.length; index += 1) {
      const mesh = source.createInstance(`vehicle-${index}`);
      const position = matrices[index]!.getTranslation();
      mesh.position.set(position.x, position.y, position.z);
      mesh.setEnabled(true);
      picking.register(mesh, ids[index]!);
    }
  } else {
    const far = CreateBox('vehicle-far', { width: 1.8, height: 1.2, depth: 3.5 }, scene);
    far.material = source.material;
    source.setEnabled(false);
    far.setEnabled(false);
    batches.add({
      id: 'traffic',
      cell: '0:0',
      source,
      distantSource: far,
      dynamic: true,
      instances: matrices.map((matrix, index) => ({ entityId: ids[index]!, matrix })),
    });
  }
  const scene_ = {
    scene,
    matrices,
    ids,
    picking,
    batches,
    source,
    project: (x: number, y: number) => picker.pick(x, y)?.entityId ?? null,
    close: () => {
      batches.dispose();
      picker.dispose();
      picking.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
  scene.render();
  return scene_;
}

test('the same ray grid resolves the same vehicle before and after instancing', () => {
  const normal = world('normal');
  const thin = world('thin');
  try {
    let hits = 0;
    for (const [x, y] of GRID) {
      const expected = normal.project(x, y);
      const actual = thin.project(x, y);
      assert.equal(actual, expected, `ray (${x},${y})`);
      if (expected !== null) hits += 1;
    }
    assert.ok(hits >= 8, `the grid must actually hit vehicles (${hits})`);
    assert.equal(thin.batches.metrics.instances, 70);
    assert.equal(thin.scene.meshes.filter((mesh) => mesh.isEnabled()).length <= 3, true);
  } finally {
    normal.close();
    thin.close();
  }
});

test('reorder, removal and LOD keep the instance index → entity identity', () => {
  const thin = world('thin');
  try {
    const before = GRID.map(([x, y]) => thin.project(x, y));
    const reversed = [...thin.matrices].reverse();
    const ids = [...thin.ids].reverse();
    thin.batches.update(
      'traffic',
      reversed.map((matrix, index) => ({ entityId: ids[index]!, matrix })),
    );
    thin.scene.render();
    assert.deepEqual(
      GRID.map(([x, y]) => thin.project(x, y)),
      before,
      'a same-count reorder must not change what the player picks',
    );
    // Removing the first two vehicles must keep every remaining identity stable.
    const kept = reversed.slice(0, 68);
    const keptIds = ids.slice(0, 68);
    thin.batches.update(
      'traffic',
      kept.map((matrix, index) => ({ entityId: keptIds[index]!, matrix })),
    );
    thin.scene.render();
    assert.deepEqual(
      GRID.map(([x, y]) => thin.project(x, y)),
      before,
    );
    // A LOD switch to the far host must keep the same mapping.
    thin.batches.updateLod(new Vector3(0, 0, -2000), 'LOW');
    thin.scene.render();
    assert.deepEqual(
      GRID.map(([x, y]) => thin.project(x, y)),
      before,
    );
    assert.equal(thin.batches.metrics.distantBatches, 1);
    // Motion-only updates keep the mapping too.
    thin.batches.updateTransforms(
      'traffic',
      kept.map((matrix) => Matrix.Translation(matrix.getTranslation().x, 0.6, 5)),
    );
    thin.scene.render();
    assert.notDeepEqual(
      GRID.map(([x, y]) => thin.project(x, y)),
      before,
    );
  } finally {
    thin.close();
  }
});

test('a signal head is not pickable before or after instancing; the city stays presentation-only', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera('camera', new Vector3(0, 3.2, -16), scene);
  camera.setTarget(new Vector3(0, 1, 4));
  const picking = new VehiclePickingRegistry(scene);
  const picker = new BabylonVehiclePicker(scene, picking);
  const city = createCityScene(scene, layout);
  try {
    const heads = layout.elements.filter((element) => element.kind === 'SIGNAL_HEAD');
    for (const head of heads)
      assert.equal(city.meshFor(head.id)!.isPickable, false, `${head.id} host is not pickable`);
    scene.render();
    for (const [x, y] of GRID) assert.equal(picker.pick(x, y), null);
    assert.equal(picking.size, 0);
  } finally {
    city.dispose();
    picker.dispose();
    picking.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test('the vehicle LOD contract is untouched by the batch optimisation', () => {
  // Declared thresholds of PBI 145 (per preset, metres) and the shared 5 m hysteresis.
  assert.deepEqual(VEHICLE_LOD_DISTANCES_M, {
    LOW: { NEAR: 30, MID: 70 },
    MEDIUM: { NEAR: 40, MID: 85 },
    HIGH: { NEAR: 55, MID: 110 },
  });
  assert.equal(selectVehicleLod(10, null, 'MEDIUM'), 'NEAR');
  assert.equal(selectVehicleLod(50, 'NEAR', 'MEDIUM'), 'MID');
  assert.equal(selectVehicleLod(39, 'MID', 'MEDIUM'), 'MID', 'hysteresis keeps MID until 35 m');
  assert.equal(selectVehicleLod(34, 'MID', 'MEDIUM'), 'NEAR');
  assert.equal(LOD_HYSTERESIS_M, 5);
});
