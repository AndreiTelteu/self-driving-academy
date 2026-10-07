import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import {
  BabylonSceneAdapter,
  createRenderingBackend,
  subscribeRenderingLoss,
} from '../../../src/rendering/babylon';
import type { RenderingBackend } from '../../../src/rendering/babylon';
import { connectPhysicsBodyToScene, PHYSICS_CONFIG, BODY_LIMITS } from '../../../src/vehicles';
import type { BodyIdentity, PhysicsScenePort, PhysicsProbe } from '../../../src/vehicles';
import { createFixedTickLoop } from '../../../src/simulation';
import { distribution } from '../../../src/telemetry';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { classContacts } from './workload';
import { compareClasses } from './compare';

declare const __CLASS_BUILD__: {
  commit: string;
  sourceHash: string;
  inputs: string[];
  budgetVersion: string;
  physicsVersion: string;
  engineVersion: string;
};
const status = document.getElementById('status')!;
const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
function check(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
const counts = (backend: RenderingBackend) => ({
  meshes: backend.scene.meshes.length,
  nodes: backend.scene.transformNodes.length,
  materials: backend.scene.materials.length,
  textures: backend.scene.textures.length,
});
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function cleanupEvidence(baseline: ReturnType<typeof counts>) {
  return {
    sceneBaseline: baseline,
    sceneAfter: undefined as ReturnType<typeof counts> | undefined,
    mappingAfter: undefined as ReturnType<PhysicsProbe['bodyResources']> | undefined,
    physicsBeforeWorldDispose: undefined as ReturnType<PhysicsProbe['counts']> | undefined,
    worldDisposeCompleted: false,
  };
}
function removeMappedVehicles(world: PhysicsProbe) {
  for (let i = 0; i < 70; i++) {
    const identity = world.bodyIdentity(`car-${i}`);
    if (identity) check(world.removeBody(identity), 'Mapped vehicle cleanup failed');
  }
  const resources = world.counts();
  check(
    same(resources, { vehicles: 0, bodies: 64, colliders: 68 }),
    'Native vehicle/controller/collider cleanup failed',
  );
  // Remaining native resources belong to the anonymous 021 obstacle fixture.
  return resources;
}
function checkCaps(world: PhysicsProbe) {
  const physical = world.counts(),
    mapping = world.bodyResources();
  check(
    physical.vehicles <= PHYSICS_CONFIG.vehicles &&
      physical.bodies <= PHYSICS_CONFIG.bodies &&
      physical.colliders <= PHYSICS_CONFIG.colliders,
    'Physical caps exceeded',
  );
  check(
    mapping.entities <= BODY_LIMITS.entities && mapping.subscriptions <= BODY_LIMITS.subscriptions,
    'Mapping caps exceeded',
  );
}

/** Same bounded scene and subscribed delivery; explicit class mechanics change between arms. */
async function arm(
  backend: RenderingBackend,
  mode: 'default' | 'mixed',
  epoch: number,
  warmupS = 30,
  measuredS = 120,
) {
  const { world, inputs } = await classContacts(mode);
  const context = { sessionId: '023-classes', worldEpoch: epoch };
  // Babylon's shared default material survives mesh cleanup; establish it in baseline.
  void backend.scene.defaultMaterial;
  const baseline = counts(backend);
  const cleanup = cleanupEvidence(baseline);
  const scene = new BabylonSceneAdapter(backend.scene, context, 110);
  const identities: BodyIdentity[] = [];
  const offs: (() => void)[] = [];
  let callbacks = 0;
  const sink: PhysicsScenePort = {
    presentVehicle(state) {
      callbacks++;
      return scene.presentVehicle(state);
    },
  };
  // Bounded numeric samples, no per-frame logging or report serialization.
  const metrics = Object.fromEntries(
    ['frame', 'main', 'tick', 'step', 'readback', 'dispatch'].map((key) => [
      key,
      new Float64Array(60000),
    ]),
  );
  const lengths: Record<string, number> = {};
  // Finite diagnostic ownership, including warmup and the frame that fails validity.
  const columns = [
    'rafMs',
    'wallGapMs',
    'frameStartMs',
    'loopMs',
    'renderMs',
    'mainMs',
    'steps',
    'tick',
    'debtMs',
    'controllerMs',
    'physicsStepMs',
    'physicsTotalMs',
    'readbackMs',
    'dispatchMs',
  ] as const;
  const recentFrames = new Float64Array(32 * columns.length);
  const recentTasks = new Float64Array(32 * 2);
  let frameCount = 0,
    taskCount = 0;
  const frameCosts = { controller: 0, step: 0, total: 0, readback: 0, dispatch: 0 };
  const sample = (key: string, value: number) => {
    const i = lengths[key] ?? 0;
    check(i < metrics[key]!.length, 'Sample capacity overflow');
    metrics[key]![i] = value;
    lengths[key] = i + 1;
  };
  let measuring = false,
    lost = false,
    tick = 0,
    invalidFocus = false,
    longTasks = 0,
    maxLongTaskMs = 0;
  let measuredStartTimestamp = Infinity,
    measuredEndTimestamp = Infinity;
  // Count tasks whose startTime lies in [start,end); include their full duration.
  // A warmup task crossing start is excluded; a task crossing end is included.
  const recordLongTasks = (entries: readonly PerformanceEntry[]) => {
    for (const entry of entries) {
      const slot = taskCount++ % 32;
      recentTasks[slot * 2] = entry.startTime;
      recentTasks[slot * 2 + 1] = entry.duration;
      if (entry.startTime >= measuredStartTimestamp && entry.startTime < measuredEndTimestamp) {
        longTasks++;
        maxLongTaskMs = Math.max(maxLongTaskMs, entry.duration);
      }
    }
  };
  const lossOff = subscribeRenderingLoss(backend, () => {
    lost = true;
  });
  const focus = () => {
    invalidFocus = true;
  };
  const visibility = () => {
    if (document.hidden) invalidFocus = true;
  };
  window.addEventListener('blur', focus);
  document.addEventListener('visibilitychange', visibility);
  const longTaskSupported = PerformanceObserver.supportedEntryTypes.includes('longtask');
  const observer = longTaskSupported
    ? new PerformanceObserver((list) => recordLongTasks(list.getEntries()))
    : undefined;
  observer?.observe({ type: 'longtask' });
  const loop = createFixedTickLoop({
    captureSnapshot: () => ({ tick }),
    interpolate: (_, current) => current,
    step: () => {
      const start = performance.now();
      const physics = world.step(inputs);
      tick++;
      const { readbackMs, dispatchMs } = world.publishBodies(tick);
      frameCosts.controller += physics.controllerMs;
      frameCosts.step += physics.stepMs;
      frameCosts.total += physics.totalMs;
      frameCosts.readback += readbackMs;
      frameCosts.dispatch += dispatchMs;
      if (measuring) {
        sample('tick', performance.now() - start);
        sample('step', physics.stepMs);
        sample('readback', readbackMs);
        sample('dispatch', dispatchMs);
      }
    },
  });
  try {
    for (let i = 0; i < 70; i++) {
      const id = `car-${i}`,
        identity = world.bodyIdentity(id)!;
      identities.push(identity);
      scene.create(
        id,
        { root: MeshBuilder.CreateBox(id, { width: 1.7, height: 0.6, depth: 4 }, backend.scene) },
        world.readBody(identity).transform,
      );
      offs.push(connectPhysicsBodyToScene(world, identity, sink, context));
    }
    checkCaps(world);
    const start = await raf();
    measuredStartTimestamp = start + warmupS * 1000;
    let previous = start,
      measuredStartTick = 0;
    loop.frame(start);
    while (true) {
      const time = await raf();
      check(
        !lost && !invalidFocus && document.hasFocus() && !document.hidden,
        'Lost GPU/focus/visibility; run invalid',
      );
      const nowMeasuring = time - start >= warmupS * 1000;
      if (nowMeasuring && !measuring) measuredStartTick = tick;
      measuring = nowMeasuring;
      const mainStart = performance.now();
      frameCosts.controller = 0;
      frameCosts.step = 0;
      frameCosts.total = 0;
      frameCosts.readback = 0;
      frameCosts.dispatch = 0;
      const loopResult = loop.frame(time);
      const loopEnd = performance.now();
      backend.render();
      const mainEnd = performance.now();
      const values = [
        time,
        time - previous,
        mainStart,
        loopEnd - mainStart,
        mainEnd - loopEnd,
        mainEnd - mainStart,
        loopResult.steps,
        tick,
        loopResult.state.debtSeconds * 1000,
        frameCosts.controller,
        frameCosts.step,
        frameCosts.total,
        frameCosts.readback,
        frameCosts.dispatch,
      ];
      const slot = frameCount++ % 32;
      recentFrames.set(values, slot * columns.length);
      check(loop.getState().overloadCount === 0, 'Simulation overload invalidates run');
      check(loopResult.state.status !== 'fault', 'Simulation fault invalidates run');
      if (measuring) {
        sample('frame', time - previous);
        sample('main', performance.now() - mainStart);
      }
      previous = time;
      if (time - start >= (warmupS + measuredS) * 1000) {
        measuredEndTimestamp = performance.now();
        const activeMeasuredS = (measuredEndTimestamp - measuredStartTimestamp) / 1000;
        // Finish the final RAF task so its LongTask entry can be delivered/queued.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        recordLongTasks(observer?.takeRecords() ?? []);
        observer?.disconnect();
        check(
          !lost && !invalidFocus && document.hasFocus() && !document.hidden,
          'Lost GPU/focus/visibility during final observer drain',
        );
        return {
          mode,
          epoch,
          warmupS,
          measuredS: activeMeasuredS,
          callbacks,
          simulatedToReal: (tick - measuredStartTick) / 60 / activeMeasuredS,
          distributions: Object.fromEntries(
            Object.keys(metrics).map((key) => [
              key,
              distribution(metrics[key]!, lengths[key] ?? 0),
            ]),
          ),
          sampleBytes: Object.values(metrics).reduce((total, array) => total + array.byteLength, 0),
          diagnosticBytes: recentFrames.byteLength + recentTasks.byteLength,
          physics: world.counts(),
          mapping: world.bodyResources(),
          scene: counts(backend),
          cleanup,
          validity: {
            foreground: true,
            visibilityLost: invalidFocus,
            deviceLost: lost,
            overloadCount: loop.getState().overloadCount,
          },
          longTasks: {
            supported: longTaskSupported,
            count: longTasks,
            maxMs: maxLongTaskMs,
            measuredStartTimestamp,
            measuredEndTimestamp,
            boundaryRule:
              'startTime in [start,end); full task duration, including end overlap; exclude start overlap from warmup',
            finalTaskYieldedAndDrained: true,
          },
          exactGpuMemory: null,
          exactWasmMemory: null,
          gpuTimer: null,
          unavailableReasons: {
            exactGpuMemory: 'No portable exact GPU allocator measurement',
            exactWasmMemory: 'Rapier public API exposes no exact WASM allocation size',
            gpuTimer: 'Fixture has no GPU timer instrumentation',
          },
        };
      }
    }
  } catch (error) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    recordLongTasks(observer?.takeRecords() ?? []);
    const frames = Array.from({ length: Math.min(frameCount, 32) }, (_, index) => {
      const slot = (Math.max(0, frameCount - 32) + index) % 32;
      return Object.fromEntries(
        columns.map((key, column) => [key, recentFrames[slot * columns.length + column]]),
      );
    });
    const tasks = Array.from({ length: Math.min(taskCount, 32) }, (_, index) => {
      const slot = (Math.max(0, taskCount - 32) + index) % 32;
      return { startTime: recentTasks[slot * 2], durationMs: recentTasks[slot * 2 + 1] };
    });
    const failure = {
      kind: 'INVALID_DIAGNOSTIC_ONLY',
      identity: __CLASS_BUILD__,
      createdAt: new Date().toISOString(),
      renderer: backend.rendererKind,
      mode,
      epoch,
      warmupS,
      measuredS,
      error: String(error),
      tick,
      measuring,
      loop: loop.getState(),
      focus: document.hasFocus(),
      visible: !document.hidden,
      invalidFocus,
      lost,
      frames,
      tasks,
      diagnosticBytes: recentFrames.byteLength + recentTasks.byteLength,
      physics: world.counts(),
      mapping: world.bodyResources(),
    };
    const exported = await fetch('/invalid-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(failure),
    });
    if (!exported.ok)
      throw new Error(
        `Invalid diagnostic export rejected: ${exported.status}; original ${String(error)}`,
      );
    throw error;
  } finally {
    measuring = false;
    observer?.disconnect();
    lossOff();
    loop.dispose();
    window.removeEventListener('blur', focus);
    document.removeEventListener('visibilitychange', visibility);
    for (const off of offs) off();
    scene.dispose();
    cleanup.physicsBeforeWorldDispose = removeMappedVehicles(world);
    world.dispose();
    cleanup.worldDisposeCompleted = true;
    cleanup.sceneAfter = counts(backend);
    cleanup.mappingAfter = world.bodyResources();
    check(same(counts(backend), baseline), 'Scene resources did not return to baseline');
    check(
      same(world.bodyResources(), { entities: 0, subscriptions: 0 }),
      'Body registry cleanup failed',
    );
  }
}

async function lifecycle(backend: RenderingBackend) {
  const baseline = counts(backend),
    cycles = [];
  for (let cycle = 0; cycle < 20; cycle++) {
    const { world } = await classContacts('mixed');
    const context = { sessionId: '023-lifecycle', worldEpoch: cycle };
    const scene = new BabylonSceneAdapter(backend.scene, context, 110);
    const old = world.bodyIdentity('car-0')!;
    const cleanup = cleanupEvidence(baseline);
    let staleCalls = 0;
    const oldOff = world.subscribeBody(old, () => staleCalls++);
    try {
      scene.create(
        'car-0',
        { root: MeshBuilder.CreateBox('car', {}, backend.scene) },
        world.readBody(old).transform,
      );
      connectPhysicsBodyToScene(world, old, scene, context);
      world.publishBodies(1, false);
      checkCaps(world);
      const peakMapping = world.bodyResources();
      check(world.removeBody(old), 'Remove failed');
      world.addClassCar('car-0', { x: 7, y: 3, z: -11 }, 'compact');
      const next = world.bodyIdentity('car-0')!;
      world.subscribeBody(next, () => {});
      oldOff();
      oldOff();
      check(world.bodyResources().subscriptions === 1, 'Old unsubscribe touched new registration');
      check(!world.removeBody(old), 'Old identity removed recreated body');
      world.publishBodies(2, false);
      check(staleCalls === 1, 'Stale callback delivered');
      checkCaps(world);
      cycles.push({
        cycle,
        physics: world.counts(),
        mapping: world.bodyResources(),
        peakMapping,
        staleCalls,
        oldUnsubscribeDidNotAffectNew: true,
        cleanup,
      });
    } finally {
      scene.dispose();
      cleanup.physicsBeforeWorldDispose = removeMappedVehicles(world);
      world.dispose();
      world.dispose();
      cleanup.worldDisposeCompleted = true;
      cleanup.sceneAfter = counts(backend);
      cleanup.mappingAfter = world.bodyResources();
    }
    check(same(counts(backend), baseline), 'Lifecycle scene leak');
    check(
      world.bodyResources().entities === 0 && world.bodyResources().subscriptions === 0,
      'Lifecycle map leak',
    );
  }
  return { baseline, after: counts(backend), cycles };
}

async function setupBackend() {
  const preference = (document.getElementById('backend') as HTMLSelectElement).value as
    'AUTO' | 'WEBGL2';
  // Disposed backends zero their owned canvas and release its native context.
  // Create a fresh, sized canvas before initialization renders its first frame.
  const previous = document.getElementById('canvas') as HTMLCanvasElement;
  const canvas = document.createElement('canvas');
  canvas.id = previous.id;
  canvas.width = 1920;
  canvas.height = 1080;
  previous.replaceWith(canvas);
  const backend = await createRenderingBackend(canvas, preference);
  backend.scene.getEngine().setHardwareScalingLevel(1);
  backend.scene.getEngine().setSize(1920, 1080);
  const camera = backend.scene.activeCamera as FreeCamera;
  camera.position = new Vector3(42, 48, -38);
  camera.setTarget(new Vector3(0, 0, 15));
  new HemisphericLight('sun', new Vector3(0, 1, 0), backend.scene);
  return backend;
}

let calibration: { dispose(): void; recreate(): void } | undefined;
let classesDispose: (() => void) | undefined;
document.getElementById('classes')!.addEventListener('click', async () => {
  const button = document.getElementById('classes') as HTMLButtonElement;
  const run = document.getElementById('run') as HTMLButtonElement;
  if (run.disabled) return;
  button.disabled = true;
  run.disabled = true;
  classesDispose?.();
  classesDispose = undefined;
  calibration?.dispose();
  calibration = undefined;
  let backend: RenderingBackend | undefined;
  try {
    backend = await setupBackend();
    classesDispose = await compareClasses(backend, status, __CLASS_BUILD__);
  } catch (error) {
    backend?.dispose();
    status.textContent = String(error);
  } finally {
    button.disabled = false;
    run.disabled = false;
  }
});
const calibrationStatus = document.getElementById('calibration-state')!;
document.getElementById('calibration')!.addEventListener('click', async () => {
  if ((document.getElementById('run') as HTMLButtonElement).disabled) return;
  classesDispose?.();
  classesDispose = undefined;
  if (calibration) {
    calibration.dispose();
    calibration = undefined;
    return;
  }
  const button = document.getElementById('calibration') as HTMLButtonElement;
  button.disabled = true;
  (document.getElementById('run') as HTMLButtonElement).disabled = true;
  let backend: RenderingBackend | undefined;
  let world: Awaited<ReturnType<typeof createRapierProbe>> | undefined;
  try {
    backend = await setupBackend();
    world = await createRapierProbe();
    const ownedBackend = backend,
      ownedWorld = world;
    const context = { sessionId: '022-calibration', worldEpoch: 0 };
    const scene = new BabylonSceneAdapter(backend.scene, context, 110);
    const pose = {
      positionM: { x: 7, y: 3, z: -11 },
      rotationQuaternion: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
    };
    const velocity = { x: 12, y: -2, z: 4 };
    let tick = 0,
      oldCalls = 0,
      frame = 0,
      disposed = false;
    const makeBody = () => {
      ownedWorld.addCar('calibration', pose.positionM);
      const identity = ownedWorld.bodyIdentity('calibration')!;
      ownedWorld.setPose(identity, pose);
      ownedWorld.setBodyVelocity(identity, velocity);
      scene.create(
        'calibration',
        {
          root: MeshBuilder.CreateBox(
            'calibration-car',
            { width: 1.7, height: 0.6, depth: 4 },
            ownedBackend.scene,
          ),
        },
        ownedWorld.readBody(identity).transform,
      );
      connectPhysicsBodyToScene(
        ownedWorld,
        identity,
        {
          presentVehicle(state) {
            const accepted = scene.presentVehicle(state);
            const node = scene.getNode('calibration')!;
            const matrix = node.computeWorldMatrix(true);
            const point = Vector3.TransformCoordinates(new Vector3(0, 0, 1), matrix);
            const body = ownedWorld.readBody(identity);
            check(
              Math.abs(point.x - 8) < 1e-5 &&
                Math.abs(point.y - 3) < 1e-5 &&
                Math.abs(point.z + 11) < 1e-5,
              'Calibration world matrix mismatch',
            );
            calibrationStatus.textContent = JSON.stringify(
              {
                backend: ownedBackend.rendererKind,
                tick: state.tick,
                identity,
                pose: body.transform,
                velocityMps: body.velocityMps,
                worldMatrix: Array.from(matrix.m),
                localPlusZWorldPoint: { x: point.x, y: point.y, z: point.z },
                expectedPoint: { x: 8, y: 3, z: -11 },
                physics: ownedWorld.counts(),
                mapping: ownedWorld.bodyResources(),
              },
              null,
              2,
            );
            return accepted;
          },
        },
        context,
      );
      return identity;
    };
    let current = makeBody();
    const old = current,
      oldOff = ownedWorld.subscribeBody(old, () => oldCalls++);
    ownedWorld.publishBodies(++tick, false);
    const camera = ownedBackend.scene.activeCamera as FreeCamera;
    camera.position = new Vector3(13, 7, -18);
    camera.setTarget(new Vector3(7, 3, -11));
    const draw = () => {
      if (!disposed) {
        ownedBackend.render();
        frame = requestAnimationFrame(draw);
      }
    };
    draw();
    calibration = {
      recreate() {
        check(ownedWorld.removeBody(current), 'Calibration remove failed');
        scene.remove('calibration');
        current = makeBody();
        oldOff();
        oldOff();
        check(
          ownedWorld.bodyResources().subscriptions === 1,
          'Old unsubscribe damaged new mapping',
        );
        let rejected = false;
        try {
          ownedWorld.readBody(old);
        } catch {
          rejected = true;
        }
        check(rejected && !ownedWorld.removeBody(old), 'Stale calibration token accepted');
        ownedWorld.publishBodies(++tick, false);
        check(oldCalls === 1, 'Stale calibration callback');
        calibrationStatus.textContent +=
          '\nRemove/recreate: stale token rejected; old callback remains at 1; new mapping active.';
      },
      dispose() {
        disposed = true;
        cancelAnimationFrame(frame);
        scene.dispose();
        ownedWorld.dispose();
        ownedBackend.dispose();
        calibrationStatus.textContent = 'Calibration disposed';
      },
    };
  } catch (error) {
    world?.dispose();
    backend?.dispose();
    calibrationStatus.textContent = String(error);
  } finally {
    button.disabled = false;
    (document.getElementById('run') as HTMLButtonElement).disabled = false;
  }
});
document.getElementById('recreate')!.addEventListener('click', () => {
  try {
    calibration?.recreate();
  } catch (error) {
    calibrationStatus.textContent = String(error);
  }
});

document.getElementById('run')!.addEventListener('click', async () => {
  const button = document.getElementById('run') as HTMLButtonElement;
  button.disabled = true;
  let backend: RenderingBackend | undefined;
  try {
    calibration?.dispose();
    calibration = undefined;
    classesDispose?.();
    classesDispose = undefined;
    backend = await setupBackend();
    const smoke = (document.getElementById('smoke') as HTMLInputElement).checked;
    const diagnostic = (document.getElementById('diagnostic') as HTMLInputElement).checked;
    const pairs = smoke || diagnostic ? 1 : 5,
      warmupS = smoke ? 1 : diagnostic ? 5 : 30,
      measuredS = smoke ? 3 : diagnostic ? 60 : 120;
    const runs = [];
    for (let pair = 0; pair < pairs; pair++)
      for (const mode of (pair % 2 ? ['mixed', 'default'] : ['default', 'mixed']) as (
        'default' | 'mixed'
      )[]) {
        status.textContent = `Pair ${pair + 1}/${pairs}: ${mode}${smoke ? ' SMOKE' : diagnostic ? ' DIAGNOSTIC' : ''}`;
        runs.push(await arm(backend, mode, runs.length, warmupS, measuredS));
      }
    const report = {
      schemaVersion: 1,
      identity: __CLASS_BUILD__,
      artifactHash: (
        (await (await fetch('/build-manifest.json')).json()) as { artifactHash: string }
      ).artifactHash,
      fixtureVersion: smoke
        ? '023-classes-v2-SMOKE'
        : diagnostic
          ? '023-classes-v2-DIAGNOSTIC'
          : '023-classes-v2',
      createdAt: new Date().toISOString(),
      browser: navigator.userAgent,
      renderer: backend.rendererKind,
      actualGpuInfo:
        'getInfo' in backend.scene.getEngine()
          ? (backend.scene.getEngine() as unknown as { getInfo(): unknown }).getInfo()
          : null,
      resolution: [1920, 1080],
      dpr: devicePixelRatio,
      limits: { physics: PHYSICS_CONFIG, mapping: BODY_LIMITS },
      protocol: {
        production: true,
        foreground: document.hasFocus() && !document.hidden,
        preset: 'MEDIUM prototype simplified cuboids, no shadows',
        cssResolution: [backend.canvas.clientWidth, backend.canvas.clientHeight],
        internalResolution: [
          backend.scene.getEngine().getRenderWidth(),
          backend.scene.getEngine().getRenderHeight(),
        ],
        warmupS,
        measuredTargetS: measuredS,
        pairs,
        cache: 'HTTP no-store; module/WASM warm after first arm; OS/driver cache uncontrolled',
        network: 'local unthrottled',
        coldNavigationControlled: false,
        inspector: 'must remain closed; not detected automatically',
        refreshRateHz: null,
        displayRefreshRateReason:
          'No portable display refresh query; attach external hardware metadata',
        headed: null,
        headedReason:
          'Must be confirmed by coordinator using real visible Chrome; not inferred from userAgent',
      },
      runs,
      lifecycle: await lifecycle(backend),
      hardware: (await (await fetch('/hardware.json')).json()) as unknown,
    };
    const exported = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    check(exported.ok, `Export rejected: ${exported.status}`);
    status.textContent = `Report persisted: ${await exported.text()}`;
  } catch (error) {
    status.textContent = String(error);
  } finally {
    backend?.dispose();
    button.disabled = false;
  }
});
