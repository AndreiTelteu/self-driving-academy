import '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import { GetEnvironmentBRDFTexture } from '@babylonjs/core/Misc/brdfTextureTools';
import { createRenderingBackend } from '../../../src/rendering/babylon/backend';
import { subscribeRenderingLoss } from '../../../src/rendering/babylon/recovery-session';
import { createDaylight } from '../../../src/rendering/babylon/daylight';
import { BabylonCellBatches } from '../../../src/rendering/babylon/cell-batches';
import { VehiclePickingRegistry } from '../../../src/rendering/babylon/vehicle-picking-registry';
import { BabylonVehiclePicker } from '../../../src/rendering/babylon/vehicle-picking';
import { BabylonAssetRegistry } from '../../../src/rendering/babylon/asset-registry';
import { analyzeRegistryGlb } from '../../../src/rendering/babylon/asset-contract';
import {
  checkAssetManifest,
  checkAssetUsage,
  RENDER_ASSET_CAPS,
  checkRenderingCounters,
} from '../../../src/rendering/asset-budgets';
import { distribution } from '../../../src/telemetry/performance';
import { triangleGlb } from '../asset-registry/glb-fixture';
import type { BackendPreference } from '../../../src/rendering';

declare const __RENDER_BUILD__: {
  commit: string;
  sourceHash: string;
  budgetVersion: string;
  engineVersion: string;
};
const element = (id: string) => document.getElementById(id)!;
const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const summarize = (samples: number[]) => distribution(new Float64Array(samples), samples.length);
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function resources(scene: Scene) {
  return {
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    geometries: scene.geometries.length,
    textures: scene.textures.length,
    lights: scene.lights.length,
    nodes: scene.transformNodes.length,
  };
}
const authority = Object.freeze({
  vehicleCount: 70,
  taxis: 30,
  civilians: 40,
  physicsHz: 60,
  learningVersion: 3,
  revenue: 2500,
  xp: 200,
  dt: 1 / 60,
});
const authorityJson = JSON.stringify(authority);
let busy = false;
export async function runRenderBudgetProbe(preference: BackendPreference, smoke = false) {
  if (busy) throw new Error('Probe already running');
  busy = true;
  const runs: unknown[] = [];
  const functional: unknown[] = [];
  const loading: unknown[] = [];
  const longTasksSupported = PerformanceObserver.supportedEntryTypes.includes('longtask');
  let longTaskStart = Infinity;
  let longTaskDurations: number[] = [];
  let longTaskDropped = 0;
  const collectLongTasks = (entries: PerformanceEntry[]) => {
    for (const entry of entries)
      if (entry.startTime >= longTaskStart) {
        if (longTaskDurations.length < 512) longTaskDurations.push(entry.duration);
        else longTaskDropped++;
      }
  };
  const longTaskObserver = longTasksSupported
    ? new PerformanceObserver((list) => collectLongTasks(list.getEntries()))
    : null;
  longTaskObserver?.observe({ type: 'longtask' });
  let backend: Awaited<ReturnType<typeof createRenderingBackend>> | undefined;
  let lost: unknown = null;
  let releaseLoss: (() => void) | undefined;
  const check = () =>
    assert(
      !document.hidden && document.hasFocus() && !lost,
      'Probe lost foreground/focus/GPU context',
    );
  try {
    check();
    const hardware = await fetch('/hardware.json').then((r) => r.json());
    const manifest = await fetch('/build-manifest.json').then((r) => r.json());
    assert(manifest.sourceHash === __RENDER_BUILD__.sourceHash, 'Build identity mismatch');
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    element('host').replaceChildren(canvas);
    backend = await createRenderingBackend(canvas, preference);
    releaseLoss = subscribeRenderingLoss(backend, (reason) => {
      lost = reason;
    });
    assert(backend.rendererKind === preference, 'Requested backend not obtained');
    const { scene } = backend;
    const engine = scene.getEngine();
    const camera = scene.activeCamera as FreeCamera;
    camera.position.set(0, 16, -50);
    camera.setTarget(new Vector3(0, 1, 10));
    scene.defaultMaterial.name = 'fixture-default';
    // Scene-owned lazy PBR lookup is not an asset-registry leak; establish it before ownership baseline.
    GetEnvironmentBRDFTexture(scene);
    const sceneBefore = resources(scene);
    const daylight = createDaylight(
      scene,
      { preset: 'MEDIUM', preferredBackend: preference, resolutionScale: 1, adaptive: false },
      { width: 1920, height: 1080, dpr: 1 },
    );
    const instrumentation = new SceneInstrumentation(scene);
    const picking = new VehiclePickingRegistry(scene);
    const picker = new BabylonVehiclePicker(scene, picking);
    const road = CreateBox('road', { width: 25, height: 0.1, depth: 80 }, scene);
    road.position.y = -0.1;
    road.material = daylight.material('road');
    road.isPickable = false;
    const vehicle = CreateBox('vehicle-source', { width: 1.8, height: 1.2, depth: 3.5 }, scene);
    vehicle.material = daylight.material('vehicle');
    vehicle.setEnabled(false);
    const distantVehicle = CreateBox('vehicle-lod', { width: 1.8, height: 1.2, depth: 3.5 }, scene);
    distantVehicle.material = vehicle.material;
    distantVehicle.setEnabled(false);
    const building = CreateSphere('building-source', { segments: 8, diameter: 8 }, scene);
    building.material = daylight.material('signalHousing');
    building.setEnabled(false);
    const distantBuilding = CreateBox('building-lod', { size: 8 }, scene);
    distantBuilding.material = building.material;
    distantBuilding.setEnabled(false);
    const signal = CreateBox('live-signal', { size: 0.8 }, scene);
    signal.position.set(-12, 3, 12);
    signal.material = daylight.material('red');
    const allDecor = Array.from({ length: 16 }, (_, cell) =>
      Array.from({ length: 64 }, (_, n) => ({
        entityId: null,
        matrix: Matrix.Translation(
          ((cell % 4) - 1) * 240 + (n % 8) * 12,
          4,
          60 + Math.floor(cell / 4) * 240 + Math.floor(n / 8) * 12,
        ),
      })),
    );
    const carInstances = (time: number) =>
      Array.from({ length: 70 }, (_, i) => ({
        entityId: `vehicle-${i}`,
        matrix: Matrix.Translation(
          ((i % 7) - 3) * 3,
          0.6,
          Math.floor(i / 7) * 6 + Math.sin(time / 1000) * 2,
        ),
      }));
    const project = (position: Vector3) => {
      const point = Vector3.Project(
        position,
        Matrix.Identity(),
        scene.getTransformMatrix(),
        camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
      );
      return picker.pick(point.x, point.y)?.entityId ?? null;
    };
    const loadBytes = triangleGlb(true),
      analysis = analyzeRegistryGlb(loadBytes);
    const assetBudget = {
      id: 'triangle',
      firstRide: true,
      transferBytes: loadBytes.length,
      geometryGpuBytes: analysis.geometryGpuBytes,
      textureGpuBytes: analysis.textureGpuBytes,
      shaderVariants: 2,
    };
    const blob = URL.createObjectURL(
      new Blob([loadBytes.buffer as ArrayBuffer], { type: 'model/gltf-binary' }),
    );
    const assetManifest = {
      version: '223-core-fixture-v1',
      criticalCodeTransferBytes: manifest.criticalCodeTransferBytes,
      decoderWasmBytes: 0,
      decoderWorkspaceBytes: 0,
      assets: [assetBudget],
    };
    assert(
      checkAssetManifest(assetManifest, 'MEDIUM').accepted,
      'Actual fixture manifest over budget',
    );
    const oversized = checkAssetManifest(
      {
        ...assetManifest,
        assets: [{ ...assetBudget, textureGpuBytes: RENDER_ASSET_CAPS.textureGpuBytes.MEDIUM + 1 }],
      },
      'MEDIUM',
    );
    assert(!oversized.accepted, 'Oversized manifest admitted');
    for (let repeat = 0; repeat < 5; repeat++) {
      const registry = new BabylonAssetRegistry(scene, [
        {
          id: 'triangle',
          version: '1',
          url: blob,
          critical: true,
          source: 'original',
          license: 'CC0',
          budget: assetBudget,
        },
      ]);
      const started = performance.now(),
        cold = await registry.acquire('triangle');
      const coldMs = performance.now() - started;
      cold.root.position.set(0, 2, -4);
      const first = performance.now();
      backend.render();
      const firstUseMs = performance.now() - first;
      cold.release();
      const warmStart = performance.now(),
        warm = await registry.acquire('triangle');
      const warmMs = performance.now() - warmStart;
      warm.release();
      const report = registry.metrics.reports[0]!;
      loading.push({
        repeat: repeat + 1,
        coldMs,
        warmMs,
        firstUseMs,
        ...report,
        diagnostics: checkAssetUsage(assetBudget, {
          transferBytes: report.transferBytes,
          geometryGpuBytes: report.geometryGpuBytes,
          textureGpuBytes: report.textureGpuBytes,
          decodeMs: report.decodeUploadMs,
          shaderPrepareMs: report.shaderPrepareMs,
          firstUseMs,
        }),
      });
      registry.clearIdle();
      assert(
        registry.metrics.instances === 0 && registry.metrics.cacheEntries === 0,
        'Asset resources retained',
      );
      registry.dispose();
    }
    const rejectedRegistry = new BabylonAssetRegistry(scene, [
      {
        id: 'triangle',
        version: '1',
        url: blob,
        critical: true,
        source: 'original',
        license: 'CC0',
        budget: { ...assetBudget, geometryGpuBytes: 0 },
      },
    ]);
    let admissionError: string | null = null;
    try {
      await rejectedRegistry.acquire('triangle');
    } catch (error) {
      admissionError = String(error);
    }
    assert(
      admissionError?.includes('budget') && rejectedRegistry.metrics.decodeLoads === 0,
      'Actual over-budget asset reached decode',
    );
    const rejectedAsset = {
      error: admissionError,
      decodeLoads: rejectedRegistry.metrics.decodeLoads,
      reports: rejectedRegistry.metrics.reports,
    };
    rejectedRegistry.dispose();
    URL.revokeObjectURL(blob);
    const base = resources(scene);
    // Alternate baseline/optimized in five pairs to avoid a single long sequential arm
    // confounding thermal or background drift with the presentation change.
    const cases = [
      ...Array.from({ length: 5 }, (_, index) =>
        (['global-normal', 'local-thin'] as const).map((mode) => ({ mode, repeats: [index + 1] })),
      ).flat(),
      ...(['local-normal', 'global-thin'] as const).map((mode) => ({
        mode,
        repeats: [1, 2, 3, 4, 5],
      })),
    ];
    for (const { mode, repeats } of cases) {
      const batches = new BabylonCellBatches(scene, picking);
      const direct: Mesh[] = [],
        normal: InstancedMesh[] = [];
      if (mode.startsWith('local')) {
        allDecor.forEach((instances, cell) =>
          batches.add({
            id: `decor-${cell}`,
            cell: `${cell % 4}:${Math.floor(cell / 4)}`,
            source: building,
            // Comparative arms retain the same geometry; LOD switching is verified
            // by identity/enable state, without changing the primitive workload.
            distantSource: building,
            dynamic: false,
            staticMaterial: true,
            instances,
          }),
        );
      } else {
        const host = building.clone('global-decor', null, true)!;
        host.setEnabled(true);
        host.thinInstanceSetBuffer(
          'matrix',
          new Float32Array(allDecor.flat().flatMap((i) => Array.from(i.matrix.m))),
          16,
          true,
        );
        host.thinInstanceRefreshBoundingInfo(true);
        direct.push(host);
      }
      if (mode.endsWith('thin')) {
        for (let group = 0; group < 5; group++)
          batches.add({
            id: `cars-${group}`,
            cell: `dynamic-${group}`,
            source: vehicle,
            distantSource: distantVehicle,
            dynamic: true,
            instances: carInstances(0).slice(group * 14, group * 14 + 14),
          });
      } else {
        for (let i = 0; i < 70; i++) {
          const instance = vehicle.createInstance(`normal-${i}`);
          instance.setEnabled(true);
          picking.register(instance, `vehicle-${i}`);
          normal.push(instance);
        }
      }
      const update = (time: number) => {
        const cars = carInstances(time);
        if (mode.endsWith('thin'))
          for (let group = 0; group < 5; group++)
            batches.updateTransforms(
              `cars-${group}`,
              cars.slice(group * 14, group * 14 + 14).map((car) => car.matrix),
            );
        else cars.forEach((car, i) => normal[i].position.copyFrom(car.matrix.getTranslation()));
        batches.updateLod(camera.position, 'MEDIUM');
        signal.material = daylight.material(Math.floor(time / 1000) % 2 === 0 ? 'red' : 'green');
      };
      const spawnStarted = performance.now();
      update(0);
      await scene.whenReadyAsync();
      const spawnPrepareMs = performance.now() - spawnStarted;
      const firstRenderStarted = performance.now();
      backend.render();
      const firstRenderCpuMs = performance.now() - firstRenderStarted;
      const pickNear = project(new Vector3(-9, 0.6, 0));
      assert(pickNear === 'vehicle-0', `${mode} near picking ${pickNear}`);
      let remapPick: string | null = null,
        removalPick: string | null = null;
      if (mode.endsWith('thin')) {
        const original = carInstances(0).slice(0, 14),
          reordered = [...original].reverse();
        batches.update('cars-0', reordered);
        backend.render();
        remapPick = project(new Vector3(-9, 0.6, 0));
        assert(remapPick === 'vehicle-0', `${mode} same-count remap`);
        batches.update('cars-0', reordered.slice(1));
        backend.render();
        removalPick = project(new Vector3(-9, 0.6, 0));
        assert(removalPick === 'vehicle-0', `${mode} removal remap`);
        batches.update('cars-0', original);
        backend.render();
      }
      update(1000);
      backend.render();
      const pickMoving = project(new Vector3(-9, 0.6, Math.sin(1) * 2));
      assert(pickMoving === 'vehicle-0', `${mode} moving picking ${pickMoving}`);
      const savedCamera = camera.position.clone();
      camera.position.set(-9, 8, -110);
      camera.setTarget(new Vector3(-9, 0.6, 0));
      batches.updateLod(camera.position, 'LOW');
      backend.render();
      const distant = project(new Vector3(-9, 0.6, Math.sin(1) * 2));
      assert(distant === 'vehicle-0', `${mode} distant picking ${distant}`);
      camera.position.copyFrom(savedCamera);
      camera.setTarget(new Vector3(0, 1, 10));
      update(0);
      backend.render();
      daylight.applyPreferences({
        preset: 'LOW',
        preferredBackend: preference,
        resolutionScale: 0.5,
        adaptive: false,
      });
      backend.render();
      const lowQuality = daylight.getQuality();
      assert(
        lowQuality.internalWidth === 960 && lowQuality.internalHeight === 540,
        'Quality resolution not applied',
      );
      assert(project(new Vector3(-9, 0.6, 0)) === 'vehicle-0', `${mode} quality-change picking`);
      daylight.applyPreferences({
        preset: 'MEDIUM',
        preferredBackend: preference,
        resolutionScale: 1,
        adaptive: false,
      });
      backend.render();
      assert(JSON.stringify(authority) === authorityJson, 'Manual quality changed authority');
      functional.push({
        mode,
        pickNear,
        pickMoving,
        distant,
        remapPick,
        removalPick,
        signalMutable: !signal.isWorldMatrixFrozen && !daylight.material('green').isFrozen,
        qualitySwitch: {
          low: lowQuality,
          restored: daylight.getQuality(),
          authorityUnchanged: JSON.stringify(authority) === authorityJson,
        },
        spawnPrepareMs,
        firstRenderCpuMs,
        counts: resources(scene),
        batches: batches.metrics,
      });
      for (const repeat of repeats) {
        check();
        element('status').textContent =
          `${preference} ${mode} ${repeat}/5 ${smoke ? 'SMOKE' : 'FULL'} warmup`;
        const main = mode === 'global-normal' || mode === 'local-thin';
        const warmup = smoke ? 100 : main ? 30000 : 1000,
          duration = smoke ? 500 : main ? 120000 : 3000;
        let start = performance.now();
        Object.assign(window, {
          renderBudgetProgress: {
            backend: preference,
            mode,
            repeat,
            phase: 'warmup',
            startedAt: new Date().toISOString(),
            warmupMs: warmup,
            durationMs: duration,
          },
        });
        while (performance.now() - start < warmup) {
          await frame();
          check();
          update(0);
          backend.render();
        }
        const cpu: number[] = [],
          intervals: number[] = [],
          drawCalls: number[] = [],
          activeMeshes: number[] = [];
        start = performance.now();
        longTaskStart = start;
        longTaskDurations = [];
        longTaskDropped = 0;
        let lastProgress = start;
        Object.assign(window, {
          renderBudgetProgress: {
            backend: preference,
            mode,
            repeat,
            phase: 'measuring',
            durationMs: duration,
            elapsedMs: 0,
          },
        });
        let previous = await frame();
        while (performance.now() - start < duration) {
          const now = await frame();
          check();
          intervals.push(now - previous);
          previous = now;
          const began = performance.now();
          update(now - start);
          backend.render();
          cpu.push(performance.now() - began);
          drawCalls.push(instrumentation.drawCallsCounter.current);
          activeMeshes.push(scene.getActiveMeshes().length);
          assert(cpu.length <= 30000, 'Fixture sample capacity');
          if (now - lastProgress >= 1000) {
            lastProgress = now;
            Object.assign(window, {
              renderBudgetProgress: {
                backend: preference,
                mode,
                repeat,
                phase: 'measuring',
                durationMs: duration,
                elapsedMs: now - start,
                samples: cpu.length,
              },
            });
            element('status').textContent =
              `${preference} ${mode} ${repeat}/5 ${smoke ? 'SMOKE' : 'FULL'} ${Math.round((now - start) / 1000)}s/${duration / 1000}s`;
          }
        }
        collectLongTasks(longTaskObserver?.takeRecords() ?? []);
        longTaskStart = Infinity;
        const owned = resources(scene);
        const counters = {
          drawCalls: Math.max(...drawCalls),
          babylonObjects: Object.values(owned).reduce((n, v) => n + v, 0),
          matrixBufferBytes:
            batches.metrics.matrixBufferBytes + (mode.startsWith('global') ? 1024 * 16 * 4 : 0),
        };
        runs.push({
          mode,
          role: smoke ? 'SMOKE' : main ? 'STEADY_STATE' : 'ISOLATED_AUXILIARY',
          repeat,
          warmupMs: warmup,
          measuredMs: performance.now() - start,
          frame: summarize(intervals),
          mainThread: summarize(cpu),
          drawCalls: summarize(drawCalls),
          activeMeshes: summarize(activeMeshes),
          gpuMs: null,
          resources: resources(scene),
          trackedCounters: counters,
          diagnostics: checkRenderingCounters(counters),
          longTasks: {
            available: longTasksSupported,
            durationsMs: longTasksSupported ? [...longTaskDurations] : null,
            maxMs: longTasksSupported ? Math.max(0, ...longTaskDurations) : null,
            dropped: longTaskDropped,
          },
          quality: daylight.getQuality(),
          authorityUnchanged: JSON.stringify(authority) === authorityJson,
        });
      }
      for (const instance of normal) {
        picking.unregister(instance);
        instance.dispose();
      }
      for (const mesh of direct) mesh.dispose(false, false);
      batches.dispose();
      assert(
        JSON.stringify(resources(scene)) === JSON.stringify(base),
        `${mode} cleanup did not plateau`,
      );
    }
    const cycles: unknown[] = [];
    for (let cycle = 0; cycle < 20; cycle++) {
      const batches = new BabylonCellBatches(scene, picking);
      batches.add({
        id: 'cycle',
        cell: '0:0',
        source: vehicle,
        distantSource: distantVehicle,
        dynamic: true,
        instances: carInstances(0),
      });
      batches.update('cycle', [...carInstances(1000)].reverse().slice(1));
      batches.updateLod(new Vector3(0, 0, -1000), 'LOW');
      backend.render();
      batches.dispose();
      assert(JSON.stringify(resources(scene)) === JSON.stringify(base), 'Lifecycle retention');
      cycles.push(resources(scene));
    }
    daylight.applyPreferences({
      preset: 'MEDIUM',
      preferredBackend: preference,
      resolutionScale: 1,
      adaptive: true,
    });
    let clock = performance.now();
    const beforeQuality = daylight.getQuality();
    for (let i = 0; i < 60; i++) {
      clock += 16;
      daylight.observe({ frameMs: 30, cpuMs: 2, gpuMs: 20 }, clock);
    }
    const downgraded = daylight.getQuality();
    assert(downgraded.preset === 'LOW', 'Adaptation did not downgrade');
    const adaptCounters = resources(scene);
    for (let i = 0; i < 120; i++) {
      clock += 50;
      daylight.observe({ frameMs: 10, cpuMs: 2, gpuMs: 2 }, clock);
    }
    const upgraded = daylight.getQuality();
    assert(upgraded.preset === 'MEDIUM', 'Adaptation did not upgrade');
    assert(JSON.stringify(authority) === authorityJson, 'Quality changed authority');
    const adaptation = {
      samples:
        'Synthetic GPU-bound/hysteresis controller input; functional proof, not measured GPU timing',
      beforeQuality,
      downgraded,
      upgraded,
      adaptCounters,
      authority,
    };
    picker.dispose();
    picking.dispose();
    instrumentation.dispose();
    for (const mesh of [road, vehicle, distantVehicle, building, distantBuilding, signal])
      mesh.dispose(false, false);
    daylight.dispose();
    assert(
      JSON.stringify(resources(scene)) === JSON.stringify(sceneBefore),
      'Final resources did not return',
    );
    const info =
      'getInfo' in engine ? (engine as typeof engine & { getInfo(): unknown }).getInfo() : null;
    const report = {
      schemaVersion: 1,
      identity: __RENDER_BUILD__,
      fixtureVersion: `223-render-assets-v1${smoke ? '-SMOKE' : ''}`,
      capturedAt: new Date().toISOString(),
      backend: backend.rendererKind,
      hardware,
      browser: navigator.userAgent,
      gpuInfo: info,
      devicePixelRatio,
      cssResolution: [backend.canvas.clientWidth, backend.canvas.clientHeight],
      runs,
      functional,
      loading,
      oversized,
      rejectedAsset,
      adaptation,
      cycles,
      cleanup: { before: sceneBefore, after: resources(scene) },
      manifest: assetManifest,
      protocol: {
        foreground: true,
        production: true,
        inspector: false,
        network:
          'Blob original GLB; unthrottled local; HTTP/OS/driver shader caches uncontrolled; registry cold vs warm separately',
        scope:
          'Early presentation fixture:1024 static objects and70 visual projections. No claim of full physical fleet/gameplay/laptop gate.',
        gpu: 'exact timing and memory unavailable; CPU submission and estimated resource bytes separate',
        provisional: true,
      },
    };
    const exported = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    assert(exported.ok, `Report export failed: ${exported.status}`);
    element('result').textContent = JSON.stringify(report, null, 2);
    element('status').textContent = `${preference} ${smoke ? 'SMOKE' : 'FULL'} complete`;
    Object.assign(window, { renderBudgetReport: report });
    Object.assign(window, { renderBudgetProgress: { backend: preference, phase: 'complete' } });
    return report;
  } catch (error) {
    element('status').textContent = String(error);
    Object.assign(window, { renderBudgetError: String(error) });
    throw error;
  } finally {
    longTaskObserver?.disconnect();
    releaseLoss?.();
    backend?.dispose();
    busy = false;
  }
}
Object.assign(window, { runRenderBudgetProbe });
for (const [id, preference, smoke] of [
  ['webgpu', 'WEBGPU', false],
  ['webgl2', 'WEBGL2', false],
  ['smoke-gpu', 'WEBGPU', true],
  ['smoke-gl', 'WEBGL2', true],
] as const)
  element(id).addEventListener('click', () => {
    void runRenderBudgetProbe(preference, smoke);
  });
