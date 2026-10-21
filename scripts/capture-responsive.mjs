import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Optional 084 browser measurement. It opens the responsive fixture in Chromium, measures the real
 * rectangles with `window.__measureResponsive()`, asserts that no panel covers an essential control,
 * that text stays legible and that the fleet/centre panels scroll, then writes PNGs and a JSON
 * measurement report. It is not part of `npm test`; set PLAYWRIGHT_MODULE when Playwright is
 * installed elsewhere. Without Playwright the script exits 0 with an explicit SKIP.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '084-responsive-pc'),
  fixture = join(root, 'tests', 'ui', 'responsive-fixture.html'),
  style = await readFile(join(root, 'src', 'style.css'), 'utf8'),
  html = await readFile(fixture, 'utf8');

const cases = [
  {
    name: '1280x720-profile',
    width: 1280,
    height: 720,
    zoom: 1,
    center: 'profile',
    region: 'STANDARD',
  },
  {
    name: '1920x1080-profile',
    width: 1920,
    height: 1080,
    zoom: 1,
    center: 'profile',
    region: 'LARGE',
  },
  {
    name: '853x480-zoom150-profile',
    width: 853,
    height: 480,
    zoom: 1.5,
    center: 'profile',
    region: 'COMPACT',
  },
  { name: '1280x720-city', width: 1280, height: 720, zoom: 1, center: 'city', region: 'STANDARD' },
  {
    name: '1280x720-settings',
    width: 1280,
    height: 720,
    zoom: 1,
    center: 'settings',
    region: 'STANDARD',
  },
];

let playwright;
try {
  const configured = process.env.PLAYWRIGHT_MODULE;
  playwright = await import(configured ? pathToFileURL(resolve(configured)).href : 'playwright');
} catch {
  console.log(
    'SKIP responsive capture: Playwright is not installed. Set PLAYWRIGHT_MODULE to its entry point.',
  );
  process.exit(0);
}

const compose = (entry) => {
  const options = JSON.stringify({ center: entry.center, zoom: entry.zoom });
  return html
    .replace('<link rel="stylesheet" href="../../src/style.css" />', `<style>${style}</style>`)
    .replace(
      '<meta charset="utf-8" />',
      `<meta charset="utf-8" />\n    <script>window.__fixtureOptions = ${options};</script>`,
    );
};

const { chromium } = playwright,
  browser = await chromium.launch({ headless: true }),
  browserVersion = browser.version(),
  page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }),
  captures = [];
let failed = false;
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));

await mkdir(evidence, { recursive: true });
try {
  for (const entry of cases) {
    await page.setViewportSize({ width: entry.width, height: entry.height });
    await page.setContent(compose(entry), { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__fixtureReady === true);
    const measured = await page.evaluate(() => globalThis.__measureResponsive());
    const panelRects = Object.entries(measured.rects).filter(([id]) => id.startsWith('panel-'));
    const essentialRects = Object.entries(measured.rects).filter(([id]) =>
      id.startsWith('essential-'),
    );
    const outsideViewport = [
      ...panelRects.filter(([, value]) => value.visible).map(([id, value]) => [id, value.rect]),
      ...essentialRects.filter(([, value]) => value.visible).map(([id, value]) => [id, value.rect]),
    ].filter(
      ([, rect]) =>
        !rect ||
        rect.x < -0.5 ||
        rect.y < -0.5 ||
        rect.right > entry.width + 0.5 ||
        rect.bottom > entry.height + 0.5,
    );
    const critical = measured.overlaps.filter((overlap) => overlap.severity === 'critical');
    const hiddenEssentials = essentialRects.filter(([, value]) => !value.visible).map(([id]) => id);
    const checks = [
      {
        name: 'media-query-region',
        pass:
          measured.compact === (entry.region === 'COMPACT') &&
          measured.large === (entry.region === 'LARGE'),
        actual: { compact: measured.compact, large: measured.large },
      },
      { name: 'thirty-fleet-rows', pass: measured.rows === 30, actual: measured.rows },
      {
        name: 'essential-controls-visible',
        pass: hiddenEssentials.length === 0,
        actual: hiddenEssentials,
      },
      { name: 'no-critical-overlap', pass: critical.length === 0, actual: critical },
      {
        name: 'fleet-list-scrolls',
        pass:
          measured.scrollable.fleetRows !== null &&
          measured.scrollable.fleetRows.scrollable === true &&
          measured.scrollable.fleetRows.overflowY === 'auto',
        actual: measured.scrollable.fleetRows,
      },
      {
        name: 'centre-panel-scrolls',
        pass:
          measured.scrollable.centerVisible !== null &&
          measured.scrollable.centerVisible.overflowY === 'auto' &&
          measured.scrollable.centerVisible.maxHeight !== 'none',
        actual: measured.scrollable.centerVisible,
      },
      {
        name: 'text-legible',
        pass: measured.minFontPx !== null && measured.minFontPx >= 12,
        actual: { minFontPx: measured.minFontPx, selector: measured.minFontSelector },
      },
      {
        name: 'line-height-legible',
        pass: measured.lineHeight.ratio >= 1.4,
        actual: measured.lineHeight,
      },
      { name: 'inside-viewport', pass: outsideViewport.length === 0, actual: outsideViewport },
    ];
    const file = `capture-${entry.name}.png`;
    const bytes = await page.screenshot({ path: join(evidence, file) });
    checks.push({
      name: 'png-signature',
      pass:
        bytes.length > 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47,
      actual: bytes.length,
    });
    if (checks.some((check) => !check.pass)) failed = true;
    if (pageErrors.length > 0) {
      failed = true;
      console.log(`PAGE ERRORS ${entry.name}: ${pageErrors.join(' | ')}`);
      pageErrors.length = 0;
    }
    captures.push({
      name: entry.name,
      screenshot: file,
      bytes: bytes.length,
      viewport: { width: entry.width, height: entry.height },
      zoom: entry.zoom,
      expectedRegion: entry.region,
      center: entry.center,
      measured,
      checks,
    });
    console.log(
      `${checks.every((check) => check.pass) ? 'PASS' : 'FAIL'} CAPTURE ${entry.name} ${file}`,
    );
  }
} finally {
  await browser.close();
}

const payload = {
    version: '084-responsive-layout-v1',
    browser: `Chromium ${browserVersion}`,
    note: 'Real browser rectangles from tests/ui/responsive-fixture.html; the 853x480 case represents a 1280x720 window at 150% browser zoom.',
    cases: cases.map((entry) => ({
      name: entry.name,
      width: entry.width,
      height: entry.height,
      zoom: entry.zoom,
      center: entry.center,
    })),
    captures,
    summary: {
      captures: captures.length,
      checks: captures.reduce((total, entry) => total + entry.checks.length, 0),
      passed: captures.reduce(
        (total, entry) => total + entry.checks.filter((check) => check.pass).length,
        0,
      ),
      pass: !failed,
    },
  },
  json = `${JSON.stringify(payload, null, 2)}\n`,
  output = join(evidence, 'capture.json');
await writeFile(output, json);
console.log(
  `SUMMARY captures ${payload.summary.captures}, checks ${payload.summary.passed}/${payload.summary.checks}, overall ${payload.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(`Wrote ${output}`);
if (failed) process.exitCode = 1;
