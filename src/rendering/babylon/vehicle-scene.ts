/**
 * PBI 145 — Babylon presentation for the two vehicle classes.
 *
 * A representation owns a detached root, four wheel pivot nodes and one merged mesh per material
 * group. LOD switches visibility only: nodes, wheel pivots and the entity ID mapping are never
 * recreated, and no collider, body or simulation service is touched. The stage keeps an explicit
 * `entityId` → representation map so picking stays stable across LOD changes.
 */
import '@babylonjs/core/Meshes/instancedMesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Node } from '@babylonjs/core/node.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { VisualTransform } from '../scene-contract';
import type { QualityPreset } from '../quality-policy';
import {
  buildVehicleGeometry,
  type VehicleClassKey,
  type VehicleGeometrySet,
  type VehicleMaterialGroup,
} from '../vehicle-geometry';
import {
  VEHICLE_LIGHTS_OFF,
  selectVehicleLod,
  vehicleDrawCalls,
  vehicleVisualClass,
  visibleGroupsFor,
  type VehicleLightState,
  type VehicleLodLevel,
} from '../vehicle-visuals';
import {
  createVehicleMaterials,
  type VehicleMaterialKey,
  type VehicleMaterialSet,
} from './vehicle-materials';
import { vehiclePaintMultiplier } from '../vehicle-body';
import type { GlbModelLibrary } from './glb-model-library';
import { createGlbVehicleRig } from './vehicle-glb';

export type { VehicleMaterialKey } from './vehicle-materials';
export interface VehicleVisualOptions {
  readonly preset: QualityPreset;
  /** Optional caller-owned materials; listed keys are borrowed and never disposed here. */
  readonly materials?: Partial<
    Readonly<Record<VehicleMaterialKey, StandardMaterial | PBRMaterial>>
  >;
  /**
   * PBI 254: realistic GLB models. When present the representation is built from the imported
   * taxi/sedan; when absent (headless tests, model load failure) the procedural rig is used.
   */
  readonly models?: GlbModelLibrary;
}
export interface VehicleRenderWheel {
  readonly wheelId: string;
  readonly transform: VisualTransform;
  readonly spinRad: number;
  readonly steeringRad: number;
}
export interface VehicleRepresentationMetrics {
  readonly meshes: number;
  readonly vertices: number;
  readonly indices: number;
  readonly drawCalls: number;
  readonly lod: VehicleLodLevel;
}
export interface VehicleRepresentation {
  readonly entityId: string;
  readonly classId: VehicleClassKey;
  readonly root: TransformNode;
  readonly lod: VehicleLodLevel;
  readonly lights: VehicleLightState;
  readonly wheelPivots: readonly TransformNode[];
  /** PBI 244: meshurile care aruncă umbră (caroseria; roțile sunt instanțe și nu intră în hartă). */
  readonly shadowCasters: readonly AbstractMesh[];
  /** PBI 244: dimensiunile locale ale amprentei (m), pentru umbra de contact de pe LOW. */
  readonly footprintM: Readonly<{ width: number; length: number }>;
  wheelPivot(wheelId: string): TransformNode | undefined;
  /** Visibility of the wheel mesh (the pivot node itself always keeps its identity). */
  wheelMeshVisible(wheelId: string): boolean;
  /** Idempotent visibility switch; never recreates nodes or changes the entity ID. */
  setLod(level: VehicleLodLevel): void;
  /** Pivots follow the physical suspension/steering; wheels spin around +X. */
  applyWheels(wheels: readonly VehicleRenderWheel[]): void;
  setLights(state: VehicleLightState): void;
  setTransform(transform: VisualTransform): void;
  readonly metrics: VehicleRepresentationMetrics;
  dispose(): void;
}
export interface VehicleVisualMetrics {
  readonly materials: number;
  readonly shaderVariants: number;
  readonly classes: number;
  readonly vehicles: number;
  readonly meshes: number;
  readonly drawCalls: number;
  readonly vertices: number;
  readonly lodCounts: Readonly<Record<VehicleLodLevel, number>>;
}
export interface VehicleVisualStage {
  readonly size: number;
  readonly metrics: VehicleVisualMetrics;
  create(
    entityId: string,
    classId: VehicleClassKey,
    transform: VisualTransform,
    driverKind?: 'TAXI' | 'CIVILIAN',
  ): VehicleRepresentation;
  get(entityId: string): VehicleRepresentation | undefined;
  remove(entityId: string): boolean;
  /** Walks the scene graph; a LOD change never breaks this mapping. */
  entityIdFor(node: Node | null): string | undefined;
  updateLod(cameraPosition: Vector3, preset?: QualityPreset): void;
  dispose(): void;
}
const LIGHT_GROUPS = [
  'BODY',
  'GLASS',
  'HEADLIGHT',
  'TAILLIGHT',
  'BRAKE',
  'SIGNAL_LEFT',
  'SIGNAL_RIGHT',
] as const;
const MATERIALS: readonly VehicleMaterialKey[] = [
  'body',
  'glass',
  'tire',
  'rim',
  'trim',
  'headlight',
  'taillight',
  'signal',
];
const GROUP_MATERIAL: Readonly<
  Record<Exclude<VehicleMaterialGroup, 'WHEEL' | 'RIM'>, VehicleMaterialKey>
> = Object.freeze({
  BODY: 'body',
  GLASS: 'glass',
  HEADLIGHT: 'headlight',
  TAILLIGHT: 'taillight',
  BRAKE: 'taillight',
  SIGNAL_LEFT: 'signal',
  SIGNAL_RIGHT: 'signal',
});
function createGroupMesh(
  scene: Scene,
  name: string,
  geometry: VehicleGeometrySet,
  group: VehicleMaterialGroup,
  material: StandardMaterial | PBRMaterial,
): Mesh | null {
  const source = geometry.groups.find((entry) => entry.group === group);
  if (!source) return null;
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = [...source.positions];
  data.indices = [...source.indices];
  data.colors = [...source.colors];
  data.normals = [...source.normals];
  data.applyToMesh(mesh);
  mesh.material = material;
  mesh.isPickable = true;
  // PBI 244: o mașină în umbra unei clădiri trebuie să se întunece și ea.
  mesh.receiveShadows = true;
  return mesh;
}
function copyTransform(node: TransformNode, transform: VisualTransform): void {
  const p = transform.positionM;
  const q = transform.rotationQuaternion;
  node.position.set(p.x, p.y, p.z);
  node.rotationQuaternion!.set(q.x, q.y, q.z, q.w);
}
export function createVehicleVisualStage(
  scene: Scene,
  options: VehicleVisualOptions,
): VehicleVisualStage {
  if (!scene || scene.isDisposed) throw new Error('Vehicle visuals require a live scene');
  const preset = options.preset;
  const materials = new Map<VehicleMaterialKey, StandardMaterial | PBRMaterial>();
  const owned: Array<StandardMaterial | PBRMaterial> = [];
  const createdSet: VehicleMaterialSet | null = (() => {
    const missing = MATERIALS.filter((key) => !options.materials?.[key]);
    if (missing.length === 0) return null;
    return createVehicleMaterials(scene, preset);
  })();
  for (const key of MATERIALS) {
    const supplied = options.materials?.[key];
    if (supplied) {
      if (supplied.getScene() !== scene)
        throw new Error('Vehicle materials must be live and scene-local');
      materials.set(key, supplied);
      continue;
    }
    const created = createdSet!.materials[key];
    materials.set(key, created);
    owned.push(created);
  }
  const geometryCache = new Map<string, VehicleGeometrySet>();
  const geometryFor = (
    classId: VehicleClassKey,
    lod: VehicleLodLevel,
    entityId: string,
    driverKind: 'TAXI' | 'CIVILIAN',
  ): VehicleGeometrySet => {
    const key = `${classId}:${lod}:${entityId}:${driverKind}`;
    const existing = geometryCache.get(key);
    if (existing) return existing;
    const built = buildVehicleGeometry(classId, lod, entityId, driverKind);
    geometryCache.set(key, built);
    return built;
  };
  const entries = new Map<string, VehicleRepresentation>();
  const rootByEntity = new Map<TransformNode, string>();
  let disposed = false;
  const assertLive = (): void => {
    if (disposed || scene.isDisposed) throw new Error('Vehicle visuals disposed');
  };
  // PBI 247: repaint the BODY vertex colours with the deterministic taxi/civilian multiplier.
  const repaintBody = (mesh: Mesh, multiplier: readonly [number, number, number]): void => {
    const colors = mesh.getVerticesData('color');
    if (!colors) return;
    for (let index = 0; index < colors.length; index += 4) {
      colors[index] *= multiplier[0];
      colors[index + 1] *= multiplier[1];
      colors[index + 2] *= multiplier[2];
    }
    mesh.updateVerticesData('color', colors);
  };
  const stage: VehicleVisualStage = {
    get size() {
      return entries.size;
    },
    get metrics(): VehicleVisualMetrics {
      const lodCounts: Record<VehicleLodLevel, number> = { NEAR: 0, MID: 0, FAR: 0 };
      let meshes = 0;
      let drawCalls = 0;
      let vertices = 0;
      for (const representation of entries.values()) {
        lodCounts[representation.lod] += 1;
        meshes += representation.metrics.meshes;
        drawCalls += representation.metrics.drawCalls;
        vertices += representation.metrics.vertices;
      }
      return Object.freeze({
        materials: materials.size,
        shaderVariants: materials.size * 2,
        classes: 2,
        vehicles: entries.size,
        meshes,
        drawCalls,
        vertices,
        lodCounts: Object.freeze(lodCounts),
      });
    },
    create(entityId, classId, transform, _driverKind = 'CIVILIAN') {
      assertLive();
      if (!entityId.trim() || entries.has(entityId))
        throw new Error(`Invalid/duplicate vehicle entity ID ${entityId}`);
      const specification = vehicleVisualClass(classId);
      const root = new TransformNode(`vehicle:${entityId}`, scene);
      root.rotationQuaternion = Quaternion.Identity();
      copyTransform(root, transform);
      const rig = options.models
        ? createGlbVehicleRig({
            scene,
            models: options.models,
            entityId,
            classId,
            driverKind: _driverKind,
            root,
          })
        : null;
      if (rig) {
        let glbLod: VehicleLodLevel = 'NEAR';
        let glbLights: VehicleLightState = VEHICLE_LIGHTS_OFF;
        const glbRepresentation: VehicleRepresentation = {
          entityId,
          classId,
          root,
          get lod() {
            return glbLod;
          },
          get lights() {
            return glbLights;
          },
          wheelPivots: rig.wheelPivots,
          shadowCasters: rig.shadowCasters,
          footprintM: rig.footprintM,
          wheelPivot: (wheelId) => rig.wheelPivots.find((pivot) => pivot.name.endsWith(wheelId)),
          wheelMeshVisible: (wheelId) => rig.wheelMeshVisible(wheelId),
          setLod(level) {
            if (disposed) return;
            if (!['NEAR', 'MID', 'FAR'].includes(level))
              throw new RangeError(`Unknown LOD ${level}`);
            if (glbLod === level) return;
            glbLod = level;
            rig.applyLod(level);
          },
          applyWheels(wheels) {
            if (disposed) return;
            if (wheels.length !== specification.wheelPivots.length)
              throw new RangeError('Vehicle wheel pose count');
            rig.applyWheels(wheels);
          },
          setLights(state) {
            if (disposed) return;
            glbLights = Object.freeze({
              headlights: !!state.headlights,
              brake: !!state.brake,
              turn: state.turn,
            });
            rig.setLights(glbLights);
          },
          setTransform(next) {
            if (disposed) return;
            copyTransform(root, next);
          },
          get metrics(): VehicleRepresentationMetrics {
            return Object.freeze({
              meshes: rig.meshes,
              vertices: rig.vertices,
              indices: rig.indices,
              drawCalls: vehicleDrawCalls(glbLod, glbLights),
              lod: glbLod,
            });
          },
          dispose() {
            if (!entries.has(entityId)) return;
            entries.delete(entityId);
            rootByEntity.delete(root);
            rig.dispose();
            if (!root.isDisposed()) root.dispose(false, false);
          },
        };
        entries.set(entityId, glbRepresentation);
        rootByEntity.set(root, entityId);
        return glbRepresentation;
      }
      const near = geometryFor(classId, 'NEAR', entityId, _driverKind);
      const groupMeshes = new Map<VehicleMaterialGroup, Mesh>();
      for (const group of LIGHT_GROUPS) {
        const mesh = createGroupMesh(
          scene,
          `vehicle:${entityId}:${group.toLowerCase()}`,
          near,
          group,
          materials.get(GROUP_MATERIAL[group])!,
        );
        if (!mesh) continue;
        mesh.parent = root;
        groupMeshes.set(group, mesh);
      }
      // PBI 247: the shared BODY material stays white; the paint comes from the vertex colours.
      // Taxi/civilian repaint the BODY group with the deterministic multiplier from the plan.
      const bodyMesh = groupMeshes.get('BODY');
      if (bodyMesh) {
        const paint = vehiclePaintMultiplier(classId, entityId, _driverKind);
        repaintBody(bodyMesh, paint);
      }
      const wheelGeometry = near.wheel;
      if (!wheelGeometry) throw new Error('Vehicle wheel geometry missing');
      const wheelTemplate = createGroupMesh(
        scene,
        `vehicle:${entityId}:wheel-template`,
        near,
        'WHEEL',
        materials.get('tire')!,
      );
      if (!wheelTemplate) throw new Error('Vehicle wheel mesh missing');
      const rimTemplate = createGroupMesh(
        scene,
        `vehicle:${entityId}:rim-template`,
        near,
        'RIM',
        materials.get('rim')!,
      );
      const pivots = new Map<string, TransformNode>();
      const wheelMeshes: AbstractMesh[] = [];
      const rimMeshes: AbstractMesh[] = [];
      for (let index = 0; index < specification.wheelPivots.length; index += 1) {
        const pivot = specification.wheelPivots[index]!;
        const node = new TransformNode(`vehicle:${entityId}:wheel-pivot:${pivot.wheelId}`, scene);
        node.position.set(pivot.x, pivot.y, pivot.z);
        node.rotationQuaternion = Quaternion.Identity();
        node.parent = root;
        pivots.set(pivot.wheelId, node);
        let wheel: AbstractMesh;
        if (index === 0) {
          wheel = wheelTemplate;
          wheel.name = `vehicle:${entityId}:wheel:${pivot.wheelId}`;
        } else {
          wheel = wheelTemplate.createInstance(`vehicle:${entityId}:wheel:${pivot.wheelId}`);
        }
        wheel.parent = node;
        wheel.position.setAll(0);
        wheel.rotationQuaternion = Quaternion.Identity();
        wheelMeshes.push(wheel);
        if (rimTemplate) {
          const rim =
            index === 0
              ? (() => {
                  rimTemplate.name = `vehicle:${entityId}:rim:${pivot.wheelId}`;
                  return rimTemplate as AbstractMesh;
                })()
              : rimTemplate.createInstance(`vehicle:${entityId}:rim:${pivot.wheelId}`);
          rim.parent = node;
          rim.position.setAll(0);
          rim.rotationQuaternion = Quaternion.Identity();
          rimMeshes.push(rim);
        }
      }
      const bodyBox = groupMeshes.get('BODY')?.getBoundingInfo().boundingBox;
      const footprintM = Object.freeze({
        width: bodyBox ? bodyBox.maximum.x - bodyBox.minimum.x : 1.8,
        length: bodyBox ? bodyBox.maximum.z - bodyBox.minimum.z : 4.4,
      });
      let lod: VehicleLodLevel = 'NEAR';
      let lights: VehicleLightState = VEHICLE_LIGHTS_OFF;
      const applyVisibility = (): void => {
        const visible = new Set(visibleGroupsFor(classId, lod));
        for (const [group, mesh] of groupMeshes) {
          let stateVisible = true;
          if (group === 'HEADLIGHT') stateVisible = lights.headlights;
          else if (group === 'BRAKE') stateVisible = lights.brake;
          else if (group === 'SIGNAL_LEFT')
            stateVisible = lights.turn === 'LEFT' || lights.turn === 'HAZARD';
          else if (group === 'SIGNAL_RIGHT')
            stateVisible = lights.turn === 'RIGHT' || lights.turn === 'HAZARD';
          mesh.setEnabled(visible.has(group) && stateVisible);
        }
        const wheelsVisible =
          specification.lods.find((entry) => entry.level === lod)?.wheelsVisible ?? false;
        for (const wheel of wheelMeshes) wheel.setEnabled(wheelsVisible);
        for (const rim of rimMeshes) rim.setEnabled(wheelsVisible);
      };
      const representation: VehicleRepresentation = {
        entityId,
        classId,
        root,
        get lod() {
          return lod;
        },
        get lights() {
          return lights;
        },
        wheelPivots: Object.freeze([...pivots.values()]),
        shadowCasters: Object.freeze(groupMeshes.has('BODY') ? [groupMeshes.get('BODY')!] : []),
        footprintM,
        wheelPivot: (wheelId) => pivots.get(wheelId),
        wheelMeshVisible: (wheelId) => {
          const index = specification.wheelPivots.findIndex((p) => p.wheelId === wheelId);
          return index >= 0 && !!wheelMeshes[index]?.isEnabled();
        },
        setLod(level) {
          if (disposed) return;
          if (!['NEAR', 'MID', 'FAR'].includes(level)) throw new RangeError(`Unknown LOD ${level}`);
          if (lod === level) return;
          lod = level;
          applyVisibility();
        },
        applyWheels(wheels) {
          if (disposed) return;
          if (wheels.length !== specification.wheelPivots.length)
            throw new RangeError('Vehicle wheel pose count');
          for (const pose of wheels) {
            const index = specification.wheelPivots.findIndex((p) => p.wheelId === pose.wheelId);
            if (index < 0) throw new RangeError(`Unknown wheel ${pose.wheelId}`);
            const pivot = pivots.get(pose.wheelId);
            if (!pivot) throw new Error('Vehicle wheel pivot missing');
            const point = pose.transform.positionM;
            // Live suspension/steering pose; the pure contract keeps the rest pose for tests.
            pivot.position.set(point.x, point.y, point.z);
            pivot.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), pose.steeringRad);
            const spin = Quaternion.RotationAxis(Vector3.Right(), pose.spinRad);
            wheelMeshes[index]!.rotationQuaternion = spin;
            const rim = rimMeshes[index];
            if (rim) rim.rotationQuaternion = spin;
          }
        },
        setLights(state) {
          if (disposed) return;
          lights = Object.freeze({
            headlights: !!state.headlights,
            brake: !!state.brake,
            turn: state.turn,
          });
          applyVisibility();
        },
        setTransform(transform) {
          if (disposed) return;
          copyTransform(root, transform);
        },
        get metrics(): VehicleRepresentationMetrics {
          const enabled = [...groupMeshes.values()].filter((mesh) => mesh.isEnabled()).length;
          const wheelsEnabled =
            wheelMeshes.filter((mesh) => mesh.isEnabled()).length +
            rimMeshes.filter((mesh) => mesh.isEnabled()).length;
          return Object.freeze({
            meshes: enabled + wheelsEnabled,
            vertices: near.vertices,
            indices: near.indices,
            drawCalls: vehicleDrawCalls(lod, lights),
            lod,
          });
        },
        dispose() {
          if (!entries.has(entityId)) return;
          entries.delete(entityId);
          rootByEntity.delete(root);
          // Instances first: disposing the source releases the shared wheel/rim geometry.
          for (const rim of rimMeshes.slice(1)) rim.dispose(false, false);
          if (rimMeshes[0]) rimMeshes[0].dispose(false, false);
          for (const wheel of wheelMeshes.slice(1)) wheel.dispose(false, false);
          wheelMeshes[0]!.dispose(false, false);
          for (const mesh of groupMeshes.values()) mesh.dispose(false, false);
          for (const pivot of pivots.values()) pivot.dispose(false, false);
          root.dispose(false, false);
        },
      };
      entries.set(entityId, representation);
      rootByEntity.set(root, entityId);
      applyVisibility();
      return representation;
    },
    get(entityId) {
      return entries.get(entityId);
    },
    remove(entityId) {
      const entry = entries.get(entityId);
      if (!entry) return false;
      entry.dispose();
      return true;
    },
    entityIdFor(node) {
      if (disposed || !node || node.isDisposed() || node.getScene() !== scene) return undefined;
      let current: Node | null = node;
      while (current) {
        const id = rootByEntity.get(current as TransformNode);
        if (id) return id;
        current = current.parent;
      }
      return undefined;
    },
    updateLod(cameraPosition, activePreset = preset) {
      assertLive();
      if (![cameraPosition.x, cameraPosition.y, cameraPosition.z].every(Number.isFinite))
        throw new Error('Invalid LOD camera');
      for (const representation of entries.values()) {
        const distance = Vector3.Distance(cameraPosition, representation.root.position);
        representation.setLod(selectVehicleLod(distance, representation.lod, activePreset));
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of [...entries.values()]) entry.dispose();
      entries.clear();
      rootByEntity.clear();
      geometryCache.clear();
      for (const material of owned) material.dispose(false, false);
      materials.clear();
    },
  };
  return stage;
}
