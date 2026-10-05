import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { VehiclePickingRegistry } from './vehicle-picking-registry';
import { RENDER_ASSET_CAPS } from '../asset-budgets';
import type { QualityPreset } from '../quality-policy';
import { QUALITY_PRESETS } from '../quality-policy';

export interface BatchInstance {
  readonly entityId: string | null;
  readonly matrix: Matrix;
}
export interface CellBatchDefinition {
  readonly id: string;
  readonly cell: string;
  readonly source: Mesh;
  readonly distantSource?: Mesh;
  readonly dynamic: boolean;
  /** Explicit static declaration; cloned material belongs to this owner. */
  readonly staticMaterial?: boolean;
  readonly instances: readonly BatchInstance[];
}
interface Batch {
  definition: CellBatchDefinition;
  near: Mesh;
  far: Mesh | null;
  materials: Material[];
  center: Vector3;
  radius: number;
  distant: boolean;
  nearMatrices: Float32Array;
  farMatrices: Float32Array | null;
}
/** Bounded scene-local presentation owner. Never accepts authoritative state or simulation services. */
export class BabylonCellBatches {
  private readonly batches = new Map<string, Batch>();
  private disposed = false;
  readonly scene: Scene;
  readonly picking: VehiclePickingRegistry;
  constructor(scene: Scene, picking: VehiclePickingRegistry) {
    this.scene = scene;
    this.picking = picking;
    if (scene.isDisposed || picking.scene !== scene)
      throw new Error('Foreign/disposed batch scene');
  }
  get metrics() {
    return {
      cells: new Set([...this.batches.values()].map((b) => b.definition.cell)).size,
      batches: this.batches.size,
      instances: [...this.batches.values()].reduce((n, b) => n + b.definition.instances.length, 0),
      distantBatches: [...this.batches.values()].filter((b) => b.distant).length,
      meshes: [...this.batches.values()].reduce((n, b) => n + 1 + Number(!!b.far), 0),
      frozenMaterials: [...this.batches.values()].reduce((n, b) => n + b.materials.length, 0),
      matrixBufferBytes: [...this.batches.values()].reduce(
        (n, b) => n + b.nearMatrices.byteLength + (b.farMatrices?.byteLength ?? 0),
        0,
      ),
    };
  }
  add(definition: CellBatchDefinition): void {
    this.assertLive();
    if (!definition.id.trim() || !definition.cell.trim() || this.batches.has(definition.id))
      throw new Error('Invalid/duplicate batch');
    this.validate(definition);
    if (this.batches.size >= RENDER_ASSET_CAPS.maxBatches) throw new Error('Batch capacity');
    const cells = new Set([...this.batches.values()].map((b) => b.definition.cell));
    cells.add(definition.cell);
    if (cells.size > RENDER_ASSET_CAPS.maxCells) throw new Error('Cell capacity');
    const materials: Material[] = [];
    const clone = (source: Mesh, suffix: string): Mesh => {
      const mesh = source.clone(`batch:${definition.id}:${suffix}`, null, true);
      if (!mesh) throw new Error('Cannot clone batch source');
      // Babylon stores thin-instance vertex attributes on Geometry. Each host
      // needs its own geometry so near/far and neighbouring batches cannot
      // overwrite each other's matrix vertex buffers when their counts differ.
      mesh.makeGeometryUnique();
      mesh.setEnabled(true);
      mesh.position.setAll(0);
      mesh.rotation.setAll(0);
      mesh.rotationQuaternion = null;
      mesh.scaling.setAll(1);
      if (definition.staticMaterial && !definition.dynamic && source.material) {
        const material = source.material.clone(`${mesh.name}:static`);
        if (!material) {
          mesh.dispose();
          throw new Error('Cannot clone static material');
        }
        material.freeze();
        materials.push(material);
        mesh.material = material;
      }
      if (!definition.dynamic) mesh.freezeWorldMatrix();
      return mesh;
    };
    const near = clone(definition.source, 'near');
    let far: Mesh | null = null;
    try {
      far = definition.distantSource ? clone(definition.distantSource, 'far') : null;
      const batch: Batch = {
        definition,
        near,
        far,
        materials,
        center: Vector3.Zero(),
        radius: 0,
        distant: false,
        nearMatrices: new Float32Array(0),
        farMatrices: null,
      };
      this.install(batch, definition.instances);
      far?.setEnabled(false);
      this.batches.set(definition.id, batch);
    } catch (error) {
      this.picking.unregister(near);
      near.dispose(false, false);
      if (far) {
        this.picking.unregister(far);
        far.dispose(false, false);
      }
      for (const material of materials) material.dispose(false, false);
      throw error;
    }
  }
  /** Complete transform and identity replacement in one synchronous operation, including same-count reorder. */
  update(id: string, instances: readonly BatchInstance[]): void {
    this.assertLive();
    const batch = this.batches.get(id);
    if (!batch || !batch.definition.dynamic) throw new Error('Only dynamic batches update');
    const next = { ...batch.definition, instances };
    this.validate(next, id);
    this.install(batch, instances);
  }
  updateLod(camera: Vector3, preset: QualityPreset): void {
    this.assertLive();
    if (![camera.x, camera.y, camera.z].every(Number.isFinite))
      throw new Error('Invalid LOD camera');
    const distance = QUALITY_PRESETS[preset]?.lodDistance;
    if (!distance) throw new Error('Invalid LOD preset');
    for (const batch of this.batches.values()) {
      if (!batch.far) continue;
      // Conservative nearest edge plus hysteresis; broad cells never discard nearby detail.
      const nearest = Math.max(0, Vector3.Distance(camera, batch.center) - batch.radius);
      const distant = nearest > distance + (batch.distant ? -5 : 5);
      batch.near.setEnabled(!distant);
      batch.far.setEnabled(distant);
      batch.distant = distant;
    }
  }
  /** Motion-only path retains identity order and reuses GPU submission buffers. */
  updateTransforms(id: string, matrices: readonly Matrix[]): void {
    this.assertLive();
    const batch = this.batches.get(id);
    if (
      !batch ||
      !batch.definition.dynamic ||
      matrices.length !== batch.definition.instances.length
    )
      throw new Error('Transform update requires unchanged dynamic instance order/count');
    for (const matrix of matrices)
      if (!matrix || !Array.from(matrix.m).every(Number.isFinite))
        throw new Error('Invalid batch transform');
    matrices.forEach((matrix, index) => {
      matrix.copyToArray(batch.nearMatrices, index * 16);
      if (batch.farMatrices) matrix.copyToArray(batch.farMatrices, index * 16);
      batch.definition.instances[index].matrix.copyFrom(matrix);
    });
    for (const mesh of [batch.near, batch.far])
      if (mesh) {
        mesh.thinInstanceBufferUpdated('matrix');
        mesh.thinInstanceRefreshBoundingInfo(true);
      }
    this.updateBounds(batch);
  }
  remove(id: string): boolean {
    const batch = this.batches.get(id);
    if (!batch) return false;
    this.batches.delete(id);
    for (const mesh of [batch.near, batch.far])
      if (mesh) {
        this.picking.unregister(mesh);
        mesh.dispose(false, false);
      }
    for (const material of batch.materials) material.dispose(false, false);
    return true;
  }
  dispose(): void {
    if (this.disposed) return;
    for (const id of this.batches.keys()) this.remove(id);
    this.disposed = true;
  }
  private validate(definition: CellBatchDefinition, replacing?: string): void {
    for (const source of [definition.source, definition.distantSource])
      if (
        source &&
        (source.isDisposed() || source.getScene() !== this.scene || source.hasThinInstances)
      )
        throw new Error('Batch source must be live local non-thin mesh');
    for (const source of [definition.source, definition.distantSource])
      if (source?.material && source.material.getScene() !== this.scene)
        throw new Error('Batch source material must belong to the local scene');
    if (
      definition.instances.length < 1 ||
      definition.instances.length > RENDER_ASSET_CAPS.maxPerBatch
    )
      throw new Error('Batch instance capacity');
    const total =
      this.metrics.instances -
      (replacing ? this.batches.get(replacing)!.definition.instances.length : 0) +
      definition.instances.length;
    if (total > RENDER_ASSET_CAPS.maxInstances) throw new Error('Total batch instance capacity');
    const ids = new Set<string>();
    for (const instance of definition.instances) {
      if (instance.entityId !== null) {
        if (!instance.entityId.trim() || ids.has(instance.entityId))
          throw new Error('Invalid/duplicate batch entity');
        ids.add(instance.entityId);
      }
      if (!instance.matrix || !Array.from(instance.matrix.m).every(Number.isFinite))
        throw new Error('Invalid batch transform');
    }
  }
  private install(batch: Batch, instances: readonly BatchInstance[]): void {
    // Copy caller-owned arrays and matrices: later mutation cannot silently corrupt identity.
    const copied = instances.map((i) =>
      Object.freeze({ entityId: i.entityId, matrix: i.matrix.clone() }),
    );
    const matrices = new Float32Array(copied.length * 16);
    copied.forEach((i, index) => i.matrix.copyToArray(matrices, index * 16));
    const entityIds = copied.map((i) => i.entityId);
    this.picking.validateThinBatchTransaction(
      [batch.near, batch.far]
        .filter((mesh): mesh is Mesh => mesh !== null)
        .map((mesh) => ({ mesh, entityIds })),
    );
    for (const mesh of [batch.near, batch.far])
      if (mesh) {
        const buffer = matrices.slice();
        if (mesh === batch.near) batch.nearMatrices = buffer;
        else batch.farMatrices = buffer;
        // Replacing a vertex buffer/count must invalidate WebGPU render bundles.
        // Motion-only uploads retain buffers and avoid this infrequent reset.
        mesh.resetDrawCache();
        mesh.thinInstanceSetBuffer('matrix', buffer, 16, !batch.definition.dynamic);
        mesh.thinInstanceRefreshBoundingInfo(true);
        this.picking.registerThinBatch(mesh, entityIds);
      }
    batch.definition = { ...batch.definition, instances: Object.freeze(copied) };
    this.updateBounds(batch);
  }
  private updateBounds(batch: Batch): void {
    const copied = batch.definition.instances;
    batch.center.setAll(0);
    for (const i of copied) batch.center.addInPlace(i.matrix.getTranslation());
    batch.center.scaleInPlace(1 / copied.length);
    // Bound arbitrary source geometry, scale and shear rather than assuming a
    // five-metre primitive. Frobenius norm conservatively bounds linear stretch.
    const sourceRadius = Math.max(
      ...[batch.definition.source, batch.definition.distantSource]
        .filter((source): source is Mesh => !!source)
        .map((source) => {
          const sphere = source.getBoundingInfo().boundingSphere;
          return sphere.radius + sphere.center.length();
        }),
    );
    batch.radius = Math.max(
      ...copied.map((instance) => {
        const m = instance.matrix.m;
        const stretch = Math.hypot(m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]);
        return (
          Vector3.Distance(batch.center, instance.matrix.getTranslation()) + sourceRadius * stretch
        );
      }),
    );
  }
  private assertLive(): void {
    if (this.disposed || this.scene.isDisposed) throw new Error('Cell batches disposed');
  }
}
