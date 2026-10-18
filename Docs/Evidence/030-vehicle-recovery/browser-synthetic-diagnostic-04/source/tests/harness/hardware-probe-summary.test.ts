import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  summarizeHardwareProbe,
  readHardwareProbeSummary,
} from '../../scripts/summarize-hardware-probe.mjs';

// Synthetic full-protocol inputs exercise the offline parser; they are not hardware evidence.
function fixture() {
  const metric = (value: number, count = 4096) => ({
    count,
    p50: value,
    p95: value + 1,
    p99: value + 2,
  });
  const artifacts = [
    { path: 'index.html', bytes: 50, sha256: 'a'.repeat(64) },
    { path: 'assets/main.js', bytes: 100, sha256: 'b'.repeat(64) },
  ];
  const build = {
    commit: 'c'.repeat(40),
    sourceHash: 'd'.repeat(64),
    profile: 'desktop',
    inputs: ['fixture.ts'],
  };
  const phaseBoundaries = [{ phase: 'initialization', startMs: 0 }];
  let clock = 100;
  const runs = Array.from({ length: 5 }, (_, index) =>
    [false, true].map((enabled) => {
      phaseBoundaries.push({
        phase: `run${index + 1}-${enabled ? 'enabled' : 'disabled'}-warmup`,
        startMs: clock,
      });
      clock += 30000;
      phaseBoundaries.push({
        phase: `run${index + 1}-${enabled ? 'enabled' : 'disabled'}-measure`,
        startMs: clock,
      });
      clock += 120000;
      phaseBoundaries.push({ phase: 'aggregation-between-runs', startMs: clock });
      return {
        repeat: index + 1,
        enabled,
        activeDurationMs: 120000,
        focusAtEnd: true,
        cpuTotalMs: metric(index + (enabled ? 0.5 : 1), 7200),
        frameIntervalMs: metric(15, 7200),
        diagnostics: {
          backend: 'WEBGPU',
          enabled,
          capacity: 4096,
          retainedSamples: enabled ? 4096 : 0,
          bufferBytes: 131072,
          cpuRenderMs: enabled ? metric(1) : null,
          frameMs: enabled ? metric(15, 4095) : null,
          gpuMs: enabled ? metric(index + 2, 4000) : null,
          tickCpuMs: null,
          gpuStatus: enabled ? 'available: asynchronous timer, milliseconds' : 'disabled',
          resources: {
            drawCalls: null as number | null,
            nodes: 1,
            meshes: 0,
            materials: 0,
            textures: 0,
            geometries: 0,
          },
        },
      };
    }),
  ).flat();
  phaseBoundaries.push({ phase: 'finalization', startMs: clock });
  return {
    schemaVersion: 1,
    fixture: '203-bootstrap-empty-v1',
    validBaseline: true,
    warmupMs: 30000,
    durationMs: 120000,
    repetitions: 5,
    profile: 'desktop',
    presetContext: 'MEDIUM',
    actualBackend: 'WEBGPU',
    backendPreference: 'AUTO',
    cssResolution: [1920, 1080],
    internalResolution: [1920, 1080],
    devicePixelRatio: 1,
    browser: 'Synthetic test browser',
    gpu: { vendor: 'Test vendor', renderer: 'Test adapter', version: 'Test version' },
    capturedAt: '2026-10-05T00:00:00Z',
    hiddenDuringRun: false,
    lostFocusDuringRun: false,
    longTaskOverflow: false,
    hardware: {
      capturedAt: '2026-10-05T00:00:00Z',
      profile: 'desktop',
      manufacturer: 'Test',
      model: 'Synthetic',
      ramBytes: 16000000000,
      battery: [],
      powerScheme: 'Test AC',
      os: { name: 'TestOS', version: '1', build: '1' },
      cpu: [{ Name: 'Test CPU', NumberOfCores: 4, NumberOfLogicalProcessors: 8 }],
      gpu: [{ Name: 'Test GPU', DriverVersion: '1' }],
    },
    build,
    buildManifest: {
      schemaVersion: 1,
      ...build,
      artifacts,
      artifactHash: createHash('sha256').update(JSON.stringify(artifacts)).digest('hex'),
    },
    runs,
    phaseBoundaries,
    longTaskSupported: true,
    longTasks: [{ startMs: 30150, durationMs: 55, phase: 'run1-disabled-measure' }],
  };
}

test('five-repeat medians/ranges preserve paired negative observer deltas and counters', () => {
  const input = fixture();
  input.runs[9].diagnostics.resources.nodes = 2;
  const original = structuredClone(input);
  const output = summarizeHardwareProbe(input);
  assert.deepEqual(output.disabled.cpuTotalMs.p95, { median: 4, min: 2, max: 6 });
  assert.deepEqual(output.enabled.frameIntervalMs.p99, { median: 17, min: 17, max: 17 });
  assert.deepEqual(output.enabled.gpuMs?.p50, { median: 4, min: 2, max: 6 });
  assert.equal(output.disabled.gpuMs, null);
  assert.deepEqual(
    output.observerCpuOverheadMs.map((row) => row.p95),
    [-0.5, -0.5, -0.5, -0.5, -0.5],
  );
  assert.deepEqual(output.resources.nodes, { min: 1, max: 2, unavailableRuns: 0 });
  assert.equal(output.resources.drawCalls, null);
  assert.deepEqual(output.gpu, input.gpu);
  assert.equal(output.longTaskPhaseCounts?.['run1-disabled-measure'], 1);
  assert.deepEqual(input, original);
  assert.equal('approvedGate' in output, false);
});

test('unsupported/pending GPU remains null; partial availability reports actual repetitions', () => {
  const input = fixture();
  for (const run of input.runs.filter((run) => run.enabled)) {
    run.diagnostics.gpuMs = null;
    run.diagnostics.gpuStatus = 'unavailable: timer query unsupported';
  }
  assert.equal(summarizeHardwareProbe(input).enabled.gpuMs, null);
  input.runs[1].diagnostics.gpuMs = { count: 2, p50: 0.1, p95: 0.2, p99: 0.3 };
  input.runs[1].diagnostics.gpuStatus = 'available: asynchronous timer, milliseconds';
  assert.equal(summarizeHardwareProbe(input).enabled.gpuMs?.repetitions, 1);
  input.longTaskSupported = false;
  input.longTasks = [];
  assert.equal(summarizeHardwareProbe(input).longTaskPhaseCounts, null);
});

test('rejects smoke, interrupted protocol, invalid dimensions and lost focus', async () => {
  const smoke = JSON.parse(
    await readFile(
      new URL('../../Docs/Evidence/203-hardware/desktop-smoke.json', import.meta.url),
      'utf8',
    ),
  ) as unknown;
  assert.throws(() => summarizeHardwareProbe(smoke), /smoke rejected/);
  for (const mutate of [
    (value: ReturnType<typeof fixture>) => {
      value.warmupMs = 500;
    },
    (value: ReturnType<typeof fixture>) => {
      value.durationMs = 2000;
    },
    (value: ReturnType<typeof fixture>) => {
      value.repetitions = 1;
    },
    (value: ReturnType<typeof fixture>) => {
      value.hiddenDuringRun = true;
    },
    (value: ReturnType<typeof fixture>) => {
      value.lostFocusDuringRun = true;
    },
    (value: ReturnType<typeof fixture>) => {
      value.longTaskOverflow = true;
    },
    (value: ReturnType<typeof fixture>) => {
      value.internalResolution[0] = 1280;
    },
    (value: ReturnType<typeof fixture>) => {
      value.runs[0].activeDurationMs = 119999;
    },
    (value: ReturnType<typeof fixture>) => {
      value.runs[0].focusAtEnd = false;
    },
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => summarizeHardwareProbe(input), /Invalid hardware baseline/);
  }
  await assert.rejects(readHardwareProbeSummary(''), /explicit input path/);
});

test('rejects missing/duplicate pairs and inconsistent/nonfinite sample statistics', () => {
  for (const mutate of [
    (value: ReturnType<typeof fixture>) => {
      value.runs.pop();
    },
    (value: ReturnType<typeof fixture>) => {
      value.runs[9] = value.runs[8];
    },
    (value: ReturnType<typeof fixture>) => {
      value.runs[0].cpuTotalMs.p95 = NaN;
    },
    (value: ReturnType<typeof fixture>) => {
      value.runs[0].cpuTotalMs.count = Infinity;
    },
    (value: ReturnType<typeof fixture>) => {
      value.runs[0].frameIntervalMs.count--;
    },
    (value: ReturnType<typeof fixture>) => {
      value.runs[1].diagnostics.retainedSamples--;
    },
    (value: ReturnType<typeof fixture>) => {
      value.runs[1].diagnostics.gpuStatus = 'unavailable';
    },
    (value: ReturnType<typeof fixture>) => {
      value.runs[0].cpuTotalMs.p50 = 100;
    },
    (value: ReturnType<typeof fixture>) => {
      value.runs[0].diagnostics.resources.nodes = -1;
    },
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => summarizeHardwareProbe(input), /Invalid hardware baseline/);
  }
});

test('rejects hardware/profile/build/digest inconsistency and wrong phase attribution', () => {
  for (const mutate of [
    (value: ReturnType<typeof fixture>) => {
      value.hardware.profile = 'laptop';
    },
    (value: ReturnType<typeof fixture>) => {
      value.presetContext = 'LOW';
    },
    (value: ReturnType<typeof fixture>) => {
      value.buildManifest.commit = 'f'.repeat(40);
    },
    (value: ReturnType<typeof fixture>) => {
      value.buildManifest.artifacts[0].bytes++;
    },
    (value: ReturnType<typeof fixture>) => {
      value.hardware.gpu[0].Name = '';
    },
    (value: ReturnType<typeof fixture>) => {
      value.phaseBoundaries.splice(1, 1);
    },
    (value: ReturnType<typeof fixture>) => {
      value.phaseBoundaries[2].startMs = 50;
    },
    (value: ReturnType<typeof fixture>) => {
      value.phaseBoundaries[3].startMs = 30000;
    },
    (value: ReturnType<typeof fixture>) => {
      value.longTasks[0].phase = 'initialization';
    },
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => summarizeHardwareProbe(input), /Invalid hardware baseline/);
  }
});

test('phase wall delta does not invalidate a full RAF duration when callback latencies differ', () => {
  const input = fixture();
  input.phaseBoundaries[3].startMs -= 20;
  assert.equal(summarizeHardwareProbe(input).profile, 'desktop');
});

test('explicit-path CLI emits one compact JSON record, rejects invalid input, and never rewrites evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hardware-summary-'));
  const path = join(directory, 'baseline.json');
  const cli = fileURLToPath(new URL('../../scripts/summarize-hardware-probe.mjs', import.meta.url));
  try {
    const original = JSON.stringify(fixture());
    await writeFile(path, original);
    const result = spawnSync(process.execPath, [cli, path], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim().split('\n').length, 1);
    assert.equal((JSON.parse(result.stdout) as { profile: string }).profile, 'desktop');
    assert.equal(await readFile(path, 'utf8'), original);
    assert.equal((await readHardwareProbeSummary(path)).profile, 'desktop');
    const missingPath = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
    assert.equal(missingPath.status, 1);
    assert.equal(missingPath.stdout, '');
    await writeFile(path, '{"validBaseline":false}');
    const invalid = spawnSync(process.execPath, [cli, path], { encoding: 'utf8' });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /smoke rejected/);
  } finally {
    await rm(directory, { recursive: true });
  }
});
