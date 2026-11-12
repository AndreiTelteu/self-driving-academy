import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 153 visual and accessibility QA report.
 *
 * `npm run qa:ui` evaluates the committed browser measurements with the deterministic contract in
 * `tests/ui/ui-qa.ts` and writes `report.json` + `report.md`. `--check` compares the committed
 * files with a fresh derivation and exits non-zero when they are stale.
 *
 * `--browser` is the real capture: it builds `tests/browser/qa-ui-153/`, mounts the real
 * `src/ui` components in Chromium at every declared viewport, presses real Tab/Escape keys, writes
 * one PNG per capture and refreshes `measurements.json`. It needs Playwright (`PLAYWRIGHT_MODULE`
 * points at its entry point); without Playwright it prints an explicit SKIP and never pretends the
 * browser ran.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '153-ui-qa'),
  measurementsFile = join(evidence, 'measurements.json'),
  reportJson = join(evidence, 'report.json'),
  reportMarkdown = join(evidence, 'report.md'),
  browserRoot = join(root, 'tests', 'browser', 'qa-ui-153'),
  buildDirectory = join(root, '.pbi-validation-153', 'build');

const wantsCheck = process.argv.includes('--check') && !process.argv.includes('--browser'),
  wantsBrowser = process.argv.includes('--browser'),
  wantsStrict = process.argv.includes('--strict');

const contract = await import(pathToFileURL(join(root, 'tests', 'ui', 'ui-qa.ts')).href);

function markdownOf(report) {
  return contract.uiQaReportMarkdown(report);
}

async function loadCaptures() {
  const raw = await readFile(measurementsFile, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.captures) || parsed.captures.length === 0)
    throw new Error(`No captures in ${measurementsFile}`);
  return parsed.captures;
}

function reportOf(captures) {
  return contract.buildUiQaReport({
    generatedBy: 'scripts/run-ui-qa-report.mjs',
    command: 'npm run qa:ui',
    captures,
  });
}

async function writeReports(captures) {
  const report = reportOf(captures),
    json = `${JSON.stringify(report, null, 2)}\n`,
    markdown = markdownOf(report);
  for (const scenario of report.scenarios)
    console.log(
      `${scenario.verdict} ${scenario.scenario} ${scenario.viewport} (${scenario.tier}) ${scenario.checks.filter((check) => check.pass).length}/${scenario.checks.length}${scenario.failed.length === 0 ? '' : ` failed: ${scenario.failed.join(', ')}`}`,
    );
  for (const finding of report.findings)
    console.log(
      `FINDING ${finding.id} ${finding.tier} ${finding.surface} ${finding.viewport} ${finding.check}`,
    );
  console.log(
    `SUMMARY captures ${report.summary.captures}, contract ${report.summary.contractCaptures}, stress ${report.summary.stressCaptures}, checks ${report.summary.passed}/${report.summary.checks}, contract failed ${report.summary.contractFailed}, findings ${report.summary.findings}, verdict ${report.summary.verdict}`,
  );
  if (wantsCheck) {
    const saved = await readFile(reportJson, 'utf8');
    if (saved !== json) {
      console.error(`UI QA report is stale: ${reportJson}`);
      process.exitCode = 1;
    } else console.log(`UI QA report is current: ${reportJson}`);
    const savedMarkdown = await readFile(reportMarkdown, 'utf8');
    if (savedMarkdown !== markdown) {
      console.error(`UI QA markdown is stale: ${reportMarkdown}`);
      process.exitCode = 1;
    } else console.log(`UI QA markdown is current: ${reportMarkdown}`);
  } else {
    await mkdir(evidence, { recursive: true });
    await writeFile(reportJson, json);
    await writeFile(reportMarkdown, markdown);
    console.log(`Wrote ${reportJson}`);
    console.log(`Wrote ${reportMarkdown}`);
  }
  // A QA run that found a defect succeeded at reporting it; `--strict` turns a CONTRACT finding into
  // a failing gate for the PBI that owns the fix.
  if (wantsStrict && !report.summary.contractPass) process.exitCode = 1;
  return report;
}

function capturePlan() {
  return contract.UI_QA_CAPTURE_PLAN.map((entry) => {
    const viewport = contract.UI_QA_VIEWPORTS.find((candidate) => candidate.id === entry.viewport),
      scenario = contract.UI_QA_SCENARIOS.find((candidate) => candidate.id === entry.scenario);
    if (viewport === undefined) throw new Error(`Unknown viewport ${entry.viewport}`);
    if (scenario === undefined) throw new Error(`Unknown scenario ${entry.scenario}`);
    return Object.freeze({
      scenario: scenario.id,
      title: scenario.title,
      viewport: viewport.id,
      tier: viewport.tier,
      declared: {
        id: viewport.id,
        widthPx: viewport.widthPx,
        heightPx: viewport.heightPx,
        zoom: viewport.zoom,
      },
      // Playwright has no browser-zoom switch; the effective CSS viewport is what the media
      // queries see, so a zoomed case is captured at `width / zoom` CSS pixels.
      renderWidthPx: Math.round(viewport.widthPx / viewport.zoom),
      renderHeightPx: Math.round(viewport.heightPx / viewport.zoom),
      screenshot: `capture-${scenario.id}-${viewport.id}.png`,
    });
  });
}

async function runBrowserCapture() {
  const configured = process.env.PLAYWRIGHT_MODULE;
  let playwright;
  try {
    playwright = await import(configured ? pathToFileURL(resolve(configured)).href : 'playwright');
  } catch {
    console.log(
      'SKIP browser capture: Playwright is not installed. Set PLAYWRIGHT_MODULE to its entry point.',
    );
    return null;
  }
  const { chromium } = playwright.default ?? playwright;
  const { build } = await import('vite');
  await build({
    configFile: false,
    root: browserRoot,
    base: './',
    cacheDir: join(root, '.pbi-validation-153', 'cache'),
    build: { outDir: buildDirectory, emptyOutDir: true },
  });

  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
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
  const origin = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;

  const browser = await chromium.launch({ headless: true });
  const browserLabel = `Chromium ${browser.version()}`;
  const captures = [];
  const pageErrors = [];
  let failed = false;
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.goto(origin, { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__qaReady === true);
    await mkdir(evidence, { recursive: true });

    for (const entry of capturePlan()) {
      await page.setViewportSize({
        width: entry.renderWidthPx,
        height: entry.renderHeightPx,
      });
      const prepared = await page.evaluate(
        (scenario) => globalThis.__qaPrepare(scenario),
        entry.scenario,
      );
      const openBefore = await page.evaluate(() => globalThis.__qaFocus());
      const structural = await page.evaluate(
        (viewport) =>
          globalThis.__qaMeasure(
            {
              stops: [],
              escapeClosed: false,
              escapeReason: null,
              focusRestored: false,
              dialogOpenBefore: false,
              dialogOpenAfter: false,
              trapExpected: false,
            },
            viewport,
          ),
        entry.declared,
      );
      // One real Tab press before the capture, so the screenshot shows a visible focus ring.
      await page.keyboard.press('Tab');
      const bytes = await page.screenshot({ path: join(evidence, entry.screenshot) });
      const pngSignature =
        bytes.length > 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47;
      if (!pngSignature) {
        failed = true;
        console.log(`FAIL PNG ${entry.screenshot}`);
      }
      const stops = [];
      const seen = new Set();
      for (let index = 0; index < 16; index += 1) {
        const focused = await page.evaluate(() => globalThis.__qaFocus());
        if (focused.descriptor !== 'body') {
          if (seen.has(focused.descriptor)) break;
          seen.add(focused.descriptor);
          stops.push({ order: stops.length + 1, ...focused });
        }
        if (index < 15) await page.keyboard.press('Tab');
        if (stops.length >= 14) break;
      }
      let escape = null;
      if (prepared.trapExpected) {
        await page.keyboard.press('Escape');
        escape = await page.evaluate(() => globalThis.__qaFocus());
      }
      structural.keyboard = {
        stops: stops.map((stop) => ({
          order: stop.order,
          descriptor: stop.descriptor,
          surface: stop.surface,
          native: stop.native,
          outlineStyle: stop.outlineStyle,
          outlineWidthPx: stop.outlineWidthPx,
          insideDialog: stop.insideDialog,
        })),
        escapeClosed: escape === null ? false : escape.dialogOpen === false,
        escapeReason: escape === null ? 'Scenariul nu are un dialog modal de închis.' : null,
        focusRestored:
          escape === null ? false : escape.dialogOpen === false && escape.insideDialog === false,
        dialogOpenBefore: openBefore.dialogOpen,
        dialogOpenAfter: escape === null ? openBefore.dialogOpen : escape.dialogOpen,
        trapExpected: prepared.trapExpected,
      };
      structural.browser = browserLabel;
      if (pageErrors.length > 0) {
        failed = true;
        console.log(`PAGE ERRORS ${entry.scenario}/${entry.viewport}: ${pageErrors.join(' | ')}`);
        pageErrors.length = 0;
      }
      const evaluation = contract.evaluateUiQaMeasurement(structural);
      if (evaluation.verdict === 'FAIL' && evaluation.tier === 'CONTRACT')
        console.log(`FAIL ${entry.scenario} ${entry.viewport}: ${evaluation.failed.join(', ')}`);
      captures.push({ screenshot: entry.screenshot, bytes: bytes.length, measurement: structural });
      console.log(
        `${evaluation.verdict} CAPTURE ${entry.scenario} ${entry.viewport} ${entry.screenshot} (${bytes.length} bytes, ${stops.length} tab stops)`,
      );
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (pageErrors.length > 0) failed = true;
  const payload = {
    version: contract.UI_QA_VERSION,
    capturedBy: 'scripts/run-ui-qa-report.mjs --browser',
    browser: browserLabel,
    note: 'Măsurători reale de DOM din Chromium: componentele reale din src/ui, CSS-ul real, Tab/Escape reale. Zoomul este capturat la viewport-ul CSS efectiv (width / zoom).',
    captures,
    summary: {
      captures: captures.length,
      bytes: captures.reduce((total, capture) => total + capture.bytes, 0),
      pageErrors: failed ? 1 : 0,
    },
  };
  await writeFile(measurementsFile, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${measurementsFile}`);
  return captures;
}

if (wantsBrowser) {
  const captures = await runBrowserCapture();
  if (captures === null) process.exit(0);
  await writeReports(captures);
} else {
  const captures = await loadCaptures();
  await writeReports(captures);
}
