// Minimal CDP driver for the raf-scheduling diagnostic. No external dependencies.
const backend = process.argv[2];
if (!['AUTO', 'WEBGL2'].includes(backend)) {
  console.error('usage: node drive-raf.mjs AUTO|WEBGL2');
  process.exit(2);
}
const targetHost = '127.0.0.1:5215';
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

// The diagnostic requires an exact window.innerWidth/innerHeight of 1920x1080 at DPR 1.
async function ensureViewport(width, height) {
  const target = (await send('Browser.getWindowForTarget', { targetId: page.id })).result;
  if (target && target.windowId != null) {
    await send('Browser.setWindowBounds', {
      windowId: target.windowId,
      bounds: { windowState: 'normal' },
    });
    for (let i = 0; i < 6; i++) {
      const inner = await evaluate('({ w: window.innerWidth, h: window.innerHeight })');
      if (inner.w === width && inner.h === height) return 'window-bounds';
      const bounds = (await send('Browser.getWindowBounds', { windowId: target.windowId })).result
        .bounds;
      await send('Browser.setWindowBounds', {
        windowId: target.windowId,
        bounds: {
          width: width + (bounds.width - inner.w),
          height: height + (bounds.height - inner.h),
          left: 0,
          top: 0,
        },
      });
      await sleep(700);
    }
  }
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return 'emulation';
}

const mode = await ensureViewport(1920, 1080);
await send('Page.bringToFront');
await sleep(1200);
const inner = await evaluate('({ w: window.innerWidth, h: window.innerHeight, dpr: devicePixelRatio })');
console.log('viewport:', mode, JSON.stringify(inner));
const focus = await evaluate('document.hasFocus() && !document.hidden');
console.log('foreground:', focus);
if (!focus) {
  console.error('PAGE_NOT_FOREGROUND');
  process.exit(3);
}
await evaluate(
  `(() => {
     const backend = document.getElementById('backend');
     backend.value = ${JSON.stringify(backend)};
     backend.dispatchEvent(new Event('change'));
     document.getElementById('run').click();
     return document.getElementById('status').textContent;
   })()`,
);
const deadline = Date.now() + 8 * 60 * 1000;
let status = '';
let last = '';
while (Date.now() < deadline) {
  await sleep(5000);
  status = String(await evaluate("document.getElementById('status').textContent"));
  if (status !== last) {
    console.log('status:', status.slice(0, 300));
    last = status;
  }
  if (/EXPORT FAILED/.test(status)) break;
  if (status.trimStart().startsWith('{')) {
    // The page re-enables the button only after the /diagnostic export has been acked.
    for (let i = 0; i < 60; i++) {
      const enabled = await evaluate('document.getElementById("run").disabled === false');
      if (enabled) break;
      await sleep(1000);
    }
    await sleep(2000);
    status = String(await evaluate("document.getElementById('status').textContent"));
    break;
  }
}
console.log('FINAL_STATUS:', String(status).slice(0, 600));
ws.close();
process.exit(status.trimStart().startsWith('{') ? 0 : 1);
