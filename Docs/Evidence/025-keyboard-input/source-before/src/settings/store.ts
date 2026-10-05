import { requireContract } from '../sessions';
import { parseRuntimeSettings, type RuntimeSettings } from './contracts';

/** Defaults are proposed fixtures, not hardware budgets or calibrated mappings. */
export function createDefaultSettings(playerId: string, controlVersion = 0): RuntimeSettings {
  return parseRuntimeSettings({
    schemaVersion: 1,
    playerId,
    input: {
      bindings: {
        throttle: 'KeyW',
        brake: 'KeyS',
        steerLeft: 'KeyA',
        steerRight: 'KeyD',
        handbrake: 'Space',
        manualMode: 'KeyM',
        learningMode: 'KeyL',
        kpis: 'KeyK',
        fleet: 'Tab',
        signalLeft: 'KeyQ',
        signalRight: 'KeyE',
        camera: 'KeyC',
        profile: 'KeyP',
        pause: 'Escape',
        recover: 'KeyR',
      },
      cameraMode: 'CHASE',
      control: {
        schemaVersion: 1,
        version: controlVersion,
        mappingVersion: 'provisional-v1',
        steeringSensitivity: 50,
        returnRate: 50,
        speedAttenuation: 50,
        throttleRamp: 50,
        brakeRamp: 50,
        cameraMotion: 50,
        fov: 80,
      },
    },
    units: { speed: 'km/h', distance: 'm' },
    quality: { preset: 'MEDIUM', preferredBackend: 'AUTO', resolutionScale: 1, adaptive: false },
    scenario: {
      scenarioId: 'provisional-city-v1',
      mapVersion: 'provisional-v1',
      seed: 1,
      taxiCount: 24,
      civilianCount: 40,
    },
  });
}

export interface SettingsStore {
  readonly getSnapshot: () => RuntimeSettings;
  /** Complete, atomic replacement. Changed controls require a newer version. */
  readonly replace: (candidate: unknown) => RuntimeSettings;
  /** Only owns settings: no profile, progression or persistence dependency. */
  readonly reset: () => RuntimeSettings;
}

/** String identity compatible with InterventionSegment.controlPreferencesVersion. */
export function getControlPreferencesVersion(settings: RuntimeSettings): string {
  const validated = parseRuntimeSettings(settings);
  return JSON.stringify([
    validated.playerId,
    validated.input.control.mappingVersion,
    validated.input.control.version,
  ]);
}

export function createSettingsStore(initial: unknown): SettingsStore {
  let current = parseRuntimeSettings(initial);
  return Object.freeze({
    getSnapshot: () => current,
    replace: (candidate: unknown) => {
      const next = parseRuntimeSettings(candidate);
      requireContract(next.playerId === current.playerId, 'Settings belong to another player');
      const previousControl = current.input.control;
      const nextControl = next.input.control;
      requireContract(nextControl.version >= previousControl.version, 'Stale control preferences');
      const changed = Object.keys(previousControl).some(
        (key) =>
          key !== 'version' &&
          previousControl[key as keyof typeof previousControl] !==
            nextControl[key as keyof typeof nextControl],
      );
      requireContract(
        !changed || nextControl.version > previousControl.version,
        'Changed control preferences require a newer version',
      );
      if (JSON.stringify(next) === JSON.stringify(current)) return current;
      current = next;
      return current;
    },
    reset: () => {
      const defaults = createDefaultSettings(current.playerId, current.input.control.version);
      if (JSON.stringify(defaults) === JSON.stringify(current)) return current;
      const controlChanged =
        JSON.stringify(defaults.input.control) !== JSON.stringify(current.input.control);
      const next = controlChanged
        ? createDefaultSettings(current.playerId, current.input.control.version + 1)
        : defaults;
      current = next;
      return current;
    },
  });
}
