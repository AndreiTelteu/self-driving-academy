// Source-only reviewed before execution; node --import register-typescript required.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function safePath(base, path) {
  assert(
    typeof path === 'string' &&
      path.length <= 512 &&
      !path.includes('..') &&
      !path.includes('\\') &&
      !path.includes(':') &&
      !path.startsWith('/'),
  );
  const target = resolve(base, path);
  assert(target.startsWith(resolve(base) + '/') || target.startsWith(resolve(base) + '\\'));
  return target;
}
export async function verifyBuild(manifestPath, historical = false) {
  const m = JSON.parse(await readFile(manifestPath));
  assert.equal(m.version, '030-frozen-after-v1');
  assert.equal(m.commit, 'ad32db9c609cce1132669c95312ae202a62b87ed');
  for (const path of [
    m.archiveRoot,
    m.artifactRoot,
    m.captureRoot,
    m.functionalRoot,
    m.nativeArchivePath,
    m.zip.path,
  ])
    safePath('.', path);
  assert(Number.isFinite(Date.parse(m.archivedAt)));
  const sourcePaths = m.inputs
    .filter((i) => i.path.startsWith('src/'))
    .map((i) => i.path)
    .sort();
  assert(new Set(sourcePaths).size === sourcePaths.length);
  for (const p of [
    'src/vehicles/recovery-state.ts',
    'src/vehicles/recovery-road.ts',
    'src/app/vehicle-recovery.ts',
    'src/input/recovery-input.ts',
  ])
    assert(sourcePaths.includes(p));
  if (!historical) {
    const actual = execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' })
      .trim()
      .split(/\r?\n/)
      .map((p) => p.replaceAll('\\', '/'))
      .sort();
    assert.deepEqual(sourcePaths, actual, 'Complete actual CURRENT source closure');
  }
  const expected = [];
  for (const [root, rows, key] of [
    [m.archiveRoot, m.inputs, 'sourceHash'],
    [m.artifactRoot, m.artifacts, 'artifactHash'],
  ]) {
    const aggregate = createHash('sha256'),
      seen = new Set();
    for (const row of rows) {
      assert(!seen.has(row.path));
      seen.add(row.path);
      const bytes = await readFile(safePath(root, row.path));
      assert.equal(bytes.length, row.bytes);
      assert.equal(hash(bytes), row.sha256);
      aggregate.update(row.path).update(bytes);
      expected.push({
        path: (key === 'sourceHash' ? 'source/' : 'artifacts/') + row.path,
        bytes: row.bytes,
        sha256: row.sha256,
      });
      if (key === 'sourceHash') {
        if (!historical)
          assert.equal(hash(await readFile(row.path)), row.sha256, 'Current bytes ' + row.path);
      }
    }
    assert.equal(aggregate.digest('hex'), m[key]);
  }
  for (const p of [
    'tests/browser/vehicle-recovery-after/functional-runtime.ts',
    'tests/browser/vehicle-recovery-after/functional-native-instrumentation.ts',
    'tests/browser/vehicle-recovery-after/functional-callback.ts',
    'tests/browser/vehicle-recovery-after/functional-proof.ts',
    'tests/browser/vehicle-recovery-after/functional-store.mjs',
    'tests/browser/vehicle-recovery-after/functional-http.mjs',
    'tests/browser/vehicle-recovery-after/verify-functional.mjs',
    'tests/vehicles/recovery-after-functional.test.mjs',
    'tests/vehicles/recovery-support-calibration.test.ts',
    'tests/input/recovery-input.test.ts',
    'tests/browser/vehicle-recovery-after/browser-observation.ts',
    'tests/browser/vehicle-recovery-after/browser-http.mjs',
    'tests/browser/vehicle-recovery-after/verify-browser-set.mjs',
    'tests/vehicles/recovery-after-browser-observation.test.mjs',
    'tests/vehicles/recovery-after-browser-boundaries.test.mjs',
    'tests/browser/vehicle-recovery-after/browser-entry.ts',
    'tests/browser/vehicle-recovery-after/browser-workload.ts',
    'tests/browser/vehicle-recovery-after/browser-proof.ts',
    'tests/browser/vehicle-recovery-after/browser-store.mjs',
    'tests/browser/vehicle-recovery-after/browser-server.mjs',
    'tests/browser/vehicle-recovery-after/verify-browser.mjs',
    'tests/browser/vehicle-recovery-after/road-fixture.ts',
    'tests/browser/vehicle-damage/hardware-collector.ts',
    'tests/browser/vehicle-damage/hardware-lifetime.ts',
    'tests/browser/vehicle-recovery-after/browser.html',
    'tests/browser/vehicle-recovery-after/prepare-browser-build.mjs',
  ])
    assert(
      m.inputs.some((i) => i.path === p),
      'Complete browser helper ' + p,
    );
  const native = await readFile(m.nativeArchivePath);
  assert.equal(native.length, m.nativeBytes);
  assert.equal(hash(native), m.nativeHash);
  expected.push({ path: 'native/rapier.mjs', bytes: m.nativeBytes, sha256: m.nativeHash });
  if (!historical) assert.equal(hash(await readFile(m.nativePath)), m.nativeHash);
  const zip = await readFile(m.zip.path);
  assert.equal(zip.length, m.zip.bytes);
  assert.equal(hash(zip), m.zip.sha256);
  const zipPath = resolve(m.zip.path).replaceAll("'", "''");
  const script = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('${zipPath}'); try { $rows=@(); foreach($e in $z.Entries){if($e.Name -eq ''){continue}; $stream=$e.Open();try{$h=[Security.Cryptography.SHA256]::Create();try{$digest=[BitConverter]::ToString($h.ComputeHash($stream)).Replace('-','').ToLower();$rows+=@{path=$e.FullName.Replace('\\','/');bytes=$e.Length;sha256=$digest}}finally{$h.Dispose()}}finally{$stream.Dispose()}};ConvertTo-Json -Depth 5 -Compress -InputObject $rows } finally {$z.Dispose()}`;
  const entries = JSON.parse(
    execFileSync('powershell', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    }),
  );
  assert.deepEqual(
    entries.sort((a, b) => a.path.localeCompare(b.path)),
    expected.sort((a, b) => a.path.localeCompare(b.path)),
    'WholeZIP raw entry identity',
  );
  return m;
}
export async function createStore(build) {
  const sessions = new Map();
  const captureRoot = build.captureRoot;
  const save = async (folder, name, data) => {
    const bytes = Buffer.from(JSON.stringify(data));
    assert(bytes.length <= 128 * 1024);
    await writeFile(safePath(folder, name), bytes, { flag: 'wx' });
    return hash(bytes);
  };
  const reject = async (captureId, operation, error, metadata = {}) => {
    const s = sessions.get(captureId);
    assert(s, 'Knownrejectedcapture');
    s.failed = true;
    const n = s.rejectCount ?? 0;
    assert(n < 16, 'Boundedrejectedmarkerledger');
    s.rejectCount = n + 1;
    const prefix = 'rejected-' + String(n).padStart(2, '0');
    let raw = null;
    if (metadata.raw !== undefined) {
      const bytes = Buffer.from(JSON.stringify(metadata.raw));
      assert(bytes.length <= 128 * 1024, 'Boundedrejectedraw');
      raw = {
        path: prefix + '-raw.json',
        bytes: bytes.length,
        sha256: await save(s.folder, prefix + '-raw.json', metadata.raw),
      };
    }
    await save(s.folder, prefix + '.json', {
      captureId,
      operation: String(operation).slice(0, 64),
      ordinal: s.ordinal,
      rejectedAt: new Date().toISOString(),
      error: String(error).slice(0, 4096),
      raw,
      metadata: {
        partId: typeof metadata.partId === 'string' ? metadata.partId.slice(0, 128) : null,
        requestBytes: metadata.requestBytes ?? null,
      },
    });
  };
  return {
    reject,
    async start(preference) {
      assert(['AUTO', 'WEBGL2'].includes(preference));
      assert(sessions.size < 2, 'At most two backend captures/server; no automatic retries');
      const backend = preference === 'AUTO' ? 'WEBGPU' : 'WEBGL2';
      const existing = await readdir(captureRoot);
      assert(existing.length < 2, 'Immutablebackendattemptcapacity');
      for (const name of existing) {
        assert(/^[0-9TZ]{10,40}$/.test(name), 'Unexpectedcapturerootentry');
        const prior = JSON.parse(
          await readFile(safePath(safePath(captureRoot, name), 'started.json')),
        );
        assert(prior.backend !== backend, 'Thisbackendalreadyattemptedinarchive');
      }
      assert(
        ![...sessions.values()].some((s) => s.backend === backend),
        'Backend alreadyattempted',
      );
      const captureId = new Date().toISOString().replace(/[^0-9TZ]/g, '');
      const folder = safePath(captureRoot, captureId);
      await mkdir(folder, { recursive: false });
      const s = {
        captureId,
        backend,
        folder,
        ordinal: 0,
        parts: new Map(),
        digests: new Map(),
        active: null,
        failed: false,
      };
      sessions.set(captureId, s);
      await save(folder, 'started.json', {
        captureId,
        backend,
        preference,
        build: {
          sourceHash: build.sourceHash,
          artifactHash: build.artifactHash,
          nativeHash: build.nativeHash,
        },
        startedAt: new Date().toISOString(),
      });
      return { captureId, backend };
    },
    async receive(captureId, operation, data) {
      assert(/^[0-9TZ]{10,40}$/.test(captureId));
      const s = sessions.get(captureId);
      assert(s, 'Knowncapture');
      assert(!s.busy, 'Capturewrite alreadybusy');
      s.busy = true;
      try {
        if (operation === 'failure') {
          assert(['RUN', 'BACKEND'].includes(data.stage));
          s.failed = true;
          await save(s.folder, 'failure-' + data.stage.toLowerCase() + '.json', {
            ...data,
            failedAt: new Date().toISOString(),
            ordinal: s.ordinal,
            parts: [...s.parts.keys()],
          });
          return { failed: true };
        }
        assert(!s.failed, 'Terminalfailedcapture');
        const identity = data.identity ?? data.part?.identity;
        const valid = () => {
          assert(s.ordinal < 10, 'Maximum10canonicalruns');
          assert(
            identity &&
              identity.captureId === captureId &&
              identity.backend === s.backend &&
              identity.runOrdinal === s.ordinal &&
              identity.arm === 'CURRENT_030',
          );
          assert.equal(identity.sourceHash, build.sourceHash);
          assert.equal(identity.artifactHash, build.artifactHash);
          assert.equal(identity.nativeHash, build.nativeHash);
          const pair = Math.floor(s.ordinal / 2);
          assert.equal(identity.pair, pair);
          assert.equal(identity.observer, pair % 2 ? s.ordinal % 2 === 0 : s.ordinal % 2 === 1);
        };
        if (operation === 'run-start') {
          valid();
          assert(s.active === null);
          s.active = identity;
          await save(s.folder, `run-${String(s.ordinal).padStart(2, '0')}-started.json`, data);
          return { runOrdinal: s.ordinal };
        }
        if (operation === 'part') {
          valid();
          assert(s.active);
          assert(s.parts.size < 16);
          assert(
            /^run-[0-9]{2}-(frameIntervalMs|mainThreadFrameMs|controllerTickMs|rapierStepMs|nativeControllerMs|nativeQueryMs|nativeBridgeMs|drivetrainStageMs|renderCpuMs|inputCommandLatencyMs|gpuDurationMs|trace|heap)$/.test(
              data.partId,
            ),
          );
          assert(data.partId.startsWith(`run-${String(s.ordinal).padStart(2, '0')}-`));
          assert(!s.parts.has(data.partId));
          const digest = await save(s.folder, data.partId + '.json', data.part);
          s.parts.set(data.partId, data.part);
          s.digests.set(data.partId, digest);
          return { partId: data.partId, sha256: digest };
        }
        if (operation === 'run-submitted') {
          valid();
          assert(s.active);
          await save(s.folder, `run-${String(s.ordinal).padStart(2, '0')}-submitted.json`, data);
          return { saved: true };
        }
        if (operation === 'run-raw') {
          valid();
          assert(s.active);
          assert.deepEqual(data.parts, [...s.parts.keys()]);
          await save(s.folder, `run-${String(s.ordinal).padStart(2, '0')}-raw.json`, data);
          return { saved: true };
        }
        if (operation === 'run-complete') {
          valid();
          const run = JSON.parse(
            await readFile(
              safePath(s.folder, `run-${String(s.ordinal).padStart(2, '0')}-raw.json`),
            ),
          );
          const { verifyRun } = await import('./browser-proof.ts');
          const verdict = verifyRun(run, [...s.parts.values()], build);
          await save(s.folder, `run-${String(s.ordinal).padStart(2, '0')}-complete.json`, {
            identity,
            verdict,
            partHashes: [...s.digests],
            completedAt: new Date().toISOString(),
          });
          s.ordinal++;
          s.active = null;
          s.parts.clear();
          s.digests.clear();
          return { runOrdinal: s.ordinal - 1, verdict };
        }
        if (operation === 'finish') {
          assert(s.ordinal === 10 && s.active === null);
          await save(s.folder, 'complete.json', {
            captureId,
            backend: s.backend,
            runs: 10,
            completedAt: new Date().toISOString(),
            backendCleanup: data.backendCleanup,
            backendOwnership: data.backendOwnership,
            sceneDisposed: data.sceneDisposed,
            scope: 'REFERENCE_BEFORE; optionaltimingNOT_MEASURED; AFTERmemory/relativepending',
          });
          return { complete: true };
        }
        throw Error('Unknownoperation');
      } catch (error) {
        try {
          await reject(captureId, operation, error, { raw: data, partId: data.partId ?? null });
        } catch (exportError) {
          throw Object.assign(
            new AggregateError(
              [error, exportError],
              'Originalrejection/rejectedexportbothpreserved',
            ),
            { evidenceRejected: true },
          );
        }
        throw Object.assign(error, { evidenceRejected: true });
      } finally {
        s.busy = false;
      }
    },
  };
}
