// PBI067 production fixture; run only in the coordinated hardware slot.
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const port = Number(process.argv[2] ?? 5203);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const root = resolve('.pbi-validation-067/build-after');
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
await consume('tests/browser/mode-controls/main.ts');
const inputs = [
  ...[...consumed].map((path) => relative(resolve('.'), path).replaceAll('\\', '/')),
  'tests/browser/mode-controls/index.html',
  'tests/browser/mode-controls/server.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
  'Docs/Evidence/067-mode-controls/browser-before/drive-webgpu.json',
  'Docs/Evidence/067-mode-controls/browser-before/drive-webgl2.json',
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
  $hardware067 = [ordered]@{
    source = 'current CIM at fixture server startup'
    capturedAt = (Get-Date -Format o)
    cpu = @(Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors)
    gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate)
    memory = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, Speed)
    os = @(Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, TotalVisibleMemorySize)
    battery = @(Get-CimInstance Win32_Battery | Select-Object BatteryStatus, EstimatedChargeRemaining)
    powerScheme = (powercfg /getactivescheme | Out-String).Trim()
  }
  $hardware067 | ConvertTo-Json -Depth 6 -Compress
`,
    ],
    { encoding: 'utf8' },
  ).trim(),
);
await build({
  configFile: false,
  root: resolve('tests/browser/mode-controls'),
  base: './',
  cacheDir: resolve('.pbi-validation-067/cache-after'),
  define: { __MODE_CONTROLS_BUILD__: JSON.stringify(identity) },
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

const destination = resolve('Docs/Evidence/067-mode-controls/browser-after');
await mkdir(destination, { recursive: true });
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
    await writeFile(target, await readFile(input));
  }
}
createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/failure') {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 128 * 1024) {
          response.writeHead(413).end('Failure too large');
          return;
        }
        chunks.push(chunk);
      }
      const report = JSON.parse(Buffer.concat(chunks).toString());
      if (
        report.fixtureVersion !== '067-mode-controls-v1' ||
        report.identity?.sourceHash !== identity.sourceHash
      ) {
        response.writeHead(400).end('Failure source mismatch');
        return;
      }
      const filename = `failure-${Date.now()}.json`;
      await writeFile(resolve(destination, filename), JSON.stringify(report, null, 2), {
        flag: 'wx',
      });
      response.writeHead(200).end(filename);
      return;
    }
    if (request.method === 'POST' && request.url === '/export') {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 1024 * 1024) {
          response.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (
        report.fixtureVersion !== '067-mode-controls-v1' ||
        report.identity?.sourceHash !== identity.sourceHash ||
        !['WEBGPU', 'WEBGL2'].includes(report.renderer) ||
        report.foreground !== true ||
        report.arms?.length !== 2 ||
        report.frameRuns?.length !== 10 ||
        report.domRuns?.length !== 2 ||
        report.artifactHash !== artifactHash
      ) {
        response.writeHead(400).end('Invalid report identity');
        return;
      }
      const filename = `drive-${report.renderer.toLowerCase()}.json`;
      if (existsSync(resolve(destination, filename))) {
        response.writeHead(409).end('Immutable report exists');
        return;
      }
      const currentHash = createHash('sha256');
      for (const input of inputs) currentHash.update(input).update(await readFile(input));
      if (currentHash.digest('hex') !== identity.sourceHash) {
        response.writeHead(409).end('Source changed during capture');
        return;
      }
      await writeFile(
        resolve(destination, filename),
        JSON.stringify({ ...report, hardware }, null, 2),
        { flag: 'wx' },
      );
      for (const [file, bytes] of [
        ['build-manifest.json', await readFile(resolve(root, 'build-manifest.json'))],
        ['hardware.json', Buffer.from(JSON.stringify(hardware, null, 2))],
      ]) {
        const target = resolve(destination, file);
        if (existsSync(target)) {
          const old = await readFile(target);
          if (!old.equals(bytes)) throw new Error('Immutable metadata identity changed');
        } else await writeFile(target, bytes, { flag: 'wx' });
      }
      response.writeHead(200).end(filename);
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405).end();
      return;
    }
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/baseline') {
      const renderer = url.searchParams.get('renderer');
      if (!['WEBGPU', 'WEBGL2'].includes(renderer)) {
        response.writeHead(400).end('Invalid baseline backend');
        return;
      }
      const bytes = await readFile(
        resolve(
          `Docs/Evidence/067-mode-controls/browser-before/drive-${renderer.toLowerCase()}.json`,
        ),
      );
      response
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(bytes);
      return;
    }
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
    if (!response.headersSent) response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    else response.end();
  }
}).listen(port, '127.0.0.1', () => console.log(`067 fixture: http://127.0.0.1:${port}`));
