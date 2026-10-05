export interface DiagnosticSample {
  readonly cpuRenderMs: number;
  readonly frameMs: number | null;
  readonly gpuMs: number | null;
  readonly tickCpuMs: number | null;
}
export interface DiagnosticCounters {
  readonly tick: number | null;
  readonly debtMs: number | null;
  readonly pendingBytes: number | null;
  readonly queuedJobs: number | null;
  readonly entityCount: number | null;
  readonly profileVersion: string | null;
  readonly workerState: string | null;
}
export interface DiagnosticResources {
  readonly drawCalls: number | null;
  readonly meshes: number;
  readonly nodes: number;
  readonly materials: number;
  readonly textures: number;
  readonly geometries: number;
}
export const UNAVAILABLE_DIAGNOSTIC_COUNTERS: DiagnosticCounters = Object.freeze({
  tick: null,
  debtMs: null,
  pendingBytes: null,
  queuedJobs: null,
  entityCount: null,
  profileVersion: null,
  workerState: null,
});
export interface DiagnosticPercentiles {
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}
export interface DiagnosticReport {
  readonly backend: string;
  readonly enabled: boolean;
  readonly capacity: number;
  readonly retainedSamples: number;
  readonly bufferBytes: number;
  readonly cpuRenderMs: DiagnosticPercentiles | null;
  readonly frameMs: DiagnosticPercentiles | null;
  readonly gpuMs: DiagnosticPercentiles | null;
  readonly gpuStatus: string;
  readonly tickCpuMs: DiagnosticPercentiles | null;
  readonly counters: DiagnosticCounters;
  readonly resources: DiagnosticResources | null;
}
const FIELDS = ['cpuRenderMs', 'frameMs', 'gpuMs', 'tickCpuMs'] as const;
/** Fixed-size numeric ring. Aggregation only at explicit report(), never during record(). */
export class DiagnosticsCollector {
  readonly capacity: number;
  private readonly buffer: Float64Array;
  private count = 0;
  private cursor = 0;
  private active = true;
  constructor(capacity = 240) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 4096)
      throw new Error('Diagnostics capacity must be 1..4096');
    this.capacity = capacity;
    this.buffer = new Float64Array(capacity * FIELDS.length);
  }
  get enabled(): boolean {
    return this.active;
  }
  setEnabled(enabled: boolean): void {
    this.active = enabled;
    if (!enabled) this.clear();
  }
  clear(): void {
    this.count = 0;
    this.cursor = 0;
  }
  record(sample: DiagnosticSample): boolean {
    if (!this.active) return false;
    for (const key of FIELDS) {
      const value = sample[key];
      if (value !== null && (!Number.isFinite(value) || value < 0))
        throw new Error(`Invalid diagnostic ${key}`);
    }
    for (let field = 0; field < FIELDS.length; field++)
      this.buffer[this.cursor * FIELDS.length + field] = sample[FIELDS[field]] ?? NaN;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    return true;
  }
  report(
    backend: string,
    gpuStatus: string,
    resources: DiagnosticResources | null = null,
    counters: DiagnosticCounters = UNAVAILABLE_DIAGNOSTIC_COUNTERS,
  ): DiagnosticReport {
    if (backend.length > 32 || gpuStatus.length > 128) throw new Error('Diagnostic label capacity');
    for (const key of ['tick', 'debtMs', 'pendingBytes', 'queuedJobs', 'entityCount'] as const) {
      const value = counters[key];
      if (value !== null && (!Number.isFinite(value) || value < 0))
        throw new Error(`Invalid diagnostic counter ${key}`);
    }
    for (const value of [counters.profileVersion, counters.workerState])
      if (value !== null && value.length > 128)
        throw new Error('Diagnostic counter label capacity');
    const percentiles = (field: number): DiagnosticPercentiles | null => {
      const values: number[] = [];
      for (let index = 0; index < this.count; index++) {
        const value = this.buffer[index * FIELDS.length + field];
        if (Number.isFinite(value)) values.push(value);
      }
      if (!values.length) return null;
      values.sort((a, b) => a - b);
      const at = (p: number) => values[Math.ceil(values.length * p) - 1];
      return Object.freeze({ count: values.length, p50: at(0.5), p95: at(0.95), p99: at(0.99) });
    };
    return Object.freeze({
      backend,
      enabled: this.active,
      capacity: this.capacity,
      retainedSamples: this.count,
      bufferBytes: this.buffer.byteLength,
      cpuRenderMs: percentiles(0),
      frameMs: percentiles(1),
      gpuMs: percentiles(2),
      gpuStatus,
      tickCpuMs: percentiles(3),
      counters: Object.freeze({ ...counters }),
      resources: resources ? Object.freeze({ ...resources }) : null,
    });
  }
}
