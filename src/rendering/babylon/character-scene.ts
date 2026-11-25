/**
 * PBI 236/254 — reprezentarea Babylon a personajului.
 *
 * Two interchangeable rigs behind one contract:
 *
 * - PBI 254 (default in the browser): the imported CC0 character (`character:jordan`), a skinned
 *   mesh with seven clips. `applyFrame` still copies only the authoritative position and yaw; the
 *   clip selector (`setClip`) is presentation-only and never moves the entity.
 * - PBI 236 fallback (headless tests, failed model load): the procedural capsule/sphere rig driven
 *   by the PBI 191 joint transforms.
 *
 * Neither path ever computes an entity position: if a frame is missing, the root stays where the
 * last frame put it.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup.js';
import type { Scene } from '@babylonjs/core/scene';
import {
  characterJointSpec,
  type CharacterAsset,
  type CharacterClipId,
  type CharacterJointId,
  type CharacterRenderFrame,
} from '../../character';
import {
  CHARACTER_MATERIALS,
  buildCharacterVisual,
  type CharacterMaterialGroup,
  type CharacterVisualLod,
} from '../character-visuals';
import type { GlbModelLibrary } from './glb-model-library';

export const CHARACTER_SCENE_VERSION = '236-character-scene-v2' as const;

export interface CharacterSceneStats {
  readonly version: typeof CHARACTER_SCENE_VERSION;
  readonly lod: CharacterVisualLod;
  readonly joints: number;
  readonly meshes: number;
  readonly materials: number;
  readonly drawCalls: number;
  readonly frames: number;
  readonly positionWrites: number;
  /** PBI 254: which rig is live (`glb` when the imported model loaded). */
  readonly rig: 'glb' | 'procedural';
  readonly clips: number;
}

export interface CharacterScene {
  readonly version: typeof CHARACTER_SCENE_VERSION;
  readonly root: TransformNode;
  /** PBI 244: meshurile personajului (casteri și receptori de umbră). */
  readonly meshes: readonly Mesh[];
  readonly stats: CharacterSceneStats;
  /** Copiază poziția, yaw-ul și articulațiile locale; nu inventează nicio poziție. */
  applyFrame(frame: CharacterRenderFrame): void;
  /** PBI 254: choose the locomotion clip; presentation only, never authority. */
  setClip(clipId: CharacterClipId, speedMps?: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export interface CharacterSceneOptions {
  /** PBI 254: when present the imported skinned character replaces the procedural rig. */
  readonly models?: GlbModelLibrary;
}

const GROUP_ORDER: readonly CharacterMaterialGroup[] = ['SKIN', 'TORSO', 'LEGS', 'BOOTS'];

/** Clip routing: the imported locomotion set onto the PBI 191 clip ids. */
const CLIP_ROUTES: Readonly<Record<CharacterClipId, string>> = Object.freeze({
  idle: 'Idle_Standing',
  walk: 'Walk_Relaxed',
  run: 'Run',
  'enter-vehicle': 'Sit_Stand',
  'exit-vehicle': 'Idle_Standing',
});

function glbMeshes(root: TransformNode): Mesh[] {
  const found: Mesh[] = [];
  for (const mesh of root.getChildMeshes(false)) found.push(mesh as Mesh);
  return found;
}

export function createCharacterScene(
  scene: Scene,
  asset: CharacterAsset,
  lod: CharacterVisualLod = 'NEAR',
  options: CharacterSceneOptions = {},
): CharacterScene {
  if (!scene || scene.isDisposed) throw new Error('Scena personajului cere o scenă vie.');
  const root = new TransformNode('character:root', scene);
  const entries = options.models?.instantiate('character:jordan', scene, 'character', {
    cloneMaterials: false,
  });
  if (entries) {
    for (const node of entries.rootNodes) node.parent = root;
    const meshes = glbMeshes(root);
    const groups = new Map<string, AnimationGroup>();
    for (const group of entries.animationGroups) groups.set(group.name, group);
    const skinned = root.getChildMeshes(false).find((mesh) => mesh.skeleton !== undefined);
    const joints = skinned?.skeleton?.bones.length ?? 0;
    let positionWrites = 0;
    let frames = 0;
    let active: AnimationGroup | null = null;
    const setClip = (clipId: CharacterClipId, speedMps = 0): void => {
      const route =
        clipId === 'walk' && speedMps > 2.2
          ? 'Walk_Brisk'
          : (CLIP_ROUTES[clipId] ?? 'Idle_Standing');
      const next = groups.get(route) ?? null;
      if (next === active) return;
      active?.stop();
      active = next;
      if (!active) return;
      active.start(clipId !== 'enter-vehicle', 1, active.from, active.to, false);
    };
    setClip('idle');
    return Object.freeze({
      version: CHARACTER_SCENE_VERSION,
      root,
      meshes,
      get stats(): CharacterSceneStats {
        return Object.freeze({
          version: CHARACTER_SCENE_VERSION,
          lod,
          joints,
          meshes: meshes.length,
          materials: new Set(meshes.map((mesh) => mesh.material).filter(Boolean)).size,
          drawCalls: meshes.length,
          frames,
          positionWrites,
          rig: 'glb' as const,
          clips: groups.size,
        });
      },
      applyFrame(frame: CharacterRenderFrame): void {
        frames += 1;
        root.position.set(frame.positionM.x, frame.positionM.y, frame.positionM.z);
        root.rotation.y = frame.yawRad;
        positionWrites += 1;
      },
      setClip,
      setVisible(visible: boolean): void {
        root.setEnabled(visible);
      },
      dispose(): void {
        for (const group of groups.values()) group.dispose();
        groups.clear();
        active = null;
        for (const mesh of meshes) if (!mesh.isDisposed()) mesh.dispose(false, false);
        root.dispose(false);
      },
    });
  }

  const description = buildCharacterVisual(asset, lod);
  const materials = new Map<CharacterMaterialGroup, PBRMaterial>();
  for (const group of GROUP_ORDER) {
    const material = new PBRMaterial(`character:${group}`, scene);
    const spec = CHARACTER_MATERIALS.find((entry) => entry.group === group);
    const [r, g, b] = spec?.color ?? [1, 0, 1];
    material.albedoColor = new Color3(r, g, b);
    material.roughness = spec?.roughness ?? 0.8;
    material.metallic = 0;
    material.directIntensity = 2.3;
    material.environmentIntensity = 0.35;
    material.maxSimultaneousLights = 2;
    materials.set(group, material);
  }

  const nodes = new Map<CharacterJointId, TransformNode>();
  const meshes: Mesh[] = [];
  let positionWrites = 0;
  let frames = 0;

  const ensureNode = (joint: CharacterJointId): TransformNode => {
    const existing = nodes.get(joint);
    if (existing) return existing;
    const spec = characterJointSpec(asset.skeleton, joint);
    const parent = spec.parent === null ? root : ensureNode(spec.parent);
    const node = new TransformNode(`character:joint:${joint}`, scene);
    node.parent = parent;
    node.position.set(spec.offsetM.x, spec.offsetM.y, spec.offsetM.z);
    nodes.set(joint, node);
    return node;
  };

  for (const part of description.parts) {
    const parent = ensureNode(part.joint);
    // Capsule replaces the PBI 191 box: same pivot, same size, smooth silhouette. The head is a
    // sphere; limbs and torso are capsules sized to the contract box.
    let mesh: Mesh;
    if (part.joint === 'head') {
      const diameter = Math.min(part.sizeM.x, part.sizeM.y, part.sizeM.z);
      mesh = CreateSphere(`character:mesh:${part.joint}`, { diameter, segments: 16 }, scene);
    } else {
      const radius = Math.min(part.sizeM.x, part.sizeM.z) / 2;
      mesh = CreateCapsule(
        `character:mesh:${part.joint}`,
        {
          radius,
          height: part.sizeM.y,
          tessellation: 16,
          subdivisions: 2,
        },
        scene,
      );
    }
    mesh.parent = parent;
    mesh.position.set(part.localCentreM.x, part.localCentreM.y, part.localCentreM.z);
    mesh.material = materials.get(part.group) ?? null;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    meshes.push(mesh);
  }

  const characterScene: CharacterScene = {
    version: CHARACTER_SCENE_VERSION,
    root,
    meshes,
    get stats(): CharacterSceneStats {
      return Object.freeze({
        version: CHARACTER_SCENE_VERSION,
        lod,
        joints: nodes.size,
        meshes: meshes.length,
        materials: materials.size,
        drawCalls: description.drawCalls,
        frames,
        positionWrites,
        rig: 'procedural' as const,
        clips: 0,
      });
    },
    applyFrame(frame: CharacterRenderFrame): void {
      frames += 1;
      root.position.set(frame.positionM.x, frame.positionM.y, frame.positionM.z);
      root.rotation.y = frame.yawRad;
      positionWrites += 1;
      for (const transform of frame.joints) {
        const node = nodes.get(transform.joint);
        if (!node) continue;
        const spec = characterJointSpec(asset.skeleton, transform.joint);
        node.position.set(
          spec.offsetM.x + transform.offsetM.x,
          spec.offsetM.y + transform.offsetM.y,
          spec.offsetM.z + transform.offsetM.z,
        );
        node.rotation.set(
          transform.rotationRad.x,
          transform.rotationRad.y,
          transform.rotationRad.z,
        );
      }
    },
    setClip(): void {
      // The procedural rig is driven by the PBI 191 joint transforms; there is no clip to select.
    },
    setVisible(visible: boolean): void {
      root.setEnabled(visible);
    },
    dispose(): void {
      for (const mesh of meshes) mesh.dispose(false, false);
      for (const node of nodes.values()) node.dispose(false);
      root.dispose(false);
      for (const material of materials.values()) material.dispose();
    },
  };
  return Object.freeze(characterScene);
}
