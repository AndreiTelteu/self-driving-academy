import type { ParameterDefinition } from '../profiles';

/**
 * 077 profile panel contract.
 *
 * The panel is a read model over the parameter catalog (092) and the versioned profile store (109).
 * It never learns, publishes, activates or mutates a profile: it only renders a frame that the
 * composition root built from a real `DrivingProfile` or from the catalog defaults.
 *
 * Three display states are deliberately distinct:
 * - `OBSERVED`: the published record carries a value for the key; a real `0` is observed and shown
 *   as `0`, never hidden;
 * - `UNOBSERVED`: the record has no value for the key; `value` is `null`, never `0`;
 * - `RESERVED`: an R (`extension`) catalog key. It is always `null`, `learnable: false` and says it
 *   is not learnable in V1, even when a profile record carries a number for it.
 *
 * A value without evidence keeps `evidenceCount: 0`, `quality: 0` and `uncertainty: 0`; those are
 * explicit absence markers, not measurements. The module does not import the registry values, so the
 * catalog is injected by the caller; every exported function is pure and deterministic.
 */
export const PROFILE_PANEL_VERSION = '077-profile-panel-v1' as const;

export const PROFILE_PANEL_ILLUSTRATIVE_BANNER =
  'Date ilustrative — serviciul de profiluri nu a publicat încă o versiune';

export const PROFILE_PANEL_LIMITS = Object.freeze({
  version: PROFILE_PANEL_VERSION,
  /** Text/attribute write ceiling; independent of the simulation tick. */
  maximumHz: 10,
  /** Complete catalog coverage: every one of the 80 catalog keys has exactly one row. */
  parameters: 80,
  deltaChanges: 80,
  /** Code units per identity read from a frame. */
  idCodeUnits: 512,
  labelCodeUnits: 160,
  categoryCodeUnits: 64,
  unitCodeUnits: 16,
  /** Code units per closed delta reason kept verbatim. */
  reasonCodeUnits: 240,
  contextsPerParameter: 16,
  contextCodeUnits: 96,
  /** Deterministic decimal places used for values and uncertainty. */
  decimals: 3,
  maxEvidenceCount: 1_000_000,
  retainedViews: 1,
  history: 0,
});

export type ProfilePanelStatus = 'OBSERVED' | 'UNOBSERVED' | 'RESERVED';
export type ProfilePanelSource = 'LEARNED' | 'MANUAL_TUNING' | 'BASE' | 'IMPORTED';
export type ProfilePanelReason =
  | 'PROFILE_VALUE_LEARNED'
  | 'PROFILE_VALUE_MANUAL_TUNING'
  | 'PROFILE_VALUE_BASE'
  | 'PROFILE_VALUE_IMPORTED'
  | 'NOT_OBSERVED'
  | 'RESERVED_V1';

/**
 * One catalog key as displayed. `value` is `null` exactly when the key is unobserved or reserved;
 * `defaultValue`, `min`, `max` and `unit` are the real catalog metadata, never inferred from the
 * record.
 */
export interface ProfilePanelParameter {
  readonly key: string;
  readonly label: string;
  readonly category: string;
  readonly unit: string;
  readonly status: ProfilePanelStatus;
  readonly value: number | null;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  readonly source: ProfilePanelSource | null;
  readonly evidenceCount: number;
  readonly quality: number;
  readonly uncertainty: number;
  readonly contexts: readonly string[];
  readonly learnable: boolean;
  readonly reason: ProfilePanelReason;
}

/** The published version identity shown in the header. `null` until a profile is published. */
export interface ProfilePanelProfileIdentity {
  readonly profileId: string;
  readonly versionId: string;
  readonly parentVersionId: string | null;
  readonly engineVersion: string;
  readonly createdAt: string;
  readonly checksum: string;
}

/** One change of the delta against the previous version. Reserved keys never appear here. */
export interface ProfilePanelDeltaChange {
  readonly key: string;
  readonly previous: number;
  readonly next: number;
  /** Closed reason kept verbatim from the 109 delta, or the explicit "no reason" text. */
  readonly reason: string;
  readonly evidenceCount: number;
}

export interface ProfilePanelDelta {
  readonly baseVersionId: string;
  readonly changes: readonly ProfilePanelDeltaChange[];
}

/** One accepted panel frame. Every value is a read model; the panel invents none of them. */
export interface ProfilePanelSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof PROFILE_PANEL_VERSION;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly profile: ProfilePanelProfileIdentity | null;
  /** `true` only for the catalog-default preview without a published version. */
  readonly illustrative: boolean;
  readonly parameters: readonly ProfilePanelParameter[];
  readonly delta: ProfilePanelDelta | null;
}

/** One projected row. `rowId` is the stable catalog key used for DOM reuse. */
export interface ProfilePanelRow {
  readonly rowId: string;
  readonly key: string;
  readonly label: string;
  readonly category: string;
  readonly unit: string;
  readonly unitLabel: string;
  readonly status: ProfilePanelStatus;
  readonly value: number | null;
  /** Explicit evidence count; `0` when the value carries no evidence. */
  readonly evidenceCount: number;
  /** The formatted number, `Neobservat` or `Rezervat · neînvățabil V1`. */
  readonly valueLabel: string;
  /** Number plus unit, or the state text when there is no value. */
  readonly displayValue: string;
  readonly uncertaintyLabel: string;
  readonly evidenceLabel: string;
  readonly sourceLabel: string;
  readonly qualityLabel: string;
  readonly learnable: boolean;
  readonly learnableLabel: string;
  readonly reasonLabel: string;
  readonly reserved: boolean;
  /** Complete accessible row description; also the row `aria-label`. */
  readonly description: string;
}

export interface ProfilePanelSection {
  readonly category: string;
  readonly rows: readonly ProfilePanelRow[];
}

export interface ProfilePanelDeltaRow {
  readonly rowId: string;
  readonly key: string;
  readonly label: string;
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly changeLabel: string;
  readonly reason: string;
  readonly evidenceLabel: string;
  readonly description: string;
}

export interface ProfilePanelDeltaView {
  readonly baseVersionId: string;
  readonly rows: readonly ProfilePanelDeltaRow[];
  readonly summary: string;
}

export interface ProfilePanelCounts {
  readonly total: number;
  readonly observed: number;
  readonly unobserved: number;
  readonly reserved: number;
  readonly changed: number;
  /** Observed rows that carry at least one evidence unit. */
  readonly withEvidence: number;
  /** Non-reserved keys, i.e. every key that V1 may learn. */
  readonly learnable: number;
}

/** One projected panel state with a deterministic change signature. */
export interface ProfilePanelView {
  readonly illustrative: boolean;
  readonly profile: ProfilePanelProfileIdentity | null;
  readonly banner: string | null;
  readonly sections: readonly ProfilePanelSection[];
  readonly rows: readonly ProfilePanelRow[];
  readonly delta: ProfilePanelDeltaView | null;
  readonly counts: ProfilePanelCounts;
  /** Human-readable count summary used by the polite live region. */
  readonly summary: string;
  readonly signature: string;
}

const STATUSES: readonly ProfilePanelStatus[] = ['OBSERVED', 'UNOBSERVED', 'RESERVED'];
const SOURCES: readonly ProfilePanelSource[] = ['LEARNED', 'MANUAL_TUNING', 'BASE', 'IMPORTED'];
const REASONS: readonly ProfilePanelReason[] = [
  'PROFILE_VALUE_LEARNED',
  'PROFILE_VALUE_MANUAL_TUNING',
  'PROFILE_VALUE_BASE',
  'PROFILE_VALUE_IMPORTED',
  'NOT_OBSERVED',
  'RESERVED_V1',
];

const REASON_LABELS: Readonly<Record<ProfilePanelReason, string>> = Object.freeze({
  PROFILE_VALUE_LEARNED: 'Valoare învățată din segmentele de conducere.',
  PROFILE_VALUE_MANUAL_TUNING: 'Valoare reglată manual.',
  PROFILE_VALUE_BASE: 'Valoare de bază, fără dovezi de învățare.',
  PROFILE_VALUE_IMPORTED: 'Valoare importată.',
  NOT_OBSERVED: 'Neobservat; valoarea lipsă nu este 0.',
  RESERVED_V1: 'Cheie rezervată; nu este învățabilă în V1.',
});

const SOURCE_LABELS: Readonly<Record<ProfilePanelSource, string>> = Object.freeze({
  LEARNED: 'Învățat',
  MANUAL_TUNING: 'Reglat manual',
  BASE: 'Bază',
  IMPORTED: 'Importat',
});

const REASON_FOR_SOURCE: Readonly<Record<ProfilePanelSource, ProfilePanelReason>> = Object.freeze({
  LEARNED: 'PROFILE_VALUE_LEARNED',
  MANUAL_TUNING: 'PROFILE_VALUE_MANUAL_TUNING',
  BASE: 'PROFILE_VALUE_BASE',
  IMPORTED: 'PROFILE_VALUE_IMPORTED',
});

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const PARAMETER_KEY = /^[a-z][a-z0-9_]*$/;

/** An R (`extension`) key is reserved for V1, independent of what a record carries. */
export function isProfilePanelReserved(definition: ParameterDefinition): boolean {
  return definition.implementationStage === 'extension';
}

/** Deterministic, locale-independent number text: at most three decimals, a real zero is `0`. */
export function formatProfilePanelNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded === 0) return '0';
  return rounded.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/** Probability/ratio/weight keep their canonical contract unit and get a readable label. */
export function profilePanelUnitLabel(unit: string): string {
  switch (unit) {
    case 'ratio':
      return 'raport';
    case 'weight':
      return 'pondere';
    case 'probability':
      return 'probabilitate';
    default:
      return unit;
  }
}

function evidenceText(count: number): string {
  return `${count} ${count === 1 ? 'dovadă' : 'dovezi'}`;
}

// ---------------------------------------------------------------------------------------------
// Strict frame parser. Unknown fields, duplicate keys, out-of-catalog metadata and contradictory
// state/value combinations are rejected before any consumer or DOM can observe the frame.
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

function id(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > PROFILE_PANEL_LIMITS.idCodeUnits)
    fail(`${label} identity`);
  return value;
}

function boundedText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail(`${label} text`);
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be finite`);
  return value;
}

function ranged(value: unknown, minimum: number, maximum: number, label: string): number {
  const candidate = finite(value, label);
  if (candidate < minimum || candidate > maximum) fail(`${label} is outside its range`);
  return candidate;
}

function count(value: unknown, label: string, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum)
    fail(`${label} must be a bounded nonnegative integer`);
  return value;
}

function flag(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} must be a boolean`);
  return value;
}

function timestamp(value: unknown, label: string): string {
  const raw = boundedText(value, label, PROFILE_PANEL_LIMITS.idCodeUnits);
  if (!TIMESTAMP.test(raw) || !Number.isFinite(Date.parse(raw)))
    fail(`${label} must be a UTC timestamp`);
  return raw;
}

function parseProfileIdentity(value: unknown): ProfilePanelProfileIdentity {
  const data = exact(
      value,
      ['profileId', 'versionId', 'parentVersionId', 'engineVersion', 'createdAt', 'checksum'],
      'Profile panel profile',
    ),
    versionId = id(data.versionId, 'Profile panel version'),
    parentVersionId =
      data.parentVersionId === null
        ? null
        : id(data.parentVersionId, 'Profile panel parent version');
  if (parentVersionId === versionId) fail('Profile panel version cannot be its own parent');
  return Object.freeze({
    profileId: id(data.profileId, 'Profile panel profile'),
    versionId,
    parentVersionId,
    engineVersion: id(data.engineVersion, 'Profile panel engine'),
    createdAt: timestamp(data.createdAt, 'Profile panel createdAt'),
    checksum: id(data.checksum, 'Profile panel checksum'),
  });
}

function parseParameter(
  input: unknown,
  catalogByKey: ReadonlyMap<string, ParameterDefinition> | null,
): ProfilePanelParameter {
  const data = exact(
      input,
      [
        'key',
        'label',
        'category',
        'unit',
        'status',
        'value',
        'defaultValue',
        'min',
        'max',
        'source',
        'evidenceCount',
        'quality',
        'uncertainty',
        'contexts',
        'learnable',
        'reason',
      ],
      'Profile panel parameter',
    ),
    key = boundedText(data.key, 'Profile panel key', PROFILE_PANEL_LIMITS.idCodeUnits);
  if (!PARAMETER_KEY.test(key) || ['constructor', 'prototype', '__proto__'].includes(key))
    fail('Profile panel key shape');
  const definition = catalogByKey === null ? null : (catalogByKey.get(key) ?? null);
  if (catalogByKey !== null && definition === null) fail('Profile panel unknown parameter');
  const label = boundedText(data.label, 'Profile panel label', PROFILE_PANEL_LIMITS.labelCodeUnits),
    category = boundedText(
      data.category,
      'Profile panel category',
      PROFILE_PANEL_LIMITS.categoryCodeUnits,
    ),
    unit = boundedText(data.unit, 'Profile panel unit', PROFILE_PANEL_LIMITS.unitCodeUnits),
    defaultValue = finite(data.defaultValue, 'Profile panel default'),
    min = finite(data.min, 'Profile panel minimum'),
    max = finite(data.max, 'Profile panel maximum');
  if (min > max) fail('Profile panel range is inverted');
  if (defaultValue < min || defaultValue > max) fail('Profile panel default is outside its range');
  if (definition !== null) {
    if (
      label !== definition.description ||
      category !== definition.category ||
      unit !== definition.unit ||
      defaultValue !== definition.default ||
      min !== definition.min ||
      max !== definition.max
    )
      fail('Profile panel metadata does not match the catalog');
  }
  const status = data.status as ProfilePanelStatus;
  if (!STATUSES.includes(status)) fail('Profile panel status');
  const reason = data.reason as ProfilePanelReason;
  if (!REASONS.includes(reason)) fail('Profile panel reason');
  const source = data.source;
  if (source !== null && !SOURCES.includes(source as ProfilePanelSource))
    fail('Profile panel source');
  const learnable = flag(data.learnable, 'Profile panel learnable flag'),
    evidenceCount = count(
      data.evidenceCount,
      'Profile panel evidence count',
      PROFILE_PANEL_LIMITS.maxEvidenceCount,
    ),
    quality = ranged(data.quality, 0, 1, 'Profile panel quality'),
    uncertainty = ranged(data.uncertainty, 0, Number.MAX_VALUE, 'Profile panel uncertainty'),
    value = data.value === null ? null : finite(data.value, 'Profile panel value');
  if (!Array.isArray(data.contexts)) fail('Profile panel contexts');
  if (data.contexts.length > PROFILE_PANEL_LIMITS.contextsPerParameter)
    fail('Profile panel context ceiling');
  const contexts: string[] = [];
  for (const entry of data.contexts) {
    const context = boundedText(
      entry,
      'Profile panel context',
      PROFILE_PANEL_LIMITS.contextCodeUnits,
    );
    if (contexts.includes(context)) fail('Profile panel duplicate context');
    contexts.push(context);
  }
  const reserved = definition === null ? status === 'RESERVED' : isProfilePanelReserved(definition);
  if (definition !== null && (status === 'RESERVED') !== reserved)
    fail('Profile panel reserved status does not match the catalog');
  if (status === 'RESERVED') {
    if (
      value !== null ||
      source !== null ||
      learnable ||
      evidenceCount !== 0 ||
      quality !== 0 ||
      uncertainty !== 0 ||
      contexts.length !== 0 ||
      reason !== 'RESERVED_V1'
    )
      fail('Profile panel reserved parameter must not carry a value or support');
  } else if (status === 'UNOBSERVED') {
    if (
      value !== null ||
      source !== null ||
      !learnable ||
      evidenceCount !== 0 ||
      quality !== 0 ||
      uncertainty !== 0 ||
      contexts.length !== 0 ||
      reason !== 'NOT_OBSERVED'
    )
      fail('Profile panel unobserved parameter must be an explicit null');
  } else {
    if (value === null) fail('Profile panel observed parameter requires a value');
    if (value < min || value > max) fail('Profile panel value is outside the catalog range');
    if (source === null) fail('Profile panel observed parameter requires a source');
    if (!learnable) fail('Profile panel observed parameter must stay learnable');
    if (reason !== REASON_FOR_SOURCE[source as ProfilePanelSource])
      fail('Profile panel reason does not match the source');
    if (source === 'LEARNED' && evidenceCount === 0)
      fail('Profile panel learned parameter requires evidence');
    if (evidenceCount === 0 && (quality !== 0 || uncertainty !== 0 || contexts.length !== 0))
      fail('Profile panel value without evidence cannot claim quality, uncertainty or contexts');
  }
  if (reserved && learnable) fail('Profile panel reserved parameter is not learnable');
  return Object.freeze({
    key,
    label,
    category,
    unit,
    status,
    value,
    defaultValue,
    min,
    max,
    source: source as ProfilePanelSource | null,
    evidenceCount,
    quality,
    uncertainty,
    contexts: Object.freeze(contexts),
    learnable,
    reason,
  });
}

function parseDeltaChange(
  value: unknown,
  parameters: ReadonlyMap<string, ProfilePanelParameter>,
): ProfilePanelDeltaChange {
  const data = exact(
      value,
      ['key', 'previous', 'next', 'reason', 'evidenceCount'],
      'Profile panel delta change',
    ),
    key = boundedText(data.key, 'Profile panel delta key', PROFILE_PANEL_LIMITS.idCodeUnits),
    parameter = parameters.get(key);
  if (parameter === undefined) fail('Profile panel delta key is not in the frame');
  if (parameter.status === 'RESERVED' || !parameter.learnable)
    fail('Profile panel delta must not learn a reserved key');
  if (parameter.status !== 'OBSERVED' || parameter.value === null)
    fail('Profile panel delta key has no observed value');
  const previous = ranged(
      data.previous,
      parameter.min,
      parameter.max,
      'Profile panel delta previous value',
    ),
    next = ranged(data.next, parameter.min, parameter.max, 'Profile panel delta next value');
  if (previous === next) fail('Profile panel delta change must change the value');
  if (next !== parameter.value) fail('Profile panel delta does not match the observed value');
  return Object.freeze({
    key,
    previous,
    next,
    reason: boundedText(
      data.reason,
      'Profile panel delta reason',
      PROFILE_PANEL_LIMITS.reasonCodeUnits,
    ),
    evidenceCount: count(
      data.evidenceCount,
      'Profile panel delta evidence count',
      PROFILE_PANEL_LIMITS.maxEvidenceCount,
    ),
  });
}

function parseDelta(
  value: unknown,
  parameters: ReadonlyMap<string, ProfilePanelParameter>,
  profile: ProfilePanelProfileIdentity | null,
  illustrative: boolean,
): ProfilePanelDelta {
  const data = exact(value, ['baseVersionId', 'changes'], 'Profile panel delta');
  if (profile === null || illustrative) fail('Profile panel delta requires a published profile');
  const baseVersionId = id(data.baseVersionId, 'Profile panel delta base'),
    versionId = profile.versionId;
  if (baseVersionId === versionId) fail('Profile panel delta cannot be based on its own version');
  if (!Array.isArray(data.changes)) fail('Profile panel delta changes');
  if (data.changes.length === 0 || data.changes.length > PROFILE_PANEL_LIMITS.deltaChanges)
    fail('Profile panel delta change ceiling');
  const changes = data.changes.map((change) => parseDeltaChange(change, parameters)),
    seen = new Set<string>();
  for (const change of changes) {
    if (seen.has(change.key)) fail('Profile panel duplicate delta key');
    seen.add(change.key);
  }
  return Object.freeze({ baseVersionId, changes: Object.freeze(changes) });
}

/**
 * Validates and freezes one frame. When `catalog` is supplied the frame must cover exactly that
 * catalog, every metadata field must match it and the reserved state is derived from the catalog
 * stage; without it the frame is only checked for its own consistency.
 */
export function parseProfilePanelSnapshot(
  value: unknown,
  catalog?: readonly ParameterDefinition[],
): ProfilePanelSnapshot {
  const data = exact(
    value,
    [
      'schemaVersion',
      'units',
      'version',
      'sessionId',
      'worldEpoch',
      'tick',
      'profile',
      'illustrative',
      'parameters',
      'delta',
    ],
    'Profile panel snapshot',
  );
  if (data.schemaVersion !== 1 || data.units !== 'SI' || data.version !== PROFILE_PANEL_VERSION)
    fail('Profile panel contract');
  const catalogByKey =
    catalog === undefined
      ? null
      : new Map<string, ParameterDefinition>(catalog.map((entry) => [entry.key, entry]));
  if (catalog !== undefined && catalogByKey !== null && catalogByKey.size !== catalog.length)
    fail('Profile panel catalog has duplicate keys');
  if (!Array.isArray(data.parameters)) fail('Profile panel parameter list');
  if (catalogByKey === null) {
    if (data.parameters.length === 0 || data.parameters.length > PROFILE_PANEL_LIMITS.parameters)
      fail('Profile panel parameter ceiling');
  } else if (data.parameters.length !== catalogByKey.size) {
    fail('Profile panel must cover exactly the catalog');
  }
  const parameters = data.parameters.map((entry) => parseParameter(entry, catalogByKey)),
    byKey = new Map<string, ProfilePanelParameter>();
  for (const parameter of parameters) {
    if (byKey.has(parameter.key)) fail('Profile panel duplicate parameter');
    byKey.set(parameter.key, parameter);
  }
  if (catalogByKey !== null) {
    for (const key of catalogByKey.keys())
      if (!byKey.has(key)) fail('Profile panel missing parameter');
  }
  const illustrative = flag(data.illustrative, 'Profile panel illustrative flag'),
    profile = data.profile === null ? null : parseProfileIdentity(data.profile);
  if (illustrative) {
    if (profile !== null) fail('Profile panel illustrative frame must not publish a profile');
    if (data.delta !== null) fail('Profile panel illustrative frame must not carry a delta');
    for (const parameter of parameters)
      if (parameter.status === 'OBSERVED')
        fail('Profile panel illustrative frame must not contain learned values');
  } else if (profile === null) {
    fail('Profile panel published frame requires a profile identity');
  }
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: PROFILE_PANEL_VERSION,
    sessionId: id(data.sessionId, 'Profile panel session'),
    worldEpoch: count(data.worldEpoch, 'Profile panel world epoch', Number.MAX_SAFE_INTEGER),
    tick: count(data.tick, 'Profile panel tick', Number.MAX_SAFE_INTEGER),
    profile,
    illustrative,
    parameters: Object.freeze(parameters),
    delta: data.delta === null ? null : parseDelta(data.delta, byKey, profile, illustrative),
  });
}

// ---------------------------------------------------------------------------------------------
// Pure projection: catalog order, grouped rows, explicit display texts, counts and signature.
// ---------------------------------------------------------------------------------------------

function rowOf(parameter: ProfilePanelParameter): ProfilePanelRow {
  const unitLabel = profilePanelUnitLabel(parameter.unit),
    reserved = parameter.status === 'RESERVED',
    observed = parameter.status === 'OBSERVED' && parameter.value !== null,
    valueLabel = observed
      ? formatProfilePanelNumber(parameter.value as number)
      : reserved
        ? 'Rezervat · neînvățabil V1'
        : 'Neobservat',
    displayValue = observed ? `${valueLabel} ${unitLabel}` : valueLabel,
    uncertaintyLabel = observed ? `±${formatProfilePanelNumber(parameter.uncertainty)}` : '—',
    evidenceLabel = evidenceText(parameter.evidenceCount),
    sourceLabel = parameter.source === null ? '—' : SOURCE_LABELS[parameter.source],
    qualityLabel = observed ? `${Math.round(parameter.quality * 100)}%` : '—',
    learnableLabel = parameter.learnable ? 'Învățabil' : 'Neînvățabil V1',
    reasonLabel = REASON_LABELS[parameter.reason],
    description = [
      `${parameter.label} (${parameter.category})`,
      `${valueLabel}${observed ? ` ${unitLabel}` : ''}`,
      `incertitudine ${uncertaintyLabel}`,
      evidenceLabel,
      `sursă ${sourceLabel}`,
      `calitate ${qualityLabel}`,
      learnableLabel,
      reasonLabel,
    ].join('; ');
  return Object.freeze({
    rowId: parameter.key,
    key: parameter.key,
    label: parameter.label,
    category: parameter.category,
    unit: parameter.unit,
    unitLabel,
    status: parameter.status,
    value: parameter.value,
    evidenceCount: parameter.evidenceCount,
    valueLabel,
    displayValue,
    uncertaintyLabel,
    evidenceLabel,
    sourceLabel,
    qualityLabel,
    learnable: parameter.learnable,
    learnableLabel,
    reasonLabel,
    reserved,
    description,
  });
}

/** Pure projection shared by the DOM adapter, the tests and the evidence report. */
export function projectProfilePanel(
  snapshot: ProfilePanelSnapshot,
  catalog?: readonly ParameterDefinition[],
): ProfilePanelView {
  const order = new Map<string, number>();
  if (catalog !== undefined)
    for (let index = 0; index < catalog.length; index += 1) order.set(catalog[index]!.key, index);
  const parameters =
      catalog === undefined
        ? [...snapshot.parameters]
        : [...snapshot.parameters].sort(
            (left, right) =>
              (order.get(left.key) ?? PROFILE_PANEL_LIMITS.parameters) -
                (order.get(right.key) ?? PROFILE_PANEL_LIMITS.parameters) ||
              (left.key < right.key ? -1 : left.key > right.key ? 1 : 0),
          ),
    rows = parameters.map(rowOf),
    sections: { category: string; rows: ProfilePanelRow[] }[] = [];
  for (const row of rows) {
    const last = sections[sections.length - 1];
    if (last !== undefined && last.category === row.category) last.rows.push(row);
    else sections.push({ category: row.category, rows: [row] });
  }
  let observed = 0,
    unobserved = 0,
    reserved = 0,
    withEvidence = 0,
    learnable = 0;
  for (const row of rows) {
    if (row.status === 'OBSERVED') observed += 1;
    else if (row.status === 'UNOBSERVED') unobserved += 1;
    else reserved += 1;
    if (row.status === 'OBSERVED' && row.evidenceCount > 0) withEvidence += 1;
    if (row.learnable) learnable += 1;
  }
  const changes = snapshot.delta === null ? [] : snapshot.delta.changes,
    byKey = new Map(rows.map((row) => [row.key, row])),
    deltaRows: ProfilePanelDeltaRow[] = [];
  for (const change of changes) {
    const row = byKey.get(change.key);
    if (row === undefined) continue;
    const previousLabel = `${formatProfilePanelNumber(change.previous)} ${row.unitLabel}`,
      nextLabel = `${formatProfilePanelNumber(change.next)} ${row.unitLabel}`,
      changeLabel = `${previousLabel} → ${nextLabel}`,
      evidenceLabel = evidenceText(change.evidenceCount),
      description = `${row.label}: ${changeLabel}; motiv ${change.reason}; ${evidenceLabel}`;
    deltaRows.push(
      Object.freeze({
        rowId: change.key,
        key: change.key,
        label: row.label,
        previousLabel,
        nextLabel,
        changeLabel,
        reason: change.reason,
        evidenceLabel,
        description,
      }),
    );
  }
  const delta: ProfilePanelDeltaView | null =
      snapshot.delta === null
        ? null
        : Object.freeze({
            baseVersionId: snapshot.delta.baseVersionId,
            rows: Object.freeze(deltaRows),
            summary: `${deltaRows.length} ${deltaRows.length === 1 ? 'modificare' : 'modificări'} față de ${snapshot.delta.baseVersionId}.`,
          }),
    counts: ProfilePanelCounts = Object.freeze({
      total: rows.length,
      observed,
      unobserved,
      reserved,
      changed: deltaRows.length,
      withEvidence,
      learnable,
    }),
    identity =
      snapshot.profile === null
        ? 'Date ilustrative'
        : `${snapshot.profile.profileId} · ${snapshot.profile.versionId}`,
    summary =
      `${identity}: ${counts.total} parametri, ${counts.observed} observați, ` +
      `${counts.unobserved} neobservați, ${counts.reserved} rezervați, ` +
      `${counts.changed === 0 ? 'nicio modificare' : `${counts.changed} modificări`}.`;
  const signature = JSON.stringify([
    PROFILE_PANEL_VERSION,
    snapshot.sessionId,
    snapshot.worldEpoch,
    snapshot.illustrative,
    snapshot.profile,
    counts,
    rows.map((row) => [
      row.key,
      row.status,
      row.value,
      row.valueLabel,
      row.uncertaintyLabel,
      row.evidenceLabel,
      row.sourceLabel,
      row.reasonLabel,
      row.learnable,
    ]),
    deltaRows.map((row) => [row.key, row.changeLabel, row.reason, row.evidenceLabel]),
  ]);
  return Object.freeze({
    illustrative: snapshot.illustrative,
    profile: snapshot.profile,
    banner: snapshot.illustrative ? PROFILE_PANEL_ILLUSTRATIVE_BANNER : null,
    sections: Object.freeze(
      sections.map((section) =>
        Object.freeze({ category: section.category, rows: Object.freeze(section.rows) }),
      ),
    ),
    rows: Object.freeze(rows),
    delta,
    counts,
    summary,
    signature,
  });
}

export interface ProfilePanelIllustrativeInput {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
}

/**
 * Builds the explicit preview frame: the real catalog defaults, no profile identity, no delta and
 * `illustrative: true`. The preview never calls a default `learned`, `certified` or published.
 */
export function createIllustrativeProfilePanel(
  definitions: readonly ParameterDefinition[],
  input: ProfilePanelIllustrativeInput,
): ProfilePanelSnapshot {
  const parameters: ProfilePanelParameter[] = [];
  for (const definition of definitions) {
    const reserved = isProfilePanelReserved(definition),
      parameter: ProfilePanelParameter = {
        key: definition.key,
        label: definition.description,
        category: definition.category,
        unit: definition.unit,
        status: reserved ? 'RESERVED' : 'UNOBSERVED',
        value: null,
        defaultValue: definition.default,
        min: definition.min,
        max: definition.max,
        source: null,
        evidenceCount: 0,
        quality: 0,
        uncertainty: 0,
        contexts: Object.freeze([]),
        learnable: !reserved,
        reason: reserved ? 'RESERVED_V1' : 'NOT_OBSERVED',
      };
    parameters.push(Object.freeze(parameter));
  }
  return parseProfilePanelSnapshot(
    {
      schemaVersion: 1,
      units: 'SI',
      version: PROFILE_PANEL_VERSION,
      sessionId: input.sessionId,
      worldEpoch: input.worldEpoch,
      tick: input.tick,
      profile: null,
      illustrative: true,
      parameters: Object.freeze(parameters),
      delta: null,
    },
    definitions,
  );
}
