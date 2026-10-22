import { computeProfileVersionChecksum } from '../../src/profiles/index';
import type { ProfileVersion, ProfileVersionContent } from '../../src/profiles/index';
import { createDefaultSettings } from '../../src/settings/index';
import type { RuntimeSettings } from '../../src/settings/index';
import type {
  ActivationRecord,
  CheckpointRecordInput,
  LocalRepository,
  PersistedRecordInput,
} from '../../src/persistence/index';

export const FIXED_NOW = '2026-10-22T09:00:00.000Z' as const;

export function fixedClock(): () => string {
  return () => FIXED_NOW;
}

export function baseProfileContent(
  overrides: Partial<ProfileVersionContent> = {},
): ProfileVersionContent {
  return {
    schemaVersion: 1,
    units: 'SI',
    profileId: 'profile-1',
    versionId: 'profile-1@1',
    parentVersionId: null,
    engineVersion: 'engine-127',
    parameters: { speed: 10 },
    provenance: {
      origin: 'BASE',
      sourceSegmentIds: [],
      sourceInterventionIds: [],
      delta: null,
    },
    sourceSegmentIds: [],
    depth: 0,
    createdAt: FIXED_NOW,
    ...overrides,
  };
}

export function profileVersion(overrides: Partial<ProfileVersionContent> = {}): ProfileVersion {
  const content = baseProfileContent(overrides);
  return Object.freeze({ ...content, checksum: computeProfileVersionChecksum(content) });
}

export function derivedProfile(): ProfileVersion {
  return profileVersion({
    versionId: 'profile-1@2',
    parentVersionId: 'profile-1@1',
    depth: 1,
    parameters: { speed: 12 },
    provenance: {
      origin: 'DERIVED',
      sourceSegmentIds: ['segment-1'],
      sourceInterventionIds: [],
      delta: {
        baseVersionId: 'profile-1@1',
        validationVersion: '102-candidate-v1',
        segmentId: 'segment-1',
        interventionId: null,
        reason: 'manual tuning',
        keyCount: 1,
        changes: [{ key: 'speed', unit: 'm/s', previousValue: 10, newValue: 12 }],
      },
    },
    sourceSegmentIds: ['segment-1'],
  });
}

export function activation(overrides: Partial<ActivationRecord> = {}): ActivationRecord {
  return {
    schemaVersion: 1,
    playerId: 'player-1',
    profileId: 'profile-1',
    versionId: 'profile-1@1',
    sequence: 1,
    activatedAt: FIXED_NOW,
    ...overrides,
  };
}

export function settingsSnapshot(): RuntimeSettings {
  return createDefaultSettings('player-1');
}

export function segmentRecord(overrides: Partial<PersistedRecordInput> = {}): PersistedRecordInput {
  return {
    schemaVersion: 1,
    recordKind: 'SEGMENT',
    recordId: 'segment-1',
    sessionId: 'session-1',
    worldEpoch: 1,
    status: 'OPEN',
    revision: 1,
    createdAt: FIXED_NOW,
    body: { startTick: 0, controlMode: 'MANUAL', samples: 0 },
    ...overrides,
  };
}

export function scenarioRecord(
  overrides: Partial<PersistedRecordInput> = {},
): PersistedRecordInput {
  return {
    schemaVersion: 1,
    recordKind: 'SCENARIO',
    recordId: 'scenario-1',
    sessionId: 'session-1',
    worldEpoch: 1,
    status: null,
    revision: 1,
    createdAt: FIXED_NOW,
    body: { mapVersion: 'provisional-v1', seed: 1 },
    ...overrides,
  };
}

export function progressRecord(
  overrides: Partial<PersistedRecordInput> = {},
): PersistedRecordInput {
  return {
    schemaVersion: 1,
    recordKind: 'PROGRESS',
    recordId: 'mission-instance-1',
    sessionId: 'session-1',
    worldEpoch: 1,
    status: 'ACTIVE',
    revision: 1,
    createdAt: FIXED_NOW,
    body: { missionId: 'campaign-1-first-taxi', progress: 0, target: 1 },
    ...overrides,
  };
}

export function checkpointRecord(
  overrides: Partial<CheckpointRecordInput> = {},
): CheckpointRecordInput {
  return {
    schemaVersion: 1,
    checkpointId: 'checkpoint-1',
    sessionId: 'session-1',
    profileId: 'profile-1',
    worldEpoch: 1,
    tick: 120,
    generation: 1,
    learningEpoch: 0,
    engineVersion: 'engine-127',
    physicsVersion: 'rapier-0.21.0',
    mapVersion: 'provisional-v1',
    createdAt: FIXED_NOW,
    body: { vehicles: [], signals: [], rng: { seed: 1 } },
    ...overrides,
  };
}

export async function withRepository<T>(
  repository: LocalRepository,
  work: (repository: LocalRepository) => Promise<T>,
): Promise<T> {
  try {
    return await work(repository);
  } finally {
    repository.close();
  }
}
