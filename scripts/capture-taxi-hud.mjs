import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Optional 073 visual capture. It renders the exact DOM snapshot produced by the real
 * `createTaxiHud` in Chromium, checks readability/layout and writes PNGs. The project does not
 * depend on Playwright; set PLAYWRIGHT_MODULE to a Playwright entry point when it is available.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '073-hud'),
  viewport = { width: 1280, height: 720 },
  wanted = ['AUTO · TO_PICKUP', 'MANUAL · TO_PICKUP', 'AUTO · SERVICE_BLOCKED', 'AUTO · no ride'];

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'app', 'taxi-hud-report.ts')).href
  ),
  report = reportModule.runTaxiHudReport(),
  style = await readFile(join(root, 'src', 'style.css'), 'utf8');

let playwright;
try {
  const configured = process.env.PLAYWRIGHT_MODULE;
  playwright = await import(configured ? pathToFileURL(resolve(configured)).href : 'playwright');
} catch {
  console.log(
    'SKIP visual capture: Playwright is not installed. Set PLAYWRIGHT_MODULE to its entry point.',
  );
  process.exit(0);
}

const stageStyle = `
  html, body { height: 100%; }
  body {
    background:
      radial-gradient(120% 90% at 78% 8%, #2e5f52 0%, #162a24 45%, #0b1411 100%);
  }
  body::before {
    content: '';
    position: fixed;
    inset: 55% -20% -25% -20%;
    background:
      linear-gradient(180deg, #26302c 0 2px, #101512 2px 100%),
      repeating-linear-gradient(90deg, #e8e2c9 0 44px, transparent 44px 96px);
    background-size: 100% 100%, 100% 4px;
    background-position: 0 0, 0 46%;
    background-repeat: no-repeat, repeat-x;
    transform: perspective(520px) rotateX(58deg);
    opacity: 0.5;
  }
  .capture-title {
    position: fixed;
    right: 1.25rem;
    bottom: 1rem;
    color: #d9e7df;
    font: 600 0.9rem system-ui, sans-serif;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.75;
  }
`;

function html(entry) {
  return `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <title>073 HUD · ${entry.name}</title>
    <link rel="icon" href="data:," />
    <style>${style}${stageStyle}</style>
  </head>
  <body>
${entry.dom}
    <p class="capture-title">073 · ${entry.name}</p>
  </body>
</html>
`;
}

const { chromium } = playwright,
  browser = await chromium.launch({ headless: true }),
  browserVersion = browser.version(),
  page = await browser.newPage({ viewport, deviceScaleFactor: 1 }),
  captures = [];
let failed = false;
try {
  for (const name of wanted) {
    const entry = report.scenarios.find((candidate) => candidate.name === name);
    if (!entry) throw new Error(`Missing report scenario: ${name}`);
    await page.setContent(html(entry), { waitUntil: 'load' });
    const observed = await page.evaluate(() => {
      const hud = globalThis.document.querySelector('section.taxi-hud'),
        speed = hud?.querySelector('output'),
        mode = hud?.querySelector('.taxi-hud__mode'),
        details = hud?.querySelector('details'),
        rect = hud?.getBoundingClientRect();
      return {
        count: globalThis.document.querySelectorAll('section.taxi-hud').length,
        text: hud?.textContent ?? '',
        ariaLabel: hud?.getAttribute('aria-label') ?? '',
        dataMode: hud?.getAttribute('data-mode') ?? '',
        dataService: hud?.getAttribute('data-service') ?? '',
        detailsOpen: details?.open ?? null,
        speedFontPx: speed ? Number.parseFloat(globalThis.getComputedStyle(speed).fontSize) : 0,
        bodyFontPx: Number.parseFloat(
          globalThis.getComputedStyle(globalThis.document.body).fontSize,
        ),
        modeFontWeight: mode ? globalThis.getComputedStyle(mode).fontWeight : '',
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        inViewport:
          rect !== null &&
          rect !== undefined &&
          rect.x >= 0 &&
          rect.y >= 0 &&
          rect.right <= globalThis.innerWidth &&
          rect.bottom <= globalThis.innerHeight,
      };
    });
    const file = `capture-${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}.png`,
      bytes = await page.screenshot({ path: join(evidence, file) }),
      checks = [
        {
          name: 'single-hud',
          pass: observed.count === 1,
          actual: observed.count,
        },
        {
          name: 'mode-text',
          pass: observed.text.includes(entry.rows.modeLabel),
          actual: entry.rows.modeLabel,
        },
        {
          name: 'stage-text',
          pass: observed.text.includes(entry.rows.stage),
          actual: entry.rows.stage,
        },
        {
          name: 'speed-readable',
          pass: observed.speedFontPx >= 30 && observed.speedFontPx > observed.bodyFontPx,
          actual: observed.speedFontPx,
        },
        {
          name: 'details-closed',
          pass: observed.detailsOpen === false,
          actual: observed.detailsOpen,
        },
        {
          name: 'in-viewport',
          pass: observed.inViewport,
          actual: observed.rect,
        },
        {
          name: 'png-signature',
          pass:
            bytes.length > 8 &&
            bytes[0] === 0x89 &&
            bytes[1] === 0x50 &&
            bytes[2] === 0x4e &&
            bytes[3] === 0x47,
          actual: bytes.length,
        },
      ];
    if (checks.some((check) => !check.pass)) failed = true;
    captures.push({
      name,
      screenshot: file,
      bytes: bytes.length,
      rows: entry.rows,
      observed: {
        ariaLabel: observed.ariaLabel,
        dataMode: observed.dataMode,
        dataService: observed.dataService,
        detailsOpen: observed.detailsOpen,
        speedFontPx: observed.speedFontPx,
        bodyFontPx: observed.bodyFontPx,
        modeFontWeight: observed.modeFontWeight,
        rect: observed.rect,
      },
      checks,
    });
    console.log(`${checks.every((check) => check.pass) ? 'PASS' : 'FAIL'} CAPTURE ${name} ${file}`);
  }
} finally {
  await browser.close();
}

const payload = {
    version: report.version,
    viewport,
    browser: `Chromium ${browserVersion}`,
    note: 'Renders the deterministic createTaxiHud DOM snapshot; not a live simulation frame.',
    captures,
    summary: {
      captures: captures.length,
      checks: captures.reduce((n, entry) => n + entry.checks.length, 0),
      passed: captures.reduce(
        (n, entry) => n + entry.checks.filter((check) => check.pass).length,
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
