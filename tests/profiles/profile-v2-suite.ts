import { createHash } from 'node:crypto';
import {
  PROFILE_CATALOG_VERSION,
  PROFILE_SCHEMA_VERSION_V1,
  PROFILE_SCHEMA_VERSION_V2,
  PROFILE_V2_VERSION,
  computeProfileV2Checksum,
  getParameterDefinition,
  migrateProfileV1ToV2,
  parameterDefinitions,
  projectProfileV2ForUi,
  readProfileDocument,
  rollbackProfileV2ToV1,
  summarizeProfileV2,
} from '../../src/profiles';
import type { DrivingProfile, ProfileV2, ProfileV2Content } from '../../src/profiles';

/**
 * Deterministic 166 report fixture and oracle.
 *
 * The fixture is a real V1 `DrivingProfile`: nine delivered V1 keys with the provenance vocabulary
 * of Docs/12 (MANUAL_TUNING, IMPORTED, BASE), one historical evidence record and the real 092
 * values. Everything the report claims is measured from that document, from the migration result
 * and from the 092 registry; no number is asserted without the object that contains it.
 */

const fixtureKeys = [
  ['speed_delta_urban', 1.5, 'MANUAL_TUNING'],
  ['speed_delta_residential', 0.4, 'BASE'],
  ['curve_lateral_accel', 3.1, 'IMPORTED'],
  ['following_time_headway', 2.1, 'MANUAL_TUNING'],
  ['following_min_gap', 2.6, 'BASE'],
  ['red_stop_probability', 1, 'MANUAL_TUNING'],
  ['stop_dwell_time', 1.9, 'BASE'],
  ['lane_change_cooldown', 3.2, 'MANUAL_TUNING'],
  ['yield_time_gap', 4, 'BASE'],
] as const;

/** Builds the raw V1 document exactly as the 127/133 import contract expects it. */
export function createV1FixtureProfile(): Record<string, unknown> {
  const parameters: Record<string, number> = Object.create(null);
  const unitsByParameter: Record<string, string> = Object.create(null);
  const provenanceByParameter: Record<string, string> = Object.create(null);
  const evidenceByParameter: Record<string, unknown> = Object.create(null);
  for (const [key, value, provenance] of fixtureKeys) {
    parameters[key] = value;
    unitsByParameter[key] = getParameterDefinition(key).unit;
    provenanceByParameter[key] = provenance;
    evidenceByParameter[key] =
      key === 'following_time_headway'
        ? {
            key,
            effectiveCount: 6,
            contexts: ['FREE_TRAFFIC', 'LEADER'],
            quality: 0.72,
            uncertainty: 0.18,
            sourceSegmentIds: ['segment-142', 'segment-151'],
            estimatorVersion: '102-candidate-v1',
          }
        : null;
  }
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION_V1,
    units: 'SI',
    profileId: 'academy-style',
    versionId: 'style-v7',
    parentVersionId: 'style-v6',
    engineVersion: 'engine-166',
    parameters,
    unitsByParameter,
    provenanceByParameter,
    evidenceByParameter,
    sourceSegmentIds: ['segment-142', 'segment-151'],
    createdAt: '2026-11-01T10:00:00.000Z',
    checksum: 'fixture:academy-style-v7',
  };
}

export interface ProfileV2ReportCheck {
  readonly id: string;
  readonly description: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ProfileV2ReportKey {
  readonly key: string;
  readonly stage: string;
  readonly origin: string;
  readonly source: string | null;
  readonly support: string;
  readonly evidenceSource: string;
  readonly value: number | null;
  readonly defaultValue: number;
  readonly evidenceCount: number;
  readonly detail: string;
}

export interface ProfileV2Report {
  readonly version: typeof PROFILE_V2_VERSION;
  readonly generatedBy: string;
  readonly command: string;
  readonly catalog: {
    readonly version: string;
    readonly schemaVersion: number;
    readonly updatedOn: string;
    readonly keys: number;
    readonly v1Keys: number;
    readonly v2Keys: number;
    readonly supported: number;
    readonly defaultOnly: number;
    readonly reserved: number;
  };
  readonly source: {
    readonly profileId: string;
    readonly versionId: string;
    readonly keys: number;
    readonly checksum: string;
    readonly evidenceKeys: number;
  };
  readonly migration: {
    readonly schemaVersion: number;
    readonly catalogVersion: string;
    readonly checksum: string;
    readonly keys: number;
    readonly playerSet: number;
    readonly inherited: number;
    readonly default: number;
    readonly unset: number;
  };
  readonly equivalence: {
    readonly checkedKeys: number;
    readonly mismatches: readonly string[];
    readonly checksumPreserved: boolean;
    readonly rollbackExact: boolean;
    readonly rollbackChecksum: string;
  };
  readonly unsetPolicy: {
    readonly keys: number;
    readonly unset: number;
    readonly parameters: number;
    readonly detailsPresent: number;
  };
  readonly refusal: {
    readonly schemaTooNew: string;
    readonly catalogTooNew: string;
    readonly invalidEntry: string;
    readonly reservedKeyInV1: string;
    readonly checksumMismatch: string;
    readonly postMigrationEdit: string;
  };
  readonly determinism: {
    readonly runs: number;
    readonly checksums: readonly string[];
    readonly digest: string;
  };
  readonly keys: readonly ProfileV2ReportKey[];
  readonly checks: readonly ProfileV2ReportCheck[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
  readonly limitations: readonly string[];
}

function cloneV2(profile: ProfileV2): ProfileV2 {
  return JSON.parse(JSON.stringify(profile)) as ProfileV2;
}

function replacedKey(
  profile: ProfileV2,
  key: string,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const document = cloneV2(profile) as unknown as Record<string, unknown>;
  const keys = document.keys as Record<string, Record<string, unknown>>;
  keys[key] = { ...keys[key], ...patch };
  const parameters = document.parameters as Record<string, number>;
  if (patch.value === null) delete parameters[key];
  else if (typeof patch.value === 'number') parameters[key] = patch.value;
  return document;
}

/** Simulates one authored V2 edit and re-seals the document with its real checksum. */
export function authoredV2Document(
  profile: ProfileV2,
  key: string,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const document = replacedKey(profile, key, patch);
  const content = { ...document };
  delete content.checksum;
  document.checksum = computeProfileV2Checksum(content as unknown as ProfileV2Content);
  return document;
}

function refusedCode(result: { status: string; rejection: { code: string } | null }): string {
  return result.status === 'REJECTED' && result.rejection !== null
    ? result.rejection.code
    : `ACCEPTED:${result.status}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function runProfileV2Report(): ProfileV2Report {
  const sourceDocument = createV1FixtureProfile();
  const migrated = migrateProfileV1ToV2(sourceDocument);
  if (migrated.status !== 'MIGRATED')
    throw new Error(`The 166 fixture was refused: ${migrated.rejection.code}`);
  const profile = migrated.profile;
  const summary = summarizeProfileV2(profile);
  const rows = projectProfileV2ForUi(profile);

  const sourceProfile = sourceDocument as unknown as DrivingProfile;
  const mismatches: string[] = [];
  for (const key of Object.keys(sourceProfile.parameters)) {
    const entry = profile.keys[key];
    if (entry.value !== sourceProfile.parameters[key]) mismatches.push(`${key}:value`);
    if (entry.unit !== sourceProfile.unitsByParameter[key]) mismatches.push(`${key}:unit`);
    if (entry.source !== `v1:${sourceProfile.provenanceByParameter[key]}`)
      mismatches.push(`${key}:provenance`);
    if (
      entry.reason !== 'V1_BASE_VALUE' &&
      entry.reason !== 'V1_PLAYER_VALUE' &&
      entry.reason !== 'V1_IMPORTED_VALUE'
    )
      mismatches.push(`${key}:origin`);
    if (
      entry.evidence !== null &&
      JSON.stringify(entry.evidence) !==
        JSON.stringify(sourceProfile.evidenceByParameter[key] ?? null)
    )
      mismatches.push(`${key}:evidence`);
  }

  const rollback = rollbackProfileV2ToV1(profile);
  const rolledBack = rollback.status === 'ROLLED_BACK' ? rollback.profile : null;
  const rollbackExact =
    rolledBack !== null &&
    rolledBack.checksum === sourceProfile.checksum &&
    rolledBack.profileId === sourceProfile.profileId &&
    rolledBack.versionId === sourceProfile.versionId &&
    rolledBack.parentVersionId === sourceProfile.parentVersionId &&
    rolledBack.engineVersion === sourceProfile.engineVersion &&
    rolledBack.createdAt === sourceProfile.createdAt &&
    rolledBack.sourceSegmentIds.join('|') === sourceProfile.sourceSegmentIds.join('|') &&
    Object.keys(rolledBack.parameters).length === Object.keys(sourceProfile.parameters).length &&
    Object.keys(sourceProfile.parameters).every(
      (key) =>
        rolledBack.parameters[key] === sourceProfile.parameters[key] &&
        rolledBack.unitsByParameter[key] === sourceProfile.unitsByParameter[key] &&
        rolledBack.provenanceByParameter[key] === sourceProfile.provenanceByParameter[key],
    );

  const unsetMigration = migrateProfileV1ToV2(sourceDocument, { reservedKeys: 'UNSET' });
  if (unsetMigration.status !== 'MIGRATED')
    throw new Error(`The 166 UNSET fixture was refused: ${unsetMigration.rejection.code}`);
  const unsetProfile = unsetMigration.profile;
  const unsetRows = projectProfileV2ForUi(unsetProfile);
  const unsetCount = unsetRows.filter((row) => row.origin === 'UNSET').length;

  const schemaTooNew = readProfileDocument({
    ...createV1FixtureProfile(),
    schemaVersion: 3,
  });
  const catalogTooNew = readProfileDocument({
    ...createV1FixtureProfile(),
    catalogVersion: '092-catalog-1@2026-12-31',
  });
  const invalidEntryDocument = cloneV2(profile) as unknown as Record<string, unknown>;
  delete (invalidEntryDocument.keys as Record<string, unknown>).speed_delta_urban;
  const invalidEntry = readProfileDocument(invalidEntryDocument);
  const reservedV1 = readProfileDocument({
    ...createV1FixtureProfile(),
    parameters: {
      ...(sourceDocument.parameters as Record<string, number>),
      speed_delta_arterial: 0,
    },
    unitsByParameter: {
      ...(sourceDocument.unitsByParameter as Record<string, string>),
      speed_delta_arterial: 'm/s',
    },
    provenanceByParameter: {
      ...(sourceDocument.provenanceByParameter as Record<string, string>),
      speed_delta_arterial: 'BASE',
    },
    evidenceByParameter: {
      ...(sourceDocument.evidenceByParameter as Record<string, unknown>),
      speed_delta_arterial: null,
    },
  });
  const tampered = cloneV2(profile) as unknown as Record<string, unknown>;
  tampered.checksum = 'fnv1a64:0000000000000000';
  const checksumMismatch = readProfileDocument(tampered);
  const edited = authoredV2Document(profile, 'speed_delta_arterial', {
    value: 2,
    origin: 'PLAYER_SET',
    source: 'v2:MANUAL_TUNING',
    evidenceSource: 'NONE',
    reason: 'V2_PLAYER_VALUE',
    detail: 'Valoare reglată de jucător direct în schema V2, după migrare.',
  });
  const editedRead = readProfileDocument(edited);
  const postMigrationEdit =
    editedRead.status === 'CURRENT'
      ? refusedCode(rollbackProfileV2ToV1(editedRead.profile))
      : refusedCode(editedRead);

  const second = migrateProfileV1ToV2(createV1FixtureProfile());
  const secondChecksum = second.status === 'MIGRATED' ? second.profile.checksum : 'refused';

  const defaultRows = rows.filter((row) => row.origin === 'DEFAULT');
  const supportedKeys = parameterDefinitions.filter((entry) => entry.implemented).length;
  const v1KeyCount = parameterDefinitions.filter(
    (entry) => entry.implementationStage === 'initial_learning_target',
  ).length;
  const v2KeyCount = parameterDefinitions.length - v1KeyCount;

  const checks: ProfileV2ReportCheck[] = [
    {
      id: 'CATALOG_80_24_56',
      description: 'Catalogul 092 are 80 de chei: 24 V1 și 56 R, fără suprapunere.',
      pass: parameterDefinitions.length === 80 && v1KeyCount === 24 && v2KeyCount === 56,
      detail: `${parameterDefinitions.length} chei, ${v1KeyCount} V1, ${v2KeyCount} R`,
    },
    {
      id: 'MIGRATION_ACCEPTED',
      description: 'Un profil V1 real este migrat explicit, cu schema 2 și catalogul curent.',
      pass:
        profile.schemaVersion === PROFILE_SCHEMA_VERSION_V2 &&
        profile.catalogVersion === PROFILE_CATALOG_VERSION,
      detail: `schema ${profile.schemaVersion}, catalog ${profile.catalogVersion}`,
    },
    {
      id: 'V1_VALUES_PRESERVED',
      description: 'Toate cheile V1 existente păstrează valoarea, unitatea și proveniența.',
      pass: mismatches.length === 0,
      detail:
        mismatches.length === 0
          ? `${Object.keys(sourceProfile.parameters).length} chei verificate, 0 diferențe`
          : `${mismatches.length} diferențe: ${mismatches.join(', ')}`,
    },
    {
      id: 'NEW_KEYS_DEFAULTED',
      description: 'Cele 56 de chei R primesc defaultul din catalogul 092, nu o estimare.',
      pass:
        defaultRows.length === 71 &&
        defaultRows.every(
          (row) => row.origin === 'DEFAULT' && row.evidenceSource === 'CATALOG_DEFAULT',
        ),
      detail: `${defaultRows.length} chei DEFAULT, ${defaultRows.filter((row) => row.stage === 'extension').length} dintre ele R`,
    },
    {
      id: 'DEFAULTS_ARE_NOT_ESTIMATES',
      description: 'Nicio valoare default nu are dovezi sau încredere fabricată.',
      pass: defaultRows.every((row) => row.evidenceCount === 0 && row.quality === 0),
      detail: 'toate rândurile DEFAULT au evidenceCount 0 și quality 0',
    },
    {
      id: 'UI_DECLARES_ALL_KEYS',
      description:
        'Proiecția pentru UI declară originea, sursa, suportul și dovezile fiecărei chei.',
      pass:
        rows.length === 80 &&
        rows.every(
          (row) =>
            row.originLabel.length > 0 &&
            row.supportLabel.length > 0 &&
            row.evidenceSourceLabel.length > 0 &&
            row.detail.length > 0,
        ),
      detail: `${rows.length} rânduri, fiecare cu origine, suport, sursă de dovezi și motiv`,
    },
    {
      id: 'ROLLBACK_EXACT',
      description: 'Rollback-ul întoarce exact profilul V1, cu checksum-ul lui.',
      pass: rollbackExact && rollback.status === 'ROLLED_BACK',
      detail:
        rolledBack === null
          ? 'rollback refuzat'
          : `${Object.keys(rolledBack.parameters).length} chei, checksum ${rolledBack.checksum}`,
    },
    {
      id: 'DETERMINISTIC',
      description: 'Două migrări ale aceleiași intrări produc același checksum.',
      pass: secondChecksum === profile.checksum,
      detail: `${profile.checksum} / ${secondChecksum}`,
    },
    {
      id: 'SCHEMA_TOO_NEW_REFUSED',
      description: 'O schemă mai nouă este refuzată explicit, nu interpretată.',
      pass: refusedCode(schemaTooNew) === 'SCHEMA_TOO_NEW',
      detail: refusedCode(schemaTooNew),
    },
    {
      id: 'CATALOG_TOO_NEW_REFUSED',
      description: 'Un catalog mai nou este refuzat explicit.',
      pass: refusedCode(catalogTooNew) === 'CATALOG_TOO_NEW',
      detail: refusedCode(catalogTooNew),
    },
    {
      id: 'INVALID_ENTRY_REFUSED',
      description: 'Un document V2 incomplet este refuzat.',
      pass: refusedCode(invalidEntry) === 'INVALID_PROFILE',
      detail: refusedCode(invalidEntry),
    },
    {
      id: 'RESERVED_KEY_IN_V1_REFUSED',
      description: 'O cheie R într-un profil V1 este refuzată explicit.',
      pass: refusedCode(reservedV1) === 'RESERVED_KEY_IN_V1',
      detail: refusedCode(reservedV1),
    },
    {
      id: 'CHECKSUM_MISMATCH_REFUSED',
      description: 'Un document V2 modificat este refuzat la checksum.',
      pass: refusedCode(checksumMismatch) === 'CHECKSUM_MISMATCH',
      detail: refusedCode(checksumMismatch),
    },
    {
      id: 'UNSET_POLICY',
      description: 'Politica UNSET lasă cele 56 de chei R nesetate, cu motiv, fără valoare.',
      pass:
        unsetCount === v2KeyCount &&
        unsetRows.every((row) => row.origin !== 'UNSET' || row.value === null),
      detail: `${unsetCount} chei UNSET, ${Object.keys(unsetProfile.parameters).length} parametri purtați`,
    },
    {
      id: 'POST_MIGRATION_EDIT_NOT_REPRESENTABLE',
      description: 'O valoare V2 reglată după migrare nu este pierdută tacit la rollback.',
      pass: postMigrationEdit === 'MIGRATION_NOT_REPRESENTABLE',
      detail: postMigrationEdit,
    },
  ];

  const payload = {
    version: PROFILE_V2_VERSION,
    generatedBy: 'tests/profiles/profile-v2-suite.ts',
    command: 'npm run profile:v2',
    catalog: {
      version: PROFILE_CATALOG_VERSION,
      schemaVersion: 1,
      updatedOn: '2026-10-04',
      keys: parameterDefinitions.length,
      v1Keys: v1KeyCount,
      v2Keys: v2KeyCount,
      supported: supportedKeys,
      defaultOnly: parameterDefinitions.filter(
        (entry) => entry.implementationStage !== 'extension' && !entry.implemented,
      ).length,
      reserved: parameterDefinitions.filter((entry) => entry.implementationStage === 'extension')
        .length,
    },
    source: {
      profileId: sourceProfile.profileId,
      versionId: sourceProfile.versionId,
      keys: Object.keys(sourceProfile.parameters).length,
      checksum: sourceProfile.checksum,
      evidenceKeys: Object.values(sourceProfile.evidenceByParameter).filter(
        (evidence) => evidence !== null,
      ).length,
    },
    migration: {
      schemaVersion: profile.schemaVersion,
      catalogVersion: profile.catalogVersion,
      checksum: profile.checksum,
      keys: summary.keys,
      playerSet: summary.playerSet,
      inherited: summary.inherited,
      default: summary.default,
      unset: summary.unset,
    },
    equivalence: {
      checkedKeys: Object.keys(sourceProfile.parameters).length,
      mismatches,
      checksumPreserved: rolledBack !== null && rolledBack.checksum === sourceProfile.checksum,
      rollbackExact,
      rollbackChecksum: rolledBack === null ? 'refused' : rolledBack.checksum,
    },
    unsetPolicy: {
      keys: unsetRows.length,
      unset: unsetCount,
      parameters: Object.keys(unsetProfile.parameters).length,
      detailsPresent: unsetRows.filter((row) => row.detail.length > 0).length,
    },
    refusal: {
      schemaTooNew: refusedCode(schemaTooNew),
      catalogTooNew: refusedCode(catalogTooNew),
      invalidEntry: refusedCode(invalidEntry),
      reservedKeyInV1: refusedCode(reservedV1),
      checksumMismatch: refusedCode(checksumMismatch),
      postMigrationEdit,
    },
    determinism: {
      runs: 2,
      checksums: [profile.checksum, secondChecksum],
      digest: '',
    },
    keys: rows.map((row) => ({
      key: row.key,
      stage: row.stage,
      origin: row.origin,
      source: row.source,
      support: row.support,
      evidenceSource: row.evidenceSource,
      value: row.value,
      defaultValue: row.defaultValue,
      evidenceCount: row.evidenceCount,
      detail: row.detail,
    })),
    checks,
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.pass).length,
      pass: checks.every((check) => check.pass),
    },
    limitations: [
      'Niciun controler nu consumă încă valorile R: proiecția declară RESERVED, iar 092 rămâne fail-closed.',
      'Catalogul livrat nu are nicio cheie estimabilă, deci un profil V1 real nu poate conține LEARNED; ramura LEARNED a migrării este acoperită doar structural.',
      'Documentul V2 este un read model derivat; persistarea lui într-un rând 127 nou nu este cerută de criterii și nu a fost adăugată.',
    ],
  };

  const digest = sha256(
    JSON.stringify({
      ...payload,
      determinism: { runs: 2, checksums: payload.determinism.checksums },
    }),
  );

  return Object.freeze({
    ...payload,
    determinism: { ...payload.determinism, digest },
  } as ProfileV2Report);
}

export function profileV2ReportMarkdown(report: ProfileV2Report): string {
  const checks = report.checks
    .map(
      (check) =>
        `| \`${check.id}\` | ${check.pass ? 'PASS' : 'FAIL'} | ${check.description} | ${check.detail} |`,
    )
    .join('\n');
  const keys = report.keys
    .map(
      (entry) =>
        `| \`${entry.key}\` | ${entry.stage === 'extension' ? 'R' : 'V1'} | ${entry.origin} | ${entry.source ?? '—'} | ${entry.support} | ${entry.evidenceSource} | ${entry.value ?? '—'} | ${entry.evidenceCount} |`,
    )
    .join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  return `# 166 — scheme și suport V2 pentru profile

Transcript determinist generat de \`${report.generatedBy}\`; comanda comisă este \`${report.command}\`.
Machine-readable: [report.json](report.json).

Regula oracolului: fiecare valoare provine din documentul V1 de fixture sau din catalogul 092;
niciun rând \`DEFAULT\`/\`UNSET\` nu are dovezi, încredere sau estimări.

## Sumar

| Indicator | Valoare |
| --- | ---: |
| Verificări | **${report.summary.passed}/${report.summary.checks}** |
| Chei în schemă | **${report.migration.keys}** (${report.catalog.v1Keys} V1 + ${report.catalog.v2Keys} R) |
| Chei setate de jucător | **${report.migration.playerSet}** |
| Chei moștenite din V1 | **${report.migration.inherited}** |
| Chei default | **${report.migration.default}** |
| Chei nesetate | **${report.migration.unset}** |
| Checksum V2 | \`${report.migration.checksum}\` |
| Checksum V1 păstrat la rollback | \`${report.equivalence.rollbackChecksum}\` |
| Amprenta SHA-256 a raportului | \`${report.determinism.digest}\` |
| Verdict | **${report.summary.pass ? 'PASS' : 'FAIL'}** |

## Verificări

| Verificare | Rezultat | Ce dovedește | Detaliu |
| --- | --- | --- | --- |
${checks}

## Refuzuri explicite

| Caz | Cod |
| --- | --- |
| Schemă mai nouă | \`${report.refusal.schemaTooNew}\` |
| Catalog mai nou | \`${report.refusal.catalogTooNew}\` |
| Intrare V2 invalidă | \`${report.refusal.invalidEntry}\` |
| Cheie R într-un profil V1 | \`${report.refusal.reservedKeyInV1}\` |
| Checksum modificat | \`${report.refusal.checksumMismatch}\` |
| Reglaj V2 după migrare, la rollback | \`${report.refusal.postMigrationEdit}\` |

## Tabel cheie → sursă → valoare

| Cheie | Stadiu | Origine | Sursă | Suport | Dovezi | Valoare | Dovezi efective |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
${keys}

## Limitări

${limitations}
`;
}
