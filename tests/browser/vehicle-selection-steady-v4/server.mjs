import { createPreflightStore, PREFLIGHT_CAP } from './preflight-store.mjs';
import { createWorldStore } from './world-store.mjs';
// PBI068 matched historical steady selection fixture; run only in the coordinated hardware slot.
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const port = Number(process.argv[2] ?? 5217);
if (
  port !== 5217 ||
  process.argv.length > 3 ||
  (process.argv[2] !== undefined && process.argv[2] !== '5217')
)
  throw new Error('Only assigned steady port5217 is permitted');
const cwd = resolve('.').replaceAll('\\', '/');
if (
  cwd !== 'F:/Sites/self-driving-academy/.worktrees/vehicle-switch-01' ||
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim() !==
    'loop-pbi/vehicle-switch-01' ||
  execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim() !== cwd
)
  throw Error('Unexpected root/branch');
if (!existsSync('src/input/vehicle-selection.ts')) throw Error('Production068 required');
const root = resolve('.pbi-validation-068/build-steady-v4-01');
const destination = resolve('Docs/Evidence/068-vehicle-switch/browser-steady-v4-01');
if (existsSync(root) || existsSync(destination))
  throw Error('Immutable build/evidence path already exists');
await mkdir(destination, { recursive: false });
await writeFile(resolve(destination, '.gitattributes'), '* -text\n', { flag: 'wx' });
const buildStartedAt = new Date().toISOString();
await writeFile(
  resolve(destination, 'build-started.json'),
  JSON.stringify({ status: 'STARTED', createdAt: buildStartedAt, cwd, productionAbsent: false }),
  { flag: 'wx' },
);
// Follow actual local executable imports/re-exports, including public barrels.
// Ignore type-only declarations: they cannot contribute bytes to this Vite build.
const consumed = new Set();
async function consume(path) {
  const absolute = resolve(path);
  if (consumed.has(absolute)) return;
  consumed.add(absolute);
  if (!['.ts', '.mjs', '.js'].includes(extname(absolute))) return;
  const scanner = createScanner(true);
  scanner.setText(await readFile(absolute, 'utf8'));
  const tokens = [];
  while (scanner.scan() !== SyntaxKind.EndOfFile)
    tokens.push({
      kind: scanner.getToken(),
      text: scanner.getTokenText(),
      value: scanner.getTokenValue(),
    });
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (
      token.kind !== SyntaxKind.StringLiteral ||
      !['from', 'import'].includes(tokens[index - 1]?.text)
    )
      continue;
    let declarationStart = index - 1;
    while (
      declarationStart >= 0 &&
      !['import', 'export', ';'].includes(tokens[declarationStart].text)
    )
      declarationStart--;
    if (declarationStart < 0 || !['import', 'export'].includes(tokens[declarationStart].text))
      continue;
    const clause = tokens.slice(declarationStart + 1, index - 1).map((item) => item.text);
    if (clause[0] === 'type') continue;
    if (clause[0] === '{' && clause.at(-1) === '}') {
      const elements = clause
        .slice(1, -1)
        .join(' ')
        .split(',')
        .map((element) => element.trim())
        .filter(Boolean);
      if (elements.length && elements.every((element) => /^type\s+(?!as\b)\S+/.test(element)))
        continue;
    }
    const specifier = token.value;
    if (!specifier.startsWith('.')) continue;
    const target = resolve(dirname(absolute), specifier.split('?')[0]);
    const candidate = [target, `${target}.ts`, resolve(target, 'index.ts')].find(
      (item) => existsSync(item) && extname(item),
    );
    if (!candidate) throw new Error(`Unresolved consumed source: ${absolute}: ${specifier}`);
    await consume(candidate);
  }
}
await consume('tests/browser/vehicle-selection-steady-v4/main.ts');
await consume('tests/browser/vehicle-selection-steady-v4/preflight-store.mjs');
for (const executable of [
  'tests/browser/vehicle-selection-steady-v4/server.mjs',
  'Docs/Evidence/068-vehicle-switch/archive-browser-steady-v4.mjs',
  'Docs/Evidence/068-vehicle-switch/verify-browser-steady-v4-build.mjs',
  'Docs/Evidence/068-vehicle-switch/verify-browser-steady-v4.mjs',
  'Docs/Evidence/068-vehicle-switch/derive-historical-steady.mjs',
])
  await consume(executable);
const inputs = [
  ...new Set([
    ...[...consumed].map((path) => relative(resolve('.'), path).replaceAll('\\', '/')),
    'tests/browser/vehicle-selection-steady-v4/index.html',
    'tests/browser/vehicle-selection-steady-v4/server.mjs',
    'package.json',
    'package-lock.json',
    'Docs/performance-budgets.json',
    'Docs/Evidence/068-vehicle-switch/archive-browser-steady-v4.mjs',
    'Docs/Evidence/068-vehicle-switch/verify-browser-steady-v4-build.mjs',
    'Docs/Evidence/068-vehicle-switch/verify-browser-steady-v4.mjs',
    'Docs/Evidence/068-vehicle-switch/browser-evidence-checks.mjs',
    'Docs/Evidence/068-vehicle-switch/derive-historical-steady.mjs',
    'Docs/Evidence/068-vehicle-switch/historical-steady-derivation-v2-01.json',
    'Docs/Evidence/068-vehicle-switch/steady-numeric-checks-v4.mjs',
    'Docs/Evidence/068-vehicle-switch/steady-numeric-checks-v4.test.mjs',
    'Docs/Evidence/068-vehicle-switch/steady-v2-original-failure-proof.json',
    'Docs/Evidence/068-vehicle-switch/verify-steady-original-failure-v3.mjs',
    'Docs/Evidence/068-vehicle-switch/verify-steady-original-failure-v4.mjs',
    'Docs/Evidence/068-vehicle-switch/steady-v4-v3-failure-proof.json',
    'Docs/Evidence/068-vehicle-switch/lifecycle-checks-v4.mjs',
    'Docs/Evidence/068-vehicle-switch/verify-lifecycle-preflight-v4.mjs',
    'tests/browser/vehicle-selection-steady-v4/lifecycle-proof.test.ts',
    'tests/browser/vehicle-selection-steady-v4/preflight-store.test.mjs',
    'Docs/Evidence/068-vehicle-switch/verify-steady-original-failure-v2.mjs',
    'Docs/Evidence/068-vehicle-switch/steady-v3-v2-failure-proof.json',
    'Docs/Evidence/068-vehicle-switch/initial-callback-checks-v4.mjs',
    'Docs/Evidence/068-vehicle-switch/initial-callback-checks-v4.test.mjs',
    'tests/browser/vehicle-selection-steady-v4/initial-callback.test.ts',
    'tests/browser/vehicle-selection-steady-v4/world-store.mjs',
    'tests/browser/vehicle-selection-steady-v4/warm-observation.test.ts',
    'scripts/register-typescript.mjs',
  ]),
].sort();
const hash = createHash('sha256');
for (const input of inputs) hash.update(input).update(await readFile(input));
const packages = JSON.parse(await readFile('package.json', 'utf8'));
const budgets = JSON.parse(await readFile('Docs/performance-budgets.json', 'utf8'));
const derivationBytes = await readFile(
  'Docs/Evidence/068-vehicle-switch/historical-steady-derivation-v2-01.json',
);
const derivation = JSON.parse(derivationBytes);
if (
  derivation.status !== 'DERIVED_SOURCE_ONLY' ||
  derivation.historicalSourceHash !==
    '0e215d02f8451a78a533ca87ebe44eddc1a197b8c8f29cff40c5f7e5963ae585' ||
  derivation.sharedRuntimeCommit !== 'ad32db9c609cce1132669c95312ae202a62b87ed'
)
  throw Error('Historical source derivation absent/mismatch');
const identity = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: hash.digest('hex'),
  historicalDerivationHash: createHash('sha256').update(derivationBytes).digest('hex'),
  inputs,
  budgetVersion: budgets.budgetVersion,
  physicsVersion: packages.dependencies['@dimforge/rapier3d-compat'],
  engineVersion: packages.dependencies['@babylonjs/core'],
};
const hardware = JSON.parse(
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  $hardware068 = [ordered]@{
    source = 'current CIM at fixture server startup'
    capturedAt = (Get-Date -Format o)
    cpu = @(Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors)
    gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate)
    memory = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, Speed)
    os = @(Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, TotalVisibleMemorySize)
    battery = @(Get-CimInstance Win32_Battery | Select-Object BatteryStatus, EstimatedChargeRemaining)
    powerScheme = (powercfg /getactivescheme | Out-String).Trim()
  }
  $hardware068 | ConvertTo-Json -Depth 6 -Compress
`,
    ],
    { encoding: 'utf8' },
  ).trim(),
);
const archive = resolve(destination, 'source-at-capture');
if (existsSync(archive)) {
  const archivedHash = createHash('sha256');
  for (const input of inputs)
    archivedHash.update(input).update(await readFile(resolve(archive, input)));
  if (archivedHash.digest('hex') !== identity.sourceHash)
    throw new Error('Existing source-at-capture differs; preserve attempt before rebuilding');
} else {
  await mkdir(archive, { recursive: false });
  await writeFile(resolve(archive, '.gitattributes'), '* -text\n');
  for (const input of inputs) {
    const target = resolve(archive, input);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(input), { flag: 'wx' });
  }
}
const nativePath = import.meta.resolve('@dimforge/rapier3d-compat');
const nativeBytes = await readFile(new URL(nativePath));
const native = {
  path: nativePath,
  bytes: nativeBytes.length,
  sha256: createHash('sha256').update(nativeBytes).digest('hex'),
  archivedAt: new Date().toISOString(),
};
await mkdir(resolve(destination, 'native'), { recursive: false });
await writeFile(resolve(destination, 'native/rapier.mjs'), nativeBytes, { flag: 'wx' });
await writeFile(resolve(destination, 'native.json'), JSON.stringify(native, null, 2), {
  flag: 'wx',
});
await build({
  configFile: false,
  root: resolve('tests/browser/vehicle-selection-steady-v4'),
  base: './',
  cacheDir: resolve('.pbi-validation-068/cache'),
  define: { __SELECTION_STEADY_BUILD__: JSON.stringify(identity) },
  build: { outDir: root, emptyOutDir: true },
});
const artifacts = [];
for (const file of (await readdir(root, { recursive: true })).sort()) {
  const path = resolve(root, file);
  if (!(await stat(path)).isFile()) continue;
  const bytes = await readFile(path);
  artifacts.push({
    path: file.replaceAll('\\', '/'),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const artifactHash = createHash('sha256').update(JSON.stringify(artifacts)).digest('hex');
await writeFile(
  resolve(root, 'build-manifest.json'),
  JSON.stringify(
    {
      ...identity,
      artifactHash,
      artifacts,
      note: 'All Vite-emitted files hashed before adding manifest and startup hardware metadata.',
    },
    null,
    2,
  ),
);
await writeFile(resolve(root, 'hardware.json'), JSON.stringify(hardware, null, 2), { flag: 'wx' });
await writeFile(
  resolve(destination, 'build-manifest.json'),
  await readFile(resolve(root, 'build-manifest.json')),
  { flag: 'wx' },
);
await writeFile(
  resolve(destination, 'hardware.json'),
  await readFile(resolve(root, 'hardware.json')),
  { flag: 'wx' },
);
async function currentGuard() {
  const h = createHash('sha256');
  for (const input of inputs) h.update(input).update(await readFile(input));
  if (h.digest('hex') !== identity.sourceHash) throw Error('Current source changed');
  if (
    createHash('sha256')
      .update(await readFile(new URL(nativePath)))
      .digest('hex') !== native.sha256
  )
    throw Error('Native changed');
  for (const artifact of artifacts) {
    const bytes = await readFile(resolve(root, artifact.path));
    if (
      bytes.length !== artifact.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== artifact.sha256
    )
      throw Error('Artifact changed');
  }
  if (!existsSync('src/input/vehicle-selection.ts')) throw Error('Production068 missing');
}
await currentGuard();
await writeFile(
  resolve(destination, 'build-complete.json'),
  JSON.stringify({
    status: 'BUILT',
    createdAt: new Date().toISOString(),
    buildStartedAt,
    sourceHash: identity.sourceHash,
    artifactHash,
  }),
  { flag: 'wx' },
);
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.css': 'text/css',
};

const preflightStore = createPreflightStore(destination, {
  sourceHash: identity.sourceHash,
  artifactHash,
});
const attempts = new Map();
const worldStores = new Map();
const expectedRenderer = (backend) =>
  backend === 'AUTO' ? 'WEBGPU' : backend === 'WEBGL2' ? 'WEBGL2' : null;
const captureIdFor = (backend) =>
  identity.sourceHash + '-' + expectedRenderer(backend)?.toLowerCase();
async function body(request, max) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > max) throw Error('Bounded request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function immutable(path, value) {
  await writeFile(resolve(destination, path), JSON.stringify(value, null, 2), { flag: 'wx' });
}
async function reject(backend, reason) {
  const name = expectedRenderer(backend)?.toLowerCase() ?? 'invalid';
  const path = 'capture-' + name + '-rejected.json';
  if (!existsSync(resolve(destination, path)))
    await immutable(path, {
      status: 'REJECTED',
      incomplete: true,
      requestedBackend: backend ?? null,
      captureId: expectedRenderer(backend) ? captureIdFor(backend) : null,
      createdAt: new Date().toISOString(),
      reason: String(reason),
    });
}
async function terminal(attempt, status, filename, reportBytes) {
  checkAttempt(attempt);
  await immutable('capture-' + attempt.renderer.toLowerCase() + '-terminal.json', {
    status,
    captureId: attempt.captureId,
    requestedBackend: attempt.requestedBackend,
    renderer: attempt.renderer,
    filename,
    reportSha256: createHash('sha256').update(reportBytes).digest('hex'),
    createdAt: new Date().toISOString(),
    incomplete: status !== 'PASS',
  });
  attempt.status = status;
}
function checkAttempt(attempt) {
  if (!attempt || attempt.status !== 'STARTED') throw Error('Capture absent/already terminal');
}
createServer(async (request, response) => {
  let backend = null;
  try {
    if (
      request.method === 'POST' &&
      ['/preflight-start', '/preflight-cycle', '/preflight-finish'].includes(request.url)
    ) {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > PREFLIGHT_CAP) throw Error('Preflight bounded128KiB request');
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks),
        value = JSON.parse(raw.toString('utf8'));
      backend = value.requestedBackend;
      await currentGuard();
      let ack;
      try {
        ack =
          request.url === '/preflight-start'
            ? await preflightStore.start(value)
            : request.url === '/preflight-cycle'
              ? await preflightStore.cycle(value, raw)
              : await preflightStore.finish(value, raw);
      } catch (error) {
        throw error;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(ack));
      return;
    }
    if (request.method === 'GET' && request.url === '/capture-ready') {
      await currentGuard();
      const archive = JSON.parse(
          await readFile(resolve(destination, 'build-archive.json'), 'utf8'),
        ),
        bytes = await readFile(resolve(destination, 'build-at-capture.zip'));
      if (
        bytes.length !== archive.archiveBytes ||
        createHash('sha256').update(bytes).digest('hex') !== archive.archiveSha256
      )
        throw Error('Durable archive not ready');
      response.writeHead(200).end('READY');
      return;
    }
    if (request.method === 'POST' && request.url === '/capture-start') {
      preflightStore.requireBothPassed();
      const start = await body(request, 2048);
      backend = start.requestedBackend;
      const renderer = expectedRenderer(backend);
      if (!renderer || !Number.isFinite(Date.parse(start.startedAt)))
        throw Error('Invalid bounded start request');
      await currentGuard();
      if (attempts.has(backend)) throw Error('One attempt per backend; preserve original');
      const attempt = {
        status: 'STARTED',
        captureId: captureIdFor(backend),
        requestedBackend: backend,
        renderer,
        sourceHash: identity.sourceHash,
        artifactHash,
        startedAt: start.startedAt,
        createdAt: new Date().toISOString(),
      };
      await immutable('capture-' + renderer.toLowerCase() + '-started.json', attempt);
      attempts.set(backend, attempt);
      worldStores.set(backend, createWorldStore(destination, attempt.captureId));
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ captureId: attempt.captureId }));
      return;
    }
    if (
      request.method === 'POST' &&
      ['/world-begin', '/world-start', '/world-part', '/world-terminal'].includes(request.url)
    ) {
      const value = await body(request, 768 * 1024);
      backend = value.requestedBackend;
      const attempt = attempts.get(backend);
      checkAttempt(attempt);
      if (value.captureId !== attempt.captureId) throw Error('World attempt identity');
      const store = worldStores.get(backend);
      const method = {
        '/world-begin': 'begin',
        '/world-start': 'start',
        '/world-part': 'part',
        '/world-terminal': 'terminal',
      }[request.url];
      const acknowledgment = await store[method](value);
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify(acknowledgment));
      return;
    }
    if (request.method === 'POST' && (request.url === '/failure' || request.url === '/export')) {
      const report = await body(
        request,
        request.url === '/failure' ? 2 * 1024 * 1024 : 64 * 1024 * 1024,
      );
      backend = report.requestedBackend;
      const attempt = attempts.get(backend);
      checkAttempt(attempt);
      if (
        report.captureId !== attempt.captureId ||
        report.identity?.sourceHash !== identity.sourceHash ||
        report.fixtureVersion !== '068-selection-historical-steady-v4' ||
        report.startedAt !== attempt.startedAt
      )
        throw Error('Exact attempt identity mismatch');
      if (request.url === '/failure') {
        report.status = 'FAILED';
        report.incomplete = true;
        const filename = 'failure-' + attempt.renderer.toLowerCase() + '.json',
          bytes = Buffer.from(JSON.stringify(report, null, 2));
        await writeFile(resolve(destination, filename), bytes, { flag: 'wx' });
        await terminal(attempt, 'FAILED', filename, bytes);
        response.writeHead(200).end(filename);
        return;
      }
      if (
        report.renderer !== attempt.renderer ||
        report.status !== 'PASS' ||
        report.foreground !== true ||
        report.summaries?.length !== 20 ||
        report.lifecycle?.length !== 20 ||
        report.worldsCreated !== 40 ||
        report.artifactHash !== artifactHash
      )
        throw Error('Invalid successful report');
      worldStores.get(backend).requireComplete();
      await currentGuard();
      const filename = 'drive-' + attempt.renderer.toLowerCase() + '.json',
        bytes = Buffer.from(JSON.stringify({ ...report, hardware, native }, null, 2));
      await writeFile(resolve(destination, filename), bytes, { flag: 'wx' });
      await terminal(attempt, 'PASS', filename, bytes);
      response.writeHead(200).end(filename);
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405).end();
      return;
    }
    if (request.url === '/baseline-webgpu.json' || request.url === '/baseline-webgl2.json') {
      const renderer = request.url.includes('webgpu') ? 'webgpu' : 'webgl2';
      const bytes = await readFile(
        resolve('Docs/Evidence/068-vehicle-switch/browser-before', `drive-${renderer}.json`),
      );
      response
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(bytes);
      return;
    }
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`),
      path = resolve(
        root,
        `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`,
      );
    if (!path.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    const bytes = await readFile(path);
    response
      .writeHead(200, {
        'Content-Type': mime[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      .end(bytes);
  } catch (error) {
    console.error(error);
    if (request.method === 'POST') {
      try {
        if (request.url?.startsWith('/preflight-')) await preflightStore.rejected(backend, error);
        else await reject(backend, error);
      } catch (rejectedWriteError) {
        console.error(
          new AggregateError([error, rejectedWriteError], 'Original/rejection-write causes'),
        );
      }
    }
    if (!response.headersSent)
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(String(error));
    else response.end();
  }
}).listen(port, '127.0.0.1', () => console.log(`068 fixture: http://127.0.0.1:${port}`));
