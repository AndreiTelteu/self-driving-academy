import { LIVE_ECONOMY_VERSION, reviewReasonCodes } from '../../src/economy';
import type { LiveEconomySnapshot } from '../../src/economy';
import { projectLiveEconomy } from '../../src/ui';
import type { CollisionIncident } from '../../src/vehicles';
import {
  createLiveEconomyFixture,
  type LiveEconomyFixture,
  type LiveEconomyTarget,
} from './live-economy-fixture';
import {
  measureBlockedSeconds,
  realArtifactWindow,
  realCollisionFact,
} from './live-economy-telemetry';

export const LIVE_ECONOMY_REPORT_VERSION = '266-live-economy-report-v1' as const;

export interface LiveEconomyReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LiveEconomyReport {
  readonly version: typeof LIVE_ECONOMY_REPORT_VERSION;
  readonly contract: typeof LIVE_ECONOMY_VERSION;
  readonly fixture: Readonly<{
    taxis: number;
    civilians: number;
    seed: number;
    dwellTicks: number;
    terminalTick: number;
  }>;
  readonly completed: Readonly<{
    rideId: string;
    requestId: string;
    taxiId: string;
    quotedMinorUnits: number;
    netMinorUnits: number;
    rating: number | null;
    reasons: readonly string[];
    reviewCount: number;
    settlements: number;
    reviews: number;
    dayRevenueMinorUnits: number;
    dayRides: number;
    monthRevenueMinorUnits: number;
    exposureSeconds: number;
    comfortSamples: number;
    comfortIntervals: number;
    averageRating: number | null;
    histogram: readonly number[];
    hudText: string;
    historyScans: 0;
  }>;
  readonly collision: Readonly<{
    rideId: string;
    controlRideId: string;
    taxiId: string;
    collisionTick: number;
    incidentId: string;
    impulseNs: number;
    rating: number | null;
    controlRating: number | null;
    ratingDrop: number | null;
    reasons: readonly string[];
    controlReasons: readonly string[];
    incidentPenalty: number | null;
    impacts: number | null;
    peakImpulseNs: number | null;
    controlIntervals: number | null;
    controlControlIntervals: number | null;
    excludedSamples: number;
    collisionImpacts: number;
  }>;
  readonly blocked: Readonly<{
    rideId: string;
    controlRideId: string;
    blockedSeconds: number;
    evidenceBlockedSeconds: number | null;
    rating: number | null;
    controlRating: number | null;
    reasons: readonly string[];
    incidentPenalty: number | null;
    blockedSecondsCounter: number;
  }>;
  readonly failed: Readonly<{
    rideId: string;
    rule: string | null;
    refundedMinorUnits: number;
    netMinorUnits: number;
    failedRides: number;
    reviews: number;
  }>;
  readonly cancellation: Readonly<{
    beforeRideId: string;
    beforeRule: string | null;
    beforeNetMinorUnits: number;
    beforeReviews: number;
    withPassengerRideId: string;
    withPassengerRule: string | null;
    withPassengerNetMinorUnits: number;
    withPassengerReviews: number;
    withPassengerReasons: readonly string[];
  }>;
  readonly idempotency: Readonly<{
    revenueBefore: number;
    revenueAfterDuplicate: number;
    revenueAfterReplay: number;
    settlements: number;
    reviews: number;
    duplicateTick: boolean;
    replayStatus: string;
    reads: number;
    revenueAfterReads: number;
    historyScansAfterReads: 0;
    ticksWithoutStep: number;
    tickAfterPauseReads: number;
    revenueAfterPauseReads: number;
  }>;
  readonly civilians: Readonly<{
    revenueBefore: number;
    revenueAfterRefusedCivilian: number;
    settlementsAfterRefusedCivilian: number;
    reviewsAfterRefusedCivilian: number;
    civiliansOutcomesRejected: number;
    refusedReason: string;
  }>;
  readonly epoch: Readonly<{
    indexBefore: number;
    indexAfter: number;
    revenueBefore: number;
    revenueAfterStart: number;
    revenueAfterNextRide: number;
    settlementsBefore: number;
    settlementsAfterNextRide: number;
    reviewsBefore: number;
    reviewsAfterNextRide: number;
    startTick: number;
    preservedRevenue: number;
    secondRideId: string;
    secondRating: number | null;
  }>;
  readonly checks: readonly LiveEconomyReportCheck[];
  readonly summary: Readonly<{
    version: typeof LIVE_ECONOMY_REPORT_VERSION;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

function check(
  name: string,
  expected: LiveEconomyReportCheck['expected'],
  actual: LiveEconomyReportCheck['actual'],
  detail: string,
): LiveEconomyReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function read(fixture: LiveEconomyFixture): LiveEconomySnapshot {
  const snapshot = fixture.economy.read();
  if (snapshot === null) throw new Error('Missing live economy read');
  return snapshot;
}

function cancel(
  fixture: LiveEconomyFixture,
  target: LiveEconomyTarget,
  reason: 'PASSENGER_CANCELLED' | 'PLAYER_CANCELLED',
): void {
  const tick = fixture.currentTick() + 1;
  fixture.composition.lifecycle.lifecycle.apply({
    rideId: target.rideId,
    eventId: `live-cancel:${target.rideId}:${tick}`,
    event: 'CANCELLED',
    tick,
    reason,
  });
  fixture.step(tick);
}

/** Deterministic 266 report on the real 061/265 lifecycle and the unchanged 209 economy. */
export function liveEconomyReportMarkdown(report: LiveEconomyReport): string {
  const checks = report.checks
    .map(
      (entry) =>
        `| ${entry.name} | ${JSON.stringify(entry.expected)} | ${JSON.stringify(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
    )
    .join('\n');
  return `# 266 live economy report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run economy:live\`;
the transcript contains no wall-clock value and is deterministic.

Contract \`${report.contract}\` on ${report.fixture.taxis} live taxis and ${report.fixture.civilians}
civilians, seed ${report.fixture.seed}, dwell ${report.fixture.dwellTicks} ticks.

## Completed ride

| Metric | Value |
| --- | --- |
| Ride / request / taxi | \`${report.completed.rideId}\` / ${report.completed.requestId} / ${report.completed.taxiId} |
| Quoted / net | ${report.completed.quotedMinorUnits} / ${report.completed.netMinorUnits} SDA |
| Rating / reasons | ${report.completed.rating ?? '—'} / ${report.completed.reasons.join(', ')} |
| Day revenue / rides / reviews | ${report.completed.dayRevenueMinorUnits} SDA / ${report.completed.dayRides} / ${report.completed.reviewCount} |
| Month revenue | ${report.completed.monthRevenueMinorUnits} SDA |
| Average / histogram | ${report.completed.averageRating ?? '—'} / ${report.completed.histogram.join(', ')} |
| Exposure | ${report.completed.exposureSeconds.toFixed(1)} s |
| Comfort samples → intervals | ${report.completed.comfortSamples} → ${report.completed.comfortIntervals} |
| HUD | ${report.completed.hudText} |

## Real 028 collision and 088 suppression

The collision ride is the same deterministic ride as the completed control (same seed, same 061
lifecycle). One real 028 episode produced the incident, and the real 088 filter evaluated its window;
the live economy applied that suppressed span to the passenger trace. The impact stays a separate 139
fact.

| Metric | Control | Collision |
| --- | ---: | ---: |
| Ride | \`${report.collision.controlRideId}\` | \`${report.collision.rideId}\` |
| Rating | ${report.collision.controlRating ?? '—'} | ${report.collision.rating ?? '—'} |
| Incident penalty / impacts | 0 / 0 | ${report.collision.incidentPenalty ?? '—'} / ${report.collision.impacts ?? '—'} |
| 139 intervals | ${report.collision.controlControlIntervals ?? '—'} | ${report.collision.controlIntervals ?? '—'} |
| Reasons | ${report.collision.controlReasons.join(', ') || '—'} | ${report.collision.reasons.join(', ') || '—'} |

Incident \`${report.collision.incidentId}\` at tick ${report.collision.collisionTick}, impulse
${report.collision.impulseNs} N·s. The 088 window excluded ${report.collision.excludedSamples} passenger
samples; the collision penalty (${report.collision.incidentPenalty ?? '—'}) and the reason
\`COLLISION\` remain, and the rating drops by ${report.collision.ratingDrop ?? '—'}.

## Real 137 blocked service

| Metric | Control | Blocked |
| --- | ---: | ---: |
| Ride | \`${report.blocked.controlRideId}\` | \`${report.blocked.rideId}\` |
| Rating | ${report.blocked.controlRating ?? '—'} | ${report.blocked.rating ?? '—'} |
| Blocked seconds (137) | 0 | ${report.blocked.blockedSeconds} |
| Incident penalty | 0 | ${report.blocked.incidentPenalty ?? '—'} |
| Reasons | — | ${report.blocked.reasons.join(', ') || '—'} |

The real 137 metric service accepted the blocked interval and reported
${report.blocked.evidenceBlockedSeconds ?? '—'} s; the live economy attached exactly that value to the
evaluated ride, so the 209 review counts the blocked service instead of zero. The session counter is
${report.blocked.blockedSecondsCounter} s.

## Terminal variants

| Variant | Ride | Rule | Net SDA | Reviews |
| --- | --- | --- | ---: | ---: |
| Failed | \`${report.failed.rideId}\` | ${report.failed.rule ?? '—'} | ${report.failed.netMinorUnits} | ${report.failed.reviews} |
| Cancelled before boarding | \`${report.cancellation.beforeRideId}\` | ${report.cancellation.beforeRule ?? '—'} | ${report.cancellation.beforeNetMinorUnits} | ${report.cancellation.beforeReviews} |
| Cancelled with passenger | \`${report.cancellation.withPassengerRideId}\` | ${report.cancellation.withPassengerRule ?? '—'} | ${report.cancellation.withPassengerNetMinorUnits} | ${report.cancellation.withPassengerReviews} |

The failed ride refunds the quote (${report.failed.refundedMinorUnits} SDA) and produces no review.
The pre-boarding cancellation refunds everything; the post-boarding cancellation keeps exactly the
30% service fee and produces a review with ${report.cancellation.withPassengerReasons.join(', ')}.

## Idempotency, pause and civilians

| Metric | Value |
| --- | ---: |
| Revenue before / after duplicate tick | ${report.idempotency.revenueBefore} / ${report.idempotency.revenueAfterDuplicate} |
| Revenue after explicit replay | ${report.idempotency.revenueAfterReplay} |
| Settlements / reviews | ${report.idempotency.settlements} / ${report.idempotency.reviews} |
| Duplicate tick / replay status | ${report.idempotency.duplicateTick} / ${report.idempotency.replayStatus} |
| Reads / revenue after reads | ${report.idempotency.reads} / ${report.idempotency.revenueAfterReads} |
| Reads without a step / tick after | ${report.idempotency.ticksWithoutStep} / ${report.idempotency.tickAfterPauseReads} |
| Paused revenue | ${report.idempotency.revenueAfterPauseReads} |
| Refused civilian reason | ${report.civilians.refusedReason} |
| Civilian revenue before / after | ${report.civilians.revenueBefore} / ${report.civilians.revenueAfterRefusedCivilian} |
| Civilian settlements / reviews after | ${report.civilians.settlementsAfterRefusedCivilian} / ${report.civilians.reviewsAfterRefusedCivilian} |

## Economic epoch

| Metric | Value |
| --- | ---: |
| Epoch before / after | ${report.epoch.indexBefore} / ${report.epoch.indexAfter} |
| Start tick | ${report.epoch.startTick} |
| Preserved revenue | ${report.epoch.preservedRevenue} |
| Revenue at start / after next ride | ${report.epoch.revenueAfterStart} / ${report.epoch.revenueAfterNextRide} |
| Settlements before / after next ride | ${report.epoch.settlementsBefore} / ${report.epoch.settlementsAfterNextRide} |
| Reviews before / after next ride | ${report.epoch.reviewsBefore} / ${report.epoch.reviewsAfterNextRide} |
| Second ride / rating | \`${report.epoch.secondRideId}\` / ${report.epoch.secondRating ?? '—'} |

## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checks}

## Summary

- Checks: ${report.summary.passed}/${report.summary.checks}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}

## Limits

The report uses the real 032/033/041/057/058/059/060/061/062/063/064/265 contracts, the real 028
collision episode, the real 088 artifact filter, the real 137 metric service and the unchanged 209
economy. It is not a browser frame, GPU or FPS measurement. The live comfort trace samples the
authoritative speed/heading/control mode at 10 Hz and derives the 139 intervals once at settlement,
with the 088 suppressed spans the caller supplies. The 137 blocked seconds are the value the real
metric service accepted for the ride; the live composition also counts the authoritative 058 blocked
frames when the 137 port is absent, so it never invents a duration. Persistence/reload of the economy
remains 278. Scenario-reset closes active rides through 265 before the economy can see their terminal
records, so those rides are not settled; the reset itself starts a new epoch without rewriting the
preserved history.
`;
}

/** Deterministic 266 report on the real 061/265 lifecycle and the unchanged 209 economy. */
export function runLiveEconomyReport(): LiveEconomyReport {
  let collisionFact: CollisionIncident | null = null,
    collisionRideId = '',
    blockedTaxiId = '',
    measuredBlockedSeconds = 0;
  const completedFixture = createLiveEconomyFixture({
      dwellTicks: 24,
      civilianCount: 20,
      seed: 262,
    }),
    collisionFixture = createLiveEconomyFixture({
      dwellTicks: 24,
      civilianCount: 20,
      seed: 262,
      artifactWindows: (ride) =>
        collisionFact === null || ride.rideId !== collisionRideId
          ? []
          : [realArtifactWindow(ride, collisionFact)],
    }),
    blockedFixture = createLiveEconomyFixture({
      dwellTicks: 24,
      civilianCount: 20,
      seed: 262,
      blockedSeconds: (ride) => (ride.taxiId === blockedTaxiId ? measuredBlockedSeconds : 0),
    }),
    failedFixture = createLiveEconomyFixture({
      dwellTicks: 24,
      civilianCount: 20,
      seed: 263,
    }),
    cancelFixture = createLiveEconomyFixture({
      dwellTicks: 24,
      civilianCount: 20,
      seed: 264,
    }),
    passengerCancelFixture = createLiveEconomyFixture({
      dwellTicks: 24,
      civilianCount: 20,
      seed: 265,
    });
  try {
    // Completed ride: one settlement, full fare and one review.
    completedFixture.runTo(60);
    const completedTarget = completedFixture.firstTarget(),
      boarded = completedFixture.board(completedTarget);
    completedFixture.runTo(completedFixture.currentTick() + 60);
    const completedRide = completedFixture.complete(completedTarget),
      completedRead = read(completedFixture),
      completedRecord = completedFixture.composition.lifecycle.lifecycle.ride(
        completedTarget.rideId,
      )!,
      completedSettlement = completedFixture.economy.economy.settlement(completedTarget.rideId)!,
      completedReview = completedFixture.economy.economy.review(completedTarget.rideId),
      completedHud = projectLiveEconomy(completedRead),
      reasons = completedReview?.reasonCodes ?? [];

    // Real 028 collision on the same deterministic ride; the real 088 window suppresses its tail.
    collisionFixture.runTo(60);
    const collisionTarget = collisionFixture.firstTarget();
    collisionRideId = collisionTarget.rideId;
    collisionFixture.board(collisionTarget);
    collisionFixture.runTo(collisionFixture.currentTick() + 60);
    const collisionTick = collisionFixture.currentTick() + 1;
    collisionFact = realCollisionFact({
      vehicleId: collisionTarget.taxiId,
      otherEntityId: 'wall:266:report',
      tick: collisionTick,
      impulseNs: 4_400,
    });
    collisionFixture.collisions.push(collisionFact);
    collisionFixture.step(collisionTick);
    collisionFixture.complete(collisionTarget);
    const collisionRead = read(collisionFixture),
      collisionReview = collisionFixture.economy.economy.review(collisionTarget.rideId),
      collisionReasons = collisionReview?.reasonCodes ?? [];

    // Real 137 blocked interval on the same deterministic ride.
    blockedFixture.runTo(60);
    const blockedTarget = blockedFixture.firstTarget();
    blockedTaxiId = blockedTarget.taxiId;
    blockedFixture.board(blockedTarget);
    blockedFixture.runTo(blockedFixture.currentTick() + 60);
    measuredBlockedSeconds = measureBlockedSeconds({
      taxiId: blockedTarget.taxiId,
      tick: blockedFixture.currentTick(),
      blockedSeconds: 90,
    });
    blockedFixture.complete(blockedTarget);
    const blockedRead = read(blockedFixture),
      blockedReview = blockedFixture.economy.economy.review(blockedTarget.rideId),
      blockedReasons = blockedReview?.reasonCodes ?? [];

    // Idempotency and read cost: a duplicate tick, an explicit replay and 600 reads.
    const idempotencyBefore = read(completedFixture);
    const duplicateTick = completedFixture.economyStep(),
      afterDuplicate = read(completedFixture),
      replay = completedFixture.economy.economy.ingestRideOutcome({
        ride: completedRecord,
        graph: completedFixture.world.graph,
      }),
      afterReplay = read(completedFixture);
    for (let index = 0; index < 600; index += 1) read(completedFixture);
    const afterReads = read(completedFixture),
      pauseTick = completedFixture.currentTick(),
      pauseRevenue = afterReads.totals.netRevenueMinorUnits;
    for (let index = 0; index < 600; index += 1) read(completedFixture);
    const afterPauseReads = read(completedFixture);

    // Civilian outcomes are refused by the ledger before any quote.
    const beforeCivilian = read(completedFixture),
      civilian = completedFixture.economy.economy.ingestRideOutcome({
        ride: completedRecord,
        graph: completedFixture.world.graph,
        vehicleKind: 'CIVILIAN',
      }),
      afterCivilian = read(completedFixture);

    // Session reset: a new epoch preserves the whole history, then adds a second ride.
    const epochBefore = read(completedFixture),
      boundary = completedFixture.currentTick() + 1;
    completedFixture.step(boundary);
    completedFixture.composition.reset({ tick: boundary });
    const epochResult = completedFixture.economy.beginEpoch({ tick: boundary }),
      afterEpochStart = read(completedFixture);
    completedFixture.runTo(boundary + 60);
    const secondTarget = completedFixture.firstTarget();
    completedFixture.board(secondTarget);
    completedFixture.complete(secondTarget);
    const afterSecondRide = read(completedFixture),
      secondReview = completedFixture.economy.economy.review(secondTarget.rideId);

    // Failed terminal ride: full refund, no fare and no invented review.
    failedFixture.runTo(60);
    const failedTarget = failedFixture.firstTarget();
    failedFixture.blocked.add(failedTarget.taxiId);
    failedFixture.step(failedFixture.currentTick() + 1);
    const failedRead = read(failedFixture),
      failedSettlement = failedFixture.economy.economy.settlement(failedTarget.rideId);

    // Cancellation before boarding: nothing is kept and no review is invented.
    cancelFixture.runTo(60);
    const beforeTarget = cancelFixture.firstTarget();
    cancel(cancelFixture, beforeTarget, 'PASSENGER_CANCELLED');
    const beforeRead = read(cancelFixture),
      beforeSettlement = cancelFixture.economy.economy.settlement(beforeTarget.rideId);

    // Cancellation with the passenger: only the versioned service fee is kept.
    passengerCancelFixture.runTo(60);
    const passengerTarget = passengerCancelFixture.firstTarget();
    passengerCancelFixture.board(passengerTarget);
    cancel(passengerCancelFixture, passengerTarget, 'PASSENGER_CANCELLED');
    const passengerRead = read(passengerCancelFixture),
      passengerSettlement = passengerCancelFixture.economy.economy.settlement(
        passengerTarget.rideId,
      ),
      passengerReview = passengerCancelFixture.economy.economy.review(passengerTarget.rideId);

    const checks: LiveEconomyReportCheck[] = [
      check(
        'completed-state',
        'COMPLETED',
        completedRide.state,
        'the real 061 ride ends through 063',
      ),
      check('completed-boarded', true, boarded.boardingTick !== null, 'the passenger boarded'),
      check(
        'completed-full-fare',
        completedSettlement.quotedMinorUnits,
        completedSettlement.netMinorUnits,
        'COMPLETED keeps the whole quoted fare',
      ),
      check(
        'completed-single-settlement',
        1,
        completedRead.totals.settlements,
        'one terminal ride produces one settlement',
      ),
      check(
        'completed-single-review',
        1,
        completedRead.counters.reviews,
        'one evaluable ride produces one review',
      ),
      check(
        'completed-review-reasons',
        true,
        reasons.every((reason) => (reviewReasonCodes as readonly string[]).includes(reason)),
        `reasons ${reasons.join(', ')}`,
      ),
      check(
        'collision-same-ride',
        completedTarget.rideId,
        collisionTarget.rideId,
        'the collision scenario is the same deterministic 061 ride as the control',
      ),
      check(
        'collision-impacts',
        1,
        collisionReview?.evidence.impacts ?? null,
        'the real 028 incident reaches the 139 read model exactly once',
      ),
      check(
        'collision-peak-impulse',
        4_400,
        collisionReview?.evidence.peakImpulseNs ?? null,
        'the review keeps the real impulse of the 028 incident',
      ),
      check(
        'collision-incident-penalty',
        1,
        collisionReview?.penalties.incident ?? null,
        'the unchanged 209 incident term counts the real impact',
      ),
      check(
        'collision-reason',
        true,
        collisionReasons.includes('COLLISION'),
        `reasons ${collisionReasons.join(', ')}`,
      ),
      check(
        'collision-rating-drop',
        1,
        (completedReview?.rating ?? 0) - (collisionReview?.rating ?? 0),
        `${completedReview?.rating} → ${collisionReview?.rating}`,
      ),
      check(
        'collision-088-suppression',
        true,
        collisionRead.counters.comfortExcludedSamples > 0,
        `${collisionRead.counters.comfortExcludedSamples} passenger samples excluded by the real 088 window`,
      ),
      check(
        'collision-comfort-prefix',
        true,
        (collisionReview?.controlIntervals ?? 0) < (completedReview?.controlIntervals ?? 0),
        `${collisionReview?.controlIntervals} vs ${completedReview?.controlIntervals} 139 intervals`,
      ),
      check(
        'collision-reason-vocabulary',
        true,
        collisionReasons.every((reason) =>
          (reviewReasonCodes as readonly string[]).includes(reason),
        ),
        `reasons ${collisionReasons.join(', ')}`,
      ),
      check(
        'collision-single-review',
        1,
        collisionRead.counters.reviews,
        'one evaluable collision ride produces exactly one review',
      ),
      check(
        'blocked-same-ride',
        completedTarget.rideId,
        blockedTarget.rideId,
        'the blocked scenario is the same deterministic 061 ride as the control',
      ),
      check(
        'blocked-seconds-137',
        90,
        blockedReview?.evidence.blockedSeconds ?? null,
        'the real 137 accepted value reaches the 209 review fact',
      ),
      check(
        'blocked-incident-penalty',
        0.5,
        blockedReview?.penalties.incident ?? null,
        'the unchanged 209 blocked term counts the real blocked service',
      ),
      check(
        'blocked-reason',
        true,
        blockedReasons.includes('BLOCKED_ROUTE'),
        `reasons ${blockedReasons.join(', ')}`,
      ),
      check(
        'blocked-rating-not-higher',
        true,
        (blockedReview?.rating ?? 0) <= (completedReview?.rating ?? 0),
        `${blockedReview?.rating} vs ${completedReview?.rating}`,
      ),
      check(
        'blocked-counter',
        true,
        blockedRead.counters.blockedSeconds >= 90,
        `${blockedRead.counters.blockedSeconds} s attached to settled rides`,
      ),
      check(
        'completed-day-revenue',
        completedRead.totals.netRevenueMinorUnits,
        completedRead.today?.revenueMinorUnits ?? null,
        'the day bucket keeps the settled revenue',
      ),
      check(
        'completed-month-revenue',
        completedRead.totals.netRevenueMinorUnits,
        completedRead.month?.revenueMinorUnits ?? null,
        'the month bucket keeps the settled revenue',
      ),
      check(
        'completed-day-rides',
        1,
        completedRead.today?.terminalRides ?? null,
        'the day bucket keeps the terminal ride',
      ),
      check(
        'completed-day-reviews',
        1,
        completedRead.today?.reviewCount ?? null,
        'the day bucket keeps the review',
      ),
      check(
        'completed-rating-sum',
        completedReview?.rating ?? null,
        completedRead.today?.ratingSum ?? null,
        'the rating sum is the emitted review',
      ),
      check(
        'completed-histogram',
        completedRead.today?.reviewCount ?? null,
        completedRead.today?.ratingHistogram.reduce((sum, value) => sum + value, 0) ?? null,
        'the 0–5 histogram sums to the review count',
      ),
      check(
        'economy-clock',
        '1200s/day, 30 days/month, 60 Hz',
        `${completedRead.clock.secondsPerDay}s/day, ${completedRead.clock.daysPerMonth} days/month, ${completedRead.clock.tickHz} Hz`,
        'the versioned economic clock is the module 22 proposal',
      ),
      check(
        'comfort-link',
        true,
        (completedRead.counters.comfortIntervals ?? 0) > 0,
        `${completedRead.counters.comfortSamples} live samples → ${completedRead.counters.comfortIntervals} 139 intervals`,
      ),
      check(
        'history-scans',
        0,
        completedRead.historyScans,
        'a live read never rescans the ledger or KPI history',
      ),
      check(
        'failed-full-refund',
        failedSettlement?.quotedMinorUnits ?? null,
        failedSettlement?.refundedMinorUnits ?? null,
        'FAILED refunds the whole quoted fare',
      ),
      check(
        'failed-rule',
        'FAILED_FULL_REFUND',
        failedSettlement?.rule ?? null,
        'the versioned failure rule is stored',
      ),
      check(
        'failed-no-revenue',
        0,
        failedRead.totals.netRevenueMinorUnits,
        'a failed ride contributes no revenue',
      ),
      check(
        'failed-day',
        1,
        failedRead.today?.failedRides ?? null,
        'the day bucket counts the failed ride',
      ),
      check(
        'failed-no-review',
        0,
        failedRead.counters.reviews,
        'a failure before boarding has no evaluable passenger experience',
      ),
      check(
        'cancel-before-rule',
        'CANCELLED_BEFORE_PASSENGER_FULL_REFUND',
        beforeSettlement?.rule ?? null,
        'cancellation before boarding refunds everything',
      ),
      check(
        'cancel-before-revenue',
        0,
        beforeRead.totals.netRevenueMinorUnits,
        'no fare is kept without a passenger',
      ),
      check(
        'cancel-before-review',
        0,
        beforeRead.counters.reviews,
        'no invented review for a ride without experience',
      ),
      check(
        'cancel-passenger-rule',
        'CANCELLED_WITH_PASSENGER_SERVICE_FEE',
        passengerSettlement?.rule ?? null,
        'a post-boarding cancellation keeps only the service fee',
      ),
      check(
        'cancel-passenger-fee',
        Math.round(((passengerSettlement?.quotedMinorUnits ?? 0) * 3_000) / 10_000),
        passengerSettlement?.netMinorUnits ?? null,
        'the cancellation policy is applied verbatim',
      ),
      check(
        'cancel-passenger-review',
        1,
        passengerRead.counters.reviews,
        'the passenger experience produces one review',
      ),
      check(
        'cancel-passenger-reason',
        true,
        (passengerReview?.reasonCodes ?? []).includes('RIDE_CANCELLED'),
        `reasons ${(passengerReview?.reasonCodes ?? []).join(', ')}`,
      ),
      check(
        'civilians-no-revenue',
        afterCivilian.totals.netRevenueMinorUnits,
        beforeCivilian.totals.netRevenueMinorUnits,
        'a civilian outcome never changes revenue',
      ),
      check(
        'civilians-no-settlement',
        afterCivilian.totals.settlements,
        beforeCivilian.totals.settlements,
        'a civilian outcome never adds a settlement',
      ),
      check(
        'civilians-no-review',
        afterCivilian.counters.reviews,
        beforeCivilian.counters.reviews,
        'a civilian outcome never adds a review',
      ),
      check(
        'civilians-refused',
        'CIVILIAN_NOT_BILLABLE',
        civilian.settlement.reason,
        'the ledger refuses the civilian before the quote',
      ),
      check(
        'duplicate-tick',
        true,
        duplicateTick.duplicate,
        'a re-delivered tick is an explicit duplicate',
      ),
      check(
        'duplicate-no-revenue',
        idempotencyBefore.totals.netRevenueMinorUnits,
        afterDuplicate.totals.netRevenueMinorUnits,
        'the duplicate changed nothing',
      ),
      check(
        'duplicate-single-settlement',
        1,
        afterReplay.totals.settlements,
        'the replay kept one settlement',
      ),
      check('replay-status', 'DUPLICATE', replay.status, 'the explicit replay is a duplicate'),
      check(
        'reads-no-history-scan',
        0,
        afterReads.historyScans,
        '600 live reads do not rescan history',
      ),
      check(
        'reads-stable-revenue',
        idempotencyBefore.totals.netRevenueMinorUnits,
        afterReads.totals.netRevenueMinorUnits,
        'reading the KPI does not mutate revenue',
      ),
      check(
        'pause-no-clock',
        pauseTick,
        afterPauseReads.tick,
        '600 reads without an authoritative step leave the economic clock unchanged',
      ),
      check(
        'pause-no-revenue',
        pauseRevenue,
        afterPauseReads.totals.netRevenueMinorUnits,
        'a paused/offline game cannot produce revenue',
      ),
      check(
        'epoch-index',
        epochBefore.epoch.index + 1,
        afterEpochStart.epoch.index,
        'the session reset starts a new economic epoch',
      ),
      check(
        'epoch-preserves-revenue',
        epochBefore.totals.netRevenueMinorUnits,
        epochResult.preservedRevenueMinorUnits,
        'the previous revenue is preserved',
      ),
      check(
        'epoch-preserves-settlements',
        epochBefore.totals.settlements,
        afterEpochStart.totals.settlements,
        'the settlement history is not cleared',
      ),
      check(
        'epoch-preserves-reviews',
        epochBefore.counters.reviews,
        afterEpochStart.counters.reviews,
        'the review history is not cleared',
      ),
      check(
        'epoch-start-tick',
        boundary,
        epochResult.epoch.startTick,
        'the new epoch starts at the reset boundary',
      ),
      check(
        'epoch-adds-next-ride',
        epochBefore.totals.settlements + 1,
        afterSecondRide.totals.settlements,
        'the next epoch adds on top of the preserved series',
      ),
      check(
        'epoch-revenue-grows',
        true,
        afterSecondRide.totals.netRevenueMinorUnits > afterEpochStart.totals.netRevenueMinorUnits,
        'the second ride increases the preserved revenue',
      ),
      check(
        'epoch-history-scans',
        0,
        afterSecondRide.historyScans,
        'the epoch transition does not rewrite or rescan history',
      ),
    ];
    const passed = checks.filter((entry) => entry.pass).length;
    return {
      version: LIVE_ECONOMY_REPORT_VERSION,
      contract: LIVE_ECONOMY_VERSION,
      fixture: {
        taxis: 24,
        civilians: 20,
        seed: 262,
        dwellTicks: 24,
        terminalTick: completedRide.updatedTick,
      },
      completed: {
        rideId: completedTarget.rideId,
        requestId: completedTarget.requestId,
        taxiId: completedTarget.taxiId,
        quotedMinorUnits: completedSettlement.quotedMinorUnits,
        netMinorUnits: completedSettlement.netMinorUnits,
        rating: completedReview?.rating ?? null,
        reasons: Object.freeze([...reasons]),
        reviewCount: completedRead.today?.reviewCount ?? 0,
        settlements: completedRead.totals.settlements,
        reviews: completedRead.counters.reviews,
        dayRevenueMinorUnits: completedRead.today?.revenueMinorUnits ?? 0,
        dayRides: completedRead.today?.terminalRides ?? 0,
        monthRevenueMinorUnits: completedRead.month?.revenueMinorUnits ?? 0,
        exposureSeconds: completedRead.today?.exposureSeconds ?? 0,
        comfortSamples: completedRead.counters.comfortSamples,
        comfortIntervals: completedRead.counters.comfortIntervals,
        averageRating: completedRead.today?.averageRating ?? null,
        histogram: completedRead.today?.ratingHistogram ?? [],
        hudText: `${completedHud.day.label} · ${completedHud.day.revenue} · ${completedHud.day.rating}`,
        historyScans: 0 as const,
      },
      collision: {
        rideId: collisionTarget.rideId,
        controlRideId: completedTarget.rideId,
        taxiId: collisionTarget.taxiId,
        collisionTick,
        incidentId: collisionFact?.incidentId ?? '',
        impulseNs: collisionFact?.impulseNs ?? 0,
        rating: collisionReview?.rating ?? null,
        controlRating: completedReview?.rating ?? null,
        ratingDrop:
          collisionReview === undefined
            ? null
            : (completedReview?.rating ?? 0) - collisionReview.rating,
        reasons: Object.freeze([...collisionReasons]),
        controlReasons: Object.freeze([...reasons]),
        incidentPenalty: collisionReview?.penalties.incident ?? null,
        impacts: collisionReview?.evidence.impacts ?? null,
        peakImpulseNs: collisionReview?.evidence.peakImpulseNs ?? null,
        controlIntervals: collisionReview?.controlIntervals ?? null,
        controlControlIntervals: completedReview?.controlIntervals ?? null,
        excludedSamples: collisionRead.counters.comfortExcludedSamples,
        collisionImpacts: collisionRead.counters.collisionImpacts,
      },
      blocked: {
        rideId: blockedTarget.rideId,
        controlRideId: completedTarget.rideId,
        blockedSeconds: measuredBlockedSeconds,
        evidenceBlockedSeconds: blockedReview?.evidence.blockedSeconds ?? null,
        rating: blockedReview?.rating ?? null,
        controlRating: completedReview?.rating ?? null,
        reasons: Object.freeze([...blockedReasons]),
        incidentPenalty: blockedReview?.penalties.incident ?? null,
        blockedSecondsCounter: blockedRead.counters.blockedSeconds,
      },
      failed: {
        rideId: failedTarget.rideId,
        rule: failedSettlement?.rule ?? null,
        refundedMinorUnits: failedSettlement?.refundedMinorUnits ?? 0,
        netMinorUnits: failedSettlement?.netMinorUnits ?? 0,
        failedRides: failedRead.today?.failedRides ?? 0,
        reviews: failedRead.counters.reviews,
      },
      cancellation: {
        beforeRideId: beforeTarget.rideId,
        beforeRule: beforeSettlement?.rule ?? null,
        beforeNetMinorUnits: beforeRead.totals.netRevenueMinorUnits,
        beforeReviews: beforeRead.counters.reviews,
        withPassengerRideId: passengerTarget.rideId,
        withPassengerRule: passengerSettlement?.rule ?? null,
        withPassengerNetMinorUnits: passengerSettlement?.netMinorUnits ?? 0,
        withPassengerReviews: passengerRead.counters.reviews,
        withPassengerReasons: Object.freeze([...(passengerReview?.reasonCodes ?? [])]),
      },
      idempotency: {
        revenueBefore: idempotencyBefore.totals.netRevenueMinorUnits,
        revenueAfterDuplicate: afterDuplicate.totals.netRevenueMinorUnits,
        revenueAfterReplay: afterReplay.totals.netRevenueMinorUnits,
        settlements: afterReplay.totals.settlements,
        reviews: afterReplay.counters.reviews,
        duplicateTick: duplicateTick.duplicate,
        replayStatus: replay.status,
        reads: 600,
        revenueAfterReads: afterReads.totals.netRevenueMinorUnits,
        historyScansAfterReads: 0 as const,
        ticksWithoutStep: 600,
        tickAfterPauseReads: afterPauseReads.tick,
        revenueAfterPauseReads: afterPauseReads.totals.netRevenueMinorUnits,
      },
      civilians: {
        revenueBefore: beforeCivilian.totals.netRevenueMinorUnits,
        revenueAfterRefusedCivilian: afterCivilian.totals.netRevenueMinorUnits,
        settlementsAfterRefusedCivilian: afterCivilian.totals.settlements,
        reviewsAfterRefusedCivilian: afterCivilian.counters.reviews,
        civiliansOutcomesRejected: afterCivilian.totals.civilianOutcomesRejected,
        refusedReason: civilian.settlement.reason ?? 'none',
      },
      epoch: {
        indexBefore: epochBefore.epoch.index,
        indexAfter: afterEpochStart.epoch.index,
        revenueBefore: epochBefore.totals.netRevenueMinorUnits,
        revenueAfterStart: afterEpochStart.totals.netRevenueMinorUnits,
        revenueAfterNextRide: afterSecondRide.totals.netRevenueMinorUnits,
        settlementsBefore: epochBefore.totals.settlements,
        settlementsAfterNextRide: afterSecondRide.totals.settlements,
        reviewsBefore: epochBefore.counters.reviews,
        reviewsAfterNextRide: afterSecondRide.counters.reviews,
        startTick: epochResult.epoch.startTick,
        preservedRevenue: epochResult.preservedRevenueMinorUnits,
        secondRideId: secondTarget.rideId,
        secondRating: secondReview?.rating ?? null,
      },
      checks,
      summary: {
        version: LIVE_ECONOMY_REPORT_VERSION,
        checks: checks.length,
        passed,
        pass: passed === checks.length,
      },
    };
  } finally {
    completedFixture.dispose();
    collisionFixture.dispose();
    blockedFixture.dispose();
    failedFixture.dispose();
    cancelFixture.dispose();
    passengerCancelFixture.dispose();
  }
}
