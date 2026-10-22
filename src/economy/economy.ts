import type { RideRecord } from '../fleet';
import type { LaneGraph } from '../world';
import { createFleetKpi } from './kpi';
import type { EconomyClock, FleetKpi, FleetKpiSnapshot, FleetKpiStats } from './kpi';
import { createFleetLedger } from './ledger';
import type {
  FleetLedger,
  LedgerSnapshot,
  LedgerStats,
  LedgerVehicleKind,
  LedgerOutcome,
  RideSettlement,
} from './ledger';
import { createReviewLedger } from './reviews';
import type {
  ReviewCoefficients,
  ReviewIngestOutcome,
  ReviewLedger,
  ReviewLedgerStats,
  ReviewSnapshot,
  RideReview,
} from './reviews';
import { quoteFare, DEFAULT_TARIFF_SCHEDULE } from './tariffs';
import type { FareQuote, TariffSchedule } from './tariffs';
import {
  readRideEconomicOutcome,
  reviewFactsForRide,
  rideReviewEventId,
  rideSettlementEventId,
} from './ride-outcome';
import type { RideEconomicOutcome, RideOutcomeOptions } from './ride-outcome';

/**
 * 209 fleet economy composition: one commercial ledger, one review ledger and one incremental KPI
 * aggregator, fed only by terminal 061 rides.
 *
 * The facade is deliberately the only integration point:
 *
 * - a terminal taxi ride settles once through the ledger, and the same accepted settlement updates
 *   the day and month KPI buckets in the same call;
 * - a civilian outcome is refused by the ledger before any quote, so civilians can never reach
 *   revenue, rides or reviews;
 * - a review is produced only from the facts of the same ride and only when the passenger had an
 *   evaluable experience; re-ingesting it is idempotent, and rewriting it requires the explicit
 *   `reissueReview` path with an acknowledged model change.
 *
 * The facade owns no clock, world, renderer or store. A KPI read returns the retained counters and
 * never replays the history (`historyScans: 0`).
 */
export const ECONOMY_VERSION = '209-fleet-economy-v1' as const;

export interface RideOutcomeInput extends RideOutcomeOptions {
  readonly ride: RideRecord;
  readonly graph: LaneGraph;
  /** Explicit idempotency key; defaults to the stable `ride-settled:<rideId>` key. */
  readonly eventId?: string;
  /** A real 061 ride record is a taxi ride; the override exists to prove civilian rejection. */
  readonly vehicleKind?: LedgerVehicleKind;
}

export interface EconomyRideResult {
  readonly status: LedgerOutcome['status'];
  readonly outcome: RideEconomicOutcome;
  readonly settlement: LedgerOutcome;
  /** `null` when the settlement was rejected before any review could exist. */
  readonly review: ReviewIngestOutcome | null;
}

export interface ReviewReissueInput extends RideOutcomeOptions {
  readonly ride: RideRecord;
  readonly graph: LaneGraph;
  /** A reissue must be an explicit, new economic event. */
  readonly eventId: string;
  /** The version of the model that replaces the stored review; defaults to the current one. */
  readonly reviewModelVersion?: string;
}

export interface ReviewReissueResult {
  readonly outcome: RideEconomicOutcome;
  readonly previous: RideReview | null;
  readonly review: ReviewIngestOutcome;
}

export interface FleetEconomySnapshot {
  readonly version: string;
  readonly tick: number;
  readonly ledger: LedgerSnapshot;
  readonly reviews: ReviewSnapshot;
  readonly kpi: FleetKpiSnapshot;
  /** Structural proof that a read never rescanned the ledger. */
  readonly historyScans: 0;
}

export interface FleetEconomyStats {
  readonly version: string;
  readonly ledger: LedgerStats;
  readonly reviews: ReviewLedgerStats;
  readonly kpi: FleetKpiStats;
  readonly historyScans: 0;
  readonly disposed: boolean;
}

export interface FleetEconomyOptions {
  readonly namespace?: string;
  readonly schedule?: TariffSchedule;
  readonly reviewCoefficients?: ReviewCoefficients;
  readonly reviewModelVersion?: string;
  readonly clock?: EconomyClock;
  readonly retainedSettlements?: number;
  readonly retainedReviews?: number;
  readonly retainedDays?: number;
  readonly retainedMonths?: number;
}

export interface FleetEconomy {
  readonly version: string;
  readonly namespace: string;
  readonly schedule: TariffSchedule;
  readonly clock: EconomyClock;
  readonly ledger: FleetLedger;
  readonly reviews: ReviewLedger;
  readonly kpi: FleetKpi;
  /** The fixed quote of the real planned ride, before or after it runs. */
  quote(ride: RideRecord, graph: LaneGraph): FareQuote;
  ingestRideOutcome(input: RideOutcomeInput): EconomyRideResult;
  reissueReview(input: ReviewReissueInput): ReviewReissueResult;
  noteProfileActivation(atTick: number, marker: unknown): void;
  /** The stored settlement of one ride, retained by the bounded ledger. */
  settlement(rideId: string): RideSettlement | undefined;
  review(rideId: string): RideReview | undefined;
  snapshot(atTick: number): FleetEconomySnapshot;
  getStats(): FleetEconomyStats;
  reset(): void;
  dispose(): void;
}

function readNamespace(name: string | undefined): string {
  const namespace = name === undefined ? 'city:economy' : name;
  if (typeof namespace !== 'string' || namespace.trim() !== namespace || namespace.length === 0)
    throw new TypeError('Invalid economy namespace');
  return namespace;
}

/** Builds the economy over the real tariff schedule, review model and economy clock. */
export function createFleetEconomy(options: FleetEconomyOptions = {}): FleetEconomy {
  const namespace = readNamespace(options.namespace),
    schedule = options.schedule ?? DEFAULT_TARIFF_SCHEDULE,
    ledger = createFleetLedger({
      namespace,
      schedule,
      ...(options.retainedSettlements === undefined
        ? {}
        : { retainedSettlements: options.retainedSettlements }),
    }),
    reviews = createReviewLedger({
      namespace,
      ...(options.reviewCoefficients === undefined
        ? {}
        : { coefficients: options.reviewCoefficients }),
      ...(options.reviewModelVersion === undefined
        ? {}
        : { modelVersion: options.reviewModelVersion }),
      ...(options.retainedReviews === undefined
        ? {}
        : { retainedReviews: options.retainedReviews }),
    }),
    kpi = createFleetKpi({
      ...(options.clock === undefined ? {} : { clock: options.clock }),
      ...(options.retainedDays === undefined ? {} : { retainedDays: options.retainedDays }),
      ...(options.retainedMonths === undefined ? {} : { retainedMonths: options.retainedMonths }),
    });
  let disposed = false;

  function assertLive(): void {
    if (disposed) throw new Error('Fleet economy disposed');
  }

  function quoteRide(ride: RideRecord, graph: LaneGraph): FareQuote {
    assertLive();
    const outcome = readRideEconomicOutcome(ride, graph);
    return quoteFare(
      {
        plannedDistanceMeters: outcome.plannedDistanceMeters,
        referenceTripDurationSeconds: outcome.referenceTripDurationSeconds,
      },
      schedule,
    );
  }

  function ingestRideOutcome(input: RideOutcomeInput): EconomyRideResult {
    assertLive();
    const outcome = readRideEconomicOutcome(input.ride, input.graph),
      settlement = ledger.ingest({
        eventId: input.eventId ?? rideSettlementEventId(outcome.rideId),
        rideId: outcome.rideId,
        requestId: outcome.requestId,
        taxiId: outcome.taxiId,
        vehicleKind: input.vehicleKind ?? 'TAXI',
        terminalState: outcome.terminalState,
        terminalTick: outcome.terminalTick,
        passengerAboard: outcome.passengerAboard,
        plannedDistanceMeters: outcome.plannedDistanceMeters,
        referenceTripDurationSeconds: outcome.referenceTripDurationSeconds,
      });
    if (settlement.settlement === null)
      // A rejected outcome (including every civilian) leaves the economy untouched: no charge, no
      // KPI update and no review is invented for a ride that was never billed.
      return Object.freeze({ status: settlement.status, outcome, settlement, review: null });
    if (settlement.status === 'ACCEPTED') kpi.applySettlement(settlement.settlement);
    const review = reviews.ingest({
      eventId: rideReviewEventId(outcome.rideId),
      facts: reviewFactsForRide(outcome, withTelemetry(input)),
    });
    if (review.status === 'ACCEPTED' && review.review !== null) kpi.applyReview(review.review);
    return Object.freeze({ status: settlement.status, outcome, settlement, review });
  }

  function reissueReview(input: ReviewReissueInput): ReviewReissueResult {
    assertLive();
    const outcome = readRideEconomicOutcome(input.ride, input.graph),
      previous = reviews.review(outcome.rideId) ?? null,
      review = reviews.reissue({
        eventId: input.eventId,
        acknowledgeModelChange: true,
        ...(input.reviewModelVersion === undefined
          ? {}
          : { reviewModelVersion: input.reviewModelVersion }),
        facts: reviewFactsForRide(outcome, withTelemetry(input)),
      });
    if (review.status === 'REISSUED' && previous !== null && review.review !== null)
      kpi.applyReviewRevision(previous, review.review);
    return Object.freeze({ outcome, previous, review });
  }

  return Object.freeze({
    version: ECONOMY_VERSION,
    namespace,
    schedule,
    clock: kpi.clock,
    ledger,
    reviews,
    kpi,
    quote: quoteRide,
    ingestRideOutcome,
    reissueReview,
    noteProfileActivation(atTick: number, marker: unknown): void {
      assertLive();
      kpi.noteProfileActivation(atTick, marker);
    },
    settlement(rideId: string): RideSettlement | undefined {
      if (disposed) return undefined;
      return ledger.settlement(rideId);
    },
    review(rideId: string): RideReview | undefined {
      if (disposed) return undefined;
      return reviews.review(rideId);
    },
    snapshot(atTick: number): FleetEconomySnapshot {
      assertLive();
      return Object.freeze({
        version: ECONOMY_VERSION,
        tick: atTick,
        ledger: ledger.snapshot(atTick),
        reviews: reviews.snapshot(atTick),
        kpi: kpi.snapshot(atTick),
        historyScans: 0 as const,
      });
    },
    getStats(): FleetEconomyStats {
      if (disposed)
        return Object.freeze({
          version: ECONOMY_VERSION,
          ledger: ledger.getStats(),
          reviews: reviews.getStats(),
          kpi: kpi.getStats(),
          historyScans: 0 as const,
          disposed: true,
        });
      return Object.freeze({
        version: ECONOMY_VERSION,
        ledger: ledger.getStats(),
        reviews: reviews.getStats(),
        kpi: kpi.getStats(),
        historyScans: 0 as const,
        disposed: false,
      });
    },
    reset(): void {
      assertLive();
      ledger.reset();
      reviews.reset();
      kpi.reset();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      ledger.dispose();
      reviews.dispose();
      kpi.dispose();
    },
  });
}

function withTelemetry(input: RideOutcomeOptions): RideOutcomeOptions {
  return {
    ...(input.comfort === undefined ? {} : { comfort: input.comfort }),
    ...(input.blockedSeconds === undefined ? {} : { blockedSeconds: input.blockedSeconds }),
    ...(input.profileVersions === undefined ? {} : { profileVersions: input.profileVersions }),
    ...(input.preferenceSeed === undefined ? {} : { preferenceSeed: input.preferenceSeed }),
  };
}
