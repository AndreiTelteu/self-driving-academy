import type { EtaSnapshot, FleetRegistry, RideEta, RideLifecycle, RideRecord } from '../fleet';
import type { VehicleSelection } from '../input';
import type { BodyIdentity } from '../vehicles';
import type { FleetPanelEta, FleetPanelRide, FleetPanelSnapshot, FleetPanelTaxi } from '../ui';

/** The real modules whose accepted read models feed one 075 panel frame. */
export interface FleetPanelSources {
  readonly fleet: FleetRegistry;
  readonly lifecycle: RideLifecycle;
  readonly eta: RideEta;
}

/** One host frame: the accepted tick and the current camera target. */
export interface FleetPanelFrame {
  readonly tick: number;
  /** Camera target. A civilian selection simply has no row in the taxi list. */
  readonly followedTaxiId: string | null;
}

function legFor(state: RideRecord['state']): 'PICKUP' | 'TRIP' | null {
  if (state === 'TO_PICKUP' || state === 'PICKUP') return 'PICKUP';
  if (state === 'TO_DROPOFF' || state === 'DROPOFF') return 'TRIP';
  return null;
}

function notObserved(serviceState: FleetPanelEta['serviceState']): FleetPanelEta {
  return Object.freeze({
    status: 'NOT_OBSERVED' as const,
    reason: null,
    serviceState,
    seconds: null,
    minSeconds: null,
    maxSeconds: null,
    progressFraction: null,
    remainingDistanceM: null,
  });
}

/**
 * A row must never show a previous leg's ETA or another taxi's plan. 064 keeps its last estimate, so
 * this source drops it whenever the ride, taxi, stage or leg no longer match, exactly like 073/074.
 */
function etaFor(estimate: EtaSnapshot | undefined, ride: RideRecord): FleetPanelEta {
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
    progressFraction: estimate.progressFraction,
    remainingDistanceM: estimate.remainingDistanceM,
  });
}

/** First active ride per taxi; 061 already guarantees at most one active ride per taxi. */
function activeRidesByTaxi(lifecycle: RideLifecycle): ReadonlyMap<string, RideRecord> {
  const rides = new Map<string, RideRecord>();
  for (const ride of lifecycle.active()) if (!rides.has(ride.taxiId)) rides.set(ride.taxiId, ride);
  return rides;
}

/**
 * Composition root for 075. It reads the real 057 registry, 061 lifecycle and 064 estimate and
 * lists only TAXI members: civilians belong to 076. It creates no taxi, ride, profile version, ETA
 * or blockage of its own, and it never touches selection, camera or physics state.
 */
export function readFleetPanelSnapshot(
  sources: FleetPanelSources,
  frame: FleetPanelFrame,
): FleetPanelSnapshot {
  const context = sources.fleet.context(),
    active = activeRidesByTaxi(sources.lifecycle),
    taxis = sources.fleet
      .list()
      .filter((vehicle) => vehicle.driverKind === 'TAXI')
      .map((vehicle): FleetPanelTaxi => {
        const state = sources.fleet.state(vehicle.vehicleId);
        if (state === undefined)
          throw new Error(`Fleet panel has no accepted state for ${vehicle.vehicleId}`);
        const ride = active.get(vehicle.vehicleId),
          rideView: FleetPanelRide | null =
            ride === undefined
              ? null
              : Object.freeze({
                  rideId: ride.rideId,
                  state: ride.state,
                  pickupZoneId: ride.pickupZoneId,
                  dropoffZoneId: ride.dropoffZoneId,
                  eta: etaFor(sources.eta.estimate(ride.rideId), ride),
                }),
          serviceState = rideView?.eta.serviceState ?? null;
        return Object.freeze({
          vehicleId: vehicle.vehicleId,
          slot: vehicle.slot,
          classId: vehicle.classId,
          profileId: vehicle.profileId,
          appliedProfileVersion: state.appliedProfileVersion,
          controlMode: state.controlMode,
          serviceState,
          blocked: serviceState === 'BLOCKED',
          ride: rideView,
        });
      });
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: '075-fleet-panel-v1',
    sessionId: context.sessionId,
    worldEpoch: context.worldEpoch,
    tick: frame.tick,
    followedTaxiId: frame.followedTaxiId,
    taxis: Object.freeze(taxis),
  });
}

/** Host ports required to turn one clicked row into a real 068 FLEET selection intention. */
export interface FleetPanelSelectionSources {
  /** Maps a 057 vehicleId to its exact admitted native body identity. `undefined` when absent. */
  readonly bodyIdentity: (vehicleId: string) => BodyIdentity | undefined;
  /** The real 068 owner; the adapter only calls `enqueue` and owns no selection state. */
  readonly selection: Pick<VehicleSelection, 'enqueue'>;
}

/**
 * Small, testable adapter for the panel `select` port. A missing identity is `false`, never an
 * invented identity, and the panel itself neither moves a vehicle nor takes over control.
 */
export function createFleetPanelSelectPort(
  sources: FleetPanelSelectionSources,
): (vehicleId: string) => boolean {
  return (vehicleId: string) => {
    const identity = sources.bodyIdentity(vehicleId);
    if (identity === undefined) return false;
    return sources.selection.enqueue(identity, 'FLEET');
  };
}
