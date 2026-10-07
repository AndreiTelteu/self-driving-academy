/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recoveryFailureText } from '../../src/vehicles/recovery-diagnostic';

test('cold recovery diagnostic never calls arbitrary object hooks and every falsy throw yields nonempty stage fault', () => {
  let hooks = 0;
  const error = new Error('unread');
  Object.defineProperties(error, {
    name: {
      get() {
        hooks++;
        throw 1;
      },
    },
    message: {
      get() {
        hooks++;
        throw 2;
      },
    },
  });
  const proxy = new Proxy(
    {},
    {
      get() {
        hooks++;
        throw 3;
      },
      getPrototypeOf() {
        hooks++;
        throw 4;
      },
      getOwnPropertyDescriptor() {
        hooks++;
        throw 5;
      },
      ownKeys() {
        hooks++;
        throw 6;
      },
    },
  );
  const custom = {
    get name() {
      hooks++;
      throw 7;
    },
    get message() {
      hooks++;
      throw 8;
    },
    toString() {
      hooks++;
      throw 9;
    },
    [Symbol.toPrimitive]() {
      hooks++;
      throw 10;
    },
  };
  for (const value of [error, proxy, custom, new String('boxed'), '', null, undefined, false, 0])
    assert.equal(recoveryFailureText(value, 'Recovery stage threw'), 'Recovery stage threw');
  assert.equal(recoveryFailureText('actual string', 'Recovery stage threw'), 'actual string');
  assert.equal(recoveryFailureText('x'.repeat(600), 'Recovery stage threw').length, 512);
  assert.equal(hooks, 0);
});
