import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, stat, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const port = Number(process.argv[2] ?? 5193);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const root = resolve('.pbi-validation-223/build');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const inputs = [
  'tests/browser/render-asset-budgets/main.ts',
  'tests/browser/render-asset-budgets/index.html',
  'tests/browser/asset-registry/glb-fixture.ts',
  'scripts/render-asset-budgets-server.mjs',
  'package-lock.json',
  'Docs/performance-budgets.json',
  ...(await readdir('src/rendering', { recursive: true }))
    .filter((f) => f.endsWith('.ts'))
    .sort()
    .map((f) => `src/rendering/${f.replaceAll('\\', '/')}`),
];
const digest = createHash('sha256');
for (const input of inputs) digest.update(input).update(await readFile(input));
const identity = {
  commit,
  sourceHash: digest.digest('hex'),
  budgetVersion: '203-initial-1',
  capVersion: '223-initial-1',
  engineVersion: '9.29.0',
  inputs,
};
await build({
  configFile: false,
  root: resolve('tests/browser/render-asset-budgets'),
  base: './',
  cacheDir: resolve('.pbi-validation-223/cache'),
  define: { __RENDER_BUILD__: JSON.stringify(identity) },
  build: { outDir: root, emptyOutDir: true },
});
const artifacts = [];
for (const file of (await readdir(root, { recursive: true })).sort()) {
  const absolute = resolve(root, file);
  if (!(await stat(absolute)).isFile()) continue;
  const bytes = await readFile(absolute);
  artifacts.push({
    path: file.replaceAll('\\', '/'),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const criticalCodeTransferBytes = artifacts
  .filter((a) => /\.(js|wasm)$/.test(a.path))
  .reduce((n, a) => n + a.bytes, 0);
const manifest = {
  ...identity,
  artifacts,
  criticalCodeTransferBytes,
  artifactHash: createHash('sha256').update(JSON.stringify(artifacts)).digest('hex'),
  compression:
    'Uncompressed response bytes; conservative all emitted JS+WASM, including Babylon lazy chunks.',
};
await writeFile(resolve(root, 'build-manifest.json'), JSON.stringify(manifest, null, 2));
await mkdir('Docs/Evidence/223-render-assets', { recursive: true });
await writeFile(
  'Docs/Evidence/223-render-assets/build-manifest.json',
  JSON.stringify(manifest, null, 2),
);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.css': 'text/css',
};
const server = createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/export') {
      let body = '';
      for await (const chunk of request) {
        body += chunk.toString();
        if (body.length > 2 * 1024 * 1024) {
          response.writeHead(413).end();
          return;
        }
      }
      const report = JSON.parse(body);
      if (
        report.identity?.sourceHash !== identity.sourceHash ||
        report.identity?.commit !== commit ||
        !['WEBGPU', 'WEBGL2'].includes(report.backend) ||
        report.runs?.length !== 20
      ) {
        response.writeHead(400).end('Invalid report');
        return;
      }
      const name = `${report.backend.toLowerCase()}${report.fixtureVersion.endsWith('-SMOKE') ? '-smoke' : ''}.json`;
      await writeFile(
        resolve('Docs/Evidence/223-render-assets', name),
        JSON.stringify(report, null, 2),
      );
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ saved: name }));
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405).end();
      return;
    }
    const pathname = decodeURIComponent(
      new URL(request.url ?? '/', `http://127.0.0.1:${port}`).pathname,
    );
    const file =
      pathname === '/hardware.json'
        ? resolve('.pbi-validation-218/hardware.json')
        : resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (pathname !== '/hardware.json' && !file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    if (!(await stat(file)).isFile()) {
      response.writeHead(404).end();
      return;
    }
    const data = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Length': data.length,
    });
    response.end(data);
  } catch {
    response.writeHead(404).end();
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`223 production fixture http://127.0.0.1:${port}`),
);
