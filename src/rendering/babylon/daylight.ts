import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { QualityPreferences } from '../../settings';
import {
  POST_PROCESSING_PRESETS,
  SHADOW_PRESETS,
  resolveQuality,
  createAdaptiveQuality,
  effectiveResolutionScale,
} from '../quality-policy';
import type { QualityPreset, QualitySample, ShadowTier } from '../quality-policy';
import { createAtmosphereState, type AtmosphereState } from '../atmosphere';
import { followShadowFrame, groundFocus, type Vec3 } from '../shadow-math';
import { createAtmosphereScene } from './atmosphere-scene';
import { refreshFrozenMaterials } from './material-refresh';
import { createPostProcessing } from './post-processing';

export type DaylightMaterial =
  'road' | 'marking' | 'vehicle' | 'signalHousing' | 'red' | 'amber' | 'green';
export interface QualityViewport {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}
/**
 * PBI 157 — explicit shadow-map budget; PBI 244 — lista de conținut extinsă la toată scena.
 *
 * `essential` is the vehicle the player is looking at, `standard` is simulated traffic and the
 * character, `optional` is the static world (buildings, signal heads, decor 146). Admission is
 * priority-first and insertion-stable inside a priority, so a bounded map never drops the essential
 * caster in favour of a prop. Static (`optional`) casters farther than the shadow range from the
 * camera focus are left out of the list, so the cap is spent on what can reach the image.
 * Contract changed intentionally in 244: buildings, signal heads and decor now cast; the road,
 * sidewalk, curb and terrain only receive.
 */
export type ShadowCasterPriority = 'essential' | 'standard' | 'optional';
export const SHADOW_CASTER_PRIORITIES: readonly ShadowCasterPriority[] = Object.freeze([
  'essential',
  'standard',
  'optional',
]);
export const SHADOW_MAP_CONTENT = Object.freeze({
  includes: Object.freeze([
    'vehiculul urmărit (essential)',
    'traficul simulat și personajul (standard)',
    'clădirile 042, semafoarele și decorul 146 din raza hărții (optional)',
  ]),
  excludes: Object.freeze([
    'carosabil, trotuar, bordură și teren (doar receiveShadows, fără caster)',
    'marcaje și lămpi emisive (materiale unlit)',
    'roțile vehiculelor (instanțe; umbra caroseriei acoperă contactul, AO închide roata)',
    'orice mesh neînregistrat explicit',
  ]),
});
/** Marja (metri) în jurul razei hărții în care casterii statici rămân în lista de randare. */
const STATIC_CASTER_MARGIN_M = 90;
/** Cadre în care harta se randează fără pauză după fiecare (re)construire (shadere în compilare). */
const WARM_FRAMES = 45;
/** Plafonul registrului pentru casterii statici (`optional`), separat de cel esențial/standard. */
const OPTIONAL_CASTER_CAP = 192;
/** Cât de departe în față (m) este centrul hărții unice (MEDIUM) față de cameră. */
const MAP_FOCUS_AHEAD_M = 18;

export interface ShadowViewInput {
  readonly cameraPosition: Vec3;
  readonly cameraTarget: Vec3;
  /** Semnătura mișcării casterilor dinamici (vehicule, personaj); o schimbare invalidează harta. */
  readonly motionSignature: number;
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
  let shadow: ShadowGenerator | CascadedShadowGenerator | null = null;
  let gameCamera: Camera | null = null;
  /**
   * Cameră-proxy pentru cascade: aceeași poză și FOV ca a jocului, dar cu planuri apropiat/îndepărtat
   * (0,3 m / shadowMaxZ) în loc de 0,1 m / 3000 m. Cu raportul 30000:1 matricea inversă în float32
   * dă raze de sferă care variază cu yaw-ul (măsurat: 43 din 120 de pași de rotație cu deriva >0,02
   * texel pe ultima cascadă, harta se „mișcă” până la 0,47 texel); cu raportul ~470 deriva este 0.
   */
  let shadowCamera: FreeCamera | null = null;
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
    // 244: soarele schimbat invalidează umbrele cache-uite (singurul motiv static de re-randare).
    invalidateShadows('sun');
  };
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

  // ---- PBI 244: umbre ---------------------------------------------------------------------------
  /** Focarul hărții: de aici se decide care casteri statici intră în lista de randare. */
  let shadowFocus: Vec3 | null = null;
  let lastListFocus: Vec3 | null = null;
  let lastSignature = Number.NaN;
  let lastCameraKey = '';
  let lastCenterKey = '';
  let warmFrames = 0;
  let appliedKind = 'NONE';
  let shadowsAllowed = true;
  let activeTier: ShadowTier = SHADOW_PRESETS[quality.preset];
  /** HIGH cere CSM; un motor fără suport (NullEngine, WebGL1) coboară la o singură hartă mare. */
  const resolveShadowTier = (preset: QualityPreset): ShadowTier => {
    const tier = SHADOW_PRESETS[preset];
    if (tier.mode !== 'CASCADED' || CascadedShadowGenerator.IsSupported) return tier;
    return Object.freeze({ ...tier, mode: 'MAP', cascades: 1, shadowMaxZ: 80 });
  };
  let shadowFrames = 0;
  let shadowRenders = 0;
  const invalidations = new Map<string, number>();
  /** Raza (m) în jurul focarului în care un caster static poate arunca umbră vizibilă. */
  const staticReach = (): number => {
    const tier = activeTier;
    return (tier.mode === 'MAP' ? tier.shadowMaxZ : tier.shadowMaxZ + 20) + STATIC_CASTER_MARGIN_M;
  };
  function invalidateShadows(reason: string): void {
    invalidations.set(reason, (invalidations.get(reason) ?? 0) + 1);
    const map = shadow?.getShadowMap();
    if (map) map.resetRefreshCounter();
  }
  const orderedCasters = (): AbstractMesh[] => {
    const reach = staticReach();
    const focus = shadowFocus;
    return (
      [...casters.entries()]
        // Static casters out of reach cannot put a shadow in the image: keep the cap for the rest.
        .filter(([mesh, priority]) => {
          if (priority !== 'optional' || !focus) return true;
          const sphere = mesh.getBoundingInfo().boundingSphere;
          const c = sphere.centerWorld;
          return Math.hypot(c.x - focus[0], c.z - focus[2]) - sphere.radiusWorld <= reach;
        })
        // Array#sort is stable: equal priorities keep the registration order PBI016 declared.
        .sort(
          ([, left], [, right]) =>
            SHADOW_CASTER_PRIORITIES.indexOf(left) - SHADOW_CASTER_PRIORITIES.indexOf(right),
        )
        .map(([mesh]) => mesh)
        .slice(0, quality.limits.maxShadowCasters)
    );
  };
  const syncCasters = (): void => {
    for (const caster of casters.keys()) if (caster.isDisposed()) casters.delete(caster);
    const map = shadow?.getShadowMap();
    if (map) {
      map.renderList = orderedCasters();
      invalidateShadows('casters');
    }
  };
  const disposeShadow = (): void => {
    if (!shadow) return;
    shadow.dispose();
    shadow = null;
    shadowCamera?.dispose();
    shadowCamera = null;
    lastSignature = Number.NaN;
    lastCameraKey = '';
    lastCenterKey = '';
  };
  const syncShadowCamera = (): void => {
    const source = gameCamera as (Camera & { rotation?: Vector3 }) | null;
    if (!shadowCamera || !source?.rotation) return;
    shadowCamera.position.copyFrom(source.position);
    shadowCamera.rotation.copyFrom(source.rotation);
    shadowCamera.fov = source.fov;
    shadowCamera.fovMode = source.fovMode;
    // O cameră inactivă nu își actualizează matricele singură; CSM citește `getTransformationMatrix`.
    shadowCamera.getViewMatrix(true);
    shadowCamera.getProjectionMatrix(true);
  };
  const buildShadow = (): void => {
    disposeShadow();
    activeTier = resolveShadowTier(quality.preset);
    const tier = activeTier;
    warmFrames = WARM_FRAMES;
    if (!shadowsAllowed) {
      // diagnostic: fără hartă de umbră
    } else if (tier.mode === 'MAP') {
      const half = tier.shadowMaxZ / 2;
      sun.autoUpdateExtends = false;
      // Implicit Babylon lărgește frustumul cu 10% pe fiecare parte; texelul calculat în shadow-math
      // trebuie să fie exact cel al hărții, altfel alinierea nu cade pe rețea.
      sun.shadowOrthoScale = 0;
      sun.orthoLeft = sun.orthoBottom = -half;
      sun.orthoRight = sun.orthoTop = half;
      sun.shadowMinZ = 1;
      sun.shadowMaxZ = 2 * 100;
      // Float complet: o hartă de 200 m adâncime în half-float ar avea pași de ~10 cm.
      const generator = new ShadowGenerator(tier.mapSize, sun, true);
      generator.usePercentageCloserFiltering = tier.filter === 'PCF';
      generator.filteringQuality = ShadowGenerator[`QUALITY_${tier.filteringQuality}`];
      generator.forceBackFacesOnly = true;
      generator.bias = tier.bias;
      generator.normalBias = tier.normalBias;
      generator.setDarkness(tier.darkness);
      shadow = generator;
    } else if (tier.mode === 'CASCADED' && gameCamera) {
      shadowCamera = new FreeCamera('daylight-shadow-camera', Vector3.Zero(), scene);
      shadowCamera.minZ = 0.3;
      shadowCamera.maxZ = tier.shadowMaxZ;
      syncShadowCamera();
      const generator = new CascadedShadowGenerator(tier.mapSize, sun, false, shadowCamera);
      generator.numCascades = tier.cascades;
      generator.stabilizeCascades = true;
      generator.lambda = tier.lambda;
      generator.shadowMaxZ = tier.shadowMaxZ;
      generator.cascadeBlendPercentage = 0.15;
      generator.depthClamp = true;
      generator.autoCalcDepthBounds = false;
      generator.usePercentageCloserFiltering = tier.filter === 'PCF';
      generator.filteringQuality = ShadowGenerator[`QUALITY_${tier.filteringQuality}`];
      generator.forceBackFacesOnly = true;
      generator.bias = tier.bias;
      generator.normalBias = tier.normalBias;
      generator.setDarkness(tier.darkness);
      // Materialele caută generatorul după camera activă (a jocului), nu după proxy.
      sun.getShadowGenerators()?.set(gameCamera, generator);
      shadow = generator;
    }
    const map = shadow?.getShadowMap();
    if (map) {
      // Cache: o singură randare, repetată numai când `invalidateShadows` o cere (vezi updateShadows).
      map.refreshRate = tier.staticCache
        ? RenderTargetTexture.REFRESHRATE_RENDER_ONCE
        : RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME;
      map.onBeforeBindObservable.add(() => {
        shadowRenders += 1;
      });
    }
    syncCasters();
    // Generatorul schimbă defines-urile shaderului: materialele înghețate ale orașului (241/243)
    // trebuie recompilate, altfel rămân fără (sau cu) umbre după comutare. Numai la schimbare reală.
    const kind = shadow ? `${tier.mode}:${tier.cascades}` : 'NONE';
    if (kind !== appliedKind) {
      appliedKind = kind;
      refreshFrozenMaterials(scene, Constants.MATERIAL_LightDirtyFlag);
    }
  };
  /**
   * Chemată o dată pe cadru, înainte de randare: urmărește camera (MEDIUM: harta unică, aliniată pe
   * texeli) și decide dacă harta cache-uită trebuie randată din nou. Fără schimbare de soare, de
   * cameră sau de mișcare a casterilor dinamici, harta nu se mai randează (cache static).
   */
  const updateShadows = (view: ShadowViewInput): void => {
    if (disposed || scene.isDisposed) return;
    shadowFrames += 1;
    syncShadowCamera();
    const tier = activeTier;
    if (tier.mode === 'BLOB') return;
    const focus = groundFocus(view.cameraPosition, view.cameraTarget, MAP_FOCUS_AHEAD_M);
    // Lista casterilor statici se reface doar când focarul s-a mutat vizibil (nu la fiecare cadru).
    shadowFocus = [view.cameraPosition[0], 0, view.cameraPosition[2]];
    if (
      !lastListFocus ||
      Math.hypot(shadowFocus[0] - lastListFocus[0], shadowFocus[2] - lastListFocus[2]) > 12
    ) {
      lastListFocus = shadowFocus;
      syncCasters();
    }
    const map = shadow?.getShadowMap();
    if (!shadow || !map) return;
    let changed = false;
    if (tier.mode === 'MAP') {
      const half = tier.shadowMaxZ / 2;
      const direction: Vec3 = [sun.direction.x, sun.direction.y, sun.direction.z];
      const frame = followShadowFrame(focus, direction, half, tier.mapSize, 100);
      sun.position.set(...frame.position);
      sun.shadowMinZ = frame.minZ;
      sun.shadowMaxZ = frame.maxZ;
      const key = frame.center.map((value) => value.toFixed(5)).join(',');
      if (key !== lastCenterKey) {
        lastCenterKey = key;
        changed = true;
      }
    } else {
      const cameraKey = [...view.cameraPosition, ...view.cameraTarget]
        .map((value) => value.toFixed(4))
        .join(',');
      if (cameraKey !== lastCameraKey) {
        lastCameraKey = cameraKey;
        changed = true;
      }
    }
    if (view.motionSignature !== lastSignature) {
      lastSignature = view.motionSignature;
      changed = true;
    }
    if (changed || warmFrames > 0) {
      if (warmFrames > 0) warmFrames -= 1;
      invalidateShadows(changed ? 'view' : 'warmup');
    }
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
    buildShadow();
    post.setPreset(quality.preset);
    // Pe LOW nu există pipeline: imaginea o aplică materialele, iar cerul și fundalul fac la fel.
    atmosphere.setImageByMaterials(!POST_PROCESSING_PRESETS[quality.preset].pipeline);
    atmosphere.setPreset(quality.preset);
    applyResolution();
  };
  applyAtmosphereLights();
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
      gameCamera = camera;
      post.attachCamera(camera);
      // 244: cascadele (HIGH) se leagă de camera de joc, deci generatorul se reface aici.
      buildShadow();
    },
    getPostProcessingState: () => post.getState(),
    /** PBI 244: starea AO (activ, tier, texturi) pentru diagnostic și teste. */
    /** PBI 244 (diagnostic, DEV/capture): oprește umbrele și/sau AO ca să li se măsoare costul separat. */
    setEffects(effects: { shadows?: boolean; occlusion?: boolean }): void {
      assertActive();
      if (effects.occlusion !== undefined) post.setAmbientOcclusionAllowed(effects.occlusion);
      if (effects.shadows !== undefined && effects.shadows !== shadowsAllowed) {
        shadowsAllowed = effects.shadows;
        buildShadow();
      }
    },
    getAmbientOcclusionState: () => post.getAmbientOcclusionState(),
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
      // Absolute HIGH cap bounds retained resources even while LOW is active (157, neschimbat pentru
      // essential/standard). 244: casterii statici (clădiri, semafoare, celule de decor) au plafon propriu.
      const dynamicCount = [...casters.values()].filter((entry) => entry !== 'optional').length;
      if (
        priority === 'optional'
          ? casters.size - dynamicCount >= OPTIONAL_CASTER_CAP
          : dynamicCount >= 96
      )
        return false;
      // Cadrele sferei de includere ale meshurilor statice trebuie să existe înainte de prima randare.
      if (priority === 'optional') mesh.computeWorldMatrix(true);
      casters.set(mesh, priority);
      syncCasters();
      return true;
    },
    removeShadowCaster(mesh: AbstractMesh): void {
      assertActive();
      casters.delete(mesh);
      syncCasters();
    },
    /** PBI 244: invalidare explicită (ex.: schimbarea orei din zi în 252, geometrie nouă). */
    invalidateShadows,
    /** PBI 244: chemată o dată pe cadru de compunere; vezi `updateShadows`. */
    updateShadows,
    /** PBI 244: cum se comportă harta cache-uită (randări, cadre, motive de invalidare). */
    getShadowStats() {
      const tier = activeTier;
      const map = shadow?.getShadowMap() ?? null;
      return Object.freeze({
        preset: quality.preset,
        mode: tier.mode,
        cascades: shadow ? tier.cascades : 0,
        mapSize: shadow ? tier.mapSize : 0,
        generator: shadow ? (shadow instanceof CascadedShadowGenerator ? 'CSM' : 'SINGLE') : 'NONE',
        filter: tier.filter,
        stabilizeCascades:
          shadow instanceof CascadedShadowGenerator ? shadow.stabilizeCascades : false,
        staticCache: tier.staticCache,
        frames: shadowFrames,
        renders: shadowRenders,
        skipped: Math.max(0, shadowFrames - shadowRenders),
        invalidations: Object.freeze(Object.fromEntries(invalidations)),
        renderListLength: map?.renderList?.length ?? 0,
        /** Octeți GPU aproximativi ai hărții: mapSize² × straturi × (2 B culoare R16 + 4 B adâncime). */
        gpuBytes: shadow ? tier.mapSize * tier.mapSize * Math.max(1, tier.cascades) * 6 : 0,
      });
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
      disposeShadow();
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
