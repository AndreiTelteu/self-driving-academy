import { createPassengerRideBridge, readPassengerVisualFrame } from '../../src/app';
import {
  createPassengerVisualPresenter,
  PASSENGER_VISUAL_LIMITS,
  PASSENGER_VISUAL_VERSION,
  passengerMarkerId,
} from '../../src/ui';
import type {
  PassengerMarker,
  PassengerMarkerOmission,
  PassengerVisualFrame,
  PassengerVisualLabels,
  PassengerVisualPhase,
} from '../../src/ui';
import { taxiAt } from '../fleet/dispatcher-fixture';
import {
  beginFirstRide,
  createRideLifecycleWorld,
  disposeRideLifecycleWorld,
} from '../fleet/ride-fsm-fixture';
import { createRecordingPassengerPort, PASSENGER_SESSION } from '../ui/passenger-visual-fixture';
import type { RecordedPassengerCommand } from '../ui/passenger-visual-fixture';

export interface PassengerVisualFrameView {
  readonly tick: number;
  readonly taxiId: string;
  readonly rideId: string | null;
  readonly phase: PassengerVisualPhase;
  readonly occupancy: 0 | 1;
  readonly passengerVisible: boolean;
  readonly reset: boolean;
  readonly markers: readonly PassengerMarker[];
  readonly omissions: readonly PassengerMarkerOmission[];
  readonly labels: PassengerVisualLabels;
  readonly accessibleText: string;
}

export interface PassengerVisualScenarioStats {
  readonly markers: number;
  readonly commands: number;
  readonly cleared: number;
  readonly updates: number;
  readonly rejected: number;
  readonly visible: boolean;
}

export interface PassengerVisualScenario {
  readonly name: string;
  readonly frames: readonly PassengerVisualFrameView[];
  readonly commands: readonly RecordedPassengerCommand[];
  readonly stats: PassengerVisualScenarioStats;
}

export interface PassengerVisualCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface PassengerVisualReport {
  readonly version: typeof PASSENGER_VISUAL_VERSION;
  readonly contract: Readonly<{
    limits: Readonly<Record<string, number | string>>;
    phases: readonly Readonly<{ state: string; phase: PassengerVisualPhase; occupancy: 0 | 1 }>[];
    passenger: 'V1 passenger representation is a marker/occupancy read model only; pedestrians belong to V2.';
  }>;
  readonly scenarios: readonly PassengerVisualScenario[];
  readonly checks: readonly PassengerVisualCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

const STATE_PHASES: readonly Readonly<{
  state: string;
  phase: PassengerVisualPhase;
  occupancy: 0 | 1;
}>[] = Object.freeze([
  Object.freeze({ state: 'TO_PICKUP', phase: 'WAITING_PICKUP' as const, occupancy: 0 as const }),
  Object.freeze({ state: 'PICKUP', phase: 'BOARDING' as const, occupancy: 0 as const }),
  Object.freeze({ state: 'TO_DROPOFF', phase: 'ONBOARD' as const, occupancy: 1 as const }),
  Object.freeze({ state: 'DROPOFF', phase: 'DROPPING_OFF' as const, occupancy: 1 as const }),
  Object.freeze({ state: 'COMPLETED', phase: 'NONE' as const, occupancy: 0 as const }),
]);

function viewOf(frame: PassengerVisualFrame): PassengerVisualFrameView {
  return Object.freeze({
    tick: frame.tick,
    taxiId: frame.taxiId,
    rideId: frame.rideId,
    phase: frame.phase,
    occupancy: frame.occupancy,
    passengerVisible: frame.passengerVisible,
    reset: frame.reset,
    markers: frame.markers,
    omissions: frame.omissions,
    labels: frame.labels,
    accessibleText: frame.accessibleText,
  });
}

/** Runs one scenario on a fresh presenter over the given frames; commands are exactly the writes. */
function runScenario(
  name: string,
  frames: readonly PassengerVisualFrame[],
): PassengerVisualScenario {
  const recording = createRecordingPassengerPort(),
    presenter = createPassengerVisualPresenter(recording.port);
  for (const frame of frames) presenter.update(frame);
  const stats = presenter.getStats(),
    commands = recording.calls.slice();
  presenter.dispose();
  return Object.freeze({
    name,
    frames: Object.freeze(frames.map(viewOf)),
    commands: Object.freeze(commands),
    stats: Object.freeze({
      markers: stats.markers,
      commands: stats.commands,
      cleared: stats.cleared,
      updates: stats.updates,
      rejected: stats.rejected,
      visible: stats.visible,
    }),
  });
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): PassengerVisualCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function roles(frame: PassengerVisualFrame | undefined): string {
  return frame === undefined ? 'missing' : frame.markers.map((marker) => marker.role).join(',');
}

function anchorOf(
  map: ReturnType<typeof createRideLifecycleWorld>['dispatcherWorld']['map'],
  zoneId: string,
): string {
  const zone = map.serviceZones.find((entry) => entry.id === zoneId),
    node =
      zone === undefined
        ? undefined
        : map.geometry.nodes.find((entry) => entry.id === zone.anchorNodeId);
  return node === undefined ? 'missing' : `${node.positionM.x},${node.positionM.z}`;
}

function markerAnchor(frame: PassengerVisualFrame, role: PassengerMarker['role']): string {
  const marker = frame.markers.find((entry) => entry.role === role);
  return marker === undefined ? 'missing' : `${marker.x},${marker.z}`;
}

function scenarioOf(
  scenarios: readonly PassengerVisualScenario[],
  name: string,
): PassengerVisualScenario {
  const found = scenarios.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`Missing passenger visual scenario ${name}`);
  return found;
}

export function runPassengerVisualReport(): PassengerVisualReport {
  const world = createRideLifecycleWorld({ requestCount: 2, openTaxis: 2 });
  try {
    const lifecycle = world.lifecycle,
      map = world.dispatcherWorld.map,
      dispatcher = world.dispatcherWorld.dispatcher,
      assignments = world.assignments;
    if (assignments.length < 2) throw new Error('The report requires two real assignments');
    const assignmentA = assignments[0]!,
      assignmentB = assignments[1]!,
      begunA = beginFirstRide(world),
      begunB = lifecycle.begin({
        requestId: assignmentB.requestId,
        eventId: `assigned:${assignmentB.requestId}`,
        tick: 10,
      }),
      rideA = begunA.result.ride,
      rideB = begunB.ride,
      taxiA = rideA.taxiId,
      taxiB = rideB.taxiId,
      freeTaxi = taxiAt(world.dispatcherWorld, 3),
      read = (input: {
        readonly taxiId: string;
        readonly tick: number;
        readonly rideId?: string | null;
        readonly map?: typeof map;
      }) =>
        readPassengerVisualFrame(
          { lifecycle, map: input.map ?? map },
          {
            taxiId: input.taxiId,
            tick: input.tick,
            rideId: input.rideId,
            sessionId: PASSENGER_SESSION,
            worldEpoch: 0,
          },
        );

    const sideRecording = createRecordingPassengerPort(),
      sidePresenter = createPassengerVisualPresenter(sideRecording.port),
      sideBridge = createPassengerRideBridge({
        lifecycle,
        map,
        presenter: sidePresenter,
      }),
      presentationStates: string[] = [];
    let unchanged = true,
      presentations = 0;
    const present = (tick: number): void => {
      const before = JSON.stringify(lifecycle.ride(rideA.rideId)),
        beforeStats = JSON.stringify(lifecycle.stats()),
        beforeClaim = dispatcher.assignmentFor(assignmentA.requestId)?.assignmentId ?? null,
        beforeStatus = dispatcher.taxiStatus(taxiA);
      const frame = sideBridge.present({ taxiId: taxiA, tick, rideId: rideA.rideId });
      presentationStates.push(frame.phase);
      presentations += 1;
      const after = JSON.stringify(lifecycle.ride(rideA.rideId)),
        afterStats = JSON.stringify(lifecycle.stats()),
        afterClaim = dispatcher.assignmentFor(assignmentA.requestId)?.assignmentId ?? null,
        afterStatus = dispatcher.taxiStatus(taxiA);
      if (
        before !== after ||
        beforeStats !== afterStats ||
        beforeClaim !== afterClaim ||
        beforeStatus !== afterStatus
      )
        unchanged = false;
    };

    const waitingA = read({ taxiId: taxiA, tick: 10 });
    present(10);
    lifecycle.apply({
      rideId: rideA.rideId,
      eventId: `pickup-arrived:${assignmentA.requestId}`,
      event: 'ARRIVED_PICKUP',
      tick: 11,
    });
    const boardingA = read({ taxiId: taxiA, tick: 11 });
    present(11);
    lifecycle.apply({
      rideId: rideA.rideId,
      eventId: `pickup-boarded:${assignmentA.requestId}`,
      event: 'PICKUP_COMPLETE',
      tick: 12,
    });
    const onboardA = read({ taxiId: taxiA, tick: 12 });
    present(12);
    lifecycle.apply({
      rideId: rideA.rideId,
      eventId: `dropoff-arrived:${assignmentA.requestId}`,
      event: 'ARRIVED_DROPOFF',
      tick: 13,
    });
    const droppingA = read({ taxiId: taxiA, tick: 13 });
    present(13);
    const rideAtDropoff = lifecycle.ride(rideA.rideId),
      claimAtDropoff = dispatcher.assignmentFor(assignmentA.requestId),
      stillOpenAtDropoff =
        rideAtDropoff?.state === 'DROPOFF' &&
        rideAtDropoff.terminal === false &&
        claimAtDropoff !== undefined &&
        lifecycle.ride(rideA.rideId) !== undefined;

    const dropoffZone = map.serviceZones.find((zone) => zone.id === rideA.dropoffZoneId),
      pickupZone = map.serviceZones.find((zone) => zone.id === rideA.pickupZoneId);
    if (dropoffZone === undefined || pickupZone === undefined)
      throw new Error('The report requires both real service zones');
    const mapWithoutAnchor = {
        ...map,
        geometry: {
          ...map.geometry,
          nodes: map.geometry.nodes.filter((node) => node.id !== dropoffZone.anchorNodeId),
        },
      },
      mapWithoutZone = {
        ...map,
        serviceZones: map.serviceZones.filter((zone) => zone.id !== rideA.dropoffZoneId),
      },
      missingAnchorFrame = read({
        taxiId: taxiA,
        tick: 13,
        rideId: rideA.rideId,
        map: mapWithoutAnchor,
      }),
      missingZoneFrame = read({
        taxiId: taxiA,
        tick: 13,
        rideId: rideA.rideId,
        map: mapWithoutZone,
      });

    lifecycle.apply({
      rideId: rideA.rideId,
      eventId: `dropoff-complete:${assignmentA.requestId}`,
      event: 'DROPOFF_COMPLETE',
      tick: 14,
    });
    const completedA = read({ taxiId: taxiA, tick: 14, rideId: rideA.rideId }),
      waitingB = read({ taxiId: taxiB, tick: 10 }),
      foreignB = read({ taxiId: taxiB, tick: 14, rideId: rideA.rideId }),
      freeTaxiFrame = read({ taxiId: freeTaxi, tick: 14 }),
      reset = lifecycle.reset({ tick: 20 }),
      resetFrame = read({ taxiId: taxiA, tick: 20 });

    const scenarios = [
        runScenario('waiting', [waitingA]),
        runScenario('boarding', [waitingA, boardingA]),
        runScenario('onboard', [boardingA, onboardA]),
        runScenario('dropping off', [onboardA, droppingA]),
        runScenario('completed reset', [droppingA, completedA, resetFrame]),
        runScenario('mixed taxi', [waitingA, waitingB, foreignB, freeTaxiFrame]),
        runScenario('missing anchor', [missingAnchorFrame]),
      ],
      waitingView = scenarioOf(scenarios, 'waiting').frames[0]!,
      boardingView = scenarioOf(scenarios, 'boarding').frames[1]!,
      onboardView = scenarioOf(scenarios, 'onboard').frames[1]!,
      droppingView = scenarioOf(scenarios, 'dropping off').frames[1]!,
      completedView = scenarioOf(scenarios, 'completed reset').frames[1]!,
      completedScenario = scenarioOf(scenarios, 'completed reset'),
      mixedScenario = scenarioOf(scenarios, 'mixed taxi'),
      missingScenario = scenarioOf(scenarios, 'missing anchor'),
      missingView = missingScenario.frames[0]!,
      mixedA = mixedScenario.frames[0]!,
      mixedB = mixedScenario.frames[1]!,
      mixedForeign = mixedScenario.frames[2]!,
      mixedFree = mixedScenario.frames[3]!,
      missingOmission = missingView.omissions[0],
      missingZoneOmission = missingZoneFrame.omissions[0],
      stableIds = scenarios.every((scenario) =>
        scenario.frames.every((frame) =>
          frame.markers.every(
            (marker) =>
              frame.rideId !== null &&
              marker.markerId === passengerMarkerId(frame.rideId, marker.role),
          ),
        ),
      ),
      maxMarkers = Math.max(
        ...scenarios.flatMap((scenario) => scenario.frames.map((frame) => frame.markers.length)),
      ),
      deterministicCommands =
        JSON.stringify(runScenario('waiting', [waitingA]).commands) ===
        JSON.stringify(scenarioOf(scenarios, 'waiting').commands);

    const checks = [
      check(
        'contract-version',
        PASSENGER_VISUAL_VERSION,
        waitingA.version,
        'the frame uses the 147 contract version',
      ),
      check('waiting-phase', 'WAITING_PICKUP', waitingView.phase, 'TO_PICKUP maps to waiting'),
      check('waiting-occupancy', 0, waitingView.occupancy, 'the taxi is still empty'),
      check(
        'waiting-passenger-hidden',
        false,
        waitingView.passengerVisible,
        'no passenger is represented before boarding',
      ),
      check('waiting-marker-roles', 'PICKUP', roles(waitingA), 'only the real pickup marker'),
      check(
        'waiting-real-pickup-anchor',
        anchorOf(map, rideA.pickupZoneId),
        markerAnchor(waitingA, 'PICKUP'),
        'the pickup marker is exactly the real 032 zone anchor',
      ),
      check(
        'waiting-marker-zone',
        rideA.pickupZoneId,
        waitingA.markers[0]?.zoneId ?? 'missing',
        'the marker keeps the real service-zone id',
      ),
      check('boarding-phase', 'BOARDING', boardingView.phase, 'PICKUP maps to boarding'),
      check('boarding-occupancy', 0, boardingView.occupancy, 'the passenger is not onboard yet'),
      check(
        'boarding-passenger-visible',
        true,
        boardingView.passengerVisible,
        'the passenger is visible at the pickup anchor',
      ),
      check(
        'boarding-marker-roles',
        'PICKUP,PASSENGER',
        roles(boardingA),
        'pickup and passenger markers are both present',
      ),
      check(
        'boarding-passenger-at-pickup-anchor',
        markerAnchor(boardingA, 'PICKUP'),
        markerAnchor(boardingA, 'PASSENGER'),
        'the V1 passenger stands at the real pickup anchor, not at an invented position',
      ),
      check('onboard-phase', 'ONBOARD', onboardView.phase, 'TO_DROPOFF maps to onboard'),
      check('onboard-occupancy', 1, onboardView.occupancy, 'exactly one passenger is in the taxi'),
      check('onboard-marker-roles', 'DROPOFF', roles(onboardA), 'only the real dropoff marker'),
      check(
        'onboard-real-dropoff-anchor',
        anchorOf(map, rideA.dropoffZoneId),
        markerAnchor(onboardA, 'DROPOFF'),
        'the dropoff marker is exactly the real 032 zone anchor',
      ),
      check('dropping-phase', 'DROPPING_OFF', droppingView.phase, 'DROPOFF maps to dropping off'),
      check('dropping-occupancy', 1, droppingView.occupancy, 'the passenger is still onboard'),
      check('completed-phase', 'NONE', completedView.phase, 'COMPLETED is terminal, not a phase'),
      check(
        'completed-reset',
        true,
        completedView.reset,
        'a terminal ride requests a visual reset',
      ),
      check('completed-occupancy', 0, completedView.occupancy, 'occupancy drops to zero'),
      check(
        'completed-clear-command',
        true,
        completedScenario.commands.some((command) => command.op === 'clear'),
        'the presenter clears the previous dropoff marker',
      ),
      check(
        'completed-accessible-explicit',
        true,
        completedView.accessibleText.includes('COMPLETED'),
        'the terminal state is named in the accessible text',
      ),
      check(
        'reset-after-lifecycle-reset',
        true,
        resetFrame.phase === 'NONE' && resetFrame.rideId === null && resetFrame.reset,
        'a real 061 scenario reset leaves no ride and no marker',
      ),
      check(
        'mixed-taxi-own-ride',
        true,
        mixedA.rideId === rideA.rideId && mixedB.rideId === rideB.rideId,
        'each taxi reads its own claimed 061 ride',
      ),
      check(
        'mixed-taxi-isolated-markers',
        true,
        mixedA.markers.every((marker) => marker.markerId.includes(rideA.rideId)) &&
          mixedB.markers.every((marker) => marker.markerId.includes(rideB.rideId)) &&
          mixedA.markers[0]?.markerId !== mixedB.markers[0]?.markerId,
        'marker identity is rideId + role, so two waiting taxis never share a marker',
      ),
      check(
        'mixed-foreign-not-drawn',
        true,
        mixedForeign.phase === 'NONE' &&
          mixedForeign.markers.length === 0 &&
          mixedForeign.accessibleText.includes('altui taxi'),
        'an explicitly bound foreign ride is not drawn for the selected taxi',
      ),
      check(
        'mixed-free-taxi-none',
        true,
        mixedFree.phase === 'NONE' && mixedFree.reset && mixedFree.markers.length === 0,
        'a taxi without a ride has no passenger and no marker',
      ),
      check(
        'missing-anchor-omitted',
        'DROPOFF:ANCHOR_MISSING',
        missingOmission === undefined
          ? 'missing'
          : `${missingOmission.role}:${missingOmission.reason}`,
        'a missing 032 anchor omits the marker with an explicit reason',
      ),
      check(
        'missing-anchor-no-fake-point',
        0,
        missingView.markers.length,
        'the omitted marker does not receive a synthetic coordinate',
      ),
      check(
        'missing-anchor-accessible',
        true,
        missingView.accessibleText.includes('ancora zonei lipsește'),
        'the omission reason is explicit in the accessible text',
      ),
      check(
        'missing-zone-reason',
        'DROPOFF:ZONE_MISSING',
        missingZoneOmission === undefined
          ? 'missing'
          : `${missingZoneOmission.role}:${missingZoneOmission.reason}`,
        'a removed service zone is reported as a missing zone, not as an anchor',
      ),
      check(
        'no-side-effects-unchanged',
        true,
        unchanged,
        `${presentations} presentations leave the ride record, stats, claim and taxi status identical`,
      ),
      check(
        'no-side-effects-phases',
        'WAITING_PICKUP,BOARDING,ONBOARD,DROPPING_OFF',
        presentationStates.join(','),
        'the presentation follows the real ride instead of driving it',
      ),
      check(
        'no-terminal-side-effect',
        true,
        stillOpenAtDropoff,
        'presenting the dropping-off frame does not complete or release the ride',
      ),
      check(
        'no-pedestrian-evidence',
        true,
        sideBridge.stats().pedestrianActors === 0 &&
          sideBridge.stats().opportunityEvents === 0 &&
          sideBridge.stats().telemetryEvents === 0 &&
          PASSENGER_VISUAL_LIMITS.pedestrianActors === 0,
        'V1 creates no pedestrian, opportunity or telemetry evidence',
      ),
      check(
        'stable-marker-identity',
        true,
        stableIds,
        'every marker id is exactly passengerMarkerId(rideId, role)',
      ),
      check(
        'deterministic-commands',
        true,
        deterministicCommands,
        'the same frame sequence produces byte-identical commands',
      ),
      check(
        'marker-ceiling',
        true,
        maxMarkers <= PASSENGER_VISUAL_LIMITS.markers,
        `no frame exceeds ${PASSENGER_VISUAL_LIMITS.markers} markers`,
      ),
      check(
        'lifecycle-reset-reports',
        true,
        reset.discardedActive === 1 && reset.clearedRides === 2,
        'the scenario reset discarded the remaining open ride exactly once',
      ),
    ];
    const passed = checks.filter((entry) => entry.pass).length;
    sideBridge.dispose();
    return Object.freeze({
      version: PASSENGER_VISUAL_VERSION,
      contract: Object.freeze({
        limits: Object.freeze({
          markers: PASSENGER_VISUAL_LIMITS.markers,
          omissions: PASSENGER_VISUAL_LIMITS.omissions,
          commandsPerFrame: PASSENGER_VISUAL_LIMITS.commandsPerFrame,
          pedestrianActors: PASSENGER_VISUAL_LIMITS.pedestrianActors,
        }),
        phases: Object.freeze(STATE_PHASES),
        passenger:
          'V1 passenger representation is a marker/occupancy read model only; pedestrians belong to V2.',
      }),
      scenarios: Object.freeze(scenarios),
      checks: Object.freeze(checks),
      summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
    });
  } finally {
    disposeRideLifecycleWorld(world);
  }
}

function frameTable(frame: PassengerVisualFrameView): string {
  return [
    `| Tick | ${frame.tick} |`,
    `| Taxi | ${frame.taxiId} |`,
    `| Ride | ${frame.rideId ?? '—'} |`,
    `| Phase | ${frame.phase} |`,
    `| Occupancy | ${frame.occupancy} |`,
    `| Passenger visible | ${frame.passengerVisible} |`,
    `| Reset | ${frame.reset} |`,
    `| Markers | ${
      frame.markers
        .map((marker) => `${marker.role}(${marker.zoneId}) @ ${marker.x},${marker.z}`)
        .join('; ') || '—'
    } |`,
    `| Omissions | ${
      frame.omissions.map((omission) => `${omission.role}:${omission.reason}`).join('; ') || '—'
    } |`,
  ].join('\n');
}

export function passengerVisualReportMarkdown(report: PassengerVisualReport): string {
  const scenarioSections = report.scenarios
      .map(
        (scenario) => `### ${scenario.name}

${scenario.frames
  .map(
    (frame, index) => `#### Frame ${index + 1}

| Value | Result |
| --- | --- |
${frameTable(frame)}

${frame.accessibleText}
`,
  )
  .join('\n')}
Commands: ${scenario.commands.length === 0 ? '—' : scenario.commands.map((command) => command.op).join(', ')}.
Presenter stats: markers ${scenario.stats.markers}, commands ${scenario.stats.commands},
clears ${scenario.stats.cleared}, updates ${scenario.stats.updates}, rejected ${scenario.stats.rejected}.
`,
      )
      .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
      )
      .join('\n');
  return `# 147 passenger visual report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run passenger:visual\`; it
contains no wall-clock value, random value or browser-only state.

Version: \`${report.version}\`. The report reads the real 032 map, the real 060 claims and the real 061
ride states, then drives the real \`createPassengerVisualPresenter\` and records its commands.

## Contract

Phase mapping: ${report.contract.phases
    .map((entry) => `${entry.state} → ${entry.phase} (occupancy ${entry.occupancy})`)
    .join(', ')}.

Limits: ${Object.entries(report.contract.limits)
    .map(([key, value]) => `${key} ${value}`)
    .join(', ')}.

${report.contract.passenger}

${scenarioSections}
## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Scenarios: ${report.scenarios.length}
- Checks: ${report.summary.passed}/${report.summary.checks}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}
