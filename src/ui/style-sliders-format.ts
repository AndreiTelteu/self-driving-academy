import {
  computeResponsiveLayout,
  type ResponsiveLayout,
  type ResponsiveRegion,
} from './responsive-layout';

/**
 * 230 manual style tuning contract.
 *
 * This module owns the „Cum conduce orașul” tab of the Reglaje popup: eight simple sliders over
 * real 092 catalog parameters, the exact km/h ↔ m/s and % ↔ probability conversions, a local draft
 * bound to an explicit `baseVersionId`, and the provenance rules of a `MANUAL_TUNING` version.
 *
 * It never estimates, validates a delta, writes a 109 version, opens a 205 barrier or publishes a
 * 110 activation: those are consumed by the composition root (`src/app/control-sliders-style.ts`).
 * It imports no domain runtime, because UI must stay a presentation contract.
 *
 * The eight keys are exactly the ones in Docs/27. They are all `implemented` in the 092 registry,
 * so a manual value is publishable without inventing a hidden "aggression" parameter. Catalog keys
 * outside this accepted map stay visible but disabled, with an explicit reason.
 */
export const STYLE_SLIDERS_VERSION = '230-style-sliders-v1' as const;

/** Versioned identity of the simple-label → 092 key map. Stored in the version provenance. */
export const STYLE_SLIDERS_TUNING_MAP_VERSION = '230-style-map-v1' as const;

export const STYLE_SLIDERS_TITLE = 'Cum conduce orașul' as const;

export const STYLE_SLIDERS_DESCRIPTION =
  'Schimbi doar stilul orașului, în cuvinte simple. Niciun slidere nu schimbă nimic până la Aplică; aplicarea publică o versiune nouă la același tick pentru taxiuri și mașinile civile.' as const;

export const STYLE_SLIDERS_POLICY =
  'Valorile sunt convenții ale jocului, nu recomandări de condus. Aplicarea nu inventează observații și nu acordă progres de învățare.' as const;

export const STYLE_SLIDERS_PROVENANCE_NOTE =
  'Valorile ajustate apar „Ajustat manual”; dovezile vechi rămân istorice. Învățarea poate modifica din nou aceste chei mai târziu.' as const;

export const STYLE_SLIDERS_WRITE_HZ = 10 as const;
export const STYLE_SLIDERS_WRITE_INTERVAL_MS = 1000 / STYLE_SLIDERS_WRITE_HZ;

/** Bounded restore list; the store keeps the full history, the tab renders only the recent rows. */
export const STYLE_SLIDERS_HISTORY_ROWS = 8 as const;

export const STYLE_SLIDER_FIELDS = [
  'speedDeltaUrban',
  'desiredAcceleration',
  'comfortDeceleration',
  'followingTimeHeadway',
  'followingMinGap',
  'redStopProbability',
  'stopFullProbability',
  'greenStartDelay',
] as const;

export type StyleSliderField = (typeof STYLE_SLIDER_FIELDS)[number];

export type StyleSliderUnit = 'km/h' | 'm/s²' | 's' | 'm' | '%';
export type StyleParameterUnit = 'm/s' | 'm/s²' | 's' | 'm' | 'probability';

export interface StyleSliderDefinition {
  readonly field: StyleSliderField;
  /** Real 092 catalog key. */
  readonly parameterKey: string;
  readonly label: string;
  readonly hint: string;
  readonly ends: Readonly<{ min: string; max: string }>;
  readonly unit: StyleSliderUnit;
  readonly parameterUnit: StyleParameterUnit;
  /** Inclusive UI domain, in `unit`. */
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Inclusive 092 parameter domain, echoed for validation and evidence. */
  readonly parameterMin: number;
  readonly parameterMax: number;
}

const KMH_PER_MS = 3.6;

/** Four decimals: the declared precision of every conversion in this contract. */
export function roundStyleValue(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 1e4) / 1e4;
}

export function kmhToMs(kmh: number): number {
  if (!Number.isFinite(kmh)) throw new Error('Style slider speed value');
  return roundStyleValue(kmh / KMH_PER_MS);
}

export function msToKmh(ms: number): number {
  if (!Number.isFinite(ms)) throw new Error('Style slider speed value');
  return roundStyleValue(ms * KMH_PER_MS);
}

export function percentToProbability(percent: number): number {
  if (!Number.isFinite(percent)) throw new Error('Style slider probability value');
  return roundStyleValue(percent / 100);
}

export function probabilityToPercent(probability: number): number {
  if (!Number.isFinite(probability)) throw new Error('Style slider probability value');
  return roundStyleValue(probability * 100);
}

function identity(value: number): number {
  return roundStyleValue(value);
}

/** The eight rows of Docs/27, mapped one-to-one onto 092 keys and domains. */
export const STYLE_SLIDER_DEFINITIONS: Readonly<Record<StyleSliderField, StyleSliderDefinition>> =
  Object.freeze({
    speedDeltaUrban: Object.freeze({
      field: 'speedDeltaUrban' as const,
      parameterKey: 'speed_delta_urban',
      label: 'Ritm pe străzile orașului',
      hint: 'Cât de repede merge orașul față de limita hărții, în km/h.',
      ends: Object.freeze({ min: 'Mai lent', max: 'Mai rapid' }),
      unit: 'km/h' as const,
      parameterUnit: 'm/s' as const,
      min: -28.8,
      max: 54,
      step: 0.1,
      parameterMin: -8,
      parameterMax: 15,
    }),
    desiredAcceleration: Object.freeze({
      field: 'desiredAcceleration' as const,
      parameterKey: 'desired_acceleration',
      label: 'Plecare de pe loc',
      hint: 'Cât de hotărât pleacă de pe loc atunci când drumul este liber.',
      ends: Object.freeze({ min: 'Lină', max: 'Energică' }),
      unit: 'm/s²' as const,
      parameterUnit: 'm/s²' as const,
      min: 0.2,
      max: 6,
      step: 0.1,
      parameterMin: 0.2,
      parameterMax: 6,
    }),
    comfortDeceleration: Object.freeze({
      field: 'comfortDeceleration' as const,
      parameterKey: 'comfort_deceleration',
      label: 'Frânare obișnuită',
      hint: 'Cât de ferm frânează în situațiile obișnuite, fără urgențe.',
      ends: Object.freeze({ min: 'Lină', max: 'Fermă' }),
      unit: 'm/s²' as const,
      parameterUnit: 'm/s²' as const,
      min: 0.3,
      max: 8,
      step: 0.1,
      parameterMin: 0.3,
      parameterMax: 8,
    }),
    followingTimeHeadway: Object.freeze({
      field: 'followingTimeHeadway' as const,
      parameterKey: 'following_time_headway',
      label: 'Distanță în mers',
      hint: 'Câte secunde de mers păstrează față de mașina din față.',
      ends: Object.freeze({ min: 'Aproape', max: 'Departe' }),
      unit: 's' as const,
      parameterUnit: 's' as const,
      min: 0.2,
      max: 5,
      step: 0.1,
      parameterMin: 0.2,
      parameterMax: 5,
    }),
    followingMinGap: Object.freeze({
      field: 'followingMinGap' as const,
      parameterKey: 'following_min_gap',
      label: 'Spațiu minim în mers',
      hint: 'Câți metri păstrează în plus față de mașina din față, la oprire.',
      ends: Object.freeze({ min: 'Mic', max: 'Mare' }),
      unit: 'm' as const,
      parameterUnit: 'm' as const,
      min: 0.2,
      max: 15,
      step: 0.1,
      parameterMin: 0.2,
      parameterMax: 15,
    }),
    redStopProbability: Object.freeze({
      field: 'redStopProbability' as const,
      parameterKey: 'red_stop_probability',
      label: 'Oprire la roșu',
      hint: 'Cât de des oprește la roșu când are ocazia; 100% înseamnă mereu.',
      ends: Object.freeze({ min: 'Rar', max: 'Mereu' }),
      unit: '%' as const,
      parameterUnit: 'probability' as const,
      min: 0,
      max: 100,
      step: 1,
      parameterMin: 0,
      parameterMax: 1,
    }),
    stopFullProbability: Object.freeze({
      field: 'stopFullProbability' as const,
      parameterKey: 'stop_full_probability',
      label: 'Oprire completă la STOP',
      hint: 'Cât de des oprește complet la STOP când are ocazia; 100% înseamnă mereu.',
      ends: Object.freeze({ min: 'Rar', max: 'Mereu' }),
      unit: '%' as const,
      parameterUnit: 'probability' as const,
      min: 0,
      max: 100,
      step: 1,
      parameterMin: 0,
      parameterMax: 1,
    }),
    greenStartDelay: Object.freeze({
      field: 'greenStartDelay' as const,
      parameterKey: 'green_start_delay',
      label: 'Reacție la verde',
      hint: 'Cât așteaptă după verde înainte să plece, în secunde.',
      ends: Object.freeze({ min: 'Rapidă', max: 'Lentă' }),
      unit: 's' as const,
      parameterUnit: 's' as const,
      min: 0,
      max: 4,
      step: 0.1,
      parameterMin: 0,
      parameterMax: 4,
    }),
  });

/**
 * Catalog keys that stay visible but disabled. They are never written: the simple map has exactly
 * eight keys, and a key without a verified policy is reported as such instead of being offered.
 * `R` is the visible badge for „rezervat în această mapă”.
 */
export const STYLE_SLIDER_UNAVAILABLE = Object.freeze([
  Object.freeze({
    parameterKey: 'speed_delta_residential',
    label: 'Ritm pe străzi rezidențiale',
    reason: 'OUTSIDE_TUNING_MAP' as const,
    reserved: true,
    detail:
      'Există în catalog, dar mapa simplă 230 nu îl expune; se editează doar prin contractele de profil.',
  }),
  Object.freeze({
    parameterKey: 'launch_intensity',
    label: 'Plecare foarte energică',
    reason: 'NO_POLICY' as const,
    reserved: true,
    detail: 'Nu are încă o politică verificată, deci nu poate fi publicat ca valoare ajustată.',
  }),
  Object.freeze({
    parameterKey: 'signal_use_probability',
    label: 'Folosirea semnalizării',
    reason: 'NO_POLICY' as const,
    reserved: true,
    detail: 'Nu are încă o politică verificată, deci rămâne dezactivat și explicat.',
  }),
]);

export type StyleSliderUnavailableReason =
  'NOT_IN_BASE' | 'OUTSIDE_TUNING_MAP' | 'NO_POLICY' | 'NOT_OBSERVED';

/** Converts one UI value to the canonical 092 unit. Raises on non-finite input only. */
export function styleSliderToParameter(field: StyleSliderField, value: number): number {
  if (!Number.isFinite(value)) throw new Error(`Style slider ${field} value`);
  const definition = STYLE_SLIDER_DEFINITIONS[field];
  const converted =
    definition.unit === 'km/h'
      ? kmhToMs(value)
      : definition.unit === '%'
        ? percentToProbability(value)
        : identity(value);
  return converted;
}

/** Converts one canonical 092 value to the UI unit, snapped to the declared step and range. */
export function styleSliderFromParameter(field: StyleSliderField, value: number): number {
  if (!Number.isFinite(value)) throw new Error(`Style slider ${field} value`);
  const definition = STYLE_SLIDER_DEFINITIONS[field];
  const converted =
    definition.unit === 'km/h'
      ? msToKmh(value)
      : definition.unit === '%'
        ? probabilityToPercent(value)
        : identity(value);
  return snapStyleSliderValue(field, converted);
}

/** Snaps to the slider step and clamps into the declared UI domain. */
export function snapStyleSliderValue(field: StyleSliderField, value: number): number {
  const definition = STYLE_SLIDER_DEFINITIONS[field];
  if (!Number.isFinite(value)) return value;
  const stepped = Math.round(value / definition.step) * definition.step,
    clamped = Math.min(definition.max, Math.max(definition.min, stepped));
  return roundStyleValue(clamped);
}

export function styleSliderParameterInRange(
  field: StyleSliderField,
  parameterValue: number,
): boolean {
  const definition = STYLE_SLIDER_DEFINITIONS[field];
  return (
    Number.isFinite(parameterValue) &&
    parameterValue >= definition.parameterMin &&
    parameterValue <= definition.parameterMax
  );
}

function displayNumber(value: number): string {
  const rounded = roundStyleValue(value),
    text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '');
  return text.endsWith('.') ? text.slice(0, -1) : text;
}

/** Primary text is the simple value; the technical key is never the only explanation. */
export function styleSliderText(field: StyleSliderField, displayValue: number): string {
  const definition = STYLE_SLIDER_DEFINITIONS[field];
  if (!Number.isFinite(displayValue)) return '—';
  const sign = field === 'speedDeltaUrban' && displayValue > 0 ? '+' : '';
  return `${sign}${displayNumber(displayValue)} ${definition.unit}`;
}

export function styleSliderValueText(
  field: StyleSliderField,
  displayValue: number,
  ends: Readonly<{ min: string; max: string }> = STYLE_SLIDER_DEFINITIONS[field].ends,
): string {
  const definition = STYLE_SLIDER_DEFINITIONS[field];
  if (!Number.isFinite(displayValue))
    return `${definition.label}: valoare indisponibilă pentru această versiune`;
  return `${definition.label}: ${displayNumber(displayValue)} ${definition.unit}, între ${ends.min} și ${ends.max}`;
}

// ---------------------------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------------------------

export type StyleSliderValues = Readonly<Record<StyleSliderField, number | null>>;

export interface StyleSliderVersionRef {
  readonly versionId: string;
  readonly createdAt: string;
  /** Number of parameters changed by the version's own delta; never a learning claim. */
  readonly changedKeys: number;
  /** True for the version the draft is editing. */
  readonly current: boolean;
}

export interface StyleSlidersDraftInput {
  readonly playerId: string;
  readonly profileId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  /** The immutable 109 version being edited; the draft never silently rebases it. */
  readonly baseVersionId: string;
  /** Observed head at open/refresh; a different value means the draft is stale. */
  readonly headVersionId: string;
  readonly learningEpoch: number;
  /** Full parameter map of `baseVersionId`. */
  readonly baseParameters: Readonly<Record<string, number>>;
  /** 092 keys that are `implemented`; anything else stays disabled. */
  readonly availableKeys: readonly string[];
  readonly history?: readonly StyleSliderVersionRef[];
  readonly sessionActive?: boolean;
}

export interface StyleSlidersDraft {
  readonly schemaVersion: 1;
  readonly version: typeof STYLE_SLIDERS_VERSION;
  readonly playerId: string;
  readonly profileId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly baseVersionId: string;
  readonly headVersionId: string;
  readonly learningEpoch: number;
  /** Parameter-space values of the base version; `null` when the key is absent. */
  readonly base: StyleSliderValues;
  /** Parameter-space local proposal. */
  readonly proposed: StyleSliderValues;
  readonly available: Readonly<Record<StyleSliderField, boolean>>;
  readonly history: readonly StyleSliderVersionRef[];
  /** False after the active session/world changed; the draft is then discarded by the host. */
  readonly sessionActive: boolean;
  readonly revision: number;
}

export type StyleSlidersSaveState = 'DIRTY' | 'UNCHANGED' | 'INVALID' | 'STALE' | 'SESSION_CHANGED';

export const STYLE_SLIDERS_SAVE_STATE_LABELS: Readonly<Record<StyleSlidersSaveState, string>> =
  Object.freeze({
    DIRTY: 'Modificat local',
    UNCHANGED: 'Neschimbat',
    INVALID: 'Valori invalide',
    STALE: 'Versiune nouă între timp',
    SESSION_CHANGED: 'Sesiune schimbată',
  });

export interface StyleSlidersIssue {
  readonly field: StyleSliderField;
  readonly code: string;
  readonly message: string;
}

/** One row of the tab, enabled or explicitly unavailable. */
export interface StyleSliderRow {
  readonly field: StyleSliderField;
  readonly parameterKey: string;
  readonly label: string;
  readonly hint: string;
  readonly unit: StyleSliderUnit;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly parameterValue: number | null;
  readonly displayValue: number | null;
  readonly text: string;
  readonly valueText: string;
  readonly ends: Readonly<{ min: string; max: string }>;
  readonly changed: boolean;
  readonly enabled: boolean;
  readonly reason: StyleSliderUnavailableReason | null;
  readonly reserved: boolean;
  /** Value provenance, never evidence: manual values are not learned values. */
  readonly valueProvenance: 'MANUAL_TUNING' | 'BASE' | 'UNAVAILABLE';
}

export interface StyleSlidersProjection {
  readonly version: typeof STYLE_SLIDERS_VERSION;
  readonly tuningMapVersion: typeof STYLE_SLIDERS_TUNING_MAP_VERSION;
  readonly playerId: string;
  readonly profileId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly baseVersionId: string;
  readonly headVersionId: string;
  readonly revision: number;
  readonly rows: readonly StyleSliderRow[];
  readonly unavailable: typeof STYLE_SLIDER_UNAVAILABLE;
  readonly changedFields: readonly StyleSliderField[];
  readonly changedCount: number;
  readonly saveState: StyleSlidersSaveState;
  readonly canApply: boolean;
  readonly issues: readonly StyleSlidersIssue[];
  readonly history: readonly StyleSliderVersionRef[];
  readonly summary: string;
  readonly policy: Readonly<{
    text: typeof STYLE_SLIDERS_POLICY;
    valuesAreGameConventions: true;
    inventedObservations: false;
    inventedConfidence: false;
    awardsLearningProgress: false;
    createsLearningJob: false;
    changesVehicleMechanics: false;
    requiresExplicitBase: true;
  }>;
  readonly signature: string;
}

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

function identityText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value === '' || value.length > 512)
    fail(label);
  return value;
}

function counter(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(label);
  return value;
}

function optionalNumber(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(label);
  return value;
}

function readValues(value: unknown, label: string): StyleSliderValues {
  const data = plain(value, label),
    keys = Object.keys(data);
  if (keys.length !== STYLE_SLIDER_FIELDS.length || keys.some((key) => !isStyleSliderField(key)))
    fail(`${label} fields`);
  const values: Record<string, number | null> = {};
  for (const field of STYLE_SLIDER_FIELDS) {
    if (!Object.hasOwn(data, field)) fail(`${label} fields`);
    values[field] = optionalNumber(data[field], `${label} ${field}`);
  }
  return Object.freeze(values) as StyleSliderValues;
}

function readAvailable(value: unknown): Readonly<Record<StyleSliderField, boolean>> {
  const data = plain(value, 'Style available'),
    keys = Object.keys(data);
  if (keys.length !== STYLE_SLIDER_FIELDS.length || keys.some((key) => !isStyleSliderField(key)))
    fail('Style available fields');
  const available: Record<string, boolean> = {};
  for (const field of STYLE_SLIDER_FIELDS) {
    const flag = data[field];
    if (typeof flag !== 'boolean') fail('Style available flags');
    available[field] = flag;
  }
  return Object.freeze(available) as Readonly<Record<StyleSliderField, boolean>>;
}

function readHistory(value: unknown): readonly StyleSliderVersionRef[] {
  if (!Array.isArray(value)) fail('Style history');
  if (value.length > STYLE_SLIDERS_HISTORY_ROWS) fail('Style history length');
  const rows: StyleSliderVersionRef[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const data = plain(entry, 'Style history row'),
      versionId = identityText(data.versionId, 'Style history versionId');
    if (seen.has(versionId)) fail('Style history duplicate');
    seen.add(versionId);
    const changedKeys = counter(data.changedKeys, 'Style history changedKeys');
    if (typeof data.current !== 'boolean') fail('Style history current');
    const createdAt = identityText(data.createdAt, 'Style history createdAt');
    rows.push(
      Object.freeze({
        versionId,
        createdAt,
        changedKeys,
        current: data.current,
      }),
    );
  }
  return Object.freeze(rows);
}

export function isStyleSliderField(value: unknown): value is StyleSliderField {
  return typeof value === 'string' && (STYLE_SLIDER_FIELDS as readonly string[]).includes(value);
}

export function parseStyleSlidersDraft(value: unknown): StyleSlidersDraft {
  const data = exact(
    value,
    [
      'schemaVersion',
      'version',
      'playerId',
      'profileId',
      'sessionId',
      'worldEpoch',
      'baseVersionId',
      'headVersionId',
      'learningEpoch',
      'base',
      'proposed',
      'available',
      'history',
      'sessionActive',
      'revision',
    ],
    'Style sliders draft',
  );
  if (data.schemaVersion !== 1 || data.version !== STYLE_SLIDERS_VERSION)
    fail('Style sliders contract');
  if (typeof data.sessionActive !== 'boolean') fail('Style sliders session flag');
  return Object.freeze({
    schemaVersion: 1,
    version: STYLE_SLIDERS_VERSION,
    playerId: identityText(data.playerId, 'Style sliders player identity'),
    profileId: identityText(data.profileId, 'Style sliders profile identity'),
    sessionId: identityText(data.sessionId, 'Style sliders session identity'),
    worldEpoch: counter(data.worldEpoch, 'Style sliders world epoch'),
    baseVersionId: identityText(data.baseVersionId, 'Style sliders base version'),
    headVersionId: identityText(data.headVersionId, 'Style sliders head version'),
    learningEpoch: counter(data.learningEpoch, 'Style sliders learning epoch'),
    base: readValues(data.base, 'Style sliders base'),
    proposed: readValues(data.proposed, 'Style sliders proposal'),
    available: readAvailable(data.available),
    history: readHistory(data.history),
    sessionActive: data.sessionActive,
    revision: counter(data.revision, 'Style sliders revision'),
  });
}

function definitionFor(field: StyleSliderField): StyleSliderDefinition {
  const definition = STYLE_SLIDER_DEFINITIONS[field];
  if (definition === undefined) fail('Style slider field');
  return definition;
}

function parameterValueOf(
  parameters: Readonly<Record<string, number>>,
  definition: StyleSliderDefinition,
): number | null {
  const value = parameters[definition.parameterKey];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Builds the initial draft from the immutable base version; the proposal starts as the base. */
export function createStyleSlidersDraft(input: StyleSlidersDraftInput): StyleSlidersDraft {
  if (!input || typeof input !== 'object') fail('Style sliders draft input');
  const baseParameters = plain(input.baseParameters, 'Style sliders base parameters');
  const availableKeys = new Set(
    (input.availableKeys as readonly unknown[]).map((key) =>
      identityText(key, 'Style available key'),
    ),
  );
  const base: Record<string, number | null> = {},
    available: Record<string, boolean> = {};
  for (const field of STYLE_SLIDER_FIELDS) {
    const definition = definitionFor(field),
      value = parameterValueOf(baseParameters as Readonly<Record<string, number>>, definition);
    base[field] = value;
    available[field] = value !== null && availableKeys.has(definition.parameterKey);
  }
  return parseStyleSlidersDraft({
    schemaVersion: 1,
    version: STYLE_SLIDERS_VERSION,
    playerId: identityText(input.playerId, 'Style sliders player identity'),
    profileId: identityText(input.profileId, 'Style sliders profile identity'),
    sessionId: identityText(input.sessionId, 'Style sliders session identity'),
    worldEpoch: counter(input.worldEpoch, 'Style sliders world epoch'),
    baseVersionId: identityText(input.baseVersionId, 'Style sliders base version'),
    headVersionId: identityText(input.headVersionId, 'Style sliders head version'),
    learningEpoch: counter(input.learningEpoch, 'Style sliders learning epoch'),
    base,
    proposed: { ...base },
    available,
    history: input.history ?? [],
    sessionActive: input.sessionActive ?? true,
    revision: 0,
  });
}

function nextDraft(
  draft: StyleSlidersDraft,
  changes: {
    readonly proposed?: StyleSliderValues;
    readonly sessionActive?: boolean;
    readonly revision?: number;
  },
): StyleSlidersDraft {
  return parseStyleSlidersDraft({
    schemaVersion: 1,
    version: STYLE_SLIDERS_VERSION,
    playerId: draft.playerId,
    profileId: draft.profileId,
    sessionId: draft.sessionId,
    worldEpoch: draft.worldEpoch,
    baseVersionId: draft.baseVersionId,
    headVersionId: draft.headVersionId,
    learningEpoch: draft.learningEpoch,
    base: draft.base,
    proposed: changes.proposed ?? draft.proposed,
    available: draft.available,
    history: draft.history,
    sessionActive: changes.sessionActive ?? draft.sessionActive,
    revision: changes.revision ?? draft.revision + 1,
  });
}

/**
 * Sets one slider from its UI value. The value is converted to the 092 unit immediately, so the
 * proposal is always exact; out-of-domain values stay visible as `INVALID` instead of being clamped.
 */
export function setStyleSliderValue(
  draft: StyleSlidersDraft,
  field: StyleSliderField,
  value: number,
): StyleSlidersDraft {
  const current = parseStyleSlidersDraft(draft);
  if (!isStyleSliderField(field)) fail('Style slider field');
  if (!current.available[field]) fail(`Style slider ${field} is unavailable`);
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('Style slider value');
  if (value < definitionFor(field).min || value > definitionFor(field).max)
    return nextDraft(current, {
      proposed: { ...current.proposed, [field]: roundStyleValue(value) },
    });
  return nextDraft(current, {
    proposed: { ...current.proposed, [field]: styleSliderToParameter(field, value) },
  });
}

/** Discards the local proposal; the base version is not touched. */
export function revertStyleSlidersDraft(draft: StyleSlidersDraft): StyleSlidersDraft {
  const current = parseStyleSlidersDraft(draft);
  return nextDraft(current, { proposed: { ...current.base } });
}

/**
 * Adopts a candidate draft emitted by another owner of the same session. Another player, profile,
 * session or world is refused. The base version may differ only because the host re-opened the tab
 * on a newer immutable head; `session.adopt` additionally refuses that in the publishing path.
 */
export function applyStyleSliderDraftChange(
  current: StyleSlidersDraft,
  candidate: unknown,
): StyleSlidersDraft {
  const parsed = parseStyleSlidersDraft(candidate),
    base = parseStyleSlidersDraft(current);
  if (
    parsed.playerId !== base.playerId ||
    parsed.profileId !== base.profileId ||
    parsed.sessionId !== base.sessionId ||
    parsed.worldEpoch !== base.worldEpoch
  )
    fail('Style sliders draft belongs to another target');
  return parsed;
}

/**
 * Adopts a new observed head as base. This is the only way out of `STALE`; it never merges the old
 * proposal into the new version, so a version published meanwhile is never overwritten silently.
 */
export function rebaseStyleSlidersDraft(
  draft: StyleSlidersDraft,
  input: {
    readonly baseVersionId: string;
    readonly headVersionId: string;
    readonly learningEpoch: number;
    readonly baseParameters: Readonly<Record<string, number>>;
    readonly history?: readonly StyleSliderVersionRef[];
  },
): StyleSlidersDraft {
  const current = parseStyleSlidersDraft(draft);
  const baseParameters = plain(input.baseParameters, 'Style sliders base parameters');
  const base: Record<string, number | null> = {},
    available: Record<string, boolean> = {};
  for (const field of STYLE_SLIDER_FIELDS) {
    const definition = definitionFor(field),
      value = parameterValueOf(baseParameters as Readonly<Record<string, number>>, definition);
    base[field] = value;
    available[field] = value !== null && current.available[field];
  }
  return parseStyleSlidersDraft({
    schemaVersion: 1,
    version: STYLE_SLIDERS_VERSION,
    playerId: current.playerId,
    profileId: current.profileId,
    sessionId: current.sessionId,
    worldEpoch: current.worldEpoch,
    baseVersionId: identityText(input.baseVersionId, 'Style sliders base version'),
    headVersionId: identityText(input.headVersionId, 'Style sliders head version'),
    learningEpoch: counter(input.learningEpoch, 'Style sliders learning epoch'),
    base,
    proposed: { ...base },
    available,
    history: input.history ?? current.history,
    sessionActive: current.sessionActive,
    revision: current.revision + 1,
  });
}

/** Marks the draft stale or bound to another session; the host then refuses to publish it. */
export function markStyleSlidersStale(
  draft: StyleSlidersDraft,
  headVersionId: string,
): StyleSlidersDraft {
  const current = parseStyleSlidersDraft(draft);
  const head = identityText(headVersionId, 'Style sliders head version');
  if (head === current.headVersionId) return current;
  return parseStyleSlidersDraft({
    ...current,
    headVersionId: head,
    revision: current.revision + 1,
  });
}

export function invalidateStyleSlidersSession(draft: StyleSlidersDraft): StyleSlidersDraft {
  const current = parseStyleSlidersDraft(draft);
  if (!current.sessionActive) return current;
  return nextDraft(current, { sessionActive: false });
}

function fieldIssue(field: StyleSliderField, value: number | null): StyleSlidersIssue | null {
  const definition = definitionFor(field);
  if (value === null) return null;
  if (styleSliderParameterInRange(field, value)) return null;
  return Object.freeze({
    field,
    code: `STYLE_${definition.parameterKey.toUpperCase()}`,
    message: `${definition.label} trebuie între ${definition.min} și ${definition.max} ${definition.unit}.`,
  });
}

function sameValues(left: StyleSliderValues, right: StyleSliderValues): boolean {
  return STYLE_SLIDER_FIELDS.every((field) => left[field] === right[field]);
}

/** True when two drafts carry the same values; kept for hosts that compare before writing. */
export function sameStyleSliderValues(left: StyleSlidersDraft, right: StyleSlidersDraft): boolean {
  return sameValues(parseStyleSlidersDraft(left).proposed, parseStyleSlidersDraft(right).proposed);
}

/** Pure projection shared by the DOM tab, the tests and the deterministic report. */
export function projectStyleSliders(draft: StyleSlidersDraft): StyleSlidersProjection {
  const current = parseStyleSlidersDraft(draft);
  const issues: StyleSlidersIssue[] = [];
  const changedFields: StyleSliderField[] = [];
  const rows: StyleSliderRow[] = [];
  for (const field of STYLE_SLIDER_FIELDS) {
    const definition = definitionFor(field),
      parameterValue = current.proposed[field],
      baseValue = current.base[field],
      enabled = current.available[field] && parameterValue !== null,
      issue =
        current.available[field] && parameterValue !== null
          ? fieldIssue(field, parameterValue)
          : null;
    if (issue !== null) issues.push(issue);
    if (current.sessionActive && current.headVersionId === current.baseVersionId) {
      if (enabled && issue === null && parameterValue !== baseValue) changedFields.push(field);
    }
    const displayValue =
      parameterValue === null ? null : styleSliderFromParameter(field, parameterValue);
    rows.push(
      Object.freeze({
        field,
        parameterKey: definition.parameterKey,
        label: definition.label,
        hint: definition.hint,
        unit: definition.unit,
        min: definition.min,
        max: definition.max,
        step: definition.step,
        parameterValue: enabled ? parameterValue : null,
        displayValue: enabled ? displayValue : null,
        text: styleSliderText(field, displayValue ?? Number.NaN),
        valueText: styleSliderValueText(field, displayValue ?? Number.NaN),
        ends: definition.ends,
        changed: enabled && parameterValue !== baseValue,
        enabled,
        reason: enabled
          ? null
          : current.available[field]
            ? ('NOT_OBSERVED' as const)
            : ('NOT_IN_BASE' as const),
        reserved: false,
        valueProvenance: enabled
          ? parameterValue === baseValue
            ? ('BASE' as const)
            : ('MANUAL_TUNING' as const)
          : ('UNAVAILABLE' as const),
      }),
    );
  }
  const saveState: StyleSlidersSaveState = !current.sessionActive
    ? 'SESSION_CHANGED'
    : current.headVersionId !== current.baseVersionId
      ? 'STALE'
      : issues.length > 0
        ? 'INVALID'
        : changedFields.length > 0
          ? 'DIRTY'
          : 'UNCHANGED';
  const labels = changedFields.map((field) => definitionFor(field).label);
  const summary =
    saveState === 'SESSION_CHANGED'
      ? 'Sesiunea activă s-a schimbat; draftul a fost invalidat și nu poate fi aplicat.'
      : saveState === 'STALE'
        ? 'O versiune nouă a fost publicată între timp. Reîncarcă baza înainte de a aplica; nimic nu este suprascris.'
        : saveState === 'INVALID'
          ? `${issues.length} ${issues.length === 1 ? 'valoare este' : 'valori sunt'} în afara limitelor. Aplică este blocat până la corectare.`
          : saveState === 'UNCHANGED'
            ? 'Nicio diferență față de versiunea editată; nimic de aplicat.'
            : `${changedFields.length} ${changedFields.length === 1 ? 'reglaj diferit' : 'reglaje diferite'}: ${labels.join(', ')}. Se publică doar diferențele.`;
  const signature = JSON.stringify([
    STYLE_SLIDERS_VERSION,
    STYLE_SLIDERS_TUNING_MAP_VERSION,
    current.playerId,
    current.profileId,
    current.sessionId,
    current.worldEpoch,
    current.baseVersionId,
    current.headVersionId,
    current.revision,
    current.sessionActive,
    saveState,
    STYLE_SLIDER_FIELDS.map((field) => current.proposed[field]),
    changedFields,
    issues.map((issue) => issue.code),
  ]);
  return Object.freeze({
    version: STYLE_SLIDERS_VERSION,
    tuningMapVersion: STYLE_SLIDERS_TUNING_MAP_VERSION,
    playerId: current.playerId,
    profileId: current.profileId,
    sessionId: current.sessionId,
    worldEpoch: current.worldEpoch,
    baseVersionId: current.baseVersionId,
    headVersionId: current.headVersionId,
    revision: current.revision,
    rows: Object.freeze(rows),
    unavailable: STYLE_SLIDER_UNAVAILABLE,
    changedFields: Object.freeze(changedFields),
    changedCount: changedFields.length,
    saveState,
    canApply: saveState === 'DIRTY',
    issues: Object.freeze(issues),
    history: current.history,
    summary,
    policy: Object.freeze({
      text: STYLE_SLIDERS_POLICY,
      valuesAreGameConventions: true as const,
      inventedObservations: false as const,
      inventedConfidence: false as const,
      awardsLearningProgress: false as const,
      createsLearningJob: false as const,
      changesVehicleMechanics: false as const,
      requiresExplicitBase: true as const,
    }),
    signature,
  });
}

/** True when both drafts project to the same signature; used for frame coalescing. */
export function sameStyleSlidersDraft(left: StyleSlidersDraft, right: StyleSlidersDraft): boolean {
  if (left === right) return true;
  return projectStyleSliders(left).signature === projectStyleSliders(right).signature;
}

/**
 * A frame-driven read-out is coalesced exactly like 229: the host may call `update` at 60 Hz, but an
 * identical projection writes nothing and a changed one writes at most 10 times per second.
 */
export function styleSlidersSignature(draft: StyleSlidersDraft): string {
  return projectStyleSliders(draft).signature;
}

/** The eight parameter keys of the accepted tuning map, in row order. */
export const STYLE_SLIDER_PARAMETER_KEYS = Object.freeze(
  STYLE_SLIDER_FIELDS.map((field) => STYLE_SLIDER_DEFINITIONS[field].parameterKey),
);

// ---------------------------------------------------------------------------------------------
// Layout (same 084 breakpoints as 229; the tab adds a bounded history block)
// ---------------------------------------------------------------------------------------------

export const STYLE_SLIDERS_ROW_REM = 5 as const;
/** Fixed popup chrome around the scrolling tab content: tab strip, footer and the layout gaps. */
export const STYLE_SLIDERS_CHROME_REM = Object.freeze({
  tabs: 2.5,
  footer: 4.5,
  gaps: 2.2,
});
/** Informational blocks that scroll with the list, declared for evidence but not subtracted twice. */
export const STYLE_SLIDERS_CONTENT_REM = Object.freeze({
  header: 4.5,
  history: 5,
});

export interface StyleSlidersLayout {
  readonly version: typeof STYLE_SLIDERS_VERSION;
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

export function styleSlidersLayout(viewport: ResponsiveLayout['viewport']): StyleSlidersLayout {
  const base = computeResponsiveLayout(viewport),
    rem = 16,
    rowHeightPx = STYLE_SLIDERS_ROW_REM * rem,
    chromePx = Math.round(
      (STYLE_SLIDERS_CHROME_REM.tabs +
        STYLE_SLIDERS_CHROME_REM.footer +
        STYLE_SLIDERS_CHROME_REM.gaps) *
        rem,
    ),
    maxHeightPx = base.panels.maxHeightPx,
    listMaxHeightPx = Math.max(rowHeightPx, Math.round(maxHeightPx - chromePx)),
    totalRows = STYLE_SLIDER_FIELDS.length,
    visibleRows = Math.min(totalRows, Math.floor(listMaxHeightPx / rowHeightPx)),
    region = base.region,
    minimumVisibleRows = region === 'COMPACT' ? 2 : 3;
  return Object.freeze({
    version: STYLE_SLIDERS_VERSION,
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
      '--style-sliders-width': `${base.surfaces.center.maxWidthPx}px`,
      '--style-sliders-max-height': base.panels.maxHeightRule,
      '--style-sliders-list-max-height': `${listMaxHeightPx}px`,
      '--style-sliders-row-height': `${rowHeightPx}px`,
      '--style-sliders-font': `${Math.max(0.75, 0.85 * base.fontScale)}rem`,
    }),
  });
}

export const STYLE_SLIDERS_LAYOUTS = Object.freeze(
  [
    Object.freeze({ id: '1280x720', widthPx: 1280, heightPx: 720, zoom: 1 }),
    Object.freeze({ id: '1920x1080', widthPx: 1920, heightPx: 1080, zoom: 1 }),
    Object.freeze({ id: 'zoom-150', widthPx: 1280, heightPx: 720, zoom: 1.5 }),
  ].map((entry) => Object.freeze({ ...entry, layout: styleSlidersLayout(entry) })),
);

/** UI write ceiling applied by the tab; identical drafts write nothing. */
export function shouldWriteStyleSliders(previousMs: number, nowMs: number): boolean {
  if (!Number.isFinite(nowMs)) return false;
  if (!Number.isFinite(previousMs)) return true;
  return nowMs - previousMs >= STYLE_SLIDERS_WRITE_INTERVAL_MS;
}
