import { createApplicationLifecycle } from '../../../src/app';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import { createRenderingView } from '../../../src/ui';
const view = createRenderingView(document.querySelector<HTMLDivElement>('#app')!);
let failure = false;
let tick = 0;
let listeners = 0;
let disposals = 0;
const frames = new Set<number>();
const app = createApplicationLifecycle({
  createBackend: async (preference) => {
    failure = false;
    const backend = await createRenderingBackend(view.getCanvas(), preference);
    return {
      rendererKind: backend.rendererKind,
      render: () => {
        if (failure) throw new Error('Injected render fault');
        backend.render();
      },
      resize: backend.resize,
      dispose: () => {
        disposals++;
        backend.dispose();
      },
    };
  },
  createSimulation: () => {
    tick = 0;
    return {
      captureSnapshot: () => ({ tick }),
      step: (step) => {
        tick = step.tick;
      },
      interpolate: (_previous, current) => current,
    };
  },
  now: () => performance.now(),
  show: view.show,
  scheduleFrame: (callback) => {
    const id = requestAnimationFrame(() => {
      frames.delete(id);
      callback();
    });
    frames.add(id);
    return id;
  },
  cancelFrame: (id) => {
    frames.delete(id);
    cancelAnimationFrame(id);
  },
  subscribeResize: (callback) => {
    listeners++;
    window.addEventListener('resize', callback);
    return () => {
      listeners--;
      window.removeEventListener('resize', callback);
    };
  },
  subscribeVisibility: (callback) => {
    const changed = () => callback(document.hidden);
    listeners++;
    document.addEventListener('visibilitychange', changed);
    return () => {
      listeners--;
      document.removeEventListener('visibilitychange', changed);
    };
  },
  isHidden: () => document.hidden,
});
view.onRetry(() => {
  void app.load('WEBGL2');
});
view.onPlay(app.play);
view.onPause(() => app.pause());
document.querySelector('#fault')!.addEventListener('click', () => {
  failure = true;
});
Object.assign(window, {
  lifecycleFixture: {
    read: () => ({ state: app.getState(), tick, frames: frames.size, listeners, disposals }),
    app,
  },
});
void app.load('WEBGL2');
window.addEventListener('pagehide', () => app.dispose(), { once: true });
