import assert from 'node:assert/strict';
import test from 'node:test';
import {
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

const DB = '128-profile-transaction-db';

interface Harness {
  readonly factory: MemoryIdbFactory;
  readonly locks: MemoryLockManager;
  readonly repository: LocalRepository;
}

function harness(tabId = 'tab-a'): Harness {
  const factory = createMemoryIdbFactory();
  const locks = createMemoryLockManager();
  const repository = createLocalRepository({
    factory,
    locks,
    dbName: DB,
    tabId,
    now: fixedClock(),
  });
  return { factory, locks, repository };
}

async function opened(tabId = 'tab-a'): Promise<Harness> {
  const setup = harness(tabId);
  const report = await setup.repository.open();
  assert.equal(report.status, 'READY');
  assert.equal(report.role, 'WRITER');
  return setup;
}

/** A derived version produced by a manual intervention: no driving segment is named. */
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

/** A derived version produced from learned driving. */
function learnedVersion(): ProfileVersion {
  const content: ProfileVersionContent = {
    schemaVersion: 1,
    units: 'SI',
    profileId: 'profile-1',
    versionId: 'profile-1@3',
    parentVersionId: 'profile-1@1',
    engineVersion: 'engine-127',
    parameters: { speed: 11 },
    provenance: {
      origin: 'DERIVED',
      sourceSegmentIds: ['segment-9'],
      sourceInterventionIds: [],
      delta: {
        baseVersionId: 'profile-1@1',
        validationVersion: '102-candidate-v1',
        segmentId: 'segment-9',
        interventionId: null,
        reason: 'learned demonstration',
        keyCount: 1,
        changes: [{ key: 'speed', unit: 'm/s', previousValue: 10, newValue: 11 }],
      },
    },
    sourceSegmentIds: ['segment-9'],
    depth: 1,
    createdAt: '2026-10-22T09:06:00.000Z',
  };
  return Object.freeze({ ...content, checksum: computeProfileVersionChecksum(content) });
}

test('128 the version and its activation are committed by one transaction', async () => {
  const { repository } = await opened();
  const outcome = await repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation(),
  });
  assert.equal(outcome.status, 'COMMITTED');
  assert.equal(outcome.status === 'COMMITTED' ? outcome.value.versionCreated : false, true);
  assert.equal(outcome.status === 'COMMITTED' ? outcome.value.activationChanged : false, true);
  assert.equal(outcome.status === 'COMMITTED' ? outcome.value.source : null, 'BASE');

  const stored = await repository.getProfile('profile-1@1');
  assert.equal(stored?.versionId, 'profile-1@1');
  assert.equal(stored?.checksum, profileVersion().checksum);
  const pointer = await repository.getActivation('profile-1');
  assert.equal(pointer?.versionId, 'profile-1@1');
  assert.equal(pointer?.sequence, 1);
  const stats = await repository.stats();
  assert.equal(stats.counts.profiles, 1);
  assert.equal(stats.counts.profileActivations, 1);
  repository.close();
});

test('128 a crash before the commit leaves no version and no activation', async () => {
  const { repository } = await opened();
  const first = await repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation(),
  });
  assert.equal(first.status, 'COMMITTED');

  const crashed = await repository.commitProfileActivation(
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
  assert.equal(crashed.status, 'REJECTED');
  assert.equal(
    crashed.status === 'REJECTED' ? crashed.rejection.code : null,
    'TRANSACTION_ABORTED',
  );

  // Nothing of the crashed call survived: the version is absent and the pointer still names the
  // first version, so the active profile is still loadable.
  assert.equal(await repository.getProfile('profile-1@2'), null);
  assert.equal((await repository.getActivation('profile-1'))?.versionId, 'profile-1@1');
  const stats = await repository.stats();
  assert.equal(stats.counts.profiles, 1);
  assert.equal(stats.counts.profileActivations, 1);
  repository.close();
});

test('128 a crash after the commit keeps both rows durable', async () => {
  const { repository } = await opened();
  const outcome = await repository.commitProfileActivation(
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
  assert.equal(outcome.status, 'CRASHED_AFTER_COMMIT');

  const stored = await repository.getProfile('profile-1@1');
  assert.equal(stored?.versionId, 'profile-1@1');
  assert.equal((await repository.getActivation('profile-1'))?.versionId, 'profile-1@1');
  const history = await repository.getProfileHistory('profile-1');
  assert.equal(history.activeVersion?.versionId, 'profile-1@1');
  assert.equal(history.complete, true);
  repository.close();
});

test('128 an activation without its version is refused', async () => {
  const { repository } = await opened();
  const outcome = await repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation({ versionId: 'profile-1@9' }),
  });
  assert.equal(outcome.status, 'REJECTED');
  assert.equal(outcome.status === 'REJECTED' ? outcome.rejection.code : null, 'REFERENCE_MISSING');
  const stats = await repository.stats();
  assert.equal(stats.counts.profiles, 0);
  assert.equal(stats.counts.profileActivations, 0);
  repository.close();
});

test('128 a derived version without its stored parent is refused', async () => {
  const { repository } = await opened();
  const outcome = await repository.commitProfileActivation({
    profile: manualTuningVersion(),
    activation: activation({ versionId: 'profile-1@2', sequence: 2 }),
  });
  assert.equal(outcome.status, 'REJECTED');
  assert.equal(outcome.status === 'REJECTED' ? outcome.rejection.code : null, 'REFERENCE_MISSING');
  assert.equal(await repository.getProfile('profile-1@2'), null);
  repository.close();
});

test('128 a stored version is immutable', async () => {
  const { repository } = await opened();
  await repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation(),
  });
  const outcome = await repository.commitProfileActivation({
    profile: profileVersion({ parameters: { speed: 99 } }),
    activation: activation({ sequence: 2 }),
  });
  assert.equal(outcome.status, 'REJECTED');
  assert.equal(outcome.status === 'REJECTED' ? outcome.rejection.code : null, 'IMMUTABLE_RECORD');
  assert.equal((await repository.getProfile('profile-1@1'))?.parameters.speed, 10);
  repository.close();
});

test('128 an older activation sequence cannot replace a newer active version', async () => {
  const { repository } = await opened();
  await repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation({ sequence: 5 }),
  });
  const outcome = await repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation({ sequence: 2 }),
  });
  assert.equal(outcome.status, 'REJECTED');
  assert.equal(outcome.status === 'REJECTED' ? outcome.rejection.code : null, 'STALE_REVISION');
  assert.equal((await repository.getActivation('profile-1'))?.sequence, 5);
  repository.close();
});

test('128 the same activation sequence cannot point at another version', async () => {
  const { repository } = await opened();
  await repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation({ sequence: 5 }),
  });
  await repository.commitProfileActivation({
    profile: manualTuningVersion(),
    activation: activation({ versionId: 'profile-1@2', sequence: 6 }),
  });
  const outcome = await repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation({ sequence: 6 }),
  });
  assert.equal(outcome.status, 'REJECTED');
  assert.equal(outcome.status === 'REJECTED' ? outcome.rejection.code : null, 'STALE_REVISION');
  assert.equal((await repository.getActivation('profile-1'))?.versionId, 'profile-1@2');
  repository.close();
});

test('128 the same commit twice is idempotent', async () => {
  const { repository } = await opened();
  const first = await repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation(),
  });
  const second = await repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation(),
  });
  assert.equal(first.status, 'COMMITTED');
  assert.equal(second.status, 'COMMITTED');
  assert.equal(second.status === 'COMMITTED' ? second.value.versionCreated : true, false);
  assert.equal(second.status === 'COMMITTED' ? second.value.activationChanged : true, false);
  const stats = await repository.stats();
  assert.equal(stats.counts.profiles, 1);
  assert.equal(stats.counts.profileActivations, 1);
  repository.close();
});

test('128 the history keeps the chain, the active version and the provenance', async () => {
  const { repository } = await opened();
  await repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation({ sequence: 1 }),
  });
  await repository.commitProfileActivation({
    profile: manualTuningVersion(),
    activation: activation({ versionId: 'profile-1@2', sequence: 2 }),
  });
  const history = await repository.getProfileHistory('profile-1');
  assert.deepEqual(
    history.chain.map((entry) => entry.versionId),
    ['profile-1@1', 'profile-1@2'],
  );
  assert.equal(history.versions.length, 2);
  assert.equal(history.activeVersionId, 'profile-1@2');
  assert.equal(history.activeVersion?.depth, 1);
  assert.equal(history.activationSequence, 2);
  assert.equal(history.activatedAt, '2026-10-22T09:00:00.000Z');
  assert.equal(history.source, 'MANUAL_TUNING');
  assert.equal(history.complete, true);
  assert.deepEqual(history.missingVersionIds, []);

  // The stored provenance is read back exactly as it was written.
  const stored = await repository.getProfile('profile-1@2');
  assert.deepEqual(stored?.provenance.sourceInterventionIds, ['intervention-1']);
  assert.equal(stored?.provenance.delta?.reason, 'manual tuning');
  assert.equal(stored?.parentVersionId, 'profile-1@1');
  assert.equal(stored?.createdAt, '2026-10-22T09:05:00.000Z');
  repository.close();
});

test('128 a learned version keeps its segment provenance', async () => {
  const { repository } = await opened();
  await repository.commitProfileActivation({
    profile: profileVersion(),
    activation: activation({ sequence: 1 }),
  });
  await repository.commitProfileActivation({
    profile: learnedVersion(),
    activation: activation({ versionId: 'profile-1@3', sequence: 3 }),
  });
  const history = await repository.getProfileHistory('profile-1');
  assert.equal(history.source, 'LEARNING');
  const stored = await repository.getProfile('profile-1@3');
  assert.deepEqual(stored?.provenance.sourceSegmentIds, ['segment-9']);
  assert.deepEqual(stored?.sourceSegmentIds, ['segment-9']);
  repository.close();
});

test('128 a page without the writer lock cannot commit a version', async () => {
  const factory = createMemoryIdbFactory();
  const locks = createMemoryLockManager();
  const first = createLocalRepository({
    factory,
    locks,
    dbName: DB,
    tabId: 'tab-a',
    now: fixedClock(),
  });
  await first.open();
  const second = createLocalRepository({
    factory,
    locks,
    dbName: DB,
    tabId: 'tab-b',
    now: fixedClock(),
  });
  await second.open();
  const outcome = await second.commitProfileActivation({
    profile: profileVersion(),
    activation: activation(),
  });
  assert.equal(outcome.status, 'REJECTED');
  assert.equal(outcome.status === 'REJECTED' ? outcome.rejection.code : null, 'WRITER_REQUIRED');
  assert.equal((await first.stats()).counts.profiles, 0);
  first.close();
  second.close();
});
