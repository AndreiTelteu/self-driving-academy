import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EVIDENCE_BODY_LIMIT_BYTES,
  EvidenceTransportError,
  readEvidenceJson,
  writeImmutableEvidence,
} from './transport.mjs';

test('real loopback HTTP accepts native calibration, preserves immutable data, rejects malformed/oversize bodies', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'wheel-evidence-transport-'));
  const historical = JSON.parse(
    await readFile('Docs/Evidence/026-wheel-dynamics/calibration-v2.json', 'utf8'),
  ).runs.filter((run) => run.speedMps === 20 && ['braking', 'turning'].includes(run.scenario));
  const actual = JSON.stringify({ purpose: 'TRANSPORT_TEST_ONLY', calibration: historical });
  assert(
    Buffer.byteLength(actual) > 256 * 1026,
    'Actual native curves reproduce the old rejected body',
  );
  const server = createServer(async (request, response) => {
    try {
      const report = await readEvidenceJson(request);
      if (report.purpose !== 'TRANSPORT_TEST_ONLY')
        throw new EvidenceTransportError(400, 'Invalid test identity');
      if (request.url === '/persist')
        await writeImmutableEvidence(join(folder, 'transport-only.json'), report);
      response.writeHead(200).end('accepted');
    } catch (error) {
      response
        .writeHead(error instanceof EvidenceTransportError ? error.status : 500)
        .end(error.message);
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) =>
    fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  try {
    assert.equal((await post('/persist', actual)).status, 200);
    assert.deepEqual(
      JSON.parse(await readFile(join(folder, 'transport-only.json'), 'utf8')).calibration,
      historical,
    );
    assert.equal((await post('/persist', actual)).status, 409);
    assert.equal((await post('/read', '{')).status, 400);
    assert.equal((await post('/read', JSON.stringify({ purpose: 'INVALID' }))).status, 400);
    const prefix = '{"purpose":"TRANSPORT_TEST_ONLY","padding":"',
      suffix = '"}';
    const boundary =
      prefix + 'x'.repeat(EVIDENCE_BODY_LIMIT_BYTES - Buffer.byteLength(prefix + suffix)) + suffix;
    assert.equal((await post('/read', boundary)).status, 200);
    const oversized = await post('/read', boundary.slice(0, -2) + 'x' + suffix);
    assert.equal(oversized.status, 413);
    assert.match(await oversized.text(), /exceeds 4194304 bytes/);
    const worstNumbers = (value) =>
      typeof value === 'number'
        ? -Number.MAX_VALUE
        : Array.isArray(value)
          ? value.map(worstNumbers)
          : value && typeof value === 'object'
            ? Object.fromEntries(
                Object.entries(value).map(([key, item]) => [key, worstNumbers(item)]),
              )
            : value;
    const maxCurves = historical.map((run) => ({
      ...run,
      curve: Array.from({ length: run.scenario === 'braking' ? 300 : 30 }, () =>
        worstNumbers(run.curve[0]),
      ),
    }));
    const estimatedCalibrationUpperBytes = Buffer.byteLength(
      JSON.stringify(worstNumbers(maxCurves)),
    );
    // Fixed ten-arm percentile summaries, frozen source identity and bounded backend metadata
    // have a separate generous 256KiB allowance; native curves are the dominant term.
    assert(estimatedCalibrationUpperBytes + 256 * 1024 < EVIDENCE_BODY_LIMIT_BYTES);
    console.log(
      JSON.stringify({
        actualCalibrationPayloadBytes: Buffer.byteLength(actual),
        estimatedCalibrationUpperBytes,
        fixedEnvelopeAllowanceBytes: 256 * 1024,
        bodyCapBytes: EVIDENCE_BODY_LIMIT_BYTES,
        fullHardwareEvidence: false,
      }),
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(folder, { recursive: true });
  }
});
