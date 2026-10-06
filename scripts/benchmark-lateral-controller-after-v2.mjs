// Execute ONLY with orchestrator exclusive CPU grant; no049 production before accepted BEFORE.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import {
  compileLateralTrajectory,
  createLateralController,
} from '../src/autonomy/lateral-controller.ts';
import { createLaneGraph } from '../src/world/lane-graph.ts';
import { createVehicleController } from '../src/vehicles/controller.ts';
import { createRapierProbe } from '../src/vehicles/rapier/index.ts';
import { vehicleClass } from '../src/vehicles/vehicle-classes.ts';
import { CONTROLLER_CONTEXT, controllerCommand } from '../tests/vehicles/controller-reference.ts';
import {
  lateralFixture,
  fixtureSpeedCommand,
} from '../tests/autonomy/lateral-controller-reference.ts';

const folder = 'Docs/Evidence/049-lateral-controller',
  output = `${folder}/after-v2.json`,
  archive = `${folder}/source-after-v2`;
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};
assert.equal(await exists(output), false, 'Immutable BEFORE already exists');
assert.equal(await exists(archive), false, 'Immutable source already exists');
assert.equal(
  await exists('src/autonomy/lateral-controller.ts'),
  true,
  'Production required for AFTER',
);
const startedAt = new Date().toISOString();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .map((p) => p.replaceAll('\\', '/'));
files.push(
  'scripts/benchmark-lateral-controller-after-v2.mjs',
  'tests/autonomy/lateral-controller-reference.ts',
  'tests/vehicles/controller-reference.ts',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
);
files.sort();
const source = createHash('sha256'),
  inputs = [];
await mkdir(archive, { recursive: true });
await writeFile(`${folder}/.gitattributes`, '* -text\n');
for (const path of files) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  inputs.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  const target = `${archive}/${path}`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat'));
const nativeBytes = await readFile(nativePath),
  nativeRelativePath = 'native-after-v2/rapier.mjs';
await mkdir(`${folder}/native-after-v2`, { recursive: true });
await writeFile(`${folder}/${nativeRelativePath}`, nativeBytes);
const nativeArtifact = {
  path: nativePath,
  archiveRelativePath: nativeRelativePath,
  bytes: nativeBytes.length,
  sha256: hash(nativeBytes),
  archivedAt: new Date().toISOString(),
  archiveTiming: 'Actual installed bytes copied before native runs',
};
const report = {
  status: 'RUNNING',
  startedAt,
  capturedAt: null,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: source.digest('hex'),
  inputs,
  nativeArtifact,
  fixtureVersion: '049-native-separated-curves-owner-after-v1',
  budgetVersion: '203-initial-1',
  runtime: process.version,
  cpu: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  runs: [],
  parity: [],
  scope:
    'Node AFTER of actual049 owner replacing the independent steering reference, actual033 authored closed directedpaths and unchanged024/Rapier. Fixture-owned proportional speed command is separate from049 lateral policy.70normal/110overload,180warm600measured,5alternating observerpairs. Initialpose/velocity writes only before tick1; no later teleport. No intersectionTURN validation, rendering/FPS/hardware/fullgame/laptop claim. Candidate tracking/speed envelope must be reviewed before production.',
};
const distribution = (values) => {
  const v = [...values].sort((a, b) => a - b);
  return {
    p50: v[Math.floor((v.length - 1) * 0.5)],
    p95: v[Math.floor((v.length - 1) * 0.95)],
    p99: v[Math.floor((v.length - 1) * 0.99)],
  };
};
async function run(count, pair, observer, manual = false, singleClass = null) {
  const graphs = Array.from({ length: count }, (_, i) => createLaneGraph(lateralFixture(1, i))),
    world = await createRapierProbe();
  const controller = createVehicleController(CONTROLLER_CONTEXT, world),
    entries = [];
  const lateralWorld = {
    sessionId: CONTROLLER_CONTEXT.sessionId,
    worldEpoch: CONTROLLER_CONTEXT.worldEpoch,
    mapId: '049-separated-curves-v1',
    mapVersionId: '049-fixture-v1',
  };
  const lateralOwner = createLateralController(lateralWorld);
  try {
    for (let i = 0; i < count; i++) {
      const id = `car-${i}`,
        classId = singleClass ?? (i % 2 ? 'compact' : 'sedan');
      const path = graphs[i].getDirectedPath(`lane-${i}`),
        speed = [3, 5, 7][Math.floor(i / 3) % 3];
      const positionM = { ...path.points[0], y: 0.8 };
      const a = path.points[0],
        b = path.points[1],
        yaw = Math.atan2(b.x - a.x, b.z - a.z);
      world.addClassCar(id, positionM, classId);
      const identity = world.bodyIdentity(id);
      world.setPose(identity, {
        positionM,
        rotationQuaternion: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
      });
      world.setBodyVelocity(identity, { x: Math.sin(yaw) * speed, y: 0, z: Math.cos(yaw) * speed });
      controller.register(identity);
      entries.push({
        id,
        identity,
        config: vehicleClass(classId),
        path,
        speed,
        previous: positionM,
      });
    }
    const compilationStart = performance.now();
    lateralOwner.setActors(
      entries.map((entry) => ({
        id: entry.id,
        incarnation: entry.identity.generation,
        classId: entry.config.classId,
      })),
      lateralWorld,
    );
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i],
        trajectory = compileLateralTrajectory(lateralFixture(1, i), {
          ...lateralWorld,
          version: '049-directed-trajectory-v1',
          id: `trajectory-${i}`,
          access: 'CIVIL',
          laneIds: [`lane-${i}`],
          loop: true,
        });
      lateralOwner.setTrajectory(
        { id: entry.id, incarnation: entry.identity.generation },
        trajectory,
        lateralWorld,
      );
    }
    const setupCompilationMs = performance.now() - compilationStart;
    const tickSamples = new Float64Array(observer ? 600 : 0),
      lateralSamples = new Float64Array(observer ? 600 : 0);
    const checkpoints = [],
      envelope = {},
      digest = createHash('sha256');
    let maxDisplacementM = 0,
      maxCrossTrackM = 0,
      minimumContacts = 4,
      lateralCalls = 0;
    let maximumReferenceMs = 0,
      totalReferenceMs = 0;
    const warmStart = performance.now();
    let measuredStart = 0,
      warmupWallMs = 0;
    for (let tick = 1; tick <= 780; tick++) {
      if (tick === 181) {
        warmupWallMs = performance.now() - warmStart;
        measuredStart = performance.now();
      }
      const start = performance.now(),
        packets = [];
      let lateralMs = 0;
      for (const entry of entries) {
        const state = world.readBody(entry.identity),
          q = state.transform.rotationQuaternion,
          v = state.velocityMps;

        const speed = Math.hypot(v.x, v.z),
          begin = observer ? performance.now() : 0;
        const lateral = lateralOwner.step({
          ...lateralWorld,
          version: '049-lateral-v1',
          actor: { id: entry.id, incarnation: entry.identity.generation },
          tick,
          requestedSpeedMps: entry.speed,
          observation: {
            sourceTick: tick - 1,
            positionM: state.transform.positionM,
            rotationQuaternion: q,
            velocityMps: v,
            discontinuity: false,
          },
        });
        assert.equal(
          lateral.feasible,
          true,
          `Actual049 feasibility failed ${entry.id}/${tick}/${lateral.reason}`,
        );
        if (observer) lateralMs += performance.now() - begin;
        assert(Number.isFinite(lateral.steering) && Math.abs(lateral.steering) <= 1);
        maxCrossTrackM = Math.max(maxCrossTrackM, lateral.crossTrackM);
        const key = `${entry.config.classId}-${entry.speed}mps-radius${[16, 22, 28][Number(entry.id.slice(4)) % 3]}`;
        const e = (envelope[key] ??= {
          samples: 0,
          maximumCrossTrackM: 0,
          minimumSpeedMps: Infinity,
          maximumSpeedMps: 0,
        });
        if (tick > 180) {
          e.samples++;
          e.maximumCrossTrackM = Math.max(e.maximumCrossTrackM, lateral.crossTrackM);
          e.minimumSpeedMps = Math.min(e.minimumSpeedMps, speed);
          e.maximumSpeedMps = Math.max(e.maximumSpeedMps, speed);
        }
        const displacement = Math.hypot(
          state.transform.positionM.x - entry.previous.x,
          state.transform.positionM.z - entry.previous.z,
        );
        assert(displacement < 1, 'Unexpected discontinuity/teleport');
        maxDisplacementM = Math.max(maxDisplacementM, displacement);
        entry.previous = state.transform.positionM;
        const command = controllerCommand(entry.id, tick, manual ? 'PLAYER' : 'AUTONOMY', {
          ...fixtureSpeedCommand(entry.speed, speed),
          steering: lateral.steering,
        });
        packets.push({ identity: entry.identity, command });
        digest.update(
          JSON.stringify([
            entry.id,
            tick,
            lateral.steering,
            lateral.crossTrackM,
            command.throttle,
            command.brake,
          ]),
        );
        lateralCalls++;
      }
      controller.step(
        { tick, dtSeconds: 1 / 60 },
        packets,
        manual && tick === 1 ? [{ identity: entries[0].identity, mode: 'MANUAL' }] : [],
        false,
      );
      if (observer && tick > 180) {
        tickSamples[tick - 181] = performance.now() - start;
        lateralSamples[tick - 181] = lateralMs;
        totalReferenceMs += lateralMs;
        maximumReferenceMs = Math.max(maximumReferenceMs, lateralMs);
      }
      if (tick % 60 === 0) {
        const physical = entries.map((e) => world.project(e.id));
        for (const state of physical)
          minimumContacts = Math.min(minimumContacts, state.wheelContacts);
        checkpoints.push({
          tick,
          physicalHash: hash(JSON.stringify(physical)),
          first: physical[0],
          last: physical.at(-1),
        });
      }
    }
    const result = {
      count,
      pair,
      observer,
      manual,
      singleClass,
      warmupTicks: 180,
      measuredTicks: 600,
      warmupWallMs,
      setupCompilationMs,
      elapsedWallMs: performance.now() - measuredStart,
      sampleBytes: tickSamples.byteLength + lateralSamples.byteLength,
      tickMs: observer ? distribution(tickSamples) : null,
      lateralOwnerMs: observer ? distribution(lateralSamples) : null,
      lateralOwnerMeasuredCost: observer
        ? {
            totalMs: totalReferenceMs,
            maximumFleetTickMs: maximumReferenceMs,
            meanPerCallMs: totalReferenceMs / (600 * count),
          }
        : null,
      lateralCalls,
      physicalTicks: 780,
      initialPoseWrites: count,
      initialVelocityWrites: count,
      drivingPoseWrites: 0,
      drivingVelocityWrites: 0,
      maxDisplacementM,
      maxCrossTrackM,
      minimumContacts,
      envelope,
      decisionDigest: digest.digest('hex'),
      checkpoints,
      finalPhysicalHash: hash(JSON.stringify(entries.map((e) => world.project(e.id)))),
      owned: {
        lateral: lateralOwner.getStats(),
        controller: controller.getStats(),
        native: world.counts(),
        graphs: graphs.map((graph) => graph.getStats()),
      },
      cleanup: null,
    };
    lateralOwner.dispose();
    controller.dispose();
    world.dispose();
    result.cleanup = {
      lateral: lateralOwner.getStats(),
      controller: controller.getStats(),
      body: world.bodyResources(),
      collision: world.collisionResources(),
    };
    assert.equal(result.cleanup.controller.vehicles, 0);
    assert.equal(result.cleanup.body.entities, 0);
    assert.equal(result.cleanup.collision.colliders, 0);
    return result;
  } finally {
    lateralOwner.dispose();
    controller.dispose();
    world.dispose();
  }
}
try {
  // Actual identical physical commands through MANUAL and AUTO, one live PLAYER allowed.
  for (const classId of ['sedan', 'compact']) {
    const auto = await run(1, 0, false, false, classId),
      manual = await run(1, 0, false, true, classId);
    report.parity.push(auto, manual);
    assert.equal(auto.finalPhysicalHash, manual.finalPhysicalHash);
    assert.deepEqual(auto.checkpoints, manual.checkpoints);
  }
  for (const count of [70, 110])
    for (let pair = 0; pair < 5; pair++)
      for (const observer of pair % 2 ? [true, false] : [false, true]) {
        const result = await run(count, pair, observer);
        report.runs.push(result);
        console.log(
          JSON.stringify({
            count,
            pair,
            observer,
            p95: result.tickMs?.p95,
            maxCrossTrackM: result.maxCrossTrackM,
          }),
        );
      }
  for (const count of [70, 110]) {
    const group = report.runs.filter((r) => r.count === count);
    for (const run of group) {
      assert.equal(run.finalPhysicalHash, group[0].finalPhysicalHash);
      assert.equal(run.decisionDigest, group[0].decisionDigest);
      assert.deepEqual(run.checkpoints, group[0].checkpoints);
    }
  }
  for (const input of inputs) {
    const bytes = await readFile(input.path);
    assert.equal(bytes.length, input.bytes);
    assert.equal(hash(bytes), input.sha256);
  }
  assert.equal(hash(await readFile(nativePath)), nativeArtifact.sha256);
  assert.equal(hash(await readFile(`${folder}/${nativeRelativePath}`)), nativeArtifact.sha256);
  assert.equal(await exists('src/autonomy/lateral-controller.ts'), true);
  const original = JSON.parse(await readFile(`${folder}/before-v3.json`, 'utf8'));
  assert.equal(original.status, 'PASS');
  assert.equal(original.runs.length, report.runs.length);
  assert.equal(original.parity.length, report.parity.length);
  for (const kind of ['runs', 'parity'])
    for (let index = 0; index < report[kind].length; index++) {
      const old = original[kind][index],
        fresh = report[kind][index];
      assert.equal(
        fresh.finalPhysicalHash,
        old.finalPhysicalHash,
        'Published027 changed legacy physical result',
      );
      assert.equal(fresh.decisionDigest, old.decisionDigest, 'Reference command changed');
      assert.deepEqual(
        JSON.parse(JSON.stringify(fresh.checkpoints)),
        JSON.parse(JSON.stringify(old.checkpoints)),
        'Intermediate physical result changed',
      );
      assert.deepEqual(
        JSON.parse(JSON.stringify(fresh.envelope)),
        JSON.parse(JSON.stringify(old.envelope)),
        'Tracking envelope changed',
      );
    }
  report.beforeSourceHash = original.sourceHash;
  const historicalOriginal = JSON.parse(await readFile(`${folder}/before.json`, 'utf8'));
  for (const kind of ['runs', 'parity'])
    for (let index = 0; index < report[kind].length; index++) {
      const fresh = report[kind][index],
        old = historicalOriginal[kind][index];
      assert.equal(fresh.decisionDigest, old.decisionDigest);
      assert.equal(fresh.finalPhysicalHash, old.finalPhysicalHash);
      assert.deepEqual(JSON.parse(JSON.stringify(fresh.checkpoints)), old.checkpoints);
      assert.deepEqual(JSON.parse(JSON.stringify(fresh.envelope)), old.envelope);
    }
  report.originalBeforeSourceHash = historicalOriginal.sourceHash;
  report.originalPhysicalCompatibility = 'exact20fleet+4parity';
  report.refreshReason =
    'Actual049 owner AFTER; both original and accepted published027 dependency baselines retained for comparisons';
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
    }),
  );
}
