import { AUDIO_LIMITS, createAudioEngine, createFakeAudioBackend } from '../../src/audio';
import { createAudioFixture } from './audio-fixture';

export interface AudioPerformanceMeasurement {
  readonly fixture: Readonly<{
    readonly version: string;
    readonly vehicles: number;
    readonly ticks: number;
    readonly repetitions: number;
    readonly audibleVehicles: number;
  }>;
  readonly baseline: Readonly<{ readonly totalMs: number; readonly perTickUs: number }>;
  readonly withAudio: Readonly<{
    readonly totalMs: number;
    readonly perTickUs: number;
    readonly voicesStarted: number;
    readonly activeVoices: number;
  }>;
  readonly delta: Readonly<{ readonly perTickUs: number; readonly relativeShare: number }>;
  readonly memory: Readonly<{
    readonly heapBeforeBytes: number;
    readonly heapAfterBytes: number;
    readonly heapDeltaBytes: number;
    readonly ownedBufferBytes: number;
    readonly gcAvailable: boolean;
  }>;
  readonly budgets: Readonly<{
    readonly authoritativeTickP95Ms: number;
    readonly mainThreadP95Ms: number;
    readonly audioBufferBytesCap: number;
  }>;
  readonly method: string;
  readonly limitations: readonly string[];
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function nowNs(): bigint {
  return process.hrtime.bigint();
}

/**
 * Local cost of the audio subsystem on the deterministic fixture.
 *
 * The measurement is a local cost probe, not a hardware gate: it compares the same fixture with
 * and without the audio engine, in the same process, and reports the additional per-tick work and
 * the owned memory. It never claims a frame rate.
 */
export function measureAudioPerformance(options?: {
  readonly ticks?: number;
  readonly repetitions?: number;
}): AudioPerformanceMeasurement {
  const ticks = options?.ticks ?? 600;
  const repetitions = options?.repetitions ?? 5;
  const fixture = createAudioFixture();
  const gc = (globalThis as { gc?: () => void }).gc;
  const gcAvailable = typeof gc === 'function';

  const baselineRuns: number[] = [];
  const audioRuns: number[] = [];
  const memoryDeltas: number[] = [];
  let voicesStarted = 0;
  let activeVoices = 0;
  let ownedBufferBytes = 0;
  let heapBeforeBytes = 0;
  let heapAfterBytes = 0;

  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    // Baseline: the same fixture, the same iterations, without the audio engine.
    const baselineStart = nowNs();
    let checksum = 0;
    for (let tick = 0; tick < ticks; tick += 1) {
      for (const vehicle of fixture.vehicles) checksum += vehicle.sample.speedMps;
    }
    const baselineEnd = nowNs();
    baselineRuns.push(Number(baselineEnd - baselineStart) / 1e6);
    if (checksum < 0) throw new Error('Unreachable baseline checksum');

    // Retained heap of the live audio engine: the additional memory of the new functionality.
    if (gcAvailable) gc();
    const heapWithoutEngine = process.memoryUsage().heapUsed;

    const backend = createFakeAudioBackend();
    const engine = createAudioEngine({ backend });
    engine.startFromUserGesture('POINTER');
    const audioStart = nowNs();
    for (let tick = 0; tick < ticks; tick += 1) {
      for (const vehicle of fixture.vehicles) engine.updateVehicle(vehicle.sample);
      backend.advance(1 / 60);
    }
    const audioEnd = nowNs();
    audioRuns.push(Number(audioEnd - audioStart) / 1e6);
    const stats = engine.getStats();
    voicesStarted = stats.voiceStarts;
    activeVoices = stats.activeVoices;
    ownedBufferBytes = stats.bufferBytes;
    if (gcAvailable) gc();
    const heapWithEngine = process.memoryUsage().heapUsed;
    memoryDeltas.push(heapWithEngine - heapWithoutEngine);
    heapBeforeBytes = heapWithoutEngine;
    heapAfterBytes = heapWithEngine;
    engine.dispose();
  }

  const baselineMs = median(baselineRuns);
  const audioMs = median(audioRuns);
  const perTickUs = ((audioMs - baselineMs) / ticks) * 1000;
  const relativeShare = baselineMs > 0 ? (audioMs - baselineMs) / audioMs : 0;
  const retainedHeapBytes = median(memoryDeltas);

  return Object.freeze({
    fixture: Object.freeze({
      version: fixture.version,
      vehicles: fixture.vehicles.length,
      ticks,
      repetitions,
      audibleVehicles: fixture.vehicles.filter(
        (vehicle) => vehicle.sample.distanceM < AUDIO_LIMITS.audibleDistanceM,
      ).length,
    }),
    baseline: Object.freeze({
      totalMs: Number(baselineMs.toFixed(4)),
      perTickUs: Number(((baselineMs / ticks) * 1000).toFixed(4)),
    }),
    withAudio: Object.freeze({
      totalMs: Number(audioMs.toFixed(4)),
      perTickUs: Number(((audioMs / ticks) * 1000).toFixed(4)),
      voicesStarted,
      activeVoices,
    }),
    delta: Object.freeze({
      perTickUs: Number(perTickUs.toFixed(4)),
      relativeShare: Number(relativeShare.toFixed(6)),
    }),
    memory: Object.freeze({
      heapBeforeBytes,
      heapAfterBytes,
      heapDeltaBytes: retainedHeapBytes,
      ownedBufferBytes,
      gcAvailable,
    }),
    budgets: Object.freeze({
      authoritativeTickP95Ms: 5.5,
      mainThreadP95Ms: 10,
      audioBufferBytesCap: AUDIO_LIMITS.maxBufferBytes,
    }),
    method:
      'Local cost probe in Node: the same deterministic fixture is iterated with and without the ' +
      'audio engine in the same process, the median of five repetitions is reported, and the ' +
      'additional per-tick work plus the retained heap of a live engine and the owned buffer ' +
      'bytes are the measured values.',
    limitations: Object.freeze([
      'Local cost probe, not a hardware frame gate: it does not certify the frame budget of the game.',
      'Other processes on the same machine may pollute the timings; the medians of five ' +
        'repetitions reduce but cannot remove that noise.',
      'The heap delta of Node is not the memory of a browser page; the owned buffer bytes are the ' +
        'auditable figure of the audio subsystem.',
    ]),
  });
}
