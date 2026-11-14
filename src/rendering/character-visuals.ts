/**
 * PBI 191 — Babylon-facing description of the character, derived from the pure asset contract.
 *
 * This module builds meshes, pivots and materials only. It has no entity position, no simulation
 * import and no scene access: the caller places the returned parts under the authoritative
 * transform that PBI 192 owns. Material groups are merged, so a character costs one draw call per
 * group and the LODs only drop presentation detail.
 */
import {
  characterJointSpec,
  characterRestPivots,
  CHARACTER_SAMPLING_HZ,
  type CharacterAsset,
  type CharacterJointId,
  type CharacterPoint,
} from '../character';
import { checkAssetManifest, type AssetBudgetManifest, type BudgetedAsset } from './asset-budgets';
import type { QualityPreset } from './quality-policy';

export const CHARACTER_VISUAL_VERSION = '191-character-visuals-v1' as const;

export type CharacterMaterialGroup = 'SKIN' | 'TORSO' | 'LEGS' | 'BOOTS';
export type CharacterVisualLod = 'NEAR' | 'MID' | 'FAR';
export const CHARACTER_VISUAL_LODS: readonly CharacterVisualLod[] = Object.freeze([
  'NEAR',
  'MID',
  'FAR',
]);

/** Same vertex format as the PBI 145 vehicle workflow: positions/normals + RGBA + Uint32 indices. */
export const CHARACTER_VERTEX_BYTES = 40;
export const CHARACTER_INDEX_BYTES = 4;
/** A box is four vertices per face, so normals stay flat instead of smoothing into a blob. */
export const CHARACTER_BOX_VERTICES = 24;
export const CHARACTER_BOX_INDICES = 36;

export interface CharacterMaterial {
  readonly group: CharacterMaterialGroup;
  readonly color: readonly [number, number, number];
  readonly roughness: number;
}

export const CHARACTER_MATERIALS: readonly CharacterMaterial[] = Object.freeze([
  Object.freeze({ group: 'SKIN', color: [0.78, 0.6, 0.48] as const, roughness: 0.75 }),
  Object.freeze({ group: 'TORSO', color: [0.1, 0.24, 0.42] as const, roughness: 0.85 }),
  Object.freeze({ group: 'LEGS', color: [0.18, 0.19, 0.22] as const, roughness: 0.9 }),
  Object.freeze({ group: 'BOOTS', color: [0.06, 0.06, 0.07] as const, roughness: 0.95 }),
]);

const GROUP_BY_JOINT: Readonly<Record<CharacterJointId, CharacterMaterialGroup>> = Object.freeze({
  pelvis: 'TORSO',
  spine: 'TORSO',
  chest: 'TORSO',
  neck: 'SKIN',
  head: 'SKIN',
  'upper-arm-left': 'TORSO',
  'forearm-left': 'SKIN',
  'hand-left': 'SKIN',
  'upper-arm-right': 'TORSO',
  'forearm-right': 'SKIN',
  'hand-right': 'SKIN',
  'thigh-left': 'LEGS',
  'shin-left': 'LEGS',
  'foot-left': 'BOOTS',
  'thigh-right': 'LEGS',
  'shin-right': 'LEGS',
  'foot-right': 'BOOTS',
});

/** LOD is presentation only; the FAR silhouette keeps torso and legs on the same pivots. */
const LOD_JOINTS: Readonly<Record<CharacterVisualLod, readonly CharacterJointId[]>> = Object.freeze(
  {
    NEAR: Object.freeze((Object.keys(GROUP_BY_JOINT) as CharacterJointId[]).slice()),
    MID: Object.freeze(
      (Object.keys(GROUP_BY_JOINT) as CharacterJointId[]).filter(
        (joint) => joint !== 'hand-left' && joint !== 'hand-right' && joint !== 'neck',
      ),
    ),
    FAR: Object.freeze([
      'pelvis',
      'chest',
      'head',
      'thigh-left',
      'shin-left',
      'thigh-right',
      'shin-right',
    ] as CharacterJointId[]),
  },
);

export interface CharacterMeshPart {
  /** Stable id for instancing/caching; joint-scoped, never entity-scoped. */
  readonly id: string;
  readonly joint: CharacterJointId;
  readonly parent: CharacterJointId | null;
  readonly group: CharacterMaterialGroup;
  /** Rest pivot in the character-local frame, taken from the contract (metres). */
  readonly pivotM: CharacterPoint;
  /** Box centre relative to the joint pivot. */
  readonly localCentreM: CharacterPoint;
  readonly sizeM: CharacterPoint;
  readonly color: readonly [number, number, number];
}

export interface CharacterVisualDescription {
  readonly version: typeof CHARACTER_VISUAL_VERSION;
  readonly assetId: string;
  readonly skeletonVersion: string;
  readonly lod: CharacterVisualLod;
  readonly samplingHz: number;
  readonly parts: readonly CharacterMeshPart[];
  readonly materials: readonly CharacterMaterial[];
  readonly vertices: number;
  readonly indices: number;
  readonly gpuBytes: number;
  readonly drawCalls: number;
}

export function characterMaterial(group: CharacterMaterialGroup): CharacterMaterial {
  const material = CHARACTER_MATERIALS.find((entry) => entry.group === group);
  if (!material) throw new RangeError(`Unknown character material group ${group}`);
  return material;
}

export function characterPartGroup(joint: CharacterJointId): CharacterMaterialGroup {
  return GROUP_BY_JOINT[joint];
}

/** Deterministic description from the contract: the pivots are read, never re-authored. */
export function buildCharacterVisual(
  asset: CharacterAsset,
  lod: CharacterVisualLod = 'NEAR',
): CharacterVisualDescription {
  const joints = LOD_JOINTS[lod];
  if (!joints) throw new RangeError(`Unknown character LOD ${lod}`);
  const pivots = new Map(characterRestPivots(asset.skeleton).map((pivot) => [pivot.joint, pivot]));
  const parts = joints.map((jointId) => {
    const spec = characterJointSpec(asset.skeleton, jointId);
    const pivot = pivots.get(jointId)!;
    const group = characterPartGroup(jointId);
    return Object.freeze({
      id: `character:${asset.id}:${jointId}`,
      joint: jointId,
      parent: spec.parent,
      group,
      pivotM: pivot.positionM,
      localCentreM: spec.boxOffsetM,
      sizeM: spec.sizeM,
      color: characterMaterial(group).color,
    });
  });
  const groups = new Set(parts.map((part) => part.group));
  const vertices = parts.length * CHARACTER_BOX_VERTICES;
  const indices = parts.length * CHARACTER_BOX_INDICES;
  return Object.freeze({
    version: CHARACTER_VISUAL_VERSION,
    assetId: asset.id,
    skeletonVersion: asset.skeleton.version,
    lod,
    samplingHz: CHARACTER_SAMPLING_HZ,
    parts: Object.freeze(parts),
    materials: Object.freeze(CHARACTER_MATERIALS.filter((material) => groups.has(material.group))),
    vertices,
    indices,
    gpuBytes: vertices * CHARACTER_VERTEX_BYTES + indices * CHARACTER_INDEX_BYTES,
    drawCalls: groups.size,
  });
}

export function characterDrawCalls(lod: CharacterVisualLod): number {
  const joints = LOD_JOINTS[lod];
  if (!joints) throw new RangeError(`Unknown character LOD ${lod}`);
  return new Set(joints.map(characterPartGroup)).size;
}

/**
 * Independent verification that the description really follows the contract pivots and sizes.
 * Returns an empty list when every mesh sits on its joint pivot.
 */
export function characterVisualAlignment(asset: CharacterAsset): readonly string[] {
  const issues: string[] = [];
  const pivots = new Map(characterRestPivots(asset.skeleton).map((pivot) => [pivot.joint, pivot]));
  for (const lod of CHARACTER_VISUAL_LODS) {
    const description = buildCharacterVisual(asset, lod);
    if (description.parts.length !== LOD_JOINTS[lod].length)
      issues.push(`${lod}: part count ${description.parts.length}`);
    if (description.drawCalls !== new Set(description.parts.map((part) => part.group)).size)
      issues.push(`${lod}: draw calls must equal material groups`);
    if (description.vertices !== description.parts.length * CHARACTER_BOX_VERTICES)
      issues.push(`${lod}: vertex accounting`);
    for (const part of description.parts) {
      const pivot = pivots.get(part.joint);
      const spec = characterJointSpec(asset.skeleton, part.joint);
      if (!pivot) {
        issues.push(`${lod}/${part.joint}: missing contract pivot`);
        continue;
      }
      if (
        part.pivotM.x !== pivot.positionM.x ||
        part.pivotM.y !== pivot.positionM.y ||
        part.pivotM.z !== pivot.positionM.z
      )
        issues.push(`${lod}/${part.joint}: pivot differs from the skeleton contract`);
      if (
        part.localCentreM.x !== spec.boxOffsetM.x ||
        part.localCentreM.y !== spec.boxOffsetM.y ||
        part.localCentreM.z !== spec.boxOffsetM.z ||
        part.sizeM.x !== spec.sizeM.x ||
        part.sizeM.y !== spec.sizeM.y ||
        part.sizeM.z !== spec.sizeM.z
      )
        issues.push(`${lod}/${part.joint}: box differs from the skeleton contract`);
      if (part.parent !== spec.parent) issues.push(`${lod}/${part.joint}: parent mismatch`);
      if ('positionM' in part)
        issues.push(`${lod}/${part.joint}: presentation part carries an entity position`);
    }
  }
  return Object.freeze(issues);
}

function geometryAsset(
  asset: CharacterAsset,
  lod: CharacterVisualLod,
  firstRide: boolean,
): BudgetedAsset {
  const description = buildCharacterVisual(asset, lod);
  return Object.freeze({
    id: `character:${asset.id}:${lod.toLowerCase()}`,
    firstRide,
    transferBytes: 0,
    geometryGpuBytes: description.gpuBytes,
    textureGpuBytes: 0,
    shaderVariants: 0,
  });
}

/** Procedural meshes cost no runtime transfer; the four shared materials prepare two variants. */
export function characterAssetManifest(
  asset: CharacterAsset,
  options: { readonly firstRide?: boolean } = {},
): AssetBudgetManifest {
  const firstRide = options.firstRide ?? true;
  return Object.freeze({
    version: CHARACTER_VISUAL_VERSION,
    criticalCodeTransferBytes: 0,
    decoderWasmBytes: 0,
    decoderWorkspaceBytes: 0,
    assets: Object.freeze([
      geometryAsset(asset, 'NEAR', firstRide),
      geometryAsset(asset, 'MID', firstRide),
      geometryAsset(asset, 'FAR', firstRide),
      Object.freeze({
        id: `character:${asset.id}:materials`,
        firstRide,
        transferBytes: 0,
        geometryGpuBytes: 0,
        textureGpuBytes: 0,
        shaderVariants: CHARACTER_MATERIALS.length * 2,
      }),
    ]),
  });
}

export function characterAssetBudget(asset: CharacterAsset, preset: QualityPreset) {
  return checkAssetManifest(characterAssetManifest(asset), preset);
}

export function admitCharacterAssets(asset: CharacterAsset, preset: QualityPreset): void {
  const result = characterAssetBudget(asset, preset);
  if (!result.accepted)
    throw new Error(`Character asset manifest over budget: ${JSON.stringify(result.diagnostics)}`);
}

export interface CharacterAssetInventoryEntry {
  readonly id: string;
  readonly type: 'PROCEDURAL_MESH' | 'MATERIAL_SET';
  readonly version: string;
  readonly role: 'CRITICAL';
  readonly source: string;
  readonly license: string;
  readonly costBytes: number;
}

const INVENTORY_SOURCE = 'Original procedural geometry authored in this repository (PBI 191)';
const INVENTORY_LICENSE = 'Project license — original work, no third-party asset';

/** Source/licence inventory for every character presentation asset this module admits. */
export function characterAssetInventory(
  asset: CharacterAsset,
): readonly CharacterAssetInventoryEntry[] {
  const entries: CharacterAssetInventoryEntry[] = [];
  for (const lod of CHARACTER_VISUAL_LODS)
    entries.push(
      Object.freeze({
        id: `character:${asset.id}:${lod.toLowerCase()}`,
        type: 'PROCEDURAL_MESH' as const,
        version: CHARACTER_VISUAL_VERSION,
        role: 'CRITICAL' as const,
        source: INVENTORY_SOURCE,
        license: INVENTORY_LICENSE,
        costBytes: buildCharacterVisual(asset, lod).gpuBytes,
      }),
    );
  entries.push(
    Object.freeze({
      id: `character:${asset.id}:materials`,
      type: 'MATERIAL_SET' as const,
      version: CHARACTER_VISUAL_VERSION,
      role: 'CRITICAL' as const,
      source: INVENTORY_SOURCE,
      license: INVENTORY_LICENSE,
      costBytes: 0,
    }),
  );
  return Object.freeze(entries);
}
