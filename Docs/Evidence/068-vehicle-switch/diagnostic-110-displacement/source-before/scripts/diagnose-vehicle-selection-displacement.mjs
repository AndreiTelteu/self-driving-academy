// DIAGNOSTIC COPY only: first110 pair0 OFF, unchanged original0.7 assertion; expected FAIL, never baseline acceptance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createControlAuthority } from '../src/input/control-authority.ts';
import { createModeControls } from '../src/input/mode-controls.ts';
import { createVehicleController } from '../src/vehicles/controller.ts';
import { createKeyboardFilter } from '../src/vehicles/keyboard-filter.ts';
import { createDefaultSettings } from '../src/settings/store.ts';
import { createRapierProbe } from '../src/vehicles/rapier/index.ts';
import { VehicleCameraController } from '../src/rendering/vehicle-camera.ts';
import { parseRide } from '../src/fleet/contracts.ts';
import { CONTROLLER_CONTEXT, controllerCommand } from '../tests/vehicles/controller-reference.ts';
import {
  SELECTION_REFERENCE,
  referenceSelectionPhase,
  referenceSelectionAdmission,
  createFixtureSegmentStore,
  createReferenceResourceScope,
} from '../tests/input/vehicle-selection-reference.ts';

const expectedRoot = 'F:/Sites/self-driving-academy/.worktrees/vehicle-switch-01';
assert.equal(resolve('.').replaceAll('\\', '/'), expectedRoot);
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/vehicle-switch-01',
);
const folder = 'Docs/Evidence/068-vehicle-switch/diagnostic-110-displacement',
  output = folder + '/diagnostic.json',
  archive = folder + '/source-before';
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
assert.equal(await exists(output), false, 'Immutable BEFORE exists');
assert.equal(await exists(archive), false, 'Immutable archive exists');
assert.equal(await exists(folder + '/before-started.json'), false, 'BEFORE already attempted');
const absent = ['src/input/vehicle-selection.ts'];
for (const path of absent) assert.equal(await exists(path), false, '068 production must be absent');
const startedAt = new Date().toISOString();
await mkdir(folder, { recursive: true });
await writeFile(
  folder + '/before-started.json',
  JSON.stringify({ startedAt, expectedRoot, phase: 'PREPRODUCTION' }, null, 2),
  { flag: 'wx' },
);
const files = execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .map((path) => path.replaceAll('\\', '/'));
files.push(
  'scripts/benchmark-vehicle-selection-before.mjs',
  'scripts/diagnose-vehicle-selection-displacement.mjs',
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
  nativeRelative = 'native-before/rapier.mjs';
await mkdir(folder + '/native-before', { recursive: true });
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
  fixtureVersion: SELECTION_REFERENCE.version,
  budgetVersion: '203-initial-1',
  runtime: process.version,
  cpu: cpus()[0]?.model,
  os: platform() + ' ' + release(),
  runs: [],
  scenarios: [],
  guards: [],
  resourceFailures: [],
  diagnostic: {
    version: '068-native110-displacement-diagnostic-v1',
    expectedOutcome: 'FAIL_ORIGINAL_CONTINUITY_ASSERTION',
    originalSourceHash: 'e8d9c7cd249f3633a58ad077632d72e2c0c55cdb86cb5a1dedec08dd3fd5afd5',
    bounds: {
      worlds: 1,
      population: 110,
      observer: false,
      recentStartTick: 570,
      recentEndTick: 584,
      recentTicks: 15,
      bodiesPerTick: 110,
      packetsPerTick: 220,
      nativeInputsPerTick: 110,
      contactPairsPerTick: 16555,
    },
    recent: [],
    culprit: null,
    counters: {
      nativeStepCalls: 0,
      diagnosticBodyReads: 0,
      diagnosticProjectReads: 0,
      diagnosticContactReads: 0,
      diagnosticMechanicsReads: 0,
      reportedPhysicsBridgeCalls: 0,
      reportedPhysicsQueryCalls: 0,
    },
  },
  scope:
    'DIAGNOSTIC ONLY one110 pair0OFF published reference world. Original d<.7 assertion expectedFAIL, unchanged geometry/commands/mechanics/protocol; bounded native recent570..584 readbacks/contact evidence. Not a baseline, acceptance retry, FPS/performance or heap proof.',
};
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
async function fixture(count, classId, resources) {
  if (report.firstWorldAt === null) {
    report.firstWorldAt = new Date().toISOString();
    await writeFile(
      folder + '/before-first-world.json',
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
  const world = await createRapierProbe();
  resources.own('world', () => world.dispose());
  resources.inspect('body', () => world.bodyResources());
  resources.inspect('collision', () => world.collisionResources());
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
  return { world, inputs };
}
async function run(
  count,
  pair,
  observer,
  { classId = null, fixedMode = null, targetKind = 'TAXI' } = {},
) {
  const resources = createReferenceResourceScope();
  let result = null,
    primary = null;
  try {
    const f = await fixture(count, classId, resources),
      world = f.world;
    const ids = Array.from({ length: count }, (_, i) => world.bodyIdentity('car-' + i));
    assert(ids.every(Boolean));
    let lastNativeInputs = null;
    let drivingPoseWrites = 0,
      drivingVelocityWrites = 0;
    const controller = createVehicleController(CONTROLLER_CONTEXT, {
      ...world,
      step(inputs, measure) {
        report.diagnostic.counters.nativeStepCalls++;
        lastNativeInputs = clone([...inputs.entries()]);
        const costs = world.step(inputs, measure);
        report.diagnostic.counters.reportedPhysicsBridgeCalls += costs.bridgeCalls;
        report.diagnostic.counters.reportedPhysicsQueryCalls += costs.queryCount;
        return costs;
      },
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
      selectionDigest = createHash('sha256');
    const checks = [],
      selectionTrace = [],
      modeCounts = { AUTO: 0, MANUAL: 0, LEARNING: 0 };
    const tickSamples = new Float64Array(observer ? 600 : 0),
      authoritySamples = new Float64Array(observer ? 600 : 0),
      selectionSamples = new Float64Array(observer ? 600 : 0);
    let maxPlayers = 0,
      selections = 0,
      cameraUpdates = 0,
      explicitClaims = 0,
      maxDisplacementM = 0;
    let previousPositions = ids.map((id) => clone(world.project(id.entityId).position));
    for (let tick = 1; tick <= 780; tick++) {
      const diagnosticWindow = tick >= 570 && tick <= 584;
      const diagnosticPrior = diagnosticWindow
        ? ids.map((identity) => {
            report.diagnostic.counters.diagnosticBodyReads++;
            report.diagnostic.counters.diagnosticProjectReads++;
            return {
              identity: clone(identity),
              body: clone(world.readBody(identity)),
              project: clone(world.project(identity.entityId)),
            };
          })
        : null;
      const begin = observer ? performance.now() : 0,
        phase = referenceSelectionPhase(tick, fixedMode ?? undefined);
      const actionBegin = observer ? performance.now() : 0;
      let ticket = null,
        requests = [],
        departed = null;
      if (phase.claim && phase.mode !== 'AUTO') {
        assert.equal(selected, ids[0]);
        assert.equal(owner.getStats().seat, null);
        assert(modes.enqueue(phase.mode === 'MANUAL' ? 'M' : 'L'));
        ticket = modes.prepare(modeTime(tick));
        requests = ticket.requests;
        explicitClaims++;
      }
      if (phase.depart) {
        const target = ids[1],
          source = targetKind === 'CIVIL' ? 'WORLD' : phase.source;
        assert(
          referenceSelectionAdmission(
            world.bodyIdentity(target.entityId),
            target,
            source,
            targetKind,
            source === 'WORLD',
            source === 'WORLD',
          ),
        );
        modes.clear();
        departed = owner.getStats().seat;
        if (departed) {
          const b = segments.read();
          assert(b);
          assert.equal(b.identity, departed.identity);
          assert.equal(b.segment.completeness, 'OPEN');
          assert.equal(b.segment.controlMode, departed.mode);
          assert.equal(b.segment.sessionId, CONTROLLER_CONTEXT.sessionId);
          requests = [{ identity: departed.identity, mode: 'AUTO' }];
        }
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
      const stepBegin = observer ? performance.now() : 0,
        result = owner.step(authorityTime(tick), packets, requests).frame;
      const stepCost = observer ? performance.now() - stepBegin : 0,
        settleBegin = observer ? performance.now() : 0;
      if (ticket) {
        assert.equal(modes.settle(ticket), 'ACCEPTED');
        const seat = owner.getStats().seat;
        assert(seat);
        segments.open(seat.identity, seat.mode, tick);
      }
      if (phase.depart) {
        assert.equal(owner.getStats().seat, null);
        if (departed) {
          segments.close(departed.identity, tick);
          const b = segments.read();
          assert.equal(b.identity, departed.identity);
          assert.equal(b.segment.completeness, 'CLOSED');
          assert.equal(b.segment.endTick, tick);
          assert.equal(b.segment.closeReason, 'VEHICLE_SWITCH');
        }
        selected = ids[1];
        camera.select(selected.entityId);
        selections++;
        assert.equal(camera.selectedEntityId, selected.entityId);
        assert.equal(result.controls.find((c) => c.identity === selected).mode, 'AUTO');
      }
      if (phase.returnCamera) {
        modes.clear();
        selected = ids[0];
        camera.select(selected.entityId);
        selections++;
        assert.equal(owner.getStats().seat, null);
      }
      const pose = camera.update(cameraTarget(world, selected), 1 / 60);
      assert(pose);
      assert.equal(pose.entityId, selected.entityId);
      cameraUpdates++;
      if (phase.depart || phase.returnCamera)
        assert.equal(hash(JSON.stringify(assignments)), assignmentDigest);
      if (diagnosticWindow) {
        report.diagnostic.counters.diagnosticContactReads++;
        const contacts = clone(world.readCollisionContacts());
        assert(contacts.contacts.length <= 16555, 'Diagnostic contact bound');
        const current = ids.map((identity) => {
          report.diagnostic.counters.diagnosticBodyReads++;
          report.diagnostic.counters.diagnosticProjectReads++;
          return {
            identity: clone(identity),
            body: clone(world.readBody(identity)),
            project: clone(world.project(identity.entityId)),
          };
        });
        assert.equal(ids.length, 110, 'Diagnostic body pool');
        assert.equal(diagnosticPrior.length, 110, 'Diagnostic prior bodies');
        assert.equal(current.length, 110, 'Diagnostic current bodies');
        assert.equal(packets.length, 220, 'Diagnostic addressed packets');
        assert.equal(result.controls.length, 110, 'Diagnostic accepted controls');
        assert.equal(lastNativeInputs.length, 110, 'Diagnostic native inputs');
        assert.equal(
          new Set(lastNativeInputs.map(([id]) => id)).size,
          110,
          'Diagnostic native input addressing',
        );
        report.diagnostic.recent.push({
          tick,
          dtSeconds: 1 / 60,
          phase: clone(phase),
          prior: diagnosticPrior,
          current,
          packets: clone(packets),
          controls: clone(result.controls),
          physics: clone(result.physics),
          nativeInputs: lastNativeInputs,
          contacts,
          authority: clone(owner.getStats()),
          rawKeyboard: clone(filtered.raw),
          camera: clone(pose),
        });
        assert(report.diagnostic.recent.length <= 15, 'Diagnostic recent tick bound');
      }
      for (const [i, id] of ids.entries()) {
        const position = world.project(id.entityId).position;
        const prior = previousPositions[i];
        const d = Math.hypot(position.x - prior.x, position.y - prior.y, position.z - prior.z);
        if (!(d < 0.7)) {
          report.diagnostic.counters.diagnosticBodyReads++;
          report.diagnostic.counters.diagnosticProjectReads++;
          report.diagnostic.counters.diagnosticMechanicsReads++;
          report.diagnostic.culprit = {
            identity: clone(id),
            tick,
            dtSeconds: 1 / 60,
            displacementM: d,
            originalBoundM: 0.7,
            priorPosition: clone(prior),
            currentPosition: clone(position),
            prior: diagnosticPrior?.[i] ?? null,
            current: {
              body: clone(world.readBody(id)),
              project: clone(world.project(id.entityId)),
            },
            control: clone(result.controls.find((c) => c.identity === id)),
            nativeInput: lastNativeInputs?.find(([entityId]) => entityId === id.entityId) ?? null,
            mechanics: clone(world.readVehicleMechanics(id.entityId)),
            selectionPhase: clone(phase),
            authority: clone(owner.getStats()),
            drivingPoseWrites,
            drivingVelocityWrites,
          };
        }
        assert(d < 0.7, 'Physical discontinuity');
        maxDisplacementM = Math.max(maxDisplacementM, d);
        previousPositions[i] = clone(position);
      }
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
      }
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
        tickSamples.byteLength + authoritySamples.byteLength + selectionSamples.byteLength,
      rawTimings: observer
        ? {
            tickMs: [...tickSamples],
            authorityMs: [...authoritySamples],
            referenceSelectionMs: [...selectionSamples],
          }
        : null,
      tickMs: observer ? distribution(tickSamples) : null,
      existingAuthorityMs: observer ? distribution(authoritySamples) : null,
      referenceSelectionMs: observer ? distribution(selectionSamples) : null,
      decisionDigest: decision.digest('hex'),
      rawPlayerDigest: raw.digest('hex'),
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
      drivingPoseWrites,
      drivingVelocityWrites,
      owned: {
        controller: controller.getStats(),
        authority: owner.getStats(),
        mode: modes.getStats(),
        keyboard: keyboard.getStats(),
        segment: segments.getStats(),
        assignments: assignments.length,
        body: world.bodyResources(),
        collision: world.collisionResources(),
      },
      cleanup: null,
    };
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
  if (primary || cleanup.errors.length) {
    report.resourceFailures.push({
      world: { count, pair, observer, classId, fixedMode, targetKind },
      primary: primary ? { message: String(primary.message), stack: String(primary.stack) } : null,
      cleanup,
    });
    throw new AggregateError(
      [
        ...(primary ? [primary] : []),
        ...cleanup.errors.map((e) => Error(e.resource + ': ' + e.message)),
      ],
      'Reference world failed; original cause and all cleanup errors preserved',
    );
  }
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
  if (c.mode) {
    assert.equal(c.mode.intents, 0);
    assert.equal(c.mode.inFlight, 0);
    assert.equal(c.mode.projection, null);
    assert.equal(c.mode.disposed, true);
  }
  if ('cameraTarget' in c) assert.equal(c.cameraTarget, null);
  if ('assignments' in c) assert.equal(c.assignments, 0);
}

let captureError = null;
try {
  report.runs.push(await run(110, 0, false));
  report.diagnostic.unexpectedCompletedWorld = true;
  report.status = 'UNEXPECTED_COMPLETION';
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
// End guards also run on the expected failing world;diagnostic source/native changes cannot hide behind failure.
report.endGuards = {
  checkedAt: null,
  sourceInputsVerified: 0,
  sourceInputFailures: [],
  installedNativeVerified: false,
  archivedNativeVerified: false,
  productionAbsent: false,
};
for (const input of inputs) {
  try {
    assert.equal(hash(await readFile(input.path)), input.sha256);
    assert.equal(hash(await readFile(archive + '/' + input.path)), input.sha256);
    report.endGuards.sourceInputsVerified++;
  } catch (error) {
    report.endGuards.sourceInputFailures.push({ path: input.path, message: String(error.message) });
  }
}
try {
  assert.equal(hash(await readFile(nativePath)), nativeArtifact.sha256);
  report.endGuards.installedNativeVerified = true;
} catch (error) {
  report.endGuards.sourceInputFailures.push({ path: nativePath, message: String(error.message) });
}
try {
  assert.equal(hash(await readFile(folder + '/' + nativeRelative)), nativeArtifact.sha256);
  report.endGuards.archivedNativeVerified = true;
} catch (error) {
  report.endGuards.sourceInputFailures.push({
    path: nativeRelative,
    message: String(error.message),
  });
}
try {
  for (const path of absent) assert.equal(await exists(path), false);
  report.endGuards.productionAbsent = true;
} catch (error) {
  report.endGuards.sourceInputFailures.push({
    path: '068-production-absence',
    message: String(error.message),
  });
}
report.diagnostic.counterBounds = {
  nativeStepCalls: 780,
  diagnosticBodyReads: 3301,
  diagnosticProjectReads: 3301,
  diagnosticContactReads: 15,
  diagnosticMechanicsReads: 1,
  reportedPhysicsBridgeCalls: 110 * 25 * 780,
  reportedPhysicsQueryCalls: 110 * 780,
};
try {
  for (const [key, maximum] of Object.entries(report.diagnostic.counterBounds)) {
    const value = report.diagnostic.counters[key];
    assert(
      Number.isSafeInteger(value) && value >= 0 && value <= maximum,
      'Diagnostic counter bound: ' + key,
    );
  }
} catch (error) {
  report.endGuards.sourceInputFailures.push({
    path: 'diagnostic-counter-bounds',
    message: String(error.message),
  });
}
report.endGuards.checkedAt = new Date().toISOString();
if (report.endGuards.sourceInputFailures.length) {
  const guardError = Error('Diagnostic end source/native/absence guards failed');
  captureError = captureError
    ? new AggregateError(
        [captureError, guardError],
        'Original diagnostic failure and provenance failures preserved',
      )
    : guardError;
  report.status = 'FAIL';
}
report.capturedAt = new Date().toISOString();
let exportError = null;
try {
  await writeFile(output, JSON.stringify(report, null, 2), { flag: 'wx' });
} catch (error) {
  exportError = error;
}
// Bounded two-error ledger. A failed write is never described as a report saved on disk.
const terminal = {
  status: report.status,
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
if (captureError && exportError)
  throw new AggregateError(
    [captureError, exportError],
    'Capture and report export both failed; original causes preserved',
  );
if (captureError) throw captureError;
if (exportError) throw exportError;
