import type { RideLifecycle, RideRecord, RideState } from '../fleet';
import type { PassengerVisualAdapter } from '../ui';
import {
  PASSENGER_STATE_PHASES,
  PASSENGER_VISUAL_VERSION,
  parsePassengerVisualFrame,
  passengerMarkerId,
} from '../ui';
import type {
  PassengerMarker,
  PassengerMarkerOmission,
  PassengerVisualFrame,
  PassengerVisualLabels,
  PassengerVisualPhase,
} from '../ui';
import type { RoadMap } from '../world';

/**
 * 147 composition root. It reads the real 061 ride and the real 032 service-zone anchors and turns
 * them into one visual frame. It is a read model: no ride event, no dispatcher release, no pickup or
 * dropoff transition, no opportunity and no pedestrian actor is produced or created here.
 *
 * Coordinates are exactly the validated `map.geometry.nodes` position of `zone.anchorNodeId`. A zone
 * or anchor that is missing omits the marker with a reason; no interpolated, snapped or zeroed point
 * is ever emitted.
 */
export interface PassengerVisualSources {
  readonly lifecycle: RideLifecycle;
  readonly map: RoadMap;
}

export interface PassengerVisualFrameInput {
  readonly taxiId: string;
  readonly tick: number;
  /** Explicit ride binding; otherwise the active 061 ride claimed by `taxiId`. */
  readonly rideId?: string | null;
  /** Optional host identity; defaults to the lifecycle namespace. */
  readonly sessionId?: string;
  /** Optional host world epoch; defaults to 0 because 147 owns no epoch. */
  readonly worldEpoch?: number;
}

export interface PassengerRideBridgeSources extends PassengerVisualSources {
  readonly presenter: PassengerVisualAdapter;
}

export interface PassengerRideBridgeStats {
  readonly version: typeof PASSENGER_VISUAL_VERSION;
  readonly presentations: number;
  readonly pedestrianActors: number;
  readonly opportunityEvents: number;
  readonly telemetryEvents: number;
  readonly disposed: boolean;
}

/** A pure consumer of the visual presenter; it holds no dispatcher and no transition method. */
export interface PassengerRideBridge {
  present(input: PassengerVisualFrameInput): PassengerVisualFrame;
  lastFrame(): PassengerVisualFrame | null;
  stats(): PassengerRideBridgeStats;
  dispose(): void;
}

const PHASE_LABELS: Readonly<Record<PassengerVisualPhase, string>> = Object.freeze({
  NONE: 'Fără cursă',
  WAITING_PICKUP: 'Așteptare ridicare',
  BOARDING: 'Îmbarcare',
  ONBOARD: 'La bord',
  DROPPING_OFF: 'Coborâre',
});

const ROLE_TEXT: Readonly<Record<'PICKUP' | 'DROPOFF' | 'PASSENGER', string>> = Object.freeze({
  PICKUP: 'ridicare',
  DROPOFF: 'predare',
  PASSENGER: 'pasager',
});

function phaseFor(state: RideState): PassengerVisualPhase {
  return PASSENGER_STATE_PHASES[state] ?? 'NONE';
}

function occupancyFor(phase: PassengerVisualPhase): 0 | 1 {
  return phase === 'ONBOARD' || phase === 'DROPPING_OFF' ? 1 : 0;
}

function visibleFor(phase: PassengerVisualPhase): boolean {
  return phase === 'BOARDING' || phase === 'ONBOARD' || phase === 'DROPPING_OFF';
}

function labelsFor(phase: PassengerVisualPhase, occupancy: 0 | 1): PassengerVisualLabels {
  const passenger =
    phase === 'NONE'
      ? 'Niciun pasager'
      : occupancy === 1
        ? 'Pasager la bord'
        : phase === 'BOARDING'
          ? 'Pasager în stație'
          : 'Pasager în așteptare';
  return Object.freeze({
    phase: PHASE_LABELS[phase],
    occupancy: `${occupancy} ${occupancy === 1 ? 'pasager' : 'pasageri'}`,
    passenger,
  });
}

function omissionText(omission: PassengerMarkerOmission): string {
  const anchor =
    omission.reason === 'ZONE_MISSING'
      ? 'zona lipsește din harta validată'
      : 'ancora zonei lipsește din harta validată';
  return `Fără marker ${ROLE_TEXT[omission.role]} la zona ${omission.zoneId}: ${anchor}, poziția nu este inventată.`;
}

function accessibleText(input: {
  readonly phase: PassengerVisualPhase;
  readonly ride: RideRecord | null;
  readonly foreign: boolean;
  readonly pickups: string | null;
  readonly dropoffs: string | null;
  readonly omissions: readonly PassengerMarkerOmission[];
}): string {
  const omissions = input.omissions.map(omissionText),
    suffix = omissions.length === 0 ? '' : ` ${omissions.join(' ')}`;
  if (input.phase === 'NONE') {
    const reason =
      input.ride === null
        ? 'Nicio cursă activă pentru taxiul selectat'
        : input.foreign
          ? `Cursa ${input.ride.rideId} aparține altui taxi`
          : `Cursa ${input.ride.rideId} este închisă (${input.ride.state}${
              input.ride.reason === null ? '' : ` · ${input.ride.reason}`
            })`;
    return `${reason}: niciun pasager afișat și niciun marker păstrat.${suffix}`;
  }
  if (input.phase === 'WAITING_PICKUP')
    return `Ridicare la zona ${input.pickups ?? 'necunoscută'}: pasagerul așteaptă, taxiul nu a ajuns încă.${suffix}`;
  if (input.phase === 'BOARDING')
    return `Pasager la ridicare în zona ${input.pickups ?? 'necunoscută'}; nu este încă la bord.${suffix}`;
  if (input.phase === 'ONBOARD')
    return `1 pasager la bord; predare la zona ${input.dropoffs ?? 'necunoscută'}.${suffix}`;
  return `1 pasager la bord; coborâre la zona ${input.dropoffs ?? 'necunoscută'}.${suffix}`;
}

function freezeMarker(marker: PassengerMarker): PassengerMarker {
  return Object.freeze(marker);
}

function freezeOmission(omission: PassengerMarkerOmission): PassengerMarkerOmission {
  return Object.freeze(omission);
}

/**
 * Reads one frame from the real 061 ride and the real 032 anchors. A terminal or absent ride becomes
 * `NONE` with `reset: true`; a ride claimed by another taxi is treated as foreign and is not drawn.
 */
export function readPassengerVisualFrame(
  sources: PassengerVisualSources,
  input: PassengerVisualFrameInput,
): PassengerVisualFrame {
  const { lifecycle, map } = sources,
    ride =
      input.rideId === undefined || input.rideId === null
        ? lifecycle.active().find((entry) => entry.taxiId === input.taxiId)
        : lifecycle.ride(input.rideId),
    foreign = ride !== undefined && ride.taxiId !== input.taxiId,
    drawable = ride === undefined || ride.terminal || foreign ? undefined : ride,
    phase = drawable === undefined ? 'NONE' : phaseFor(drawable.state),
    occupancy = occupancyFor(phase),
    passengerVisible = visibleFor(phase),
    zones = new Map(map.serviceZones.map((zone) => [zone.id, zone])),
    nodes = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM])),
    markers: PassengerMarker[] = [],
    omissions: PassengerMarkerOmission[] = [];
  const place = (rideRecord: RideRecord, role: 'PICKUP' | 'DROPOFF', zoneId: string): boolean => {
    const zone = zones.get(zoneId);
    if (zone === undefined) {
      omissions.push(freezeOmission({ role, zoneId, reason: 'ZONE_MISSING' }));
      return false;
    }
    const anchor = nodes.get(zone.anchorNodeId);
    if (anchor === undefined) {
      omissions.push(freezeOmission({ role, zoneId, reason: 'ANCHOR_MISSING' }));
      return false;
    }
    markers.push(
      freezeMarker({
        markerId: passengerMarkerId(rideRecord.rideId, role),
        role,
        zoneId,
        x: anchor.x,
        z: anchor.z,
        label: role === 'PICKUP' ? 'P' : 'D',
      }),
    );
    return true;
  };
  if (drawable !== undefined) {
    if (phase === 'WAITING_PICKUP' || phase === 'BOARDING')
      if (place(drawable, 'PICKUP', drawable.pickupZoneId) && phase === 'BOARDING') {
        const pickup = markers[0]!;
        markers.push(
          freezeMarker({
            markerId: passengerMarkerId(drawable.rideId, 'PASSENGER'),
            role: 'PASSENGER',
            zoneId: drawable.pickupZoneId,
            x: pickup.x,
            z: pickup.z,
            label: 'S',
          }),
        );
      }
    if (phase === 'ONBOARD' || phase === 'DROPPING_OFF')
      place(drawable, 'DROPOFF', drawable.dropoffZoneId);
  }
  const frame: PassengerVisualFrame = Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: PASSENGER_VISUAL_VERSION,
    sessionId: input.sessionId ?? lifecycle.namespace,
    worldEpoch: input.worldEpoch ?? 0,
    tick: input.tick,
    taxiId: input.taxiId,
    rideId: drawable === undefined ? null : drawable.rideId,
    phase,
    occupancy,
    passengerVisible,
    markers: Object.freeze(markers),
    omissions: Object.freeze(omissions),
    labels: labelsFor(phase, occupancy),
    accessibleText: accessibleText({
      phase,
      ride: ride ?? null,
      foreign,
      pickups: drawable?.pickupZoneId ?? null,
      dropoffs: drawable?.dropoffZoneId ?? null,
      omissions,
    }),
    reset: phase === 'NONE',
  });
  // A frame is only published once it satisfies the same contract the adapter parses.
  return parsePassengerVisualFrame(frame);
}

/**
 * Wires the pure frame reader to a presenter. The bridge has no dispatcher, pickup, dropoff,
 * telemetry or pedestrian port, so presenting a frame cannot advance or complete a ride and cannot
 * emit gameplay evidence.
 */
export function createPassengerRideBridge(
  sources: PassengerRideBridgeSources,
): PassengerRideBridge {
  const { lifecycle, map, presenter } = sources;
  let presentations = 0,
    disposed = false,
    last: PassengerVisualFrame | null = null;
  const assertLive = (): void => {
    if (disposed) throw new Error('Passenger ride bridge disposed');
  };
  return Object.freeze({
    present(input: PassengerVisualFrameInput): PassengerVisualFrame {
      assertLive();
      const frame = readPassengerVisualFrame({ lifecycle, map }, input);
      presenter.update(frame);
      presentations += 1;
      last = frame;
      return frame;
    },
    lastFrame(): PassengerVisualFrame | null {
      return disposed ? null : last;
    },
    stats(): PassengerRideBridgeStats {
      return Object.freeze({
        version: PASSENGER_VISUAL_VERSION,
        presentations: disposed ? 0 : presentations,
        pedestrianActors: 0,
        opportunityEvents: 0,
        telemetryEvents: 0,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      last = null;
      presenter.dispose();
    },
  });
}
