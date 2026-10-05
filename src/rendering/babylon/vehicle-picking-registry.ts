import type { Node } from '@babylonjs/core/node.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { PickingInfo } from '@babylonjs/core/Collisions/pickingInfo.js';
import { validateEntityId } from '../scene-contract';

export interface VehiclePickingRegistryOptions {
  readonly maxBindings?: number;
  readonly maxThinInstances?: number;
  /** Optional013 adapter mapping. Thin batches always require an explicit index table. */
  readonly entityIdFor?: (node: Node) => string | undefined;
}
interface Binding {
  readonly ids: string | readonly (string | null)[];
  readonly release: () => void;
}
/** Explicit presentation identity registry. Does not own meshes or vehicle state. */
export class VehiclePickingRegistry {
  private readonly bindings = new Map<Node, Binding>();
  private readonly maxBindings: number;
  private readonly maxThinInstances: number;
  private disposed = false;
  readonly scene: Scene;
  private readonly options: VehiclePickingRegistryOptions;
  constructor(scene: Scene, options: VehiclePickingRegistryOptions = {}) {
    this.scene = scene;
    this.options = options;
    this.maxBindings = options.maxBindings ?? 4096;
    this.maxThinInstances = options.maxThinInstances ?? 65536;
    if (
      scene.isDisposed ||
      ![this.maxBindings, this.maxThinInstances].every((v) => Number.isSafeInteger(v) && v > 0)
    )
      throw new Error('Invalid picking registry');
  }
  get size(): number {
    return this.bindings.size;
  }
  /** A root covers descendants; regular instances may be registered separately. */
  register(node: Node, entityId: string): void {
    this.assertNode(node);
    validateEntityId(entityId);
    if (node instanceof Mesh && node.hasThinInstances)
      throw new Error('Thin instances require an index table');
    this.bind(node, entityId);
  }
  /** Call again after every batch reorder/removal, with its complete current index table. */
  registerThinBatch(mesh: Mesh, entityIds: readonly (string | null)[]): void {
    this.assertNode(mesh);
    if (
      !(mesh instanceof Mesh) ||
      !Array.isArray(entityIds) ||
      !mesh.hasThinInstances ||
      entityIds.length !== mesh.thinInstanceCount ||
      entityIds.length > this.maxThinInstances
    )
      throw new Error('Invalid thin instance table');
    let total = entityIds.length;
    for (const [node, binding] of this.bindings) {
      if (node !== mesh && Array.isArray(binding.ids)) total += binding.ids.length;
    }
    if (total > this.maxThinInstances) throw new Error('Picking thin identity capacity exceeded');
    for (const id of entityIds) if (id !== null) validateEntityId(id);
    this.bind(mesh, Object.freeze([...entityIds]));
  }
  unregister(node: Node): boolean {
    const binding = this.bindings.get(node);
    if (!binding) return false;
    this.bindings.delete(node);
    binding.release();
    return true;
  }
  resolve(hit: Pick<PickingInfo, 'hit' | 'pickedMesh' | 'thinInstanceIndex'>): string | null {
    const mesh = hit.pickedMesh;
    if (
      this.disposed ||
      this.scene.isDisposed ||
      !hit.hit ||
      !mesh ||
      mesh.isDisposed() ||
      mesh.getScene() !== this.scene
    )
      return null;
    if (hit.thinInstanceIndex >= 0 || (mesh instanceof Mesh && mesh.hasThinInstances)) {
      const ids = this.bindings.get(mesh)?.ids;
      if (
        !Array.isArray(ids) ||
        !(mesh instanceof Mesh) ||
        ids.length !== mesh.thinInstanceCount ||
        !Number.isSafeInteger(hit.thinInstanceIndex)
      )
        return null;
      return ids[hit.thinInstanceIndex] ?? null;
    }
    for (let node: Node | null = mesh; node; node = node.parent) {
      const ids = this.bindings.get(node)?.ids;
      if (typeof ids === 'string') return ids;
    }
    const id = this.options.entityIdFor?.(mesh);
    if (id !== undefined) validateEntityId(id);
    return id ?? null;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const node of this.bindings.keys()) this.unregister(node);
  }
  private assertNode(node: Node): void {
    if (
      this.disposed ||
      this.scene.isDisposed ||
      !node ||
      node.isDisposed() ||
      node.getScene() !== this.scene
    )
      throw new Error('Picking requires a live local node');
  }
  private bind(node: Node, ids: Binding['ids']): void {
    if (!this.bindings.has(node) && this.bindings.size >= this.maxBindings)
      throw new Error('Picking binding capacity exceeded');
    this.unregister(node);
    const mesh = node instanceof Mesh ? node : null;
    const previous = mesh?.thinInstanceEnablePicking;
    if (mesh && Array.isArray(ids)) mesh.thinInstanceEnablePicking = true;
    const observer = node.onDisposeObservable.add(() => this.unregister(node));
    this.bindings.set(node, {
      ids,
      release: () => {
        node.onDisposeObservable.remove(observer);
        if (mesh && Array.isArray(ids) && mesh.thinInstanceEnablePicking === true)
          mesh.thinInstanceEnablePicking = previous!;
      },
    });
  }
}
