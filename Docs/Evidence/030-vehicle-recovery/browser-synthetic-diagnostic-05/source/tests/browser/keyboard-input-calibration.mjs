import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRapierProbe } from '../../src/vehicles/rapier/index.ts';
import { createKeyboardFilter } from '../../src/vehicles/keyboard-filter.ts';
import { createVehicleController } from '../../src/vehicles/controller.ts';
import { createDefaultSettings, KEYBOARD_MAPPING } from '../../src/settings/index.ts';
import { CONTROLLER_CONTEXT } from '../vehicles/controller-reference.ts';

const folder = 'Docs/Evidence/025-keyboard-input';
const destination = `${folder}/calibration.json`;
try {
  await access(destination);
  throw new Error('Immutable calibration already exists');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const inputPaths = execFileSync('rg', ['--files', 'src/settings', 'src/vehicles', 'src/sessions'], {
  encoding: 'utf8',
})
  .trim()
  .split(/\r?\n/)
  .map((path) => path.replaceAll('\\', '/'));
inputPaths.push(
  'tests/browser/keyboard-input-calibration.mjs',
  'tests/vehicles/controller-reference.ts',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
);
inputPaths.sort();
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')),
  nativeBytes = await readFile(nativePath);
const nativeArtifact = {
  path: nativePath,
  bytes: nativeBytes.length,
  sha256: createHash('sha256').update(nativeBytes).digest('hex'),
};
const source = createHash('sha256');
const sourceArchive = `${folder}/source-calibration`;
await mkdir(sourceArchive, { recursive: false });
await writeFile(`${sourceArchive}/.gitattributes`, '* -text\n');
for (const path of inputPaths) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  const target = `${sourceArchive}/${path}`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
const runs = [];
for (const classId of ['sedan', 'compact'])
  for (const slider of [0, 50, 100]) {
    const world = await createRapierProbe();
    world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, classId);
    const identity = world.bodyIdentity('car'),
      controller = createVehicleController(CONTROLLER_CONTEXT, world);
    controller.register(identity);
    const control = {
      ...createDefaultSettings('025-calibration').input.control,
      steeringSensitivity: slider,
      returnRate: slider,
      speedAttenuation: slider,
      throttleRamp: slider,
      brakeRamp: slider,
    };
    const filter = createKeyboardFilter(CONTROLLER_CONTEXT, 'car', control);
    let tick = 0;
    const curves = [];
    const advance = (label) => {
      const time = { tick: ++tick, dtSeconds: 1 / 60 };
      const input = filter.step({ ...time, speedMps: world.project('car').speed });
      controller.step(
        time,
        [{ identity, command: input.command }],
        tick === 1 ? [{ identity, mode: 'MANUAL' }] : [],
        false,
      );
      const state = world.project('car');
      for (const value of [
        state.position.x,
        state.position.y,
        state.position.z,
        state.speed,
        input.command.throttle,
        input.command.brake,
        input.command.steering,
      ])
        assert(Number.isFinite(value));
      if (tick % 6 === 0)
        curves.push({
          label,
          tick,
          speed: state.speed,
          position: { ...state.position },
          raw: {
            throttle: input.raw.throttle,
            brake: input.raw.brake,
            steering: input.raw.steering,
          },
          command: {
            throttle: input.command.throttle,
            brake: input.command.brake,
            steering: input.command.steering,
          },
          steeringFactor: input.steeringFactor,
        });
      return input;
    };
    try {
      for (let i = 0; i < 180; i++) advance('settle');
      const mechanicsBefore = world.readVehicleMechanics('car');
      filter.setAction('throttle', true);
      let throttleFullTick = null;
      for (let i = 0; i < 120; i++) {
        const input = advance('accelerate');
        if (input.command.throttle === 1 && throttleFullTick === null) throttleFullTick = i + 1;
      }
      const accelerationSpeed = world.project('car').speed;
      assert(accelerationSpeed > 0.5);
      assert(throttleFullTick !== null);
      filter.setAction('throttle', false);
      assert.equal(advance('release').command.throttle, 0);
      // Same mechanical moving state for every slider's independent turn and braking arm.
      world.setPose(identity, {
        positionM: { x: 0, y: 0.8, z: 0 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      });
      world.setVelocity('car', { x: 0, y: 0, z: 25 });
      filter.clear();
      filter.setAction('steerRight', true);
      let maximumSteering = 0;
      for (let i = 0; i < 60; i++) {
        const input = advance('turn25mps');
        maximumSteering = Math.max(maximumSteering, input.command.steering);
        assert(input.command.steering <= input.steeringFactor + 1e-12);
      }
      const turn = world.project('car');
      filter.setAction('steerRight', false);
      let returnTicks = 0;
      while (returnTicks < 180) {
        returnTicks++;
        if (advance('return').command.steering === 0) break;
      }
      assert(returnTicks < 180);
      filter.clear();
      world.setPose(identity, {
        positionM: { x: 0, y: 0.8, z: 0 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      });
      world.setVelocity('car', { x: 0, y: 0, z: 25 });
      const brakeStart = world.project('car').position.z;
      filter.setAction('brake', true);
      let stopTicks = 0,
        brakeFullTick = null;
      while (stopTicks < 900) {
        const input = advance('brake25mps');
        stopTicks++;
        if (input.command.brake === 1 && brakeFullTick === null) brakeFullTick = stopTicks;
        if (world.project('car').speed < 0.1) break;
      }
      assert(stopTicks < 900);
      assert(brakeFullTick !== null);
      const brakingDistance = world.project('car').position.z - brakeStart;
      assert(brakingDistance > 0 && brakingDistance < 150);
      const mechanicsAfter = world.readVehicleMechanics('car');
      for (const key of Object.keys(mechanicsBefore).filter(
        (key) =>
          !['wheelBrakeImpulseLimitNs', 'appliedEngineForceN', 'appliedSteeringRadians'].includes(
            key,
          ),
      ))
        assert.deepEqual(
          mechanicsAfter[key],
          mechanicsBefore[key],
          `Preferences altered mechanics ${key}`,
        );
      runs.push({
        classId,
        slider,
        control,
        throttleFullTick,
        accelerationSpeed,
        maximumSteering,
        returnTicks,
        brakeFullTick,
        stopTicks,
        brakingDistance,
        turnPosition: { ...turn.position },
        curves,
      });
    } finally {
      filter.dispose();
      controller.dispose();
      world.dispose();
      assert.equal(filter.getStats().heldKeys, 0);
      assert.equal(world.bodyResources().entities, 0);
      assert.equal(world.collisionResources().colliders, 0);
    }
  }
for (const classId of ['sedan', 'compact']) {
  const group = runs.filter((run) => run.classId === classId);
  assert(
    group[0].throttleFullTick > group[1].throttleFullTick &&
      group[1].throttleFullTick > group[2].throttleFullTick,
  );
  assert(
    group[0].brakeFullTick > group[1].brakeFullTick &&
      group[1].brakeFullTick > group[2].brakeFullTick,
  );
  assert(group[0].brakingDistance > group[2].brakingDistance);
}
const report = {
  status: 'PASS',
  fixtureVersion: '025-two-class-extremes-v1',
  capturedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: source.digest('hex'),
  inputPaths,
  nativeArtifact,
  mapping: KEYBOARD_MAPPING,
  scope:
    'Finite calibrated input endpoints/ramp/full/return/moving braking curves on real Rapier sedan+compact. Keyboard assistance only; no tyre/suspension/reverse/global gameplay calibration.',
  runs,
};
await mkdir(folder, { recursive: true });
await writeFile(destination, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({ status: report.status, runs: runs.length, sourceHash: report.sourceHash }),
);
