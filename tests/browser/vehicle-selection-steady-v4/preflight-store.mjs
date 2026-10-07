import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateLifecycle } from '../../../Docs/Evidence/068-vehicle-switch/lifecycle-checks-v4.mjs';
export const PREFLIGHT_CAP = 131072;
export function createPreflightStore(root, identity) {
  const attempts = new Map();
  const renderer = (b) => (b === 'AUTO' ? 'WEBGPU' : b === 'WEBGL2' ? 'WEBGL2' : null);
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  async function reject(a, cause) {
    const filename = a ? 'rejected.json' : 'preflight-invalid-rejected.json';
    await writeFile(
      a ? join(a.folder, filename) : join(root, filename),
      JSON.stringify({
        status: 'REJECTED',
        incomplete: true,
        captureId: a?.captureId ?? null,
        expectedOrdinal: a?.next ?? 0,
        reason: String(cause).slice(0, 1024),
      }),
      { flag: 'wx' },
    ).catch((error) => {
      if (error.code !== 'EEXIST') throw error;
    });
    if (a) a.failed = true;
  }
  return {
    requireBothPassed() {
      assert.deepEqual([...attempts.keys()].sort(), ['WEBGL2', 'WEBGPU']);
      for (const a of attempts.values())
        assert.ok(
          a.terminal && !a.failed && a.next === 20,
          'BOTH lifecycle preflight PASS required before FULL',
        );
    },
    async start(value) {
      const kind = renderer(value.requestedBackend);
      assert.ok(kind && Number.isFinite(Date.parse(value.startedAt)));
      assert.equal(attempts.has(kind), false);
      const captureId = identity.sourceHash + '-preflight-' + kind.toLowerCase(),
        folder = join(root, captureId);
      await mkdir(folder);
      const a = {
        folder,
        captureId,
        renderer: kind,
        requestedBackend: value.requestedBackend,
        startedAt: value.startedAt,
        createdAt: new Date().toISOString(),
        next: 0,
        failed: false,
        parts: [],
        terminal: false,
      };
      attempts.set(kind, a);
      await writeFile(
        join(folder, 'started.json'),
        JSON.stringify({
          status: 'STARTED',
          scope: 'LIFECYCLE_PREFLIGHT_ONLY',
          captureId,
          renderer: kind,
          requestedBackend: value.requestedBackend,
          sourceHash: identity.sourceHash,
          artifactHash: identity.artifactHash,
          startedAt: value.startedAt,
          createdAt: a.createdAt,
        }),
        { flag: 'wx' },
      );
      return {
        captureId,
        sourceHash: identity.sourceHash,
        artifactHash: identity.artifactHash,
        renderer: kind,
      };
    },
    async cycle(value, raw) {
      const a = attempts.get(renderer(value.requestedBackend));
      try {
        assert.ok(a && !a.terminal && !a.failed);
        assert.equal(value.captureId, a.captureId);
        assert.ok(raw.length <= PREFLIGHT_CAP);
        assert.deepEqual(JSON.parse(raw.toString('utf8')), value);
        assert.equal(value.ordinal, a.next);
        assert.ok(a.next < 20);
        const filename = 'cycle-' + a.next + '-part-0.json';
        await writeFile(join(a.folder, filename), raw, { flag: 'wx' });
        a.parts.push({ ordinal: a.next, filename, bytes: raw.length, sha256: sha(raw) });
        validateLifecycle(value.record, a.next, a.renderer);
        a.next++;
        return { captureId: a.captureId, ordinal: value.ordinal, sha256: sha(raw), accepted: true };
      } catch (error) {
        if (a && !a.terminal) {
          if (!a.parts.some((p) => p.ordinal === a.next))
            await writeFile(join(a.folder, 'cycle-' + a.next + '-rejected-raw.json'), raw, {
              flag: 'wx',
            });
          await reject(a, error);
        }
        throw error;
      }
    },
    async finish(value, raw) {
      const a = attempts.get(renderer(value.requestedBackend));
      assert.ok(a && !a.terminal);
      assert.equal(value.captureId, a.captureId);
      assert.ok(raw.length <= PREFLIGHT_CAP);
      assert.deepEqual(JSON.parse(raw.toString('utf8')), value);
      const pass =
        value.status === 'PASS' &&
        !a.failed &&
        a.next === 20 &&
        value.cycles === 20 &&
        value.worldsCreated === 20 &&
        value.listeners === 0 &&
        value.foreground === true &&
        value.invalidated === null &&
        Array.isArray(value.causes) &&
        value.causes.length === 0 &&
        value.startedAt === a.startedAt &&
        value.renderer === a.renderer &&
        value.sourceHash === identity.sourceHash &&
        value.artifactHash === identity.artifactHash &&
        Number.isFinite(Date.parse(value.createdAt)) &&
        Date.parse(value.createdAt) >= Date.parse(a.createdAt) &&
        value.scope === 'PREFLIGHT_ONLY_NOT_FULL_ACCEPTANCE';
      const filename = pass ? 'report.json' : 'failure.json';
      await writeFile(join(a.folder, filename), raw, { flag: 'wx' });
      await writeFile(
        join(a.folder, 'terminal.json'),
        JSON.stringify({
          status: pass ? 'PASS' : 'FAILED',
          incomplete: !pass,
          captureId: a.captureId,
          createdAt: new Date().toISOString(),
          sourceHash: identity.sourceHash,
          artifactHash: identity.artifactHash,
          parts: a.parts,
          filename,
          bytes: raw.length,
          sha256: sha(raw),
        }),
        { flag: 'wx' },
      );
      a.terminal = true;
      if (!pass) a.failed = true;
      if (!pass) throw Error('Lifecycle preflight incomplete/failed preserved');
      return { accepted: true, captureId: a.captureId };
    },
    async rejected(backend, error) {
      const a = attempts.get(renderer(backend));
      if (!a?.terminal) await reject(a, error);
    },
  };
}
