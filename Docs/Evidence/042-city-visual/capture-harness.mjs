/**
 * Minimal CDP capture harness (no extra npm dependencies).
 *
 * Usage: node .pbi-validation-042/capture.mjs <url> <outfile> [timeoutMs]
 * Launches the locally installed Playwright Chromium in headless mode, waits until the page sets
 * `document.body.dataset.cityState`, then writes a PNG screenshot. It never edits project code.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, outfile, timeoutArg, expression, reportPath] = process.argv.slice(2);
if (!url || !outfile) throw new Error('usage: capture.mjs <url> <outfile> [timeoutMs] [expression]');
const timeoutMs = Number(timeoutArg ?? 60000);
const chrome = join(
  process.env.LOCALAPPDATA ?? '',
  'ms-playwright/chromium-1234/chrome-win64/chrome.exe',
);
const profile = await mkdtemp(join(tmpdir(), 'pbi042-chrome-'));
const port = 9333;
const child = spawn(
  chrome,
  [
    '--headless=new',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    '--window-size=1280,720',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function endpoint(path) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      if (response.ok) return await response.json();
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  throw new Error(`CDP endpoint ${path} unreachable`);
}

class Cdp {
  #socket;
  #next = 1;
  #pending = new Map();
  constructor(socket) {
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id === undefined) return;
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.#next++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.#socket.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.#pending.delete(id)) reject(new Error(`${method} timed out`));
      }, timeoutMs);
    });
  }
}

const version = await endpoint('/json/version');
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
const browser = new Cdp(socket);
const { targetId } = await browser.send('Target.createTarget', { url });
const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
const page = (method, params) => browser.send(method, params, sessionId);
await page('Page.enable');
await page('Runtime.enable');
const consoleErrors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown')
    consoleErrors.push(message.params.exceptionDetails?.text ?? 'exception');
});

let state = 'loading';
let report = '';
const started = Date.now();
while (Date.now() - started < timeoutMs) {
  const probe = await page('Runtime.evaluate', {
    expression:
      'JSON.stringify({ state: document.body.dataset.cityState ?? "loading", text: document.querySelector("#result")?.textContent ?? "", status: document.querySelector("#status")?.textContent ?? "" })',
    returnByValue: true,
  });
  const value = JSON.parse(probe.result.value);
  state = value.state;
  report = value.text;
  if (state === 'ready' || state === 'error') break;
  await sleep(500);
}
if (state === 'loading') throw new Error('page never reached a terminal state');
// One more frame so the last render is present in the screenshot.
await sleep(1200);
if (expression && expression !== '-') {
  const evaluated = await page('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  console.log('EVAL ' + JSON.stringify(evaluated.result.value));
}
const shot = await page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile(outfile, Buffer.from(shot.data, 'base64'));
const summary = await page('Runtime.evaluate', {
  expression: 'document.querySelector("#status")?.textContent ?? ""',
  returnByValue: true,
});
const parsed = report ? JSON.parse(report) : null;
if (reportPath && parsed) await writeFile(reportPath, JSON.stringify(parsed, null, 2));
console.log(
  JSON.stringify(
    {
      state,
      status: summary.result.value,
      report: parsed,
      consoleErrors,
      outfile,
      reportPath: reportPath ?? null,
    },
    null,
    2,
  ),
);
await browser.send('Target.closeTarget', { targetId });
socket.close();
child.kill();
process.exit(state === 'ready' ? 0 : 1);
