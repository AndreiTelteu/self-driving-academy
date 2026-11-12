import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHALLENGE_PANEL_ACTIONS,
  CHALLENGE_PANEL_LIMITS,
  CHALLENGE_PANEL_TEXT,
  CHALLENGE_PANEL_VERSION,
  parseChallengePanelSnapshot,
  projectChallengePanel,
} from '../../src/ui';
import { CHALLENGE_EXPERIENCE_LIMITS } from '../../src/missions';
import {
  byChallengeClass,
  createChallengePanelHarness,
  type ChallengePanelHarness,
} from './challenge-panel-fixture';

/**
 * 233 challenge panel tests.
 *
 * The panel is a read-only projection: these tests prove it renders the real contracts, that all
 * four actions are accessible per state, that focus moves and returns, that Escape closes it, that
 * no global listener exists, and that it never performs an action by itself.
 */

function offerOnce(harness: ChallengePanelHarness) {
  const offer = harness.offer();
  harness.panel.open();
  return offer;
}

test('233 the panel exposes the published contract and no global listener', () => {
  const harness = createChallengePanelHarness();
  assert.equal(harness.panel.version, CHALLENGE_PANEL_VERSION);
  assert.equal(CHALLENGE_PANEL_LIMITS.globalListeners, 0);
  assert.equal(CHALLENGE_PANEL_LIMITS.dailyPicks, CHALLENGE_EXPERIENCE_LIMITS.dailyPicks);
  const view = projectChallengePanel(harness.snapshot());
  assert.equal(view.version, CHALLENGE_PANEL_VERSION);
  assert.equal(view.offer, null);
  assert.equal(view.records.length, 0);
  assert.ok(view.daily !== null);
  assert.equal(view.daily!.picks.length, 3);
  const stats = harness.panel.getStats();
  assert.equal(stats.globalListeners, 0);
  assert.equal(stats.open, false);
  assert.equal(stats.reads, 0);
  assert.equal(stats.actions, 0);
  harness.dispose();
});

test('233 the trigger opens one dialog, moves focus in and restores it on close', () => {
  const harness = createChallengePanelHarness();
  const trigger = harness.trigger();
  const dialog = harness.dialog();
  assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(dialog.hasAttribute('hidden'), true);

  harness.recordLast();
  const offer = offerOnce(harness);
  assert.equal(harness.panel.isOpen(), true);
  assert.equal(dialog.hasAttribute('hidden'), false);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(harness.document.activeElement, harness.actionButton('ACCEPT'));
  assert.deepEqual(harness.surface, [true]);
  assert.equal(harness.reads(), 1);

  const accept = harness.actionButton('ACCEPT');
  harness.panel.close();
  assert.equal(harness.panel.isOpen(), false);
  assert.equal(dialog.hasAttribute('hidden'), true);
  assert.equal(harness.document.activeElement, trigger);
  assert.deepEqual(harness.surface, [true, false]);
  assert.ok(offer.templateId.length > 0);
  assert.notEqual(accept.getAttribute('data-action'), null);
  harness.dispose();
});

test('233 the offer shows the authored premise, the objective and the real reward', () => {
  const harness = createChallengePanelHarness();
  const offer = offerOnce(harness);
  const view = harness.panel.getView()!;
  assert.ok(view.offer !== null);
  assert.equal(view.offer.templateId, offer.templateId);
  assert.equal(view.offer.premise.length > 0, true);
  assert.match(view.offer.objectiveLabel, new RegExp(offer.objective.objectiveKind));
  assert.equal(view.offer.progressLabel, `—/${offer.objective.target}`);
  assert.equal(view.offer.rewardLabel, `${offer.academyXp} XP`);
  assert.equal(view.offer.incidentsLabel, String(offer.objective.incidentBudget));
  const labels = view.actions.map((entry) => entry.label);
  assert.deepEqual(labels, ['Acceptă', 'Refuză', 'Continuă condusul']);
  assert.ok(view.actions.every((entry) => entry.enabled));
  for (const action of view.actions) harness.actionButton(action.action);
  assert.equal(harness.panel.getStats().actions, 0);
  harness.dispose();
});

test('233 a disabled accept explains the setting and never sends the action', () => {
  const harness = createChallengePanelHarness({ offersEnabled: false });
  offerOnce(harness);
  const view = harness.panel.getView()!;
  const accept = view.actions.find((entry) => entry.action === 'ACCEPT')!;
  assert.equal(accept.enabled, false);
  assert.match(accept.reason ?? '', /oprite/);
  harness.actionButton('ACCEPT').dispatch('click');
  assert.equal(harness.actions.length, 0);
  assert.equal(harness.panel.getStats().actions, 0);
  const decline = view.actions.find((entry) => entry.action === 'DECLINE')!;
  assert.equal(decline.enabled, true);
  harness.actionButton('DECLINE').dispatch('click');
  assert.deepEqual(harness.actions, ['DECLINE']);
  assert.equal(harness.panel.getStats().declineActions, 1);
  harness.dispose();
});

test('233 a failure shows the retry action and the comic reaction without promising a loss', () => {
  const harness = createChallengePanelHarness();
  const offer = harness.offer();
  harness.accept(offer.instanceId);
  harness.activate(offer.instanceId);
  harness.fail(offer.instanceId);
  harness.record(harness.director.instance(offer.instanceId)!);
  harness.panel.open();
  const view = harness.panel.getView()!;
  assert.ok(view.result !== null);
  assert.equal(view.result.status, 'FAILED');
  assert.equal(view.result.statusLabel, 'Eșec');
  assert.equal(view.result.reactionTone, 'COMMISERATION');
  assert.ok(view.result.reactionText.length > 0);
  assert.match(view.result.xpStatementLabel, /nu costă nimic/);
  const retry = view.actions.find((entry) => entry.action === 'RETRY')!;
  assert.equal(retry.enabled, true);
  assert.equal(retry.label, 'Mai încearcă');
  assert.equal(view.actions.find((entry) => entry.action === 'CONTINUE')!.enabled, true);
  harness.actionButton('RETRY').dispatch('click');
  assert.deepEqual(harness.actions, ['RETRY']);
  assert.equal(harness.panel.getStats().retryActions, 1);
  harness.dispose();
});

test('233 a completion shows the credited XP, the record and a disabled retry', () => {
  const harness = createChallengePanelHarness();
  const offer = harness.offer();
  harness.accept(offer.instanceId);
  harness.activate(offer.instanceId);
  const completed = harness.complete(offer.instanceId);
  harness.record(completed);
  harness.credit(completed);
  harness.panel.open();
  const view = harness.panel.getView()!;
  assert.ok(view.result !== null);
  assert.equal(view.result.status, 'COMPLETED');
  assert.equal(view.result.statusLabel, 'Reușită');
  assert.equal(view.result.recordComparison, 'FIRST_RECORD');
  assert.equal(view.result.recordLabel, 'Primul record');
  assert.match(view.result.xpLabel, /XP creditați/);
  assert.equal(view.result.reactionTone, 'CELEBRATION');
  assert.match(view.result.xpStatementLabel, /o singură dată/);
  const retry = view.actions.find((entry) => entry.action === 'RETRY')!;
  assert.equal(retry.enabled, false);
  assert.match(retry.reason ?? '', /doar din eșec/);
  assert.equal(view.counts.creditedXp, offer.academyXp);
  assert.equal(view.counts.records, 1);
  harness.dispose();
});

test('233 the records and the daily set are rendered from the real contracts', () => {
  const harness = createChallengePanelHarness();
  const offer = harness.offer();
  harness.accept(offer.instanceId);
  harness.activate(offer.instanceId);
  const completed = harness.complete(offer.instanceId, 300);
  harness.record(completed);
  harness.panel.open();
  const view = harness.panel.getView()!;
  assert.equal(view.records.length, 1);
  assert.equal(view.records[0]!.templateId, completed.templateId);
  assert.match(view.records[0]!.bestLabel, /1\/1/);
  assert.equal(view.daily!.picks.length, 3);
  assert.ok(view.daily!.picks.some((entry) => entry.controlLabel === 'MANUAL'));
  const records = byChallengeClass(harness.dialog(), 'challenge-panel__record');
  assert.equal(records.length, 1);
  const picks = byChallengeClass(harness.dialog(), 'challenge-panel__daily-pick');
  assert.equal(picks.length, 3);
  assert.equal(harness.dialog().getAttribute('data-daily-picks'), '3');
  assert.equal(harness.dialog().getAttribute('data-records'), '1');
  harness.dispose();
});

test('233 Escape closes the panel and Tab keeps the focus inside', () => {
  const harness = createChallengePanelHarness();
  offerOnce(harness);
  const dialog = harness.dialog();
  assert.equal(harness.document.activeElement, harness.actionButton('ACCEPT'));
  harness.actionButton('ACCEPT').send('keydown', { key: 'Tab' });
  assert.equal(harness.panel.getStats().tabWraps, 0);
  assert.equal(harness.document.activeElement, harness.actionButton('DECLINE'));
  const close = byChallengeClass(dialog, 'challenge-panel__close')[0]!;
  close.send('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(harness.document.activeElement, harness.actionButton('ACCEPT'));
  const body = byChallengeClass(dialog, 'challenge-panel__body')[0]!;
  body.focus();
  body.send('keydown', { key: 'Tab' });
  assert.equal(harness.panel.getStats().tabWraps, 1);
  assert.equal(harness.document.activeElement, close);
  harness.closeByEscape();
  assert.equal(harness.panel.isOpen(), false);
  assert.equal(harness.panel.getStats().escapes, 1);
  harness.dispose();
});

test('233 refresh skips a closed or unchanged panel and renders a changed one', () => {
  const harness = createChallengePanelHarness();
  assert.equal(harness.panel.refresh(), 'SKIPPED_CLOSED');
  const offer = harness.offer();
  harness.panel.open();
  assert.equal(harness.panel.refresh(), 'SKIPPED_UNCHANGED');
  harness.accept(offer.instanceId);
  assert.equal(harness.panel.refresh(), 'RENDERED');
  assert.equal(harness.panel.getView()!.active!.instanceId, offer.instanceId);
  assert.equal(harness.reads(), 3);
  harness.dispose();
});

test('233 the panel refuses a snapshot that contradicts the contracts', () => {
  const harness = createChallengePanelHarness();
  const offer = harness.offer();
  const snapshot = harness.snapshot();
  assert.ok(snapshot.offer !== null);
  const wrongReward = {
    ...snapshot,
    result: {
      instanceId: offer.instanceId,
      templateId: offer.templateId,
      templateVersion: offer.templateVersion,
      title: offer.title,
      status: 'FAILED',
      reason: 'DEADLINE_EXPIRED',
      target: offer.objective.target,
      progress: 0,
      academyXp: 0,
      xpCredited: 90,
      sessionKind: 'ACADEMY',
      recordComparison: 'NOT_ELIGIBLE',
      endedAtTick: 10,
    },
  };
  assert.throws(
    () => parseChallengePanelSnapshot(wrongReward),
    /completed challenge can credit XP/,
  );
  const missingTarget = {
    ...snapshot,
    result: {
      instanceId: offer.instanceId,
      templateId: offer.templateId,
      templateVersion: offer.templateVersion,
      title: offer.title,
      status: 'COMPLETED',
      reason: 'TARGET_REACHED',
      target: 3,
      progress: 1,
      academyXp: 80,
      xpCredited: 80,
      sessionKind: 'ACADEMY',
      recordComparison: 'FIRST_RECORD',
      endedAtTick: 10,
    },
  };
  assert.throws(() => parseChallengePanelSnapshot(missingTarget), /must reach its target/);
  const badDaily = {
    ...snapshot,
    daily: { dailyDate: '2026-11-12', picks: snapshot.daily!.picks.slice(0, 2) },
  };
  assert.throws(() => parseChallengePanelSnapshot(badDaily), /exactly three/);
  assert.throws(
    () => parseChallengePanelSnapshot({ ...snapshot, extra: true }),
    /Unknown challenge panel snapshot field/,
  );
  harness.dispose();
});

test('233 the panel reads nothing while closed and disposes every owned listener', () => {
  const harness = createChallengePanelHarness();
  harness.panel.open();
  harness.panel.close();
  const before = harness.reads();
  assert.equal(harness.panel.refresh(), 'SKIPPED_CLOSED');
  assert.equal(harness.reads(), before);
  const stats = harness.panel.getStats();
  assert.ok(stats.listeners > 0);
  harness.dispose();
  const disposed = harness.panel.getStats();
  assert.equal(disposed.disposed, true);
  assert.equal(disposed.listeners, 0);
  assert.equal(disposed.elements, 0);
  assert.equal(disposed.globalListeners, 0);
  assert.throws(() => harness.panel.open(), /disposed/);
});

test('233 the dialog stays inside a small viewport and keeps the four action labels', () => {
  const harness = createChallengePanelHarness();
  offerOnce(harness);
  const style = harness.dialog().getAttribute('style') ?? '';
  assert.match(style, /width:min\(92vw/);
  assert.match(style, /max-height:min\(90vh/);
  assert.deepEqual([...CHALLENGE_PANEL_ACTIONS], ['ACCEPT', 'DECLINE', 'RETRY', 'CONTINUE']);
  assert.equal(CHALLENGE_PANEL_TEXT.trigger, 'Provocări');
  const stats = harness.panel.getStats();
  assert.equal(stats.globalListeners, 0);
  assert.ok(stats.elements > 20);
  harness.dispose();
});
