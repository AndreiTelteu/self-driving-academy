import { createPerformanceReport } from '../src/telemetry/performance.ts';
import { VALIDATION_PROFILES } from '../src/telemetry/validation-protocol.ts';
import { readPairCheckpoints, savePairCheckpoint } from './validation-checkpoints.ts';
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, stat, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

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
  'src/telemetry/validation-protocol.ts',
  'scripts/validation-checkpoints.ts',
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
let leaseOwner;
const server = createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && ['/export', '/checkpoint', '/lease'].includes(request.url)) {
      let body = '';
      for await (const chunk of request) {
        body += chunk.toString();
        if (body.length > 1024 * 1024) {
          response.writeHead(413).end();
          return;
        }
      }
      const parsed = JSON.parse(body);
      if (request.url === '/lease') {
        if (!/^[a-f0-9-]{36}$/.test(parsed.sessionId)) throw new Error('Invalid lease owner');
        if (parsed.action === 'acquire') {
          if (leaseOwner) {
            response.writeHead(409).end('Another probe owns this server');
            return;
          }
          leaseOwner = parsed.sessionId;
        } else if (parsed.action === 'release' && leaseOwner === parsed.sessionId)
          leaseOwner = undefined;
        else throw new Error('Invalid lease operation');
        response.writeHead(200).end('Lease updated');
        return;
      }
      if (request.url === '/checkpoint') {
        if (parsed.sessionId !== leaseOwner) throw new Error('No active hardware lease');
        const { identity, pair, payload } = parsed;
        const protocol = VALIDATION_PROFILES[identity?.profile];
        if (
          !protocol ||
          identity.build?.sourceHash !== sourceDigest ||
          identity.build?.commit !== commit ||
          identity.buildManifest?.artifactHash !== artifactHash ||
          !Number.isInteger(pair) ||
          pair < 1 ||
          pair > protocol.pairs ||
          payload?.runs?.length !== 2 ||
          payload.cold?.repeat !== pair ||
          payload.warm?.repeat !== pair
        )
          throw new Error('Invalid pair identity');
        const expectedOrder = pair % 2 ? [false, true] : [true, false];
        for (const [index, run] of payload.runs.entries()) {
          if (
            run.repeat !== pair ||
            run.enabled !== expectedOrder[index] ||
            !(Number.isFinite(run.warmupMs) && run.warmupMs >= protocol.warmupMs) ||
            !(
              Number.isFinite(run.activeDurationMs) && run.activeDurationMs >= protocol.measuredMs
            ) ||
            !run.collector?.complete ||
            run.collector.enabled !== run.enabled ||
            !(Number.isFinite(run.wallDurationMs) && run.wallDurationMs >= 0) ||
            run.collector.dropped !== 0 ||
            run.longTasks?.overflow ||
            run.simulation?.overloads !== 0 ||
            !(
              Number.isFinite(run.simulation?.ratio) &&
              run.simulation.ratio >= (identity.profile === 'smoke' ? 0 : 0.98)
            ) ||
            !(run.referenceCpuMs?.count > 0) ||
            run.resources?.retainedSnapshotsAfterDispose !== 0
          )
            throw new Error('Incomplete pair');
        }
        await savePairCheckpoint(resolve('Evidence/218/checkpoints'), parsed);
        response.writeHead(200).end('Checkpoint saved; not a PASS');
        return;
      }
      const report = parsed;
      if (report.identity?.hardware?.resume?.sessionId !== leaseOwner)
        throw new Error('Export requires active hardware lease');
      createPerformanceReport(report);
      if (
        report.schemaVersion !== 1 ||
        report.identity?.sourceHash !== sourceDigest ||
        report.identity?.commit !== commit ||
        report.identity?.budgetVersion !== budgets.budgetVersion ||
        report.role !== 'hardware-browser' ||
        ![
          '218-browser-counter-v2',
          '218-browser-counter-v2-DEV',
          '218-browser-counter-v2-SMOKE',
        ].includes(report.identity?.fixtureVersion)
      ) {
        response.writeHead(400).end('Invalid report identity');
        return;
      }
      await mkdir(resolve('Evidence/218'), { recursive: true });
      const filename = `browser-${report.identity.fixtureVersion}-${Date.now()}-${randomUUID()}.json`;
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
    if (pathname.startsWith('/reports/')) {
      const name = pathname.slice('/reports/'.length);
      if (!/^browser-[a-zA-Z0-9.-]+\.json$/.test(name)) throw new Error('Invalid report name');
      const data = await readFile(resolve('Evidence/218', name));
      response
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(data);
      return;
    }
    if (pathname.startsWith('/checkpoints/')) {
      const records = await readPairCheckpoints(
        resolve('Evidence/218/checkpoints'),
        pathname.slice('/checkpoints/'.length),
      );
      response
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(records));
      return;
    }
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
    response
      .writeHead(request.method === 'POST' ? 400 : 404)
      .end('Invalid request or incomplete evidence');
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Hardware probe (${profile}): open Chrome at http://127.0.0.1:${port}`);
  console.log(
    'Connect power, disable battery saver, close other GPU workloads; keep the benchmark tab visible. Ctrl+C stops the local server.',
  );
});
