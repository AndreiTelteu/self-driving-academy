import {
  MISSION_FAILURE_REASONS,
  createCampaignMissionCatalog,
  parseMissionCatalog,
  type MissionCatalog,
} from '../../src/missions';
import {
  MISSION_PANEL_LIMITS,
  MISSION_PANEL_TEXT,
  MISSION_PANEL_VERSION,
  type MissionPanelCounts,
  type MissionPanelMissionView,
  type MissionPanelView,
} from '../../src/ui';
import {
  byMissionClass,
  createMissionPanelHarness,
  type MissionPanelHarness,
} from './mission-panel-fixture';

export const MISSION_PANEL_REPORT_VERSION = '126-mission-panel-report-v1' as const;

export interface MissionPanelReportCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly actual: string;
  readonly expected: string;
  readonly note: string;
}

export interface MissionPanelReportStep {
  readonly step: string;
  readonly action: string;
  readonly missionId: string;
  readonly state: string;
  readonly attemptState: string;
  readonly progress: string;
  readonly attempts: string;
  readonly nextAttempt: string;
  readonly failure: string;
  readonly replayAvailable: boolean;
  readonly replay: string;
  readonly counts: MissionPanelCounts;
}

export interface MissionPanelReportWalk {
  readonly steps: readonly MissionPanelReportStep[];
  /** Counts of the full campaign: all eight missions completed. */
  readonly final: MissionPanelCounts;
  /** Counts of the mixed walk that ends with a real failed attempt on the last mission. */
  readonly failedFinal: MissionPanelCounts;
  readonly attempts: number;
  readonly resets: number;
  readonly instances: number;
  readonly rewards: number;
  readonly completeAttempts: number;
  readonly completeInstances: number;
  readonly completeRewards: number;
}

export interface MissionPanelReport {
  readonly version: typeof MISSION_PANEL_REPORT_VERSION;
  readonly generatedBy: 'npm run missions:panel';
  readonly contract: {
    readonly pbi: '126';
    readonly panel: typeof MISSION_PANEL_VERSION;
    readonly missions: number;
    readonly objectivesPerMission: number;
    readonly attemptsPerMission: number;
    readonly readsPerOpen: number;
    readonly globalListeners: number;
  };
  readonly walk: MissionPanelReportWalk;
  readonly closedReasons: {
    readonly reasons: readonly string[];
    readonly attempts: readonly number[];
    readonly failedTicks: readonly number[];
    readonly labels: readonly string[];
  };
  readonly versions: {
    readonly applied: string;
    readonly stale: string;
    readonly title: string;
    readonly label: string;
    readonly staleRefused: string;
  };
  readonly inspection: {
    readonly inspected: number;
    readonly readsBefore: number;
    readonly readsAfter: number;
    readonly progressEqual: boolean;
    readonly trackerEqual: boolean;
    readonly instances: number;
  };
  readonly ui: {
    readonly elements: number;
    readonly textNodes: number;
    readonly listeners: number;
    readonly globalListeners: number;
    readonly opens: number;
    readonly closes: number;
    readonly renders: number;
    readonly reads: number;
    readonly inspections: number;
    readonly escapes: number;
    readonly tabWraps: number;
    readonly focusMoves: number;
    readonly focusRestores: number;
    readonly surfaceCalls: number;
    readonly objectives: number;
    readonly failureNodes: number;
    readonly focusTrail: string;
    readonly ariaExpandedOpen: string | null;
    readonly ariaExpandedClosed: string | null;
    readonly triggerType: string | null;
  };
  readonly reads: {
    readonly closedRefresh: string;
    readonly openReads: number;
    readonly unchangedRefresh: string;
    readonly unchangedReads: number;
    readonly reopenedReads: number;
    readonly renders: number;
    readonly closedAgain: string;
  };
  readonly empty: { readonly empty: boolean; readonly missions: number; readonly status: string };
  readonly checks: readonly MissionPanelReportCheck[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
  readonly determinism: { readonly runs: number; readonly equal: boolean };
}

const WALK_MISSIONS = [
  'campaign-1-first-taxi',
  'campaign-2-first-demonstration',
  'campaign-3-following-distance',
  'campaign-4-stops-and-signals',
  'campaign-5-passenger',
  'campaign-6-city-copies-you',
  'campaign-7-changing-a-habit',
  'campaign-8-fleet-challenge',
] as const;

const FIRST_MISSION = WALK_MISSIONS[0];
const FAILED_MISSION = WALK_MISSIONS[2];
const LOCKED_MISSION = WALK_MISSIONS[3];

function check(
  name: string,
  pass: boolean,
  actual: string | number | boolean | null,
  expected: string | number | boolean | null,
  note: string,
): MissionPanelReportCheck {
  return Object.freeze({
    name,
    pass,
    actual: actual === null ? 'null' : String(actual),
    expected: expected === null ? 'null' : String(expected),
    note,
  });
}

function same(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function missionOf(view: MissionPanelView | null, missionId: string): MissionPanelMissionView {
  const mission = view?.missions.find((entry) => entry.missionId === missionId);
  if (mission === undefined) throw new Error(`The 126 report lost mission ${missionId}`);
  return mission;
}

/** One read of the real contracts with the panel open; a closed panel never reaches here. */
function readStep(
  harness: MissionPanelHarness,
  step: string,
  action: string,
  missionId: string,
): MissionPanelReportStep {
  if (harness.panel.isOpen()) harness.panel.refresh();
  else harness.panel.open();
  const view = harness.panel.getView();
  if (view === null) throw new Error('The 126 report opened the panel without a view');
  const mission = missionOf(view, missionId);
  return Object.freeze({
    step,
    action,
    missionId,
    state: mission.state,
    attemptState: mission.attemptState ?? 'NONE',
    progress: mission.progressLabel,
    attempts: mission.attemptsLabel,
    nextAttempt: mission.nextAttemptLabel,
    failure: mission.failureLabel ?? 'NONE',
    replayAvailable: mission.replayAvailable,
    replay: mission.replayLabel,
    counts: view.counts,
  });
}

/**
 * The deterministic campaign walk required by the PBI: every state is reached through the real 116
 * tracker and the real 125 ledger, and every displayed value is read back from the panel.
 *
 * The 125 ledger only settles sequential completions of one mission, so a mission that really failed
 * cannot also be settled as a later completion. The walk therefore reaches `FAILED` on the last
 * mission of a mixed campaign (seven completed, one failed) and reaches `CAMPAIGN_COMPLETE` on a
 * second, clean campaign where all eight missions complete on their first attempt.
 */
function walkCampaign(): MissionPanelReportWalk {
  const mixed = createMissionPanelHarness();
  const steps: MissionPanelReportStep[] = [];
  steps.push(readStep(mixed, 'AVAILABLE', 'catalog proaspăt, nicio încercare', FIRST_MISSION));
  steps.push(readStep(mixed, 'LOCKED', 'prerechizitele nu sunt finalizate', LOCKED_MISSION));

  mixed.start(FIRST_MISSION);
  steps.push(readStep(mixed, 'ACTIVE', 'încercarea 1 a primei misiuni a pornit', FIRST_MISSION));

  mixed.complete(FIRST_MISSION);
  steps.push(readStep(mixed, 'COMPLETED', 'cursa MANUAL a încheiat misiunea 1', FIRST_MISSION));

  for (const missionId of WALK_MISSIONS.slice(1, 7)) mixed.complete(missionId);
  mixed.failWithBudget(WALK_MISSIONS[7]);
  steps.push(readStep(mixed, 'FAILED', 'bugetul de incidente a fost depășit', WALK_MISSIONS[7]));

  const mixedView = mixed.panel.getView();
  if (mixedView === null) throw new Error('The 126 report closed the panel before the failure');
  mixed.panel.close();
  const mixedProgress = mixed.progress(),
    mixedTracker = mixed.tracker.stats();

  const full = createMissionPanelHarness();
  for (const missionId of WALK_MISSIONS) full.complete(missionId);
  steps.push(
    readStep(full, 'CAMPAIGN_COMPLETE', 'toate cele 8 misiuni au fost încheiate', WALK_MISSIONS[7]),
  );
  const fullView = full.panel.getView();
  if (fullView === null) throw new Error('The 126 report closed the panel before the finale');
  full.panel.close();
  const fullProgress = full.progress(),
    fullTracker = full.tracker.stats();

  return Object.freeze({
    steps: Object.freeze(steps),
    final: fullView.counts,
    failedFinal: mixedView.counts,
    attempts: mixedTracker.attempts,
    resets:
      mixedProgress.missions.reduce((total, mission) => total + mission.resets, 0) +
      fullProgress.missions.reduce((total, mission) => total + mission.resets, 0),
    instances: mixedTracker.instances,
    rewards: mixed.ledger.stats().rewards,
    completeAttempts: fullTracker.attempts,
    completeInstances: fullTracker.instances,
    completeRewards: full.ledger.stats().rewards,
  });
}

/** All four closed 116 failure reasons, each from a real terminal instance. */
function closedReasons(): MissionPanelReport['closedReasons'] {
  const harness = createMissionPanelHarness();
  harness.complete(FIRST_MISSION);
  harness.complete(WALK_MISSIONS[1]);
  harness.failWithBudget(FAILED_MISSION);
  const reasons: string[] = [],
    attempts: number[] = [],
    failedTicks: number[] = [],
    labels: string[] = [];
  const capture = (): void => {
    if (harness.panel.isOpen()) harness.panel.refresh();
    else harness.panel.open();
    const mission = missionOf(harness.panel.getView(), FAILED_MISSION);
    const latest = harness.tracker
      .instances()
      .filter((entry) => entry.missionId === FAILED_MISSION)
      .at(-1);
    if (latest === undefined) throw new Error('The 126 report lost the failed instance');
    reasons.push(mission.failureReason ?? 'NONE');
    attempts.push(latest.attempt);
    failedTicks.push(latest.failedTick ?? -1);
    labels.push(mission.failureLabel ?? 'NONE');
  };
  capture();
  harness.failWithWindow(FAILED_MISSION);
  capture();
  harness.failExplicit(FAILED_MISSION, 'SCENARIO_RESET');
  capture();
  harness.failExplicit(FAILED_MISSION, 'PLAYER_ABANDONED');
  capture();
  harness.panel.close();
  return Object.freeze({
    reasons: Object.freeze(reasons),
    attempts: Object.freeze(attempts),
    failedTicks: Object.freeze(failedTicks),
    labels: Object.freeze(labels),
  });
}

/** Two definition versions: the applied one must win over the stale catalog. */
function catalogs(): { applied: MissionCatalog; stale: MissionCatalog } {
  const base = createCampaignMissionCatalog();
  const missions = base.missions.map((mission) =>
    mission.missionId === FIRST_MISSION
      ? {
          ...mission,
          version: '2',
          title: 'Primul taxi (versiunea 2)',
          objectives: mission.objectives.map((objective) => ({
            ...objective,
            label: 'Finalizează o cursă cu intervenție MANUAL (versiunea 2)',
          })),
        }
      : mission,
  );
  return {
    applied: parseMissionCatalog({ ...base, missions }),
    stale: parseMissionCatalog({ ...base, missions: base.missions }),
  };
}

function versionEvidence(): MissionPanelReport['versions'] {
  const { applied, stale } = catalogs();
  const harness = createMissionPanelHarness({ catalog: applied });
  harness.complete(FIRST_MISSION);
  harness.panel.open();
  const mission = missionOf(harness.panel.getView(), FIRST_MISSION);
  let staleRefused = 'accepted';
  try {
    harness.compose(stale);
  } catch (error) {
    staleRefused = (error as Error).message;
  }
  harness.panel.close();
  return Object.freeze({
    applied: mission.versionLabel,
    stale: `Versiunea ${stale.missions[0]?.version ?? '?'}`,
    title: mission.title,
    label: mission.objectives[0]?.label ?? '',
    staleRefused,
  });
}

/** Inspecting locked missions must not touch progress, attempts, resets or reads. */
function inspectionEvidence(): MissionPanelReport['inspection'] {
  const harness = createMissionPanelHarness();
  const progressBefore = JSON.stringify(harness.progress()),
    trackerBefore = harness.trackerFacts();
  harness.panel.open();
  const readsBefore = harness.reads;
  for (const missionId of [LOCKED_MISSION, WALK_MISSIONS[7], WALK_MISSIONS[5]])
    harness.panel.selectMission(missionId);
  const progressAfter = JSON.stringify(harness.progress()),
    trackerAfter = harness.trackerFacts(),
    inspected = harness.panel.getStats().inspections,
    instances = harness.tracker.instances().length;
  harness.closeByEscape();
  harness.panel.open();
  const readsAfter = harness.reads;
  harness.panel.close();
  return Object.freeze({
    inspected,
    readsBefore,
    readsAfter,
    progressEqual: progressBefore === progressAfter,
    trackerEqual: trackerBefore === trackerAfter,
    instances,
  });
}

interface UiEvidence {
  readonly report: MissionPanelReport['ui'];
  readonly view: MissionPanelView;
}

function uiEvidence(): UiEvidence {
  const harness = createMissionPanelHarness();
  const trigger = harness.trigger(),
    dialog = harness.dialog(),
    closeButton = byMissionClass(dialog, 'mission-panel__close')[0],
    body = byMissionClass(dialog, 'mission-panel__body')[0];
  trigger.focus();
  trigger.send('click');
  const openView = harness.panel.getView();
  if (openView === null) throw new Error('The 126 report opened the panel without a view');
  const selected = harness.missionButton(FIRST_MISSION),
    second = harness.missionButton(WALK_MISSIONS[1]),
    focusedOnOpen = harness.document.activeElement === selected;
  dialog.send('keydown', { key: 'Tab' });
  const tabForward = harness.document.activeElement === second;
  dialog.send('keydown', { key: 'Tab', shiftKey: true });
  const tabBack = harness.document.activeElement === selected;
  dialog.send('keydown', { key: 'Tab', shiftKey: true });
  const atClose = harness.document.activeElement === closeButton;
  dialog.send('keydown', { key: 'Tab', shiftKey: true });
  const tabWrapped = harness.document.activeElement === body;
  dialog.send('keydown', { key: 'Tab' });
  const tabWrappedBack = harness.document.activeElement === closeButton;
  const expandedOpen = trigger.getAttribute('aria-expanded');
  harness.closeByEscape();
  const stats = harness.panel.getStats(),
    restored = harness.document.activeElement === trigger,
    failures = byMissionClass(dialog, 'mission-panel__failure');
  return Object.freeze({
    report: Object.freeze({
      elements: stats.elements,
      textNodes: stats.textNodes,
      listeners: stats.listeners,
      globalListeners: stats.globalListeners,
      opens: stats.opens,
      closes: stats.closes,
      renders: stats.renders,
      reads: stats.reads,
      inspections: stats.inspections,
      escapes: stats.escapes,
      tabWraps: stats.tabWraps,
      focusMoves: stats.focusMoves,
      focusRestores: stats.focusRestores,
      surfaceCalls: stats.surfaceCalls,
      objectives: stats.objectives,
      failureNodes: failures.length,
      focusTrail: [
        focusedOnOpen,
        tabForward,
        tabBack,
        atClose,
        tabWrapped,
        tabWrappedBack,
        restored,
      ].join('/'),
      ariaExpandedOpen: expandedOpen,
      ariaExpandedClosed: trigger.getAttribute('aria-expanded'),
      triggerType: trigger.getAttribute('type'),
    }),
    view: openView,
  });
}

function readsEvidence(): MissionPanelReport['reads'] {
  const harness = createMissionPanelHarness();
  const closedRefresh = harness.panel.refresh(),
    readsAtStart = harness.reads;
  harness.panel.open();
  const openReads = harness.reads;
  const unchangedRefresh = harness.panel.refresh(),
    unchangedReads = harness.reads;
  harness.panel.close();
  const closedAgain = harness.panel.refresh();
  harness.panel.open();
  const reopenedReads = harness.reads;
  const renders = harness.panel.getStats().renders;
  harness.panel.close();
  return Object.freeze({
    closedRefresh,
    openReads: openReads - readsAtStart,
    unchangedRefresh,
    unchangedReads: unchangedReads - openReads,
    reopenedReads: reopenedReads - unchangedReads,
    renders,
    closedAgain,
  });
}

function emptyEvidence(): MissionPanelReport['empty'] {
  const harness = createMissionPanelHarness({ read: () => null });
  harness.panel.open();
  const view = harness.panel.getView(),
    status = byMissionClass(harness.dialog(), 'mission-panel__status')[0]?.textContent ?? '';
  harness.panel.close();
  return Object.freeze({
    empty: view?.empty === true,
    missions: view?.counts.missions ?? -1,
    status,
  });
}

/** The deterministic 126 evidence driver: real 116 tracker, real 125 ledger, deterministic DOM. */
export function runMissionPanelReport(): MissionPanelReport {
  const walk = walkCampaign(),
    reasons = closedReasons(),
    versions = versionEvidence(),
    inspection = inspectionEvidence(),
    ui = uiEvidence(),
    reads = readsEvidence(),
    empty = emptyEvidence(),
    view = ui.view,
    fresh = walk.steps.find((step) => step.step === 'AVAILABLE'),
    lockedStep = walk.steps.find((step) => step.step === 'LOCKED'),
    active = walk.steps.find((step) => step.step === 'ACTIVE'),
    completed = walk.steps.find((step) => step.step === 'COMPLETED'),
    failed = walk.steps.find((step) => step.step === 'FAILED'),
    final = walk.steps.find((step) => step.step === 'CAMPAIGN_COMPLETE'),
    firstMission = missionOf(view, FIRST_MISSION),
    lastMission = missionOf(view, WALK_MISSIONS[7]);

  const checks: MissionPanelReportCheck[] = [
    check(
      'eight-mission-campaign',
      fresh?.counts.missions === 8 && fresh.counts.available === 1 && fresh.counts.locked === 7,
      `${fresh?.counts.missions}/${fresh?.counts.available}/${fresh?.counts.locked}`,
      '8/1/7',
      'Catalogul 116 are 8 misiuni: una disponibilă și șapte blocate în lanțul de prerechizite.',
    ),
    check(
      'available-state',
      fresh?.state === 'AVAILABLE' &&
        fresh.replayAvailable &&
        fresh.progress === MISSION_PANEL_TEXT.noAttempt &&
        fresh.attemptState === 'NONE',
      `${fresh?.state}/${fresh?.attemptState}/${fresh?.progress}`,
      `AVAILABLE/NONE/${MISSION_PANEL_TEXT.noAttempt}`,
      'Misiunea disponibilă arată zero încercări și obiective neevaluate, fără verdict inventat.',
    ),
    check(
      'active-state',
      active?.attemptState === 'ACTIVE' &&
        active.counts.active === 1 &&
        active.progress === '0 din 1 obiective îndeplinite',
      `${active?.attemptState}/${active?.counts.active}/${active?.progress}`,
      'ACTIVE/1/0 din 1 obiective îndeplinite',
      'Încercarea pornită în 116 apare ca „În desfășurare”, cu progresul real al evaluării.',
    ),
    check(
      'completed-state',
      completed?.state === 'COMPLETED' &&
        completed.attemptState === 'COMPLETED' &&
        completed.counts.satisfiedObjectives === 1 &&
        completed.counts.evaluatedObjectives === 1 &&
        completed.progress === '1 din 1 obiective îndeplinite',
      `${completed?.state}/${completed?.attemptState}/${completed?.counts.satisfiedObjectives}/${completed?.counts.evaluatedObjectives}`,
      'COMPLETED/COMPLETED/1/1',
      'Finalizarea vine din instanța 116 terminală: obiectivul evaluat este îndeplinit, nu inventat.',
    ),
    check(
      'attempts-and-next-attempt',
      completed?.attempts ===
        `1 din ${MISSION_PANEL_LIMITS.attemptsPerMission} încercări încheiate` &&
        completed.nextAttempt === 'Următoarea încercare: 2',
      `${completed?.attempts} · ${completed?.nextAttempt}`,
      `1 din ${MISSION_PANEL_LIMITS.attemptsPerMission} încercări încheiate · Următoarea încercare: 2`,
      'Numărul de încercări și următoarea încercare sunt copiate din progresul 125.',
    ),
    check(
      'failed-with-reason',
      failed?.attemptState === 'FAILED' &&
        failed.failure === 'Bugetul de incidente a fost depășit (INCIDENT_BUDGET_EXCEEDED)' &&
        failed.replayAvailable,
      `${failed?.attemptState}/${failed?.failure}/${failed?.replayAvailable}`,
      'FAILED/Bugetul de incidente a fost depășit (INCIDENT_BUDGET_EXCEEDED)/true',
      'Eșecul afișează motivul închis al instanței 116 și păstrează reluarea disponibilă.',
    ),
    check(
      'closed-failure-vocabulary',
      same(reasons.reasons, [
        'INCIDENT_BUDGET_EXCEEDED',
        'EVALUATION_WINDOW_EXPIRED',
        'SCENARIO_RESET',
        'PLAYER_ABANDONED',
      ]) &&
        same([...MISSION_FAILURE_REASONS].sort(), [...reasons.reasons].sort()) &&
        reasons.attempts.join(',') === '1,2,3,4',
      reasons.reasons.join(','),
      'INCIDENT_BUDGET_EXCEEDED,EVALUATION_WINDOW_EXPIRED,SCENARIO_RESET,PLAYER_ABANDONED',
      'Toate cele patru motive închise vin din instanțe reale, fiecare cu încercarea lui.',
    ),
    check(
      'failure-ticks-increase',
      reasons.failedTicks.every(
        (tick, index) => index === 0 || tick > (reasons.failedTicks[index - 1] ?? -1),
      ),
      reasons.failedTicks.join(','),
      'strict crescător',
      'Fiecare eșec păstrează tick-ul real, deci motivele nu sunt rescrise de panou.',
    ),
    check(
      'locked-state',
      lockedStep?.state === 'LOCKED' &&
        lockedStep.attemptState === 'NONE' &&
        lockedStep.attempts.startsWith('0 din') &&
        lockedStep.replayAvailable === false,
      `${lockedStep?.state}/${lockedStep?.attemptState}/${lockedStep?.replayAvailable}`,
      'LOCKED/NONE/false',
      'Obiectivul blocat arată prerechizitele lipsă și nu promite reluare.',
    ),
    check(
      'locked-inspection-preserves-progress',
      inspection.inspected === 3 &&
        inspection.progressEqual &&
        inspection.trackerEqual &&
        inspection.instances === 0 &&
        inspection.readsAfter === inspection.readsBefore + 1,
      `${inspection.inspected}/${inspection.progressEqual}/${inspection.trackerEqual}/${inspection.instances}/${inspection.readsAfter - inspection.readsBefore}`,
      '3/true/true/0/1',
      'Inspectarea nu consumă încercări, nu resetează și nu citește contractele din nou.',
    ),
    check(
      'text-follows-applied-version',
      versions.applied === 'Versiunea 2' &&
        versions.title.includes('versiunea 2') &&
        versions.label.includes('versiunea 2') &&
        versions.staleRefused.includes('not the applied version'),
      `${versions.applied}/${versions.stale}/${versions.staleRefused}`,
      'Versiunea 2/Versiunea 1/catalogul vechi este refuzat',
      'Textul vine din versiunea aplicată a definiției; catalogul vechi este refuzat, nu afișat.',
    ),
    check(
      'evaluated-objectives-match',
      final?.counts.evaluatedObjectives === 8 &&
        final.counts.satisfiedObjectives === 8 &&
        firstMission.objectives.length === 1,
      `${final?.counts.satisfiedObjectives}/${final?.counts.evaluatedObjectives}`,
      '8/8',
      'Fiecare obiectiv afișat provine din evaluarea reală: 8 evaluate, 8 îndeplinite.',
    ),
    check(
      'replay-offered-after-failure',
      failed?.replayAvailable === true &&
        failed.attempts ===
          `0 din ${MISSION_PANEL_LIMITS.attemptsPerMission} încercări încheiate` &&
        failed.nextAttempt === 'Următoarea încercare: 1' &&
        failed.replay.includes('Reluare disponibilă') &&
        failed.replay.includes('păstrează profilurile învățate'),
      `${failed?.attempts} · ${failed?.nextAttempt} · ${failed?.replay}`,
      `0 din ${MISSION_PANEL_LIMITS.attemptsPerMission} încercări încheiate · Următoarea încercare: 1 · reluare disponibilă`,
      'După eșec, panoul copiază exact 125 (slotul de finalizare nu e consumat) și oferă reluarea 116, fără să o pornească.',
    ),
    check(
      'campaign-reaches-eight-completions',
      final?.counts.completed === 8 &&
        final.counts.available === 0 &&
        final.counts.locked === 0 &&
        walk.completeAttempts === 8 &&
        walk.completeInstances === 8 &&
        walk.resets === 0,
      `${final?.counts.completed}/${walk.completeAttempts}/${walk.completeInstances}/${walk.resets}`,
      '8/8/8/0',
      'Campania completă: 8 finalizări, 8 încercări, 8 instanțe 116, zero reseturi.',
    ),
    check(
      'mixed-campaign-keeps-failure',
      walk.failedFinal.completed === 7 &&
        walk.failedFinal.available === 1 &&
        walk.failedFinal.locked === 0 &&
        walk.failedFinal.failed === 1 &&
        walk.attempts === 8,
      `${walk.failedFinal.completed}/${walk.failedFinal.available}/${walk.failedFinal.failed}/${walk.attempts}`,
      '7/1/1/8',
      'Campania mixtă: 7 încheiate, ultima disponibilă cu o încercare reală eșuată.',
    ),
    check(
      'full-campaign-rewards',
      walk.final.rewardsGranted === walk.completeRewards && walk.completeRewards > 0,
      `${walk.final.rewardsGranted}/${walk.completeRewards}`,
      'egale și pozitive',
      'Recompensele afișate sunt exact cele acordate de ledgerul 125.',
    ),
    check(
      'native-trigger-and-dialog',
      ui.report.triggerType === 'button' &&
        ui.report.ariaExpandedOpen === 'true' &&
        ui.report.ariaExpandedClosed === 'false',
      `${ui.report.triggerType}/${ui.report.ariaExpandedOpen}/${ui.report.ariaExpandedClosed}`,
      'button/true/false',
      'Butonul este nativ, cu `aria-expanded` sincronizat la deschidere și închidere.',
    ),
    check(
      'focus-escape-and-tab-trap',
      ui.report.focusTrail === 'true/true/true/true/true/true/true' &&
        ui.report.escapes === 1 &&
        ui.report.focusRestores === 1 &&
        ui.report.tabWraps === 2,
      `${ui.report.focusTrail} · escapes ${ui.report.escapes} · restores ${ui.report.focusRestores} · wraps ${ui.report.tabWraps}`,
      'true/true/true/true/true/true/true · escapes 1 · restores 1 · wraps 2',
      'Focusul intră în panou, Tab/Shift+Tab rămân înăuntru, Escape închide și readuce focusul.',
    ),
    check(
      'no-global-listeners',
      ui.report.globalListeners === 0 && ui.report.listeners === 3 + 8,
      `${ui.report.globalListeners}/${ui.report.listeners}`,
      '0/11',
      'Toate listeners sunt pe buton, pe Închide, pe dialog și pe cele 8 butoane de misiune.',
    ),
    check(
      'reads-once-per-open',
      reads.closedRefresh === 'SKIPPED_CLOSED' &&
        reads.openReads === 1 &&
        reads.unchangedRefresh === 'SKIPPED_UNCHANGED' &&
        reads.unchangedReads === 1 &&
        reads.closedAgain === 'SKIPPED_CLOSED' &&
        reads.reopenedReads === 1 &&
        reads.renders === 2,
      `${reads.closedRefresh}/${reads.openReads}/${reads.unchangedRefresh}/${reads.closedAgain}/${reads.reopenedReads}/${reads.renders}`,
      'SKIPPED_CLOSED/1/SKIPPED_UNCHANGED/SKIPPED_CLOSED/1/2',
      'O citire per deschidere; panoul închis nu citește, iar o re-citire neschimbată nu randează.',
    ),
    check(
      'empty-source-explicit',
      empty.empty && empty.missions === 0 && empty.status.includes(MISSION_PANEL_TEXT.empty),
      `${empty.empty}/${empty.missions}/${empty.status.includes(MISSION_PANEL_TEXT.empty)}`,
      'true/0/true',
      'Fără campanie citită, panoul spune explicit că nu există misiuni.',
    ),
    check(
      'fresh-catalog-shows-no-verdict',
      view.counts.missions === 8 &&
        ui.report.objectives === 0 &&
        ui.report.failureNodes === 8 &&
        lastMission.objectives.every((objective) => objective.stateLabel === 'Neevaluat'),
      `${view.counts.missions}/${ui.report.objectives}/${ui.report.failureNodes}/${lastMission.objectives[0]?.stateLabel}`,
      '8/0/8/Neevaluat',
      'Un catalog proaspăt are 8 rânduri „Motiv: Niciuna”, zero obiective evaluate și niciun verdict.',
    ),
  ];

  const rerun = walkCampaign(),
    deterministic =
      same(walk.steps, rerun.steps) &&
      same(walk.final, rerun.final) &&
      walk.attempts === rerun.attempts &&
      walk.rewards === rerun.rewards;
  checks.push(
    check(
      'deterministic-transcript',
      deterministic,
      deterministic ? 'equal' : 'different',
      'equal',
      'Două parcurgeri identice produc același traseu de stări și aceleași numere.',
    ),
  );

  const passed = checks.filter((entry) => entry.pass).length;

  return Object.freeze({
    version: MISSION_PANEL_REPORT_VERSION,
    generatedBy: 'npm run missions:panel' as const,
    contract: Object.freeze({
      pbi: '126' as const,
      panel: MISSION_PANEL_VERSION,
      missions: MISSION_PANEL_LIMITS.missions,
      objectivesPerMission: MISSION_PANEL_LIMITS.objectivesPerMission,
      attemptsPerMission: MISSION_PANEL_LIMITS.attemptsPerMission,
      readsPerOpen: MISSION_PANEL_LIMITS.readsPerOpen,
      globalListeners: MISSION_PANEL_LIMITS.globalListeners,
    }),
    walk,
    closedReasons: reasons,
    versions,
    inspection,
    ui: ui.report,
    reads,
    empty,
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
    determinism: Object.freeze({ runs: 2, equal: deterministic }),
  });
}

export function missionPanelReportMarkdown(report: MissionPanelReport): string {
  const rows = report.checks
    .map(
      (entry) =>
        `| ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.name} | ${entry.actual} | ${entry.expected} | ${entry.note} |`,
    )
    .join('\n');
  const steps = report.walk.steps
    .map(
      (step) =>
        `| ${step.step} | ${step.action} | ${step.missionId} | ${step.state} | ${step.attemptState} | ${step.progress} | ${step.attempts} | ${step.failure} | ${step.replayAvailable} |`,
    )
    .join('\n');
  return [
    '# PBI 126 — panoul misiunilor și obiective live',
    '',
    `Generat de \`${report.generatedBy}\`; contract panou \`${report.contract.panel}\`.`,
    `Plafoane 116/125: ${report.contract.missions} misiuni, ${report.contract.objectivesPerMission} obiective, ${report.contract.attemptsPerMission} încercări; ${report.contract.readsPerOpen} citire per deschidere, ${report.contract.globalListeners} listeners globali.`,
    '',
    '## Parcurgerea campaniei',
    '',
    '| Stare | Acțiune | Misiune | Stare campanie | Stare încercare | Progres | Încercări | Motiv | Reluare |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    steps,
    '',
    `- campania mixtă: ${report.walk.attempts} încercări, ${report.walk.instances} instanțe 116, ${report.walk.rewards} recompense; final ${report.walk.failedFinal.completed} încheiate, ${report.walk.failedFinal.available} disponibilă, ${report.walk.failedFinal.failed} eșuată`,
    `- campania completă: ${report.walk.completeAttempts} încercări, ${report.walk.completeInstances} instanțe 116, ${report.walk.completeRewards} recompense; reseturi: ${report.walk.resets}`,
    `- final: ${report.walk.final.completed} finalizate, ${report.walk.final.available} disponibile, ${report.walk.final.locked} blocate; obiective evaluate ${report.walk.final.satisfiedObjectives}/${report.walk.final.evaluatedObjectives}`,
    '',
    '## Motive de eșec închise',
    '',
    `- motive: ${report.closedReasons.reasons.join(', ')}`,
    `- încercări: ${report.closedReasons.attempts.join(', ')}`,
    `- tick-uri de eșec: ${report.closedReasons.failedTicks.join(', ')}`,
    `- etichete: ${report.closedReasons.labels.join(' | ')}`,
    '',
    '## Versiunea aplicată',
    '',
    `- aplicată: ${report.versions.applied} — „${report.versions.title}”`,
    `- obiectiv: „${report.versions.label}”`,
    `- catalog vechi refuzat: ${report.versions.staleRefused}`,
    '',
    '## Inspectarea unei misiuni blocate',
    '',
    `- misiuni inspectate: ${report.inspection.inspected}; citiri la deschidere/redeschidere: ${report.inspection.readsBefore}/${report.inspection.readsAfter}`,
    `- progres neschimbat: ${report.inspection.progressEqual}; tracker neschimbat: ${report.inspection.trackerEqual}; instanțe create: ${report.inspection.instances}`,
    '',
    '## Panoul',
    '',
    `- elemente/noduri text: ${report.ui.elements}/${report.ui.textNodes}`,
    `- listeners: ${report.ui.listeners} (globali: ${report.ui.globalListeners})`,
    `- deschideri/închideri/randări/citiri: ${report.ui.opens}/${report.ui.closes}/${report.ui.renders}/${report.ui.reads}`,
    `- inspectări: ${report.ui.inspections}; Escape: ${report.ui.escapes}; Tab wrap: ${report.ui.tabWraps}`,
    `- focus mutat/restaurat: ${report.ui.focusMoves}/${report.ui.focusRestores}; apeluri de suprafață: ${report.ui.surfaceCalls}`,
    `- traseu de focus (deschidere/Tab/Shift+Tab/wrap/wrap/restaurare): ${report.ui.focusTrail}`,
    `- obiective randate: ${report.ui.objectives}; noduri de motiv: ${report.ui.failureNodes}`,
    '',
    '## Citiri',
    '',
    `- refresh închis: ${report.reads.closedRefresh}; citiri la deschidere: ${report.reads.openReads}`,
    `- refresh neschimbat: ${report.reads.unchangedRefresh} (${report.reads.unchangedReads} citire); redeschidere: ${report.reads.reopenedReads}`,
    `- randări totale: ${report.reads.renders}; după închidere: ${report.reads.closedAgain}`,
    '',
    '## Verificări',
    '',
    '| Rezultat | Verificare | Real | Așteptat | Notă |',
    '| --- | --- | --- | --- | --- |',
    rows,
    '',
    `Rezumat: ${report.summary.passed}/${report.summary.checks} verificări, overall ${report.summary.pass ? 'PASS' : 'FAIL'}.`,
    `Determinism: ${report.determinism.runs} rulări, equal=${report.determinism.equal}.`,
    '',
    '## Limitări',
    '',
    '- Nivel `targeted`: dovezile sunt deterministe (DOM propriu, fără browser real, fără ceas de perete); nu există captură Playwright sau măsurătoare FPS/GPU.',
    '- Panoul nu pornește reluarea: afișează opțiunea, iar hostul o execută prin contractul 116.',
    '- Stilurile sunt inline, ca să nu modifice foaia globală în afara ownership-ului PBI 126.',
    '- Butonul „Misiuni” nu este montat încă în HUD-ul din `src/app`: fișierul nu a fost atins, pentru că montarea cere un host cu citirea 125, care rămâne a integrării.',
  ].join('\n');
}
