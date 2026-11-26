import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameShell } from '../../src/app/game-shell';
import { createGameShellHost } from '../../src/ui/game-shell-host';
import { createHudDocument, type HudElement } from './hud-dom';

function world(initialTick = 1) {
  let tick = initialTick;
  return {
    version: '260-host-test-world-v1',
    currentTick: () => tick,
    step: (next: number) => {
      tick = next;
    },
    present: () => {},
  };
}

function fixture() {
  const doc = createHudDocument();
  const root = doc.createElement('div');
  const clock = { value: 0 };
  const shell = createGameShell({
    context: { sessionId: '260-host-test', worldEpoch: 2 },
    suspend: () => {},
    resume: () => {},
    now: () => clock.value,
  });
  shell.attachWorld(world(1));
  shell.start();
  shell.step(2);
  const calls = { start: 0, pause: 0, resume: 0, open: 0, close: 0 };
  const host = createGameShellHost({
    root: root as unknown as HTMLElement,
    snapshot: () => shell.status(),
    onStart: () => {
      calls.start += 1;
    },
    onPause: () => {
      calls.pause += 1;
    },
    onResume: () => {
      calls.resume += 1;
    },
    onOpenPanel: () => {
      calls.open += 1;
      return shell.openPanel('integration');
    },
    onClosePanel: () => {
      calls.close += 1;
      shell.closePanel();
    },
    now: () => clock.value,
  });
  const element = root.children[0] as HudElement;
  const bar = element.children[0]!;
  const badge = bar.children[0]!;
  const startButton = bar.children[1]!;
  const pauseButton = bar.children[2]!;
  const resumeButton = bar.children[3]!;
  const panelButton = bar.children[4]!;
  const panel = element.children[1]!;
  const closeButton = panel.children[panel.children.length - 1]!;
  const body = panel.children[2]!.children[2]!;
  return {
    doc,
    root,
    clock,
    shell,
    host,
    calls,
    element,
    bar,
    badge,
    startButton,
    pauseButton,
    resumeButton,
    panelButton,
    panel,
    closeButton,
    body,
  };
}

test('260 host: mounts start/pause/panel controls and reports every declared port', () => {
  const f = fixture();
  f.host.setSessionState('READY');
  assert.equal(f.bar.hidden, false);
  assert.equal(f.startButton.hidden, false);
  assert.equal(f.pauseButton.hidden, true);
  assert.equal(f.resumeButton.hidden, true);
  assert.equal(f.panelButton.hidden, false);
  assert.equal(f.badge.textContent, 'READY');

  f.host.setSessionState('PLAYING');
  assert.equal(f.shell.status().portsPresent, 0);
  assert.equal(f.shell.status().portsAbsent, 15);
  f.panelButton.dispatchEvent('click');
  assert.equal(f.host.isPanelOpen(), true);
  assert.equal(f.calls.open, 1);
  assert.equal(f.panel.hidden, false);
  assert.equal(f.panelButton.getAttribute('aria-expanded'), 'true');
  assert.equal(f.body.children.length, 16);
  const summary = f.panel.children[1]!;
  assert.match(summary.textContent, /porturi 0\/15/);
  assert.match(summary.textContent, /tick 2/);
  const worldRow = f.body.children.find(
    (row) => row.getAttribute('data-shell-system') === 'world',
  )!;
  assert.equal(worldRow.getAttribute('data-shell-status'), 'PRESENT');
  const cameraRow = f.body.children.find(
    (row) => row.getAttribute('data-shell-system') === 'camera',
  )!;
  assert.equal(cameraRow.getAttribute('data-shell-status'), 'ABSENT');
  assert.equal(cameraRow.children[3]!.textContent, 'Neintegrat');
  assert.equal(cameraRow.children[4]!.textContent, '0');
  assert.equal(f.host.getStats().focusables, 1);
  assert.equal(f.host.getStats().globalListeners, 0);
  assert.equal(f.host.getStats().listeners, 6);
  assert.equal(f.panel.getAttribute('role'), 'dialog');
  assert.equal(f.panel.getAttribute('aria-modal'), 'true');
  f.closeButton.dispatchEvent('click');
  // Suprafața închisă nu mai poate fi confundată de inputul 025 cu un dialog modal activ.
  assert.equal(f.panel.getAttribute('role'), null);
  assert.equal(f.panel.getAttribute('aria-modal'), null);
  assert.equal(f.panel.getAttribute('aria-hidden'), 'true');
});

test('263 host: mounts the fleet button and opens the live panel through its own port', () => {
  const doc = createHudDocument();
  const root = doc.createElement('div');
  const clock = { value: 0 };
  const shell = createGameShell({
    context: { sessionId: '263-host-test', worldEpoch: 1 },
    suspend: () => {},
    resume: () => {},
    now: () => clock.value,
  });
  shell.attachWorld(world(1));
  shell.start();
  shell.step(2);
  let opens = 0;
  const host = createGameShellHost({
    root: root as unknown as HTMLElement,
    snapshot: () => shell.status(),
    onStart: () => {},
    onPause: () => {},
    onResume: () => {},
    onOpenPanel: () => shell.openPanel('integration'),
    onClosePanel: () => shell.closePanel(),
    onOpenFleet: () => {
      opens += 1;
      return true;
    },
    now: () => clock.value,
  });
  try {
    host.setSessionState('PLAYING');
    const bar = (root.children[0] as HudElement).children[0]!;
    const fleetButton = bar.children.find(
      (child) => child.getAttribute('data-shell-action') === 'fleet',
    )!;
    assert.ok(fleetButton);
    fleetButton.dispatchEvent('click');
    assert.equal(opens, 1);
    assert.equal(host.getStats().globalListeners, 0);
    assert.equal(host.getStats().listeners, 7);
  } finally {
    host.dispose();
    shell.dispose();
  }
});

test('260 host: pause, resume and start buttons call the injected ports only', () => {
  const f = fixture();
  f.host.setSessionState('READY');
  f.startButton.dispatchEvent('click');
  f.host.setSessionState('PLAYING');
  f.pauseButton.dispatchEvent('click');
  f.host.setSessionState('PAUSED');
  f.resumeButton.dispatchEvent('click');
  assert.deepEqual(f.calls, { start: 1, pause: 1, resume: 1, open: 0, close: 0 });
});

test('260 host: Escape, close button and Tab stay inside the panel without global listeners', () => {
  const f = fixture();
  f.host.setSessionState('PLAYING');
  f.panelButton.dispatchEvent('click');
  assert.equal(f.host.isPanelOpen(), true);
  const escape = f.panel.dispatchEvent('keydown', { key: 'Escape' });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(f.host.isPanelOpen(), false);
  assert.equal(f.calls.close, 1);

  f.panelButton.dispatchEvent('click');
  const tab = f.panel.dispatchEvent('keydown', { key: 'Tab' });
  assert.equal(tab.defaultPrevented, true);
  assert.equal(f.host.isPanelOpen(), true);
  assert.equal(f.host.getStats().tabTraps, 1);

  f.closeButton.dispatchEvent('click');
  assert.equal(f.host.isPanelOpen(), false);
  assert.equal(f.calls.close, 2);
  assert.equal(f.host.getStats().opens, 2);
  assert.equal(f.host.getStats().closes, 2);
  assert.equal(f.host.getStats().globalListeners, 0);
});

test('260 host: an open panel refreshes at 10 Hz, never per frame, and disposal removes every listener', () => {
  const f = fixture();
  f.host.setSessionState('PLAYING');
  f.panelButton.dispatchEvent('click');
  const afterOpen = f.host.getStats().refreshes;
  f.clock.value += 50;
  f.host.refresh();
  assert.equal(f.host.getStats().refreshes, afterOpen);
  f.clock.value += 60;
  f.host.refresh();
  assert.ok(f.host.getStats().refreshes > afterOpen);
  const afterPanelRefresh = f.host.getStats().refreshes;
  f.host.dispose();
  const stats = f.host.getStats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.listeners, 0);
  assert.equal(stats.focusables, 0);
  assert.equal(f.host.isPanelOpen(), false);
  assert.equal(f.root.children.length, 0);
  for (const child of f.bar.children) assert.equal(child.listenerCount, 0);
  assert.equal(f.panel.listenerCount, 0);
  assert.equal(f.host.refresh(), undefined);
  assert.equal(f.host.getStats().refreshes, afterPanelRefresh);
  assert.throws(() => f.host.setSessionState('PLAYING'), /disposed/);
  f.host.dispose();
});

test('261 host: the session menu offers Academy and Chaos and reports the chosen kind', () => {
  const doc = createHudDocument();
  const root = doc.createElement('div');
  let live: string | null = 'ACADEMY';
  const chosen: string[] = [];
  let resets = 0;
  const shell = createGameShell({
    context: { sessionId: '261-host-test', worldEpoch: 2, learningEpoch: 1 },
    suspend: () => {},
    resume: () => {},
    now: () => 0,
  });
  shell.attachWorld(world(1));
  const host = createGameShellHost({
    root: root as unknown as HTMLElement,
    snapshot: () => shell.status(),
    onStart: () => {},
    onPause: () => {},
    onResume: () => {},
    sessionMenu: () => ({
      live,
      choices: [
        {
          kind: 'ACADEMY',
          label: 'Academie',
          live: live === 'ACADEMY',
          profileId: 'profile-1',
          worldEpoch: 2,
          learningEpoch: 1,
          checkpoints: 1,
        },
        {
          kind: 'CHAOS',
          label: 'Joaca libera / Haos',
          live: live === 'CHAOS',
          profileId: 'chaos:copy-1',
          worldEpoch: 1,
          learningEpoch: 0,
          checkpoints: 0,
        },
      ],
    }),
    onChooseSession: (kind) => {
      chosen.push(kind);
      live = kind;
    },
    onResetWorld: () => {
      resets += 1;
    },
    onOpenPanel: () => shell.openPanel('integration'),
    onClosePanel: () => {
      shell.closePanel();
    },
    now: () => 0,
  });
  const element = root.children[0] as HudElement;
  const bar = element.children[0]!;
  const select = bar.children.find(
    (child) => child.getAttribute('data-shell-action') === 'session',
  )!;
  assert.ok(select !== undefined);
  assert.equal(select.value, 'ACADEMY');
  assert.equal(select.children.length, 2);
  assert.equal(select.children[0]!.textContent, 'Academie');
  assert.equal(select.children[1]!.textContent, 'Joaca libera / Haos');
  assert.equal(host.getStats().sessionChoices, 2);
  assert.equal(host.getStats().listeners, 8);
  assert.equal(host.getStats().globalListeners, 0);

  const panel = element.children[1]!;
  const panelButton = bar.children.find(
    (child) => child.getAttribute('data-shell-action') === 'panel',
  )!;
  panelButton.dispatchEvent('click');
  const resetButton = panel.children.find(
    (child) => child.getAttribute('data-shell-action') === 'reset-world',
  )!;
  assert.equal(resetButton.textContent, 'Oraș proaspăt, păstrează stilul');
  resetButton.dispatchEvent('click');
  assert.equal(resets, 1);
  assert.equal(host.isPanelOpen(), false);

  select.value = 'CHAOS';
  select.dispatchEvent('change');
  assert.deepEqual(chosen, ['CHAOS']);
  host.refreshSession();
  assert.equal(select.value, 'CHAOS');
  host.setSessionState('PLAYING');
  host.refresh(true);
  assert.match(element.children[1]!.children[1]!.textContent, /porturi 0\/15/);

  host.dispose();
  assert.equal(select.listenerCount, 0);
  assert.equal(host.getStats().listeners, 0);
  assert.equal(host.getStats().sessionChoices, 2);
});
