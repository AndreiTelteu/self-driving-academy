import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DATA_RETENTION_BUDGET,
  DATA_RETENTION_VERSION,
  PersistenceError,
  createDataRetention,
  resolveRetentionQuotas,
  retentionDomains,
} from '../../src/persistence/index';
import type {
  DataRetention,
  RetentionArtifact,
  RetentionCleanupResult,
  RetentionDomain,
  RetentionDomainQuota,
  RetentionExportDocument,
  RetentionRejection,
} from '../../src/persistence/index';
import { INTERVENTION_LIMITS } from '../../src/telemetry/index';
import {
  FIXTURE_ACTIVE_CHECKPOINT,
  FIXTURE_CLIP_A,
  FIXTURE_INTERVENTION_DEDUP_LEDGER,
  FIXTURE_PROFILE,
  FIXTURE_PROGRESS,
  FIXTURE_PROTECTED_IDS,
  FIXTURE_REPLAY_DEDUP_LEDGER,
  combinedInventory,
  protectedOnlyInventory,
} from './data-retention-fixtures';
import { runDataRetentionReport } from './data-retention-report';

/**
 * PBI 132 target tests: the two domains keep separate byte quotas, a full quota offers an export
 * before any selective deletion, protected rows survive, a partial clip is declared, and eviction
 * is deterministic. Nothing here measures a machine: the numbers are the declared fixture bytes.
 */

const MANIFEST = JSON.parse(
  readFileSync(new URL('../../Docs/performance-budgets.json', import.meta.url), 'utf8'),
) as {
  proposedCapacities: Record<string, number | null>;
  resourceAdmissionContracts: { workers: { persistenceIngressBytes: number } };
};

function quotas(): readonly RetentionDomainQuota[] {
  const resolved = resolveRetentionQuotas({
    recorderRamBytes: MANIFEST.proposedCapacities.recorderRamBytes,
    optionalReplayStorageBytes: MANIFEST.proposedCapacities.optionalReplayStorageBytes,
    persistenceIngressBytes: MANIFEST.resourceAdmissionContracts.workers.persistenceIngressBytes,
    interventionRecordStoreBytes: INTERVENTION_LIMITS.recordStoreBytes,
  });
  assert.equal(resolved.status, 'RESOLVED');
  return (resolved as { readonly quotas: readonly RetentionDomainQuota[] }).quotas;
}

function engine(
  artifacts: readonly RetentionArtifact[] = combinedInventory(),
  custom: readonly RetentionDomainQuota[] = quotas(),
): DataRetention {
  return createDataRetention({ artifacts, quotas: custom });
}

function rejectionOf(result: unknown): RetentionRejection {
  assert.equal((result as { readonly status?: unknown }).status, 'REJECTED');
  return result as RetentionRejection;
}

function applied(result: unknown): RetentionCleanupResult {
  const entry = result as RetentionCleanupResult;
  assert.equal(entry.status, 'APPLIED');
  return entry;
}

function cleanup(
  subject: DataRetention,
  domain: RetentionDomain,
  criterion: 'OLDEST_FIRST' | 'LARGEST_FIRST' | 'WHOLE_DOMAIN',
  extra: { readonly targetDbBytes?: number; readonly maxEvictions?: number } = {},
): { readonly plan: ReturnType<typeof planned>; readonly result: RetentionCleanupResult } {
  const exported = subject.exportDomain(domain);
  const plan = planned(subject, domain, criterion, exported, extra);
  const result = applied(subject.applyCleanup(plan));
  return { plan, result };
}

function planned(
  subject: DataRetention,
  domain: RetentionDomain,
  criterion: 'OLDEST_FIRST' | 'LARGEST_FIRST' | 'WHOLE_DOMAIN',
  exported: RetentionExportDocument,
  extra: { readonly targetDbBytes?: number; readonly maxEvictions?: number } = {},
) {
  const result = subject.planCleanup({
    domain,
    criterion,
    exportDigest: exported.checksum.value,
    ...extra,
  });
  if (result.status === 'REJECTED') throw new Error(result.message);
  return result.plan;
}

function usage(subject: DataRetention, domain: RetentionDomain) {
  const found = subject.assess().domains.find((entry) => entry.domain === domain);
  if (!found) throw new Error(`Missing usage for ${domain}`);
  return found;
}

test('132 the two domains have separate byte quotas read from the manifest and the 069 contract', () => {
  const resolved = quotas();
  assert.deepEqual(
    resolved.map((quota) => quota.domain),
    [...retentionDomains],
  );
  const telemetry = resolved[0]!;
  const recorder = resolved[1]!;
  assert.equal(telemetry.ram.bytes, INTERVENTION_LIMITS.recordStoreBytes);
  assert.equal(telemetry.ram.provenance, 'CONTRACT_LIMIT');
  assert.equal(
    telemetry.db.bytes,
    MANIFEST.resourceAdmissionContracts.workers.persistenceIngressBytes,
  );
  assert.equal(recorder.ram.bytes, MANIFEST.proposedCapacities.recorderRamBytes);
  assert.equal(recorder.db.bytes, MANIFEST.proposedCapacities.optionalReplayStorageBytes);
  assert.equal(recorder.ram.provenance, 'MANIFEST');
  assert.equal(recorder.db.provenance, 'MANIFEST');
  /* A quota is a byte count with a named source, never a duration. */
  assert.deepEqual(Object.keys(recorder.ram).sort(), ['bytes', 'key', 'note', 'provenance']);
  assert.equal(
    resolved.some((quota) => 'seconds' in quota),
    false,
  );
  assert.equal(DATA_RETENTION_BUDGET.source, 'Docs/performance-budgets.json');
});

test('132 a missing budget is a declared refusal, never an unbounded quota', () => {
  const missing = resolveRetentionQuotas({
    recorderRamBytes: null,
    optionalReplayStorageBytes: MANIFEST.proposedCapacities.optionalReplayStorageBytes,
    persistenceIngressBytes: MANIFEST.resourceAdmissionContracts.workers.persistenceIngressBytes,
    interventionRecordStoreBytes: INTERVENTION_LIMITS.recordStoreBytes,
  });
  const denied = rejectionOf(missing);
  assert.equal(denied.code, 'QUOTA_MISSING');
  assert.equal(denied.path, 'proposedCapacities.recorderRamBytes');

  const invalid = resolveRetentionQuotas({
    recorderRamBytes: Number.POSITIVE_INFINITY,
    optionalReplayStorageBytes: 1,
    persistenceIngressBytes: 1,
    interventionRecordStoreBytes: 1,
  });
  assert.equal(rejectionOf(invalid).code, 'QUOTA_MISSING');
});

test('132 the engine refuses a single shared quota or an invalid inventory', () => {
  assert.throws(
    () =>
      createDataRetention({
        artifacts: combinedInventory(),
        quotas: [quotas()[0]!],
      }),
    (error: unknown) =>
      error instanceof PersistenceError &&
      error.code === 'INVALID_RECORD' &&
      error.path === '$.quotas',
  );
  const base: RetentionArtifact = {
    artifactId: 'dup',
    domain: 'WORLD_RECORDER',
    kind: 'REPLAY_CHUNK',
    sequence: 1,
    ramBytes: 1,
    dbBytes: 1,
    clipId: null,
    clipSequence: null,
    protection: null,
    status: 'COMPLETE',
  };
  assert.throws(
    () => engine([base, { ...base }]),
    (error: unknown) =>
      error instanceof PersistenceError && /Duplicate artifact id/.test(error.message),
  );
  assert.throws(
    () => engine([{ ...base, domain: 'INTERVENTION_TELEMETRY' }]),
    (error: unknown) => error instanceof PersistenceError && /not owned by/.test(error.message),
  );
  assert.throws(
    () => engine([{ ...base, ramBytes: -1 }]),
    (error: unknown) => error instanceof PersistenceError && /RAM bytes/.test(error.message),
  );
  assert.throws(
    () => engine([{ ...base, kind: 'PROTECTED_ROW' }]),
    (error: unknown) => error instanceof PersistenceError && /protection class/.test(error.message),
  );
});

test('132 a full quota offers an export and refuses any cleanup before the copy exists', () => {
  const subject = engine();
  const before = subject.inventory();
  const assessment = subject.assess();
  assert.equal(assessment.status, 'EXCEEDED');
  assert.equal(usage(subject, 'WORLD_RECORDER').status, 'EXCEEDED');
  assert.equal(usage(subject, 'INTERVENTION_TELEMETRY').status, 'EXCEEDED');

  const denied = subject.planCleanup({
    domain: 'WORLD_RECORDER',
    criterion: 'OLDEST_FIRST',
    exportDigest: null,
  });
  assert.equal(rejectionOf(denied).code, 'EXPORT_REQUIRED');
  assert.deepEqual(subject.inventory(), before, 'nothing is deleted without an export');

  const exported = subject.exportDomain('WORLD_RECORDER');
  assert.equal(exported.format, 'self-driving-academy-retention-export');
  assert.equal(exported.formatVersion, 1);
  assert.equal(exported.contract, DATA_RETENTION_VERSION);
  assert.equal(exported.reason, 'QUOTA_EXCEEDED');
  assert.match(exported.checksum.value, /^[0-9a-f]{64}$/);
  assert.equal(exported.checksum.algorithm, 'SHA-256');
  assert.equal(exported.checksum.canonicalization, 'SDA-CJSON-1');
  assert.equal(exported.totals.artifacts, 13);
  assert.equal(exported.totals.ramBytes, usage(subject, 'WORLD_RECORDER').ramBytes);
  assert.equal(
    exported.artifacts.some((artifact) => artifact.domain !== 'WORLD_RECORDER'),
    false,
    'an export contains exactly one domain',
  );

  const foreign = subject.planCleanup({
    domain: 'WORLD_RECORDER',
    criterion: 'OLDEST_FIRST',
    exportDigest: subject.exportDomain('INTERVENTION_TELEMETRY').checksum.value,
  });
  assert.equal(rejectionOf(foreign).code, 'EXPORT_MISMATCH');
  assert.deepEqual(subject.inventory(), before);
});

test('132 the world recorder quota evicts the oldest rows and declares the trimmed clip partial', () => {
  const subject = engine();
  const before = subject.assess();
  const { plan, result } = cleanup(subject, 'WORLD_RECORDER', 'OLDEST_FIRST');

  assert.equal(plan.criterion, 'OLDEST_FIRST');
  assert.deepEqual(
    result.evicted.map((eviction) => eviction.artifactId),
    ['checkpoint:superseded-1', 'checkpoint:superseded-2', `${FIXTURE_CLIP_A}:0`],
    'age order is the numeric sequence, then the artifact id',
  );
  assert.equal(result.evictedBytes.ram, 4 * 1024 * 1024 + 2 * 64 * 1024);
  assert.equal(usage(subject, 'WORLD_RECORDER').status, 'WITHIN');
  assert.ok(
    usage(subject, 'WORLD_RECORDER').ramBytes <= usage(subject, 'WORLD_RECORDER').ramCapBytes,
  );

  /* Only the part of clip A that is still stored must be declared PARTIAL. */
  const partials = result.partials;
  assert.deepEqual(
    partials.map((partial) => partial.artifactId),
    [`${FIXTURE_CLIP_A}:1`, `${FIXTURE_CLIP_A}:2`, `${FIXTURE_CLIP_A}:3`, `${FIXTURE_CLIP_A}:4`],
  );
  assert.ok(
    partials.every(
      (partial) =>
        partial.status === 'PARTIAL' &&
        partial.reasons.length === 1 &&
        partial.reasons[0] === 'RETENTION_EVICTED' &&
        partial.missingSequences.length === 1 &&
        partial.missingSequences[0] === 0,
    ),
  );
  assert.equal(
    subject
      .inventory()
      .filter((artifact) => artifact.clipId === 'clip:incident-b')
      .every((artifact) => artifact.status === 'COMPLETE'),
    true,
    'a clip that was not trimmed stays COMPLETE',
  );

  /* Protected rows are byte-identical and still in the inventory. */
  for (const id of FIXTURE_PROTECTED_IDS)
    assert.notEqual(
      subject.inventory().find((artifact) => artifact.artifactId === id),
      undefined,
      `${id} survives`,
    );
  assert.equal(
    result.usageAfter.ramBytes,
    result.usageBefore.ramBytes - result.evictedBytes.ram + 0,
    'the retained bytes are exactly the old bytes minus the evicted bytes',
  );
  assert.equal(before.status, 'EXCEEDED');
});

test('132 the telemetry quota evicts the largest rows first and respects the DB cap', () => {
  const subject = engine();
  const { plan, result } = cleanup(subject, 'INTERVENTION_TELEMETRY', 'LARGEST_FIRST');

  assert.equal(plan.criterion, 'LARGEST_FIRST');
  assert.deepEqual(
    plan.evictions.map((eviction) => eviction.artifactId),
    ['intervention-segment:0', 'intervention-segment:1', 'intervention-segment:2'],
  );
  const after = usage(subject, 'INTERVENTION_TELEMETRY');
  assert.ok(after.dbBytes <= after.dbCapBytes);
  assert.equal(after.status, 'WITHIN');
  assert.equal(result.partials.length, 0, 'whole clips were removed, so no clip is partial');
  assert.equal(result.evictedBytes.db, 3 * 2_621_440);
  /* The other domain is byte-identical. */
  assert.equal(
    usage(subject, 'WORLD_RECORDER').ramBytes,
    usage(engine(), 'WORLD_RECORDER').ramBytes,
  );
});

test('132 an explicit size target leaves a sealed telemetry clip declared PARTIAL', () => {
  const subject = engine();
  const exported = subject.exportDomain('INTERVENTION_TELEMETRY');
  const plan = planned(subject, 'INTERVENTION_TELEMETRY', 'LARGEST_FIRST', exported, {
    targetDbBytes: 4 * 1024 * 1024,
  });
  const result = applied(subject.applyCleanup(plan));

  assert.deepEqual(result.evicted.map((eviction) => eviction.artifactId).slice(-2), [
    'telemetry-chunk:ride-0',
    'telemetry-chunk:ride-1',
  ]);
  assert.deepEqual(
    result.partials.map((partial) => ({
      artifactId: partial.artifactId,
      status: partial.status,
      reasons: [...partial.reasons],
      missingSequences: [...partial.missingSequences],
    })),
    [
      {
        artifactId: 'telemetry-chunk:ride-2',
        status: 'PARTIAL',
        reasons: ['RETENTION_EVICTED'],
        missingSequences: [0, 1],
      },
      {
        artifactId: 'telemetry-chunk:ride-3',
        status: 'PARTIAL',
        reasons: ['RETENTION_EVICTED'],
        missingSequences: [0, 1],
      },
    ],
  );
  assert.equal(subject.exportDomain('INTERVENTION_TELEMETRY').totals.partialArtifacts, 2);
});

test('132 the whole-domain criterion removes every evictable row of that domain only', () => {
  const subject = engine();
  const worldBefore = usage(subject, 'WORLD_RECORDER');
  const { result } = cleanup(subject, 'INTERVENTION_TELEMETRY', 'WHOLE_DOMAIN');

  assert.equal(result.evicted.length, 10);
  assert.equal(result.usageAfter.evictableArtifacts, 0);
  assert.equal(result.usageAfter.protectedArtifacts, 2);
  assert.deepEqual(
    subject
      .inventory()
      .filter((artifact) => artifact.domain === 'INTERVENTION_TELEMETRY')
      .map((artifact) => artifact.artifactId)
      .sort(),
    [FIXTURE_PROFILE, FIXTURE_INTERVENTION_DEDUP_LEDGER].sort(),
  );
  assert.deepEqual(usage(subject, 'WORLD_RECORDER'), worldBefore);
});

test('132 profile, progress, the active checkpoint and dedup ledgers survive a full quota', () => {
  const subject = engine(protectedOnlyInventory());
  const telemetry = usage(subject, 'INTERVENTION_TELEMETRY');
  const world = usage(subject, 'WORLD_RECORDER');
  assert.equal(telemetry.status, 'PROTECTED_OVERFLOW');
  assert.equal(world.status, 'PROTECTED_OVERFLOW');

  const exported = subject.exportDomain('INTERVENTION_TELEMETRY');
  const plan = planned(subject, 'INTERVENTION_TELEMETRY', 'OLDEST_FIRST', exported);
  assert.equal(plan.evictions.length, 0, 'a plan never contains a protected row');

  const denied = rejectionOf(subject.applyCleanup(plan));
  assert.equal(denied.code, 'NOTHING_TO_EVICT');
  assert.deepEqual(
    subject.inventory().map((artifact) => artifact.artifactId),
    [
      FIXTURE_PROFILE,
      FIXTURE_INTERVENTION_DEDUP_LEDGER,
      FIXTURE_ACTIVE_CHECKPOINT,
      FIXTURE_PROGRESS,
      FIXTURE_REPLAY_DEDUP_LEDGER,
    ],
  );
  assert.equal(subject.assess().status, 'PROTECTED_OVERFLOW');
});

test('132 a forged plan and a replayed plan are refused without deleting anything', () => {
  const subject = engine();
  const exported = subject.exportDomain('WORLD_RECORDER');
  const plan = planned(subject, 'WORLD_RECORDER', 'OLDEST_FIRST', exported);
  const before = subject.inventory();

  const forged = subject.applyCleanup({
    ...plan,
    evictions: [
      {
        artifactId: FIXTURE_REPLAY_DEDUP_LEDGER,
        kind: 'PROTECTED_ROW',
        sequence: 32,
        ramBytes: 4 * 1024,
        dbBytes: 8 * 1024,
      },
    ],
  });
  assert.equal(rejectionOf(forged).code, 'PLAN_UNKNOWN');
  assert.deepEqual(subject.inventory(), before);

  const stranger = engine(protectedOnlyInventory());
  const foreignPlan = planned(
    stranger,
    'WORLD_RECORDER',
    'OLDEST_FIRST',
    stranger.exportDomain('WORLD_RECORDER'),
  );
  assert.equal(rejectionOf(subject.applyCleanup(foreignPlan)).code, 'PLAN_UNKNOWN');

  applied(subject.applyCleanup(plan));
  const replay = rejectionOf(subject.applyCleanup(plan));
  assert.ok(['PLAN_STALE', 'PLAN_UNKNOWN'].includes(replay.code));
  assert.equal(
    subject.inventory().length,
    before.length - plan.evictions.length,
    'the first application is the only one that deleted rows',
  );
});

test('132 eviction is deterministic for the same input and independent of the input order', () => {
  const forward = cleanup(engine(), 'WORLD_RECORDER', 'OLDEST_FIRST');
  const reversedInventory = [...combinedInventory()].reverse();
  const reversed = cleanup(engine(reversedInventory), 'WORLD_RECORDER', 'OLDEST_FIRST');

  assert.equal(forward.result.evicted.length, reversed.result.evicted.length);
  assert.deepEqual(forward.result.evicted, reversed.result.evicted);
  assert.deepEqual(forward.result.partials, reversed.result.partials);
  assert.equal(forward.result.digest, reversed.result.digest);
  assert.equal(forward.plan.digest, reversed.plan.digest);

  /* A different criterion is a different plan, not a hidden default. */
  const bySize = cleanup(engine(), 'WORLD_RECORDER', 'LARGEST_FIRST');
  assert.notEqual(bySize.plan.digest, forward.plan.digest);
});

test('132 the report transcript is deterministic and every declared check passes', () => {
  const first = runDataRetentionReport();
  const second = runDataRetentionReport();
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(
    first.summary.pass,
    true,
    JSON.stringify(first.checks.filter((check) => !check.pass)),
  );
  assert.equal(first.summary.passed, first.summary.checks);
  assert.equal(first.checks.length, 19);
  assert.equal(
    first.checks.some((check) => check.name.startsWith('determinism:')),
    true,
  );
  assert.equal(
    first.protectedOnly.missingAfter.length,
    0,
    'the protected rows are still present after a protected-only overflow',
  );
});
