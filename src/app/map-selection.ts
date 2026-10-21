import type { FleetRegistry } from '../fleet';
import type { VehicleSelection } from '../input';
import type { BodyIdentity } from '../vehicles';
import type { MapSelectionSnapshot, MapSelectionVehicle } from '../ui';
import { MAP_SELECTION_LIMITS, MAP_SELECTION_VERSION } from '../ui';

/**
 * The 068/017 camera target readback. The composition root wires it to the accepted selection view;
 * this module only reads which vehicle the camera follows and never moves the camera itself.
 */
export interface MapSelectionCamera {
  followedVehicleId(): string | null;
}

/** The real modules whose accepted read models feed one 076 snapshot. */
export interface MapSelectionSources {
  readonly fleet: FleetRegistry;
  readonly camera: MapSelectionCamera;
}

/** One host frame: the accepted tick and the injected world-position readback. */
export interface MapSelectionFrame {
  readonly tick: number;
  /** Host readback of the real body position (005/024). `null` when it is not known. */
  readonly positions: (
    vehicleId: string,
  ) => { readonly x: number; readonly y: number; readonly z: number } | null;
  /** Explicit override; otherwise the 068 camera target is the followed vehicle. */
  readonly followedVehicleId?: string | null;
}

function knownPosition(value: unknown): { x: number; y: number; z: number } | null {
  if (!value || typeof value !== 'object') return null;
  const point = value as { readonly x?: unknown; readonly y?: unknown; readonly z?: unknown };
  if (
    ![point.x, point.y, point.z].every(
      (entry) => typeof entry === 'number' && Number.isFinite(entry),
    )
  )
    return null;
  return Object.freeze({ x: point.x as number, y: point.y as number, z: point.z as number });
}

/**
 * Composition root for 076. It lists every real 057 TAXI and CIVIL vehicle that still has a known
 * position and never invents coordinates: a vehicle with a missing or non-finite readback is simply
 * absent from the frame. Civilians keep their real `vehicleId` and their own 057 slot.
 *
 * Marker identity survives representation updates because it is the fleet `vehicleId`; a changed
 * position, kind or label updates that same marker instead of creating another one.
 */
export function readMapSelectionSnapshot(
  sources: MapSelectionSources,
  frame: MapSelectionFrame,
): MapSelectionSnapshot {
  const context = sources.fleet.context(),
    followedVehicleId =
      frame.followedVehicleId === undefined
        ? sources.camera.followedVehicleId()
        : frame.followedVehicleId,
    vehicles: MapSelectionVehicle[] = [];
  for (const vehicle of sources.fleet.list()) {
    const positionM = knownPosition(frame.positions(vehicle.vehicleId));
    if (positionM === null) continue;
    const kind = vehicle.driverKind === 'TAXI' ? ('TAXI' as const) : ('CIVIL' as const);
    vehicles.push(
      Object.freeze({
        vehicleId: vehicle.vehicleId,
        kind,
        slot: vehicle.slot,
        label: kind === 'TAXI' ? `Taxi #${vehicle.slot}` : `Civil #${vehicle.slot}`,
        positionM,
        headingRad: null,
        available: true,
        selectable: true,
      }),
    );
  }
  if (vehicles.length > MAP_SELECTION_LIMITS.vehicles)
    throw new Error('Map selection vehicle ceiling');
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: MAP_SELECTION_VERSION,
    sessionId: context.sessionId,
    worldEpoch: context.worldEpoch,
    tick: frame.tick,
    followedVehicleId,
    vehicles: Object.freeze(vehicles),
  });
}

/** Host ports required to turn one clicked marker into a real 068 WORLD selection intention. */
export interface MapSelectionPortSources {
  /** Maps a 057 vehicleId to its exact admitted native body identity. `undefined` when absent. */
  readonly bodyIdentity: (vehicleId: string) => BodyIdentity | undefined;
  /** The real 068 owner; the adapter only calls `enqueue` and owns no selection state. */
  readonly selection: Pick<VehicleSelection, 'enqueue'>;
}

/**
 * Small, testable adapter for the overlay `select` port. A marker is projected from a WORLD surface,
 * so the intention is enqueued with source `WORLD`. A missing identity is `false`, never an invented
 * identity, and this adapter moves no body, changes no camera and takes over no authority: 068 owns
 * every accepted consequence of the intention.
 */
export function createMapSelectionPort(
  sources: MapSelectionPortSources,
): (vehicleId: string) => boolean {
  return (vehicleId: string) => {
    const identity = sources.bodyIdentity(vehicleId);
    if (identity === undefined) return false;
    return sources.selection.enqueue(identity, 'WORLD');
  };
}
