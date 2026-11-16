import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { QualityPreferences } from '../../settings';
import {
  POST_PROCESSING_PRESETS,
  resolveQuality,
  createAdaptiveQuality,
  effectiveResolutionScale,
} from '../quality-policy';
import type { QualitySample } from '../quality-policy';
import { createAtmosphereState, type AtmosphereState } from '../atmosphere';
import { createAtmosphereScene } from './atmosphere-scene';
import { createPostProcessing } from './post-processing';

export type DaylightMaterial =
  'road' | 'marking' | 'vehicle' | 'signalHousing' | 'red' | 'amber' | 'green';
export interface QualityViewport {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}
/**
 * PBI 157 — explicit shadow-map budget.
 *
 * `essential` is the vehicle the player is looking at, `standard` is simulated traffic, `optional`
 * is small scenery. Admission is priority-first and insertion-stable inside a priority, so a
 * bounded map never drops the essential caster in favour of a prop. What never enters the map is
 * declared here as well: the static city layout only receives shadows, the 146 decor and the
 * emissive markings/lamps are unlit, and nothing outside the registered set is submitted.
 */
export type ShadowCasterPriority = 'essential' | 'standard' | 'optional';
export const SHADOW_CASTER_PRIORITIES: readonly ShadowCasterPriority[] = Object.freeze([
  'essential',
  'standard',
  'optional',
]);
export const SHADOW_MAP_CONTENT = Object.freeze({
  includes: Object.freeze([
    'vehiculele selectate (essential)',
    'traficul simulat din fereastra jocului (standard)',
    'decorul mic care aruncă umbră (optional)',
  ]),
  excludes: Object.freeze([
    'layout-ul static 042 (doar receiveShadows, fără caster)',
    'decorul 146 (batch static, nu se înregistrează)',
    'marcaje și lămpi emisive (materiale unlit)',
    'orice mesh neînregistrat explicit',
  ]),
});

/** Scene-local resource owner: presentation only, no simulation ports or authority. */
export function createDaylight(
  scene: Scene,
  initial: QualityPreferences,
  initialViewport: QualityViewport,
) {
  if (scene.isDisposed) throw new Error('Scene disposed');
  let preferences = { ...initial };
  let viewport = { ...initialViewport };
  // PBI 240: scara adaptivă a rezoluției se aplică peste `resolutionScale` ales de jucător.
  const newAdaptation = (preferred: QualityPreferences) =>
    createAdaptiveQuality(preferred.preset, preferred.adaptive, { adaptResolution: true });
  let adaptation = newAdaptation(initial);
  const resolve = (): ReturnType<typeof resolveQuality> =>
    resolveQuality(
      {
        ...preferences,
        resolutionScale: effectiveResolutionScale(
          preferences.resolutionScale,
          adaptation.getResolutionFactor(),
        ),
      },
      viewport.width,
      viewport.height,
      viewport.dpr,
    );
  let quality = resolve();
  let disposed = false;
  let shadow: ShadowGenerator | null = null;
  /** Insertion-ordered registry; the priority is the admission key of the bounded map. */
  const casters = new Map<AbstractMesh, ShadowCasterPriority>();
  const previousClear = scene.clearColor;
  // PBI 241: o singură configurație de imagine (`scene.imageProcessingConfiguration`) pentru toate
  // materialele; `post` o calibrează și decide dacă o aplică pipeline-ul sau materialele.
  const post = createPostProcessing(scene);
  // PBI 243: o singură stare de atmosferă dă cerul, ceața, culoarea de ștergere, cubul IBL, direcția
  // și culoarea soarelui și ambientul de rezervă; nimic din acestea nu mai are valori proprii aici.
  let atmosphereState = createAtmosphereState();
  const atmosphere = createAtmosphereScene(scene, quality.preset, atmosphereState);
  // Ambientul de rezervă: `StandardMaterial` nu citește `environmentTexture`, deci până când 245–249
  // trec totul pe PBR, o lumină hemisferică redusă (0,55 → 0,42, colorată după cer) ține scena
  // echilibrată. Un `PBRMaterial` primește ambientul din IBL: cât timp rămâne hemisfericul, el îl
  // dublează, deci fiecare PBI PBR coboară `setLegacyAmbientIntensity` (0 când nu mai există
  // `StandardMaterial` în scenă).
  const ambient = new HemisphericLight('daylight-ambient', Vector3.Up(), scene);
  const sun = new DirectionalLight(
    'daylight-sun',
    new Vector3(...atmosphereState.sunLightDirection),
    scene,
  );
  sun.position.set(25, 45, -25);
  let legacyAmbientScale = 1;
  const applyAtmosphereLights = (): void => {
    const state = atmosphereState;
    ambient.intensity = state.legacyAmbient.intensity * legacyAmbientScale;
    ambient.diffuse = new Color3(...state.legacyAmbient.skyColor);
    ambient.groundColor = new Color3(...state.legacyAmbient.groundColor);
    sun.direction = new Vector3(...state.sunLightDirection);
    sun.diffuse = new Color3(...state.sun.lightColor);
    sun.intensity = state.sun.lightIntensity;
  };
  applyAtmosphereLights();
  const palette: Record<DaylightMaterial, [number, number, number]> = {
    road: [0.17, 0.19, 0.22],
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
    for (const caster of casters.keys()) if (caster.isDisposed()) casters.delete(caster);
    const map = shadow?.getShadowMap();
    if (map)
      map.renderList = [...casters.entries()]
        // Array#sort is stable: equal priorities keep the registration order PBI016 declared.
        .sort(
          ([, left], [, right]) =>
            SHADOW_CASTER_PRIORITIES.indexOf(left) - SHADOW_CASTER_PRIORITIES.indexOf(right),
        )
        .map(([mesh]) => mesh)
        .slice(0, quality.limits.maxShadowCasters);
  };
  /**
   * Rezoluția internă = dimensiunea CSS × min(DPR, maxDpr) × scara. Se exprimă ca nivel hardware
   * (inversul factorului) ca să rămână corectă și când ciclul de viață chemă `engine.resize()`,
   * care citește dimensiunea CSS a canvasului; `setSize` direct ar fi fost suprascris la primul resize.
   */
  const applyResolution = (): void => {
    const factor = quality.effectiveDpr * quality.resolutionScale;
    // Epsilon: `floor(css / (1 / factor))` nu are voie să piardă un pixel din cauza rotunjirii.
    scene.getEngine().setHardwareScalingLevel(1 / (factor * (1 + 1e-9)));
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
    post.setPreset(quality.preset);
    // Pe LOW nu există pipeline: imaginea o aplică materialele, iar cerul și fundalul fac la fel.
    atmosphere.setImageByMaterials(!POST_PROCESSING_PRESETS[quality.preset].pipeline);
    atmosphere.setPreset(quality.preset);
    applyResolution();
  };
  apply();
  return {
    getQuality: () => quality,
    /** PBI 243: starea de atmosferă curentă (cer, ceață, IBL, soare). */
    getAtmosphere: () => atmosphereState,
    getAtmosphereStats: () => atmosphere.getStats(),
    /** Aplică o stare nouă de atmosferă (252: ora din zi); regenerează cubul IBL o singură dată. */
    setAtmosphere(next: AtmosphereState): void {
      assertActive();
      atmosphereState = next;
      atmosphere.apply(next);
      applyAtmosphereLights();
    },
    /** 0..1: scara ambientului hemisferic de rezervă; 245–249 îl coboară când IBL îl înlocuiește. */
    setLegacyAmbientScale(scale: number): void {
      assertActive();
      if (!(scale >= 0 && scale <= 1)) throw new Error('Scară de ambient invalidă');
      legacyAmbientScale = scale;
      applyAtmosphereLights();
    },
    /** PBI 241: camera de joc la care se atașează AA și post-procesarea (fără ea, doar materialele). */
    attachCamera(camera: Camera | null): void {
      assertActive();
      post.attachCamera(camera);
    },
    getPostProcessingState: () => post.getState(),
    material(key: DaylightMaterial): StandardMaterial {
      assertActive();
      const value = materials.get(key);
      if (!value) throw new Error('Unknown daylight material');
      return value;
    },
    applyPreferences(next: QualityPreferences, nextViewport: QualityViewport = viewport): void {
      assertActive();
      // Validează înainte de a muta starea: o intrare greșită nu lasă jumătate din schimbare.
      resolveQuality(next, nextViewport.width, nextViewport.height, nextViewport.dpr);
      preferences = { ...next };
      viewport = { ...nextViewport };
      adaptation = newAdaptation(next);
      quality = resolve();
      apply();
    },
    /** Dimensiune CSS sau DPR nou (fereastră, ecran complet, alt monitor): fără recrearea scenei. */
    resize(nextViewport: QualityViewport): void {
      assertActive();
      resolveQuality(preferences, nextViewport.width, nextViewport.height, nextViewport.dpr);
      viewport = { ...nextViewport };
      quality = resolve();
      applyResolution();
    },
    observe(sample: QualitySample, nowMs: number): boolean {
      assertActive();
      const factorBefore = adaptation.getResolutionFactor();
      const next = adaptation.sample(sample, nowMs);
      const factorChanged = adaptation.getResolutionFactor() !== factorBefore;
      if (!next && !factorChanged) return false;
      if (next) preferences = { ...preferences, preset: next };
      quality = resolve();
      if (next) apply();
      else applyResolution();
      return true;
    },
    /** Starea adaptivă pentru panoul Diagnostic: factorul, scara efectivă și rezoluția internă. */
    getResolutionState() {
      return Object.freeze({
        factor: adaptation.getResolutionFactor(),
        baseScale: preferences.resolutionScale,
        effectiveScale: quality.resolutionScale,
        effectiveDpr: quality.effectiveDpr,
        internalWidth: quality.internalWidth,
        internalHeight: quality.internalHeight,
      });
    },
    addShadowCaster(mesh: AbstractMesh, priority: ShadowCasterPriority = 'standard'): boolean {
      assertActive();
      if (mesh.getScene() !== scene || mesh.isDisposed()) throw new Error('Invalid shadow caster');
      if (!SHADOW_CASTER_PRIORITIES.includes(priority)) throw new Error('Invalid shadow priority');
      if (casters.has(mesh)) {
        // A promotion/demotion never recreates the entry; the insertion order stays stable.
        casters.set(mesh, priority);
        syncCasters();
        return true;
      }
      syncCasters();
      // Absolute HIGH cap bounds retained resources even while LOW is active.
      if (casters.size >= 96) return false;
      casters.set(mesh, priority);
      syncCasters();
      return true;
    },
    removeShadowCaster(mesh: AbstractMesh): void {
      assertActive();
      casters.delete(mesh);
      syncCasters();
    },
    /** Read-only view of the declared budget: what is in the map, what was rejected and why. */
    getShadowBudget() {
      assertActive();
      const limit = quality.limits.maxShadowCasters;
      const list = shadow?.getShadowMap()?.renderList ?? [];
      const admitted = new Set(list);
      const byPriority: Record<ShadowCasterPriority, number> = {
        essential: 0,
        standard: 0,
        optional: 0,
      };
      const retainedByPriority: Record<ShadowCasterPriority, number> = {
        essential: 0,
        standard: 0,
        optional: 0,
      };
      let essentialDropped = 0;
      let essentialExcluded = 0;
      for (const [mesh, priority] of casters) {
        retainedByPriority[priority] += 1;
        if (!admitted.has(mesh)) {
          if (priority === 'essential') {
            if (limit === 0) essentialExcluded += 1;
            else essentialDropped += 1;
          }
          continue;
        }
        byPriority[priority] += 1;
      }
      return Object.freeze({
        preset: quality.preset,
        limit,
        shadowMapSize: quality.limits.shadowMapSize,
        shadowDistanceM: quality.limits.shadowDistance,
        registered: casters.size,
        admitted: list.length,
        rejected: casters.size - list.length,
        essentialDropped,
        /** Essential casters that stayed out because the preset disables the shadow map. */
        essentialExcluded,
        byPriority: Object.freeze(byPriority),
        retainedByPriority: Object.freeze(retainedByPriority),
        includes: SHADOW_MAP_CONTENT.includes,
        excludes: SHADOW_MAP_CONTENT.excludes,
      });
    },
    getResourceCounts: () => ({
      lights: disposed ? 0 : 2,
      materials: materials.size,
      shadowMaps: shadow ? 1 : 0,
      retainedCasters: casters.size,
      essentialCasters: [...casters.values()].filter((entry) => entry === 'essential').length,
    }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      shadow?.dispose();
      shadow = null;
      post.dispose();
      atmosphere.dispose();
      casters.clear();
      for (const material of materials.values()) material.dispose();
      materials.clear();
      ambient.dispose();
      sun.dispose();
      scene.clearColor = previousClear;
    },
  };
}
