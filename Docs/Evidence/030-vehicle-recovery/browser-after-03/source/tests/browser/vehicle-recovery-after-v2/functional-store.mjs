import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hash, safePath } from '../vehicle-recovery-after/browser-store.mjs';
import { FUNCTIONAL, validateFunctional } from '../vehicle-recovery-after/functional-proof.ts';
/** One finite attempt/backend, raw bytes wx BEFORE independent validation. No worlds or listener. */
export async function createFunctionalStore(build) {
  const root = resolve(build.functionalRoot),
    sessions = new Map(),
    backends = new Set();
  let attempts = 0;
  const save = async (s, name, data) =>
    writeFile(safePath(s.folder, name), JSON.stringify(data), { flag: 'wx' });
  const match = (data) => {
    for (const k of ['sourceHash', 'artifactHash', 'nativeHash', 'buildUUID'])
      assert.equal(data[k], build[k]);
  };
  return {
    async start(data) {
      assert(++attempts <= 4, 'Bounded start attempts; rejected attempts remain visible');
      const bytes = Buffer.from(JSON.stringify(data));
      assert(bytes.length <= FUNCTIONAL.reportBytes);
      const captureId = new Date().toISOString().replace(/[^0-9TZ]/g, ''),
        folder = safePath(root, captureId);
      await mkdir(folder, { recursive: false });
      const backend =
        data.preference === 'AUTO' ? 'WEBGPU' : data.preference === 'WEBGL2' ? 'WEBGL2' : 'UNKNOWN';
      const s = { folder, backend, failed: false, busy: false, terminal: false, rejected: false };
      sessions.set(captureId, s);
      await writeFile(safePath(folder, 'start-submitted.json'), bytes, { flag: 'wx' });
      await save(s, 'start-envelope.json', {
        captureId,
        receivedAt: new Date().toISOString(),
        bytes: bytes.length,
        sha256: hash(bytes),
      });
      try {
        assert.deepEqual(
          Object.keys(data).sort(),
          ['preference', 'sourceHash', 'artifactHash', 'nativeHash', 'buildUUID'].sort(),
        );
        match(data);
        assert(['AUTO', 'WEBGL2'].includes(data.preference));
        assert(!backends.has(backend), 'One immutable functional attempt/backend');
        backends.add(backend);
        await save(s, 'started.json', {
          captureId,
          backend,
          startedAt: new Date().toISOString(),
          build: {
            sourceHash: build.sourceHash,
            artifactHash: build.artifactHash,
            nativeHash: build.nativeHash,
            buildUUID: build.buildUUID,
            archivedAt: build.archivedAt,
          },
        });
        return { captureId, backend };
      } catch (error) {
        try {
          await this.reject(captureId, error, { operation: 'start', bytes: bytes.length });
        } catch (exportError) {
          throw new AggregateError([error, exportError], 'Original start/rejection export causes');
        }
        throw error;
      }
    },
    async reject(id, error, request = {}) {
      const s = sessions.get(id);
      assert(s);
      s.failed = true;
      if (!s.rejected) {
        s.rejected = true;
        await save(s, 'rejected.json', {
          captureId: id,
          backend: s.backend,
          failedAt: new Date().toISOString(),
          error: String(error).slice(0, 2048),
          request,
        });
      }
    },
    async receive(id, operation, bytes) {
      const s = sessions.get(id);
      assert(s);
      assert(!s.busy, 'No concurrent functional admission');
      s.busy = true;
      try {
        assert(
          Buffer.isBuffer(bytes) && bytes.length <= FUNCTIONAL.reportBytes,
          '2MiB bounded body',
        );
        if (operation === 'failure') {
          s.failed = true;
          const data = JSON.parse(bytes);
          assert.equal(data.identity.captureId, id);
          match(data.identity);
          await save(s, 'failure.json', data);
          return { failed: true };
        }
        assert.equal(operation, 'report');
        assert(!s.terminal, 'Immutable terminal, no retry');
        s.terminal = true;
        // Preserve original incoming bytes even if JSON/identity/shape/cleanup validation fails.
        await writeFile(safePath(s.folder, 'submitted.json'), bytes, { flag: 'wx' });
        await save(s, 'submitted-envelope.json', {
          captureId: id,
          backend: s.backend,
          receivedAt: new Date().toISOString(),
          bytes: bytes.length,
          sha256: hash(bytes),
        });
        const report = JSON.parse(bytes);
        assert.equal(report.identity.captureId, id);
        assert.equal(report.identity.backend, s.backend);
        match(report.identity);
        assert(!s.failed, 'Failed sibling report cannot be accepted');
        const verdict = validateFunctional(report, build);
        await save(s, 'complete.json', {
          captureId: id,
          backend: s.backend,
          completedAt: new Date().toISOString(),
          sha256: hash(bytes),
          verdict,
        });
        return verdict;
      } catch (error) {
        s.failed = true;
        try {
          await this.reject(id, error, { operation, bytes: bytes.length });
        } catch (exportError) {
          throw new AggregateError(
            [error, exportError],
            'Original validation/rejection export causes',
          );
        }
        throw error;
      } finally {
        s.busy = false;
      }
    },
    async raw(id) {
      const s = sessions.get(id);
      assert(s);
      return readFile(safePath(s.folder, 'submitted.json'));
    },
  };
}
