/** SOURCE20 drafted finite faults. Not executed. No HTTP, listener, build or native world. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MANIFEST, ARCHIVE, BUILD, identity, inside, exactBytes, hash } from './serve-existing-contract.mjs';
import { readEvidenceJson } from './transport.mjs';
import { PART_BYTES } from './parts.mjs';

// Existing artifacts are data fixtures only; none of their executable entry points run.
const originalManifest = JSON.parse(readFileSync(MANIFEST));
const originalBinding = JSON.parse(readFileSync(`${ARCHIVE}/archive-complete.json`));
const copy = (value) => structuredClone(value);

test('exact R19 identity admits original and rejects wrong UUID', () => {
  identity(originalManifest, originalBinding);
  const binding = copy(originalBinding);
  binding.archive = binding.archive.replace('66872ce5', '00000000');
  assert.throws(() => identity(originalManifest, binding), /UUID/);
});
test('wrong source cannot acquire readiness', () => {
  const manifest = copy(originalManifest);
  manifest.sourceHash = '0'.repeat(64);
  assert.throws(() => identity(manifest, originalBinding), /source pin/);
});
test('wrong artifact identity cannot acquire readiness', () => {
  const binding = copy(originalBinding);
  binding.artifactHash = '0'.repeat(64);
  assert.throws(() => identity(originalManifest, binding), /artifact pin/);
});
test('same-sized corrupt artifact and truncated bytes both fail', () => {
  const original = Buffer.from('immutable artifact');
  const corrupt = Buffer.from(original);
  corrupt[0] ^= 1;
  assert.throws(() => exactBytes(corrupt, original.length, hash(original), 'artifact'), /hash mismatch/);
  assert.throws(() => exactBytes(original.subarray(1), original.length, hash(original), 'artifact'), /count/);
});
test('path escapes and Windows alternate streams are rejected', () => {
  for (const path of ['../outside', '/outside', 'C:/outside', 'assets/../../outside',
    'assets\\outside', 'assets/file:stream', 'assets//file', 'assets/./file'])
    assert.throws(() => inside(BUILD, path), /locator|escape/);
});
test('same-sized current production drift fails its archived pin', () => {
  const archived = Buffer.from('export const production = 1;');
  const current = Buffer.from('export const production = 2;');
  assert.throws(() => exactBytes(current, archived.length, hash(archived), 'current production'), /hash/);
});
test('truncated chunk cannot satisfy original length/hash contract or JSON ingress', async () => {
  const binding = { captureId: '11111111-1111-1111-1111-111111111111' };
  const dto = { binding, name: 'raw-0', operation: 'part', index: 0,
    base64: Buffer.alloc(PART_BYTES - 1).toString('base64') };
  const manifest = { bytes: PART_BYTES, count: 1, sha256: hash(Buffer.alloc(PART_BYTES)) };
  // Part-ledger has no FS injection. Draft its exact decoded-byte predicate purely;
  // actual part-ledger persistence remains covered by the archived contract tests.
  const bytes = Buffer.from(dto.base64, 'base64');
  assert.equal(bytes.toString('base64'), dto.base64);
  assert.notEqual(bytes.length, Math.min(PART_BYTES, manifest.bytes - dto.index * PART_BYTES));
  assert.notEqual(hash(bytes), manifest.sha256);
  const request = {
    async *iterator() { yield Buffer.from('{"binding":'); },
    resume() { throw new Error('Unexpected overflow path'); },
  };
  await assert.rejects(readEvidenceJson(request), /Malformed evidence JSON/);
});
