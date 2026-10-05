// Preparation only: run after the coordinator releases the PBI223 hardware lock.
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const port = Number(process.argv[2] ?? 5193);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const root = resolve('.pbi-validation-023/build');
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
await consume('tests/browser/vehicle-classes/main.ts');
const inputs = [
  ...[...consumed].map((path) => relative(resolve('.'), path).replaceAll('\\', '/')),
  'tests/browser/vehicle-classes/index.html',
  'tests/browser/vehicle-classes/server.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
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
  $hardware023 = [ordered]@{
    source = 'current CIM at fixture server startup'
    capturedAt = (Get-Date -Format o)
    cpu = @(Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors)
    gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate)
    memory = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, Speed)
    os = @(Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, TotalVisibleMemorySize)
    battery = @(Get-CimInstance Win32_Battery | Select-Object BatteryStatus, EstimatedChargeRemaining)
    powerScheme = (powercfg /getactivescheme | Out-String).Trim()
  }
  $hardware023 | ConvertTo-Json -Depth 6 -Compress
`,
    ],
    { encoding: 'utf8' },
  ).trim(),
);
await build({
  configFile: false,
  root: resolve('tests/browser/vehicle-classes'),
  base: './',
  cacheDir: resolve('.pbi-validation-023/cache'),
  define: { __CLASS_BUILD__: JSON.stringify(identity) },
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
createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/classes-export') {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 128 * 1024) {
          response.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (
        report.identity?.sourceHash !== identity.sourceHash ||
        report.identity?.commit !== identity.commit ||
        !['WEBGPU', 'WEBGL2'].includes(report.renderer) ||
        report.foreground !== true ||
        report.classes?.length !== 2
      ) {
        response.writeHead(400).end('Invalid class identity');
        return;
      }
      const destination = resolve('Docs/Evidence/023-vehicle-classes');
      await mkdir(destination, { recursive: true });
      await writeFile(
        resolve(destination, `classes-${report.renderer.toLowerCase()}.json`),
        JSON.stringify({ ...report, artifactHash, hardware }, null, 2),
      );
      response.writeHead(200).end('saved');
      return;
    }
    if (request.method === 'POST' && request.url === '/export') {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) {
          response.writeHead(413).end('Report exceeds 2MiB');
          return;
        }
        chunks.push(chunk);
      }
      const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const smoke = report.fixtureVersion === '023-classes-v1-SMOKE';
      const valid =
        (smoke || report.fixtureVersion === '023-classes-v1') &&
        ['WEBGPU', 'WEBGL2'].includes(report.renderer) &&
        report.identity?.commit === identity.commit &&
        report.identity?.sourceHash === identity.sourceHash &&
        report.identity?.budgetVersion === identity.budgetVersion &&
        report.identity?.engineVersion === identity.engineVersion &&
        report.identity?.physicsVersion === identity.physicsVersion &&
        report.artifactHash === artifactHash &&
        JSON.stringify(report.hardware) === JSON.stringify(hardware) &&
        Array.isArray(report.runs) &&
        report.runs.length === (smoke ? 2 : 10) &&
        report.runs.every(
          (run, index) =>
            run.epoch === index &&
            run.mode ===
              ((Math.floor(index / 2) % 2 === 0) === (index % 2 === 0) ? 'default' : 'mixed') &&
            run.warmupS === (smoke ? 1 : 30) &&
            run.measuredS >= (smoke ? 3 : 120),
        ) &&
        Array.isArray(report.lifecycle?.cycles) &&
        report.lifecycle.cycles.length === 20;
      if (!valid) {
        response.writeHead(400).end('Invalid source/commit/hardware/protocol identity');
        return;
      }
      const destination = resolve('Docs/Evidence/023-vehicle-classes');
      await mkdir(destination, { recursive: true });
      const filename = `${report.renderer.toLowerCase()}${smoke ? '-smoke' : ''}.json`;
      await writeFile(resolve(destination, filename), JSON.stringify(report, null, 2));
      await writeFile(resolve(destination, 'hardware.json'), JSON.stringify(hardware, null, 2));
      await writeFile(
        resolve(destination, 'build-manifest.json'),
        await readFile(resolve(root, 'build-manifest.json')),
      );
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ saved: filename }));
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
    const data = await readFile(path);
    response
      .writeHead(200, {
        'Content-Type': mime[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      .end(data);
  } catch {
    response.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`023 fixture: http://127.0.0.1:${port}`));
