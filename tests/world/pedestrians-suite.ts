import { createHash } from 'node:crypto';
import type {
  PedestrianContactFact,
  PedestrianInspection,
  PedestrianNetwork,
  PedestrianRate,
  PedestrianSnapshot,
  PedestrianState,
  PedestrianVehicleFact,
  Pedestrians,
} from '../../src/world';
import { PEDESTRIAN_STATES } from '../../src/world';
import {
  createPedestrianWorld,
  pedestrianTarget,
  vehicleBefore,
  type PedestrianTarget,
} from './pedestrians-fixture';

const DT = 1 / 60;

interface VehicleState {
  distance: number;
  speed: number;
}

interface Frame {
  readonly vehicles: readonly PedestrianVehicleFact[];
  readonly vehiclesComplete: boolean;
  readonly contacts?: readonly PedestrianContactFact[];
}

interface RunContext {
  readonly tick: number;
  readonly world: Pedestrians;
  readonly target: PedestrianTarget;
  readonly pedestrianId: string;
  readonly vehicle: VehicleState;
  readonly collisions: { tick: number | null };
}

interface ScenarioDefinition {
  readonly scenarioId: string;
  readonly title: string;
  readonly description: string;
  readonly ticks: number;
  readonly pedestriansPerCrosswalk: number;
  readonly seed: number;
  readonly frame: (context: RunContext) => Frame;
  readonly check: (result: ScenarioResult) => readonly ScenarioCheck[];
}

export interface ScenarioCheck {
  readonly id: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface ScenarioResult {
  readonly scenarioId: string;
  readonly title: string;
  readonly description: string;
  readonly ticks: number;
  readonly pedestrians: number;
  readonly finalStates: Readonly<Record<PedestrianState, number>>;
  readonly counts: PedestrianInspection['counts'];
  readonly coverage: PedestrianInspection['coverage'];
  readonly denominators: Readonly<Record<'yieldRate' | 'crossingCompletionRate', PedestrianRate>>;
  readonly gaps: readonly string[];
  readonly conflicts: readonly Readonly<{
    vehicleId: string;
    tick: number;
    distanceM: number;
    speedMps: number;
    timeToConflictS: number | null;
    crossingRemainingS: number;
    outcome: string;
    stopTick: number | null;
    stopDistanceM: number | null;
    minimumDistanceM: number;
    maximumSpeedMps: number;
  }>[];
  readonly stops: readonly Readonly<{
    tick: number;
    distanceM: number;
    speedMps: number;
    duringCrossing: boolean;
    pedestrianId: string | null;
  }>[];
  readonly collisions: readonly Readonly<{
    tick: number;
    vehicleId: string;
    state: PedestrianState;
    speedMps: number;
  }>[];
  readonly targetPedestrian: Readonly<{
    pedestrianId: string;
    finalState: PedestrianState | null;
    withdrawalReason: string | null;
    crossingProgress: number | null;
  }>;
  readonly checks: readonly ScenarioCheck[];
  readonly pass: boolean;
}

export interface PedestrianScenarioReport {
  readonly generatedBy: string;
  readonly command: string;
  readonly contract: string;
  readonly oracleRule: string;
  readonly fixture: PedestrianNetwork & {
    readonly refusedReasons: Readonly<Record<string, number>>;
    readonly pedestriansPerCrosswalk: number;
  };
  readonly target: Readonly<{
    crosswalkId: string;
    laneId: string;
    longitudinalM: number;
    laneLengthM: number;
    crossingLengthM: number;
  }>;
  readonly scenarios: readonly ScenarioResult[];
  readonly summary: Readonly<{
    scenarios: number;
    passed: number;
    pedestrians: number;
    crossingsStarted: number;
    crossingsCompleted: number;
    freeCrossings: number;
    yieldedCrossings: number;
    crossingsWithoutYield: number;
    unobservedCrossings: number;
    conflictRecords: number;
    stopEvents: number;
    yieldStopEvents: number;
    collisions: number;
    pass: boolean;
  }>;
  readonly refusals: readonly Readonly<{
    case: string;
    refused: boolean;
    message: string;
  }>[];
  readonly determinism: Readonly<{
    runs: number;
    digest: string;
    identical: boolean;
  }>;
  readonly cost: Readonly<{
    steps: number;
    pedestrianEvaluations: number;
    vehicleEvaluations: number;
    peakPedestriansPerStep: number;
    peakVehiclesPerStep: number;
  }>;
  readonly limitations: readonly string[];
}

function digestOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function statesOf(pedestrians: readonly PedestrianSnapshot[]) {
  const counts = Object.fromEntries(PEDESTRIAN_STATES.map((state) => [state, 0])) as Record<
    PedestrianState,
    number
  >;
  for (const pedestrian of pedestrians) counts[pedestrian.state] += 1;
  return Object.freeze(counts);
}

function summaryOf(inspection: PedestrianInspection) {
  return {
    counts: inspection.counts,
    coverage: inspection.coverage,
    denominators: inspection.denominators,
    gaps: Object.freeze(inspection.gaps.map((gap) => gap.id)),
  };
}

function runScenario(definition: ScenarioDefinition, target: PedestrianTarget): ScenarioResult {
  const world = createPedestrianWorld({
    seed: definition.seed,
    pedestriansPerCrosswalk: definition.pedestriansPerCrosswalk,
  });
  const pedestrianId = world
    .getPedestrians()
    .find((pedestrian) => pedestrian.crosswalkId === target.crosswalkId)!.pedestrianId;
  const vehicle: VehicleState = { distance: 45, speed: 12 };
  const collisions = { tick: null as number | null };
  for (let tick = 0; tick < definition.ticks; tick += 1) {
    const frame = definition.frame({ tick, world, target, pedestrianId, vehicle, collisions });
    world.step({
      tick,
      vehicles: frame.vehicles,
      vehiclesComplete: frame.vehiclesComplete,
      contacts: frame.contacts ?? [],
    });
  }
  const inspection = world.getInspection();
  const targetPedestrian = world.getPedestrian(pedestrianId);
  const result = {
    scenarioId: definition.scenarioId,
    title: definition.title,
    description: definition.description,
    ticks: definition.ticks,
    pedestrians: world.getPedestrians().length,
    finalStates: statesOf(world.getPedestrians()),
    ...summaryOf(inspection),
    conflicts: Object.freeze(
      world
        .getConflicts()
        .filter((conflict) => conflict.crosswalkId === target.crosswalkId)
        .map((conflict) =>
          Object.freeze({
            vehicleId: conflict.vehicleId,
            tick: conflict.tick,
            distanceM: conflict.distanceM,
            speedMps: conflict.speedMps,
            timeToConflictS: conflict.timeToConflictS,
            crossingRemainingS: conflict.crossingRemainingS,
            outcome: conflict.outcome,
            stopTick: conflict.stopTick,
            stopDistanceM: conflict.stopDistanceM,
            minimumDistanceM: conflict.minimumDistanceM,
            maximumSpeedMps: conflict.maximumSpeedMps,
          }),
        ),
    ),
    stops: Object.freeze(
      world
        .getStops()
        .filter((stop) => stop.crosswalkId === target.crosswalkId)
        .map((stop) =>
          Object.freeze({
            tick: stop.tick,
            distanceM: stop.distanceM,
            speedMps: stop.speedMps,
            duringCrossing: stop.duringCrossing,
            pedestrianId: stop.pedestrianId,
          }),
        ),
    ),
    collisions: Object.freeze(
      world.getCollisions().map((collision) =>
        Object.freeze({
          tick: collision.tick,
          vehicleId: collision.vehicleId,
          state: collision.state,
          speedMps: collision.speedMps,
        }),
      ),
    ),
    targetPedestrian: Object.freeze({
      pedestrianId,
      finalState: targetPedestrian?.state ?? null,
      withdrawalReason: targetPedestrian?.withdrawalReason ?? null,
      crossingProgress: targetPedestrian?.crossingProgress ?? null,
    }),
  };
  const checks = definition.check(result as ScenarioResult);
  return Object.freeze({
    ...result,
    checks: Object.freeze([...checks]),
    pass: checks.every((check) => check.passed),
  });
}

function crossed(world: Pedestrians, pedestrianId: string): boolean {
  return world.getPedestrian(pedestrianId)?.state === 'CROSSING';
}

/** Moves a vehicle towards the authored line; braking is a scripted driver decision, not physics. */
function advance(vehicle: VehicleState, speedMps: number) {
  vehicle.speed = speedMps;
  vehicle.distance -= vehicle.speed * DT;
}

function frameOf(target: PedestrianTarget, vehicle: VehicleState): Frame {
  return Object.freeze({
    vehicles: Object.freeze([vehicleBefore(target, vehicle.distance, vehicle.speed)]),
    vehiclesComplete: true,
  });
}

const scenarios: readonly ScenarioDefinition[] = Object.freeze([
  {
    scenarioId: 'crossing-free',
    title: 'Traversare liberă',
    description:
      'Pietonul ajunge la bordură și traversează fără niciun vehicul observat; dungă fără conflict nu devine cedare.',
    ticks: 1100,
    pedestriansPerCrosswalk: 1,
    seed: 4711,
    frame: () => Object.freeze({ vehicles: Object.freeze([]), vehiclesComplete: true }),
    check: (result) => [
      {
        id: 'FREE_CROSSINGS_COMPLETED',
        passed: result.counts.freeCrossings > 0,
        detail: `traversări libere finalizate: ${result.counts.freeCrossings}`,
      },
      {
        id: 'NO_CONFLICT_WITH_EMPTY_ROAD',
        passed: result.counts.conflictRecords === 0,
        detail: `conflicte pe drum gol: ${result.counts.conflictRecords}`,
      },
      {
        id: 'YIELD_RATE_WITHOUT_DENOMINATOR',
        passed:
          result.denominators.yieldRate.status === 'MISSING' &&
          result.denominators.yieldRate.value === null,
        detail: `rata de cedare ${String(result.denominators.yieldRate.value)} (${result.denominators.yieldRate.status})`,
      },
    ],
  },
  {
    scenarioId: 'conflict-yield',
    title: 'Traversare cu conflict și cedare',
    description:
      'Pietonul așteaptă un vehicul care se apropie, apoi se angajează; vehiculul frânează cât timp pietonul traversează.',
    ticks: 900,
    pedestriansPerCrosswalk: 1,
    seed: 4711,
    frame: ({ tick, world, target, pedestrianId, vehicle }) => {
      if (tick > 0) {
        const braking = crossed(world, pedestrianId) && vehicle.distance <= 25;
        advance(vehicle, braking ? Math.max(0, vehicle.speed - 8 * DT) : 6);
      } else {
        vehicle.distance = 30;
        vehicle.speed = 6;
      }
      return frameOf(target, vehicle);
    },
    check: (result) => [
      {
        id: 'PEDESTRIAN_WAITED',
        passed: result.counts.assertedCrossings > 0,
        detail: `traversări angajate după așteptare: ${result.counts.assertedCrossings}`,
      },
      {
        id: 'OBSERVABLE_CONFLICT',
        passed:
          result.conflicts.length > 0 &&
          result.conflicts.every((conflict) => typeof conflict.timeToConflictS === 'number'),
        detail: `conflicte cu timp până la conflict numeric: ${result.conflicts.length}`,
      },
      {
        id: 'YIELD_OBSERVED',
        passed:
          result.counts.yieldedCrossings > 0 &&
          result.conflicts.some((conflict) => conflict.outcome === 'YIELDED'),
        detail: `traversări cu cedare: ${result.counts.yieldedCrossings}, opriri în timpul traversării: ${result.counts.yieldStopEvents}`,
      },
    ],
  },
  {
    scenarioId: 'conflict-no-yield',
    title: 'Traversare cu conflict fără cedare',
    description:
      'Pietonul se angajează, vehiculul își păstrează viteza și trece prin dreptul lui; distanța minimă rămâne înregistrată.',
    ticks: 900,
    pedestriansPerCrosswalk: 1,
    seed: 4711,
    frame: ({ tick, target, vehicle }) => {
      if (tick > 0) advance(vehicle, 6);
      else {
        vehicle.distance = 30;
        vehicle.speed = 6;
      }
      return frameOf(target, vehicle);
    },
    check: (result) => [
      {
        id: 'NO_YIELD_OBSERVED',
        passed:
          result.counts.crossingsWithoutYield > 0 &&
          result.counts.yieldedCrossings === 0 &&
          result.counts.stopEvents === 0,
        detail: `traversări fără cedare: ${result.counts.crossingsWithoutYield}, opriri: ${result.counts.stopEvents}`,
      },
      {
        id: 'MINIMUM_DISTANCE_RECORDED',
        passed:
          result.conflicts.length > 0 &&
          result.conflicts.every((conflict) => conflict.minimumDistanceM >= 0),
        detail: `distanță minimă ${result.conflicts.map((conflict) => conflict.minimumDistanceM.toFixed(2)).join(', ') || '—'}`,
      },
    ],
  },
  {
    scenarioId: 'contact-impact',
    title: 'Contact autoritar în timpul traversării',
    description:
      'Proprietarul coliziunilor raportează un contact în timpul traversării; pietonul se retrage cu motiv IMPACT, iar traversarea întreruptă nu devine finalizată.',
    ticks: 900,
    pedestriansPerCrosswalk: 1,
    seed: 4711,
    frame: ({ tick, world, target, pedestrianId, vehicle, collisions }) => {
      if (tick > 0) {
        const previous = vehicle.distance;
        advance(vehicle, 6);
        if (collisions.tick === null && previous > 0 && vehicle.distance <= 0) {
          collisions.tick = tick;
          const pedestrian = world.getPedestrian(pedestrianId);
          return Object.freeze({
            vehicles: Object.freeze([vehicleBefore(target, vehicle.distance, vehicle.speed)]),
            vehiclesComplete: true,
            contacts: Object.freeze([
              Object.freeze({
                vehicleId: 'vehicle-1',
                pedestrianId,
                tick,
                positionM: pedestrian?.positionM ?? { x: 0, y: 0, z: 0 },
                speedMps: vehicle.speed,
              }),
            ]),
          });
        }
      } else {
        vehicle.distance = 30;
        vehicle.speed = 6;
      }
      return frameOf(target, vehicle);
    },
    check: (result) => [
      {
        id: 'CONTACT_RECORDED',
        passed: result.collisions.length === 1 && result.counts.collisions === 1,
        detail: `contacte înregistrate: ${result.counts.collisions}`,
      },
      {
        id: 'WITHDRAWN_BY_IMPACT',
        passed:
          result.targetPedestrian.finalState === 'WITHDRAWN' &&
          result.targetPedestrian.withdrawalReason === 'IMPACT',
        detail: `stare finală ${result.targetPedestrian.finalState} (${result.targetPedestrian.withdrawalReason})`,
      },
      {
        id: 'INTERRUPTED_NOT_COMPLETED',
        passed: result.counts.crossingsInterrupted >= 1,
        detail: `traversări întrerupte: ${result.counts.crossingsInterrupted}`,
      },
    ],
  },
  {
    scenarioId: 'coverage-incomplete',
    title: 'Acoperire incompletă a vehiculelor',
    description:
      'Aceeași apropiere, dar enumerarea vehiculelor este declarată incompletă; traversarea nu devine „liberă" și nici cedare dovedită.',
    ticks: 900,
    pedestriansPerCrosswalk: 1,
    seed: 4711,
    frame: ({ tick, target, vehicle }) => {
      if (tick > 0) advance(vehicle, 6);
      else {
        vehicle.distance = 30;
        vehicle.speed = 6;
      }
      return Object.freeze({
        vehicles: Object.freeze([vehicleBefore(target, vehicle.distance, vehicle.speed)]),
        vehiclesComplete: false,
      });
    },
    check: (result) => [
      {
        id: 'INCOMPLETE_COVERAGE_REPORTED',
        passed:
          result.coverage.incompleteSteps === result.coverage.steps &&
          result.gaps.includes('INCOMPLETE_VEHICLE_COVERAGE'),
        detail: `${result.coverage.incompleteSteps}/${result.coverage.steps} pași incompleți`,
      },
      {
        id: 'NO_FAKE_FREE_CROSSING',
        passed: result.counts.unobservedCrossings > 0 && result.counts.freeCrossings === 0,
        detail: `traversări neobservate: ${result.counts.unobservedCrossings}, libere: ${result.counts.freeCrossings}`,
      },
    ],
  },
  {
    scenarioId: 'density-default',
    title: 'Densitate implicită, fără trafic',
    description:
      'Configurația implicită (doi pietoni pe fiecare trecere legată) dovedește costul structural mărginit.',
    ticks: 1100,
    pedestriansPerCrosswalk: 2,
    seed: 4711,
    frame: () => Object.freeze({ vehicles: Object.freeze([]), vehiclesComplete: true }),
    check: (result) => [
      {
        id: 'DEFAULT_DENSITY',
        passed: result.pedestrians === 96,
        detail: `${result.pedestrians} pietoni`,
      },
      {
        id: 'BOUNDED_EVALUATION',
        passed: result.counts.created === 96 && result.counts.live <= 96,
        detail: `${result.counts.created} pietoni creați, ${result.counts.withdrawn} retrași cu motiv`,
      },
    ],
  },
]);

function refusalsOf(target: PedestrianTarget) {
  const cases: { case: string; run: () => unknown }[] = [
    {
      case: 'unknown-option',
      run: () => createPedestrianWorld({ seed: 1, unknownOption: 1 } as never),
    },
    {
      case: 'non-integer-seed',
      run: () => createPedestrianWorld({ seed: 1.5 }),
    },
    {
      case: 'missing-seed',
      run: () => createPedestrianWorld({ seed: undefined } as never),
    },
    {
      case: 'stale-tick',
      run: () => {
        const world = createPedestrianWorld({ seed: 1, pedestriansPerCrosswalk: 1 });
        world.step({ tick: 4, vehicles: [], vehiclesComplete: true });
        world.step({ tick: 4, vehicles: [], vehiclesComplete: true });
      },
    },
    {
      case: 'duplicate-vehicle',
      run: () => {
        const world = createPedestrianWorld({ seed: 1, pedestriansPerCrosswalk: 1 });
        const vehicle = vehicleBefore(target, 20, 6);
        world.step({ tick: 0, vehicles: [vehicle, vehicle], vehiclesComplete: true });
      },
    },
    {
      case: 'unknown-lane',
      run: () => {
        const world = createPedestrianWorld({ seed: 1, pedestriansPerCrosswalk: 1 });
        const vehicle = { ...vehicleBefore(target, 20, 6), laneId: 'lane:absent' };
        world.step({ tick: 0, vehicles: [vehicle], vehiclesComplete: true });
      },
    },
    {
      case: 'vehicle-capacity',
      run: () => {
        const world = createPedestrianWorld({
          seed: 1,
          pedestriansPerCrosswalk: 1,
          maxVehiclesPerStep: 1,
        });
        world.step({
          tick: 0,
          vehicles: [vehicleBefore(target, 20, 6), vehicleBefore(target, 25, 6)],
          vehiclesComplete: true,
        });
      },
    },
    {
      case: 'contact-unknown-pedestrian',
      run: () => {
        const world = createPedestrianWorld({ seed: 1, pedestriansPerCrosswalk: 1 });
        world.step({
          tick: 0,
          vehicles: [],
          vehiclesComplete: true,
          contacts: [
            {
              vehicleId: 'vehicle-1',
              pedestrianId: 'absent',
              tick: 0,
              positionM: { x: 0, y: 0, z: 0 },
              speedMps: 3,
            },
          ],
        });
      },
    },
    {
      case: 'contact-foreign-tick',
      run: () => {
        const world = createPedestrianWorld({ seed: 1, pedestriansPerCrosswalk: 1 });
        const pedestrianId = world.getPedestrians()[0]!.pedestrianId;
        world.step({
          tick: 0,
          vehicles: [],
          vehiclesComplete: true,
          contacts: [
            {
              vehicleId: 'vehicle-1',
              pedestrianId,
              tick: 3,
              positionM: { x: 0, y: 0, z: 0 },
              speedMps: 3,
            },
          ],
        });
      },
    },
  ];
  return cases.map((entry) => {
    try {
      entry.run();
      return Object.freeze({ case: entry.case, refused: false, message: 'refuz absent' });
    } catch (error) {
      return Object.freeze({
        case: entry.case,
        refused: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

function determinismCheck(target: PedestrianTarget, definition: ScenarioDefinition) {
  const run = () => {
    const result = runScenario(definition, target);
    return digestOf({
      counts: result.counts,
      denominators: result.denominators,
      conflicts: result.conflicts,
      stops: result.stops,
      finalStates: result.finalStates,
    });
  };
  const first = run(),
    second = run();
  return Object.freeze({ runs: 2, digest: first, identical: first === second });
}

/** Deterministic, browser-free report for PBI 164; every number comes from real evaluator state. */
export function runPedestrianReport(): PedestrianScenarioReport {
  const probe = createPedestrianWorld({ seed: 4711, pedestriansPerCrosswalk: 1 });
  const network = probe.getNetwork();
  const target = pedestrianTarget(probe.getLinks());
  const scenariosRun = scenarios.map((definition) => runScenario(definition, target));
  const refusedReasons: Record<string, number> = {};
  for (const refused of network.refusedLinks)
    refusedReasons[refused.reason] = (refusedReasons[refused.reason] ?? 0) + 1;
  const density = scenariosRun.find((scenario) => scenario.scenarioId === 'density-default')!;
  const costWorld = createPedestrianWorld({ seed: 4711, pedestriansPerCrosswalk: 2 });
  for (let tick = 0; tick < 600; tick += 1)
    costWorld.step({
      tick,
      vehicles: [vehicleBefore(target, 30, 6)],
      vehiclesComplete: true,
    });
  const cost = costWorld.getStats().evaluationCost;
  const refusals = refusalsOf(target);
  const aggregate = (key: keyof ScenarioResult['counts']) =>
    scenariosRun.reduce((total, scenario) => total + scenario.counts[key], 0);
  return Object.freeze({
    generatedBy: 'scripts/run-pedestrian-report.mjs',
    command: 'npm run pedestrians:report',
    contract: '164-pedestrians-v1',
    oracleRule:
      'O cedare este numărată numai când un vehicul observabil era în apropiere în timpul traversării și a fost văzut oprit; o traversare liberă cere enumerare completă și zero conflicte; fără numitor real, rata rămâne null cu lacună declarată.',
    fixture: Object.freeze({
      ...network,
      refusedReasons: Object.freeze(refusedReasons),
      pedestriansPerCrosswalk: 1,
    }),
    target: Object.freeze({
      crosswalkId: target.crosswalkId,
      laneId: target.laneId,
      longitudinalM: target.longitudinalM,
      laneLengthM: target.laneLengthM,
      crossingLengthM: target.crossingLengthM,
    }),
    scenarios: Object.freeze(scenariosRun),
    summary: Object.freeze({
      scenarios: scenariosRun.length,
      passed: scenariosRun.filter((scenario) => scenario.pass).length,
      pedestrians: density.pedestrians,
      crossingsStarted: aggregate('crossingsStarted'),
      crossingsCompleted: aggregate('crossingsCompleted'),
      freeCrossings: aggregate('freeCrossings'),
      yieldedCrossings: aggregate('yieldedCrossings'),
      crossingsWithoutYield: aggregate('crossingsWithoutYield'),
      unobservedCrossings: aggregate('unobservedCrossings'),
      conflictRecords: aggregate('conflictRecords'),
      stopEvents: aggregate('stopEvents'),
      yieldStopEvents: aggregate('yieldStopEvents'),
      collisions: aggregate('collisions'),
      pass:
        scenariosRun.every((scenario) => scenario.pass) && refusals.every((entry) => entry.refused),
    }),
    refusals: Object.freeze(refusals),
    determinism: determinismCheck(target, scenarios[1]!),
    cost: Object.freeze({
      steps: 600,
      pedestrianEvaluations: cost.pedestrianEvaluations,
      vehicleEvaluations: cost.vehicleEvaluations,
      peakPedestriansPerStep: cost.peakPedestriansPerStep,
      peakVehiclesPerStep: cost.peakVehiclesPerStep,
    }),
    limitations: Object.freeze([
      'Nivel determinist în Node: fără browser, GPU, fizică live sau input uman; mișcarea vehiculelor este scriptată de fixture.',
      'Contactele sunt fapte autoritare ale proprietarului coliziunilor; modulul nu detectează fizic impactul.',
      'Trotuarul este banda derivată din harta 032 de layout-ul PBI 042; apropierea este un segment drept, nu un graf de trotuare.',
      'Trecerea de pietoni este perpendiculară pe banda de referință; o geometrie de hartă nealiniată este refuzată explicit, nu aproximată.',
      'Trecările de la marginea hărții nu au trotuar derivat și rămân fără pietoni, raportate ca lacună NO_SIDEWALK.',
      'Pragurile numerice (viteză de mers, răbdare, marjă) sunt seedate și raportate per pieton, nu calibrate pentru gameplay.',
      'Costul local de mai sus este structural (numărători deterministe), nu o măsurare de FPS sau de hardware.',
    ]),
  });
}
