import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, stat, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const profile = 'desktop';
const port = Number(process.argv[2] ?? 5190);
if (
  !['desktop', 'laptop'].includes(profile) ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535
)
  throw new Error('Invalid hardware profile or port');
const root = resolve('.pbi-validation-218/build');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const inputs = [
  'tests/browser/performance-harness/main.ts',
  'tests/browser/performance-harness/index.html',
  'scripts/performance-harness-server.mjs',
  'src/rendering/backend-policy.ts',
  'src/rendering/babylon/backend.ts',
  'src/rendering/babylon/recovery-session.ts',
  'src/rendering/babylon/diagnostics-adapter.ts',
  'src/rendering/diagnostics.ts',
  'package-lock.json',
  'src/telemetry/performance.ts',
  'src/simulation/fixed-tick.ts',
  'src/sessions/validation.ts',
  'src/sessions/index.ts',
  'Docs/performance-budgets.json',
];
const budgets = JSON.parse(await readFile('Docs/performance-budgets.json', 'utf8'));
const packages = JSON.parse(await readFile('package.json', 'utf8'));
const sourceHash = createHash('sha256');
for (const input of inputs) sourceHash.update(input).update(await readFile(input));
const sourceDigest = sourceHash.digest('hex');
await build({
  configFile: false,
  root: resolve('tests/browser/performance-harness'),
  base: './',
  cacheDir: resolve('.pbi-validation-218/cache'),
  define: {
    __HARNESS_BUILD__: JSON.stringify({
      commit,
      sourceHash: sourceDigest,
      inputs,
      budgetVersion: budgets.budgetVersion,
      engineVersion: packages.dependencies['@babylonjs/core'],
    }),
  },
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
const artifactHash = createHash('sha256').update(JSON.stringify(artifacts)).digest('hex');
await writeFile(
  resolve(root, 'build-manifest.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      commit,
      sourceHash: sourceDigest,
      budgetVersion: '203-initial-1',
      engineVersion: '9.29.0',
      artifactHash,
      artifacts,
      note: 'Every emitted file hashed before adding this manifest; includes actual HTML, JS and WASM bytes.',
    },
    null,
    2,
  ),
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
        if (body.length > 1024 * 1024) {
          response.writeHead(413).end();
          return;
        }
      }
      const report = JSON.parse(body);
      if (
        report.schemaVersion !== 1 ||
        report.identity?.sourceHash !== sourceDigest ||
        report.identity?.commit !== commit ||
        report.identity?.budgetVersion !== budgets.budgetVersion ||
        report.role !== 'hardware-browser' ||
        report.runs?.length !== 10
      ) {
        response.writeHead(400).end('Invalid report identity');
        return;
      }
      await mkdir(resolve('Evidence/218'), { recursive: true });
      const filename = report.identity.fixtureVersion.endsWith('-SMOKE')
        ? 'browser-smoke.json'
        : 'desktop-webgpu.json';
      await writeFile(resolve('Evidence/218', filename), JSON.stringify(report, null, 2));
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
    const pathname = decodeURIComponent(url.pathname);
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
server.listen(port, '127.0.0.1', () => {
  console.log(`Hardware probe (${profile}): open Chrome at http://127.0.0.1:${port}`);
  console.log(
    'Connect power, disable battery saver, close other GPU workloads; keep the benchmark tab visible. Ctrl+C stops the local server.',
  );
});
