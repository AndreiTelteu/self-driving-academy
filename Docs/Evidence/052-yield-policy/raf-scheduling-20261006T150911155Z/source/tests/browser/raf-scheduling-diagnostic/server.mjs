// PBI052 production fixture; run only in the coordinated hardware slot.
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { diagnosticStore, readDiagnosticBody } from './store.mjs';

const assignedRoot = resolve('F:/Sites/self-driving-academy/.worktrees/yield-policy-01');
const normalized = (path) => resolve(path).replaceAll('\\', '/').toLowerCase();
if (normalized(process.cwd()) !== normalized(assignedRoot))
  throw new Error('052 assigned absolute cwd required');
const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
if (normalized(gitRoot) !== normalized(assignedRoot) || branch !== 'loop-pbi/yield-policy-01')
  throw new Error('052 assigned Git root/branch required');
const port = Number(process.argv[2] ?? 5215);
if (process.argv.length > 3 || port !== 5215)
  throw new Error('052 distinct assigned port5215 required; old5204/5206 reserved');
const root = resolve(assignedRoot, '.pbi-validation-raf-scheduling/build');
if (existsSync(root)) throw new Error('052 new build directory must be absent; no overwrite/retry');
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
await consume('tests/browser/raf-scheduling-diagnostic/main.ts');
await consume('tests/browser/raf-scheduling-diagnostic/server.mjs');
await consume('tests/browser/raf-scheduling-diagnostic/verify.mjs');
const inputs = [
  ...new Set([
    ...[...consumed].map((path) => relative(resolve('.'), path).replaceAll('\\', '/')),
    'tests/browser/raf-scheduling-diagnostic/index.html',
    'tests/browser/raf-scheduling-diagnostic/server.mjs',
    'scripts/register-typescript.mjs',
    'package.json',
    'package-lock.json',
    'Docs/performance-budgets.json',
  ]),
].sort();
if (inputs.length > 256 || inputs.some((input) => input.length > 512))
  throw Error('diagnostic build input metadata cap');
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
const destination = resolve(
  'Docs/Evidence/052-yield-policy/raf-scheduling-' +
    new Date().toISOString().replace(/[^0-9TZ]/g, ''),
);
await mkdir(destination, { recursive: false });
const archive = resolve(destination, 'source');
await mkdir(archive);
for (const input of inputs) {
  const target = resolve(archive, input);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await readFile(input), { flag: 'wx' });
}
const nativePath = import.meta.resolve('@dimforge/rapier3d-compat');
const native = await readFile(new URL(nativePath));
await writeFile(resolve(destination, 'rapier.mjs'), native, { flag: 'wx' });
const nativeHash = createHash('sha256').update(native).digest('hex');
const hardware = JSON.parse(
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  $hardware027 = [ordered]@{
    source = 'current CIM at fixture server startup'
    capturedAt = (Get-Date -Format o)
    cpu = @(Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors)
    gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate)
    memory = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, Speed)
    os = @(Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, TotalVisibleMemorySize)
    battery = @(Get-CimInstance Win32_Battery | Select-Object BatteryStatus, EstimatedChargeRemaining)
    powerScheme = (powercfg /getactivescheme | Out-String).Trim()
  }
  $hardware027 | ConvertTo-Json -Depth 6 -Compress
`,
    ],
    { encoding: 'utf8' },
  ).trim(),
);
if (existsSync(root))
  throw new Error('052 new build directory appeared before Vite; no overwrite/retry');
await build({
  configFile: false,
  root: resolve('tests/browser/raf-scheduling-diagnostic'),
  base: './',
  cacheDir: resolve('.pbi-validation-raf-scheduling/cache'),
  define: {
    __RAF_DIAGNOSTIC_BUILD__: JSON.stringify({ ...identity, nativeHash, diagnosticOnly: true }),
  },
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
await writeFile(resolve(root, 'hardware.json'), JSON.stringify(hardware, null, 2));
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.css': 'text/css',
};

const archivedArtifacts = resolve(destination, 'artifacts');
await mkdir(archivedArtifacts);
for (const artifact of artifacts) {
  const target = resolve(archivedArtifacts, artifact.path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await readFile(resolve(root, artifact.path)), { flag: 'wx' });
}
await writeFile(resolve(destination, '.gitattributes'), '* -text\n', { flag: 'wx' });
await mkdir(resolve(destination, 'captures'));
const manifest = {
  captureRevision: 'raf-scheduling-observation-v1',
  collectorRevision: 'raf-scheduling-observation-v1',
  validationRevision: 'diagnostic-transport-v1-no-performance-acceptance',
  ...identity,
  artifactHash,
  artifacts,
  archive,
  artifactRoot: archivedArtifacts,
  liveArtifactRoot: root,
  nativePath,
  nativeHash,
  nativeBytes: native.length,
  hardware,
  createdAt: new Date().toISOString(),
  captureRoot: resolve(destination, 'captures'),
};
await writeFile(resolve(destination, 'build-manifest.json'), JSON.stringify(manifest, null, 2), {
  flag: 'wx',
});
const zipPath = destination + '.zip';
const psQuote = (value) => "'" + value.replaceAll("'", "''") + "'";
execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    'Compress-Archive -LiteralPath ' +
      psQuote(destination) +
      ' -DestinationPath ' +
      psQuote(zipPath),
  ],
  { stdio: 'pipe' },
);
await writeFile(
  destination + '-archive.json',
  JSON.stringify(
    {
      zipPath,
      zipSha256: createHash('sha256')
        .update(await readFile(zipPath))
        .digest('hex'),
      sourceHash: identity.sourceHash,
      artifactHash,
      nativeHash,
      nativeBytes: native.length,
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
const guard = async () => {
  const hash = createHash('sha256');
  for (const input of inputs) hash.update(input).update(await readFile(input));
  if (hash.digest('hex') !== identity.sourceHash) throw Error('052 source changed during capture');
};
const store = diagnosticStore(manifest.captureRoot, manifest, guard);
const routes = { '/start': true, '/diagnostic': true };
createServer(async (request, response) => {
  try {
    if (request.method === 'POST') {
      if (!routes[request.url]) {
        response.writeHead(404).end();
        return;
      }
      const origin = request.headers.origin;
      if (
        !['http://127.0.0.1:' + port, 'http://localhost:' + port].includes(origin) ||
        request.headers['content-type'] !== 'application/json'
      ) {
        response.writeHead(403).end('052 origin/content type');
        return;
      }
      let body;
      try {
        body = await readDiagnosticBody(request);
      } catch (error) {
        await store.rejectBody(error);
        throw error;
      }
      const ack = await store.handle(request.url, body);
      response
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(ack));
      return;
    }
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
    const bytes = await readFile(path);
    response
      .writeHead(200, {
        'Content-Type': mime[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      .end(bytes);
  } catch (error) {
    console.error(error);
    if (!response.headersSent)
      response
        .writeHead(error.status ? error.status : error.code === 'ENOENT' ? 404 : 500)
        .end(error.message);
    else response.destroy();
  }
}).listen(port, '127.0.0.1', () => console.log(`052 fixture: http://127.0.0.1:${port}`));
