import type { FleetRegistry, RideEta, RideLifecycle, RideRecord } from '../fleet';
import type { ControlMode } from '../vehicles';
import type { EtaSnapshot } from '../fleet';
import type { TaxiHudEta, TaxiHudRide, TaxiHudSnapshot, TaxiHudTaxi } from '../ui';

/** The real modules whose accepted read models feed one 073 HUD frame. */
export interface TaxiHudSources {
  readonly fleet: FleetRegistry;
  readonly lifecycle: RideLifecycle;
  readonly eta: RideEta;
}

/** One host frame: the accepted tick, the accepted control mode and the physical speed readback. */
export interface TaxiHudFrame {
  readonly taxiId: string;
  readonly mode: ControlMode;
  readonly tick: number;
  readonly speedMps: number | null;
  /** Optional explicit ride binding; otherwise the active 061 ride of `taxiId` is used. */
  readonly rideId?: string | null;
}

function legFor(state: RideRecord['state']): 'PICKUP' | 'TRIP' | null {
  if (state === 'TO_PICKUP' || state === 'PICKUP') return 'PICKUP';
  if (state === 'TO_DROPOFF' || state === 'DROPOFF') return 'TRIP';
  return null;
}

function notObserved(serviceState: TaxiHudEta['serviceState']): TaxiHudEta {
  return Object.freeze({
    status: 'NOT_OBSERVED' as const,
    reason: null,
    serviceState,
    seconds: null,
    minSeconds: null,
    maxSeconds: null,
    remainingDistanceM: null,
    progressFraction: null,
  });
}

/**
 * The HUD must never show a previous leg's ETA. 064 keeps the last estimate, so the source drops
 * it whenever the ride stage, leg or claimed taxi no longer match.
 */
function etaFor(estimate: EtaSnapshot | undefined, ride: RideRecord): TaxiHudEta {
  if (estimate === undefined) return notObserved(null);
  if (
    estimate.rideId !== ride.rideId ||
    estimate.taxiId !== ride.taxiId ||
    estimate.state !== ride.state ||
    estimate.leg !== legFor(ride.state)
  )
    return notObserved(estimate.serviceState);
  return Object.freeze({
    status: estimate.status,
    reason: estimate.reason,
    serviceState: estimate.serviceState,
    seconds: estimate.etaSeconds,
    minSeconds: estimate.etaMinSeconds,
    maxSeconds: estimate.etaMaxSeconds,
    remainingDistanceM: estimate.remainingDistanceM,
    progressFraction: estimate.progressFraction,
  });
}

function activeRideFor(lifecycle: RideLifecycle, taxiId: string): RideRecord | undefined {
  return lifecycle.active().find((ride) => ride.taxiId === taxiId);
}

/**
 * Composition root for the 073 HUD. It reads the real 057 registry, 061 lifecycle and 064 estimate;
 * it creates no ride, taxi, profile version, speed or ETA of its own.
 */
export function readTaxiHudSnapshot(sources: TaxiHudSources, frame: TaxiHudFrame): TaxiHudSnapshot {
  const context = sources.fleet.context(),
    vehicle = sources.fleet.get(frame.taxiId),
    state = sources.fleet.state(frame.taxiId),
    taxi: TaxiHudTaxi | null =
      vehicle === undefined || state === undefined
        ? null
        : Object.freeze({
            vehicleId: vehicle.vehicleId,
            slot: vehicle.slot,
            classId: vehicle.classId,
            profileId: vehicle.profileId,
            profileVersion: state.appliedProfileVersion,
          }),
    ride = taxi === null ? undefined : activeRideFor(sources.lifecycle, taxi.vehicleId),
    boundRide =
      taxi === null
        ? undefined
        : frame.rideId === undefined || frame.rideId === null
          ? ride
          : sources.lifecycle.ride(frame.rideId),
    rideView: TaxiHudRide | null =
      boundRide === undefined
        ? null
        : Object.freeze({
            rideId: boundRide.rideId,
            taxiId: boundRide.taxiId,
            state: boundRide.state,
            pickupZoneId: boundRide.pickupZoneId,
            dropoffZoneId: boundRide.dropoffZoneId,
            eta: etaFor(sources.eta.estimate(boundRide.rideId), boundRide),
          });
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    sessionId: context.sessionId,
    worldEpoch: context.worldEpoch,
    version: '073-taxi-hud-v1',
    tick: frame.tick,
    speedMps:
      frame.speedMps === null || !Number.isFinite(frame.speedMps) || frame.speedMps < 0
        ? null
        : frame.speedMps,
    mode: frame.mode,
    taxi,
    ride: rideView,
  });
}
