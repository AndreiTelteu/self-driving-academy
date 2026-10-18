import { createProfileSnapshot } from '../profiles';
import type { SimulationSnapshot } from '../simulation';

/** Minimal adapter port, not the savefile or IndexedDB schema. */
export interface SnapshotStore {
  save(snapshot: SimulationSnapshot): Promise<void>;
  load(): Promise<SimulationSnapshot | null>;
}

/** Volatile bootstrap adapter; durable persistence belongs to later PBIs. */
export function createMemorySnapshotStore(): SnapshotStore {
  let saved: SimulationSnapshot | null = null;
  return {
    save: (snapshot) => {
      saved = Object.freeze({
        tick: snapshot.tick,
        profile: createProfileSnapshot(snapshot.profile),
      });
      return Promise.resolve();
    },
    load: () => Promise.resolve(saved),
  };
}
