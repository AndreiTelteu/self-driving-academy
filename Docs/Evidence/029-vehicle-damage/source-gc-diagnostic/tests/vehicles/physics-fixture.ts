import { createRapierProbe } from '../../src/vehicles/rapier';
import { SEDAN } from '../../src/vehicles';
import type { CarTuning, PhysicsInput, PhysicsProbe } from '../../src/vehicles';

export const BRAKE: PhysicsInput = Object.freeze({ throttle: 0, brake: 1, steering: 0 });
export async function braking(speed: number, tuning: CarTuning = SEDAN) {
  const world = await createRapierProbe();
  try {
    world.addCar('car', { x: 0, y: 0.8, z: 0 }, tuning);
    for (let i = 0; i < 180; i++) world.step(new Map(), false);
    world.setVelocity('car', { x: 0, y: 0, z: speed });
    const origin = world.project('car').position.z;
    const curve = [];
    let ticks = 0;
    const inputs = new Map([['car', BRAKE]]);
    for (; ticks < 1800; ticks++) {
      world.step(inputs, false);
      const state = world.project('car');
      if (ticks % 6 === 0)
        curve.push({
          seconds: (ticks + 1) / 60,
          speed: state.speed,
          distance: state.position.z - origin,
        });
      if (state.speed < 0.1) break;
    }
    return {
      speed,
      tuning,
      ticks: ticks + 1,
      stopped: ticks < 1800,
      distance: world.project('car').position.z - origin,
      curve,
    };
  } finally {
    world.dispose();
  }
}
export async function turning(speed: number, grip: number) {
  const world = await createRapierProbe();
  try {
    world.addCar('car', { x: 0, y: 0.8, z: 0 }, { ...SEDAN, grip });
    for (let i = 0; i < 180; i++) world.step(new Map(), false);
    world.setVelocity('car', { x: 0, y: 0, z: speed });
    const curve = [];
    for (let i = 0; i < 180; i++) {
      world.step(new Map([['car', { throttle: 0, brake: 0, steering: 0.35 }]]), false);
      if (i % 6 === 0) {
        const s = world.project('car'),
          q = s.rotation;
        const forwardX = 2 * (q.x * q.z + q.w * q.y),
          forwardZ = 1 - 2 * (q.x * q.x + q.y * q.y);
        const lateralSpeed = Math.abs(s.velocity.x * forwardZ - s.velocity.z * forwardX);
        curve.push({
          seconds: (i + 1) / 60,
          x: s.position.x,
          z: s.position.z,
          speed: s.speed,
          lateralSpeed,
          y: s.position.y,
        });
      }
    }
    return {
      initialSpeed: speed,
      grip,
      steeringRadians: 0.35 * SEDAN.steeringRadians,
      geometricRadius: 2.7 / Math.tan(0.35 * SEDAN.steeringRadians),
      maxLateralSpeed: Math.max(...curve.map((s) => s.lateralSpeed)),
      curve,
    };
  } finally {
    world.dispose();
  }
}
export async function impact(kind: 'curb' | 'cars' | 'wall') {
  const world = await createRapierProbe();
  try {
    world.addCar('car', { x: 0, y: 0.8, z: 0 });
    if (kind === 'cars') world.addCar('target', { x: 0, y: 0.8, z: 10 });
    else
      world.addBox(
        { x: 0, y: kind === 'curb' ? 0.09 : 1, z: 10 },
        { x: 4, y: kind === 'curb' ? 0.09 : 1, z: kind === 'curb' ? 0.15 : 0.05 },
      );
    for (let i = 0; i < 180; i++) world.step(new Map(), false);
    world.setVelocity('car', { x: 0, y: 0, z: kind === 'wall' ? 45 : 10 });
    let maxHeight = 0,
      maxContacts = 0;
    for (let i = 0; i < 180; i++) {
      world.step(new Map(), false);
      maxHeight = Math.max(maxHeight, world.project('car').position.y);
      maxContacts = Math.max(maxContacts, world.contacts());
    }
    return {
      kind,
      maxHeight,
      maxContacts,
      final: world.project('car'),
      target: kind === 'cars' ? world.project('target') : null,
    };
  } finally {
    world.dispose();
  }
}
export async function manyContacts(
  count = 70,
): Promise<{ world: PhysicsProbe; inputs: Map<string, PhysicsInput> }> {
  const world = await createRapierProbe();
  const inputs = new Map<string, PhysicsInput>();
  for (let i = 0; i < count; i++) {
    const id = `car-${i}`;
    world.addCar(id, { x: (i % 10) * 2.2 - 10, y: 0.8, z: Math.floor(i / 10) * 4.15 });
    inputs.set(id, { throttle: i % 2 ? 0.65 : 1, brake: 0, steering: i % 2 ? 0.03 : -0.03 });
  }
  world.addBox({ x: 0, y: 1, z: 32 }, { x: 20, y: 1, z: 0.5 });
  world.addBox({ x: -12, y: 1, z: 16 }, { x: 0.5, y: 1, z: 20 });
  world.addBox({ x: 12, y: 1, z: 16 }, { x: 0.5, y: 1, z: 20 });
  for (let i = 0; i < 64; i++)
    world.addBox(
      { x: (i % 8) * 0.65 - 2.5, y: 0.35 + Math.floor(i / 8) * 0.62, z: 30 },
      { x: 0.3, y: 0.3, z: 0.3 },
      true,
    );
  return { world, inputs };
}
