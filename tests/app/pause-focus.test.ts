import assert from 'node:assert/strict';
import test from 'node:test';
import { createPauseFocusOwner, PAUSE_FOCUS_MAX_HELD_COMMANDS } from '../../src/app';
import { createApplicationLifecycle } from '../../src/app/application-lifecycle';
import type { ApplicationPauseReason } from '../../src/app/application-lifecycle';
import {
  createControlAuthority,
  CONTROL_AUTHORITY_LIMITS,
} from '../../src/input/control-authority';
import { bindKeyboardDriveInput, bindPauseFocusInput } from '../../src/input';
import { createVehicleController } from '../../src/vehicles/controller';
import { createKeyboardFilter } from '../../src/vehicles';
import type { BodyIdentity } from '../../src/vehicles/body-port';
import type { VehicleCommand } from '../../src/vehicles/contracts';
import { createDefaultSettings } from '../../src/settings';
import { CONTROLLER_CONTEXT, controllerCommand } from '../vehicles/controller-reference';

/** Real 012 lifecycle + real 008 loop + real 070 owner; only the browser clock is injected. */
function lifecycleFixture() {
  let now = 0;
  let hidden = false;
  let visibility: (hidden: boolean) => void = () => {};
  let renders = 0;
  let listeners = 0;
  let disposals = 0;
  const frames = new Map<number, () => void>();
  let nextFrame = 0;
  const ticks: number[] = [];
  const calls: string[] = [];
  let resetHeld = 0;
  const app = createApplicationLifecycle({
    createBackend: async () => ({
      rendererKind: 'WEBGL2',
      render: () => {
        renders++;
      },
      resize: () => {},
      dispose: () => {
        disposals++;
      },
    }),
    createSimulation: () => ({
      captureSnapshot: () => ({ tick: ticks.length }),
      step: (step) => {
        ticks.push(step.tick);
      },
      interpolate: (_previous, current) => current,
    }),
    now: () => now,
    show: () => {},
    scheduleFrame: (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelFrame: (id) => {
      frames.delete(id);
    },
    subscribeResize: () => {
      listeners++;
      return () => {
        listeners--;
      };
    },
    subscribeVisibility: (callback) => {
      visibility = callback;
      listeners++;
      return () => {
        visibility = () => {};
        listeners--;
      };
    },
    isHidden: () => hidden,
  });
  const owner = createPauseFocusOwner({
    suspend: (cause: ApplicationPauseReason) => {
      calls.push(`suspend:${cause}`);
      app.pause(cause);
    },
    resume: (cause) => {
      calls.push(`resume:${cause}`);
      const state = app.getState();
      if (state.kind === 'PAUSED' && state.reason === cause) app.play();
    },
    resetHeldCommands: () => {
      resetHeld++;
      calls.push('reset-held');
    },
  });
  return {
    app,
    owner,
    calls,
    frame(time: number) {
      now = time;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback();
    },
    hide(value: boolean) {
      hidden = value;
      visibility(value);
    },
    setNow(time: number) {
      now = time;
    },
    ticks,
    resetHeld: () => resetHeld,
    read: () => ({ renders, listeners, disposals, frames: frames.size }),
  };
}

/** Real 024 controller + real 066 authority, driven one packet per accepted physical tick. */
function authorityFixture() {
  const identities = new Map<string, BodyIdentity>();
  let generation = 0;
  const sources: string[] = [];
  const add = (id: string) => {
    const identity = Object.freeze({ entityId: id, handle: ++generation, generation });
    identities.set(id, identity);
    return identity;
  };
  const controller = createVehicleController(CONTROLLER_CONTEXT, {
    bodyIdentity: (id) => identities.get(id),
    step() {
      return {
        controllerMs: 0,
        stepMs: 0,
        queryMs: 0,
        bridgeMs: 0,
        totalMs: 0,
        queryCount: 0,
        bridgeCalls: 0,
      };
    },
  });
  const authority = createControlAuthority(CONTROLLER_CONTEXT, controller, {
    bodyIdentity: (id) => identities.get(id),
  });
  const packet = (identity: BodyIdentity, tick: number, source: VehicleCommand['source']) => ({
    identity,
    command: {
      ...controllerCommand(identity.entityId, tick, source, {
        throttle: source === 'AUTONOMY' ? 0.4 : 1,
      }),
      ...CONTROLLER_CONTEXT,
    },
  });
  const step = (
    identity: BodyIdentity,
    tick: number,
    requests: readonly { readonly identity: BodyIdentity; readonly mode: 'AUTO' | 'MANUAL' }[] = [],
  ) => {
    const submitted = packet(identity, tick, 'AUTONOMY');
    sources.push(submitted.command.source);
    return authority.step(
      { ...CONTROLLER_CONTEXT, version: CONTROL_AUTHORITY_LIMITS.version, tick, dtSeconds: 1 / 60 },
      [submitted],
      requests,
    );
  };
  return { authority, controller, add, step, sources };
}

test('MANUAL panel suspends the authoritative loop; closing resumes without lost time', async () => {
  const f = lifecycleFixture();
  await f.app.load();
  f.app.play();
  f.frame(20);
  assert.deepEqual(f.ticks, [1]);

  f.owner.setMode('MANUAL');
  f.owner.setSurface('panel', true);
  assert.deepEqual(f.calls, ['suspend:panel']);
  assert.deepEqual(f.app.getState(), {
    kind: 'PAUSED',
    rendererKind: 'WEBGL2',
    reason: 'panel',
  });
  const paused = f.app.getState();
  assert.equal(f.owner.getState().suspended, true);
  assert.equal(f.owner.getState().cause, 'panel');
  assert.equal(f.owner.getState().revision, 1);

  // Rendering stays alive while the world is frozen; no authoritative tick may advance.
  const rendersBefore = f.read().renders;
  for (const time of [100, 1000, 60000]) f.frame(time);
  assert.deepEqual(f.ticks, [1]);
  assert.ok(f.read().renders > rendersBefore);
  assert.deepEqual(f.app.getState(), paused);

  f.owner.setSurface('panel', false);
  assert.deepEqual(f.calls, ['suspend:panel', 'reset-held', 'resume:panel']);
  assert.equal(f.resetHeld(), 1);
  // 59.98 s of wall time were suspended: the first frame after resume advances exactly one tick.
  f.frame(60020);
  assert.deepEqual(f.ticks, [1, 2]);
  const state = f.app.getSimulationState();
  assert.ok(state);
  assert.equal(state.tick, 2);
  assert.equal(state.simulatedSeconds, 2 / 60);
  assert.ok(state.activeRealSeconds < 0.05);
  assert.ok(state.debtSeconds < 1 / 60);
  f.app.dispose();
});

test('AUTO observation stays live with a panel and an open diagnostics surface, without PLAYER authority', async () => {
  const authority = authorityFixture();
  const taxi = authority.add('taxi-1');
  authority.authority.register(taxi);
  let now = 0;
  const frames = new Map<number, () => void>();
  let nextFrame = 0;
  const tickSequence: number[] = [];
  const seats: (string | null)[] = [];
  const app = createApplicationLifecycle({
    createBackend: async () => ({
      rendererKind: 'WEBGL2',
      render: () => {},
      resize: () => {},
      dispose: () => {},
    }),
    createSimulation: () => ({
      captureSnapshot: () => ({ tick: tickSequence.length }),
      step: (step) => {
        const result = authority.step(taxi, step.tick);
        tickSequence.push(step.tick);
        seats.push(result.seat?.identity.entityId ?? null);
      },
      interpolate: (_previous, current) => current,
    }),
    now: () => now,
    show: () => {},
    scheduleFrame: (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelFrame: (id) => {
      frames.delete(id);
    },
    subscribeResize: () => () => {},
    subscribeVisibility: () => () => {},
    isHidden: () => false,
  });
  const owner = createPauseFocusOwner({
    suspend: (cause: ApplicationPauseReason) => app.pause(cause),
    resume: (cause) => {
      const state = app.getState();
      if (state.kind === 'PAUSED' && state.reason === cause) app.play();
    },
  });
  const advance = (time: number) => {
    now = time;
    for (const callback of [...frames.values()]) callback();
  };
  await app.load();
  app.play();
  owner.setMode('AUTO');
  owner.setSurface('panel', true);
  owner.setSurface('diagnostic', true);
  assert.equal(owner.getState().suspended, false);
  assert.equal(owner.getState().cause, null);
  assert.equal(app.getState().kind, 'PLAYING');

  for (let frame = 1; frame <= 20; frame++) advance(frame * (1000 / 60));
  assert.deepEqual(
    tickSequence,
    Array.from({ length: 20 }, (_v, i) => i + 1),
  );
  assert.deepEqual(new Set(authority.sources), new Set(['AUTONOMY']));
  assert.deepEqual(new Set(seats), new Set([null]));
  assert.equal(authority.authority.getStats().players, 0);
  assert.equal(authority.authority.getStats().seat, null);
  assert.equal(app.getState().kind, 'PLAYING');

  // Acquiring MANUAL authority while the panel is open is what now demands suspension.
  owner.setMode('MANUAL');
  assert.equal(owner.getState().suspended, true);
  assert.equal(owner.getState().cause, 'panel');
  assert.deepEqual(app.getState(), {
    kind: 'PAUSED',
    rendererKind: 'WEBGL2',
    reason: 'panel',
  });
  const frozen = tickSequence.length;
  advance(5000);
  assert.equal(tickSequence.length, frozen);
  owner.setSurface('panel', false);
  assert.equal(owner.getState().suspended, false);
  advance(5000 + 1000 / 60);
  assert.equal(tickSequence.length, frozen + 1);
  app.dispose();
  authority.authority.dispose();
  authority.controller.dispose();
});

test('focus loss suspends in AUTO and MANUAL and refocusing never fabricates a tick burst', async () => {
  for (const mode of ['AUTO', 'MANUAL'] as const) {
    const f = lifecycleFixture();
    await f.app.load();
    f.app.play();
    f.owner.setMode(mode);
    f.frame(20);
    f.frame(40);
    assert.deepEqual(f.ticks, [1, 2]);

    // Alt-tab: only window blur, the document stays visible.
    f.owner.setFocusLost(true);
    assert.deepEqual(f.calls, ['suspend:focus']);
    assert.deepEqual(f.app.getState(), {
      kind: 'PAUSED',
      rendererKind: 'WEBGL2',
      reason: 'focus',
    });
    assert.equal(f.owner.getState().suspended, true);
    f.frame(60000);
    assert.deepEqual(f.ticks, [1, 2]);

    f.owner.setFocusLost(false);
    assert.deepEqual(f.calls, ['suspend:focus', 'reset-held', 'resume:focus']);
    f.frame(60020);
    assert.deepEqual(f.ticks, [1, 2, 3]);
    const state = f.app.getSimulationState();
    assert.ok(state);
    assert.equal(state.tick, 3);
    assert.equal(state.simulatedSeconds, 3 / 60);
    // 59.96 s of wall clock were suspended, never converted into simulated ticks.
    assert.ok(state.activeRealSeconds < 0.07);
    f.app.dispose();
    assert.equal(f.read().listeners, 0);
    assert.equal(f.read().frames, 0);
    assert.equal(f.read().disposals, 1);
  }
});

test('a background pause keeps its own reason and is not double-suspended by focus', async () => {
  const f = lifecycleFixture();
  await f.app.load();
  f.app.play();
  f.owner.setMode('MANUAL');
  f.frame(20);
  f.hide(true);
  f.owner.setFocusLost(true);
  assert.deepEqual(f.app.getState(), {
    kind: 'PAUSED',
    rendererKind: 'WEBGL2',
    reason: 'background',
  });
  const pauses = f.calls.filter((call) => call.startsWith('suspend')).length;
  f.hide(true);
  assert.equal(f.calls.filter((call) => call.startsWith('suspend')).length, pauses);
  f.app.dispose();
});

test('resume clears the really held keyboard key and the first command is neutral', () => {
  const settings = createDefaultSettings('070-dom');
  const filter = createKeyboardFilter(CONTROLLER_CONTEXT, 'car', settings.input.control);
  const { doc, win, surface, key } = keyboardDom();
  const binding = bindKeyboardDriveInput({
    surface,
    bindings: settings.input.bindings,
    port: filter,
  });
  let resets = 0;
  const owner = createPauseFocusOwner({
    suspend: () => {},
    resume: () => {},
    resetHeldCommands: () => {
      resets++;
      filter.clear();
    },
  });
  owner.setMode('MANUAL');
  key('keydown', 'KeyW');
  key('keydown', 'KeyD');
  assert.equal(filter.getStats().heldKeys, 2);
  assert.equal(filter.step({ tick: 1, dtSeconds: 1 / 60, speedMps: 0 }).raw.throttle, 1);

  owner.setSurface('panel', true);
  assert.equal(owner.getState().suspended, true);
  owner.holdPanelAction('resume');
  assert.equal(owner.getState().heldPanelAction, 'resume');
  assert.equal(filter.getStats().heldKeys, 2);

  owner.setSurface('panel', false);
  assert.equal(resets, 1);
  assert.equal(filter.getStats().heldKeys, 0);
  assert.equal(owner.getState().heldPanelAction, null);
  assert.deepEqual(owner.getState().heldCommands, []);

  const after = filter.step({ tick: 2, dtSeconds: 1 / 60, speedMps: 0 });
  assert.equal(after.raw.throttle, 0);
  assert.equal(after.raw.steering, 0);
  assert.equal(after.raw.handbrake, false);
  assert.equal(after.command.throttle, 0);
  assert.equal(after.command.steering, 0);

  owner.dispose();
  binding.dispose();
  filter.dispose();
  assert.equal(doc.listeners + win.listeners, 0);
});

test('documented precedence keeps one suspension edge while the cause changes', () => {
  const calls: string[] = [];
  const owner = createPauseFocusOwner({
    suspend: (cause) => calls.push(`suspend:${cause}`),
    resume: (cause) => calls.push(`resume:${cause}`),
    resetHeldCommands: () => calls.push('reset'),
  });
  owner.setMode('MANUAL');
  owner.setSurface('panel', true);
  assert.deepEqual(calls, ['suspend:panel']);
  owner.setFocusLost(true);
  // Focus has the documented highest precedence, but this is not a new suspension edge.
  assert.equal(owner.getState().cause, 'focus');
  assert.equal(owner.getStats().suspensions, 1);
  assert.equal(owner.getStats().resumes, 0);
  assert.equal(owner.getState().revision, 1);
  assert.deepEqual(calls, ['suspend:panel']);

  owner.setFocusLost(false);
  // The panel still demands suspension: no resume edge, only the cause changes back.
  assert.equal(owner.getState().suspended, true);
  assert.equal(owner.getState().cause, 'panel');
  assert.equal(owner.getStats().suspensions, 1);
  assert.equal(owner.getStats().resumes, 0);
  assert.deepEqual(calls, ['suspend:panel']);

  owner.setSurface('menu', true);
  owner.setSurface('panel', false);
  // menu > panel: still one suspension, cause changes without a resume/suspend pair.
  assert.equal(owner.getState().cause, 'menu');
  assert.deepEqual(calls, ['suspend:panel']);
  owner.setSurface('menu', false);
  assert.deepEqual(calls, ['suspend:panel', 'reset', 'resume:menu']);
  assert.equal(owner.getStats().suspensions, 1);
  assert.equal(owner.getStats().resumes, 1);
  owner.dispose();
});

test('menu open/close, repeated blur and rapid blur/focus do not flap or double-transition', () => {
  const calls: string[] = [];
  const owner = createPauseFocusOwner({
    suspend: (cause) => calls.push(`suspend:${cause}`),
    resume: (cause) => calls.push(`resume:${cause}`),
  });
  for (const _cycle of [0, 1, 2]) {
    owner.setSurface('menu', true);
    owner.setSurface('menu', true);
    owner.setSurface('menu', false);
    owner.setSurface('menu', false);
  }
  assert.equal(owner.getStats().suspensions, 3);
  assert.equal(owner.getStats().resumes, 3);
  assert.equal(owner.getState().revision, 6);
  assert.equal(owner.getState().suspended, false);

  for (const lost of [true, true, false, false]) owner.setFocusLost(lost);
  assert.equal(owner.getStats().suspensions, 4);
  assert.equal(owner.getStats().resumes, 4);
  assert.ok(owner.getStats().noopReconciles > 0);

  owner.setFocusLost(true);
  owner.setFocusLost(false);
  owner.setFocusLost(true);
  assert.equal(owner.getStats().suspensions, 6);
  assert.equal(owner.getStats().resumes, 5);
  assert.equal(owner.getState().cause, 'focus');
  owner.setFocusLost(false);
  assert.equal(owner.getStats().resumes, 6);
  owner.dispose();
});

test('an explicit resume is refused while a surface or focus loss still demands suspension', () => {
  const owner = createPauseFocusOwner({ suspend: () => {}, resume: () => {} });
  owner.setMode('LEARNING');
  owner.setSurface('panel', true);
  assert.equal(owner.requestResume(), false);
  assert.equal(owner.getStats().refusedResumes, 1);
  assert.equal(owner.getState().suspended, true);

  owner.setSurface('panel', false);
  assert.equal(owner.requestResume(), true);
  assert.equal(owner.getState().suspended, false);

  owner.setFocusLost(true);
  assert.equal(owner.requestResume(), false);
  owner.setFocusLost(false);
  assert.equal(owner.requestResume(), true);
  owner.dispose();
});

test('focus adapter reports edges only and disposal leaves no listeners', () => {
  const { doc, win, surface } = keyboardDom();
  const events: string[] = [];
  const binding = bindPauseFocusInput({
    surface,
    onFocusLost: () => {
      events.push('lost');
    },
    onFocusGained: () => {
      events.push('gained');
    },
  });
  assert.equal(binding.getStats().listeners, 4);
  win.dispatchEvent(new Event('blur'));
  win.dispatchEvent(new Event('blur'));
  assert.deepEqual(events, ['lost']);
  win.dispatchEvent(new Event('focus'));
  win.dispatchEvent(new Event('focus'));
  assert.deepEqual(events, ['lost', 'gained']);
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(events, ['lost', 'gained']);
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(events, ['lost', 'gained', 'lost']);
  doc.hidden = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(events, ['lost', 'gained', 'lost', 'gained']);
  assert.equal(binding.sync(), true);
  assert.deepEqual(events, ['lost', 'gained', 'lost', 'gained']);

  // Rapid blur/focus is two edges, never a flap; a pagehide never returns focus.
  win.dispatchEvent(new Event('blur'));
  win.dispatchEvent(new Event('focus'));
  assert.deepEqual(events.slice(-2), ['lost', 'gained']);
  win.dispatchEvent(new Event('pagehide'));
  assert.equal(events.at(-1), 'lost');

  binding.dispose();
  binding.dispose();
  assert.equal(binding.getStats().listeners, 0);
  win.dispatchEvent(new Event('focus'));
  assert.equal(events.at(-1), 'lost');
});

test('state is frozen and observable, and bounds/disposal fail closed', () => {
  const owner = createPauseFocusOwner({ suspend: () => {}, resume: () => {} });
  const state = owner.getState();
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.surfaces));
  assert.ok(Object.isFrozen(state.heldCommands));
  assert.equal(state.version, '070-pause-focus-v1');
  assert.equal(state.mode, 'AUTO');
  assert.deepEqual(state.surfaces, { panel: false, menu: false, diagnostic: false });
  assert.equal(owner.getStats().heldResetPort, false);
  assert.throws(() => {
    (state as { revision: number }).revision = 9;
  }, TypeError);

  owner.holdCommand('KeyW');
  owner.setFocusLost(true);
  assert.deepEqual(owner.getState().heldCommands, ['KeyW']);
  // A panel in AUTO is a live observation surface; a diagnostic surface never suspends.
  owner.setMode('AUTO');
  owner.setSurface('panel', true);
  owner.setSurface('diagnostic', true);
  assert.equal(owner.getState().suspended, true);

  assert.throws(() => owner.setMode('CRUISE' as never), /Unsupported pause-focus/);
  assert.throws(() => owner.setSurface('overlay' as never, true), /Unsupported pause-focus/);
  assert.throws(() => owner.holdCommand(''), /Bounded held-command/);
  assert.throws(() => owner.holdCommand('x'.repeat(65)), /Bounded held-command/);
  for (let index = 1; index < PAUSE_FOCUS_MAX_HELD_COMMANDS; index++)
    owner.holdCommand(`code-${index}`);
  assert.equal(owner.getState().heldCommands.length, PAUSE_FOCUS_MAX_HELD_COMMANDS);
  assert.throws(() => owner.holdCommand('overflow'), /capacity exceeded/);
  owner.dispose();
  owner.dispose();
  assert.equal(owner.getStats().disposed, true);
  assert.throws(() => owner.setFocusLost(true), /disposed/);
  assert.throws(() => owner.requestResume(), /disposed/);
});

/** Minimal fake DOM/EventTarget shared with the 025 adapter tests; no jsdom dependency. */
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
function keyboardDom() {
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
  doc.hasFocus = () => true;
  doc.querySelector = () => null;
  const surface = new Element();
  surface.ownerDocument = doc as unknown as Document;
  doc.activeElement = surface;
  const key = (type: string, code: string) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, {
      code,
      repeat: false,
      isComposing: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: false,
    });
    doc.dispatchEvent(event);
  };
  return {
    doc,
    win,
    surface: surface as unknown as HTMLElement,
    key,
  };
}
