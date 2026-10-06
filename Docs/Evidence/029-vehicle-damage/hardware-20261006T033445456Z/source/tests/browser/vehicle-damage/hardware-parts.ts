import {
  HARDWARE_BUFFER_CAPS,
  HARDWARE_METRICS,
  quantileInterval,
  validateHistogram,
} from './hardware-collector';
import type { HardwareMetric, HistogramSnapshot } from './hardware-collector';
export interface HardwarePartIdentity {
  readonly captureId: string;
  readonly backend: 'WEBGPU' | 'WEBGL2';
  readonly arm: 'PUBLISHED_027' | 'CURRENT_029';
  readonly pair: number;
  readonly observer: boolean;
  readonly runOrdinal: number;
  readonly sourceHash: string;
  readonly artifactHash: string;
  readonly nativeHash: string;
}
export interface MetricPart {
  readonly version: '029-metric-part-v1';
  readonly identity: HardwarePartIdentity;
  readonly metric: HardwareMetric;
  readonly distribution: HistogramSnapshot | null;
}
function check(value: boolean, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
export function validatePartIdentity(identity: HardwarePartIdentity) {
  const fields = [
    'captureId',
    'backend',
    'arm',
    'pair',
    'observer',
    'runOrdinal',
    'sourceHash',
    'artifactHash',
    'nativeHash',
  ];
  check(
    Object.keys(identity).length === fields.length &&
      fields.every((field) => Object.hasOwn(identity, field)),
    'Exact identity fields',
  );
  check(/^[0-9TZ_-]{1,64}$/.test(identity.captureId), 'Capture identifier');
  check(identity.backend === 'WEBGPU' || identity.backend === 'WEBGL2', 'Actual backend');
  check(identity.arm === 'PUBLISHED_027' || identity.arm === 'CURRENT_029', 'Hardware arm');
  check(
    Number.isSafeInteger(identity.pair) && identity.pair >= 0 && identity.pair < 5,
    'Pair identifier',
  );
  check(
    typeof identity.observer === 'boolean' &&
      Number.isSafeInteger(identity.runOrdinal) &&
      identity.runOrdinal >= 0 &&
      identity.runOrdinal < 20,
    'Run identifier',
  );
  const observerIndex = identity.pair % 2 ? (identity.observer ? 0 : 1) : identity.observer ? 1 : 0;
  const armIndex =
    identity.pair % 2
      ? identity.arm === 'CURRENT_029'
        ? 0
        : 1
      : identity.arm === 'PUBLISHED_027'
        ? 0
        : 1;
  check(
    identity.runOrdinal === identity.pair * 4 + observerIndex * 2 + armIndex,
    'Canonical run order',
  );
  for (const value of [identity.sourceHash, identity.artifactHash, identity.nativeHash])
    check(/^[a-f0-9]{64}$/.test(value), 'Frozen identity hash');
}
export function metricPartId(part: MetricPart) {
  validatePartIdentity(part.identity);
  check(HARDWARE_METRICS.includes(part.metric), 'Metric identifier');
  return `${part.identity.captureId}-${part.identity.backend}-${part.identity.runOrdinal}-${part.identity.arm}-${part.identity.pair}-${part.identity.observer ? 'on' : 'off'}-${part.metric}`;
}
export function verifyMetricPart(part: MetricPart, expected: HardwarePartIdentity) {
  check(part.version === '029-metric-part-v1', 'Metric part schema');
  validatePartIdentity(part.identity);
  validatePartIdentity(expected);
  for (const field of Object.keys(expected) as (keyof HardwarePartIdentity)[])
    check(part.identity[field] === expected[field], `Part identity mismatch:${field}`);
  check(HARDWARE_METRICS.includes(part.metric), 'Metric identifier');
  if (!part.identity.observer)
    check(part.metric === 'frameIntervalMs', 'OFF has no fulltiming metric');
  const serialized = JSON.stringify(part);
  check(
    new TextEncoder().encode(serialized).byteLength <= HARDWARE_BUFFER_CAPS.partBytes,
    'Part payload cap',
  );
  if (part.distribution !== null) validateHistogram(part.distribution);
  const p50 = quantileInterval(part.distribution, 0.5),
    p95 = quantileInterval(part.distribution, 0.95),
    p99 = quantileInterval(part.distribution, 0.99);
  return Object.freeze({
    partId: metricPartId(part),
    metric: part.metric,
    observations: part.distribution?.observations ?? null,
    p50,
    p95,
    p99,
  });
}
/** Expectedmanifest must be produced from the frozen run header, not trusted incoming part fields. */
export function verifyMetricSet(parts: readonly MetricPart[], expected: HardwarePartIdentity) {
  check(parts.length < 16, 'Metric set cap');
  const metrics = new Set<string>();
  const results = parts.map((part) => {
    check(!metrics.has(part.metric), 'Duplicate metric part');
    metrics.add(part.metric);
    return verifyMetricPart(part, expected);
  });
  const required = expected.observer ? HARDWARE_METRICS : ['frameIntervalMs'];
  check(
    parts.length === required.length && required.every((metric) => metrics.has(metric)),
    'Incomplete metric set',
  );
  return Object.freeze(results);
}
