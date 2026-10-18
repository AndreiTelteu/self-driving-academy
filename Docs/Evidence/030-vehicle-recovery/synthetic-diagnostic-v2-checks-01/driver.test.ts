/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyntheticDriver } from './driver';
import type { DriverPorts } from './driver';
function fixture(dispatch?: DriverPorts['dispatch']) {
  const target = new EventTarget(),
    sent: Event[] = [];
  const driver = createSyntheticDriver(target, {
    key: (type) => new Event(type),
    pointer: () => new Event('click'),
    current: () => ({ stage: 'HELD_REPEAT', tick: 391, generation: 1 }),
    now: () => 10,
    dispatch:
      dispatch ??
      ((_target, event) => {
        sent.push(event);
      }),
  });
  return { driver, sent };
}
test('actual untrusted events owned; hold/repeat/up and once release retain raw trust', () => {
  const { driver, sent } = fixture();
  driver.down('KeyR');
  driver.down('KeyR', true);
  driver.up('KeyR');
  driver.release();
  driver.release();
  assert(sent.every((event) => event.isTrusted === false && driver.owns(event)));
  assert.equal(driver.owns(new Event('keydown')), false);
  assert.deepEqual(
    driver.snapshot().events.map((row) => [row.type, row.repeat, row.isTrusted]),
    [
      ['keydown', false, false],
      ['keydown', true, false],
      ['keyup', false, false],
    ],
  );
  assert.deepEqual(driver.snapshot().heldAtEnd, []);
});
test('release attempts every held key independently and preserves failed held state', () => {
  let releases = 0;
  const cause = new Error('keyup dispatch fault');
  const { driver } = fixture((_target, event) => {
    if (event.type === 'keyup' && ++releases === 1) throw cause;
  });
  driver.down('KeyW');
  driver.down('KeyD');
  assert.throws(
    () => driver.release(),
    (error) => error instanceof AggregateError && error.errors[0] === cause,
  );
  assert.equal(releases, 2);
  assert.deepEqual(driver.snapshot().heldAtEnd, ['KeyW']);
  driver.release();
  assert.equal(releases, 2);
});
test('capacity exhaustion is explicit failure, never silent dropped release proof', () => {
  const { driver } = fixture();
  for (let i = 0; i < 63; i++) driver.down('KeyR', i > 0);
  driver.release();
  assert.equal(driver.snapshot().events.length, 64);
  const second = fixture().driver;
  for (let i = 0; i < 64; i++) second.down('KeyR', i > 0);
  assert.throws(() => second.release(), AggregateError);
  assert.deepEqual(second.snapshot().heldAtEnd, ['KeyR']);
});
test('disabled HUD and failed actual focus reject before dispatch; enabled connected focused button is observed', () => {
  const { driver, sent } = fixture();
  let focused = 0;
  const doc = { activeElement: null as unknown };
  const button = { disabled: true, isConnected: true, ownerDocument: doc, focus() { focused++; doc.activeElement = button; } };
  assert.throws(() => driver.click(button as unknown as HTMLButtonElement), /enabled connected/);
  assert.equal(focused, 0); assert.equal(sent.length, 0);
  button.disabled = false;
  const noFocus = { ...button, focus() { focused++; } };
  assert.throws(() => driver.click(noFocus as unknown as HTMLButtonElement), /focus failed/);
  assert.equal(sent.length, 0);
  driver.click(button as unknown as HTMLButtonElement);
  assert.equal(doc.activeElement, button); assert.equal(sent.length, 1);
  assert.equal(driver.snapshot().events[0]!.isTrusted, false);
});
