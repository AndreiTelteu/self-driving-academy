/**
 * PBI 220 measurement protocol.
 *
 * Five repetitions per workload and backend, 30 s warmup and 120 s measured, fixed foreground tab.
 * Every repetition is retained; the protocol never concatenates percentiles across runs and never
 * continues a run from the middle of the simulation.
 */
import { distribution } from '../../../src/telemetry';
import { FLEET_WORKLOADS } from './plan';
import type { FleetWorkloadSpec, WorkloadId } from './plan';
import type { FleetGateWorkload } from './workload';

export type FleetGateProfile = 'smoke' | 'development' | 'full';

export interface FleetGateRun {
  readonly repeat: number;
  readonly workload: WorkloadId;
  readonly startedAtRafMs: number;
  readonly warmupElapsedMs: number;
  readonly measuredElapsedMs: number;
  readonly measuredRafSpanMs: number;
  readonly frameMs: ReturnType<typeof distribution>;
  readonly mainThreadMs: ReturnType<typeof distribution>;
  readonly authoritativeTickMs: ReturnType<typeof distribution>;
  readonly rapierStepMs: ReturnType<typeof distribution>;
  readonly inputToCommandMs: ReturnType<typeof distribution>;
  readonly learningEndToEndMs: ReturnType<typeof distribution>;
  readonly optionalGpuMs: ReturnType<typeof distribution> | null;
  readonly counts: Readonly<Record<string, number | string | boolean | unknown>>;
  readonly finalState: FleetGateWorkloadFrame;
  readonly simulatedSecondsDuringMeasure: number;
  readonly simulatedToWallRatio: number;
  readonly longTasks: {
    readonly supported: boolean;
    readonly count: number | null;
    readonly maxMs: number | null;
    readonly overflow: boolean;
  };
  readonly cleanup: Readonly<Record<string, number | boolean>>;
  readonly ownedDiagnosticBytes: number;
  readonly gpuTimer: Readonly<Record<string, unknown>>;
  readonly memory: {
    readonly pageHeapBytes: number | null;
    readonly exactPageMemoryBytes: null;
  };
  readonly framesOver35Ms: number;
  readonly framesOver50Ms: number;
  readonly [key: string]: unknown;
}

export interface FleetGateWorkloadFrame {
  readonly tick: number;
  readonly debtSeconds: number;
  readonly status: string;
  readonly simulatedSeconds: number;
  readonly activeRealSeconds: number;
  readonly overloads: number;
}

export interface FleetGateProtocolOptions {
  readonly spec: FleetWorkloadSpec;
  readonly profile: FleetGateProfile;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createWorkload: (epoch: number) => Promise<FleetGateWorkload>;
  readonly checkBackend: () => void;
  readonly onRunCompleted?: (run: FleetGateRun) => Promise<void>;
  readonly completedRuns?: readonly FleetGateRun[];
}

const raf = () =>
  new Promise<number>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('RAF stalled: the capture tab is not rendering (backgrounded or occluded)'));
    }, 3000);
    requestAnimationFrame((time) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(time);
    });
  });

export function protocolTiming(profile: FleetGateProfile) {
  return profile === 'smoke'
    ? { warmupMs: 100, measureMs: 400, repetitions: 1 }
    : profile === 'development'
      ? { warmupMs: 15000, measureMs: 30000, repetitions: 3 }
      : { warmupMs: 30000, measureMs: 120000, repetitions: 5 };
}

function pageHeapBytes(): number | null {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
  return typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null;
}

export async function runFleetGateWorkload(options: FleetGateProtocolOptions) {
  const timing = protocolTiming(options.profile);
  let blurred = !document.hasFocus(),
    hidden = document.hidden;
  const blur = () => {
      blurred = true;
    },
    visibility = () => {
      hidden ||= document.hidden;
    };
  window.addEventListener('blur', blur);
  document.addEventListener('visibilitychange', visibility);
  const check = () => {
    if (blurred || hidden || !document.hasFocus() || document.hidden)
      throw new Error('Hardware probe lost foreground/focus');
    options.checkBackend();
  };
  const runs: FleetGateRun[] = [...(options.completedRuns ?? [])];
  const identities = new Set(runs.map((run) => `${run.workload}:${run.repeat}`));
  if (
    identities.size !== runs.length ||
    runs.some(
      (run) =>
        run.workload !== options.spec.id ||
        !Number.isInteger(run.repeat) ||
        run.repeat < 1 ||
        run.repeat > timing.repetitions,
    )
  ) {
    window.removeEventListener('blur', blur);
    document.removeEventListener('visibilitychange', visibility);
    throw new Error('Invalid completed run identities');
  }
  try {
    for (let repeat = 1; repeat <= timing.repetitions; repeat++) {
      if (identities.has(`${options.spec.id}:${repeat}`)) continue;
      check();
      const workload = await options.createWorkload(repeat);
      const capacity = 60000;
      const frameSamples = new Float64Array(capacity);
      const mainSamples = new Float64Array(capacity);
      const tickSamples = new Float64Array(capacity);
      const physicsSamples = new Float64Array(capacity);
      let frameCount = 0,
        tickCount = 0,
        physicsCount = 0,
        longTasks = 0,
        maxLongTaskMs = 0,
        longTaskOverflow = false,
        measureStart = Infinity,
        measureEnd = Infinity,
        observer: PerformanceObserver | undefined;
      const longTaskSupported =
        typeof PerformanceObserver !== 'undefined' &&
        PerformanceObserver.supportedEntryTypes.includes('longtask');
      if (longTaskSupported) {
        observer = new PerformanceObserver((entries) => {
          for (const entry of entries.getEntries())
            if (entry.startTime >= measureStart && entry.startTime < measureEnd) {
              if (longTasks >= 1024) longTaskOverflow = true;
              else {
                longTasks++;
                maxLongTaskMs = Math.max(maxLongTaskMs, entry.duration);
              }
            }
        });
        observer.observe({ type: 'longtask', buffered: false });
      }
      let startState: FleetGateWorkloadFrame | null = null,
        lastState: FleetGateWorkloadFrame | null = null;
      try {
        workload.prepareObservation(true);
        if (workload.physicalVehicles !== options.spec.taxis + options.spec.civilians)
          throw new Error('Fleet gate workoad lost physical vehicles before warmup');
        /* Priming: shader/decode compilation happens here, outside the measured clock. */
        for (let prime = 0; prime < 3; prime++) {
          await raf();
          workload.render();
        }
        const start = await raf();
        let previous = start;
        workload.frame(
          start,
          false,
          () => undefined,
          () => undefined,
        );
        let finalState: FleetGateWorkloadFrame | null = null,
          finalTimestamp = start;
        while (true) {
          const now = await raf();
          check();
          const measured = Number.isFinite(measureStart);
          const mainStart = performance.now();
          const state = workload.frame(
            now,
            measured,
            (cpuMs) => {
              if (!measured) return;
              if (tickCount >= tickSamples.length || !Number.isFinite(cpuMs) || cpuMs < 0)
                throw new Error('Hardware tick sample admission');
              tickSamples[tickCount++] = cpuMs;
            },
            (rapierMs) => {
              if (!measured) return;
              if (
                physicsCount >= physicsSamples.length ||
                !Number.isFinite(rapierMs) ||
                rapierMs < 0
              )
                throw new Error('Hardware physics sample admission');
              physicsSamples[physicsCount++] = rapierMs;
            },
          );
          lastState = state;
          workload.render();
          if (state.status !== 'running')
            throw new Error(
              `Fleet workload invalid:${state.status},tick=${state.tick},debt=${state.debtSeconds}`,
            );
          const mainCost = performance.now() - mainStart;
          if (measured) {
            if (frameCount >= frameSamples.length)
              throw new Error('Hardware frame sample overflow');
            frameSamples[frameCount] = now - previous;
            mainSamples[frameCount++] = mainCost;
          }
          previous = now;
          finalState = state;
          finalTimestamp = now;
          if (!measured && now - start >= timing.warmupMs) {
            measureStart = now;
            startState = state;
            workload.beginMeasurement();
          }
          if (measured && now - measureStart >= timing.measureMs) break;
        }
        measureEnd = performance.now();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (observer)
          for (const entry of observer.takeRecords())
            if (entry.startTime >= measureStart && entry.startTime < measureEnd) {
              if (longTasks >= 1024) longTaskOverflow = true;
              else {
                longTasks++;
                maxLongTaskMs = Math.max(maxLongTaskMs, entry.duration);
              }
            }
        if (
          longTaskOverflow ||
          !startState ||
          !finalState ||
          finalTimestamp - measureStart < timing.measureMs
        )
          throw new Error('Incomplete hardware measurement');
        const counts = workload.counts();
        const samples = workload.samples();
        if (Number(counts.vehicles) !== options.spec.taxis + options.spec.civilians)
          throw new Error(
            `Camera/render must not remove physical actors:${String(counts.vehicles)}/${options.spec.taxis + options.spec.civilians}`,
          );
        if (
          Number(counts.controllers) !==
          Number(counts.physicsSteps) * (options.spec.taxis + options.spec.civilians)
        )
          throw new Error('Missing 60 Hz controller participation');
        if (Number(counts.learningActivations) < 1)
          throw new Error('The real learning pipeline did not activate a learned version');
        if (samples.inputMs.length < 1) throw new Error('Missing real input -> command samples');
        if (
          Number(counts.lastContextSourceTick) > finalState.tick ||
          Number(counts.lastDecisionTick) > finalState.tick
        )
          throw new Error('Future or restamped source tick');
        const simulatedSecondsDuringMeasure =
          finalState.simulatedSeconds - startState.simulatedSeconds;
        const measuredRafSpanMs = finalTimestamp - measureStart;
        const simulatedToWallRatio = simulatedSecondsDuringMeasure / (measuredRafSpanMs / 1000);
        if (!Number.isFinite(simulatedToWallRatio) || simulatedToWallRatio < 0.98)
          throw new Error(
            `Simulation fell behind actual measured wall time:${simulatedToWallRatio}`,
          );
        const diagnostics = workload.diagnostics();
        const cleanup = workload.dispose();
        const leaked =
          !cleanup.worldDisposed ||
          cleanup.mappedVehicles !== 0 ||
          cleanup.subscriptions !== 0 ||
          cleanup.ownedMeshes !== 0 ||
          cleanup.schedulerJobs !== 0 ||
          cleanup.schedulerCache !== 0 ||
          cleanup.schedulerIdentities !== 0 ||
          cleanup.schedulerUrgent !== 0 ||
          cleanup.collisionPairs !== 0 ||
          cleanup.pendingCollisionEvents !== 0 ||
          cleanup.busSubscriptions !== 0 ||
          cleanup.gpuInstruments !== 0;
        if (leaked) throw new Error('Hardware workload leaked owned resources');
        const frameValues = Array.from(frameSamples.subarray(0, frameCount));
        const completedRun: FleetGateRun = {
          repeat,
          workload: options.spec.id,
          startedAtRafMs: start,
          warmupElapsedMs: measureStart - start,
          measuredElapsedMs: measureEnd - measureStart,
          measuredRafSpanMs,
          frameMs: distribution(frameSamples, frameCount),
          mainThreadMs: distribution(mainSamples, frameCount),
          authoritativeTickMs: distribution(tickSamples, tickCount),
          rapierStepMs: distribution(physicsSamples, physicsCount),
          inputToCommandMs: distribution(samples.inputMs, samples.inputMs.length),
          learningEndToEndMs: distribution(samples.learningMs, samples.learningMs.length),
          optionalGpuMs:
            diagnostics.gpuTimer && (diagnostics.gpuTimer as { samples?: unknown }).samples
              ? (diagnostics.gpuTimer as { samples: ReturnType<typeof distribution> }).samples
              : null,
          counts,
          finalState,
          simulatedSecondsDuringMeasure,
          simulatedToWallRatio,
          longTasks: {
            supported: longTaskSupported,
            count: longTaskSupported ? longTasks : null,
            maxMs: longTaskSupported ? maxLongTaskMs : null,
            overflow: longTaskOverflow,
          },
          cleanup,
          ownedDiagnosticBytes: Number(diagnostics.ownedDiagnosticBytes),
          gpuTimer: diagnostics.gpuTimer as Readonly<Record<string, unknown>>,
          memory: { pageHeapBytes: pageHeapBytes(), exactPageMemoryBytes: null },
          framesOver35Ms: frameValues.filter((value) => value > 35).length,
          framesOver50Ms: frameValues.filter((value) => value > 50).length,
          phaseMs: Object.fromEntries(
            Object.entries(samples.phases).map(([name, values]) => [
              name,
              distribution(values, values.length),
            ]),
          ),
        };
        runs.push(completedRun);
        await options.onRunCompleted?.(completedRun);
      } catch (error) {
        let failureCounts: unknown = null;
        let cleanup: unknown = null;
        try {
          failureCounts = workload.counts();
        } catch {
          failureCounts = null;
        }
        try {
          cleanup = workload.dispose();
        } catch {
          cleanup = null;
        }
        throw Object.assign(
          new Error(
            `Fleet gate workload failed:${options.spec.id},repeat=${repeat},cause=${String(error)}`,
          ),
          {
            evidence: {
              workload: options.spec.id,
              repeat,
              cause: String(error),
              counts: failureCounts,
              cleanup,
              lastState,
              phase: Number.isFinite(measureStart) ? 'measurement' : 'warmup',
              frameSamples: distribution(frameSamples, frameCount),
              mainThreadSamples: distribution(mainSamples, frameCount),
              completedRuns: runs,
              incomplete: true,
            },
          },
        );
      } finally {
        observer?.disconnect();
      }
    }
    return {
      capturedAt: new Date().toISOString(),
      workload: options.spec.id,
      spec: options.spec,
      metadata: options.metadata,
      fixtureVersion: `220-fleet-physical-gate-v1${options.profile === 'smoke' ? '-SMOKE' : options.profile === 'development' ? '-DEV' : ''}`,
      protocol: {
        profile: options.profile,
        repetitions: timing.repetitions,
        warmupMs: timing.warmupMs,
        measureMs: timing.measureMs,
        foreground: true,
        clock: 'actualRAF',
        sampleCapacity: 60000,
        observer: 'common frame/main CPU timer plus per-authoritative-tick and Rapier step samples',
      },
      deferredWorkloads: FLEET_WORKLOADS.filter((spec) => spec.id !== options.spec.id).map(
        (spec) => spec.id,
      ),
      runs,
      scope:
        'Actual headed physical V1 fleet fixture; not a complete campaign/release certification and not a substitute for 224 soak.',
    };
  } finally {
    window.removeEventListener('blur', blur);
    document.removeEventListener('visibilitychange', visibility);
  }
}
