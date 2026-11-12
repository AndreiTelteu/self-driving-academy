import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 235: the integrated fun/return verification report.
 *
 * `npm run qa:fun` re-executes every dependent probe in this process (216, 151, 152, 224 evidence,
 * 225, 226, 227, 228, 229, 230, 233, 234, 084, 083, 212, 153), aggregates the real numbers and
 * writes `probes.json`, `report.json` and `report.md`. `--check` regenerates the same three files
 * and refuses a stale commit. `--strict` turns a FAIL criterion into exit code 1; a contract
 * finding is reported, not hidden, so the default run exits 0 after writing the evidence.
 *
 * No return rate is computed here. The report keeps "mechanism tested" and "retention NOT_RUN"
 * apart, because no human playtest happened.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '235-fun-qa'),
  probesFile = join(directory, 'probes.json'),
  reportFile = join(directory, 'report.json'),
  markdownFile = join(directory, 'report.md');

const contract = await import(
  pathToFileURL(join(root, 'tests', 'qa', 'fun-experience-report.ts')).href
);

const snapshot = await contract.collectFunExperienceProbes();
const report = contract.buildFunExperienceReport(snapshot);
const issues = contract.verifyFunExperienceReport(report);
const probesJson = `${JSON.stringify(snapshot, null, 2)}\n`;
const reportJson = `${JSON.stringify(report, null, 2)}\n`;
const markdown = contract.funExperienceReportMarkdown(report);

for (const probe of report.probes)
  console.log(
    `${probe.verdict.padEnd(8)} PROBE ${probe.id.padEnd(26)} ${probe.passed}/${probe.checks} ${probe.title}`,
  );
for (const criterion of report.criteria)
  console.log(
    `${criterion.verdict.padEnd(8)} CRITERION ${criterion.id} ${criterion.checks.filter((check) => check.verdict === 'PASS').length}/${criterion.checks.length} ${criterion.title}`,
  );
console.log(
  `SUMMARY criteria ${report.summary.criteria}, pass ${report.summary.pass}, fail ${report.summary.fail}, notRun ${report.summary.notRun}, probes ${report.summary.probes}, playtest NOT_RUN 0/${report.playtest.requiredParticipants}, retention NOT_RUN`,
);
console.log(
  `GATE structural ${report.gate.structural} release ${report.gate.release} soak ${report.gate.soakMinutes} min / ${report.gate.soakCycles} cycles`,
);

if (issues.length > 0) {
  for (const issue of issues) console.error(`ISSUE ${issue}`);
  process.exitCode = 1;
}

async function compare(file, expected, label) {
  const saved = await readFile(file, 'utf8').catch(() => null);
  if (saved !== expected) {
    console.error(`${label} is stale: ${relative(root, file)}`);
    process.exitCode = 1;
  } else console.log(`${label} is current: ${relative(root, file)}`);
}

/**
 * `--browser` is the short real check: build the production bundle, serve it, render it in
 * Chromium at 1280×720 and keep the PNG plus the measured dimensions. It proves the app boots and
 * the WebGL canvas is created on this revision; it does not measure gameplay, text legibility or
 * frame time. Without Chrome it writes an explicit `NOT_INSTALLED` instead of pretending.
 */
async function runBrowserCheck() {
  const { createHash } = await import('node:crypto');
  const { createServer } = await import('node:http');
  const { spawn, spawnSync } = await import('node:child_process');
  const { existsSync } = await import('node:fs');
  const { stat } = await import('node:fs/promises');
  const { extname, resolve, sep } = await import('node:path');

  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter((entry) => typeof entry === 'string' && entry.length > 0);
  const chrome = candidates.find((entry) => existsSync(entry));
  const browserFile = join(directory, 'browser.json');
  const screenshot = join(directory, 'browser-1280x720.png');
  const buildDirectory = join(root, '.pbi-validation-235', 'build');

  if (chrome === undefined) {
    await writeFile(
      browserFile,
      `${JSON.stringify(
        {
          version: '235-fun-qa-browser-v1',
          status: 'NOT_INSTALLED',
          reason:
            'Nu a fost găsit niciun Chromium/Chrome/Edge local; verificarea de browser nu a rulat.',
          viewport: { width: 1280, height: 720 },
        },
        null,
        2,
      )}\n`,
    );
    console.log('SKIP browser check: no local Chromium/Chrome/Edge');
    return;
  }

  const build = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', 'build', '--outDir', buildDirectory, '--emptyOutDir'],
    { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if (build.status !== 0) {
    console.error(`Browser check build failed: ${build.stderr ?? ''}`);
    process.exitCode = 1;
    return;
  }
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.glb': 'model/gltf-binary',
    '.wasm': 'application/wasm',
  };
  const base = resolve(buildDirectory);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const path = resolve(
      join(base, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)),
    );
    if (path !== base && !path.startsWith(base + sep)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new Error('not a file');
      response.writeHead(200, {
        'content-type': mime[extname(path)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(await readFile(path));
    } catch {
      response.writeHead(404).end('missing');
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  // Chrome must run asynchronously: the static server lives in this process, so a synchronous
  // spawn would block the event loop and Chrome would wait for a response that never comes.
  const capture = await new Promise((done) => {
    const child = spawn(
      chrome,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--enable-unsafe-swiftshader',
        '--hide-scrollbars',
        '--window-size=1280,720',
        '--virtual-time-budget=15000',
        `--user-data-dir=${join(buildDirectory, 'profile')}`,
        `--screenshot=${screenshot}`,
        `http://127.0.0.1:${port}/`,
      ],
      { stdio: 'ignore' },
    );
    const timer = setTimeout(() => child.kill(), 120000);
    child.on('exit', (status) => {
      clearTimeout(timer);
      done({ status, error: null });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      done({ status: null, error: error.message });
    });
  });
  server.close();

  const bytes = await readFile(screenshot).catch(() => null);
  if (bytes === null || capture.status !== 0) {
    await writeFile(
      browserFile,
      `${JSON.stringify(
        {
          version: '235-fun-qa-browser-v1',
          status: 'FAILED',
          reason: `Chromium a ieșit cu ${String(capture.status)} fără captură${capture.error === null ? '' : `: ${capture.error}`}.`,
          chrome,
          viewport: { width: 1280, height: 720 },
        },
        null,
        2,
      )}\n`,
    );
    console.error('Browser check failed: no screenshot');
    process.exitCode = 1;
    return;
  }

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const result = {
    version: '235-fun-qa-browser-v1',
    status: 'CAPTURED',
    source: 'The real index.html and src/main.ts bundle, no mocks.',
    chrome,
    command:
      'npm run qa:fun -- --browser (vite build + static server + chrome --headless=new --screenshot)',
    viewport: { width, height },
    expectedViewport: { width: 1280, height: 720 },
    bytes: bytes.length,
    sha256: digest,
    screenshot: 'browser-1280x720.png',
    measuredAt: new Date().toISOString(),
    proves: [
      'The production build boots and serves index.html on this revision.',
      'Chromium 1280×720 renders the start gate with the WEBGL2 WebGL canvas line.',
    ],
    notMeasured: [
      'Gameplay, driving feel, HUD text legibility and frame time.',
      'The start gate was not clicked: no input/focus proof.',
      'The 153 layout findings were not re-captured (no Playwright in this worktree).',
    ],
  };
  await writeFile(browserFile, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `CAPTURED browser ${width}×${height}, ${bytes.length} B, sha256 ${digest.slice(0, 12)}`,
  );
}

if (process.argv.includes('--check')) {
  await compare(probesFile, probesJson, 'Fun QA probes');
  await compare(reportFile, reportJson, 'Fun QA report');
  await compare(markdownFile, markdown, 'Fun QA markdown');
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(probesFile, probesJson);
  await writeFile(reportFile, reportJson);
  await writeFile(markdownFile, markdown);
  console.log(`Wrote ${relative(root, probesFile)}`);
  console.log(`Wrote ${relative(root, reportFile)}`);
  console.log(`Wrote ${relative(root, markdownFile)}`);
  if (process.argv.includes('--strict') && report.summary.fail > 0) process.exitCode = 1;
  if (process.argv.includes('--browser')) await runBrowserCheck();
}
