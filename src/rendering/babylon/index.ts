import { Engine } from '@babylonjs/core/Engines/engine';
import type { BootstrapView, Renderer } from '../index';
export { createRenderingBackend, type RenderingBackend } from './backend';
export { BabylonSceneAdapter, type VisualRepresentation } from './scene-adapter';
export { BabylonSnapshotPresenter, type WheelNodeResolver } from './snapshot-presenter';
export { createDaylight, type DaylightMaterial, type QualityViewport } from './daylight';
export {
  BabylonAssetRegistry,
  DEFAULT_ASSET_LIMITS,
  validateRegistryGlb,
  type AssetDefinition,
  type AssetLimits,
  type AssetProgress,
  type AssetLoadReport,
  type AssetLease,
} from './asset-registry';

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
