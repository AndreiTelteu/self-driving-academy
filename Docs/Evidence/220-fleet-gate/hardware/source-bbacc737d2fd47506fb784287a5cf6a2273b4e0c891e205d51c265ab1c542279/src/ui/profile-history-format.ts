import { formatProfilePanelNumber, profilePanelUnitLabel } from './profile-panel-format';

/**
 * 078 profile history contract.
 *
 * The history panel is a read model over the immutable versions of one profile (109). It lists the
 * versions that already exist, previews the difference between the current version and the version
 * the user selected, and requests an explicit restore. It never creates, derives, edits, publishes
 * or activates a version: the only outward actions are the injected `select` and `restore` ports.
 *
 * Identity rules:
 * - `versionId` is the only row identity. A selected or current flag changes, the row node does not.
 * - entries are immutable snapshots of already stored versions; there is no edit path in this
 *   contract and a duplicate `versionId` is rejected before any consumer sees the frame.
 * - a change list is derived from two stored versions, never written back to either of them.
 *
 * Reserved (R/`extension`) keys are not learnable in V1. The caller supplies the reserved key set to
 * `deriveProfileHistoryChanges` (they are omitted from the preview) and to the parser (a frame that
 * carries a reserved change is rejected), so the rule cannot drift between composition and display.
 */
export const PROFILE_HISTORY_VERSION = '078-profile-history-v1' as const;

export const PROFILE_HISTORY_LIMITS = Object.freeze({
  version: PROFILE_HISTORY_VERSION,
  /** Text/attribute write ceiling; independent of the simulation tick. */
  maximumHz: 10,
  /** Version rows; matches the 109 per-profile history ceiling. */
  versions: 128,
  /** Preview changes; the 109 delta and the 092 catalog are bounded to 80 keys. */
  changes: 80,
  /** Code units per identity read from a frame. */
  idCodeUnits: 512,
  checksumCodeUnits: 96,
  /** Code units per closed change/restore reason kept verbatim. */
  reasonCodeUnits: 240,
  /** Source segment ids per version. */
  segmentsPerVersion: 64,
  /** Deterministic decimal places used for preview values. */
  decimals: 3,
  retainedViews: 1,
});

export const PROFILE_HISTORY_EMPTY_TEXT = 'Istoric gol';

export const PROFILE_HISTORY_EMPTY_DETAIL =
  'Nicio versiune de profil nu este disponibilă; nu există rânduri inventate.';

export const PROFILE_HISTORY_PREVIEW_EMPTY = 'Selectează o versiune pentru a vedea diferențele.';

export const PROFILE_HISTORY_PREVIEW_SAME =
  'Versiunea selectată este cea curentă; nu există diferențe de previzualizat.';

export const PROFILE_HISTORY_PREVIEW_MISSING =
  'Versiunea selectată nu este în istoricul curent; previzualizarea nu poate fi construită.';

export const PROFILE_HISTORY_NO_CHANGES = 'Nicio valoare diferită între cele două versiuni.';

export const PROFILE_HISTORY_RESTORE_LABEL = 'Restaurează';

export const PROFILE_HISTORY_CONFIRM_LABEL = 'Confirmă restaurarea';

export const PROFILE_HISTORY_AVAILABLE_TEXT =
  'Versiunea selectată poate fi restaurată printr-o comandă explicită.';

export const PROFILE_HISTORY_CONFIRM_RULE =
  'Selectarea nu restaurează; restaurarea cere un al doilea clic de confirmare.';

export const PROFILE_HISTORY_NOT_CONNECTED = 'Restaurarea nu este conectată la host.';

/** Reason kept when the stored delta does not describe the exact transition being previewed. */
export const PROFILE_HISTORY_CHANGE_WITHOUT_REASON = 'Valoare diferită între versiuni';

export type ProfileHistoryOrigin = 'BASE' | 'DERIVED';

export type ProfileHistoryAction = 'NONE' | 'AVAILABLE' | 'BLOCKED';

export type ProfileHistoryRestoreReason =
  | 'NO_SELECTION'
  | 'SAME_VERSION'
  | 'MISSING_VERSION'
  | 'PROFILE_MISMATCH'
  | 'ENGINE_MISMATCH'
  | 'DUPLICATE_VERSION_ID';

export type ProfileHistoryIncompatibility = 'ENGINE_MISMATCH' | 'PROFILE_MISMATCH';

/**
 * Where a previewed change comes from: the selected version's own stored delta when it describes the
 * exact transition, otherwise the comparison of the two immutable snapshots.
 */
export type ProfileHistoryChangeSource = 'DELTA' | 'SNAPSHOT';

export const profileHistoryRestoreReasons = [
  'NO_SELECTION',
  'SAME_VERSION',
  'MISSING_VERSION',
  'PROFILE_MISMATCH',
  'ENGINE_MISMATCH',
  'DUPLICATE_VERSION_ID',
] as const;

export const profileHistoryIncompatibilities = ['ENGINE_MISMATCH', 'PROFILE_MISMATCH'] as const;

const ACTIONS: readonly ProfileHistoryAction[] = ['NONE', 'AVAILABLE', 'BLOCKED'];
const ORIGINS: readonly ProfileHistoryOrigin[] = ['BASE', 'DERIVED'];
const CHANGE_SOURCES: readonly ProfileHistoryChangeSource[] = ['DELTA', 'SNAPSHOT'];
const BLOCKED_REASONS: readonly ProfileHistoryRestoreReason[] = [
  'SAME_VERSION',
  'MISSING_VERSION',
  'PROFILE_MISMATCH',
  'ENGINE_MISMATCH',
  'DUPLICATE_VERSION_ID',
];

export const PROFILE_HISTORY_RESTORE_REASON_LABELS: Readonly<
  Record<ProfileHistoryRestoreReason, string>
> = Object.freeze({
  NO_SELECTION: 'Selectează o versiune din istoric pentru a putea restaura.',
  SAME_VERSION: 'Versiunea selectată este deja curentă; nu există nimic de restaurat.',
  MISSING_VERSION: 'Versiunea selectată nu există în istoricul profilului.',
  PROFILE_MISMATCH: 'Versiunea selectată aparține altui profil.',
  ENGINE_MISMATCH:
    'Versiunea selectată a fost creată cu altă versiune de motor și nu este compatibilă.',
  DUPLICATE_VERSION_ID: 'Istoricul are un ID de versiune duplicat; restaurarea este blocată.',
});

export const PROFILE_HISTORY_INCOMPATIBILITY_LABELS: Readonly<
  Record<ProfileHistoryIncompatibility, string>
> = Object.freeze({
  ENGINE_MISMATCH: 'Incompatibil · altă versiune de motor',
  PROFILE_MISMATCH: 'Incompatibil · alt profil',
});

/** One stored version as displayed. All fields are read-only snapshots; nothing is editable. */
export interface ProfileHistoryEntry {
  readonly versionId: string;
  readonly parentVersionId: string | null;
  readonly depth: number;
  readonly createdAt: string;
  readonly checksum: string;
  readonly engineVersion: string;
  readonly sourceSegmentIds: readonly string[];
  readonly origin: ProfileHistoryOrigin;
  readonly current: boolean;
  readonly selected: boolean;
  readonly compatible: boolean;
  readonly incompatibilityReason: ProfileHistoryIncompatibility | null;
}

/**
 * One previewed change between two immutable versions. A key present in only one version shows
 * `null` on the missing side; both sides cannot be `null` and the values cannot be equal.
 */
export interface ProfileHistoryChange {
  readonly key: string;
  readonly previous: number | null;
  readonly next: number | null;
  readonly unit: string;
  readonly source: ProfileHistoryChangeSource;
  readonly reason: string;
}

export interface ProfileHistoryPreview {
  /** Always the current version of the frame. */
  readonly fromVersionId: string;
  /** Always the selected version of the frame. */
  readonly toVersionId: string;
  readonly changes: readonly ProfileHistoryChange[];
}

export interface ProfileHistoryRestoreState {
  readonly action: ProfileHistoryAction;
  readonly reason: ProfileHistoryRestoreReason | null;
  /** A restore is always an explicit request; there is no automatic path. */
  readonly explicit: true;
  /** The UI must ask for a second, visible confirmation before emitting the request. */
  readonly confirmationRequired: true;
}

export interface ProfileHistorySnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof PROFILE_HISTORY_VERSION;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly profileId: string;
  readonly currentVersionId: string | null;
  readonly selectedVersionId: string | null;
  readonly entries: readonly ProfileHistoryEntry[];
  readonly preview: ProfileHistoryPreview | null;
  readonly restore: ProfileHistoryRestoreState;
}

// ---------------------------------------------------------------------------------------------
// Strict frame parser. Unknown fields, duplicate version identities, contradictory flags, an
// unordered history, a reserved change or an impossible restore state are rejected before any
// consumer or DOM can observe the frame.
// ---------------------------------------------------------------------------------------------

const PARAMETER_KEY = /^[a-z][a-z0-9_]*$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

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
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > PROFILE_HISTORY_LIMITS.idCodeUnits
  )
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
  const raw = boundedText(value, label, PROFILE_HISTORY_LIMITS.idCodeUnits);
  if (!TIMESTAMP.test(raw) || !Number.isFinite(Date.parse(raw)))
    fail(`${label} must be a UTC timestamp`);
  return raw;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) fail(label);
  return value as T;
}

function parseSegments(value: unknown): readonly string[] {
  if (!Array.isArray(value)) fail('Profile history source segments');
  if (value.length > PROFILE_HISTORY_LIMITS.segmentsPerVersion)
    fail('Profile history source segment ceiling');
  const ids: string[] = [],
    seen = new Set<string>();
  for (const entry of value) {
    const id = identity(entry, 'Profile history source segment');
    if (seen.has(id)) fail('Profile history duplicate source segment');
    seen.add(id);
    ids.push(id);
  }
  return Object.freeze(ids);
}

function parseEntry(value: unknown): ProfileHistoryEntry {
  const data = exact(
      value,
      [
        'versionId',
        'parentVersionId',
        'depth',
        'createdAt',
        'checksum',
        'engineVersion',
        'sourceSegmentIds',
        'origin',
        'current',
        'selected',
        'compatible',
        'incompatibilityReason',
      ],
      'Profile history entry',
    ),
    versionId = identity(data.versionId, 'Profile history version'),
    parentVersionId =
      data.parentVersionId === null
        ? null
        : identity(data.parentVersionId, 'Profile history parent version'),
    origin = oneOf(data.origin, ORIGINS, 'Profile history origin'),
    current = flag(data.current, 'Profile history current flag'),
    selected = flag(data.selected, 'Profile history selected flag'),
    compatible = flag(data.compatible, 'Profile history compatibility flag'),
    incompatibilityReason =
      data.incompatibilityReason === null
        ? null
        : oneOf(
            data.incompatibilityReason,
            profileHistoryIncompatibilities,
            'Profile history incompatibility reason',
          );
  if (parentVersionId === versionId) fail('Profile history version cannot be its own parent');
  if (compatible !== (incompatibilityReason === null))
    fail('Profile history compatibility flag does not match its reason');
  return Object.freeze({
    versionId,
    parentVersionId,
    depth: count(data.depth, 'Profile history depth', PROFILE_HISTORY_LIMITS.versions),
    createdAt: timestamp(data.createdAt, 'Profile history createdAt'),
    checksum: boundedText(
      data.checksum,
      'Profile history checksum',
      PROFILE_HISTORY_LIMITS.checksumCodeUnits,
    ),
    engineVersion: identity(data.engineVersion, 'Profile history engine'),
    sourceSegmentIds: parseSegments(data.sourceSegmentIds),
    origin,
    current,
    selected,
    compatible,
    incompatibilityReason,
  });
}

function parseChange(value: unknown): ProfileHistoryChange {
  const data = exact(
      value,
      ['key', 'previous', 'next', 'unit', 'source', 'reason'],
      'Profile history change',
    ),
    key = boundedText(data.key, 'Profile history change key', PROFILE_HISTORY_LIMITS.idCodeUnits);
  if (!PARAMETER_KEY.test(key) || ['constructor', 'prototype', '__proto__'].includes(key))
    fail('Profile history change key shape');
  const previous =
      data.previous === null ? null : finite(data.previous, 'Profile history previous'),
    next = data.next === null ? null : finite(data.next, 'Profile history next');
  if (previous === null && next === null) fail('Profile history change needs one value');
  if (previous !== null && next !== null && previous === next)
    fail('Profile history change must change the value');
  const source = oneOf(data.source, CHANGE_SOURCES, 'Profile history change source'),
    reason = boundedText(
      data.reason,
      'Profile history change reason',
      PROFILE_HISTORY_LIMITS.reasonCodeUnits,
    );
  if (source === 'SNAPSHOT' && reason !== PROFILE_HISTORY_CHANGE_WITHOUT_REASON)
    fail('Profile history snapshot change cannot invent a reason');
  return Object.freeze({
    key,
    previous,
    next,
    unit: boundedText(data.unit, 'Profile history change unit', 16),
    source,
    reason,
  });
}

function parsePreview(
  value: unknown,
  currentVersionId: string,
  selectedVersionId: string,
  reservedKeys: ReadonlySet<string> | null,
): ProfileHistoryPreview {
  const data = exact(value, ['fromVersionId', 'toVersionId', 'changes'], 'Profile history preview'),
    fromVersionId = identity(data.fromVersionId, 'Profile history preview from'),
    toVersionId = identity(data.toVersionId, 'Profile history preview to');
  if (fromVersionId !== currentVersionId) fail('Profile history preview must start at the current');
  if (toVersionId !== selectedVersionId) fail('Profile history preview must end at the selection');
  if (fromVersionId === toVersionId) fail('Profile history preview needs two versions');
  if (!Array.isArray(data.changes)) fail('Profile history preview changes');
  if (data.changes.length > PROFILE_HISTORY_LIMITS.changes)
    fail('Profile history preview change ceiling');
  const changes = data.changes.map(parseChange),
    seen = new Set<string>();
  for (const change of changes) {
    if (seen.has(change.key)) fail('Profile history duplicate change key');
    seen.add(change.key);
    if (reservedKeys !== null && reservedKeys.has(change.key))
      fail('Profile history change must not learn a reserved key');
  }
  return Object.freeze({
    fromVersionId,
    toVersionId,
    changes: Object.freeze(changes),
  });
}

function parseRestore(value: unknown): ProfileHistoryRestoreState {
  const data = exact(
    value,
    ['action', 'reason', 'explicit', 'confirmationRequired'],
    'Profile history restore',
  );
  if (data.explicit !== true) fail('Profile history restore must be explicit');
  if (data.confirmationRequired !== true)
    fail('Profile history restore requires an explicit confirmation');
  const action = oneOf(data.action, ACTIONS, 'Profile history restore action'),
    reason =
      data.reason === null
        ? null
        : oneOf(data.reason, profileHistoryRestoreReasons, 'Profile history restore reason');
  if (action === 'AVAILABLE' && reason !== null)
    fail('Profile history available restore cannot carry a reason');
  if (action === 'NONE' && reason !== 'NO_SELECTION')
    fail('Profile history idle restore must report no selection');
  if (action === 'BLOCKED' && (reason === null || !BLOCKED_REASONS.includes(reason)))
    fail('Profile history blocked restore needs a closed reason');
  return Object.freeze({
    action,
    reason,
    explicit: true,
    confirmationRequired: true,
  });
}

/**
 * Validates and freezes one frame. When `reservedKeys` is supplied, a preview change for an R key is
 * rejected; production composition always supplies the real catalog's reserved keys.
 */
export function parseProfileHistorySnapshot(
  value: unknown,
  reservedKeys?: readonly string[],
): ProfileHistorySnapshot {
  const data = exact(
    value,
    [
      'schemaVersion',
      'units',
      'version',
      'sessionId',
      'worldEpoch',
      'tick',
      'profileId',
      'currentVersionId',
      'selectedVersionId',
      'entries',
      'preview',
      'restore',
    ],
    'Profile history snapshot',
  );
  if (data.schemaVersion !== 1 || data.units !== 'SI' || data.version !== PROFILE_HISTORY_VERSION)
    fail('Profile history contract');
  const profileId = identity(data.profileId, 'Profile history profile'),
    currentVersionId =
      data.currentVersionId === null
        ? null
        : identity(data.currentVersionId, 'Profile history current version'),
    selectedVersionId =
      data.selectedVersionId === null
        ? null
        : identity(data.selectedVersionId, 'Profile history selected version');
  if (!Array.isArray(data.entries)) fail('Profile history entry list');
  if (data.entries.length > PROFILE_HISTORY_LIMITS.versions) fail('Profile history entry ceiling');
  const entries = data.entries.map(parseEntry),
    byId = new Map<string, ProfileHistoryEntry>();
  for (const entry of entries) {
    if (byId.has(entry.versionId)) fail('Profile history duplicate versionId');
    byId.set(entry.versionId, entry);
  }
  if (entries.length > 0) {
    const first = entries[0]!;
    if (first.depth !== 0 || first.parentVersionId !== null)
      fail('Profile history must start at a base version');
    for (const entry of entries) {
      if (entry.depth === 0) {
        if (entry.parentVersionId !== null)
          fail('Profile history base version cannot have a parent');
        continue;
      }
      const parent = entry.parentVersionId === null ? undefined : byId.get(entry.parentVersionId);
      if (parent === undefined || parent.depth !== entry.depth - 1)
        fail('Profile history parent chain');
    }
    for (let index = 1; index < entries.length; index += 1) {
      const previous = entries[index - 1]!,
        next = entries[index]!;
      if (previous.depth > next.depth) fail('Profile history order');
      if (previous.depth === next.depth && !(previous.versionId < next.versionId))
        fail('Profile history versionId tie-break');
    }
  }
  const currentEntries = entries.filter((entry) => entry.current),
    selectedEntries = entries.filter((entry) => entry.selected);
  if (currentVersionId === null) {
    if (currentEntries.length !== 0) fail('Profile history current flag without a version');
  } else if (currentEntries.length !== 1 || currentEntries[0]!.versionId !== currentVersionId) {
    fail('Profile history current flag must match the current version');
  }
  if (selectedVersionId === null) {
    if (selectedEntries.length !== 0) fail('Profile history selected flag without a version');
  } else if (
    selectedEntries.length > 1 ||
    (selectedEntries.length === 1 && selectedEntries[0]!.versionId !== selectedVersionId)
  ) {
    fail('Profile history selected flag must match the selection');
  }
  const current = currentVersionId === null ? null : (byId.get(currentVersionId) ?? null),
    selected = selectedVersionId === null ? null : (byId.get(selectedVersionId) ?? null),
    previewRequired =
      current !== null &&
      selected !== null &&
      currentVersionId !== selectedVersionId &&
      currentVersionId !== null &&
      selectedVersionId !== null;
  if (previewRequired !== (data.preview !== null))
    fail('Profile history preview does not match the current and selected versions');
  const reservedSet =
    reservedKeys === undefined ? null : new Set<string>(reservedKeys.map((key) => key));
  const preview =
    data.preview === null
      ? null
      : parsePreview(
          data.preview,
          currentVersionId ?? fail('Profile history preview without a current version'),
          selectedVersionId ?? fail('Profile history preview without a selection'),
          reservedSet,
        );
  const restore = parseRestore(data.restore);
  if (restore.action === 'AVAILABLE') {
    if (current === null || selected === null)
      fail('Profile history available restore needs both versions');
    if (currentVersionId === selectedVersionId)
      fail('Profile history available restore cannot target the current version');
    if (!selected.compatible) fail('Profile history available restore needs a compatible version');
  } else if (restore.action === 'NONE') {
    if (entries.length === 0 || current === null || selectedVersionId !== null)
      fail('Profile history idle restore needs a non-empty history and no selection');
  } else if (restore.reason === 'MISSING_VERSION') {
    if (currentVersionId !== null && selectedVersionId !== null && selected !== null)
      fail('Profile history missing-version reason contradicts the frame');
  } else if (restore.reason === 'SAME_VERSION') {
    if (currentVersionId === null || currentVersionId !== selectedVersionId)
      fail('Profile history same-version reason contradicts the frame');
  } else if (restore.reason === 'ENGINE_MISMATCH') {
    const engineBlocked =
      (current !== null && current.incompatibilityReason === 'ENGINE_MISMATCH') ||
      (selected !== null && selected.incompatibilityReason === 'ENGINE_MISMATCH');
    if (!engineBlocked) fail('Profile history engine-mismatch reason contradicts the frame');
  } else if (restore.reason === 'PROFILE_MISMATCH') {
    const profileBlocked =
      (current !== null && current.incompatibilityReason === 'PROFILE_MISMATCH') ||
      (selected !== null && selected.incompatibilityReason === 'PROFILE_MISMATCH') ||
      (selectedVersionId !== null && selected === null);
    if (!profileBlocked) fail('Profile history profile-mismatch reason contradicts the frame');
  }
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: PROFILE_HISTORY_VERSION,
    sessionId: identity(data.sessionId, 'Profile history session'),
    worldEpoch: count(data.worldEpoch, 'Profile history world epoch', Number.MAX_SAFE_INTEGER),
    tick: count(data.tick, 'Profile history tick', Number.MAX_SAFE_INTEGER),
    profileId,
    currentVersionId,
    selectedVersionId,
    entries: Object.freeze(entries),
    preview,
    restore,
  });
}

// ---------------------------------------------------------------------------------------------
// Pure derivation shared by the composition root, the tests and the evidence report.
// ---------------------------------------------------------------------------------------------

/** Structural subset of a 109 `ProfileVersion` needed to compare two immutable snapshots. */
export interface ProfileHistoryVersionValues {
  readonly versionId: string;
  readonly parameters: Readonly<Record<string, number>>;
  readonly delta: {
    readonly reason: string | null;
    readonly changes: readonly {
      readonly key: string;
      readonly unit: string;
      readonly previousValue: number;
      readonly newValue: number;
    }[];
  } | null;
}

export interface ProfileHistoryChangeDerivation {
  readonly from: ProfileHistoryVersionValues;
  readonly to: ProfileHistoryVersionValues;
  /**
   * R (`extension`) catalog keys. They are omitted from the change list: a reserved key is never a
   * learnable change. Production composition passes the real 092 catalog.
   */
  readonly reservedKeys?: readonly string[];
  /** Catalog unit for a key whose change the stored delta does not describe. */
  readonly unitOf?: (key: string) => string | null;
}

/**
 * Compares two immutable snapshots and returns deterministic, key-sorted changes from `from` to
 * `to`. Neither input is mutated. A change uses the stored delta of the target version only when that
 * delta describes the exact transition (same previous and next value); otherwise the reason is the
 * explicit "values differ" text, never an invented justification.
 */
export function deriveProfileHistoryChanges(
  input: ProfileHistoryChangeDerivation,
): readonly ProfileHistoryChange[] {
  if (input.from.versionId === input.to.versionId)
    fail('Profile history change derivation needs two versions');
  const reserved = new Set<string>(input.reservedKeys ?? []),
    delta = input.to.delta,
    recorded = new Map<string, { unit: string; previousValue: number; newValue: number }>();
  if (delta !== null) {
    for (const change of delta.changes) {
      if (recorded.has(change.key))
        fail(`Profile history delta has a duplicate key: ${change.key}`);
      recorded.set(change.key, change);
    }
  }
  const keys = new Set<string>([
    ...Object.keys(input.from.parameters),
    ...Object.keys(input.to.parameters),
  ]);
  const changes: ProfileHistoryChange[] = [];
  for (const key of [...keys].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))) {
    if (reserved.has(key)) continue;
    const previous = Object.hasOwn(input.from.parameters, key) ? input.from.parameters[key]! : null,
      next = Object.hasOwn(input.to.parameters, key) ? input.to.parameters[key]! : null;
    if (previous !== null && !Number.isFinite(previous))
      fail(`Profile history value is not finite: ${key}`);
    if (next !== null && !Number.isFinite(next))
      fail(`Profile history value is not finite: ${key}`);
    if (previous === next) continue;
    const candidate = recorded.get(key),
      exact =
        candidate !== undefined &&
        candidate.previousValue === previous &&
        candidate.newValue === next,
      unit = exact ? candidate.unit : (input.unitOf?.(key) ?? null);
    if (unit === null) fail(`Profile history has no unit for ${key}`);
    changes.push(
      Object.freeze({
        key,
        previous,
        next,
        unit,
        source: exact ? 'DELTA' : 'SNAPSHOT',
        reason: exact && delta?.reason ? delta.reason : PROFILE_HISTORY_CHANGE_WITHOUT_REASON,
      }),
    );
  }
  return Object.freeze(changes);
}

// ---------------------------------------------------------------------------------------------
// Pure projection: stable row identities, explicit texts, counts, summary and signature.
// ---------------------------------------------------------------------------------------------

export interface ProfileHistoryRow {
  /** Stable DOM identity: the stored `versionId`, never a position. */
  readonly rowId: string;
  readonly versionId: string;
  readonly parentVersionId: string | null;
  readonly depth: number;
  readonly depthLabel: string;
  readonly createdAt: string;
  readonly checksum: string;
  readonly engineVersion: string;
  readonly sourceLabel: string;
  readonly origin: ProfileHistoryOrigin;
  readonly current: boolean;
  readonly selected: boolean;
  readonly compatible: boolean;
  readonly stateLabel: string;
  readonly incompatibilityLabel: string;
  readonly description: string;
}

export interface ProfileHistoryChangeRow {
  readonly rowId: string;
  readonly key: string;
  readonly unit: string;
  readonly unitLabel: string;
  readonly previous: number | null;
  readonly next: number | null;
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly changeLabel: string;
  readonly source: ProfileHistoryChangeSource;
  readonly sourceLabel: string;
  readonly reason: string;
  readonly description: string;
}

export interface ProfileHistoryPreviewView {
  readonly fromVersionId: string;
  readonly toVersionId: string;
  readonly rows: readonly ProfileHistoryChangeRow[];
  readonly summary: string;
}

export interface ProfileHistoryRestoreView {
  readonly action: ProfileHistoryAction;
  readonly reason: ProfileHistoryRestoreReason | null;
  readonly available: boolean;
  /** `true` for every frame except `AVAILABLE`; the control renders `disabled`. */
  readonly disabled: boolean;
  readonly reasonLabel: string;
  readonly label: string;
  readonly confirmLabel: string;
  readonly description: string;
}

export interface ProfileHistoryCounts {
  readonly entries: number;
  readonly compatible: number;
  readonly incompatible: number;
  readonly changes: number;
  readonly selected: number;
}

export interface ProfileHistoryView {
  readonly profileId: string;
  readonly currentVersionId: string | null;
  readonly selectedVersionId: string | null;
  readonly empty: boolean;
  readonly rows: readonly ProfileHistoryRow[];
  readonly preview: ProfileHistoryPreviewView | null;
  /** Message shown in the preview area when `preview` is `null`. */
  readonly previewEmptyLabel: string;
  readonly restore: ProfileHistoryRestoreView;
  readonly counts: ProfileHistoryCounts;
  readonly summary: string;
  readonly signature: string;
}

function entryStateLabel(entry: ProfileHistoryEntry): string {
  const parts: string[] = [];
  if (entry.current) parts.push('Curent');
  if (entry.selected) parts.push('Selectat');
  if (parts.length === 0) parts.push(entry.origin === 'BASE' ? 'Bază' : 'Derivat');
  if (!entry.compatible) parts.push('Incompatibil');
  return parts.join(' · ');
}

function segmentLabel(count: number): string {
  if (count === 0) return 'Fără segmente sursă';
  return `${count} ${count === 1 ? 'segment sursă' : 'segmente sursă'}`;
}

function rowOf(entry: ProfileHistoryEntry): ProfileHistoryRow {
  const depthLabel = entry.depth === 0 ? 'Bază' : `Nivel ${entry.depth}`,
    sourceLabel = segmentLabel(entry.sourceSegmentIds.length),
    stateLabel = entryStateLabel(entry),
    incompatibilityLabel =
      entry.incompatibilityReason === null
        ? '—'
        : PROFILE_HISTORY_INCOMPATIBILITY_LABELS[entry.incompatibilityReason],
    description = [
      `Versiunea ${entry.versionId}`,
      stateLabel,
      depthLabel,
      `creată ${entry.createdAt}`,
      `motor ${entry.engineVersion}`,
      `checksum ${entry.checksum}`,
      sourceLabel,
      incompatibilityLabel === '—' ? 'compatibilă' : incompatibilityLabel,
    ].join('; ');
  return Object.freeze({
    rowId: entry.versionId,
    versionId: entry.versionId,
    parentVersionId: entry.parentVersionId,
    depth: entry.depth,
    depthLabel,
    createdAt: entry.createdAt,
    checksum: entry.checksum,
    engineVersion: entry.engineVersion,
    sourceLabel,
    origin: entry.origin,
    current: entry.current,
    selected: entry.selected,
    compatible: entry.compatible,
    stateLabel,
    incompatibilityLabel,
    description,
  });
}

function numberLabel(value: number | null, unitLabel: string): string {
  return value === null ? '—' : `${formatProfilePanelNumber(value)} ${unitLabel}`;
}

function changeRowOf(change: ProfileHistoryChange): ProfileHistoryChangeRow {
  const unitLabel = profilePanelUnitLabel(change.unit),
    previousLabel = numberLabel(change.previous, unitLabel),
    nextLabel = numberLabel(change.next, unitLabel),
    changeLabel = `${previousLabel} → ${nextLabel}`,
    sourceLabel =
      change.source === 'DELTA' ? 'delta versiunii selectate' : 'comparație de instantanee',
    description = `${change.key}: ${changeLabel}; sursă ${sourceLabel}; motiv ${change.reason}`;
  return Object.freeze({
    rowId: change.key,
    key: change.key,
    unit: change.unit,
    unitLabel,
    previous: change.previous,
    next: change.next,
    previousLabel,
    nextLabel,
    changeLabel,
    source: change.source,
    sourceLabel,
    reason: change.reason,
    description,
  });
}

function previewEmptyLabel(snapshot: ProfileHistorySnapshot): string {
  if (snapshot.selectedVersionId === null) return PROFILE_HISTORY_PREVIEW_EMPTY;
  if (snapshot.currentVersionId === null) return PROFILE_HISTORY_PREVIEW_MISSING;
  if (snapshot.selectedVersionId === snapshot.currentVersionId) return PROFILE_HISTORY_PREVIEW_SAME;
  if (!snapshot.entries.some((entry) => entry.versionId === snapshot.selectedVersionId))
    return PROFILE_HISTORY_PREVIEW_MISSING;
  return PROFILE_HISTORY_NO_CHANGES;
}

/** Pure projection shared by the DOM adapter, the tests and the evidence report. */
export function projectProfileHistory(snapshot: ProfileHistorySnapshot): ProfileHistoryView {
  const rows = snapshot.entries.map(rowOf),
    changeRows = snapshot.preview === null ? [] : snapshot.preview.changes.map(changeRowOf),
    preview: ProfileHistoryPreviewView | null =
      snapshot.preview === null
        ? null
        : Object.freeze({
            fromVersionId: snapshot.preview.fromVersionId,
            toVersionId: snapshot.preview.toVersionId,
            rows: Object.freeze(changeRows),
            summary: `${changeRows.length} ${
              changeRows.length === 1 ? 'modificare' : 'modificări'
            } de la ${snapshot.preview.fromVersionId} la ${snapshot.preview.toVersionId}.`,
          });
  let compatible = 0,
    incompatible = 0;
  for (const row of rows) {
    if (row.compatible) compatible += 1;
    else incompatible += 1;
  }
  const available = snapshot.restore.action === 'AVAILABLE',
    reasonLabel =
      snapshot.restore.reason === null
        ? PROFILE_HISTORY_AVAILABLE_TEXT
        : PROFILE_HISTORY_RESTORE_REASON_LABELS[snapshot.restore.reason],
    restore: ProfileHistoryRestoreView = Object.freeze({
      action: snapshot.restore.action,
      reason: snapshot.restore.reason,
      available,
      disabled: !available,
      reasonLabel,
      label: PROFILE_HISTORY_RESTORE_LABEL,
      confirmLabel: PROFILE_HISTORY_CONFIRM_LABEL,
      description: `${PROFILE_HISTORY_RESTORE_LABEL}: ${reasonLabel} ${PROFILE_HISTORY_CONFIRM_RULE}`,
    }),
    counts: ProfileHistoryCounts = Object.freeze({
      entries: rows.length,
      compatible,
      incompatible,
      changes: changeRows.length,
      selected: snapshot.selectedVersionId === null ? 0 : 1,
    }),
    empty = rows.length === 0,
    actionLabel = available
      ? 'disponibilă'
      : snapshot.restore.action === 'NONE'
        ? 'fără selecție'
        : 'blocată',
    summary =
      `Istoric ${snapshot.profileId}: ${counts.entries} versiuni, ` +
      `curent ${snapshot.currentVersionId ?? '—'}, ` +
      `selectat ${snapshot.selectedVersionId ?? 'nicio versiune'}, ` +
      `${counts.changes} modificări; restaurare ${actionLabel}` +
      (snapshot.restore.reason === null ? '' : ` (${snapshot.restore.reason})`) +
      '.',
    signature = JSON.stringify([
      PROFILE_HISTORY_VERSION,
      snapshot.sessionId,
      snapshot.worldEpoch,
      snapshot.profileId,
      snapshot.currentVersionId,
      snapshot.selectedVersionId,
      rows.map((row) => [
        row.versionId,
        row.checksum,
        row.origin,
        row.current,
        row.selected,
        row.compatible,
        row.incompatibilityLabel,
      ]),
      changeRows.map((row) => [row.key, row.previous, row.next, row.unit, row.source, row.reason]),
      snapshot.restore.action,
      snapshot.restore.reason,
    ]);
  return Object.freeze({
    profileId: snapshot.profileId,
    currentVersionId: snapshot.currentVersionId,
    selectedVersionId: snapshot.selectedVersionId,
    empty,
    rows: Object.freeze(rows),
    preview,
    previewEmptyLabel: previewEmptyLabel(snapshot),
    restore,
    counts,
    summary,
    signature,
  });
}
