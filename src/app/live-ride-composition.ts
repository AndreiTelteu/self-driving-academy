import {
  createLiveRideLifecycle,
  type CivilServiceRouteSnapshot,
  type LiveRideLifecycle,
  type LiveRideLifecycleResetResult,
  type LiveRideLifecycleSnapshot,
  type LiveRideLifecycleStats,
  type LiveRideLifecycleStepResult,
  type LiveRides,
} from '../fleet';
import { parseRoadMap } from '../world';
import type { LaneGraph, RoadMap, RoutePlanner } from '../world';
import { readPassengerVisualFrame } from './passenger-visual';
import { readTaxiHudSnapshot, type TaxiHudFrame } from './taxi-hud';
import type { TaxiHudSnapshot } from '../ui';
import type { PassengerVisualFrame } from '../ui';
import type { EtaServiceState } from '../fleet';

export const LIVE_RIDE_COMPOSITION_VERSION = '265-live-ride-composition-v1' as const;

/** The narrow 058 port used to execute a real ride route; no simulation is created here. */
export interface LiveRideActorRouteControl {
  assignServiceRoute(vehicleId: string, zoneId: string, atTick?: number): unknown;
  clearServiceRoute(vehicleId: string, atTick?: number): unknown;
  serviceRoute(vehicleId: string): CivilServiceRouteSnapshot | null;
}

export interface LiveRideActorRouteView {
  readonly rideId: string;
  readonly taxiId: string;
  readonly leg: 'PICKUP' | 'DROPOFF';
  readonly zoneId: string;
  /** Real 041 route facts from the 058 actor, including its stop point inside the 032 zone. */
  readonly route: CivilServiceRouteSnapshot;
}

/**
 * PBI 265 composition root. It wires the fleet lifecycle (061–064 over the 264 claims) to the two
 * accepted read models of the browser: the 147 passenger frame and the 073 taxi HUD. When a 058
 * actor port is supplied, the assigned taxi executes the real pickup then dropoff route; the port
 * never creates a second route, ride or passenger model.
 */
export interface LiveRideCompositionOptions {
  readonly live: LiveRides;
  readonly map: unknown;
  readonly graph?: LaneGraph;
  readonly planner?: RoutePlanner;
  readonly actors?: LiveRideActorRouteControl;
  readonly tickRateHz?: number;
  readonly speedThresholdMps?: number;
  readonly dwellTicks?: number;
  readonly displacementToleranceM?: number;
  readonly serviceState?: EtaServiceState;
  readonly sessionId?: string;
  readonly worldEpoch?: number;
}

export interface LiveRideCompositionSnapshot {
  readonly version: typeof LIVE_RIDE_COMPOSITION_VERSION;
  readonly tick: number;
  readonly live: ReturnType<LiveRides['snapshot']>;
  readonly rides: LiveRideLifecycleSnapshot;
  /** One accepted 147 frame per retained ride, keyed by the real 061 `rideId`. */
  readonly passenger: Readonly<Record<string, PassengerVisualFrame>>;
  /** Real 058 route progress per active ride, keyed by `rideId`; empty without an actor port. */
  readonly actorRoutes: Readonly<Record<string, LiveRideActorRouteView>>;
  readonly disposed: boolean;
}

export interface LiveRideComposition {
  readonly version: typeof LIVE_RIDE_COMPOSITION_VERSION;
  readonly lifecycle: LiveRideLifecycle;
  step(input: unknown): LiveRideLifecycleStepResult;
  setTaxiStatus(taxiId: unknown, status: unknown): ReturnType<LiveRideLifecycle['setTaxiStatus']>;
  setServiceState(state: unknown): EtaServiceState;
  snapshot(): LiveRideCompositionSnapshot;
  /** One 147 frame for the selected/player taxi, or a reset frame when there is no ride. */
  passenger(input: LiveRidePassengerRequest): PassengerVisualFrame;
  /** One 073 HUD frame from the real registry, lifecycle and ETA. */
  hud(input: TaxiHudFrame): TaxiHudSnapshot;
  /** Real 058 service-route progress for every active ride. */
  actorRoutes(): Readonly<Record<string, LiveRideActorRouteView>>;
  stats(): LiveRideLifecycleStats;
  reset(input: unknown): LiveRideLifecycleResetResult;
  dispose(): void;
}

export interface LiveRidePassengerRequest {
  readonly taxiId: string;
  readonly tick: number;
  readonly rideId?: string | null;
}

export function createLiveRideComposition(
  options: LiveRideCompositionOptions,
): LiveRideComposition {
  if (options === undefined || options === null || typeof options !== 'object')
    throw new Error('Live ride composition requires options');
  if (options.live === undefined)
    throw new Error('Live ride composition requires a live composition');
  const map: RoadMap = parseRoadMap(options.map),
    lifecycle = createLiveRideLifecycle({
      live: options.live,
      map,
      ...(options.graph === undefined ? {} : { graph: options.graph }),
      ...(options.planner === undefined ? {} : { planner: options.planner }),
      ...(options.tickRateHz === undefined ? {} : { tickRateHz: options.tickRateHz }),
      ...(options.speedThresholdMps === undefined
        ? {}
        : { speedThresholdMps: options.speedThresholdMps }),
      ...(options.dwellTicks === undefined ? {} : { dwellTicks: options.dwellTicks }),
      ...(options.displacementToleranceM === undefined
        ? {}
        : { displacementToleranceM: options.displacementToleranceM }),
      ...(options.serviceState === undefined ? {} : { serviceState: options.serviceState }),
    });
  const sessionId = options.sessionId ?? options.live.registry.context().sessionId,
    worldEpoch = options.worldEpoch ?? options.live.registry.context().worldEpoch,
    actors = options.actors ?? null;
  if (
    actors !== null &&
    (typeof actors.assignServiceRoute !== 'function' ||
      typeof actors.clearServiceRoute !== 'function' ||
      typeof actors.serviceRoute !== 'function')
  )
    throw new Error('Live ride composition received an invalid 058 actor route port');
  /** Last service leg commanded per taxi; a player-driven taxi is never re-routed. */
  const commanded = new Map<
    string,
    { readonly rideId: string; readonly leg: 'PICKUP' | 'DROPOFF'; readonly zoneId: string }
  >();
  let disposed = false;

  function legFor(state: string): 'PICKUP' | 'DROPOFF' | null {
    if (state === 'TO_PICKUP' || state === 'PICKUP') return 'PICKUP';
    if (state === 'TO_DROPOFF' || state === 'DROPOFF') return 'DROPOFF';
    return null;
  }

  /**
   * Keeps each active ride's real 058 actor on the matching service leg. The route is planned by
   * the actor's own 041 planner from its current authoritative lane, so the taxi drives the real
   * pickup then dropoff path and holds inside the 032 zone until 062/063 observes the dwell.
   * Player-driven taxis are left alone; when they return to AUTO the next step resumes the route.
   */
  function synchronizeActors(atTick: number): void {
    if (actors === null) return;
    const active = lifecycle.lifecycle.active(),
      activeRideIds = new Set(active.map((ride) => ride.rideId));
    for (const ride of active) {
      const leg = legFor(ride.state);
      if (leg === null) continue;
      if (options.live.registry.state(ride.taxiId)?.controlMode !== 'AUTO') continue;
      const previous = commanded.get(ride.taxiId);
      if (previous?.rideId === ride.rideId && previous.leg === leg) continue;
      const zoneId = leg === 'PICKUP' ? ride.pickupZoneId : ride.dropoffZoneId;
      actors.assignServiceRoute(ride.taxiId, zoneId, atTick);
      commanded.set(ride.taxiId, Object.freeze({ rideId: ride.rideId, leg, zoneId }));
    }
    for (const [taxiId, entry] of [...commanded]) {
      if (activeRideIds.has(entry.rideId)) continue;
      actors.clearServiceRoute(taxiId, atTick);
      commanded.delete(taxiId);
    }
  }

  function actorRoutes(): Readonly<Record<string, LiveRideActorRouteView>> {
    if (disposed || actors === null) return Object.freeze({});
    const result: Record<string, LiveRideActorRouteView> = {};
    for (const ride of lifecycle.lifecycle.active()) {
      const leg = legFor(ride.state);
      if (leg === null) continue;
      const route = actors.serviceRoute(ride.taxiId);
      if (route === null) continue;
      const zoneId = leg === 'PICKUP' ? ride.pickupZoneId : ride.dropoffZoneId;
      if (route.zoneId !== zoneId) continue;
      result[ride.rideId] = Object.freeze({
        rideId: ride.rideId,
        taxiId: ride.taxiId,
        leg,
        zoneId,
        route,
      });
    }
    return Object.freeze(result);
  }

  function assertLive(): void {
    if (disposed) throw new Error('Live ride composition disposed');
  }

  function passenger(input: LiveRidePassengerRequest): PassengerVisualFrame {
    assertLive();
    return readPassengerVisualFrame(
      { lifecycle: lifecycle.lifecycle, map },
      {
        taxiId: input.taxiId,
        tick: input.tick,
        ...(input.rideId === undefined ? {} : { rideId: input.rideId }),
        sessionId,
        worldEpoch,
      },
    );
  }

  function snapshot(): LiveRideCompositionSnapshot {
    if (disposed)
      return Object.freeze({
        version: LIVE_RIDE_COMPOSITION_VERSION,
        tick: 0,
        live: options.live.snapshot(),
        rides: lifecycle.snapshot(),
        passenger: Object.freeze({}),
        actorRoutes: Object.freeze({}),
        disposed: true,
      });
    const rides = lifecycle.snapshot(),
      passengerFrames: Record<string, PassengerVisualFrame> = {};
    for (const ride of rides.rides) {
      passengerFrames[ride.rideId] = passenger({
        taxiId: ride.taxiId,
        tick: rides.tick,
        rideId: ride.rideId,
      });
    }
    return Object.freeze({
      version: LIVE_RIDE_COMPOSITION_VERSION,
      tick: rides.tick,
      live: options.live.snapshot(),
      rides,
      passenger: Object.freeze(passengerFrames),
      actorRoutes: actorRoutes(),
      disposed: false,
    });
  }

  return Object.freeze({
    version: LIVE_RIDE_COMPOSITION_VERSION,
    lifecycle,
    step: (input: unknown) => {
      assertLive();
      const result = lifecycle.step(input);
      synchronizeActors(result.tick);
      return result;
    },
    setTaxiStatus: (taxiId: unknown, status: unknown) => {
      assertLive();
      return lifecycle.setTaxiStatus(taxiId, status);
    },
    setServiceState: (state: unknown) => {
      assertLive();
      return lifecycle.setServiceState(state);
    },
    snapshot,
    passenger,
    hud(input: TaxiHudFrame): TaxiHudSnapshot {
      assertLive();
      return readTaxiHudSnapshot(
        { fleet: options.live.registry, lifecycle: lifecycle.lifecycle, eta: lifecycle.eta },
        input,
      );
    },
    actorRoutes,
    stats: () => lifecycle.stats(),
    reset: (input: unknown) => {
      assertLive();
      const result = lifecycle.reset(input);
      if (actors !== null) {
        for (const taxiId of commanded.keys()) actors.clearServiceRoute(taxiId);
        commanded.clear();
      }
      return result;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      commanded.clear();
      lifecycle.dispose();
    },
  });
}
