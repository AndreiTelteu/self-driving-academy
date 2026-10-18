import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDrivingProfile } from '../../src/profiles/index';
import { ContractValidationError } from '../../src/sessions/index';
import {
  createDefaultSettings,
  createSettingsStore,
  getControlPreferencesVersion,
  parseControlPreferences,
  parseInputPreferences,
  parseQualityPreferences,
  parseRuntimeSettings,
  parseScenarioConfiguration,
  parseUnitPreferences,
} from '../../src/settings/index';
import { profile } from '../contracts/fixtures';

function fixture() {
  const defaults = createDefaultSettings('player-1');
  return {
    ...defaults,
    input: {
      ...defaults.input,
      bindings: { ...defaults.input.bindings },
      control: { ...defaults.input.control },
    },
    units: { ...defaults.units },
    quality: { ...defaults.quality },
    scenario: { ...defaults.scenario },
  };
}

test('defaults and valid alternate settings round-trip as deeply frozen owned data', () => {
  const candidate = fixture();
  candidate.input.control.version = 1;
  candidate.input.control.cameraMotion = 0;
  candidate.input.control.fov = 100;
  candidate.input.bindings.throttle = 'ArrowUp';
  candidate.input.cameraMode = 'FIRST_PERSON';
  candidate.units.speed = 'mph';
  candidate.units.distance = 'ft';
  candidate.quality.preset = 'LOW';
  candidate.quality.preferredBackend = 'WEBGL2';
  candidate.quality.resolutionScale = 0.5;
  candidate.quality.adaptive = true;
  candidate.scenario.seed = 0xffffffff;
  candidate.scenario.taxiCount = 0;
  const parsed = parseRuntimeSettings(candidate);
  assert.deepEqual(parsed, candidate);
  candidate.input.control.fov = 70;
  candidate.input.bindings.throttle = 'KeyZ';
  candidate.scenario.seed = 3;
  assert.equal(parsed.input.control.fov, 100);
  assert.equal(parsed.input.bindings.throttle, 'ArrowUp');
  assert.equal(parsed.scenario.seed, 0xffffffff);
  for (const value of [
    parsed,
    parsed.input,
    parsed.input.bindings,
    parsed.input.control,
    parsed.units,
    parsed.quality,
    parsed.scenario,
  ])
    assert.ok(Object.isFrozen(value));
  assert.equal(Reflect.set(parsed.input.control, 'fov', 70), false);
  assert.deepEqual(parseRuntimeSettings(JSON.parse(JSON.stringify(parsed))), parsed);
});

test('all control sliders enforce finite UI domains, FOV degrees and version bounds', () => {
  const control = fixture().input.control;
  const sliders = [
    'steeringSensitivity',
    'returnRate',
    'speedAttenuation',
    'throttleRamp',
    'brakeRamp',
    'cameraMotion',
  ] as const;
  for (const key of sliders) {
    for (const valid of [0, 0.5, 100])
      assert.equal(parseControlPreferences({ ...control, [key]: valid })[key], valid);
    for (const invalid of [-1, 101, NaN, Infinity, '50', null]) {
      assert.throws(
        () => parseControlPreferences({ ...control, [key]: invalid }),
        ContractValidationError,
      );
    }
  }
  for (const fov of [60, 100]) assert.equal(parseControlPreferences({ ...control, fov }).fov, fov);
  for (const fov of [59.9, 100.1, Math.PI / 2])
    assert.throws(() => parseControlPreferences({ ...control, fov }), ContractValidationError);
  for (const version of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => parseControlPreferences({ ...control, version }), ContractValidationError);
  assert.throws(
    () => parseControlPreferences({ ...control, schemaVersion: 2 }),
    ContractValidationError,
  );
  assert.throws(
    () => parseControlPreferences({ ...control, mappingVersion: 'calibrated-v1' }),
    ContractValidationError,
  );
});

test('binding conflicts, unknown actions and unsupported keys are rejected', () => {
  const input = fixture().input;
  for (const throttle of ['KeyS', 'w', 'Mouse0', 'F13', ''])
    assert.throws(
      () => parseInputPreferences({ ...input, bindings: { ...input.bindings, throttle } }),
      ContractValidationError,
    );
  assert.throws(
    () => parseInputPreferences({ ...input, cameraMode: 'HOOD' }),
    ContractValidationError,
  );
  assert.throws(
    () => parseInputPreferences({ ...input, bindings: { ...input.bindings, fly: 'KeyF' } }),
    ContractValidationError,
  );
  const { pause: removed, ...missing } = input.bindings;
  assert.equal(removed, 'Escape');
  assert.throws(
    () => parseInputPreferences({ ...input, bindings: missing }),
    ContractValidationError,
  );
});

test('units, quality and launch configuration reject invalid or learned fields', () => {
  const defaults = fixture();
  assert.throws(
    () => parseUnitPreferences({ speed: 'm/s', distance: 'm' }),
    ContractValidationError,
  );
  assert.throws(
    () => parseUnitPreferences({ ...defaults.units, parameters: {} }),
    ContractValidationError,
  );
  for (const preset of ['ULTRA', null, 1])
    assert.throws(
      () => parseQualityPreferences({ ...defaults.quality, preset }),
      ContractValidationError,
    );
  for (const resolutionScale of [0.49, 1.01, NaN])
    assert.throws(
      () => parseQualityPreferences({ ...defaults.quality, resolutionScale }),
      ContractValidationError,
    );
  assert.throws(
    () => parseQualityPreferences({ ...defaults.quality, preferredBackend: 'WEBGL1' }),
    ContractValidationError,
  );
  assert.throws(
    () => parseQualityPreferences({ ...defaults.quality, adaptive: 1 }),
    ContractValidationError,
  );
  for (const seed of [-1, 0.5, 0x100000000, NaN])
    assert.throws(
      () => parseScenarioConfiguration({ ...defaults.scenario, seed }),
      ContractValidationError,
    );
  for (const key of ['taxiCount', 'civilianCount']) {
    for (const value of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
      assert.throws(
        () => parseScenarioConfiguration({ ...defaults.scenario, [key]: value }),
        ContractValidationError,
      );
  }
  assert.throws(
    () => parseScenarioConfiguration({ ...defaults.scenario, mapVersion: '' }),
    ContractValidationError,
  );
  assert.throws(
    () => parseRuntimeSettings({ ...defaults, schemaVersion: 2 }),
    ContractValidationError,
  );
  assert.throws(
    () => parseRuntimeSettings({ ...defaults, playerId: '  ' }),
    ContractValidationError,
  );
  assert.throws(
    () => parseRuntimeSettings({ ...defaults, parameters: { desired_acceleration: 6 } }),
    ContractValidationError,
  );
  assert.throws(() => parseRuntimeSettings(profile()), ContractValidationError);
  assert.throws(() => parseDrivingProfile(defaults), ContractValidationError);
});

test('data readers reject accessors and exotic objects without executing getters', () => {
  let executed = false;
  const candidate = Object.defineProperty(fixture(), 'playerId', {
    enumerable: true,
    get: () => {
      executed = true;
      return 'player-1';
    },
  });
  assert.throws(() => parseRuntimeSettings(candidate), ContractValidationError);
  assert.equal(executed, false);
  assert.throws(
    () => parseRuntimeSettings(Object.assign(Object.create({}), fixture())),
    ContractValidationError,
  );
  assert.throws(
    () => parseRuntimeSettings({ ...fixture(), [Symbol('hidden')]: true }),
    ContractValidationError,
  );
});

test('replacement is atomic, owns input copies and enforces player/control version', () => {
  const store = createSettingsStore(fixture());
  const previous = store.getSnapshot();
  const candidate = fixture();
  candidate.units.speed = 'mph';
  candidate.input.control.fov = 90;
  assert.throws(() => store.replace(candidate), ContractValidationError);
  assert.equal(store.getSnapshot(), previous);
  candidate.input.control.version = 1;
  candidate.scenario.seed = -1;
  assert.throws(() => store.replace(candidate), ContractValidationError);
  assert.equal(store.getSnapshot(), previous);
  candidate.scenario.seed = 12;
  const replaced = store.replace(candidate);
  candidate.units.speed = 'km/h';
  assert.equal(replaced.units.speed, 'mph');
  assert.throws(
    () => store.replace({ ...candidate, playerId: 'player-2' }),
    ContractValidationError,
  );
  assert.throws(() => store.replace(fixture()), ContractValidationError);
  assert.equal(store.getSnapshot(), replaced);
  assert.notEqual(getControlPreferencesVersion(previous), getControlPreferencesVersion(replaced));
  assert.notEqual(
    getControlPreferencesVersion(previous),
    getControlPreferencesVersion(createDefaultSettings('player-2')),
  );
});

test('reset restores settings independently and cannot touch profiles or progression', () => {
  const initial = fixture();
  initial.input.control.version = 5;
  initial.input.control.fov = 100;
  initial.quality.preset = 'HIGH';
  initial.scenario.taxiCount = 10;
  const saved = {
    settings: initial,
    profiles: [parseDrivingProfile(profile())],
    progress: { xpBalance: 1200, level: 4, missionIds: ['completed-1'] },
  };
  const profileReference = saved.profiles;
  const progressReference = saved.progress;
  const protectedBefore = JSON.stringify({ profiles: saved.profiles, progress: saved.progress });
  const store = createSettingsStore(saved.settings);
  const reset = store.reset();
  assert.deepEqual(reset, createDefaultSettings('player-1', 6));
  assert.equal(saved.profiles, profileReference);
  assert.equal(saved.progress, progressReference);
  assert.equal(
    JSON.stringify({ profiles: saved.profiles, progress: saved.progress }),
    protectedBefore,
  );
  assert.equal(saved.settings.input.control.fov, 100);
  assert.equal(store.reset(), reset);
  assert.equal(store.replace(reset), reset);
});

test('revision exhaustion rejects reset without changing the snapshot', () => {
  const initial = fixture();
  initial.input.control.version = Number.MAX_SAFE_INTEGER;
  initial.input.control.fov = 100;
  const store = createSettingsStore(initial);
  const previous = store.getSnapshot();
  assert.throws(() => store.reset(), ContractValidationError);
  assert.equal(store.getSnapshot(), previous);
});

test('quality and launch reset preserve control identity and stay independent of population', () => {
  const initial = fixture();
  initial.input.control.version = 3;
  initial.quality.preset = 'LOW';
  initial.scenario.taxiCount = 10;
  const store = createSettingsStore(initial);
  const before = store.getSnapshot();
  const identity = getControlPreferencesVersion(before);
  const changedQuality = store.replace({
    ...before,
    quality: { ...before.quality, preset: 'HIGH' },
  });
  assert.equal(changedQuality.scenario.taxiCount, 10);
  assert.equal(getControlPreferencesVersion(changedQuality), identity);
  const reset = store.reset();
  assert.equal(reset.input.control.version, 3);
  assert.equal(getControlPreferencesVersion(reset), identity);
  assert.equal(reset.scenario.taxiCount, 24);
});
