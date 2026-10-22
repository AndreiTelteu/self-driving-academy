/**
 * PBI 145 presentation probe.
 *
 * The page renders the real Babylon backend with two vehicle classes, four wheel pivots each, the
 * merged material groups and the three LOD levels on 24 animated instances. It measures declared vs
 * rendered geometry, first use (shader preparation + first render), draw calls per LOD and the frame
 * distribution, then exports one bounded JSON report. It never mutates simulation state.
 */
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation.js';
import { createRenderingBackend, createVehicleVisualStage } from '../../../src/rendering/babylon';
import {
  buildVehicleGeometry,
  selectVehicleLod,
  vehicleAssetBudget,
  vehicleAssetInventory,
  vehicleAssetManifest,
  vehicleVisualAlignment,
  vehicleVisualClass,
} from '../../../src/rendering';
import type { VehicleLodLevel } from '../../../src/rendering';
import { VEHICLE_CLASSES } from '../../../src/vehicles';

declare const __VEHICLE_ASSET_BUILD__: Readonly<Record<string, unknown>>;

const status = document.querySelector<HTMLElement>('#status')!;
const panel = document.querySelector<HTMLElement>('#panel')!;
const canvas = document.querySelector<HTMLCanvasElement>('#host')!;
const params = new URLSearchParams(location.search);
if (params.has('quiet')) panel.hidden = true;
const preset = 'MEDIUM' as const;
const VEHICLES = 24;
const WARMUP_FRAMES = 60;
const MEASURED_FRAMES = 300;

function fail(error: unknown): void {
  status.dataset.state = 'error';
  status.textContent = `Eroare: ${error instanceof Error ? error.message : String(error)}`;
}

function transform(x: number, z: number, heading: number) {
  const half = heading / 2;
  return Object.freeze({
    positionM: Object.freeze({ x, y: 0.8, z }),
    rotationQuaternion: Object.freeze({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }),
  });
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

async function start(): Promise<void> {
  canvas.width = 1280;
  canvas.height = 720;
  const backend = await createRenderingBackend(canvas, 'WEBGL2');
  const scene = backend.scene;
  backend.resize();
  scene.clearColor = new Color4(0.58, 0.72, 0.84, 1);
  new HemisphericLight('hemi', new Vector3(0.2, 1, -0.1), scene).intensity = 0.95;
  const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.35), scene);
  sun.intensity = 1.1;
  const groundMaterial = new StandardMaterial('ground', scene);
  groundMaterial.diffuseColor = new Color3(0.24, 0.27, 0.22);
  groundMaterial.specularColor = Color3.Black();
  const ground = MeshBuilder.CreateGround('ground', { width: 400, height: 400 }, scene);
  ground.material = groundMaterial;
  const roadMaterial = new StandardMaterial('road', scene);
  roadMaterial.diffuseColor = new Color3(0.11, 0.12, 0.14);
  roadMaterial.specularColor = Color3.Black();
  const road = MeshBuilder.CreateGround('road', { width: 14, height: 320 }, scene);
  road.position.y = 0.01;
  road.material = roadMaterial;

  const stage = createVehicleVisualStage(scene, { preset });
  const vehicles = [] as { entityId: string; classId: 'sedan' | 'compact'; x: number; z: number }[];
  for (let index = 0; index < VEHICLES; index += 1) {
    const classId = index % 2 === 0 ? 'sedan' : 'compact';
    const column = index % 2 === 0 ? -2.6 : 2.6;
    const row = Math.floor(index / 2);
    const x = column;
    const z = row * 7 - 40;
    const entityId = `taxi:${String(index + 1).padStart(2, '0')}`;
    stage.create(entityId, classId, transform(x, z, 0));
    vehicles.push({ entityId, classId, x, z });
  }
  const camera = scene.activeCamera as FreeCamera;
  const views: Record<string, { position: Vector3; target: Vector3 }> = {
    near: { position: new Vector3(-1.8, 1.9, -49), target: new Vector3(-2.6, 0.6, -40) },
    mid: { position: new Vector3(-2.5, 4.5, -100), target: new Vector3(-2.6, 0.6, -40) },
    far: { position: new Vector3(-3, 14, -200), target: new Vector3(-2.6, 0.6, -40) },
    overview: { position: new Vector3(24, 18, -95), target: new Vector3(0, 0.5, -35) },
    side: { position: new Vector3(8, 1.4, -40), target: new Vector3(-2.6, 0.6, -40) },
  };
  function setView(name: keyof typeof views): void {
    const view = views[name] ?? views.overview!;
    camera.position.copyFrom(view.position);
    camera.setTarget(view.target);
    stage.updateLod(camera.position, preset);
    backend.render();
  }
  setView('overview');
  const requestedView = params.get('view');
  if (requestedView && Object.hasOwn(views, requestedView))
    setView(requestedView as keyof typeof views);
  await scene.whenReadyAsync();
  for (let frame = 0; frame < 3; frame += 1) backend.render();

  // Animate the presentation only: translations, wheel spin/steer, lights and LOD selection.
  let animation = 0;
  function animate(step: number): void {
    animation += step;
    for (const [index, vehicle] of vehicles.entries()) {
      const representation = stage.get(vehicle.entityId);
      if (!representation) continue;
      const speed = 6 + (index % 5) * 1.5;
      const z = ((vehicle.z + animation * speed * 0.016 + 40) % 320) - 80;
      const heading = Math.sin(animation * 0.002 + index) * 0.12;
      representation.setTransform(transform(vehicle.x, z, heading));
      const steering = Math.sin(animation * 0.004 + index) * 0.28;
      const specification = vehicleVisualClass(vehicle.classId);
      representation.applyWheels(
        specification.wheelPivots.map((pivot) => ({
          wheelId: pivot.wheelId,
          transform: {
            positionM: { x: pivot.x, y: pivot.y, z: pivot.z },
            rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
          },
          spinRad: animation * 0.2,
          steeringRad: pivot.steering ? steering : 0,
        })),
      );
      if (index % 3 === 0)
        representation.setLights({
          headlights: true,
          brake: index % 6 === 0,
          turn: index % 4 === 0 ? 'LEFT' : 'OFF',
        });
    }
    stage.updateLod(camera.position, preset);
  }

  const instrumentation = new SceneInstrumentation(scene);
  const drawCalls = (): number => {
    backend.render();
    return instrumentation.drawCallsCounter.current;
  };

  const declared = vehicleAssetManifest().assets.map((asset) => ({ ...asset }));
  const inventory = vehicleAssetInventory();
  const budget = vehicleAssetBudget(preset);
  const alignment = vehicleVisualAlignment({
    sedan: VEHICLE_CLASSES.sedan.wheels,
    compact: VEHICLE_CLASSES.compact.wheels,
  });

  // First use: create one instance per class, prepare its materials, then time the first render.
  const firstUse: Record<string, unknown> = {};
  for (const classId of ['sedan', 'compact'] as const) {
    const entityId = `probe:${classId}`;
    const createStart = performance.now();
    const representation = stage.create(entityId, classId, transform(120, 0, 0));
    const createMs = performance.now() - createStart;
    const shaderStart = performance.now();
    let prepared = 0;
    for (const material of scene.materials.filter((entry) => entry.name.startsWith('vehicle:'))) {
      await material.forceCompilationAsync(representation.root.getChildMeshes()[0]);
      prepared += 1;
    }
    const shaderPrepareMs = performance.now() - shaderStart;
    const renderStart = performance.now();
    backend.render();
    const firstRenderMs = performance.now() - renderStart;
    const geometry = buildVehicleGeometry(classId, 'NEAR');
    const body = scene.meshes.find((mesh) => mesh.name === `vehicle:${entityId}:body`)!;
    const bodyGroup = geometry.groups.find((group) => group.group === 'BODY')!;
    const actual = {
      bodyVertices: body.getTotalVertices(),
      bodyIndices: body.getTotalIndices(),
      declaredBodyVertices: bodyGroup.positions.length / 3,
      declaredBodyIndices: bodyGroup.indices.length,
      declaredVertices: geometry.vertices,
      declaredIndices: geometry.indices,
      declaredBytes: geometry.gpuBytes,
    };
    firstUse[classId] = {
      createMs,
      shaderPrepareMs,
      firstRenderMs,
      preparedMaterials: prepared,
      actual,
      wheelMeshes: scene.meshes
        .filter((mesh) => mesh.name.startsWith(`vehicle:${entityId}:wheel:`))
        .map((mesh) => {
          const position = mesh.getAbsolutePosition();
          return { name: mesh.name, x: position.x, y: position.y, z: position.z };
        }),
      wheelPivots: representation.wheelPivots.map((pivot) => ({
        name: pivot.name,
        x: pivot.position.x,
        y: pivot.position.y,
        z: pivot.position.z,
      })),
    };
    stage.remove(entityId);
  }

  // LOD probe: fixed camera distances, draw calls, identity and picking stay stable.
  const lodProbe: {
    distanceM: number;
    lod: VehicleLodLevel;
    drawCalls: number;
    entityIdStable: boolean;
    pickedEntityId: string | null;
    pickCoordinates: readonly number[];
    wheelMeshVisible: boolean;
  }[] = [];
  const subjectId = 'taxi:01';
  const subject = stage.get(subjectId)!;
  const subjectBody = scene.meshes.find((mesh) => mesh.name === `vehicle:${subjectId}:body`)!;
  const bodyBefore = stage.entityIdFor(subjectBody);
  for (const distance of [8, 60, 160]) {
    const position = new Vector3(subject.root.position.x, 2.4, subject.root.position.z - distance);
    camera.position.copyFrom(position);
    camera.setTarget(new Vector3(subject.root.position.x, 0.7, subject.root.position.z));
    subject.setLod(selectVehicleLod(distance, null, preset));
    const calls = drawCalls();
    const engine = scene.getEngine();
    const pickX = engine.getRenderWidth() / 2;
    const pickY = engine.getRenderHeight() / 2;
    const picked = scene.pick(pickX, pickY, (mesh) =>
      mesh.name.startsWith(`vehicle:${subjectId}:`),
    );
    lodProbe.push({
      distanceM: distance,
      lod: subject.lod,
      drawCalls: calls,
      entityIdStable: stage.entityIdFor(subjectBody) === bodyBefore,
      pickedEntityId: picked?.pickedMesh ? (stage.entityIdFor(picked.pickedMesh) ?? null) : null,
      pickCoordinates: [pickX, pickY, engine.getRenderWidth(), engine.getRenderHeight()],
      wheelMeshVisible: subject.wheelMeshVisible('front-left'),
    });
  }

  // Frame distribution on 24 animated instances.
  setView('overview');
  const frameMs: number[] = [];
  let measuredDrawCalls = 0;
  const measure = async (): Promise<void> => {
    for (let frame = 0; frame < WARMUP_FRAMES; frame += 1) {
      animate(frame);
      backend.render();
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    for (let frame = 0; frame < MEASURED_FRAMES; frame += 1) {
      const before = performance.now();
      animate(frame);
      backend.render();
      frameMs.push(performance.now() - before);
      measuredDrawCalls = Math.max(measuredDrawCalls, instrumentation.drawCallsCounter.current);
      if (frame % 30 === 0)
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  };

  const run = async (): Promise<Record<string, unknown>> => {
    await measure();
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return {
      fixture: '145-vehicle-assets-v1',
      identity: __VEHICLE_ASSET_BUILD__,
      artifactHash: null,
      renderer: backend.rendererKind,
      gpuInfo:
        'getInfo' in scene.getEngine()
          ? (scene.getEngine() as unknown as { getInfo(): unknown }).getInfo()
          : null,
      browser: navigator.userAgent,
      preset,
      resolution: [canvas.width, canvas.height],
      dpr: devicePixelRatio,
      vehicles: VEHICLES,
      declared,
      inventory,
      budget: {
        accepted: budget.accepted,
        totals: budget.totals,
        diagnostics: budget.diagnostics,
      },
      alignment,
      firstUse,
      lodProbe,
      materials: { count: stage.metrics.materials, variants: stage.metrics.shaderVariants },
      frames: {
        metric: 'cpu-render-submission',
        note: 'tight render loop without vsync; hardware FPS budget is covered by the PBI 220 gate',
        warmup: WARMUP_FRAMES,
        measured: MEASURED_FRAMES,
        p50: percentile(frameMs, 0.5),
        p95: percentile(frameMs, 0.95),
        p99: percentile(frameMs, 0.99),
        max: Math.max(...frameMs),
        over25Ms: frameMs.filter((value) => value > 25).length,
        drawCalls: measuredDrawCalls,
        appDrawCalls: stage.metrics.drawCalls,
      },
      lodCounts: stage.metrics.lodCounts,
      memory: { usedJSHeapSize: memory?.usedJSHeapSize ?? null, exactGpuMemory: null },
      stage: stage.metrics,
    };
  };

  let running = !params.has('autorun');
  const freeze = (): void => {
    running = false;
    for (const vehicle of vehicles) {
      const representation = stage.get(vehicle.entityId);
      if (!representation) continue;
      representation.setTransform(transform(vehicle.x, vehicle.z, 0));
      const specification = vehicleVisualClass(vehicle.classId);
      representation.applyWheels(
        specification.wheelPivots.map((pivot) => ({
          wheelId: pivot.wheelId,
          transform: {
            positionM: { x: pivot.x, y: pivot.y, z: pivot.z },
            rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
          },
          spinRad: 0,
          steeringRad: 0,
        })),
      );
      representation.setLights({ headlights: true, brake: false, turn: 'OFF' });
    }
    backend.render();
  };
  Object.assign(window, {
    vehicleAssetsProbe: {
      stage,
      scene,
      backend,
      setView,
      freeze,
      run,
      export: async () => {
        const report = await run();
        const response = await fetch('/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(report),
        });
        if (!response.ok) throw new Error(`Export rejected: ${response.status}`);
        return report;
      },
    },
  });

  status.dataset.state = 'ready';
  status.textContent = `PBI 145 · ${backend.rendererKind} · ${VEHICLES} vehicles · ready`;
  if (params.has('autorun')) {
    const report = await (
      window as unknown as { vehicleAssetsProbe: { export(): Promise<Record<string, unknown>> } }
    ).vehicleAssetsProbe.export();
    panel.hidden = false;
    panel.textContent = JSON.stringify(report.frames, null, 2);
    status.textContent = `PBI 145 · exported · draw calls ${(report.frames as { drawCalls: number }).drawCalls}`;
  }
  const loop = (): void => {
    if (!running || status.dataset.state !== 'ready') return;
    animate(animationFrame);
    animationFrame += 1;
    backend.render();
    requestAnimationFrame(loop);
  };
  let animationFrame = 0;
  if (running) requestAnimationFrame(loop);
}

void start().catch(fail);
