/**030 immutable chronological reference SOURCE draft. No recovery implementation. */
import assert from 'node:assert/strict';
import { recoveryRoadFixture } from './vehicle-recovery/road-fixture.ts';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cpus, platform, release } from 'node:os';
import { createRapierProbe } from '../../src/vehicles/rapier/index.ts';
import { createVehicleController } from '../../src/vehicles/controller.ts';
import { createVehicleDamage } from '../../src/vehicles/damage-state.ts';
import { CONTROLLER_CONTEXT, controllerCommand } from '../vehicles/controller-reference.ts';

const root = 'F:/Sites/self-driving-academy/.worktrees/vehicle-recovery-01';
const expectedCommit = 'ad32db9c609cce1132669c95312ae202a62b87ed';
assert.equal(resolve('.').replaceAll('\\', '/'), root);
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/vehicle-recovery-01',
);
assert.equal(
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  expectedCommit,
);
const folder = 'Docs/Evidence/030-vehicle-recovery/before-01';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, null, 2);
const failInfo = (error) => ({
  name: String(error.name),
  message: String(error.message),
  stack: String(error.stack),
  causes: error.errors?.map(failInfo) ?? [],
});
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
};
for (const path of ['src/vehicles/recovery-port.ts', 'src/vehicles/recovery-state.ts', folder])
  assert.equal(await exists(path), false, path + ' must be absent');
const startedAt = new Date().toISOString();
await mkdir(folder, { recursive: true });
await writeFile(folder + '/.gitattributes', '* -text\n', { flag: 'wx' });
const save = (path, value) => writeFile(folder + '/' + path, json(value), { flag: 'wx' });
await save('started.json', {
  startedAt,
  root,
  expectedCommit,
  protocol: '030-before-v1',
  implementationPresent: false,
});
const paths = execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .map((p) => p.replaceAll('\\', '/'));
paths.push(
  'tests/browser/vehicle-recovery/road-fixture.ts',
  'tests/browser/vehicle-recovery/verify-records.mjs',
  'tests/vehicles/recovery-reference-verifier.test.mjs',
  'tests/browser/vehicle-recovery-reference.mjs',
  'tests/browser/vehicle-recovery/verify-reference.mjs',
  'tests/vehicles/controller-reference.ts',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
);
const inputs = [];
const source = createHash('sha256');
for (const path of [...new Set(paths)].sort()) {
  const bytes = await readFile(path);
  const target = folder + '/source/' + path;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' });
  const gitBlob = execFileSync('git', ['hash-object', '--path=' + path, path], {
    encoding: 'utf8',
  }).trim();
  const expectedHeadBlob = path.startsWith('src/')
    ? execFileSync('git', ['rev-parse', expectedCommit + ':' + path], { encoding: 'utf8' }).trim()
    : null;
  if (expectedHeadBlob !== null)
    assert.equal(gitBlob, expectedHeadBlob, 'Published source unchanged ' + path);
  source.update(path).update(bytes);
  inputs.push({ path, bytes: bytes.length, sha256: hash(bytes), gitBlob, expectedHeadBlob });
}
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat'));
const bytes = await readFile(nativePath);
await mkdir(folder + '/native', { recursive: true });
await writeFile(folder + '/native/rapier.mjs', bytes, { flag: 'wx' });
const native = {
  path: nativePath,
  archiveRelativePath: 'native/rapier.mjs',
  bytes: bytes.length,
  sha256: hash(bytes),
};
const archivedAt = new Date().toISOString();
const sourceHash = source.digest('hex');
const manifest = {
  startedAt,
  archivedAt,
  root,
  expectedCommit,
  sourceHash,
  inputs,
  native,
  runtime: process.version,
  cpu: cpus()[0]?.model,
  os: platform() + ' ' + release(),
  protocol: {
    populations: [70, 110],
    pairs: 5,
    warmupTicks: 180,
    measuredTicks: 600,
    hz: 60,
    observerOrder: 'even OFF/ON; odd ON/OFF',
    samples:
      'ON600 whole/controllerIncremental/nativeStep/nativeQuery/nativeBridge/nativeTotal; OFF null',
    checkpointTicks: [240, 300, 360, 420, 480, 540, 600, 660, 720, 780],
    memoryScope: 'raw V8 heap proxy endpoints only, no total/native RAM claim',
    fixture:
      'alternating real sedan/compact, existing mechanics; all actors native; authored contact geometry',
  },
  scope:
    'Chronological pre030.029 AVAILABLE and027 opt-in enabled. Controller authority changes one addressed PLAYER actor; no066 UI/007 publishing/005 recorder. Raw/effective/native/control and physical hashes include all actors. SHA checks outside whole-tick timing remain matched OFF/ON work.',
};
await save('manifest.json', manifest);
const distribution = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Object.fromEntries(
    [
      ['p50', 0.5],
      ['p95', 0.95],
      ['p99', 0.99],
    ].map(([k, p]) => [k, sorted[Math.ceil(sorted.length * p) - 1]]),
  );
};
const runs = [];
async function run(count, pair, observer, ordinal) {
  const row = {
    ordinal,
    count,
    pair,
    observer,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    completedTicks: 0,
    warmupTicks: 180,
    measuredTicks: 600,
    sampleBytes: observer ? 6 * 600 * 8 : 0,
    raw: observer
      ? Object.fromEntries(
          [
            'wholeMs',
            'controllerIncrementalMs',
            'nativeStepMs',
            'nativeQueryMs',
            'nativeBridgeMs',
            'nativeTotalMs',
          ].map((k) => [k, []]),
        )
      : null,
    checkpoints: [],
    cleanup: { attempts: [], errors: [] },
    failure: null,
  };
  let world, damage, controller, primary;
  const identityList = [];
  const trace = createHash('sha256'),
    control = createHash('sha256'),
    nativeInputs = createHash('sha256');
  let currentPhysical = null;
  let physicalElapsed = 0;
  const heap = () => process.memoryUsage().heapUsed;
  try {
    world = await createRapierProbe();
    for (let i = 0; i < count; i++)
      world.addClassCar(
        'car-' + i,
        { x: (i % 10) * 2.2 - 10, y: 0.8, z: Math.floor(i / 10) * 4.15 },
        i % 2 ? 'compact' : 'sedan',
      );
    world.addBox({ x: 0, y: 1, z: 32 }, { x: 20, y: 1, z: 0.5 });
    world.addBox({ x: -12, y: 1, z: 16 }, { x: 0.5, y: 1, z: 20 });
    world.addBox({ x: 12, y: 1, z: 16 }, { x: 0.5, y: 1, z: 20 });
    for (let i = 0; i < 64; i++)
      world.addBox(
        { x: (i % 8) * 0.65 - 2.5, y: 0.35 + Math.floor(i / 8) * 0.62, z: 30 },
        { x: 0.3, y: 0.3, z: 0.3 },
        true,
      );
    for (let i = 0; i < count; i++) identityList.push(world.bodyIdentity('car-' + i));
    assert(identityList.every(Boolean));
    damage = createVehicleDamage(CONTROLLER_CONTEXT, world);
    for (const identity of identityList)
      damage.register(identity, world.readVehicleMechanics(identity.entityId).massKg);
    controller = createVehicleController(
      CONTROLLER_CONTEXT,
      {
        bodyIdentity: (id) => world.bodyIdentity(id),
        readBody: (id) => world.readBody(id),
        step(inputs, measure) {
          currentPhysical = inputs;
          const start = measure ? performance.now() : 0;
          const result = world.step(inputs, measure);
          physicalElapsed = measure ? performance.now() - start : 0;
          return result;
        },
      },
      0,
      { availability: damage, drivetrainVersion: '027-braking-reverse-v1' },
    );
    for (const identity of identityList) controller.register(identity);
    row.initialMechanics = identityList.map((id) => world.readVehicleMechanics(id.entityId));
    const channels = row.raw;
    let measuredStart = 0;
    for (let tick = 1; tick <= 780; tick++) {
      let mode = tick <= 260 ? 'AUTO' : tick <= 520 ? 'MANUAL' : 'LEARNING';
      const changes = [1, 261, 521].includes(tick) ? [{ identity: identityList[0], mode }] : [];
      const packets =
        (tick - 1) % 6 === 0
          ? identityList.flatMap((identity, i) =>
              ['AUTONOMY', 'PLAYER'].map((source) => ({
                identity,
                command: controllerCommand(identity.entityId, tick, source, {
                  throttle: i % 2 ? 0.65 : 1,
                  brake: 0,
                  steering: i % 2 ? 0.03 : -0.03,
                }),
              })),
            )
          : [];
      if (tick === 181) {
        row.heapBeforeMeasured = heap();
        measuredStart = performance.now();
      }
      const measure = observer && tick > 180;
      const start = measure ? performance.now() : 0;
      const frame = controller.step({ tick, dtSeconds: 1 / 60 }, packets, changes, measure);
      if (measure) {
        const whole = performance.now() - start;
        channels.wholeMs.push(whole);
        channels.controllerIncrementalMs.push(whole - physicalElapsed);
        channels.nativeStepMs.push(frame.physics.stepMs);
        channels.nativeQueryMs.push(frame.physics.queryMs);
        channels.nativeBridgeMs.push(frame.physics.bridgeMs);
        channels.nativeTotalMs.push(frame.physics.totalMs);
      }
      row.completedTicks = tick;
      assert.equal(frame.controls.length, count);
      assert.equal(controller.getStats().players, mode === 'AUTO' ? 0 : 1);
      for (const identity of identityList)
        assert.equal(world.bodyIdentity(identity.entityId), identity);
      control.update(JSON.stringify(frame.controls));
      nativeInputs.update(JSON.stringify([...currentPhysical]));
      const physical = identityList.map((id) => world.project(id.entityId));
      assert(
        physical.every((p) =>
          Object.values(p.position)
            .concat(Object.values(p.velocity), Object.values(p.rotation), p.speed)
            .every(Number.isFinite),
        ),
      );
      trace.update(JSON.stringify(physical));
      if (tick > 180 && tick % 60 === 0)
        row.checkpoints.push({
          tick,
          physicalHash: hash(JSON.stringify(physical)),
          controlHash: hash(JSON.stringify(frame.controls)),
          nativeHash: hash(JSON.stringify([...currentPhysical])),
        });
    }
    row.measuredWallMs = performance.now() - measuredStart;
    row.heapAfterMeasuredRaw = heap();
    row.physicalDigest = trace.digest('hex');
    row.controlDigest = control.digest('hex');
    row.nativeInputDigest = nativeInputs.digest('hex');
    row.finalMechanics = identityList.map((id) => world.readVehicleMechanics(id.entityId));
    const fixed = (m) => {
      const {
        appliedEngineForceN,
        appliedSteeringRadians,
        wheelBrakeImpulseLimitNs,
        ...mechanics
      } = m;
      return mechanics;
    };
    assert.deepEqual(row.finalMechanics.map(fixed), row.initialMechanics.map(fixed));
    row.summaries = observer
      ? Object.fromEntries(
          Object.entries(channels).map(([key, values]) => {
            assert.equal(values.length, 600);
            assert(values.every((v) => Number.isFinite(v) && v >= 0));
            return [key, distribution(values)];
          }),
        )
      : null;
    row.owned = {
      controller: controller.getStats(),
      damage: damage.getStats(),
      body: world.bodyResources(),
      collision: world.collisionResources(),
    };
  } catch (error) {
    primary = error;
    row.failure = failInfo(error);
  }
  for (const [name, resource] of [
    ['controller', controller],
    ['damage', damage],
    ['world', world],
  ])
    if (resource) {
      row.cleanup.attempts.push(name);
      try {
        resource.dispose();
      } catch (error) {
        row.cleanup.errors.push({ name, stage: 'DISPOSE', ...failInfo(error) });
      }
    }
  for (const [name, read] of [
    ['controller', () => controller?.getStats()],
    ['damage', () => damage?.getStats()],
    ['body', () => world?.bodyResources()],
    ['collision', () => world?.collisionResources()],
  ])
    try {
      row.cleanup[name] = read() ?? null;
    } catch (error) {
      row.cleanup.errors.push({ name, stage: 'READBACK', ...failInfo(error) });
    }
  try {
    assert.equal(row.cleanup.errors.length, 0);
    assert.equal(row.cleanup.controller.vehicles, 0);
    assert.equal(row.cleanup.controller.players, 0);
    assert.equal(row.cleanup.controller.disposed, true);
    assert.equal(row.cleanup.damage.vehicles, 0);
    assert.equal(row.cleanup.damage.disposed, true);
    assert.equal(row.cleanup.body.entities, 0);
    assert.equal(row.cleanup.body.subscriptions, 0);
    assert.equal(row.cleanup.collision.colliders, 0);
    assert.equal(row.cleanup.collision.disposed, true);
  } catch (error) {
    row.cleanup.errors.push({ name: 'CLEANUP_ASSERTIONS', ...failInfo(error) });
  }
  row.status = primary || row.cleanup.errors.length ? 'FAIL' : 'PASS';
  row.completedAt = new Date().toISOString();
  let exportError;
  try {
    await save('run-' + String(ordinal).padStart(2, '0') + '.json', row);
  } catch (error) {
    exportError = error;
  }
  if (primary || row.cleanup.errors.length || exportError)
    throw new AggregateError(
      [
        ...(primary ? [primary] : []),
        ...row.cleanup.errors.map((e) => Error(e.message)),
        ...(exportError ? [exportError] : []),
      ],
      '030 reference run failure; primary/cleanup/export retained',
    );
  return row;
}
let failure;
try {
  const road = recoveryRoadFixture();
  await save('road-fixture.json', { map: road.map, graphStats: road.graph.getStats() });
  await save('first-world.json', {
    startedAt,
    archivedAt,
    firstWorldAt: new Date().toISOString(),
    sourceHash,
    nativeSha256: native.sha256,
  });
  for (const count of [70, 110])
    for (let pair = 0; pair < 5; pair++)
      for (const observer of pair % 2 ? [true, false] : [false, true]) {
        const row = await run(count, pair, observer, runs.length);
        runs.push(row);
        console.log(
          JSON.stringify({
            ordinal: row.ordinal,
            count,
            pair,
            observer,
            status: row.status,
            p95: row.summaries?.wholeMs.p95,
          }),
        );
      }
  for (const count of [70, 110]) {
    const group = runs.filter((r) => r.count === count);
    for (const row of group)
      for (const key of [
        'checkpoints',
        'physicalDigest',
        'controlDigest',
        'nativeInputDigest',
        'initialMechanics',
        'finalMechanics',
      ])
        assert.deepEqual(row[key], group[0][key], count + '/' + key);
  }
  assert(
    runs.filter((r) => r.count === 70 && r.observer).every((r) => r.summaries.wholeMs.p95 <= 5.5),
    'Original normal70 5.5ms absolute gate',
  );
  for (const input of inputs) {
    assert.equal(hash(await readFile(input.path)), input.sha256);
    assert.equal(hash(await readFile(folder + '/source/' + input.path)), input.sha256);
  }
  assert.equal(hash(await readFile(nativePath)), native.sha256);
  assert.equal(hash(await readFile(folder + '/' + native.archiveRelativePath)), native.sha256);
  for (const path of ['src/vehicles/recovery-state.ts', 'src/vehicles/recovery-port.ts'])
    assert.equal(await exists(path), false);
} catch (error) {
  failure = error;
}
let terminalExportError;
try {
  await save(failure ? 'failure.json' : 'complete.json', {
    status: failure ? 'FAIL' : 'PASS',
    startedAt,
    archivedAt,
    completedAt: new Date().toISOString(),
    sourceHash,
    nativeSha256: native.sha256,
    runCount: runs.length,
    errors: failure ? failInfo(failure) : null,
  });
} catch (error) {
  terminalExportError = error;
}
if (failure && terminalExportError)
  throw new AggregateError(
    [failure, terminalExportError],
    'Capture and terminal export failed; both retained',
  );
if (failure) throw failure;
if (terminalExportError) throw terminalExportError;
