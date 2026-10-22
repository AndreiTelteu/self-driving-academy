import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  COMFORT_MISSION_ID,
  COMFORT_OBJECTIVE,
  COMFORT_OBJECTIVE_ID,
  COMFORT_PASSENGER_RIDE_STATES,
  COMFORT_SCHEMA_VERSION,
  COMFORT_THRESHOLD_SOURCE,
  COMFORT_THRESHOLDS,
  comfortMissionDefinition,
  comfortMissionIds,
  comfortMissionOutcome,
  comfortPassengerAboard,
  comfortStatuses,
  comfortTelemetryFromTickSamples,
  createComfortMissionCatalog,
  evaluateComfortRide,
  parseComfortObjective,
} from '../../src/missions';
import { parameterRegistry } from '../../src/profiles';
import {
  COMFORT_RIDE_ID,
  RECOVERY_TICK,
  briskRide,
  cleanWindows,
  jerkyRide,
  recoveryRide,
  recoveryRideWithoutWindows,
  smoothRide,
  smoothTelemetry,
  tailRecoveryRide,
} from './comfort-fixture';
import { runMissionComfortReport } from './mission-comfort-report';

const SOURCE_COMFORT = join(process.cwd(), 'src', 'missions', 'comfort.ts');
const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '121-mission-comfort', 'report.json');

function throwsWith(action: () => unknown, pattern: RegExp): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && pattern.test(error.message);
  }
}

test('121 comfort objective is explicit, separate from style and bound to the 088 spans', () => {
  assert.equal(COMFORT_OBJECTIVE.version, COMFORT_SCHEMA_VERSION);
  assert.equal(COMFORT_OBJECTIVE.objectiveId, COMFORT_OBJECTIVE_ID);
  assert.equal(COMFORT_OBJECTIVE.passengerRequired, true);
  assert.equal(COMFORT_OBJECTIVE.artifactPolicy, 'EXCLUDE_ARTIFACT_SUPPRESSED_SPANS');
  assert.deepEqual(COMFORT_OBJECTIVE.separation, {
    styleFidelity: 'NOT_USED',
    styleScore: 'NOT_USED',
  });
  assert.deepEqual(COMFORT_OBJECTIVE.thresholds, COMFORT_THRESHOLDS);
  assert(COMFORT_THRESHOLDS.maxAccelerationMps2 > 0);
  assert(COMFORT_THRESHOLDS.maxJerkMps3 > 0);
  assert.equal(COMFORT_OBJECTIVE.evaluation.minimumSamples >= 2, true);
  assert.deepEqual(parseComfortObjective(COMFORT_OBJECTIVE), COMFORT_OBJECTIVE);
  assert(
    throwsWith(
      () =>
        parseComfortObjective({
          ...COMFORT_OBJECTIVE,
          separation: { styleFidelity: 'USED', styleScore: 'NOT_USED' },
        }),
      /cannot use style fidelity/,
    ),
  );
  assert(
    throwsWith(
      () => parseComfortObjective({ ...COMFORT_OBJECTIVE, passengerRequired: false }),
      /requires a passenger/,
    ),
  );
  assert(
    throwsWith(
      () => parseComfortObjective({ ...COMFORT_OBJECTIVE, artifactPolicy: 'NONE' }),
      /suppressed spans/,
    ),
  );
});

test('121 the thresholds are the shipped catalog defaults, not invented for the mission', () => {
  assert.equal(COMFORT_THRESHOLD_SOURCE.maxAccelerationMps2, 'comfort_deceleration');
  assert.equal(COMFORT_THRESHOLD_SOURCE.maxJerkMps3, 'acceleration_jerk');
  assert.equal(
    COMFORT_THRESHOLDS.maxAccelerationMps2,
    parameterRegistry.comfort_deceleration.default,
  );
  assert.equal(COMFORT_THRESHOLDS.maxJerkMps3, parameterRegistry.acceleration_jerk.default);
  assert.equal(parameterRegistry.comfort_deceleration.unit, 'm/s²');
  assert.equal(parameterRegistry.acceleration_jerk.unit, 'm/s³');
  assert.equal(COMFORT_THRESHOLDS.maxAccelerationMps2, 2);
  assert.equal(COMFORT_THRESHOLDS.maxJerkMps3, 2);
});

test('121 the passenger comes from the real 061 ride lifecycle', () => {
  assert.deepEqual(COMFORT_PASSENGER_RIDE_STATES, ['TO_DROPOFF', 'DROPOFF']);
  assert.equal(comfortPassengerAboard('TO_DROPOFF'), true);
  assert.equal(comfortPassengerAboard('DROPOFF'), true);
  assert.equal(comfortPassengerAboard('TO_PICKUP'), false);
  assert.equal(comfortPassengerAboard('PICKUP'), false);
  assert.equal(comfortPassengerAboard('COMPLETED'), false);
  assert.equal(comfortPassengerAboard('CANCELLED'), false);
});

test('121 the comfort mission is a valid 116 mission with its own explicit gate', () => {
  const catalog = createComfortMissionCatalog();
  assert.equal(catalog.missions.length, 1);
  const mission = catalog.missions[0]!;
  assert.equal(mission.missionId, COMFORT_MISSION_ID);
  assert.equal(mission.title, 'Cursa cu obiectiv de confort');
  assert.equal(mission.objectives.length, 1);
  assert.equal(mission.objectives[0]?.kind, 'DROPOFFS');
  assert.equal(mission.objectives[0]?.target, 1);
  assert.equal(mission.incidentBudget, 1);
  assert.deepEqual(mission.prerequisites, []);
  assert.deepEqual(mission.replay.comparisonProfileIds, []);
  assert.equal(mission.replay.profileSource, 'CURRENT');
  assert.deepEqual(comfortMissionIds(), [COMFORT_MISSION_ID]);
  assert.deepEqual(comfortMissionDefinition(), mission);
});

test('121 a smooth ride with a passenger passes with real acceleration and jerk values', () => {
  const ride = smoothRide();
  const result = evaluateComfortRide(ride);
  assert.equal(result.version, COMFORT_SCHEMA_VERSION);
  assert.equal(result.status, 'PASSED');
  assert.equal(result.reason, null);
  assert.equal(result.passengerAboard, true);
  assert.equal(result.rideState, 'TO_DROPOFF');
  assert.equal(result.styleFidelity, null);
  assert.equal(result.styleScoreUsed, false);
  assert.equal(result.metrics.peakAccelerationMps2, 0.9375);
  assert.equal(result.metrics.peakJerkMps3, 0);
  assert.equal(result.metrics.accelerationSamples, 120);
  assert.equal(result.metrics.jerkSamples, 119);
  assert.equal(result.metrics.accelerationViolations, 0);
  assert.equal(result.metrics.jerkViolations, 0);
  assert.equal(result.samples.used, 121);
  assert.equal(result.exclusions.spans, 0);
  assert.deepEqual(result.thresholds, COMFORT_THRESHOLDS);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0]?.controlMode, 'LEARNING');
  assert.equal(result.segments[0]?.learningEligible, true);
  assert.equal(result.segments[0]?.startTick, 0);
  assert.equal(result.segments[0]?.endTick, 120);
});

test('121 the metric is derived from the real 085 telemetry of the segment', () => {
  const telemetry = smoothTelemetry();
  assert.equal(telemetry.segmentIds.length, 1);
  assert.equal(telemetry.controlMode, 'LEARNING');
  assert.equal(telemetry.learningEligible, true);
  assert.equal(telemetry.samples.length, 121);
  assert.equal(telemetry.recordedAccelerationMps2.length, 121);
  const derived: number[] = [];
  for (let index = 1; index < telemetry.samples.length; index += 1) {
    const previous = telemetry.samples[index - 1]!;
    const current = telemetry.samples[index]!;
    derived.push((current.speedMps - previous.speedMps) * 60);
  }
  const recorded = telemetry.recordedAccelerationMps2.slice(1);
  const drift = derived.reduce(
    (worst, value, index) => Math.max(worst, Math.abs(value - recorded[index]!)),
    0,
  );
  assert(drift < 1e-9, `derived acceleration drifted from the recorded physics: ${drift}`);
  assert.equal(Math.max(...derived.map(Math.abs)), 0.9375);
});

test('121 a brisk ride fails on the acceleration limit with the real peak', () => {
  const result = evaluateComfortRide(briskRide());
  assert.equal(result.status, 'FAILED');
  assert.equal(result.reason, 'ACCELERATION_LIMIT');
  assert.equal(result.metrics.peakAccelerationMps2, 5.625);
  assert.equal(result.metrics.accelerationViolations, 120);
  assert.equal(result.metrics.accelerationSamples, 120);
  assert.equal(result.metrics.jerkViolations, 0);
});

test('121 a jerky ride fails on jerk even when acceleration stays at the limit', () => {
  const result = evaluateComfortRide(jerkyRide());
  assert.equal(result.status, 'FAILED');
  assert.equal(result.reason, 'JERK_LIMIT');
  assert.equal(result.metrics.peakAccelerationMps2, 1.875);
  assert.equal(result.metrics.accelerationViolations, 0);
  assert(result.metrics.jerkViolations > 0);
  assert.equal(result.metrics.peakJerkMps3, 225);
  assert(result.metrics.peakJerkMps3 > COMFORT_THRESHOLDS.maxJerkMps3);
});

test('121 a real 030 recovery teleport is excluded through the real 088 window', () => {
  const ride = recoveryRide();
  assert.equal(ride.segments.length, 2);
  assert.equal(ride.segments[0]?.endTick, RECOVERY_TICK - 1);
  assert.equal(ride.segments[1]?.startTick, RECOVERY_TICK);
  const [window, tail] = ride.artifactWindows;
  assert.equal(window?.windowClass, 'PREFIX_ELIGIBLE');
  assert.equal(window?.suppressed?.fromTick, RECOVERY_TICK - 1);
  assert.equal(window?.suppressed?.toTick, RECOVERY_TICK - 1);
  assert.equal(window?.artifacts.length, 1);
  assert.equal(window?.artifacts[0]?.kind, 'TELEPORT');
  assert.equal(window?.artifacts[0]?.cause, 'RECOVERY_TELEPORT');
  assert.equal(window?.artifacts[0]?.source, 'RECOVERY_030');
  assert.equal(tail?.suppressed, null);

  const withoutWindow = evaluateComfortRide(recoveryRideWithoutWindows());
  assert.equal(withoutWindow.status, 'FAILED');
  assert.equal(withoutWindow.reason, 'BOTH_LIMITS');
  assert(withoutWindow.metrics.peakAccelerationMps2 > 100);

  const withWindow = evaluateComfortRide(ride);
  assert.equal(withWindow.status, 'PASSED');
  assert.equal(withWindow.exclusions.windows, 2);
  assert.equal(withWindow.exclusions.spans, 1);
  assert.equal(withWindow.exclusions.teleports, 1);
  assert.equal(withWindow.exclusions.collisions, 0);
  assert.equal(withWindow.samples.excluded, 1);
  assert.equal(withWindow.samples.used, 120);
  assert.equal(withWindow.intervals.excluded, 1);
  assert.equal(withWindow.intervals.acceleration, 118);
  assert(withWindow.metrics.peakAccelerationMps2 <= COMFORT_THRESHOLDS.maxAccelerationMps2);
  assert.equal(withWindow.metrics.peakJerkMps3, 0);
});

test('121 an open segment recovery suppresses the boundary tick and everything after it', () => {
  const ride = tailRecoveryRide();
  const window = ride.artifactWindows[0];
  assert.equal(window?.suppressed?.fromTick, RECOVERY_TICK);
  assert.equal(window?.suppressed?.toTick, 120);
  const result = evaluateComfortRide(ride);
  assert.equal(result.status, 'PASSED');
  assert.equal(result.exclusions.spans, 1);
  assert.equal(result.exclusions.teleports, 1);
  assert.equal(result.samples.excluded, 61);
  assert.equal(result.samples.used, 60);
  assert.equal(result.intervals.excluded, 0);
  assert.equal(result.metrics.accelerationSamples, 59);
  assert(result.metrics.peakAccelerationMps2 <= COMFORT_THRESHOLDS.maxAccelerationMps2);
});

test('121 a clean 088 window suppresses nothing and keeps the whole ride', () => {
  const windows = cleanWindows();
  const window = windows[0];
  assert.equal(window?.suppressed, null);
  const result = evaluateComfortRide(smoothRide({ artifactWindows: windows }));
  assert.equal(result.status, 'PASSED');
  assert.equal(result.exclusions.spans, 0);
  assert.equal(result.exclusions.windows, 1);
  assert.equal(result.samples.excluded, 0);
  assert.equal(result.samples.used, 121);
});

test('121 no passenger or too little data cannot produce a comfort verdict', () => {
  const empty = evaluateComfortRide(smoothRide({ rideState: 'TO_PICKUP' }));
  assert.equal(empty.status, 'NO_PASSENGER');
  assert.equal(empty.passengerAboard, false);
  assert.equal(empty.metrics.accelerationSamples, 0);
  assert.equal(empty.styleFidelity, null);
  const short = evaluateComfortRide({
    ...smoothRide(),
    endTick: 3,
    segments: [
      {
        segmentId: 'segment:121:short',
        controlMode: 'LEARNING',
        learningEligible: true,
        startTick: 0,
        endTick: 3,
      },
    ],
    samples: smoothRide().samples.slice(0, 4),
  });
  assert.equal(short.status, 'INSUFFICIENT_DATA');
  assert.equal(short.metrics.accelerationSamples, 3);
});

test('121 a window longer than the objective is refused instead of silently truncated', () => {
  const result = evaluateComfortRide({
    ...smoothRide(),
    endTick: COMFORT_OBJECTIVE.evaluation.windowTicks + 1,
    segments: [
      {
        segmentId: 'segment:121:long',
        controlMode: 'LEARNING',
        learningEligible: true,
        startTick: 0,
        endTick: COMFORT_OBJECTIVE.evaluation.windowTicks + 1,
      },
    ],
  });
  assert.equal(result.status, 'WINDOW_EXCEEDED');
  assert.equal(result.metrics.accelerationSamples, 0);
});

test('121 malformed rides and injected style scores are rejected', () => {
  assert(
    throwsWith(
      () => evaluateComfortRide({ ...smoothRide(), styleScore: 0.9 }),
      /Unknown comfort ride field/,
    ),
  );
  const samples = smoothRide().samples;
  assert(
    throwsWith(
      () => evaluateComfortRide({ ...smoothRide(), samples: [samples[1], samples[0]] }),
      /strictly increasing/,
    ),
  );
  assert(
    throwsWith(
      () => evaluateComfortRide({ ...smoothRide(), samples: [{ tick: 0, speedMps: -1 }] }),
      /Invalid comfort speed sample/,
    ),
  );
  assert(
    throwsWith(
      () => evaluateComfortRide({ ...smoothRide(), startTick: 10, endTick: 10, samples: [] }),
      /empty/,
    ),
  );
  assert(
    throwsWith(
      () => evaluateComfortRide({ ...smoothRide(), artifactWindows: [{ windowClass: 'OTHER' }] }),
      /artifact window class/,
    ),
  );
  assert(
    throwsWith(
      () => evaluateComfortRide({ ...smoothRide(), rideState: 'CRUISING' }),
      /Unknown comfort ride state/,
    ),
  );
  assert(
    throwsWith(
      () =>
        evaluateComfortRide({
          ...smoothRide(),
          segments: [
            {
              segmentId: 'segment:121:bad',
              controlMode: 'MANUAL',
              learningEligible: true,
              startTick: 0,
              endTick: 120,
            },
          ],
        }),
      /eligibility must match/,
    ),
  );
  assert(
    throwsWith(
      () =>
        evaluateComfortRide({
          ...smoothRide(),
          endTick: 119,
          segments: [
            {
              segmentId: 'segment:121:mismatch',
              controlMode: 'LEARNING',
              learningEligible: true,
              startTick: 0,
              endTick: 120,
            },
          ],
        }),
      /window must match its segments/,
    ),
  );
});

test('121 the comfort mission completes only through a passing comfort result', () => {
  const passed = comfortMissionOutcome({
    missionId: COMFORT_MISSION_ID,
    result: evaluateComfortRide(smoothRide()),
  });
  assert.deepEqual(passed, {
    missionId: COMFORT_MISSION_ID,
    objectiveId: COMFORT_OBJECTIVE_ID,
    status: 'COMPLETED',
    reason: null,
    comfortStatus: 'PASSED',
    styleFidelity: null,
  });
  const failed = comfortMissionOutcome({
    missionId: COMFORT_MISSION_ID,
    result: evaluateComfortRide(briskRide()),
  });
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.reason, 'ACCELERATION_LIMIT');
  assert.equal(failed.comfortStatus, 'FAILED');
  assert(
    throwsWith(() => comfortMissionOutcome({ missionId: 'other', result: passed }), /Unknown/),
  );
  assert(
    throwsWith(
      () =>
        comfortMissionOutcome({
          missionId: COMFORT_MISSION_ID,
          result: { ...evaluateComfortRide(smoothRide()), styleScoreUsed: true },
        }),
      /requires a comfort result/,
    ),
  );
});

test('121 evaluation is deterministic and reports only comfort statuses', () => {
  const first = evaluateComfortRide(recoveryRide());
  const second = evaluateComfortRide(recoveryRide());
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert((comfortStatuses as readonly string[]).includes(first.status));
  assert.equal('styleFidelity' in first, true);
  assert.equal(first.styleFidelity, null);
});

test('121 the telemetry projection rejects mixed or unordered 085 readouts', () => {
  assert(throwsWith(() => comfortTelemetryFromTickSamples([]), /at least one tick sample/));
  const malformed = {
    segmentId: 'segment:121:x',
    controlMode: 'LEARNING',
    profileId: 'profile:121:base',
    learningEpoch: 1,
    learningEligible: true,
    observation: {
      tick: 5,
      state: { velocityMps: { x: Number.NaN, y: 0, z: 0 } },
      physics: { longitudinalAccelerationMps2: 0, lateralAccelerationMps2: 0 },
    },
  } as never;
  assert(
    throwsWith(
      () => comfortTelemetryFromTickSamples([malformed]),
      /Invalid comfort telemetry speed/,
    ),
  );
  assert.equal(smoothRide().samples.length, 121);
});

test('121 comfort source is deterministic and free of DOM, clocks and randomness', () => {
  const source = readFileSync(SOURCE_COMFORT, 'utf8');
  for (const token of [
    'Date',
    'performance.now',
    'Math.random',
    'setTimeout',
    'setInterval',
    'requestAnimationFrame',
    'document.',
    'localStorage',
  ])
    assert.equal(source.includes(token), false, `${SOURCE_COMFORT} contains ${token}`);
  for (const forbidden of [
    "from '../ui'",
    "from '../input'",
    "from '../app'",
    "from './lifecycle'",
  ])
    assert.equal(source.includes(forbidden), false);
  assert.equal(COMFORT_RIDE_ID.startsWith('ride:'), true);
});

test('121 report transcript is deterministic and matches the saved evidence', () => {
  const report = runMissionComfortReport();
  assert.equal(JSON.stringify(report), JSON.stringify(runMissionComfortReport()));
  assert.equal(report.summary.pass, true, JSON.stringify(report.checks.filter((c) => !c.pass)));
  assert.equal(report.summary.checks, report.checks.length);
  assert.equal(`${JSON.stringify(report, null, 2)}\n`, readFileSync(EVIDENCE, 'utf8'));
});
