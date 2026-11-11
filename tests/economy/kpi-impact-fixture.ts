import {
  ECONOMY_CLOCK,
  createFleetKpi,
  createFleetLedger,
  createReviewLedger,
  evaluateReview,
  selectKpiImpact,
} from '../../src/economy';
import type {
  FleetKpi,
  FleetKpiSnapshot,
  KpiImpactRead,
  RideReview,
  RideSettlement,
  TariffOutcomeState,
} from '../../src/economy';
import { comfortForRide } from './economy-fixture';

/**
 * Fixture for PBI 214.
 *
 * Every number is produced by the delivered 209 contracts: settlements and reviews are ingested
 * through the real incremental KPI API, the incident scenario goes through the real commercial and
 * review ledgers, and the control-mode scenario evaluates the real 209 review formula over a real
 * 139 comfort read model. The fixture only chooses which real facts happen and when; it never
 * invents a revenue, a rating or a consequence.
 *
 * There is no wall clock: a simulated day is 1 200 s × 60 Hz, exactly the published economy clock.
 */
export const KPI_IMPACT_DAY_TICKS = ECONOMY_CLOCK.secondsPerDay * ECONOMY_CLOCK.tickHz;
export const KPI_IMPACT_DAYS = 2;

function settlement(
  index: number,
  tick: number,
  netMinorUnits: number,
  terminalState: TariffOutcomeState = 'COMPLETED',
): RideSettlement {
  return Object.freeze({
    settlementId: `settlement-${index}`,
    rideId: `ride-${index}`,
    requestId: `request-${index}`,
    taxiId: `taxi-${String((index % 4) + 1).padStart(2, '0')}`,
    terminalState,
    passengerAboard: terminalState !== 'CANCELLED',
    tick,
    currency: 'SDA',
    pricingVersion: '209-tariff-v1',
    policyVersion: '209-policy-v1',
    rule: terminalState === 'COMPLETED' ? 'COMPLETED_FULL_FARE' : 'FAILED_NO_CHARGE',
    quotedMinorUnits: netMinorUnits,
    chargedMinorUnits: netMinorUnits,
    refundedMinorUnits: 0,
    netMinorUnits,
    chargeEntryId: `charge-${index}`,
    refundEntryId: null,
  });
}

function review(index: number, tick: number, rating: number): RideReview {
  return Object.freeze({
    reviewId: `review-${index}`,
    rideId: `ride-${index}`,
    customerId: `customer-${index}`,
    rating,
    reasonCodes: Object.freeze([]),
    tick,
    reviewModelVersion: '209-review-v1',
    exposureSeconds: 60,
    controlIntervals: 3,
    profileVersions: Object.freeze([]),
    preferenceAdjustment: 0,
    penalties: Object.freeze({ delay: 0, comfort: 0, incident: 0, failure: 0 }),
    evidence: Object.freeze({
      terminalState: 'COMPLETED' as const,
      passengerAboard: true,
      delaySeconds: 0,
      referenceTripDurationSeconds: 60,
      actualTripDurationSeconds: 60,
      comfortModelVersion: '139-comfort-v1',
      comfortPenalty: 0,
      impacts: 0,
      peakImpulseNs: 0,
      blockedSeconds: 0,
    }),
    supersedesReviewId: null,
    revision: 0,
  });
}

export interface ImpactDaySpec {
  /** Net revenue of one completed ride per value. */
  readonly revenueMinorUnits: readonly number[];
  /** One integer review per value, in the same simulated day. */
  readonly ratings: readonly number[];
  /** Real failed rides of the day, each with zero revenue. */
  readonly failedRides?: number;
  readonly cancelledRides?: number;
}

export interface ImpactScenario {
  readonly kpi: FleetKpi;
  readonly tick: number;
  readonly settlements: number;
  readonly reviews: number;
  snapshot(): FleetKpiSnapshot;
  read(): KpiImpactRead;
}

/**
 * Builds two consecutive simulated days through the real 209 incremental API. The current day is the
 * last one and its tick is a few seconds into the day, so the read reports it as `PARTIAL`.
 */
export function createImpactScenario(days: readonly ImpactDaySpec[]): ImpactScenario {
  const kpi = createFleetKpi();
  let index = 0,
    settlements = 0,
    reviews = 0;
  for (const [day, spec] of days.entries()) {
    const dayStart = day * KPI_IMPACT_DAY_TICKS;
    for (const revenue of spec.revenueMinorUnits) {
      kpi.applySettlement(settlement(index, dayStart + 60 + index, revenue));
      settlements += 1;
      index += 1;
    }
    for (const rating of spec.ratings) {
      kpi.applyReview(review(index, dayStart + 60 + index, rating));
      reviews += 1;
      index += 1;
    }
    for (let failed = 0; failed < (spec.failedRides ?? 0); failed += 1) {
      kpi.applySettlement(settlement(index, dayStart + 60 + index, 0, 'FAILED'));
      settlements += 1;
      index += 1;
    }
    for (let cancelled = 0; cancelled < (spec.cancelledRides ?? 0); cancelled += 1) {
      kpi.applySettlement(settlement(index, dayStart + 60 + index, 0, 'CANCELLED'));
      settlements += 1;
      index += 1;
    }
  }
  const tick = Math.max(0, days.length - 1) * KPI_IMPACT_DAY_TICKS + 3_600;
  return Object.freeze({
    kpi,
    tick,
    settlements,
    reviews,
    snapshot(): FleetKpiSnapshot {
      return kpi.snapshot(tick);
    },
    read(): KpiImpactRead {
      return selectKpiImpact(kpi.snapshot(tick));
    },
  });
}

/** Revenue rises while the rating falls: more throughput, worse passenger experience. */
export function revenueUpRatingDown(): ImpactScenario {
  return createImpactScenario([
    { revenueMinorUnits: [500], ratings: [5, 5] },
    { revenueMinorUnits: [1_000], ratings: [2] },
  ]);
}

/** Revenue falls while the rating rises: slower service, happier passengers. */
export function revenueDownRatingUp(): ImpactScenario {
  return createImpactScenario([
    { revenueMinorUnits: [1_000], ratings: [2, 2] },
    { revenueMinorUnits: [500], ratings: [5] },
  ]);
}

/** Both KPI fall in the same day: a real failed ride costs the fare and the rating. */
export function bothDown(): ImpactScenario {
  return createImpactScenario([
    { revenueMinorUnits: [1_000], ratings: [5] },
    { revenueMinorUnits: [200], ratings: [1], failedRides: 1 },
  ]);
}

/** Nothing changes between the two days. */
export function steady(): ImpactScenario {
  return createImpactScenario([
    { revenueMinorUnits: [500], ratings: [4] },
    { revenueMinorUnits: [500], ratings: [4] },
  ]);
}

/** A single simulated day: the read has no comparable baseline. */
export function firstDay(): ImpactScenario {
  return createImpactScenario([{ revenueMinorUnits: [500], ratings: [4] }]);
}

/** No commercial event at all. */
export function noEvents(): ImpactScenario {
  return createImpactScenario([]);
}

export interface RealIncident {
  readonly settlement: RideSettlement;
  readonly review: RideReview;
  readonly rating: number;
  dispose(): void;
}

/**
 * One real 209 failed ride with a passenger aboard and a real low review: the incident the 214
 * feedback must show, and the accident the XP invariance test reproduces.
 */
export function realFailedRide(terminalTick: number, rideId = 'ride:214:failed'): RealIncident {
  const ledger = createFleetLedger(),
    reviews = createReviewLedger(),
    outcome = ledger.ingest({
      eventId: `economy:${rideId}`,
      rideId,
      requestId: `request:${rideId}`,
      taxiId: 'taxi:214',
      vehicleKind: 'TAXI',
      terminalState: 'FAILED',
      terminalTick,
      passengerAboard: true,
      plannedDistanceMeters: 1_200,
      referenceTripDurationSeconds: 120,
    }),
    reviewed = reviews.ingest({
      eventId: `review:${rideId}`,
      facts: {
        rideId,
        customerId: `customer:${rideId}`,
        terminalState: 'FAILED',
        terminalTick,
        passengerAboard: true,
        referenceTripDurationSeconds: 120,
        actualTripDurationSeconds: 600,
        comfort: null,
      },
    });
  if (outcome.settlement === null) throw new Error('Expected a real 209 settlement');
  if (reviewed.review === null) throw new Error('Expected a real 209 review');
  return {
    settlement: outcome.settlement,
    review: reviewed.review,
    rating: reviewed.review.rating,
    dispose(): void {
      reviews.dispose();
      ledger.dispose();
    },
  };
}

export interface ControlModeImpact {
  readonly controlMode: 'MANUAL' | 'LEARNING' | 'AUTO';
  readonly review: RideReview;
  readonly read: KpiImpactRead;
  dispose(): void;
}

/**
 * The same ride facts evaluated by the real 209 review formula across the three control modes. The
 * 139 read model is real and mode-scoped; 209 has no mode term, so the identical facts must produce
 * the identical rating and the identical KPI consequence.
 */
export function controlModeImpact(mode: 'MANUAL' | 'LEARNING' | 'AUTO'): ControlModeImpact {
  const kpi = createFleetKpi(),
    rideId = `ride:214:${mode.toLowerCase()}`,
    baseTick = KPI_IMPACT_DAY_TICKS + 60,
    comfort = comfortForRide(rideId, 'taxi:214', baseTick, { controlMode: mode }),
    evaluation = evaluateReview({
      rideId,
      customerId: `customer:${rideId}`,
      terminalState: 'COMPLETED',
      terminalTick: baseTick + 600,
      passengerAboard: true,
      referenceTripDurationSeconds: 120,
      actualTripDurationSeconds: 300,
      comfort,
    });
  if (evaluation.status !== 'EVALUATED')
    throw new Error(`Expected an evaluated 209 review for ${mode}`);
  kpi.applySettlement(settlement(0, 60, 500));
  kpi.applyReview(review(0, 60, 5));
  kpi.applySettlement(settlement(1, baseTick, 500));
  kpi.applyReview(evaluation.review);
  const read = selectKpiImpact(kpi.snapshot(baseTick + 3_600));
  return {
    controlMode: mode,
    review: evaluation.review,
    read,
    dispose(): void {
      kpi.dispose();
    },
  };
}
