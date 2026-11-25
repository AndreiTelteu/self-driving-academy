/**
 * PBI 254 — Babylon rig for the imported vehicle models (taxi / sedan).
 *
 * The GLB keeps the body and the four wheels as separate meshes in model space (no node
 * transforms; every tyre is an axis-aligned box around the axle). The rig rebuilds the PBI 145
 * contract on top of them:
 *
 * - `root` stays the authoritative node the caller positions; the model hangs under a holder
 *   rotated by +90° so the model's `-X` nose lands on the project `+Z` forward;
 * - four steering pivots sit at the tyre centres, each with a spin child rotating around the
 *   local X axle, so `applyWheels` keeps the exact suspension/steering semantics of the
 *   procedural rig;
 * - meshes are classified into the PBI 145 material groups, so LOD and light state only toggle
 *   visibility and never rebuild anything.
 *
 * Geometry is cloned per vehicle (the models are tiny); materials are cloned as well so a taxi
 * keeps its livery and every civilian car takes its own deterministic paint.
 */
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { VehicleClassKey, VehicleMaterialGroup } from '../vehicle-geometry';
import { vehiclePaintMultiplier } from '../vehicle-body';
import {
  VEHICLE_CONNECTION_Y_M,
  VEHICLE_LIGHTS_OFF,
  VEHICLE_REST_SPRING_M,
  vehicleVisualClass,
  visibleGroupsFor,
  type VehicleLightState,
  type VehicleLodLevel,
  type VehicleWheelId,
} from '../vehicle-visuals';
import type { GlbModelLibrary } from './glb-model-library';
import type { VehicleRenderWheel } from './vehicle-scene';

/** Tyre centre height and radius, measured from the GLB accessors. */
const MODEL_WHEEL_CENTRE_Y_M = 0.3;
/** The model nose points at -X; +90° around Y maps it onto the project +Z. */
const MODEL_YAW_RAD = Math.PI / 2;
const WHEEL_GROUPS: ReadonlySet<VehicleMaterialGroup> = new Set(['WHEEL', 'RIM']);

export interface GlbVehicleRig {
  readonly wheelPivots: readonly TransformNode[];
  readonly shadowCasters: readonly AbstractMesh[];
  readonly footprintM: Readonly<{ width: number; length: number }>;
  readonly meshes: number;
  readonly vertices: number;
  readonly indices: number;
  wheelMeshVisible(wheelId: string): boolean;
  applyLod(lod: VehicleLodLevel): void;
  applyWheels(wheels: readonly VehicleRenderWheel[]): void;
  setLights(state: VehicleLightState): void;
  /** PBI 252: 0 = zi, 1 = noapte; aprinde lentilele farurilor fără a schimba contractul 145. */
  setNightFactor(factor: number): void;
  dispose(): void;
}

export interface GlbVehicleRigOptions {
  readonly scene: Scene;
  readonly models: GlbModelLibrary;
  readonly entityId: string;
  readonly classId: VehicleClassKey;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly root: TransformNode;
}

function groupForName(name: string): VehicleMaterialGroup {
  const lower = name.toLowerCase();
  if (lower.includes('headlight')) return 'HEADLIGHT';
  if (lower.includes('rear lamp') || lower.includes('tail')) return 'TAILLIGHT';
  if (lower.includes('glazing') || lower.includes('glass')) return 'GLASS';
  if (lower.includes('tyre') || lower.includes('tire')) return 'WHEEL';
  if (lower.includes('hub') || lower.includes('rim')) return 'RIM';
  return 'BODY';
}

function materialOf(mesh: AbstractMesh): PBRMaterial | null {
  const material = mesh.material;
  return material instanceof PBRMaterial ? material : null;
}

function centreOf(mesh: AbstractMesh): Vector3 {
  mesh.computeWorldMatrix(true);
  return mesh.getBoundingInfo().boundingBox.centerWorld.clone();
}

function glbIdFor(driverKind: 'TAXI' | 'CIVILIAN'): string {
  return driverKind === 'TAXI' ? 'vehicle:taxi' : 'vehicle:sedan';
}

function meshList(entries: { rootNodes: readonly unknown[] }): AbstractMesh[] {
  const found: AbstractMesh[] = [];
  const add = (mesh: AbstractMesh): void => {
    if (!found.includes(mesh)) found.push(mesh);
  };
  for (const node of entries.rootNodes) {
    const candidate = node as unknown as AbstractMesh;
    if (typeof (candidate as { getTotalVertices?: unknown }).getTotalVertices === 'function')
      add(candidate);
    const children = (
      node as { getChildMeshes?: (directDescendantsOnly?: boolean) => AbstractMesh[] }
    ).getChildMeshes;
    if (typeof children === 'function') {
      for (const mesh of children.call(node, false)) add(mesh);
    }
  }
  return found;
}

/**
 * Build the rig under an existing vehicle root. Returns `null` when the model could not be
 * loaded or does not expose four wheels, so the caller can fall back to procedural geometry.
 */
export function createGlbVehicleRig(options: GlbVehicleRigOptions): GlbVehicleRig | null {
  const { scene, models, entityId, classId, driverKind, root } = options;
  const specification = vehicleVisualClass(classId);
  const restY = VEHICLE_CONNECTION_Y_M - VEHICLE_REST_SPRING_M;
  const entries = models.instantiate(glbIdFor(driverKind), scene, `vehicle:${entityId}`, {
    cloneMaterials: true,
  });
  if (!entries) return null;

  const meshes = meshList(entries);
  if (meshes.length === 0) return null;

  // Model-space extents, read before any reparenting (nodes carry no transform of their own).
  const modelMin = new Vector3(Infinity, Infinity, Infinity);
  const modelMax = new Vector3(-Infinity, -Infinity, -Infinity);
  const byGroup = new Map<VehicleMaterialGroup, AbstractMesh[]>();
  const wheelBuckets = new Map<string, AbstractMesh[]>();
  const wheelCentres = new Map<string, Vector3>();
  let vertices = 0;
  let indices = 0;
  for (const mesh of meshes) {
    vertices += mesh.getTotalVertices();
    indices += mesh instanceof Mesh ? mesh.getTotalIndices() : 0;
    mesh.isPickable = true;
    mesh.receiveShadows = true;
    mesh.alwaysSelectAsActiveMesh = true;
    const group = groupForName(mesh.name);
    if (WHEEL_GROUPS.has(group)) {
      const centre = centreOf(mesh);
      const key = `${centre.x < 0 ? 'L' : 'R'}:${centre.z < 0 ? 'B' : 'F'}`;
      const bucket = wheelBuckets.get(key) ?? [];
      bucket.push(mesh);
      wheelBuckets.set(key, bucket);
      // The tyre defines the axle; the hub follows the same centre.
      if (group === 'WHEEL' || !wheelCentres.has(key)) wheelCentres.set(key, centre);
      continue;
    }
    const bucket = byGroup.get(group) ?? [];
    bucket.push(mesh);
    byGroup.set(group, bucket);
    const box = mesh.getBoundingInfo().boundingBox;
    modelMin.minimizeInPlace(box.minimumWorld);
    modelMax.maximizeInPlace(box.maximumWorld);
  }

  const holder = new TransformNode(`vehicle:${entityId}:model`, scene);
  holder.parent = root;
  holder.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), MODEL_YAW_RAD);
  holder.position.y = restY - MODEL_WHEEL_CENTRE_Y_M;
  const holderMeshes: AbstractMesh[] = [];
  for (const [group, bucket] of byGroup) {
    if (WHEEL_GROUPS.has(group)) continue;
    holderMeshes.push(...bucket);
  }
  for (const mesh of holderMeshes) {
    mesh.parent = holder;
    mesh.position.setAll(0);
    mesh.rotationQuaternion = Quaternion.Identity();
  }

  const pivots = new Map<VehicleWheelId, TransformNode>();
  const spinNodes = new Map<VehicleWheelId, TransformNode>();
  const wheelMeshes = new Map<VehicleWheelId, AbstractMesh[]>();
  const rotation = Quaternion.RotationAxis(Vector3.Up(), MODEL_YAW_RAD);
  for (const [key, bucket] of wheelBuckets) {
    const centre = wheelCentres.get(key);
    if (!centre) continue;
    // Model -X is forward and model Z is lateral, so the project axes are (z, y, -x).
    const localX = centre.z;
    const localZ = -centre.x;
    const lateral = localX >= 0 ? 'right' : 'left';
    const longitudinal = localZ >= 0 ? 'front' : 'rear';
    const wheelId = `${longitudinal}-${lateral}` as VehicleWheelId;
    if (pivots.has(wheelId)) continue;
    const pivot = new TransformNode(`vehicle:${entityId}:wheel-pivot:${wheelId}`, scene);
    pivot.parent = root;
    pivot.position.set(localX, centre.y + holder.position.y, localZ);
    pivot.rotationQuaternion = Quaternion.Identity();
    const spin = new TransformNode(`vehicle:${entityId}:wheel-spin:${wheelId}`, scene);
    spin.parent = pivot;
    spin.rotationQuaternion = Quaternion.Identity();
    for (const mesh of bucket) {
      mesh.parent = spin;
      mesh.rotationQuaternion = rotation.clone();
      mesh.position.setAll(0);
      mesh.setPivotMatrix(Matrix.Translation(-centre.x, -centre.y, -centre.z), false);
    }
    pivots.set(wheelId, pivot);
    spinNodes.set(wheelId, spin);
    wheelMeshes.set(wheelId, bucket);
  }
  if (pivots.size !== specification.wheelPivots.length) {
    for (const pivot of pivots.values()) pivot.dispose(false, false);
    for (const mesh of meshes) if (!mesh.isDisposed()) mesh.dispose(false, false);
    holder.dispose(false, false);
    return null;
  }

  const ownedMaterials = new Set<Material>();
  for (const mesh of meshes) if (mesh.material) ownedMaterials.add(mesh.material);
  if (driverKind !== 'TAXI') {
    const paint = vehiclePaintMultiplier(classId, entityId, driverKind);
    for (const mesh of byGroup.get('BODY') ?? []) {
      const material = materialOf(mesh);
      if (!material) continue;
      material.albedoColor = new Color3(paint[0], paint[1], paint[2]);
    }
  }
  const headlightMaterials: PBRMaterial[] = [];
  for (const mesh of byGroup.get('HEADLIGHT') ?? []) {
    const material = materialOf(mesh);
    if (material && !headlightMaterials.includes(material)) headlightMaterials.push(material);
  }
  const taillightMaterials: PBRMaterial[] = [];
  for (const mesh of byGroup.get('TAILLIGHT') ?? []) {
    const material = materialOf(mesh);
    if (material && !taillightMaterials.includes(material)) taillightMaterials.push(material);
  }
  for (const mesh of byGroup.get('GLASS') ?? []) {
    const material = materialOf(mesh);
    if (!material) continue;
    material.alpha = 0.62;
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    material.backFaceCulling = true;
    material.metallic = 0.05;
    material.roughness = 0.08;
  }

  // Width runs along the model Z axis, length along the model X axis.
  const footprintM = Object.freeze({
    width: Number.isFinite(modelMin.z) ? modelMax.z - modelMin.z : 2.02,
    length: Number.isFinite(modelMin.x) ? modelMax.x - modelMin.x : 4.09,
  });
  const bodyMeshes = byGroup.get('BODY') ?? [];
  const shadowCasters = bodyMeshes.length > 0 ? bodyMeshes : holderMeshes.slice(0, 1);

  let lod: VehicleLodLevel = 'NEAR';
  let lights: VehicleLightState = VEHICLE_LIGHTS_OFF;
  let nightFactor = 0;
  const applyVisibility = (): void => {
    const visible = new Set(visibleGroupsFor(classId, lod));
    for (const [group, bucket] of byGroup) {
      const enabled = visible.has(group);
      for (const mesh of bucket) mesh.setEnabled(enabled);
    }
    const wheelsVisible =
      specification.lods.find((entry) => entry.level === lod)?.wheelsVisible ?? false;
    for (const bucket of wheelMeshes.values()) {
      for (const mesh of bucket) mesh.setEnabled(wheelsVisible);
    }
    for (const material of headlightMaterials) {
      // Ziua lentila este stinsă; noaptea emite cald, iar `setLights` rămâne prioritar.
      material.emissiveColor = lights.headlights
        ? new Color3(1.6, 1.5, 1.24)
        : new Color3(
            0.16 + 2.1 * nightFactor,
            0.16 + 1.75 * nightFactor,
            0.15 + 1.05 * nightFactor,
          );
    }
    for (const material of taillightMaterials) {
      material.emissiveColor = lights.brake
        ? new Color3(1, 0.08, 0.05)
        : new Color3(0.32, 0.03, 0.02);
    }
  };

  const rig: GlbVehicleRig = {
    wheelPivots: Object.freeze([...pivots.values()]),
    shadowCasters: Object.freeze(shadowCasters),
    footprintM,
    meshes: meshes.length,
    vertices,
    indices,
    wheelMeshVisible: (wheelId) => {
      const bucket = wheelMeshes.get(wheelId as VehicleWheelId);
      return !!bucket && bucket.every((mesh) => mesh.isEnabled());
    },
    applyLod(level) {
      lod = level;
      applyVisibility();
    },
    applyWheels(wheels) {
      for (const pose of wheels) {
        const pivot = pivots.get(pose.wheelId as VehicleWheelId);
        const spin = spinNodes.get(pose.wheelId as VehicleWheelId);
        if (!pivot || !spin) continue;
        const point = pose.transform.positionM;
        pivot.position.set(point.x, point.y, point.z);
        pivot.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), pose.steeringRad);
        spin.rotationQuaternion = Quaternion.RotationAxis(Vector3.Right(), pose.spinRad);
      }
    },
    setLights(state) {
      lights = Object.freeze({
        headlights: !!state.headlights,
        brake: !!state.brake,
        turn: state.turn,
      });
      applyVisibility();
    },
    setNightFactor(factor) {
      if (!(factor >= 0 && factor <= 1)) throw new RangeError('Night factor out of range');
      nightFactor = factor;
      applyVisibility();
    },
    dispose() {
      for (const material of ownedMaterials) material.dispose(false, false);
      ownedMaterials.clear();
      for (const pivot of pivots.values()) if (!pivot.isDisposed()) pivot.dispose(false, false);
      for (const mesh of meshes) if (!mesh.isDisposed()) mesh.dispose(false, false);
      if (!holder.isDisposed()) holder.dispose(false, false);
    },
  };
  applyVisibility();
  return rig;
}
