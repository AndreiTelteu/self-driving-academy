import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, stat, readdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const profile = process.argv[2] ?? 'laptop';
const port = Number(process.argv[3] ?? 5189);
if (
  !['desktop', 'laptop'].includes(profile) ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535
)
  throw new Error('Invalid hardware profile or port');
const root = resolve('.pbi-validation-203/build');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const inputs = [
  'tests/browser/hardware-bootstrap/main.ts',
  'tests/browser/hardware-bootstrap/index.html',
  'scripts/hardware-probe-server.mjs',
  'src/rendering/backend-policy.ts',
  'src/rendering/babylon/backend.ts',
  'src/rendering/babylon/recovery-session.ts',
  'src/rendering/babylon/diagnostics-adapter.ts',
  'src/rendering/diagnostics.ts',
  'package-lock.json',
];
const sourceHash = createHash('sha256');
for (const input of inputs) sourceHash.update(input).update(await readFile(input));
const sourceDigest = sourceHash.digest('hex');
await build({
  configFile: false,
  root: resolve('tests/browser/hardware-bootstrap'),
  base: './',
  cacheDir: resolve('.pbi-validation-203/cache'),
  define: {
    __PROBE_BUILD__: JSON.stringify({
      commit,
      sourceHash: sourceDigest,
      inputs,
      profile,
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
      profile,
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
    if (request.method !== 'GET') {
      response.writeHead(405).end();
      return;
    }
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    const file =
      pathname === '/hardware.json'
        ? resolve('.pbi-validation-203/hardware.json')
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
