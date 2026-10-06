// Authoring draft: execute only after orchestrator grants an exclusive native CPU slot.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cpus, platform, release } from 'node:os';
import {
  compileLateralTrajectory,
  createLateralController,
  LATERAL_LIMITS,
} from '../src/autonomy/lateral-controller.ts';
import { createVehicleController } from '../src/vehicles/controller.ts';
import { createRapierProbe } from '../src/vehicles/rapier/index.ts';
import { PHYSICS_CONFIG } from '../src/vehicles/physics.ts';
import { vehicleClass } from '../src/vehicles/vehicle-classes.ts';
import { CONTROLLER_CONTEXT, controllerCommand } from '../tests/vehicles/controller-reference.ts';
import { fixtureSpeedCommand } from '../tests/autonomy/lateral-controller-reference.ts';
import { lateralTurnFixture } from '../tests/autonomy/lateral-controller-fixture.ts';

const folder = 'Docs/Evidence/049-lateral-controller',
  output = `${folder}/calibration-v2.json`,
  archive = `${folder}/source-calibration-v2`;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};
assert.equal(await exists(output), false, 'Immutable calibration exists');
assert.equal(await exists(archive), false, 'Immutable archive exists');
const files = execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .map((p) => p.replaceAll('\\', '/'));
files.push(
  'scripts/calibrate-lateral-controller-v2.mjs',
  'tests/autonomy/lateral-controller-fixture.ts',
  'tests/autonomy/lateral-controller-reference.ts',
  'tests/world/fixture.ts',
  'tests/vehicles/controller-reference.ts',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
);
files.sort();
const source = createHash('sha256'),
  inputs = [],
  startedAt = new Date().toISOString();
await mkdir(archive, { recursive: true });
for (const path of files) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  inputs.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  const target = `${archive}/${path}`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')),
  nativeBytes = await readFile(nativePath),
  nativeRelative = 'native-calibration-v2/rapier.mjs';
await mkdir(`${folder}/native-calibration-v2`, { recursive: true });
await writeFile(`${folder}/${nativeRelative}`, nativeBytes);
const nativeArtifact = {
  path: nativePath,
  archiveRelativePath: nativeRelative,
  bytes: nativeBytes.length,
  sha256: hash(nativeBytes),
  archivedAt: new Date().toISOString(),
};
const report = {
  status: 'RUNNING',
  startedAt,
  capturedAt: null,
  sourceHash: source.digest('hex'),
  inputs,
  nativeArtifact,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  cpu: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  runtime: process.version,
  fixtureVersion: '049-actual-native-straight-authored-turn-calibration-v2',
  physicsConfig: PHYSICS_CONFIG,
  limits: LATERAL_LIMITS,
  runs: [],
  infeasible: [],
  scope:
    'Actual native bothclass straight and authored03390degree LEFT/RIGHT TURN at requested3/5/7mps, plus requested7.3mps near empirical corner envelope. Explicit fixture speed commands; no pose/velocity writes after setup. Infeasible cases record real native initial readback and no driving claim. No hardware/FPS/laptop/fullgame proof.',
};

async function arm(classId, requestedSpeedMps, kind) {
  const map = lateralTurnFixture(kind === 'RIGHT'),
    lateralWorld = {
      sessionId: CONTROLLER_CONTEXT.sessionId,
      worldEpoch: 0,
      mapId: map.mapId,
      mapVersionId: '049-turn-fixture-v1',
    };
  const trajectory = compileLateralTrajectory(map, {
    ...lateralWorld,
    version: '049-directed-trajectory-v1',
    id: 'trajectory',
    access: 'CIVIL',
    laneIds: kind === 'STRAIGHT' ? ['lane-a'] : ['lane-a', 'lane-b'],
    loop: false,
  });
  const native = await createRapierProbe(),
    controller = createVehicleController(CONTROLLER_CONTEXT, native),
    owner = createLateralController(lateralWorld);
  const id = 'car',
    positionM = { ...trajectory.points[0], y: 0.8 },
    yaw = Math.PI / 2;
  let maximumCrossTrackM = 0,
    maximumDisplacementM = 0,
    minimumSpeedMps = Infinity,
    maximumSpeedMps = 0,
    previous = positionM,
    completed = false;
  let sawCurve = false;
  const checkpoints = [],
    begin = performance.now();
  try {
    native.addClassCar(id, positionM, classId);
    const identity = native.bodyIdentity(id),
      actor = { id, incarnation: identity.generation };
    native.setPose(identity, {
      positionM,
      rotationQuaternion: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
    });
    native.setBodyVelocity(identity, { x: requestedSpeedMps, y: 0, z: 0 });
    controller.register(identity);
    owner.setActors([{ ...actor, classId }], lateralWorld);
    owner.setTrajectory(actor, trajectory, lateralWorld);
    let ticks = 0;
    for (let tick = 1; tick <= 2400; tick++) {
      const body = native.readBody(identity),
        v = body.velocityMps,
        speed = Math.hypot(v.x, v.z);
      const projection = owner.step({
        ...lateralWorld,
        version: '049-lateral-v1',
        actor,
        tick,
        requestedSpeedMps,
        observation: {
          sourceTick: tick - 1,
          positionM: body.transform.positionM,
          rotationQuaternion: body.transform.rotationQuaternion,
          velocityMps: v,
          discontinuity: false,
        },
      });
      assert.equal(
        projection.feasible,
        true,
        `${classId}/${requestedSpeedMps}/${kind}/${tick}/${projection.reason}`,
      );
      assert(Number.isFinite(projection.crossTrackM));
      maximumCrossTrackM = Math.max(maximumCrossTrackM, projection.crossTrackM);
      if (tick > 60) {
        minimumSpeedMps = Math.min(minimumSpeedMps, speed);
        maximumSpeedMps = Math.max(maximumSpeedMps, speed);
      }
      const displacement = Math.hypot(
        body.transform.positionM.x - previous.x,
        body.transform.positionM.z - previous.z,
      );
      assert(displacement < 1, 'Unexpected native pose discontinuity');
      maximumDisplacementM = Math.max(maximumDisplacementM, displacement);
      previous = body.transform.positionM;
      const packet = controllerCommand(id, tick, 'AUTONOMY', {
        ...fixtureSpeedCommand(requestedSpeedMps, speed),
        steering: projection.steering,
      });
      const realized = controller.step(
        { tick, dtSeconds: 1 / 60 },
        [{ identity, command: packet }],
        [],
        false,
      );
      const state = native.project(id);
      ticks = tick;
      assert(
        Object.values(state.position).every(Number.isFinite) &&
          Object.values(state.rotation).every(Number.isFinite) &&
          Number.isFinite(state.speed),
      );
      if (Math.abs(state.position.z) > 4 && Math.abs(state.position.z) < 15) sawCurve = true;
      if (tick % 30 === 0)
        checkpoints.push({
          tick,
          projection,
          physical: state,
          command: realized.controls[0].command,
        });
      completed =
        kind === 'STRAIGHT'
          ? state.position.x >= -20
          : kind === 'RIGHT'
            ? state.position.z <= -24
            : state.position.z >= 24;
      if (completed) break;
    }
    assert(completed, 'Authored maneuver did not complete');
    assert(kind === 'STRAIGHT' || sawCurve, 'TURN did not traverse actual curve');
    assert.equal(trajectory.authoredTurnCount, kind === 'STRAIGHT' ? 0 : 1);
    assert(checkpoints.length <= 80);
    assert(maximumCrossTrackM <= 1, 'Empirical fixture tracking envelope failed');
    const mechanics = native.readVehicleMechanics(id),
      config = vehicleClass(classId);
    assert.equal(mechanics.massKg, config.massKg);
    assert.equal(mechanics.powerW, config.powerW);
    assert.equal(mechanics.grip, Math.fround(config.grip));
    assert.deepEqual(mechanics.wheels, config.wheels);
    assert.equal(mechanics.turningRadiusM, config.turningRadiusM);
    const final = native.project(id),
      owned = owner.getStats();
    owner.dispose();
    controller.dispose();
    native.dispose();
    assert.equal(owner.getStats().retainedVertices, 0);
    assert.equal(native.bodyResources().entities, 0);
    assert.equal(native.collisionResources().colliders, 0);
    return {
      classId,
      requestedSpeedMps,
      kind,
      ticks,
      elapsedWallMs: performance.now() - begin,
      authoredTurnCount: trajectory.authoredTurnCount,
      maximumCrossTrackM,
      maximumDisplacementM,
      minimumSpeedMps,
      maximumSpeedMps,
      sawCurve,
      completed,
      advisorySpeedLimitMps:
        trajectory.minimumRadiusM === null ? 100 : Math.sqrt(3.5 * trajectory.minimumRadiusM),
      initialPoseWrites: 1,
      initialVelocityWrites: 1,
      drivingPoseWrites: 0,
      drivingVelocityWrites: 0,
      checkpoints,
      final,
      mechanics,
      owned,
      cleanup: {
        lateral: owner.getStats(),
        body: native.bodyResources(),
        collision: native.collisionResources(),
      },
    };
  } finally {
    owner.dispose();
    controller.dispose();
    native.dispose();
  }
}
async function infeasible(classId, kind) {
  const map = lateralTurnFixture(false, kind === 'TOO_TIGHT' ? 2 : 16),
    scope = {
      sessionId: CONTROLLER_CONTEXT.sessionId,
      worldEpoch: 0,
      mapId: map.mapId,
      mapVersionId: '049-infeasible-fixture-v1',
    };
  const trajectory = compileLateralTrajectory(map, {
    ...scope,
    version: '049-directed-trajectory-v1',
    id: 'infeasible',
    access: 'CIVIL',
    laneIds: ['lane-a', 'lane-b'],
    loop: false,
  });
  const native = await createRapierProbe(),
    owner = createLateralController(scope);
  try {
    const positionM = { ...trajectory.points[0], y: 0.8 },
      id = 'car';
    native.addClassCar(id, positionM, classId);
    const identity = native.bodyIdentity(id),
      actor = { id, incarnation: identity.generation };
    native.setPose(identity, {
      positionM,
      rotationQuaternion: { x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) },
    });
    native.setBodyVelocity(identity, { x: 3, y: 0, z: 0 });
    owner.setActors([{ ...actor, classId }], scope);
    owner.setTrajectory(actor, trajectory, scope);
    const body = native.readBody(identity),
      before = native.project(id),
      projection = owner.step({
        ...scope,
        version: '049-lateral-v1',
        actor,
        tick: 1,
        requestedSpeedMps: kind === 'OVERSPEED' ? 12 : 1,
        observation: {
          sourceTick: 0,
          positionM: body.transform.positionM,
          rotationQuaternion: body.transform.rotationQuaternion,
          velocityMps: body.velocityMps,
          discontinuity: false,
        },
      });
    assert.equal(projection.feasible, false);
    assert.equal(
      projection.reason,
      kind === 'OVERSPEED' ? 'REQUESTED_OVERSPEED' : 'MECHANICALLY_INFEASIBLE',
    );
    assert.equal(projection.steering, 0);
    assert.deepEqual(native.project(id), before);
    owner.dispose();
    native.dispose();
    return {
      classId,
      kind,
      projection,
      physicalInitial: before,
      physicalTicks: 0,
      claim:
        'Actual initial native readback and explicit rejection; no following infeasible route/speed claim',
      cleanup: owner.getStats(),
    };
  } finally {
    owner.dispose();
    native.dispose();
  }
}
try {
  for (const classId of ['sedan', 'compact']) {
    for (const speed of [3, 5, 7])
      for (const kind of ['STRAIGHT', 'LEFT', 'RIGHT'])
        report.runs.push(await arm(classId, speed, kind));
    for (const kind of ['LEFT', 'RIGHT']) report.runs.push(await arm(classId, 7.3, kind));
    for (const kind of ['OVERSPEED', 'TOO_TIGHT'])
      report.infeasible.push(await infeasible(classId, kind));
  }
  for (const input of inputs) {
    const bytes = await readFile(input.path);
    assert.equal(bytes.length, input.bytes);
    assert.equal(hash(bytes), input.sha256);
  }
  assert.equal(hash(await readFile(nativePath)), nativeArtifact.sha256);
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.failure = { message: String(error.message), stack: String(error.stack) };
  throw error;
} finally {
  report.capturedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      status: report.status,
      sourceHash: report.sourceHash,
      runs: report.runs.length,
      infeasible: report.infeasible.length,
    }),
  );
}
