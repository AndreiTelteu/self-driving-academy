import { createLedger } from './ledger.mjs';
import { createPartLedger } from './part-ledger.mjs';
import { createEvidenceHandler } from './evidence-http.mjs';
import { readCurrentNative } from './numeric-reader.mjs';
import { localClosure, verifyFrozenArchive } from '../../../scripts/wheel-capture-source.mjs';
// Preparation only: run after the coordinator releases the PBI223 hardware lock.
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep, dirname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { EvidenceTransportError } from './transport.mjs';

const port = Number(process.argv[2] ?? 5220);
const buildOnly = process.argv[3] === '--build-only';
if (port !== 5220 || process.argv.length > (buildOnly ? 4 : 3))
  throw new Error('Only reserved port5220 and optional --build-only');
const expectedRoot = resolve(
  new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
).replaceAll('\\', '/');
if (
  resolve('.').replaceAll(String.fromCharCode(92), '/') !== expectedRoot ||
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim() !==
    'loop-pbi/wheel-dynamics-01'
)
  throw new Error('Wrong026 worktree/branch');
if (
  execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' })
    .trim()
    .replaceAll(String.fromCharCode(92), '/') !== expectedRoot
)
  throw new Error('Wrong026 Git root');
if (process.env.PBI026_V2_EXECUTION_GRANT !== 'parent-serial-review-approved')
  throw new Error('SOURCE-only draft: parent serial execution grant required');
// Fail closed BEFORE any build/CIM/server action. Historical b696 is never current.
const currentNative = await readCurrentNative();
const freshAfterPath = `Docs/Evidence/026-wheel-dynamics/${currentNative.pins.afterCapture}/node.json`;
const freshCalibrationPath = `Docs/Evidence/026-wheel-dynamics/${currentNative.pins.calibrationCapture}/calibration.json`;
const buildRunId = randomUUID();
const root = resolve('.pbi-validation-026-v2', 'build-' + buildRunId);
// Follow actual local executable imports/re-exports, including public barrels.
// Ignore type-only declarations: they cannot contribute bytes to this Vite build.
const consumed = new Set();
async function consume(path) {
  for (const item of await localClosure([path])) consumed.add(resolve(item));
}
await consume('tests/browser/wheel-dynamics-v2/laptop-server.mjs');
await consume('tests/browser/wheel-dynamics-v2/main.ts');
await consume('tests/browser/wheel-dynamics-v2/transport.mjs');
await consume('tests/browser/wheel-dynamics-v2/ledger.mjs');
await consume('tests/browser/wheel-dynamics-v2/part-ledger.mjs');
await consume('tests/browser/wheel-dynamics-v2/evidence-http.mjs');
await consume('tests/browser/wheel-dynamics-v2/numeric-reader.mjs');
await consume('tests/browser/wheel-dynamics-v2/source-contract.mjs');
await consume('tests/browser/wheel-dynamics-v2/instrumentation-price.mjs');
for (const entry of [
  'lifetime.test.mjs',
  'ledger.test.mjs',
  'capacity.test.mjs',
  'numeric-reader.test.mjs',
  'device-loss.test.mjs',
])
  await consume(`tests/browser/wheel-dynamics-v2/${entry}`);
for (const entry of [
  'scripts/benchmark-wheel-dynamics.mjs',
  'scripts/calibrate-wheel-dynamics.mjs',
  'scripts/verify-wheel-dynamics.mjs',
  'tests/vehicles/wheel-dynamics.test.ts',
])
  await consume(entry);
const inputs = [
  ...new Set([
    ...[...consumed].map((path) =>
      relative(resolve('.'), path).replaceAll(String.fromCharCode(92), '/'),
    ),
    'tests/browser/wheel-dynamics-v2/index.html',
    'tests/browser/wheel-dynamics-v2/server.mjs',
    'tests/browser/wheel-dynamics-v2/lifetime.d.mts',
    'package.json',
    'package-lock.json',
    'Docs/performance-budgets.json',
    'tests/browser/wheel-dynamics-v2/lifetime.test.mjs',
    'tests/browser/wheel-dynamics-v2/ledger.test.mjs',
    'tests/browser/wheel-dynamics-v2/capacity.test.mjs',
    'tests/browser/wheel-dynamics-v2/numeric-reader.test.mjs',
    'tests/browser/wheel-dynamics-v2/device-loss.test.mjs',
    'tests/vehicles/wheel-dynamics-fixture.ts',
    'tests/vehicles/wheel-dynamics.test.ts',
    'scripts/benchmark-wheel-dynamics.mjs',
    'scripts/calibrate-wheel-dynamics.mjs',
    'scripts/verify-wheel-dynamics.mjs',
    'scripts/register-typescript.mjs',
    'Docs/Evidence/026-wheel-dynamics/before/node.json',
    'Docs/Evidence/026-wheel-dynamics/after-main-027/node.json',
    'Docs/Evidence/026-wheel-dynamics/calibration-v2.json',
    freshAfterPath,
    freshCalibrationPath,
    `Docs/Evidence/026-wheel-dynamics/${currentNative.pins.afterCapture}/terminal.json`,
    `Docs/Evidence/026-wheel-dynamics/${currentNative.pins.calibrationCapture}/terminal.json`,
  ]),
].sort();
const hash = createHash('sha256');
for (const input of inputs) hash.update(input).update(await readFile(input));
const packages = JSON.parse(await readFile('package.json', 'utf8'));
const budgets = JSON.parse(await readFile('Docs/performance-budgets.json', 'utf8'));
const identity = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: hash.digest('hex'),
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
  $hardware026 = [ordered]@{
    source = 'current CIM at fixture server startup'
    capturedAt = (Get-Date -Format o)
    cpu = @(Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors)
    gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate)
    memory = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, Speed)
    os = @(Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, TotalVisibleMemorySize)
    battery = @(Get-CimInstance Win32_Battery | Select-Object BatteryStatus, EstimatedChargeRemaining)
    powerScheme = (powercfg /getactivescheme | Out-String).Trim()
  }
  $hardware026 | ConvertTo-Json -Depth 6 -Compress
`,
    ],
    { encoding: 'utf8' },
  ).trim(),
);
await build({
  configFile: false,
  root: resolve('tests/browser/wheel-dynamics-v2'),
  base: './',
  cacheDir: resolve('.pbi-validation-026-v2/cache'),
  define: { __WHEEL_BUILD__: JSON.stringify(identity) },
  build: { outDir: root, emptyOutDir: true },
});
const artifacts = [];
for (const file of (await readdir(root, { recursive: true })).sort()) {
  const path = resolve(root, file);
  if (!(await stat(path)).isFile()) continue;
  const bytes = await readFile(path);
  artifacts.push({
    path: file.replaceAll(String.fromCharCode(92), '/'),
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
await writeFile(resolve(root, 'hardware.json'), JSON.stringify(hardware, null, 2));
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.css': 'text/css',
};

const destination = resolve('Docs/Evidence/026-wheel-dynamics/laptop-20261011-browser');
await mkdir(destination, { recursive: true });
// New namespace only. wx plus byte readback; failed writes remain incomplete, never overwritten.
const archive = resolve(destination, `build-${identity.sourceHash}-${artifactHash}-${buildRunId}`);
await mkdir(archive, { recursive: true });
async function immutableBytes(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, bytes, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  if (!(await readFile(path)).equals(Buffer.from(bytes)))
    throw new Error(`Archive bytes mismatch: ${path}`);
}
await immutableBytes(resolve(archive, '.gitattributes'), '* -text\n');
await immutableBytes(
  resolve(archive, 'archive-started.json'),
  JSON.stringify({ sourceHash: identity.sourceHash, artifactHash }),
);
for (const input of inputs)
  await immutableBytes(resolve(archive, 'source', input), await readFile(input));
for (const item of artifacts)
  await immutableBytes(
    resolve(archive, 'build', item.path),
    await readFile(resolve(root, item.path)),
  );
await immutableBytes(
  resolve(archive, 'build-manifest.json'),
  await readFile(resolve(root, 'build-manifest.json')),
);
await immutableBytes(
  resolve(archive, 'hardware.json'),
  await readFile(resolve(root, 'hardware.json')),
);
const native = JSON.parse(await readFile(freshAfterPath, 'utf8')).native;
const beforeNative = JSON.parse(
  await readFile('Docs/Evidence/026-wheel-dynamics/before/node.json', 'utf8'),
).native;
if (beforeNative.sha256 !== native.sha256)
  throw new Error('BEFORE/current native artifact differs');
const beforeBytes = await readFile(beforeNative.archive);
if (createHash('sha256').update(beforeBytes).digest('hex') !== beforeNative.sha256)
  throw new Error('BEFORE native archive changed');
const nativeBytes = await readFile(native.archive);
if (createHash('sha256').update(nativeBytes).digest('hex') !== native.sha256)
  throw new Error('Native archive identity mismatch');
await immutableBytes(resolve(archive, 'native/rapier-native-artifact.mjs'), nativeBytes);
const hardwareBytes = await readFile(resolve(archive, 'hardware.json'));
const bindingIdentity = {
  ...identity,
  artifactHash,
  currentNative: currentNative.pins,
  native: { bytes: nativeBytes.length, sha256: native.sha256 },
  hardware: {
    bytes: hardwareBytes.length,
    sha256: createHash('sha256').update(hardwareBytes).digest('hex'),
  },
  archive: relative(destination, archive).replaceAll(String.fromCharCode(92), '/'),
};
await verifyFrozen();
await immutableBytes(resolve(archive, 'archive-complete.json'), JSON.stringify(bindingIdentity));
if (buildOnly) {
  console.log(
    JSON.stringify({ state: 'BUILD_ARCHIVED_SERVER_NOT_STARTED', archive, bindingIdentity }),
  );
  process.exit(0);
}
async function verifyFrozen() {
  await readCurrentNative();
  try {
    await verifyFrozenArchive({
      inputs,
      sourceHash: identity.sourceHash,
      artifacts,
      root,
      archive,
      native,
    });
  } catch (error) {
    throw new EvidenceTransportError(409, `Frozen build verification failed: ${error.message}`);
  }
}
const ledger = createLedger(destination, bindingIdentity, verifyFrozen);
const partLedger = createPartLedger(destination, ledger, verifyFrozen);
const evidenceHandler = createEvidenceHandler(ledger, partLedger, identity.sourceHash);
createServer(async (request, response) => {
  try {
    if (await evidenceHandler(request, response)) return;
    if (request.method !== 'GET') {
      response.writeHead(405).end();
      return;
    }
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    const path = resolve(
      root,
      `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`,
    );
    if (!path.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    const contents = await readFile(path);
    response
      .writeHead(200, {
        'Content-Type': mime[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      .end(contents);
  } catch (error) {
    console.error(error);
    if (response.headersSent) {
      response.destroy();
      return;
    }
    if (error instanceof EvidenceTransportError)
      response.writeHead(error.status).end(error.message);
    else if (error.code === 'EEXIST') response.writeHead(409).end('Immutable report exists');
    else if (error.code === 'ENOENT') response.writeHead(404).end('File not found');
    else response.writeHead(500).end('Evidence request failed');
  }
}).listen(port, '127.0.0.1', () => console.log(`026 fixture: http://127.0.0.1:${port}`));
