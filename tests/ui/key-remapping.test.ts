import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createKeyRemappingDraft, parseKeyRemappingDraft } from '../../src/ui';
import {
  KEY_REMAPPING_ACTIONS,
  KEY_REMAPPING_CRITICAL_ACTIONS,
  KEY_REMAPPING_LABELS,
  KEY_REMAPPING_NOTE,
  KEY_REMAPPING_REJECTION_LABELS,
  KEY_REMAPPING_VERSION,
  clearBinding,
  isSupportedKeyCode,
  keyRemappingBindings,
  normalizeKeyCode,
  projectKeyRemapping,
  resetBindings,
  revertBindings,
  setBinding,
} from '../../src/ui';
import { inputActions, parseInputPreferences } from '../../src/settings';
import { createDefaultSettings } from '../../src/settings';
import { runKeyRemappingReport } from '../app/key-remapping-report';
import {
  KEY_PLAYER,
  createKeyRemappingHarness,
  customKeyDraft,
  customKeySettings,
  defaultKeyDraft,
  keySettings,
} from './key-remapping-fixture';

const actions = new Set<string>(inputActions);

test('080 all 15 public actions are present, default-bound and unchanged', () => {
  const draft = defaultKeyDraft(),
    view = projectKeyRemapping(draft);
  assert.equal(KEY_REMAPPING_VERSION, '080-key-remapping-v1');
  assert.equal(view.rows.length, 15);
  assert.equal(KEY_REMAPPING_ACTIONS.length, 15);
  assert.deepEqual(new Set(KEY_REMAPPING_ACTIONS), actions);
  for (const action of KEY_REMAPPING_ACTIONS) {
    const row = view.rows.find((entry) => entry.action === action);
    assert.ok(row);
    assert.equal(row.state, 'UNCHANGED');
    assert.equal(row.current, draft.defaults[action]);
    assert.equal(row.proposed, row.current);
    assert.ok(row.label.trim().length > 0);
    assert.ok(isSupportedKeyCode(row.current));
    assert.equal(row.proposedLabel, row.currentLabel);
  }
  assert.equal(new Set(view.rows.map((row) => row.proposed)).size, 15);
  assert.equal(view.saveState, 'UNCHANGED');
  assert.equal(view.canSave, false);
  assert.equal(view.changed, 0);
  assert.equal(view.critical, KEY_REMAPPING_CRITICAL_ACTIONS.length);
  assert.equal(view.critical, 9);
  assert.equal(KEY_REMAPPING_LABELS.throttle, 'Accelerație');
});

test('080 conflicts mark both rows, list the code and block saving', () => {
  const conflict = setBinding(defaultKeyDraft(), 'throttle', 'KeyS'),
    view = projectKeyRemapping(conflict.draft),
    throttle = view.rows.find((row) => row.action === 'throttle')!,
    brake = view.rows.find((row) => row.action === 'brake')!;
  assert.equal(conflict.status, 'SET');
  assert.equal(throttle.state, 'CONFLICT');
  assert.equal(brake.state, 'CONFLICT');
  assert.deepEqual(throttle.conflictWith, ['brake']);
  assert.deepEqual(brake.conflictWith, ['throttle']);
  assert.match(throttle.message ?? '', /Frână/);
  assert.equal(view.conflicts.length, 1);
  assert.equal(view.conflicts[0]!.code, 'KeyS');
  assert.deepEqual(view.conflicts[0]!.actions, ['throttle', 'brake']);
  assert.equal(view.saveState, 'CONFLICT');
  assert.equal(view.canSave, false);
  assert.match(view.summary, /Conflict|conflict/);

  const harness = createKeyRemappingHarness(conflict.draft);
  assert.equal(harness.rowFor('throttle').getAttribute('data-state'), 'CONFLICT');
  assert.equal(harness.rowFor('brake').getAttribute('data-state'), 'CONFLICT');
  assert.notEqual(harness.saveButton().getAttribute('disabled'), null);
  assert.match(harness.live().textContent, /KeyS|S/);
  harness.saveButton().dispatch('click');
  assert.equal(harness.saved.length, 0);
  assert.equal(harness.panel.getStats().saveState, 'CONFLICT');
  harness.panel.dispose();
});

test('080 rebinding the duplicate code resolves the conflict and enables save', () => {
  const conflicted = setBinding(defaultKeyDraft(), 'throttle', 'KeyS').draft,
    resolved = setBinding(conflicted, 'brake', 'KeyX').draft,
    view = projectKeyRemapping(resolved);
  assert.equal(view.conflicts.length, 0);
  assert.equal(view.saveState, 'DIRTY');
  assert.equal(view.canSave, true);
  assert.equal(view.rows.find((row) => row.action === 'throttle')!.proposed, 'KeyS');
  assert.equal(view.rows.find((row) => row.action === 'brake')!.proposed, 'KeyX');
  assert.equal(view.rows.find((row) => row.action === 'brake')!.state, 'VALID');
  assert.match(view.summary, /2 comenzi modificate/);
});

test('080 unsupported, printable, modifier-only and reserved codes are explicitly rejected', () => {
  const cases = [
    ['w', 'UNSUPPORTED_CODE'],
    ['a', 'UNSUPPORTED_CODE'],
    ['Shift', 'MODIFIER_ONLY'],
    ['Meta', 'MODIFIER_ONLY'],
    ['MetaLeft', 'MODIFIER_ONLY'],
    ['F5', 'RESERVED_BROWSER_CODE'],
    ['F12', 'RESERVED_BROWSER_CODE'],
    ['', 'EMPTY'],
    [null, 'EMPTY'],
  ] as const;
  let draft = defaultKeyDraft();
  for (const [code, reason] of cases) {
    const result = setBinding(draft, 'throttle', code);
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.reason, reason);
    draft = result.draft;
    const row = projectKeyRemapping(draft).rows.find((entry) => entry.action === 'throttle')!;
    assert.equal(row.state, 'UNSUPPORTED');
    assert.equal(row.proposed, '');
    assert.equal(row.message, KEY_REMAPPING_REJECTION_LABELS[reason]);
    assert.equal(projectKeyRemapping(draft).canSave, false);
    // The row is never silently dropped: it remains one of the 15 rows.
    assert.equal(projectKeyRemapping(draft).rows.length, 15);
  }
  assert.equal(normalizeKeyCode('KeyW').ok, true);
  assert.equal(normalizeKeyCode('Tab').ok, true);
  assert.equal(normalizeKeyCode('ShiftLeft').ok, true);
  assert.equal(normalizeKeyCode('F2').ok, true);

  // The persisted grammar is exactly the 009 parser grammar, including the F5/F12 acceptance.
  const input = createDefaultSettings(KEY_PLAYER).input,
    candidates = [
      'KeyX',
      'Digit0',
      'ArrowUp',
      'F2',
      'F12',
      'ShiftLeft',
      'ControlRight',
      'AltLeft',
      'Enter',
      'Backspace',
      'Keya',
      'F13',
      'a',
      'Shift',
      '',
      'Mouse0',
    ];
  for (const code of candidates) {
    let acceptedBySettings = true;
    try {
      parseInputPreferences({
        ...input,
        bindings: { ...input.bindings, kpis: code },
      });
    } catch {
      acceptedBySettings = false;
    }
    assert.equal(isSupportedKeyCode(code), acceptedBySettings, `code parity: ${code}`);
  }

  const cleared = clearBinding(defaultKeyDraft(), 'camera'),
    row = projectKeyRemapping(cleared).rows.find((entry) => entry.action === 'camera')!;
  assert.equal(row.state, 'UNSUPPORTED');
  assert.equal(row.proposed, '');
  assert.equal(row.message, KEY_REMAPPING_REJECTION_LABELS.EMPTY);
  assert.equal(projectKeyRemapping(cleared).saveState, 'UNSUPPORTED');
});

test('080 reset proposes the real 009 defaults and never persists by itself', () => {
  const draft = customKeyDraft(),
    changed = setBinding(draft, 'brake', 'KeyX').draft,
    reset = resetBindings(changed),
    view = projectKeyRemapping(reset),
    defaults = createDefaultSettings(KEY_PLAYER).input.bindings;
  assert.equal(changed.bindings.brake, 'KeyZ');
  assert.deepEqual(reset.proposed, defaults);
  assert.deepEqual(reset.bindings, changed.bindings);
  assert.equal(reset.proposed.brake, 'KeyS');
  assert.equal(view.changed, 2);
  assert.equal(view.saveState, 'DIRTY');
  assert.equal(view.canSave, true);
  assert.equal(view.conflicts.length, 0);
  for (const action of KEY_REMAPPING_ACTIONS)
    assert.equal(
      projectKeyRemapping(reset).rows.find((row) => row.action === action)!.defaultCode,
      defaults[action],
    );
});

test('080 panel builds all rows, the separation note, disabled save and a polite live region', () => {
  const harness = createKeyRemappingHarness();
  assert.equal(harness.rows().length, 15);
  assert.deepEqual(
    harness.rows().map((row) => row.getAttribute('data-action')),
    [...KEY_REMAPPING_ACTIONS],
  );
  assert.ok(harness.dom().includes(KEY_REMAPPING_NOTE));
  assert.match(harness.dom(), /separat de profilul învățat/);
  assert.equal(harness.live().getAttribute('role'), 'status');
  assert.equal(harness.live().getAttribute('aria-live'), 'polite');
  assert.equal(harness.live().getAttribute('aria-atomic'), 'true');
  assert.notEqual(harness.saveButton().getAttribute('disabled'), null);
  assert.equal(harness.panel.getStats().rows, 15);
  assert.equal(harness.panel.getStats().listeners, 18);
  assert.equal(harness.panel.getStats().captureListeners, 0);
  assert.equal(harness.host.listenerCount, 0);
  assert.equal(harness.root().listenerCount, 0);
  harness.panel.dispose();
});

test('080 capture emits exactly one binding and removes its listener', () => {
  const harness = createKeyRemappingHarness(),
    button = harness.keyButtonFor('brake');
  assert.equal(button.listenerCount, 1);
  button.dispatch('click');
  assert.equal(harness.panel.isCapturing(), true);
  assert.equal(button.textContent, 'Apasă o tastă…');
  assert.equal(button.listenerCount, 2);
  assert.equal(harness.panel.getStats().captureListeners, 1);
  const event = button.dispatchEvent('keydown', { code: 'KeyZ' });
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
  assert.equal(harness.panel.isCapturing(), false);
  assert.equal(button.listenerCount, 1);
  assert.equal(harness.panel.getStats().captureListeners, 0);
  assert.equal(harness.panel.getDraft().proposed.brake, 'KeyZ');
  assert.equal(harness.rowFor('brake').getAttribute('data-state'), 'VALID');
  assert.equal(harness.rowFor('brake').getAttribute('data-capturing'), 'false');
  // A second keydown cannot change the draft because no capture listener remains.
  button.dispatchEvent('keydown', { code: 'KeyQ' });
  assert.equal(harness.panel.getDraft().proposed.brake, 'KeyZ');
  assert.equal(harness.panel.getStats().captures, 1);
  harness.panel.dispose();
});

test('080 Escape cancels capture and never closes or mutates the panel', () => {
  const harness = createKeyRemappingHarness(),
    draft = keyRemappingBindings(harness.panel.getDraft()),
    button = harness.keyButtonFor('camera');
  button.dispatch('click');
  assert.equal(harness.panel.isCapturing(), true);
  const event = button.dispatchEvent('keydown', { code: 'Escape' });
  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.panel.isCapturing(), false);
  assert.deepEqual(keyRemappingBindings(harness.panel.getDraft()), draft);
  assert.equal(harness.host.children.length, 1);
  assert.equal(harness.rows().length, 15);
  assert.match(harness.live().textContent, /anulată/);
  harness.panel.cancelCapture();
  assert.equal(harness.panel.getStats().cancelledCaptures, 1);
  harness.panel.dispose();
});

test('080 Tab, Enter and Space are capturable without focus loss or double activation', () => {
  const harness = createKeyRemappingHarness(),
    cases = [
      ['fleet', 'Tab'],
      ['kpis', 'Enter'],
      ['handbrake', 'Space'],
    ] as const;
  for (const [action, code] of cases) {
    const button = harness.keyButtonFor(action);
    button.dispatch('click');
    assert.equal(harness.panel.isCapturing(), true);
    const event = button.dispatchEvent('keydown', { code });
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.propagationStopped, true);
    assert.equal(harness.panel.isCapturing(), false);
    assert.equal(harness.panel.getDraft().proposed[action], code);
    assert.equal(button.listenerCount, 1);
    assert.equal(harness.host.children.length, 1);
  }
  assert.equal(harness.panel.getStats().captures, 3);
  harness.panel.dispose();
});

test('080 clear leaves one explicit invalid row and blocks saving', () => {
  const cleared = clearBinding(defaultKeyDraft(), 'handbrake'),
    view = projectKeyRemapping(cleared),
    harness = createKeyRemappingHarness(cleared);
  assert.equal(view.rows.length, 15);
  assert.equal(view.saveState, 'UNSUPPORTED');
  assert.equal(harness.rowFor('handbrake').getAttribute('data-state'), 'UNSUPPORTED');
  assert.match(harness.rowFor('handbrake').children[5]!.textContent, /Nicio tastă/);
  assert.notEqual(harness.saveButton().getAttribute('disabled'), null);
  harness.saveButton().dispatch('click');
  assert.equal(harness.saved.length, 0);
  harness.panel.dispose();
});

test('080 an identical draft rewrites nothing and a backwards clock is rejected', () => {
  const harness = createKeyRemappingHarness(),
    dom = harness.dom(),
    writes = harness.panel.getStats().writes,
    renders = harness.panel.getStats().renders;
  harness.panel.update(harness.panel.getDraft(), 10);
  assert.equal(harness.panel.getStats().writes, writes);
  assert.equal(harness.panel.getStats().skipped, 1);
  assert.equal(harness.panel.getStats().renders, renders);
  assert.equal(harness.dom(), dom);
  assert.throws(() => harness.panel.update(harness.panel.getDraft(), 9), /clock/);
  harness.panel.dispose();
});

test('080 reset asks for an explicit confirmation and save emits one intention', () => {
  const harness = createKeyRemappingHarness(customKeyDraft()),
    reset = harness.resetButton();
  reset.dispatch('click');
  assert.equal(harness.panel.getDraft().proposed.brake, 'KeyZ');
  assert.match(reset.textContent, /Confirmă resetarea/);
  assert.equal(harness.panel.getStats().resets, 0);
  reset.dispatch('click');
  assert.equal(reset.textContent, 'Resetează la implicite');
  assert.equal(harness.panel.getDraft().proposed.brake, 'KeyS');
  assert.equal(harness.panel.getStats().resets, 1);
  assert.equal(harness.saved.length, 0);
  assert.equal(harness.panel.getStats().saveState, 'DIRTY');
  harness.saveButton().dispatch('click');
  harness.saveButton().dispatch('click');
  assert.equal(harness.saved.length, 2);
  assert.deepEqual(harness.saved[0], createDefaultSettings(KEY_PLAYER).input.bindings);
  assert.equal(harness.panel.getStats().saves, 2);
  harness.panel.dispose();
});

test('080 Renunță restores the persisted bindings and clears local invalid rows', () => {
  const draft = customKeyDraft(),
    invalid = clearBinding(setBinding(draft, 'throttle', 'KeyT').draft, 'camera'),
    harness = createKeyRemappingHarness(invalid);
  assert.equal(harness.panel.getStats().saveState, 'UNSUPPORTED');
  harness.cancelButton().dispatch('click');
  assert.deepEqual(harness.panel.getDraft().proposed, draft.bindings);
  assert.equal(harness.panel.getStats().saveState, 'UNCHANGED');
  assert.equal(harness.cancelled.length, 1);
  harness.panel.dispose();
});

test('080 disposal is idempotent and removes every listener and node', () => {
  const harness = createKeyRemappingHarness(),
    button = harness.keyButtonFor('profile');
  button.dispatch('click');
  assert.equal(harness.panel.isCapturing(), true);
  harness.panel.dispose();
  assert.equal(harness.panel.getStats().elements, 0);
  assert.equal(harness.panel.getStats().textNodes, 0);
  assert.equal(harness.panel.getStats().listeners, 0);
  assert.equal(harness.panel.getStats().rows, 0);
  assert.equal(harness.host.children.length, 0);
  harness.panel.dispose();
  assert.throws(() => harness.panel.update(defaultKeyDraft(), 0), /disposed/);
  assert.equal(harness.panel.isCapturing(), false);
});

test('080 a foreign draft or a foreign player is rejected before any DOM work', () => {
  const settings = keySettings(),
    defaults = createDefaultSettings(KEY_PLAYER).input.bindings,
    foreign = createKeyRemappingDraft({
      playerId: 'player:other',
      bindings: defaults,
      defaults,
    }),
    harness = createKeyRemappingHarness();
  assert.throws(() => harness.panel.setDraft(foreign), /another player/);
  assert.throws(
    () => createKeyRemappingDraft({ playerId: ' ', bindings: defaults, defaults }),
    /player/,
  );
  assert.throws(() => parseKeyRemappingDraft({ ...defaultKeyDraft(), revision: -1 }), /revision/);
  assert.equal(customKeySettings().units.speed, 'mph');
  assert.equal(settings.units.speed, 'km/h');
  harness.panel.dispose();
});

test('080 revertBindings is pure and the committed evidence report is current', () => {
  const changed = setBinding(defaultKeyDraft(), 'recover', 'KeyY').draft,
    reverted = revertBindings(changed);
  assert.equal(changed.proposed.recover, 'KeyY');
  assert.equal(reverted.proposed.recover, 'KeyR');
  assert.equal(projectKeyRemapping(reverted).saveState, 'UNCHANGED');

  const report = runKeyRemappingReport(),
    saved = readFileSync(
      join(process.cwd(), 'Docs', 'Evidence', '080-key-remapping', 'report.json'),
      'utf8',
    );
  assert.equal(report.summary.pass, true);
  assert.equal(saved, `${JSON.stringify(report, null, 2)}\n`);
  assert.equal(report.scenarios.length, 7);
  assert.ok(report.checks.length >= 25);
});
