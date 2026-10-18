import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import {
  serveFrozenArtifact,
  respondFailure,
} from '../browser/vehicle-damage/hardware-static-response';
import {
  createHarnessLifetime,
  awaitOwnedReadiness,
  HarnessFailure,
} from '../browser/vehicle-damage/hardware-lifetime';
import { createFunctionalStore } from '../browser/vehicle-damage/hardware-functional-store';
import type { StoredHardwareBuild } from '../browser/vehicle-damage/hardware-store';
import {
  optionalTimingGate,
  rejectTerminalMarkers,
} from '../browser/vehicle-damage/hardware-verifier';
import { absoluteVerdict } from '../browser/vehicle-damage/hardware-collector';
function response() {
  return {
    headersSent: false,
    status: 0,
    body: undefined as unknown,
    destroyed: false,
    writeHead(status: number) {
      assert.equal(this.headersSent, false);
      this.headersSent = true;
      this.status = status;
      return this;
    },
    end(body: unknown) {
      this.body = body;
      return this;
    },
    destroy() {
      this.destroyed = true;
      return this;
    },
  };
}
test('static missing artifact returns404 before headers and a subsequent response remains valid', async () => {
  const missing = response();
  await serveFrozenArtifact(missing, 'missing.ico', 'image/x-icon', async () => {
    assert.equal(missing.headersSent, false);
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  });
  assert.equal(missing.status, 404);
  const valid = response();
  await serveFrozenArtifact(valid, 'valid.js', 'text/javascript', async () => {
    assert.equal(valid.headersSent, false);
    return new Uint8Array([1, 2]);
  });
  assert.equal(valid.status, 200);
  assert.deepEqual(valid.body, new Uint8Array([1, 2]));
  respondFailure(valid, new Error('socket failed'));
  assert.equal(valid.destroyed, true);
  assert.equal(valid.status, 200);
});
test('actual readiness ownership seam retains primary, all disposal and export failures exactly once', async () => {
  const scope = createHarnessLifetime();
  let releases = 0,
    other = 0,
    ran = false;
  scope.own('backend', () => {
    other++;
    throw new Error('backend release');
  });
  await assert.rejects(async () => {
    await awaitOwnedReadiness(
      scope,
      'workload',
      {},
      () => {
        releases++;
        throw new Error('world release');
      },
      async () => {
        throw new Error('scene readiness');
      },
    );
    ran = true;
  }, HarnessFailure);
  scope.dispose();
  scope.dispose();
  await scope.attempt('export:failure', async () => {
    throw new Error('transport');
  });
  assert.equal(ran, false);
  assert.equal(releases, 1);
  assert.equal(other, 1);
  assert.equal(scope.snapshot().attempted, 2);
  assert.throws(
    () => scope.throwIfFailed(),
    (error) => {
      assert.ok(error instanceof HarnessFailure);
      assert.equal(error.totalCauses, 4);
      for (const name of ['scene readiness', 'world release', 'backend release', 'transport'])
        assert.match(error.message, new RegExp(name));
      return true;
    },
  );
});
test('error retention is bounded without discarding cause counts or repeated owner attempts', () => {
  const scope = createHarnessLifetime();
  for (let i = 0; i < 40; i++) scope.record('primary', `cause-${i}`);
  assert.equal(scope.snapshot().causes.length, 32);
  assert.equal(scope.snapshot().totalCauses, 40);
  assert.equal(scope.snapshot().omittedCauses, 8);
  const owner = scope.own('once', () => {
    throw new Error('once');
  });
  owner();
  owner();
  scope.dispose();
  assert.equal(scope.snapshot().attempted, 1);
  assert.equal(scope.snapshot().totalCauses, 41);
});
test('functional store retains rejected raw actual identity at expected ordinal and becomes terminal', async () => {
  const parent = resolve('.pbi-validation-029/unit-store');
  await mkdir(parent, { recursive: true });
  const folder = await mkdtemp(resolve(parent, 'rejected-'));
  try {
    const store = createFunctionalStore(
      { captureRoot: folder } as StoredHardwareBuild & { captureRoot: string },
      async () => {},
    );
    const begin = await store.start('AUTO');
    const raw = {
      captureId: begin.captureId,
      ordinal: 0,
      result: {
        ordinal: 0,
        classId: 'tampered',
        backend: 'WEBGPU',
        source: 'PLAYER',
        impactSpeedMps: 0,
        scriptedCommands: true,
        passed: true,
      },
    };
    await assert.rejects(store.case(raw), /Actual named case identity/);
    const path = resolve(folder, 'functional', begin.captureId);
    assert.deepEqual(
      JSON.parse(await readFile(resolve(path, 'rejected-case-0.json'), 'utf8')),
      raw,
    );
    assert.deepEqual((await readdir(path)).sort(), [
      'rejected-case-0.json',
      'rejected.json',
      'start.json',
    ]);
    await assert.rejects(store.case(raw), /chronology/);
    await assert.rejects(store.finish({ captureId: begin.captureId }), /Full32/);
  } finally {
    assert.ok(folder.startsWith(parent + sep));
    await rm(folder, { recursive: true, force: true });
  }
});
test('terminal markers reject otherwise complete captures; available optional timing failures dominate missing metrics', () => {
  for (const name of ['failure.json', 'rejected-case-0.json', 'incomplete.json'])
    assert.throws(() => rejectTerminalMarkers(['start.json', 'comparison.json', name]), /Terminal/);
  assert.doesNotThrow(() => rejectTerminalMarkers(['start.json', 'comparison.json']));
  assert.equal(
    optionalTimingGate(
      [
        absoluteVerdict(
          { lower: 12.025, upper: 12.05, upperExclusive: true, rank: 95, observations: 100 },
          12,
        ),
      ],
      true,
    ),
    'FAIL',
  );
  assert.equal(
    optionalTimingGate(
      [
        absoluteVerdict(
          { lower: 50.025, upper: 50.05, upperExclusive: true, rank: 95, observations: 100 },
          50,
        ),
      ],
      false,
    ),
    'FAIL',
  );
  assert.equal(optionalTimingGate(['PASS'], true), 'UNVALIDATED');
  assert.equal(optionalTimingGate(['UNVALIDATED'], false), 'UNVALIDATED');
  assert.equal(optionalTimingGate(['PASS'], false), 'PASS');
});
