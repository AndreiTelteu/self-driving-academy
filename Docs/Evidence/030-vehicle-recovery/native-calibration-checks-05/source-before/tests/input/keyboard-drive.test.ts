import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindKeyboardDriveInput } from '../../src/input';
import { createKeyboardFilter } from '../../src/vehicles';
import { createDefaultSettings } from '../../src/settings';
import { CONTROLLER_CONTEXT } from '../vehicles/controller-reference';

class Events extends EventTarget {
  listeners = 0;
  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ) {
    super.addEventListener(type, callback, options);
    this.listeners++;
  }
  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ) {
    super.removeEventListener(type, callback, options);
    this.listeners--;
  }
}
class Element extends Events {
  isContentEditable = false;
  blocked = false;
  ownerDocument!: Document;
  closest() {
    return this.blocked ? this : null;
  }
}
function fixture() {
  const doc = new Events() as Events & {
    defaultView: unknown;
    hidden: boolean;
    activeElement: unknown;
    hasFocus: () => boolean;
    querySelector: () => unknown;
  };
  const win = new Events() as Events & { HTMLElement: typeof Element };
  win.HTMLElement = Element;
  doc.defaultView = win;
  doc.hidden = false;
  let focus = true,
    modal = false;
  doc.hasFocus = () => focus;
  doc.querySelector = () => (modal ? {} : null);
  const surface = new Element();
  surface.ownerDocument = doc as unknown as Document;
  doc.activeElement = surface;
  const settings = createDefaultSettings('025-dom'),
    filter = createKeyboardFilter(CONTROLLER_CONTEXT, 'car', settings.input.control);
  let enabled = true,
    lost = 0;
  const binding = bindKeyboardDriveInput({
    surface: surface as unknown as HTMLElement,
    bindings: settings.input.bindings,
    port: filter,
    enabled: () => enabled,
    onFocusLost: () => lost++,
  });
  const key = (type: string, code: string, values = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, {
      code,
      repeat: false,
      isComposing: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: false,
      ...values,
    });
    doc.dispatchEvent(event);
    return event;
  };
  return {
    doc,
    win,
    surface,
    filter,
    binding,
    key,
    setFocus: (value: boolean) => (focus = value),
    setModal: (value: boolean) => (modal = value),
    setEnabled: (value: boolean) => (enabled = value),
    lost: () => lost,
  };
}
test('DOM press hold/repeat/release are bounded and raw keys mapW/S/A/D/Space', () => {
  const f = fixture();
  assert.equal(f.doc.listeners + f.win.listeners, 6);
  assert.equal(f.key('keydown', 'KeyW').defaultPrevented, true);
  f.key('keydown', 'KeyW', { repeat: true });
  assert.equal(f.filter.getStats().heldKeys, 1);
  f.key('keydown', 'KeyA');
  f.key('keydown', 'Space');
  const result = f.filter.step({ tick: 1, dtSeconds: 1 / 60, speedMps: 0 });
  assert.equal(result.raw.throttle, 1);
  assert.equal(result.raw.steering, -1);
  assert.equal(result.raw.handbrake, true);
  assert.equal(result.command.throttle, 0);
  for (const code of ['KeyW', 'KeyA', 'Space']) f.key('keyup', code);
  assert.equal(f.filter.getStats().heldKeys, 0);
  f.binding.dispose();
  f.filter.dispose();
  assert.equal(f.doc.listeners + f.win.listeners, 0);
});
test('blur visibility editable/modal/disabled state flushes keys; repeats never restore lostinput', () => {
  const f = fixture();
  f.key('keydown', 'KeyW');
  f.setFocus(false);
  f.win.dispatchEvent(new Event('blur'));
  assert.equal(f.lost(), 1);
  assert.equal(f.filter.getStats().heldKeys, 0);
  f.setFocus(true);
  f.key('keydown', 'KeyW', { repeat: true });
  assert.equal(f.filter.getStats().heldKeys, 0);
  f.key('keydown', 'KeyW');
  f.surface.blocked = true;
  f.doc.dispatchEvent(new Event('focusin'));
  assert.equal(f.filter.getStats().heldKeys, 0);
  assert.equal(f.key('keydown', 'KeyD').defaultPrevented, false);
  f.surface.blocked = false;
  f.key('keydown', 'KeyW');
  f.setModal(true);
  assert.equal(f.binding.sync(), false);
  assert.equal(f.filter.getStats().heldKeys, 0);
  f.setModal(false);
  f.key('keydown', 'KeyW');
  f.setEnabled(false);
  f.binding.sync();
  assert.equal(f.filter.getStats().heldKeys, 0);
  f.setEnabled(true);
  f.key('keydown', 'KeyW');
  f.doc.hidden = true;
  f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.filter.getStats().heldKeys, 0);
  f.binding.dispose();
  f.filter.dispose();
});
test('modifiers and composition do not consume editable keyboardshortcuts or leave throttle active', () => {
  const f = fixture();
  f.key('keydown', 'KeyW');
  assert.equal(f.key('keydown', 'KeyW', { ctrlKey: true }).defaultPrevented, false);
  assert.equal(f.filter.getStats().heldKeys, 0);
  f.key('keydown', 'KeyW', { isComposing: true });
  f.key('keydown', 'KeyW', { shiftKey: true });
  assert.equal(f.filter.getStats().heldKeys, 0);
  f.key('keydown', 'KeyZ');
  assert.equal(f.filter.getStats().heldKeys, 0);
  f.binding.dispose();
  f.filter.dispose();
});
test('twenty binding/filter ownershipcycles release sixlisteners and retain noinputframes', () => {
  for (let cycle = 0; cycle < 20; cycle++) {
    const f = fixture();
    f.key('keydown', 'KeyW');
    f.binding.dispose();
    f.binding.dispose();
    assert.equal(f.filter.getStats().heldKeys, 0);
    assert.equal(f.doc.listeners + f.win.listeners, 0);
    assert.equal(f.binding.getStats().listeners, 0);
    f.key('keydown', 'KeyW');
    assert.equal(f.filter.getStats().heldKeys, 0);
    f.filter.dispose();
    assert.equal(f.filter.getStats().retainedFrames, 0);
  }
});
