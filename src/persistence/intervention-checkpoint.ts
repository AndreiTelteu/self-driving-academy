import { PersistenceError } from './contracts';
import type { CheckpointRecord, CheckpointRecordInput } from './contracts';
import type { LocalRepository } from './repository';
import type { WriteResult } from './contracts';

/**
 * Checkpoint identity for an active intervention (PBI 129).
 *
 * Docs/15 keeps the complete world snapshot for PBI 206. This module therefore stores only what
 * an intervention needs to be identified and ordered: who was driving, which segment it belongs
 * to, which generation of the world it belongs to and the learning epoch it was recorded in. No
 * world state is invented here: the body carries identity and generation, nothing else.
 */

export const INTERVENTION_CHECKPOINT_VERSION = '129-intervention-checkpoint-v1' as const;

export interface InterventionCheckpointInput {
  readonly checkpointId: string;
  readonly sessionId: string;
  readonly profileId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  /** Coherent generation; an older generation never replaces a newer one. */
  readonly generation: number;
  readonly learningEpoch: number;
  readonly engineVersion: string;
  readonly physicsVersion: string;
  readonly mapVersion: string;
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly controlMode: 'MANUAL' | 'LEARNING' | 'AUTO';
  readonly startTick: number;
  readonly createdAt?: string;
}

export interface InterventionCheckpoint {
  readonly version: typeof INTERVENTION_CHECKPOINT_VERSION;
  readonly record: CheckpointRecord;
}

/**
 * Builds the checkpoint envelope. The body holds identity and generation only; the world snapshot
 * stays with PBI 206 and is never faked here.
 */
export function createInterventionCheckpoint(
  input: InterventionCheckpointInput,
): InterventionCheckpoint {
  if (input.generation < 0 || !Number.isSafeInteger(input.generation)) {
    throw new PersistenceError(
      'INVALID_RECORD',
      'The checkpoint generation must be a nonnegative integer',
      'checkpoint.generation',
    );
  }
  const body = {
    scope: 'INTERVENTION_IDENTITY',
    segmentId: input.segmentId,
    vehicleId: input.vehicleId,
    controlMode: input.controlMode,
    startTick: input.startTick,
    generation: input.generation,
    learningEpoch: input.learningEpoch,
  };
  const record: CheckpointRecordInput = {
    schemaVersion: 1,
    checkpointId: input.checkpointId,
    sessionId: input.sessionId,
    profileId: input.profileId,
    worldEpoch: input.worldEpoch,
    tick: input.tick,
    generation: input.generation,
    learningEpoch: input.learningEpoch,
    engineVersion: input.engineVersion,
    physicsVersion: input.physicsVersion,
    mapVersion: input.mapVersion,
    createdAt: input.createdAt ?? new Date().toISOString(),
    body,
  };
  return Object.freeze({
    version: INTERVENTION_CHECKPOINT_VERSION,
    record: record as CheckpointRecord,
  });
}

/** Writes the checkpoint; the repository refuses an older generation with `STALE_REVISION`. */
export async function writeInterventionCheckpoint(
  repository: LocalRepository,
  input: InterventionCheckpointInput,
): Promise<WriteResult<CheckpointRecord>> {
  try {
    const checkpoint = createInterventionCheckpoint(input);
    return await repository.putCheckpoint(checkpoint.record);
  } catch (error) {
    if (error instanceof PersistenceError) {
      return Object.freeze({
        status: 'REJECTED' as const,
        value: null,
        rejection: Object.freeze({
          code: error.code,
          message: error.message,
          path: error.path,
        }),
      });
    }
    throw error;
  }
}
