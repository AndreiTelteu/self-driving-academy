import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyBuild } from '../vehicle-recovery-after-v4/build-binding.mjs';
import { createFunctionalStore } from '../vehicle-recovery-after-v4/functional-store.mjs';
import { hash, safePath } from '../vehicle-recovery-after/browser-store.mjs';
import { diagnosticAdmission } from './admission.mjs';

assert.equal(
  resolve('.').replaceAll('\\', '/'),
  'F:/Sites/self-driving-academy/.worktrees/vehicle-recovery-01',
);
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/vehicle-recovery-01',
);
assert.equal(
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  'ad32db9c609cce1132669c95312ae202a62b87ed',
);
assert.equal(process.argv.length, 2);
// Historical inventory mode is deliberate: new diagnostic source is additional to the frozen V4 inventory.
const original = await verifyBuild(
  'Docs/Evidence/030-vehicle-recovery/browser-after-04/build-manifest.json',
  true,
);
for (const row of original.inputs) {
  const bytes = await readFile(row.path);
  assert.equal(bytes.length, row.bytes);
  assert.equal(
    hash(bytes),
    row.sha256,
    'Every consumed original V4 input remains CURRENT byte-exact',
  );
}
assert.equal(hash(await readFile(original.nativePath)), original.nativeHash);
const actualSrc = execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .map((p) => p.replaceAll('\\', '/'))
  .sort();
assert.deepEqual(
  actualSrc,
  original.inputs
    .filter((r) => r.path.startsWith('src/'))
    .map((r) => r.path)
    .sort(),
);
const root = 'Docs/Evidence/030-vehicle-recovery/automated-diagnostic-01';
await mkdir(root, { recursive: false }); // No retry, reset or overwrite of this diagnostic session.
const save = (name, value) =>
  writeFile(safePath(root, name), JSON.stringify(value), { flag: 'wx' });
const source = [];
for (const path of [
  'tests/browser/vehicle-recovery-automated-diagnostic/server.mjs',
  'tests/browser/vehicle-recovery-automated-diagnostic/admission.mjs',
  'tests/browser/vehicle-recovery-automated-diagnostic/admission.test.mjs',
]) {
  const bytes = await readFile(path);
  source.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  await writeFile(safePath(root, path.split('/').at(-1)), bytes, { flag: 'wx' });
}
await mkdir(safePath(root, 'functional'), { recursive: false });
const build = {
  ...original,
  buildUUID: randomUUID(),
  functionalRoot: root + '/functional',
  diagnosticRevision: '030-AUTOMATED_CUA_DIAGNOSTIC_V4_ARTIFACTS',
  physicalAcceptance: false,
};
await save('session.json', {
  createdAt: new Date().toISOString(),
  originalBuildUUID: original.buildUUID,
  sessionBuildUUID: build.buildUUID,
  originalSourceHash: original.sourceHash,
  originalArtifactHash: original.artifactHash,
  nativeHash: original.nativeHash,
  originalZip: original.zip,
  source,
  scope:
    'Same V4 artifacts and gameplay gates; new server/session only. CDP input provenance must be recorded by root. Browser isTrusted is not physical-user proof.',
  physicalAcceptance: false,
  performanceAcceptance: false,
});
const store = await createFunctionalStore(build),
  claim = diagnosticAdmission();
let ordinal = 0;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:5223');
  let bytesRead = 0,
    requestOrdinal,
    chunks = [],
    rawSaved = false;
  try {
    if (req.method === 'POST') {
      assert(['http://127.0.0.1:5223', 'http://localhost:5223'].includes(req.headers.origin));
      requestOrdinal = ++ordinal;
      assert(requestOrdinal <= 16, 'Finite diagnostic request inventory');
      await save(`request-${requestOrdinal}-started.json`, {
        receivedAt: new Date().toISOString(),
        path: url.pathname,
        origin: req.headers.origin,
      });
      for await (const chunk of req) {
        bytesRead += chunk.length;
        assert(bytesRead <= 2 * 1024 * 1024, 'Same bounded functional2MiB request');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      await writeFile(safePath(root, `request-${requestOrdinal}-raw.json`), bytes, { flag: 'wx' });
      rawSaved = true;
      await save(`request-${requestOrdinal}-envelope.json`, {
        receivedAt: new Date().toISOString(),
        path: url.pathname,
        bytes: bytes.length,
        sha256: hash(bytes),
      });
      let result;
      if (url.pathname === '/functional/start') {
        claim(); // Before any backend/world can be admitted, raw rejected starts are already retained.
        result = await store.start(JSON.parse(bytes));
      } else {
        const match = url.pathname.match(/^\/functional\/([0-9TZ]{10,40})\/(report|failure)$/);
        assert(match, 'No performance or arbitrary endpoints in diagnostic server');
        result = await store.receive(match[1], match[2], bytes);
      }
      await save(`request-${requestOrdinal}-terminal.json`, {
        completedAt: new Date().toISOString(),
        status: 200,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }
    assert.equal(req.method, 'GET');
    if (url.pathname === '/build' || url.pathname === '/diagnostic') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(
          url.pathname === '/build'
            ? build
            : {
                scope: build.diagnosticRevision,
                physicalAcceptance: false,
                performanceAcceptance: false,
              },
        ),
      );
      return;
    }
    const path = url.pathname === '/' ? 'browser.html' : decodeURIComponent(url.pathname.slice(1));
    const bytes = await readFile(safePath(original.artifactRoot, path));
    res.writeHead(200, {
      'Content-Type':
        {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.wasm': 'application/wasm',
        }[extname(path)] ?? 'application/octet-stream',
      'X-PBI030-Scope': 'AUTOMATED-DIAGNOSTIC-NO-PHYSICAL-ACCEPTANCE',
    });
    res.end(bytes);
  } catch (error) {
    if (requestOrdinal && requestOrdinal <= 16) {
      try {
        await save(`request-${requestOrdinal}-error.json`, {
          failedAt: new Date().toISOString(),
          path: url.pathname,
          bytesRead,
          error: String(error).slice(0, 4096),
          rawRetained: rawSaved,
          physicalAcceptance: false,
        });
      } catch (exportError) {
        console.error('Diagnostic original and sidecar export causes', error, exportError);
      }
    }
    console.error('Diagnostic request failure', url.pathname, error);
    if (!res.headersSent)
      res.writeHead(bytesRead > 2 * 1024 * 1024 ? 413 : error.code === 'ENOENT' ? 404 : 400, {
        'Content-Type': 'text/plain',
      });
    res.end(String(error));
  }
});
server.listen(5223, '127.0.0.1', () =>
  console.log(
    'AUTOMATED CUA DIAGNOSTIC ONLY http://127.0.0.1:5223 physicalAcceptance=false; frozen V4 artifacts reused unchanged',
  ),
);
process.on('SIGINT', () => server.close(() => process.exit(0)));
