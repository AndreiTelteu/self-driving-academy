import { createHarnessLifetime, awaitOwnedReadiness } from './hardware-lifetime';
import { createRenderingBackend } from '../../../src/rendering/babylon/backend';
import { createFixedTickLoop } from '../../../src/simulation/fixed-tick';
import { createHistogram, HARDWARE_METRICS } from './hardware-collector';
import type { HardwareMetric } from './hardware-collector';
import { metricPartId } from './hardware-parts';
import type { HardwarePartIdentity, MetricPart } from './hardware-parts';
import { fullBackendSequence } from './hardware-protocol';
import { createHardwareWorkload, sha256 } from './hardware-workload';
import type {
  FrozenHardwareBuild,
  HardwareRunManifest,
  HeapEndpoint,
} from './hardware-run-manifest';
import { verifyRunManifest } from './hardware-run-manifest';

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function heap(phase: HeapEndpoint['phase']): HeapEndpoint {
  const value = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    }
  ).memory;
  return {
    phase,
    timeMs: performance.now(),
    usedBytes: value?.usedJSHeapSize ?? null,
    totalBytes: value?.totalJSHeapSize ?? null,
    limitBytes: value?.jsHeapSizeLimit ?? null,
  };
}
async function post(path: string, value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  check(bytes.byteLength <= 128 * 1024, 'Immutable part payload cap');
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bytes,
  });
  if (!response.ok) throw new Error(`Export ${path}:${response.status} ${await response.text()}`);
  return response.json();
}
export async function runHardwareBackend(
  preference: 'AUTO' | 'WEBGL2',
  progress: (text: string) => void,
) {
  const build = (await (await fetch('/hardware-build')).json()) as FrozenHardwareBuild;
  const begin = await post('/hardware-start', { preference });
  const captureId = begin.captureId as string;
  let backend: Awaited<ReturnType<typeof createRenderingBackend>> | undefined;
  const lifetime = createHarnessLifetime();
  let activeIdentity: HardwarePartIdentity | undefined;
  try {
    backend = await createRenderingBackend(
      document.getElementById('canvas') as HTMLCanvasElement,
      preference,
    );
    const acquiredBackend = backend;
    lifetime.own('backend', () => acquiredBackend.dispose());
    backend.scene.getEngine().setHardwareScalingLevel(1);
    backend.resize();
    const actualBackend = backend.rendererKind;
    check(actualBackend === begin.backend, 'Actual requested backend differs');
    let contextLost = false;
    backend.scene.getEngine().onContextLostObservable.add(() => {
      contextLost = true;
    });
    const gpu = JSON.stringify(
      'getInfo' in backend.scene.getEngine()
        ? (backend.scene.getEngine() as unknown as { getInfo(): unknown }).getInfo()
        : null,
    );
    check(
      /AMD/i.test(gpu) && !/swiftshader|llvmpipe|software rasterizer/i.test(gpu),
      'Actual AMD hardware required',
    );
    for (const spec of fullBackendSequence()) {
      const identity: HardwarePartIdentity = {
        captureId,
        backend: actualBackend,
        pair: spec.pair,
        observer: spec.observer,
        arm: spec.arm,
        runOrdinal: spec.runOrdinal,
        sourceHash: build.sourceHash,
        artifactHash: build.artifactHash,
        nativeHash: build.nativeHash,
      };
      activeIdentity = identity;
      progress(
        `${captureId} ${actualBackend} run${spec.runOrdinal + 1}/20 ${spec.arm} observer=${spec.observer}; retain foreground/focus`,
      );
      const owned = backend;
      const workload = await createHardwareWorkload(owned, identity);
      const runLifetime = createHarnessLifetime();
      try {
        const releaseWorkload = await awaitOwnedReadiness(
          runLifetime,
          'workload',
          workload,
          () => workload.dispose(),
          () => owned.scene.whenReadyAsync(),
        );
        const startedAt = new Date().toISOString();
        const channels = new Map<HardwareMetric, ReturnType<typeof createHistogram>>();
        for (const metric of identity.observer ? HARDWARE_METRICS : (['frameIntervalMs'] as const))
          if (!['gpuDurationMs', 'inputCommandLatencyMs'].includes(metric))
            channels.set(metric, createHistogram());
        const add = (metric: HardwareMetric, duration: number) =>
          channels.get(metric)?.add(duration);
        const heapRows = new Float64Array(identity.observer ? 256 * 4 : 0);
        let heapCount = 0,
          peak: number | null = null;
        let nextHeapSample = 0;
        const endpoints: HeapEndpoint[] = [heap('BEFORE_WARMUP')];
        let measured = false,
          measuredTicks = 0,
          measuredFrames = 0,
          maximumRafGapMs = 0,
          lastRaf = 0;
        let warmupTicks = 0,
          warmupWallMs = 0,
          measureStart = 0,
          measureEnd = 0,
          warmStart = 0;
        const loop = createFixedTickLoop({
          captureSnapshot: () => ({ tick: workload.totalTicks }),
          interpolate: (_previous, current) => current,
          step(time) {
            const start = measured && identity.observer ? performance.now() : 0;
            const frame = workload.step(time.tick, measured, identity.observer);
            if (measured) {
              measuredTicks++;
              if (identity.observer) {
                add('controllerTickMs', performance.now() - start);
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
        const releaseLoop = runLifetime.own('loop', () => loop.dispose());
        let cleanup: HardwareRunManifest['cleanup'] | undefined;
        let exportBegan = false;
        try {
          const guard = () => {
            check(
              document.visibilityState === 'visible' && document.hasFocus(),
              'Real foreground focus lost',
            );
            check(!contextLost, 'Hardware context lost');
            const engine = owned.scene.getEngine();
            check(
              devicePixelRatio === 1 &&
                owned.canvas.clientWidth === 1920 &&
                owned.canvas.clientHeight === 1080 &&
                engine.getRenderWidth() === 1920 &&
                engine.getRenderHeight() === 1080,
              'Actual owned CSS/internal1920x1080 DPR1',
            );
          };
          guard();
          warmStart = await nextFrame();
          lastRaf = warmStart;
          loop.frame(warmStart);
          while (true) {
            const now = await nextFrame();
            const cpuStart = measured && identity.observer ? performance.now() : 0;
            guard();
            const elapsed = now - lastRaf;
            check(elapsed >= 0 && elapsed <= 250, 'RAF gap/clock');
            lastRaf = now;
            const result = loop.frame(now);
            check(
              result.state.status === 'running' && result.state.overloadCount === 0,
              'Fixedtick overload/fault',
            );
            const renderStart = measured && identity.observer ? performance.now() : 0;
            workload.render();
            if (measured) {
              measuredFrames++;
              maximumRafGapMs = Math.max(maximumRafGapMs, elapsed);
              add('frameIntervalMs', elapsed);
              if (identity.observer) {
                add('renderCpuMs', performance.now() - renderStart);
                if (now - measureStart >= nextHeapSample * 1000) {
                  nextHeapSample++;
                  const point = heap('AFTER_MEASURE');
                  if (point.usedBytes !== null) {
                    check(heapCount < 256, 'Heap sample capacity');
                    heapRows.set(
                      [point.timeMs, point.usedBytes, point.totalBytes!, point.limitBytes!],
                      heapCount * 4,
                    );
                    heapCount++;
                    peak = Math.max(peak ?? 0, point.usedBytes);
                  } else nextHeapSample = Infinity;
                }
                add('mainThreadFrameMs', performance.now() - cpuStart);
              }
              if (now - measureStart >= 120000) {
                measureEnd = now;
                break;
              }
            } else if (now - warmStart >= 30000) {
              warmupWallMs = now - warmStart;
              warmupTicks = workload.totalTicks;
              measureStart = now;
              endpoints.push(heap('BEFORE_MEASURE'));
              measured = true;
            }
          }
          // This immediate unsorted endpoint precedes digest draining, snapshot/export or lifecycle work in BOTH arms.
          endpoints.push(heap('AFTER_MEASURE'));
          measured = false;
          const actualEndTick = workload.totalTicks;
          const currentEndCodec = new TextEncoder().encode(
            JSON.stringify(
              Array.from({ length: 70 }, (_, index) => ({
                state: workload.world.project(`car-${index}`),
                control: workload.controller.readControl(workload.tokens[index]),
              })),
            ),
          );
          check(currentEndCodec.byteLength <= 128 * 1024, 'Current endpoint codec capacity');
          const actualEndHash = await sha256(currentEndCodec);
          const trace = await workload.trace();
          const metricParts: MetricPart[] = (
            identity.observer ? HARDWARE_METRICS : (['frameIntervalMs'] as const)
          ).map((metric) => ({
            version: '029-metric-part-v1',
            identity,
            metric,
            distribution: channels.get(metric)?.snapshot() ?? null,
          }));
          const traceId = `${captureId}-${actualBackend}-${spec.runOrdinal}-trace`,
            heapId = `${captureId}-${actualBackend}-${spec.runOrdinal}-heap`;
          const tracePart = {
            version: '029-trace-part-v1',
            identity,
            partId: traceId,
            ...trace,
            actualEndTick,
            actualEndHash,
          };
          const heapPart = {
            version: '029-heap-part-v1',
            identity,
            partId: heapId,
            endpoints,
            rows: heapCount > 0 ? Array.from(heapRows.subarray(0, heapCount * 4)) : [],
            sampleCount: Math.max(0, heapCount),
            cadenceMs: 1000,
            scope:
              'Chrome JS heap proxy; observed samples are lower bound on true peak, not native/WASM/totalRAM',
          };
          releaseLoop();
          cleanup = releaseWorkload();
          runLifetime.throwIfFailed();
          check(cleanup !== undefined, 'Workload cleanup result missing');
          const manifest: HardwareRunManifest = {
            version: '029-run-manifest-v1',
            identity,
            firstWorldAt: workload.firstWorldAt,
            startedAt,
            completedAt: new Date().toISOString(),
            warmupWallMs,
            measuredWallMs: measureEnd - measureStart,
            warmupTicks,
            measuredTicks,
            measuredFrames,
            tickCounts: Array.from(workload.measuredActorTicks),
            simulationWallRatio: measuredTicks / 60 / ((measureEnd - measureStart) / 1000),
            maximumRafGapMs,
            guards: {
              foreground: true,
              visible: true,
              contextAlive: !contextLost,
              running: true,
              overloadCount: 0,
              dpr: devicePixelRatio,
              css: [owned.canvas.clientWidth, owned.canvas.clientHeight],
              internal: [
                owned.scene.getEngine().getRenderWidth(),
                owned.scene.getEngine().getRenderHeight(),
              ],
              renderer: actualBackend,
              gpu,
            },
            endpoints,
            heapPeak:
              identity.observer && peak !== null
                ? { usedBytes: peak, samples: heapCount, cadenceMs: 1000 }
                : null,
            partIds: [...metricParts.map(metricPartId), traceId, heapId],
            cleanup,
            physicalHash: trace.physicalHash,
            checkpointHash: trace.checkpointHash,
            checkpointCount: trace.rows,
            bufferAccounting: {
              histogramBytes: [...channels.values()].reduce(
                (sum, channel) => sum + channel.ownedCounterBytes,
                0,
              ),
              heapBytes: heapRows.byteLength,
              traceBytes: workload.ownedTypedBytes.trace,
              hashScratchBytes: workload.ownedTypedBytes.physicalHashScratch,
              actorTickBytes: workload.ownedTypedBytes.actorTicks,
              endpointBytes: 0,
              persistentTotal:
                [...channels.values()].reduce(
                  (sum, channel) => sum + channel.ownedCounterBytes,
                  0,
                ) +
                heapRows.byteLength +
                workload.ownedTypedBytes.trace +
                workload.ownedTypedBytes.physicalHashScratch +
                workload.ownedTypedBytes.actorTicks,
              checkpointCodecMaximumBytes: 128 * 1024,
              pendingCheckpointCapacity: 64,
            },
          };
          verifyRunManifest(manifest, metricParts, identity, build);
          exportBegan = true;
          for (const part of metricParts)
            await post('/hardware-part', { partId: metricPartId(part), part });
          await post('/hardware-part', { partId: traceId, part: tracePart });
          await post('/hardware-part', { partId: heapId, part: heapPart });
          const ack = await post('/hardware-complete', manifest);
          check(
            ack.runOrdinal === spec.runOrdinal && ack.parts === manifest.partIds.length,
            'Complete immutable manifest acknowledgment',
          );
          // Only this small ACK remains. All per-run distributions, traces, samples and native owners leave scope.
          progress(
            `${captureId}: immutable run${spec.runOrdinal + 1}/20 saved; memory=${ack.memoryAvailability}`,
          );
        } catch (error) {
          runLifetime.record('primary', error);
          measured = false;
          // If timing/physics fails before normal upload, preserve each bounded distribution independently.
          // If upload already began, existing wx files are retained; never retry/overwrite a possibly saved part.
          if (!exportBegan) {
            const partialEnd = heap('AFTER_MEASURE');
            for (const metric of identity.observer
              ? HARDWARE_METRICS
              : (['frameIntervalMs'] as const)) {
              const part: MetricPart = {
                version: '029-metric-part-v1',
                identity,
                metric,
                distribution: channels.get(metric)?.snapshot() ?? null,
              };
              try {
                await post('/hardware-part', { partId: metricPartId(part), part });
              } catch (exportError) {
                runLifetime.record('export:partial-metric', exportError);
                break;
              }
            }
            try {
              await post('/hardware-part', {
                partId: `${captureId}-${actualBackend}-${spec.runOrdinal}-heap`,
                part: {
                  version: '029-heap-part-v1',
                  identity,
                  partId: `${captureId}-${actualBackend}-${spec.runOrdinal}-heap`,
                  endpoints: [...endpoints, partialEnd],
                  rows: Array.from(heapRows.subarray(0, heapCount * 4)),
                  sampleCount: heapCount,
                  cadenceMs: 1000,
                  partial: true,
                  error: String(error),
                  ticks: workload.totalTicks,
                  measuredTicks,
                  measuredFrames,
                },
              });
            } catch (exportError) {
              runLifetime.record('export:partial-heap', exportError);
            }
            try {
              await post('/hardware-part', {
                partId: `${captureId}-${actualBackend}-${spec.runOrdinal}-trace`,
                part: {
                  version: '029-trace-part-v1',
                  identity,
                  partId: `${captureId}-${actualBackend}-${spec.runOrdinal}-trace`,
                  ...(await workload.partialTrace()),
                },
              });
            } catch (exportError) {
              runLifetime.record('export:partial-trace', exportError);
            }
          }
        } finally {
          runLifetime.dispose();
        }
      } catch (error) {
        runLifetime.record('primary', error);
      } finally {
        runLifetime.dispose();
      }
      runLifetime.throwIfFailed();
    }
    lifetime.dispose();
    lifetime.throwIfFailed();
    progress(
      JSON.stringify(
        await post('/hardware-finish', { captureId, backend: actualBackend }),
        null,
        2,
      ),
    );
  } catch (error) {
    lifetime.record('primary', error);
    lifetime.dispose();
    const failure = {
      version: '029-hardware-failure-v1',
      captureId,
      identity: activeIdentity ?? null,
      failedAt: new Date().toISOString(),
      error: String(error),
      errorChain: lifetime.snapshot(),
      policy: 'No selective resume/rerun; preserve original attempt for parent review',
    };
    try {
      await post('/hardware-failure', failure);
    } catch (exportError) {
      lifetime.record('export:failure', exportError);
      progress(
        JSON.stringify(
          { ...failure, exportError: String(exportError), causes: lifetime.snapshot() },
          null,
          2,
        ),
      );
    }
    progress(JSON.stringify(failure, null, 2));
  } finally {
    lifetime.dispose();
  }
  lifetime.throwIfFailed();
}
