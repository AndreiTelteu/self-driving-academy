// SOURCE10 draft, ALL UNEXECUTED. Pure injected writers; no capture/native/server imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { causes, recordRun, failTerminal, recordFactoryFailure, recordEvidence }
  from '../../../scripts/wheel-capture-source.mjs';

function adverseValues() {
  const bare = Object.create(null);
  const getters = {};
  for (const key of ['name', 'message', 'stack', 'cause', 'errors', 'toJSON'])
    Object.defineProperty(getters, key, { get() { throw new Error('getter must not run'); } });
  const conversions = { [Symbol.toPrimitive]() { throw new Error('conversion must not run'); },
    toString() { throw new Error('toString must not run'); },
    toJSON() { throw new Error('toJSON must not run'); } };
  const proxy = new Proxy(conversions, {
    get() { throw new Error('proxy get must not run'); },
    getOwnPropertyDescriptor() { throw new Error('hostile descriptor'); },
    getPrototypeOf() { throw new Error('prototype must not run'); },
  });
  const cycle = new Error('cyclic'); cycle.cause = cycle;
  const { proxy: revoked, revoke } = Proxy.revocable({}, {}); revoke();
  const hostileArray = new Proxy([bare], { getOwnPropertyDescriptor() { throw new Error('array descriptor'); } });
  const aggregate = new AggregateError([]); aggregate.errors = hostileArray;
  return [bare, getters, conversions, proxy, cycle, undefined, revoked, aggregate,
    Symbol('unconverted'), 1n, 'x'.repeat(20000)];
}

// Manual settlement observation explicitly distinguishes throw undefined from no throw.
async function rejected(operation, ...expected) {
  let failed = false, value;
  try { await operation(); } catch (error) { failed = true; value = error; if (expected.length) assert.equal(error, expected[0]); }
  assert.equal(failed, true);
  return { failed, value };
}

test('bounded serialization survives arbitrary thrown values and refuses unsafe getters/conversions', () => {
  for (const value of adverseValues()) {
    const dto = causes(value);
    assert.ok(JSON.stringify(dto).length < 600000);
  }
  const unknown = causes(Object.create(null));
  assert.equal(unknown.message.unknown, true);
  assert.equal(causes(undefined).thrownType, 'undefined');
  const long = causes('x'.repeat(20000));
  assert.equal(long.message.text.length, 8192);
  assert.equal(long.message.truncated, true);
  const deep = new Error('root'); let current = deep;
  for (let index = 0; index < 100; index++) { current.cause = new Error('child'); current = current.cause; }
  assert.ok(JSON.stringify(causes(deep)).includes('truncated'));
  const many = causes(new AggregateError(Array.from({ length: 1000 }, () => new Error('x'))));
  assert.equal(many.errorsTruncated, true);
  assert.ok(many.errors.length <= 64);
});

test('hostile measurement/dispose/raw/failure/terminal write values retain exact identities together', async () => {
  const values = adverseValues();
  for (let index = 0; index < values.length; index++) {
    const measurement = values[index], disposal = values[(index + 1) % values.length];
    const raw = values[(index + 2) % values.length], failure = values[(index + 3) % values.length];
    const terminal = values[(index + 4) % values.length], writes = [];
    const writer = async (path, dto) => {
      // Serializer output itself must be safely writable before an injected storage fault.
      writes.push({ path, text: JSON.stringify(dto) });
      throw path === 'raw' ? raw : path === 'failure' ? failure : terminal;
    };
    const pending = (await rejected(() => recordRun('raw', 'failure', { partial: 17 },
      [{ stage: 'measurement', cause: measurement }, { stage: 'dispose', cause: disposal }], writer))).value;
    assert.ok(pending instanceof AggregateError);
    for (const [position, expected] of [measurement, disposal, raw, failure].entries())
      assert.equal(pending.errors[position], expected);
    assert.equal(pending.cause, measurement);
    const final = (await rejected(() => failTerminal('terminal', pending, {}, writer))).value;
    assert.equal(final.errors[0], pending);
    assert.equal(final.errors[1], terminal);
    assert.equal(final.cause, terminal);
    assert.deepEqual(writes.map((write) => write.path), ['raw', 'failure', 'terminal']);
    assert.equal(JSON.parse(writes[1].text).state, 'FAILED');
  }
});

test('factory and ordinary evidence failures preserve original hostile/undefined references', async () => {
  const values = adverseValues();
  for (const [index, primary] of values.entries()) {
    const recording = values[(index + 1) % values.length];
    const writer = async (_path, dto) => { JSON.stringify(dto); throw recording; };
    const factory = (await rejected(() => recordFactoryFailure('factory', primary, writer))).value;
    assert.equal(factory.errors[0], primary);
    assert.equal(factory.errors[1], recording);
    assert.equal(factory.cause, recording);
    const exportFailure = (await rejected(() => recordEvidence('report', { causes: causes(primary) }, [primary], writer))).value;
    assert.equal(exportFailure.errors[0], primary);
    assert.equal(exportFailure.errors[1], recording);
    assert.equal(exportFailure.cause, recording);
    const passWriter = async (_path, dto) => { JSON.stringify(dto); };
    assert.equal((await rejected(() => recordFactoryFailure('factory', primary, passWriter), primary)).value, primary);
    assert.equal((await rejected(() => failTerminal('terminal', primary, {}, passWriter), primary)).value, primary);
    const run = (await rejected(() => recordRun('raw', 'failure', {}, [{ stage: 'calibration', cause: primary }], passWriter))).value;
    assert.equal(run.errors[0], primary);
    assert.equal(run.cause, primary);
  }
});
