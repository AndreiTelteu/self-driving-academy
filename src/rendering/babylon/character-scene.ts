/**
 * PBI 236 — reprezentarea Babylon a personajului, derivată din contractul 191.
 *
 * Modulele construiesc exclusiv mesh-uri și noduri locale: scheletul și cutiile vin din
 * `buildCharacterVisual`, iar `applyFrame` copiază poziția și yaw-ul din `CharacterRenderFrame`.
 * Fișierul nu calculează niciodată o poziție de entitate; dacă un cadru ar lipsi, nodul rădăcină
 * rămâne unde a fost pus ultima dată.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene';
import {
  characterJointSpec,
  type CharacterAsset,
  type CharacterJointId,
  type CharacterRenderFrame,
} from '../../character';
import {
  CHARACTER_MATERIALS,
  buildCharacterVisual,
  type CharacterMaterialGroup,
  type CharacterVisualLod,
} from '../character-visuals';

export const CHARACTER_SCENE_VERSION = '236-character-scene-v1' as const;

export interface CharacterSceneStats {
  readonly version: typeof CHARACTER_SCENE_VERSION;
  readonly lod: CharacterVisualLod;
  readonly joints: number;
  readonly meshes: number;
  readonly materials: number;
  readonly drawCalls: number;
  readonly frames: number;
  readonly positionWrites: number;
}

export interface CharacterScene {
  readonly version: typeof CHARACTER_SCENE_VERSION;
  readonly root: TransformNode;
  readonly stats: CharacterSceneStats;
  /** Copiază poziția, yaw-ul și articulațiile locale; nu inventează nicio poziție. */
  applyFrame(frame: CharacterRenderFrame): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const GROUP_ORDER: readonly CharacterMaterialGroup[] = ['SKIN', 'TORSO', 'LEGS', 'BOOTS'];

export function createCharacterScene(
  scene: Scene,
  asset: CharacterAsset,
  lod: CharacterVisualLod = 'NEAR',
): CharacterScene {
  if (!scene || scene.isDisposed) throw new Error('Scena personajului cere o scenă vie.');
  const description = buildCharacterVisual(asset, lod);
  const materials = new Map<CharacterMaterialGroup, StandardMaterial>();
  for (const group of GROUP_ORDER) {
    const material = new StandardMaterial(`character:${group}`, scene);
    const spec = CHARACTER_MATERIALS.find((entry) => entry.group === group);
    const [r, g, b] = spec?.color ?? [1, 0, 1];
    material.diffuseColor = new Color3(r, g, b);
    material.specularColor = Color3.Black();
    material.maxSimultaneousLights = 2;
    materials.set(group, material);
  }

  const root = new TransformNode('character:root', scene);
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
    const mesh = CreateBox(
      `character:mesh:${part.joint}`,
      { width: part.sizeM.x, height: part.sizeM.y, depth: part.sizeM.z },
      scene,
    );
    mesh.parent = parent;
    mesh.position.set(part.localCentreM.x, part.localCentreM.y, part.localCentreM.z);
    mesh.material = materials.get(part.group) ?? null;
    mesh.isPickable = false;
    meshes.push(mesh);
  }

  const characterScene: CharacterScene = {
    version: CHARACTER_SCENE_VERSION,
    root,
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
