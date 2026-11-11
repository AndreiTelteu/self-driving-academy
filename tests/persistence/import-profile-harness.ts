import {
  buildProfileExport,
  createLocalRepository,
  createMemoryIdbFactory,
  createMemoryLockManager,
  stampProfileExportChecksum,
} from '../../src/persistence/index';
import type { LocalRepository } from '../../src/persistence/index';
import type { ProfileVersion } from '../../src/profiles/index';
import { createEpochWorld, type EpochWorld } from '../harness/learning-epoch-fixture';
import {
  PIPELINE_BASE_VERSION,
  PIPELINE_ENGINE,
  PIPELINE_PLAYER_ID,
  PIPELINE_PROFILE_ID,
} from '../harness/profile-pipeline-fixture';

/**
 * Deterministic world for PBI 134.
 *
 * The same values are used by the tests and by `import-profile-report.ts`, so the transcript can be
 * re-verified with `--check`. There is no wall clock and no random identity: the tick is a fixed
 * counter, the timestamps are constants and the profile history comes from the real 109 store.
 */
export const IMPORT_ENGINE = PIPELINE_ENGINE;
export const IMPORT_PROFILE_ID = PIPELINE_PROFILE_ID;
export const IMPORT_PLAYER_ID = PIPELINE_PLAYER_ID;
export const IMPORT_BASE_VERSION = PIPELINE_BASE_VERSION;
export const IMPORT_TARGET_VERSION = 'profile-v2';
export const IMPORT_TIP_VERSION = 'profile-v3';
export const IMPORT_CREATED_AT = '2026-10-22T12:00:00.000Z';
export const IMPORT_ACTIVATED_AT = '2026-10-22T12:10:00.000Z';
export const IMPORT_NOW = '2026-10-22T12:20:00.000Z';

export interface ImportDocumentOverrides {
  readonly profileId?: string;
  readonly engineVersion?: string;
  readonly activeVersionId?: string | null;
  readonly activation?: {
    readonly playerId: string;
    readonly sequence: number;
    readonly activatedAt: string;
  } | null;
}

export interface ImportFixture {
  readonly epoch: EpochWorld;
  readonly repository: LocalRepository;
  /** The stored 109 rows exported by the 133 builder, in depth order. */
  readonly versions: readonly ProfileVersion[];
  /** The 133 document as text, ready for the importer. */
  readonly text: string;
  readonly document: Record<string, unknown>;
  close(): void;
}

/**
 * Builds a valid 133 document from the versions of the real 109 store.
 *
 * The versions are the ones the epoch world derived (`profile-v1`, `profile-v2`, `profile-v3`), so
 * the import and the 205 barrier share exactly the same identities.
 */
export function buildImportDocument(
  versions: readonly ProfileVersion[],
  overrides: ImportDocumentOverrides = {},
): Record<string, unknown> {
  const built = buildProfileExport({
    profileId: overrides.profileId ?? IMPORT_PROFILE_ID,
    engineVersion: overrides.engineVersion ?? IMPORT_ENGINE,
    createdAt: IMPORT_CREATED_AT,
    versions,
    activeVersionId:
      overrides.activeVersionId === undefined ? IMPORT_TIP_VERSION : overrides.activeVersionId,
    activation:
      overrides.activation === undefined
        ? {
            playerId: IMPORT_PLAYER_ID,
            sequence: 1,
            activatedAt: IMPORT_ACTIVATED_AT,
          }
        : overrides.activation,
  });
  if (built.status !== 'ACCEPTED') {
    throw new Error(`The deterministic import document was refused: ${built.rejection.code}`);
  }
  return built.document as unknown as Record<string, unknown>;
}

/** Recomputes the document checksum after a deliberate edit, so a deeper rule is the one that fails. */
export function restamp(document: Record<string, unknown>): Record<string, unknown> {
  return stampProfileExportChecksum(document as never) as unknown as Record<string, unknown>;
}

export function mutable(document: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
}

/** Wraps the document profile section as the mutable records the fault cases edit. */
export function profileSection(document: Record<string, unknown>): Record<string, unknown> {
  return document.profile as Record<string, unknown>;
}

export function versionsSection(document: Record<string, unknown>): Record<string, unknown>[] {
  return profileSection(document).versions as Record<string, unknown>[];
}

/** Real 109 store + 110 activation + 205 barrier from the 205 fixture. */
export function createImportEpoch(): EpochWorld {
  return createEpochWorld();
}

export async function createImportFixture(): Promise<ImportFixture> {
  const epoch = createImportEpoch();
  const versions = epoch.store.listVersions(IMPORT_PROFILE_ID);
  const document = buildImportDocument(versions);
  const repository = createLocalRepository({
    factory: createMemoryIdbFactory(),
    locks: createMemoryLockManager(),
    dbName: '134-import-profile-db',
    tabId: 'tab-import',
    now: () => IMPORT_NOW,
  });
  await repository.open();
  return {
    epoch,
    repository,
    versions,
    document,
    text: JSON.stringify(document),
    close(): void {
      repository.close();
      epoch.dispose();
    },
  };
}
