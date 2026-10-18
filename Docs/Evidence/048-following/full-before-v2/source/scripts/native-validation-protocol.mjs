// Common native adaptation of218 durations and047 deadline pacing/power ownership.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { VALIDATION_PROFILES } from '../src/telemetry/validation-protocol.ts';
export function nativeValidationProtocol(mode) {
  assert(['preflight', 'full'].includes(mode));
  const profile = VALIDATION_PROFILES.full;
  return Object.freeze({
    mode,
    pacedHz: 60,
    warmupTicks: mode === 'preflight' ? 30 : (profile.warmupMs * 60) / 1000,
    measuredTicks: mode === 'preflight' ? 60 : (profile.measuredMs * 60) / 1000,
    pairs: mode === 'preflight' ? 1 : profile.pairs,
    populations: Object.freeze([70]),
    offlineInstrumentationBytes:
      (mode === 'preflight' ? 60 : (profile.measuredMs * 60) / 1000) * 3 * 8,
  });
}
/** Same actual deadline loop used by047: never advances a synthetic wall clock. */
export async function paceNativeDeadline(deadline) {
  assert(Number.isFinite(deadline));
  for (;;) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) return;
    await sleep(remaining);
  }
}
export function validateNativeDurations(run, protocol, applyBudget = true) {
  for (const key of ['warmupWallMs', 'measuredWallMs', 'elapsedWallMs', 'maxDeadlineLatenessMs'])
    assert(Number.isFinite(run[key]) && run[key] >= 0);
  assert(run.warmupWallMs >= (protocol.warmupTicks * 1000) / 60);
  assert(run.measuredWallMs >= (protocol.measuredTicks * 1000) / 60);
  assert(run.elapsedWallMs >= ((protocol.warmupTicks + protocol.measuredTicks) * 1000) / 60);
  if (applyBudget && protocol.mode === 'full')
    assert(
      ((protocol.warmupTicks + protocol.measuredTicks) * 1000) / 60 / run.elapsedWallMs >= 0.98,
      'Native60Hz wall throughput',
    );
}
