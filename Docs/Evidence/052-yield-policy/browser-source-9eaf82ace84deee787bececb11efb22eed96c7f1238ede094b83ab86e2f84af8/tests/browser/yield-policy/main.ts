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
import type { YieldNativeOptions } from './runtime';
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
async function arm(
  backend: RenderingBackend,
  current: boolean,
  warmupSeconds: number,
  measuredSeconds: number,
  calibration?: Pick<YieldNativeOptions, 'classId' | 'otherDistanceM' | 'thresholdS'>,
) {
  const count = calibration ? 2 : 70,
    meshNames = [
      'subject',
      'priority',
      ...Array.from({ length: count - 2 }, (_, i) => `parked-${i}`),
    ],
    scene = backend.scene;
  const meshes = meshNames.map((name, i) => {
    const mesh = MeshBuilder.CreateBox(name, { width: 1.7, height: 0.6, depth: 4 }, scene),
      material = new StandardMaterial(`${name}-material`, scene);
    material.diffuseColor =
      i === 0
        ? new Color3(0.2, 0.65, 1)
        : i === 1
          ? new Color3(1, 0.45, 0.2)
          : new Color3(0.4, 0.55, 0.5);
    mesh.material = material;
    return mesh;
  });
  const frame = new Float64Array(60000),
    main = new Float64Array(60000),
    tickCosts = new Float64Array(12000),
    stepCosts = new Float64Array(12000),
    policyCosts = new Float64Array(12000);
  let frameCount = 0,
    tickCount = 0,
    firstWall = 0,
    lastFrame = 0,
    lastWall = 0,
    recoverySteps = 0,
    pendingPhysicsMs = 0,
    measuredFirst = 0,
    measuredLast = 0,
    longTaskCount = 0,
    maxLongTaskMs = 0;
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
  observer?.observe({ type: 'longtask' });
  try {
    const capture = await runBrowserYieldNative({
      count,
      classId: calibration?.classId ?? 'sedan',
      otherDistanceM: calibration?.otherDistanceM ?? 20,
      otherSpeedMps: 3,
      otherThrottle: calibration ? 1 : 0,
      thresholdS: calibration?.thresholdS ?? 3,
      ticks: Math.round((warmupSeconds + measuredSeconds) * 60),
      measured: true,
      evaluator: current ? productionYieldReference : referenceYield,
      async onTick(world, tick, costs) {
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
        while (performance.now() < target || recoverySteps >= 4 || lastFrame === 0) {
          const stamp = await raf(),
            start = performance.now();
          recoverySteps = 0;
          check(document.hasFocus() && !document.hidden, 'Foreground lost');
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
            frameCount++;
            if (!measuredFirst) measuredFirst = stamp;
            measuredLast = stamp;
          }
          lastFrame = stamp;
          lastWall = stamp;
        }
      },
    });
    check(
      capture.cleanup.bodies.entities === 0 &&
        capture.cleanup.controller.vehicles === 0 &&
        capture.cleanup.priority.vehicles === 0 &&
        capture.cleanup.collision.colliders === 0,
      'Native cleanup',
    );
    const simulatedSeconds = tickCount / 60;
    return {
      current,
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
      cleanup: capture.cleanup,
      stats: {
        frame: percentile(frame, frameCount),
        main: percentile(main, frameCount),
        tick: percentile(tickCosts, tickCount),
        step: percentile(stepCosts, tickCount),
        policy: percentile(policyCosts, tickCount),
      },
      activeWallSeconds: (lastWall - firstWall) / 1000,
      simulationToActiveWallTime:
        simulatedSeconds / Math.max(1e-6, (measuredLast - measuredFirst + 1000 / 60) / 1000),
      longTasks: { supported: longTasksSupported, count: longTaskCount, maxMs: maxLongTaskMs },
      memory: {
        numericChannelBytes:
          frame.byteLength +
          main.byteLength +
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
  } finally {
    observer?.disconnect();
    for (const mesh of meshes) mesh.dispose(false, true);
  }
}
button.addEventListener('click', async () => {
  button.disabled = true;
  let completedReport: unknown;
  try {
    owned?.dispose();
    owned = await createRenderingBackend(
      document.getElementById('canvas') as HTMLCanvasElement,
      (document.getElementById('backend') as HTMLSelectElement).value === 'WEBGL2'
        ? 'WEBGL2'
        : 'AUTO',
    );
    const engine = owned.scene.getEngine();
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
    MeshBuilder.CreateGround('ground', { width: 300, height: 300 }, owned.scene);
    const full = (document.getElementById('mode') as HTMLSelectElement).value === 'full',
      runs = [],
      calibration = [];
    // Short visible native manoeuvres are retained separately from performance warmup.
    for (const classId of ['sedan', 'compact'] as const)
      for (const thresholdS of [0.2, 3])
        calibration.push(
          await arm(owned, true, 0, 13, { classId, thresholdS, otherDistanceM: 14 }),
        );
    for (let pair = 0; pair < 5; pair++)
      for (const current of pair % 2 ? [true, false] : [false, true])
        runs.push({ pair, ...(await arm(owned, current, full ? 30 : 1, full ? 120 : 3)) });
    const manifest = (await (await fetch('/build-manifest.json')).json()) as {
      artifactHash: string;
    };
    completedReport = {
      fixtureVersion: '052-yield-browser-v1',
      identity: __YIELD_BUILD__,
      artifactHash: manifest.artifactHash,
      renderer: owned.rendererKind,
      browser: navigator.userAgent,
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
    const response = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(completedReport),
    });
    if (!response.ok) throw new Error(`Export HTTP${response.status}: ${await response.text()}`);
    status.textContent = `${full ? 'FULL SAVED, verifier pending' : 'SMOKE SAVED, no performance PASS'} ${owned.rendererKind}`;
  } catch (error) {
    status.textContent = `FAILED: ${String(error)}`;
    await fetch('/failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fixtureVersion: '052-yield-browser-v1',
        identity: __YIELD_BUILD__,
        renderer: owned?.rendererKind ?? null,
        failure: String(error),
        completedReport: completedReport ?? null,
      }),
    }).catch(() => undefined);
  } finally {
    button.disabled = false;
  }
});
