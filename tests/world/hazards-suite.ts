import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createHazards,
  HAZARD_HORN_CHANNEL,
  type HazardEncounter,
  type HazardInspection,
  type HazardObstacleRefusal,
  type Hazards,
} from '../../src/world';
import { createRapierProbe } from '../../src/vehicles/rapier';
import type { Vector3 } from '../../src/vehicles';
import {
  HAZARD_OBSTACLE_M,
  createHazardWorld,
  hazardLane,
  hazardMap,
  hazardObstacle,
  hazardSession,
  pedestrianInPath,
} from './hazards-fixture';

const DT = 1 / 60;

export interface ScenarioCheck {
  readonly id: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface EncounterRow {
  readonly stimulusId: string;
  readonly hazardId: string;
  readonly kind: string;
  readonly vehicleId: string;
  readonly controlMode: string;
  readonly onsetTick: number;
  readonly outcome: string;
  readonly resolvedTick: number | null;
  readonly minimumDistanceM: number;
  readonly latencyTicks: number | null;
  readonly hornOpportunityId: string | null;
  readonly contactTick: number | null;
  readonly contactImpulseNs: number;
}

export interface PhysicalArm {
  readonly mode: string;
  readonly action: string;
  readonly collider: 'OBSTACLE' | 'GENERIC_CONTACT';
  readonly onsetTick: number | null;
  readonly latencyTicks: number | null;
  readonly contactTick: number | null;
  readonly impulseNs: number;
  readonly minimumDistanceM: number;
  readonly finalZM: number;
  readonly finalSpeedMps: number;
  readonly outcome: string;
}

export interface ScenarioResult {
  readonly scenarioId: string;
  readonly title: string;
  readonly description: string;
  readonly ticks: number;
  readonly stimuli: number;
  readonly reactions: number;
  readonly hornOpportunities: number;
  readonly hornUses: number;
  readonly hornRefusals: number;
  readonly counts: HazardInspection['counts'];
  readonly coverage: HazardInspection['coverage'];
  readonly latency: HazardInspection['latency'];
  readonly denominators: HazardInspection['denominators'];
  readonly gaps: readonly string[];
  readonly encounters: readonly EncounterRow[];
  readonly refusals?: readonly HazardObstacleRefusal[];
  readonly physical?: Readonly<{
    arms: readonly PhysicalArm[];
    comparisons: readonly {
      readonly id: string;
      readonly passed: boolean;
      readonly detail: string;
    }[];
  }>;
  readonly checks: readonly ScenarioCheck[];
  readonly pass: boolean;
}

export interface HazardReport {
  readonly generatedBy: string;
  readonly command: string;
  readonly contract: string;
  readonly oracleRule: string;
  readonly fixture: Readonly<{
    mapId: string;
    laneId: string;
    laneLengthM: number;
    obstacleLongitudinalM: number;
    obstacles: number;
    refusedObstacles: number;
    refuseReasons: Readonly<Record<string, number>>;
    seed: number;
    appearTick: number;
  }>;
  readonly scenarios: readonly ScenarioResult[];
  readonly summary: Readonly<{
    scenarios: number;
    passed: number;
    pass: boolean;
    stimuli: number;
    reactions: number;
    brakeReactions: number;
    steerReactions: number;
    hornOpportunities: number;
    hornUses: number;
    hornRefusals: number;
    contacts: number;
    stopped: number;
    passedClear: number;
    passedClose: number;
    released: number;
    pending: number;
  }>;
  readonly determinism: Readonly<{
    runs: number;
    identical: boolean;
    digest: string;
    appearTicks: readonly number[];
    digestBySeed: readonly { readonly seed: number; readonly digest: string }[];
  }>;
  readonly cost: Readonly<{
    scenarioId: string;
    steps: number;
    hazardEvaluations: number;
    vehicleEvaluations: number;
    peakHazardsPerStep: number;
    peakVehiclesPerStep: number;
  }>;
  readonly limitations: readonly string[];
}

function check(id: string, passed: boolean, detail: string): ScenarioCheck {
  return Object.freeze({ id, passed, detail });
}

function encounterRows(world: Hazards): readonly EncounterRow[] {
  return world.getEncounters().map((encounter: HazardEncounter) =>
    Object.freeze({
      stimulusId: encounter.stimulusId,
      hazardId: encounter.hazardId,
      kind: encounter.kind,
      vehicleId: encounter.vehicleId,
      controlMode: encounter.controlMode,
      onsetTick: encounter.onsetTick,
      outcome: encounter.outcome,
      resolvedTick: encounter.resolvedTick,
      minimumDistanceM: encounter.minimumDistanceM,
      latencyTicks: encounter.latencyTicks,
      hornOpportunityId: encounter.hornOpportunityId,
      contactTick: encounter.contactTick,
      contactImpulseNs: encounter.contactImpulseNs,
    }),
  );
}

function scenario(
  scenarioId: string,
  title: string,
  description: string,
  world: Hazards,
  ticks: number,
  checks: readonly ScenarioCheck[],
  extra: Partial<ScenarioResult> = {},
): ScenarioResult {
  const inspection = world.getInspection();
  return Object.freeze({
    scenarioId,
    title,
    description,
    ticks,
    stimuli: inspection.counts.stimuli,
    reactions: inspection.counts.reactions,
    hornOpportunities: inspection.counts.hornOpportunities,
    hornUses: inspection.counts.hornUses,
    hornRefusals: inspection.counts.hornRefusals,
    counts: inspection.counts,
    coverage: inspection.coverage,
    latency: inspection.latency,
    denominators: inspection.denominators,
    gaps: Object.freeze(inspection.gaps.map((entry) => `${entry.id}: ${entry.detail}`)),
    encounters: encounterRows(world),
    checks: Object.freeze(checks),
    pass: checks.every((entry) => entry.passed),
    ...extra,
  });
}

interface ApproachCommand {
  readonly brake: number;
  readonly steering: number;
  readonly lateralMps: number;
  readonly horn?: boolean;
}

interface ApproachConfig {
  readonly obstacles: readonly unknown[];
  readonly seed: number;
  readonly startDistanceM: number;
  readonly initialSpeedMps: number;
  readonly ticks: number;
  readonly command: (context: {
    readonly tick: number;
    readonly onsetTick: number | null;
    readonly elapsed: number | null;
    readonly distanceM: number;
  }) => ApproachCommand;
}

/** Deterministic kinematic approach: the fixture moves the vehicle, the module only observes. */
function runApproach(config: ApproachConfig) {
  const world = createHazardWorld(config.obstacles, { seed: config.seed }),
    lane = hazardLane(),
    headingRad = lane.headingRad,
    forwardX = Math.cos(headingRad),
    forwardZ = Math.sin(headingRad),
    rightX = -forwardZ,
    rightZ = forwardX,
    obstaclePose = lane.obstaclePositionM;
  let distanceM = config.startDistanceM,
    lateralM = 0,
    speedMps = config.initialSpeedMps,
    onsetTick: number | null = null,
    ticks = 0;
  for (let tick = 0; tick < config.ticks; tick += 1) {
    ticks = tick + 1;
    const command = config.command({
      tick,
      onsetTick,
      elapsed: onsetTick === null ? null : tick - onsetTick,
      distanceM,
    });
    const positionM: Vector3 = Object.freeze({
      x: obstaclePose.x - forwardX * distanceM + rightX * lateralM,
      y: 0.8,
      z: obstaclePose.z - forwardZ * distanceM + rightZ * lateralM,
    });
    const step = world.step({
      tick,
      vehicles: [
        {
          vehicleId: 'vehicle-1',
          incarnation: 'inc-1',
          controlMode: 'AUTO',
          positionM,
          headingRad,
          speedMps,
          brake: command.brake,
          steering: command.steering,
          ...(command.horn === undefined ? {} : { horn: command.horn }),
        },
      ],
      vehiclesComplete: true,
    });
    if (step.stimuli.length > 0 && onsetTick === null) onsetTick = tick;
    if (command.brake > 0) speedMps = Math.max(0, speedMps - 8 * DT);
    distanceM = Math.max(0, distanceM - speedMps * DT);
    lateralM += command.lateralMps * DT;
    if (distanceM === 0 && speedMps === 0) break;
  }
  return { world, ticks, onsetTick, finalDistanceM: distanceM, finalLateralM: lateralM };
}

function approachChecks(result: ReturnType<typeof runApproach>): readonly ScenarioCheck[] {
  const world = result.world,
    stimulus = world.getStimuli()[0],
    encounter = world.getEncounters()[0],
    reactions = world.getReactions();
  return Object.freeze([
    check(
      'single-stimulus',
      world.getStimuli().length === 1,
      `stimuli ${world.getStimuli().length}`,
    ),
    check(
      'observable-onset',
      stimulus !== undefined && encounter !== undefined && stimulus.tick === encounter.onsetTick,
      stimulus
        ? `onset tick ${stimulus.tick}, distance ${stimulus.distanceM.toFixed(2)} m`
        : 'no onset',
    ),
    check(
      'reaction-latency',
      reactions.length === 1 && encounter?.latencyTicks !== null,
      reactions.length === 1
        ? `${reactions[0]!.hook} after ${reactions[0]!.latencyTicks} ticks`
        : `reactions ${reactions.length}`,
    ),
    check(
      'no-fictitious-denominator',
      world.getInspection().denominators.reactionRate.status !== 'MISSING' ||
        world.getInspection().denominators.reactionRate.reason !== null,
      `reaction rate ${String(world.getInspection().denominators.reactionRate.value)}`,
    ),
  ]);
}

function digest(world: Hazards) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        stimuli: world.getStimuli(),
        reactions: world.getReactions(),
        encounters: world.getEncounters(),
        horn: world.getHornUses(),
      }),
    )
    .digest('hex');
}

function suddenObstacle() {
  const obstacles = [hazardObstacle({ activeFromTick: 60, activeJitterTicks: 30 })],
    result = runApproach({
      obstacles,
      seed: 165,
      startDistanceM: 40,
      initialSpeedMps: 12,
      ticks: 420,
      command: ({ elapsed }) => ({
        brake: elapsed !== null && elapsed >= 45 ? 0.8 : 0,
        steering: 0,
        lateralMps: 0,
      }),
    }),
    world = result.world,
    obstacle = world.getObstacles()[0]!,
    stimulus = world.getStimuli()[0],
    encounter = world.getEncounters()[0],
    reaction = world.getReactions()[0],
    beforeAppearance = world.getStimuli().every((entry) => entry.tick >= obstacle.appearTick);
  return scenario(
    'sudden-obstacle',
    'Obstacol brusc, debut observabil și reacție întârziată',
    'Obstacolul apare la un tick derivat din seed; stimulul se naște abia după apariție, iar frânarea pornește la 45 de tick-uri după debut.',
    world,
    result.ticks,
    [
      ...approachChecks(result),
      check(
        'appearance-window',
        obstacle.appearTick >= 60 && obstacle.appearTick <= 90,
        `appearTick ${obstacle.appearTick} in [60, 90]`,
      ),
      check('no-stimulus-before-appearance', beforeAppearance, 'zero stimuli before appearTick'),
      check(
        'latency-exact',
        reaction !== undefined && reaction.latencyTicks === 45,
        `latency ${reaction?.latencyTicks ?? 'none'} ticks`,
      ),
      check(
        'stopped',
        encounter?.outcome === 'STOPPED',
        `outcome ${encounter?.outcome ?? 'none'} at ${encounter?.resolvedTick ?? '—'}`,
      ),
      check(
        'clearance',
        (encounter?.minimumDistanceM ?? 0) > 0.5,
        `minimum distance ${encounter?.minimumDistanceM.toFixed(2) ?? '—'} m`,
      ),
      check(
        'stimulus-distance',
        stimulus !== undefined &&
          Math.abs(stimulus.distanceM - (40 - obstacle.appearTick * 12 * DT)) < 1e-6,
        `distance ${stimulus?.distanceM.toFixed(2) ?? '—'} m at tick ${stimulus?.tick ?? '—'}, TTC ${stimulus?.timeToHazardS?.toFixed(2) ?? '—'} s`,
      ),
      check(
        'reaction-rate',
        world.getInspection().denominators.reactionRate.value === 1,
        `reaction rate ${String(world.getInspection().denominators.reactionRate.value)}`,
      ),
    ],
  );
}

function delayedReaction(suddenStimulusId: string | undefined) {
  const result = runApproach({
      obstacles: [hazardObstacle()],
      seed: 165,
      startDistanceM: 40,
      initialSpeedMps: 12,
      ticks: 460,
      command: ({ elapsed }) => ({
        brake: elapsed !== null && elapsed >= 90 ? 0.8 : 0,
        steering: 0,
        lateralMps: 0,
      }),
    }),
    world = result.world,
    reaction = world.getReactions()[0],
    encounter = world.getEncounters()[0],
    stimulus = world.getStimuli()[0];
  return scenario(
    'delayed-reaction',
    'Reacție întârziată, aceeași identitate a stimulului',
    'Aceeași apropiere, dar frânarea pornește la 90 de tick-uri după debut: identitatea stimulului nu depinde de momentul observării, doar latența măsurată se schimbă.',
    world,
    result.ticks,
    [
      ...approachChecks(result),
      check(
        'latency-exact',
        reaction !== undefined && reaction.latencyTicks === 90,
        `latency ${reaction?.latencyTicks ?? 'none'} ticks`,
      ),
      check(
        'stable-identity',
        stimulus !== undefined && stimulus.stimulusId === suddenStimulusId,
        'the same stimulus id as the sudden-obstacle scenario',
      ),
      check(
        'stopped',
        encounter?.outcome === 'STOPPED',
        `outcome ${encounter?.outcome ?? 'none'} at ${encounter?.resolvedTick ?? '—'}`,
      ),
      check(
        'latency-in-seconds',
        reaction !== undefined && Math.abs(reaction.latencyS - 1.5) < 1e-9,
        `latency ${reaction?.latencyS.toFixed(3) ?? '—'} s`,
      ),
    ],
  );
}

function evasiveManoeuvre() {
  const result = runApproach({
      obstacles: [hazardObstacle()],
      seed: 165,
      startDistanceM: 30,
      initialSpeedMps: 14,
      ticks: 300,
      command: ({ elapsed }) => ({
        brake: 0,
        steering: elapsed !== null && elapsed >= 30 ? 0.5 : 0,
        lateralMps: elapsed !== null && elapsed >= 30 ? 4 : 0,
      }),
    }),
    world = result.world,
    encounter = world.getEncounters()[0],
    reaction = world.getReactions()[0];
  return scenario(
    'evasive-manoeuvre',
    'Manevră evazivă măsurată față de debut',
    'Virarea începe la 30 de tick-uri după debut; vehiculul ocolește obstacolul, iar trecerea este marcată drept curată doar dacă distanța minimă depășește marja.',
    world,
    result.ticks,
    [
      ...approachChecks(result),
      check(
        'steer-reaction',
        reaction?.hook === 'STEER' && reaction.latencyTicks === 30,
        `${reaction?.hook ?? 'none'} after ${reaction?.latencyTicks ?? '—'} ticks`,
      ),
      check(
        'passed-clear',
        encounter?.outcome === 'PASSED_CLEAR',
        `outcome ${encounter?.outcome ?? 'none'}, minimum ${encounter?.minimumDistanceM.toFixed(2) ?? '—'} m`,
      ),
      check(
        'lateral-clearance',
        (encounter?.minimumDistanceM ?? 0) > 2,
        `minimum distance ${encounter?.minimumDistanceM.toFixed(2) ?? '—'} m`,
      ),
      check(
        'no-contact',
        world.getInspection().counts.contacts === 0,
        `contacts ${world.getInspection().counts.contacts}`,
      ),
    ],
  );
}

interface PhysicalRun {
  readonly arm: PhysicalArm;
  readonly collisionIdentity: boolean;
}

async function physicalArm(
  mode: 'MANUAL' | 'AUTO',
  action: 'BRAKE' | 'LATE' | 'EVADE',
  collider: 'OBSTACLE' | 'GENERIC_CONTACT',
): Promise<PhysicalRun> {
  const world = await createRapierProbe(),
    obstacle = hazardObstacle({ id: 'obstacle-physics' }),
    hazards = createHazards(hazardMap(), hazardSession(), { seed: 165, obstacles: [obstacle] }),
    data = hazards.getObstacles()[0]!,
    entityId = collider === 'OBSTACLE' ? data.physics.entityId : 'generic-contact',
    vehicleId = 'vehicle-physics';
  let collisionIdentity = false;
  try {
    assert.equal(data.physics.entityId, 'obstacle-physics');
    world.addClassCar(
      vehicleId,
      { x: data.positionM.x, y: 0.8, z: data.positionM.z - 60 },
      'sedan',
    );
    for (let tick = 0; tick < 180; tick += 1) world.step(new Map(), false);
    world.addNamedBox(entityId, data.physics.positionM, data.physics.halfSizeM);
    collisionIdentity = world.collisionIdentity(entityId) !== undefined;
    world.setVelocity(vehicleId, { x: 0, y: 0, z: 15 });
    let onsetTick: number | null = null,
      contactTick: number | null = null,
      impulseNs = 0,
      minimumDistanceM = Infinity,
      brake = 0,
      steering = 0,
      throttle = 0,
      ticks = 0;
    for (let tick = 0; tick < 520; tick += 1) {
      ticks = tick + 1;
      const projection = world.project(vehicleId),
        q = projection.rotation,
        forwardX = 2 * (q.x * q.z + q.w * q.y),
        forwardZ = 1 - 2 * (q.x * q.x + q.y * q.y),
        headingRad = Math.atan2(forwardZ, forwardX),
        contacts = world
          .readCollisionContacts()
          .contacts.filter((contact) =>
            [contact.first.entityId, contact.second.entityId].includes(entityId),
          )
          .map((contact) => ({
            vehicleId,
            hazardId: data.physics.entityId,
            tick,
            impulseNs: contact.impulseNs,
          })),
        step = hazards.step({
          tick,
          vehicles: [
            {
              vehicleId,
              incarnation: 'inc-physics',
              controlMode: mode,
              positionM: Object.freeze({
                x: projection.position.x,
                y: projection.position.y,
                z: projection.position.z,
              }),
              headingRad,
              speedMps: projection.speed,
              brake,
              steering,
            },
          ],
          vehiclesComplete: true,
          contacts: collider === 'OBSTACLE' ? contacts : [],
        });
      if (step.stimuli.length > 0 && onsetTick === null) onsetTick = tick;
      if (contacts.length > 0) {
        if (contactTick === null) contactTick = tick;
        impulseNs += contacts.reduce((sum, contact) => sum + contact.impulseNs, 0);
      }
      if (onsetTick !== null) {
        const elapsed = tick - onsetTick;
        if (action === 'BRAKE' && elapsed >= 120) brake = 1;
        if (action === 'LATE' && elapsed >= 210) brake = 1;
        if (action === 'EVADE' && elapsed >= 30 && elapsed < 100) {
          steering = 0.3;
          throttle = 0.5;
        } else if (action === 'EVADE' && elapsed >= 100) {
          steering = -0.12;
          throttle = 0.3;
        }
      }
      const dx = Math.max(
          data.physics.positionM.x - data.physics.halfSizeM.x - projection.position.x,
          0,
          projection.position.x - (data.physics.positionM.x + data.physics.halfSizeM.x),
        ),
        dz = Math.max(
          data.physics.positionM.z - data.physics.halfSizeM.z - projection.position.z,
          0,
          projection.position.z - (data.physics.positionM.z + data.physics.halfSizeM.z),
        );
      minimumDistanceM = Math.min(minimumDistanceM, Math.hypot(dx, dz));
      world.step(new Map([[vehicleId, { throttle, brake, steering }]]), false);
      if (ticks >= 300 && Math.abs(world.project(vehicleId).speed) < 0.05) break;
    }
    const final = world.project(vehicleId),
      encounter = hazards.getEncounters()[0];
    return Object.freeze({
      collisionIdentity,
      arm: Object.freeze({
        mode,
        action,
        collider,
        onsetTick,
        latencyTicks: encounter?.latencyTicks ?? null,
        contactTick,
        impulseNs: Number(impulseNs.toFixed(3)),
        minimumDistanceM: Number(minimumDistanceM.toFixed(3)),
        finalZM: Number(final.position.z.toFixed(6)),
        finalSpeedMps: Number(final.speed.toFixed(3)),
        outcome: encounter?.outcome ?? 'NONE',
      }),
    });
  } finally {
    hazards.dispose();
    world.dispose();
  }
}

async function samePhysics() {
  const manualBrake = await physicalArm('MANUAL', 'BRAKE', 'OBSTACLE'),
    autoBrake = await physicalArm('AUTO', 'BRAKE', 'OBSTACLE'),
    manualLate = await physicalArm('MANUAL', 'LATE', 'OBSTACLE'),
    autoLate = await physicalArm('AUTO', 'LATE', 'OBSTACLE'),
    manualEvade = await physicalArm('MANUAL', 'EVADE', 'OBSTACLE'),
    autoEvade = await physicalArm('AUTO', 'EVADE', 'OBSTACLE'),
    genericBrake = await physicalArm('MANUAL', 'BRAKE', 'GENERIC_CONTACT'),
    genericLate = await physicalArm('MANUAL', 'LATE', 'GENERIC_CONTACT'),
    arms = [
      manualBrake.arm,
      autoBrake.arm,
      manualLate.arm,
      autoLate.arm,
      manualEvade.arm,
      autoEvade.arm,
      genericBrake.arm,
      genericLate.arm,
    ],
    comparisons = Object.freeze([
      check(
        'manual-auto-brake-identical',
        manualBrake.arm.finalZM === autoBrake.arm.finalZM &&
          manualBrake.arm.contactTick === autoBrake.arm.contactTick,
        `stop z ${manualBrake.arm.finalZM} vs ${autoBrake.arm.finalZM}, contact ${String(manualBrake.arm.contactTick)} vs ${String(autoBrake.arm.contactTick)}`,
      ),
      check(
        'manual-auto-contact-identical',
        manualLate.arm.contactTick === autoLate.arm.contactTick &&
          Math.abs(manualLate.arm.impulseNs - autoLate.arm.impulseNs) <= 1,
        `contact tick ${String(manualLate.arm.contactTick)} vs ${String(autoLate.arm.contactTick)}, impulse ${manualLate.arm.impulseNs} vs ${autoLate.arm.impulseNs} N·s`,
      ),
      check(
        'late-input-is-the-only-difference',
        manualLate.arm.contactTick !== null && autoBrake.arm.contactTick === null,
        'the late brake arm contacts the obstacle while the early brake arm stops clear',
      ),
      check(
        'manual-auto-evade-identical',
        manualEvade.arm.outcome === 'PASSED_CLEAR' &&
          autoEvade.arm.outcome === 'PASSED_CLEAR' &&
          Math.abs(manualEvade.arm.minimumDistanceM - autoEvade.arm.minimumDistanceM) < 1e-6 &&
          manualEvade.arm.contactTick === null &&
          autoEvade.arm.contactTick === null,
        `clearance ${manualEvade.arm.minimumDistanceM} vs ${autoEvade.arm.minimumDistanceM} m, zero contacts`,
      ),
      check(
        'obstacle-is-an-ordinary-contact',
        manualBrake.arm.finalZM === genericBrake.arm.finalZM &&
          manualLate.arm.contactTick === genericLate.arm.contactTick &&
          Math.abs(manualLate.arm.impulseNs - genericLate.arm.impulseNs) <= 1,
        `stop z ${manualBrake.arm.finalZM} vs generic ${genericBrake.arm.finalZM}; contact ${String(manualLate.arm.contactTick)} vs ${String(genericLate.arm.contactTick)}`,
      ),
      check(
        'collider-registered-once',
        manualBrake.collisionIdentity && autoBrake.collisionIdentity,
        'the hazard obstacle is a named box in the shared collision registry',
      ),
      check(
        'brake-latency-measured',
        manualBrake.arm.latencyTicks !== null && manualBrake.arm.latencyTicks > 0,
        `brake latency ${String(manualBrake.arm.latencyTicks)} ticks`,
      ),
      check(
        'evade-latency-measured',
        manualEvade.arm.latencyTicks !== null && manualEvade.arm.latencyTicks > 0,
        `steer latency ${String(manualEvade.arm.latencyTicks)} ticks`,
      ),
    ]),
    failed = comparisons.filter((entry) => !entry.passed);
  const hazardArms = arms.filter((arm) => arm.collider === 'OBSTACLE'),
    stimuli = hazardArms.filter((arm) => arm.onsetTick !== null).length,
    reactions = hazardArms.filter((arm) => arm.latencyTicks !== null).length,
    result: ScenarioResult = Object.freeze({
      scenarioId: 'physical-same-physics',
      title: 'Aceeași fizică pentru jucător și AUTO, fără imunitate',
      description:
        'Rapier real: același vehicul și același obstacol sunt conduse cu comenzi identice sub etichete MANUAL și AUTO; contactul și oprirea sunt identice, iar diferența apare doar când comenzile diferă.',
      ticks: 520,
      stimuli,
      reactions,
      hornOpportunities: 0,
      hornUses: 0,
      hornRefusals: 0,
      counts: Object.freeze({
        obstacles: 1,
        refusedObstacles: 0,
        stimuli,
        reactions,
        brakeReactions: hazardArms.filter(
          (arm) => arm.action !== 'EVADE' && arm.latencyTicks !== null,
        ).length,
        steerReactions: hazardArms.filter(
          (arm) => arm.action === 'EVADE' && arm.latencyTicks !== null,
        ).length,
        hornOpportunities: 0,
        hornUses: 0,
        hornRefusals: 0,
        hornRefusalsNoOpportunity: 0,
        hornRefusalsAlreadyUsed: 0,
        stopped: hazardArms.filter((arm) => arm.outcome === 'STOPPED').length,
        passedClear: hazardArms.filter((arm) => arm.outcome === 'PASSED_CLEAR').length,
        passedClose: hazardArms.filter((arm) => arm.outcome === 'PASSED_CLOSE').length,
        contacts: hazardArms.filter((arm) => arm.outcome === 'CONTACT').length,
        released: 0,
        pending: 0,
      }),
      coverage: Object.freeze({
        steps: 520,
        completeSteps: 520,
        incompleteSteps: 0,
        vehiclesObserved: 520,
      }),
      latency: null,
      denominators: Object.freeze({
        reactionRate: Object.freeze({
          id: 'REACTION_RATE' as const,
          numerator: reactions,
          denominator: stimuli,
          value: stimuli === 0 ? null : reactions / stimuli,
          status: stimuli === 0 ? ('MISSING' as const) : ('OBSERVED' as const),
          reason: stimuli === 0 ? ('NO_RESOLVED_STIMULUS' as const) : null,
        }),
      }),
      gaps: Object.freeze([]),
      encounters: Object.freeze([]),
      physical: Object.freeze({ arms: Object.freeze(arms), comparisons }),
      checks: comparisons,
      pass: failed.length === 0,
    });
  return result;
}

function hornOpportunity() {
  const world = createHazardWorld([], { seed: 165 }),
    lane = hazardLane(),
    pedestrian = pedestrianInPath(10, 'CROSSING'),
    headingRad = lane.headingRad,
    forwardX = Math.cos(headingRad),
    forwardZ = Math.sin(headingRad),
    obstaclePose = lane.obstaclePositionM;
  let distanceM = 25,
    onsetTick: number | null = null,
    ticks = 0;
  const speedMps = 8;
  for (let tick = 0; tick < 140; tick += 1) {
    ticks = tick + 1;
    const elapsed = onsetTick === null ? null : tick - onsetTick,
      horn = elapsed === 18 || elapsed === 19;
    const step = world.step({
      tick,
      vehicles: [
        {
          vehicleId: 'vehicle-1',
          incarnation: 'inc-1',
          controlMode: 'MANUAL',
          positionM: Object.freeze({
            x: obstaclePose.x - forwardX * distanceM,
            y: 0.8,
            z: obstaclePose.z - forwardZ * distanceM,
          }),
          headingRad,
          speedMps,
          brake: 0,
          steering: 0,
          ...(horn ? { horn: true } : {}),
        },
      ],
      vehiclesComplete: true,
      pedestrians: [pedestrian],
    });
    if (step.stimuli.length > 0 && onsetTick === null) onsetTick = tick;
    distanceM = Math.max(0, distanceM - speedMps * DT);
  }
  const early = createHazardWorld([], { seed: 165 }),
    farPose = lane.obstaclePositionM;
  const earlyStep = early.step({
    tick: 0,
    vehicles: [
      {
        vehicleId: 'vehicle-1',
        incarnation: 'inc-1',
        controlMode: 'MANUAL',
        positionM: Object.freeze({ x: farPose.x - 120, y: 0.8, z: farPose.z }),
        headingRad,
        speedMps: 8,
        brake: 0,
        steering: 0,
        horn: true,
      },
    ],
    vehiclesComplete: true,
    pedestrians: [pedestrian],
  });
  const opportunity = world.getHornOpportunities()[0],
    use = world.getHornUses()[0],
    refusals = world.getHornRefusals();
  return scenario(
    'horn-opportunity',
    'Claxon ca oportunitate cu condiții observabile',
    'Pieton real în traversare, la 15 m: oportunitatea se deschide la debut cu condiții observabile, claxonul din fixture este măsurat, iar un claxon fără oportunitate este refuzat.',
    world,
    ticks,
    [
      check(
        'opportunity-opened-at-onset',
        opportunity !== undefined && opportunity.openedTick === onsetTick,
        `opened tick ${opportunity?.openedTick ?? '—'} vs onset ${String(onsetTick)}`,
      ),
      check(
        'observable-conditions',
        opportunity?.conditions.includes('IMMINENT_HAZARD') === true &&
          opportunity?.conditions.includes('PEDESTRIAN_IN_PATH') === true,
        `conditions ${opportunity?.conditions.join(' + ') ?? 'none'}`,
      ),
      check(
        'horn-measured',
        use !== undefined && use.latencyTicks === 18,
        `horn after ${use?.latencyTicks ?? '—'} ticks`,
      ),
      check(
        'second-press-refused',
        refusals.length === 1 && refusals[0]!.reason === 'OPPORTUNITY_ALREADY_USED',
        refusals.map((entry) => entry.reason).join(', ') || 'none',
      ),
      check(
        'press-without-opportunity-refused',
        earlyStep.hornRefusals.length === 1 &&
          earlyStep.hornRefusals[0]!.reason === 'NO_OPEN_OPPORTUNITY',
        earlyStep.hornRefusals.map((entry) => entry.reason).join(', ') || 'none',
      ),
      check(
        'no-live-channel',
        HAZARD_HORN_CHANNEL.liveInput === 'UNAVAILABLE' &&
          HAZARD_HORN_CHANNEL.requiredForLive.length === 3,
        `live input ${HAZARD_HORN_CHANNEL.liveInput}; requires ${HAZARD_HORN_CHANNEL.requiredForLive.length} additions`,
      ),
      check(
        'opportunity-closed',
        (world.getHornOpportunities()[0]?.closedTick ?? null) !== null,
        `closed tick ${world.getHornOpportunities()[0]?.closedTick ?? '—'}`,
      ),
    ],
  );
}

function obstacleData() {
  const lane = hazardLane(),
    outsideX = 759,
    obstacles = [
      hazardObstacle({ id: 'cone-1', type: 'CONE', halfSizeM: { x: 0.4, y: 0.5, z: 0.4 } }),
      {
        id: 'clip-1',
        type: 'BARRIER',
        positionM: { x: outsideX, y: 0.6, z: 300 },
        halfSizeM: { x: 5, y: 0.6, z: 0.5 },
        edgePolicy: 'CLIP_TO_BOUNDS',
      },
      hazardObstacle({ id: 'cone-1', type: 'CONE' }),
      {
        id: 'outside-1',
        type: 'BLOCK',
        positionM: { x: outsideX, y: 1, z: 300 },
        halfSizeM: { x: 5, y: 1, z: 1 },
      },
      {
        id: 'degenerate-1',
        type: 'DEBRIS',
        positionM: { x: 0, y: 0.2, z: 0 },
        halfSizeM: { x: 0, y: 0.2, z: 0.2 },
      },
      {
        id: 'unknown-type',
        type: 'ROCKET',
        positionM: { x: 100, y: 1, z: 100 },
        halfSizeM: { x: 1, y: 1, z: 1 },
      },
      {
        id: 'bad-schedule',
        type: 'CONE',
        positionM: { x: 100, y: 1, z: 100 },
        halfSizeM: { x: 1, y: 1, z: 1 },
        activeFromTick: -5,
      },
      {
        id: 'bad-policy',
        type: 'CONE',
        positionM: { x: 100, y: 1, z: 100 },
        halfSizeM: { x: 1, y: 1, z: 1 },
        edgePolicy: 'WRAP',
      },
      ...Array.from({ length: 97 }, (_, index) => ({
        id: `capacity-${index}`,
        type: 'CONE',
        positionM: { x: 100 + index, y: 0.5, z: 100 },
        halfSizeM: { x: 0.4, y: 0.5, z: 0.4 },
      })),
    ],
    world = createHazardWorld(obstacles, { seed: 165 }),
    refused = world.getRefusedObstacles(),
    reasons = refused.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.reason] = (counts[entry.reason] ?? 0) + 1;
      return counts;
    }, {}),
    clipped = world.getObstacles().find((entry) => entry.obstacleId === 'clip-1'),
    cone = world.getObstacles().find((entry) => entry.obstacleId === 'cone-1'),
    capacityRefusals = refused.filter((entry) => entry.reason === 'CAPACITY').length;
  return scenario(
    'obstacle-data',
    'Obstacole ca date, cu politici de margine și refuzuri',
    'Pozițiile vin din harta reală, nu din scenă; fiecare intrare invalidă este refuzată cu un motiv închis, iar politica de margine fie refuză, fie decupează.',
    world,
    0,
    [
      check(
        'accepted-count',
        world.getObstacles().length === 96,
        `accepted ${world.getObstacles().length}`,
      ),
      check(
        'duplicate-refused',
        reasons.DUPLICATE_ID === 1,
        `duplicate ${reasons.DUPLICATE_ID ?? 0}`,
      ),
      check(
        'outside-refused',
        reasons.OUTSIDE_MAP_BOUNDS === 1,
        `outside ${reasons.OUTSIDE_MAP_BOUNDS ?? 0}`,
      ),
      check(
        'geometry-refused',
        reasons.INVALID_GEOMETRY === 1,
        `invalid geometry ${reasons.INVALID_GEOMETRY ?? 0}`,
      ),
      check(
        'type-refused',
        reasons.UNKNOWN_TYPE === 1,
        `unknown type ${reasons.UNKNOWN_TYPE ?? 0}`,
      ),
      check(
        'schedule-refused',
        reasons.INVALID_SCHEDULE === 1,
        `invalid schedule ${reasons.INVALID_SCHEDULE ?? 0}`,
      ),
      check(
        'policy-refused',
        reasons.UNKNOWN_EDGE_POLICY === 1,
        `unknown policy ${reasons.UNKNOWN_EDGE_POLICY ?? 0}`,
      ),
      check('capacity-refused', capacityRefusals === 3, `capacity ${capacityRefusals}`),
      check(
        'clip-applied',
        clipped !== undefined &&
          clipped.edge.status === 'CLIPPED' &&
          clipped.edge.overshootM > 0 &&
          clipped.halfSizeM.x < 5,
        clipped
          ? `overshoot ${clipped.edge.overshootM.toFixed(2)} m, half x ${clipped.halfSizeM.x}`
          : 'missing',
      ),
      check(
        'physics-identity',
        cone !== undefined && cone.physics.entityId === cone.obstacleId,
        `entity id ${cone?.physics.entityId ?? '—'}`,
      ),
      check(
        'lane-derived-position',
        cone !== undefined && Math.abs(cone.positionM.x - lane.obstaclePositionM.x) < 1e-9,
        `x ${cone?.positionM.x.toFixed(3)} vs lane ${lane.obstaclePositionM.x.toFixed(3)}`,
      ),
      check(
        'no-scene-constants',
        cone !== undefined && cone.positionM.z !== 0 && cone.positionM.x !== 0,
        'positions come from the lane fixture, not from hardcoded scene coordinates',
      ),
    ],
    {
      stimuli: 0,
      reactions: 0,
      hornOpportunities: 0,
      hornUses: 0,
      hornRefusals: 0,
      refusals: Object.freeze([...refused]),
    },
  );
}

function determinism() {
  const config: Omit<ApproachConfig, 'obstacles' | 'seed'> = {
    startDistanceM: 40,
    initialSpeedMps: 12,
    ticks: 260,
    command: ({ elapsed }) => ({
      brake: elapsed !== null && elapsed >= 45 ? 0.8 : 0,
      steering: 0,
      lateralMps: 0,
    }),
  };
  const run = (seed: number) =>
    runApproach({
      ...config,
      seed,
      obstacles: [hazardObstacle({ activeFromTick: 60, activeJitterTicks: 30 })],
    });
  const first = run(165),
    second = run(165),
    otherSeed = run(166),
    firstDigest = digest(first.world),
    secondDigest = digest(second.world),
    otherDigest = digest(otherSeed.world),
    sameSeed = firstDigest === secondDigest,
    appearTicks = [
      first.world.getObstacles()[0]!.appearTick,
      second.world.getObstacles()[0]!.appearTick,
      otherSeed.world.getObstacles()[0]!.appearTick,
    ];
  return {
    scenario: scenario(
      'determinism',
      'Determinism sub seed explicit',
      'Aceleași intrări și același seed produc aceiași stimuli, aceleași momente și aceeași amprentă; alt seed schimbă doar momentul apariției, pentru că jitter-ul este derivat din seed.',
      first.world,
      first.ticks,
      [
        check('same-seed-digest', sameSeed, `digest ${firstDigest.slice(0, 16)}…`),
        check(
          'same-seed-appearance',
          appearTicks[0] === appearTicks[1],
          `appear ticks ${appearTicks[0]} / ${appearTicks[1]}`,
        ),
        check(
          'seed-drives-appearance',
          appearTicks[0] !== appearTicks[2],
          `seed 165 → ${appearTicks[0]}, seed 166 → ${appearTicks[2]}`,
        ),
        check(
          'different-seed-digest',
          firstDigest !== otherDigest,
          `digests differ: ${firstDigest !== otherDigest}`,
        ),
      ],
    ),
    digest: firstDigest,
    identical: sameSeed,
    appearTicks,
    digests: [
      { seed: 165, digest: firstDigest },
      { seed: 166, digest: otherDigest },
    ],
  };
}

export async function runHazardReport(): Promise<HazardReport> {
  const sudden = suddenObstacle(),
    suddenStimulusId = sudden.encounters[0]?.stimulusId,
    delayed = delayedReaction(suddenStimulusId),
    evasive = evasiveManoeuvre(),
    physics = await samePhysics(),
    horn = hornOpportunity(),
    data = obstacleData(),
    repeat = determinism(),
    scenarios = [sudden, delayed, evasive, physics, horn, data, repeat.scenario],
    costWorld = createHazardWorld([hazardObstacle()], { seed: 165 }),
    costSteps = 600,
    lane = hazardLane(),
    headingRad = lane.headingRad,
    forwardX = Math.cos(headingRad),
    forwardZ = Math.sin(headingRad),
    obstaclePose = lane.obstaclePositionM;
  for (let tick = 0; tick < costSteps; tick += 1) {
    const distanceM = 40 - tick * 0.2;
    costWorld.step({
      tick,
      vehicles: [
        {
          vehicleId: 'cost-vehicle',
          incarnation: 'inc-cost',
          controlMode: 'AUTO',
          positionM: Object.freeze({
            x: obstaclePose.x - forwardX * Math.max(0, distanceM),
            y: 0.8,
            z: obstaclePose.z - forwardZ * Math.max(0, distanceM),
          }),
          headingRad,
          speedMps: 12,
          brake: 0,
          steering: 0,
        },
      ],
      vehiclesComplete: true,
    });
  }
  const costStats = costWorld.getStats();
  costWorld.dispose();
  const summary = Object.freeze({
      scenarios: scenarios.length,
      passed: scenarios.filter((entry) => entry.pass).length,
      pass: scenarios.every((entry) => entry.pass),
      stimuli: scenarios.reduce((sum, entry) => sum + entry.stimuli, 0),
      reactions: scenarios.reduce((sum, entry) => sum + entry.reactions, 0),
      brakeReactions: scenarios.reduce((sum, entry) => sum + entry.counts.brakeReactions, 0),
      steerReactions: scenarios.reduce((sum, entry) => sum + entry.counts.steerReactions, 0),
      hornOpportunities: scenarios.reduce((sum, entry) => sum + entry.hornOpportunities, 0),
      hornUses: scenarios.reduce((sum, entry) => sum + entry.hornUses, 0),
      hornRefusals: scenarios.reduce((sum, entry) => sum + entry.hornRefusals, 0),
      contacts: scenarios.reduce((sum, entry) => sum + entry.counts.contacts, 0),
      stopped: scenarios.reduce((sum, entry) => sum + entry.counts.stopped, 0),
      passedClear: scenarios.reduce((sum, entry) => sum + entry.counts.passedClear, 0),
      passedClose: scenarios.reduce((sum, entry) => sum + entry.counts.passedClose, 0),
      released: scenarios.reduce((sum, entry) => sum + entry.counts.released, 0),
      pending: scenarios.reduce((sum, entry) => sum + entry.counts.pending, 0),
    }),
    refused = (data.refusals ?? []).slice(),
    refuseReasons = refused.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.reason] = (counts[entry.reason] ?? 0) + 1;
      return counts;
    }, {}),
    dataWorld = createHazardWorld([hazardObstacle({ activeFromTick: 60, activeJitterTicks: 30 })], {
      seed: 165,
    }),
    appearTick = dataWorld.getObstacles()[0]!.appearTick;
  dataWorld.dispose();
  return Object.freeze({
    generatedBy: 'scripts/run-hazard-report.mjs',
    command: 'npm run hazards:report',
    contract: '165-hazards-v1',
    oracleRule:
      'Un stimul există numai când pericolul este observabil (în rază și în conul frontal); o reacție este numai un front după debut; o trecere este „curată” numai dacă distanța minimă măsurată depășește marja, iar un contact există numai ca fapt al proprietarului coliziunilor.',
    fixture: Object.freeze({
      mapId: createHazardWorld([]).mapId,
      laneId: lane.laneId,
      laneLengthM: lane.lengthM,
      obstacleLongitudinalM: HAZARD_OBSTACLE_M,
      obstacles: data.counts.obstacles,
      refusedObstacles: data.counts.refusedObstacles,
      refuseReasons: Object.freeze(refuseReasons),
      seed: 165,
      appearTick,
    }),
    scenarios: Object.freeze(scenarios),
    summary,
    determinism: Object.freeze({
      runs: 2,
      identical: repeat.identical,
      digest: repeat.digest,
      appearTicks: Object.freeze(repeat.appearTicks),
      digestBySeed: Object.freeze(repeat.digests),
    }),
    cost: Object.freeze({
      scenarioId: 'cost-600-steps',
      steps: costStats.steps,
      hazardEvaluations: costStats.evaluationCost.hazardEvaluations,
      vehicleEvaluations: costStats.evaluationCost.vehicleEvaluations,
      peakHazardsPerStep: costStats.evaluationCost.peakHazardsPerStep,
      peakVehiclesPerStep: costStats.evaluationCost.peakVehiclesPerStep,
    }),
    limitations: Object.freeze([
      'Nivel determinist în Node: fără browser, GPU sau input uman. Mișcarea vehiculului este scriptată de fixture în scenariile deterministe; numai scenariul „physical-same-physics” rulează fizica Rapier reală.',
      'Claxonul nu are canal live: VehicleCommand nu expune horn, deci oportunitatea și apăsarea sunt dovedite prin fixture controlat; pentru live este nevoie de un keybinding, un câmp/eveniment pe VehicleCommand și feedback audio/HUD.',
      'Pietonii din scenariul de claxon sunt un fapt de fixture (poziție și stare); populația reală rămâne a contractului 164. Modulul nu detectează fizic impactul și nu inventează contacte.',
      'Politica de margine este plană (X/Z), derivată din bounds-ul hărții; nu modelează înălțimea clădirilor sau trotuarele.',
      'Pragurile numerice (rază, con, frână, virare, TTC de claxon) sunt candidate de design raportate explicit, nu valori de calibrare în catalogul de parametri.',
      'Timpul local de generare nu este o măsurătoare de performanță hardware: PBI 165 nu are performance_checks, iar costul raportat este structural.',
    ]),
  } as HazardReport);
}
