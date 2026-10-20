import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Optional 074 visual capture. It renders the deterministic minimap adapter DOM and replays the
 * exact drawing commands recorded in the evidence report. It is not a live simulation frame and is
 * not part of `npm test`; set PLAYWRIGHT_MODULE when Playwright is available.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '074-minimap'),
  viewport = { width: 1280, height: 720 },
  wanted = [
    'TO_PICKUP · start',
    'TO_PICKUP · progress',
    'TO_PICKUP · no position',
    'taxi switch · no ride',
    'TO_PICKUP · stale after replan',
  ];

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'app', 'minimap-report.ts')).href
  ),
  report = reportModule.runMinimapReport(),
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
  .capture-title {
    position: fixed;
    left: 1.25rem;
    bottom: 1rem;
    color: #d9e7df;
    font: 600 0.9rem system-ui, sans-serif;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.75;
  }
`;

/** Replays the recorded 074 command list; it performs no projection of its own. */
const paintScript = `
(() => {
const commands = { staticCommands: __STATIC__, dynamic: __DYNAMIC__ };
function paint(canvas, list, layer) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (layer === 'static') {
    for (const command of list) {
      if (command.kind === 'area') {
        ctx.fillStyle = '#23302c';
        ctx.beginPath();
        command.points.forEach((point, index) =>
          index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
        ctx.closePath();
        ctx.fill();
        continue;
      }
      ctx.strokeStyle = '#5a726a';
      ctx.lineWidth = command.widthPx;
      ctx.beginPath();
      command.points.forEach((point, index) =>
        index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
      ctx.stroke();
    }
    return;
  }
  for (const command of list) {
    if (command.kind === 'route') {
      if (command.points.length < 2) continue;
      const trace = () => {
        ctx.beginPath();
        command.points.forEach((point, index) =>
          index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
        ctx.stroke();
      };
      ctx.strokeStyle = '#07110d';
      ctx.lineWidth = 5.5;
      trace();
      ctx.strokeStyle = '#e9f7ee';
      ctx.lineWidth = 2.5;
      trace();
      continue;
    }
    if (command.role === 'TAXI') {
      ctx.fillStyle = '#7fd7ff';
      ctx.strokeStyle = '#07110d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(command.x, command.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (command.headingRad !== null) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(command.x, command.y);
        ctx.lineTo(
          command.x + Math.cos(command.headingRad) * 11,
          command.y - Math.sin(command.headingRad) * 11,
        );
        ctx.stroke();
      }
      continue;
    }
    ctx.fillStyle = command.role === 'PICKUP' ? '#ffd27f' : '#9edbb5';
    ctx.strokeStyle = '#07110d';
    ctx.lineWidth = 1.5;
    if (command.role === 'PICKUP') {
      ctx.beginPath();
      ctx.arc(command.x, command.y, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(command.x - 6, command.y - 6);
      ctx.lineTo(command.x + 6, command.y - 6);
      ctx.lineTo(command.x + 6, command.y + 6);
      ctx.lineTo(command.x - 6, command.y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#07110d';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(command.label, command.x, command.y + 0.5);
  }
}
paint(document.querySelector('.minimap__static'), commands.staticCommands, 'static');
paint(document.querySelector('.minimap__dynamic'), commands.dynamic, 'dynamic');
})();
`;

function html(entry) {
  const script = paintScript
    .replace('__STATIC__', JSON.stringify(report.geometry.staticCommands))
    .replace('__DYNAMIC__', JSON.stringify(entry.commands));
  return `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <title>074 minimap · ${entry.name}</title>
    <link rel="icon" href="data:," />
    <style>${style}${stageStyle}</style>
  </head>
  <body>
${entry.dom}
    <p class="capture-title">074 · ${entry.name}</p>
    <script>${script}</script>
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
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
try {
  for (const name of wanted) {
    const entry = report.scenarios.find((candidate) => candidate.name === name);
    if (!entry) throw new Error(`Missing report scenario: ${name}`);
    await page.setContent(html(entry), { waitUntil: 'load' });
    const observed = await page.evaluate(() => {
      const minimap = globalThis.document.querySelector('section.minimap'),
        canvases = [...globalThis.document.querySelectorAll('section.minimap canvas')],
        painted = (canvas) => {
          const context = canvas.getContext('2d'),
            data = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let visible = 0;
          for (let index = 3; index < data.length; index += 4) if (data[index] !== 0) visible += 1;
          return visible;
        },
        rect = minimap?.getBoundingClientRect();
      return {
        count: globalThis.document.querySelectorAll('section.minimap').length,
        canvases: canvases.length,
        staticPixels: canvases[0] ? painted(canvases[0]) : 0,
        dynamicPixels: canvases[1] ? painted(canvases[1]) : 0,
        text: minimap?.textContent ?? '',
        ariaLabel: minimap?.getAttribute('aria-label') ?? '',
        dataRoute: minimap?.getAttribute('data-route') ?? '',
        dataPosition: minimap?.getAttribute('data-position') ?? '',
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
        { name: 'single-minimap', pass: observed.count === 1, actual: observed.count },
        { name: 'two-canvases', pass: observed.canvases === 2, actual: observed.canvases },
        {
          name: 'static-roads-painted',
          pass: observed.staticPixels > 1000,
          actual: observed.staticPixels,
        },
        {
          name: 'dynamic-layer-painted',
          pass: observed.dynamicPixels > 50,
          actual: observed.dynamicPixels,
        },
        {
          name: 'route-state-visible',
          pass:
            observed.text.includes(entry.routeText) && observed.dataRoute === entry.route.status,
          actual: entry.routeText,
        },
        {
          name: 'explicit-position-state',
          pass: observed.dataPosition === (entry.frame.position === null ? 'MISSING' : 'AVAILABLE'),
          actual: observed.dataPosition,
        },
        {
          name: 'north-up-accessible',
          pass: observed.ariaLabel.includes('nord-sus') && observed.text.includes('nord-sus'),
          actual: observed.ariaLabel,
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
    if (pageErrors.length > 0) {
      failed = true;
      console.log(`PAGE ERRORS ${name}: ${pageErrors.join(' | ')}`);
      pageErrors.length = 0;
    }
    captures.push({
      name,
      screenshot: file,
      bytes: bytes.length,
      route: entry.route,
      markers: entry.markers.map((marker) => marker.role),
      observed: {
        ariaLabel: observed.ariaLabel,
        dataRoute: observed.dataRoute,
        dataPosition: observed.dataPosition,
        staticPixels: observed.staticPixels,
        dynamicPixels: observed.dynamicPixels,
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
    note: 'Replays the deterministic 074 drawing commands over the real map/route fixture; not a live simulation frame.',
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
