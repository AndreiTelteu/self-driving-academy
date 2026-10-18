import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  YIELD_BROWSER_V4,
  finiteRaw,
  validateTimingArm,
  validateCalibrationArm,
  validateSmokeArm,
  validateCalibrationNative,
  rawDistribution,
} from './protocol.ts';

/** Finite immutable attempt store; no engine, controller or native imports. */
export function yieldBrowserStore(root, build, guard) {
  const states = new Map();
  let queue = Promise.resolve();
  const locked = (action) => {
    const pending = queue.then(action);
    queue = pending.catch(() => undefined);
    return pending;
  };
  const save = async (folder, name, value, limit = 128 * 1024) => {
    const bytes = Buffer.from(JSON.stringify(value));
    assert.ok(bytes.length <= limit, '052 bounded immutable payload');
    await writeFile(resolve(folder, name), bytes, { flag: 'wx' });
  };
  const stateFor = (body) => {
    assert.equal(typeof body.captureId, 'string');
    const state = [...states.values()].find((value) => value.captureId === body.captureId);
    assert.ok(state, '052 unknown capture identity');
    return state;
  };
  const submissionLimit = 4 * 1024 * 1024;
  const envelopeLimit = submissionLimit + 4096;
  const saveSubmitted = async (state, body) => {
    // Authenticated state is already bounded to four backend/mode attempts.
    const bytes = Buffer.from(JSON.stringify(body));
    const parsedRequestSha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length > submissionLimit) {
      const error = new Error('052 submitted arm exceeds4MiB');
      error.parsedRequestBytes = bytes.length;
      error.parsedRequestSha256 = parsedRequestSha256;
      throw error;
    }
    assert.ok(Number.isSafeInteger(body.ordinal) && body.ordinal >= 0 && body.ordinal < 14);
    await save(
      state.folder,
      'submitted-arm-' + body.ordinal + '.json',
      {
        captureId: state.captureId,
        ordinal: body.ordinal,
        receivedAt: new Date().toISOString(),
        parsedRequestBytes: bytes.length,
        parsedRequestSha256,
        request: body,
      },
      envelopeLimit,
    );
  };
  const diagnostic = async (state, error, body) => {
    if (state.diagnostics >= 16) throw new Error('052 bounded submission diagnostics exhausted');
    const ordinal = state.diagnostics++;
    await save(state.folder, 'submission-rejected-' + ordinal + '.json', {
      captureId: state.captureId,
      expectedOrdinal: state.ordinal,
      createdAt: new Date().toISOString(),
      error: String(error).slice(0, 2048),
      submitted: {
        captureId: state.captureId,
        ordinal: Number.isSafeInteger(body.ordinal) ? body.ordinal : null,
      },
      parsedRequestBytes: error.parsedRequestBytes ?? null,
      parsedRequestSha256: error.parsedRequestSha256 ?? null,
    });
  };
  const reject = async (state, error, body) => {
    try {
      await diagnostic(state, error, body);
    } catch (storageError) {
      error = new AggregateError(
        [error, storageError],
        '052 original rejection and diagnostic storage failure',
      );
    }
    if (!state.terminal) {
      state.terminal = 'REJECTED';
      try {
        await save(
          state.folder,
          'rejected.json',
          {
            captureId: state.captureId,
            expectedOrdinal: state.ordinal,
            error: String(error).slice(0, 2048),
            submitted: body,
          },
          128 * 1024,
        );
      } catch (exportError) {
        throw new AggregateError(
          [error, exportError],
          '052 original rejection and storage failure',
        );
      }
    }
    throw error;
  };
  return {
    start: (body) =>
      locked(async () => {
        assert.equal(body.fixtureVersion, YIELD_BROWSER_V4.version);
        assert.equal(body.sourceHash, build.sourceHash);
        assert.ok(['WEBGPU', 'WEBGL2'].includes(body.backend));
        assert.equal(typeof body.full, 'boolean');
        const key = `${body.backend}-${body.full ? 'full' : 'smoke'}`;
        assert.ok(!states.has(key), '052 one attempt per backend/mode; preserve old attempt');
        await guard();
        const captureId = randomUUID();
        const folder = resolve(root, key);
        await mkdir(folder, { recursive: false });
        const state = {
          captureId,
          folder,
          backend: body.backend,
          full: body.full,
          ordinal: 0,
          terminal: null,
          diagnostics: 0,
          parts: [],
          totalParts: 0,
          totalBytes: 0,
        };
        states.set(key, state);
        await save(
          folder,
          'started.json',
          { ...body, captureId, build, startedAt: new Date().toISOString(), status: 'STARTED' },
          4 * 1024 * 1024,
        );
        return { captureId };
      }),
    partial: (body) =>
      locked(async () => {
        const state = stateFor(body);
        try {
          await saveSubmitted(state, body);
          assert.equal(state.terminal, null);
          assert.equal(body.ordinal, state.ordinal);
          assert.equal(body.metadata.status, 'INCOMPLETE');
          state.partial = true;
          state.terminal = 'INCOMPLETE';
          await save(
            state.folder,
            'incomplete-arm-' + state.ordinal + '.json',
            {
              captureId: state.captureId,
              ordinal: state.ordinal,
              createdAt: new Date().toISOString(),
              metadata: body.metadata,
            },
            4 * 1024 * 1024,
          );
          return { captureId: state.captureId };
        } catch (error) {
          return reject(state, error, { captureId: body.captureId, ordinal: body.ordinal });
        }
      }),
    part: (body) =>
      locked(async () => {
        const state = stateFor(body);
        try {
          assert.ok(
            state.terminal === null || (state.terminal === 'INCOMPLETE' && state.partial === true),
            '052 terminal attempt',
          );
          assert.equal(body.ordinal, state.ordinal);
          assert.ok(state.ordinal < 14);
          assert.ok(YIELD_BROWSER_V4.channels.includes(body.channel));
          assert.ok(Number.isSafeInteger(body.part) && body.part >= 0 && body.part < 20);
          finiteRaw(body.numbers, 3000);
          assert.ok(body.numbers.length > 0);
          assert.ok(state.parts.length < 132 && state.totalParts < 1848);
          const matching = state.parts.filter((part) => part.channel === body.channel);
          assert.equal(body.part, matching.length, '052 ordered immutable channel part');
          const channelIndex = YIELD_BROWSER_V4.channels.indexOf(body.channel);
          assert.ok(
            state.parts.every(
              (part) => YIELD_BROWSER_V4.channels.indexOf(part.channel) <= channelIndex,
            ),
            '052 canonical channel order',
          );
          if (matching.length)
            assert.equal(matching.at(-1).count, 3000, '052 premature short part');
          const file = `arm-${state.ordinal}-${body.channel}-${body.part}.json`;
          const bytes = Buffer.from(JSON.stringify(body));
          assert.ok(bytes.length <= 128 * 1024);
          assert.ok(state.totalBytes + bytes.length <= 231 * 1024 * 1024);
          await save(state.folder, file, body);
          state.parts.push({
            channel: body.channel,
            part: body.part,
            count: body.numbers.length,
            file,
            bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          });
          state.totalParts++;
          state.totalBytes += bytes.length;
          return { captureId: state.captureId };
        } catch (error) {
          return reject(state, error, {
            captureId: state.captureId,
            ordinal: body.ordinal,
            channel: body.channel,
            part: body.part,
            numbers:
              Array.isArray(body.numbers) && body.numbers.length <= 3000 ? body.numbers : undefined,
          });
        }
      }),
    arm: (body) =>
      locked(async () => {
        const state = stateFor(body);
        try {
          await saveSubmitted(state, body);
          assert.equal(state.terminal, null);
          assert.equal(body.ordinal, state.ordinal);
          assert.ok(state.ordinal < 14);
          const meta = body.metadata;
          assert.equal(meta.ordinal, state.ordinal);
          assert.deepEqual(
            meta.rawParts,
            state.parts.map(({ channel, part, count }) => ({ channel, part, count })),
          );
          const raw = Object.fromEntries(YIELD_BROWSER_V4.channels.map((channel) => [channel, []]));
          for (const part of state.parts)
            raw[part.channel].push(
              ...JSON.parse(await readFile(resolve(state.folder, part.file), 'utf8')).numbers,
            );
          if (state.ordinal < 4) {
            assert.equal(meta.current, true);
            assert.equal(meta.classId, state.ordinal < 2 ? 'sedan' : 'compact');
            assert.equal(meta.thresholdS, state.ordinal % 2 ? 3 : 0.2);
            assert.equal(meta.otherDistanceM, 14);
            assert.equal(meta.warmupSeconds, 0);
            assert.equal(meta.measuredSeconds, 13);
            validateCalibrationArm({ ...meta, raw });
            validateCalibrationNative(meta);
            assert.equal(meta.memory.cars, 2);
            for (const channel of ['tick', 'step', 'policy'])
              assert.equal(raw[channel].length, 780);
          } else {
            const offset = state.ordinal - 4,
              pair = Math.floor(offset / 2);
            assert.equal(meta.pair, pair);
            assert.equal(meta.current, pair % 2 ? offset % 2 === 0 : offset % 2 === 1);
            if (state.full) validateTimingArm({ ...meta, raw });
            else validateSmokeArm({ ...meta, raw });
          }
          for (const channel of YIELD_BROWSER_V4.timingChannels)
            assert.deepEqual(rawDistribution(raw[channel]), meta.stats[channel]);
          const file = `arm-${state.ordinal}.json`;
          await save(
            state.folder,
            file,
            { captureId: state.captureId, metadata: meta, parts: state.parts },
            4 * 1024 * 1024,
          );
          state.ordinal++;
          state.parts = [];
          return { captureId: state.captureId };
        } catch (error) {
          return reject(state, error, { captureId: body.captureId, ordinal: body.ordinal });
        }
      }),
    failure: (body) =>
      locked(async () => {
        const state = stateFor(body);
        assert.notEqual(state.terminal, 'FAILED', '052 failure already retained');
        await save(
          state.folder,
          'failure.json',
          {
            ...body,
            completedReport: undefined,
            createdAt: new Date().toISOString(),
            sourceHash: build.sourceHash,
          },
          128 * 1024,
        );
        state.terminal = 'FAILED';
        return { captureId: state.captureId };
      }),
    finish: (body) =>
      locked(async () => {
        const state = stateFor(body);
        try {
          assert.equal(state.terminal, null, '052 failed/rejected attempt cannot finish');
          assert.equal(state.ordinal, 14);
          assert.equal(state.parts.length, 0);
          assert.equal(body.renderer, state.backend);
          assert.equal(body.full, state.full);
          assert.equal(body.identity.sourceHash, build.sourceHash);
          assert.equal(body.artifactHash, build.artifactHash);
          assert.equal(body.fixtureVersion, YIELD_BROWSER_V4.version);
          assert.equal(body.foreground, true);
          assert.equal(body.runs.length, 10);
          assert.equal(body.calibration.length, 4);
          await guard();
          await save(state.folder, 'report.json', body, 4 * 1024 * 1024);
          await save(state.folder, 'terminal.json', {
            captureId: state.captureId,
            status: 'SAVED_PENDING_VERIFICATION',
            arms: 14,
            totalParts: state.totalParts,
            totalBytes: state.totalBytes,
            createdAt: new Date().toISOString(),
          });
          state.terminal = 'SAVED_PENDING_VERIFICATION';
          return { captureId: state.captureId };
        } catch (error) {
          return reject(state, error, { captureId: body.captureId, ordinal: state.ordinal });
        }
      }),
  };
}
