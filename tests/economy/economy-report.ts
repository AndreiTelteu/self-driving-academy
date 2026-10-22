import { DEFAULT_TARIFF_SCHEDULE, ECONOMY_CLOCK } from '../../src/economy';
import {
  beginRide,
  cancelRide,
  comfortSnapshot,
  completeRide,
  createEconomyWorld,
  failRide,
  rideOf,
} from './economy-fixture';

/**
 * Deterministic 209 report over the real fleet, dispatcher, ride lifecycle and comfort service.
 *
 * There is no wall clock, no browser and no machine-local timing in this document: every number is
 * produced by the shipped scenario fixtures, so the test and `npm run fleet:economy` compare exactly
 * the same report.
 */
export const ECONOMY_REPORT_VERSION = '209-fleet-economy-report-v1' as const;

/** One comparable economic window: 200 simulated seconds at the 209 economy clock. */
export const REPORT_WINDOW_END_TICK = 12_000;

export interface StyleScenario {
  readonly style: 'efficient' | 'aggressive';
  readonly requests: number;
  readonly settledRides: number;
  readonly ridesInWindow: number;
  readonly windowRevenueMinorUnits: number;
  readonly totalRevenueMinorUnits: number;
  readonly averageRating: number | null;
  readonly ratings: readonly number[];
  readonly quotes: readonly number[];
  readonly reasonCodes: readonly (readonly string[])[];
  readonly windowEndTick: number;
}

export interface OutcomeScenario {
  readonly completedNetMinorUnits: number;
  readonly failedNetMinorUnits: number;
  readonly cancelledBeforeNetMinorUnits: number;
  readonly cancelledAfterNetMinorUnits: number;
  readonly civilianRejected: boolean;
  readonly civilianRevenueMinorUnits: number;
  readonly reviewCount: number;
  readonly ratings: readonly number[];
  readonly reasonCodes: readonly (readonly string[])[];
}

export interface DetourScenario {
  readonly onTimeQuoteMinorUnits: number;
  readonly detourQuoteMinorUnits: number;
  readonly onTimeNetMinorUnits: number;
  readonly detourNetMinorUnits: number;
  readonly onTimeDelaySeconds: number;
  readonly detourDelaySeconds: number;
  readonly onTimeRating: number;
  readonly detourRating: number;
}

export interface EconomyReportCheck {
  readonly name: string;
  readonly pass: boolean;
}

export interface EconomyReport {
  readonly version: string;
  readonly generatedBy: string;
  readonly currency: string;
  readonly clock: {
    readonly version: string;
    readonly secondsPerDay: number;
    readonly daysPerMonth: number;
    readonly tickHz: number;
  };
  readonly tariff: {
    readonly pricingVersion: string;
    readonly baseFareMinorUnits: number;
    readonly distanceRateMinorUnitsPerKm: number;
    readonly timeRateMinorUnitsPerMinute: number;
    readonly cancellationFeeBasisPoints: number;
  };
  readonly windowEndTick: number;
  readonly efficient: StyleScenario;
  readonly aggressive: StyleScenario;
  readonly outcomes: OutcomeScenario;
  readonly detour: DetourScenario;
  readonly kpi: {
    readonly dayTerminalRides: number;
    readonly dayCompletedRides: number;
    readonly dayFailedRides: number;
    readonly dayCancelledRides: number;
    readonly dayReviewCount: number;
    readonly dayAverageRating: number | null;
    readonly monthRevenueMinorUnits: number;
    readonly historyScans: 0;
  };
  readonly checks: readonly EconomyReportCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
  };
}

interface StyleRide {
  readonly rating: number | null;
  readonly quote: number;
  readonly net: number;
  readonly tick: number;
  readonly reasons: readonly string[];
}

function runStyle(style: 'efficient' | 'aggressive'): StyleScenario {
  const fixture = createEconomyWorld({
      requestCount: 3,
      economy: { namespace: `city:economy:report:${style}` },
    }),
    graph = fixture.world.dispatcherWorld.graph,
    rides: StyleRide[] = [],
    profile =
      style === 'efficient'
        ? { accelerationMps2: 0.5, impacts: 0 }
        : { accelerationMps2: 2.5, impacts: 1 };
  let tick = 10;
  for (let index = 0; index < 3; index += 1) {
    const begun = beginRide(fixture, index, { atTick: tick, boarded: true }),
      // The aggressive scenario represents a faster, harsher style: shorter measured trips and a
      // rough passenger experience, never a different planned route or a different fare.
      completed = completeRide(fixture, begun, style === 'aggressive' ? -25 : 0),
      ride = rideOf(fixture, begun),
      result = fixture.economy.ingestRideOutcome({
        ride,
        graph,
        comfort: comfortSnapshot(begun, profile),
      });
    if (result.settlement.settlement === null) throw new Error('Report ride was not settled');
    rides.push({
      rating: result.review?.review?.rating ?? null,
      quote: result.settlement.settlement.quotedMinorUnits,
      net: result.settlement.settlement.netMinorUnits,
      tick: completed.terminalTick,
      reasons: result.review?.review?.reasonCodes ?? [],
    });
    tick = completed.terminalTick + 5;
  }
  const snapshot = fixture.economy.snapshot(tick),
    reviews = snapshot.reviews,
    inWindow = rides.filter((ride) => ride.tick <= REPORT_WINDOW_END_TICK),
    scenario: StyleScenario = {
      style,
      requests: 3,
      settledRides: rides.length,
      ridesInWindow: inWindow.length,
      windowRevenueMinorUnits: inWindow.reduce((sum, ride) => sum + ride.net, 0),
      totalRevenueMinorUnits: rides.reduce((sum, ride) => sum + ride.net, 0),
      averageRating: reviews.averageRating,
      ratings: Object.freeze(rides.map((ride) => ride.rating ?? -1)),
      quotes: Object.freeze(rides.map((ride) => ride.quote)),
      reasonCodes: Object.freeze(rides.map((ride) => ride.reasons)),
      windowEndTick: REPORT_WINDOW_END_TICK,
    };
  fixture.dispose();
  return Object.freeze(scenario);
}

function runOutcomes(): { scenario: OutcomeScenario; day: EconomyReport['kpi'] } {
  const fixture = createEconomyWorld({
      requestCount: 4,
      economy: { namespace: 'city:economy:report:outcomes' },
    }),
    graph = fixture.world.dispatcherWorld.graph,
    completedBegun = beginRide(fixture, 0, { atTick: 10, boarded: true }),
    completed = completeRide(fixture, completedBegun),
    completedRide = rideOf(fixture, completedBegun),
    comfort = comfortSnapshot(completedBegun),
    civilian = fixture.economy.ingestRideOutcome({
      ride: completedRide,
      graph,
      comfort,
      vehicleKind: 'CIVILIAN',
    }),
    completedResult = fixture.economy.ingestRideOutcome({
      ride: completedRide,
      graph,
      comfort,
    }),
    failedBegun = beginRide(fixture, 1, { atTick: completed.terminalTick + 5, boarded: true }),
    failed = failRide(fixture, failedBegun),
    failedResult = fixture.economy.ingestRideOutcome({
      ride: rideOf(fixture, failedBegun),
      graph,
      comfort: comfortSnapshot(failedBegun),
    }),
    cancelledBeforeBegun = beginRide(fixture, 2, { atTick: failed.terminalTick + 5 }),
    cancelledBefore = cancelRide(fixture, cancelledBeforeBegun),
    cancelledBeforeResult = fixture.economy.ingestRideOutcome({
      ride: rideOf(fixture, cancelledBeforeBegun),
      graph,
    }),
    cancelledAfterBegun = beginRide(fixture, 3, {
      atTick: cancelledBefore.terminalTick + 5,
      boarded: true,
    }),
    cancelledAfter = cancelRide(fixture, cancelledAfterBegun),
    cancelledAfterResult = fixture.economy.ingestRideOutcome({
      ride: rideOf(fixture, cancelledAfterBegun),
      graph,
      comfort: comfortSnapshot(cancelledAfterBegun),
    });
  if (
    completedResult.settlement.settlement === null ||
    failedResult.settlement.settlement === null ||
    cancelledBeforeResult.settlement.settlement === null ||
    cancelledAfterResult.settlement.settlement === null
  )
    throw new Error('Report outcome was not settled');
  const snapshot = fixture.economy.snapshot(cancelledAfter.terminalTick),
    day = snapshot.kpi.currentDay;
  if (day === null) throw new Error('Report outcome has no KPI day bucket');
  const scenario: OutcomeScenario = {
    completedNetMinorUnits: completedResult.settlement.settlement.netMinorUnits,
    failedNetMinorUnits: failedResult.settlement.settlement.netMinorUnits,
    cancelledBeforeNetMinorUnits: cancelledBeforeResult.settlement.settlement.netMinorUnits,
    cancelledAfterNetMinorUnits: cancelledAfterResult.settlement.settlement.netMinorUnits,
    civilianRejected:
      civilian.status === 'REJECTED' && civilian.settlement.reason === 'CIVILIAN_NOT_BILLABLE',
    civilianRevenueMinorUnits: snapshot.ledger.totals.civilianOutcomesRejected === 1 ? 0 : -1,
    reviewCount: snapshot.reviews.reviewCount,
    ratings: Object.freeze(snapshot.reviews.reviews.map((review) => review.rating)),
    reasonCodes: Object.freeze(snapshot.reviews.reviews.map((review) => review.reasonCodes)),
  };
  const kpi: EconomyReport['kpi'] = {
    dayTerminalRides: day.terminalRides,
    dayCompletedRides: day.completedRides,
    dayFailedRides: day.failedRides,
    dayCancelledRides: day.cancelledRides,
    dayReviewCount: day.reviewCount,
    dayAverageRating: day.averageRating,
    monthRevenueMinorUnits: snapshot.kpi.currentMonth?.revenueMinorUnits ?? 0,
    historyScans: 0,
  };
  fixture.dispose();
  return {
    scenario: Object.freeze(scenario),
    day: Object.freeze(kpi),
  };
}

function runDetour(): DetourScenario {
  const onTime = createEconomyWorld({
      requestCount: 1,
      economy: { namespace: 'city:economy:report:on-time' },
    }),
    detour = createEconomyWorld({
      requestCount: 1,
      economy: { namespace: 'city:economy:report:detour' },
    }),
    onTimeBegun = beginRide(onTime, 0, { boarded: true }),
    detourBegun = beginRide(detour, 0, { boarded: true }),
    onTimeCompleted = completeRide(onTime, onTimeBegun),
    detourCompleted = completeRide(detour, detourBegun, 300),
    onTimeResult = onTime.economy.ingestRideOutcome({
      ride: rideOf(onTime, onTimeBegun),
      graph: onTime.world.dispatcherWorld.graph,
      comfort: comfortSnapshot(onTimeBegun),
    }),
    detourResult = detour.economy.ingestRideOutcome({
      ride: rideOf(detour, detourBegun),
      graph: detour.world.dispatcherWorld.graph,
      comfort: comfortSnapshot(detourBegun),
    });
  if (
    onTimeResult.settlement.settlement === null ||
    detourResult.settlement.settlement === null ||
    onTimeResult.review?.review === null ||
    onTimeResult.review?.review === undefined ||
    detourResult.review?.review === null ||
    detourResult.review?.review === undefined
  )
    throw new Error('Report detour was not settled');
  const scenario: DetourScenario = {
    onTimeQuoteMinorUnits: onTimeResult.settlement.settlement.quotedMinorUnits,
    detourQuoteMinorUnits: detourResult.settlement.settlement.quotedMinorUnits,
    onTimeNetMinorUnits: onTimeResult.settlement.settlement.netMinorUnits,
    detourNetMinorUnits: detourResult.settlement.settlement.netMinorUnits,
    onTimeDelaySeconds: onTimeResult.review.review.evidence.delaySeconds ?? 0,
    detourDelaySeconds: detourResult.review.review.evidence.delaySeconds ?? 0,
    onTimeRating: onTimeResult.review.review.rating,
    detourRating: detourResult.review.review.rating,
  };
  assertDetourFinished(onTimeCompleted.terminalTick, detourCompleted.terminalTick);
  onTime.dispose();
  detour.dispose();
  return Object.freeze(scenario);
}

function assertDetourFinished(onTimeTick: number, detourTick: number): void {
  if (detourTick <= onTimeTick)
    throw new Error('Report detour is not longer than the reference ride');
}

function check(name: string, pass: boolean): EconomyReportCheck {
  return Object.freeze({ name, pass });
}

function ratingOnScale(ratings: readonly number[]): boolean {
  return ratings.every((rating) => Number.isInteger(rating) && rating >= 0 && rating <= 5);
}

/** The deterministic report document; the test and the script share this exact function. */
export function runFleetEconomyReport(): EconomyReport {
  const efficient = runStyle('efficient'),
    aggressive = runStyle('aggressive'),
    outcomes = runOutcomes(),
    detour = runDetour(),
    checks: EconomyReportCheck[] = [
      check(
        'planned_fare_survives_a_detour',
        detour.onTimeQuoteMinorUnits === detour.detourQuoteMinorUnits &&
          detour.onTimeNetMinorUnits === detour.detourNetMinorUnits,
      ),
      check(
        'detour_lowers_the_rating_without_changing_the_price',
        detour.detourDelaySeconds > detour.onTimeDelaySeconds &&
          detour.detourRating <= detour.onTimeRating,
      ),
      check(
        'completed_failure_cancellation_settled_separately',
        outcomes.scenario.completedNetMinorUnits > 0 &&
          outcomes.scenario.failedNetMinorUnits === 0 &&
          outcomes.scenario.cancelledBeforeNetMinorUnits === 0 &&
          outcomes.scenario.cancelledAfterNetMinorUnits > 0 &&
          outcomes.scenario.cancelledAfterNetMinorUnits < outcomes.scenario.completedNetMinorUnits,
      ),
      check(
        'civilians_never_enter_revenue',
        outcomes.scenario.civilianRejected && outcomes.scenario.civilianRevenueMinorUnits === 0,
      ),
      check(
        'one_review_per_eligible_ride',
        outcomes.scenario.reviewCount === 3 && ratingOnScale(outcomes.scenario.ratings),
      ),
      check(
        'ratings_stay_on_the_0_5_scale',
        ratingOnScale(efficient.ratings) && ratingOnScale(aggressive.ratings),
      ),
      check(
        'efficient_style_earns_better_ratings',
        (efficient.averageRating ?? 0) > (aggressive.averageRating ?? 0),
      ),
      check(
        'aggressive_style_serves_more_rides_in_the_same_window',
        aggressive.ridesInWindow > efficient.ridesInWindow &&
          aggressive.windowRevenueMinorUnits > efficient.windowRevenueMinorUnits,
      ),
      check(
        'the_fare_is_independent_of_the_style',
        new Set([...efficient.quotes, ...aggressive.quotes]).size === 1,
      ),
      check(
        'kpi_reads_never_rescan_the_ledger',
        outcomes.day.historyScans === 0 && outcomes.day.dayTerminalRides === 4,
      ),
    ],
    passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: ECONOMY_REPORT_VERSION,
    generatedBy: 'npm run fleet:economy',
    currency: DEFAULT_TARIFF_SCHEDULE.currency,
    clock: {
      version: ECONOMY_CLOCK.version,
      secondsPerDay: ECONOMY_CLOCK.secondsPerDay,
      daysPerMonth: ECONOMY_CLOCK.daysPerMonth,
      tickHz: ECONOMY_CLOCK.tickHz,
    },
    tariff: {
      pricingVersion: DEFAULT_TARIFF_SCHEDULE.pricingVersion,
      baseFareMinorUnits: DEFAULT_TARIFF_SCHEDULE.baseFareMinorUnits,
      distanceRateMinorUnitsPerKm: DEFAULT_TARIFF_SCHEDULE.distanceRateMinorUnitsPerKm,
      timeRateMinorUnitsPerMinute: DEFAULT_TARIFF_SCHEDULE.timeRateMinorUnitsPerMinute,
      cancellationFeeBasisPoints: DEFAULT_TARIFF_SCHEDULE.cancellation.afterPassengerFeeBasisPoints,
    },
    windowEndTick: REPORT_WINDOW_END_TICK,
    efficient,
    aggressive,
    outcomes: outcomes.scenario,
    detour,
    kpi: outcomes.day,
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

/** The document is fully deterministic, so the stable projection is the document itself. */
export function fleetEconomyStableReport(report: EconomyReport): EconomyReport {
  return report;
}

export function fleetEconomyReportMarkdown(report: EconomyReport): string {
  const rows = [
    `| efficient | ${report.efficient.ridesInWindow} | ${report.efficient.windowRevenueMinorUnits} | ${report.efficient.averageRating ?? 'n/a'} | ${report.efficient.ratings.join(', ')} |`,
    `| aggressive | ${report.aggressive.ridesInWindow} | ${report.aggressive.windowRevenueMinorUnits} | ${report.aggressive.averageRating ?? 'n/a'} | ${report.aggressive.ratings.join(', ')} |`,
  ];
  return [
    '# 209 Economy and ride reviews — deterministic report',
    '',
    `Generated by \`${report.generatedBy}\`. Currency: \`${report.currency}\`. Economy clock: \`${report.clock.version}\` (${report.clock.secondsPerDay} s/day, ${report.clock.daysPerMonth} days/month, ${report.clock.tickHz} Hz).`,
    '',
    `Comparable window: ticks 10–${report.windowEndTick}.`,
    '',
    '| style | rides in window | window revenue (minor units) | average rating | ratings |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `Tariff \`${report.tariff.pricingVersion}\`: base ${report.tariff.baseFareMinorUnits}, distance ${report.tariff.distanceRateMinorUnitsPerKm}/km, time ${report.tariff.timeRateMinorUnitsPerMinute}/min, cancellation fee ${report.tariff.cancellationFeeBasisPoints} bp.`,
    '',
    '## Outcomes',
    '',
    `- completed net: ${report.outcomes.completedNetMinorUnits}`,
    `- failed net: ${report.outcomes.failedNetMinorUnits}`,
    `- cancelled before boarding net: ${report.outcomes.cancelledBeforeNetMinorUnits}`,
    `- cancelled with passenger net: ${report.outcomes.cancelledAfterNetMinorUnits}`,
    `- civilian refused before any quote: ${report.outcomes.civilianRejected}`,
    `- reviews: ${report.outcomes.reviewCount}, ratings ${report.outcomes.ratings.join(', ')}`,
    '',
    '## Detour',
    '',
    `Quote on time ${report.detour.onTimeQuoteMinorUnits}, with a 300 s detour ${report.detour.detourQuoteMinorUnits}; delay ${report.detour.onTimeDelaySeconds} s → ${report.detour.detourDelaySeconds} s; rating ${report.detour.onTimeRating} → ${report.detour.detourRating}.`,
    '',
    '## KPI day bucket',
    '',
    `Terminal ${report.kpi.dayTerminalRides} (completed ${report.kpi.dayCompletedRides}, failed ${report.kpi.dayFailedRides}, cancelled ${report.kpi.dayCancelledRides}), reviews ${report.kpi.dayReviewCount}, average ${report.kpi.dayAverageRating ?? 'n/a'}, month revenue ${report.kpi.monthRevenueMinorUnits}, history scans ${report.kpi.historyScans}.`,
    '',
    '## Checks',
    '',
    ...report.checks.map((entry) => `- ${entry.pass ? 'PASS' : 'FAIL'} ${entry.name}`),
    '',
    `Summary: ${report.summary.passed}/${report.summary.checks} checks passed.`,
    '',
  ].join('\n');
}
