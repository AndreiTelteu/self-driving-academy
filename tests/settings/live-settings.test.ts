import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSettingsStore,
  createDefaultSettings,
  getControlPreferencesVersion,
  type RuntimeSettings,
} from '../../src/settings';
import { createLiveSettings } from '../../src/app';
import {
  GAME_SETTINGS_COMFORT_FIELDS,
  KEY_REMAPPING_ACTIONS,
  STYLE_SLIDER_FIELDS,
  projectGameSettings,
  projectKeyRemapping,
  setBinding,
  setComfortValues,
  setDisplayUnits,
  setStyleSliderValue,
} from '../../src/ui';
import { createStyleWorld, STYLE_PLAYER } from '../app/style-sliders-fixture';

function fixture() {
  const settings = createDefaultSettings(STYLE_PLAYER),
    store = createSettingsStore(settings),
    world = createStyleWorld({
      profileId: 'profile-279',
      sessionId: 'session-279',
      learningEpoch: 3,
    }),
    saves: RuntimeSettings[] = [],
    versionsBefore = world.versions(),
    runtime = createLiveSettings({
      store,
      playerId: STYLE_PLAYER,
      tick: () => world.tick.value,
      style: {
        playerId: STYLE_PLAYER,
        profileId: world.profileId,
        engineVersion: world.store.engineVersion,
        store: world.store,
        barrier: world.barrier,
        activation: world.activation,
        readTarget: () => ({
          sessionId: world.target.sessionId,
          worldEpoch: world.target.worldEpoch,
          playerId: STYLE_PLAYER,
          profileId: world.profileId,
          baseVersionId: world.barrier.current().baseVersionId,
          learningEpoch: world.barrier.current().learningEpoch,
        }),
      },
      onSettingsSaved: (saved) => saves.push(saved),
    });
  return { settings, store, world, saves, versionsBefore, runtime };
}

test('279 opens the three real drafts and lists every action and slider', () => {
  const { runtime, world } = fixture();
  try {
    assert.equal(runtime.open(), 'OPENED');
    const state = runtime.getState();
    assert.notEqual(state.settingsDraft, null);
    assert.notEqual(state.keyDraft, null);
    assert.notEqual(state.styleDraft, null);
    assert.equal(state.styleAvailable, true);
    assert.equal(Object.keys(state.keyDraft!.proposed).length, 15);
    assert.equal(GAME_SETTINGS_COMFORT_FIELDS.length, 7);
    assert.equal(STYLE_SLIDER_FIELDS.length, 8);
    assert.equal(KEY_REMAPPING_ACTIONS.length, 15);
    assert.equal(runtime.getStats().profileTouchedByDeviceSettings, 0);
    assert.equal(runtime.getStats().xpWrites, 0);
    assert.equal(world.versions().length, 1);
  } finally {
    runtime.dispose();
    world.dispose();
  }
});

test('279 conflicts block key saving and leave the settings record untouched', () => {
  const { runtime, store, world, versionsBefore } = fixture();
  try {
    runtime.open();
    const draft = setBinding(runtime.getKeyDraft()!, 'brake', 'KeyW').draft;
    runtime.adoptKeys(draft);
    const view = projectKeyRemapping(runtime.getKeyDraft()!);
    assert.equal(view.saveState, 'CONFLICT');
    const result = runtime.saveKeys();
    assert.equal(result.status, 'REJECTED');
    if (result.status === 'REJECTED') assert.equal(result.reason, 'CONFLICT');
    assert.equal(store.getSnapshot().input.bindings.brake, 'KeyS');
    assert.deepEqual(world.versions(), versionsBefore);
    assert.equal(
      getControlPreferencesVersion(store.getSnapshot()),
      getControlPreferencesVersion(createDefaultSettings(STYLE_PLAYER)),
    );
  } finally {
    runtime.dispose();
    world.dispose();
  }
});

test('279 a valid remap saves only bindings and remaps live input through the callback', () => {
  const { runtime, store, world, saves, versionsBefore } = fixture();
  try {
    runtime.open();
    const beforeControl = store.getSnapshot().input.control;
    runtime.adoptKeys(setBinding(runtime.getKeyDraft()!, 'brake', 'ArrowDown').draft);
    const result = runtime.saveKeys();
    assert.equal(result.status, 'SAVED');
    const saved = store.getSnapshot();
    assert.equal(saved.input.bindings.brake, 'ArrowDown');
    assert.equal(saved.input.bindings.throttle, 'KeyW');
    assert.deepEqual(saved.input.control, beforeControl);
    assert.equal(saves.length, 1);
    assert.deepEqual(world.versions(), versionsBefore);
  } finally {
    runtime.dispose();
    world.dispose();
  }
});

test('279 units and camera save as presentation only; a comfort change bumps control once', () => {
  const { runtime, store, world, saves, versionsBefore } = fixture();
  try {
    runtime.open();
    const initialControl = store.getSnapshot().input.control;

    runtime.adoptSettings(
      setDisplayUnits(runtime.getSettingsDraft()!, { speed: 'mph', distance: 'ft' }),
    );
    assert.equal(runtime.saveSettings().status, 'SAVED');
    let saved = store.getSnapshot();
    assert.deepEqual(saved.units, { speed: 'mph', distance: 'ft' });
    assert.deepEqual(saved.input.control, initialControl);
    assert.equal(saved.input.bindings.throttle, 'KeyW');

    runtime.adoptSettings(
      setComfortValues(runtime.getSettingsDraft()!, {
        steeringSensitivity: initialControl.steeringSensitivity === 80 ? 79 : 80,
      }),
    );
    assert.equal(runtime.saveSettings().status, 'SAVED');
    saved = store.getSnapshot();
    assert.equal(saved.input.control.version, initialControl.version + 1);
    assert.notEqual(saved.input.control.steeringSensitivity, initialControl.steeringSensitivity);
    assert.equal(saves.length, 2);
    assert.deepEqual(world.versions(), versionsBefore);
    const projected = projectGameSettings(runtime.getSettingsDraft()!);
    assert.equal(projected.values.units.speed, 'mph');
  } finally {
    runtime.dispose();
    world.dispose();
  }
});

test('279 reset proposes real defaults, cancel restores saved values', () => {
  const { runtime, store, world } = fixture();
  try {
    runtime.open();
    const saved = store.getSnapshot();
    const proposed = runtime.proposeSettingsDefaults();
    assert.notEqual(proposed, null);
    assert.equal(proposed!.saved.units.speed, saved.units.speed);
    const cancelled = runtime.cancelSettings();
    assert.deepEqual(cancelled!.proposed, cancelled!.saved);
    const keys = runtime.proposeKeyDefaults();
    assert.equal(projectKeyRemapping(keys!).changed, 0);
    const keyCancel = runtime.cancelKeys();
    assert.equal(projectKeyRemapping(keyCancel!).changed, 0);
  } finally {
    runtime.dispose();
    world.dispose();
  }
});

test('279 a style apply goes through 205, publishes MANUAL_TUNING and activates through 110', () => {
  const { runtime, store, world, versionsBefore } = fixture();
  try {
    runtime.open();
    const before = world.barrier.current();
    const base = runtime.getStyleDraft()!.base.desiredAcceleration ?? 2;
    const next = base === 2.4 ? 2.2 : 2.4;
    const draft = setStyleSliderValue(runtime.getStyleDraft()!, 'desiredAcceleration', next);
    assert.notEqual(draft.proposed.desiredAcceleration, draft.base.desiredAcceleration);
    assert.equal(runtime.queueStyleApply(draft), 'QUEUED');
    runtime.close();

    let published = null;
    for (let index = 0; index < 8 && published === null; index += 1) {
      world.tick.value += 1;
      const result = runtime.step(world.tick.value);
      if (result?.status === 'PUBLISHED') published = result;
    }
    assert.notEqual(published, null);
    assert.equal(published!.activation?.origin, 'MANUAL_TUNING');
    assert.equal(published!.changes.length, 1);
    assert.equal(published!.changes[0]!.parameterKey, 'desired_acceleration');
    assert.ok(world.barrier.current().learningEpoch > before.learningEpoch);
    assert.equal(world.barrier.barriers().length, 1);
    assert.equal(world.versions().length, versionsBefore.length + 1);

    for (let index = 0; index < 6 && world.activation.pending() !== null; index += 1) {
      world.tick.value += 1;
      runtime.step(world.tick.value);
    }
    assert.equal(world.activation.pending(), null);
    const command = world.activation.commands().at(-1);
    assert.equal(command?.origin, 'MANUAL_TUNING');
    assert.equal(world.fleetVersions().includes(published!.versionId!), true);
    assert.equal(runtime.getStats().profileTouchedByDeviceSettings, 0);
    assert.equal(runtime.getStats().xpWrites, 0);
    assert.equal(store.getSnapshot().input.bindings.throttle, 'KeyW');
  } finally {
    runtime.dispose();
    world.dispose();
  }
});
