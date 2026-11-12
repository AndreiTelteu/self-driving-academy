/* global document, window, Image, HTMLCanvasElement */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 154 — raportul matricei de compatibilitate WebGPU / WebGL 2.
 *
 * `npm run qa:compat` derivează `report.json` + `report.md` din observațiile reale comise în
 * `browser.json` și din verificările deterministe de fallback/recuperare (fără GPU).
 * `--check` compară raportul derivat cu fișierele comise.
 *
 * `--browser` este proba reală: construiește intrarea de producție și pagina de harness, rulează
 * Chromium 156 headed (GPU AMD) și headless (WebGL 2 software), forțează absența WebGPU/WebGL 2 și
 * injectează pierderi native de dispozitiv/context. Necesită Playwright (`PLAYWRIGHT_MODULE`);
 * fără el comanda afișează SKIP și nu pretinde că browserul a rulat.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '154-compat-matrix'),
  browserFile = join(evidence, 'browser.json'),
  reportJson = join(evidence, 'report.json'),
  reportMarkdown = join(evidence, 'report.md'),
  buildDirectory = join(root, '.pbi-validation-154', 'build');

const wantsCheck = process.argv.includes('--check') && !process.argv.includes('--browser'),
  wantsBrowser = process.argv.includes('--browser');
let origin = '';

const contract = await import(
  pathToFileURL(join(root, 'tests', 'harness', 'compat-matrix.ts')).href
);
const deterministic = await import(
  pathToFileURL(join(root, 'tests', 'harness', 'compat-deterministic.ts')).href
);

const PRODUCTION_SCENARIOS = [
  {
    id: 'production-headed-auto',
    title: 'Bootstrap de producție — AUTO alege backendul disponibil',
    scenario: 'AUTO',
    preference: 'AUTO',
    headless: false,
    init: 'none',
  },
  {
    id: 'production-headed-webgpu-off',
    title: 'Fallback forțat — navigator.gpu eliminat înainte de module',
    scenario: 'WEBGPU_UNAVAILABLE',
    preference: 'AUTO',
    headless: false,
    init: 'no-webgpu',
  },
  {
    id: 'production-headed-no-backend',
    title: 'Fără WebGPU și fără WebGL 2 — mesaj explicit, fără ecran gol',
    scenario: 'NO_BACKEND',
    preference: 'AUTO',
    headless: false,
    init: 'no-webgpu-no-webgl',
  },
  {
    id: 'production-headed-webgl1-only',
    title: 'Doar WebGL 1 — refuz explicit, fără fallback ascuns',
    scenario: 'WEBGL1_ONLY',
    preference: 'AUTO',
    headless: false,
    init: 'no-webgpu-no-webgl2',
  },
  {
    id: 'production-headless-auto',
    title: 'Bootstrap de producție headless — WebGL 2 pe SwiftShader',
    scenario: 'AUTO',
    preference: 'AUTO',
    headless: true,
    init: 'none',
  },
];

const HARNESS_SCENARIOS = [
  {
    id: 'harness-headed-auto',
    title: 'Contractele reale apelate direct — backend AUTO pe GPU real',
    scenario: 'AUTO',
    preference: 'AUTO',
    headless: false,
    mode: 'probe',
    init: 'none',
  },
  {
    id: 'harness-headless-auto',
    title: 'Contractele reale apelate direct — backend AUTO pe WebGL 2 software',
    scenario: 'AUTO',
    preference: 'AUTO',
    headless: true,
    mode: 'probe',
    init: 'none',
  },
  {
    id: 'harness-headed-recovery-webgpu',
    title: 'Pierdere reală de dispozitiv WebGPU, eșec repetat și reluare',
    scenario: 'RECOVERY_LOSS',
    preference: 'WEBGPU',
    headless: false,
    mode: 'recovery',
    init: 'none',
  },
  {
    id: 'harness-headless-recovery-webgl2',
    title: 'Pierdere reală de context WebGL 2 (SwiftShader), eșec repetat și reluare',
    scenario: 'RECOVERY_LOSS',
    preference: 'WEBGL2',
    headless: true,
    mode: 'recovery',
    init: 'none',
  },
];

const INIT_SCRIPTS = {
  none: null,
  'no-webgpu': () => {
    Object.defineProperty(navigator, 'gpu', { configurable: true, get: () => undefined });
  },
  'no-webgpu-no-webgl2': () => {
    Object.defineProperty(navigator, 'gpu', { configurable: true, get: () => undefined });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type === 'webgl2') return null;
      return original.call(this, type, ...rest);
    };
  },
  'no-webgpu-no-webgl': () => {
    Object.defineProperty(navigator, 'gpu', { configurable: true, get: () => undefined });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null;
      return original.call(this, type, ...rest);
    };
  },
};

function hostInfo(chromium) {
  return {
    os: `${os.version()} (${os.release()})`,
    cpu: os.cpus()[0].model.trim().replace(/\s+/g, ' '),
    threads: os.cpus().length,
    memoryGiB: Math.round(os.totalmem() / 2 ** 30),
    node: process.version.replace(/^v/, ''),
    chromium,
  };
}

async function deriveReport() {
  const payload = JSON.parse(await readFile(browserFile, 'utf8'));
  const [fallback, recovery] = await Promise.all([
    deterministic.runFallbackChecks(),
    deterministic.runRecoveryChecks(),
  ]);
  const report = contract.buildCompatReport({
    capturedAt: payload.capturedAt,
    host: payload.host,
    observations: payload.batch,
    declared: contract.COMPAT_DECLARED_MATRIX,
    fallback,
    recovery,
  });
  return {
    report,
    json: `${JSON.stringify(report, null, 2)}\n`,
    markdown: contract.compatReportMarkdown(report),
  };
}

function printSummary(report) {
  for (const row of report.matrix)
    console.log(
      `${row.verdict} ${row.id} · ${row.scenario} · ${row.browser}/${row.channel} · ${row.backend} (așteptat ${row.expectedBackend}) · ${row.gpu.label}`,
    );
  for (const entry of [...report.deterministic.fallback, ...report.deterministic.recovery])
    console.log(`${entry.pass ? 'PASS' : 'FAIL'} ${entry.id}: ${entry.detail}`);
  console.log(
    `SUMMARY rows ${report.summary.rows}, pass ${report.summary.pass}, fail ${report.summary.fail}, NOT_RUN ${report.summary.declaredNotRun}, determinist ${report.summary.deterministicPass}/${report.summary.deterministicChecks}, verdict ${report.summary.fail === 0 && report.summary.deterministicPass === report.summary.deterministicChecks ? 'PASS' : 'FAIL'}`,
  );
  const issues = contract.verifyCompatReport(report);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`ISSUE ${issue}`);
    process.exitCode = 1;
  }
  if (
    report.summary.fail > 0 ||
    report.summary.deterministicPass < report.summary.deterministicChecks
  )
    process.exitCode = 1;
}

async function writeReports() {
  const { report, json, markdown } = await deriveReport();
  printSummary(report);
  if (wantsCheck) {
    const saved = await readFile(reportJson, 'utf8');
    if (saved !== json) {
      console.error(`Compat matrix report is stale: ${reportJson}`);
      process.exitCode = 1;
    } else console.log(`Compat matrix report is current: ${reportJson}`);
    const savedMarkdown = await readFile(reportMarkdown, 'utf8');
    if (savedMarkdown !== markdown) {
      console.error(`Compat matrix markdown is stale: ${reportMarkdown}`);
      process.exitCode = 1;
    } else console.log(`Compat matrix markdown is current: ${reportMarkdown}`);
    return;
  }
  await mkdir(evidence, { recursive: true });
  await writeFile(reportJson, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${reportJson}`);
  console.log(`Wrote ${reportMarkdown}`);
}

async function waitForProductionState(page) {
  await page.waitForFunction(
    () => {
      const section = document.querySelector('#app section');
      return (
        section !== null && (section.dataset.state === 'READY' || section.dataset.state === 'ERROR')
      );
    },
    null,
    { timeout: 90000 },
  );
}

async function readProductionState(page) {
  return page.evaluate(() => {
    const section = document.querySelector('#app section');
    const statusElement = section?.querySelector('[role="status"], [role="alert"]') ?? null;
    const canvas = section?.querySelector('canvas') ?? null;
    const retry = [...(section?.querySelectorAll('button') ?? [])].find((button) =>
      (button.textContent ?? '').includes('Re'),
    );
    const statusText = statusElement?.textContent ?? null;
    const backendMatch = /· (WEBGPU|WEBGL2)$/.exec(statusText ?? '');
    let contextAlive = false;
    let glVersion = null;
    if (canvas !== null) {
      const gl = canvas.getContext('webgl2');
      if (gl !== null) {
        contextAlive = !gl.isContextLost();
        glVersion = gl.getParameter(gl.VERSION);
      } else contextAlive = canvas.getContext('webgpu') !== null;
    }
    return {
      state: section?.dataset.state ?? null,
      statusText,
      backend: backendMatch?.[1] ?? 'NONE',
      contextAlive,
      glVersion,
      retryVisible: retry === undefined ? false : !retry.hidden,
      visibleContent: document.body.innerText.trim().length > 0,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
    };
  });
}

async function analyzeScreenshot(page, bytes) {
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context === null) return null;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let minLuma = 255;
    let maxLuma = 0;
    for (let index = 0; index < data.length; index += 4) {
      colors.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
      const luma = Math.round(
        0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2],
      );
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);
    }
    return {
      width: image.width,
      height: image.height,
      distinctColors: colors.size,
      lumaSpread: maxLuma - minLuma,
    };
  }, bytes.toString('base64'));
}

async function captureScreenshot(page, file) {
  await mkdir(evidence, { recursive: true });
  const bytes = await page.screenshot({ path: join(evidence, file), fullPage: true });
  const stats = await analyzeScreenshot(page, bytes);
  return { file, bytes: bytes.length, ...stats };
}

async function capabilitiesOf(context, platform) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${origin}/tests/browser/compat-154/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__compatReady === true, null, { timeout: 30000 });
  const capabilities = await page.evaluate(
    (osLabel) => window.__compatCapabilities(osLabel),
    platform,
  );
  await page.close();
  if (errors.length > 0) throw new Error(`Capability probe: ${errors.join(' | ')}`);
  return capabilities;
}

async function runProduction(browser, definition, capabilities) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const pageErrors = [];
  try {
    const init = INIT_SCRIPTS[definition.init];
    if (init !== null) await context.addInitScript(init);
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.goto(origin, { waitUntil: 'load' });
    let failure = null;
    try {
      await waitForProductionState(page);
    } catch (error) {
      failure = String(error).split('\n')[0];
    }
    const state = await readProductionState(page);
    const capture = await captureScreenshot(page, `${definition.id}.png`);
    return {
      ...observationBase(definition, capabilities),
      backend: state.backend,
      statusText: state.statusText,
      visibleContent: state.visibleContent,
      retryVisible: state.retryVisible,
      errorMessage:
        state.state === 'ERROR'
          ? (state.statusText ?? 'Stare ERROR fără mesaj')
          : failure === null
            ? null
            : `Timeout: ${failure}`,
      renderEvidence: {
        contextAlive: state.state === 'ERROR' ? false : state.contextAlive,
        activeMeshes: null,
        framesAdvanced: null,
        canvasWidth: state.canvasWidth,
        canvasHeight: state.canvasHeight,
      },
      recovery: null,
      screenshots: [capture.file],
      screenshotStats: [capture],
      pageErrors,
    };
  } finally {
    await context.close();
  }
}

async function runHarness(browser, definition, capabilities) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const pageErrors = [];
  try {
    const init = INIT_SCRIPTS[definition.init];
    if (init !== null) await context.addInitScript(init);
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.goto(`${origin}/tests/browser/compat-154/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__compatReady === true, null, { timeout: 30000 });
    if (definition.mode === 'probe') {
      const probe = await page.evaluate(
        (preference) => window.__compatBackend(preference),
        definition.preference,
      );
      const capture = await captureScreenshot(page, `${definition.id}.png`);
      return {
        ...observationBase(definition, capabilities),
        backend: probe.backend,
        statusText:
          probe.status === 'READY'
            ? `Scenă de probă READY · ${probe.backend}`
            : `Randarea nu a pornit. ${probe.error ?? ''}`,
        visibleContent: true,
        retryVisible: false,
        errorMessage: probe.error,
        renderEvidence: {
          contextAlive: probe.contextAlive,
          activeMeshes: probe.activeMeshes,
          framesAdvanced: probe.framesAdvanced,
          canvasWidth: probe.canvasWidth,
          canvasHeight: probe.canvasHeight,
        },
        recovery: null,
        screenshots: [capture.file],
        screenshotStats: [capture],
        pageErrors,
      };
    }
    const screenshots = [];
    const running = page.evaluate(
      (preference) => window.__compatRecovery(preference),
      definition.preference,
    );
    const waitForStatus = async (prefix) => {
      try {
        await page.waitForFunction(
          (expected) => (document.querySelector('#status')?.textContent ?? '').startsWith(expected),
          prefix,
          { timeout: 90000 },
        );
        return true;
      } catch {
        return false;
      }
    };
    await waitForStatus('Scenă de probă READY');
    screenshots.push(await captureScreenshot(page, `${definition.id}-ready.png`));
    await waitForStatus('Randarea nu a pornit.');
    screenshots.push(await captureScreenshot(page, `${definition.id}-error.png`));
    await waitForStatus('Scenă de probă READY');
    screenshots.push(await captureScreenshot(page, `${definition.id}-retry.png`));
    const recovery = await running;
    const finalStatus = await page.evaluate(
      () => document.querySelector('#status')?.textContent ?? null,
    );
    return {
      ...observationBase(definition, capabilities),
      backend: recovery.backend,
      statusText: finalStatus,
      visibleContent: true,
      retryVisible: false,
      errorMessage: recovery.errorMessage,
      renderEvidence: {
        contextAlive: recovery.activeMeshes > 0 && recovery.diagnostics?.canvasConnected === true,
        activeMeshes: recovery.activeMeshes,
        framesAdvanced: recovery.framesAdvanced,
        canvasWidth: 640,
        canvasHeight: 360,
      },
      recovery,
      screenshots: screenshots.map((entry) => entry.file),
      screenshotStats: screenshots,
      pageErrors,
    };
  } finally {
    await context.close();
  }
}

function observationBase(definition, capabilities) {
  return {
    id: definition.id,
    title: definition.title,
    entry: definition.entry ?? (definition.mode === undefined ? 'production' : 'compat-harness'),
    scenario: definition.scenario,
    preference: definition.preference,
    capabilities,
  };
}

async function captureBrowser() {
  const configured = process.env.PLAYWRIGHT_MODULE;
  let playwright;
  try {
    playwright = await import(configured ? pathToFileURL(resolve(configured)).href : 'playwright');
  } catch {
    console.log(
      'SKIP browser matrix: Playwright is not installed. Set PLAYWRIGHT_MODULE to its entry point.',
    );
    return;
  }
  const { chromium } = playwright.default ?? playwright;
  const { build } = await import('vite');
  await build({
    configFile: false,
    root,
    base: './',
    cacheDir: join(root, '.pbi-validation-154', 'cache'),
    build: {
      outDir: buildDirectory,
      emptyOutDir: true,
      rollupOptions: {
        input: {
          production: join(root, 'index.html'),
          compat: join(root, 'tests', 'browser', 'compat-154', 'index.html'),
        },
      },
    },
  });

  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.wasm': 'application/wasm',
  };
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'GET') {
        response.writeHead(405).end();
        return;
      }
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const file = resolve(buildDirectory, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(buildDirectory + sep) || !(await stat(file)).isFile()) {
        response.writeHead(404).end();
        return;
      }
      const data = await readFile(file);
      response.writeHead(200, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Content-Length': data.length,
      });
      response.end(data);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;

  const headed = await chromium.launch({ headless: false });
  const headless = await chromium.launch({ headless: true });
  const batch = [];
  try {
    const host = hostInfo(headed.version());
    for (const definition of PRODUCTION_SCENARIOS) {
      const browser = definition.headless ? headless : headed;
      const probeContext = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
      });
      const init = INIT_SCRIPTS[definition.init];
      if (init !== null) await probeContext.addInitScript(init);
      const capabilities = await capabilitiesOf(probeContext, host.os);
      capabilities.browser = `Chromium ${browser.version()}`;
      capabilities.browserVersion = browser.version();
      await probeContext.close();
      const observation = await runProduction(browser, definition, capabilities);
      batch.push(observation);
      console.log(
        `CAPTURE ${definition.id} · ${observation.backend} · ${observation.screenshots.join(', ')}`,
      );
    }
    for (const definition of HARNESS_SCENARIOS) {
      const browser = definition.headless ? headless : headed;
      const probeContext = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
      });
      const init = INIT_SCRIPTS[definition.init];
      if (init !== null) await probeContext.addInitScript(init);
      const capabilities = await capabilitiesOf(probeContext, host.os);
      capabilities.browser = `Chromium ${browser.version()}`;
      capabilities.browserVersion = browser.version();
      await probeContext.close();
      const observation = await runHarness(browser, definition, capabilities);
      batch.push(observation);
      console.log(
        `CAPTURE ${definition.id} · ${observation.backend} · ${observation.screenshots.join(', ')}`,
      );
    }
    await mkdir(evidence, { recursive: true });
    await writeFile(
      browserFile,
      `${JSON.stringify(
        {
          version: contract.COMPAT_MATRIX_VERSION,
          capturedBy: 'scripts/run-compat-matrix-report.mjs --browser',
          capturedAt: new Date().toISOString(),
          host,
          note: 'Observații reale din Chromium: intrarea de producție src/main.ts, contractele src/rendering apelate direct, fallback forțat prin eliminarea navigator.gpu și pierderi native de dispozitiv/context. Capturile și statisticile de pixeli sunt dovezi, nu verdictul.',
          batch,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Wrote ${browserFile}`);
  } finally {
    await headed.close();
    await headless.close();
    server.close();
  }
  return true;
}

if (wantsBrowser) {
  const captured = await captureBrowser();
  if (captured === true) await writeReports();
} else {
  await writeReports();
}
