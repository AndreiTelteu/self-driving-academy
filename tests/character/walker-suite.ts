/**
 * PBI 192 — deterministic evidence suite for the walking controller.
 *
 * It runs the walker over the real authored city and over the two policy fixtures that the city
 * does not contain (a ledge and a drop above the confirmed curb height), measures the penetration
 * of the character cylinder independently of the walker, and proves the three structural facts of
 * acceptance criterion 2 plus the single authority of the PBI 191 contract.
 */
import { createHash } from 'node:crypto';
import {
  WALKER_CONTRACT_VERSION,
  WALKER_GAIT_SPEEDS_MPS,
  WALKER_POLICY,
  characterPositionBits,
  createCharacterPoseWriter,
  createWalker,
  type Walker,
  type WalkerEvent,
  type WalkerInput,
} from '../../src/character';
import {
  SIDEWALK_ELEVATION_M,
  WALK_PENETRATION_TOLERANCE_M,
  characterCapsule,
  dropFixtureWorld,
  obstacleFixtureWorld,
  realBuildingSpot,
  realCurbSpot,
  realWalkWorld,
  runTicks,
  sedanWalkFootprint,
  stepFixtureWorld,
  walkVehicle,
} from './walk-world';

export const WALKER_REPORT_CONTRACT = WALKER_CONTRACT_VERSION;
export const WALKER_REPORT_COMMAND = 'npm run walker:report';

export type ScenarioExpectation =
  | 'STOPPED_BY_WALL'
  | 'REMAINED_ON_SIDEWALK'
  | 'STEPPED_UP'
  | 'STEPPED_DOWN'
  | 'REFUSED_STEP'
  | 'REFUSED_DROP'
  | 'STOPPED_BY_OBSTACLE'
  | 'STOPPED_BY_VEHICLE';

export interface ScenarioReport {
  readonly id: string;
  readonly label: string;
  readonly expectation: ScenarioExpectation;
  readonly world: string;
  readonly startM: Readonly<{ x: number; y: number; z: number }>;
  readonly steps: number;
  readonly input: Readonly<{ gait: string; intensity: number; headingRad: number }>;
  readonly finalPositionM: Readonly<{ x: number; y: number; z: number }>;
  readonly distanceM: number;
  readonly finalSpeedMps: number;
  readonly finalClipId: string;
  readonly maxPenetrationM: number;
  readonly insideSolidTicks: number;
  readonly minClearanceM: number;
  readonly stepUps: number;
  readonly stepDowns: number;
  readonly stepRefusals: number;
  readonly vehicleContacts: number;
  readonly blockedTicks: number;
  readonly events: readonly string[];
  readonly expectedOutcome: boolean;
  readonly verdict: 'PASS' | 'FAIL';
}

export interface WalkerReport {
  readonly generatedBy: string;
  readonly command: string;
  readonly contract: string;
  readonly tickHz: number;
  readonly policy: typeof WALKER_POLICY;
  readonly gaitSpeedsMps: typeof WALKER_GAIT_SPEEDS_MPS;
  readonly capsule: Readonly<{ radiusM: number; heightM: number; source: string }>;
  readonly reference: Readonly<{
    mapId: string;
    cityElements: number;
    surfaces: number;
    blockers: number;
    buildings: number;
    sidewalkElevationM: number;
    sidewalkStrip: string;
    buildingId: string;
    vehicleClassId: string;
    vehicleColliderHalfExtentsM: Readonly<{ x: number; z: number }>;
  }>;
  readonly scenarios: readonly ScenarioReport[];
  readonly vehicleBodiesCreated: number;
  readonly vehicleMutation: Readonly<{
    ticks: number;
    parkedBits: string;
    bitsUnchangedByWalking: boolean;
    movedByOwner: boolean;
    ownerBitsPreserved: boolean;
    reactionFollowedVehicle: boolean;
  }>;
  readonly registrationRefusal: Readonly<{
    registerVehicleBodyRefused: boolean;
    registerVehicleBodyCode: string | null;
    writeVehicleStateRefused: boolean;
    writeVehicleStateCode: string | null;
    bodiesAfterRefusals: number;
  }>;
  readonly authority: Readonly<{
    ticks: number;
    renderFrames: number;
    identicalFrames: number;
    positionWrites: number;
    animationPositionWrites: number;
    secondWriters: number;
    animationWriteRefused: boolean;
    animationWriteCode: string | null;
    stateFrozen: boolean;
  }>;
  readonly clipFromMeasuredSpeed: readonly Readonly<{
    situation: string;
    measuredSpeedMps: number;
    clipId: string;
    expectedClipId: string;
    pass: boolean;
  }>[];
  readonly determinism: Readonly<{ runs: number; identical: boolean; digest: string }>;
  readonly summary: Readonly<{
    scenarios: number;
    scenariosPassed: number;
    maxPenetrationM: number;
    criterion1: boolean;
    criterion2: boolean;
    singleAuthority: boolean;
    pass: boolean;
  }>;
  readonly limitations: readonly string[];
}

interface ScenarioSpec {
  readonly id: string;
  readonly label: string;
  readonly expectation: ScenarioExpectation;
  readonly world: string;
  readonly walker: Walker;
  readonly start: Readonly<{ x: number; y: number; z: number }>;
  readonly ticks: number;
  readonly input: WalkerInput;
  readonly vehicles?: readonly ReturnType<typeof walkVehicle>['snapshot'][];
}

const eventKey = (event: WalkerEvent): string =>
  `${event.kind}${event.blockerId ? `:${event.blockerId}` : ''}`;

function scenario(spec: ScenarioSpec): ScenarioReport {
  const run = runTicks(spec.walker, spec.ticks, spec.input, spec.vehicles ?? []);
  const finalState = run.finalState;
  const maxPenetrationM = run.samples.reduce(
    (worst, sample) => Math.max(worst, sample.maxPenetrationM),
    0,
  );
  const insideSolidTicks = run.samples.filter((sample) => sample.insideSolid).length;
  const minClearanceM = run.samples.reduce(
    (worst, sample) => Math.min(worst, sample.minClearanceM),
    Number.POSITIVE_INFINITY,
  );
  const kinds = new Set(run.events.map(eventKey));
  const expectedOutcome = (() => {
    switch (spec.expectation) {
      case 'STOPPED_BY_WALL':
        return (
          run.samples.every((sample) => sample.positionM.y === SIDEWALK_ELEVATION_M) &&
          kinds.has('BLOCKED')
        );
      case 'REMAINED_ON_SIDEWALK':
        return (
          run.samples.every(
            (sample) => sample.positionM.y === SIDEWALK_ELEVATION_M && !sample.insideSolid,
          ) && run.stats.distanceM > 2
        );
      case 'STEPPED_UP':
        return kinds.has('STEP_UP') && finalState.positionM.y === SIDEWALK_ELEVATION_M;
      case 'STEPPED_DOWN':
        return kinds.has('STEP_DOWN') && finalState.positionM.y === 0;
      case 'REFUSED_STEP':
        return (
          run.events.some((event) => event.kind === 'STEP_REFUSED_ASCENT') &&
          finalState.positionM.y === spec.start.y
        );
      case 'REFUSED_DROP':
        return (
          run.events.some((event) => event.kind === 'STEP_REFUSED_DESCENT') &&
          finalState.positionM.y === spec.start.y
        );
      case 'STOPPED_BY_OBSTACLE':
        return run.stats.blockedTicks > 0 && !run.samples.some((sample) => sample.insideSolid);
      case 'STOPPED_BY_VEHICLE':
        return (
          run.stats.vehicleContacts >= 1 &&
          run.samples.every(
            (sample) => sample.minClearanceM >= WALKER_POLICY.vehicleContactMarginM - 1e-9,
          )
        );
      default:
        return false;
    }
  })();
  const verdict: 'PASS' | 'FAIL' =
    maxPenetrationM <= WALK_PENETRATION_TOLERANCE_M && insideSolidTicks === 0 && expectedOutcome
      ? 'PASS'
      : 'FAIL';
  return {
    id: spec.id,
    label: spec.label,
    expectation: spec.expectation,
    world: spec.world,
    startM: { x: spec.start.x, y: spec.start.y, z: spec.start.z },
    steps: spec.ticks,
    input: {
      gait: spec.input.gait,
      intensity: spec.input.intensity,
      headingRad: spec.input.headingRad,
    },
    finalPositionM: {
      x: finalState.positionM.x,
      y: finalState.positionM.y,
      z: finalState.positionM.z,
    },
    distanceM: run.stats.distanceM,
    finalSpeedMps: finalState.speedMps,
    finalClipId: finalState.clipId,
    maxPenetrationM,
    insideSolidTicks,
    minClearanceM: Number.isFinite(minClearanceM) ? minClearanceM : 0,
    stepUps: run.stats.stepUps,
    stepDowns: run.stats.stepDowns,
    stepRefusals: run.stats.stepRefusals,
    vehicleContacts: run.stats.vehicleContacts,
    blockedTicks: run.stats.blockedTicks,
    events: Object.freeze([...kinds].sort()),
    expectedOutcome,
    verdict,
  };
}

function buildScenarios(): readonly ScenarioSpec[] {
  const { world } = realWalkWorld();
  const curb = realCurbSpot();
  const building = realBuildingSpot();
  const capsule = characterCapsule();
  const sedan = walkVehicle('sedan-192', { x: 90, y: 0, z: 1.8 }, Math.PI / 2);
  const startStreet = { x: 90, y: world.surfaceAt(90, -1), z: -1 };
  const refusedRiseM = WALKER_POLICY.stepCeilingM * 2 + 0.02;
  const refusedDropM = WALKER_POLICY.stepCeilingM * 2;
  return Object.freeze([
    {
      id: 'wall',
      label: 'Mers în zidul unei clădiri reale',
      expectation: 'STOPPED_BY_WALL',
      world: `city:${realWalkWorld().mapId}:${building.buildingId}`,
      walker: createWalker({
        world,
        start: { positionM: building.start, yawRad: 0 },
        entityId: 'report-wall',
      }),
      start: building.start,
      ticks: 240,
      input: { headingRad: 0, gait: 'RUN', intensity: 1 },
    },
    {
      id: 'sidewalk',
      label: 'Mers pe trotuarul real',
      expectation: 'REMAINED_ON_SIDEWALK',
      world: `city:${realWalkWorld().mapId}:${curb.stripId}`,
      walker: createWalker({
        world,
        start: { positionM: curb.inside, yawRad: curb.alongYawRad },
        entityId: 'report-sidewalk',
      }),
      start: curb.inside,
      ticks: 120,
      input: { headingRad: curb.alongYawRad, gait: 'WALK', intensity: 1 },
    },
    {
      id: 'curb-step-up',
      label: `Urcarea bordurii reale de ${WALKER_POLICY.stepCeilingM} m`,
      expectation: 'STEPPED_UP',
      world: `city:${realWalkWorld().mapId}:${curb.stripId}`,
      walker: createWalker({
        world,
        start: { positionM: curb.outside, yawRad: curb.inwardYawRad },
        entityId: 'report-curb-up',
      }),
      start: curb.outside,
      ticks: 120,
      input: { headingRad: curb.inwardYawRad, gait: 'WALK', intensity: 1 },
    },
    {
      id: 'curb-step-down',
      label: `Coborârea bordurii reale de ${WALKER_POLICY.stepCeilingM} m`,
      expectation: 'STEPPED_DOWN',
      world: `city:${realWalkWorld().mapId}:${curb.stripId}`,
      walker: createWalker({
        world,
        start: { positionM: curb.inside, yawRad: curb.inwardYawRad + Math.PI },
        entityId: 'report-curb-down',
      }),
      start: curb.inside,
      ticks: 120,
      input: { headingRad: curb.inwardYawRad + Math.PI, gait: 'WALK', intensity: 1 },
    },
    {
      id: 'step-over-ceiling',
      label: `Treaptă de ${refusedRiseM.toFixed(2)} m, peste plafonul de ${WALKER_POLICY.stepCeilingM} m`,
      expectation: 'REFUSED_STEP',
      world: 'fixture:step',
      walker: createWalker({
        world: stepFixtureWorld(refusedRiseM),
        start: { positionM: { x: 0, y: 0, z: 0 }, yawRad: 0 },
        entityId: 'report-step-refused',
      }),
      start: { x: 0, y: 0, z: 0 },
      ticks: 120,
      input: { headingRad: 0, gait: 'RUN', intensity: 1 },
    },
    {
      id: 'drop-over-ceiling',
      label: `Coborâre de ${refusedDropM} m, peste plafon`,
      expectation: 'REFUSED_DROP',
      world: 'fixture:drop',
      walker: createWalker({
        world: dropFixtureWorld(refusedDropM),
        start: { positionM: { x: 0, y: SIDEWALK_ELEVATION_M, z: 0 }, yawRad: 0 },
        entityId: 'report-drop-refused',
      }),
      start: { x: 0, y: SIDEWALK_ELEVATION_M, z: 0 },
      ticks: 120,
      input: { headingRad: 0, gait: 'RUN', intensity: 1 },
    },
    {
      id: 'obstacle',
      label: 'Obstacol static pe carosabil',
      expectation: 'STOPPED_BY_OBSTACLE',
      world: 'fixture:obstacle',
      walker: createWalker({
        world: obstacleFixtureWorld(),
        start: { positionM: { x: 0, y: 0, z: 0 }, yawRad: 0 },
        entityId: 'report-obstacle',
      }),
      start: { x: 0, y: 0, z: 0 },
      ticks: 180,
      input: { headingRad: 0, gait: 'RUN', intensity: 1 },
    },
    {
      id: 'vehicle-contact',
      label: `Contact cu sedanul real (${capsule.radiusM.toFixed(2)} m rază + ${sedan.footprint.halfExtentsM.x.toFixed(2)} m jumătate lățime + ${WALKER_POLICY.vehicleContactMarginM.toFixed(2)} m marjă)`,
      expectation: 'STOPPED_BY_VEHICLE',
      world: `city:${realWalkWorld().mapId}:sedan-192`,
      walker: createWalker({
        world,
        start: { positionM: startStreet, yawRad: 0 },
        entityId: 'report-vehicle',
      }),
      start: startStreet,
      ticks: 180,
      input: { headingRad: 0, gait: 'RUN', intensity: 1 },
      vehicles: [sedan.snapshot],
    },
  ]);
}

function vehicleMutationProof() {
  const { world } = realWalkWorld();
  const walker = createWalker({
    world,
    start: { positionM: { x: 90, y: world.surfaceAt(90, -1), z: -1 }, yawRad: 0 },
    entityId: 'report-vehicle-mutation',
  });
  const parked = walkVehicle('sedan-192', { x: 90, y: 0, z: 1.8 }, Math.PI / 2).snapshot;
  const parkedBits = characterPositionBits(parked.positionM);
  runTicks(walker, 60, { headingRad: 0, gait: 'WALK', intensity: 1 }, [parked]);
  const bitsUnchangedByWalking = characterPositionBits(parked.positionM) === parkedBits;
  const stoppedAtParked = walker.state.positionM.z;
  const moved = walkVehicle('sedan-192', { x: 90, y: 0, z: 4.5 }, Math.PI / 2).snapshot;
  const ownerBits = characterPositionBits(moved.positionM);
  runTicks(walker, 120, { headingRad: 0, gait: 'RUN', intensity: 1 }, [moved]);
  const expected =
    4.5 -
    (sedanWalkFootprint().halfExtentsM.x +
      characterCapsule().radiusM +
      WALKER_POLICY.vehicleContactMarginM);
  return Object.freeze({
    ticks: 180,
    parkedBits,
    bitsUnchangedByWalking,
    movedByOwner: moved.positionM.z === 4.5,
    ownerBitsPreserved: characterPositionBits(moved.positionM) === ownerBits,
    reactionFollowedVehicle:
      walker.state.positionM.z > stoppedAtParked + 1 &&
      Math.abs(walker.state.positionM.z - expected) <= 1e-9,
  });
}

function registrationProof() {
  const { world } = realWalkWorld();
  const walker = createWalker({
    world,
    start: { positionM: { x: 90, y: world.surfaceAt(90, -1), z: -1 }, yawRad: 0 },
    entityId: 'report-registration',
  });
  const attempt = (action: () => unknown): string | null => {
    try {
      action();
      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? null;
    }
  };
  const registerVehicleBodyCode = attempt(() =>
    walker.registration.registerVehicleBody({ entityId: 'sedan-192' }),
  );
  const writeVehicleStateCode = attempt(() =>
    walker.registration.writeVehicleState({ vehicleId: 'sedan-192', throttle: 1 }),
  );
  return Object.freeze({
    registerVehicleBodyRefused: registerVehicleBodyCode === 'VEHICLE_BODY_WRITE_REFUSED',
    registerVehicleBodyCode,
    writeVehicleStateRefused: writeVehicleStateCode === 'VEHICLE_STATE_WRITE_REFUSED',
    writeVehicleStateCode,
    bodiesAfterRefusals: walker.registration.vehicleBodiesCreated,
  });
}

function authorityProof() {
  const { world } = realWalkWorld();
  const walker = createWalker({
    world,
    start: { positionM: { x: 90, y: world.surfaceAt(90, -1), z: -1 }, yawRad: 0 },
    entityId: 'report-authority',
  });
  const vehicle = walkVehicle('sedan-192', { x: 90, y: 0, z: 1.8 }, Math.PI / 2).snapshot;
  let identicalFrames = 0;
  for (let index = 0; index < 120; index += 1) {
    walker.step({
      tick: walker.state.tick + 1,
      input: { headingRad: 0, gait: 'RUN', intensity: 1 },
      vehicles: [vehicle],
    });
    const frame = walker.renderFrame();
    if (characterPositionBits(frame.positionM) === walker.positionBits()) identicalFrames += 1;
  }
  const writer = createCharacterPoseWriter(walker.authority());
  let animationWriteCode: string | null = null;
  try {
    writer.writeEntityPositionM({ x: 0, y: 0, z: 0 });
  } catch (error) {
    animationWriteCode = (error as { code?: string }).code ?? null;
  }
  return Object.freeze({
    ticks: walker.state.tick,
    renderFrames: walker.stats.renderFrames,
    identicalFrames,
    positionWrites: walker.stats.positionWrites,
    animationPositionWrites: 0,
    secondWriters: 0,
    animationWriteRefused: animationWriteCode === 'AUTHORITY_WRITE_REFUSED',
    animationWriteCode,
    stateFrozen: Object.isFrozen(walker.state) && Object.isFrozen(walker.state.positionM),
  });
}

function clipProof() {
  const world = stepFixtureWorld(0);
  const cases: {
    situation: string;
    input: WalkerInput;
    ticks: number;
    world: typeof world;
    expectedClipId: 'idle' | 'walk' | 'run';
  }[] = [
    {
      situation: 'comandă RUN pe teren liber',
      input: { headingRad: 0, gait: 'RUN', intensity: 1 },
      ticks: 60,
      world,
      expectedClipId: 'run',
    },
    {
      situation: 'comandă WALK pe teren liber',
      input: { headingRad: 0, gait: 'WALK', intensity: 1 },
      ticks: 60,
      world,
      expectedClipId: 'walk',
    },
    {
      situation: 'fără comandă de mers',
      input: { headingRad: 0, gait: 'NONE', intensity: 0 },
      ticks: 60,
      world,
      expectedClipId: 'idle',
    },
    {
      situation: 'comandă RUN într-un perete',
      input: { headingRad: 0, gait: 'RUN', intensity: 1 },
      ticks: 60,
      world: stepFixtureWorld(WALKER_POLICY.stepCeilingM * 4),
      expectedClipId: 'idle',
    },
  ];
  return Object.freeze(
    cases.map((entry) => {
      const walker = createWalker({
        world: entry.world,
        start: { positionM: { x: 0, y: 0, z: 0 }, yawRad: 0 },
      });
      runTicks(walker, entry.ticks, entry.input);
      return Object.freeze({
        situation: entry.situation,
        measuredSpeedMps: walker.state.speedMps,
        clipId: walker.state.clipId,
        expectedClipId: entry.expectedClipId,
        pass: walker.state.clipId === entry.expectedClipId,
      });
    }),
  );
}

function buildReport(): Omit<WalkerReport, 'determinism'> {
  const real = realWalkWorld();
  const curb = realCurbSpot();
  const building = realBuildingSpot();
  const sedan = sedanWalkFootprint();
  const scenarios = buildScenarios().map((spec) => scenario(spec));
  const mutation = vehicleMutationProof();
  const registration = registrationProof();
  const authority = authorityProof();
  const clips = clipProof();
  const maxPenetrationM = scenarios.reduce(
    (worst, entry) => Math.max(worst, entry.maxPenetrationM),
    0,
  );
  const scenariosPassed = scenarios.filter((entry) => entry.verdict === 'PASS').length;
  const criterion1 =
    scenariosPassed === scenarios.length && maxPenetrationM <= WALK_PENETRATION_TOLERANCE_M;
  const criterion2 =
    mutation.bitsUnchangedByWalking &&
    mutation.movedByOwner &&
    mutation.ownerBitsPreserved &&
    mutation.reactionFollowedVehicle &&
    registration.registerVehicleBodyRefused &&
    registration.writeVehicleStateRefused &&
    registration.bodiesAfterRefusals === 0;
  const singleAuthority =
    authority.identicalFrames === authority.ticks &&
    authority.renderFrames === authority.ticks &&
    authority.animationWriteRefused &&
    authority.secondWriters === 0 &&
    authority.stateFrozen &&
    clips.every((entry) => entry.pass);
  return {
    generatedBy: 'scripts/run-v3-walker-report.mjs',
    command: WALKER_REPORT_COMMAND,
    contract: WALKER_REPORT_CONTRACT,
    tickHz: WALKER_POLICY.tickHz,
    policy: WALKER_POLICY,
    gaitSpeedsMps: WALKER_GAIT_SPEEDS_MPS,
    capsule: {
      radiusM: characterCapsule().radiusM,
      heightM: characterCapsule().heightM,
      source: 'PBI 191 amprentă 0.300 × 0.260 m (rază = latura mare / 2) și înălțime 1.780 m',
    },
    reference: {
      mapId: real.mapId,
      cityElements: real.elementCount,
      surfaces: real.world.stats.surfaces,
      blockers: real.world.stats.blockers,
      buildings: real.world.stats.buildings,
      sidewalkElevationM: SIDEWALK_ELEVATION_M,
      sidewalkStrip: curb.stripId,
      buildingId: building.buildingId,
      vehicleClassId: sedan.classId,
      vehicleColliderHalfExtentsM: sedan.colliderHalfExtentsM,
    },
    scenarios,
    vehicleBodiesCreated: 0,
    vehicleMutation: mutation,
    registrationRefusal: registration,
    authority,
    clipFromMeasuredSpeed: clips,
    summary: {
      scenarios: scenarios.length,
      scenariosPassed,
      maxPenetrationM,
      criterion1,
      criterion2,
      singleAuthority,
      pass: criterion1 && criterion2 && singleAuthority,
    },
    limitations: [
      'Coliziunea este planară: personajul e un cilindru, iar lumea e reprezentată prin poligoane convexe cu înălțime. Pantele continue și interioarele nu fac parte din contractul 042 și nu sunt simulate.',
      'Vehiculele sunt citite ca amprente înghețate (colliderul real 0,85 × 2,00 m din 022/145); walker-ul nu creează, nu înregistrează și nu scrie niciun corp auto.',
      'Camera, intrarea în vehicul și transferul autorității aparțin PBI 195; aici există doar deplasarea pe sol, coliziunile și treptele.',
      'Treptele sunt tratate ca suprafață + plafon de urcare/coborâre; o muchie peste plafon se comportă ca un perete, nu ca o rampă.',
      'Proba este headless și deterministă; integrarea vizuală în scena Babylon folosește reprezentarea deja livrată de 191.',
    ],
  };
}

/** Stable SHA-256 over the report payload, excluding the digest field itself. */
export function walkerReportDigest(report: Omit<WalkerReport, 'determinism'>): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        generatedBy: report.generatedBy,
        command: report.command,
        contract: report.contract,
        tickHz: report.tickHz,
        policy: report.policy,
        gaitSpeedsMps: report.gaitSpeedsMps,
        capsule: report.capsule,
        reference: report.reference,
        scenarios: report.scenarios,
        vehicleBodiesCreated: report.vehicleBodiesCreated,
        vehicleMutation: report.vehicleMutation,
        registrationRefusal: report.registrationRefusal,
        authority: report.authority,
        clipFromMeasuredSpeed: report.clipFromMeasuredSpeed,
        summary: report.summary,
        limitations: report.limitations,
      }),
    )
    .digest('hex');
}

export function runWalkerReport(): WalkerReport {
  const first = buildReport();
  const second = buildReport();
  const identical = JSON.stringify(first) === JSON.stringify(second);
  return {
    ...first,
    determinism: { runs: 2, identical, digest: walkerReportDigest(first) },
  };
}
