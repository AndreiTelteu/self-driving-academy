import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyQueries, distribution } from '../browser/service-zones/verify-query-records.mjs';
import { failureInfo } from '../browser/service-zones/failure-info.mjs';
function fixture() {
  return {
    count: 70,
    queries: Array.from({ length: 130 }, (_, i) => {
      const tick = 1 + i * 6,
        identity = { entityId: 'car-' + (i % 70), handle: i % 70, generation: 1 };
      const blocked = Math.floor(i / 2) % 2;
      const transform = {
        positionM: { x: 0, y: 0.8, z: blocked ? -5 : -12 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      };
      const before = {
        identity,
        physicsStepSerial: tick,
        transform,
        velocityMps: { x: 0, y: 0, z: 0 },
        angularVelocityRadS: { x: 0, y: 0, z: 0 },
      };
      return {
        tick,
        identity,
        anchorId: blocked ? 'point-blocked' : 'point-safe',
        transform,
        before,
        after: structuredClone(before),
        inspection: {
          status: blocked ? 'BLOCKED' : 'SAFE',
          physicsStepSerial: tick,
          colliderCount: 139,
          blockingColliderHandle: blocked ? 120 : null,
        },
      };
    }),
  };
}
test('Complete cohort is accepted; lost query cannot hide in summaries', () => {
  verifyQueries(fixture());
  const row = fixture();
  row.queries.splice(57, 1);
  assert.throws(() => verifyQueries(row));
});
test('Readonly proof rejects native movement and stale serial independently', () => {
  for (const mutate of [
    (r) => r.queries[50].after.transform.positionM.x++,
    (r) => r.queries[50].inspection.physicsStepSerial--,
  ]) {
    const r = fixture();
    mutate(r);
    assert.throws(() => verifyQueries(r));
  }
});
test('Unknown outcome, changed anchor and nonfinite native readback fail', () => {
  for (const mutate of [
    (r) => (r.queries[20].inspection.status = 'ASSUMED_SAFE'),
    (r) => (r.queries[20].transform.positionM.z = 0),
    (r) => (r.queries[20].before.velocityMps.x = NaN),
  ]) {
    const r = fixture();
    mutate(r);
    assert.throws(() => verifyQueries(r));
  }
});
test('Raw timing recomputation retains outlier and rejects invalid samples', () => {
  const raw = Array.from({ length: 600 }, (_, i) => i);
  assert.deepEqual(distribution(raw), { p50: 299, p95: 569, p99: 593 });
  assert.throws(() => distribution([...raw, -1]));
  assert.throws(() => distribution([...raw, NaN]));
});
test('All-support-denial or short collider traversal cannot masquerade as query coverage', () => {
  for (const mutate of [
    (r) =>
      r.queries.forEach((q) => {
        q.inspection.status = 'INVALID_SUPPORT';
        q.inspection.colliderCount = 0;
      }),
    (r) => r.queries[44].inspection.colliderCount--,
  ]) {
    const r = fixture();
    mutate(r);
    assert.throws(() => verifyQueries(r));
  }
});
test('Swapped outcomes and false blocker evidence fail anchor identity binding', () => {
  for (const mutate of [
    (r) => {
      r.queries[44].inspection.status = 'BLOCKED';
      r.queries[44].inspection.blockingColliderHandle = 123;
    },
    (r) => (r.queries[46].inspection.blockingColliderHandle = null),
    (r) => (r.queries[44].inspection.blockingColliderHandle = 123),
  ]) {
    const r = fixture();
    mutate(r);
    assert.throws(() => verifyQueries(r));
  }
});
test('Cold Error messages and aggregate causes survive without hostile hooks', () => {
  let hooks = 0;
  const error = new Error('actual failure');
  Object.defineProperty(error, 'name', {
    get() {
      hooks++;
      throw Error('hook');
    },
  });
  assert.equal(failureInfo(error).message, 'actual failure');
  const proxy = new Proxy(error, {
    get() {
      hooks++;
      throw Error('proxy');
    },
    ownKeys() {
      hooks++;
      throw Error('proxy');
    },
    getPrototypeOf() {
      hooks++;
      throw Error('proxy');
    },
  });
  assert.equal(failureInfo(proxy).message, 'Opaque thrown value');
  const outer = failureInfo(new AggregateError([error, 'cleanup failed'], 'original aggregate'));
  assert.equal(outer.message, 'original aggregate');
  assert.deepEqual(
    outer.causes.map((x) => x.message),
    ['actual failure', 'cleanup failed'],
  );
  assert.equal(hooks, 0);
});
