import type { BodyIdentity } from '../../src/vehicles';
import { createModeControls } from '../../src/input/mode-controls';
import { createControlAuthority } from '../../src/input/control-authority';
import { createVehicleController } from '../../src/vehicles/controller';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createControlModeHud } from '../../src/ui/control-mode-hud';
import type { ControlModeHudView } from '../../src/ui/control-mode-hud';
import { CONTROLLER_CONTEXT } from '../vehicles/controller-reference';
class Element {
  ownerDocument!: Document;
  childNodes: unknown[] = [];
  children: Element[] = [];
  parent: Element | null = null;
  attrs = new Map<string, string>();
  handlers = new Map<string, () => void>();
  disabled = false;
  type = '';
  text = '';
  get textContent() {
    return this.text;
  }
  set textContent(value: string) {
    this.text = value;
    this.childNodes = value ? [{ textContent: value }] : [];
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  append(...children: Element[]) {
    this.children.push(...children);
    this.childNodes.push(...children);
    for (const c of children) c.parent = this;
  }
  addEventListener(t: string, f: () => void) {
    this.handlers.set(t, f);
  }
  removeEventListener(t: string) {
    this.handlers.delete(t);
  }
  click() {
    this.handlers.get('click')?.();
  }
  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((v) => v !== this);
      this.parent.childNodes = this.parent.childNodes.filter((v) => v !== this);
      this.parent = null;
    }
  }
}
function fixture() {
  const doc = {
    createElement: () => {
      const e = new Element();
      e.ownerDocument = doc as unknown as Document;
      return e;
    },
  };
  const host = doc.createElement(),
    calls: string[] = [];
  const hud = createControlModeHud(host as unknown as HTMLElement, {
    intent: (v) => {
      calls.push(v);
      return true;
    },
    bindings: { manualMode: 'KeyM', learningMode: 'KeyL' },
  });
  return { hud, host, calls, root: host.children[0] };
}
const actionToken = Object.freeze({ entityId: 'selected-target', handle: 2, generation: 1 });
const view = (
  mode: ControlModeHudView['mode'] = 'AUTO',
  tick = 1,
  eligible: boolean | null = false,
): ControlModeHudView => ({
  ...CONTROLLER_CONTEXT,
  version: '067-control-mode-view-v1',
  tick,
  identity: Object.freeze({ entityId: 'active-seat', handle: 1, generation: 1 }),
  actionIdentity: actionToken,
  mode,
  learningEligible: eligible,
  suspended: false,
  fault: null,
});
test('067 HUD actual text symbol subject and independent eligibility, never optimistic on click', () => {
  const f = fixture();
  f.hud.update(view(), 0);
  assert.equal(f.root.children[0].textContent, 'A');
  assert.equal(f.root.children[1].textContent, 'Conduce AI-ul');
  assert.equal(f.root.children[2].textContent, 'Vehicul: active-seat');
  assert.match(f.root.attrs.get('aria-label')!, /active-seat/);
  f.root.children[5].click();
  assert.deepEqual(f.calls, ['M']);
  assert.equal(f.root.children[1].textContent, 'Conduce AI-ul');
  f.hud.update(view('MANUAL', 2), 100);
  assert.equal(f.root.children[1].textContent, 'Conduci · învățare oprită');
  for (const [n, eligible] of [true, false, null].entries()) {
    f.hud.update(view('LEARNING', 3 + n, eligible), 200 + n * 100);
    assert.equal(f.root.children[1].textContent, 'Conduci · orașul învață');
    assert.equal(
      f.root.children[3].textContent,
      eligible === null
        ? 'Eligibilitate indisponibilă'
        : eligible
          ? 'Eligibil pentru învățare'
          : 'Învățare neeligibilă',
    );
  }
});
test('067 HUD throttle never allows paused faulted or missing-subject clicks before refresh', () => {
  const f = fixture();
  f.hud.update(view(), 0);
  const writes = f.hud.getStats().writes;
  f.hud.update({ ...view('MANUAL', 2), suspended: true }, 10);
  f.root.children[5].click();
  assert.deepEqual(f.calls, []);
  assert.equal(f.hud.getStats().writes, writes);
  f.hud.update({ ...view('LEARNING', 3, null), fault: 'KEYBOARD_CLEAR' }, 20);
  f.root.children[6].click();
  assert.deepEqual(f.calls, []);
  f.hud.update({ ...view('AUTO', 4), identity: null, actionIdentity: null }, 30);
  f.root.children[5].click();
  assert.deepEqual(f.calls, []);
  assert.equal(f.hud.getStats().updates, 1);
  assert.throws(() => f.hud.update(view('AUTO', 5), 29), /clock/);
});
test('067 HUD guards malformed getter eligibility and stale accepted ticks; atomic remap and bounded lifecycle', () => {
  const f = fixture();
  f.hud.update(view(), 0);
  assert.throws(() => f.hud.update(view('MANUAL', 2, true), 100), /projection/);
  assert.throws(() => f.hud.update({ ...view(), tick: 0 }, 100), /Stale/);
  let getters = 0;
  const bad = Object.defineProperty({ ...view() }, 'mode', {
    get() {
      getters++;
      return 'MANUAL';
    },
    enumerable: true,
  });
  assert.throws(() => f.hud.update(bad, 100), /descriptor/);
  assert.equal(getters, 0);
  const old = f.root.children[5].textContent;
  assert.throws(() => f.hud.remap({ manualMode: 'KeyM', learningMode: 'KeyM' }));
  assert.equal(f.root.children[5].textContent, old);
  f.hud.remap({ manualMode: 'ShiftLeft', learningMode: 'KeyL' });
  assert.match(f.root.children[5].textContent, /ShiftLeft/);
  for (let n = 0; n < 20; n++) {
    const v = fixture();
    v.hud.update(view(), 0);
    assert.equal(v.hud.getStats().elements, 8);
    assert.equal(v.hud.getStats().textNodes, 7);
    v.hud.dispose();
    v.hud.dispose();
    assert.equal(v.host.children.length, 0);
    assert.equal(v.hud.getStats().retainedProjections, 0);
    assert.equal(v.hud.getStats().listeners, 0);
  }
});

test('067 aria shortcuts use key names while visible labels retain physical remapped codes', () => {
  const f = fixture();
  assert.equal(f.root.children[5].attrs.get('aria-keyshortcuts'), 'M');
  assert.equal(f.root.children[6].attrs.get('aria-keyshortcuts'), 'L');
  for (const [code, name] of [
    ['Digit1', '1'],
    ['ShiftLeft', 'Shift'],
    ['ControlRight', 'Control'],
    ['AltLeft', 'Alt'],
    ['ArrowUp', 'ArrowUp'],
  ] as const) {
    f.hud.remap({ manualMode: code, learningMode: 'KeyL' });
    assert.equal(f.root.children[5].attrs.get('aria-keyshortcuts'), name);
    assert.match(f.root.children[5].textContent, new RegExp(code));
  }
});

test('067 real066 seatA cameraB HUD promises B and exact visible target rejects stale clicks', () => {
  const a: BodyIdentity = Object.freeze({ entityId: 'A', handle: 1, generation: 1 }),
    b: BodyIdentity = Object.freeze({ entityId: 'B', handle: 2, generation: 1 });
  const ids = new Map([
    ['A', a],
    ['B', b],
  ]);
  const controller = createVehicleController(CONTROLLER_CONTEXT, {
    bodyIdentity: (id) => ids.get(id),
    step: () => ({
      controllerMs: 0,
      stepMs: 0,
      queryMs: 0,
      bridgeMs: 0,
      totalMs: 0,
      queryCount: 0,
      bridgeCalls: 0,
    }),
  });
  const owner = createControlAuthority(CONTROLLER_CONTEXT, controller, {
    bodyIdentity: (id) => ids.get(id),
  });
  owner.register(a);
  owner.register(b);
  let selected = a;
  const adapter = createModeControls(CONTROLLER_CONTEXT, {
    readAuthority: () => owner.getStats(),
    selectedIdentity: () => selected,
    bodyIdentity: (id) => ids.get(id),
  });
  const time = (tick: number) => ({
    ...CONTROLLER_CONTEXT,
    version: '067-mode-controls-v1' as const,
    tick,
    dtSeconds: 1 / 60,
  });
  const apply = () => {
    const t = adapter.prepare(time(owner.getStats().tick + 1));
    owner.step({ ...time(t.tick), version: '066-control-authority-v1' }, [], t.requests);
    adapter.settle(t);
    return adapter.observe();
  };
  adapter.enqueue('M');
  apply();
  selected = b;
  const doc = {
    createElement: () => {
      const e = new Element();
      e.ownerDocument = doc as unknown as Document;
      return e;
    },
  };
  const host = doc.createElement();
  const hud = createControlModeHud(host as unknown as HTMLElement, {
      intent: (key, target) => adapter.enqueue(key, target),
      bindings: { manualMode: 'KeyM', learningMode: 'KeyL' },
    }),
    root = host.children[0];
  hud.update(adapter.observe(), 0);
  assert.equal(root.children[2].textContent, 'Vehicul: A');
  assert.equal(root.children[4].textContent, 'Butoanele M/L: B');
  assert.equal(root.children[1].textContent, 'Conduci · învățare oprită');
  root.children[5].click();
  const ticket = adapter.prepare(time(2));
  assert.deepEqual(ticket.requests, [
    { identity: a, mode: 'AUTO' },
    { identity: b, mode: 'MANUAL' },
  ]);
  owner.step({ ...time(2), version: '066-control-authority-v1' }, [], ticket.requests);
  adapter.settle(ticket);
  selected = a;
  hud.update(adapter.observe(), 10);
  root.children[5].click();
  assert.equal(adapter.getStats().intents, 0);
  assert.equal(root.children[4].textContent, 'Butoanele M/L: B');
  // No fresh HUD observation is needed for the input port's exact target check.
  selected = b;
  hud.update(adapter.observe(), 100);
  selected = a;
  root.children[5].click();
  assert.equal(adapter.getStats().intents, 0);
  hud.update(adapter.observe(), 200);
  assert.equal(root.children[4].textContent, 'Butoanele M/L: A');
  root.children[6].click();
  assert.equal(adapter.getStats().intents, 1);
  assert.equal(adapter.prepare(time(3)).identity, a);
  adapter.clear();
  selected = b;
  adapter.enqueue('L');
  assert.equal(adapter.prepare(time(3)).identity, b);
  hud.dispose();
  adapter.dispose();
  owner.dispose();
  controller.dispose();
});
