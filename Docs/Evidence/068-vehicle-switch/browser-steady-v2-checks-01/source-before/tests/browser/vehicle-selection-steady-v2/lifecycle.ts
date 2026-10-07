import { createRenderingBackend } from '../../../src/rendering/babylon';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { actualSelectionHost } from '../vehicle-selection-actual/selection-host';
import { steadyHost } from './host';
import { browserScope, check } from './proof';
/** Actual sequential renderer/UI/70-native/input-owner admissions outside measured arms.
 * No simulated warmup, forcedGC, segment samples or heap claims are invented. */
export async function lifecycleCycles(
  canvas: HTMLCanvasElement,
  requestedBackend: 'AUTO' | 'WEBGL2',
  validateSurface: (backend: Awaited<ReturnType<typeof createRenderingBackend>>) => void,
  onWorldCreated: () => void,
) {
  const reports = [];
  for (let cycle = 0; cycle < 20; cycle++) {
    const scope = browserScope();
    let primary: unknown = null,
      admitted: unknown = null,
      renderer: Awaited<ReturnType<typeof createRenderingBackend>> | null = null;
    try {
      renderer = await createRenderingBackend(canvas, requestedBackend);
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
    const failures: unknown[] = [
      ...(primary ? [primary] : []),
      ...cleanup.errors.map((e) => Error(e.resource + ': ' + e.message)),
    ];
    const after = cleanup.snapshots as Record<string, Record<string, unknown>>;
    try {
      check(
        after.body?.entities === 0 &&
          after.body.subscriptions === 0 &&
          after.collision?.colliders === 0,
        'Lifecycle nativecleanup',
      );
      check(
        after.authority?.vehicles === 0 &&
          after.authority.players === 0 &&
          after.selection?.vehicles === 0 &&
          after.selection.pending === 0 &&
          after.selection.inFlight === 0 &&
          after.selection.projection === null,
        'Lifecycle inputcleanup',
      );
      check(
        after.renderer?.disposed === true &&
          after.renderer.meshes === 0 &&
          after.renderer.materials === 0 &&
          after.renderer.cameras === 0 &&
          after.ui?.connected === false,
        'Lifecycle renderer/UI cleanup',
      );
    } catch (error) {
      failures.push(error);
    }
    reports.push({
      cycle,
      admitted,
      cleanup,
      causes: failures.map(String),
      scope:
        'Actual20 sequential70body renderer/UI/input admissions; no driving/performance arm/no exactJS orWASMheap.',
    });
    if (failures.length)
      throw Object.assign(new AggregateError(failures, 'Lifecycle/cleanup causes'), {
        lifecycleReports: reports,
      });
  }
  return reports;
}
