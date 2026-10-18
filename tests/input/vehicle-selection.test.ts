import assert from 'node:assert/strict';
import test from 'node:test';
import { createVehicleSelection } from '../../src/input/vehicle-selection';
import type {
  VehicleSelectionPorts,
  SelectionCloseEvent,
  SelectionAssignment,
  SelectionSegmentBoundary,
} from '../../src/input/vehicle-selection';
import { createControlAuthority } from '../../src/input/control-authority';
import { createModeControls } from '../../src/input/mode-controls';
import { createVehicleController } from '../../src/vehicles/controller';
import type { BodyIdentity } from '../../src/vehicles/body-port';
import { CONTROLLER_CONTEXT } from '../vehicles/controller-reference';
import { createFixtureSegmentStore } from './vehicle-selection-reference';

/** Actual024/066/067 owners with a counted synchronous physical test port, not native/GPU evidence. */
function fixture() {
  const context = CONTROLLER_CONTEXT,
    identities = new Map<string, BodyIdentity>();
  let generation = 0,
    steps = 0,
    selected: BodyIdentity | null = null,
    clearCalls = 0;
  const add = (id: string) => {
    const body = Object.freeze({ entityId: id, handle: ++generation, generation });
    identities.set(id, body);
    return body;
  };
  const a = add('a'),
    b = add('b'),
    civil = add('civil');
  selected = a;
  let authorityClear: (() => void) | null = null;
  const controller = createVehicleController(context, {
    bodyIdentity: (id) => identities.get(id),
    step() {
      steps++;
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
  const authority = createControlAuthority(context, controller, {
    bodyIdentity: (id) => identities.get(id),
    clearOldPlayer: () => {
      authorityClear?.();
    },
  });
  for (const id of identities.values()) authority.register(id);
  const modes = createModeControls(context, {
    readAuthority: () => authority.getStats(),
    selectedIdentity: () => selected,
    bodyIdentity: (id) => identities.get(id),
  });
  const segments = createFixtureSegmentStore(context);
  const visible = new Map([...identities.keys()].map((id) => [id, true]));
  const selectable = new Map([...identities.keys()].map((id) => [id, true]));
  const assignments = new Map<string, SelectionAssignment>();
  for (const identity of identities.values())
    assignments.set(
      identity.entityId,
      Object.freeze({
        context,
        identity,
        routeFingerprint: 'route-' + identity.entityId,
        tripFingerprint: identity === civil ? null : 'trip-' + identity.entityId,
      }),
    );
  const hooks: {
    clear?: () => unknown;
    close?: (event: SelectionCloseEvent) => unknown;
    camera?: (identity: BodyIdentity) => unknown;
    readBoundary?: () => SelectionSegmentBoundary | null;
    readCamera?: () => BodyIdentity | null;
  } = {};
  const boundary = (): SelectionSegmentBoundary | null => {
    const current = segments.read();
    if (!current) return null;
    const s = current.segment;
    return {
      context,
      identity: current.identity,
      segmentId: s.segmentId,
      mode: s.controlMode as 'MANUAL' | 'LEARNING',
      startTick: s.startTick,
      endTick: s.endTick,
      completeness: s.completeness as 'OPEN' | 'CLOSED',
      closeReason: s.closeReason as 'VEHICLE_SWITCH' | null,
    };
  };
  const ports: VehicleSelectionPorts = {
    readAuthority: () => authority.getStats(),
    bodyIdentity: (id) => identities.get(id),
    readPresentation: (identity) => ({
      identity,
      kind: identity === civil ? 'CIVIL' : 'TAXI',
      visible: visible.get(identity.entityId) ?? false,
      selectable: selectable.get(identity.entityId) ?? false,
    }),
    readCameraTarget: () => (hooks.readCamera ? hooks.readCamera() : selected),
    selectCamera(identity) {
      if (hooks.camera) {
        const result = hooks.camera(identity);
        if (result !== undefined) return result as never;
      }
      selected = identity;
    },
    clearInput() {
      clearCalls++;
      modes.clear();
      const result = hooks.clear?.();
      if (result !== undefined) return result as never;
    },
    readAssignment: (identity) => assignments.get(identity.entityId)!,
    readBoundary: () => (hooks.readBoundary ? hooks.readBoundary() : boundary()),
    closeBoundary(event) {
      if (hooks.close) {
        const result = hooks.close(event);
        if (result !== undefined) return result as never;
      } else segments.close(event.identity, event.tick);
    },
  };
  const selection = createVehicleSelection(context, ports);
  selection.register(a, 'TAXI');
  selection.register(b, 'TAXI');
  selection.register(civil, 'CIVIL');
  const time = (tick: number) => ({
    ...context,
    version: '066-control-authority-v1' as const,
    tick,
    dtSeconds: 1 / 60,
  });
  const selectionTime = (tick = authority.getStats().tick + 1) => ({
    ...context,
    version: '068-vehicle-selection-v1' as const,
    tick,
    dtSeconds: 1 / 60,
  });
  const claim = (mode: 'MANUAL' | 'LEARNING') => {
    const tick = authority.getStats().tick + 1;
    authority.step(time(tick), [], [{ identity: a, mode }]);
    segments.open(a, mode, tick);
  };
  const apply = () => {
    const ticket = selection.prepare(selectionTime());
    assert.ok(ticket);
    authority.step(time(ticket.tick), [], ticket.requests);
    assert.equal(selection.settle(ticket), 'ACCEPTED');
    return selection.observe();
  };
  const dispose = () => {
    selection.dispose();
    modes.dispose();
    segments.dispose();
    authority.dispose();
    controller.dispose();
  };
  return {
    context,
    add,
    a,
    b,
    civil,
    identities,
    authority,
    controller,
    modes,
    segments,
    selection,
    ports,
    hooks,
    assignments,
    visible,
    selectable,
    claim,
    apply,
    time,
    selectionTime,
    steps: () => steps,
    clearCalls: () => clearCalls,
    selected: () => selected,
    authorityClear: (callback: () => void) => {
      authorityClear = callback;
    },
    dispose,
  };
}

test('068 selection changes camera only, existing066 sole PLAYER remains AUTO on new body', () => {
  const f = fixture();
  try {
    assert.equal(f.selection.enqueue(f.b, 'FLEET'), true);
    assert.equal(f.selected(), f.a);
    const view = f.apply();
    assert.equal(view.selectedIdentity, f.b);
    assert.equal(view.seat, null);
    assert.equal(f.authority.getStats().players, 0);
    assert.equal(f.segments.getStats().closed, 0);
    assert.equal(f.steps(), 1);
  } finally {
    f.dispose();
  }
});
test('068 MANUAL and LEARNING departure releases actual066 then closes actual005 at accepted tick retaining assignment', () => {
  for (const mode of ['MANUAL', 'LEARNING'] as const) {
    const f = fixture();
    try {
      f.claim(mode);
      const original = f.assignments.get('a');
      let closeTick = 0;
      f.hooks.close = (event) => {
        assert.equal(f.authority.getStats().seat, null);
        assert.equal(f.authority.getStats().tick, event.tick);
        assert.equal(event.identity, f.a);
        assert.equal(event.mode, mode);
        closeTick = event.tick;
        f.segments.close(event.identity, event.tick);
      };
      f.selection.enqueue(f.b, 'FLEET');
      const view = f.apply();
      assert.equal(view.seat, null);
      assert.equal(closeTick, 2);
      assert.equal(f.segments.read()!.segment.completeness, 'CLOSED');
      assert.equal(f.segments.read()!.segment.closeReason, 'VEHICLE_SWITCH');
      assert.equal(f.assignments.get('a'), original);
      assert.equal(f.authority.getStats().players, 0);
    } finally {
      f.dispose();
    }
  }
});
test('068 WORLD visibility/selectability and FLEET taxi membership stay distinct', () => {
  const f = fixture();
  try {
    f.visible.set('b', false);
    assert.equal(f.selection.enqueue(f.b, 'WORLD'), false);
    assert.equal(f.selection.enqueue(f.b, 'FLEET'), true);
    f.selection.clearPending();
    assert.equal(f.selection.enqueue(f.civil, 'FLEET'), false);
    assert.equal(f.selection.enqueue(f.civil, 'WORLD'), true);
    f.apply();
    assert.equal(f.selected(), f.civil);
    f.selectable.set('b', false);
    assert.equal(f.selection.enqueue(f.b, 'WORLD'), false);
  } finally {
    f.dispose();
  }
});
test('068 same body is idempotent and contradictory pending burst rejects whole without physical work', () => {
  const f = fixture();
  try {
    f.claim('MANUAL');
    assert.equal(f.selection.enqueue(f.a, 'WORLD'), true);
    assert.equal(f.selection.getStats().pending, 0);
    assert.equal(f.clearCalls(), 0);
    assert.equal(f.segments.getStats().closed, 0);
    f.selection.enqueue(f.b, 'FLEET');
    assert.equal(f.selection.enqueue(f.b, 'WORLD'), true);
    assert.equal(f.selection.enqueue(f.civil, 'WORLD'), false);
    assert.equal(f.selection.getStats().pending, 0);
    assert.equal(f.selection.getStats().conflict, true);
    assert.equal(f.selection.prepare(f.selectionTime()), null);
    assert.equal(f.steps(), 1);
    f.selection.clearPending();
    assert.equal(f.selection.enqueue(f.b, 'FLEET'), true);
  } finally {
    f.dispose();
  }
});
test('068 paused selection stays visibly pending until actual resume/next accepted tick', () => {
  const f = fixture();
  try {
    f.claim('LEARNING');
    f.authority.suspend();
    f.selection.enqueue(f.b, 'FLEET');
    assert.equal(f.selection.observe().pendingIdentity, f.b);
    assert.equal(f.selection.prepare(f.selectionTime()), null);
    assert.equal(f.selected(), f.a);
    assert.equal(f.clearCalls(), 0);
    assert.equal(f.steps(), 1);
    f.authority.resume();
    f.apply();
    assert.equal(f.steps(), 2);
    assert.equal(f.selected(), f.b);
  } finally {
    f.dispose();
  }
});
test('068 missing, foreign or wrong-mode OPEN boundary rejects before clear/physics', () => {
  for (const problem of ['missing', 'foreign', 'wrongMode'] as const) {
    const f = fixture();
    try {
      f.claim('MANUAL');
      const original = f.ports.readBoundary(f.a)!;
      f.hooks.readBoundary = () =>
        problem === 'missing'
          ? null
          : problem === 'foreign'
            ? { ...original, identity: f.b }
            : { ...original, mode: 'LEARNING' };
      f.selection.enqueue(f.b, 'FLEET');
      assert.throws(() => f.selection.prepare(f.selectionTime()));
      assert.equal(f.clearCalls(), 0);
      assert.equal(f.steps(), 1);
      assert.equal(f.authority.getStats().seat!.identity, f.a);
    } finally {
      f.dispose();
    }
  }
});
test('068 exact ticket survives malformed024 batch same-tick retry and rejects forged/late cancellation', () => {
  const f = fixture();
  try {
    f.selection.enqueue(f.b, 'FLEET');
    const ticket = f.selection.prepare(f.selectionTime())!;
    assert.throws(() => f.selection.settle({ ...ticket }), /ticket/);
    assert.throws(() => f.authority.step(f.time(ticket.tick), [{}], ticket.requests));
    assert.equal(f.selection.settle(ticket), 'PENDING');
    assert.equal(f.clearCalls(), 1);
    f.authority.step(f.time(ticket.tick), [], ticket.requests);
    assert.throws(() => f.selection.reject(ticket), /accepted/);
    assert.equal(f.selection.settle(ticket), 'ACCEPTED');
    assert.equal(f.steps(), 1);
  } finally {
    f.dispose();
  }
});
test('068 clearing067 intents prevents selected target from inheriting old pending M/L', () => {
  const f = fixture();
  try {
    f.modes.enqueue('L');
    assert.equal(f.modes.getStats().intents, 1);
    f.selection.enqueue(f.b, 'FLEET');
    f.apply();
    assert.equal(f.modes.getStats().intents, 0);
    assert.equal(
      f.modes.prepare({ ...f.time(2), version: '067-mode-controls-v1' }).requests.length,
      0,
    );
    assert.equal(f.authority.getStats().players, 0);
  } finally {
    f.dispose();
  }
});
test('068 postaccepted close failure/fake acknowledgment/readback mismatch faults without fiction rollback', () => {
  for (const failure of ['throw', 'fake', 'wrongTick'] as const) {
    const f = fixture();
    try {
      f.claim('LEARNING');
      const initial = f.ports.readBoundary(f.a)!;
      f.hooks.close = (event) => {
        if (failure === 'throw') throw Error('close store failure');
        if (failure === 'wrongTick') f.segments.close(event.identity, event.tick + 1);
      };
      f.selection.enqueue(f.b, 'FLEET');
      const ticket = f.selection.prepare(f.selectionTime())!;
      f.authority.step(f.time(ticket.tick), [], ticket.requests);
      assert.equal(f.selection.settle(ticket), 'FAULT');
      const view = f.selection.observe();
      assert.equal(view.tick, 2);
      assert.equal(view.seat, null);
      assert.equal(view.selectedIdentity, f.a);
      assert.match(view.fault!, /SETTLEMENT/);
      assert.throws(() => f.selection.enqueue(f.b, 'FLEET'), /terminal/);
      assert.equal(initial.completeness, 'OPEN');
    } finally {
      f.dispose();
    }
  }
});
test('068 camera failure reports actual new camera and released seat, assignment mutation blocks success', () => {
  for (const failure of ['camera', 'assignment'] as const) {
    const f = fixture();
    try {
      f.claim('MANUAL');
      f.hooks.camera = (identity) => {
        if (failure === 'assignment')
          f.assignments.set('a', { ...f.assignments.get('a')!, routeFingerprint: 'changed' });
        else {
          f.hooks.readCamera = () => identity;
          throw Error('camera partial effect');
        }
      };
      f.selection.enqueue(f.b, 'FLEET');
      const ticket = f.selection.prepare(f.selectionTime())!;
      f.authority.step(f.time(ticket.tick), [], ticket.requests);
      assert.equal(f.selection.settle(ticket), 'FAULT');
      assert.equal(f.selection.observe().seat, null);
      assert.equal(f.selection.observe().tick, 2);
      if (failure === 'camera') assert.equal(f.selection.observe().selectedIdentity, f.b);
      assert.equal(f.segments.getStats().closed, 1);
    } finally {
      f.dispose();
    }
  }
});
test('068 accepted066 KEYBOARD_CLEAR fault remains visible even camera teardown throws', () => {
  const f = fixture();
  try {
    f.claim('MANUAL');
    f.selection.enqueue(f.b, 'FLEET');
    const ticket = f.selection.prepare(f.selectionTime())!;
    f.authorityClear(() => {
      throw Error('keyboard teardown');
    });
    assert.throws(() => f.authority.step(f.time(ticket.tick), [], ticket.requests));
    f.hooks.readCamera = () => {
      throw Error('camera disposed');
    };
    assert.equal(f.selection.settle(ticket), 'FAULT');
    const view = f.selection.observe();
    assert.equal(view.tick, 2);
    assert.equal(view.seat, null);
    assert.equal(view.selectedIdentity, null);
    assert.match(view.fault!, /KEYBOARD_CLEAR/);
    assert.equal(f.segments.getStats().closed, 0);
  } finally {
    f.dispose();
  }
});
test('068 stale incarnation rejected at event/preparation and postaccept expiry faults real tick', () => {
  const f = fixture();
  try {
    f.selection.enqueue(f.b, 'FLEET');
    const ticket = f.selection.prepare(f.selectionTime())!;
    f.authority.step(f.time(ticket.tick), [], ticket.requests);
    const replacement = f.add('b');
    assert.equal(f.selection.settle(ticket), 'FAULT');
    assert.equal(f.selection.observe().tick, 1);
    assert.notEqual(replacement, f.b);
  } finally {
    f.dispose();
  }
  const g = fixture();
  try {
    const stale = g.b;
    g.add('b');
    assert.throws(() => g.selection.enqueue(stale, 'FLEET'), /Stale/);
    assert.equal(g.steps(), 0);
  } finally {
    g.dispose();
  }
});
test('068 close/camera callback cannot replace target or departed incarnation and return accepted', () => {
  for (const stage of [
    'close-target',
    'close-departed',
    'camera-target',
    'camera-departed',
    'remove-close-target',
    'remove-close-departed',
    'remove-camera-target',
    'remove-camera-departed',
  ] as const) {
    const f = fixture();
    try {
      f.claim('MANUAL');
      const targetId = stage.endsWith('target') ? 'b' : 'a';
      const expire = () => {
        if (stage.startsWith('remove-')) f.identities.delete(targetId);
        else f.add(targetId);
      };
      if (stage.includes('camera')) f.hooks.camera = expire;
      else
        f.hooks.close = (event) => {
          f.segments.close(event.identity, event.tick);
          expire();
        };
      f.selection.enqueue(f.b, 'FLEET');
      const ticket = f.selection.prepare(f.selectionTime())!;
      f.authority.step(f.time(ticket.tick), [], ticket.requests);
      assert.equal(f.selection.settle(ticket), 'FAULT');
      assert.equal(f.selection.observe().tick, 2);
      assert.equal(f.selection.observe().seat, null);
      assert.equal(f.segments.getStats().closed, 1);
      assert.equal(f.selection.observe().selectedIdentity, stage.includes('camera') ? f.b : f.a);
      assert.match(f.selection.observe().fault!, /Stale/);
    } finally {
      f.dispose();
    }
  }
});
test('068 descriptor/port/reentrant/async callback rejection preserves bounded fault and accepted truth', () => {
  const f = fixture();
  try {
    let gets = 0;
    const malicious = { ...f.b };
    Object.defineProperty(malicious, 'entityId', {
      enumerable: true,
      get() {
        gets++;
        return 'b';
      },
    });
    assert.throws(() => f.selection.enqueue(malicious, 'FLEET'));
    assert.equal(gets, 0);
    assert.throws(() => f.selection.enqueue({ ...f.b, extra: 1 } as BodyIdentity, 'FLEET'));
    assert.throws(() =>
      createVehicleSelection(f.context, { ...f.ports, clearInput: Promise.resolve() as never }),
    );
    f.hooks.clear = () => f.selection.enqueue(f.civil, 'WORLD');
    f.selection.enqueue(f.b, 'FLEET');
    assert.throws(() => f.selection.prepare(f.selectionTime()), /reentrant/);
    assert.equal(f.selection.observe().tick, 0);
    assert.match(f.selection.observe().fault!, /INPUT_CLEAR/);
  } finally {
    f.dispose();
  }
  const g = fixture();
  try {
    g.hooks.clear = () => Promise.resolve();
    g.selection.enqueue(g.b, 'FLEET');
    assert.throws(() => g.selection.prepare(g.selectionTime()), /synchronous/);
    assert.equal(g.steps(), 0);
  } finally {
    g.dispose();
  }
});
test('068 callback cannot secretly advance authority; terminal projection reports actual accepted tick', () => {
  const f = fixture();
  try {
    f.hooks.clear = () => {
      f.authority.step(f.time(1));
    };
    f.selection.enqueue(f.b, 'FLEET');
    assert.throws(() => f.selection.prepare(f.selectionTime()), /changed authority/);
    assert.equal(f.selection.observe().tick, 1);
    assert.match(f.selection.observe().fault!, /INPUT_CLEAR/);
    assert.equal(f.selected(), f.a);
  } finally {
    f.dispose();
  }
});
test('068 registration110 cap and twenty disposed lifecycles release all owned references', () => {
  for (let cycle = 0; cycle < 20; cycle++) {
    const f = fixture();
    try {
      for (let i = 3; i < 110; i++) f.selection.register(f.add('extra-' + i), 'TAXI');
      assert.equal(f.selection.getStats().vehicles, 110);
      assert.throws(() => f.selection.register(f.add('overflow'), 'TAXI'), /capacity/);
      f.selection.enqueue(f.b, 'FLEET');
      f.selection.prepare(f.selectionTime());
      f.selection.dispose();
      f.selection.dispose();
      assert.deepEqual(f.selection.getStats(), {
        vehicles: 0,
        pending: 0,
        inFlight: 0,
        projection: null,
        conflict: false,
        disposed: true,
        fault: null,
        retainedHistory: 0,
      });
      assert.throws(() => f.selection.observe(), /disposed/);
    } finally {
      f.dispose();
    }
  }
});
