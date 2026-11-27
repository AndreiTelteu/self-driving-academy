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

test('278 host: native save/load actions keep focus, Tab and Escape inside the file surface', async () => {
  const doc = createHudDocument();
  const root = doc.createElement('div');
  const clock = { value: 0 };
  const shell = createGameShell({
    context: { sessionId: '278-host-test', worldEpoch: 2 },
    suspend: () => {},
    resume: () => {},
    now: () => clock.value,
  });
  shell.attachWorld(world(1));
  shell.start();
  shell.step(2);
  const calls = { save: 0, load: 0, confirm: 0, cancel: 0 };
  const host = createGameShellHost({
    root: root as unknown as HTMLElement,
    snapshot: () => shell.status(),
    onStart: () => {},
    onPause: () => {},
    onResume: () => {},
    onOpenPanel: () => shell.openPanel('integration'),
    onClosePanel: () => shell.closePanel(),
    onSaveGame: () => {
      calls.save += 1;
      return {
        status: 'READY',
        message: 'Fișier pregătit pentru descărcare.',
        fileName: 'save-278.sdasave',
        text: '{}',
        checksum: 'a'.repeat(64),
        lines: ['generația 1', 'XP 2'],
      };
    },
    onLoadGame: (file) => {
      calls.load += 1;
      return {
        status: 'PREVIEW',
        message: `Fișier verificat: ${file.fileName}`,
        previewId: 'b'.repeat(64),
        lines: ['tick 5', 'XP 2', 'companie 100'],
      };
    },
    onConfirmLoad: () => {
      calls.confirm += 1;
      return {
        status: 'COMMITTED',
        message: 'Fișier importat.',
        lines: ['ΔXP 0', 'companie 100'],
      };
    },
    onCancelLoad: () => {
      calls.cancel += 1;
    },
    saveStatus: () => ({
      label: 'SAVED',
      detail: 'Salvat la tick 5',
      tick: 5,
      lastSavedTick: 5,
    }),
    now: () => clock.value,
  });
  try {
    host.setSessionState('PLAYING');
    const element = root.children[0] as HudElement;
    const bar = element.children[0]!;
    const save = bar.children.find(
      (child) => child.getAttribute('data-shell-action') === 'save-game',
    )!;
    const load = bar.children.find(
      (child) => child.getAttribute('data-shell-action') === 'load-game',
    )!;
    assert.ok(save.getAttribute('aria-label')?.includes('Salvează jocul'));
    assert.ok(load.getAttribute('aria-label')?.includes('Încarcă jocul'));
    save.dispatchEvent('click');
    await Promise.resolve();
    assert.equal(calls.save, 1);
    assert.equal(host.getStats().saveActions, 1);
    load.dispatchEvent('click');
    assert.equal(host.isSaveOpen(), true);
    assert.equal(host.getStats().saveOpen, true);
    const surface = element.children[2]!;
    assert.equal(surface.getAttribute('role'), 'dialog');
    assert.equal(surface.getAttribute('aria-modal'), 'true');
    await host.loadFileText('save-278.sdasave', '{}');
    assert.equal(calls.load, 1);
    assert.equal(host.getStats().loadPreviews, 1);
    const confirm = surface.children.find(
      (child) => child.getAttribute('data-shell-action') === 'confirm-load',
    )!;
    assert.equal(confirm.getAttribute('data-preview-id'), 'b'.repeat(64));
    confirm.dispatchEvent('click');
    await Promise.resolve();
    assert.equal(calls.confirm, 1);
    assert.equal(host.getStats().importsConfirmed, 1);
    assert.match(surface.children[1]!.textContent, /Fișier importat/);
    const escape = surface.dispatchEvent('keydown', { key: 'Escape' });
    assert.equal(escape.defaultPrevented, true);
    assert.equal(host.isSaveOpen(), false);
    assert.equal(calls.cancel, 1);
    assert.equal(host.getStats().globalListeners, 0);
    assert.equal(host.getStats().listeners, 13);
  } finally {
    host.dispose();
    shell.dispose();
  }
});
