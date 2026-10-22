import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TUTORIAL_PANEL_LIMITS,
  TUTORIAL_PANEL_VERSION,
  createMissionTutorialPanel,
  parseTutorialPanelSnapshot,
  projectTutorialPanel,
} from '../../src/ui';
import type { TutorialPanelSnapshot } from '../../src/ui';
import { createHudDocument, createHudHost, serializeHud } from './hud-dom';
import type { HudElement } from './hud-dom';

const SESSION = 'session-117-ui';

function snapshot(overrides: Partial<TutorialPanelSnapshot> = {}): TutorialPanelSnapshot {
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    sessionId: SESSION,
    worldEpoch: 1,
    version: TUTORIAL_PANEL_VERSION,
    tick: 10,
    state: 'ACTIVE',
    stepId: 'SELECT_TAXI',
    stepIndex: 0,
    stepCount: 5,
    title: 'Alege un taxi',
    instruction: 'Alege orice taxi din flotă.',
    taxiId: null,
    ...overrides,
  });
}

function setup(overrides: Partial<TutorialPanelSnapshot> = {}) {
  const doc = createHudDocument();
  const host = createHudHost(doc);
  const calls: string[] = [];
  const panel = createMissionTutorialPanel(host as unknown as HTMLElement, {
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
    skipStep: () => calls.push('skipStep'),
    skipAll: () => calls.push('skipAll'),
  });
  panel.update(snapshot(overrides), 0);
  const root = host.children[0]!;
  return { doc, host, panel, calls, root };
}

function button(root: HudElement, label: string): HudElement {
  const found = root.children.find(
    (child) => child.tagName === 'button' && child.textContent === label,
  );
  assert(found, `button ${label}`);
  return found;
}

function enabled(root: HudElement): readonly string[] {
  return root.children
    .filter((child) => child.tagName === 'button' && child.getAttribute('disabled') === null)
    .map((child) => child.textContent);
}

test('117 panel parses one strict snapshot and projects explicit labels', () => {
  const parsed = parseTutorialPanelSnapshot(snapshot());
  assert.equal(parsed.state, 'ACTIVE');
  assert.equal(parsed.stepId, 'SELECT_TAXI');
  const projection = projectTutorialPanel(parsed);
  assert.equal(projection.heading, 'Tutorial · Primul taxi');
  assert.equal(projection.progress, 'Pasul 1 din 5');
  assert.equal(projection.status, 'În desfășurare');
  assert.equal(projection.taxi, 'Niciun taxi selectat');
  assert(projection.learning.includes('eligibilitate oprită'));
  assert(projection.taxiAccess.includes('rămân disponibile'));
  assert.equal(projection.complete, false);
  assert.deepEqual(
    projection.buttons.map((entry) => [entry.action, entry.disabled]),
    [
      ['PAUSE', false],
      ['RESUME', true],
      ['SKIP_STEP', false],
      ['SKIP_ALL', false],
    ],
  );
  for (const entry of projection.buttons) assert.equal(entry.ariaKeyshortcuts, 'Enter Space');
});

test('117 panel rejects unknown fields, invalid progress and invented states', () => {
  assert.throws(() => parseTutorialPanelSnapshot({ ...snapshot(), extra: true }), /fields/);
  assert.throws(() => parseTutorialPanelSnapshot(snapshot({ state: 'DONE' as never })), /state/);
  assert.throws(() => parseTutorialPanelSnapshot(snapshot({ stepCount: 4 })), /progress/);
  assert.throws(() => parseTutorialPanelSnapshot(snapshot({ stepIndex: 5 })), /current step/);
  assert.throws(
    () => parseTutorialPanelSnapshot(snapshot({ state: 'COMPLETED', stepIndex: 4, stepId: null })),
    /pending step/,
  );
  assert.throws(() => parseTutorialPanelSnapshot(snapshot({ version: 'x' as never })), /version/);
  assert.throws(() => parseTutorialPanelSnapshot(snapshot({ tick: -1 })), /tick/);
  const completed = parseTutorialPanelSnapshot(
    snapshot({ state: 'COMPLETED', stepIndex: 5, stepId: null }),
  );
  assert.equal(projectTutorialPanel(completed).progress, 'Tutorial finalizat');
  assert.equal(projectTutorialPanel(completed).complete, true);
});

test('117 panel renders native buttons and forwards mouse clicks', () => {
  const { root, calls, panel } = setup();
  assert.equal(root.tagName, 'section');
  assert.equal(root.getAttribute('role'), 'region');
  const instruction = root.children.find((child) => child.tagName === 'p')!;
  assert.equal(instruction.getAttribute('aria-live'), 'polite');
  assert.equal(serializeHud(root).includes('aria-keyshortcuts="Enter Space" type="button"'), true);
  button(root, 'Pauză').dispatch('click');
  button(root, 'Sari peste pas').dispatch('click');
  button(root, 'Sari peste tutorial').dispatch('click');
  assert.deepEqual(calls, ['pause', 'skipStep', 'skipAll']);
  assert.equal(panel.getStats().emitted, 3);
  // A disabled button never emits, even if the browser would deliver a synthetic click.
  button(root, 'Reia').dispatch('click');
  assert.deepEqual(calls, ['pause', 'skipStep', 'skipAll']);
});

test('117 keyboard activation needs no global listener and uses the native button path', () => {
  const { root, calls, panel } = setup();
  const pause = button(root, 'Pauză');
  // The documented browser path: Enter/Space on a focused <button> dispatches a click.
  pause.dispatchEvent('keydown', { key: 'Enter', code: 'Enter' });
  assert.deepEqual(calls, []);
  pause.dispatch('click');
  assert.deepEqual(calls, ['pause']);
  // Every listener belongs to a button; the panel installs no window/document listener.
  const doc = createHudDocument();
  const host = createHudHost(doc);
  const fresh = createMissionTutorialPanel(host as unknown as HTMLElement, {
    pause: () => undefined,
    resume: () => undefined,
    skipStep: () => undefined,
    skipAll: () => undefined,
  });
  assert.equal(fresh.getStats().globalListeners, 0);
  assert.equal(fresh.getStats().listeners, TUTORIAL_PANEL_LIMITS.listeners);
  assert.equal(host.children[0]!.listenerCount, 0);
  assert.equal(panel.getStats().listeners, TUTORIAL_PANEL_LIMITS.listeners);
});

test('117 panel reflects paused, active and completed states', () => {
  const paused = setup({ state: 'PAUSED', tick: 11 });
  assert.deepEqual(enabled(paused.root), ['Reia']);
  button(paused.root, 'Reia').dispatch('click');
  assert.deepEqual(paused.calls, ['resume']);
  assert.equal(paused.root.getAttribute('data-state'), 'PAUSED');

  const done = setup({ state: 'COMPLETED', stepIndex: 5, stepId: null, tick: 12 });
  assert.deepEqual(enabled(done.root), []);
  assert.equal(done.root.getAttribute('data-complete'), 'true');
  assert(done.root.children.some((child) => child.textContent === 'Tutorial finalizat'));

  const taxi = setup({ taxiId: 'taxi:117:A', tick: 13 });
  assert(taxi.root.children.some((child) => child.textContent === 'Taxi: taxi:117:A'));
});

test('117 panel throttles repeated frames, rejects stale ticks and disposes cleanly', () => {
  const { panel, host, root } = setup();
  const stats = panel.getStats();
  assert.equal(stats.elements, TUTORIAL_PANEL_LIMITS.elements);
  assert.equal(stats.textNodes, TUTORIAL_PANEL_LIMITS.textNodes);
  panel.update(snapshot({ tick: 11 }), 20);
  assert.equal(panel.getStats().skipped, 1);
  panel.update(snapshot({ tick: 12, stepId: 'MODE_MANUAL', stepIndex: 1 }), 30);
  assert.equal(panel.getStats().updates, 2);
  assert.equal(
    root.children.some((child) => child.textContent === 'Pasul 2 din 5'),
    true,
  );
  assert.throws(() => panel.update(snapshot({ tick: 5 }), 40), /Stale tutorial panel snapshot/);
  assert.throws(() => panel.update(snapshot({ tick: 20 }), 10), /clock/);
  panel.dispose();
  assert.equal(host.children.length, 0);
  assert.equal(panel.getStats().elements, 0);
  assert.equal(panel.getStats().disposed, true);
  assert.throws(() => panel.update(snapshot({ tick: 30 }), 50), /disposed/);
});
