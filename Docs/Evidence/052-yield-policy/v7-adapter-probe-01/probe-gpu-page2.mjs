const version = await (await fetch('http://127.0.0.1:9222/json/version')).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
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
const send = (method, params = {}, sessionId) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((r) => pending.set(i, r));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const created = await send('Target.createTarget', { url: 'chrome://gpu' });
const targetId = created.result.targetId;
const attached = await send('Target.attachToTarget', { targetId, flatten: true });
const sessionId = attached.result.sessionId;
await sleep(3500);
const expr = `(() => {
  const out = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
      const t = (el.textContent || '').trim();
      if (t && el.children.length === 0 && t.length < 200) out.push(t);
    }
  };
  walk(document);
  return out.join('\\n');
})()`;
const text = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
const all = String(text.result?.result?.value ?? '');
console.log('extracted chars:', all.length);
const interesting = all
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => /webgpu|dawn|vulkan|d3d12|d3d11|backend|adapter|ANGLE/i.test(l));
console.log(interesting.slice(0, 40).join('\n'));
await send('Target.closeTarget', { targetId });
ws.close();
