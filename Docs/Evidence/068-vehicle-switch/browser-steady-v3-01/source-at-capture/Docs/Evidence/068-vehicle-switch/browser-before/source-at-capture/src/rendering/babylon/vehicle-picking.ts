import '@babylonjs/core/Culling/ray.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { VehiclePickingRegistry } from './vehicle-picking-registry';

export interface SelectVehicleIntent {
  readonly type: 'SELECT_VEHICLE';
  readonly entityId: string;
}
const owners = new WeakSet<Scene>();
/** One explicit nearest-hit scan per request; unregistered decor occludes vehicles. */
export class BabylonVehiclePicker {
  private disposed = false;
  private readonly previous: readonly boolean[];
  private readonly scene: Scene;
  private readonly registry: VehiclePickingRegistry;
  constructor(scene: Scene, registry: VehiclePickingRegistry) {
    this.scene = scene;
    this.registry = registry;
    if (scene.isDisposed || registry.scene !== scene)
      throw new Error('Picker requires the registry scene');
    if (owners.has(scene)) throw new Error('Scene already has a picking input owner');
    owners.add(scene);
    this.previous = [
      scene.skipPointerMovePicking,
      scene.skipPointerDownPicking,
      scene.skipPointerUpPicking,
    ];
    scene.skipPointerMovePicking = scene.skipPointerDownPicking = scene.skipPointerUpPicking = true;
  }
  pick(x: number, y: number): SelectVehicleIntent | null {
    if (this.disposed || this.scene.isDisposed) return null;
    if (![x, y].every(Number.isFinite)) throw new Error('Invalid picking coordinates');
    const engine = this.scene.getEngine();
    if (
      x < 0 ||
      y < 0 ||
      x >= engine.getRenderWidth() ||
      y >= engine.getRenderHeight() ||
      !this.scene.activeCamera
    )
      return null;
    const entityId = this.registry.resolve(
      this.scene.pick(x * engine.getHardwareScalingLevel(), y * engine.getHardwareScalingLevel()),
    );
    return entityId === null ? null : Object.freeze({ type: 'SELECT_VEHICLE', entityId });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    owners.delete(this.scene);
    // Restore only flags still carrying this owner's value. One picker owns scene input.
    if (!this.scene.isDisposed) {
      if (this.scene.skipPointerMovePicking) this.scene.skipPointerMovePicking = this.previous[0];
      if (this.scene.skipPointerDownPicking) this.scene.skipPointerDownPicking = this.previous[1];
      if (this.scene.skipPointerUpPicking) this.scene.skipPointerUpPicking = this.previous[2];
    }
  }
}
