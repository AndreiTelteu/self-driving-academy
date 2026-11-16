import type { QualityPreferences } from '../settings';

export type QualityPreset = QualityPreferences['preset'];
export const QUALITY_PRESETS = Object.freeze({
  LOW: Object.freeze({
    maxDpr: 1,
    shadowMapSize: 0,
    shadowDistance: 0,
    maxShadowCasters: 0,
    materialLights: 2,
    lodDistance: 45,
    maxTextureDimension: 1024,
    maxTransparentMeshes: 32,
    maxVisualEffects: 16,
  }),
  MEDIUM: Object.freeze({
    maxDpr: 1.5,
    shadowMapSize: 1024,
    shadowDistance: 60,
    maxShadowCasters: 48,
    materialLights: 2,
    lodDistance: 90,
    maxTextureDimension: 2048,
    maxTransparentMeshes: 64,
    maxVisualEffects: 32,
  }),
  HIGH: Object.freeze({
    maxDpr: 2,
    shadowMapSize: 2048,
    shadowDistance: 140,
    maxShadowCasters: 96,
    materialLights: 2,
    lodDistance: 150,
    maxTextureDimension: 2048,
    maxTransparentMeshes: 96,
    maxVisualEffects: 64,
  }),
});
const presets: readonly QualityPreset[] = ['LOW', 'MEDIUM', 'HIGH'];

/**
 * PBI 241 — antialiasing și post-procesare pe preset.
 *
 * - `pipeline: false` (LOW): fără `DefaultRenderingPipeline`. Tone mappingul se aplică în materiale
 *   (o singură dată, din `scene.imageProcessingConfiguration`), iar marginile trec printr-un singur
 *   pas FXAA pe ținta LDR a camerei. Bloom, sharpen, vignetă, grading și dithering sunt oprite.
 * - `pipeline: true` (MEDIUM/HIGH): ținta HDR half-float; tone mappingul, vigneta, gradingul și
 *   ditheringul se aplică în pipeline (materialele nu le mai aplică), urmate de FXAA sau MSAA.
 * - `msaaSamples`: 4 pe HIGH. WebGPU acceptă numai 1 sau 4 eșantioane, deci 2× nu este portabil;
 *   MEDIUM folosește FXAA (permis de PBI) ca ambele backenduri să dea aceeași imagine.
 */
export interface PostProcessingTier {
  readonly pipeline: boolean;
  readonly antialias: 'FXAA' | 'MSAA';
  readonly msaaSamples: 1 | 4;
  readonly bloom: boolean;
  readonly sharpen: boolean;
  readonly vignette: boolean;
  readonly grading: boolean;
  readonly dithering: boolean;
}
export const POST_PROCESSING_PRESETS: Readonly<Record<QualityPreset, PostProcessingTier>> =
  Object.freeze({
    LOW: Object.freeze({
      pipeline: false,
      antialias: 'FXAA',
      msaaSamples: 1,
      bloom: false,
      sharpen: false,
      vignette: false,
      grading: false,
      dithering: false,
    }),
    MEDIUM: Object.freeze({
      pipeline: true,
      antialias: 'FXAA',
      msaaSamples: 1,
      bloom: true,
      sharpen: true,
      vignette: true,
      grading: true,
      dithering: true,
    }),
    HIGH: Object.freeze({
      pipeline: true,
      antialias: 'MSAA',
      msaaSamples: 4,
      bloom: true,
      sharpen: true,
      vignette: true,
      grading: true,
      dithering: true,
    }),
  });
/**
 * PBI 242 — terenul de dincolo de oraș, dealurile îndepărtate și parapetul limitei hărții.
 *
 * Costul este de 3 desenări pe orice preset (teren, parapet stâlpi, parapet grinzi); pe preset se
 * schimbă doar densitatea: segmentele pe latura buclei de teren și pasul stâlpilor. Nu există
 * umbre, texturi sau materiale transparente, deci LOW rămâne ieftin.
 */
export interface WorldEdgeTier {
  /** Segmente pe latura fiecărei bucle dreptunghiulare de teren. */
  readonly terrainSegmentsPerSide: number;
  /** Distanța dintre stâlpii parapetului, în metri. */
  readonly postSpacingM: number;
}
export const WORLD_EDGE_PRESETS: Readonly<Record<QualityPreset, WorldEdgeTier>> = Object.freeze({
  LOW: Object.freeze({ terrainSegmentsPerSide: 28, postSpacingM: 8 }),
  MEDIUM: Object.freeze({ terrainSegmentsPerSide: 48, postSpacingM: 4 }),
  HIGH: Object.freeze({ terrainSegmentsPerSide: 72, postSpacingM: 4 }),
});
/**
 * PBI 243 — cerul procedural, ceața și iluminarea din mediu (IBL).
 *
 * - `environmentSize`: latura cubului de mediu (half-float RGBA, lanț complet de mip-uri), generat o
 *   singură dată la încărcare și la schimbarea stării de atmosferă. 32/64/128 → 0,05/0,2/1,05 MiB,
 *   adică sub 0,3% din bugetul de texturi 223 chiar și pe LOW (256 MiB).
 * - `clouds`: norii procedurali din shaderul cerului (fbm pe 4 octave): numai HIGH.
 * - `domeSegments`: segmentele domului cerului (culoarea se calculează per pixel, deci puține).
 * Ceața este aceeași pe toate presetările (nu costă nimic suplimentar), ca LOW, MEDIUM și HIGH să
 * arate la fel.
 */
export interface AtmosphereTier {
  readonly environmentSize: 32 | 64 | 128;
  readonly clouds: boolean;
  readonly domeSegments: number;
}
export const ATMOSPHERE_PRESETS: Readonly<Record<QualityPreset, AtmosphereTier>> = Object.freeze({
  LOW: Object.freeze({ environmentSize: 32, clouds: false, domeSegments: 16 }),
  MEDIUM: Object.freeze({ environmentSize: 64, clouds: false, domeSegments: 24 }),
  HIGH: Object.freeze({ environmentSize: 128, clouds: true, domeSegments: 32 }),
});
/**
 * PBI 245 — texturile procedurale ale suprafețelor (asfalt, marcaje, trotuar, bordură, iarbă).
 *
 * - `baseSize`: latura texturii de bază (asfalt și trotuar); celelalte texturi sunt fracții ale ei
 *   (vezi `SURFACE_TEXTURE_SPECS`). 256/512/1024 → ≈ 4 / 11 / 45 MiB GPU cu lanț de mip-uri, mult sub
 *   bugetul de texturi 223 (256 MiB pe LOW, 384 MiB pe MEDIUM/HIGH).
 * - `anisotropy`: filtrarea anizotropă (8× pe HIGH): fără ea asfaltul și marcajele pâlpâie la unghi
 *   razant; mip-urile singure îl fac doar neclar.
 * - `specularAA`: antialiasing de specular pe normal map (HIGH/MEDIUM), contra scânteierii rugozității.
 * - `wearStrips`: urmele de uzură ale benzilor (o desenare în plus, cu alpha blend); numai MEDIUM/HIGH.
 */
export interface SurfaceTier {
  readonly baseSize: 256 | 512 | 1024;
  readonly anisotropy: number;
  readonly specularAA: boolean;
  readonly wearStrips: boolean;
}
export const SURFACE_PRESETS: Readonly<Record<QualityPreset, SurfaceTier>> = Object.freeze({
  LOW: Object.freeze({ baseSize: 256, anisotropy: 2, specularAA: false, wearStrips: false }),
  MEDIUM: Object.freeze({ baseSize: 512, anisotropy: 4, specularAA: true, wearStrips: true }),
  HIGH: Object.freeze({ baseSize: 1024, anisotropy: 8, specularAA: true, wearStrips: true }),
});
/**
 * PBI 244 — umbre de la soare pe preset.
 *
 * - `BLOB` (LOW): fără shadow map; o umbră de contact ieftină (un cvadrilater texturat) sub fiecare
 *   vehicul și sub personaj. Clădirile și decorul nu aruncă umbră.
 * - `MAP` (MEDIUM): o singură hartă ortografică PCF, mutată după cameră și aliniată pe texeli
 *   (`shadow-math.ts`), deci marginile nu tremură la mișcare sau rotație.
 * - `CASCADED` (HIGH): Cascaded Shadow Maps cu `stabilizeCascades` (sfere + aliniere pe texeli) și
 *   PCF de calitate mare; cascadele își iau centrul din frustumul camerei.
 * - `shadowMaxZ`: distanța maximă de la cameră (CASCADED) sau lățimea hărții (MAP), în metri.
 * - `staticCache`: harta nu se mai randează în cadrele în care nimic nu s-a schimbat (soare, cameră,
 *   mișcare a casterilor); vezi `daylight.updateShadows`.
 * Costul de memorie GPU este `mapSize² × cascade × (2 B culoare + 4 B adâncime)`: HIGH ≈ 96 MiB,
 * MEDIUM ≈ 6 MiB, LOW 0.
 */
export type ShadowMode = 'BLOB' | 'MAP' | 'CASCADED';
export interface ShadowTier {
  readonly mode: ShadowMode;
  readonly cascades: number;
  readonly mapSize: number;
  readonly shadowMaxZ: number;
  /** Amestecul logaritmic/uniform al limitelor cascadelor (1 = logaritmic, mai multă rezoluție aproape). */
  readonly lambda: number;
  readonly filter: 'NONE' | 'PCF';
  readonly filteringQuality: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Bias de adâncime (în unități de hartă normalizată) și bias pe normală (metri). */
  readonly bias: number;
  readonly normalBias: number;
  /** Cât de întunecată este umbra: 0 = negru complet, 1 = fără umbră. Ambientul completează restul. */
  readonly darkness: number;
  readonly staticCache: boolean;
}
export const SHADOW_PRESETS: Readonly<Record<QualityPreset, ShadowTier>> = Object.freeze({
  LOW: Object.freeze({
    mode: 'BLOB',
    cascades: 0,
    mapSize: 0,
    shadowMaxZ: 0,
    lambda: 0,
    filter: 'NONE',
    filteringQuality: 'LOW',
    bias: 0,
    normalBias: 0,
    darkness: 1,
    staticCache: false,
  }),
  MEDIUM: Object.freeze({
    mode: 'MAP',
    cascades: 1,
    mapSize: 1024,
    shadowMaxZ: 60,
    lambda: 0,
    filter: 'PCF',
    filteringQuality: 'MEDIUM',
    bias: 0.0015,
    normalBias: 0.06,
    darkness: 0.2,
    staticCache: true,
  }),
  HIGH: Object.freeze({
    mode: 'CASCADED',
    cascades: 4,
    mapSize: 2048,
    shadowMaxZ: 140,
    lambda: 0.85,
    filter: 'PCF',
    filteringQuality: 'HIGH',
    bias: 0.002,
    normalBias: 0.03,
    darkness: 0.2,
    staticCache: true,
  }),
});
/**
 * PBI 244 — ocluzie ambientală în spațiu-ecran (SSAO2) pe preset. LOW nu are AO.
 *
 * Valorile sunt calibrate pe capturile 239 (vederile `taxi-front-three-quarter`, `facades-close`,
 * `decor-tree-bench`): raza mică (contact, nu pete mari), `maxZ` scurt (nu apar aureole la siluete
 * față de cer), putere moderată. `resolutionRatio` este raportul texturii SSAO față de ecran.
 */
export interface AmbientOcclusionTier {
  readonly enabled: boolean;
  readonly samples: number;
  readonly radius: number;
  readonly totalStrength: number;
  readonly base: number;
  readonly maxZ: number;
  readonly minZAspect: number;
  readonly resolutionRatio: number;
  readonly blurRatio: number;
  /** Rezolutia bufferului de geometrie (adancime + normale) fata de ecran. */
  readonly geometryScale: number;
  readonly expensiveBlur: boolean;
}
export const AO_PRESETS: Readonly<Record<QualityPreset, AmbientOcclusionTier>> = Object.freeze({
  LOW: Object.freeze({
    enabled: false,
    samples: 0,
    radius: 0,
    totalStrength: 0,
    base: 0,
    maxZ: 0,
    minZAspect: 0,
    resolutionRatio: 0,
    blurRatio: 0,
    geometryScale: 0,
    expensiveBlur: false,
  }),
  MEDIUM: Object.freeze({
    enabled: true,
    samples: 8,
    radius: 1.2,
    totalStrength: 0.6,
    base: 0.1,
    maxZ: 60,
    minZAspect: 0.5,
    resolutionRatio: 0.5,
    blurRatio: 0.5,
    geometryScale: 0.5,
    expensiveBlur: false,
  }),
  HIGH: Object.freeze({
    enabled: true,
    samples: 12,
    radius: 1.5,
    totalStrength: 0.9,
    base: 0.1,
    maxZ: 120,
    minZAspect: 0.5,
    resolutionRatio: 0.5,
    blurRatio: 0.5,
    geometryScale: 0.5,
    expensiveBlur: true,
  }),
});
/** Admit optional presentation resources before creation; never reject a simulated entity. */
export function checkVisualResources(
  preset: QualityPreset,
  usage: { textureDimension: number; transparentMeshes: number; visualEffects: number },
) {
  if (!presets.includes(preset)) throw new Error('Unknown quality preset');
  const limits = QUALITY_PRESETS[preset];
  const diagnostics: { metric: string; actual: number; limit: number }[] = [];
  for (const [metric, limit] of [
    ['textureDimension', limits.maxTextureDimension],
    ['transparentMeshes', limits.maxTransparentMeshes],
    ['visualEffects', limits.maxVisualEffects],
  ] as const) {
    const actual = usage[metric];
    if (!Number.isSafeInteger(actual) || actual < 0)
      throw new Error('Invalid visual resource count');
    if (actual > limit) diagnostics.push({ metric, actual, limit });
  }
  return Object.freeze({
    accepted: diagnostics.length === 0,
    diagnostics: Object.freeze(diagnostics),
  });
}
function finite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error('Invalid quality value');
  return value;
}
export function resolveQuality(
  preferences: QualityPreferences,
  width: number,
  height: number,
  dpr: number,
) {
  if (!presets.includes(preferences.preset)) throw new Error('Unknown quality preset');
  finite(preferences.resolutionScale, 0.5, 1);
  finite(width, 1, 16384);
  finite(height, 1, 16384);
  finite(dpr, 0.1, 8);
  const limits = QUALITY_PRESETS[preferences.preset];
  const effectiveDpr = Math.min(dpr, limits.maxDpr);
  return Object.freeze({
    preset: preferences.preset,
    limits,
    cssWidth: width,
    cssHeight: height,
    deviceDpr: dpr,
    effectiveDpr,
    resolutionScale: preferences.resolutionScale,
    internalWidth: Math.max(1, Math.floor(width * effectiveDpr * preferences.resolutionScale)),
    internalHeight: Math.max(1, Math.floor(height * effectiveDpr * preferences.resolutionScale)),
  });
}
/** Limita inferioară a `resolutionScale` (aceeași ca în contractul de setări). */
export const MIN_RESOLUTION_SCALE = 0.5;
/**
 * PBI 240 — treptele de scară adaptivă: factorul se înmulțește cu `resolutionScale` ales de jucător.
 * Costul de fill-rate scade cu pătratul factorului, deci patru trepte acoperă un raport de ~3×.
 */
export const ADAPTIVE_RESOLUTION_FACTORS: readonly number[] = Object.freeze([1, 0.85, 0.7, 0.55]);
/** Scara efectivă: alegerea jucătorului × factorul adaptiv, niciodată sub minimul contractului. */
export function effectiveResolutionScale(base: number, factor: number): number {
  finite(base, MIN_RESOLUTION_SCALE, 1);
  finite(factor, 0.1, 1);
  return Math.min(1, Math.max(MIN_RESOLUTION_SCALE, base * factor));
}
export interface QualitySample {
  readonly frameMs: number;
  readonly cpuMs: number;
  readonly gpuMs: number | null;
}
/** Bounded windows, asymmetric thresholds and cooldown; unknown/CPU-bound samples never adjust resolution. */
export function createAdaptiveQuality(
  initial: QualityPreset,
  adaptive: boolean,
  options: { readonly adaptResolution?: boolean } = {},
) {
  if (!presets.includes(initial)) throw new Error('Unknown quality preset');
  const adaptResolution = options.adaptResolution === true;
  let preset = initial;
  let factorIndex = 0;
  let samples: QualitySample[] = [];
  let badWindows = 0,
    goodWindows = 0;
  let lastChange = -Infinity;
  let lastNow = -Infinity;
  return {
    getPreset: () => preset,
    /** Factorul adaptiv curent al rezoluției (1 = fără reducere); mereu 1 fără `adaptResolution`. */
    getResolutionFactor: () => ADAPTIVE_RESOLUTION_FACTORS[factorIndex]!,
    setManual(next: QualityPreset, nowMs: number): void {
      if (!presets.includes(next)) throw new Error('Unknown quality preset');
      finite(nowMs, 0, Number.MAX_SAFE_INTEGER);
      if (nowMs < lastNow) throw new Error('Quality clock regressed');
      preset = next;
      factorIndex = 0;
      adaptive = false;
      samples = [];
      badWindows = goodWindows = 0;
      lastChange = lastNow = nowMs;
    },
    sample(sample: QualitySample, nowMs: number): QualityPreset | null {
      finite(nowMs, 0, Number.MAX_SAFE_INTEGER);
      if (nowMs < lastNow) throw new Error('Quality clock regressed');
      finite(sample.frameMs, 0, 60000);
      finite(sample.cpuMs, 0, 60000);
      if (sample.gpuMs !== null) finite(sample.gpuMs, 0, 60000);
      lastNow = nowMs;
      if (!adaptive) return null;
      samples.push({ ...sample });
      if (samples.length < 30) return null;
      const percentile = (read: (s: QualitySample) => number) =>
        samples.map(read).sort((a, b) => a - b)[28]!;
      const knownGpu = samples.every((s) => s.gpuMs !== null);
      const frame = percentile((s) => s.frameMs),
        cpu = percentile((s) => s.cpuMs);
      const gpu = knownGpu ? percentile((s) => s.gpuMs!) : 0;
      samples = [];
      const bad = knownGpu && frame > 22 && gpu > 12 && gpu > cpu;
      const good = knownGpu && frame < 15 && gpu < 8 && cpu < 8;
      badWindows = bad ? badWindows + 1 : 0;
      goodWindows = good ? goodWindows + 1 : 0;
      const delta = badWindows >= 2 ? -1 : goodWindows >= 4 ? 1 : 0;
      if (!delta || nowMs - lastChange < 5000) return null;
      if (adaptResolution) {
        // Mai întâi rezoluția (fill-rate), abia apoi presetul; la revenire, invers.
        const nextFactor = factorIndex - delta;
        if (nextFactor >= 0 && nextFactor < ADAPTIVE_RESOLUTION_FACTORS.length) {
          factorIndex = nextFactor;
          lastChange = nowMs;
          badWindows = goodWindows = 0;
          return null;
        }
      }
      const index = presets.indexOf(preset),
        next = presets[index + delta];
      if (!next) return null;
      preset = next;
      lastChange = nowMs;
      badWindows = goodWindows = 0;
      return next;
    },
  };
}
