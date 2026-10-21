import { PASSENGER_PHASE_MARKERS, PASSENGER_VISUAL_VERSION, passengerMarkerId } from '../../src/ui';
import type {
  PassengerMarker,
  PassengerMarkerCommand,
  PassengerMarkerOmission,
  PassengerVisualFrame,
  PassengerVisualPort,
  PassengerVisualPhase,
  PassengerVisualLabels,
} from '../../src/ui';

export const PASSENGER_SESSION = 'session:147';
export const PASSENGER_TAXI = 'taxi:147:A';
export const PASSENGER_RIDE = 'ride:147:demo';
export const PASSENGER_PICKUP_ZONE = 'sz:0-0';
export const PASSENGER_DROPOFF_ZONE = 'sz:1-0';

export const PASSENGER_ANCHORS = Object.freeze({
  PICKUP: Object.freeze({ x: 12, z: -4 }),
  DROPOFF: Object.freeze({ x: -8, z: 20 }),
});

const PHASE_LABELS: Readonly<Record<PassengerVisualPhase, string>> = Object.freeze({
  NONE: 'Fără cursă',
  WAITING_PICKUP: 'Așteptare ridicare',
  BOARDING: 'Îmbarcare',
  ONBOARD: 'La bord',
  DROPPING_OFF: 'Coborâre',
});

function markerFor(role: PassengerMarker['role'], rideId: string): PassengerMarker {
  const dropoff = role === 'DROPOFF',
    anchor = dropoff ? PASSENGER_ANCHORS.DROPOFF : PASSENGER_ANCHORS.PICKUP;
  return Object.freeze({
    markerId: passengerMarkerId(rideId, role),
    role,
    zoneId: dropoff ? PASSENGER_DROPOFF_ZONE : PASSENGER_PICKUP_ZONE,
    x: anchor.x,
    z: anchor.z,
    label: role === 'PICKUP' ? 'P' : role === 'DROPOFF' ? 'D' : 'S',
  });
}

function labelsFor(phase: PassengerVisualPhase, occupancy: 0 | 1): PassengerVisualLabels {
  return Object.freeze({
    phase: PHASE_LABELS[phase],
    occupancy: occupancy === 1 ? '1 pasager' : '0 pasageri',
    passenger: phase === 'NONE' ? 'Niciun pasager' : 'Pasager V1',
  });
}

export interface PassengerFrameOptions {
  readonly tick?: number;
  readonly rideId?: string;
  readonly taxiId?: string;
  /** Simulates the missing anchor that must omit a marker instead of inventing a point. */
  readonly omit?: 'PICKUP' | 'DROPOFF' | null;
}

/** Builds one contract-valid frame for a phase; malformed tests mutate it explicitly. */
export function passengerFrame(
  phase: PassengerVisualPhase,
  options: PassengerFrameOptions = {},
): PassengerVisualFrame {
  const tick = options.tick ?? 10,
    rideId = phase === 'NONE' ? null : (options.rideId ?? PASSENGER_RIDE),
    omit = options.omit ?? null,
    occupancy: 0 | 1 = phase === 'ONBOARD' || phase === 'DROPPING_OFF' ? 1 : 0,
    passengerVisible = phase === 'BOARDING' || phase === 'ONBOARD' || phase === 'DROPPING_OFF',
    markers: PassengerMarker[] = [],
    omissions: PassengerMarkerOmission[] = [];
  for (const role of PASSENGER_PHASE_MARKERS[phase]) {
    const omitted = omit === 'PICKUP' ? role === 'PICKUP' || role === 'PASSENGER' : role === omit;
    if (omitted) continue;
    markers.push(markerFor(role, rideId!));
  }
  if (omit === 'PICKUP' && (phase === 'WAITING_PICKUP' || phase === 'BOARDING'))
    omissions.push(
      Object.freeze({
        role: 'PICKUP' as const,
        zoneId: PASSENGER_PICKUP_ZONE,
        reason: 'ANCHOR_MISSING' as const,
      }),
    );
  if (omit === 'DROPOFF' && (phase === 'ONBOARD' || phase === 'DROPPING_OFF'))
    omissions.push(
      Object.freeze({
        role: 'DROPOFF' as const,
        zoneId: PASSENGER_DROPOFF_ZONE,
        reason: 'ANCHOR_MISSING' as const,
      }),
    );
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: PASSENGER_VISUAL_VERSION,
    sessionId: PASSENGER_SESSION,
    worldEpoch: 0,
    tick,
    taxiId: options.taxiId ?? PASSENGER_TAXI,
    rideId,
    phase,
    occupancy,
    passengerVisible,
    markers: Object.freeze(markers),
    omissions: Object.freeze(omissions),
    labels: labelsFor(phase, occupancy),
    accessibleText: `Cadru ${phase} la tick ${tick}${omit === null ? '' : ` fără marker ${omit}`}.`,
    reset: phase === 'NONE',
  });
}

export interface RecordedPassengerCommand {
  readonly op: 'setMarker' | 'removeMarker' | 'setPassengerVisible' | 'clear';
  readonly markerId?: string;
  readonly role?: PassengerMarker['role'];
  readonly zoneId?: string;
  readonly x?: number;
  readonly z?: number;
  readonly label?: PassengerMarker['label'];
  readonly visible?: boolean;
}

export interface RecordingPassengerPort {
  readonly port: PassengerVisualPort;
  readonly calls: RecordedPassengerCommand[];
  reset(): void;
}

/** Deterministic marker port that records commands instead of creating a mesh or a DOM node. */
export function createRecordingPassengerPort(): RecordingPassengerPort {
  const calls: RecordedPassengerCommand[] = [];
  return {
    port: Object.freeze({
      setMarker(command: PassengerMarkerCommand) {
        calls.push(
          Object.freeze({
            op: 'setMarker' as const,
            markerId: command.markerId,
            role: command.role,
            zoneId: command.zoneId,
            x: command.x,
            z: command.z,
            label: command.label,
          }),
        );
      },
      removeMarker(markerId: string) {
        calls.push(Object.freeze({ op: 'removeMarker' as const, markerId }));
      },
      setPassengerVisible(visible: boolean) {
        calls.push(Object.freeze({ op: 'setPassengerVisible' as const, visible }));
      },
      clear() {
        calls.push(Object.freeze({ op: 'clear' as const }));
      },
    }),
    calls,
    reset() {
      calls.length = 0;
    },
  };
}
