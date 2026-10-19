// SOURCE05 pure DTO/import-graph adversaries; no native acquisition or filesystem mutation.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  validateMemory,
  validateMemoryEndpoints,
  validateSuccessfulDiagnostics,
  compareOriginal,
  descriptors,
  distribution,
} from '../../scripts/manual-segments-after-records.mjs';
import {
  validateOwnerTiming,
  serializeDiagnostic,
  exportFailurePreserving,
} from '../../scripts/manual-segments-calibration-proof.mjs';
import {
  verifyModuleClosure,
  captureImportRoots,
  PINNED_LOCK_SHA,
  verifyArchiveProofChild,
  preflightFailureArtifact,
} from '../../scripts/manual-segments-archive-closure.mjs';
const memory = () => ({
  rss: 10000000,
  heapTotal: 9000000,
  heapUsed: 6000000,
  external: 100,
  arrayBuffers: 50,
});
const heap = () =>
  Object.fromEntries(
    ['beforeWarmup', 'afterWarmup', 'afterMeasured'].map((phase) => [phase, memory()]),
  );
function comparisonFixture() {
  return descriptors().map((descriptor) => ({
    descriptor,
    nativeInputDigest: 'a',
    packetDigest: 'b',
    physicalDigest: 'c',
    rawInputDigest: 'd',
    checkpoints: [],
    boundaryTrace: [],
    distributions: Object.fromEntries(
      ['tickMs', 'authorityMs', 'rapierMs'].map((channel) => [
        channel,
        distribution(Array(600).fill(3)),
      ]),
    ),
    heap: heap(),
  }));
}
test('memory requires actual complete finite numeric endpoints on BOTH comparison arms', () => {
  validateMemory(memory());
  for (const value of [
    {},
    { rss: 1, heapTotal: 2, external: 0, arrayBuffers: 0 },
    { ...memory(), heapUsed: -1 },
    { ...memory(), heapUsed: NaN },
    { ...memory(), heapUsed: '6000000' },
  ]) {
    assert.throws(() => validateMemory(value));
    for (const arm of ['before', 'after']) {
      const before = comparisonFixture(),
        after = comparisonFixture();
      (arm === 'before' ? before : after)[0].heap.afterMeasured = value;
      assert.throws(() => compareOriginal(before, after));
    }
  }
  const empty = { heap: heap() };
  delete empty.heap.afterWarmup;
  assert.throws(() => validateMemoryEndpoints(empty));
});
test('PASS excludes missing null fields and serialized thrown primitive diagnostics', () => {
  validateSuccessfulDiagnostics({ status: 'PASS', primary: null, terminalErrors: null });
  for (const value of [
    { status: 'PASS', primary: serializeDiagnostic(undefined), terminalErrors: null },
    { status: 'PASS', primary: null, terminalErrors: serializeDiagnostic(null) },
    { status: 'PASS', primary: null },
    { status: 'PASS', terminalErrors: null },
    { status: 'PASS', primary: null, terminalErrors: null, failureDiagnostics: {} },
  ])
    assert.throws(() => validateSuccessfulDiagnostics(value));
  assert.throws(() =>
    validateSuccessfulDiagnostics(
      { phase: 'COLLECTED', primary: serializeDiagnostic(false), terminalErrors: null },
      'phase',
      'COLLECTED',
    ),
  );
});
test('owner component clock values reject negative string NaN and impossible authority durations', () => {
  const valid = {
    timingScope: 'ACTUAL_BRIDGE_OPERATION_MINUS_AUTHORITY_WITH_INCLUDED_NATIVE_READBACK_OBSERVER',
    bridgeStartedAtMs: 100,
    bridgeEndedAtMs: 107,
    bridgeTotalMs: 7,
    actualAuthorityMs: 2,
    wholeOwnerMs: 5,
  };
  validateOwnerTiming(valid);
  for (const key of ['bridgeTotalMs', 'actualAuthorityMs', 'wholeOwnerMs'])
    for (const value of [-1, -2, '2', NaN])
      assert.throws(() => validateOwnerTiming({ ...valid, [key]: value }));
  for (const value of [
    { ...valid, actualAuthorityMs: 8 },
    { ...valid, wholeOwnerMs: -1 },
    { ...valid, bridgeEndedAtMs: 106 },
    { ...valid, wholeOwnerMs: 5.5001 },
  ])
    assert.throws(() => validateOwnerTiming(value));
});
test('archived closure rejects deleted controller after valid source rehash and supports literal/type edges', async () => {
  const lockBytes = await readFile(new URL('../../package-lock.json', import.meta.url));
  assert.equal(createHash('sha256').update(lockBytes).digest('hex'), PINNED_LOCK_SHA);
  const files = new Map([
    ['entry.mjs', Buffer.from("import './src/vehicles/index.ts';")],
    [
      'src/vehicles/index.ts',
      Buffer.from("export * from './controller'; export type * from './body-port';"),
    ],
    [
      'src/vehicles/controller.ts',
      Buffer.from(
        "export const createVehicleController=()=>null; const deferred=()=>import('./body-port.ts');",
      ),
    ],
    ['src/vehicles/body-port.ts', Buffer.from('export type BodyIdentity={generation:number};')],
  ]);
  const options = () => ({
    paths: [...files.keys()],
    roots: ['entry.mjs'],
    readSource: async (path) => files.get(path),
    lockBytes,
  });
  const proof = await verifyModuleClosure(options());
  assert(proof.paths.includes('src/vehicles/controller.ts'));
  files.delete('src/vehicles/controller.ts');
  const selfDeclaredRehash = createHash('sha256');
  for (const [path, bytes] of files) selfDeclaredRehash.update(path).update(bytes);
  assert.match(selfDeclaredRehash.digest('hex'), /^[a-f0-9]{64}$/);
  await assert.rejects(verifyModuleClosure(options()), /Unresolved archived local import/);
});
test('archived closure fails closed on unknown dynamic imports or changed external lock', async () => {
  const lockBytes = await readFile(new URL('../../package-lock.json', import.meta.url));
  const options = {
    paths: ['entry.mjs'],
    roots: ['entry.mjs'],
    readSource: async () =>
      Buffer.from('const name="./local.mjs"; export const load=()=>import(name);'),
    lockBytes,
  };
  await assert.rejects(verifyModuleClosure(options), /Nonliteral module import/);
  await assert.rejects(
    verifyModuleClosure({ ...options, lockBytes: Buffer.from('{}') }),
    /locked external dependency/,
  );
});

test('child nonzero unresolved controller preserves actual stderr exit and original spawn cause without launching', () => {
  const original = new Error('native spawn failure');
  let calls = 0;
  assert.throws(
    () =>
      verifyArchiveProofChild('injected-only', (_binary, _args, options) => {
        calls++;
        assert.equal(options.timeout, 30000);
        assert.equal(options.maxBuffer, 256 * 1024);
        return {
          status: 1,
          signal: null,
          stdout: '',
          stderr: 'Unresolved archived local import src/vehicles/index.ts -> ./controller',
          error: original,
        };
      }),
    (error) => {
      assert(error instanceof AggregateError);
      assert.equal(error.errors[0], original);
      const artifact = preflightFailureArtifact(error);
      assert.equal(artifact.processDiagnostics, error.processDiagnostics);
      assert.equal(artifact.processDiagnostics.status, 1);
      assert.match(artifact.processDiagnostics.stderr, /Unresolved archived local import/);
      assert.equal(artifact.processDiagnostics.phase, 'SPAWN_RESULT_FAILURE');
      return true;
    },
  );
  assert.equal(calls, 1);
});
test('child timeout signal and direct thrown primitive retain bounded observed diagnostics', () => {
  const timeout = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
  assert.throws(
    () =>
      verifyArchiveProofChild('injected-only', () => ({
        status: null,
        signal: 'SIGTERM',
        stdout: '',
        stderr: 'timeout',
        error: timeout,
      })),
    (error) => {
      assert.equal(error.errors[0], timeout);
      const d = preflightFailureArtifact(error).processDiagnostics;
      assert.equal(d.status, null);
      assert.equal(d.statusObserved, true);
      assert.equal(d.signal, 'SIGTERM');
      return true;
    },
  );
  assert.throws(
    () =>
      verifyArchiveProofChild('injected-only', () => {
        throw undefined;
      }),
    (error) => {
      assert(error instanceof AggregateError);
      assert.equal(error.errors[0], undefined);
      assert.equal(error.processDiagnostics.phase, 'SPAWN_THROW');
      assert.equal(error.processDiagnostics.returned, false);
      return true;
    },
  );
});
test('exit0 malformed JSON and incorrect proofstatus preserve exact parse/status cause and returned streams', () => {
  for (const stdout of ['not-json', JSON.stringify({ status: 'WRONG_STATUS' })])
    assert.throws(
      () =>
        verifyArchiveProofChild('injected-only', () => ({
          status: 0,
          signal: null,
          stdout,
          stderr: 'child retained diagnostic',
        })),
      (error) => {
        assert(error instanceof AggregateError);
        assert(error.errors[0] instanceof Error);
        if (stdout === 'not-json') assert(error.errors[0] instanceof SyntaxError);
        const artifact = preflightFailureArtifact(error);
        assert.equal(artifact.processDiagnostics, error.processDiagnostics);
        assert.equal(artifact.processDiagnostics.stdout, stdout);
        assert.equal(artifact.processDiagnostics.stderr, 'child retained diagnostic');
        assert.equal(artifact.processDiagnostics.status, 0);
        assert.equal(artifact.processDiagnostics.phase, 'PARSE_OR_STATUS_FAILURE');
        return true;
      },
    );
});
test('child stream bounds are UTF8bytes and unknown processdiagnostic getters are never exported/executed', () => {
  let calls = 0;
  const hostile = {
    get processDiagnostics() {
      calls++;
      throw Error('getter');
    },
  };
  assert.equal(preflightFailureArtifact(hostile).processDiagnostics, null);
  assert.equal(calls, 0);
  const text = 'é'.repeat(70000);
  assert.throws(
    () =>
      verifyArchiveProofChild('injected-only', () => ({
        status: 1,
        signal: null,
        stdout: text,
        stderr: text,
      })),
    (error) => {
      const d = preflightFailureArtifact(error).processDiagnostics;
      assert(Buffer.byteLength(d.stdout) <= 65536);
      assert(Buffer.byteLength(d.stderr) <= 65536);
      assert.equal(d.stdoutBytes, 140000);
      assert.equal(d.stderrBytes, 140000);
      assert.equal(d.stdoutTruncated, true);
      assert.equal(d.stderrTruncated, true);
      return true;
    },
  );
});
test('child artifact export failure retains original subprocess wrapper cause and branded processmetadata', async () => {
  const original = new TypeError('spawn'),
    exportError = new RangeError('wx export');
  let failure;
  try {
    verifyArchiveProofChild('injected-only', () => ({
      status: 1,
      signal: null,
      stdout: 'raw output',
      stderr: 'raw failure',
      error: original,
    }));
  } catch (error) {
    failure = error;
  }
  const artifact = preflightFailureArtifact(failure);
  await assert.rejects(
    exportFailurePreserving(failure, async () => {
      assert.equal(artifact.processDiagnostics, failure.processDiagnostics);
      throw exportError;
    }),
    (error) => {
      assert(error instanceof AggregateError);
      assert.equal(error.errors[0], failure);
      assert.equal(error.errors[1], exportError);
      assert.equal(failure.errors[0], original);
      assert.equal(
        preflightFailureArtifact(failure).processDiagnostics,
        artifact.processDiagnostics,
      );
      return true;
    },
  );
});

// SOURCE07: native lazy-stack path must not authorize custom accessors or changed formatting hooks.
test('native original stack survives safe intrinsic path while custom stack and prepare hooks stay uncalled', () => {
  const original = new TypeError('original lazy-stack diagnostic');
  assert.match(serializeDiagnostic(original).stack, /original lazy-stack diagnostic/);
  let calls = 0;
  const hostile = new Error('hostile');
  Object.defineProperty(hostile, 'stack', {
    get() {
      calls++;
      throw Error('custom stack');
    },
    configurable: true,
  });
  assert.equal(serializeDiagnostic(hostile).stack, '');
  const descriptor = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace');
  try {
    Object.defineProperty(Error, 'prepareStackTrace', {
      value() {
        calls++;
        throw Error('custom formatter');
      },
      configurable: true,
      writable: true,
    });
    assert.equal(serializeDiagnostic(new Error('changed-hook')).stack, '');
    assert.equal(calls, 0);
  } finally {
    if (descriptor) Object.defineProperty(Error, 'prepareStackTrace', descriptor);
    else delete Error.prepareStackTrace;
  }
  assert.equal(calls, 0);
});
test('pinned scanner decodes escaped literal edges and rejects computed import expressions', async () => {
  const lockBytes = await readFile(new URL('../../package-lock.json', import.meta.url));
  const files = new Map([
    [
      'entry.mjs',
      Buffer.from("export type * from './types'; export const load=()=>import('./target.mjs');"),
    ],
    ['types.ts', Buffer.from('export type Label=string;')],
    ['target.mjs', Buffer.from('export const ok=true;')],
  ]);
  const options = () => ({
    paths: [...files.keys()],
    roots: ['entry.mjs'],
    readSource: async (path) => files.get(path),
    lockBytes,
  });
  const proof = await verifyModuleClosure(options());
  assert(proof.paths.includes('types.ts'));
  assert(proof.paths.includes('target.mjs'));
  files.set('entry.mjs', Buffer.from("export const load=()=>import('./target'+'.mjs');"));
  await assert.rejects(verifyModuleClosure(options()), /Unsupported dynamic import expression/);
});

test('native inherited message accessor is never invoked by intrinsic stack materialization', () => {
  let calls = 0;
  const original = new Error('deleted own message');
  delete original.message;
  const prototype = Object.create(Error.prototype);
  Object.defineProperty(prototype, 'message', {
    get() {
      calls++;
      throw Error('inherited message getter');
    },
  });
  Object.setPrototypeOf(original, prototype);
  assert.equal(serializeDiagnostic(original).stack, '');
  assert.equal(calls, 0);
});

test('archive roots require actual compile-only declaration and include its type import traversal', () => {
  const path = 'scripts/manual-segments-calibration-proof.d.mts';
  assert.throws(() => captureImportRoots([], { source: [] }), /Missing compile-only declaration/);
  assert(captureImportRoots([path], { source: [] }).includes(path));
});

test('scanner consumes regex modulewords escapedslashes and characterclasses but keeps real division imports', async () => {
  const lockBytes = await readFile(new URL('../../package-lock.json', import.meta.url));
  const files = new Map([
    [
      'entry.mjs',
      Buffer.from(
        String.raw`const a=/import export require/;const b=/[\/]/;const c=/import\/export/;const n=8/2;export const load=()=>n/import('./dependency.mjs');`,
      ),
    ],
    ['dependency.mjs', Buffer.from('export const ok=true;')],
  ]);
  const options = () => ({
    paths: [...files.keys()],
    roots: ['entry.mjs'],
    readSource: async (path) => files.get(path),
    lockBytes,
  });
  const proof = await verifyModuleClosure(options());
  assert(proof.paths.includes('dependency.mjs'));
  files.delete('dependency.mjs');
  await assert.rejects(verifyModuleClosure(options()), /Unresolved archived local import/);
});
test('scanner rejects ambiguous slash context rather than hiding module tokens', async () => {
  const lockBytes = await readFile(new URL('../../package-lock.json', import.meta.url));
  await assert.rejects(
    verifyModuleClosure({
      paths: ['entry.mjs'],
      roots: ['entry.mjs'],
      readSource: async () => Buffer.from("function f(){} /import export require/.test('text');"),
      lockBytes,
    }),
    /Ambiguous slash lexical context/,
  );
});
test('actual failed01 archived validation source has bounded raw pinned import proof as diagnostic only', async () => {
  const folder = new URL(
    '../../Docs/Evidence/069-manual-segments/native-after-01/',
    import.meta.url,
  );
  const manifest = JSON.parse(await readFile(new URL('manifest.json', folder)));
  assert.equal(
    manifest.sourceHash,
    '243b22564f21d1dfa6da0352a1d461f81df5f00166d761d8eae4168d0800cb71',
  );
  const path = 'tests/telemetry/manual-segments-after-validation.test.mjs',
    row = manifest.inputs.find((row) => row.path === path);
  assert(row);
  const raw = await readFile(new URL(row.archiveRelativePath, folder));
  assert.equal(raw.length, row.bytes);
  assert.equal(createHash('sha256').update(raw).digest('hex'), row.sha256);
  const proof = await verifyModuleClosure({
    paths: manifest.inputs.map((row) => row.path),
    roots: [path],
    readSource: async (name) => readFile(new URL('source/' + name, folder)),
    lockBytes: await readFile(new URL('source/package-lock.json', folder)),
  });
  assert(proof.paths.includes(path));
  const failure = await readFile(new URL('failure.json', folder));
  assert.equal(
    createHash('sha256').update(failure).digest('hex'),
    'd4414af8c90dff93349623d5a700fb7cc6685dee672f9ca5ed72622dc3a1701e',
  );
});
