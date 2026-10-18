// DISTINCT068 AFTER draft. Unexecuted; parent source review and capture grant required.
import assert from 'node:assert/strict';
import {
  worldId,
  preserveWorldRecord,
  verifyWorldInventory,
} from './vehicle-selection-after-records.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createControlAuthority } from '../src/input/control-authority.ts';
import { createModeControls } from '../src/input/mode-controls.ts';
import { createVehicleSelection } from '../src/input/vehicle-selection.ts';
import { createVehicleController } from '../src/vehicles/controller.ts';
import { createKeyboardFilter } from '../src/vehicles/keyboard-filter.ts';
import { createDefaultSettings } from '../src/settings/store.ts';
import { createRapierProbe } from '../src/vehicles/rapier/index.ts';
import { VehicleCameraController } from '../src/rendering/vehicle-camera.ts';
import { parseRide } from '../src/fleet/contracts.ts';
import {
  acquireGuardedReferenceWorld,
  bodySnapshot,
  sameNativeSnapshot,
} from '../tests/input/vehicle-selection-native-guard-v2.ts';
import { CONTROLLER_CONTEXT, controllerCommand } from '../tests/vehicles/controller-reference.ts';
import {
  referenceSelectionPhase,
  createFixtureSegmentStore,
  createReferenceResourceScope,
} from '../tests/input/vehicle-selection-reference.ts';

const expectedRoot = 'F:/Sites/self-driving-academy/.worktrees/vehicle-switch-01';
assert.equal(resolve('.').replaceAll('\\', '/'), expectedRoot);
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/vehicle-switch-01',
);
const folder = 'Docs/Evidence/068-vehicle-switch/native-after-01',
  output = folder + '/after.json',
  archive = folder + '/source-after';
const baseline = JSON.parse(
  await readFile('Docs/Evidence/068-vehicle-switch/corrected-reference-v2/before.json'),
);
assert.equal(baseline.status, 'PASS');
assert.equal(
  baseline.sourceHash,
  'fcb9a71661d7630cfbb137ba08b176fef1a6ed0927ed50c4e438b0d12809cace',
);
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
assert.equal(await exists(folder), false, 'Immutable AFTER attempt directory exists');
assert.equal(await exists(output), false, 'Immutable AFTER exists');
assert.equal(await exists(archive), false, 'Immutable archive exists');
assert.equal(await exists(folder + '/after-started.json'), false, 'BEFORE already attempted');
assert.equal(
  await exists('src/input/vehicle-selection.ts'),
  true,
  '068 actual production required',
);
assert.equal(
  execFileSync('git', [
    'merge-base',
    '--is-ancestor',
    'ad32db9c609cce1132669c95312ae202a62b87ed',
    'HEAD',
  ]).length,
  0,
);
const startedAt = new Date().toISOString();
await mkdir(folder, { recursive: true });
await writeFile(
  folder + '/after-started.json',
  JSON.stringify({ startedAt, expectedRoot, phase: 'IMPLEMENTATION_AFTER' }, null, 2),
  { flag: 'wx' },
);
const files = execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .map((path) => path.replaceAll('\\', '/'));
files.push(
  'scripts/benchmark-vehicle-selection-before.mjs',
  'scripts/benchmark-vehicle-selection-before-v2.mjs',
  'scripts/benchmark-vehicle-selection-after.mjs',
  'scripts/vehicle-selection-after-records.mjs',
  'Docs/Evidence/068-vehicle-switch/verify-after-inventory.mjs',
  'Docs/Evidence/068-vehicle-switch/after-numeric-checks.mjs',
  'Docs/Evidence/068-vehicle-switch/verify-after.mjs',
  'Docs/Evidence/068-vehicle-switch/verify-baseline-v2.mjs',
  'Docs/Evidence/068-vehicle-switch/corrected-reference-v2/before.json',
  'tests/input/vehicle-selection-native-guard-v2.ts',
  'tests/input/vehicle-selection-reference.ts',
  'tests/vehicles/physics-fixture.ts',
  'tests/vehicles/controller-reference.ts',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
);
files.sort();
const source = createHash('sha256'),
  inputs = [];
for (const path of files) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  inputs.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  const target = archive + '/' + path;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' });
}
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat'));
const nativeBytes = await readFile(nativePath),
  nativeRelative = 'native-after/rapier.mjs';
await mkdir(folder + '/native-after', { recursive: true });
await writeFile(folder + '/' + nativeRelative, nativeBytes, { flag: 'wx' });
const nativeArtifact = {
  path: nativePath,
  archiveRelativePath: nativeRelative,
  bytes: nativeBytes.length,
  sha256: hash(nativeBytes),
  archivedAt: new Date().toISOString(),
  archiveTiming: 'Actual installed ESM bytes archived BEFORE first native world',
};
const report = {
  status: 'RUNNING',
  startedAt,
  firstWorldAt: null,
  capturedAt: null,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: source.digest('hex'),
  inputs,
  nativeArtifact,
  fixtureVersion: '068-production-selection-after-v1',
  baselineSourceHash: baseline.sourceHash,
  dependencyMerge: '8a8e4aa2b98a964ed13ed83fe9092060a10aa019',
  dependencyCost:
    'Published029 controller, availability undefined; relative whole-tick difference includes dependency and harness costs, not pure068 causal cost.',
  originalFailedSourceHash: 'e8d9c7cd249f3633a58ad077632d72e2c0c55cdb86cb5a1dedec08dd3fd5afd5',
  budgetVersion: '203-initial-1',
  runtime: process.version,
  cpu: cpus()[0]?.model,
  os: platform() + ' ' + release(),
  runs: [],
  scenarios: [],
  guards: [],
  resourceFailures: [],
  worldRecords: [],
  scope:
    '068 actual implementation AFTER.20fleet+12class/mode/kind+2guard native worlds. Published067 explicit claim/066 release; pure017 camera controller/readback, no Babylon renderer/018 raycast or FPS proof. Actual one-record005 segment store, fixed actualRide metadata, no069 recorder/training/fullfleet dispatcher. Whole-tick cost includes fixture assertions/projection/stage clocks; OFF has no recorded samples. No driving pose/velocity writes.',
};
await mkdir(folder + '/worlds', { recursive: false });
async function startWorld(descriptor) {
  const start = {
    id: worldId(descriptor),
    sourceHash: report.sourceHash,
    startedAt: new Date().toISOString(),
    descriptor,
  };
  await writeFile(
    folder + '/worlds/' + start.id + '.started.json',
    JSON.stringify(start, null, 2),
    { flag: 'wx' },
  );
  return start;
}
function distribution(values) {
  const v = [...values].sort((a, b) => a - b);
  return {
    p50: v[Math.floor((v.length - 1) * 0.5)],
    p95: v[Math.floor((v.length - 1) * 0.95)],
    p99: v[Math.floor((v.length - 1) * 0.99)],
  };
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const states = (world, ids) => clone(ids.map((id) => world.project(id.entityId)));
const physicalHash = (world, ids) => hash(JSON.stringify(states(world, ids)));
const authorityTime = (tick) => ({
  ...CONTROLLER_CONTEXT,
  version: '066-control-authority-v1',
  tick,
  dtSeconds: 1 / 60,
});
const modeTime = (tick) => ({
  ...CONTROLLER_CONTEXT,
  version: '067-mode-controls-v1',
  tick,
  dtSeconds: 1 / 60,
});
function ride(identity, kind) {
  return kind === 'TAXI'
    ? parseRide({
        ...CONTROLLER_CONTEXT,
        rideId: 'ride-' + identity.entityId,
        taxiId: identity.entityId,
        pickupId: 'pickup',
        dropoffId: 'dropoff',
        routeLaneIds: ['fixture-authored-lane'],
        eventIds: [],
        status: 'TO_DROPOFF',
        createdTick: 0,
        assignedTick: 0,
        completedTick: null,
        failureReason: null,
      })
    : null;
}
const cameraPreferences = { mode: 'CHASE', fovDegrees: 75, motion: 50, distanceM: 6 };
function cameraTarget(world, identity) {
  const state = world.project(identity.entityId);
  return {
    entityId: identity.entityId,
    incarnation: String(identity.generation),
    transform: { positionM: state.position, rotationQuaternion: state.rotation },
    speedMps: state.speed,
    driverEyeM: { x: 0, y: 1, z: 0.2 },
  };
}
const selectionTime = (tick) => ({
  ...CONTROLLER_CONTEXT,
  version: '068-vehicle-selection-v1',
  tick,
  dtSeconds: 1 / 60,
});
function selectionBridge({
  world,
  ids,
  owner,
  modes,
  segments,
  camera,
  resources,
  assignments,
  targetKind = 'TAXI',
  resourceName = 'selection',
}) {
  const presentation = new Map(
    ids.map((id, i) => [
      id,
      { identity: id, kind: i === 1 ? targetKind : 'TAXI', visible: true, selectable: true },
    ]),
  );
  let closeOverride = null;
  const selection = createVehicleSelection(CONTROLLER_CONTEXT, {
    readAuthority: () => owner.getStats(),
    bodyIdentity: (id) => world.bodyIdentity(id),
    readPresentation: (id) => presentation.get(id),
    readCameraTarget: () =>
      camera.selectedEntityId === null ? null : world.bodyIdentity(camera.selectedEntityId),
    selectCamera: (id) => camera.select(id.entityId),
    clearInput: () => {
      modes?.clear();
    }, //067 only;025 remains existing066 postaccepted callback.
    readAssignment: (id) => {
      const i = ids.indexOf(id);
      assert(i >= 0);
      return {
        context: CONTROLLER_CONTEXT,
        identity: id,
        routeFingerprint: hash(
          JSON.stringify(assignments[i]?.routeLaneIds ?? ['fixture-authored-lane']),
        ),
        tripFingerprint: assignments[i] === null ? null : hash(JSON.stringify(assignments[i])),
      };
    },
    readBoundary: () => {
      const b = segments.read();
      if (!b) return null;
      return {
        context: CONTROLLER_CONTEXT,
        identity: b.identity,
        segmentId: b.segment.segmentId,
        mode: b.segment.controlMode,
        startTick: b.segment.startTick,
        endTick: b.segment.endTick,
        completeness: b.segment.completeness,
        closeReason: b.segment.closeReason,
      };
    },
    closeBoundary: (event) => {
      if (closeOverride) closeOverride(event);
      else segments.close(event.identity, event.tick);
    },
  });
  resources.own(
    resourceName,
    () => selection.dispose(),
    () => selection.getStats(),
  );
  for (const [id, p] of presentation) selection.register(id, p.kind);
  return {
    selection,
    presentation,
    overrideClose: (fn) => {
      closeOverride = fn;
    },
  };
}
function assertSelectionDisposed(s) {
  assert.equal(s.vehicles, 0);
  assert.equal(s.pending, 0);
  assert.equal(s.inFlight, 0);
  assert.equal(s.projection, null);
  assert.equal(s.conflict, false);
  assert.equal(s.disposed, true);
  assert.equal(s.retainedHistory, 0);
}
async function fixture(count, classId, resources) {
  if (report.firstWorldAt === null) {
    report.firstWorldAt = new Date().toISOString();
    await writeFile(
      folder + '/after-first-world.json',
      JSON.stringify(
        {
          firstWorldAt: report.firstWorldAt,
          sourceHash: report.sourceHash,
          nativeSha256: nativeArtifact.sha256,
        },
        null,
        2,
      ),
      { flag: 'wx' },
    );
  }
  const raw = await createRapierProbe();
  const { world, guard, finishNativeDigest } = acquireGuardedReferenceWorld(raw, resources);
  const inputs = new Map();
  if (classId) {
    for (let i = 0; i < count; i++)
      world.addClassCar('car-' + i, { x: i * 8, y: 0.8, z: 0 }, classId);
  } else {
    // Byte-independent fixture setup copied from published manyContacts;geometry/commands unchanged.
    for (let i = 0; i < count; i++) {
      const id = 'car-' + i;
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
  }
  return { world, inputs, guard, finishNativeDigest };
}
async function run(
  count,
  pair,
  observer,
  { classId = null, fixedMode = null, targetKind = 'TAXI' } = {},
) {
  const resources = createReferenceResourceScope();
  let result = null,
    primary = null,
    activeGuard = null;
  const descriptor = { count, pair, observer, classId, fixedMode, targetKind };
  const start = await startWorld(descriptor);
  const progress = {
    attemptedTick: 0,
    acceptedTick: 0,
    sampleCount: 0,
    checkpoints: [],
    selectionTrace: [],
    lifecycle: [],
    rawTimings: null,
  };
  let tickSamples = null,
    authoritySamples = null,
    selectionSamples = null,
    ownSamples = null,
    finishDigest = null;
  try {
    const f = await fixture(count, classId, resources),
      world = f.world;
    activeGuard = f.guard;
    finishDigest = f.finishNativeDigest;
    const ids = Array.from({ length: count }, (_, i) => world.bodyIdentity('car-' + i));
    assert(ids.every(Boolean));
    let drivingPoseWrites = 0,
      drivingVelocityWrites = 0;
    const controller = createVehicleController(CONTROLLER_CONTEXT, {
      ...world,
      setPose(...args) {
        drivingPoseWrites++;
        return world.setPose(...args);
      },
      setBodyVelocity(...args) {
        drivingVelocityWrites++;
        return world.setBodyVelocity(...args);
      },
    });
    resources.own(
      'controller',
      () => controller.dispose(),
      () => controller.getStats(),
    );
    let oldFilterClears = 0;
    const keyboard = createKeyboardFilter(
      CONTROLLER_CONTEXT,
      ids[0].entityId,
      createDefaultSettings('068-reference').input.control,
      0,
    );
    resources.own(
      'keyboard',
      () => keyboard.dispose(),
      () => keyboard.getStats(),
    );
    const owner = createControlAuthority(CONTROLLER_CONTEXT, controller, {
      bodyIdentity: (id) => world.bodyIdentity(id),
      clearOldPlayer(identity) {
        assert.equal(identity, ids[0]);
        keyboard.clear();
        oldFilterClears++;
      },
    });
    resources.own(
      'authority',
      () => owner.dispose(),
      () => owner.getStats(),
    );
    for (const identity of ids) owner.register(identity);
    let selected = ids[0];
    const modes = createModeControls(CONTROLLER_CONTEXT, {
      readAuthority: () => owner.getStats(),
      selectedIdentity: () => selected,
      bodyIdentity: (id) => world.bodyIdentity(id),
    });
    resources.own(
      'mode',
      () => modes.dispose(),
      () => modes.getStats(),
    );
    const segments = createFixtureSegmentStore(CONTROLLER_CONTEXT);
    resources.own(
      'segment',
      () => segments.dispose(),
      () => segments.getStats(),
    );
    const camera = new VehicleCameraController(cameraPreferences);
    resources.own(
      'cameraTarget',
      () => camera.select(null),
      () => camera.selectedEntityId,
    );
    camera.select(selected.entityId);
    let assignments = ids.map((identity, i) => ride(identity, i === 1 ? targetKind : 'TAXI'));
    resources.own(
      'assignments',
      () => {
        assignments = [];
      },
      () => assignments.length,
    );
    const assignmentDigest = hash(JSON.stringify(assignments));
    const bridge = selectionBridge({
      world,
      ids,
      owner,
      modes,
      segments,
      camera,
      resources,
      assignments,
      targetKind,
    });
    const selection = bridge.selection;
    const lifecycle = progress.lifecycle;
    const mechanicalFields = (m) => ({
      classId: m.classId,
      version: m.version,
      massKg: m.massKg,
      powerW: m.powerW,
      grip: m.grip,
      brakeAccelerationMps2: m.brakeAccelerationMps2,
      wheels: m.wheels,
      turningRadiusM: m.turningRadiusM,
    });
    const initialMechanics = ids.map((id) => clone(world.readVehicleMechanics(id.entityId)));
    const immutableMechanics = initialMechanics.map(mechanicalFields);
    const decision = createHash('sha256'),
      raw = createHash('sha256'),
      packetDigest = createHash('sha256'),
      selectionDigest = createHash('sha256');
    const checks = progress.checkpoints,
      selectionTrace = progress.selectionTrace,
      modeCounts = { AUTO: 0, MANUAL: 0, LEARNING: 0 };
    ((tickSamples = new Float64Array(observer ? 600 : 0)),
      (authoritySamples = new Float64Array(observer ? 600 : 0)),
      (selectionSamples = new Float64Array(observer ? 600 : 0)),
      (ownSamples = new Float64Array(observer ? 600 : 0)));
    let maxSpeedMps = 0;
    f.guard.phase = 'DRIVING';
    let maxPlayers = 0,
      selections = 0,
      cameraUpdates = 0,
      explicitClaims = 0,
      maxDisplacementM = 0;
    let previousPositions = ids.map((id) => clone(world.project(id.entityId).position));
    for (let tick = 1; tick <= 780; tick++) {
      progress.attemptedTick = tick;
      const begin = observer ? performance.now() : 0,
        phase = referenceSelectionPhase(tick, fixedMode ?? undefined);
      const actionBegin = observer ? performance.now() : 0;
      let ticket = null,
        requests = [],
        departed = null,
        selectionTicket = null,
        ownCost = 0;
      if (phase.claim && phase.mode !== 'AUTO') {
        assert.equal(selected, ids[0]);
        assert.equal(owner.getStats().seat, null);
        assert(modes.enqueue(phase.mode === 'MANUAL' ? 'M' : 'L'));
        ticket = modes.prepare(modeTime(tick));
        requests = ticket.requests;
        explicitClaims++;
      }
      if (phase.depart || phase.returnCamera) {
        const target = phase.depart ? ids[1] : ids[0];
        const source = phase.depart && targetKind !== 'CIVIL' ? phase.source : 'WORLD';
        const ownBegin = observer ? performance.now() : 0;
        assert(selection.enqueue(target, source));
        selectionTicket = selection.prepare(selectionTime(tick));
        assert(selectionTicket);
        requests = selectionTicket.requests;
        departed = owner.getStats().seat;
        if (observer) ownCost += performance.now() - ownBegin;
      }
      const actionCost = observer ? performance.now() - actionBegin : 0;
      keyboard.setAction('throttle', tick % 120 < 80);
      keyboard.setAction('brake', tick % 120 >= 100);
      keyboard.setAction('steerRight', tick % 120 >= 30 && tick % 120 < 60);
      keyboard.setAction('steerLeft', tick % 120 >= 60 && tick % 120 < 90);
      const body = world.readBody(ids[0]),
        filtered = keyboard.step({
          tick,
          dtSeconds: 1 / 60,
          speedMps: Math.hypot(body.velocityMps.x, body.velocityMps.y, body.velocityMps.z),
        });
      raw.update(JSON.stringify(filtered.raw));
      const packets = [];
      for (const identity of ids) {
        const values = classId
          ? {
              throttle: filtered.command.throttle,
              brake: filtered.command.brake,
              steering: filtered.command.steering,
              handbrake: filtered.command.handbrake,
            }
          : (f.inputs.get(identity.entityId) ?? { throttle: 0.35, brake: 0, steering: 0.02 });
        packets.push({
          identity,
          command: controllerCommand(identity.entityId, tick, 'AUTONOMY', values),
        });
        packets.push({
          identity,
          command: controllerCommand(identity.entityId, tick, 'PLAYER', values),
        });
      }
      packetDigest.update(JSON.stringify(packets));
      const stepBegin = observer ? performance.now() : 0,
        result = owner.step(authorityTime(tick), packets, requests).frame;
      progress.acceptedTick = tick;
      const stepCost = observer ? performance.now() - stepBegin : 0,
        settleBegin = observer ? performance.now() : 0;
      const selectedTransition = phase.depart || phase.returnCamera;
      const settlementEvent = selectedTransition || ticket !== null;
      const selectionSerial = settlementEvent ? world.collisionStepSerial() : null;
      const selectionBefore = settlementEvent ? bodySnapshot(world, ids) : null;
      if (settlementEvent) f.guard.phase = 'SELECTION_SETTLEMENT';
      if (ticket) {
        assert.equal(modes.settle(ticket), 'ACCEPTED');
        const seat = owner.getStats().seat;
        assert(seat);
        segments.open(seat.identity, seat.mode, tick);
      }
      if (selectionTicket) {
        const ownBegin = observer ? performance.now() : 0;
        assert.equal(selection.settle(selectionTicket), 'ACCEPTED');
        if (observer) ownCost += performance.now() - ownBegin;
        selected = world.bodyIdentity(camera.selectedEntityId);
        selections++;
        assert.equal(selected, phase.depart ? ids[1] : ids[0]);
        assert.equal(owner.getStats().seat, null);
        if (phase.depart)
          assert.equal(result.controls.find((c) => c.identity === selected).mode, 'AUTO');
        if (departed) {
          const b = segments.read();
          assert.equal(b.identity, departed.identity);
          assert.equal(b.segment.completeness, 'CLOSED');
          assert.equal(b.segment.endTick, tick);
          assert.equal(b.segment.closeReason, 'VEHICLE_SWITCH');
        }
      }
      const pose = camera.update(cameraTarget(world, selected), 1 / 60);
      assert(pose);
      assert.equal(pose.entityId, selected.entityId);
      cameraUpdates++;
      if (settlementEvent) {
        const after = sameNativeSnapshot(world, ids, selectionBefore, selectionSerial);
        const proof = {
          tick,
          nativeStepSerial: selectionSerial,
          bodies: ids.length,
          beforeHash: hash(JSON.stringify(selectionBefore.map((v) => v.body))),
          afterHash: hash(JSON.stringify(after.map((v) => v.body))),
          selected: selected.entityId,
        };
        if (selectedTransition) f.guard.selectionProofs.push(proof);
        else f.guard.modeSettlementProofs.push(proof);
        assert(f.guard.modeSettlementProofs.length <= 13, 'Mode settlement proof cap');
        assert(f.guard.selectionProofs.length <= 26, 'Selection proof cap');
        f.guard.phase = 'DRIVING';
      }
      if (phase.depart || phase.returnCamera)
        assert.equal(hash(JSON.stringify(assignments)), assignmentDigest);
      for (const [i, id] of ids.entries()) {
        const native = world.project(id.entityId);
        assert(
          [
            ...Object.values(native.position),
            ...Object.values(native.velocity),
            ...Object.values(native.rotation),
            native.speed,
          ].every(Number.isFinite),
          'Nonfinite native state',
        );
        maxSpeedMps = Math.max(maxSpeedMps, native.speed);
        const position = native.position;
        const prior = previousPositions[i];
        const d = Math.hypot(position.x - prior.x, position.y - prior.y, position.z - prior.z);
        assert(Number.isFinite(d), 'Nonfinite native displacement');
        maxDisplacementM = Math.max(maxDisplacementM, d);
        previousPositions[i] = clone(position);
      }
      const observeBegin = observer ? performance.now() : 0;
      const selectionView = selection.observe();
      if (observer) ownCost += performance.now() - observeBegin;
      assert.equal(selectionView.tick, tick);
      assert.equal(selectionView.selectedIdentity, selected);
      const s = owner.getStats(),
        view = modes.observe();
      assert.equal(view.tick, tick);
      assert.equal(view.identity, s.seat?.identity ?? selected);
      maxPlayers = Math.max(maxPlayers, s.players);
      assert(s.players <= 1);
      modeCounts[s.seat?.mode ?? 'AUTO']++;
      for (const control of result.controls)
        decision.update(
          JSON.stringify({
            vehicleId: control.command.vehicleId,
            tick: control.command.tick,
            throttle: control.command.throttle,
            brake: control.command.brake,
            steering: control.command.steering,
            handbrake: control.command.handbrake,
          }),
        );
      const projection = {
        tick,
        selected: selected.entityId,
        seat: s.seat ? { vehicleId: s.seat.identity.entityId, mode: s.seat.mode } : null,
        boundary: segments.read()
          ? {
              vehicleId: segments.read().identity.entityId,
              mode: segments.read().segment.controlMode,
              endTick: segments.read().segment.endTick,
              completeness: segments.read().segment.completeness,
            }
          : null,
        assignmentDigest,
      };
      selectionDigest.update(JSON.stringify(projection));
      if (phase.depart || phase.returnCamera) selectionTrace.push(projection);
      assert(selectionTrace.length <= 26);
      if (tick % 60 === 0) checks.push({ tick, physical: states(world, ids), camera: clone(pose) });
      if (observer && tick > 180) {
        tickSamples[tick - 181] = performance.now() - begin;
        authoritySamples[tick - 181] = stepCost;
        selectionSamples[tick - 181] = actionCost + performance.now() - settleBegin;
        ownSamples[tick - 181] = ownCost;
        progress.sampleCount = tick - 180;
      }
    }
    f.finishNativeDigest();
    //Actual live-owner snapshots BEFORE extra lifecycle work and before any disposal.
    const ownedDuringDriving = clone({
      controller: controller.getStats(),
      authority: owner.getStats(),
      mode: modes.getStats(),
      keyboard: keyboard.getStats(),
      segment: segments.getStats(),
      assignments: assignments.length,
      body: world.bodyResources(),
      collision: world.collisionResources(),
      selection: selection.getStats(),
    });
    //Twenty new owner lifecycles against actual existing identities; no native step, body creation or physics mutation.
    for (let cycle = 0; cycle < 20; cycle++) {
      const scope = createReferenceResourceScope();
      let primary = null,
        liveRegistered = null,
        livePrepared = null;
      try {
        const candidate = selectionBridge({
          world,
          ids,
          owner,
          modes,
          segments,
          camera,
          resources: scope,
          assignments,
          targetKind,
        }).selection;
        liveRegistered = clone(candidate.getStats());
        assert.equal(candidate.getStats().vehicles, count);
        assert(candidate.enqueue(ids[1], targetKind === 'CIVIL' ? 'WORLD' : 'FLEET'));
        assert(candidate.prepare(selectionTime(781)));
        livePrepared = clone(candidate.getStats());
      } catch (error) {
        primary = error;
      }
      const cleanup = scope.close();
      lifecycle.push({ cycle, liveRegistered, livePrepared, cleanup });
      if (primary || cleanup.errors.length)
        throw new AggregateError(
          [...(primary ? [primary] : []), ...cleanup.errors.map((e) => Error(e.message))],
          'AFTER selection lifecycle failed',
        );
      assertSelectionDisposed(cleanup.snapshots.selection);
    }
    const finalMechanics = ids.map((id) => clone(world.readVehicleMechanics(id.entityId)));
    assert.deepEqual(finalMechanics.map(mechanicalFields), immutableMechanics);
    assert.equal(hash(JSON.stringify(assignments)), assignmentDigest);
    result = {
      initialMechanics,
      finalMechanics,
      count,
      pair,
      observer,
      classId,
      fixedMode,
      targetKind,
      warmupTicks: 180,
      measuredTicks: 600,
      physicalTicks: 780,
      sampleBytes:
        tickSamples.byteLength +
        authoritySamples.byteLength +
        selectionSamples.byteLength +
        ownSamples.byteLength,
      rawTimings: observer
        ? {
            tickMs: [...tickSamples],
            authorityMs: [...authoritySamples],
            referenceSelectionMs: [...selectionSamples],
            vehicleSelectionMs: [...ownSamples],
          }
        : null,
      tickMs: observer ? distribution(tickSamples) : null,
      existingAuthorityMs: observer ? distribution(authoritySamples) : null,
      referenceSelectionMs: observer ? distribution(selectionSamples) : null,
      vehicleSelectionMs: observer ? distribution(ownSamples) : null,
      lifecycle,
      ownedDuringDriving,
      decisionDigest: decision.digest('hex'),
      rawPlayerDigest: raw.digest('hex'),
      packetDigest: packetDigest.digest('hex'),
      selectionDigest: selectionDigest.digest('hex'),
      assignmentDigest,
      finalPhysicalHash: physicalHash(world, ids),
      checkpoints: checks,
      selectionTrace,
      modeCounts,
      maximumPlayers: maxPlayers,
      selections,
      cameraUpdates,
      explicitClaims,
      oldFilterClears,
      maxDisplacementM,
      maxSpeedMps,
      mutationGuard: clone(f.guard),
      drivingPoseWrites,
      drivingVelocityWrites,
      owned: {
        controller: controller.getStats(),
        authority: owner.getStats(),
        mode: modes.getStats(),
        keyboard: keyboard.getStats(),
        segment: segments.getStats(),
        assignments: assignments.length,
        selection: selection.getStats(),
        body: world.bodyResources(),
        collision: world.collisionResources(),
      },
      cleanup: null,
    };
    for (const value of Object.values(f.guard.drivingCalls)) assert.equal(value, 0);
    assert.equal(f.guard.selectionStepAttempts, 0);
    assert.equal(f.guard.nativeSteps, 780);
    assert.equal(f.guard.selectionProofs.length, 26);
    assert.equal(drivingPoseWrites, 0);
    assert.equal(drivingVelocityWrites, 0);
  } catch (error) {
    primary = error;
  }
  const cleanup = resources.close();
  if (result)
    result.cleanup = { ...cleanup.snapshots, errors: cleanup.errors, attempts: cleanup.attempts };
  try {
    if (!primary && cleanup.errors.length === 0) {
      assert(result);
      assertCleanup(result.cleanup);
    }
  } catch (error) {
    primary = error;
  }
  const causes = [
    ...(primary ? [primary] : []),
    ...cleanup.errors.map((e) => Error(e.resource + ': ' + e.message)),
  ];
  let partial = null;
  if (causes.length) {
    try {
      finishDigest?.();
    } catch (error) {
      causes.push(error);
    }
    progress.rawTimings =
      observer && tickSamples
        ? {
            tickMs: [...tickSamples.slice(0, progress.sampleCount)],
            authorityMs: [...authoritySamples.slice(0, progress.sampleCount)],
            referenceSelectionMs: [...selectionSamples.slice(0, progress.sampleCount)],
            vehicleSelectionMs: [...ownSamples.slice(0, progress.sampleCount)],
          }
        : null;
    partial = { ...progress, mutationGuard: activeGuard ? clone(activeGuard) : null };
    report.resourceFailures.push({
      world: descriptor,
      partial,
      primary: primary ? { message: String(primary.message), stack: String(primary.stack) } : null,
      cleanup,
    });
  }
  const receipt = await preserveWorldRecord({
    folder: folder + '/worlds',
    id: start.id,
    start,
    sourceHash: report.sourceHash,
    result,
    partial,
    cleanup: result?.cleanup ?? cleanup,
    causes,
  });
  report.worldRecords.push(receipt);
  assert(report.worldRecords.length <= 34);

  return result;
}
function assertCleanup(c) {
  assert.deepEqual(c.errors, []);
  for (const key of ['vehicles', 'targets', 'projections', 'players'])
    assert.equal(c.controller[key], 0);
  assert.equal(c.controller.disposed, true);
  assert.equal(c.controller.retainedBatches, 0);
  assert.equal(c.authority.vehicles, 0);
  assert.equal(c.authority.players, 0);
  assert.equal(c.authority.seat, null);
  assert.equal(c.authority.disposed, true);
  assert.equal(c.keyboard.heldKeys, 0);
  assert.equal(c.keyboard.retainedFrames, 0);
  assert.equal(c.keyboard.pendingPreferences, false);
  assert.equal(c.keyboard.disposed, true);
  assert.equal(c.body.entities, 0);
  assert.equal(c.body.subscriptions, 0);
  assert.equal(c.collision.colliders, 0);
  assert.equal(c.collision.vehicles, 0);
  assert.equal(c.collision.obstacles, 0);
  assert.equal(c.collision.disposed, true);
  assert.equal(c.segment.retainedSegments, 0);
  assert.equal(c.segment.disposed, true);
  if (c.selection) assertSelectionDisposed(c.selection);
  if (c.retiredAdmission) assertSelectionDisposed(c.retiredAdmission);
  if (c.mode) {
    assert.equal(c.mode.intents, 0);
    assert.equal(c.mode.inFlight, 0);
    assert.equal(c.mode.projection, null);
    assert.equal(c.mode.disposed, true);
  }
  if ('cameraTarget' in c) assert.equal(c.cameraTarget, null);
  if ('assignments' in c) assert.equal(c.assignments, 0);
}

async function guards(classId) {
  const resources = createReferenceResourceScope();
  const descriptor = { classId, guard: true },
    start = await startWorld(descriptor),
    trace = [];
  let result = null,
    primary = null,
    activeGuard = null,
    finishDigest = null;
  try {
    const f = await fixture(2, classId, resources),
      world = f.world,
      ids = [world.bodyIdentity('car-0'), world.bodyIdentity('car-1')];
    activeGuard = f.guard;
    finishDigest = f.finishNativeDigest;
    const controller = createVehicleController(CONTROLLER_CONTEXT, world);
    resources.own(
      'controller',
      () => controller.dispose(),
      () => controller.getStats(),
    );
    const keyboard = createKeyboardFilter(
      CONTROLLER_CONTEXT,
      ids[0].entityId,
      createDefaultSettings('068-guard').input.control,
      0,
    );
    resources.own(
      'keyboard',
      () => keyboard.dispose(),
      () => keyboard.getStats(),
    );
    const owner = createControlAuthority(CONTROLLER_CONTEXT, controller, {
      bodyIdentity: (id) => world.bodyIdentity(id),
    });
    resources.own(
      'authority',
      () => owner.dispose(),
      () => owner.getStats(),
    );
    const segments = createFixtureSegmentStore(CONTROLLER_CONTEXT);
    resources.own(
      'segment',
      () => segments.dispose(),
      () => segments.getStats(),
    );
    for (const id of ids) owner.register(id);
    const camera = new VehicleCameraController(cameraPreferences);
    resources.own(
      'cameraTarget',
      () => camera.select(null),
      () => camera.selectedEntityId,
    );
    camera.select(ids[0].entityId);
    const bridge = selectionBridge({
      world,
      ids,
      owner,
      modes: null,
      segments,
      camera,
      resources,
      assignments: ids.map((id) => ride(id, 'TAXI')),
    });
    const selection = bridge.selection;
    f.guard.phase = 'DRIVING';
    owner.step(authorityTime(1), [], [{ identity: ids[0], mode: 'MANUAL' }]);
    segments.open(ids[0], 'MANUAL', 1);
    const unchanged = physicalHash(world, ids);
    bridge.presentation.set(ids[1], {
      identity: ids[1],
      kind: 'TAXI',
      visible: false,
      selectable: true,
    });
    assert.equal(selection.enqueue(ids[1], 'WORLD'), false);
    assert.throws(() => selection.enqueue({ ...ids[1] }, 'WORLD'), /Stale/);
    selection.remove(ids[1]);
    selection.register(ids[1], 'CIVIL');
    bridge.presentation.set(ids[1], {
      identity: ids[1],
      kind: 'CIVIL',
      visible: true,
      selectable: true,
    });
    assert.equal(selection.enqueue(ids[1], 'FLEET'), false);
    selection.remove(ids[1]);
    selection.register(ids[1], 'TAXI');
    bridge.presentation.set(ids[1], {
      identity: ids[1],
      kind: 'TAXI',
      visible: true,
      selectable: true,
    });
    const boundary = segments.read();
    assert(boundary);
    assert.throws(() => segments.close(ids[1], 2), /boundary/);
    assert.equal(owner.getStats().tick, 1);
    assert.equal(physicalHash(world, ids), unchanged);
    owner.suspend();
    assert(selection.enqueue(ids[1], 'WORLD'));
    assert.equal(selection.prepare(selectionTime(2)), null);
    assert.throws(() => owner.step(authorityTime(2)), /suspended/);
    assert.equal(owner.getStats().tick, 1);
    assert.equal(segments.read(), boundary);
    assert.equal(physicalHash(world, ids), unchanged);
    owner.resume();
    const selectionTicket = selection.prepare(selectionTime(2));
    assert(selectionTicket);
    owner.step(authorityTime(2), [], selectionTicket.requests);
    const serial = world.collisionStepSerial(),
      before = bodySnapshot(world, ids);
    f.guard.phase = 'SELECTION_SETTLEMENT';
    assert.equal(selection.settle(selectionTicket), 'ACCEPTED');
    assert(camera.update(cameraTarget(world, ids[1]), 1 / 60));
    const after = sameNativeSnapshot(world, ids, before, serial);
    f.guard.selectionProofs.push({
      tick: 2,
      nativeStepSerial: serial,
      bodies: 2,
      beforeHash: hash(JSON.stringify(before.map((v) => v.body))),
      afterHash: hash(JSON.stringify(after.map((v) => v.body))),
      selected: 'car-1',
    });
    f.guard.phase = 'DRIVING';
    assert.equal(owner.getStats().seat, null);
    assert.equal(segments.read().segment.endTick, 2);
    trace.push({ tick: 2, seat: null, closure: 'CLOSED', pausedPhysicalTicks: 0 });
    owner.step(authorityTime(3), [], [{ identity: ids[0], mode: 'LEARNING' }]);
    segments.open(ids[0], 'LEARNING', 3);
    bridge.overrideClose(() => segments.close(ids[1], 4));
    assert(selection.enqueue(ids[1], 'WORLD'));
    const faultTicket = selection.prepare(selectionTime(4));
    assert(faultTicket);
    owner.step(authorityTime(4), [], faultTicket.requests);
    assert.equal(selection.settle(faultTicket), 'FAULT');
    assert.equal(selection.observe().tick, 4);
    assert.equal(selection.observe().seat, null);
    assert.equal(owner.getStats().tick, 4);
    assert.equal(owner.getStats().seat, null);
    assert.equal(segments.read().segment.completeness, 'OPEN');
    trace.push({
      tick: 4,
      seat: null,
      closure: 'OPEN',
      terminalHostFault: 'SEGMENT_CLOSE_AFTER_PHYSICAL_ACCEPTANCE',
    });
    const old = ids[1];
    f.guard.phase = 'SETUP';
    f.guard.setupLabel = 'RETIRED_GENERATION_PROBE_AFTER_HOST_FAULT';
    world.removeBody(old);
    world.addClassCar(old.entityId, { x: 8, y: 0.8, z: 0 }, classId);
    const replacement = world.bodyIdentity(old.entityId);
    assert.notEqual(replacement, old);
    //Independent live admission owner, no reset of the faulted owner and no physical step.
    const retiredProbe = selectionBridge({
      world,
      ids: [ids[0], replacement],
      owner,
      modes: null,
      segments,
      camera,
      resources,
      assignments: [ride(ids[0], 'TAXI'), ride(replacement, 'TAXI')],
      resourceName: 'retiredAdmission',
    }).selection;
    assert.throws(() => retiredProbe.enqueue(old, 'WORLD'), /Stale\/unregistered/);
    assert.equal(owner.getStats().tick, 4);
    assert.equal(f.guard.nativeSteps, 4);
    f.finishNativeDigest();
    result = {
      classId,
      mutationGuard: clone(f.guard),
      hiddenRejected: true,
      civilFleetRejected: true,
      retiredGenerationRejected: true,
      retiredGenerationEvidence: {
        owner: 'actual068-independent-admission-owner',
        currentGeneration: replacement.generation,
        retiredGeneration: old.generation,
        authorityTick: 4,
        nativeSteps: 4,
      },
      boundaryMismatchBeforePhysicsRejected: true,
      pausedPhysicalTicks: 0,
      acceptedReleaseBeforeClosureFault: true,
      faultScope:
        'Actual068 terminal selection owner after accepted066 release; injected real store mismatch',
      trace,
      finalPhysicalHash: physicalHash(world, [ids[0], replacement]),
      drivingPoseWrites: 0,
      drivingVelocityWrites: 0,
      cleanup: null,
    };
  } catch (error) {
    primary = error;
  }
  const cleanup = resources.close();
  if (result)
    result.cleanup = { ...cleanup.snapshots, errors: cleanup.errors, attempts: cleanup.attempts };
  try {
    if (!primary && cleanup.errors.length === 0) {
      assert(result);
      assertCleanup(result.cleanup);
    }
  } catch (error) {
    primary = error;
  }
  const causes = [
    ...(primary ? [primary] : []),
    ...cleanup.errors.map((e) => Error(e.resource + ': ' + e.message)),
  ];
  let partial = null;
  if (causes.length) {
    try {
      finishDigest?.();
    } catch (error) {
      causes.push(error);
    }
    partial = { trace, mutationGuard: activeGuard ? clone(activeGuard) : null };
    report.resourceFailures.push({
      world: descriptor,
      partial,
      primary: primary ? { message: String(primary.message), stack: String(primary.stack) } : null,
      cleanup,
    });
  }
  const receipt = await preserveWorldRecord({
    folder: folder + '/worlds',
    id: start.id,
    start,
    sourceHash: report.sourceHash,
    result,
    partial,
    cleanup: result?.cleanup ?? cleanup,
    causes,
  });
  report.worldRecords.push(receipt);
  assert(report.worldRecords.length <= 34);

  return result;
}

let captureError = null;
try {
  for (const count of [70, 110]) {
    for (let pair = 0; pair < 5; pair++)
      for (const observer of pair % 2 ? [true, false] : [false, true]) {
        const r = await run(count, pair, observer);
        report.runs.push(r);
        console.log(JSON.stringify({ count, pair, observer, p95: r.tickMs?.p95 }));
      }
    const group = report.runs.filter((r) => r.count === count);
    for (const r of group) {
      for (const key of [
        'decisionDigest',
        'rawPlayerDigest',
        'packetDigest',
        'selectionDigest',
        'assignmentDigest',
        'finalPhysicalHash',
      ])
        assert.equal(r[key], group[0][key]);
      assert.equal(r.mutationGuard.nativeInputDigest, group[0].mutationGuard.nativeInputDigest);
      assert.deepEqual(r.mutationGuard.selectionProofs, group[0].mutationGuard.selectionProofs);
      assert.deepEqual(r.checkpoints, group[0].checkpoints);
      assert.deepEqual(r.selectionTrace, group[0].selectionTrace);
    }
  }
  for (const classId of ['sedan', 'compact']) {
    for (const targetKind of ['TAXI', 'CIVIL'])
      for (const fixedMode of ['AUTO', 'MANUAL', 'LEARNING'])
        report.scenarios.push(await run(2, 0, false, { classId, targetKind, fixedMode }));
    report.guards.push(await guards(classId));
  }
  assert.equal(report.runs.length + report.scenarios.length + report.guards.length, 34);
  for (const r of report.runs)
    for (const mode of ['AUTO', 'MANUAL', 'LEARNING']) assert(r.modeCounts[mode] > 0);
  assert(
    report.runs.filter((r) => r.count === 70 && r.observer).every((r) => r.tickMs.p95 <= 5.5),
    'Normal70 unchanged5.5ms cap',
  );
  for (const input of inputs) {
    assert.equal(hash(await readFile(input.path)), input.sha256);
    assert.equal(hash(await readFile(archive + '/' + input.path)), input.sha256);
  }
  assert.equal(hash(await readFile(nativePath)), nativeArtifact.sha256);
  assert.equal(hash(await readFile(folder + '/' + nativeRelative)), nativeArtifact.sha256);
  assert.equal(await exists('src/input/vehicle-selection.ts'), true);
  const parityKeys = [
    'decisionDigest',
    'rawPlayerDigest',
    'packetDigest',
    'selectionDigest',
    'assignmentDigest',
    'finalPhysicalHash',
    'checkpoints',
    'selectionTrace',
    'modeCounts',
    'maximumPlayers',
    'selections',
    'cameraUpdates',
    'explicitClaims',
    'oldFilterClears',
    'maxDisplacementM',
    'maxSpeedMps',
    'initialMechanics',
    'finalMechanics',
    'drivingPoseWrites',
    'drivingVelocityWrites',
  ];
  for (const category of ['runs', 'scenarios']) {
    assert.equal(report[category].length, baseline[category].length);
    for (let i = 0; i < report[category].length; i++) {
      const a = report[category][i],
        b = baseline[category][i];
      for (const key of [
        'count',
        'pair',
        'observer',
        'classId',
        'fixedMode',
        'targetKind',
        ...parityKeys,
      ])
        assert.deepEqual(a[key], b[key], category + '/' + i + '/' + key);
      assert.deepEqual(a.mutationGuard, b.mutationGuard, category + '/' + i + '/native-guard');
      assert.equal(a.lifecycle.length, 20);
    }
  }
  for (let i = 0; i < 2; i++)
    for (const key of [
      'classId',
      'mutationGuard',
      'hiddenRejected',
      'civilFleetRejected',
      'retiredGenerationRejected',
      'boundaryMismatchBeforePhysicsRejected',
      'pausedPhysicalTicks',
      'acceptedReleaseBeforeClosureFault',
      'trace',
      'finalPhysicalHash',
      'drivingPoseWrites',
      'drivingVelocityWrites',
    ])
      assert.deepEqual(report.guards[i][key], baseline.guards[i][key], 'guard/' + i + '/' + key);
  report.relativeGate = [];
  for (const count of [70, 110]) {
    const pairs = [];
    for (let pair = 0; pair < 5; pair++) {
      const a = report.runs.find((r) => r.count === count && r.pair === pair && r.observer);
      const b = baseline.runs.find((r) => r.count === count && r.pair === pair && r.observer);
      const deltaMs = a.tickMs.p95 - b.tickMs.p95;
      pairs.push({
        pair,
        beforeP95: b.tickMs.p95,
        afterP95: a.tickMs.p95,
        deltaMs,
        ratio: a.tickMs.p95 / b.tickMs.p95,
        regression: deltaMs > 1 && a.tickMs.p95 > b.tickMs.p95 * 1.1,
      });
    }
    const failures = pairs.filter((p) => p.regression).length;
    report.relativeGate.push({ count, pairs, failures });
    assert(failures < 3, 'Relative >10%AND>1ms in>=3/5 blocks ' + count);
  }
  await verifyWorldInventory({
    folder: folder + '/worlds',
    sourceHash: report.sourceHash,
    worlds: [
      ...report.runs.map((result) => ({ descriptor: result, result })),
      ...report.scenarios.map((result) => ({ descriptor: result, result })),
      ...report.guards.map((result) => ({
        descriptor: { guard: true, classId: result.classId },
        result,
      })),
    ],
  });
  report.status = 'PASS';
} catch (error) {
  captureError = error;
  report.status = 'FAIL';
  report.failure = {
    message: String(error.message),
    stack: String(error.stack),
    causes:
      error.errors?.map((e) => ({ message: String(e.message), stack: String(e.stack) })) ?? [],
  };
}
// End-source/native guards also run after a failed world; original cause stays first.
report.endGuards = { status: 'PENDING', checkedAt: null, inputs: 0, native: false };
try {
  for (const input of inputs) {
    assert.equal(hash(await readFile(input.path)), input.sha256);
    assert.equal(hash(await readFile(archive + '/' + input.path)), input.sha256);
    report.endGuards.inputs++;
  }
  assert.equal(hash(await readFile(nativePath)), nativeArtifact.sha256);
  assert.equal(hash(await readFile(folder + '/' + nativeRelative)), nativeArtifact.sha256);
  report.endGuards.native = true;
  report.endGuards.status = 'PASS';
} catch (error) {
  captureError = new AggregateError(
    [...(captureError ? [captureError] : []), error],
    'Capture/end-source guards failed; original causes preserved',
  );
  report.status = 'FAIL';
  report.endGuards.status = 'FAIL';
  report.endGuards.error = String(error);
}
report.endGuards.checkedAt = new Date().toISOString();
report.capturedAt = new Date().toISOString();
let exportError = null;
try {
  await writeFile(output, JSON.stringify(report, null, 2), { flag: 'wx' });
} catch (error) {
  exportError = error;
}
// Bounded original/export/terminal ledger; disk failure never implies a saved record.
const terminal = {
  startedAt,
  firstWorldAt: report.firstWorldAt,
  capturedAt: report.capturedAt,
  reportSha256: exportError === null ? hash(Buffer.from(JSON.stringify(report, null, 2))) : null,
  status: exportError || captureError ? 'FAIL' : report.status,
  reportSaved: exportError === null,
  sourceHash: report.sourceHash,
  runs: report.runs.length,
  scenarios: report.scenarios.length,
  guards: report.guards.length,
  errors: [
    ...(captureError ? [{ stage: 'CAPTURE', message: String(captureError.message) }] : []),
    ...(exportError ? [{ stage: 'REPORT_EXPORT', message: String(exportError.message) }] : []),
  ],
};
try {
  console.log(JSON.stringify(terminal));
} catch {
  /* Best-effort log must not replace capture/export errors. */
}
let terminalError = null;
try {
  await writeFile(folder + '/after-terminal.json', JSON.stringify(terminal, null, 2), {
    flag: 'wx',
  });
} catch (error) {
  terminalError = error;
}
const finalCauses = [captureError, exportError, terminalError].filter(Boolean);
if (finalCauses.length)
  throw new AggregateError(
    finalCauses,
    'Capture/export/terminal failed; all original causes preserved',
  );
