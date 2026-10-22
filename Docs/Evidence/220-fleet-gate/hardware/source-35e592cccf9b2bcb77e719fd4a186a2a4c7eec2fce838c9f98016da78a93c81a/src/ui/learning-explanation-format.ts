/**
 * 104 learning explanation contract.
 *
 * The module is a pure read model over one real learning result: it explains every accepted delta
 * with the evidence that produced it, and it explains a non-change without inventing a version.
 * It never learns, publishes, activates, mutates a profile or writes a store.
 *
 * The four non-change outcomes are deliberately distinct and closed:
 * - `CHANGED` requires at least one change and the real composition `versionId`;
 * - `NO_CHANGE` and `INSUFFICIENT_EVIDENCE` require `versionId: null`, zero changes and a closed
 *   reason, so a missing explanation can never be disguised as a new profile version;
 * - `ERROR` and `REJECTED` require zero changes, no version and the real closed reason/detail;
 * - a change must carry a positive effective evidence count and at least one real context; a real
 *   zero (`next === 0`) is a valid observed value, never a missing one;
 * - keys are unique, ordered and belong to the learnable stage when the caller supplies the key set,
 *   so an R (`extension`) key can never appear as a learned change.
 *
 * The DOM adapter is `src/ui/learning-explanation.ts`, and the 103 composition root is
 * `src/app/learning-explanation.ts`.
 */
export const LEARNING_EXPLANATION_VERSION = '104-learning-explanation-v1' as const;

export const learningExplanationStatuses = [
  'CHANGED',
  'NO_CHANGE',
  'INSUFFICIENT_EVIDENCE',
  'REJECTED',
  'ERROR',
] as const;
export type LearningExplanationStatus = (typeof learningExplanationStatuses)[number];

/** Closed reasons for a frame that explains why no new version was produced. */
export const learningExplanationNoChangeReasons = [
  'NO_NEW_EVIDENCE',
  'WEAK_EVIDENCE',
  'BELOW_THRESHOLD',
  'UNCHANGED_ESTIMATE',
] as const;
export type LearningExplanationNoChangeReason = (typeof learningExplanationNoChangeReasons)[number];

/** The 100 vocabulary, kept distinct: `UNOBSERVED`, `WEAK` and a real `ZERO` never collapse. */
export const learningExplanationConfidenceStates = [
  'UNOBSERVED',
  'WEAK',
  'ZERO',
  'OBSERVED',
] as const;
export type LearningExplanationConfidenceState =
  (typeof learningExplanationConfidenceStates)[number];

export const learningExplanationUncertainties = ['NONE', 'LOW', 'MODERATE', 'HIGH'] as const;
export type LearningExplanationUncertainty = (typeof learningExplanationUncertainties)[number];

export const learningExplanationModes = ['LEARNING', 'MANUAL', 'AUTO'] as const;
export type LearningExplanationMode = (typeof learningExplanationModes)[number];

export const LEARNING_EXPLANATION_LIMITS = Object.freeze({
  version: LEARNING_EXPLANATION_VERSION,
  /** Text/attribute write ceiling of the DOM adapter; never tied to the simulation tick. */
  maximumHz: 10,
  /** The 24 `initial_learning_target` keys are the only possible change rows. */
  changes: 24,
  contextsPerChange: 8,
  sourcesPerChange: 16,
  /** Bounded list of explicit missing evidence/context strings. */
  missingContexts: 8,
  idCodeUnits: 512,
  keyCodeUnits: 64,
  labelCodeUnits: 160,
  unitCodeUnits: 16,
  contextCodeUnits: 96,
  /** Closed reason token for a failure, or the closed no-change reason. */
  reasonCodeUnits: 120,
  detailCodeUnits: 240,
  /** Deterministic decimal places used for values, deltas and quality. */
  decimals: 3,
  maxEvidenceCount: 1_000_000,
  /** Retained projection inside the adapter; this module keeps no history. */
  retainedViews: 1,
  history: 0,
});

/** The exact sentence every frame without a new version must show. */
export const LEARNING_EXPLANATION_NO_CHANGE_TEXT =
  'Nicio versiune nouă — dovezile nu justifică o schimbare';

export const LEARNING_EXPLANATION_NO_VERSION_TEXT = 'Nicio versiune nouă';

/** Deterministic, locale-independent number text: at most three decimals, a real zero is `0`. */
export function formatLearningExplanationNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded === 0) return '0';
  return rounded.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/** Probability/ratio/weight keep their canonical contract unit and get a readable label. */
export function learningExplanationUnitLabel(unit: string): string {
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

/** A signed delta with its canonical unit, e.g. `+0.3 s` or `-1 probabilitate`. */
export function formatLearningExplanationDelta(delta: number, unit: string): string {
  const rounded = Math.round(delta * 1000) / 1000,
    sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '',
    value = formatLearningExplanationNumber(Math.abs(rounded));
  return `${sign}${value} ${learningExplanationUnitLabel(unit)}`;
}

/** One changed parameter, fully traceable to the evidence that supported it. */
export interface LearningExplanationChange {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly previous: number;
  readonly next: number;
  /** `next - previous`; a real zero value is preserved as `0`. */
  readonly delta: number;
  /** Effective episodes (100), never the frame/sample count. */
  readonly evidenceCount: number;
  readonly contexts: readonly string[];
  /** 100 quality in `[0, 1]`; exactly `0` for a `WEAK` change. */
  readonly quality: number;
  readonly uncertainty: LearningExplanationUncertainty;
  readonly confidence: LearningExplanationConfidenceState;
  readonly sourceSegmentIds: readonly string[];
  readonly reason: string;
}

/** The accepted frame. `summary` and `signature` are derived and must match this contract. */
export interface LearningExplanationSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof LEARNING_EXPLANATION_VERSION;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly segmentId: string;
  /** `job:104:<segment>:<order>` of the head result. */
  readonly jobKey: string;
  /** `gen:104:<profile>:<learningEpoch>:<baseVersion>`. */
  readonly generationKey: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly mode: LearningExplanationMode;
  readonly order: number;
  readonly status: LearningExplanationStatus;
  /** The real 103 composition version, or `null` for every frame without a new version. */
  readonly versionId: string | null;
  readonly changes: readonly LearningExplanationChange[];
  /** Closed no-change reason, or the real closed 103 reason for `ERROR`/`REJECTED`. */
  readonly noChangeReason: string | null;
  readonly missingContexts: readonly string[];
  /** Real 103 detail for `ERROR`/`REJECTED`; `null` otherwise. */
  readonly detail: string | null;
  readonly summary: string;
  readonly signature: string;
}

/** The producer-side frame: `summary` and `signature` are computed by the contract. */
export interface LearningExplanationFrame {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly segmentId: string;
  readonly jobKey: string;
  readonly generationKey: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly mode: LearningExplanationMode;
  readonly order: number;
  readonly status: LearningExplanationStatus;
  readonly versionId: string | null;
  readonly changes: readonly LearningExplanationChange[];
  readonly noChangeReason: string | null;
  readonly missingContexts: readonly string[];
  readonly detail: string | null;
}

export interface LearningExplanationStatusView {
  readonly status: LearningExplanationStatus;
  readonly symbol: string;
  readonly title: string;
  /** `CHANGED` is the only successful job result; it is still never a publication. */
  readonly success: boolean;
  readonly published: false;
  /** `true` for every frame without a new version. */
  readonly noVersion: boolean;
}

const STATUS_VIEWS: Readonly<Record<LearningExplanationStatus, LearningExplanationStatusView>> =
  Object.freeze({
    CHANGED: Object.freeze({
      status: 'CHANGED',
      symbol: 'Δ',
      title: 'Modificare explicată',
      success: true,
      published: false,
      noVersion: false,
    }),
    NO_CHANGE: Object.freeze({
      status: 'NO_CHANGE',
      symbol: '=',
      title: 'Nicio modificare justificată',
      success: false,
      published: false,
      noVersion: true,
    }),
    INSUFFICIENT_EVIDENCE: Object.freeze({
      status: 'INSUFFICIENT_EVIDENCE',
      symbol: '?',
      title: 'Dovezi insuficiente',
      success: false,
      published: false,
      noVersion: true,
    }),
    REJECTED: Object.freeze({
      status: 'REJECTED',
      symbol: '⊘',
      title: 'Rezultat respins',
      success: false,
      published: false,
      noVersion: true,
    }),
    ERROR: Object.freeze({
      status: 'ERROR',
      symbol: '✕',
      title: 'Eroare de analiză',
      success: false,
      published: false,
      noVersion: true,
    }),
  });

export function learningExplanationStatusView(
  status: LearningExplanationStatus,
): LearningExplanationStatusView {
  const view = STATUS_VIEWS[status];
  if (!view) throw new Error(`Unknown learning explanation status: ${String(status)}`);
  return view;
}

const NO_CHANGE_REASON_LABELS: Readonly<Record<LearningExplanationNoChangeReason, string>> =
  Object.freeze({
    NO_NEW_EVIDENCE: 'nu există episoade noi eligibile pentru cheile analizate',
    WEAK_EVIDENCE: 'dovezile existente sunt sub prag (număr efectiv, expunere sau contradicție)',
    BELOW_THRESHOLD: 'dovezile nu ating pragul necesar pentru o actualizare',
    UNCHANGED_ESTIMATE: 'estimarea a fost suficientă, dar coincide cu valoarea curentă',
  });

const CONFIDENCE_LABELS: Readonly<Record<LearningExplanationConfidenceState, string>> =
  Object.freeze({
    UNOBSERVED: 'Neobservat',
    WEAK: 'Dovezi slabe',
    ZERO: 'Zero observat',
    OBSERVED: 'Dovezi suficiente',
  });

const STATUS_SET = new Set<string>(learningExplanationStatuses);
const NO_CHANGE_REASON_SET = new Set<string>(learningExplanationNoChangeReasons);
const CONFIDENCE_SET = new Set<string>(learningExplanationConfidenceStates);
const UNCERTAINTY_SET = new Set<string>(learningExplanationUncertainties);
const MODE_SET = new Set<string>(learningExplanationModes);

/** Tokens that would claim a success/version from an `ERROR`/`REJECTED` frame. */
const FORBIDDEN_FAILURE_REASONS = new Set([
  'PUBLISHED',
  'SUCCESS',
  'LEARNED',
  'CHANGED',
  'NO_VERSION',
  'NO_CHANGE',
]);

const PARAMETER_KEY = /^[a-z][a-z0-9_]*$/;
/** Closed failure reason code, e.g. `RESULT_INVALID`, `STALE_JOB` or `COMPOSITION_REJECTED`. */
const FAILURE_REASON = /^[A-Z][A-Z0-9_]{0,63}$/;

// ---------------------------------------------------------------------------------------------
// Strict parser. Unknown fields, duplicate/unsorted keys, contradictory status/value combinations
// and a summary/signature that do not match the contract are rejected before any consumer or DOM.
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

function identityText(value: unknown, label: string): string {
  return boundedText(value, label, LEARNING_EXPLANATION_LIMITS.idCodeUnits);
}

function parameterKey(value: unknown, label: string): string {
  const key = boundedText(value, label, LEARNING_EXPLANATION_LIMITS.keyCodeUnits);
  if (!PARAMETER_KEY.test(key) || ['constructor', 'prototype', '__proto__'].includes(key))
    fail(`${label} shape`);
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

function nonNegativeNumber(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (number < 0) fail(`${label} must not be negative`);
  return number;
}

function textList(
  value: unknown,
  label: string,
  maximum: number,
  minimum: number,
  codeUnits: number = LEARNING_EXPLANATION_LIMITS.idCodeUnits,
): readonly string[] {
  if (!Array.isArray(value)) fail(`${label} list`);
  if (value.length < minimum || value.length > maximum) fail(`${label} ceiling`);
  const rows: string[] = [];
  for (const entry of value) {
    const text = boundedText(entry, label, codeUnits);
    if (rows.includes(text)) fail(`${label} duplicate`);
    rows.push(text);
  }
  return Object.freeze(rows);
}

function parseChange(
  value: unknown,
  learningKeys: ReadonlySet<string> | null,
): LearningExplanationChange {
  const data = exact(
      value,
      [
        'key',
        'label',
        'unit',
        'previous',
        'next',
        'delta',
        'evidenceCount',
        'contexts',
        'quality',
        'uncertainty',
        'confidence',
        'sourceSegmentIds',
        'reason',
      ],
      'Learning explanation change',
    ),
    key = parameterKey(data.key, 'Learning explanation key');
  if (learningKeys !== null && !learningKeys.has(key))
    fail(`Learning explanation key is not a learning target: ${key}`);
  const label = boundedText(
      data.label,
      'Learning explanation label',
      LEARNING_EXPLANATION_LIMITS.labelCodeUnits,
    ),
    unit = boundedText(
      data.unit,
      'Learning explanation unit',
      LEARNING_EXPLANATION_LIMITS.unitCodeUnits,
    ),
    previous = finiteNumber(data.previous, 'Learning explanation previous value'),
    next = finiteNumber(data.next, 'Learning explanation next value'),
    delta = finiteNumber(data.delta, 'Learning explanation delta'),
    evidenceCount = nonNegativeNumber(data.evidenceCount, 'Learning explanation evidence count'),
    quality = finiteNumber(data.quality, 'Learning explanation quality'),
    uncertainty = data.uncertainty,
    confidence = data.confidence;
  if (next === previous) fail('Learning explanation change must actually change the value');
  if (Math.abs(delta - (next - previous)) > 1e-6)
    fail('Learning explanation delta does not match next - previous');
  if (evidenceCount <= 0) fail('Learning explanation change requires positive evidence');
  if (evidenceCount > LEARNING_EXPLANATION_LIMITS.maxEvidenceCount)
    fail('Learning explanation evidence ceiling');
  if (quality < 0 || quality > 1) fail('Learning explanation quality range');
  if (typeof uncertainty !== 'string' || !UNCERTAINTY_SET.has(uncertainty))
    fail('Learning explanation uncertainty');
  if (typeof confidence !== 'string' || !CONFIDENCE_SET.has(confidence))
    fail('Learning explanation confidence');
  if (confidence === 'UNOBSERVED') fail('Learning explanation change cannot be unobserved');
  if (confidence === 'ZERO' && next !== 0)
    fail('Learning explanation zero confidence requires a real zero value');
  if ((confidence === 'WEAK') !== (Math.round(quality * 1_000_000) === 0))
    fail('Learning explanation weak confidence and quality disagree');
  if (confidence === 'WEAK' && uncertainty !== 'HIGH')
    fail('Learning explanation weak confidence requires high uncertainty');
  const contexts = textList(
      data.contexts,
      'Learning explanation context',
      LEARNING_EXPLANATION_LIMITS.contextsPerChange,
      1,
      LEARNING_EXPLANATION_LIMITS.contextCodeUnits,
    ),
    sourceSegmentIds = textList(
      data.sourceSegmentIds,
      'Learning explanation source',
      LEARNING_EXPLANATION_LIMITS.sourcesPerChange,
      1,
    ),
    reason = boundedText(
      data.reason,
      'Learning explanation reason',
      LEARNING_EXPLANATION_LIMITS.reasonCodeUnits,
    );
  return Object.freeze({
    key,
    label,
    unit,
    previous,
    next,
    delta,
    evidenceCount,
    contexts,
    quality,
    uncertainty: uncertainty as LearningExplanationUncertainty,
    confidence: confidence as LearningExplanationConfidenceState,
    sourceSegmentIds,
    reason,
  });
}

const SNAPSHOT_FIELDS = [
  'schemaVersion',
  'units',
  'version',
  'sessionId',
  'worldEpoch',
  'tick',
  'segmentId',
  'jobKey',
  'generationKey',
  'profileId',
  'learningEpoch',
  'mode',
  'order',
  'status',
  'versionId',
  'changes',
  'noChangeReason',
  'missingContexts',
  'detail',
  'summary',
  'signature',
] as const;

interface ParsedBody {
  readonly frame: LearningExplanationFrame;
}

function bodyOf(value: unknown, learningKeys: ReadonlySet<string> | null): ParsedBody {
  const data = exact(value, SNAPSHOT_FIELDS, 'Learning explanation snapshot');
  if (
    data.schemaVersion !== 1 ||
    data.units !== 'SI' ||
    data.version !== LEARNING_EXPLANATION_VERSION
  )
    fail('Learning explanation contract');
  const status = data.status;
  if (typeof status !== 'string' || !STATUS_SET.has(status)) fail('Learning explanation status');
  const parsedStatus = status as LearningExplanationStatus,
    mode = data.mode;
  if (typeof mode !== 'string' || !MODE_SET.has(mode)) fail('Learning explanation mode');
  if (!Array.isArray(data.changes)) fail('Learning explanation change list');
  if (data.changes.length > LEARNING_EXPLANATION_LIMITS.changes)
    fail('Learning explanation change ceiling');
  const changes = data.changes.map((entry) => parseChange(entry, learningKeys)),
    seen = new Set<string>();
  let previousKey: string | null = null;
  for (const change of changes) {
    if (seen.has(change.key)) fail('Learning explanation duplicate change key');
    seen.add(change.key);
    if (previousKey !== null && change.key < previousKey)
      fail('Learning explanation changes must be ordered by key');
    previousKey = change.key;
  }
  const versionId =
    data.versionId === null ? null : identityText(data.versionId, 'Learning explanation version');
  const reason =
    data.noChangeReason === null
      ? null
      : boundedText(
          data.noChangeReason,
          'Learning explanation reason',
          LEARNING_EXPLANATION_LIMITS.reasonCodeUnits,
        );
  const detail =
    data.detail === null
      ? null
      : boundedText(
          data.detail,
          'Learning explanation detail',
          LEARNING_EXPLANATION_LIMITS.detailCodeUnits,
        );
  const missingContexts = textList(
    data.missingContexts,
    'Learning explanation missing context',
    LEARNING_EXPLANATION_LIMITS.missingContexts,
    0,
  );
  if (parsedStatus === 'CHANGED') {
    if (changes.length === 0) fail('Learning explanation CHANGED requires at least one change');
    if (versionId === null) fail('Learning explanation CHANGED requires a version id');
    if (reason !== null) fail('Learning explanation CHANGED cannot carry a no-change reason');
    if (missingContexts.length > 0)
      fail('Learning explanation CHANGED cannot carry missing contexts');
    if (detail !== null) fail('Learning explanation CHANGED cannot carry a failure detail');
  } else if (parsedStatus === 'NO_CHANGE' || parsedStatus === 'INSUFFICIENT_EVIDENCE') {
    if (changes.length > 0) fail(`Learning explanation ${parsedStatus} cannot carry a change`);
    if (versionId !== null) fail(`Learning explanation ${parsedStatus} cannot claim a version`);
    if (reason === null || !NO_CHANGE_REASON_SET.has(reason))
      fail(`Learning explanation ${parsedStatus} requires a closed reason`);
    if (parsedStatus === 'INSUFFICIENT_EVIDENCE' && missingContexts.length === 0)
      fail('Learning explanation INSUFFICIENT_EVIDENCE requires a concrete missing context');
    if (reason !== 'UNCHANGED_ESTIMATE' && missingContexts.length === 0)
      fail('Learning explanation no-change requires a concrete explanation');
    if (detail !== null) fail(`Learning explanation ${parsedStatus} cannot carry a failure detail`);
  } else {
    if (changes.length > 0) fail(`Learning explanation ${parsedStatus} cannot carry a change`);
    if (versionId !== null) fail(`Learning explanation ${parsedStatus} cannot claim a version`);
    if (reason === null || !FAILURE_REASON.test(reason) || FORBIDDEN_FAILURE_REASONS.has(reason))
      fail(`Learning explanation ${parsedStatus} requires a real failure reason`);
    if (missingContexts.length > 0)
      fail(`Learning explanation ${parsedStatus} cannot carry missing contexts`);
  }
  return {
    frame: {
      schemaVersion: 1,
      units: 'SI',
      sessionId: identityText(data.sessionId, 'Learning explanation session'),
      worldEpoch: boundedInteger(data.worldEpoch, 'Learning explanation world epoch'),
      tick: nonNegativeNumber(data.tick, 'Learning explanation tick'),
      segmentId: identityText(data.segmentId, 'Learning explanation segment'),
      jobKey: identityText(data.jobKey, 'Learning explanation job'),
      generationKey: identityText(data.generationKey, 'Learning explanation generation'),
      profileId: identityText(data.profileId, 'Learning explanation profile'),
      learningEpoch: boundedInteger(data.learningEpoch, 'Learning explanation learning epoch'),
      mode: mode as LearningExplanationMode,
      order: boundedInteger(data.order, 'Learning explanation order'),
      status: parsedStatus,
      versionId,
      changes: Object.freeze(changes),
      noChangeReason: reason,
      missingContexts,
      detail,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Deterministic summary and signature: the parser rejects a frame whose text does not match.
// ---------------------------------------------------------------------------------------------

function bindingText(frame: { readonly segmentId: string; readonly jobKey: string }): string {
  return `segmentul ${frame.segmentId} · jobul ${frame.jobKey}`;
}

function reasonLabelOf(frame: { readonly noChangeReason: string | null }): string | null {
  return frame.noChangeReason !== null &&
    NO_CHANGE_REASON_SET.has(frame.noChangeReason as LearningExplanationNoChangeReason)
    ? NO_CHANGE_REASON_LABELS[frame.noChangeReason as LearningExplanationNoChangeReason]
    : null;
}

function summaryOf(frame: LearningExplanationFrame): string {
  const binding = bindingText(frame),
    view = learningExplanationStatusView(frame.status);
  switch (frame.status) {
    case 'CHANGED':
      return (
        `${view.title}: ${frame.changes.length} ${frame.changes.length === 1 ? 'modificare' : 'modificări'} din ${binding}` +
        ` · versiune ${frame.versionId ?? LEARNING_EXPLANATION_NO_VERSION_TEXT}` +
        ` · ${frame.changes
          .map(
            (change) =>
              `${change.label} ${formatLearningExplanationNumber(change.previous)} → ` +
              `${formatLearningExplanationNumber(change.next)} ${learningExplanationUnitLabel(change.unit)} ` +
              `(${formatLearningExplanationDelta(change.delta, change.unit)})`,
          )
          .join('; ')}.`
      );
    case 'NO_CHANGE':
    case 'INSUFFICIENT_EVIDENCE': {
      const label = reasonLabelOf(frame);
      return (
        `${view.title} din ${binding} · ${LEARNING_EXPLANATION_NO_CHANGE_TEXT}` +
        `${label === null ? '' : ` · motiv: ${label}`}` +
        `${frame.missingContexts.length === 0 ? '' : ` · lipsesc: ${frame.missingContexts.join('; ')}`}.`
      );
    }
    case 'REJECTED':
    case 'ERROR':
      return `${view.title} din ${binding} (${frame.noChangeReason ?? 'REASON_MISSING'}) · ${LEARNING_EXPLANATION_NO_VERSION_TEXT}.`;
  }
}

function signatureOf(frame: LearningExplanationFrame, summary: string): string {
  return JSON.stringify([
    LEARNING_EXPLANATION_VERSION,
    frame.schemaVersion,
    frame.units,
    frame.sessionId,
    frame.worldEpoch,
    frame.tick,
    frame.segmentId,
    frame.jobKey,
    frame.generationKey,
    frame.profileId,
    frame.learningEpoch,
    frame.mode,
    frame.order,
    frame.status,
    frame.versionId,
    frame.changes.map((change) => [
      change.key,
      change.label,
      change.unit,
      change.previous,
      change.next,
      change.delta,
      change.evidenceCount,
      change.contexts,
      change.quality,
      change.uncertainty,
      change.confidence,
      change.sourceSegmentIds,
      change.reason,
    ]),
    frame.noChangeReason,
    frame.missingContexts,
    frame.detail,
    summary,
  ]);
}

/**
 * Validates and freezes one frame. When `learningKeys` is supplied every change key must belong to
 * that learnable stage, so an R key can never be rendered as a learned change.
 */
export function parseLearningExplanationSnapshot(
  value: unknown,
  learningKeys?: readonly string[],
): LearningExplanationSnapshot {
  const keys =
    learningKeys === undefined
      ? null
      : new Set<string>(
          learningKeys.map((key) => parameterKey(key, 'Learning explanation learning key')),
        );
  if (keys !== null && learningKeys !== undefined && keys.size !== learningKeys.length)
    fail('Learning explanation learning key list has duplicates');
  const { frame } = bodyOf(value, keys),
    data = plain(value, 'Learning explanation snapshot'),
    summary = summaryOf(frame),
    signature = signatureOf(frame, summary);
  if (data.summary !== summary) fail('Learning explanation summary does not match the contract');
  if (data.signature !== signature)
    fail('Learning explanation signature does not match the contract');
  return Object.freeze({
    ...frame,
    version: LEARNING_EXPLANATION_VERSION,
    summary,
    signature,
  });
}

/** Builds the only accepted frame shape: `summary` and `signature` are derived here. */
export function createLearningExplanationSnapshot(
  frame: LearningExplanationFrame,
  learningKeys?: readonly string[],
): LearningExplanationSnapshot {
  const parsed = bodyOf(
      { ...frame, version: LEARNING_EXPLANATION_VERSION, summary: '', signature: '' },
      learningKeys === undefined
        ? null
        : new Set<string>(
            learningKeys.map((key) => parameterKey(key, 'Learning explanation learning key')),
          ),
    ).frame,
    summary = summaryOf(parsed),
    signature = signatureOf(parsed, summary);
  return parseLearningExplanationSnapshot(
    {
      ...parsed,
      version: LEARNING_EXPLANATION_VERSION,
      summary,
      signature,
    },
    learningKeys,
  );
}

// ---------------------------------------------------------------------------------------------
// Pure projection: ordered rows, grouped text, explicit counts and a deterministic signature.
// ---------------------------------------------------------------------------------------------

export interface LearningExplanationChangeRow {
  readonly rowId: string;
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly unitLabel: string;
  readonly previous: number;
  readonly next: number;
  readonly delta: number;
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly deltaLabel: string;
  readonly changeLabel: string;
  readonly evidenceCount: number;
  readonly evidenceLabel: string;
  readonly contexts: readonly string[];
  readonly contextsLabel: string;
  readonly quality: number;
  readonly qualityLabel: string;
  readonly uncertainty: LearningExplanationUncertainty;
  readonly uncertaintyLabel: string;
  readonly confidence: LearningExplanationConfidenceState;
  readonly confidenceLabel: string;
  readonly sourceSegmentIds: readonly string[];
  readonly sourceLabel: string;
  readonly reason: string;
  /** Complete accessible row description; also the row `aria-label`. */
  readonly description: string;
}

export interface LearningExplanationMissingView {
  readonly index: number;
  readonly text: string;
}

export interface LearningExplanationCounts {
  readonly changes: number;
  readonly contexts: number;
  readonly missingContexts: number;
  readonly evidence: number;
}

export interface LearningExplanationView {
  readonly version: typeof LEARNING_EXPLANATION_VERSION;
  readonly status: LearningExplanationStatus;
  readonly symbol: string;
  readonly title: string;
  readonly success: boolean;
  readonly published: false;
  readonly noVersion: boolean;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly segmentId: string;
  readonly jobKey: string;
  readonly generationKey: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly mode: LearningExplanationMode;
  readonly order: number;
  /** The real version id, or `null` for every frame without a new version. */
  readonly versionId: string | null;
  /** The real version id, or the explicit “Nicio versiune nouă”. */
  readonly versionLabel: string;
  readonly rows: readonly LearningExplanationChangeRow[];
  readonly missing: readonly LearningExplanationMissingView[];
  /** The no-change sentence, or `null` for a change/failure frame. */
  readonly noChange: string | null;
  /** The failure reason/detail, or `null` for a change/no-change frame. */
  readonly failure: string | null;
  /** Grouped plain text: header binding, version, rows, no-change/failure explanation. */
  readonly text: string;
  readonly counts: LearningExplanationCounts;
  readonly summary: string;
  readonly signature: string;
}

function evidenceLabelOf(count: number): string {
  const value = formatLearningExplanationNumber(count),
    plural = Math.round(count * 1000) === 1000 ? 'episod efectiv' : 'episoade efective';
  return `${value} ${plural}`;
}

function rowOf(change: LearningExplanationChange): LearningExplanationChangeRow {
  const unitLabel = learningExplanationUnitLabel(change.unit),
    previousLabel = `${formatLearningExplanationNumber(change.previous)} ${unitLabel}`,
    nextLabel = `${formatLearningExplanationNumber(change.next)} ${unitLabel}`,
    deltaLabel = formatLearningExplanationDelta(change.delta, change.unit),
    evidenceLabel = evidenceLabelOf(change.evidenceCount),
    contextsLabel = change.contexts.join(', '),
    qualityLabel = `${Math.round(change.quality * 100)}%`,
    uncertaintyLabel = change.uncertainty,
    confidenceLabel = CONFIDENCE_LABELS[change.confidence],
    sourceLabel = change.sourceSegmentIds.join(', '),
    description = [
      `${change.label} (${change.key})`,
      `${previousLabel} → ${nextLabel}`,
      `delta ${deltaLabel}`,
      evidenceLabel,
      `contexte ${contextsLabel}`,
      `calitate ${qualityLabel}`,
      `incertitudine ${uncertaintyLabel}`,
      `încredere ${confidenceLabel}`,
      `segmente ${sourceLabel}`,
      `motiv ${change.reason}`,
    ].join('; ');
  return Object.freeze({
    rowId: change.key,
    key: change.key,
    label: change.label,
    unit: change.unit,
    unitLabel,
    previous: change.previous,
    next: change.next,
    delta: change.delta,
    previousLabel,
    nextLabel,
    deltaLabel,
    changeLabel: `${previousLabel} → ${nextLabel}`,
    evidenceCount: change.evidenceCount,
    evidenceLabel,
    contexts: change.contexts,
    contextsLabel,
    quality: change.quality,
    qualityLabel,
    uncertainty: change.uncertainty,
    uncertaintyLabel,
    confidence: change.confidence,
    confidenceLabel,
    sourceSegmentIds: change.sourceSegmentIds,
    sourceLabel,
    reason: change.reason,
    description,
  });
}

function noChangeTextOf(snapshot: LearningExplanationSnapshot): string | null {
  if (snapshot.status !== 'NO_CHANGE' && snapshot.status !== 'INSUFFICIENT_EVIDENCE') return null;
  const label = reasonLabelOf(snapshot),
    missing =
      snapshot.missingContexts.length === 0
        ? snapshot.noChangeReason === 'UNCHANGED_ESTIMATE'
          ? 'Nicio dovadă sau context nu lipsește; estimarea nu diferă de valoarea curentă.'
          : 'Nicio dovadă sau context nu lipsește.'
        : `Lipsesc dovezi sau contexte: ${snapshot.missingContexts.join('; ')}.`;
  return `${LEARNING_EXPLANATION_NO_CHANGE_TEXT}. Motiv: ${label ?? snapshot.noChangeReason ?? 'MOTIV_LIPSA'}. ${missing}`;
}

function failureTextOf(snapshot: LearningExplanationSnapshot): string | null {
  if (snapshot.status !== 'ERROR' && snapshot.status !== 'REJECTED') return null;
  const view = learningExplanationStatusView(snapshot.status),
    reason = snapshot.noChangeReason ?? 'REASON_MISSING';
  return `${view.title} (${reason})${snapshot.detail === null ? '' : `: ${snapshot.detail}`}. ${LEARNING_EXPLANATION_NO_VERSION_TEXT}.`;
}

/** Pure projection shared by the DOM adapter, the tests and the evidence report. */
export function projectLearningExplanation(
  snapshot: LearningExplanationSnapshot,
): LearningExplanationView {
  const rows = Object.freeze(
      [...snapshot.changes]
        .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
        .map(rowOf),
    ),
    missing = Object.freeze(
      snapshot.missingContexts.map((text, index) => Object.freeze({ index, text })),
    ),
    view = learningExplanationStatusView(snapshot.status),
    noChange = noChangeTextOf(snapshot),
    failure = failureTextOf(snapshot),
    counts: LearningExplanationCounts = Object.freeze({
      changes: rows.length,
      contexts: rows.reduce((total, row) => total + row.contexts.length, 0),
      missingContexts: missing.length,
      evidence: rows.reduce((total, row) => total + row.evidenceCount, 0),
    }),
    versionLabel = snapshot.versionId ?? LEARNING_EXPLANATION_NO_VERSION_TEXT,
    text = [
      `${view.title} · ${bindingText(snapshot)}`,
      `profil ${snapshot.profileId} · epoca ${snapshot.learningEpoch} · mod ${snapshot.mode} · ordine ${snapshot.order}`,
      `versiune: ${versionLabel}`,
      ...rows.map((row) => row.description),
      ...(noChange === null ? [] : [noChange]),
      ...(failure === null ? [] : [failure]),
      ...(missing.length === 0 ? [] : [`Lipsesc: ${missing.map((row) => row.text).join('; ')}`]),
    ].join('\n');
  return Object.freeze({
    version: LEARNING_EXPLANATION_VERSION,
    status: snapshot.status,
    symbol: view.symbol,
    title: view.title,
    success: view.success,
    published: false,
    noVersion: view.noVersion,
    sessionId: snapshot.sessionId,
    worldEpoch: snapshot.worldEpoch,
    tick: snapshot.tick,
    segmentId: snapshot.segmentId,
    jobKey: snapshot.jobKey,
    generationKey: snapshot.generationKey,
    profileId: snapshot.profileId,
    learningEpoch: snapshot.learningEpoch,
    mode: snapshot.mode,
    order: snapshot.order,
    versionId: snapshot.versionId,
    versionLabel,
    rows,
    missing,
    noChange,
    failure,
    text,
    counts,
    summary: snapshot.summary,
    signature: snapshot.signature,
  });
}
