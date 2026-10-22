/**
 * PBI 145 asset probe server.
 *
 * Builds the deterministic vehicle-assets page with Vite, identifies the build and hardware, serves
 * it on an explicit port and accepts one bounded measurement report. No simulation state, gameplay
 * server or fleet workload is started here; the browser page owns the presentation-only scene.
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
const port = Number(process.argv[2] ?? 5145);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const outDir = resolve('.pbi-validation-145/build');
const evidence = resolve('Docs/Evidence/145-vehicle-assets');
const inputs = [
  'tests/browser/vehicle-assets/index.html',
  'tests/browser/vehicle-assets/main.ts',
  'scripts/vehicle-assets-server.mjs',
  'src/rendering/babylon/index.ts',
  'src/rendering/babylon/vehicle-scene.ts',
  'src/rendering/index.ts',
  'src/rendering/vehicle-geometry.ts',
  'src/rendering/vehicle-visuals.ts',
  'src/rendering/asset-budgets.ts',
  'src/rendering/quality-policy.ts',
  'src/rendering/scene-contract.ts',
  'src/vehicles/vehicle-classes.ts',
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
  root: resolve('tests/browser/vehicle-assets'),
  base: './',
  cacheDir: resolve('.pbi-validation-145/cache'),
  define: { __VEHICLE_ASSET_BUILD__: JSON.stringify(identity) },
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
        report.fixture === '145-vehicle-assets-v1' &&
        report.identity?.commit === identity.commit &&
        report.identity?.sourceHash === identity.sourceHash &&
        ['WEBGPU', 'WEBGL2'].includes(report.renderer) &&
        Array.isArray(report.lodProbe) &&
        report.lodProbe.length === 3 &&
        Array.isArray(report.declared) &&
        report.declared.length === 7;
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
}).listen(port, '127.0.0.1', () => console.log(`145 probe: http://127.0.0.1:${port}/`));
