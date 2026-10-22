import type { ControlPreferences, RuntimeSettings } from '../settings';
import {
  computeResponsiveLayout,
  type ResponsiveLayout,
  type ResponsiveRegion,
} from './responsive-layout';

/**
 * 229 control & comfort sliders contract.
 *
 * This module owns the „Cum controlez mașina” tab of the Reglaje popup: seven sliders over the
 * versioned `ControlPreferences` of 009/025, three presets, explicit slider ends, a local draft and
 * the geometric layout of the modal at the 084 breakpoints.
 *
 * It never owns driving physics, a `DrivingProfile`, the learned AI style or telemetry: values are
 * UI conventions (0–100 and 60–100°), never physical units, and no function here writes a vehicle
 * parameter, a profile value or a fleet style. The city-style tab belongs to 230 and is rendered as
 * explicitly unavailable.
 */
export const CONTROL_SLIDERS_VERSION = '229-control-sliders-v1' as const;

export const CONTROL_SLIDERS_TITLE = 'Reglaje' as const;
export const CONTROL_SLIDERS_CONTROL_TAB = 'Cum controlez mașina' as const;
export const CONTROL_SLIDERS_CITY_TAB = 'Cum conduce orașul' as const;

/** The learned-style editor is a separate surface (230); this popup never edits it. */
export const CONTROL_SLIDERS_CITY_TAB_REASON = 'PBI_230_PENDING' as const;
export const CONTROL_SLIDERS_CITY_TAB_LABEL = 'Indisponibil · 230' as const;

export const CONTROL_SLIDERS_POLICY =
  'Ajustează doar inputul și camera. Mașina, frânarea, aderența și stilul AI rămân neschimbate.' as const;

export const CONTROL_SLIDERS_DESCRIPTION =
  'Reglajele de control și confort se editează local: nimic nu se aplică la mișcarea sliderului, ci numai cu Aplică, la următorul tick. Popup-ul pune simularea pe pauză în toate modurile și eliberează comenzile ținute.' as const;

/** UI write ceiling for the slider read-out while a pointer/key drags a native range input. */
export const CONTROL_SLIDERS_WRITE_HZ = 10 as const;
export const CONTROL_SLIDERS_WRITE_INTERVAL_MS = 1000 / CONTROL_SLIDERS_WRITE_HZ;

export const CONTROL_SLIDER_FIELDS = [
  'steeringSensitivity',
  'returnRate',
  'speedAttenuation',
  'throttleRamp',
  'brakeRamp',
  'cameraMotion',
  'fov',
] as const;

export type ControlSliderField = (typeof CONTROL_SLIDER_FIELDS)[number];

export interface ControlSliderRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Exactly the 009 numeric domains; exported so the panel, the tests and the report agree. */
export const CONTROL_SLIDER_RANGES: Readonly<Record<ControlSliderField, ControlSliderRange>> =
  Object.freeze({
    steeringSensitivity: Object.freeze({ min: 0, max: 100, step: 1 }),
    returnRate: Object.freeze({ min: 0, max: 100, step: 1 }),
    speedAttenuation: Object.freeze({ min: 0, max: 100, step: 1 }),
    throttleRamp: Object.freeze({ min: 0, max: 100, step: 1 }),
    brakeRamp: Object.freeze({ min: 0, max: 100, step: 1 }),
    cameraMotion: Object.freeze({ min: 0, max: 100, step: 1 }),
    fov: Object.freeze({ min: 60, max: 100, step: 1 }),
  });

export const CONTROL_SLIDER_LABELS: Readonly<Record<ControlSliderField, string>> = Object.freeze({
  steeringSensitivity: 'Sensibilitatea direcției',
  returnRate: 'Revenirea volanului',
  speedAttenuation: 'Direcție mai calmă la viteză',
  throttleRamp: 'Accelerație progresivă',
  brakeRamp: 'Frânare progresivă',
  cameraMotion: 'Mișcarea camerei',
  fov: 'Câmp vizual',
});

/** One plain sentence per slider; the technical name is never the only explanation. */
export const CONTROL_SLIDER_HINTS: Readonly<Record<ControlSliderField, string>> = Object.freeze({
  steeringSensitivity: 'Cât de repede crește comanda de direcție când apeși pe viraj.',
  returnRate: 'Cât de repede revine volanul la neutru după ce eliberezi.',
  speedAttenuation: 'Cât de mult se reduce virajul la viteză mare.',
  throttleRamp: 'Cât de lin crește accelerația cât timp ții apăsat.',
  brakeRamp: 'Cât de lin crește frânarea cât timp ții apăsat.',
  cameraMotion: 'Cât de mult urmărește camera mișcarea; 0 ține camera stabilă.',
  fov: 'Cât de larg vezi în prima persoană, în grade.',
});

/** The two simple words required at every slider end. */
export const CONTROL_SLIDER_ENDS: Readonly<
  Record<ControlSliderField, Readonly<{ min: string; max: string }>>
> = Object.freeze({
  steeringSensitivity: Object.freeze({ min: 'Lină', max: 'Directă' }),
  returnRate: Object.freeze({ min: 'Lentă', max: 'Rapidă' }),
  speedAttenuation: Object.freeze({ min: 'Puțină', max: 'Multă' }),
  throttleRamp: Object.freeze({ min: 'Lentă', max: 'Rapidă' }),
  brakeRamp: Object.freeze({ min: 'Lentă', max: 'Rapidă' }),
  cameraMotion: Object.freeze({ min: 'Stabilă', max: 'Mobilă' }),
  fov: Object.freeze({ min: 'Îngust', max: 'Larg' }),
});

export const CONTROL_SLIDER_PRESETS = ['ACCESSIBLE', 'BALANCED', 'DIRECT'] as const;

export type ControlSliderPreset = (typeof CONTROL_SLIDER_PRESETS)[number];

export const CONTROL_SLIDER_PRESET_LABELS: Readonly<Record<ControlSliderPreset, string>> =
  Object.freeze({
    ACCESSIBLE: 'Accesibil',
    BALANCED: 'Echilibrat',
    DIRECT: 'Direct',
  });

export interface ControlSliderPresetDefinition {
  readonly id: ControlSliderPreset;
  readonly label: string;
  readonly description: string;
  readonly values: Readonly<Record<ControlSliderField, number>>;
}

/**
 * Presets only move UI conventions inside the 009 domains. They never touch mass, power, braking,
 * grip or a learned parameter: the same car, the same mechanics, a different input feel.
 */
export const CONTROL_SLIDER_PRESET_VALUES: Readonly<
  Record<ControlSliderPreset, ControlSliderPresetDefinition>
> = Object.freeze({
  ACCESSIBLE: Object.freeze({
    id: 'ACCESSIBLE' as const,
    label: CONTROL_SLIDER_PRESET_LABELS.ACCESSIBLE,
    description: 'Direcție lină, revenire rapidă și cameră stabilă.',
    values: Object.freeze({
      steeringSensitivity: 30,
      returnRate: 80,
      speedAttenuation: 80,
      throttleRamp: 25,
      brakeRamp: 70,
      cameraMotion: 0,
      fov: 72,
    }),
  }),
  BALANCED: Object.freeze({
    id: 'BALANCED' as const,
    label: CONTROL_SLIDER_PRESET_LABELS.BALANCED,
    description: 'Valorile recomandate la început, la mijlocul fiecărui slider.',
    values: Object.freeze({
      steeringSensitivity: 50,
      returnRate: 50,
      speedAttenuation: 50,
      throttleRamp: 50,
      brakeRamp: 50,
      cameraMotion: 50,
      fov: 80,
    }),
  }),
  DIRECT: Object.freeze({
    id: 'DIRECT' as const,
    label: CONTROL_SLIDER_PRESET_LABELS.DIRECT,
    description: 'Răspuns mai prompt, cameră mai prezentă și câmp vizual mai larg.',
    values: Object.freeze({
      steeringSensitivity: 80,
      returnRate: 40,
      speedAttenuation: 25,
      throttleRamp: 75,
      brakeRamp: 35,
      cameraMotion: 60,
      fov: 88,
    }),
  }),
});

export type ControlSlidersSaveState = 'DIRTY' | 'UNCHANGED' | 'INVALID';

export const CONTROL_SLIDERS_SAVE_STATE_LABELS: Readonly<Record<ControlSlidersSaveState, string>> =
  Object.freeze({
    DIRTY: 'Modificat local',
    UNCHANGED: 'Neschimbat',
    INVALID: 'Valori invalide',
  });

export type ControlSlidersIssueCode =
  | 'STEERING_SENSITIVITY'
  | 'RETURN_RATE'
  | 'SPEED_ATTENUATION'
  | 'THROTTLE_RAMP'
  | 'BRAKE_RAMP'
  | 'CAMERA_MOTION'
  | 'FOV';

export interface ControlSlidersIssue {
  readonly field: ControlSliderField;
  readonly code: ControlSlidersIssueCode;
  readonly message: string;
}

export const CONTROL_SLIDERS_ISSUE_CODES: Readonly<
  Record<ControlSliderField, ControlSlidersIssueCode>
> = Object.freeze({
  steeringSensitivity: 'STEERING_SENSITIVITY',
  returnRate: 'RETURN_RATE',
  speedAttenuation: 'SPEED_ATTENUATION',
  throttleRamp: 'THROTTLE_RAMP',
  brakeRamp: 'BRAKE_RAMP',
  cameraMotion: 'CAMERA_MOTION',
  fov: 'FOV',
});

export function controlSlidersIssueFor(field: ControlSliderField): ControlSlidersIssue {
  const range = CONTROL_SLIDER_RANGES[field],
    message =
      field === 'fov'
        ? `Câmpul vizual trebuie între ${range.min} și ${range.max} de grade.`
        : `${CONTROL_SLIDER_LABELS[field]} trebuie între ${range.min} și ${range.max}.`;
  return Object.freeze({ field, code: CONTROL_SLIDERS_ISSUE_CODES[field], message });
}

export interface ControlSlidersDraft {
  readonly schemaVersion: 1;
  readonly version: typeof CONTROL_SLIDERS_VERSION;
  readonly playerId: string;
  /** The persisted 009 preferences read when the popup opened. */
  readonly saved: Readonly<ControlPreferences>;
  /** Local proposal; nothing is written until the host applies it at a tick. */
  readonly proposed: Readonly<ControlPreferences>;
  /** Real 009 defaults of the same player; the control revision/mapping are preserved. */
  readonly defaults: Readonly<ControlPreferences>;
  readonly revision: number;
}

export interface ControlSlidersDraftInput {
  readonly playerId: string;
  readonly saved: Readonly<ControlPreferences>;
  readonly defaults: Readonly<ControlPreferences>;
}

export interface ControlSlidersProjection {
  readonly version: typeof CONTROL_SLIDERS_VERSION;
  readonly playerId: string;
  readonly revision: number;
  readonly values: Readonly<ControlPreferences>;
  readonly saved: Readonly<ControlPreferences>;
  readonly rows: readonly ControlSliderRow[];
  readonly changedFields: readonly ControlSliderField[];
  readonly changedCount: number;
  readonly saveState: ControlSlidersSaveState;
  readonly canApply: boolean;
  readonly activePreset: ControlSliderPreset | null;
  readonly issues: readonly ControlSlidersIssue[];
  readonly summary: string;
  /** The control revision is consumed exactly once when the host applies a real change. */
  readonly controlVersionBump: 0 | 1;
  readonly policy: Readonly<{
    text: typeof CONTROL_SLIDERS_POLICY;
    changesDrivingProfile: false;
    changesVehicleMechanics: false;
    changesLearnedAi: false;
    valuesAreUiConventions: true;
  }>;
  readonly signature: string;
}

export interface ControlSliderRow {
  readonly field: ControlSliderField;
  readonly label: string;
  readonly hint: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  /** Display text, e.g. `70` or `80°`. */
  readonly text: string;
  /** Accessible value text, e.g. `70 din 100, între Lină și Directă`. */
  readonly valueText: string;
  readonly ends: Readonly<{ min: string; max: string }>;
  readonly changed: boolean;
}

// ---------------------------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------------------------

export function controlSliderText(field: ControlSliderField, value: number): string {
  const range = CONTROL_SLIDER_RANGES[field];
  if (!Number.isFinite(value)) return '—';
  return field === 'fov' ? `${value}°` : `${value} / ${range.max}`;
}

export function controlSliderValueText(
  field: ControlSliderField,
  value: number,
  ends: Readonly<{ min: string; max: string }> = CONTROL_SLIDER_ENDS[field],
): string {
  if (!Number.isFinite(value)) return `${CONTROL_SLIDER_LABELS[field]}: valoare indisponibilă`;
  if (field === 'fov')
    return `${CONTROL_SLIDER_LABELS[field]}: ${value} grade, între ${ends.min} și ${ends.max}`;
  return `${CONTROL_SLIDER_LABELS[field]}: ${value} din 100, între ${ends.min} și ${ends.max}`;
}

/** One keyboard/native step, clamped to the 009 domain; `delta` is a whole number of steps. */
export function nudgeControlValue(field: ControlSliderField, value: number, delta: number): number {
  const range = CONTROL_SLIDER_RANGES[field];
  if (!Number.isFinite(value) || !Number.isFinite(delta)) throw new Error('Control slider value');
  const stepped = Math.round(value / range.step) * range.step + delta * range.step,
    clamped = Math.min(range.max, Math.max(range.min, stepped));
  return Number(clamped.toFixed(6));
}

/** Keyboard contract of the native range control, declared for tests and evidence. */
export const CONTROL_SLIDER_KEYBOARD = Object.freeze({
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
  PageDown: -10,
  PageUp: 10,
  Home: 'min' as const,
  End: 'max' as const,
});

/**
 * Frame-driven writes are coalesced: the host may call `update` at 60 Hz, but an identical draft
 * writes nothing and a changed read-out writes at most `CONTROL_SLIDERS_WRITE_HZ` times per second.
 */
export function shouldWriteControlSliders(previousMs: number, nowMs: number): boolean {
  if (!Number.isFinite(nowMs)) return false;
  if (!Number.isFinite(previousMs)) return true;
  return nowMs - previousMs >= CONTROL_SLIDERS_WRITE_INTERVAL_MS;
}

// ---------------------------------------------------------------------------------------------
// Strict draft validation (plain data only, same 009 domains)
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
    fail('Control sliders revision');
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(label);
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

function numeric(value: unknown, field: ControlSliderField, strict: boolean): number {
  const range = CONTROL_SLIDER_RANGES[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`Control slider ${field}`);
  if (strict && (value < range.min || value > range.max)) fail(`Control slider ${field}`);
  return value;
}

const CONTROL_KEYS = [
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
] as const;

function parseControl(value: unknown, strict: boolean): Readonly<ControlPreferences> {
  const data = exact(value, CONTROL_KEYS, 'Control sliders preferences');
  if (data.schemaVersion !== 1) fail('Unsupported control preferences schema');
  return Object.freeze({
    schemaVersion: 1,
    version: revision(data.version),
    mappingVersion: choice(
      data.mappingVersion,
      ['provisional-v1', '025-keyboard-v1'],
      'Control sliders mapping',
    ),
    steeringSensitivity: numeric(data.steeringSensitivity, 'steeringSensitivity', strict),
    returnRate: numeric(data.returnRate, 'returnRate', strict),
    speedAttenuation: numeric(data.speedAttenuation, 'speedAttenuation', strict),
    throttleRamp: numeric(data.throttleRamp, 'throttleRamp', strict),
    brakeRamp: numeric(data.brakeRamp, 'brakeRamp', strict),
    cameraMotion: numeric(data.cameraMotion, 'cameraMotion', strict),
    fov: numeric(data.fov, 'fov', strict),
  });
}

/**
 * Validates one draft. Persisted and default preferences must be complete 009 values; the proposal
 * keeps finite out-of-range numbers so `projectControlSliders` can report `INVALID` with visible
 * reasons instead of silently clamping a value the player typed.
 */
export function parseControlSlidersDraft(value: unknown): ControlSlidersDraft {
  const data = exact(
    value,
    ['schemaVersion', 'version', 'playerId', 'saved', 'proposed', 'defaults', 'revision'],
    'Control sliders draft',
  );
  if (data.schemaVersion !== 1 || data.version !== CONTROL_SLIDERS_VERSION)
    fail('Control sliders contract');
  return Object.freeze({
    schemaVersion: 1,
    version: CONTROL_SLIDERS_VERSION,
    playerId: identity(data.playerId, 'Control sliders player identity'),
    saved: parseControl(data.saved, true),
    proposed: parseControl(data.proposed, false),
    defaults: parseControl(data.defaults, true),
    revision: revision(data.revision),
  });
}

/** Builds the initial draft: the proposal starts as the real persisted preferences. */
export function createControlSlidersDraft(input: ControlSlidersDraftInput): ControlSlidersDraft {
  if (!input || typeof input !== 'object') fail('Control sliders draft input');
  const saved = parseControl(input.saved, true),
    defaults = parseControl(input.defaults, true);
  return parseControlSlidersDraft({
    schemaVersion: 1,
    version: CONTROL_SLIDERS_VERSION,
    playerId: identity(input.playerId, 'Control sliders player identity'),
    saved,
    proposed: saved,
    defaults,
    revision: 0,
  });
}

function nextDraft(
  draft: ControlSlidersDraft,
  changes: {
    readonly proposed?: Readonly<ControlPreferences>;
    readonly revision?: number;
  },
): ControlSlidersDraft {
  return parseControlSlidersDraft({
    schemaVersion: 1,
    version: CONTROL_SLIDERS_VERSION,
    playerId: draft.playerId,
    saved: draft.saved,
    proposed: changes.proposed ?? draft.proposed,
    defaults: draft.defaults,
    revision: changes.revision ?? draft.revision + 1,
  });
}

export function controlSlidersIssues(
  values: Readonly<ControlPreferences>,
): readonly ControlSlidersIssue[] {
  const issues: ControlSlidersIssue[] = [];
  for (const field of CONTROL_SLIDER_FIELDS) {
    const range = CONTROL_SLIDER_RANGES[field],
      value = values[field];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < range.min ||
      value > range.max
    )
      issues.push(controlSlidersIssueFor(field));
  }
  return Object.freeze(issues);
}

/** One field only; unknown fields are refused instead of being written silently. */
export function setControlSliderValue(
  draft: ControlSlidersDraft,
  field: ControlSliderField,
  value: number,
): ControlSlidersDraft {
  const current = parseControlSlidersDraft(draft);
  if (!(CONTROL_SLIDER_FIELDS as readonly string[]).includes(field)) fail('Control slider field');
  return nextDraft(current, {
    proposed: { ...current.proposed, [field]: finite(value, 'Control slider value') },
  });
}

/** Applies one preset to the proposal; the saved values and the revision are untouched. */
export function applyControlSliderPreset(
  draft: ControlSlidersDraft,
  preset: ControlSliderPreset,
): ControlSlidersDraft {
  const current = parseControlSlidersDraft(draft),
    definition = CONTROL_SLIDER_PRESET_VALUES[choice(preset, CONTROL_SLIDER_PRESETS, 'Preset')];
  return nextDraft(current, {
    proposed: {
      ...current.proposed,
      ...definition.values,
    },
  });
}

/** Proposes the real 009 defaults; the persisted mapping and revision are preserved. */
export function resetControlSlidersDraft(draft: ControlSlidersDraft): ControlSlidersDraft {
  const current = parseControlSlidersDraft(draft);
  return nextDraft(current, { proposed: current.defaults });
}

/** Discards local changes and returns to the persisted preferences. */
export function revertControlSlidersDraft(draft: ControlSlidersDraft): ControlSlidersDraft {
  const current = parseControlSlidersDraft(draft);
  return nextDraft(current, { proposed: current.saved });
}

function sameField(left: Readonly<ControlPreferences>, right: Readonly<ControlPreferences>) {
  return CONTROL_SLIDER_FIELDS.filter((field) => left[field] !== right[field]);
}

function presetOf(values: Readonly<ControlPreferences>): ControlSliderPreset | null {
  for (const preset of CONTROL_SLIDER_PRESETS) {
    const definition = CONTROL_SLIDER_PRESET_VALUES[preset];
    if (CONTROL_SLIDER_FIELDS.every((field) => values[field] === definition.values[field]))
      return preset;
  }
  return null;
}

/** Pure projection shared by the DOM adapter, the tests and the evidence report. */
export function projectControlSliders(draft: ControlSlidersDraft): ControlSlidersProjection {
  const current = parseControlSlidersDraft(draft),
    issues = controlSlidersIssues(current.proposed),
    changedFields = sameField(current.proposed, current.saved),
    changedCount = changedFields.length,
    saveState: ControlSlidersSaveState =
      issues.length > 0 ? 'INVALID' : changedCount > 0 ? 'DIRTY' : 'UNCHANGED',
    labels = changedFields.map((field) => CONTROL_SLIDER_LABELS[field]),
    summary =
      saveState === 'INVALID'
        ? `${issues.length} ${issues.length === 1 ? 'valoare este' : 'valori sunt'} în afara limitelor. Aplică este blocat până la corectare.`
        : saveState === 'UNCHANGED'
          ? 'Nicio modificare față de reglajele salvate; nimic de aplicat.'
          : `${changedCount} ${changedCount === 1 ? 'reglaj modificat' : 'reglaje modificate'}: ${labels.join(', ')}. Nimic nu se aplică până la Aplică.`,
    rows = CONTROL_SLIDER_FIELDS.map((field) => {
      const range = CONTROL_SLIDER_RANGES[field],
        value = current.proposed[field];
      return Object.freeze({
        field,
        label: CONTROL_SLIDER_LABELS[field],
        hint: CONTROL_SLIDER_HINTS[field],
        min: range.min,
        max: range.max,
        step: range.step,
        value,
        text: controlSliderText(field, value),
        valueText: controlSliderValueText(field, value),
        ends: CONTROL_SLIDER_ENDS[field],
        changed: value !== current.saved[field],
      });
    }),
    signature = JSON.stringify([
      CONTROL_SLIDERS_VERSION,
      current.playerId,
      current.revision,
      saveState,
      CONTROL_SLIDER_FIELDS.map((field) => current.proposed[field]),
      changedFields,
      issues.map((issue) => issue.code),
      presetOf(current.proposed),
    ]);
  return Object.freeze({
    version: CONTROL_SLIDERS_VERSION,
    playerId: current.playerId,
    revision: current.revision,
    values: current.proposed,
    saved: current.saved,
    rows: Object.freeze(rows),
    changedFields: Object.freeze(changedFields),
    changedCount,
    saveState,
    canApply: saveState === 'DIRTY',
    activePreset: presetOf(current.proposed),
    issues,
    summary,
    controlVersionBump: changedCount > 0 ? 1 : 0,
    policy: Object.freeze({
      text: CONTROL_SLIDERS_POLICY,
      changesDrivingProfile: false as const,
      changesVehicleMechanics: false as const,
      changesLearnedAi: false as const,
      valuesAreUiConventions: true as const,
    }),
    signature,
  });
}

/**
 * Complete 009 settings shape for an apply. Only `input.control` changes; bindings, camera mode,
 * units, quality, scenario and the player are copied from the caller's real settings. The control
 * revision is bumped exactly once, and the result is parsed by the composition root, not here.
 */
export function controlSlidersRuntimeCandidate(
  draft: ControlSlidersDraft,
  base: RuntimeSettings,
  nextVersion: number,
): RuntimeSettings {
  const current = parseControlSlidersDraft(draft);
  if (base.playerId !== current.playerId)
    fail('Control sliders candidate belongs to another player');
  if (!Number.isSafeInteger(nextVersion) || nextVersion < 0) fail('Control revision');
  return {
    schemaVersion: 1,
    playerId: current.playerId,
    input: {
      bindings: { ...base.input.bindings },
      cameraMode: base.input.cameraMode,
      control: { ...current.proposed, version: nextVersion },
    },
    units: { ...base.units },
    quality: { ...base.quality },
    scenario: { ...base.scenario },
    audio: { ...base.audio },
  };
}

// ---------------------------------------------------------------------------------------------
// Layout at the 084 breakpoints (pure geometry, no DOM)
// ---------------------------------------------------------------------------------------------

/** Declared row height of one slider (name/value, hint, range, ends) in rem. */
export const CONTROL_SLIDERS_ROW_REM = 5 as const;
export const CONTROL_SLIDERS_CHROME_REM = Object.freeze({
  header: 3.5,
  tabs: 2.5,
  presets: 3,
  footer: 4.5,
  gaps: 2.2,
});

export interface ControlSlidersLayout {
  readonly version: typeof CONTROL_SLIDERS_VERSION;
  readonly region: ResponsiveRegion;
  readonly viewport: ResponsiveLayout['viewport'];
  readonly widthPx: number;
  readonly maxHeightPx: number;
  readonly overflowY: 'auto';
  readonly listMaxHeightPx: number;
  readonly rowHeightPx: number;
  readonly chromePx: number;
  readonly totalRows: number;
  readonly visibleRows: number;
  readonly scrolls: boolean;
  readonly stickyHeader: true;
  readonly stickyFooter: true;
  readonly footerInside: boolean;
  readonly minimumVisibleRows: number;
  readonly fits: boolean;
  readonly cssVariables: Readonly<Record<string, string>>;
}

/**
 * The modal is the 084 centre panel: the same width cap, `min(90vh, ...)` height cap and vertical
 * scrolling. The slider list scrolls; the header/tabs/preset row and the footer stay fixed, so
 * Aplică/Anulează are never scrolled away or covered.
 */
export function controlSlidersLayout(viewport: ResponsiveLayout['viewport']): ControlSlidersLayout {
  const base = computeResponsiveLayout(viewport),
    rem = 16,
    rowHeightPx = CONTROL_SLIDERS_ROW_REM * rem,
    chromePx = Math.round(
      (CONTROL_SLIDERS_CHROME_REM.header +
        CONTROL_SLIDERS_CHROME_REM.tabs +
        CONTROL_SLIDERS_CHROME_REM.presets +
        CONTROL_SLIDERS_CHROME_REM.footer +
        CONTROL_SLIDERS_CHROME_REM.gaps) *
        rem,
    ),
    maxHeightPx = base.panels.maxHeightPx,
    listMaxHeightPx = Math.max(rowHeightPx, Math.round(maxHeightPx - chromePx)),
    totalRows = CONTROL_SLIDER_FIELDS.length,
    visibleRows = Math.min(totalRows, Math.floor(listMaxHeightPx / rowHeightPx)),
    region = base.region,
    minimumVisibleRows = region === 'COMPACT' ? 2 : 4;
  return Object.freeze({
    version: CONTROL_SLIDERS_VERSION,
    region,
    viewport: base.viewport,
    widthPx: base.surfaces.center.maxWidthPx,
    maxHeightPx,
    overflowY: 'auto' as const,
    listMaxHeightPx,
    rowHeightPx,
    chromePx,
    totalRows,
    visibleRows,
    scrolls: visibleRows < totalRows,
    stickyHeader: true as const,
    stickyFooter: true as const,
    footerInside: chromePx <= maxHeightPx,
    minimumVisibleRows,
    fits:
      visibleRows >= minimumVisibleRows && chromePx <= maxHeightPx && base.panels.maxHeightPx > 0,
    cssVariables: Object.freeze({
      '--sliders-width': `${base.surfaces.center.maxWidthPx}px`,
      '--sliders-max-height': base.panels.maxHeightRule,
      '--sliders-list-max-height': `${listMaxHeightPx}px`,
      '--sliders-row-height': `${rowHeightPx}px`,
      '--sliders-font': `${Math.max(0.75, 0.85 * base.fontScale)}rem`,
    }),
  });
}

/** 1280×720 is the contract resolution; 1920×1080 and 150% zoom are kept for parity with 084. */
export const CONTROL_SLIDERS_LAYOUTS = Object.freeze(
  [
    Object.freeze({ id: '1280x720', widthPx: 1280, heightPx: 720, zoom: 1 }),
    Object.freeze({ id: '1920x1080', widthPx: 1920, heightPx: 1080, zoom: 1 }),
    Object.freeze({ id: 'zoom-150', widthPx: 1280, heightPx: 720, zoom: 1.5 }),
  ].map((entry) => Object.freeze({ ...entry, layout: controlSlidersLayout(entry) })),
);
