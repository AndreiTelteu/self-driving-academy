/**
 * PBI 220 headed fleet gate entry point.
 *
 * Production build, fixed LOW presentation preset at 1920x1080 CSS/internal and DPR 1. It runs the
 * whole workload matrix for one backend, exports every repetition immediately and writes an
 * independent summary per workload. A reload is required for another backend so that the build,
 * backend and hardware identity of a capture are never mixed.
 */
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import { VERTICAL_SLICE_ENGINE_VERSION } from '../../../src/app';
import { createFleetGateWorkload } from './workload';
import { runFleetGateWorkload, protocolTiming } from './protocol';
import type { FleetGateProfile, FleetGateRun } from './protocol';
import {
  FLEET_BUDGETS,
  FLEET_WORKLOADS,
  FLEET_GATE_VERSION,
  evaluateRun,
  hardwareColumn,
  reproducibilityFindings,
  stressFindings,
  summarizeRepeats,
  workloadById,
} from './plan';
import type { FleetBudgets, HardwareIdentity, WorkloadId } from './plan';

declare const __FLEET_GATE_BUILD__: Readonly<Record<string, unknown>>;

const status = document.getElementById('status')!;
const button = document.getElementById('run') as HTMLButtonElement;
const params = new URLSearchParams(location.search);
const profile = (params.get('profile') ?? 'full') as FleetGateProfile;
const requestedBackend = (params.get('backend') ?? 'WEBGPU') as 'WEBGPU' | 'WEBGL2';
const captureId = params.get('captureId') ?? new Date().toISOString().replaceAll(/[^0-9TZ]/g, '');
const smoke = profile === 'smoke';
const timing = protocolTiming(profile);
const requestedWorkloads = (params.get('workloads') ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
const selectedWorkloads = requestedWorkloads.length
  ? FLEET_WORKLOADS.filter((spec) => requestedWorkloads.includes(spec.id))
  : FLEET_WORKLOADS;
if (!selectedWorkloads.length) throw new Error('No known workload selected');
button.textContent = smoke
  ? 'Run SMOKE preflight'
  : `Run ${FLEET_WORKLOADS.length} workloads × ${timing.repetitions} repetitions on ${requestedBackend}`;

function metricValue(run: FleetGateRun, key: string, nested: 'p95' | 'p99' | 'p50' = 'p95') {
  const value = (run as unknown as Record<string, { [key: string]: number } | null>)[key];
  return value && typeof value[nested] === 'number' ? value[nested] : null;
}

function readHardwareColumn(hardware: Record<string, unknown>): {
  column: 'laptop' | 'desktop';
  identity: HardwareIdentity;
} {
  const cpu = Array.isArray(hardware.cpu)
    ? (hardware.cpu as { Name?: string }[]).map((entry) => entry.Name ?? '').join(' ')
    : null;
  const gpu = Array.isArray(hardware.gpu)
    ? (hardware.gpu as { Name?: string }[]).map((entry) => entry.Name ?? '').join(' ')
    : null;
  const identity: HardwareIdentity = {
    model: typeof hardware.model === 'string' ? hardware.model : null,
    cpu,
    gpu,
  };
  return { column: hardwareColumn(identity), identity };
}

/* Auto-start only for an operator-launched capture window; the click is otherwise required. */
if (params.has('autostart'))
  window.setTimeout(() => {
    if (!button.disabled) button.click();
  }, 50);

button.addEventListener('click', async () => {
  button.disabled = true;
  let backend: Awaited<ReturnType<typeof createRenderingBackend>> | undefined;
  let exportReport: ((report: Readonly<Record<string, unknown>>) => Promise<void>) | undefined;
  let workload: WorkloadId | 'MATRIX' = 'MATRIX';
  let failedDevice = false;
  try {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    backend = await createRenderingBackend(canvas, requestedBackend);
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
      throw new Error('Required CSS/internal 1920x1080 DPR1 resolution mismatch');
    const actualGpuInfo =
      'getInfo' in engine ? (engine as unknown as { getInfo(): unknown }).getInfo() : null;
    if (/swiftshader|llvmpipe|software rasterizer/i.test(JSON.stringify(actualGpuInfo)))
      throw new Error('Software renderer cannot close the hardware gate');
    if (owned.rendererKind !== requestedBackend)
      throw new Error(`Requested ${requestedBackend} but the engine started ${owned.rendererKind}`);
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
    const camera = new FreeCamera('camera', new Vector3(58, 72, -46), owned.scene);
    camera.setTarget(new Vector3(0, 0, 34));
    owned.scene.activeCamera = camera;

    /* The far camera keeps most of the fleet outside the frustum; physics keeps every body. */
    const hardware = (await (await fetch('/hardware.json')).json()) as Record<string, unknown>;
    const { column, identity } = readHardwareColumn(hardware);
    const budgets: FleetBudgets = FLEET_BUDGETS[column];
    const manifest = (await (await fetch('/build-manifest.json')).json()) as {
      artifactHash: string;
      sourceHash: string;
    };
    const metadata = {
      gateVersion: FLEET_GATE_VERSION,
      engineFixtureVersion: VERTICAL_SLICE_ENGINE_VERSION,
      identity: __FLEET_GATE_BUILD__,
      artifactHash: manifest.artifactHash,
      captureId,
      browser: navigator.userAgent,
      renderer: owned.rendererKind,
      actualGpuInfo,
      hardwareIdentity: identity,
      budgetColumn: column,
      budgets,
      preset: 'LOW_FIXED_220_FLEET',
      adaptiveQuality: false,
      cssResolution: [owned.canvas.clientWidth, owned.canvas.clientHeight],
      internalResolution: [engine.getRenderWidth(), engine.getRenderHeight()],
      dpr: devicePixelRatio,
      display: {
        screen: [screen.width, screen.height],
        avail: [screen.availWidth, screen.availHeight],
      },
      network: 'local unthrottled warm assets',
      inspector: 'closed required',
      workload:
        '057 population, 065 demand/dispatch, 058 civil traffic, 044 context, 036 signals, 219 scheduling, 024 controller, 022/028 physics, 103/109/110/112 learning',
      workloadConditions:
        'prudent/aggressive styles, intersection barriers + debris, declared cut-ins, camera excludes most actors, all bodies retained',
      decisionPolicy:
        'fixture command policy over real route progress and real 058 leader/blocked interaction; not the 045/050/051/052 gameplay policies',
      camera: 'fixed chase overview; offscreen actors remain simulated',
    };
    exportReport = async (report) => {
      const response = await fetch('/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...metadata,
          ...report,
          smoke,
          captureId,
          createdAt: new Date().toISOString(),
        }),
      });
      if (!response.ok)
        throw new Error(`Export rejected:${response.status}:${await response.text()}`);
    };
    if (smoke) {
      /* Preflight verifies backend, protocol, capacity, cleanup, serialization and independent read. */
      const spec = FLEET_WORKLOADS[2]!;
      workload = spec.id;
      const result = await runFleetGateWorkload({
        spec,
        profile,
        metadata,
        completedRuns: [],
        createWorkload: (epoch) => createFleetGateWorkload(owned, spec, epoch),
        checkBackend: () => {
          if (failedDevice || owned.rendererKind !== metadata.renderer)
            throw new Error('Renderer/device lost or changed');
        },
        onRunCompleted: async (run) => exportReport!({ kind: 'run', workload: spec.id, run }),
      });
      await exportReport({ kind: 'summary', workload: spec.id, result });
      const echoed = await fetch(`/reports/${encodeURIComponent(captureId)}`);
      if (!echoed.ok) throw new Error('Independent evidence read failed');
      status.textContent =
        'SMOKE preflight saved and read back independently; the hardware gate remains open.';
      return;
    }

    const workloadRuns: Record<string, FleetGateRun[]> = {};
    for (const spec of selectedWorkloads) {
      workload = spec.id;
      let result: Awaited<ReturnType<typeof runFleetGateWorkload>> | null = null;
      for (let attempt = 1; attempt <= 8; attempt++) {
        const saved = await fetch(
          `/saved-runs?captureId=${encodeURIComponent(captureId)}&workload=${spec.id}&renderer=${owned.rendererKind}&smoke=false`,
        );
        if (!saved.ok) throw new Error(`Resume identity rejected:${await saved.text()}`);
        const completedRuns = (await saved.json()) as FleetGateRun[];
        status.textContent = `${spec.label}: starting ${timing.repetitions} repetitions; keep this tab focused.`;
        try {
          result = await runFleetGateWorkload({
            spec,
            profile,
            metadata,
            completedRuns,
            createWorkload: (epoch) => createFleetGateWorkload(owned, spec, epoch),
            checkBackend: () => {
              if (failedDevice || owned.rendererKind !== metadata.renderer)
                throw new Error('Renderer/device lost or changed');
            },
            onRunCompleted: async (run) => {
              await exportReport!({ kind: 'run', workload: spec.id, run });
              status.textContent = `${spec.label}: repeat ${run.repeat}/${timing.repetitions} saved; keep this tab focused.`;
            },
          });
          break;
        } catch (error) {
          /* Focus loss or a stalled first warmup frame is an environment fault, not a result:
             the failed attempt is exported and the repetition is repeated, never weakened. */
          const message = String(error);
          const evidence = (
            error as { evidence?: { phase?: string; counts?: { physicsSteps?: number } } }
          ).evidence;
          const environmentFault =
            /foreground\/focus|RAF stalled/.test(message) ||
            (evidence?.phase === 'warmup' && Number(evidence.counts?.physicsSteps ?? 0) === 0);
          if (!environmentFault || attempt >= 8) throw error;
          await exportReport!({
            kind: 'failure',
            workload: spec.id,
            attempt,
            cause: message,
            evidence: evidence ?? null,
          });
          status.textContent = `${spec.label}: environment fault (${message.slice(0, 80)}); retry ${attempt}/8 in 15 s.`;
          await new Promise<void>((resolve) => window.setTimeout(resolve, 15000));
        }
      }
      if (result === null) throw new Error('Fleet gate workload did not run');
      const runs = result.runs as FleetGateRun[];
      workloadRuns[spec.id] = runs;
      const verdicts = runs.map((run) => evaluateRunRun(run, spec, column));
      const stressVerdicts = runs.map((run) => ({
        repeat: run.repeat,
        findings: stressFindings(runVerdictInput(run, spec, column)),
      }));
      const summaries = summarizeRepeats(
        runs.map((run) => ({
          frameP50Ms: run.frameMs?.p50 ?? null,
          frameP95Ms: run.frameMs?.p95 ?? null,
          frameP99Ms: run.frameMs?.p99 ?? null,
          mainThreadP95Ms: run.mainThreadMs?.p95 ?? null,
          authoritativeTickP95Ms: run.authoritativeTickMs?.p95 ?? null,
          rapierStepP95Ms: run.rapierStepMs?.p95 ?? null,
          gpuP95Ms: run.optionalGpuMs?.p95 ?? null,
          inputToCommandP95Ms: run.inputToCommandMs?.p95 ?? null,
          learningEndToEndP95Ms: run.learningEndToEndMs?.p95 ?? null,
        })),
      );
      const reproducibility = reproducibilityFindings(
        summaries,
        budgets.repeatRelativeSpreadWarning,
      );
      const acceptance = spec.normalGate
        ? verdicts.every((failures) => failures.length === 0) && reproducibility.length === 0
          ? 'PASS'
          : 'FAIL'
        : stressVerdicts.every((entry) => entry.findings.length === 0)
          ? 'STRESS_STRUCTURAL_PASS'
          : 'STRESS_STRUCTURAL_FAIL';
      const labelled =
        profile === 'development' && acceptance === 'PASS'
          ? 'DEV_PASS'
          : profile === 'development' && acceptance === 'FAIL'
            ? 'DEV_FAIL'
            : acceptance;
      await exportReport({
        kind: 'summary',
        workload: spec.id,
        result: {
          ...result,
          verdicts,
          stressVerdicts,
          summaries,
          reproducibility,
          acceptance: labelled,
        },
      });
      status.textContent = `${spec.label}: ${acceptance}.`;
    }
    workload = 'MATRIX';
    await exportReport({
      kind: 'matrix',
      workloads: workloadRuns,
      selected: selectedWorkloads.map((spec) => spec.id),
      protocol: { profile, timing, repetitions: timing.repetitions },
    });
    status.textContent = `Matrix saved for ${owned.rendererKind}. Open the other backend in a fresh page.`;
  } catch (error) {
    const evidence = (error as { evidence?: unknown }).evidence ?? null;
    status.textContent = `FAILED:${String(error)}`;
    if (exportReport) {
      try {
        await exportReport({ kind: 'failure', workload, cause: String(error), evidence });
      } catch (exportError) {
        status.textContent += `\nFailure export also failed:${String(exportError)}`;
      }
    }
    console.error(error);
  } finally {
    backend?.dispose();
  }
});

function runVerdictInput(
  run: FleetGateRun,
  spec: ReturnType<typeof workloadById>,
  column: 'laptop' | 'desktop',
) {
  return {
    workload: spec.id,
    row: column,
    frameP95Ms: run.frameMs?.p95 ?? Infinity,
    frameP99Ms: run.frameMs?.p99 ?? Infinity,
    mainThreadP95Ms: run.mainThreadMs?.p95 ?? Infinity,
    authoritativeTickP95Ms: run.authoritativeTickMs?.p95 ?? Infinity,
    rapierStepP95Ms: run.rapierStepMs?.p95 ?? Infinity,
    gpuP95Ms: run.optionalGpuMs?.p95 ?? null,
    inputToCommandP95Ms: run.inputToCommandMs?.p95 ?? null,
    learningEndToEndP95Ms: run.learningEndToEndMs?.p95 ?? null,
    simulationToWallRatio: run.simulatedToWallRatio,
    applicationLongTaskMaximumMs: run.longTasks.maxMs,
    physicalVehicles: Number(run.counts.vehicles),
    expectedVehicles: spec.taxis + spec.civilians,
    contacts: Number(run.counts.contacts),
    collisions: Number(run.counts.collisionEvents),
    cleanupLeaked: false,
    overloads: run.finalState.overloads,
    status: run.finalState.status,
    offscreenVehiclesRetained:
      Number(run.counts.vehicles) === spec.taxis + spec.civilians &&
      Number(run.counts.bodies) >= spec.taxis + spec.civilians,
    aggressiveVehicles: Number(
      (run.counts.actors as unknown as { aggressive: number } | undefined)?.aggressive ?? 0,
    ),
    prudentVehicles: Number(
      (run.counts.actors as unknown as { prudent: number } | undefined)?.prudent ?? 0,
    ),
    learningSegments: Number(run.counts.learningSegments),
  };
}

function evaluateRunRun(
  run: FleetGateRun,
  spec: ReturnType<typeof workloadById>,
  column: 'laptop' | 'desktop',
) {
  return evaluateRun(runVerdictInput(run, spec, column));
}

/* Keep a stable reference so the bundler cannot tree-shake the workload selector helper. */
void metricValue;
