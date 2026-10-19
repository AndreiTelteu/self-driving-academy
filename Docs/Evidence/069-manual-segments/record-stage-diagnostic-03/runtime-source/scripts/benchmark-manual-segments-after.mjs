import {guardCopyRuntime} from './manual-segments-record-stage-guard.mjs';
import {resetStages,enterStages,finishStages} from './manual-segments-record-stage-observer.mjs';
// SOURCE draft069 AFTER. Real production069; no execution without separate parent grant.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cpus, platform, release } from 'node:os';
import {
  createVehicleController,
  createKeyboardFilter,
  vehicleClass,
  tractiveForceN,
  parseVehicleCommand,
} from '../src/vehicles/index.ts';
import {
  createControlAuthority,
  createModeControls,
  createVehicleSelection,
} from '../src/input/index.ts';
import { createDefaultSettings } from '../src/settings/index.ts';
import { VehicleCameraController } from '../src/rendering/index.ts';
import { createManualSegmentBridge } from '../src/app/index.ts';
import {
  parseInterventionSegment,
  createInterventionRecordStore,
  createInterventionEventTransport,
  createInterventionIntake,
} from '../src/telemetry/index.ts';
import { createRapierProbe } from '../src/vehicles/rapier/index.ts';
import {
  createAfterResourceScope,
  productionSchemaBoundary,
  productionOwnershipCycles,
  retireHealthyAfterFailure,
} from '../tests/telemetry/manual-segments-after.ts';
import {
  acquireGuardedReferenceWorld,
  bodySnapshot,
  sameNativeSnapshot,
} from '../tests/input/vehicle-selection-native-guard-v2.ts';
import {
  manualReferencePhase,
  referenceModeAction,
  referenceTime,
  nativeReferenceSample,
  referenceSchemaStress,
} from '../tests/telemetry/manual-segments-reference.ts';
import {
  sha256,
  REFERENCE_PROTOCOL,
  descriptors,
  immutableJson,
  distribution,
  verifyInventory,
  validateRecord,
  compareOriginal,
} from './manual-segments-after-records.mjs';

import {
  verifyArchiveProofChild,
  preflightFailureArtifact,
} from './manual-segments-archive-closure.mjs';
import { verifyOriginalBefore } from '../Docs/Evidence/069-manual-segments/verify-after.mjs';
import {
  exportFailurePreserving,
  serializeDiagnostic,
  validateCheckedProduct,
  REUSE_PRODUCT_SHA,
  REUSE_PRODUCT_RECEIPT,
  readDiagnosticField,
  boundedDiagnosticData,
} from './manual-segments-calibration-proof.mjs';

const expectedRoot = 'C:/Users/aandr/Sites/self-driving-academy/.worktrees/manual-segments-01';
assert.equal(resolve('.').replaceAll('\\', '/'), expectedRoot);
assert.equal(
  execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' })
    .trim()
    .replaceAll('\\', '/'),
  expectedRoot,
);
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/manual-segments-01',
);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert(commit.startsWith('d8e5756'), 'Published reference HEAD required');
const absent = async (path) => {
  try {
    await access(path);
    return false;
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    throw e;
  }
};
assert(!(await absent('src/telemetry/intervention-lifecycle.ts')), 'Real069 lifecycle required');
assert(!(await absent('src/app/manual-segment-bridge.ts')), 'Real069 bridge required');
const checked = JSON.parse(
  await readFile(
    'Docs/Evidence/069-manual-segments/optimization-checks-01/results-final.json',
  ),
);
validateCheckedProduct(checked, REUSE_PRODUCT_SHA);
for (const row of checked.source) {
  const data = await readFile(row.path);
  assert.equal(data.length, row.bytes);
  assert.equal(sha256(data), row.sha256, 'Approved checked product/source drift ' + row.path);
}
const beforeManifestBytes = await readFile(
  'Docs/Evidence/069-manual-segments/native-before-02/manifest.json',
);
const beforeManifest = JSON.parse(beforeManifestBytes);
assert.equal(
  beforeManifest.sourceHash,
  'c88a6e1dba7b8c28adf2d17f371b26af0b3dd2d1ec9487cecf90515507c019af',
);
const folder = 'Docs/Evidence/069-manual-segments/record-stage-diagnostic-03/capture';
assert(await absent(folder), 'Immutable attempt exists');
await mkdir(folder, { recursive: false });
const startedAt = new Date().toISOString();
const beforeInventory = JSON.parse(
  await readFile('Docs/Evidence/069-manual-segments/native-before-02-inventory.json'),
).beforeFiles;

await immutableJson(folder + '/started.json', {
  startedAt,
  commit,
  expectedRoot,
  protocol: REFERENCE_PROTOCOL,
  phase: 'ACTUAL_PRODUCTION_AFTER_ORIGINAL_BEFORE',
});
try {
  await verifyOriginalBefore(
    resolve('Docs/Evidence/069-manual-segments/native-before-02'),
    {
      before: { manifestSha256: sha256(beforeManifestBytes) },
      startedAt,
      native: beforeManifest.native,
    },
    beforeInventory,
  ); // Strict immutable BEFORE preflight, before native acquisition; no retained comparison graphs.
} catch (error) {
  await exportFailurePreserving(error, () =>
    immutableJson(folder + '/failure.json', {
      status: 'FAIL',
      stage: 'ORIGINAL_BEFORE_PREFLIGHT',
      failedAt: new Date().toISOString(),
      error: serializeDiagnostic(error),
    }),
  );
  throw error;
}

const files = [
  ...execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/)
    .map((p) => p.replaceAll('\\', '/')),
  'scripts/benchmark-manual-segments-after.mjs',
  'scripts/benchmark-manual-segments-reference.mjs',
  'scripts/manual-segments-after-records.mjs',
  'scripts/manual-segments-calibration-proof.mjs',
  'scripts/manual-segments-calibration-proof.d.mts',
  'scripts/manual-segments-archive-closure.mjs',
  'tests/telemetry/manual-segments-after-validation.test.mjs',
  'tests/contracts/fixtures.ts',
  'tests/telemetry/manual-segments-after-calibration.test.ts',
  'scripts/manual-segments-reference-records.mjs',
  'tests/telemetry/manual-segments-reference.ts',
  'tests/telemetry/manual-segments-reference-records.test.mjs',
  'tests/telemetry/manual-segments-after.ts',
  'tests/telemetry/manual-segments-after-records.test.mjs',
  'tests/telemetry/manual-segments-after-cleanup.test.ts',
  'tests/input/vehicle-selection-native-guard-v2.ts',
  'tests/input/vehicle-selection-reference.ts',
  'Docs/Evidence/069-manual-segments/verify-reference.mjs',
  'Docs/Evidence/069-manual-segments/verify-after.mjs',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
  'Docs/Evidence/069-manual-segments/implementation-scoped-checks-03/results-final.json',
  'Docs/Evidence/069-manual-segments/optimization-checks-01/results-final.json',
  'Docs/Evidence/069-manual-segments/implementation-scoped-checks-03/archive-start.json',
  ...checked.source.map((r) => r.path).filter((p) => !p.startsWith('src/')),
]
  .filter((p, i, a) => a.indexOf(p) === i)
  .sort();
assert.equal(new Set(files).size, files.length);
const inputs = [],
  source = createHash('sha256');
for (const path of files) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  const archiveRelativePath = 'source/' + path;
  await mkdir(dirname(folder + '/' + archiveRelativePath), { recursive: true });
  await writeFile(folder + '/' + archiveRelativePath, bytes, { flag: 'wx' });
  inputs.push({
    path,
    archiveRelativePath,
    bytes: bytes.length,
    sha256: sha256(bytes),
    gitBlob: execFileSync('git', ['hash-object', '--no-filters', path], {
      encoding: 'utf8',
    }).trim(),
  });
}
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')),
  nativeBytes = await readFile(nativePath);
await mkdir(folder + '/native');
await writeFile(folder + '/native/rapier.mjs', nativeBytes, { flag: 'wx' });
assert.equal(
  sha256(nativeBytes),
  beforeManifest.native.sha256,
  'Pinned exact BEFORE native module',
);
const sourceHash = source.digest('hex'),
  archivedAt = new Date().toISOString();
const manifest = {
  version: '069-native-after-manifest-v1',
  diagnosticRuntimeProof: JSON.parse(await readFile('Docs/Evidence/069-manual-segments/record-stage-diagnostic-03/runtime-proof.json')),
  scopeDiagnostic: 'COPY_STAGE_DIAGNOSTIC_NOT_ACCEPTANCE',
  checkedProductReceipt: REUSE_PRODUCT_RECEIPT,
  checkedProductFingerprint: REUSE_PRODUCT_SHA,
  startedAt,
  archivedAt,
  commit,
  sourceHash,
  inputs,
  before: {
    relativePath: '../native-before-02',
    sourceHash: beforeManifest.sourceHash,
    manifestSha256: sha256(beforeManifestBytes),
  },
  publishedBaseOnly: true,
  productionWorkingTree: 'CURRENT_DIRTY_069_NOT_PUBLISHED_COMMIT',
  protocol: REFERENCE_PROTOCOL,
  native: {
    archiveRelativePath: 'native/rapier.mjs',
    bytes: nativeBytes.length,
    sha256: sha256(nativeBytes),
  },
  runtime: process.version,
  cpu: cpus()[0]?.model ?? null,
  os: platform() + ' ' + release(),
  scope:
    'Supplemental actual069 CPU. Production bridge/store/007/intake; native sample records. No renderer/RAF/FPS/exactRAM/full recorder or estimator claim.',
  timingOwnedBytesPerOnWorld: 5 * 600 * 8,
  byteAccounting: 'Arrays exact; JS objects/transient005 parser copies/native RAM not exact.',
};
await immutableJson(folder + '/manifest.json', manifest);
await mkdir(folder + '/worlds');
const context = Object.freeze({
  schemaVersion: 1,
  units: 'SI',
  sessionId: 'manual-segments-reference',
  worldEpoch: 0,
});
const command = (id, tick, source, values) =>
  parseVehicleCommand({
    ...context,
    vehicleId: id,
    tick,
    source,
    throttle: values.throttle,
    brake: values.brake,
    steering: values.steering,
    handbrake: values.handbrake ?? false,
    turnSignal: 'OFF',
    driveIntent: {
      version: '027-braking-reverse-v1',
      direction: values.throttle === 0 ? 'NONE' : 'FORWARD',
      shiftBrake: values.brake,
    },
  });
try {
  verifyArchiveProofChild(folder);
} catch (error) {
  await exportFailurePreserving(error, () =>
    immutableJson(folder + '/failure.json', {
      status: 'FAIL',
      stage: 'ARCHIVED_IMPORT_CLOSURE',
      sourceHash,
      failedAt: new Date().toISOString(),
      ...preflightFailureArtifact(error),
    }),
  );
  throw error;
}
let firstWorldAt = null;
async function run(d) {
  resetStages(d.observer);
  let stageExported=false;
  await immutableJson(folder + '/worlds/world-' + d.ordinal + '.started.json', {
    descriptor: d,
    sourceHash,
    startedAt: new Date().toISOString(),
  });
  const resources = createAfterResourceScope(),
    acquiredOwners = [];
  const own = (name, dispose, read) => {
    resources.own(name, dispose, read);
    acquiredOwners.push(name);
  };
  const progress = {
    descriptor: d,
    sourceHash,
    status: 'RUNNING',
    attemptedTick: 0,
    acceptedTick: 0,
    nativeStepSerial: null,
    finiteBodyTickChecks: 0,
    lifecycle: [],
    timingSampleCount: 0,
    checkpoints: [],
    boundaryTrace: [],
    events: [],
    raw: {},
    distributions: {},
    nativeInputDigest: null,
    packetDigest: null,
    physicalDigest: null,
    rawInputDigest: null,
    heap: { beforeWarmup: null, afterWarmup: null, afterMeasured: null },
    acquiredOwners,
    segmentRecords: [],
    liveRecords: null,
    drivingHostMutations: 0,
    primary: null,
    cleanup: null,
  };
  const buffers = Object.fromEntries(
    REFERENCE_PROTOCOL.channels.map((c) => [c, d.observer ? new Float64Array(600) : null]),
  );
  let native = null,
    ids = [],
    world = null,
    store = null,
    terminal,
    failed = false,
    bridge = null,
    authority = null,
    preparedCause = null;
  try {
    if (firstWorldAt === null) {
      firstWorldAt = new Date().toISOString();
      await immutableJson(folder + '/first-world.json', {
        firstWorldAt,
        sourceHash,
        nativeSha256: manifest.native.sha256,
      });
    }
    native = await createRapierProbe();
    const wrapped = acquireGuardedReferenceWorld(native, resources);
    acquiredOwners.push('world');
    world = wrapped.world;
    const guard = wrapped.guard;
    for (let i = 0; i < d.count; i++)
      world.addClassCar(
        'car-' + i,
        { x: (i % 10) * 2.2 - 10, y: 0.8, z: Math.floor(i / 10) * 4.15 },
        d.classId ?? (i % 2 ? 'compact' : 'sedan'),
      );
    if (d.kind === 'FLEET') {
      world.addBox({ x: 0, y: 1, z: 32 }, { x: 20, y: 1, z: 0.5 });
      world.addBox({ x: -12, y: 1, z: 16 }, { x: 0.5, y: 1, z: 20 });
      world.addBox({ x: 12, y: 1, z: 16 }, { x: 0.5, y: 1, z: 20 });
      for (let i = 0; i < 64; i++)
        world.addBox(
          { x: (i % 8) * 0.65 - 2.5, y: 0.35 + Math.floor(i / 8) * 0.62, z: 30 },
          { x: 0.3, y: 0.3, z: 0.3 },
          true,
        );
    }
    ids = Array.from({ length: d.count }, (_, i) => world.bodyIdentity('car-' + i));
    assert(ids.every(Boolean));
    const controller = createVehicleController(context, world, 0, {
      drivetrainVersion: '027-braking-reverse-v1',
    });
    own(
      'controller',
      () => controller.dispose(),
      () => controller.getStats(),
    );
    const keyboard = createKeyboardFilter(
      context,
      'car-0',
      createDefaultSettings('069-reference').input.control,
      0,
    );
    own(
      'keyboard',
      () => keyboard.dispose(),
      () => keyboard.getStats(),
    );
    authority = createControlAuthority(context, controller, {
      bodyIdentity: (id) => world.bodyIdentity(id),
      clearOldPlayer: () => keyboard.clear(),
    });
    own(
      'authority',
      () => authority.dispose(),
      () => authority.getStats(),
    );
    for (const id of ids) authority.register(id);
    let selected = ids[0];
    const modes = createModeControls(context, {
      readAuthority: () => authority.getStats(),
      selectedIdentity: () => selected,
      bodyIdentity: (id) => world.bodyIdentity(id),
    });
    own(
      'mode',
      () => modes.dispose(),
      () => modes.getStats(),
    );
    store = createInterventionRecordStore(context);
    own(
      'segment',
      () => store.dispose(),
      () => store.getStats(),
    );
    const camera = new VehicleCameraController({
      mode: 'CHASE',
      fovDegrees: 75,
      motion: 50,
      distanceM: 6,
    });
    camera.select('car-0');
    own(
      'cameraTarget',
      () => camera.select(null),
      () => camera.selectedEntityId,
    );
    const bus = createInterventionEventTransport(context, {
      maxEventsPerEpoch: 200,
      maxListeners: 1,
    });
    own(
      'bus',
      () => bus.dispose(),
      () => bus.getStats(),
    );
    const intake = createInterventionIntake(context);
    own(
      'intake',
      () => intake.dispose(),
      () => intake.getStats(),
    );
    let target = Object.freeze({
      ...context,
      version: '069-intervention-target-v1',
      playerId: 'reference-player',
      profileId: 'reference-profile',
      baseVersionId: 'reference-base-0',
      learningEpoch: 0,
      controlPreferencesVersion: '025-keyboard-v1',
      engineVersion: 'published-d8e5756',
      mapVersion: '069-authored-native-fixture-v1',
      inputType: 'KEYBOARD',
      learningEligible: true,
    });
    let preparedChange = null,
      closedReservation = null,
      openedReservation = null,
      eventCost = 0,
      authorityCost = 0,
      bodiesAfterPhysical = null;
    const recordIds = new Set();
    bridge = createManualSegmentBridge(context, 'after', authority, {
      bodyIdentity: (id) => world.bodyIdentity(id),
      readTarget: () => target,
      preparedCause: (id) => (preparedCause?.operationId === id ? preparedCause : null),
      preparedTarget: (id) => (preparedChange?.operationId === id ? preparedChange : null),
      records: {
        ...store.port,
        reserve(closed, opened) {
          closedReservation = closed;
          openedReservation = opened;
          const result = store.port.reserve(closed, opened);
          if (opened) recordIds.add(opened.segmentId);
          return result;
        },
      },
      events: {
        ...bus.port,
        commit(reservation, phaseGuard) {
          const t = d.observer ? performance.now() : 0;
          try {
            return bus.port.commit(reservation, phaseGuard);
          } finally {
            if (d.observer) eventCost += performance.now() - t;
          }
        },
      },
      reserveIntake: (v) => intake.reserve(v),
      rejectIntake: (id) => intake.reject(id),
      acceptIntake: (v) => intake.accept(v),
      inspectIntake: (id) => intake.inspect(id),
      acknowledgeIntake(id) {
        const receipt = intake.inspect(id);
        assert(receipt?.accepted);
        intake.acknowledge(receipt);
      },
      inspectIntakeRelease: (id) => intake.inspectRelease(id),
    });
    own(
      'bridge',
      () => bridge.dispose(),
      () => bridge.getStats(),
    );
    const actualStep = authority.step;
    authority.step = (time, packets, requests, measure) => {
      const t = d.observer ? performance.now() : 0;
      const result = actualStep(time, packets, requests, measure);
      authorityCost = d.observer ? performance.now() - t : 0;
      if (preparedChange?.tick === time.tick) target = preparedChange.target;
      bodiesAfterPhysical = bodySnapshot(world, ids);
      guard.phase = 'SELECTION_SETTLEMENT';
      return result;
    };
    bus.subscribe((event) => {
      assert(progress.events.length < 200);
      progress.events.push(event);
      const record = event.type === 'MANUAL_END' ? closedReservation : openedReservation;
      assert(record);
      progress.boundaryTrace.push({
        tick: event.tick,
        segmentId: record.segmentId,
        mode: record.controlMode,
        reason: record.closeReason,
        completeness: record.completeness,
      });
      return undefined;
    });
    const selection = createVehicleSelection(context, {
      readAuthority: () => authority.getStats(),
      bodyIdentity: (id) => world.bodyIdentity(id),
      readPresentation: (identity) => ({
        identity,
        kind: ids.indexOf(identity) < 30 ? 'TAXI' : 'CIVIL',
        visible: true,
        selectable: true,
      }),
      readCameraTarget: () => world.bodyIdentity(camera.selectedEntityId) ?? null,
      selectCamera: (identity) => camera.select(identity.entityId),
      clearInput: () => modes.clear(),
      readAssignment: (identity) => ({
        context,
        identity,
        routeFingerprint: 'fixed-reference-route',
        tripFingerprint: ids.indexOf(identity) < 30 ? 'fixed-reference-trip' : null,
      }),
      ...bridge.selectionBoundary,
    });
    own(
      'selection',
      () => selection.dispose(),
      () => selection.getStats(),
    );
    for (let i = 0; i < ids.length; i++) selection.register(ids[i], i < 30 ? 'TAXI' : 'CIVIL');
    bridge.bind(modes, selection);
    const inputDigest = createHash('sha256'),
      rawDigest = createHash('sha256'),
      physical = createHash('sha256');
    const previousVelocity = world.readBody(ids[0]).velocityMps;
    let priorVelocity = previousVelocity;
    progress.heap.beforeWarmup = process.memoryUsage();
    guard.phase = 'DRIVING';

    for (let tick = 1; tick <= 780; tick++) {
      enterStages(d.observer,tick);
      progress.attemptedTick = tick;
      eventCost = 0;
      const begin = d.observer ? performance.now() : 0,
        phase = manualReferencePhase(tick),
        prior = authority.getStats().seat;
      const desired = d.fixedMode ? (tick === 1 ? d.fixedMode : null) : phase.desiredMode;
      if (desired) {
        const action = referenceModeAction(prior?.mode ?? 'AUTO', desired);
        if (action) assert(modes.enqueue(action));
      }
      if (!d.fixedMode && phase.selectOrdinal !== null)
        assert(selection.enqueue(ids[phase.selectOrdinal], 'WORLD'));
      preparedCause = null;
      preparedChange = null;
      if (!d.fixedMode && phase.boundary === 'RIDE_COMPLETED')
        preparedCause = Object.freeze({
          ...context,
          version: '069-admitted-cause-v1',
          operationId: 'ride-' + tick,
          timing: 'PREPARED_BEFORE_NEXT_TICK',
          tick,
          identity: prior.identity,
          reason: 'RIDE_COMPLETED',
        });
      if (!d.fixedMode && phase.boundary === 'PROFILE_CHANGE')
        preparedChange = Object.freeze({
          ...context,
          version: '069-validated-target-change-v1',
          operationId: 'profile-' + tick,
          tick,
          reason: 'PROFILE_CHANGE',
          target: Object.freeze({
            ...target,
            learningEpoch: target.learningEpoch + 1,
            baseVersionId: 'reference-base-' + (target.learningEpoch + 1),
          }),
        });
      keyboard.setAction('throttle', d.fixedMode ? false : phase.throttleHeld);
      keyboard.setAction('brake', d.fixedMode ? false : phase.brakeHeld);
      keyboard.setAction('steerRight', d.fixedMode ? false : phase.steerRightHeld);
      keyboard.setAction('steerLeft', d.fixedMode ? false : phase.steerLeftHeld);
      const beforeBody = world.readBody(ids[0]),
        filtered = keyboard.step({
          tick,
          dtSeconds: 1 / 60,
          speedMps: Math.hypot(...Object.values(beforeBody.velocityMps)),
        });
      rawDigest.update(JSON.stringify(filtered.raw));
      const packets = ids.map((identity, i) => ({
        identity,
        command: command(identity.entityId, tick, 'AUTONOMY', {
          throttle: d.fixedMode ? 0 : i % 2 ? 0.65 : 1,
          brake: 0,
          steering: d.fixedMode ? 0 : i % 2 ? 0.03 : -0.03,
        }),
      }));
      packets.push({
        identity: ids[0],
        command: command('car-0', tick, 'PLAYER', filtered.command),
      });
      inputDigest.update(JSON.stringify(packets));
      const bridgeStart = d.observer ? performance.now() : 0;
      const accepted = bridge.step(
        referenceTime(context, tick, '066-control-authority-v1'),
        packets,
        { cause: preparedCause, targetChange: preparedChange },
        d.observer,
      );
      const bridgeCost = d.observer ? performance.now() - bridgeStart : 0;
      progress.acceptedTick = accepted.frame.tick;
      progress.nativeStepSerial = world.collisionStepSerial();
      assert.equal(progress.nativeStepSerial, tick);
      assert(bodiesAfterPhysical);
      sameNativeSnapshot(world, ids, bodiesAfterPhysical, tick);
      guard.phase = 'DRIVING';
      selected = world.bodyIdentity(camera.selectedEntityId);
      const seat = authority.getStats().seat;
      const boundaryCost = d.observer ? bridgeCost - authorityCost - eventCost : 0;
      const state = world.readBody(ids[0]),
        delta = {
          x: (state.velocityMps.x - priorVelocity.x) * 60,
          y: (state.velocityMps.y - priorVelocity.y) * 60,
          z: (state.velocityMps.z - priorVelocity.z) * 60,
        };
      priorVelocity = state.velocityMps;
      const append = d.fixedMode ? tick >= 748 && tick <= 779 : tick % 6 === 0 && tick < 780;
      if (seat && append) {
        const b = bridge.lifecycle.observe().active,
          projection = accepted.frame.controls.find((c) => c.identity === ids[0]),
          config = vehicleClass(world.readVehicleMechanics('car-0').classId);
        assert(projection && projection.mode === seat.mode);
        const q = state.transform.rotationQuaternion,
          forward = {
            x: 2 * (q.x * q.z + q.w * q.y),
            y: 2 * (q.y * q.z - q.w * q.x),
            z: 1 - 2 * (q.x * q.x + q.y * q.y),
          },
          right = {
            x: 1 - 2 * (q.y * q.y + q.z * q.z),
            y: 2 * (q.x * q.y + q.w * q.z),
            z: 2 * (q.x * q.z - q.w * q.y),
          };
        bridge.lifecycle.appendSample(
          ids[0],
          nativeReferenceSample(context, {
            tick,
            identity: ids[0],
            mode: seat.mode,
            classId: config.classId,
            baseVersionId: store.port.read(b.segmentId).baseVersionId,
            transform: state.transform,
            velocityMps: state.velocityMps,
            command: projection.command,
            rawInput: {
              throttle: filtered.raw.throttle,
              brake: filtered.raw.brake,
              steering: filtered.raw.steering,
              handbrake: filtered.raw.handbrake,
            },
            longitudinalAccelerationMps2:
              delta.x * forward.x + delta.y * forward.y + delta.z * forward.z,
            lateralAccelerationMps2: delta.x * right.x + delta.y * right.y + delta.z * right.z,
            capabilities: {
              maxAccelerationMps2:
                tractiveForceN(config, Math.hypot(...Object.values(state.velocityMps))) /
                config.massKg,
              maxDecelerationMps2: config.brakeAcceleration,
              maxLateralAccelerationMps2: config.grip * 9.81,
            },
            incident: world.contacts() > 0,
          }),
        );
      }
      const states = bodySnapshot(world, ids);
      for (const b of states) {
        assert(
          [
            ...Object.values(b.body.transform.positionM),
            ...Object.values(b.body.transform.rotationQuaternion),
            ...Object.values(b.body.velocityMps),
          ].every(Number.isFinite),
        );
        const m = world.readVehicleMechanics(b.identity.entityId);
        assert(
          [
            m.massKg,
            m.grip,
            m.brakeAccelerationMps2,
            ...m.appliedEngineForceN,
            ...m.appliedSteeringRadians,
            ...m.wheelBrakeImpulseLimitNs,
          ].every(Number.isFinite),
        );
        progress.finiteBodyTickChecks++;
      }
      physical.update(JSON.stringify(states));
      if (tick % 60 === 0)
        progress.checkpoints.push({
          tick,
          nativeStepSerial: tick,
          bodies: states.map((b) => ({ identity: b.identity, ...b.body })),
        });
      assert.equal(modes.observe().tick, tick);
      assert.equal(selection.observe().tick, tick);
      assert(authority.getStats().players <= 1);
      if (d.observer && tick > 180) {
        const i = tick - 181;
        buffers.tickMs[i] = performance.now() - begin;
        buffers.authorityMs[i] = authorityCost;
        assert(boundaryCost >= 0 && Number.isFinite(boundaryCost));
        buffers.boundaryMs[i] = boundaryCost;
        buffers.deliveryMs[i] = eventCost;
        buffers.rapierMs[i] = accepted.frame.physics.stepMs;
        progress.timingSampleCount = i + 1;
      }
      if (tick === 180) progress.heap.afterWarmup = process.memoryUsage();
    }
    progress.heap.afterMeasured = process.memoryUsage();
    await immutableJson(folder + "/worlds/world-" + d.ordinal + ".stages.json", finishStages());
    stageExported=true;
    progress.nativeInputDigest = wrapped.finishNativeDigest() ?? guard.nativeInputDigest;
    progress.packetDigest = inputDigest.digest('hex');
    progress.rawInputDigest = rawDigest.digest('hex');
    progress.physicalDigest = physical.digest('hex');
    const live = store.getStats();
    progress.liveRecords = {
      ...live,
      retainedRecords: live.records,
      archivedUtf8Bytes: live.serializedArrayBytes,
      intake: intake.getStats(),
      owner: bridge.lifecycle.observe(),
    };
    preparedCause = Object.freeze({
      ...context,
      version: '069-admitted-cause-v1',
      operationId: 'shutdown',
      timing: 'AT_LAST_ACCEPTED_TICK',
      tick: 780,
      identity: authority.getStats().seat?.identity ?? null,
      reason: 'SHUTDOWN',
    });
    const terminalStart = performance.now();
    bridge.lifecycle.retire(preparedCause);
    progress.nativeBoundaryTotalMs = performance.now() - terminalStart;
    assert.equal(world.collisionStepSerial(), 780);
    const terminalObservation = bridge.lifecycle.observe(),
      terminalClosed = terminalObservation.lastClosed;
    assert(terminalClosed);
    progress.terminalBoundary = {
      stage: 'SHUTDOWN_AT_LAST_ACCEPTED_TICK',
      cause: preparedCause,
      before: progress.liveRecords.owner,
      after: terminalObservation,
      closed: terminalClosed,
      record: store.port.read(terminalClosed.segmentId),
      nativeSerialBefore: progress.nativeStepSerial,
      nativeSerialAfter: world.collisionStepSerial(),
      boundaryMs: progress.nativeBoundaryTotalMs,
    };
    progress.segmentRecords = [...recordIds].map((id) => store.port.read(id));
    progress.lifecycle = productionOwnershipCycles(context, world, ids, 780);
    if (d.kind === 'SEMANTIC') {
      const original = progress.terminalBoundary.record;
      assert.equal(original.samples.length, 32);
      progress.maximumRecord = {
        segmentId: original.segmentId,
        samples: original.samples.length,
        events: original.events.length,
        bytes: Buffer.byteLength(JSON.stringify(original)),
        nativeLifecycleBoundaryMs: progress.nativeBoundaryTotalMs,
        scope: 'ACTUAL_PRODUCTION_LIFECYCLE_NATIVE_SAMPLES_TERMINAL_BOUNDARY',
      };
      const stress = referenceSchemaStress(original);
      progress.schemaStress = productionSchemaBoundary(context, stress.record);
      progress.emptyRecord = parseInterventionSegment({
        ...original,
        segmentId: 'empty-reference',
        startTick: 780,
        endTick: 780,
        samples: [],
        events: [],
        closeReason: 'ROLLOVER',
      });
    }
    progress.drivingHostMutations = Object.values(guard.drivingCalls).reduce((a, b) => a + b, 0);
    assert.equal(progress.drivingHostMutations, 0);
  } catch (error) {
    terminal = error;
    failed = true;
    progress.failureDiagnostics = boundedDiagnosticData(readDiagnosticField(error, 'diagnostics'));
    progress.primary = serializeDiagnostic(error);
  } finally {
    if(!stageExported){try{await immutableJson(folder+'/worlds/world-'+d.ordinal+'.stages.json',finishStages());stageExported=true;}catch(exportError){terminal=new AggregateError([...(failed?[terminal]:[]),exportError],'Primary/diagnostic-prefix export failure');failed=true;}}
    if (failed && bridge !== null) {
      try {
        progress.failureRetirement = retireHealthyAfterFailure(bridge, () => {
          const a = authority.getStats();
          preparedCause = Object.freeze({
            ...context,
            version: '069-admitted-cause-v1',
            operationId: 'failure-shutdown',
            timing: 'AT_LAST_ACCEPTED_TICK',
            tick: a.tick,
            identity: a.seat?.identity ?? null,
            reason: 'SHUTDOWN',
          });
          return preparedCause;
        });
      } catch (retireError) {
        terminal = new AggregateError(
          [terminal, retireError],
          'Original failure and explicit retirement failure',
        );
        progress.retirementFailure = serializeDiagnostic(retireError);
      }
    }
    try {
      progress.cleanup = resources.close();
      if (progress.cleanup.causes.length) {
        terminal = new AggregateError(
          [...(failed ? [terminal] : []), ...progress.cleanup.causes],
          'Original and actual cleanup causes',
        );
        failed = true;
      }
    } catch (error) {
      terminal = new AggregateError(
        [...(failed ? [terminal] : []), error],
        'Original/scope close failure',
      );
      failed = true;
      progress.cleanup = {
        errors: [{ phase: 'SCOPE_CLOSE', ...serializeDiagnostic(error) }],
        attempts: [],
        snapshots: {},
      };
    }
    if (native) {
      try {
        native.project('car-0');
        progress.cleanup.disposedReadRejected = false;
      } catch (error) {
        progress.cleanup.disposedReadError = serializeDiagnostic(error);
        progress.cleanup.disposedReadRejected = /disposed/i.test(
          serializeDiagnostic(error).message,
        );
      }
    } else progress.cleanup.disposedReadRejected = null;
    for (const c of REFERENCE_PROTOCOL.channels) {
      progress.raw[c] = buffers[c] ? [...buffers[c]].slice(0, progress.timingSampleCount) : null;
      progress.distributions[c] = progress.raw[c]?.length ? distribution(progress.raw[c]) : null;
    }
    progress.completedAt = new Date().toISOString();
    progress.terminalErrors = failed ? serializeDiagnostic(terminal) : null;
    progress.status = failed || progress.cleanup.errors.length ? 'FAIL' : 'PASS';
    // Preserve actual record BEFORE numeric acceptance; a validation fault receives its own marker.
    try {
      await immutableJson(
        folder +
          '/worlds/world-' +
          d.ordinal +
          '.' +
          (progress.status === 'PASS' ? 'complete' : 'partial') +
          '.json',
        progress,
      );
    } catch (exportError) {
      terminal = new AggregateError(
        [...(failed ? [terminal] : []), ...(progress.cleanup.causes ?? []), exportError],
        'Reference original/cleanup/export failure',
      );
      failed = true;
    }
  }
  if (failed) throw terminal;
  validateRecord(progress, d, sourceHash);
  return progress;
}
try {
  guardCopyRuntime(); // BEFORE first native acquisition.
  for (const d of descriptors()) await run(d);
  guardCopyRuntime(); // AFTER final world cleanup.
  const records=[];
  for(const d of descriptors()){const record=JSON.parse(await readFile(folder+'/worlds/world-'+d.ordinal+'.complete.json'));validateRecord(record,d,sourceHash);records.push(record);}
  assert.equal(records.length,10);
  for(let pair=0;pair<5;pair++){const arms=records.filter(r=>r.descriptor.pair===pair);assert.equal(arms.length,2);for(const f of ['nativeInputDigest','packetDigest','physicalDigest','rawInputDigest'])assert.equal(arms[0][f],arms[1][f]);assert.deepEqual(arms[0].checkpoints,arms[1].checkpoints);}
  await immutableJson(folder+'/complete.json',{status:'DIAGNOSTIC_COLLECTED_NOT_ACCEPTANCE',sourceHash,startedAt,archivedAt,firstWorldAt,completedAt:new Date().toISOString(),worlds:10,absoluteGateFlags:records.filter(r=>r.descriptor.observer).map(r=>({pair:r.descriptor.pair,tickP95:r.distributions.tickMs.p95,rapierP95:r.distributions.rapierMs.p95,normalTickViolation:r.distributions.tickMs.p95>5.5,normalRapierViolation:r.distributions.rapierMs.p95>3})),scope:'Nested observer timings; no originalbaseline replacement/performance acceptance'});
} catch (error) {
  await exportFailurePreserving(error, () =>
    immutableJson(folder + '/failure.json', {
      status: 'FAIL',
      sourceHash,
      firstWorldAt,
      failedAt: new Date().toISOString(),
      error: serializeDiagnostic(error),
      diagnostics: boundedDiagnosticData(readDiagnosticField(error, 'diagnostics')),
    }),
  );
  throw error;
}
