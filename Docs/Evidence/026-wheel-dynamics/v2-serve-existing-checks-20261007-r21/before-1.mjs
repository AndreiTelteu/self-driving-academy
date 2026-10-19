/** SOURCE20 ONLY. No invocation authorized by authoring this file. */
import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORKDIR, UUID, SOURCE, ARCHIVE_NAME, DESTINATION, ARCHIVE, MANIFEST, BUILD,
  PROOF_ROOT, SERVICE_PATHS, hash, need, exactBytes, inside, identity,
} from './serve-existing-contract.mjs';

const normalize = (path) => resolve(path).replaceAll('\\', '/');
async function regular(path, boundary = WORKDIR) {
  const delta = relative(resolve(boundary), resolve(path)).replaceAll('\\', '/');
  inside(boundary, delta);
  let current = resolve(boundary);
  need(!(await lstat(current)).isSymbolicLink(), 'Linked boundary');
  for (const part of delta.split('/')) {
    current = resolve(current, part);
    need(!(await lstat(current)).isSymbolicLink(), 'Linked path');
  }
  need(normalize(await realpath(path)) === normalize(path), 'Redirected path');
  need((await lstat(path)).isFile(), 'Expected regular file');
  return readFile(path);
}
async function strictFiles(root, expected) {
  const found = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      need(!entry.isSymbolicLink(), 'Linked archive/build entry');
      if (entry.isDirectory()) await walk(path);
      else {
        need(entry.isFile(), 'Non-regular archive/build entry');
        found.push(relative(root, path).replaceAll('\\', '/'));
      }
    }
  }
  await walk(root);
  need(JSON.stringify(found.sort()) === JSON.stringify([...expected].sort()), 'Exact archive/build file set');
}

async function main() {
  const [mode, manifestArg, proofHash, ...extra] = process.argv.slice(2);
  need(['--check-only', '--serve'].includes(mode) && extra.length === 0,
    'Usage: serve-existing.mjs --check-only|--serve EXACT_MANIFEST SERVICE_PROOF_SHA256');
  need(normalize('.') === WORKDIR && normalize(fileURLToPath(import.meta.url)) ===
    `${WORKDIR}/tests/browser/wheel-dynamics-v2/serve-existing.mjs`, 'Wrong026 workdir/entry');
  need(typeof manifestArg === 'string' && normalize(manifestArg) === MANIFEST, 'Exact R19 manifest required');
  need(/^[a-f0-9]{64}$/.test(proofHash ?? ''), 'Root-reviewed SOURCE20 proof hash required');
  if (mode === '--serve')
    need(process.env.PBI026_SERVE_EXISTING_GRANT === 'root-reviewed-r19-source20-serve-only',
      'Separate explicit root server-launch grant required');

  // Immutable sidecar exists from SOURCE preparation, never written by this service.
  async function verifyService() {
    const bytes = await regular(`${PROOF_ROOT}/service-proof.json`);
    need(hash(bytes) === proofHash, 'Service proof changed');
    const proof = JSON.parse(bytes);
    need(proof.state === 'SOURCE_ONLY_UNEXECUTED' && proof.buildUUID === UUID &&
      JSON.stringify(proof.files.map((x) => x.path)) === JSON.stringify(SERVICE_PATHS),
      'Bounded service closure/UUID');
    for (const item of proof.files) {
      const live = await regular(inside(WORKDIR, item.path));
      const archived = await regular(inside(`${PROOF_ROOT}/source`, item.path));
      exactBytes(live, item.bytes, item.sha256, 'Live auxiliary service');
      exactBytes(archived, item.bytes, item.sha256, 'Archived auxiliary service');
      need(live.equals(archived), 'Auxiliary service readback');
    }
  }
  await verifyService();

  // Read and validate all frozen code before importing any existing helper.
  const manifestBytes = await regular(MANIFEST);
  exactBytes(manifestBytes, 29758, 'b0e0e120860da7ce730cb089b2b1b82c1a6299f19cad366151217e52d2777eae', 'R19 manifest');
  const bindingBytes = await regular(`${ARCHIVE}/archive-complete.json`);
  exactBytes(bindingBytes, 6010, 'caa07ee1c1cbf40b90f27f9b9b4e3ade076603104eb21a7aea3bf55dbff4917d', 'R19 binding');
  const manifest = JSON.parse(manifestBytes), bindingIdentity = JSON.parse(bindingBytes);
  identity(manifest, bindingIdentity);

  async function verifyBytes() {
    await verifyService();
    need((await regular(MANIFEST)).equals(manifestBytes), 'R19 manifest drift');
    need((await regular(`${ARCHIVE}/archive-complete.json`)).equals(bindingBytes), 'R19 binding drift');
    for (const root of [WORKDIR, `${ARCHIVE}/source`]) {
      const { createHash } = await import('node:crypto');
      const aggregate = createHash('sha256');
      let count = 0;
      for (const input of manifest.inputs) {
        const bytes = await regular(inside(root, input));
        count += bytes.length;
        aggregate.update(input).update(bytes);
        if (root === WORKDIR)
          need(bytes.equals(await regular(inside(`${ARCHIVE}/source`, input))), 'Current production/source drift');
      }
      need(count === 6930954 && aggregate.digest('hex') === SOURCE, '105 source byte/count/hash');
    }
    for (const root of [BUILD, `${ARCHIVE}/build`]) {
      for (const item of manifest.artifacts)
        exactBytes(await regular(inside(root, item.path)), item.bytes, item.sha256, 'Built artifact');
      await strictFiles(root, [
        ...manifest.artifacts.map((x) => x.path),
        ...(root === BUILD ? ['build-manifest.json', 'hardware.json'] : []),
      ]);
    }
    need((await regular(`${BUILD}/build-manifest.json`)).equals(manifestBytes), 'Live manifest drift');
    for (const root of [BUILD, ARCHIVE])
      exactBytes(await regular(`${root}/hardware.json`), 1900,
        '7fbb27ac12af10c2e60453aa33da115f659646d21b39325ac95f49387387ac42', 'R19 hardware metadata');
    await strictFiles(ARCHIVE, [
      '.gitattributes', 'archive-started.json', 'archive-complete.json', 'build-manifest.json',
      'hardware.json', 'native/rapier-native-artifact.mjs',
      ...manifest.inputs.map((x) => `source/${x}`),
      ...manifest.artifacts.map((x) => `build/${x.path}`),
    ]);
  }
  await verifyBytes();
  const { readCurrentNative } = await import('./numeric-reader.mjs');
  const { verifyFrozenArchive } = await import('../../../scripts/wheel-capture-source.mjs');
  const { EvidenceTransportError } = await import('./transport.mjs');
  async function verifyFrozen() {
    try {
      await verifyBytes();
      const current = await readCurrentNative();
      need(JSON.stringify(current.pins) === JSON.stringify(bindingIdentity.currentNative), 'Original current80 pins');
      need(current.after.inputs.length === 80 && current.calibration.inputs.length === 80, 'Native80 counts');
      need(current.after.native.bytes === bindingIdentity.native.bytes &&
        current.after.native.sha256 === bindingIdentity.native.sha256, 'Native binding');
      await verifyFrozenArchive({ inputs: manifest.inputs, sourceHash: SOURCE,
        artifacts: manifest.artifacts, root: BUILD, archive: ARCHIVE, native: current.after.native });
    } catch (error) {
      throw new EvidenceTransportError(409, `Frozen build verification failed: ${error.message}`);
    }
  }
  await verifyFrozen();
  if (mode === '--check-only') {
    console.log(JSON.stringify({ state: 'EXISTING_BUILD_READ_ONLY_READY', buildUUID: UUID,
      archive: ARCHIVE_NAME, serviceProofHash: proofHash, hardwareNow: 'UNKNOWN: CIM not recaptured',
      ledgerCreated: false, listenerCreated: false, acceptance: 'UNVERIFIED' }));
    return; // BEFORE ledger creation, http import, listening or filesystem mutations.
  }

  const { createLedger } = await import('./ledger.mjs');
  const { createPartLedger } = await import('./part-ledger.mjs');
  const { createEvidenceHandler } = await import('./evidence-http.mjs');
  const { createServer } = await import('node:http');
  // Exact archive-complete binding: no new build/server UUID or browser owner fields.
  const ledger = createLedger(DESTINATION, bindingIdentity, verifyFrozen);
  const parts = createPartLedger(DESTINATION, ledger, verifyFrozen);
  const evidenceHandler = createEvidenceHandler(ledger, parts, SOURCE);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm',
    '.json': 'application/json', '.css': 'text/css' };
  const allowed = new Map(manifest.artifacts.map((item) => [item.path, item]));
  const server = createServer(async (request, response) => {
    try {
      // Auxiliary drift always blocks mutations, including original diagnostic exceptions.
      // Full frozen verification remains inside the original ledger/part-ledger policy.
      if (request.method === 'POST') {
        try { await verifyService(); }
        catch (error) { throw new EvidenceTransportError(409, `Auxiliary service verification failed: ${error.message}`); }
      }
      if (await evidenceHandler(request, response)) return;
      if (request.method !== 'GET') { response.writeHead(405).end(); return; }
      const url = new URL(request.url ?? '/', 'http://127.0.0.1:5220');
      const pathname = decodeURIComponent(url.pathname);
      const locator = pathname === '/' ? 'index.html' : pathname.slice(1);
      const path = inside(BUILD, locator);
      const item = allowed.get(locator);
      if (!item) { response.writeHead(404).end('File not found'); return; }
      const contents = await regular(path, BUILD);
      exactBytes(contents, item.bytes, item.sha256, 'Static response');
      response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store' }).end(contents);
    } catch (error) {
      console.error(error);
      if (response.headersSent) { response.destroy(); return; }
      if (error instanceof EvidenceTransportError) response.writeHead(error.status).end(error.message);
      else if (error.code === 'EEXIST') response.writeHead(409).end('Immutable report exists');
      else if (error.code === 'ENOENT') response.writeHead(404).end('File not found');
      else response.writeHead(500).end('Evidence request failed');
    }
  });
  server.on('error', (error) => { console.error(error); process.exitCode = 1; });
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    server.close(() => console.log(JSON.stringify({ state: 'SERVER_CLOSED', pid: process.pid })));
    server.closeIdleConnections();
    const deadline = setTimeout(() => { server.closeAllConnections(); process.exitCode = 1; }, 5000);
    deadline.unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.listen(5220, '127.0.0.1', () => console.log(JSON.stringify({
    state: 'EXISTING_BUILD_SERVER_READY', pid: process.pid, buildUUID: UUID,
    url: 'http://127.0.0.1:5220', serviceProofHash: proofHash,
    hardwareNow: 'UNKNOWN: CIM not recaptured', acceptance: 'UNVERIFIED',
  })));
}
await main();
