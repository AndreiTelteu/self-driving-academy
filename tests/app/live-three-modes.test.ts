import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAmbientTraffic,
  createCompositionWorld,
  createLiveModeSegments,
  createV3Composition,
  readLiveModeHud,
  type AmbientTraffic,
  type CompositionWorld,
  type LiveModeSegments,
  type V3Composition,
} from '../../src/app';
import { createDefaultSettings } from '../../src/settings';

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '271-live-three-modes',
  worldEpoch: 1,
});

interface Fixture {
  readonly world: CompositionWorld;
  readonly ambient: AmbientTraffic;
  readonly model: V3Composition;
  readonly segments: LiveModeSegments;
}

function fixture(learningEligible = true): Fixture {
  const world = createCompositionWorld();
  const ambient = createAmbientTraffic({
    map: world.map,
    graph: world.graph,
    context: CONTEXT,
    seed: 271,
    focus: { x: world.spawn.x, z: world.spawn.z },
    avoid: [
      { x: world.spawn.x, z: world.spawn.z },
      ...world.vehicles.map((vehicle) => ({
        x: vehicle.positionM.x,
        z: vehicle.positionM.z,
      })),
    ],
  });
  const modelRef: { current: V3Composition | undefined } = { current: undefined };
  const segments = createLiveModeSegments({
    context: CONTEXT,
    playerId: 'player:271',
    profileId: 'profile:271',
    baseVersionId: 'profile:271@1',
    learningEpoch: 0,
    controlPreferencesVersion: 'control-1',
    engineVersion: 'engine-271',
    mapVersion: world.map.mapId,
    learningEligible,
    readAuthority: () => {
      if (modelRef.current === undefined)
        return { tick: 0, playerVehicleId: null, mode: 'AUTO' as const, suspended: false };
      return modelRef.current.modeAuthority();
    },
  });
  const model = createV3Composition({
    layout: world.layout,
    start: world.spawn,
    control: createDefaultSettings('271-test').input.control,
    context: CONTEXT,
    vehicles: world.vehicles,
    traffic: ambient.traffic,
    map: world.map,
    graph: world.graph,
  });
  modelRef.current = model;
  model.attachModeSegments(segments);
  return { world, ambient, model, segments };
}

function close(f: Fixture): void {
  f.segments.dispose();
  f.model.dispose();
  f.ambient.dispose();
}

function vehicleOf(f: Fixture, vehicleId: string) {
  return f.model.frame.vehicles.find((vehicle) => vehicle.vehicleId === vehicleId)!;
}

interface Physical {
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly speedMps: number;
  readonly yawRad: number;
}

function physicalOf(f: Fixture, vehicleId: string): Physical {
  const vehicle = vehicleOf(f, vehicleId);
  return {
    positionM: { ...vehicle.positionM },
    speedMps: Math.abs(vehicle.speedMps),
    yawRad: vehicle.yawRad,
  };
}

function assertContinuity(
  before: Physical,
  after: Physical,
  options: Readonly<{ exactSpeed: boolean; speedTolerance?: number }>,
): void {
  const speedDelta = Math.abs(after.speedMps - before.speedMps);
  if (options.exactSpeed) assert.ok(speedDelta <= 1e-9, `speed changed by ${speedDelta}`);
  else assert.ok(speedDelta <= (options.speedTolerance ?? 0.05), `speed jump ${speedDelta}`);
  const headingDelta = Math.atan2(
    Math.sin(after.yawRad - before.yawRad),
    Math.cos(after.yawRad - before.yawRad),
  );
  assert.ok(Math.abs(headingDelta) <= 1e-6, `heading jump ${headingDelta}`);
  const step = Math.hypot(
    after.positionM.x - before.positionM.x,
    after.positionM.y - before.positionM.y,
    after.positionM.z - before.positionM.z,
  );
  const expected = before.speedMps / 60;
  assert.ok(
    Math.abs(step - expected) <= Math.max(1e-3, expected * 0.02),
    `position step ${step} m, expected ${expected} m`,
  );
}

interface TransitionRecord {
  readonly from: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly to: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly action: 'M' | 'L';
  readonly closed: ReturnType<LiveModeSegments['observe']>['lastClosed'];
  readonly opened: ReturnType<LiveModeSegments['observe']>['active'];
  readonly before: Physical;
  readonly after: Physical;
}

function transition(
  f: Fixture,
  vehicleId: string,
  action: 'M' | 'L',
  exactSpeed: boolean,
): TransitionRecord {
  const beforeFrame = f.model.frame;
  const from: 'AUTO' | 'MANUAL' | 'LEARNING' =
    f.model.playerVehicleId() === vehicleId ? vehicleOf(f, vehicleId).controlMode : 'AUTO';
  const beforeActive = f.segments.observe().active;
  const before = physicalOf(f, vehicleId);
  assert.equal(f.model.requestModeAction(action), true);
  const atTick = beforeFrame.tick + 1;
  f.model.step({ tick: atTick });
  const state = f.segments.observe();
  const closed = state.lastClosed;
  const opened = state.active;
  const after = physicalOf(f, vehicleId);
  assertContinuity(before, after, { exactSpeed });
  const expected =
    action === 'M'
      ? from === 'AUTO'
        ? 'MANUAL'
        : 'AUTO'
      : from === 'LEARNING'
        ? 'MANUAL'
        : 'LEARNING';
  assert.notEqual(expected, from);
  assert.equal(vehicleOf(f, vehicleId).controlMode, expected);
  if (from === 'AUTO') {
    assert.equal(beforeActive, null);
  } else {
    assert.ok(closed, `closing ${from} segment missing`);
    assert.equal(closed.endTick, atTick);
    assert.equal(closed.closeReason, expected === 'AUTO' ? 'RETURN_TO_AUTO' : 'MODE_CHANGE');
    assert.equal(closed.mode, from);
    assert.equal(closed.completeness, 'CLOSED');
  }
  if (expected === 'AUTO') {
    assert.equal(opened, null);
    assert.equal(f.model.frame.playerVehicleId, null);
  } else {
    assert.ok(opened, `opening ${expected} segment missing`);
    assert.equal(opened.startTick, atTick);
    assert.equal(opened.mode, expected);
    assert.equal(opened.completeness, 'OPEN');
    assert.equal(opened.learningEligible, expected === 'LEARNING' && state.learning.eligible);
    assert.equal(opened.vehicleId, vehicleId);
    assert.ok(opened.context !== null);
    assert.equal(opened.context.classId, vehicleOf(f, vehicleId).classId);
    assert.equal(opened.context.positionM.x, before.positionM.x);
    assert.equal(opened.context.positionM.z, before.positionM.z);
    assert.equal(
      opened.context.appliedProfileVersion,
      vehicleOf(f, vehicleId).appliedProfileVersion,
    );
    assert.equal(opened.playerId, 'player:271');
    assert.equal(opened.profileId, 'profile:271');
    assert.equal(opened.baseVersionId, 'profile:271@1');
    const players = f.model.frame.vehicles.filter((vehicle) => vehicle.controlMode !== 'AUTO');
    assert.equal(players.length, 1);
    assert.equal(players[0]!.vehicleId, vehicleId);
  }
  return { from, to: expected, action, closed, opened, before, after };
}

function runMatrix(vehicleId: string, exactAll: boolean): readonly TransitionRecord[] {
  const f = fixture(true);
  try {
    f.model.step({ tick: 1 });
    f.model.selectVehicle(vehicleId);
    // Build a real moving state before the first boundary.
    if (vehicleOf(f, vehicleId).controlMode === 'AUTO') {
      for (let tick = 2; tick <= 20; tick += 1) f.model.step({ tick });
    }
    const records: TransitionRecord[] = [];
    records.push(transition(f, vehicleId, 'M', exactAll)); // AUTO -> MANUAL
    f.model.port.setAction('throttle', true);
    for (let tick = 0; tick < 20; tick += 1) f.model.step({ tick: f.model.frame.tick + 1 });
    f.model.port.setAction('throttle', false);
    records.push(transition(f, vehicleId, 'M', !exactAll)); // MANUAL -> AUTO
    records.push(transition(f, vehicleId, 'L', exactAll)); // AUTO -> LEARNING
    records.push(transition(f, vehicleId, 'L', exactAll)); // LEARNING -> MANUAL
    records.push(transition(f, vehicleId, 'L', exactAll)); // MANUAL -> LEARNING
    records.push(transition(f, vehicleId, 'M', exactAll)); // LEARNING -> AUTO
    const final = f.segments.observe();
    assert.equal(final.active, null);
    assert.equal(final.dispatch.profilePublications, 0);
    assert.equal(final.learning.profilePublications, 0);
    const learning = final.learning.segments;
    assert.ok(learning.length >= 1);
    for (const segment of learning) {
      assert.equal(segment.mode, 'LEARNING');
      assert.equal(segment.learningEligible, true);
      assert.equal(segment.completeness, 'CLOSED');
    }
    assert.ok(final.learning.descriptors.length >= 1);
    assert.equal(final.learning.workspace, 'TELEMETRY_272');
    return records;
  } finally {
    close(f);
  }
}

test('271: all six taxi transitions open/close one 069 segment at the accepted tick', () => {
  const records = runMatrix('taxi-01', true);
  assert.deepEqual(
    records.map((record) => `${record.from}->${record.to}:${record.action}`),
    [
      'AUTO->MANUAL:M',
      'MANUAL->AUTO:M',
      'AUTO->LEARNING:L',
      'LEARNING->MANUAL:L',
      'MANUAL->LEARNING:L',
      'LEARNING->AUTO:M',
    ],
  );
});

test('271: all six civilian transitions preserve route/class/profile and one PLAYER seat', () => {
  const f = fixture(true);
  try {
    f.model.step({ tick: 1 });
    const target = f.ambient.list().find((actor) => actor.driverKind === 'CIVILIAN')!;
    const routeBefore = [...f.ambient.get(target.vehicleId)!.route.path];
    const records = [
      (() => {
        f.model.selectVehicle(target.vehicleId);
        return transition(f, target.vehicleId, 'M', false);
      })(),
      transition(f, target.vehicleId, 'M', false),
      transition(f, target.vehicleId, 'L', false),
      transition(f, target.vehicleId, 'L', false),
      transition(f, target.vehicleId, 'L', false),
      transition(f, target.vehicleId, 'M', false),
    ];
    assert.equal(records.length, 6);
    assert.equal(records[0]!.opened?.vehicleId, target.vehicleId);
    assert.deepEqual(f.ambient.get(target.vehicleId)!.route.path, routeBefore);
    assert.equal(f.model.frame.playerVehicleId, null);
    assert.equal(
      f.model.frame.vehicles.filter((vehicle) => vehicle.controlMode !== 'AUTO').length,
      0,
    );
  } finally {
    close(f);
  }
});

test('271: ineligible LEARNING still opens a real segment but exposes no learnable evidence', () => {
  const f = fixture(false);
  try {
    f.model.step({ tick: 1 });
    f.model.selectVehicle('taxi-01');
    const record = transition(f, 'taxi-01', 'L', true);
    assert.equal(record.opened?.learningEligible, false);
    assert.equal(record.opened?.mode, 'LEARNING');
    f.model.requestModeAction('M');
    f.model.step({ tick: f.model.frame.tick + 1 });
    const exposure = f.segments.learningExposure();
    assert.equal(exposure.eligible, false);
    assert.equal(exposure.segments.length, 0);
    assert.equal(exposure.profilePublications, 0);
  } finally {
    close(f);
  }
});

test('271: M/L HUD labels use the mandated texts and symbols', () => {
  assert.deepEqual(readLiveModeHud('AUTO', true), {
    symbol: 'AI',
    label: 'Conduce AI-ul',
    manualAction: 'M · Manual',
    learningAction: 'L · Learning',
    eligibility: 'Eligibil pentru învățare',
  });
  assert.equal(readLiveModeHud('MANUAL', false).label, 'Conduci · învățare oprită');
  assert.equal(readLiveModeHud('LEARNING', true).label, 'Conduci · orașul învață');
  assert.equal(readLiveModeHud(null, null, true).label, 'Pe jos · M în mașină');
});

test('271: pause does not fabricate a tick or close an open segment', () => {
  const f = fixture(true);
  try {
    f.model.step({ tick: 1 });
    f.model.selectVehicle('taxi-01');
    transition(f, 'taxi-01', 'M', true);
    const before = f.segments.observe();
    assert.ok(before.active);
    // 070 suspension admits no composition step; the segment keeps its start tick and open state.
    const after = f.segments.observe();
    assert.equal(after.active?.segmentId, before.active?.segmentId);
    assert.equal(after.active?.startTick, before.active?.startTick);
    assert.equal(after.acceptedTick, before.acceptedTick);
  } finally {
    close(f);
  }
});

test('271: a released car keeps its route and AUTO resumes from its physical pose', () => {
  const f = fixture(true);
  try {
    f.model.step({ tick: 1 });
    f.model.selectVehicle('taxi-01');
    transition(f, 'taxi-01', 'M', true);
    f.model.port.setAction('throttle', true);
    for (let tick = 0; tick < 60; tick += 1) f.model.step({ tick: f.model.frame.tick + 1 });
    f.model.port.setAction('throttle', false);
    const route = [...vehicleOf(f, 'taxi-01').routeLaneIds];
    const position = { ...vehicleOf(f, 'taxi-01').positionM };
    const record = transition(f, 'taxi-01', 'M', false);
    assert.equal(record.to, 'AUTO');
    assert.deepEqual(vehicleOf(f, 'taxi-01').routeLaneIds, route);
    assert.ok(
      Math.hypot(
        vehicleOf(f, 'taxi-01').positionM.x - position.x,
        vehicleOf(f, 'taxi-01').positionM.z - position.z,
      ) < 1,
    );
    const start = physicalOf(f, 'taxi-01');
    for (let tick = 0; tick < 20; tick += 1) f.model.step({ tick: f.model.frame.tick + 1 });
    const resumed = physicalOf(f, 'taxi-01');
    assert.ok(resumed.speedMps > 0 || start.speedMps > 0);
    assert.ok(
      Math.hypot(resumed.positionM.x - start.positionM.x, resumed.positionM.z - start.positionM.z) >
        0.1,
      'AUTO resumes motion from the released pose',
    );
  } finally {
    close(f);
  }
});
