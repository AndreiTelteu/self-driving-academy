import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { DEFAULT_ASSET_LIMITS, analyzeRegistryGlb, type AssetLimits } from './asset-contract';
export { DEFAULT_ASSET_LIMITS, validateRegistryGlb, type AssetLimits } from './asset-contract';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import {
  checkAssetUsage,
  checkAssetManifest,
  RENDER_ASSET_CAPS,
  type BudgetedAsset,
} from '../asset-budgets';

export interface AssetDefinition {
  readonly id: string;
  readonly version: string;
  readonly url: string;
  readonly critical: boolean;
  readonly source: string;
  readonly license: string;
  readonly budget?: BudgetedAsset;
}
export interface AssetProgress {
  readonly id: string;
  readonly phase: 'queued' | 'transfer' | 'decode-upload' | 'ready' | 'placeholder' | 'error';
  readonly loadedBytes: number;
  readonly totalBytes: number | null;
}
export interface AssetLoadReport {
  readonly id: string;
  readonly critical: boolean;
  readonly queueMs: number;
  readonly transferMs: number;
  /** Babylon's combined CPU decode/resource submission; not a GPU timer. */
  readonly decodeUploadMs: number;
  readonly shaderPrepareMs: number;
  readonly preparedShaderVariants: number;
  readonly totalMs: number;
  readonly transferBytes: number;
  readonly decodedResourceBytes: number;
  readonly geometryGpuBytes: number;
  readonly textureGpuBytes: number;
  /** No WASM extension decoder is admitted by the core GLB contract. */
  readonly decoderWasmBytes: number;
  readonly nativeDecoderWorkspaceBytes: null;
  readonly exactGpuBytes: null;
  readonly status: 'ready' | 'error';
  readonly error: string | null;
}
export interface AssetLease {
  readonly root: TransformNode;
  readonly placeholder: boolean;
  /** Idempotent. Release AFTER removing the representation from its scene adapter. */
  release(): void;
}
interface Entry {
  readonly definition: AssetDefinition;
  promise: Promise<AssetContainer>;
  container?: AssetContainer;
  refs: number;
  bytes: number;
  lastUsed: number;
}
interface Job {
  readonly entry: Entry;
  readonly run: () => Promise<void>;
}

/** Scene-local bounded GLB cache. Never owns the Scene or its Engine. */
export class BabylonAssetRegistry {
  readonly limits: AssetLimits;
  private readonly scene: Scene;
  private readonly definitions = new Map<string, AssetDefinition>();
  private readonly entries = new Map<string, Entry>();
  private readonly queue: Job[] = [];
  private readonly leases = new Set<AssetLease>();
  private readonly controllers = new Set<AbortController>();
  private readonly history: AssetLoadReport[] = [];
  private readonly listeners = new Set<(progress: AssetProgress) => void>();
  private active = 0;
  private disposed = false;
  private sequence = 0;
  private cacheHits = 0;
  private decodeLoads = 0;
  private pendingAcquires = 0;
  private cleanupFailures = 0;
  private readonly removeSceneObserver: () => void;

  constructor(
    scene: Scene,
    definitions: readonly AssetDefinition[],
    limits: Partial<AssetLimits> = {},
  ) {
    this.scene = scene;
    this.limits = Object.freeze({ ...DEFAULT_ASSET_LIMITS, ...limits });
    for (const value of Object.values(this.limits))
      if (!Number.isSafeInteger(value) || value < 1)
        throw new Error('Asset limits must be positive integers');
    if (scene.isDisposed) throw new Error('Asset registry requires a live scene');
    if (definitions.length > RENDER_ASSET_CAPS.maxAssetDefinitions)
      throw new Error('Asset manifest definition capacity');
    for (const definition of definitions) {
      if (
        [
          definition.id,
          definition.version,
          definition.url,
          definition.source,
          definition.license,
        ].some((value) => typeof value !== 'string' || !value.trim()) ||
        typeof definition.critical !== 'boolean'
      )
        throw new Error('Invalid asset manifest');
      if (this.definitions.has(definition.id))
        throw new Error(`Duplicate asset ID: ${definition.id}`);
      if (definition.budget && definition.budget.id !== definition.id)
        throw new Error('Asset budget ID mismatch');
      if (definition.budget) {
        const result = checkAssetManifest(
          {
            version: 'registry-asset',
            criticalCodeTransferBytes: 0,
            decoderWasmBytes: 0,
            decoderWorkspaceBytes: 0,
            assets: [definition.budget],
          },
          'HIGH',
        );
        if (!result.accepted)
          throw new Error(`Asset budget invalid: ${JSON.stringify(result.diagnostics)}`);
      }
      this.definitions.set(
        definition.id,
        Object.freeze({
          ...definition,
          budget: definition.budget ? Object.freeze({ ...definition.budget }) : undefined,
        }),
      );
    }
    const observer = scene.onDisposeObservable.addOnce(() => this.dispose());
    this.removeSceneObserver = () => scene.onDisposeObservable.remove(observer);
  }
  subscribe(listener: (progress: AssetProgress) => void): () => void {
    this.assertLive();
    if (this.listeners.size >= 32) throw new Error('Asset progress listener capacity');
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  get metrics() {
    return {
      activeLoads: this.active,
      queuedLoads: this.queue.length,
      cacheEntries: this.entries.size,
      reservedBytes: [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0),
      instances: this.leases.size,
      cacheHits: this.cacheHits,
      decodeLoads: this.decodeLoads,
      cleanupFailures: this.cleanupFailures,
      reports: [...this.history],
      limits: this.limits,
    };
  }
  async acquire(id: string): Promise<AssetLease> {
    this.assertLive();
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Unknown asset ID: ${id}`);
    if (this.leases.size + this.pendingAcquires >= this.limits.maxInstances)
      throw new Error('Asset instance capacity');
    this.pendingAcquires++;
    let entry = this.entries.get(id);
    try {
      if (!entry) entry = this.enqueue(definition);
      else this.cacheHits++;
      entry.refs++;
      const container = await entry.promise;
      this.assertLive();
      const root = new TransformNode(`asset:${id}:${++this.sequence}`, this.scene);
      try {
        const models = container.instantiateModelsToScene((name) => `${root.name}:${name}`, false);
        for (const node of models.rootNodes) node.parent = root;
        const lease = this.makeLease(root, false, () => {
          for (const group of models.animationGroups) this.cleanup(() => group.dispose());
          for (const skeleton of models.skeletons) this.cleanup(() => skeleton.dispose());
          this.releaseEntry(entry!);
        });
        this.emit(id, 'ready', entry.bytes, entry.bytes);
        return lease;
      } catch (error) {
        root.dispose(false, false);
        throw error;
      }
    } catch (error) {
      if (entry) this.releaseEntry(entry);
      if (definition.critical || this.disposed || this.scene.isDisposed)
        throw new Error(
          `Critical asset ${id} (${definition.url}): ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      this.emit(id, 'placeholder', 0, null);
      return this.placeholder(id);
    } finally {
      this.pendingAcquires--;
    }
  }
  /** Idle entries only; shared resources survive while a lease exists. */
  unload(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry || !entry.container || entry.refs > 0) return false;
    this.entries.delete(id);
    this.disposeContainer(entry.container);
    return true;
  }
  clearIdle(): void {
    for (const id of this.entries.keys()) this.unload(id);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeSceneObserver();
    this.listeners.clear();
    for (const controller of this.controllers) controller.abort();
    for (const lease of [...this.leases]) lease.release();
    this.clearIdle();
    // Queued jobs still settle their promises; run() rejects before any new I/O.
    this.pump();
  }
  private enqueue(definition: AssetDefinition): Entry {
    if (this.queue.length >= this.limits.maxQueued) throw new Error('Asset loading queue capacity');
    while (
      this.entries.size >= this.limits.maxCacheEntries ||
      this.metrics.reservedBytes + this.limits.maxAssetBytes > this.limits.maxResidentBytes
    ) {
      const idle = [...this.entries.values()]
        .filter((entry) => entry.container && entry.refs === 0)
        .sort((a, b) => a.lastUsed - b.lastUsed)[0];
      if (!idle || !this.unload(idle.definition.id))
        throw new Error('Asset cache capacity: all resources pinned or loading');
    }
    let resolve!: (container: AssetContainer) => void;
    let reject!: (error: unknown) => void;
    const entry: Entry = {
      definition,
      refs: 0,
      bytes: this.limits.maxAssetBytes,
      lastUsed: performance.now(),
      promise: new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      }),
    };
    const queuedAt = performance.now();
    this.entries.set(definition.id, entry);
    this.queue.push({
      entry,
      run: async () => {
        const started = performance.now();
        let transferMs = 0,
          decodeUploadMs = 0,
          shaderPrepareMs = 0,
          preparedShaderVariants = 0,
          transferBytes = 0,
          decodedResourceBytes = 0,
          geometryGpuBytes = 0,
          textureGpuBytes = 0;
        let container: AssetContainer | undefined;
        let failure: string | null = null;
        try {
          this.assertLive();
          const bytes = await this.fetchBytes(definition);
          transferBytes = bytes.byteLength;
          transferMs = performance.now() - started;
          const analysis = analyzeRegistryGlb(bytes, this.limits);
          ({ decodedResourceBytes, geometryGpuBytes, textureGpuBytes } = analysis);
          if (definition.budget) {
            const diagnostics = checkAssetUsage(definition.budget, {
              transferBytes,
              geometryGpuBytes,
              textureGpuBytes,
              decodeMs: 0,
              shaderPrepareMs: 0,
              firstUseMs: 0,
            });
            if (diagnostics.length)
              throw new Error(`Asset admission over budget: ${JSON.stringify(diagnostics)}`);
          }
          entry.bytes = transferBytes + decodedResourceBytes;
          if (this.metrics.reservedBytes > this.limits.maxResidentBytes)
            throw new Error('Asset resident budget exceeded before decode');
          this.assertLive();
          this.emit(definition.id, 'decode-upload', transferBytes, transferBytes);
          const decodeStart = performance.now();
          this.decodeLoads++;
          container = await LoadAssetContainerAsync(bytes, this.scene, {
            pluginExtension: '.glb',
            name: definition.id,
          });
          decodeUploadMs = performance.now() - decodeStart;
          this.assertLive();
          if (decodeUploadMs > this.limits.decodeUploadBudgetMs)
            throw new Error('Asset decode/upload CPU budget exceeded');
          const shaderStart = performance.now();
          const prepared = new Set();
          for (const mesh of container.meshes) {
            if (mesh.material && !prepared.has(mesh.material)) {
              prepared.add(mesh.material);
              await mesh.material.forceCompilationAsync(mesh);
              preparedShaderVariants++;
              await mesh.material.forceCompilationAsync(mesh, { useInstances: true });
              preparedShaderVariants++;
              this.assertLive();
            }
          }
          shaderPrepareMs = performance.now() - shaderStart;
          if (definition.budget && preparedShaderVariants > definition.budget.shaderVariants)
            throw new Error('Asset prepared shader variants exceed declared budget');
          if (shaderPrepareMs > this.limits.decodeUploadBudgetMs)
            throw new Error('Asset shader preparation CPU budget exceeded');
          if (this.metrics.reservedBytes > this.limits.maxResidentBytes)
            throw new Error('Asset resident budget exceeded');
          entry.container = container;
          resolve(container);
        } catch (error) {
          failure = error instanceof Error ? error.message : String(error);
          if (container) this.disposeContainer(container);
          this.entries.delete(definition.id);
          this.emit(definition.id, 'error', transferBytes, null);
          reject(error);
        } finally {
          this.history.push({
            id: definition.id,
            critical: definition.critical,
            queueMs: started - queuedAt,
            transferMs,
            decodeUploadMs,
            shaderPrepareMs,
            preparedShaderVariants,
            totalMs: performance.now() - queuedAt,
            transferBytes,
            decodedResourceBytes,
            geometryGpuBytes,
            textureGpuBytes,
            decoderWasmBytes: 0,
            nativeDecoderWorkspaceBytes: null,
            exactGpuBytes: null,
            status: failure ? 'error' : 'ready',
            error: failure,
          });
          if (this.history.length > this.limits.maxReports) this.history.shift();
        }
      },
    });
    this.emit(definition.id, 'queued', 0, null);
    this.pump();
    return entry;
  }
  private pump(): void {
    this.queue.sort(
      (a, b) => Number(b.entry.definition.critical) - Number(a.entry.definition.critical),
    );
    while (this.active < this.limits.maxConcurrent && this.queue.length) {
      const job = this.queue.shift()!;
      this.active++;
      void job.run().finally(() => {
        this.active--;
        this.pump();
      });
    }
  }
  private async fetchBytes(definition: AssetDefinition): Promise<Uint8Array> {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), this.limits.fetchTimeoutMs);
    try {
      const response = await fetch(definition.url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const declared = Number(response.headers.get('content-length')) || null;
      if (declared && declared > this.limits.maxAssetBytes)
        throw new Error('Asset transfer budget exceeded');
      if (!response.body) throw new Error('Asset response has no body');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          length += next.value.byteLength;
          if (length > this.limits.maxAssetBytes) throw new Error('Asset transfer budget exceeded');
          chunks.push(next.value);
          this.emit(definition.id, 'transfer', length, declared);
        }
      } finally {
        await reader.cancel();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return bytes;
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }
  private releaseEntry(entry: Entry): void {
    entry.refs = Math.max(0, entry.refs - 1);
    entry.lastUsed = performance.now();
    if (this.disposed && this.entries.get(entry.definition.id) === entry)
      this.unload(entry.definition.id);
  }
  private makeLease(root: TransformNode, placeholder: boolean, cleanup: () => void): AssetLease {
    let released = false;
    const lease: AssetLease = {
      root,
      placeholder,
      release: () => {
        if (released) return;
        released = true;
        const descendants = root.getDescendants(false).reverse();
        for (const node of descendants) this.cleanup(() => node.dispose(true, false));
        this.cleanup(() => root.dispose(true, false));
        this.cleanup(cleanup);
        this.leases.delete(lease);
      },
    };
    this.leases.add(lease);
    return lease;
  }
  private placeholder(id: string): AssetLease {
    const root = new TransformNode(`placeholder:${id}`, this.scene);
    const mesh = CreateBox(`${id}:missing`, { size: 1 }, this.scene);
    mesh.parent = root;
    const material = new StandardMaterial(`${id}:placeholder-material`, this.scene);
    material.disableLighting = true;
    material.emissiveColor = new Color3(1, 0, 1);
    mesh.material = material;
    return this.makeLease(root, true, () => material.dispose(false, false));
  }
  private emit(
    id: string,
    phase: AssetProgress['phase'],
    loadedBytes: number,
    totalBytes: number | null,
  ): void {
    for (const listener of this.listeners) {
      try {
        listener({ id, phase, loadedBytes, totalBytes });
      } catch {
        /* Diagnostics cannot change loading ownership. */
      }
    }
  }
  private assertLive(): void {
    if (this.disposed || this.scene.isDisposed) throw new Error('Asset registry disposed');
  }
  private cleanup(action: () => void): void {
    try {
      action();
    } catch {
      this.cleanupFailures++;
    }
  }
  private disposeContainer(container: AssetContainer): void {
    this.cleanup(() => container.dispose());
    // Continue ownership cleanup even if a Babylon observer interrupts dispose().
    for (const mesh of container.meshes) this.cleanup(() => mesh.dispose(true, false));
    for (const node of container.transformNodes) this.cleanup(() => node.dispose(true, false));
    for (const group of container.animationGroups) this.cleanup(() => group.dispose());
    for (const skeleton of container.skeletons) this.cleanup(() => skeleton.dispose());
    for (const material of container.materials) this.cleanup(() => material.dispose(false, false));
    for (const texture of container.textures) this.cleanup(() => texture.dispose());
    for (const geometry of container.geometries) this.cleanup(() => geometry.dispose());
  }
}
