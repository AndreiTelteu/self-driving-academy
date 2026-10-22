import type { ControlPreferences, RuntimeSettings } from '../settings';

/**
 * 081 game settings contract.
 *
 * This module owns a device/settings draft for display units, camera mode, comfort control
 * preferences and graphics preferences. It never owns a learned profile, a fleet style, AI
 * behaviour or physics. Display units are presentation only: every conversion here takes an SI
 * value (m/s, m) and returns a formatted view; no function writes m/s, m, a profile field or a
 * vehicle parameter. The authoritative simulation stays SI.
 *
 * The style editor for learned parameters is a separate surface (230) and is deliberately absent.
 */
export const GAME_SETTINGS_VERSION = '081-game-settings-v1' as const;

export const GAME_SETTINGS_POLICY =
  'Setări dispozitiv · nu modifică profilul învățat, AI-ul sau stilul flotei' as const;

/** Explicit separation flag for hosts and evidence; the panel has no style editor. */
export const GAME_SETTINGS_STYLE_EDITOR_SEPARATE = true as const;

/** Audio preferences belong to 148; this panel must not invent a volume or mute control. */
export const GAME_SETTINGS_AUDIO_REASON = 'PBI_148_PENDING' as const;
export const GAME_SETTINGS_AUDIO_LABEL = 'Indisponibil · 148' as const;

export interface GameSettingsAudio {
  readonly state: 'UNAVAILABLE';
  readonly reason: 'PBI_148_PENDING';
}

export const GAME_SETTINGS_AUDIO: GameSettingsAudio = Object.freeze({
  state: 'UNAVAILABLE' as const,
  reason: GAME_SETTINGS_AUDIO_REASON,
});

export interface GameSettingsUnits {
  readonly speed: 'km/h' | 'mph';
  readonly distance: 'm' | 'ft';
}

export type GameSettingsCameraMode = 'CHASE' | 'FIRST_PERSON';

export interface GameSettingsGraphics {
  readonly preset: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly preferredBackend: 'AUTO' | 'WEBGPU' | 'WEBGL2';
  readonly resolutionScale: number;
  readonly adaptive: boolean;
}

/** The seven 009 comfort/camera sliders; values are UI conventions, not physical rates. */
export const GAME_SETTINGS_COMFORT_FIELDS = [
  'steeringSensitivity',
  'returnRate',
  'speedAttenuation',
  'throttleRamp',
  'brakeRamp',
  'cameraMotion',
  'fov',
] as const;

export type GameSettingsComfortField = (typeof GAME_SETTINGS_COMFORT_FIELDS)[number];

/** Exactly the 009 numeric domains; exported so the UI, tests and report agree. */
export const GAME_SETTINGS_RANGES = Object.freeze({
  steeringSensitivity: Object.freeze({ min: 0, max: 100, step: 1 }),
  returnRate: Object.freeze({ min: 0, max: 100, step: 1 }),
  speedAttenuation: Object.freeze({ min: 0, max: 100, step: 1 }),
  throttleRamp: Object.freeze({ min: 0, max: 100, step: 1 }),
  brakeRamp: Object.freeze({ min: 0, max: 100, step: 1 }),
  cameraMotion: Object.freeze({ min: 0, max: 100, step: 1 }),
  fov: Object.freeze({ min: 60, max: 100, step: 1 }),
  resolutionScale: Object.freeze({ min: 0.5, max: 1, step: 0.05 }),
});

export const GAME_SETTINGS_SECTIONS = ['units', 'camera', 'comfort', 'graphics'] as const;

export type GameSettingsSection = (typeof GAME_SETTINGS_SECTIONS)[number];

export const GAME_SETTINGS_SECTION_LABELS: Readonly<Record<GameSettingsSection, string>> =
  Object.freeze({
    units: 'Unități',
    camera: 'Cameră',
    comfort: 'Confort',
    graphics: 'Grafică',
  });

export const GAME_SETTINGS_COMFORT_LABELS: Readonly<Record<GameSettingsComfortField, string>> =
  Object.freeze({
    steeringSensitivity: 'Sensibilitatea direcției',
    returnRate: 'Revenirea volanului',
    speedAttenuation: 'Direcție mai calmă la viteză',
    throttleRamp: 'Accelerație progresivă',
    brakeRamp: 'Frânare progresivă',
    cameraMotion: 'Mișcarea camerei',
    fov: 'Câmp vizual',
  });

export const GAME_SETTINGS_UNIT_LABELS = Object.freeze({
  speed: Object.freeze({ 'km/h': 'km/h', mph: 'mph' }),
  distance: Object.freeze({ m: 'metri (m)', ft: 'picioare (ft)' }),
});

export const GAME_SETTINGS_CAMERA_LABELS: Readonly<Record<GameSettingsCameraMode, string>> =
  Object.freeze({
    CHASE: 'Din spate',
    FIRST_PERSON: 'First-person din poziția șoferului',
  });

export const GAME_SETTINGS_PRESET_LABELS: Readonly<Record<GameSettingsGraphics['preset'], string>> =
  Object.freeze({ LOW: 'Scăzută', MEDIUM: 'Medie', HIGH: 'Ridicată' });

export const GAME_SETTINGS_BACKEND_LABELS: Readonly<
  Record<GameSettingsGraphics['preferredBackend'], string>
> = Object.freeze({ AUTO: 'Automat', WEBGPU: 'WebGPU', WEBGL2: 'WebGL2' });

/** Persisted and proposed sections that compose a complete 009 `RuntimeSettings`. */
export interface GameSettingsValues {
  readonly units: GameSettingsUnits;
  readonly cameraMode: GameSettingsCameraMode;
  readonly comfort: Readonly<ControlPreferences>;
  readonly graphics: GameSettingsGraphics;
}

export interface GameSettingsDraft {
  readonly schemaVersion: 1;
  readonly version: typeof GAME_SETTINGS_VERSION;
  readonly playerId: string;
  /** Sections read from the real 009 settings when the draft was created. */
  readonly saved: GameSettingsValues;
  /** Local proposal; nothing is written until the host saves. */
  readonly proposed: GameSettingsValues;
  /** Real 009 defaults of the same player; the control revision/mapping are preserved. */
  readonly defaults: GameSettingsValues;
  /** Always explicitly unavailable until 148 supplies an audio preference port. */
  readonly audio: GameSettingsAudio;
  readonly revision: number;
}

export interface GameSettingsDraftInput {
  readonly playerId: string;
  readonly saved: GameSettingsValues;
  readonly defaults: GameSettingsValues;
}

export type GameSettingsSaveState = 'DIRTY' | 'UNCHANGED' | 'INVALID';

export const GAME_SETTINGS_SAVE_STATE_LABELS: Readonly<Record<GameSettingsSaveState, string>> =
  Object.freeze({
    DIRTY: 'Modificat',
    UNCHANGED: 'Neschimbat',
    INVALID: 'Valori invalide',
  });

export type GameSettingsInvalidField =
  | 'STEERING_SENSITIVITY'
  | 'RETURN_RATE'
  | 'SPEED_ATTENUATION'
  | 'THROTTLE_RAMP'
  | 'BRAKE_RAMP'
  | 'CAMERA_MOTION'
  | 'FOV'
  | 'RESOLUTION_SCALE';

export interface GameSettingsIssue {
  readonly field: GameSettingsInvalidField;
  readonly message: string;
}

export const GAME_SETTINGS_ISSUE_LABELS: Readonly<Record<GameSettingsInvalidField, string>> =
  Object.freeze({
    STEERING_SENSITIVITY: 'Sensibilitatea direcției trebuie între 0 și 100.',
    RETURN_RATE: 'Revenirea volanului trebuie între 0 și 100.',
    SPEED_ATTENUATION: 'Direcția calmă la viteză trebuie între 0 și 100.',
    THROTTLE_RAMP: 'Accelerația progresivă trebuie între 0 și 100.',
    BRAKE_RAMP: 'Frânarea progresivă trebuie între 0 și 100.',
    CAMERA_MOTION: 'Mișcarea camerei trebuie între 0 și 100.',
    FOV: 'Câmpul vizual trebuie între 60 și 100 de grade.',
    RESOLUTION_SCALE: 'Scala rezoluției trebuie între 0,5 și 1.',
  });

export interface GameSettingsSectionChange {
  readonly section: GameSettingsSection;
  readonly label: string;
  readonly changed: boolean;
}

export interface GameSettingsProjection {
  readonly version: typeof GAME_SETTINGS_VERSION;
  readonly playerId: string;
  readonly revision: number;
  readonly values: GameSettingsValues;
  readonly defaults: GameSettingsValues;
  readonly audio: GameSettingsAudio;
  readonly sections: readonly GameSettingsSectionChange[];
  readonly changedSections: readonly GameSettingsSection[];
  readonly changed: Readonly<Record<GameSettingsSection, boolean>>;
  readonly changedCount: number;
  readonly saveState: GameSettingsSaveState;
  readonly canSave: boolean;
  readonly issues: readonly GameSettingsIssue[];
  readonly summary: string;
  readonly preview: GameSettingsUnitPreview;
  /** Current comfort values were edited, so the 009 store needs a newer control revision. */
  readonly controlVersionBump: 0 | 1;
  readonly policy: Readonly<{
    text: typeof GAME_SETTINGS_POLICY;
    styleEditorSeparate: true;
    changesLearnedProfile: false;
    changesFleetStyle: false;
    simulationUnits: 'SI';
  }>;
  readonly signature: string;
}

// ---------------------------------------------------------------------------------------------
// Pure display conversion. Inputs are SI; outputs are display-only strings/numbers.
// ---------------------------------------------------------------------------------------------

export const KMH_PER_MPS = 3.6;
export const METERS_PER_FOOT = 0.3048;
export const FEET_PER_METER = 1 / METERS_PER_FOOT;

export interface GameSettingsSpeedDisplay {
  readonly value: string;
  readonly unit: 'km/h' | 'mph';
  /** Rounded display magnitude; `null` when there is no valid SI value. */
  readonly number: number | null;
  /** The untouched SI input, kept for assertions and accessibility. */
  readonly siMps: number | null;
  readonly text: string;
  readonly accessible: string;
}

/** Converts m/s to the selected display unit. The SI value itself is never modified. */
export function formatSpeedDisplay(
  speedMps: number,
  units: GameSettingsUnits['speed'],
): GameSettingsSpeedDisplay {
  if (!Number.isFinite(speedMps) || speedMps < 0)
    return Object.freeze({
      value: '—',
      unit: units,
      number: null,
      siMps: null,
      text: '—',
      accessible: 'Viteză indisponibilă',
    });
  const kmh = speedMps * KMH_PER_MPS,
    magnitude = units === 'km/h' ? kmh : kmh / 1.609344,
    rounded = Math.round(magnitude),
    value = String(rounded);
  return Object.freeze({
    value,
    unit: units,
    number: rounded,
    siMps: speedMps,
    text: `${value} ${units}`,
    accessible: `Viteză: ${value} ${units === 'km/h' ? 'kilometri pe oră' : 'mile pe oră'}`,
  });
}

export interface GameSettingsDistanceDisplay {
  readonly value: string;
  readonly unit: 'm' | 'km' | 'ft';
  readonly number: number | null;
  /** The untouched SI input in metres. */
  readonly siM: number | null;
  readonly text: string;
  readonly accessible: string;
}

/** Converts metres to the selected display unit. The SI distance is never modified. */
export function formatDistanceDisplay(
  distanceM: number,
  units: GameSettingsUnits['distance'],
): GameSettingsDistanceDisplay {
  if (!Number.isFinite(distanceM) || distanceM < 0)
    return Object.freeze({
      value: '—',
      unit: units === 'm' ? 'm' : 'ft',
      number: null,
      siM: null,
      text: '—',
      accessible: 'Distanță indisponibilă',
    });
  if (units === 'ft') {
    const rounded = Math.round(distanceM * FEET_PER_METER),
      value = String(rounded);
    return Object.freeze({
      value,
      unit: 'ft' as const,
      number: rounded,
      siM: distanceM,
      text: `${value} ft`,
      accessible: `Distanță: ${value} picioare`,
    });
  }
  if (distanceM < 1000) {
    const rounded = Math.round(distanceM),
      value = String(rounded);
    return Object.freeze({
      value,
      unit: 'm' as const,
      number: rounded,
      siM: distanceM,
      text: `${value} m`,
      accessible: `Distanță: ${value} metri`,
    });
  }
  const kilometres = Number((distanceM / 1000).toFixed(1)),
    value = kilometres.toFixed(1);
  return Object.freeze({
    value,
    unit: 'km' as const,
    number: kilometres,
    siM: distanceM,
    text: `${value} km`,
    accessible: `Distanță: ${value} kilometri`,
  });
}

export interface GameSettingsUnitPreview {
  readonly speedMps: number;
  readonly distanceM: number;
  readonly siSpeed: string;
  readonly siDistance: string;
  readonly kmh: string;
  readonly mph: string;
  readonly meters: string;
  readonly feet: string;
  /** For example `12.5 m/s = 45 km/h = 28 mph`. */
  readonly speedText: string;
  /** For example `120 m = 394 ft`. */
  readonly distanceText: string;
  readonly text: string;
}

function siNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Deterministic SI <-> display reference shown in the panel. Both display units are always
 * listed, so switching km/h to mph is visible without touching the simulation value.
 */
export function unitPreview(speedMps = 12.5, distanceM = 120): GameSettingsUnitPreview {
  const kmh = formatSpeedDisplay(speedMps, 'km/h'),
    mph = formatSpeedDisplay(speedMps, 'mph'),
    meters = formatDistanceDisplay(distanceM, 'm'),
    feet = formatDistanceDisplay(distanceM, 'ft'),
    siSpeed = `${siNumber(speedMps)} m/s`,
    siDistance = `${siNumber(distanceM)} m`;
  return Object.freeze({
    speedMps,
    distanceM,
    siSpeed,
    siDistance,
    kmh: kmh.text,
    mph: mph.text,
    meters: meters.text,
    feet: feet.text,
    speedText: `${siSpeed} = ${kmh.text} = ${mph.text}`,
    distanceText: `${siDistance} = ${feet.text}`,
    text: `${siSpeed} = ${kmh.text} = ${mph.text} · ${siDistance} = ${feet.text}`,
  });
}

// ---------------------------------------------------------------------------------------------
// Strict draft validation. Plain data only, no accessors, same 009 numeric domains.
// ---------------------------------------------------------------------------------------------

function fail(message: string): never {
  throw new Error(message);
}

function plain(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be plain data`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be plain data`);
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const data = plain(value, label),
    names = Reflect.ownKeys(data);
  if (
    names.length !== keys.length ||
    names.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail(`${label} fields`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(data, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail(`${label} descriptors`);
  }
  return data;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value === '' || value.length > 512)
    fail(label);
  return value;
}

function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail('Game settings revision');
  return value;
}

function choice<const T extends readonly string[]>(
  value: unknown,
  options: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !options.includes(value)) fail(label);
  return value as T[number];
}

function boundedNumber(
  value: unknown,
  range: { readonly min: number; readonly max: number },
  label: string,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(label);
  if (value < range.min || value > range.max) fail(label);
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(label);
  return value;
}

function parseControl(value: unknown, allowOutOfRange: boolean): Readonly<ControlPreferences> {
  const data = exact(
      value,
      [
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
      ],
      'Game settings comfort',
    ),
    numeric = (field: GameSettingsComfortField): number =>
      allowOutOfRange
        ? finiteNumber(data[field], `Game settings comfort ${field}`)
        : boundedNumber(data[field], GAME_SETTINGS_RANGES[field], `Game settings comfort ${field}`);
  if (data.schemaVersion !== 1) fail('Unsupported control preferences schema');
  return Object.freeze({
    schemaVersion: 1,
    version: revision(data.version),
    mappingVersion: choice(
      data.mappingVersion,
      ['provisional-v1', '025-keyboard-v1'],
      'Game settings mapping',
    ),
    steeringSensitivity: numeric('steeringSensitivity'),
    returnRate: numeric('returnRate'),
    speedAttenuation: numeric('speedAttenuation'),
    throttleRamp: numeric('throttleRamp'),
    brakeRamp: numeric('brakeRamp'),
    cameraMotion: numeric('cameraMotion'),
    fov: numeric('fov'),
  });
}

function parseValues(value: unknown, label: string, allowOutOfRange: boolean): GameSettingsValues {
  const data = exact(value, ['units', 'cameraMode', 'comfort', 'graphics'], label),
    units = exact(data.units, ['speed', 'distance'], `${label} units`),
    graphics = exact(
      data.graphics,
      ['preset', 'preferredBackend', 'resolutionScale', 'adaptive'],
      `${label} graphics`,
    );
  if (typeof graphics.adaptive !== 'boolean') fail(`${label} adaptive`);
  return Object.freeze({
    units: Object.freeze({
      speed: choice(units.speed, ['km/h', 'mph'], `${label} speed unit`),
      distance: choice(units.distance, ['m', 'ft'], `${label} distance unit`),
    }),
    cameraMode: choice(data.cameraMode, ['CHASE', 'FIRST_PERSON'], `${label} camera mode`),
    comfort: parseControl(data.comfort, allowOutOfRange),
    graphics: Object.freeze({
      preset: choice(graphics.preset, ['LOW', 'MEDIUM', 'HIGH'], `${label} preset`),
      preferredBackend: choice(
        graphics.preferredBackend,
        ['AUTO', 'WEBGPU', 'WEBGL2'],
        `${label} preferred backend`,
      ),
      resolutionScale: allowOutOfRange
        ? finiteNumber(graphics.resolutionScale, `${label} resolution scale`)
        : boundedNumber(
            graphics.resolutionScale,
            GAME_SETTINGS_RANGES.resolutionScale,
            `${label} resolution scale`,
          ),
      adaptive: graphics.adaptive,
    }),
  });
}

function parseAudio(value: unknown): GameSettingsAudio {
  const data = exact(value, ['state', 'reason'], 'Game settings audio');
  if (data.state !== 'UNAVAILABLE' || data.reason !== GAME_SETTINGS_AUDIO_REASON)
    fail('Game settings audio is unavailable until 148');
  return GAME_SETTINGS_AUDIO;
}

/**
 * Validates and freezes one draft. Persisted and default sections must be complete 009 values
 * (ranges included). A proposed section is structurally strict and keeps finite out-of-range
 * numbers so `projectGameSettings` can report `INVALID` with visible reasons instead of silently
 * clamping a value the player typed.
 */
export function parseGameSettingsDraft(value: unknown): GameSettingsDraft {
  const data = exact(
    value,
    ['schemaVersion', 'version', 'playerId', 'saved', 'proposed', 'defaults', 'audio', 'revision'],
    'Game settings draft',
  );
  if (data.schemaVersion !== 1 || data.version !== GAME_SETTINGS_VERSION)
    fail('Game settings contract');
  return Object.freeze({
    schemaVersion: 1,
    version: GAME_SETTINGS_VERSION,
    playerId: identity(data.playerId, 'Game settings player identity'),
    saved: parseValues(data.saved, 'Game settings saved', false),
    proposed: parseValues(data.proposed, 'Game settings proposed', true),
    defaults: parseValues(data.defaults, 'Game settings defaults', false),
    audio: parseAudio(data.audio),
    revision: revision(data.revision),
  });
}

/** Builds the initial draft: the proposal starts as the real persisted settings. */
export function createGameSettingsDraft(input: GameSettingsDraftInput): GameSettingsDraft {
  if (!input || typeof input !== 'object') fail('Game settings draft input');
  const saved = parseValues(input.saved, 'Game settings saved', false),
    defaults = parseValues(input.defaults, 'Game settings defaults', false);
  return parseGameSettingsDraft({
    schemaVersion: 1,
    version: GAME_SETTINGS_VERSION,
    playerId: identity(input.playerId, 'Game settings player identity'),
    saved,
    proposed: saved,
    defaults,
    audio: GAME_SETTINGS_AUDIO,
    revision: 0,
  });
}

// ---------------------------------------------------------------------------------------------
// Pure operations
// ---------------------------------------------------------------------------------------------

function nextDraft(
  draft: GameSettingsDraft,
  changes: { readonly proposed?: GameSettingsValues; readonly revision?: number },
): GameSettingsDraft {
  return parseGameSettingsDraft({
    schemaVersion: 1,
    version: GAME_SETTINGS_VERSION,
    playerId: draft.playerId,
    saved: draft.saved,
    proposed: changes.proposed ?? draft.proposed,
    defaults: draft.defaults,
    audio: GAME_SETTINGS_AUDIO,
    revision: changes.revision ?? draft.revision + 1,
  });
}

/** Reads a validated draft; callers never compare raw numbers themselves. */
export function gameSettingsRangeIssues(values: GameSettingsValues): readonly GameSettingsIssue[] {
  const issues: GameSettingsIssue[] = [];
  for (const field of GAME_SETTINGS_COMFORT_FIELDS) {
    const value = values.comfort[field],
      range = GAME_SETTINGS_RANGES[field],
      issue = COMFORT_ISSUES[field];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < range.min ||
      value > range.max
    )
      issues.push(Object.freeze({ field: issue, message: GAME_SETTINGS_ISSUE_LABELS[issue] }));
  }
  const scale = values.graphics.resolutionScale;
  if (
    typeof scale !== 'number' ||
    !Number.isFinite(scale) ||
    scale < GAME_SETTINGS_RANGES.resolutionScale.min ||
    scale > GAME_SETTINGS_RANGES.resolutionScale.max
  )
    issues.push(
      Object.freeze({
        field: 'RESOLUTION_SCALE' as const,
        message: GAME_SETTINGS_ISSUE_LABELS.RESOLUTION_SCALE,
      }),
    );
  return Object.freeze(issues);
}

const COMFORT_ISSUES: Readonly<Record<GameSettingsComfortField, GameSettingsInvalidField>> =
  Object.freeze({
    steeringSensitivity: 'STEERING_SENSITIVITY',
    returnRate: 'RETURN_RATE',
    speedAttenuation: 'SPEED_ATTENUATION',
    throttleRamp: 'THROTTLE_RAMP',
    brakeRamp: 'BRAKE_RAMP',
    cameraMotion: 'CAMERA_MOTION',
    fov: 'FOV',
  });

export function setDisplayUnits(
  draft: GameSettingsDraft,
  patch: Partial<GameSettingsUnits>,
): GameSettingsDraft {
  const current = parseGameSettingsDraft(draft),
    units = {
      ...current.proposed.units,
      ...patch,
    };
  return nextDraft(current, {
    proposed: { ...current.proposed, units: units as GameSettingsUnits },
  });
}

export function setCameraMode(
  draft: GameSettingsDraft,
  mode: GameSettingsCameraMode,
): GameSettingsDraft {
  const current = parseGameSettingsDraft(draft);
  if (current.proposed.cameraMode === mode) return current;
  return nextDraft(current, { proposed: { ...current.proposed, cameraMode: mode } });
}

/** Only the seven comfort fields change; control revision and mapping are left to the host. */
export function setComfortValues(
  draft: GameSettingsDraft,
  patch: Partial<Record<GameSettingsComfortField, number>>,
): GameSettingsDraft {
  const current = parseGameSettingsDraft(draft),
    comfort = { ...current.proposed.comfort };
  for (const key of Object.keys(patch)) {
    if (!(GAME_SETTINGS_COMFORT_FIELDS as readonly string[]).includes(key))
      fail('Game settings comfort field');
    const value = patch[key as GameSettingsComfortField];
    if (value !== undefined) comfort[key as GameSettingsComfortField] = value;
  }
  return nextDraft(current, {
    proposed: {
      ...current.proposed,
      comfort: comfort as Readonly<ControlPreferences>,
    },
  });
}

export function setGraphics(
  draft: GameSettingsDraft,
  patch: Partial<GameSettingsGraphics>,
): GameSettingsDraft {
  const current = parseGameSettingsDraft(draft);
  return nextDraft(current, {
    proposed: {
      ...current.proposed,
      graphics: { ...current.proposed.graphics, ...patch },
    },
  });
}

/** Proposes the real 009 defaults for all four sections; bindings are not part of the draft. */
export function resetGameSettingsDraft(draft: GameSettingsDraft): GameSettingsDraft {
  const current = parseGameSettingsDraft(draft);
  return nextDraft(current, { proposed: current.defaults });
}

/** Discards local changes and returns to the persisted sections. */
export function revertGameSettingsDraft(draft: GameSettingsDraft): GameSettingsDraft {
  const current = parseGameSettingsDraft(draft);
  return nextDraft(current, { proposed: current.saved });
}

function sameUnits(left: GameSettingsUnits, right: GameSettingsUnits): boolean {
  return left.speed === right.speed && left.distance === right.distance;
}

function sameComfort(
  left: Readonly<ControlPreferences>,
  right: Readonly<ControlPreferences>,
): boolean {
  return GAME_SETTINGS_COMFORT_FIELDS.every((field) => left[field] === right[field]);
}

function sameGraphics(left: GameSettingsGraphics, right: GameSettingsGraphics): boolean {
  return (
    left.preset === right.preset &&
    left.preferredBackend === right.preferredBackend &&
    left.resolutionScale === right.resolutionScale &&
    left.adaptive === right.adaptive
  );
}

/** Pure projection shared by the DOM adapter, the tests and the evidence report. */
export function projectGameSettings(draft: GameSettingsDraft): GameSettingsProjection {
  const current = parseGameSettingsDraft(draft),
    issues = gameSettingsRangeIssues(current.proposed),
    changed = Object.freeze({
      units: !sameUnits(current.proposed.units, current.saved.units),
      camera: current.proposed.cameraMode !== current.saved.cameraMode,
      comfort: !sameComfort(current.proposed.comfort, current.saved.comfort),
      graphics: !sameGraphics(current.proposed.graphics, current.saved.graphics),
    }),
    changedSections = GAME_SETTINGS_SECTIONS.filter((section) => changed[section]),
    changedCount = changedSections.length,
    saveState: GameSettingsSaveState =
      issues.length > 0 ? 'INVALID' : changedCount > 0 ? 'DIRTY' : 'UNCHANGED',
    labels = changedSections.map((section) => GAME_SETTINGS_SECTION_LABELS[section]),
    summary =
      saveState === 'INVALID'
        ? `${issues.length} ${issues.length === 1 ? 'valoare este' : 'valori sunt'} în afara limitelor. Salvează este blocat până la corectare.`
        : saveState === 'UNCHANGED'
          ? 'Nicio modificare față de setările salvate.'
          : `${changedCount} ${changedCount === 1 ? 'secțiune modificată' : 'secțiuni modificate'}: ${labels.join(', ')}. Salvează pentru a păstra; simularea rămâne în SI.`,
    signature = JSON.stringify([
      GAME_SETTINGS_VERSION,
      current.playerId,
      current.revision,
      saveState,
      current.proposed.units,
      current.proposed.cameraMode,
      current.proposed.comfort,
      current.proposed.graphics,
      changed,
      issues.map((issue) => issue.field),
      current.audio,
    ]);
  return Object.freeze({
    version: GAME_SETTINGS_VERSION,
    playerId: current.playerId,
    revision: current.revision,
    values: current.proposed,
    defaults: current.defaults,
    audio: current.audio,
    sections: Object.freeze(
      GAME_SETTINGS_SECTIONS.map((section) =>
        Object.freeze({
          section,
          label: GAME_SETTINGS_SECTION_LABELS[section],
          changed: changed[section],
        }),
      ),
    ),
    changedSections,
    changed,
    changedCount,
    saveState,
    canSave: saveState === 'DIRTY',
    issues,
    summary,
    preview: unitPreview(),
    controlVersionBump: changed.comfort ? 1 : 0,
    policy: Object.freeze({
      text: GAME_SETTINGS_POLICY,
      styleEditorSeparate: true as const,
      changesLearnedProfile: false as const,
      changesFleetStyle: false as const,
      simulationUnits: 'SI' as const,
    }),
    signature,
  });
}

/**
 * Builds the complete 009 settings shape from a validated draft.
 *
 * `input.bindings`, `playerId` and `scenario` come from the caller's real settings and are copied
 * untouched. The result is not parsed here: the UI module may only import settings contracts as
 * types, so the composition root parses the candidate before `SettingsStore.replace`.
 */
export function gameSettingsRuntimeCandidate(
  draft: GameSettingsDraft,
  base: RuntimeSettings,
): RuntimeSettings {
  const current = parseGameSettingsDraft(draft);
  if (base.playerId !== current.playerId) fail('Game settings candidate belongs to another player');
  return {
    schemaVersion: 1,
    playerId: current.playerId,
    input: {
      bindings: { ...base.input.bindings },
      cameraMode: current.proposed.cameraMode,
      control: { ...current.proposed.comfort },
    },
    units: { ...current.proposed.units },
    quality: { ...current.proposed.graphics },
    scenario: { ...base.scenario },
    audio: { ...base.audio },
  };
}
