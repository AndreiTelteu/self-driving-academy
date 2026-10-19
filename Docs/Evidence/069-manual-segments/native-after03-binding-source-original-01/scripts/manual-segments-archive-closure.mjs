// SOURCE-only archived local import proof; never import/execute archived modules or initialize native worlds.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { isBuiltin } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  validateCheckedProduct,
  serializeDiagnostic,
  readDiagnosticField,
} from './manual-segments-calibration-proof.mjs';
export const PINNED_LOCK_SHA = 'a50a27bb30ddb5ca3313cda07e8ad767c10b44203073791b5ecbf4583bb97c0e';
function safePath(path) {
  assert(
    typeof path === 'string' &&
      path.length <= 512 &&
      !path.includes('\\') &&
      !path.startsWith('/') &&
      !/^[A-Za-z]:/.test(path) &&
      path !== '..' &&
      !path.startsWith('../'),
  );
  assert.equal(posix.normalize(path), path);
  return path;
}
export function captureImportRoots(paths, checked) {
  assert(
    paths.includes('scripts/manual-segments-calibration-proof.d.mts'),
    'Missing compile-only declaration provenance',
  );
  return [
    ...new Set([
      ...paths.filter((path) => !path.startsWith('src/') && /\.(ts|mts|tsx|mjs|js)$/.test(path)),
      ...checked.source
        .map((row) => row.path)
        .filter((path) => /\.(ts|mts|tsx|mjs|js)$/.test(path)),
    ]),
  ].sort();
}
export async function verifyModuleClosure({ paths, readSource, roots, lockBytes }) {
  const { parse } = await import('@babel/parser');
  assert(paths.length > 0 && paths.length <= 512);
  assert.equal(new Set(paths).size, paths.length);
  paths.forEach(safePath);
  assert.equal(
    createHash('sha256').update(lockBytes).digest('hex'),
    PINNED_LOCK_SHA,
    'Original locked external dependency proof',
  );
  const lock = JSON.parse(lockBytes);
  const parserPackage = JSON.parse(
    await readFile(fileURLToPath(import.meta.resolve('@babel/parser/package.json'))),
  );
  assert.equal(lock.packages['node_modules/@babel/parser'].version, '8.0.6');
  assert.equal(
    lock.packages['node_modules/@babel/parser'].integrity,
    'sha512-LpGDIYJAzc3Y3PT9x+FxBrGYu2PlWxLmyN7SwPTzaX0LSwEmFJBsRnPBqmaXF2r1v+Zhz6lNiEJ+7yKtM5+Ugg==',
  );
  assert.equal(
    parserPackage.version,
    lock.packages['node_modules/@babel/parser'].version,
    'Installed AST parser matches pinned lock',
  );
  const available = new Set(paths),
    visited = new Set(),
    pending = [...roots],
    edges = [],
    external = new Set();
  let bytesRead = 0;
  const local = (from, spec) => {
    assert(spec.startsWith('.'));
    const base = posix.normalize(posix.join(posix.dirname(from), spec));
    safePath(base);
    const choices = [
      base,
      ...['.ts', '.tsx', '.mjs', '.js', '.json'].map((ext) => base + ext),
      ...['index.ts', 'index.tsx', 'index.mjs', 'index.js'].map((file) => base + '/' + file),
    ];
    const found = choices.find((path) => available.has(path));
    assert(found, 'Unresolved archived local import ' + from + ' -> ' + spec);
    assert(edges.length < 8192 && pending.length < 8192, 'Bounded import edges/pending paths');
    edges.push({ from, spec, path: found });
    pending.push(found);
  };
  const moduleSpec = (from, spec) => {
    assert(typeof spec === 'string' && spec.length <= 512);
    if (spec.startsWith('.')) return local(from, spec);
    assert(
      !spec.startsWith('/') &&
        !spec.startsWith('file:') &&
        !spec.includes('://') &&
        !spec.startsWith('#'),
      'Unsupported module specifier',
    );
    if (isBuiltin(spec)) {
      external.add('NODE:' + spec);
      return;
    }
    const pieces = spec.split('/'),
      name = spec.startsWith('@') ? pieces.slice(0, 2).join('/') : pieces[0],
      entry = lock.packages['node_modules/' + name];
    assert(
      entry && typeof entry.version === 'string' && typeof entry.integrity === 'string',
      'External package lacks pinned lock provenance ' + spec,
    );
    external.add(name + '@' + entry.version + ':' + entry.integrity);
  };
  while (pending.length) {
    const path = safePath(pending.shift());
    if (visited.has(path)) continue;
    assert(available.has(path), 'Missing archived entry ' + path);
    assert(visited.size < 512);
    visited.add(path);
    const data = await readSource(path);
    assert(data.length <= 512 * 1024, 'Bounded individual source');
    bytesRead += data.length;
    assert(bytesRead <= 32 * 1024 * 1024, 'Bounded total source reads');
    if (path.endsWith('.json')) {
      JSON.parse(data);
      continue;
    }
    assert(/\.(ts|mts|tsx|mjs|js)$/.test(path), 'Unsupported imported file type');
    const plugins = [['typescript', { dts: path.endsWith('.d.mts') || path.endsWith('.d.ts') }]];
    if (path.endsWith('.tsx')) plugins.push('jsx');
    const file = parse(Buffer.from(data).toString('utf8'), {
      sourceType: 'unambiguous',
      plugins,
      createImportExpressions: true,
      errorRecovery: false,
      attachComment: false,
    });
    const literal = (node) => {
      assert(
        node?.type === 'StringLiteral' && typeof node.value === 'string',
        'Nonliteral module import unsupported ' + path,
      );
      return node.value;
    };
    const stack = [file];
    let nodes = 0;
    while (stack.length) {
      assert(stack.length <= 100000, 'Bounded AST pending nodes');
      const node = stack.pop();
      assert(++nodes <= 100000, 'Bounded AST nodes');
      if (
        ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(
          node.type,
        ) &&
        node.source
      )
        moduleSpec(path, literal(node.source));
      else if (node.type === 'TSImportType') moduleSpec(path, literal(node.source));
      else if (node.type === 'TSExternalModuleReference')
        moduleSpec(path, literal(node.expression));
      else if (node.type === 'ImportExpression') {
        assert(
          node.source?.type !== 'BinaryExpression',
          'Unsupported dynamic import expression ' + path,
        );
        moduleSpec(path, literal(node.source));
      } else if (node.type === 'CallExpression') {
        const callee = node.callee,
          isRequire = callee?.type === 'Identifier' && callee.name === 'require',
          isImport = callee?.type === 'Import';
        const isMetaResolve =
          callee?.type === 'MemberExpression' &&
          callee.object?.type === 'MetaProperty' &&
          callee.object.meta?.name === 'import' &&
          callee.object.property?.name === 'meta';
        if (isRequire || isImport || isMetaResolve) {
          if (isMetaResolve)
            assert(
              !callee.computed &&
                callee.property?.type === 'Identifier' &&
                callee.property.name === 'resolve',
              'Unsupported import.meta call ' + path,
            );
          assert(node.arguments.length >= 1);
          moduleSpec(path, literal(node.arguments[0]));
        }
      }
      for (const [key, value] of Object.entries(node)) {
        if (
          [
            'loc',
            'start',
            'end',
            'comments',
            'leadingComments',
            'trailingComments',
            'innerComments',
            'tokens',
            'errors',
            'extra',
          ].includes(key)
        )
          continue;
        if (Array.isArray(value)) {
          for (let i = value.length - 1; i >= 0; i--)
            if (value[i] && typeof value[i] === 'object' && typeof value[i].type === 'string')
              stack.push(value[i]);
        } else if (value && typeof value === 'object' && typeof value.type === 'string')
          stack.push(value);
      }
    }
  }
  return {
    scope: 'ARCHIVED_PINNED_BABEL_AST_STATIC_EXPORT_TYPE_AND_LITERAL_DYNAMIC_IMPORT_CLOSURE',
    paths: [...visited].sort(),
    edges,
    bytesRead,
    external: [...external].sort(),
    syntaxScope:
      'Pinned Babel8.0.6 publicparse with TypeScript plugin and strict parse errors; bounded AST import-edge traversal, no archived code execution.',
    parserBinding: {
      package: '@babel/parser',
      version: parserPackage.version,
      integrity: lock.packages['node_modules/@babel/parser'].integrity,
    },
    externalScope:
      'External package sources excluded; original lock version/integrity pinned. Rapier native artifact separately byte-pinned. Node builtins not archived.',
  };
}

const processDiagnosticReceipts = new WeakSet();
function freezeProcessDiagnostics(value) {
  const frozen = Object.freeze(value);
  processDiagnosticReceipts.add(frozen);
  return frozen;
}
function clipProcessText(value) {
  if (typeof value !== 'string')
    return { text: '', available: false, bytes: null, truncated: false };
  const data = Buffer.from(value, 'utf8');
  let text = data.length <= 65536 ? value : data.subarray(0, 65536).toString('utf8');
  while (Buffer.byteLength(text, 'utf8') > 65536) text = text.slice(0, -1);
  return { text, available: true, bytes: data.length, truncated: data.length > 65536 };
}
function subprocessFailure(original, diagnostics) {
  const error = new AggregateError([original], 'Archive preflight subprocess proof failure');
  Object.defineProperty(error, 'processDiagnostics', {
    value: freezeProcessDiagnostics(diagnostics),
    enumerable: true,
  });
  return error;
}
export function preflightFailureArtifact(error) {
  const diagnostics = readDiagnosticField(error, 'processDiagnostics');
  return {
    error: serializeDiagnostic(error),
    processDiagnostics: processDiagnosticReceipts.has(diagnostics) ? diagnostics : null,
  };
}
export function verifyArchiveProofChild(folder, run = spawnSync) {
  let result;
  try {
    result = run(process.execPath, [fileURLToPath(import.meta.url), '--archive', resolve(folder)], {
      cwd: process.cwd(),
      timeout: 30000,
      maxBuffer: 256 * 1024,
      encoding: 'utf8',
      windowsHide: true,
    });
  } catch (original) {
    throw subprocessFailure(original, {
      phase: 'SPAWN_THROW',
      returned: false,
      status: null,
      statusObserved: false,
      signal: null,
      signalObserved: false,
      signalTruncated: false,
      stdout: '',
      stdoutAvailable: false,
      stdoutBytes: null,
      stdoutTruncated: false,
      stderr: '',
      stderrAvailable: false,
      stderrBytes: null,
      stderrTruncated: false,
      timeoutMs: 30000,
      maxBufferBytes: 256 * 1024,
    });
  }
  const status = readDiagnosticField(result, 'status'),
    signal = readDiagnosticField(result, 'signal'),
    out = clipProcessText(readDiagnosticField(result, 'stdout')),
    err = clipProcessText(readDiagnosticField(result, 'stderr')),
    nativeError = readDiagnosticField(result, 'error');
  const diagnostics = {
    phase: 'SPAWN_RESULT_FAILURE',
    returned: true,
    status: status === null || Number.isSafeInteger(status) ? status : null,
    statusObserved: status === null || Number.isSafeInteger(status),
    signal: typeof signal === 'string' ? signal.slice(0, 128) : null,
    signalObserved: signal === null || typeof signal === 'string',
    signalTruncated: typeof signal === 'string' && signal.length > 128,
    stdout: out.text,
    stdoutAvailable: out.available,
    stdoutBytes: out.bytes,
    stdoutTruncated: out.truncated,
    stderr: err.text,
    stderrAvailable: err.available,
    stderrBytes: err.bytes,
    stderrTruncated: err.truncated,
    timeoutMs: 30000,
    maxBufferBytes: 256 * 1024,
  };
  if ((nativeError !== undefined && nativeError !== null) || status !== 0 || !out.available)
    throw subprocessFailure(
      nativeError !== undefined && nativeError !== null
        ? nativeError
        : new Error('Archive source proof subprocess failed'),
      diagnostics,
    );
  try {
    const proof = JSON.parse(readDiagnosticField(result, 'stdout'));
    assert.equal(readDiagnosticField(proof, 'status'), 'PASS_ARCHIVED_IMPORT_CLOSURE');
    return {
      ...proof,
      processDiagnostics: freezeProcessDiagnostics({ ...diagnostics, phase: 'PASS' }),
    };
  } catch (original) {
    throw subprocessFailure(original, { ...diagnostics, phase: 'PARSE_OR_STATUS_FAILURE' });
  }
}
export async function verifyArchiveProof(folder) {
  const root = resolve(folder),
    canonical = await realpath(root);
  async function bytes(path) {
    safePath(path);
    const target = resolve(root, path),
      actual = await realpath(target),
      suffix = relative(canonical, actual);
    assert(
      suffix && suffix !== '..' && !suffix.startsWith('..' + sep) && !suffix.startsWith(sep),
      'Archive realpath escape',
    );
    return readFile(actual);
  }
  const manifest = JSON.parse(await bytes('manifest.json')),
    checked = JSON.parse(
      await bytes(
        'source/Docs/Evidence/069-manual-segments/implementation-scoped-checks-03/results-final.json',
      ),
    );
  validateCheckedProduct(checked);
  assert(manifest.inputs.length > 0 && manifest.inputs.length <= 512);
  const paths = manifest.inputs.map((row) => safePath(row.path));
  assert.deepEqual(paths, [...paths].sort());
  assert.equal(new Set(paths).size, paths.length);
  const source = createHash('sha256');
  let total = 0;
  for (const row of manifest.inputs) {
    assert.equal(row.archiveRelativePath, 'source/' + row.path);
    const data = await bytes(row.archiveRelativePath);
    assert(data.length <= 512 * 1024);
    total += data.length;
    assert(total <= 32 * 1024 * 1024);
    assert.equal(data.length, row.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'), row.sha256);
    source.update(row.path).update(data);
  }
  assert.equal(source.digest('hex'), manifest.sourceHash);
  for (const row of checked.source) {
    assert(paths.includes(row.path));
    const data = await bytes('source/' + row.path);
    assert.equal(data.length, row.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'), row.sha256);
  }
  assert.equal(manifest.native.archiveRelativePath, 'native/rapier.mjs');
  assert.equal(manifest.native.bytes, 4340292);
  assert.equal(
    manifest.native.sha256,
    '02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0',
  );
  const native = await bytes(manifest.native.archiveRelativePath);
  assert.equal(native.length, manifest.native.bytes);
  assert.equal(createHash('sha256').update(native).digest('hex'), manifest.native.sha256);
  const proof = await verifyModuleClosure({
    paths,
    roots: captureImportRoots(paths, checked),
    readSource: (path) => bytes('source/' + path),
    lockBytes: await bytes('source/package-lock.json'),
  });
  return {
    status: 'PASS_ARCHIVED_IMPORT_CLOSURE',
    sourceHash: manifest.sourceHash,
    nativeSha256: manifest.native.sha256,
    pathCount: proof.paths.length,
    edgeCount: proof.edges.length,
    sourceBytes: proof.bytesRead,
    external: proof.external,
    externalScope: proof.externalScope,
    parserRealm: 'TERMINAL_PREFLIGHT_CHILD_ONLY_FOR_MEASURED_GENERATORS',
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv[2], '--archive');
    const proof = await verifyArchiveProof(process.argv[3]);
    process.stdout.write(JSON.stringify(proof) + '\n');
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        status: 'FAIL_ARCHIVED_IMPORT_CLOSURE',
        error: serializeDiagnostic(error),
      }) + '\n',
    );
    process.exitCode = 1;
  }
}
