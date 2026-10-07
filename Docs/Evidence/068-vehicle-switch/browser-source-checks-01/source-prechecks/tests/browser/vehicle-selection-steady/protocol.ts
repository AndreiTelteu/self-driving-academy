export const STEADY = Object.freeze({
  version: '068-selection-historical-steady-v1', population: 70, taxis: 30, civilians: 40,
  pairs: 5, arms: 20, hz: 60, warmupMs: 30000, measuredMs: 120000,
  maxMeasuredRaf: 32768, maxMeasuredTicks: 7215, maxTotalTicks: 9015,
  // Endpoint extra ticks are bounded by the unchanged250ms fixed-clock debt cap.
  endpointDebtMs: 250, minSimulationRatio: 0.98,
  rawChannels: Object.freeze(['frameMs', 'workMs', 'tickMs', 'rapierMs']),
  optionalChannels: Object.freeze(['selectionMs', 'uiMs']),
  maxSelectionProofs: 310, maxModeProofs: 160, maxCheckpoints: 30,
  maxLongTasks: 256, maxPartsPerArm: 64, maxPartBytes: 524288,
  maxCaptureBytes: 112 * 1024 * 1024, ownerCap: 192, readerCap: 192, setupCalls: 256,
});
export type Treatment = 'HISTORICAL_REFERENCE' | 'CURRENT_068';
export type SteadyArm = Readonly<{ pair: number; treatment: Treatment; observer: boolean; ordinal: number }>;
/** Alternating balanced blocks. Every reference/treatment has one realOFF and one realON arm. */
export function steadyOrder(): readonly SteadyArm[] {
  const result: SteadyArm[] = [];
  for (let pair = 0; pair < 5; pair++) {
    const treatments: Treatment[] = pair % 2 ? ['CURRENT_068', 'HISTORICAL_REFERENCE'] : ['HISTORICAL_REFERENCE', 'CURRENT_068'];
    for (const treatment of treatments)
      for (const observer of pair % 2 ? [true, false] : [false, true])
        result.push(Object.freeze({ pair, treatment, observer, ordinal: result.length }));
  }
  return Object.freeze(result);
}
/** Steady geometry differs from original short fixture and is disclosed, never a replaced baseline.
 * 70 retained native bodies fit within the existing500m half-width ground. All receive commands.
 * Sparse bounded throttle pulse with service brake prevents indefinite120s acceleration. */
export function steadyPlacement(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= STEADY.population) throw Error('Placement index');
  return { x: (index % 10) * 8 - 36, y: 0.8, z: Math.floor(index / 10) * 8 - 24 };
}
export function steadyActions(tick: number) {
  if (!Number.isInteger(tick) || tick < 1 || tick > STEADY.maxTotalTicks) throw Error('Steady tick');
  const phase = (tick - 1) % 120;
  return { throttle: phase < 12, brake: phase >= 12, steerRight: false, steerLeft: false };
}
export function rawQuantiles(values: readonly number[]) {
  if (!values.length || values.some((v) => !Number.isFinite(v) || v < 0)) throw Error('Invalid raw steady channel');
  const ordered = [...values].sort((a, b) => a - b);
  return { count: values.length, p50: ordered[Math.floor((ordered.length - 1) * .5)]!, p95: ordered[Math.floor((ordered.length - 1) * .95)]!, p99: ordered[Math.floor((ordered.length - 1) * .99)]! };
}
