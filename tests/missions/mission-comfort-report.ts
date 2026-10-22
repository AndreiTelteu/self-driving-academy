import {
  COMFORT_LIMITS,
  COMFORT_MISSION_ID,
  COMFORT_OBJECTIVE,
  COMFORT_PASSENGER_RIDE_STATES,
  COMFORT_SCHEMA_VERSION,
  COMFORT_THRESHOLD_SOURCE,
  COMFORT_TICK_HZ,
  comfortMissionOutcome,
  comfortPassengerAboard,
  comfortStatuses,
  createComfortMissionCatalog,
  evaluateComfortRide,
  parseComfortObjective,
} from '../../src/missions';
import type { ComfortResult, ComfortThresholds } from '../../src/missions';
import { parameterRegistry } from '../../src/profiles';
import {
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

export interface MissionComfortCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

interface ScenarioRow {
  readonly name: string;
  readonly status: string;
  readonly reason: string | null;
  readonly peakAccelerationMps2: number;
  readonly peakJerkMps3: number;
  readonly accelerationSamples: number;
  readonly jerkSamples: number;
  readonly accelerationViolations: number;
  readonly jerkViolations: number;
  readonly windows: number;
  readonly excludedSpans: number;
  readonly excludedSamples: number;
  readonly excludedIntervals: number;
  readonly teleports: number;
  readonly styleFidelity: null;
}

export interface MissionComfortReport {
  readonly version: typeof COMFORT_SCHEMA_VERSION;
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly limits: typeof COMFORT_LIMITS;
  readonly tickHz: number;
  readonly objective: Readonly<{
    objectiveId: string;
    passengerRequired: boolean;
    artifactPolicy: string;
    separation: Readonly<{ styleFidelity: string; styleScore: string }>;
    thresholdSource: typeof COMFORT_THRESHOLD_SOURCE;
    thresholds: ComfortThresholds;
    windowTicks: number;
    minimumSamples: number;
  }>;
  readonly mission: Readonly<{
    missionId: string;
    title: string;
    namespace: string;
    objectives: readonly string[];
    incidentBudget: number | null;
    prerequisites: readonly string[];
    statuses: readonly string[];
  }>;
  readonly provenance: Readonly<{
    thresholdKeys: readonly string[];
    catalogAcceleration: number;
    catalogJerk: number;
    passengerRideStates: readonly string[];
    telemetrySegments: readonly string[];
    telemetryControlMode: string;
    telemetryLearningEligible: boolean;
    telemetrySamples: number;
    derivedAgainstRecordedMps2: number;
  }>;
  readonly scenarios: readonly ScenarioRow[];
  readonly separation: Readonly<{
    styleFidelityInResult: boolean;
    styleScoreUsed: boolean;
    injectedStyleScoreRejected: boolean;
  }>;
  readonly checks: readonly MissionComfortCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function row(name: string, result: ComfortResult): ScenarioRow {
  return Object.freeze({
    name,
    status: result.status,
    reason: result.reason,
    peakAccelerationMps2: result.metrics.peakAccelerationMps2,
    peakJerkMps3: result.metrics.peakJerkMps3,
    accelerationSamples: result.metrics.accelerationSamples,
    jerkSamples: result.metrics.jerkSamples,
    accelerationViolations: result.metrics.accelerationViolations,
    jerkViolations: result.metrics.jerkViolations,
    windows: result.exclusions.windows,
    excludedSpans: result.exclusions.spans,
    excludedSamples: result.samples.excluded,
    excludedIntervals: result.intervals.excluded,
    teleports: result.exclusions.teleports,
    styleFidelity: result.styleFidelity,
  });
}

function check(
  checks: MissionComfortCheck[],
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): void {
  checks.push(
    Object.freeze({
      name,
      expected,
      actual,
      pass: JSON.stringify(expected) === JSON.stringify(actual),
      detail,
    }),
  );
}

function throwsWith(action: () => unknown, pattern: RegExp): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && pattern.test(error.message);
  }
}

export function runMissionComfortReport(): MissionComfortReport {
  const checks: MissionComfortCheck[] = [];
  const objective = parseComfortObjective(COMFORT_OBJECTIVE);
  const catalog = createComfortMissionCatalog();
  const mission = catalog.missions[0]!;

  check(
    checks,
    'objective-thresholds',
    { maxAccelerationMps2: 2, maxJerkMps3: 2 },
    objective.thresholds,
    'Explicit acceleration and jerk thresholds, no hidden rule.',
  );
  check(
    checks,
    'objective-threshold-source',
    { maxAccelerationMps2: 'comfort_deceleration', maxJerkMps3: 'acceleration_jerk' },
    {
      maxAccelerationMps2: objective.thresholdSource.maxAccelerationMps2,
      maxJerkMps3: objective.thresholdSource.maxJerkMps3,
    },
    'The thresholds are catalog parameters, not numbers invented for the mission.',
  );
  check(
    checks,
    'objective-thresholds-match-catalog',
    {
      maxAccelerationMps2: parameterRegistry.comfort_deceleration.default,
      maxJerkMps3: parameterRegistry.acceleration_jerk.default,
    },
    objective.thresholds,
    'The thresholds are the shipped defaults of the project driving-parameter catalog.',
  );
  check(
    checks,
    'objective-separation',
    { styleFidelity: 'NOT_USED', styleScore: 'NOT_USED' },
    objective.separation,
    'Comfort is separate from imitation/style fidelity by declaration.',
  );
  check(
    checks,
    'objective-passenger',
    true,
    objective.passengerRequired,
    'A passenger is required.',
  );
  check(
    checks,
    'objective-artifact-policy',
    'EXCLUDE_ARTIFACT_SUPPRESSED_SPANS',
    objective.artifactPolicy,
    'Only the real 088 suppressed spans exclude data.',
  );
  check(
    checks,
    'objective-mission-valid',
    1,
    catalog.missions.length,
    'The comfort mission parses through the real 116 catalog contract.',
  );
  check(
    checks,
    'objective-mission-id',
    COMFORT_MISSION_ID,
    mission.missionId,
    'Stable mission id.',
  );
  check(
    checks,
    'objective-mission-objective',
    ['DROPOFFS:1'],
    mission.objectives.map((entry) => `${entry.kind}:${entry.target}`),
    'The 116 objective counts the ride; comfort is the completion gate.',
  );
  check(
    checks,
    'passenger-ride-states',
    ['TO_DROPOFF', 'DROPOFF'],
    [...COMFORT_PASSENGER_RIDE_STATES],
    'The passenger comes from the real 061 ride lifecycle.',
  );
  check(
    checks,
    'passenger-derivation',
    { TO_DROPOFF: true, DROPOFF: true, TO_PICKUP: false, PICKUP: false, COMPLETED: false },
    {
      TO_DROPOFF: comfortPassengerAboard('TO_DROPOFF'),
      DROPOFF: comfortPassengerAboard('DROPOFF'),
      TO_PICKUP: comfortPassengerAboard('TO_PICKUP'),
      PICKUP: comfortPassengerAboard('PICKUP'),
      COMPLETED: comfortPassengerAboard('COMPLETED'),
    },
    'Passenger presence is derived, never asserted by the caller.',
  );

  const telemetry = smoothTelemetry();
  const derivedAcceleration: number[] = [];
  for (let index = 1; index < telemetry.samples.length; index += 1) {
    const previous = telemetry.samples[index - 1]!;
    const current = telemetry.samples[index]!;
    derivedAcceleration.push((current.speedMps - previous.speedMps) * 60);
  }
  const recordedAcceleration = telemetry.recordedAccelerationMps2.slice(1);
  const derivedAgainstRecorded = derivedAcceleration.reduce(
    (worst, value, index) => Math.max(worst, Math.abs(value - recordedAcceleration[index]!)),
    0,
  );
  check(
    checks,
    'telemetry-real-085',
    {
      controlMode: 'LEARNING',
      learningEligible: true,
      segments: 1,
      samples: 121,
    },
    {
      controlMode: telemetry.controlMode,
      learningEligible: telemetry.learningEligible,
      segments: telemetry.segmentIds.length,
      samples: telemetry.samples.length,
    },
    'The samples come from a real 085 LEARNING segment.',
  );
  check(
    checks,
    'telemetry-derived-matches-recorded',
    0,
    Number(derivedAgainstRecorded.toFixed(9)),
    'The acceleration of the metric equals the acceleration recorded by the real 085 physics.',
  );

  const smooth = evaluateComfortRide(smoothRide());
  const brisk = evaluateComfortRide(briskRide());
  const jerky = evaluateComfortRide(jerkyRide());
  const recoveryRaw = evaluateComfortRide(recoveryRideWithoutWindows());
  const recovery = evaluateComfortRide(recoveryRide());
  const tail = evaluateComfortRide(tailRecoveryRide());
  const clean = evaluateComfortRide(smoothRide({ artifactWindows: cleanWindows() }));
  const noPassenger = evaluateComfortRide(smoothRide({ rideState: 'TO_PICKUP' }));
  const insufficient = evaluateComfortRide({
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
  const exceeded = evaluateComfortRide({
    ...smoothRide(),
    endTick: objective.evaluation.windowTicks + 1,
    segments: [
      {
        segmentId: 'segment:121:long',
        controlMode: 'LEARNING',
        learningEligible: true,
        startTick: 0,
        endTick: objective.evaluation.windowTicks + 1,
      },
    ],
  });

  check(checks, 'smooth-status', 'PASSED', smooth.status, 'Lin: sub ambele praguri.');
  check(
    checks,
    'smooth-peak-acceleration',
    0.9375,
    smooth.metrics.peakAccelerationMps2,
    'Real peak.',
  );
  check(
    checks,
    'smooth-peak-jerk',
    0,
    smooth.metrics.peakJerkMps3,
    'Constant acceleration, no jerk.',
  );
  check(checks, 'smooth-samples', 120, smooth.metrics.accelerationSamples, 'All intervals usable.');
  check(
    checks,
    'smooth-segment-facts',
    { controlMode: 'LEARNING', learningEligible: true, segments: 1 },
    {
      controlMode: smooth.segments[0]?.controlMode,
      learningEligible: smooth.segments[0]?.learningEligible,
      segments: smooth.segments.length,
    },
    'The evaluated window is a real 069 LEARNING segment.',
  );
  check(
    checks,
    'brisk-status',
    'FAILED',
    brisk.status,
    'Brusc: limita de accelerație este depășită.',
  );
  check(checks, 'brisk-reason', 'ACCELERATION_LIMIT', brisk.reason, 'Explicit failure reason.');
  check(checks, 'brisk-peak', 5.625, brisk.metrics.peakAccelerationMps2, 'Real 5,625 m/s² peak.');
  check(checks, 'jerky-status', 'FAILED', jerky.status, 'Jerk peste prag.');
  check(checks, 'jerky-reason', 'JERK_LIMIT', jerky.reason, 'Acceleration stays at the limit.');
  check(
    checks,
    'jerky-acceleration-not-violated',
    0,
    jerky.metrics.accelerationViolations,
    'Only the derivative fails.',
  );
  check(
    checks,
    'recovery-raw-fails',
    'FAILED',
    recoveryRaw.status,
    'Without the 088 window the teleport looks like an acceleration violation.',
  );
  check(
    checks,
    'recovery-with-088-passes',
    'PASSED',
    recovery.status,
    'The real 088 window suppresses the recovery boundary tick.',
  );
  check(
    checks,
    'recovery-teleport-counted',
    { spans: 1, teleports: 1, windows: 2 },
    {
      spans: recovery.exclusions.spans,
      teleports: recovery.exclusions.teleports,
      windows: recovery.exclusions.windows,
    },
    '030 recovery facts stay visible as excluded evidence, never as comfort data.',
  );
  check(
    checks,
    'recovery-excluded-samples',
    1,
    recovery.samples.excluded,
    `Suppression starts at tick ${RECOVERY_TICK - 1}, the recovery boundary tick of the closed segment.`,
  );
  check(
    checks,
    'recovery-interval-crossing',
    1,
    recovery.intervals.excluded,
    'The interval that crosses the boundary is dropped, so no impulse enters the metric.',
  );
  check(
    checks,
    'recovery-peak-accepted',
    true,
    recovery.metrics.peakAccelerationMps2 <= objective.thresholds.maxAccelerationMps2,
    'The excluded impulse cannot fail the ride.',
  );
  check(
    checks,
    'recovery-tail-boundary',
    { excludedSamples: 61, excludedIntervals: 0, used: 60 },
    {
      excludedSamples: tail.samples.excluded,
      excludedIntervals: tail.intervals.excluded,
      used: tail.samples.used,
    },
    'When suppression runs to the end of the segment, the boundary sample is dropped.',
  );
  check(
    checks,
    'clean-window-suppresses-nothing',
    { spans: 0, excluded: 0, used: 121 },
    {
      spans: clean.exclusions.spans,
      excluded: clean.samples.excluded,
      used: clean.samples.used,
    },
    'A window without artefacts changes nothing.',
  );
  check(
    checks,
    'no-passenger-status',
    'NO_PASSENGER',
    noPassenger.status,
    'No verdict without a passenger.',
  );
  check(
    checks,
    'no-passenger-metrics',
    0,
    noPassenger.metrics.accelerationSamples,
    'No sampled acceleration without a passenger.',
  );
  check(
    checks,
    'insufficient-status',
    'INSUFFICIENT_DATA',
    insufficient.status,
    `Fewer than ${objective.evaluation.minimumSamples} usable intervals.`,
  );
  check(
    checks,
    'window-exceeded-status',
    'WINDOW_EXCEEDED',
    exceeded.status,
    'A too long ride is refused, not truncated silently.',
  );
  check(
    checks,
    'style-score-rejected',
    true,
    throwsWith(
      () => evaluateComfortRide({ ...smoothRide(), styleScore: 0.9 }),
      /Unknown comfort ride field/,
    ),
    'A style score cannot even enter the comfort input.',
  );
  check(
    checks,
    'result-style-fidelity',
    null,
    smooth.styleFidelity,
    'The result never carries an imitation score.',
  );
  const completed = comfortMissionOutcome({ missionId: COMFORT_MISSION_ID, result: smooth });
  const failed = comfortMissionOutcome({ missionId: COMFORT_MISSION_ID, result: brisk });
  check(
    checks,
    'mission-completes-on-pass',
    ['COMPLETED', null],
    [completed.status, completed.reason],
    'Only a passing comfort result completes the mission.',
  );
  check(
    checks,
    'mission-fails-on-brisk',
    ['FAILED', 'ACCELERATION_LIMIT'],
    [failed.status, failed.reason],
    'A brisk ride keeps the explicit failure reason.',
  );
  const scenarios = [
    row('smooth', smooth),
    row('brisk', brisk),
    row('jerky', jerky),
    row('recovery-without-window', recoveryRaw),
    row('recovery-segment-closed-088', recovery),
    row('recovery-open-segment-088', tail),
    row('clean-window', clean),
    row('no-passenger', noPassenger),
    row('insufficient-data', insufficient),
    row('window-exceeded', exceeded),
  ];
  check(
    checks,
    'scenario-statuses',
    [
      'PASSED',
      'FAILED',
      'FAILED',
      'FAILED',
      'PASSED',
      'PASSED',
      'PASSED',
      'NO_PASSENGER',
      'INSUFFICIENT_DATA',
      'WINDOW_EXCEEDED',
    ],
    scenarios.map((entry) => entry.status),
    'Every closed comfort status is exercised.',
  );
  check(
    checks,
    'no-style-in-any-scenario',
    0,
    scenarios.filter((entry) => entry.styleFidelity !== null).length,
    'No scenario reports a style value.',
  );
  check(
    checks,
    'all-statuses-covered',
    5,
    new Set(scenarios.map((entry) => entry.status)).size,
    `Closed vocabulary: ${comfortStatuses.join(', ')}.`,
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: COMFORT_SCHEMA_VERSION,
    generatedBy: 'scripts/run-mission-comfort-report.mjs',
    oracleRule:
      'Comfort is measured only from acceleration and jerk while a passenger is aboard, inside the ride window minus the real 088 suppressed spans; the thresholds are the shipped catalog defaults and no style score is read or reported.',
    limits: COMFORT_LIMITS,
    tickHz: COMFORT_TICK_HZ,
    objective: Object.freeze({
      objectiveId: objective.objectiveId,
      passengerRequired: objective.passengerRequired,
      artifactPolicy: objective.artifactPolicy,
      separation: objective.separation,
      thresholdSource: objective.thresholdSource,
      thresholds: objective.thresholds,
      windowTicks: objective.evaluation.windowTicks,
      minimumSamples: objective.evaluation.minimumSamples,
    }),
    mission: Object.freeze({
      missionId: mission.missionId,
      title: mission.title,
      namespace: catalog.namespace,
      objectives: Object.freeze(mission.objectives.map((entry) => `${entry.kind}:${entry.target}`)),
      incidentBudget: mission.incidentBudget,
      prerequisites: mission.prerequisites,
      statuses: comfortStatuses,
    }),
    provenance: Object.freeze({
      thresholdKeys: Object.freeze([
        objective.thresholdSource.maxAccelerationMps2,
        objective.thresholdSource.maxJerkMps3,
      ]),
      catalogAcceleration: parameterRegistry.comfort_deceleration.default,
      catalogJerk: parameterRegistry.acceleration_jerk.default,
      passengerRideStates: COMFORT_PASSENGER_RIDE_STATES,
      telemetrySegments: telemetry.segmentIds,
      telemetryControlMode: telemetry.controlMode,
      telemetryLearningEligible: telemetry.learningEligible,
      telemetrySamples: telemetry.samples.length,
      derivedAgainstRecordedMps2: Number(derivedAgainstRecorded.toFixed(9)),
    }),
    scenarios: Object.freeze(scenarios),
    separation: Object.freeze({
      styleFidelityInResult: smooth.styleFidelity !== null,
      styleScoreUsed: smooth.styleScoreUsed,
      injectedStyleScoreRejected: throwsWith(
        () => evaluateComfortRide({ ...smoothRide(), styleScore: 0.9 }),
        /Unknown comfort ride field/,
      ),
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}
