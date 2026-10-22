import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultSettings,
  createSettingsStore,
  defaultAudioPreferences,
  parseAudioPreferences,
  parseRuntimeSettings,
} from '../../src/settings';
import { ContractValidationError } from '../../src/sessions';

test('the audio levels are part of the 009 settings contract and default explicitly', () => {
  const defaults = createDefaultSettings('player-1');
  assert.deepEqual(defaults.audio, defaultAudioPreferences());
  assert.equal(defaults.audio.muted, false);
  assert.equal(defaults.audio.master, 0.8);
  assert.equal(defaults.audio.engine, 0.7);
  assert.equal(defaults.audio.impact, 0.9);
  assert.equal(defaults.audio.ui, 0.6);
  assert.ok(Object.isFrozen(defaults.audio));
});

test('legacy snapshots without the audio group receive the documented defaults', () => {
  const defaults = createDefaultSettings('player-1');
  const { audio: _audio, ...legacy } = defaults;
  const parsed = parseRuntimeSettings(legacy);
  assert.deepEqual(parsed.audio, defaultAudioPreferences());
  assert.throws(
    () => parseRuntimeSettings({ ...defaults, audio: { ...defaults.audio, master: 2 } }),
    ContractValidationError,
  );
  assert.throws(
    () => parseRuntimeSettings({ ...defaults, audio: { ...defaults.audio, muted: 'yes' } }),
    ContractValidationError,
  );
  assert.throws(
    () => parseAudioPreferences({ ...defaults.audio, schemaVersion: 2 }),
    ContractValidationError,
  );
  assert.throws(() => parseRuntimeSettings({ ...defaults, audio: 1 }), ContractValidationError);
});

test('the settings store persists the volumes without touching the control revision', () => {
  const store = createSettingsStore(createDefaultSettings('player-1'));
  const before = store.getSnapshot();
  const replaced = store.replace({
    ...before,
    audio: { ...before.audio, engine: 0.25, impact: 1, ui: 0, muted: true },
  });
  assert.equal(replaced.audio.engine, 0.25);
  assert.equal(replaced.audio.ui, 0);
  assert.equal(replaced.audio.muted, true);
  // A volume change is not a control preference change: the revision stays untouched.
  assert.equal(replaced.input.control.version, before.input.control.version);
  assert.equal(store.getSnapshot(), replaced);

  const reset = store.reset();
  assert.deepEqual(reset.audio, defaultAudioPreferences());
  assert.equal(store.getSnapshot(), reset);
});
