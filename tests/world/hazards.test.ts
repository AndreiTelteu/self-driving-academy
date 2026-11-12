import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHazards,
  HAZARD_HORN_CHANNEL,
  HAZARD_LIMITS,
  HAZARD_PEDESTRIAN_STATES,
  HAZARD_VERSION,
  type HazardPedestrianFact,
  type HazardVehicleFact,
  type Hazards,
} from '../../src/world';
import {
  createHazardWorld,
  HAZARD_OBSTACLE_M,
  hazardLane,
  hazardMap,
  hazardObstacle,
  hazardSession,
  lanePose,
  pedestrianInPath,
  vehicleBeforeObstacle,
} from './hazards-fixture';

const DT = 1 / 60;

function stepVehicle(
  world: Hazards,
  tick: number,
  vehicle: HazardVehicleFact,
  options: {
    readonly pedestrians?: readonly HazardPedestrianFact[];
    readonly vehiclesComplete?: boolean;
    readonly contacts?: readonly {
      readonly vehicleId: string;
      readonly hazardId: string;
      readonly tick: number;
      readonly impulseNs: number;
    }[];
  } = {},
) {
  return world.step({
    tick,
    vehicles: [vehicle],
    vehiclesComplete: options.vehiclesComplete ?? true,
    ...(options.pedestrians === undefined ? {} : { pedestrians: options.pedestrians }),
    ...(options.contacts === undefined ? {} : { contacts: options.contacts }),
  });
}

/** Kinematic approach: the fixture drives, the module observes. */
function approach(
  world: Hazards,
  config: {
    readonly startDistanceM: number;
    readonly speedMps: number;
    readonly ticks: number;
    readonly brakeAt?: number | null;
    readonly steeringAt?: number | null;
    readonly lateralMps?: number;
    readonly pedestrians?: readonly HazardPedestrianFact[];
    readonly vehiclesComplete?: boolean;
    readonly contactOnPass?: boolean;
  },
) {
  const lane = hazardLane(),
    headingRad = lane.headingRad,
    forwardX = Math.cos(headingRad),
    forwardZ = Math.sin(headingRad),
    rightX = -forwardZ,
    rightZ = forwardX;
  let distanceM = config.startDistanceM,
    lateralM = 0,
    speedMps = config.speedMps,
    onsetTick: number | null = null,
    contacts: {
      readonly vehicleId: string;
      readonly hazardId: string;
      readonly tick: number;
      readonly impulseNs: number;
    }[] = [];
  for (let tick = 0; tick < config.ticks; tick += 1) {
    const elapsed = onsetTick === null ? null : tick - onsetTick,
      brake =
        elapsed !== null &&
        config.brakeAt !== null &&
        config.brakeAt !== undefined &&
        elapsed >= config.brakeAt
          ? 0.8
          : 0,
      steering =
        elapsed !== null &&
        config.steeringAt !== null &&
        config.steeringAt !== undefined &&
        elapsed >= config.steeringAt
          ? 0.5
          : 0;
    const vehicle = vehicleBeforeObstacle(distanceM, speedMps, {
      brake,
      steering,
      positionM: Object.freeze({
        x: lane.obstaclePositionM.x - forwardX * distanceM + rightX * lateralM,
        y: 0.8,
        z: lane.obstaclePositionM.z - forwardZ * distanceM + rightZ * lateralM,
      }),
    });
    const contact =
      config.contactOnPass === true && distanceM <= 0 && contacts.length === 0
        ? [{ vehicleId: 'vehicle-1', hazardId: 'obstacle-1', tick, impulseNs: 900 }]
        : [];
    contacts = [...contacts, ...contact];
    const step = stepVehicle(world, tick, vehicle, {
      ...(config.pedestrians === undefined ? {} : { pedestrians: config.pedestrians }),
      ...(config.vehiclesComplete === undefined
        ? {}
        : { vehiclesComplete: config.vehiclesComplete }),
      ...(contact.length === 0 ? {} : { contacts: contact }),
    });
    if (step.stimuli.length > 0 && onsetTick === null) onsetTick = tick;
    if (brake > 0) speedMps = Math.max(0, speedMps - 8 * DT);
    distanceM -= speedMps * DT;
    lateralM += (config.lateralMps ?? 0) * (steering > 0 ? DT : 0);
    if (distanceM < -20) break;
  }
  return { world, onsetTick };
}

test('obstacles are data with closed edge policies and explicit refusals', () => {
  const inside = hazardObstacle({ id: 'inside-1', type: 'CONE' }),
    clip = {
      id: 'clip-1',
      type: 'BARRIER',
      positionM: { x: 759, y: 0.6, z: 300 },
      halfSizeM: { x: 5, y: 0.6, z: 0.5 },
      edgePolicy: 'CLIP_TO_BOUNDS',
    },
    reject = {
      id: 'reject-1',
      type: 'BLOCK',
      positionM: { x: 759, y: 1, z: 300 },
      halfSizeM: { x: 5, y: 1, z: 1 },
    },
    duplicate = hazardObstacle({ id: 'inside-1', type: 'CONE' }),
    degenerate = {
      id: 'degenerate-1',
      type: 'DEBRIS',
      positionM: { x: 100, y: 0.2, z: 100 },
      halfSizeM: { x: 0, y: 0.2, z: 0.2 },
    },
    unknownType = {
      id: 'unknown-1',
      type: 'ROCKET',
      positionM: { x: 100, y: 1, z: 100 },
      halfSizeM: { x: 1, y: 1, z: 1 },
    },
    badPolicy = {
      ...inside,
      id: 'policy-1',
      edgePolicy: 'WRAP',
    },
    degenerateClip = {
      id: 'degenerate-clip-1',
      type: 'BARRIER',
      positionM: { x: 800, y: 0.6, z: 300 },
      halfSizeM: { x: 1, y: 0.6, z: 0.5 },
      edgePolicy: 'CLIP_TO_BOUNDS',
    },
    world = createHazardWorld([
      inside,
      clip,
      reject,
      duplicate,
      degenerate,
      unknownType,
      badPolicy,
      degenerateClip,
    ]);
  assert.equal(world.version, HAZARD_VERSION);
  assert.equal(world.getObstacles().length, 2);
  const clipped = world.getObstacles().find((entry) => entry.obstacleId === 'clip-1')!;
  assert.equal(clipped.edge.status, 'CLIPPED');
  assert.ok(clipped.edge.overshootM > 0);
  assert.ok(clipped.halfSizeM.x < 5);
  assert.equal(clipped.physics.entityId, 'clip-1');
  assert.equal(world.getObstacles()[0]!.physics.kind, 'OBSTACLE');
  assert.deepEqual(
    world
      .getRefusedObstacles()
      .map((entry) => entry.reason)
      .sort(),
    [
      'DEGENERATE_CLIP',
      'DUPLICATE_ID',
      'INVALID_GEOMETRY',
      'OUTSIDE_MAP_BOUNDS',
      'UNKNOWN_EDGE_POLICY',
      'UNKNOWN_TYPE',
    ],
  );
  // Positions come from the real lane fixture, not from scene constants.
  const lane = hazardLane(),
    insideObstacle = world.getObstacles().find((entry) => entry.obstacleId === 'inside-1')!;
  assert.ok(Math.abs(insideObstacle.positionM.z - lane.obstaclePositionM.z) < 1e-9);
  assert.ok(insideObstacle.positionM.z !== 0);
});

test('obstacle appearance is data and seeded deterministic', () => {
  const build = (seed: number) =>
    createHazardWorld([hazardObstacle({ activeFromTick: 60, activeJitterTicks: 30 })], {
      seed,
    }).getObstacles()[0]!;
  const first = build(165),
    second = build(165),
    other = build(166);
  assert.equal(first.appearTick, second.appearTick);
  assert.notEqual(first.appearTick, other.appearTick);
  assert.ok(first.appearTick >= 60 && first.appearTick <= 90);
});

test('a hazard behind the vehicle or out of range has no stimulus until it is observable', () => {
  const world = createHazardWorld(),
    lane = hazardLane(),
    forwardX = Math.cos(lane.headingRad),
    forwardZ = Math.sin(lane.headingRad),
    behind = vehicleBeforeObstacle(0, 0, {
      positionM: Object.freeze({
        x: lane.obstaclePositionM.x + forwardX * 10,
        y: 0.8,
        z: lane.obstaclePositionM.z + forwardZ * 10,
      }),
    });
  for (let tick = 0; tick < 40; tick += 1) stepVehicle(world, tick, behind);
  assert.equal(world.getStimuli().length, 0);
  // Turning around makes the same hazard observable: the debut is the observation, not the proximity.
  const facing = Object.freeze({ ...behind, headingRad: behind.headingRad + Math.PI });
  const step = stepVehicle(world, 40, facing);
  assert.equal(step.stimuli.length, 1);
  assert.equal(step.stimuli[0]!.tick, 40);
  assert.equal(step.stimuli[0]!.distanceM, 10);

  const far = createHazardWorld(),
    farVehicle = vehicleBeforeObstacle(120, 12);
  for (let tick = 0; tick < 30; tick += 1) stepVehicle(far, tick, farVehicle);
  assert.equal(far.getStimuli().length, 0);
});

test('stimulus identity is physical and independent of the observation tick', () => {
  const near = createHazardWorld(),
    far = createHazardWorld();
  approach(near, { startDistanceM: 40, speedMps: 12, ticks: 1 });
  approach(far, { startDistanceM: 100, speedMps: 12, ticks: 120 });
  const nearStimulus = near.getStimuli()[0]!,
    farStimulus = far.getStimuli()[0]!;
  assert.equal(nearStimulus.stimulusId, farStimulus.stimulusId);
  assert.equal(nearStimulus.tick, 0);
  assert.ok(farStimulus.tick > 0);
  assert.notEqual(nearStimulus.tick, farStimulus.tick);
  assert.equal(nearStimulus.hazardId, 'obstacle-1');
  assert.equal(nearStimulus.learningEligible, null);
});

test('a brake already applied at onset is a state, not a reaction', () => {
  const world = createHazardWorld(),
    vehicle = vehicleBeforeObstacle(40, 12, { brake: 0.5 });
  stepVehicle(world, 0, vehicle);
  assert.equal(world.getStimuli().length, 1);
  assert.equal(world.getReactions().length, 0);
  const second = stepVehicle(world, 1, Object.freeze({ ...vehicle, brake: 0 }));
  assert.equal(second.reactions.length, 0);
  const third = stepVehicle(world, 2, Object.freeze({ ...vehicle, brake: 0 }));
  assert.equal(third.reactions.length, 0);
});

test('reaction latency is measured from the exact onset tick', () => {
  const world = createHazardWorld();
  approach(world, { startDistanceM: 40, speedMps: 12, ticks: 220, brakeAt: 45 });
  const reaction = world.getReactions()[0]!,
    encounter = world.getEncounters()[0]!;
  assert.equal(reaction.hook, 'BRAKE');
  assert.equal(reaction.tick, 45);
  assert.equal(reaction.latencyTicks, 45);
  assert.equal(reaction.latencyS, 0.75);
  assert.equal(encounter.latencyTicks, 45);
  assert.equal(encounter.outcome, 'STOPPED');
  assert.ok(encounter.minimumDistanceM > HAZARD_LIMITS.clearanceM);
  assert.equal(world.getInspection().denominators.reactionRate.value, 1);
});

test('an evasive steer is measured and only a clear pass counts as avoidance', () => {
  const world = createHazardWorld();
  approach(world, {
    startDistanceM: 30,
    speedMps: 14,
    ticks: 220,
    steeringAt: 30,
    lateralMps: 4,
  });
  const reaction = world.getReactions()[0]!,
    encounter = world.getEncounters()[0]!;
  assert.equal(reaction.hook, 'STEER');
  assert.equal(reaction.latencyTicks, 30);
  assert.equal(encounter.outcome, 'PASSED_CLEAR');
  assert.ok(encounter.minimumDistanceM > HAZARD_LIMITS.clearanceM);
  assert.equal(world.getInspection().counts.contacts, 0);
});

test('a contact requires an authoritative fact; passing through it is not invented', () => {
  const silent = createHazardWorld();
  approach(silent, { startDistanceM: 20, speedMps: 12, ticks: 160 });
  const silentEncounter = silent.getEncounters()[0]!;
  assert.equal(silentEncounter.outcome, 'PASSED_CLOSE');
  assert.equal(silentEncounter.contactTick, null);
  assert.equal(silent.getInspection().counts.contacts, 0);

  const reported = createHazardWorld();
  approach(reported, { startDistanceM: 20, speedMps: 12, ticks: 160, contactOnPass: true });
  const reportedEncounter = reported.getEncounters()[0]!;
  assert.equal(reportedEncounter.outcome, 'CONTACT');
  assert.ok(reportedEncounter.contactTick !== null);
  assert.equal(reportedEncounter.contactImpulseNs, 900);
  assert.equal(reported.getInspection().counts.contacts, 1);
});

test('horn opportunity has observable conditions, refusals and a declared missing live channel', () => {
  const world = createHazardWorld([]),
    pedestrian = pedestrianInPath(10, 'CROSSING'),
    lane = hazardLane(),
    headingRad = lane.headingRad;
  let distanceM = 25;
  for (let tick = 0; tick < 60; tick += 1) {
    const horn = tick === 18 || tick === 19;
    const vehicle = vehicleBeforeObstacle(distanceM, 8, {
      controlMode: 'MANUAL',
      ...(horn ? { horn: true } : {}),
    });
    stepVehicle(world, tick, vehicle, { pedestrians: [pedestrian] });
    distanceM = Math.max(0, distanceM - 8 * DT);
  }
  const opportunity = world.getHornOpportunities()[0]!,
    use = world.getHornUses()[0]!;
  assert.equal(opportunity.openedTick, 0);
  assert.deepEqual([...opportunity.conditions], ['IMMINENT_HAZARD', 'PEDESTRIAN_IN_PATH']);
  assert.equal(use.latencyTicks, 18);
  assert.equal(use.source, 'CONTROLLED_FIXTURE');
  assert.deepEqual(
    world.getHornRefusals().map((entry) => entry.reason),
    ['OPPORTUNITY_ALREADY_USED'],
  );
  assert.equal(HAZARD_HORN_CHANNEL.liveInput, 'UNAVAILABLE');
  assert.equal(HAZARD_HORN_CHANNEL.requiredForLive.length, 3);

  const early = createHazardWorld([]),
    far = vehicleBeforeObstacle(120, 8, {
      positionM: Object.freeze({
        x: lane.obstaclePositionM.x - Math.cos(headingRad) * 120,
        y: 0.8,
        z: lane.obstaclePositionM.z - Math.sin(headingRad) * 120,
      }),
      horn: true,
    });
  const earlyStep = stepVehicle(early, 0, far, { pedestrians: [pedestrian] });
  assert.equal(earlyStep.stimuli.length, 0);
  assert.deepEqual(
    earlyStep.hornRefusals.map((entry) => entry.reason),
    ['NO_OPEN_OPPORTUNITY'],
  );
});

test('pedestrians are only imminent hazards at the curb or on the crossing', () => {
  assert.deepEqual([...HAZARD_PEDESTRIAN_STATES], ['WAITING', 'CROSSING']);
  const world = createHazardWorld([]),
    vehicle = vehicleBeforeObstacle(25, 8),
    sidewalk = pedestrianInPath(10, 'CROSSING');
  const first = stepVehicle(world, 0, vehicle, {
    pedestrians: [Object.freeze({ ...sidewalk, state: 'ON_SIDEWALK' })],
  });
  assert.equal(first.stimuli.length, 0);
  const second = stepVehicle(world, 1, vehicle, {
    pedestrians: [Object.freeze({ ...sidewalk, state: 'WAITING' })],
  });
  assert.equal(second.stimuli.length, 1);
  assert.equal(second.stimuli[0]!.kind, 'PEDESTRIAN');
});

test('invalid input is refused, not repaired', () => {
  const world = createHazardWorld();
  assert.throws(
    () =>
      world.step({
        tick: 0,
        vehicles: [{ ...vehicleBeforeObstacle(40, 12), controlMode: 'ROPED' }],
        vehiclesComplete: true,
      }),
    /control mode/,
  );
  assert.throws(
    () =>
      world.step({
        tick: 0,
        vehicles: [vehicleBeforeObstacle(40, 12)],
        vehiclesComplete: true,
        surprise: true,
      }),
    /fields/,
  );
  const created = createHazardWorld();
  stepVehicle(created, 5, vehicleBeforeObstacle(40, 12));
  assert.throws(() => stepVehicle(created, 5, vehicleBeforeObstacle(40, 12)), /strictly increase/);
  assert.throws(
    () =>
      stepVehicle(created, 6, vehicleBeforeObstacle(40, 12), {
        contacts: [{ vehicleId: 'vehicle-1', hazardId: 'obstacle-1', tick: 7, impulseNs: 10 }],
      }),
    /match the step tick/,
  );
  assert.throws(
    () =>
      createHazards(hazardMap(), hazardSession(), {
        seed: 165,
        obstacles: [
          {
            id: 'x',
            type: 'CONE',
            positionM: { x: 1, y: 1, z: 1 },
            halfSizeM: { x: 1, y: 1, z: 1 },
            extra: 1,
          },
        ],
      }),
    /obstacle contract fields/,
  );
  assert.throws(() => createHazards(hazardMap(), hazardSession(), { obstacles: [] }), /seed/);
  const duplicateStep = createHazardWorld();
  assert.throws(
    () =>
      duplicateStep.step({
        tick: 0,
        vehicles: [vehicleBeforeObstacle(40, 12), vehicleBeforeObstacle(40, 12)],
        vehiclesComplete: true,
      }),
    /Duplicate vehicle/,
  );
  assert.equal(world.getStimuli().length, 0);
});

test('a contact without a stimulus is reported as a gap, not as a hazard reaction', () => {
  const world = createHazardWorld();
  stepVehicle(world, 0, vehicleBeforeObstacle(40, 12), {
    contacts: [{ vehicleId: 'vehicle-1', hazardId: 'unknown-obstacle', tick: 0, impulseNs: 10 }],
  });
  const gaps = world.getInspection().gaps.map((entry) => entry.id);
  assert.ok(gaps.includes('CONTACT_WITHOUT_STIMULUS'));
  assert.equal(world.getInspection().counts.contacts, 0);
});

test('denominators stay missing without a resolved complete encounter', () => {
  const empty = createHazardWorld([]);
  stepVehicle(empty, 0, vehicleBeforeObstacle(40, 12));
  assert.equal(empty.getInspection().denominators.reactionRate.status, 'MISSING');
  assert.equal(empty.getInspection().denominators.reactionRate.reason, 'NO_RESOLVED_STIMULUS');

  const incomplete = createHazardWorld();
  approach(incomplete, {
    startDistanceM: 30,
    speedMps: 12,
    ticks: 220,
    brakeAt: 20,
    vehiclesComplete: false,
  });
  const rate = incomplete.getInspection().denominators.reactionRate;
  assert.equal(rate.status, 'MISSING');
  assert.equal(rate.reason, 'INCOMPLETE_VEHICLE_COVERAGE');
  assert.equal(incomplete.getInspection().coverage.incompleteSteps, 220);
});

test('same inputs and seed produce the same stimuli and the same moments', () => {
  const run = () => {
    const world = createHazardWorld([
      hazardObstacle({ activeFromTick: 60, activeJitterTicks: 30 }),
    ]);
    approach(world, { startDistanceM: 90, speedMps: 12, ticks: 300, brakeAt: 45 });
    return world;
  };
  const first = run(),
    second = run();
  assert.deepEqual(first.getStimuli(), second.getStimuli());
  assert.deepEqual(first.getReactions(), second.getReactions());
  assert.deepEqual(first.getEncounters(), second.getEncounters());
  assert.equal(first.getObstacles()[0]!.appearTick, second.getObstacles()[0]!.appearTick);
  assert.deepEqual(first.getStats().evaluationCost, second.getStats().evaluationCost);
});

test('dispose stops further steps and retains measured cost', () => {
  const world = createHazardWorld();
  const vehicle = vehicleBeforeObstacle(40, 12);
  for (let tick = 0; tick < 5; tick += 1) stepVehicle(world, tick, vehicle);
  const stats = world.getStats();
  assert.equal(stats.steps, 5);
  assert.equal(stats.evaluationCost.vehicleEvaluations, 5);
  assert.equal(stats.evaluationCost.peakVehiclesPerStep, 1);
  assert.equal(stats.disposed, false);
  world.dispose();
  assert.equal(world.getStats().disposed, true);
  assert.throws(() => stepVehicle(world, 5, vehicle), /disposed/);
});

test('obstacle capacity is the shared collision capacity', () => {
  const obstacles = Array.from({ length: HAZARD_LIMITS.obstacles + 1 }, (_, index) => ({
    id: `cap-${index}`,
    type: 'CONE',
    positionM: { x: 100 + index * 0.01, y: 0.5, z: 100 },
    halfSizeM: { x: 0.3, y: 0.5, z: 0.3 },
  }));
  const world = createHazardWorld(obstacles);
  assert.equal(HAZARD_LIMITS.obstacles, 96);
  assert.equal(world.getObstacles().length, 96);
  assert.deepEqual(
    world.getRefusedObstacles().map((entry) => entry.reason),
    ['CAPACITY'],
  );
});

test('a clipped obstacle keeps the authored edge policy and reports the overshoot', () => {
  const world = createHazardWorld([
    {
      id: 'clip-2',
      type: 'BLOCK',
      positionM: { x: 758, y: 1, z: 200 },
      halfSizeM: { x: 4, y: 1, z: 2 },
      edgePolicy: 'CLIP_TO_BOUNDS',
    },
  ]);
  const obstacle = world.getObstacles()[0]!;
  assert.equal(obstacle.edgePolicy, 'CLIP_TO_BOUNDS');
  assert.equal(obstacle.edge.status, 'CLIPPED');
  assert.equal(obstacle.edge.overshootM, 2);
  assert.equal(obstacle.positionM.x, 757);
  assert.equal(obstacle.halfSizeM.x, 3);
});

test('remote lane pose is the same as the fixture obstacle line', () => {
  const lane = hazardLane(),
    pose = lanePose(lane.graph, lane.laneId, HAZARD_OBSTACLE_M);
  assert.ok(Math.abs(pose.positionM.x - lane.obstaclePositionM.x) < 1e-9);
  assert.ok(Math.abs(pose.positionM.z - lane.obstaclePositionM.z) < 1e-9);
  assert.ok(lane.lengthM > HAZARD_OBSTACLE_M);
});
