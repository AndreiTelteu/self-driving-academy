import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTROL_SLIDERS_SESSION_VERSION,
  createControlSlidersSession,
  createPauseFocusOwner,
} from '../../src/app';
import type { ControlSlidersSession } from '../../src/app';
import {
  createDefaultSettings,
  createSettingsStore,
  getControlPreferencesVersion,
  KEYBOARD_MAPPING,
  parseRuntimeSettings,
  type RuntimeSettings,
} from '../../src/settings';
import { createKeyboardFilter, vehicleClass } from '../../src/vehicles';
import type { ControlPreferences } from '../../src/settings';
import { mechanicalCapabilities } from '../../src/telemetry';
import type { InterventionTarget } from '../../src/telemetry';
import { VehicleCameraController } from '../../src/rendering/vehicle-camera';
import type { CameraPreferences, CameraTarget } from '../../src/rendering/vehicle-camera';
import { segmentFixture } from '../telemetry/manual-segments-fixture';

const PLAYER = 'player';
const VERSION = 3;

function targetFor(playerId = PLAYER, version = VERSION): InterventionTarget {
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI' as const,
    sessionId: '229-tests',
    worldEpoch: 1,
    version: '069-intervention-target-v1' as const,
    playerId,
    profileId: 'profile',
    baseVersionId: 'style-v1',
    learningEpoch: 2,
    controlPreferencesVersion: `["${playerId}","025-keyboard-v1",${version}]`,
    engineVersion: 'engine',
    mapVersion: 'map',
    inputType: 'KEYBOARD' as const,
    learningEligible: true,
  });
}

interface SessionFixture {
  readonly session: ControlSlidersSession;
  readonly store: ReturnType<typeof createSettingsStore>;
  readonly settings: RuntimeSettings;
  readonly calls: string[];
  readonly heldResets: () => number;
  readonly inputApplies: { readonly version: number; readonly tick: number }[];
  readonly setSettings: (next: RuntimeSettings) => void;
  readonly current: () => RuntimeSettings;
}

function sessionFixture(
  options: Readonly<{ settings?: RuntimeSettings; target?: InterventionTarget }> = {},
): SessionFixture {
  const settings = options.settings ?? createDefaultSettings(PLAYER, VERSION),
    store = createSettingsStore(settings),
    calls: string[] = [],
    inputApplies: { version: number; tick: number }[] = [];
  let current = settings,
    held = 0;
  const pauseFocus = createPauseFocusOwner({
      suspend: (cause) => {
        calls.push(`suspend:${cause}`);
      },
      resume: (cause) => {
        calls.push(`resume:${cause}`);
      },
      resetHeldCommands: () => {
        held += 1;
      },
    }),
    session = createControlSlidersSession({
      store,
      readSettings: () => current,
      pauseFocus,
      resetHeldCommands: () => {
        held += 1;
      },
      readTarget: () => options.target ?? targetFor(),
      applyInputPreferences: (control, atTick) => {
        inputApplies.push({ version: control.version, tick: atTick });
      },
    });
  return {
    session,
    store,
    settings,
    calls,
    heldResets: () => held,
    inputApplies,
    setSettings: (next) => {
      current = next;
    },
    current: () => current,
  };
}

// ---------------------------------------------------------------------------------------------
// Pause, input release and the draft
// ---------------------------------------------------------------------------------------------

test('229 the popup suspends AUTO/MANUAL/LEARNING as a menu surface and releases input', () => {
  const fixture = sessionFixture();
  assert.equal(fixture.session.open(), 'OPENED');
  fixture.session.observeTick(7);
  const pause = fixture.session;
  assert.equal(pause.isOpen(), true);
  assert.deepEqual(fixture.calls, ['suspend:menu']);
  assert.equal(fixture.heldResets(), 1, 'the held driving commands are released once');
  assert.equal(
    JSON.stringify(fixture.store.getSnapshot()),
    JSON.stringify(fixture.settings),
    'opening the popup writes no setting',
  );
  assert.equal(fixture.session.open(), 'ALREADY_OPEN');
  assert.equal(fixture.session.close(), true);
  assert.deepEqual(fixture.calls, ['suspend:menu', 'resume:menu']);
  assert.equal(fixture.heldResets(), 2, '070 releases held commands again on resume');
  assert.equal(fixture.session.close(), false);
  fixture.session.dispose();
});

test('229 a slider draft is never applied before the next tick, then bumps one revision', () => {
  const fixture = sessionFixture(),
    original = fixture.store.getSnapshot();
  fixture.session.open();
  fixture.session.observeTick(7);
  fixture.session.setValue('fov', 95);
  assert.equal(fixture.session.queueApply(), 'QUEUED');
  assert.equal(fixture.store.getSnapshot().input.control.fov, original.input.control.fov);
  assert.equal(fixture.store.getSnapshot().input.control.version, VERSION);

  assert.equal(fixture.session.applyAtTick(7).status, 'NOT_DUE', 'never inside the same tick');
  assert.equal(fixture.store.getSnapshot().input.control.version, VERSION);

  const result = fixture.session.applyAtTick(8);
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.tick, 8);
  assert.ok(result.change);
  assert.equal(result.change.version, '069-validated-target-change-v1');
  assert.equal(result.change.reason, 'CONTROL_PREFERENCES_CHANGE');
  assert.equal(result.change.tick, 8);
  assert.equal(result.change.operationId, 'control-preferences-8');
  const saved = fixture.store.getSnapshot();
  assert.equal(saved.input.control.version, VERSION + 1);
  assert.equal(saved.input.control.fov, 95);
  assert.equal(result.change.target.controlPreferencesVersion, getControlPreferencesVersion(saved));
  assert.equal(result.change.target.learningEpoch, 2, 'preferences never bump the learning epoch');
  assert.equal(fixture.session.preparedTarget(result.change.operationId), result.change);
  assert.equal(fixture.session.preparedTarget('missing'), null);
  assert.deepEqual(fixture.inputApplies, [{ version: VERSION + 1, tick: 8 }]);
  assert.equal(fixture.session.getStats().applied, 1);
  assert.equal(fixture.session.getStats().lastAppliedTick, 8);
  assert.equal(fixture.session.applyAtTick(9).status, 'IDLE');
  assert.equal(fixture.session.getView()?.saveState, 'UNCHANGED');
  fixture.session.dispose();
});

test('229 Anulează withdraws a queued application and closing after Aplică still publishes', () => {
  const fixture = sessionFixture();
  fixture.session.open();
  fixture.session.observeTick(3);
  fixture.session.setValue('cameraMotion', 0);
  assert.equal(fixture.session.queueApply(), 'QUEUED');
  assert.equal(fixture.session.withdraw(), true);
  assert.equal(fixture.session.withdraw(), false);
  assert.equal(fixture.session.applyAtTick(4).status, 'IDLE');
  assert.equal(fixture.store.getSnapshot().input.control.cameraMotion, 50);

  assert.equal(fixture.session.queueApply(), 'QUEUED');
  fixture.session.close();
  const applied = fixture.session.applyAtTick(5);
  assert.equal(applied.status, 'APPLIED', 'closing the popup resumes the world, not the apply');
  assert.ok(applied.change);
  assert.equal(applied.change.tick, 5);
  assert.equal(fixture.store.getSnapshot().input.control.version, VERSION + 1);
  assert.equal(fixture.store.getSnapshot().input.control.cameraMotion, 0);
  assert.equal(fixture.session.getStats().withdrawn, 1);
  assert.equal(fixture.session.getStats().applied, 1);
  fixture.session.dispose();
});

test('229 no-op applies and stale settings are closed refusals', () => {
  const fixture = sessionFixture();
  assert.equal(fixture.session.queueApply(), 'NOT_OPEN');
  fixture.session.open();
  assert.equal(fixture.session.queueApply(), 'UNCHANGED', 'nothing changed, nothing queued');
  assert.equal(fixture.store.getSnapshot().input.control.version, VERSION);

  fixture.session.setValue('throttleRamp', 70);
  assert.equal(fixture.session.queueApply(), 'QUEUED');
  const changedExternally = parseRuntimeSettings({
    ...fixture.current(),
    input: {
      ...fixture.current().input,
      control: { ...fixture.current().input.control, version: VERSION + 1, fov: 70 },
    },
  });
  fixture.store.replace(changedExternally);
  fixture.setSettings(changedExternally);
  const result = fixture.session.applyAtTick(1);
  assert.equal(result.status, 'STALE_SETTINGS');
  assert.equal(result.change, null);
  assert.equal(fixture.store.getSnapshot().input.control.version, VERSION + 1);
  assert.equal(
    fixture.store.getSnapshot().input.control.fov,
    70,
    'the newer value is never overwritten',
  );
  assert.equal(fixture.session.getStats().stale, 1);
  fixture.session.dispose();
});

test('229 an apply on a foreign telemetry target is refused without a partial write', () => {
  const fixture = sessionFixture({ target: targetFor('someone-else') });
  fixture.session.open();
  fixture.session.observeTick(4);
  fixture.session.setValue('returnRate', 60);
  assert.equal(fixture.session.queueApply(), 'QUEUED');
  const result = fixture.session.applyAtTick(5);
  assert.equal(result.status, 'PLAYER_MISMATCH');
  assert.equal(result.change, null);
  assert.equal(fixture.store.getSnapshot().input.control.version, VERSION);
  assert.equal(fixture.session.getStats().invalid, 1);
  fixture.session.dispose();
});

// ---------------------------------------------------------------------------------------------
// 085/069 telemetry: version in the segment, closed and reopened at the tick
// ---------------------------------------------------------------------------------------------

test('229 the applied preferences close and open the telemetry segment at the tick', () => {
  const settings = createDefaultSettings('player', VERSION),
    store = createSettingsStore(settings),
    holder: { current: ControlSlidersSession | null } = { current: null },
    f = segmentFixture({
      preparedTarget: (operationId) => holder.current?.preparedTarget(operationId) ?? null,
    }),
    oldSegment = f.apply('LEARNING').active!;
  holder.current = createControlSlidersSession({
    store,
    readSettings: () => store.getSnapshot(),
    pauseFocus: createPauseFocusOwner({ suspend: () => {}, resume: () => {} }),
    resetHeldCommands: () => {},
    readTarget: () => f.target(),
  });
  const session = holder.current;
  assert.equal(session.open(), 'OPENED');
  session.observeTick(1);
  session.setValue('steeringSensitivity', 80);
  assert.equal(session.queueApply(), 'QUEUED');
  const result = session.applyAtTick(2);
  assert.equal(result.status, 'APPLIED');
  const applied = result.change;
  assert.ok(applied);
  const view = f.apply('LEARNING', 'CONTROL_PREFERENCES_CHANGE', null, applied),
    closed = f.store.port.read(oldSegment.segmentId)!,
    opened = f.store.port.read(view.active!.segmentId)!;
  assert.equal(closed.completeness, 'CLOSED');
  assert.equal(closed.closeReason, 'CONTROL_PREFERENCES_CHANGE');
  assert.equal(closed.controlPreferencesVersion, 'keys-1');
  assert.equal(opened.completeness, 'OPEN');
  assert.equal(opened.controlPreferencesVersion, getControlPreferencesVersion(store.getSnapshot()));
  assert.equal(closed.controlPreferencesVersion === opened.controlPreferencesVersion, false);
  assert.equal(opened.learningEpoch, closed.learningEpoch, 'only the control version changes');
  assert.equal(opened.startTick, 2);
  session.dispose();
});

// ---------------------------------------------------------------------------------------------
// 025 input at the extremes, both vehicle classes, unchanged mechanics
// ---------------------------------------------------------------------------------------------

function extremes(values: 'min' | 'max'): ControlPreferences {
  const base = createDefaultSettings(PLAYER, VERSION).input.control;
  return Object.freeze({
    ...base,
    steeringSensitivity: values === 'min' ? 0 : 100,
    returnRate: values === 'min' ? 0 : 100,
    speedAttenuation: values === 'min' ? 0 : 100,
    throttleRamp: values === 'min' ? 0 : 100,
    brakeRamp: values === 'min' ? 0 : 100,
    cameraMotion: values === 'min' ? 0 : 100,
    fov: values === 'min' ? 60 : 100,
  });
}

test('229 both slider extremes stay usable on sedan and compact without changing mechanics', () => {
  const context = Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: '229-extremes',
      worldEpoch: 1,
    }),
    before = (['sedan', 'compact'] as const).map((classId) => mechanicalCapabilities(classId));
  for (const [index, classId] of (['sedan', 'compact'] as const).entries()) {
    for (const values of ['min', 'max'] as const) {
      const filter = createKeyboardFilter(context, `taxi-${classId}`, extremes(values), 0);
      filter.setAction('throttle', true);
      filter.setAction('steerRight', true);
      let tick = 0;
      for (const speedMps of [0, 40]) {
        for (let step = 0; step < 120; step += 1) {
          tick += 1;
          const frame = filter.step({ tick, dtSeconds: 1 / KEYBOARD_MAPPING.hz, speedMps });
          assert.ok(frame.command.throttle >= 0 && frame.command.throttle <= 1);
          assert.ok(frame.command.brake >= 0 && frame.command.brake <= 1);
          assert.ok(frame.command.steering >= -1 && frame.command.steering <= 1);
          assert.ok(Math.abs(frame.command.steering) <= frame.steeringFactor + 1e-9);
          assert.ok(frame.steeringFactor >= KEYBOARD_MAPPING.minimumSteeringFactor - 1e-9);
          assert.ok(Number.isFinite(frame.command.steering));
        }
      }
      filter.dispose();
    }
    assert.deepEqual(
      mechanicalCapabilities(classId),
      before[index],
      `${classId} mechanics unchanged`,
    );
    const definition = vehicleClass(classId);
    assert.equal(definition.massKg > 0, true);
    assert.equal(Object.isFrozen(definition), true);
  }
});

test('229 the camera extremes are finite, stable at motion 0 and inside the 60–100° domain', () => {
  const target: CameraTarget = Object.freeze({
    entityId: 'taxi-1',
    incarnation: 'inc-1',
    transform: Object.freeze({
      positionM: Object.freeze({ x: 0, y: 0, z: 0 }),
      rotationQuaternion: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
    }),
    speedMps: 12,
    driverEyeM: Object.freeze({ x: 0, y: 1.2, z: 0.2 }),
  });
  for (const [name, preferences] of Object.entries({
    narrow: { mode: 'FIRST_PERSON', fovDegrees: 60, motion: 0, distanceM: 5 },
    wide: { mode: 'FIRST_PERSON', fovDegrees: 100, motion: 100, distanceM: 5 },
    chaseStable: { mode: 'CHASE', fovDegrees: 80, motion: 0, distanceM: 5 },
    chaseFast: { mode: 'CHASE', fovDegrees: 80, motion: 100, distanceM: 5 },
  } as Record<string, CameraPreferences>)) {
    const controller = new VehicleCameraController(preferences);
    controller.select('taxi-1');
    const pose = controller.update(target, 1 / 60);
    assert.ok(pose);
    const radians = (preferences.fovDegrees * Math.PI) / 180;
    assert.ok(Math.abs(pose.fovRadians - radians) < 1e-12);
    assert.ok(
      pose.fovRadians >= Math.PI / 3 - 1e-9 && pose.fovRadians <= (100 * Math.PI) / 180 + 1e-9,
    );
    for (const point of [pose.positionM, pose.lookAtM, pose.up])
      assert.ok([point.x, point.y, point.z].every((value) => Number.isFinite(value)));
    if (name === 'chaseStable') {
      const next = controller.update(target, 1 / 60);
      assert.ok(next);
      assert.deepEqual(next.positionM, pose.positionM, 'motion 0 keeps the chase camera stable');
    }
  }
});

test('229 the session reports no profile, AI or mechanics ownership', () => {
  const fixture = sessionFixture();
  fixture.session.open();
  fixture.session.observeTick(0);
  fixture.session.applyPreset('ACCESSIBLE');
  assert.equal(fixture.session.queueApply(), 'QUEUED');
  const result = fixture.session.applyAtTick(1);
  assert.equal(result.status, 'APPLIED');
  const stats = fixture.session.getStats();
  assert.equal(stats.changesDrivingProfile, false);
  assert.equal(stats.changesVehicleMechanics, false);
  assert.equal(stats.changesLearnedAi, false);
  assert.equal(stats.version, CONTROL_SLIDERS_SESSION_VERSION);
  const serialized = JSON.stringify(fixture.store.getSnapshot());
  for (const forbidden of ['profileId', 'learned', 'style', 'massKg', 'engineForce'])
    assert.equal(serialized.includes(forbidden), false, `settings contain no ${forbidden}`);
  assert.equal(fixture.store.getSnapshot().input.control.version, VERSION + 1);
  fixture.session.dispose();
});

test('229 the session refuses an invalid draft and an exhausted control revision', () => {
  const fixture = sessionFixture();
  fixture.session.open();
  fixture.session.setValue('fov', 130);
  assert.equal(fixture.session.queueApply(), 'INVALID');
  assert.equal(fixture.store.getSnapshot().input.control.fov, 80);
  fixture.session.dispose();

  const exhausted = sessionFixture({
    settings: createDefaultSettings(PLAYER, Number.MAX_SAFE_INTEGER),
  });
  exhausted.session.open();
  exhausted.session.observeTick(1);
  exhausted.session.setValue('fov', 90);
  assert.equal(exhausted.session.queueApply(), 'QUEUED');
  assert.equal(exhausted.session.applyAtTick(2).status, 'INVALID');
  assert.equal(exhausted.store.getSnapshot().input.control.version, Number.MAX_SAFE_INTEGER);
  exhausted.session.dispose();
});
