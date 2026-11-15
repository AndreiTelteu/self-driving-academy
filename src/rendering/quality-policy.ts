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
    shadowDistance: 100,
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
