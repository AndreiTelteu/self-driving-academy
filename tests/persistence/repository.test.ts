import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PERSISTENCE_SCHEMA_VERSION,
  createLocalRepository,
  createMemoryIdbFactory,
  createMemoryLockManager,
  planUpgrade,
} from '../../src/persistence/index';
import type {
  LocalRepository,
  MemoryIdbFactory,
  MemoryLockManager,
} from '../../src/persistence/index';
import {
  activation,
  checkpointRecord,
  derivedProfile,
  fixedClock,
  profileVersion,
  progressRecord,
  scenarioRecord,
  segmentRecord,
  settingsSnapshot,
} from './fixtures';

const DB = 'repository-db';

interface Harness {
  readonly factory: MemoryIdbFactory;
  readonly locks: MemoryLockManager;
  readonly repository: LocalRepository;
}

/** One origin: every tab of the same browser shares the factory and the lock manager. */
type Origin = Pick<Harness, 'factory' | 'locks'>;

function harness(tabId = 'tab-a', maxListEntries?: number, shared?: Origin): Harness {
  const factory = shared?.factory ?? createMemoryIdbFactory();
  const locks = shared?.locks ?? createMemoryLockManager();
  const repository = createLocalRepository({
    factory,
    locks,
    dbName: DB,
    tabId,
    now: fixedClock(),
    ...(maxListEntries === undefined ? {} : { maxListEntries }),
  });
  return { factory, locks, repository };
}

async function opened(tabId = 'tab-a', shared?: Origin): Promise<Harness> {
  const setup = harness(tabId, undefined, shared);
  const report = await setup.repository.open();
  assert.equal(report.status, 'READY');
  assert.equal(report.role, 'WRITER');
  return setup;
}

test('127 a fresh database opens at the current schema with the writer role', async () => {
  const { factory, repository } = await opened();
  const report = await repository.open();
  assert.equal(report.version, PERSISTENCE_SCHEMA_VERSION);
  assert.deepEqual(report.appliedMigrations, [
    '127-v1-base-layout',
    '127-v2-checkpoints-and-lifecycle-indexes',
  ]);
  assert.equal(report.previousVersion, 0);
  assert.equal(report.rejection, null);
  const status = repository.status();
  assert.equal(status.state, 'READY');
  assert.equal(status.role, 'WRITER');
  assert.equal(status.version, 2);
  assert.equal(status.database, DB);
  assert.equal(factory.inspect(DB)?.version, 2);
  const stats = await repository.stats();
  assert.equal(stats.counts.checkpoints, 0);
  assert.equal(stats.writes, 0);
  repository.close();
  assert.equal(repository.status().state, 'CLOSED');
  assert.deepEqual(factory.databaseNames(), [DB]);
});

test('127 every store round-trips and survives a reopen', async () => {
  const first = await opened();
  const profile = profileVersion();
  const derived = derivedProfile();
  assert.equal((await first.repository.putProfile(profile)).status, 'COMMITTED');
  assert.equal((await first.repository.putProfile(derived)).status, 'COMMITTED');
  assert.equal((await first.repository.activateProfile(activation())).status, 'COMMITTED');
  assert.equal((await first.repository.putSegment(segmentRecord())).status, 'COMMITTED');
  assert.equal((await first.repository.putScenario(scenarioRecord())).status, 'COMMITTED');
  assert.equal((await first.repository.putProgress(progressRecord())).status, 'COMMITTED');
  assert.equal((await first.repository.putSettings(settingsSnapshot())).status, 'COMMITTED');
  assert.equal((await first.repository.putCheckpoint(checkpointRecord())).status, 'COMMITTED');

  assert.equal((await first.repository.listProfiles('profile-1')).length, 2);
  assert.deepEqual(
    (await first.repository.listProfiles('profile-1')).map((entry) => entry.versionId),
    ['profile-1@1', 'profile-1@2'],
  );
  assert.equal((await first.repository.getProfile('profile-1@2'))?.depth, 1);
  assert.equal(await first.repository.getProfile('missing'), null);
  assert.equal((await first.repository.getActivation('profile-1'))?.versionId, 'profile-1@1');
  const segment = await first.repository.getSegment('segment-1');
  assert.equal(segment?.status, 'OPEN');
  assert.deepEqual(segment?.body, { startTick: 0, controlMode: 'MANUAL', samples: 0 });
  assert.equal((await first.repository.listSegments('session-1')).length, 1);
  assert.equal((await first.repository.listSegments('session-2')).length, 0);
  assert.equal((await first.repository.listSegmentsByStatus('OPEN')).length, 1);
  assert.equal((await first.repository.listSegmentsByStatus('CLOSED')).length, 0);
  assert.equal((await first.repository.getScenario('scenario-1'))?.recordKind, 'SCENARIO');
  assert.equal((await first.repository.getProgress('mission-instance-1'))?.status, 'ACTIVE');
  assert.equal((await first.repository.getSettings('player-1'))?.units.speed, 'km/h');
  assert.equal((await first.repository.getCheckpoint('checkpoint-1'))?.tick, 120);
  const stats = await first.repository.stats();
  assert.deepEqual(stats.counts, {
    meta: 1,
    profiles: 2,
    profileActivations: 1,
    segments: 1,
    scenarios: 1,
    progress: 1,
    settings: 1,
    checkpoints: 1,
  });
  first.repository.close();

  const second = harness('tab-a', undefined, first);
  const reopened = await second.repository.open();
  assert.equal(reopened.status, 'READY');
  assert.equal((await second.repository.getSegment('segment-1'))?.recordId, 'segment-1');
  assert.equal((await second.repository.getActivation('profile-1'))?.sequence, 1);
  second.repository.close();
});

test('127 an activation cannot reference a missing or foreign profile version', async () => {
  const { repository } = await opened();
  const missing = await repository.activateProfile(activation({ versionId: 'profile-1@9' }));
  assert.equal(missing.status, 'REJECTED');
  if (missing.status === 'REJECTED') assert.equal(missing.rejection.code, 'REFERENCE_MISSING');
  assert.equal(await repository.getActivation('profile-1'), null);

  assert.equal((await repository.putProfile(profileVersion())).status, 'COMMITTED');
  const foreign = await repository.activateProfile(
    activation({ profileId: 'profile-2', versionId: 'profile-1@1' }),
  );
  assert.equal(foreign.status, 'REJECTED');
  if (foreign.status === 'REJECTED') assert.equal(foreign.rejection.code, 'REFERENCE_MISSING');
  const stored = await repository.getActivation('profile-1');
  assert.equal(stored, null);
  repository.close();
});

test('127 a rejected activation keeps the previous activation instead of half-writing', async () => {
  const { repository } = await opened();
  await repository.putProfile(profileVersion());
  await repository.putProfile(derivedProfile());
  assert.equal((await repository.activateProfile(activation({ sequence: 2 }))).status, 'COMMITTED');
  const stale = await repository.activateProfile(
    activation({ sequence: 1, versionId: 'profile-1@2' }),
  );
  assert.equal(stale.status, 'REJECTED');
  if (stale.status === 'REJECTED') assert.equal(stale.rejection.code, 'STALE_REVISION');
  const current = await repository.getActivation('profile-1');
  assert.equal(current?.sequence, 2);
  assert.equal(current?.versionId, 'profile-1@1');
  const duplicate = await repository.activateProfile(activation({ sequence: 2 }));
  assert.equal(duplicate.status, 'COMMITTED');
  if (duplicate.status === 'COMMITTED') assert.equal(duplicate.value.sequence, 2);
  repository.close();
});

test('127 stale revisions, immutable profiles and oversized bodies are rejected', async () => {
  const { repository } = await opened();
  assert.equal((await repository.putProfile(profileVersion())).status, 'COMMITTED');
  const conflicting = await repository.putProfile({
    ...profileVersion(),
    checksum: 'fnv1a64:0000000000000000',
  });
  assert.equal(conflicting.status, 'REJECTED');
  if (conflicting.status === 'REJECTED')
    assert.equal(conflicting.rejection.code, 'PROFILE_CHECKSUM_MISMATCH');

  assert.equal((await repository.putSegment(segmentRecord({ revision: 2 }))).status, 'COMMITTED');
  const stale = await repository.putSegment(segmentRecord({ revision: 2 }));
  assert.equal(stale.status, 'REJECTED');
  if (stale.status === 'REJECTED') assert.equal(stale.rejection.code, 'STALE_REVISION');
  const newer = await repository.putSegment(
    segmentRecord({ revision: 3, status: 'CLOSED', body: { startTick: 0, closed: true } }),
  );
  assert.equal(newer.status, 'COMMITTED');
  assert.equal((await repository.getSegment('segment-1'))?.revision, 3);
  assert.equal((await repository.listSegmentsByStatus('OPEN')).length, 0);
  assert.equal((await repository.listSegmentsByStatus('CLOSED')).length, 1);

  const tooLarge = await repository.putScenario(
    scenarioRecord({ body: { blob: 'x'.repeat(300_000) } }),
  );
  assert.equal(tooLarge.status, 'REJECTED');
  if (tooLarge.status === 'REJECTED') assert.equal(tooLarge.rejection.code, 'BODY_TOO_LARGE');
  assert.equal(await repository.getScenario('scenario-1'), null);
  repository.close();
});

test('127 list results are bounded by an explicit row budget', async () => {
  const setup = harness('tab-a', 2);
  assert.equal((await setup.repository.open()).status, 'READY');
  for (const id of ['a', 'b', 'c']) {
    const result = await setup.repository.putSegment(
      segmentRecord({ recordId: `segment-${id}`, body: { id } }),
    );
    assert.equal(result.status, 'COMMITTED');
  }
  await assert.rejects(
    setup.repository.listSegments('session-1'),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'LIST_LIMIT',
  );
  setup.repository.close();
});

test('127 a read-only page reads the writer data but cannot write', async () => {
  const writer = await opened('tab-a');
  const reader = harness('tab-b', undefined, writer);
  const report = await reader.repository.open();
  assert.equal(report.status, 'READY');
  assert.equal(report.role, 'READ_ONLY');

  assert.equal((await writer.repository.putSegment(segmentRecord())).status, 'COMMITTED');
  assert.equal((await reader.repository.getSegment('segment-1'))?.recordId, 'segment-1');
  const denied = await reader.repository.putSegment(segmentRecord({ revision: 2 }));
  assert.equal(denied.status, 'REJECTED');
  if (denied.status === 'REJECTED') assert.equal(denied.rejection.code, 'WRITER_REQUIRED');
  assert.equal((await writer.repository.stats()).counts.segments, 1);
  writer.repository.close();
  reader.repository.close();
});

test('127 the writer role transfers when the holder releases it', async () => {
  const first = await opened('tab-a');
  const second = harness('tab-b', undefined, first);
  assert.equal((await second.repository.open()).role, 'READ_ONLY');

  const waiting = second.repository.waitForWriter();
  assert.equal(second.repository.status().role, 'WAITING');
  const released = first.repository.releaseWriter();
  assert.equal(released.role, 'RELEASED');
  const claimed = await waiting;
  assert.equal(claimed.role, 'WRITER');
  assert.equal(second.repository.status().role, 'WRITER');

  assert.equal((await second.repository.putScenario(scenarioRecord())).status, 'COMMITTED');
  const denied = await first.repository.putScenario(scenarioRecord());
  assert.equal(denied.status, 'REJECTED');
  if (denied.status === 'REJECTED') assert.equal(denied.rejection.code, 'WRITER_REQUIRED');
  second.repository.close();
  first.repository.close();
});

test('127 a blocked upgrade is a repository state and finishes after retry', async () => {
  const factory = createMemoryIdbFactory();
  const legacy = await factory.open({
    name: DB,
    version: 1,
    plan: (fromVersion) => planUpgrade(fromVersion, 1),
    now: fixedClock(),
  });
  assert.equal(legacy.status, 'OPENED');
  if (legacy.status !== 'OPENED') return;
  await legacy.database.transact(['segments'], 'readwrite', (transaction) =>
    transaction.put('segments', segmentRecord()),
  );

  const locks = createMemoryLockManager();
  const repository = createLocalRepository({
    factory,
    locks,
    dbName: DB,
    tabId: 'tab-a',
    now: fixedClock(),
  });
  const blocked = await repository.open();
  assert.equal(blocked.status, 'BLOCKED_UPGRADE');
  assert.equal(blocked.rejection?.code, 'UPGRADE_BLOCKED');
  assert.equal(repository.status().state, 'BLOCKED_UPGRADE');
  assert.equal(repository.status().role, 'NONE');
  const denied = await repository.putSegment(segmentRecord({ revision: 2 }));
  assert.equal(denied.status, 'REJECTED');
  if (denied.status === 'REJECTED') assert.equal(denied.rejection.code, 'REPOSITORY_CLOSED');
  assert.equal((await repository.stats()).blockedUpgrades, 1);

  legacy.database.close();
  const upgraded = await repository.retryBlockedUpgrade();
  assert.equal(upgraded.status, 'READY');
  assert.equal(upgraded.version, 2);
  assert.equal(upgraded.role, 'WRITER');
  assert.equal((await repository.getSegment('segment-1'))?.recordId, 'segment-1');
  repository.close();
});

test('127 a version change releases the database and the writer lock', async () => {
  const setup = await opened('tab-a');
  assert.equal(setup.factory.openConnections(DB), 1);
  setup.factory.notifyVersionChange(DB, 3);
  const status = setup.repository.status();
  assert.equal(status.state, 'RELEASED_FOR_UPGRADE');
  assert.equal(status.reason, 'VERSION_CHANGE');
  assert.equal(status.role, 'NONE');
  assert.equal(setup.factory.openConnections(DB), 0);
  const denied = await setup.repository.putSegment(segmentRecord());
  assert.equal(denied.status, 'REJECTED');
  if (denied.status === 'REJECTED') assert.equal(denied.rejection.code, 'REPOSITORY_CLOSED');
  assert.equal((await setup.repository.stats()).versionChanges, 1);
  const reopened = await setup.repository.open();
  assert.equal(reopened.status, 'READY');
  setup.repository.close();
});

test('127 an open failure and unavailable Web Locks are explicit states', async () => {
  const factory = createMemoryIdbFactory();
  factory.failNextOpen();
  const failing = createLocalRepository({
    factory,
    locks: createMemoryLockManager(),
    dbName: DB,
    now: fixedClock(),
  });
  const failed = await failing.open();
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.rejection?.code, 'OPEN_FAILED');
  assert.equal(failing.status().state, 'FAILED');
  failing.close();

  const recovered = createLocalRepository({
    factory,
    locks: createMemoryLockManager(),
    dbName: DB,
    now: fixedClock(),
  });
  assert.equal((await recovered.open()).status, 'READY');
  recovered.close();

  const unlocked = createLocalRepository({
    factory,
    locks: createMemoryLockManager({ available: false }),
    dbName: DB,
    now: fixedClock(),
  });
  const readOnly = await unlocked.open();
  assert.equal(readOnly.status, 'READY');
  assert.equal(readOnly.role, 'READ_ONLY');
  const denied = await unlocked.putSegment(segmentRecord());
  assert.equal(denied.status, 'REJECTED');
  if (denied.status === 'REJECTED') assert.equal(denied.rejection.code, 'WRITER_REQUIRED');
  unlocked.close();
});

test('127 the newest checkpoint of a session is picked by tick then generation', async () => {
  const { repository } = await opened();
  for (const entry of [
    checkpointRecord({ checkpointId: 'cp-1', tick: 100, generation: 1 }),
    checkpointRecord({ checkpointId: 'cp-2', tick: 300, generation: 2 }),
    checkpointRecord({ checkpointId: 'cp-3', tick: 300, generation: 3 }),
    checkpointRecord({ checkpointId: 'cp-4', sessionId: 'session-2', tick: 900, generation: 1 }),
  ]) {
    assert.equal((await repository.putCheckpoint(entry)).status, 'COMMITTED');
  }
  assert.equal((await repository.latestCheckpoint('session-1'))?.checkpointId, 'cp-3');
  assert.equal((await repository.latestCheckpoint('session-2'))?.checkpointId, 'cp-4');
  assert.equal(await repository.latestCheckpoint('session-3'), null);
  const stale = await repository.putCheckpoint(
    checkpointRecord({ checkpointId: 'cp-3', tick: 300, generation: 1 }),
  );
  assert.equal(stale.status, 'REJECTED');
  if (stale.status === 'REJECTED') assert.equal(stale.rejection.code, 'STALE_REVISION');
  const removed = await repository.deleteCheckpoint('cp-1');
  assert.equal(removed.status, 'COMMITTED');
  if (removed.status === 'COMMITTED') assert.equal(removed.value.deleted, true);
  assert.equal(await repository.getCheckpoint('cp-1'), null);
  assert.equal((await repository.deleteRecord('segments', 'missing')).status, 'COMMITTED');
  repository.close();
});
