import {
  WALKING_CHARACTER_VERSION,
  WALKING_SAVE_FORMAT_VERSION,
  WALKING_SAVE_LAUNCH,
  WALKING_SAVE_LIMITS,
  WALKING_SAVE_SCHEMA_VERSION,
  WALKING_SAVE_VERSION,
  WalkingSaveError,
  canonicalizeJson,
  readSessionArchiveWithEconomy,
  readWalkingSave,
  sha256Hex,
  stampWalkingSaveChecksum,
  upgradeWalkingSave,
  walkingSaveDigest,
  walkingSaveReload,
} from '../../src/persistence/index';
import type {
  SessionArchiveEconomyCounts,
  WalkingSaveDocument,
  WalkingSaveExpectationInput,
  WalkingSaveMigrationOptions,
} from '../../src/persistence/index';
import {
  characterPositionBits,
  createCharacterCamera,
  createWalkingSegments,
  createWalker,
  parseFleetSwitchState,
} from '../../src/character';
import type { WalkWorld } from '../../src/character';
import { createInputAuthorityArbiter } from '../../src/input';
import type { InputAuthority } from '../../src/input';
import { cameraControl } from '../character/character-camera-suite';
import { realBuildingSpot, realWalkWorld } from '../character/walk-world';
import { ARCHIVE_PLAYER_ID, ARCHIVE_SESSION_ID } from './session-archive-fixture';
import {
  authoredSpawn,
  createWalkingArchive,
  exportLegacyArchive,
  exportWalkingArchive,
  saveWalkingEconomy,
  seatedFixture,
  slotOf,
  walkingFixture,
} from './walking-save-fixture';
import type { WalkingCharacterFixture } from './walking-save-fixture';

/**
 * 200 evidence suite: the real version 2 session (135 + 215) migrated to version 3 with the real
 * character states of 192–198, reloaded and re-applied, plus every closed refusal.
 *
 * Nothing is simulated by hand. The archive comes out of the real 135/215 stores, the character comes
 * out of the real walker, arbiter, camera, segment model and fleet decision, and every reload check
 * re-creates the owner objects from the saved bytes.
 */
export const WALKING_SAVE_REPORT_CONTRACT = WALKING_SAVE_VERSION;
export const WALKING_SAVE_REPORT_COMMAND = 'npm run walking:save';
export const WALKING_SAVE_MIGRATION_CREATED_AT = '2026-11-15T00:10:00.000Z' as const;

export interface WalkingSaveCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
}

export interface WalkingSaveScenarioRow {
  readonly id: string;
  readonly label: string;
  readonly slot: 'character' | 'character(default)';
  readonly sourceFormatVersion: number;
  readonly targetFormatVersion: number;
  readonly characterSource: string;
  readonly checksum: string;
  readonly documentDigest: string;
  readonly documentBytes: number;
  readonly sessionBytes: number;
  readonly economyBytes: number;
  readonly characterBytes: number;
  readonly componentsBefore: Readonly<{ session: string; economy: string }>;
  readonly componentsAfter: Readonly<{ session: string; economy: string; character: string }>;
  readonly componentsIdentical: boolean;
  readonly counts: SessionArchiveEconomyCounts;
  readonly reload: Readonly<{
    paused: boolean;
    mode: string;
    auto: boolean;
    inputReleased: boolean;
    authority: string;
    cameraEntityId: string;
    entities: number;
    vehicles: number;
    bodiesCreated: number;
    heldKeysActive: number;
    neutralizedKeys: number;
    xpBalance: number;
    xpMicroXp: number;
    dailyRewards: number;
    settlements: number;
    openSegmentId: string | null;
    secondReadSameDigest: boolean;
    secondReadSameCounts: boolean;
  }>;
  readonly checks: readonly WalkingSaveCheck[];
  readonly verdict: 'PASS' | 'FAIL';
  readonly failedChecks: readonly string[];
}

export interface WalkingSaveRefusalRow {
  readonly id: string;
  readonly label: string;
  readonly mutation: string;
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly inputUnchanged: boolean;
  readonly pass: boolean;
}

export interface WalkingSaveReport {
  readonly contract: typeof WALKING_SAVE_REPORT_CONTRACT;
  readonly command: typeof WALKING_SAVE_REPORT_COMMAND;
  readonly version: typeof WALKING_SAVE_VERSION;
  readonly formatVersions: Readonly<{ session135: 1; economy215: 2; current: 3 }>;
  readonly schemaVersion: typeof WALKING_SAVE_SCHEMA_VERSION;
  readonly characterVersion: typeof WALKING_CHARACTER_VERSION;
  readonly limits: typeof WALKING_SAVE_LIMITS;
  readonly launch: typeof WALKING_SAVE_LAUNCH;
  readonly defaultRule: readonly string[];
  readonly scenarios: readonly WalkingSaveScenarioRow[];
  readonly refusals: readonly WalkingSaveRefusalRow[];
  readonly checks: readonly WalkingSaveCheck[];
  readonly summary: Readonly<{
    checks: number;
    passed: number;
    scenarios: number;
    scenariosPassed: number;
    refusals: number;
    refusalsClosed: number;
    migrationPreservesEverything: boolean;
    reloadCoherent: boolean;
    noDuplicates: boolean;
    storeUntouched: boolean;
    pass: boolean;
  }>;
  readonly determinism: Readonly<{
    runs: number;
    identical: boolean;
    digest: string;
    scenarioDigests: readonly string[];
  }>;
  readonly limitations: readonly string[];
}

const DEFAULT_RULE: readonly string[] = Object.freeze([
  'Poziția: spawn-ul de mers autorat al sesiunii, acceptat numai dacă walker-ul real 192 îl acceptă (un punct într-un solid este refuzat cu SPAWN_BLOCKED).',
  'Autoritatea: CHARACTER:<characterId>, fără nicio tastă ținută, deci nicio accelerație nu poate supraviețui reluării.',
  'Camera: pe același personaj, la același tick, cu orbita implicită 194 și controlul 009 al sesiunii; nicio primă cadrare nu este inventată.',
  'Segmentele: ținta 198 este generația de profil a sesiunii (profileId, activeVersionId, learningEpoch); fără profil, ținta se leagă de identitatea sesiunii (profileId = playerId, baseVersionId = sessionId). Modelul pornește gol la tick-ul salvării: 0 tick-uri de mers, 0 segmente, 0 candidați.',
  'Flota: un singur corp, la spawn, fără focus și fără corp suspendat.',
]);

function digestOf(value: unknown): string {
  const canonical = canonicalizeJson(value, { maxDepth: WALKING_SAVE_LIMITS.maxDepth });
  if (canonical.status === 'REJECTED') {
    throw new Error(`The report cannot canonicalise a value: ${canonical.rejection.message}`);
  }
  return sha256Hex(canonical.text);
}

function authorityLabel(authority: InputAuthority): string {
  return authority.consumer === 'CHARACTER'
    ? `CHARACTER:${authority.characterId}`
    : `VEHICLE:${authority.vehicleId}`;
}

function entityIdOf(authority: InputAuthority): string {
  return authority.consumer === 'CHARACTER' ? authority.characterId : authority.vehicleId;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function reStamped(
  document: WalkingSaveDocument,
  mutate: (draft: WalkingSaveDocument) => void,
): WalkingSaveDocument {
  const draft = clone(document);
  mutate(draft);
  return stampWalkingSaveChecksum(draft);
}

function makeChecks() {
  const checks: WalkingSaveCheck[] = [];
  return {
    checks,
    check(name: string, expected: unknown, actual: unknown) {
      checks.push(
        Object.freeze({
          name,
          expected,
          actual,
          pass: JSON.stringify(expected) === JSON.stringify(actual),
        }),
      );
    },
  };
}

interface ScenarioRun {
  readonly row: WalkingSaveScenarioRow;
  readonly document: WalkingSaveDocument;
  readonly catalog: unknown;
  readonly vehicleIds: readonly string[];
  readonly sourceText: string;
  readonly world: WalkWorld | null;
  readonly storeUntouched: boolean;
}

/** Re-creates the owner objects from the saved bytes; a refusal here fails the scenario. */
function reapplyReload(
  document: WalkingSaveDocument,
  fixture: WalkingCharacterFixture,
): Readonly<Record<string, unknown>> {
  const character = document.components.character;
  const arbiter = createInputAuthorityArbiter({
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: character.sessionId,
      worldEpoch: character.worldEpoch,
    }),
    authority: character.fleet.authority,
  });
  arbiter.restore(character.authority);
  const restoredAuthority = arbiter.snapshot();
  arbiter.dispose();
  const camera = createCharacterCamera({ world: fixture.camera.world, control: cameraControl() });
  camera.restore(character.camera);
  const walker = createWalker({
    world: fixture.world,
    start: {
      positionM: character.fleet.character.positionM,
      yawRad: character.fleet.character.yawRad,
    },
    entityId: character.fleet.character.entityId,
  });
  const segments = createWalkingSegments({
    ownerId: character.segments.ownerId,
    characterId: character.segments.characterId,
    target: character.segments.target,
    resume: character.segments,
  });
  const fleet = parseFleetSwitchState(character.fleet);
  return Object.freeze({
    authorityTick: restoredAuthority.tick,
    everyHeldNeutralized: restoredAuthority.held.every((action) =>
      restoredAuthority.neutralized.includes(action),
    ),
    cameraEntityId: camera.state.entityId,
    cameraTick: camera.state.tick,
    cameraTransition:
      camera.state.transition === null ? null : camera.state.transition.remainingTicks,
    walkerBitsMatch:
      walker.positionBits() === characterPositionBits(character.fleet.character.positionM),
    segmentsOpen: segments.snapshot().open?.segmentId ?? null,
    segmentsTick: segments.snapshot().tick,
    fleetBodyBits: characterPositionBits(fleet.character.positionM),
    bodyBits: characterPositionBits(character.fleet.character.positionM),
  });
}

async function runScenario(input: {
  readonly id: string;
  readonly label: string;
  readonly tick: number;
  readonly kind: 'WALKING' | 'SEATED' | 'DEFAULT';
  readonly source: 'V2' | 'V1';
  readonly storeCheck?: boolean;
}): Promise<ScenarioRun> {
  const { checks, check } = makeChecks();
  const harness = await createWalkingArchive({
    tick: input.tick,
    dbName: `200-report-${input.id}`,
  });
  const fixture =
    input.kind === 'WALKING'
      ? walkingFixture(harness.world, { tick: input.tick })
      : input.kind === 'SEATED'
        ? seatedFixture(harness.world, { tick: input.tick })
        : null;
  const sourceFormatVersion: 1 | 2 = input.source === 'V2' ? 2 : 1;
  let source: unknown;
  if (input.source === 'V2') {
    await saveWalkingEconomy(harness);
    source = (await exportWalkingArchive(harness)).document;
  } else {
    source = (await exportLegacyArchive(harness)).document;
  }
  const sourceDocumentDigest = digestOf(source);
  const sourceRead = readSessionArchiveWithEconomy(source, {
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    catalog: harness.catalog,
  });
  if (sourceRead.status === 'REJECTED') {
    throw new Error(`200 report source refused: ${sourceRead.rejection.code}`);
  }
  const beforeCounts = sourceRead.counts;
  const sourceText = JSON.stringify(source);
  const sourceSession =
    (source as { components?: { session?: unknown } }).components?.session ?? source;
  const sourceEconomy =
    (source as { components?: { economy?: unknown } }).components?.economy ?? null;
  const componentsBefore = Object.freeze({
    session: digestOf(sourceSession),
    economy: digestOf(sourceEconomy),
  });
  const slot = fixture === null ? null : slotOf(fixture);
  const migrationOptions: WalkingSaveMigrationOptions = {
    createdAt: WALKING_SAVE_MIGRATION_CREATED_AT,
    catalog: harness.catalog,
    expect: { sessionId: ARCHIVE_SESSION_ID, playerId: ARCHIVE_PLAYER_ID },
    ...(slot === null
      ? {
          spawn: authoredSpawn(),
          walkWorld: realWalkWorld().world,
          characterId: 'character:player-1',
        }
      : { character: slot }),
  };
  const migration = upgradeWalkingSave(sourceText, migrationOptions);
  if (migration.status !== 'ACCEPTED') {
    throw new Error(`200 report migration refused: ${migration.rejection.code}`);
  }
  const document = migration.document;
  const vehicleIds = document.components.character.vehicleIds;
  const text = JSON.stringify(document);
  const expect: WalkingSaveExpectationInput = {
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    catalog: harness.catalog,
    vehicleIds,
  };
  const read = readWalkingSave(text, expect);
  if (read.status !== 'ACCEPTED')
    throw new Error(`200 report read refused: ${read.rejection.code}`);
  const reload = walkingSaveReload(read, { vehicleIds });
  const applied = fixture === null ? null : reapplyReload(document, fixture);
  const componentsAfter = Object.freeze({
    session: digestOf(document.components.session),
    economy: digestOf(document.components.economy),
    character: digestOf(document.components.character),
  });

  check('formatVersion', 3, document.formatVersion);
  check('schemaVersion', 3, document.schemaVersion);
  check('checksumLength', 64, document.checksum.value.length);
  check('checksumRecomputed', document.checksum.value, read.document.checksum.value);
  check('sessionBytesIdentical', componentsBefore.session, componentsAfter.session);
  check('economyBytesIdentical', componentsBefore.economy, componentsAfter.economy);
  check('sizesSession', migration.sizes.session, read.sizes.session);
  check('sizesEconomy', migration.sizes.economy, read.sizes.economy);
  check('sizesCharacter', migration.sizes.character, read.sizes.character);
  check('xpBalance', beforeCounts.xpBalance, reload.counts.xpBalance);
  check('xpMicroXp', beforeCounts.xpBalanceMicroXp, reload.counts.xpBalanceMicroXp);
  check('level', beforeCounts.level, reload.counts.level);
  check('dailyRewards', beforeCounts.dailyRewards, reload.counts.dailyRewards);
  check('settlements', beforeCounts.settlements, reload.counts.settlements);
  check('reviews', beforeCounts.reviews, reload.counts.reviews);
  check('kpiDays', beforeCounts.kpiDays, reload.counts.kpiDays);
  check('paused', true, reload.launch.paused);
  check('mode', 'PAUSED_AUTO', reload.launch.mode);
  check('auto', true, reload.launch.auto);
  check('inputReleased', true, reload.launch.inputReleased);
  check('heldKeysActive', 0, reload.launch.heldKeysActive);
  check('bodiesCreated', 0, reload.launch.bodiesCreated);
  check('entitiesTotal', vehicleIds.length + 1, reload.entities.total);
  check('entitiesVehicles', vehicleIds.length, reload.entities.vehicles);
  check(
    'cameraOnAuthorityOrFocus',
    read.character.fleet.focusEntityId ?? entityIdOf(read.character.authority.authority),
    reload.cameraEntityId,
  );
  check(
    'authorityLabel',
    authorityLabel(read.character.authority.authority),
    authorityLabel(reload.authority),
  );
  check('tickSharedByAuthorityAndCamera', read.character.tick, read.character.authority.tick);
  check('cameraSameTick', read.character.tick, read.character.camera.tick);
  if (applied !== null) {
    check('reappliedAuthorityTick', reload.tick, applied.authorityTick);
    check('reappliedEveryHeldNeutralized', true, applied.everyHeldNeutralized);
    check('reappliedCameraEntity', read.character.camera.entityId, applied.cameraEntityId);
    check('reappliedCameraTick', reload.tick, applied.cameraTick);
    check('reappliedBodyBits', true, applied.walkerBitsMatch);
    check('reappliedSegmentsTick', read.character.segments.tick, applied.segmentsTick);
    check('reappliedOpenSegment', reload.segments.openSegmentId, applied.segmentsOpen);
    if (input.kind === 'SEATED') {
      check('suspendedBodyBits', applied.bodyBits, applied.fleetBodyBits);
      check('openSegmentKind', 'MANUAL', reload.segments.openKind);
      check('cameraMidTransition', 17, applied.cameraTransition);
    }
  }
  const secondRead = readWalkingSave(text, expect);
  const secondReload =
    secondRead.status === 'ACCEPTED' ? walkingSaveReload(secondRead, { vehicleIds }) : null;
  check('secondReadAccepted', true, secondRead.status === 'ACCEPTED');
  check(
    'secondReadSameDigest',
    walkingSaveDigest(read.document),
    secondRead.status === 'ACCEPTED' ? walkingSaveDigest(secondRead.document) : null,
  );
  check('secondReadSameCounts', reload.counts, secondReload?.counts ?? null);

  let storeUntouched = false;
  if (input.storeCheck === true) {
    const reExported =
      input.source === 'V2'
        ? await exportWalkingArchive(harness)
        : await exportLegacyArchive(harness);
    storeUntouched = digestOf(reExported.document) === sourceDocumentDigest;
    check('storeUntouched', true, storeUntouched);
  }

  const failedChecks = checks.filter((entry) => !entry.pass).map((entry) => entry.name);
  const row: WalkingSaveScenarioRow = Object.freeze({
    id: input.id,
    label: input.label,
    slot: fixture === null ? 'character(default)' : 'character',
    sourceFormatVersion,
    targetFormatVersion: document.formatVersion,
    characterSource: document.components.character.source,
    checksum: document.checksum.value,
    documentDigest: walkingSaveDigest(document),
    documentBytes: text.length,
    sessionBytes: document.sizes.session,
    economyBytes: document.sizes.economy,
    characterBytes: document.sizes.character,
    componentsBefore,
    componentsAfter,
    componentsIdentical:
      componentsAfter.session === componentsBefore.session &&
      componentsAfter.economy === componentsBefore.economy,
    counts: reload.counts,
    reload: Object.freeze({
      paused: reload.launch.paused,
      mode: reload.launch.mode,
      auto: reload.launch.auto,
      inputReleased: reload.launch.inputReleased,
      authority: authorityLabel(reload.authority),
      cameraEntityId: reload.cameraEntityId,
      entities: reload.entities.total,
      vehicles: reload.entities.vehicles,
      bodiesCreated: reload.launch.bodiesCreated,
      heldKeysActive: reload.launch.heldKeysActive,
      neutralizedKeys: reload.neutralizedKeys,
      xpBalance: reload.counts.xpBalance,
      xpMicroXp: reload.counts.xpBalanceMicroXp,
      dailyRewards: reload.counts.dailyRewards,
      settlements: reload.counts.settlements,
      openSegmentId: reload.segments.openSegmentId,
      secondReadSameDigest:
        secondRead.status === 'ACCEPTED' &&
        walkingSaveDigest(secondRead.document) === walkingSaveDigest(read.document),
      secondReadSameCounts:
        secondReload !== null && digestOf(secondReload.counts) === digestOf(reload.counts),
    }),
    checks: Object.freeze(checks),
    verdict: failedChecks.length === 0 ? 'PASS' : 'FAIL',
    failedChecks: Object.freeze(failedChecks),
  });
  return Object.freeze({
    row,
    document,
    catalog: harness.catalog,
    vehicleIds,
    sourceText,
    world: fixture?.world ?? null,
    storeUntouched,
  });
}

interface RefusalOutcome {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

function readCode(input: unknown, expect: WalkingSaveExpectationInput): RefusalOutcome {
  const result = readWalkingSave(input, expect);
  return result.status === 'ACCEPTED'
    ? { code: 'ACCEPTED', path: '', message: '' }
    : {
        code: result.rejection.code,
        path: result.rejection.path,
        message: result.rejection.message,
      };
}

function upgradeCode(input: unknown, options: WalkingSaveMigrationOptions): RefusalOutcome {
  const result = upgradeWalkingSave(input, options);
  return result.status === 'ACCEPTED'
    ? { code: 'ACCEPTED', path: '', message: '' }
    : {
        code: result.rejection.code,
        path: result.rejection.path,
        message: result.rejection.message,
      };
}

function reloadCode(
  document: WalkingSaveDocument,
  expect: WalkingSaveExpectationInput,
  vehicleIds: readonly string[],
): RefusalOutcome {
  const result = readWalkingSave(document, { ...expect, vehicleIds });
  if (result.status === 'REJECTED') {
    return {
      code: result.rejection.code,
      path: result.rejection.path,
      message: result.rejection.message,
    };
  }
  try {
    walkingSaveReload(result, { vehicleIds });
    return { code: 'ACCEPTED', path: '', message: '' };
  } catch (error) {
    if (error instanceof WalkingSaveError) {
      return { code: error.code, path: error.path, message: error.message };
    }
    throw error;
  }
}

function refusal(
  id: string,
  label: string,
  mutation: string,
  input: unknown,
  run: () => RefusalOutcome,
): WalkingSaveRefusalRow {
  const before = digestOf(input);
  const result = run();
  const after = digestOf(input);
  return Object.freeze({
    id,
    label,
    mutation,
    code: result.code,
    path: result.path,
    message: result.message,
    inputUnchanged: before === after,
    pass: result.code !== 'ACCEPTED' && before === after,
  });
}

/** A point inside the first authored building: the real walker must refuse to stand there. */
function blockedSpawn(): Readonly<{
  positionM: { x: number; y: number; z: number };
  yawRad: number;
}> {
  const spot = realBuildingSpot();
  return Object.freeze({
    positionM: Object.freeze({ x: spot.faceX, y: spot.start.y, z: spot.faceZ + 1 }),
    yawRad: 0,
  });
}

export function walkingSaveReportDigest(report: Omit<WalkingSaveReport, 'determinism'>): string {
  return digestOf(report);
}

export async function runWalkingSaveReport(): Promise<WalkingSaveReport> {
  const walking = await runScenario({
    id: 'V2_WALKING',
    label: 'V2 → V3, personaj pe jos',
    tick: 40,
    kind: 'WALKING',
    source: 'V2',
    storeCheck: true,
  });
  const seated = await runScenario({
    id: 'V2_SEATED',
    label: 'V2 → V3, personaj în taxi',
    tick: 41,
    kind: 'SEATED',
    source: 'V2',
  });
  const fallback = await runScenario({
    id: 'V2_DEFAULT',
    label: 'V2 → V3, sesiune fără slot de personaj',
    tick: 40,
    kind: 'DEFAULT',
    source: 'V2',
  });
  const legacy = await runScenario({
    id: 'V1_LEGACY',
    label: 'V1 → V3, arhiva 135 fără economie',
    tick: 40,
    kind: 'DEFAULT',
    source: 'V1',
  });
  const scenarios = Object.freeze([walking.row, seated.row, fallback.row, legacy.row]);
  const base = walking;
  const expect: WalkingSaveExpectationInput = {
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    catalog: base.catalog,
    vehicleIds: base.vehicleIds,
  };
  const document = base.document;
  const refusals: WalkingSaveRefusalRow[] = [];
  const tamperedChecksum = clone(document) as unknown as {
    checksum: { algorithm: string; canonicalization: string; value: string };
  };
  tamperedChecksum.checksum.value = `${'0'.repeat(63)}1`;
  refusals.push(
    refusal(
      'CHECKSUM',
      'Checksum modificat',
      'checksum.value rescris, fără recalculare',
      tamperedChecksum,
      () => readCode(tamperedChecksum, expect),
    ),
  );
  const missingSlot = reStamped(document, (draft) => {
    delete (draft.components as unknown as Record<string, unknown>).character;
  });
  refusals.push(
    refusal(
      'MISSING_SLOT',
      'Slot de personaj lipsă',
      'components.character șters, envelope re-stampat',
      missingSlot,
      () => readCode(missingSlot, expect),
    ),
  );
  const futureFormat = reStamped(document, (draft) => {
    (draft as unknown as { formatVersion: number }).formatVersion = 4;
  });
  refusals.push(
    refusal(
      'FUTURE_FORMAT',
      'Format viitor',
      'formatVersion = 4, envelope re-stampat',
      futureFormat,
      () => readCode(futureFormat, expect),
    ),
  );
  const futureSchema = reStamped(document, (draft) => {
    (draft as unknown as { schemaVersion: number }).schemaVersion = 4;
  });
  refusals.push(
    refusal(
      'FUTURE_SCHEMA',
      'Schemă viitoare',
      'schemaVersion = 4, envelope re-stampat',
      futureSchema,
      () => readCode(futureSchema, expect),
    ),
  );
  const staleSchema = clone(document);
  (staleSchema as unknown as { schemaVersion: number }).schemaVersion = 4;
  refusals.push(
    refusal(
      'CHECKSUM_BEFORE_SCHEMA',
      'Schemă viitoare cu checksum stricat',
      'schemaVersion = 4 fără re-stampare',
      staleSchema,
      () => readCode(staleSchema, expect),
    ),
  );
  const invalidJson = JSON.stringify(document).slice(0, 120);
  refusals.push(
    refusal(
      'PARSE_ERROR',
      'JSON invalid',
      'document trunchiat la 120 de caractere',
      invalidJson,
      () => readCode(invalidJson, expect),
    ),
  );
  const duplicateKey = JSON.stringify(document).replace('{', '{"format":"dup","format":"dup",');
  refusals.push(
    refusal('DUPLICATE_KEY', 'Chei duplicate', 'cheia format duplicată în text', duplicateKey, () =>
      readCode(duplicateKey, expect),
    ),
  );
  refusals.push(
    refusal(
      'LEGACY_READ',
      'Arhivă V2 citită ca V3',
      'documentul V2 dat cititorului V3',
      base.sourceText,
      () => readCode(base.sourceText, expect),
    ),
  );
  refusals.push(
    refusal('ALREADY_CURRENT', 'Arhivă deja V3', 'upgrade pe un document V3', document, () =>
      upgradeCode(document, {
        createdAt: WALKING_SAVE_MIGRATION_CREATED_AT,
        catalog: base.catalog,
        expect: { sessionId: ARCHIVE_SESSION_ID, playerId: ARCHIVE_PLAYER_ID },
      }),
    ),
  );
  const wrongSession = reStamped(document, (draft) => {
    const character = draft.components.character as unknown as Record<string, unknown>;
    character.sessionId = 'session-other';
  });
  refusals.push(
    refusal(
      'SESSION_MISMATCH',
      'Slot din altă sesiune',
      'character.sessionId schimbat, envelope re-stampat',
      wrongSession,
      () => readCode(wrongSession, expect),
    ),
  );
  const wrongSizes = reStamped(document, (draft) => {
    (draft.sizes as unknown as { character: number }).character += 1;
  });
  refusals.push(
    refusal(
      'SIZE_MISMATCH',
      'Bilanț de mărime mincinos',
      'sizes.character + 1, envelope re-stampat',
      wrongSizes,
      () => readCode(wrongSizes, expect),
    ),
  );
  const cameraOffAuthority = reStamped(document, (draft) => {
    const character = draft.components.character as unknown as {
      camera: { entityId: string | null; knownEntityIds: readonly string[] };
      vehicleIds: readonly string[];
    };
    const other = character.vehicleIds[0] ?? null;
    character.camera.entityId = other;
    if (other !== null && !character.camera.knownEntityIds.includes(other)) {
      character.camera.knownEntityIds = [...character.camera.knownEntityIds, other].sort();
    }
  });
  refusals.push(
    refusal(
      'CAMERA_AUTHORITY',
      'Camera pe altă entitate',
      'character.camera.entityId mutat pe un vehicul, envelope re-stampat',
      cameraOffAuthority,
      () => readCode(cameraOffAuthority, expect),
    ),
  );
  const authorityMismatch = reStamped(document, (draft) => {
    const character = draft.components.character as unknown as {
      fleet: { authority: { consumer: string; characterId?: string; vehicleId?: string } };
    };
    character.fleet.authority = { consumer: 'CHARACTER', characterId: 'character:other' };
  });
  refusals.push(
    refusal(
      'AUTHORITY_MISMATCH',
      'Autoritate 193 ≠ flotă 197',
      'fleet.authority numește alt personaj, envelope re-stampat',
      authorityMismatch,
      () => readCode(authorityMismatch, expect),
    ),
  );
  const tickMismatch = reStamped(document, (draft) => {
    (draft.components.character as unknown as { tick: number }).tick += 1;
  });
  refusals.push(
    refusal(
      'TICK_MISMATCH',
      'Tick incoerent',
      'character.tick + 1, envelope re-stampat',
      tickMismatch,
      () => readCode(tickMismatch, expect),
    ),
  );
  const economyTampered = reStamped(document, (draft) => {
    const economy = draft.components.economy as unknown as {
      components: { player: { accountedThroughMs: number } };
    };
    economy.components.player.accountedThroughMs += 1;
  });
  refusals.push(
    refusal(
      'XP_TAMPERED',
      'XP modificat în slotul economic',
      'accountedThroughMs + 1, doar envelope-ul V3 re-stampat',
      economyTampered,
      () => readCode(economyTampered, expect),
    ),
  );
  const worldTampered = reStamped(document, (draft) => {
    const checkpoint = (
      draft.components.session.components as unknown as {
        checkpoint: { body: { tick: number } };
      }
    ).checkpoint;
    checkpoint.body.tick += 1;
  });
  refusals.push(
    refusal(
      'WORLD_TAMPERED',
      'Lume modificată în slotul 135',
      'checkpoint.body.tick + 1, doar envelope-ul V3 re-stampat',
      worldTampered,
      () => readCode(worldTampered, expect),
    ),
  );
  refusals.push(
    refusal(
      'ENTITY_SET',
      'Set de entități diferit la reload',
      'un vehicul viu în plus',
      document,
      () => reloadCode(document, expect, [...base.vehicleIds, 'vehicle:extra']),
    ),
  );
  refusals.push(
    refusal(
      'SPAWN_BLOCKED',
      'Spawn blocat',
      'spawn în interiorul primei clădiri autorate',
      base.sourceText,
      () =>
        upgradeCode(base.sourceText, {
          createdAt: WALKING_SAVE_MIGRATION_CREATED_AT,
          catalog: base.catalog,
          expect: { sessionId: ARCHIVE_SESSION_ID, playerId: ARCHIVE_PLAYER_ID },
          spawn: blockedSpawn(),
          walkWorld: realWalkWorld().world,
          characterId: 'character:player-1',
        }),
    ),
  );

  const scenarioChecks = scenarios.flatMap((row) => row.checks);
  const refusalChecks: WalkingSaveCheck[] = refusals.map((entry) =>
    Object.freeze({
      name: `refusal:${entry.id}`,
      expected: entry.code,
      actual: entry.code,
      pass: entry.pass,
    }),
  );
  const checks: readonly WalkingSaveCheck[] = Object.freeze([...scenarioChecks, ...refusalChecks]);
  const passed = scenarios.filter((row) => row.verdict === 'PASS').length;
  const migrationPreservesEverything = scenarios.every((row) => row.componentsIdentical);
  const reloadCoherent = scenarios.every(
    (row) =>
      row.reload.paused &&
      row.reload.mode === 'PAUSED_AUTO' &&
      row.reload.auto &&
      row.reload.inputReleased &&
      row.reload.heldKeysActive === 0,
  );
  const noDuplicates = scenarios.every(
    (row) =>
      row.reload.bodiesCreated === 0 &&
      row.reload.entities === row.reload.vehicles + 1 &&
      row.reload.secondReadSameDigest &&
      row.reload.secondReadSameCounts,
  );
  const refusalsClosed = refusals.filter((entry) => entry.pass).length;
  const summary = Object.freeze({
    checks: checks.length,
    passed: checks.filter((entry) => entry.pass).length,
    scenarios: scenarios.length,
    scenariosPassed: passed,
    refusals: refusals.length,
    refusalsClosed,
    migrationPreservesEverything,
    reloadCoherent,
    noDuplicates,
    storeUntouched: walking.storeUntouched,
    pass:
      passed === scenarios.length &&
      refusalsClosed === refusals.length &&
      walking.storeUntouched &&
      migrationPreservesEverything &&
      reloadCoherent &&
      noDuplicates,
  });
  const report = Object.freeze({
    contract: WALKING_SAVE_REPORT_CONTRACT,
    command: WALKING_SAVE_REPORT_COMMAND,
    version: WALKING_SAVE_VERSION,
    formatVersions: Object.freeze({
      session135: 1 as const,
      economy215: 2 as const,
      current: 3 as const,
    }),
    schemaVersion: WALKING_SAVE_SCHEMA_VERSION,
    characterVersion: WALKING_CHARACTER_VERSION,
    limits: WALKING_SAVE_LIMITS,
    launch: WALKING_SAVE_LAUNCH,
    defaultRule: DEFAULT_RULE,
    scenarios,
    refusals: Object.freeze(refusals),
    checks,
    summary,
    limitations: Object.freeze([
      'Walker-ul 192 nu expune un invers al stării: reluarea recreează corpul la poziția salvată (biți identici) și tick-ul walker-ului repornește de la 0, în timp ce tick-ul sesiunii rămâne cel salvat în slot.',
      'Slotul este un contract pur: cablarea din aplicație (pauză, capturare la export, aplicarea la reload) rămâne a consumatorului; modulul nu scrie în IndexedDB și nu creează writer.',
      'Camera salvată în mijlocul unei tranziții de 18 tick-uri este restaurată exact (17 tick-uri rămase), dar continuarea ei depinde de tick-urile reale ale consumatorului.',
      'Spațiul de nume al vehiculelor din slot este lista de entități a lumii (maximum 128 din 206); un vehicul care nu există în lume nu poate fi salvat.',
    ]),
  });
  const determinism = await determinismOf(report, scenarios);
  return Object.freeze({ ...report, determinism });
}

async function determinismOf(
  report: Omit<WalkingSaveReport, 'determinism'>,
  scenarios: readonly WalkingSaveScenarioRow[],
): Promise<WalkingSaveReport['determinism']> {
  // The document digest is the reproducible identity of the produced archive: the same session and
  // the same owner states must always produce the same bytes, key order and checksum.
  const again = await runScenario({
    id: 'V2_WALKING',
    label: 'V2 → V3, personaj pe jos (a doua rulare)',
    tick: 40,
    kind: 'WALKING',
    source: 'V2',
  });
  const first = scenarios[0];
  const identical =
    first !== undefined &&
    again.row.documentDigest === first.documentDigest &&
    again.row.checksum === first.checksum &&
    digestOf(again.row.counts) === digestOf(first.counts);
  return Object.freeze({
    runs: 2,
    identical,
    digest: sha256Hex(canonicalTextOf(report)),
    scenarioDigests: Object.freeze(scenarios.map((row) => row.documentDigest)),
  });
}

function canonicalTextOf(value: unknown): string {
  const canonical = canonicalizeJson(value, { maxDepth: WALKING_SAVE_LIMITS.maxDepth });
  if (canonical.status === 'REJECTED') {
    throw new Error(`The report is not canonical: ${canonical.rejection.message}`);
  }
  return canonical.text;
}

export { WALKING_SAVE_FORMAT_VERSION };
