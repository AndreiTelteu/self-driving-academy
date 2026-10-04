import type { RenderingState } from '../app';

export function createRenderingView(root: HTMLDivElement) {
  const section = document.createElement('section');
  const title = document.createElement('h1');
  title.textContent = 'Self Driving Academy';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Scenă de randare Babylon.js');
  host.append(canvas);
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Reîncearcă';
  retry.hidden = true;
  section.append(title, status, host, retry);
  root.append(section);
  let onRetry = (): void => {};
  const click = (): void => onRetry();
  retry.addEventListener('click', click);
  return {
    getCanvas: (): HTMLCanvasElement => {
      const current = host.querySelector('canvas');
      if (!current) throw new Error('Canvas lipsește');
      return current;
    },
    onRetry(callback: () => void): void {
      onRetry = callback;
    },
    show(state: RenderingState): void {
      section.dataset.state = state.kind;
      section.setAttribute('aria-busy', String(state.kind === 'LOADING'));
      status.setAttribute('role', state.kind === 'ERROR' ? 'alert' : 'status');
      status.textContent =
        state.kind === 'LOADING'
          ? 'Se inițializează randarea…'
          : state.kind === 'READY'
            ? `Bootstrap pregătit · Babylon.js · ${state.rendererKind}`
            : `Randarea nu a pornit. ${state.message}`;
      retry.hidden = state.kind !== 'ERROR';
      retry.disabled = state.kind === 'LOADING';
      // Keep canvas measurable during loading; only hide on error.
      host.hidden = state.kind === 'ERROR';
    },
    dispose(): void {
      retry.removeEventListener('click', click);
      section.remove();
    },
  };
}
