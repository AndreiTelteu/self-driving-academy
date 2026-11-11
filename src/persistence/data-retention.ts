import {
  CANONICALIZATION_VERSION,
  CHECKSUM_ALGORITHM,
  canonicalizeJson,
  sha256Hex,
} from './canonical-json';
import { PersistenceError } from './contracts';
import type { PersistenceReasonCode } from './contracts';

/**
 * Local data retention with per-domain byte quotas (PBI 132).
 *
 * Two domains are retained **separately**, each with its own RAM and durable (DB) byte quota:
 *
 * - `INTERVENTION_TELEMETRY` — the closed intervention segments (069/129) and the compacted
 *   telemetry chunks (090);
 * - `WORLD_RECORDER` — the sealed world replay chunks (207) and the checkpoints they anchor on
 *   (206).
 *
 * There is deliberately no "global cleanup" over the whole database: a cleanup request always
 * names exactly one domain, and the engine only ever looks at the artifacts of that domain. Profile,
 * progress, the active checkpoint and the ledgers needed for deduplication live in the same
 * inventory but carry an explicit `protection` class; they consume quota and are **never** evicted,
 * not even when the quota is full.
 *
 * **Quotas are in bytes, never in durations.** The values come from `Docs/performance-budgets.json`
 * (`recorderRamBytes`, `optionalReplayStorageBytes`) and from the delivered 069 contract limit
 * (`INTERVENTION_LIMITS.recordStoreBytes`); the durable telemetry quota is the 221 persistence
 * ingress byte cap because the manifest fixes no dedicated durable telemetry total. That gap is
 * declared in `retentionBudgetGaps` instead of being replaced by an invented number. A missing or
 * non-finite value is a `QUOTA_MISSING` refusal, never an unbounded default.
 *
 * **Quota full means export first, then selective deletion.** A cleanup plan cannot even be
 * produced without an export digest, and `applyCleanup` re-derives the export of the target domain
 * and refuses the plan when the digest does not match. The export document is canonical JSON with a
 * `SHA-256` checksum, following the `SDA-CJSON-1` rules of Docs/29, so a copy exists before any byte
 * disappears.
 *
 * **Eviction is deterministic.** Candidates are ordered by an explicit comparator over numbers and
 * code points (`sequence`, then `artifactId`; `LARGEST_FIRST` sorts by declared bytes first). A
 * `Map`/object iteration order, a wall clock, a timer or `Math.random` never participates: the same
 * inventory and the same request produce the same plan digest and the same result digest.
 *
 * **A partial clip is declared, not implied.** Sealed replay/telemetry rows of one clip share a
 * `clipId`. When eviction removes only part of a clip, every retained row of that clip is re-declared
 * `PARTIAL` with the closed reason `RETENTION_EVICTED` and the exact missing clip sequences.
 */

export const DATA_RETENTION_VERSION = '132-data-retention-v1' as const;
export const DATA_RETENTION_EXPORT_FORMAT = 'self-driving-academy-retention-export' as const;
export const DATA_RETENTION_EXPORT_FORMAT_VERSION = 1 as const;

export const retentionDomains = ['INTERVENTION_TELEMETRY', 'WORLD_RECORDER'] as const;
export type RetentionDomain = (typeof retentionDomains)[number];

/** Fixed order of the domains; it is used for sorting, never for a shared budget. */
export const retentionDomainOrder: readonly RetentionDomain[] = Object.freeze([
  'INTERVENTION_TELEMETRY',
  'WORLD_RECORDER',
]);

export const retentionArtifactKinds = [
  'INTERVENTION_SEGMENT',
  'TELEMETRY_CHUNK',
  'REPLAY_CHUNK',
  'CHECKPOINT',
  /** A row that is not telemetry at all (profile, progress, dedup ledger); always protected. */
  'PROTECTED_ROW',
] as const;
export type RetentionArtifactKind = (typeof retentionArtifactKinds)[number];

/** The kinds each domain owns; an artifact in the wrong domain is refused. */
export const retentionDomainKinds: Readonly<
  Record<RetentionDomain, readonly RetentionArtifactKind[]>
> = Object.freeze({
  INTERVENTION_TELEMETRY: Object.freeze<RetentionArtifactKind[]>([
    'INTERVENTION_SEGMENT',
    'TELEMETRY_CHUNK',
    'PROTECTED_ROW',
  ]),
  WORLD_RECORDER: Object.freeze<RetentionArtifactKind[]>([
    'REPLAY_CHUNK',
    'CHECKPOINT',
    'PROTECTED_ROW',
  ]),
});

/** Data that must survive a full quota; the class is the contract, not a UI label. */
export const retentionProtectionClasses = [
  'PROFILE',
  'PROGRESS',
  'ACTIVE_CHECKPOINT',
  'DEDUP_LEDGER',
] as const;
export type RetentionProtectionClass = (typeof retentionProtectionClasses)[number];

export const retentionArtifactStatuses = ['COMPLETE', 'PARTIAL'] as const;
export type RetentionArtifactStatus = (typeof retentionArtifactStatuses)[number];

/** Closed reason list for a clip that lost rows to retention (never a silent truncation). */
export const retentionPartialReasons = ['RETENTION_EVICTED'] as const;
export type RetentionPartialReason = (typeof retentionPartialReasons)[number];

export const retentionCleanupCriteria = ['OLDEST_FIRST', 'LARGEST_FIRST', 'WHOLE_DOMAIN'] as const;
export type RetentionCleanupCriterion = (typeof retentionCleanupCriteria)[number];

export const retentionUsageStatuses = ['WITHIN', 'EXCEEDED', 'PROTECTED_OVERFLOW'] as const;
export type RetentionUsageStatus = (typeof retentionUsageStatuses)[number];

export const retentionCodes = [
  'QUOTA_MISSING',
  'QUOTA_INVALID',
  'INVENTORY_INVALID',
  'DOMAIN_UNKNOWN',
  'CRITERION_UNKNOWN',
  'REQUEST_INVALID',
  'EXPORT_REQUIRED',
  'EXPORT_MISMATCH',
  'PLAN_UNKNOWN',
  'PLAN_STALE',
  'PROTECTED_EVICTION',
  'NOTHING_TO_EVICT',
] as const;
export type RetentionCode = (typeof retentionCodes)[number];
export type RetentionRejectionCode = RetentionCode | PersistenceReasonCode;

export interface RetentionRejection {
  readonly status: 'REJECTED';
  readonly code: RetentionRejectionCode;
  readonly message: string;
  readonly path: string;
}

/* ------------------------------------------------------------------ budgets */

/**
 * Capacities this contract consumes. Every value is copied from a delivered contract; this file
 * never introduces a number of its own.
 */
export const DATA_RETENTION_BUDGET = Object.freeze({
  budgetVersion: '203-initial-1',
  source: 'Docs/performance-budgets.json',
  /** `proposedCapacities.recorderRamBytes`: RAM of the world recorder and its replay chunks. */
  recorderRamBytes: 33_554_432,
  /** `proposedCapacities.optionalReplayStorageBytes`: durable replay window. */
  optionalReplayStorageBytes: 134_217_728,
  /** `resourceAdmissionContracts.workers.persistenceIngressBytes`: durable persistence ingress. */
  persistenceIngressBytes: 16_777_216,
  /** `069-intervention-lifecycle-v1` `INTERVENTION_LIMITS.recordStoreBytes`. */
  interventionRecordStoreBytes: 33_554_432,
});

/**
 * Capacities the manifest does not fix. They are reported, not replaced: a null capacity is never
 * turned into "unlimited" and never into an invented number.
 */
export const retentionBudgetGaps = Object.freeze([
  Object.freeze({
    key: 'interventionTelemetryDbBytes',
    owner: '132/228',
    status: 'NOT_FIXED_IN_MANIFEST',
    handling: 'PERSISTENCE_INGRESS_BYTES_USED_AS_FINITE_DURABLE_QUOTA_AND_GAP_DECLARED',
  }),
  Object.freeze({
    key: 'totalHeapBytes',
    owner: '203/218/224',
    status: 'NOT_AVAILABLE',
    handling: 'OWNERSHIP_COUNTERS_ONLY',
  }),
]);

export const retentionQuotaProvenances = ['MANIFEST', 'CONTRACT_LIMIT'] as const;
export type RetentionQuotaProvenance = (typeof retentionQuotaProvenances)[number];

export interface RetentionQuotaCap {
  readonly bytes: number;
  readonly provenance: RetentionQuotaProvenance;
  readonly key: string;
  readonly note: string;
}

export interface RetentionDomainQuota {
  readonly domain: RetentionDomain;
  readonly ram: RetentionQuotaCap;
  readonly db: RetentionQuotaCap;
}

export interface RetentionBudgetInput {
  readonly recorderRamBytes: number | null;
  readonly optionalReplayStorageBytes: number | null;
  readonly persistenceIngressBytes: number | null;
  readonly interventionRecordStoreBytes: number | null;
}

export type RetentionQuotaResolution =
  | { readonly status: 'RESOLVED'; readonly quotas: readonly RetentionDomainQuota[] }
  | RetentionRejection;

function reject(code: RetentionRejectionCode, message: string, path = '$'): RetentionRejection {
  return Object.freeze({ status: 'REJECTED', code, message, path });
}

function capOf(
  bytes: number | null,
  provenance: RetentionQuotaProvenance,
  key: string,
  note: string,
): RetentionQuotaCap | null {
  if (bytes === null || !Number.isSafeInteger(bytes) || bytes <= 0) return null;
  return Object.freeze({ bytes, provenance, key, note });
}

/** Resolves the two domain quotas from explicit budget input; a missing cap is a refusal. */
export function resolveRetentionQuotas(input: RetentionBudgetInput): RetentionQuotaResolution {
  const telemetryRam = capOf(
    input.interventionRecordStoreBytes,
    'CONTRACT_LIMIT',
    '069-intervention-lifecycle-v1.INTERVENTION_LIMITS.recordStoreBytes',
    'RAM cap of the protected 069 intervention record store.',
  );
  if (telemetryRam === null)
    return reject(
      'QUOTA_MISSING',
      'The intervention telemetry RAM quota is not a finite positive byte count',
      '069-intervention-lifecycle-v1.INTERVENTION_LIMITS.recordStoreBytes',
    );
  const telemetryDb = capOf(
    input.persistenceIngressBytes,
    'MANIFEST',
    'resourceAdmissionContracts.workers.persistenceIngressBytes',
    'No dedicated durable telemetry quota is fixed in the manifest; the 221 persistence ingress byte cap is the finite durable quota and the gap is declared.',
  );
  if (telemetryDb === null)
    return reject(
      'QUOTA_MISSING',
      'The intervention telemetry DB quota is not a finite positive byte count',
      'resourceAdmissionContracts.workers.persistenceIngressBytes',
    );
  const recorderRam = capOf(
    input.recorderRamBytes,
    'MANIFEST',
    'proposedCapacities.recorderRamBytes',
    'RAM cap of the world recorder, its ring and its retained replay chunks.',
  );
  if (recorderRam === null)
    return reject(
      'QUOTA_MISSING',
      'The world recorder RAM quota is not a finite positive byte count',
      'proposedCapacities.recorderRamBytes',
    );
  const recorderDb = capOf(
    input.optionalReplayStorageBytes,
    'MANIFEST',
    'proposedCapacities.optionalReplayStorageBytes',
    'Durable replay window of the world recorder.',
  );
  if (recorderDb === null)
    return reject(
      'QUOTA_MISSING',
      'The world recorder DB quota is not a finite positive byte count',
      'proposedCapacities.optionalReplayStorageBytes',
    );
  return Object.freeze({
    status: 'RESOLVED',
    quotas: Object.freeze([
      Object.freeze({ domain: 'INTERVENTION_TELEMETRY', ram: telemetryRam, db: telemetryDb }),
      Object.freeze({ domain: 'WORLD_RECORDER', ram: recorderRam, db: recorderDb }),
    ]),
  });
}

/** The quotas of the frozen defaults; used when a caller does not pass its own resolution. */
export function defaultRetentionQuotas(): readonly RetentionDomainQuota[] {
  const resolved = resolveRetentionQuotas(DATA_RETENTION_BUDGET);
  if (resolved.status !== 'RESOLVED')
    throw new PersistenceError('INVALID_RECORD', resolved.message, resolved.path);
  return resolved.quotas;
}

/* ---------------------------------------------------------------- artifacts */

export interface RetentionProtection {
  readonly className: RetentionProtectionClass;
  /** Why this row may not be evicted, e.g. "store profiles" or "ledger 125". */
  readonly reason: string;
}

export interface RetentionArtifact {
  readonly artifactId: string;
  readonly domain: RetentionDomain;
  readonly kind: RetentionArtifactKind;
  /** Deterministic order inside the domain; the primary eviction key after the criterion. */
  readonly sequence: number;
  readonly ramBytes: number;
  readonly dbBytes: number;
  /** Sealed rows of one clip share this id so a partial eviction can be declared. */
  readonly clipId: string | null;
  /** Position inside the clip; a missing position is a declared gap. */
  readonly clipSequence: number | null;
  readonly protection: RetentionProtection | null;
  readonly status: RetentionArtifactStatus;
}

export interface RetentionUsage {
  readonly artifacts: number;
  readonly protectedArtifacts: number;
  readonly evictableArtifacts: number;
  readonly ramBytes: number;
  readonly ramCapBytes: number;
  readonly ramOverBytes: number;
  readonly dbBytes: number;
  readonly dbCapBytes: number;
  readonly dbOverBytes: number;
  readonly status: RetentionUsageStatus;
}

export interface RetentionDomainUsage extends RetentionUsage {
  readonly domain: RetentionDomain;
}

export interface RetentionAssessment {
  readonly version: typeof DATA_RETENTION_VERSION;
  readonly status: RetentionUsageStatus;
  readonly domains: readonly RetentionDomainUsage[];
  readonly gaps: typeof retentionBudgetGaps;
}

/* ------------------------------------------------------------------- export */

export interface RetentionExportTotals {
  readonly artifacts: number;
  readonly protectedArtifacts: number;
  readonly partialArtifacts: number;
  readonly ramBytes: number;
  readonly dbBytes: number;
}

export interface RetentionChecksum {
  readonly algorithm: typeof CHECKSUM_ALGORITHM;
  readonly canonicalization: typeof CANONICALIZATION_VERSION;
  readonly value: string;
}

export interface RetentionExportDocument {
  readonly format: typeof DATA_RETENTION_EXPORT_FORMAT;
  readonly formatVersion: typeof DATA_RETENTION_EXPORT_FORMAT_VERSION;
  readonly contract: typeof DATA_RETENTION_VERSION;
  readonly domain: RetentionDomain;
  readonly reason: 'QUOTA_EXCEEDED' | 'MANUAL';
  readonly quotas: { readonly ramBytes: number; readonly dbBytes: number };
  readonly totals: RetentionExportTotals;
  readonly artifacts: readonly RetentionArtifact[];
  readonly checksum: RetentionChecksum;
}

/* -------------------------------------------------------------- cleanup API */

export interface RetentionEviction {
  readonly artifactId: string;
  readonly kind: RetentionArtifactKind;
  readonly sequence: number;
  readonly ramBytes: number;
  readonly dbBytes: number;
}

export interface RetentionCleanupRequest {
  readonly domain: RetentionDomain;
  readonly criterion: RetentionCleanupCriterion;
  /** Digest of `exportDomain(domain)`; a plan cannot exist without the copy. */
  readonly exportDigest: string | null;
  /**
   * Stop as soon as the domain fits its quotas (or the optional targets). `WHOLE_DOMAIN` ignores
   * this and removes every evictable artifact unless `maxEvictions` bounds it.
   */
  readonly stopAtQuota?: boolean;
  readonly targetRamBytes?: number | null;
  readonly targetDbBytes?: number | null;
  readonly maxEvictions?: number | null;
}

export interface RetentionProjectedUsage {
  readonly ramBytes: number;
  readonly dbBytes: number;
  readonly ramCapBytes: number;
  readonly dbCapBytes: number;
  readonly status: RetentionUsageStatus;
}

export interface RetentionRetainedSummary {
  readonly artifacts: number;
  readonly protectedArtifacts: number;
  readonly ramBytes: number;
  readonly dbBytes: number;
}

export interface RetentionCleanupPlan {
  readonly version: typeof DATA_RETENTION_VERSION;
  readonly domain: RetentionDomain;
  readonly criterion: RetentionCleanupCriterion;
  readonly exportDigest: string;
  readonly evictions: readonly RetentionEviction[];
  readonly retained: RetentionRetainedSummary;
  readonly projected: RetentionProjectedUsage;
  readonly digest: string;
}

export interface RetentionPartialDeclaration {
  readonly artifactId: string;
  readonly clipId: string;
  readonly status: 'PARTIAL';
  readonly reasons: readonly RetentionPartialReason[];
  readonly missingSequences: readonly number[];
}

export interface RetentionCleanupResult {
  readonly version: typeof DATA_RETENTION_VERSION;
  readonly status: 'APPLIED';
  readonly domain: RetentionDomain;
  readonly criterion: RetentionCleanupCriterion;
  readonly evicted: readonly RetentionEviction[];
  readonly evictedBytes: { readonly ram: number; readonly db: number };
  readonly retained: RetentionRetainedSummary;
  readonly usageBefore: RetentionDomainUsage;
  readonly usageAfter: RetentionDomainUsage;
  readonly partials: readonly RetentionPartialDeclaration[];
  readonly exportDigest: string;
  readonly digest: string;
}

export type RetentionPlanResult =
  { readonly status: 'PLANNED'; readonly plan: RetentionCleanupPlan } | RetentionRejection;

export type RetentionApplyResult = RetentionCleanupResult | RetentionRejection;

export interface DataRetentionOptions {
  readonly artifacts: readonly RetentionArtifact[];
  /** Defaults to `defaultRetentionQuotas()`; a resolution from the real manifest is preferred. */
  readonly quotas?: readonly RetentionDomainQuota[];
}

export interface DataRetention {
  readonly version: typeof DATA_RETENTION_VERSION;
  readonly quotas: readonly RetentionDomainQuota[];
  readonly gaps: typeof retentionBudgetGaps;
  inventory(): readonly RetentionArtifact[];
  assess(): RetentionAssessment;
  exportDomain(domain: RetentionDomain): RetentionExportDocument;
  planCleanup(request: RetentionCleanupRequest): RetentionPlanResult;
  applyCleanup(plan: RetentionCleanupPlan): RetentionApplyResult;
}

/* ----------------------------------------------------------------- internals */

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalText(value: unknown): string {
  const result = canonicalizeJson(value);
  if (result.status === 'REJECTED')
    throw new PersistenceError('BODY_INVALID', result.rejection.message, result.rejection.path);
  return result.text;
}

function digestOf(value: unknown): string {
  return sha256Hex(canonicalText(value));
}

function isDomain(value: unknown): value is RetentionDomain {
  return typeof value === 'string' && (retentionDomains as readonly string[]).includes(value);
}

function isCriterion(value: unknown): value is RetentionCleanupCriterion {
  return (
    typeof value === 'string' && (retentionCleanupCriteria as readonly string[]).includes(value)
  );
}

function invalid(message: string, path: string): never {
  throw new PersistenceError('INVALID_RECORD', message, path);
}

function freezeArtifact(input: RetentionArtifact): RetentionArtifact {
  if (!isDomain(input.domain)) invalid(`Unknown retention domain`, '$.domain');
  if ((retentionDomainKinds[input.domain] as readonly string[]).includes(input.kind) === false)
    invalid(`Kind ${input.kind} is not owned by ${input.domain}`, '$.kind');
  if (typeof input.artifactId !== 'string' || input.artifactId.length === 0)
    invalid('An artifact needs a non-empty id', '$.artifactId');
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 0)
    invalid('An artifact sequence must be a non-negative safe integer', '$.sequence');
  if (!Number.isSafeInteger(input.ramBytes) || input.ramBytes < 0)
    invalid('RAM bytes must be a non-negative safe integer', '$.ramBytes');
  if (!Number.isSafeInteger(input.dbBytes) || input.dbBytes < 0)
    invalid('DB bytes must be a non-negative safe integer', '$.dbBytes');
  if (input.clipId !== null && (typeof input.clipId !== 'string' || input.clipId.length === 0))
    invalid('A clip id must be null or a non-empty string', '$.clipId');
  if (input.clipId === null && input.clipSequence !== null)
    invalid('A clip sequence requires a clip id', '$.clipSequence');
  if (
    input.clipId !== null &&
    (!Number.isSafeInteger(input.clipSequence) || input.clipSequence! < 0)
  )
    invalid('A clip sequence must be a non-negative safe integer', '$.clipSequence');
  if (
    input.protection !== null &&
    ((retentionProtectionClasses as readonly string[]).includes(input.protection.className) ===
      false ||
      typeof input.protection.reason !== 'string' ||
      input.protection.reason.length === 0)
  )
    invalid('A protection needs a known class and a reason', '$.protection');
  if ((retentionArtifactStatuses as readonly string[]).includes(input.status) === false)
    invalid('Unknown artifact status', '$.status');
  if (input.kind === 'PROTECTED_ROW' && input.protection === null)
    invalid('A PROFILE/PROGRESS/ledger row must carry a protection class', '$.protection');
  return Object.freeze({
    artifactId: input.artifactId,
    domain: input.domain,
    kind: input.kind,
    sequence: input.sequence,
    ramBytes: input.ramBytes,
    dbBytes: input.dbBytes,
    clipId: input.clipId,
    clipSequence: input.clipSequence,
    protection:
      input.protection === null
        ? null
        : Object.freeze({
            className: input.protection.className,
            reason: input.protection.reason,
          }),
    status: input.status,
  });
}

function orderBySequence(left: RetentionArtifact, right: RetentionArtifact): number {
  return left.sequence - right.sequence || compareText(left.artifactId, right.artifactId);
}

function evictionOrder(
  criterion: RetentionCleanupCriterion,
): (left: RetentionArtifact, right: RetentionArtifact) => number {
  if (criterion === 'LARGEST_FIRST')
    return (left, right) =>
      right.ramBytes + right.dbBytes - (left.ramBytes + left.dbBytes) ||
      orderBySequence(left, right);
  return orderBySequence;
}

function usageOf(
  domain: RetentionDomain,
  rows: readonly RetentionArtifact[],
  quota: RetentionDomainQuota,
): RetentionDomainUsage {
  let ramBytes = 0;
  let dbBytes = 0;
  let protectedArtifacts = 0;
  for (const row of rows) {
    ramBytes += row.ramBytes;
    dbBytes += row.dbBytes;
    if (row.protection !== null) protectedArtifacts += 1;
  }
  const ramOverBytes = Math.max(0, ramBytes - quota.ram.bytes);
  const dbOverBytes = Math.max(0, dbBytes - quota.db.bytes);
  const evictableArtifacts = rows.length - protectedArtifacts;
  const over = ramOverBytes > 0 || dbOverBytes > 0;
  return Object.freeze({
    domain,
    artifacts: rows.length,
    protectedArtifacts,
    evictableArtifacts,
    ramBytes,
    ramCapBytes: quota.ram.bytes,
    ramOverBytes,
    dbBytes,
    dbCapBytes: quota.db.bytes,
    dbOverBytes,
    status: over ? (evictableArtifacts > 0 ? 'EXCEEDED' : 'PROTECTED_OVERFLOW') : 'WITHIN',
  });
}

function worstStatus(statuses: readonly RetentionUsageStatus[]): RetentionUsageStatus {
  if (statuses.includes('PROTECTED_OVERFLOW')) return 'PROTECTED_OVERFLOW';
  if (statuses.includes('EXCEEDED')) return 'EXCEEDED';
  return 'WITHIN';
}

/* ------------------------------------------------------------------- factory */

export function createDataRetention(options: DataRetentionOptions): DataRetention {
  const quotas = options.quotas ?? defaultRetentionQuotas();
  if (quotas.length !== retentionDomains.length)
    throw new PersistenceError(
      'INVALID_RECORD',
      'Exactly two domain quotas are required; there is no shared budget',
      '$.quotas',
    );
  const quotaByDomain = new Map<RetentionDomain, RetentionDomainQuota>();
  for (const quota of quotas) {
    if (!isDomain(quota.domain)) invalid('Unknown quota domain', '$.quotas.domain');
    if (
      !Number.isSafeInteger(quota.ram.bytes) ||
      quota.ram.bytes <= 0 ||
      !Number.isSafeInteger(quota.db.bytes) ||
      quota.db.bytes <= 0
    )
      invalid('Every quota must be a finite positive byte count', '$.quotas');
    if (quotaByDomain.has(quota.domain)) invalid('A domain quota may appear only once', '$.quotas');
    quotaByDomain.set(
      quota.domain,
      Object.freeze({
        domain: quota.domain,
        ram: Object.freeze({ ...quota.ram }),
        db: Object.freeze({ ...quota.db }),
      }),
    );
  }
  for (const domain of retentionDomains)
    if (!quotaByDomain.has(domain)) invalid(`Missing quota for ${domain}`, '$.quotas');

  const seen = new Set<string>();
  let artifacts: readonly RetentionArtifact[] = Object.freeze(
    options.artifacts
      .map((artifact) => freezeArtifact(artifact))
      .sort((left, right) => {
        return (
          retentionDomainOrder.indexOf(left.domain) - retentionDomainOrder.indexOf(right.domain) ||
          orderBySequence(left, right)
        );
      }),
  );
  for (const artifact of artifacts) {
    if (seen.has(artifact.artifactId))
      invalid(`Duplicate artifact id ${artifact.artifactId}`, '$.artifacts');
    seen.add(artifact.artifactId);
  }

  let inventoryDigest = digestOf(artifacts);
  const issuedPlans = new Map<string, string>();

  function quotaOf(domain: RetentionDomain): RetentionDomainQuota {
    const quota = quotaByDomain.get(domain);
    if (!quota) throw new PersistenceError('INVALID_RECORD', `Missing quota ${domain}`);
    return quota;
  }

  function rowsOf(domain: RetentionDomain): readonly RetentionArtifact[] {
    return artifacts.filter((artifact) => artifact.domain === domain);
  }

  function assessDomain(domain: RetentionDomain): RetentionDomainUsage {
    return usageOf(domain, rowsOf(domain), quotaOf(domain));
  }

  function buildExport(domain: RetentionDomain): RetentionExportDocument {
    const quota = quotaOf(domain);
    const usage = assessDomain(domain);
    const rows = rowsOf(domain).slice().sort(orderBySequence);
    let ramBytes = 0;
    let dbBytes = 0;
    let partialArtifacts = 0;
    let protectedArtifacts = 0;
    for (const row of rows) {
      ramBytes += row.ramBytes;
      dbBytes += row.dbBytes;
      if (row.status === 'PARTIAL') partialArtifacts += 1;
      if (row.protection !== null) protectedArtifacts += 1;
    }
    const body: Omit<RetentionExportDocument, 'checksum'> = {
      format: DATA_RETENTION_EXPORT_FORMAT,
      formatVersion: DATA_RETENTION_EXPORT_FORMAT_VERSION,
      contract: DATA_RETENTION_VERSION,
      domain,
      reason: usage.status === 'WITHIN' ? 'MANUAL' : 'QUOTA_EXCEEDED',
      quotas: { ramBytes: quota.ram.bytes, dbBytes: quota.db.bytes },
      totals: {
        artifacts: rows.length,
        protectedArtifacts,
        partialArtifacts,
        ramBytes,
        dbBytes,
      },
      artifacts: rows,
    };
    return Object.freeze({
      ...body,
      checksum: Object.freeze({
        algorithm: CHECKSUM_ALGORITHM,
        canonicalization: CANONICALIZATION_VERSION,
        value: digestOf(body),
      }),
    });
  }

  function validateRequest(request: RetentionCleanupRequest): RetentionRejection | null {
    if (!isDomain(request.domain))
      return reject('DOMAIN_UNKNOWN', 'A cleanup names exactly one known domain', '$.domain');
    if (!isCriterion(request.criterion))
      return reject(
        'CRITERION_UNKNOWN',
        'The cleanup criterion must be age, size or an explicit whole domain',
        '$.criterion',
      );
    for (const [key, value] of [
      ['$.targetRamBytes', request.targetRamBytes ?? null],
      ['$.targetDbBytes', request.targetDbBytes ?? null],
    ] as const)
      if (value !== null && (!Number.isSafeInteger(value) || value < 0))
        return reject('REQUEST_INVALID', 'A byte target must be a non-negative integer', key);
    if (
      request.maxEvictions !== undefined &&
      request.maxEvictions !== null &&
      (!Number.isSafeInteger(request.maxEvictions) || request.maxEvictions < 0)
    )
      return reject(
        'REQUEST_INVALID',
        'maxEvictions must be a non-negative integer',
        '$.maxEvictions',
      );
    return null;
  }

  function planCleanup(request: RetentionCleanupRequest): RetentionPlanResult {
    const invalidRequest = validateRequest(request);
    if (invalidRequest) return invalidRequest;
    if (typeof request.exportDigest !== 'string' || request.exportDigest.length === 0)
      return reject(
        'EXPORT_REQUIRED',
        'A cleanup plan requires the digest of an export of the same domain',
        '$.exportDigest',
      );
    const exported = buildExport(request.domain);
    if (exported.checksum.value !== request.exportDigest)
      return reject(
        'EXPORT_MISMATCH',
        'The export digest does not describe the current domain inventory',
        '$.exportDigest',
      );

    const quota = quotaOf(request.domain);
    const usage = assessDomain(request.domain);
    const candidates = rowsOf(request.domain)
      .filter((artifact) => artifact.protection === null)
      .sort(evictionOrder(request.criterion));
    const maxEvictions = request.maxEvictions ?? Number.MAX_SAFE_INTEGER;
    const stopAtQuota =
      request.criterion === 'WHOLE_DOMAIN' ? false : (request.stopAtQuota ?? true);
    const ramTarget = Math.min(quota.ram.bytes, request.targetRamBytes ?? quota.ram.bytes);
    const dbTarget = Math.min(quota.db.bytes, request.targetDbBytes ?? quota.db.bytes);

    let ramBytes = usage.ramBytes;
    let dbBytes = usage.dbBytes;
    const evictions: RetentionEviction[] = [];
    for (const candidate of candidates) {
      if (evictions.length >= maxEvictions) break;
      if (stopAtQuota && ramBytes <= ramTarget && dbBytes <= dbTarget) break;
      evictions.push(
        Object.freeze({
          artifactId: candidate.artifactId,
          kind: candidate.kind,
          sequence: candidate.sequence,
          ramBytes: candidate.ramBytes,
          dbBytes: candidate.dbBytes,
        }),
      );
      ramBytes -= candidate.ramBytes;
      dbBytes -= candidate.dbBytes;
    }

    const retainedEvictable = usage.evictableArtifacts - evictions.length;
    const over = ramBytes > quota.ram.bytes || dbBytes > quota.db.bytes;
    const body: Omit<RetentionCleanupPlan, 'digest'> = {
      version: DATA_RETENTION_VERSION,
      domain: request.domain,
      criterion: request.criterion,
      exportDigest: exported.checksum.value,
      evictions: Object.freeze(evictions),
      retained: Object.freeze({
        artifacts: usage.artifacts - evictions.length,
        protectedArtifacts: usage.protectedArtifacts,
        ramBytes,
        dbBytes,
      }),
      projected: Object.freeze({
        ramBytes,
        dbBytes,
        ramCapBytes: quota.ram.bytes,
        dbCapBytes: quota.db.bytes,
        status: over ? (retainedEvictable > 0 ? 'EXCEEDED' : 'PROTECTED_OVERFLOW') : 'WITHIN',
      }),
    };
    const plan: RetentionCleanupPlan = Object.freeze({ ...body, digest: digestOf(body) });
    issuedPlans.set(plan.digest, inventoryDigest);
    return { status: 'PLANNED', plan };
  }

  function applyCleanup(plan: RetentionCleanupPlan): RetentionApplyResult {
    if (typeof plan.digest !== 'string' || typeof plan.domain !== 'string')
      return reject('REQUEST_INVALID', 'The plan is not a cleanup plan', '$');
    if (!isDomain(plan.domain))
      return reject('DOMAIN_UNKNOWN', 'A cleanup names exactly one known domain', '$.domain');
    if (!issuedPlans.has(plan.digest))
      return reject(
        'PLAN_UNKNOWN',
        'The plan was not issued by this retention instance',
        '$.digest',
      );
    if (issuedPlans.get(plan.digest) !== inventoryDigest)
      return reject('PLAN_STALE', 'The inventory changed after the plan was produced', '$.digest');
    const { digest: planDigest, ...planBody } = plan;
    if (digestOf(planBody) !== planDigest)
      return reject('PLAN_UNKNOWN', 'The plan body does not match its digest', '$.digest');
    const exported = buildExport(plan.domain);
    if (typeof plan.exportDigest !== 'string' || plan.exportDigest.length === 0)
      return reject('EXPORT_REQUIRED', 'A cleanup needs an export of the same domain', '$');
    if (exported.checksum.value !== plan.exportDigest)
      return reject(
        'EXPORT_MISMATCH',
        'The export digest does not describe the current domain inventory',
        '$.exportDigest',
      );

    const byId = new Map(artifacts.map((artifact) => [artifact.artifactId, artifact]));
    const evictedRows: RetentionArtifact[] = [];
    for (const eviction of plan.evictions) {
      const row = byId.get(eviction.artifactId);
      if (!row || row.domain !== plan.domain)
        return reject('PLAN_STALE', `Artifact ${eviction.artifactId} is missing`, '$.evictions');
      if (row.protection !== null)
        return reject(
          'PROTECTED_EVICTION',
          `Artifact ${eviction.artifactId} is protected (${row.protection.className})`,
          '$.evictions',
        );
      evictedRows.push(row);
    }

    const usageBefore = assessDomain(plan.domain);
    if (evictedRows.length === 0)
      return reject(
        'NOTHING_TO_EVICT',
        'The plan evicts nothing; the domain already fits its quota',
        '$.evictions',
      );

    const removed = new Set(evictedRows.map((row) => row.artifactId));
    const missingByClip = new Map<string, Set<number>>();
    for (const row of evictedRows)
      if (row.clipId !== null) {
        const missing = missingByClip.get(row.clipId) ?? new Set<number>();
        missing.add(row.clipSequence ?? row.sequence);
        missingByClip.set(row.clipId, missing);
      }

    const partials: RetentionPartialDeclaration[] = [];
    const next: RetentionArtifact[] = [];
    for (const row of artifacts) {
      if (removed.has(row.artifactId)) continue;
      const missing = row.clipId === null ? undefined : missingByClip.get(row.clipId);
      if (missing && missing.size > 0) {
        const missingSequences = Object.freeze([...missing].sort((left, right) => left - right));
        partials.push(
          Object.freeze({
            artifactId: row.artifactId,
            clipId: row.clipId!,
            status: 'PARTIAL' as const,
            reasons: Object.freeze([...retentionPartialReasons]),
            missingSequences,
          }),
        );
        next.push(Object.freeze({ ...row, status: 'PARTIAL' as const }));
      } else next.push(row);
    }

    artifacts = Object.freeze(next);
    inventoryDigest = digestOf(artifacts);
    issuedPlans.clear();

    const usageAfter = assessDomain(plan.domain);
    let evictedRam = 0;
    let evictedDb = 0;
    for (const row of evictedRows) {
      evictedRam += row.ramBytes;
      evictedDb += row.dbBytes;
    }
    const body: Omit<RetentionCleanupResult, 'digest'> = {
      version: DATA_RETENTION_VERSION,
      status: 'APPLIED',
      domain: plan.domain,
      criterion: plan.criterion,
      evicted: Object.freeze(
        evictedRows
          .slice()
          .sort(orderBySequence)
          .map((row) =>
            Object.freeze({
              artifactId: row.artifactId,
              kind: row.kind,
              sequence: row.sequence,
              ramBytes: row.ramBytes,
              dbBytes: row.dbBytes,
            }),
          ),
      ),
      evictedBytes: Object.freeze({ ram: evictedRam, db: evictedDb }),
      retained: Object.freeze({
        artifacts: usageAfter.artifacts,
        protectedArtifacts: usageAfter.protectedArtifacts,
        ramBytes: usageAfter.ramBytes,
        dbBytes: usageAfter.dbBytes,
      }),
      usageBefore,
      usageAfter,
      partials: Object.freeze(
        partials.sort(
          (left, right) =>
            compareText(left.clipId, right.clipId) ||
            compareText(left.artifactId, right.artifactId),
        ),
      ),
      exportDigest: plan.exportDigest,
    };
    return Object.freeze({ ...body, digest: digestOf(body) });
  }

  return Object.freeze({
    version: DATA_RETENTION_VERSION,
    quotas: Object.freeze(retentionDomains.map((domain) => quotaOf(domain))),
    gaps: retentionBudgetGaps,
    inventory: () => artifacts,
    assess(): RetentionAssessment {
      const domains = Object.freeze(retentionDomains.map((domain) => assessDomain(domain)));
      return Object.freeze({
        version: DATA_RETENTION_VERSION,
        status: worstStatus(domains.map((domain) => domain.status)),
        domains,
        gaps: retentionBudgetGaps,
      });
    },
    exportDomain: buildExport,
    planCleanup,
    applyCleanup,
  });
}
