import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  COMFORT_CONTROL_MODES,
  COMFORT_METRICS_LIMITS,
  COMFORT_METRICS_VERSION,
  COMFORT_PASSENGER_RIDE_STATES,
  COMFORT_REVIEW_COEFFICIENTS,
  COMFORT_REVIEW_MODEL_VERSION,
  COMFORT_THRESHOLD_SOURCE,
  COMFORT_THRESHOLDS,
  comfortEventKinds,
  comfortPassengerAboard,
  comfortReviewModel,
  createComfortMetrics,
  deriveComfortIntervals,
} from '../../src/experiments';
import type { ComfortMetrics, ComfortMetricsSnapshot } from '../../src/experiments';
import {
  ingestComfortImpact,
  ingestComfortRide,
  readComfortSnapshot,
  toCityDashboardComfortMetrics,
} from '../../src/app';
import {
  COMFORT_MISSION_ID,
  comfortMissionOutcome,
  comfortMissionOutcomeFromAggregates,
  evaluateComfortRide,
} from '../../src/missions';
import { parameterRegistry } from '../../src/profiles';
import {
  COMFORT_FIXTURE_IMPACT_TICK,
  COMFORT_FIXTURE_IMPULSE_NS,
  COMFORT_SEDAN_LATERAL_LIMIT_MPS2,
  briskRide,
  incidentRide,
  jerkyRide,
  linearRide,
  mixedRide,
  recoveryRide,
  turnRide,
} from './comfort-fixture';
import type { ComfortRecordedRide } from './comfort-fixture';
import {
  briskRide as briskMissionRide,
  jerkyRide as jerkyMissionRide,
  recoveryRide as recoveryMissionRide,
  smoothRide,
} from '../missions/comfort-fixture';
import type { ComfortRideFixture } from '../missions/comfort-fixture';
import { runComfortMetricsReport, comfortMetricsStableReport } from './comfort-metrics-report';
import type { ComfortMetricsReport } from './comfort-metrics-report';

const SOURCE_DOMAIN = join(process.cwd(), 'src', 'experiments', 'comfort-metrics.ts');
const SOURCE_APP = join(process.cwd(), 'src', 'app', 'comfort-metrics.ts');
const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '139-metric-comfort', 'report.json');

function factsOf(ride: ComfortRecordedRide, rideState: 'TO_DROPOFF' | 'TO_PICKUP' = 'TO_DROPOFF') {
  return {
    rideId: ride.rideId,
    vehicleId: ride.vehicleId,
    rideState,
    readouts: ride.readouts,
    artifactWindows: ride.windows,
  };
}

function snapshotOf(service: ComfortMetrics, tick = 900): ComfortMetricsSnapshot {
  return readComfortSnapshot(service, { tick, simulatedSeconds: 3600 });
}

function rideAggregate(snapshot: ComfortMetricsSnapshot, rideId: string) {
  const found = snapshot.rides.find((entry) => entry.rideId === rideId);
  if (found === undefined) throw new Error(`Missing ride aggregate ${rideId}`);
  return found;
}

/**
 * Ingests a 121 mission ride into the 139 service through the shared derivation, so the mission
 * gate and the incremental service are compared on the very same facts.
 */
function ingestMissionRide(service: ComfortMetrics, ride: ComfortRideFixture): void {
  const spans = ride.artifactWindows
    .filter((window) => window.suppressed !== null)
    .map((window) => ({
      fromTick: window.suppressed!.fromTick,
      toTick: window.suppressed!.toTick,
    }));
  const derivation = deriveComfortIntervals({ samples: ride.samples, suppressedSpans: spans });
  for (const interval of derivation.intervals)
    service.ingest({
      eventId: `comfort-interval:${ride.rideId}:${interval.fromTick}:${interval.toTick}`,
      kind: 'PASSENGER_INTERVAL',
      rideId: ride.rideId,
      vehicleId: ride.vehicleId,
      controlMode: 'LEARNING',
      learningEligible: true,
      fromTick: interval.fromTick,
      toTick: interval.toTick,
      durationSeconds: interval.durationSeconds,
      longitudinalAccelerationMps2: interval.longitudinalAccelerationMps2,
      lateralAccelerationMps2: interval.lateralAccelerationMps2,
      lateralLimitMps2: interval.lateralLimitMps2,
    });
}

test('139 the comfort contract is closed and the thresholds are the shipped catalog defaults', () => {
  assert.equal(COMFORT_METRICS_VERSION, '139-comfort-metrics-v1');
  assert.deepEqual([...comfortEventKinds], ['PASSENGER_INTERVAL', 'PASSENGER_IMPACT']);
  assert.deepEqual([...COMFORT_CONTROL_MODES], ['AUTO', 'MANUAL', 'LEARNING']);
  assert.equal(
    COMFORT_THRESHOLDS.maxAccelerationMps2,
    parameterRegistry.comfort_deceleration.default,
  );
  assert.equal(COMFORT_THRESHOLDS.maxJerkMps3, parameterRegistry.acceleration_jerk.default);
  assert.equal(COMFORT_THRESHOLDS.maxAccelerationMps2, 2);
  assert.equal(COMFORT_THRESHOLDS.maxJerkMps3, 2);
  assert.equal(COMFORT_THRESHOLD_SOURCE.maxAccelerationMps2, 'comfort_deceleration');
  assert.equal(COMFORT_THRESHOLD_SOURCE.maxJerkMps3, 'acceleration_jerk');
  assert.deepEqual([...COMFORT_PASSENGER_RIDE_STATES], ['TO_DROPOFF', 'DROPOFF']);
  assert.equal(comfortPassengerAboard('TO_DROPOFF'), true);
  assert.equal(comfortPassengerAboard('TO_PICKUP'), false);
  assert.equal(COMFORT_REVIEW_MODEL_VERSION, '139-comfort-review-v1');
  assert.equal(COMFORT_REVIEW_COEFFICIENTS.ratingBase, 5);
});

test('139 a linear ride with a passenger in AUTO aggregates its real intervals', () => {
  const service = createComfortMetrics();
  const ride = linearRide('AUTO', { rideId: 'ride:139:linear' });
  const ingested = ingestComfortRide(service, factsOf(ride));
  assert(ingested !== null);
  assert.equal(ingested.intervals, 120);
  assert.equal(ingested.excludedSamples, 0);
  assert.equal(ingested.accepted, 120);
  assert.equal(ingested.rejected, 0);
  const snapshot = snapshotOf(service);
  assert.equal(snapshot.overall.intervals, 120);
  assert.equal(snapshot.overall.passengerSeconds, 2);
  assert.equal(snapshot.overall.peakAccelerationMps2, 0.9375);
  assert.equal(snapshot.overall.accelerationViolations, 0);
  assert.equal(snapshot.overall.jerkViolations, 0);
  const aggregate = rideAggregate(snapshot, 'ride:139:linear');
  assert.deepEqual([...aggregate.controlModes], ['AUTO']);
  assert.equal(aggregate.intervals, 120);
  assert.equal(aggregate.jerkSamples, 119);
  assert.equal(snapshot.byMode.find((entry) => entry.mode === 'AUTO')?.intervals, 120);
  assert.equal(snapshot.byMode.find((entry) => entry.mode === 'MANUAL')?.intervals, 0);
  assert.equal(snapshot.byMode.find((entry) => entry.mode === 'LEARNING')?.intervals, 0);
});

test('139 a brisk ride in MANUAL exceeds the acceleration threshold and nothing else', () => {
  const service = createComfortMetrics();
  const ride = briskRide('MANUAL', { rideId: 'ride:139:brisk' });
  ingestComfortRide(service, factsOf(ride));
  const aggregate = rideAggregate(snapshotOf(service), 'ride:139:brisk');
  assert.equal(aggregate.peakAccelerationMps2, 5.625);
  assert.equal(aggregate.accelerationViolations, 120);
  assert.equal(aggregate.jerkViolations, 0);
  assert.deepEqual([...aggregate.controlModes], ['MANUAL']);
});

test('139 a jerky ride in LEARNING exceeds the jerk threshold and not the acceleration one', () => {
  const service = createComfortMetrics();
  const ride = jerkyRide('LEARNING', { rideId: 'ride:139:jerky' });
  ingestComfortRide(service, factsOf(ride));
  const aggregate = rideAggregate(snapshotOf(service), 'ride:139:jerky');
  assert.equal(aggregate.peakAccelerationMps2, 1.875);
  assert.equal(aggregate.accelerationViolations, 0);
  assert.equal(aggregate.peakJerkMps3, 225);
  assert.equal(aggregate.jerkViolations, 119);
  assert.deepEqual([...aggregate.controlModes], ['LEARNING']);
});

test('139 a mixed ride is aggregated in every control mode', () => {
  const service = createComfortMetrics();
  const ride = mixedRide({ rideId: 'ride:139:mixed' });
  ingestComfortRide(service, factsOf(ride));
  const snapshot = snapshotOf(service);
  const aggregate = rideAggregate(snapshot, 'ride:139:mixed');
  assert.deepEqual([...aggregate.controlModes], ['AUTO', 'LEARNING', 'MANUAL']);
  assert.equal(aggregate.intervals, 179);
  assert.equal(snapshot.byMode.find((entry) => entry.mode === 'AUTO')?.intervals, 60);
  assert.equal(snapshot.byMode.find((entry) => entry.mode === 'MANUAL')?.intervals, 60);
  assert.equal(snapshot.byMode.find((entry) => entry.mode === 'LEARNING')?.intervals, 59);
  assert.equal(
    snapshot.byMode.reduce((total, entry) => total + entry.intervals, 0),
    snapshot.overall.intervals,
  );
});

test('139 a taxi outside the camera is aggregated exactly like a visible one', () => {
  const service = createComfortMetrics();
  const visible = linearRide('AUTO', { rideId: 'ride:139:visible' });
  const invisible = linearRide('AUTO', {
    rideId: 'ride:139:invisible',
    vehicleId: 'taxi:139:offscreen',
  });
  ingestComfortRide(service, factsOf(visible));
  ingestComfortRide(service, factsOf(invisible));
  const snapshot = snapshotOf(service);
  assert.equal(snapshot.overall.intervals, 240);
  const visibleAggregate = rideAggregate(snapshot, 'ride:139:visible');
  const invisibleAggregate = rideAggregate(snapshot, 'ride:139:invisible');
  assert.equal(invisibleAggregate.intervals, visibleAggregate.intervals);
  assert.equal(invisibleAggregate.peakAccelerationMps2, visibleAggregate.peakAccelerationMps2);
  assert.equal(invisibleAggregate.vehicleId, 'taxi:139:offscreen');
  // The learning eligibility is a fact of the 069 segment, never a filter of the aggregation.
  const manual = linearRide('MANUAL', { rideId: 'ride:139:manual' });
  ingestComfortRide(service, factsOf(manual));
  assert.equal(snapshotOf(service).overall.intervals, 360);
});

test('139 a real impact is excluded from the comfort and reaches the review apart', () => {
  const service = createComfortMetrics();
  const ride = incidentRide('AUTO', { rideId: 'ride:139:incident' });
  const ingested = ingestComfortRide(service, factsOf(ride));
  assert(ingested !== null);
  assert.equal(ingested.excludedSamples, 61);
  assert.equal(ingested.intervals, 59);
  const incident = ride.incidents[0]!;
  assert.equal(incident.tick, COMFORT_FIXTURE_IMPACT_TICK);
  const outcome = ingestComfortImpact(service, {
    incident,
    rideId: ride.rideId,
    vehicleId: ride.vehicleId,
    rideState: 'TO_DROPOFF',
  });
  assert(outcome !== null);
  assert.equal(outcome.status, 'ACCEPTED');
  const snapshot = snapshotOf(service);
  const aggregate = rideAggregate(snapshot, 'ride:139:incident');
  assert.equal(aggregate.accelerationViolations, 0);
  assert.equal(aggregate.jerkViolations, 0);
  assert.equal(aggregate.impacts, 1);
  assert.equal(snapshot.impacts.impacts, 1);
  assert.equal(snapshot.impacts.peakImpulseNs, COMFORT_FIXTURE_IMPULSE_NS);
  assert.equal(snapshot.impacts.affectedRides, 1);
  const review = comfortReviewModel(snapshot);
  assert.equal(review.impacts.impacts, 1);
  assert.equal(review.comfortScore, 5);
  // An impact without a passenger is not a consequence of the passenger experience.
  const withoutPassenger = ingestComfortImpact(service, {
    incident,
    rideId: 'ride:139:empty',
    vehicleId: ride.vehicleId,
    rideState: 'TO_PICKUP',
  });
  assert.equal(withoutPassenger, null);
  assert.equal(snapshotOf(service).impacts.impacts, 1);
});

test('139 the real 030 recovery teleport never becomes comfort of the command', () => {
  const service = createComfortMetrics();
  const ride = recoveryRide('MANUAL', { rideId: 'ride:139:recovery' });
  const ingested = ingestComfortRide(service, factsOf(ride));
  assert(ingested !== null);
  assert.equal(ingested.excludedSamples, 61);
  const aggregate = rideAggregate(snapshotOf(service), 'ride:139:recovery');
  assert.equal(aggregate.peakAccelerationMps2, 0.9375);
  assert.equal(aggregate.accelerationViolations, 0);
  assert.equal(aggregate.jerkViolations, 0);
});

test('139 the lateral acceleration is measured against the real vehicle capability', () => {
  const service = createComfortMetrics();
  const comfortable = turnRide({
    controlMode: 'AUTO',
    radiusM: 30,
    rideId: 'ride:139:turn',
  });
  ingestComfortRide(service, factsOf(comfortable));
  const comfortableAggregate = rideAggregate(snapshotOf(service), 'ride:139:turn');
  assert(Math.abs(comfortableAggregate.peakLateralAccelerationMps2 - 3.333333) < 0.001);
  assert.equal(comfortableAggregate.lateralViolations, 0);

  const sharp = turnRide({ controlMode: 'AUTO', radiusM: 6, rideId: 'ride:139:sharp' });
  ingestComfortRide(service, factsOf(sharp));
  const sharpAggregate = rideAggregate(snapshotOf(service), 'ride:139:sharp');
  assert(Math.abs(sharpAggregate.peakLateralAccelerationMps2 - 16.666667) < 0.001);
  assert.equal(sharpAggregate.lateralViolations, 120);
  assert(sharpAggregate.peakLateralAccelerationMps2 > COMFORT_SEDAN_LATERAL_LIMIT_MPS2);
});

test('139 the mission, the dashboard and the review model read the same aggregates', () => {
  for (const ride of [
    smoothRide({ rideId: 'ride:139:smooth' }),
    briskMissionRide({ rideId: 'ride:139:mission-brisk' }),
    jerkyMissionRide({ rideId: 'ride:139:mission-jerky' }),
    recoveryMissionRide({ rideId: 'ride:139:mission-recovery' }),
  ]) {
    const service = createComfortMetrics();
    ingestMissionRide(service, ride);
    const snapshot = snapshotOf(service);
    const aggregate = rideAggregate(snapshot, ride.rideId);
    const mission = evaluateComfortRide(ride);
    assert.equal(mission.passengerAboard, true);
    assert.equal(aggregate.intervals, mission.metrics.accelerationSamples);
    assert.equal(aggregate.jerkSamples, mission.metrics.jerkSamples);
    assert.equal(aggregate.peakAccelerationMps2, mission.metrics.peakAccelerationMps2);
    assert.equal(aggregate.peakJerkMps3, mission.metrics.peakJerkMps3);
    assert.equal(aggregate.accelerationViolations, mission.metrics.accelerationViolations);
    assert.equal(aggregate.jerkViolations, mission.metrics.jerkViolations);
    // The mission outcome computed from the shared read model is the one of the mission gate.
    assert.deepEqual(
      comfortMissionOutcomeFromAggregates({
        missionId: COMFORT_MISSION_ID,
        aggregate,
        minimumSamples: 8,
      }),
      comfortMissionOutcome({ missionId: COMFORT_MISSION_ID, result: mission }),
    );
    // The dashboard reads the score of the shared review model.
    const review = comfortReviewModel(snapshot);
    const adapter = toCityDashboardComfortMetrics(snapshot);
    assert.equal(adapter.length, 1);
    assert.equal(adapter[0]?.id, 'comfortScore');
    assert.equal(adapter[0]?.value, review.comfortScore);
    assert.equal(adapter[0]?.sampleSize, review.comfortIntervals);
  }
});

test('139 the aggregation is incremental: no history scan and a constant read model', () => {
  const service = createComfortMetrics();
  const ride = linearRide('AUTO', { rideId: 'ride:139:incremental' });
  ingestComfortRide(service, factsOf(ride));
  const first = snapshotOf(service);
  const second = snapshotOf(service);
  const third = snapshotOf(service);
  assert.equal(first.historyScans, 0);
  assert.equal(first.snapshotCalls, 1);
  assert.equal(third.snapshotCalls, 3);
  assert.deepEqual(first.overall, second.overall);
  assert.deepEqual(second.overall, third.overall);
  assert.equal(service.getStats().historyScans, 0);
  assert.equal(service.getStats().accepted, 120);
  // A later ride does not change the numbers of the first one.
  ingestComfortRide(service, factsOf(briskRide('MANUAL', { rideId: 'ride:139:later' })));
  const fourth = snapshotOf(service);
  assert.equal(fourth.overall.intervals, 240);
  assert.equal(rideAggregate(fourth, 'ride:139:incremental').intervals, 120);
});

test('139 the idempotency is on the event identity and the order of one ride is enforced', () => {
  const service = createComfortMetrics();
  const ride = linearRide('AUTO', { rideId: 'ride:139:idempotent' });
  const ingested = ingestComfortRide(service, factsOf(ride));
  assert(ingested !== null);
  const replay = ingestComfortRide(service, factsOf(ride));
  assert(replay !== null);
  assert.equal(replay.intervals, 120);
  assert.equal(replay.accepted, 0);
  assert.equal(replay.duplicates, 120);
  assert.equal(replay.rejected, 0);
  const snapshot = snapshotOf(service);
  assert.equal(snapshot.overall.intervals, 120);
  assert.equal(service.getStats().duplicates, 120);

  const outOfOrder = service.ingest({
    eventId: 'comfort-interval:ride:139:idempotent:overlap',
    kind: 'PASSENGER_INTERVAL',
    rideId: 'ride:139:idempotent',
    vehicleId: 'taxi:139:A',
    controlMode: 'AUTO',
    learningEligible: false,
    fromTick: 0,
    toTick: 1,
    durationSeconds: 1 / 60,
    longitudinalAccelerationMps2: 1,
    lateralAccelerationMps2: null,
    lateralLimitMps2: null,
  });
  assert.equal(outOfOrder.status, 'REJECTED');
  assert.equal(outOfOrder.reason, 'OUT_OF_ORDER');
  assert.equal(snapshotOf(service).overall.intervals, 120);
});

test('139 the limits are explicit: bounded memory, closed rejections and no invalid event', () => {
  const service = createComfortMetrics({ retainedKeys: 4, retainedRides: 2 });
  const invalid = [
    { eventId: 'x', kind: 'UNKNOWN', rideId: 'r', vehicleId: 'v' },
    { eventId: 'x', kind: 'PASSENGER_INTERVAL', rideId: 'r', vehicleId: 'v' },
    {
      eventId: '',
      kind: 'PASSENGER_INTERVAL',
      rideId: 'r',
      vehicleId: 'v',
      controlMode: 'AUTO',
      learningEligible: false,
      fromTick: 0,
      toTick: 1,
      durationSeconds: 1 / 60,
      longitudinalAccelerationMps2: 1,
      lateralAccelerationMps2: null,
      lateralLimitMps2: null,
    },
    {
      eventId: 'x',
      kind: 'PASSENGER_INTERVAL',
      rideId: 'r',
      vehicleId: 'v',
      controlMode: 'AUTO',
      learningEligible: true,
      fromTick: 0,
      toTick: 1,
      durationSeconds: 1 / 60,
      longitudinalAccelerationMps2: 1,
      lateralAccelerationMps2: null,
      lateralLimitMps2: null,
    },
    {
      eventId: 'x',
      kind: 'PASSENGER_INTERVAL',
      rideId: 'r',
      vehicleId: 'v',
      controlMode: 'AUTO',
      learningEligible: false,
      fromTick: 5,
      toTick: 1,
      durationSeconds: 1 / 60,
      longitudinalAccelerationMps2: 1,
      lateralAccelerationMps2: null,
      lateralLimitMps2: null,
    },
  ];
  const reasons = invalid.map((event) => service.ingest(event).reason);
  assert.deepEqual(reasons, [
    'UNKNOWN_KIND',
    'UNKNOWN_FIELD',
    'INVALID_IDENTITY',
    'INCONSISTENT_STATE',
    'INVALID_NUMBER',
  ]);
  assert.equal(snapshotOf(service).overall.intervals, 0);

  for (let index = 0; index < 6; index += 1)
    service.ingest({
      eventId: `bounded:${index}`,
      kind: 'PASSENGER_INTERVAL',
      rideId: `ride:bounded:${index}`,
      vehicleId: 'taxi:bounded',
      controlMode: 'AUTO',
      learningEligible: false,
      fromTick: index * 2,
      toTick: index * 2 + 1,
      durationSeconds: 1 / 60,
      longitudinalAccelerationMps2: 1,
      lateralAccelerationMps2: null,
      lateralLimitMps2: null,
    });
  const stats = service.getStats();
  assert.equal(stats.droppedKeys, 2);
  assert.equal(stats.droppedRides, 4);
  assert.equal(stats.retainedKeys, 4);
  assert.equal(stats.retainedRides, 2);
  assert.equal(snapshotOf(service).rides.length, 2);
  assert.equal(COMFORT_METRICS_LIMITS.retainedKeys, 8192);
  assert.equal(COMFORT_METRICS_LIMITS.retainedRides, 512);
});

test('139 without a passenger nothing is aggregated and the dashboard certifies no score', () => {
  const service = createComfortMetrics();
  const ride = linearRide('AUTO', { rideId: 'ride:139:solo' });
  const ingested = ingestComfortRide(service, factsOf(ride, 'TO_PICKUP'));
  assert.equal(ingested, null);
  const snapshot = snapshotOf(service);
  assert.equal(snapshot.overall.intervals, 0);
  const review = comfortReviewModel(snapshot);
  assert.equal(review.comfortScore, null);
  assert.equal(review.comfortPenalty, null);
  const adapter = toCityDashboardComfortMetrics(snapshot);
  assert.equal(adapter[0]?.state, 'UNAVAILABLE');
  assert.equal(adapter[0]?.value, null);
  assert.equal(adapter[0]?.reason, 'NO_EXPOSURE');
});

test('139 the sources are deterministic and free of DOM, clocks and randomness', () => {
  for (const source of [SOURCE_DOMAIN, SOURCE_APP]) {
    const text = readFileSync(source, 'utf8');
    for (const token of [
      'Date',
      'performance.now',
      'Math.random',
      'setTimeout',
      'setInterval',
      'requestAnimationFrame',
      'document.',
      'localStorage',
      'activeCamera',
      'Babylon',
    ])
      assert.equal(text.includes(token), false, `${source} contains ${token}`);
  }
});

test('139 report transcript is deterministic and matches the saved evidence', () => {
  const report = runComfortMetricsReport();
  // The cost probe is machine-local: the transcript is compared without the measured numbers.
  const stable = JSON.stringify(comfortMetricsStableReport(report));
  assert.equal(stable, JSON.stringify(comfortMetricsStableReport(runComfortMetricsReport())));
  assert.equal(report.summary.pass, true, JSON.stringify(report.checks.filter((c) => !c.pass)));
  assert.equal(report.summary.checks, report.checks.length);
  const saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as ComfortMetricsReport;
  assert.equal(stable, JSON.stringify(comfortMetricsStableReport(saved)));
});
