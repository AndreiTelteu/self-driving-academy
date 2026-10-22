import { choice, createStableId, list, record, requireContract, text, tick } from '../sessions';
import { RIDE_DISPATCH_RELEASE_REASONS } from './dispatcher';
import type { DispatchAssignment, RideDispatcher } from './dispatcher';

export const RIDE_FSM_VERSION = '061-ride-fsm-v1' as const;

/**
 * Bounded lifecycle state. A ride is created from a real 060 assignment, so it starts in
 * `TO_PICKUP`; `AVAILABLE` remains a taxi status, not a ride state.
 */
export const rideStates = [
  'TO_PICKUP',
  'PICKUP',
  'TO_DROPOFF',
  'DROPOFF',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type RideState = (typeof rideStates)[number];

/** Terminal states release the claimed taxi exactly once, through the real 060 contract. */
export const RIDE_TERMINAL_STATES = ['COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type RideTerminalState = (typeof RIDE_TERMINAL_STATES)[number];

/** Closed transition vocabulary. Each entry is one ride event, with no free-form state change. */
export const rideEventTypes = [
  'ASSIGNED',
  'ARRIVED_PICKUP',
  'PICKUP_COMPLETE',
  'ARRIVED_DROPOFF',
  'DROPOFF_COMPLETE',
  'CANCELLED',
  'FAILED',
] as const;
export type RideEventType = (typeof rideEventTypes)[number];

/** Explicit failure reasons; a FAILED ride without one is rejected. */
export const RIDE_FAILURE_REASONS = [
  'TAXI_BLOCKED',
  'TAXI_DAMAGED',
  'TAXI_REMOVED',
  'ROUTE_UNAVAILABLE',
  'SERVICE_TIMEOUT',
  'PLAYER_ABANDONED',
  'SCENARIO_RESET',
] as const;
export type RideFailureReason = (typeof RIDE_FAILURE_REASONS)[number];

/** Explicit cancellation reasons; a CANCELLED ride without one is rejected. */
export const RIDE_CANCEL_REASONS = [
  'PLAYER_CANCELLED',
  'PASSENGER_CANCELLED',
  'DISPATCH_WITHDRAWN',
] as const;
export type RideCancelReason = (typeof RIDE_CANCEL_REASONS)[number];

export type RideTerminalReason = RideFailureReason | RideCancelReason;

/**
 * Allowed state transitions. Terminal states have no outgoing edge, so a second terminal event is
 * impossible instead of silently overwriting the first result. `CANCELLED` is not reachable once
 * the taxi has arrived at the dropoff; from there the ride can only complete or fail.
 */
export const RIDE_TRANSITIONS: Readonly<Record<RideState, readonly RideState[]>> = Object.freeze({
  TO_PICKUP: Object.freeze(['PICKUP', 'FAILED', 'CANCELLED'] as const),
  PICKUP: Object.freeze(['TO_DROPOFF', 'FAILED', 'CANCELLED'] as const),
  TO_DROPOFF: Object.freeze(['DROPOFF', 'FAILED', 'CANCELLED'] as const),
  DROPOFF: Object.freeze(['COMPLETED', 'FAILED'] as const),
  COMPLETED: Object.freeze([] as const),
  FAILED: Object.freeze([] as const),
  CANCELLED: Object.freeze([] as const),
});

export const RIDE_FSM_LIMITS = Object.freeze({
  version: RIDE_FSM_VERSION,
  /** Concurrent active rides; the V1 fleet has at most 30 taxis. */
  activeRides: 64,
  /** Retained terminal ride records; older records are evicted with an explicit counter. */
  terminalRides: 128,
  /** Retained events per ride (the state machine only ever needs six). */
  eventsPerRide: 16,
  /** Code units per request/ride identity. */
  idCodeUnits: 256,
  /** Code units per ride identity (an encoded 006 id is longer than its request id). */
  rideIdCodeUnits: 512,
  /** Code units per caller event identity. */
  eventIdCodeUnits: 256,
});

/** A ride transition owns the exact dispatcher release that closed a terminal state. */
export interface RideRelease {
  readonly taxiId: string;
  readonly requestId: string;
  readonly assignmentId: string;
  readonly reason: RideTerminalState;
  readonly tick: number;
}

export interface RideTransition {
  /** Stable 006 identity of `(ride, eventId)`; a replay never produces a second id. */
  readonly transitionId: string;
  readonly rideId: string;
  readonly eventId: string;
  readonly event: RideEventType;
  /** `null` only for the creating `ASSIGNED` transition. */
  readonly from: RideState | null;
  readonly to: RideState;
  readonly tick: number;
  /** Present only on `FAILED`/`CANCELLED`. */
  readonly reason: RideTerminalReason | null;
  /** Present only on a terminal transition; it is the real 060 release returned by the dispatcher. */
  readonly release: RideRelease | null;
}

export interface RideRecord {
  readonly rideId: string;
  readonly requestId: string;
  /** The taxi claimed by 060; the lifecycle never retargets it to a selected taxi. */
  readonly taxiId: string;
  readonly assignmentId: string;
  readonly pickupZoneId: string;
  readonly dropoffZoneId: string;
  readonly pickupCostSeconds: number;
  readonly tripCostSeconds: number;
  readonly totalCostSeconds: number;
  readonly pickupRouteLaneIds: readonly string[];
  readonly tripRouteLaneIds: readonly string[];
  readonly state: RideState;
  readonly startedTick: number;
  readonly updatedTick: number;
  readonly terminal: boolean;
  readonly reason: RideTerminalReason | null;
  readonly release: RideRelease | null;
  readonly transitions: readonly RideTransition[];
  readonly appliedEventIds: readonly string[];
}

export interface RideEventResult {
  readonly transition: RideTransition;
  readonly ride: RideRecord;
  /** `true` when the event id was already applied; nothing changed and nothing was released. */
  readonly duplicate: boolean;
}

export interface RideSnapshotEntry {
  readonly requestId: string;
  readonly state: RideState;
  readonly updatedTick: number;
  readonly transitions: readonly RideTransition[];
  readonly appliedEventIds: readonly string[];
}

export interface RideLifecycleSnapshot {
  readonly version: typeof RIDE_FSM_VERSION;
  readonly tick: number;
  /** Active rides only; closed rides are terminal outcomes, not restorable work. */
  readonly rides: readonly RideSnapshotEntry[];
}

export interface RideLifecycleStats {
  readonly version: typeof RIDE_FSM_VERSION;
  readonly namespace: string;
  readonly tick: number;
  readonly rides: number;
  readonly active: number;
  readonly completed: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly transitions: number;
  readonly releases: number;
  readonly duplicates: number;
  readonly restored: number;
  readonly droppedTerminal: number;
  readonly disposed: boolean;
}

/** Scenario boundary (065): active rides are discarded by the caller only after release attempts. */
export interface RideLifecycleReset {
  readonly tick: number;
  readonly clearedRides: number;
  /** Active rides that were still open when the reset cleared the lifecycle. */
  readonly discardedActive: number;
}

export interface RideLifecycleOptions {
  readonly dispatcher: unknown;
}

export interface RideLifecycle {
  readonly namespace: string;
  /** Authoritative monotonic tick; there is no wall clock anywhere in the module. */
  currentTick(): number;
  /** Creates the ride from the dispatcher's real claim for `requestId`. */
  begin(input: unknown): RideEventResult;
  /** Applies one named event, idempotent by `(rideId, eventId)`. */
  apply(input: unknown): RideEventResult;
  /** Advances the authoritative tick; a decreasing tick is rejected. */
  advance(atTick: unknown): number;
  ride(rideId: string): RideRecord | undefined;
  rideFor(requestId: string): RideRecord | undefined;
  active(): readonly RideRecord[];
  terminal(): readonly RideRecord[];
  snapshot(): RideLifecycleSnapshot;
  /** Snapshot entry for one retained ride, including a closed one, for evidence and tests. */
  snapshotRide(rideId: string): RideSnapshotEntry | undefined;
  restore(snapshot: unknown): readonly RideRecord[];
  /** Scenario boundary (065): clears retained rides; the tick stays monotonic. */
  reset(input: unknown): RideLifecycleReset;
  stats(): RideLifecycleStats;
  dispose(): void;
}

const beginFields = ['requestId', 'eventId', 'tick'] as const;

const eventFields = ['rideId', 'eventId', 'event', 'tick', 'reason'] as const;

const snapshotFields = ['version', 'tick', 'rides'] as const;

const resetFields = ['tick', 'preserveStats'] as const;

const snapshotEntryFields = [
  'requestId',
  'state',
  'updatedTick',
  'transitions',
  'appliedEventIds',
] as const;

const transitionFields = [
  'transitionId',
  'rideId',
  'eventId',
  'event',
  'from',
  'to',
  'tick',
  'reason',
  'release',
] as const;

const eventTargets: Readonly<Record<RideEventType, RideState>> = Object.freeze({
  ASSIGNED: 'TO_PICKUP',
  ARRIVED_PICKUP: 'PICKUP',
  PICKUP_COMPLETE: 'TO_DROPOFF',
  ARRIVED_DROPOFF: 'DROPOFF',
  DROPOFF_COMPLETE: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
});

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isTerminalState(state: RideState): state is RideTerminalState {
  return (RIDE_TERMINAL_STATES as readonly RideState[]).includes(state);
}

function boundedId(value: unknown, maximum: number, label: string): string {
  const id = text(value);
  requireContract(
    id.length <= maximum && id.trim() === id,
    `Invalid ${label} identity or code-unit length`,
  );
  return id;
}

function boundedTextList(value: unknown, maximum: number, label: string): readonly string[] {
  const entries = list(value, (entry) => boundedId(entry, maximum, label));
  requireContract(new Set(entries).size === entries.length, `Duplicate ${label} entry`);
  return entries;
}

function plainFields(
  value: unknown,
  allowed: readonly string[],
  label: string,
): Record<string, unknown> {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract((allowed as readonly string[]).includes(key), `Unknown ${label} field`);
  return data;
}

function requireRequired(data: Record<string, unknown>, key: string, label: string): void {
  requireContract(data[key] !== undefined, `Missing ${label} field: ${key}`);
}

/** Stable ride identity: the real 059 request inside the real 060 namespace. */
export function rideLifecycleId(namespace: string, requestId: string): string {
  return createStableId('ride', namespace, [requestId]);
}

/** Stable transition identity: one event per ride, never an array position or a clock. */
export function rideTransitionId(namespace: string, rideId: string, eventId: string): string {
  return createStableId('ride-transition', namespace, [rideId, eventId]);
}

function readDispatcher(value: unknown): RideDispatcher {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as RideDispatcher).namespace === 'string' &&
      typeof (value as RideDispatcher).assignmentFor === 'function' &&
      typeof (value as RideDispatcher).release === 'function' &&
      typeof (value as RideDispatcher).taxiStatus === 'function',
    'Ride lifecycle requires a real dispatcher',
  );
  const dispatcher = value as RideDispatcher;
  requireContract(dispatcher.namespace.trim().length > 0, 'Invalid ride dispatcher namespace');
  return dispatcher;
}

function readReason(
  event: RideEventType,
  value: unknown,
): RideFailureReason | RideCancelReason | null {
  if (event === 'FAILED') {
    requireContract(value !== undefined && value !== null, 'FAILED requires an explicit reason');
    return choice(value, RIDE_FAILURE_REASONS);
  }
  if (event === 'CANCELLED') {
    requireContract(value !== undefined && value !== null, 'CANCELLED requires an explicit reason');
    return choice(value, RIDE_CANCEL_REASONS);
  }
  requireContract(value === undefined, 'Only terminal ride events carry a reason');
  return null;
}

function freezeRelease(release: RideRelease): RideRelease {
  return Object.freeze(release);
}

function freezeTransition(transition: RideTransition): RideTransition {
  return Object.freeze(transition);
}

function freezeRide(ride: RideRecord): RideRecord {
  return Object.freeze(ride);
}

function zeroStats(namespace: string, disposed: boolean, restored: number): RideLifecycleStats {
  return Object.freeze({
    version: RIDE_FSM_VERSION,
    namespace,
    tick: 0,
    rides: 0,
    active: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    transitions: 0,
    releases: 0,
    duplicates: 0,
    restored,
    droppedTerminal: 0,
    disposed,
  });
}

function readAssignment(
  assignment: DispatchAssignment | undefined,
  requestId: string,
): DispatchAssignment {
  requireContract(assignment !== undefined, 'No dispatcher assignment for ride request');
  requireContract(assignment.requestId === requestId, 'Dispatcher assignment request mismatch');
  requireContract(
    assignment.assignmentId.trim().length > 0 && assignment.taxiId.trim().length > 0,
    'Invalid dispatcher assignment identity',
  );
  requireContract(
    Number.isSafeInteger(assignment.tick) && assignment.tick >= 0,
    'Invalid dispatcher assignment tick',
  );
  return assignment;
}

export function createRideLifecycle(options: unknown): RideLifecycle {
  const data = plainFields(options, ['dispatcher'], 'ride lifecycle option');
  requireRequired(data, 'dispatcher', 'ride lifecycle option');
  const dispatcher = readDispatcher(data.dispatcher),
    namespace = text(dispatcher.namespace);

  /** A terminal state must always be releasable through the real 060 vocabulary. */
  for (const state of RIDE_TERMINAL_STATES)
    requireContract(
      (RIDE_DISPATCH_RELEASE_REASONS as readonly string[]).includes(state),
      'Ride terminal state has no dispatcher release reason',
    );

  const rides = new Map<string, RideRecord>(),
    byRequest = new Map<string, string>(),
    applied = new Map<string, Map<string, RideTransition>>();
  let lastTick = 0,
    transitionsTotal = 0,
    releasesTotal = 0,
    duplicates = 0,
    restored = 0,
    droppedTerminal = 0,
    disposed = false;
  const terminals: Record<RideTerminalState, number> = {
    COMPLETED: 0,
    FAILED: 0,
    CANCELLED: 0,
  };

  function assertLive(): void {
    if (disposed) throw new Error('Ride lifecycle disposed');
  }

  function rideIdFor(requestId: string): string {
    return rideLifecycleId(namespace, requestId);
  }

  function activeRides(): RideRecord[] {
    return [...rides.values()].filter((ride) => !ride.terminal);
  }

  function transitionFor(rideId: string, eventId: string): RideTransition | undefined {
    return applied.get(rideId)?.get(eventId);
  }

  function result(
    ride: RideRecord,
    transition: RideTransition,
    duplicate: boolean,
  ): RideEventResult {
    return Object.freeze({ transition, ride, duplicate });
  }

  function addTransition(ride: RideRecord, transition: RideTransition): void {
    const events = applied.get(ride.rideId);
    if (events === undefined) applied.set(ride.rideId, new Map([[transition.eventId, transition]]));
    else events.set(transition.eventId, transition);
  }

  function evictTerminals(): void {
    const closed = [...rides.values()]
      .filter((ride) => ride.terminal)
      .sort(
        (left, right) =>
          left.updatedTick - right.updatedTick || compareText(left.rideId, right.rideId),
      );
    while (closed.length > RIDE_FSM_LIMITS.terminalRides) {
      const victim = closed.shift()!;
      rides.delete(victim.rideId);
      byRequest.delete(victim.requestId);
      applied.delete(victim.rideId);
      droppedTerminal += 1;
    }
  }

  function begin(input: unknown): RideEventResult {
    assertLive();
    const event = plainFields(input, beginFields, 'ride begin');
    requireRequired(event, 'requestId', 'ride begin');
    requireRequired(event, 'eventId', 'ride begin');
    requireRequired(event, 'tick', 'ride begin');
    const requestId = boundedId(event.requestId, RIDE_FSM_LIMITS.idCodeUnits, 'ride request'),
      eventId = boundedId(event.eventId, RIDE_FSM_LIMITS.eventIdCodeUnits, 'ride event'),
      atTick = tick(event.tick);
    const existingId = byRequest.get(requestId);
    if (existingId !== undefined) {
      const existing = rides.get(existingId)!,
        first = existing.transitions[0]!;
      requireContract(
        first.eventId === eventId && first.event === 'ASSIGNED',
        'Ride already exists for this request',
      );
      duplicates += 1;
      return result(existing, first, true);
    }
    if (atTick < lastTick) throw new RangeError('Stale ride tick');
    const assignment = readAssignment(dispatcher.assignmentFor(requestId), requestId);
    requireContract(
      activeRides().length < RIDE_FSM_LIMITS.activeRides,
      'Ride lifecycle active capacity exceeded',
    );
    for (const ride of activeRides())
      requireContract(
        ride.taxiId !== assignment.taxiId,
        'Taxi already owned by another active ride',
      );
    const rideId = rideIdFor(requestId),
      transition = freezeTransition({
        transitionId: rideTransitionId(namespace, rideId, eventId),
        rideId,
        eventId,
        event: 'ASSIGNED',
        from: null,
        to: 'TO_PICKUP',
        tick: atTick,
        reason: null,
        release: null,
      }),
      ride = freezeRide({
        rideId,
        requestId,
        taxiId: assignment.taxiId,
        assignmentId: assignment.assignmentId,
        pickupZoneId: assignment.pickupZoneId,
        dropoffZoneId: assignment.dropoffZoneId,
        pickupCostSeconds: assignment.pickupCostSeconds,
        tripCostSeconds: assignment.tripCostSeconds,
        totalCostSeconds: assignment.totalCostSeconds,
        pickupRouteLaneIds: assignment.pickupRouteLaneIds,
        tripRouteLaneIds: assignment.tripRouteLaneIds,
        state: 'TO_PICKUP',
        startedTick: atTick,
        updatedTick: atTick,
        terminal: false,
        reason: null,
        release: null,
        transitions: Object.freeze([transition]),
        appliedEventIds: Object.freeze([eventId]),
      });
    lastTick = atTick;
    transitionsTotal += 1;
    rides.set(rideId, ride);
    byRequest.set(requestId, rideId);
    addTransition(ride, transition);
    return result(ride, transition, false);
  }

  function apply(input: unknown): RideEventResult {
    assertLive();
    const event = plainFields(input, eventFields, 'ride event');
    requireRequired(event, 'rideId', 'ride event');
    requireRequired(event, 'eventId', 'ride event');
    requireRequired(event, 'event', 'ride event');
    requireRequired(event, 'tick', 'ride event');
    const rideId = boundedId(event.rideId, RIDE_FSM_LIMITS.rideIdCodeUnits, 'ride'),
      eventId = boundedId(event.eventId, RIDE_FSM_LIMITS.eventIdCodeUnits, 'ride event'),
      type = choice(event.event, rideEventTypes),
      atTick = tick(event.tick),
      reason = readReason(type, event.reason),
      ride = rides.get(rideId);
    requireContract(ride !== undefined, 'Unknown ride');
    const stored = transitionFor(rideId, eventId);
    if (stored !== undefined) {
      requireContract(stored.event === type && stored.reason === reason, 'Ride event id conflict');
      duplicates += 1;
      return result(ride, stored, true);
    }
    if (atTick < lastTick) throw new RangeError('Stale ride tick');
    requireContract(!isTerminalState(ride.state), 'Ride is already terminal');
    requireContract(type !== 'ASSIGNED', 'ASSIGNED is only valid when creating a ride');
    const target = eventTargets[type];
    requireContract(
      (RIDE_TRANSITIONS[ride.state] as readonly RideState[]).includes(target),
      `Illegal ride transition ${ride.state} -> ${target}`,
    );
    requireContract(
      ride.transitions.length < RIDE_FSM_LIMITS.eventsPerRide,
      'Ride event history exceeded',
    );
    let release: RideRelease | null = null;
    if (isTerminalState(target)) {
      const assignment = dispatcher.assignmentFor(ride.requestId);
      requireContract(
        assignment !== undefined &&
          assignment.assignmentId === ride.assignmentId &&
          assignment.taxiId === ride.taxiId,
        'Ride taxi claim is missing; refusing to record a terminal state',
      );
      const released = dispatcher.release(ride.taxiId, target, atTick);
      requireContract(
        released !== null && released.assignment.assignmentId === ride.assignmentId,
        'Ride taxi claim was not released; refusing to record a terminal state',
      );
      release = freezeRelease({
        taxiId: ride.taxiId,
        requestId: ride.requestId,
        assignmentId: ride.assignmentId,
        reason: target,
        tick: atTick,
      });
      terminals[target] += 1;
      releasesTotal += 1;
    }
    const transition = freezeTransition({
        transitionId: rideTransitionId(namespace, ride.rideId, eventId),
        rideId,
        eventId,
        event: type,
        from: ride.state,
        to: target,
        tick: atTick,
        reason,
        release,
      }),
      next = freezeRide({
        ...ride,
        state: target,
        updatedTick: atTick,
        terminal: isTerminalState(target),
        reason,
        release,
        transitions: Object.freeze([...ride.transitions, transition]),
        appliedEventIds: Object.freeze([...ride.appliedEventIds, eventId]),
      });
    lastTick = atTick;
    transitionsTotal += 1;
    rides.set(rideId, next);
    addTransition(next, transition);
    if (next.terminal) evictTerminals();
    return result(next, transition, false);
  }

  function snapshotEntries(selected: readonly RideRecord[]): readonly RideSnapshotEntry[] {
    return Object.freeze(
      selected
        .slice()
        .sort((left, right) => compareText(left.rideId, right.rideId))
        .map((ride) =>
          Object.freeze({
            requestId: ride.requestId,
            state: ride.state,
            updatedTick: ride.updatedTick,
            transitions: ride.transitions,
            appliedEventIds: ride.appliedEventIds,
          }),
        ),
    );
  }

  function snapshot(): RideLifecycleSnapshot {
    return Object.freeze({
      version: RIDE_FSM_VERSION,
      tick: lastTick,
      rides: snapshotEntries(disposed ? [] : activeRides()),
    });
  }

  function snapshotRide(rideId: string): RideSnapshotEntry | undefined {
    if (disposed) return undefined;
    const ride = rides.get(rideId);
    if (ride === undefined) return undefined;
    return snapshotEntries([ride])[0];
  }

  function restore(value: unknown): readonly RideRecord[] {
    assertLive();
    requireContract(rides.size === 0, 'Ride restore requires an empty ride lifecycle');
    const data = plainFields(value, snapshotFields, 'ride snapshot');
    requireRequired(data, 'version', 'ride snapshot');
    requireRequired(data, 'tick', 'ride snapshot');
    requireRequired(data, 'rides', 'ride snapshot');
    requireContract(data.version === RIDE_FSM_VERSION, 'Unsupported ride snapshot version');
    const snapshotTick = tick(data.tick),
      entries = list(data.rides, readSnapshotEntry);
    requireContract(snapshotTick >= lastTick, 'Stale ride snapshot tick');
    requireContract(
      entries.length <= RIDE_FSM_LIMITS.activeRides,
      'Ride snapshot active capacity exceeded',
    );
    const prepared: RideRecord[] = [],
      usedRequests = new Set<string>(),
      usedTaxis = new Set<string>();
    for (const entry of entries) {
      requireContract(!usedRequests.has(entry.requestId), 'Duplicate ride request in snapshot');
      usedRequests.add(entry.requestId);
      const ride = prepareSnapshotEntry(entry, snapshotTick);
      requireContract(!usedTaxis.has(ride.taxiId), 'Taxi already owned by another active ride');
      usedTaxis.add(ride.taxiId);
      prepared.push(ride);
    }
    for (const ride of prepared) {
      rides.set(ride.rideId, ride);
      byRequest.set(ride.requestId, ride.rideId);
      for (const transition of ride.transitions) addTransition(ride, transition);
      transitionsTotal += ride.transitions.length;
    }
    lastTick = snapshotTick;
    restored += prepared.length;
    return Object.freeze(prepared);
  }

  function readSnapshotEntry(value: unknown): RideSnapshotEntry {
    const data = plainFields(value, snapshotEntryFields, 'ride snapshot entry');
    for (const key of snapshotEntryFields) requireRequired(data, key, 'ride snapshot entry');
    const requestId = boundedId(data.requestId, RIDE_FSM_LIMITS.idCodeUnits, 'ride request'),
      state = choice(data.state, rideStates),
      updatedTick = tick(data.updatedTick);
    requireContract(!isTerminalState(state), 'Cannot restore a terminal ride as active');
    const transitions = list(data.transitions, readTransition),
      appliedEventIds = boundedTextList(
        data.appliedEventIds,
        RIDE_FSM_LIMITS.eventIdCodeUnits,
        'ride event',
      );
    requireContract(transitions.length > 0, 'Restored ride requires an ASSIGNED transition');
    requireContract(
      transitions.length <= RIDE_FSM_LIMITS.eventsPerRide,
      'Restored ride event history exceeded',
    );
    const rideId = rideIdFor(requestId);
    let previous: RideTransition | null = null;
    for (const transition of transitions) {
      requireContract(transition.rideId === rideId, 'Restored ride identity mismatch');
      requireContract(
        transition.transitionId === rideTransitionId(namespace, rideId, transition.eventId),
        'Restored ride transition id is not the stable 006 identity',
      );
      requireContract(!isTerminalState(transition.to), 'Cannot restore a terminal ride as active');
      if (previous === null) {
        requireContract(
          transition.event === 'ASSIGNED' &&
            transition.from === null &&
            transition.to === 'TO_PICKUP',
          'Restored ride must start with ASSIGNED',
        );
      } else {
        requireContract(
          transition.from === previous.to,
          'Restored ride transition chain is discontinuous',
        );
        requireContract(
          (RIDE_TRANSITIONS[previous.to] as readonly RideState[]).includes(transition.to) &&
            eventTargets[transition.event] === transition.to,
          'Restored ride transition chain is not allowed',
        );
        requireContract(
          transition.tick >= previous.tick,
          'Restored ride transitions are not monotonic',
        );
      }
      previous = transition;
    }
    const last = transitions[transitions.length - 1]!;
    requireContract(last.to === state, 'Restored ride state does not match its transitions');
    requireContract(
      last.tick === updatedTick,
      'Restored ride updated tick does not match its last transition',
    );
    requireContract(
      appliedEventIds.length === transitions.length &&
        appliedEventIds.every((eventId, index) => eventId === transitions[index]!.eventId),
      'Restored ride event ids do not match its transitions',
    );
    return Object.freeze({ requestId, state, updatedTick, transitions, appliedEventIds });
  }

  function readTransition(value: unknown): RideTransition {
    const data = plainFields(value, transitionFields, 'ride transition');
    for (const key of transitionFields) requireRequired(data, key, 'ride transition');
    const transitionId = boundedId(
        data.transitionId,
        RIDE_FSM_LIMITS.rideIdCodeUnits,
        'ride transition',
      ),
      rideId = boundedId(data.rideId, RIDE_FSM_LIMITS.rideIdCodeUnits, 'ride'),
      eventId = boundedId(data.eventId, RIDE_FSM_LIMITS.eventIdCodeUnits, 'ride event'),
      event = choice(data.event, rideEventTypes),
      from = data.from === null ? null : choice(data.from, rideStates),
      to = choice(data.to, rideStates),
      atTick = tick(data.tick);
    requireContract(data.reason === null, 'Restored ride transition must not carry a reason');
    requireContract(data.release === null, 'Cannot restore a ride whose taxi was already released');
    return freezeTransition({
      transitionId,
      rideId,
      eventId,
      event,
      from,
      to,
      tick: atTick,
      reason: null,
      release: null,
    });
  }

  function prepareSnapshotEntry(entry: RideSnapshotEntry, snapshotTick: number): RideRecord {
    const assignment = readAssignment(dispatcher.assignmentFor(entry.requestId), entry.requestId),
      rideId = rideIdFor(entry.requestId),
      first = entry.transitions[0]!;
    requireContract(
      entry.updatedTick >= assignment.tick,
      'Restored ride predates its dispatcher assignment',
    );
    requireContract(
      entry.updatedTick <= snapshotTick,
      'Restored ride is newer than the snapshot tick',
    );
    return freezeRide({
      rideId,
      requestId: entry.requestId,
      taxiId: assignment.taxiId,
      assignmentId: assignment.assignmentId,
      pickupZoneId: assignment.pickupZoneId,
      dropoffZoneId: assignment.dropoffZoneId,
      pickupCostSeconds: assignment.pickupCostSeconds,
      tripCostSeconds: assignment.tripCostSeconds,
      totalCostSeconds: assignment.totalCostSeconds,
      pickupRouteLaneIds: assignment.pickupRouteLaneIds,
      tripRouteLaneIds: assignment.tripRouteLaneIds,
      state: entry.state,
      startedTick: first.tick,
      updatedTick: entry.updatedTick,
      terminal: false,
      reason: null,
      release: null,
      transitions: entry.transitions,
      appliedEventIds: entry.appliedEventIds,
    });
  }

  function reset(value: unknown): RideLifecycleReset {
    assertLive();
    const data = plainFields(value, resetFields, 'ride reset');
    requireRequired(data, 'tick', 'ride reset');
    requireContract(
      data.preserveStats === undefined || typeof data.preserveStats === 'boolean',
      'Ride reset preserveStats must be a boolean',
    );
    const atTick = tick(data.tick);
    if (atTick < lastTick) throw new RangeError('Stale ride tick');
    let discardedActive = 0;
    for (const ride of rides.values()) if (!ride.terminal) discardedActive += 1;
    const clearedRides = rides.size;
    rides.clear();
    byRequest.clear();
    applied.clear();
    lastTick = atTick;
    if (data.preserveStats !== true) {
      transitionsTotal = 0;
      releasesTotal = 0;
      duplicates = 0;
      restored = 0;
      droppedTerminal = 0;
      terminals.COMPLETED = 0;
      terminals.FAILED = 0;
      terminals.CANCELLED = 0;
    }
    return Object.freeze({ tick: atTick, clearedRides, discardedActive });
  }

  function stats(): RideLifecycleStats {
    if (disposed) return zeroStats(namespace, true, restored);
    let active = 0,
      transitions = 0;
    for (const ride of rides.values()) {
      if (!ride.terminal) active += 1;
      transitions += ride.transitions.length;
    }
    return Object.freeze({
      version: RIDE_FSM_VERSION,
      namespace,
      tick: lastTick,
      rides: rides.size,
      active,
      completed: terminals.COMPLETED,
      failed: terminals.FAILED,
      cancelled: terminals.CANCELLED,
      transitions,
      releases: releasesTotal,
      duplicates,
      restored,
      droppedTerminal,
      disposed: false,
    });
  }

  return Object.freeze({
    namespace,
    currentTick: () => lastTick,
    begin,
    apply,
    advance(atTick: unknown): number {
      assertLive();
      const nextTick = tick(atTick);
      if (nextTick < lastTick) throw new RangeError('Stale ride tick');
      lastTick = nextTick;
      return nextTick;
    },
    ride(rideId: string): RideRecord | undefined {
      return disposed ? undefined : rides.get(rideId);
    },
    rideFor(requestId: string): RideRecord | undefined {
      if (disposed) return undefined;
      const rideId = byRequest.get(requestId);
      return rideId === undefined ? undefined : rides.get(rideId);
    },
    active(): readonly RideRecord[] {
      if (disposed) return Object.freeze([]);
      return Object.freeze(
        activeRides().sort(
          (left, right) =>
            left.startedTick - right.startedTick || compareText(left.rideId, right.rideId),
        ),
      );
    },
    terminal(): readonly RideRecord[] {
      if (disposed) return Object.freeze([]);
      return Object.freeze(
        [...rides.values()]
          .filter((ride) => ride.terminal)
          .sort(
            (left, right) =>
              left.updatedTick - right.updatedTick || compareText(left.rideId, right.rideId),
          ),
      );
    },
    snapshot,
    snapshotRide,
    restore,
    reset,
    stats,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      rides.clear();
      byRequest.clear();
      applied.clear();
      lastTick = 0;
      transitionsTotal = 0;
      releasesTotal = 0;
      duplicates = 0;
      restored = 0;
      droppedTerminal = 0;
      terminals.COMPLETED = 0;
      terminals.FAILED = 0;
      terminals.CANCELLED = 0;
    },
  });
}

export const RIDE_RECORD_FIELDS = Object.freeze([
  'rideId',
  'requestId',
  'taxiId',
  'assignmentId',
  'pickupZoneId',
  'dropoffZoneId',
  'pickupCostSeconds',
  'tripCostSeconds',
  'totalCostSeconds',
  'pickupRouteLaneIds',
  'tripRouteLaneIds',
  'state',
  'startedTick',
  'updatedTick',
  'terminal',
  'reason',
  'release',
  'transitions',
  'appliedEventIds',
] as const);

export const RIDE_TRANSITION_FIELDS = Object.freeze([...transitionFields]);
