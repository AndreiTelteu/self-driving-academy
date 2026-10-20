import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createRenderingBackend, createDaylight } from '../../../src/rendering/babylon';
import { createCityScene } from '../../../src/rendering/babylon/city-scene';
import {
  createCityLayout,
  createCityLayoutReport,
  createNeighbourhoodMap,
  verifyCityAlignment,
} from '../../../src/world';
import type { CityIntersectionType, CityLayout } from '../../../src/world';

/**
 * PBI042 visual fixture: real WebGPU/WebGL2 backend + PBI016 daylight + the derived neighbourhood.
 * The page is a capture surface, not gameplay: it never mutates simulation state.
 */

const status = document.querySelector<HTMLElement>('#status')!;
const result = document.querySelector<HTMLElement>('#result')!;
const host = document.querySelector<HTMLElement>('#host')!;

function fail(error: unknown): void {
  status.dataset.state = 'error';
  status.textContent = `Eroare: ${error instanceof Error ? error.message : String(error)}`;
  document.body.dataset.cityState = 'error';
}

interface JunctionFrame {
  readonly x: number;
  readonly z: number;
  readonly info: CityLayout['intersections'][number];
}

/** Most connected junction of a type, then the one closest to the map centre. */
function junctionFrame(layout: CityLayout, type: CityIntersectionType): JunctionFrame {
  const mapCenter = {
    x: (layout.boundsM.minM.x + layout.boundsM.maxM.x) / 2,
    z: (layout.boundsM.minM.z + layout.boundsM.maxM.z) / 2,
  };
  const frames = layout.intersections
    .filter((intersection) => intersection.type === type)
    .map((info): JunctionFrame => {
      const surface = layout.elements.find((element) => element.id === info.surfaceElementId)!;
      if (surface.kind === 'SIGNAL_HEAD') throw new Error('Missing intersection surface');
      const xs = surface.footprintM.map((vertex) => vertex.x);
      const zs = surface.footprintM.map((vertex) => vertex.z);
      return {
        info,
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        z: (Math.min(...zs) + Math.max(...zs)) / 2,
      };
    })
    .sort((a, b) => {
      if (b.info.incomingLaneIds.length !== a.info.incomingLaneIds.length)
        return b.info.incomingLaneIds.length - a.info.incomingLaneIds.length;
      return (
        Math.hypot(a.x - mapCenter.x, a.z - mapCenter.z) -
        Math.hypot(b.x - mapCenter.x, b.z - mapCenter.z)
      );
    });
  const frame = frames[0];
  if (!frame) throw new Error(`No intersection of type ${type}`);
  return frame;
}

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  // "signalized.quiet" selects the capture frame and hides the JSON panel for screenshots.
  const [requested = 'overview', mode] = (params.get('capture') ?? 'overview').split('.');
  if (mode === 'quiet') {
    document.querySelector<HTMLElement>('#panel')!.classList.add('compact');
    document.querySelector<HTMLElement>('#result')!.hidden = true;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  host.replaceChildren(canvas);
  const backend = await createRenderingBackend(canvas, 'AUTO');
  const scene = backend.scene;
  const daylight = createDaylight(
    scene,
    { preset: 'HIGH', preferredBackend: 'WEBGL2', resolutionScale: 1, adaptive: false },
    { width: canvas.width, height: canvas.height, dpr: 1 },
  );
  const map = createNeighbourhoodMap();
  const layout = createCityLayout(map);
  const city = createCityScene(scene, layout, {
    materials: {
      asphalt: daylight.material('road'),
      marking: daylight.material('marking'),
      housing: daylight.material('signalHousing'),
      lampRed: daylight.material('red'),
      lampAmber: daylight.material('amber'),
      lampGreen: daylight.material('green'),
    },
  });
  const rendered = city.getRenderedElementIds();
  const report = createCityLayoutReport(layout, rendered);
  const alignment = verifyCityAlignment(map, layout);
  const problems = [
    ...(report.missingRenderedElementIds.length ? ['missing rendered elements'] : []),
    ...(report.unknownRenderedElementIds.length ? ['unknown rendered elements'] : []),
    ...(report.phantomElementIds.length ? ['phantom elements'] : []),
    ...(alignment.length ? ['alignment issues'] : []),
  ];
  const camera = scene.activeCamera as FreeCamera;
  const mapCenter = {
    x: (layout.boundsM.minM.x + layout.boundsM.maxM.x) / 2,
    z: (layout.boundsM.minM.z + layout.boundsM.maxM.z) / 2,
  };
  const focus =
    requested === 'overview'
      ? { x: mapCenter.x, z: mapCenter.z, height: 640, distance: 250, dx: 1, dz: 1 }
      : (() => {
          const type = requested.toUpperCase() as CityIntersectionType;
          const center = junctionFrame(layout, type);
          // Stand outside the map centre so the neighbourhood fills the frame behind the junction.
          const offset = { x: center.x - mapCenter.x, z: center.z - mapCenter.z };
          const length = Math.hypot(offset.x, offset.z) || 1;
          // Steep diagonal frame: the junction and its four legs fill the capture, not the sky.
          return {
            x: center.x,
            z: center.z,
            height: 48,
            distance: 27,
            dx: (offset.x / length + 0.6) / 1.6,
            dz: (offset.z / length + 0.6) / 1.6,
          };
        })();
  camera.position.set(
    focus.x - focus.dx * focus.distance,
    focus.height,
    focus.z - focus.dz * focus.distance,
  );
  camera.setTarget(new Vector3(focus.x, 0, focus.z));
  scene.clearColor.set(0.62, 0.75, 0.86, 1);
  await scene.whenReadyAsync();
  for (let frame = 0; frame < 3; frame += 1) backend.render();
  status.dataset.state = 'ready';
  status.textContent = `Gata · ${backend.rendererKind} · ${layout.mapId}`;
  result.textContent = JSON.stringify(
    {
      capture: requested,
      renderer: backend.rendererKind,
      mapId: layout.mapId,
      stats: city.stats,
      intersectionTypes: report.intersectionTypes,
      roadClasses: report.roadClasses,
      sources: report.sourceCounts,
      unrenderedByType: report.unrendered.reduce<Record<string, number>>((counts, entry) => {
        counts[entry.sourceType] = (counts[entry.sourceType] ?? 0) + 1;
        return counts;
      }, {}),
      alignmentIssues: alignment.length,
      problems,
    },
    null,
    2,
  );
  document.body.dataset.cityState = problems.length === 0 ? 'ready' : 'error';
  document.title = `PBI042 ${requested} · ${backend.rendererKind}`;
  if (problems.length > 0) fail(problems.join(', '));
  // Manual inspection helper for the review pane.
  Object.assign(window, {
    cityProbe: {
      report,
      stats: city.stats,
      scene,
      backend,
      layout,
      alignment,
      dispose: () => {
        city.dispose();
        daylight.dispose();
        backend.dispose();
      },
    },
  });
}

void start().catch(fail);
