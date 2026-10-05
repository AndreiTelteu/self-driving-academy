import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const port = Number(process.argv[2] ?? 5193);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const root = resolve('.pbi-validation-221/build');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const inputs = [
  'src/workers/index.ts',
  'src/workers/governor.ts',
  'src/workers/protocol.ts',
  'src/workers/runtime.ts',
  'src/workers/client.ts',
  'src/workers/transport.ts',
  'src/telemetry/performance.ts',
  'tests/harness/governor-probe.ts',
  'tests/harness/governor-task.ts',
  'tests/harness/governor-store.ts',
  'tests/browser/worker-governor/index.html',
  'tests/browser/worker-governor/main.ts',
  'tests/browser/worker-governor/worker.ts',
  'scripts/worker-governor-server.mjs',
  'package-lock.json',
];
const hash = createHash('sha256');
for (const input of inputs) hash.update(input).update(await readFile(input));
const sourceHash = hash.digest('hex');
const identity = { commit, sourceHash, inputs };
await build({
  configFile: false,
  root: resolve('tests/browser/worker-governor'),
  base: './',
  cacheDir: resolve('.pbi-validation-221/cache'),
  define: { __GOVERNOR_BUILD__: JSON.stringify(identity) },
  build: { outDir: root, emptyOutDir: true },
});
const artifacts = [];
for (const path of (await readdir(root, { recursive: true })).sort()) {
  const file = resolve(root, path);
  if (!(await stat(file)).isFile()) continue;
  const bytes = await readFile(file);
  artifacts.push({
    path: path.replaceAll('\\', '/'),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const artifactHash = createHash('sha256').update(JSON.stringify(artifacts)).digest('hex');
await mkdir(resolve('Evidence/221'), { recursive: true });
await writeFile(
  resolve('Evidence/221/browser-build.json'),
  JSON.stringify({ ...identity, artifacts, artifactHash }, null, 2),
);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
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
        report.build?.sourceHash !== sourceHash ||
        report.build?.commit !== commit ||
        report.repeats?.length !== 5
      )
        throw new Error('Identity mismatch');
      await writeFile(
        resolve('Evidence/221/browser.json'),
        JSON.stringify({ ...report, artifactHash }, null, 2),
      );
      response.writeHead(200).end('saved');
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
        ? resolve('.pbi-validation-221/hardware.json')
        : resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (pathname !== '/hardware.json' && !file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    const bytes = await readFile(file);
    response
      .writeHead(200, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      .end(bytes);
  } catch {
    response.writeHead(400).end('Invalid request or unavailable file');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`221 production worker probe http://127.0.0.1:${port}`),
);
