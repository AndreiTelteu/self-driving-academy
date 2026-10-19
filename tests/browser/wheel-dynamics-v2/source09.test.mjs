// SOURCE09 draft. Pure/temporary-file seams only; never imports server/capture entrypoints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import {
  recordRun,
  failTerminal,
  recordEvidence,
  causes,
  digest,
  MAX_SOURCE_BYTES,
  readSourceBytes,
  localClosure,
  verifyFrozenArchive,
} from '../../../scripts/wheel-capture-source.mjs';

test('measurement + disposal + raw/failure/terminal recording faults keep actual references', async () => {
  const measurement = new Error('measurement'),
    disposal = new Error('dispose');
  const raw = new Error('raw-write'),
    failure = new Error('failure-write'),
    terminal = new Error('terminal-write');
  const writes = [];
  const writer = async (path, dto) => {
    writes.push({ path, dto });
    throw path === 'raw' ? raw : path === 'failure' ? failure : terminal;
  };
  let pending;
  try {
    await recordRun(
      'raw',
      'failure',
      { partial: { measuredCompleted: 17 } },
      [
        { stage: 'measurement', cause: measurement },
        { stage: 'dispose', cause: disposal },
      ],
      writer,
    );
  } catch (error) {
    pending = error;
  }
  assert.ok(pending instanceof AggregateError);
  assert.deepEqual(pending.errors, [measurement, disposal, raw, failure]);
  assert.equal(pending.cause, measurement);
  assert.equal(writes[0].dto.partial.measuredCompleted, 17);
  assert.deepEqual(
    writes[1].dto.failures.map((x) => x.stage),
    ['measurement', 'dispose', 'raw-write'],
  );
  await assert.rejects(failTerminal('terminal', pending, {}, writer), (error) => {
    assert.deepEqual(error.errors, [pending, terminal]);
    assert.equal(error.cause, terminal);
    assert.equal(error.errors[0].errors[0], measurement);
    assert.equal(error.errors[0].errors[1], disposal);
    return true;
  });
  assert.equal(writes[2].dto.state, 'FAILED');
});

test('successful failure recording still throws original pending causes; export failure is retained', async () => {
  const primary = new Error('calibration'),
    disposal = new Error('dispose');
  const combined = new AggregateError([primary, disposal]);
  const writes = [];
  await assert.rejects(
    recordRun(
      'raw',
      'failure',
      { partial: [1, 2] },
      [{ stage: 'calibration', cause: combined }],
      async (path, dto) => {
        writes.push({ path, dto });
      },
    ),
    (error) => error.errors[0] === combined,
  );
  assert.deepEqual(
    writes.map((x) => x.path),
    ['raw', 'failure'],
  );
  const exportError = new Error('export');
  await assert.rejects(
    recordEvidence('report', {}, [combined], async () => {
      throw exportError;
    }),
    (error) => error.errors[0] === combined && error.errors[1] === exportError,
  );
  await assert.rejects(
    failTerminal('terminal', combined, {}, async () => {}),
    (error) => error === combined,
  );
  const chain = new Error('root');
  chain.cause = chain;
  assert.equal(causes(chain).cause.circular, true);
  const many = causes(new AggregateError(Array(1000).fill(new Error('x'.repeat(20000)))));
  assert.ok(JSON.stringify(many).length < 600000);
  assert.ok(many.errors.length <= 64);
});

test('8MiB byte boundary is enforced before decoding/tokenization, including invalid source', async () => {
  const temp = await mkdtemp(resolve('.pbi-validation-026-source09-'));
  try {
    const path = resolve(temp, 'boundary.ts');
    await writeFile(path, Buffer.alloc(MAX_SOURCE_BYTES, 32));
    assert.equal((await readSourceBytes(path)).length, MAX_SOURCE_BYTES);
    assert.ok(
      (await localClosure([path])).includes(relative(resolve('.'), path).replaceAll('\\', '/')),
    );
    await writeFile(path, Buffer.alloc(MAX_SOURCE_BYTES + 1, 255));
    await assert.rejects(readSourceBytes(path), /exceeds8MiB/);
    await assert.rejects(localClosure([path]), /exceeds8MiB/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('post-build verification rejects intervening live/archive source, artifact and native mutations', async () => {
  const temp = await mkdtemp(resolve('.pbi-validation-026-source09-'));
  try {
    const input = relative(resolve('.'), resolve(temp, 'input.ts')).replaceAll('\\', '/');
    const root = resolve(temp, 'build'),
      archive = resolve(temp, 'archive');
    const liveInput = resolve(input),
      archivedInput = resolve(archive, 'source', input);
    const runtime = resolve(temp, 'native.mjs'),
      archivedNative = resolve(archive, 'native/rapier-native-artifact.mjs');
    const artifact = resolve(root, 'app.js'),
      archivedArtifact = resolve(archive, 'build/app.js');
    for (const path of [
      liveInput,
      archivedInput,
      runtime,
      archivedNative,
      artifact,
      archivedArtifact,
    ]) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, 'original');
    }
    const bytes = await readFile(liveInput);
    const binding = {
      inputs: [input],
      sourceHash: createHash('sha256').update(input).update(bytes).digest('hex'),
      artifacts: [{ path: 'app.js', bytes: bytes.length, sha256: digest(bytes) }],
      root,
      archive,
      native: { resolvedPath: runtime, bytes: bytes.length, sha256: digest(bytes) },
    };
    await verifyFrozenArchive(binding);
    // Frozen prebuild hash, then later copied/mutated input: cannot archive-complete.
    for (const path of [
      liveInput,
      archivedInput,
      artifact,
      archivedArtifact,
      runtime,
      archivedNative,
    ]) {
      await writeFile(path, 'mutated');
      await assert.rejects(verifyFrozenArchive(binding), /changed during/);
      await writeFile(path, bytes);
    }
    await verifyFrozenArchive(binding);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
