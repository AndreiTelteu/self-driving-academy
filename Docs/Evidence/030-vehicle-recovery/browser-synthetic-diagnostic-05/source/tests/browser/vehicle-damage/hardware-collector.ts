export const HARDWARE_METRICS = Object.freeze([
  'frameIntervalMs',
  'mainThreadFrameMs',
  'controllerTickMs',
  'rapierStepMs',
  'nativeControllerMs',
  'nativeQueryMs',
  'nativeBridgeMs',
  'drivetrainStageMs',
  'renderCpuMs',
  'inputCommandLatencyMs',
  'gpuDurationMs',
] as const);
export type HardwareMetric = (typeof HARDWARE_METRICS)[number];
export const REQUIRED_ON_METRICS = Object.freeze([
  'frameIntervalMs',
  'mainThreadFrameMs',
  'controllerTickMs',
  'rapierStepMs',
] as const);
export const HISTOGRAM = Object.freeze({
  bins: 4096,
  widthMs: 0.025,
  bytes: 4096 * Uint32Array.BYTES_PER_ELEMENT,
  sampleMaximum: 1_000_000,
});
export type Verdict = 'PASS' | 'FAIL' | 'UNVALIDATED';
export interface QuantileInterval {
  readonly lower: number;
  readonly upper: number;
  readonly upperExclusive: boolean;
  readonly rank: number;
  readonly observations: number;
}
export interface HistogramSnapshot {
  readonly version: '029-histogram-v1';
  readonly bins: number;
  readonly widthMs: number;
  readonly observations: number;
  readonly overflowCount: number;
  readonly overflowMinMs: number | null;
  readonly overflowMaxMs: number | null;
  readonly entries: readonly (readonly [number, number])[];
}
function check(value: boolean, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
export function createHistogram() {
  const bins = new Uint32Array(HISTOGRAM.bins);
  let observations = 0,
    overflowCount = 0,
    overflowMinMs = Infinity,
    overflowMaxMs = -Infinity;
  return Object.freeze({
    ownedCounterBytes: bins.byteLength,
    add(value: number) {
      check(Number.isFinite(value) && value >= 0, 'Nonfinite/negative duration');
      check(observations < HISTOGRAM.sampleMaximum, 'Histogram observation capacity');
      observations++;
      let index = Math.floor(value / HISTOGRAM.widthMs);
      // Preserve actual IEEE boundary membership rather than relying on quotient rounding.
      if (index < bins.length && value < index * HISTOGRAM.widthMs) index--;
      else if (index < bins.length && value >= (index + 1) * HISTOGRAM.widthMs) index++;
      if (index >= bins.length) {
        overflowCount++;
        overflowMinMs = Math.min(overflowMinMs, value);
        overflowMaxMs = Math.max(overflowMaxMs, value);
      } else bins[index]++;
    },
    snapshot(): HistogramSnapshot {
      const entries: (readonly [number, number])[] = [];
      for (let index = 0; index < bins.length; index++)
        if (bins[index]) entries.push(Object.freeze([index, bins[index]] as const));
      return Object.freeze({
        version: '029-histogram-v1',
        bins: HISTOGRAM.bins,
        widthMs: HISTOGRAM.widthMs,
        observations,
        overflowCount,
        overflowMinMs: overflowCount ? overflowMinMs : null,
        overflowMaxMs: overflowCount ? overflowMaxMs : null,
        entries: Object.freeze(entries),
      });
    },
  });
}
export function validateHistogram(data: HistogramSnapshot): void {
  check(
    data.version === '029-histogram-v1' &&
      data.bins === HISTOGRAM.bins &&
      data.widthMs === HISTOGRAM.widthMs,
    'Histogram schema',
  );
  check(
    Number.isSafeInteger(data.observations) &&
      data.observations >= 0 &&
      data.observations <= HISTOGRAM.sampleMaximum,
    'Histogram observations',
  );
  check(
    Number.isSafeInteger(data.overflowCount) &&
      data.overflowCount >= 0 &&
      data.overflowCount <= data.observations,
    'Histogram overflow count',
  );
  check(
    Array.isArray(data.entries) && data.entries.length <= HISTOGRAM.bins,
    'Histogram entries capacity',
  );
  let previous = -1,
    total = data.overflowCount;
  for (const entry of data.entries) {
    check(Array.isArray(entry) && entry.length === 2, 'Histogram sparse entry');
    const [index, count] = entry;
    check(
      Number.isSafeInteger(index) &&
        index > previous &&
        index < HISTOGRAM.bins &&
        Number.isSafeInteger(count) &&
        count > 0 &&
        count <= HISTOGRAM.sampleMaximum,
      'Histogram sparse order/count',
    );
    previous = index;
    total += count;
  }
  check(total === data.observations, 'Histogram total mismatch');
  if (data.overflowCount)
    check(
      Number.isFinite(data.overflowMinMs) &&
        Number.isFinite(data.overflowMaxMs) &&
        data.overflowMinMs! >= HISTOGRAM.bins * HISTOGRAM.widthMs &&
        data.overflowMaxMs! >= data.overflowMinMs!,
      'Histogram finite overflow range',
    );
  else
    check(data.overflowMinMs === null && data.overflowMaxMs === null, 'Unexpected overflow values');
}
export function quantileInterval(
  data: HistogramSnapshot | null,
  fraction: number,
): QuantileInterval | null {
  check(Number.isFinite(fraction) && fraction > 0 && fraction <= 1, 'Quantile fraction');
  if (data === null) return null;
  validateHistogram(data);
  if (!data.observations) return null;
  const rank = Math.ceil(data.observations * fraction);
  let accumulated = 0;
  for (const [index, count] of data.entries) {
    accumulated += count;
    if (accumulated >= rank)
      return Object.freeze({
        lower: index * data.widthMs,
        upper: (index + 1) * data.widthMs,
        upperExclusive: true,
        rank,
        observations: data.observations,
      });
  }
  check(data.overflowCount > 0, 'Missing ranked overflow');
  return Object.freeze({
    lower: data.overflowMinMs!,
    upper: data.overflowMaxMs!,
    upperExclusive: false,
    rank,
    observations: data.observations,
  });
}
function validateInterval(value: QuantileInterval) {
  check(
    Number.isFinite(value.lower) &&
      Number.isFinite(value.upper) &&
      value.lower >= 0 &&
      value.upper >= value.lower,
    'Quantile bounds',
  );
}
export function absoluteVerdict(value: QuantileInterval | null, maximum: number): Verdict {
  check(Number.isFinite(maximum) && maximum >= 0, 'Absolute budget');
  if (value === null) return 'UNVALIDATED';
  validateInterval(value);
  return value.upper <= maximum ? 'PASS' : value.lower > maximum ? 'FAIL' : 'UNVALIDATED';
}
export function relativeVerdict(
  before: QuantileInterval | null,
  after: QuantileInterval | null,
): Verdict {
  if (before === null || after === null) return 'UNVALIDATED';
  validateInterval(before);
  validateInterval(after);
  if (after.lower > 1.1 * before.upper && after.lower - before.upper > 1) return 'FAIL';
  if (after.upper <= 1.1 * before.lower || after.upper - before.lower <= 1) return 'PASS';
  return 'UNVALIDATED';
}
export function fivePairVerdict(pairs: readonly Verdict[]): Verdict {
  check(
    pairs.length === 5 &&
      pairs.every((value) => value === 'PASS' || value === 'FAIL' || value === 'UNVALIDATED'),
    'Five pair classifications',
  );
  const failures = pairs.filter((value) => value === 'FAIL').length,
    possible = failures + pairs.filter((value) => value === 'UNVALIDATED').length;
  return failures >= 3 ? 'FAIL' : possible < 3 ? 'PASS' : 'UNVALIDATED';
}
export const HARDWARE_BUFFER_CAPS = Object.freeze({
  onHistogramBytes: HARDWARE_METRICS.length * HISTOGRAM.bytes,
  offHistogramBytes: HISTOGRAM.bytes,
  heapRows: 256,
  heapValuesPerRow: 4,
  heapBytes: 256 * 4 * 8,
  endpointRows: 8,
  endpointValuesPerRow: 4,
  endpointBytes: 8 * 4 * 8,
  checkpointRows: 64,
  checkpointCars: 3,
  checkpointValuesPerCar: 16,
  checkpointBytes: 64 * 3 * 16 * 8,
  partBytes: 128 * 1024,
  partsPerRun: 16,
  runsPerBackend: 20,
  partsPerBackend: 320,
  actorTickBytes: 70 * 4,
  hashScratchBytes: 70 * 16 * 8,
  checkpointCodecMaximumBytes: 128 * 1024,
  pendingCheckpointCapacity: 64,
});
