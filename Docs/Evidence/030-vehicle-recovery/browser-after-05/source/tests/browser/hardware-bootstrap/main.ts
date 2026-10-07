import { createRenderingBackend } from '../../../src/rendering/babylon/backend';
import { diagnoseBackend } from '../../../src/rendering/babylon/diagnostics-adapter';
import { subscribeRenderingLoss } from '../../../src/rendering/babylon/recovery-session';
import type { BackendPreference } from '../../../src/rendering/backend-policy';
type HardwareProfile = 'desktop' | 'laptop';
declare const __PROBE_BUILD__: {
  commit: string;
  sourceHash: string;
  inputs: string[];
  profile: HardwareProfile;
};
interface HardwareMetadata {
  readonly capturedAt: string;
  readonly profile: HardwareProfile;
  readonly manufacturer: string;
  readonly model: string;
  readonly cpu: readonly Record<string, unknown>[];
  readonly gpu: readonly Record<string, unknown>[];
  readonly ramBytes: number;
  readonly os: { readonly name: string; readonly version: string; readonly build: string };
  readonly powerScheme: string;
  readonly battery: readonly Record<string, unknown>[];
}
interface BuildManifest {
  readonly schemaVersion: 1;
  readonly commit: string;
  readonly sourceHash: string;
  readonly profile: HardwareProfile;
  readonly artifactHash: string;
  readonly artifacts: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown, maximum = 512): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}
function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function profile(value: unknown): value is HardwareProfile {
  return value === 'desktop' || value === 'laptop';
}
function sha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}
function validateHardware(value: unknown): asserts value is HardwareMetadata {
  if (
    !record(value) ||
    !profile(value.profile) ||
    value.profile !== __PROBE_BUILD__.profile ||
    !text(value.capturedAt) ||
    !Number.isFinite(Date.parse(value.capturedAt)) ||
    !text(value.manufacturer) ||
    !text(value.model) ||
    !positiveInteger(value.ramBytes) ||
    !text(value.powerScheme, 2048) ||
    !record(value.os) ||
    !text(value.os.name) ||
    !text(value.os.version) ||
    !text(value.os.build) ||
    !Array.isArray(value.cpu) ||
    value.cpu.length < 1 ||
    value.cpu.length > 16 ||
    !value.cpu.every(
      (cpu) =>
        record(cpu) &&
        text(cpu.Name) &&
        positiveInteger(cpu.NumberOfCores) &&
        positiveInteger(cpu.NumberOfLogicalProcessors),
    ) ||
    !Array.isArray(value.gpu) ||
    value.gpu.length < 1 ||
    value.gpu.length > 16 ||
    !value.gpu.every(
      (gpu) =>
        record(gpu) && text(gpu.Name) && (gpu.DriverVersion === null || text(gpu.DriverVersion)),
    ) ||
    !Array.isArray(value.battery) ||
    value.battery.length > 16 ||
    !value.battery.every(record)
  )
    throw new Error(
      'Metadatele hardware sunt invalide sau profilul diferă. Repornește scriptul PowerShell cu profilul corect.',
    );
}
async function validateManifest(value: unknown): Promise<BuildManifest> {
  if (
    !profile(__PROBE_BUILD__.profile) ||
    !sha256(__PROBE_BUILD__.sourceHash) ||
    !record(value) ||
    value.schemaVersion !== 1 ||
    value.commit !== __PROBE_BUILD__.commit ||
    value.sourceHash !== __PROBE_BUILD__.sourceHash ||
    value.profile !== __PROBE_BUILD__.profile ||
    !sha256(value.artifactHash) ||
    !Array.isArray(value.artifacts) ||
    value.artifacts.length < 1 ||
    value.artifacts.length > 4096 ||
    !value.artifacts.every(
      (artifact) =>
        record(artifact) &&
        text(artifact.path, 1024) &&
        !artifact.path.startsWith('/') &&
        !artifact.path.includes('\\') &&
        !artifact.path.split('/').some((part) => part === '..' || part === '.' || part === '') &&
        typeof artifact.bytes === 'number' &&
        Number.isSafeInteger(artifact.bytes) &&
        artifact.bytes >= 0 &&
        sha256(artifact.sha256),
    )
  )
    throw new Error(
      'Manifestul nu corespunde paginii încărcate. Reîncarcă pagina din buildul curent.',
    );
  const manifest = value as unknown as BuildManifest;
  const paths = new Set(manifest.artifacts.map((artifact) => artifact.path));
  const scripts = [...document.scripts].filter((script) => script.type === 'module' && script.src);
  if (
    paths.size !== manifest.artifacts.length ||
    !paths.has('index.html') ||
    !scripts.length ||
    scripts.some((script) => {
      const url = new URL(script.src, location.href);
      return (
        url.origin !== location.origin ||
        !paths.has(decodeURIComponent(url.pathname).replace(/^\//, ''))
      );
    })
  )
    throw new Error('Fișierele paginii nu apar în manifestul curent. Reîncarcă pagina.');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(manifest.artifacts)),
  );
  const actualHash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  if (actualHash !== manifest.artifactHash)
    throw new Error('Digestul manifestului buildului este invalid.');
  return manifest;
}
const element = (id: string) => document.getElementById(id)!;
const start = element('start') as HTMLButtonElement;
const smoke = element('smoke') as HTMLButtonElement;
const download = element('export') as HTMLButtonElement;
let exported: unknown;
let running = false;
const CAPACITY = 60000;
function percentiles(values: Float64Array, count: number) {
  if (!count) return null;
  const sorted = values.slice(0, count).sort();
  const at = (fraction: number) => sorted[Math.ceil(count * fraction) - 1];
  return { count, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted[count - 1] };
}
async function run(short: boolean) {
  if (running) return;
  running = true;
  exported = undefined;
  element('result').textContent = '';
  Object.assign(window, { hardwareProbeResult: undefined, hardwareProbeError: undefined });
  start.disabled = smoke.disabled = download.disabled = true;
  const preference = (element('backend') as HTMLSelectElement).value as BackendPreference;
  const warmupMs = short ? 500 : 30000,
    durationMs = short ? 2000 : 120000,
    repetitions = short ? 1 : 5;
  const canvas = document.createElement('canvas');
  // Fixed internal dimensions independent of screen DPR; no adaptive resolution during calibration.
  canvas.width = 1920;
  canvas.height = 1080;
  element('host').replaceChildren(canvas);
  const creationStart = performance.now();
  let backend: Awaited<ReturnType<typeof createRenderingBackend>> | undefined;
  let diagnostics: ReturnType<typeof diagnoseBackend> | undefined;
  let hidden = false;
  let lostFocus = !document.hasFocus();
  let renderingFailure: unknown;
  let unsubscribeLoss: (() => void) | undefined;
  const visibility = () => {
    if (document.hidden) hidden = true;
  };
  document.addEventListener('visibilitychange', visibility);
  const blur = () => {
    lostFocus = true;
  };
  window.addEventListener('blur', blur);
  try {
    const hardware = await fetch('/hardware.json', { cache: 'no-store' }).then((response) => {
      if (!response.ok)
        throw new Error('Identificarea hardware lipsește. Rulează scriptul PowerShell.');
      return response.json() as Promise<unknown>;
    });
    validateHardware(hardware);
    const buildManifestValue = await fetch('/build-manifest.json', { cache: 'no-store' }).then(
      (response) => {
        if (!response.ok) throw new Error('Manifestul buildului lipsește.');
        return response.json() as Promise<unknown>;
      },
    );
    const buildManifest = await validateManifest(buildManifestValue);
    const initializedAt = performance.now();
    backend = await createRenderingBackend(canvas, preference);
    unsubscribeLoss = subscribeRenderingLoss(backend, (reason) => {
      renderingFailure = reason;
    });
    const backendStartupMs = performance.now() - initializedAt;
    const engine = backend.scene.getEngine();
    engine.setSize(1920, 1080);
    diagnostics = diagnoseBackend(backend, { enabled: false, capacity: 4096 });
    const runs = [];
    const phaseBoundaries = [{ phase: 'initialization', startMs: 0 }];
    const setPhase = (phase: string) => phaseBoundaries.push({ phase, startMs: performance.now() });
    const longTasks: { durationMs: number; startMs: number }[] = [];
    const longTaskSupported = PerformanceObserver.supportedEntryTypes.includes('longtask');
    let longTaskOverflow = false;
    const recordTasks = (entries: readonly PerformanceEntry[]) => {
      for (const entry of entries) {
        if (longTasks.length < 1024)
          longTasks.push({ durationMs: entry.duration, startMs: entry.startTime });
        else longTaskOverflow = true;
      }
    };
    const observer = longTaskSupported
      ? new PerformanceObserver((list) => recordTasks(list.getEntries()))
      : null;
    observer?.observe({ type: 'longtask', buffered: false });
    try {
      for (let repeat = 0; repeat < repetitions; repeat++)
        for (const enabled of [false, true]) {
          if (hidden || lostFocus || document.hidden || !document.hasFocus())
            throw new Error('Tabul a fost ascuns; proba este invalidă. Reia din foreground.');
          diagnostics.setEnabled(false);
          diagnostics.setEnabled(enabled);
          const cpu = new Float64Array(CAPACITY),
            intervals = new Float64Array(CAPACITY);
          let count = 0,
            previous: number | null = null,
            first: number | null = null,
            measuredStart: number | null = null;
          setPhase(`run${repeat + 1}-${enabled ? 'enabled' : 'disabled'}-warmup`);
          element('status').textContent =
            `${short ? 'Smoke' : 'Baseline'}: repetarea ${repeat + 1}/${repetitions}, colector ${enabled ? 'pornit' : 'oprit'}. Încălzire ${warmupMs / 1000}s + măsurare ${durationMs / 1000}s.`;
          await new Promise<void>((resolve, reject) => {
            const frame = (now: number) => {
              try {
                if (hidden || lostFocus || document.hidden || !document.hasFocus())
                  throw new Error('Tab ascuns sau focus pierdut în timpul probei.');
                if (renderingFailure)
                  throw new Error(`Renderer pierdut; proba invalidă: ${String(renderingFailure)}`);
                first ??= now;
                const measure = now - first >= warmupMs;
                if (measure && measuredStart === null) {
                  measuredStart = now;
                  previous = null;
                  diagnostics!.collector.clear();
                  setPhase(`run${repeat + 1}-${enabled ? 'enabled' : 'disabled'}-measure`);
                }
                const began = performance.now();
                diagnostics!.backend.render();
                const elapsed = performance.now() - began;
                if (measure && previous !== null) {
                  if (count >= CAPACITY)
                    throw new Error('Capacitatea probei a fost depășită; nu trunchiem rezultate.');
                  cpu[count] = elapsed;
                  intervals[count] = now - previous;
                  count++;
                }
                previous = now;
                if (measuredStart !== null && now - measuredStart >= durationMs) resolve();
                else requestAnimationFrame(frame);
              } catch (error) {
                reject(error);
              }
            };
            requestAnimationFrame(frame);
          });
          setPhase('aggregation-between-runs');
          runs.push({
            repeat: repeat + 1,
            enabled,
            cpuTotalMs: percentiles(cpu, count),
            frameIntervalMs: percentiles(intervals, count),
            diagnostics: diagnostics.report(),
            gpuWindow: 'Last 4096 admitted frames, asynchronous results only',
            activeDurationMs:
              measuredStart === null || previous === null ? 0 : previous - measuredStart,
            focusAtEnd: document.hasFocus(),
          });
        }
      setPhase('finalization');
      // Long-task entries are published when the final RAF task ends, not in its microtasks.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    } finally {
      if (observer) recordTasks(observer.takeRecords());
      observer?.disconnect();
    }
    if (hidden || lostFocus || document.hidden || !document.hasFocus())
      throw new Error('Focus pierdut la finalizarea probei; rezultatul nu poate fi exportat.');
    if (renderingFailure)
      throw new Error(`Renderer pierdut la finalizarea probei: ${String(renderingFailure)}`);
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    exported = {
      schemaVersion: 1,
      fixture: '203-bootstrap-empty-v1',
      build: __PROBE_BUILD__,
      buildManifest,
      validBaseline:
        !short &&
        !hidden &&
        !lostFocus &&
        !document.hidden &&
        document.hasFocus() &&
        !renderingFailure &&
        !longTaskOverflow,
      capturedAt: new Date().toISOString(),
      hardware,
      hardwareCaptureContext:
        'Hardware and power snapshot at PowerShell server startup; not sampled continuously during the run.',
      browser: navigator.userAgent,
      backendPreference: preference,
      actualBackend: backend.rendererKind,
      gpu:
        'getInfo' in engine ? (engine as typeof engine & { getInfo(): unknown }).getInfo() : null,
      browserConcurrency: navigator.hardwareConcurrency,
      profile: __PROBE_BUILD__.profile,
      presetContext: __PROBE_BUILD__.profile === 'laptop' ? 'LOW' : 'MEDIUM',
      workload:
        'Empty bootstrap camera/clear only; no physics, vehicles, UI panel or game workload',
      cssResolution: [1920, 1080],
      internalResolution: [engine.getRenderWidth(), engine.getRenderHeight()],
      devicePixelRatio,
      screen: { width: screen.width, height: screen.height, colorDepth: screen.colorDepth },
      warmupMs,
      durationMs,
      repetitions,
      runs,
      backendStartupMs,
      probeStartupMs: initializedAt - creationStart,
      navigation: navigation
        ? {
            type: navigation.type,
            responseEndMs: navigation.responseEnd,
            domContentLoadedMs: navigation.domContentLoadedEventEnd,
            transferSize: navigation.transferSize,
          }
        : null,
      loadingContext:
        'Local production HTTP, no-store; network unthrottled, OS/driver caches uncontrolled. Not 25Mbit/s RTT40ms cold gate.',
      longTaskSupported,
      longTaskOverflow,
      phaseBoundaries,
      longTasks: longTasks.map((task) => ({
        ...task,
        phase:
          [...phaseBoundaries].reverse().find((boundary) => boundary.startMs <= task.startMs)
            ?.phase ?? 'unknown',
      })),
      hiddenDuringRun: hidden,
      lostFocusDuringRun: lostFocus,
      exactGpuMemoryBytes: null,
      exactPageMemoryBytes: null,
      notes: [
        'GPU unsupported/pending is null, never zero.',
        'Bootstrap costs calibrate overhead only; budgets do not certify gameplay.',
        'Full cold startup, authoritative input latency, simulation throughput and estimator latency require their later fixtures.',
      ],
    };
    element('result').textContent = JSON.stringify(exported, null, 2);
    element('status').textContent = short
      ? 'Smoke încheiat; acest rezultat nu este baseline.'
      : 'Proba completă s-a încheiat. Descarcă rezultatul JSON.';
    download.disabled = false;
    Object.assign(window, { hardwareProbeResult: exported });
  } catch (error) {
    element('status').textContent =
      `Proba nu este validă: ${error instanceof Error ? error.message : String(error)}`;
    Object.assign(window, { hardwareProbeError: String(error) });
  } finally {
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('blur', blur);
    unsubscribeLoss?.();
    diagnostics?.dispose();
    backend?.dispose();
    start.disabled = smoke.disabled = false;
    running = false;
  }
}
start.addEventListener('click', () => {
  void run(false);
});
smoke.addEventListener('click', () => {
  void run(true);
});
download.addEventListener('click', () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `hardware-${__PROBE_BUILD__.profile}-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
