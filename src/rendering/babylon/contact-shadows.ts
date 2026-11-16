/**
 * PBI 244 — umbre de contact ieftine pentru LOW (fără shadow map).
 *
 * Un cvadrilater orizontal, translucid, cu un gradient moale (superelipsă), sub fiecare vehicul și sub
 * personaj. O singură textură 64×64 și un singur material; fiecare umbră este o instanță a aceluiași
 * mesh, copil al rădăcinii țintei (urmărește poziția și yaw-ul fără cod pe cadru). Costul: o
 * desenare instanțiată per țintă, fără pass suplimentar. Nu aruncă umbră pe clădiri sau decor.
 */
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';

export interface ContactShadowTarget {
  readonly id: string;
  readonly root: TransformNode;
  /** Dimensiunile amprentei în axele locale ale rădăcinii (m). */
  readonly extentX: number;
  readonly extentZ: number;
  /** Cât de mult depășește umbra amprenta (1 = exact; 1,25 = o aureolă moale). */
  readonly spread?: number;
}

const TEXTURE_SIZE = 64;
/** Opacitatea maximă a umbrei de contact (centrul). */
export const CONTACT_SHADOW_ALPHA = 0.55;
/** Ridicare peste suprafață (m); polygon offset-ul câștigă în fața marcajelor. */
const LIFT_M = 0.02;

/** Gradient moale pe o superelipsă: 0 la margine, 1 în centru (pur, testabil). */
export function contactShadowAlpha(u: number, v: number): number {
  const p = 3;
  const d = (Math.abs(u) ** p + Math.abs(v) ** p) ** (1 / p);
  const a = Math.min(1, Math.max(0, (1 - d) / 0.7));
  return a * a * (3 - 2 * a);
}

export interface ContactShadows {
  /** Aliniază umbrele cu țintele date; cele care nu mai există se elimină. */
  sync(targets: readonly ContactShadowTarget[]): void;
  readonly count: number;
  dispose(): void;
}

export function createContactShadows(scene: Scene): ContactShadows {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let y = 0; y < TEXTURE_SIZE; y += 1)
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const u = ((x + 0.5) / TEXTURE_SIZE) * 2 - 1;
      const v = ((y + 0.5) / TEXTURE_SIZE) * 2 - 1;
      data[(y * TEXTURE_SIZE + x) * 4 + 3] = Math.round(
        255 * CONTACT_SHADOW_ALPHA * contactShadowAlpha(u, v),
      );
    }
  const texture = new RawTexture(
    data,
    TEXTURE_SIZE,
    TEXTURE_SIZE,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
  );
  texture.name = 'contact-shadow:gradient';
  texture.hasAlpha = true;
  texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  const material = new StandardMaterial('contact-shadow', scene);
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.zOffset = -4;
  material.zOffsetUnits = -4;
  material.freeze();
  const template: Mesh = CreateGround('contact-shadow:template', { width: 1, height: 1 }, scene);
  template.material = material;
  template.isPickable = false;
  // Sursa nu se desenează, dar instanțele ei da (`isVisible`, nu `setEnabled`).
  template.isVisible = false;
  const shadows = new Map<string, InstancedMesh>();
  let disposed = false;
  return {
    sync(targets): void {
      if (disposed) return;
      const live = new Set<string>();
      for (const target of targets) {
        live.add(target.id);
        let shadow = shadows.get(target.id);
        if (!shadow || shadow.isDisposed() || shadow.parent !== target.root) {
          shadow?.dispose();
          shadow = template.createInstance(`contact-shadow:${target.id}`);
          shadow.parent = target.root;
          shadow.isPickable = false;
          shadow.position.set(0, LIFT_M, 0);
          shadow.alwaysSelectAsActiveMesh = false;
          shadows.set(target.id, shadow);
        }
        const spread = target.spread ?? 1.25;
        shadow.scaling.set(target.extentX * spread, 1, target.extentZ * spread);
      }
      for (const [id, shadow] of shadows)
        if (!live.has(id) || shadow.isDisposed()) {
          shadow.dispose();
          shadows.delete(id);
        }
    },
    get count(): number {
      return shadows.size;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const shadow of shadows.values()) shadow.dispose();
      shadows.clear();
      template.dispose(false, false);
      material.dispose(false, true);
    },
  };
}
