import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyPhysicalWheels, projectPhysicalWheels } from '../../src/rendering';
import { createRapierProbe } from '../../src/vehicles/rapier';

test('wheel presentation preserves old poses and isolates mutable caller vectors', async () => {
  const world = await createRapierProbe();
  try {
    world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, 'sedan');
    const state = world.project('car');
    const pose = projectPhysicalWheels(state, '1');
    const oldPose = JSON.stringify(pose);
    world.step(new Map([['car', { throttle: 1, brake: 0, steering: 0.5 }]]), false);
    assert.equal(JSON.stringify(pose), oldPose);
    assert.throws(() => {
      (pose.wheels[0]!.transform.positionM as { y: number }).y = 100;
    }, TypeError);
    const position = { ...state.position };
    const wheelPosition = { ...state.wheels[0]!.localPositionM };
    const mutable = {
      ...state,
      position,
      wheels: state.wheels.map((wheel, index) =>
        index ? wheel : { ...wheel, localPositionM: wheelPosition },
      ),
    };
    const isolated = projectPhysicalWheels(mutable, '1');
    const captured = JSON.stringify(isolated);
    position.x = 100;
    wheelPosition.y = 100;
    assert.equal(JSON.stringify(isolated), captured);
    assert.throws(() => {
      (isolated.wheels[0]!.transform.rotationQuaternion as { w: number }).w = 0;
    }, TypeError);
  } finally {
    world.dispose();
  }
});

test('scalar wheel application matches immutable poses without changing native snapshots', async () => {
  const world = await createRapierProbe();
  try {
    world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, 'sedan');
    const values: number[][] = [];
    const apply = (target: number[][], index: number, ...scalars: number[]) => {
      target[index] = scalars;
    };
    for (let tick = 0; tick < 30; tick++) {
      world.step(new Map([['car', { throttle: 1, brake: 0, steering: 0.5 }]]), false);
      const state = world.project('car');
      const original = JSON.stringify(state);
      const pose = projectPhysicalWheels(state, '1');
      assert(world.projectVisual);
      const visualState = world.projectVisual('car');
      assert.deepEqual(visualState.position, state.position);
      assert.deepEqual(visualState.rotation, state.rotation);
      const oldVisual = JSON.stringify(visualState);
      applyPhysicalWheels(visualState, values, apply);
      assert.deepEqual(
        values,
        pose.wheels.map((wheel) => {
          const p = wheel.transform.positionM;
          return [p.x, p.y, p.z, wheel.steeringRad, wheel.spinRad];
        }),
      );
      assert.equal(JSON.stringify(state), original);
      values[0]![0] = 100;
      assert.equal(JSON.stringify(state), original);
      assert.equal(JSON.stringify(visualState), oldVisual);
      assert.throws(() => {
        (visualState.wheels[0]!.localPositionM as { y: number }).y = 100;
      }, TypeError);
    }
  } finally {
    world.dispose();
  }
  assert.throws(() => world.projectVisual!('car'), /disposed/i);
});
