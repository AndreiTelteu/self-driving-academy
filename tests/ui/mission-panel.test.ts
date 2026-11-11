import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MISSION_FAILURE_REASONS,
  campaignMissionStates,
  createCampaignMissionCatalog,
  missionObjectiveKinds,
  missionRewardKinds,
  parseMissionCatalog,
  type MissionCatalog,
} from '../../src/missions';
import {
  MISSION_PANEL_ATTEMPT_STATES,
  MISSION_PANEL_CAMPAIGN_STATES,
  MISSION_PANEL_FAILURE_REASONS,
  MISSION_PANEL_LIMITS,
  MISSION_PANEL_OBJECTIVE_KINDS,
  MISSION_PANEL_REWARD_KINDS,
  MISSION_PANEL_TEXT,
  MISSION_PANEL_VERSION,
  composeMissionPanelSnapshot,
  parseMissionPanelSnapshot,
} from '../../src/ui';
import {
  byMissionClass,
  createMissionPanelHarness,
  type MissionElement,
} from './mission-panel-fixture';

const statusOf = (dialog: MissionElement): string =>
  byMissionClass(dialog, 'mission-panel__status')[0]?.textContent ?? '';

function upgradedCatalogs(): { applied: MissionCatalog; stale: MissionCatalog } {
  const base = createCampaignMissionCatalog();
  const missions = base.missions.map((mission) =>
    mission.missionId === 'campaign-1-first-taxi'
      ? {
          ...mission,
          version: '2',
          title: 'Primul taxi (versiunea 2)',
          objectives: mission.objectives.map((objective) => ({
            ...objective,
            label: 'Finalizează o cursă MANUAL (versiunea 2)',
          })),
        }
      : mission,
  );
  return {
    applied: parseMissionCatalog({ ...base, missions }),
    stale: parseMissionCatalog({ ...base, missions: base.missions }),
  };
}

function rawSnapshot(value: unknown): {
  missions: Record<string, unknown>[];
} {
  return JSON.parse(JSON.stringify(value)) as { missions: Record<string, unknown>[] };
}

test('126 the panel vocabularies are the delivered 116 and 125 vocabularies', () => {
  assert.deepEqual([...MISSION_PANEL_CAMPAIGN_STATES], [...campaignMissionStates]);
  assert.deepEqual([...MISSION_PANEL_FAILURE_REASONS], [...MISSION_FAILURE_REASONS]);
  assert.deepEqual([...MISSION_PANEL_OBJECTIVE_KINDS], [...missionObjectiveKinds]);
  assert.deepEqual([...MISSION_PANEL_REWARD_KINDS], [...missionRewardKinds]);
  assert.deepEqual([...MISSION_PANEL_ATTEMPT_STATES], ['ACTIVE', 'COMPLETED', 'FAILED']);
  assert.equal(MISSION_PANEL_LIMITS.missions, 32);
  assert.equal(MISSION_PANEL_LIMITS.objectivesPerMission, 8);
  assert.equal(MISSION_PANEL_LIMITS.attemptsPerMission, 8);
  assert.equal(MISSION_PANEL_LIMITS.globalListeners, 0);
  const harness = createMissionPanelHarness();
  assert.equal(harness.snapshot().version, MISSION_PANEL_VERSION);
});

test('126 a fresh campaign shows one available mission and the locked tail', () => {
  const harness = createMissionPanelHarness();
  harness.panel.open();
  const view = harness.panel.getView();
  assert.ok(view !== null);
  assert.equal(view.counts.missions, 8);
  assert.equal(view.counts.available, 1);
  assert.equal(view.counts.locked, 7);
  assert.equal(view.counts.completed, 0);
  const first = view.missions[0]!;
  assert.equal(first.missionId, 'campaign-1-first-taxi');
  assert.equal(first.state, 'AVAILABLE');
  assert.equal(first.attemptState, null);
  assert.equal(first.progressLabel, MISSION_PANEL_TEXT.noAttempt);
  assert.equal(first.nextAttemptLabel, 'Următoarea încercare: 1');
  assert.equal(first.replayAvailable, true);
  assert.match(first.replayLabel, /Reluare disponibilă: încercarea 1 din 8/);
  const locked = view.missions[3]!;
  assert.equal(locked.state, 'LOCKED');
  assert.equal(locked.attemptsLabel, '0 din 8 încercări încheiate');
  assert.equal(locked.missingPrerequisitesLabel, 'Lipsesc: campaign-3-following-distance');
  assert.match(locked.replayLabel, /Reluare indisponibilă: misiunea este blocată/);
  assert.equal(locked.objectives.length, 1);
  assert.equal(locked.objectives[0]!.progress, null);
  assert.equal(locked.objectives[0]!.stateLabel, 'Neevaluat');
  assert.match(locked.objectives[0]!.progressLabel, /\(neevaluat\)/);
  assert.match(statusOf(harness.dialog()), /Campanie: 0 finalizate, 1 disponibile, 7 blocate/);
  assert.equal(harness.panel.getStats().listeners, 3 + 8);
  assert.equal(harness.panel.getStats().globalListeners, 0);
  assert.equal(harness.panel.getStats().locked, 7);
});

test('126 an available mission becomes a real in-progress attempt and a real completion', () => {
  const harness = createMissionPanelHarness();
  const started = harness.start('campaign-1-first-taxi');
  harness.panel.open();
  let view = harness.panel.getView();
  assert.equal(view?.missions[0]!.attemptState, 'ACTIVE');
  assert.equal(view?.missions[0]!.state, 'AVAILABLE');
  assert.equal(view?.missions[0]!.progressLabel, '0 din 1 obiective îndeplinite');
  assert.equal(view?.counts.active, 1);
  assert.equal(view?.missions[0]!.objectives[0]!.progress, 0);
  assert.equal(view?.missions[0]!.objectives[0]!.stateLabel, 'În așteptare');
  assert.match(view?.missions[0]!.attemptStateLabel ?? '', /În desfășurare/);
  assert.match(statusOf(harness.dialog()), /1 în desfășurare/);

  harness.panel.close();
  harness.complete('campaign-1-first-taxi');
  assert.equal(harness.panel.refresh(), 'SKIPPED_CLOSED');
  harness.panel.open();
  view = harness.panel.getView();
  const mission = view!.missions[0]!;
  assert.equal(mission.state, 'COMPLETED');
  assert.equal(mission.attemptState, 'COMPLETED');
  assert.equal(mission.progressLabel, '1 din 1 obiective îndeplinite');
  assert.equal(mission.objectives[0]!.progress, 1);
  assert.equal(mission.objectives[0]!.percent, 100);
  assert.equal(mission.objectives[0]!.stateLabel, 'Îndeplinit');
  assert.equal(view!.missions[1]!.state, 'AVAILABLE');
  assert.equal(mission.attemptsLabel, '1 din 8 încercări încheiate');
  assert.equal(mission.nextAttemptLabel, 'Următoarea încercare: 2');
  assert.match(mission.rewardsLabel, /100 XP/);
  assert.match(mission.rewardsLabel, /acordate: 2/);
  assert.equal(harness.tracker.instance(started.instanceId)?.state, 'COMPLETED');
  assert.match(statusOf(harness.dialog()), /Campanie: 1 finalizate, 1 disponibile, 6 blocate/);

  harness.complete('campaign-2-first-demonstration');
  assert.equal(harness.panel.refresh(), 'RENDERED');
  assert.match(statusOf(harness.dialog()), /Campanie: 2 finalizate, 1 disponibile, 5 blocate/);
  assert.equal(harness.panel.getStats().renders, 3);
});

test('126 a failed mission shows the closed reason, the real progress and a replay option', () => {
  const harness = createMissionPanelHarness();
  harness.complete('campaign-1-first-taxi');
  harness.complete('campaign-2-first-demonstration');
  const failed = harness.failWithBudget('campaign-3-following-distance');
  assert.equal(failed.state, 'FAILED');
  assert.equal(failed.failureReason, 'INCIDENT_BUDGET_EXCEEDED');
  assert.equal(failed.incidents, 3);
  assert.equal(failed.incidentBudget, 2);

  harness.panel.open();
  const mission = harness.panel.getView()!.missions[2]!;
  assert.equal(mission.missionId, 'campaign-3-following-distance');
  assert.equal(mission.state, 'AVAILABLE');
  assert.equal(mission.attemptState, 'FAILED');
  assert.equal(mission.failureReason, 'INCIDENT_BUDGET_EXCEEDED');
  assert.equal(
    mission.failureLabel,
    'Bugetul de incidente a fost depășit (INCIDENT_BUDGET_EXCEEDED)',
  );
  assert.match(mission.limitsLabel, /incidente 3 din 2/);
  assert.match(mission.objectives[0]!.progressLabel, /din 2/);
  assert.equal(mission.objectives[0]!.satisfied, false);
  assert.match(mission.replayLabel, /Reluare disponibilă: încercarea 1 din 8/);
  assert.match(mission.replayLabel, /Eșecul păstrează profilurile învățate/);
  assert.match(mission.replayPolicyLabel, /profil SNAPSHOT snapshot:campaign-comparison/);
  assert.match(mission.replayPolicyLabel, /scenariu scenario:following-comparison/);
  assert.equal(harness.panel.getStats().failed, 1);
  assert.equal(harness.panel.getStats().active, 0);
  const failureNode = byMissionClass(harness.dialog(), 'mission-panel__failure').find((node) =>
    (node.textContent ?? '').includes('INCIDENT_BUDGET_EXCEEDED'),
  );
  assert.ok(failureNode !== undefined);
});

test('126 every closed failure reason comes from a real 116 instance and keeps its own tick', () => {
  const harness = createMissionPanelHarness();
  harness.complete('campaign-1-first-taxi');
  harness.complete('campaign-2-first-demonstration');
  const observed: { reason: string; attempt: number; failedTick: number; label: string }[] = [];
  const capture = () => {
    harness.panel.close();
    harness.panel.open();
    const mission = harness.panel.getView()!.missions[2]!;
    const latest = harness.tracker
      .instances()
      .filter((entry) => entry.missionId === 'campaign-3-following-distance')
      .at(-1)!;
    assert.equal(mission.failureReason, latest.failureReason);
    assert.equal(mission.attemptState, 'FAILED');
    assert.equal(latest.state, 'FAILED');
    observed.push({
      reason: mission.failureReason!,
      attempt: latest.attempt,
      failedTick: latest.failedTick!,
      label: mission.failureLabel!,
    });
  };

  const budget = harness.failWithBudget('campaign-3-following-distance');
  capture();
  harness.failWithWindow('campaign-3-following-distance');
  capture();
  const reset = harness.failExplicit('campaign-3-following-distance', 'SCENARIO_RESET');
  capture();
  const abandoned = harness.failExplicit('campaign-3-following-distance', 'PLAYER_ABANDONED');
  capture();

  assert.deepEqual(
    observed.map((entry) => entry.reason),
    ['INCIDENT_BUDGET_EXCEEDED', 'EVALUATION_WINDOW_EXPIRED', 'SCENARIO_RESET', 'PLAYER_ABANDONED'],
  );
  assert.deepEqual(
    [...new Set(observed.map((entry) => entry.reason))].sort(),
    [...MISSION_FAILURE_REASONS].sort(),
  );
  assert.deepEqual(
    observed.map((entry) => entry.attempt),
    [1, 2, 3, 4],
  );
  assert.ok(observed[1]!.failedTick > observed[0]!.failedTick);
  assert.match(observed[1]!.label, /Fereastra de evaluare a expirat/);
  assert.match(observed[2]!.label, /Scenariul a fost resetat/);
  assert.match(observed[3]!.label, /Misiunea a fost abandonată/);
  assert.equal(budget.failureReason, 'INCIDENT_BUDGET_EXCEEDED');
  assert.equal(reset.failureReason, 'SCENARIO_RESET');
  assert.equal(abandoned.failureReason, 'PLAYER_ABANDONED');
  assert.equal(abandoned.attempt, 4);
});

test('126 inspecting a locked mission does not change progress, attempts or resets', () => {
  const harness = createMissionPanelHarness();
  const before = harness.progressFacts(),
    trackerBefore = harness.trackerFacts(),
    readsBefore = harness.reads;
  harness.panel.open();
  const readsAfterOpen = harness.reads;
  assert.equal(readsAfterOpen, readsBefore + 1);
  assert.equal(harness.panel.getSelectedMissionId(), 'campaign-1-first-taxi');

  for (const missionId of [
    'campaign-4-stops-and-signals',
    'campaign-8-fleet-challenge',
    'campaign-5-passenger',
  ]) {
    assert.equal(harness.panel.selectMission(missionId), true);
    assert.equal(harness.panel.getSelectedMissionId(), missionId);
    assert.equal(harness.missionDetails(missionId).hasAttribute('hidden'), false);
    assert.equal(harness.missionButton(missionId).getAttribute('aria-expanded'), 'true');
    assert.equal(harness.panel.getStats().selectedMissionId, missionId);
  }
  harness.closeByEscape();
  harness.panel.open();
  harness.panel.close();

  assert.equal(harness.reads, readsAfterOpen + 1);
  assert.equal(harness.progressFacts(), before);
  assert.equal(harness.trackerFacts(), trackerBefore);
  const stats = harness.panel.getStats();
  assert.equal(stats.inspections, 3);
  assert.equal(stats.reads, 2);
  const locked = harness
    .progress()
    .missions.find((mission) => mission.missionId === 'campaign-4-stops-and-signals')!;
  assert.equal(locked.state, 'LOCKED');
  assert.equal(locked.attempts, 0);
  assert.equal(locked.nextAttempt, 1);
  assert.equal(locked.playable, false);
  assert.equal(locked.resets, 0);
  assert.equal(harness.tracker.instances().length, 0);
  assert.equal(harness.panel.getStats().locked, 7);
});

test('126 the trigger is native, the dialog is labelled and focus, Escape and Tab stay inside', () => {
  const harness = createMissionPanelHarness();
  const trigger = harness.trigger(),
    dialog = harness.dialog();
  assert.equal(trigger.tagName, 'button');
  assert.equal(trigger.getAttribute('type'), 'button');
  assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(trigger.getAttribute('aria-controls'), dialog.getAttribute('id'));
  assert.equal(trigger.textContent, MISSION_PANEL_TEXT.trigger);
  assert.equal(dialog.tagName, 'section');
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(dialog.hasAttribute('hidden'), true);
  assert.ok(dialog.getAttribute('aria-labelledby') !== null);
  assert.ok(dialog.getAttribute('aria-describedby') !== null);
  assert.equal(harness.panel.getPanel(), dialog as unknown as HTMLElement);

  trigger.send('click');
  assert.equal(harness.panel.isOpen(), true);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(dialog.hasAttribute('hidden'), false);
  assert.equal(
    (harness.document.activeElement as MissionElement).getAttribute('data-mission-id'),
    'campaign-1-first-taxi',
  );

  harness.closeByEscape();
  assert.equal(harness.panel.isOpen(), false);
  assert.equal(harness.panel.getStats().escapes, 1);
  assert.equal(harness.document.activeElement, trigger);
  assert.equal(harness.panel.getStats().focusRestores, 1);
  assert.deepEqual(harness.surface, [true, false]);

  harness.panel.open();
  const closeButton = byMissionClass(dialog, 'mission-panel__close')[0]!;
  const body = byMissionClass(dialog, 'mission-panel__body')[0]!;
  harness.missionButton('campaign-1-first-taxi').send('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(harness.document.activeElement, closeButton);
  closeButton.send('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(harness.document.activeElement, body);
  body.send('keydown', { key: 'Tab' });
  assert.equal(harness.document.activeElement, closeButton);
  assert.equal(harness.panel.getStats().tabWraps, 2);
  assert.equal(harness.panel.getStats().globalListeners, 0);
  assert.equal(harness.panel.getStats().listeners, 3 + 8);
  assert.equal(trigger.listenerCount, 1);
  assert.equal(dialog.listenerCount, 1);
});

test('126 the panel reads once per open and never re-reads while closed', () => {
  const harness = createMissionPanelHarness(),
    panel = harness.panel;
  assert.equal(panel.refresh(), 'SKIPPED_CLOSED');
  assert.equal(harness.reads, 0);
  assert.equal(panel.getStats().renders, 0);

  panel.open();
  assert.equal(harness.reads, 1);
  assert.equal(panel.getStats().renders, 1);
  assert.equal(panel.refresh(), 'SKIPPED_UNCHANGED');
  assert.equal(harness.reads, 2);
  assert.equal(panel.getStats().skippedUnchanged, 1);

  harness.closeByEscape();
  harness.complete('campaign-1-first-taxi');
  assert.equal(panel.refresh(), 'SKIPPED_CLOSED');
  assert.equal(harness.reads, 2);
  panel.open();
  assert.equal(harness.reads, 3);
  assert.match(statusOf(harness.dialog()), /1 finalizate/);
  assert.equal(panel.getStats().renders, 2);
});

test('126 the text follows the applied definition version, not the newest or the oldest', () => {
  const { applied, stale } = upgradedCatalogs();
  const harness = createMissionPanelHarness({ catalog: applied });
  harness.complete('campaign-1-first-taxi');
  harness.panel.open();
  const mission = harness.panel.getView()!.missions[0]!;
  assert.equal(mission.versionLabel, 'Versiunea 2');
  assert.equal(mission.title, 'Primul taxi (versiunea 2)');
  assert.match(mission.objectives[0]!.label, /versiunea 2/);
  assert.match(mission.description, /versiunea 2/);
  const instance = harness.tracker
    .instances()
    .find((entry) => entry.missionId === 'campaign-1-first-taxi')!;
  assert.equal(instance.missionVersion, '2');
  assert.equal(
    mission.title,
    applied.missions.find((entry) => entry.missionId === instance.missionId)!.title,
  );
  assert.equal(
    stale.missions.find((entry) => entry.missionId === instance.missionId)!.version,
    '1',
  );
  assert.throws(() => harness.compose(stale), /is version 1, not the applied version 2/);
});

test('126 the parser refuses a snapshot that contradicts the real evaluation', () => {
  const harness = createMissionPanelHarness();
  harness.complete('campaign-1-first-taxi');
  const snapshot = harness.snapshot();
  assert.equal(snapshot.missions[0]!.attempt!.objectives[0]!.progress, 1);

  const forgedSatisfied = rawSnapshot(snapshot);
  const forgedAttempt = forgedSatisfied.missions[0]!.attempt as Record<string, unknown>;
  (forgedAttempt.objectives as Record<string, unknown>[])[0]!.satisfied = false;
  assert.throws(() => parseMissionPanelSnapshot(forgedSatisfied), /contradicts its satisfied flag/);

  const forgedVersion = rawSnapshot(snapshot);
  (forgedVersion.missions[0]!.attempt as Record<string, unknown>).missionVersion = '9';
  assert.throws(
    () => parseMissionPanelSnapshot(forgedVersion),
    /is not the applied version 2|is not the applied version 1/,
  );

  const forgedField = rawSnapshot(snapshot);
  forgedField.missions[0]!.extra = 1;
  assert.throws(() => parseMissionPanelSnapshot(forgedField), /unknown field: extra/);

  assert.throws(
    () =>
      composeMissionPanelSnapshot({
        sessionId: 'session-126-forged',
        worldEpoch: 1,
        tick: 1,
        catalog: harness.tracker.catalog(),
        progress: {
          ...harness.progress(),
          missions: harness
            .progress()
            .missions.map((entry) =>
              entry.missionId === 'campaign-1-first-taxi'
                ? { ...entry, attempts: 0, nextAttempt: 5 }
                : entry,
            ),
        },
        instances: harness.tracker.instances(),
      }),
    /nextAttempt 5 does not follow/,
  );
  assert.throws(
    () =>
      composeMissionPanelSnapshot({
        sessionId: 'session-126-forged',
        worldEpoch: 1,
        tick: 1,
        catalog: harness.tracker.catalog(),
        progress: {
          ...harness.progress(),
          missions: harness.progress().missions.map((entry) =>
            entry.missionId === 'campaign-3-following-distance'
              ? {
                  ...entry,
                  state: 'AVAILABLE' as const,
                  playable: true,
                  missingPrerequisites: ['campaign-2-first-demonstration'],
                }
              : entry,
          ),
        },
        instances: harness.tracker.instances(),
      }),
    /available mission still reports missing prerequisites/,
  );
});

test('126 a HARD attempt displays the HARD target of the applied definition', () => {
  const harness = createMissionPanelHarness();
  for (const missionId of [
    'campaign-1-first-taxi',
    'campaign-2-first-demonstration',
    'campaign-3-following-distance',
    'campaign-4-stops-and-signals',
    'campaign-5-passenger',
    'campaign-6-city-copies-you',
    'campaign-7-changing-a-habit',
  ])
    harness.complete(missionId);
  harness.start('campaign-8-fleet-challenge', 'HARD');
  harness.panel.open();
  const mission = harness.panel.getView()!.missions[7]!;
  assert.equal(mission.objectives[0]!.target, 4);
  assert.equal(mission.objectives[0]!.progressLabel, '0 din 4');
  assert.equal(mission.objectives[0]!.percent, 0);
  const bar = byMissionClass(harness.dialog(), 'mission-panel__objective-bar')[7];
  assert.ok(bar !== undefined);
  assert.equal(bar.getAttribute('aria-valuemax'), '4');
  assert.equal(bar.getAttribute('aria-valuenow'), '0');

  const forged = rawSnapshot(harness.snapshot());
  const attempt = forged.missions[7]!.attempt as Record<string, unknown>;
  (attempt.objectives as Record<string, unknown>[])[0]!.target = 3;
  assert.throws(
    () => parseMissionPanelSnapshot(forged),
    /is not the HARD target 4|contradicts its satisfied flag/,
  );
});

test('126 an empty read claims nothing and does not throw', () => {
  const harness = createMissionPanelHarness({ read: () => null });
  harness.panel.open();
  const view = harness.panel.getView();
  assert.equal(view?.empty, true);
  assert.equal(view?.counts.missions, 0);
  assert.equal(harness.panel.getStats().missions, 0);
  assert.equal(harness.panel.selectMission('campaign-1-first-taxi'), false);
  assert.match(statusOf(harness.dialog()), /Nicio misiune/);
  const summary = byMissionClass(harness.dialog(), 'mission-panel__summary')[0];
  assert.equal(summary?.textContent, MISSION_PANEL_TEXT.empty);
});

test('126 dispose releases every listener and the owned DOM', () => {
  const harness = createMissionPanelHarness({ open: true });
  assert.equal(harness.panel.isOpen(), true);
  assert.equal(harness.panel.getStats().listeners, 3 + 8);
  assert.deepEqual(harness.surface, [true]);
  const dialog = harness.dialog(),
    trigger = harness.trigger();
  assert.equal(trigger.listenerCount, 1);
  assert.equal(dialog.listenerCount, 1);
  harness.dispose();
  const stats = harness.panel.getStats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.listeners, 0);
  assert.equal(stats.elements, 0);
  assert.equal(harness.host.children.length, 0);
  assert.deepEqual(harness.surface, [true, false]);
  assert.equal(trigger.listenerCount, 0);
  assert.equal(dialog.listenerCount, 0);
  assert.equal(harness.panel.getView(), null);
});
