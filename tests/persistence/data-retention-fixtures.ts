import type { RetentionArtifact } from '../../src/persistence/index';

/**
 * Declared inventory fixture for PBI 132.
 *
 * The sizes below are the declared ownership bytes of each row; they are **not** a measurement of a
 * live recording session and they are **not** budgets. Every quota the retention engine enforces
 * comes from `Docs/performance-budgets.json` or from the delivered 069 contract, never from this
 * file (see the `budgets` block of the report).
 *
 * The shape mirrors the real producers:
 *
 * - `REPLAY_CHUNK` rows are the sealed 207 chunks; one chunk is exactly the 207 `chunkByteCap` so
 *   the fixture is at the real upper bound of a single clip row;
 * - `CHECKPOINT` rows are the 206/222 checkpoint rows; the newest one is the active checkpoint;
 * - `INTERVENTION_SEGMENT` rows are the closed 129 segments (069 bytes) and `TELEMETRY_CHUNK` rows
 *   are the sealed 090 chunks of one intervention;
 * - the protected rows are the four classes the contract must never delete: profile, progress,
 *   active checkpoint and the ledgers needed for deduplication.
 */

/** `WORLD_RECORDER_DEFAULTS.chunkByteCap` of PBI 207. */
export const FIXTURE_REPLAY_CHUNK_BYTES = 4 * 1024 * 1024;
export const FIXTURE_CHECKPOINT_BYTES = 64 * 1024;
export const FIXTURE_SEGMENT_RAM_BYTES = 1_536_000;
export const FIXTURE_SEGMENT_DB_BYTES = 2_621_440;
export const FIXTURE_TELEMETRY_CHUNK_RAM_BYTES = 2_097_152;
export const FIXTURE_TELEMETRY_CHUNK_DB_BYTES = 1_572_864;

export const FIXTURE_CLIP_A = 'clip:incident-a';
export const FIXTURE_CLIP_B = 'clip:incident-b';
export const FIXTURE_ACTIVE_CHECKPOINT = 'checkpoint:active';
export const FIXTURE_PROGRESS = 'progress:session';
export const FIXTURE_PROFILE = 'profile:active';
export const FIXTURE_REPLAY_DEDUP_LEDGER = 'ledger:replay-events';
export const FIXTURE_INTERVENTION_DEDUP_LEDGER = 'ledger:intervention-admission';

export const FIXTURE_PROTECTED_IDS: readonly string[] = Object.freeze([
  FIXTURE_PROFILE,
  FIXTURE_PROGRESS,
  FIXTURE_ACTIVE_CHECKPOINT,
  FIXTURE_REPLAY_DEDUP_LEDGER,
  FIXTURE_INTERVENTION_DEDUP_LEDGER,
]);

function artifact(row: RetentionArtifact): RetentionArtifact {
  return row;
}

/** The world recorder domain: two clips, a superseded and an active checkpoint, protected rows. */
export function worldRecorderInventory(): readonly RetentionArtifact[] {
  return Object.freeze([
    ...Array.from({ length: 5 }, (_, index) =>
      artifact({
        artifactId: `${FIXTURE_CLIP_A}:${index}`,
        domain: 'WORLD_RECORDER',
        kind: 'REPLAY_CHUNK',
        sequence: 100 + index,
        ramBytes: FIXTURE_REPLAY_CHUNK_BYTES,
        dbBytes: FIXTURE_REPLAY_CHUNK_BYTES,
        clipId: FIXTURE_CLIP_A,
        clipSequence: index,
        protection: null,
        status: 'COMPLETE',
      }),
    ),
    ...Array.from({ length: 3 }, (_, index) =>
      artifact({
        artifactId: `${FIXTURE_CLIP_B}:${index}`,
        domain: 'WORLD_RECORDER',
        kind: 'REPLAY_CHUNK',
        sequence: 105 + index,
        ramBytes: FIXTURE_REPLAY_CHUNK_BYTES,
        dbBytes: FIXTURE_REPLAY_CHUNK_BYTES,
        clipId: FIXTURE_CLIP_B,
        clipSequence: index,
        protection: null,
        status: 'COMPLETE',
      }),
    ),
    artifact({
      artifactId: 'checkpoint:superseded-1',
      domain: 'WORLD_RECORDER',
      kind: 'CHECKPOINT',
      sequence: 10,
      ramBytes: FIXTURE_CHECKPOINT_BYTES,
      dbBytes: FIXTURE_CHECKPOINT_BYTES,
      clipId: null,
      clipSequence: null,
      protection: null,
      status: 'COMPLETE',
    }),
    artifact({
      artifactId: 'checkpoint:superseded-2',
      domain: 'WORLD_RECORDER',
      kind: 'CHECKPOINT',
      sequence: 20,
      ramBytes: FIXTURE_CHECKPOINT_BYTES,
      dbBytes: FIXTURE_CHECKPOINT_BYTES,
      clipId: null,
      clipSequence: null,
      protection: null,
      status: 'COMPLETE',
    }),
    artifact({
      artifactId: FIXTURE_ACTIVE_CHECKPOINT,
      domain: 'WORLD_RECORDER',
      kind: 'CHECKPOINT',
      sequence: 30,
      ramBytes: FIXTURE_CHECKPOINT_BYTES,
      dbBytes: FIXTURE_CHECKPOINT_BYTES,
      clipId: null,
      clipSequence: null,
      protection: {
        className: 'ACTIVE_CHECKPOINT',
        reason: 'The newest 206/222 checkpoint is the recovery base of the session',
      },
      status: 'COMPLETE',
    }),
    artifact({
      artifactId: FIXTURE_PROGRESS,
      domain: 'WORLD_RECORDER',
      kind: 'PROTECTED_ROW',
      sequence: 31,
      ramBytes: 16 * 1024,
      dbBytes: 32 * 1024,
      clipId: null,
      clipSequence: null,
      protection: {
        className: 'PROGRESS',
        reason: 'The 130 progress row is written with the generation, not evicted with replay',
      },
      status: 'COMPLETE',
    }),
    artifact({
      artifactId: FIXTURE_REPLAY_DEDUP_LEDGER,
      domain: 'WORLD_RECORDER',
      kind: 'PROTECTED_ROW',
      sequence: 32,
      ramBytes: 4 * 1024,
      dbBytes: 8 * 1024,
      clipId: null,
      clipSequence: null,
      protection: {
        className: 'DEDUP_LEDGER',
        reason: 'Accepted commercial/reward facts deduplicate the next commit',
      },
      status: 'COMPLETE',
    }),
  ]);
}

/** The intervention telemetry domain: closed 129 segments, sealed 090 chunks, protected rows. */
export function interventionTelemetryInventory(): readonly RetentionArtifact[] {
  return Object.freeze([
    ...Array.from({ length: 6 }, (_, index) =>
      artifact({
        artifactId: `intervention-segment:${index}`,
        domain: 'INTERVENTION_TELEMETRY',
        kind: 'INTERVENTION_SEGMENT',
        sequence: 200 + index,
        ramBytes: FIXTURE_SEGMENT_RAM_BYTES,
        dbBytes: FIXTURE_SEGMENT_DB_BYTES,
        clipId: `intervention:${index}`,
        clipSequence: 0,
        protection: null,
        status: 'COMPLETE',
      }),
    ),
    ...Array.from({ length: 4 }, (_, index) =>
      artifact({
        artifactId: `telemetry-chunk:ride-${index}`,
        domain: 'INTERVENTION_TELEMETRY',
        kind: 'TELEMETRY_CHUNK',
        sequence: 300 + index,
        ramBytes: FIXTURE_TELEMETRY_CHUNK_RAM_BYTES,
        dbBytes: FIXTURE_TELEMETRY_CHUNK_DB_BYTES,
        clipId: 'intervention:ride',
        clipSequence: index,
        protection: null,
        status: 'COMPLETE',
      }),
    ),
    artifact({
      artifactId: FIXTURE_PROFILE,
      domain: 'INTERVENTION_TELEMETRY',
      kind: 'PROTECTED_ROW',
      sequence: 1,
      ramBytes: 24 * 1024,
      dbBytes: 32 * 1024,
      clipId: null,
      clipSequence: null,
      protection: {
        className: 'PROFILE',
        reason: 'The active 109 profile version is the base every intervention names',
      },
      status: 'COMPLETE',
    }),
    artifact({
      artifactId: FIXTURE_INTERVENTION_DEDUP_LEDGER,
      domain: 'INTERVENTION_TELEMETRY',
      kind: 'PROTECTED_ROW',
      sequence: 2,
      ramBytes: 4 * 1024,
      dbBytes: 8 * 1024,
      clipId: null,
      clipSequence: null,
      protection: {
        className: 'DEDUP_LEDGER',
        reason: 'Admitted intervention causes deduplicate a repeated close',
      },
      status: 'COMPLETE',
    }),
  ]);
}

/** Both domains in one inventory: the retention never mixes them, the quota is per domain. */
export function combinedInventory(): readonly RetentionArtifact[] {
  return Object.freeze([...worldRecorderInventory(), ...interventionTelemetryInventory()]);
}

/** Only protected rows, already over both quotas: nothing may be evicted. */
export function protectedOnlyInventory(): readonly RetentionArtifact[] {
  return Object.freeze([
    artifact({
      artifactId: FIXTURE_PROFILE,
      domain: 'INTERVENTION_TELEMETRY',
      kind: 'PROTECTED_ROW',
      sequence: 1,
      ramBytes: 24 * 1024 * 1024,
      dbBytes: 12 * 1024 * 1024,
      clipId: null,
      clipSequence: null,
      protection: {
        className: 'PROFILE',
        reason: 'The active 109 profile version is never evicted',
      },
      status: 'COMPLETE',
    }),
    artifact({
      artifactId: FIXTURE_INTERVENTION_DEDUP_LEDGER,
      domain: 'INTERVENTION_TELEMETRY',
      kind: 'PROTECTED_ROW',
      sequence: 2,
      ramBytes: 20 * 1024 * 1024,
      dbBytes: 8 * 1024 * 1024,
      clipId: null,
      clipSequence: null,
      protection: {
        className: 'DEDUP_LEDGER',
        reason: 'Accepted intervention causes deduplicate a repeated close',
      },
      status: 'COMPLETE',
    }),
    artifact({
      artifactId: FIXTURE_ACTIVE_CHECKPOINT,
      domain: 'WORLD_RECORDER',
      kind: 'CHECKPOINT',
      sequence: 30,
      ramBytes: 16 * 1024 * 1024,
      dbBytes: 8 * 1024 * 1024,
      clipId: null,
      clipSequence: null,
      protection: {
        className: 'ACTIVE_CHECKPOINT',
        reason: 'The active checkpoint is the recovery base of the session',
      },
      status: 'COMPLETE',
    }),
    artifact({
      artifactId: FIXTURE_PROGRESS,
      domain: 'WORLD_RECORDER',
      kind: 'PROTECTED_ROW',
      sequence: 31,
      ramBytes: 20 * 1024 * 1024,
      dbBytes: 6 * 1024 * 1024,
      clipId: null,
      clipSequence: null,
      protection: {
        className: 'PROGRESS',
        reason: 'The 130 progress row is not replay data',
      },
      status: 'COMPLETE',
    }),
    artifact({
      artifactId: FIXTURE_REPLAY_DEDUP_LEDGER,
      domain: 'WORLD_RECORDER',
      kind: 'PROTECTED_ROW',
      sequence: 32,
      ramBytes: 2 * 1024 * 1024,
      dbBytes: 2 * 1024 * 1024,
      clipId: null,
      clipSequence: null,
      protection: {
        className: 'DEDUP_LEDGER',
        reason: 'Accepted commercial/reward facts deduplicate the next commit',
      },
      status: 'COMPLETE',
    }),
  ]);
}
