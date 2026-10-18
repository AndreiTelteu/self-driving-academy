import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import {
  readEvidenceJson,
  writeImmutableEvidence,
  EvidenceTransportError,
  EVIDENCE_BODY_LIMIT_BYTES,
} from './transport.mjs';
test('actual loopback native crossing payload and exact finite HTTP boundary retain immutable data in TEMP only', async () => {
  const native = JSON.parse(await readFile('Docs/Evidence/052-yield-policy/before.json', 'utf8'));
  const calibration = native.calibration.filter((r) => r.options.otherDistanceM === 14);
  assert.equal(calibration.length, 4);
  const body = JSON.stringify({ purpose: 'TRANSPORT_TEST_ONLY', calibration });
  assert(
    Buffer.byteLength(body) > 128 * 1024,
    'Actual native traces exercise significant report ingress',
  );
  const widest = (value) =>
    typeof value === 'number'
      ? -1.7976931348623157e308
      : Array.isArray(value)
        ? value.map(widest)
        : value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, widest(item)]))
          : value;
  // Four actual shapes, max130trace rows each, plus130two-command rows/class.
  const command = {
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'controller-024-fixture',
    worldEpoch: 0,
    vehicleId: 'subject',
    tick: 780,
    source: 'AUTONOMY',
    throttle: 1,
    brake: 1,
    steering: 0,
    handbrake: false,
    turnSignal: 'OFF',
  };
  const worst = JSON.stringify({
    calibration: calibration.map((r) => ({
      ...widest(r),
      commands: Array.from({ length: 130 }, () => [
        widest(command),
        { ...widest(command), vehicleId: 'priority' },
      ]),
    })),
  });
  assert(
    Buffer.byteLength(worst) + 256 * 1024 < EVIDENCE_BODY_LIMIT_BYTES,
    'Finite trace/command cap plus envelope fits4MiB',
  );
  const temporary = await mkdtemp(join(tmpdir(), 'yield-transport-'));
  const server = createServer(async (request, response) => {
    try {
      const report = await readEvidenceJson(request);
      if (report.purpose !== 'TRANSPORT_TEST_ONLY')
        throw new EvidenceTransportError(400, 'Test-only identity mismatch');
      await writeImmutableEvidence(
        join(
          temporary,
          request.url === '/duplicate'
            ? 'actual.json'
            : request.url === '/boundary'
              ? 'boundary.json'
              : 'actual.json',
        ),
        report,
      );
      response.writeHead(200).end('TEMP test artifact only');
    } catch (error) {
      response
        .writeHead(error instanceof EvidenceTransportError ? error.status : 500)
        .end(error.message);
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(endpoint + path, { method: 'POST', body });
  try {
    assert.equal((await post('/actual', body)).status, 200);
    assert.deepEqual(
      JSON.parse(await readFile(join(temporary, 'actual.json'), 'utf8')).calibration,
      calibration,
    );
    assert.equal((await post('/duplicate', body)).status, 409);
    const prefix = '{"purpose":"TRANSPORT_TEST_ONLY","padding":"',
      suffix = '"}';
    const boundary =
      prefix + 'x'.repeat(EVIDENCE_BODY_LIMIT_BYTES - Buffer.byteLength(prefix + suffix)) + suffix;
    assert.equal(Buffer.byteLength(boundary), EVIDENCE_BODY_LIMIT_BYTES);
    assert.equal((await post('/boundary', boundary)).status, 200);
    assert.equal((await post('/oversize', boundary + ' ')).status, 413);
    assert.equal((await post('/malformed', '{')).status, 400);
    assert.equal((await post('/invalid', '{}')).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    assert(
      resolve(temporary).startsWith(resolve(tmpdir()) + sep) &&
        basename(temporary).startsWith('yield-transport-'),
    );
    await rm(temporary, { recursive: true, force: true });
  }
});
