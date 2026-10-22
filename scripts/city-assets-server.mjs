/**
 * PBI 146 city-assets probe server: production Vite build, build/hardware identity and one bounded
 * report export. The gameplay/fleet measurement itself reuses the PBI 220 gate harness.
 */
import { build } from 'vite';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
const port = Number(process.argv[2] ?? 5146);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const outDir = resolve('.pbi-validation-146/build');
const evidence = resolve('Docs/Evidence/146-city-assets');
const inputs = [
  'tests/browser/city-assets/index.html',
  'tests/browser/city-assets/main.ts',
  'scripts/city-assets-server.mjs',
  'src/rendering/babylon/index.ts',
  'src/rendering/babylon/city-scene.ts',
  'src/rendering/babylon/city-decor-scene.ts',
  'src/rendering/index.ts',
  'src/rendering/city-decor.ts',
  'src/rendering/asset-budgets.ts',
  'src/rendering/quality-policy.ts',
  'src/world/city-layout.ts',
  'src/world/index.ts',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
].sort();
const hash = createHash('sha256');
for (const input of inputs) {
  if (!existsSync(input)) throw new Error(`Missing probe input ${input}`);
  hash.update(input).update(await readFile(input));
}
const packages = JSON.parse(await readFile('package.json', 'utf8'));
const budgets = JSON.parse(await readFile('Docs/performance-budgets.json', 'utf8'));
const identity = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: hash.digest('hex'),
  inputs,
  budgetVersion: budgets.budgetVersion,
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
  $probe = [ordered]@{
    source = 'current CIM at fixture server startup'
    capturedAt = (Get-Date -Format o)
    cpu = @(Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors)
    gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate)
    memory = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, Speed)
    os = @(Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, TotalVisibleMemorySize)
    battery = @(Get-CimInstance Win32_Battery | Select-Object BatteryStatus, EstimatedChargeRemaining)
    powerScheme = (powercfg /getactivescheme | Out-String).Trim()
  }
  $probe | ConvertTo-Json -Depth 6 -Compress
`,
    ],
    { encoding: 'utf8' },
  ).trim(),
);
await build({
  configFile: false,
  root: resolve('tests/browser/city-assets'),
  base: './',
  cacheDir: resolve('.pbi-validation-146/cache'),
  define: { __CITY_ASSET_BUILD__: JSON.stringify(identity) },
  build: { outDir, emptyOutDir: true },
});
const artifacts = [];
for (const file of (await readdir(outDir, { recursive: true })).sort()) {
  const path = resolve(outDir, file);
  if (!(await stat(path)).isFile()) continue;
  const bytes = await readFile(path);
  artifacts.push({
    path: file.replaceAll('\\', '/'),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const artifactHash = createHash('sha256').update(JSON.stringify(artifacts)).digest('hex');
await mkdir(evidence, { recursive: true });
await writeFile(
  resolve(evidence, 'build-manifest.json'),
  JSON.stringify({ ...identity, artifactHash, artifacts, hardware }, null, 2),
);
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
};
createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/export') {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) {
          response.writeHead(413).end('Report exceeds 1 MiB');
          return;
        }
        chunks.push(chunk);
      }
      const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const valid =
        report.fixture === '146-city-assets-v1' &&
        report.identity?.commit === identity.commit &&
        report.identity?.sourceHash === identity.sourceHash &&
        ['WEBGPU', 'WEBGL2'].includes(report.renderer) &&
        Array.isArray(report.views) &&
        report.views.length === 4 &&
        Array.isArray(report.decor?.inventory) &&
        report.decor.inventory.length === 8 &&
        Array.isArray(report.decor?.issues) &&
        report.decor.issues.length === 0;
      if (!valid) {
        response.writeHead(400).end('Invalid identity/fixture/report shape');
        return;
      }
      await writeFile(
        resolve(evidence, 'measurement.json'),
        JSON.stringify({ ...report, artifactHash, hardware }, null, 2),
      );
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"saved":true}');
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405).end();
      return;
    }
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    const path = resolve(
      outDir,
      `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`,
    );
    if (!path.startsWith(outDir + sep)) {
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
}).listen(port, '127.0.0.1', () => console.log(`146 probe: http://127.0.0.1:${port}/`));
