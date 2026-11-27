import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVE_PROGRESS_READ_VERSION,
  LIVE_PROGRESS_UI_VERSION,
  createLiveProgressPanel,
  LIVE_PROGRESS_FORBIDDEN_FRAGMENTS,
  parseLiveProgressSnapshot,
  projectLiveProgressPanel,
  type LiveProgressSnapshot,
} from '../../src/ui';
import { createLiveDailyProgress, type LiveDailyProgress } from '../../src/app';
import type { SimulationEvent } from '../../src/simulation';
import { DAILY_FIXTURE_PLAYER, learningOnlyCapabilities } from '../missions/mission-daily-fixture';
import {
  coreCatalog,
  createDailyPanelDocument,
  byClass,
  type DailyPanelElement,
} from './daily-progress-fixture';

const SESSION = 'session-276-ui' as const;
const NOW = Date.parse('2026-11-27T10:00:00Z');

function snapshotOf(runtime: LiveDailyProgress, atMs = NOW): LiveProgressSnapshot {
  const read = runtime.read(atMs);
  return {
    schemaVersion: 1,
    units: 'SI',
    version: LIVE_PROGRESS_READ_VERSION,
    playerId: read.playerId,
    sessionId: read.sessionId,
    worldEpoch: read.worldEpoch,
    kind: read.kind,
    observedAtMs: read.observedAtMs,
    daily: read.daily,
    player: {
      playerId: read.player.playerId,
      xpBalance: read.player.xpBalance,
      xpBalanceMicroXp: read.player.xpBalanceMicroXp,
      level: read.player.level,
      nextLevelXp: read.player.nextLevelXp,
      levelProgress: read.player.levelProgress,
      activePlaySeconds: read.player.activePlaySeconds,
      entries: read.player.entries.slice(-16).map((entry) => ({
        entryId: entry.entryId,
        causeType: entry.causeType,
        amountXp: entry.amountXp,
        balanceAfterXp: entry.balanceAfterXp,
        realTimeMs: entry.realTimeMs,
        tick: entry.tick,
      })),
      credits: read.player.counters.credits,
      duplicates: read.player.counters.duplicates,
      debits: 0,
      balanceIsSumOfEntries: true,
    },
    xpFingerprint: read.xpFingerprint,
  };
}

function envelope(
  type: SimulationEvent['type'],
  tick: number,
  payload: Readonly<Record<string, unknown>>,
): SimulationEvent {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: SESSION,
    worldEpoch: 1,
    eventId: `276-ui:${type}:${tick}`,
    tick,
    entityIds: ['taxi:276-ui'],
    type,
    payload,
  } as unknown as SimulationEvent;
}

function completeRide(runtime: LiveDailyProgress, tick: number, rideId: string): void {
  for (const event of [
    envelope('MANUAL_START', tick, { vehicleId: 'taxi:276-ui', controlMode: 'MANUAL' }),
    envelope('PICKUP', tick + 1, { vehicleId: 'taxi:276-ui', rideId }),
    envelope('DROPOFF', tick + 2, { vehicleId: 'taxi:276-ui', rideId }),
  ])
    runtime.observeEvent(event, NOW);
}

function runtime(): LiveDailyProgress {
  return createLiveDailyProgress({
    playerId: DAILY_FIXTURE_PLAYER,
    timeZone: 'Europe/Bucharest',
    sessionId: SESSION,
    worldEpoch: 1,
    kind: 'ACADEMY',
    capabilities: learningOnlyCapabilities(),
    catalog: coreCatalog(),
    now: () => NOW,
  });
}

function panelFixture() {
  const document = createDailyPanelDocument(),
    host = document.createElement('div'),
    surface: boolean[] = [],
    live = runtime();
  completeRide(live, 100, 'ride:276-ui:1');
  completeRide(live, 200, 'ride:276-ui:2');
  const snapshot = (): LiveProgressSnapshot => snapshotOf(live);
  const panel = createLiveProgressPanel(host as unknown as HTMLElement, {
    read: snapshot,
    setSurface: (open) => surface.push(open),
  });
  const trigger = panel.getTrigger() as unknown as DailyPanelElement;
  const dialog = panel.getPanel() as unknown as DailyPanelElement;
  return { document, host, live, panel, trigger, dialog, surface };
}

test('276 panel shows XP, level, history, three objectives, window and expiry reason', () => {
  const f = panelFixture();
  try {
    assert.equal(f.trigger.textContent, 'Progres');
    assert.equal(f.trigger.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(f.panel.open(), true);
    assert.deepEqual(f.surface, [true]);
    assert.equal(f.dialog.hidden, false);
    assert.equal(f.dialog.getAttribute('role'), 'dialog');
    const close = byClass(f.dialog, 'live-progress__close')[0]!;
    assert.equal(f.document.activeElement, close);
    const view = f.panel.getView();
    assert.ok(view !== null);
    assert.equal(view.xpLabel, '200 XP');
    assert.equal(view.levelLabel, 'Nivel 2');
    assert.equal(view.history.length, 2);
    assert.equal(view.history[0]!.causeLabel, 'Misiune zilnică');
    assert.equal(view.history[0]!.amountLabel, '+100 XP');
    assert.equal(view.daily.counts.instances, 3);
    assert.equal(view.daily.counts.completed, 2);
    assert.equal(view.daily.phase, 'ACTIVE');
    assert.match(view.daily.windowLabel, /24 h/);
    assert.match(view.daily.resetLabel, /Reset/);
    assert.equal(view.daily.instances.length, 3);
    const learning = view.daily.instances.find((instance) => instance.title.includes('LEARNING'));
    assert.equal(learning?.state, 'ACTIVE');
    assert.equal(learning?.reason, null);

    assert.equal(f.dialog.getAttribute('data-xp-balance'), '200 XP');
    assert.equal(f.dialog.getAttribute('data-level'), '2');
    assert.equal(f.dialog.getAttribute('data-completed'), '2');
    assert.equal(f.dialog.getAttribute('data-history'), '2');
    assert.equal(f.dialog.getAttribute('data-daily-phase'), 'ACTIVE');
    assert.match(f.dialog.textContent, /Istoric XP/);
    assert.match(f.dialog.textContent, /Misiunile zilei/);
    assert.match(f.dialog.textContent, /Fereastră:/);
    assert.match(f.dialog.textContent, /XP nu scade/);
    for (const fragment of LIVE_PROGRESS_FORBIDDEN_FRAGMENTS)
      assert.equal(f.dialog.textContent.toLowerCase().includes(fragment.toLowerCase()), false);
    assert.equal(f.panel.getStats().globalListeners, 0);
    assert.equal(f.panel.getStats().listeners, 3);
  } finally {
    f.live.dispose();
    f.panel.dispose();
  }
});

test('276 panel traps Tab/Shift+Tab, closes with Escape and restores focus', () => {
  const f = panelFixture();
  try {
    const close = byClass(f.dialog, 'live-progress__close')[0]!;
    close.focus();
    f.panel.open();
    assert.equal(f.document.activeElement, close);
    const body = byClass(f.dialog, 'live-progress__body')[0]!;
    close.send('keydown', { key: 'Tab' });
    assert.equal(f.document.activeElement, body);
    body.send('keydown', { key: 'Tab' });
    assert.equal(f.document.activeElement, close);
    assert.equal(f.panel.getStats().tabWraps, 1);
    close.send('keydown', { key: 'Escape' });
    assert.equal(f.panel.isOpen(), false);
    assert.deepEqual(f.surface, [true, false]);
    assert.equal(f.trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(f.panel.getStats().escapes, 1);
    assert.equal(f.panel.getStats().tabWraps, 1);
    assert.equal(f.panel.getStats().focusRestores, 1);
  } finally {
    f.live.dispose();
    f.panel.dispose();
  }
});

test('276 closed panel never reads, open panel refreshes only a changed projection', () => {
  const f = panelFixture();
  try {
    assert.equal(f.panel.refresh(), 'SKIPPED_CLOSED');
    assert.equal(f.panel.getStats().reads, 0);
    f.panel.open();
    const reads = f.panel.getStats().reads;
    assert.ok(reads >= 1);
    assert.equal(f.panel.refresh(), 'SKIPPED_UNCHANGED');
    f.live.observeActiveWindow({
      startedAtMs: NOW,
      endedAtMs: NOW + 30_000,
      controlMode: 'AUTO',
      paused: false,
      focused: true,
      visible: true,
      afk: false,
    });
    assert.equal(f.panel.refresh(), 'RENDERED');
    assert.equal(f.panel.getStats().renders, 2);
    assert.match(f.dialog.textContent, /200\.5 XP/);
  } finally {
    f.live.dispose();
    f.panel.dispose();
  }
});

test('276 projection rejects a daily read of another session and never invents negative XP', () => {
  const f = panelFixture();
  try {
    const snapshot = snapshotOf(f.live);
    const parsed = parseLiveProgressSnapshot(snapshot);
    assert.equal(parsed.daily.instances.length, 3);
    assert.equal(parsed.player.debits, 0);
    assert.equal(parsed.player.balanceIsSumOfEntries, true);
    const projected = projectLiveProgressPanel(parsed);
    assert.equal(projected.history.length, 2);
    assert.throws(
      () => parseLiveProgressSnapshot({ ...snapshot, sessionId: 'other-session' }),
      /another player or session/,
    );
    assert.throws(
      () =>
        parseLiveProgressSnapshot({
          ...snapshot,
          player: { ...snapshot.player, xpBalance: -1 },
        }),
      /XP balance/,
    );
    assert.throws(
      () =>
        parseLiveProgressSnapshot({
          ...snapshot,
          player: { ...snapshot.player, debits: 1 },
        }),
      /XP debits/,
    );
  } finally {
    f.live.dispose();
    f.panel.dispose();
  }
});

test('276 panel version is the delivered UI contract', () => {
  assert.equal(LIVE_PROGRESS_UI_VERSION, '276-live-progress-panel-v1');
  assert.equal(LIVE_PROGRESS_READ_VERSION, '276-live-progress-read-v1');
});
