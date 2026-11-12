import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

/**
 * PBI 160 — raportul determinist al buildului de producție și al livrării statice.
 *
 * Ce face, fără să inventeze valori:
 *   1. construiește de două ori artefactul de producție (în `dist/` și într-o copie temporară) și
 *      compară amprenta SHA-256 a arborilor, deci dovada de reproductibilitate este reală;
 *   2. enumeră artefactele reale (JS, WASM, CSS, HTML) cu mărimi, gzip și hash, și verifică ce este
 *      exclus în producție: fără source maps, fără `debugger`, fără console de debug, fără inspector;
 *   3. compară WASM-ul emis cu fișierele reale din pachet și cu manifestul de asseturi 150, ca să
 *      demonstreze că nu se pierde la copiere și că manifestul rămâne coerent;
 *   4. servește `dist/` printr-un server static minimal (fără server de dezvoltare), cere index.html,
 *      toate referințele lui și modulele WASM, și verifică statusul, mărimea și tipul MIME;
 *   5. citește bugetul de transfer din `Docs/performance-budgets.json` și raportează depășirea.
 *
 * Rulare implicită: scrie `report.json` + `report.md` în `Docs/Evidence/160-build-delivery/`.
 * `--check`: rederivă raportul și îl compară byte cu byte cu fișierele comise (CI eșuează dacă
 * buildul sau dovezile sunt învechite). Ieșirea este cod 1 dacă orice verificare pică.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDirectory = join(root, 'Docs', 'Evidence', '160-build-delivery');
const reportFile = join(evidenceDirectory, 'report.json');
const markdownFile = join(evidenceDirectory, 'report.md');
const deliveryDirectory = join(root, 'dist');
const reproducibilityDirectory = join(root, '.pbi-validation-160', 'repro');
const budgetFile = join(root, 'Docs', 'performance-budgets.json');
const configFile = join(root, 'vite.config.ts');
const assetManifestFile = join(
  root,
  'Docs',
  'Evidence',
  '150-asset-manifest',
  'asset-manifest.json',
);
const wasmPackages = Object.freeze([
  Object.freeze({
    id: 'runtime:wasm:glslang',
    packagePath: 'node_modules/@babylonjs/core/assets/glslang/glslang.wasm',
  }),
  Object.freeze({
    id: 'runtime:wasm:twgsl',
    packagePath: 'node_modules/@babylonjs/core/assets/twgsl/twgsl.wasm',
  }),
]);
const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
});

const wantsCheck = process.argv.includes('--check');

function relativeToRoot(file) {
  return relative(root, file).replaceAll('\\', '/');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function kindOf(path) {
  if (path.endsWith('.js')) return 'JS';
  if (path.endsWith('.wasm')) return 'WASM';
  if (path.endsWith('.css')) return 'CSS';
  if (path.endsWith('.html')) return 'HTML';
  return 'ASSET';
}

async function listFiles(directory) {
  const entries = await readdir(directory, { recursive: true });
  const files = [];
  for (const entry of entries.sort()) {
    const path = join(directory, entry);
    if (!(await stat(path)).isFile()) continue;
    files.push(relative(directory, path).replaceAll('\\', '/'));
  }
  return files;
}

async function buildProduction(outDir) {
  await build({
    root,
    configFile,
    build: { outDir, emptyOutDir: true },
    logLevel: 'warn',
  });
}

async function describeArtifacts(directory) {
  const artifacts = [];
  for (const path of await listFiles(directory)) {
    const bytes = await readFile(join(directory, path));
    const kind = kindOf(path);
    artifacts.push(
      Object.freeze({
        path,
        kind,
        bytes: bytes.length,
        gzipBytes:
          kind === 'JS' || kind === 'WASM' || kind === 'CSS' ? gzipSync(bytes).length : null,
        sha256: sha256(bytes),
      }),
    );
  }
  return Object.freeze(artifacts);
}

async function treeDigest(directory, artifacts) {
  const hash = createHash('sha256');
  for (const artifact of artifacts) {
    hash.update(artifact.path);
    hash.update(String(artifact.bytes));
    hash.update(artifact.sha256);
  }
  return hash.digest('hex');
}

function totalsOf(artifacts) {
  const sum = (kind, field = 'bytes') =>
    artifacts
      .filter((entry) => entry.kind === kind)
      .reduce((total, entry) => total + entry[field], 0);
  const payload = artifacts.filter(
    (entry) => entry.kind === 'JS' || entry.kind === 'WASM' || entry.kind === 'CSS',
  );
  return Object.freeze({
    artifacts: artifacts.length,
    javascriptBytes: sum('JS'),
    wasmBytes: sum('WASM'),
    cssBytes: sum('CSS'),
    htmlBytes: sum('HTML'),
    assetBytes: sum('ASSET'),
    bytes: artifacts.reduce((total, entry) => total + entry.bytes, 0),
    gzipBytes: payload.reduce((total, entry) => total + entry.gzipBytes, 0),
    criticalJsWasmBytes: sum('JS') + sum('WASM'),
  });
}

function check(name, pass, detail) {
  return Object.freeze({ name, pass, detail });
}

async function debugExclusions(directory, artifacts) {
  const sourceMaps = artifacts.filter((entry) => entry.path.endsWith('.map')).length;
  const inspectorChunks = artifacts.filter((entry) =>
    /(^|\/)(inspector|@babylonjs_inspector)[^/]*\.js$/i.test(entry.path),
  ).length;
  let debuggerStatements = 0;
  let consoleDebugCalls = 0;
  let unparsedEnvironment = 0;
  for (const artifact of artifacts) {
    if (artifact.kind !== 'JS') continue;
    const text = await readFile(join(directory, artifact.path), 'utf8');
    debuggerStatements += (text.match(/\bdebugger\s*;/g) ?? []).length;
    consoleDebugCalls += (text.match(/console\.(?:log|debug|info|trace)\s*\(/g) ?? []).length;
    unparsedEnvironment += (text.match(/import\.meta\.env/g) ?? []).length;
  }
  return Object.freeze({
    sourceMaps,
    debuggerStatements,
    consoleDebugCalls,
    inspectorChunks,
    unparsedEnvironment,
  });
}

async function wasmCoherence(artifacts) {
  const manifest = JSON.parse(await readFile(assetManifestFile, 'utf8'));
  const emitted = artifacts.filter((entry) => entry.kind === 'WASM');
  const rows = [];
  for (const expected of wasmPackages) {
    const packageBytes = await readFile(join(root, expected.packagePath));
    const entry = manifest.entries.find((candidate) => candidate.id === expected.id);
    const artifact = emitted.find((candidate) => candidate.sha256 === sha256(packageBytes));
    rows.push(
      Object.freeze({
        id: expected.id,
        packagePath: expected.packagePath,
        packageBytes: packageBytes.length,
        packageSha256: sha256(packageBytes),
        emittedPath: artifact?.path ?? null,
        emittedBytes: artifact?.bytes ?? 0,
        manifestWireBytes: entry?.wire?.rawBytes ?? null,
        manifestEncoding: entry?.wire?.encoding ?? null,
        coherent:
          artifact !== undefined &&
          artifact.bytes === packageBytes.length &&
          entry !== undefined &&
          entry.wire.encoding === 'IDENTITY' &&
          entry.wire.rawBytes === packageBytes.length,
      }),
    );
  }
  return Object.freeze({
    files: emitted.length,
    bytes: emitted.reduce((total, entry) => total + entry.bytes, 0),
    entries: Object.freeze(rows),
    coherent: rows.every((row) => row.coherent) && emitted.length === rows.length,
  });
}

function startStaticServer(directory) {
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'GET') {
        response.writeHead(405).end();
        return;
      }
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const file = join(directory, relativePath);
      if (!file.startsWith(directory + sep) || relativePath.includes('..')) {
        response.writeHead(403).end();
        return;
      }
      if (!(await stat(file)).isFile()) {
        response.writeHead(404).end();
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function verifyStaticDelivery(directory, artifacts) {
  const { server, port } = await startStaticServer(directory);
  const base = `http://127.0.0.1:${port}`;
  const samples = [];
  const failures = [];
  const fetchOne = async (path) => {
    const response = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`);
    const body = Buffer.from(await response.arrayBuffer());
    return {
      entry: Object.freeze({
        path,
        status: response.status,
        bytes: body.length,
        contentType: response.headers.get('content-type') ?? '',
      }),
      body,
    };
  };
  const expectedType = (kind) =>
    kind === 'JS'
      ? 'text/javascript'
      : kind === 'WASM'
        ? 'application/wasm'
        : kind === 'CSS'
          ? 'text/css'
          : kind === 'HTML'
            ? 'text/html'
            : null;
  try {
    const index = await fetchOne('/index.html');
    const html = index.body.toString('utf8');
    const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((value) => !value.startsWith('data:') && !value.startsWith('http'));
    const relativeOnly = references.every(
      (value) => !value.startsWith('/') && !value.startsWith('\\'),
    );
    samples.push(index.entry);
    const ordered = [...artifacts].sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
    for (const artifact of ordered) {
      const { entry, body } = await fetchOne(`/${artifact.path}`);
      const expected = expectedType(artifact.kind);
      const typeOk = expected === null || entry.contentType.startsWith(expected);
      const ok =
        entry.status === 200 &&
        body.length === artifact.bytes &&
        sha256(body) === artifact.sha256 &&
        typeOk;
      if (!ok) failures.push(artifact.path);
      const name = artifact.path.split('/').at(-1) ?? '';
      if (artifact.kind !== 'JS' || /^(glslang|twgsl)-.*\.js$/.test(name)) samples.push(entry);
    }
    await fetchOne('/');
    return Object.freeze({
      server: 'node:http static (fără server de dezvoltare)',
      base: 'relative',
      relativeReferences: relativeOnly,
      indexStatus: index.entry.status,
      requests: ordered.length + 2,
      samples: Object.freeze([...new Map(samples.map((entry) => [entry.path, entry])).values()]),
      checkedPayloads: ordered.length,
      failedPayloads: Object.freeze(failures),
      pass: relativeOnly && index.entry.status === 200 && failures.length === 0,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function readBudgets() {
  const raw = JSON.parse(await readFile(budgetFile, 'utf8'));
  const contract = await import(
    pathToFileURL(join(root, 'tests/harness/performance-gate.ts')).href
  );
  const budgets = contract.parseGateBudgets(raw);
  return Object.freeze({
    manifest: relativeToRoot(budgetFile),
    version: budgets.budgetVersion,
    criticalJsWasmTransferBytes: budgets.criticalJsWasmTransferBytes,
  });
}

async function collect(directory) {
  const artifacts = await describeArtifacts(directory);
  const digest = await treeDigest(directory, artifacts);
  return { artifacts, digest };
}

async function main() {
  await rm(reproducibilityDirectory, { recursive: true, force: true });
  await runBuild(deliveryDirectory);
  await runBuild(reproducibilityDirectory);
  const delivered = await collect(deliveryDirectory);
  const reproduced = await collect(reproducibilityDirectory);
  await rm(join(root, '.pbi-validation-160'), { recursive: true, force: true });

  const totals = totalsOf(delivered.artifacts);
  const exclusions = await debugExclusions(deliveryDirectory, delivered.artifacts);
  const wasm = await wasmCoherence(delivered.artifacts);
  const delivery = await verifyStaticDelivery(deliveryDirectory, delivered.artifacts);
  const budgets = await readBudgets();

  const checks = [
    check(
      'reproducible-build',
      delivered.digest === reproduced.digest &&
        delivered.artifacts.length === reproduced.artifacts.length,
      `două builduri independente: ${delivered.artifacts.length} artefacte, digest ${delivered.digest.slice(0, 16)} vs ${reproduced.digest.slice(0, 16)}`,
    ),
    check(
      'wasm-and-assets-included',
      totals.wasmBytes > 0 && wasm.files === 2 && wasm.coherent,
      `${wasm.files} module WASM, ${totals.wasmBytes} B; ${totals.javascriptBytes} B JS, ${totals.cssBytes} B CSS, ${totals.htmlBytes} B HTML`,
    ),
    check(
      'debug-excluded',
      exclusions.sourceMaps === 0 &&
        exclusions.debuggerStatements === 0 &&
        exclusions.consoleDebugCalls === 0 &&
        exclusions.inspectorChunks === 0 &&
        exclusions.unparsedEnvironment === 0,
      `source maps ${exclusions.sourceMaps}, debugger ${exclusions.debuggerStatements}, console debug ${exclusions.consoleDebugCalls}, inspector ${exclusions.inspectorChunks}, import.meta.env ${exclusions.unparsedEnvironment}`,
    ),
    check(
      'static-delivery',
      delivery.pass,
      `${delivery.requests} cereri HTTP, ${delivery.checkedPayloads} artefacte verificate (status, mărime, SHA-256, MIME), referințe relative ${delivery.relativeReferences}`,
    ),
    check(
      'bundle-budget',
      totals.criticalJsWasmBytes <= budgets.criticalJsWasmTransferBytes,
      `${totals.criticalJsWasmBytes} B JS+WASM din ${budgets.criticalJsWasmTransferBytes} B (${budgets.manifest}, ${budgets.version})`,
    ),
    check(
      'artifact-taxonomy',
      totals.javascriptBytes > 0 &&
        totals.wasmBytes > 0 &&
        totals.cssBytes > 0 &&
        totals.htmlBytes > 0 &&
        totals.artifacts >= 100,
      `${totals.artifacts} artefacte: JS ${totals.javascriptBytes} B, WASM ${totals.wasmBytes} B, CSS ${totals.cssBytes} B, HTML ${totals.htmlBytes} B, altele ${totals.assetBytes} B`,
    ),
  ];
  const passed = checks.filter((entry) => entry.pass).length;
  const report = Object.freeze({
    version: '160-build-delivery-report-v1',
    base: './',
    sourceMaps: false,
    artifacts: delivered.artifacts,
    totals,
    build: Object.freeze({
      digest: delivered.digest,
      reproducedDigest: reproduced.digest,
      reproducible: delivered.digest === reproduced.digest,
    }),
    exclusions,
    wasm,
    delivery,
    budget: Object.freeze({
      ...budgets,
      status:
        totals.criticalJsWasmBytes <= budgets.criticalJsWasmTransferBytes ? 'WITHIN' : 'EXCEEDED',
      usedBytes: totals.criticalJsWasmBytes,
      ratio: totals.criticalJsWasmBytes / budgets.criticalJsWasmTransferBytes,
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      checks: checks.length,
      passed,
      pass: passed === checks.length,
      artifacts: totals.artifacts,
      bytes: totals.bytes,
    }),
  });
  const markdown = renderMarkdown(report);
  const json = `${JSON.stringify(report, null, 2)}\n`;

  for (const entry of checks)
    console.log(`${entry.pass ? 'PASS' : 'FAIL'} ${entry.name}: ${entry.detail}`);
  console.log(
    `BLD ${report.summary.pass ? 'PASS' : 'FAIL'} · ${totals.artifacts} artefacte · JS ${totals.javascriptBytes} B + WASM ${totals.wasmBytes} B + CSS ${totals.cssBytes} B = ${totals.bytes} B (${totals.gzipBytes} B gzip) · buget ${report.budget.status} · livrare statică ${delivery.pass ? 'servibilă' : 'eșuată'}`,
  );

  if (wantsCheck) {
    const savedJson = await readFile(reportFile, 'utf8').catch(() => null);
    const savedMarkdown = await readFile(markdownFile, 'utf8').catch(() => null);
    if (savedJson !== json) {
      console.error(`Raportul de build este învechit: ${relativeToRoot(reportFile)}`);
      process.exitCode = 1;
    } else console.log(`Raport de build curent: ${relativeToRoot(reportFile)}`);
    if (savedMarkdown !== markdown) {
      console.error(`Markdown-ul de build este învechit: ${relativeToRoot(markdownFile)}`);
      process.exitCode = 1;
    } else console.log(`Markdown de build curent: ${relativeToRoot(markdownFile)}`);
  } else {
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(reportFile, json);
    await writeFile(markdownFile, markdown);
    console.log(`Wrote ${relativeToRoot(reportFile)}`);
    console.log(`Wrote ${relativeToRoot(markdownFile)}`);
  }
  if (!report.summary.pass) process.exitCode = 1;
}

function megabytes(bytes) {
  return (bytes / 1048576).toFixed(2);
}

function renderMarkdown(report) {
  const artifactRows = report.artifacts
    .filter((entry) => entry.kind !== 'JS')
    .map(
      (entry) =>
        `| \`${entry.path}\` | ${entry.kind} | ${entry.bytes} | ${entry.gzipBytes ?? '—'} | \`${entry.sha256.slice(0, 16)}…\` |`,
    );
  const jsSummary = report.artifacts.filter((entry) => entry.kind === 'JS');
  const largest = [...jsSummary].sort((left, right) => right.bytes - left.bytes).slice(0, 5);
  const lines = [
    '# PBI 160 — build de producție și livrare statică',
    '',
    `Contract: \`${report.version}\`. Buildul este produs de \`vite.config.ts\` cu \`base: ${report.base}\` și \`sourcemap: ${report.sourceMaps}\`.`,
    '',
    '## Sumar',
    '',
    '| Categorie | Valoare |',
    '| --- | ---: |',
    `| Artefacte | ${report.totals.artifacts} |`,
    `| JS | ${report.totals.javascriptBytes} B |`,
    `| WASM | ${report.totals.wasmBytes} B |`,
    `| CSS | ${report.totals.cssBytes} B |`,
    `| HTML | ${report.totals.htmlBytes} B |`,
    `| Total pe disc | ${report.totals.bytes} B (${megabytes(report.totals.bytes)} MiB) |`,
    `| Total gzip (JS+WASM+CSS) | ${report.totals.gzipBytes} B |`,
    `| Buget JS+WASM | ${report.budget.usedBytes} B din ${report.budget.criticalJsWasmTransferBytes} B (${report.budget.status}, ${(report.budget.ratio * 100).toFixed(2)}%) |`,
    '',
    `Amprenta SHA-256 a arborelui de build: \`${report.build.digest}\`. Al doilea build independent are digest ${
      report.build.reproducible ? 'identic' : `diferit (\`${report.build.reproducedDigest}\`)`
    }.`,
    '',
    '## Ce este exclus în producție',
    '',
    '| Excludere | Valoare măsurată |',
    '| --- | ---: |',
    `| Source maps | ${report.exclusions.sourceMaps} |`,
    `| Instrucțiuni \`debugger\` | ${report.exclusions.debuggerStatements} |`,
    `| Apeluri console de debug (\`log/debug/info/trace\`) | ${report.exclusions.consoleDebugCalls} |`,
    `| Chunk-uri inspector | ${report.exclusions.inspectorChunks} |`,
    `| \`import.meta.env\` neînlocuit | ${report.exclusions.unparsedEnvironment} |`,
    '',
    '## WASM și asseturi',
    '',
    '| Id manifest | Fișier pachet | Bytes pachet | Emis | Bytes emis | Wire manifest | Coerent |',
    '| --- | --- | ---: | --- | ---: | ---: | --- |',
    ...report.wasm.entries.map(
      (entry) =>
        `| \`${entry.id}\` | \`${entry.packagePath}\` | ${entry.packageBytes} | \`${entry.emittedPath ?? '—'}\` | ${entry.emittedBytes} | ${entry.manifestWireBytes ?? '—'} (\`${entry.manifestEncoding ?? '—'}\`) | ${entry.coherent ? 'DA' : 'NU'} |`,
    ),
    '',
    `Module WASM emise: ${report.wasm.files}, total ${report.wasm.bytes} B, toate coerente cu pachetul și cu manifestul 150: ${report.wasm.coherent ? 'DA' : 'NU'}.`,
    '',
    '## Livrare statică',
    '',
    `Server: ${report.delivery.server}. Referințe relative în \`index.html\`: ${report.delivery.relativeReferences ? 'DA' : 'NU'}. Cereri: ${report.delivery.requests}; artefacte verificate (status, mărime, SHA-256, MIME): ${report.delivery.checkedPayloads}; eșecuri: ${report.delivery.failedPayloads.length}.`,
    '',
    '| Cerere | Status | Bytes | Content-Type |',
    '| --- | ---: | ---: | --- |',
    ...report.delivery.samples.map(
      (entry) => `| \`${entry.path}\` | ${entry.status} | ${entry.bytes} | ${entry.contentType} |`,
    ),
    '',
    '## Cele mai mari chunk-uri JS',
    '',
    '| Fișier | Bytes | Gzip |',
    '| --- | ---: | ---: |',
    ...largest.map((entry) => `| \`${entry.path}\` | ${entry.bytes} | ${entry.gzipBytes} |`),
    '',
    '## Artefacte ne-JS',
    '',
    '| Fișier | Tip | Bytes | Gzip | SHA-256 |',
    '| --- | --- | ---: | ---: | --- |',
    ...artifactRows,
    '',
    '## Verificări',
    '',
    '| Verificare | Rezultat | Detaliu |',
    '| --- | --- | --- |',
    ...report.checks.map(
      (entry) => `| \`${entry.name}\` | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
    ),
    '',
    `Rezultat: ${report.summary.passed}/${report.summary.checks} verificări, overall ${report.summary.pass ? 'PASS' : 'FAIL'}.`,
    '',
  ];
  return `${lines.join('\n')}\n`;
}

async function runBuild(outDir) {
  await rm(outDir, { recursive: true, force: true });
  await buildProduction(outDir);
}

await main();
