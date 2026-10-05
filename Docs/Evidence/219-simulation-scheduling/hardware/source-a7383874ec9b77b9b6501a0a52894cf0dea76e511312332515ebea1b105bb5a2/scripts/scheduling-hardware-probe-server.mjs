// PBI219 exclusive hardware grant required before startup/build.
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const port = Number(process.argv[2] ?? 5195);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const root = resolve('.pbi-validation-219/build');
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
await consume('tests/browser/simulation-scheduling/main.ts');
const inputs = [
  ...[...consumed].map((path) => relative(resolve('.'), path).replaceAll('\\', '/')),
  'tests/browser/simulation-scheduling/index.html',
  'scripts/scheduling-hardware-probe-server.mjs',
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
  $hardware219 = [ordered]@{
    source = 'current CIM at fixture server startup'
    capturedAt = (Get-Date -Format o)
    cpu = @(Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors)
    gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate)
    memory = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, Speed)
    os = @(Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, TotalVisibleMemorySize)
    battery = @(Get-CimInstance Win32_Battery | Select-Object BatteryStatus, EstimatedChargeRemaining)
    powerScheme = (powercfg /getactivescheme | Out-String).Trim()
  }
  $hardware219 | ConvertTo-Json -Depth 6 -Compress
`,
    ],
    { encoding: 'utf8' },
  ).trim(),
);
await build({
  configFile: false,
  root: resolve('tests/browser/simulation-scheduling'),
  base: './',
  cacheDir: resolve('.pbi-validation-219/cache'),
  define: { __SCHEDULING_BUILD__: JSON.stringify(identity) },
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

const destination = resolve('Docs/Evidence/219-simulation-scheduling/hardware');
await mkdir(destination, { recursive: true });
createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/export') {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 256 * 1024) {
          response.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (
        report.identity?.sourceHash !== identity.sourceHash ||
        !['WEBGPU', 'WEBGL2'].includes(report.renderer) ||
        report.artifactHash !== artifactHash ||
        !/^[0-9TZ]{18,24}$/.test(report.captureId) ||
        !['run', 'arm', 'comparison', 'failure'].includes(report.kind) ||
        !['UNPHASED_REFERENCE', 'ENTITY_PHASED', 'BOTH'].includes(report.arm)
      ) {
        response.writeHead(400).end('Invalid report identity');
        return;
      }
      const captureDestination = resolve(destination, report.captureId);
      await mkdir(captureDestination, { recursive: true });
      const suffix = report.smoke ? '-smoke' : '';
      const name =
        report.kind === 'run'
          ? `${report.arm.toLowerCase()}-${report.run.repeat}-${report.run.observe ? 'on' : 'off'}`
          : `${report.arm.toLowerCase()}-${report.kind}`;
      const filename = `${report.renderer.toLowerCase()}-${name}${suffix}.json`;
      if (existsSync(resolve(captureDestination, filename))) {
        const previous = JSON.parse(await readFile(resolve(captureDestination, filename), 'utf8'));
        if (
          report.kind === 'arm' &&
          previous.identity.sourceHash === identity.sourceHash &&
          previous.artifactHash === artifactHash &&
          JSON.stringify(previous.result.runs) === JSON.stringify(report.result.runs)
        ) {
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
      const archive = resolve(destination, `source-${identity.sourceHash}`);
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
        JSON.stringify({ ...report, hardware }, null, 2),
      );
      await writeFile(
        resolve(captureDestination, 'build-manifest.json'),
        await readFile(resolve(root, 'build-manifest.json')),
      );
      await writeFile(
        resolve(captureDestination, 'hardware.json'),
        JSON.stringify(hardware, null, 2),
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
        renderer = url.searchParams.get('renderer'),
        arm = url.searchParams.get('arm'),
        smoke = url.searchParams.get('smoke') === 'true';
      if (
        !/^[0-9TZ]{18,24}$/.test(captureId ?? '') ||
        !['WEBGPU', 'WEBGL2'].includes(renderer) ||
        !['UNPHASED_REFERENCE', 'ENTITY_PHASED'].includes(arm)
      ) {
        response.writeHead(400).end('Invalid resume identity');
        return;
      }
      const directory = resolve(destination, captureId);
      const runs = [];
      if (existsSync(directory))
        for (const filename of await readdir(directory)) {
          const prefix = `${renderer.toLowerCase()}-${arm.toLowerCase()}-`;
          if (
            !filename.startsWith(prefix) ||
            !/-(?:on|off)(?:-smoke)?\.json$/.test(filename) ||
            filename.includes('-smoke') !== smoke
          )
            continue;
          const report = JSON.parse(await readFile(resolve(directory, filename), 'utf8'));
          if (
            report.identity.sourceHash !== identity.sourceHash ||
            report.artifactHash !== artifactHash ||
            report.kind !== 'run' ||
            report.smoke !== smoke ||
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
    const path = resolve(
      root,
      `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`,
    );
    if (!path.startsWith(root + sep)) {
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
}).listen(port, '127.0.0.1', () => console.log(`219 fixture: http://127.0.0.1:${port}`));
