import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  applyGameSettings,
  gameSettingsDefaults,
  gameSettingsValuesFrom,
  readGameSettingsDraft,
  resetGameSettings,
} from '../../src/app';
import {
  createDefaultSettings,
  getControlPreferencesVersion,
  parseRuntimeSettings,
} from '../../src/settings';
import type { RuntimeSettings } from '../../src/settings';
import {
  createGameSettingsDraft,
  GAME_SETTINGS_POLICY,
  parseGameSettingsDraft,
  setCameraMode,
  setComfortValues,
  setDisplayUnits,
  setGraphics,
} from '../../src/ui';
import {
  GAME_SETTINGS_PLAYER,
  customGameDraft,
  customGameSettings,
  gameSettingsServices,
} from '../ui/game-settings-fixture';

function sections(settings: RuntimeSettings) {
  return {
    units: settings.units,
    quality: settings.quality,
    scenario: settings.scenario,
    control: settings.input.control,
    cameraMode: settings.input.cameraMode,
    bindings: settings.input.bindings,
    playerId: settings.playerId,
  };
}

test('081 readGameSettingsDraft rejects a foreign or missing current player', () => {
  const settings = customGameSettings();
  assert.throws(() => readGameSettingsDraft(settings, 'player:other'), /another player/);
  assert.throws(() => readGameSettingsDraft(settings, ' '), /current player/);
  const draft = readGameSettingsDraft(settings, GAME_SETTINGS_PLAYER);
  assert.equal(draft.playerId, GAME_SETTINGS_PLAYER);
  assert.deepEqual(draft.saved.units, settings.units);
  assert.equal(draft.saved.comfort.mappingVersion, '025-keyboard-v1');
});

test('081 units, camera and graphics apply preserves bindings, scenario, player and revision', () => {
  const settings = customGameSettings(),
    services = gameSettingsServices(settings),
    identity = getControlPreferencesVersion(settings),
    draft = setGraphics(
      setCameraMode(
        setDisplayUnits(readGameSettingsDraft(settings, GAME_SETTINGS_PLAYER), {
          speed: 'km/h',
          distance: 'm',
        }),
        'CHASE',
      ),
      { preset: 'LOW', preferredBackend: 'WEBGPU', resolutionScale: 0.5, adaptive: false },
    ),
    result = applyGameSettings(services, draft);
  assert.equal(result.status, 'SAVED');
  if (result.status !== 'SAVED') return;
  const saved = result.settings;
  assert.deepEqual(saved.input.bindings, settings.input.bindings);
  assert.equal(saved.input.bindings.throttle, 'ArrowUp');
  assert.deepEqual(saved.scenario, settings.scenario);
  assert.equal(saved.playerId, GAME_SETTINGS_PLAYER);
  assert.equal(saved.units.speed, 'km/h');
  assert.equal(saved.units.distance, 'm');
  assert.equal(saved.input.cameraMode, 'CHASE');
  assert.equal(saved.quality.preset, 'LOW');
  assert.equal(saved.quality.preferredBackend, 'WEBGPU');
  assert.equal(saved.quality.resolutionScale, 0.5);
  assert.equal(saved.quality.adaptive, false);
  assert.equal(saved.input.control.version, 4, 'units/camera/graphics never bump the revision');
  assert.equal(getControlPreferencesVersion(saved), identity);
  assert.equal(services.store.getSnapshot(), saved);
  assert.ok(Object.isFrozen(saved));
});

test('081 a comfort change bumps the control revision exactly once per save', () => {
  const settings = customGameSettings(),
    services = gameSettingsServices(settings),
    draft = setComfortValues(readGameSettingsDraft(settings, GAME_SETTINGS_PLAYER), {
      fov: 95,
      brakeRamp: 30,
    }),
    first = applyGameSettings(services, draft);
  assert.equal(first.status, 'SAVED');
  if (first.status !== 'SAVED') return;
  assert.equal(first.settings.input.control.version, 5);
  assert.equal(first.settings.input.control.fov, 95);
  assert.equal(first.settings.input.control.brakeRamp, 30);
  assert.equal(first.settings.input.bindings.throttle, 'ArrowUp');

  const secondServices = { store: services.store, settings: first.settings },
    second = applyGameSettings(
      secondServices,
      setComfortValues(readGameSettingsDraft(first.settings, GAME_SETTINGS_PLAYER), {
        cameraMotion: 10,
      }),
    );
  assert.equal(second.status, 'SAVED');
  if (second.status !== 'SAVED') return;
  assert.equal(second.settings.input.control.version, 6);

  const cameraOnly = applyGameSettings(
    { store: services.store, settings: second.settings },
    setCameraMode(readGameSettingsDraft(second.settings, GAME_SETTINGS_PLAYER), 'FIRST_PERSON'),
  );
  assert.equal(cameraOnly.status, 'SAVED');
  if (cameraOnly.status !== 'SAVED') return;
  assert.equal(cameraOnly.settings.input.control.version, 6, 'camera mode is not a control change');
  assert.equal(cameraOnly.settings.input.cameraMode, 'FIRST_PERSON');
});

test('081 an identical draft is a no-op and writes no new snapshot', () => {
  const settings = customGameSettings(),
    services = gameSettingsServices(settings),
    identity = getControlPreferencesVersion(settings),
    result = applyGameSettings(services, readGameSettingsDraft(settings, GAME_SETTINGS_PLAYER));
  assert.equal(result.status, 'SAVED');
  if (result.status !== 'SAVED') return;
  assert.equal(result.settings, services.store.getSnapshot());
  assert.deepEqual(result.settings, settings);
  assert.equal(result.settings.input.control.version, 4);
  assert.equal(getControlPreferencesVersion(result.settings), identity);
});

test('081 reset restores display/camera/comfort/graphics defaults and preserves bindings', () => {
  const settings = customGameSettings(),
    services = gameSettingsServices(settings),
    saved = resetGameSettings(services),
    defaults = createDefaultSettings(GAME_SETTINGS_PLAYER);
  assert.deepEqual(saved.input.bindings, settings.input.bindings);
  assert.deepEqual(saved.input.bindings, {
    ...defaults.input.bindings,
    throttle: 'ArrowUp',
    brake: 'KeyZ',
  });
  assert.equal(saved.input.bindings.throttle, 'ArrowUp');
  assert.deepEqual(saved.scenario, settings.scenario);
  assert.equal(saved.playerId, GAME_SETTINGS_PLAYER);
  assert.deepEqual(saved.units, defaults.units);
  assert.equal(saved.units.speed, 'km/h');
  assert.equal(saved.units.distance, 'm');
  assert.equal(saved.input.cameraMode, 'CHASE');
  assert.equal(saved.input.control.fov, 80);
  assert.equal(saved.input.control.steeringSensitivity, 50);
  assert.equal(saved.input.control.cameraMotion, 50);
  assert.equal(saved.input.control.mappingVersion, '025-keyboard-v1');
  assert.equal(saved.input.control.version, 5, 'a comfort reset bumps once');
  assert.deepEqual(saved.quality, defaults.quality);
  assert.equal(services.store.getSnapshot(), saved);
  assert.equal(
    resetGameSettings({ store: services.store, settings: services.store.getSnapshot() }),
    saved,
  );
  assert.throws(() => resetGameSettings({ store: services.store, settings }), /stale/);
});

test('081 invalid, foreign and stale drafts are rejected without mutating the store', () => {
  const settings = customGameSettings(),
    services = gameSettingsServices(settings),
    invalid = applyGameSettings(
      services,
      setComfortValues(readGameSettingsDraft(settings, GAME_SETTINGS_PLAYER), { fov: 120 }),
    );
  assert.deepEqual(invalid, { status: 'REJECTED', reason: 'INVALID_DRAFT' });
  assert.deepEqual(services.store.getSnapshot(), settings);
  assert.deepEqual(applyGameSettings(services, {} as never), {
    status: 'REJECTED',
    reason: 'INVALID_DRAFT',
  });
  assert.deepEqual(
    applyGameSettings(services, {
      ...customGameDraft(),
      proposed: {
        ...customGameDraft().proposed,
        comfort: { ...customGameDraft().proposed.comfort, fov: 101 },
      },
    }),
    { status: 'REJECTED', reason: 'INVALID_DRAFT' },
  );

  const other = createDefaultSettings('player:other'),
    foreign = applyGameSettings(
      services,
      createGameSettingsDraft({
        playerId: 'player:other',
        saved: gameSettingsValuesFrom(other),
        defaults: gameSettingsDefaults('player:other', other.input.control),
      }),
    );
  assert.deepEqual(foreign, { status: 'REJECTED', reason: 'PLAYER_MISMATCH' });

  const staleServices = gameSettingsServices(settings),
    staleDraft = readGameSettingsDraft(settings, GAME_SETTINGS_PLAYER);
  staleServices.store.replace({ ...settings, units: { speed: 'km/h', distance: 'm' } });
  assert.deepEqual(applyGameSettings(staleServices, staleDraft), {
    status: 'REJECTED',
    reason: 'STALE_DRAFT',
  });
  assert.equal(staleServices.store.getSnapshot().units.speed, 'km/h');
});

test('081 a comfort change at the maximum revision is refused as CONTROL_VERSION', () => {
  const defaults = createDefaultSettings(GAME_SETTINGS_PLAYER),
    settings = parseRuntimeSettings({
      ...defaults,
      input: {
        ...defaults.input,
        control: { ...defaults.input.control, version: Number.MAX_SAFE_INTEGER },
      },
    }),
    services = gameSettingsServices(settings),
    valid = parseGameSettingsDraft(
      setComfortValues(readGameSettingsDraft(settings, GAME_SETTINGS_PLAYER), { fov: 90 }),
    ),
    rejected = applyGameSettings(services, valid);
  assert.deepEqual(rejected, { status: 'REJECTED', reason: 'CONTROL_VERSION' });
  assert.deepEqual(services.store.getSnapshot(), settings);
  const unitsOnly = applyGameSettings(
    services,
    setDisplayUnits(readGameSettingsDraft(settings, GAME_SETTINGS_PLAYER), { speed: 'mph' }),
  );
  assert.equal(unitsOnly.status, 'SAVED');
  if (unitsOnly.status !== 'SAVED') return;
  assert.equal(unitsOnly.settings.input.control.version, Number.MAX_SAFE_INTEGER);
});

test('081 settings stay distinct from profiles, fleet style and AI', () => {
  for (const file of [
    join('src', 'app', 'game-settings.ts'),
    join('src', 'ui', 'game-settings.ts'),
    join('src', 'ui', 'game-settings-format.ts'),
  ]) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    assert.equal(/from\s+['"][^'"]*profiles/.test(source), false, `${file} imports profiles`);
    assert.equal(/from\s+['"][^'"]*fleet/.test(source), false, `${file} imports fleet`);
    assert.equal(
      /parseDrivingProfile|createProfileSnapshot|profileStore|profileHistory|fleetRegistry|applyProfile|setStyle/.test(
        source,
      ),
      false,
      `${file} executes a profile/fleet/style service`,
    );
  }
  const settings = customGameSettings(),
    services = gameSettingsServices(settings),
    saved = applyGameSettings(
      services,
      setCameraMode(
        setGraphics(readGameSettingsDraft(settings, GAME_SETTINGS_PLAYER), { preset: 'HIGH' }),
        'CHASE',
      ),
    );
  assert.equal(saved.status, 'SAVED');
  if (saved.status !== 'SAVED') return;
  assert.deepEqual(Object.keys(saved.settings).sort(), [
    'audio',
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
  assert.equal(saved.settings.input.bindings.fleet, 'Tab', 'fleet is only a key binding action');
  assert.deepEqual(sections(saved.settings).bindings, sections(settings).bindings);
  assert.equal(GAME_SETTINGS_POLICY.includes('stilul flotei'), true);
});
