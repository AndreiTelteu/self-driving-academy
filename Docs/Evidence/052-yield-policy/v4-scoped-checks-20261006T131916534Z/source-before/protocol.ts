import { validateDualClock } from './clock-proof';
import type { DualClockProof } from './clock-proof';
/** Source-only proposal: unchanged hardware windows/gates, bounded raw evidence parts. */
export const YIELD_BROWSER_V4 = Object.freeze({
  version: '052-yield-browser-v4',
  warmupSeconds: 30,
  measuredSeconds: 120,
  measuredTicks: 7200,
  pairs: 5,
  cars: 70,
  calibrationCases: 4,
  arms: 14,
  rawNumbersPerPart: 3000,
  partBytes: 128 * 1024,
  partsPerArm: 132,
  partsPerCapture: 1848,
  maxCaptureBytes: 231 * 1024 * 1024,
  numericChannelBytesPerArm: 3168000,
  timingChannels: ['frame', 'main', 'tick', 'step', 'policy'] as const,
  channels: ['frame', 'main', 'tick', 'step', 'policy', 'rafTime', 'rafReadTime', 'nativeSerial', 'controllerTick'] as const,
});
export function finiteRaw(values: readonly number[], maximum: number) {
  if (
    !Array.isArray(values) ||
    values.length > maximum ||
    values.some((value) => !Number.isFinite(value) || value < 0)
  )
    throw new Error('052 invalid raw timing channel');
}
export function rawDistribution(values: readonly number[]) {
  finiteRaw(values, 60000);
  if (!values.length) throw new Error('052 empty timing channel');
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1]!,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
    p99: sorted[Math.ceil(sorted.length * 0.99) - 1]!,
    max: sorted.at(-1)!,
  };
}
export interface RawArm {
  dualClock: DualClockProof;
  warmupSeconds: number;
  measuredSeconds: number;
  memory: { numericChannelBytes: number; cars: number };
  raw: Record<string, number[]>;
  stats: Record<string, unknown>;
  overloadCount: number;
  measurement: {
    originMs: number;
    windowStartMs: number;
    windowEndMs: number;
    previousFrameMs: number;
    firstFrameMs: number;
    lastFrameMs: number;
    lastWallMs: number;
    samples: number;
    nativeTicks: number;
  };
  simulationToActiveWallTime: number;
  activeWallSeconds: number;
}
/** Observed RAF endpoints plus every raw delta prove elapsed coverage; 250ms is the existing debt cap, not a performance waiver. */
export function validateRawArm(arm: RawArm, warm: number, seconds: number, cars: number) {
  if (
    arm.warmupSeconds !== warm ||
    arm.measuredSeconds !== seconds ||
    arm.overloadCount !== 0 ||
    arm.memory.numericChannelBytes !== 3168000 ||
    arm.memory.cars !== cars
  )
    throw new Error('052 timing protocol mismatch');
  if (Object.keys(arm.raw).sort().join(',') !== 'controllerTick,frame,main,nativeSerial,policy,rafReadTime,rafTime,step,tick')
    throw new Error('052 exact timing channels');
  for (const channel of YIELD_BROWSER_V4.channels) {
    const raw = arm.raw[channel]!;
    finiteRaw(raw, ['frame', 'main', 'rafTime', 'rafReadTime', 'nativeSerial', 'controllerTick'].includes(channel) ? 60000 : 12000);
    if (!['frame', 'main', 'rafTime', 'rafReadTime', 'nativeSerial', 'controllerTick'].includes(channel) && raw.length !== seconds * 60)
      throw new Error('052 measured native ticks mismatch');
    if (YIELD_BROWSER_V4.timingChannels.includes(channel as typeof YIELD_BROWSER_V4.timingChannels[number]) && JSON.stringify(rawDistribution(raw)) !== JSON.stringify(arm.stats[channel]))
      throw new Error('052 distribution differs from actual raw channel');
  }
  const frames = arm.raw.frame!,
    time = arm.measurement;
  if (
    !time ||
    !Object.values(time).every((value) => Number.isFinite(value) && value >= 0) ||
    frames.length !== arm.raw.main!.length ||
    frames.length !== time.samples ||
    time.nativeTicks !== seconds * 60
  )
    throw new Error('052 RAF observed count mismatch');
  const span = frames.reduce((sum, value) => sum + value, 0);
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
  if (
    frames.some((value) => value <= 0) ||
    !close(time.windowStartMs, time.originMs + warm * 1000) ||
    !close(time.windowEndMs, time.originMs + (warm + seconds) * 1000) ||
    !close(span, time.lastFrameMs - time.previousFrameMs) ||
    !close(frames[0]!, time.firstFrameMs - time.previousFrameMs) ||
    (warm > 0
      ? time.previousFrameMs >= time.windowStartMs
      : Math.abs(time.previousFrameMs - time.windowStartMs) > 250) ||
    time.firstFrameMs < time.windowStartMs ||
    time.firstFrameMs > time.windowStartMs + 250 ||
    Math.abs(time.lastFrameMs - time.windowEndMs) > 250 ||
    time.lastWallMs !== time.lastFrameMs ||
    span < seconds * 1000 - 500 ||
    span > seconds * 1000 + 500 ||
    !close(arm.activeWallSeconds, (time.lastWallMs - time.originMs) / 1000) ||
    !close(arm.simulationToActiveWallTime, arm.dualClock.matchedRafRatio)
  )
    throw new Error('052 raw RAF window proof mismatch');
  const result = validateDualClock(arm.dualClock, {
    frame: arm.raw.frame!, rafTime: arm.raw.rafTime!, rafReadTime: arm.raw.rafReadTime!, nativeSerial: arm.raw.nativeSerial!, controllerTick: arm.raw.controllerTick!,
  }, warm * 60, seconds * 60);
  if (!close(arm.dualClock.previousRaf.timeMs, time.previousFrameMs) ||
      !close(arm.raw.rafTime!.at(-1)!, time.lastFrameMs) || !close(result.rafMs, span))
    throw new Error('052 actual RAF identity/endpoints');
}
export function validateTimingArm(arm: RawArm) {
  validateRawArm(arm, 30, 120, 70);
}
export function validateCalibrationArm(arm: RawArm) {
  validateRawArm(arm, 0, 13, 2);
}
export function validateSmokeArm(arm: RawArm) {
  validateRawArm(arm, 1, 3, 70);
}
/** Every started attempt must have one matching terminal; failed smoke cannot disappear behind full acceptance. */
export function validateCaptureInventory(
  rows: readonly {
    name: string;
    files: readonly string[];
    start: { captureId: string; backend: string; full: boolean; sourceHash: string };
    terminal?: { captureId: string; status: string; arms: number };
  }[],
  sourceHash: string,
) {
  if (
    rows.length < 2 ||
    rows.length > 4 ||
    new Set(rows.map((row) => row.name)).size !== rows.length
  )
    throw new Error('052 capture inventory capacity');
  for (const row of rows) {
    if (
      !/^(WEBGPU|WEBGL2)-(full|smoke)$/.test(row.name) ||
      row.name !== row.start.backend + (row.start.full ? '-full' : '-smoke') ||
      row.start.sourceHash !== sourceHash ||
      row.files.some((file) => /failure|rejected|incomplete/i.test(file)) ||
      !row.terminal ||
      row.terminal.captureId !== row.start.captureId ||
      row.terminal.status !== 'SAVED_PENDING_VERIFICATION' ||
      row.terminal.arms !== 14 ||
      !row.files.includes('report.json')
    )
      throw new Error('052 unresolved/failed capture inventory');
  }
  for (const backend of ['WEBGPU', 'WEBGL2'])
    if (!rows.some((row) => row.name === backend + '-full'))
      throw new Error('052 full backend absent');
}
export function validateCalibrationNative(row: {
  nativeReadbacks: readonly { tick: number }[];
  checkpoints: readonly { tick: number }[];
}) {
  const ticks = row.nativeReadbacks.map((item) => item.tick),
    checkpoints = row.checkpoints.map((item) => item.tick);
  if (
    JSON.stringify(ticks) !==
      JSON.stringify(Array.from({ length: 130 }, (_, index) => (index + 1) * 6)) ||
    JSON.stringify(checkpoints) !==
      JSON.stringify(Array.from({ length: 6 }, (_, index) => (index + 1) * 120))
  )
    throw new Error('052 calibration native canonical observations');
}
