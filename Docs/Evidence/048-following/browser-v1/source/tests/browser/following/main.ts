import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import { createFixedTickLoop } from '../../../src/simulation/fixed-tick';
import { createFollowingDrivingEpisode } from '../../autonomy/following-driving-fixture';
declare const __LONGITUDINAL_BUILD__: {
  sourceHash: string;
  commit: string;
  budgetVersion: string;
  engineVersion: string;
  physicsVersion: string;
};
const status = document.getElementById('status')!,
  results = document.getElementById('results')!,
  button = document.getElementById('run') as HTMLButtonElement;
const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
button.addEventListener('click', async () => {
  button.disabled = true;
  const episodes: unknown[] = [];
  let backend: Awaited<ReturnType<typeof createRenderingBackend>> | undefined;
  try {
    backend = await createRenderingBackend(
      document.getElementById('canvas') as HTMLCanvasElement,
      'AUTO',
    );
    backend.scene.getEngine().setSize(1280, 720);
    new HemisphericLight('light', new Vector3(0, 1, 0), backend.scene);
    const camera = new FreeCamera('camera', new Vector3(-172, 28, -45), backend.scene);
    camera.setTarget(new Vector3(-165, 0, -20));
    backend.scene.activeCamera = camera;
    const ground = MeshBuilder.CreateGround('road', { width: 100, height: 40 }, backend.scene);
    ground.position.set(-165, 0, -20);
    const meshes = ['ego', 'leader'].map((id) =>
      MeshBuilder.CreateBox(id, { width: 1.7, height: 0.65, depth: 4 }, backend!.scene),
    );
    for (const classId of ['sedan', 'compact'] as const) {
      const episode = await createFollowingDrivingEpisode(classId);
      let loop:
        ReturnType<typeof createFixedTickLoop<{ tick: number }, { tick: number }>> | undefined;
      let tick = 0;
      try {
        loop = createFixedTickLoop({
          captureSnapshot: () => ({ tick }),
          interpolate: (_a, b) => b,
          step(time) {
            if (!episode.complete) {
              const row = episode.step();
              check(time.tick === row.tick, 'Physical tick mismatch');
              tick = row.tick;
              status.textContent = `${classId}: tick ${tick}, gap ${row.gapM.toFixed(2)} m, target ${row.targetMps.toFixed(2)} m/s`;
            }
          },
        });
        loop.frame(await raf());
        while (!episode.complete) {
          const now = await raf();
          check(document.hasFocus() && !document.hidden, 'Foreground lost');
          const frame = loop.frame(now);
          check(frame.state.overloadCount === 0, 'Fixed clock overloaded');
          const projections = episode.visual();
          projections.forEach((p, i) => {
            meshes[i].position.set(p.position.x, p.position.y, p.position.z);
            meshes[i].rotationQuaternion = new Quaternion(
              p.rotation.x,
              p.rotation.y,
              p.rotation.z,
              p.rotation.w,
            );
          });
          backend.render();
        }
        const result = episode.result();
        check(Math.abs(result.rows.at(-1)!.speedMps) < 0.1, 'Queue did not stop');
        check(
          result.rows.some((r) => r.brake > 0) && result.rows.some((r) => r.throttle > 0),
          'Both following commands required',
        );
        const clock = loop.getState();
        loop.dispose();
        loop = undefined;
        const cleanup = episode.dispose();
        episodes.push({
          result,
          cleanup,
          clock: {
            tick: clock.tick,
            simulatedSeconds: clock.simulatedSeconds,
            activeRealSeconds: clock.activeRealSeconds,
            overloadCount: clock.overloadCount,
          },
        });
        results.textContent += `${classId}: stopped at ${result.rows.at(-1)!.gapM.toFixed(2)} m\n`;
      } finally {
        loop?.dispose();
        episode.dispose();
      }
    }
    const response = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fixture: '048-browser-following-v1',
        build: __LONGITUDINAL_BUILD__,
        renderer: backend.rendererKind,
        browser: navigator.userAgent,
        foreground: document.hasFocus() && !document.hidden,
        episodes,
        status: 'PASS',
        scope:
          'Short actual044/045/046/048/047/024/Rapier queue, fixed authored straight lane. No fleet FPS or full hardware claim.',
      }),
    });
    check(response.ok, 'Export failed');
    results.textContent += JSON.stringify(await response.json());
    status.textContent = `PASS ${backend.rendererKind}: two physical queue episodes.`;
  } catch (error) {
    status.textContent = `FAIL ${error instanceof Error ? error.message : 'unknown'}`;
    await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fixture: '048-browser-following-v1',
        build: __LONGITUDINAL_BUILD__,
        status: 'FAIL',
        message: status.textContent,
        episodes,
      }),
    });
  } finally {
    backend?.dispose();
    button.disabled = false;
  }
});
