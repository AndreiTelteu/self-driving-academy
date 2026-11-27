import { randomUint32, record, requireContract, tick } from '../sessions';
import {
  CHALLENGE_DIRECTOR_VERSION,
  CHALLENGE_TERMINAL_STATES,
  challengeDirectorRefusals,
  createChallengeDirector,
  eligibleChallengeTemplates,
  challengeReaction,
  challengeDailyVariety,
  challengeFastRetry,
  createChallengeCapabilities,
  createChallengeExperience,
  createChallengeTemplateCatalog,
  decodeChallengeRewardKey,
  parseChallengeTemplateCatalog,
  planChallengeAttempt,
  CHALLENGE_TICK_HZ,
  resolveDailyCalendarDay,
} from '../missions';
import type {
  ChallengeAssignmentEcho,
  ChallengeCancellationReason,
  ChallengeCapabilities,
  ChallengeCapability,
  ChallengeCreditStatus,
  ChallengeDailySet,
  ChallengeDirector,
  ChallengeDirectorInstance,
  ChallengeDirectorRefusal,
  ChallengeDirectorSnapshot,
  ChallengeExperience,
  ChallengeExperienceSnapshot,
  ChallengeFastRetryResult,
  ChallengeObjectiveKind,
  ChallengeRecordComparison,
  ChallengeReservation,
  ChallengeReaction,
  ChallengeRouteEstimate,
  ChallengeRoutePort,
  ChallengeSessionKind,
  ChallengeTaxiStatus,
  ChallengeTemplate,
  ChallengeTemplateCatalog,
  ChallengeVerdict,
  ChallengeWorldSnapshot,
  ChallengeZoneKind,
  DailyCalendarInput,
  PlayerProgress,
} from '../missions';
import type { DailyCalendarDay } from '../missions';
import { composeChallengePanelSnapshot, parseChallengePanelSnapshot } from '../ui';
import type { ChallengePanelSnapshot } from '../ui';
import type { LaneGraph, RoadMap, RoutePlanner } from '../world';

/**
 * PBI 277 — the live random-challenge vertical.
 *
 * This composition is the only live owner of the delivered 231 catalog/evaluators, the 232 director
 * and the 233 experience. It creates no second simulation, ledger, director or record store:
 *
 * - offering, the one visible offer, the one live instance, the 3-minute simulated cooldown, the
 *   45-second offer window and the objective deadline stay owned by 232;
 * - the reward identity `(family, dailyDate)` and the idempotent personal record stay owned by 233;
 * - Academy XP is credited through the one 213 ledger owned by the 276 live progress composition;
 * - Haos outcomes are records only and never reach the Academy balance;
 * - live facts are read from the authoritative composition frame (position, speed, heading) and
 *   from the real 032 service-zone polygons. A template whose objective has no real fact source is
 *   excluded before it can be offered, so the panel never displays a challenge that cannot be judged.
 *
 * The module has no wall clock and no renderer: the caller hands the authoritative tick, the frame
 * port and the explicit daily calendar. Time is simulated, so a pause freezes the cooldown and the
 * objective deadline. The only persistence is a session-scoped checkpoint over the real 232/233
 * snapshots; a durable savefile remains PBI 278.
 */

export const LIVE_CHALLENGES_VERSION = '277-live-challenges-v1' as const;
export const LIVE_CHALLENGES_CHECKPOINT_VERSION = '277-live-challenges-checkpoint-v1' as const;
export const LIVE_CHALLENGES_ROUTE_VERSION = '277-live-challenge-route-v1' as const;

export const LIVE_CHALLENGES_LIMITS = Object.freeze({
  version: LIVE_CHALLENGES_VERSION,
  /** Active ticks after the session starts before the first automatic offer (15 s). */
  autoOfferDelayTicks: 900,
  /** Simulated gap between two refused/empty automatic attempts (30 s). */
  autoOfferRetryTicks: 1_800,
  /** Objective evaluation runs at 10 Hz, never once per frame. */
  evaluationIntervalTicks: 6,
  /** Zone visits retained for one active attempt. */
  zoneVisits: 64,
  /** Checkpoint crossings retained for one active attempt. */
  checkpoints: 64,
  /** Parking attempts retained for one active attempt. */
  parked: 64,
  /** Drift samples retained for one active attempt. */
  driftSamples: 4_000,
  /** Comfort samples retained for one active attempt (an unsupported source reports none). */
  comfortSamples: 512,
  /** Distinct destruction facts retained for one active attempt. */
  destruction: 64,
  /** Distinct real incident facts retained for one active attempt. */
  incidents: 32,
  /** Record rows exposed by the live status; the 233 store owns the real cap. */
  statusRecords: 32,
  /** Templates named in the status as unavailable. */
  unavailableTemplates: 32,
  /** Session checkpoints; the key is tab-scoped and reversible by the host. */
  checkpointCodeUnits: 262_144,
  globalListeners: 0,
});

/**
 * The objective kinds with a real live source in this revision. The other four stay in the 231
 * catalog but are excluded before the director can offer them:
 *
 * - `TIMED_DROPOFF` needs the challenge ride's real dropoff lifecycle (not mounted here);
 * - `COMFORT` needs a boarded passenger, which the director never fabricates at acceptance;
 * - `DISTRUCTION` needs PBI 285's destructible decor; the capability is absent, so 231 excludes it;
 * - `LEARNING` needs an observed profile activation and effect, which remains PBI 273 follow-up.
 */
export const LIVE_CHALLENGE_OBJECTIVE_SOURCES: Readonly<
  Record<ChallengeObjectiveKind, 'LIVE' | 'UNAVAILABLE'>
> = Object.freeze({
  CHECKPOINTS: 'LIVE',
  ZONE_ORDER: 'LIVE',
  PARKING: 'LIVE',
  DRIFT: 'LIVE',
  TIMED_DROPOFF: 'UNAVAILABLE',
  COMFORT: 'UNAVAILABLE',
  DISTRUCTION: 'UNAVAILABLE',
  LEARNING: 'UNAVAILABLE',
});

/** Closed reasons a 231 template cannot be offered by the live vertical. */
export function liveChallengeTemplateUnavailableReason(template: ChallengeTemplate): string | null {
  switch (template.objectiveKind) {
    case 'CHECKPOINTS':
    case 'ZONE_ORDER':
    case 'PARKING':
    case 'DRIFT':
      return null;
    case 'TIMED_DROPOFF':
      return 'FACT_SOURCE_UNAVAILABLE:TIMED_DROPOFF';
    case 'COMFORT':
      return 'FACT_SOURCE_UNAVAILABLE:PASSENGER_BOARDING';
    case 'DISTRUCTION':
      return 'FACT_SOURCE_UNAVAILABLE:DISTRUCTION';
    case 'LEARNING':
      return 'FACT_SOURCE_UNAVAILABLE:LEARNING_OBSERVATION';
  }
}

export interface LiveChallengeVehicleFact {
  readonly vehicleId: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly laneId: string | null;
  readonly positionM: Readonly<{ x: number; z: number }>;
  readonly yawRad: number;
  readonly speedMps: number;
  readonly controlMode: 'MANUAL' | 'LEARNING' | 'AUTO';
  readonly classId: string;
  readonly status: ChallengeTaxiStatus;
  readonly passengerAboard: boolean;
}

export interface LiveChallengeFrameFact {
  readonly tick: number;
  readonly paused: boolean;
  readonly playerVehicleId: string | null;
  readonly selectedVehicleId: string | null;
  readonly vehicles: readonly LiveChallengeVehicleFact[];
  /** The real 060 dispatch claim of the player's taxi, or `null`. */
  readonly assignment: ChallengeAssignmentEcho | null;
  /** Free taxis in the real fleet. */
  readonly freeTaxis: number;
}

export interface LiveChallengeZoneFact {
  readonly zoneId: string;
  readonly kind: ChallengeZoneKind;
  readonly anchorM: Readonly<{ x: number; z: number }>;
  readonly polygonM: readonly Readonly<{ x: number; z: number }>[];
  readonly laneId: string;
  readonly headingRad: number;
}

export interface LiveChallengeIncidentFact {
  readonly factId: string;
  readonly taxiId: string;
  readonly tick: number;
}

export interface LiveChallengeLearningFact {
  readonly key: string;
  readonly activatedTick: number;
  readonly observedTick: number | null;
  readonly observedProfileId: string | null;
}

export interface LiveChallengePorts {
  /** The accepted composition frame, or `null` before the world exists. */
  readonly frame: () => LiveChallengeFrameFact | null;
  /** Real 032 service zones with the authored live role of each zone. */
  readonly zones: () => readonly LiveChallengeZoneFact[];
  /** The real 041 route port the 232 preflight uses. */
  readonly route: ChallengeRoutePort;
  /** Real collision facts; absent means the incident budget stays 0 instead of being invented. */
  readonly incidents?: () => readonly LiveChallengeIncidentFact[];
  /** Real learning effect, when PBI 273 publishes one. */
  readonly learning?: () => LiveChallengeLearningFact | null;
  /** The tutorial and menus may close the automatic offer door; a host action can still offer. */
  readonly offersAllowed?: () => boolean;
  readonly campaignCompleted?: () => number;
  readonly learningKeys?: () => readonly string[];
  readonly vehicleClasses?: () => readonly string[];
}

export interface LiveChallengeStorage {
  load(): string | null;
  save(value: string): void;
  clear(): void;
}

export interface LiveChallengeOptions {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly sessionKind: ChallengeSessionKind;
  readonly playerId: string;
  readonly seed: number;
  readonly timeZone: string;
  /** The one real 213 ledger owned by the 276 composition. */
  readonly ledger: PlayerProgress;
  readonly ports: LiveChallengePorts;
  readonly calendar: () => DailyCalendarInput;
  readonly now?: () => number;
  readonly catalog?: unknown;
  readonly storage?: LiveChallengeStorage;
  readonly enabled?: boolean;
}

export const liveChallengePersistenceStates = ['MEMORY_ONLY', 'SESSION_STORAGE', 'FAILED'] as const;
export type LiveChallengePersistenceState = (typeof liveChallengePersistenceStates)[number];

export interface LiveChallengeOfferRefusalView {
  readonly code: ChallengeDirectorRefusal;
  readonly message: string;
  readonly detail: readonly string[];
  readonly atTick: number;
  readonly source: 'AUTO' | 'HOST' | 'REVIVE';
}

export interface LiveChallengeUnavailableTemplate {
  readonly templateId: string;
  readonly family: string;
  readonly objectiveKind: ChallengeObjectiveKind;
  readonly reasons: readonly string[];
}

export interface LiveChallengeOfferRead {
  readonly instanceId: string;
  readonly templateId: string;
  readonly title: string;
  readonly objectiveKind: ChallengeObjectiveKind;
  readonly target: number;
  readonly zoneIds: readonly string[];
  readonly rewardXp: number;
  readonly deadlineTick: number;
  readonly expiresAtTick: number;
}

export interface LiveChallengeActiveRead {
  readonly instanceId: string;
  readonly templateId: string;
  readonly title: string;
  readonly objectiveKind: ChallengeObjectiveKind;
  readonly target: number;
  readonly zoneIds: readonly string[];
  readonly progress: number;
  readonly deadlineTick: number;
  readonly remainingTicks: number;
  readonly taxiId: string | null;
}

export interface LiveChallengeResultRead {
  readonly instanceId: string;
  readonly templateId: string;
  readonly title: string;
  readonly status: string;
  readonly reason: string;
  readonly progress: number;
  readonly target: number;
  readonly endedAtTick: number;
  readonly recordComparison: ChallengeRecordComparison;
  readonly creditedXp: number;
  readonly sessionKind: ChallengeSessionKind;
}

export interface LiveChallengeRead {
  readonly version: typeof LIVE_CHALLENGES_VERSION;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly sessionKind: ChallengeSessionKind;
  readonly tick: number;
  readonly dailyDate: string;
  readonly offersEnabled: boolean;
  readonly offer: LiveChallengeOfferRead | null;
  readonly active: LiveChallengeActiveRead | null;
  readonly lastResult: LiveChallengeResultRead | null;
  readonly cooldownRemainingTicks: number;
  readonly nextAutoOfferTick: number;
  readonly counters: Readonly<{
    offers: number;
    refusedOffers: number;
    accepted: number;
    declined: number;
    expired: number;
    completed: number;
    failed: number;
    cancelled: number;
  }>;
  readonly lastOfferRefusal: LiveChallengeOfferRefusalView | null;
  readonly unavailableTemplates: readonly LiveChallengeUnavailableTemplate[];
  readonly records: number;
  readonly xpBalance: number;
  readonly xpBalanceMicroXp: number;
  readonly level: number;
  readonly ledgerEntries: number;
  /** Ledger rows whose cause id is a real 233 `(family, dailyDate)` challenge reward. */
  readonly challengeRewardEntries: number;
  readonly challengeCreditedXp: number;
  readonly persistence: LiveChallengePersistenceState;
  readonly persistenceError: string | null;
  readonly restored: boolean;
  readonly factSources: typeof LIVE_CHALLENGE_OBJECTIVE_SOURCES;
  readonly limits: typeof LIVE_CHALLENGES_LIMITS;
  readonly profileWrites: 0;
  readonly xpDebits: 0;
  readonly learningJobs: 0;
}

export interface LiveChallengeStepInput {
  readonly tick: number;
  readonly paused?: boolean;
}

export interface LiveChallengeStepResult {
  readonly tick: number;
  readonly paused: boolean;
  readonly offered: string | null;
  readonly completed: readonly string[];
  readonly failed: readonly string[];
  readonly expired: readonly string[];
  readonly declined: readonly string[];
  readonly cancelled: readonly string[];
  readonly refusal: ChallengeDirectorRefusal | null;
}

export type LiveChallengeActionResult =
  | Readonly<{
      status: 'ACCEPTED';
      instance: ChallengeDirectorInstance;
      reservation: ChallengeReservation;
      duplicate: boolean;
      xpDelta: 0;
      penalty: 'NONE';
    }>
  | Readonly<{
      status: 'ACTIVE';
      instance: ChallengeDirectorInstance;
      duplicate: boolean;
      xpDelta: 0;
      penalty: 'NONE';
    }>
  | Readonly<{
      status: 'DECLINED';
      instance: ChallengeDirectorInstance;
      duplicate: boolean;
      cooldownUntilTick: number;
      xpDelta: 0;
      reputationDelta: 0;
      penalty: 'NONE';
      rewardGranted: false;
    }>
  | Readonly<{
      status: 'REFUSED';
      code: ChallengeDirectorRefusal;
      message: string;
      detail: readonly string[];
    }>;

export interface LiveChallengePreview {
  readonly templateId: string;
  readonly templateVersion: string;
  readonly objectiveKind: ChallengeObjectiveKind;
  readonly target: number;
  readonly zoneIds: readonly string[];
  readonly learningKey: string | null;
}

export interface LiveChallengeRetryOutcome {
  readonly status: 'RESTARTED' | 'REFUSED';
  readonly code: string | null;
  readonly message: string;
  readonly detail: readonly string[];
  readonly instance: ChallengeDirectorInstance | null;
  readonly attempt: number | null;
  readonly newIdentity: boolean;
  readonly xpDelta: 0;
}

export interface LiveChallengeCheckpoint {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof LIVE_CHALLENGES_CHECKPOINT_VERSION;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly sessionKind: ChallengeSessionKind;
  readonly savedAtMs: number;
  readonly challengeTick: number;
  readonly offersEnabled: boolean;
  readonly nextAutoOfferTick: number;
  readonly director: ChallengeDirectorSnapshot;
  readonly experience: ChallengeExperienceSnapshot;
  readonly settledInstanceIds: readonly string[];
  readonly lastResult: LiveChallengeLastResult | null;
  readonly facts: LiveChallengeFactsSnapshot | null;
}

interface LiveChallengeLastResult {
  readonly instanceId: string;
  readonly comparison: ChallengeRecordComparison;
  readonly creditedXp: number;
  readonly creditedMicroXp: number;
  readonly creditStatus: ChallengeCreditStatus;
  readonly creditReason: string | null;
  readonly rewardKey: string | null;
  readonly ledgerStatus: string | null;
}

interface LiveChallengeFactsSnapshot {
  readonly instanceId: string;
  readonly activatedAtTick: number;
  readonly zoneVisits: readonly Readonly<{
    zoneId: string;
    enteredTick: number;
    exitedTick: number | null;
  }>[];
  readonly checkpoints: readonly Readonly<{ checkpointId: string; tick: number }>[];
  readonly parked: readonly Readonly<{
    zoneId: string;
    tick: number;
    speedMps: number;
    headingErrorRad: number;
    dwellTicks: number;
  }>[];
  readonly driftSamples: readonly Readonly<{
    zoneId: string;
    tick: number;
    speedMps: number;
    slipAngleRad: number;
    collisionImpulseNs: number;
  }>[];
  readonly comfortSamples: readonly Readonly<{
    tick: number;
    accelerationMps2: number;
    jerkMps3: number;
  }>[];
  readonly destruction: readonly Readonly<{
    objectId: string;
    zoneId: string;
    tick: number;
  }>[];
  readonly learning: LiveChallengeLearningFact | null;
  readonly incidents: readonly string[];
  readonly currentZoneId: string | null;
  readonly currentEnteredTick: number | null;
  readonly parkingSinceTick: number | null;
  readonly parkedReported: boolean;
  readonly previousPositionM: Readonly<{ x: number; z: number }> | null;
}

interface MutableFactsState {
  instanceId: string;
  activatedAtTick: number;
  zoneVisits: {
    zoneId: string;
    enteredTick: number;
    exitedTick: number | null;
  }[];
  checkpoints: { checkpointId: string; tick: number }[];
  parked: {
    zoneId: string;
    tick: number;
    speedMps: number;
    headingErrorRad: number;
    dwellTicks: number;
  }[];
  driftSamples: {
    zoneId: string;
    tick: number;
    speedMps: number;
    slipAngleRad: number;
    collisionImpulseNs: number;
  }[];
  comfortSamples: { tick: number; accelerationMps2: number; jerkMps3: number }[];
  destruction: { objectId: string; zoneId: string; tick: number }[];
  learning: LiveChallengeLearningFact | null;
  incidents: Set<string>;
  currentZoneId: string | null;
  currentEnteredTick: number | null;
  parkingSinceTick: number | null;
  parkedReported: boolean;
  previousPositionM: { x: number; z: number } | null;
}

export interface LiveChallenges {
  readonly version: typeof LIVE_CHALLENGES_VERSION;
  beginSession(input: {
    readonly sessionId: string;
    readonly worldEpoch: number;
    readonly sessionKind: ChallengeSessionKind;
    readonly tick: number;
  }): LiveChallengeRead;
  step(input: LiveChallengeStepInput): LiveChallengeStepResult;
  /** Host/debug trigger; the automatic scheduler calls the same path. */
  offerNow(request?: {
    readonly templateId?: string;
    readonly seed?: number;
  }): ChallengeDirectorInstance | null;
  /** Read-only 231 plan preview; it never creates an offer or consumes an attempt. */
  preview(templateId: string, seed: number): LiveChallengePreview | null;
  accept(instanceId?: string): LiveChallengeActionResult;
  decline(instanceId?: string): LiveChallengeActionResult;
  retry(): LiveChallengeRetryOutcome;
  interrupt(reason: ChallengeCancellationReason): number;
  setOffersEnabled(enabled: boolean): LiveChallengeRead;
  panelSnapshot(): ChallengePanelSnapshot | null;
  read(): LiveChallengeRead;
  status(): LiveChallengeRead;
  checkpoint(): LiveChallengeCheckpoint;
  /**
   * PBI 278 restore hook: applies a validated 232/233 checkpoint without paying a reward. The
   * director is rolled back if the experience snapshot is refused.
   */
  restore(value: unknown): Readonly<{
    status: 'RESTORED' | 'REJECTED';
    code: string | null;
    message: string;
  }>;
  save(): void;
  dispose(): void;
}

const terminalStates = new Set<string>(CHALLENGE_TERMINAL_STATES);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function distanceM(
  left: Readonly<{ x: number; z: number }>,
  right: Readonly<{ x: number; z: number }>,
): number {
  const dx = left.x - right.x,
    dz = left.z - right.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** XZ point-in-polygon with boundary inclusion, over the real 032 zone vertices. */
function pointInPolygon(
  polygon: readonly Readonly<{ x: number; z: number }>[],
  point: Readonly<{ x: number; z: number }>,
): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]!,
      b = polygon[previous]!;
    if (a.z > point.z !== b.z > point.z) {
      const x = ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

function emptyFacts(instance: ChallengeDirectorInstance): MutableFactsState {
  return {
    instanceId: instance.instanceId,
    activatedAtTick: instance.activatedAtTick ?? instance.offeredAtTick,
    zoneVisits: [],
    checkpoints: [],
    parked: [],
    driftSamples: [],
    comfortSamples: [],
    destruction: [],
    learning: null,
    incidents: new Set<string>(),
    currentZoneId: null,
    currentEnteredTick: null,
    parkingSinceTick: null,
    parkedReported: false,
    previousPositionM: null,
  };
}

function freezeFacts(state: MutableFactsState): LiveChallengeFactsSnapshot {
  return Object.freeze({
    instanceId: state.instanceId,
    activatedAtTick: state.activatedAtTick,
    zoneVisits: Object.freeze(state.zoneVisits.map((entry) => Object.freeze({ ...entry }))),
    checkpoints: Object.freeze(state.checkpoints.map((entry) => Object.freeze({ ...entry }))),
    parked: Object.freeze(state.parked.map((entry) => Object.freeze({ ...entry }))),
    driftSamples: Object.freeze(state.driftSamples.map((entry) => Object.freeze({ ...entry }))),
    comfortSamples: Object.freeze(state.comfortSamples.map((entry) => Object.freeze({ ...entry }))),
    destruction: Object.freeze(state.destruction.map((entry) => Object.freeze({ ...entry }))),
    learning: state.learning === null ? null : Object.freeze({ ...state.learning }),
    incidents: Object.freeze([...state.incidents]),
    currentZoneId: state.currentZoneId,
    currentEnteredTick: state.currentEnteredTick,
    parkingSinceTick: state.parkingSinceTick,
    parkedReported: state.parkedReported,
    previousPositionM:
      state.previousPositionM === null ? null : Object.freeze({ ...state.previousPositionM }),
  });
}

function refusal(
  code: ChallengeDirectorRefusal,
  message: string,
  detail: readonly string[] = [],
): LiveChallengeActionResult {
  return Object.freeze({
    status: 'REFUSED' as const,
    code,
    message,
    detail: Object.freeze([...detail]),
  });
}

function plannerRoutePort(
  planner: RoutePlanner,
  frame: () => LiveChallengeFrameFact | null,
  laneFor?: (frame: LiveChallengeFrameFact, taxiId: string) => string | null,
) {
  return Object.freeze({
    estimate(input: {
      taxiId: string;
      templateId: string;
      pickupZoneId: string;
      dropoffZoneId: string;
    }): ChallengeRouteEstimate {
      const current = frame();
      const taxi = current?.vehicles.find((entry) => entry.vehicleId === input.taxiId) ?? null;
      const origin =
        (current === null ? null : laneFor?.(current, input.taxiId)) ??
        taxi?.laneId ??
        input.pickupZoneId;
      try {
        const plan = planner.findRoute({
          origin,
          destination: input.dropoffZoneId,
          access: 'TAXI',
        });
        if (plan.status !== 'READY' || plan.path === null)
          return Object.freeze({
            reachable: false,
            seconds: 0,
            graphVersion: planner.graphVersion,
          });
        return Object.freeze({
          reachable: true,
          seconds: Math.max(0, plan.costSeconds),
          graphVersion: planner.graphVersion,
        });
      } catch {
        return Object.freeze({
          reachable: false,
          seconds: 0,
          graphVersion: planner.graphVersion,
        });
      }
    },
  });
}

/** Build the real 041 route port used by the 232 preflight. */
export function createLiveChallengeRoutePort(options: {
  readonly planner: RoutePlanner;
  readonly frame: () => LiveChallengeFrameFact | null;
  readonly laneFor?: (frame: LiveChallengeFrameFact, taxiId: string) => string | null;
}): ChallengeRoutePort {
  return plannerRoutePort(options.planner, options.frame, options.laneFor);
}

const LIVE_ZONE_ROLES: readonly ChallengeZoneKind[] = Object.freeze([
  'PARKING',
  'CHECKPOINT',
  'CHECKPOINT',
  'CHECKPOINT',
  'TOILET',
  'TOILET',
  'TOILET',
  'LANDMARK',
  'LANDMARK',
  'DRIFT_PAD',
  'DEMOLITION_ALLEY',
  'CHECKPOINT',
  'CHECKPOINT',
  'CHECKPOINT',
  'LANDMARK',
  'LANDMARK',
]);

/**
 * Map every real 032 service zone to the authored live role used by 231. The zone polygon and the
 * lane heading stay real; only the abstract `ChallengeZoneKind` is assigned here, exactly once and
 * deterministically by sorted zone id, so a reload cannot move an objective to another zone.
 */
export function createLiveChallengeZones(options: {
  readonly map: RoadMap;
  readonly graph: LaneGraph;
}): readonly LiveChallengeZoneFact[] {
  const areas = new Map(options.map.geometry.areas.map((area) => [area.id, area]));
  const nodes = new Map(options.map.geometry.nodes.map((node) => [node.id, node.positionM]));
  const zones = [...options.map.serviceZones].sort((left, right) => compareText(left.id, right.id));
  const result: LiveChallengeZoneFact[] = [];
  for (const [index, zone] of zones.entries()) {
    const area = areas.get(zone.geometryId);
    if (area === undefined) continue;
    const vertices = area.vertexNodeIds
      .map((nodeId) => nodes.get(nodeId))
      .filter((node): node is NonNullable<typeof node> => node !== undefined)
      .map((node) => Object.freeze({ x: node.x, z: node.z }));
    if (vertices.length < 3) continue;
    const anchor = nodes.get(zone.anchorNodeId) ?? vertices[0]!;
    const path = options.graph.getDirectedPath(zone.laneId);
    const points = path?.points ?? [];
    const first = points[0],
      last = points[points.length - 1];
    const headingRad =
      first === undefined || last === undefined || points.length < 2
        ? 0
        : Math.atan2(last.x - first.x, last.z - first.z);
    result.push(
      Object.freeze({
        zoneId: zone.id,
        kind: LIVE_ZONE_ROLES[index % LIVE_ZONE_ROLES.length]!,
        anchorM: Object.freeze({ x: anchor.x, z: anchor.z }),
        polygonM: Object.freeze(vertices),
        laneId: zone.laneId,
        headingRad,
      }),
    );
  }
  return Object.freeze(result);
}

export { challengeDirectorRefusals, CHALLENGE_DIRECTOR_VERSION, CHALLENGE_TICK_HZ };

/* ---------------------------------------------------------------------------------------------
 * Live composition
 * ------------------------------------------------------------------------------------------- */

interface CheckpointRead {
  readonly checkpoint: LiveChallengeCheckpoint;
  readonly facts: MutableFactsState | null;
  readonly lastResult: LiveChallengeLastResult | null;
  readonly settled: readonly string[];
}

function readCheckpointValue(
  value: unknown,
  identity: Readonly<{
    sessionId: string;
    worldEpoch: number;
    sessionKind: ChallengeSessionKind;
  }>,
): CheckpointRead | null {
  try {
    const data = record(value);
    requireContract(
      data.version === LIVE_CHALLENGES_CHECKPOINT_VERSION,
      'Unsupported live challenge checkpoint version',
    );
    requireContract(data.schemaVersion === 1 && data.units === 'SI', 'Checkpoint schema');
    requireContract(data.sessionId === identity.sessionId, 'Checkpoint session mismatch');
    requireContract(data.worldEpoch === identity.worldEpoch, 'Checkpoint epoch mismatch');
    requireContract(data.sessionKind === identity.sessionKind, 'Checkpoint kind mismatch');
    requireContract(typeof data.offersEnabled === 'boolean', 'Checkpoint offers flag');
    requireContract(
      typeof data.director === 'object' && data.director !== null,
      'Checkpoint director',
    );
    requireContract(
      typeof data.experience === 'object' && data.experience !== null,
      'Checkpoint experience',
    );
    const settled = Array.isArray(data.settledInstanceIds)
      ? data.settledInstanceIds.map((entry) => {
          requireContract(typeof entry === 'string', 'Checkpoint settled id');
          return entry;
        })
      : [];
    const facts = data.facts === null ? null : readFactsSnapshot(data.facts);
    const lastResult = data.lastResult === null ? null : readLastResult(data.lastResult);
    const checkpoint: LiveChallengeCheckpoint = Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      version: LIVE_CHALLENGES_CHECKPOINT_VERSION,
      sessionId: identity.sessionId,
      worldEpoch: identity.worldEpoch,
      sessionKind: identity.sessionKind,
      savedAtMs: tick(data.savedAtMs),
      challengeTick: tick(data.challengeTick),
      offersEnabled: data.offersEnabled,
      nextAutoOfferTick: tick(data.nextAutoOfferTick),
      director: data.director as ChallengeDirectorSnapshot,
      experience: data.experience as ChallengeExperienceSnapshot,
      settledInstanceIds: Object.freeze(settled),
      lastResult,
      facts: facts === null ? null : freezeFacts(facts),
    });
    return Object.freeze({ checkpoint, facts, lastResult, settled });
  } catch {
    return null;
  }
}

function readCheckpoint(
  raw: string,
  identity: Readonly<{
    sessionId: string;
    worldEpoch: number;
    sessionKind: ChallengeSessionKind;
  }>,
): CheckpointRead | null {
  try {
    return readCheckpointValue(JSON.parse(raw) as unknown, identity);
  } catch {
    return null;
  }
}

function readLastResult(value: unknown): LiveChallengeLastResult | null {
  try {
    const data = record(value);
    const comparison = data.comparison;
    requireContract(
      comparison === 'FIRST_RECORD' ||
        comparison === 'BETTER' ||
        comparison === 'EQUAL' ||
        comparison === 'WORSE' ||
        comparison === 'NOT_ELIGIBLE',
      'Checkpoint record comparison',
    );
    const status = data.creditStatus;
    requireContract(
      status === 'CREDITED' || status === 'DUPLICATE' || status === 'SKIPPED',
      'Checkpoint credit status',
    );
    return Object.freeze({
      instanceId: String(data.instanceId),
      comparison,
      creditedXp: tick(data.creditedXp),
      creditedMicroXp: tick(data.creditedMicroXp),
      creditStatus: status,
      creditReason: data.creditReason === null ? null : String(data.creditReason),
      rewardKey: data.rewardKey === null ? null : String(data.rewardKey),
      ledgerStatus: data.ledgerStatus === null ? null : String(data.ledgerStatus),
    });
  } catch {
    return null;
  }
}

function readFactsSnapshot(value: unknown): MutableFactsState | null {
  try {
    const data = record(value);
    const point = (entry: unknown): { x: number; z: number } => {
      const value = record(entry);
      return { x: Number(value.x), z: Number(value.z) };
    };
    const zoneVisits = (Array.isArray(data.zoneVisits) ? data.zoneVisits : []).map((entry) => {
      const visit = record(entry);
      return {
        zoneId: String(visit.zoneId),
        enteredTick: tick(visit.enteredTick),
        exitedTick: visit.exitedTick === null ? null : tick(visit.exitedTick),
      };
    });
    const checkpoints = (Array.isArray(data.checkpoints) ? data.checkpoints : []).map((entry) => {
      const crossing = record(entry);
      return { checkpointId: String(crossing.checkpointId), tick: tick(crossing.tick) };
    });
    const parked = (Array.isArray(data.parked) ? data.parked : []).map((entry) => {
      const attempt = record(entry);
      return {
        zoneId: String(attempt.zoneId),
        tick: tick(attempt.tick),
        speedMps: Number(attempt.speedMps),
        headingErrorRad: Number(attempt.headingErrorRad),
        dwellTicks: tick(attempt.dwellTicks),
      };
    });
    const driftSamples = (Array.isArray(data.driftSamples) ? data.driftSamples : []).map(
      (entry) => {
        const sample = record(entry);
        return {
          zoneId: String(sample.zoneId),
          tick: tick(sample.tick),
          speedMps: Number(sample.speedMps),
          slipAngleRad: Number(sample.slipAngleRad),
          collisionImpulseNs: Number(sample.collisionImpulseNs),
        };
      },
    );
    const comfortSamples = (Array.isArray(data.comfortSamples) ? data.comfortSamples : []).map(
      (entry) => {
        const sample = record(entry);
        return {
          tick: tick(sample.tick),
          accelerationMps2: Number(sample.accelerationMps2),
          jerkMps3: Number(sample.jerkMps3),
        };
      },
    );
    const destruction = (Array.isArray(data.destruction) ? data.destruction : []).map((entry) => {
      const fact = record(entry);
      return {
        objectId: String(fact.objectId),
        zoneId: String(fact.zoneId),
        tick: tick(fact.tick),
      };
    });
    const learning =
      data.learning === null
        ? null
        : (() => {
            const fact = record(data.learning);
            return {
              key: String(fact.key),
              activatedTick: tick(fact.activatedTick),
              observedTick: fact.observedTick === null ? null : tick(fact.observedTick),
              observedProfileId:
                fact.observedProfileId === null ? null : String(fact.observedProfileId),
            };
          })();
    const incidents = (Array.isArray(data.incidents) ? data.incidents : []).map((entry) =>
      String(entry),
    );
    const previousPositionM =
      data.previousPositionM === null ? null : point(data.previousPositionM);
    return {
      instanceId: String(data.instanceId),
      activatedAtTick: tick(data.activatedAtTick),
      zoneVisits,
      checkpoints,
      parked,
      driftSamples,
      comfortSamples,
      destruction,
      learning,
      incidents: new Set(incidents),
      currentZoneId: data.currentZoneId === null ? null : String(data.currentZoneId),
      currentEnteredTick: data.currentEnteredTick === null ? null : tick(data.currentEnteredTick),
      parkingSinceTick: data.parkingSinceTick === null ? null : tick(data.parkingSinceTick),
      parkedReported: data.parkedReported === true,
      previousPositionM,
    };
  } catch {
    return null;
  }
}

function liveOffer(
  instances: readonly ChallengeDirectorInstance[],
): ChallengeDirectorInstance | null {
  return instances.find((entry) => entry.state === 'OFFERED') ?? null;
}

function liveInstance(
  instances: readonly ChallengeDirectorInstance[],
): ChallengeDirectorInstance | null {
  return instances.find((entry) => entry.state === 'ACCEPTED' || entry.state === 'ACTIVE') ?? null;
}

function templateRow(template: ChallengeTemplate) {
  const offerLine = template.dialogue.find((entry) => entry.trigger === 'OFFER');
  return Object.freeze({
    templateId: template.templateId,
    controlRequirement: template.controlRequirement,
    premise: offerLine?.text ?? template.label,
  });
}

function zeroStepResult(atTick: number, paused: boolean): LiveChallengeStepResult {
  return Object.freeze({
    tick: atTick,
    paused,
    offered: null,
    completed: Object.freeze([] as string[]),
    failed: Object.freeze([] as string[]),
    expired: Object.freeze([] as string[]),
    declined: Object.freeze([] as string[]),
    cancelled: Object.freeze([] as string[]),
    refusal: null,
  });
}

export function createLiveChallenges(options: LiveChallengeOptions): LiveChallenges {
  requireContract(options !== null && typeof options === 'object', 'Live challenge options');
  requireContract(
    typeof options.sessionId === 'string' && options.sessionId.length > 0,
    'Live challenge session',
  );
  requireContract(
    typeof options.worldEpoch === 'number' && Number.isSafeInteger(options.worldEpoch),
    'Live challenge epoch',
  );
  requireContract(
    options.sessionKind === 'ACADEMY' || options.sessionKind === 'CHAOS',
    'Live challenge session kind',
  );
  requireContract(
    typeof options.playerId === 'string' && options.playerId.length > 0,
    'Live challenge player',
  );
  requireContract(
    typeof options.seed === 'number' &&
      Number.isSafeInteger(options.seed) &&
      options.seed >= 0 &&
      options.seed <= 0xffff_ffff,
    'Live challenge seed',
  );
  requireContract(
    typeof options.timeZone === 'string' && options.timeZone.length > 0,
    'Live challenge time zone',
  );
  requireContract(typeof options.calendar === 'function', 'Live challenge calendar port');
  requireContract(
    typeof options.ledger === 'object' &&
      options.ledger !== null &&
      typeof options.ledger.creditMission === 'function' &&
      typeof options.ledger.read === 'function',
    'Live challenges need the real 213 ledger',
  );
  requireContract(
    typeof options.ports === 'object' &&
      options.ports !== null &&
      typeof options.ports.frame === 'function' &&
      typeof options.ports.zones === 'function' &&
      typeof options.ports.route === 'object' &&
      options.ports.route !== null &&
      typeof options.ports.route.estimate === 'function',
    'Live challenge ports are incomplete',
  );
  const catalog: ChallengeTemplateCatalog = parseChallengeTemplateCatalog(
    options.catalog === undefined ? createChallengeTemplateCatalog() : options.catalog,
  );
  const ledger: PlayerProgress = options.ledger;
  const now = options.now ?? (() => Date.now());
  let sessionId = options.sessionId,
    worldEpoch = options.worldEpoch,
    sessionKind = options.sessionKind;
  let challengeTick = 0;
  let lastInputTick: number | null = null;
  let nextAutoOfferTick: number = LIVE_CHALLENGES_LIMITS.autoOfferDelayTicks;
  let offersEnabled = options.enabled !== false;
  let persistence: LiveChallengePersistenceState =
    options.storage === undefined ? 'MEMORY_ONLY' : 'SESSION_STORAGE';
  let persistenceError: string | null = null;
  let restored = false;
  let disposed = false;
  let lastSavedTick = -1;
  let lastOfferRefusal: LiveChallengeOfferRefusalView | null = null;
  let facts: MutableFactsState | null = null;
  let activeVerdict: ChallengeVerdict | null = null;
  let lastResult: LiveChallengeLastResult | null = null;
  const settled = new Set<string>();

  const templateFilter = (template: ChallengeTemplate): boolean =>
    LIVE_CHALLENGE_OBJECTIVE_SOURCES[template.objectiveKind] === 'LIVE';

  function createDirector(): ChallengeDirector {
    return createChallengeDirector({
      catalog,
      routes: options.ports.route,
      seed: randomUint32(options.seed, '277:session', worldEpoch),
      enabled: offersEnabled,
      templateFilter,
    });
  }

  let director = createDirector();
  let experience: ChallengeExperience;

  function buildCapabilities(kind: ChallengeSessionKind): ChallengeCapabilities {
    const learningKeys = [...(options.ports.learningKeys?.() ?? [])].sort(compareText);
    const vehicleClasses = [...(options.ports.vehicleClasses?.() ?? ['sedan', 'compact'])].sort(
      compareText,
    );
    const capabilities: ChallengeCapability[] = [
      'FREE_DRIVE',
      'MANUAL_CONTROL',
      'AUTO_CONTROL',
      'WORLD_RESET',
      'SESSION_RECORDS',
    ];
    if (learningKeys.length > 0) capabilities.push('LEARNING');
    return createChallengeCapabilities({
      sessionKind: kind,
      controlModes: learningKeys.length > 0 ? ['MANUAL', 'AUTO', 'LEARNING'] : ['MANUAL', 'AUTO'],
      vehicleClasses,
      zones: options.ports.zones().map((entry) => ({ zoneId: entry.zoneId, kind: entry.kind })),
      capabilities,
      learningKeys,
      campaignCompleted: Math.max(
        0,
        Math.min(8, Math.floor(options.ports.campaignCompleted?.() ?? 0)),
      ),
    });
  }

  function unavailableTemplates(): readonly LiveChallengeUnavailableTemplate[] {
    const caps = buildCapabilities(sessionKind);
    const eligibility = eligibleChallengeTemplates(catalog, caps);
    const rows: LiveChallengeUnavailableTemplate[] = [];
    for (const template of catalog.templates) {
      const reasons: string[] = [];
      const excluded = eligibility.excluded.find(
        (entry) => entry.templateId === template.templateId,
      );
      if (excluded !== undefined) reasons.push(...excluded.missing);
      const unsupported = liveChallengeTemplateUnavailableReason(template);
      if (unsupported !== null && !reasons.includes(unsupported)) reasons.push(unsupported);
      if (reasons.length === 0) continue;
      rows.push(
        Object.freeze({
          templateId: template.templateId,
          family: template.family,
          objectiveKind: template.objectiveKind,
          reasons: Object.freeze(reasons),
        }),
      );
    }
    return Object.freeze(
      rows
        .sort((left, right) => compareText(left.templateId, right.templateId))
        .slice(0, LIVE_CHALLENGES_LIMITS.unavailableTemplates),
    );
  }

  function zones(): readonly LiveChallengeZoneFact[] {
    return options.ports.zones();
  }

  function zoneAt(positionM: Readonly<{ x: number; z: number }>): LiveChallengeZoneFact | null {
    for (const zone of zones()) if (pointInPolygon(zone.polygonM, positionM)) return zone;
    return null;
  }

  function nearestZone(
    positionM: Readonly<{ x: number; z: number }>,
  ): LiveChallengeZoneFact | null {
    let nearest: LiveChallengeZoneFact | null = null;
    let best = Infinity;
    for (const zone of zones()) {
      const distance = distanceM(zone.anchorM, positionM);
      if (distance < best) {
        best = distance;
        nearest = zone;
      }
    }
    return nearest;
  }

  function playerTaxi(frame: LiveChallengeFrameFact): LiveChallengeVehicleFact | null {
    const candidates = [frame.playerVehicleId, frame.selectedVehicleId];
    for (const candidate of candidates) {
      if (candidate === null) continue;
      const vehicle = frame.vehicles.find((entry) => entry.vehicleId === candidate);
      if (vehicle !== undefined && vehicle.driverKind === 'TAXI') return vehicle;
    }
    return null;
  }

  function worldSnapshot(frame: LiveChallengeFrameFact): ChallengeWorldSnapshot {
    const taxi = playerTaxi(frame);
    const pickup = taxi === null ? null : zoneAt(taxi.positionM);
    const fallback =
      pickup ?? (taxi === null ? zones()[0] : nearestZone(taxi.positionM)) ?? zones()[0];
    return {
      sessionKind,
      sessionId,
      worldEpoch,
      simulatedTick: challengeTick,
      transferInProgress: false,
      taxi: {
        taxiId: taxi?.vehicleId ?? 'taxi:none',
        status: taxi?.status ?? 'OFFLINE',
        freeTaxis: frame.freeTaxis,
      },
      assignment: frame.assignment,
      passengerAboard: taxi?.passengerAboard ?? false,
      pickupZoneId: pickup?.zoneId ?? fallback?.zoneId ?? 'zone:none',
      fallbackDropoffZoneId: fallback?.zoneId ?? 'zone:none',
      reachableZoneIds: zones().map((entry) => entry.zoneId),
      capabilities: buildCapabilities(sessionKind),
    };
  }

  function calendar(): DailyCalendarDay {
    return resolveDailyCalendarDay(options.calendar());
  }

  function save(): void {
    if (disposed || options.storage === undefined) {
      persistence = options.storage === undefined ? 'MEMORY_ONLY' : persistence;
      return;
    }
    try {
      const checkpoint = buildCheckpoint();
      const serialized = JSON.stringify(checkpoint);
      requireContract(
        serialized.length <= LIVE_CHALLENGES_LIMITS.checkpointCodeUnits,
        'Live challenge checkpoint exceeds its code-unit budget',
      );
      options.storage.save(serialized);
      persistence = 'SESSION_STORAGE';
      persistenceError = null;
      lastSavedTick = challengeTick;
    } catch (error: unknown) {
      persistence = 'FAILED';
      persistenceError = error instanceof Error ? error.message : String(error);
    }
  }

  function buildCheckpoint(): LiveChallengeCheckpoint {
    return Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      version: LIVE_CHALLENGES_CHECKPOINT_VERSION,
      sessionId,
      worldEpoch,
      sessionKind,
      savedAtMs: tick(now()),
      challengeTick,
      offersEnabled: director.stats().enabled,
      nextAutoOfferTick,
      director: director.snapshot(),
      experience: experience.snapshot(),
      settledInstanceIds: Object.freeze([...settled]),
      lastResult,
      facts: facts === null ? null : freezeFacts(facts),
    });
  }

  function settleNewTerminals(): {
    completed: string[];
    failed: string[];
    expired: string[];
    declined: string[];
    cancelled: string[];
  } {
    const completed: string[] = [],
      failed: string[] = [],
      expired: string[] = [],
      declined: string[] = [],
      cancelled: string[] = [];
    for (const instance of director.instances()) {
      if (!terminalStates.has(instance.state) || settled.has(instance.instanceId)) continue;
      settled.add(instance.instanceId);
      const recordable =
        instance.state === 'COMPLETED' ||
        instance.state === 'FAILED' ||
        instance.state === 'CANCELLED';
      const record = recordable
        ? experience.record({ instance, calendar: options.calendar() })
        : null;
      const credit = experience.credit({ instance, calendar: options.calendar() });
      lastResult = Object.freeze({
        instanceId: instance.instanceId,
        comparison: record?.comparison ?? 'NOT_ELIGIBLE',
        creditedXp: credit.creditedXp,
        creditedMicroXp: credit.creditedMicroXp,
        creditStatus: credit.status,
        creditReason: credit.reason,
        rewardKey: credit.rewardKey,
        ledgerStatus: credit.ledgerStatus,
      });
      if (instance.state === 'COMPLETED') completed.push(instance.instanceId);
      else if (instance.state === 'FAILED') failed.push(instance.instanceId);
      else if (instance.state === 'EXPIRED') expired.push(instance.instanceId);
      else if (instance.state === 'DECLINED') declined.push(instance.instanceId);
      else cancelled.push(instance.instanceId);
    }
    if (
      completed.length + failed.length + expired.length + declined.length + cancelled.length >
      0
    ) {
      facts = null;
      activeVerdict = null;
      const remaining = director.stats().cooldownRemainingTicks;
      nextAutoOfferTick = Math.max(
        nextAutoOfferTick,
        challengeTick + remaining + LIVE_CHALLENGES_LIMITS.autoOfferRetryTicks,
      );
      save();
    }
    return { completed, failed, expired, declined, cancelled };
  }

  function collectFacts(): void {
    const instance = liveInstance(director.instances());
    if (instance === null || instance.state !== 'ACTIVE') return;
    facts ??= emptyFacts(instance);
    const state = facts;
    if (state.instanceId !== instance.instanceId) return;
    const frame = options.ports.frame();
    if (frame === null) return;
    const vehicle =
      frame.vehicles.find((entry) => entry.vehicleId === instance.taxiId) ??
      (instance.taxiId === null ? playerTaxi(frame) : null);
    if (vehicle === null) return;
    const objective = instance.objective;
    const objectiveZones = new Set(objective.zoneIds);
    const currentZone = zoneAt(vehicle.positionM);
    const currentId = currentZone?.zoneId ?? null;
    if (currentId !== state.currentZoneId) {
      if (state.currentZoneId !== null && state.currentEnteredTick !== null) {
        for (let index = state.zoneVisits.length - 1; index >= 0; index -= 1) {
          const visit = state.zoneVisits[index]!;
          if (visit.zoneId === state.currentZoneId && visit.exitedTick === null) {
            visit.exitedTick = challengeTick;
            break;
          }
        }
      }
      state.currentZoneId = currentId;
      state.currentEnteredTick = currentZone === null ? null : challengeTick;
      state.parkingSinceTick = null;
      state.parkedReported = false;
      if (currentZone !== null && objectiveZones.has(currentZone.zoneId)) {
        if (state.zoneVisits.length < LIVE_CHALLENGES_LIMITS.zoneVisits)
          state.zoneVisits.push({
            zoneId: currentZone.zoneId,
            enteredTick: challengeTick,
            exitedTick: null,
          });
        if (
          objective.objectiveKind === 'CHECKPOINTS' &&
          state.checkpoints.length < LIVE_CHALLENGES_LIMITS.checkpoints
        )
          state.checkpoints.push({ checkpointId: currentZone.zoneId, tick: challengeTick });
      }
    }
    if (currentZone !== null && objectiveZones.has(currentZone.zoneId)) {
      if (objective.objectiveKind === 'PARKING') {
        const maxSpeed = objective.thresholds['maxSpeedMps'] ?? 0;
        const maxHeading = objective.thresholds['maxHeadingErrorRad'] ?? 0;
        const minDwell = Math.ceil((objective.thresholds['minDwellS'] ?? 0) * CHALLENGE_TICK_HZ);
        const headingError = Math.abs(normalizeAngle(vehicle.yawRad - currentZone.headingRad));
        if (vehicle.speedMps <= maxSpeed && headingError <= maxHeading) {
          state.parkingSinceTick ??= challengeTick;
          const dwell = challengeTick - state.parkingSinceTick + 1;
          if (
            !state.parkedReported &&
            dwell >= minDwell &&
            state.parked.length < LIVE_CHALLENGES_LIMITS.parked
          ) {
            state.parked.push({
              zoneId: currentZone.zoneId,
              tick: challengeTick,
              speedMps: vehicle.speedMps,
              headingErrorRad: headingError,
              dwellTicks: dwell,
            });
            state.parkedReported = true;
          }
        } else {
          state.parkingSinceTick = null;
          state.parkedReported = false;
        }
      }
      if (objective.objectiveKind === 'DRIFT') {
        const minSpeed = objective.thresholds['minSpeedMps'] ?? 0;
        const minSlip = objective.thresholds['minSlipAngleRad'] ?? 0;
        if (state.previousPositionM !== null && vehicle.speedMps >= minSpeed) {
          const dx = vehicle.positionM.x - state.previousPositionM.x;
          const dz = vehicle.positionM.z - state.previousPositionM.z;
          if (Math.sqrt(dx * dx + dz * dz) > 0.05) {
            const slipAngle = normalizeAngle(Math.atan2(dx, dz) - vehicle.yawRad);
            if (
              Math.abs(slipAngle) >= minSlip &&
              state.driftSamples.length < LIVE_CHALLENGES_LIMITS.driftSamples
            )
              state.driftSamples.push({
                zoneId: currentZone.zoneId,
                tick: challengeTick,
                speedMps: vehicle.speedMps,
                slipAngleRad: slipAngle,
                collisionImpulseNs: 0,
              });
          }
        }
      }
    }
    if (objective.objectiveKind === 'LEARNING' && state.learning === null) {
      const learning = options.ports.learning?.() ?? null;
      if (learning !== null) state.learning = { ...learning };
    }
    for (const incident of options.ports.incidents?.() ?? []) {
      if (incident.taxiId !== vehicle.vehicleId) continue;
      if (incident.tick < state.activatedAtTick) continue;
      if (state.incidents.size >= LIVE_CHALLENGES_LIMITS.incidents) break;
      state.incidents.add(incident.factId);
    }
    state.previousPositionM = { x: vehicle.positionM.x, z: vehicle.positionM.z };
  }

  function factsFor(instance: ChallengeDirectorInstance) {
    const state = facts;
    const frame = options.ports.frame();
    const vehicle =
      frame?.vehicles.find((entry) => entry.vehicleId === instance.taxiId) ??
      (frame === null || frame === undefined ? null : playerTaxi(frame));
    return Object.freeze({
      tickHz: CHALLENGE_TICK_HZ,
      startedTick: state?.activatedAtTick ?? instance.activatedAtTick ?? challengeTick,
      endedTick: challengeTick,
      sessionKind,
      controlSource: vehicle?.controlMode ?? 'AUTO',
      passengerAboard: vehicle?.passengerAboard ?? false,
      incidents: state?.incidents.size ?? 0,
      zoneVisits: Object.freeze(
        (state?.zoneVisits ?? []).map((entry) =>
          Object.freeze({
            zoneId: entry.zoneId,
            enteredTick: entry.enteredTick,
            exitedTick: entry.exitedTick ?? challengeTick,
          }),
        ),
      ),
      checkpoints: Object.freeze(
        (state?.checkpoints ?? []).map((entry) => Object.freeze({ ...entry })),
      ),
      dropoffs: Object.freeze([] as never[]),
      parked: Object.freeze((state?.parked ?? []).map((entry) => Object.freeze({ ...entry }))),
      driftSamples: Object.freeze(
        (state?.driftSamples ?? []).map((entry) => Object.freeze({ ...entry })),
      ),
      destruction: Object.freeze(
        (state?.destruction ?? []).map((entry) => Object.freeze({ ...entry })),
      ),
      comfortSamples: Object.freeze(
        (state?.comfortSamples ?? []).map((entry) => Object.freeze({ ...entry })),
      ),
      learning:
        state === null || state.learning === null ? null : Object.freeze({ ...state.learning }),
    });
  }

  function evaluateActive(): void {
    const instance = liveInstance(director.instances());
    if (instance === null || instance.state !== 'ACTIVE') return;
    if (challengeTick >= instance.objective.deadlineTick) return;
    const result = director.evaluate({
      instanceId: instance.instanceId,
      facts: factsFor(instance),
    });
    if (result.status === 'IN_PROGRESS') activeVerdict = result.verdict;
    else if (result.status === 'COMPLETED' || result.status === 'FAILED') {
      activeVerdict = result.verdict;
      settleNewTerminals();
    }
  }

  function attemptOffer(
    source: 'AUTO' | 'HOST',
    request: { templateId?: string; seed?: number } = {},
  ): ChallengeDirectorInstance | null {
    const frame = options.ports.frame();
    if (frame === null) {
      lastOfferRefusal = Object.freeze({
        code: 'SESSION_INVALID',
        message: 'The live frame is not available',
        detail: Object.freeze([] as string[]),
        atTick: challengeTick,
        source,
      });
      return null;
    }
    const result = director.offer({
      world: worldSnapshot(frame),
      ...(request.templateId === undefined ? {} : { templateId: request.templateId }),
      ...(request.seed === undefined ? {} : { seed: request.seed }),
    });
    if (result.status === 'OFFERED') {
      lastOfferRefusal = null;
      activeVerdict = null;
      facts = null;
      save();
      return result.instance;
    }
    lastOfferRefusal = Object.freeze({
      code: result.code,
      message: result.message,
      detail: Object.freeze([...result.detail]),
      atTick: challengeTick,
      source,
    });
    if (source === 'AUTO')
      nextAutoOfferTick = challengeTick + LIVE_CHALLENGES_LIMITS.autoOfferRetryTicks;
    save();
    return null;
  }

  function autoOfferIfDue(): void {
    if (options.ports.offersAllowed?.() === false) return;
    const stats = director.stats();
    if (stats.activeOfferId !== null || stats.activeInstanceId !== null) return;
    if (challengeTick < nextAutoOfferTick) return;
    if (stats.cooldownRemainingTicks > 0) {
      nextAutoOfferTick = challengeTick + stats.cooldownRemainingTicks + 1;
      return;
    }
    const frame = options.ports.frame();
    if (frame === null) return;
    const taxi = playerTaxi(frame);
    if (
      taxi === null ||
      taxi.status !== 'AVAILABLE' ||
      taxi.passengerAboard ||
      frame.assignment !== null
    ) {
      nextAutoOfferTick = challengeTick + LIVE_CHALLENGES_LIMITS.autoOfferRetryTicks;
      return;
    }
    attemptOffer('AUTO');
    if (director.stats().activeOfferId === null)
      nextAutoOfferTick = challengeTick + LIVE_CHALLENGES_LIMITS.autoOfferRetryTicks;
  }

  function beginSession(input: {
    sessionId: string;
    worldEpoch: number;
    sessionKind: ChallengeSessionKind;
    tick: number;
  }): LiveChallengeRead {
    requireContract(!disposed, 'Live challenges are disposed');
    requireContract(
      typeof input.sessionId === 'string' && input.sessionId.length > 0,
      'Live challenge session id',
    );
    requireContract(
      Number.isSafeInteger(input.worldEpoch) && input.worldEpoch >= 0,
      'Live challenge world epoch',
    );
    requireContract(
      input.sessionKind === 'ACADEMY' || input.sessionKind === 'CHAOS',
      'Live challenge session kind',
    );
    const changed =
      input.sessionId !== sessionId ||
      input.worldEpoch !== worldEpoch ||
      input.sessionKind !== sessionKind;
    if (changed) {
      const hasLive =
        director.stats().activeOfferId !== null || director.stats().activeInstanceId !== null;
      if (hasLive) interrupt(input.sessionId === sessionId ? 'CITY_RESET' : 'SESSION_LEFT');
      sessionId = input.sessionId;
      worldEpoch = input.worldEpoch;
      sessionKind = input.sessionKind;
      director = createDirector();
      challengeTick = 0;
      lastInputTick = null;
      nextAutoOfferTick = LIVE_CHALLENGES_LIMITS.autoOfferDelayTicks;
      offersEnabled = options.enabled !== false;
      facts = null;
      activeVerdict = null;
      lastResult = null;
      lastOfferRefusal = null;
      settled.clear();
      save();
    } else {
      lastInputTick = null;
    }
    return read();
  }

  function step(input: LiveChallengeStepInput): LiveChallengeStepResult {
    requireContract(!disposed, 'Live challenges are disposed');
    const atTick = tick(input.tick);
    const paused = input.paused === true;
    let delta = 0;
    if (lastInputTick !== null && !paused) delta = Math.max(0, atTick - lastInputTick);
    lastInputTick = atTick;
    if (paused) return zeroStepResult(challengeTick, true);
    if (delta > 0) {
      const advanced = director.advance({ ticks: delta, paused: false });
      challengeTick = advanced.simulatedTick;
    }
    const settledNow = settleNewTerminals();
    const live = liveInstance(director.instances());
    if (live !== null && live.state === 'ACTIVE') {
      collectFacts();
      if (challengeTick % LIVE_CHALLENGES_LIMITS.evaluationIntervalTicks === 0) evaluateActive();
    }
    autoOfferIfDue();
    if (challengeTick - lastSavedTick >= 300) save();
    return Object.freeze({
      tick: challengeTick,
      paused: false,
      offered: director.stats().activeOfferId,
      completed: Object.freeze(settledNow.completed),
      failed: Object.freeze(settledNow.failed),
      expired: Object.freeze(settledNow.expired),
      declined: Object.freeze(settledNow.declined),
      cancelled: Object.freeze(settledNow.cancelled),
      refusal: lastOfferRefusal?.code ?? null,
    });
  }

  function offerNow(
    request: { templateId?: string; seed?: number } = {},
  ): ChallengeDirectorInstance | null {
    requireContract(!disposed, 'Live challenges are disposed');
    return attemptOffer('HOST', request);
  }

  function preview(templateId: string, seed: number): LiveChallengePreview | null {
    requireContract(!disposed, 'Live challenges are disposed');
    requireContract(typeof templateId === 'string' && templateId.length > 0, 'Preview template');
    requireContract(Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffff_ffff, 'Preview seed');
    const template = catalog.templates.find((entry) => entry.templateId === templateId);
    if (template === undefined || !templateFilter(template)) return null;
    try {
      const plan = planChallengeAttempt({
        template,
        catalogVersion: catalog.version,
        capabilities: buildCapabilities(sessionKind),
        sessionKind,
        seed,
        attempt: 1,
        startedTick: 0,
      });
      return Object.freeze({
        templateId: plan.templateId,
        templateVersion: plan.templateVersion,
        objectiveKind: plan.objective.objectiveKind,
        target: plan.objective.target,
        zoneIds: plan.objective.zoneIds,
        learningKey: plan.objective.learningKey,
      });
    } catch {
      return null;
    }
  }

  function accept(instanceId?: string): LiveChallengeActionResult {
    requireContract(!disposed, 'Live challenges are disposed');
    const offer =
      instanceId === undefined
        ? liveOffer(director.instances())
        : (director.instance(instanceId) ?? null);
    if (offer === null || offer.state !== 'OFFERED')
      return refusal('INVALID_STATE', 'There is no visible challenge offer to accept');
    const frame = options.ports.frame();
    if (frame === null) return refusal('SESSION_INVALID', 'The live frame is not available');
    const taxi = playerTaxi(frame);
    if (taxi === null)
      return refusal('NO_FREE_TAXI', 'The player has no taxi to reserve for a challenge');
    const accepted = director.accept({
      instanceId: offer.instanceId,
      taxi: {
        taxiId: taxi.vehicleId,
        status: taxi.status,
        freeTaxis: frame.freeTaxis,
      },
      assignment: frame.assignment,
      passengerAboard: taxi.passengerAboard,
    });
    if (accepted.status === 'REFUSED') {
      lastOfferRefusal = Object.freeze({
        code: accepted.code,
        message: accepted.message,
        detail: Object.freeze([...accepted.detail]),
        atTick: challengeTick,
        source: 'HOST',
      });
      return accepted;
    }
    if (accepted.duplicate) {
      return Object.freeze({
        status: 'ACCEPTED' as const,
        instance: accepted.instance,
        reservation: accepted.reservation,
        duplicate: true,
        xpDelta: 0 as const,
        penalty: 'NONE' as const,
      });
    }
    const activated = director.activate({ instanceId: accepted.instance.instanceId });
    if (activated.status === 'REFUSED') return activated;
    facts = emptyFacts(activated.instance);
    activeVerdict = null;
    nextAutoOfferTick = challengeTick + LIVE_CHALLENGES_LIMITS.autoOfferDelayTicks;
    save();
    return Object.freeze({
      status: 'ACCEPTED' as const,
      instance: activated.instance,
      reservation: accepted.reservation,
      duplicate: false,
      xpDelta: 0 as const,
      penalty: 'NONE' as const,
    });
  }

  function decline(instanceId?: string): LiveChallengeActionResult {
    requireContract(!disposed, 'Live challenges are disposed');
    const offer =
      instanceId === undefined
        ? (liveOffer(director.instances()) ??
          director.instances().find((entry) => entry.state === 'DECLINED') ??
          null)
        : (director.instance(instanceId) ?? null);
    if (offer === null) return refusal('INVALID_STATE', 'There is no challenge offer to decline');
    const declined = director.decline({ instanceId: offer.instanceId });
    if (declined.status === 'REFUSED') return declined;
    settleNewTerminals();
    return Object.freeze({
      status: 'DECLINED' as const,
      instance: declined.instance,
      duplicate: declined.duplicate,
      cooldownUntilTick: declined.cooldownUntilTick,
      xpDelta: 0 as const,
      reputationDelta: 0 as const,
      penalty: 'NONE' as const,
      rewardGranted: false as const,
    });
  }

  function retry(): LiveChallengeRetryOutcome {
    requireContract(!disposed, 'Live challenges are disposed');
    const failed = director
      .instances()
      .filter((entry) => entry.state === 'FAILED')
      .sort(
        (left, right) =>
          (right.endedAtTick ?? 0) - (left.endedAtTick ?? 0) ||
          compareText(left.instanceId, right.instanceId),
      )[0];
    if (failed === undefined)
      return Object.freeze({
        status: 'REFUSED' as const,
        code: 'NOT_FAILED' as const,
        message: 'The immediate retry applies only to a failed challenge',
        detail: Object.freeze([] as string[]),
        instance: null,
        attempt: null,
        newIdentity: false,
        xpDelta: 0 as const,
      });
    const result: ChallengeFastRetryResult = challengeFastRetry({
      director,
      instanceId: failed.instanceId,
      capabilities: buildCapabilities(sessionKind),
    });
    if (result.status === 'RESTARTED' && result.instance !== null) {
      facts = emptyFacts(result.instance);
      activeVerdict = null;
      save();
    }
    return Object.freeze({
      status: result.status,
      code: result.code,
      message: result.message,
      detail: result.detail,
      instance: result.instance,
      attempt: result.attempt,
      newIdentity: result.newIdentity,
      xpDelta: 0 as const,
    });
  }

  function interrupt(reason: ChallengeCancellationReason): number {
    requireContract(!disposed, 'Live challenges are disposed');
    const before = director.instances().filter((entry) => !terminalStates.has(entry.state)).length;
    if (before === 0) return 0;
    director.reset({ reason });
    settleNewTerminals();
    facts = null;
    activeVerdict = null;
    save();
    return before;
  }

  function read(): LiveChallengeRead {
    requireContract(!disposed, 'Live challenges are disposed');
    const stats = director.stats();
    const instances = director.instances();
    const offer = liveOffer(instances);
    const active = liveInstance(instances);
    const resultInstance =
      lastResult === null ? null : (director.instance(lastResult.instanceId) ?? null);
    const player = ledger.read();
    const challengeEntries = player.entries.filter(
      (entry) => decodeChallengeRewardKey(entry.causeId) !== null,
    );
    const day = calendar();
    return Object.freeze({
      version: LIVE_CHALLENGES_VERSION,
      sessionId,
      worldEpoch,
      sessionKind,
      tick: challengeTick,
      dailyDate: day.dailyDate,
      offersEnabled: stats.enabled,
      offer:
        offer === null
          ? null
          : Object.freeze({
              instanceId: offer.instanceId,
              templateId: offer.templateId,
              title: offer.title,
              objectiveKind: offer.objective.objectiveKind,
              target: offer.objective.target,
              zoneIds: offer.objective.zoneIds,
              rewardXp: offer.academyXp,
              deadlineTick: offer.objective.deadlineTick,
              expiresAtTick: offer.offerExpiresAtTick,
            }),
      active:
        active === null
          ? null
          : Object.freeze({
              instanceId: active.instanceId,
              templateId: active.templateId,
              title: active.title,
              objectiveKind: active.objective.objectiveKind,
              target: active.objective.target,
              zoneIds: active.objective.zoneIds,
              progress: activeVerdict?.progress ?? 0,
              deadlineTick: active.objective.deadlineTick,
              remainingTicks: Math.max(0, active.objective.deadlineTick - challengeTick),
              taxiId: active.taxiId,
            }),
      lastResult:
        lastResult === null || resultInstance === null
          ? null
          : Object.freeze({
              instanceId: resultInstance.instanceId,
              templateId: resultInstance.templateId,
              title: resultInstance.title,
              status: resultInstance.state,
              reason: resultInstance.outcome?.reason ?? '',
              progress: resultInstance.outcome?.verdict?.progress ?? 0,
              target: resultInstance.objective.target,
              endedAtTick: resultInstance.endedAtTick ?? 0,
              recordComparison: lastResult.comparison,
              creditedXp: lastResult.creditedXp,
              sessionKind: resultInstance.sessionKind,
            }),
      cooldownRemainingTicks: stats.cooldownRemainingTicks,
      nextAutoOfferTick,
      counters: Object.freeze({
        offers: stats.offers,
        refusedOffers: stats.refusedOffers,
        accepted: stats.accepted,
        declined: stats.declined,
        expired: stats.expiredOffers,
        completed: stats.completed,
        failed: stats.failed,
        cancelled: stats.cancelled,
      }),
      lastOfferRefusal,
      unavailableTemplates: unavailableTemplates(),
      records: experience.records().length,
      xpBalance: player.xpBalance,
      xpBalanceMicroXp: player.xpBalanceMicroXp,
      level: player.level,
      ledgerEntries: player.entries.length,
      challengeRewardEntries: challengeEntries.length,
      challengeCreditedXp: challengeEntries.reduce((total, entry) => total + entry.amountXp, 0),
      persistence,
      persistenceError,
      restored,
      factSources: LIVE_CHALLENGE_OBJECTIVE_SOURCES,
      limits: LIVE_CHALLENGES_LIMITS,
      profileWrites: 0 as const,
      xpDebits: 0 as const,
      learningJobs: 0 as const,
    });
  }

  function reactionFor(instance: ChallengeDirectorInstance | null): ChallengeReaction | null {
    if (instance === null) return null;
    if (lastResult !== null && lastResult.instanceId === instance.instanceId) {
      return challengeReaction({
        instance,
        catalog,
        credit: {
          status: lastResult.creditStatus,
          creditedXp: lastResult.creditedXp,
        },
      });
    }
    return challengeReaction({ instance, catalog });
  }

  function panelSnapshot(): ChallengePanelSnapshot | null {
    requireContract(!disposed, 'Live challenges are disposed');
    if (director.snapshot().sessionId === null) return null;
    const instances = director.instances();
    const offer = liveOffer(instances);
    const active = liveInstance(instances);
    const resultInstance =
      lastResult === null ? null : (director.instance(lastResult.instanceId) ?? null);
    const day = calendar();
    const daily: ChallengeDailySet = challengeDailyVariety({
      catalog,
      dailyDate: day.dailyDate,
      seed: randomUint32(options.seed, '277:daily', day.dayIndex),
      capabilities: buildCapabilities(sessionKind),
    });
    const composed = composeChallengePanelSnapshot({
      tick: challengeTick,
      sessionKind,
      offersEnabled: director.stats().enabled,
      offer,
      active,
      result: resultInstance,
      reaction: reactionFor(offer ?? resultInstance),
      records: experience.records(),
      daily,
      creditedXp: lastResult?.creditedXp ?? 0,
      recordComparison: lastResult?.comparison ?? 'NOT_ELIGIBLE',
      templates: catalog.templates.map(templateRow),
    });
    if (composed.active === null || activeVerdict === null || active === null) return composed;
    return parseChallengePanelSnapshot({
      ...composed,
      active: Object.freeze({ ...composed.active, progress: activeVerdict.progress }),
    });
  }

  function setOffersEnabled(enabled: boolean): LiveChallengeRead {
    requireContract(!disposed, 'Live challenges are disposed');
    requireContract(typeof enabled === 'boolean', 'Offers enabled flag');
    director.setOffersEnabled({ enabled });
    settleNewTerminals();
    nextAutoOfferTick = challengeTick + (enabled ? LIVE_CHALLENGES_LIMITS.autoOfferDelayTicks : 0);
    save();
    return read();
  }

  function applyCheckpoint(
    pending: CheckpointRead,
  ): Readonly<{ status: 'RESTORED' | 'REJECTED'; code: string | null; message: string }> {
    const beforeDirector = director.snapshot();
    const restoredDirector = director.restore(pending.checkpoint.director);
    if (restoredDirector.status !== 'RESTORED') {
      return Object.freeze({
        status: 'REJECTED' as const,
        code: restoredDirector.code,
        message: restoredDirector.message,
      });
    }
    const restoredExperience = experience.restore(pending.checkpoint.experience);
    if (restoredExperience.status !== 'RESTORED') {
      // The director changed before the experience was validated; put it back exactly.
      director.restore(beforeDirector);
      return Object.freeze({
        status: 'REJECTED' as const,
        code: restoredExperience.code,
        message: restoredExperience.message,
      });
    }
    challengeTick = director.stats().simulatedTick;
    offersEnabled = director.stats().enabled;
    nextAutoOfferTick = pending.checkpoint.nextAutoOfferTick;
    facts = pending.facts;
    lastResult = pending.lastResult;
    settled.clear();
    for (const id of pending.settled) settled.add(id);
    for (const instance of director.instances())
      if (terminalStates.has(instance.state)) settled.add(instance.instanceId);
    return Object.freeze({ status: 'RESTORED' as const, code: null, message: 'RESTORED' });
  }

  function restore(value: unknown): Readonly<{
    status: 'RESTORED' | 'REJECTED';
    code: string | null;
    message: string;
  }> {
    requireContract(!disposed, 'Live challenges are disposed');
    const pending = readCheckpointValue(value, { sessionId, worldEpoch, sessionKind });
    if (pending === null)
      return Object.freeze({
        status: 'REJECTED' as const,
        code: 'CHECKPOINT_INVALID',
        message: 'The live challenge checkpoint is invalid',
      });
    const applied = applyCheckpoint(pending);
    if (applied.status === 'RESTORED') save();
    return applied;
  }

  function checkpoint(): LiveChallengeCheckpoint {
    return buildCheckpoint();
  }

  function dispose(): void {
    if (disposed) return;
    save();
    disposed = true;
    facts = null;
    activeVerdict = null;
    settled.clear();
  }

  // Create the experience over the one shared ledger, then restore the session checkpoint if the
  // identity matches. A rejected snapshot is ignored as a whole instead of half-applying.
  let pending: CheckpointRead | null = null;
  if (options.storage !== undefined) {
    try {
      const raw = options.storage.load();
      if (raw !== null) pending = readCheckpoint(raw, { sessionId, worldEpoch, sessionKind });
      if (raw !== null && pending === null) {
        persistence = 'SESSION_STORAGE';
        persistenceError = 'CHECKPOINT_REJECTED';
      }
    } catch (error: unknown) {
      persistence = 'FAILED';
      persistenceError = error instanceof Error ? error.message : String(error);
    }
  }
  try {
    experience = createChallengeExperience({
      ledger,
      catalog,
      ...(pending === null ? {} : { snapshot: pending.checkpoint.experience }),
    });
  } catch (error: unknown) {
    pending = null;
    persistenceError = error instanceof Error ? error.message : String(error);
    experience = createChallengeExperience({ ledger, catalog });
  }
  if (pending !== null) {
    const applied = applyCheckpoint(pending);
    if (applied.status === 'RESTORED') {
      restored = true;
      persistence = 'SESSION_STORAGE';
      persistenceError = null;
    } else {
      director = createDirector();
      persistenceError = applied.message;
    }
  }

  return Object.freeze({
    version: LIVE_CHALLENGES_VERSION,
    beginSession,
    step,
    offerNow,
    preview,
    accept,
    decline,
    retry,
    interrupt,
    setOffersEnabled,
    panelSnapshot,
    read,
    status: read,
    checkpoint,
    restore,
    save,
    dispose,
  });
}
