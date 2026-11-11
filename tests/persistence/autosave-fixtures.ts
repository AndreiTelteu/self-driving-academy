import { createSessionAutosave } from '../../src/persistence/index';
import type {
  BoundedPipelineStore,
  ProgressSaveStore,
  SessionAutosave,
  SessionAutosaveOptions,
} from '../../src/persistence/index';
import { createRepositoryPipelineStore, persistenceRejection } from '../../src/persistence/index';
import { createScriptedStore } from './bounded-pipeline-fixtures';
import type { ScriptedStore } from './bounded-pipeline-fixtures';
import { createSaveHarness, saveInput, SAVE_SESSION_ID } from './progress-save-fixture';
import type { SaveHarness } from './progress-save-fixture';
import { createWorldFixture, stepWorld, worldSource } from './world-checkpoint-fixtures';
import type { MutableWorld } from './world-checkpoint-fixtures';

/**
 * Deterministic fixtures for PBI 131.
 *
 * The world is the same 30-taxis/40-civilians fixture 206 and 222 use, the player state is the real
 * 130 harness (a real 116 tracker and a real 125 campaign recorder), and time is injected: the
 * status timestamps use `AUTOSAVE_NOW` and scheduling uses ticks only. Nothing here reads a wall
 * clock, a timer or `Math.random`.
 */

export const AUTOSAVE_SESSION = SAVE_SESSION_ID;
export const AUTOSAVE_CHECKPOINT = 'checkpoint-131';
export const AUTOSAVE_NOW = '2026-11-11T12:00:00.000Z';
export const AUTOSAVE_VERSIONS = Object.freeze({
  engineVersion: 'babylon-9.29.0',
  physicsVersion: 'rapier-0.21.0',
  mapVersion: 'map-131-1',
});

export function createAutosaveWorld(): MutableWorld {
  return createWorldFixture();
}

export function stepAutosaveWorld(world: MutableWorld): void {
  stepWorld(world);
}

export function runAutosaveWorld(world: MutableWorld, ticks: number): void {
  for (let index = 0; index < ticks; index += 1) stepWorld(world);
}

export function autosaveSource(world: MutableWorld) {
  return worldSource(world);
}

/** A 130 store whose `save` rejects for the first `rejections` calls, then delegates. */
export interface FailingProgressStore extends ProgressSaveStore {
  rejections: number;
}

export function createFailingProgressStore(
  delegate: ProgressSaveStore,
  rejections = 1,
  code: 'STORAGE_FULL' | 'TRANSACTION_ABORTED' = 'STORAGE_FULL',
): FailingProgressStore {
  const store: FailingProgressStore = {
    catalog: delegate.catalog,
    rejections,
    save: (input, hooks) => {
      if (store.rejections > 0) {
        store.rejections -= 1;
        return Promise.resolve({
          status: 'REJECTED' as const,
          value: null,
          rejection: persistenceRejection(code, 'injected progress rejection', 'progress'),
        });
      }
      return delegate.save(input, hooks);
    },
    load: (input) => delegate.load(input),
    open: (input) => delegate.open(input),
    reset: (input, hooks) => delegate.reset(input, hooks),
  };
  return store;
}

export interface AutosaveHarness {
  readonly save: SaveHarness;
  readonly world: MutableWorld;
  readonly autosave: SessionAutosave;
  readonly scripted: ScriptedStore | null;
  readonly repositoryStore: BoundedPipelineStore | null;
  /** The 130 payload the inventory returns; tests may replace it. */
  progress(): ReturnType<typeof saveInput> | null;
}

export interface AutosaveHarnessOptions {
  readonly intervalTicks?: number;
  readonly store?: 'REPOSITORY' | 'SCRIPTED';
  readonly mode?: 'OK' | 'STUCK';
  readonly rejectNext?: number;
  readonly rejectCode?: 'STORAGE_FULL' | 'TRANSACTION_ABORTED';
  readonly progressRejections?: number;
  readonly noProgress?: boolean;
  readonly monotonic?: () => number;
  readonly now?: () => string;
  readonly startGeneration?: number;
  readonly overrides?: Partial<Omit<SessionAutosaveOptions, 'store' | 'progressStore'>>;
}

export async function createAutosaveHarness(
  options: AutosaveHarnessOptions = {},
): Promise<AutosaveHarness> {
  const save = await createSaveHarness();
  const payload = options.noProgress === true ? null : saveInput(save);
  const scripted =
    options.store === 'SCRIPTED'
      ? createScriptedStore({
          ...(options.mode === undefined ? {} : { mode: options.mode }),
          ...(options.rejectNext === undefined ? {} : { rejectNext: options.rejectNext }),
          ...(options.rejectCode === undefined ? {} : { rejectCode: options.rejectCode }),
        })
      : null;
  const repositoryStore =
    scripted === null ? createRepositoryPipelineStore({ repository: save.repository }) : null;
  const base = scripted ?? repositoryStore;
  if (base === null) throw new Error('The autosave fixture needs a store');
  const progressStore =
    options.progressRejections === undefined
      ? save.store
      : createFailingProgressStore(save.store, options.progressRejections);
  const autosave = createSessionAutosave({
    store: base,
    progressStore,
    inventory: () => payload,
    sessionId: AUTOSAVE_SESSION,
    checkpointId: AUTOSAVE_CHECKPOINT,
    versions: AUTOSAVE_VERSIONS,
    intervalTicks: options.intervalTicks ?? 900,
    now: options.now ?? (() => AUTOSAVE_NOW),
    ...(options.monotonic === undefined ? {} : { monotonic: options.monotonic }),
    ...(options.startGeneration === undefined ? {} : { startGeneration: options.startGeneration }),
    ...options.overrides,
  });
  return {
    save,
    world: createWorldFixture(),
    autosave,
    scripted,
    repositoryStore,
    progress: () => payload,
  };
}
