import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 273 deterministic browser fixture probe.
 *
 * Chromium opens a fixture page that runs the real 272 telemetry writer, the real 103/221 queue
 * harness, the real 109 store, the real 110 activation and the real 205 barrier over the real
 * 032/033 map. The LEARNING segment is deterministic and contains a real ELIGIBLE 087 window, so the
 * page proves the full publication instead of waiting for a lucky live window.
 *
 * This file writes `browser-fixture.json`/`browser-fixture.md`; it never overwrites the live-game
 * `browser.json`, which remains the documented 4/9 limitation. Playwright is optional: without it
 * the result is NOT_RUN with the real reason, never a fabricated PASS.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, 'Docs', 'Evidence', '273-live-learning');
const browserJson = join(directory, 'browser-fixture.json');
const browserMarkdown = join(directory, 'browser-fixture.md');
const screenshots = join(directory, 'screenshots');
const buildDirectory = join(root, '.pbi-validation-273', 'browser-fixture');
const VERSION = '273-live-learning-fixture-v1';

async function loadPlaywright() {
  const explicit = process.env.PLAYWRIGHT_MODULE;
  try {
    if (explicit) {
      const resolved = resolve(explicit);
      const entry = /\.(?:c|m)?js$/.test(resolved) ? resolved : join(resolved, 'index.js');
      return await import(pathToFileURL(entry).href);
    }
    return await import('playwright');
  } catch {
    return null;
  }
}

function mimeType(file) {
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.wasm': 'application/wasm',
    }[extname(file)] ?? 'application/octet-stream'
  );
}

async function serve(directoryPath) {
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'GET') {
        response.writeHead(405).end();
        return;
      }
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/favicon.ico') {
        response.writeHead(204).end();
        return;
      }
      const file = resolve(directoryPath, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(directoryPath + sep) || !(await stat(file)).isFile()) {
        response.writeHead(404).end();
        return;
      }
      const data = await readFile(file);
      response.writeHead(200, {
        'Content-Type': mimeType(file),
        'Cache-Control': 'no-store',
        'Content-Length': data.length,
      });
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  const origin = `http://127.0.0.1:${
    typeof address === 'object' && address !== null ? address.port : 0
  }`;
  return { server, origin };
}

function selectedStats(stats) {
  if (stats === null || stats === undefined) return null;
  return {
    segments: stats.segments,
    eligible: stats.eligible,
    jobs: stats.jobs,
    versions: stats.versions,
    noChange: stats.noChange,
    insufficientEvidence: stats.insufficientEvidence,
    stale: stats.stale,
    failed: stats.failed,
    deduplicated: stats.deduplicated,
    activationsPublished: stats.activationsPublished,
    activationsApplied: stats.activationsApplied,
    epochChanges: stats.epochChanges,
    headVersionId: stats.headVersionId,
    learningEpoch: stats.learningEpoch,
  };
}

function markdown(result) {
  if (!result.run) {
    return `# 273 — proba de browser deterministă a pipeline-ului live de learning

Generată de \`npm run learning:live:fixture\`.

**NOT_RUN** — ${result.reason}

Proba live din \`browser.json\` rămâne separată și limitată; niciun PASS nu este simulat.
`;
  }
  const run = result.run;
  const checks = run.checks
    .map(
      (entry) =>
        `| \`${entry.name}\` | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.expected ?? '—'} | ${entry.actual ?? '—'} | ${entry.detail} |`,
    )
    .join('\n');
  return `# 273 — proba de browser deterministă a pipeline-ului live de learning

Generată de \`npm run learning:live:fixture\`; Chromium ${run.browser}, viewport ${run.viewport}.
Fixture: \`${run.fixtureVersion}\`. Rulează modulele reale 272/103/221/109/110/205 peste harta reală
032/033; numai transportul \`worker_threads\` al cozii 103 este înlocuit de harness-ul cu microtask,
ca în testele Node. Nu există o a doua simulare, un al doilea estimator sau un store paralel.

Segmentul LEARNING determinist are ${run.segment?.samples ?? '—'} eșantioane 085 reale și fereastra
087 \`${run.window?.label ?? '—'}\` la tick ${run.window?.openedTick ?? '—'}–${run.window?.lastTick ?? '—'}.
Capturi: ${(run.screenshots ?? []).map((file) => `[${file}](${file})`).join(', ')}.

## Rezultat

| Fapt | Valoare |
| --- | --- |
| Segment | \`${run.segmentId}\` |
| Joburi / versiuni | ${run.stats?.jobs ?? '—'} / ${run.stats?.versions ?? '—'} |
| Versiune imuabilă | \`${run.version?.versionId ?? '—'}\` (părinte \`${run.version?.parentVersionId ?? '—'}\`, adâncime ${run.version?.depth ?? '—'}) |
| Valoare | ${run.version?.changedKey ?? '—'}: ${run.version?.baseValue ?? '—'} → ${run.version?.composedValue ?? '—'} |
| Activare | ${run.activation?.status ?? '—'} la tick ${run.activation?.activateAtTick ?? '—'}, aplicată la ${run.activation?.appliedAtTick ?? '—'} |
| Flotă | ${run.fleet?.taxis ?? '—'} taxiuri + ${run.fleet?.civilians ?? '—'} civili = ${run.fleet?.total ?? '—'}, versiuni ${(run.fleet?.versions ?? []).join(', ')} |
| Fingerprint profil | \`${run.profile?.fingerprintBefore ?? '—'}\` → \`${run.profile?.fingerprintAfter ?? '—'}\` |
| Fingerprint XP | \`${run.xp?.fingerprintBefore ?? '—'}\` = \`${run.xp?.fingerprintAfter ?? '—'}\` (${run.xp?.writer ?? '—'}) |
| Epoch | ${run.stats?.learningEpoch ?? '—'} |

## Verificări

| Check | Verdict | Expected | Actual | Detaliu |
| --- | --- | --- | --- | --- |
${checks}

Final: **${result.status}** — ${result.reason ?? 'toate verificările reale au trecut'}.

## Limitări

- Aceasta este o probă de fixture determinist în Chromium, nu lumea live jucată cu tastatura; probei
  live îi lipsește fereastra 087 eligibilă în prefixul de 10 s și rămâne raportată separat în
  \`browser.json\` (4/9), fără PASS simulat.
- Transportul 103 din pagină este harness-ul cu microtask; raportul Node măsoară \`WorkerRuntime\` real.
- Nu este o măsurătoare FPS/GPU/hardware și nu acoperă UI-ul 274, setările 279, fizica 282 sau
  persistența 278.
`;
}

const generatedAt = new Date().toISOString();
const playwright = await loadPlaywright();
await mkdir(directory, { recursive: true });
await mkdir(screenshots, { recursive: true });

if (playwright === null) {
  const result = {
    version: VERSION,
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the fixture browser probe was not run.',
    run: null,
  };
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(browserMarkdown, markdown(result));
  console.log(`Wrote ${browserJson}`);
  console.log(`Wrote ${browserMarkdown}`);
  console.log('Live learning fixture probe NOT_RUN: Playwright is not installed.');
  process.exit(0);
}

const { build } = await import('vite');
await build({
  configFile: join(root, 'vite.config.ts'),
  logLevel: 'error',
  build: {
    outDir: buildDirectory,
    emptyOutDir: true,
    rollupOptions: { input: join(root, 'tests', 'browser', 'live-learning', 'index.html') },
  },
});

const { server, origin } = await serve(buildDirectory);
const { chromium } = playwright.default ?? playwright;
const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE ??
  (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : null);
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;
let browser;
try {
  browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADED === '1' ? false : true,
    ...(executablePath === null ? {} : { executablePath }),
    ...(channel === undefined ? {} : { channel }),
    args: [
      '--disable-gpu-sandbox',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-frame-rate-limit',
      '--disable-gpu-vsync',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
} catch (error) {
  server.close();
  const result = {
    version: VERSION,
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${error instanceof Error ? error.message : String(error)}`,
    run: null,
  };
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(browserMarkdown, markdown(result));
  console.log(`Wrote ${browserJson}`);
  console.log(`Wrote ${browserMarkdown}`);
  console.log('Live learning fixture probe NOT_RUN: browser launch failed.');
  process.exit(0);
}

const pageErrors = [];
const consoleErrors = [];
const captured = [];
let activePage = null;
try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 720 } });
  const page = await context.newPage();
  activePage = page;
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.bringToFront();
  await page.goto(`${origin}/tests/browser/live-learning/index.html`, {
    waitUntil: 'load',
    timeout: 120000,
  });
  await page.waitForFunction(
    () => globalThis.__liveLearningProbe?.fixtureVersion === '273-live-learning-browser-v1',
    null,
    { timeout: 30000, polling: 100 },
  );

  try {
    await page.waitForFunction(
      () => globalThis.__liveLearningProbe?.phase === 'SEGMENT_CLOSED',
      null,
      { timeout: 60000, polling: 50 },
    );
    await page.screenshot({ path: join(screenshots, 'fixture-01-segment.png'), timeout: 120000 });
    captured.push('screenshots/fixture-01-segment.png');
  } catch {
    // The hold is normally visible; the terminal evidence below is authoritative.
  }
  try {
    await page.waitForFunction(() => globalThis.__liveLearningProbe?.phase === 'ACTIVATING', null, {
      timeout: 60000,
      polling: 50,
    });
    await page.screenshot({
      path: join(screenshots, 'fixture-02-activating.png'),
      timeout: 120000,
    });
    captured.push('screenshots/fixture-02-activating.png');
  } catch {
    // A fast pipeline may pass this phase before the capture.
  }

  const terminal = ['PASS', 'FAIL'];
  await page.waitForFunction(
    (states) => {
      const probe = globalThis.__liveLearningProbe;
      return probe !== undefined && states.includes(probe.status);
    },
    terminal,
    { timeout: 180000, polling: 100 },
  );
  const state = await page.evaluate(() => globalThis.__liveLearningProbe);
  const checks = [...state.checks];
  checks.push(
    {
      name: 'fixture-status',
      expected: 'PASS',
      actual: state.status,
      pass: state.status === 'PASS',
      detail: `terminal fixture status ${state.status}`,
    },
    {
      name: 'fixture-checks-present',
      expected: true,
      actual: state.checks.length >= 15,
      pass: state.checks.length >= 15,
      detail: `${state.checks.length} real checks`,
    },
    {
      name: 'no-page-errors',
      expected: 0,
      actual: pageErrors.length,
      pass: pageErrors.length === 0,
      detail: pageErrors.length === 0 ? 'no page errors' : pageErrors.join(' | '),
    },
    {
      name: 'no-console-errors',
      expected: 0,
      actual: consoleErrors.length,
      pass: consoleErrors.length === 0,
      detail: consoleErrors.length === 0 ? 'no console errors' : consoleErrors.join(' | '),
    },
  );
  const pass = state.status === 'PASS' && checks.every((entry) => entry.pass);
  await page.screenshot({ path: join(screenshots, 'fixture-03-published.png'), timeout: 120000 });
  captured.push('screenshots/fixture-03-published.png');

  const run = {
    browser: await browser.version(),
    viewport: '1360x720',
    fixtureVersion: state.fixtureVersion,
    contract: state.contract,
    segmentId: state.segmentId,
    tick: state.tick,
    segment: state.segment,
    window: state.window,
    stats: selectedStats(state.stats),
    version: state.publishedVersion,
    activation: state.activation,
    profile: state.profile,
    xp: state.xp,
    fleet: state.fleet,
    checks,
    trace: state.trace,
    pageErrors,
    consoleErrors,
    screenshots: captured,
  };
  const result = {
    version: VERSION,
    generatedAt,
    status: pass ? 'PASS' : 'FAIL',
    reason: pass ? null : (state.error ?? 'one or more real browser checks failed; see checks'),
    run,
  };
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(browserMarkdown, markdown(result));
  console.log(`Wrote ${browserJson}`);
  console.log(`Wrote ${browserMarkdown}`);
  console.log(
    `Live learning fixture browser probe ${result.status}: ${checks.filter((entry) => entry.pass).length}/${checks.length} checks`,
  );
  if (!pass) process.exitCode = 1;
} catch (error) {
  let diagnostics = null;
  if (activePage !== null) {
    try {
      diagnostics = await activePage.evaluate(() => ({
        bodyText: globalThis.document?.body?.innerText?.slice(0, 800) ?? '',
        probe: globalThis.__liveLearningProbe ?? null,
        hasApi: typeof globalThis.__liveLearningProbe,
      }));
      await activePage.screenshot({
        path: join(screenshots, 'fixture-failure.png'),
        timeout: 120000,
      });
      captured.push('screenshots/fixture-failure.png');
    } catch {
      diagnostics = null;
    }
  }
  const result = {
    version: VERSION,
    generatedAt,
    status: 'FAIL',
    reason: error instanceof Error ? (error.stack ?? error.message) : String(error),
    run: {
      checks: [],
      pageErrors,
      consoleErrors,
      diagnostics,
      screenshots: captured,
    },
  };
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(browserMarkdown, markdown(result));
  console.log(`Wrote ${browserJson}`);
  console.log(`Wrote ${browserMarkdown}`);
  console.log(`Live learning fixture browser probe FAIL: ${result.reason.split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => undefined);
  server.close();
}
