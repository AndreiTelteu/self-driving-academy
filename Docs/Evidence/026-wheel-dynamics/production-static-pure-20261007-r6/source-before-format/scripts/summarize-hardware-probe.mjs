import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function requireValue(condition, label) {
  if (!condition) throw new Error(`Invalid hardware baseline: ${label}`);
}
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const dimensions = (value) =>
  Array.isArray(value) && value.length === 2 && value[0] === 1920 && value[1] === 1080;
const percentiles = ['p50', 'p95', 'p99'];
function validateMetric(metric, maximum, label) {
  requireValue(
    object(metric) && integer(metric.count) && metric.count > 0 && metric.count <= maximum,
    `${label} sample count`,
  );
  requireValue(
    percentiles.every((key) => finite(metric[key])) &&
      metric.p50 <= metric.p95 &&
      metric.p95 <= metric.p99,
    `${label} percentiles`,
  );
  if ('max' in metric) requireValue(finite(metric.max) && metric.max >= metric.p99, `${label} max`);
}
function range(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    min: sorted[0],
    max: sorted.at(-1),
  };
}
function aggregate(metrics) {
  return metrics.length
    ? {
        repetitions: metrics.length,
        ...Object.fromEntries(
          percentiles.map((key) => [key, range(metrics.map((metric) => metric[key]))]),
        ),
      }
    : null;
}
function validateFiniteNumbers(value) {
  if (typeof value === 'number') requireValue(Number.isFinite(value), 'nonfinite numeric evidence');
  else if (Array.isArray(value)) value.forEach(validateFiniteNumbers);
  else if (object(value)) Object.values(value).forEach(validateFiniteNumbers);
}

/** Validates full exported bootstrap evidence; never approves a gameplay gate or edits budgets. */
export function summarizeHardwareProbe(report) {
  validateFiniteNumbers(report);
  requireValue(
    object(report) &&
      report.schemaVersion === 1 &&
      report.fixture === '203-bootstrap-empty-v1' &&
      report.validBaseline === true,
    'full baseline identity (smoke rejected)',
  );
  requireValue(
    report.warmupMs === 30000 && report.durationMs === 120000 && report.repetitions === 5,
    '30s/120s/five-repeat protocol',
  );
  requireValue(
    report.hiddenDuringRun === false &&
      report.lostFocusDuringRun === false &&
      report.longTaskOverflow === false,
    'foreground/focus/long-task overflow',
  );
  requireValue(
    dimensions(report.cssResolution) && dimensions(report.internalResolution),
    '1920x1080 CSS/internal dimensions',
  );
  requireValue(
    ['desktop', 'laptop'].includes(report.profile) &&
      report.presetContext === (report.profile === 'desktop' ? 'MEDIUM' : 'LOW'),
    'profile/preset',
  );
  requireValue(
    ['WEBGL2', 'WEBGPU'].includes(report.actualBackend) &&
      ['AUTO', 'WEBGL2', 'WEBGPU'].includes(report.backendPreference),
    'backend',
  );
  requireValue(
    report.backendPreference !== 'WEBGL2' || report.actualBackend === 'WEBGL2',
    'requested backend consistency',
  );
  requireValue(
    text(report.browser) &&
      text(report.capturedAt) &&
      Number.isFinite(Date.parse(report.capturedAt)) &&
      finite(report.devicePixelRatio) &&
      report.devicePixelRatio > 0,
    'browser/capture/DPR identity',
  );
  requireValue(report.gpu === null || object(report.gpu), 'actual browser GPU identity');
  const hardware = report.hardware;
  requireValue(
    object(hardware) &&
      hardware.profile === report.profile &&
      text(hardware.capturedAt) &&
      Number.isFinite(Date.parse(hardware.capturedAt)) &&
      text(hardware.manufacturer) &&
      text(hardware.model) &&
      integer(hardware.ramBytes) &&
      hardware.ramBytes > 0 &&
      text(hardware.powerScheme),
    'hardware identity',
  );
  requireValue(
    object(hardware.os) && ['name', 'version', 'build'].every((key) => text(hardware.os[key])),
    'OS identity',
  );
  requireValue(
    Array.isArray(hardware.cpu) &&
      hardware.cpu.length > 0 &&
      hardware.cpu.length <= 16 &&
      hardware.cpu.every(
        (cpu) =>
          object(cpu) &&
          text(cpu.Name) &&
          integer(cpu.NumberOfCores) &&
          cpu.NumberOfCores > 0 &&
          integer(cpu.NumberOfLogicalProcessors) &&
          cpu.NumberOfLogicalProcessors > 0,
      ),
    'CPU identity',
  );
  requireValue(
    Array.isArray(hardware.gpu) &&
      hardware.gpu.length > 0 &&
      hardware.gpu.length <= 16 &&
      hardware.gpu.every(
        (gpu) =>
          object(gpu) && text(gpu.Name) && (gpu.DriverVersion === null || text(gpu.DriverVersion)),
      ),
    'GPU identity',
  );
  requireValue(
    Array.isArray(hardware.battery) &&
      hardware.battery.length <= 16 &&
      hardware.battery.every(object),
    'battery metadata',
  );
  const { build, buildManifest: manifest } = report;
  requireValue(
    object(build) &&
      object(manifest) &&
      manifest.schemaVersion === 1 &&
      /^[a-f0-9]{40}$/.test(build.commit) &&
      hash(build.sourceHash) &&
      hash(manifest.artifactHash),
    'build identity',
  );
  requireValue(
    ['commit', 'sourceHash', 'profile'].every((key) => build[key] === manifest[key]) &&
      build.profile === report.profile,
    'build/manifest/profile consistency',
  );
  requireValue(
    Array.isArray(build.inputs) && build.inputs.length > 0 && build.inputs.every(text),
    'build inputs',
  );
  requireValue(
    Array.isArray(manifest.artifacts) &&
      manifest.artifacts.length > 0 &&
      manifest.artifacts.length <= 4096,
    'artifact manifest',
  );
  const paths = new Set();
  for (const artifact of manifest.artifacts) {
    requireValue(
      object(artifact) &&
        text(artifact.path) &&
        !artifact.path.startsWith('/') &&
        !artifact.path.includes('\\') &&
        !artifact.path.split('/').some((part) => ['.', '..', ''].includes(part)) &&
        integer(artifact.bytes) &&
        hash(artifact.sha256) &&
        !paths.has(artifact.path),
      'artifact identity/path',
    );
    paths.add(artifact.path);
  }
  requireValue(
    paths.has('index.html') && [...paths].some((path) => path.endsWith('.js')),
    'HTML/JS artifacts',
  );
  requireValue(
    createHash('sha256').update(JSON.stringify(manifest.artifacts)).digest('hex') ===
      manifest.artifactHash,
    'artifact manifest digest',
  );
  requireValue(Array.isArray(report.runs) && report.runs.length === 10, 'ten paired runs');
  const pairs = new Map();
  const resourceValues = new Map();
  const gpuStatuses = [];
  for (const run of report.runs) {
    requireValue(
      object(run) &&
        integer(run.repeat) &&
        run.repeat >= 1 &&
        run.repeat <= 5 &&
        typeof run.enabled === 'boolean',
      'run pair identity',
    );
    const key = `${run.repeat}-${run.enabled}`;
    requireValue(!pairs.has(key), 'duplicate run pair');
    pairs.set(key, run);
    requireValue(
      finite(run.activeDurationMs) && run.activeDurationMs >= 120000 && run.focusAtEnd === true,
      'actual measured duration/focus',
    );
    validateMetric(run.cpuTotalMs, 60000, 'CPU');
    validateMetric(run.frameIntervalMs, 60000, 'frame interval');
    requireValue(
      run.cpuTotalMs.count === run.frameIntervalMs.count,
      'CPU/frame sample consistency',
    );
    const diagnostic = run.diagnostics;
    requireValue(
      object(diagnostic) &&
        diagnostic.enabled === run.enabled &&
        diagnostic.backend === report.actualBackend &&
        diagnostic.capacity === 4096 &&
        integer(diagnostic.retainedSamples) &&
        diagnostic.retainedSamples <= 4096 &&
        diagnostic.bufferBytes === 4096 * 4 * 8 &&
        text(diagnostic.gpuStatus),
      'diagnostic identity/capacity',
    );
    requireValue(
      diagnostic.retainedSamples === (run.enabled ? Math.min(4096, run.cpuTotalMs.count + 1) : 0),
      'diagnostic sample count',
    );
    for (const metric of ['cpuRenderMs', 'frameMs', 'gpuMs', 'tickCpuMs']) {
      if (diagnostic[metric] !== null)
        validateMetric(diagnostic[metric], diagnostic.retainedSamples, `diagnostic ${metric}`);
      if (!run.enabled) requireValue(diagnostic[metric] === null, 'disabled diagnostic samples');
    }
    if (run.enabled)
      requireValue(
        diagnostic.cpuRenderMs?.count === diagnostic.retainedSamples,
        'enabled CPU diagnostic samples',
      );
    requireValue(
      diagnostic.gpuMs === null
        ? !diagnostic.gpuStatus.startsWith('available:')
        : diagnostic.gpuStatus.startsWith('available:'),
      'GPU status/value consistency',
    );
    gpuStatuses.push({
      repeat: run.repeat,
      enabled: run.enabled,
      status: diagnostic.gpuStatus,
      samples: diagnostic.gpuMs?.count ?? 0,
    });
    requireValue(object(diagnostic.resources), 'owned resource counters');
    for (const name of ['drawCalls', 'meshes', 'nodes', 'materials', 'textures', 'geometries']) {
      const value = diagnostic.resources[name];
      requireValue((name === 'drawCalls' && value === null) || integer(value), `resource ${name}`);
      if (!resourceValues.has(name)) resourceValues.set(name, []);
      resourceValues.get(name).push(value);
    }
  }
  requireValue(
    typeof report.longTaskSupported === 'boolean' &&
      Array.isArray(report.longTasks) &&
      report.longTasks.length <= 1024 &&
      Array.isArray(report.phaseBoundaries) &&
      report.phaseBoundaries.length > 0,
    'long-task evidence',
  );
  const boundaries = report.phaseBoundaries;
  requireValue(
    boundaries[0]?.phase === 'initialization' &&
      boundaries[0]?.startMs === 0 &&
      boundaries.at(-1)?.phase === 'finalization',
    'phase timeline endpoints',
  );
  boundaries.forEach((boundary, index) =>
    requireValue(
      object(boundary) &&
        text(boundary.phase) &&
        finite(boundary.startMs) &&
        (index === 0 || boundary.startMs >= boundaries[index - 1].startMs),
      'phase boundary',
    ),
  );
  let previousEnd = 0;
  const phaseWallDurationsMs = [];
  for (let repeat = 1; repeat <= 5; repeat++)
    for (const state of ['disabled', 'enabled']) {
      const indices = ['warmup', 'measure'].map((phase) => {
        const name = `run${repeat}-${state}-${phase}`;
        requireValue(
          boundaries.filter((boundary) => boundary.phase === name).length === 1,
          'missing/duplicate measurement phase',
        );
        return boundaries.findIndex((boundary) => boundary.phase === name);
      });
      const [warmup, measure] = indices;
      requireValue(
        measure === warmup + 1 &&
          measure + 1 < boundaries.length &&
          boundaries[measure + 1].phase === 'aggregation-between-runs',
        'phase sequence',
      );
      requireValue(boundaries[warmup].startMs >= previousEnd, 'phase order');
      // performance.now() phase boundaries and RAF timestamps have different callback latency.
      // Only the exported RAF activeDuration is a duration gate; phase deltas are diagnostics.
      phaseWallDurationsMs.push({
        repeat,
        enabled: state === 'enabled',
        warmup: boundaries[measure].startMs - boundaries[warmup].startMs,
        measure: boundaries[measure + 1].startMs - boundaries[measure].startMs,
      });
      previousEnd = boundaries[measure + 1].startMs;
    }
  const longTaskPhaseCounts = Object.fromEntries(boundaries.map((boundary) => [boundary.phase, 0]));
  for (const task of report.longTasks) {
    requireValue(
      report.longTaskSupported &&
        object(task) &&
        finite(task.startMs) &&
        finite(task.durationMs) &&
        task.durationMs >= 50,
      'long task',
    );
    const phase = [...boundaries]
      .reverse()
      .find((boundary) => boundary.startMs <= task.startMs)?.phase;
    requireValue(phase === task.phase, 'long-task phase attribution');
    longTaskPhaseCounts[phase]++;
  }
  const summarizeMode = (enabled) => {
    const runs = [...pairs.values()].filter((run) => run.enabled === enabled);
    return {
      cpuTotalMs: aggregate(runs.map((run) => run.cpuTotalMs)),
      frameIntervalMs: aggregate(runs.map((run) => run.frameIntervalMs)),
      gpuMs: aggregate(
        runs.map((run) => run.diagnostics.gpuMs).filter((metric) => metric !== null),
      ),
    };
  };
  return {
    schemaVersion: 1,
    fixture: report.fixture,
    profile: report.profile,
    capturedAt: report.capturedAt,
    build: {
      ...build,
      artifactHash: manifest.artifactHash,
      artifactCount: manifest.artifacts.length,
    },
    hardware,
    gpu: report.gpu,
    browser: report.browser,
    actualBackend: report.actualBackend,
    presetContext: report.presetContext,
    cssResolution: report.cssResolution,
    internalResolution: report.internalResolution,
    devicePixelRatio: report.devicePixelRatio,
    disabled: summarizeMode(false),
    enabled: summarizeMode(true),
    gpuStatuses,
    phaseWallDurationsMs,
    observerCpuOverheadMs: Array.from({ length: 5 }, (_, index) => ({
      repeat: index + 1,
      ...Object.fromEntries(
        percentiles.map((metric) => [
          metric,
          pairs.get(`${index + 1}-true`).cpuTotalMs[metric] -
            pairs.get(`${index + 1}-false`).cpuTotalMs[metric],
        ]),
      ),
    })),
    resources: Object.fromEntries(
      [...resourceValues].map(([name, values]) => [
        name,
        values.every((value) => value === null)
          ? null
          : {
              min: Math.min(...values.filter((value) => value !== null)),
              max: Math.max(...values.filter((value) => value !== null)),
              unavailableRuns: values.filter((value) => value === null).length,
            },
      ]),
    ),
    longTaskSupported: report.longTaskSupported,
    longTaskPhaseCounts: report.longTaskSupported ? longTaskPhaseCounts : null,
    scope:
      'Bootstrap evidence only; no gameplay gate approval or budget modification. GPU aggregates include available repetitions only; null means unavailable.',
  };
}

export async function readHardwareProbeSummary(path) {
  requireValue(text(path), 'explicit input path required');
  return summarizeHardwareProbe(JSON.parse(await readFile(path, 'utf8')));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    requireValue(
      process.argv.length === 3,
      'usage: node scripts/summarize-hardware-probe.mjs <baseline.json>',
    );
    console.log(JSON.stringify(await readHardwareProbeSummary(process.argv[2])));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
