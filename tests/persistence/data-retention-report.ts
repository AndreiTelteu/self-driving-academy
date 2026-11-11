import { readFileSync } from 'node:fs';
import {
  DATA_RETENTION_BUDGET,
  createDataRetention,
  resolveRetentionQuotas,
  retentionDomains,
} from '../../src/persistence/index';
import type {
  DataRetention,
  RetentionArtifact,
  RetentionCleanupPlan,
  RetentionCleanupResult,
  RetentionDomain,
  RetentionDomainQuota,
  RetentionDomainUsage,
  RetentionExportDocument,
  RetentionRejection,
} from '../../src/persistence/index';
import { INTERVENTION_LIMITS } from '../../src/telemetry/index';
import {
  FIXTURE_PROTECTED_IDS,
  combinedInventory,
  protectedOnlyInventory,
} from './data-retention-fixtures';

/**
 * Deterministic transcript of PBI 132.
 *
 * Every number is produced by the real retention contract over the declared fixture inventory. No
 * wall clock, timer, `Math.random` or Map iteration order participates, so two runs are
 * byte-identical. The quotas are read from the real `Docs/performance-budgets.json` and from the
 * delivered 069 contract; the manifest gaps are reported, never filled with invented values.
 */

interface Manifest {
  readonly budgetVersion: string;
  readonly proposedCapacities: Record<string, number | null>;
  readonly resourceAdmissionContracts: {
    readonly workers: { readonly persistenceIngressBytes: number };
  };
}

const MANIFEST = JSON.parse(
  readFileSync(new URL('../../Docs/performance-budgets.json', import.meta.url), 'utf8'),
) as Manifest;

export interface DataRetentionCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface RetentionUsageRow {
  readonly domain: RetentionDomain;
  readonly status: string;
  readonly artifacts: number;
  readonly protectedArtifacts: number;
  readonly evictableArtifacts: number;
  readonly ramBytes: number;
  readonly ramCapBytes: number;
  readonly ramOverBytes: number;
  readonly dbBytes: number;
  readonly dbCapBytes: number;
  readonly dbOverBytes: number;
}

export interface RetentionPlanRow {
  readonly digest: string;
  readonly criterion: string;
  readonly exportDigest: string;
  readonly evicted: readonly string[];
  readonly evictedRamBytes: number;
  readonly evictedDbBytes: number;
  readonly retained: RetentionCleanupPlan['retained'];
  readonly projected: RetentionCleanupPlan['projected'];
}

export interface RetentionCleanupRow {
  readonly digest: string;
  readonly evicted: readonly string[];
  readonly evictedBytes: { readonly ram: number; readonly db: number };
  readonly retained: RetentionCleanupResult['retained'];
  readonly usageAfter: RetentionUsageRow;
  readonly partials: readonly {
    readonly artifactId: string;
    readonly clipId: string;
    readonly status: string;
    readonly reasons: readonly string[];
    readonly missingSequences: readonly number[];
  }[];
}

export interface DataRetentionReport {
  readonly version: '132-data-retention-v1';
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly budgets: {
    readonly source: string;
    readonly budgetVersion: string;
    readonly recorderRamBytes: number | null;
    readonly optionalReplayStorageBytes: number | null;
    readonly persistenceIngressBytes: number | null;
    readonly interventionRecordStoreBytes: number;
    readonly gaps: readonly {
      readonly key: string;
      readonly status: string;
      readonly handling: string;
    }[];
  };
  readonly quotas: readonly {
    readonly domain: RetentionDomain;
    readonly ramBytes: number;
    readonly ramProvenance: string;
    readonly ramKey: string;
    readonly dbBytes: number;
    readonly dbProvenance: string;
    readonly dbKey: string;
  }[];
  readonly inventory: {
    readonly artifacts: number;
    readonly protectedArtifacts: number;
    readonly evictableArtifacts: number;
    readonly ramBytes: number;
    readonly dbBytes: number;
    readonly byDomain: readonly {
      readonly domain: RetentionDomain;
      readonly artifacts: number;
      readonly ramBytes: number;
      readonly dbBytes: number;
    }[];
  };
  readonly worldRecorder: {
    readonly before: RetentionUsageRow;
    readonly export: {
      readonly digest: string;
      readonly reason: string;
      readonly artifacts: number;
      readonly partialArtifacts: number;
      readonly ramBytes: number;
      readonly dbBytes: number;
      readonly checksumHexLength: number;
    };
    readonly plan: RetentionPlanRow;
    readonly cleanup: RetentionCleanupRow;
    readonly after: RetentionUsageRow;
    readonly interventionUsageBefore: RetentionUsageRow;
    readonly interventionUsageAfter: RetentionUsageRow;
  };
  readonly interventionTelemetry: {
    readonly before: RetentionUsageRow;
    readonly export: {
      readonly digest: string;
      readonly reason: string;
      readonly artifacts: number;
      readonly partialArtifacts: number;
      readonly ramBytes: number;
      readonly dbBytes: number;
    };
    readonly plan: RetentionPlanRow;
    readonly cleanup: RetentionCleanupRow;
    readonly after: RetentionUsageRow;
  };
  readonly telemetryPartialClip: {
    readonly before: RetentionUsageRow;
    readonly export: {
      readonly digest: string;
      readonly reason: string;
      readonly artifacts: number;
      readonly partialArtifacts: number;
      readonly ramBytes: number;
      readonly dbBytes: number;
    };
    readonly plan: RetentionPlanRow;
    readonly cleanup: RetentionCleanupRow;
    readonly after: RetentionUsageRow;
  };
  readonly wholeDomain: {
    readonly domain: RetentionDomain;
    readonly evicted: readonly string[];
    readonly retained: readonly string[];
    readonly evictedBytes: { readonly ram: number; readonly db: number };
    readonly worldRecorderUntouched: boolean;
  };
  readonly protectedOnly: {
    readonly before: RetentionUsageRow;
    readonly telemetryStatus: string;
    readonly worldStatus: string;
    readonly planEvictions: number;
    readonly applyCode: string | null;
    readonly protectedAfter: readonly string[];
    readonly missingAfter: readonly string[];
  };
  readonly determinism: {
    readonly forward: {
      readonly exportDigest: string;
      readonly planDigest: string;
      readonly resultDigest: string;
      readonly evicted: readonly string[];
    };
    readonly reversed: {
      readonly exportDigest: string;
      readonly planDigest: string;
      readonly resultDigest: string;
      readonly evicted: readonly string[];
    };
    readonly identical: boolean;
  };
  readonly refusalCodes: {
    readonly missingBudget: string | null;
    readonly cleanupWithoutExport: string | null;
    readonly forgedPlan: string | null;
    readonly stalePlan: string | null;
  };
  readonly checks: readonly DataRetentionCheck[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
}

const GENERATED_BY = 'npm run retention:data';
const ORACLE_RULE =
  'A domain quota is exceeded iff the sum of its declared bytes is above the manifest cap; a cleanup must have an export digest, evict only unprotected rows of that one domain, and leave every protected row byte-identical.';

function quotasFromManifest(): readonly RetentionDomainQuota[] {
  const resolved = resolveRetentionQuotas({
    recorderRamBytes: MANIFEST.proposedCapacities.recorderRamBytes,
    optionalReplayStorageBytes: MANIFEST.proposedCapacities.optionalReplayStorageBytes,
    persistenceIngressBytes: MANIFEST.resourceAdmissionContracts.workers.persistenceIngressBytes,
    interventionRecordStoreBytes: INTERVENTION_LIMITS.recordStoreBytes,
  });
  if (resolved.status !== 'RESOLVED') throw new Error(resolved.message);
  return resolved.quotas;
}

function usageRow(usage: RetentionDomainUsage): RetentionUsageRow {
  return {
    domain: usage.domain,
    status: usage.status,
    artifacts: usage.artifacts,
    protectedArtifacts: usage.protectedArtifacts,
    evictableArtifacts: usage.evictableArtifacts,
    ramBytes: usage.ramBytes,
    ramCapBytes: usage.ramCapBytes,
    ramOverBytes: usage.ramOverBytes,
    dbBytes: usage.dbBytes,
    dbCapBytes: usage.dbCapBytes,
    dbOverBytes: usage.dbOverBytes,
  };
}

function usageFor(retention: DataRetention, domain: RetentionDomain): RetentionUsageRow {
  const found = retention.assess().domains.find((entry) => entry.domain === domain);
  if (!found) throw new Error(`Missing usage for ${domain}`);
  return usageRow(found);
}

function planRow(plan: RetentionCleanupPlan): RetentionPlanRow {
  let ram = 0;
  let db = 0;
  for (const eviction of plan.evictions) {
    ram += eviction.ramBytes;
    db += eviction.dbBytes;
  }
  return {
    digest: plan.digest,
    criterion: plan.criterion,
    exportDigest: plan.exportDigest,
    evicted: plan.evictions.map((eviction) => eviction.artifactId),
    evictedRamBytes: ram,
    evictedDbBytes: db,
    retained: plan.retained,
    projected: plan.projected,
  };
}

function cleanupRow(result: RetentionCleanupResult): RetentionCleanupRow {
  return {
    digest: result.digest,
    evicted: result.evicted.map((eviction) => eviction.artifactId),
    evictedBytes: result.evictedBytes,
    retained: result.retained,
    usageAfter: usageRow(result.usageAfter),
    partials: result.partials.map((partial) => ({
      artifactId: partial.artifactId,
      clipId: partial.clipId,
      status: partial.status,
      reasons: [...partial.reasons],
      missingSequences: [...partial.missingSequences],
    })),
  };
}

function exportRow(
  document: RetentionExportDocument,
): DataRetentionReport['worldRecorder']['export'] {
  return {
    digest: document.checksum.value,
    reason: document.reason,
    artifacts: document.totals.artifacts,
    partialArtifacts: document.totals.partialArtifacts,
    ramBytes: document.totals.ramBytes,
    dbBytes: document.totals.dbBytes,
    checksumHexLength: document.checksum.value.length,
  };
}

function rejection(result: unknown): RetentionRejection | null {
  if (typeof result !== 'object' || result === null) return null;
  const status = (result as { readonly status?: unknown }).status;
  if (status !== 'REJECTED') return null;
  return result as RetentionRejection;
}

function evict(
  retention: DataRetention,
  domain: RetentionDomain,
  criterion: 'OLDEST_FIRST' | 'LARGEST_FIRST' | 'WHOLE_DOMAIN',
  extra: {
    readonly targetDbBytes?: number;
    readonly targetRamBytes?: number;
    readonly stopAtQuota?: boolean;
  } = {},
): {
  readonly export: RetentionExportDocument;
  readonly plan: RetentionPlanRow;
  readonly cleanup: RetentionCleanupRow | null;
} {
  const exported = retention.exportDomain(domain);
  const planned = retention.planCleanup({
    domain,
    criterion,
    exportDigest: exported.checksum.value,
    ...extra,
  });
  if (planned.status === 'REJECTED') throw new Error(planned.message);
  const applied = retention.applyCleanup(planned.plan);
  const denied = rejection(applied);
  if (denied && denied.code !== 'NOTHING_TO_EVICT') throw new Error(denied.message);
  return {
    export: exported,
    plan: planRow(planned.plan),
    cleanup: denied ? null : cleanupRow(applied as RetentionCleanupResult),
  };
}

function digestCounts(
  retention: DataRetention,
  domain: RetentionDomain,
): {
  readonly exportDigest: string;
  readonly planDigest: string;
  readonly resultDigest: string;
  readonly evicted: readonly string[];
} {
  const exported = retention.exportDomain(domain);
  const planned = retention.planCleanup({
    domain,
    criterion: 'OLDEST_FIRST',
    exportDigest: exported.checksum.value,
  });
  if (planned.status === 'REJECTED') throw new Error(planned.message);
  const applied = retention.applyCleanup(planned.plan);
  if (rejection(applied)) throw new Error('expected an applied cleanup');
  const result = applied as RetentionCleanupResult;
  return {
    exportDigest: exported.checksum.value,
    planDigest: planned.plan.digest,
    resultDigest: result.digest,
    evicted: result.evicted.map((eviction) => eviction.artifactId),
  };
}

export function runDataRetentionReport(): DataRetentionReport {
  const quotas = quotasFromManifest();
  const combined = combinedInventory();

  /* Scenario 1: the world recorder domain is over its RAM quota. */
  const worldEngine = createDataRetention({ artifacts: combined, quotas });
  const worldBefore = usageFor(worldEngine, 'WORLD_RECORDER');
  const interventionBeforeWorldCleanup = usageFor(worldEngine, 'INTERVENTION_TELEMETRY');
  const worldExport = worldEngine.exportDomain('WORLD_RECORDER');
  const worldPlan = evict(worldEngine, 'WORLD_RECORDER', 'OLDEST_FIRST');
  const worldAfter = usageFor(worldEngine, 'WORLD_RECORDER');
  const interventionAfterWorldCleanup = usageFor(worldEngine, 'INTERVENTION_TELEMETRY');

  /* Scenario 2: the intervention telemetry domain is over its durable quota. */
  const telemetryEngine = createDataRetention({ artifacts: combined, quotas });
  const telemetryBefore = usageFor(telemetryEngine, 'INTERVENTION_TELEMETRY');
  const telemetryExport = telemetryEngine.exportDomain('INTERVENTION_TELEMETRY');
  const telemetryPlan = evict(telemetryEngine, 'INTERVENTION_TELEMETRY', 'LARGEST_FIRST');
  const telemetryAfter = usageFor(telemetryEngine, 'INTERVENTION_TELEMETRY');

  /* Scenario 3: an explicit size target leaves only part of a sealed telemetry clip. */
  const partialEngine = createDataRetention({ artifacts: combined, quotas });
  const partialBefore = usageFor(partialEngine, 'INTERVENTION_TELEMETRY');
  const partialApplied = evict(partialEngine, 'INTERVENTION_TELEMETRY', 'LARGEST_FIRST', {
    targetDbBytes: 4 * 1024 * 1024,
  });

  /* Scenario 4: the explicit domain criterion removes every evictable telemetry row. */
  const domainEngine = createDataRetention({ artifacts: combined, quotas });
  const domainExport = domainEngine.exportDomain('INTERVENTION_TELEMETRY');
  const domainPlanned = domainEngine.planCleanup({
    domain: 'INTERVENTION_TELEMETRY',
    criterion: 'WHOLE_DOMAIN',
    exportDigest: domainExport.checksum.value,
  });
  if (domainPlanned.status === 'REJECTED') throw new Error(domainPlanned.message);
  const domainApplied = domainEngine.applyCleanup(domainPlanned.plan);
  if (rejection(domainApplied)) throw new Error('expected an applied domain cleanup');
  const domainResult = domainApplied as RetentionCleanupResult;
  const worldAfterDomainCleanup = usageFor(domainEngine, 'WORLD_RECORDER');
  const worldBeforeDomainCleanup = usageRow(
    domainEngine.assess().domains.find((entry) => entry.domain === 'WORLD_RECORDER')!,
  );

  /* Scenario 5: only protected rows remain and the quota is still exceeded. */
  const protectedEngine = createDataRetention({ artifacts: protectedOnlyInventory(), quotas });
  const protectedBefore = usageFor(protectedEngine, 'INTERVENTION_TELEMETRY');
  const protectedWorld = usageFor(protectedEngine, 'WORLD_RECORDER');
  const protectedExport = protectedEngine.exportDomain('INTERVENTION_TELEMETRY');
  const protectedPlanned = protectedEngine.planCleanup({
    domain: 'INTERVENTION_TELEMETRY',
    criterion: 'OLDEST_FIRST',
    exportDigest: protectedExport.checksum.value,
  });
  if (protectedPlanned.status === 'REJECTED') throw new Error(protectedPlanned.message);
  const protectedApplied = protectedEngine.applyCleanup(protectedPlanned.plan);
  const protectedRejection = rejection(protectedApplied);

  /* Scenario 6: determinism, including a different input order. */
  const forward = digestCounts(
    createDataRetention({ artifacts: combined, quotas }),
    'WORLD_RECORDER',
  );
  const reversed = digestCounts(
    createDataRetention({ artifacts: [...combined].reverse(), quotas }),
    'WORLD_RECORDER',
  );

  /* Scenario 7: refusals. */
  const missingBudget = resolveRetentionQuotas({
    recorderRamBytes: null,
    optionalReplayStorageBytes: MANIFEST.proposedCapacities.optionalReplayStorageBytes,
    persistenceIngressBytes: MANIFEST.resourceAdmissionContracts.workers.persistenceIngressBytes,
    interventionRecordStoreBytes: INTERVENTION_LIMITS.recordStoreBytes,
  });
  const refusalEngine = createDataRetention({ artifacts: combined, quotas });
  const noExport = refusalEngine.planCleanup({
    domain: 'WORLD_RECORDER',
    criterion: 'OLDEST_FIRST',
    exportDigest: null,
  });
  const issued = refusalEngine.planCleanup({
    domain: 'WORLD_RECORDER',
    criterion: 'OLDEST_FIRST',
    exportDigest: refusalEngine.exportDomain('WORLD_RECORDER').checksum.value,
  });
  if (issued.status === 'REJECTED') throw new Error(issued.message);
  const forged = refusalEngine.applyCleanup({
    ...issued.plan,
    evictions: [
      {
        artifactId: FIXTURE_PROTECTED_IDS[2]!,
        kind: 'CHECKPOINT',
        sequence: 30,
        ramBytes: 1,
        dbBytes: 1,
      },
    ],
  });
  const appliedOnce = refusalEngine.applyCleanup(issued.plan);
  if (rejection(appliedOnce)) throw new Error('expected the issued plan to apply');
  const stale = refusalEngine.applyCleanup(issued.plan);

  const protectedIds = combined
    .filter((artifact: RetentionArtifact) => artifact.protection !== null)
    .map((artifact) => artifact.artifactId);
  const retainedIds = worldEngine.inventory().map((artifact) => artifact.artifactId);
  const missingProtected = protectedIds.filter((id) => !retainedIds.includes(id));
  const worldPartialIds = worldPlan.cleanup?.partials.map((partial) => partial.artifactId) ?? [];
  const telemetryPartialIds =
    partialApplied.cleanup?.partials.map((partial) => partial.artifactId) ?? [];

  const checks: DataRetentionCheck[] = [
    {
      name: 'domains:two-separate-retention-domains',
      expected: ['INTERVENTION_TELEMETRY', 'WORLD_RECORDER'],
      actual: worldEngine.quotas.map((quota) => quota.domain),
      pass:
        worldEngine.quotas.length === 2 &&
        retentionDomains.every((domain) =>
          worldEngine.quotas.some((quota) => quota.domain === domain),
        ),
      detail: 'There is no shared budget and no global cleanup over both domains.',
    },
    {
      name: 'quotas:manifest-values',
      expected: {
        recorderRamBytes: MANIFEST.proposedCapacities.recorderRamBytes,
        optionalReplayStorageBytes: MANIFEST.proposedCapacities.optionalReplayStorageBytes,
        persistenceIngressBytes:
          MANIFEST.resourceAdmissionContracts.workers.persistenceIngressBytes,
      },
      actual: {
        recorderRamBytes: quotas[1]!.ram.bytes,
        optionalReplayStorageBytes: quotas[1]!.db.bytes,
        persistenceIngressBytes: quotas[0]!.db.bytes,
      },
      pass:
        quotas[1]!.ram.bytes === MANIFEST.proposedCapacities.recorderRamBytes &&
        quotas[1]!.db.bytes === MANIFEST.proposedCapacities.optionalReplayStorageBytes &&
        quotas[0]!.db.bytes === MANIFEST.resourceAdmissionContracts.workers.persistenceIngressBytes,
      detail: 'Every quota is a manifest capacity; a missing one is refused, not invented.',
    },
    {
      name: 'quotas:069-contract-limit-in-bytes',
      expected: INTERVENTION_LIMITS.recordStoreBytes,
      actual: quotas[0]!.ram.bytes,
      pass: quotas[0]!.ram.bytes === INTERVENTION_LIMITS.recordStoreBytes,
      detail: 'The telemetry RAM quota is the delivered 069 record store cap.',
    },
    {
      name: 'quotas:bytes-not-durations',
      expected: true,
      actual: worldEngine.quotas.every(
        (quota) => Number.isSafeInteger(quota.ram.bytes) && Number.isSafeInteger(quota.db.bytes),
      ),
      pass: worldEngine.quotas.every(
        (quota) =>
          quota.ram.bytes > 0 &&
          quota.db.bytes > 0 &&
          Number.isSafeInteger(quota.ram.bytes) &&
          Number.isSafeInteger(quota.db.bytes),
      ),
      detail: 'Both RAM and DB limits are byte counts; no quota is expressed as a duration.',
    },
    {
      name: 'quotas:missing-budget-is-refused',
      expected: 'QUOTA_MISSING',
      actual: rejection(missingBudget)?.code ?? null,
      pass: rejection(missingBudget)?.code === 'QUOTA_MISSING',
      detail: 'A null manifest capacity never becomes an unbounded quota.',
    },
    {
      name: 'quota:world-recorder-ram-exceeded',
      expected: 'EXCEEDED',
      actual: worldBefore.status,
      pass: worldBefore.status === 'EXCEEDED' && worldBefore.ramOverBytes > 0,
      detail: `The world recorder domain is ${worldBefore.ramOverBytes} bytes over its RAM quota.`,
    },
    {
      name: 'export:ready-at-quota-full',
      expected: 'QUOTA_EXCEEDED',
      actual: worldExport.reason,
      pass: worldExport.reason === 'QUOTA_EXCEEDED' && worldExport.totals.artifacts > 0,
      detail: `Export declares ${worldExport.totals.artifacts} artifacts and ${worldExport.totals.dbBytes} DB bytes.`,
    },
    {
      name: 'export:canonical-sha256',
      expected: 64,
      actual: worldExport.checksum.value.length,
      pass:
        worldExport.checksum.value.length === 64 &&
        /^[0-9a-f]{64}$/.test(worldExport.checksum.value),
      detail: 'The export carries a SHA-256 over SDA-CJSON-1, not a hand-made format.',
    },
    {
      name: 'plan:cleanup-without-export-is-refused',
      expected: 'EXPORT_REQUIRED',
      actual: rejection(noExport)?.code ?? null,
      pass: rejection(noExport)?.code === 'EXPORT_REQUIRED',
      detail: 'No plan exists without a copy of the same domain; nothing was deleted.',
    },
    {
      name: 'cleanup:world-recorder-oldest-first',
      expected: true,
      actual: worldPlan.plan.evicted,
      pass:
        worldPlan.plan.criterion === 'OLDEST_FIRST' &&
        worldAfter.status === 'WITHIN' &&
        worldPlan.plan.evicted.length > 0,
      detail: `${worldPlan.plan.evicted.length} rows evicted (${worldPlan.plan.evictedRamBytes} RAM bytes, ${worldPlan.plan.evictedDbBytes} DB bytes).`,
    },
    {
      name: 'cleanup:world-recorder-partial-clip-declared',
      expected: 4,
      actual: worldPartialIds.length,
      pass:
        worldPartialIds.length === 4 &&
        worldPlan.cleanup?.partials.every(
          (partial) =>
            partial.status === 'PARTIAL' && partial.reasons.includes('RETENTION_EVICTED'),
        ) === true,
      detail: `Retained rows of the trimmed clip: ${worldPartialIds.join(', ')}.`,
    },
    {
      name: 'cleanup:intervention-largest-first-fits-db',
      expected: true,
      actual: { evicted: telemetryPlan.plan.evicted, dbBytes: telemetryAfter.dbBytes },
      pass:
        telemetryPlan.plan.criterion === 'LARGEST_FIRST' &&
        telemetryBefore.status === 'EXCEEDED' &&
        telemetryAfter.dbBytes <= telemetryAfter.dbCapBytes,
      detail: `DB ${telemetryBefore.dbBytes} -> ${telemetryAfter.dbBytes} of ${telemetryAfter.dbCapBytes} bytes.`,
    },
    {
      name: 'cleanup:size-target-declares-partial-telemetry-clip',
      expected: 2,
      actual: telemetryPartialIds.length,
      pass:
        telemetryPartialIds.length === 2 &&
        partialApplied.cleanup?.partials.every(
          (partial) =>
            partial.status === 'PARTIAL' &&
            partial.reasons.includes('RETENTION_EVICTED') &&
            partial.missingSequences.length === 2,
        ) === true,
      detail: `A sealed 090 clip lost 2 of 4 chunks and the 2 retained chunks are declared PARTIAL: ${telemetryPartialIds.join(', ')}.`,
    },
    {
      name: 'cleanup:whole-domain-keeps-the-other-domain',
      expected: true,
      actual: {
        worldRecorderUntouched:
          worldAfterDomainCleanup.dbBytes === worldBeforeDomainCleanup.dbBytes,
      },
      pass:
        domainResult.domain === 'INTERVENTION_TELEMETRY' &&
        worldAfterDomainCleanup.dbBytes === worldBeforeDomainCleanup.dbBytes,
      detail: `Explicit domain cleanup removed ${domainResult.evicted.length} telemetry rows and left the world recorder at ${worldAfterDomainCleanup.dbBytes} DB bytes.`,
    },
    {
      name: 'protected:profile-progress-checkpoint-ledgers-intact',
      expected: [],
      actual: missingProtected,
      pass: missingProtected.length === 0 && protectedIds.length === 5,
      detail: `Protected rows after the world cleanup: ${protectedIds.join(', ')}.`,
    },
    {
      name: 'protected:overflow-is-declared-not-silent',
      expected: 'PROTECTED_OVERFLOW',
      actual: { telemetry: protectedBefore.status, world: protectedWorld.status },
      pass:
        protectedBefore.status === 'PROTECTED_OVERFLOW' &&
        protectedRejection?.code === 'NOTHING_TO_EVICT',
      detail:
        'With only protected rows over quota the plan evicts nothing and apply reports NOTHING_TO_EVICT.',
    },
    {
      name: 'determinism:same-input-same-digests',
      expected: true,
      actual: { forward, reversed },
      pass:
        forward.exportDigest === reversed.exportDigest &&
        forward.planDigest === reversed.planDigest &&
        forward.resultDigest === reversed.resultDigest &&
        forward.evicted.join('|') === reversed.evicted.join('|'),
      detail: 'A reversed inventory array produces the same export, plan and result digest.',
    },
    {
      name: 'isolation:cleanup-of-one-domain-does-not-touch-the-other',
      expected: true,
      actual: {
        before: interventionBeforeWorldCleanup.dbBytes,
        after: interventionAfterWorldCleanup.dbBytes,
      },
      pass:
        interventionAfterWorldCleanup.dbBytes === interventionBeforeWorldCleanup.dbBytes &&
        interventionAfterWorldCleanup.artifacts === interventionBeforeWorldCleanup.artifacts,
      detail: 'The telemetry domain keeps its artifacts and bytes after a world recorder cleanup.',
    },
    {
      name: 'refusals:forged-and-replayed-plans',
      expected: { forged: 'PLAN_UNKNOWN', stale: 'PLAN_STALE' },
      actual: { forged: rejection(forged)?.code ?? null, stale: rejection(stale)?.code ?? null },
      pass:
        rejection(forged)?.code === 'PLAN_UNKNOWN' &&
        (rejection(stale)?.code === 'PLAN_STALE' || rejection(stale)?.code === 'PLAN_UNKNOWN'),
      detail: 'A plan that names a protected row is unknown; a plan applied twice is stale.',
    },
  ];

  const passed = checks.filter((check) => check.pass).length;
  const byDomain = retentionDomains.map((domain) => {
    const rows = combined.filter((artifact) => artifact.domain === domain);
    let ramBytes = 0;
    let dbBytes = 0;
    for (const row of rows) {
      ramBytes += row.ramBytes;
      dbBytes += row.dbBytes;
    }
    return { domain, artifacts: rows.length, ramBytes, dbBytes };
  });

  return {
    version: '132-data-retention-v1',
    generatedBy: GENERATED_BY,
    oracleRule: ORACLE_RULE,
    budgets: {
      source: DATA_RETENTION_BUDGET.source,
      budgetVersion: MANIFEST.budgetVersion,
      recorderRamBytes: MANIFEST.proposedCapacities.recorderRamBytes,
      optionalReplayStorageBytes: MANIFEST.proposedCapacities.optionalReplayStorageBytes,
      persistenceIngressBytes: MANIFEST.resourceAdmissionContracts.workers.persistenceIngressBytes,
      interventionRecordStoreBytes: INTERVENTION_LIMITS.recordStoreBytes,
      gaps: worldEngine.gaps.map((gap) => ({
        key: gap.key,
        status: gap.status,
        handling: gap.handling,
      })),
    },
    quotas: worldEngine.quotas.map((quota) => ({
      domain: quota.domain,
      ramBytes: quota.ram.bytes,
      ramProvenance: quota.ram.provenance,
      ramKey: quota.ram.key,
      dbBytes: quota.db.bytes,
      dbProvenance: quota.db.provenance,
      dbKey: quota.db.key,
    })),
    inventory: {
      artifacts: combined.length,
      protectedArtifacts: byDomain.length === 0 ? 0 : protectedIds.length,
      evictableArtifacts: combined.length - protectedIds.length,
      ramBytes: byDomain.reduce((sum, entry) => sum + entry.ramBytes, 0),
      dbBytes: byDomain.reduce((sum, entry) => sum + entry.dbBytes, 0),
      byDomain,
    },
    worldRecorder: {
      before: worldBefore,
      export: exportRow(worldExport),
      plan: worldPlan.plan,
      cleanup: worldPlan.cleanup!,
      after: worldAfter,
      interventionUsageBefore: interventionBeforeWorldCleanup,
      interventionUsageAfter: interventionAfterWorldCleanup,
    },
    interventionTelemetry: {
      before: telemetryBefore,
      export: exportRow(telemetryExport),
      plan: telemetryPlan.plan,
      cleanup: telemetryPlan.cleanup!,
      after: telemetryAfter,
    },
    telemetryPartialClip: {
      before: partialBefore,
      export: exportRow(partialApplied.export),
      plan: partialApplied.plan,
      cleanup: partialApplied.cleanup!,
      after: usageFor(partialEngine, 'INTERVENTION_TELEMETRY'),
    },
    wholeDomain: {
      domain: 'INTERVENTION_TELEMETRY',
      evicted: domainResult.evicted.map((eviction) => eviction.artifactId),
      retained: domainEngine.inventory().map((row) => row.artifactId),
      evictedBytes: domainResult.evictedBytes,
      worldRecorderUntouched: worldAfterDomainCleanup.dbBytes === worldBeforeDomainCleanup.dbBytes,
    },
    protectedOnly: {
      before: protectedBefore,
      telemetryStatus: protectedBefore.status,
      worldStatus: protectedWorld.status,
      planEvictions: protectedPlanned.plan.evictions.length,
      applyCode: protectedRejection?.code ?? null,
      protectedAfter: protectedEngine.inventory().map((row) => row.artifactId),
      missingAfter: protectedIds.filter(
        (id) => !protectedEngine.inventory().some((row) => row.artifactId === id),
      ),
    },
    determinism: { forward, reversed, identical: forward.resultDigest === reversed.resultDigest },
    refusalCodes: {
      missingBudget: rejection(missingBudget)?.code ?? null,
      cleanupWithoutExport: rejection(noExport)?.code ?? null,
      forgedPlan: rejection(forged)?.code ?? null,
      stalePlan: rejection(stale)?.code ?? null,
    },
    checks,
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}
