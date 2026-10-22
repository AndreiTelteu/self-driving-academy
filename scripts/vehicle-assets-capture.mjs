/**
 * PBI 145 probe driver: launches the installed Chrome (headless, remote debugging), waits for the
 * real page, exports the measurement through the page API, and captures one PNG per review view.
 * No browser automation dependency is added; Chrome DevTools Protocol is used over Node's WebSocket.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const chromeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
];
const chrome = chromeCandidates.find((path) => existsSync(path));
if (!chrome) throw new Error('Chrome not found');
const url = process.argv[2] ?? 'http://127.0.0.1:5145/?quiet=1';
const evidence = resolve('Docs/Evidence/145-vehicle-assets');
const profile = resolve('.pbi-validation-145/chrome-profile');
await rm(profile, { recursive: true, force: true });
await mkdir(evidence, { recursive: true });
const port = 9335;
const child = spawn(
  chrome,
  [
    '--headless=new',
    '--no-sandbox',
    '--enable-gpu',
    '--use-angle=d3d11',
    '--hide-scrollbars',
    '--window-size=1280,720',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    url,
  ],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let page;
for (let attempt = 0; attempt < 100; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await response.json();
    page = targets.find((target) => target.type === 'page');
    if (page) break;
  } catch {
    /* Chrome is still starting. */
  }
  await sleep(200);
}
if (!page) {
  child.kill();
  throw new Error('Chrome DevTools target not available');
}
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ready, failed) => {
  socket.addEventListener('open', ready, { once: true });
  socket.addEventListener('error', failed, { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve: done, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else done(message.result);
  }
});
const send = (method, params = {}) =>
  new Promise((done, failed) => {
    const id = ++sequence;
    pending.set(id, { resolve: done, reject: failed });
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression, awaitPromise = false) => {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
};
await send('Page.enable');
await send('Runtime.enable');
for (let attempt = 0; attempt < 150; attempt += 1) {
  const state = await evaluate("document.querySelector('#status')?.dataset.state ?? 'loading'");
  if (state === 'ready') break;
  if (state === 'error')
    throw new Error(await evaluate("document.querySelector('#status')?.textContent ?? ''"));
  await sleep(200);
}
const report = await evaluate(
  'window.vehicleAssetsProbe.export().then((result) => JSON.stringify(result))',
  true,
);
const parsed = JSON.parse(report);
await evaluate('window.vehicleAssetsProbe.freeze()');
for (const view of ['near', 'side', 'mid', 'far', 'overview']) {
  await evaluate(`window.vehicleAssetsProbe.setView('${view}')`);
  await sleep(400);
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  await writeFile(resolve(evidence, `${view}.png`), Buffer.from(shot.data, 'base64'));
}
await writeFile(resolve(evidence, 'probe-report.json'), JSON.stringify(parsed, null, 2));
socket.close();
child.kill();
await sleep(500);
console.log(
  JSON.stringify({
    status: 'exported',
    renderer: parsed.renderer,
    frames: parsed.frames,
    lodProbe: parsed.lodProbe,
    firstUse: Object.keys(parsed.firstUse ?? {}),
  }),
);
