import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { createVehicleVisualStage } from '../../src/rendering/babylon/vehicle-scene';
import type { VehicleVisualStage } from '../../src/rendering/babylon/vehicle-scene';
import { VEHICLE_CLASSES } from '../../src/vehicles';
import type { VisualTransform } from '../../src/rendering';

function pose(x: number, z: number): VisualTransform {
  return Object.freeze({
    positionM: Object.freeze({ x, y: 0.8, z }),
    rotationQuaternion: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
  });
}
function withStage(run: (scene: Scene, stage: VehicleVisualStage) => void): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const stage = createVehicleVisualStage(scene, { preset: 'MEDIUM' });
  try {
    run(scene, stage);
  } finally {
    stage.dispose();
    scene.dispose();
    engine.dispose();
  }
}

test('a representation exposes four pivots on the mechanical track/wheelbase', () => {
  withStage((scene, stage) => {
    const vehicle = stage.create('taxi:1', 'sedan', pose(0, 0));
    const mechanical = VEHICLE_CLASSES.sedan.wheels;
    for (const pivot of vehicle.wheelPivots) {
      assert.equal(Math.abs(pivot.position.x) * 2, mechanical.trackM);
      assert.equal(Math.abs(pivot.position.z) * 2, mechanical.wheelbaseM);
      assert.equal(pivot.parent, vehicle.root);
      assert.ok(pivot.name.startsWith('vehicle:taxi:1:wheel-pivot:'));
    }
    assert.equal(vehicle.wheelPivot('front-left')!.position.x, -mechanical.trackM / 2);
    assert.equal(vehicle.wheelPivot('front-left')!.position.z, mechanical.wheelbaseM / 2);
    assert.equal(vehicle.wheelPivot('rear-right')!.position.z, -mechanical.wheelbaseM / 2);
    assert.equal(vehicle.wheelPivot('unknown'), undefined);
    assert.equal(stage.size, 1);
    // The entity ID is resolvable from any body/wheel child, not only from the root.
    const body = scene.meshes.find((mesh) => mesh.name.endsWith(':body'))!;
    assert.equal(stage.entityIdFor(body), 'taxi:1');
    const wheel = scene.meshes.find((mesh) => mesh.name === 'vehicle:taxi:1:wheel:rear-left')!;
    assert.ok(wheel);
    assert.equal(stage.entityIdFor(wheel), 'taxi:1');
  });
});

test('LOD switches visibility without recreating nodes or changing entity IDs', () => {
  withStage((scene, stage) => {
    const vehicle = stage.create('taxi:2', 'compact', pose(4, 8));
    const body = scene.meshes.find((mesh) => mesh.name.endsWith(':body'))!;
    const pivot = vehicle.wheelPivot('front-right')!;
    const nearMeshes = vehicle.metrics.meshes;
    assert.equal(vehicle.lod, 'NEAR');
    vehicle.setLod('MID');
    assert.equal(vehicle.lod, 'MID');
    assert.equal(vehicle.metrics.meshes, nearMeshes, 'same detail meshes at MID');
    assert.equal(vehicle.metrics.drawCalls, 4);
    vehicle.setLod('FAR');
    assert.equal(vehicle.metrics.drawCalls, 1);
    assert.ok(vehicle.metrics.meshes < nearMeshes);
    assert.equal(stage.entityIdFor(body), 'taxi:2');
    assert.equal(vehicle.wheelPivot('front-right'), pivot);
    assert.equal(stage.size, 1);
    assert.equal(vehicle.root.name, 'vehicle:taxi:2');
    vehicle.setLod('FAR');
    assert.equal(vehicle.lod, 'FAR');
    assert.throws(() => vehicle.setLod('ULTRA' as 'NEAR'), RangeError);
  });
});

test('physical wheel poses drive pivots and wheel spin without touching identity', () => {
  withStage((scene, stage) => {
    const vehicle = stage.create('taxi:3', 'sedan', pose(0, 0));
    const poses = (['front-left', 'front-right', 'rear-left', 'rear-right'] as const).map(
      (wheelId, index) => ({
        wheelId,
        transform: {
          positionM: { x: index % 2 === 0 ? -0.9 : 0.9, y: -0.44, z: index < 2 ? 1.35 : -1.35 },
          rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
        },
        spinRad: 1.25 * (index + 1),
        steeringRad: index < 2 ? 0.2 : 0,
      }),
    );
    vehicle.applyWheels(poses);
    const front = vehicle.wheelPivot('front-left')!;
    assert.ok(Math.abs(front.position.y + 0.44) < 1e-9);
    assert.ok(Math.abs(front.rotationQuaternion!.y - Math.sin(0.1)) < 1e-9);
    const rear = vehicle.wheelPivot('rear-right')!;
    assert.equal(rear.rotationQuaternion!.y, 0);
    const wheel = scene.meshes.find((mesh) => mesh.name === 'vehicle:taxi:3:wheel:rear-right')!;
    assert.ok(Math.abs(wheel.rotationQuaternion!.x - Math.sin(5 / 2)) < 1e-9);
    assert.equal(stage.entityIdFor(wheel), 'taxi:3');
    assert.throws(() => vehicle.applyWheels(poses.slice(0, 3)), RangeError);
    assert.throws(
      () => vehicle.applyWheels([...poses.slice(0, 3), { ...poses[3]!, wheelId: 'middle' }]),
      RangeError,
    );
  });
});

test('light states change draw calls and visibility, never geometry or identity', () => {
  withStage((scene, stage) => {
    const vehicle = stage.create('taxi:4', 'sedan', pose(0, 0));
    const enabled = (suffix: string) =>
      scene.meshes.find((mesh) => mesh.name.endsWith(suffix))!.isEnabled();
    const base = vehicle.metrics.drawCalls;
    vehicle.setLights({ headlights: true, brake: true, turn: 'LEFT' });
    assert.equal(enabled(':headlight'), true);
    assert.equal(enabled(':brake'), true);
    assert.equal(enabled(':signal_left'), true);
    assert.equal(enabled(':signal_right'), false);
    assert.ok(vehicle.metrics.drawCalls > base);
    vehicle.setLights({ headlights: false, brake: false, turn: 'HAZARD' });
    assert.equal(enabled(':headlight'), false);
    assert.equal(enabled(':brake'), false);
    assert.equal(enabled(':signal_left'), true);
    assert.equal(enabled(':signal_right'), true);
    assert.equal(
      stage.entityIdFor(scene.meshes.find((mesh) => mesh.name.endsWith(':body'))!),
      'taxi:4',
    );
  });
});

test('stage LOD follows camera distance and keeps every entity resolvable', () => {
  withStage((_scene, stage) => {
    for (const [index, x] of [0, 60, 200].entries()) {
      stage.create(`taxi:${index}`, index % 2 === 0 ? 'sedan' : 'compact', pose(x, 0));
    }
    stage.updateLod(new Vector3(0, 1.5, 0));
    const counts = stage.metrics.lodCounts;
    assert.equal(counts.NEAR, 1);
    assert.equal(counts.MID, 1);
    assert.equal(counts.FAR, 1);
    assert.equal(stage.metrics.vehicles, 3);
    assert.equal(stage.metrics.materials, 4);
    assert.equal(stage.metrics.shaderVariants, 8);
    for (let index = 0; index < 3; index += 1) {
      const vehicle = stage.get(`taxi:${index}`)!;
      assert.equal(stage.entityIdFor(vehicle.root), `taxi:${index}`);
    }
    assert.throws(() => stage.updateLod(new Vector3(NaN, 0, 0)), Error);
  });
});

test('disposal returns the scene to exactly its baseline and is idempotent', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const baseline = {
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    nodes: scene.transformNodes.length,
  };
  const stage = createVehicleVisualStage(scene, { preset: 'LOW' });
  stage.create('taxi:1', 'sedan', pose(0, 0));
  stage.create('taxi:2', 'compact', pose(10, 0));
  assert.ok(scene.meshes.length > baseline.meshes);
  assert.equal(stage.remove('taxi:1'), true);
  assert.equal(stage.remove('taxi:1'), false);
  stage.dispose();
  stage.dispose();
  assert.equal(stage.size, 0);
  assert.deepEqual(
    {
      meshes: scene.meshes.length,
      materials: scene.materials.length,
      nodes: scene.transformNodes.length,
    },
    baseline,
  );
  // The same engine/scene can host a second stage after a full cleanup.
  const again = createVehicleVisualStage(scene, { preset: 'LOW' });
  again.create('taxi:3', 'sedan', pose(0, 0));
  assert.equal(again.size, 1);
  again.dispose();
  assert.equal(scene.meshes.length, baseline.meshes);
  scene.dispose();
  engine.dispose();
});
