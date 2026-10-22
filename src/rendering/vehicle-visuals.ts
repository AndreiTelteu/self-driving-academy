/**
 * PBI 145 — visual contract for the sedan/compact classes.
 *
 * The contract is a pure read model: it never imports simulation services at runtime, never
 * creates colliders and never changes an entity ID. Wheel pivots are derived from the PBI 023
 * mechanical geometry (track, wheelbase, radius, suspension rest pose) and verified against the
 * real `VEHICLE_CLASSES` by the tests. LOD only hides presentation groups; it is not a physics or
 * identity operation.
 */
import {
  checkAssetManifest,
  type AssetBudgetManifest,
  type BudgetDiagnostic,
  type BudgetedAsset,
} from './asset-budgets';
import {
  buildVehicleGeometry,
  type VehicleClassKey,
  type VehicleMaterialGroup,
} from './vehicle-geometry';
import type { QualityPreset } from './quality-policy';

export const VEHICLE_VISUAL_VERSION = '145-vehicle-visuals-v1';
/** PBI 023 suspension contract: connection point -0.15 m, 0.35 m rest length. */
export const VEHICLE_CONNECTION_Y_M = -0.15;
export const VEHICLE_REST_SPRING_M = 0.35;
/** Fixed chassis collider of PBI 023 (`cuboid(0.85, 0.3, 2)`), independent of the visual class. */
export const VEHICLE_COLLISION_HALF_EXTENTS_M = Object.freeze({ x: 0.85, y: 0.3, z: 2 });
export type VehicleLodLevel = 'NEAR' | 'MID' | 'FAR';
export const VEHICLE_LOD_LEVELS: readonly VehicleLodLevel[] = Object.freeze(['NEAR', 'MID', 'FAR']);
export type VehicleWheelId = 'front-left' | 'front-right' | 'rear-left' | 'rear-right';
export const VEHICLE_WHEEL_IDS: readonly VehicleWheelId[] = Object.freeze([
  'front-left',
  'front-right',
  'rear-left',
  'rear-right',
]);
export interface VehicleWheelPivot {
  readonly wheelId: VehicleWheelId;
  /** Chassis-local metres; +X right, +Y up, +Z forward. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radiusM: number;
  /** Front wheels steer around +Y; all four spin around +X. */
  readonly steering: boolean;
}
export interface VehicleLodSpec {
  readonly level: VehicleLodLevel;
  /** Maximum distance in metres for this level, with 5 m hysteresis. */
  readonly distanceM: number;
  readonly visibleGroups: readonly VehicleMaterialGroup[];
  readonly wheelsVisible: boolean;
}
export interface VehicleVisualClass {
  readonly classId: VehicleClassKey;
  readonly version: typeof VEHICLE_VISUAL_VERSION;
  readonly mechanicalVersion: string;
  readonly wheelPivots: readonly VehicleWheelPivot[];
  readonly lods: readonly VehicleLodSpec[];
  readonly collisionHalfExtentsM: typeof VEHICLE_COLLISION_HALF_EXTENTS_M;
  /** Lowest point of the wheels in the chassis frame; part of the PBI 023 clearance contract. */
  readonly wheelBottomM: number;
}
export interface MechanicalWheelSource {
  readonly radiusM: number;
  readonly wheelbaseM: number;
  readonly trackM: number;
}
export interface VehicleLightState {
  readonly headlights: boolean;
  readonly brake: boolean;
  readonly turn: 'OFF' | 'LEFT' | 'RIGHT' | 'HAZARD';
}
export const VEHICLE_LIGHTS_OFF: VehicleLightState = Object.freeze({
  headlights: false,
  brake: false,
  turn: 'OFF',
});
const ALL_GROUPS: readonly VehicleMaterialGroup[] = Object.freeze([
  'BODY',
  'HEADLIGHT',
  'TAILLIGHT',
  'BRAKE',
  'SIGNAL_LEFT',
  'SIGNAL_RIGHT',
]);
function visualClass(
  classId: VehicleClassKey,
  mechanicalVersion: string,
  radiusM: number,
  trackM: number,
  wheelbaseM: number,
): VehicleVisualClass {
  const restY = VEHICLE_CONNECTION_Y_M - VEHICLE_REST_SPRING_M;
  const pivot = (
    wheelId: VehicleWheelId,
    x: number,
    z: number,
    steering: boolean,
  ): VehicleWheelPivot => Object.freeze({ wheelId, x, y: restY, z, radiusM, steering });
  return Object.freeze({
    classId,
    version: VEHICLE_VISUAL_VERSION,
    mechanicalVersion,
    wheelPivots: Object.freeze([
      pivot('front-left', -trackM / 2, wheelbaseM / 2, true),
      pivot('front-right', trackM / 2, wheelbaseM / 2, true),
      pivot('rear-left', -trackM / 2, -wheelbaseM / 2, false),
      pivot('rear-right', trackM / 2, -wheelbaseM / 2, false),
    ]),
    lods: Object.freeze([
      Object.freeze({
        level: 'NEAR' as const,
        distanceM: 0,
        visibleGroups: ALL_GROUPS,
        wheelsVisible: true,
      }),
      Object.freeze({
        level: 'MID' as const,
        distanceM: 0,
        visibleGroups: Object.freeze(['BODY', 'HEADLIGHT', 'TAILLIGHT', 'BRAKE'] as const),
        wheelsVisible: true,
      }),
      Object.freeze({
        level: 'FAR' as const,
        distanceM: 0,
        visibleGroups: Object.freeze(['BODY'] as const),
        wheelsVisible: false,
      }),
    ]),
    collisionHalfExtentsM: VEHICLE_COLLISION_HALF_EXTENTS_M,
    wheelBottomM: restY - radiusM,
  });
}
const VISUAL_CLASSES: Readonly<Record<VehicleClassKey, VehicleVisualClass>> = Object.freeze({
  sedan: visualClass('sedan', '023-mechanics-v1', 0.32, 1.8, 2.7),
  compact: visualClass('compact', '023-mechanics-v1', 0.29, 1.6, 2.4),
});
/** Class-level distances; only presentation detail changes, never physics or identity. */
export const VEHICLE_LOD_DISTANCES_M = Object.freeze({
  LOW: Object.freeze({ NEAR: 30, MID: 70 }),
  MEDIUM: Object.freeze({ NEAR: 40, MID: 85 }),
  HIGH: Object.freeze({ NEAR: 55, MID: 110 }),
});
export function vehicleVisualClass(classId: VehicleClassKey): VehicleVisualClass {
  if (!Object.hasOwn(VISUAL_CLASSES, classId))
    throw new RangeError(`Unknown vehicle visual class ${classId}`);
  return VISUAL_CLASSES[classId];
}
/** Five-metre hysteresis matches the PBI 223 batch LOD contract and prevents flicker at a border. */
export function selectVehicleLod(
  distanceM: number,
  current: VehicleLodLevel | null,
  preset: QualityPreset,
  hysteresisM = 5,
): VehicleLodLevel {
  if (!Number.isFinite(distanceM) || distanceM < 0)
    throw new RangeError('Invalid vehicle distance');
  if (!Number.isFinite(hysteresisM) || hysteresisM < 0) throw new RangeError('Invalid hysteresis');
  const limits = VEHICLE_LOD_DISTANCES_M[preset];
  if (!limits) throw new RangeError(`Unknown quality preset ${preset}`);
  const near = limits.NEAR + (current === 'NEAR' ? hysteresisM : -hysteresisM);
  if (distanceM < near) return 'NEAR';
  const mid = limits.MID + (current === 'MID' ? hysteresisM : -hysteresisM);
  return distanceM < mid ? 'MID' : 'FAR';
}
/** Independent verification of the pivot contract against the mechanical definition. */
export function vehicleVisualAlignment(
  mechanical: Readonly<Partial<Record<VehicleClassKey, MechanicalWheelSource>>>,
): readonly string[] {
  const issues: string[] = [];
  for (const classId of ['sedan', 'compact'] as const) {
    const source = mechanical[classId];
    if (!source) {
      issues.push(`${classId}: missing mechanical source`);
      continue;
    }
    const visual = vehicleVisualClass(classId);
    if (visual.wheelPivots.length !== VEHICLE_WHEEL_IDS.length)
      issues.push(`${classId}: wheel pivot count`);
    for (const pivot of visual.wheelPivots) {
      if (Math.abs(pivot.radiusM - source.radiusM) > 1e-9)
        issues.push(`${classId}/${pivot.wheelId}: radius ${pivot.radiusM} != ${source.radiusM}`);
      const expectedX = pivot.wheelId.endsWith('left') ? -source.trackM / 2 : source.trackM / 2;
      const expectedZ = pivot.wheelId.startsWith('front')
        ? source.wheelbaseM / 2
        : -source.wheelbaseM / 2;
      if (Math.abs(pivot.x - expectedX) > 1e-9)
        issues.push(`${classId}/${pivot.wheelId}: track mismatch ${pivot.x} != ${expectedX}`);
      if (Math.abs(pivot.z - expectedZ) > 1e-9)
        issues.push(`${classId}/${pivot.wheelId}: wheelbase mismatch ${pivot.z} != ${expectedZ}`);
      if (Math.abs(pivot.y - (VEHICLE_CONNECTION_Y_M - VEHICLE_REST_SPRING_M)) > 1e-9)
        issues.push(`${classId}/${pivot.wheelId}: suspension rest pose`);
    }
    if (
      Math.abs(
        visual.wheelBottomM - (VEHICLE_CONNECTION_Y_M - VEHICLE_REST_SPRING_M - source.radiusM),
      ) > 1e-9
    )
      issues.push(`${classId}: wheel bottom clearance`);
    for (const lod of visual.lods) {
      if (lod.wheelsVisible !== (lod.level !== 'FAR'))
        issues.push(`${classId}/${lod.level}: wheel visibility`);
      if (lod.level === 'NEAR' && lod.visibleGroups.length !== ALL_GROUPS.length)
        issues.push(`${classId}/NEAR: groups`);
    }
    if (
      visual.collisionHalfExtentsM.x !== 0.85 ||
      visual.collisionHalfExtentsM.y !== 0.3 ||
      visual.collisionHalfExtentsM.z !== 2
    )
      issues.push(`${classId}: collision envelope must stay the PBI 023 chassis box`);
  }
  return Object.freeze(issues);
}
export function visibleGroupsFor(
  classId: VehicleClassKey,
  lod: VehicleLodLevel,
): readonly VehicleMaterialGroup[] {
  const specification = vehicleVisualClass(classId).lods.find((entry) => entry.level === lod);
  if (!specification) throw new RangeError(`Unknown LOD ${lod}`);
  return specification.visibleGroups;
}
/** Presentation draw calls for the given light/turn state; never depends on LOD internals. */
export function vehicleDrawCalls(lod: VehicleLodLevel, lights: VehicleLightState): number {
  if (lod === 'FAR') return 1;
  let calls = 3; // body, headlight, taillight
  if (lights.brake) calls += 1;
  if (lights.turn === 'LEFT' || lights.turn === 'RIGHT') calls += 1;
  else if (lights.turn === 'HAZARD') calls += 2;
  if (lod === 'MID' || lod === 'NEAR') calls += 1; // four wheels share one instanced source
  return calls;
}
function geometryAsset(
  classId: VehicleClassKey,
  lod: VehicleLodLevel,
  firstRide: boolean,
): BudgetedAsset {
  const geometry = buildVehicleGeometry(classId, lod);
  return Object.freeze({
    id: `vehicle:${classId}:${lod.toLowerCase()}`,
    firstRide,
    transferBytes: 0,
    geometryGpuBytes: geometry.gpuBytes,
    textureGpuBytes: 0,
    shaderVariants: 0,
  });
}
/**
 * The procedural mesh set costs no runtime transfer; the shared materials prepare two shader
 * variants each (plain and instanced) exactly like the PBI 014 registry does for GLB assets.
 */
export function vehicleAssetManifest(
  options: { readonly criticalCodeTransferBytes?: number; readonly firstRide?: boolean } = {},
): AssetBudgetManifest {
  const criticalCodeTransferBytes = options.criticalCodeTransferBytes ?? 0;
  if (!Number.isSafeInteger(criticalCodeTransferBytes) || criticalCodeTransferBytes < 0)
    throw new RangeError('Invalid critical code transfer');
  const firstRide = options.firstRide ?? true;
  return Object.freeze({
    version: VEHICLE_VISUAL_VERSION,
    criticalCodeTransferBytes,
    decoderWasmBytes: 0,
    decoderWorkspaceBytes: 0,
    assets: Object.freeze([
      geometryAsset('sedan', 'NEAR', firstRide),
      geometryAsset('sedan', 'MID', firstRide),
      geometryAsset('sedan', 'FAR', firstRide),
      geometryAsset('compact', 'NEAR', firstRide),
      geometryAsset('compact', 'MID', firstRide),
      geometryAsset('compact', 'FAR', firstRide),
      Object.freeze({
        id: 'vehicle:materials',
        firstRide,
        transferBytes: 0,
        geometryGpuBytes: 0,
        textureGpuBytes: 0,
        shaderVariants: 8,
      }),
    ]),
  });
}
export function vehicleAssetBudget(preset: QualityPreset) {
  return checkAssetManifest(vehicleAssetManifest(), preset);
}
export function admitVehicleAssets(preset: QualityPreset): void {
  const result = vehicleAssetBudget(preset);
  if (!result.accepted)
    throw new Error(`Vehicle asset manifest over budget: ${JSON.stringify(result.diagnostics)}`);
}
export interface VehicleAssetInventoryEntry {
  readonly id: string;
  readonly type: 'PROCEDURAL_MESH' | 'MATERIAL_SET';
  readonly version: string;
  readonly role: 'CRITICAL' | 'OPTIONAL';
  readonly source: string;
  readonly license: string;
  readonly costBytes: number;
}
const INVENTORY_SOURCE = 'Original procedural geometry authored in this repository (PBI 145)';
const INVENTORY_LICENSE = 'Project license — original work, no third-party asset';
/** Source/licence inventory for every visual asset this module admits. */
export function vehicleAssetInventory(): readonly VehicleAssetInventoryEntry[] {
  const entries: VehicleAssetInventoryEntry[] = [];
  for (const classId of ['sedan', 'compact'] as const)
    for (const lod of VEHICLE_LOD_LEVELS) {
      const geometry = buildVehicleGeometry(classId, lod);
      entries.push(
        Object.freeze({
          id: `vehicle:${classId}:${lod.toLowerCase()}`,
          type: 'PROCEDURAL_MESH' as const,
          version: VEHICLE_VISUAL_VERSION,
          role: 'CRITICAL' as const,
          source: INVENTORY_SOURCE,
          license: INVENTORY_LICENSE,
          costBytes: geometry.gpuBytes,
        }),
      );
    }
  entries.push(
    Object.freeze({
      id: 'vehicle:materials',
      type: 'MATERIAL_SET' as const,
      version: VEHICLE_VISUAL_VERSION,
      role: 'CRITICAL' as const,
      source: INVENTORY_SOURCE,
      license: INVENTORY_LICENSE,
      costBytes: 0,
    }),
  );
  return Object.freeze(entries);
}
export type VehicleAssetDiagnostic = BudgetDiagnostic;
