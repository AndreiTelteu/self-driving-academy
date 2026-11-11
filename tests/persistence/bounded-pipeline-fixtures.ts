import type {
  BoundedGeneration,
  BoundedPipelineRejectionCode,
  BoundedPipelineStore,
  BoundedReplayChunk,
  BoundedStoreCommit,
  WorldSnapshot,
  WorldSnapshotSource,
} from '../../src/persistence/index';
import { captureWorldSnapshot } from '../../src/persistence/index';
import type { WorldRecorder, WorldReplayChunk } from '../../src/replay/index';
import { createWorldRecorder } from '../../src/replay/index';
import type { SimulationEvent } from '../../src/simulation/index';
import type { ReplayTickFrame, ReplayVehicleObservation } from '../../src/replay/index';
import {
  WORLD_FIXTURE,
  captureInput,
  createWorldFixture,
  stepWorld,
  worldSource,
} from './world-checkpoint-fixtures';
import type { MutableWorld } from './world-checkpoint-fixtures';

/**
 * Deterministic fixtures for PBI 222.
 *
 * The world is the 206 fixture (30 taxis and 40 civilians, the V1 maximum workload) and the replay
 * frames are derived from the same captured state, so the recorder and the checkpoint see one
 * coherent fleet instead of two different toys. Nothing here reads a wall clock or `Math.random`:
 * every value is a pure function of the tick.
 */

export const PIPELINE_SESSION = 'session-222' as const;
export const PIPELINE_CHECKPOINT = 'checkpoint-222' as const;
export const PIPELINE_NOW = '2026-11-11T09:00:00.000Z' as const;
export const PIPELINE_VERSIONS = Object.freeze({
  engineVersion: 'babylon-9.29.0',
  physicsVersion: 'rapier-0.21.0',
  mapVersion: 'map-222-1',
});

export const PIPELINE_FLEET = Object.freeze({
  taxis: WORLD_FIXTURE.taxis,
  civilians: WORLD_FIXTURE.civilians,
  vehicles: WORLD_FIXTURE.taxis + WORLD_FIXTURE.civilians,
  signals: WORLD_FIXTURE.signals,
  opportunities: WORLD_FIXTURE.opportunities,
});

/** A fresh 30/40 world at tick 0; the caller steps it and offers the tick. */
export function createPipelineWorld(): MutableWorld {
  return createWorldFixture();
}

export function pipelineSource(world: MutableWorld): WorldSnapshotSource {
  return worldSource(world);
}

export function stepPipelineWorld(world: MutableWorld): void {
  stepWorld(world);
}

/** Only one vehicle in eight is "in camera"; the rest are still simulated and still recorded. */
export function inCamera(entityIndex: number): boolean {
  return entityIndex % 8 === 0;
}

/** Unit quaternion: `worldFrame` publishes a valid rotation, whatever the fixture accumulated. */
function unitRotation(q: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
} {
  const norm = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return Object.freeze({ x: q.x / norm, y: q.y / norm, z: q.z / norm, w: q.w / norm });
}

/** The authoritative tick as the 207 recorder expects it, read from the same 206 state. */
export function worldFrame(
  world: MutableWorld,
  options: {
    readonly created?: readonly number[];
    readonly removed?: readonly number[];
  } = {},
): ReplayTickFrame {
  const input = captureInput(world);
  const tick = input.tick;
  const vehicles: ReplayVehicleObservation[] = input.vehicles.map((vehicle, index) =>
    Object.freeze({
      entityId: vehicle.entityId,
      handle: vehicle.handle,
      vehicleClass: vehicle.vehicleClass,
      controlMode: vehicle.controlMode,
      position: Object.freeze({ ...vehicle.position }),
      rotation: unitRotation(vehicle.rotation),
      linearVelocity: Object.freeze({ ...vehicle.linearVelocity }),
      fsmState: vehicle.fsmState,
      rideId: vehicle.rideId,
      passengerIds: Object.freeze([...vehicle.passengerIds]),
      inCamera: inCamera(index),
    }),
  );
  const lifecycle = (indexes: readonly number[] | undefined) =>
    Object.freeze(
      (indexes ?? []).map((index) => {
        const vehicle = input.vehicles[index];
        if (vehicle === undefined) throw new Error(`Unknown fixture vehicle ${index}`);
        return Object.freeze({
          entityId: vehicle.entityId,
          vehicleClass: vehicle.vehicleClass,
          handle: vehicle.handle,
          tick,
        });
      }),
    );
  return Object.freeze({
    tick,
    vehicles: Object.freeze(vehicles),
    signals: Object.freeze(
      input.signals.map((signal) =>
        Object.freeze({
          signalId: signal.signalId,
          phase: signal.phase,
          remainingTicks: signal.remainingTicks,
        }),
      ),
    ),
    created: lifecycle(options.created),
    removed: lifecycle(options.removed),
  });
}

/** One real 007 fact; `type` keeps the event vocabulary of the simulation bus. */
export function pipelineEvent(
  world: MutableWorld,
  type: 'COLLISION' | 'STOP_APPROACH' | 'WORLD_RESET',
  entityIndexes: readonly number[],
  payload: Readonly<Record<string, unknown>>,
): SimulationEvent {
  const input = captureInput(world);
  const tick = input.tick;
  const entityIds = entityIndexes.map((index) => {
    const vehicle = input.vehicles[index];
    if (vehicle === undefined) throw new Error(`Unknown fixture vehicle ${index}`);
    return vehicle.entityId;
  });
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    sessionId: PIPELINE_SESSION,
    worldEpoch: input.worldEpoch,
    eventId: `event-${type.toLowerCase()}-${tick}`,
    tick,
    entityIds: Object.freeze(entityIds),
    type,
    payload: Object.freeze({ ...payload }),
  }) as SimulationEvent;
}

/** The 206 snapshot of the fixture world at its current tick, as a replay chunk anchor. */
export function snapshotAt(world: MutableWorld): WorldSnapshot {
  const captured = captureWorldSnapshot(captureInput(world));
  if (captured.status === 'REJECTED') {
    throw new Error(`The fixture snapshot was rejected: ${captured.rejection.message}`);
  }
  return captured.snapshot;
}

export interface RecorderFixture {
  readonly recorder: WorldRecorder;
  recordTick(): void;
  /** Re-anchors the recorder on a complete 206 snapshot of the current tick. */
  anchor(): void;
  /** Records a collision at the current tick and immediately seals its chunk. */
  sealCollision(entityIndex: number, otherIndex: number): WorldReplayChunk | null;
}

/**
 * A real 207 recorder fed by the 206 fixture. It is not a second implementation: the pipeline only
 * receives the sealed chunk and its declared bytes.
 */
export function createRecorderFixture(world: MutableWorld): RecorderFixture {
  const recorder = createWorldRecorder({
    sessionId: PIPELINE_SESSION,
    worldEpoch: WORLD_FIXTURE.worldEpoch,
    versions: PIPELINE_VERSIONS,
    now: () => PIPELINE_NOW,
  });
  const anchor = () => {
    const input = captureInput(world);
    const captured = captureWorldSnapshot(input);
    if (captured.status === 'REJECTED') {
      throw new Error(`The fixture snapshot was rejected: ${captured.rejection.message}`);
    }
    recorder.recordCheckpoint({
      checkpointId: `${PIPELINE_CHECKPOINT}-${input.tick}`,
      snapshot: captured.snapshot,
    });
  };
  return {
    recorder,
    anchor,
    recordTick: () => {
      recorder.recordTick(worldFrame(world));
    },
    sealCollision: (entityIndex, otherIndex) => {
      const input = captureInput(world);
      const event = pipelineEvent(world, 'COLLISION', [entityIndex, otherIndex], {
        vehicleId: input.vehicles[entityIndex]?.entityId ?? '',
        otherEntityId: input.vehicles[otherIndex]?.entityId ?? '',
        impulseNs: 1_250,
      });
      const recorded = recorder.recordEvent(event);
      const incidentId = recorded.incidentId;
      if (incidentId === null) return null;
      const sealed = recorder.sealIncident(incidentId);
      if (sealed.status === 'REJECTED') return null;
      return recorder.takeChunk(sealed.chunk.sequence);
    },
  };
}

/** The pipeline's view of a sealed 207 chunk: declared metadata plus the opaque payload. */
export function boundedChunk(chunk: WorldReplayChunk): BoundedReplayChunk {
  return Object.freeze({
    chunkId: chunk.chunkId,
    sequence: chunk.sequence,
    incidentId: chunk.incident.incidentId,
    startTick: chunk.startTick,
    endTick: chunk.endTick,
    bytes: chunk.bytes,
    status: chunk.completeness.status,
    chunk,
  });
}

/* -------------------------------------------------------------- store double */

export interface ScriptedStore extends BoundedPipelineStore {
  readonly handed: BoundedGeneration[];
  readonly chunkHanded: BoundedReplayChunk[];
  readonly results: BoundedStoreCommit[];
  mode: 'OK' | 'STUCK';
  rejectNext: number;
  rejectCode: BoundedPipelineRejectionCode;
  /** Facts the adapter reports durable before it fails; `-1` reports every attached fact. */
  factsDurable: number;
  failChunk: boolean;
  readonly held: number;
  releaseAll(): void;
}

/**
 * A store double that can be slow (a commit that stays pending until `releaseAll`), full (a closed
 * rejection code) or complete. It never invents latency: the pending promise is the only clock.
 */
export function createScriptedStore(
  options: {
    readonly mode?: 'OK' | 'STUCK';
    readonly rejectNext?: number;
    readonly rejectCode?: BoundedPipelineRejectionCode;
    readonly factsDurable?: number;
    readonly handoffChunk?: boolean;
    readonly failChunk?: boolean;
  } = {},
): ScriptedStore {
  const handed: BoundedGeneration[] = [];
  const chunkHanded: BoundedReplayChunk[] = [];
  const results: BoundedStoreCommit[] = [];
  const releases: (() => void)[] = [];
  const store: ScriptedStore = {
    handed,
    chunkHanded,
    results,
    mode: options.mode ?? 'OK',
    rejectNext: options.rejectNext ?? 0,
    rejectCode: options.rejectCode ?? 'STORAGE_FULL',
    factsDurable: options.factsDurable ?? -1,
    failChunk: options.failChunk === true,
    get held() {
      return releases.length;
    },
    releaseAll: () => {
      const pending = releases.splice(0, releases.length);
      for (const release of pending) release();
    },
    handoff: (generation: BoundedGeneration): Promise<BoundedStoreCommit> => {
      handed.push(generation);
      const durable =
        store.factsDurable < 0
          ? generation.protectedFacts.length
          : Math.min(store.factsDurable, generation.protectedFacts.length);
      if (store.rejectNext > 0) {
        store.rejectNext -= 1;
        const rejectedDurable =
          store.factsDurable < 0
            ? 0
            : Math.min(store.factsDurable, generation.protectedFacts.length);
        const rejectedResult: BoundedStoreCommit = Object.freeze({
          status: 'REJECTED' as const,
          generation: generation.generation,
          code: store.rejectCode,
          message: 'injected store rejection',
          bytes: 0,
          factsDurable: rejectedDurable,
        });
        results.push(rejectedResult);
        return Promise.resolve(rejectedResult);
      }
      const committed: BoundedStoreCommit = Object.freeze({
        status: 'COMMITTED' as const,
        generation: generation.generation,
        code: null,
        message: null,
        bytes: generation.bytes,
        factsDurable: durable,
      });
      if (store.mode === 'STUCK') {
        return new Promise<BoundedStoreCommit>((resolve) => {
          releases.push(() => {
            results.push(committed);
            resolve(committed);
          });
        });
      }
      results.push(committed);
      return Promise.resolve(committed);
    },
  };
  if (options.handoffChunk === true) {
    store.handoffChunk = (chunk: BoundedReplayChunk): Promise<BoundedStoreCommit> => {
      chunkHanded.push(chunk);
      if (store.failChunk) {
        const rejectedResult: BoundedStoreCommit = Object.freeze({
          status: 'REJECTED' as const,
          generation: null,
          code: 'STORAGE_FULL' as const,
          message: 'injected chunk rejection',
          bytes: 0,
          factsDurable: 0,
        });
        results.push(rejectedResult);
        return Promise.resolve(rejectedResult);
      }
      const committed: BoundedStoreCommit = Object.freeze({
        status: 'COMMITTED' as const,
        generation: null,
        code: null,
        message: null,
        bytes: chunk.bytes,
        factsDurable: 0,
      });
      results.push(committed);
      return Promise.resolve(committed);
    };
  }
  return store;
}

/** A clock that hands out scripted readings and counts how many times it was read. */
export function countingClock(values: readonly number[] = [0]): {
  readonly read: number;
  readonly readCount: () => number;
  readonly clock: () => number;
} {
  let index = 0;
  let reads = 0;
  return {
    get read() {
      return reads;
    },
    readCount: () => reads,
    clock: () => {
      reads += 1;
      const value = values[Math.min(index, values.length - 1)] ?? 0;
      index += 1;
      return value;
    },
  };
}
