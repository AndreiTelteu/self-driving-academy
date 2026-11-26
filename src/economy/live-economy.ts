import { requireContract, tick } from '../sessions';
import type { LedgerTotals, RideSettlement } from './ledger';
import type { EconomyClock, FleetKpiBucket, FleetKpiSnapshot, RevenueProjection } from './kpi';
import type { RideReview } from './reviews';

/**
 * 266 live economy read model.
 *
 * The live composition feeds the unchanged 209 economy with the terminal rides of the real 061/265
 * lifecycle. This module only projects what the owners already aggregate:
 *
 * - the economic tick is the authoritative tick that the shell actually advanced; a paused, focused
 *   out or offline game produces no step, so the economic clock cannot advance and no revenue can be
 *   invented;
 * - the day and month buckets are the 209 `currentDay`/`currentMonth` snapshots, including their
 *   `exposureSeconds`; a bucket without events stays `null`, never a fabricated zero;
 * - the epoch is the live reporting series. A session reset starts a new epoch, but the ledger, the
 *   reviews and the KPI buckets are never cleared, so the history of the previous epoch is preserved.
 *
 * The read is incremental: `ledger.totals()` and `kpi.snapshot()` are the only calls, so
 * `historyScans` stays structurally `0`. No ledger, review page or chart is rebuilt here.
 */
export const LIVE_ECONOMY_VERSION = '266-live-economy-v1' as const;

export const LIVE_ECONOMY_LIMITS = Object.freeze({
  version: LIVE_ECONOMY_VERSION,
  /** Retained settlement identities; the lifecycle itself retains only terminal receipts. */
  retainedSettledRides: 4_096,
  /** Closed counter of live comfort samples kept for the report. */
  maximumComfortSamples: 1_000_000,
});

export interface LiveEconomyEpoch {
  /** 1 for the first live series; incremented by an explicit scenario/session reset. */
  readonly index: number;
  /** Authoritative tick at which the series started. */
  readonly startTick: number;
  /** Number of explicit starts (a reset always starts exactly one new epoch). */
  readonly resets: number;
}

export const LIVE_ECONOMY_FIRST_EPOCH: LiveEconomyEpoch = Object.freeze({
  index: 1,
  startTick: 0,
  resets: 0,
});

export interface LiveEconomyCounters {
  /** Terminal 061 rides observed through the live lifecycle. */
  readonly terminalRides: number;
  /** Settlements accepted by the 209 ledger. */
  readonly settlements: number;
  /** Re-delivered settlements that changed nothing. */
  readonly duplicates: number;
  /** Outcomes the 209 ledger rejected. */
  readonly rejected: number;
  /** Reviews accepted by the 209 review ledger. */
  readonly reviews: number;
  /** Civilian terminal outcomes refused before any quote; structurally `0` in the live path. */
  readonly civilians: number;
  /** Real passenger speed samples used by the 139 comfort derivation. */
  readonly comfortSamples: number;
  /** Accepted 139 passenger intervals. */
  readonly comfortIntervals: number;
}

export const EMPTY_LIVE_ECONOMY_COUNTERS: LiveEconomyCounters = Object.freeze({
  terminalRides: 0,
  settlements: 0,
  duplicates: 0,
  rejected: 0,
  reviews: 0,
  civilians: 0,
  comfortSamples: 0,
  comfortIntervals: 0,
});

export interface LiveEconomySnapshot {
  readonly version: typeof LIVE_ECONOMY_VERSION;
  /** Authoritative tick of the last processed step; equal to the economic clock. */
  readonly tick: number;
  readonly epoch: LiveEconomyEpoch;
  readonly clock: EconomyClock;
  readonly totals: LedgerTotals;
  /** The bucket of the current simulated day; `null` when that day has no economic event yet. */
  readonly today: FleetKpiBucket | null;
  /** The bucket of the current simulated month; `null` when that month has no event yet. */
  readonly month: FleetKpiBucket | null;
  readonly projection: RevenueProjection;
  readonly lastSettlement: RideSettlement | null;
  readonly lastReview: RideReview | null;
  readonly counters: LiveEconomyCounters;
  /** Structural proof that a live read never rescanned the ledger, reviews or KPI history. */
  readonly historyScans: 0;
}

export interface LiveEconomyReadInput {
  readonly atTick: number;
  readonly epoch: LiveEconomyEpoch;
  readonly totals: LedgerTotals;
  readonly kpi: FleetKpiSnapshot;
  readonly lastSettlement: RideSettlement | null;
  readonly lastReview: RideReview | null;
  readonly counters: LiveEconomyCounters;
}

function counter(value: unknown, label: string): number {
  requireContract(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    `Live economy ${label} counter is invalid`,
  );
  return value;
}

export function parseLiveEconomyEpoch(value: unknown): LiveEconomyEpoch {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Live economy epoch must be an object',
  );
  const data = value as Record<string, unknown>;
  const index = counter(data.index, 'epoch'),
    startTick = tick(data.startTick),
    resets = counter(data.resets, 'reset');
  requireContract(index >= 1, 'Live economy epoch index must start at 1');
  requireContract(resets === index - 1, 'Live economy epoch index and reset count disagree');
  return Object.freeze({ index, startTick, resets });
}

export function parseLiveEconomyCounters(value: unknown): LiveEconomyCounters {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Live economy counters must be an object',
  );
  const data = value as Record<string, unknown>;
  const counters = Object.freeze({
    terminalRides: counter(data.terminalRides, 'terminal ride'),
    settlements: counter(data.settlements, 'settlement'),
    duplicates: counter(data.duplicates, 'duplicate'),
    rejected: counter(data.rejected, 'rejected'),
    reviews: counter(data.reviews, 'review'),
    civilians: counter(data.civilians, 'civilian'),
    comfortSamples: counter(data.comfortSamples, 'comfort sample'),
    comfortIntervals: counter(data.comfortIntervals, 'comfort interval'),
  });
  requireContract(
    counters.settlements + counters.duplicates + counters.rejected <= counters.terminalRides,
    'Live economy counters exceed the observed terminal rides',
  );
  requireContract(
    counters.reviews <= counters.settlements,
    'Live economy reviews exceed the settlements',
  );
  return counters;
}

/** Freezes the live read from the already incremental 209 owners; no history is rescanned. */
export function readLiveEconomySnapshot(input: unknown): LiveEconomySnapshot {
  requireContract(
    typeof input === 'object' && input !== null && !Array.isArray(input),
    'Live economy read requires its input',
  );
  const data = input as LiveEconomyReadInput,
    atTick = tick(data.atTick),
    epoch = parseLiveEconomyEpoch(data.epoch),
    counters = parseLiveEconomyCounters(data.counters);
  requireContract(
    typeof data.kpi === 'object' && data.kpi !== null && data.kpi.version === '209-fleet-kpi-v1',
    'Live economy read requires the 209 KPI snapshot',
  );
  requireContract(data.kpi.tick === atTick, 'Live economy KPI snapshot and economic tick disagree');
  requireContract(
    typeof data.totals === 'object' && data.totals !== null,
    'Live economy read requires the 209 ledger totals',
  );
  requireContract(atTick >= epoch.startTick, 'Live economy tick precedes the epoch start');
  return Object.freeze({
    version: LIVE_ECONOMY_VERSION,
    tick: atTick,
    epoch,
    clock: data.kpi.clock,
    totals: data.totals,
    today: data.kpi.currentDay,
    month: data.kpi.currentMonth,
    projection: data.kpi.projection,
    lastSettlement: data.lastSettlement,
    lastReview: data.lastReview,
    counters,
    historyScans: 0 as const,
  });
}
