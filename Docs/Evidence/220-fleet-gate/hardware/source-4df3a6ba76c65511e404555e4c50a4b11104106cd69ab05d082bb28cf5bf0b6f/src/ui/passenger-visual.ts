import {
  PASSENGER_VISUAL_LIMITS,
  PASSENGER_VISUAL_VERSION,
  parsePassengerVisualFrame,
  passengerVisualSignature,
} from './passenger-visual-format';
import type {
  PassengerMarker,
  PassengerMarkerRole,
  PassengerVisualFrame,
} from './passenger-visual-format';

/**
 * 147 marker/occupancy presenter. It is a command producer, not a renderer: the host owns meshes,
 * sprites or DOM nodes behind `PassengerVisualPort`. The adapter never reads the fleet, the ride
 * lifecycle or the map, never advances a tick and never creates a pedestrian.
 */
export interface PassengerMarkerCommand {
  readonly markerId: string;
  readonly role: PassengerMarkerRole;
  readonly zoneId: string;
  /** Real 032 anchor position in metres on the map plane. */
  readonly x: number;
  readonly z: number;
  readonly label: 'P' | 'D' | 'S';
}

export interface PassengerVisualPort {
  setMarker(command: PassengerMarkerCommand): void;
  removeMarker(markerId: string): void;
  setPassengerVisible(visible: boolean): void;
  clear(): void;
}

export interface PassengerVisualStats {
  readonly version: typeof PASSENGER_VISUAL_VERSION;
  /** Active markers currently owned by the port. */
  readonly markers: number;
  /** Marker/visibility/clear writes issued since creation. */
  readonly commands: number;
  /** `clear()` writes issued (reset, phase wipe or dispose). */
  readonly cleared: number;
  /** Accepted frames that differed from the previous one. */
  readonly updates: number;
  /** Frames refused as malformed or stale before any write. */
  readonly rejected: number;
  readonly visible: boolean;
  readonly disposed: boolean;
}

export interface PassengerVisualAdapter {
  /** `true` when the frame changed the port; `false` for an identical frame. */
  update(frame: unknown): boolean;
  getStats(): PassengerVisualStats;
  dispose(): void;
}

const PORT_METHODS = ['setMarker', 'removeMarker', 'setPassengerVisible', 'clear'] as const;

function readPort(value: unknown): PassengerVisualPort {
  if (!value || typeof value !== 'object')
    throw new Error('Passenger visual presenter requires a marker port');
  const port = value as Record<string, unknown>;
  for (const method of PORT_METHODS)
    if (typeof port[method] !== 'function')
      throw new Error(`Passenger visual port is missing ${method}`);
  return value as PassengerVisualPort;
}

function sameMarker(left: PassengerMarker, right: PassengerMarker): boolean {
  return (
    left.markerId === right.markerId &&
    left.role === right.role &&
    left.zoneId === right.zoneId &&
    left.x === right.x &&
    left.z === right.z &&
    left.label === right.label
  );
}

function commandOf(marker: PassengerMarker): PassengerMarkerCommand {
  return Object.freeze({
    markerId: marker.markerId,
    role: marker.role,
    zoneId: marker.zoneId,
    x: marker.x,
    z: marker.z,
    label: marker.label,
  });
}

/**
 * Consumes validated frames and writes at most `PASSENGER_VISUAL_LIMITS.commandsPerFrame` commands.
 * An identical frame writes nothing; a reset frame clears markers and occupancy exactly once.
 */
export function createPassengerVisualPresenter(port: unknown): PassengerVisualAdapter {
  const markers = readPort(port);
  let current: PassengerVisualFrame | null = null,
    lastSignature = '',
    active = new Map<string, PassengerMarker>(),
    visible = false,
    commands = 0,
    cleared = 0,
    updates = 0,
    rejected = 0,
    disposed = false;

  function clearAll(): boolean {
    const wrote = active.size > 0 || visible;
    if (wrote) {
      markers.clear();
      commands += 1;
      cleared += 1;
    }
    active = new Map<string, PassengerMarker>();
    visible = false;
    return wrote;
  }

  return Object.freeze({
    update(candidate: unknown): boolean {
      if (disposed) throw new Error('Passenger visual presenter disposed');
      let frame: PassengerVisualFrame;
      try {
        frame = parsePassengerVisualFrame(candidate);
      } catch (error) {
        rejected += 1;
        throw error;
      }
      if (
        current !== null &&
        current.sessionId === frame.sessionId &&
        current.worldEpoch === frame.worldEpoch &&
        frame.tick < current.tick
      ) {
        rejected += 1;
        throw new Error('Stale passenger visual frame');
      }
      const signature = passengerVisualSignature(frame);
      if (current !== null && signature === lastSignature) return false;
      current = frame;
      lastSignature = signature;
      updates += 1;
      if (frame.reset) return clearAll();
      let wrote = false;
      const desired = new Map(frame.markers.map((marker) => [marker.markerId, marker])),
        removals = [...active.keys()].filter((markerId) => !desired.has(markerId)).sort();
      for (const markerId of removals) {
        markers.removeMarker(markerId);
        commands += 1;
        active.delete(markerId);
        wrote = true;
      }
      for (const marker of frame.markers) {
        const previous = active.get(marker.markerId);
        if (previous !== undefined && sameMarker(previous, marker)) continue;
        markers.setMarker(commandOf(marker));
        commands += 1;
        active.set(marker.markerId, marker);
        wrote = true;
      }
      if (visible !== frame.passengerVisible) {
        markers.setPassengerVisible(frame.passengerVisible);
        commands += 1;
        visible = frame.passengerVisible;
        wrote = true;
      }
      return wrote;
    },
    getStats(): PassengerVisualStats {
      return Object.freeze({
        version: PASSENGER_VISUAL_VERSION,
        markers: disposed ? 0 : active.size,
        commands,
        cleared,
        updates,
        rejected,
        visible: disposed ? false : visible,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      clearAll();
      disposed = true;
      current = null;
      lastSignature = '';
    },
  });
}

/** Adapter ceiling exported for hosts and evidence; the presenter itself owns no timer. */
export const PASSENGER_VISUAL_ADAPTER_LIMITS = Object.freeze({
  version: PASSENGER_VISUAL_VERSION,
  markers: PASSENGER_VISUAL_LIMITS.markers,
  commandsPerFrame: PASSENGER_VISUAL_LIMITS.commandsPerFrame,
  listeners: 0,
  pedestrianActors: PASSENGER_VISUAL_LIMITS.pedestrianActors,
});
