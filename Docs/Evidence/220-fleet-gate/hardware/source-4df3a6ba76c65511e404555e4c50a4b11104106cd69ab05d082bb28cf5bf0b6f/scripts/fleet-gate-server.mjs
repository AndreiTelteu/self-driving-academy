// PBI 220 exclusive hardware grant required before startup/build.
// Production build, CIM hardware identity, immutable per-run evidence and resume support.
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { FLEET_WORKLOADS, hardwareColumn } from '../tests/browser/fleet-performance-gate/plan.ts';

const port = Number(process.argv[2] ?? 5196);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const root = resolve('.pbi-validation-220/build');
const evidenceRoot = resolve('Docs/Evidence/220-fleet-gate/hardware');

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
await consume('tests/browser/fleet-performance-gate/main.ts');
const inputs = [
  ...[...consumed].map((path) => relative(resolve('.'), path).replaceAll('\\', '/')),
  'tests/browser/fleet-performance-gate/index.html',
  'scripts/fleet-gate-server.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
].sort();
const hash = createHash('sha256');
for (const input of inputs) hash.update(input).update(await readFile(input));
const packages = JSON.parse(await readFile('package.json', 'utf8'));
const budgets = JSON.parse(await readFile('Docs/performance-budgets.json', 'utf8'));
const identity = {
  gateVersion: '220-fleet-gate-v1',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: hash.digest('hex'),
  inputs,
  budgetVersion: budgets.budgetVersion,
  physicsVersion: packages.dependencies['@dimforge/rapier3d-compat'],
  engineVersion: packages.dependencies['@babylonjs/core'],
  workloads: FLEET_WORKLOADS.map((spec) => spec.id),
};
const hardware = JSON.parse(
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  $cs = Get-CimInstance Win32_ComputerSystem
  $gateHardware = [ordered]@{
    source = 'current CIM at fixture server startup'
    capturedAt = (Get-Date -Format o)
    manufacturer = $cs.Manufacturer
    model = $cs.Model
    cpu = @(Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed)
    gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate)
    memory = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, Speed)
    os = @(Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, TotalVisibleMemorySize)
    battery = @(Get-CimInstance Win32_Battery | Select-Object BatteryStatus, EstimatedChargeRemaining)
    powerScheme = (powercfg /getactivescheme | Out-String).Trim()
  }
  $gateHardware | ConvertTo-Json -Depth 6 -Compress
`,
    ],
    { encoding: 'utf8' },
  ).trim(),
);
const gpuName = Array.isArray(hardware.gpu) ? (hardware.gpu[0]?.Name ?? '') : '';
const cpuName = Array.isArray(hardware.cpu) ? (hardware.cpu[0]?.Name ?? '') : '';
const budgetColumn = hardwareColumn({ model: hardware.model ?? '', cpu: cpuName, gpu: gpuName });
const browser = execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    `(Get-Item "$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe").VersionInfo.ProductVersion`,
  ],
  { encoding: 'utf8' },
).trim();
console.log(
  `Identified hardware: ${hardware.model ?? 'unknown model'} / ${cpuName} / ${gpuName}; budget column ${budgetColumn}; Chrome ${browser}.`,
);

await build({
  configFile: false,
  root: resolve('tests/browser/fleet-performance-gate'),
  base: './',
  cacheDir: resolve('.pbi-validation-220/cache'),
  define: { __FLEET_GATE_BUILD__: JSON.stringify(identity) },
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
      note: 'All Vite-emitted files hashed before adding this manifest and the startup hardware record.',
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

await mkdir(evidenceRoot, { recursive: true });

function safeName(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9._-]{1,120}$/.test(value))
    throw new Error('Invalid evidence name');
  return value;
}

createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/export') {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) {
          response.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const kinds = ['run', 'summary', 'matrix', 'failure'];
      if (
        report.identity?.sourceHash !== identity.sourceHash ||
        report.identity?.commit !== identity.commit ||
        report.artifactHash !== artifactHash ||
        !/^[0-9TZ]{18,24}$/.test(report.captureId ?? '') ||
        !kinds.includes(report.kind) ||
        !['WEBGPU', 'WEBGL2'].includes(report.renderer) ||
        report.budgetColumn !== budgetColumn ||
        JSON.stringify(report.identity?.inputs) !== JSON.stringify(identity.inputs)
      ) {
        response.writeHead(400).end('Invalid report identity');
        return;
      }
      const workload =
        report.kind === 'matrix' ? 'matrix' : safeName(String(report.workload ?? 'unknown'));
      if (report.kind !== 'matrix' && !identity.workloads.includes(workload)) {
        response.writeHead(400).end('Unknown workload');
        return;
      }
      const captureDestination = resolve(evidenceRoot, report.captureId);
      await mkdir(captureDestination, { recursive: true });
      const suffix = report.smoke ? '-smoke' : '';
      const renderer = report.renderer.toLowerCase();
      const filename =
        report.kind === 'run'
          ? `${renderer}-${workload}-${safeName(String(report.run?.repeat))}${suffix}.json`
          : report.kind === 'failure'
            ? `${renderer}-${workload}-failure-${String(Date.now())}${suffix}.json`
            : `${renderer}-${workload}-${report.kind}${suffix}.json`;
      if (existsSync(resolve(captureDestination, filename))) {
        const previous = JSON.parse(await readFile(resolve(captureDestination, filename), 'utf8'));
        if (JSON.stringify(previous) === JSON.stringify({ ...report, hardware, budgetColumn })) {
          response.writeHead(200).end(filename);
          return;
        }
        response.writeHead(409).end('Immutable report exists');
        return;
      }
      const currentHash = createHash('sha256');
      for (const input of inputs) currentHash.update(input).update(await readFile(input));
      if (currentHash.digest('hex') !== identity.sourceHash) {
        response.writeHead(409).end('Source changed during capture');
        return;
      }
      const archive = resolve(evidenceRoot, `source-${identity.sourceHash}`);
      await mkdir(archive, { recursive: true });
      await writeFile(resolve(archive, '.gitattributes'), '* -text\n');
      for (const input of inputs) {
        const target = resolve(archive, input);
        if (!target.startsWith(archive + sep)) throw new Error('Archive path escaped boundary');
        await mkdir(dirname(target), { recursive: true });
        const bytes = await readFile(input);
        if (existsSync(target)) {
          if (!(await readFile(target)).equals(bytes)) throw new Error('Immutable archive drift');
        } else await writeFile(target, bytes);
      }
      await writeFile(
        resolve(captureDestination, filename),
        JSON.stringify({ ...report, hardware, budgetColumn }, null, 2),
      );
      await writeFile(
        resolve(captureDestination, 'build-manifest.json'),
        await readFile(resolve(root, 'build-manifest.json')),
      );
      await writeFile(
        resolve(captureDestination, 'hardware.json'),
        JSON.stringify({ ...hardware, budgetColumn, chromeVersion: browser }, null, 2),
      );
      response.writeHead(200).end(filename);
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405).end();
      return;
    }
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/saved-runs') {
      const captureId = url.searchParams.get('captureId'),
        workload = url.searchParams.get('workload'),
        renderer = url.searchParams.get('renderer'),
        smoke = url.searchParams.get('smoke') === 'true';
      if (
        !/^[0-9TZ]{18,24}$/.test(captureId ?? '') ||
        !identity.workloads.includes(workload ?? '') ||
        !['WEBGPU', 'WEBGL2'].includes(renderer ?? '')
      ) {
        response.writeHead(400).end('Invalid resume identity');
        return;
      }
      const directory = resolve(evidenceRoot, captureId);
      const runs = [];
      if (existsSync(directory))
        for (const filename of await readdir(directory)) {
          const prefix = `${renderer.toLowerCase()}-${workload}-`;
          if (
            !filename.startsWith(prefix) ||
            !/-\d+(?:-smoke)?\.json$/.test(filename) ||
            filename.includes('-smoke') !== smoke
          )
            continue;
          const report = JSON.parse(await readFile(resolve(directory, filename), 'utf8'));
          if (
            report.identity.sourceHash !== identity.sourceHash ||
            report.artifactHash !== artifactHash ||
            report.kind !== 'run' ||
            report.smoke !== smoke ||
            report.budgetColumn !== budgetColumn ||
            JSON.stringify(report.hardware.cpu) !== JSON.stringify(hardware.cpu) ||
            JSON.stringify(report.hardware.gpu) !== JSON.stringify(hardware.gpu) ||
            report.hardware.powerScheme !== hardware.powerScheme
          ) {
            response.writeHead(409).end('Saved source/build/hardware differs');
            return;
          }
          runs.push(report.run);
        }
      response
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(runs));
      return;
    }
    if (url.pathname.startsWith('/reports/')) {
      const captureId = safeName(url.pathname.slice('/reports/'.length));
      const directory = resolve(evidenceRoot, captureId);
      const files = existsSync(directory) ? (await readdir(directory)).sort() : [];
      response
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify({ captureId, files }));
      return;
    }
    const path = resolve(
      root,
      `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`,
    );
    if (path !== resolve(root, 'hardware.json') && !path.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    response
      .writeHead(200, {
        'Content-Type': mime[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      .end(await readFile(path));
  } catch (error) {
    console.error(error);
    response.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`220 fleet gate (${budgetColumn}): http://127.0.0.1:${port}/`);
  console.log(
    'Connect power, disable battery saver, close other GPU/CPU workloads; keep the benchmark tab visible.',
  );
});
