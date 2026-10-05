import type { BootstrapView } from '../rendering';
export { createRenderingView } from './rendering-view';
export { createDiagnosticsPanel } from './diagnostics-panel';

export function createBootstrapView(root: HTMLDivElement): BootstrapView {
  const title = document.createElement('h1');
  title.textContent = 'Self Driving Academy';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const engine = document.createElement('p');
  root.append(title, status, engine);
  return {
    show: (presentation) => {
      status.textContent = presentation.status;
      engine.textContent = presentation.engineLabel;
    },
    dispose: () => {
      title.remove();
      status.remove();
      engine.remove();
    },
  };
}
