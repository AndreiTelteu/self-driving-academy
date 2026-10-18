import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRapierProbe } from '../../src/vehicles/rapier/index.ts';
import { createVehicleController } from '../../src/vehicles/controller.ts';
import { createBrakingReverseKeyboardFilter } from '../../src/vehicles/braking-reverse-input.ts';
import { DRIVETRAIN_LIMITS } from '../../src/vehicles/drivetrain.ts';
import { createDefaultSettings } from '../../src/settings/index.ts';
import { CONTROLLER_CONTEXT } from '../vehicles/controller-reference.ts';

const folder = 'Docs/Evidence/027-braking-reverse',
  destination = `${folder}/calibration.json`;
try {
  await access(destination);
  throw new Error('Immutable calibration already exists');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const inputPaths = execFileSync(
  'rg',
  ['--files', 'src/vehicles', 'src/input', 'src/settings', 'src/sessions'],
  { encoding: 'utf8' },
)
  .trim()
  .split(/\r?\n/)
  .map((path) => path.replaceAll('\\', '/'));
inputPaths.push(
  'tests/browser/braking-reverse-calibration.mjs',
  'tests/vehicles/controller-reference.ts',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
);
inputPaths.sort();
const source = createHash('sha256'),
  inputs = [];
await mkdir(`${folder}/source-calibration`, { recursive: false });
await writeFile(`${folder}/source-calibration/.gitattributes`, '* -text\n');
for (const path of inputPaths) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  inputs.push({
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  const target = `${folder}/source-calibration/${path}`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')),
  nativeBytes = await readFile(nativePath),
  nativeArtifact = {
    path: nativePath,
    bytes: nativeBytes.length,
    sha256: createHash('sha256').update(nativeBytes).digest('hex'),
  };
const runs = [],
  turns = [];
async function setup(classId, slider) {
  const world = await createRapierProbe();
  world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, classId);
  for (let index = 0; index < 180; index++) world.step(new Map(), false);
  const identity = world.bodyIdentity('car'),
    controller = createVehicleController(CONTROLLER_CONTEXT, world, 0, {
      drivetrainVersion: DRIVETRAIN_LIMITS.version,
    });
  controller.register(identity);
  const control = {
    ...createDefaultSettings('027-calibration').input.control,
    steeringSensitivity: slider,
    returnRate: slider,
    speedAttenuation: slider,
    throttleRamp: slider,
    brakeRamp: slider,
  };
  const filter = createBrakingReverseKeyboardFilter(CONTROLLER_CONTEXT, 'car', control),
    mechanicsBefore = world.readVehicleMechanics('car');
  let tick = 0;
  const curves = [];
  function step(label) {
    const time = { tick: ++tick, dtSeconds: 1 / 60 },
      input = filter.step({ ...time, speedMps: world.project('car').speed }),
      frame = controller.step(
        time,
        [{ identity, command: input.command }],
        tick === 1 ? [{ identity, mode: 'MANUAL' }] : [],
        false,
      ),
      realized = frame.controls[0],
      physical = world.project('car');
    for (const value of [
      ...Object.values(physical.position),
      ...Object.values(physical.velocity),
      ...Object.values(physical.rotation),
    ])
      assert(Number.isFinite(value));
    assert(physical.speed < 100 && Math.abs(physical.position.y) < 10);
    if (tick % 6 === 0) curves.push({ label, tick, input, realized, physical });
    return { input, realized, physical, tick };
  }
  function close() {
    filter.dispose();
    controller.dispose();
    world.dispose();
    assert.equal(filter.getStats().heldKeys, 0);
    assert.equal(controller.getStats().drivetrain.states, 0);
    assert.equal(world.bodyResources().entities, 0);
    assert.equal(world.collisionResources().colliders, 0);
  }
  function unchanged() {
    const after = world.readVehicleMechanics('car');
    for (const key of [
      'classId',
      'version',
      'massKg',
      'powerW',
      'grip',
      'brakeAccelerationMps2',
      'wheels',
      'turningRadiusM',
    ])
      assert.deepEqual(after[key], mechanicsBefore[key]);
    return after;
  }
  return { world, controller, filter, control, identity, curves, step, close, unchanged };
}
for (const classId of ['sedan', 'compact'])
  for (const slider of [0, 50, 100]) {
    const arm = await setup(classId, slider);
    arm.world.setVelocity('car', { x: 0, y: 0, z: 20 });
    arm.filter.setAction('brake', true);
    let reverseEngagedTick = null,
      reverseMotionTick = null,
      forwardEngagedTick = null,
      forwardMotionTick = null,
      reverseEngagement = null,
      forwardEngagement = null;
    const startZ = arm.world.project('car').position.z;
    try {
      for (let index = 0; index < 1200; index++) {
        const sample = arm.step('brake-forward-then-reverse'),
          drive = sample.realized.drivetrain;
        assert.equal(sample.input.raw.brake, 1);
        assert.equal(sample.input.raw.throttle, 0);
        if (drive.engagedDirection === 'REVERSE' && reverseEngagedTick === null) {
          reverseEngagedTick = sample.tick;
          reverseEngagement = {
            tick: sample.tick,
            dwell: drive.nearZeroTicks,
            motion: drive.motion,
            position: sample.physical.position,
          };
          assert.equal(drive.nearZeroTicks, 6);
          assert(drive.motion.totalSpeedMps <= 0.2);
        }
        if (reverseEngagedTick === null) {
          assert.equal(drive.physicalInput.throttle, 0);
          assert(sample.realized.command.brake > 0);
          assert(
            arm.world.readVehicleMechanics('car').appliedEngineForceN.every((force) => force === 0),
          );
        }
        if (sample.physical.velocity.z < -3) {
          reverseMotionTick = sample.tick;
          break;
        }
      }
      assert(reverseEngagedTick > 6 && reverseMotionTick !== null);
      arm.filter.setAction('brake', false);
      arm.filter.setAction('throttle', true);
      for (let index = 0; index < 1200; index++) {
        const sample = arm.step('brake-reverse-then-forward'),
          drive = sample.realized.drivetrain;
        if (drive.engagedDirection === 'FORWARD' && forwardEngagedTick === null) {
          forwardEngagedTick = sample.tick;
          forwardEngagement = {
            tick: sample.tick,
            dwell: drive.nearZeroTicks,
            motion: drive.motion,
            position: sample.physical.position,
          };
          assert.equal(drive.nearZeroTicks, 6);
          assert(drive.motion.totalSpeedMps <= 0.2);
        }
        if (forwardEngagedTick === null) assert.equal(drive.physicalInput.throttle, 0);
        if (sample.physical.velocity.z > 3) {
          forwardMotionTick = sample.tick;
          break;
        }
      }
      assert(forwardEngagedTick > reverseMotionTick && forwardMotionTick !== null);
      runs.push({
        classId,
        slider,
        control: arm.control,
        reverseEngagedTick,
        reverseMotionTick,
        forwardEngagedTick,
        forwardMotionTick,
        forwardBrakingDistance: reverseEngagement.position.z - startZ,
        reverseEngagement,
        forwardEngagement,
        mechanics: arm.unchanged(),
        curves: arm.curves,
      });
    } finally {
      arm.close();
    }
  }
for (const classId of ['sedan', 'compact'])
  for (const handbrake of [false, true]) {
    const arm = await setup(classId, 50);
    arm.world.setVelocity('car', { x: 0, y: 0, z: 8 });
    arm.filter.setAction('steerRight', true);
    arm.filter.setAction('handbrake', handbrake);
    let distance = 0,
      last = arm.world.project('car').position;
    try {
      for (let index = 0; index < 180; index++) {
        const sample = arm.step('handbrake-turn');
        distance += Math.hypot(
          sample.physical.position.x - last.x,
          sample.physical.position.z - last.z,
        );
        last = sample.physical.position;
        assert.equal(sample.realized.drivetrain.physicalInput.throttle, 0);
      }
      const mechanics = arm.unchanged();
      assert.equal(mechanics.wheelBrakeImpulseLimitNs[0], 0);
      assert.equal(mechanics.wheelBrakeImpulseLimitNs[1], 0);
      assert.equal(mechanics.wheelBrakeImpulseLimitNs[2] > 0, handbrake);
      assert.equal(mechanics.wheelBrakeImpulseLimitNs[3] > 0, handbrake);
      turns.push({
        classId,
        handbrake,
        distance,
        final: arm.world.project('car'),
        mechanics,
        curves: arm.curves,
      });
    } finally {
      arm.close();
    }
  }
for (const classId of ['sedan', 'compact']) {
  const group = turns.filter((turn) => turn.classId === classId);
  assert(group[1].distance < group[0].distance);
  assert(group[1].final.speed < group[0].final.speed);
}
for (const input of inputs)
  assert.equal(
    createHash('sha256')
      .update(await readFile(input.path))
      .digest('hex'),
    input.sha256,
    'Source drift',
  );
assert.equal(
  createHash('sha256')
    .update(await readFile(nativePath))
    .digest('hex'),
  nativeArtifact.sha256,
  'Native drift',
);
const report = {
  status: 'PASS',
  capturedAt: new Date().toISOString(),
  fixtureVersion: '027-maneuvers-two-classes-v1',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: source.digest('hex'),
  inputs,
  nativeArtifact,
  guards: DRIVETRAIN_LIMITS,
  runs,
  turns,
  scope:
    'Actual stop/reverse/return-forward at0/50/100 plus rear-handbrake turn/control on sedan+compact. No transmission/ABS/tyre/grip tuning, gameplay FPS or laptop claim.',
};
await writeFile(destination, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    status: report.status,
    sourceHash: report.sourceHash,
    runs: runs.length,
    turns: turns.length,
  }),
);
