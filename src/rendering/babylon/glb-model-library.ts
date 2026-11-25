/**
 * PBI 254 — scene-local library of the realistic GLB models.
 *
 * Loading is asynchronous and happens once per renderer session, before the presentation stages
 * are built; every stage afterwards instantiates from the already decoded containers, so the
 * presentation contract (`createVehicleVisualStage`, `createCharacterScene`, `createCityDecorScene`)
 * stays synchronous and the headless tests keep working without a network.
 *
 * The library never owns the scene: it only caches the `AssetContainer`s and disposes them.
 */
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { Scene } from '@babylonjs/core/scene';
import { GLB_ASSETS, getGlbAsset, glbAssetBytes, type GlbAssetDefinition } from './glb-assets';

export const GLB_MODEL_LIBRARY_VERSION = '254-glb-model-library-v1' as const;

export interface GlbModelFailure {
  readonly id: string;
  readonly error: string;
}

export interface GlbModelLibrary {
  readonly version: typeof GLB_MODEL_LIBRARY_VERSION;
  /** Decoded bytes actually resident for the admitted models. */
  readonly bytes: number;
  readonly loaded: readonly string[];
  readonly failed: readonly GlbModelFailure[];
  has(id: string): boolean;
  definition(id: string): GlbAssetDefinition | undefined;
  container(id: string): AssetContainer | undefined;
  /** Clone a model into the scene. `cloneMaterials` gives the caller per-entity tinting. */
  instantiate(
    id: string,
    scene: Scene,
    suffix: string,
    options?: Readonly<{ cloneMaterials?: boolean }>,
  ): InstantiatedEntries | null;
  dispose(): void;
}

export interface GlbModelLibraryOptions {
  /** Restrict the load set; defaults to every catalogue entry. */
  readonly ids?: readonly string[];
  readonly onLoaded?: (id: string, bytes: number) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Load the catalogue into detached containers. A failing model is reported in `failed` and never
 * throws: a missing decoration must not prevent the game from starting.
 */
export async function loadGlbModelLibrary(
  scene: Scene,
  options: GlbModelLibraryOptions = {},
): Promise<GlbModelLibrary> {
  if (!scene || scene.isDisposed) throw new Error('GLB models require a live scene');
  const ids = options.ids ?? GLB_ASSETS.map((asset) => asset.id);
  const containers = new Map<string, AssetContainer>();
  const loaded: string[] = [];
  const failed: GlbModelFailure[] = [];
  let disposed = false;

  for (const id of ids) {
    const definition = getGlbAsset(id);
    if (!definition) {
      failed.push(Object.freeze({ id, error: 'UNKNOWN_GLB_ASSET' }));
      continue;
    }
    try {
      const container = await LoadAssetContainerAsync(definition.url, scene, {
        pluginExtension: '.glb',
        name: definition.id,
      });
      if (disposed) {
        container.dispose();
        return freezeLibrary();
      }
      containers.set(id, container);
      loaded.push(id);
      options.onLoaded?.(id, definition.bytes);
    } catch (error: unknown) {
      failed.push(Object.freeze({ id, error: errorMessage(error) }));
    }
  }

  function freezeLibrary(): GlbModelLibrary {
    const library: GlbModelLibrary = {
      version: GLB_MODEL_LIBRARY_VERSION,
      bytes: glbAssetBytes(loaded),
      loaded: Object.freeze([...loaded]),
      failed: Object.freeze([...failed]),
      has: (id: string) => containers.has(id),
      definition: (id: string) => getGlbAsset(id),
      container: (id: string) => containers.get(id),
      instantiate(
        id: string,
        _targetScene: Scene,
        suffix: string,
        instantiateOptions: Readonly<{ cloneMaterials?: boolean }> = {},
      ) {
        const container = containers.get(id);
        if (!container) return null;
        return container.instantiateModelsToScene(
          (name) => `${suffix}:${name}`,
          instantiateOptions.cloneMaterials === true,
          { doNotInstantiate: instantiateOptions.cloneMaterials !== true },
        );
      },
      dispose(): void {
        if (disposed) return;
        disposed = true;
        for (const container of containers.values()) container.dispose();
        containers.clear();
      },
    };
    return Object.freeze(library);
  }

  return freezeLibrary();
}
