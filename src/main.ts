import { createApplicationLifecycle } from './app';
import { createDefaultSettings } from './settings';
import { createRenderingBackend } from './rendering/babylon';
import { createRenderingView } from './ui';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Containerul aplicației #app lipsește.');
const view = createRenderingView(app);
const preference = createDefaultSettings('local-bootstrap').quality.preferredBackend;
const application = createApplicationLifecycle({
  createBackend: (selected) => createRenderingBackend(view.getCanvas(), selected),
  createSimulation: () => {
    let tick = 0;
    return {
      captureSnapshot: () => ({ tick }),
      step: (step) => {
        tick = step.tick;
      },
      interpolate: (_previous, current) => ({ tick: current.tick }),
    };
  },
  show: view.show,
  now: () => performance.now(),
  scheduleFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  subscribeResize: (callback) => {
    window.addEventListener('resize', callback);
    return () => window.removeEventListener('resize', callback);
  },
  isHidden: () => document.hidden,
  subscribeVisibility: (callback) => {
    const changed = (): void => callback(document.hidden);
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  },
});
view.onRetry(() => {
  void application.load(preference);
});
view.onPlay(application.play);
view.onPause(() => application.pause());
void application.load(preference);
const dispose = (): void => {
  try {
    application.dispose();
  } finally {
    view.dispose();
  }
};
window.addEventListener('pagehide', dispose, { once: true });
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener('pagehide', dispose);
    dispose();
  });
}
