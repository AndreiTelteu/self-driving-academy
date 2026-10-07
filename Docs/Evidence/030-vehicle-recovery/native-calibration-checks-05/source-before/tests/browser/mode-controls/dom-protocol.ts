import type { RenderingBackend } from '../../../src/rendering/babylon';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import { createVehicleController } from '../../../src/vehicles/controller';
import { createDefaultSettings } from '../../../src/settings';
import { createControlAuthority, createModeControls, bindModeKeyboard } from '../../../src/input';
import { createControlModeHud } from '../../../src/ui';
import type { ControlMode } from '../../../src/vehicles';
function check(value: boolean, message: string): asserts value {
  if (!value) throw Error(message);
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
/** Additional DOM semantics over real native bodies. Events are synthesized, never trusted input claims. */
export async function domProtocol(
  backend: RenderingBackend,
  classId: 'sedan' | 'compact',
  epoch: number,
) {
  const context = {
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: '067-browser-dom',
    worldEpoch: epoch,
  };
  const world = await createRapierProbe(),
    controller = createVehicleController(context, world);
  for (let i = 0; i < 2; i++) world.addClassCar('dom-' + i, { x: i * 8, y: 0.8, z: 0 }, classId);
  const ids = [world.bodyIdentity('dom-0')!, world.bodyIdentity('dom-1')!];
  const owner = createControlAuthority(context, controller, {
    bodyIdentity: (id) => world.bodyIdentity(id),
  });
  for (const id of ids) owner.register(id);
  let selected = ids[0],
    eligible: boolean | null = true,
    enabled = true,
    now = 0;
  const modes = createModeControls(context, {
    readAuthority: () => owner.getStats(),
    selectedIdentity: () => selected,
    bodyIdentity: (id) => world.bodyIdentity(id),
    eligibility: (identity, current, tick) => ({
      ...current,
      version: '067-mode-eligibility-v1',
      tick,
      identity,
      eligible,
    }),
  });
  const settings = createDefaultSettings('067-dom');
  const binding = bindModeKeyboard({
    surface: backend.canvas,
    bindings: settings.input.bindings,
    port: modes,
    enabled: () => enabled && !owner.getStats().suspended,
  });
  const host = document.getElementById('mode-hud')!;
  const hud = createControlModeHud(host, {
    intent: (key, target) => modes.enqueue(key, target),
    bindings: {
      manualMode: settings.input.bindings.manualMode,
      learningMode: settings.input.bindings.learningMode,
    },
  });
  const root = host.lastElementChild as HTMLElement,
    buttons = root.querySelectorAll('button');
  const rawEvents: unknown[] = [],
    trace: unknown[] = [],
    lifecycle: unknown[] = [];
  const previous = ids.map((id) => world.project(id.entityId).position);
  let maxDisplacementM = 0;
  let result: Record<string, unknown> | undefined;
  const refresh = (advance = 100) => {
    now += advance;
    hud.update(modes.observe(), now);
  };
  const key = (type: 'keydown' | 'keyup', code: string, extras: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...extras });
    check(!e.isTrusted, 'Synthetic event unexpectedly trusted');
    document.dispatchEvent(e);
    rawEvents.push({
      type,
      code,
      isTrusted: e.isTrusted,
      repeat: e.repeat,
      defaultPrevented: e.defaultPrevented,
    });
  };
  const press = (code: string, extras: KeyboardEventInit = {}) => {
    key('keydown', code, extras);
    key('keyup', code, extras);
  };
  const apply = (expected: ControlMode) => {
    const tick = owner.getStats().tick + 1;
    const ticket = modes.prepare({
      ...context,
      version: '067-mode-controls-v1',
      tick,
      dtSeconds: 1 / 60,
    });
    const packets = ids.flatMap((identity) => {
      const base = {
        ...context,
        vehicleId: identity.entityId,
        tick,
        throttle: 0.35,
        brake: 0,
        steering: 0.02,
        handbrake: false,
        turnSignal: 'OFF' as const,
      };
      return [
        { identity, command: { ...base, source: 'AUTONOMY' as const } },
        { identity, command: { ...base, source: 'PLAYER' as const, throttle: 0.4 } },
      ];
    });
    const frame = owner.step(
      { ...context, version: '066-control-authority-v1', tick, dtSeconds: 1 / 60 },
      packets,
      ticket.requests,
    ).frame;
    check(modes.settle(ticket) === 'ACCEPTED', 'DOM settlement failed');
    const view = modes.observe();
    check(view.mode === expected, 'Unexpected DOM accepted mode');
    const players = frame.controls.filter((c) => c.mode !== 'AUTO');
    check(players.length === (expected === 'AUTO' ? 0 : 1), 'DOM multiple player');
    if (players.length)
      check(
        frame.ignoredCommands.some(
          (c) => c.vehicleId === players[0].identity.entityId && c.source === 'AUTONOMY',
        ),
        'DOM AI acted takeover tick',
      );
    for (const [i, id] of ids.entries()) {
      const p = world.project(id.entityId).position,
        d = Math.hypot(p.x - previous[i].x, p.y - previous[i].y, p.z - previous[i].z);
      check(d < 0.7, 'DOM physical discontinuity');
      maxDisplacementM = Math.max(maxDisplacementM, d);
      previous[i] = { ...p };
    }
    trace.push({
      tick,
      view: plain(view),
      requests: plain(ticket.requests),
      controls: plain(frame.controls),
      physical: plain(ids.map((id) => world.project(id.entityId))),
    });
    refresh();
    backend.render();
    return view;
  };
  const unchanged = (before: number, label: string) => {
    check(modes.getStats().intents === before, label + ' enqueued intent');
  };
  const initialMechanics = world.readVehicleMechanics('dom-0');
  const configuration = (m: typeof initialMechanics) => ({
    classId: m.classId,
    version: m.version,
    massKg: m.massKg,
    powerW: m.powerW,
    grip: m.grip,
    brakeAccelerationMps2: m.brakeAccelerationMps2,
    wheels: m.wheels,
    turningRadiusM: m.turningRadiusM,
  });
  try {
    backend.canvas.focus();
    refresh();
    const sixEdges = [];
    for (const [code, to] of [
      ['KeyM', 'MANUAL'],
      ['KeyL', 'LEARNING'],
      ['KeyL', 'MANUAL'],
      ['KeyM', 'AUTO'],
      ['KeyL', 'LEARNING'],
      ['KeyM', 'AUTO'],
    ] as const) {
      const from = modes.observe().mode;
      press(code);
      check(modes.observe().mode === from, 'Optimistic mode');
      apply(to);
      sixEdges.push(from + ':' + code + ':' + to);
    }
    press('KeyM');
    press('KeyM');
    apply('AUTO');
    key('keydown', 'KeyM');
    key('keydown', 'KeyM', { repeat: true });
    key('keydown', 'KeyM');
    check(modes.getStats().intents === 1, 'Held/repeat duplicate');
    apply('MANUAL');
    key('keyup', 'KeyM');
    const editable = document.createElement('input');
    document.body.append(editable);
    editable.focus();
    press('KeyL');
    unchanged(0, 'Editable focus');
    editable.remove();
    backend.canvas.focus();
    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    dialog.showModal();
    press('KeyL');
    unchanged(0, 'Modal focus');
    dialog.close();
    dialog.remove();
    backend.canvas.focus();
    owner.suspend();
    binding.sync();
    press('KeyL');
    unchanged(0, 'Pause');
    owner.resume();
    enabled = false;
    binding.sync();
    press('KeyL');
    unchanged(0, 'Disabled');
    enabled = true;
    key('keydown', 'KeyL');
    check(modes.getStats().intents === 1, 'Blur setup');
    window.dispatchEvent(new Event('blur'));
    unchanged(0, 'Synthetic blur');
    check(binding.getStats().heldCodes === 0, 'Blur held input');
    backend.canvas.focus();
    for (const flags of [
      { isComposing: true },
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
    ]) {
      press('KeyL', flags);
      unchanged(0, 'Modifier/composition');
    }
    const mapped = { ...settings.input.bindings, manualMode: 'ShiftLeft' };
    binding.remap(mapped);
    hud.remap({ manualMode: 'ShiftLeft', learningMode: mapped.learningMode });
    press('ShiftLeft', { shiftKey: true });
    apply('AUTO');
    press('ShiftLeft', { shiftKey: true, ctrlKey: true });
    unchanged(0, 'Mixed modifier');
    binding.remap(settings.input.bindings);
    hud.remap({
      manualMode: settings.input.bindings.manualMode,
      learningMode: settings.input.bindings.learningMode,
    });
    selected = ids[0];
    refresh();
    buttons[0].click();
    apply('MANUAL');
    selected = ids[1];
    refresh();
    check(
      root.textContent!.includes('Vehicul: dom-0') &&
        root.textContent!.includes('Butoanele M/L: dom-1'),
      'Seat/action subject missing',
    );
    buttons[0].click();
    const transfer = apply('MANUAL');
    check(transfer.identity === ids[1], 'Button retargeted');
    selected = ids[0];
    buttons[0].click();
    unchanged(0, 'Stale button without refresh');
    hud.update(modes.observe(), now + 1);
    buttons[0].click();
    unchanged(0, 'Stale10Hz button');
    refresh();
    buttons[1].click();
    apply('LEARNING');
    for (const fact of [true, false, null]) {
      eligible = fact;
      refresh();
      check(modes.observe().learningEligible === fact, 'Explicit eligibility mismatch');
    }
    for (let cycle = 0; cycle < 20; cycle++) {
      const ephemeral = createModeControls(context, {
        readAuthority: () => owner.getStats(),
        selectedIdentity: () => selected,
        bodyIdentity: (id) => world.bodyIdentity(id),
      });
      const ephemeralBinding = bindModeKeyboard({
        surface: backend.canvas,
        bindings: settings.input.bindings,
        port: ephemeral,
      });
      const ephemeralHud = createControlModeHud(host, {
        intent: (action, target) => ephemeral.enqueue(action, target),
        bindings: { manualMode: 'KeyM', learningMode: 'KeyL' },
      });
      ephemeralHud.update(ephemeral.observe(), now);
      const live = {
        modes: plain(ephemeral.getStats()),
        binding: plain(ephemeralBinding.getStats()),
        hud: plain(ephemeralHud.getStats()),
      };
      ephemeralBinding.dispose();
      ephemeralHud.dispose();
      ephemeral.dispose();
      const cleanup = {
        modes: plain(ephemeral.getStats()),
        binding: plain(ephemeralBinding.getStats()),
        hud: plain(ephemeralHud.getStats()),
      };
      check(
        ephemeral.getStats().projection === null &&
          ephemeralBinding.getStats().listeners === 0 &&
          ephemeralHud.getStats().elements === 0,
        'DOM lifecycle retention',
      );
      lifecycle.push({ cycle, live, cleanup });
    }
    const finalMechanics = world.readVehicleMechanics('dom-0');
    check(
      JSON.stringify(configuration(initialMechanics)) ===
        JSON.stringify(configuration(finalMechanics)),
      'DOM immutable mechanics changed',
    );
    check(document.hasFocus() && !document.hidden, 'DOM lost foreground');
    check(
      rawEvents.length <= 64 && trace.length <= 16 && lifecycle.length === 20,
      'DOM bounded evidence caps',
    );
    return (result = {
      caps: {
        nativeBodies: 2,
        rawEvents: 64,
        acceptedTicks: 16,
        lifecycleCycles: 20,
        ownedHudElements: 8,
        ownedHudTextNodes: 7,
        hudListeners: 2,
        keyboardListeners: 6,
        lifecyclePeakHudElements: 16,
        lifecyclePeakListeners: 16,
      },
      classId,
      sixEdges,
      rawEvents,
      trace,
      lifecycle,
      maxDisplacementM,
      initialMechanics: plain(initialMechanics),
      finalMechanics: plain(finalMechanics),
      drivingPoseWrites: 0,
      drivingVelocityWrites: 0,
      scope:
        'Synthetic DOM key/button/focus events over actual native066 accepted steps. No trusted keyboard claim.',
    });
  } finally {
    binding.dispose();
    hud.dispose();
    modes.dispose();
    owner.dispose();
    controller.dispose();
    world.dispose();
    if (result)
      result.cleanup = {
        modes: plain(modes.getStats()),
        binding: plain(binding.getStats()),
        hud: plain(hud.getStats()),
        owner: plain(owner.getStats()),
        controller: plain(controller.getStats()),
        body: plain(world.bodyResources()),
        collision: plain(world.collisionResources()),
      };
  }
}
