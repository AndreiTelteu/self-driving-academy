import assert from 'node:assert/strict';
import test from 'node:test';
import { LIVE_ECONOMY_VERSION, type LiveEconomySnapshot } from '../../src/economy';
import {
  LIVE_ECONOMY_SERVICE_VERSION,
  LIVE_ECONOMY_TEXT,
  LIVE_ECONOMY_UI_VERSION,
  createLiveEconomyHud,
  emptyLiveEconomyView,
  parseLiveEconomySnapshot,
  projectLiveEconomy,
} from '../../src/ui';
import type { LiveEconomyHud, LiveEconomyView } from '../../src/ui';
import { createHudDocument, createHudHost, type HudElement } from './hud-dom';
import { liveEconomyEmptyDay, liveEconomySnapshot } from './live-economy-fixture';

function hostElement(): { document: ReturnType<typeof createHudDocument>; host: HTMLElement } {
  const document = createHudDocument();
  return { document, host: createHudHost(document) as unknown as HTMLElement };
}

function textOf(root: HTMLElement): string {
  return (root as unknown as HudElement).textContent;
}

test('266 the UI mirrors the live economy contract and formats day/month buckets', () => {
  assert.equal(LIVE_ECONOMY_SERVICE_VERSION, LIVE_ECONOMY_VERSION);
  assert.equal(LIVE_ECONOMY_UI_VERSION, '266-live-economy-hud-v1');
  const snapshot = parseLiveEconomySnapshot(liveEconomySnapshot());
  assert.equal(snapshot.clock.secondsPerDay, 1_200);
  assert.equal(snapshot.clock.daysPerMonth, 30);
  const view = projectLiveEconomy(snapshot);
  assert.equal(view.empty, false);
  assert.match(view.day.label, /Ziua simulată d0000/);
  assert.match(view.month.label, /Luna simulată m0000/);
  assert.equal(view.day.revenue, `${LIVE_ECONOMY_TEXT.revenue}: 1400 SDA`);
  assert.match(view.day.rides, /4 \(3 finalizate, 1 eșuate, 0 anulate\)/);
  assert.equal(view.day.rating, `${LIVE_ECONOMY_TEXT.rating}: 4.50 (2 review-uri)`);
  assert.equal(view.day.exposure, `${LIVE_ECONOMY_TEXT.exposure}: 42.5 s`);
  assert.match(view.total, /1400 SDA · 4 curse decontate/);
  assert.match(view.counters, /4 · 1 duplicate · 0 respinse · 2 review-uri/);
  assert.match(view.last ?? '', /COMPLETED · 551 SDA · rating 5/);
  assert.match(view.epoch, /Epoca economică 1/);
});

test('266 a day without a bucket is "fără date", not zero revenue or a perfect rating', () => {
  const view = projectLiveEconomy(liveEconomyEmptyDay());
  assert.equal(view.empty, true);
  assert.match(view.day.label, /fără date/);
  assert.match(view.day.revenue, /fără date/);
  assert.match(view.day.rating, /indisponibil/);
  assert.equal(view.last, null);
  assert.equal(emptyLiveEconomyView().empty, true);
  assert.match(emptyLiveEconomyView().total, /fără date/);
});

test('266 an inconsistent bucket is refused before it can reach the HUD', () => {
  const snapshot = liveEconomySnapshot();
  assert.throws(
    () =>
      parseLiveEconomySnapshot({
        ...snapshot,
        today: { ...snapshot.today!, ratingHistogram: [1, 0, 0, 0, 0, 0] },
      }),
    /histogram/,
  );
  assert.throws(
    () =>
      parseLiveEconomySnapshot({
        ...snapshot,
        today: { ...snapshot.today!, averageRating: 5 },
      }),
    /average/,
  );
  assert.throws(() => parseLiveEconomySnapshot({ ...snapshot, historyScans: 1 }), /history/);
  assert.throws(
    () => parseLiveEconomySnapshot({ ...snapshot, counters: { ...snapshot.counters, reviews: 9 } }),
    /reviews/,
  );
});

test('266 the HUD reads at 10 Hz, writes only changed lines and has no listener', () => {
  const { document, host } = hostElement();
  const reads: number[] = [];
  let view: LiveEconomySnapshot | null = null;
  const hud: LiveEconomyHud = createLiveEconomyHud(host, {
    read: () => {
      reads.push(1);
      return view;
    },
  });
  assert.equal(hud.update(0), 'RENDERED');
  assert.equal(hud.update(5), 'SKIPPED_THROTTLED');
  assert.equal(reads.length, 1);
  const stats = hud.getStats();
  assert.equal(stats.listeners, 0);
  assert.equal(stats.globalListeners, 0);
  assert.equal(stats.historyScans, 0);
  assert.equal(stats.empty, true);
  assert.match(textOf(hud.getElement()), /fără date/);

  view = liveEconomySnapshot();
  assert.equal(hud.update(100), 'RENDERED');
  assert.equal(hud.update(150), 'SKIPPED_THROTTLED');
  assert.equal(hud.update(200), 'SKIPPED_UNCHANGED');
  view = liveEconomyEmptyDay();
  assert.equal(hud.update(300), 'RENDERED');
  const rendered: LiveEconomyView | null = hud.getView();
  assert.ok(rendered !== null);
  assert.equal(rendered!.empty, true);
  assert.match(textOf(hud.getElement()), /fără date/);
  assert.equal(hud.getStats().renders, 3);
  assert.ok(hud.getStats().writes > 0);

  hud.hide();
  assert.equal(hud.isVisible(), false);
  hud.show();
  assert.equal(hud.isVisible(), true);
  hud.dispose();
  assert.equal(hud.getStats().disposed, true);
  assert.equal(document.createElement('div').children.length, 0);
});
