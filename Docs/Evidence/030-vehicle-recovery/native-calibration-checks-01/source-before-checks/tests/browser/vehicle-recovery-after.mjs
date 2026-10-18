/**030 current AFTER SOURCE draft. Original BEFORE remains immutable; no execution authorization. */
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
import { createVehicleRecovery } from '../../src/vehicles/recovery-state.ts';
import { createRecoveryRoadProvider } from '../../src/app/vehicle-recovery-road.ts';
import { createEventBus } from '../../src/simulation/event-bus.ts';
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
const folder = 'Docs/Evidence/030-vehicle-recovery/after-01';
const originalBefore = 'Docs/Evidence/030-vehicle-recovery/before-01';
const baselineManifest = JSON.parse(await readFile(originalBefore + '/manifest.json'));
assert.equal(
  baselineManifest.sourceHash,
  'e7e5241caa9ef9c5ac1a27460defc9de679a86de3c6a3287eb8409fe3e27d755',
);
assert.equal(JSON.parse(await readFile(originalBefore + '/complete.json')).status, 'PASS');
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
assert.equal(await exists(folder), false, folder + ' must be absent');
for (const path of ['src/vehicles/recovery-port.ts', 'src/vehicles/recovery-state.ts'])
  assert.equal(await exists(path), true, path + ' implementation required');
const beforeVerification = execFileSync(
  process.execPath,
  [
    '--import',
    resolve('./scripts/register-typescript.mjs'),
    resolve('tests/browser/vehicle-recovery/verify-reference.mjs'),
    originalBefore,
    '--historical',
  ],
  { cwd: root, encoding: 'utf8' },
);
const startedAt = new Date().toISOString();
await mkdir(folder, { recursive: true });
await writeFile(folder + '/.gitattributes', '* -text\n', { flag: 'wx' });
const save = (path, value) => writeFile(folder + '/' + path, json(value), { flag: 'wx' });
await save('started.json', {
  startedAt,
  root,
  expectedCommit,
  protocol: '030-after-v1',
  implementationPresent: true,
  originalBeforeSourceHash: baselineManifest.sourceHash,
  beforeVerification,
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
  'tests/browser/vehicle-recovery-after.mjs',
  'tests/browser/vehicle-recovery/verify-after.mjs',
  'tests/browser/vehicle-recovery/verify-after-records.mjs',
  'tests/vehicles/recovery-pure.test.ts',
  'tests/vehicles/recovery-owner.test.ts',
  'tests/vehicles/recovery-native.test.ts',
  'tests/vehicles/recovery-functional-native.test.ts',
  'tests/input/recovery-input.test.ts',
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
  // CURRENT dirty030 source bytes are authoritative; never pretend publishedad32 contains030.
  const expectedHeadBlob = null;
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
  phase: 'AFTER',
  originalBeforeSourceHash: baselineManifest.sourceHash,
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
    'Current030 tracking AFTER against ORIGINAL chronological e7e5241c BEFORE. Same029/027/controller/native fixture; noR in performance windows. Seat adapter reads actual024 PLAYER projection, not066 UI/camera. WholeMs includes030 observation and full native safety query. Raw/control/native/physical digests unchanged; no browser/frame/totalRAM claim.',
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
const runsBefore = await Promise.all(
  Array.from({ length: 20 }, (_, i) =>
    readFile(originalBefore + '/run-' + String(i).padStart(2, '0') + '.json').then(JSON.parse),
  ),
);
assert.equal(native.sha256, baselineManifest.native.sha256);
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
  let world, damage, controller, recovery, eventBus, primary;
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
    eventBus = createEventBus(CONTROLLER_CONTEXT);
    const authority = {
      getStats() {
        const actual = controller.getStats(),
          control = controller.readControl(identityList[0]);
        return {
          context: actual.context,
          tick: actual.tick,
          disposed: actual.disposed,
          suspended: actual.suspended,
          fault: actual.fault,
          seat:
            control && control.mode !== 'AUTO'
              ? { identity: control.identity, mode: control.mode }
              : null,
        };
      },
    };
    recovery = createVehicleRecovery(CONTROLLER_CONTEXT, {
      physics: world,
      controller,
      authority,
      damage,
      eventBus,
      road: createRecoveryRoadProvider(recoveryRoadFixture().graph),
      clearAddressedInput() {},
      segments: { inspect() {}, close() {} },
    });
    for (const identity of identityList) recovery.register(identity, 'TAXI');
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
      recovery.observe(tick);
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
      recovery: recovery.getStats(),
      nativeRecovery: world.recoveryResources(),
      eventBus: eventBus.getStats(),
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
    ['recovery', recovery],
    ['eventBus', eventBus],
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
    ['recovery', () => recovery?.getStats()],
    ['nativeRecovery', () => world?.recoveryResources()],
    ['eventBus', () => eventBus?.getStats()],
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
    assert.equal(row.cleanup.recovery.vehicles, 0);
    assert.equal(row.cleanup.recovery.disposed, true);
    assert.equal(row.cleanup.nativeRecovery.activePorts, 0);
    assert.equal(row.cleanup.eventBus.retainedEvents, 0);
    assert.equal(row.cleanup.eventBus.disposed, true);
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
    assert.equal(await exists(path), true);
  for (const row of runs) {
    const before = JSON.parse(
      await readFile(originalBefore + '/run-' + String(row.ordinal).padStart(2, '0') + '.json'),
    );
    for (const key of [
      'checkpoints',
      'physicalDigest',
      'controlDigest',
      'nativeInputDigest',
      'initialMechanics',
      'finalMechanics',
    ])
      assert.deepEqual(row[key], before[key], 'Original BEFORE parity ' + row.ordinal + '/' + key);
  }
  const flags = {};
  for (const count of [70, 110]) {
    flags[count] = runs
      .filter((row) => row.count === count && row.observer)
      .map((row) => {
        const before = runsBefore[row.ordinal];
        const a = before.summaries.wholeMs.p95,
          b = row.summaries.wholeMs.p95;
        return {
          pair: row.pair,
          before: a,
          after: b,
          deltaMs: b - a,
          ratio: b / a,
          regression: b - a > 1 && b / a > 1.1,
        };
      });
    assert(
      flags[count].filter((row) => row.regression).length < 3,
      'Original relativeCPU gate ' + count,
    );
  }
  await save('comparison.json', {
    originalBeforeSourceHash: baselineManifest.sourceHash,
    sourceHash,
    flags,
    memory: 'Raw live JSproxy endpoints only; hardware/retention acceptance pending',
  });
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
