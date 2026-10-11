import { CaptureLifetime } from './lifetime.mjs';
import { safeDiagnostic } from './safe-diagnostic.mjs';
import { ownBrowserJournal, ownDeviceLoss } from './browser-journal';
import { ports, checkedJson, appendBound, type Binding } from './browser-ports';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import type { RenderingBackend } from '../../../src/rendering/babylon';
import { projectPhysicalWheels } from '../../../src/rendering';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import type { CarProjection } from '../../../src/vehicles';
import { createRapierProbe as createBefore } from '../../../Docs/Evidence/026-wheel-dynamics/before/source/src/vehicles/rapier';
import {
  FIXED_DT_SECONDS,
  MAX_STEPS_PER_FRAME,
  OVERLOAD_DEBT_MS,
  createFixedTickLoop,
} from '../../../src/simulation/fixed-tick';
import { calibrateWheels } from './calibration';

declare const __WHEEL_BUILD__: {
  sourceHash: string;
  commit: string;
  inputs: string[];
  budgetVersion: string;
};
const status = document.getElementById('status')!;

const check = (value: boolean, message: string) => {
  if (!value) throw new Error(message);
};

async function arm(
  backend: RenderingBackend,
  current: boolean,
  warmupSeconds: number,
  measuredSeconds: number,
  failureContext: { diagnostic: unknown },
  armIndex: number,
  pair: number,
  binding: Binding,
  capture: CaptureLifetime,
  saveLate: (event: unknown, armIndex: number) => Promise<unknown>,
  diagnostic: boolean,
) {
  const life = new CaptureLifetime(
    ports(() => !capture.failed && !life.failed && backend.canvas.isConnected),
  );
  life.onLate((event) => saveLate(event, armIndex));
  const capacity = 30000;
  const channels = Object.fromEntries(
    ['frame', 'main', 'tick', 'projection', 'step'].map((name) => [
      name,
      new Float64Array(capacity),
    ]),
  );
  const traceNames = [
    'raf',
    'cpuStart',
    'cpuEnd',
    'steps',
    'tick',
    'controller',
    'solver',
    'query',
    'bridge',
    'projection',
    'render',
    'measuring',
  ];
  const trace = diagnostic ? new Float64Array(capacity * traceNames.length) : null;
  let traceCount = 0,
    frameTickMs = 0,
    controllerMs = 0,
    solverMs = 0,
    queryMs = 0,
    bridgeMs = 0;
  let frameCount = 0,
    tickCount = 0,
    tick = 0,
    measuring = false;
  let firstFrame = 0,
    previousFrame = 0,
    activeSeconds = 0;
  const heap = () =>
    (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ??
    null;
  const trackedJsHeapStartBytes = heap();
  const taskEntries: { startTime: number; duration: number }[] = [];
  const longTasks = {
    supported: PerformanceObserver.supportedEntryTypes.includes('longtask'),
    count: 0,
    maxMs: 0,
  };
  let result: unknown;
  let nativeCount = 0,
    renderCount = 0,
    maxSteps = 0,
    maxDebtMs = 0;
  const counters = () => ({
    tick,
    frameCount,
    tickCount,
    nativeCount,
    renderCount,
    armIndex,
    pair,
    current,
  });
  try {
    const world = await (current ? createRapierProbe() : createBefore());
    life.own('native-world', () => world.dispose());
    life.readback('native-resources', () => {
      const resources = { bodies: world.bodyResources(), collisions: world.collisionResources() };
      check(
        resources.bodies.entities === 0 &&
          resources.bodies.subscriptions === 0 &&
          resources.collisions.colliders === 0 &&
          resources.collisions.disposed,
        'Native cleanup failed',
      );
      return resources;
    });
    const inputs = new Map<string, { throttle: number; brake: number; steering: number }>();
    const visuals = Array.from({ length: 70 }, (_, i) => {
      const id = `car-${i}`;
      world.addCar(id, { x: (i % 10) * 2.2 - 10, y: 0.8, z: Math.floor(i / 10) * 4.15 });
      inputs.set(id, { throttle: i % 2 ? 0.65 : 1, brake: 0, steering: i % 2 ? 0.03 : -0.03 });
      const mesh = MeshBuilder.CreateBox(id, { width: 1.7, height: 0.6, depth: 4 }, backend.scene);
      life.own(id, () => mesh.dispose(false, true));
      mesh.rotationQuaternion = Quaternion.Identity();
      const wheels = Array.from({ length: 4 }, (_, index) => {
        const wheel = MeshBuilder.CreateCylinder(
          `${id}-wheel-${index}`,
          { diameter: 0.64, height: 0.18, tessellation: 12 },
          backend.scene,
        );
        life.own(`${id}-wheel-${index}`, () => wheel.dispose(false, true));
        wheel.parent = mesh;
        wheel.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 0, 1), Math.PI / 2);
        return wheel;
      });
      return { id, mesh, wheels };
    });
    for (const [position, half] of [
      [
        { x: 0, y: 1, z: 32 },
        { x: 20, y: 1, z: 0.5 },
      ],
      [
        { x: -12, y: 1, z: 16 },
        { x: 0.5, y: 1, z: 20 },
      ],
      [
        { x: 12, y: 1, z: 16 },
        { x: 0.5, y: 1, z: 20 },
      ],
    ])
      world.addBox(position, half);
    for (let i = 0; i < 64; i++)
      world.addBox(
        { x: (i % 8) * 0.65 - 2.5, y: 0.35 + Math.floor(i / 8) * 0.62, z: 30 },
        { x: 0.3, y: 0.3, z: 0.3 },
        true,
      );
    const recordTasks = (entries: PerformanceEntry[]) => {
      for (const entry of entries) {
        if (taskEntries.length >= 4096) {
          life.fail('longtask-overflow', new Error('Long task buffer overflow'));
          return;
        }
        taskEntries.push({ startTime: entry.startTime, duration: entry.duration });
      }
    };
    const observer = longTasks.supported
      ? new PerformanceObserver((entries) => recordTasks(entries.getEntries()))
      : undefined;
    if (observer) {
      life.own('longtasks', () => {
        recordTasks(observer.takeRecords());
        observer.disconnect();
      });
      observer.observe({ type: 'longtask', buffered: false });
    }
    // Loading/first-use precedes the authoritative clock, identically in both arms.
    // Retain its cost separately; never discard a gap after the clock starts.
    const startupAt = performance.now();
    const startupFrameMs: number[] = [];
    let startupRaf: number | undefined, startupTimer: number | undefined;
    life.own('startup-wait', () => {
      if (startupRaf !== undefined) cancelAnimationFrame(startupRaf);
      if (startupTimer !== undefined) clearTimeout(startupTimer);
    });
    const startupFrame = () =>
      new Promise<void>((resolve, reject) => {
        startupTimer = window.setTimeout(() => {
          if (startupRaf !== undefined) cancelAnimationFrame(startupRaf);
          startupRaf = startupTimer = undefined;
          reject(new Error('Loading RAF exceeded10seconds'));
        }, 10000);
        startupRaf = requestAnimationFrame(() => {
          clearTimeout(startupTimer);
          startupRaf = startupTimer = undefined;
          if (life.failed || capture.failed) reject(new Error('Loading capture inactive'));
          else resolve();
        });
      });
    await backend.scene.whenReadyAsync();
    for (let index = 0; index < 30; index++) {
      await startupFrame();
      check(document.hasFocus() && !document.hidden, 'Foreground lost during first-use');
      const renderAt = performance.now();
      backend.render();
      startupFrameMs.push(performance.now() - renderAt);
    }
    const startup = {
      elapsedMs: performance.now() - startupAt,
      renderCpuMs: startupFrameMs,
      physicsSteps: 0,
      scope: 'Loading/first-use before fixed clock, not a controlled cold-navigation gate',
    };
    const loop = createFixedTickLoop({
      captureSnapshot: () => ({ tick }),
      interpolate: (_previous, latest) => latest,
      step(frame) {
        tick = frame.tick;
        const start = performance.now();
        check(
          !life.failed && !capture.failed && document.hasFocus() && !document.hidden,
          'Inactive capture before native step',
        );
        life.boundary('native-entry', counters());
        const costs = world.step(inputs, true);
        nativeCount++;
        life.boundary('native-exit', counters());
        if (diagnostic) {
          frameTickMs += performance.now() - start;
          controllerMs += costs.controllerMs;
          solverMs += costs.stepMs;
          queryMs += costs.queryMs;
          bridgeMs += costs.bridgeMs;
        }
        if (measuring) {
          check(tickCount < capacity, 'Tick buffer overflow');
          channels.tick[tickCount] = performance.now() - start;
          channels.step[tickCount++] = costs.stepMs;
        }
      },
    });
    const neutral = Quaternion.RotationAxis(new Vector3(0, 0, 1), Math.PI / 2);
    const spin = Quaternion.Identity(),
      steer = Quaternion.Identity(),
      combined = Quaternion.Identity();

    life.own('fixed-loop', () => loop.dispose());
    firstFrame = previousFrame = await life.nextFrame(counters);
    loop.frame(firstFrame);

    while (activeSeconds < warmupSeconds + measuredSeconds) {
      const now = await life.nextFrame(counters);

      check(document.hasFocus() && !document.hidden, 'Foreground lost');
      activeSeconds = (now - firstFrame) / 1000;
      measuring = activeSeconds >= warmupSeconds;
      const start = performance.now();
      frameTickMs = controllerMs = solverMs = queryMs = bridgeMs = 0;
      const frame = loop.frame(now);
      maxSteps = Math.max(maxSteps, frame.steps);
      maxDebtMs = Math.max(maxDebtMs, frame.state.debtSeconds * 1000);
      check(loop.getState().overloadCount === 0, 'Fixed-tick overload');
      const projectionStart = performance.now();
      for (const visual of visuals) {
        const state = world.project(visual.id),
          p = state.position,
          q = state.rotation;
        visual.mesh.position.set(p.x, p.y, p.z);
        visual.mesh.rotationQuaternion!.set(q.x, q.y, q.z, q.w);
        if (current) {
          const pose = projectPhysicalWheels(state as CarProjection, '1');
          pose.wheels.forEach((wheel, index) => {
            const point = wheel.transform.positionM;
            visual.wheels[index].position.set(point.x, point.y, point.z);
            Quaternion.RotationYawPitchRollToRef(wheel.steeringRad, 0, 0, steer);
            Quaternion.RotationYawPitchRollToRef(0, wheel.spinRad, 0, spin);
            steer.multiplyToRef(spin, combined);
            combined.multiplyToRef(neutral, visual.wheels[index].rotationQuaternion!);
          });
        } else {
          // BEFORE has four equally rendered neutral wheel meshes, no dynamic wheel projection.
          visual.wheels.forEach((wheel, index) =>
            wheel.position.set(
              index % 2 ? 0.9 : -0.9,
              -0.15 - state.suspension[index],
              index < 2 ? 1.35 : -1.35,
            ),
          );
        }
      }
      const projectionMs = performance.now() - projectionStart;
      life.boundary('render-entry', counters());
      const renderAt = diagnostic ? performance.now() : 0;
      backend.render();
      const renderMs = diagnostic ? performance.now() - renderAt : 0;
      renderCount++;
      life.boundary('render-exit', counters());
      if (trace) {
        check(traceCount < capacity, 'Diagnostic frame buffer overflow');
        trace.set(
          [
            now,
            start,
            performance.now(),
            frame.steps,
            frameTickMs,
            controllerMs,
            solverMs,
            queryMs,
            bridgeMs,
            projectionMs,
            renderMs,
            Number(measuring),
          ],
          traceCount++ * traceNames.length,
        );
      }
      if (measuring) {
        check(frameCount < capacity, 'Frame buffer overflow');
        channels.frame[frameCount] = now - previousFrame;
        channels.main[frameCount] = performance.now() - start;
        channels.projection[frameCount++] = projectionMs;
      }
      previousFrame = now;
      status.textContent = `${current ? 'CURRENT native wheels' : 'ARCHIVED BEFORE'} ${activeSeconds.toFixed(1)}/${warmupSeconds + measuredSeconds}s · tick${tick} · cars70/debris64 · ${measuring ? 'measuring' : 'warmup'}`;
    }
    recordTasks(observer?.takeRecords() ?? []);
    const stats = Object.fromEntries(
      Object.entries(channels).map(([name, buffer]) => {
        const count = ['tick', 'step'].includes(name) ? tickCount : frameCount;
        const data = buffer.slice(0, count).sort();
        return [
          name,
          {
            count,
            p50: data[Math.ceil(count * 0.5) - 1],
            p95: data[Math.ceil(count * 0.95) - 1],
            p99: data[Math.ceil(count * 0.99) - 1],
            max: data[count - 1],
          },
        ];
      }),
    );
    result = {
      startup,
      current,
      warmupSeconds,
      measuredSeconds,
      activeSeconds,
      frames: frameCount,
      ticks: tickCount,
      stats,
      overloadCount: loop.getState().overloadCount,
      maxSteps,
      maxDebtMs,
      measurementStartMs: firstFrame + warmupSeconds * 1000,
      measurementEndMs: previousFrame,
      simulationToActiveWallTime: tickCount / 60 / (activeSeconds - warmupSeconds),
      physics: world.counts(),
      sampleBytes: capacity * 8 * 5,
      memory: {
        trackedJsHeapStartBytes,
        trackedJsHeapEndBytes: heap(),
        trackedJsHeapScope:
          'Optional Chrome usedJSHeapSize; overlapping JS/backing buffers, not exact total RAM',
        exactPageHeapBytes: null,
        exactWasmBytes: null,
        wheelMeshes: 280,
        chassisMeshes: 70,
        worlds: 1,
        retainedWheelHistory: 0,
      },
      longTasks,
      gpuP95Ms: null,
      gates: {
        fixedDtSeconds: FIXED_DT_SECONDS,
        maxCatchupSteps: MAX_STEPS_PER_FRAME,
        overloadDebtMs: OVERLOAD_DEBT_MS,
        simulationMinimum: 0.98,
      },
    };
  } catch (error) {
    life.fail('arm', error);
  } finally {
    const readbacks = await life.teardown();
    const measurementStart = firstFrame + warmupSeconds * 1000;
    for (const entry of taskEntries) {
      if (entry.startTime + entry.duration > measurementStart && entry.startTime <= previousFrame) {
        longTasks.count++;
        longTasks.maxMs = Math.max(longTasks.maxMs, entry.duration);
      }
    }
    const raw = {
      diagnosticTrace: trace
        ? {
            columns: traceNames,
            frames: traceCount,
            values: Array.from(trace.slice(0, traceCount * traceNames.length)),
            allocatedBytes: trace.byteLength,
            scope: 'Instrumented DEV only; wall CPU stages may contain GC or scheduling pauses',
          }
        : null,
      longTaskEntries: taskEntries,
      renderer: backend.rendererKind,
      armIndex,
      pair,
      current,
      frames: frameCount,
      ticks: tickCount,
      channels: Object.fromEntries(
        Object.entries(channels).map(([name, values]) => [
          name,
          Array.from(values.slice(0, ['tick', 'step'].includes(name) ? tickCount : frameCount)),
        ]),
      ),
      lifetime: life.snapshot(),
      readbacks,
    };
    try {
      await appendBound(binding, `raw-${armIndex}`, raw);
    } catch (error) {
      life.cause('raw-export-or-readback', error);
    }
    failureContext.diagnostic = { counters: counters(), lifetime: life.snapshot(), readbacks };
  }
  if (life.failed || capture.failed)
    throw new Error('Arm incomplete; retained causes in failure diagnostics');
  return result as Record<string, unknown>;
}

document.getElementById('run')!.addEventListener('click', async () => {
  const button = document.getElementById('run') as HTMLButtonElement;
  button.disabled = true;
  const life = new CaptureLifetime(ports(() => !life.failed));
  let backend: RenderingBackend | undefined;
  let binding: Binding | undefined;
  const runs: unknown[] = [];
  const failureContext = { diagnostic: null as unknown };
  let report: unknown;
  let mode = 'full';
  let readbacks: Record<string, unknown> = {};
  let lateSequence = 0;
  const saveLate = async (event: unknown, armIndex: number) => {
    life.fail('late-callback', new Error('Retained arm delivered callback after settlement'));
    const sequence = lateSequence++;
    try {
      check(sequence < 64 && !!binding, 'Supplemental capture capacity/identity unavailable');
      return await appendBound(binding!, `late-${sequence}`, {
        renderer: backend?.rendererKind ?? null,
        armIndex,
        event,
        state: 'FAILED_UNKNOWN',
      });
    } catch (error) {
      life.cause('late-export-or-readback', error);
      status.textContent = 'FAILED_UNKNOWN: supplemental persistence failed';
      if (binding && sequence < 64) {
        try {
          await appendBound(binding, `late-error-${sequence}`, {
            renderer: backend?.rendererKind ?? null,
            armIndex,
            event,
            state: 'FAILED_UNKNOWN',
            error: safeDiagnostic(error).text,
          });
        } catch (secondary) {
          life.cause('late-error-export-or-readback', secondary);
        }
      }
      throw error;
    }
  };
  try {
    mode = (document.getElementById('duration') as HTMLSelectElement).value;
    const requestedBackend = (document.getElementById('backend') as HTMLSelectElement).value as
      'AUTO' | 'WEBGL2';
    const started = await checkedJson('/capture/start', {
      launchKey: crypto.randomUUID(),
      requestedBackend,
      mode,
      clientSourceHash: __WHEEL_BUILD__.sourceHash,
      launchedAt: new Date().toISOString(),
      browser: navigator.userAgent,
    });
    binding = started.binding as Binding;
    const startReadback = await checkedJson(`/capture/${binding.captureId}/start`);
    check(
      started.acknowledgment.sha256 === startReadback.sha256 &&
        binding.sourceHash === __WHEEL_BUILD__.sourceHash,
      'Start acknowledgment/source mismatch',
    );
    const old = document.getElementById('canvas') as HTMLCanvasElement;
    const canvas = old.cloneNode(false) as HTMLCanvasElement;
    old.replaceWith(canvas);
    // Backend may replace this canvas on fallback. Own current DOM by its id, never replay old canvas.
    let ownedSurface = canvas;
    life.own('surface', () => {
      (document.getElementById('canvas') ?? ownedSurface).remove();
    });
    life.readback('surface', () => {
      check(!document.getElementById('canvas'), 'Owned surface remains');
      return { connected: false };
    });
    backend = await createRenderingBackend(canvas, requestedBackend);
    const acquired = backend;
    life.own('backend', () => acquired.dispose()); // Before first scene/engine access.
    life.readback('backend', () => {
      check(acquired.scene.isDisposed, 'Scene remains live after backend dispose');
      return { sceneDisposed: acquired.scene.isDisposed };
    });
    const ownedEngine = acquired.scene.getEngine();
    life.readback('engine', () => {
      check(ownedEngine.isDisposed, 'Engine remains live after backend dispose');
      return { engineDisposed: ownedEngine.isDisposed };
    });
    const actualCanvas = acquired.canvas;
    ownedSurface = actualCanvas;
    ownBrowserJournal(life, actualCanvas);
    if (acquired.rendererKind === 'WEBGPU') {
      // Babylon9.29 uses _device.lost in webgpuEngine.pure.js; production disables automatic recovery.
      const lost = (
        acquired.scene.getEngine() as unknown as {
          _device?: { lost?: Promise<{ reason: string; message: string }> };
        }
      )._device?.lost;
      check(!!lost, 'WebGPU loss promise unavailable: coverage incomplete');
      ownDeviceLoss(life, lost!);
    }
    check(
      actualCanvas.isConnected && document.getElementById('canvas') === actualCanvas,
      'Disconnected/current surface mismatch',
    );
    await appendBound(binding, 'backend', {
      renderer: acquired.rendererKind,
      acquiredAt: new Date().toISOString(),
    });
    acquired.scene.useRightHandedSystem = false;
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), acquired.scene);
    life.own('light', () => light.dispose());
    const camera = new FreeCamera('camera', new Vector3(45, 55, -40), acquired.scene);
    life.own('camera', () => camera.dispose());
    camera.setTarget(new Vector3(0, 0, 17));
    acquired.scene.activeCamera = camera;
    const ground = MeshBuilder.CreateGround('road', { width: 120, height: 120 }, acquired.scene);
    life.own('road', () => ground.dispose(false, false));
    const material = new StandardMaterial('road', acquired.scene);
    life.own('road-material', () => material.dispose());
    material.diffuseColor = new Color3(0.2, 0.25, 0.3);
    ground.material = material;
    acquired.scene.getEngine().setHardwareScalingLevel(1);
    acquired.resize();
    acquired.scene.getEngine().setSize(1920, 1080);
    check(
      Number.isFinite(devicePixelRatio) &&
        devicePixelRatio > 0 &&
        devicePixelRatio <= 4 &&
        actualCanvas.clientWidth === 1920 &&
        actualCanvas.clientHeight === 1080,
      'CSS resolution/DPR mismatch',
    );
    // Finite diagnostic: actual unmodified ten-arm workload, first gap/failure terminates, 30min hard cap.
    // No worker heartbeat: unpriced probes disabled for acceptance.
    if (mode === 'diagnostic') {
      const deadline = window.setTimeout(
        () => life.fail('diagnostic-cap', new Error('30min diagnostic cap reached')),
        1800000,
      );
      life.own('diagnostic-deadline', () => window.clearTimeout(deadline));
    }
    for (let pair = 0; pair < (mode === 'diagnostic' ? 3 : 5); pair++)
      for (const current of pair % 2 ? [true, false] : [false, true]) {
        check(!life.failed, 'Capture inactive before arm');
        runs.push({
          pair,
          ...(await arm(
            acquired,
            current,
            mode === 'smoke' ? 1 : mode === 'diagnostic' ? 15 : 30,
            mode === 'smoke' ? 3 : mode === 'diagnostic' ? 30 : 120,
            failureContext,
            runs.length,
            pair,
            binding,
            life,
            saveLate,
            mode !== 'full',
          )),
        });
      }
    const calibration = [];
    if (mode === 'full') {
      for (const classId of ['sedan', 'compact'] as const)
        for (const surface of ['dry-asphalt', 'reduced-adhesion'] as const)
          for (const scenario of ['braking', 'turning'] as const) {
            check(
              !life.failed && document.hasFocus() && !document.hidden,
              'Capture inactive before calibration',
            );
            calibration.push(await calibrateWheels(classId, surface, 20, scenario));
          }
    }
    const engine = acquired.scene.getEngine();
    report = {
      fixtureVersion:
        mode === 'diagnostic'
          ? '026-wheel-dynamics-stage-trace-DEV'
          : '026-wheel-dynamics-v2-source-ownership-1',
      browser: navigator.userAgent,
      renderer: acquired.rendererKind,
      mode,
      runs,
      calibration,
      identity: __WHEEL_BUILD__,
      actualGpuInfo:
        'getInfo' in engine ? (engine as unknown as { getInfo(): unknown }).getInfo() : null,
      cssResolution: [actualCanvas.clientWidth, actualCanvas.clientHeight],
      internalResolution: [engine.getRenderWidth(), engine.getRenderHeight()],
      dpr: devicePixelRatio,
      physicalForeground: 'UNCONFIRMED: JS focus does not identify HWND/PID',
      scope:
        'Early026 paired BEFORE/current on Lenovo Yoga; internal resolution fixed1920x1080, actual OS DPR recorded; no final-game acceptance',
    };
  } catch (error) {
    life.fail('capture', error);
  } finally {
    readbacks = await life.teardown();
    const terminal = {
      terminalAt: new Date().toISOString(),
      renderer: backend?.rendererKind ?? null,
      acceptance: 'UNVERIFIED',
      state: life.failed
        ? 'INCOMPLETE'
        : mode === 'diagnostic'
          ? 'DIAGNOSTIC_COMPLETE'
          : mode === 'smoke'
            ? 'SMOKE_COMPLETE'
            : 'CAPTURE_COMPLETE',
      report,
      completedArms: runs,
      failedArm: failureContext.diagnostic,
      lifetime: life.snapshot(),
      readbacks,
    };
    try {
      if (!binding) throw new Error('No server-issued identity: start failed; local failure only');
      await appendBound(binding, 'terminal', terminal);
      status.textContent = `${terminal.state} ${binding.captureId}. Acknowledged; acceptance UNVERIFIED.`;
    } catch (error) {
      life.cause('terminal-export-or-readback', error);
      if (binding) {
        try {
          await appendBound(binding, 'terminal-error', {
            renderer: backend?.rendererKind ?? null,
            state: 'FAILED_UNKNOWN',
            primaryTerminal: terminal,
            exportCauses: life.snapshot().causes,
            exportCauseOverflow: life.snapshot().causeOverflow,
          });
        } catch (secondary) {
          life.cause('terminal-error-export-or-readback', secondary);
        }
      }
      status.textContent = `INCOMPLETE: ${JSON.stringify({ binding, terminal, exportCauses: life.snapshot() })}`;
    }
    button.disabled = false;
    // Recreate empty connected surface only after complete teardown; next launch acquires new backend.
    if (!document.getElementById('canvas')) {
      const next = document.createElement('canvas');
      next.id = 'canvas';
      next.width = 1920;
      next.height = 1080;
      document.body.appendChild(next);
    }
  }
});
