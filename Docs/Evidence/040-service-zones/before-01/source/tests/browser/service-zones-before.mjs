/**040 chronological BEFORE SOURCE draft. Execution requires orchestrator CPU grant. */
import assert from 'node:assert/strict';
import { serviceReferenceFixture } from './service-zones/road-fixture.ts';
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
import { constructReference, queryReference } from './service-zones/reference-query.ts';
import { verifyQueries } from './service-zones/verify-query-records.mjs';
import { failureInfo } from './service-zones/failure-info.mjs';
import { CONTROLLER_CONTEXT, controllerCommand } from '../vehicles/controller-reference.ts';

const root = 'F:/Sites/self-driving-academy/.worktrees/service-zones-01';
const expectedCommit = '0853a4d94d5ac7aed00fbacdf4723a0a3de4e906';
assert.equal(resolve('.').replaceAll('\\', '/'), root);
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/service-zones-01',
);
assert.equal(
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  expectedCommit,
);
const folder = 'Docs/Evidence/040-service-zones/before-01';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, null, 2);
const failInfo = failureInfo;
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
for (const path of ['src/world/service-zones.ts', 'src/app/service-zones.ts'])
  assert.equal(await exists(path), false, '040 production must be absent');
const startedAt = new Date().toISOString();
await mkdir(folder, { recursive: true });
await writeFile(folder + '/.gitattributes', '* -text\n', { flag: 'wx' });
const save = (path, value) => writeFile(folder + '/' + path, json(value), { flag: 'wx' });
await save('started.json', {
  startedAt,
  root,
  expectedCommit,
  protocol: '040-before-v1',
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
  'tests/browser/service-zones-before.mjs',
  'tests/browser/service-zones/reference-query.ts',
  'tests/browser/service-zones/road-fixture.ts',
  'tests/browser/service-zones/verify-query-records.mjs',
  'tests/browser/service-zones/failure-info.mjs',
  'tests/browser/service-zones/verify-before.mjs',
  'tests/world/service-zones-reference.test.mjs',
  'tests/browser/vehicle-recovery/verify-after.mjs',
  'tests/browser/vehicle-recovery/verify-after-records.mjs',
  'tests/vehicles/recovery-pure.test.ts',
  'tests/vehicles/recovery-owner.test.ts',
  'tests/vehicles/recovery-native.test.ts',
  'tests/vehicles/recovery-functional-native.test.ts',
  'tests/vehicles/recovery-shape-query.test.ts',
  'tests/vehicles/recovery-support-calibration.test.ts',
  'tests/browser/vehicle-recovery-after/functional-native-instrumentation.ts',
  'tests/browser/vehicle-recovery-after/road-fixture.ts',
  'tests/browser/vehicle-damage/hardware-lifetime.ts',
  'tests/contracts/fixtures.ts',
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
  //040 product is absent. Every production file must match the exact published base.
  const expectedHeadBlob = path.startsWith('src/')
    ? execFileSync('git', ['rev-parse', expectedCommit + ':' + path], { encoding: 'utf8' }).trim()
    : null;
  if (expectedHeadBlob !== null) assert.equal(gitBlob, expectedHeadBlob, 'Published base ' + path);
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
const profileStartedAt = new Date().toISOString();
const cimScript = `$ErrorActionPreference='Stop';
$cpu=@(Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors);
$gpu=@(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,CurrentHorizontalResolution,CurrentVerticalResolution);
$os=Get-CimInstance Win32_OperatingSystem;
$computer=Get-CimInstance Win32_ComputerSystem;
[ordered]@{capturedAt=[DateTime]::UtcNow.ToString('o');cpu=$cpu;gpu=$gpu;os=[ordered]@{name=$os.Caption;version=$os.Version;build=$os.BuildNumber};physicalMemoryBytes=[double]$computer.TotalPhysicalMemory;powerScheme=(powercfg /getactivescheme | Out-String).Trim();profile='CPU_NATIVE_ONLY';browserBackend=$null;browserResolution=$null} | ConvertTo-Json -Depth 6 -Compress`;
const cim = JSON.parse(
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cimScript], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  }),
);
const hardwareBytes = Buffer.from(
  json({ startedAt: profileStartedAt, completedAt: new Date().toISOString(), cim }),
);
await writeFile(folder + '/hardware.json', hardwareBytes, { flag: 'wx' });
const hardware = {
  path: 'hardware.json',
  bytes: hardwareBytes.length,
  sha256: hash(hardwareBytes),
};
const archivedAt = new Date().toISOString();
const sourceHash = source.digest('hex');
const manifest = {
  startedAt,
  archivedAt,
  root,
  expectedCommit,
  sourceHash,
  phase: 'BEFORE_040',
  inputs,
  native,
  hardware,
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
      'ON600 whole/controllerIncremental/nativeStep/nativeQuery/nativeBridge/nativeTotal/explicitQuery; OFF null',
    checkpointTicks: [240, 300, 360, 420, 480, 540, 600, 660, 720, 780],
    memoryScope: 'raw V8 heap proxy endpoints only, no total/native RAM claim',
    fixture:
      'alternating real sedan/compact, existing mechanics; all actors native; authored contact geometry',
  },
  scope:
    'Pre040 current030 tracking unchanged plus ONE explicit readonly recovery-anchor request each six ticks (130 requests/run), not product polling. Loading records actual032 parser033 graph030 adapter construction separately. No040 algorithm, R, teleport, browser frame, cold network or totalRAM claim.',
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
    sampleBytes: observer ? 7 * 600 * 8 : 0,
    raw: observer
      ? Object.fromEntries(
          [
            'explicitQueryMs',
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
  let failed = false;
  const queryRows = [];
  let queryPort;
  row.queries = queryRows;
  let reference;
  const identityList = [];
  const trace = createHash('sha256'),
    control = createHash('sha256'),
    nativeInputs = createHash('sha256');
  let currentPhysical = null;
  let physicalElapsed = 0;
  const heap = () => process.memoryUsage().heapUsed;
  try {
    const loadingStart = performance.now();
    reference = constructReference();
    row.loadingMs = performance.now() - loadingStart;
    row.catalog = { map: reference.map, graphStats: reference.graph.getStats() };
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
    // Anonymous actual fixed blocker at the second metadata anchor. Behind initial cars.
    world.addBox({ x: 0, y: 0.6, z: -5 }, { x: 1.5, y: 0.6, z: 1 });
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
        const actual = controller.readBoundary?.() ?? controller.getStats(),
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
      road: createRecoveryRoadProvider(serviceReferenceFixture().graph),
      clearAddressedInput() {},
      segments: { inspect() {}, close() {} },
    });
    for (const identity of identityList) recovery.register(identity, 'TAXI');
    queryPort = world.createRecoveryPort(CONTROLLER_CONTEXT);
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
      const queryStart = measure ? performance.now() : 0;
      let queryResult = null;
      if ((tick - 1) % 6 === 0)
        queryResult = queryReference(
          queryPort,
          reference.road,
          identityList[Math.floor((tick - 1) / 6) % count],
          reference.map,
          Math.floor((tick - 1) / 12) % 2,
        );
      const explicitQueryMs = measure ? performance.now() - queryStart : 0;
      if (measure) {
        const whole = performance.now() - start;
        channels.wholeMs.push(whole);
        channels.explicitQueryMs.push(explicitQueryMs);
        channels.controllerIncrementalMs.push(whole - physicalElapsed);
        channels.nativeStepMs.push(frame.physics.stepMs);
        channels.nativeQueryMs.push(frame.physics.queryMs);
        channels.nativeBridgeMs.push(frame.physics.bridgeMs);
        channels.nativeTotalMs.push(frame.physics.totalMs);
      }
      if (queryResult) queryRows.push({ tick, ...queryResult });
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
    row.queries = queryRows;
    verifyQueries(row);
    row.measuredWallMs = performance.now() - measuredStart;
    row.heapAfterMeasuredRaw = heap();
    row.physicalDigest = trace.digest('hex');
    row.controlDigest = control.digest('hex');
    row.nativeInputDigest = nativeInputs.digest('hex');
    row.finalMechanics = identityList.map((id) => world.readVehicleMechanics(id.entityId));
    const fixed = (m) =>
      Object.fromEntries(
        Object.entries(m).filter(
          ([key]) =>
            !['appliedEngineForceN', 'appliedSteeringRadians', 'wheelBrakeImpulseLimitNs'].includes(
              key,
            ),
        ),
      );
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
    failed = true;
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
  row.status = failed || row.cleanup.errors.length ? 'FAIL' : 'PASS';
  row.completedAt = new Date().toISOString();
  let exportError;
  try {
    await save('run-' + String(ordinal).padStart(2, '0') + '.json', row);
  } catch (error) {
    exportError = error;
  }
  if (failed || row.cleanup.errors.length || exportError)
    throw new AggregateError(
      [
        ...(failed ? [primary] : []),
        ...row.cleanup.errors.map((e) => Error(e.message)),
        ...(exportError ? [exportError] : []),
      ],
      '040 baseline run failure; primary/cleanup/export retained',
    );
  return row;
}
let failure;
let captureFailed = false;
try {
  const road = serviceReferenceFixture();
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
} catch (error) {
  captureFailed = true;
  failure = error;
}
let terminalExportError;
try {
  await save(captureFailed ? 'failure.json' : 'complete.json', {
    status: captureFailed ? 'FAIL' : 'PASS',
    startedAt,
    archivedAt,
    completedAt: new Date().toISOString(),
    sourceHash,
    nativeSha256: native.sha256,
    runCount: runs.length,
    errors: captureFailed ? failInfo(failure) : null,
  });
} catch (error) {
  terminalExportError = error;
}
if (captureFailed && terminalExportError)
  throw new AggregateError(
    [failure, terminalExportError],
    'Capture and terminal export failed; both retained',
  );
if (captureFailed) throw failure;
if (terminalExportError) throw terminalExportError;
