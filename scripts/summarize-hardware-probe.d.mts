export interface MetricRange {
  median: number;
  min: number;
  max: number;
}
export interface MetricAggregate {
  repetitions: number;
  p50: MetricRange;
  p95: MetricRange;
  p99: MetricRange;
}
export interface HardwareProbeSummary {
  schemaVersion: number;
  fixture: string;
  profile: string;
  disabled: {
    cpuTotalMs: MetricAggregate;
    frameIntervalMs: MetricAggregate;
    gpuMs: MetricAggregate | null;
  };
  enabled: {
    cpuTotalMs: MetricAggregate;
    frameIntervalMs: MetricAggregate;
    gpuMs: MetricAggregate | null;
  };
  observerCpuOverheadMs: { repeat: number; p50: number; p95: number; p99: number }[];
  resources: Record<string, { min: number; max: number; unavailableRuns: number } | null>;
  longTaskSupported: boolean;
  longTaskPhaseCounts: Record<string, number> | null;
  build: Record<string, unknown>;
  hardware: Record<string, unknown>;
  gpu: Record<string, unknown> | null;
  scope: string;
}
export function summarizeHardwareProbe(report: unknown): HardwareProbeSummary;
export function readHardwareProbeSummary(path: string): Promise<HardwareProbeSummary>;
