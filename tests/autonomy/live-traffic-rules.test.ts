import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createLivePriorityPolicy,
  createLiveTrafficRules,
} from '../../src/autonomy/live-traffic-rules';
import type {
  LiveTrafficActorView,
  LiveTrafficExternalView,
} from '../../src/autonomy/live-traffic-rules';
import { createCityStyleProfile } from '../../src/app/ambient-traffic';
import { createLaneGraph, createNeighbourhoodMap } from '../../src/world';
import type { RoadMap } from '../../src/world';
import { minimalMap } from '../world/fixture';

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'session-283',
  worldEpoch: 1,
});
const PROFILE = createCityStyleProfile('profile-283', 'profile-283@1');

function signalMap(redFirst: boolean): RoadMap {
  const map = minimalMap();
  return Object.freeze({
    ...map,
    signals: Object.freeze([
      Object.freeze({
        ...map.signals[0]!,
        phases: Object.freeze(
          redFirst
            ? [
                Object.freeze({
                  id: 'red',
                  durationS: 60,
                  movementStates: Object.freeze([
                    Object.freeze({ movementId: 'move', state: 'RED' as const }),
                  ]),
                }),
                Object.freeze({
                  id: 'green',
                  durationS: 60,
                  movementStates: Object.freeze([
                    Object.freeze({ movementId: 'move', state: 'GREEN' as const }),
                  ]),
                }),
              ]
            : map.signals[0]!.phases,
        ),
      }),
    ]),
  });
}

function stopMap(): RoadMap {
  const map = minimalMap();
  return Object.freeze({
    ...map,
    signals: Object.freeze([]),
    stopLines: Object.freeze(
      map.stopLines.map((line, index) =>
        index === 0 ? Object.freeze({ ...line, kind: 'STOP' as const, signalId: null }) : line,
      ),
    ),
  });
}

function actor(overrides: Partial<LiveTrafficActorView> = {}): LiveTrafficActorView {
  return Object.freeze({
    vehicleId: 'vehicle-283',
    incarnation: 1,
    access: 'CIVIL',
    authority: 'AUTO',
    laneId: 'lane-a',
    laneProgressM: 5,
    routeLaneIds: Object.freeze(['lane-a', 'lane-b']),
    positionM: Object.freeze({ x: 5, y: 0, z: 0 }),
    headingRad: 0,
    speedMps: 0,
    profile: PROFILE,
    seed: 283,
    leader: null,
    routeStatus: 'READY',
    destinationLaneId: 'lane-b',
    ...overrides,
  });
}

function external(x: number): LiveTrafficExternalView {
  return Object.freeze({
    vehicleId: 'player-taxi',
    driverKind: 'TAXI',
    positionM: Object.freeze({ x, y: 0, z: 0 }),
    headingRad: 0,
    speedMps: 8,
  });
}

test('283 advances the one 036 controller and stops the AI at its own red movement', () => {
  const map = signalMap(true),
    graph = createLaneGraph(map),
    rules = createLiveTrafficRules({ map, graph, context: CONTEXT });
  try {
    const first = rules.step({
        tick: 1,
        actors: [actor({ laneProgressM: 6, positionM: { x: 6, y: 0, z: 0 } })],
      }),
      command = first.commands.get('vehicle-283')!;
    assert.equal(first.signals.length, 1);
    assert.equal(first.signals[0]!.state, 'RED');
    assert.equal(command.hold, true);
    assert.equal(command.holdKind, 'SIGNAL');
    assert.equal(command.signalState, 'RED');
    assert.equal(command.reason, 'RED_APPROACH');
    assert.equal(command.targetMps, 0);
    assert.equal(command.maxAdvanceM, 0);
    assert.equal(rules.report().signals.programs, 1);
    assert.equal(rules.report().signals.movements, 1);
  } finally {
    rules.dispose();
  }
});

test('283 player red crossing is a real 036 violation only with a previous observation', () => {
  const map = signalMap(true),
    graph = createLaneGraph(map),
    rules = createLiveTrafficRules({ map, graph, context: CONTEXT });
  try {
    const first = rules.step({ tick: 1, actors: [], externalVehicles: [external(6)] });
    assert.equal(first.violations.length, 0);
    const second = rules.step({ tick: 2, actors: [], externalVehicles: [external(7)] });
    assert.equal(second.violations.length, 1);
    const violation = second.violations[0]!;
    assert.equal(violation.kind, 'RED_LIGHT');
    assert.equal(violation.reason, 'CROSSED_RED_SIGNAL');
    assert.equal(violation.evidence, '036-SIGNAL-CROSSING');
    assert.equal(violation.signalId, 'signal');
    assert.equal(violation.movementId, 'move');
    assert.equal(violation.tick, 2);
    assert.ok(violation.frontDistanceBeforeM > 0);
    assert.ok(violation.frontDistanceAfterM <= 0);
    // The same observation at the same tick is not a second event.
    assert.deepEqual(
      rules.violations().map((event) => event.eventId),
      [violation.eventId],
    );
  } finally {
    rules.dispose();
  }
});

test('283 green crossing and a first red observation fabricate no violation', () => {
  const green = signalMap(false),
    greenGraph = createLaneGraph(green),
    greenRules = createLiveTrafficRules({ map: green, graph: greenGraph, context: CONTEXT });
  try {
    greenRules.step({ tick: 1, actors: [], externalVehicles: [external(6)] });
    assert.equal(
      greenRules.step({ tick: 2, actors: [], externalVehicles: [external(7)] }).violations.length,
      0,
    );
  } finally {
    greenRules.dispose();
  }
  const red = signalMap(true),
    redRules = createLiveTrafficRules({
      map: red,
      graph: createLaneGraph(red),
      context: CONTEXT,
    });
  try {
    assert.equal(
      redRules.step({ tick: 1, actors: [], externalVehicles: [external(7)] }).violations.length,
      0,
    );
  } finally {
    redRules.dispose();
  }
});

test('283 STOP full stop, dwell release and line crossing stay separate from a traffic-caused hold', () => {
  const map = stopMap(),
    graph = createLaneGraph(map),
    rules = createLiveTrafficRules({ map, graph, context: CONTEXT });
  try {
    const view = actor({ laneProgressM: 6, positionM: { x: 6, y: 0, z: 0 } });
    let command = rules.step({ tick: 1, actors: [view] }).commands.get('vehicle-283')!;
    assert.equal(command.hold, true);
    assert.equal(command.holdKind, 'STOP');
    for (let tick = 2; tick <= 120; tick += 1)
      command = rules.step({ tick, actors: [view] }).commands.get('vehicle-283')!;
    const report = rules.report();
    assert.ok(report.stop.fullStops >= 1);
    assert.equal(report.stop.trafficCausedStops, 0);
    assert.equal(report.violations.total, 0);
    // A real crossing by the AUTO actor is counted, never a player violation.
    const crossed = rules.step({
      tick: 121,
      actors: [actor({ laneProgressM: 9, positionM: { x: 9, y: 0, z: 0 }, speedMps: 2 })],
    });
    assert.ok(crossed.violations.length === 0);
    assert.ok(rules.report().stop.lineCrossings >= 1);
  } finally {
    rules.dispose();
  }
});

test('283 rolling profile distinguishes ROLL_THROUGH from a full stop', () => {
  const map = stopMap(),
    graph = createLaneGraph(map),
    rollingProfile = createCityStyleProfile('profile-283-rolling', 'profile-283-rolling@1');
  // A cloned profile with stop_full_probability=0 is an explicit fixture profile, not a hidden
  // personality; the 051 sample reads exactly this value.
  const parameters = { ...rollingProfile.parameters, stop_full_probability: 0 },
    rolling = Object.freeze({
      ...rollingProfile,
      parameters: Object.freeze(parameters),
    });
  const rules = createLiveTrafficRules({ map, graph, context: CONTEXT });
  try {
    const view = actor({ profile: rolling, laneProgressM: 6, positionM: { x: 6, y: 0, z: 0 } });
    let command = rules.step({ tick: 1, actors: [view] }).commands.get('vehicle-283')!;
    assert.equal(command.hold, false);
    for (let tick = 2; tick <= 8; tick += 1)
      command = rules.step({ tick, actors: [view] }).commands.get('vehicle-283')!;
    assert.equal(command.hold, false);
    assert.ok(rules.report().stop.rollingStops >= 1);
  } finally {
    rules.dispose();
  }
});

test('283 priority sidecar resolves every stop-controlled pair with one authored winner', () => {
  const map = createNeighbourhoodMap(),
    policy = createLivePriorityPolicy(map),
    stopJunctions = new Set(
      map.stopLines
        .filter((line) => line.kind === 'STOP' && line.intersectionId !== null)
        .map((line) => line.intersectionId!),
    ),
    signalJunctions = new Set(map.signals.map((program) => program.intersectionId));
  assert.ok(stopJunctions.size > 0);
  for (const rule of policy.rules)
    if (stopJunctions.has(rule.intersectionId))
      assert.ok(
        rule.priorityMovementId !== null && rule.movementIds.includes(rule.priorityMovementId),
        `stop-controlled pair ${rule.movementIds.join('/')} has no explicit winner`,
      );
    else if (signalJunctions.has(rule.intersectionId)) assert.equal(rule.priorityMovementId, null);
});

test('283 lane change requires an observed clear target lane, advantage and cooldown', () => {
  const map = createNeighbourhoodMap(),
    graph = createLaneGraph(map),
    rules = createLiveTrafficRules({ map, graph, context: CONTEXT });
  try {
    const lane = map.lanes.find(
      (candidate) =>
        candidate.access.includes('CIVIL') &&
        (graph.getNeighbors(candidate.id, 'CIVIL').left !== null ||
          graph.getNeighbors(candidate.id, 'CIVIL').right !== null),
    )!;
    const lanePath = graph.getDirectedPath(lane.id)!,
      view = actor({
        laneId: lane.id,
        laneProgressM: 10,
        routeLaneIds: Object.freeze([lane.id]),
        positionM: lanePath.points[0]!,
        speedMps: 2,
        leader: Object.freeze({ id: 'slow-leader', gapM: 10, speedMps: 0.5 }),
      });
    const frame = rules.step({ tick: 1, actors: [view] }),
      command = frame.commands.get(view.vehicleId)!;
    assert.equal(rules.report().laneChange.validated, 1);
    assert.ok(command.laneChangeTargetLaneId !== null);
    assert.notEqual(command.laneChangeTargetLaneId, lane.id);
  } finally {
    rules.dispose();
  }
});

test('283 an unexplained stationary actor produces an explicit 054 recovery request', () => {
  const map = minimalMap(),
    graph = createLaneGraph(map),
    rules = createLiveTrafficRules({ map, graph, context: CONTEXT });
  try {
    const view = actor({
      routeLaneIds: Object.freeze(['lane-a']),
      destinationLaneId: 'lane-a',
    });
    let command = rules.step({ tick: 1, actors: [view] }).commands.get('vehicle-283')!;
    for (let tick = 2; tick <= 420; tick += 1)
      command = rules.step({ tick, actors: [view] }).commands.get('vehicle-283')!;
    const report = rules.report();
    assert.ok(report.blocked.episodes >= 1);
    assert.ok(report.blocked.rerouteRequests >= 1);
    assert.equal(command.holdKind, 'BLOCKED');
    assert.equal(command.targetMps, 0);
  } finally {
    rules.dispose();
  }
});
