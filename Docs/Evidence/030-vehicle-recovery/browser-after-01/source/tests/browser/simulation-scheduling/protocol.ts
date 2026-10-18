// Prepared common foreground protocol. Physical028/024 binding is supplied only after it is stable.
import { distribution } from '../../../src/telemetry';

export type SchedulingArm = 'UNPHASED_REFERENCE' | 'ENTITY_PHASED';
export interface SchedulingHardwareRun {
  readonly repeat: number;
  readonly observe: boolean;
  readonly semanticCheckpoints: readonly SchedulingSemanticCheckpoint[];
  readonly frameMs: ReturnType<typeof distribution>;
  readonly mainThreadMs: ReturnType<typeof distribution>;
  readonly [key: string]: unknown;
}
export interface SchedulingSemanticCheckpoint {
  readonly tick: number;
  readonly commandsDigest: string;
  readonly posesDigest: string;
  readonly authoritativeEventsDigest: string;
}
export interface SchedulingHardwareWorkload {
  /** Allocate optional observers before warmup, never at the measured boundary. */
  prepareObservation(observe: boolean): void;
  beginMeasurement(): void;
  diagnostics(): {
    readonly gpuTimer: Readonly<Record<string, unknown>>;
    readonly ownedDiagnosticBytes: number;
  };
  /** Must run existing008loop and actual physical/controller/context ports; no synthetic RAF clock. */
  frame(
    nowMs: number,
    observe: boolean,
    tickSample: (cpuMs: number) => void,
  ): {
    readonly tick: number;
    readonly debtSeconds: number;
    readonly status: string;
    readonly simulatedSeconds: number;
    readonly activeRealSeconds: number;
  };
  render(): void;
  counts(): {
    readonly vehicles: number;
    readonly decisions: number;
    readonly controllers: number;
    readonly physicsSteps: number;
    readonly lastContextSourceTick: number;
    readonly lastDecisionTick: number;
  };
  /** At most32 fixed physical-tick checkpoints, with identical command policy in both arms. */
  semanticCheckpoints(): readonly SchedulingSemanticCheckpoint[];
  /** Idempotent, including when a failure occurs after a cleanup check. */
  dispose(): {
    readonly worldDisposed: boolean;
    readonly mappedVehicles: number;
    readonly subscriptions: number;
    readonly ownedMeshes: number;
    readonly schedulerJobs: number;
    readonly schedulerCache: number;
    readonly schedulerIdentities: number;
    readonly schedulerUrgent: number;
    readonly collisionPairs: number;
    readonly pendingCollisionEvents: number;
    readonly busSubscriptions: number;
    readonly gpuInstruments: number;
  };
}
export interface SchedulingHardwareOptions {
  readonly arm: SchedulingArm;
  readonly metadata: Readonly<Record<string, unknown>>;
  /** Factory owns cleanup if it throws before returning a workload to the protocol. */
  readonly createWorkload: (epoch: number) => Promise<SchedulingHardwareWorkload>;
  /** Owner checks actual backend/GPU loss as well as the shared focus/visibility checks. */
  readonly checkBackend: () => void;
  readonly smoke?: boolean;
  readonly onRunCompleted?: (run: Readonly<Record<string, unknown>>) => Promise<void>;
  /** Owner loads immutable runs only after matching source/build/backend/protocol identity. */
  readonly completedRuns?: readonly SchedulingHardwareRun[];
}
const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

/** Compare matching backend/preset runs at the fixture's same fixed physical ticks. */
export function compareSchedulingSemanticCheckpoints(
  reference: readonly SchedulingSemanticCheckpoint[],
  phased: readonly SchedulingSemanticCheckpoint[],
) {
  if (!reference.length || reference.length > 32 || reference.length !== phased.length)
    throw new Error('Missing or mismatched semantic checkpoints');
  for (let index = 0; index < reference.length; index++) {
    const before = reference[index],
      after = phased[index];
    if (
      before.tick !== after.tick ||
      before.commandsDigest !== after.commandsDigest ||
      before.posesDigest !== after.posesDigest ||
      before.authoritativeEventsDigest !== after.authoritativeEventsDigest
    )
      throw new Error(
        `Scheduling arms changed physical semantics at checkpoint:${before.tick}/${after.tick}`,
      );
  }
}

export async function runSchedulingHardware(options: SchedulingHardwareOptions) {
  const warmupMs = options.smoke ? 100 : 30000,
    measureMs = options.smoke ? 400 : 120000;
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
  const runs: SchedulingHardwareRun[] = [...(options.completedRuns ?? [])];
  const identities = new Set(runs.map((run) => `${run.repeat}:${run.observe}`));
  if (
    identities.size !== runs.length ||
    runs.some(
      (run) =>
        !Number.isInteger(run.repeat) ||
        run.repeat < 1 ||
        run.repeat > 5 ||
        typeof run.observe !== 'boolean',
    )
  ) {
    window.removeEventListener('blur', blur);
    document.removeEventListener('visibilitychange', visibility);
    throw new Error('Invalid completed run identities');
  }
  try {
    for (let repeat = 1; repeat <= 5; repeat++)
      for (const observe of repeat % 2 ? [false, true] : [true, false]) {
        if (identities.has(`${repeat}:${observe}`)) continue;
        check();
        const workload = await options.createWorkload((repeat - 1) * 2 + (observe ? 1 : 0));
        const frameSamples = new Float64Array(60000),
          mainSamples = new Float64Array(60000),
          tickSamples = new Float64Array(observe ? 60000 : 0);
        let frameCount = 0,
          tickCount = 0,
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
        let startState: ReturnType<SchedulingHardwareWorkload['frame']> | null = null,
          lastState: ReturnType<SchedulingHardwareWorkload['frame']> | null = null;
        try {
          workload.prepareObservation(observe);
          if (workload.counts().vehicles !== 70)
            throw new Error('Hardware scheduling fixture must retain all70cars');
          const start = await raf();
          let previous = start;
          workload.frame(start, false, () => undefined);
          let finalState: ReturnType<SchedulingHardwareWorkload['frame']> | null = null,
            finalTimestamp = start;
          while (true) {
            const now = await raf();
            check();
            const measured = Number.isFinite(measureStart);
            const mainStart = performance.now();
            const state = workload.frame(now, observe && measured, (cpuMs) => {
              if (!observe || !measured) return;
              if (tickCount >= tickSamples.length || !Number.isFinite(cpuMs) || cpuMs < 0)
                throw new Error('Hardware tick sample admission');
              tickSamples[tickCount++] = cpuMs;
            });
            lastState = state;
            workload.render();
            if (state.status !== 'running')
              throw new Error(
                `Hardware normal workload invalid:${state.status},tick=${state.tick},debt=${state.debtSeconds}`,
              );
            if (workload.counts().vehicles !== 70)
              throw new Error('Camera/render must not remove physicalactors');
            const mainCost = performance.now() - mainStart;
            if (measured) {
              if (frameCount >= frameSamples.length)
                throw new Error('Hardware frame sample overflow');
              frameSamples[frameCount] = now - previous;
              mainSamples[frameCount++] = mainCost;
            }
            previous = now;
            finalState = state;
            lastState = state;
            finalTimestamp = now;
            if (!measured && now - start >= warmupMs) {
              measureStart = now;
              startState = state;
              workload.beginMeasurement();
            }
            if (measured && now - measureStart >= measureMs) break;
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
            finalTimestamp - measureStart < measureMs
          )
            throw new Error('Incomplete hardware measurement');
          const counts = workload.counts();
          if (counts.controllers !== counts.physicsSteps * 70)
            throw new Error('Missing60Hzcontroller participation');
          if (
            counts.lastContextSourceTick > finalState.tick ||
            counts.lastDecisionTick > finalState.tick
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
          const checkpoints = workload.semanticCheckpoints();
          if (!Array.isArray(checkpoints) || !checkpoints.length || checkpoints.length > 32)
            throw new Error('Semantic checkpoint admission');
          const measuredTick = finalState.tick;
          let previousCheckpointTick = -1;
          const semanticCheckpoints = checkpoints.map((checkpoint) => {
            if (
              !Number.isSafeInteger(checkpoint.tick) ||
              checkpoint.tick <= previousCheckpointTick ||
              checkpoint.tick > measuredTick
            )
              throw new Error('Invalid semantic checkpoint tick');
            previousCheckpointTick = checkpoint.tick;
            for (const digest of [
              checkpoint.commandsDigest,
              checkpoint.posesDigest,
              checkpoint.authoritativeEventsDigest,
            ])
              if (typeof digest !== 'string' || !digest.length || digest.length > 128)
                throw new Error('Invalid semantic checkpoint digest');
            return { ...checkpoint };
          });
          const diagnostics = workload.diagnostics();
          const cleanup = workload.dispose();
          if (
            !cleanup.worldDisposed ||
            cleanup.mappedVehicles ||
            cleanup.subscriptions ||
            cleanup.ownedMeshes ||
            cleanup.schedulerJobs ||
            cleanup.schedulerCache ||
            cleanup.schedulerIdentities ||
            cleanup.schedulerUrgent ||
            cleanup.collisionPairs ||
            cleanup.pendingCollisionEvents ||
            cleanup.busSubscriptions ||
            cleanup.gpuInstruments
          )
            throw new Error('Hardware workload leaked owned resources');
          const completedRun = {
            repeat,
            observe,
            startedAtRafMs: start,
            warmupElapsedMs: measureStart - start,
            measuredElapsedMs: measureEnd - measureStart,
            measuredRafSpanMs,
            frameMs: distribution(frameSamples, frameCount),
            mainThreadMs: distribution(mainSamples, frameCount),
            optionalTickCpuMs: observe ? distribution(tickSamples, tickCount) : null,
            counts,
            finalState,
            simulatedSecondsDuringMeasure,
            simulatedToWallRatio,
            semanticCheckpoints,
            admittedRealSecondsDuringMeasure:
              finalState.activeRealSeconds - startState.activeRealSeconds,
            longTasks: {
              supported: longTaskSupported,
              count: longTaskSupported ? longTasks : null,
              maxMs: longTaskSupported ? maxLongTaskMs : null,
              overflow: longTaskOverflow,
            },
            cleanup,
            ownedDiagnosticBytes:
              frameSamples.byteLength +
              mainSamples.byteLength +
              tickSamples.byteLength +
              diagnostics.ownedDiagnosticBytes,
            gpuTimer: diagnostics.gpuTimer,
            exactPageMemoryBytes: null,
            framesOver18_5Ms: Array.from(frameSamples.subarray(0, frameCount)).filter(
              (value) => value > 18.5,
            ).length,
            framesOver25Ms: Array.from(frameSamples.subarray(0, frameCount)).filter(
              (value) => value > 25,
            ).length,
          };
          runs.push(completedRun);
          await options.onRunCompleted?.(completedRun);
        } catch (error) {
          let failureCounts: ReturnType<SchedulingHardwareWorkload['counts']> | null = null;
          let cleanup: ReturnType<SchedulingHardwareWorkload['dispose']> | null = null;
          let countFailure: string | null = null,
            cleanupFailure: string | null = null;
          try {
            failureCounts = workload.counts();
          } catch (countError) {
            countFailure = String(countError);
          }
          try {
            cleanup = workload.dispose();
          } catch (cleanupError) {
            cleanupFailure = String(cleanupError);
          }
          // Retain the failure identity/counts for the outer owner rather than silently excluding an overload arm.
          throw Object.assign(
            new Error(
              `Scheduling hardware arm failed:${options.arm},repeat=${repeat},observe=${observe},cause=${String(error)}`,
            ),
            {
              evidence: {
                arm: options.arm,
                repeat,
                observe,
                cause: String(error),
                counts: failureCounts,
                countFailure,
                cleanup,
                cleanupFailure,
                lastState,
                frameSamples: distribution(frameSamples, frameCount),
                mainThreadSamples: distribution(mainSamples, frameCount),
                phase: Number.isFinite(measureStart) ? 'measurement' : 'warmup',
                measureStart: Number.isFinite(measureStart) ? measureStart : null,
                measureEnd: Number.isFinite(measureEnd) ? measureEnd : null,
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
      arm: options.arm,
      metadata: options.metadata,
      fixtureVersion: `219-physical70-scheduling-v1${options.smoke ? '-SMOKE' : ''}`,
      protocol: {
        repetitions: 5,
        warmupMs,
        measureMs,
        foreground: true,
        clock: 'actualRAF',
        sampleCapacity: 60000,
        observer:
          'common frame/main CPU timer both; optional per-authoritative-tick CPU samples on',
      },
      runs: runs.sort(
        (a, b) =>
          a.repeat - b.repeat ||
          (a.repeat % 2
            ? Number(a.observe) - Number(b.observe)
            : Number(b.observe) - Number(a.observe)),
      ),
      scope:
        'Actual headed early physical/controller/context fixture, not complete gameplay or laptop gate. GPU timers reported when supported; exact page memory unavailable; smoke cannot be fullprotocolbaseline.',
    };
  } finally {
    window.removeEventListener('blur', blur);
    document.removeEventListener('visibilitychange', visibility);
  }
}
