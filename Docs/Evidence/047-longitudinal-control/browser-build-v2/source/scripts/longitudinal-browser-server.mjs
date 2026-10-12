// Short047 integration transport; capture helpers are shared with native evidence.
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { localClosure, immutable, digest } from './wheel-capture-source.mjs';

const port = Number(process.argv[2] ?? 5231);
const label = process.argv[3] ?? 'browser-build-v1';
if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[a-z0-9-]+$/.test(label))
  throw new Error('Invalid browser capture arguments');
const folder = resolve(`Docs/Evidence/047-longitudinal-control/${label}`);
const output = resolve('.pbi-validation-047/browser-build');
const paths = await localClosure([
  'tests/browser/longitudinal-control/main.ts',
  'tests/browser/longitudinal-control/index.html',
  'scripts/longitudinal-browser-server.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
]);
const inputs = [];
for (const path of paths) {
  const bytes = await readFile(path);
  inputs.push({ path, bytes: bytes.length, sha256: digest(bytes) });
  await immutable(resolve(folder, 'source', path), bytes);
}
const sourceHash = digest(JSON.stringify(inputs));
const packages = JSON.parse(await readFile('package.json', 'utf8'));
const budgets = JSON.parse(await readFile('Docs/performance-budgets.json', 'utf8'));
const identity = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash,
  budgetVersion: budgets.budgetVersion,
  engineVersion: packages.dependencies['@babylonjs/core'],
  physicsVersion: packages.dependencies['@dimforge/rapier3d-compat'],
};
const hardware = JSON.parse(
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      '[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); [ordered]@{ capturedAt = (Get-Date -Format o); cpu = @(Get-CimInstance Win32_Processor | Select-Object Name); gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion); os = @(Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber); powerScheme = (powercfg /getactivescheme | Out-String).Trim() } | ConvertTo-Json -Depth 5 -Compress',
    ],
    { encoding: 'utf8' },
  ),
);
await build({
  configFile: false,
  root: resolve('tests/browser/longitudinal-control'),
  base: './',
  cacheDir: resolve('.pbi-validation-047/browser-cache'),
  define: { __LONGITUDINAL_BUILD__: JSON.stringify(identity) },
  build: { outDir: output, emptyOutDir: true },
});
const artifacts = [];
for (const path of (await readdir(output, { recursive: true })).sort()) {
  const absolute = resolve(output, path);
  if (!(await stat(absolute)).isFile()) continue;
  const bytes = await readFile(absolute);
  const normalized = path.replaceAll('\\', '/');
  artifacts.push({ path: normalized, bytes: bytes.length, sha256: digest(bytes) });
  await immutable(resolve(folder, 'artifact', normalized), bytes);
}
const binding = {
  ...identity,
  capturedAt: new Date().toISOString(),
  inputs,
  artifacts,
  artifactHash: digest(JSON.stringify(artifacts)),
};
for (const input of inputs)
  if (digest(await readFile(input.path)) !== input.sha256)
    throw new Error(`Source changed during browser build: ${input.path}`);
await immutable(resolve(folder, 'binding.json'), binding);
await immutable(resolve(folder, 'hardware.json'), hardware);
await immutable(resolve(folder, '.gitattributes'), '* -text\n');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.css': 'text/css',
};
let exporting = false;
const server = createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/export') {
      if (exporting) {
        response.writeHead(409).end('Export in progress');
        return;
      }
      exporting = true;
      try {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of request) {
          bytes += chunk.length;
          if (bytes > 4 * 1024 * 1024) throw new Error('Export capacity exceeded');
          chunks.push(chunk);
        }
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (payload?.build?.sourceHash !== sourceHash)
          throw new Error('Foreign browser build export');
        const name = `run-${randomUUID()}.json`;
        const envelope = {
          capturedAt: new Date().toISOString(),
          build: binding,
          hardware,
          payload,
        };
        await immutable(resolve(folder, name), envelope);
        const sha256 = digest(await readFile(resolve(folder, name)));
        await immutable(resolve(folder, `${name}.receipt.json`), { name, sha256 });
        response
          .writeHead(200, { 'Content-Type': mime['.json'] })
          .end(JSON.stringify({ saved: name, sha256 }));
        console.log(JSON.stringify({ saved: `${folder}/${name}`, sha256 }));
      } finally {
        exporting = false;
      }
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405).end('Method not allowed');
      return;
    }
    if (request.url === '/build-manifest.json') {
      response.writeHead(200, { 'Content-Type': mime['.json'] }).end(JSON.stringify(binding));
      return;
    }
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const path = resolve(output, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(`${output}${sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    let content;
    try {
      content = await readFile(path);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error;
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' });
    response.end(content);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) response.writeHead(400);
    response.end('Browser capture request failed');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(JSON.stringify({ url: `http://127.0.0.1:${port}`, folder, sourceHash })),
);
