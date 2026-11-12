import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMPAT_DECLARED_MATRIX,
  buildCompatReport,
  compatReportMarkdown,
  expectedBackend,
  gpuInfoOf,
  verifyCompatReport,
  type CompatCapabilities,
  type CompatHost,
  type CompatObservation,
} from './compat-matrix';
import { runFallbackChecks, runRecoveryChecks } from './compat-deterministic';

function capabilities(overrides: Partial<CompatCapabilities> = {}): CompatCapabilities {
  return {
    userAgent: 'Mozilla/5.0 HeadlessChrome/156.0.8078.4',
    browser: 'Chromium 156.0.8078.4',
    browserVersion: '156.0.8078.4',
    headless: false,
    platform: 'Windows 11 Home (10.0.26300)',
    secureContext: true,
    devicePixelRatio: 1,
    webgpu: {
      available: true,
      adapter: { vendor: 'amd', architecture: 'rdna-2', device: null, description: null },
      error: null,
    },
    webgl2: {
      available: true,
      vendor: 'Google Inc. (AMD)',
      renderer: 'ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0)',
    },
    webgl1: { available: true },
    ...overrides,
  };
}

function observation(overrides: Partial<CompatObservation> = {}): CompatObservation {
  return {
    id: 'fixture-headed-auto',
    title: 'Fixture',
    entry: 'production',
    scenario: 'AUTO',
    preference: 'AUTO',
    capabilities: capabilities(),
    backend: 'WEBGPU',
    statusText: 'Bootstrap pregătit · Babylon.js · WEBGPU',
    visibleContent: true,
    retryVisible: true,
    errorMessage: null,
    renderEvidence: {
      contextAlive: true,
      activeMeshes: null,
      framesAdvanced: null,
      canvasWidth: 640,
      canvasHeight: 320,
    },
    recovery: null,
    screenshots: ['fixture.png'],
    pageErrors: [],
    ...overrides,
  };
}

const host: CompatHost = {
  os: 'Windows 11 Home (10.0.26300)',
  cpu: 'AMD Ryzen 7 7735U with Radeon Graphics',
  threads: 16,
  memoryGiB: 14,
  node: '24.19.0',
  chromium: '156.0.8078.4',
};

test('expectedBackend urmează ordinea reală WebGPU apoi WebGL 2', () => {
  const both = capabilities();
  assert.equal(expectedBackend(both, 'AUTO'), 'WEBGPU');
  assert.equal(expectedBackend(both, 'WEBGPU'), 'WEBGPU');
  assert.equal(expectedBackend(both, 'WEBGL2'), 'WEBGL2');

  const noWebgpu = capabilities({
    webgpu: { available: false, adapter: null, error: 'navigator.gpu lipsește' },
  });
  assert.equal(expectedBackend(noWebgpu, 'AUTO'), 'WEBGL2');
  assert.equal(expectedBackend(noWebgpu, 'WEBGPU'), 'WEBGL2');
  assert.equal(expectedBackend(noWebgpu, 'WEBGL2'), 'WEBGL2');

  const none = capabilities({
    webgpu: { available: false, adapter: null, error: null },
    webgl2: { available: false, vendor: null, renderer: null },
    webgl1: { available: false },
  });
  assert.equal(expectedBackend(none, 'AUTO'), 'NONE');
  assert.equal(expectedBackend(none, 'WEBGL2'), 'NONE');
});

test('gpuInfoOf folosește driverul real sau unknown, niciodată inventat', () => {
  const headed = gpuInfoOf(capabilities());
  assert.equal(headed.source, 'webgpu-adapter');
  assert.equal(headed.webgpu?.vendor, 'amd');
  assert.match(headed.label, /AMD Radeon/);

  const headless = gpuInfoOf(
    capabilities({
      headless: true,
      webgpu: { available: false, adapter: null, error: 'no adapter' },
      webgl2: {
        available: true,
        vendor: 'Google Inc. (Google)',
        renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
      },
    }),
  );
  assert.equal(headless.source, 'webgl-debug-renderer');
  assert.match(headless.label, /SwiftShader/);

  const unknown = gpuInfoOf(
    capabilities({
      webgpu: { available: false, adapter: null, error: null },
      webgl2: { available: false, vendor: null, renderer: null },
    }),
  );
  assert.equal(unknown.label, 'unknown');
});

test('fallback determinist: WebGPU, WebGL 2, ambele lipsă și doar WebGL 1', async () => {
  const checks = await runFallbackChecks();
  assert.equal(checks.length, 6);
  for (const entry of checks) assert.equal(entry.pass, true, `${entry.id}: ${entry.detail}`);
  const byId = new Map(checks.map((entry) => [entry.id, entry]));
  assert.match(byId.get('fallback-webgpu-lipsa')?.detail ?? '', /backend efectiv WEBGL2/);
  assert.match(
    byId.get('fallback-fara-backend')?.detail ?? '',
    /WebGPU și WebGL 2 nu sunt disponibile/,
  );
  assert.match(byId.get('fallback-doar-webgl1')?.detail ?? '', /WebGL 1 is unsupported/);
});

test('recuperare deterministă: pierdere, mesaj de eroare și reluare din același checkpoint', async () => {
  const checks = await runRecoveryChecks();
  assert.equal(checks.length, 5);
  for (const entry of checks) assert.equal(entry.pass, true, `${entry.id}: ${entry.detail}`);
  const byId = new Map(checks.map((entry) => [entry.id, entry]));
  assert.match(byId.get('recuperare-pierdere')?.detail ?? '', /RECOVERING → READY/);
  assert.match(byId.get('recuperare-esec-mesaj')?.detail ?? '', /ERROR/);
  assert.match(byId.get('recuperare-reluare')?.detail ?? '', /READY/);
});

test('raportul matricei leagă backendul efectiv de browser/OS/GPU și verdictul', async () => {
  const report = buildCompatReport({
    capturedAt: '2026-11-12T10:00:00.000Z',
    host,
    observations: [
      observation(),
      observation({
        id: 'fixture-no-backend',
        scenario: 'NO_BACKEND',
        capabilities: capabilities({
          webgpu: { available: false, adapter: null, error: null },
          webgl2: { available: false, vendor: null, renderer: null },
        }),
        backend: 'NONE',
        statusText: 'Randarea nu a pornit. WebGPU și WebGL 2 nu sunt disponibile.',
        retryVisible: true,
        errorMessage: 'Randarea nu a pornit. WebGPU și WebGL 2 nu sunt disponibile.',
        renderEvidence: {
          contextAlive: false,
          activeMeshes: null,
          framesAdvanced: null,
          canvasWidth: 640,
          canvasHeight: 320,
        },
      }),
    ],
    declared: COMPAT_DECLARED_MATRIX,
    fallback: await runFallbackChecks(),
    recovery: await runRecoveryChecks(),
  });
  assert.equal(report.summary.rows, 2);
  assert.equal(report.summary.pass, 2);
  assert.equal(report.summary.fail, 0);
  assert.equal(report.matrix[0]?.expectedBackend, 'WEBGPU');
  assert.equal(report.matrix[1]?.expectedBackend, 'NONE');
  assert.equal(
    report.matrix[1]?.checks.find((entry) => entry.name === 'fara-ecran-gol')?.pass,
    true,
  );
  assert.deepEqual(verifyCompatReport(report), []);
  const markdown = compatReportMarkdown(report);
  assert.match(markdown, /## Matricea executată/);
  assert.match(markdown, /## Fallback și recuperare, determinist/);
  assert.match(markdown, /## Combinații declarate, neexecutate/);
  assert.match(markdown, /Rămâne pentru gate-urile 220\/224\/235/);
  assert.doesNotMatch(markdown, /De completat/);
});

test('matricea declarată nu are ID-uri duplicate și fiecare NOT_RUN are motiv', () => {
  const ids = COMPAT_DECLARED_MATRIX.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const row of COMPAT_DECLARED_MATRIX) {
    assert.equal(row.status, 'NOT_RUN');
    assert(row.reason.trim().length > 20, `${row.id}: motiv prea scurt`);
    assert(row.owner.trim().length > 0);
  }
});

test('un backend greșit produce FAIL, iar verificarea respinge raportul inconsistent', () => {
  const report = buildCompatReport({
    capturedAt: '2026-11-12T10:00:00.000Z',
    host,
    observations: [
      observation({
        backend: 'WEBGL2',
        capabilities: capabilities({ webgl2: { available: true, vendor: null, renderer: null } }),
      }),
    ],
    declared: COMPAT_DECLARED_MATRIX,
    fallback: [],
    recovery: [],
  });
  assert.equal(report.matrix[0]?.verdict, 'FAIL');
  assert.equal(report.summary.fail, 1);
  const tampered = {
    ...report,
    matrix: report.matrix.map((row) => ({
      ...row,
      verdict: 'PASS' as const,
      gpu: { ...row.gpu, label: '' },
    })),
  };
  const issues = verifyCompatReport(tampered);
  assert(issues.some((issue) => issue.includes('verdict PASS cu verificări picate')));
  assert(issues.some((issue) => issue.includes('GPU lipsă')));
});
