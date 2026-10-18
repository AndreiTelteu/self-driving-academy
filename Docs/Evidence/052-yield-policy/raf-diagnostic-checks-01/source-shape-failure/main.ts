import { browserLifetime } from '../yield-policy-v2/lifetime';
import { runBrowserYieldNative } from '../yield-policy-v6/runtime';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { RAF_DIAGNOSTIC as P, pushBounded, correlateWait } from './protocol';
import type { WaitObservation } from './protocol';
declare const __RAF_DIAGNOSTIC_BUILD__: {
  sourceHash: string;
  artifactHash?: string;
  inputs: string[];
  nativeHash: string;
  diagnosticOnly: true;
};
const button = document.getElementById('run') as HTMLButtonElement,
  status = document.getElementById('status')!,
  canvas = document.getElementById('canvas') as HTMLCanvasElement;
button.onclick = async () => {
  button.disabled = true;
  const lifetime = browserLifetime(),
    waits: WaitObservation[] = [],
    heartbeats: { dueMs: number; firedMs: number }[] = [],
    longTasks: { startMs: number; durationMs: number }[] = [];
  let latch: { readonly lost: boolean } | undefined;
  let ownedListeners = 0;
  let captureId: string | null = null;
  let acceptedBuild: typeof __RAF_DIAGNOSTIC_BUILD__ | null = null;
  const observedPhases = new Set<string>();
  let phase = 'STARTUP',
    priorRender: { startMs: number; finishMs: number } | null = null,
    outstanding: WaitObservation | null = null;
  let latestBeforeNative: unknown = null,
    firstBeforeNative: unknown = null;
  let nativeCleanup: unknown = null,
    observerSupported = false,
    observerError: string | null = null,
    longTaskOverflow = 0,
    heartbeatError: string | null = null;
  let primary: unknown = null,
    backend: Awaited<ReturnType<typeof createRenderingBackend>> | undefined;
  const stages: { phase: string; atMs: number }[] = [],
    enter = (name: string) => {
      phase = name;
      stages.push({ phase, atMs: performance.now() });
    };
  const check = () => {
    if (latch?.lost || document.hidden || !document.hasFocus())
      throw Error('diagnostic foreground lost');
    if (window.innerWidth !== 1920 || window.innerHeight !== 1080 || devicePixelRatio !== 1)
      throw Error('diagnostic dimensions changed');
    if (heartbeatError) throw Error(heartbeatError);
  };
  let heartbeatDue = performance.now() + P.heartbeatMs;
  const heartbeat = setInterval(() => {
    try {
      pushBounded(heartbeats, { dueMs: heartbeatDue, firedMs: performance.now() }, P.heartbeatCap);
      heartbeatDue += P.heartbeatMs;
    } catch (e) {
      heartbeatError = String(e);
    }
  }, P.heartbeatMs);
  let heartbeatCleared = false;
  lifetime.own('heartbeat', () => {
    clearInterval(heartbeat);
    heartbeatCleared = true;
  });
  lifetime.inspect(
    'heartbeat',
    () => ({ cleared: heartbeatCleared }),
    () => undefined,
  );
  let observer: PerformanceObserver | undefined;
  const wait = async (counter?: () => { nativeSerial: number; controllerTick: number }) => {
    check();
    const beforeReadStartMs = performance.now();
    const before = counter?.();
    const beforeReadEndMs = performance.now();
    const row: WaitObservation = {
      phase,
      first: !observedPhases.has(phase),
      requestMs: performance.now(),
      beforeReadStartMs,
      beforeReadEndMs,
      afterReadStartMs: null,
      afterReadEndMs: null,
      stampMs: null,
      callbackMs: null,
      nativeBefore: before?.nativeSerial ?? null,
      nativeAfter: null,
      controllerBefore: before?.controllerTick ?? null,
      controllerAfter: null,
      priorRenderStartMs: priorRender?.startMs ?? null,
      priorRenderFinishMs: priorRender?.finishMs ?? null,
      timeout: false,
    };
    pushBounded(waits, row, P.frameCap);
    observedPhases.add(phase);
    outstanding = row;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let handle = 0;
      const watchdog = setTimeout(() => {
        if (settled) return;
        settled = true;
        cancelAnimationFrame(handle);
        row.timeout = true;
        reject(Error('diagnostic RAF callback unavailable before bounded watchdog'));
      }, P.waitWatchdogMs);
      handle = requestAnimationFrame((stamp) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        row.stampMs = stamp;
        row.callbackMs = performance.now();
        try {
          row.afterReadStartMs = performance.now();
          const after = counter?.();
          row.afterReadEndMs = performance.now();
          row.nativeAfter = after?.nativeSerial ?? null;
          row.controllerAfter = after?.controllerTick ?? null;
          outstanding = null;
          check();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  };
  try {
    let focusLost = document.hidden || !document.hasFocus();
    const lose = () => {
        focusLost = true;
      },
      hidden = () => {
        if (document.hidden) focusLost = true;
      };
    window.addEventListener('blur', lose);
    ownedListeners++;
    lifetime.own('blur', () => {
      window.removeEventListener('blur', lose);
      ownedListeners--;
    });
    document.addEventListener('visibilitychange', hidden);
    ownedListeners++;
    lifetime.own('visibility', () => {
      document.removeEventListener('visibilitychange', hidden);
      ownedListeners--;
    });
    lifetime.inspect(
      'listeners',
      () => ({ owned: ownedListeners }),
      (v) => {
        if ((v as { owned: number }).owned !== 0)
          throw Error('diagnostic listener ownership nonzero');
      },
    );
    latch = {
      get lost() {
        return focusLost;
      },
    };
    if (
      typeof __RAF_DIAGNOSTIC_BUILD__ === 'undefined' ||
      !__RAF_DIAGNOSTIC_BUILD__.sourceHash ||
      __RAF_DIAGNOSTIC_BUILD__.diagnosticOnly !== true
    )
      throw Error('reviewed diagnostic build identity required');
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (longTasks.length < P.longTaskCap)
            longTasks.push({ startMs: e.startTime, durationMs: e.duration });
          else longTaskOverflow++;
        }
      });
      lifetime.own('longtask-observer', () => observer!.disconnect());
      try {
        observer.observe({ type: 'longtask', buffered: false });
        observerSupported = true;
      } catch (e) {
        observerError = String(e);
      }
    }
    const started = await fetch('/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceHash: __RAF_DIAGNOSTIC_BUILD__.sourceHash,
        nativeHash: __RAF_DIAGNOSTIC_BUILD__.nativeHash,
        preference: (document.getElementById('backend') as HTMLSelectElement).value,
      }),
    });
    if (!started.ok) throw Error('diagnostic START HTTP' + started.status);
    const startIdentity = await started.json();
    if (
      startIdentity.sourceHash !== __RAF_DIAGNOSTIC_BUILD__.sourceHash ||
      startIdentity.nativeHash !== __RAF_DIAGNOSTIC_BUILD__.nativeHash ||
      !startIdentity.artifactHash
    )
      throw Error('diagnostic actual start build identity');
    captureId = startIdentity.captureId;
    acceptedBuild = { ...__RAF_DIAGNOSTIC_BUILD__, artifactHash: startIdentity.artifactHash };
    enter('RAF_ONLY');
    let end = performance.now() + P.secondsPerPhase * 1000;
    while (performance.now() < end) await wait();
    enter('RENDERER_ACQUISITION');
    backend = await createRenderingBackend(
      canvas,
      (document.getElementById('backend') as HTMLSelectElement).value === 'WEBGL2'
        ? 'WEBGL2'
        : 'AUTO',
    );
    const acquiredEngine = backend.scene.getEngine();
    lifetime.own('backend', () => backend!.dispose());
    lifetime.inspect(
      'backend',
      () => ({
        sceneDisposed: backend!.scene.isDisposed,
        engineScenes: acquiredEngine.scenes.length,
        sceneMeshes: backend!.scene.meshes.length,
        sceneMaterials: backend!.scene.materials.length,
      }),
      (v) => {
        const r = v as {
          sceneDisposed: boolean;
          engineScenes: number;
          sceneMeshes: number;
          sceneMaterials: number;
        };
        if (!r.sceneDisposed || r.engineScenes || r.sceneMeshes || r.sceneMaterials)
          throw Error('diagnostic renderer ownership nonzero');
      },
    );
    const scene = backend.scene;
    const camera = new FreeCamera('diagnostic-camera', new Vector3(25, 40, -50), scene);
    lifetime.own('camera', () => camera.dispose());
    camera.setTarget(Vector3.Zero());
    const light = new HemisphericLight('diagnostic-light', new Vector3(0, 1, 0), scene);
    lifetime.own('light', () => light.dispose());
    await scene.whenReadyAsync();
    stages.push({ phase: 'EMPTY_SHADER_READY', atMs: performance.now() });
    const render = () => {
      const startMs = performance.now();
      scene.render();
      priorRender = { startMs, finishMs: performance.now() };
    };
    enter('EMPTY_RENDERER');
    end = performance.now() + P.secondsPerPhase * 1000;
    while (performance.now() < end) {
      await wait();
      render();
    }
    enter('NATIVE_RENDERER_SETUP');
    const material = new StandardMaterial('diagnostic-material', scene);
    lifetime.own('material', () => material.dispose());
    const ids = ['subject', 'priority', ...Array.from({ length: 68 }, (_, i) => 'parked-' + i)];
    const meshes = ids.map((id) => {
      const mesh = MeshBuilder.CreateBox(id, { width: 1.7, height: 1, depth: 4 }, scene);
      lifetime.own('mesh:' + id, () => mesh.dispose());
      mesh.material = material;
      return mesh;
    });
    await scene.whenReadyAsync();
    stages.push({ phase: 'NATIVE_SHADER_READY', atMs: performance.now() });
    render();
    stages.push({ phase: 'NATIVE_SETUP_RENDER_COMPLETE', atMs: performance.now() });
    await wait();
    enter('NATIVE70');
    let origin = 0,
      lastPresentationTick = 0;
    try {
      const captured = await runBrowserYieldNative({
        count: 70,
        classId: 'sedan',
        otherDistanceM: 20,
        otherSpeedMps: 3,
        otherThrottle: 0,
        thresholdS: 3,
        ticks: P.secondsPerPhase * 60,
        measured: true,
        measuredFromTick: 61,
        beforeTick(_world, tick, readCounter) {
          check();
          if (tick === 0 && !stages.some((v) => v.phase === 'PHYSICAL_SETUP_START'))
            stages.push({ phase: 'PHYSICAL_SETUP_START', atMs: performance.now() });
          if (tick === 1)
            stages.push({ phase: 'FIRST_NATIVE_BEFORE_STEP', atMs: performance.now() });
          const readStartMs = performance.now(),
            counter = readCounter(),
            readEndMs = performance.now();
          latestBeforeNative = {
            stage: tick === 0 ? 'SETUP' : 'DRIVING',
            tick,
            readStartMs,
            readEndMs,
            counter,
          };
          if (tick === 1) firstBeforeNative = latestBeforeNative;
        },
        async onTick(world, tick, _costs, counter) {
          if (!origin) {
            origin = performance.now();
            stages.push({ phase: 'NATIVE_ANCHOR', atMs: origin });
          }
          const target = origin + (tick * 1000) / 60;
          if (performance.now() - target > P.nativeDebtMs)
            throw Error('diagnostic native debt >250ms');
          while (
            performance.now() < target ||
            tick - lastPresentationTick >= P.nativeCatchupMax ||
            tick === P.secondsPerPhase * 60
          ) {
            await wait(counter);
            if (performance.now() - target > P.nativeDebtMs)
              throw Error('diagnostic native debt after RAF >250ms');
            for (let i = 0; i < ids.length; i++) {
              const body = world.project(ids[i]);
              meshes[i].position.copyFromFloats(body.position.x, body.position.y, body.position.z);
              meshes[i].rotationQuaternion = new Quaternion(
                body.rotation.x,
                body.rotation.y,
                body.rotation.z,
                body.rotation.w,
              );
            }
            render();
            lastPresentationTick = tick;
            if (tick === P.secondsPerPhase * 60) break;
          }
        },
      });
      nativeCleanup = captured.cleanup;
    } catch (e) {
      nativeCleanup = (e as { nativeDiagnostics?: unknown }).nativeDiagnostics ?? null;
      throw e;
    }
    enter('OBSERVATION_COMPLETE');
  } catch (e) {
    primary = e;
    lifetime.record('primary', e);
  } finally {
    if (observer) {
      try {
        for (const e of observer.takeRecords()) {
          if (longTasks.length < P.longTaskCap)
            longTasks.push({ startMs: e.startTime, durationMs: e.duration });
          else longTaskOverflow++;
        }
      } catch (e) {
        lifetime.record('longtask-readback', e);
      }
    }
    lifetime.dispose();
    const report = {
      version: P.version,
      captureId,
      status: primary || lifetime.failed ? 'INCOMPLETE_DIAGNOSTIC' : 'COMPLETE_DIAGNOSTIC',
      performanceAcceptance: false,
      hardwareFullAcceptance: false,
      build: acceptedBuild,
      timeOrigin: performance.timeOrigin,
      renderer: backend?.rendererKind ?? null,
      createdAt: new Date().toISOString(),
      stages,
      waits,
      heartbeats,
      longTasks,
      longTaskOverflow,
      observerSupported,
      observerError,
      outstanding,
      firstBeforeNative,
      latestBeforeNative,
      nativeCleanup,
      cleanup: lifetime.snapshot(),
      error: primary ? String(primary) : null,
      apiAvailability: {
        raf: true,
        performanceNow: true,
        longtask: observerSupported,
        gc: null,
        osScheduler: null,
        devtoolsTracing: null,
      },
      overhead:
        'Per-RAF records,50ms timer and observer included; diagnostic-only, no benchmark substitution',
      correlatedStalls: waits
        .filter((v) => v.callbackMs !== null && v.callbackMs - v.requestMs > 250)
        .map((v) => ({ wait: v, correlation: correlateWait(v, longTasks) })),
    };
    status.textContent = JSON.stringify({
      status: report.status,
      waits: waits.length,
      error: report.error,
      performanceAcceptance: false,
    });
    // Future reviewed server must wx-store this bounded immutable diagnostic before ACK.
    try {
      const response = await fetch('/diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Diagnostic-Capture-Id': captureId ?? '' },
        body: JSON.stringify(report),
      });
      if (!response.ok) throw Error('diagnostic export HTTP' + response.status);
    } catch (e) {
      status.textContent += '; EXPORT FAILED ' + String(e);
    }
    button.disabled = false;
  }
};
