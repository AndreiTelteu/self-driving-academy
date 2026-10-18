import { browserLifetime } from '../yield-policy-v2/lifetime';
import { installPresentationLatch } from '../yield-policy-v2/presentation-latch';
import { YIELD_BROWSER_V4 } from './protocol';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import type { RenderingBackend } from '../../../src/rendering/babylon';
import { referenceYield } from '../../autonomy/yield-policy-reference';
import { productionYieldReference } from '../../autonomy/yield-policy-production-adapter';
import { runBrowserYieldNative } from './runtime';
import type { YieldNativeOptions, NativePartialDiagnostic } from './runtime';
import type { ClockPoint, RafPoint } from './clock-proof';
declare const __YIELD_BUILD__: { sourceHash: string; commit: string; inputs: string[] };
const status = document.getElementById('status')!,
  button = document.getElementById('run') as HTMLButtonElement;
const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
function check(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
const percentile = (values: Float64Array, count: number) => {
  check(count > 0, 'Empty timing channel');
  const sorted = values.slice(0, count).sort();
  return {
    count,
    p50: sorted[Math.ceil(count * 0.5) - 1],
    p95: sorted[Math.ceil(count * 0.95) - 1],
    p99: sorted[Math.ceil(count * 0.99) - 1],
    max: sorted[count - 1],
  };
};
let owned: RenderingBackend | undefined;
let presentationLatch: ReturnType<typeof installPresentationLatch> | undefined;
function assertPresentation(backend: RenderingBackend) {
  const engine = backend.scene.getEngine();
  check(
    !presentationLatch?.lost && document.hasFocus() && !document.hidden,
    'Foreground/context lost',
  );
  check(
    devicePixelRatio === 1 &&
      backend.canvas.clientWidth === 1920 &&
      backend.canvas.clientHeight === 1080 &&
      engine.getRenderWidth() === 1920 &&
      engine.getRenderHeight() === 1080,
    'Presentation dimensions changed',
  );
}
async function arm(
  backend: RenderingBackend,
  current: boolean,
  warmupSeconds: number,
  measuredSeconds: number,
  diagnosticOwner: {captureId: string; ordinal: number},
  calibration?: Pick<YieldNativeOptions, 'classId' | 'otherDistanceM' | 'thresholdS'>,
) {
  const count = calibration ? 2 : 70,
    meshNames = [
      'subject',
      'priority',
      ...Array.from({ length: count - 2 }, (_, i) => `parked-${i}`),
    ],
    scene = backend.scene;
  const baselineMeshes = scene.meshes.length,
    baselineMaterials = scene.materials.length;
  const lifetime = browserLifetime();
  let completedNativeCleanup: unknown = null;
  let partialSnapshot: () => Record<string, unknown> = () => ({status: 'INCOMPLETE', channelsAcquired: false});
  const meshes: ReturnType<typeof MeshBuilder.CreateBox>[] = [];
  let observerDisconnected = false,
    observerAcquired = false;
  lifetime.inspect(
    'renderer',
    () => {
      const value = {
        meshesBefore: baselineMeshes,
        materialsBefore: baselineMaterials,
        meshesAfter: scene.meshes.length,
        materialsAfter: scene.materials.length,
        observerDisconnected: !observerAcquired || observerDisconnected,
      };
      return value;
    },
    (raw) => {
      const value = raw as {
        meshesBefore: number;
        meshesAfter: number;
        materialsBefore: number;
        materialsAfter: number;
        observerDisconnected: boolean;
      };
      check(
        value.meshesBefore === value.meshesAfter &&
          value.materialsBefore === value.materialsAfter &&
          value.observerDisconnected,
        '052 arm renderer cleanup',
      );
    },
  );
  try {
    for (const [i, name] of meshNames.entries()) {
      const mesh = MeshBuilder.CreateBox(name, { width: 1.7, height: 0.6, depth: 4 }, scene);
      lifetime.own('mesh:' + name, () => mesh.dispose(false, false));
      const material = new StandardMaterial(`${name}-material`, scene);
      lifetime.own('material:' + name, () => material.dispose());
      material.diffuseColor =
        i === 0
          ? new Color3(0.2, 0.65, 1)
          : i === 1
            ? new Color3(1, 0.45, 0.2)
            : new Color3(0.4, 0.55, 0.5);
      mesh.material = material;
      meshes.push(mesh);
    }
    const frame = new Float64Array(60000),
      main = new Float64Array(60000),
      rafTime = new Float64Array(60000),
      rafReadTime = new Float64Array(60000),
      nativeSerial = new Float64Array(60000),
      controllerTick = new Float64Array(60000),
      tickCosts = new Float64Array(12000),
      stepCosts = new Float64Array(12000),
      policyCosts = new Float64Array(12000);
    let phaseEntry: ClockPoint | undefined, phaseCompletion: ClockPoint | undefined, previousRaf: RafPoint | undefined, lastRaf: RafPoint | undefined;
    let frameCount = 0,
      tickCount = 0,
      firstWall = 0,
      lastFrame = 0,
      lastWall = 0,
      recoverySteps = 0,
      nativeTick = 0,
      pendingPhysicsMs = 0,
      measuredFirst = 0,
      measuredPrevious = 0,
      measuredLast = 0,
      longTaskCount = 0,
      maxLongTaskMs = 0;
    partialSnapshot = () => ({
      status: 'INCOMPLETE', current, warmupSeconds, measuredSeconds,
      phaseEntry: phaseEntry ?? null, phaseCompletion: phaseCompletion ?? null,
      previousRaf: previousRaf ?? null, lastRaf: lastRaf ?? null,
      measuredTicks: tickCount, recordedFrames: frameCount, nominalAttemptedTargetTick: nativeTick,
      raw: {frame: Array.from(frame.subarray(0, frameCount)), main: Array.from(main.subarray(0, frameCount)),
        tick: Array.from(tickCosts.subarray(0, tickCount)), step: Array.from(stepCosts.subarray(0, tickCount)), policy: Array.from(policyCosts.subarray(0, tickCount)),
        rafTime: Array.from(rafTime.subarray(0, frameCount)), rafReadTime: Array.from(rafReadTime.subarray(0, frameCount)),
        nativeSerial: Array.from(nativeSerial.subarray(0, frameCount)), controllerTick: Array.from(controllerTick.subarray(0, frameCount))},
      numericChannelBytes: frame.byteLength + main.byteLength + tickCosts.byteLength + stepCosts.byteLength + policyCosts.byteLength +
        rafTime.byteLength + rafReadTime.byteLength + nativeSerial.byteLength + controllerTick.byteLength,
    });
    const longTasksSupported =
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes.includes('longtask');
    const observer = longTasksSupported
      ? new PerformanceObserver((entries) => {
          for (const entry of entries.getEntries())
            if (firstWall > 0 && entry.startTime >= firstWall + warmupSeconds * 1000) {
              longTaskCount++;
              maxLongTaskMs = Math.max(maxLongTaskMs, entry.duration);
            }
        })
      : null;
    observerAcquired = !!observer;
    if (observer)
      lifetime.own('longtasks', () => {
        observer.disconnect();
        observerDisconnected = true;
      });
    observer?.observe({ type: 'longtask' });
    await scene.whenReadyAsync();
    scene.render();
    await raf();
    const capture = await runBrowserYieldNative({
      count,
      classId: calibration?.classId ?? 'sedan',
      otherDistanceM: calibration?.otherDistanceM ?? 20,
      otherSpeedMps: 3,
      otherThrottle: calibration ? 1 : 0,
      thresholdS: calibration?.thresholdS ?? 3,
      ticks: Math.round((warmupSeconds + measuredSeconds) * 60),
      measured: true,
      measuredFromTick: Math.round(warmupSeconds * 60) + 1,
      phaseBoundary(kind, point) { if (kind === 'ENTRY') phaseEntry = point; else phaseCompletion = point; },
      evaluator: current ? productionYieldReference : referenceYield,
      beforeTick() {
        assertPresentation(backend);
        if (firstWall)
          check(
            performance.now() - (firstWall + ((nativeTick + 1) * 1000) / 60) <= 250,
            'Simulation overload debt before native step',
          );
      },
      async onTick(world, tick, costs, actualCounter) {
        nativeTick = tick;
        check(document.hasFocus() && !document.hidden, 'Foreground lost');
        if (!firstWall) firstWall = performance.now();
        const target = firstWall + tick * (1000 / 60);
        const measuring = tick > warmupSeconds * 60;
        pendingPhysicsMs += costs.tickMs;
        if (measuring) {
          check(tickCount < tickCosts.length, 'Tick channel overflow');
          tickCosts[tickCount] = costs.tickMs;
          stepCosts[tickCount] = costs.stepMs;
          policyCosts[tickCount] = costs.policyMs;
          tickCount++;
        }
        recoverySteps++;
        check(performance.now() - target <= 250, 'Simulation overload debt');
        let finalPresentationPending = tick === Math.round((warmupSeconds + measuredSeconds) * 60);
        while (performance.now() < target || recoverySteps >= 4 || lastFrame === 0 || finalPresentationPending) {
          const stamp = await raf(),
            start = performance.now();
          const actual = { ...actualCounter(), timeMs: stamp, observedAtMs: performance.now() };
          finalPresentationPending = false;
          recoverySteps = 0;
          assertPresentation(backend);
          check(
            performance.now() - target <= 250,
            'Simulation overload debt after RAF before render',
          );
          status.textContent = `${current ? 'CURRENT052' : 'REFERENCE'} tick${tick} · ${calibration ? `gap${calibration.thresholdS}s/${calibration.classId}` : `${warmupSeconds}/${measuredSeconds}s`}`;
          for (let index = 0; index < count; index++) {
            const body = world.project(meshNames[index]);
            meshes[index].position.copyFromFloats(
              body.position.x,
              body.position.y,
              body.position.z,
            );
            meshes[index].rotationQuaternion = new Quaternion(
              body.rotation.x,
              body.rotation.y,
              body.rotation.z,
              body.rotation.w,
            );
          }
          scene.render();
          const mainMs = performance.now() - start + pendingPhysicsMs;
          pendingPhysicsMs = 0;
          if (stamp >= firstWall + warmupSeconds * 1000 && lastFrame) {
            check(frameCount < frame.length, 'Frame channel overflow');
            frame[frameCount] = stamp - lastFrame;
            main[frameCount] = mainMs;
            rafTime[frameCount] = stamp;
            rafReadTime[frameCount] = actual.observedAtMs;
            nativeSerial[frameCount] = actual.nativeSerial;
            controllerTick[frameCount] = actual.controllerTick;
            frameCount++;
            if (!measuredFirst) {
              measuredFirst = stamp;
              measuredPrevious = lastFrame;
              check(!!lastRaf, '052 missing actual previous RAF counter');
              previousRaf = lastRaf;
            }
            measuredLast = stamp;
          }
          lastRaf = actual;
          lastFrame = stamp;
          lastWall = stamp;
        }
      },
    });
    completedNativeCleanup = capture.cleanup;
    check(
      capture.cleanup.bodies.entities === 0 &&
        capture.cleanup.controller.vehicles === 0 &&
        capture.cleanup.priority.vehicles === 0 &&
        capture.cleanup.collision.colliders === 0,
      'Native cleanup',
    );
    check(!!phaseEntry && !!phaseCompletion && !!previousRaf && !!lastRaf, '052 actual dual clock incomplete');
    const entry = phaseEntry!, completion = phaseCompletion!, previous = previousRaf!, finalRaf = lastRaf!;
    const nativePhaseRatio = (completion.nativeSerial - entry.nativeSerial) / 60 / ((completion.timeMs - entry.timeMs) / 1000);
    const matchedRafRatio = (finalRaf.nativeSerial - previous.nativeSerial) / 60 / ((measuredLast - measuredPrevious) / 1000);
    const result = {
      current,
      dualClock: { phaseEntry: entry, phaseCompletion: completion, previousRaf: previous, nativePhaseRatio, matchedRafRatio },
      warmupSeconds,
      measuredSeconds,
      thresholdS: calibration?.thresholdS ?? 3,
      classId: calibration?.classId ?? 'sedan',
      otherDistanceM: calibration?.otherDistanceM ?? 20,
      acceptedTick: capture.acceptedTick,
      firstEntryTick: capture.firstEntryTick,
      clearTick: capture.clearTick,
      collisionTick: capture.collisionTick,
      maxImpulseNs: capture.maxImpulseNs,
      evidence: capture.evidence,
      trace: calibration ? capture.trace : [],
      commands: calibration ? capture.commands : [],
      commandDigest: capture.commandDigest,
      finalCrossingBodies: capture.finalBodies.slice(0, 2),
      finalBodies: capture.finalBodies,
      initialMechanics: capture.initialMechanics,
      finalMechanics: capture.finalMechanics,
      packetDigest: capture.packetDigest,
      nativeDigest: capture.nativeDigest,
      physicalDigest: capture.physicalDigest,
      checkpoints: capture.checkpoints,
      nativeReadbacks: calibration ? capture.nativeReadbacks : [],
      cleanup: capture.cleanup,
      rendererCleanup: {
        meshesBefore: baselineMeshes,
        materialsBefore: baselineMaterials,
        meshesAfter: -1,
        materialsAfter: -1,
        observerDisconnected: !observer,
      },
      overloadCount: 0,
      raw: {
        frame: Array.from(frame.subarray(0, frameCount)),
        main: Array.from(main.subarray(0, frameCount)),
        tick: Array.from(tickCosts.subarray(0, tickCount)),
        step: Array.from(stepCosts.subarray(0, tickCount)),
        policy: Array.from(policyCosts.subarray(0, tickCount)),
        rafTime: Array.from(rafTime.subarray(0, frameCount)),
        rafReadTime: Array.from(rafReadTime.subarray(0, frameCount)),
        nativeSerial: Array.from(nativeSerial.subarray(0, frameCount)),
        controllerTick: Array.from(controllerTick.subarray(0, frameCount)),
      },
      stats: {
        frame: percentile(frame, frameCount),
        main: percentile(main, frameCount),
        tick: percentile(tickCosts, tickCount),
        step: percentile(stepCosts, tickCount),
        policy: percentile(policyCosts, tickCount),
      },
      measurement: {
        originMs: firstWall,
        windowStartMs: firstWall + warmupSeconds * 1000,
        windowEndMs: firstWall + (warmupSeconds + measuredSeconds) * 1000,
        previousFrameMs: measuredPrevious,
        firstFrameMs: measuredFirst,
        lastFrameMs: measuredLast,
        lastWallMs: lastWall,
        samples: frameCount,
        nativeTicks: tickCount,
      },
      activeWallSeconds: (lastWall - firstWall) / 1000,
      simulationToActiveWallTime:
        matchedRafRatio,
      longTasks: { supported: longTasksSupported, count: longTaskCount, maxMs: maxLongTaskMs },
      memory: {
        numericChannelBytes:
          frame.byteLength +
          main.byteLength + rafTime.byteLength + rafReadTime.byteLength + nativeSerial.byteLength + controllerTick.byteLength +
          tickCosts.byteLength +
          stepCosts.byteLength +
          policyCosts.byteLength,
        cars: count,
        retainedProductionHistory: 0,
        exactHeapBytes: null,
        exactWasmBytes: null,
        gpuMs: null,
      },
    };
    lifetime.dispose();
    result.rendererCleanup = lifetime.readback<typeof result.rendererCleanup>('renderer');
    lifetime.throwIfFailed();
    return result;
  } catch (error) {
    lifetime.record('primary', error);
    lifetime.dispose();
    const partial = partialSnapshot();
    const raw = (partial.raw ?? {}) as Record<string, number[]>;
    const rawParts = YIELD_BROWSER_V4.channels.flatMap(channel => Array.from({length: Math.ceil((raw[channel]?.length ?? 0) / 3000)}, (_, part) => ({channel, part, count: Math.min(3000, raw[channel]!.length - part * 3000)})));
    const metadata = {...partial, raw: undefined, rawParts, ordinal: diagnosticOwner.ordinal,
      completedNativeCleanup,
      nativeDiagnostics: (error as Error & {nativeDiagnostics?: NativePartialDiagnostic}).nativeDiagnostics ?? null,
      rendererCleanup: lifetime.snapshot(), originalError: String(error).slice(0, 2048)};
    let admitted = false;
    try { await postJson('/partial-arm', {...diagnosticOwner, metadata}); admitted = true; }
    catch (exportError) { lifetime.record('export:partial-metadata', exportError); }
    if (admitted) for (const part of rawParts) {
      try { await postJson('/part', {...diagnosticOwner, channel: part.channel, part: part.part, numbers: raw[part.channel]!.slice(part.part * 3000, (part.part + 1) * 3000)}); }
      catch (exportError) { lifetime.record('export:partial-prefix', exportError); break; }
    }
  } finally { lifetime.dispose(); }
  lifetime.throwIfFailed();
  throw new Error('052 browser arm unavailable');
}
button.addEventListener('click', async () => {
  button.disabled = true;
  const lifetime = browserLifetime();
  let completedReport: unknown;
  let captureId: string | undefined;
  owned = undefined;
  const full = (document.getElementById('mode') as HTMLSelectElement).value === 'full';
  const requestedBackend =
    (document.getElementById('backend') as HTMLSelectElement).value === 'WEBGL2'
      ? 'WEBGL2'
      : 'WEBGPU';
  try {
    presentationLatch = installPresentationLatch(window, document, lifetime);
    const lose = presentationLatch.lose;
    check(!presentationLatch.lost, 'Foreground before async setup');
    const started = await postJson('/start', {
      fixtureVersion: YIELD_BROWSER_V4.version,
      sourceHash: __YIELD_BUILD__.sourceHash,
      backend: requestedBackend,
      full,
    });
    captureId = started.captureId;
    owned = await createRenderingBackend(
      document.getElementById('canvas') as HTMLCanvasElement,
      (document.getElementById('backend') as HTMLSelectElement).value === 'WEBGL2'
        ? 'WEBGL2'
        : 'AUTO',
    );
    const acquired = owned;
    lifetime.own('backend', () => acquired.dispose());
    const engine = owned.scene.getEngine();
    lifetime.inspect(
      'backend',
      () => {
        const value = {
          sceneDisposed: acquired.scene.isDisposed,
          engineScenes: engine.scenes.length,
          sceneMeshes: acquired.scene.meshes.length,
          sceneMaterials: acquired.scene.materials.length,
          sceneTextures: acquired.scene.textures.length,
          canvasCount: document.querySelectorAll('canvas').length,
        };
        return value;
      },
      (raw) => {
        const value = raw as {
          sceneDisposed: boolean;
          engineScenes: number;
          sceneMeshes: number;
          sceneMaterials: number;
          sceneTextures: number;
          canvasCount: number;
        };
        check(
          value.sceneDisposed &&
            value.engineScenes === 0 &&
            value.sceneMeshes === 0 &&
            value.sceneMaterials === 0 &&
            value.sceneTextures === 0 &&
            value.canvasCount === 1,
          '052 backend cleanup',
        );
      },
    );
    const loss = engine.onContextLostObservable.add(lose);
    lifetime.own('context', () => engine.onContextLostObservable.remove(loss));
    const rendererInfo =
      'getInfo' in engine ? (engine as unknown as { getInfo(): unknown }).getInfo() : null;
    check(
      /AMD|Radeon/i.test(JSON.stringify(rendererInfo)) &&
        !/swiftshader|llvmpipe|software rasterizer/i.test(JSON.stringify(rendererInfo)),
      'Actual AMD hardware renderer',
    );
    owned.canvas.tabIndex = 0;
    owned.canvas.focus();
    engine.setHardwareScalingLevel(1);
    owned.resize();
    engine.setSize(1920, 1080);
    check(
      devicePixelRatio === 1 &&
        owned.canvas.clientWidth === 1920 &&
        owned.canvas.clientHeight === 1080,
      'CSS/DPR mismatch',
    );
    check(
      engine.getRenderWidth() === 1920 && engine.getRenderHeight() === 1080,
      'Internal resolution mismatch',
    );
    new HemisphericLight('light', new Vector3(0, 1, 0), owned.scene);
    const camera = new FreeCamera('camera', new Vector3(60, 100, -110), owned.scene);
    camera.setTarget(new Vector3(35, 0, 20));
    owned.scene.activeCamera = camera;
    const ground = MeshBuilder.CreateGround('ground', { width: 300, height: 300 }, owned.scene);
    ground.material = new StandardMaterial('ground-material', owned.scene);
    const runs = [],
      calibration = [];
    check(owned.rendererKind === requestedBackend, 'Actual backend differs from requested attempt');
    // Short visible native manoeuvres are retained separately from performance warmup.
    for (const classId of ['sedan', 'compact'] as const)
      for (const thresholdS of [0.2, 3]) {
        const row = await arm(owned, true, 0, 13, {captureId: captureId!, ordinal: calibration.length}, { classId, thresholdS, otherDistanceM: 14 });
        calibration.push(await storeArm(captureId!, calibration.length, row));
      }
    for (let pair = 0; pair < 5; pair++)
      for (const current of pair % 2 ? [true, false] : [false, true]) {
        const row = { pair, ...(await arm(owned, current, full ? 30 : 1, full ? 120 : 3, {captureId: captureId!, ordinal: runs.length + 4})) };
        runs.push(await storeArm(captureId!, runs.length + 4, row));
      }
    const manifest = (await (await fetch('/build-manifest.json')).json()) as {
      artifactHash: string;
    };
    const report = {
      fixtureVersion: YIELD_BROWSER_V4.version,
      captureId,
      identity: __YIELD_BUILD__,
      artifactHash: manifest.artifactHash,
      renderer: owned.rendererKind,
      browser: navigator.userAgent,
      rendererInfo,
      createdAt: new Date().toISOString(),
      foreground: document.hasFocus() && !document.hidden,
      full,
      dpr: devicePixelRatio,
      cssResolution: [owned.canvas.clientWidth, owned.canvas.clientHeight],
      internalResolution: [engine.getRenderWidth(), engine.getRenderHeight()],
      runs,
      calibration,
      scope:
        'Postimplementation reference/current control: one active yield subject and70physical cars. Original chronological CPU BEFORE separate; not full fleet AI/game/laptop acceptance.',
    };
    lifetime.dispose();
    const rendererCleanup = lifetime.readback('backend');
    lifetime.throwIfFailed();
    completedReport = { ...report, rendererCleanup, ownerCleanup: lifetime.snapshot() };
    const response = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(completedReport),
    });
    if (!response.ok) throw new Error(`Export HTTP${response.status}: ${await response.text()}`);
    status.textContent = `${full ? 'FULL SAVED, verifier pending' : 'SMOKE SAVED, no performance PASS'} ${owned.rendererKind}`;
  } catch (error) {
    status.textContent = `FAILED: ${String(error)}`;
    lifetime.record('primary', error);
    lifetime.dispose();
    try {
      const response = await fetch('/failure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixtureVersion: YIELD_BROWSER_V4.version,
          captureId,
          identity: __YIELD_BUILD__,
          renderer: owned?.rendererKind ?? null,
          failure: String(error),
          causes: lifetime.snapshot(),
          completedReport: completedReport ?? null,
        }),
      });
      if (!response.ok)
        throw new Error('Failure export HTTP' + response.status + ': ' + (await response.text()));
    } catch (exportError) {
      lifetime.record('export:failure', exportError);
      status.textContent += '\n' + JSON.stringify(lifetime.snapshot());
    }
  } finally {
    lifetime.dispose();
    button.disabled = false;
  }
});

async function postJson(path: string, value: unknown): Promise<{ captureId: string }> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!response.ok) throw new Error('HTTP' + response.status + ': ' + (await response.text()));
  return response.json();
}
async function storeArm(captureId: string, ordinal: number, row: Awaited<ReturnType<typeof arm>>) {
  const references: { channel: string; part: number; count: number }[] = [];
  for (const channel of YIELD_BROWSER_V4.channels) {
    const values = row.raw[channel];
    for (
      let offset = 0, part = 0;
      offset < values.length;
      offset += YIELD_BROWSER_V4.rawNumbersPerPart, part++
    ) {
      const numbers = values.slice(offset, offset + YIELD_BROWSER_V4.rawNumbersPerPart);
      await postJson('/part', { captureId, ordinal, channel, part, numbers });
      references.push({ channel, part, count: numbers.length });
    }
  }
  const metadata = { ...row, raw: undefined, rawParts: references, ordinal };
  await postJson('/arm', { captureId, ordinal, metadata });
  return metadata;
}
