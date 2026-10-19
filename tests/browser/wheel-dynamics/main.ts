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
import { calibrateWheels } from '../../vehicles/wheel-dynamics-fixture';

declare const __WHEEL_BUILD__: { sourceHash: string; commit: string; inputs: string[] };
const status = document.getElementById('status')!;
const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const check = (value: boolean, message: string) => {
  if (!value) throw new Error(message);
};
let owned: RenderingBackend | undefined;

async function arm(
  backend: RenderingBackend,
  current: boolean,
  warmupSeconds: number,
  measuredSeconds: number,
  failureContext: { diagnostic: unknown },
  armIndex: number,
  pair: number,
) {
  const world = await (current ? createRapierProbe() : createBefore());
  const inputs = new Map<string, { throttle: number; brake: number; steering: number }>();
  const visuals = Array.from({ length: 70 }, (_, i) => {
    const id = `car-${i}`;
    world.addCar(id, { x: (i % 10) * 2.2 - 10, y: 0.8, z: Math.floor(i / 10) * 4.15 });
    inputs.set(id, { throttle: i % 2 ? 0.65 : 1, brake: 0, steering: i % 2 ? 0.03 : -0.03 });
    const mesh = MeshBuilder.CreateBox(id, { width: 1.7, height: 0.6, depth: 4 }, backend.scene);
    mesh.rotationQuaternion = Quaternion.Identity();
    const wheels = Array.from({ length: 4 }, (_, index) => {
      const wheel = MeshBuilder.CreateCylinder(
        `${id}-wheel-${index}`,
        { diameter: 0.64, height: 0.18, tessellation: 12 },
        backend.scene,
      );
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
  const capacity = 30000;
  const channels = Object.fromEntries(
    ['frame', 'main', 'tick', 'projection', 'step'].map((name) => [
      name,
      new Float64Array(capacity),
    ]),
  );
  let frameCount = 0,
    tickCount = 0,
    tick = 0,
    measuring = false;
  let firstFrame = 0,
    previousFrame = 0,
    activeSeconds = 0;
  const longTasks = {
    supported: PerformanceObserver.supportedEntryTypes.includes('longtask'),
    count: 0,
    maxMs: 0,
  };
  const observer = longTasks.supported
    ? new PerformanceObserver((entries) => {
        if (!measuring) return;
        for (const entry of entries.getEntries()) {
          longTasks.count++;
          longTasks.maxMs = Math.max(longTasks.maxMs, entry.duration);
        }
      })
    : undefined;
  observer?.observe({ type: 'longtask', buffered: false });
  const loop = createFixedTickLoop({
    captureSnapshot: () => ({ tick }),
    interpolate: (_previous, latest) => latest,
    step(frame) {
      tick = frame.tick;
      const start = performance.now();
      const costs = world.step(inputs, true);
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
  let lastFrame: ReturnType<typeof loop.frame> | undefined;
  let lastRafMs = 0;
  try {
    firstFrame = previousFrame = await raf();
    lastFrame = loop.frame(firstFrame);
    lastRafMs = firstFrame;
    while (activeSeconds < warmupSeconds + measuredSeconds) {
      const now = await raf();
      lastRafMs = now;
      check(document.hasFocus() && !document.hidden, 'Foreground lost');
      activeSeconds = (now - firstFrame) / 1000;
      measuring = activeSeconds >= warmupSeconds;
      const start = performance.now();
      lastFrame = loop.frame(now);
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
      backend.render();
      if (measuring) {
        check(frameCount < capacity, 'Frame buffer overflow');
        channels.frame[frameCount] = now - previousFrame;
        channels.main[frameCount] = performance.now() - start;
        channels.projection[frameCount++] = projectionMs;
      }
      previousFrame = now;
      status.textContent = `${current ? 'CURRENT native wheels' : 'ARCHIVED BEFORE'} ${activeSeconds.toFixed(1)}/${warmupSeconds + measuredSeconds}s · tick${tick} · cars70/debris64 · ${measuring ? 'measuring' : 'warmup'}`;
    }
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
    return {
      current,
      warmupSeconds,
      measuredSeconds,
      activeSeconds,
      frames: frameCount,
      ticks: tickCount,
      stats,
      overloadCount: loop.getState().overloadCount,
      simulationToActiveWallTime: tickCount / 60 / (activeSeconds - warmupSeconds),
      physics: world.counts(),
      sampleBytes: capacity * 8 * 5,
      memory: {
        exactPageHeapBytes: null,
        exactWasmBytes: null,
        wheelMeshes: 280,
        chassisMeshes: 70,
        worlds: 1,
        retainedWheelHistory: 0,
      },
      longTasks,
      gpuP95Ms: null,
    };
  } catch (error) {
    const state = loop.getState();
    failureContext.diagnostic = {
      acceptance: 'INCOMPLETE',
      armIndex,
      pair,
      current,
      phase: measuring ? 'measurement' : 'warmup',
      warmupSeconds,
      measuredSeconds,
      tick: state.tick,
      elapsedSeconds: (lastRafMs - firstFrame) / 1000,
      rafDeltaMs: lastRafMs - previousFrame,
      debtSeconds: state.debtSeconds,
      status: state.status,
      overloadCount: state.overloadCount,
      stepsInLastFrame: lastFrame?.steps ?? null,
      fixedDtSeconds: FIXED_DT_SECONDS,
      maxCatchupSteps: MAX_STEPS_PER_FRAME,
      overloadDebtMs: OVERLOAD_DEBT_MS,
      measuredFrames: frameCount,
      measuredTicks: tickCount,
      longTasks: { ...longTasks },
      scope:
        'Actual bounded failed-arm counters; no successful metrics or performance acceptance reconstructed.',
    };
    throw error;
  } finally {
    observer?.disconnect();
    loop.dispose();
    world.dispose();
    check(
      world.bodyResources().entities === 0 && world.collisionResources().colliders === 0,
      'Native cleanup failed',
    );
    visuals.forEach(({ mesh }) => mesh.dispose(false, true));
  }
}

document.getElementById('run')!.addEventListener('click', async () => {
  const button = document.getElementById('run') as HTMLButtonElement;
  button.disabled = true;
  let completedReport: unknown;
  const runs: unknown[] = [];
  const failureContext: { diagnostic: unknown } = { diagnostic: null };
  let phase = 'setup';
  try {
    const full = (document.getElementById('duration') as HTMLSelectElement).value === 'full';
    owned?.dispose();
    const old = document.getElementById('canvas') as HTMLCanvasElement,
      canvas = old.cloneNode(false) as HTMLCanvasElement;
    old.replaceWith(canvas);
    owned = await createRenderingBackend(
      canvas,
      (document.getElementById('backend') as HTMLSelectElement).value as 'AUTO' | 'WEBGL2',
    );
    owned.scene.useRightHandedSystem = false;
    new HemisphericLight('light', new Vector3(0, 1, 0), owned.scene);
    const camera = new FreeCamera('camera', new Vector3(45, 55, -40), owned.scene);
    camera.setTarget(new Vector3(0, 0, 17));
    owned.scene.activeCamera = camera;
    const ground = MeshBuilder.CreateGround('road', { width: 120, height: 120 }, owned.scene),
      material = new StandardMaterial('road', owned.scene);
    material.diffuseColor = new Color3(0.2, 0.25, 0.3);
    ground.material = material;
    owned.scene.getEngine().setHardwareScalingLevel(1);
    owned.resize();
    owned.scene.getEngine().setSize(1920, 1080);
    const actualCanvas = owned.canvas;
    check(
      devicePixelRatio === 1 &&
        actualCanvas.clientWidth === 1920 &&
        actualCanvas.clientHeight === 1080,
      'CSS resolution/DPR mismatch',
    );
    phase = 'arms';
    for (let pair = 0; pair < 5; pair++)
      for (const current of pair % 2 ? [true, false] : [false, true])
        runs.push({
          pair,
          ...(await arm(
            owned,
            current,
            full ? 30 : 1,
            full ? 120 : 3,
            failureContext,
            runs.length,
            pair,
          )),
        });
    phase = 'calibration';
    const calibration = [];
    for (const classId of ['sedan', 'compact'] as const)
      for (const surface of ['dry-asphalt', 'reduced-adhesion'] as const)
        for (const scenario of ['braking', 'turning'] as const)
          calibration.push(await calibrateWheels(classId, surface, 20, scenario));
    const manifest = (await (await fetch('/build-manifest.json')).json()) as {
      artifactHash: string;
    };
    const engine = owned.scene.getEngine();
    const report = {
      fixtureVersion: '026-wheel-dynamics-v1',
      identity: __WHEEL_BUILD__,
      artifactHash: manifest.artifactHash,
      createdAt: new Date().toISOString(),
      browser: navigator.userAgent,
      renderer: owned.rendererKind,
      foreground: document.hasFocus() && !document.hidden,
      actualGpuInfo:
        'getInfo' in engine ? (engine as unknown as { getInfo(): unknown }).getInfo() : null,
      full,
      cssResolution: [actualCanvas.clientWidth, actualCanvas.clientHeight],
      internalResolution: [engine.getRenderWidth(), engine.getRenderHeight()],
      dpr: devicePixelRatio,
      runs,
      calibration,
      scope: full
        ? 'Early identical native physics workload, before/current wheel readback and presentation costs; not final game/laptop gate.'
        : 'Smoke only, no performance acceptance.',
    };
    completedReport = report;
    check(
      new TextEncoder().encode(JSON.stringify({ ...report, calibration: [] })).byteLength <=
        256 * 1024,
      'Evidence metadata envelope exceeds bounded 256KiB allowance',
    );
    phase = 'export';
    if (full) {
      const response = await fetch('/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      check(
        response.ok,
        `Export rejected HTTP ${response.status} ${response.statusText}: ${await response.text()}`,
      );
    }
    status.textContent = `${full ? 'CAPTURE COMPLETE' : 'SMOKE COMPLETE'} ${owned.rendererKind}. ${full ? 'Evidence saved; verifier determines performance acceptance.' : 'No performance PASS claimed.'}`;
  } catch (error) {
    status.textContent = `FAILED: ${String(error)}`;
    console.error(error);
    await fetch('/failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fixtureVersion: '026-wheel-dynamics-v1',
        identity: __WHEEL_BUILD__,
        createdAt: new Date().toISOString(),
        renderer: owned?.rendererKind ?? null,
        browser: navigator.userAgent,
        foreground: document.hasFocus() && !document.hidden,
        error: String(error),
        completedReport,
        failureDiagnostics: {
          acceptance: 'INCOMPLETE',
          phase,
          failedArm: failureContext.diagnostic,
          completedArms: runs,
        },
      }),
    });
  } finally {
    button.disabled = false;
  }
});
