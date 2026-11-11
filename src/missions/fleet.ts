import {
  RIDE_CANCEL_REASONS,
  RIDE_FAILURE_REASONS,
  RIDE_TERMINAL_STATES,
  demandLevels,
} from '../fleet';
import type { DemandLevel, RideState } from '../fleet';
import { parseSimulationEvent } from '../simulation';
import type { SimulationEvent } from '../simulation';
import { choice, list, number, record, requireContract, tick } from '../sessions';
import { CITY_MISSION_ID, CITY_SCHEMA_VERSION, cityFidelityVerdicts } from './city';
import type { CityFidelityVerdict } from './city';
import { COMFORT_OBJECTIVE, evaluateComfortRide } from './comfort';
import type { ComfortResult, ComfortThresholds } from './comfort';
import { MISSION_LIMITS, boundedId, compareText, plainFields, requireRequired } from './contracts';
import {
  createCampaignMissionCatalog,
  missionDifficulties,
  missionInstanceId,
  missionTargetFor,
  parseMissionDefinition,
} from './definitions';
import type { MissionDefinition, MissionDifficulty, MissionObjective } from './definitions';

/**
 * 124 "the final service challenge": ride request, service targets, evaluation window and incident
 * budget for campaign stage 8 (`campaign-8-fleet-challenge`, 116 definition).
 *
 * The challenge is a real 059/060/061 service run, not a score. Three dimensions are evaluated and
 * reported separately, each with its own values, thresholds, verdict and evidence:
 *
 * - `service` reads the real 059 ride requests and the real 061 terminal rides: how many requests
 *   were served, how many stayed pending, how many failed or were cancelled, how many seconds were
 *   delivered out of the planned service and how many rides closed after their promise;
 * - `comfort` reuses the 121 comfort objective and evaluates each real 121 ride through
 *   {@link evaluateComfortRide}; it never reports a style score;
 * - `fidelity` reads the real 122 city evaluation of the same fleet and only projects its fidelity
 *   verdict and matched cells; it never re-computes the imitation metric.
 *
 * The evaluation window is an explicit contract built **before** the run by
 * {@link fleetChallengeBriefing}: start tick, duration in authoritative ticks, conditions, the
 * resolved service/comfort/fidelity targets and the numeric incident budget. The briefing accepts
 * no outcome field at all, so the player-facing panel can show exactly what will be measured and on
 * what interval before the first ride. {@link evaluateFleetMission} embeds that same briefing in its
 * result, so the run is always judged against the contract that was shown.
 *
 * The incident budget is numeric and counts real 007 `COLLISION` events (the same event the 028
 * collision adapter publishes and the 116 tracker consumes), one per `eventId`, inside the window.
 * Nothing here is an estimate: a batch that replays the same event never inflates the budget.
 *
 * The composite verdict is a conjunction, not an opaque score: `SUCCESS` requires a complete window
 * and every dimension passing, `INCOMPLETE` marks an early end with unresolved requests, and
 * `FAILURE` names the failing dimensions. A strong dimension never compensates a failing one.
 *
 * The module owns no clock, DOM, renderer, profile store, learning queue or random source. It reads
 * immutable facts and writes nothing.
 */
export const FLEET_SCHEMA_VERSION = '124-mission-fleet-v1' as const;
export const FLEET_MISSION_ID = 'campaign-8-fleet-challenge' as const;
export const FLEET_OBJECTIVE_ID = 'fleet-clean-dropoffs' as const;
export const FLEET_NAMESPACE = 'campaign:124' as const;

export const FLEET_LIMITS = Object.freeze({
  version: FLEET_SCHEMA_VERSION,
  /** Real 057 fleet capacity. */
  taxis: 70,
  /** Real 059 request capacity. */
  requests: 1024,
  /** Real 061 terminal ride capacity used by the evaluated run. */
  rides: 1024,
  /** Real 007 collision events accepted for one evaluation. */
  incidents: 1024,
  /** 121 comfort rides evaluated for one run. */
  comfortRides: 64,
  /** Upper bound of one declared evaluation window: 24 h at the authoritative 60 Hz tick. */
  windowTicks: 5_184_000,
  /** Code units per request, ride, taxi, profile and scenario identity. */
  idCodeUnits: 256,
  /** Tolerance when comparing a fraction with its threshold. */
  fractionEpsilon: 1e-9,
});

/**
 * Authored service targets of stage 8, published before start. They are V1 calibration proposals,
 * exactly like the 116 objective thresholds: every measured value behind them is a real 059/061
 * fact, never a second service metric.
 *
 * `minimumServedRides` is not authored here: it is the 116 objective target of the chosen
 * difficulty, so the challenge cannot drift from the campaign definition.
 */
export const FLEET_SERVICE_TARGETS = Object.freeze({
  /** Every real 059 request of the window must end with a completed 061 ride. */
  minimumServedFraction: 1,
  /** A completed ride that closes after its request promise breaks the service promise. */
  maximumLateRides: 0,
});

/** Authored comfort targets; the acceleration/jerk thresholds are the 121 objective values. */
export const FLEET_COMFORT_TARGETS = Object.freeze({
  minimumRides: 1,
  maximumFailedRides: 0,
  passengerRequired: true as const,
});

/**
 * Authored fidelity target: the evaluated fleet must reproduce the player's published profile
 * exactly, which is the 122 `EXACT` verdict. A partially updated fleet is reported `PARTIAL` and
 * fails the target instead of being rounded up.
 */
export const FLEET_FIDELITY_TARGETS = Object.freeze({
  minimumMatchedFraction: 1,
  requiredVerdict: 'EXACT' as CityFidelityVerdict,
});

export const fleetCompositeRule = Object.freeze({
  id: 'ALL_DIMENSIONS_WITHIN_BUDGET' as const,
  verdicts: Object.freeze(['SUCCESS', 'FAILURE', 'INCOMPLETE'] as const),
  pass: 'SUCCESS numai când fereastra este completă și serviciul, confortul, fidelitatea și bugetul de incidente trec toate.',
  noCompensation:
    'O dimensiune puternică nu compensează niciodată una care eșuează: fiecare își păstrează valoarea, pragul, verdictul și dovada.',
});
export type FleetCompositeRule = Readonly<{
  id: typeof fleetCompositeRule.id;
  verdicts: readonly FleetCompositeVerdict[];
  pass: string;
  noCompensation: string;
}>;

export const fleetDimensionIds = ['SERVICE', 'COMFORT', 'FIDELITY', 'INCIDENTS', 'WINDOW'] as const;
export type FleetDimensionId = (typeof fleetDimensionIds)[number];

export const fleetServiceVerdicts = ['MET', 'BELOW_TARGET'] as const;
export type FleetServiceVerdict = (typeof fleetServiceVerdicts)[number];

export const fleetComfortVerdicts = ['PASSED', 'FAILED', 'NOT_EVALUATED'] as const;
export type FleetComfortVerdict = (typeof fleetComfortVerdicts)[number];

export const fleetFidelityVerdicts = ['MET', 'BELOW_TARGET'] as const;
export type FleetFidelityVerdict = (typeof fleetFidelityVerdicts)[number];

export const fleetCompositeVerdicts = ['SUCCESS', 'FAILURE', 'INCOMPLETE'] as const;
export type FleetCompositeVerdict = (typeof fleetCompositeVerdicts)[number];

export const fleetMissionOutcomes = ['PROGRESS', 'NO_PROGRESS'] as const;
export type FleetMissionOutcome = (typeof fleetMissionOutcomes)[number];

/** Closed reasons; a run that is not a success carries at least one of them. */
export const fleetMissionReasons = [
  'SERVICE_BELOW_TARGET',
  'COMFORT_FAILED',
  'COMFORT_NOT_EVALUATED',
  'FIDELITY_BELOW_TARGET',
  'INCIDENT_BUDGET_EXCEEDED',
  'WINDOW_INCOMPLETE',
] as const;
export type FleetMissionReason = (typeof fleetMissionReasons)[number];

export const fleetRequestStatuses = ['SERVED', 'FAILED', 'CANCELLED', 'PENDING'] as const;
export type FleetRequestStatus = (typeof fleetRequestStatuses)[number];

export interface FleetProfileFacts {
  readonly profileId: string;
  readonly versionId: string;
}

/** Explicit evaluation window: both bounds are inclusive and measured in authoritative ticks. */
export interface FleetWindow {
  readonly startTick: number;
  readonly endTick: number;
  readonly durationTicks: number;
  readonly bounds: 'INCLUSIVE';
}

export interface FleetCondition {
  readonly dimension: Exclude<FleetDimensionId, 'WINDOW'>;
  readonly statement: string;
  readonly target: string;
}

export interface FleetServiceTargets {
  readonly minimumServedRides: number;
  readonly minimumServedFraction: number;
  readonly maximumLateRides: number;
}

export interface FleetComfortTargets {
  readonly minimumRides: number;
  readonly maximumFailedRides: number;
  readonly passengerRequired: true;
  readonly thresholds: Readonly<ComfortThresholds>;
}

export interface FleetFidelityTargets {
  readonly minimumMatchedFraction: number;
  readonly requiredVerdict: CityFidelityVerdict;
}

/**
 * The pre-start contract. `evaluated` is structurally zero: a briefing cannot carry a ride or an
 * incident, so the conditions shown before start can never depend on the run's outcome.
 */
export interface FleetChallengeBriefing {
  readonly version: typeof FLEET_SCHEMA_VERSION;
  readonly missionId: typeof FLEET_MISSION_ID;
  readonly definitionVersion: string;
  readonly title: string;
  readonly status: 'BEFORE_START';
  readonly difficulty: MissionDifficulty;
  readonly profile: FleetProfileFacts;
  readonly evaluationWindow: FleetWindow;
  readonly conditions: readonly FleetCondition[];
  readonly serviceTargets: FleetServiceTargets;
  readonly comfortTargets: FleetComfortTargets;
  readonly fidelityTargets: FleetFidelityTargets;
  readonly incidentBudget: number;
  readonly compositeRule: FleetCompositeRule;
  readonly evaluated: Readonly<{ rides: 0; incidents: 0 }>;
}

/** One real 059 request plus the authored service promise of the challenge. */
export interface FleetRideRequest {
  readonly requestId: string;
  readonly scenarioId: string;
  readonly windowId: string;
  readonly ordinal: number;
  readonly spawnTick: number;
  readonly demandLevel: DemandLevel;
  readonly access: 'TAXI';
  readonly originZoneId: string;
  readonly destinationZoneId: string;
  /** Authoritative tick by which the ride must close; `spawnTick < promiseTick <= endTick`. */
  readonly promiseTick: number;
}

/** The real 061 fields the challenge consumes from a terminal ride. */
export interface FleetRideFacts {
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly assignmentId: string;
  readonly pickupZoneId: string;
  readonly dropoffZoneId: string;
  readonly pickupCostSeconds: number;
  readonly tripCostSeconds: number;
  readonly totalCostSeconds: number;
  readonly state: RideState;
  readonly reason: string | null;
  readonly startedTick: number;
  readonly updatedTick: number;
  readonly terminal: true;
}

export interface FleetIncident {
  readonly eventId: string;
  readonly vehicleId: string;
  readonly otherEntityId: string;
  readonly impulseNs: number;
  readonly tick: number;
}

/** The real contracts one evaluated attempt receives. */
export interface FleetMissionInput {
  readonly definition: MissionDefinition;
  readonly difficulty: MissionDifficulty;
  readonly startTick: number;
  readonly endedAtTick: number;
  readonly attempt: number;
  readonly profile: FleetProfileFacts;
  readonly fleet: Readonly<{ taxis: readonly string[] }>;
  readonly requests: readonly FleetRideRequest[];
  readonly rides: readonly FleetRideFacts[];
  /** Real 007 COLLISION envelopes; they are parsed with the delivered event contract. */
  readonly incidents: readonly unknown[];
  /** Real 121 comfort ride inputs, evaluated by the delivered comfort objective. */
  readonly comfort: readonly unknown[];
  /** The real 122 city evaluation of the same fleet profile. */
  readonly city: unknown;
}

export interface FleetServiceRequestRow {
  readonly requestId: string;
  readonly spawnTick: number;
  readonly promiseTick: number;
  readonly status: FleetRequestStatus;
  readonly rideId: string | null;
  readonly taxiId: string | null;
  readonly responseTicks: number | null;
  readonly late: boolean;
  readonly deliverySeconds: number;
}

export interface FleetServiceDimension {
  readonly verdict: FleetServiceVerdict;
  readonly pass: boolean;
  readonly targets: FleetServiceTargets;
  readonly requests: number;
  readonly served: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly pending: number;
  readonly late: number;
  readonly servedFraction: number | null;
  readonly plannedSeconds: number;
  readonly deliveredSeconds: number;
  readonly missedSeconds: number;
  readonly rows: readonly FleetServiceRequestRow[];
}

export interface FleetComfortRideResult {
  readonly rideId: string;
  readonly status: ComfortResult['status'];
  readonly reason: ComfortResult['reason'];
  readonly passengerAboard: boolean;
  readonly peakAccelerationMps2: number;
  readonly peakJerkMps3: number;
  readonly accelerationViolations: number;
  readonly jerkViolations: number;
}

export interface FleetComfortDimension {
  readonly verdict: FleetComfortVerdict;
  readonly pass: boolean;
  readonly targets: FleetComfortTargets;
  readonly rides: number;
  readonly passed: number;
  readonly failed: number;
  readonly peakAccelerationMps2: number;
  readonly peakJerkMps3: number;
  readonly results: readonly FleetComfortRideResult[];
}

export interface FleetFidelityDimension {
  readonly verdict: FleetFidelityVerdict;
  readonly pass: boolean;
  readonly targets: FleetFidelityTargets;
  readonly cityVerdict: CityFidelityVerdict;
  readonly evaluatedVehicles: number;
  readonly matchedCells: number;
  readonly totalCells: number;
  readonly matchedFraction: number | null;
}

export interface FleetIncidentBudget {
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
  readonly withinBudget: boolean;
  readonly duplicates: number;
  readonly incidents: readonly FleetIncident[];
}

export interface FleetComposite {
  readonly verdict: FleetCompositeVerdict;
  readonly ruleId: typeof fleetCompositeRule.id;
  readonly noCompensation: string;
  readonly dimensions: Readonly<Record<Exclude<FleetDimensionId, 'WINDOW'>, boolean>>;
  readonly windowComplete: boolean;
  readonly failingDimensions: readonly FleetDimensionId[];
}

export interface FleetMissionResult {
  readonly version: typeof FLEET_SCHEMA_VERSION;
  readonly missionId: typeof FLEET_MISSION_ID;
  readonly instanceId: string;
  readonly attempt: number;
  readonly definitionVersion: string;
  readonly difficulty: MissionDifficulty;
  readonly profile: FleetProfileFacts;
  readonly briefing: FleetChallengeBriefing;
  readonly evaluationWindow: Readonly<FleetWindow & { endedAtTick: number; complete: boolean }>;
  readonly service: FleetServiceDimension;
  readonly comfort: FleetComfortDimension;
  readonly fidelity: FleetFidelityDimension;
  readonly incidents: FleetIncidentBudget;
  readonly composite: FleetComposite;
  readonly outcome: FleetMissionOutcome;
  readonly reasons: readonly FleetMissionReason[];
  /** Structural proof that evaluating the challenge never writes a profile or queues learning. */
  readonly profileWrites: 0;
  readonly learningJobs: 0;
}

export interface FleetMissionGate {
  readonly missionId: typeof FLEET_MISSION_ID;
  readonly objectiveId: typeof FLEET_OBJECTIVE_ID;
  readonly outcome: FleetMissionOutcome;
  readonly satisfied: boolean;
  readonly verdict: FleetCompositeVerdict;
  readonly reasons: readonly FleetMissionReason[];
  readonly dimensions: Readonly<Record<FleetDimensionId, string>>;
}

const briefingFields = ['definition', 'difficulty', 'startTick', 'profile'] as const;
const evaluationFields = [
  'definition',
  'difficulty',
  'startTick',
  'endedAtTick',
  'attempt',
  'profile',
  'fleet',
  'requests',
  'rides',
  'incidents',
  'comfort',
  'city',
] as const;
const profileFields = ['profileId', 'versionId'] as const;
const fleetFields = ['taxis'] as const;
const requestFields = [
  'requestId',
  'scenarioId',
  'windowId',
  'ordinal',
  'spawnTick',
  'demandLevel',
  'access',
  'originZoneId',
  'destinationZoneId',
  'promiseTick',
] as const;
const rideFields = [
  'rideId',
  'requestId',
  'taxiId',
  'assignmentId',
  'pickupZoneId',
  'dropoffZoneId',
  'pickupCostSeconds',
  'tripCostSeconds',
  'totalCostSeconds',
  'state',
  'reason',
  'startedTick',
  'updatedTick',
  'terminal',
] as const;

const terminalStates = RIDE_TERMINAL_STATES as readonly string[];

function readProfile(value: unknown): FleetProfileFacts {
  const data = plainFields(value, profileFields, 'fleet profile');
  for (const key of profileFields) requireRequired(data, key, 'fleet profile');
  return Object.freeze({
    profileId: boundedId(data.profileId, FLEET_LIMITS.idCodeUnits, 'fleet profile'),
    versionId: boundedId(data.versionId, FLEET_LIMITS.idCodeUnits, 'fleet profile version'),
  });
}

function readDifficulty(value: unknown): MissionDifficulty {
  return choice(value, missionDifficulties);
}

function fleetObjective(definition: MissionDefinition): MissionObjective {
  requireContract(
    definition.missionId === FLEET_MISSION_ID,
    `The fleet challenge cannot evaluate ${definition.missionId}`,
  );
  const objective = definition.objectives.find((entry) => entry.objectiveId === FLEET_OBJECTIVE_ID);
  requireContract(
    objective !== undefined && objective.kind === 'CLEAN_DROPOFFS',
    'The fleet challenge requires the 116 fleet-clean-dropoffs objective',
  );
  return objective;
}

function readWindow(definition: MissionDefinition, startTick: number): FleetWindow {
  const durationTicks = definition.windowTicks;
  requireContract(
    durationTicks !== null && durationTicks > 0 && durationTicks <= FLEET_LIMITS.windowTicks,
    'The fleet challenge definition declares no usable evaluation window',
  );
  const endTick = startTick + durationTicks;
  requireContract(Number.isSafeInteger(endTick), 'Fleet evaluation window exceeds safe ticks');
  return Object.freeze({
    startTick,
    endTick,
    durationTicks,
    bounds: 'INCLUSIVE' as const,
  });
}

function readIncidentBudget(definition: MissionDefinition): number {
  const budget = definition.incidentBudget;
  requireContract(
    budget !== null && Number.isSafeInteger(budget) && budget >= 0,
    'The fleet challenge definition declares no numeric incident budget',
  );
  return budget;
}

function buildBriefing(
  definition: MissionDefinition,
  difficulty: MissionDifficulty,
  startTick: number,
  profile: FleetProfileFacts,
): FleetChallengeBriefing {
  const objective = fleetObjective(definition);
  const minimumServedRides = missionTargetFor(objective, difficulty);
  const serviceTargets: FleetServiceTargets = Object.freeze({
    minimumServedRides,
    minimumServedFraction: FLEET_SERVICE_TARGETS.minimumServedFraction,
    maximumLateRides: FLEET_SERVICE_TARGETS.maximumLateRides,
  });
  const comfortTargets: FleetComfortTargets = Object.freeze({
    minimumRides: FLEET_COMFORT_TARGETS.minimumRides,
    maximumFailedRides: FLEET_COMFORT_TARGETS.maximumFailedRides,
    passengerRequired: true as const,
    thresholds: Object.freeze({ ...COMFORT_OBJECTIVE.thresholds }),
  });
  const fidelityTargets: FleetFidelityTargets = Object.freeze({
    minimumMatchedFraction: FLEET_FIDELITY_TARGETS.minimumMatchedFraction,
    requiredVerdict: FLEET_FIDELITY_TARGETS.requiredVerdict,
  });
  const incidentBudget = readIncidentBudget(definition);
  const evaluationWindow = readWindow(definition, startTick);
  const conditions: readonly FleetCondition[] = Object.freeze([
    Object.freeze({
      dimension: 'SERVICE' as const,
      statement: `Serviciu: cel puțin ${minimumServedRides} curse finalizate, ${Math.round(serviceTargets.minimumServedFraction * 100)}% din cererile 059 servite și cel mult ${serviceTargets.maximumLateRides} curse peste promisiune.`,
      target: `${minimumServedRides} curse / ${Math.round(serviceTargets.minimumServedFraction * 100)}% / ${serviceTargets.maximumLateRides} întârziate`,
    }),
    Object.freeze({
      dimension: 'COMFORT' as const,
      statement: `Confort: cel puțin ${comfortTargets.minimumRides === 1 ? 'o cursă de pasager evaluată' : `${comfortTargets.minimumRides} curse de pasager evaluate`} 121, fiecare cu accelerația sub ${comfortTargets.thresholds.maxAccelerationMps2} m/s² și jerk sub ${comfortTargets.thresholds.maxJerkMps3} m/s³, cel mult ${comfortTargets.maximumFailedRides} eșecuri.`,
      target: `${comfortTargets.minimumRides} curse / ${comfortTargets.thresholds.maxAccelerationMps2} m/s² / ${comfortTargets.thresholds.maxJerkMps3} m/s³`,
    }),
    Object.freeze({
      dimension: 'FIDELITY' as const,
      statement: `Fidelitate: flota evaluată 122 reproduce profilul publicat în proporție de ${Math.round(fidelityTargets.minimumMatchedFraction * 100)}% (verdict ${fidelityTargets.requiredVerdict}).`,
      target: `${Math.round(fidelityTargets.minimumMatchedFraction * 100)}% / ${fidelityTargets.requiredVerdict}`,
    }),
    Object.freeze({
      dimension: 'INCIDENTS' as const,
      statement: `Incidente: cel mult ${incidentBudget} evenimente 007 COLLISION în fereastra de evaluare.`,
      target: `${incidentBudget} incidente`,
    }),
  ]);
  return Object.freeze({
    version: FLEET_SCHEMA_VERSION,
    missionId: FLEET_MISSION_ID,
    definitionVersion: definition.version,
    title: definition.title,
    status: 'BEFORE_START' as const,
    difficulty,
    profile: Object.freeze({ ...profile }),
    evaluationWindow,
    conditions,
    serviceTargets,
    comfortTargets,
    fidelityTargets,
    incidentBudget,
    compositeRule: Object.freeze({
      ...fleetCompositeRule,
      verdicts: Object.freeze([...fleetCompositeRule.verdicts]),
    }),
    evaluated: Object.freeze({ rides: 0 as const, incidents: 0 as const }),
  });
}

/**
 * The contract shown before start. It refuses any outcome field: a caller can show the conditions
 * and the window, but cannot smuggle a ride or an incident into the briefing.
 */
export function fleetChallengeBriefing(value: unknown): FleetChallengeBriefing {
  const data = plainFields(value, briefingFields, 'fleet briefing');
  for (const key of briefingFields) requireRequired(data, key, 'fleet briefing');
  const definition = parseMissionDefinition(data.definition);
  const difficulty = readDifficulty(data.difficulty);
  const startTick = tick(data.startTick);
  const profile = readProfile(data.profile);
  return buildBriefing(definition, difficulty, startTick, profile);
}

/** The real 116 stage-8 definition, read from the validated campaign catalog. */
export function fleetChallengeDefinition(): MissionDefinition {
  const mission = createCampaignMissionCatalog().missions.find(
    (entry) => entry.missionId === FLEET_MISSION_ID,
  );
  requireContract(mission !== undefined, 'The 116 campaign has no fleet challenge definition');
  return mission;
}

function readFleetTaxis(value: unknown): readonly string[] {
  const data = plainFields(value, fleetFields, 'fleet challenge fleet');
  for (const key of fleetFields) requireRequired(data, key, 'fleet challenge fleet');
  const taxis = list(data.taxis, (entry) =>
    boundedId(entry, FLEET_LIMITS.idCodeUnits, 'fleet taxi'),
  );
  requireContract(
    taxis.length >= 1 && taxis.length <= FLEET_LIMITS.taxis,
    'The fleet challenge needs at least one and at most the 057 taxi capacity',
  );
  requireContract(new Set(taxis).size === taxis.length, 'Duplicate fleet taxi identity');
  return Object.freeze([...taxis].sort(compareText));
}

function readRequest(value: unknown, evaluationWindow: FleetWindow): FleetRideRequest {
  const data = plainFields(value, requestFields, 'fleet ride request');
  for (const key of requestFields) requireRequired(data, key, 'fleet ride request');
  const requestId = boundedId(data.requestId, FLEET_LIMITS.idCodeUnits, 'fleet request');
  const spawnTick = tick(data.spawnTick);
  const promiseTick = tick(data.promiseTick);
  requireContract(
    spawnTick >= evaluationWindow.startTick && spawnTick <= evaluationWindow.endTick,
    `Fleet request ${requestId} spawns outside the declared evaluation interval`,
  );
  requireContract(
    promiseTick > spawnTick && promiseTick <= evaluationWindow.endTick,
    `Fleet request ${requestId} promises outside the declared evaluation interval`,
  );
  requireContract(data.access === 'TAXI', 'A fleet ride request can only be served by a taxi');
  return Object.freeze({
    requestId,
    scenarioId: boundedId(data.scenarioId, FLEET_LIMITS.idCodeUnits, 'fleet request scenario'),
    windowId: boundedId(data.windowId, FLEET_LIMITS.idCodeUnits, 'fleet request window'),
    ordinal: tick(data.ordinal),
    spawnTick,
    demandLevel: choice(data.demandLevel, demandLevels),
    access: 'TAXI' as const,
    originZoneId: boundedId(data.originZoneId, FLEET_LIMITS.idCodeUnits, 'fleet request origin'),
    destinationZoneId: boundedId(
      data.destinationZoneId,
      FLEET_LIMITS.idCodeUnits,
      'fleet request destination',
    ),
    promiseTick,
  });
}

function readRide(value: unknown): FleetRideFacts {
  const data = plainFields(value, rideFields, 'fleet ride');
  for (const key of rideFields) requireRequired(data, key, 'fleet ride');
  const state = choice(data.state, terminalStates);
  requireContract(data.terminal === true, 'The fleet challenge accepts only terminal 061 rides');
  let reason: string | null = null;
  if (state === 'COMPLETED')
    requireContract(data.reason === null, 'A completed ride has no reason');
  else if (state === 'FAILED') reason = choice(data.reason, RIDE_FAILURE_REASONS);
  else reason = choice(data.reason, RIDE_CANCEL_REASONS);
  const startedTick = tick(data.startedTick);
  const updatedTick = tick(data.updatedTick);
  requireContract(updatedTick >= startedTick, 'A fleet ride closes before it starts');
  return Object.freeze({
    rideId: boundedId(data.rideId, FLEET_LIMITS.idCodeUnits, 'fleet ride'),
    requestId: boundedId(data.requestId, FLEET_LIMITS.idCodeUnits, 'fleet ride request'),
    taxiId: boundedId(data.taxiId, FLEET_LIMITS.idCodeUnits, 'fleet ride taxi'),
    assignmentId: boundedId(data.assignmentId, FLEET_LIMITS.idCodeUnits, 'fleet ride assignment'),
    pickupZoneId: boundedId(data.pickupZoneId, FLEET_LIMITS.idCodeUnits, 'fleet ride pickup'),
    dropoffZoneId: boundedId(data.dropoffZoneId, FLEET_LIMITS.idCodeUnits, 'fleet ride dropoff'),
    pickupCostSeconds: number(data.pickupCostSeconds, 0, 1_000_000),
    tripCostSeconds: number(data.tripCostSeconds, 0, 1_000_000),
    totalCostSeconds: number(data.totalCostSeconds, 0, 1_000_000),
    state: state as RideState,
    reason,
    startedTick,
    updatedTick,
    terminal: true as const,
  });
}

function readIncident(
  value: unknown,
  evaluationWindow: FleetWindow,
  endedAtTick: number,
  taxiIds: ReadonlySet<string>,
): FleetIncident {
  const event = parseSimulationEvent(value);
  requireContract(event.type === 'COLLISION', 'The incident budget counts 007 COLLISION events');
  const collision = event as Extract<SimulationEvent, { readonly type: 'COLLISION' }>;
  requireContract(
    collision.tick >= evaluationWindow.startTick && collision.tick <= endedAtTick,
    `Incident ${collision.eventId} happened outside the evaluated interval`,
  );
  requireContract(
    taxiIds.has(collision.payload.vehicleId),
    `Incident ${collision.eventId} does not belong to a declared taxi`,
  );
  return Object.freeze({
    eventId: boundedId(collision.eventId, FLEET_LIMITS.idCodeUnits, 'fleet incident'),
    vehicleId: collision.payload.vehicleId,
    otherEntityId: collision.payload.otherEntityId,
    impulseNs: collision.payload.impulseNs,
    tick: collision.tick,
  });
}

interface CityFidelityFacts {
  readonly cityVerdict: CityFidelityVerdict;
  readonly evaluatedVehicles: number;
  readonly matchedCells: number;
  readonly totalCells: number;
  readonly matchedFraction: number | null;
}

function readCityFidelity(value: unknown, profile: FleetProfileFacts): CityFidelityFacts {
  const city = record(value);
  requireContract(
    city.version === CITY_SCHEMA_VERSION && city.missionId === CITY_MISSION_ID,
    'The fidelity dimension requires the real 122 city evaluation',
  );
  requireContract(
    city.profileId === profile.profileId && city.profileVersionId === profile.versionId,
    'The 122 evaluation belongs to another profile version',
  );
  const coverage = record(city.coverage);
  requireContract(
    coverage.complete === true && coverage.omittedVehicles === 0,
    'The 122 evaluation did not cover the whole evaluated fleet',
  );
  const fidelity = record(city.fidelity);
  const cityVerdict = choice(fidelity.verdict, cityFidelityVerdicts);
  const evaluatedVehicles = tick(fidelity.evaluatedVehicles);
  const matchedCells = tick(fidelity.matchedCells);
  const totalCells = tick(fidelity.totalCells);
  requireContract(
    evaluatedVehicles >= 1 && totalCells >= matchedCells && matchedCells >= 0,
    'The 122 fidelity facts are inconsistent',
  );
  const matchedFraction =
    fidelity.matchedFraction === null ? null : number(fidelity.matchedFraction, 0, 1);
  requireContract(
    matchedFraction !== null &&
      Math.abs(matchedFraction - matchedCells / totalCells) <= FLEET_LIMITS.fractionEpsilon,
    'The 122 matched fraction does not match its matched cells',
  );
  return Object.freeze({
    cityVerdict,
    evaluatedVehicles,
    matchedCells,
    totalCells,
    matchedFraction,
  });
}

function comfortDimension(
  results: readonly ComfortResult[],
  targets: FleetComfortTargets,
): FleetComfortDimension {
  const rows: FleetComfortRideResult[] = [];
  let passed = 0;
  let peakAccelerationMps2 = 0;
  let peakJerkMps3 = 0;
  for (const result of [...results].sort((left, right) => compareText(left.rideId, right.rideId))) {
    if (result.status === 'PASSED') passed += 1;
    peakAccelerationMps2 = Math.max(peakAccelerationMps2, result.metrics.peakAccelerationMps2);
    peakJerkMps3 = Math.max(peakJerkMps3, result.metrics.peakJerkMps3);
    rows.push(
      Object.freeze({
        rideId: result.rideId,
        status: result.status,
        reason: result.reason,
        passengerAboard: result.passengerAboard,
        peakAccelerationMps2: result.metrics.peakAccelerationMps2,
        peakJerkMps3: result.metrics.peakJerkMps3,
        accelerationViolations: result.metrics.accelerationViolations,
        jerkViolations: result.metrics.jerkViolations,
      }),
    );
  }
  const failed = results.length - passed;
  const verdict: FleetComfortVerdict =
    results.length === 0 ? 'NOT_EVALUATED' : failed > 0 ? 'FAILED' : 'PASSED';
  const pass =
    verdict === 'PASSED' &&
    results.length >= targets.minimumRides &&
    failed <= targets.maximumFailedRides;
  return Object.freeze({
    verdict,
    pass,
    targets,
    rides: results.length,
    passed,
    failed,
    peakAccelerationMps2,
    peakJerkMps3,
    results: Object.freeze(rows),
  });
}

function serviceDimension(
  requests: readonly FleetRideRequest[],
  rides: ReadonlyMap<string, FleetRideFacts>,
  targets: FleetServiceTargets,
): FleetServiceDimension {
  const rows: FleetServiceRequestRow[] = [];
  let served = 0;
  let failed = 0;
  let cancelled = 0;
  let pending = 0;
  let late = 0;
  let plannedSeconds = 0;
  let deliveredSeconds = 0;
  for (const request of [...requests].sort((left, right) =>
    compareText(left.requestId, right.requestId),
  )) {
    const ride = rides.get(request.requestId);
    const status: FleetRequestStatus =
      ride === undefined
        ? 'PENDING'
        : ride.state === 'COMPLETED'
          ? 'SERVED'
          : ride.state === 'FAILED'
            ? 'FAILED'
            : 'CANCELLED';
    if (status === 'SERVED') served += 1;
    else if (status === 'FAILED') failed += 1;
    else if (status === 'CANCELLED') cancelled += 1;
    else pending += 1;
    if (ride !== undefined) {
      plannedSeconds += ride.totalCostSeconds;
      if (ride.state === 'COMPLETED') deliveredSeconds += ride.totalCostSeconds;
    }
    const rideLate = ride !== undefined && ride.updatedTick > request.promiseTick;
    if (rideLate) late += 1;
    rows.push(
      Object.freeze({
        requestId: request.requestId,
        spawnTick: request.spawnTick,
        promiseTick: request.promiseTick,
        status,
        rideId: ride?.rideId ?? null,
        taxiId: ride?.taxiId ?? null,
        responseTicks: ride === undefined ? null : ride.updatedTick - request.spawnTick,
        late: rideLate,
        deliverySeconds: ride?.state === 'COMPLETED' ? ride.totalCostSeconds : 0,
      }),
    );
  }
  const servedFraction = requests.length === 0 ? null : served / requests.length;
  const pass =
    served >= targets.minimumServedRides &&
    servedFraction !== null &&
    servedFraction >= targets.minimumServedFraction - FLEET_LIMITS.fractionEpsilon &&
    late <= targets.maximumLateRides;
  return Object.freeze({
    verdict: pass ? ('MET' as const) : ('BELOW_TARGET' as const),
    pass,
    targets,
    requests: requests.length,
    served,
    failed,
    cancelled,
    pending,
    late,
    servedFraction,
    plannedSeconds,
    deliveredSeconds,
    missedSeconds: plannedSeconds - deliveredSeconds,
    rows: Object.freeze(rows),
  });
}

/**
 * Evaluates one attempt of stage 8 against the pre-start briefing.
 *
 * Every fact is a delivered contract: 059 requests, 061 terminal rides, 007 COLLISION events, 121
 * comfort rides and the 122 city evaluation of the same fleet profile. A request or an event of
 * another window, taxi or profile is refused instead of being silently dropped.
 */
export function evaluateFleetMission(value: unknown): FleetMissionResult {
  const data = plainFields(value, evaluationFields, 'fleet mission');
  for (const key of evaluationFields) requireRequired(data, key, 'fleet mission');

  const definition = parseMissionDefinition(data.definition);
  const difficulty = readDifficulty(data.difficulty);
  const startTick = tick(data.startTick);
  const profile = readProfile(data.profile);
  const attempt = number(data.attempt, 1, MISSION_LIMITS.attemptsPerMission);
  requireContract(Number.isSafeInteger(attempt), 'Fleet challenge attempt must be an integer');
  const briefing = buildBriefing(definition, difficulty, startTick, profile);
  const { evaluationWindow } = briefing;

  const endedAtTick = tick(data.endedAtTick);
  requireContract(
    endedAtTick >= evaluationWindow.startTick && endedAtTick <= evaluationWindow.endTick,
    'The evaluated interval must stay inside the declared evaluation window',
  );

  const taxiIds = readFleetTaxis(data.fleet);
  const taxiSet = new Set(taxiIds);

  requireContract(Array.isArray(data.requests), 'Fleet requests must be an array');
  requireContract(
    data.requests.length >= 1 && data.requests.length <= FLEET_LIMITS.requests,
    'The fleet challenge needs at least one 059 request',
  );
  const requests: FleetRideRequest[] = [];
  const requestIds = new Set<string>();
  for (const raw of data.requests) {
    const request = readRequest(raw, evaluationWindow);
    requireContract(!requestIds.has(request.requestId), 'Duplicate fleet ride request');
    requestIds.add(request.requestId);
    requests.push(request);
  }

  requireContract(Array.isArray(data.rides), 'Fleet rides must be an array');
  requireContract(data.rides.length <= FLEET_LIMITS.rides, 'Fleet ride capacity exceeded');
  const rideByRequest = new Map<string, FleetRideFacts>();
  const rideIds = new Set<string>();
  for (const raw of data.rides) {
    const ride = readRide(raw);
    requireContract(!rideIds.has(ride.rideId), 'Duplicate fleet ride');
    rideIds.add(ride.rideId);
    requireContract(requestIds.has(ride.requestId), 'A fleet ride has no declared 059 request');
    requireContract(
      !rideByRequest.has(ride.requestId),
      'A fleet request ended with more than one terminal ride',
    );
    requireContract(taxiSet.has(ride.taxiId), 'A fleet ride belongs to an undeclared taxi');
    requireContract(
      ride.startedTick >= evaluationWindow.startTick && ride.updatedTick <= endedAtTick,
      'A fleet ride sits outside the evaluated interval',
    );
    rideByRequest.set(ride.requestId, ride);
  }
  requireContract(Array.isArray(data.incidents), 'Fleet incidents must be an array');
  requireContract(
    data.incidents.length <= FLEET_LIMITS.incidents,
    'Fleet incident capacity exceeded',
  );
  const incidentsById = new Map<string, FleetIncident>();
  let duplicateIncidents = 0;
  for (const raw of data.incidents) {
    const incident = readIncident(raw, evaluationWindow, endedAtTick, taxiSet);
    if (incidentsById.has(incident.eventId)) duplicateIncidents += 1;
    else incidentsById.set(incident.eventId, incident);
  }
  const incidents = [...incidentsById.values()].sort(
    (left, right) => left.tick - right.tick || compareText(left.eventId, right.eventId),
  );

  requireContract(Array.isArray(data.comfort), 'Fleet comfort rides must be an array');
  requireContract(
    data.comfort.length <= FLEET_LIMITS.comfortRides,
    'Fleet comfort ride capacity exceeded',
  );
  const comfortResults: ComfortResult[] = [];
  const comfortRideIds = new Set<string>();
  for (const raw of data.comfort) {
    const result = evaluateComfortRide(raw);
    requireContract(
      rideIds.has(result.rideId),
      `Comfort ride ${result.rideId} is not a terminal 061 ride of this run`,
    );
    requireContract(!comfortRideIds.has(result.rideId), 'Duplicate fleet comfort ride');
    comfortRideIds.add(result.rideId);
    comfortResults.push(result);
  }

  const service = serviceDimension(requests, rideByRequest, briefing.serviceTargets);
  const comfort = comfortDimension(comfortResults, briefing.comfortTargets);
  const city = readCityFidelity(data.city, profile);
  const fidelityPass =
    city.matchedFraction !== null &&
    city.matchedFraction >=
      briefing.fidelityTargets.minimumMatchedFraction - FLEET_LIMITS.fractionEpsilon &&
    city.cityVerdict === briefing.fidelityTargets.requiredVerdict;
  const fidelity: FleetFidelityDimension = Object.freeze({
    verdict: fidelityPass ? ('MET' as const) : ('BELOW_TARGET' as const),
    pass: fidelityPass,
    targets: briefing.fidelityTargets,
    cityVerdict: city.cityVerdict,
    evaluatedVehicles: city.evaluatedVehicles,
    matchedCells: city.matchedCells,
    totalCells: city.totalCells,
    matchedFraction: city.matchedFraction,
  });

  const budget = briefing.incidentBudget;
  const incidentsBudget: FleetIncidentBudget = Object.freeze({
    limit: budget,
    used: incidents.length,
    remaining: budget - incidents.length,
    withinBudget: incidents.length <= budget,
    duplicates: duplicateIncidents,
    incidents: Object.freeze(incidents),
  });

  const complete = endedAtTick >= evaluationWindow.endTick || service.pending === 0;
  const dimensions = Object.freeze({
    SERVICE: service.pass,
    COMFORT: comfort.pass,
    FIDELITY: fidelity.pass,
    INCIDENTS: incidentsBudget.withinBudget,
  });
  const failingDimensions: FleetDimensionId[] = [];
  if (!complete) failingDimensions.push('WINDOW');
  if (!dimensions.SERVICE) failingDimensions.push('SERVICE');
  if (!dimensions.COMFORT) failingDimensions.push('COMFORT');
  if (!dimensions.FIDELITY) failingDimensions.push('FIDELITY');
  if (!dimensions.INCIDENTS) failingDimensions.push('INCIDENTS');
  const verdict: FleetCompositeVerdict = !complete
    ? 'INCOMPLETE'
    : failingDimensions.length > 0
      ? 'FAILURE'
      : 'SUCCESS';
  const composite: FleetComposite = Object.freeze({
    verdict,
    ruleId: fleetCompositeRule.id,
    noCompensation: fleetCompositeRule.noCompensation,
    dimensions,
    windowComplete: complete,
    failingDimensions: Object.freeze(failingDimensions),
  });

  const reasons: FleetMissionReason[] = [];
  for (const dimension of failingDimensions) {
    if (dimension === 'WINDOW') reasons.push('WINDOW_INCOMPLETE');
    else if (dimension === 'SERVICE') reasons.push('SERVICE_BELOW_TARGET');
    else if (dimension === 'COMFORT')
      reasons.push(
        comfort.verdict === 'NOT_EVALUATED' ? 'COMFORT_NOT_EVALUATED' : 'COMFORT_FAILED',
      );
    else if (dimension === 'FIDELITY') reasons.push('FIDELITY_BELOW_TARGET');
    else reasons.push('INCIDENT_BUDGET_EXCEEDED');
  }
  const outcome: FleetMissionOutcome = verdict === 'SUCCESS' ? 'PROGRESS' : 'NO_PROGRESS';

  return Object.freeze({
    version: FLEET_SCHEMA_VERSION,
    missionId: FLEET_MISSION_ID,
    instanceId: missionInstanceId(FLEET_NAMESPACE, definition.missionId, attempt),
    attempt,
    definitionVersion: definition.version,
    difficulty,
    profile: Object.freeze({ ...profile }),
    briefing,
    evaluationWindow: Object.freeze({ ...evaluationWindow, endedAtTick, complete }),
    service,
    comfort,
    fidelity,
    incidents: incidentsBudget,
    composite,
    outcome,
    reasons: Object.freeze(reasons),
    profileWrites: 0 as const,
    learningJobs: 0 as const,
  });
}

/** The campaign gate for stage 8: only an explicit `SUCCESS` composite progresses the mission. */
export function fleetMissionGate(result: FleetMissionResult): FleetMissionGate {
  const satisfied = result.composite.verdict === 'SUCCESS';
  return Object.freeze({
    missionId: FLEET_MISSION_ID,
    objectiveId: FLEET_OBJECTIVE_ID,
    outcome: satisfied ? ('PROGRESS' as const) : ('NO_PROGRESS' as const),
    satisfied,
    verdict: result.composite.verdict,
    reasons: result.reasons,
    dimensions: Object.freeze({
      SERVICE: result.service.verdict,
      COMFORT: result.comfort.verdict,
      FIDELITY: result.fidelity.verdict,
      INCIDENTS: result.incidents.withinBudget ? 'WITHIN_BUDGET' : 'EXCEEDED',
      WINDOW: result.evaluationWindow.complete ? 'COMPLETE' : 'INCOMPLETE',
    }),
  });
}
