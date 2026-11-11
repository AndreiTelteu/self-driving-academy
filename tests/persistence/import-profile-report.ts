import { createHash } from 'node:crypto';
import {
  PROFILE_EXPORT_FORMAT,
  PROFILE_EXPORT_FORMAT_VERSION,
  PROFILE_EXPORT_SCHEMA_VERSION,
  PROFILE_IMPORT_LIMITS,
  PROFILE_IMPORT_VERSION,
  activateImportedProfile,
  canonicalizeJson,
  importProfileDocument,
  sha256Hex,
  validateProfileImport,
} from '../../src/persistence/index';
import type { ProfileImportValidationResult } from '../../src/persistence/index';
import {
  IMPORT_BASE_VERSION,
  IMPORT_ENGINE,
  IMPORT_PLAYER_ID,
  IMPORT_PROFILE_ID,
  IMPORT_TARGET_VERSION,
  createImportFixture,
  mutable,
  restamp,
  versionsSection,
} from './import-profile-harness';

/**
 * Deterministic transcript of PBI 134.
 *
 * Every value is a real run of the import contract against the in-memory IndexedDB double and the
 * real 205/110 fixture. There is no wall clock and no random identity, so `--check` can re-verify
 * the committed transcript byte for byte.
 */
export interface ProfileImportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ProfileImportReport {
  readonly version: '134-import-profile-v1';
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly contract: string;
  readonly format: {
    readonly format: string;
    readonly formatVersion: number;
    readonly schemaVersion: number;
    readonly maxFileBytes: number;
    readonly maxVersions: number;
  };
  readonly validation: {
    readonly status: string;
    readonly checksumVerified: boolean;
    readonly versions: number;
    readonly baseVersions: number;
    readonly derivedVersions: number;
    readonly tipVersionId: string;
    readonly activeVersionId: string;
    readonly reservedParameters: number;
    readonly bytes: number;
  };
  readonly import: {
    readonly status: string;
    readonly versionIds: string[];
    readonly versionsCreated: number;
    readonly versionsExisting: number;
    readonly activated: boolean;
    readonly activation: null;
    readonly storedVersions: number;
    readonly storedActiveVersionId: string | null;
    readonly storedActivationSequence: number | null;
  };
  readonly activation: {
    readonly staleTickCode: string;
    readonly pendingStatus: string;
    readonly pendingWritesActivation: boolean;
    readonly appliedStatus: string;
    readonly sequence: number;
    readonly lifecycleEpoch: number;
    readonly activateAtTick: number;
    readonly durableVersionId: string;
    readonly fleetBefore: string[];
    readonly fleetApplied: string[];
    readonly lateResultStatus: string;
    readonly lateResultAccepted: boolean;
    readonly repeatedStatus: string;
  };
  readonly refusals: Record<string, string>;
  readonly atomicity: {
    readonly faultCode: string;
    readonly storedVersionsAfterFault: number;
    readonly activationAfterFault: boolean;
    readonly retryCreated: number;
  };
  readonly digest: {
    readonly canonicalBytes: number;
    readonly platform: string;
    readonly own: string;
    readonly equal: boolean;
  };
  readonly checks: readonly ProfileImportCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
  };
}

function codeOf(result: ProfileImportValidationResult): string {
  return result.status === 'REJECTED' ? result.rejection.code : result.status;
}

function invalidImportCode(result: unknown): string {
  const value = result as { status?: string; rejection?: { code?: string } };
  return value.status === 'REJECTED' ? (value.rejection?.code ?? 'UNKNOWN') : String(value.status);
}

export async function runImportProfileReport(): Promise<ProfileImportReport> {
  const checks: ProfileImportCheck[] = [];
  const check = (name: string, expected: unknown, actual: unknown, detail: string): void => {
    const pass = JSON.stringify(expected) === JSON.stringify(actual);
    checks.push({ name, expected, actual, pass, detail });
  };

  const fixture = await createImportFixture();
  let report: Omit<ProfileImportReport, 'checks' | 'summary'>;
  try {
    const expect = Object.freeze({ profileId: IMPORT_PROFILE_ID, engineVersion: IMPORT_ENGINE });
    const validation = validateProfileImport(fixture.text, expect);
    if (validation.status !== 'ACCEPTED') {
      throw new Error(`The deterministic document was refused: ${validation.rejection.code}`);
    }
    const imported = await importProfileDocument(fixture.repository, {
      document: fixture.text,
      expect,
    });
    if (imported.status !== 'COMMITTED') {
      throw new Error(`The deterministic import was refused: ${imported.rejection.code}`);
    }
    const history = await fixture.repository.getProfileHistory(IMPORT_PROFILE_ID);

    // Explicit activation: refused at a stale tick, pending at tick 0, applied at tick 1.
    const sources = {
      repository: fixture.repository,
      barrier: fixture.epoch.barrier,
      playerId: IMPORT_PLAYER_ID,
      profileId: IMPORT_PROFILE_ID,
      engineVersion: IMPORT_ENGINE,
      tick: () => fixture.epoch.tick.value,
      now: () => '2026-10-22T12:30:00.000Z',
    } as const;
    const stale = await activateImportedProfile(sources, {
      versionId: IMPORT_TARGET_VERSION,
      tick: 99,
    });
    const fleetBefore = [...fixture.epoch.fleetVersions()];
    const pending = await activateImportedProfile(sources, {
      versionId: IMPORT_TARGET_VERSION,
      tick: 0,
    });
    const pendingWritesActivation =
      (await fixture.repository.getActivation(IMPORT_PROFILE_ID)) !== null;
    fixture.epoch.advanceTick();
    const applied = await activateImportedProfile(sources, {
      versionId: IMPORT_TARGET_VERSION,
      tick: 1,
    });
    const durable = await fixture.repository.getActivation(IMPORT_PROFILE_ID);
    fixture.epoch.advanceTick();
    fixture.epoch.activation.applyAt(2);
    const fleetApplied = [...fixture.epoch.fleetVersions()];
    const late = fixture.epoch.barrier.isCurrent({
      playerId: IMPORT_PLAYER_ID,
      profileId: IMPORT_PROFILE_ID,
      learningEpoch: 1,
      baseVersionId: IMPORT_BASE_VERSION,
      segmentId: 'segment-g1',
    });
    const repeated = await activateImportedProfile(sources, {
      versionId: IMPORT_TARGET_VERSION,
      tick: 2,
    });

    // Closed refusals, each on a copy of the same deterministic document.
    const modified = mutable(fixture.document);
    versionsSection(modified)[0].parameters = {
      ...(versionsSection(modified)[0].parameters as Record<string, unknown>),
      speed_delta_urban: { value: 9, unit: 'm/s' },
    };
    const modifiedCode = codeOf(validateProfileImport(modified, expect));

    const perVersion = mutable(fixture.document);
    (versionsSection(perVersion)[0].parameters as Record<string, unknown>).speed_delta_urban = {
      value: 9,
      unit: 'm/s',
    };
    const perVersionCode = codeOf(validateProfileImport(restamp(perVersion), expect));

    const unknownUnit = mutable(fixture.document);
    (versionsSection(unknownUnit)[0].parameters as Record<string, unknown>).speed_delta_urban = {
      value: 1.5,
      unit: 'km/h',
    };
    const unknownUnitCode = codeOf(validateProfileImport(restamp(unknownUnit), expect));

    const outOfRange = mutable(fixture.document);
    (versionsSection(outOfRange)[0].parameters as Record<string, unknown>).speed_delta_urban = {
      value: 9_999,
      unit: 'm/s',
    };
    const outOfRangeCode = codeOf(validateProfileImport(restamp(outOfRange), expect));

    const reserved = mutable(fixture.document);
    (versionsSection(reserved)[0].parameters as Record<string, unknown>).speed_delta_arterial = {
      value: 1,
      unit: 'm/s',
    };
    const reservedCode = codeOf(validateProfileImport(restamp(reserved), expect));

    const unknownKey = mutable(fixture.document);
    (versionsSection(unknownKey)[0].parameters as Record<string, unknown>).not_a_parameter = {
      value: 1,
      unit: 'm/s',
    };
    const unknownKeyCode = codeOf(validateProfileImport(restamp(unknownKey), expect));

    const newerSchema = mutable(fixture.document);
    newerSchema.schemaVersion = 2;
    const newerSchemaCode = codeOf(validateProfileImport(restamp(newerSchema), expect));

    const newerFormat = mutable(fixture.document);
    newerFormat.formatVersion = 2;
    const newerFormatCode = codeOf(validateProfileImport(restamp(newerFormat), expect));

    const malformedCode = codeOf(validateProfileImport('{ not json', expect));
    const duplicateCode = codeOf(validateProfileImport('{"format":"a","format":"b"}', expect));
    const tooLargeCode = codeOf(
      validateProfileImport('x'.repeat(PROFILE_IMPORT_LIMITS.maxFileBytes + 1), expect),
    );
    const tooLargeImport = await importProfileDocument(fixture.repository, {
      document: 'x'.repeat(PROFILE_IMPORT_LIMITS.maxFileBytes + 1),
      expect,
    });

    const canonical = canonicalizeJson(fixture.document);
    if (canonical.status !== 'ACCEPTED') throw new Error('The document is not canonicalizable');
    const platform = createHash('sha256').update(canonical.text, 'utf8').digest('hex');
    const own = sha256Hex(canonical.text);

    const atomic = await createImportFixture();
    let atomicReport: ProfileImportReport['atomicity'];
    try {
      const faulted = await importProfileDocument(atomic.repository, {
        document: atomic.text,
        expect,
        hooks: {
          beforeCommit(): void {
            throw new Error('deterministic import fault');
          },
        },
      });
      const afterFault = await atomic.repository.getProfileHistory(IMPORT_PROFILE_ID);
      const activationAfterFault =
        (await atomic.repository.getActivation(IMPORT_PROFILE_ID)) !== null;
      const retried = await importProfileDocument(atomic.repository, {
        document: atomic.text,
        expect,
      });
      atomicReport = {
        faultCode: invalidImportCode(faulted),
        storedVersionsAfterFault: afterFault.versions.length,
        activationAfterFault,
        retryCreated: retried.status === 'COMMITTED' ? retried.versionsCreated : 0,
      };
    } finally {
      atomic.close();
    }

    report = {
      version: '134-import-profile-v1',
      generatedBy:
        'node --import ./scripts/register-typescript.mjs scripts/run-import-profile-report.mjs',
      oracleRule:
        'Every value is a real run of src/persistence/profile-import against the in-memory IndexedDB double and the real 205/110 fixture; the expected value is the documented contract, never a copy of the actual one.',
      contract: PROFILE_IMPORT_VERSION,
      format: {
        format: PROFILE_EXPORT_FORMAT,
        formatVersion: PROFILE_EXPORT_FORMAT_VERSION,
        schemaVersion: PROFILE_EXPORT_SCHEMA_VERSION,
        maxFileBytes: PROFILE_IMPORT_LIMITS.maxFileBytes,
        maxVersions: PROFILE_IMPORT_LIMITS.maxVersions,
      },
      validation: {
        status: validation.status,
        checksumVerified: validation.checksumVerified,
        versions: validation.versions.length,
        baseVersions: validation.counts.baseVersions,
        derivedVersions: validation.counts.derivedVersions,
        tipVersionId: validation.tipVersionId,
        activeVersionId: validation.activeVersionId ?? '',
        reservedParameters: validation.counts.reservedParameters,
        bytes: validation.bytes,
      },
      import: {
        status: imported.status,
        versionIds: [...imported.versionIds],
        versionsCreated: imported.versionsCreated,
        versionsExisting: imported.versionsExisting,
        activated: imported.activated,
        activation: null,
        storedVersions: history.versions.length,
        storedActiveVersionId: history.activeVersionId,
        storedActivationSequence: history.activationSequence,
      },
      activation: {
        staleTickCode: stale.status === 'REJECTED' ? stale.rejection.code : stale.status,
        pendingStatus: pending.status,
        pendingWritesActivation,
        appliedStatus: applied.status,
        sequence: applied.status === 'ACTIVATED' ? (applied.sequence ?? 0) : 0,
        lifecycleEpoch: applied.status === 'ACTIVATED' ? (applied.learningEpoch ?? 0) : 0,
        activateAtTick: applied.status === 'ACTIVATED' ? (applied.activateAtTick ?? 0) : 0,
        durableVersionId: durable?.versionId ?? '',
        fleetBefore,
        fleetApplied,
        lateResultStatus: late.status,
        lateResultAccepted: late.accepted,
        repeatedStatus: repeated.status,
      },
      refusals: {
        modifiedDocument: modifiedCode,
        perVersionChecksum: perVersionCode,
        unknownUnit: unknownUnitCode,
        outOfRange: outOfRangeCode,
        reservedKeyWithValue: reservedCode,
        unknownParameter: unknownKeyCode,
        schemaTooNew: newerSchemaCode,
        formatVersionTooNew: newerFormatCode,
        malformedJson: malformedCode,
        duplicateKey: duplicateCode,
        fileTooLarge: tooLargeCode,
        fileTooLargeImported: invalidImportCode(tooLargeImport),
      },
      atomicity: atomicReport,
      digest: {
        canonicalBytes: canonical.text.length,
        platform,
        own,
        equal: platform === own,
      },
    };
  } finally {
    fixture.close();
  }

  check('contract', '134-profile-import-v1', report.contract, 'Contract id');
  check('format', 'self-driving-academy-profile-export', report.format.format, 'The 133 format');
  check('format-version', 1, report.format.formatVersion, 'The 133 format version');
  check('schema-version', 1, report.format.schemaVersion, 'The 133 schema version');
  check('file-budget', 1_048_576, report.format.maxFileBytes, 'The fixed 1 MiB budget');
  check('version-budget', 128, report.format.maxVersions, 'The fixed version cap');
  check('validation-status', 'ACCEPTED', report.validation.status, 'The document validates');
  check('validation-checksum', true, report.validation.checksumVerified, 'The checksum verifies');
  check('validation-versions', 3, report.validation.versions, 'Three versions');
  check('validation-base', 1, report.validation.baseVersions, 'One base version');
  check('validation-derived', 2, report.validation.derivedVersions, 'Two derived versions');
  check('validation-tip', 'profile-v3', report.validation.tipVersionId, 'The deepest version');
  check('validation-active', 'profile-v3', report.validation.activeVersionId, 'The named active');
  check(
    'validation-reserved',
    56,
    report.validation.reservedParameters,
    'The 56 reserved R keys are null',
  );
  check('import-status', 'COMMITTED', report.import.status, 'The import commits');
  check(
    'import-versions',
    ['profile-v1', 'profile-v2', 'profile-v3'],
    report.import.versionIds,
    'Depth order',
  );
  check('import-created', 3, report.import.versionsCreated, 'Three rows written');
  check('import-existing', 0, report.import.versionsExisting, 'No pre-existing row');
  check('import-activated', false, report.import.activated, 'Import never activates');
  check('import-activation-null', null, report.import.activation, 'No activation payload');
  check('import-stored', 3, report.import.storedVersions, 'Three stored versions');
  check('import-stored-active', null, report.import.storedActiveVersionId, 'No stored pointer');
  check(
    'import-stored-sequence',
    null,
    report.import.storedActivationSequence,
    'No stored sequence',
  );
  check(
    'activation-stale-tick',
    'IMPORT_ACTIVATION_STALE_TICK',
    report.activation.staleTickCode,
    'A stale tick is refused',
  );
  check('activation-pending', 'PENDING', report.activation.pendingStatus, 'Resolved next tick');
  check(
    'activation-pending-writes',
    false,
    report.activation.pendingWritesActivation,
    'A pending barrier writes no activation',
  );
  check('activation-applied', 'ACTIVATED', report.activation.appliedStatus, 'Explicit activation');
  check('activation-sequence', 1, report.activation.sequence, 'First stored sequence');
  check('activation-epoch', 2, report.activation.lifecycleEpoch, 'The 205 epoch advanced');
  check('activation-tick', 2, report.activation.activateAtTick, 'The 110 tick boundary');
  check(
    'activation-durable',
    IMPORT_TARGET_VERSION,
    report.activation.durableVersionId,
    'The durable pointer',
  );
  check('activation-fleet-before', ['profile-v1'], report.activation.fleetBefore, 'Old base');
  check(
    'activation-fleet-applied',
    [IMPORT_TARGET_VERSION],
    report.activation.fleetApplied,
    'The 110 fleet applies the imported version',
  );
  check('activation-late', 'LATE_RESULT', report.activation.lateResultStatus, 'Old generation');
  check('activation-late-accepted', false, report.activation.lateResultAccepted, 'Ignored');
  check(
    'activation-repeated',
    'ALREADY_ACTIVE',
    report.activation.repeatedStatus,
    'Idempotent activation',
  );
  check(
    'refusal-modified',
    'CHECKSUM_MISMATCH',
    report.refusals.modifiedDocument,
    'A modified document',
  );
  check(
    'refusal-per-version',
    'PROFILE_CHECKSUM_MISMATCH',
    report.refusals.perVersionChecksum,
    'A version that fails its 109 checksum',
  );
  check('refusal-unit', 'UNIT_MISMATCH', report.refusals.unknownUnit, 'An unknown unit');
  check('refusal-range', 'VALUE_OUT_OF_RANGE', report.refusals.outOfRange, 'Out of the 092 range');
  check(
    'refusal-reserved',
    'RESERVED_KEY_SET',
    report.refusals.reservedKeyWithValue,
    'A reserved key with a value',
  );
  check(
    'refusal-unknown-parameter',
    'UNKNOWN_PARAMETER',
    report.refusals.unknownParameter,
    'An unknown usable key',
  );
  check('refusal-schema', 'SCHEMA_TOO_NEW', report.refusals.schemaTooNew, 'A newer schema');
  check(
    'refusal-format',
    'FORMAT_VERSION_TOO_NEW',
    report.refusals.formatVersionTooNew,
    'A newer format',
  );
  check('refusal-malformed', 'PARSE_ERROR', report.refusals.malformedJson, 'Malformed JSON');
  check('refusal-duplicate', 'DUPLICATE_KEY', report.refusals.duplicateKey, 'Duplicate keys');
  check('refusal-size', 'FILE_TOO_LARGE', report.refusals.fileTooLarge, 'Above the size budget');
  check(
    'refusal-size-import',
    'FILE_TOO_LARGE',
    report.refusals.fileTooLargeImported,
    'The writer is never reached',
  );
  check(
    'atomicity-fault',
    'IMPORT_WRITE_FAILED',
    report.atomicity.faultCode,
    'The aborted import is reported',
  );
  check(
    'atomicity-versions',
    0,
    report.atomicity.storedVersionsAfterFault,
    'No version survives the abort',
  );
  check(
    'atomicity-activation',
    false,
    report.atomicity.activationAfterFault,
    'No activation survives the abort',
  );
  check('atomicity-retry', 3, report.atomicity.retryCreated, 'The retry imports cleanly');
  check('digest-equal', true, report.digest.equal, 'The SHA-256 matches the platform digest');

  const passed = checks.filter((entry) => entry.pass).length;
  return {
    ...report,
    checks: Object.freeze(checks),
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}
