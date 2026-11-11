import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PERSISTENCE_LIMITS,
  PersistenceError,
  SESSION_ARCHIVE_LIMITS,
  createSessionArchiveStore,
  decodePlayerSave,
  parsePersistedRecord,
  readSessionArchive,
  stampSessionArchiveChecksum,
} from '../../src/persistence/index';
import type {
  LoadedPlayerSave,
  SessionArchiveComponents,
  SessionArchiveDocument,
} from '../../src/persistence/index';
import { scenarioRecord, activation, derivedProfile, profileVersion } from './fixtures';
import { openRepository } from './progress-save-fixture';
import {
  ARCHIVE_ACTIVATION_SEQUENCE,
  ARCHIVE_CHECKPOINT_ID,
  ARCHIVE_DB_NAME,
  ARCHIVE_PLAYER_ID,
  ARCHIVE_SESSION_ID,
  ARCHIVE_TARGET_DB_NAME,
  ARCHIVE_VERSION_ID,
  ARCHIVE_VERSIONS,
  ARCHIVE_WORLD_EPOCH,
  createArchiveHarness,
  exportArchive,
  openTransactionRunner,
  restamp,
  sessionFingerprint,
} from './session-archive-fixture';
import type { ArchiveHarness } from './session-archive-fixture';

const EXPECT = {
  sessionId: ARCHIVE_SESSION_ID,
  playerId: ARCHIVE_PLAYER_ID,
  versions: ARCHIVE_VERSIONS,
} as const;

function expectation(harness: ArchiveHarness) {
  return { ...EXPECT, catalog: harness.catalog };
}

async function readSave(harness: ArchiveHarness): Promise<LoadedPlayerSave> {
  const rows = await harness.repository.readPlayerSave(ARCHIVE_SESSION_ID, ARCHIVE_PLAYER_ID);
  return decodePlayerSave({
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    catalog: harness.catalog,
    rows,
  });
}

async function exportedDocument(harness: ArchiveHarness): Promise<SessionArchiveDocument> {
  return (await exportArchive(harness)).document;
}

/** A campaign row whose declared XP no longer matches its own replayed ledger. */
function tamperCampaignXp(document: SessionArchiveDocument): SessionArchiveComponents {
  const campaign = document.components.campaign;
  assert.notEqual(campaign, null);
  if (campaign === null) throw new Error('unreachable');
  const body = campaign.body as { counts: { xp: number } };
  return {
    ...document.components,
    campaign: Object.freeze({
      ...campaign,
      body: Object.freeze({
        ...campaign.body,
        counts: Object.freeze({ ...body.counts, xp: body.counts.xp + 1_000 }),
      }),
    }),
  };
}

test('135 an exported archive round-trips and replaces the session with the same generation', async () => {
  const harness = await createArchiveHarness();
  try {
    const exported = await exportArchive(harness);
    const document = exported.document;
    assert.equal(document.session.sessionId, ARCHIVE_SESSION_ID);
    assert.equal(document.session.playerId, ARCHIVE_PLAYER_ID);
    assert.equal(document.session.worldEpoch, ARCHIVE_WORLD_EPOCH);
    assert.equal(document.components.checkpoint?.checkpointId, ARCHIVE_CHECKPOINT_ID);
    assert.equal(document.components.progress?.recordId, `tracker:${ARCHIVE_SESSION_ID}`);
    assert.equal(document.components.campaign?.recordId, `campaign:${ARCHIVE_SESSION_ID}`);
    assert.equal(document.components.scenarios.length, 1);
    assert.equal(document.components.profile?.activeVersionId, ARCHIVE_VERSION_ID);
    assert.equal(document.components.profile?.activationSequence, ARCHIVE_ACTIVATION_SEQUENCE);
    assert.equal(exported.counts.campaignCompleted, 3);
    assert.equal(exported.counts.trackerInstances, 3);
    assert.equal(exported.sizes.limit, SESSION_ARCHIVE_LIMITS.maxTotalBytes);
    assert.equal(exported.sizes.total > 0, true);
    assert.equal(
      exported.sizes.total,
      exported.sizes.checkpoint +
        exported.sizes.progress +
        exported.sizes.campaign +
        exported.sizes.settings +
        exported.sizes.profile +
        exported.sizes.scenarios,
    );

    const text = JSON.stringify(document);
    const validated = readSessionArchive(text, expectation(harness));
    assert.equal(validated.status, 'ACCEPTED');
    if (validated.status !== 'ACCEPTED') return;
    assert.equal(validated.checksumVerified, true);
    assert.equal(validated.sizes.total, exported.sizes.total);
    assert.equal(validated.counts.xp, exported.counts.xp);
    assert.equal(validated.digests.campaign?.length, 64);

    const imported = await harness.archive.import({
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      document: text,
    });
    assert.equal(imported.status, 'COMMITTED');
    if (imported.status !== 'COMMITTED') return;
    assert.equal(imported.replacement.checkpointId, ARCHIVE_CHECKPOINT_ID);
    assert.deepEqual(imported.replacement.replaced, {
      progress: 2,
      scenarios: 1,
      checkpoints: 1,
      settings: true,
    });
    assert.equal(imported.replacement.progress.length, 2);
    assert.equal(imported.counts.xp, exported.counts.xp);
    assert.equal(imported.counts.rewardsGranted, exported.counts.rewardsGranted);

    const save = await readSave(harness);
    assert.equal(save.tracker?.digest, exported.document.components.progress?.body.digest);
    assert.equal(save.campaign?.digest, exported.document.components.campaign?.body.digest);
    assert.equal(save.campaign?.rewards.totals.xp, exported.counts.xp);
    assert.deepEqual(
      save.settings.input.bindings.throttle,
      harness.settings.input.bindings.throttle,
    );
    assert.equal(save.settings.units.speed, harness.settings.units.speed);
    const checkpoint = await harness.repository.latestCheckpoint(ARCHIVE_SESSION_ID);
    assert.equal(checkpoint?.checkpointId, ARCHIVE_CHECKPOINT_ID);
    assert.equal(checkpoint?.bodyBytes, exported.document.components.checkpoint?.bodyBytes);
    const scenarios = await harness.repository.listScenarios(ARCHIVE_SESSION_ID);
    assert.deepEqual(
      scenarios.map((row) => row.recordId),
      ['scenario-135-1'],
    );
  } finally {
    harness.repository.close();
  }
});

test('135 an invalid archive never touches the stored session', async () => {
  const harness = await createArchiveHarness();
  try {
    const document = await exportedDocument(harness);
    const before = await sessionFingerprint(harness.repository);

    const tampered = {
      ...document,
      components: {
        ...document.components,
        campaign: {
          ...document.components.campaign,
          body: {
            ...(document.components.campaign?.body ?? {}),
            digest: 'f'.repeat(64),
          },
        },
      },
    };
    const imported = await harness.archive.import({
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      document: tampered,
    });
    assert.equal(imported.status, 'REJECTED');
    if (imported.status === 'REJECTED') {
      assert.equal(imported.rejection.code, 'CHECKSUM_MISMATCH');
    }
    assert.equal(await sessionFingerprint(harness.repository), before);

    const preview = await harness.archive.preview({
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      document: tampered,
    });
    assert.equal(preview.status, 'REJECTED');
    assert.equal(await sessionFingerprint(harness.repository), before);
  } finally {
    harness.repository.close();
  }
});

test('135 a valid envelope checksum cannot hide a rewritten campaign ledger', async () => {
  const harness = await createArchiveHarness();
  try {
    const document = await exportedDocument(harness);
    const before = await sessionFingerprint(harness.repository);
    const forged = restamp(document, tamperCampaignXp(document));
    const validated = readSessionArchive(forged, expectation(harness));
    assert.equal(validated.status, 'REJECTED');
    if (validated.status === 'REJECTED') {
      assert.equal(validated.rejection.code, 'CAMPAIGN_INVALID');
    }
    const imported = await harness.archive.import({
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      document: forged,
    });
    assert.equal(imported.status, 'REJECTED');
    assert.equal(await sessionFingerprint(harness.repository), before);
  } finally {
    harness.repository.close();
  }
});

test('135 a checkpoint that names another profile generation is refused, not repaired', async () => {
  const harness = await createArchiveHarness();
  try {
    const document = await exportedDocument(harness);
    const profile = document.components.profile;
    assert.notEqual(profile, null);
    const forged = restamp(document, {
      ...document.components,
      profile: { ...(profile as NonNullable<typeof profile>), activeVersionId: 'profile-1@1' },
    });
    const validated = readSessionArchive(forged, expectation(harness));
    assert.equal(validated.status, 'REJECTED');
    if (validated.status === 'REJECTED') {
      assert.equal(validated.rejection.code, 'PROFILE_GENERATION_MISMATCH');
    }
    const before = await sessionFingerprint(harness.repository);
    const imported = await harness.archive.import({
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      document: forged,
    });
    assert.equal(imported.status, 'REJECTED');
    assert.equal(await sessionFingerprint(harness.repository), before);
  } finally {
    harness.repository.close();
  }
});

test('135 an archive is refused when the progress rows belong to another session', async () => {
  const harness = await createArchiveHarness();
  try {
    const document = await exportedDocument(harness);
    const progress = document.components.progress;
    assert.notEqual(progress, null);
    if (progress === null) return;
    const forged = restamp(document, {
      ...document.components,
      progress: {
        ...progress,
        sessionId: 'session-135-other',
        recordId: 'tracker:session-135-other',
      },
    });
    const validated = readSessionArchive(forged, expectation(harness));
    assert.equal(validated.status, 'REJECTED');
    if (validated.status === 'REJECTED') {
      assert.equal(validated.rejection.code, 'SESSION_MISMATCH');
    }
  } finally {
    harness.repository.close();
  }
});

test('135 a component over its budget and a declared total over the limit are refused', async () => {
  const harness = await createArchiveHarness({ scenarios: 0 });
  try {
    const document = await exportedDocument(harness);
    const bigRows = [0, 1, 2].map((index) =>
      parsePersistedRecord(
        scenarioRecord({
          recordId: `scenario-135-big-${index}`,
          sessionId: ARCHIVE_SESSION_ID,
          worldEpoch: ARCHIVE_WORLD_EPOCH,
          body: { payload: 'x'.repeat(200_000), seed: index },
        }),
        'SCENARIO',
      ),
    );
    const tooBig = restamp(document, { ...document.components, scenarios: bigRows });
    const validated = readSessionArchive(tooBig, expectation(harness));
    assert.equal(validated.status, 'REJECTED');
    if (validated.status === 'REJECTED') {
      assert.equal(validated.rejection.code, 'COMPONENT_TOO_LARGE');
      assert.equal(validated.rejection.path, 'scenarios');
    }

    const declaredTooLarge = stampSessionArchiveChecksum({
      ...document,
      sizes: { ...document.sizes, total: SESSION_ARCHIVE_LIMITS.maxTotalBytes + 1 },
    });
    const declared = readSessionArchive(declaredTooLarge, expectation(harness));
    assert.equal(declared.status, 'REJECTED');
    if (declared.status === 'REJECTED') {
      assert.equal(declared.rejection.code, 'ARCHIVE_TOO_LARGE');
    }

    const wrongSize = stampSessionArchiveChecksum({
      ...document,
      sizes: { ...document.sizes, progress: document.sizes.progress + 1 },
    });
    const mismatched = readSessionArchive(wrongSize, expectation(harness));
    assert.equal(mismatched.status, 'REJECTED');
    if (mismatched.status === 'REJECTED') {
      assert.equal(mismatched.rejection.code, 'SIZE_MISMATCH');
      assert.equal(mismatched.rejection.path, 'sizes.progress');
    }
  } finally {
    harness.repository.close();
  }
});

test('135 importing replaces the rewards instead of adding them', async () => {
  const source = await createArchiveHarness({
    dbName: '135-archive-source',
    through: 'campaign-3-following-distance',
  });
  const target = await createArchiveHarness({
    dbName: ARCHIVE_TARGET_DB_NAME,
    through: 'campaign-6-city-copies-you',
  });
  try {
    const exported = await exportArchive(source);
    const targetBefore = await readSave(target);
    assert.notEqual(targetBefore.campaign, null);
    const xpBefore = targetBefore.campaign?.rewards.totals.xp ?? 0;
    const completedBefore = targetBefore.campaign?.counts.completed ?? 0;
    assert.equal(completedBefore, 6);
    assert.equal(exported.counts.campaignCompleted, 3);
    assert.equal(xpBefore > exported.counts.xp, true);

    const imported = await target.archive.import({
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      document: exported.document,
    });
    assert.equal(imported.status, 'COMMITTED');
    if (imported.status !== 'COMMITTED') return;
    assert.equal(imported.counts.xp, exported.counts.xp);
    assert.equal(imported.counts.rewardsGranted, exported.counts.rewardsGranted);

    const after = await readSave(target);
    const ledger = after.campaign?.ledger;
    assert.notEqual(ledger, undefined);
    assert.equal(after.campaign?.rewards.totals.xp, exported.counts.xp);
    assert.notEqual(after.campaign?.rewards.totals.xp, xpBefore + exported.counts.xp);
    assert.equal(after.campaign?.rewards.totals.granted, exported.counts.rewardsGranted);
    assert.equal(after.campaign?.counts.completed, 3);
    assert.equal(after.campaign?.digest, exported.document.components.campaign?.body.digest);

    // The same completion delivered again after the replacement is a duplicate, never new XP.
    const completion = source.run.completions[0]!;
    const repeated = ledger!.settle({ instance: completion.instance });
    assert.equal(repeated.status, 'DUPLICATE');
    assert.equal(repeated.xpGranted, 0);
    assert.equal(after.campaign?.rewards.totals.xp, exported.counts.xp);

    const twice = await target.archive.import({
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      document: exported.document,
    });
    assert.equal(twice.status, 'COMMITTED');
    const afterTwice = await readSave(target);
    assert.equal(afterTwice.campaign?.rewards.totals.xp, exported.counts.xp);
    assert.equal(afterTwice.campaign?.rewards.totals.granted, exported.counts.rewardsGranted);
  } finally {
    source.repository.close();
    target.repository.close();
  }
});

test('135 a failure before commit leaves the session byte-identical', async () => {
  const harness = await createArchiveHarness();
  try {
    const document = await exportedDocument(harness);
    const before = await sessionFingerprint(harness.repository);
    const imported = await harness.archive.import({
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      document,
      hooks: {
        beforeCommit: () => {
          throw new PersistenceError('TRANSACTION_ABORTED', 'injected failure before commit');
        },
      },
    });
    assert.equal(imported.status, 'REJECTED');
    if (imported.status === 'REJECTED') {
      assert.equal(imported.rejection.code, 'TRANSACTION_ABORTED');
    }
    assert.equal(await sessionFingerprint(harness.repository), before);
  } finally {
    harness.repository.close();
  }
});

test('135 a second tab cannot import, and a missing profile version is refused', async () => {
  const harness = await createArchiveHarness();
  try {
    const document = await exportedDocument(harness);
    const second = await openRepository(harness.factory, harness.locks, 'tab-b', ARCHIVE_DB_NAME);
    try {
      assert.equal(second.status().role, 'READ_ONLY');
      const transactions = await openTransactionRunner(harness.factory, ARCHIVE_DB_NAME);
      const store = createSessionArchiveStore({
        repository: second,
        catalog: harness.catalog,
        transactions,
      });
      const imported = await store.import({
        sessionId: ARCHIVE_SESSION_ID,
        playerId: ARCHIVE_PLAYER_ID,
        document,
      });
      assert.equal(imported.status, 'REJECTED');
      if (imported.status === 'REJECTED') {
        assert.equal(imported.rejection.code, 'WRITER_REQUIRED');
      }
    } finally {
      second.close();
    }

    const missingProfile = await createArchiveHarness({
      dbName: '135-archive-no-profile',
      profile: false,
      checkpoint: false,
      scenarios: 0,
    });
    try {
      const imported = await missingProfile.archive.import({
        sessionId: ARCHIVE_SESSION_ID,
        playerId: ARCHIVE_PLAYER_ID,
        document,
      });
      assert.equal(imported.status, 'REJECTED');
      if (imported.status === 'REJECTED') {
        assert.equal(imported.rejection.code, 'PROFILE_VERSION_MISSING');
      }
      const before = await sessionFingerprint(missingProfile.repository);
      assert.equal(before.includes('tracker:'), true);
    } finally {
      missingProfile.repository.close();
    }
  } finally {
    harness.repository.close();
  }
});

test('135 a stored profile generation that moved on is refused', async () => {
  const harness = await createArchiveHarness();
  const target = await createArchiveHarness({
    dbName: '135-archive-stale-generation',
    profile: false,
    checkpoint: false,
    scenarios: 0,
  });
  try {
    const document = await exportedDocument(harness);
    await target.repository.putProfile(profileVersion());
    await target.repository.putProfile(derivedProfile());
    await target.repository.activateProfile(
      activation({
        playerId: ARCHIVE_PLAYER_ID,
        versionId: 'profile-1@1',
        sequence: 1,
      }),
    );
    const before = await sessionFingerprint(target.repository);
    const imported = await target.archive.import({
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      document,
    });
    assert.equal(imported.status, 'REJECTED');
    if (imported.status === 'REJECTED') {
      assert.equal(imported.rejection.code, 'PROFILE_GENERATION_MISMATCH');
    }
    assert.equal(await sessionFingerprint(target.repository), before);
  } finally {
    harness.repository.close();
    target.repository.close();
  }
});

test('135 export refuses to combine a world with another profile generation', async () => {
  const harness = await createArchiveHarness();
  try {
    // The profile advances after the checkpoint was captured: the two are no longer one generation.
    await harness.repository.activateProfile(
      activation({
        playerId: ARCHIVE_PLAYER_ID,
        versionId: 'profile-1@1',
        sequence: ARCHIVE_ACTIVATION_SEQUENCE + 1,
      }),
    );
    const result = await harness.archive.export({
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      createdAt: '2026-11-11T15:00:00.000Z',
    });
    assert.equal(result.status, 'REJECTED');
    if (result.status === 'REJECTED') {
      assert.equal(result.rejection.code, 'PROFILE_GENERATION_MISMATCH');
    }
  } finally {
    harness.repository.close();
  }
});

test('135 preview summarises the replacement without writing anything', async () => {
  const source = await createArchiveHarness({
    dbName: '135-archive-preview-source',
    through: 'campaign-3-following-distance',
  });
  const target = await createArchiveHarness({
    dbName: '135-archive-preview-target',
    through: 'campaign-6-city-copies-you',
  });
  try {
    const exported = await exportArchive(source);
    const before = await sessionFingerprint(target.repository);
    const preview = await target.archive.preview({
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      document: JSON.stringify(exported.document),
    });
    assert.equal(preview.status, 'ACCEPTED');
    if (preview.status !== 'ACCEPTED') return;
    assert.equal(preview.validation.counts.campaignCompleted, 3);
    assert.equal(preview.current.progressRows, 2);
    assert.equal(preview.current.scenarios, 1);
    assert.equal(preview.current.settings, 'STORED');
    assert.equal(preview.current.completed, 6);
    assert.equal(preview.current.checkpoint?.checkpointId !== undefined, true);
    assert.equal(await sessionFingerprint(target.repository), before);
  } finally {
    source.repository.close();
    target.repository.close();
  }
});

test('135 the archive refuses a file for a newer layout before reading it', async () => {
  const harness = await createArchiveHarness();
  try {
    const document = await exportedDocument(harness);
    const newer = readSessionArchive({ ...document, formatVersion: 2 }, expectation(harness));
    assert.equal(newer.status, 'REJECTED');
    if (newer.status === 'REJECTED') assert.equal(newer.rejection.code, 'FORMAT_VERSION_TOO_NEW');
    const otherFormat = readSessionArchive(
      { ...document, format: 'self-driving-academy-save' },
      expectation(harness),
    );
    assert.equal(otherFormat.status, 'REJECTED');
    if (otherFormat.status === 'REJECTED') {
      assert.equal(otherFormat.rejection.code, 'UNSUPPORTED_FORMAT');
    }
    const duplicatedKeys = JSON.stringify(document).replace(
      '"formatVersion":1',
      '"formatVersion":1,"formatVersion":1',
    );
    const duplicate = readSessionArchive(duplicatedKeys, expectation(harness));
    assert.equal(duplicate.status, 'REJECTED');
    if (duplicate.status === 'REJECTED') assert.equal(duplicate.rejection.code, 'DUPLICATE_KEY');
    const wrongSession = readSessionArchive(document, {
      ...expectation(harness),
      sessionId: 'session-135-elsewhere',
    });
    assert.equal(wrongSession.status, 'REJECTED');
    if (wrongSession.status === 'REJECTED')
      assert.equal(wrongSession.rejection.code, 'SESSION_MISMATCH');
  } finally {
    harness.repository.close();
  }
});

test('135 the empty session is refused instead of replacing a save with nothing', async () => {
  const harness = await createArchiveHarness({
    profile: false,
    checkpoint: false,
    save: false,
    scenarios: 0,
  });
  try {
    const result = await harness.archive.export({
      sessionId: ARCHIVE_SESSION_ID,
      playerId: ARCHIVE_PLAYER_ID,
      createdAt: '2026-11-11T15:00:00.000Z',
      versions: ARCHIVE_VERSIONS,
    });
    assert.equal(result.status, 'REJECTED');
    if (result.status === 'REJECTED') assert.equal(result.rejection.code, 'ARCHIVE_EMPTY');
  } finally {
    harness.repository.close();
  }
});

test('135 every component stays inside the 127 record budget it is written back through', async () => {
  const harness = await createArchiveHarness();
  try {
    const exported = await exportArchive(harness);
    assert.equal(exported.sizes.progress < PERSISTENCE_LIMITS.maxRecordBytes, true);
    assert.equal(exported.sizes.campaign < PERSISTENCE_LIMITS.maxRecordBytes, true);
    assert.equal(exported.sizes.checkpoint < PERSISTENCE_LIMITS.maxRecordBytes, true);
    assert.equal(exported.sizes.total < SESSION_ARCHIVE_LIMITS.maxTotalBytes, true);
    assert.equal(exported.sizes.total > exported.sizes.checkpoint, true);
  } finally {
    harness.repository.close();
  }
});
