import { createRenderingLifecycle } from './app';
import { createDefaultSettings } from './settings';
import { createRenderingBackend } from './rendering/babylon';
import { createRenderingView } from './ui';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Containerul aplicației #app lipsește.');
}

const view = createRenderingView(app);
const preference = createDefaultSettings('local-bootstrap').quality.preferredBackend;
const application = createRenderingLifecycle({
  createBackend: (selected) => createRenderingBackend(view.getCanvas(), selected),
  show: view.show,
  scheduleFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  subscribeResize: (callback) => {
    window.addEventListener('resize', callback);
    return () => window.removeEventListener('resize', callback);
  },
});
view.onRetry(() => {
  void application.start(preference);
});
void application.start(preference);
const dispose = (): void => {
  application.dispose();
  view.dispose();
};
window.addEventListener('pagehide', dispose, { once: true });
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener('pagehide', dispose);
    dispose();
  });
}
