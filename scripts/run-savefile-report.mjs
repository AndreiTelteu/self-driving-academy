import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '234-savefile'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md'),
  browserRoot = join(root, 'tests', 'browser', 'savefile-234'),
  browserBuild = join(root, '.pbi-validation-234', 'build'),
  browserEvidence = join(directory, 'browser.json'),
  savedFile = join(directory, 'saved-file.sdasave');

const wantsBrowser = process.argv.includes('--browser');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const reportModule = await import(
    pathToFileURL(join(root, 'tests', 'persistence', 'savefile-report.ts')).href
  ),
  report = await reportModule.runSaveFileReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  markdown = reportModule.saveFileReportMarkdown(report),
  output = argument('--output') ?? defaultOutput;

for (const entry of report.checks)
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} CHECK ${entry.name}`);
console.log(
  `SUMMARY checks ${report.summary.passed}/${report.summary.checks}, scenarios ${report.summary.scenarios}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `FILE bytes ${report.structure.bytes}/${report.structure.maxFileBytes}, checksum ${report.structure.checksum}, sessions ${report.roundTrip.sessionsPresent}`,
);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

async function serve(directoryToServe) {
  const base = resolve(directoryToServe);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const target = resolve(base, relative);
      if (!target.startsWith(base + sep) && target !== base) {
        response.writeHead(403).end();
        return;
      }
      const info = await stat(target);
      const file = info.isDirectory() ? join(target, 'index.html') : target;
      const body = await readFile(file);
      response.writeHead(200, {
        'content-type': mime[extname(file)] ?? 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { server, url: `http://127.0.0.1:${port}/` };
}

async function runBrowserCapture() {
  let playwright;
  try {
    const configured = process.env.PLAYWRIGHT_MODULE;
    playwright = await import(configured ? pathToFileURL(resolve(configured)).href : 'playwright');
  } catch {
    console.log(
      'NOT_RUN browser capture: Playwright is not installed. Set PLAYWRIGHT_MODULE to its entry point.',
    );
    return;
  }
  const { build } = await import('vite');
  await build({
    configFile: false,
    root: browserRoot,
    logLevel: 'error',
    build: { outDir: browserBuild, emptyOutDir: true, target: 'es2022' },
  });
  const { server, url } = await serve(browserBuild);
  const { chromium } = playwright.default ?? playwright;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM === undefined
        ? {}
        : { executablePath: process.env.PLAYWRIGHT_CHROMIUM }),
    });
  } catch (error) {
    server.close();
    console.log(
      `NOT_RUN browser capture: Chromium could not start (${error instanceof Error ? error.message : 'unknown'}).`,
    );
    return;
  }
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__savefile234 !== undefined, null, {
      timeout: 120000,
    });
    const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
    const run = await page.evaluate(() => globalThis.__savefile234.run());
    const download = await downloadPromise;
    await mkdir(directory, { recursive: true });
    await download.saveAs(savedFile);
    const saved = await readFile(savedFile);
    const savedText = saved.toString('utf8');
    const savedSha256 = createHash('sha256').update(saved).digest('hex');
    const verify = await page.evaluate(
      (text) => globalThis.__savefile234.verifyFile(text),
      savedText,
    );
    const evidence = {
      version: '234-savefile-browser-v1',
      generatedBy: 'npm run save:file -- --browser',
      browser: await page.evaluate(() => navigator.userAgent),
      file: {
        name: download.suggestedFilename(),
        bytes: saved.byteLength,
        sha256: savedSha256,
      },
      run,
      verify,
      consoleErrors,
    };
    await writeFile(browserEvidence, `${JSON.stringify(evidence, null, 2)}\n`);
    const pass =
      run.status === 'PASS' &&
      run.webCryptoMatch &&
      run.blobMatch &&
      run.fileMatch &&
      run.importStatus === 'COMMITTED' &&
      verify.status === 'PASS' &&
      verify.importStatus === 'COMMITTED' &&
      verify.sessionsPresent === 2 &&
      verify.checksum === run.checksum &&
      verify.fileSha256 === savedSha256 &&
      consoleErrors.length === 0;
    console.log(
      `BROWSER ${pass ? 'PASS' : 'FAIL'} run ${run.status}, verify ${verify.status}, bytes ${saved.byteLength}, sha256 ${savedSha256}, sessions ${verify.sessionsPresent}, xp ${verify.xpAfter}`,
    );
    if (consoleErrors.length > 0)
      console.log(`BROWSER console errors: ${consoleErrors.join(' | ')}`);
    console.log(`Wrote ${browserEvidence}`);
    console.log(`Wrote ${savedFile}`);
    if (!pass) process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

if (wantsBrowser) {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  await runBrowserCapture();
} else if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Savefile report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Savefile report is current: ${output}`);
  const savedMarkdown = await readFile(reportMarkdown, 'utf8');
  if (savedMarkdown !== markdown) {
    console.error(`Savefile markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Savefile markdown is current: ${reportMarkdown}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
