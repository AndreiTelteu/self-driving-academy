// Read-only CDP probe: what WebGPU adapter does the page actually get?
const cdp = 'http://127.0.0.1:9222';
const targetHost = process.argv[2] ?? '127.0.0.1:5217';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
for (let i = 0; i < 40; i++) {
  try {
    const list = await (await fetch(cdp + '/json/list')).json();
    page = list.find((t) => t.type === 'page' && t.url.includes(targetHost));
    if (page) break;
  } catch {}
  await sleep(500);
}
if (!page) throw new Error('no page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', rej);
});
const send = (method, params = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((r) => pending.set(i, r));
};
await send('Runtime.enable');
const reply = await send('Runtime.evaluate', {
  expression: `(async () => {
    const ua = navigator.userAgent;
    if (!navigator.gpu) return { ua, webgpu: false };
    const a = await navigator.gpu.requestAdapter();
    if (!a) return { ua, webgpu: true, adapter: null };
    const i = a.info ?? {};
    return { ua, webgpu: true, adapter: { vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description }, features: [...a.features].slice(0, 6) };
  })()`,
  returnByValue: true,
  awaitPromise: true,
});
console.log(JSON.stringify(reply.result?.result?.value ?? reply.result, null, 2));
ws.close();
