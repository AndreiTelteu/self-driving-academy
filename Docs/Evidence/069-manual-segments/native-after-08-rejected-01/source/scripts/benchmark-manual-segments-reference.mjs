// SOURCE draft069 BEFORE. Never import/create production069. Parent SOURCE/CPU grants required.
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
import { createEventBus } from '../src/simulation/index.ts';
import { parseInterventionSegment } from '../src/telemetry/index.ts';
import { createRapierProbe } from '../src/vehicles/rapier/index.ts';
import { createReferenceResourceScope } from '../tests/input/vehicle-selection-reference.ts';
import {
  acquireGuardedReferenceWorld,
  bodySnapshot,
  sameNativeSnapshot,
} from '../tests/input/vehicle-selection-native-guard-v2.ts';
import {
  createManualReferenceStore,
  manualReferencePhase,
  referenceModeAction,
  referenceTime,
  nativeReferenceSample,
  boundedFixtureRecord,
  referencePreparseBytes,
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
} from './manual-segments-reference-records.mjs';

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
assert.equal(
  execFileSync('git', ['diff', 'HEAD', '--name-only', '--', 'src'], { encoding: 'utf8' }).trim(),
  '',
  'Reference production unchanged',
);
const absent = async (path) => {
  try {
    await access(path);
    return false;
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    throw e;
  }
};
for (const path of [
  'src/telemetry/intervention-lifecycle.ts',
  'src/telemetry/lifecycle-contracts.ts',
  'src/app/manual-segment-lifecycle.ts',
])
  assert(await absent(path), '069 source must be absent');
const folder = 'Docs/Evidence/069-manual-segments/native-before-03';
assert(await absent(folder), 'Immutable attempt exists');
await mkdir(folder, { recursive: false });
const startedAt = new Date().toISOString();
await immutableJson(folder + '/started.json', {
  startedAt,
  commit,
  expectedRoot,
  protocol: REFERENCE_PROTOCOL,
  phase: 'CHRONOLOGICAL_BEFORE_PRODUCT_ABSENT',
});
const files = [
  ...execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/)
    .map((p) => p.replaceAll('\\', '/')),
  'scripts/benchmark-manual-segments-reference.mjs',
  'scripts/manual-segments-reference-records.mjs',
  'tests/telemetry/manual-segments-reference.ts',
  'tests/telemetry/manual-segments-reference-records.test.mjs',
  'tests/input/vehicle-selection-native-guard-v2.ts',
  'tests/input/vehicle-selection-reference.ts',
  'Docs/Evidence/069-manual-segments/verify-reference.mjs',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
].sort();
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
const sourceHash = source.digest('hex'),
  archivedAt = new Date().toISOString();
const manifest = {
  version: '069-native-reference-manifest-v1',
  startedAt,
  archivedAt,
  commit,
  sourceHash,
  inputs,
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
    'Supplemental native CPU. Host005 records ineligible; no069 product/recorder/estimator, renderer or FPS proof.',
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
const hash = (value) => sha256(Buffer.from(JSON.stringify(value)));
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
let firstWorldAt = null;
async function run(d) {
  await immutableJson(folder + '/worlds/world-' + d.ordinal + '.started.json', {
    descriptor: d,
    sourceHash,
    startedAt: new Date().toISOString(),
  });
  const resources = createReferenceResourceScope(),
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
    terminal = null;
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
    const authority = createControlAuthority(context, controller, {
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
    store = createManualReferenceStore(context);
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
    const bus = createEventBus({
      sessionId: context.sessionId,
      worldEpoch: 0,
      maxEventsPerEpoch: 200,
      maxListeners: 1,
    });
    own(
      'bus',
      () => bus.dispose(),
      () => bus.getStats(),
    );
    bus.subscribe((event) => {
      assert(progress.events.length < 200);
      progress.events.push(event);
      return undefined;
    });
    let eventSequence = 0,
      eventCost = 0;
    const publish = (type, boundary, tick) => {
      const start = d.observer ? performance.now() : 0;
      const result = bus.publish({
        ...context,
        eventId: 'ref-' + ++eventSequence,
        tick,
        type,
        entityIds: [boundary.identity.entityId],
        payload: {
          vehicleId: boundary.identity.entityId,
          controlMode: boundary.segment.controlMode,
        },
      });
      assert.equal(result.status, 'delivered');
      assert.equal(result.failures.length, 0);
      if (d.observer) eventCost += performance.now() - start;
    };
    const close = (identity, tick, reason) => {
      const boundary = store.close(identity, tick, reason);
      publish('MANUAL_END', boundary, tick);
      progress.boundaryTrace.push({
        tick,
        segmentId: boundary.segment.segmentId,
        mode: boundary.segment.controlMode,
        reason,
        completeness: 'CLOSED',
      });
      return boundary;
    };
    const open = (seat, tick) => {
      const boundary = store.open(seat.identity, seat.mode, tick);
      publish('MANUAL_START', boundary, tick);
      progress.boundaryTrace.push({
        tick,
        segmentId: boundary.segment.segmentId,
        mode: seat.mode,
        reason: null,
        completeness: 'OPEN',
      });
    };
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
      readBoundary: (identity) => {
        const b = store.read();
        if (!b || b.identity !== identity) return null;
        return {
          context,
          identity,
          segmentId: b.segment.segmentId,
          mode: b.segment.controlMode,
          startTick: b.segment.startTick,
          endTick: b.segment.endTick,
          completeness: b.segment.completeness,
          closeReason: b.segment.closeReason,
        };
      },
      closeBoundary: (event) => {
        close(event.identity, event.tick, 'VEHICLE_SWITCH');
      },
    });
    own(
      'selection',
      () => selection.dispose(),
      () => selection.getStats(),
    );
    for (let i = 0; i < ids.length; i++) selection.register(ids[i], i < 30 ? 'TAXI' : 'CIVIL');
    const inputDigest = createHash('sha256'),
      rawDigest = createHash('sha256'),
      physical = createHash('sha256');
    const previousVelocity = world.readBody(ids[0]).velocityMps;
    let priorVelocity = previousVelocity;
    progress.heap.beforeWarmup = process.memoryUsage();
    guard.phase = 'DRIVING';
    for (let tick = 1; tick <= 780; tick++) {
      progress.attemptedTick = tick;
      eventCost = 0;
      const begin = d.observer ? performance.now() : 0,
        phase = manualReferencePhase(tick),
        prior = authority.getStats().seat;
      const desired = d.fixedMode ? (tick === 1 ? d.fixedMode : null) : phase.desiredMode;
      let modeTicket = null,
        selectionTicket = null,
        requests = [],
        cause = null;
      const boundaryStart = d.observer ? performance.now() : 0;
      if (desired) {
        const action = referenceModeAction(prior?.mode ?? 'AUTO', desired);
        if (action) {
          assert(modes.enqueue(action));
          modeTicket = modes.prepare(referenceTime(context, tick, '067-mode-controls-v1'));
          requests = modeTicket.requests;
        }
      }
      if (!d.fixedMode && phase.selectOrdinal !== null) {
        assert(selection.enqueue(ids[phase.selectOrdinal], 'WORLD'));
        selectionTicket = selection.prepare(
          referenceTime(context, tick, '068-vehicle-selection-v1'),
        );
        assert(selectionTicket);
        requests = selectionTicket.requests;
      }
      if (!d.fixedMode && phase.boundary) cause = phase.boundary;
      const preparedCost = d.observer ? performance.now() - boundaryStart : 0;
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
      const authorityStart = d.observer ? performance.now() : 0;
      const accepted = authority.step(
        referenceTime(context, tick, '066-control-authority-v1'),
        packets,
        requests,
        d.observer,
      );
      progress.acceptedTick = accepted.frame.tick;
      progress.nativeStepSerial = world.collisionStepSerial();
      assert.equal(progress.nativeStepSerial, tick);
      const authorityCost = d.observer ? performance.now() - authorityStart : 0,
        settleStart = d.observer ? performance.now() : 0;
      const bodiesBefore = bodySnapshot(world, ids);
      guard.phase = 'SELECTION_SETTLEMENT';
      if (selectionTicket) {
        assert.equal(selection.settle(selectionTicket), 'ACCEPTED');
        selected = world.bodyIdentity(camera.selectedEntityId);
        assert.equal(authority.getStats().seat, null);
      }
      if (modeTicket) assert.equal(modes.settle(modeTicket), 'ACCEPTED');
      const seat = authority.getStats().seat;
      if (
        !selectionTicket &&
        prior &&
        (prior.mode !== seat?.mode || prior.identity !== seat?.identity)
      )
        close(prior.identity, tick, seat ? 'MODE_CHANGE' : 'RETURN_TO_AUTO');
      if (cause && seat) {
        close(seat.identity, tick, cause);
        if (cause === 'PROFILE_CHANGE') store.incrementEpoch();
      }
      if (seat && (!prior || prior.mode !== seat.mode || prior.identity !== seat.identity || cause))
        open(seat, tick);
      sameNativeSnapshot(world, ids, bodiesBefore, tick);
      guard.phase = 'DRIVING';
      const boundaryCost =
        preparedCost + (d.observer ? performance.now() - settleStart : 0) - eventCost;
      const state = world.readBody(ids[0]),
        delta = {
          x: (state.velocityMps.x - priorVelocity.x) * 60,
          y: (state.velocityMps.y - priorVelocity.y) * 60,
          z: (state.velocityMps.z - priorVelocity.z) * 60,
        };
      priorVelocity = state.velocityMps;
      const append = d.fixedMode ? tick >= 748 && tick <= 779 : tick % 6 === 0 && tick < 780;
      if (seat && append) {
        const b = store.read(),
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
        store.append(
          nativeReferenceSample(context, {
            tick,
            identity: ids[0],
            mode: seat.mode,
            classId: config.classId,
            baseVersionId: b.segment.baseVersionId,
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
    global.gc?.();
    progress.heap.afterMeasured = process.memoryUsage();
    progress.nativeInputDigest = wrapped.finishNativeDigest() ?? guard.nativeInputDigest;
    progress.packetDigest = inputDigest.digest('hex');
    progress.rawInputDigest = rawDigest.digest('hex');
    progress.physicalDigest = physical.digest('hex');
    progress.liveRecords = store.getStats();
    const seat = authority.getStats().seat;
    if (seat) close(seat.identity, 780, 'SHUTDOWN');
    progress.segmentRecords = store.archive();
    for (let cycle = 0; cycle < 20; cycle++) {
      const before = bodySnapshot(world, ids),
        nativeSerialBefore = world.collisionStepSerial();
      const candidate = createManualReferenceStore(context);
      let primary = null;
      try {
        candidate.open(ids[0], 'MANUAL', 780);
        candidate.close(ids[0], 780, 'SHUTDOWN');
      } catch (error) {
        primary = error;
      } finally {
        candidate.dispose();
      }
      const after = sameNativeSnapshot(world, ids, before, nativeSerialBefore);
      progress.lifecycle.push({
        cycle,
        nativeSerialBefore,
        nativeSerialAfter: world.collisionStepSerial(),
        beforeHash: hash(before),
        afterHash: hash(after),
        disposed: candidate.getStats(),
      });
      if (primary) throw primary;
    }
    if (d.kind === 'SEMANTIC') {
      const original = progress.segmentRecords.at(-1);
      assert.equal(original.samples.length, 32);
      progress.maximumRecord = {
        samples: 32,
        bytes: Buffer.byteLength(JSON.stringify(original)),
        timings: [],
      };
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const parsed = boundedFixtureRecord(original).record;
        progress.maximumRecord.timings.push(performance.now() - start);
        assert.deepEqual(parsed, original);
      }
      // Empty no-motion metadata is checked without a physics step, not a claim that a resting body has mathematically zero jitter.
      const stress = referenceSchemaStress(original);
      progress.schemaStress = {
        scope: 'SYNTHETIC_SCHEMA_STRESS_NOT_NATIVE_EVENTS_OR_CONFLICTS',
        record: stress.record,
        bytes: stress.bytes,
        timings: [],
        overByteRejected: false,
      };
      for (let i = 0; i < 5; i++) {
        const begin = performance.now();
        referencePreparseBytes(stress.record);
        const preflightEnd = performance.now();
        const parsed = parseInterventionSegment(stress.record);
        const parseEnd = performance.now();
        const repository = [];
        repository.push(Object.freeze({ record: parsed, bytes: stress.bytes }));
        assert.equal(repository[0].record, parsed);
        const commitEnd = performance.now();
        progress.schemaStress.timings.push({
          preflightMs: preflightEnd - begin,
          parseMs: parseEnd - preflightEnd,
          commitMs: commitEnd - parseEnd,
          totalMs: commitEnd - begin,
        });
      }
      const over = structuredClone(stress.record);
      let amended = false;
      for (const sample of over.samples)
        for (let i = 0; i < sample.context.conflictEntityIds.length && !amended; i++)
          if (sample.context.conflictEntityIds[i].length < 256) {
            sample.context.conflictEntityIds[i] += 'x';
            amended = true;
          }
      assert(amended);
      assert.equal(Buffer.byteLength(JSON.stringify(over)), 65537);
      try {
        boundedFixtureRecord(over);
      } catch (error) {
        progress.schemaStress.overByteRejected = /byte capacity/.test(String(error));
      }
      assert(progress.schemaStress.overByteRejected);
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
    progress.primary = {
      name: error?.name ?? 'Error',
      message: String(error),
      stack: String(error?.stack ?? '').slice(0, 4096),
    };
  } finally {
    try {
      progress.cleanup = resources.close();
    } catch (error) {
      terminal ??= error;
      progress.cleanup = {
        errors: [{ phase: 'SCOPE_CLOSE', message: String(error) }],
        attempts: [],
        snapshots: {},
      };
    }
    if (native) {
      try {
        native.project('car-0');
        progress.cleanup.disposedReadRejected = false;
      } catch (error) {
        progress.cleanup.disposedReadError = String(error);
        progress.cleanup.disposedReadRejected = /disposed/i.test(String(error));
      }
    } else progress.cleanup.disposedReadRejected = null;
    for (const c of REFERENCE_PROTOCOL.channels) {
      progress.raw[c] = buffers[c] ? [...buffers[c]].slice(0, progress.timingSampleCount) : null;
      progress.distributions[c] = progress.raw[c]?.length ? distribution(progress.raw[c]) : null;
    }
    progress.completedAt = new Date().toISOString();
    progress.status = terminal || progress.cleanup.errors.length ? 'FAIL' : 'PASS';
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
        [
          ...(terminal ? [terminal] : []),
          ...progress.cleanup.errors.map((e) => new Error(e.message)),
          exportError,
        ],
        'Reference original/cleanup/export failure',
      );
    }
  }
  if (terminal) throw terminal;
  validateRecord(progress, d, sourceHash);
  return progress;
}
try {
  for (const d of descriptors()) await run(d);
  const records = await verifyInventory(folder, sourceHash);
  await immutableJson(folder + '/complete.json', {
    status: 'PASS',
    sourceHash,
    startedAt,
    archivedAt,
    firstWorldAt,
    completedAt: new Date().toISOString(),
    worlds: records.length,
    protocol: REFERENCE_PROTOCOL,
  });
} catch (error) {
  await immutableJson(folder + '/failure.json', {
    status: 'FAIL',
    sourceHash,
    firstWorldAt,
    failedAt: new Date().toISOString(),
    name: error?.name ?? 'Error',
    message: String(error),
    stack: String(error?.stack ?? '').slice(0, 4096),
    causes:
      error instanceof AggregateError
        ? error.errors.map((e) => String(e).slice(0, 512)).slice(0, 12)
        : [],
  });
  throw error;
}
