/**
 * PBI 244 — ocluzie ambientală în spațiu-ecran (SSAO2).
 *
 * Alegerea implementării (verificată pe Babylon 9.29, `amd rdna-2`):
 * - **SSAO2** (nu GTAO: 9.29 nu are GTAO). Conductă separată de `DefaultRenderingPipeline`, atașată
 *   *după* ea pe aceeași cameră: combinarea AO rulează pe imaginea LDR finală, deci MSAA 4× al
 *   conductei principale rămâne intact (cu AO înainte, ținta cu MSAA ar fi fost cea a SSAO).
 * - **Buffer de geometrie clasic** (`forceGeometryBuffer = true`), nu PrePass: PrePass ar cere ca
 *   toate materialele (inclusiv shaderul propriu al cerului, 243) să scrie în MRT și s-ar lega de
 *   MSAA; bufferul clasic randează adâncime + normale într-o trecere proprie, independentă de
 *   materiale. Domul cerului (rază 1000 m, `infiniteDistance`) intră în trecere, dar `maxZ` (120 m)
 *   îl ignoră: nu apar aureole la silueta clădirilor.
 * - Rază mică, `maxZ` scurt și blur bilateral „scump" pe HIGH: contactul (roți, baza decorului,
 *   colțul clădire–trotuar) se întunecă, fără pete mari sau aureole.
 */
// Extensiile MRT (WebGL2 și WebGPU) și componenta de scenă a bufferului de geometrie: fără ele
// `createMultipleRenderTarget` lipsește din motor.
import '@babylonjs/core/Engines/Extensions/engine.multiRender.js';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.multiRender.js';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AmbientOcclusionTier } from '../quality-policy';

/** Adancime la infinit pentru pixelii fara geometrie (in limita half-float, 65504). */
const FAR_DEPTH = 30000;

export interface AmbientOcclusionState {
  readonly enabled: boolean;
  readonly implementation: 'SSAO2' | 'NONE';
  readonly geometryBuffer: 'GEOMETRY_BUFFER' | 'NONE';
  readonly samples: number;
  readonly radius: number;
  readonly totalStrength: number;
  readonly resolutionRatio: number;
  readonly blurRatio: number;
  readonly supported: boolean;
}

export const NO_AMBIENT_OCCLUSION: AmbientOcclusionState = Object.freeze({
  enabled: false,
  implementation: 'NONE',
  geometryBuffer: 'NONE',
  samples: 0,
  radius: 0,
  totalStrength: 0,
  resolutionRatio: 0,
  blurRatio: 0,
  supported: true,
});

export interface AmbientOcclusion {
  readonly state: AmbientOcclusionState;
  dispose(): void;
}

/**
 * Babylon 9.29: `GeometryBufferRenderer.dispose` (chemat si de setterii `enableDepth`/`enableNormal`/
 * `scale` pe care SSAO2 ii foloseste la creare) nu elibereaza textura de adancime
 * "gBuffer-DepthStencil" din cache-ul motorului: cate 2 la fiecare creare a pipeline-ului (masurat in
 * browser: +42 de texturi interne dupa 20 de cicluri HIGH/MEDIUM/LOW; HEAD fara AO: 0). Orice astfel
 * de textura care nu este cea vie a bufferului de geometrie curent este orfana si se elibereaza.
 */
export function purgeLeakedGeometryDepth(scene: Scene): number {
  const engine = scene.getEngine();
  const cache = engine.getLoadedTexturesCache();
  const live = (
    scene.geometryBufferRenderer?.getGBuffer() as unknown as {
      renderTarget?: { depthStencilTexture?: unknown } | null;
    } | null
  )?.renderTarget?.depthStencilTexture;
  let purged = 0;
  for (const texture of [...cache]) {
    if (texture.label !== 'gBuffer-DepthStencil' || texture === live) continue;
    texture.dispose();
    // Pe WebGPU intrarea ramane in cache chiar dupa dispose (references < 0): o scoatem explicit.
    const index = cache.indexOf(texture);
    if (index >= 0) cache.splice(index, 1);
    purged += 1;
  }
  return purged;
}

export function createAmbientOcclusion(
  scene: Scene,
  camera: Camera,
  tier: AmbientOcclusionTier,
): AmbientOcclusion | null {
  if (!tier.enabled) return null;
  // Bufferul de geometrie la o fractiune din rezolutie (costul AO este dominat de el si de blur):
  // trebuie creat inainte de pipeline, care il refoloseste.
  scene.enableGeometryBufferRenderer(tier.geometryScale);
  const pipeline = new SSAO2RenderingPipeline(
    'daylight-ssao',
    scene,
    { ssaoRatio: tier.resolutionRatio, blurRatio: tier.blurRatio },
    [camera],
    true,
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
  );
  if (!pipeline.isSupported) {
    pipeline.dispose();
    return null;
  }
  // Domul cerului nu are voie să intre în adâncimea AO (ar întuneca tot cerul): lista bufferului de
  // geometrie este scena fără dom, ținută la zi prin observatori (meshurile apar și dispar).
  const renderer = scene.geometryBufferRenderer;
  const included = (mesh: AbstractMesh): boolean => !mesh.name.startsWith('atmosphere:');
  const list: AbstractMesh[] = scene.meshes.filter(included);
  if (renderer) {
    renderer.renderList = list;
    // Pixelii fara geometrie (cerul) raman la valoarea de stergere a bufferului: implicit 0 = lipit de
    // camera, adica ocluzie maxima pe tot cerul. Valoarea de stergere devine foarte departe
    // (SSAO2 estompeaza ocluzia spre maxZ). Camp privat al lui Babylon 9.29: dacă dispare la un
    // upgrade, eșuăm explicit în loc să întunecăm tot cerul în tăcere.
    const clear = (renderer as unknown as { _clearColor?: Color4 })._clearColor;
    if (!clear) {
      pipeline.dispose();
      throw new Error(
        'GeometryBufferRenderer._clearColor lipsește: verifică AO după upgrade-ul Babylon.',
      );
    }
    clear.r = FAR_DEPTH;
  }
  const added = scene.onNewMeshAddedObservable.add((mesh) => {
    if (included(mesh)) list.push(mesh);
  });
  const removed = scene.onMeshRemovedObservable.add((mesh) => {
    const index = list.indexOf(mesh);
    if (index >= 0) list.splice(index, 1);
  });
  purgeLeakedGeometryDepth(scene);
  pipeline.samples = tier.samples;
  pipeline.radius = tier.radius;
  pipeline.totalStrength = tier.totalStrength;
  pipeline.base = tier.base;
  pipeline.maxZ = tier.maxZ;
  pipeline.minZAspect = tier.minZAspect;
  pipeline.expensiveBlur = tier.expensiveBlur;
  if (tier.expensiveBlur) {
    pipeline.bilateralSamples = 12;
    pipeline.bilateralSoften = 0.2;
    pipeline.bilateralTolerance = 0.1;
  }
  const state: AmbientOcclusionState = Object.freeze({
    enabled: true,
    implementation: 'SSAO2',
    geometryBuffer: 'GEOMETRY_BUFFER',
    samples: tier.samples,
    radius: tier.radius,
    totalStrength: tier.totalStrength,
    resolutionRatio: tier.resolutionRatio,
    blurRatio: tier.blurRatio,
    supported: true,
  });
  let disposed = false;
  return {
    state,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      scene.onNewMeshAddedObservable.remove(added);
      scene.onMeshRemovedObservable.remove(removed);
      const renderer = scene.geometryBufferRenderer;
      if (renderer) renderer.renderList = null;
      // `true`: opreste si bufferul de geometrie (altfel ramane activ si se randeaza la fiecare cadru).
      pipeline.dispose(true);
      purgeLeakedGeometryDepth(scene);
    },
  };
}
