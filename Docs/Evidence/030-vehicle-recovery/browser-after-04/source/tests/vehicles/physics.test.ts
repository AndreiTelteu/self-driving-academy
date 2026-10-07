import assert from 'node:assert/strict';
import { test } from 'node:test';
import { braking, impact, manyContacts, turning } from './physics-fixture';
import { SEDAN, PHYSICS_CONFIG } from '../../src/vehicles';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { createFixedTickLoop } from '../../src/simulation';

test('braking curves are speed squared, brake strength and grip dependent', async () => {
  const slow = await braking(10),
    fast = await braking(20);
  const weak = await braking(20, { ...SEDAN, brakeAcceleration: 4 });
  const wet = await braking(20, { ...SEDAN, grip: 0.6 });
  assert(slow.stopped && fast.stopped && weak.stopped && wet.stopped);
  assert(fast.distance / slow.distance > 3.5 && fast.distance / slow.distance < 4.5);
  assert(fast.distance > 20 && fast.distance < 30);
  assert(weak.distance > fast.distance * 1.7);
  assert(wet.distance > fast.distance * 1.05);
});
test('curb suspension, car collision transfer and CCD wall remain finite', async () => {
  const curb = await impact('curb'),
    cars = await impact('cars'),
    wall = await impact('wall');
  assert(curb.maxHeight > 0.77);
  assert(cars.maxContacts >= 2 && cars.target!.position.z > 12);
  assert(wall.maxContacts >= 2 && wall.final.position.z < 8);
  for (const sample of [curb, cars, wall]) assert(Number.isFinite(sample.final.speed));
});
test('steering changes trajectory under low and high grip', async () => {
  const a = await turning(8, 1.3),
    b = await turning(20, 0.6);
  assert(Math.abs(a.curve.at(-1)!.x) > 5);
  assert(Math.abs(b.curve.at(-1)!.x) > 1);
  assert(a.curve.every((s) => Number.isFinite(s.speed) && s.y > 0.25));
});
test('identical 60Hz physics at 30/60/144 render FPS, including settings', async () => {
  const results = [];
  for (const fps of [30, 60, 144]) {
    const world = await createRapierProbe();
    world.addCar('car', { x: 0, y: 0.8, z: 0 });
    const input = new Map([['car', { throttle: 0.5, brake: 0, steering: 0.1 }]]);
    const loop = createFixedTickLoop({
      captureSnapshot: () => ({ tick: 0 }),
      interpolate: (_, current) => current,
      step: () => {
        world.step(input, false);
      },
    });
    loop.frame(0);
    for (let i = 1; i <= fps * 5; i++) loop.frame((i * 1000) / fps);
    assert.equal(loop.getState().tick, 300);
    assert.equal(loop.getState().overloadCount, 0);
    results.push(world.project('car'));
    loop.dispose();
    world.dispose();
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
  assert.equal(PHYSICS_CONFIG.solverIterations, 8);
  assert.equal(PHYSICS_CONFIG.ccdSubsteps, 4);
});
test('many-contact fixture retains cars and simplified colliders outside camera', async () => {
  const { world, inputs } = await manyContacts();
  let maxContacts = 0;
  for (let i = 0; i < 1800; i++) {
    world.step(inputs, false);
    if (i % 60 === 0) maxContacts = Math.max(maxContacts, world.contacts());
  }
  assert(maxContacts >= 100, `Only ${maxContacts} solver contacts`);
  assert.deepEqual(world.counts(), { vehicles: 70, bodies: 134, colliders: 138 });
  world.dispose();
  world.dispose();
  assert.throws(() => world.counts(), /disposed/);
});
test('invalid batch is rejected before applying commands; caps prevent admission', async () => {
  const world = await createRapierProbe();
  world.addCar('car', { x: 0, y: 0.8, z: 0 });
  assert.throws(
    () => world.step(new Map([['car', { throttle: NaN, brake: 0, steering: 0 }]])),
    /Invalid/,
  );
  assert.throws(() => world.addCar('car', { x: 0, y: 0.8, z: 0 }), /identity/);
  for (let i = 0; i < 96; i++) world.addBox({ x: i, y: 1, z: 0 }, { x: 0.2, y: 0.2, z: 0.2 });
  assert.throws(() => world.addBox({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }), /capacity/);
  world.dispose();
});
