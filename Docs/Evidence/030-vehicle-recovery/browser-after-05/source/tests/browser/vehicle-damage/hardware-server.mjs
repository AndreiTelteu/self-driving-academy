// Source preparation only: starting this server requires the coordinator CPU/browser grant.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { serveFrozenArtifact, respondFailure } from './hardware-static-response.ts';
import { createHardwareStore } from './hardware-store.ts';
import { createFunctionalStore } from './hardware-functional-store.ts';
import { validateLoopbackPost, readBoundedJson, PartCapacityError } from './hardware-transport.ts';
assert.equal(process.cwd(), 'F:\\Sites\\self-driving-academy\\.worktrees\\vehicle-damage-01');
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/vehicle-damage-01',
);
const manifestPath = process.argv[2];
assert.ok(manifestPath, 'Pass a previously frozen hardware build manifest');
const port = Number(process.argv[3] ?? 5199);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const build = JSON.parse(await readFile(manifestPath, 'utf8'));
const store = createHardwareStore(build, build.captureRoot);
const functional = createFunctionalStore(build, store.verifySources);
const artifactRoot = resolve(build.artifactRoot);
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.css': 'text/css',
  '.json': 'application/json',
};
const routes = {
  '/hardware-start': (body) => store.start(body.preference),
  '/hardware-part': (body) => store.part(body),
  '/hardware-complete': (body) => store.complete(body),
  '/hardware-failure': (body) => store.failure(body),
  '/hardware-finish': (body) => store.finish(body),
  '/functional-start': (body) => functional.start(body.preference),
  '/functional-case': (body) => functional.case(body),
  '/functional-failure': (body) => functional.failure(body),
  '/functional-finish': (body) => functional.finish(body),
};
createServer(async (request, response) => {
  try {
    if (request.method === 'POST') {
      validateLoopbackPost(request.headers.origin, request.headers['content-type'], port);
      assert.ok(Object.hasOwn(routes, request.url));
      const body = await readBoundedJson(request);
      const ack = await routes[request.url](body);
      response
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(ack));
      return;
    }
    assert.equal(request.method, 'GET');
    if (request.url === '/hardware-build') {
      response
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(
          JSON.stringify({
            sourceHash: build.sourceHash,
            artifactHash: build.artifactHash,
            nativeHash: build.nativeHash,
            archivedAt: build.archivedAt,
            referenceProvenanceHash: build.referenceProvenanceHash,
          }),
        );
      return;
    }
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const file = resolve(
      artifactRoot,
      `.${decodeURIComponent(url.pathname === '/' ? '/hardware.html' : url.pathname)}`,
    );
    assert.ok(file.startsWith(artifactRoot + sep), 'Artifact traversal');
    await serveFrozenArtifact(response, file, mime[extname(file)] ?? 'application/octet-stream');
  } catch (error) {
    respondFailure(response, error, error instanceof PartCapacityError ? 413 : 400);
  }
}).listen(port, '127.0.0.1', () =>
  console.log(
    JSON.stringify({
      url: `http://127.0.0.1:${port}/hardware.html`,
      manifestPath,
      sourceHash: build.sourceHash,
      artifactHash: build.artifactHash,
      policy: 'One normal backend per server; no automatic resume/retry',
    }),
  ),
);
