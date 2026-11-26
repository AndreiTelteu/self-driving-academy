import { ingestBlockedInterval } from '../../src/app';
import { createMetricService } from '../../src/experiments';
import type { FleetHealthHistoryEntry, RideRecord } from '../../src/fleet';
import { createArtifactFilter } from '../../src/telemetry';
import type { FilteredWindowRecord } from '../../src/telemetry';
import { CollisionRegistry, createCollisionEpisodes } from '../../src/vehicles';
import type { CollisionIncident } from '../../src/vehicles';

/**
 * 266 evidence helpers: the real 028/088/137 owners produce the facts the live economy consumes.
 * Nothing here fabricates a fact; the scenario only chooses when the real owner observes it.
 */
export const LIVE_ECONOMY_TELEMETRY_CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'session-266-economy-telemetry',
  worldEpoch: 1,
});

/** One real 028 incident from a real collision episode with one real contact. */
export function realCollisionFact(input: {
  readonly vehicleId: string;
  readonly otherEntityId: string;
  readonly tick: number;
  readonly impulseNs: number;
}): CollisionIncident {
  const registry = new CollisionRegistry(),
    vehicle = registry.register(input.vehicleId, 'VEHICLE', 1),
    other = registry.register(input.otherEntityId, 'OBSTACLE', 2),
    episodes = createCollisionEpisodes(LIVE_ECONOMY_TELEMETRY_CONTEXT, registry);
  try {
    episodes.update(input.tick, [{ first: vehicle, second: other, impulseNs: input.impulseNs }]);
    let incident: CollisionIncident | null = null;
    const drained = episodes.drain((fact) => {
      incident = fact;
    });
    if (drained.accepted !== 1 || incident === null)
      throw new Error('The real 028 episode did not produce the expected incident');
    return incident;
  } finally {
    episodes.dispose();
    registry.dispose();
  }
}

/**
 * One real 088 window for the passenger span of a ride, with the real 028 incident attached. The
 * suppressed span is exactly the artifact filter's decision, never a hand-written range.
 */
export function realArtifactWindow(
  ride: RideRecord,
  collision: Pick<CollisionIncident, 'tick' | 'incidentId' | 'impulseNs' | 'otherEntityId'>,
): FilteredWindowRecord {
  const boarding = ride.transitions.find((transition) => transition.event === 'PICKUP_COMPLETE');
  if (boarding === undefined) throw new Error('The ride never boarded a passenger');
  const filter = createArtifactFilter();
  try {
    return filter.evaluate({
      tick: ride.updatedTick,
      sessionId: LIVE_ECONOMY_TELEMETRY_CONTEXT.sessionId,
      worldEpoch: LIVE_ECONOMY_TELEMETRY_CONTEXT.worldEpoch,
      segmentId: `266-ride:${ride.rideId}`,
      vehicleId: ride.taxiId,
      incarnation: `${ride.taxiId}:0`,
      controlMode: 'AUTO',
      learningEligible: false,
      startTick: boarding.tick,
      endTick: ride.updatedTick,
      segmentCompleteness: 'CLOSED',
      closeReason: 'RIDE_COMPLETED',
      lostCheckpointTick: null,
      observationLoss: null,
      collisions: [
        {
          tick: collision.tick,
          incidentId: collision.incidentId,
          impulseNs: collision.impulseNs,
          otherEntityId: collision.otherEntityId,
        },
      ],
      recoveries: [],
      suspensions: [],
    });
  } finally {
    filter.dispose();
  }
}

/**
 * Measures one real 137 blocked interval through the real metric service and returns the accepted
 * seconds it reports. The service owns the fact; the caller only reads the measured value.
 */
export function measureBlockedSeconds(input: {
  readonly taxiId: string;
  readonly tick: number;
  readonly blockedSeconds: number;
}): number {
  const metrics = createMetricService({ retainedKeys: 32 });
  try {
    const entry: FleetHealthHistoryEntry = {
      taxiId: input.taxiId,
      fact: 'TRAFFIC_BLOCK',
      from: 'AVAILABLE',
      to: 'BLOCKED',
      tick: input.tick,
      factId: `266-blocked:${input.taxiId}:${input.tick}`,
      releasedRideId: null,
    };
    const ingested = ingestBlockedInterval(metrics, {
      entry,
      blockedSeconds: input.blockedSeconds,
    });
    if (ingested?.status !== 'ACCEPTED')
      throw new Error('The real 137 service did not accept the blocked interval');
    const snapshot = metrics.snapshot({
      fleet: { counts: () => ({ vehicles: 44, taxis: 24, civilians: 20 }) },
      tick: input.tick + 1,
      simulatedSeconds: 60,
      distanceAvailable: false,
    });
    const metric = snapshot.metrics.find((value) => value.id === 'blockedSeconds');
    if (metric?.value === null || metric?.value === undefined)
      throw new Error('The real 137 snapshot did not report blocked seconds');
    return metric.value;
  } finally {
    metrics.dispose();
  }
}
