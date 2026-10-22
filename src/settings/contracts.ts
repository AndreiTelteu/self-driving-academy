import { boolean, choice, fields, number, record, requireContract, text, tick } from '../sessions';

/** Versioned UI preferences; legacy provisional values require explicit upgrade for live input. */
export interface ControlPreferences {
  readonly schemaVersion: 1;
  readonly version: number;
  readonly mappingVersion: 'provisional-v1' | '025-keyboard-v1';
  readonly steeringSensitivity: number;
  readonly returnRate: number;
  readonly speedAttenuation: number;
  readonly throttleRamp: number;
  readonly brakeRamp: number;
  readonly cameraMotion: number;
  /** UI degrees; render adapters convert explicitly to radians. */
  readonly fov: number;
}

export const inputActions = [
  'throttle',
  'brake',
  'steerLeft',
  'steerRight',
  'handbrake',
  'manualMode',
  'learningMode',
  'kpis',
  'fleet',
  'signalLeft',
  'signalRight',
  'camera',
  'profile',
  'pause',
  'recover',
] as const;
export type InputAction = (typeof inputActions)[number];

export interface InputPreferences {
  readonly bindings: Readonly<Record<InputAction, string>>;
  readonly cameraMode: 'CHASE' | 'FIRST_PERSON';
  readonly control: ControlPreferences;
}

export interface UnitPreferences {
  readonly speed: 'km/h' | 'mph';
  readonly distance: 'm' | 'ft';
}

/** Presentation preferences never change physics, population, profiles or XP. */
export interface QualityPreferences {
  readonly preset: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly preferredBackend: 'AUTO' | 'WEBGPU' | 'WEBGL2';
  readonly resolutionScale: number;
  readonly adaptive: boolean;
}

/** Launch configuration, not a live world state or replay checkpoint. */
export interface ScenarioConfiguration {
  readonly scenarioId: string;
  readonly mapVersion: string;
  readonly seed: number;
  readonly taxiCount: number;
  readonly civilianCount: number;
}

/**
 * Audio preferences of the 148 audio engine.
 *
 * `master` is the only global output level and `muted` is the only global output switch; the
 * three category levels are independent mix buses (engine, impact, ui). The values are display
 * preferences: they never change the simulation, the physics or the visible information.
 */
export interface AudioPreferences {
  readonly schemaVersion: 1;
  readonly master: number;
  readonly engine: number;
  readonly impact: number;
  readonly ui: number;
  readonly muted: boolean;
}

export function defaultAudioPreferences(): AudioPreferences {
  return Object.freeze({
    schemaVersion: 1,
    master: 0.8,
    engine: 0.7,
    impact: 0.9,
    ui: 0.6,
    muted: false,
  });
}

export function parseAudioPreferences(value: unknown): AudioPreferences {
  const data = fields(value, ['schemaVersion', 'master', 'engine', 'impact', 'ui', 'muted']);
  requireContract(data.schemaVersion === 1, 'Unsupported audio preferences schema');
  return Object.freeze({
    schemaVersion: 1,
    master: number(data.master, 0, 1),
    engine: number(data.engine, 0, 1),
    impact: number(data.impact, 0, 1),
    ui: number(data.ui, 0, 1),
    muted: boolean(data.muted),
  });
}

/** Runtime settings of the player. */
export interface RuntimeSettings {
  readonly schemaVersion: 1;
  readonly playerId: string;
  readonly input: InputPreferences;
  readonly units: UnitPreferences;
  readonly quality: QualityPreferences;
  readonly scenario: ScenarioConfiguration;
  readonly audio: AudioPreferences;
}

export function parseControlPreferences(value: unknown): ControlPreferences {
  const data = fields(value, [
    'schemaVersion',
    'version',
    'mappingVersion',
    'steeringSensitivity',
    'returnRate',
    'speedAttenuation',
    'throttleRamp',
    'brakeRamp',
    'cameraMotion',
    'fov',
  ]);
  requireContract(data.schemaVersion === 1, 'Unsupported control preferences schema');
  const mappingVersion = choice(data.mappingVersion, ['provisional-v1', '025-keyboard-v1']);
  return Object.freeze({
    schemaVersion: 1,
    version: tick(data.version),
    mappingVersion,
    steeringSensitivity: number(data.steeringSensitivity, 0, 100),
    returnRate: number(data.returnRate, 0, 100),
    speedAttenuation: number(data.speedAttenuation, 0, 100),
    throttleRamp: number(data.throttleRamp, 0, 100),
    brakeRamp: number(data.brakeRamp, 0, 100),
    cameraMotion: number(data.cameraMotion, 0, 100),
    fov: number(data.fov, 60, 100),
  });
}

export function parseInputPreferences(value: unknown): InputPreferences {
  const data = fields(value, ['bindings', 'cameraMode', 'control']);
  const rawBindings = fields(data.bindings, inputActions);
  const entries = inputActions.map((action) => {
    const code = text(rawBindings[action]);
    requireContract(
      /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Tab|Escape|Enter|Backspace|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|F([1-9]|1[0-2]))$/.test(
        code,
      ),
      'Unsupported keyboard code',
    );
    return [action, code] as const;
  });
  requireContract(
    new Set(entries.map(([, code]) => code)).size === entries.length,
    'Conflicting key bindings',
  );
  const bindings = Object.fromEntries(entries) as Record<InputAction, string>;
  return Object.freeze({
    bindings: Object.freeze(bindings),
    cameraMode: choice(data.cameraMode, ['CHASE', 'FIRST_PERSON']),
    control: parseControlPreferences(data.control),
  });
}

export function parseUnitPreferences(value: unknown): UnitPreferences {
  const data = fields(value, ['speed', 'distance']);
  return Object.freeze({
    speed: choice(data.speed, ['km/h', 'mph']),
    distance: choice(data.distance, ['m', 'ft']),
  });
}

export function parseQualityPreferences(value: unknown): QualityPreferences {
  const data = fields(value, ['preset', 'preferredBackend', 'resolutionScale', 'adaptive']);
  return Object.freeze({
    preset: choice(data.preset, ['LOW', 'MEDIUM', 'HIGH']),
    preferredBackend: choice(data.preferredBackend, ['AUTO', 'WEBGPU', 'WEBGL2']),
    resolutionScale: number(data.resolutionScale, 0.5, 1),
    adaptive: boolean(data.adaptive),
  });
}

export function parseScenarioConfiguration(value: unknown): ScenarioConfiguration {
  const data = fields(value, ['scenarioId', 'mapVersion', 'seed', 'taxiCount', 'civilianCount']);
  const seed = number(data.seed, 0, 0xffffffff);
  requireContract(Number.isInteger(seed), 'Scenario seed must be uint32');
  return Object.freeze({
    scenarioId: text(data.scenarioId),
    mapVersion: text(data.mapVersion),
    seed,
    taxiCount: tick(data.taxiCount),
    civilianCount: tick(data.civilianCount),
  });
}

export function parseRuntimeSettings(value: unknown): RuntimeSettings {
  // The audio group was added by 148; snapshots written before it stay readable and receive the
  // documented default levels instead of being rejected.
  const data = record(value);
  const required = ['schemaVersion', 'playerId', 'input', 'units', 'quality', 'scenario'] as const;
  const allowed = [...required, 'audio'] as const;
  requireContract(
    required.every((key) => Object.hasOwn(data, key)) &&
      Object.keys(data).every((key) => (allowed as readonly string[]).includes(key)),
    'Missing or unknown contract fields',
  );
  requireContract(data.schemaVersion === 1, 'Unsupported runtime settings schema');
  return Object.freeze({
    schemaVersion: 1,
    playerId: text(data.playerId),
    input: parseInputPreferences(data.input),
    units: parseUnitPreferences(data.units),
    quality: parseQualityPreferences(data.quality),
    scenario: parseScenarioConfiguration(data.scenario),
    audio: Object.hasOwn(data, 'audio')
      ? parseAudioPreferences(data.audio)
      : defaultAudioPreferences(),
  });
}
