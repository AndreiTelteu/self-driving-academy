import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { validateRenderSnapshot, type RenderSnapshot } from '../render-sync';
import type { BabylonSceneAdapter } from './scene-adapter';

export type WheelNodeResolver = (vehicleId: string, wheelId: string) => TransformNode | undefined;

/** Projects only into existing visual nodes. Entity lifecycle/reset belongs to the scene owner. */
export class BabylonSnapshotPresenter {
  private readonly neutral = Quaternion.Identity();
  private readonly steering = Quaternion.Identity();
  private readonly spin = Quaternion.Identity();
  private readonly combined = Quaternion.Identity();

  constructor(private readonly adapter: BabylonSceneAdapter) {}

  present(
    snapshot: RenderSnapshot | null,
    resolveWheel: WheelNodeResolver = () => undefined,
  ): number {
    if (!snapshot) return 0;
    validateRenderSnapshot(snapshot);
    let presented = 0;
    for (const vehicle of snapshot.vehicles) {
      const root = this.adapter.getNode(vehicle.vehicleId);
      if (!root) continue;
      // The adapter rejects stale ticks and wrong epochs before either body or wheels move.
      if (
        !this.adapter.presentVehicle({
          ...snapshot,
          vehicleId: vehicle.vehicleId,
          transform: vehicle.transform,
        })
      )
        continue;
      presented += 1;
      for (const wheel of vehicle.wheels) {
        const node = resolveWheel(vehicle.vehicleId, wheel.wheelId);
        if (
          !node ||
          node.isDisposed() ||
          node.getScene() !== root.getScene() ||
          !node.isDescendantOf(root)
        )
          continue;
        const p = wheel.transform.positionM,
          q = wheel.transform.rotationQuaternion;
        node.position.set(p.x, p.y, p.z);
        this.neutral.set(q.x, q.y, q.z, q.w);
        Quaternion.RotationYawPitchRollToRef(wheel.steeringRad, 0, 0, this.steering);
        Quaternion.RotationYawPitchRollToRef(0, wheel.spinRad, 0, this.spin);
        this.neutral.multiplyToRef(this.steering, this.combined);
        node.rotationQuaternion ??= Quaternion.Identity();
        this.combined.multiplyToRef(this.spin, node.rotationQuaternion);
      }
    }
    return presented;
  }
}
