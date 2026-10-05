import type { QualityPreferences } from '../settings';

export type QualityPreset = QualityPreferences['preset'];
export const QUALITY_PRESETS = Object.freeze({
  LOW: Object.freeze({
    maxDpr: 1,
    shadowMapSize: 0,
    shadowDistance: 0,
    maxShadowCasters: 0,
    materialLights: 2,
  }),
  MEDIUM: Object.freeze({
    maxDpr: 1.5,
    shadowMapSize: 1024,
    shadowDistance: 60,
    maxShadowCasters: 48,
    materialLights: 2,
  }),
  HIGH: Object.freeze({
    maxDpr: 2,
    shadowMapSize: 2048,
    shadowDistance: 100,
    maxShadowCasters: 96,
    materialLights: 2,
  }),
});
const presets: readonly QualityPreset[] = ['LOW', 'MEDIUM', 'HIGH'];
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
export interface QualitySample {
  readonly frameMs: number;
  readonly cpuMs: number;
  readonly gpuMs: number | null;
}
/** Bounded windows, asymmetric thresholds and cooldown; unknown/CPU-bound samples never adjust resolution. */
export function createAdaptiveQuality(initial: QualityPreset, adaptive: boolean) {
  if (!presets.includes(initial)) throw new Error('Unknown quality preset');
  let preset = initial;
  let samples: QualitySample[] = [];
  let badWindows = 0,
    goodWindows = 0;
  let lastChange = -Infinity;
  let lastNow = -Infinity;
  return {
    getPreset: () => preset,
    setManual(next: QualityPreset, nowMs: number): void {
      if (!presets.includes(next)) throw new Error('Unknown quality preset');
      finite(nowMs, 0, Number.MAX_SAFE_INTEGER);
      if (nowMs < lastNow) throw new Error('Quality clock regressed');
      preset = next;
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
