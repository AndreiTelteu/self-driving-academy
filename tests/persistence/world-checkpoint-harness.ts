import {
  createLocalRepository,
  createMemoryIdbFactory,
  createMemoryLockManager,
} from '../../src/persistence/index';
import type {
  LocalRepository,
  MemoryIdbFactory,
  MemoryLockManager,
  WorldCheckpointVersions,
} from '../../src/persistence/index';
import { FIXED_NOW, fixedClock } from './fixtures';

/**
 * Shared harness for the PBI 206 checkpoint tests and transcript.
 *
 * One `WorldOrigin` models one browser origin: every tab shares the same in-memory IndexedDB
 * factory and the same Web Locks double, so the writer lock is genuinely exclusive. The clocks are
 * injected: `fixedClock` keeps timestamps deterministic and `sequenceClock` scripts monotonic
 * readings, which is how the cost of capture and commit can be asserted to the millisecond.
 */

export const WORLD_DB = '206-world-checkpoint-db';
export const WORLD_SESSION = 'session-206';
export const WORLD_CHECKPOINT = 'checkpoint-206';
export const WORLD_CAPTURED_AT = FIXED_NOW;

export const WORLD_VERSIONS: WorldCheckpointVersions = Object.freeze({
  engineVersion: 'engine-206',
  physicsVersion: 'rapier-0.21.0',
  mapVersion: 'provisional-v1',
});

export interface WorldOrigin {
  readonly factory: MemoryIdbFactory;
  readonly locks: MemoryLockManager;
}

export function createOrigin(): WorldOrigin {
  return Object.freeze({
    factory: createMemoryIdbFactory(),
    locks: createMemoryLockManager(),
  });
}

/** Opens one tab of the origin; the first tab becomes the writer, later tabs read only. */
export async function openTab(origin: WorldOrigin, tabId = 'tab-a'): Promise<LocalRepository> {
  const repository = createLocalRepository({
    factory: origin.factory,
    locks: origin.locks,
    dbName: WORLD_DB,
    tabId,
    now: fixedClock(),
  });
  const report = await repository.open();
  if (report.status !== 'READY') {
    throw new Error(`The repository did not open: ${report.status}`);
  }
  return repository;
}

/**
 * Returns the given monotonic readings in order and then repeats the last one. The writer calls the
 * clock in fixed groups (capture start/end, encode start/end, commit start/end), so a script is a
 * readable statement of the exact cost attribution under test.
 */
export function sequenceClock(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)] ?? 0;
    index += 1;
    return value;
  };
}
