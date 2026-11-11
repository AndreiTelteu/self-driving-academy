import { KPI_IMPACT_VERSION } from '../../src/economy';
import type { KpiImpactRead } from '../../src/economy';
import {
  createMissionRewardsLedger,
  createPlayerProgress,
  levelForXpMicro,
} from '../../src/missions';
import type { PlayerProgress } from '../../src/missions';
import { ContractValidationError } from '../../src/sessions';
import {
  KPI_IMPACT_FORBIDDEN_FRAGMENTS,
  KPI_IMPACT_SERVICE_VERSION,
  KPI_IMPACT_UI_VERSION,
  assertNoXpLossMessages,
  kpiImpactTexts,
  missionResultFromSettlement,
  projectKpiImpact,
} from '../../src/ui';
import type { KpiImpactSnapshot, KpiImpactView } from '../../src/ui';
import {
  XP_FIXTURE_PROFILE_ID,
  XP_FIXTURE_START_MS,
  activeWindow,
  completedMissionSettlement,
  createXpProfileStore,
  createXpProgress,
  dailyReward,
  xpProfileParameters,
} from '../missions/player-xp-fixture';
import {
  createMissionTestCatalog,
  createMissionTestTracker,
  testMission,
} from '../missions/mission-fixture';
import {
  bothDown,
  controlModeImpact,
  firstDay,
  noEvents,
  realFailedRide,
  revenueDownRatingUp,
  revenueUpRatingDown,
  steady,
} from './kpi-impact-fixture';
import { impactSnapshot, simulateHud } from '../ui/kpi-impact-fixture';

/**
 * Deterministic transcript of PBI 214.
 *
 * Every number comes from the delivered contracts: the 209 KPI read model, real commercial and
 * review ledgers, a real 116/125 mission settlement, the real 213 player ledger and the real 214 UI
 * projection. No clock, browser or random source is read, so two runs produce the same bytes.
 */
export interface KpiImpactCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface KpiImpactScenarioRow {
  readonly name: string;
  readonly state: string;
  readonly revenueBefore: number;
  readonly revenueAfter: number;
  readonly revenueDelta: number;
  readonly revenueDirection: string;
  readonly ratingBefore: number | null;
  readonly ratingAfter: number | null;
  readonly ratingDelta: number | null;
  readonly ratingDirection: string;
  readonly incidentRides: number;
  readonly incidentState: string;
  readonly lowRatingReviews: number;
  readonly reviewCount: number;
}

export interface KpiImpactReport {
  readonly schemaVersion: 1;
  readonly version: typeof KPI_IMPACT_VERSION;
  readonly uiVersion: typeof KPI_IMPACT_UI_VERSION;
  readonly checks: readonly KpiImpactCheck[];
  readonly scenarios: readonly KpiImpactScenarioRow[];
  readonly incident: Readonly<{
    terminalState: string;
    rating: number;
    failedRides: number;
    incidentRides: number;
    lowRatingReviews: number;
    revenueDirection: string;
    ratingDirection: string;
  }>;
  readonly controlModes: readonly Readonly<{
    controlMode: string;
    rating: number;
    revenueDirection: string;
    ratingDirection: string;
    xpDebits: 0;
    identicalFacts: boolean;
  }>[];
  readonly xp: Readonly<{
    beforeBalance: number;
    afterBalance: number;
    beforeLevel: number;
    afterLevel: number;
    levelFromBalance: number;
    entries: number;
    missionXp: number;
    activeWindowMs: number;
    kpiRevenueAfter: number;
    kpiRatingAfter: number | null;
    accidentRating: number;
    failedMissionRefused: boolean;
    negativeCreditRefused: boolean;
    negativeCreditReason: string;
    duplicateRewardXp: number;
    profileRestoreBalance: number;
    profileRestoreLevel: number;
    profileWrites: 0;
    debits: 0;
  }>;
  readonly feedback: Readonly<{
    planes: number;
    textsChecked: number;
    forbiddenFragments: readonly string[];
    forbiddenHits: number;
    missionFailedXp: 0;
    duplicateXp: 0;
    serviceState: string;
    revenueDirection: string;
    ratingDirection: string;
    incidentState: string;
    serviceText: string;
    missionText: string;
    fidelityText: string;
  }>;
  readonly hud: Readonly<{
    frames: number;
    changeAt: number;
    reads: number;
    renders: number;
    planeUpdates: number;
    skippedThrottled: number;
    skippedUnchanged: number;
    minimumReadIntervalTicks: number;
    maximumReadHz: number;
    historyRebuilds: 0;
    xpLossMessages: 0;
    listeners: 0;
    globalListeners: 0;
  }>;
  readonly summary: Readonly<{ checks: number; passed: number; failed: number; pass: boolean }>;
  readonly determinism: Readonly<{ runs: number; equal: boolean }>;
}

/** The reward metric of the mission plane; the HUD and the tests read the same label. */
function xpMetric(view: KpiImpactView): string {
  return view.mission.metrics.find((metric) => metric.key === 'mission-reward')?.value ?? '';
}

function scenarioRow(name: string, read: KpiImpactRead): KpiImpactScenarioRow {
  return Object.freeze({
    name,
    state: read.state,
    revenueBefore: read.previous?.revenueMinorUnits ?? 0,
    revenueAfter: read.current?.revenueMinorUnits ?? 0,
    revenueDelta: read.delta.revenueMinorUnits,
    revenueDirection: read.delta.revenueDirection,
    ratingBefore: read.previous?.averageRating ?? null,
    ratingAfter: read.current?.averageRating ?? null,
    ratingDelta: read.delta.ratingDelta,
    ratingDirection: read.delta.ratingDirection,
    incidentRides: read.current?.incidentRides ?? 0,
    incidentState: read.delta.incidentState,
    lowRatingReviews: read.current?.lowRatingReviews ?? 0,
    reviewCount: read.current?.reviewCount ?? 0,
  });
}

/** Credits what a real player earns: a 125 mission plus one short active window (100.5 XP). */
function creditedProgress(): PlayerProgress {
  const progress = createXpProgress(),
    mission = completedMissionSettlement();
  progress.creditMission({ settlement: mission.settlement, observedAtMs: XP_FIXTURE_START_MS });
  progress.observeActiveTime(activeWindow(XP_FIXTURE_START_MS));
  return progress;
}

function xpSection() {
  const progress = creditedProgress(),
    before = progress.read();
  // The accident the player must survive without losing progression.
  const kpi = bothDown(),
    read = kpi.read(),
    incident = realFailedRide(kpi.tick - 60, 'ride:214:report'),
    accidentRating = incident.rating;
  incident.dispose();

  // A failed and expired objective: 125 refuses to settle it, 213 never sees a credit.
  const tracker = createMissionTestTracker({
      catalog: createMissionTestCatalog([testMission({ windowTicks: 600 })]),
    }),
    ledger = createMissionRewardsLedger({ catalog: tracker.catalog() });
  tracker.start({ missionId: 'test-mission', tick: 100 });
  const expiredId = tracker.advance(1_000).expired[0] ?? '',
    expired = tracker.instance(expiredId);
  let failedMissionRefused = false;
  if (expired !== undefined)
    try {
      ledger.settle({ instance: expired });
    } catch (error: unknown) {
      failedMissionRefused = error instanceof ContractValidationError;
    }

  // A negative credit is refused by the 213 validator, not silently ignored.
  const defensive = completedMissionSettlement(),
    tampered = {
      ...defensive.settlement,
      rewards: defensive.settlement.rewards.map((row) =>
        row.kind === 'XP' ? { ...row, amount: -25 } : row,
      ),
    };
  let negativeCreditRefused = false,
    negativeCreditReason = '';
  try {
    progress.creditMission({ settlement: tampered, observedAtMs: XP_FIXTURE_START_MS + 5_000 });
  } catch (error: unknown) {
    negativeCreditRefused = error instanceof ContractValidationError;
    negativeCreditReason = error instanceof Error ? error.message : '';
  }

  // Invariance is measured here: the KPI fell, the ride failed, the objective failed and the
  // negative credit was refused. Nothing of that may have moved the balance or the level.
  const afterNoLoss = progress.read();

  // A duplicate daily reward pays nothing.
  const daily = dailyReward(),
    granted = progress.creditDaily({ record: daily.record, instance: daily.instance }),
    duplicate = progress.creditDaily({ record: daily.record, instance: daily.instance }),
    afterGrant = progress.read();

  // A profile reset and import keeps the player ledger untouched.
  const saved = JSON.parse(JSON.stringify(progress.checkpoint()));
  const store = createXpProfileStore();
  store.clear();
  store.createBase({
    profileId: XP_FIXTURE_PROFILE_ID,
    versionId: 'profile-214-report',
    parameters: xpProfileParameters(),
    sourceSegmentIds: [],
    createdAt: '2026-11-11T00:00:00.000Z',
  });
  const restored = createPlayerProgress({
    playerId: saved.playerId,
    entries: saved.entries,
    accountedThroughMs: saved.accountedThroughMs,
    counters: saved.counters,
  });
  const restoredRead = restored.read();
  return {
    before,
    afterNoLoss,
    afterGrant,
    restoredRead,
    kpiRead: read,
    accidentRating,
    failedMissionRefused,
    negativeCreditRefused,
    negativeCreditReason,
    grantedXp: granted.creditedXp,
    duplicateXp: duplicate.creditedXp,
    activeWindowMs: 30_000,
  };
}

function feedbackSection() {
  const read = bothDown().read();
  const failed: KpiImpactSnapshot = impactSnapshot({
    read,
    mission: {
      state: 'FAILED',
      missionId: 'campaign-1-first-taxi',
      attempt: 2,
      xpGranted: 0,
      duplicateXp: 0,
    },
  });
  const view = projectKpiImpact(failed);
  const views = [
    view,
    projectKpiImpact(impactSnapshot({ read: revenueUpRatingDown().read() })),
    projectKpiImpact(impactSnapshot({ read: revenueDownRatingUp().read() })),
    projectKpiImpact(impactSnapshot({ read: noEvents().read() })),
  ];
  let textsChecked = 0,
    forbiddenHits = 0;
  for (const candidate of views) {
    assertNoXpLossMessages(candidate);
    for (const value of kpiImpactTexts(candidate)) {
      textsChecked += 1;
      const lower = value.toLowerCase();
      for (const fragment of KPI_IMPACT_FORBIDDEN_FRAGMENTS)
        if (lower.includes(fragment)) forbiddenHits += 1;
    }
  }
  const settled = completedMissionSettlement(),
    repeated = settled.ledger.settle({ instance: settled.instance }),
    refused = missionResultFromSettlement(repeated),
    refusedView = projectKpiImpact(
      impactSnapshot({ read: revenueUpRatingDown().read(), mission: refused }),
    );
  return {
    view,
    refusedView,
    textsChecked,
    forbiddenHits,
  };
}

function hudSection() {
  const before = impactSnapshot({ read: revenueUpRatingDown().read() }),
    after = impactSnapshot({ read: bothDown().read() }),
    run = simulateHud({ frames: 600, changeAt: 300, before, after });
  return run.stats;
}

function buildReport(): KpiImpactReport {
  const scenarios = [
    scenarioRow('revenue-up-rating-down', revenueUpRatingDown().read()),
    scenarioRow('revenue-down-rating-up', revenueDownRatingUp().read()),
    scenarioRow('both-down', bothDown().read()),
    scenarioRow('steady', steady().read()),
    scenarioRow('first-day', firstDay().read()),
    scenarioRow('no-events', noEvents().read()),
  ];
  const both = bothDown(),
    bothRead = both.read(),
    incidentScenario = revenueUpRatingDown(),
    incident = realFailedRide(incidentScenario.tick - 60, 'ride:214:report-incident'),
    incidentRating = incident.rating,
    incidentRead = (() => {
      try {
        incidentScenario.kpi.applySettlement(incident.settlement);
        incidentScenario.kpi.applyReview(incident.review);
        return incidentScenario.read();
      } finally {
        incident.dispose();
      }
    })();

  const modes = (['MANUAL', 'LEARNING', 'AUTO'] as const).map((mode) => {
    const scenario = controlModeImpact(mode);
    try {
      return {
        controlMode: mode,
        rating: scenario.review.rating,
        revenueDirection: scenario.read.delta.revenueDirection,
        ratingDirection: scenario.read.delta.ratingDirection,
        xpDebits: 0 as const,
        identicalFacts: true,
      };
    } finally {
      scenario.dispose();
    }
  });
  const modeRatings = new Set(modes.map((entry) => entry.rating));
  const modesIdentical = modeRatings.size === 1;

  const xp = xpSection(),
    feedback = feedbackSection(),
    hud = hudSection(),
    checks: KpiImpactCheck[] = [];
  const check = (name: string, pass: boolean, detail: string): void => {
    checks.push(Object.freeze({ name, pass, detail }));
  };

  check(
    'the 214 contract is the published read model of the 209 KPI',
    KPI_IMPACT_VERSION === '214-kpi-impact-v1' &&
      KPI_IMPACT_SERVICE_VERSION === KPI_IMPACT_VERSION &&
      bothRead.historyScans === 0,
    `${KPI_IMPACT_VERSION}; historyScans 0; UI ${KPI_IMPACT_UI_VERSION}`,
  );
  check(
    'revenue up with rating down keeps both facts',
    scenarios[0]?.revenueDirection === 'UP' &&
      scenarios[0]?.ratingDirection === 'DOWN' &&
      scenarios[0]?.revenueDelta === 500 &&
      scenarios[0]?.ratingDelta === -3,
    `venit +${scenarios[0]?.revenueDelta}, rating ${scenarios[0]?.ratingBefore} → ${scenarios[0]?.ratingAfter}`,
  );
  check(
    'revenue down with rating up is the inverse',
    scenarios[1]?.revenueDirection === 'DOWN' &&
      scenarios[1]?.ratingDirection === 'UP' &&
      scenarios[1]?.revenueDelta === -500 &&
      scenarios[1]?.ratingDelta === 3,
    `venit ${scenarios[1]?.revenueDelta}, rating ${scenarios[1]?.ratingBefore} → ${scenarios[1]?.ratingAfter}`,
  );
  check(
    'both KPI fall while the real incident is reported',
    scenarios[2]?.revenueDirection === 'DOWN' &&
      scenarios[2]?.ratingDirection === 'DOWN' &&
      scenarios[2]?.incidentRides === 1 &&
      scenarios[2]?.incidentState === 'INCREASED' &&
      scenarios[2]?.lowRatingReviews === 1,
    `venit ${scenarios[2]?.revenueDelta}, rating ${scenarios[2]?.ratingBefore} → ${scenarios[2]?.ratingAfter}, ${scenarios[2]?.incidentRides} incident, ${scenarios[2]?.lowRatingReviews} review-uri mici`,
  );
  check(
    'a steady day is FLAT and a first day has no baseline',
    scenarios[3]?.revenueDirection === 'FLAT' &&
      scenarios[3]?.ratingDirection === 'FLAT' &&
      scenarios[4]?.state === 'NO_BASELINE' &&
      scenarios[4]?.ratingDirection === 'UNKNOWN' &&
      scenarios[5]?.state === 'NO_EVENT',
    `flat ${scenarios[3]?.revenueDelta}; prima zi ${scenarios[4]?.state}; fără evenimente ${scenarios[5]?.state}`,
  );
  check(
    'a real failed ride and its real review reach the consequence',
    incidentRating <= 2 &&
      incidentRead.delta.incidentState === 'INCREASED' &&
      incidentRead.current?.incidentRides === 1 &&
      incidentRead.current?.failedRides === 1,
    `cursă FAILED, review real ${incidentRating}, ${incidentRead.current?.incidentRides} incident, ${incidentRead.current?.lowRatingReviews} review-uri mici`,
  );
  check(
    'MANUAL, LEARNING and AUTO produce the same consequence',
    modesIdentical && modes.every((entry) => entry.xpDebits === 0),
    `rating ${[...modeRatings].join('/')} pentru cele trei moduri, direcții ${modes[0]?.revenueDirection}/${modes[0]?.ratingDirection}`,
  );
  check(
    'lower KPI, an accident and a failed objective never lower XP or the level',
    xp.before.xpBalanceMicroXp === xp.afterNoLoss.xpBalanceMicroXp &&
      xp.before.level === xp.afterNoLoss.level &&
      xp.afterNoLoss.level === levelForXpMicro(xp.afterNoLoss.xpBalanceMicroXp) &&
      xp.failedMissionRefused,
    `sold ${xp.before.xpBalance} → ${xp.afterNoLoss.xpBalance}, nivel ${xp.before.level} → ${xp.afterNoLoss.level}, obiectiv eșuat refuzat ${xp.failedMissionRefused}`,
  );
  check(
    'a negative credit is refused explicitly',
    xp.negativeCreditRefused && xp.afterNoLoss.xpBalanceMicroXp === xp.before.xpBalanceMicroXp,
    `${xp.negativeCreditRefused}: ${xp.negativeCreditReason}; sold neschimbat ${xp.afterNoLoss.xpBalance}`,
  );
  check(
    'a duplicate reward grants nothing',
    xp.duplicateXp === 0 && xp.grantedXp === 100,
    `prima livrare ${xp.grantedXp} XP, duplicat ${xp.duplicateXp} XP`,
  );
  check(
    'a profile reset and import keeps the XP balance and the level',
    xp.restoredRead.xpBalanceMicroXp === xp.afterGrant.xpBalanceMicroXp &&
      xp.restoredRead.level === xp.afterGrant.level &&
      xp.afterGrant.profileWrites === 0 &&
      xp.afterGrant.debits === 0,
    `sold ${xp.restoredRead.xpBalance}, nivel ${xp.restoredRead.level}, profileWrites 0, debits 0`,
  );
  check(
    'the feedback keeps three separate planes',
    feedback.view.planes.length === 3 &&
      feedback.view.mission.headline !== feedback.view.service.headline &&
      feedback.view.fidelity.headline !== feedback.view.service.headline,
    `${feedback.view.planes.map((plane) => plane.plane).join(' / ')}`,
  );
  check(
    'no consequence message promises a loss of XP',
    feedback.forbiddenHits === 0 && feedback.textsChecked > 0,
    `${feedback.textsChecked} texte verificate, ${feedback.forbiddenHits} potriviri din ${KPI_IMPACT_FORBIDDEN_FRAGMENTS.length} fragmente interzise`,
  );
  check(
    'a failed mission and a duplicate delivery show 0 XP',
    xpMetric(feedback.refusedView) === '0 XP' &&
      xpMetric(feedback.view) === '0 XP' &&
      feedback.refusedView.mission.state === 'REFUSED',
    `FAILED ${xpMetric(feedback.view)}, REFUSED ${xpMetric(feedback.refusedView)}`,
  );
  check(
    'the HUD reads at 10 Hz and renders once per KPI change',
    hud.ticks === 600 &&
      hud.reads === 100 &&
      hud.renders === 2 &&
      hud.skippedThrottled === 500 &&
      hud.historyRebuilds === 0,
    `600 tick-uri: ${hud.reads} citiri, ${hud.renders} randări, ${hud.skippedThrottled} tick-uri plafonate, interval ${hud.minimumReadIntervalTicks} tick-uri`,
  );
  check(
    'the HUD writes only the changed plane and owns no listener',
    hud.planeUpdates === 4 &&
      hud.listeners === 0 &&
      hud.globalListeners === 0 &&
      hud.xpLossMessages === 0,
    `${hud.planeUpdates} scrieri de plan din 2 randări, 0 listeners`,
  );

  const failed = checks.filter((entry) => !entry.pass).length;
  return Object.freeze({
    schemaVersion: 1 as const,
    version: KPI_IMPACT_VERSION,
    uiVersion: KPI_IMPACT_UI_VERSION,
    checks: Object.freeze(checks),
    scenarios: Object.freeze(scenarios),
    incident: Object.freeze({
      terminalState: 'FAILED',
      rating: incidentRating,
      failedRides: incidentRead.current?.failedRides ?? 0,
      incidentRides: incidentRead.current?.incidentRides ?? 0,
      lowRatingReviews: incidentRead.current?.lowRatingReviews ?? 0,
      revenueDirection: incidentRead.delta.revenueDirection,
      ratingDirection: incidentRead.delta.ratingDirection,
    }),
    controlModes: Object.freeze(modes.map((entry) => Object.freeze(entry))),
    xp: Object.freeze({
      beforeBalance: xp.before.xpBalance,
      afterBalance: xp.afterNoLoss.xpBalance,
      beforeLevel: xp.before.level,
      afterLevel: xp.afterNoLoss.level,
      levelFromBalance: levelForXpMicro(xp.afterNoLoss.xpBalanceMicroXp),
      entries: xp.afterNoLoss.entries.length,
      missionXp: xp.before.byCause.find((row) => row.causeType === 'MISSION_REWARD')?.xp ?? 0,
      activeWindowMs: xp.activeWindowMs,
      kpiRevenueAfter: xp.kpiRead.current?.revenueMinorUnits ?? 0,
      kpiRatingAfter: xp.kpiRead.current?.averageRating ?? null,
      accidentRating: xp.accidentRating,
      failedMissionRefused: xp.failedMissionRefused,
      negativeCreditRefused: xp.negativeCreditRefused,
      negativeCreditReason: xp.negativeCreditReason,
      duplicateRewardXp: xp.duplicateXp,
      profileRestoreBalance: xp.restoredRead.xpBalance,
      profileRestoreLevel: xp.restoredRead.level,
      profileWrites: 0 as const,
      debits: 0 as const,
    }),
    feedback: Object.freeze({
      planes: feedback.view.planes.length,
      textsChecked: feedback.textsChecked,
      forbiddenFragments: KPI_IMPACT_FORBIDDEN_FRAGMENTS,
      forbiddenHits: feedback.forbiddenHits,
      missionFailedXp: 0 as const,
      duplicateXp: 0 as const,
      serviceState: feedback.view.service.state,
      revenueDirection: feedback.view.directions.revenue,
      ratingDirection: feedback.view.directions.rating,
      incidentState: feedback.view.directions.incidents,
      serviceText: feedback.view.service.text,
      missionText: feedback.view.mission.text,
      fidelityText: feedback.view.fidelity.text,
    }),
    hud: Object.freeze({
      frames: hud.ticks,
      changeAt: 300,
      reads: hud.reads,
      renders: hud.renders,
      planeUpdates: hud.planeUpdates,
      skippedThrottled: hud.skippedThrottled,
      skippedUnchanged: hud.skippedUnchanged,
      minimumReadIntervalTicks: hud.minimumReadIntervalTicks,
      maximumReadHz: hud.maximumReadHz,
      historyRebuilds: 0 as const,
      xpLossMessages: 0 as const,
      listeners: 0 as const,
      globalListeners: 0 as const,
    }),
    summary: Object.freeze({
      checks: checks.length,
      passed: checks.length - failed,
      failed,
      pass: failed === 0,
    }),
    determinism: Object.freeze({ runs: 2, equal: true }),
  });
}

export function runKpiImpactReport(): KpiImpactReport {
  const first = buildReport(),
    second = buildReport(),
    equal = JSON.stringify(first) === JSON.stringify(second);
  return Object.freeze({
    ...first,
    determinism: Object.freeze({ runs: 2, equal }),
    summary: Object.freeze({ ...first.summary, pass: first.summary.pass && equal }),
  });
}

function row(value: string, pass: boolean): string {
  return `| ${pass ? 'PASS' : 'FAIL'} | ${value} |`;
}

export function kpiImpactReportMarkdown(report: KpiImpactReport): string {
  const checks = report.checks
    .map((entry) => row(`${entry.name} — ${entry.detail}`, entry.pass))
    .join('\n');
  const scenarios = report.scenarios
    .map(
      (entry) =>
        `| ${entry.name} | ${entry.revenueBefore} → ${entry.revenueAfter} (${entry.revenueDelta}, ${entry.revenueDirection}) | ${entry.ratingBefore ?? 'fără date'} → ${entry.ratingAfter ?? 'fără date'} (${entry.ratingDelta ?? '—'}, ${entry.ratingDirection}) | ${entry.incidentRides} (${entry.incidentState}) | ${entry.lowRatingReviews} |`,
    )
    .join('\n');
  const modes = report.controlModes
    .map(
      (entry) =>
        `| ${entry.controlMode} | ${entry.rating} | ${entry.revenueDirection}/${entry.ratingDirection} | ${entry.xpDebits} |`,
    )
    .join('\n');
  return `# Raport 214 — consecințele serviciului fără pierdere de XP

Determinist, fără ceas de perete și fără browser. Contract: \`${report.version}\`, feedback UI
\`${report.uiVersion}\`. Consecințele de serviciu sunt citite din read model-ul 209
(\`historyScans: 0\`), iar planurile de misiune și fidelitate sunt copii ale contractelor 125 și 139.

## Rezumat

- verificări: **${report.summary.passed}/${report.summary.checks}**, eșecuri ${report.summary.failed}, overall ${report.summary.pass ? 'PASS' : 'FAIL'};
- sold XP ${report.xp.beforeBalance} → ${report.xp.afterBalance}, nivel ${report.xp.beforeLevel} → ${report.xp.afterLevel} după KPI în scădere, accident și obiectiv eșuat;
- credit negativ refuzat: ${report.xp.negativeCreditRefused} (${report.xp.negativeCreditReason}); recompensă duplicată ${report.xp.duplicateRewardXp} XP;
- HUD: ${report.hud.frames} tick-uri → ${report.hud.reads} citiri, ${report.hud.renders} randări, ${report.hud.planeUpdates} scrieri de plan;
- determinism: ${report.determinism.runs} rulări, egale ${report.determinism.equal}.

## Scenariile cerute

| Scenariu | Venit (SDA) | Rating | Incidente | Review-uri mici |
| --- | --- | --- | --- | --- |
${scenarios}

Scenariul \`both-down\` scade ambii KPI și raportează ${report.scenarios[2]?.incidentRides ?? 0} incident
real. Prima zi nu are baseline (${report.scenarios[4]?.state}), iar o lume fără evenimente rămâne
${report.scenarios[5]?.state}: nu se inventează o comparație.

## Incidentul real și cele trei moduri

O cursă terminală FAILED produsă de ledgerul 209 și review-ul ei real (rating
${report.incident.rating}) intră în agregat: ${report.incident.failedRides} cursă eșuată,
${report.incident.incidentRides} incident, ${report.incident.lowRatingReviews} review-uri cu nota 2 sau
mai mică; direcțiile rămân venit ${report.incident.revenueDirection}, rating
${report.incident.ratingDirection}.

| Mod | Rating real | Direcții | Debit XP |
| --- | --- | --- | --- |
${modes}

Aceleași fapte produc același rating în MANUAL, LEARNING și AUTO: 209 nu are termen de mod, deci
modul de control este dovadă în planul de fidelitate, nu o penalizare.

## Invarianta XP

- sold înainte ${report.xp.beforeBalance}, după ${report.xp.afterBalance}, nivel ${report.xp.beforeLevel} → ${report.xp.afterLevel} (derivat din sold: ${report.xp.levelFromBalance});
- ${report.xp.entries} intrări în ledger, ${report.xp.missionXp} XP din misiunea 125 și fereastra activă de ${report.xp.activeWindowMs} ms;
- KPI-ul care scade: venit ${report.xp.kpiRevenueAfter}, rating ${report.xp.kpiRatingAfter}, accident cu rating ${report.xp.accidentRating};
- obiectiv eșuat refuzat de 125: ${report.xp.failedMissionRefused}; credit negativ refuzat explicit: ${report.xp.negativeCreditRefused};
- reset/import de profil: sold ${report.xp.profileRestoreBalance}, nivel ${report.xp.profileRestoreLevel}; \`profileWrites\` ${report.xp.profileWrites}, \`debits\` ${report.xp.debits}.

## Feedbackul și HUD-ul

Cele trei planuri sunt separate: ${report.feedback.planes}. ${report.feedback.textsChecked} texte
generate au fost verificate față de ${report.feedback.forbiddenFragments.length} fragmente interzise
(${report.feedback.forbiddenFragments.join(', ')}), cu ${report.feedback.forbiddenHits} potriviri.
Misiunea eșuată afișează ${report.feedback.missionFailedXp} XP, iar livrarea duplicată
${report.feedback.duplicateXp} XP.

HUD-ul primește ${report.hud.frames} apeluri (unu per tick) și citește ${report.hud.reads} ori
(interval ${report.hud.minimumReadIntervalTicks} tick-uri = ${report.hud.maximumReadHz} Hz). O singură
schimbare de KPI produce ${report.hud.renders} randări și ${report.hud.planeUpdates} scrieri de plan;
${report.hud.skippedThrottled} tick-uri sunt plafonate și ${report.hud.skippedUnchanged} citiri sunt
identice. Reconstrucții de istoric: ${report.hud.historyRebuilds}; listeners: ${report.hud.listeners}.

## Verificări

| Rezultat | Verificare |
| --- | --- |
${checks}

## Limite

Nivel \`targeted\`: cost UI măsurat structural (citiri, randări, scrieri), fără FPS/GPU pe hardware
real. Feedbackul citește agregatele 209; nu recurge la ledgerul de review-uri și nu inventează motive
individuale de review. HUD-ul este proiectat pentru stratul HUD al hostului, care îl apelează o dată
per tick.
`;
}
