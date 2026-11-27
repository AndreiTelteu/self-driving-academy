import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveSettingsPanel } from '../../src/ui';
import type { StyleSlidersDraft, GameSettingsDraft } from '../../src/ui';
import { createHudDocument, createHudHost } from './hud-dom';
import type { HudElement } from './hud-dom';
import { defaultGameDraft } from './game-settings-fixture';
import { defaultKeyDraft } from './key-remapping-fixture';
import { styleDraft } from './style-sliders-fixture';

function walk(root: HudElement, predicate: (node: HudElement) => boolean): HudElement | null {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = walk(child, predicate);
    if (found !== null) return found;
  }
  return null;
}
function requireNode(root: HudElement, predicate: (node: HudElement) => boolean, label: string) {
  const node = walk(root, predicate);
  if (node === null) throw new Error(`Missing live settings node: ${label}`);
  return node;
}

function harness() {
  const doc = createHudDocument(),
    host = createHudHost(doc),
    trigger = doc.createElement('button'),
    settingsSaves: GameSettingsDraft[] = [],
    keySaves: unknown[] = [],
    styleApplies: StyleSlidersDraft[] = [],
    closes: number[] = [];
  host.append(trigger);
  const panel = createLiveSettingsPanel(host as unknown as HTMLElement, {
    settingsDraft: defaultGameDraft(),
    keyDraft: defaultKeyDraft(),
    styleDraft: styleDraft(),
    settings: {
      save: (draft) => settingsSaves.push(draft),
    },
    keys: {
      save: (draft) => keySaves.push(draft),
    },
    style: {
      apply: (draft) => styleApplies.push(draft),
    },
    close: () => closes.push(1),
  });
  const root = (): HudElement => host.children[1]!,
    surface = (): HudElement => root().children[0]!,
    tab = (name: string): HudElement =>
      requireNode(
        root(),
        (node) => node.getAttribute('data-live-settings-tab') === name && node.tagName === 'button',
        `tab ${name}`,
      ),
    closeButton = (): HudElement =>
      requireNode(
        root(),
        (node) => node.getAttribute('data-live-settings-action') === 'close',
        'close',
      );
  return {
    doc,
    host,
    trigger,
    panel,
    settingsSaves,
    keySaves,
    styleApplies,
    closes,
    root,
    surface,
    tab,
    closeButton,
  };
}

test('279 panel opens as a modal, traps Tab and restores focus on Escape', () => {
  const h = harness();
  try {
    h.trigger.focus();
    assert.equal(h.panel.openPanel(), true);
    assert.equal(h.panel.isOpen(), true);
    assert.equal(h.doc.activeElement !== null, true);
    assert.notEqual(h.doc.activeElement, h.trigger);
    const surface = h.surface();
    const first = h.doc.activeElement;
    surface.dispatchEvent('keydown', { key: 'Tab' });
    assert.notEqual(h.doc.activeElement, first);
    surface.dispatchEvent('keydown', { key: 'Tab', shiftKey: true });
    assert.equal(h.doc.activeElement, first);
    surface.dispatchEvent('keydown', { key: 'Escape' });
    assert.equal(h.panel.isOpen(), false);
    assert.equal(h.closes.length, 1);
    assert.equal(h.doc.activeElement, h.trigger);
    assert.equal(h.panel.getStats().focus.globalListeners, 0);
    assert.equal(h.panel.getStats().globalListeners, 0);
  } finally {
    h.panel.dispose();
  }
});

test('279 panel exposes 15 remappable actions and blocks a conflicting save', () => {
  const h = harness();
  try {
    h.panel.openPanel();
    h.tab('KEYS').dispatch('click');
    const keyButtons = h
      .root()
      .querySelectorAll('button')
      .filter((node) => node.getAttribute('class') === 'key-remapping__key');
    assert.equal(keyButtons.length, 15);
    const brake = keyButtons.find((node) => node.getAttribute('data-action') === 'brake')!;
    brake.dispatch('click');
    const captured = brake.dispatchEvent('keydown', { code: 'KeyW', key: 'w' });
    assert.equal(captured.defaultPrevented, true);
    const save = requireNode(
      h.root(),
      (node) => node.getAttribute('class') === 'key-remapping__save' && node.tagName === 'button',
      'key save',
    );
    assert.equal(save.hasAttribute('disabled'), true);
    save.dispatch('click');
    assert.equal(h.keySaves.length, 0);
    const status = requireNode(
      h.root(),
      (node) => node.getAttribute('class') === 'key-remapping__live',
      'key status',
    );
    assert.match(status.textContent, /Conflict|conflict/);

    const camera = keyButtons.find((node) => node.getAttribute('data-action') === 'camera')!;
    camera.dispatch('click');
    const escape = camera.dispatchEvent('keydown', { code: 'Escape', key: 'Escape' });
    assert.equal(escape.defaultPrevented, true);
    assert.equal(h.panel.isOpen(), true);
    assert.match(
      requireNode(
        h.root(),
        (node) => node.getAttribute('class') === 'key-remapping__live',
        'key status',
      ).textContent,
      /anulat|captur/i,
    );
  } finally {
    h.panel.dispose();
  }
});

test('279 panel saves the 081 draft, resets with confirmation and exposes 7+8 sliders', () => {
  const h = harness();
  try {
    h.panel.openPanel();
    const comfort = h
      .root()
      .querySelectorAll('input')
      .filter((node) => node.getAttribute('class') === 'game-settings__range');
    assert.ok(comfort.length >= 8, 'seven comfort ranges plus resolution');
    const steering = comfort.find((node) =>
      node.getAttribute('id')?.endsWith('-steeringSensitivity'),
    )!;
    steering.value = '80';
    steering.dispatch('change');
    const save = requireNode(
      h.root(),
      (node) => node.getAttribute('class') === 'game-settings__save',
      'settings save',
    );
    save.dispatch('click');
    assert.equal(h.settingsSaves.length, 1);
    assert.equal(h.settingsSaves[0]!.proposed.comfort.steeringSensitivity, 80);

    const reset = requireNode(
      h.root(),
      (node) => node.getAttribute('class') === 'game-settings__reset',
      'settings reset',
    );
    reset.dispatch('click');
    assert.equal(reset.textContent, 'Confirmă resetarea');
    reset.dispatch('click');
    assert.equal(reset.textContent, 'Resetează');

    h.tab('STYLE').dispatch('click');
    const styleRanges = h
      .root()
      .querySelectorAll('input')
      .filter((node) => node.getAttribute('class') === 'style-sliders__range');
    assert.equal(styleRanges.length, 8);
    const acceleration = styleRanges.find((node) =>
      node.getAttribute('id')?.endsWith('-desiredAcceleration'),
    )!;
    acceleration.value = '2.4';
    acceleration.dispatch('change');
    const apply = requireNode(
      h.root(),
      (node) => node.getAttribute('class') === 'style-sliders__apply',
      'style apply',
    );
    apply.dispatch('click');
    assert.equal(h.styleApplies.length, 1);
  } finally {
    h.panel.dispose();
  }
});

test('279 panel hides unavailable style and keeps all listeners scoped', () => {
  const doc = createHudDocument(),
    host = createHudHost(doc),
    panel = createLiveSettingsPanel(host as unknown as HTMLElement, {
      settingsDraft: defaultGameDraft(),
      keyDraft: defaultKeyDraft(),
      styleDraft: null,
      styleUnavailableReason: 'Sesiunea Haos nu editează profilul Academiei.',
      close: () => undefined,
    });
  try {
    panel.openPanel();
    const styleTab = requireNode(
      host.children[0]!,
      (node) => node.getAttribute('data-live-settings-tab') === 'STYLE',
      'style tab',
    );
    assert.equal(styleTab.hasAttribute('disabled'), true);
    assert.equal(panel.setTab('STYLE'), false);
    assert.equal(panel.getStats().focus.globalListeners, 0);
    assert.equal(panel.getStats().globalListeners, 0);
  } finally {
    panel.dispose();
  }
});
