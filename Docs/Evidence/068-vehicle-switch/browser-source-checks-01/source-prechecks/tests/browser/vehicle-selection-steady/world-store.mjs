function canonicalOrder() {
  const order = [];
  for (let pair = 0; pair < 5; pair++)
    for (const treatment of pair % 2 ? ['CURRENT_068', 'HISTORICAL_REFERENCE'] : ['HISTORICAL_REFERENCE', 'CURRENT_068'])
      for (const observer of pair % 2 ? [true, false] : [false, true]) order.push({ pair, treatment, observer, ordinal: order.length });
  return order;
}
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
/** One immutable record per finished/failed world. All failures disqualify, never retry in place. */
export function createWorldStore(destination, captureId, { worlds = 20, partBytes = 524288, partsPerWorld = 64, captureBytes = 117440512 } = {}) {
  if (typeof captureId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(captureId)) throw Error('Unsafe capture id');
  const root = resolve(destination, captureId);
  let ready = false, active = null, next = 0, total = 0, failed = false, begun = false;
  async function write(name, value) { await writeFile(resolve(root, name), JSON.stringify(value), { flag: 'wx' }); }
  return {
    async begin(value) {
      if (failed || begun || active || value.captureId !== captureId || value.sequence !== next || !integer(next, 0, worlds - 1) ||
          !Number.isFinite(Date.parse(value.createdAt)) || JSON.stringify(value.metadata) !== JSON.stringify(canonicalOrder()[next]))
        throw Error('World begin identity/order/metadata');
      if (!ready) { await mkdir(root, { recursive: false }); ready = true; }
      await write(`world-${next}-begin.json`, { ...value, status: 'STARTED', receivedAt: new Date().toISOString() });
      begun = true;
      return { sha256: null };
    },
    async start(value) {
      if (failed || !begun || active || value.captureId !== captureId || value.sequence !== next || !integer(next, 0, worlds - 1) ||
          !integer(value.parts, 1, partsPerWorld) || !integer(value.worldBytes, 1, partBytes * partsPerWorld) ||
          value.parts !== Math.ceil(value.worldBytes / partBytes) || !hash(value.worldSha256) || total + value.worldBytes > captureBytes)
        throw Error('World start capacity/identity/order');
      if (!ready) { await mkdir(root, { recursive: false }); ready = true; }
      await write(`world-${next}-started.json`, { ...value, status: 'STARTED', createdAt: new Date().toISOString() });
      active = { ...value, received: 0, bytes: 0 };
      return { sha256: value.worldSha256 };
    },
    async part(value) {
      if (!active || value.captureId !== captureId || value.sequence !== next || value.part !== active.received ||
          !integer(value.bytes, 1, partBytes) || !hash(value.sha256) || typeof value.base64 !== 'string' || value.base64.length > Math.ceil(partBytes / 3) * 4)
        throw Error('World part identity/order/shape');
      const bytes = Buffer.from(value.base64, 'base64');
      if (bytes.length !== value.bytes || bytes.toString('base64') !== value.base64 || sha(bytes) !== value.sha256 ||
          bytes.length !== Math.min(partBytes, active.worldBytes - active.bytes)) throw Error('World part bytes/SHA');
      await writeFile(resolve(root, `world-${next}-part-${active.received}.bin`), bytes, { flag: 'wx' });
      active.received++; active.bytes += bytes.length;
      return { sha256: value.sha256 };
    },
    async terminal(value) {
      if (!active || value.captureId !== captureId || value.sequence !== next || value.worldSha256 !== active.worldSha256 ||
          active.received !== active.parts || active.bytes !== active.worldBytes || !['PASS', 'FAILED'].includes(value.disposition))
        throw Error('World terminal identity/completeness');
      const chunks = [];
      for (let i = 0; i < active.parts; i++) chunks.push(await readFile(resolve(root, `world-${next}-part-${i}.bin`)));
      const bytes = Buffer.concat(chunks);
      if (sha(bytes) !== active.worldSha256) throw Error('World aggregate SHA');
      const record = JSON.parse(bytes.toString('utf8'));
      if (!record || record.disposition !== value.disposition) throw Error('World disposition mismatch');
      await write(`world-${next}-terminal.json`, { status: value.disposition, sha256: active.worldSha256, parts: active.parts, bytes: active.bytes, createdAt: new Date().toISOString() });
      total += active.bytes; next++; active = null; begun = false; failed ||= value.disposition !== 'PASS';
      return { sha256: value.worldSha256 };
    },
    stats() { return { worlds: next, bytes: total, incomplete: active !== null || begun, failed }; },
    requireComplete() { if (failed || active || begun || next !== worlds) throw Error('World inventory failed/incomplete'); },
  };
}
