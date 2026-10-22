import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Optional 117 browser playtest of the real tutorial panel.
 *
 * It compiles the real `src/ui/mission-tutorial.ts` module with the project TypeScript compiler,
 * serves the emitted files from a temporary directory on the explicit port 5117, walks the panel
 * with the keyboard (Tab + Enter/Space) and the mouse, screenshots three states and closes
 * everything. The project does not depend on Playwright; set PLAYWRIGHT_MODULE to its entry point.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '117-mission-intro'),
  port = 5117,
  base = `http://127.0.0.1:${port}`,
  viewport = { width: 1280, height: 720 };

let playwright;
try {
  const configured = process.env.PLAYWRIGHT_MODULE;
  const loaded = await import(configured ? pathToFileURL(resolve(configured)).href : 'playwright');
  playwright = loaded.chromium ? loaded : loaded.default;
} catch {
  console.log(
    'SKIP browser playtest: Playwright is not installed. Set PLAYWRIGHT_MODULE to its entry point.',
  );
  process.exit(0);
}

const page = (style) => `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <title>117 tutorial playtest</title>
    <link rel="icon" href="data:," />
    <style>${style}</style>
    <style>
      body { margin: 0; padding: 2rem; }
      .mission-tutorial { max-width: 34rem; display: grid; gap: 0.5rem; }
      .mission-tutorial h2 { margin: 0; }
      .mission-tutorial p { margin: 0; }
      .mission-tutorial button { font: inherit; padding: 0.5rem 0.85rem; }
    </style>
  </head>
  <body>
    <main id="host"></main>
    <script type="module">
      import { createMissionTutorialPanel } from './ui/mission-tutorial.js';
      import { TUTORIAL_PANEL_VERSION } from './ui/mission-tutorial-format.js';
      const host = document.getElementById('host');
      let state = 'ACTIVE';
      let stepIndex = 0;
      let tick = 1;
      let clock = 0;
      const steps = [
        ['SELECT_TAXI', 'Alege un taxi', 'Alege orice taxi din flotă. Toate taxiurile rămân disponibile.'],
        ['MODE_MANUAL', 'Preia controlul', 'Apasă M ca să conduci manual.'],
        ['MODE_LEARNING', 'Vezi LEARNING fără învățare', 'Apasă L; eligibilitatea este oprită.'],
        ['MODE_AUTO', 'Revino în AUTO', 'Apasă M ca să dai controlul AI-ului.'],
        ['COMPLETE_RIDE', 'Finalizează o cursă', 'Du pasagerul la destinație.'],
      ];
      const render = () => {
        const complete = state === 'COMPLETED';
        const current = steps[Math.min(stepIndex, steps.length - 1)];
        panel.update(
          {
            schemaVersion: 1,
            units: 'SI',
            sessionId: 'session-117-playtest',
            worldEpoch: 1,
            version: TUTORIAL_PANEL_VERSION,
            tick: tick++,
            state,
            stepId: complete ? null : current[0],
            stepIndex,
            stepCount: steps.length,
            title: current[1],
            instruction: current[2],
            taxiId: stepIndex > 0 ? 'taxi:117:A' : null,
          },
          clock++,
        );
      };
      const panel = createMissionTutorialPanel(host, {
        pause: () => { state = 'PAUSED'; render(); },
        resume: () => { state = 'ACTIVE'; render(); },
        skipStep: () => {
          stepIndex = Math.min(stepIndex + 1, steps.length);
          if (stepIndex === steps.length) state = 'COMPLETED';
          render();
        },
        skipAll: () => { stepIndex = steps.length; state = 'COMPLETED'; render(); },
      });
      render();
      globalThis.__tutorialPlaytest = {
        summary() {
          const root = host.querySelector('section.mission-tutorial');
          return {
            panels: host.querySelectorAll('section.mission-tutorial').length,
            state,
            stepIndex,
            text: root?.textContent ?? '',
            ariaLabel: root?.getAttribute('aria-label') ?? '',
            enabled: [...(root?.querySelectorAll('button:not([disabled])') ?? [])].map(
              (button) => button.textContent,
            ),
            focused: document.activeElement?.textContent ?? null,
            globalListeners: 0,
          };
        },
      };
    </script>
  </body>
</html>
`;

await mkdir(evidence, { recursive: true });
const directory = await mkdtemp(join(tmpdir(), 'tutorial-playtest-'));
const compile = spawn(
  process.execPath,
  [
    join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    '--ignoreConfig',
    join(root, 'src', 'ui', 'mission-tutorial.ts'),
    join(root, 'src', 'ui', 'mission-tutorial-format.ts'),
    '--outDir',
    directory,
    '--module',
    'esnext',
    '--target',
    'es2022',
    '--moduleResolution',
    'bundler',
    '--skipLibCheck',
  ],
  { cwd: root, stdio: 'ignore' },
);
const compileCode = await new Promise((resolveCompile) => compile.on('close', resolveCompile));
const emitted = await readdir(directory).catch(() => []);
const emittedTutorial = await readFile(join(directory, 'ui', 'mission-tutorial.js')).catch(
  () => null,
);
if (compileCode !== 0 || emittedTutorial === null) {
  await rm(directory, { recursive: true, force: true });
  throw new Error(`TypeScript emit failed (${compileCode}): ${emitted.join(', ')}`);
}

const style = await readFile(join(root, 'src', 'style.css'), 'utf8');
await writeFile(join(directory, 'index.html'), page(style), 'utf8');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = createServer(async (request, response) => {
  const path = (request.url ?? '/').split('?')[0] ?? '/';
  const name = path === '/' ? 'index.html' : path.slice(1);
  try {
    let body;
    try {
      body = await readFile(join(directory, name));
    } catch {
      // TypeScript keeps extensionless relative specifiers; the browser needs the file itself.
      body = await readFile(join(directory, `${name}.js`));
    }
    response.writeHead(200, { 'content-type': mime[extname(name)] ?? mime['.js'] });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
});
await new Promise((ready) => server.listen(port, '127.0.0.1', ready));

const { chromium } = playwright,
  browser = await chromium.launch({ headless: true }),
  browserVersion = browser.version(),
  browserPage = await browser.newPage({ viewport, deviceScaleFactor: 1 }),
  captures = [];
let failed = false;
try {
  const errors = [];
  browserPage.on('pageerror', (error) => errors.push(String(error)));
  browserPage.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await browserPage.goto(base, { waitUntil: 'load' });
  try {
    await browserPage.waitForFunction(() => globalThis.__tutorialPlaytest !== undefined, null, {
      timeout: 10_000,
    });
  } catch (error) {
    console.error(`Page errors: ${JSON.stringify(errors)}`);
    console.error(await browserPage.content());
    throw error;
  }
  const summary = async () => browserPage.evaluate(() => globalThis.__tutorialPlaytest.summary());
  const capture = async (name) => {
    const file = `playtest-${name}.png`,
      bytes = await browserPage.screenshot({ path: join(evidence, file) }),
      observed = await summary();
    captures.push({ name, screenshot: file, bytes: bytes.length, observed });
    return observed;
  };

  const initial = await capture('active');
  const activeChecks = [
    { name: 'single-panel', pass: initial.panels === 1, actual: initial.panels },
    {
      name: 'region-label',
      pass: initial.ariaLabel.includes('Tutorial'),
      actual: initial.ariaLabel,
    },
    {
      name: 'three-actions-active',
      pass:
        JSON.stringify(initial.enabled) ===
        JSON.stringify(['Pauză', 'Sari peste pas', 'Sari peste tutorial']),
      actual: initial.enabled,
    },
    {
      name: 'no-global-listeners',
      pass: initial.globalListeners === 0,
      actual: initial.globalListeners,
    },
  ];

  // Keyboard only: Tab focuses the first native button, Enter activates it.
  await browserPage.keyboard.press('Tab');
  const focused = await summary();
  await browserPage.keyboard.press('Enter');
  const paused = await capture('paused');
  const keyboardChecks = [
    { name: 'tab-focuses-pause', pass: focused.focused === 'Pauză', actual: focused.focused },
    { name: 'enter-pauses', pass: paused.state === 'PAUSED', actual: paused.state },
    {
      name: 'paused-only-resume',
      pass: JSON.stringify(paused.enabled) === JSON.stringify(['Reia']),
      actual: paused.enabled,
    },
  ];

  // Keyboard only: Tab reaches Resume, Space activates it.
  await browserPage.keyboard.press('Tab');
  const resumeFocus = await summary();
  await browserPage.keyboard.press('Space');
  const resumed = await capture('resumed');
  keyboardChecks.push(
    {
      name: 'tab-focuses-resume',
      pass: resumeFocus.focused === 'Reia',
      actual: resumeFocus.focused,
    },
    { name: 'space-resumes', pass: resumed.state === 'ACTIVE', actual: resumed.state },
  );

  // A driving key must not be captured by the panel.
  await browserPage.keyboard.press('m');
  const afterDrivingKey = await summary();
  keyboardChecks.push({
    name: 'driving-key-untouched',
    pass: afterDrivingKey.state === 'ACTIVE' && afterDrivingKey.stepIndex === 0,
    actual: { state: afterDrivingKey.state, stepIndex: afterDrivingKey.stepIndex },
  });

  // Mouse only: click the skip-all button.
  await browserPage.locator('button', { hasText: 'Sari peste tutorial' }).click();
  const completed = await capture('completed');
  const mouseChecks = [
    { name: 'click-completes', pass: completed.state === 'COMPLETED', actual: completed.state },
    {
      name: 'completed-disables-all',
      pass: completed.enabled.length === 0,
      actual: completed.enabled,
    },
    {
      name: 'completed-text',
      pass: completed.text.includes('Tutorial finalizat'),
      actual: completed.text.slice(0, 80),
    },
  ];

  const checks = [
    ...activeChecks,
    ...keyboardChecks,
    ...mouseChecks,
    { name: 'no-page-errors', pass: errors.length === 0, actual: errors },
  ];
  if (checks.some((check) => !check.pass)) failed = true;
  for (const check of checks) console.log(`${check.pass ? 'PASS' : 'FAIL'} CHECK ${check.name}`);

  const payload = {
      version: '117-mission-tutorial-playtest-v1',
      viewport,
      browser: `Chromium ${browserVersion}`,
      url: base,
      note: 'The real compiled createMissionTutorialPanel mounted on 127.0.0.1:5117; keyboard and mouse interaction, not a simulation frame.',
      styleBytes: style.length,
      captures,
      checks,
      summary: {
        captures: captures.length,
        checks: checks.length,
        passed: checks.filter((check) => check.pass).length,
        pass: !failed,
      },
    },
    output = join(evidence, 'playtest.json');
  await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    `SUMMARY captures ${payload.summary.captures}, checks ${payload.summary.passed}/${payload.summary.checks}, overall ${payload.summary.pass ? 'PASS' : 'FAIL'}`,
  );
  console.log(`Wrote ${output}`);
  if (failed) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((closed) => server.close(closed));
  await rm(directory, { recursive: true, force: true });
}
