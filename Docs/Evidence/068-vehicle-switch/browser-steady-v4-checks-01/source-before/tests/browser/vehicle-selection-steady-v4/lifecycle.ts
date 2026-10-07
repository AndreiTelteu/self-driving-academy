import { createRenderingBackend } from '../../../src/rendering/babylon';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { actualSelectionHost } from '../vehicle-selection-actual/selection-host';
import { steadyHost } from './host';
import { browserScope, check } from './proof';
import {checkLifecycleCleanup,requireCurrentCanvas,requireLifecycleSurface,lifecycleFailures} from './lifecycle-proof';
import {errorEvidence} from './diagnostics';
/** Actual sequential renderer/UI/70-native/input-owner admissions outside measured arms.
 * No simulated warmup, forcedGC, segment samples or heap claims are invented. */
export async function lifecycleCycles(
  canvas: HTMLCanvasElement,
  requestedBackend: 'AUTO' | 'WEBGL2',
  validateSurface: (backend: Awaited<ReturnType<typeof createRenderingBackend>>) => void,
  onWorldCreated: () => void,
  retainCycle: (report:unknown)=>Promise<void> = async()=>{},
) {
  const reports = [];
  let currentCanvas=canvas;
  for (let cycle = 0; cycle < 20; cycle++) {
    const scope = browserScope();
    let primary: unknown = null,
      admitted: unknown = null,
      surfacePrepared: unknown = null,
      preparedRendererKind: string|null=null,
      renderer: Awaited<ReturnType<typeof createRenderingBackend>> | null = null;
    try {
      requireCurrentCanvas(currentCanvas,document.getElementById('canvas'));
      renderer = await createRenderingBackend(currentCanvas, requestedBackend);
      currentCanvas=renderer.canvas;
      const backend = renderer;
      scope.own(
        'renderer',
        () => backend.dispose(),
        () => ({
          disposed: backend.scene.isDisposed,
          meshes: backend.scene.meshes.length,
          materials: backend.scene.materials.length,
          cameras: backend.scene.cameras.length,
        }),
      );
      let contextLost = false;
      const observable = backend.scene.getEngine().onContextLostObservable;
      const token = observable.add(() => {
        contextLost = true;
      });
      scope.own('context-latch', () => {
        observable.remove(token);
      });
      check(
        backend.rendererKind === (requestedBackend === 'AUTO' ? 'WEBGPU' : 'WEBGL2'),
        'Lifecycle renderer fallback',
      );
      requireCurrentCanvas(currentCanvas,document.getElementById('canvas'));
      backend.scene.getEngine().setSize(1920,1080);
      preparedRendererKind=backend.rendererKind;
      surfacePrepared={css:[currentCanvas.clientWidth,currentCanvas.clientHeight],internal:[backend.scene.getEngine().getRenderWidth(),backend.scene.getEngine().getRenderHeight()],dpr:devicePixelRatio};
      requireLifecycleSurface(surfacePrepared as {css:number[];internal:number[];dpr:number});
      validateSurface(backend);
      const mount = document.createElement('section');
      scope.own(
        'ui',
        () => mount.remove(),
        () => ({
          connected: mount.isConnected,
          elementNodes: mount.querySelectorAll('*').length + 1,
        }),
      );
      for (const label of ['Cameră: car-0', 'PLAYER: — AUTO', 'Segment: —']) {
        const span = document.createElement('span');
        span.textContent = label;
        mount.append(span);
      }
      document.body.append(mount);
      new HemisphericLight('lifecycle-light', new Vector3(0, 1, 0), backend.scene);
      const ground = MeshBuilder.CreateGround(
          'lifecycle-ground',
          { width: 500, height: 500 },
          backend.scene,
        ),
        material = new StandardMaterial('lifecycle-ground-material', backend.scene);
      ground.material = material;
      const h = await steadyHost(backend, 2000 + cycle, scope, actualSelectionHost, onWorldCreated);
      await backend.scene.whenReadyAsync();
      validateSurface(backend);
      check(!contextLost, 'Lifecycle context lost');
      backend.render();
      admitted = {
        body: h.world.bodyResources(),
        nativeSerial:h.world.collisionStepSerial(),
        controllerTick:h.controller.getStats().tick,
        profiles:[...h.profiles],
        authority: h.authority.getStats(),
        selection: h.actual!.selection.getStats(),
        registry: h.registry.size,
        meshes: backend.scene.meshes.length,
        materials: backend.scene.materials.length,
        cameras: backend.scene.cameras.length,
        uiElements: mount.querySelectorAll('*').length + 1,
        uiTextNodes: mount.childNodes.length,
        uiListeners: 0,
      };
    } catch (error) {
      primary = error instanceof Error ? error : Error(String(error));
    }
    const cleanup = scope.close();
    const ownership=checkLifecycleCleanup(cleanup);
    const failures=lifecycleFailures(primary,cleanup,ownership.errors);
    reports.push({
      cycle,
      admitted,
      cleanup,
      ownership,
      rendererKind:preparedRendererKind,
      surfacePrepared,
      causeDetails:failures.map(error=>errorEvidence(error)),
      canvas:{connected:currentCanvas.isConnected,id:currentCanvas.id,currentDOM:document.getElementById('canvas')===currentCanvas},
      causes: failures.map(String),
      scope:
        'Actual20 sequential70body renderer/UI/input admissions; no driving/performance arm/no exactJS orWASMheap.',
    });
    try{await retainCycle(reports[reports.length-1]);}catch(error){failures.push(error);}
    if (failures.length)
      throw Object.assign(new AggregateError(failures, 'Lifecycle/cleanup causes'), {
        lifecycleReports: reports,
      });
  }
  return reports;
}
