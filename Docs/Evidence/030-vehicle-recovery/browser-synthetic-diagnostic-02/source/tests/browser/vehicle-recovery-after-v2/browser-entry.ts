import { runTrustedFunctional } from './functional-runtime';
import {
  ownPresentationLatch,
  exportRunParts,
  describeCause,
  fixedTickFault,
} from '../vehicle-recovery-after/browser-observation';
import '@babylonjs/core/Materials/standardMaterial';
import { createRenderingBackend } from '../../../src/rendering/babylon/backend';
import { createFixedTickLoop } from '../../../src/simulation/fixed-tick';
import { createHarnessLifetime } from '../vehicle-damage/hardware-lifetime';
import { createHistogram, HARDWARE_METRICS } from '../vehicle-damage/hardware-collector';
import type { HardwareMetric } from '../vehicle-damage/hardware-collector';
import { createHardwareWorkload } from '../vehicle-recovery-after/browser-workload';
import { sequence, partId, verifyRun } from '../vehicle-recovery-after/browser-proof';
import type { Build, Identity, Part, Run } from '../vehicle-recovery-after/browser-proof';
const check = (value: unknown, reason: string) => {
  if (!value) throw Error(reason);
};
const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
function heap(phase: string) {
  const m = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    }
  ).memory;
  return {
    phase,
    timeMs: performance.now(),
    usedBytes: m?.usedJSHeapSize ?? null,
    totalBytes: m?.totalJSHeapSize ?? null,
    limitBytes: m?.jsHeapSizeLimit ?? null,
  };
}
async function post(path: string, value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  check(bytes.byteLength <= 128 * 1024, '128KiB immutable payload');
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bytes,
  });
  if (!response.ok) throw Error('Export ' + response.status + ' ' + (await response.text()));
  return response.json();
}
export async function runReference(
  preference: 'AUTO' | 'WEBGL2',
  progress: (value: string) => void,
) {
  const outer = createHarnessLifetime();
  const presentation = ownPresentationLatch(window, document, (label, release) =>
    outer.own(label, release),
  );
  let active: Identity | undefined;
  let captureId: string | undefined, base: string | undefined;
  let backend: Awaited<ReturnType<typeof createRenderingBackend>> | undefined;
  let backendCleanup: Record<string, unknown> | undefined;
  const outerMetadata: Record<string, unknown> = {
    preference,
    startedAt: new Date().toISOString(),
  };
  try {
    const build = (await (await fetch('/build')).json()) as Build;
    const start = await post('/start', { preference });
    captureId = start.captureId as string;
    base = '/capture/' + captureId;
    outerMetadata.captureId = captureId;
    backend = await createRenderingBackend(
      document.getElementById('canvas') as HTMLCanvasElement,
      preference,
    );
    const owned = backend;
    outer.own('backend', () => {
      let primary;
      try {
        owned.dispose();
      } catch (error) {
        primary = error;
      }
      const counts: Record<string, unknown> = {};
      for (const [name, read] of Object.entries({
        sceneDisposed: () => owned.scene.isDisposed,
        meshes: () => owned.scene.meshes.length,
        materials: () => owned.scene.materials.length,
        lights: () => owned.scene.lights.length,
        cameras: () => owned.scene.cameras.length,
        engineScenes: () => owned.scene.getEngine().scenes.length,
      }))
        try {
          counts[name] = read();
        } catch (error) {
          outer.record('backendreadback:' + name, error);
        }
      backendCleanup = counts;
      if (primary)
        throw Object.assign(new AggregateError([primary], 'Backenddisposefailed'), {
          diagnostics: counts,
        });
    });
    owned.scene.getEngine().setHardwareScalingLevel(1);
    owned.resize();
    let lost = false;
    const engine = owned.scene.getEngine();
    const lostObserver = engine.onContextLostObservable.add(() => {
      lost = true;
    });
    outer.own('context-listener', () => engine.onContextLostObservable.remove(lostObserver));
    const gpu = JSON.stringify(
      'getInfo' in engine ? (engine as unknown as { getInfo(): unknown }).getInfo() : null,
    );
    Object.assign(outerMetadata, {
      gpu,
      actualBackend: owned.rendererKind,
      dpr: devicePixelRatio,
      css: [owned.canvas.clientWidth, owned.canvas.clientHeight],
      internal: [engine.getRenderWidth(), engine.getRenderHeight()],
      visible: document.visibilityState,
      focused: document.hasFocus(),
    });
    check(
      owned.rendererKind === start.backend &&
        /AMD/i.test(gpu) &&
        !/swiftshader|llvmpipe|software rasterizer/i.test(gpu),
      'ActualAMD requestedrenderer',
    );
    const guard = () => {
      check(
        !lost &&
          !presentation.lost &&
          document.visibilityState === 'visible' &&
          document.hasFocus(),
        'Realfocus/contextlost',
      );
      check(
        devicePixelRatio === 1 &&
          owned.canvas.clientWidth === 1920 &&
          owned.canvas.clientHeight === 1080 &&
          engine.getRenderWidth() === 1920 &&
          engine.getRenderHeight() === 1080,
        'Actual1920x1080DPR1 ownedcanvas',
      );
    };
    guard();
    for (const spec of sequence()) {
      active = {
        captureId,
        backend: owned.rendererKind,
        pair: spec.pair,
        observer: spec.observer,
        runOrdinal: spec.runOrdinal,
        arm: 'CURRENT_030',
        sourceHash: build.sourceHash,
        artifactHash: build.artifactHash,
        nativeHash: build.nativeHash,
      };
      const identity = active;
      progress(
        `${captureId} ${identity.backend} ${spec.runOrdinal + 1}/10 observer=${spec.observer}; retain foreground/focus`,
      );
      await post(base + '/run-start', {
        identity,
        startedAt: new Date().toISOString(),
        guards: {
          gpu,
          backend: owned.rendererKind,
          dpr: devicePixelRatio,
          css: [owned.canvas.clientWidth, owned.canvas.clientHeight],
          internal: [engine.getRenderWidth(), engine.getRenderHeight()],
        },
      });
      const lifetime = createHarnessLifetime();
      let workload: Awaited<ReturnType<typeof createHardwareWorkload>> | undefined;
      let releaseWorkload:
        (() => ReturnType<NonNullable<typeof workload>['dispose']> | undefined) | undefined;
      let releaseLoop: (() => unknown) | undefined;
      let uploaded = false;
      let cleanup: Record<string, number | boolean> | undefined;
      let cleanupDiagnostics: unknown = null,
        transportDiagnostics: unknown = null;
      let fixedState: unknown = null;
      let latestCallback: unknown = null;
      const histograms = new Map<HardwareMetric, ReturnType<typeof createHistogram>>();
      for (const metric of spec.observer ? HARDWARE_METRICS : (['frameIntervalMs'] as const))
        if (!['gpuDurationMs', 'inputCommandLatencyMs'].includes(metric))
          histograms.set(metric, createHistogram());
      const rows = new Float64Array(spec.observer ? 256 * 4 : 0);
      let rowCount = 0,
        nextHeap = 0,
        peak: number | null = null;
      const endpoints = [heap('BEFORE_WARMUP')];
      let measured = false,
        measuredTicks = 0,
        frames = 0,
        warmTicks = 0,
        warmStart = 0,
        warmEnd = 0,
        measureStart = 0,
        measureEnd = 0,
        maxGap = 0,
        rafFirst = 0,
        rafFirstDelta = 0,
        rafLast = 0,
        rafLastDelta = 0,
        rafSum = 0;
      let loop: ReturnType<typeof createFixedTickLoop> | undefined;
      const metricParts = (): Part[] =>
        (spec.observer ? HARDWARE_METRICS : (['frameIntervalMs'] as const)).map((metric) => ({
          identity,
          kind: 'metric',
          metric,
          distribution: histograms.get(metric)?.snapshot() ?? null,
        }));
      const sendPart = async (name: string, part: Part) => {
        const id = partId(identity, name);
        const ack = await post(base + '/part', { partId: id, part });
        check(ack.partId === id, 'ImmutablepartACK');
        return id;
      };
      try {
        workload = await createHardwareWorkload(owned, identity);
        const acquired = workload;
        releaseWorkload = lifetime.own('workload', () => {
          try {
            cleanup = acquired.dispose();
            return cleanup;
          } catch (error) {
            cleanupDiagnostics = (error as Error & { diagnostics?: unknown }).diagnostics ?? null;
            throw error;
          }
        });
        await owned.scene.whenReadyAsync();
        const startedAt = new Date().toISOString();
        const add = (metric: HardwareMetric, value: number) => histograms.get(metric)?.add(value);
        loop = createFixedTickLoop({
          captureSnapshot: () => ({ tick: acquired.totalTicks }),
          interpolate: (_p, c) => c,
          step(time) {
            const begin = measured && spec.observer ? performance.now() : 0;
            const frame = acquired.step(time.tick, measured, spec.observer);
            if (measured) {
              measuredTicks++;
              if (spec.observer) {
                add('controllerTickMs', performance.now() - begin);
                add('rapierStepMs', frame.physics.stepMs);
                add('nativeControllerMs', frame.physics.controllerMs);
                add('nativeQueryMs', frame.physics.queryMs);
                add('nativeBridgeMs', frame.physics.bridgeMs);
                if (frame.drivetrainCpuMs !== undefined)
                  add('drivetrainStageMs', frame.drivetrainCpuMs);
              }
            }
          },
        });
        const acquiredLoop = loop;
        releaseLoop = lifetime.own('loop', () => acquiredLoop.dispose());
        guard();
        const firstRequestMs = performance.now(),
          firstNativeBefore = acquired.world.collisionStepSerial();
        warmStart = await nextFrame();
        latestCallback = {
          phase: 'FIRST_WARM',
          requestMs: firstRequestMs,
          previousStamp: null,
          returnedStamp: warmStart,
          readMs: performance.now(),
          nativeBefore: firstNativeBefore,
          nativeAfter: acquired.world.collisionStepSerial(),
          controllerTick: acquired.controller.getStats().tick,
        };
        guard();
        let last = warmStart;
        acquiredLoop.frame(warmStart);
        while (true) {
          const requestMs = performance.now(),
            nativeBefore = acquired.world.collisionStepSerial();
          const now = await nextFrame(),
            begin = measured && spec.observer ? performance.now() : 0;
          latestCallback = {
            phase: measured ? 'MEASURE' : 'WARM',
            requestMs,
            previousStamp: last,
            returnedStamp: now,
            readMs: performance.now(),
            nativeBefore,
            nativeAfter: acquired.world.collisionStepSerial(),
            controllerTick: acquired.controller.getStats().tick,
            gapMs: now - last,
          };
          guard();
          const elapsed = now - last;
          check(elapsed >= 0 && elapsed <= 250, 'RAF gap/clock');
          last = now;
          const frame = acquiredLoop.frame(now);
          fixedState = {
            status: frame.state.status,
            tick: frame.state.tick,
            debtSeconds: frame.state.debtSeconds,
            activeRealSeconds: frame.state.activeRealSeconds,
            simulatedSeconds: frame.state.simulatedSeconds,
            overloadCount: frame.state.overloadCount,
            fault: frame.state.fault
              ? {
                  stage: frame.state.fault.stage,
                  attemptedTick: frame.state.fault.attemptedTick,
                  error: String(frame.state.fault.error).slice(0, 4096),
                }
              : null,
          };
          if (frame.state.fault) throw fixedTickFault(frame.state.fault, fixedState);
          check(
            frame.state.status === 'running' && frame.state.overloadCount === 0,
            'Actualfixedtick overload/debt',
          );
          const renderStart = measured && spec.observer ? performance.now() : 0;
          acquired.render();
          guard();
          if (measured) {
            frames++;
            rafSum += elapsed;
            if (!rafFirst) {
              rafFirst = now;
              rafFirstDelta = elapsed;
            }
            rafLast = now;
            rafLastDelta = elapsed;
            maxGap = Math.max(maxGap, elapsed);
            add('frameIntervalMs', elapsed);
            if (spec.observer) {
              add('renderCpuMs', performance.now() - renderStart);
              if (now - measureStart >= nextHeap * 1000) {
                nextHeap++;
                const point = heap('AFTER_MEASURE');
                if (point.usedBytes !== null) {
                  check(rowCount < 256, '256heaprows');
                  rows.set(
                    [point.timeMs, point.usedBytes, point.totalBytes!, point.limitBytes!],
                    rowCount * 4,
                  );
                  rowCount++;
                  peak = Math.max(peak ?? 0, point.usedBytes);
                } else nextHeap = Infinity;
              }
              add('mainThreadFrameMs', performance.now() - begin);
            }
            if (now - measureStart >= 120000) {
              measureEnd = now;
              break;
            }
          } else if (now - warmStart >= 30000) {
            warmEnd = now;
            warmTicks = acquired.totalTicks;
            measureStart = now;
            endpoints.push(heap('BEFORE_MEASURE'));
            measured = true;
          }
        }
        endpoints.push(heap('AFTER_MEASURE'));
        measured = false;
        const actualEndTick = acquired.totalTicks;
        const trace = await acquired.trace();
        const parts = metricParts();
        parts.push({ identity, kind: 'trace', ...trace, actualEndTick });
        parts.push({
          identity,
          kind: 'heap',
          endpoints,
          rows: Array.from(rows.subarray(0, rowCount * 4)),
          sampleCount: rowCount,
          peakUsedBytes: peak,
          cadenceMs: 1000,
          scope: 'ChromeJSproxy/lowerboundobservedpeak; notnativeRAM',
        });
        releaseLoop();
        cleanup = releaseWorkload();
        lifetime.throwIfFailed();
        check(cleanup, 'Nativecleanupreadback');
        const run: Run = {
          identity,
          firstWorldAt: acquired.firstWorldAt,
          startedAt,
          completedAt: new Date().toISOString(),
          warmupWallMs: warmEnd - warmStart,
          measuredWallMs: measureEnd - measureStart,
          warmupTicks: warmTicks,
          measuredTicks,
          measuredFrames: frames,
          tickCounts: Array.from(acquired.measuredActorTicks),
          simulationWallRatio: measuredTicks / 60 / ((measureEnd - measureStart) / 1000),
          warmupRatio: warmTicks / 60 / ((warmEnd - warmStart) / 1000),
          maximumRafGapMs: maxGap,
          guards: {
            foreground: document.hasFocus(),
            visible: document.visibilityState === 'visible',
            contextAlive: !lost,
            running: true,
            overloadCount: 0,
            dpr: devicePixelRatio,
            css: [owned.canvas.clientWidth, owned.canvas.clientHeight],
            internal: [engine.getRenderWidth(), engine.getRenderHeight()],
            renderer: owned.rendererKind,
            gpu,
          },
          raf: {
            previousMs: measureStart,
            firstMs: rafFirst,
            lastMs: rafLast,
            firstDeltaMs: rafFirstDelta,
            lastDeltaMs: rafLastDelta,
            sumMs: rafSum,
            frames,
            nativeBefore: warmTicks,
            nativeAfter: actualEndTick,
          },
          fixedState,
          latestCallback,
          parts: [],
          cleanup: cleanup!,
          buffers: {
            histogramBytes: [...histograms.values()].reduce(
              (sum, h) => sum + h.ownedCounterBytes,
              0,
            ),
            heapBytes: rows.byteLength,
            ...acquired.ownedTypedBytes,
            checkpointCodecMaximumBytes: 128 * 1024,
            pendingHashesMaximum: 64,
          },
          road: acquired.road.map.mapId,
          ownership: lifetime.snapshot(),
        };
        // Persist ALL bounded raw data and manifest BEFORE independent guard/budget acceptance.
        run.parts = parts.map((part) =>
          partId(identity, part.kind === 'metric' ? part.metric! : part.kind),
        );
        uploaded = true;
        try {
          transportDiagnostics = await exportRunParts(
            run,
            parts.map((part, index) => ({ id: run.parts[index], part })),
            (path, value) => post(base + '/' + path, value),
          );
        } catch (error) {
          transportDiagnostics = (error as Error & { diagnostics?: unknown }).diagnostics ?? null;
          throw error;
        }
        await post(base + '/run-raw', run);
        verifyRun(run, parts, build);
        const ack = await post(base + '/run-complete', { identity });
        check(ack.runOrdinal === spec.runOrdinal, 'RuncompleteACK');
        progress(`${captureId} immutable run${spec.runOrdinal + 1}/10 saved`);
      } catch (error) {
        lifetime.record('primary', error);
        measured = false;
        if (!uploaded) {
          await lifetime.attempt('partialmetadatafirst', () =>
            post(base + '/run-submitted', {
              identity,
              partial: true,
              error: String(error).slice(0, 4096),
              fixedState,
              latestCallback,
              measuredTicks,
              measuredFrames: frames,
              warmTicks,
              warmStart,
              measureStart,
              measureEnd,
              endpoints,
            }),
          );
          for (const part of metricParts())
            await lifetime.attempt('partialmetricexport', () => sendPart(part.metric!, part));
          await lifetime.attempt('partialheapexport', () =>
            sendPart('heap', {
              identity,
              kind: 'heap',
              endpoints: [...endpoints, heap('AFTER_MEASURE')],
              rows: Array.from(rows.subarray(0, rowCount * 4)),
              sampleCount: rowCount,
              partial: true,
              measuredTicks,
              measuredFrames: frames,
              warmTicks,
            }),
          );
          if (workload)
            await lifetime.attempt('partialtraceexport', async () =>
              sendPart('trace', { identity, kind: 'trace', ...(await workload!.partialTrace()) }),
            );
        }
        releaseLoop?.();
        releaseWorkload?.();
        lifetime.dispose();
        await lifetime.attempt('failureexport', () =>
          post(base + '/failure', {
            identity,
            stage: 'RUN',
            primaryCause: describeCause(error),
            setupDiagnostics: (error as Error & { diagnostics?: unknown }).diagnostics ?? null,
            error: String(error).slice(0, 4096),
            lifetime: lifetime.snapshot(),
            metadata: {
              cleanup,
              cleanupDiagnostics,
              transportDiagnostics,
              fixedState,
              latestCallback,
              measuredTicks,
              measuredFrames: frames,
              warmTicks,
              totalTicks: workload?.totalTicks ?? 0,
              warmStart,
              measureStart,
              measureEnd,
              endpoints,
              visible: document.visibilityState,
              focused: document.hasFocus(),
              contextLost: lost,
              presentationLost: presentation.lost,
              gpu,
              css: [owned.canvas.clientWidth, owned.canvas.clientHeight],
              internal: [engine.getRenderWidth(), engine.getRenderHeight()],
            },
          }),
        );
        lifetime.throwIfFailed();
      } finally {
        lifetime.dispose();
      }
    }
    outer.dispose();
    outer.throwIfFailed();
    await post(base + '/finish', {
      captureId,
      backendOwnership: outer.snapshot(),
      backendCleanup,
      sceneDisposed: owned.scene.isDisposed,
    });
    progress(
      `${captureId} CURRENT AFTER: 10 performance runs saved; strict both-backend relative/memory and trusted-R verification pending; optional timing not measured`,
    );
  } catch (error) {
    outer.record('primary', error);
    outer.dispose();
    if (base)
      await outer.attempt('terminalfailureexport', () =>
        post(base + '/failure', {
          identity: active ?? null,
          stage: 'BACKEND',
          primaryCause: describeCause(error),
          metadata: { ...outerMetadata, backendCleanup, presentationLost: presentation.lost },
          error: String(error).slice(0, 4096),
          lifetime: outer.snapshot(),
        }),
      );
    outer.throwIfFailed();
  }
}
const functionalButton = document.getElementById('functional') as HTMLButtonElement;
const button = document.getElementById('run') as HTMLButtonElement,
  status = document.getElementById('status')!;
button.addEventListener('click', async () => {
  button.disabled = true;
  functionalButton.disabled = true;
  try {
    await runReference(
      (document.getElementById('backend') as HTMLSelectElement).value as 'AUTO' | 'WEBGL2',
      (text) => {
        status.textContent = text;
      },
    );
  } catch (error) {
    status.textContent = 'TERMINAL FAILED ' + String(error);
  } finally {
    button.disabled = false;
    functionalButton.disabled = false;
  }
});

functionalButton.addEventListener('click', async () => {
  button.disabled = true;
  functionalButton.disabled = true;
  try {
    await runTrustedFunctional(
      (document.getElementById('backend') as HTMLSelectElement).value as 'AUTO' | 'WEBGL2',
      (text) => {
        status.textContent = text;
      },
    );
  } catch (error) {
    status.textContent = 'FUNCTIONAL TERMINAL FAILED ' + String(error);
  } finally {
    button.disabled = false;
    functionalButton.disabled = false;
  }
});
