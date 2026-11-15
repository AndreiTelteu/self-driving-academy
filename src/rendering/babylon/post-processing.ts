/**
 * PBI 241 — un singur pipeline de culoare pentru toată scena.
 *
 * `scene.imageProcessingConfiguration` este unica configurație (tone mapping, expunere, contrast,
 * grading, vignetă, dithering). Fiecare material o folosește implicit; nicio configurație paralelă
 * nu mai există. Imaginea se procesează exact o dată:
 *
 * - cu pipeline (MEDIUM/HIGH) `DefaultRenderingPipeline` creează `ImageProcessingPostProcess`, care
 *   pune `applyByPostProcess = true`: materialele nu mai aplică nimic, iar pipeline-ul aplică totul
 *   pe ținta HDR half-float;
 * - fără pipeline (LOW) `applyByPostProcess` rămâne `false`: materialele aplică tone mappingul în
 *   shader, iar un singur `FxaaPostProcess` netezește marginile pe ținta LDR.
 *
 * Decizia de tone mapping: Khronos PBR Neutral. ACES (cel folosit înainte numai pe materialele
 * `daylight-*`) deplasează nuanțele (galbenul și albastrul virează) și întunecă tonurile medii; PBR
 * Neutral păstrează culoarea de bază a materialelor sub vârf și comprimă numai luminile puternice,
 * ceea ce dă imaginea curată și naturală cerută de documentul 30. Compară capturile din
 * `Docs/Evidence/241-post-processing/`.
 */
import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { FxaaPostProcess } from '@babylonjs/core/PostProcesses/fxaaPostProcess.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import type { Observer } from '@babylonjs/core/Misc/observable.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { POST_PROCESSING_PRESETS, type QualityPreset } from '../quality-policy';

/** Calibrarea imaginii (HDR liniar → ecran). Valorile sunt verificate pe capturile 239. */
export const LOOK = Object.freeze({
  toneMapping: ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL,
  exposure: 1.45,
  contrast: 1,
  /** Cerul (culoarea de ștergere) așa cum apare pe ecran, în spațiul de afișare. */
  sky: [0.55, 0.74, 0.88] as const,
  vignetteWeight: 1.2,
  ditheringIntensity: 1 / 255,
  bloomThreshold: 2.5,
  bloomWeight: 0.18,
  bloomKernel: 48,
  bloomScale: 0.5,
  sharpenEdgeAmount: 0.25,
});

export type PostProcessingMode = 'MATERIAL_FXAA' | 'PIPELINE';
export interface PostProcessingState {
  readonly preset: QualityPreset | null;
  readonly mode: PostProcessingMode | 'NONE';
  /** `true` când imaginea (tone mapping, grading) este aplicată de un post-proces, nu de materiale. */
  readonly imageProcessingByPostProcess: boolean;
  readonly imageProcessingEnabled: boolean;
  readonly toneMappingEnabled: boolean;
  readonly antialias: 'FXAA' | 'MSAA' | 'NONE';
  readonly msaaSamples: number;
  readonly hdr: boolean;
  readonly textureType: 'HALF_FLOAT' | 'FLOAT' | 'UNSIGNED_BYTE' | 'NONE';
  readonly bloom: boolean;
  readonly sharpen: boolean;
  readonly vignette: boolean;
  readonly grading: boolean;
  readonly dithering: boolean;
  readonly cameraAttached: boolean;
}

function warmGrade(): ColorCurves {
  const curves = new ColorCurves();
  // Neutru-cald: lumini puțin calde, umbre ușor răcite, saturație globală aproape neschimbată.
  curves.globalSaturation = 8;
  curves.highlightsHue = 40;
  curves.highlightsDensity = 8;
  curves.highlightsSaturation = 0;
  curves.shadowsHue = 215;
  curves.shadowsDensity = 6;
  curves.shadowsSaturation = 0;
  return curves;
}

export function createPostProcessing(scene: Scene) {
  const config = scene.imageProcessingConfiguration;
  const previous = {
    toneMappingEnabled: config.toneMappingEnabled,
    toneMappingType: config.toneMappingType,
    exposure: config.exposure,
    contrast: config.contrast,
    vignetteEnabled: config.vignetteEnabled,
    vignetteWeight: config.vignetteWeight,
    vignetteStretch: config.vignetteStretch,
    vignetteColor: config.vignetteColor.clone(),
    vignetteBlendMode: config.vignetteBlendMode,
    colorCurves: config.colorCurves,
    ditheringIntensity: config.ditheringIntensity,
    colorCurvesEnabled: config.colorCurvesEnabled,
    ditheringEnabled: config.ditheringEnabled,
  };
  config.toneMappingEnabled = true;
  config.toneMappingType = LOOK.toneMapping;
  config.exposure = LOOK.exposure;
  config.contrast = LOOK.contrast;
  config.vignetteWeight = LOOK.vignetteWeight;
  config.vignetteStretch = 0;
  config.vignetteColor = new Color4(0, 0, 0, 0);
  config.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
  config.ditheringIntensity = LOOK.ditheringIntensity;
  config.colorCurves = warmGrade();

  let camera: Camera | null = null;
  let preset: QualityPreset | null = null;
  let pipeline: DefaultRenderingPipeline | null = null;
  let fxaa: FxaaPostProcess | null = null;
  let disposed = false;

  /**
   * Materialele orașului sunt înghețate (`freeze`) și nu se recompilează singure: fără asta păstrează
   * shaderul compilat cu vechiul `applyByPostProcess` (LOW rămânea fără conversia în gamma după HIGH).
   * Le dezghețăm, le marcăm murdare și le înghețăm din nou după ce shaderul nou a fost randat.
   */
  const refrozen = new Set<Material>();
  let refreezeObserver: Observer<Scene> | null = null;
  const recompileMaterials = (): void => {
    for (const material of scene.materials)
      if (material.isFrozen) {
        material.unfreeze();
        refrozen.add(material);
      }
    scene.markAllMaterialsAsDirty(Constants.MATERIAL_ImageProcessingDirtyFlag);
    if (refrozen.size === 0 || refreezeObserver) return;
    let frames = 0;
    refreezeObserver = scene.onAfterRenderObservable.add(() => {
      if (++frames < 3) return;
      scene.onAfterRenderObservable.remove(refreezeObserver);
      refreezeObserver = null;
      for (const material of refrozen) if (scene.materials.includes(material)) material.freeze();
      refrozen.clear();
    });
  };

  const releasePasses = (): void => {
    // `dispose` repune `applyByPostProcess = false`; apoi materialele aplică din nou imaginea.
    pipeline?.dispose();
    pipeline = null;
    if (fxaa) {
      fxaa.dispose(camera ?? undefined);
      fxaa = null;
    }
  };

  const apply = (): void => {
    releasePasses();
    // Materialele își compilează shaderul după `applyByPostProcess`; după demontarea pipeline-ului
    // (sau montare) trebuie recompilate, altfel LOW păstrează un shader care nu face conversia în gamma.
    config.applyByPostProcess = false;
    recompileMaterials();
    if (preset === null) return;
    const tier = POST_PROCESSING_PRESETS[preset];
    // Ținta HDR a pipeline-ului este liniară (convertită la ieșire); LOW șterge direct în ecran.
    const sky = Color3.FromArray([...LOOK.sky]);
    const clear = tier.pipeline ? sky.toLinearSpace() : sky;
    scene.clearColor = new Color4(clear.r, clear.g, clear.b, 1);
    config.vignetteEnabled = tier.vignette;
    config.colorCurvesEnabled = tier.grading;
    config.ditheringEnabled = tier.dithering;
    if (!camera) return;
    const engine = scene.getEngine();
    if (!tier.pipeline) {
      fxaa = new FxaaPostProcess(
        'daylight-fxaa',
        1,
        camera,
        Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
        engine,
        false,
        Constants.TEXTURETYPE_UNSIGNED_BYTE,
      );
      return;
    }
    const next = new DefaultRenderingPipeline('daylight-post', true, scene, [camera], false);
    next.imageProcessingEnabled = true;
    next.fxaaEnabled = tier.antialias === 'FXAA';
    next.samples = tier.msaaSamples;
    next.bloomEnabled = tier.bloom;
    if (tier.bloom) {
      next.bloomThreshold = LOOK.bloomThreshold;
      next.bloomWeight = LOOK.bloomWeight;
      next.bloomKernel = LOOK.bloomKernel;
      next.bloomScale = LOOK.bloomScale;
    }
    next.sharpenEnabled = tier.sharpen;
    if (tier.sharpen) next.sharpen.edgeAmount = LOOK.sharpenEdgeAmount;
    next.prepare();
    pipeline = next;
  };

  return {
    /** Camera la care se atașează trecerile; chemată după crearea camerei de joc. */
    attachCamera(next: Camera | null): void {
      if (disposed || camera === next) return;
      releasePasses();
      camera = next;
      apply();
    },
    /** Comutare live de preset: dezasamblează trecerile vechi și le construiește pe cele noi. */
    setPreset(next: QualityPreset): void {
      if (disposed) return;
      preset = next;
      apply();
    },
    getState(): PostProcessingState {
      const tier = preset ? POST_PROCESSING_PRESETS[preset] : null;
      const byPipeline = pipeline !== null;
      const mode: PostProcessingState['mode'] = byPipeline
        ? 'PIPELINE'
        : fxaa
          ? 'MATERIAL_FXAA'
          : 'NONE';
      const type = pipeline
        ? ((
            {
              [Constants.TEXTURETYPE_HALF_FLOAT]: 'HALF_FLOAT',
              [Constants.TEXTURETYPE_FLOAT]: 'FLOAT',
            } as Record<number, 'HALF_FLOAT' | 'FLOAT'>
          )[
            (pipeline as unknown as { _defaultPipelineTextureType: number })
              ._defaultPipelineTextureType
          ] ?? 'UNSIGNED_BYTE')
        : fxaa
          ? 'UNSIGNED_BYTE'
          : 'NONE';
      return Object.freeze({
        preset,
        mode,
        imageProcessingByPostProcess: config.applyByPostProcess,
        imageProcessingEnabled: config.isEnabled,
        toneMappingEnabled: config.toneMappingEnabled,
        antialias: byPipeline || fxaa ? (tier?.antialias ?? 'NONE') : 'NONE',
        msaaSamples: pipeline ? pipeline.samples : 1,
        hdr: type === 'HALF_FLOAT' || type === 'FLOAT',
        textureType: type,
        bloom: pipeline?.bloomEnabled ?? false,
        sharpen: pipeline?.sharpenEnabled ?? false,
        vignette: config.vignetteEnabled,
        grading: config.colorCurvesEnabled,
        dithering: config.ditheringEnabled,
        cameraAttached: camera !== null,
      });
    },
    dispose(): void {
      if (disposed) return;
      releasePasses();
      if (refreezeObserver) scene.onAfterRenderObservable.remove(refreezeObserver);
      refreezeObserver = null;
      disposed = true;
      Object.assign(config, previous);
    },
  };
}
