import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import { resolveCameraObstacles, type CameraObstacle } from '../camera-collision';
import {
  VehicleCameraController,
  type CameraPreferences,
  type CameraTarget,
  type VehicleCameraPose,
} from '../vehicle-camera';

export interface BabylonVehicleCameraOptions {
  readonly scene: Scene;
  readonly preferences: CameraPreferences;
  /** Supply only geometry that blocks the camera; omit the target exterior/cabin. */
  readonly obstacles: (selectedEntityId: string) => readonly AbstractMesh[];
  /** Exterior shell only. The cabin stays visible in first-person. */
  readonly exterior: (selectedEntityId: string) => readonly AbstractMesh[];
}

export class BabylonVehicleCamera {
  readonly controller: VehicleCameraController;
  readonly camera: FreeCamera;
  private readonly previousCamera;
  private readonly hidden = new Map<AbstractMesh, boolean>();
  private hiddenTarget: string | null = null;
  private disposed = false;
  constructor(private readonly options: BabylonVehicleCameraOptions) {
    this.controller = new VehicleCameraController(options.preferences);
    this.previousCamera = options.scene.activeCamera;
    this.camera = new FreeCamera('vehicle-camera', Vector3.Zero(), options.scene);
    this.camera.minZ = 0.05;
    this.camera.maxZ = 2000;
    // Default Babylon controls would translate the camera independently of the selected vehicle.
    this.camera.inputs.clear();
    options.scene.activeCamera = this.camera;
  }
  setPreferences(preferences: CameraPreferences): void {
    this.assertLive();
    this.controller.setPreferences(preferences);
  }
  select(entityId: string | null): void {
    this.assertLive();
    this.controller.select(entityId);
    this.restoreExterior();
  }
  update(target: CameraTarget | null, dtSeconds: number): VehicleCameraPose | null {
    this.assertLive();
    const boxes: CameraObstacle[] = [];
    if (target && target.entityId === this.controller.selectedEntityId) {
      for (const mesh of this.options.obstacles(target.entityId)) {
        if (mesh.isDisposed() || !mesh.isEnabled() || mesh.getScene() !== this.options.scene)
          continue;
        mesh.computeWorldMatrix(true);
        const bounds = mesh.getBoundingInfo().boundingBox;
        boxes.push({ min: bounds.minimumWorld, max: bounds.maximumWorld });
      }
    }
    const pose = this.controller.update(target, dtSeconds, (from, to, radius) =>
      resolveCameraObstacles(from, to, radius, boxes),
    );
    if (!pose) {
      this.restoreExterior();
      return null;
    }
    const exterior = this.options.exterior(pose.entityId);
    const overlapsExterior = exterior.some((mesh) => {
      if (mesh.isDisposed() || mesh.getScene() !== this.options.scene) return false;
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      return ['x', 'y', 'z'].every((axis) => {
        const key = axis as 'x' | 'y' | 'z';
        return (
          pose.positionM[key] > box.minimumWorld[key] - 0.2 &&
          pose.positionM[key] < box.maximumWorld[key] + 0.2
        );
      });
    });
    if (pose.mode === 'FIRST_PERSON' || overlapsExterior) {
      if (this.hiddenTarget !== pose.entityId) {
        this.restoreExterior();
        this.hiddenTarget = pose.entityId;
      }
      for (const mesh of exterior) {
        if (mesh.isDisposed() || mesh.getScene() !== this.options.scene || this.hidden.has(mesh))
          continue;
        this.hidden.set(mesh, mesh.isVisible);
        mesh.isVisible = false;
      }
    } else this.restoreExterior();
    this.camera.position.set(pose.positionM.x, pose.positionM.y, pose.positionM.z);
    this.camera.upVector.set(pose.up.x, pose.up.y, pose.up.z);
    this.camera.setTarget(new Vector3(pose.lookAtM.x, pose.lookAtM.y, pose.lookAtM.z));
    this.camera.fov = pose.fovRadians;
    return pose;
  }
  dispose(): void {
    if (this.disposed) return;
    this.restoreExterior();
    if (this.options.scene.activeCamera === this.camera)
      this.options.scene.activeCamera = this.previousCamera?.isDisposed()
        ? null
        : this.previousCamera;
    this.camera.dispose();
    this.disposed = true;
  }
  private restoreExterior(): void {
    for (const [mesh, visible] of this.hidden) if (!mesh.isDisposed()) mesh.isVisible = visible;
    this.hidden.clear();
    this.hiddenTarget = null;
  }
  private assertLive() {
    if (this.disposed || this.options.scene.isDisposed) throw new Error('Vehicle camera disposed');
  }
}
