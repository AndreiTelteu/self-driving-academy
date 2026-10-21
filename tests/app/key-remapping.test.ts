import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { applyKeyRemapping, readKeyRemappingDraft, resetKeyRemapping } from '../../src/app';
import { parseDrivingProfile } from '../../src/profiles';
import {
  createDefaultSettings,
  createSettingsStore,
  getControlPreferencesVersion,
  parseRuntimeSettings,
} from '../../src/settings';
import type { RuntimeSettings } from '../../src/settings';
import { clearBinding, createKeyRemappingDraft, setBinding } from '../../src/ui';
import type { KeyRemappingDraft } from '../../src/ui';
import {
  KEY_PLAYER,
  customKeyDraft,
  customKeySettings,
  keyServices,
  keySettings,
} from '../ui/key-remapping-fixture';

function segments(settings: RuntimeSettings) {
  return {
    units: settings.units,
    quality: settings.quality,
    scenario: settings.scenario,
    control: settings.input.control,
    cameraMode: settings.input.cameraMode,
  };
}

test('080 readKeyRemappingDraft uses real defaults and rejects a foreign player', () => {
  const settings = customKeySettings(),
    draft = readKeyRemappingDraft(settings, KEY_PLAYER),
    defaults = createDefaultSettings(KEY_PLAYER).input.bindings;
  assert.equal(draft.playerId, KEY_PLAYER);
  assert.deepEqual(draft.bindings, settings.input.bindings);
  assert.deepEqual(draft.proposed, settings.input.bindings);
  assert.deepEqual(draft.defaults, defaults);
  assert.equal(draft.revision, 0);
  assert.throws(() => readKeyRemappingDraft(settings, 'player:other'), /another player/);
  assert.throws(() => readKeyRemappingDraft(settings, ' '), /current player/);
});

test('080 save applies the bindings and preserves units, quality, scenario and control', () => {
  const settings = customKeySettings(),
    services = keyServices(settings),
    draft = readKeyRemappingDraft(settings, KEY_PLAYER),
    changed = setBinding(draft, 'recover', 'KeyY').draft,
    identity = getControlPreferencesVersion(settings),
    result = applyKeyRemapping(services, changed);
  assert.equal(result.status, 'SAVED');
  if (result.status !== 'SAVED') return;
  const saved = result.settings;
  assert.equal(saved.input.bindings.recover, 'KeyY');
  assert.equal(saved.input.bindings.throttle, 'ArrowUp');
  assert.equal(saved.input.bindings.brake, 'KeyZ');
  assert.deepEqual(segments(saved), segments(settings));
  assert.equal(saved.input.control.version, 4);
  assert.equal(saved.input.control.fov, 90);
  assert.equal(saved.input.cameraMode, 'FIRST_PERSON');
  assert.equal(getControlPreferencesVersion(saved), identity);
  assert.equal(services.store.getSnapshot(), saved);
  assert.notEqual(saved.input.bindings, changed.proposed);
  assert.ok(Object.isFrozen(saved.input.bindings));
});

test('080 apply rejects conflicts, unsupported rows, stale drafts and foreign players', () => {
  const settings = keySettings(),
    services = keyServices(settings),
    conflict = setBinding(readKeyRemappingDraft(settings, KEY_PLAYER), 'throttle', 'KeyS').draft,
    unsupported = clearBinding(readKeyRemappingDraft(settings, KEY_PLAYER), 'pause'),
    defaults = createDefaultSettings(KEY_PLAYER).input.bindings,
    foreign = createKeyRemappingDraft({
      playerId: 'player:other',
      bindings: defaults,
      defaults,
    });
  assert.deepEqual(applyKeyRemapping(services, conflict), {
    status: 'REJECTED',
    reason: 'CONFLICT',
  });
  assert.deepEqual(applyKeyRemapping(services, unsupported), {
    status: 'REJECTED',
    reason: 'UNSUPPORTED',
  });
  assert.deepEqual(applyKeyRemapping(services, foreign), {
    status: 'REJECTED',
    reason: 'PLAYER_MISMATCH',
  });
  assert.deepEqual(applyKeyRemapping(services, { bindings: {} } as unknown as KeyRemappingDraft), {
    status: 'REJECTED',
    reason: 'INVALID_DRAFT',
  });
  assert.deepEqual(services.store.getSnapshot(), settings);
  assert.equal(settings.input.bindings.throttle, 'KeyW');
  assert.equal(settings.input.bindings.pause, 'Escape');

  const staleServices = keyServices(settings),
    staleDraft = readKeyRemappingDraft(settings, KEY_PLAYER);
  staleServices.store.replace({
    ...settings,
    units: { speed: 'mph', distance: 'ft' },
  });
  assert.deepEqual(applyKeyRemapping(staleServices, staleDraft), {
    status: 'REJECTED',
    reason: 'STALE_DRAFT',
  });
  assert.equal(staleServices.store.getSnapshot().units.speed, 'mph');
});

test('080 unchanged apply is a no-op SAVED result, not a control revision bump', () => {
  const settings = customKeySettings(),
    services = keyServices(settings),
    draft = readKeyRemappingDraft(settings, KEY_PLAYER),
    identity = getControlPreferencesVersion(settings),
    result = applyKeyRemapping(services, draft);
  assert.equal(result.status, 'SAVED');
  if (result.status !== 'SAVED') return;
  assert.equal(result.settings, services.store.getSnapshot());
  assert.equal(result.settings.input.control.version, 4);
  assert.equal(getControlPreferencesVersion(result.settings), identity);
});

test('080 reset restores exactly the binding defaults and preserves every other section', () => {
  const settings = customKeySettings(),
    services = keyServices(settings),
    identity = getControlPreferencesVersion(settings),
    saved = resetKeyRemapping(services);
  assert.deepEqual(saved.input.bindings, createDefaultSettings(KEY_PLAYER).input.bindings);
  assert.deepEqual(segments(saved), segments(settings));
  assert.equal(saved.input.control.version, 4);
  assert.equal(saved.input.control.fov, 90);
  assert.equal(saved.playerId, KEY_PLAYER);
  assert.equal(getControlPreferencesVersion(saved), identity);
  assert.equal(services.store.getSnapshot(), saved);
  assert.throws(() => resetKeyRemapping(services), /stale/);
  assert.equal(
    resetKeyRemapping({ store: services.store, settings: services.store.getSnapshot() }),
    saved,
  );
});

test('080 settings stay distinct from the learned profile and never import profile modules', () => {
  for (const file of [
    join('src', 'app', 'key-remapping.ts'),
    join('src', 'ui', 'key-remapping.ts'),
    join('src', 'ui', 'key-remapping-format.ts'),
  ]) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    assert.equal(/from\s+['"][^'"]*profiles/.test(source), false, `${file} imports profiles`);
    assert.equal(
      /parseDrivingProfile|createProfileSnapshot|profileStore|profileHistory/.test(source),
      false,
      `${file} executes a profile service`,
    );
  }
  const settings = customKeySettings(),
    services = keyServices(settings),
    saved = applyKeyRemapping(
      services,
      setBinding(readKeyRemappingDraft(settings, KEY_PLAYER), 'recover', 'KeyY').draft,
    );
  assert.equal(saved.status, 'SAVED');
  if (saved.status !== 'SAVED') return;
  assert.deepEqual(Object.keys(saved.settings).sort(), [
    'input',
    'playerId',
    'quality',
    'scenario',
    'schemaVersion',
    'units',
  ]);
  const serialized = JSON.stringify(saved.settings);
  for (const forbidden of ['parameters', 'learned', 'telemetry', 'xpBalance', 'desired_'])
    assert.equal(serialized.includes(forbidden), false, `settings contain ${forbidden}`);
  assert.throws(() => parseDrivingProfile(saved.settings), /contract|fields/i);
  const otherStore = createSettingsStore({ ...customKeySettings(), playerId: 'player:other' });
  assert.throws(() => otherStore.replace(saved.settings), /another player/i);
  assert.equal(parseRuntimeSettings(saved.settings).input.bindings.recover, 'KeyY');
  assert.equal(customKeyDraft().bindings.recover, 'KeyR');
});
