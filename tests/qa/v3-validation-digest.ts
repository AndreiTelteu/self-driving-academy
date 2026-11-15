/**
 * PBI 201 — criteriul 2: mersul pe jos nu alterează catalogul, capabilitățile, KPI-urile sau ledgerul
 * XP, nici după reluarea sesiunii prin 200.
 *
 * Dovada este un digest, nu o impresie. Se compară octeții canonici ai:
 * - catalogului 092 (`Docs/driving-parameters.json` + registrul derivat);
 * - tabelului de capabilități 187 (`parameterCapabilities`);
 * - KPI-ului 209 din bundle-ul economic real al sesiunii;
 * - ledgerului XP 213 din același bundle.
 *
 * Măsurătoarea „înainte" este luată pe bundle-ul real care intră în arhiva 215. Între cele două
 * măsurători rulează o sesiune de mers reală de mii de tick-uri (192 + 193 + 194 + 198). Apoi
 * arhiva este migrată la v3 prin 200, citită și reluată, iar digesteurile se recalculează din
 * documentul reluat. Orice diferență de octeți este un FAIL, nu o rotunjire.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readWalkingSave,
  restoreWalkingSave,
  upgradeWalkingSave,
  walkingSaveDigest,
} from '../../src/persistence/index';
import type { WalkingSaveDocument } from '../../src/persistence/index';
import { parameterCapabilities } from '../../src/profiles/parameter-capabilities';
import { parameterCatalogData } from '../../src/profiles/parameter-catalog.generated';
import { parameterRegistry } from '../../src/profiles/index';
import {
  ARCHIVE_CREATED_AT,
  ARCHIVE_PLAYER_ID,
  ARCHIVE_SESSION_ID,
} from '../persistence/session-archive-fixture';
import {
  createWalkingArchive,
  exportWalkingArchive,
  saveWalkingEconomy,
  slotOf,
  walkingFixture,
} from '../persistence/walking-save-fixture';

export const V3_DIGEST_CONTRACT = '201-v3-validation-digest-v1';
export const V3_WALK_TICKS = 5_000;

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function digestJson(value: unknown): string {
  return sha256(JSON.stringify(value));
}

export interface V3Digest {
  readonly id: string;
  readonly label: string;
  readonly source: string;
  readonly before: string;
  readonly afterWalks: string;
  readonly afterReload: string;
  readonly identicalAfterWalks: boolean;
  readonly identicalAfterReload: boolean;
}

export interface V3DigestReport {
  readonly contract: string;
  readonly command: string;
  readonly walkTicks: number;
  readonly sessionId: string;
  readonly digests: readonly V3Digest[];
  readonly walking: Readonly<{
    ticks: number;
    distanceM: number;
    closedSegments: number;
    candidates: number;
    walkerDistanceM: number;
    walkerPositionWrites: number;
    positionBits: string;
  }>;
  readonly bundle: Readonly<{
    kpiDays: number;
    kpiMonths: number;
    ledgerSettlements: number;
    ledgerEntries: number;
    xpEntries: number;
    dailyRows: number;
  }>;
  readonly read: Readonly<{ status: string; checksumVerified: boolean }>;
  readonly reload: Readonly<{
    status: string;
    authority: string;
    cameraEntityId: string;
    entities: number;
    characters: number;
    vehicles: number;
    created: number;
    xpBalance: number;
    xpMicroXp: number;
    level: number;
    dailyRewards: number;
    settlements: number;
    openSegmentId: string | null;
    closedSegments: number;
    candidates: number;
    neutralizedKeys: number;
    secondReadSameDigest: boolean;
    walkingSaveDigest: string;
  }>;
  readonly summary: Readonly<{
    entries: number;
    identical: number;
    pass: boolean;
    determinism: boolean;
    digest: string;
  }>;
  readonly limitations: readonly string[];
}

function componentsDigest(economy: unknown): {
  readonly kpi: string;
  readonly xp: string;
  readonly ledger: string;
  readonly daily: string;
} {
  const envelope = economy as { readonly components?: unknown };
  const bundle = (envelope?.components ?? economy) as {
    readonly daily?: unknown;
    readonly economy?: { readonly kpi?: unknown; readonly ledger?: unknown };
    readonly player?: unknown;
    readonly kpi?: unknown;
    readonly ledger?: unknown;
  };
  return Object.freeze({
    kpi: digestJson(bundle.economy?.kpi ?? bundle.kpi ?? null),
    xp: digestJson(bundle.player ?? null),
    ledger: digestJson(bundle.economy?.ledger ?? bundle.ledger ?? null),
    daily: digestJson(bundle.daily ?? null),
  });
}

let cached: Promise<V3DigestReport> | null = null;

/** O singură rulare reală, refolosită de test și de raport (arhiva este IndexedDB în memorie). */
export function runV3DigestValidation(): Promise<V3DigestReport> {
  cached ??= build();
  return cached;
}

async function build(): Promise<V3DigestReport> {
  // 1. Catalogul 092 și tabelul 187, citite din fișier și din modulele reale.
  const catalogBytes = await readFile(join(root, 'Docs', 'driving-parameters.json'));
  const catalogFile = sha256(catalogBytes);
  const catalogData = digestJson(parameterCatalogData);
  const registry = digestJson(parameterRegistry);
  const capabilities = digestJson(parameterCapabilities);

  // 2. Bundle-ul economic real al sesiunii (209 KPI + 213 XP + 209 ledger + 211/212 daily).
  const harness = await createWalkingArchive({ tick: V3_WALK_TICKS, dbName: '201-v3-digest' });
  const components = await saveWalkingEconomy(harness);
  const v2Before = (await exportWalkingArchive(harness)).document;
  const before = componentsDigest(
    (v2Before as { readonly components: { readonly economy: unknown } }).components.economy,
  );
  const sessionBefore = digestJson(
    (v2Before as { readonly components: { readonly session: unknown } }).components.session,
  );
  const bundleCounts = Object.freeze({
    kpiDays: (components.economy.kpi as { readonly days?: readonly unknown[] }).days?.length ?? 0,
    kpiMonths:
      (components.economy.kpi as { readonly months?: readonly unknown[] }).months?.length ?? 0,
    ledgerSettlements:
      (components.economy.ledger as { readonly settlements?: readonly unknown[] }).settlements
        ?.length ?? 0,
    ledgerEntries:
      (components.economy.ledger as { readonly entries?: readonly unknown[] }).entries?.length ?? 0,
    xpEntries:
      (components.player as { readonly entries?: readonly unknown[] }).entries?.length ?? 0,
    dailyRows: (components.daily as { readonly rows?: readonly unknown[] }).rows?.length ?? 0,
  });

  // 3. Sesiunea de mers reală: 5000 de tick-uri de walker + cameră + segmente.
  const fixture = walkingFixture(harness.world, { tick: V3_WALK_TICKS });
  const walking = Object.freeze({
    ticks: harness.tick,
    distanceM: fixture.segments.getStats().counters.walkingDistanceM,
    closedSegments: fixture.segments.getStats().counters.closedSegments,
    candidates: fixture.segments.getStats().counters.candidates,
    walkerDistanceM: fixture.walker.stats.distanceM,
    walkerPositionWrites: fixture.walker.stats.positionWrites,
    positionBits: fixture.walker.positionBits(),
  });

  // 4. Aceleași digeste, recalculate după mers din arhiva re-exportată: nu doar obiectul din
  //    memorie, ci octeții pe care depozitul îi returnează după sesiunea de mers.
  const v2 = (await exportWalkingArchive(harness)).document;
  const economyAfterWalks = componentsDigest(
    (v2 as { readonly components: { readonly economy: unknown } }).components.economy,
  );
  const afterWalks = economyAfterWalks;
  const afterCatalog = Object.freeze({
    file: sha256(await readFile(join(root, 'Docs', 'driving-parameters.json'))),
    data: digestJson(parameterCatalogData),
    registry: digestJson(parameterRegistry),
    capabilities: digestJson(parameterCapabilities),
  });

  // 5. Reload prin 200: arhiva v2 reală + slotul de personaj de după mers → document v3 → citire
  //    strictă → reluare. Economia reluată este comparată octet cu octet cu cea de dinainte.
  const migration = upgradeWalkingSave(JSON.stringify(v2), {
    createdAt: ARCHIVE_CREATED_AT,
    expect: { sessionId: ARCHIVE_SESSION_ID, playerId: ARCHIVE_PLAYER_ID },
    catalog: harness.catalog,
    character: slotOf(fixture),
  });
  if (migration.status !== 'ACCEPTED')
    throw new Error(
      `201 migration refused: ${migration.rejection.code} at ${migration.rejection.path}`,
    );
  const document: WalkingSaveDocument = migration.document;
  const saved = restoreWalkingSave(JSON.stringify(document), {
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    catalog: harness.catalog,
    vehicleIds: fixture.vehicleIds,
  });
  if (saved.status !== 'ACCEPTED')
    throw new Error(`201 reload refused: ${saved.rejection.code} at ${saved.rejection.path}`);
  const reloaded = saved.validation.document;
  const afterReload = componentsDigest(reloaded.components.economy);
  const sessionReloaded = digestJson(reloaded.components.session);
  const sessionAfterWalks = digestJson(
    (v2 as { readonly components: { readonly session: unknown } }).components.session,
  );
  const second = restoreWalkingSave(JSON.stringify(document), {
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    catalog: harness.catalog,
    vehicleIds: fixture.vehicleIds,
  });
  if (second.status !== 'ACCEPTED')
    throw new Error(`201 second reload refused: ${second.rejection.code}`);
  const read = readWalkingSave(JSON.stringify(document), {
    sessionId: ARCHIVE_SESSION_ID,
    playerId: ARCHIVE_PLAYER_ID,
    catalog: harness.catalog,
    vehicleIds: document.components.character.vehicleIds,
  });

  const entries: V3Digest[] = [
    {
      id: 'catalog-092-file',
      label: 'catalogul 092, octeții fișierului',
      source: 'Docs/driving-parameters.json',
      before: catalogFile,
      afterWalks: afterCatalog.file,
      afterReload: afterCatalog.file,
      identicalAfterWalks: catalogFile === afterCatalog.file,
      identicalAfterReload: catalogFile === afterCatalog.file,
    },
    {
      id: 'catalog-092-data',
      label: 'catalogul 092, datele încărcate de aplicație',
      source: 'src/profiles/parameter-catalog.generated.ts',
      before: catalogData,
      afterWalks: afterCatalog.data,
      afterReload: afterCatalog.data,
      identicalAfterWalks: catalogData === afterCatalog.data,
      identicalAfterReload: catalogData === afterCatalog.data,
    },
    {
      id: 'registry-092',
      label: 'registrul de parametri 092',
      source: 'src/profiles/parameter-registry.ts',
      before: registry,
      afterWalks: afterCatalog.registry,
      afterReload: afterCatalog.registry,
      identicalAfterWalks: registry === afterCatalog.registry,
      identicalAfterReload: registry === afterCatalog.registry,
    },
    {
      id: 'capabilities-187',
      label: 'tabelul de capabilități 187',
      source: 'src/profiles/parameter-capabilities.ts',
      before: capabilities,
      afterWalks: afterCatalog.capabilities,
      afterReload: afterCatalog.capabilities,
      identicalAfterWalks: capabilities === afterCatalog.capabilities,
      identicalAfterReload: capabilities === afterCatalog.capabilities,
    },
    {
      id: 'kpi-209',
      label: 'KPI-ul 209 al sesiunii',
      source: 'componenta economy din arhiva 215, secțiunea kpi',
      before: before.kpi,
      afterWalks: afterWalks.kpi,
      afterReload: afterReload.kpi,
      identicalAfterWalks: before.kpi === afterWalks.kpi,
      identicalAfterReload: before.kpi === afterReload.kpi,
    },
    {
      id: 'ledger-209',
      label: 'ledgerul economic 209 al sesiunii',
      source: 'componenta economy din arhiva 215, secțiunea ledger',
      before: before.ledger,
      afterWalks: afterWalks.ledger,
      afterReload: afterReload.ledger,
      identicalAfterWalks: before.ledger === afterWalks.ledger,
      identicalAfterReload: before.ledger === afterReload.ledger,
    },
    {
      id: 'xp-213',
      label: 'ledgerul XP 213 al jucătorului',
      source: 'componenta economy din arhiva 215, secțiunea player',
      before: before.xp,
      afterWalks: afterWalks.xp,
      afterReload: afterReload.xp,
      identicalAfterWalks: before.xp === afterWalks.xp,
      identicalAfterReload: before.xp === afterReload.xp,
    },
    {
      id: 'daily-211',
      label: 'starea zilnică 211/212 a sesiunii',
      source: 'componenta economy din arhiva 215, secțiunea daily',
      before: before.daily,
      afterWalks: afterWalks.daily,
      afterReload: afterReload.daily,
      identicalAfterWalks: before.daily === afterWalks.daily,
      identicalAfterReload: before.daily === afterReload.daily,
    },
    {
      id: 'session-135',
      label: 'documentul de sesiune 135, nemodificat de mers și de migrare',
      source: 'components.session din arhiva v2/v3',
      before: sessionBefore,
      afterWalks: sessionAfterWalks,
      afterReload: sessionReloaded,
      identicalAfterWalks: sessionBefore === sessionAfterWalks,
      identicalAfterReload: sessionBefore === sessionReloaded,
    },
  ];

  const identical = entries.filter(
    (entry) => entry.identicalAfterWalks && entry.identicalAfterReload,
  ).length;
  const pass = identical === entries.length;
  const payload = { entries, walking, reload: saved.reload };
  const determinism = digestJson(payload) === digestJson(JSON.parse(JSON.stringify(payload)));
  const report: V3DigestReport = Object.freeze({
    contract: V3_DIGEST_CONTRACT,
    command: 'npm run qa:v3-validation',
    walkTicks: harness.tick,
    sessionId: ARCHIVE_SESSION_ID,
    digests: Object.freeze(entries),
    walking,
    bundle: bundleCounts,
    read: Object.freeze({
      status: read.status,
      checksumVerified: read.status === 'ACCEPTED' ? read.checksumVerified : false,
    }),
    reload: Object.freeze({
      status: saved.status,
      authority:
        saved.reload.authority.consumer === 'CHARACTER'
          ? `CHARACTER:${saved.reload.authority.characterId}`
          : `VEHICLE:${saved.reload.authority.vehicleId}`,
      cameraEntityId: saved.reload.cameraEntityId,
      entities: saved.reload.entities.total,
      characters: saved.reload.entities.characters,
      vehicles: saved.reload.entities.vehicles,
      created: saved.reload.entities.created,
      xpBalance: saved.reload.counts.xpBalance,
      xpMicroXp: saved.reload.counts.xpBalanceMicroXp,
      level: saved.reload.counts.level,
      dailyRewards: saved.reload.counts.dailyRewards,
      settlements: saved.reload.counts.settlements,
      openSegmentId: saved.reload.segments.openSegmentId,
      closedSegments: saved.reload.segments.closedSegments,
      candidates: saved.reload.segments.candidates,
      neutralizedKeys: saved.reload.neutralizedKeys,
      secondReadSameDigest:
        walkingSaveDigest(second.validation.document) === walkingSaveDigest(document),
      walkingSaveDigest: walkingSaveDigest(document),
    }),
    summary: Object.freeze({
      entries: entries.length,
      identical,
      pass,
      determinism,
      digest: digestJson(payload),
    }),
    limitations: Object.freeze([
      'Dovada este un digest canonic; ea nu dovedește percepția jucătorului și nici un FPS. Ea dovedește că mersul nu scrie în catalog, capabilități, KPI sau XP.',
      'Sesiunea de mers rulează headless, în Node, pe harta autorată; renderul Babylon și inputul uman rămân în afara acestei probe.',
      'Bundle-ul economic este cel real al fixture-ului 215; cifrele XP/KPI sunt cele produse de modulele 209/213, nu valori alese pentru test.',
      'Reload-ul 200 este o reluare de contract (citire strictă + expectanțe), nu o repornire de browser; el dovedește bytes și coerență, nu timpul de încărcare.',
    ]),
  });
  if (read.status !== 'ACCEPTED')
    throw new Error(`201 strict read refused: ${read.rejection.code} at ${read.rejection.path}`);
  return report;
}
