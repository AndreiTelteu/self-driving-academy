import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindRecoveryInput } from '../../src/input/recovery-input';
import { createDefaultSettings } from '../../src/settings';
import type { BodyIdentity, RecoverySeatPort } from '../../src/vehicles';
class Events {
  handlers = new Map<string, Set<(event: Event) => void>>();
  addEventListener(name: string, callback: (event: Event) => void) {
    const set = this.handlers.get(name) ?? new Set(); set.add(callback); this.handlers.set(name, set);
  }
  removeEventListener(name: string, callback: (event: Event) => void) { this.handlers.get(name)?.delete(callback); }
  fire(name: string, fields = {}) { const event = new Event(name, { cancelable: true });
    for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value, configurable: true });
    for (const callback of this.handlers.get(name) ?? []) callback(event); return event; }
  count() { return [...this.handlers.values()].reduce((sum, set) => sum + set.size, 0); }
}
class Element extends Events {
  ownerDocument!: Document; isContentEditable = false; blocked = false;
  closest() { return this.blocked ? this : null; }
}
function fixture() {
  const win = Object.assign(new Events(), { HTMLElement: Element });
  const doc = Object.assign(new Events(), { defaultView: win, hidden: false, focused: true, modal: false,
    activeElement: null as unknown, hasFocus() { return this.focused; }, querySelector() { return this.modal ? {} : null; } });
  const surface = new Element(); surface.ownerDocument = doc as unknown as Document; doc.activeElement = surface;
  const a: BodyIdentity = Object.freeze({ entityId: 'a', handle: 1, generation: 1 });
  const b: BodyIdentity = Object.freeze({ entityId: 'b', handle: 2, generation: 2 });
  let seat = a, paused = false, clears = 0;
  const authority: RecoverySeatPort = { getStats: () => ({ context: { schemaVersion: 1, units: 'SI', sessionId: 'r', worldEpoch: 1 },
    tick: 6, disposed: false, fault: null, suspended: paused, seat: { identity: seat, mode: 'MANUAL' } }) };
  const requests: unknown[] = [];
  const bindings = createDefaultSettings('r').input.bindings;
  const input = bindRecoveryInput({ surface: surface as unknown as HTMLElement, bindings, authority,
    port: { request(value) { requests.push(value); return 'operation'; }, clearPending() { clears++; } } });
  return { input, doc, win, surface, bindings, a, b, requests,
    setSeat: (token: BodyIdentity) => { seat = token; }, setPaused: (value: boolean) => { paused = value; },
    get clears() { return clears; } };
}
test('R is one explicit edge on actual controlled seat; repeat, held, stale HUD and pause reject', () => {
  const f = fixture(); try {
    f.doc.fire('keydown', { code: 'KeyR', target: f.surface });
    f.doc.fire('keydown', { code: 'KeyR', target: f.surface, repeat: true });
    f.doc.fire('keydown', { code: 'KeyR', target: f.surface }); assert.equal(f.requests.length, 1);
    f.setSeat(f.b); assert.equal(f.input.click(f.a), false); assert.equal(f.input.click(f.b), true);
    assert.equal((f.requests[1] as { identity: BodyIdentity }).identity, f.b);
    f.doc.fire('keyup', { code: 'KeyR' }); f.setPaused(true);
    f.doc.fire('keydown', { code: 'KeyR', target: f.surface }); assert.equal(f.requests.length, 2);
  } finally { f.input.dispose(); }
  assert.equal(f.doc.count() + f.win.count(), 0); assert.equal(f.input.getStats().listeners, 0);
});
test('focus/text/modal/modifiers clear pending; remapping requires a fresh release and keeps cleanup bounded', () => {
  const f = fixture(); try {
    f.surface.blocked = true; f.doc.fire('keydown', { code: 'KeyR', target: f.surface });
    assert.equal(f.requests.length, 0); f.surface.blocked = false;
    f.doc.fire('keydown', { code: 'KeyR', target: f.surface, ctrlKey: true }); assert.equal(f.requests.length, 0);
    f.doc.modal = true; f.doc.fire('keydown', { code: 'KeyR', target: f.surface }); assert.equal(f.requests.length, 0);
    f.doc.modal = false; f.doc.fire('keydown', { code: 'KeyR', target: f.surface }); assert.equal(f.requests.length, 1);
    f.doc.focused = false; f.win.fire('blur'); f.doc.focused = true;
    f.input.remap({ ...f.bindings, recover: 'KeyZ' });
    f.doc.fire('keydown', { code: 'KeyR', target: f.surface }); assert.equal(f.requests.length, 1);
    f.doc.fire('keydown', { code: 'KeyZ', target: f.surface }); assert.equal(f.requests.length, 2);
    assert(f.clears >= 5); assert.equal(f.input.getStats().listeners, 6);
  } finally { f.input.dispose(); }
  assert.equal(f.doc.count() + f.win.count(), 0);
});
