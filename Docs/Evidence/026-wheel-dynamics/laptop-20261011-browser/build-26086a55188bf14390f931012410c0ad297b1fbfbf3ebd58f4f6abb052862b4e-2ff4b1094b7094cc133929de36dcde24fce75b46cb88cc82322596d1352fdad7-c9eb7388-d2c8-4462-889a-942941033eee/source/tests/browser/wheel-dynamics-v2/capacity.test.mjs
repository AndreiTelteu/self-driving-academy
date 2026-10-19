// UNEXECUTED capacity authoring. Uses real archived native schema, never constructs a world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { splitPayload, LOGICAL_BYTES, PART_BYTES, MAX_PARTS } from './parts.mjs';
import { EVIDENCE_BODY_LIMIT_BYTES } from './transport.mjs';
const widest = -1.7976931348623157e308;
function worstNumeric(value) {
  if (typeof value === 'number') return widest;
  if (Array.isArray(value)) return value.map(worstNumeric);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, worstNumeric(item)]),
    );
  return value;
}
const boundedError = '\ud800'.repeat(1024); // JSON escapes each lone surrogate to six ASCII bytes.
const causes = Array.from({ length: 128 }, () => ({
  stage: 'x'.repeat(128),
  error: boundedError,
  omittedCodeUnits: Number.MAX_SAFE_INTEGER,
  at: widest,
}));
const journal = Array.from({ length: 4096 }, () => ({
  kind: 'event',
  at: widest,
  detail: 'x'.repeat(1980),
}));
const binding = {
  captureId: 'a'.repeat(36),
  protocol: '026-wheel-dynamics-v2-source-ownership-1',
  sourceHash: 'b'.repeat(64),
  artifactHash: 'c'.repeat(64),
  browser: boundedError,
};
function proveLossless(dto, label) {
  const bytes = Buffer.from(JSON.stringify(dto)),
    parts = splitPayload(bytes);
  assert(bytes.length <= LOGICAL_BYTES);
  assert(parts.length <= MAX_PARTS);
  assert.deepEqual(Buffer.concat(parts.map((part) => Buffer.from(part))), bytes);
  let maximumRequestBytes = 0;
  for (const [index, part] of parts.entries()) {
    const body = {
      operation: 'part',
      name: 'terminal',
      binding,
      index,
      base64: Buffer.from(part).toString('base64'),
    };
    const requestBytes = Buffer.byteLength(JSON.stringify(body));
    maximumRequestBytes = Math.max(maximumRequestBytes, requestBytes);
    assert(requestBytes <= EVIDENCE_BODY_LIMIT_BYTES);
  }
  console.log(
    JSON.stringify({
      sizing: label,
      logicalBytes: bytes.length,
      parts: parts.length,
      maximumRequestBytes,
      logicalLimit: LOGICAL_BYTES,
      requestLimit: EVIDENCE_BODY_LIMIT_BYTES,
    }),
  );
  return bytes.length;
}
test('exact native maximum8 curves, escaped causes, finite journals and maximal raw use lossless parts under unchanged4MiB/request', async () => {
  const historical = JSON.parse(
    await readFile('Docs/Evidence/026-wheel-dynamics/calibration-v2.json', 'utf8'),
  ).runs.filter((run) => run.speedMps === 20 && ['braking', 'turning'].includes(run.scenario));
  assert.equal(historical.length, 8);
  const calibration = historical.map((run) => ({
    ...worstNumeric(run),
    curve: Array.from({ length: run.scenario === 'braking' ? 300 : 30 }, () =>
      worstNumeric(run.curve[0]),
    ),
  }));
  const channels = Object.fromEntries(
    ['frame', 'main', 'tick', 'projection', 'step'].map((key) => [key, Array(30000).fill(widest)]),
  );
  const raw = {
    binding,
    armIndex: 9,
    frames: 30000,
    ticks: 30000,
    channels,
    lifetime: { causes, journal },
    longTaskEntries: Array.from({ length: 4096 }, () => ({ startTime: widest, duration: widest })),
  };
  assert(
    Buffer.byteLength(JSON.stringify(raw)) > EVIDENCE_BODY_LIMIT_BYTES,
    'Single-envelope4MiB impossibility must remain explicit',
  );
  proveLossless(raw, 'raw');
  const terminal = {
    binding,
    report: {
      calibration,
      runs: Array.from({ length: 10 }, () => ({
        stats: worstNumeric({ frame: { p50: 1, p95: 1, p99: 1, max: 1, count: 30000 } }),
        memory: { wheelMeshes: 280, chassisMeshes: 70, worlds: 1 },
      })),
    },
    lifetime: { causes, journal },
    state: 'INCOMPLETE',
  };
  proveLossless(terminal, 'terminal');
  proveLossless(
    { binding, primaryTerminal: terminal, exportCauses: causes, state: 'FAILED_UNKNOWN' },
    'terminal-error',
  );
  assert.throws(() => splitPayload(new Uint8Array(LOGICAL_BYTES + 1)), /capacity exceeded/);
  assert.equal(PART_BYTES, 512 * 1024);
  assert.equal(EVIDENCE_BODY_LIMIT_BYTES, 4 * 1024 * 1024);
});
test('>9000 RAF frames update finite counters/last trigger, no per-frame append to4096 event journal', async () => {
  const { CaptureLifetime } = await import('./lifetime.mjs');
  let time = 0,
    callback,
    activeTimers = 0;
  const life = new CaptureLifetime({
    now: () => time,
    foreground: () => true,
    requestRaf: (cb) => {
      callback = cb;
      return 1;
    },
    cancelRaf: () => {},
    setTimer: () => {
      activeTimers++;
      return 2;
    },
    clearTimer: () => {
      activeTimers--;
    },
  });
  for (let i = 0; i < 10000; i++) {
    const frame = life.nextFrame(() => ({ tick: i, nativeCount: i, renderCount: i }));
    time += 16;
    callback(time);
    await frame;
  }
  assert.equal(life.snapshot().scheduling.callbacks, 10000);
  assert.equal(life.journal.length, 0);
  assert.equal(life.overflow, 0);
  assert.equal(activeTimers, 0);
});
