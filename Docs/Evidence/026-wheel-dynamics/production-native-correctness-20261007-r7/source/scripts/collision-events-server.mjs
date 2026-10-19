//028 headed fixture: execute only within the coordinator hardware grant.
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const port = Number(process.argv[2] ?? 5198);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const root = resolve('.pbi-validation-028/build');
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
await consume('tests/browser/collision-events/main.ts');
const inputs = [
  ...[...consumed].map((path) => relative(resolve('.'), path).replaceAll('\\', '/')),
  'tests/browser/collision-events/index.html',
  'scripts/collision-events-server.mjs',
  'package.json',
  'package-lock.json',
].sort();
const hashes = {};
const combined = createHash('sha256');
for (const input of inputs) {
  const bytes = await readFile(input);
  hashes[input] = createHash('sha256').update(bytes).digest('hex');
  combined.update(input).update(bytes);
}
const identity = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: combined.digest('hex'),
  inputs,
};
const evidence = resolve('Docs/Evidence/028-collision-events');
await mkdir(evidence, { recursive: true });
await build({
  configFile: false,
  root: resolve('tests/browser/collision-events'),
  base: './',
  cacheDir: resolve('.pbi-validation-028/cache'),
  define: { __COLLISION_BUILD__: JSON.stringify(identity) },
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
const manifest = { ...identity, hashes, artifacts };
await writeFile(
  resolve(evidence, 'browser-build-manifest.json'),
  JSON.stringify(manifest, null, 2),
);
for (const input of inputs) {
  const archived = resolve(evidence, 'source-browser', input);
  await mkdir(dirname(archived), { recursive: true });
  await writeFile(archived, await readFile(input));
}
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.css': 'text/css',
};
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
        report.fixtureVersion !== '028-native-lifecycle-v1' ||
        !report.passed ||
        report.identity?.sourceHash !== identity.sourceHash ||
        report.identity?.commit !== identity.commit ||
        report.lifecycleCycles !== 20 ||
        !['WEBGPU', 'WEBGL2'].includes(report.renderer) ||
        report.contactTicks <= 60 ||
        report.maxStreak <= 60 ||
        report.events?.length < 2
      ) {
        response.writeHead(400).end('Invalid report');
        return;
      }
      for (const input of inputs) {
        if (
          createHash('sha256')
            .update(await readFile(input))
            .digest('hex') !== hashes[input]
        )
          throw new Error('Source drift');
      }
      const destination = resolve(evidence, `browser-${report.renderer.toLowerCase()}.json`);
      if (existsSync(destination)) {
        response.writeHead(409).end('Preserve existing capture');
        return;
      }
      await writeFile(destination, JSON.stringify(report, null, 2));
      response.writeHead(200).end('Saved');
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405).end();
      return;
    }
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
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
    response.writeHead(500).end('Fixture error');
  }
}).listen(port, '127.0.0.1', () => console.log(`028 fixture: http://127.0.0.1:${port}`));
