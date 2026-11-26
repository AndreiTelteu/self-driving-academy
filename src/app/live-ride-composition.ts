import {
  createLiveRideLifecycle,
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

/**
 * PBI 265 composition root. It wires the fleet lifecycle (061–064 over the 264 claims) to the two
 * accepted read models of the browser: the 147 passenger frame and the 073 taxi HUD. It creates no
 * second ride, passenger, ETA or marker model; every frame is a pure read of the real modules.
 */
export interface LiveRideCompositionOptions {
  readonly live: LiveRides;
  readonly map: unknown;
  readonly graph?: LaneGraph;
  readonly planner?: RoutePlanner;
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
    worldEpoch = options.worldEpoch ?? options.live.registry.context().worldEpoch;
  let disposed = false;

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
      disposed: false,
    });
  }

  return Object.freeze({
    version: LIVE_RIDE_COMPOSITION_VERSION,
    lifecycle,
    step: (input: unknown) => {
      assertLive();
      return lifecycle.step(input);
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
    stats: () => lifecycle.stats(),
    reset: (input: unknown) => {
      assertLive();
      return lifecycle.reset(input);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      lifecycle.dispose();
    },
  });
}
