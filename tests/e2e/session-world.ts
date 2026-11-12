import {
  createVerticalSliceWorld,
  VERTICAL_SLICE_ENGINE_VERSION,
  verticalSliceBaseParameters,
} from '../../src/app/index';
import type { VerticalSliceWorld } from '../../src/app/index';
import { createRideDemand, createRideDispatcher, createRideLifecycle } from '../../src/fleet/index';
import type { RideLifecycle, RideDispatcher, RideDemand } from '../../src/fleet/index';
import {
  createControlAuthority,
  createModeControls,
  createVehicleSelection,
} from '../../src/input/index';
import type { ControlAuthority, ModeControls, VehicleSelection } from '../../src/input/index';
import { createVehicleController } from '../../src/vehicles/index';
import type { BodyIdentity } from '../../src/vehicles/index';
import { createRoutePlanner } from '../../src/world/index';
import type { RoutePlanner } from '../../src/world/index';
import { getParameterDefinition } from '../../src/profiles/index';
import { parseInterventionSegment } from '../../src/telemetry/index';
import type { InterventionSegment } from '../../src/telemetry/index';
import { createLearningQueueHarness } from '../harness/learning-queue-harness';
import type { LearningQueueHarness } from '../harness/learning-queue-harness';
import { CONTROLLER_CONTEXT } from '../vehicles/controller-reference';
import { createMutablePositions, TAXI_LANES, fixedWindow } from '../fleet/dispatcher-fixture';
import { rideDemandPlan } from '../fleet/ride-demand-fixture';

/**
 * One session world for PBI 152.
 *
 * It composes the delivered modules instead of inventing a parallel game: the 115 city world brings
 * the real 109 profile store, 110 activation, 112 pipeline and 058 civilian traffic; the real 033
 * planner, 059 demand, 060 dispatcher and 061 ride lifecycle own the ride; 066/067/068 own the
 * player seat, the mode keys and the vehicle switch; 005 owns the intervention segment boundary.
 * Only the native physics step is a counted fixture (the same double the 068 tests use), and it is
 * declared in the report limitations.
 */
export const SESSION_WORLD_VERSION = '152-session-world-v1' as const;
export const SESSION_ID = 'session-152-e2e' as const;
export const PLAYER_ID = 'player-152' as const;
export const SESSION_WORLD_EPOCH = 1 as const;
export const SESSION_SEED = 152_000 as const;
export const SESSION_TAXIS = 30 as const;
export const SESSION_CIVILIANS = 40 as const;
export const SESSION_ENGINE_VERSION = VERTICAL_SLICE_ENGINE_VERSION;

export interface SegmentOwner {
  open(identity: BodyIdentity, mode: 'MANUAL' | 'LEARNING', tick: number): InterventionSegment;
  read(): { readonly identity: BodyIdentity; readonly segment: InterventionSegment } | null;
  /**
   * Closes the open boundary. The closed immutable 005 record is retained in the session history;
   * nothing is renumbered and nothing is dropped.
   */
  close(
    identity: BodyIdentity,
    tick: number,
    reason: 'VEHICLE_SWITCH' | 'MODE_CHANGE' | 'RETURN_TO_AUTO',
  ): InterventionSegment;
  closed(): readonly InterventionSegment[];
  history(): readonly InterventionSegment[];
  stats(): Readonly<{ opened: number; closed: number; open: number; retainedHistory: number }>;
  dispose(): void;
}

/** A bounded 005 owner: exactly one OPEN segment and an append-only closed history. */
export function createSegmentOwner(): SegmentOwner {
  let current: { identity: BodyIdentity; segment: InterventionSegment } | null = null;
  let latest: { identity: BodyIdentity; segment: InterventionSegment } | null = null;
  const closedSegments: InterventionSegment[] = [];
  const allSegments: InterventionSegment[] = [];
  let opened = 0;
  let closed = 0;
  let disposed = false;

  return {
    open(identity, mode, tick) {
      if (disposed || current !== null)
        throw new Error('Segment owner is not ready for a new open');
      const segment = parseInterventionSegment({
        ...CONTROLLER_CONTEXT,
        segmentId: `segment-152-${opened + 1}`,
        vehicleId: identity.entityId,
        controlMode: mode,
        learningEligible: false,
        playerId: PLAYER_ID,
        profileId: 'city-profile-115',
        baseVersionId: 'city-style-base-115',
        learningEpoch: 1,
        controlPreferencesVersion: '025-control-v1',
        startTick: tick,
        endTick: null,
        closeReason: null,
        engineVersion: SESSION_ENGINE_VERSION,
        mapVersion: 'map-152-1',
        inputType: 'KEYBOARD',
        samples: [],
        events: [],
        completeness: 'OPEN',
      });
      current = Object.freeze({ identity, segment });
      latest = current;
      allSegments.push(segment);
      opened += 1;
      return segment;
    },
    read() {
      return disposed ? null : latest;
    },
    close(identity, tick, reason) {
      if (disposed || current === null) throw new Error('No open segment to close');
      if (current.identity !== identity) throw new Error('Segment boundary identity mismatch');
      if (tick < current.segment.startTick) throw new Error('Segment closes before it opens');
      const segment = parseInterventionSegment({
        ...current.segment,
        endTick: tick,
        closeReason: reason,
        completeness: 'CLOSED',
      });
      closedSegments.push(segment);
      allSegments[allSegments.length - 1] = segment;
      latest = Object.freeze({ identity, segment });
      current = null;
      closed += 1;
      return segment;
    },
    closed() {
      return Object.freeze([...closedSegments]);
    },
    history() {
      return Object.freeze([...allSegments]);
    },
    stats() {
      return Object.freeze({
        opened,
        closed,
        open: current === null ? 0 : 1,
        retainedHistory: allSegments.length,
      });
    },
    dispose() {
      current = null;
      disposed = true;
    },
  };
}

export interface SessionIdentities {
  readonly taxi: readonly BodyIdentity[];
  readonly civilian: readonly BodyIdentity[];
}

export interface SessionWorld {
  readonly version: typeof SESSION_WORLD_VERSION;
  readonly city: VerticalSliceWorld;
  readonly planner: RoutePlanner;
  readonly demand: RideDemand;
  readonly dispatcher: RideDispatcher;
  readonly lifecycle: RideLifecycle;
  readonly positions: ReturnType<typeof createMutablePositions>;
  readonly authority: ControlAuthority;
  readonly modes: ModeControls;
  readonly selection: VehicleSelection;
  readonly segments: SegmentOwner;
  readonly queue: LearningQueueHarness;
  readonly identities: SessionIdentities;
  identityOf(vehicleId: string): BodyIdentity | undefined;
  /** Advances the fixed tick by one: city traffic, authority and ride lifecycle share the tick. */
  step(): number;
  tick(): number;
  selected(): BodyIdentity | null;
  mode(): 'AUTO' | 'MANUAL' | 'LEARNING';
  seat(): Readonly<{ identity: BodyIdentity; mode: 'MANUAL' | 'LEARNING' }> | null;
  claimMode(action: 'M' | 'L'): 'ACCEPTED' | 'PENDING' | 'FAULT';
  selectVehicle(
    identity: BodyIdentity,
    source: 'WORLD' | 'FLEET',
  ): 'ACCEPTED' | 'PENDING' | 'FAULT';
  setTripFingerprint(vehicleId: string, rideId: string): void;
  tripFingerprint(vehicleId: string): string;
  dispose(): void;
}

export function createSessionWorld(): SessionWorld {
  const queue = createLearningQueueHarness({ engineVersion: SESSION_ENGINE_VERSION });
  const baseParameters: Record<string, number> = Object.create(null);
  const allDefaults = verticalSliceBaseParameters();
  for (const key of Object.keys(allDefaults)) {
    // The 133 export refuses a value on a reserved (R/extension) key, so the new profile carries
    // only the usable keys of the 092 catalog; the reserved keys stay reserved.
    if (getParameterDefinition(key).implementationStage === 'extension') continue;
    baseParameters[key] = allDefaults[key]!;
  }
  const city = createVerticalSliceWorld({
    queue: queue.queue,
    baseParameters,
    seed: SESSION_SEED,
    taxiCount: SESSION_TAXIS,
    civilianCount: SESSION_CIVILIANS,
  });
  const planner = createRoutePlanner({
    graph: city.graph,
    map: city.map,
    graphVersion: '033-lane-graph-v1',
    costVersion: 'route-cost-v1',
  });
  const demand = createRideDemand({
    plan: rideDemandPlan({
      windows: fixedWindow('sz:0-0', 'sz:1-0', { requestCount: 2, endTick: 10 }),
    }),
    map: city.map,
    graph: city.graph,
    planner,
  });

  const taxiLanes = TAXI_LANES(city.map);
  const positions = createMutablePositions(
    city.taxiIds.map((taxiId, index) => [
      taxiId,
      taxiLanes[index % Math.max(1, taxiLanes.length)] ?? null,
    ]),
  );
  const dispatcher = createRideDispatcher({
    registry: city.registry,
    demand,
    planner,
    map: city.map,
    positions,
  });
  const lifecycle = createRideLifecycle({ dispatcher });

  const identities = {
    taxi: city.taxiIds.map((vehicleId, index) =>
      Object.freeze({ entityId: vehicleId, handle: index + 1, generation: 1 }),
    ),
    civilian: city.civilianIds.map((vehicleId, index) =>
      Object.freeze({ entityId: vehicleId, handle: 1001 + index, generation: 1 }),
    ),
  };
  const byVehicleId = new Map<string, BodyIdentity>();
  const kindById = new Map<string, 'TAXI' | 'CIVIL'>();
  for (const identity of identities.taxi) {
    byVehicleId.set(identity.entityId, identity);
    kindById.set(identity.entityId, 'TAXI');
  }
  for (const identity of identities.civilian) {
    byVehicleId.set(identity.entityId, identity);
    kindById.set(identity.entityId, 'CIVIL');
  }

  let selected: BodyIdentity | null = identities.taxi[0] ?? null;
  let sessionTick = 0;
  const tripByVehicleId = new Map<string, string>();
  let authorityClear: (() => void) | null = null;

  const controller = createVehicleController(CONTROLLER_CONTEXT, {
    bodyIdentity: (id) => byVehicleId.get(id),
    step() {
      return {
        controllerMs: 0,
        stepMs: 0,
        queryMs: 0,
        bridgeMs: 0,
        totalMs: 0,
        queryCount: 0,
        bridgeCalls: 0,
      };
    },
  });
  const authority = createControlAuthority(CONTROLLER_CONTEXT, controller, {
    bodyIdentity: (id) => byVehicleId.get(id),
    clearOldPlayer: () => {
      authorityClear?.();
    },
  });
  for (const identity of byVehicleId.values()) authority.register(identity);

  const modes = createModeControls(CONTROLLER_CONTEXT, {
    readAuthority: () => authority.getStats(),
    selectedIdentity: () => selected,
    bodyIdentity: (id) => byVehicleId.get(id),
  });

  const segments = createSegmentOwner();
  const selection = createVehicleSelection(CONTROLLER_CONTEXT, {
    readAuthority: () => authority.getStats(),
    bodyIdentity: (id) => byVehicleId.get(id),
    readPresentation: (identity) => ({
      identity,
      kind: kindById.get(identity.entityId) === 'CIVIL' ? 'CIVIL' : 'TAXI',
      visible: true,
      selectable: true,
    }),
    readCameraTarget: () => selected,
    selectCamera(identity) {
      selected = identity;
    },
    clearInput() {
      modes.clear();
    },
    readAssignment: (identity) => ({
      context: CONTROLLER_CONTEXT,
      identity,
      routeFingerprint: `route-${identity.entityId}`,
      tripFingerprint: tripByVehicleId.get(identity.entityId) ?? `trip-${identity.entityId}`,
    }),
    readBoundary: (identity) => {
      const current = segments.read();
      if (current === null || current.identity !== identity) return null;
      const segment = current.segment;
      const closed = segment.completeness !== 'OPEN';
      const closeReason: 'VEHICLE_SWITCH' | null =
        closed && segment.closeReason === 'VEHICLE_SWITCH' ? 'VEHICLE_SWITCH' : null;
      return {
        context: CONTROLLER_CONTEXT,
        identity,
        segmentId: segment.segmentId,
        mode: segment.controlMode === 'LEARNING' ? 'LEARNING' : 'MANUAL',
        startTick: segment.startTick,
        endTick: segment.endTick,
        completeness: closed ? 'CLOSED' : 'OPEN',
        closeReason,
      };
    },
    closeBoundary(event) {
      segments.close(event.identity, event.tick, event.reason);
    },
  });
  for (const identity of identities.taxi) selection.register(identity, 'TAXI');
  for (const identity of identities.civilian) selection.register(identity, 'CIVIL');

  const time = (tick: number) => ({
    ...CONTROLLER_CONTEXT,
    version: '066-control-authority-v1' as const,
    tick,
    dtSeconds: 1 / 60,
  });
  const modeTime = (tick: number) => ({
    ...CONTROLLER_CONTEXT,
    version: '067-mode-controls-v1' as const,
    tick,
    dtSeconds: 1 / 60,
  });
  const selectionTime = (tick: number) => ({
    ...CONTROLLER_CONTEXT,
    version: '068-vehicle-selection-v1' as const,
    tick,
    dtSeconds: 1 / 60,
  });

  function stepOnce(): number {
    sessionTick += 1;
    const authorityTick = authority.getStats().tick;
    if (authorityTick !== sessionTick - 1) {
      throw new Error(`tick drift before step: session ${sessionTick}, authority ${authorityTick}`);
    }
    city.stepTo(sessionTick);
    authority.step(time(sessionTick), [], []);
    lifecycle.advance(sessionTick);
    return sessionTick;
  }

  return {
    version: SESSION_WORLD_VERSION,
    city,
    planner,
    demand,
    dispatcher,
    lifecycle,
    positions,
    authority,
    modes,
    selection,
    segments,
    queue,
    identities,
    identityOf: (vehicleId) => byVehicleId.get(vehicleId),
    step: stepOnce,
    tick: () => sessionTick,
    selected: () => selected,
    mode: () => modes.observe().mode,
    seat: () => authority.getStats().seat,
    claimMode(action) {
      const current = authority.getStats();
      modes.enqueue(action, selected ?? undefined);
      const ticket = modes.prepare(modeTime(current.tick + 1));
      authority.step(time(ticket.tick), [], ticket.requests);
      const result = modes.settle(ticket);
      if (result === 'ACCEPTED') sessionTick = Math.max(sessionTick, ticket.tick);
      return result;
    },
    selectVehicle(identity, source) {
      if (!selection.enqueue(identity, source)) throw new Error('Selection enqueue refused');
      const ticket = selection.prepare(selectionTime(authority.getStats().tick + 1));
      if (ticket === null) throw new Error('Selection produced no ticket');
      authority.step(time(ticket.tick), [], ticket.requests);
      const result = selection.settle(ticket);
      if (result === 'ACCEPTED') sessionTick = Math.max(sessionTick, ticket.tick);
      return result;
    },
    setTripFingerprint(vehicleId, rideId) {
      tripByVehicleId.set(vehicleId, `ride-${rideId}`);
    },
    tripFingerprint: (vehicleId) => tripByVehicleId.get(vehicleId) ?? `trip-${vehicleId}`,
    dispose() {
      selection.dispose();
      modes.dispose();
      segments.dispose();
      authority.dispose();
      controller.dispose();
      lifecycle.dispose();
      dispatcher.dispose();
      demand.dispose();
      planner.dispose();
      city.dispose();
      queue.dispose();
      authorityClear = null;
    },
  };
}
