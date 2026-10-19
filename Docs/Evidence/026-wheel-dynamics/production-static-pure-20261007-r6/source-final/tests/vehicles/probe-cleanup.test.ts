import assert from 'node:assert/strict';
import test from 'node:test';
import { createProbeDisposer } from '../../src/vehicles/rapier/probe-cleanup';
import { initializeOwnedWorld } from '../../src/vehicles/rapier/world-ownership';

const order = [
  'collision',
  'boxes',
  'registry',
  'controller:a',
  'controller:b',
  'controller:c',
  'cars',
  'colliders',
  'free',
];

function fixture(failures = new Map<string, unknown>()) {
  const calls: string[] = [];
  const cars = new Map(['a', 'b', 'c'].map((controller) => [controller, { controller }]));
  const boxes = new Map([['box', 1]]);
  let disposed = false;
  let busy = false;
  let reservation = 1;
  let colliders = 3;
  let reenter: (() => void) | undefined;
  let disposer: () => void;
  const assertMutable = () => {
    if (disposed) throw new Error('disposed');
    if (busy) throw new Error('busy');
  };
  const action = (name: string) => {
    assert(disposed, 'invalidation must precede every release');
    assert.throws(assertMutable, /disposed/);
    calls.push(name);
    reenter?.();
    if (failures.has(name)) throw failures.get(name);
  };
  initializeOwnedWorld(
    { free: () => action('free') },
    () => {
      reservation--;
    },
    (freeWorld) => {
      disposer = createProbeDisposer(
        assertMutable,
        () => {
          disposed = true;
        },
        {
          collisionRegistry: { dispose: () => action('collision') },
          namedBoxes: {
            clear: () => {
              boxes.clear();
              action('boxes');
            },
          },
          registry: { dispose: () => action('registry') },
          cars: {
            values: () => cars.values(),
            clear: () => {
              cars.clear();
              action('cars');
            },
          },
          dynamicColliders: {
            get length() {
              return colliders;
            },
            set length(value: number) {
              colliders = value;
              action('colliders');
            },
          },
          removeController: (controller) => action(`controller:${controller}`),
          freeWorld,
        },
      );
    },
  );
  return {
    dispose: () => disposer(),
    enableReentry: () => {
      reenter = () => disposer();
    },
    setBusy: (value: boolean) => {
      busy = value;
    },
    calls,
    cars,
    boxes,
    state: () => ({ disposed, reservation, colliders }),
  };
}

test('normal release preserves order, invalidates before callbacks and fences every reentrant/repeated call', () => {
  const probe = fixture();
  probe.enableReentry();
  probe.dispose();
  probe.dispose();
  assert.deepEqual(probe.calls, order);
  assert.deepEqual(probe.state(), { disposed: true, reservation: 0, colliders: 0 });
  assert.equal(probe.cars.size, 0);
  assert.equal(probe.boxes.size, 0);
});

test('each single owner failure retains the original object and still attempts every controller and world', () => {
  for (const owner of order) {
    const error =
      owner === 'registry'
        ? new AggregateError([new Error('foreign nested')], 'foreign registry failure')
        : new Error(owner);
    const probe = fixture(new Map([[owner, error]]));
    probe.enableReentry();
    assert.throws(probe.dispose, (actual: unknown) => actual === error);
    probe.dispose();
    assert.deepEqual(probe.calls, order, owner);
    assert.deepEqual(probe.state(), {
      disposed: true,
      reservation: owner === 'free' ? 1 : 0,
      colliders: 0,
    });
    assert.equal(probe.cars.size, 0);
    assert.equal(probe.boxes.size, 0);
  }
});

test('all throwing owners retain bounded original causes in attempt order including foreign aggregates', () => {
  const errors = order.map((owner) =>
    owner === 'registry' ? new AggregateError([new Error('nested')], owner) : new Error(owner),
  );
  const probe = fixture(new Map(order.map((owner, i) => [owner, errors[i]])));
  probe.enableReentry();
  assert.throws(probe.dispose, (actual: unknown) => {
    assert(actual instanceof AggregateError);
    assert.equal(actual.errors.length, order.length);
    for (let i = 0; i < errors.length; i++) assert.equal(actual.errors[i], errors[i]);
    return true;
  });
  probe.dispose();
  assert.deepEqual(probe.calls, order);
  assert.equal(probe.state().reservation, 1);
});

test('failed controller removal does not skip later controllers or successful native free/reservation release', () => {
  const first = new Error('first controller');
  const last = new Error('last controller');
  const probe = fixture(
    new Map([
      ['controller:a', first],
      ['controller:c', last],
    ]),
  );
  assert.throws(probe.dispose, (actual: unknown) => {
    assert(actual instanceof AggregateError);
    assert.equal(actual.errors[0], first);
    assert.equal(actual.errors[1], last);
    assert.equal(actual.errors.length, 2);
    return true;
  });
  assert.deepEqual(probe.calls, order);
  assert.equal(probe.state().reservation, 0);
});

test('rejected mutable admission leaves disposal retryable and does not invalidate or release', () => {
  const probe = fixture();
  probe.setBusy(true);
  assert.throws(probe.dispose, /busy/);
  assert.deepEqual(probe.calls, []);
  assert.deepEqual(probe.state(), { disposed: false, reservation: 1, colliders: 3 });
  probe.setBusy(false);
  probe.dispose();
  assert.deepEqual(probe.calls, order);
});
