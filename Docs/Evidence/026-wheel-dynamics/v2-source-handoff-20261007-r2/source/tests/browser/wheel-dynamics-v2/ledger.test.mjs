// UNEXECUTED source drafts. Only node built-ins; no browser/native/build and no fixed5220 bind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createLedger, readPortableCapture, PROTOCOL } from './ledger.mjs';
import { createPartLedger } from './part-ledger.mjs';
import { createEvidenceHandler } from './evidence-http.mjs';
import { EVIDENCE_BODY_LIMIT_BYTES, EvidenceTransportError } from './transport.mjs';
import { splitPayload, PART_BYTES } from './parts.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = { sourceHash: 'a'.repeat(64), artifactHash: 'b'.repeat(64), native: { bytes: 1, sha256: 'c'.repeat(64) } };
const startDto = () => ({ launchKey: randomUUID(), requestedBackend: 'AUTO', mode: 'full', clientSourceHash: identity.sourceHash });
const raw = binding => ({ binding, renderer: 'WEBGPU', armIndex: 0, frames: 1, ticks: 1, channels: Object.fromEntries(['frame','main','tick','projection','step'].map(key => [key,[1]])) });
async function fixture(callback, filesystem) {
  const directory = await mkdtemp(join(tmpdir(), '026-v2-ledger-'));
  try {
    let drift = false;
    const verify = async () => { if (drift) throw new EvidenceTransportError(409, 'Source drift'); };
    const ledger = createLedger(directory, identity, verify, filesystem);
    await callback({ ledger, directory, verify, drift: () => { drift = true; } });
  } finally { await rm(directory, { recursive: true }); }
}
test('wx start replay preserves UUID/issuedAt; backend count, source and terminal tamper rejected', () => fixture(async ({ ledger, drift }) => {
  const dto = startDto(), first = await ledger.start(dto), replay = await ledger.start(dto);
  assert.deepEqual(first, replay);
  await assert.rejects(ledger.start({ ...dto, mode: 'smoke' }), /binding conflict/);
  const binding = first.binding;
  await ledger.append({ binding, renderer: 'WEBGPU' }, 'backend');
  await assert.rejects(ledger.append({ binding, renderer: 'WEBGL2' }, 'backend'), /Conflicting/);
  await assert.rejects(ledger.append({ ...raw(binding), frames: 2 }, 'raw-0'), /count/);
  await ledger.append(raw(binding), 'raw-0');
  await assert.rejects(ledger.append({ binding, renderer: 'WEBGPU', state: 'CAPTURE_COMPLETE', acceptance: 'UNVERIFIED', report: { runs:[], calibration:[] } }, 'terminal'), /Incomplete/);
  const terminal = { binding, renderer: 'WEBGPU', state:'INCOMPLETE', acceptance:'UNVERIFIED', failure:'original failure' };
  await ledger.append(terminal, 'terminal');
  await assert.rejects(ledger.append({ ...terminal, failure:'rewritten' }, 'terminal'), /Conflicting/);
  await assert.rejects(ledger.append({ ...raw(binding), armIndex:1 }, 'raw-1'), /after terminal/);
  const saved = await ledger.read(binding.captureId, 'terminal');
  await ledger.append({ binding, renderer:'WEBGPU', armIndex:0, state:'FAILED_UNKNOWN', event:{ sequence:0, entry:282000 } }, 'late-0');
  assert.deepEqual(await ledger.read(binding.captureId, 'terminal'), saved);
  assert.equal((await ledger.read(binding.captureId, 'late-0')).record.dto.state, 'FAILED_UNKNOWN');
  drift(); await assert.rejects(ledger.append(raw(binding), 'raw-0'), /Source drift/);
}));
test('independent filesystem write/readback failures remain errors, not acknowledgments', async () => {
  for (const kind of ['write', 'readback']) {
    let armed = false;
    const fs = { mkdir, readFile: async (...args) => {
      const bytes = await readFile(...args); return armed && kind === 'readback' && String(args[0]).endsWith('backend.json') ? Buffer.from('{}') : bytes;
    }, writeFile: async (...args) => {
      if (armed && kind === 'write' && String(args[0]).endsWith('backend.json')) throw Object.assign(new Error('disk failure'), { code:'EIO' });
      return writeFile(...args);
    } };
    await fixture(async ({ ledger }) => {
      const { binding } = await ledger.start(startDto()); armed = true;
      await assert.rejects(ledger.append({ binding, renderer:'WEBGPU' }, 'backend'));
    }, fs);
  }
});
test('part count/hash frozen before bytes, lossless commit and corrupt/missing parts never ack', () => fixture(async ({ ledger, directory, verify }) => {
  const { binding } = await ledger.start(startDto()); await ledger.append({ binding, renderer:'WEBGPU' }, 'backend');
  const parts = createPartLedger(directory, ledger, verify), bytes = Buffer.from(JSON.stringify(raw(binding))), chunks = splitPayload(bytes);
  const manifest = { operation:'manifest', binding, name:'raw-0', bytes:bytes.length, count:chunks.length, sha256:hash(bytes) };
  await parts.append(manifest); await assert.rejects(parts.append({ ...manifest, sha256:'d'.repeat(64) }), /conflict/);
  await assert.rejects(parts.append({ operation:'commit', binding, name:'raw-0' }), /ENOENT/);
  await parts.append({ operation:'part', binding, name:'raw-0', index:0, base64:chunks[0].toString('base64') });
  await writeFile(join(directory, binding.captureId, 'parts-raw-0/0.bin'), Buffer.alloc(bytes.length, 120));
  await assert.rejects(parts.append({ operation:'commit', binding, name:'raw-0' }), /hash\/count/);
  await writeFile(join(directory, binding.captureId, 'parts-raw-0/0.bin'), bytes);
  const acknowledgment = await parts.append({ operation:'commit', binding, name:'raw-0' });
  assert.deepEqual((await ledger.read(binding.captureId,'raw-0')).record.dto,raw(binding));
  assert.deepEqual(await parts.append({ operation:'commit', binding, name:'raw-0' }), acknowledgment);
}));
test('shared actual HTTP handler: replay, count/backend tamper, exact4MiB boundary/+1, malformed and drift', () => fixture(async ({ ledger, directory, verify, drift }) => {
  const handler = createEvidenceHandler(ledger, createPartLedger(directory, ledger, verify), identity.sourceHash);
  const server = createServer(async (request,response) => {
    try { if (!await handler(request,response)) response.writeHead(404).end(); }
    catch (error) { response.writeHead(error.status ?? (error.code === 'ENOENT' ? 404 : 500)).end(error.message); }
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(url + path, { method:'POST', body:typeof body === 'string' ? body : JSON.stringify(body) });
  try {
    const dto = startDto(), first = await (await post('/capture/start',dto)).json();
    assert.deepEqual(await (await post('/capture/start',dto)).json(), first);
    const binding = first.binding;
    assert.equal((await post('/capture/backend', { binding, renderer:'WEBGPU' })).status,200);
    assert.equal((await post('/capture/backend', { binding, renderer:'WEBGL2' })).status,409);
    assert.equal((await post('/capture/raw-0', { ...raw(binding), ticks:2 })).status,400);
    assert.equal((await post('/capture/start','{')).status,400);
    const base = JSON.stringify({ ...startDto(), padding:'' });
    const boundary = base.slice(0,-2) + 'x'.repeat(EVIDENCE_BODY_LIMIT_BYTES - Buffer.byteLength(base)) + '"}';
    assert.equal(Buffer.byteLength(boundary), EVIDENCE_BODY_LIMIT_BYTES);
    assert.equal((await post('/capture/start',boundary)).status,200);
    assert.equal((await post('/capture/start',boundary.slice(0,-2)+'x"}')).status,413);
    const stored = await (await fetch(`${url}/capture/${binding.captureId}/backend`)).json();
    assert.equal(stored.bytes, Buffer.byteLength(stored.payload)); assert.equal(stored.sha256,hash(stored.payload));
    drift(); assert.equal((await post('/capture/raw-0',raw(binding))).status,409);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}));
test('portable archived source/artifact/native corruption remains FAIL across historical source identities', async () => {
  const directory = await mkdtemp(join(tmpdir(),'026-v2-portable-'));
  try {
    const captureId = randomUUID(), archiveName = `build-${'a'.repeat(64)}-${'b'.repeat(64)}-${randomUUID()}`, archive = join(directory,archiveName), capture = join(directory,captureId);
    await mkdir(join(archive,'source'),{recursive:true}); await mkdir(join(archive,'build'),{recursive:true}); await mkdir(join(archive,'native'),{recursive:true}); await mkdir(capture);
    const source = Buffer.from('old-source'), artifact = Buffer.from('old-artifact'), native = Buffer.from('old-native'), hardware = Buffer.from('{"purpose":"TEST_ONLY"}');
    const sourceHash = createHash('sha256').update('helper.mjs').update(source).digest('hex');
    const artifacts = [{ path:'index.js', bytes:artifact.length, sha256:hash(artifact) }], artifactHash = hash(JSON.stringify(artifacts));
    const binding = { captureId, protocol:PROTOCOL, archive:archiveName, sourceHash, artifactHash, inputs:['helper.mjs'], native:{ bytes:native.length, sha256:hash(native) }, hardware:{bytes:hardware.length,sha256:hash(hardware)}, mode:'full' };
    await writeFile(join(archive,'source/helper.mjs'),source); await writeFile(join(archive,'build/index.js'),artifact); await writeFile(join(archive,'native/rapier-native-artifact.mjs'),native);
    await writeFile(join(archive,'build-manifest.json'),JSON.stringify({ sourceHash,artifactHash,inputs:binding.inputs,artifacts }));
    await writeFile(join(archive,'hardware.json'),hardware);
    await writeFile(join(archive,'archive-complete.json'),JSON.stringify(binding));
    const payload = JSON.stringify({ binding,kind:'start',dto:{} }); await writeFile(join(capture,'start.json'),JSON.stringify({ payload,bytes:Buffer.byteLength(payload),sha256:hash(payload) }));
    assert.equal((await readPortableCapture(capture)).state,'INCOMPLETE');
    for (const [file,bytes] of [['source/helper.mjs',source],['build/index.js',artifact],['native/rapier-native-artifact.mjs',native],['hardware.json',hardware]]) {
      await writeFile(join(archive,file),Buffer.from('corrupt'));
      await assert.rejects(readPortableCapture(capture), /bytes changed/);
      await writeFile(join(archive,file),bytes);
    }
  } finally { await rm(directory,{recursive:true}); }
});
