import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  createPauseFocusOwner,
  createPanelAccessibilityBridge,
  readAccessibilityReport,
  requireAccessibleUi,
} from '../../src/app';
import {
  ACCESSIBILITY_TOKENS,
  ACCESSIBILITY_VERSION,
  PANEL_FOCUSABLE_SELECTOR,
  PANEL_IDS,
  PANEL_SURFACES,
  auditPanelAccessibility,
  contrastRatio,
  createPanelFocusController,
  drivingBlockReason,
  drivingKeysBlocked,
  focusableControls,
  panelDescriptor,
  planPanelTraversal,
  relativeLuminance,
  requiredContrast,
} from '../../src/ui';
import type { AccessibilityMode, PanelSurfaceDescriptor, PanelTraversalPlan } from '../../src/ui';

const realFleet = panelDescriptor('fleet');

function brokenDescriptor(overrides: Partial<PanelSurfaceDescriptor>): PanelSurfaceDescriptor {
  return Object.freeze({ ...realFleet, ...overrides });
}

function codesOf(descriptors: readonly PanelSurfaceDescriptor[]): readonly string[] {
  return auditPanelAccessibility(descriptors).issues.map((issue) => issue.code);
}

// ---------------------------------------------------------------------------------------------
// Deterministic focus DOM: a panel element, its tab stops and an owned document.
// ---------------------------------------------------------------------------------------------

interface FakeKeyEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

class FakeNote {
  readonly tagName: string;
  readonly attrs = new Map<string, string>();
  className = '';
  textContent = '';
  removed = false;
  constructor(tagName: string) {
    this.tagName = tagName;
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  remove(): void {
    this.removed = true;
  }
}

class FakeControl {
  readonly attrs = new Map<string, string>();
  hidden = false;
  focused = 0;
  private readonly owner: FakePanelElement;
  constructor(
    owner: FakePanelElement,
    init: Readonly<{
      tabindex?: string;
      disabled?: boolean;
      hidden?: boolean;
      ariaHidden?: string;
    }> = {},
  ) {
    this.owner = owner;
    if (init.tabindex !== undefined) this.attrs.set('tabindex', init.tabindex);
    if (init.disabled === true) this.attrs.set('disabled', '');
    if (init.ariaHidden !== undefined) this.attrs.set('aria-hidden', init.ariaHidden);
    this.hidden = init.hidden === true;
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
  focus(): void {
    this.focused += 1;
    this.owner.ownerDocument.activeElement = this;
  }
}

interface FakeDocument {
  activeElement: FakeControl | null;
  createElement(tagName: string): FakeNote;
}

class FakePanelElement {
  readonly ownerDocument: FakeDocument;
  readonly controls: FakeControl[];
  readonly notes: FakeNote[] = [];
  readonly attrs = new Map<string, string>();
  private readonly listeners = new Map<string, ((event: FakeKeyEvent) => void)[]>();
  constructor(
    controls: readonly Readonly<{
      tabindex?: string;
      disabled?: boolean;
      hidden?: boolean;
      ariaHidden?: string;
    }>[],
    documentRef?: FakeDocument,
  ) {
    this.ownerDocument =
      documentRef ??
      ({
        activeElement: null,
        createElement: (tagName: string) => new FakeNote(tagName),
      } satisfies FakeDocument);
    this.controls = controls.map((init) => new FakeControl(this, init));
  }
  querySelectorAll(selector: string): FakeControl[] {
    return selector === PANEL_FOCUSABLE_SELECTOR ? [...this.controls] : [];
  }
  addEventListener(type: string, listener: (event: FakeKeyEvent) => void): void {
    const existing = this.listeners.get(type);
    if (existing === undefined) this.listeners.set(type, [listener]);
    else if (!existing.includes(listener)) existing.push(listener);
  }
  removeEventListener(type: string, listener: (event: FakeKeyEvent) => void): void {
    const existing = this.listeners.get(type);
    if (existing === undefined) return;
    this.listeners.set(
      type,
      existing.filter((candidate) => candidate !== listener),
    );
  }
  get listenerCount(): number {
    let total = 0;
    for (const list of this.listeners.values()) total += list.length;
    return total;
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
  append(node: FakeNote): void {
    this.notes.push(node);
  }
  dispatchKey(init: Readonly<{ key: string; shiftKey?: boolean }>): FakeKeyEvent {
    let defaultPrevented = false;
    const event: FakeKeyEvent = {
      key: init.key,
      shiftKey: init.shiftKey === true,
      get defaultPrevented() {
        return defaultPrevented;
      },
      preventDefault: () => {
        defaultPrevented = true;
      },
    };
    for (const listener of [...(this.listeners.get('keydown') ?? [])]) listener(event);
    return event;
  }
}

function asElement(panel: FakePanelElement): HTMLElement {
  return panel as unknown as HTMLElement;
}

function controllerFor(panel: FakePanelElement, closed: string[]) {
  return createPanelFocusController(asElement(panel), {
    close: (panelId) => {
      closed.push(panelId);
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Contrast contract
// ---------------------------------------------------------------------------------------------

test('083 contrast ratio matches known WCAG pairs and is symmetric', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#ffffff', '#000000'), 21);
  assert.equal(contrastRatio('#777777', '#ffffff'), 4.48);
  assert.equal(contrastRatio('#767676', '#ffffff'), 4.54);
  assert.equal(contrastRatio('#fff', '#000'), 21);
  assert.equal(contrastRatio('#f3f7fb', '#0d1714'), 16.97);
  assert.equal(contrastRatio('#9edbb5', '#0d1714'), 11.53);
  assert.ok(Math.abs(relativeLuminance('#000000')) < 1e-12);
  assert.ok(Math.abs(relativeLuminance('#ffffff') - 1) < 1e-12);
  assert.throws(() => contrastRatio('#ffffff2b', '#000000'), /hex colour/);
  assert.throws(() => contrastRatio('red', '#000000'), /hex colour/);
});

test('083 required contrast separates normal text, large text and non-text indicators', () => {
  assert.equal(requiredContrast(12, 400), 4.5);
  assert.equal(requiredContrast(18, 700), 4.5);
  assert.equal(requiredContrast(18.66, 700), 3);
  assert.equal(requiredContrast(24, 400), 3);
  assert.equal(requiredContrast(0, 400), 3);
  assert.equal(ACCESSIBILITY_TOKENS.version, ACCESSIBILITY_VERSION);
  assert.throws(() => requiredContrast(-1, 400), /non-negative/);
  assert.throws(() => requiredContrast(12, 0), /positive/);
});

test('083 the real panel descriptors pass the audit with exact measured ratios', () => {
  assert.equal(PANEL_SURFACES.length, 10);
  assert.deepEqual(
    PANEL_SURFACES.map((panel) => panel.id),
    [...PANEL_IDS],
  );
  const audit = auditPanelAccessibility(PANEL_SURFACES);
  assert.equal(audit.pass, true);
  assert.equal(audit.tokensVersion, ACCESSIBILITY_VERSION);
  assert.equal(audit.issues.length, 0);
  assert.equal(audit.summary.panels, 10);
  assert.equal(audit.summary.failed, 0);
  assert.equal(audit.summary.passed, 10);
  assert.ok(audit.summary.contrastPairs >= 60);
  assert.ok(audit.summary.focusables >= 15);
  for (const panel of audit.panels) {
    assert.equal(panel.pass, true, `${panel.id} must pass`);
    assert.ok(panel.contrast.every((entry) => entry.pass && entry.ratio >= entry.required));
  }
  const fleet = audit.panels.find((panel) => panel.id === 'fleet')!;
  const text = fleet.contrast.find((entry) => entry.pairId === 'text-on-surface')!;
  assert.equal(text.ratio, 16.97);
  assert.equal(text.required, 4.5);
  const focus = fleet.contrast.find((entry) => entry.pairId === 'focus-on-surface')!;
  assert.equal(focus.ratio, 11.53);
  assert.equal(focus.required, 3);
  assert.equal(focus.target, 'nonText');
});

test('083 an injected descriptor without a name reports MISSING_NAME', () => {
  const audit = auditPanelAccessibility([brokenDescriptor({ name: '   ' })]);
  assert.equal(audit.pass, false);
  assert.deepEqual(codesOf([brokenDescriptor({ name: '' })]), ['MISSING_NAME']);
});

test('083 an interactive descriptor without a tab stop reports NO_FOCUSABLE', () => {
  const codes = codesOf([brokenDescriptor({ focusableSelectors: [] })]);
  assert.deepEqual(codes, ['NO_FOCUSABLE']);
});

test('083 an interactive descriptor without a visible focus ring reports MISSING_VISIBLE_FOCUS', () => {
  const codes = codesOf([
    brokenDescriptor({
      focusVisible: {
        selector: '',
        outlineStyle: 'solid',
        outlineWidthPx: 0,
        outlineOffsetPx: 0,
      },
    }),
  ]);
  assert.deepEqual(codes, ['MISSING_VISIBLE_FOCUS']);
  assert.deepEqual(
    codesOf([
      brokenDescriptor({
        focusVisible: {
          selector: '.fleet-panel__row:focus-visible',
          outlineStyle: 'solid',
          outlineWidthPx: 1,
          outlineOffsetPx: 2,
        },
      }),
    ]),
    ['MISSING_VISIBLE_FOCUS'],
  );
});

test('083 an injected global key listener reports GLOBAL_KEY_LISTENER', () => {
  assert.deepEqual(codesOf([brokenDescriptor({ ownsGlobalKeyListener: true })]), [
    'GLOBAL_KEY_LISTENER',
  ]);
});

test('083 a colour-only state reports COLOR_ONLY_STATE', () => {
  assert.deepEqual(codesOf([brokenDescriptor({ stateIsTextBacked: false })]), ['COLOR_ONLY_STATE']);
});

test('083 a button without type="button" reports MISSING_TYPE_BUTTON', () => {
  assert.deepEqual(
    codesOf([
      brokenDescriptor({
        controls: [
          {
            selector: 'button.fleet-panel__row',
            role: 'button',
            keyboardNative: true,
            explicitTypeButton: false,
            count: 'dynamic',
          },
        ],
      }),
    ]),
    ['MISSING_TYPE_BUTTON'],
  );
});

test('083 a non-native control or a modal without Escape reports NOT_KEYBOARD_OPERABLE', () => {
  assert.deepEqual(codesOf([brokenDescriptor({ keyboardOperable: false })]), [
    'NOT_KEYBOARD_OPERABLE',
  ]);
  assert.deepEqual(
    codesOf([
      brokenDescriptor({
        controls: [
          {
            selector: 'div.fake-control',
            role: 'input',
            keyboardNative: false,
            explicitTypeButton: true,
            count: 1,
          },
        ],
      }),
    ]),
    ['NOT_KEYBOARD_OPERABLE'],
  );
  assert.deepEqual(codesOf([brokenDescriptor({ modal: true, closeKey: null })]), [
    'NOT_KEYBOARD_OPERABLE',
  ]);
});

test('083 a low-contrast pair reports the exact measured ratio and requirement', () => {
  const audit = auditPanelAccessibility([
    brokenDescriptor({
      contrast: [
        { id: 'bad-text', foreground: '#ffffff', background: '#ffffff', sizePx: 14, weight: 400 },
      ],
    }),
  ]);
  const issue = audit.issues[0]!;
  assert.equal(issue.code, 'LOW_CONTRAST');
  assert.equal(issue.ratio, 1);
  assert.equal(issue.required, 4.5);
  assert.match(issue.detail, /1\.00:1, requires 4\.50:1/);
  assert.equal(audit.panels[0]!.contrast[0]!.pass, false);
});

test('083 the report fails on an injected broken panel and passes on the real panels', () => {
  const pass = readAccessibilityReport();
  assert.equal(pass.pass, true);
  assert.deepEqual(pass.failures, []);
  assert.equal(pass.contractVersion, ACCESSIBILITY_VERSION);
  assert.ok(pass.contrast.length >= 10);
  assert.equal(requireAccessibleUi(pass), undefined);

  const failing = readAccessibilityReport({
    panels: [brokenDescriptor({ ownsGlobalKeyListener: true })],
  });
  assert.equal(failing.pass, false);
  assert.match(failing.failures[0]!, /^GLOBAL_KEY_LISTENER: fleet:/);
  assert.throws(() => requireAccessibleUi(failing), /accessibility audit failed/);
  assert.equal(readAccessibilityReport({ panels: [] }).pass, false);
});

// ---------------------------------------------------------------------------------------------
// Traversal and driving-block model
// ---------------------------------------------------------------------------------------------

test('083 traversal plans the tab order and the expected effect of every key', () => {
  const fleet: PanelTraversalPlan = planPanelTraversal('fleet');
  assert.equal(fleet.trapsFocus, true);
  assert.equal(fleet.modal, false);
  assert.deepEqual(
    fleet.focusOrder.map((entry) => entry.selector),
    [...realFleet.focusableSelectors],
  );
  assert.deepEqual(
    fleet.steps.map((step) => step.key),
    ['Tab', 'Shift+Tab', 'Escape', 'Enter', 'Space'],
  );
  assert.match(fleet.steps[0]!.effect, /wraps to the first/);
  assert.match(fleet.steps[2]!.effect, /restores the previous focus/);

  const settings = planPanelTraversal('gameSettings');
  assert.equal(settings.modal, true);
  assert.equal(settings.trapsFocus, true);
  assert.equal(settings.closeKey, 'Escape');

  const minimap = planPanelTraversal('minimap');
  assert.equal(minimap.trapsFocus, false);
  assert.equal(minimap.focusOrder.length, 0);
  assert.match(minimap.steps[2]!.effect, /No close key/);
  assert.throws(() => planPanelTraversal('missingPanel'), /Unknown panel/);
});

test('083 the driving-block matrix follows 070 per surface and mode', () => {
  const modes: readonly AccessibilityMode[] = ['AUTO', 'MANUAL', 'LEARNING'];
  assert.deepEqual(
    modes.map((mode) => drivingKeysBlocked('fleet', true, mode)),
    [false, true, true],
  );
  assert.deepEqual(
    modes.map((mode) => drivingKeysBlocked('gameSettings', true, mode)),
    [true, true, true],
  );
  assert.deepEqual(
    modes.map((mode) => drivingKeysBlocked('keyRemapping', true, mode)),
    [true, true, true],
  );
  assert.deepEqual(
    modes.map((mode) => drivingKeysBlocked('minimap', true, mode)),
    [false, false, false],
  );
  assert.deepEqual(
    modes.map((mode) => drivingKeysBlocked('learningNotifications', true, mode)),
    [false, false, false],
  );
  assert.equal(drivingKeysBlocked('fleet', false, 'MANUAL'), false);
  assert.equal(drivingBlockReason('fleet', true, 'MANUAL'), 'SUSPENDS_PANEL');
  assert.equal(drivingBlockReason('gameSettings', true, 'AUTO'), 'SUSPENDS_MENU');
  assert.equal(drivingBlockReason('minimap', true, 'MANUAL'), null);
  assert.throws(() => drivingKeysBlocked('missingPanel', true, 'AUTO'), /Unknown panel/);
});

// ---------------------------------------------------------------------------------------------
// Focus controller
// ---------------------------------------------------------------------------------------------

test('083 focusableControls keeps only real tab stops', () => {
  const panel = new FakePanelElement([
    {},
    { tabindex: '0' },
    { tabindex: '-1' },
    { disabled: true },
    { hidden: true },
    { ariaHidden: 'true' },
  ]);
  assert.equal(focusableControls(asElement(panel)).length, 2);
});

test('083 opening a panel focuses the first control and leaves Enter/Space native', () => {
  const panel = new FakePanelElement([{}, {}, {}]),
    closed: string[] = [],
    trigger = new FakeControl(panel);
  panel.ownerDocument.activeElement = trigger;
  const controller = controllerFor(panel, closed);
  assert.equal(controller.open('fleet', asElement(panel)), true);
  assert.equal(controller.isOpen(), true);
  assert.equal(controller.activePanelId(), 'fleet');
  assert.equal(panel.ownerDocument.activeElement, panel.controls[0]);
  assert.equal(panel.controls[0]!.focused, 1);
  assert.equal(controller.getStats().focusables, 3);
  assert.equal(controller.getStats().listeners, 1);
  assert.equal(controller.getStats().globalListeners, 0);

  const enter = panel.dispatchKey({ key: 'Enter' });
  const space = panel.dispatchKey({ key: ' ' });
  assert.equal(enter.defaultPrevented, false);
  assert.equal(space.defaultPrevented, false);
  assert.deepEqual(closed, []);
  assert.equal(controller.isOpen(), true);
});

test('083 Tab cycles inside a modal panel, Shift+Tab reverses and both wrap', () => {
  const panel = new FakePanelElement([{}, {}, {}]),
    closed: string[] = [],
    controller = controllerFor(panel, closed);
  controller.open('gameSettings', asElement(panel));

  const firstTab = panel.dispatchKey({ key: 'Tab' });
  assert.equal(firstTab.defaultPrevented, true);
  assert.equal(panel.ownerDocument.activeElement, panel.controls[1]);
  panel.dispatchKey({ key: 'Tab' });
  assert.equal(panel.ownerDocument.activeElement, panel.controls[2]);
  panel.dispatchKey({ key: 'Tab' });
  assert.equal(panel.ownerDocument.activeElement, panel.controls[0]);
  assert.equal(controller.getStats().wraps, 1);

  panel.dispatchKey({ key: 'Tab', shiftKey: true });
  assert.equal(panel.ownerDocument.activeElement, panel.controls[2]);
  assert.equal(controller.getStats().wraps, 2);
  assert.equal(closed.length, 0);
});

test('083 Escape closes through the port and restores the previous focus', () => {
  const panel = new FakePanelElement([{}, {}]),
    closed: string[] = [],
    trigger = new FakeControl(panel),
    controller = controllerFor(panel, closed);
  panel.ownerDocument.activeElement = trigger;
  controller.open('profileHistory', asElement(panel));
  assert.equal(panel.ownerDocument.activeElement, panel.controls[0]);

  const escape = panel.dispatchKey({ key: 'Escape' });
  assert.equal(escape.defaultPrevented, true);
  assert.deepEqual(closed, ['profileHistory']);
  assert.equal(controller.isOpen(), false);
  assert.equal(controller.activePanelId(), null);
  assert.equal(panel.ownerDocument.activeElement, trigger);
  assert.equal(trigger.focused, 1);
  assert.equal(controller.getStats().restores, 1);
  assert.equal(controller.getStats().escapes, 1);
  assert.equal(panel.listenerCount, 0);
});

test('083 a panel without a focusable control fails closed with a visible reason', () => {
  const panel = new FakePanelElement([{ tabindex: '-1' }, { disabled: true }, { hidden: true }]),
    closed: string[] = [],
    controller = controllerFor(panel, closed);
  assert.equal(controller.open('fleet', asElement(panel)), false);
  assert.equal(controller.isOpen(), false);
  assert.equal(controller.activePanelId(), null);
  assert.equal(panel.listenerCount, 0);
  assert.equal(panel.getAttribute('data-focus-state'), 'NO_FOCUSABLE');
  assert.match(panel.getAttribute('data-focus-reason') ?? '', /niciun control focalizabil/);
  assert.equal(panel.notes.length, 1);
  assert.equal(panel.notes[0]!.getAttribute('role'), 'alert');
  assert.equal(controller.getStats().failures, 1);
  assert.equal(controller.getStats().lastFailure, 'NO_FOCUSABLE: fleet');
  assert.deepEqual(closed, []);
});

test('083 listeners stay scoped to the panel element; no global document/window listener exists', () => {
  const panel = new FakePanelElement([{}]),
    controller = controllerFor(panel, []);
  controller.open('fleet', asElement(panel));
  assert.equal(panel.listenerCount, 1);
  assert.equal(controller.getStats().listeners, 1);
  assert.equal(controller.getStats().globalListeners, 0);
  assert.equal((globalThis as unknown as { document?: unknown }).document, undefined);
  assert.equal((globalThis as unknown as { window?: unknown }).window, undefined);
  // Driving keys pass through untouched: the controller only handles Tab and Escape.
  const driving = panel.dispatchKey({ key: 'w' });
  assert.equal(driving.defaultPrevented, false);
  controller.close();
  assert.equal(panel.listenerCount, 0);
});

test('083 dispose is idempotent and releases the panel listener', () => {
  const panel = new FakePanelElement([{}]),
    controller = controllerFor(panel, []);
  controller.open('fleet', asElement(panel));
  controller.dispose();
  assert.equal(controller.isOpen(), false);
  assert.equal(panel.listenerCount, 0);
  assert.equal(controller.getStats().listeners, 0);
  assert.equal(controller.getStats().disposed, true);
  controller.dispose();
  assert.throws(() => controller.open('fleet', asElement(panel)), /disposed/);
});

test('083 shouldSuspendDriving uses the panel descriptor, not a copy of 070', () => {
  const panel = new FakePanelElement([{}]),
    controller = controllerFor(panel, []);
  assert.equal(controller.shouldSuspendDriving('MANUAL'), false);
  controller.open('fleet', asElement(panel));
  assert.equal(controller.shouldSuspendDriving('AUTO'), false);
  assert.equal(controller.shouldSuspendDriving('MANUAL'), true);
  assert.equal(controller.shouldSuspendDriving('LEARNING'), true);
  controller.close();
  controller.open('minimap', asElement(panel));
  assert.equal(controller.shouldSuspendDriving('MANUAL'), false);
});

// ---------------------------------------------------------------------------------------------
// 070 bridge
// ---------------------------------------------------------------------------------------------

function pauseFocusHarness() {
  const calls = { suspend: [] as string[], resume: [] as string[], reset: 0 };
  const owner = createPauseFocusOwner({
    suspend: (cause) => calls.suspend.push(cause),
    resume: (cause) => calls.resume.push(cause),
    resetHeldCommands: () => {
      calls.reset += 1;
    },
  });
  return { owner, calls };
}

test('083 the bridge suspends per 070, resets held keys and never claims PLAYER', () => {
  const { owner, calls } = pauseFocusHarness(),
    closed: string[] = [],
    bridge = createPanelAccessibilityBridge({
      pauseFocus: owner,
      closePanel: (panelId) => closed.push(panelId),
      resetHeldCommands: () => {
        calls.reset += 1;
      },
    });
  owner.setMode('MANUAL');
  assert.equal(bridge.open('fleet'), true);
  assert.equal(bridge.open('fleet'), false);
  assert.equal(owner.getState().suspended, true);
  assert.equal(owner.getState().cause, 'panel');
  assert.equal(bridge.shouldSuspendDriving('MANUAL'), true);
  assert.equal(bridge.shouldSuspendDriving('AUTO'), false);
  assert.equal(owner.getState().heldCommands.length, 0);

  assert.equal(bridge.close('fleet'), true);
  assert.deepEqual(closed, ['fleet']);
  assert.equal(owner.getState().suspended, false);
  assert.ok(calls.reset >= 1);
  assert.equal(bridge.getStats().heldResets, 1);
  assert.equal(bridge.getStats().claimedPlayer, false);
  assert.equal(bridge.getState().claimedPlayer, false);
  bridge.dispose();
});

test('083 AUTO observation stays live while a menu still suspends and diagnostics never do', () => {
  const { owner } = pauseFocusHarness(),
    closed: string[] = [],
    bridge = createPanelAccessibilityBridge({
      pauseFocus: owner,
      closePanel: (panelId) => closed.push(panelId),
      resetHeldCommands: () => undefined,
    });
  owner.setMode('AUTO');
  bridge.open('fleet');
  assert.equal(owner.getState().suspended, false);
  assert.equal(bridge.shouldSuspendDriving('AUTO'), false);
  bridge.close('fleet');

  bridge.open('gameSettings');
  assert.equal(owner.getState().suspended, true);
  assert.equal(owner.getState().cause, 'menu');
  bridge.close('gameSettings');

  bridge.open('minimap');
  bridge.open('taxiHud');
  assert.equal(owner.getState().suspended, false);
  assert.equal(bridge.getStats().diagnosticOpens, 2);
  assert.equal(bridge.getStats().surfaceCalls, 4);
  assert.deepEqual([...bridge.openPanels()].sort(), ['minimap', 'taxiHud']);
  bridge.dispose();
  assert.equal(bridge.getState().disposed, true);
});

// ---------------------------------------------------------------------------------------------
// Real CSS correspondence
// ---------------------------------------------------------------------------------------------

test('083 every audited focus selector and token value exists in src/style.css', () => {
  const css = readFileSync(join(process.cwd(), 'src', 'style.css'), 'utf8');
  for (const [name, value] of Object.entries(ACCESSIBILITY_TOKENS)) {
    if (typeof value !== 'string' || name === 'version') continue;
    assert.ok(css.includes(value), `token ${name} (${value}) must exist in style.css`);
  }
  for (const panel of PANEL_SURFACES) {
    if (!panel.interactive) continue;
    assert.ok(
      css.includes(panel.focusVisible.selector),
      `${panel.id} focus selector must exist in style.css`,
    );
  }
  assert.ok(css.includes('.ui-focus-ring:focus-visible'));
  assert.ok(css.includes('.ui-focus-error'));
});
