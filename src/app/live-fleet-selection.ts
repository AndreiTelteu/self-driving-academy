/**
 * PBI 263 — read model for selecting any live taxi or civilian.
 *
 * The live fleet is the composition itself: the two seeded cars plus every real 058 actor. There is
 * no second registry or selection store. This module only projects the authoritative frame into the
 * list and map snapshots; selection, takeover and release are commands of the composition owner.
 */
import type {
  FleetSelectionSnapshot,
  FleetSelectionVehicle,
  MapSelectionSnapshot,
  MapSelectionVehicle,
} from '../ui';
import type { CompositionVehicle } from './walking-composition';
import type { InputAuthority } from '../input';

export const LIVE_FLEET_SELECTION_VERSION = '263-live-fleet-selection-v1' as const;

/** Stable presentation slots for the two seeded composition cars (they have no 057 registry slot). */
export const LIVE_FLEET_PRESENTATION_SLOTS = Object.freeze({
  taxi: 9998,
  civil: 9999,
});

export interface LiveFleetSelectionFrame {
  readonly tick: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly vehicles: readonly CompositionVehicle[];
  readonly authority: InputAuthority;
  /** The exact camera target; the character id means "no vehicle selected". */
  readonly cameraEntityId: string;
  readonly characterEntityId: string;
  /** Camera-only selection, `null` when the camera follows the controlled entity. */
  readonly selectedVehicleId: string | null;
  /** The single car in the PLAYER seat (MANUAL/LEARNING), never an AUTO observation. */
  readonly playerVehicleId: string | null;
}

export interface LiveFleetSelectionSnapshot {
  readonly version: typeof LIVE_FLEET_SELECTION_VERSION;
  readonly fleet: FleetSelectionSnapshot;
  readonly map: MapSelectionSnapshot;
  /** The camera target when it is a vehicle; otherwise `null`. */
  readonly followedVehicleId: string | null;
}

/** PBI 281: the same yaw→map-heading conversion used by the 263 map markers. */
export function mapHeadingFromCompositionYaw(yawRad: number): number {
  if (!Number.isFinite(yawRad)) throw new Error('Map heading requires a finite yaw.');
  const value = Math.PI / 2 - yawRad;
  return ((((value + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

function labelOf(vehicle: CompositionVehicle): string {
  if (vehicle.driverKind === 'TAXI')
    return vehicle.slot === null ? `Taxi parcat (${vehicle.vehicleId})` : `Taxi #${vehicle.slot}`;
  return vehicle.slot === null ? `Civil parcat (${vehicle.vehicleId})` : `Civil #${vehicle.slot}`;
}

/**
 * Projects the accepted composition frame into the 263 list and the existing 076 map markers.
 * A vehicle always keeps its `vehicleId`; the seeded cars use stable presentation-only slots so the
 * map parser can accept them without inventing a second fleet identity.
 */
export function readLiveFleetSelectionSnapshot(
  frame: LiveFleetSelectionFrame,
): LiveFleetSelectionSnapshot {
  if (frame === null || typeof frame !== 'object')
    throw new Error('Live fleet selection requires a frame.');
  if (!Number.isSafeInteger(frame.tick) || frame.tick < 0)
    throw new Error('Live fleet selection tick must be a non-negative integer.');
  const followedVehicleId =
    frame.cameraEntityId === frame.characterEntityId ? null : frame.cameraEntityId;
  const fleetVehicles: FleetSelectionVehicle[] = [];
  const mapVehicles: MapSelectionVehicle[] = [];
  for (const vehicle of frame.vehicles) {
    const kind = vehicle.driverKind === 'TAXI' ? ('TAXI' as const) : ('CIVIL' as const),
      slot =
        vehicle.slot ??
        (kind === 'TAXI'
          ? LIVE_FLEET_PRESENTATION_SLOTS.taxi
          : LIVE_FLEET_PRESENTATION_SLOTS.civil),
      label = labelOf(vehicle),
      playerControlled = frame.playerVehicleId === vehicle.vehicleId,
      inRide = vehicle.rideId !== null,
      headingRad = mapHeadingFromCompositionYaw(vehicle.yawRad);
    fleetVehicles.push(
      Object.freeze({
        vehicleId: vehicle.vehicleId,
        kind,
        slot,
        label,
        classId: vehicle.classId,
        controlMode: vehicle.controlMode,
        positionM: Object.freeze({
          x: vehicle.positionM.x,
          y: vehicle.positionM.y,
          z: vehicle.positionM.z,
        }),
        headingRad,
        available: !vehicle.blocked && !inRide && !playerControlled,
        inRide,
        blocked: vehicle.blocked,
        rideId: vehicle.rideId,
        routeLaneCount: vehicle.routeLaneIds.length,
        appliedProfileVersion: vehicle.appliedProfileVersion,
        selected: followedVehicleId === vehicle.vehicleId,
        playerControlled,
      }),
    );
    mapVehicles.push(
      Object.freeze({
        vehicleId: vehicle.vehicleId,
        kind,
        slot,
        label,
        positionM: Object.freeze({
          x: vehicle.positionM.x,
          y: vehicle.positionM.y,
          z: vehicle.positionM.z,
        }),
        headingRad,
        available: true,
        selectable: true,
      }),
    );
  }
  return Object.freeze({
    version: LIVE_FLEET_SELECTION_VERSION,
    fleet: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: frame.sessionId,
      worldEpoch: frame.worldEpoch,
      tick: frame.tick,
      selectedVehicleId: followedVehicleId,
      playerVehicleId: frame.playerVehicleId,
      vehicles: Object.freeze(fleetVehicles),
    }),
    map: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      version: '076-map-selection-v1' as const,
      sessionId: frame.sessionId,
      worldEpoch: frame.worldEpoch,
      tick: frame.tick,
      followedVehicleId,
      vehicles: Object.freeze(mapVehicles),
    }),
    followedVehicleId,
  });
}
