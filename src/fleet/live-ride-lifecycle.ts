import { choice, number, record, requireContract, text, tick } from '../sessions';
import { parseRoadMap } from '../world';
import type { LaneGraph, RoadMap, RoutePlanner } from '../world';
import { settleableTaxiStatuses } from './dispatcher';
import type { SettleableTaxiStatus } from './dispatcher';
import { createRideDropoff, dropoffArrivedEventId } from './dropoff';
import type { DropoffCompletion, DropoffDecision, RideDropoff } from './dropoff';
import { createRideEta } from './eta';
import type { EtaServiceState, EtaSnapshot, RideEta } from './eta';
import type { LiveRideStepResult, LiveRides } from './live-rides';
import { createRidePickup, pickupArrivedEventId } from './pickup';
import type { PickupBoarding, PickupDecision, RidePickup } from './pickup';
import { createRideLifecycle } from './ride-fsm';
import type {
  RideCancelReason,
  RideEventType,
  RideFailureReason,
  RideLifecycle,
  RideRecord,
  RideRelease,
  RideState,
  RideTerminalReason,
  RideTerminalState,
} from './ride-fsm';
import { controlModes } from '../vehicles';
import type { ControlMode } from '../vehicles';

export const LIVE_RIDE_LIFECYCLE_VERSION = '265-live-ride-lifecycle-v1' as const;

/**
 * PBI 265 — the live ride lifecycle over the real 264 assignments.
 *
 * This module composes the real 061 lifecycle, 062 pickup, 063 dropoff and 064 ETA over the live
 * 059/060 claims of `createLiveRides`. It creates no second ride, taxi, zone, route or claim: the
 * ride starts from `dispatcher.assignmentFor(requestId)`, the zones and costs are the assignment's,
 * and every terminal state releases exactly the 060 claim through the 061 contract.
 *
 * Release ordering is explicit. An assignment whose taxi became player-driven, blocked, damaged or
 * offline is closed through 061 *before* the 264 step releases the claim, so a terminal ride always
 * owns a real release and the 264 module never finds a claim that already disappeared. The tick,
 * positions and speeds are caller observations; there is no wall clock, DOM, renderer or Babylon.
 */
export const LIVE_RIDE_LIFECYCLE_LIMITS = Object.freeze({
  version: LIVE_RIDE_LIFECYCLE_VERSION,
  /** Same live frame ceiling as 264. */
  frameVehicles: 128,
  /** Retained terminal receipts for panel replay and evidence. */
  terminalReceipts: 128,
  /** Same service rules as 062/063 when not overridden. */
  tickRateHz: 60,
  speedThresholdMps: 0.3,
  dwellTicks: 180,
  displacementToleranceM: 0.05,
  idCodeUnits: 512,
});

/** Why a live ride ended. `COMPLETED` is the only successful cause. */
export const LIVE_RIDE_TERMINAL_CAUSES = [
  'COMPLETED',
  'PLAYER_TAKEOVER',
  'BLOCKED',
  'DAMAGED',
  'OFFLINE',
  'SCENARIO_RESET',
] as const;
export type LiveRideTerminalCause = (typeof LIVE_RIDE_TERMINAL_CAUSES)[number];

export interface LiveRideObservedVehicle {
  readonly vehicleId: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly laneId: string | null;
  readonly blocked: boolean;
  readonly controlMode: ControlMode;
  /** Authoritative world position of the actor for this tick, in metres. */
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  /** Authoritative longitudinal speed of the actor for this tick, in m/s. */
  readonly speedMps: number;
  /** Map-plane heading (zero +X, positive toward +Z), used only to disambiguate ETA lanes. */
  readonly headingRad?: number;
}

export interface LiveRideLifecycleStepInput {
  readonly tick: number;
  readonly vehicles: readonly LiveRideObservedVehicle[];
  /** The single car in the PLAYER seat (263); such a taxi is never a valid ride vehicle. */
  readonly playerVehicleId: string | null;
}

export interface LiveRideTerminalReceipt {
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly tick: number;
  readonly state: RideTerminalState;
  /** Closed 061 terminal reason; `null` only for `COMPLETED`. */
  readonly reason: RideTerminalReason | null;
  readonly cause: LiveRideTerminalCause;
  /** Closed 060 release reason actually passed to the dispatcher by 061. */
  readonly dispatchReason: RideTerminalState;
  /** The exact 060 release returned by the dispatcher; never invented. */
  readonly release: RideRelease | null;
}

export interface LiveRideStartedView {
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly assignmentId: string;
  readonly tick: number;
  readonly state: RideState;
}

export interface LiveRideLifecycleStepResult {
  readonly tick: number;
  /** The exact 264 step result; its own releases stay visible. */
  readonly live: LiveRideStepResult;
  readonly started: readonly LiveRideStartedView[];
  readonly boardings: readonly PickupBoarding[];
  readonly completions: readonly DropoffCompletion[];
  readonly terminals: readonly LiveRideTerminalReceipt[];
  readonly observations: Readonly<{ pickup: number; dropoff: number; eta: number }>;
}

export interface LiveRideLifecycleCounts {
  readonly taxis: number;
  readonly rides: number;
  readonly active: number;
  readonly waitingPickup: number;
  readonly boarding: number;
  readonly onboard: number;
  readonly droppingOff: number;
  readonly completed: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly passengersOnBoard: number;
  readonly terminals: number;
}

export interface LiveRideLifecycleRideView {
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly taxiSlot: number | null;
  readonly state: RideState;
  readonly terminal: boolean;
  readonly reason: RideTerminalReason | null;
  readonly pickupZoneId: string;
  readonly dropoffZoneId: string;
  /** Real 032 anchor of the pickup zone; `null` when the zone or anchor is missing. */
  readonly pickupAnchor: Readonly<{ x: number; y: number; z: number }> | null;
  /** Real 032 anchor of the dropoff zone; `null` when the zone or anchor is missing. */
  readonly dropoffAnchor: Readonly<{ x: number; y: number; z: number }> | null;
  readonly startedTick: number;
  readonly updatedTick: number;
  readonly transitions: number;
  /** Last 064 estimate for this ride, including the terminal one; `null` before the first tick. */
  readonly eta: EtaSnapshot | null;
  readonly pickup: Readonly<{
    inZone: boolean;
    dwellTicks: number;
    dwellSeconds: number;
    requiredDwellTicks: number;
    lastTick: number;
    boardedTick: number | null;
  }> | null;
  readonly dropoff: Readonly<{
    inZone: boolean;
    dwellTicks: number;
    dwellSeconds: number;
    requiredDwellTicks: number;
    lastTick: number;
    completedTick: number | null;
  }> | null;
  readonly boardingTick: number | null;
  readonly completionTick: number | null;
  readonly release: RideRelease | null;
  readonly terminalCause: LiveRideTerminalCause | null;
}

export interface LiveRideLifecycleSnapshot {
  readonly version: typeof LIVE_RIDE_LIFECYCLE_VERSION;
  readonly tick: number;
  readonly namespace: string;
  readonly counts: LiveRideLifecycleCounts;
  readonly terminalsByCause: Readonly<Record<LiveRideTerminalCause, number>>;
  /** Active rides first, then terminal rides, each group in stable `rideId` order. */
  readonly rides: readonly LiveRideLifecycleRideView[];
  readonly terminals: readonly LiveRideTerminalReceipt[];
  readonly serviceState: EtaServiceState;
  readonly disposed: boolean;
}

export interface LiveRideLifecycleStats {
  readonly version: typeof LIVE_RIDE_LIFECYCLE_VERSION;
  readonly namespace: string;
  readonly tick: number;
  readonly active: number;
  readonly completed: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly boardings: number;
  readonly completions: number;
  readonly observations: number;
  readonly releases: number;
  readonly terminals: number;
  readonly duplicates: number;
  readonly disposed: boolean;
}

export interface LiveRideLifecycleResetResult {
  readonly tick: number;
  /** Active rides closed through 061 with `SCENARIO_RESET`. */
  readonly closedRides: number;
  /** Every claim released: closed rides plus claims that had no active ride. */
  readonly releasedAssignments: number;
  readonly preserveStats: boolean;
}

export interface LiveRideLifecycleOptions {
  readonly live: unknown;
  readonly map: unknown;
  readonly graph?: LaneGraph;
  readonly planner?: RoutePlanner;
  readonly tickRateHz?: number;
  readonly speedThresholdMps?: number;
  readonly dwellTicks?: number;
  readonly displacementToleranceM?: number;
  readonly serviceState?: EtaServiceState;
}

export interface LiveRideLifecycle {
  readonly version: typeof LIVE_RIDE_LIFECYCLE_VERSION;
  readonly namespace: string;
  readonly lifecycle: RideLifecycle;
  readonly pickup: RidePickup;
  readonly dropoff: RideDropoff;
  readonly eta: RideEta;
  step(input: unknown): LiveRideLifecycleStepResult;
  setTaxiStatus(taxiId: unknown, status: unknown): SettleableTaxiStatus;
  setServiceState(state: unknown): EtaServiceState;
  currentTick(): number;
  snapshot(): LiveRideLifecycleSnapshot;
  stats(): LiveRideLifecycleStats;
  reset(input: unknown): LiveRideLifecycleResetResult;
  dispose(): void;
}

const optionFields = [
  'live',
  'map',
  'graph',
  'planner',
  'tickRateHz',
  'speedThresholdMps',
  'dwellTicks',
  'displacementToleranceM',
  'serviceState',
] as const;

const stepFields = ['tick', 'vehicles', 'playerVehicleId'] as const;
const resetFields = ['tick', 'preserveStats'] as const;
const vehicleFields = [
  'vehicleId',
  'driverKind',
  'laneId',
  'blocked',
  'controlMode',
  'positionM',
  'speedMps',
  'headingRad',
] as const;
const pointFields = ['x', 'y', 'z'] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function boundedId(value: unknown, label: string): string {
  const id = text(value);
  requireContract(id.length <= LIVE_RIDE_LIFECYCLE_LIMITS.idCodeUnits, `${label} is too long`);
  return id;
}

function boundedTick(value: unknown, label: string): number {
  const atTick = tick(value);
  requireContract(atTick <= Number.MAX_SAFE_INTEGER, `${label} is too large`);
  return atTick;
}

function readLive(value: unknown): LiveRides {
  const live = value as LiveRides;
  requireContract(
    typeof live === 'object' &&
      live !== null &&
      typeof live.namespace === 'string' &&
      typeof live.step === 'function' &&
      typeof live.reset === 'function' &&
      typeof live.setTaxiStatus === 'function' &&
      typeof live.snapshot === 'function' &&
      typeof live.registry === 'object' &&
      typeof live.graph === 'object' &&
      typeof live.planner === 'object' &&
      typeof live.dispatcher === 'object',
    'Invalid live rides composition',
  );
  return live;
}

function readPoint(value: unknown, label: string): Readonly<{ x: number; y: number; z: number }> {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract((pointFields as readonly string[]).includes(key), `Unknown ${label} field`);
  requireContract(data.x !== undefined && data.y !== undefined && data.z !== undefined, label);
  const x = number(data.x, -1e9, 1e9),
    y = number(data.y, -1e9, 1e9),
    z = number(data.z, -1e9, 1e9);
  requireContract(
    Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z),
    `${label} must be finite`,
  );
  return Object.freeze({ x, y, z });
}

function readVehicles(value: unknown): readonly LiveRideObservedVehicle[] {
  requireContract(Array.isArray(value), 'Live ride vehicles must be a list');
  requireContract(
    value.length <= LIVE_RIDE_LIFECYCLE_LIMITS.frameVehicles,
    'Live ride frame is too large',
  );
  const seen = new Set<string>();
  const vehicles: LiveRideObservedVehicle[] = [];
  for (const entry of value) {
    const data = record(entry);
    for (const key of Object.keys(data))
      requireContract(
        (vehicleFields as readonly string[]).includes(key),
        'Unknown live ride vehicle field',
      );
    const vehicleId = boundedId(data.vehicleId, 'vehicle id');
    requireContract(!seen.has(vehicleId), 'Duplicate live ride vehicle');
    seen.add(vehicleId);
    const laneId =
      data.laneId === null || data.laneId === undefined ? null : boundedId(data.laneId, 'lane id');
    requireContract(typeof data.blocked === 'boolean', 'Live ride blocked must be a boolean');
    const speedMps = number(data.speedMps, 0, 500);
    requireContract(Number.isFinite(speedMps), 'Live ride speed must be finite');
    const headingValue =
      data.headingRad === undefined ? undefined : number(data.headingRad, -1e9, 1e9);
    if (headingValue !== undefined)
      requireContract(Number.isFinite(headingValue), 'Live ride heading must be finite');
    const headingRad =
      headingValue === undefined
        ? undefined
        : Math.atan2(Math.sin(headingValue), Math.cos(headingValue));
    vehicles.push(
      Object.freeze({
        vehicleId,
        driverKind: choice(data.driverKind, ['TAXI', 'CIVILIAN'] as const),
        laneId,
        blocked: data.blocked,
        controlMode: choice(data.controlMode, controlModes),
        positionM: readPoint(data.positionM, 'Live ride position'),
        speedMps,
        ...(headingRad === undefined ? {} : { headingRad }),
      }),
    );
  }
  return Object.freeze(vehicles);
}

function readStepInput(value: unknown): LiveRideLifecycleStepInput {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      (stepFields as readonly string[]).includes(key),
      'Unknown live ride step field',
    );
  requireContract(data.tick !== undefined, 'Live ride step requires a tick');
  const playerVehicleId =
    data.playerVehicleId === null || data.playerVehicleId === undefined
      ? null
      : boundedId(data.playerVehicleId, 'player vehicle id');
  return Object.freeze({
    tick: boundedTick(data.tick, 'live ride tick'),
    vehicles: readVehicles(data.vehicles),
    playerVehicleId,
  });
}

function readResetInput(value: unknown): {
  readonly tick: number;
  readonly preserveStats: boolean;
} {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      (resetFields as readonly string[]).includes(key),
      'Unknown live ride reset field',
    );
  requireContract(data.tick !== undefined, 'Live ride reset requires a tick');
  requireContract(
    data.preserveStats === undefined || typeof data.preserveStats === 'boolean',
    'Live ride preserveStats must be a boolean',
  );
  return Object.freeze({
    tick: boundedTick(data.tick, 'live ride reset tick'),
    preserveStats: data.preserveStats === true,
  });
}

function statusRank(status: SettleableTaxiStatus): number {
  switch (status) {
    case 'AVAILABLE':
      return 0;
    case 'BLOCKED':
      return 1;
    case 'DAMAGED':
      return 2;
    case 'OFFLINE':
      return 3;
  }
}

/** Same precedence as 264: OFFLINE > DAMAGED > BLOCKED > AVAILABLE. */
function mergeStatus(fact: SettleableTaxiStatus, worldBlocked: boolean): SettleableTaxiStatus {
  const observed: SettleableTaxiStatus = worldBlocked ? 'BLOCKED' : 'AVAILABLE';
  return statusRank(fact) >= statusRank(observed) ? fact : observed;
}

function zeroByCause(): Record<LiveRideTerminalCause, number> {
  return {
    COMPLETED: 0,
    PLAYER_TAKEOVER: 0,
    BLOCKED: 0,
    DAMAGED: 0,
    OFFLINE: 0,
    SCENARIO_RESET: 0,
  };
}

/** Stable 061 event identities for the live lifecycle, derived from the real 059 request. */
export function liveRideAssignedEventId(requestId: string): string {
  return `live-assigned:${requestId}`;
}

export function liveRideTerminalEventId(requestId: string, state: RideTerminalState): string {
  return `live-terminal:${state.toLowerCase()}:${requestId}`;
}

function terminalPlan(
  state: RideState,
  cause: LiveRideTerminalCause,
): Readonly<{
  event: RideEventType;
  reason: RideFailureReason | RideCancelReason;
  cause: LiveRideTerminalCause;
}> {
  switch (cause) {
    case 'PLAYER_TAKEOVER':
      // 061 forbids CANCELLED after the passenger reached the destination; the car was abandoned.
      return state === 'DROPOFF'
        ? { event: 'FAILED', reason: 'PLAYER_ABANDONED', cause }
        : { event: 'CANCELLED', reason: 'PLAYER_CANCELLED', cause };
    case 'BLOCKED':
      return { event: 'FAILED', reason: 'TAXI_BLOCKED', cause };
    case 'DAMAGED':
      return { event: 'FAILED', reason: 'TAXI_DAMAGED', cause };
    case 'OFFLINE':
      return { event: 'FAILED', reason: 'TAXI_REMOVED', cause };
    case 'SCENARIO_RESET':
      return { event: 'FAILED', reason: 'SCENARIO_RESET', cause };
    case 'COMPLETED':
      throw new Error('A completed ride is closed by 063, not by the live lifecycle');
  }
}

export function createLiveRideLifecycle(options: unknown): LiveRideLifecycle {
  const data = record(options);
  for (const key of Object.keys(data))
    requireContract(
      (optionFields as readonly string[]).includes(key),
      'Unknown live ride lifecycle option',
    );
  requireContract(data.live !== undefined, 'Live ride lifecycle requires a live composition');
  requireContract(data.map !== undefined, 'Live ride lifecycle requires a road map');
  const live = readLive(data.live),
    map: RoadMap = parseRoadMap(data.map),
    graph = data.graph === undefined ? live.graph : (data.graph as LaneGraph),
    planner = data.planner === undefined ? live.planner : (data.planner as RoutePlanner);
  requireContract(
    typeof graph.getLane === 'function' && typeof graph.getDirectedPath === 'function',
    'Invalid live ride lifecycle lane graph',
  );
  requireContract(
    typeof planner.findRoute === 'function' && typeof planner.resolveDestination === 'function',
    'Invalid live ride lifecycle route planner',
  );
  const tickRateHz =
      data.tickRateHz === undefined
        ? LIVE_RIDE_LIFECYCLE_LIMITS.tickRateHz
        : number(data.tickRateHz, 1, 1_000),
    speedThresholdMps =
      data.speedThresholdMps === undefined
        ? LIVE_RIDE_LIFECYCLE_LIMITS.speedThresholdMps
        : number(data.speedThresholdMps, 0, 10),
    dwellTicks =
      data.dwellTicks === undefined
        ? LIVE_RIDE_LIFECYCLE_LIMITS.dwellTicks
        : number(data.dwellTicks, 1, 60_000),
    displacementToleranceM =
      data.displacementToleranceM === undefined
        ? LIVE_RIDE_LIFECYCLE_LIMITS.displacementToleranceM
        : number(data.displacementToleranceM, 0, 10),
    serviceState =
      data.serviceState === undefined
        ? 'FREE_FLOW'
        : (choice(data.serviceState, [
            'FREE_FLOW',
            'CONGESTED',
            'BLOCKED',
          ] as const) as EtaServiceState);
  requireContract(Number.isSafeInteger(tickRateHz), 'Live ride tick rate must be an integer');
  requireContract(Number.isSafeInteger(dwellTicks), 'Live ride dwell must be an integer');
  const lifecycle = createRideLifecycle({ dispatcher: live.dispatcher });
  const mapZones = new Map(map.serviceZones.map((zone) => [zone.id, zone])),
    mapNodes = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM]));
  const anchorFor = (zoneId: string): Readonly<{ x: number; y: number; z: number }> | null => {
    const zone = mapZones.get(zoneId);
    if (zone === undefined) return null;
    const anchor = mapNodes.get(zone.anchorNodeId);
    return anchor === undefined ? null : Object.freeze({ x: anchor.x, y: anchor.y, z: anchor.z });
  };
  const moduleOptions = {
    map,
    lifecycle,
    tickRateHz,
    speedThresholdMps,
    dwellTicks,
    displacementToleranceM,
  } as const;
  let pickup = createRidePickup(moduleOptions),
    dropoff = createRideDropoff(moduleOptions);
  const eta = createRideEta({
    lifecycle,
    graph,
    planner,
    tickRateHz,
    serviceState,
  });
  const terminalLog: LiveRideTerminalReceipt[] = [],
    terminalByRide = new Map<string, LiveRideTerminalReceipt>(),
    terminalsByCause: Record<LiveRideTerminalCause, number> = zeroByCause();
  let lastTick = 0,
    observations = 0,
    boardings = 0,
    completions = 0,
    duplicates = 0,
    drops = 0,
    disposed = false;

  function assertLive(): void {
    if (disposed) throw new Error('Live ride lifecycle disposed');
  }

  function pushReceipt(receipt: LiveRideTerminalReceipt): void {
    terminalLog.push(receipt);
    if (terminalLog.length > LIVE_RIDE_LIFECYCLE_LIMITS.terminalReceipts) {
      const removed = terminalLog.shift();
      if (removed !== undefined) terminalByRide.delete(removed.rideId);
      drops += 1;
    }
    terminalByRide.set(receipt.rideId, receipt);
    terminalsByCause[receipt.cause] += 1;
  }

  /**
   * Records a terminal ride exactly once. The 060 release comes from the real 061 transition, so a
   * receipt can never claim a release that the dispatcher did not return.
   */
  function recordTerminal(
    ride: RideRecord,
    cause: LiveRideTerminalCause,
    atTick: number,
  ): LiveRideTerminalReceipt | null {
    if (!ride.terminal) return null;
    const existing = terminalByRide.get(ride.rideId);
    if (existing !== undefined) return null;
    const receipt = Object.freeze({
      rideId: ride.rideId,
      requestId: ride.requestId,
      taxiId: ride.taxiId,
      tick: atTick,
      state: ride.state as RideTerminalState,
      reason: ride.reason,
      cause,
      dispatchReason: ride.release?.reason ?? (ride.state as RideTerminalState),
      release: ride.release,
    });
    pushReceipt(receipt);
    return receipt;
  }

  function closeRide(
    ride: RideRecord,
    cause: LiveRideTerminalCause,
    atTick: number,
    output: LiveRideTerminalReceipt[],
  ): void {
    if (ride.terminal) return;
    const plan = terminalPlan(ride.state, cause),
      result = lifecycle.apply({
        rideId: ride.rideId,
        eventId: liveRideTerminalEventId(
          ride.requestId,
          plan.event === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
        ),
        event: plan.event,
        tick: atTick,
        reason: plan.reason,
      });
    if (result.duplicate) duplicates += 1;
    const receipt = recordTerminal(result.ride, cause, atTick);
    if (receipt !== null) output.push(receipt);
  }

  function closeUnavailable(
    request: LiveRideLifecycleStepInput,
    frame: ReadonlyMap<string, LiveRideObservedVehicle>,
    output: LiveRideTerminalReceipt[],
  ): void {
    for (const ride of lifecycle.active()) {
      const vehicle = frame.get(ride.taxiId),
        excluded =
          request.playerVehicleId === ride.taxiId ||
          (vehicle !== undefined && vehicle.controlMode !== 'AUTO');
      if (excluded && !live.keepPlayerClaims) {
        closeRide(ride, 'PLAYER_TAKEOVER', request.tick, output);
        continue;
      }
      const status = mergeStatus(live.healthStatus(ride.taxiId), vehicle?.blocked ?? false);
      if (status === 'AVAILABLE') continue;
      const cause: LiveRideTerminalCause =
        status === 'BLOCKED' ? 'BLOCKED' : status === 'DAMAGED' ? 'DAMAGED' : 'OFFLINE';
      closeRide(ride, cause, request.tick, output);
    }
  }

  function startNewRides(atTick: number, output: LiveRideStartedView[]): void {
    for (const assignment of live.dispatcher.assignments()) {
      const existing = lifecycle.rideFor(assignment.requestId);
      if (existing !== undefined) {
        // A terminal ride cannot be reused by a later assignment; that would be a second ride model.
        requireContract(
          !existing.terminal,
          'Live ride lifecycle received an assignment for a closed ride',
        );
        continue;
      }
      const result = lifecycle.begin({
        requestId: assignment.requestId,
        eventId: liveRideAssignedEventId(assignment.requestId),
        tick: atTick,
      });
      if (result.duplicate) duplicates += 1;
      const ride = result.ride;
      output.push(
        Object.freeze({
          rideId: ride.rideId,
          requestId: ride.requestId,
          taxiId: ride.taxiId,
          assignmentId: ride.assignmentId,
          tick: atTick,
          state: ride.state,
        }),
      );
    }
  }

  function observeRides(
    atTick: number,
    frame: ReadonlyMap<string, LiveRideObservedVehicle>,
    result: {
      readonly boardings: PickupBoarding[];
      readonly completions: DropoffCompletion[];
      readonly observations: { pickup: number; dropoff: number; eta: number };
    },
  ): void {
    for (const ride of lifecycle.active()) {
      const vehicle = frame.get(ride.taxiId);
      if (vehicle === undefined) continue;
      const observation = Object.freeze({
        rideId: ride.rideId,
        taxiId: ride.taxiId,
        tick: atTick,
        positionM: vehicle.positionM,
        speedMps: vehicle.speedMps,
      });
      let decision: PickupDecision | DropoffDecision | null = null;
      if (ride.state === 'TO_PICKUP' || ride.state === 'PICKUP') {
        decision = pickup.observe(observation);
        result.observations.pickup += 1;
        if (decision.status === 'BOARDED' && !decision.duplicate && decision.boarding !== null) {
          result.boardings.push(decision.boarding);
          boardings += 1;
        } else if (decision.duplicate) duplicates += 1;
        // 062 only writes the arrival edge together with boarding. The live composition publishes
        // it as soon as the taxi is stationary in the real zone, so PICKUP/BOARDING (and the 147 S
        // marker) is visible for the whole required dwell instead of a single tick.
        const current = lifecycle.ride(ride.rideId);
        if (
          current !== undefined &&
          current.state === 'TO_PICKUP' &&
          decision.status === 'PENDING' &&
          decision.reason === 'NOT_STATIONARY' &&
          decision.inPickupZone
        ) {
          lifecycle.apply({
            rideId: ride.rideId,
            eventId: pickupArrivedEventId(ride.requestId),
            event: 'ARRIVED_PICKUP',
            tick: atTick,
          });
        }
      } else if (ride.state === 'TO_DROPOFF' || ride.state === 'DROPOFF') {
        decision = dropoff.observe(observation);
        result.observations.dropoff += 1;
        if (
          decision.status === 'COMPLETED' &&
          !decision.duplicate &&
          decision.completion !== null
        ) {
          result.completions.push(decision.completion);
          completions += 1;
        } else if (decision.duplicate) duplicates += 1;
        // Same composition rule for the destination: the D marker and DROPPING_OFF phase stay
        // visible during the real dwell, while 063 still owns the terminal completion.
        const current = lifecycle.ride(ride.rideId);
        if (
          current !== undefined &&
          current.state === 'TO_DROPOFF' &&
          decision.status === 'PENDING' &&
          decision.reason === 'NOT_STATIONARY' &&
          decision.inDropoffZone
        ) {
          lifecycle.apply({
            rideId: ride.rideId,
            eventId: dropoffArrivedEventId(ride.requestId),
            event: 'ARRIVED_DROPOFF',
            tick: atTick,
          });
        }
      }
      const after = lifecycle.ride(ride.rideId);
      if (after === undefined || after.terminal) continue;
      eta.observe({
        ...observation,
        ...(vehicle.headingRad === undefined ? {} : { headingRad: vehicle.headingRad }),
      });
      result.observations.eta += 1;
    }
  }

  function scanTerminals(atTick: number, output: LiveRideTerminalReceipt[]): void {
    for (const ride of lifecycle.terminal()) {
      if (terminalByRide.has(ride.rideId)) continue;
      const receipt = recordTerminal(ride, 'COMPLETED', atTick);
      if (receipt !== null) output.unshift(receipt);
    }
  }

  function step(input: unknown): LiveRideLifecycleStepResult {
    assertLive();
    const request = readStepInput(input);
    if (request.tick <= lastTick)
      throw new RangeError(`Stale live ride lifecycle tick: ${request.tick} <= ${lastTick}`);
    lastTick = request.tick;
    lifecycle.advance(request.tick);
    const frame = new Map<string, LiveRideObservedVehicle>();
    for (const vehicle of request.vehicles) frame.set(vehicle.vehicleId, vehicle);
    const terminals: LiveRideTerminalReceipt[] = [];
    closeUnavailable(request, frame, terminals);
    const liveResult = live.step({
      tick: request.tick,
      vehicles: request.vehicles.map((vehicle) => ({
        vehicleId: vehicle.vehicleId,
        driverKind: vehicle.driverKind,
        laneId: vehicle.laneId,
        blocked: vehicle.blocked,
        controlMode: vehicle.controlMode,
      })),
      playerVehicleId: request.playerVehicleId,
    });
    // 264 may only release claims whose ride was already closed above. A ride that is still active
    // here means the live availability and this composition diverged, which is a contract fault.
    for (const released of liveResult.released) {
      const ride = lifecycle.rideFor(released.requestId);
      requireContract(
        ride === undefined || ride.terminal,
        'Live ride claim released while its ride was still active',
      );
    }
    const started: LiveRideStartedView[] = [];
    startNewRides(request.tick, started);
    const observed = {
      boardings: [] as PickupBoarding[],
      completions: [] as DropoffCompletion[],
      observations: { pickup: 0, dropoff: 0, eta: 0 },
    };
    observeRides(request.tick, frame, observed);
    scanTerminals(request.tick, terminals);
    observations += observed.observations.pickup + observed.observations.dropoff;
    return Object.freeze({
      tick: request.tick,
      live: liveResult,
      started: Object.freeze(started),
      boardings: Object.freeze(observed.boardings),
      completions: Object.freeze(observed.completions),
      terminals: Object.freeze(terminals),
      observations: Object.freeze(observed.observations),
    });
  }

  function rideView(ride: RideRecord): LiveRideLifecycleRideView {
    const pickupAttempt = pickup.attempt(ride.rideId),
      dropoffAttempt = dropoff.attempt(ride.rideId),
      boarding = pickup.boardings().find((entry) => entry.rideId === ride.rideId) ?? null,
      completion = dropoff.completions().find((entry) => entry.rideId === ride.rideId) ?? null,
      receipt = terminalByRide.get(ride.rideId);
    return Object.freeze({
      rideId: ride.rideId,
      requestId: ride.requestId,
      taxiId: ride.taxiId,
      taxiSlot: live.registry.get(ride.taxiId)?.slot ?? null,
      state: ride.state,
      terminal: ride.terminal,
      reason: ride.reason,
      pickupZoneId: ride.pickupZoneId,
      dropoffZoneId: ride.dropoffZoneId,
      pickupAnchor: anchorFor(ride.pickupZoneId),
      dropoffAnchor: anchorFor(ride.dropoffZoneId),
      startedTick: ride.startedTick,
      updatedTick: ride.updatedTick,
      transitions: ride.transitions.length,
      eta: eta.estimate(ride.rideId) ?? null,
      pickup:
        pickupAttempt === undefined
          ? null
          : Object.freeze({
              inZone: pickupAttempt.inPickupZone,
              dwellTicks: pickupAttempt.dwellTicks,
              dwellSeconds: pickupAttempt.dwellSeconds,
              requiredDwellTicks: pickupAttempt.requiredDwellTicks,
              lastTick: pickupAttempt.lastTick,
              boardedTick: pickupAttempt.boardedTick,
            }),
      dropoff:
        dropoffAttempt === undefined
          ? null
          : Object.freeze({
              inZone: dropoffAttempt.inDropoffZone,
              dwellTicks: dropoffAttempt.dwellTicks,
              dwellSeconds: dropoffAttempt.dwellSeconds,
              requiredDwellTicks: dropoffAttempt.requiredDwellTicks,
              lastTick: dropoffAttempt.lastTick,
              completedTick: dropoffAttempt.completedTick,
            }),
      boardingTick: boarding?.tick ?? null,
      completionTick: completion?.tick ?? null,
      release: ride.release,
      terminalCause: receipt?.cause ?? null,
    });
  }

  function emptySnapshot(): LiveRideLifecycleSnapshot {
    return Object.freeze({
      version: LIVE_RIDE_LIFECYCLE_VERSION,
      tick: 0,
      namespace: lifecycle.namespace,
      counts: Object.freeze({
        taxis: 0,
        rides: 0,
        active: 0,
        waitingPickup: 0,
        boarding: 0,
        onboard: 0,
        droppingOff: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        passengersOnBoard: 0,
        terminals: 0,
      }),
      terminalsByCause: Object.freeze(zeroByCause()),
      rides: Object.freeze([]),
      terminals: Object.freeze([]),
      serviceState: eta.serviceState,
      disposed: true,
    });
  }

  function snapshot(): LiveRideLifecycleSnapshot {
    if (disposed) return emptySnapshot();
    const active = lifecycle
        .active()
        .slice()
        .sort((left, right) => compareText(left.rideId, right.rideId)),
      terminal = lifecycle
        .terminal()
        .slice()
        .sort((left, right) => compareText(left.rideId, right.rideId)),
      views = [...active, ...terminal].map(rideView);
    let waitingPickup = 0,
      boarding = 0,
      onboard = 0,
      droppingOff = 0,
      completed = 0,
      failed = 0,
      cancelled = 0;
    for (const ride of active) {
      switch (ride.state) {
        case 'TO_PICKUP':
          waitingPickup += 1;
          break;
        case 'PICKUP':
          boarding += 1;
          break;
        case 'TO_DROPOFF':
          onboard += 1;
          break;
        case 'DROPOFF':
          droppingOff += 1;
          break;
        default:
          break;
      }
    }
    for (const ride of terminal) {
      if (ride.state === 'COMPLETED') completed += 1;
      else if (ride.state === 'FAILED') failed += 1;
      else cancelled += 1;
    }
    return Object.freeze({
      version: LIVE_RIDE_LIFECYCLE_VERSION,
      tick: lastTick,
      namespace: lifecycle.namespace,
      counts: Object.freeze({
        taxis: live.snapshot().counts.taxis,
        rides: views.length,
        active: active.length,
        waitingPickup,
        boarding,
        onboard,
        droppingOff,
        completed,
        failed,
        cancelled,
        passengersOnBoard: onboard + droppingOff,
        terminals: terminal.length,
      }),
      terminalsByCause: Object.freeze({ ...terminalsByCause }),
      rides: Object.freeze(views),
      terminals: Object.freeze(terminalLog.slice()),
      serviceState: eta.serviceState,
      disposed: false,
    });
  }

  function stats(): LiveRideLifecycleStats {
    if (disposed)
      return Object.freeze({
        version: LIVE_RIDE_LIFECYCLE_VERSION,
        namespace: lifecycle.namespace,
        tick: 0,
        active: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        boardings: 0,
        completions: 0,
        observations: 0,
        releases: 0,
        terminals: 0,
        duplicates: 0,
        disposed: true,
      });
    const rides = lifecycle.active(),
      terminals = lifecycle.terminal();
    return Object.freeze({
      version: LIVE_RIDE_LIFECYCLE_VERSION,
      namespace: lifecycle.namespace,
      tick: lastTick,
      active: rides.length,
      completed: terminals.filter((ride) => ride.state === 'COMPLETED').length,
      failed: terminals.filter((ride) => ride.state === 'FAILED').length,
      cancelled: terminals.filter((ride) => ride.state === 'CANCELLED').length,
      boardings,
      completions,
      observations,
      releases: terminals.filter((ride) => ride.release !== null).length,
      terminals: terminalLog.length,
      duplicates,
      disposed: false,
    });
  }

  function reset(input: unknown): LiveRideLifecycleResetResult {
    assertLive();
    const request = readResetInput(input);
    if (request.tick < lastTick) throw new RangeError('Stale live ride lifecycle reset tick');
    lastTick = request.tick;
    lifecycle.advance(request.tick);
    let closedRides = 0;
    const receipts: LiveRideTerminalReceipt[] = [];
    for (const ride of lifecycle.active()) {
      closeRide(ride, 'SCENARIO_RESET', request.tick, receipts);
      closedRides += 1;
    }
    const liveReset = live.reset({ tick: request.tick, preserveStats: request.preserveStats });
    const lifecycleReset = lifecycle.reset({
      tick: request.tick,
      preserveStats: request.preserveStats,
    });
    requireContract(
      lifecycleReset.discardedActive === 0,
      'Live ride reset left an active ride open',
    );
    eta.reset({ preserveStats: request.preserveStats });
    pickup.dispose();
    dropoff.dispose();
    pickup = createRidePickup(moduleOptions);
    dropoff = createRideDropoff(moduleOptions);
    terminalLog.length = 0;
    terminalByRide.clear();
    for (const cause of LIVE_RIDE_TERMINAL_CAUSES) terminalsByCause[cause] = 0;
    observations = 0;
    boardings = 0;
    completions = 0;
    duplicates = 0;
    drops = 0;
    return Object.freeze({
      tick: request.tick,
      closedRides,
      releasedAssignments: closedRides + liveReset.releasedAssignments,
      preserveStats: request.preserveStats,
    });
  }

  return Object.freeze({
    version: LIVE_RIDE_LIFECYCLE_VERSION,
    namespace: lifecycle.namespace,
    lifecycle,
    get pickup(): RidePickup {
      return pickup;
    },
    get dropoff(): RideDropoff {
      return dropoff;
    },
    get eta(): RideEta {
      return eta;
    },
    step,
    setTaxiStatus(taxiId: unknown, status: unknown): SettleableTaxiStatus {
      assertLive();
      const next = choice(status, settleableTaxiStatuses);
      return live.setTaxiStatus(taxiId, next);
    },
    setServiceState(state: unknown): EtaServiceState {
      assertLive();
      return eta.setServiceState(state);
    },
    currentTick: () => lastTick,
    snapshot,
    stats,
    reset,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      lifecycle.dispose();
      pickup.dispose();
      dropoff.dispose();
      eta.dispose();
      terminalLog.length = 0;
      terminalByRide.clear();
      for (const cause of LIVE_RIDE_TERMINAL_CAUSES) terminalsByCause[cause] = 0;
      observations = 0;
      boardings = 0;
      completions = 0;
      duplicates = 0;
      drops = 0;
      lastTick = 0;
    },
  });
}

/** True when the snapshot has no restore-relevant fact other than the empty read model. */
export function liveRideLifecycleIsEmpty(snapshot: LiveRideLifecycleSnapshot): boolean {
  return snapshot.rides.length === 0 && snapshot.terminals.length === 0;
}

/** Terminal receipt lookup for evidence without exposing the mutable log. */
export function liveRideTerminalFor(
  snapshot: LiveRideLifecycleSnapshot,
  rideId: string,
): LiveRideTerminalReceipt | undefined {
  return snapshot.terminals.find((entry) => entry.rideId === rideId);
}

/** Closed reason vocabulary of a terminal cause, for docs and UI labels. */
export function liveRideTerminalReason(
  cause: LiveRideTerminalCause,
  state: RideState,
): RideTerminalReason | null {
  if (cause === 'COMPLETED') return null;
  return terminalPlan(state, cause).reason;
}
