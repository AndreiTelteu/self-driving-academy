/**
 * PBI 146 presentation probe.
 *
 * Renders the real PBI 042 neighbourhood, the PBI 015 daylight palette and the PBI 146 decor on the
 * actual Babylon backend. The page measures startup (layout/city/decor), draw calls per view, the
 * texture count, the PBI 223 manifest and the decor clearance, then exports one bounded report.
 * It never mutates the layout or simulation state.
 */
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation.js';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import { createCityScene } from '../../../src/rendering/babylon/city-scene';
import { createCityDecorScene } from '../../../src/rendering/babylon/city-decor-scene';
import {
  cityDecorBudget,
  cityDecorInventory,
  cityDecorManifest,
  verifyCityDecor,
} from '../../../src/rendering';
import {
  createCityLayout,
  createCityLayoutReport,
  createNeighbourhoodMap,
  verifyCityAlignment,
} from '../../../src/world';
import type { CityLayout } from '../../../src/world';

declare const __CITY_ASSET_BUILD__: Readonly<Record<string, unknown>>;

const status = document.querySelector<HTMLElement>('#status')!;
const panel = document.querySelector<HTMLElement>('#panel')!;
const canvas = document.querySelector<HTMLCanvasElement>('#host')!;
const params = new URLSearchParams(location.search);
if (params.has('quiet')) panel.hidden = true;
const preset = 'MEDIUM' as const;

function fail(error: unknown): void {
  status.dataset.state = 'error';
  status.textContent = `Eroare: ${error instanceof Error ? error.message : String(error)}`;
}
function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}
function junctionCenter(layout: CityLayout, type: 'SIGNALIZED' | 'STOP_CONTROLLED') {
  const intersection = layout.intersections.find((entry) => entry.type === type);
  if (!intersection) throw new Error(`No ${type} junction`);
  const surface = layout.elements.find((element) => element.id === intersection.surfaceElementId)!;
  const footprint = surface.kind === 'SIGNAL_HEAD' ? [] : surface.footprintM;
  const xs = footprint.map((vertex) => vertex.x);
  const zs = footprint.map((vertex) => vertex.z);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  };
}

async function start(): Promise<void> {
  canvas.width = 1280;
  canvas.height = 720;
  const backend = await createRenderingBackend(canvas, 'WEBGL2');
  const scene = backend.scene;
  backend.resize();
  scene.clearColor = new Color4(0.58, 0.72, 0.84, 1);
  new HemisphericLight('hemi', new Vector3(0.15, 1, -0.1), scene).intensity = 0.85;
  const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.3), scene);
  sun.intensity = 1.05;
  const camera = scene.activeCamera as FreeCamera;

  const layoutStart = performance.now();
  const map = createNeighbourhoodMap();
  const layout = createCityLayout(map);
  const layoutMs = performance.now() - layoutStart;
  const cityStart = performance.now();
  const city = createCityScene(scene, layout);
  const cityMs = performance.now() - cityStart;
  const decorStart = performance.now();
  const decor = createCityDecorScene(scene, layout);
  const decorMs = performance.now() - decorStart;
  const startupMs = layoutMs + cityMs + decorMs;

  const bounds = layout.boundsM;
  const center = {
    x: (bounds.minM.x + bounds.maxM.x) / 2,
    z: (bounds.minM.z + bounds.maxM.z) / 2,
  };
  const items = [...decor.plan.items].sort(
    (left, right) => decor.plan.countsByKind[right.kind] - decor.plan.countsByKind[left.kind],
  );
  const showcase = items[0] ?? { x: center.x, z: center.z, rotationY: 0 };
  const junction = junctionCenter(layout, 'SIGNALIZED');
  const views: Record<string, { position: Vector3; target: Vector3 }> = {
    overview: {
      position: new Vector3(center.x + 210, 330, center.z - 260),
      target: new Vector3(center.x, 0, center.z),
    },
    junction: {
      position: new Vector3(junction.x - 26, 22, junction.z - 26),
      target: new Vector3(junction.x, 0, junction.z),
    },
    sidewalk: {
      position: new Vector3(showcase.x + 4.5, 2.1, showcase.z - 5.5),
      target: new Vector3(showcase.x, 0.9, showcase.z),
    },
    avenue: {
      position: new Vector3(junction.x + 40, 5, junction.z + 3),
      target: new Vector3(junction.x, 2, junction.z + 3),
    },
  };
  function setView(name: keyof typeof views): void {
    const view = views[name] ?? views.overview!;
    camera.position.copyFrom(view.position);
    camera.setTarget(view.target);
    backend.render();
  }
  setView('overview');
  await scene.whenReadyAsync();
  for (let frame = 0; frame < 3; frame += 1) backend.render();

  const instrumentation = new SceneInstrumentation(scene);
  const drawCalls = (): number => {
    backend.render();
    return instrumentation.drawCallsCounter.current;
  };
  const viewMetrics = (['overview', 'junction', 'sidewalk', 'avenue'] as const).map((name) => {
    setView(name);
    return { view: name, drawCalls: drawCalls() };
  });
  setView('overview');

  const report = createCityLayoutReport(layout, city.getRenderedElementIds());
  const alignment = verifyCityAlignment(map, layout);
  const decorIssues = verifyCityDecor(decor.plan, layout);
  const budget = cityDecorBudget(decor.plan, preset);
  const manifest = cityDecorManifest(decor.plan);
  const inventory = cityDecorInventory(decor.plan);

  // Camera sweep over the static city: CPU/render submission, not a hardware FPS gate.
  const frameMs: number[] = [];
  let sweepDrawCalls = 0;
  for (let frame = 0; frame < 300; frame += 1) {
    const phase = frame / 300;
    camera.position.set(center.x + 210 - phase * 120, 330, center.z - 260 + phase * 160);
    camera.setTarget(new Vector3(center.x, 0, center.z));
    const before = performance.now();
    backend.render();
    frameMs.push(performance.now() - before);
    sweepDrawCalls = Math.max(sweepDrawCalls, instrumentation.drawCallsCounter.current);
  }

  const result: Record<string, unknown> = {
    fixture: '146-city-assets-v1',
    identity: __CITY_ASSET_BUILD__,
    renderer: backend.rendererKind,
    gpuInfo:
      'getInfo' in scene.getEngine()
        ? (scene.getEngine() as unknown as { getInfo(): unknown }).getInfo()
        : null,
    browser: navigator.userAgent,
    preset,
    resolution: [canvas.width, canvas.height],
    dpr: devicePixelRatio,
    mapId: map.mapId,
    startup: {
      layoutMs,
      cityMs,
      decorMs,
      totalMs: startupMs,
      layoutElements: layout.stats.elements,
      items: decor.plan.items.length,
      cells: decor.plan.cells.length,
      meshes: city.stats.meshes + decor.stats.meshes,
      textures: scene.textures.length,
      materials: scene.materials.length,
      vertices: city.stats.vertices + decor.stats.vertices,
      triangles: city.stats.triangles + decor.stats.triangles,
      drawCalls: city.stats.meshes + decor.stats.drawCalls,
    },
    decor: {
      stats: decor.stats,
      countsByKind: decor.plan.countsByKind,
      inventory,
      budget: {
        accepted: budget.accepted,
        totals: budget.totals,
        diagnostics: budget.diagnostics,
        assets: manifest.assets.length,
      },
      issues: decorIssues,
    },
    semantics: {
      missingRendered: report.missingRenderedElementIds.length,
      unknownRendered: report.unknownRenderedElementIds.length,
      phantom: report.phantomElementIds.length,
      alignmentIssues: alignment.length,
      elementsByKind: layout.stats.elementsByKind,
    },
    views: viewMetrics,
    frames: {
      metric: 'cpu-render-submission',
      note: 'static city camera sweep without vsync; the PBI 220 gate owns the hardware FPS budget',
      measured: 300,
      p50: percentile(frameMs, 0.5),
      p95: percentile(frameMs, 0.95),
      p99: percentile(frameMs, 0.99),
      max: Math.max(...frameMs),
      over25Ms: frameMs.filter((value) => value > 25).length,
      drawCalls: sweepDrawCalls,
    },
    memory: {
      usedJSHeapSize:
        (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
          ?.usedJSHeapSize ?? null,
      exactGpuMemory: null,
    },
  };

  Object.assign(window, {
    cityAssetsProbe: {
      scene,
      backend,
      city,
      decor,
      layout,
      setView,
      run: () => result,
      export: async () => {
        const response = await fetch('/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result),
        });
        if (!response.ok) throw new Error(`Export rejected: ${response.status}`);
        return result;
      },
    },
  });

  status.dataset.state = 'ready';
  status.textContent = `PBI 146 · ${backend.rendererKind} · ${decor.stats.items} decor items · ${decor.stats.cells} cells`;
  if (params.has('autorun')) {
    const exported = await (
      window as unknown as { cityAssetsProbe: { export(): Promise<Record<string, unknown>> } }
    ).cityAssetsProbe.export();
    panel.hidden = false;
    panel.textContent = JSON.stringify(exported.startup, null, 2);
  }
}

void start().catch(fail);
