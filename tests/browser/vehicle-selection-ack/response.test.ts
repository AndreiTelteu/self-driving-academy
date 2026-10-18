import assert from 'node:assert/strict';
import test from 'node:test';
import { readAcknowledgment } from './response';

test('successful acknowledgment consumes its real Response body only once', async () => {
  const response = new Response(JSON.stringify({ sha256: 'a'.repeat(64) }), { status: 200 });
  assert.deepEqual(await readAcknowledgment(response, '/world-begin'), { sha256: 'a'.repeat(64) });
  assert.equal(response.bodyUsed, true);
});
test('HTTP rejection retains the actual status and server body', async () => {
  await assert.rejects(
    readAcknowledgment(new Response('immutable capture conflict', { status: 409 }), '/world-part'),
    /\/world-part HTTP 409: immutable capture conflict/,
  );
});
test('malformed successful JSON cannot become an acknowledgment', async () => {
  await assert.rejects(
    readAcknowledgment(new Response('not JSON', { status: 200 }), '/world-terminal'),
    SyntaxError,
  );
});
