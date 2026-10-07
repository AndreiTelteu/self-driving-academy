import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { createRenderingBackend } from '../../../src/rendering/babylon/backend';
import { subscribeRenderingLoss } from '../../../src/rendering/babylon/recovery-session';
import { createFixedTickLoop } from '../../../src/simulation';
import {
  createPerformanceCollector,
  createPerformanceReport,
  distribution,
} from '../../../src/telemetry';
import type { PerformanceRun } from '../../../src/telemetry';
import { PHYSICS_CONFIG, SEDAN } from '../../../src/vehicles';
import type { PhysicsProbe } from '../../../src/vehicles';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { manyContacts } from '../../vehicles/physics-fixture';

declare const __HARNESS_BUILD__: {
  commit: string;
  sourceHash: string;
  budgetVersion: string;
  engineVersion: string;
  inputs: readonly string[];
};
const el = (id: string) => document.getElementById(id)!;
const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const canvas = document.createElement('canvas');
canvas.width = 1920;
canvas.height = 1080;
el('host').replaceChildren(canvas);
const backend = await createRenderingBackend(canvas, 'WEBGPU');
backend.scene.getEngine().setSize(1920, 1080);
const camera = backend.scene.activeCamera as FreeCamera;
camera.position = new Vector3(42, 48, -38);
camera.setTarget(new Vector3(0, 0, 15));
new HemisphericLight('sun', new Vector3(0, 1, 0), backend.scene);
const ground = MeshBuilder.CreateGround('ground', { width: 150, height: 150 }, backend.scene);
const road = new StandardMaterial('road', backend.scene);
road.diffuseColor = new Color3(0.15, 0.23, 0.3);
ground.material = road;
const material = new StandardMaterial('car', backend.scene);
material.diffuseColor = new Color3(0.2, 0.8, 0.7);
const meshes = Array.from({ length: 110 }, (_, i) => {
  const mesh = MeshBuilder.CreateBox(
    `car-${i}`,
    { width: 1.7, height: 0.6, depth: 4 },
    backend.scene,
  );
  mesh.material = material;
  mesh.rotationQuaternion = Quaternion.Identity();
  mesh.setEnabled(false);
  return mesh;
});
const obstacleMeshes: ReturnType<typeof MeshBuilder.CreateBox>[] = [];
let loss = false;
subscribeRenderingLoss(backend, () => {
  loss = true;
});
let world: PhysicsProbe | undefined,
  running = false,
  resetRequested = true;
const keys = new Set<string>();
window.addEventListener('keydown', (event) => {
  if (event.key.startsWith('Arrow')) {
    event.preventDefault();
    keys.add(event.key);
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.key));
window.addEventListener('blur', () => keys.clear());
const draw = (w: PhysicsProbe, count: number, benchmark: boolean) => {
  for (let i = 0; i < count; i++) {
    const s = w.project(benchmark ? `car-${i}` : i ? 'target' : 'car'),
      mesh = meshes[i];
    mesh.setEnabled(true);
    mesh.position.set(s.position.x, s.position.y, s.position.z);
    mesh.rotationQuaternion!.set(s.rotation.x, s.rotation.y, s.rotation.z, s.rotation.w);
  }
  for (let i = count; i < meshes.length; i++) meshes[i].setEnabled(false);
};
function visualBox(x: number, y: number, z: number, width: number, height: number, depth: number) {
  const mesh = MeshBuilder.CreateBox('obstacle', { width, height, depth }, backend.scene);
  mesh.position.set(x, y, z);
  obstacleMeshes.push(mesh);
}
async function manual() {
  while (true) {
    if (running) {
      await raf();
      continue;
    }
    if (resetRequested) {
      resetRequested = false;
      world?.dispose();
      obstacleMeshes.splice(0).forEach((mesh) => mesh.dispose());
      world = await createRapierProbe();
      const scenario = (el('scenario') as HTMLSelectElement).value;
      world.addCar(
        'car',
        { x: 0, y: 0.8, z: 0 },
        {
          ...SEDAN,
          grip: Number((el('grip') as HTMLInputElement).value),
          brakeAcceleration: Number((el('brake') as HTMLInputElement).value),
        },
      );
      if (scenario === 'contact') world.addCar('target', { x: 0, y: 0.8, z: 10 });
      if (scenario === 'curb') {
        world.addBox({ x: 0, y: 0.09, z: 10 }, { x: 4, y: 0.09, z: 0.15 });
        visualBox(0, 0.09, 10, 8, 0.18, 0.3);
      }
      for (let i = 0; i < 180; i++) world.step(new Map(), false);
      if (scenario !== 'manual')
        world.setVelocity('car', {
          x: 0,
          y: 0,
          z: scenario === 'curb' || scenario === 'contact' ? 10 : 20,
        });
      const active = world;
      const loop = createFixedTickLoop({
        captureSnapshot: () => ({ value: 0 }),
        interpolate: (_, current) => current,
        step: () => {
          const input = {
            throttle: keys.has('ArrowUp') ? 0.7 : 0,
            brake: scenario === 'braking' || keys.has('ArrowDown') ? 1 : 0,
            steering:
              scenario === 'turn'
                ? 0.35
                : keys.has('ArrowLeft')
                  ? -0.5
                  : keys.has('ArrowRight')
                    ? 0.5
                    : 0,
          };
          active.step(new Map([['car', input]]), false);
        },
      });
      let lastStatus = 0;
      while (!running && !resetRequested) {
        const now = await raf();
        loop.frame(now);
        draw(active, scenario === 'contact' ? 2 : 1, false);
        backend.render();
        if (now - lastStatus > 200) {
          const s = active.project('car');
          el('status').textContent =
            `${scenario} · ${s.speed.toFixed(2)}m/s · z=${s.position.z.toFixed(2)}m · suspensie ${s.suspension.map((n) => n.toFixed(2)).join('/')}m · roți contact=${s.wheelContacts}\n60Hz · solver8 · CCD4 · grip=${(el('grip') as HTMLInputElement).value} · brake=${(el('brake') as HTMLInputElement).value}`;
          lastStatus = now;
        }
        if (document.hidden) {
          loop.pause(now, 'background');
        } else if (loop.getState().status === 'background') loop.resume(now);
      }
      loop.dispose();
    } else await raf();
  }
}
el('reset').addEventListener('click', () => {
  if (!running) resetRequested = true;
});
async function benchmark(smoke: boolean) {
  if (running) return;
  running = true;
  Object.assign(window, { physicsReport: undefined, physicsError: undefined });
  let blurred = !document.hasFocus(),
    hidden = document.hidden;
  const onBlur = () => {
      blurred = true;
    },
    onVisibility = () => {
      hidden ||= document.hidden;
    };
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  const check = () => {
    if (blurred || hidden || loss || !document.hasFocus() || document.hidden)
      throw new Error(`Invalid foreground/GPU: blurred=${blurred}, hidden=${hidden}, loss=${loss}`);
  };
  const runs: PerformanceRun[] = [],
    physicsRuns = [];
  try {
    check();
    await raf();
    world?.dispose();
    world = undefined;
    obstacleMeshes.splice(0).forEach((mesh) => mesh.dispose());
    visualBox(0, 1, 32, 40, 2, 1);
    visualBox(-12, 1, 16, 1, 2, 40);
    visualBox(12, 1, 16, 1, 2, 40);
    const hardware = await fetch('/hardware.json').then((r) => r.json());
    const buildManifest = await fetch('/build-manifest.json').then((r) => r.json());
    const coldLoad = [],
      warmLoad = [];
    for (let repeat = 1; repeat <= 5; repeat++)
      for (const enabled of repeat % 2 ? [false, true] : [true, false]) {
        const startInit = performance.now();
        const fixture = await manyContacts();
        world = fixture.world;
        if (!enabled)
          coldLoad.push({
            repeat,
            physicsInitializationMs: performance.now() - startInit,
            context:
              'Fresh physics world, module/WASM cache already warm from calibration; not cold network',
          });
        const first = performance.now();
        world.step(fixture.inputs);
        draw(world, 70, true);
        backend.render();
        if (!enabled)
          warmLoad.push({ repeat, firstPhysicsAndVisualUseMs: performance.now() - first });
        const collector = createPerformanceCollector(60000, enabled);
        const cpu = new Float64Array(60000),
          frames = new Float64Array(60000);
        const costs = Array.from({ length: 4 }, () => new Float64Array(12000));
        let ticks = 0,
          measured = false;
        const loop = createFixedTickLoop({
          captureSnapshot: () => ({ tick: ticks }),
          interpolate: (_, current) => current,
          step: () => {
            const cost = world!.step(fixture.inputs, true);
            if (measured) {
              if (ticks >= 12000) throw new Error('Physics sample capacity');
              costs[0][ticks] = cost.stepMs;
              costs[1][ticks] = cost.controllerMs;
              costs[2][ticks] = cost.queryMs;
              costs[3][ticks] = cost.bridgeMs;
              ticks++;
              collector.record('tickCpuMs', cost.totalMs);
            }
          },
        });
        let now = await raf();
        loop.frame(now);
        const warmStart = now;
        el('status').textContent =
          `Repeat ${repeat}/5 · observer=${enabled} · warmup${smoke ? 1 : 30}s + measure${smoke ? 3 : 120}s. Păstrează focusul.`;
        while (now - warmStart < (smoke ? 1000 : 30000)) {
          now = await raf();
          check();
          loop.frame(now);
          draw(world, 70, true);
          backend.render();
        }
        const warmState = loop.getState(),
          actualWarmupMs = now - warmStart;
        measured = true;
        let count = 0,
          previous = now,
          maxContacts = 0,
          minContacts = Infinity,
          samplesContacts = 0,
          previousContact = now;
        const began = now,
          wallStart = performance.now();
        let longCount = 0,
          longMax = 0;
        const longSupported = PerformanceObserver.supportedEntryTypes.includes('longtask');
        const processLong = (entries: readonly PerformanceEntry[]) => {
          for (const entry of entries) {
            if (entry.startTime >= began) {
              longCount++;
              longMax = Math.max(longMax, entry.duration);
            }
          }
        };
        const observer = longSupported
          ? new PerformanceObserver((list) => processLong(list.getEntries()))
          : null;
        observer?.observe({ type: 'longtask', buffered: false });
        do {
          now = await raf();
          check();
          if (count >= 60000) throw new Error('Frame capacity');
          const start = performance.now();
          const state = loop.frame(now).state;
          const simMs = performance.now() - start;
          draw(world, 70, true);
          backend.render();
          if (now - previousContact >= 1000) {
            const contacts = world.contacts();
            maxContacts = Math.max(maxContacts, contacts);
            minContacts = Math.min(minContacts, contacts);
            samplesContacts++;
            previousContact = now;
          }
          collector.record('simulationCpuMs', simMs);
          collector.record('frameMs', now - previous);
          collector.record('mainThreadMs', performance.now() - start);
          collector.record('debtMs', state.debtSeconds * 1000);
          cpu[count] = performance.now() - start;
          frames[count] = now - previous;
          count++;
          previous = now;
        } while (now - began < (smoke ? 3000 : 120000));
        measured = false;
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (observer) processLong(observer.takeRecords());
        observer?.disconnect();
        check();
        const wallDurationMs = performance.now() - wallStart,
          state = loop.getState(),
          counts = world.counts();
        const simSeconds = state.simulatedSeconds - warmState.simulatedSeconds,
          admitted = state.activeRealSeconds - warmState.activeRealSeconds;
        physicsRuns.push({
          repeat,
          enabled,
          costs: {
            step: distribution(costs[0], ticks, 3),
            controller: distribution(costs[1], ticks),
            query: distribution(costs[2], ticks),
            bridgeReadback: distribution(costs[3], ticks),
          },
          ticks,
          queryCountPerTick: 70,
          representativeBridgeCallsPerTick: 70 * 23,
          maxContacts,
          minContacts: samplesContacts ? minContacts : null,
          samplesContacts,
          counts,
        });
        runs.push({
          repeat,
          seed: 42,
          enabled,
          warmupMs: actualWarmupMs,
          activeDurationMs: now - began,
          wallDurationMs,
          collector: collector.finish({ frameMs: 18.5, mainThreadMs: 10, tickCpuMs: 5.5 }),
          referenceCpuMs: distribution(cpu, count, 10)!,
          referenceFrameMs: distribution(frames, count, 18.5),
          simulation: {
            clock: 'real-raf',
            measuredWallSeconds: wallDurationMs / 1000,
            simulatedSeconds: simSeconds,
            admittedClockSeconds: admitted,
            ratio: simSeconds / admitted,
            tick: state.tick - warmState.tick,
            overloads: state.overloadCount - warmState.overloadCount,
          },
          resources: {
            ...counts,
            exactPageMemoryBytes: null,
            exactWasmBytes: null,
            ownedWasmAdmissionEstimateBytes: PHYSICS_CONFIG.ownedWasmEstimateBytes,
            commonReferenceBuffersBytes:
              cpu.byteLength +
              frames.byteLength +
              costs.reduce((sum, array) => sum + array.byteLength, 0),
          },
          longTasks: {
            supported: longSupported,
            count: longSupported ? longCount : null,
            maximumMs: longSupported ? longMax : null,
            overflow: longCount > 1024,
          },
        });
        loop.dispose();
        world.dispose();
        world = undefined;
      }
    const report = createPerformanceReport({
      role: 'hardware-browser',
      identity: {
        ...__HARNESS_BUILD__,
        fixtureVersion: `021-many-contact-v1${smoke ? '-SMOKE' : ''}`,
        physicsVersion: '0.21.0',
        mapVersion: null,
        seeds: [42],
        hardware: {
          ...hardware,
          buildManifest,
          gpuInfo:
            'getInfo' in backend.scene.getEngine()
              ? (backend.scene.getEngine() as unknown as { getInfo(): unknown }).getInfo()
              : null,
        },
        browser: navigator.userAgent,
        backend: backend.rendererKind,
        preset: 'MEDIUM prototype simplified cars, fixed1920x1080, no shadows',
        cssResolution: [1920, 1080],
        internalResolution: [1920, 1080],
        devicePixelRatio,
        cache: 'HTTP no-store; WASM module warm; OS/driver uncontrolled',
        network: 'local unthrottled',
        powerState: String(hardware.powerScheme),
      },
      scope:
        '70 raycast cars +64 dynamic debris +3 barriers +ground. All cars/controllers simulated. Paired optional218 collector on/off; common physics cost observer active in both.',
      coldLoad,
      warmLoad,
      runs,
      unavailable: {
        gpu: 'GPU timer not measured; no zero inferred',
        memory:
          'Exact WASM/page allocator size not exposed through public adapter; estimate is admission accounting only',
        gameplay: 'No AI/campaign/learning; 220 and later gates required',
        laptop: 'Desktop scope only; not a laptop pass',
      },
      exclusions: [
        'No controlled cold network or cache',
        'Simplified box bodies and tire raycast model; no full pneumatic tire simulation',
        'Physics projection/rendering/contact observer included in frame/main-thread cost; per-tick cost excludes projection',
      ],
    });
    Object.assign(window, {
      physicsReport: { ...report, physicsRuns, physicsConfig: PHYSICS_CONFIG },
    });
    const saved = await fetch('/export', {
      method: 'POST',
      body: JSON.stringify({ ...report, physicsRuns, physicsConfig: PHYSICS_CONFIG }),
    }).then((r) => r.text());
    el('status').textContent = `Complet. ${saved}`;
  } catch (error) {
    Object.assign(window, { physicsError: String(error) });
    el('status').textContent = String(error);
  } finally {
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    running = false;
    resetRequested = true;
  }
}
el('smoke').addEventListener('click', () => {
  void benchmark(true);
});
el('full').addEventListener('click', () => {
  void benchmark(false);
});
void manual();
