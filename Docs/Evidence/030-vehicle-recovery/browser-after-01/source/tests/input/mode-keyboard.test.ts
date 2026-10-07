import assert from 'node:assert/strict';
import test from 'node:test';
import { bindModeKeyboard } from '../../src/input/mode-keyboard';
import { createDefaultSettings } from '../../src/settings';
class Events {
  handlers = new Map<string, Set<(e: Event) => void>>();
  addEventListener(type: string, callback: (e: Event) => void) {
    const set = this.handlers.get(type) ?? new Set();
    set.add(callback);
    this.handlers.set(type, set);
  }
  removeEventListener(type: string, callback: (e: Event) => void) {
    this.handlers.get(type)?.delete(callback);
  }
  fire(type: string, values = {}) {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, values);
    for (const fn of this.handlers.get(type) ?? []) fn(e);
    return e;
  }
  count() {
    return [...this.handlers.values()].reduce((n, s) => n + s.size, 0);
  }
}
class Element extends Events {
  ownerDocument!: Document;
  isContentEditable = false;
  blocked = false;
  closest() {
    return this.blocked ? this : null;
  }
}
function fixture(extra = {}) {
  const doc = Object.assign(new Events(), {
    hidden: false,
    activeElement: null as unknown,
    defaultView: null as unknown,
    hasFocus: () => true,
    querySelector: () => null as unknown,
  });
  const win = Object.assign(new Events(), { HTMLElement: Element });
  doc.defaultView = win;
  const surface = new Element();
  surface.ownerDocument = doc as unknown as Document;
  doc.activeElement = surface;
  const calls: string[] = [];
  let clears = 0,
    enabled = true;
  const bindings = createDefaultSettings('067').input.bindings;
  const binding = bindModeKeyboard({
    surface: surface as unknown as HTMLElement,
    bindings,
    port: {
      enqueue: (action) => {
        calls.push(action);
        return true;
      },
      clear: () => {
        clears++;
      },
    },
    enabled: () => enabled,
    ...extra,
  });
  const key = (type: string, code: string, values = {}) =>
    doc.fire(type, {
      code,
      repeat: false,
      isComposing: false,
      metaKey: false,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      ...values,
    });
  return {
    doc,
    win,
    surface,
    calls,
    bindings,
    binding,
    key,
    clears: () => clears,
    setEnabled: (v: boolean) => {
      enabled = v;
    },
  };
}
test('067 keyboard down/up suppresses repeats and duplicate keydowns with two held codes', () => {
  const f = fixture();
  assert.equal(f.key('keydown', 'KeyM').defaultPrevented, true);
  f.key('keydown', 'KeyM');
  f.key('keydown', 'KeyM', { repeat: true });
  f.key('keydown', 'KeyL');
  assert.deepEqual(f.calls, ['M', 'L']);
  assert.equal(f.binding.getStats().heldCodes, 2);
  f.key('keyup', 'KeyM');
  f.key('keydown', 'KeyM');
  assert.deepEqual(f.calls, ['M', 'L', 'M']);
  f.binding.dispose();
  assert.equal(f.doc.count() + f.win.count(), 0);
});
test('067 focus editable modal pause composition and shortcuts cannot enqueue transitions', () => {
  const f = fixture();
  f.surface.blocked = true;
  f.key('keydown', 'KeyM');
  f.surface.blocked = false;
  f.doc.querySelector = () => ({});
  f.key('keydown', 'KeyL');
  f.doc.querySelector = () => null;
  f.setEnabled(false);
  f.key('keydown', 'KeyM');
  f.setEnabled(true);
  for (const flag of ['isComposing', 'metaKey', 'ctrlKey', 'shiftKey', 'altKey'])
    f.key('keydown', 'KeyM', { [flag]: true });
  assert.deepEqual(f.calls, []);
  f.key('keydown', 'KeyM');
  f.win.fire('blur');
  assert.equal(f.binding.getStats().heldCodes, 0);
  f.key('keydown', 'KeyM');
  assert.equal(f.calls.length, 2);
  f.doc.hidden = true;
  f.doc.fire('visibilitychange');
  assert.equal(f.binding.getStats().heldCodes, 0);
});
test('067 standalone own modifiers allowed; other combinations rejected and remap is atomic', () => {
  for (const [code, flag] of [
    ['ShiftLeft', 'shiftKey'],
    ['ControlRight', 'ctrlKey'],
    ['AltLeft', 'altKey'],
  ] as const) {
    const f = fixture();
    f.binding.remap({ ...f.bindings, manualMode: code });
    f.key('keydown', code, { [flag]: true });
    assert.deepEqual(f.calls, ['M']);
    f.key('keyup', code);
    f.key('keydown', code, { [flag]: true, metaKey: true });
    assert.deepEqual(f.calls, ['M']);
    f.binding.dispose();
  }
  const f = fixture();
  assert.throws(
    () => f.binding.remap({ ...f.bindings, manualMode: f.bindings.brake }),
    /conflicting/,
  );
  f.key('keydown', 'KeyM');
  assert.deepEqual(f.calls, ['M']);
  f.binding.remap({ ...f.bindings, manualMode: 'F12' });
  assert.equal(f.binding.getStats().heldCodes, 0);
  f.key('keydown', 'KeyM');
  f.key('keydown', 'F12');
  assert.deepEqual(f.calls, ['M', 'M']);
});
test('067 keyboard synchronous callbacks and reentry reject malformed ports, disposal releases listeners', () => {
  const asyncEnabled = fixture({ enabled: () => Promise.resolve(true) });
  assert.throws(() => asyncEnabled.binding.sync(), /synchronous boolean/);
  asyncEnabled.binding.dispose();
  const asyncLost = fixture({ onFocusLost: () => Promise.resolve() });
  assert.throws(() => asyncLost.win.fire('blur'), /synchronous void/);
  asyncLost.binding.dispose();
  const asyncClear = fixture({ port: { enqueue: () => true, clear: () => Promise.resolve() } });
  assert.throws(() => asyncClear.binding.dispose(), /synchronous void/);
  assert.equal(asyncClear.doc.count() + asyncClear.win.count(), 0);
  const f = fixture({
    enabled: () => {
      f.binding.sync();
      return true;
    },
  });
  assert.throws(() => f.binding.sync(), /reentrant/);
  f.binding.dispose();
  for (let n = 0; n < 20; n++) {
    const v = fixture();
    v.key('keydown', 'KeyM');
    v.binding.dispose();
    v.binding.dispose();
    assert.equal(v.doc.count() + v.win.count(), 0);
    assert.equal(v.binding.getStats().heldCodes, 0);
  }
});
