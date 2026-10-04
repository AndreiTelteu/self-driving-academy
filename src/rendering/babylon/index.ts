import { Engine } from '@babylonjs/core/Engines/engine';
import type { BootstrapView, Renderer } from '../index';
export { createRenderingBackend, type RenderingBackend } from './backend';

/** Preserved metadata-only fixture for bootstrap regression probes. */
export function createBabylonBootstrapRenderer(view: BootstrapView): Renderer {
  return {
    present: () => {
      view.show({
        status: 'Bootstrap pregătit',
        engineLabel: `Babylon.js ${Engine.Version} · TypeScript · Vite`,
      });
    },
    dispose: () => view.dispose(),
  };
}
