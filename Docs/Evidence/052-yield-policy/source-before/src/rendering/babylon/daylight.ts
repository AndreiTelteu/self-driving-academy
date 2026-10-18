import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { QualityPreferences } from '../../settings';
import { resolveQuality, createAdaptiveQuality } from '../quality-policy';
import type { QualitySample } from '../quality-policy';

export type DaylightMaterial =
  'road' | 'marking' | 'vehicle' | 'signalHousing' | 'red' | 'amber' | 'green';
export interface QualityViewport {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

/** Scene-local resource owner: presentation only, no simulation ports or authority. */
export function createDaylight(
  scene: Scene,
  initial: QualityPreferences,
  initialViewport: QualityViewport,
) {
  if (scene.isDisposed) throw new Error('Scene disposed');
  let preferences = { ...initial };
  let viewport = { ...initialViewport };
  let quality = resolveQuality(preferences, viewport.width, viewport.height, viewport.dpr);
  let adaptation = createAdaptiveQuality(initial.preset, initial.adaptive);
  let disposed = false;
  let shadow: ShadowGenerator | null = null;
  const casters = new Set<AbstractMesh>();
  const previousClear = scene.clearColor;
  const processing = new ImageProcessingConfiguration();
  processing.toneMappingEnabled = true;
  processing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  processing.exposure = 1;
  processing.contrast = 1;
  scene.clearColor = new Color4(0.55, 0.74, 0.88, 1);
  const ambient = new HemisphericLight('daylight-ambient', Vector3.Up(), scene);
  ambient.intensity = 0.75;
  ambient.groundColor = new Color3(0.25, 0.28, 0.3);
  const sun = new DirectionalLight('daylight-sun', new Vector3(-0.45, -1, 0.35).normalize(), scene);
  sun.position.set(25, 45, -25);
  sun.intensity = 1.1;
  const palette: Record<DaylightMaterial, [number, number, number]> = {
    road: [0.09, 0.11, 0.14],
    marking: [0.98, 0.95, 0.78],
    vehicle: [0.95, 0.62, 0.07],
    signalHousing: [0.018, 0.025, 0.03],
    red: [1, 0.025, 0.015],
    amber: [1, 0.62, 0.005],
    green: [0.015, 1, 0.08],
  };
  const materials = new Map<DaylightMaterial, StandardMaterial>();
  for (const [key, rgb] of Object.entries(palette)) {
    const material = new StandardMaterial(`daylight-${key}`, scene);
    material.imageProcessingConfiguration = processing;
    material.diffuseColor = new Color3(...rgb);
    material.specularColor = Color3.Black();
    material.maxSimultaneousLights = 2;
    if (['marking', 'red', 'amber', 'green'].includes(key)) {
      // Semantic signals remain visible with or without shadows at every quality.
      material.disableLighting = true;
      material.emissiveColor = new Color3(...rgb);
    }
    materials.set(key as DaylightMaterial, material);
  }
  const assertActive = (): void => {
    if (disposed || scene.isDisposed) throw new Error('Daylight disposed');
  };
  const syncCasters = (): void => {
    for (const caster of casters) if (caster.isDisposed()) casters.delete(caster);
    const map = shadow?.getShadowMap();
    if (map) map.renderList = [...casters].slice(0, quality.limits.maxShadowCasters);
  };
  const apply = (): void => {
    shadow?.dispose();
    shadow = null;
    const limits = quality.limits;
    if (limits.shadowMapSize) {
      sun.shadowMinZ = 1;
      sun.shadowMaxZ = limits.shadowDistance * 2;
      sun.autoUpdateExtends = false;
      sun.orthoLeft = sun.orthoBottom = -limits.shadowDistance / 2;
      sun.orthoRight = sun.orthoTop = limits.shadowDistance / 2;
      shadow = new ShadowGenerator(limits.shadowMapSize, sun);
      shadow.usePercentageCloserFiltering = true;
      shadow.filteringQuality = ShadowGenerator.QUALITY_LOW;
      shadow.bias = 0.0005;
      shadow.normalBias = 0.02;
      syncCasters();
    }
    scene.getEngine().setSize(quality.internalWidth, quality.internalHeight);
  };
  apply();
  return {
    getQuality: () => quality,
    material(key: DaylightMaterial): StandardMaterial {
      assertActive();
      const value = materials.get(key);
      if (!value) throw new Error('Unknown daylight material');
      return value;
    },
    applyPreferences(next: QualityPreferences, nextViewport: QualityViewport = viewport): void {
      assertActive();
      const resolved = resolveQuality(
        next,
        nextViewport.width,
        nextViewport.height,
        nextViewport.dpr,
      );
      preferences = { ...next };
      viewport = { ...nextViewport };
      quality = resolved;
      adaptation = createAdaptiveQuality(next.preset, next.adaptive);
      apply();
    },
    resize(nextViewport: QualityViewport): void {
      assertActive();
      quality = resolveQuality(
        preferences,
        nextViewport.width,
        nextViewport.height,
        nextViewport.dpr,
      );
      viewport = { ...nextViewport };
      scene.getEngine().setSize(quality.internalWidth, quality.internalHeight);
    },
    observe(sample: QualitySample, nowMs: number): boolean {
      assertActive();
      const next = adaptation.sample(sample, nowMs);
      if (!next) return false;
      preferences = { ...preferences, preset: next };
      quality = resolveQuality(preferences, viewport.width, viewport.height, viewport.dpr);
      apply();
      return true;
    },
    addShadowCaster(mesh: AbstractMesh): boolean {
      assertActive();
      if (mesh.getScene() !== scene || mesh.isDisposed()) throw new Error('Invalid shadow caster');
      if (casters.has(mesh)) return true;
      syncCasters();
      // Absolute HIGH cap bounds retained resources even while LOW is active.
      if (casters.size >= 96) return false;
      casters.add(mesh);
      syncCasters();
      return true;
    },
    removeShadowCaster(mesh: AbstractMesh): void {
      assertActive();
      casters.delete(mesh);
      syncCasters();
    },
    getResourceCounts: () => ({
      lights: disposed ? 0 : 2,
      materials: materials.size,
      shadowMaps: shadow ? 1 : 0,
      retainedCasters: casters.size,
    }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      shadow?.dispose();
      shadow = null;
      casters.clear();
      for (const material of materials.values()) material.dispose();
      materials.clear();
      ambient.dispose();
      sun.dispose();
      scene.clearColor = previousClear;
    },
  };
}
