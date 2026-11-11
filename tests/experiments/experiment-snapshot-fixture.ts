import { createMetricService } from '../../src/experiments';
import type {
  ExperimentLedgerFingerprint,
  ExperimentLedgerPort,
  ExperimentSnapshotPorts,
  ExperimentVersions,
  MetricService,
} from '../../src/experiments';
import { createParameterEvidenceLedger } from '../../src/learning';
import type { EvidenceObservation, ParameterEvidenceLedger } from '../../src/learning';
import { createMissionRewardsLedger } from '../../src/missions';
import type { MissionRewardsLedger } from '../../src/missions';
import {
  canonicalizeJson,
  captureWorldSnapshot,
  decodeWorldCheckpoint,
  readWorldSnapshot,
  sha256Hex,
} from '../../src/persistence';
import type {
  CheckpointRecord,
  WorldCaptureInput,
  WorldSnapshotState,
} from '../../src/persistence';
import { completeMission, createRewardsTracker } from '../missions/mission-rewards-fixture';
import {
  WORLD_FIXTURE,
  captureInput,
  createWorldFixture,
  runWorld,
} from '../persistence/world-checkpoint-fixtures';
import type { MutableWorld } from '../persistence/world-checkpoint-fixtures';

/**
 * Deterministic fixture for PBI 140.
 *
 * The world is the real 206 fixture (70 vehicles, 30 passengers, 8 signals, 64 opportunities and a
 * full dispatcher), so the experiment snapshot is taken from the same fixture the checkpoint
 * contract is measured on. The ledgers are the real 093 (learning evidence), 125 (mission rewards)
 * and 137 (KPI read model) implementations, populated through their own public API — never through
 * a test-only back door.
 */

export const EXPERIMENT_FIXTURE = Object.freeze({
  experimentId: 'experiment-140-fixture',
  checkpointId: 'checkpoint-140-01',
  sessionId: 'session-140',
  generation: 1,
  createdAt: '2026-11-11T00:00:00.000Z',
  versions: Object.freeze({
    engineVersion: 'babylon-9.29.0',
    physicsVersion: 'rapier-0.21.0',
    mapVersion: 'city-v1',
  }) as ExperimentVersions,
  continuationTicks: 60,
});

/** The live cell of the fixture: the world the experiment captures, at its documented tick. */
export interface ExperimentWorld {
  readonly world: MutableWorld;
  readonly tick: number;
  readonly input: WorldCaptureInput;
}

export function createExperimentWorld(): ExperimentWorld {
  const world = createWorldFixture();
  runWorld(world, WORLD_FIXTURE.captureTick);
  return Object.freeze({
    world,
    tick: world.tick,
    input: captureInput(world) as WorldCaptureInput,
  });
}

/* ------------------------------------------------------------------ ports */

/**
 * The real 206 functions behind the 140 ports. No rule is re-implemented here: `capture` is
 * `captureWorldSnapshot`, `read` is `readWorldSnapshot`, `decode` is `decodeWorldCheckpoint`.
 */
export function createExperimentSnapshotPorts(): ExperimentSnapshotPorts {
  return Object.freeze({
    capture: (input: unknown) => {
      const result = captureWorldSnapshot(input as WorldCaptureInput);
      if (result.status === 'CAPTURED') {
        return Object.freeze({
          status: 'CAPTURED' as const,
          body: result.body,
          checksum: result.checksum,
          bytes: result.bytes,
        });
      }
      return Object.freeze({
        status: 'REJECTED' as const,
        code: result.rejection.code,
        message: result.rejection.message,
        path: result.rejection.path,
      });
    },
    read: (body: unknown) => {
      const result = readWorldSnapshot(body);
      if (result.status === 'ACCEPTED') {
        return Object.freeze({
          status: 'ACCEPTED' as const,
          body: result.snapshot,
          checksum: result.checksum,
          bytes: result.bytes,
        });
      }
      return Object.freeze({
        status: 'REJECTED' as const,
        code: result.rejection.code,
        message: result.rejection.message,
        path: result.rejection.path,
      });
    },
    decode: (checkpoint: unknown, versions: ExperimentVersions) => {
      const decoded = decodeWorldCheckpoint(checkpoint as CheckpointRecord, { versions });
      if (decoded.status === 'ACCEPTED') {
        return Object.freeze({
          status: 'ACCEPTED' as const,
          tick: decoded.checkpoint.tick,
          state: decoded.state,
          resume: decoded.resume,
        });
      }
      if (decoded.status === 'INCOMPATIBLE') {
        return Object.freeze({
          status: 'INCOMPATIBLE' as const,
          stored: decoded.stored,
          current: decoded.current,
          detail: decoded.detail,
        });
      }
      return Object.freeze({
        status: 'REJECTED' as const,
        code: decoded.rejection.code,
        message: decoded.rejection.message,
        path: decoded.rejection.path,
      });
    },
  });
}

/* ---------------------------------------------------------------- ledgers */

export interface ExperimentLedgers {
  readonly learning: ParameterEvidenceLedger;
  readonly rewards: MissionRewardsLedger;
  readonly kpi: MetricService;
  readonly port: ExperimentLedgerPort;
  /** Recomputes the three digests from the real read models. */
  fingerprint(): ExperimentLedgerFingerprint;
}

function digest(value: unknown): string {
  const canonical = canonicalizeJson(value, { maxDepth: 24 });
  if (canonical.status === 'REJECTED') {
    throw new Error(
      `140 fixture ledger read model is not canonical: ${canonical.rejection.message}`,
    );
  }
  return sha256Hex(canonical.text);
}

/** One real 093 evidence observation, built from the documented 086/087/088 facts. */
function evidenceObservation(id: string, occurrence: number): EvidenceObservation {
  const ticks = 60;
  const window = {
    windowId: `window-${id}`,
    opportunityId: id,
    kind: 'STOP',
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId: 'taxi-01',
    incarnation: 'taxi-01-incarnation',
    segmentId: 'segment-taxi-01',
    controlMode: 'LEARNING',
    learningEligible: true,
    openedTick: 1,
    lastTick: ticks,
    observationCount: 20,
    reaction: { open: false, reason: 'NOT_OBSERVABLE' },
    windowClass: 'ELIGIBLE',
    label: 'FREE_TRAFFIC',
  } as EvidenceObservation['eligibility'];
  return {
    eligibility: window,
    opportunity: {
      id,
      kind: 'STOP',
      state: 'RESOLVED',
      outcome: 'STOPPED',
      result: 'SUCCESS',
      truncationReason: null,
      vehicleId: 'taxi-01',
      incarnation: 'taxi-01-incarnation',
      segmentIds: ['segment-taxi-01'],
      learningEligible: true,
      occurrence,
      openedTick: 1,
      lastTick: ticks,
      resolvedTick: ticks,
      observationCount: 20,
      stimulus: {
        stopLineId: 'stop-line-01',
        signalId: null,
        intersectionId: null,
        movementId: null,
        movementPhaseStartedTick: null,
        fromLaneId: null,
        toLaneId: null,
        relationIds: [],
      },
    },
    artifacts: {
      windowId: window.windowId,
      sessionId: 'session-140',
      worldEpoch: 1,
      segmentId: 'segment-taxi-01',
      vehicleId: 'taxi-01',
      incarnation: 'taxi-01-incarnation',
      controlMode: 'LEARNING',
      learningEligible: true,
      startTick: 1,
      endTick: ticks,
      completeness: 'COMPLETE',
      completenessReason: 'SEGMENT_CLOSED',
      artifacts: [],
      artifactCount: 0,
      boundaryTick: null,
      boundaryCause: null,
      suppressed: null,
      openedTick: 1,
      lastTick: ticks,
      observationCount: 20,
      windowClass: 'PREFIX_ELIGIBLE',
      prefix: { fromTick: 1, toTick: ticks, ticks },
    } as EvidenceObservation['artifacts'],
    roadType: 'urban',
  } as EvidenceObservation;
}

/** A non-empty KPI read model: one completed ride and one measured distance. */
function seedKpi(metrics: MetricService): void {
  metrics.ingest({
    eventId: 'event:ride:140',
    kind: 'RIDE_TERMINAL',
    rideId: 'ride-140',
    taxiId: 'taxi-01',
    state: 'COMPLETED',
    tick: 40,
    pickupSeconds: 12,
    tripSeconds: 30,
    distanceM: 900,
  });
  metrics.ingest({
    eventId: 'event:distance:140',
    kind: 'VEHICLE_DISTANCE',
    vehicleId: 'taxi-01',
    tick: 41,
    distanceM: 900,
  });
}

/** The real 137 read model, with the fleet counts the 137 contract asks for. */
function kpiReadModel(metrics: MetricService): unknown {
  return metrics.snapshot({
    fleet: { counts: () => Object.freeze({ vehicles: 70, taxis: 30, civilians: 40 }) },
    tick: 60,
    simulatedSeconds: 60,
    distanceAvailable: true,
  });
}

/**
 * The KPI ledger rows. `snapshotCalls` is a counter of the read operation itself, not a ledger
 * row, so it is excluded; every aggregate and denominator stays in the digest.
 */
function kpiLedgerRows(metrics: MetricService): unknown {
  const { snapshotCalls: _calls, ...rows } = kpiReadModel(metrics) as Record<string, unknown>;
  return rows;
}

/**
 * Builds the three live ledgers and their read-only port. The fingerprint is the `SHA-256` of the
 * canonical (`SDA-CJSON-1`) form of each real read model, so a change of any row changes it.
 */
export function createExperimentLedgers(): ExperimentLedgers {
  const learning = createParameterEvidenceLedger();
  learning.observe(evidenceObservation('stop-140-1', 1));
  learning.observe(evidenceObservation('stop-140-1', 1));
  learning.observe(evidenceObservation('stop-140-2', 1));

  const tracker = createRewardsTracker();
  const completion = completeMission(tracker, 'campaign-1-first-taxi', 100);
  const rewards = createMissionRewardsLedger({ catalog: tracker.catalog() });
  rewards.settle({ instance: completion });

  const kpi = createMetricService();
  seedKpi(kpi);

  function fingerprint(): ExperimentLedgerFingerprint {
    return Object.freeze({
      learning: digest(learning.readAll()),
      rewards: digest({
        rewards: rewards.rewards(),
        unlocks: rewards.unlocks(),
        stats: rewards.stats(),
      }),
      kpi: digest(kpiLedgerRows(kpi)),
    });
  }

  return Object.freeze({
    learning,
    rewards,
    kpi,
    port: Object.freeze({ fingerprint }),
    fingerprint,
  });
}

/** A rewritten payload with one live fact changed: the stored checksum no longer matches. */
export function corruptSnapshotBody(body: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(body)) as {
    vehicles?: { position?: { x?: number } }[];
  };
  const vehicle = copy.vehicles?.[0];
  if (vehicle?.position === undefined || typeof vehicle.position.x !== 'number') {
    throw new Error('140 fixture has no first vehicle position to corrupt');
  }
  vehicle.position.x += 1;
  return copy;
}

/** The restored state as a mutable world, exactly as a reload would rebuild it. */
export function restoredWorld(state: unknown): MutableWorld {
  return JSON.parse(JSON.stringify(state as WorldSnapshotState)) as MutableWorld;
}
