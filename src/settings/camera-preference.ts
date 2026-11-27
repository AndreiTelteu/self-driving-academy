import { parseRuntimeSettings, type InputPreferences, type RuntimeSettings } from './contracts';

/**
 * PBI 280 — durable camera presentation preference.
 *
 * `InputPreferences.cameraMode` is a device presentation choice owned by the 009 settings contract,
 * not by a savefile/profile. The store itself is the authoritative in-memory record; this tiny
 * adapter only survives a browser reload by storing the single camera value. It never stores a
 * second settings snapshot and never writes a learned profile, ledger or simulation state.
 */
export const CAMERA_PREFERENCE_STORAGE_KEY = '009-camera-mode-v1' as const;

export type CameraModePreference = InputPreferences['cameraMode'];

export interface CameraPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A missing, unreadable or unknown value is the documented default CHASE, never a crash. */
export function readCameraModePreference(
  storage: CameraPreferenceStorage | null | undefined,
): CameraModePreference {
  if (storage === null || storage === undefined) return 'CHASE';
  try {
    const value = storage.getItem(CAMERA_PREFERENCE_STORAGE_KEY);
    return value === 'FIRST_PERSON' ? 'FIRST_PERSON' : 'CHASE';
  } catch {
    return 'CHASE';
  }
}

/** Returns false when the host refuses storage (private mode); the live preference still applies. */
export function writeCameraModePreference(
  storage: CameraPreferenceStorage | null | undefined,
  mode: CameraModePreference,
): boolean {
  if (storage === null || storage === undefined) return false;
  if (mode !== 'CHASE' && mode !== 'FIRST_PERSON') throw new Error('Invalid camera mode');
  try {
    storage.setItem(CAMERA_PREFERENCE_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

/** Applies exactly the camera field; every other 009 field is preserved and revalidated. */
export function withCameraModePreference(
  settings: RuntimeSettings,
  mode: CameraModePreference,
): RuntimeSettings {
  if (mode !== 'CHASE' && mode !== 'FIRST_PERSON') throw new Error('Invalid camera mode');
  const validated = parseRuntimeSettings(settings);
  if (validated.input.cameraMode === mode) return validated;
  return parseRuntimeSettings({
    ...validated,
    input: Object.freeze({ ...validated.input, cameraMode: mode }),
  });
}
