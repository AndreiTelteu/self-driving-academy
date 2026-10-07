import type { Scene } from '@babylonjs/core/scene';
type InspectorOwner = { readonly isDisposed: boolean; dispose(): Promise<void> };
const owners = new WeakMap<Scene, InspectorOwner>();
const observed = new WeakSet<Scene>();
/** Compile-time DEV branch. Production has neither inspector import nor debug layer. */
export async function showDevelopmentInspector(scene: Scene): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  const { ShowInspector } = await import('@babylonjs/inspector');
  if (scene.isDisposed) return false;
  const current = owners.get(scene);
  if (!current || current.isDisposed) owners.set(scene, ShowInspector(scene));
  if (!observed.has(scene)) {
    observed.add(scene);
    scene.onDisposeObservable.addOnce(() => {
      const owner = owners.get(scene);
      owners.delete(scene);
      if (owner && !owner.isDisposed)
        void owner
          .dispose()
          .catch((error: unknown) => console.error('Inspector cleanup failed', error));
    });
  }
  return true;
}
