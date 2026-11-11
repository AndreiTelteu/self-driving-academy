import {
  createWorldRecorder,
  readReplaySample,
  readWorldReplayChunk,
} from '../../src/replay/index';
import type {
  ReplayTickFrame,
  WorldRecorder,
  WorldRecorderOptions,
  WorldReplayChunk,
} from '../../src/replay/index';
import { createExperimentLedgers } from './experiment-snapshot-fixture';
import { canonicalizeJson, sha256Hex } from '../../src/persistence';
import { computeProfileVersionChecksum } from '../../src/profiles';
import type { ProfileVersionContent } from '../../src/profiles';
import { createFleetKpi } from '../../src/economy';
import type { FleetKpi, RideReview, RideSettlement } from '../../src/economy';
import { createMissionRewardsLedger, createPlayerProgress } from '../../src/missions';
import type { MissionRewardsLedger, PlayerProgress } from '../../src/missions';
import {
  CIVILIAN_COUNT,
  FLEET,
  TAXI_COUNT,
  replayFrame,
  snapshotAt,
} from '../replay/world-recorder-fixtures';
import type { SimulationEvent } from '../../src/simulation';
import { completeMission, createRewardsTracker } from '../missions/mission-rewards-fixture';
import type { ExperimentLedgerFingerprint, ExperimentLedgerPort } from '../../src/experiments';
import type {
  ExperimentReplayChunkView,
  ExperimentReplayIsolationPort,
  ExperimentReplayProfileIdentity,
  ExperimentReplaySample,
  ExperimentReplaySourcePort,
} from '../../src/experiments';

/**
 * Deterministic fixture for PBI 141.
 *
 * The source is a real sealed 207 chunk: the 40-vehicle replay fixture of PBI 207 is driven through
 * `createWorldRecorder` for every tick, a COLLISION between two AUTO vehicles that are outside the
 * player camera pins the incident window, a civilian is created before it and another one is
 * removed inside it, and the chunk is sealed and re-read through the real `readWorldReplayChunk`.
 * Nothing is hand-written: the ticks, the quantized rows, the lifecycle facts and the checksum are
 * the recorder's own output.
 *
 * The immutable surface is the existing one: the 140 ledgers (093 learning evidence, 125 mission
 * rewards, 137 KPI read model) plus the real 209 fleet KPI (revenue and ratings) and the real 122
 * player XP, and the profile contract's own `computeProfileVersionChecksum`. The digests reuse the
 * 140 recipe (`SDA-CJSON-1` + `SHA-256`), so 141 introduces no second fingerprint format.
 */

export const REPLAY_FIXTURE = Object.freeze({
  sessionId: 'session-141',
  worldEpoch: 1,
  experimentId: 'experiment-141-fixture',
  versions: Object.freeze({
    engineVersion: 'babylon-9.29.0',
    physicsVersion: 'rapier-0.21.0',
    mapVersion: 'map-141-1',
  }),
  tickHz: 60,
  sampleHz: 20,
  pinBeforeSeconds: 1,
  pinAfterSeconds: 2,
  incidentTick: 400,
  capturedFromTick: 0,
  capturedToTick: 520,
  sealedAtTick: 520,
  partialSealTick: 430,
  createdTick: 380,
  removedTick: 406,
  createdAt: '2026-11-11T00:00:00.000Z',
});

/** `civil-01`: created inside the pinned window. */
export const CREATED_INDEX = TAXI_COUNT;
export const CREATED_ENTITY = FLEET[CREATED_INDEX]?.entityId ?? 'civil-01';
/** `civil-03`: removed inside the pinned window. */
export const REMOVED_INDEX = TAXI_COUNT + 2;
export const REMOVED_ENTITY = FLEET[REMOVED_INDEX]?.entityId ?? 'civil-03';
/** Two AUTO vehicles that the camera never sees: the incident the criterion asks for. */
export const INCIDENT_A = 1;
export const INCIDENT_B = 2;

export const REPLAY_FLEET_SIZE = TAXI_COUNT + CIVILIAN_COUNT;

/** A real 007 COLLISION fact of this session between two fixture vehicles. */
function collision(tick: number, entityIndex: number, otherIndex: number): SimulationEvent {
  const a = FLEET[entityIndex]?.entityId;
  const b = FLEET[otherIndex]?.entityId;
  if (a === undefined || b === undefined) throw new Error('141 fixture has no such vehicle');
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    sessionId: REPLAY_FIXTURE.sessionId,
    worldEpoch: REPLAY_FIXTURE.worldEpoch,
    eventId: `event-collision-141-${tick}`,
    tick,
    entityIds: Object.freeze([a, b]),
    type: 'COLLISION',
    payload: Object.freeze({ vehicleId: a, otherEntityId: b, impulseNs: 1_250 }),
  }) as SimulationEvent;
}

/** One authoritative tick with the two lifecycle facts of this fixture. */
export function replayFixtureFrame(tick: number): ReplayTickFrame {
  const omit: string[] = [];
  if (tick < REPLAY_FIXTURE.createdTick) omit.push(CREATED_ENTITY);
  if (tick > REPLAY_FIXTURE.removedTick) omit.push(REMOVED_ENTITY);
  return replayFrame(tick, {
    omit,
    created: tick === REPLAY_FIXTURE.createdTick ? [CREATED_INDEX] : [],
    removed: tick === REPLAY_FIXTURE.removedTick ? [REMOVED_INDEX] : [],
  });
}

function recorder(): WorldRecorder {
  const options: WorldRecorderOptions = {
    sessionId: REPLAY_FIXTURE.sessionId,
    worldEpoch: REPLAY_FIXTURE.worldEpoch,
    versions: REPLAY_FIXTURE.versions,
    tickHz: REPLAY_FIXTURE.tickHz,
    sampleHz: REPLAY_FIXTURE.sampleHz,
    pinBeforeSeconds: REPLAY_FIXTURE.pinBeforeSeconds,
    pinAfterSeconds: REPLAY_FIXTURE.pinAfterSeconds,
    now: () => REPLAY_FIXTURE.createdAt,
  };
  return createWorldRecorder(options);
}

function seal(
  recorder204: WorldRecorder,
  lastTick: number,
  sealTick?: number,
  skipFrom = -1,
  skipTo = -1,
): WorldReplayChunk {
  recorder204.recordCheckpoint({
    checkpointId: 'checkpoint-141-0',
    snapshot: snapshotAt(REPLAY_FIXTURE.capturedFromTick),
  });
  for (let tick = REPLAY_FIXTURE.capturedFromTick; tick <= lastTick; tick += 1) {
    if (tick >= skipFrom && tick <= skipTo) continue;
    recorder204.recordTick(replayFixtureFrame(tick));
  }
  const fact = collision(REPLAY_FIXTURE.incidentTick, INCIDENT_A, INCIDENT_B);
  const result = recorder204.recordEvent(fact);
  if (result.incident !== 'PINNED') {
    throw new Error(`141 fixture incident was not pinned: ${String(result.detail)}`);
  }
  const sealed = recorder204.sealIncident(result.incidentId ?? '', sealTick);
  if (sealed.status === 'REJECTED') {
    throw new Error(`141 fixture chunk was refused: ${sealed.rejection.code}`);
  }
  return readBack(sealed.chunk);
}

/** Re-reads the sealed chunk with the real 207 reader, so the fixture never hands out raw data. */
function readBack(chunk: WorldReplayChunk): WorldReplayChunk {
  const read = readWorldReplayChunk(chunk);
  if (read.status === 'REJECTED') {
    throw new Error(`141 fixture chunk does not re-read: ${read.rejection.code}`);
  }
  return read.chunk;
}

export interface ReplaySourceFixture {
  readonly chunk: WorldReplayChunk;
  readonly partial: WorldReplayChunk;
  readonly gap: WorldReplayChunk;
  readonly incidentId: string;
  readonly incidentEventId: string;
}

/** The span the gap capture never recorded; it is a real capture loss, not a written gap. */
export const REPLAY_GAP = Object.freeze({ fromTick: 441, toTick: 470 });

/**
 * Three real captures of the same incident: a complete window, a window sealed before the
 * post-incident part closed, and one with a recorded gap in the middle. All three are recorder
 * output; the last two exist to prove that a partial clip and a lost span are *declared*.
 */
export function createReplaySource(): ReplaySourceFixture {
  const chunk = seal(recorder(), REPLAY_FIXTURE.capturedToTick);
  const partial = seal(recorder(), REPLAY_FIXTURE.partialSealTick, REPLAY_FIXTURE.partialSealTick);
  const gap = seal(
    recorder(),
    REPLAY_FIXTURE.capturedToTick,
    undefined,
    REPLAY_GAP.fromTick,
    REPLAY_GAP.toTick,
  );
  return Object.freeze({
    chunk,
    partial,
    gap,
    incidentId: chunk.incident.incidentId,
    incidentEventId: chunk.incident.eventId,
  });
}

/** The real 207 functions behind the 141 source port; no chunk rule is re-implemented here. */
export function createReplaySourcePort(): ExperimentReplaySourcePort {
  return Object.freeze({
    readChunk: (value: unknown) => {
      const read = readWorldReplayChunk(value);
      if (read.status === 'ACCEPTED') {
        return Object.freeze({
          status: 'ACCEPTED' as const,
          chunk: read.chunk as unknown as ExperimentReplayChunkView,
          checksum: read.checksum,
          bytes: read.bytes,
        });
      }
      return Object.freeze({
        status: 'REJECTED' as const,
        code: read.rejection.code,
        message: read.rejection.message,
        path: read.rejection.path,
      });
    },
    readSample: (chunk: ExperimentReplayChunkView, tick: number): ExperimentReplaySample | null =>
      readReplaySample(chunk as unknown as WorldReplayChunk, tick),
  });
}

/* ----------------------------------------------------------------- ledgers */

function digest(value: unknown): string {
  const canonical = canonicalizeJson(value, { maxDepth: 24 });
  if (canonical.status === 'REJECTED') {
    throw new Error(`141 fixture read model is not canonical: ${canonical.rejection.message}`);
  }
  return sha256Hex(canonical.text);
}

const PROFILE_BASE: ProfileVersionContent = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  profileId: 'profile-141',
  versionId: 'profile-141@1',
  parentVersionId: null,
  engineVersion: 'babylon-9.29.0',
  parameters: Object.freeze({ speed: 12, laneChange: 0.5 }),
  provenance: Object.freeze({
    origin: 'BASE' as const,
    sourceSegmentIds: Object.freeze([]),
    sourceInterventionIds: Object.freeze([]),
    delta: null,
  }),
  sourceSegmentIds: Object.freeze([]),
  depth: 0,
  createdAt: REPLAY_FIXTURE.createdAt,
});

/** One real 209 settlement: a completed ride the fleet KPI turns into revenue. */
function settlement(rideId: string, tick: number): RideSettlement {
  return Object.freeze({
    settlementId: `settlement:${rideId}`,
    rideId,
    requestId: `request:${rideId}`,
    taxiId: 'taxi-02',
    terminalState: 'COMPLETED' as const,
    passengerAboard: true,
    tick,
    currency: 'SDA',
    pricingVersion: '209-tariff-v1',
    policyVersion: '209-cancellation-v1',
    rule: 'COMPLETED_FARE',
    quotedMinorUnits: 640,
    chargedMinorUnits: 640,
    refundedMinorUnits: 0,
    netMinorUnits: 640,
    chargeEntryId: `charge:${rideId}`,
    refundEntryId: null,
  });
}

/** One real 209 review: the rating the KPI aggregates. */
function review(rideId: string, rating: number, tick: number): RideReview {
  return Object.freeze({
    reviewId: `review:${rideId}`,
    rideId,
    customerId: `customer:${rideId}`,
    rating,
    reasonCodes: Object.freeze([]),
    tick,
    reviewModelVersion: '209-review-v1',
    exposureSeconds: 12,
    controlIntervals: 12,
    profileVersions: Object.freeze([]),
    preferenceAdjustment: 0,
    penalties: Object.freeze({ delay: 0, comfort: 0, incident: 0, failure: 0 }),
    evidence: Object.freeze({
      terminalState: 'COMPLETED' as const,
      passengerAboard: true,
      delaySeconds: 0,
      referenceTripDurationSeconds: 96,
      actualTripDurationSeconds: 96,
      comfortModelVersion: null,
      comfortPenalty: 0,
      impacts: 0,
      peakImpulseNs: 0,
      blockedSeconds: 0,
    }),
    supersedesReviewId: null,
    revision: 0,
  });
}

export interface ReplayIsolationHarness {
  readonly port: ExperimentReplayIsolationPort;
  readonly ledgerPort: ExperimentLedgerPort;
  readonly fleetKpi: FleetKpi;
  readonly rewards: MissionRewardsLedger;
  readonly progress: PlayerProgress;
  fingerprint(): ExperimentLedgerFingerprint;
  identity(): ExperimentReplayProfileIdentity;
  /** Control probe: a real write on the live KPI ledger, used to prove the detector reacts. */
  writeRevenue(rideId: string, tick: number): void;
  /** Control probe: a different live profile version, with its own canonical checksum. */
  activateProfile(versionId: string, parameters: Readonly<Record<string, number>>): void;
}

/**
 * The live read models and the read-only ports over them. The digest is the 140 recipe over each
 * real read model, so a single changed row changes exactly one fingerprint.
 */
export function createReplayIsolation(): ReplayIsolationHarness {
  const ledgers = createExperimentLedgers();
  const progress = createPlayerProgress({ playerId: 'player-141' });
  const fleetKpi = createFleetKpi();
  fleetKpi.applySettlement(settlement('ride-141-1', 320));
  fleetKpi.applyReview(review('ride-141-1', 5, 320));

  /* Real 125 mission rewards: the mission, its granted rewards and the XP they credit. */
  const tracker = createRewardsTracker();
  const instance = completeMission(tracker, 'campaign-1-first-taxi', 100);
  const rewards = createMissionRewardsLedger({ catalog: tracker.catalog() });
  const settled = rewards.settle({ instance });
  if (settled.rewardsGranted === 0) throw new Error('141 fixture needs one granted mission reward');
  progress.creditMission({ settlement: settled, observedAtMs: 0 });

  let profile: ProfileVersionContent = PROFILE_BASE;

  function fingerprint(): ExperimentLedgerFingerprint {
    const metric = ledgers.kpi.snapshot({
      fleet: {
        counts: () =>
          Object.freeze({
            vehicles: REPLAY_FLEET_SIZE,
            taxis: TAXI_COUNT,
            civilians: CIVILIAN_COUNT,
          }),
      },
      tick: REPLAY_FIXTURE.capturedToTick,
      simulatedSeconds: REPLAY_FIXTURE.capturedToTick / REPLAY_FIXTURE.tickHz,
      distanceAvailable: true,
    }) as unknown as Record<string, unknown>;
    /* `snapshotCalls` counts the read operation itself, so it is not a ledger row. */
    const { snapshotCalls: _calls, ...metricRows } = metric;
    return Object.freeze({
      learning: digest(ledgers.learning.readAll()),
      rewards: digest({
        rewards: rewards.rewards(),
        unlocks: rewards.unlocks(),
        stats: rewards.stats(),
        xp: progress.read(),
      }),
      kpi: digest({
        metrics: metricRows,
        economy: fleetKpi.snapshot(REPLAY_FIXTURE.capturedToTick),
      }),
    });
  }

  function identity(): ExperimentReplayProfileIdentity {
    return Object.freeze({
      profileId: profile.profileId,
      versionId: profile.versionId,
      checksum: computeProfileVersionChecksum(profile),
    });
  }

  const ledgerPort: ExperimentLedgerPort = Object.freeze({ fingerprint });

  return Object.freeze({
    port: Object.freeze({ ledger: ledgerPort, profile: Object.freeze({ identity }) }),
    ledgerPort,
    fleetKpi,
    rewards,
    progress,
    fingerprint,
    identity,
    writeRevenue(rideId: string, tick: number): void {
      fleetKpi.applySettlement(settlement(rideId, tick));
    },
    activateProfile(versionId: string, parameters: Readonly<Record<string, number>>): void {
      profile = Object.freeze({
        ...PROFILE_BASE,
        versionId,
        parameters: Object.freeze({ ...parameters }),
      });
    },
  });
}
