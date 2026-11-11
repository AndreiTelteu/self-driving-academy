import { createFleetKpi, createFleetLedger, createReviewLedger } from '../../src/economy';
import type { EconomySaveBundle } from '../../src/persistence/index';
import {
  createEconomySaveStore,
  createSessionArchiveEconomyStore,
} from '../../src/persistence/index';
import type {
  EconomySaveComponents,
  EconomySaveStore,
  SessionArchiveEconomyExportAccepted,
  SessionArchiveEconomyStore,
} from '../../src/persistence/index';
import {
  createDailyProgress,
  createPlayerProgress,
  dailyMissionSetOrdered,
  recordDailyReward,
} from '../../src/missions';
import type {
  DailyMissionInstance,
  DailyProgressSnapshot,
  DailyRewardRecord,
  PlayerProgressCheckpoint,
} from '../../src/missions';
import { calendarInput, fullCapabilities, step } from '../missions/mission-daily-fixture';
import { activeWindow } from '../missions/player-xp-fixture';
import {
  ARCHIVE_CREATED_AT,
  ARCHIVE_PLAYER_ID,
  ARCHIVE_SESSION_ID,
  ARCHIVE_WORLD_EPOCH,
  createArchiveHarness,
} from './session-archive-fixture';
import type { ArchiveHarness } from './session-archive-fixture';

/**
 * 215 fixture: the real 209 ledger/reviews/KPI, the real 211/212 daily calendar and the real 213 XP
 * ledger of one session, stored through the real 215 bundle and exported through the real version 2
 * archive.
 *
 * Nothing here invents money, a rating, a daily reward or XP: each credit is produced by the module
 * that owns it. The fixture only chooses which real facts happen, at explicit ticks and instants.
 */
export const ECONOMY_SAVE_SESSION_ID = ARCHIVE_SESSION_ID;
export const ECONOMY_SAVE_PLAYER_ID = ARCHIVE_PLAYER_ID;
export const ECONOMY_SAVE_WORLD_EPOCH = ARCHIVE_WORLD_EPOCH;
export const ECONOMY_SAVE_CREATED_AT = ARCHIVE_CREATED_AT;
export const ECONOMY_SAVE_DB_NAME = '215-save-economy-db';
export const ECONOMY_SAVE_TARGET_DB_NAME = '215-save-economy-target';
export const ECONOMY_SAVE_DAILY_DATE = '2026-11-11' as const;

/** Activity instants of the 213 window; the day of the 211 fixture is the same local day. */
const ACTIVE_START_MS = 1_794_475_260_000;
const ACTIVE_DURATION_MS = 30_000;

/** Three terminal taxi rides: completed, failed with a real low review, cancelled after pickup. */
export function createEconomyBundle(): EconomySaveBundle {
  const ledger = createFleetLedger();
  const reviews = createReviewLedger();
  const kpi = createFleetKpi();
  try {
    const rides = [
      { rideId: 'ride:215:completed', terminalState: 'COMPLETED', passengerAboard: true },
      { rideId: 'ride:215:failed', terminalState: 'FAILED', passengerAboard: true },
      { rideId: 'ride:215:cancelled', terminalState: 'CANCELLED', passengerAboard: false },
    ] as const;
    for (const [index, ride] of rides.entries()) {
      const terminalTick = 1_200 * (index + 1);
      const terminalState = ride.terminalState;
      const settlement = ledger.ingest({
        eventId: `economy:215:${index}`,
        rideId: ride.rideId,
        requestId: `request:215:${index}`,
        taxiId: 'taxi:215',
        vehicleKind: 'TAXI',
        terminalState,
        terminalTick,
        passengerAboard: ride.passengerAboard,
        plannedDistanceMeters: 1_500 + index * 100,
        referenceTripDurationSeconds: 120,
      });
      if (settlement.settlement !== null) kpi.applySettlement(settlement.settlement);
      if (!ride.passengerAboard) continue;
      const review = reviews.ingest({
        eventId: `review:215:${index}`,
        facts: {
          rideId: ride.rideId,
          customerId: 'customer:215',
          terminalState,
          terminalTick,
          passengerAboard: true,
          referenceTripDurationSeconds: 120,
          actualTripDurationSeconds: index === 1 ? 600 : 150,
          comfort: null,
        },
      });
      if (review.review !== null) kpi.applyReview(review.review);
    }
    return Object.freeze({
      ledger: ledger.snapshot(5_000),
      reviews: reviews.snapshot(5_000),
      kpi: kpi.snapshot(5_000),
    });
  } finally {
    kpi.dispose();
    reviews.dispose();
    ledger.dispose();
  }
}

/** One real 211 daily set with one real reward and its 212 progress snapshot. */
export function createDailySnapshot(): {
  readonly snapshot: DailyProgressSnapshot;
  readonly instance: DailyMissionInstance;
  readonly record: DailyRewardRecord;
} {
  const first = step({
    playerId: ECONOMY_SAVE_PLAYER_ID,
    calendar: calendarInput(ECONOMY_SAVE_DAILY_DATE),
    capabilities: fullCapabilities(),
  });
  if (first.set === null) throw new Error('Expected a generated 211 daily set');
  const instance = dailyMissionSetOrdered(first.set)[0];
  if (instance === undefined) throw new Error('Expected a 211 daily instance');
  const rewarded = recordDailyReward({
    state: first.state,
    instanceId: instance.instanceId,
    grantedAtMs: calendarInput(ECONOMY_SAVE_DAILY_DATE).observedAtMs,
  });
  if (!rewarded.granted) throw new Error('Expected the first 211 daily reward');
  const progress = createDailyProgress({
    playerId: ECONOMY_SAVE_PLAYER_ID,
    sessionId: ECONOMY_SAVE_SESSION_ID,
    worldEpoch: ECONOMY_SAVE_WORLD_EPOCH,
    calendar: calendarInput(ECONOMY_SAVE_DAILY_DATE),
    capabilities: fullCapabilities(),
    generatedAtMs: calendarInput(ECONOMY_SAVE_DAILY_DATE).observedAtMs,
    state: rewarded.state,
  });
  return Object.freeze({
    snapshot: progress.snapshot(),
    instance,
    record: rewarded.record,
  });
}

/**
 * One real 213 ledger: a real 211 daily reward plus one real active-time window, so the balance is
 * 100,5 XP and the level is 2. Nothing is credited twice.
 */
export function createPlayerCheckpoint(
  instance: DailyMissionInstance,
  record: DailyRewardRecord,
): PlayerProgressCheckpoint {
  const player = createPlayerProgress({ playerId: ECONOMY_SAVE_PLAYER_ID });
  const credited = player.creditDaily({ record, instance });
  if (credited.credited <= 0)
    throw new Error(`Expected the 213 daily credit, got ${credited.status}`);
  const window = player.observeActiveTime(activeWindow(ACTIVE_START_MS, ACTIVE_DURATION_MS));
  if (window.status !== 'CREDITED') {
    throw new Error(`Expected a credited 213 active window, got ${window.status}`);
  }
  return player.checkpoint();
}

export interface SaveEconomyComponents {
  readonly daily: DailyProgressSnapshot;
  readonly economy: EconomySaveBundle;
  readonly player: PlayerProgressCheckpoint;
  readonly instanceId: string;
  readonly rewardId: string;
}

/** The three components of one real session, with the identities a test can assert on. */
export function createEconomyComponents(): SaveEconomyComponents {
  const daily = createDailySnapshot();
  return Object.freeze({
    daily: daily.snapshot,
    economy: createEconomyBundle(),
    player: createPlayerCheckpoint(daily.instance, daily.record),
    instanceId: daily.instance.instanceId,
    rewardId: daily.record.rewardId,
  });
}

export interface Economy215Harness {
  readonly archive: ArchiveHarness;
  readonly economy: EconomySaveStore;
  readonly archiveStore: SessionArchiveEconomyStore;
  readonly components: SaveEconomyComponents;
}

export interface Economy215HarnessOptions {
  readonly dbName?: string;
  readonly components?: SaveEconomyComponents;
}

/** A real session with 135 components plus a stored 215 bundle. */
export async function createEconomy215Harness(
  options: Economy215HarnessOptions = {},
): Promise<Economy215Harness> {
  const archive = await createArchiveHarness({
    dbName: options.dbName ?? ECONOMY_SAVE_DB_NAME,
  });
  const components = options.components ?? createEconomyComponents();
  const economy = createEconomySaveStore({ transactions: archive.transactions });
  const archiveStore = createSessionArchiveEconomyStore({
    repository: archive.repository,
    transactions: archive.transactions,
    catalog: archive.catalog,
  });
  return { archive, economy, archiveStore, components };
}

/** Saves the fixture bundle; a refusal fails the scenario loudly. */
export async function saveFixtureEconomy(
  harness: Economy215Harness,
  overrides: {
    readonly daily?: unknown;
    readonly economy?: unknown;
    readonly player?: unknown;
    readonly createdAt?: string;
  } = {},
): Promise<void> {
  const saved = await harness.economy.save({
    sessionId: ECONOMY_SAVE_SESSION_ID,
    playerId: ECONOMY_SAVE_PLAYER_ID,
    worldEpoch: ECONOMY_SAVE_WORLD_EPOCH,
    createdAt: overrides.createdAt ?? ECONOMY_SAVE_CREATED_AT,
    daily: overrides.daily ?? harness.components.daily,
    economy: overrides.economy ?? harness.components.economy,
    player: overrides.player ?? harness.components.player,
  });
  if (saved.status === 'REJECTED') {
    throw new Error(
      `215 fixture bundle refused: ${saved.rejection.code} at ${saved.rejection.path}: ${saved.rejection.message}`,
    );
  }
}

/** Exports the version 2 archive of the harness session. */
export async function exportFixtureArchive(
  harness: Economy215Harness,
): Promise<SessionArchiveEconomyExportAccepted> {
  const exported = await harness.archiveStore.export({
    sessionId: ECONOMY_SAVE_SESSION_ID,
    playerId: ECONOMY_SAVE_PLAYER_ID,
    createdAt: ECONOMY_SAVE_CREATED_AT,
    catalog: harness.archive.catalog,
  });
  if (exported.status !== 'ACCEPTED') {
    throw new Error(`215 fixture export refused: ${exported.rejection.code}`);
  }
  return exported;
}

/** The bundle components as the store expects them. */
export function componentsOf(components: SaveEconomyComponents): EconomySaveComponents {
  return Object.freeze({
    daily: components.daily,
    economy: components.economy,
    player: components.player,
  });
}
