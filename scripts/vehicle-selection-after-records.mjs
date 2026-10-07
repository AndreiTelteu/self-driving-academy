// Node evidence helper ONLY. Injected writer permits meaningful transport/error tests.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile, readFile, readdir } from 'node:fs/promises';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const safeText = (error, key, cap) => {
  try {
    return String(error?.[key] ?? error).slice(0, cap);
  } catch {
    return 'Unreadable thrown value';
  }
};
const errorView = (error) => ({
  name: safeText(error, 'name', 128),
  message: safeText(error, 'message', 4096),
  stack: safeText(error, 'stack', 16384),
});
export function worldId({ count, pair, observer, classId, fixedMode, targetKind, guard = false }) {
  return guard
    ? `guard-${classId}`
    : classId
      ? `class-${classId}-${fixedMode}-${targetKind}`
      : `fleet-${count}-${pair}-${observer ? 'on' : 'off'}`;
}
export async function preserveWorldRecord({
  folder,
  id,
  start,
  sourceHash,
  result,
  partial,
  cleanup,
  causes,
  write = writeFile,
}) {
  assert.match(
    id,
    /^(fleet-(70|110)-[0-4]-(on|off)|class-(sedan|compact)-(AUTO|MANUAL|LEARNING)-(TAXI|CIVIL)|guard-(sedan|compact))$/,
  );
  assert(causes.length <= 32, 'Bounded acquired-owner error ledger');
  const failures = [...causes],
    status = failures.length ? 'FAIL' : 'PASS';
  const record = {
    id,
    status,
    sourceHash,
    startedAt: start.startedAt,
    completedAt: new Date().toISOString(),
    result,
    partial,
    cleanup,
    errors: failures.map(errorView),
  };
  let bytes = null;
  const filename = `${id}.${status === 'PASS' ? 'pass' : 'failed'}.json`;
  let saved = false;
  try {
    bytes = Buffer.from(JSON.stringify(record, null, 2));
    await write(`${folder}/${filename}`, bytes, { flag: 'wx' });
    saved = true;
  } catch (error) {
    failures.push(error);
  }
  if (saved) {
    try {
      await write(
        `${folder}/${id}.terminal.json`,
        JSON.stringify(
          {
            id,
            status,
            sourceHash,
            record: filename,
            sha256: digest(bytes),
            startedAt: start.startedAt,
            completedAt: record.completedAt,
          },
          null,
          2,
        ),
        { flag: 'wx' },
      );
    } catch (error) {
      failures.push(error);
    }
  }
  if (!saved || failures.length !== causes.length) {
    try {
      await write(
        `${folder}/${id}.rejected.json`,
        JSON.stringify(
          {
            id,
            status: 'REJECTED',
            sourceHash,
            recordSaved: saved,
            failedAt: new Date().toISOString(),
            errors: failures.map(errorView),
          },
          null,
          2,
        ),
        { flag: 'wx' },
      );
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      'World or immutable evidence export failed; original and cleanup/export causes preserved',
    );
  return { id, record: filename, sha256: digest(bytes) };
}
export async function verifyWorldInventory({
  folder,
  sourceHash,
  worlds,
  read = readFile,
  list = readdir,
}) {
  assert.equal(worlds.length, 34);
  const expected = worlds.map((w) => worldId(w.descriptor));
  assert.equal(new Set(expected).size, 34);
  const actual = (await list(folder)).sort();
  assert.deepEqual(
    actual,
    expected
      .flatMap((id) => [`${id}.started.json`, `${id}.pass.json`, `${id}.terminal.json`])
      .sort(),
    'Failed/rejected/partial/unfinished/extra world record disqualifies capture',
  );
  for (const w of worlds) {
    const id = worldId(w.descriptor),
      started = JSON.parse(await read(`${folder}/${id}.started.json`)),
      bytes = await read(`${folder}/${id}.pass.json`),
      record = JSON.parse(bytes),
      terminal = JSON.parse(await read(`${folder}/${id}.terminal.json`));
    assert.equal(started.id, id);
    assert.equal(started.sourceHash, sourceHash);
    assert.equal(record.id, id);
    assert.equal(record.status, 'PASS');
    assert.equal(record.sourceHash, sourceHash);
    assert.equal(record.partial, null);
    assert.deepEqual(record.errors, []);
    assert.deepEqual(record.result, w.result);
    assert.deepEqual(record.cleanup, w.result.cleanup);
    assert.equal(terminal.id, id);
    assert.equal(terminal.status, 'PASS');
    assert.equal(terminal.sourceHash, sourceHash);
    assert.equal(terminal.record, `${id}.pass.json`);
    assert.equal(terminal.sha256, digest(bytes));
    assert.equal(record.startedAt, started.startedAt);
    assert.equal(terminal.startedAt, started.startedAt);
    assert.equal(terminal.completedAt, record.completedAt);
    assert(
      Number.isFinite(Date.parse(started.startedAt)) &&
        Date.parse(started.startedAt) <= Date.parse(record.completedAt),
    );
  }
}
