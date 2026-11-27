import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAMERA_PREFERENCE_STORAGE_KEY,
  createDefaultSettings,
  createSettingsStore,
  parseRuntimeSettings,
  readCameraModePreference,
  withCameraModePreference,
  writeCameraModePreference,
  type CameraPreferenceStorage,
  type RuntimeSettings,
} from '../../src/settings';

function memoryStorage(initial: Readonly<Record<string, string>> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    } satisfies CameraPreferenceStorage,
    values,
  };
}

test('280: camera preference survives a reload without touching another 009 field', () => {
  const defaults = createDefaultSettings('player-280');
  assert.equal(defaults.input.cameraMode, 'CHASE');
  const { storage, values } = memoryStorage();
  assert.equal(readCameraModePreference(storage), 'CHASE');
  assert.equal(writeCameraModePreference(storage, 'FIRST_PERSON'), true);
  assert.equal(values.get(CAMERA_PREFERENCE_STORAGE_KEY), 'FIRST_PERSON');

  const reloaded = withCameraModePreference(
    createDefaultSettings('player-280'),
    readCameraModePreference(storage),
  );
  assert.equal(reloaded.input.cameraMode, 'FIRST_PERSON');
  assert.deepEqual(reloaded.input.bindings, defaults.input.bindings);
  assert.deepEqual(reloaded.input.control, defaults.input.control);
  assert.deepEqual(reloaded.units, defaults.units);
  assert.deepEqual(reloaded.quality, defaults.quality);
  assert.deepEqual(reloaded.scenario, defaults.scenario);

  const store = createSettingsStore(reloaded);
  assert.equal(store.getSnapshot().input.cameraMode, 'FIRST_PERSON');
  const changed = store.replace(withCameraModePreference(store.getSnapshot(), 'CHASE'));
  assert.equal(changed.input.cameraMode, 'CHASE');
  assert.equal(changed.input.control.version, defaults.input.control.version);
});

test('280: missing, unknown and unavailable storage return the documented CHASE default', () => {
  assert.equal(readCameraModePreference(undefined), 'CHASE');
  assert.equal(readCameraModePreference(null), 'CHASE');
  const { storage } = memoryStorage({ [CAMERA_PREFERENCE_STORAGE_KEY]: 'SIDE' });
  assert.equal(readCameraModePreference(storage), 'CHASE');
  const throwing: CameraPreferenceStorage = {
    getItem: () => {
      throw new Error('private mode');
    },
    setItem: () => {
      throw new Error('private mode');
    },
  };
  assert.equal(readCameraModePreference(throwing), 'CHASE');
  assert.equal(writeCameraModePreference(throwing, 'FIRST_PERSON'), false);
});

test('280: the camera field validates through the real 009 parser and preserves a frozen record', () => {
  const defaults: RuntimeSettings = createDefaultSettings('player-280');
  const changed = withCameraModePreference(defaults, 'FIRST_PERSON');
  assert.equal(changed.input.cameraMode, 'FIRST_PERSON');
  assert.equal(Object.isFrozen(changed), true);
  assert.equal(Object.isFrozen(changed.input), true);
  assert.deepEqual(parseRuntimeSettings(changed), changed);
  assert.throws(() => withCameraModePreference(defaults, 'SIDE' as never), /Invalid camera mode/);
});
