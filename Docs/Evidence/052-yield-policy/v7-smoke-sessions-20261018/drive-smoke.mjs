// Minimal CDP driver for the 052 V7 browser smoke. No external dependencies.
const backend = process.argv[2];
if (!['AUTO', 'WEBGL2'].includes(backend)) {
  console.error('usage: node drive-smoke.mjs AUTO|WEBGL2');
  process.exit(2);
}
const targetHost = '127.0.0.1:5217';
const cdp = 'http://127.0.0.1:9222';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPage() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const list = await (await fetch(cdp + '/json/list')).json();
      const page = list.find((t) => t.type === 'page' && t.url.includes(targetHost));
      if (page) return page;
    } catch {}
    await sleep(500);
  }
  throw new Error('no CDP page found for ' + targetHost);
}

const page = await findPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve);
  ws.addEventListener('error', reject);
});
function send(method, params = {}) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}
async function evaluate(expression) {
  const reply = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (reply.result?.exceptionDetails)
    throw new Error('evaluate: ' + JSON.stringify(reply.result.exceptionDetails));
  return reply.result?.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.bringToFront');
await sleep(1000);
const focus = await evaluate('document.hasFocus() && !document.hidden');
console.log('foreground:', focus, 'dpr:', await evaluate('devicePixelRatio'));
if (!focus) {
  console.error('PAGE_NOT_FOREGROUND');
  process.exit(3);
}
await evaluate(
  `(() => {
     const backend = document.getElementById('backend');
     backend.value = ${JSON.stringify(backend)};
     backend.dispatchEvent(new Event('change'));
     const mode = document.getElementById('mode');
     mode.value = 'smoke';
     mode.dispatchEvent(new Event('change'));
     document.getElementById('run').click();
     return document.getElementById('status').textContent;
   })()`,
);
const deadline = Date.now() + 8 * 60 * 1000;
let status = '';
let last = '';
while (Date.now() < deadline) {
  await sleep(3000);
  status = String(await evaluate("document.getElementById('status').textContent"));
  if (status !== last) {
    console.log('status:', status);
    last = status;
  }
  if (/SMOKE SAVED|FAILED:/.test(status)) break;
}
console.log('FINAL_STATUS:', status);
ws.close();
process.exit(/SMOKE SAVED/.test(status) ? 0 : 1);
