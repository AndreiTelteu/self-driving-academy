import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCompositionWorld } from '../../src/app/composition-world';
import {
  createLivePedestrianHazards,
  planLiveHazardObstacles,
  type LivePedestrianHazards,
} from '../../src/app/live-pedestrian-hazards';
import { createV3Composition } from '../../src/app';
import { evaluateV2ContextScenario, readV2FrameFacets } from '../../src/telemetry';
import { createDefaultSettings } from '../../src/settings';
import { createLiveVehiclePhysics, type LiveVehicleCommand } from '../../src/vehicles';
import type { LiveVehiclePhysics } from '../../src/vehicles';
import { HAZARD_LANE_ID, hazardLane, hazardObstacle, lanePose } from '../world/hazards-fixture';
import { lanePose as pedestrianLanePose, pedestrianTarget } from '../world/pedestrians-fixture';

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '286-live-pedestrians-tests',
  worldEpoch: 1,
});

interface YieldFixture {
  readonly live: LivePedestrianHazards;
  readonly physics: LiveVehiclePhysics;
  readonly laneId: string;
  readonly step: (tick: number) => void;
  readonly lastSpeed: () => number;
}

async function yieldFixture(observable: boolean): Promise<YieldFixture> {
  const world = createCompositionWorld();
  const physics = await createLiveVehiclePhysics({ context: CONTEXT, initialTick: 0 });
  const live = createLivePedestrianHazards({
    context: CONTEXT,
    map: world.map,
    graph: world.graph,
    seed: 286,
    physics,
    maxPedestrians: 96,
    observableVehicle: () => observable,
  });
  const target = pedestrianTarget(live.getLinks());
  const pose = pedestrianLanePose(target.graph, target.laneId, target.longitudinalM - 35);
  physics.registerVehicle({
    vehicleId: 'yield-car',
    classId: 'sedan',
    positionM: pose.positionM,
    yawRad: Math.PI / 2 - pose.headingRad,
    speedMps: 5,
    access: 'CIVIL',
    isTraffic: false,
  });
  let last = physics.readVehicle('yield-car');
  assert(last !== null);
  let speed = 5;
  const step = (tick: number): void => {
    const base: LiveVehicleCommand = {
      vehicleId: 'yield-car',
      source: 'AUTONOMY',
      throttle: speed > 6.5 ? 0 : 0.35,
      brake: 0,
      steering: 0,
      handbrake: false,
      turnSignal: 'OFF',
    };
    const command =
      last === null
        ? base
        : live.adjustCommand('yield-car', base, {
            tick,
            speedMps: Math.abs(last.speedMps),
            positionM: last.positionM,
            yawRad: last.yawRad,
          });
    const frame = physics.step({ tick, commands: [command], traffic: [], measure: true });
    last = physics.readVehicle('yield-car');
    assert(last !== null);
    speed = Math.abs(last.speedMps);
    live.observe({
      tick,
      vehicles: [
        {
          vehicleId: 'yield-car',
          driverKind: 'CIVILIAN',
          classId: 'sedan',
          controlMode: 'AUTO',
          positionM: last.positionM,
          yawRad: last.yawRad,
          speedMps: speed,
          speedLimitMps: 8,
          laneId: target.laneId,
          blocked: false,
          maneuverState: 'IDLE',
        },
      ],
      commands: [command],
      incidents: frame.collisions.incidents > 0 ? physics.readIncidents() : [],
      vehiclesComplete: true,
    });
  };
  return {
    live,
    physics,
    laneId: target.laneId,
    step,
    lastSpeed: () => speed,
  };
}

test('pedestrians appear on real crosswalks and cross with an observable phase', () => {
  const world = createCompositionWorld();
  const live = createLivePedestrianHazards({
    context: CONTEXT,
    map: world.map,
    graph: world.graph,
    seed: 286,
    maxPedestrians: 96,
  });
  try {
    const network = live.getNetwork();
    assert.equal(network.crosswalks, 80);
    assert(network.links > 0);
    assert.equal(network.pedestriansCreated, 96);
    assert(network.crossingLengthM !== null);
    assert(network.crossingLengthM!.min > 0.5);
    const states = new Set<string>();
    let progressBefore: number | null = null;
    let progressAfter: number | null = null;
    let phasePosition: { x: number; z: number } | null = null;
    for (let tick = 1; tick <= 900; tick += 1) {
      live.observe({
        tick,
        vehicles: [],
        commands: [],
        incidents: [],
        vehiclesComplete: true,
      });
      for (const pedestrian of live.getPedestrians()) states.add(pedestrian.state);
      const crossing = live.getPedestrians().find((pedestrian) => pedestrian.state === 'CROSSING');
      if (crossing !== undefined) {
        if (progressBefore === null) {
          progressBefore = crossing.crossingProgress;
          phasePosition = { x: crossing.positionM.x, z: crossing.positionM.z };
        } else progressAfter = crossing.crossingProgress;
      }
    }
    assert.deepEqual(
      [...states].sort(),
      ['CROSSED', 'CROSSING', 'ON_SIDEWALK', 'WAITING', 'WITHDRAWN'].sort(),
    );
    assert(progressBefore !== null && progressAfter !== null);
    assert(progressAfter! > progressBefore!);
    assert(phasePosition !== null);
    const counts = live.getPedestrianInspection().counts;
    assert(counts.crossingsStarted > 0);
    assert(counts.crossingsCompleted > 0);
    assert.equal(counts.collisions, 0);
    assert(
      live
        .getPedestrians()
        .every(
          (pedestrian) =>
            pedestrian.learningEligible === null &&
            pedestrian.crosswalkId.length > 0 &&
            pedestrian.positionM.y >= 0,
        ),
    );
    assert.equal(live.getConflicts().length, 0);
  } finally {
    live.dispose();
  }
});

test('a yielding vehicle is proven by the real tick order of a physical stop', async () => {
  const fixture = await yieldFixture(true);
  try {
    for (let tick = 1; tick <= 900; tick += 1) fixture.step(tick);
    const conflicts = fixture.live
      .getConflicts()
      .filter((conflict) => conflict.crosswalkId === fixture.live.getLinks()[0]?.crosswalkId);
    const targetConflicts = fixture.live.getConflicts();
    const stops = fixture.live.getStops();
    const crossingStops = stops.filter((stop) => stop.duringCrossing);
    assert(targetConflicts.length >= 1, 'the physical car must meet a pedestrian conflict');
    assert(crossingStops.length >= 1, 'the physical stop must happen during the crossing');
    const stop = crossingStops[0]!;
    const conflict = targetConflicts.find((entry) => entry.stopTick === stop.tick);
    assert(conflict !== undefined, 'the stop must be attributed to the conflict episode');
    assert.equal(conflict!.outcome, 'YIELDED');
    assert(conflict!.tick < stop.tick, 'the crossing began before the physical stop');
    assert(stop.speedMps <= 0.2);
    assert(conflict!.stopDistanceM !== null && conflict!.stopDistanceM! > 0);
    assert(conflict!.minimumDistanceM <= conflict!.stopDistanceM! + 1e-6);
    const rate = fixture.live.getPedestrianInspection().denominators.yieldRate;
    assert.equal(rate.status, 'OBSERVED');
    assert(rate.value !== null && rate.value > 0);
    assert(fixture.lastSpeed() >= 0);
    assert(fixture.live.getPedestrianInspection().counts.yieldStopEvents >= 1);
    assert.equal(fixture.live.getPedestrianInspection().counts.collisions, 0);
    assert(conflicts.every((entry) => entry.outcome !== 'CROSSED_WITHOUT_YIELD'));
  } finally {
    fixture.live.dispose();
    fixture.physics.dispose();
  }
});

test('an unobserved pedestrian produces no yield evidence', async () => {
  const fixture = await yieldFixture(false);
  try {
    for (let tick = 1; tick <= 900; tick += 1) fixture.step(tick);
    const inspection = fixture.live.getPedestrianInspection();
    assert.equal(inspection.counts.stopEvents, 0);
    assert.equal(inspection.counts.yieldStopEvents, 0);
    assert.equal(inspection.counts.yieldedCrossings, 0);
    assert.equal(inspection.counts.crossingsWithoutYield, 0);
    assert(inspection.counts.unobservedCrossings > 0);
    assert.equal(fixture.live.getConflicts().length, 0);
    assert.equal(inspection.denominators.yieldRate.status, 'MISSING');
    assert.equal(inspection.denominators.yieldRate.value, null);
    assert(
      inspection.gaps.some((gap) => gap.id === 'INCOMPLETE_VEHICLE_COVERAGE'),
      'the incomplete enumeration must be reported as a gap',
    );
  } finally {
    fixture.live.dispose();
    fixture.physics.dispose();
  }
});

test('a hazard obstacle reacts and is avoided by the same 282 Rapier solver', async () => {
  const world = createCompositionWorld();
  const lane = hazardLane();
  const start = 60;
  const pose = lanePose(lane.graph, HAZARD_LANE_ID, start);
  const physics = await createLiveVehiclePhysics({ context: CONTEXT, initialTick: 0 });
  const live = createLivePedestrianHazards({
    context: CONTEXT,
    map: world.map,
    graph: world.graph,
    seed: 286,
    physics,
    maxPedestrians: 4,
    obstacles: [hazardObstacle({ distanceM: 100, type: 'BARRIER' })],
  });
  physics.registerVehicle({
    vehicleId: 'obstacle-car',
    classId: 'sedan',
    positionM: pose.positionM,
    yawRad: Math.PI / 2 - pose.headingRad,
    speedMps: 6,
    access: 'CIVIL',
    isTraffic: false,
  });
  let last = physics.readVehicle('obstacle-car');
  assert(last !== null);
  let minimumDistance = Infinity;
  try {
    for (let tick = 1; tick <= 400; tick += 1) {
      const base: LiveVehicleCommand = {
        vehicleId: 'obstacle-car',
        source: 'AUTONOMY',
        throttle: Math.abs(last!.speedMps) > 5.5 ? 0 : 0.3,
        brake: 0,
        steering: 0,
        handbrake: false,
        turnSignal: 'OFF',
      };
      const command = live.adjustCommand('obstacle-car', base, {
        tick,
        speedMps: Math.abs(last!.speedMps),
        positionM: last!.positionM,
        yawRad: last!.yawRad,
      });
      const frame = physics.step({ tick, commands: [command], traffic: [], measure: true });
      last = physics.readVehicle('obstacle-car');
      assert(last !== null);
      const obstacle = live.getHazardObstacles()[0]!;
      minimumDistance = Math.min(
        minimumDistance,
        Math.hypot(
          last.positionM.x - obstacle.positionM.x,
          last.positionM.z - obstacle.positionM.z,
        ),
      );
      live.observe({
        tick,
        vehicles: [
          {
            vehicleId: 'obstacle-car',
            driverKind: 'CIVILIAN',
            classId: 'sedan',
            controlMode: 'AUTO',
            positionM: last.positionM,
            yawRad: last.yawRad,
            speedMps: Math.abs(last.speedMps),
            speedLimitMps: 8,
            laneId: HAZARD_LANE_ID,
            blocked: false,
            maneuverState: 'IDLE',
          },
        ],
        commands: [command],
        incidents: frame.collisions.incidents > 0 ? physics.readIncidents() : [],
        vehiclesComplete: true,
      });
    }
    const physicsStats = physics.getStats();
    assert.equal(physicsStats.obstacles.added, 1, 'the obstacle is a box of the one 282 world');
    assert.equal(live.getStats().physicalHazards, 1);
    assert.equal(physicsStats.obstacles.active, 1);
    const encounters = live.getHazardEncounters();
    assert.equal(encounters.length, 1);
    assert(
      encounters[0]!.outcome === 'PASSED_CLEAR' || encounters[0]!.outcome === 'STOPPED',
      encounters[0]!.outcome,
    );
    assert.equal(encounters[0]!.contactTick, null);
    assert.equal(physics.readIncidents().length, 0);
    const reactions = live.getHazardReactions();
    assert(reactions.length >= 1, 'a real command front is required');
    assert(reactions[0]!.latencyTicks >= 1);
    assert(minimumDistance > 1.5, `minimum distance ${minimumDistance}`);
    assert.equal(encounters[0]!.contactTick, null);
    assert.equal(live.getPedestrianInspection().counts.collisions, 0);
    const plan = planLiveHazardObstacles(world.graph, {
      laneIds: world.map.lanes.map((entry) => entry.id),
      count: 96,
      distanceM: 45,
    });
    assert.equal(plan.length, 96);
  } finally {
    live.dispose();
    physics.dispose();
  }
});

test('the composition applies the live hazard command before its one physical step', async () => {
  const world = createCompositionWorld();
  const physics = await createLiveVehiclePhysics({ context: CONTEXT, initialTick: 0 });
  const observed: number[] = [];
  const adjusted: string[] = [];
  const port = {
    version: '286-test-port',
    prepare() {},
    adjustCommand(vehicleId: string, command: LiveVehicleCommand, context: { tick: number }) {
      adjusted.push(`${context.tick}:${vehicleId}`);
      return Object.freeze({ ...command, throttle: 0, brake: 1 });
    },
    observe(input: { tick: number; vehicles: readonly { vehicleId: string }[] }) {
      observed.push(input.tick);
      assert(input.vehicles.some((vehicle) => vehicle.vehicleId === 'taxi-01'));
    },
  };
  const composition = createV3Composition({
    layout: world.layout,
    start: world.spawn,
    control: createDefaultSettings('286-live-composition').input.control,
    context: CONTEXT,
    vehicles: world.vehicles,
    map: world.map,
    graph: world.graph,
    physics,
    livePedestrians: port,
  });
  try {
    composition.requestEntry('taxi-01');
    composition.step({ tick: 1 });
    composition.port.setAction('throttle', true);
    for (let tick = 2; tick <= 90; tick += 1) composition.step({ tick });
    const taxi = composition.frame.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01')!;
    assert(adjusted.length > 0, 'the composition must ask the live owner for the command');
    assert(adjusted.some((entry) => entry.endsWith(':taxi-01')));
    assert.equal(observed.length, 90);
    assert.equal(observed[89], 90);
    assert(Math.abs(taxi.speedMps) < 4, `hazard brake did not reach physics: ${taxi.speedMps}`);
    assert.equal(physics.getStats().vehicles, 2);
  } finally {
    composition.dispose();
    physics.dispose();
  }
});

test('the live facts feed the V2 hazard contexts used by estimators and challenges', async () => {
  const fixture = await yieldFixture(true);
  try {
    for (let tick = 1; tick <= 900; tick += 1) fixture.step(tick);
    const scenario = fixture.live.getV2Scenario();
    assert(scenario !== null);
    assert.equal(scenario!.category, 'HAZARDS');
    assert(scenario!.frames.length > 0);
    const evaluation = evaluateV2ContextScenario(scenario!);
    const yieldKey = evaluation.keys.find((key) => key.key === 'pedestrian_yield_probability');
    assert(yieldKey !== undefined);
    assert.equal(yieldKey!.observable, true);
    assert.deepEqual(yieldKey!.missingFacets, []);
    const reactionKey = evaluation.keys.find((key) => key.key === 'hazard_reaction_delay');
    assert(reactionKey !== undefined);
    assert.equal(reactionKey!.observable, true);
    assert(
      scenario!.frames.some((frame) => {
        const facets = readV2FrameFacets(frame);
        return facets.has('PEDESTRIAN') && facets.has('BRAKE_INPUT');
      }),
    );
    assert(fixture.live.getV2Frames().length > 0);
    assert(fixture.live.getV2Frame() !== null);
    assert(fixture.live.getV2Frame()!.tick === fixture.live.getStats().tick);
  } finally {
    fixture.live.dispose();
    fixture.physics.dispose();
  }
});
