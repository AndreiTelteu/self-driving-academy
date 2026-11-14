import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bindKeyboardDriveInput,
  createInputAuthorityArbiter,
  isEmptyAuthorityCommand,
  type AuthorityTickResult,
  type InputAuthorityArbiter,
} from '../../src/input';
import {
  createRectanglePolygon,
  createWalker,
  createWalkWorld,
  type Walker,
  type WalkerInput,
} from '../../src/character';
import { createDefaultSettings } from '../../src/settings';
import { createFocusFixture } from './focus-fixture';

const CONTEXT = {
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'session-193-focus',
  worldEpoch: 1,
};

function flatWalker(): Walker {
  const world = createWalkWorld({
    surfaces: [
      {
        id: 'focus-ground',
        kind: 'STREET',
        topM: 0,
        vertices: createRectanglePolygon('focus-ground', { x: 0, z: 0 }, { x: 80, z: 80 }).vertices,
      },
    ],
  });
  return createWalker({
    world,
    start: { positionM: { x: 0, y: 0, z: 0 }, yawRad: 0 },
    entityId: 'focus-walker',
  });
}

function inputOf(result: AuthorityTickResult): WalkerInput {
  if (result.command.consumer !== 'CHARACTER') throw new Error('expected the character authority');
  return result.command.input;
}

function run(walker: Walker, ticks: number, input: WalkerInput): number {
  for (let index = 0; index < ticks; index += 1)
    walker.step({ tick: walker.state.tick + 1, input });
  return walker.stats.distanceM;
}

function fixture() {
  const dom = createFocusFixture();
  const settings = createDefaultSettings('193-focus');
  const arbiter: InputAuthorityArbiter = createInputAuthorityArbiter({
    context: CONTEXT,
    authority: { consumer: 'CHARACTER', characterId: 'player-character' },
  });
  const binding = bindKeyboardDriveInput({
    surface: dom.surface as unknown as HTMLElement,
    bindings: settings.input.bindings,
    port: arbiter.port,
  });
  return {
    dom,
    arbiter,
    binding,
    walker: flatWalker(),
    throttle: settings.input.bindings.throttle,
    brake: settings.input.bindings.brake,
  };
}

test('a key pressed while the focus is in a text field never moves the character', () => {
  const f = fixture();
  assert.equal(f.binding.sync(), true);
  f.dom.setBlocked(true);
  assert.equal(f.binding.sync(), false);
  const event = f.dom.key('keydown', f.throttle);
  assert.equal(event.defaultPrevented, false);
  const tick = f.arbiter.step({ tick: 1, characterYawRad: f.walker.state.yawRad });
  assert.equal(f.arbiter.getStats().held, 0);
  assert.equal(isEmptyAuthorityCommand(tick.command), true);
  assert.equal(run(f.walker, 60, inputOf(tick)), 0);
  assert.equal(f.walker.state.clipId, 'idle');
  f.binding.dispose();
  f.arbiter.dispose();
  assert.equal(f.dom.listeners(), 0);
});

test('leaving the text field re-arms the same key immediately', () => {
  const f = fixture();
  f.dom.setBlocked(true);
  f.binding.sync();
  f.dom.key('keydown', f.throttle);
  const blockedTick = f.arbiter.step({ tick: 1, characterYawRad: f.walker.state.yawRad });
  assert.equal(isEmptyAuthorityCommand(blockedTick.command), true);

  f.dom.setBlocked(false);
  assert.equal(f.binding.sync(), true);
  const event = f.dom.key('keydown', f.throttle);
  assert.equal(event.defaultPrevented, true);
  const activeTick = f.arbiter.step({ tick: 2, characterYawRad: f.walker.state.yawRad });
  assert.equal(isEmptyAuthorityCommand(activeTick.command), false);
  assert.equal(inputOf(activeTick).gait, 'WALK');
  assert.ok(run(f.walker, 60, inputOf(activeTick)) > 0.5);
  f.binding.dispose();
  f.arbiter.dispose();
});

test('a held key is flushed by blur, by a modal dialog and by hidden document', () => {
  const f = fixture();
  f.dom.key('keydown', f.throttle);
  assert.equal(f.arbiter.getStats().held, 1);
  f.dom.setFocus(false);
  f.dom.win.dispatchEvent(new Event('blur'));
  assert.equal(f.arbiter.getStats().held, 0);
  const tick = f.arbiter.step({ tick: 1, characterYawRad: 0 });
  assert.equal(isEmptyAuthorityCommand(tick.command), true);

  f.dom.setFocus(true);
  f.dom.key('keydown', f.throttle);
  assert.equal(f.arbiter.getStats().held, 1);
  f.dom.setModal(true);
  assert.equal(f.binding.sync(), false);
  assert.equal(f.arbiter.getStats().held, 0);
  const modalTick = f.arbiter.step({ tick: 2, characterYawRad: 0 });
  assert.equal(isEmptyAuthorityCommand(modalTick.command), true);

  f.dom.setModal(false);
  f.binding.sync();
  f.dom.key('keydown', f.throttle);
  assert.equal(f.arbiter.getStats().held, 1);
  f.dom.setHidden(true);
  f.dom.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.arbiter.getStats().held, 0);
  const hiddenTick = f.arbiter.step({ tick: 3, characterYawRad: 0 });
  assert.equal(isEmptyAuthorityCommand(hiddenTick.command), true);

  f.binding.dispose();
  f.arbiter.dispose();
  assert.equal(f.dom.listeners(), 0);
});

test('repeat, modified or composing keydown never restores input over a text field', () => {
  const f = fixture();
  f.dom.setBlocked(true);
  f.binding.sync();
  f.dom.key('keydown', f.throttle, { repeat: true });
  f.dom.key('keydown', f.throttle, { ctrlKey: true });
  f.dom.key('keydown', f.throttle, { isComposing: true });
  f.dom.key('keydown', f.throttle, { shiftKey: true });
  assert.equal(f.arbiter.getStats().held, 0);
  const tick = f.arbiter.step({ tick: 1, characterYawRad: 0 });
  assert.equal(isEmptyAuthorityCommand(tick.command), true);
  assert.equal(run(f.walker, 30, inputOf(tick)), 0);

  // Controlul negativ: în afara câmpului, aceeași tastă produce intenție.
  f.dom.setBlocked(false);
  f.binding.sync();
  f.dom.key('keydown', f.throttle);
  const active = f.arbiter.step({ tick: 2, characterYawRad: 0 });
  assert.equal(isEmptyAuthorityCommand(active.command), false);
  f.binding.dispose();
  f.arbiter.dispose();
});

test('keyup still releases while the focus is in a text field', () => {
  const f = fixture();
  f.dom.key('keydown', f.throttle);
  f.dom.key('keydown', f.brake);
  f.dom.setBlocked(true);
  f.binding.sync();
  assert.equal(f.arbiter.getStats().held, 0);
  f.dom.key('keyup', f.throttle);
  f.dom.key('keyup', f.brake);
  f.dom.setBlocked(false);
  f.binding.sync();
  const tick = f.arbiter.step({ tick: 1, characterYawRad: 0 });
  assert.equal(isEmptyAuthorityCommand(tick.command), true);
  f.binding.dispose();
  f.arbiter.dispose();
});
