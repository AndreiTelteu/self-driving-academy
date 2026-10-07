import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import { createPhysicalSchedulingWorkload } from './workload';
import { compareSchedulingSemanticCheckpoints, runSchedulingHardware } from './protocol';
import type { SchedulingArm, SchedulingHardwareRun } from './protocol';

declare const __SCHEDULING_BUILD__: Readonly<Record<string, unknown>>;
const status = document.getElementById('status')!;
const button = document.getElementById('run') as HTMLButtonElement;
const smoke = new URLSearchParams(location.search).has('smoke');
button.textContent = smoke
  ? 'Run SMOKE (no hardware acceptance)'
  : 'Run both arms (about 50 minutes)';

button.addEventListener('click', async () => {
  button.disabled = true;
  let backend: Awaited<ReturnType<typeof createRenderingBackend>> | undefined;
  let exportReport: ((report: Readonly<Record<string, unknown>>) => Promise<void>) | undefined;
  let arm: SchedulingArm | 'BOTH' = 'BOTH';
  let failedDevice = false;
  try {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    backend = await createRenderingBackend(
      canvas,
      (document.getElementById('backend') as HTMLSelectElement).value as 'AUTO' | 'WEBGL2',
    );
    const owned = backend;
    const engine = owned.scene.getEngine();
    engine.setHardwareScalingLevel(1);
    owned.resize();
    if (
      devicePixelRatio !== 1 ||
      owned.canvas.clientWidth !== 1920 ||
      owned.canvas.clientHeight !== 1080 ||
      engine.getRenderWidth() !== 1920 ||
      engine.getRenderHeight() !== 1080
    )
      throw new Error('Required CSS/internal1920x1080 DPR1 resolution mismatch');
    const actualGpuInfo =
      'getInfo' in engine ? (engine as unknown as { getInfo(): unknown }).getInfo() : null;
    if (/swiftshader|llvmpipe|software rasterizer/i.test(JSON.stringify(actualGpuInfo)))
      throw new Error('Software renderer cannot close hardware gate');
    engine.onContextLostObservable.add(() => {
      failedDevice = true;
    });
    const deviceLost = (
      engine as unknown as { onDeviceLostObservable?: { add(callback: () => void): unknown } }
    ).onDeviceLostObservable;
    deviceLost?.add(() => {
      failedDevice = true;
    });
    new HemisphericLight('light', new Vector3(0, 1, 0), owned.scene);
    const camera = new FreeCamera('camera', new Vector3(38, 55, -35), owned.scene);
    camera.setTarget(new Vector3(0, 0, 20));
    owned.scene.activeCamera = camera;
    const manifest = (await (await fetch('/build-manifest.json')).json()) as {
      artifactHash: string;
    };
    const metadata = {
      identity: __SCHEDULING_BUILD__,
      artifactHash: manifest.artifactHash,
      captureId:
        new URLSearchParams(location.search).get('captureId') ??
        new Date().toISOString().replaceAll(/[^0-9TZ]/g, ''),
      browser: navigator.userAgent,
      renderer: owned.rendererKind,
      actualGpuInfo,
      preset: 'MEDIUM_FIXED_EARLY_FIXTURE',
      adaptiveQuality: false,
      cssResolution: [owned.canvas.clientWidth, owned.canvas.clientHeight],
      internalResolution: [engine.getRenderWidth(), engine.getRenderHeight()],
      dpr: devicePixelRatio,
      network: 'local unthrottled warm assets',
      inspector: 'closed required',
      workload:
        '70 physical mixed cars,67 anonymous obstacles; synthetic route decisions, actual024 controller and028 collision publication',
      chronologicalBaseline:
        'Original preimplementation Node before preserved; hardware reference is a postimplementation control on identical build.',
    };
    exportReport = async (report) => {
      const response = await fetch('/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...metadata,
          ...report,
          smoke,
          createdAt: new Date().toISOString(),
        }),
      });
      if (!response.ok)
        throw new Error(`Export rejected:${response.status}:${await response.text()}`);
    };
    const results: Awaited<ReturnType<typeof runSchedulingHardware>>[] = [];
    for (const nextArm of ['UNPHASED_REFERENCE', 'ENTITY_PHASED'] as const) {
      arm = nextArm;
      const saved = await fetch(
        `/saved-runs?captureId=${encodeURIComponent(metadata.captureId)}&renderer=${metadata.renderer}&arm=${nextArm}&smoke=${smoke}`,
      );
      if (!saved.ok) throw new Error(`Resume identity rejected:${await saved.text()}`);
      const completedRuns = (await saved.json()) as SchedulingHardwareRun[];
      status.textContent = `${arm}: starting five alternating off/on observer pairs; retain foreground/focus.`;
      const result = await runSchedulingHardware({
        arm,
        metadata,
        smoke,
        completedRuns,
        createWorkload: (epoch) => createPhysicalSchedulingWorkload(owned, nextArm, epoch),
        checkBackend: () => {
          if (failedDevice || owned.rendererKind !== metadata.renderer)
            throw new Error('Renderer/device lost or changed');
        },
        onRunCompleted: async (run) => {
          await exportReport!({ kind: 'run', arm: nextArm, run });
          status.textContent = `${nextArm}: repeat${run.repeat}/5 observer${run.observe ? 'on' : 'off'} saved; retain foreground/focus. Resume identifier:${metadata.captureId}`;
        },
      });
      results.push(result);
      await exportReport({ kind: 'arm', arm: nextArm, result });
    }
    arm = 'BOTH';
    for (let index = 0; index < results[0].runs.length; index++)
      compareSchedulingSemanticCheckpoints(
        results[0].runs[index].semanticCheckpoints,
        results[1].runs[index].semanticCheckpoints,
      );
    const budgets = {
      frameP95Ms: 18.5,
      frameP99Ms: 25,
      mainThreadP95Ms: 10,
      applicationLongTaskMaximumMs: 50,
    };
    const frameBudgetFailures = results.flatMap((result) =>
      result.runs
        .filter(
          (run) =>
            (run.frameMs?.p95 ?? Infinity) > budgets.frameP95Ms ||
            (run.frameMs?.p99 ?? Infinity) > budgets.frameP99Ms ||
            (run.mainThreadMs?.p95 ?? Infinity) > budgets.mainThreadP95Ms ||
            ((run.longTasks as { maxMs: number | null }).maxMs ?? 0) >
              budgets.applicationLongTaskMaximumMs,
        )
        .map((run) => ({ arm: result.arm, repeat: run.repeat, observe: run.observe })),
    );
    const regressionPairs = results[0].runs.map((before, index) => {
      const after = results[1].runs[index];
      if (before.repeat !== after.repeat || before.observe !== after.observe)
        throw new Error('Mismatched observer regression pair');
      const beforeP95 = before.frameMs?.p95 ?? Infinity,
        afterP95 = after.frameMs?.p95 ?? Infinity;
      const beforeCpu = before.mainThreadMs?.p95 ?? Infinity,
        afterCpu = after.mainThreadMs?.p95 ?? Infinity;
      return {
        repeat: before.repeat,
        observe: before.observe,
        frameP95DeltaMs: afterP95 - beforeP95,
        mainThreadP95DeltaMs: afterCpu - beforeCpu,
        regressed:
          (afterP95 > beforeP95 * 1.1 && afterP95 - beforeP95 > 1) ||
          (afterCpu > beforeCpu * 1.1 && afterCpu - beforeCpu > 1),
      };
    });
    const confirmedRegression = [false, true].some(
      (observe) =>
        regressionPairs.filter((pair) => pair.observe === observe && pair.regressed).length >= 3,
    );
    const acceptance = smoke
      ? 'SMOKE_ONLY'
      : frameBudgetFailures.length || confirmedRegression
        ? 'BUDGET_FAILED'
        : 'EARLY_FIXTURE_FRAME_PASS';
    await exportReport({
      kind: 'comparison',
      arm,
      semanticCheckpointsEqual: true,
      budgets,
      frameBudgetFailures,
      regressionPairs,
      confirmedRegression,
      acceptance,
      results,
    });
    status.textContent = smoke
      ? 'SMOKE saved; hardware gate remains pending.'
      : acceptance === 'BUDGET_FAILED'
        ? `BUDGET FAILED: ${frameBudgetFailures.length} absolute failures, confirmed regression:${confirmedRegression}; evidence saved.`
        : 'Early fixture frame PASS; both arms preserved exact physical checkpoints and cleanup. Evidence saved.';
  } catch (error) {
    const evidence = (error as { evidence?: unknown }).evidence ?? null;
    status.textContent = `FAILED:${String(error)}`;
    if (exportReport) {
      try {
        await exportReport({ kind: 'failure', arm, cause: String(error), evidence });
      } catch (exportError) {
        status.textContent += `\nFailure export also failed:${String(exportError)}`;
      }
    }
    console.error(error);
  } finally {
    backend?.dispose();
    // A new page/rebuild is required for another immutable capture.
  }
});
