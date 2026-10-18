import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { Node } from '@babylonjs/core/node';
import type { Scene } from '@babylonjs/core/scene';
import type { Material } from '@babylonjs/core/Materials/material';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import {
  validateEntityId,
  validateVisualIdentity,
  validateVisualTransform,
  type VisualTransform,
  type VisualVehicleState,
  type VisualWorldIdentity,
} from '../scene-contract';

export interface VisualRepresentation {
  /** Detached subtree. Ownership of nodes transfers only after successful create/replace. */
  readonly root: TransformNode;
  /** Exclusive resources, disposed separately without cascading into shared assets. */
  readonly ownedMaterials?: readonly Material[];
  readonly ownedTextures?: readonly BaseTexture[];
}
interface Entry {
  readonly node: TransformNode;
  representation: VisualRepresentation;
  tick: number;
}

/** Y-up, metres, left-handed, +Z forward/+X right. No simulation or domain writes. */
export class BabylonSceneAdapter {
  readonly root: TransformNode;
  private identity: VisualWorldIdentity;
  private readonly entries = new Map<string, Entry>();
  private readonly owners = new WeakMap<object, string>();
  // Bounded epoch history prevents a removed/reused ID from accepting an old pose.
  private readonly lastTicks = new Map<string, number>();
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    identity: VisualWorldIdentity,
    private readonly maxTrackedIdentities = 4096,
  ) {
    validateVisualIdentity(identity);
    if (!Number.isSafeInteger(maxTrackedIdentities) || maxTrackedIdentities < 1)
      throw new Error('Invalid visual identity capacity');
    if (scene.isDisposed || scene.useRightHandedSystem)
      throw new Error('Scene adapter requires a live left-handed scene');
    this.identity = { ...identity };
    this.root = new TransformNode('entity-scene-root', scene);
    this.root.rotationQuaternion = Quaternion.Identity();
  }

  get size(): number {
    return this.entries.size;
  }
  getNode(id: string): TransformNode | undefined {
    return this.entries.get(id)?.node;
  }

  create(
    id: string,
    representation: VisualRepresentation,
    transform: VisualTransform,
  ): TransformNode {
    this.assertLive();
    validateEntityId(id);
    validateVisualTransform(transform);
    if (this.entries.has(id)) throw new Error('Duplicate entityId');
    const prepared = this.prepare(id, representation);
    const node = new TransformNode(`entity:${id}`, this.scene);
    node.rotationQuaternion = Quaternion.Identity();
    node.parent = this.root;
    this.copyTransform(node, transform);
    prepared.root.parent = node;
    this.claim(id, prepared);
    this.entries.set(id, {
      node,
      representation: prepared,
      tick: (this.lastTicks.get(id) ?? -2) + 1,
    });
    return node;
  }

  replace(id: string, representation: VisualRepresentation): void {
    this.assertLive();
    const entry = this.requireEntry(id);
    // Validation precedes changes. Rejected candidates remain caller-owned and detached.
    const prepared = this.prepare(id, representation);
    prepared.root.parent = entry.node;
    const previous = entry.representation;
    this.claim(id, prepared);
    entry.representation = prepared;
    this.release(previous);
  }

  updateTransform(id: string, transform: VisualTransform): void {
    this.assertLive();
    validateVisualTransform(transform);
    this.copyTransform(this.requireEntry(id).node, transform);
  }

  /** Returns false for another session/epoch or a stale tick. Explicit reset controls reuse. */
  presentVehicle(state: VisualVehicleState): boolean {
    this.assertLive();
    validateVisualIdentity(state);
    validateEntityId(state.vehicleId);
    validateVisualTransform(state.transform);
    if (!Number.isSafeInteger(state.tick) || state.tick < 0) throw new Error('Invalid visual tick');
    if (
      state.sessionId !== this.identity.sessionId ||
      state.worldEpoch !== this.identity.worldEpoch
    )
      return false;
    const entry = this.requireEntry(state.vehicleId);
    if (state.tick < entry.tick) return false;
    if (!this.lastTicks.has(state.vehicleId) && this.lastTicks.size >= this.maxTrackedIdentities)
      throw new Error('Visual identity capacity reached; explicit world reset required');
    this.copyTransform(entry.node, state.transform);
    entry.tick = state.tick;
    this.lastTicks.set(state.vehicleId, state.tick);
    return true;
  }

  entityIdFor(node: Node | null): string | undefined {
    if (this.disposed || !node || node.isDisposed() || node.getScene() !== this.scene) return;
    let current: Node | null = node;
    while (current && current !== this.root) {
      const id = this.owners.get(current);
      if (id && this.entries.get(id)?.node === current && current.parent === this.root) return id;
      current = current.parent;
    }
    return;
  }

  remove(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.entries.delete(id);
    this.owners.delete(entry.node);
    this.release(entry.representation);
    entry.node.dispose(false, false);
    return true;
  }

  reset(identity: VisualWorldIdentity): void {
    this.assertLive();
    validateVisualIdentity(identity);
    if (
      identity.sessionId === this.identity.sessionId &&
      identity.worldEpoch <= this.identity.worldEpoch
    )
      throw new Error('World reset requires a new session or increasing epoch');
    for (const id of this.entries.keys()) this.remove(id);
    this.lastTicks.clear();
    this.identity = { ...identity };
  }

  dispose(): void {
    if (this.disposed) return;
    for (const id of this.entries.keys()) this.remove(id);
    this.root.dispose(false, false);
    this.lastTicks.clear();
    this.disposed = true;
  }

  private assertLive(): void {
    if (this.disposed || this.scene.isDisposed || this.root.isDisposed())
      throw new Error('Scene adapter disposed');
  }
  private requireEntry(id: string): Entry {
    const entry = this.entries.get(id);
    if (!entry || entry.node.isDisposed()) throw new Error('Unknown or disposed entity');
    return entry;
  }
  private copyTransform(node: TransformNode, transform: VisualTransform): void {
    const p = transform.positionM,
      q = transform.rotationQuaternion;
    node.position.set(p.x, p.y, p.z);
    node.rotationQuaternion!.set(q.x, q.y, q.z, q.w);
  }
  private prepare(id: string, input: VisualRepresentation): VisualRepresentation {
    const root = input?.root;
    if (
      !(root instanceof TransformNode) ||
      root.parent ||
      root.isDisposed() ||
      root.getScene() !== this.scene ||
      root === this.root
    )
      throw new Error('Representation requires a detached live local root');
    const nodes = [root, ...root.getDescendants(false)];
    if (
      nodes.some(
        (n) =>
          !(n instanceof TransformNode) ||
          n.isDisposed() ||
          n.getScene() !== this.scene ||
          this.owners.has(n),
      )
    )
      throw new Error('Invalid/owned subtree');
    const materials = [...(input.ownedMaterials ?? [])],
      textures = [...(input.ownedTextures ?? [])];
    const resources = [...materials, ...textures];
    if (new Set(resources).size !== resources.length || resources.some((r) => this.owners.has(r)))
      throw new Error('Duplicate or already owned resource');
    for (const material of materials) {
      if (
        material.getScene() !== this.scene ||
        !this.scene.materials.includes(material) ||
        this.scene.meshes.some((m) => m.material === material && !nodes.includes(m))
      )
        throw new Error('Owned material must be live, local and exclusive');
    }
    for (const texture of textures) {
      if (
        texture.getScene() !== this.scene ||
        !this.scene.textures.includes(texture) ||
        this.scene.materials.some(
          (m) => !materials.includes(m) && m.getActiveTextures().includes(texture),
        )
      )
        throw new Error('Owned texture must be live, local and exclusive');
    }
    // Refuse candidates that reference another representation's exclusively owned resources.
    for (const mesh of this.scene.meshes.filter((m) => nodes.includes(m))) {
      const material = mesh.material;
      if (
        material &&
        (material.getScene() !== this.scene || !this.scene.materials.includes(material))
      )
        throw new Error('Referenced material must be live and local');
      if (
        material
          ?.getActiveTextures()
          .some((t) => t.getScene() !== this.scene || !this.scene.textures.includes(t))
      )
        throw new Error('Referenced texture must be live and local');
      if (
        material &&
        (this.owners.has(material) || material.getActiveTextures().some((t) => this.owners.has(t)))
      )
        throw new Error(`Representation ${id} references an exclusive resource`);
    }
    return { root, ownedMaterials: materials, ownedTextures: textures };
  }
  private claim(id: string, representation: VisualRepresentation): void {
    for (const resource of [
      representation.root,
      ...representation.root.getDescendants(false),
      ...(representation.ownedMaterials ?? []),
      ...(representation.ownedTextures ?? []),
    ])
      this.owners.set(resource, id);
    const node = representation.root.parent;
    if (node) this.owners.set(node, id);
  }
  private release(representation: VisualRepresentation): void {
    for (const resource of [
      representation.root,
      ...representation.root.getDescendants(false),
      ...(representation.ownedMaterials ?? []),
      ...(representation.ownedTextures ?? []),
    ])
      this.owners.delete(resource);
    representation.root.dispose(false, false);
    for (const material of representation.ownedMaterials ?? []) material.dispose(false, false);
    for (const texture of representation.ownedTextures ?? []) texture.dispose();
  }
}
