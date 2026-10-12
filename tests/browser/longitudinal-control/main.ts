import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import type { RenderingBackend } from '../../../src/rendering/babylon';
import { createFixedTickLoop } from '../../../src/simulation/fixed-tick';
import type { FixedTickLoop } from '../../../src/simulation/fixed-tick';
import { createLongitudinalDrivingEpisode } from '../../autonomy/longitudinal-driving-fixture';

declare const __LONGITUDINAL_BUILD__: {
  sourceHash: string;
  commit: string;
  budgetVersion: string;
  engineVersion: string;
  physicsVersion: string;
};
const status = document.getElementById('status')!,
  results = document.getElementById('results')!;
const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
let owned: RenderingBackend | undefined;
let activeEpisode: Awaited<ReturnType<typeof createLongitudinalDrivingEpisode>> | undefined;
let activeLoop: FixedTickLoop<{ tick: number }, { tick: number }> | undefined;
let aborted = false;
function failureDetail(error: unknown, depth = 0): unknown {
  if (depth >= 4) return { truncated: true };
  if (!(error instanceof Error)) return { type: typeof error };
  return {
    name: error.name,
    message: error.message.slice(0, 4000),
    stack: error.stack?.slice(0, 8000),
    causes:
      error instanceof AggregateError
        ? error.errors.slice(0, 8).map((item: unknown) => failureDetail(item, depth + 1))
        : [],
  };
}
window.addEventListener('pagehide', () => {
  aborted = true;
  for (const resource of [activeLoop, activeEpisode, owned]) {
    try {
      resource?.dispose();
    } catch {
      /* All remaining owners must still be released. */
    }
  }
  activeLoop = undefined;
  activeEpisode = undefined;
  owned = undefined;
});
document.getElementById('run')!.addEventListener('click', async () => {
  const button = document.getElementById('run') as HTMLButtonElement;
  button.disabled = true;
  aborted = false;
  const episodes: unknown[] = [];
  try {
    owned?.dispose();
    owned = await createRenderingBackend(
      document.getElementById('canvas') as HTMLCanvasElement,
      'AUTO',
    );
    const backend = owned,
      canvas = backend.canvas,
      engine = backend.scene.getEngine();
    canvas.focus();
    engine.setHardwareScalingLevel(1);
    backend.resize();
    engine.setSize(1280, 720);
    new HemisphericLight('light', new Vector3(0, 1, 0), backend.scene);
    const camera = new FreeCamera('camera', new Vector3(55, 65, -25), backend.scene);
    camera.setTarget(new Vector3(0, 0, 35));
    backend.scene.activeCamera = camera;
    MeshBuilder.CreateGround('ground', { width: 60, height: 180 }, backend.scene);
    const barrier = MeshBuilder.CreateBox(
      'obstacle',
      { width: 10, height: 2, depth: 0.5 },
      backend.scene,
    );
    barrier.position.set(0, 1, 75);
    const mesh = MeshBuilder.CreateBox('car', { width: 1.7, height: 0.6, depth: 4 }, backend.scene),
      material = new StandardMaterial('car-material', backend.scene);
    mesh.material = material;
    for (const classId of ['sedan', 'compact'] as const)
      for (const risky of [false, true]) {
        status.textContent = `Preparing ${classId} ${risky ? 'risky delayed obstacle' : 'normal stop'}…`;
        const episode = await createLongitudinalDrivingEpisode(classId, 'dry-asphalt', risky);
        activeEpisode = episode;
        let loop: FixedTickLoop<{ tick: number }, { tick: number }> | undefined;
        let result: ReturnType<typeof episode.result> | undefined,
          cleanup: ReturnType<typeof episode.dispose> | undefined,
          failed = false,
          primary: unknown,
          clockEvidence: unknown = null;
        const began = performance.now();
        let lastTick = 0,
          latestPhase = 'READY',
          maxRafGapMs = 0,
          previousRaf: number | null = null;
        try {
          material.diffuseColor = risky ? new Color3(1, 0.5, 0.15) : new Color3(0.2, 0.8, 0.5);
          const draw = () => {
            const projection = episode.visual();
            mesh.position.copyFromFloats(
              projection.position.x,
              projection.position.y,
              projection.position.z,
            );
            const q = projection.rotation;
            mesh.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
            backend.render();
          };
          loop = createFixedTickLoop({
            captureSnapshot: () => ({ tick: lastTick }),
            interpolate: (_a, b) => b,
            step(time) {
              if (!episode.complete) {
                const row = episode.step();
                check(time.tick === row.tick, 'Physical tick mismatch');
                lastTick = row.tick;
                latestPhase = row.phase;
              }
              return undefined;
            },
          });
          activeLoop = loop;
          for (let frame = 0; frame < 30; frame++) {
            await raf();
            draw();
          }
          loop.frame(await raf());
          while (!episode.complete) {
            const now = await raf();
            check(
              !aborted && document.hasFocus() && !document.hidden,
              'Foreground lost during physical driving',
            );
            if (previousRaf !== null) maxRafGapMs = Math.max(maxRafGapMs, now - previousRaf);
            previousRaf = now;
            const frame = loop.frame(now);
            check(
              frame.state.status === 'running' && frame.state.overloadCount === 0,
              'Fixed clock overload/fault',
            );
            draw();
            status.textContent = `${classId} ${risky ? 'risky' : 'normal'} — tick ${lastTick}, ${latestPhase}`;
          }
          result = episode.result();
          check(result.stopped, 'Vehicle did not stop');
          check(
            risky
              ? result.collisionImpulseNs > result.mechanics.massKg
              : result.collisionImpulseNs === 0 && result.pathM < 70,
            'Normal/risky physical outcome mismatch',
          );
          const firstBrake = result.trace.find((row) => row.command.brake > 0)!;
          check(firstBrake.tick === (risky ? 91 : 13), 'Reaction tick mismatch');
          const clock = loop.getState();
          clockEvidence = {
            ticks: clock.tick,
            simulatedSeconds: clock.simulatedSeconds,
            activeRealSeconds: clock.activeRealSeconds,
            overloadCount: clock.overloadCount,
          };
        } catch (error) {
          failed = true;
          primary = error;
          // Preserve a partially driven world before any native disposal.
          try {
            result = episode.result();
          } catch (readFailure) {
            primary = new AggregateError([error, readFailure], '047 partial result read failed', {
              cause: error,
            });
          }
          try {
            const clock = loop?.getState();
            clockEvidence = clock
              ? {
                  ticks: clock.tick,
                  simulatedSeconds: clock.simulatedSeconds,
                  activeRealSeconds: clock.activeRealSeconds,
                  overloadCount: clock.overloadCount,
                }
              : null;
          } catch {
            clockEvidence = null;
          }
        }
        const failures: unknown[] = failed ? [primary] : [];
        try {
          loop?.dispose();
        } catch (error) {
          failures.push(error);
        }
        try {
          cleanup = episode.dispose();
        } catch (error) {
          failures.push(error);
        }
        activeLoop = undefined;
        activeEpisode = undefined;
        episodes.push({
          result,
          clock: clockEvidence,
          elapsedWallMs: performance.now() - began,
          maxRafGapMs,
          cleanup,
          failures: failures.map((error) => failureDetail(error)),
        });
        if (failures.length)
          throw new AggregateError(failures, '047 visible episode failed', { cause: failures[0] });
        results.textContent += `\n${classId} ${risky ? 'risky' : 'normal'}: ${result!.pathM.toFixed(2)} m, obstacle impulse ${result!.collisionImpulseNs.toFixed(1)} N·s.`;
      }
    const manifest = (await (await fetch('/build-manifest.json')).json()) as {
      artifactHash: string;
    };
    const payload = {
      fixture: '047-browser-driving-v1',
      build: __LONGITUDINAL_BUILD__,
      artifactHash: manifest.artifactHash,
      renderer: backend.rendererKind,
      browser: navigator.userAgent,
      foreground: document.hasFocus() && !document.hidden,
      cssResolution: [canvas.clientWidth, canvas.clientHeight],
      internalResolution: [engine.getRenderWidth(), engine.getRenderHeight()],
      dpr: devicePixelRatio,
      episodes,
      scope:
        'Short visible AUTO driving with authored045 stop stimulus and actual024/Rapier; synthetic static044 lane facts. No048 obstacle-distance planner, human keyboard, fleet FPS or full hardware gate.',
    };
    const response = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    check(response.ok, 'Evidence export failed');
    const receipt = await response.json();
    results.textContent += `\nEvidence receipt: ${JSON.stringify(receipt)}`;
    status.textContent = `PASS ${backend.rendererKind}: normal stops and finite risky obstacle impacts, both vehicle classes.`;
  } catch (error) {
    status.textContent = `FAIL: ${error instanceof Error ? error.message : 'unknown failure'}`;
    await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fixture: '047-browser-driving-v1',
        build: __LONGITUDINAL_BUILD__,
        status: 'FAIL',
        message: status.textContent,
        failure: failureDetail(error),
        episodes,
      }),
    });
  } finally {
    button.disabled = false;
  }
});
