import {
  choice,
  deriveOpportunitySeed,
  fields,
  list,
  number,
  randomUnit,
  requireContract,
  tick,
} from '../sessions';
import { parsePublishableDrivingProfile } from '../profiles';
import type { ParameterUnit } from '../profiles';
import { captureLongitudinalProfileData } from './longitudinal-control';
import type { BehaviorActor, BehaviorScope } from './behavior-fsm';

/**
 * 181 route and recovery policy: time/distance preference, perceived turn, signal and congestion
 * costs, reroute patience, U-turn willingness and the reverse recovery duration.
 *
 * The layer is a policy over the comparable alternatives of the tick, never a second router: the
 * delivered 041 planner owns the graph, the search and the delivered `costSeconds`, and each
 * alternative carries the facts of a real route (length, free-flow time, speed limit, turn and
 * signal counts, congestion delay). The layer only decides which comparable alternative the driver
 * prefers, when a reroute is committed, whether a U-turn is taken and how long a reverse recovery
 * lasts.
 *
 * **The weights are normalized.** `route_time_weight` and `route_distance_weight` are `weight`
 * (0–1), `route_congestion_penalty` is a `ratio` (0–2), while `route_turn_penalty` is `s/turn` and
 * `route_signal_penalty` is `s/signal` (0–20 and 0–60). Summed raw they mix seconds, metres,
 * counts and ratios, so a profile's absolute magnitude would silently change the choice. Every
 * coefficient is therefore the key's share of one common budget,
 * `share_k = w_k / (w_time + w_distance + w_turn + w_signal + w_congestion)`, quantized to 1e-12 so
 * that two profiles that differ only by the scale of the weights (`0.6` vs `6`) produce bit
 * identical coefficients. Three consequences follow and are proved by tests, not asserted:
 *
 * 1. Every metric becomes dimensionless against the same comparable set: the time term against the
 *    fastest declared style time, the distance term against the shortest declared length, the
 *    congestion term against the same reference time, and the turn/signal terms are counts. The
 *    score is a share of perceived cost, so it no longer depends on whether a driver writes 0.6 or
 *    6 for the same preference.
 * 2. The reference time/length are computed over the *declared* comparable set, not the admitted
 *    subset, so the U-turn gate cannot rescale the scores of the routes it did not touch.
 * 3. Because every coefficient is a share, a fixed absolute epsilon on the raw weighted total is
 *    scale dependent; the layer compares the normalized score against a documented dimensionless
 *    tolerance (`scoreTolerance`) and breaks ties by route id instead.
 *
 * **What each key does, in its own scenario.**
 * - `route_time_weight` (weight) — preference for the shorter style time. The time term is
 *   `share_time · styleTime / referenceTime`, where the style time is `length / (limit + M delta)`.
 * - `route_distance_weight` (weight) — preference for fewer metres:
 *   `share_distance · length / referenceLength`, a pure distance ratio so a short but slow route
 *   still wins when distance is what the driver values.
 * - `route_turn_penalty` (s/turn) — perceived cost of a sharp turn: `share_turn · turns`.
 * - `route_signal_penalty` (s/signal) — perceived cost of a signal: `share_signal · signals`.
 * - `route_congestion_penalty` (ratio) — sensitivity to the declared congestion delay:
 *   `share_congestion · congestionDelay / referenceTime`.
 * - `reroute_patience` (s) — how long a better admissible alternative is held before the reroute is
 *   committed: `max(1, ceil(key · 60))` ticks. A route that is no longer admissible is left at once
 *   (`FORCED_REROUTE`), so patience only ever delays a switch between two admissible routes.
 * - `u_turn_willingness` (probability) — one deterministic sample per identified opportunity
 *   (`deriveOpportunitySeed(seed, opportunityKey)` with the fixed key `u-turn`) decides whether a
 *   U-turn alternative is admitted. The key is inert when the world forbids the U-turn
 *   (`FORBIDDEN`) or cannot declare it (`UNKNOWN`): a forbidden manoeuvre is never admitted, at any
 *   value.
 * - `reverse_recovery_duration` (s) — the preferred duration of a reverse recovery. It is not a
 *   free parameter: the committed duration is `max(key, minimumReverseRecoveryS)`, the time needed
 *   to reverse the policy's minimum distance at the reference reverse speed (`3 m / 1.2 m/s =
 *   2.5 s`), so no admissible value — and not even the catalog minimum of 2 s — yields an
 *   instantaneous recovery. A recovery whose space behind is not declared clear is held
 *   (`RECOVERY_BLOCKED`) whatever the key says.
 *
 * **M interaction.** The layer reads the two delivered 046 M speed deltas,
 * `speed_delta_urban` and `speed_delta_residential` (m/s), and adds the matching one to a route's
 * authored speed limit before converting its length into a style time. The units stay the catalog
 * units, the delivered `travelTimeS` of every alternative is returned unchanged (the M keys never
 * rewrite the delivered 041 result), and the style consequence is explicit: on the same profile a
 * larger delta shortens every style time, and it shortens a slow street relatively more than a fast
 * one.
 *
 * The layer keeps no history (`retainedHistory: 0`): the caller carries the current route and the
 * tick the better alternative was first seen.
 */
export const ROUTE_POLICY_V2_KEYS = Object.freeze([
  'route_time_weight',
  'route_distance_weight',
  'route_turn_penalty',
  'route_signal_penalty',
  'route_congestion_penalty',
  'reroute_patience',
  'u_turn_willingness',
  'reverse_recovery_duration',
] as const);
export type RoutePolicyV2Key = (typeof ROUTE_POLICY_V2_KEYS)[number];
/** The delivered 046 M keys the layer reads without changing their meaning. */
export const ROUTE_POLICY_V2_M_KEYS = Object.freeze([
  'speed_delta_urban',
  'speed_delta_residential',
] as const);
export type RoutePolicyV2MKey = (typeof ROUTE_POLICY_V2_M_KEYS)[number];
export const ROUTE_POLICY_V2_LIMITS = Object.freeze({
  version: '181-route-policy-v2' as const,
  observationVersion: '181-route-observation-v1' as const,
  idCodeUnits: 256,
  profileCodeUnits: 128,
  opportunityKeyCodeUnits: 8192,
  tickHz: 60,
  maximumTimeS: 86400,
  maximumLengthM: 1000000,
  maximumCount: 1000,
  maximumAlternatives: 8,
  /** Same lower speed floor the delivered 041 cost model uses. */
  minimumSpeedMps: 1,
  /** Style speed ceiling: `limit + delta` is never above it. */
  maximumStyleSpeedMps: 60,
  /** Reference floor so a zero time or a zero length cannot divide by zero. */
  referenceFloor: 1,
  /** Shares are quantized so equivalent weight scales produce identical coefficients. */
  shareQuantization: 1e12,
  /** Dimensionless tie tolerance of the normalized score; ties are broken by route id. */
  scoreTolerance: 1e-6,
  /** Reverse recovery floor, in metres: the vehicle must clear at least this much. */
  minimumReverseDistanceM: 3,
  /** Documented reference reverse speed of the recovery manoeuvre. */
  reverseSpeedMps: 1.2,
  /** `3 m / 1.2 m/s`: the commitment can never be shorter than 2.5 s (150 ticks). */
  minimumReverseRecoveryS: 2.5,
  retainedHistory: 0,
});
export interface RoutePolicyV2Profile {
  readonly version: '181-route-policy-v2';
  readonly profileId: string;
  readonly versionId: string;
  readonly engineVersion: string;
  readonly values: Readonly<Record<RoutePolicyV2Key, number>>;
  readonly units: Readonly<Record<RoutePolicyV2Key, ParameterUnit>>;
  readonly provenance: Readonly<Record<RoutePolicyV2Key, string>>;
  readonly mValues: Readonly<Record<RoutePolicyV2MKey, number>>;
  readonly mUnits: Readonly<Record<RoutePolicyV2MKey, ParameterUnit>>;
}
export type RoutePolicyRoadClass = 'URBAN' | 'RESIDENTIAL';
/**
 * One comparable alternative of the tick: a real route between the same origin and destination.
 * The delivered 041 planner owns the path and `costSeconds`; the layer reads the facts the plan
 * exposes (length, free-flow time, limit) plus the counts the map owner declares (sharp turns,
 * signals, congestion delay, U-turn).
 */
export interface RoutePolicyV2Alternative {
  readonly id: string;
  readonly lengthM: number;
  /** Free-flow driving time on the route at the authored speed limit, s. */
  readonly travelTimeS: number;
  /** Mean free-flow speed of the route (length / free-flow time), m/s. */
  readonly freeFlowSpeedMps: number;
  readonly roadClass: RoutePolicyRoadClass;
  /** Perceived sharp turns on the route: declared direction changes above 45°. */
  readonly turns: number;
  readonly signals: number;
  /** Extra seconds the world declares for this route at this decision (congestion). */
  readonly congestionDelayS: number;
  /** The route requires a U-turn manoeuvre the map may or may not permit. */
  readonly uTurn: boolean;
}
export interface RoutePolicyV2Recovery {
  /** The world declares a reverse recovery is needed before any route can be followed. */
  readonly required: boolean;
  /** The world declares the space behind the vehicle is clear for reversing. */
  readonly reverseClear: boolean;
}
export interface RoutePolicyV2Observation extends BehaviorScope {
  readonly version: '181-route-observation-v1';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly originId: string;
  readonly destinationId: string;
  /** The route currently followed; null when the vehicle has none yet. */
  readonly currentRouteId: string | null;
  /** Tick the better alternative was first seen; null when it is this tick's discovery. */
  readonly waitingSinceTick: number | null;
  /** The world's explicit U-turn declaration at the junction; UNKNOWN is not a permission. */
  readonly uTurn: 'PERMITTED' | 'FORBIDDEN' | 'UNKNOWN';
  readonly recovery: RoutePolicyV2Recovery;
}
export interface RoutePolicyV2Input extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  /** uint32 vehicle seed from the 006 addressing; the opportunity seed derives from it. */
  readonly seed: number;
  /** Stable opportunity identity of this decision; addresses the once-per-opportunity sample. */
  readonly opportunityKey: string;
  readonly profile: RoutePolicyV2Profile | null;
  readonly observation: RoutePolicyV2Observation;
  /** Comparable alternatives of the same origin/destination; empty means none exist. */
  readonly alternatives: readonly RoutePolicyV2Alternative[];
}
export type RoutePolicyV2Action = 'ROUTE' | 'REROUTE_WAIT' | 'RECOVERY' | 'HOLD' | 'UNAVAILABLE';
export type RoutePolicyV2RerouteDecision = 'KEPT' | 'WAIT' | 'COMMIT' | 'FORCED' | 'NONE';
export type RoutePolicyV2Reason =
  | 'ROUTE_POLICY_V2'
  | 'NO_AUTO_AUTHORITY'
  | 'MISSING_PROFILE'
  | 'FOREIGN_OR_STALE_OBSERVATION'
  | 'NO_ALTERNATIVES'
  | 'DUPLICATE_ALTERNATIVE'
  | 'NO_ADMISSIBLE_ROUTE'
  | 'ROUTE_KEPT'
  | 'ROUTE_SELECTED'
  | 'REROUTE_WAIT'
  | 'REROUTE_COMMIT'
  | 'FORCED_REROUTE'
  | 'RECOVERY_BLOCKED'
  | 'REVERSE_RECOVERY';
export interface RoutePolicyV2ScoredRoute {
  readonly id: string;
  /** False when the U-turn gate excluded the route; an excluded route has no score. */
  readonly admitted: boolean;
  readonly score: number | null;
  /** The delivered free-flow time of the route, unchanged by the R and M keys. */
  readonly travelTimeS: number;
  /** `length / (limit + M delta)`, clamped to the policy speed range. */
  readonly styleTimeS: number;
  readonly lengthM: number;
  readonly turns: number;
  readonly signals: number;
  readonly congestionDelayS: number;
  readonly uTurn: boolean;
}
export interface RoutePolicyV2Weights {
  readonly time: number;
  readonly distance: number;
  readonly turn: number;
  readonly signal: number;
  readonly congestion: number;
}
export interface RoutePolicyV2Command extends BehaviorScope {
  readonly version: '181-route-policy-v2';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly reason: RoutePolicyV2Reason;
  readonly action: RoutePolicyV2Action;
  readonly originId: string | null;
  readonly destinationId: string | null;
  readonly currentRouteId: string | null;
  /** The best admitted alternative, independent of the patience gate. */
  readonly candidateRouteId: string | null;
  /** The route actually committed for this tick (the current one while patience runs). */
  readonly selectedRouteId: string | null;
  readonly weights: RoutePolicyV2Weights | null;
  readonly referenceSeconds: number | null;
  readonly referenceMetres: number | null;
  readonly routes: readonly RoutePolicyV2ScoredRoute[];
  readonly uTurn: {
    readonly permission: 'PERMITTED' | 'FORBIDDEN' | 'UNKNOWN' | null;
    readonly sample: number | null;
    readonly admitted: boolean;
  };
  readonly reroute: {
    readonly waitingSinceTick: number | null;
    readonly elapsedTicks: number | null;
    readonly patienceTicks: number | null;
    readonly remainingTicks: number | null;
    readonly decision: RoutePolicyV2RerouteDecision;
  };
  readonly recovery: {
    readonly required: boolean;
    readonly reverseClear: boolean;
    readonly committed: boolean;
    readonly preferredDurationS: number | null;
    readonly durationS: number | null;
    readonly ticks: number | null;
    readonly distanceM: number | null;
    /** True when the floor raised the preferred duration. */
    readonly floored: boolean;
  };
  readonly retainedHistory: 0;
}
let compiling = false;
let evaluating = false;
export function getRoutePolicyV2Stats() {
  return Object.freeze({ compiling, evaluating, retainedHistory: 0 });
}
const profiles = new WeakSet<object>();
const observationFields = [
  'version',
  'units',
  'sessionId',
  'worldEpoch',
  'actor',
  'tick',
  'originId',
  'destinationId',
  'currentRouteId',
  'waitingSinceTick',
  'uTurn',
  'recovery',
] as const;
const recoveryFields = ['required', 'reverseClear'] as const;
const alternativeFields = [
  'id',
  'lengthM',
  'travelTimeS',
  'freeFlowSpeedMps',
  'roadClass',
  'turns',
  'signals',
  'congestionDelayS',
  'uTurn',
] as const;
const inputFields = [
  'sessionId',
  'worldEpoch',
  'actor',
  'decisionTick',
  'authority',
  'seed',
  'opportunityKey',
  'profile',
  'observation',
  'alternatives',
] as const;
function identity(value: unknown, maximum: number = ROUTE_POLICY_V2_LIMITS.idCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= maximum &&
      value.trim() === value,
    'Invalid route policy v2 identity',
  );
  return value;
}
function actor(value: unknown): BehaviorActor {
  const data = fields(value, ['id', 'incarnation']);
  return Object.freeze({ id: identity(data.id), incarnation: tick(data.incarnation) });
}
function sameScope(a: BehaviorScope, b: BehaviorScope): boolean {
  return a.sessionId === b.sessionId && a.worldEpoch === b.worldEpoch;
}
function sameActor(a: BehaviorActor, b: BehaviorActor): boolean {
  return a.id === b.id && a.incarnation === b.incarnation;
}
function seed(value: unknown): number {
  requireContract(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff,
    'Invalid route policy v2 seed',
  );
  return value;
}
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
function flag(value: unknown, message: string): boolean {
  requireContract(typeof value === 'boolean', message);
  return value;
}
export function compileRoutePolicyProfile(input: unknown): RoutePolicyV2Profile {
  requireContract(!compiling, 'Reentrant route policy v2 profile compilation');
  compiling = true;
  try {
    const detached = captureLongitudinalProfileData(input),
      published = parsePublishableDrivingProfile(detached),
      values = {} as Record<RoutePolicyV2Key, number>,
      units = {} as Record<RoutePolicyV2Key, ParameterUnit>,
      provenance = {} as Record<RoutePolicyV2Key, string>,
      mValues = {} as Record<RoutePolicyV2MKey, number>,
      mUnits = {} as Record<RoutePolicyV2MKey, ParameterUnit>;
    for (const key of ROUTE_POLICY_V2_KEYS) {
      requireContract(
        Object.hasOwn(published.parameters, key),
        'Missing route policy v2 parameter',
      );
      values[key] = published.parameters[key];
      units[key] = published.unitsByParameter[key];
      provenance[key] = published.provenanceByParameter[key];
    }
    for (const key of ROUTE_POLICY_V2_M_KEYS) {
      requireContract(
        Object.hasOwn(published.parameters, key),
        'Missing route policy v2 M parameter',
      );
      mValues[key] = published.parameters[key];
      mUnits[key] = published.unitsByParameter[key];
    }
    const result: RoutePolicyV2Profile = Object.freeze({
      version: ROUTE_POLICY_V2_LIMITS.version,
      profileId: identity(published.profileId),
      versionId: identity(published.versionId, ROUTE_POLICY_V2_LIMITS.profileCodeUnits),
      engineVersion: identity(published.engineVersion),
      values: Object.freeze(values),
      units: Object.freeze(units),
      provenance: Object.freeze(provenance),
      mValues: Object.freeze(mValues),
      mUnits: Object.freeze(mUnits),
    });
    profiles.add(result);
    return result;
  } finally {
    compiling = false;
  }
}
function alternative(value: unknown): RoutePolicyV2Alternative {
  const data = fields(value, alternativeFields),
    turns = number(data.turns, 0, ROUTE_POLICY_V2_LIMITS.maximumCount),
    signals = number(data.signals, 0, ROUTE_POLICY_V2_LIMITS.maximumCount);
  requireContract(Number.isSafeInteger(turns), 'Route policy v2 turn count is not an integer');
  requireContract(Number.isSafeInteger(signals), 'Route policy v2 signal count is not an integer');
  return Object.freeze({
    id: identity(data.id),
    lengthM: number(data.lengthM, 0, ROUTE_POLICY_V2_LIMITS.maximumLengthM),
    travelTimeS: number(data.travelTimeS, 0, ROUTE_POLICY_V2_LIMITS.maximumTimeS),
    freeFlowSpeedMps: number(data.freeFlowSpeedMps, 0.5, 200),
    roadClass: choice(data.roadClass, ['URBAN', 'RESIDENTIAL'] as const),
    turns,
    signals,
    congestionDelayS: number(data.congestionDelayS, 0, ROUTE_POLICY_V2_LIMITS.maximumTimeS),
    uTurn: flag(data.uTurn, 'Invalid route policy v2 U-turn flag'),
  });
}
interface AdmittedObservation extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly originId: string;
  readonly destinationId: string;
  readonly currentRouteId: string | null;
  readonly waitingSinceTick: number | null;
  readonly uTurn: 'PERMITTED' | 'FORBIDDEN' | 'UNKNOWN';
  readonly recovery: RoutePolicyV2Recovery;
}
function observation(value: unknown, decisionTick: number): AdmittedObservation {
  const data = fields(value, observationFields),
    recovery = fields(data.recovery, recoveryFields),
    waitingSinceTick = data.waitingSinceTick === null ? null : tick(data.waitingSinceTick);
  requireContract(
    data.version === ROUTE_POLICY_V2_LIMITS.observationVersion && data.units === 'SI',
    'Invalid route policy v2 observation version/units',
  );
  requireContract(
    waitingSinceTick === null || waitingSinceTick <= decisionTick,
    'Route policy v2 wait started after the decision tick',
  );
  return Object.freeze({
    sessionId: identity(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    actor: actor(data.actor),
    tick: tick(data.tick),
    originId: identity(data.originId),
    destinationId: identity(data.destinationId),
    currentRouteId: data.currentRouteId === null ? null : identity(data.currentRouteId),
    waitingSinceTick,
    uTurn: choice(data.uTurn, ['PERMITTED', 'FORBIDDEN', 'UNKNOWN'] as const),
    recovery: Object.freeze({
      required: flag(recovery.required, 'Invalid route policy v2 recovery flag'),
      reverseClear: flag(recovery.reverseClear, 'Invalid route policy v2 reverse clearance flag'),
    }),
  });
}
/** Quantized share of one common budget; equivalent weight scales give the same coefficient. */
function shares(values: Readonly<Record<RoutePolicyV2Key, number>>): RoutePolicyV2Weights {
  const total =
      values.route_time_weight +
      values.route_distance_weight +
      values.route_turn_penalty +
      values.route_signal_penalty +
      values.route_congestion_penalty,
    share = (value: number) =>
      total > 0
        ? Math.round((value / total) * ROUTE_POLICY_V2_LIMITS.shareQuantization) /
          ROUTE_POLICY_V2_LIMITS.shareQuantization
        : 0;
  return Object.freeze({
    time: share(values.route_time_weight),
    distance: share(values.route_distance_weight),
    turn: share(values.route_turn_penalty),
    signal: share(values.route_signal_penalty),
    congestion: share(values.route_congestion_penalty),
  });
}
function styleDeltaMps(
  mValues: Readonly<Record<RoutePolicyV2MKey, number>>,
  roadClass: RoutePolicyRoadClass,
): number {
  return roadClass === 'URBAN' ? mValues.speed_delta_urban : mValues.speed_delta_residential;
}
/**
 * Pure 181 layer. The input is admitted first and any refusal dominates; the recovery channel runs
 * before any scoring (a blocked vehicle cannot follow a route) and the eight R keys then act only in
 * their own scenario.
 */
export function evaluateRoutePolicyV2(input: RoutePolicyV2Input): RoutePolicyV2Command {
  requireContract(!evaluating, 'Reentrant route policy v2 evaluation');
  evaluating = true;
  try {
    const data = fields(input, inputFields),
      world = { sessionId: identity(data.sessionId), worldEpoch: tick(data.worldEpoch) },
      subject = actor(data.actor),
      decisionTick = tick(data.decisionTick),
      authority = choice(data.authority, ['AUTO', 'MANUAL', 'LEARNING'] as const),
      vehicleSeed = seed(data.seed),
      opportunityKey = identity(
        data.opportunityKey,
        ROUTE_POLICY_V2_LIMITS.opportunityKeyCodeUnits,
      );
    requireContract(
      data.profile === null || (typeof data.profile === 'object' && profiles.has(data.profile)),
      'Route policy v2 profile token provenance',
    );
    const profile = data.profile as RoutePolicyV2Profile | null,
      observed = observation(data.observation, decisionTick),
      declared = list(data.alternatives, alternative),
      ids = new Set<string>();
    let duplicated = false;
    for (const route of declared) {
      if (ids.has(route.id)) duplicated = true;
      ids.add(route.id);
    }
    requireContract(
      declared.length <= ROUTE_POLICY_V2_LIMITS.maximumAlternatives,
      'Route policy v2 alternative capacity exceeded',
    );
    let reason: RoutePolicyV2Reason = 'ROUTE_POLICY_V2',
      action: RoutePolicyV2Action = 'UNAVAILABLE',
      weights: RoutePolicyV2Weights | null = null,
      referenceSeconds: number | null = null,
      referenceMetres: number | null = null,
      routes: readonly RoutePolicyV2ScoredRoute[] = Object.freeze([]),
      candidateRouteId: string | null = null,
      selectedRouteId: string | null = null;
    // The three diagnostic records are mutated in place, not rebound.
    const uTurn = {
        permission: null as 'PERMITTED' | 'FORBIDDEN' | 'UNKNOWN' | null,
        sample: null as number | null,
        admitted: false,
      },
      reroute = {
        waitingSinceTick: observed.waitingSinceTick,
        elapsedTicks: null as number | null,
        patienceTicks: null as number | null,
        remainingTicks: null as number | null,
        decision: 'NONE' as RoutePolicyV2RerouteDecision,
      },
      recovery = {
        required: observed.recovery.required,
        reverseClear: observed.recovery.reverseClear,
        committed: false,
        preferredDurationS: null as number | null,
        durationS: null as number | null,
        ticks: null as number | null,
        distanceM: null as number | null,
        floored: false,
      };
    if (authority !== 'AUTO') reason = 'NO_AUTO_AUTHORITY';
    else if (profile === null) reason = 'MISSING_PROFILE';
    else if (
      !sameScope(world, observed) ||
      !sameActor(subject, observed.actor) ||
      observed.tick !== decisionTick
    )
      reason = 'FOREIGN_OR_STALE_OBSERVATION';
    else if (declared.length === 0) reason = 'NO_ALTERNATIVES';
    else if (duplicated) reason = 'DUPLICATE_ALTERNATIVE';
    if (reason === 'ROUTE_POLICY_V2' && profile !== null) {
      const values = profile.values,
        mValues = profile.mValues,
        patienceTicks = Math.max(
          1,
          Math.ceil(values.reroute_patience * ROUTE_POLICY_V2_LIMITS.tickHz),
        );
      weights = shares(values);
      // Facts of every declared alternative, before any gate: the reference stays stable.
      const styleTimes = declared.map((route) => {
          const speed = clamp(
            route.freeFlowSpeedMps + styleDeltaMps(mValues, route.roadClass),
            ROUTE_POLICY_V2_LIMITS.minimumSpeedMps,
            ROUTE_POLICY_V2_LIMITS.maximumStyleSpeedMps,
          );
          return route.lengthM / speed;
        }),
        lengths = declared.map((route) => route.lengthM);
      referenceSeconds = Math.max(ROUTE_POLICY_V2_LIMITS.referenceFloor, Math.min(...styleTimes));
      referenceMetres = Math.max(ROUTE_POLICY_V2_LIMITS.referenceFloor, Math.min(...lengths));
      // The U-turn gate: a forbidden or undeclared U-turn is never admitted, at any key value.
      uTurn.permission = observed.uTurn;
      if (declared.some((route) => route.uTurn) && observed.uTurn === 'PERMITTED') {
        uTurn.sample = randomUnit(deriveOpportunitySeed(vehicleSeed, opportunityKey), 'u-turn', 0);
        uTurn.admitted = uTurn.sample < values.u_turn_willingness;
      }
      const scored = declared.map((route, index) => {
          const admitted = !route.uTurn || uTurn.admitted,
            styleTimeS = styleTimes[index],
            score = admitted
              ? weights!.time * (styleTimeS / referenceSeconds!) +
                weights!.distance * (route.lengthM / referenceMetres!) +
                weights!.turn * route.turns +
                weights!.signal * route.signals +
                weights!.congestion * (route.congestionDelayS / referenceSeconds!)
              : null;
          return Object.freeze({
            id: route.id,
            admitted,
            score,
            travelTimeS: route.travelTimeS,
            styleTimeS,
            lengthM: route.lengthM,
            turns: route.turns,
            signals: route.signals,
            congestionDelayS: route.congestionDelayS,
            uTurn: route.uTurn,
          });
        }),
        admittedRoutes = scored.filter((route) => route.admitted);
      routes = Object.freeze(scored);
      if (observed.recovery.required) {
        // The recovery channel dominates: a blocked vehicle cannot follow any route of the tick.
        recovery.preferredDurationS = values.reverse_recovery_duration;
        if (!observed.recovery.reverseClear) {
          action = 'HOLD';
          reason = 'RECOVERY_BLOCKED';
        } else {
          const durationS = Math.max(
            values.reverse_recovery_duration,
            ROUTE_POLICY_V2_LIMITS.minimumReverseRecoveryS,
          );
          recovery.committed = true;
          recovery.durationS = durationS;
          recovery.ticks = Math.ceil(durationS * ROUTE_POLICY_V2_LIMITS.tickHz);
          recovery.distanceM = durationS * ROUTE_POLICY_V2_LIMITS.reverseSpeedMps;
          recovery.floored = durationS > values.reverse_recovery_duration;
          action = 'RECOVERY';
          reason = 'REVERSE_RECOVERY';
        }
      } else if (admittedRoutes.length === 0) {
        action = 'HOLD';
        reason = 'NO_ADMISSIBLE_ROUTE';
      } else {
        let best = admittedRoutes[0];
        for (const route of admittedRoutes)
          if (
            route.score! < best.score! - ROUTE_POLICY_V2_LIMITS.scoreTolerance ||
            (Math.abs(route.score! - best.score!) <= ROUTE_POLICY_V2_LIMITS.scoreTolerance &&
              route.id < best.id)
          )
            best = route;
        candidateRouteId = best.id;
        reroute.patienceTicks = patienceTicks;
        if (best.id === observed.currentRouteId) {
          reroute.decision = 'KEPT';
          action = 'ROUTE';
          reason = 'ROUTE_KEPT';
          selectedRouteId = best.id;
        } else if (observed.currentRouteId === null) {
          // No route is followed yet: the first decision commits without waiting for patience.
          reroute.decision = 'COMMIT';
          action = 'ROUTE';
          reason = 'ROUTE_SELECTED';
          selectedRouteId = best.id;
        } else if (admittedRoutes.every((route) => route.id !== observed.currentRouteId)) {
          // Leaving an inadmissible route is safety, not patience: the switch is immediate.
          reroute.decision = 'FORCED';
          action = 'ROUTE';
          reason = 'FORCED_REROUTE';
          selectedRouteId = best.id;
        } else {
          const elapsedTicks =
            observed.waitingSinceTick === null ? 0 : decisionTick - observed.waitingSinceTick;
          reroute.elapsedTicks = elapsedTicks;
          reroute.remainingTicks = Math.max(0, patienceTicks - elapsedTicks);
          if (elapsedTicks >= patienceTicks) {
            reroute.decision = 'COMMIT';
            action = 'ROUTE';
            reason = 'REROUTE_COMMIT';
            selectedRouteId = best.id;
          } else {
            reroute.decision = 'WAIT';
            action = 'REROUTE_WAIT';
            reason = 'REROUTE_WAIT';
            selectedRouteId = observed.currentRouteId;
          }
        }
      }
    }
    return Object.freeze({
      ...world,
      version: ROUTE_POLICY_V2_LIMITS.version,
      units: 'SI',
      actor: subject,
      decisionTick,
      profileVersionId: profile?.versionId ?? null,
      reason,
      action,
      originId: observed.originId,
      destinationId: observed.destinationId,
      currentRouteId: observed.currentRouteId,
      candidateRouteId,
      selectedRouteId,
      weights,
      referenceSeconds,
      referenceMetres,
      routes,
      uTurn: Object.freeze(uTurn),
      reroute: Object.freeze(reroute),
      recovery: Object.freeze(recovery),
      retainedHistory: 0,
    });
  } finally {
    evaluating = false;
  }
}
