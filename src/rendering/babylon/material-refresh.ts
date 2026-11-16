/**
 * Materialele orașului sunt înghețate (`freeze`): shaderul lor nu se mai recompilează singur. Ceața,
 * textura de mediu și `applyByPostProcess` schimbă defines-urile shaderului la nivel de scenă, deci
 * după o schimbare materialele înghețate rămân cu shaderul vechi (PBI 241 a găsit asta la LOW după
 * HIGH; PBI 243 la ceață și IBL). Soluția comună: dezgheață, marchează murdar, îngheață din nou după
 * ce shaderul nou a fost randat.
 *
 * Mai multe apeluri în aceeași fereastră (ex.: pipeline-ul și atmosfera schimbate în același cadru)
 * folosesc o singură stare per scenă, ca un material să nu fie înghețat prea devreme de celălalt.
 */
import { Constants } from '@babylonjs/core/Engines/constants.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import type { Observer } from '@babylonjs/core/Misc/observable.js';
import type { Scene } from '@babylonjs/core/scene.js';

/** Cadrele randate cu materialul dezghețat, înainte de a-l îngheța la loc. */
export const REFREEZE_AFTER_FRAMES = 3;

interface PendingRefresh {
  readonly refrozen: Set<Material>;
  observer: Observer<Scene> | null;
  frames: number;
}
const pending = new WeakMap<Scene, PendingRefresh>();

export function refreshFrozenMaterials(
  scene: Scene,
  dirtyFlag: number = Constants.MATERIAL_AllDirtyFlag,
): number {
  let state = pending.get(scene);
  if (!state) {
    state = { refrozen: new Set(), observer: null, frames: 0 };
    pending.set(scene, state);
  }
  const current = state;
  for (const material of scene.materials)
    if (material.isFrozen) {
      material.unfreeze();
      current.refrozen.add(material);
    }
  scene.markAllMaterialsAsDirty(dirtyFlag);
  if (current.refrozen.size === 0) return 0;
  current.frames = 0;
  if (!current.observer)
    current.observer = scene.onAfterRenderObservable.add(() => {
      if (++current.frames < REFREEZE_AFTER_FRAMES) return;
      scene.onAfterRenderObservable.remove(current.observer);
      current.observer = null;
      for (const material of current.refrozen)
        if (scene.materials.includes(material)) material.freeze();
      current.refrozen.clear();
      pending.delete(scene);
    });
  return current.refrozen.size;
}

/** Oprește reînghețarea în așteptare (la `dispose`): materialele rămân dezghețate, nu se pierd. */
export function cancelPendingRefresh(scene: Scene): void {
  const state = pending.get(scene);
  if (!state) return;
  if (state.observer) scene.onAfterRenderObservable.remove(state.observer);
  state.observer = null;
  for (const material of state.refrozen) if (scene.materials.includes(material)) material.freeze();
  state.refrozen.clear();
  pending.delete(scene);
}
