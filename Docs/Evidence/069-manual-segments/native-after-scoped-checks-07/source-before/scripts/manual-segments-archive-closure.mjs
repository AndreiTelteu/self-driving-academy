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
  const { default: version } = await import('typescript');
  const ts = await import('typescript/unstable/ast');
  assert(paths.length > 0 && paths.length <= 512);
  assert.equal(new Set(paths).size, paths.length);
  paths.forEach(safePath);
  assert.equal(
    createHash('sha256').update(lockBytes).digest('hex'),
    PINNED_LOCK_SHA,
    'Original locked external dependency proof',
  );
  const lock = JSON.parse(lockBytes);
  assert.equal(
    lock.packages['node_modules/typescript'].version,
    version.version,
    'Installed source parser matches locked version',
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
    const scanner = ts.createScanner(
        true,
        ts.LanguageVariant.Standard,
        Buffer.from(data).toString('utf8'),
      ),
      tokens = [],
      templates = [];
    let braces = 0;
    for (let n = 0; ; n++) {
      assert(n < 100000, 'Bounded source tokens');
      let kind = scanner.scan();
      if (kind === ts.SyntaxKind.EndOfFile) break;
      if (kind === ts.SyntaxKind.SlashToken || kind === ts.SyntaxKind.SlashEqualsToken) {
        const previous=tokens.at(-1);
        const prefix=new Set(['(', '[', '{', '=', ':', ',', ';', '?', '=>', 'return', 'throw', 'case', 'delete', 'void', 'typeof', 'yield', 'await', 'else', 'do', '!', '~', '+', '-', '*', '%', '&', '|', '^', '&&', '||', '??', '==', '===', '!=', '!==', '<', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '&&=', '||=', '??=']);
        let controlClose=false;
        if(previous?.text===')'){let balance=0;for(let i=tokens.length-1;i>=0;i--){if(tokens[i].text===')')balance++;else if(tokens[i].text==='('&&--balance===0){controlClose=['if','while','for','with','switch','catch'].includes(tokens[i-1]?.text);break;}}}
        const startsExpression=!previous||prefix.has(previous.text)||previous.kind===ts.SyntaxKind.TemplateHead||previous.kind===ts.SyntaxKind.TemplateMiddle||controlClose;
        const endsExpression=previous&&([ts.SyntaxKind.Identifier,ts.SyntaxKind.NumericLiteral,ts.SyntaxKind.BigIntLiteral,ts.SyntaxKind.StringLiteral,ts.SyntaxKind.RegularExpressionLiteral,ts.SyntaxKind.NoSubstitutionTemplateLiteral,ts.SyntaxKind.TemplateTail].includes(previous.kind)||[')',']','++','--','true','false','null','this','super'].includes(previous.text));
        if(startsExpression){kind=scanner.reScanSlashToken();assert.equal(kind,ts.SyntaxKind.RegularExpressionLiteral,'Unsupported regular expression token '+path);}
        else assert(endsExpression,'Ambiguous slash lexical context '+path);
      }
      if (
        kind === ts.SyntaxKind.CloseBraceToken &&
        templates.length &&
        braces === templates.at(-1)
      ) {
        kind = scanner.reScanTemplateToken(false);
        if (kind === ts.SyntaxKind.TemplateTail) templates.pop();
      } else if (kind === ts.SyntaxKind.OpenBraceToken) braces++;
      else if (kind === ts.SyntaxKind.CloseBraceToken) braces--;
      if (kind === ts.SyntaxKind.TemplateHead) templates.push(braces);
      assert(!scanner.isUnterminated(), 'Unterminated lexical token ' + path);
      tokens.push({ kind, text: scanner.getTokenText(), value: scanner.getTokenValue() });
    }
    assert.equal(templates.length, 0, 'Unclosed template expression ' + path);
    const literal = (t) => {
      assert(
        t && t.kind === ts.SyntaxKind.StringLiteral,
        'Nonliteral module import unsupported ' + path,
      );
      return t.value;
    };
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i],
        next = tokens[i + 1];
      if (t.kind === ts.SyntaxKind.ImportKeyword) {
        if (next?.text === '(') {
          moduleSpec(path, literal(tokens[i + 2]));
          assert(
            [')', ','].includes(tokens[i + 3]?.text),
            'Unsupported dynamic import expression ' + path,
          );
        } else if (next?.text === '.') {
          assert(tokens[i + 2]?.text === 'meta', 'Unsupported import property ' + path);
          if (tokens[i + 3]?.text === '.' && tokens[i + 4]?.text === 'resolve') {
            assert(tokens[i + 5]?.text === '(');
            moduleSpec(path, literal(tokens[i + 6]));
            assert(tokens[i + 7]?.text === ')');
          }
        } else if (next?.kind === ts.SyntaxKind.StringLiteral) moduleSpec(path, literal(next));
        else {
          let found = false;
          for (let j = i + 1; j < Math.min(tokens.length, i + 256); j++) {
            if (tokens[j].text === ';') break;
            if (tokens[j].text === 'from') {
              moduleSpec(path, literal(tokens[j + 1]));
              found = true;
              break;
            }
            if (tokens[j].text === 'require' && tokens[j + 1]?.text === '(') {
              moduleSpec(path, literal(tokens[j + 2]));
              found = true;
              break;
            }
          }
          assert(found, 'Unsupported static import form ' + path);
        }
      } else if (
        t.kind === ts.SyntaxKind.ExportKeyword &&
        ['*', '{', 'type'].includes(next?.text)
      ) {
        for (let j = i + 1; j < Math.min(tokens.length, i + 256); j++) {
          if (tokens[j].text === ';') break;
          if (tokens[j].text === 'from') {
            moduleSpec(path, literal(tokens[j + 1]));
            break;
          }
          if (j > i + 1 && tokens[j].kind === ts.SyntaxKind.ExportKeyword) break;
        }
      } else if (t.text === 'require' && tokens[i - 1]?.text !== '.' && next?.text === '(') {
        moduleSpec(path, literal(tokens[i + 2]));
        assert(tokens[i + 3]?.text === ')', 'Unsupported require expression ' + path);
      }
    }
  }
  return {
    scope: 'ARCHIVED_CONSERVATIVE_LEXICAL_STATIC_EXPORT_TYPE_AND_LITERAL_DYNAMIC_IMPORT_CLOSURE',
    paths: [...visited].sort(),
    edges,
    bytesRead,
    external: [...external].sort(),
    syntaxScope:
      'Pinned TypeScript scanner, conservative import-edge extraction; not a general syntax/AST validator. Unsupported import forms fail closed.',
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
