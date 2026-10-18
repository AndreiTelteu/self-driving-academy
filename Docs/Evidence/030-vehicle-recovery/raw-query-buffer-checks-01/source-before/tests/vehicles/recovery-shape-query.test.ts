import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withRecoveryShapeQuery } from '../../src/vehicles/rapier/recovery-shape-query';

function fixture(options: { allocationFailsAt?: number; cleanupFails?: boolean; queryFailure?: Error } = {}) {
  const acquired: string[] = [], freed: string[] = [], handles: number[] = [];
  const primary = new Error('actual injected acquisition cause');
  const cleanupErrors = ['position', 'rotation', 'shape'].map(name => new Error('free ' + name));
  const resources = ['position', 'rotation', 'shape'].map((name, index) => ({ name,
    free(): void {
      assert.equal(this, resources[index]);
      freed.push(name);
      if (options.cleanupFails) throw cleanupErrors[index];
    },
  }));
  let attempts = 0;
  const acquire = (index: number) => {
    attempts++;
    if (attempts === options.allocationFailsAt) throw primary;
    acquired.push(resources[index]!.name);
    return resources[index]!;
  };
  const ports = {
    position: () => acquire(0), rotation: () => acquire(1), shape: () => acquire(2),
    intersects(handle: number, position: typeof resources[number], rotation: typeof resources[number], shape: typeof resources[number]) {
      assert.equal(position, resources[0]); assert.equal(rotation, resources[1]); assert.equal(shape, resources[2]);
      handles.push(handle);
      if (handle === 7 && options.queryFailure) throw options.queryFailure;
      return handle === 8;
    },
  };
  return { ports, acquired, freed, handles, primary, cleanupErrors, attempts: () => attempts };
}

test('no eligible collider allocates nothing; all queried handles share only three once-freed buffers', () => {
  const none = fixture();
  assert.equal(withRecoveryShapeQuery(none.ports, () => 12), 12);
  assert.equal(none.attempts(), 0); assert.deepEqual(none.freed, []);
  const f = fixture();
  let retained: ((handle: number) => boolean) | undefined;
  assert.deepEqual(withRecoveryShapeQuery(f.ports, query => {
    retained = query; return [7, 8, 9].map(query);
  }), [false, true, false]);
  assert.equal(f.attempts(), 3); assert.deepEqual(f.handles, [7, 8, 9]);
  assert.deepEqual(f.freed, ['position', 'rotation', 'shape']);
  assert.throws(() => retained!(7), /query closed/); assert.deepEqual(f.handles, [7, 8, 9]);
});

test('each failed conversion owns every previously acquired buffer and preserves exact original cause without per-handle retry', () => {
  for (const allocationFailsAt of [1, 2, 3]) {
    const f = fixture({ allocationFailsAt });
    const visited: number[] = [];
    assert.throws(() => withRecoveryShapeQuery(f.ports, query => {
      for (const handle of [7, 8, 9]) {
        visited.push(handle);
        assert.throws(() => query(handle), error => error === f.primary);
      }
      return true; // Swallowing callback failures must not turn failed acquisition into success.
    }), error => error === f.primary);
    assert.equal(f.attempts(), allocationFailsAt);
    assert.deepEqual(f.freed, f.acquired); assert.deepEqual(f.handles, []);
    assert.deepEqual(visited, [7, 8, 9]);
  }
});

test('partial acquisition plus independent free failures retains original and every cleanup identity once', () => {
  const f = fixture({ allocationFailsAt: 3, cleanupFails: true });
  assert.throws(() => withRecoveryShapeQuery(f.ports, query => query(7)), error => {
    assert(error instanceof AggregateError);
    assert.deepEqual(error.errors, [f.primary, ...f.cleanupErrors.slice(0, 2)]);
    return true;
  });
  assert.deepEqual(f.freed, ['position', 'rotation']); assert.deepEqual(f.handles, []);
});

test('native query failure is deferred through full callback traversal and all frees preserve original plus cleanup causes', () => {
  const nativeFailure = new Error('injected native intersection failure');
  const f = fixture({ queryFailure: nativeFailure, cleanupFails: true });
  assert.throws(() => withRecoveryShapeQuery(f.ports, query => {
    let failure: unknown;
    for (const handle of [7, 8, 9]) {
      try { query(handle); } catch (error) { failure ??= error; }
    }
    throw failure;
  }), error => {
    assert(error instanceof AggregateError); assert.deepEqual(error.errors, [nativeFailure, ...f.cleanupErrors]); return true;
  });
  assert.deepEqual(f.handles, [7, 8, 9]); assert.deepEqual(f.freed, ['position', 'rotation', 'shape']);
});

test('post-query fence failure remains exact; successful work cannot hide throwing cleanup', () => {
  const fence = new Error('post-query native serial changed');
  const f = fixture();
  assert.throws(() => withRecoveryShapeQuery(f.ports, query => { query(8); throw fence; }), error => error === fence);
  assert.deepEqual(f.freed, ['position', 'rotation', 'shape']);
  const g = fixture({ cleanupFails: true });
  assert.throws(() => withRecoveryShapeQuery(g.ports, query => query(8)), error => {
    assert(error instanceof AggregateError); assert.deepEqual(error.errors, g.cleanupErrors); return true;
  });
  assert.deepEqual(g.freed, ['position', 'rotation', 'shape']);
});
