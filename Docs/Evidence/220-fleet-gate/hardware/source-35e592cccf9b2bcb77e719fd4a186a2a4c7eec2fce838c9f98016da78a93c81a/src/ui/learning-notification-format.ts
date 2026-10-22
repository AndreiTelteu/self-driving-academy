/**
 * 079 learning notification contract.
 *
 * The module turns the real 103 learning queue outcomes (and an explicit 110 publication payload)
 * into a small, bounded set of visual notifications. It is deliberately a *read model*:
 *
 * - every notification is bound to one `segmentId` and one `jobKey`, in the text and in attributes;
 * - the displayed text is derived from structured fields, never accepted as free text from a
 *   worker, so an `ERROR`/`REJECTED`/`CANCELLED`/`INVALIDATED` outcome can never be rendered as a
 *   published profile;
 * - only the explicit `PUBLISHED` kind may say „Profil publicat”; a worker `composed` result maps to
 *   `RESULT` = „Candidat validat, nepublicat”;
 * - a late event whose segment/job/epoch/session/world no longer matches the current job becomes a
 *   quiet `STALE` („Rezultat întârziat ignorat”) and never the current result;
 * - identical `segmentId + jobKey + kind` events are deduplicated for a bounded window, at most
 *   three notifications stay visible, and the history is bounded;
 * - every kind carries a visual text and symbol; the sound is only an optional descriptor.
 *
 * The reducer is pure: it returns a new frozen state and never touches the DOM. The DOM adapter is
 * `src/ui/learning-notifications.ts`, and the 103/110 composition is `src/app/learning-notification`.
 */
export const LEARNING_NOTIFICATION_VERSION = '079-learning-notifications-v1' as const;

export const learningNotificationKinds = [
  'ANALYZING',
  'RESULT',
  'NO_CHANGE',
  'INSUFFICIENT_EVIDENCE',
  'ERROR',
  'REJECTED',
  'CANCELLED',
  'INVALIDATED',
  'STALE',
  'PUBLISHED',
] as const;
export type LearningNotificationKind = (typeof learningNotificationKinds)[number];

/** Kinds that are not a success and never a publication. */
export const learningNotificationFailureKinds = [
  'ERROR',
  'REJECTED',
  'CANCELLED',
  'INVALIDATED',
] as const;

export const learningNotificationModes = ['LEARNING', 'MANUAL', 'AUTO'] as const;
export type LearningNotificationMode = (typeof learningNotificationModes)[number];

export const learningNotificationSoundCues = ['NONE', 'SUCCESS', 'WARNING', 'ERROR'] as const;
export type LearningNotificationSoundCue = (typeof learningNotificationSoundCues)[number];

export const learningNotificationMissingStates = ['UNOBSERVED', 'WEAK'] as const;
export type LearningNotificationMissingState = (typeof learningNotificationMissingStates)[number];

export const LEARNING_NOTIFICATION_LIMITS = Object.freeze({
  version: LEARNING_NOTIFICATION_VERSION,
  /** Text/attribute write ceiling of the DOM adapter. */
  maximumHz: 10,
  /** Hard visual ceiling: never more than three notifications at once. */
  maxActive: 3,
  /** Same segment/job/kind inside this window is not shown again. */
  dedupeWindowMs: 30_000,
  ttlMs: 15_000,
  /** A late result is quiet and disappears sooner. */
  staleTtlMs: 4_000,
  /** Bounded memory of deduplication keys and event ids. */
  seenKeys: 48,
  eventIds: 48,
  /** Bounded list of missing observations per message. */
  missing: 4,
  idCodeUnits: 512,
  eventIdCodeUnits: 128,
  labelCodeUnits: 160,
  unitCodeUnits: 16,
  reasonCodeUnits: 120,
  detailCodeUnits: 240,
  parameterKeyCodeUnits: 64,
  /** Retained projections inside the adapter, never a history. */
  retainedViews: 1,
});

/** Deterministic, locale-independent number text: at most three decimals, a real zero is `0`. */
export function formatLearningNotificationNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded === 0) return '0';
  return String(rounded);
}

/** Identity every notification carries, independent of its kind. */
export interface LearningNotificationIdentity {
  readonly eventId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly segmentId: string;
  /** Queue job identity: `job:103:<segment>:<order>`. */
  readonly jobKey: string;
  /** 103 generation identity: player/profile/learningEpoch/baseVersion. */
  readonly generationKey: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly tick: number;
  readonly mode: LearningNotificationMode;
  readonly key: string;
  readonly order: number;
}

/** One concrete missing observation: the key, its label, its state and its real episode count. */
export interface LearningNotificationMissingObservation {
  readonly key: string;
  readonly label: string;
  readonly state: LearningNotificationMissingState;
  /** Distinct real episodes reported for the key; `null` when the read model has none. */
  readonly episodes: number | null;
}

export interface LearningNotificationAnalyzing extends LearningNotificationIdentity {
  readonly kind: 'ANALYZING';
}

/** A worker `composed` result: an accepted candidate, explicitly *not* published. */
export interface LearningNotificationResult extends LearningNotificationIdentity {
  readonly kind: 'RESULT';
  readonly label: string;
  readonly unit: string;
  readonly previousValue: number;
  readonly value: number;
}

export interface LearningNotificationNoChange extends LearningNotificationIdentity {
  readonly kind: 'NO_CHANGE';
  readonly label: string;
}

export interface LearningNotificationInsufficientEvidence extends LearningNotificationIdentity {
  readonly kind: 'INSUFFICIENT_EVIDENCE';
  readonly missing: readonly LearningNotificationMissingObservation[];
}

export interface LearningNotificationError extends LearningNotificationIdentity {
  readonly kind: 'ERROR';
  /** Closed 103 reason code, kept verbatim. */
  readonly reason: string;
  readonly detail: string | null;
}

export interface LearningNotificationRejected extends LearningNotificationIdentity {
  readonly kind: 'REJECTED';
  readonly reason: string;
  readonly detail: string | null;
}

export interface LearningNotificationCancelled extends LearningNotificationIdentity {
  readonly kind: 'CANCELLED';
  readonly detail: string | null;
}

export interface LearningNotificationInvalidated extends LearningNotificationIdentity {
  readonly kind: 'INVALIDATED';
  readonly reason: string;
  readonly detail: string | null;
}

/** A late event that no longer belongs to the current job. */
export interface LearningNotificationStale extends LearningNotificationIdentity {
  readonly kind: 'STALE';
  readonly reason: string;
  readonly detail: string | null;
}

/**
 * The only kind allowed to say „Profil publicat”. It requires an explicit 110/112 publication
 * payload: `published: true` and a non-empty publication version id.
 */
export interface LearningNotificationPublished extends LearningNotificationIdentity {
  readonly kind: 'PUBLISHED';
  readonly label: string;
  readonly unit: string;
  readonly previousValue: number | null;
  readonly value: number;
  readonly publicationVersionId: string;
  readonly published: true;
}

export type LearningNotificationEvent =
  | LearningNotificationAnalyzing
  | LearningNotificationResult
  | LearningNotificationNoChange
  | LearningNotificationInsufficientEvidence
  | LearningNotificationError
  | LearningNotificationRejected
  | LearningNotificationCancelled
  | LearningNotificationInvalidated
  | LearningNotificationStale
  | LearningNotificationPublished;

export interface LearningNotificationKindView {
  readonly kind: LearningNotificationKind;
  readonly symbol: string;
  readonly title: string;
  readonly soundCue: LearningNotificationSoundCue;
  /** Only `PUBLISHED` is a success and may claim a publication. */
  readonly success: boolean;
  readonly stale: boolean;
  readonly quiet: boolean;
}

const KIND_VIEWS: Readonly<Record<LearningNotificationKind, LearningNotificationKindView>> =
  Object.freeze({
    ANALYZING: Object.freeze({
      kind: 'ANALYZING',
      symbol: '◌',
      title: 'Analiză în curs',
      soundCue: 'NONE',
      success: false,
      stale: false,
      quiet: false,
    }),
    RESULT: Object.freeze({
      kind: 'RESULT',
      symbol: '✓',
      title: 'Candidat validat, nepublicat',
      soundCue: 'SUCCESS',
      success: false,
      stale: false,
      quiet: false,
    }),
    NO_CHANGE: Object.freeze({
      kind: 'NO_CHANGE',
      symbol: '=',
      title: 'Nicio modificare justificată',
      soundCue: 'NONE',
      success: false,
      stale: false,
      quiet: false,
    }),
    INSUFFICIENT_EVIDENCE: Object.freeze({
      kind: 'INSUFFICIENT_EVIDENCE',
      symbol: '?',
      title: 'Dovezi insuficiente',
      soundCue: 'WARNING',
      success: false,
      stale: false,
      quiet: false,
    }),
    ERROR: Object.freeze({
      kind: 'ERROR',
      symbol: '✕',
      title: 'Eroare de analiză',
      soundCue: 'ERROR',
      success: false,
      stale: false,
      quiet: false,
    }),
    REJECTED: Object.freeze({
      kind: 'REJECTED',
      symbol: '⊘',
      title: 'Candidat respins',
      soundCue: 'WARNING',
      success: false,
      stale: false,
      quiet: false,
    }),
    CANCELLED: Object.freeze({
      kind: 'CANCELLED',
      symbol: '—',
      title: 'Analiză anulată',
      soundCue: 'NONE',
      success: false,
      stale: false,
      quiet: false,
    }),
    INVALIDATED: Object.freeze({
      kind: 'INVALIDATED',
      symbol: '↺',
      title: 'Analiză invalidată',
      soundCue: 'WARNING',
      success: false,
      stale: false,
      quiet: false,
    }),
    STALE: Object.freeze({
      kind: 'STALE',
      symbol: '⌛',
      title: 'Rezultat întârziat ignorat',
      soundCue: 'NONE',
      success: false,
      stale: true,
      quiet: true,
    }),
    PUBLISHED: Object.freeze({
      kind: 'PUBLISHED',
      symbol: '★',
      title: 'Profil publicat',
      soundCue: 'SUCCESS',
      success: true,
      stale: false,
      quiet: false,
    }),
  });

export function learningNotificationKindView(
  kind: LearningNotificationKind,
): LearningNotificationKindView {
  const view = KIND_VIEWS[kind];
  if (!view) throw new Error(`Unknown learning notification kind: ${String(kind)}`);
  return view;
}

const KIND_SET = new Set<string>(learningNotificationKinds);
const MODE_SET = new Set<string>(learningNotificationModes);
const MISSING_STATE_SET = new Set<string>(learningNotificationMissingStates);

const BASE_FIELDS = [
  'eventId',
  'sessionId',
  'worldEpoch',
  'segmentId',
  'jobKey',
  'generationKey',
  'profileId',
  'learningEpoch',
  'tick',
  'mode',
  'key',
  'order',
  'kind',
] as const;

const KIND_FIELDS: Readonly<Record<LearningNotificationKind, readonly string[]>> = Object.freeze({
  ANALYZING: BASE_FIELDS,
  RESULT: [...BASE_FIELDS, 'label', 'unit', 'previousValue', 'value'],
  NO_CHANGE: [...BASE_FIELDS, 'label'],
  INSUFFICIENT_EVIDENCE: [...BASE_FIELDS, 'missing'],
  ERROR: [...BASE_FIELDS, 'reason', 'detail'],
  REJECTED: [...BASE_FIELDS, 'reason', 'detail'],
  CANCELLED: [...BASE_FIELDS, 'detail'],
  INVALIDATED: [...BASE_FIELDS, 'reason', 'detail'],
  STALE: [...BASE_FIELDS, 'reason', 'detail'],
  PUBLISHED: [
    ...BASE_FIELDS,
    'label',
    'unit',
    'previousValue',
    'value',
    'publicationVersionId',
    'published',
  ],
});

// ---------------------------------------------------------------------------------------------
// Strict parser: exact keys per kind, bounded identities, finite tick, frozen result.
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

function boundedText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail(`${label} text`);
  return value;
}

function identity(value: unknown, label: string): string {
  return boundedText(value, label, LEARNING_NOTIFICATION_LIMITS.idCodeUnits);
}

function eventIdText(value: unknown): string {
  return boundedText(
    value,
    'Learning notification event id',
    LEARNING_NOTIFICATION_LIMITS.eventIdCodeUnits,
  );
}

function parameterKey(value: unknown): string {
  const key = boundedText(
    value,
    'Learning notification key',
    LEARNING_NOTIFICATION_LIMITS.parameterKeyCodeUnits,
  );
  if (!/^[a-z][a-z0-9_]*$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key))
    fail('Learning notification key shape');
  return key;
}

function boundedInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(`${label} must be a bounded non-negative integer`);
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be finite`);
  return value;
}

function finiteTick(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    fail('Learning notification tick must be a finite non-negative number');
  return value;
}

function reasonText(value: unknown): string {
  return boundedText(
    value,
    'Learning notification reason',
    LEARNING_NOTIFICATION_LIMITS.reasonCodeUnits,
  );
}

function detailText(value: unknown): string | null {
  if (value === null) return null;
  return boundedText(
    value,
    'Learning notification detail',
    LEARNING_NOTIFICATION_LIMITS.detailCodeUnits,
  );
}

function unitText(value: unknown): string {
  return boundedText(
    value,
    'Learning notification unit',
    LEARNING_NOTIFICATION_LIMITS.unitCodeUnits,
  );
}

function labelText(value: unknown): string {
  return boundedText(
    value,
    'Learning notification label',
    LEARNING_NOTIFICATION_LIMITS.labelCodeUnits,
  );
}

function parseIdentity(data: Record<string, unknown>): LearningNotificationIdentity {
  const mode = data.mode;
  if (typeof mode !== 'string' || !MODE_SET.has(mode)) fail('Learning notification mode');
  return {
    eventId: eventIdText(data.eventId),
    sessionId: identity(data.sessionId, 'Learning notification session'),
    worldEpoch: boundedInteger(data.worldEpoch, 'Learning notification world epoch'),
    segmentId: identity(data.segmentId, 'Learning notification segment'),
    jobKey: identity(data.jobKey, 'Learning notification job'),
    generationKey: identity(data.generationKey, 'Learning notification generation'),
    profileId: identity(data.profileId, 'Learning notification profile'),
    learningEpoch: boundedInteger(data.learningEpoch, 'Learning notification learning epoch'),
    tick: finiteTick(data.tick),
    mode: mode as LearningNotificationMode,
    key: parameterKey(data.key),
    order: boundedInteger(data.order, 'Learning notification order'),
  };
}

function parseMissing(value: unknown): readonly LearningNotificationMissingObservation[] {
  if (!Array.isArray(value)) fail('Learning notification missing list');
  if (value.length === 0 || value.length > LEARNING_NOTIFICATION_LIMITS.missing)
    fail('Learning notification missing ceiling');
  const seen = new Set<string>(),
    rows: LearningNotificationMissingObservation[] = [];
  for (const entry of value) {
    const data = exact(
        entry,
        ['key', 'label', 'state', 'episodes'],
        'Learning notification missing observation',
      ),
      key = parameterKey(data.key),
      label = labelText(data.label),
      state = data.state;
    if (typeof state !== 'string' || !MISSING_STATE_SET.has(state))
      fail('Learning notification missing state');
    if (seen.has(key)) fail('Learning notification duplicate missing key');
    seen.add(key);
    const episodes =
      data.episodes === null
        ? null
        : boundedInteger(data.episodes, 'Learning notification missing episodes');
    rows.push(
      Object.freeze({ key, label, state: state as LearningNotificationMissingState, episodes }),
    );
  }
  return Object.freeze(rows);
}

/** Validates and freezes one notification. Unknown, duplicate or contradictory fields throw. */
export function parseLearningNotificationEvent(value: unknown): LearningNotificationEvent {
  const data = plain(value, 'Learning notification'),
    kind = data.kind;
  if (typeof kind !== 'string' || !KIND_SET.has(kind)) fail('Learning notification kind');
  const parsedKind = kind as LearningNotificationKind;
  exact(data, KIND_FIELDS[parsedKind], 'Learning notification');
  const base = parseIdentity(data);
  switch (parsedKind) {
    case 'ANALYZING':
      return Object.freeze({ ...base, kind: 'ANALYZING' });
    case 'RESULT': {
      const previousValue = finiteNumber(
          data.previousValue,
          'Learning notification previous value',
        ),
        value = finiteNumber(data.value, 'Learning notification value');
      if (previousValue === value)
        fail('Learning notification RESULT requires an actual change; use NO_CHANGE');
      return Object.freeze({
        ...base,
        kind: 'RESULT',
        label: labelText(data.label),
        unit: unitText(data.unit),
        previousValue,
        value,
      });
    }
    case 'NO_CHANGE':
      return Object.freeze({ ...base, kind: 'NO_CHANGE', label: labelText(data.label) });
    case 'INSUFFICIENT_EVIDENCE':
      return Object.freeze({
        ...base,
        kind: 'INSUFFICIENT_EVIDENCE',
        missing: parseMissing(data.missing),
      });
    case 'ERROR':
      return Object.freeze({
        ...base,
        kind: 'ERROR',
        reason: reasonText(data.reason),
        detail: detailText(data.detail),
      });
    case 'REJECTED':
      return Object.freeze({
        ...base,
        kind: 'REJECTED',
        reason: reasonText(data.reason),
        detail: detailText(data.detail),
      });
    case 'CANCELLED':
      return Object.freeze({ ...base, kind: 'CANCELLED', detail: detailText(data.detail) });
    case 'INVALIDATED':
      return Object.freeze({
        ...base,
        kind: 'INVALIDATED',
        reason: reasonText(data.reason),
        detail: detailText(data.detail),
      });
    case 'STALE':
      return Object.freeze({
        ...base,
        kind: 'STALE',
        reason: reasonText(data.reason),
        detail: detailText(data.detail),
      });
    case 'PUBLISHED': {
      const previousValue =
          data.previousValue === null
            ? null
            : finiteNumber(data.previousValue, 'Learning notification previous value'),
        value = finiteNumber(data.value, 'Learning notification value');
      if (data.published !== true)
        fail('Learning notification PUBLISHED requires an explicit publication payload');
      return Object.freeze({
        ...base,
        kind: 'PUBLISHED',
        label: labelText(data.label),
        unit: unitText(data.unit),
        previousValue,
        value,
        publicationVersionId: identity(
          data.publicationVersionId,
          'Learning notification publication version',
        ),
        published: true,
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Policy and state.
// ---------------------------------------------------------------------------------------------

/** The job a notification must still belong to; supplied by the composition root. */
export interface LearningNotificationCurrentJob {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly segmentId: string;
  readonly jobKey: string;
  readonly learningEpoch: number;
}

export interface LearningNotificationPolicy {
  readonly maxActive: number;
  readonly dedupeWindowMs: number;
  readonly ttlMs: number;
  readonly staleTtlMs: number;
  /** `null` means the host cannot tell yet, so no event is reclassified as stale. */
  readonly current: LearningNotificationCurrentJob | null;
}

export const LEARNING_NOTIFICATION_POLICY: LearningNotificationPolicy = Object.freeze({
  maxActive: LEARNING_NOTIFICATION_LIMITS.maxActive,
  dedupeWindowMs: LEARNING_NOTIFICATION_LIMITS.dedupeWindowMs,
  ttlMs: LEARNING_NOTIFICATION_LIMITS.ttlMs,
  staleTtlMs: LEARNING_NOTIFICATION_LIMITS.staleTtlMs,
  current: null,
});

function parseCurrentJob(value: unknown): LearningNotificationCurrentJob | null {
  if (value === null) return null;
  const data = exact(
    value,
    ['sessionId', 'worldEpoch', 'segmentId', 'jobKey', 'learningEpoch'],
    'Learning notification current job',
  );
  return Object.freeze({
    sessionId: identity(data.sessionId, 'Learning notification current session'),
    worldEpoch: boundedInteger(data.worldEpoch, 'Learning notification current world epoch'),
    segmentId: identity(data.segmentId, 'Learning notification current segment'),
    jobKey: identity(data.jobKey, 'Learning notification current job'),
    learningEpoch: boundedInteger(
      data.learningEpoch,
      'Learning notification current learning epoch',
    ),
  });
}

function policyOf(
  policy: Partial<LearningNotificationPolicy> | undefined,
): LearningNotificationPolicy {
  const maxActive = policy?.maxActive ?? LEARNING_NOTIFICATION_POLICY.maxActive,
    dedupeWindowMs = policy?.dedupeWindowMs ?? LEARNING_NOTIFICATION_POLICY.dedupeWindowMs,
    ttlMs = policy?.ttlMs ?? LEARNING_NOTIFICATION_POLICY.ttlMs,
    staleTtlMs = policy?.staleTtlMs ?? LEARNING_NOTIFICATION_POLICY.staleTtlMs,
    current = policy?.current ?? LEARNING_NOTIFICATION_POLICY.current;
  if (
    !Number.isSafeInteger(maxActive) ||
    maxActive < 1 ||
    maxActive > LEARNING_NOTIFICATION_LIMITS.maxActive
  )
    fail('Learning notification active ceiling');
  if (!Number.isFinite(dedupeWindowMs) || dedupeWindowMs < 0 || dedupeWindowMs > 600_000)
    fail('Learning notification dedupe window');
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 600_000)
    fail('Learning notification time to live');
  if (!Number.isFinite(staleTtlMs) || staleTtlMs <= 0 || staleTtlMs > 600_000)
    fail('Learning notification stale time to live');
  return Object.freeze({
    maxActive,
    dedupeWindowMs,
    ttlMs,
    staleTtlMs,
    current: parseCurrentJob(current),
  });
}

function samePolicy(left: LearningNotificationPolicy, right: LearningNotificationPolicy): boolean {
  const sameCurrent =
    left.current === right.current ||
    (left.current !== null &&
      right.current !== null &&
      left.current.sessionId === right.current.sessionId &&
      left.current.worldEpoch === right.current.worldEpoch &&
      left.current.segmentId === right.current.segmentId &&
      left.current.jobKey === right.current.jobKey &&
      left.current.learningEpoch === right.current.learningEpoch);
  return (
    left.maxActive === right.maxActive &&
    left.dedupeWindowMs === right.dedupeWindowMs &&
    left.ttlMs === right.ttlMs &&
    left.staleTtlMs === right.staleTtlMs &&
    sameCurrent
  );
}

export interface LearningNotificationDedupeRow {
  readonly dedupeKey: string;
  readonly at: number;
}

export interface LearningNotificationCounters {
  readonly accepted: number;
  readonly stale: number;
  readonly deduped: number;
  readonly evicted: number;
  readonly expired: number;
  readonly identical: number;
}

export interface LearningNotificationEntry {
  readonly event: LearningNotificationEvent;
  readonly dedupeKey: string;
  readonly receivedAt: number;
  readonly expiresAt: number;
  /** The kind actually shown; `STALE` overrides a late `RESULT`/`ERROR`/... */
  readonly notifiedKind: LearningNotificationKind;
  readonly stale: boolean;
}

export interface LearningNotificationState {
  readonly version: typeof LEARNING_NOTIFICATION_VERSION;
  readonly policy: LearningNotificationPolicy;
  readonly nowMs: number;
  /** At most `policy.maxActive` entries, oldest first. */
  readonly entries: readonly LearningNotificationEntry[];
  /** Bounded dedupe memory: one row per `segmentId + jobKey + kind`. */
  readonly seen: readonly LearningNotificationDedupeRow[];
  /** Bounded memory of processed event ids. */
  readonly eventIds: readonly string[];
  readonly counters: LearningNotificationCounters;
}

const EMPTY_COUNTERS: LearningNotificationCounters = Object.freeze({
  accepted: 0,
  stale: 0,
  deduped: 0,
  evicted: 0,
  expired: 0,
  identical: 0,
});

export function createLearningNotificationState(
  policy?: Partial<LearningNotificationPolicy>,
): LearningNotificationState {
  return Object.freeze({
    version: LEARNING_NOTIFICATION_VERSION,
    policy: policyOf(policy),
    nowMs: 0,
    entries: Object.freeze([]),
    seen: Object.freeze([]),
    eventIds: Object.freeze([]),
    counters: EMPTY_COUNTERS,
  });
}

/** True when the event no longer belongs to the current job identity. */
export function isLearningNotificationStale(
  event: Pick<
    LearningNotificationIdentity,
    'sessionId' | 'worldEpoch' | 'segmentId' | 'jobKey' | 'learningEpoch'
  >,
  current: LearningNotificationCurrentJob | null,
): boolean {
  if (current === null) return false;
  return (
    event.sessionId !== current.sessionId ||
    event.worldEpoch !== current.worldEpoch ||
    event.segmentId !== current.segmentId ||
    event.jobKey !== current.jobKey ||
    event.learningEpoch !== current.learningEpoch
  );
}

/** Same `segmentId + jobKey + kind` key used by the bounded dedupe window. */
export function learningNotificationDedupeKey(
  event: Pick<LearningNotificationEvent, 'segmentId' | 'jobKey' | 'kind'>,
): string {
  return `${event.segmentId}\u0000${event.jobKey}\u0000${event.kind}`;
}

function freezeSeen(
  rows: LearningNotificationDedupeRow[],
): readonly LearningNotificationDedupeRow[] {
  const maximum = LEARNING_NOTIFICATION_LIMITS.seenKeys;
  return Object.freeze(rows.length > maximum ? rows.slice(rows.length - maximum) : rows);
}

function asStaleEntry(
  entry: LearningNotificationEntry,
  nowMs: number,
  policy: LearningNotificationPolicy,
): LearningNotificationEntry {
  if (entry.notifiedKind === 'STALE') return entry;
  return Object.freeze({
    ...entry,
    notifiedKind: 'STALE',
    stale: true,
    expiresAt: Math.min(entry.expiresAt, nowMs + policy.staleTtlMs),
  });
}

/**
 * Drops expired rows and reclassifies entries whose job is no longer current. Returns the same
 * state object when nothing changed, so an idle `update` is a true no-op.
 */
export function expireLearningNotifications(
  state: LearningNotificationState,
  nowMs: number,
  policy?: Partial<LearningNotificationPolicy>,
): LearningNotificationState {
  if (!Number.isFinite(nowMs) || nowMs < 0) fail('Learning notification clock must be finite');
  if (nowMs < state.nowMs) fail('Learning notification clock must not go backwards');
  const nextPolicy = policyOf(policy ?? state.policy);
  let expired = 0,
    changed = !samePolicy(state.policy, nextPolicy);
  const kept: LearningNotificationEntry[] = [];
  for (const entry of state.entries) {
    if (nowMs >= entry.expiresAt) {
      expired += 1;
      changed = true;
      continue;
    }
    if (
      entry.notifiedKind !== 'STALE' &&
      isLearningNotificationStale(entry.event, nextPolicy.current)
    ) {
      changed = true;
      kept.push(asStaleEntry(entry, nowMs, nextPolicy));
      continue;
    }
    kept.push(entry);
  }
  if (!changed) return state;
  return Object.freeze({
    ...state,
    policy: nextPolicy,
    nowMs,
    entries: Object.freeze(kept),
    counters: Object.freeze({ ...state.counters, expired: state.counters.expired + expired }),
  });
}

/**
 * Applies one event. It keeps at most three visible notifications, deduplicates the same
 * segment/job/kind inside the policy window, marks late events as `STALE` and never invents a
 * value, a count or a publication. A repeated `eventId` never adds or rewrites a row.
 */
export function reduceLearningNotifications(
  state: LearningNotificationState,
  event: unknown,
  nowMs: number,
  policy?: Partial<LearningNotificationPolicy>,
): LearningNotificationState {
  const parsed = parseLearningNotificationEvent(event);
  if (!Number.isFinite(nowMs) || nowMs < 0) fail('Learning notification clock must be finite');
  if (nowMs < state.nowMs) fail('Learning notification clock must not go backwards');
  const nextPolicy = policyOf(policy ?? state.policy);
  if (state.eventIds.includes(parsed.eventId))
    return Object.freeze({
      ...state,
      nowMs,
      counters: Object.freeze({ ...state.counters, identical: state.counters.identical + 1 }),
    });
  const base = expireLearningNotifications(state, nowMs, nextPolicy),
    dedupeKey = learningNotificationDedupeKey(parsed),
    hit = base.seen.find((row) => row.dedupeKey === dedupeKey);
  if (hit !== undefined && nowMs - hit.at < nextPolicy.dedupeWindowMs) {
    return Object.freeze({
      ...base,
      nowMs,
      seen: freezeSeen([
        ...base.seen.filter((row) => row.dedupeKey !== dedupeKey),
        Object.freeze({ dedupeKey, at: nowMs }),
      ]),
      counters: Object.freeze({ ...base.counters, deduped: base.counters.deduped + 1 }),
    });
  }
  const stale = isLearningNotificationStale(parsed, nextPolicy.current),
    notifiedKind: LearningNotificationKind = stale ? 'STALE' : parsed.kind;
  const entries = [...base.entries];
  let evicted = 0;
  while (entries.length >= nextPolicy.maxActive) {
    entries.shift();
    evicted += 1;
  }
  entries.push(
    Object.freeze({
      event: parsed,
      dedupeKey,
      receivedAt: nowMs,
      expiresAt: nowMs + (notifiedKind === 'STALE' ? nextPolicy.staleTtlMs : nextPolicy.ttlMs),
      notifiedKind,
      stale,
    }),
  );
  const eventIds = [...base.eventIds, parsed.eventId],
    maximum = LEARNING_NOTIFICATION_LIMITS.eventIds;
  return Object.freeze({
    ...base,
    nowMs,
    entries: Object.freeze(entries),
    seen: freezeSeen([...base.seen, Object.freeze({ dedupeKey, at: nowMs })]),
    eventIds: Object.freeze(eventIds.length > maximum ? eventIds.slice(-maximum) : eventIds),
    counters: Object.freeze({
      ...base.counters,
      accepted: base.counters.accepted + 1,
      stale: base.counters.stale + (notifiedKind === 'STALE' ? 1 : 0),
      evicted: base.counters.evicted + evicted,
    }),
  });
}

/** Removes one visible notification by `eventId`. The id stays remembered, so it cannot reappear. */
export function dismissLearningNotification(
  state: LearningNotificationState,
  eventId: string,
): LearningNotificationState {
  const entries = state.entries.filter((entry) => entry.event.eventId !== eventId);
  if (entries.length === state.entries.length) return state;
  return Object.freeze({ ...state, entries: Object.freeze(entries) });
}

// ---------------------------------------------------------------------------------------------
// Pure projection: texts, symbols, binding attributes, counts and signature.
// ---------------------------------------------------------------------------------------------

export interface LearningNotificationMissingView {
  readonly key: string;
  readonly label: string;
  readonly state: LearningNotificationMissingState;
  readonly episodes: number | null;
  readonly text: string;
}

export interface LearningNotificationItem {
  readonly eventId: string;
  readonly kind: LearningNotificationKind;
  readonly segmentId: string;
  readonly jobKey: string;
  readonly generationKey: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly key: string;
  readonly order: number;
  readonly mode: LearningNotificationMode;
  readonly tick: number;
  readonly symbol: string;
  readonly title: string;
  readonly text: string;
  readonly detail: string | null;
  readonly missing: readonly LearningNotificationMissingView[];
  readonly soundCue: LearningNotificationSoundCue;
  /** Only an explicit `PUBLISHED` notification is a success and a publication. */
  readonly published: boolean;
  readonly success: boolean;
  readonly stale: boolean;
  readonly quiet: boolean;
  readonly receivedAt: number;
  readonly expiresAt: number;
  /** `data-*` binding written by the DOM adapter; identity is never colour-only. */
  readonly attributes: readonly (readonly [string, string])[];
}

export interface LearningNotificationCounts {
  readonly active: number;
  readonly stale: number;
  readonly errors: number;
  readonly results: number;
  readonly analyzing: number;
  readonly published: number;
  readonly deduped: number;
  readonly evicted: number;
  readonly expired: number;
  readonly identical: number;
}

export interface LearningNotificationView {
  readonly version: typeof LEARNING_NOTIFICATION_VERSION;
  readonly notifications: readonly LearningNotificationItem[];
  readonly counts: LearningNotificationCounts;
  readonly dedupeWindowMs: number;
  readonly maxActive: number;
  readonly summary: string;
  readonly signature: string;
}

function bindingText(event: LearningNotificationIdentity): string {
  return `segmentul ${event.segmentId} · jobul ${event.jobKey}`;
}

function valueText(value: number, unit: string): string {
  return `${formatLearningNotificationNumber(value)} ${unit}`;
}

function missingText(row: LearningNotificationMissingObservation): string {
  const episodes =
    row.episodes === null ? String(row.state) : `${row.episodes} episoade, ${row.state}`;
  return `${row.key} (${episodes})`;
}

function bodyOf(
  event: LearningNotificationEvent,
  view: LearningNotificationKindView,
  notifiedKind: LearningNotificationKind,
): string {
  const binding = bindingText(event);
  if (notifiedKind === 'STALE') return `${view.title} · ${event.key} · ${binding}`;
  switch (event.kind) {
    case 'ANALYZING':
      return `${view.title} · ${event.key} · ${binding}`;
    case 'RESULT':
      return `${view.title}: ${event.label} ${valueText(event.previousValue, event.unit)} → ${valueText(event.value, event.unit)} · ${binding}`;
    case 'NO_CHANGE':
      return `${view.title} pentru ${event.label} · ${binding}`;
    case 'INSUFFICIENT_EVIDENCE':
      return `${view.title} · Lipsesc dovezi: ${event.missing.map(missingText).join('; ')} · ${binding}`;
    case 'ERROR':
      return `${view.title} (${event.reason})${event.detail === null ? '' : `: ${event.detail}`} · ${binding}`;
    case 'REJECTED':
      return `${view.title} (${event.reason})${event.detail === null ? '' : `: ${event.detail}`} · ${binding}`;
    case 'CANCELLED':
      return `${view.title}${event.detail === null ? '' : `: ${event.detail}`} · ${binding}`;
    case 'INVALIDATED':
      return `${view.title} (${event.reason})${event.detail === null ? '' : `: ${event.detail}`} · ${binding}`;
    case 'STALE':
      return `${view.title} (${event.reason}) · ${binding}`;
    case 'PUBLISHED':
      return event.previousValue === null
        ? `${view.title}: ${event.label} ${valueText(event.value, event.unit)} · versiune ${event.publicationVersionId} · ${binding}`
        : `${view.title}: ${event.label} ${valueText(event.previousValue, event.unit)} → ${valueText(event.value, event.unit)} · versiune ${event.publicationVersionId} · ${binding}`;
  }
}

function itemOf(entry: LearningNotificationEntry): LearningNotificationItem {
  const event = entry.event,
    view = learningNotificationKindView(entry.notifiedKind),
    missing =
      event.kind === 'INSUFFICIENT_EVIDENCE'
        ? Object.freeze(
            event.missing.map((row) =>
              Object.freeze({
                key: row.key,
                label: row.label,
                state: row.state,
                episodes: row.episodes,
                text: missingText(row),
              }),
            ),
          )
        : Object.freeze([]),
    detail = 'detail' in event ? (event as { readonly detail: string | null }).detail : null,
    text = bodyOf(event, view, entry.notifiedKind),
    attributes: (readonly [string, string])[] = [
      ['data-event', event.eventId],
      ['data-kind', entry.notifiedKind],
      ['data-segment', event.segmentId],
      ['data-job', event.jobKey],
      ['data-generation', event.generationKey],
      ['data-profile', event.profileId],
      ['data-learning-epoch', String(event.learningEpoch)],
      ['data-session', event.sessionId],
      ['data-world-epoch', String(event.worldEpoch)],
      ['data-key', event.key],
      ['data-order', String(event.order)],
      ['data-mode', event.mode],
      ['data-tick', String(event.tick)],
      ['data-sound', view.soundCue],
      ['data-stale', entry.stale ? 'true' : 'false'],
      ['data-success', view.success ? 'true' : 'false'],
      ['data-published', view.success ? 'true' : 'false'],
    ];
  return Object.freeze({
    eventId: event.eventId,
    kind: entry.notifiedKind,
    segmentId: event.segmentId,
    jobKey: event.jobKey,
    generationKey: event.generationKey,
    profileId: event.profileId,
    learningEpoch: event.learningEpoch,
    sessionId: event.sessionId,
    worldEpoch: event.worldEpoch,
    key: event.key,
    order: event.order,
    mode: event.mode,
    tick: event.tick,
    symbol: view.symbol,
    title: view.title,
    text,
    detail,
    missing,
    soundCue: view.soundCue,
    published: entry.notifiedKind === 'PUBLISHED',
    success: view.success,
    stale: entry.stale,
    quiet: view.quiet,
    receivedAt: entry.receivedAt,
    expiresAt: entry.expiresAt,
    attributes: Object.freeze(attributes.map((row) => Object.freeze(row))),
  });
}

/** Pure projection shared by the adapter, the tests and the evidence report. */
export function projectLearningNotifications(
  state: LearningNotificationState,
): LearningNotificationView {
  const notifications = Object.freeze(state.entries.map(itemOf));
  let stale = 0,
    errors = 0,
    results = 0,
    analyzing = 0,
    published = 0;
  for (const item of notifications) {
    if (item.stale) stale += 1;
    if (
      item.kind === 'ERROR' ||
      item.kind === 'REJECTED' ||
      item.kind === 'CANCELLED' ||
      item.kind === 'INVALIDATED'
    )
      errors += 1;
    if (
      item.kind === 'RESULT' ||
      item.kind === 'NO_CHANGE' ||
      item.kind === 'INSUFFICIENT_EVIDENCE'
    )
      results += 1;
    if (item.kind === 'ANALYZING') analyzing += 1;
    if (item.published) published += 1;
  }
  const counts: LearningNotificationCounts = Object.freeze({
    active: notifications.length,
    stale,
    errors,
    results,
    analyzing,
    published,
    deduped: state.counters.deduped,
    evicted: state.counters.evicted,
    expired: state.counters.expired,
    identical: state.counters.identical,
  });
  const summary =
    notifications.length === 0
      ? 'Nicio notificare activă.'
      : `${notifications.length} din ${state.policy.maxActive} notificări active: ` +
        `${analyzing} în analiză, ${results} ${results === 1 ? 'rezultat' : 'rezultate'}, ` +
        `${errors} ${errors === 1 ? 'eroare' : 'erori'}` +
        `${stale === 0 ? '' : `, ${stale} ${stale === 1 ? 'întârziat' : 'întârziate'}`}` +
        `${published === 0 ? '' : `, ${published} ${published === 1 ? 'publicat' : 'publicate'}`}.`;
  const signature = JSON.stringify([
    LEARNING_NOTIFICATION_VERSION,
    state.policy.maxActive,
    notifications.map((item) => [
      item.eventId,
      item.kind,
      item.text,
      item.detail,
      item.missing.map((row) => row.text),
      item.soundCue,
      item.published,
      item.stale,
    ]),
    summary,
  ]);
  return Object.freeze({
    version: LEARNING_NOTIFICATION_VERSION,
    notifications,
    counts,
    dedupeWindowMs: state.policy.dedupeWindowMs,
    maxActive: state.policy.maxActive,
    summary,
    signature,
  });
}
