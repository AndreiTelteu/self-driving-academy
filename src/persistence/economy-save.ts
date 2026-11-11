import {
  KPI_LIMITS,
  KPI_VERSION,
  LEDGER_LIMITS,
  LEDGER_VERSION,
  REVIEW_LIMITS,
  REVIEW_MODEL_VERSION,
  ledgerEntryCauses,
  ledgerEntryKinds,
  parseEconomyClock,
  reviewReasonCodes,
  tariffOutcomeStates,
} from '../economy';
import type {
  FleetKpiBucket,
  FleetKpiSnapshot,
  LedgerEntry,
  LedgerSnapshot,
  LedgerTotals,
  ReviewSnapshot,
  RideReview,
  RideSettlement,
} from '../economy';
import { DAILY_PROGRESS_VERSION } from '../missions';
import type { DailyProgressSnapshot, PlayerProgressCheckpoint } from '../missions';
import { parsePlayerProgress, restoreDailyProgress } from '../missions';
import {
  CANONICALIZATION_VERSION,
  CHECKSUM_ALGORITHM,
  canonicalizeJson,
  parseStrictJson,
  sha256Hex,
} from './canonical-json';
import { PERSISTENCE_LIMITS, PersistenceError, boundedText } from './contracts';
import type { TransactionPort } from './ports';
import type { ProfileTransactionHooks } from './profile-transaction';
import { measureJsonBytes } from './records';
import type { SessionArchiveTransactionRunner } from './session-archive-import';

/**
 * Economy, daily and XP bundle for PBI 215.
 *
 * The 209 commercial ledger, the 209 reviews, the 209 KPI buckets, the 211/212 daily calendar and the
 * 213 XP ledger are five read models owned by other modules. This module does not recompute any of
 * them: it stores the documents exactly as their owners produced them, validates that each one is
 * the document its own contract accepts, measures its size and refuses a component over its budget
 * instead of truncating it.
 *
 * Two rules make the round trip honest:
 *
 * 1. **The owning parser is the oracle.** A daily snapshot must survive `restoreDailyProgress` and
 *    re-snapshot to the same canonical bytes; an XP checkpoint must survive `parsePlayerProgress` and
 *    re-checkpoint to the same canonical bytes. A component that its owner would refuse is refused
 *    here, so a reload cannot invent progress.
 * 2. **Business values are never re-derived.** The 209 module has no restore entry point, so the
 *    ledger/review/KPI bundle is verified with a bounded structural contract: closed versions,
 *    `historyScans: 0`, well-formed settlements and entries, internal bucket arithmetic and the
 *    "retained evidence cannot exceed the totals" invariant. Fares and ratings stay exactly the
 *    bytes their owner wrote; this module never quotes, settles, reviews or credits anything.
 *
 * Durability uses one bounded 127 `meta` row per session (`economy:<sessionId>`), so a restart reads
 * the bundle back with the existing database and the 136 pre-migration export carries it unchanged.
 * The row is replaced, never merged, and no reward operation is ever called on write.
 */

/** Contract id of this layer. */
export const ECONOMY_SAVE_VERSION = '215-economy-save-v1' as const;

/** Format marker of the stored document. */
export const ECONOMY_SAVE_FORMAT = 'self-driving-academy-economy-save' as const;
export const ECONOMY_SAVE_FORMAT_VERSION = 1 as const;
export const ECONOMY_SAVE_SCHEMA_VERSION = 1 as const;

/** Row identity prefix inside the 127 `meta` store; the session id follows it. */
export const ECONOMY_SAVE_ROW_PREFIX = 'economy:' as const;

/** Row kind marker of the stored envelope (`meta` rows are a generic key/value store). */
export const ECONOMY_SAVE_ROW_KIND = 'ECONOMY_SAVE' as const;

/**
 * Fixed budgets.
 *
 * They are derived from the 127 record manifest (`PERSISTENCE_LIMITS`): one bundle is one stored row,
 * so the whole document is bounded by `maxRecordBytes` and each component is bounded by the 127 body
 * budget (`maxBodyBytes`) or by half a record. A component over its budget is an explicit
 * `COMPONENT_TOO_LARGE`, never a truncation.
 */
export const ECONOMY_SAVE_LIMITS = Object.freeze({
  /** Canonical UTF-16 code units of the whole bundle document. */
  maxDocumentBytes: PERSISTENCE_LIMITS.maxRecordBytes,
  /** Canonical UTF-8 bytes of the stored `meta` row envelope. */
  maxRowBytes: PERSISTENCE_LIMITS.maxRecordBytes,
  /** Nesting depth accepted by the reader. */
  maxDepth: 32,
  /** Per-component canonical UTF-8 budgets. */
  componentBytes: Object.freeze({
    daily: PERSISTENCE_LIMITS.maxBodyBytes,
    economy: PERSISTENCE_LIMITS.maxRecordBytes / 2,
    player: PERSISTENCE_LIMITS.maxBodyBytes,
  }),
});

/** Closed refusal vocabulary; there is no open error channel. */
export const economySaveCodes = [
  'UNSUPPORTED_FORMAT',
  'UNSUPPORTED_FORMAT_VERSION',
  'FORMAT_VERSION_TOO_NEW',
  'UNSUPPORTED_SCHEMA',
  'SCHEMA_TOO_NEW',
  'INVALID_FIELD',
  'UNKNOWN_FIELD',
  'MISSING_FIELD',
  'INVALID_IDENTITY',
  'INVALID_TIMESTAMP',
  'INVALID_NUMBER',
  'INVALID_COUNTER',
  'PARSE_ERROR',
  'DUPLICATE_KEY',
  'TRAILING_CONTENT',
  'FILE_TOO_LARGE',
  'DEPTH_EXCEEDED',
  'CANONICALIZATION_FAILED',
  'CHECKSUM_MISMATCH',
  'UNSUPPORTED_ALGORITHM',
  'UNSUPPORTED_CANONICALIZATION',
  'SIZE_MISMATCH',
  'COMPONENT_TOO_LARGE',
  'ECONOMY_EMPTY',
  'DAILY_INVALID',
  'ECONOMY_INVALID',
  'PLAYER_INVALID',
  'SESSION_MISMATCH',
  'PLAYER_MISMATCH',
  'WORLD_EPOCH_MISMATCH',
  'ROW_INVALID',
  'ROW_TOO_LARGE',
  'ROW_MISMATCH',
  'ROW_MISSING',
] as const;
export type EconomySaveCode = (typeof economySaveCodes)[number];

export interface EconomySaveRejection {
  readonly code: EconomySaveCode;
  readonly message: string;
  readonly path: string;
}

export class EconomySaveError extends Error {
  readonly code: EconomySaveCode;
  readonly path: string;

  constructor(code: EconomySaveCode, message: string, path: string) {
    super(message);
    this.name = 'EconomySaveError';
    this.code = code;
    this.path = path;
  }
}

function fail(code: EconomySaveCode, message: string, path: string): never {
  throw new EconomySaveError(code, message, path);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_FIELD', 'Expected a plain object', path);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('INVALID_FIELD', 'Expected plain data, not a class instance', path);
  }
  return value as Record<string, unknown>;
}

/** Exact field set: a newer layout is refused instead of being read with today's rules. */
function exact(value: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  const data = object(value, path);
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) fail('UNKNOWN_FIELD', `Unknown field: ${key}`, `${path}.${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(data, key)) fail('MISSING_FIELD', `Missing field: ${key}`, `${path}.${key}`);
  }
  return data;
}

function identity(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 256 ||
    value.trim() !== value
  ) {
    fail('INVALID_IDENTITY', 'Expected a bounded identity', path);
  }
  return value;
}

function timestamp(value: unknown, path: string): string {
  if (typeof value !== 'string' || !TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) {
    fail('INVALID_TIMESTAMP', 'Expected a UTC ISO 8601 timestamp', path);
  }
  return value;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail('INVALID_COUNTER', 'Expected a nonnegative safe integer', path);
  }
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('INVALID_NUMBER', 'Expected a finite number', path);
  }
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail('INVALID_IDENTITY', 'Expected a bounded text', path);
  }
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail('INVALID_FIELD', 'Expected a boolean', path);
  return value;
}

function choice<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) {
    fail('INVALID_FIELD', `Unsupported value at ${path}`, path);
  }
  return value as T;
}

function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail('INVALID_FIELD', 'Expected a list', path);
  return value;
}

function canonicalText(value: unknown, path: string): string {
  const canonical = canonicalizeJson(value, { maxDepth: ECONOMY_SAVE_LIMITS.maxDepth });
  if (canonical.status === 'REJECTED') {
    fail(
      canonical.rejection.code === 'UNSAFE_KEY' ? 'UNKNOWN_FIELD' : 'CANONICALIZATION_FAILED',
      `The ${path} value is not canonical: ${canonical.rejection.message}`,
      path,
    );
  }
  return canonical.text;
}

/** Rounds exactly like the 209 KPI and review read models do. */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/* ------------------------------------------------------------------ the shape */

export interface EconomySaveSession {
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number;
}

/** The three 209 read models of one commercial session, carried verbatim. */
export interface EconomySaveBundle {
  readonly ledger: LedgerSnapshot;
  readonly reviews: ReviewSnapshot;
  readonly kpi: FleetKpiSnapshot;
}

/** Every component in its own slot; `null` means the component was never saved, not that it is empty. */
export interface EconomySaveComponents {
  readonly daily: DailyProgressSnapshot | null;
  readonly economy: EconomySaveBundle | null;
  readonly player: PlayerProgressCheckpoint | null;
}

export const economySaveComponents = ['daily', 'economy', 'player'] as const;
export type EconomySaveComponentName = (typeof economySaveComponents)[number];

export interface EconomySaveSizes {
  readonly daily: number;
  readonly economy: number;
  readonly player: number;
  readonly total: number;
  readonly limit: number;
}

export interface EconomySaveChecksum {
  readonly algorithm: typeof CHECKSUM_ALGORITHM;
  readonly canonicalization: typeof CANONICALIZATION_VERSION;
  readonly value: string;
}

export interface EconomySaveDocument {
  readonly format: typeof ECONOMY_SAVE_FORMAT;
  readonly formatVersion: typeof ECONOMY_SAVE_FORMAT_VERSION;
  readonly schemaVersion: typeof ECONOMY_SAVE_SCHEMA_VERSION;
  readonly units: 'SI';
  readonly createdAt: string;
  readonly session: EconomySaveSession;
  readonly components: EconomySaveComponents;
  readonly sizes: EconomySaveSizes;
  readonly checksum: EconomySaveChecksum;
}

/** What the bundle really carries, derived from the validated components. */
export interface EconomySaveCounts {
  readonly dailySets: number;
  readonly dailyRewards: number;
  readonly dailyCompleted: number;
  readonly settlements: number;
  readonly reviews: number;
  readonly kpiDays: number;
  readonly kpiMonths: number;
  readonly kpiRevenueMinorUnits: number;
  /** The 213 balance and level, derived from the stored entries only. */
  readonly xpBalance: number;
  readonly xpBalanceMicroXp: number;
  readonly level: number;
  readonly xpEntries: number;
  /** Structural: the 213 ledger never contains a debit, and the 209 bundle is read-only. */
  readonly debits: 0;
  readonly negativeCredits: false;
  readonly historyScans: 0;
}

export interface EconomySaveValidationAccepted {
  readonly version: typeof ECONOMY_SAVE_VERSION;
  readonly status: 'ACCEPTED';
  readonly document: EconomySaveDocument;
  readonly checksumVerified: true;
  readonly session: EconomySaveSession;
  readonly components: EconomySaveComponents;
  readonly sizes: EconomySaveSizes;
  readonly counts: EconomySaveCounts;
  readonly bytes: number;
  readonly rejection: null;
}

export interface EconomySaveValidationRejected {
  readonly version: typeof ECONOMY_SAVE_VERSION;
  readonly status: 'REJECTED';
  readonly document: null;
  readonly checksumVerified: false;
  readonly session: null;
  readonly components: null;
  readonly sizes: null;
  readonly counts: null;
  readonly bytes: 0;
  readonly rejection: EconomySaveRejection;
}

export type EconomySaveValidation = EconomySaveValidationAccepted | EconomySaveValidationRejected;

export interface EconomySaveExpectation {
  readonly sessionId: string;
  readonly playerId: string;
  /** The stored world epoch the caller expects; a different one is a closed refusal. */
  readonly worldEpoch?: number;
}

/* --------------------------------------------------------------- 209 bundle */

const totalsFields = [
  'currency',
  'pricingVersion',
  'quotedMinorUnits',
  'chargedMinorUnits',
  'refundedMinorUnits',
  'netRevenueMinorUnits',
  'settlements',
  'completedRides',
  'failedRides',
  'cancelledRides',
  'completedRevenueMinorUnits',
  'failedRevenueMinorUnits',
  'cancellationRevenueMinorUnits',
  'civilianOutcomesRejected',
] as const;

const settlementFields = [
  'settlementId',
  'rideId',
  'requestId',
  'taxiId',
  'terminalState',
  'passengerAboard',
  'tick',
  'currency',
  'pricingVersion',
  'policyVersion',
  'rule',
  'quotedMinorUnits',
  'chargedMinorUnits',
  'refundedMinorUnits',
  'netMinorUnits',
  'chargeEntryId',
  'refundEntryId',
] as const;

const entryFields = [
  'entryId',
  'rideId',
  'requestId',
  'taxiId',
  'kind',
  'cause',
  'amountMinorUnits',
  'currency',
  'pricingVersion',
  'policyVersion',
  'tick',
  'referencesEntryId',
] as const;

const reviewFields = [
  'reviewId',
  'rideId',
  'customerId',
  'rating',
  'reasonCodes',
  'tick',
  'reviewModelVersion',
  'exposureSeconds',
  'controlIntervals',
  'profileVersions',
  'preferenceAdjustment',
  'penalties',
  'evidence',
  'supersedesReviewId',
  'revision',
] as const;

const bucketFields = [
  'periodId',
  'granularity',
  'startTick',
  'endTick',
  'economyClockVersion',
  'currency',
  'quotedMinorUnits',
  'chargedMinorUnits',
  'refundedMinorUnits',
  'revenueMinorUnits',
  'completedRides',
  'failedRides',
  'cancelledRides',
  'terminalRides',
  'reviewCount',
  'ratingSum',
  'averageRating',
  'ratingHistogram',
  'exposureSeconds',
  'profileActivationMarkers',
  'completeness',
  'lastTick',
] as const;

function readTotals(value: unknown): LedgerTotals {
  const data = exact(value, totalsFields, 'components.economy.ledger.totals');
  const totals = {
    currency: text(data.currency, 'totals.currency'),
    pricingVersion: text(data.pricingVersion, 'totals.pricingVersion'),
    quotedMinorUnits: integer(data.quotedMinorUnits, 'totals.quotedMinorUnits'),
    chargedMinorUnits: integer(data.chargedMinorUnits, 'totals.chargedMinorUnits'),
    refundedMinorUnits: integer(data.refundedMinorUnits, 'totals.refundedMinorUnits'),
    netRevenueMinorUnits: integer(data.netRevenueMinorUnits, 'totals.netRevenueMinorUnits'),
    settlements: integer(data.settlements, 'totals.settlements'),
    completedRides: integer(data.completedRides, 'totals.completedRides'),
    failedRides: integer(data.failedRides, 'totals.failedRides'),
    cancelledRides: integer(data.cancelledRides, 'totals.cancelledRides'),
    completedRevenueMinorUnits: integer(
      data.completedRevenueMinorUnits,
      'totals.completedRevenueMinorUnits',
    ),
    failedRevenueMinorUnits: integer(
      data.failedRevenueMinorUnits,
      'totals.failedRevenueMinorUnits',
    ),
    cancellationRevenueMinorUnits: integer(
      data.cancellationRevenueMinorUnits,
      'totals.cancellationRevenueMinorUnits',
    ),
    civilianOutcomesRejected: integer(
      data.civilianOutcomesRejected,
      'totals.civilianOutcomesRejected',
    ),
  } satisfies LedgerTotals;
  if (totals.netRevenueMinorUnits !== totals.chargedMinorUnits - totals.refundedMinorUnits) {
    fail(
      'ECONOMY_INVALID',
      'The ledger revenue is not the charge minus the refund',
      'components.economy.ledger.totals.netRevenueMinorUnits',
    );
  }
  if (totals.settlements !== totals.completedRides + totals.failedRides + totals.cancelledRides) {
    fail(
      'ECONOMY_INVALID',
      'The ledger settlement total is not the sum of its terminal states',
      'components.economy.ledger.totals.settlements',
    );
  }
  return Object.freeze(totals);
}

function readSettlement(value: unknown, path: string): RideSettlement {
  const data = exact(value, settlementFields, path);
  const settlement = {
    settlementId: identity(data.settlementId, `${path}.settlementId`),
    rideId: identity(data.rideId, `${path}.rideId`),
    requestId: identity(data.requestId, `${path}.requestId`),
    taxiId: identity(data.taxiId, `${path}.taxiId`),
    terminalState: choice(data.terminalState, tariffOutcomeStates, `${path}.terminalState`),
    passengerAboard: boolean(data.passengerAboard, `${path}.passengerAboard`),
    tick: integer(data.tick, `${path}.tick`),
    currency: text(data.currency, `${path}.currency`),
    pricingVersion: text(data.pricingVersion, `${path}.pricingVersion`),
    policyVersion: text(data.policyVersion, `${path}.policyVersion`),
    rule: text(data.rule, `${path}.rule`),
    quotedMinorUnits: integer(data.quotedMinorUnits, `${path}.quotedMinorUnits`),
    chargedMinorUnits: integer(data.chargedMinorUnits, `${path}.chargedMinorUnits`),
    refundedMinorUnits: integer(data.refundedMinorUnits, `${path}.refundedMinorUnits`),
    netMinorUnits: integer(data.netMinorUnits, `${path}.netMinorUnits`),
    chargeEntryId: identity(data.chargeEntryId, `${path}.chargeEntryId`),
    refundEntryId:
      data.refundEntryId === null ? null : identity(data.refundEntryId, `${path}.refundEntryId`),
  } satisfies RideSettlement;
  if (settlement.netMinorUnits !== settlement.chargedMinorUnits - settlement.refundedMinorUnits) {
    fail('ECONOMY_INVALID', 'A settlement is not its charge minus its refund', path);
  }
  if (settlement.refundedMinorUnits > 0 && settlement.refundEntryId === null) {
    fail('ECONOMY_INVALID', 'A refunded settlement must name its refund entry', path);
  }
  return Object.freeze(settlement);
}

function readEntry(value: unknown, path: string): LedgerEntry {
  const data = exact(value, entryFields, path);
  const entry = {
    entryId: identity(data.entryId, `${path}.entryId`),
    rideId: identity(data.rideId, `${path}.rideId`),
    requestId: identity(data.requestId, `${path}.requestId`),
    taxiId: identity(data.taxiId, `${path}.taxiId`),
    kind: choice(data.kind, ledgerEntryKinds, `${path}.kind`),
    cause: choice(data.cause, ledgerEntryCauses, `${path}.cause`),
    amountMinorUnits: integer(data.amountMinorUnits, `${path}.amountMinorUnits`),
    currency: text(data.currency, `${path}.currency`),
    pricingVersion: text(data.pricingVersion, `${path}.pricingVersion`),
    policyVersion: text(data.policyVersion, `${path}.policyVersion`),
    tick: integer(data.tick, `${path}.tick`),
    referencesEntryId:
      data.referencesEntryId === null
        ? null
        : identity(data.referencesEntryId, `${path}.referencesEntryId`),
  } satisfies LedgerEntry;
  if (entry.kind === 'REFUND' && entry.referencesEntryId === null) {
    fail('ECONOMY_INVALID', 'A refund entry must reference the charge it returns', path);
  }
  if (entry.kind === 'CHARGE' && entry.referencesEntryId !== null) {
    fail('ECONOMY_INVALID', 'A charge entry cannot reference another entry', path);
  }
  return Object.freeze(entry);
}

function readLedger(value: unknown): LedgerSnapshot {
  const data = exact(
    value,
    ['version', 'tick', 'totals', 'settlements', 'entries', 'historyScans'],
    'components.economy.ledger',
  );
  const version = text(data.version, 'components.economy.ledger.version');
  if (version !== LEDGER_VERSION) {
    fail(
      'ECONOMY_INVALID',
      `Unsupported ledger version ${version}; this build reads ${LEDGER_VERSION}`,
      'components.economy.ledger.version',
    );
  }
  if (data.historyScans !== 0) {
    fail(
      'ECONOMY_INVALID',
      'The ledger snapshot must report historyScans: 0',
      'components.economy.ledger.historyScans',
    );
  }
  const totals = readTotals(data.totals);
  const rawSettlements = list(data.settlements, 'components.economy.ledger.settlements');
  if (rawSettlements.length > LEDGER_LIMITS.retainedSettlements) {
    fail(
      'ECONOMY_INVALID',
      `The ledger carries ${rawSettlements.length} settlements, above the ${LEDGER_LIMITS.retainedSettlements} capacity`,
      'components.economy.ledger.settlements',
    );
  }
  const settlements = rawSettlements.map((entry, index) =>
    readSettlement(entry, `components.economy.ledger.settlements[${index}]`),
  );
  const rawEntries = list(data.entries, 'components.economy.ledger.entries');
  const entries = rawEntries.map((entry, index) =>
    readEntry(entry, `components.economy.ledger.entries[${index}]`),
  );
  const settlementIds = new Set<string>();
  const rideIds = new Set<string>();
  let charged = 0;
  let refunded = 0;
  let completed = 0;
  let failed = 0;
  let cancelled = 0;
  for (const settlement of settlements) {
    if (settlementIds.has(settlement.settlementId) || rideIds.has(settlement.rideId)) {
      fail(
        'ECONOMY_INVALID',
        `The ledger repeats settlement ${settlement.settlementId}`,
        'components.economy.ledger.settlements',
      );
    }
    settlementIds.add(settlement.settlementId);
    rideIds.add(settlement.rideId);
    charged += settlement.chargedMinorUnits;
    refunded += settlement.refundedMinorUnits;
    if (settlement.terminalState === 'COMPLETED') completed += 1;
    else if (settlement.terminalState === 'FAILED') failed += 1;
    else cancelled += 1;
  }
  const entryIds = new Set<string>();
  for (const entry of entries) {
    if (entryIds.has(entry.entryId)) {
      fail(
        'ECONOMY_INVALID',
        `The ledger repeats entry ${entry.entryId}`,
        'components.economy.ledger.entries',
      );
    }
    entryIds.add(entry.entryId);
  }
  for (const settlement of settlements) {
    if (!entryIds.has(settlement.chargeEntryId)) {
      fail(
        'ECONOMY_INVALID',
        `The settlement ${settlement.settlementId} names a missing charge entry`,
        'components.economy.ledger.settlements',
      );
    }
    if (settlement.refundEntryId !== null && !entryIds.has(settlement.refundEntryId)) {
      fail(
        'ECONOMY_INVALID',
        `The settlement ${settlement.settlementId} names a missing refund entry`,
        'components.economy.ledger.settlements',
      );
    }
  }
  // The retained evidence can never be richer than the totals that survived FIFO eviction.
  if (
    charged > totals.chargedMinorUnits ||
    refunded > totals.refundedMinorUnits ||
    settlements.length > totals.settlements ||
    completed > totals.completedRides ||
    failed > totals.failedRides ||
    cancelled > totals.cancelledRides
  ) {
    fail(
      'ECONOMY_INVALID',
      'The retained settlements are richer than the ledger totals they belong to',
      'components.economy.ledger.totals',
    );
  }
  return Object.freeze({
    version: LEDGER_VERSION,
    tick: integer(data.tick, 'components.economy.ledger.tick'),
    totals,
    settlements: Object.freeze(settlements),
    entries: Object.freeze(entries),
    historyScans: 0 as const,
  });
}

function readReview(value: unknown, path: string): RideReview {
  const data = exact(value, reviewFields, path);
  const rating = integer(data.rating, `${path}.rating`);
  if (rating > 5) fail('ECONOMY_INVALID', 'A rating is outside 0..5', `${path}.rating`);
  const reasonCodes = list(data.reasonCodes, `${path}.reasonCodes`).map((code, index) =>
    choice(code, reviewReasonCodes, `${path}.reasonCodes[${index}]`),
  );
  const evidence = object(data.evidence, `${path}.evidence`);
  const penalties = object(data.penalties, `${path}.penalties`);
  for (const key of ['delay', 'comfort', 'incident', 'failure'] as const) {
    finite(penalties[key], `${path}.penalties.${key}`);
  }
  for (const key of [
    'terminalState',
    'passengerAboard',
    'delaySeconds',
    'referenceTripDurationSeconds',
    'actualTripDurationSeconds',
    'comfortModelVersion',
    'comfortPenalty',
    'impacts',
    'peakImpulseNs',
    'blockedSeconds',
  ] as const) {
    if (!Object.hasOwn(evidence, key)) {
      fail('MISSING_FIELD', `Missing review evidence field: ${key}`, `${path}.evidence.${key}`);
    }
  }
  choice(evidence.terminalState, tariffOutcomeStates, `${path}.evidence.terminalState`);
  return Object.freeze({
    reviewId: identity(data.reviewId, `${path}.reviewId`),
    rideId: identity(data.rideId, `${path}.rideId`),
    customerId: identity(data.customerId, `${path}.customerId`),
    rating,
    reasonCodes: Object.freeze(reasonCodes) as RideReview['reasonCodes'],
    tick: integer(data.tick, `${path}.tick`),
    reviewModelVersion: text(data.reviewModelVersion, `${path}.reviewModelVersion`),
    exposureSeconds: finite(data.exposureSeconds, `${path}.exposureSeconds`),
    controlIntervals: integer(data.controlIntervals, `${path}.controlIntervals`),
    profileVersions: Object.freeze(
      list(data.profileVersions, `${path}.profileVersions`).map((entry, index) =>
        text(entry, `${path}.profileVersions[${index}]`),
      ),
    ),
    preferenceAdjustment: finite(data.preferenceAdjustment, `${path}.preferenceAdjustment`),
    penalties: Object.freeze({
      delay: finite(penalties.delay, `${path}.penalties.delay`),
      comfort: finite(penalties.comfort, `${path}.penalties.comfort`),
      incident: finite(penalties.incident, `${path}.penalties.incident`),
      failure: finite(penalties.failure, `${path}.penalties.failure`),
    }),
    evidence: Object.freeze({
      terminalState: evidence.terminalState,
      passengerAboard: boolean(evidence.passengerAboard, `${path}.evidence.passengerAboard`),
      delaySeconds:
        evidence.delaySeconds === null
          ? null
          : finite(evidence.delaySeconds, `${path}.evidence.delaySeconds`),
      referenceTripDurationSeconds: finite(
        evidence.referenceTripDurationSeconds,
        `${path}.evidence.referenceTripDurationSeconds`,
      ),
      actualTripDurationSeconds:
        evidence.actualTripDurationSeconds === null
          ? null
          : finite(
              evidence.actualTripDurationSeconds,
              `${path}.evidence.actualTripDurationSeconds`,
            ),
      comfortModelVersion:
        evidence.comfortModelVersion === null
          ? null
          : text(evidence.comfortModelVersion, `${path}.evidence.comfortModelVersion`),
      comfortPenalty:
        evidence.comfortPenalty === null
          ? null
          : finite(evidence.comfortPenalty, `${path}.evidence.comfortPenalty`),
      impacts: integer(evidence.impacts, `${path}.evidence.impacts`),
      peakImpulseNs: finite(evidence.peakImpulseNs, `${path}.evidence.peakImpulseNs`),
      blockedSeconds: finite(evidence.blockedSeconds, `${path}.evidence.blockedSeconds`),
    }) as RideReview['evidence'],
    supersedesReviewId:
      data.supersedesReviewId === null
        ? null
        : identity(data.supersedesReviewId, `${path}.supersedesReviewId`),
    revision: integer(data.revision, `${path}.revision`),
  }) as RideReview;
}

function readReviews(value: unknown): ReviewSnapshot {
  const data = exact(
    value,
    [
      'version',
      'tick',
      'reviews',
      'reviewCount',
      'ratingSum',
      'averageRating',
      'ratingHistogram',
      'reissuedReviews',
      'historyScans',
    ],
    'components.economy.reviews',
  );
  const version = text(data.version, 'components.economy.reviews.version');
  if (version !== REVIEW_MODEL_VERSION) {
    fail(
      'ECONOMY_INVALID',
      `Unsupported review model ${version}; this build reads ${REVIEW_MODEL_VERSION}`,
      'components.economy.reviews.version',
    );
  }
  if (data.historyScans !== 0) {
    fail(
      'ECONOMY_INVALID',
      'The review snapshot must report historyScans: 0',
      'components.economy.reviews.historyScans',
    );
  }
  const raw = list(data.reviews, 'components.economy.reviews.reviews');
  if (raw.length > REVIEW_LIMITS.retainedReviews) {
    fail(
      'ECONOMY_INVALID',
      `The review snapshot carries ${raw.length} reviews, above the ${REVIEW_LIMITS.retainedReviews} capacity`,
      'components.economy.reviews.reviews',
    );
  }
  const reviews = raw.map((entry, index) =>
    readReview(entry, `components.economy.reviews.reviews[${index}]`),
  );
  const seen = new Set<string>();
  let ratingSum = 0;
  for (const review of reviews) {
    if (seen.has(review.rideId)) {
      fail(
        'ECONOMY_INVALID',
        `The review snapshot repeats ride ${review.rideId}`,
        'components.economy.reviews.reviews',
      );
    }
    seen.add(review.rideId);
    ratingSum += review.rating;
  }
  const reviewCount = integer(data.reviewCount, 'components.economy.reviews.reviewCount');
  const declaredRatingSum = integer(data.ratingSum, 'components.economy.reviews.ratingSum');
  if (reviews.length > reviewCount || ratingSum > declaredRatingSum) {
    fail(
      'ECONOMY_INVALID',
      'The retained reviews are richer than the review totals they belong to',
      'components.economy.reviews',
    );
  }
  const histogram = list(data.ratingHistogram, 'components.economy.reviews.ratingHistogram').map(
    (count, index) => integer(count, `components.economy.reviews.ratingHistogram[${index}]`),
  );
  if (histogram.length !== 6) {
    fail(
      'ECONOMY_INVALID',
      'The rating histogram must have six buckets',
      'components.economy.reviews.ratingHistogram',
    );
  }
  const histogramTotal = histogram.reduce((total, count) => total + count, 0);
  if (histogramTotal !== reviewCount) {
    fail(
      'ECONOMY_INVALID',
      `The histogram sums ${histogramTotal} reviews, not ${reviewCount}`,
      'components.economy.reviews.ratingHistogram',
    );
  }
  if (histogram.reduce((total, count, rating) => total + count * rating, 0) !== declaredRatingSum) {
    fail(
      'ECONOMY_INVALID',
      'The histogram does not describe the rating sum',
      'components.economy.reviews.ratingSum',
    );
  }
  const average =
    data.averageRating === null
      ? null
      : finite(data.averageRating, 'components.economy.reviews.averageRating');
  const expected = reviewCount === 0 ? null : round6(declaredRatingSum / reviewCount);
  if (average !== expected) {
    fail(
      'ECONOMY_INVALID',
      `The average rating ${String(average)} is not ${String(expected)}`,
      'components.economy.reviews.averageRating',
    );
  }
  return Object.freeze({
    version: REVIEW_MODEL_VERSION,
    tick: integer(data.tick, 'components.economy.reviews.tick'),
    reviews: Object.freeze(reviews),
    reviewCount,
    ratingSum: declaredRatingSum,
    averageRating: average,
    ratingHistogram: Object.freeze(histogram),
    reissuedReviews: integer(data.reissuedReviews, 'components.economy.reviews.reissuedReviews'),
    historyScans: 0 as const,
  });
}

function readBucket(value: unknown, path: string): FleetKpiBucket {
  const data = exact(value, bucketFields, path);
  const histogram = list(data.ratingHistogram, `${path}.ratingHistogram`).map((count, index) =>
    integer(count, `${path}.ratingHistogram[${index}]`),
  );
  if (histogram.length !== 6) {
    fail('ECONOMY_INVALID', 'A KPI histogram must have six buckets', `${path}.ratingHistogram`);
  }
  const reviewCount = integer(data.reviewCount, `${path}.reviewCount`);
  const ratingSum = integer(data.ratingSum, `${path}.ratingSum`);
  const histogramTotal = histogram.reduce((total, count) => total + count, 0);
  if (histogramTotal !== reviewCount) {
    fail('ECONOMY_INVALID', 'A KPI histogram does not sum to its review count', path);
  }
  if (histogram.reduce((total, count, rating) => total + count * rating, 0) !== ratingSum) {
    fail('ECONOMY_INVALID', 'A KPI histogram does not describe its rating sum', path);
  }
  const average =
    data.averageRating === null ? null : finite(data.averageRating, `${path}.averageRating`);
  const expected = reviewCount === 0 ? null : round6(ratingSum / reviewCount);
  if (average !== expected) {
    fail('ECONOMY_INVALID', `A KPI average rating is not ${String(expected)}`, path);
  }
  const completedRides = integer(data.completedRides, `${path}.completedRides`);
  const failedRides = integer(data.failedRides, `${path}.failedRides`);
  const cancelledRides = integer(data.cancelledRides, `${path}.cancelledRides`);
  const terminalRides = integer(data.terminalRides, `${path}.terminalRides`);
  if (terminalRides !== completedRides + failedRides + cancelledRides) {
    fail('ECONOMY_INVALID', 'A KPI bucket terminal count is inconsistent', path);
  }
  const charged = integer(data.chargedMinorUnits, `${path}.chargedMinorUnits`);
  const refunded = integer(data.refundedMinorUnits, `${path}.refundedMinorUnits`);
  const revenue = integer(data.revenueMinorUnits, `${path}.revenueMinorUnits`);
  if (revenue !== charged - refunded) {
    fail('ECONOMY_INVALID', 'A KPI bucket revenue is not charge minus refund', path);
  }
  return Object.freeze({
    periodId: text(data.periodId, `${path}.periodId`),
    granularity: choice(data.granularity, ['DAY', 'MONTH'], `${path}.granularity`) as
      'DAY' | 'MONTH',
    startTick: integer(data.startTick, `${path}.startTick`),
    endTick: integer(data.endTick, `${path}.endTick`),
    economyClockVersion: text(data.economyClockVersion, `${path}.economyClockVersion`),
    currency: text(data.currency, `${path}.currency`),
    quotedMinorUnits: integer(data.quotedMinorUnits, `${path}.quotedMinorUnits`),
    chargedMinorUnits: charged,
    refundedMinorUnits: refunded,
    revenueMinorUnits: revenue,
    completedRides,
    failedRides,
    cancelledRides,
    terminalRides,
    reviewCount,
    ratingSum,
    averageRating: average,
    ratingHistogram: Object.freeze(histogram),
    exposureSeconds: finite(data.exposureSeconds, `${path}.exposureSeconds`),
    profileActivationMarkers: Object.freeze(
      list(data.profileActivationMarkers, `${path}.profileActivationMarkers`).map((marker, index) =>
        text(marker, `${path}.profileActivationMarkers[${index}]`),
      ),
    ),
    completeness: choice(data.completeness, ['COMPLETE', 'PARTIAL'], `${path}.completeness`) as
      'COMPLETE' | 'PARTIAL',
    lastTick: data.lastTick === null ? null : integer(data.lastTick, `${path}.lastTick`),
  });
}

function readKpi(value: unknown): FleetKpiSnapshot {
  const data = exact(
    value,
    [
      'version',
      'tick',
      'clock',
      'days',
      'months',
      'currentDay',
      'currentMonth',
      'completedMonths',
      'projection',
      'historyScans',
    ],
    'components.economy.kpi',
  );
  const version = text(data.version, 'components.economy.kpi.version');
  if (version !== KPI_VERSION) {
    fail(
      'ECONOMY_INVALID',
      `Unsupported KPI version ${version}; this build reads ${KPI_VERSION}`,
      'components.economy.kpi.version',
    );
  }
  if (data.historyScans !== 0) {
    fail(
      'ECONOMY_INVALID',
      'The KPI snapshot must report historyScans: 0',
      'components.economy.kpi.historyScans',
    );
  }
  const clock = parseEconomyClock(data.clock);
  const rawDays = list(data.days, 'components.economy.kpi.days');
  const rawMonths = list(data.months, 'components.economy.kpi.months');
  if (rawDays.length > KPI_LIMITS.retainedDays || rawMonths.length > KPI_LIMITS.retainedMonths) {
    fail(
      'ECONOMY_INVALID',
      'The KPI snapshot is above the 209 retention capacity',
      'components.economy.kpi',
    );
  }
  const days = rawDays.map((bucket, index) =>
    readBucket(bucket, `components.economy.kpi.days[${index}]`),
  );
  const months = rawMonths.map((bucket, index) =>
    readBucket(bucket, `components.economy.kpi.months[${index}]`),
  );
  const dayIds = new Set(days.map((bucket) => bucket.periodId));
  const monthIds = new Set(months.map((bucket) => bucket.periodId));
  if (dayIds.size !== days.length || monthIds.size !== months.length) {
    fail('ECONOMY_INVALID', 'The KPI snapshot repeats a period', 'components.economy.kpi');
  }
  for (const bucket of days) {
    if (bucket.granularity !== 'DAY') {
      fail('ECONOMY_INVALID', 'A day bucket is not a DAY bucket', 'components.economy.kpi.days');
    }
  }
  for (const bucket of months) {
    if (bucket.granularity !== 'MONTH') {
      fail(
        'ECONOMY_INVALID',
        'A month bucket is not a MONTH bucket',
        'components.economy.kpi.months',
      );
    }
  }
  const readCurrent = (current: unknown, ids: ReadonlySet<string>, path: string) => {
    if (current === null) return null;
    const bucket = readBucket(current, path);
    if (!ids.has(bucket.periodId)) {
      fail('ECONOMY_INVALID', 'The current KPI bucket is not a retained period', path);
    }
    return bucket;
  };
  const currentDay = readCurrent(data.currentDay, dayIds, 'components.economy.kpi.currentDay');
  const currentMonth = readCurrent(
    data.currentMonth,
    monthIds,
    'components.economy.kpi.currentMonth',
  );
  const completedMonths = integer(data.completedMonths, 'components.economy.kpi.completedMonths');
  if (completedMonths > months.length) {
    fail(
      'ECONOMY_INVALID',
      'The completed month count is above the retained months',
      'components.economy.kpi.completedMonths',
    );
  }
  const projection = object(data.projection, 'components.economy.kpi.projection');
  if (projection.status === 'PROJECTED') {
    integer(projection.windowStartTick, 'kpi.projection.windowStartTick');
    integer(projection.windowEndTick, 'kpi.projection.windowEndTick');
    finite(projection.observedSeconds, 'kpi.projection.observedSeconds');
    integer(projection.terminalRides, 'kpi.projection.terminalRides');
    integer(projection.revenueMinorUnits, 'kpi.projection.revenueMinorUnits');
    finite(projection.monthSeconds, 'kpi.projection.monthSeconds');
    integer(projection.projectedRevenueMinorUnits, 'kpi.projection.projectedRevenueMinorUnits');
  } else if (projection.status === 'INSUFFICIENT_DATA') {
    choice(projection.reason, ['FEW_RIDES', 'SHORT_EXPOSURE', 'NO_MONTH'], 'kpi.projection.reason');
    integer(projection.terminalRides, 'kpi.projection.terminalRides');
    finite(projection.exposureSeconds, 'kpi.projection.exposureSeconds');
  } else {
    fail('ECONOMY_INVALID', 'Unsupported projection status', 'components.economy.kpi.projection');
  }
  return Object.freeze({
    version: KPI_VERSION,
    tick: integer(data.tick, 'components.economy.kpi.tick'),
    clock,
    days: Object.freeze(days),
    months: Object.freeze(months),
    currentDay,
    currentMonth,
    completedMonths,
    projection: Object.freeze({ ...projection }) as FleetKpiSnapshot['projection'],
    historyScans: 0 as const,
  });
}

function readEconomyBundle(value: unknown): EconomySaveBundle {
  const data = exact(value, ['ledger', 'reviews', 'kpi'], 'components.economy');
  const ledger = readLedger(data.ledger);
  const reviews = readReviews(data.reviews);
  const kpi = readKpi(data.kpi);
  for (const bucket of [...kpi.days, ...kpi.months]) {
    if (bucket.currency !== ledger.totals.currency) {
      fail(
        'ECONOMY_INVALID',
        `A KPI bucket uses ${bucket.currency} but the ledger uses ${ledger.totals.currency}`,
        'components.economy.kpi',
      );
    }
  }
  return Object.freeze({ ledger, reviews, kpi });
}

/* -------------------------------------------------------- daily and player */

function readDaily(value: unknown, session: EconomySaveSession): DailyProgressSnapshot {
  const header = object(value, 'components.daily');
  if (header.sessionId !== session.sessionId) {
    fail(
      'SESSION_MISMATCH',
      `The daily snapshot belongs to session ${String(header.sessionId)}, not ${session.sessionId}`,
      'components.daily.sessionId',
    );
  }
  if (header.playerId !== session.playerId) {
    fail(
      'PLAYER_MISMATCH',
      `The daily snapshot belongs to ${String(header.playerId)}, not ${session.playerId}`,
      'components.daily.playerId',
    );
  }
  if (header.worldEpoch !== session.worldEpoch) {
    fail(
      'WORLD_EPOCH_MISMATCH',
      `The daily snapshot is in world epoch ${String(header.worldEpoch)}, not ${session.worldEpoch}`,
      'components.daily.worldEpoch',
    );
  }
  let restored: ReturnType<typeof restoreDailyProgress>;
  try {
    restored = restoreDailyProgress(value, {
      sessionId: session.sessionId,
      worldEpoch: session.worldEpoch,
    });
  } catch (error) {
    fail(
      'DAILY_INVALID',
      `The daily snapshot cannot be restored: ${describe(error)}`,
      'components.daily',
    );
  }
  const snapshot = restored.progress.snapshot();
  if (snapshot.playerId !== session.playerId) {
    fail(
      'PLAYER_MISMATCH',
      `The daily snapshot belongs to ${snapshot.playerId}, not ${session.playerId}`,
      'components.daily.playerId',
    );
  }
  if (snapshot.sessionId !== session.sessionId || snapshot.worldEpoch !== session.worldEpoch) {
    fail(
      'SESSION_MISMATCH',
      'The daily snapshot belongs to another session or world epoch',
      'components.daily.sessionId',
    );
  }
  if (snapshot.version !== DAILY_PROGRESS_VERSION) {
    fail('DAILY_INVALID', 'Unsupported daily progress version', 'components.daily.version');
  }
  // The 212 restore is the oracle: the same document must come back out of it, byte for byte.
  if (canonicalText(snapshot, 'components.daily') !== canonicalText(value, 'components.daily')) {
    fail(
      'DAILY_INVALID',
      'The daily snapshot does not survive the 212 restore unchanged',
      'components.daily',
    );
  }
  return value as DailyProgressSnapshot;
}

function readPlayer(value: unknown, session: EconomySaveSession): PlayerProgressCheckpoint {
  let progress: ReturnType<typeof parsePlayerProgress>;
  try {
    progress = parsePlayerProgress(value);
  } catch (error) {
    fail(
      'PLAYER_INVALID',
      `The XP checkpoint is refused by 213: ${describe(error)}`,
      'components.player',
    );
  }
  if (progress.playerId !== session.playerId) {
    fail(
      'PLAYER_MISMATCH',
      `The XP ledger belongs to ${progress.playerId}, not ${session.playerId}`,
      'components.player.playerId',
    );
  }
  const read = progress.read();
  if (read.debits !== 0 || read.balanceIsSumOfEntries !== true) {
    fail(
      'PLAYER_INVALID',
      'The XP ledger reports a debit or a balance that is not the sum of its entries',
      'components.player.entries',
    );
  }
  const checkpoint = progress.checkpoint();
  if (
    canonicalText(checkpoint, 'components.player') !== canonicalText(value, 'components.player')
  ) {
    fail(
      'PLAYER_INVALID',
      'The XP checkpoint does not survive the 213 parser unchanged',
      'components.player',
    );
  }
  return value as PlayerProgressCheckpoint;
}

function readComponents(value: unknown, session: EconomySaveSession): EconomySaveComponents {
  const data = exact(value, economySaveComponents, 'components');
  return Object.freeze({
    daily: data.daily === null ? null : readDaily(data.daily, session),
    economy: data.economy === null ? null : readEconomyBundle(data.economy),
    player: data.player === null ? null : readPlayer(data.player, session),
  });
}

function countsOf(components: EconomySaveComponents): EconomySaveCounts {
  const daily = components.daily;
  const bundle = components.economy;
  const player = components.player === null ? null : parsePlayerProgress(components.player).read();
  return Object.freeze({
    dailySets: daily === null ? 0 : daily.calendar.sets.length,
    dailyRewards: daily === null ? 0 : daily.calendar.rewards.length,
    dailyCompleted:
      daily === null ? 0 : daily.rows.filter((row) => row.state === 'COMPLETED').length,
    settlements: bundle === null ? 0 : bundle.ledger.settlements.length,
    reviews: bundle === null ? 0 : bundle.reviews.reviews.length,
    kpiDays: bundle === null ? 0 : bundle.kpi.days.length,
    kpiMonths: bundle === null ? 0 : bundle.kpi.months.length,
    kpiRevenueMinorUnits:
      bundle === null
        ? 0
        : bundle.kpi.days.reduce((total, day) => total + day.revenueMinorUnits, 0),
    xpBalance: player === null ? 0 : player.xpBalance,
    xpBalanceMicroXp: player === null ? 0 : player.xpBalanceMicroXp,
    level: player === null ? 0 : player.level,
    xpEntries: player === null ? 0 : player.entries.length,
    debits: 0 as const,
    negativeCredits: false as const,
    historyScans: 0 as const,
  });
}

/* ---------------------------------------------------------------- size ledger */

function measured(value: unknown, path: string): number {
  try {
    return measureJsonBytes(value, path);
  } catch (error) {
    fail(
      'COMPONENT_TOO_LARGE',
      `The ${path} component cannot be measured within the 127 budget: ${describe(error)}`,
      path,
    );
  }
}

export function economySaveSizes(
  components: EconomySaveComponents,
  limit: number = ECONOMY_SAVE_LIMITS.maxDocumentBytes,
): EconomySaveSizes {
  const daily = measured(components.daily, 'daily');
  const economy = measured(components.economy, 'economy');
  const player = measured(components.player, 'player');
  return Object.freeze({ daily, economy, player, total: daily + economy + player, limit });
}

function enforceComponentBudgets(sizes: EconomySaveSizes): void {
  for (const name of economySaveComponents) {
    const budget = ECONOMY_SAVE_LIMITS.componentBytes[name];
    const size = sizes[name];
    if (size > budget) {
      fail(
        'COMPONENT_TOO_LARGE',
        `The ${name} component has ${size} bytes, above its ${budget} byte budget`,
        name,
      );
    }
  }
  if (sizes.total > sizes.limit || sizes.limit > ECONOMY_SAVE_LIMITS.maxDocumentBytes) {
    fail(
      'COMPONENT_TOO_LARGE',
      `The bundle declares ${sizes.total} bytes against a ${sizes.limit} byte limit`,
      'sizes.total',
    );
  }
}

/* ------------------------------------------------------------------ checksum */

function checksumPayload(document: Omit<EconomySaveDocument, 'checksum'>): unknown {
  return {
    format: document.format,
    formatVersion: document.formatVersion,
    schemaVersion: document.schemaVersion,
    units: document.units,
    createdAt: document.createdAt,
    session: document.session,
    components: document.components,
    sizes: document.sizes,
  };
}

export function computeEconomySaveChecksum(
  document: Omit<EconomySaveDocument, 'checksum'> | EconomySaveDocument,
): string {
  const payload = checksumPayload(document as Omit<EconomySaveDocument, 'checksum'>);
  return sha256Hex(canonicalText(payload, 'checksum'));
}

export function stampEconomySaveChecksum(
  document: Omit<EconomySaveDocument, 'checksum'> | EconomySaveDocument,
): EconomySaveDocument {
  const payload = document as Omit<EconomySaveDocument, 'checksum'>;
  return Object.freeze({
    ...payload,
    checksum: Object.freeze({
      algorithm: CHECKSUM_ALGORITHM,
      canonicalization: CANONICALIZATION_VERSION,
      value: computeEconomySaveChecksum(payload),
    }),
  });
}

/* ------------------------------------------------------------------- builder */

export interface EconomySaveBuildInput {
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number;
  /** Creation time of the document; the caller owns it so the build stays deterministic. */
  readonly createdAt: string;
  readonly daily?: unknown | null;
  readonly economy?: unknown | null;
  readonly player?: unknown | null;
}

export interface EconomySaveBuildAccepted {
  readonly version: typeof ECONOMY_SAVE_VERSION;
  readonly status: 'ACCEPTED';
  readonly document: EconomySaveDocument;
  readonly checksum: string;
  readonly sizes: EconomySaveSizes;
  readonly counts: EconomySaveCounts;
  readonly bytes: number;
  readonly rejection: null;
}

export interface EconomySaveBuildRejected {
  readonly version: typeof ECONOMY_SAVE_VERSION;
  readonly status: 'REJECTED';
  readonly document: null;
  readonly checksum: null;
  readonly sizes: null;
  readonly counts: null;
  readonly bytes: 0;
  readonly rejection: EconomySaveRejection;
}

export type EconomySaveBuildResult = EconomySaveBuildAccepted | EconomySaveBuildRejected;

function rejected(rejection: EconomySaveRejection): EconomySaveBuildRejected {
  return Object.freeze({
    version: ECONOMY_SAVE_VERSION,
    status: 'REJECTED' as const,
    document: null,
    checksum: null,
    sizes: null,
    counts: null,
    bytes: 0 as const,
    rejection: Object.freeze(rejection),
  });
}

function sessionOf(value: unknown): EconomySaveSession {
  const data = object(value, 'session');
  return Object.freeze({
    sessionId: identity(data.sessionId, 'session.sessionId'),
    playerId: identity(data.playerId, 'session.playerId'),
    worldEpoch: integer(data.worldEpoch, 'session.worldEpoch'),
  });
}

/** Builds a bundle from the documents the owning modules produced. Nothing is recomputed. */
export function buildEconomySave(input: EconomySaveBuildInput): EconomySaveBuildResult {
  try {
    const session = sessionOf(input);
    const createdAt = timestamp(input.createdAt, 'createdAt');
    const components = readComponents(
      {
        daily: input.daily === undefined ? null : input.daily,
        economy: input.economy === undefined ? null : input.economy,
        player: input.player === undefined ? null : input.player,
      },
      session,
    );
    if (components.daily === null && components.economy === null && components.player === null) {
      fail('ECONOMY_EMPTY', 'The bundle carries no component', 'components');
    }
    const sizes = economySaveSizes(components);
    enforceComponentBudgets(sizes);
    const payload = {
      format: ECONOMY_SAVE_FORMAT,
      formatVersion: ECONOMY_SAVE_FORMAT_VERSION,
      schemaVersion: ECONOMY_SAVE_SCHEMA_VERSION,
      units: 'SI' as const,
      createdAt,
      session,
      components,
      sizes,
    };
    const document = stampEconomySaveChecksum(payload);
    const canonical = canonicalText(document, '$');
    if (canonical.length > ECONOMY_SAVE_LIMITS.maxDocumentBytes) {
      fail(
        'FILE_TOO_LARGE',
        `The bundle has ${canonical.length} code units, above the ${ECONOMY_SAVE_LIMITS.maxDocumentBytes} budget`,
        '$',
      );
    }
    return Object.freeze({
      version: ECONOMY_SAVE_VERSION,
      status: 'ACCEPTED' as const,
      document,
      checksum: document.checksum.value,
      sizes,
      counts: countsOf(components),
      bytes: canonical.length,
      rejection: null,
    });
  } catch (error) {
    return rejected(rejectionOf(error));
  }
}

function rejectionOf(error: unknown): EconomySaveRejection {
  if (error instanceof EconomySaveError) {
    return Object.freeze({ code: error.code, message: error.message, path: error.path });
  }
  if (error instanceof PersistenceError) {
    return Object.freeze({
      code: 'INVALID_FIELD' as const,
      message: `${error.code}: ${error.message}`,
      path: error.path ?? '$',
    });
  }
  return Object.freeze({
    code: 'INVALID_FIELD' as const,
    message: describe(error),
    path: '$',
  });
}

/* -------------------------------------------------------------------- reader */

function strictRejection(value: {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}): EconomySaveRejection {
  const code: EconomySaveCode =
    value.code === 'FILE_TOO_LARGE'
      ? 'FILE_TOO_LARGE'
      : value.code === 'DEPTH_EXCEEDED'
        ? 'DEPTH_EXCEEDED'
        : value.code === 'DUPLICATE_KEY'
          ? 'DUPLICATE_KEY'
          : value.code === 'TRAILING_CONTENT'
            ? 'TRAILING_CONTENT'
            : 'PARSE_ERROR';
  return Object.freeze({ code, message: value.message, path: value.path });
}

const documentFields: readonly string[] = [
  'format',
  'formatVersion',
  'schemaVersion',
  'units',
  'createdAt',
  'session',
  'components',
  'sizes',
  'checksum',
];

const sizeFields = [...economySaveComponents, 'total', 'limit'] as const;

function readSizes(value: unknown): EconomySaveSizes {
  const data = exact(value, sizeFields, 'sizes');
  const sizes: Record<string, number> = Object.create(null);
  for (const field of sizeFields) sizes[field] = integer(data[field], `sizes.${field}`);
  const declared = sizes as unknown as EconomySaveSizes;
  if (declared.limit !== ECONOMY_SAVE_LIMITS.maxDocumentBytes) {
    fail(
      'SIZE_MISMATCH',
      `The bundle declares a ${declared.limit} byte limit; this build accepts ${ECONOMY_SAVE_LIMITS.maxDocumentBytes}`,
      'sizes.limit',
    );
  }
  return Object.freeze(declared);
}

/**
 * Reads and verifies a bundle.
 *
 * Order: strict parse, envelope and format versions, canonical size, checksum, declared sizes, then
 * the component parsers of their owners. A file written by a newer build is refused before its
 * checksum is interpreted, and a checksum mismatch is never followed by a "best effort" read.
 */
export function readEconomySave(
  input: unknown,
  expect: EconomySaveExpectation,
): EconomySaveValidation {
  try {
    if (
      typeof expect !== 'object' ||
      expect === null ||
      typeof expect.sessionId !== 'string' ||
      typeof expect.playerId !== 'string'
    ) {
      fail('INVALID_IDENTITY', 'Expected a target session and player', 'expect');
    }
    let value = input;
    if (typeof input === 'string') {
      if (input.length > ECONOMY_SAVE_LIMITS.maxDocumentBytes) {
        fail(
          'FILE_TOO_LARGE',
          `The bundle has ${input.length} code units, above the ${ECONOMY_SAVE_LIMITS.maxDocumentBytes} budget`,
          '$',
        );
      }
      const parsed = parseStrictJson(input, {
        maxBytes: ECONOMY_SAVE_LIMITS.maxDocumentBytes,
        maxDepth: ECONOMY_SAVE_LIMITS.maxDepth,
      });
      if (parsed.status === 'REJECTED') {
        const rejection = strictRejection(parsed.rejection);
        throw new EconomySaveError(rejection.code, rejection.message, rejection.path);
      }
      value = parsed.value;
    }
    const envelope = exact(value, documentFields, '$');
    if (envelope.format !== ECONOMY_SAVE_FORMAT) {
      fail('UNSUPPORTED_FORMAT', `Unsupported bundle format: ${String(envelope.format)}`, 'format');
    }
    const formatVersion = envelope.formatVersion;
    if (typeof formatVersion !== 'number' || !Number.isInteger(formatVersion)) {
      fail('UNSUPPORTED_FORMAT_VERSION', 'Expected an integer format version', 'formatVersion');
    }
    if (formatVersion > ECONOMY_SAVE_FORMAT_VERSION) {
      fail(
        'FORMAT_VERSION_TOO_NEW',
        `The bundle declares format version ${formatVersion}; this build reads ${ECONOMY_SAVE_FORMAT_VERSION}`,
        'formatVersion',
      );
    }
    if (formatVersion !== ECONOMY_SAVE_FORMAT_VERSION) {
      fail(
        'UNSUPPORTED_FORMAT_VERSION',
        `Unsupported bundle format version: ${formatVersion}`,
        'formatVersion',
      );
    }
    const schemaVersion = envelope.schemaVersion;
    if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
      fail('UNSUPPORTED_SCHEMA', 'Expected an integer schema version', 'schemaVersion');
    }
    if (schemaVersion > ECONOMY_SAVE_SCHEMA_VERSION) {
      fail(
        'SCHEMA_TOO_NEW',
        `The bundle declares schema version ${schemaVersion}; this build reads ${ECONOMY_SAVE_SCHEMA_VERSION}`,
        'schemaVersion',
      );
    }
    if (schemaVersion !== ECONOMY_SAVE_SCHEMA_VERSION) {
      fail('UNSUPPORTED_SCHEMA', `Unsupported bundle schema: ${schemaVersion}`, 'schemaVersion');
    }
    if (envelope.units !== 'SI') {
      fail('INVALID_FIELD', 'The bundle is stored in SI units only', 'units');
    }
    const canonical = canonicalText(value, '$');
    if (canonical.length > ECONOMY_SAVE_LIMITS.maxDocumentBytes) {
      fail(
        'FILE_TOO_LARGE',
        `The canonical bundle has ${canonical.length} code units, above the ${ECONOMY_SAVE_LIMITS.maxDocumentBytes} budget`,
        '$',
      );
    }
    const checksumData = exact(
      envelope.checksum,
      ['algorithm', 'canonicalization', 'value'],
      'checksum',
    );
    if (checksumData.algorithm !== CHECKSUM_ALGORITHM) {
      fail(
        'UNSUPPORTED_ALGORITHM',
        `Unsupported checksum algorithm: ${String(checksumData.algorithm)}`,
        'checksum.algorithm',
      );
    }
    if (checksumData.canonicalization !== CANONICALIZATION_VERSION) {
      fail(
        'UNSUPPORTED_CANONICALIZATION',
        `Unsupported canonicalization: ${String(checksumData.canonicalization)}`,
        'checksum.canonicalization',
      );
    }
    const declaredChecksum = checksumData.value;
    if (typeof declaredChecksum !== 'string' || !SHA256_HEX.test(declaredChecksum)) {
      fail('CHECKSUM_MISMATCH', 'Expected a lowercase SHA-256 checksum', 'checksum.value');
    }
    const createdAt = timestamp(envelope.createdAt, 'createdAt');
    const session = sessionOf(object(envelope.session, 'session'));
    if (session.sessionId !== expect.sessionId) {
      fail(
        'SESSION_MISMATCH',
        `The bundle belongs to session ${session.sessionId}, not ${expect.sessionId}`,
        'session.sessionId',
      );
    }
    if (session.playerId !== expect.playerId) {
      fail(
        'PLAYER_MISMATCH',
        `The bundle belongs to player ${session.playerId}, not ${expect.playerId}`,
        'session.playerId',
      );
    }
    if (expect.worldEpoch !== undefined && expect.worldEpoch !== session.worldEpoch) {
      fail(
        'WORLD_EPOCH_MISMATCH',
        `The bundle is in world epoch ${session.worldEpoch}, not ${expect.worldEpoch}`,
        'session.worldEpoch',
      );
    }
    const components = readComponents(envelope.components, session);
    const declaredSizes = readSizes(envelope.sizes);
    const payload: Omit<EconomySaveDocument, 'checksum'> = {
      format: ECONOMY_SAVE_FORMAT,
      formatVersion: ECONOMY_SAVE_FORMAT_VERSION,
      schemaVersion: ECONOMY_SAVE_SCHEMA_VERSION,
      units: 'SI',
      createdAt,
      session,
      components,
      sizes: declaredSizes,
    };
    if (computeEconomySaveChecksum(payload) !== declaredChecksum) {
      fail(
        'CHECKSUM_MISMATCH',
        'The bundle was modified or is corrupted; the economy was not loaded',
        'checksum.value',
      );
    }
    const measuredSizes = economySaveSizes(components, declaredSizes.limit);
    enforceComponentBudgets(measuredSizes);
    for (const field of sizeFields) {
      if (measuredSizes[field] !== declaredSizes[field]) {
        fail(
          'SIZE_MISMATCH',
          `The declared ${field} size is ${declaredSizes[field]}, measured ${measuredSizes[field]}`,
          `sizes.${field}`,
        );
      }
    }
    const document: EconomySaveDocument = Object.freeze({
      ...payload,
      checksum: Object.freeze({
        algorithm: CHECKSUM_ALGORITHM,
        canonicalization: CANONICALIZATION_VERSION,
        value: declaredChecksum,
      }),
    });
    return Object.freeze({
      version: ECONOMY_SAVE_VERSION,
      status: 'ACCEPTED' as const,
      document,
      checksumVerified: true as const,
      session,
      components,
      sizes: measuredSizes,
      counts: countsOf(components),
      bytes: typeof input === 'string' ? input.length : canonical.length,
      rejection: null,
    });
  } catch (error) {
    return Object.freeze({
      version: ECONOMY_SAVE_VERSION,
      status: 'REJECTED' as const,
      document: null,
      checksumVerified: false as const,
      session: null,
      components: null,
      sizes: null,
      counts: null,
      bytes: 0 as const,
      rejection: rejectionOf(error),
    });
  }
}

/* --------------------------------------------------------------- persisted row */

/** Stable row identity of one session's bundle inside the 127 `meta` store. */
export function economySaveKey(sessionId: string): string {
  return `${ECONOMY_SAVE_ROW_PREFIX}${boundedText(
    sessionId,
    'sessionId',
    PERSISTENCE_LIMITS.maxIdCodeUnits - ECONOMY_SAVE_ROW_PREFIX.length,
  )}`;
}

export interface EconomySaveRowValue {
  readonly kind: typeof ECONOMY_SAVE_ROW_KIND;
  readonly schemaVersion: typeof ECONOMY_SAVE_SCHEMA_VERSION;
  readonly revision: number;
  readonly updatedAt: string;
  readonly document: EconomySaveDocument;
}

export interface EconomySaveRow {
  readonly key: string;
  readonly value: EconomySaveRowValue;
}

/** The plain `{ key, value }` row the 127 `meta` store holds. */
export function economySaveRecord(
  document: EconomySaveDocument,
  revision: number,
  updatedAt: string,
): EconomySaveRow {
  return Object.freeze({
    key: economySaveKey(document.session.sessionId),
    value: Object.freeze({
      kind: ECONOMY_SAVE_ROW_KIND,
      schemaVersion: ECONOMY_SAVE_SCHEMA_VERSION,
      revision,
      updatedAt,
      document,
    }),
  });
}

export interface EconomySaveLoaded {
  readonly document: EconomySaveDocument;
  readonly revision: number;
  readonly updatedAt: string;
  readonly bytes: number;
  readonly counts: EconomySaveCounts;
}

function readRow(value: unknown, expect: EconomySaveExpectation): EconomySaveLoaded {
  const row = exact(value, ['key', 'value'], 'row');
  const key = identity(row.key, 'row.key');
  const data = exact(
    row.value,
    ['kind', 'schemaVersion', 'revision', 'updatedAt', 'document'],
    'row.value',
  );
  if (data.kind !== ECONOMY_SAVE_ROW_KIND) {
    fail('ROW_INVALID', `Unsupported row kind: ${String(data.kind)}`, 'row.value.kind');
  }
  if (data.schemaVersion !== ECONOMY_SAVE_SCHEMA_VERSION) {
    fail(
      'ROW_INVALID',
      `Unsupported row schema: ${String(data.schemaVersion)}`,
      'row.value.schemaVersion',
    );
  }
  const revision = integer(data.revision, 'row.value.revision');
  if (revision < 1) fail('ROW_INVALID', 'A stored row has revision >= 1', 'row.value.revision');
  const updatedAt = timestamp(data.updatedAt, 'row.value.updatedAt');
  const document = readEconomySave(data.document, expect);
  if (document.status === 'REJECTED') {
    throw new EconomySaveError(
      document.rejection.code,
      document.rejection.message,
      document.rejection.path,
    );
  }
  if (key !== economySaveKey(document.session.sessionId)) {
    fail('ROW_INVALID', 'The row key does not name its own session', 'row.key');
  }
  return Object.freeze({
    document: document.document,
    revision,
    updatedAt,
    bytes: measureJsonBytes(value, 'row'),
    counts: document.counts,
  });
}

/** Reads one stored row; an absent row is `EMPTY`, a corrupt one is a closed refusal. */
export function readEconomyRow(value: unknown, expect: EconomySaveExpectation): EconomySaveLoaded {
  return readRow(value, expect);
}

export interface EconomySaveCommit {
  readonly version: typeof ECONOMY_SAVE_VERSION;
  readonly key: string;
  readonly revision: number;
  readonly bytes: number;
  readonly checksum: string;
  readonly sizes: EconomySaveSizes;
  readonly counts: EconomySaveCounts;
  /** Structural: a write replaces the stored rows; it never settles, credits or merges. */
  readonly rewardsGranted: 0;
  readonly settled: 0;
}

/**
 * Writes one bundle over the session row inside the caller's transaction.
 *
 * The stored row is parsed before it is replaced (a corrupt row is reported, never overwritten
 * silently), the new revision is strictly monotonic, and the same transaction re-reads the row and
 * compares it canonically with the document it just wrote. No reward operation exists in this path,
 * so a repeated write of the same document cannot duplicate XP or a daily reward.
 */
export async function commitEconomySaveRows(
  transaction: TransactionPort,
  document: EconomySaveDocument,
  options: { readonly updatedAt: string } & ProfileTransactionHooks,
): Promise<EconomySaveCommit> {
  const expect: EconomySaveExpectation = {
    sessionId: document.session.sessionId,
    playerId: document.session.playerId,
  };
  const key = economySaveKey(document.session.sessionId);
  const existing = await transaction.get('meta', key);
  let revision = 1;
  if (existing !== undefined) {
    let current: EconomySaveLoaded;
    try {
      current = readRow(existing, expect);
    } catch (error) {
      throw error instanceof EconomySaveError
        ? error
        : new EconomySaveError('ROW_INVALID', describe(error), 'row');
    }
    revision = current.revision + 1;
  }
  const row = economySaveRecord(document, revision, options.updatedAt);
  const bytes = measured(row, 'row');
  if (bytes > ECONOMY_SAVE_LIMITS.maxRowBytes) {
    fail(
      'ROW_TOO_LARGE',
      `The stored row has ${bytes} bytes, above the ${ECONOMY_SAVE_LIMITS.maxRowBytes} byte record budget`,
      'row',
    );
  }
  await transaction.put('meta', row);
  const written = await transaction.get('meta', key);
  if (written === undefined) {
    fail('ROW_MISSING', 'The bundle row was not written', 'row');
  }
  const stored = readRow(written, expect);
  if (
    canonicalText(stored.document, 'row.value.document') !== canonicalText(document, 'document')
  ) {
    fail('ROW_MISMATCH', 'The stored bundle is not the one that was written', 'row.value.document');
  }
  options.beforeCommit?.();
  return Object.freeze({
    version: ECONOMY_SAVE_VERSION,
    key,
    revision,
    bytes,
    checksum: document.checksum.value,
    sizes: document.sizes,
    counts: countsOf(document.components),
    rewardsGranted: 0 as const,
    settled: 0 as const,
  });
}

export type EconomySaveLoad =
  | {
      readonly status: 'FOUND';
      readonly key: string;
      readonly document: EconomySaveDocument;
      readonly revision: number;
      readonly updatedAt: string;
      readonly bytes: number;
      readonly counts: EconomySaveCounts;
    }
  | { readonly status: 'EMPTY'; readonly key: string };

/** Reads the session bundle; no bundle is `EMPTY`, never an invented empty economy. */
export async function loadEconomySave(
  transaction: TransactionPort,
  expect: EconomySaveExpectation,
): Promise<EconomySaveLoad> {
  const key = economySaveKey(expect.sessionId);
  const row = await transaction.get('meta', key);
  if (row === undefined) return Object.freeze({ status: 'EMPTY' as const, key });
  const loaded = readRow(row, expect);
  return Object.freeze({
    status: 'FOUND' as const,
    key,
    document: loaded.document,
    revision: loaded.revision,
    updatedAt: loaded.updatedAt,
    bytes: loaded.bytes,
    counts: loaded.counts,
  });
}

/** Removes the session bundle (a replacement with an explicitly empty archive). */
export async function deleteEconomySaveRows(
  transaction: TransactionPort,
  sessionId: string,
): Promise<{ readonly key: string; readonly deleted: boolean }> {
  const key = economySaveKey(sessionId);
  const existing = await transaction.get('meta', key);
  if (existing !== undefined) await transaction.delete('meta', key);
  return Object.freeze({ key, deleted: existing !== undefined });
}

/* ---------------------------------------------------------------------- store */

export interface EconomySaveStoreOptions {
  readonly transactions: SessionArchiveTransactionRunner;
}

export interface EconomySaveRequest {
  readonly sessionId: string;
  readonly playerId: string;
  readonly worldEpoch: number;
  readonly createdAt: string;
  readonly daily?: unknown | null;
  readonly economy?: unknown | null;
  readonly player?: unknown | null;
}

export type EconomySaveResult =
  | (EconomySaveCommit & { readonly status: 'COMMITTED' | 'CRASHED_AFTER_COMMIT' })
  | {
      readonly status: 'REJECTED';
      readonly rejection: EconomySaveRejection;
    };

export interface EconomySaveStore {
  readonly save: (request: EconomySaveRequest) => Promise<EconomySaveResult>;
  readonly load: (target: {
    readonly sessionId: string;
    readonly playerId: string;
    readonly worldEpoch?: number;
  }) => Promise<EconomySaveLoad>;
  readonly clear: (target: {
    readonly sessionId: string;
    readonly playerId: string;
  }) => Promise<{ readonly deleted: boolean }>;
}

/**
 * The application-facing bundle port.
 *
 * `save` builds and commits one bundle in one read/write transaction over the 127 `meta` store,
 * `load` reads it back through the same validation a file goes through, and `clear` removes it. The
 * store keeps no second copy: every call reads or writes the database.
 */
export function createEconomySaveStore(options: EconomySaveStoreOptions): EconomySaveStore {
  const transactions = options.transactions;

  return Object.freeze({
    async save(request: EconomySaveRequest): Promise<EconomySaveResult> {
      const built = buildEconomySave(request);
      if (built.status === 'REJECTED') {
        return Object.freeze({ status: 'REJECTED' as const, rejection: built.rejection });
      }
      const updatedAt = request.createdAt;
      let commit: EconomySaveCommit;
      try {
        commit = await transactions.transact(['meta'], (transaction) =>
          commitEconomySaveRows(transaction, built.document, { updatedAt }),
        );
      } catch (error) {
        return Object.freeze({ status: 'REJECTED' as const, rejection: rejectionOf(error) });
      }
      return Object.freeze({ ...commit, status: 'COMMITTED' as const });
    },
    load: async (target: {
      readonly sessionId: string;
      readonly playerId: string;
      readonly worldEpoch?: number;
    }): Promise<EconomySaveLoad> => {
      const expect: EconomySaveExpectation =
        target.worldEpoch === undefined
          ? { sessionId: target.sessionId, playerId: target.playerId }
          : {
              sessionId: target.sessionId,
              playerId: target.playerId,
              worldEpoch: target.worldEpoch,
            };
      return transactions.transact(['meta'], (transaction) => loadEconomySave(transaction, expect));
    },
    clear: async (target: {
      readonly sessionId: string;
      readonly playerId: string;
    }): Promise<{ readonly deleted: boolean }> => {
      const removed = await transactions.transact(['meta'], (transaction) =>
        deleteEconomySaveRows(transaction, target.sessionId),
      );
      return Object.freeze({ deleted: removed.deleted });
    },
  });
}
