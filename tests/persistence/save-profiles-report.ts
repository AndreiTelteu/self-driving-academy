import {
  PROFILE_TRANSACTION_VERSION,
  createLocalRepository,
  createMemoryIdbFactory,
  createMemoryLockManager,
} from '../../src/persistence/index';
import type {
  LocalRepository,
  MemoryIdbFactory,
  MemoryLockManager,
} from '../../src/persistence/index';
import { computeProfileVersionChecksum } from '../../src/profiles/index';
import type { ProfileVersion, ProfileVersionContent } from '../../src/profiles/index';
import { activation, fixedClock, profileVersion } from './fixtures';

/**
 * Deterministic transcript of PBI 128.
 *
 * Every value below is the result of a real run of the repository against the in-memory IndexedDB
 * double. There is no wall clock, no random identity and no timing value, so the committed
 * transcript can be re-verified byte for byte with `--check`.
 */
export interface ProfileTransactionCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface SaveProfilesReport {
  readonly version: '128-save-profiles-v1';
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly contract: string;
  readonly atomicCommit: {
    readonly status: string;
    readonly versionCreated: boolean;
    readonly activationChanged: boolean;
    readonly source: string;
    readonly bytes: number;
    readonly profileRows: number;
    readonly activationRows: number;
  };
  readonly crashBeforeCommit: {
    readonly status: string;
    readonly rejection: string | null;
    readonly profileRows: number;
    readonly activationRows: number;
    readonly activeVersionId: string | null;
    readonly activeVersionLoadable: boolean;
  };
  readonly crashAfterCommit: {
    readonly status: string;
    readonly profileRows: number;
    readonly activationRows: number;
    readonly activeVersionId: string | null;
    readonly activeVersionLoadable: boolean;
  };
  readonly guards: {
    readonly orphanActivation: string;
    readonly orphanRows: number;
    readonly missingParent: string;
    readonly immutableVersion: string;
    readonly staleSequence: string;
    readonly storedSequence: number;
    readonly sameSequenceOtherVersion: string;
    readonly readOnlyPage: string;
  };
  readonly history: {
    readonly chain: readonly string[];
    readonly versions: readonly string[];
    readonly activeVersionId: string | null;
    readonly activationSequence: number | null;
    readonly activatedAt: string | null;
    readonly source: string | null;
    readonly complete: boolean;
    readonly missingVersionIds: readonly string[];
    readonly interventionIds: readonly string[];
    readonly segmentIds: readonly string[];
    readonly parentVersionId: string | null;
    readonly createdAt: string | null;
    readonly idempotentVersionCreated: boolean;
    readonly idempotentActivationChanged: boolean;
  };
  readonly checks: readonly ProfileTransactionCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
  };
}

const DB = '128-save-profiles-db';

interface Harness {
  readonly factory: MemoryIdbFactory;
  readonly locks: MemoryLockManager;
  readonly repository: LocalRepository;
}

async function open(tabId: string): Promise<Harness> {
  const factory = createMemoryIdbFactory();
  const locks = createMemoryLockManager();
  const repository = createLocalRepository({
    factory,
    locks,
    dbName: DB,
    tabId,
    now: fixedClock(),
  });
  const report = await repository.open();
  if (report.status !== 'READY') throw new Error(`open failed: ${report.status}`);
  return { factory, locks, repository };
}

function manualTuningVersion(): ProfileVersion {
  const content: ProfileVersionContent = {
    schemaVersion: 1,
    units: 'SI',
    profileId: 'profile-1',
    versionId: 'profile-1@2',
    parentVersionId: 'profile-1@1',
    engineVersion: 'engine-127',
    parameters: { speed: 12 },
    provenance: {
      origin: 'DERIVED',
      sourceSegmentIds: [],
      sourceInterventionIds: ['intervention-1'],
      delta: {
        baseVersionId: 'profile-1@1',
        validationVersion: '102-candidate-v1',
        segmentId: 'segment-1',
        interventionId: 'intervention-1',
        reason: 'manual tuning',
        keyCount: 1,
        changes: [{ key: 'speed', unit: 'm/s', previousValue: 10, newValue: 12 }],
      },
    },
    sourceSegmentIds: [],
    depth: 1,
    createdAt: '2026-10-22T09:05:00.000Z',
  };
  return Object.freeze({ ...content, checksum: computeProfileVersionChecksum(content) });
}

export async function runSaveProfilesReport(): Promise<SaveProfilesReport> {
  const checks: ProfileTransactionCheck[] = [];
  const check = (name: string, expected: unknown, actual: unknown, detail: string): void => {
    const pass = JSON.stringify(expected) === JSON.stringify(actual);
    checks.push({ name, expected, actual, pass, detail });
  };

  // 1. One atomic commit of the version and the activation.
  const atomic = await open('tab-atomic');
  const committed = await atomic.repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation(),
  });
  const atomicStats = await atomic.repository.stats();
  const atomicValue = committed.status === 'REJECTED' ? null : committed.value;

  // 2. A crash before the commit: nothing of the call may survive.
  const crashBefore = await open('tab-crash-before');
  await crashBefore.repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation(),
  });
  const crashedBefore = await crashBefore.repository.commitProfileActivation(
    {
      profile: manualTuningVersion(),
      activation: activation({ versionId: 'profile-1@2', sequence: 2 }),
    },
    {
      beforeCommit: () => {
        throw new Error('simulated crash before commit');
      },
    },
  );
  const beforeStats = await crashBefore.repository.stats();
  const beforeActivation = await crashBefore.repository.getActivation('profile-1');
  const beforeActive = await crashBefore.repository.getProfile('profile-1@1');

  // 3. A crash after the commit: both rows are durable.
  const crashAfter = await open('tab-crash-after');
  const crashedAfter = await crashAfter.repository.commitProfileActivation(
    {
      profile: profileVersion(),
      activation: activation(),
    },
    {
      afterCommit: () => {
        throw new Error('simulated crash after commit');
      },
    },
  );
  const afterStats = await crashAfter.repository.stats();
  const afterActivation = await crashAfter.repository.getActivation('profile-1');
  const afterActive = await crashAfter.repository.getProfile('profile-1@1');

  // 4. The guards: orphan activation, missing parent, immutable version, stale sequence.
  const guards = await open('tab-guards');
  const orphan = await guards.repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation({ versionId: 'profile-1@9' }),
  });
  const orphanStats = await guards.repository.stats();
  const missingParent = await guards.repository.commitProfileActivation({
    profile: manualTuningVersion(),
    activation: activation({ versionId: 'profile-1@2', sequence: 2 }),
  });
  await guards.repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation({ sequence: 5 }),
  });
  const immutable = await guards.repository.commitProfileActivation({
    profile: profileVersion({ parameters: { speed: 99 } }),
    activation: activation({ sequence: 6 }),
  });
  const stale = await guards.repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation({ sequence: 2 }),
  });
  const storedActivation = await guards.repository.getActivation('profile-1');
  await guards.repository.commitProfileActivation({
    profile: manualTuningVersion(),
    activation: activation({ versionId: 'profile-1@2', sequence: 6 }),
  });
  const sameSequence = await guards.repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation({ sequence: 6 }),
  });

  // 5. A page without the writer lock.
  const readerFactory = createMemoryIdbFactory();
  const readerLocks = createMemoryLockManager();
  const writer = createLocalRepository({
    factory: readerFactory,
    locks: readerLocks,
    dbName: DB,
    tabId: 'tab-writer',
    now: fixedClock(),
  });
  await writer.open();
  const reader = createLocalRepository({
    factory: readerFactory,
    locks: readerLocks,
    dbName: DB,
    tabId: 'tab-reader',
    now: fixedClock(),
  });
  await reader.open();
  const readOnly = await reader.commitProfileActivation({
    profile: profileVersion(),
    activation: activation(),
  });
  writer.close();
  reader.close();

  // 6. The history, the provenance and the idempotency.
  const historyRun = await open('tab-history');
  await historyRun.repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation({ sequence: 1 }),
  });
  await historyRun.repository.commitProfileActivation({
    profile: manualTuningVersion(),
    activation: activation({ versionId: 'profile-1@2', sequence: 2 }),
  });
  const repeat = await historyRun.repository.commitProfileActivation({
    profile: manualTuningVersion(),
    activation: activation({ versionId: 'profile-1@2', sequence: 2 }),
  });
  const history = await historyRun.repository.getProfileHistory('profile-1');
  const storedDerived = await historyRun.repository.getProfile('profile-1@2');

  atomic.repository.close();
  crashBefore.repository.close();
  crashAfter.repository.close();
  guards.repository.close();
  historyRun.repository.close();

  const report: SaveProfilesReport = {
    version: '128-save-profiles-v1',
    generatedBy:
      'node --import ./scripts/register-typescript.mjs scripts/run-save-profiles-report.mjs',
    oracleRule:
      'Every row is a real run of src/persistence against the in-memory IndexedDB double; the expected value is the documented contract, never a copy of the actual one.',
    contract: PROFILE_TRANSACTION_VERSION,
    atomicCommit: {
      status: committed.status,
      versionCreated: atomicValue?.versionCreated ?? false,
      activationChanged: atomicValue?.activationChanged ?? false,
      source: atomicValue?.source ?? 'NONE',
      bytes: atomicValue?.bytes ?? 0,
      profileRows: atomicStats.counts.profiles,
      activationRows: atomicStats.counts.profileActivations,
    },
    crashBeforeCommit: {
      status: crashedBefore.status,
      rejection: crashedBefore.status === 'REJECTED' ? crashedBefore.rejection.code : null,
      profileRows: beforeStats.counts.profiles,
      activationRows: beforeStats.counts.profileActivations,
      activeVersionId: beforeActivation?.versionId ?? null,
      activeVersionLoadable: beforeActive !== null,
    },
    crashAfterCommit: {
      status: crashedAfter.status,
      profileRows: afterStats.counts.profiles,
      activationRows: afterStats.counts.profileActivations,
      activeVersionId: afterActivation?.versionId ?? null,
      activeVersionLoadable: afterActive !== null,
    },
    guards: {
      orphanActivation: orphan.status === 'REJECTED' ? orphan.rejection.code : orphan.status,
      orphanRows: orphanStats.counts.profiles + orphanStats.counts.profileActivations,
      missingParent:
        missingParent.status === 'REJECTED' ? missingParent.rejection.code : missingParent.status,
      immutableVersion:
        immutable.status === 'REJECTED' ? immutable.rejection.code : immutable.status,
      staleSequence: stale.status === 'REJECTED' ? stale.rejection.code : stale.status,
      storedSequence: storedActivation?.sequence ?? -1,
      sameSequenceOtherVersion:
        sameSequence.status === 'REJECTED' ? sameSequence.rejection.code : sameSequence.status,
      readOnlyPage: readOnly.status === 'REJECTED' ? readOnly.rejection.code : readOnly.status,
    },
    history: {
      chain: history.chain.map((entry) => entry.versionId),
      versions: history.versions.map((entry) => entry.versionId),
      activeVersionId: history.activeVersionId,
      activationSequence: history.activationSequence,
      activatedAt: history.activatedAt,
      source: history.source,
      complete: history.complete,
      missingVersionIds: history.missingVersionIds,
      interventionIds: storedDerived?.provenance.sourceInterventionIds ?? [],
      segmentIds: storedDerived?.provenance.sourceSegmentIds ?? [],
      parentVersionId: storedDerived?.parentVersionId ?? null,
      createdAt: storedDerived?.createdAt ?? null,
      idempotentVersionCreated: repeat.status === 'REJECTED' ? true : repeat.value.versionCreated,
      idempotentActivationChanged:
        repeat.status === 'REJECTED' ? true : repeat.value.activationChanged,
    },
    checks: [],
    summary: { checks: 0, passed: 0, pass: false },
  };

  check('contract-version', '128-profile-transaction-v1', report.contract, 'Contract id');
  check('atomic-status', 'COMMITTED', report.atomicCommit.status, 'One transaction, both rows');
  check(
    'atomic-version-created',
    true,
    report.atomicCommit.versionCreated,
    'The version row is new',
  );
  check(
    'atomic-activation-changed',
    true,
    report.atomicCommit.activationChanged,
    'The activation pointer moved',
  );
  check('atomic-source', 'BASE', report.atomicCommit.source, 'Provenance classification');
  check('atomic-profile-rows', 1, report.atomicCommit.profileRows, 'Exactly one version row');
  check(
    'atomic-activation-rows',
    1,
    report.atomicCommit.activationRows,
    'Exactly one activation row',
  );
  check('crash-before-status', 'REJECTED', report.crashBeforeCommit.status, 'The crash aborted it');
  check(
    'crash-before-rejection',
    'TRANSACTION_ABORTED',
    report.crashBeforeCommit.rejection,
    'Closed rejection code',
  );
  check(
    'crash-before-profile-rows',
    1,
    report.crashBeforeCommit.profileRows,
    'The interrupted version never landed',
  );
  check(
    'crash-before-activation-rows',
    1,
    report.crashBeforeCommit.activationRows,
    'The interrupted activation never landed',
  );
  check(
    'crash-before-active',
    'profile-1@1',
    report.crashBeforeCommit.activeVersionId,
    'The previous active version is still active',
  );
  check(
    'crash-before-loadable',
    true,
    report.crashBeforeCommit.activeVersionLoadable,
    'The active profile is still loadable',
  );
  check(
    'crash-after-status',
    'CRASHED_AFTER_COMMIT',
    report.crashAfterCommit.status,
    'The commit survived the crash',
  );
  check(
    'crash-after-profile-rows',
    1,
    report.crashAfterCommit.profileRows,
    'The version is durable',
  );
  check(
    'crash-after-activation-rows',
    1,
    report.crashAfterCommit.activationRows,
    'The activation is durable',
  );
  check(
    'crash-after-active',
    'profile-1@1',
    report.crashAfterCommit.activeVersionId,
    'The active version is the committed one',
  );
  check(
    'crash-after-loadable',
    true,
    report.crashAfterCommit.activeVersionLoadable,
    'The active profile loads',
  );
  check(
    'guard-orphan',
    'REFERENCE_MISSING',
    report.guards.orphanActivation,
    'An activation needs its version',
  );
  check('guard-orphan-rows', 0, report.guards.orphanRows, 'No orphan row was written');
  check(
    'guard-missing-parent',
    'REFERENCE_MISSING',
    report.guards.missingParent,
    'A derived version needs its parent',
  );
  check(
    'guard-immutable',
    'IMMUTABLE_RECORD',
    report.guards.immutableVersion,
    'A stored version cannot change',
  );
  check(
    'guard-stale',
    'STALE_REVISION',
    report.guards.staleSequence,
    'An older sequence cannot replace a newer one',
  );
  check('guard-stored-sequence', 5, report.guards.storedSequence, 'The newer activation survived');
  check(
    'guard-same-sequence',
    'STALE_REVISION',
    report.guards.sameSequenceOtherVersion,
    'One sequence points at one version',
  );
  check(
    'guard-read-only',
    'WRITER_REQUIRED',
    report.guards.readOnlyPage,
    'Only the writer page commits',
  );
  check(
    'history-chain',
    ['profile-1@1', 'profile-1@2'],
    report.history.chain,
    'The chain is rebuilt from the stored parents',
  );
  check(
    'history-versions',
    ['profile-1@1', 'profile-1@2'],
    report.history.versions,
    'Both versions are stored',
  );
  check('history-active', 'profile-1@2', report.history.activeVersionId, 'The active version');
  check('history-sequence', 2, report.history.activationSequence, 'The activation sequence');
  check(
    'history-activated-at',
    '2026-10-22T09:00:00.000Z',
    report.history.activatedAt,
    'The activation timestamp is kept',
  );
  check('history-source', 'MANUAL_TUNING', report.history.source, 'Provenance classification');
  check('history-complete', true, report.history.complete, 'No hole in the history');
  check('history-missing', [], report.history.missingVersionIds, 'No missing parent');
  check(
    'history-intervention-ids',
    ['intervention-1'],
    report.history.interventionIds,
    'The manual intervention source is kept',
  );
  check('history-segment-ids', [], report.history.segmentIds, 'No driving segment is invented');
  check('history-parent', 'profile-1@1', report.history.parentVersionId, 'The parent link is kept');
  check(
    'history-created-at',
    '2026-10-22T09:05:00.000Z',
    report.history.createdAt,
    'The version timestamp is kept',
  );
  check(
    'history-idempotent-version',
    false,
    report.history.idempotentVersionCreated,
    'The repeated commit creates no second version',
  );
  check(
    'history-idempotent-activation',
    false,
    report.history.idempotentActivationChanged,
    'The repeated commit moves no pointer',
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return {
    ...report,
    checks: Object.freeze(checks),
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}
