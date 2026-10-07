import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { BackendPreference } from '../backend-policy';
import { validateRenderSnapshot, type RenderSnapshot } from '../render-sync';
import { BabylonAssetRegistry, type AssetDefinition, type AssetLease } from './asset-registry';
import { BabylonSceneAdapter } from './scene-adapter';
import { BabylonSnapshotPresenter } from './snapshot-presenter';
import { createRenderingBackend, type RenderingBackend } from './backend';

export interface RecoverySceneSnapshot {
  readonly render: RenderSnapshot;
  readonly assets: readonly AssetDefinition[];
  readonly bindings: readonly { readonly entityId: string; readonly assetId: string }[];
}
export interface BabylonRecoverySession extends RenderingBackend {
  readonly registry: BabylonAssetRegistry;
  readonly adapter: BabylonSceneAdapter;
  readonly ownedLossSubscriptions: number;
}

/** Babylon9.29 has no loss notification in doNotHandleContextLost mode: own the native signal. */
export function subscribeRenderingLoss(
  backend: RenderingBackend,
  notify: (reason: unknown) => void,
): () => void {
  let active = true,
    notified = false;
  const signal = (reason: unknown) => {
    if (!active || notified) return;
    notified = true;
    notify(reason);
  };
  const lost = (event: Event) => {
    event.preventDefault();
    signal(new Error('WebGL context lost'));
  };
  const engine = backend.scene.getEngine();
  if (backend.rendererKind === 'WEBGL2') backend.canvas.addEventListener('webglcontextlost', lost);
  if (engine instanceof WebGPUEngine) {
    // _device is declared by the fixed Babylon version; automatic restoration is disabled.
    void engine._device.lost.then((info) =>
      signal(new Error(`WebGPU device lost (${info.reason}): ${info.message}`)),
    );
  }
  return () => {
    active = false;
    backend.canvas.removeEventListener('webglcontextlost', lost);
  };
}

/** Recreate assets/nodes from a RAM projection, never reuse resources from the lost GPU scene. */
export async function createBabylonRecoverySession(
  canvas: HTMLCanvasElement,
  preference: BackendPreference,
  snapshot: RecoverySceneSnapshot,
  onLost: (reason: unknown) => void,
): Promise<BabylonRecoverySession> {
  validateRenderSnapshot(snapshot.render);
  const bindings = new Map(snapshot.bindings.map((binding) => [binding.entityId, binding.assetId]));
  const entities = new Set(snapshot.render.vehicles.map((vehicle) => vehicle.vehicleId));
  const assetIds = new Set(snapshot.assets.map((asset) => asset.id));
  if (
    bindings.size !== snapshot.bindings.length ||
    bindings.size !== entities.size ||
    [...bindings].some(([id, asset]) => !entities.has(id) || !assetIds.has(asset))
  )
    throw new Error('Invalid recovery scene bindings');
  const backend = await createRenderingBackend(canvas, preference);
  let registry: BabylonAssetRegistry | undefined, adapter: BabylonSceneAdapter | undefined;
  const leases: AssetLease[] = [];
  let disposed = false;
  let rejectLoss: (reason: unknown) => void = () => {};
  const lossDuringBuild = new Promise<never>((_resolve, reject) => {
    rejectLoss = reject;
  });
  const unbind = subscribeRenderingLoss(backend, (reason) => {
    rejectLoss(reason);
    onLost(reason);
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const errors: unknown[] = [];
    for (const cleanup of [
      unbind,
      () => adapter?.dispose(),
      ...leases.map((lease) => () => lease.release()),
      () => registry?.dispose(),
      () => backend.dispose(),
    ]) {
      try {
        cleanup();
      } catch (error: unknown) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, 'GPU recovery scene cleanup failed');
  };
  const build = async (): Promise<BabylonRecoverySession> => {
    registry = new BabylonAssetRegistry(backend.scene, snapshot.assets);
    adapter = new BabylonSceneAdapter(backend.scene, snapshot.render);
    const wheelNodes = new Map<string, TransformNode>();
    for (const vehicle of snapshot.render.vehicles) {
      const lease = await registry.acquire(bindings.get(vehicle.vehicleId)!);
      if (disposed) {
        lease.release();
        throw new Error('Recovery construction disposed');
      }
      leases.push(lease);
      // Container instances share cached textures, which Babylon removes from scene membership.
      // Register references for adapter validation/scene accounting; registry still owns disposal.
      for (const node of lease.root.getDescendants(false)) {
        if (!(node instanceof AbstractMesh)) continue;
        for (const texture of node.material?.getActiveTextures() ?? []) {
          if (texture.getScene() !== backend.scene)
            throw new Error('Recovery asset texture belongs to another scene');
          if (!backend.scene.textures.includes(texture)) backend.scene.addTexture(texture);
        }
      }
      adapter.create(vehicle.vehicleId, { root: lease.root }, vehicle.transform);
      const requiredWheels = new Set(vehicle.wheels.map((wheel) => wheel.wheelId));
      for (const node of lease.root.getDescendants(false)) {
        if (node instanceof TransformNode) {
          const prefix = `${lease.root.name}:`;
          const sourceName = node.name.startsWith(prefix)
            ? node.name.slice(prefix.length)
            : node.name;
          if (!requiredWheels.has(sourceName)) continue;
          const key = JSON.stringify([vehicle.vehicleId, sourceName]);
          if (wheelNodes.has(key)) throw new Error('Ambiguous recovery asset node name');
          wheelNodes.set(key, node);
        }
      }
      for (const wheel of vehicle.wheels) {
        if (!wheelNodes.has(JSON.stringify([vehicle.vehicleId, wheel.wheelId])))
          throw new Error(`Recovery asset missing wheel node: ${wheel.wheelId}`);
      }
    }
    const presenter = new BabylonSnapshotPresenter(adapter);
    presenter.present(snapshot.render, (id, wheelId) => {
      const node = wheelNodes.get(JSON.stringify([id, wheelId]));
      return node;
    });
    await backend.scene.whenReadyAsync();
    if (disposed) throw new Error('Recovery construction disposed');
    return {
      ...backend,
      registry,
      adapter,
      get ownedLossSubscriptions() {
        return disposed ? 0 : 1;
      },
      dispose,
    };
  };
  try {
    return await Promise.race([build(), lossDuringBuild]);
  } catch (error: unknown) {
    try {
      dispose();
    } catch {
      /* Original reconstruction failure remains actionable. */
    }
    throw error;
  }
}
