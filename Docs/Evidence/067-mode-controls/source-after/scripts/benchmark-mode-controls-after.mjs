// Distinct067 AFTER. Immutable BEFORE protocol and captures remain unchanged.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createModeControls } from '../src/input/mode-controls.ts';
import { createControlAuthority } from '../src/input/control-authority.ts';
import { createVehicleController } from '../src/vehicles/controller.ts';
import { createKeyboardFilter } from '../src/vehicles/keyboard-filter.ts';
import { createDefaultSettings } from '../src/settings/store.ts';
import { createRapierProbe } from '../src/vehicles/rapier/index.ts';
import { manyContacts } from '../tests/vehicles/physics-fixture.ts';
import { CONTROLLER_CONTEXT, controllerCommand } from '../tests/vehicles/controller-reference.ts';
import {
  AUTHORITY_REFERENCE,
  referenceSeat,
  referenceChanges,
  referenceAction,
  referenceMode,
} from '../tests/input/mode-controls-reference.ts';
const folder = 'Docs/Evidence/067-mode-controls',
  output = `${folder}/after.json`,
  archive = `${folder}/source-after`;
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};
assert.equal(await exists(output), false, 'Immutable AFTER exists');
assert.equal(await exists(archive), false, 'Immutable source archive exists');
for (const path of [
  'src/input/mode-controls.ts',
  'src/input/mode-keyboard.ts',
  'src/ui/control-mode-hud.ts',
])
  assert.equal(await exists(path), true, '067 production required');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex'),
  startedAt = new Date().toISOString();
await writeFile(
  `${folder}/after-started.json`,
  JSON.stringify(
    {
      startedAt,
      command:
        'node --import ./scripts/register-typescript.mjs scripts/benchmark-mode-controls-after.mjs',
      output,
      archive,
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
const files = execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .map((path) => path.replaceAll('\\', '/'));
files.push(
  'scripts/benchmark-mode-controls-after.mjs',
  'tests/input/mode-controls-reference.ts',
  'tests/input/control-authority-reference.ts',
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
await mkdir(archive, { recursive: true });
for (const path of files) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  inputs.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  const target = `${archive}/${path}`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' });
}
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')),
  nativeBytes = await readFile(nativePath),
  nativeRelative = 'native-after/rapier.mjs';
await mkdir(`${folder}/native-after`, { recursive: true });
await writeFile(`${folder}/${nativeRelative}`, nativeBytes, { flag: 'wx' });
const nativeArtifact = {
  path: nativePath,
  archiveRelativePath: nativeRelative,
  bytes: nativeBytes.length,
  sha256: hash(nativeBytes),
  archivedAt: new Date().toISOString(),
  archiveTiming: 'Actual installed native bytes archived BEFORE first world',
};
const report = {
  status: 'RUNNING',
  startedAt,
  capturedAt: null,
  firstWorldAt: null,
  timingScope:
    'Whole tick includes extra harness assertions, accepted067 projection observations and stage clocks; it is not pure algorithm cost. modeControlsMs is separate enqueue/prepare/settle/projection-read stage timing. OFF retains no timing channels.',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: source.digest('hex'),
  inputs,
  nativeArtifact,
  fixtureVersion: AUTHORITY_REFERENCE.version,
  budgetVersion: '203-initial-1',
  runtime: process.version,
  cpu: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  baseline: {
    path: `${folder}/before.json`,
    sha256: hash(await readFile(`${folder}/before.json`)),
  },
  comparisons: [],
  runs: [],
  parity: [],
  handoff: [],
  rejections: [],
  expiry: [],
  scope:
    '067 AFTER adapter over unchanged066/024/025. Same34 native worlds/reference physical policy. Own stage separated; no renderer/FPS/fullgame/laptop/heap claim.',
};
const baseline = JSON.parse(await readFile(`${folder}/before.json`, 'utf8'));
assert.equal(baseline.status, 'PASS');
assert.equal(nativeArtifact.sha256, baseline.nativeArtifact.sha256);
const distribution = (values) => {
  const v = [...values].sort((a, b) => a - b);
  return {
    p50: v[Math.floor((v.length - 1) * 0.5)],
    p95: v[Math.floor((v.length - 1) * 0.95)],
    p99: v[Math.floor((v.length - 1) * 0.99)],
  };
};
const physicalCommand = (c) => ({
  vehicleId: c.vehicleId,
  tick: c.tick,
  throttle: c.throttle,
  brake: c.brake,
  steering: c.steering,
  handbrake: c.handbrake,
});
const states = (world, ids) =>
  JSON.parse(JSON.stringify(ids.map((identity) => world.project(identity.entityId))));
const bodyHash = (world, ids) => hash(JSON.stringify(states(world, ids)));
async function run(
  count,
  pair,
  observer,
  { scenario = 'TIMELINE', classId = null, concurrent = true } = {},
) {
  if (report.firstWorldAt === null) {
    report.firstWorldAt = new Date().toISOString();
    await writeFile(
      `${folder}/after-first-world.json`,
      JSON.stringify(
        {
          firstWorldAt: report.firstWorldAt,
          sourceHash: report.sourceHash,
          nativeSha256: nativeArtifact.sha256,
          nativeArchivedAt: nativeArtifact.archivedAt,
        },
        null,
        2,
      ),
      { flag: 'wx' },
    );
  }
  const fixture = classId
      ? { world: await createRapierProbe(), inputs: new Map() }
      : await manyContacts(count),
    world = fixture.world;
  if (classId) {
    world.addClassCar('car-0', { x: 0, y: 0.8, z: 0 }, classId);
    if (count > 1) world.addClassCar('car-1', { x: 8, y: 0.8, z: 0 }, classId);
  }
  const ids = Array.from({ length: count }, (_, i) => world.bodyIdentity(`car-${i}`));
  assert(ids.every(Boolean));
  const controller = createVehicleController(CONTROLLER_CONTEXT, world);
  const pendingFilters = new Map();
  let clearCalls = 0,
    delegatedCost = 0;
  const delegate = {
    ...controller,
    step(...args) {
      const start = performance.now();
      try {
        return controller.step(...args);
      } finally {
        delegatedCost = performance.now() - start;
      }
    },
  };
  const owner = createControlAuthority(CONTROLLER_CONTEXT, delegate, {
    bodyIdentity: (id) => world.bodyIdentity(id),
    clearOldPlayer(identity) {
      clearCalls++;
      const old = pendingFilters.get(identity);
      if (old) {
        old.clear();
        old.dispose();
        disposedFilters++;
        pendingFilters.delete(identity);
      }
    },
  });
  for (const identity of ids) owner.register(identity);
  let selectedIdentity = ids[0];
  const modes = createModeControls(CONTROLLER_CONTEXT, {
    readAuthority: () => owner.getStats(),
    selectedIdentity: () => selectedIdentity,
    bodyIdentity: (id) => world.bodyIdentity(id),
  });
  let seat = null,
    keyboard = null,
    filterIdentity = null,
    createdFilters = 0,
    disposedFilters = 0;
  const checkpoints = [],
    digest = createHash('sha256'),
    rawDigest = createHash('sha256');
  const tickSamples = new Float64Array(observer ? 600 : 0),
    controllerSamples = new Float64Array(observer ? 600 : 0),
    ownerSamples = new Float64Array(observer ? 600 : 0),
    modeSamples = new Float64Array(observer ? 600 : 0),
    modeCounts = { AUTO: 0, MANUAL: 0, LEARNING: 0 };
  const transitionCounts = {};
  let transitions = 0,
    ignoredAI = 0,
    ignoredPLAYER = 0,
    maximumPlayers = 0;
  const preferences = createDefaultSettings('066-fixture').input.control;
  try {
    for (let nextTick = 1; nextTick <= 780; nextTick++) {
      const began = observer ? performance.now() : 0,
        nextSeat = referenceSeat(nextTick, ids, scenario),
        changes = referenceChanges(seat, nextSeat);
      const modeBegin = observer ? performance.now() : 0;
      if (changes.length) {
        selectedIdentity = nextSeat?.identity ?? seat.identity;
        const from = selectedIdentity === seat?.identity ? seat.mode : 'AUTO';
        const desired = nextSeat?.mode ?? 'AUTO';
        const key =
          desired === 'AUTO' ? 'M' : desired === 'LEARNING' ? 'L' : from === 'LEARNING' ? 'L' : 'M';
        assert.equal(modes.enqueue(key), true);
      }
      const ticket = modes.prepare({
        ...CONTROLLER_CONTEXT,
        version: '067-mode-controls-v1',
        tick: nextTick,
        dtSeconds: 1 / 60,
      });
      let modeCost = observer ? performance.now() - modeBegin : 0;
      assert.deepEqual(ticket.requests, changes);
      const desiredFilterIdentity =
        classId && scenario !== 'TIMELINE' && scenario !== 'HANDOFF'
          ? ids[0]
          : (nextSeat?.identity ?? null);
      if (filterIdentity !== desiredFilterIdentity) {
        if (keyboard) pendingFilters.set(filterIdentity, keyboard);
        keyboard = desiredFilterIdentity
          ? createKeyboardFilter(
              CONTROLLER_CONTEXT,
              desiredFilterIdentity.entityId,
              preferences,
              nextTick - 1,
            )
          : null;
        filterIdentity = desiredFilterIdentity;
        if (keyboard) createdFilters++;
      }
      let filtered = null;
      if (keyboard) {
        keyboard.setAction('throttle', nextTick % 120 < 80);
        keyboard.setAction('brake', nextTick % 120 >= 100);
        keyboard.setAction('steerRight', nextTick % 120 >= 30 && nextTick % 120 < 60);
        keyboard.setAction('steerLeft', nextTick % 120 >= 60 && nextTick % 120 < 90);
        const body = world.readBody(filterIdentity);
        filtered = keyboard.step({
          tick: nextTick,
          dtSeconds: 1 / 60,
          speedMps: Math.hypot(body.velocityMps.x, body.velocityMps.y, body.velocityMps.z),
        });
      }
      const packets = [];
      for (const identity of ids) {
        const values =
          classId && scenario !== 'TIMELINE' && scenario !== 'HANDOFF'
            ? {
                throttle: filtered.command.throttle,
                brake: filtered.command.brake,
                steering: filtered.command.steering,
                handbrake: filtered.command.handbrake,
                turnSignal: filtered.command.turnSignal,
              }
            : (fixture.inputs.get(identity.entityId) ?? {
                throttle: 0.35,
                brake: 0,
                steering: 0.02,
              });
        const ai = controllerCommand(identity.entityId, nextTick, 'AUTONOMY', values);
        if (concurrent || nextSeat?.identity !== identity) packets.push({ identity, command: ai });
        if (nextSeat?.identity === identity) {
          assert(filtered);
          packets.push({ identity, command: filtered.command });
          rawDigest.update(JSON.stringify(filtered.raw));
        } else if (concurrent)
          packets.push({
            identity,
            command: controllerCommand(identity.entityId, nextTick, 'PLAYER', {
              throttle: 0,
              brake: 1,
            }),
          });
      }
      const stepBegin = observer ? performance.now() : 0,
        result = owner.step(
          {
            ...CONTROLLER_CONTEXT,
            version: '066-control-authority-v1',
            tick: nextTick,
            dtSeconds: 1 / 60,
          },
          packets,
          ticket.requests,
          false,
        ).frame;
      const stepCost = observer ? performance.now() - stepBegin : 0;
      const settleBegin = observer ? performance.now() : 0;
      const settlement = modes.settle(ticket);
      const accepted = modes.getStats().projection;
      if (observer) modeCost += performance.now() - settleBegin;
      assert.equal(settlement, 'ACCEPTED');
      assert.equal(accepted.tick, nextTick);
      assert.equal(accepted.mode, nextSeat?.mode ?? 'AUTO');
      if (nextSeat) assert.equal(accepted.identity, nextSeat.identity);
      assert.equal(result.tick, nextTick);
      const players = result.controls.filter((control) => control.mode !== 'AUTO');
      assert.equal(players.length, nextSeat ? 1 : 0);
      maximumPlayers = Math.max(maximumPlayers, players.length);
      if (nextSeat) assert.equal(players[0].identity, nextSeat.identity);
      if (scenario === 'TIMELINE') {
        const action = referenceAction(nextTick);
        if (action) {
          const from = seat?.mode ?? 'AUTO',
            to = nextSeat?.mode ?? 'AUTO';
          assert.equal(referenceMode(from, action), to);
          const edge = from + ':' + action + ':' + to;
          transitionCounts[edge] = (transitionCounts[edge] ?? 0) + 1;
        }
      }
      transitions += changes.length;
      seat = nextSeat;
      modeCounts[seat?.mode ?? 'AUTO']++;
      for (const ignored of result.ignoredCommands) {
        if (ignored.source === 'AUTONOMY') ignoredAI++;
        else ignoredPLAYER++;
      }
      for (const control of result.controls) {
        digest.update(JSON.stringify(physicalCommand(control.command)));
        assert.equal(control.command.source, control.mode === 'AUTO' ? 'AUTONOMY' : 'PLAYER');
        assert.equal(control.command.tick, nextTick);
        if (control.mode !== 'AUTO')
          assert(
            result.ignoredCommands.some(
              (ignored) =>
                ignored.vehicleId === control.identity.entityId && ignored.source === 'AUTONOMY',
            ) === concurrent,
          );
      }
      if (observer && nextTick > 180) {
        tickSamples[nextTick - 181] = performance.now() - began;
        controllerSamples[nextTick - 181] = delegatedCost;
        ownerSamples[nextTick - 181] = Math.max(0, stepCost - delegatedCost);
        modeSamples[nextTick - 181] = modeCost;
      }
      if (nextTick % 60 === 0) checkpoints.push({ tick: nextTick, physical: states(world, ids) });
    }
    const lifecycleCycles = [];
    for (let cycle = 0; cycle < 20; cycle++) {
      const ephemeral = createModeControls(CONTROLLER_CONTEXT, {
        readAuthority: () => owner.getStats(),
        selectedIdentity: () => ids[0],
        bodyIdentity: (id) => world.bodyIdentity(id),
      });
      ephemeral.enqueue('M');
      ephemeral.prepare({
        ...CONTROLLER_CONTEXT,
        version: '067-mode-controls-v1',
        tick: 781,
        dtSeconds: 1 / 60,
      });
      const live = ephemeral.getStats();
      ephemeral.dispose();
      const cleanup = ephemeral.getStats();
      assert.deepEqual(cleanup, {
        intents: 0,
        inFlight: 0,
        disposed: true,
        fault: null,
        projection: null,
        retainedHistory: 0,
      });
      lifecycleCycles.push({ cycle, registeredVehicles: owner.getStats().vehicles, live, cleanup });
    }
    const owned = {
      controller: controller.getStats(),
      authority: owner.getStats(),
      modeControls: modes.getStats(),
      keyboard: keyboard?.getStats() ?? null,
      body: world.bodyResources(),
      collision: world.collisionResources(),
    };
    const result = {
      count,
      pair,
      observer,
      scenario,
      classId,
      concurrent,
      warmupTicks: 180,
      measuredTicks: 600,
      physicalTicks: 780,
      sampleBytes:
        tickSamples.byteLength +
        controllerSamples.byteLength +
        ownerSamples.byteLength +
        modeSamples.byteLength,
      rawTimingSamples: observer
        ? {
            tick: Array.from(tickSamples),
            controller: Array.from(controllerSamples),
            authority: Array.from(ownerSamples),
            modeControls: Array.from(modeSamples),
          }
        : null,
      modeControlsMs: observer ? distribution(modeSamples) : null,
      tickMs: observer ? distribution(tickSamples) : null,
      existingControllerMs: observer ? distribution(controllerSamples) : null,
      authorityOverheadMs: observer ? distribution(ownerSamples) : null,
      clearCalls,
      modeCounts,
      transitions,
      transitionCounts,
      ignoredAI,
      ignoredPLAYER,
      maximumPlayers,
      createdFilters,
      disposedFilters,
      drivingPoseWrites: 0,
      drivingVelocityWrites: 0,
      decisionDigest: digest.digest('hex'),
      rawPlayerDigest: rawDigest.digest('hex'),
      checkpoints,
      finalPhysicalHash: bodyHash(world, ids),
      owned,
      cleanup: null,
      lifecycleCycles,
    };
    if (keyboard) {
      keyboard.clear();
      keyboard.dispose();
      disposedFilters++;
      keyboard = null;
    }
    assert.equal(pendingFilters.size, 0);
    modes.dispose();
    owner.dispose();
    controller.dispose();
    world.dispose();
    result.disposedFilters = disposedFilters;
    result.cleanup = {
      modeControls: modes.getStats(),
      controller: controller.getStats(),
      authority: owner.getStats(),
      body: world.bodyResources(),
      collision: world.collisionResources(),
      activeFilters: 0,
    };
    assert.deepEqual(result.cleanup.modeControls, {
      intents: 0,
      inFlight: 0,
      disposed: true,
      fault: null,
      projection: null,
      retainedHistory: 0,
    });
    assert.equal(createdFilters, disposedFilters);
    assert.equal(result.cleanup.body.entities, 0);
    assert.equal(result.cleanup.collision.colliders, 0);
    return result;
  } finally {
    modes.dispose();
    keyboard?.dispose();
    for (const old of pendingFilters.values()) old.dispose();
    owner.dispose();
    controller.dispose();
    world.dispose();
  }
}
const authorityTime = (tick) => ({
  ...CONTROLLER_CONTEXT,
  version: '066-control-authority-v1',
  tick,
  dtSeconds: 1 / 60,
});
async function rejection(classId) {
  const world = await createRapierProbe(),
    controller = createVehicleController(CONTROLLER_CONTEXT, world);
  const owner = createControlAuthority(CONTROLLER_CONTEXT, controller, {
    bodyIdentity: (id) => world.bodyIdentity(id),
  });
  let modes, result;
  try {
    world.addClassCar('a', { x: 0, y: 0.8, z: 0 }, classId);
    world.addClassCar('b', { x: 8, y: 0.8, z: 0 }, classId);
    const ids = ['a', 'b'].map((id) => world.bodyIdentity(id));
    for (const identity of ids) owner.register(identity);
    let selected = ids[0];
    modes = createModeControls(CONTROLLER_CONTEXT, {
      readAuthority: () => owner.getStats(),
      selectedIdentity: () => selected,
      bodyIdentity: (id) => world.bodyIdentity(id),
    });
    modes.enqueue('M');
    selected = ids[1];
    assert.throws(() => modes.enqueue('L'), /conflict/);
    assert.equal(modes.getStats().intents, 0);
    selected = ids[0];
    modes.enqueue('M');
    const ticket = modes.prepare({ ...authorityTime(1), version: '067-mode-controls-v1' });
    const prior = bodyHash(world, ids);
    assert.throws(
      () =>
        owner.step(
          authorityTime(1),
          [],
          ids.map((identity) => ({ identity, mode: 'MANUAL' })),
        ),
      /Contradictory PLAYER/,
    );
    assert.equal(controller.getStats().tick, 0);
    assert.equal(bodyHash(world, ids), prior);
    const packet = {
      identity: ids[0],
      command: controllerCommand('a', 1, 'PLAYER', { throttle: 0.4 }),
    };
    assert.throws(
      () => owner.step(authorityTime(1), [packet, packet], ticket.requests),
      /Duplicate/,
    );
    assert.equal(controller.getStats().tick, 0);
    assert.equal(bodyHash(world, ids), prior);
    assert.equal(modes.settle(ticket), 'PENDING');
    const frame = owner.step(
      authorityTime(1),
      [packet, { identity: ids[0], command: controllerCommand('a', 1, 'AUTONOMY', { brake: 1 }) }],
      ticket.requests,
    ).frame;
    assert.equal(modes.settle(ticket), 'ACCEPTED');
    assert.equal(frame.controls[0].command.throttle, 0.4);
    assert.equal(frame.ignoredCommands[0].source, 'AUTONOMY');
    return (result = {
      classId,
      contradictoryClaimsRejected: true,
      duplicateSourceRejected: true,
      failedPhysicalSteps: 0,
      retryAcceptedSameTick: 1,
      initialPhysicalHash: prior,
      finalPhysicalHash: bodyHash(world, ids),
      drivingPoseWrites: 0,
      drivingVelocityWrites: 0,
    });
  } finally {
    modes?.dispose();
    if (result) {
      result.modeControlsCleanup = modes.getStats();
      assert.deepEqual(result.modeControlsCleanup, {
        intents: 0,
        inFlight: 0,
        disposed: true,
        fault: null,
        projection: null,
        retainedHistory: 0,
      });
    }
    owner.dispose();
    controller.dispose();
    world.dispose();
  }
}
async function expiry(classId) {
  const world = await createRapierProbe(),
    controller = createVehicleController(CONTROLLER_CONTEXT, world);
  const owner = createControlAuthority(CONTROLLER_CONTEXT, controller, {
    bodyIdentity: (id) => world.bodyIdentity(id),
  });
  let modes, result;
  try {
    world.addClassCar('car', { x: 0, y: 0.8, z: 0 }, classId);
    const identity = world.bodyIdentity('car');
    owner.register(identity);
    modes = createModeControls(CONTROLLER_CONTEXT, {
      readAuthority: () => owner.getStats(),
      selectedIdentity: () => identity,
      bodyIdentity: (id) => world.bodyIdentity(id),
    });
    const trace = [];
    for (let nextTick = 1; nextTick <= 8; nextTick++) {
      const packets =
        nextTick === 1
          ? [{ identity, command: controllerCommand('car', 1, 'AUTONOMY', { throttle: 0.4 }) }]
          : [];
      const ticket = modes.prepare({ ...authorityTime(nextTick), version: '067-mode-controls-v1' });
      const frame = owner.step(authorityTime(nextTick), packets, ticket.requests).frame;
      assert.equal(modes.settle(ticket), 'ACCEPTED');
      trace.push(physicalCommand(frame.controls[0].command));
      assert.equal(frame.controls[0].command.throttle, nextTick <= 6 ? 0.4 : 0);
    }
    const before = bodyHash(world, [identity]);
    owner.suspend();
    modes.clear();
    assert.equal(modes.enqueue('M'), false);
    assert.throws(
      () => modes.prepare({ ...authorityTime(9), version: '067-mode-controls-v1' }),
      /suspended/,
    );
    assert.throws(() => owner.step(authorityTime(9)), /suspended/);
    assert.equal(bodyHash(world, [identity]), before);
    assert.equal(controller.getStats().tick, 8);
    owner.resume();
    const resumeTicket = modes.prepare({ ...authorityTime(9), version: '067-mode-controls-v1' });
    owner.step(authorityTime(9), [], resumeTicket.requests);
    assert.equal(modes.settle(resumeTicket), 'ACCEPTED');
    return (result = {
      classId,
      trace,
      targetTicks: 6,
      suspendedPhysicalSteps: 0,
      resumeTick: 9,
      finalPhysicalHash: bodyHash(world, [identity]),
      drivingPoseWrites: 0,
      drivingVelocityWrites: 0,
    });
  } finally {
    modes?.dispose();
    if (result) {
      result.modeControlsCleanup = modes.getStats();
      assert.deepEqual(result.modeControlsCleanup, {
        intents: 0,
        inFlight: 0,
        disposed: true,
        fault: null,
        projection: null,
        retainedHistory: 0,
      });
    }
    owner.dispose();
    controller.dispose();
    world.dispose();
  }
}
try {
  for (const count of [70, 110]) {
    for (let pair = 0; pair < 5; pair++)
      for (const observer of pair % 2 ? [true, false] : [false, true]) {
        const result = await run(count, pair, observer);
        report.runs.push(result);
        console.log(JSON.stringify({ count, pair, observer, p95: result.tickMs?.p95 }));
      }
    const group = report.runs.filter((run) => run.count === count);
    for (const current of group) {
      assert.equal(current.decisionDigest, group[0].decisionDigest);
      assert.equal(current.rawPlayerDigest, group[0].rawPlayerDigest);
      assert.equal(current.finalPhysicalHash, group[0].finalPhysicalHash);
      assert.deepEqual(current.checkpoints, group[0].checkpoints);
      assert(current.maximumPlayers <= 1);
      assert(current.ignoredAI > 0);
      assert(current.modeCounts.MANUAL > 0 && current.modeCounts.LEARNING > 0);
    }
  }
  for (const classId of ['sedan', 'compact']) {
    for (const scenario of ['AUTO', 'MANUAL', 'LEARNING'])
      report.parity.push(await run(1, 0, false, { scenario, classId }));
    const group = report.parity.filter((run) => run.classId === classId);
    for (const current of group) {
      assert.equal(current.decisionDigest, group[0].decisionDigest);
      assert.equal(current.finalPhysicalHash, group[0].finalPhysicalHash);
      assert.deepEqual(current.checkpoints, group[0].checkpoints);
    }
    const concurrent = await run(2, 0, false, { scenario: 'HANDOFF', classId, concurrent: true }),
      selected = await run(2, 0, false, { scenario: 'HANDOFF', classId, concurrent: false });
    assert.equal(concurrent.decisionDigest, selected.decisionDigest);
    assert.equal(concurrent.finalPhysicalHash, selected.finalPhysicalHash);
    assert.deepEqual(concurrent.checkpoints, selected.checkpoints);
    report.handoff.push(concurrent, selected);
    report.rejections.push(await rejection(classId));
    report.expiry.push(await expiry(classId));
  }
  const exactKeys = [
    'decisionDigest',
    'rawPlayerDigest',
    'checkpoints',
    'finalPhysicalHash',
    'clearCalls',
    'modeCounts',
    'transitions',
    'transitionCounts',
    'ignoredAI',
    'ignoredPLAYER',
    'maximumPlayers',
    'createdFilters',
    'disposedFilters',
    'drivingPoseWrites',
    'drivingVelocityWrites',
  ];
  for (const channel of ['runs', 'parity', 'handoff', 'rejections', 'expiry']) {
    assert.equal(report[channel].length, baseline[channel].length);
    for (let i = 0; i < report[channel].length; i++) {
      const current = report[channel][i],
        before = baseline[channel][i];
      const keys =
        channel === 'rejections' || channel === 'expiry' ? Object.keys(before) : exactKeys;
      for (const key of keys)
        assert.deepEqual(current[key], before[key], `Immutable BEFORE ${channel}[${i}] ${key}`);
    }
  }
  for (const count of [70, 110]) {
    const pairs = report.runs
      .filter((r) => r.count === count && r.observer)
      .map((current) => {
        const before = baseline.runs.find(
          (r) => r.count === count && r.pair === current.pair && r.observer,
        );
        const deltaMs = current.tickMs.p95 - before.tickMs.p95;
        return {
          pair: current.pair,
          beforeP95: before.tickMs.p95,
          afterP95: current.tickMs.p95,
          deltaMs,
          ratio: current.tickMs.p95 / before.tickMs.p95,
          regression: deltaMs > 1 && current.tickMs.p95 > before.tickMs.p95 * 1.1,
          ownStageP95: current.modeControlsMs.p95,
        };
      });
    report.comparisons.push({
      count,
      pairs,
      regressedPairs: pairs.filter((p) => p.regression).length,
    });
    assert(
      pairs.filter((p) => p.regression).length < 3,
      `Relative ${count} >10% AND >1ms in >=3/5 pairs`,
    );
  }
  for (const input of inputs)
    assert.equal(hash(await readFile(input.path)), input.sha256, 'Source changed during AFTER');
  assert.equal(hash(await readFile(nativePath)), nativeArtifact.sha256);
  assert.equal(hash(await readFile(`${folder}/${nativeRelative}`)), nativeArtifact.sha256);
  for (const path of [
    'src/input/mode-controls.ts',
    'src/input/mode-keyboard.ts',
    'src/ui/control-mode-hud.ts',
  ])
    assert.equal(await exists(path), true, '067 production disappeared during AFTER');
  assert(
    report.runs.filter((r) => r.count === 70 && r.observer).every((r) => r.tickMs.p95 <= 5.5),
    'Normal70 provisional5.5ms',
  );
  assert(
    report.runs.every((r) => Object.keys(r.transitionCounts).length === 6),
    'All six transition edges exercised',
  );
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.failure = { message: String(error.message), stack: String(error.stack) };
  throw error;
} finally {
  report.capturedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(
    JSON.stringify({
      status: report.status,
      sourceHash: report.sourceHash,
      runs: report.runs.length,
      parity: report.parity.length,
      handoff: report.handoff.length,
      rejections: report.rejections.length,
      expiry: report.expiry.length,
    }),
  );
}
