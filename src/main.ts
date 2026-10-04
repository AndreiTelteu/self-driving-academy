import { createApplication } from './app';
import { createMemorySnapshotStore } from './persistence';
import { createBabylonBootstrapRenderer } from './rendering/babylon';
import { createBootstrapView } from './ui';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Containerul aplicației #app lipsește.');
}

const application = createApplication({
  renderer: createBabylonBootstrapRenderer(createBootstrapView(app)),
  snapshotStore: createMemorySnapshotStore(),
});
application.start();
if (import.meta.hot) {
  import.meta.hot.dispose(() => application.dispose());
}
