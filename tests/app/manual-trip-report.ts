import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MANUAL_TRIP_REFUSAL_REASONS,
  MANUAL_TRIP_VERSION,
  createManualTrip,
  manualTripContractFacts,
  type ManualTripRefusal,
  type ManualTripRefusalReason,
  type ManualTripResult,
} from '../../src/app/manual-trip';
import { createManualTripWorld } from './manual-trip-fixture';
import type { ManualTripWorld } from './manual-trip-fixture';
import type { ManualTripMode } from '../../src/app/manual-trip';

export interface ManualTripReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

interface RideSummary {
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly pickupZoneId: string;
  readonly dropoffZoneId: string;
  readonly state: string;
  readonly completedTick: number | null;
  readonly boardingTick: number | null;
  readonly completionTick: number | null;
  readonly completionDwellTicks: number | null;
  readonly releaseReason: string | null;
  readonly transitions: readonly (readonly [string, number])[];
  readonly dropoffTransitions: number;
}

interface SegmentSummary {
  readonly segmentId: string;
  readonly mode: string;
  readonly learningEligible: boolean;
  readonly startTick: number;
  readonly endTick: number | null;
  readonly completeness: string;
  readonly closeReason: string | null;
  readonly samples: number;
  readonly observedParameters: readonly string[];
  readonly publishedParameters: readonly string[];
  readonly publicationOperationId: string | null;
}

interface HandoverSummary {
  readonly decisionTick: number;
  readonly closedMode: string | null;
  readonly authority: string;
  readonly segmentCloseReason: string | null;
  readonly reason: string;
  readonly reentryReason: string | null;
  readonly statePreserved: boolean;
  readonly violations: readonly string[];
  readonly commandStep: number | null;
  readonly commandContinuity: string;
  readonly teleportsVehicle: boolean;
}

interface TripSummary {
  readonly beginRideId: string;
  readonly sameRide: boolean;
  readonly sameRequest: boolean;
  readonly sameTaxi: boolean;
  readonly ride: RideSummary | null;
  readonly assignmentPickupZoneId: string;
  readonly assignmentDropoffZoneId: string;
  readonly segments: readonly SegmentSummary[];
  readonly intakeEntries: number;
  readonly publications: number;
  readonly publishedParameters: readonly string[];
  readonly manualSegments: number;
  readonly learningSegments: number;
  readonly profileUnchanged: boolean;
  readonly ticks: Readonly<Record<ManualTripMode, number>>;
  readonly samplesAppended: number;
  readonly samplesSkipped: number;
  readonly handovers: readonly HandoverSummary[];
  readonly lifecycleRides: number;
  readonly lifecycleActive: number;
  readonly lifecycleTerminal: number;
  readonly lifecycleReleases: number;
  readonly lifecycleTransitions: number;
  readonly dispatcherReleases: number;
  readonly finalMode: ManualTripMode;
  readonly refused: Readonly<Record<ManualTripRefusalReason, number>>;
}

export interface ManualTripReport {
  readonly version: typeof MANUAL_TRIP_VERSION;
  readonly generatedBy: 'npm run trip:manual';
  readonly oracleRule: string;
  readonly contract: ReturnType<typeof manualTripContractFacts>;
  readonly timeline: Readonly<{
    beginTick: number;
    boardingTick: number;
    driveStartTick: number;
    driveTicks: number;
    driveSpeedMps: number;
    dropoffStartTick: number;
    completionTick: number;
    pickupDwellTicks: number;
    dropoffDwellTicks: number;
  }>;
  readonly mixed: TripSummary;
  readonly manual: TripSummary;
  readonly learning: TripSummary;
  readonly completionBoundary: TripSummary;
  readonly refusals: Readonly<{
    reasons: Readonly<Record<string, string>>;
    rideState: string | null;
    segments: number;
    lifecycleRides: number;
    catalogue: readonly string[];
  }>;
  readonly disposal: Readonly<{
    disposed: boolean;
    openSegments: number;
    rideState: string | null;
    taxiStatus: string | undefined;
  }>;
  readonly determinism: Readonly<{ identical: boolean; scenarios: number }>;
  readonly checks: readonly ManualTripReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): ManualTripReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function truthy(name: string, actual: boolean, detail: string): ManualTripReportCheck {
  return check(name, true, actual, detail);
}

/** Key-order-independent view of a closed reason/name map. */
function sortedRecord<T>(input: Readonly<Record<string, T>>): Readonly<Record<string, T>> {
  return Object.fromEntries(
    Object.entries(input).sort(([left], [right]) => (left < right ? -1 : 1)),
  );
}

function throws(action: () => unknown, pattern: RegExp): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && pattern.test(error.message);
  }
}

function refusalOf(value: { readonly accepted: boolean }): ManualTripRefusal {
  if (value.accepted) throw new Error('Expected a closed refusal');
  return value as ManualTripRefusal;
}

function begin(world: ManualTripWorld): string {
  world.advanceAuthorityTo(world.timeline.beginTick);
  const begun = world.begin();
  if (!begun.accepted) throw new Error(`The fixture could not begin the ride: ${begun.reason}`);
  return begun.rideId;
}

function mode(world: ManualTripWorld, requested: ManualTripMode): void {
  const result = world.requestMode(requested);
  if (!result.accepted) throw new Error(`Mode ${requested} was refused: ${result.reason}`);
}

function summarize(world: ManualTripWorld, beginRideId: string): TripSummary {
  const result: ManualTripResult = world.trip.result(),
    ride = result.ride,
    lifecycle = world.rideWorld.lifecycle.stats(),
    rideRecord = ride === null ? undefined : world.rideWorld.lifecycle.ride(ride.rideId);
  return Object.freeze({
    beginRideId,
    sameRide: ride?.rideId === beginRideId,
    sameRequest: ride?.requestId === world.assignment.requestId,
    sameTaxi: ride?.taxiId === world.assignment.taxiId,
    assignmentPickupZoneId: world.assignment.pickupZoneId,
    assignmentDropoffZoneId: world.assignment.dropoffZoneId,
    ride:
      ride === null
        ? null
        : Object.freeze({
            rideId: ride.rideId,
            requestId: ride.requestId,
            taxiId: ride.taxiId,
            pickupZoneId: ride.pickupZoneId,
            dropoffZoneId: ride.dropoffZoneId,
            state: ride.state,
            completedTick: ride.completedTick,
            boardingTick: ride.boardingTick,
            completionTick: ride.completionTick,
            completionDwellTicks: ride.completionDwellTicks,
            releaseReason: ride.releaseReason,
            transitions: ride.transitions,
            dropoffTransitions:
              rideRecord?.transitions.filter((entry) => entry.event === 'DROPOFF_COMPLETE')
                .length ?? 0,
          }),
    segments: Object.freeze(
      result.segments.map((segment) =>
        Object.freeze({
          segmentId: segment.segmentId,
          mode: segment.mode,
          learningEligible: segment.learningEligible,
          startTick: segment.startTick,
          endTick: segment.endTick,
          completeness: segment.completeness,
          closeReason: segment.closeReason,
          samples: segment.samples,
          observedParameters: segment.observedParameters,
          publishedParameters: segment.publishedParameters,
          publicationOperationId: segment.publicationOperationId,
        }),
      ),
    ),
    intakeEntries: result.learning.intakeEntries,
    publications: result.learning.publications.length,
    publishedParameters: result.learning.publications[0]?.observedParameters ?? Object.freeze([]),
    manualSegments: result.learning.manualSegments,
    learningSegments: result.learning.learningSegments,
    profileUnchanged: result.profile.unchanged,
    ticks: result.telemetry.ticks,
    samplesAppended: result.telemetry.samplesAppended,
    samplesSkipped: result.telemetry.samplesSkipped,
    handovers: Object.freeze(
      result.handovers.map((handover) =>
        Object.freeze({
          decisionTick: handover.decisionTick,
          closedMode: handover.closedMode,
          authority: handover.authority,
          segmentCloseReason: handover.segmentCloseReason,
          reason: handover.reason,
          reentryReason: handover.reentryReason,
          statePreserved: handover.statePreserved,
          violations: handover.violations,
          commandStep: handover.commandStep,
          commandContinuity: handover.commandContinuity,
          teleportsVehicle: handover.teleportsVehicle,
        }),
      ),
    ),
    lifecycleRides: lifecycle.rides,
    lifecycleActive: lifecycle.active,
    lifecycleTerminal: lifecycle.completed + lifecycle.failed + lifecycle.cancelled,
    lifecycleReleases: lifecycle.releases,
    lifecycleTransitions: lifecycle.transitions,
    dispatcherReleases: world.rideWorld.dispatcherWorld.dispatcher.releases().length,
    finalMode: result.mode,
    refused: result.refusals,
  });
}

function runMixed(): TripSummary {
  const world = createManualTripWorld(),
    beginRideId = begin(world);
  world.runTo(30);
  mode(world, 'MANUAL');
  world.runTo(34);
  mode(world, 'AUTO');
  world.runTo(world.timeline.completionTick);
  const summary = summarize(world, beginRideId);
  world.dispose();
  return summary;
}

function runManual(): TripSummary {
  const world = createManualTripWorld(),
    beginRideId = begin(world);
  mode(world, 'MANUAL');
  world.runTo(world.timeline.completionTick);
  mode(world, 'AUTO');
  world.runTo(world.timeline.completionTick + 1);
  const summary = summarize(world, beginRideId);
  world.dispose();
  return summary;
}

function runLearning(): TripSummary {
  const world = createManualTripWorld(),
    beginRideId = begin(world);
  world.runTo(30);
  mode(world, 'LEARNING');
  world.runTo(34);
  mode(world, 'AUTO');
  world.runTo(35);
  const summary = summarize(world, beginRideId);
  world.dispose();
  return summary;
}

function runCompletionBoundary(): TripSummary {
  const world = createManualTripWorld(),
    beginRideId = begin(world);
  mode(world, 'MANUAL');
  world.runTo(world.timeline.completionTick + 1);
  const summary = summarize(world, beginRideId);
  world.dispose();
  return summary;
}

function runRefusals(): ManualTripReport['refusals'] {
  const reasons: Record<string, string> = Object.create(null),
    record = (name: string, action: () => { readonly accepted: boolean }) => {
      reasons[name] = refusalOf(action()).reason;
    };
  const empty = createManualTripWorld();
  record('NO_ACTIVE_RIDE', () => empty.requestMode('MANUAL'));
  record('TAXI_MISMATCH', () =>
    empty.trip.begin({
      requestId: empty.assignment.requestId,
      eventId: `assigned:${empty.assignment.requestId}`,
      tick: empty.trip.currentTick(),
      taxiId: 'foreign-taxi',
    }),
  );
  empty.dispose();

  const world = createManualTripWorld(),
    beginRideId = begin(world),
    now = () => world.trip.currentTick();
  record('DUPLICATE_RIDE', () => world.begin());
  record('TICK_NOT_CURRENT', () => world.trip.requestMode({ tick: now() - 1, mode: 'MANUAL' }));
  record('RIDE_MISMATCH', () =>
    world.trip.requestMode({ tick: now(), mode: 'MANUAL', rideId: 'another-ride' }),
  );
  record('ALREADY_IN_MODE', () => world.requestMode('AUTO'));
  record('UNKNOWN_MODE', () => world.trip.requestMode({ tick: now(), mode: 'FLY' }));
  record('TICK_NOT_NEXT', () => world.trip.step({ tick: now() + 2 }));
  world.setSelected(null);
  record('TARGET_UNAVAILABLE', () => world.requestMode('MANUAL'));
  world.setSelected(world.taxi);
  mode(world, 'MANUAL');
  record('INTENT_ALREADY_QUEUED', () => world.requestMode('AUTO'));
  world.runTo(11);
  world.runTo(12);
  mode(world, 'AUTO');
  world.runTo(13);
  world.suspend();
  record('AUTHORITY_SUSPENDED', () => world.requestMode('MANUAL'));
  world.resume();
  world.runTo(world.timeline.completionTick);
  record('RIDE_TERMINAL', () => world.begin());
  const ride = world.trip.result().ride,
    segments = world.trip.result().segments.length,
    lifecycleRides = world.rideWorld.lifecycle.stats().rides,
    rideState = ride?.state ?? null;
  world.dispose();

  const ineligible = createManualTripWorld();
  begin(ineligible);
  ineligible.setLearningEligible(false);
  record('LEARNING_UNAVAILABLE', () => ineligible.requestMode('LEARNING'));
  ineligible.dispose();
  void beginRideId;
  return Object.freeze({
    reasons: Object.freeze({ ...reasons }),
    rideState,
    segments,
    lifecycleRides,
    catalogue: Object.freeze([...MANUAL_TRIP_REFUSAL_REASONS]),
  });
}

function runDisposal(): ManualTripReport['disposal'] {
  const world = createManualTripWorld(),
    beginRideId = begin(world);
  mode(world, 'MANUAL');
  world.runTo(12);
  const rideId = world.trip.stats().rideId ?? beginRideId,
    rideState = world.rideWorld.lifecycle.ride(rideId)?.state ?? null;
  world.trip.dispose();
  world.trip.dispose();
  const stats = world.trip.stats(),
    taxiStatus = world.rideWorld.dispatcherWorld.dispatcher.taxiStatus(world.assignment.taxiId);
  world.dispose();
  return Object.freeze({
    disposed: stats.disposed,
    openSegments: stats.openSegments,
    rideState,
    taxiStatus,
  });
}

function validationProbes(): Readonly<Record<string, boolean>> {
  const world = createManualTripWorld(),
    options = world.options,
    result = Object.freeze({
      missingContext: throws(() => createManualTrip({}), /Missing manual trip option field/),
      missingLifecycle: throws(
        () => createManualTrip({ ...options, lifecycle: undefined }),
        /Missing manual trip option field: lifecycle/,
      ),
      missingReadState: throws(
        () => createManualTrip({ ...options, readState: undefined }),
        /Missing manual trip option field: readState/,
      ),
      unknownOption: throws(
        () => createManualTrip({ ...options, extra: true }),
        /Unknown manual trip option field/,
      ),
      badTaxi: throws(
        () => createManualTrip({ ...options, taxiIdentity: { ...world.taxi, entityId: '' } }),
        /Invalid taxi identity/,
      ),
    });
  world.dispose();
  return result;
}

export function runManualTripReport(): ManualTripReport {
  const mixed = runMixed(),
    manual = runManual(),
    learning = runLearning(),
    completionBoundary = runCompletionBoundary(),
    refusals = runRefusals(),
    disposal = runDisposal(),
    second = runMixed(),
    deterministic = JSON.stringify(mixed) === JSON.stringify(second),
    contract = manualTripContractFacts(),
    timelineWorld = createManualTripWorld(),
    timeline = timelineWorld.timeline;
  timelineWorld.dispose();
  const validation = validationProbes();
  const source = readFileSync(join(process.cwd(), 'src', 'app', 'manual-trip.ts'), 'utf8'),
    noWallClock =
      !/\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/.test(
        source,
      ),
    noDom = !/\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/.test(source),
    checks: ManualTripReportCheck[] = [
      check('version', '072-manual-trip-v1', MANUAL_TRIP_VERSION, 'One versioned trip identity.'),
      check(
        'contract',
        {
          refusalReasons: [...MANUAL_TRIP_REFUSAL_REASONS],
          segments: 64,
          publications: 64,
          samplesPerSegment: 32,
          tickHz: 60,
          learningParameterKeys: 24,
          parameterKeys: 80,
        },
        {
          refusalReasons: contract.refusalReasons,
          segments: contract.segments,
          publications: contract.publications,
          samplesPerSegment: contract.samplesPerSegment,
          tickHz: contract.tickHz,
          learningParameterKeys: contract.learningParameterKeys.length,
          parameterKeys: contract.parameterKeys.length,
        },
        'The closed refusal/limit vocabulary and the 24 published learning targets.',
      ),
      check(
        'mixed',
        {
          state: 'COMPLETED',
          segments: 1,
          mode: 'MANUAL',
          closeReason: 'RETURN_TO_AUTO',
          rides: 1,
          dropoffTransitions: 1,
          releases: 1,
          dispatcherReleases: 1,
          transit: 5,
          intake: 0,
        },
        {
          state: mixed.ride?.state,
          segments: mixed.segments.length,
          mode: mixed.segments[0]?.mode,
          closeReason: mixed.segments[0]?.closeReason,
          rides: mixed.lifecycleRides,
          dropoffTransitions: mixed.ride?.dropoffTransitions,
          releases: mixed.lifecycleReleases,
          dispatcherReleases: mixed.dispatcherReleases,
          transit: mixed.ride?.transitions.length,
          intake: mixed.intakeEntries,
        },
        'A short MANUAL intervention on an AUTO ride never duplicates the ride or its completion.',
      ),
      check(
        'mixed-same-ride',
        { sameRide: true, sameRequest: true, sameTaxi: true },
        {
          sameRide: mixed.sameRide,
          sameRequest: mixed.sameRequest,
          sameTaxi: mixed.sameTaxi,
        },
        'AUTO resumes exactly the ride the intervention paused, with the same real claim.',
      ),
      check(
        'mixed-proofs',
        {
          boardingTick: timeline.boardingTick,
          completionTick: timeline.completionTick,
          pickupZone: mixed.assignmentPickupZoneId,
          dropoffZone: mixed.assignmentDropoffZoneId,
          dropoffTransitions: 1,
        },
        {
          boardingTick: mixed.ride?.boardingTick,
          completionTick: mixed.ride?.completionTick,
          pickupZone: mixed.ride?.pickupZoneId,
          dropoffZone: mixed.ride?.dropoffZoneId,
          dropoffTransitions: mixed.ride?.dropoffTransitions,
        },
        'The pickup and dropoff proofs survive the intervention unchanged: same assignment zones, same boarding and completion ticks.',
      ),
      check(
        'mixed-handover',
        {
          closedMode: 'MANUAL',
          authority: 'AUTO',
          closeReason: 'RETURN_TO_AUTO',
          statePreserved: true,
          violations: [],
          teleports: false,
          commandContinuity: 'WITHIN_BOUND',
        },
        {
          closedMode: mixed.handovers[0]?.closedMode,
          authority: mixed.handovers[0]?.authority,
          closeReason: mixed.handovers[0]?.segmentCloseReason,
          statePreserved: mixed.handovers[0]?.statePreserved,
          violations: mixed.handovers[0]?.violations,
          teleports: mixed.handovers[0]?.teleportsVehicle,
          commandContinuity: mixed.handovers[0]?.commandContinuity,
        },
        'The real 071 continuity measured one authoritative handover step without repairing it.',
      ),
      check(
        'mixed-manual-evidence',
        { learningEligible: false, publications: 0, intake: 0, samplesPositive: true },
        {
          learningEligible: mixed.segments[0]?.learningEligible,
          publications: mixed.publications,
          intake: mixed.intakeEntries,
          samplesPositive: (mixed.segments[0]?.samples ?? 0) > 0,
        },
        'A MANUAL segment records telemetry with learningEligible=false and never a publication.',
      ),
      check(
        'manual-complete',
        {
          state: 'COMPLETED',
          boardingTick: timeline.boardingTick,
          completionTick: timeline.completionTick,
          dwell: timeline.dropoffDwellTicks,
          manualTicksOver800: true,
          cappedSamples: 32,
          skippedPositive: true,
          intake: 0,
          publications: 0,
        },
        {
          state: manual.ride?.state,
          boardingTick: manual.ride?.boardingTick,
          completionTick: manual.ride?.completionTick,
          dwell: manual.ride?.completionDwellTicks,
          manualTicksOver800: manual.ticks.MANUAL > 800,
          cappedSamples: manual.samplesAppended,
          skippedPositive: manual.samplesSkipped > 0,
          intake: manual.intakeEntries,
          publications: manual.publications,
        },
        'A complete MANUAL trip produces the real ride result and telemetry with no learning.',
      ),
      check(
        'manual-return',
        { closeReason: 'RETURN_TO_AUTO', statePreserved: true, mode: 'AUTO' },
        {
          closeReason: manual.segments[0]?.closeReason,
          statePreserved: manual.handovers[0]?.statePreserved,
          mode: manual.finalMode,
        },
        'The player returns to AUTO after delivery and the MANUAL segment closes once.',
      ),
      check(
        'learning-publication',
        {
          segments: 1,
          eligible: true,
          intake: 1,
          publications: 1,
          published: ['desired_acceleration', 'speed_delta_urban'],
          unobserved: 22,
          closeReason: 'RETURN_TO_AUTO',
        },
        {
          segments: learning.segments.length,
          eligible: learning.segments[0]?.learningEligible,
          intake: learning.intakeEntries,
          publications: learning.publications,
          published: learning.publishedParameters,
          unobserved: 24 - learning.publishedParameters.length,
          closeReason: learning.segments[0]?.closeReason,
        },
        'LEARNING queues one real 069 intake and publishes only the observed parameter keys.',
      ),
      check(
        'learning-not-manual',
        { manualSegments: 0, learningSegments: 1 },
        { manualSegments: learning.manualSegments, learningSegments: learning.learningSegments },
        'The demonstration is a real LEARNING segment, not a MANUAL segment counted as learning.',
      ),
      check(
        'profile-unchanged',
        { mixed: true, manual: true, learning: true },
        {
          mixed: mixed.profileUnchanged,
          manual: manual.profileUnchanged,
          learning: learning.profileUnchanged,
        },
        'No trip changes the profile values or the proof counts.',
      ),
      check(
        'completion-boundary',
        {
          mode: 'MANUAL',
          segments: 2,
          firstClose: 'RIDE_COMPLETED',
          secondMode: 'MANUAL',
          secondCompleteness: 'OPEN',
        },
        {
          mode: completionBoundary.finalMode,
          segments: completionBoundary.segments.length,
          firstClose: completionBoundary.segments[0]?.closeReason,
          secondMode: completionBoundary.segments[1]?.mode,
          secondCompleteness: completionBoundary.segments[1]?.completeness,
        },
        'A ride completed while MANUAL opens a new segment without changing the control mode.',
      ),
      check(
        'refusals',
        {
          reasons: sortedRecord({
            NO_ACTIVE_RIDE: 'NO_ACTIVE_RIDE',
            DUPLICATE_RIDE: 'DUPLICATE_RIDE',
            RIDE_TERMINAL: 'RIDE_TERMINAL',
            RIDE_MISMATCH: 'RIDE_MISMATCH',
            TAXI_MISMATCH: 'TAXI_MISMATCH',
            TICK_NOT_CURRENT: 'TICK_NOT_CURRENT',
            TICK_NOT_NEXT: 'TICK_NOT_NEXT',
            UNKNOWN_MODE: 'UNKNOWN_MODE',
            ALREADY_IN_MODE: 'ALREADY_IN_MODE',
            INTENT_ALREADY_QUEUED: 'INTENT_ALREADY_QUEUED',
            LEARNING_UNAVAILABLE: 'LEARNING_UNAVAILABLE',
            TARGET_UNAVAILABLE: 'TARGET_UNAVAILABLE',
            AUTHORITY_SUSPENDED: 'AUTHORITY_SUSPENDED',
          }),
          rideState: 'COMPLETED',
          segments: 1,
          rides: 1,
        },
        {
          reasons: sortedRecord(refusals.reasons),
          rideState: refusals.rideState,
          segments: refusals.segments,
          rides: refusals.lifecycleRides,
        },
        'Every illegal intervention carries one closed reason and leaves the ride untouched.',
      ),
      check(
        'disposal',
        { disposed: true, openSegments: 0, rideState: 'TO_PICKUP', taxiStatus: 'ASSIGNED' },
        disposal,
        'Disposal retires the open segment and never releases the host-owned ride.',
      ),
      truthy('determinism', deterministic, 'Two identical scenarios produce identical JSON.'),
      truthy('no-wall-clock', noWallClock, 'The source has no Date, timer or ambient randomness.'),
      truthy('no-dom-or-renderer', noDom, 'The source has no DOM, Babylon or Rapier dependency.'),
      check(
        'validation-errors',
        {
          missingContext: true,
          missingLifecycle: true,
          missingReadState: true,
          unknownOption: true,
          badTaxi: true,
        },
        validation,
        'Malformed option objects are rejected before a single accepted tick.',
      ),
    ],
    passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: MANUAL_TRIP_VERSION,
    generatedBy: 'npm run trip:manual',
    oracleRule:
      'One real 061 ride is driven through the real 062/063 service gate while the real 066 seat, 067 mode intents, 068 selection and 069 segments are applied by the real bridge. A MANUAL/LEARNING segment never creates, retargets or releases the ride; a closed eligible LEARNING segment publishes only the parameter keys observed inside it; MANUAL publishes nothing and leaves the profile values and proofs untouched.',
    contract,
    timeline: Object.freeze({
      beginTick: timeline.beginTick,
      boardingTick: timeline.boardingTick,
      driveStartTick: timeline.driveStartTick,
      driveTicks: timeline.driveTicks,
      driveSpeedMps: timeline.driveSpeedMps,
      dropoffStartTick: timeline.dropoffStartTick,
      completionTick: timeline.completionTick,
      pickupDwellTicks: timeline.pickupDwellTicks,
      dropoffDwellTicks: timeline.dropoffDwellTicks,
    }),
    mixed,
    manual,
    learning,
    completionBoundary,
    refusals,
    disposal,
    determinism: Object.freeze({ identical: deterministic, scenarios: 2 }),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}
