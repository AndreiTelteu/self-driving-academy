import {
  CHALLENGE_DIRECTOR_LIMITS,
  challengeRewardKey,
  decodeChallengeRewardKey,
} from '../../src/missions';
import { LIVE_CHALLENGES_VERSION } from '../../src/app';
import { projectChallengePanel } from '../../src/ui';
import { createLiveChallengeHarness, memoryLiveChallengeStorage } from './live-challenges-fixture';
import { createPlayerProgress } from '../../src/missions';

/**
 * Deterministic 277 evidence report.
 *
 * The report drives the real 231/232/233/213 contracts through the live composition over the
 * deterministic 277 fixture. It never reads a wall clock, a browser or a random source, and it never
 * claims a browser/FPS result.
 */

export const LIVE_CHALLENGES_REPORT_VERSION = '277-live-challenges-report-v1' as const;

export interface LiveChallengesReportCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LiveChallengesReport {
  readonly version: typeof LIVE_CHALLENGES_REPORT_VERSION;
  readonly liveVersion: typeof LIVE_CHALLENGES_VERSION;
  readonly generatedBy: string;
  readonly checks: readonly LiveChallengesReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
  readonly offer: Readonly<{
    visibleOffers: number;
    liveInstances: number;
    offerWindowTicks: number;
    cooldownTicks: number;
    acceptedTaxi: string | null;
    reservationSuspended: boolean;
    passengerRefusal: string | null;
    passengerPreserved: boolean;
  }>;
  readonly refusal: Readonly<{
    code: string | null;
    detail: readonly string[];
    displayed: boolean;
  }>;
  readonly destruction: Readonly<{
    offerRefused: boolean;
    code: string | null;
    detail: readonly string[];
    reasons: readonly string[];
  }>;
  readonly reward: Readonly<{
    firstXp: number;
    firstEntries: number;
    firstComparison: string | null;
    secondXp: number;
    secondEntries: number;
    secondComparison: string | null;
    rewardKey: string | null;
    rewardKeyFamily: string | null;
    rewardKeyDate: string | null;
  }>;
  readonly records: Readonly<{
    rows: number;
    bestProgress: number | null;
    attempts: number;
    completions: number;
  }>;
  readonly chaos: Readonly<{
    xp: number;
    entries: number;
    records: number;
    comparison: string | null;
    xpLabel: string;
  }>;
  readonly reload: Readonly<{
    restored: boolean;
    records: number;
    xp: number;
    entries: number;
    creditedXp: number | null;
    sameRecord: boolean;
  }>;
  readonly facts: Readonly<{
    checkpointTicks: number;
    parkingTicks: number;
    zoneVisits: number;
    paused: boolean;
    unsupportedObjectiveKinds: readonly string[];
  }>;
  readonly ui: Readonly<{
    offerActions: readonly string[];
    resultActions: readonly string[];
    retryEnabled: boolean;
    records: number;
    dailyPicks: number;
    globalListeners: 0;
  }>;
  readonly storage: Readonly<{
    checkpointBytes: number;
    persistence: string;
  }>;
  readonly performance: Readonly<{
    evaluationHz: number;
    tickWork: 'BOUNDED_FACTS_ONLY';
    perTickDomWork: 0;
    frameMeasured: 'NOT_MEASURED';
  }>;
  readonly limitations: readonly string[];
}

export function runLiveChallengesReport(): LiveChallengesReport {
  const checks: LiveChallengesReportCheck[] = [];
  const check = (name: string, pass: boolean, detail: string): void => {
    checks.push(Object.freeze({ name, pass, detail }));
  };

  const offerHarness = createLiveChallengeHarness();
  const instanceId = offerHarness.offer('challenge-valet-with-style', 277);
  check('offer-visible-once', instanceId !== null, `instance ${instanceId ?? 'none'}`);
  const offered = offerHarness.live.read();
  check(
    'one-visible-offer',
    offered.offer?.instanceId === instanceId && offered.counters.offers === 1,
    `offer ${offered.offer?.instanceId ?? 'none'}, offers ${offered.counters.offers}`,
  );
  offerHarness.live.offerNow({ templateId: 'challenge-valet-with-style', seed: 999 });
  check(
    'second-offer-refused',
    offerHarness.live.read().lastOfferRefusal?.code === 'OFFER_ALREADY_ACTIVE',
    offerHarness.live.read().lastOfferRefusal?.message ?? 'none',
  );
  const declined = offerHarness.live.decline();
  const afterDecline = offerHarness.live.read();
  check(
    'refusal-is-free',
    declined.status === 'DECLINED' &&
      afterDecline.xpBalance === 0 &&
      afterDecline.ledgerEntries === 0,
    `xp ${afterDecline.xpBalance}, entries ${afterDecline.ledgerEntries}`,
  );
  check(
    'cooldown-real',
    afterDecline.cooldownRemainingTicks === CHALLENGE_DIRECTOR_LIMITS.cooldownTicks,
    `remaining ${afterDecline.cooldownRemainingTicks}`,
  );
  offerHarness.live.offerNow({ templateId: 'challenge-valet-with-style', seed: 277 });
  check(
    'cooldown-refuses',
    offerHarness.live.read().lastOfferRefusal?.code === 'COOLDOWN_ACTIVE',
    offerHarness.live.read().lastOfferRefusal?.message ?? 'none',
  );
  offerHarness.step(CHALLENGE_DIRECTOR_LIMITS.cooldownTicks + 1);
  check(
    'cooldown-expires',
    offerHarness.live.read().cooldownRemainingTicks === 0,
    `tick ${offerHarness.live.read().tick}`,
  );

  const passengerHarness = createLiveChallengeHarness();
  const passengerInstance = passengerHarness.offer('challenge-valet-with-style', 277);
  passengerHarness.setPassenger(true);
  const passengerRefusal = passengerHarness.live.accept();
  const passengerRead = passengerHarness.live.read();
  const passengerWasPreserved = passengerHarness.state.passengerAboard;
  check(
    'accept-refuses-passenger',
    passengerRefusal.status === 'REFUSED' &&
      passengerRefusal.code === 'PASSENGER_ABOARD' &&
      passengerRead.offer?.instanceId === passengerInstance,
    passengerRefusal.status === 'REFUSED' ? passengerRefusal.code : passengerRefusal.status,
  );
  check(
    'passenger-not-moved',
    passengerWasPreserved,
    'the passenger flag stayed true and the offer stayed open',
  );
  passengerHarness.setPassenger(false);
  const accepted = passengerHarness.live.accept();
  check(
    'accept-reserves-taxi',
    accepted.status === 'ACCEPTED' &&
      accepted.reservation.taxiId === passengerHarness.state.taxiId &&
      accepted.reservation.dispatchSuspended === true,
    accepted.status === 'ACCEPTED' ? accepted.reservation.taxiId : accepted.status,
  );

  const infeasibleHarness = createLiveChallengeHarness({ routeSeconds: 500 });
  infeasibleHarness.live.offerNow({ templateId: 'challenge-valet-with-style', seed: 277 });
  const infeasible = infeasibleHarness.live.read();
  check(
    'infeasible-refused-before-display',
    infeasible.offer === null &&
      infeasible.lastOfferRefusal?.code === 'NO_ELIGIBLE_TEMPLATE' &&
      infeasible.lastOfferRefusal.detail.some((entry) => entry.startsWith('DEADLINE_INFEASIBLE:')),
    infeasible.lastOfferRefusal?.detail.join(',') ?? 'none',
  );

  const destructionHarness = createLiveChallengeHarness({ sessionKind: 'CHAOS' });
  const demolitionReasons =
    destructionHarness.live
      .read()
      .unavailableTemplates.find((entry) => entry.templateId === 'challenge-influencer-demolition')
      ?.reasons ?? [];
  destructionHarness.live.offerNow({
    templateId: 'challenge-influencer-demolition',
    seed: 277,
  });
  const destructionRead = destructionHarness.live.read();
  check(
    'destruction-unavailable',
    destructionRead.offer === null &&
      demolitionReasons.includes('CAPABILITY:DESTRUCTIBLE_DECOR') &&
      demolitionReasons.includes('FACT_SOURCE_UNAVAILABLE:DISTRUCTION'),
    demolitionReasons.join(','),
  );

  const rewardHarness = createLiveChallengeHarness();
  const first = rewardHarness.completeParking();
  const firstLedger = rewardHarness.ledger.read();
  const firstRecord = rewardHarness.live.checkpoint().experience.records[0]!;
  check(
    'academy-first-completion-credits-once',
    first.lastResult?.status === 'COMPLETED' &&
      first.lastResult.creditedXp === 80 &&
      firstLedger.entries.length === 1 &&
      firstLedger.xpBalance === 80,
    `xp ${firstLedger.xpBalance}, entries ${firstLedger.entries.length}`,
  );
  check(
    'first-record',
    first.lastResult?.recordComparison === 'FIRST_RECORD' && firstRecord.best !== null,
    `${first.lastResult?.recordComparison}, best ${String(firstRecord.best?.score.progress)}`,
  );
  const rewardKey = firstLedger.entries[0]?.causeId ?? null;
  const decoded = rewardKey === null ? null : decodeChallengeRewardKey(rewardKey);
  check(
    'reward-key-is-family-day',
    decoded !== null && rewardKey === challengeRewardKey(decoded.family, decoded.dailyDate),
    rewardKey ?? 'none',
  );
  const panels = [rewardHarness.live.panelSnapshot(), rewardHarness.live.panelSnapshot()];
  check(
    'panel-reads-do-not-credit',
    panels.every((panel) => panel !== null) && rewardHarness.ledger.read().entries.length === 1,
    `entries ${rewardHarness.ledger.read().entries.length}`,
  );
  rewardHarness.step(CHALLENGE_DIRECTOR_LIMITS.cooldownTicks + 1);
  rewardHarness.live.offerNow({ templateId: 'challenge-valet-with-style', seed: 278 });
  const secondAccepted = rewardHarness.live.accept();
  if (secondAccepted.status === 'ACCEPTED') {
    for (let index = 0; index < 120; index += 1) {
      rewardHarness.state.tick += 1;
      rewardHarness.live.step({ tick: rewardHarness.state.tick });
    }
  }
  const second = rewardHarness.live.read();
  const secondLedger = rewardHarness.ledger.read();
  check(
    'second-same-family-completion-does-not-pay',
    second.lastResult?.status === 'COMPLETED' &&
      second.lastResult.creditedXp === 0 &&
      secondLedger.entries.length === 1 &&
      secondLedger.xpBalance === 80,
    `xp ${secondLedger.xpBalance}, entries ${secondLedger.entries.length}, comparison ${second.lastResult?.recordComparison ?? 'none'}`,
  );

  const checkpointHarness = createLiveChallengeHarness();
  checkpointHarness.offer('challenge-influencer-single-frame', 277);
  const checkpointInstance = checkpointHarness.live.read().offer!;
  checkpointHarness.live.accept();
  const checkpointObjective = checkpointHarness.live
    .checkpoint()
    .director.instances.find(
      (entry) => entry.instanceId === checkpointInstance.instanceId,
    )!.objective;
  checkpointHarness.moveTo(1_000, 1_000);
  checkpointHarness.step(1);
  for (const zoneId of checkpointObjective.zoneIds.slice(0, checkpointObjective.target)) {
    checkpointHarness.moveToZone(zoneId);
    checkpointHarness.step(1);
    checkpointHarness.moveTo(1_000, 1_000);
    checkpointHarness.step(1);
  }
  checkpointHarness.step(12);
  const checkpointRead = checkpointHarness.live.read();
  const checkpointInstanceAfter = checkpointHarness.live
    .checkpoint()
    .director.instances.find((entry) => entry.instanceId === checkpointInstance.instanceId);
  const checkpointMeasured = checkpointInstanceAfter?.outcome?.verdict?.measured ?? null;
  check(
    'checkpoint-objective-from-real-crossings',
    checkpointRead.lastResult?.status === 'COMPLETED' &&
      (checkpointRead.lastResult.progress ?? 0) >= checkpointObjective.target,
    `${checkpointRead.lastResult?.status ?? 'none'} ${String(checkpointRead.lastResult?.progress)}/${String(checkpointObjective.target)}`,
  );
  check(
    'checkpoint-di-overlap',
    checkpointHarness.live.read().active === null,
    'the completed instance left the active slot',
  );

  const chaosHarness = createLiveChallengeHarness({ sessionKind: 'CHAOS' });
  const chaosRead = chaosHarness.completeParking();
  const chaosPanel = chaosHarness.live.panelSnapshot();
  const chaosView = chaosPanel === null ? null : projectChallengePanel(chaosPanel);
  check(
    'chaos-local-record-only',
    chaosRead.lastResult?.creditedXp === 0 &&
      chaosRead.xpBalance === 0 &&
      chaosRead.ledgerEntries === 0 &&
      chaosRead.records === 1,
    `xp ${chaosRead.xpBalance}, entries ${chaosRead.ledgerEntries}, records ${chaosRead.records}`,
  );

  const storage = memoryLiveChallengeStorage();
  const ledger = createPlayerProgress({ playerId: 'player:277:reload' });
  const beforeReload = createLiveChallengeHarness({ storage, ledger });
  const reloadRead = beforeReload.completeParking();
  const checkpoint = beforeReload.live.checkpoint();
  const bytes = JSON.stringify(checkpoint).length;
  beforeReload.dispose();
  const afterReload = createLiveChallengeHarness({ storage, ledger });
  const restored = afterReload.live.read();
  check(
    'reload-keeps-record-and-credit',
    restored.restored &&
      restored.records === reloadRead.records &&
      restored.xpBalance === reloadRead.xpBalance &&
      restored.ledgerEntries === 1 &&
      restored.lastResult?.creditedXp === 80,
    `restored ${restored.restored}, records ${restored.records}, xp ${restored.xpBalance}`,
  );
  afterReload.dispose();

  const uiHarness = createLiveChallengeHarness();
  uiHarness.offer('challenge-valet-with-style', 277);
  const offerPanel = uiHarness.live.panelSnapshot();
  const offerView = offerPanel === null ? null : projectChallengePanel(offerPanel);
  uiHarness.live.decline();
  uiHarness.step(CHALLENGE_DIRECTOR_LIMITS.cooldownTicks + 1);
  uiHarness.live.offerNow({ templateId: 'challenge-valet-with-style', seed: 277 });
  uiHarness.live.accept();
  for (let index = 0; index < 120; index += 1) {
    uiHarness.state.tick += 1;
    uiHarness.live.step({ tick: uiHarness.state.tick });
  }
  const resultPanel = uiHarness.live.panelSnapshot();
  const resultView = resultPanel === null ? null : projectChallengePanel(resultPanel);
  check(
    'panel-offer-and-actions',
    offerView?.offer?.objectiveLabel.includes('PARKING') === true &&
      offerView.actions.map((entry) => entry.action).join(',') === 'ACCEPT,DECLINE,CONTINUE',
    offerView?.actions.map((entry) => entry.action).join(',') ?? 'none',
  );
  check(
    'panel-result-record',
    resultView?.result?.status === 'COMPLETED' &&
      resultView.records.length === 1 &&
      resultView.actions.find((entry) => entry.action === 'RETRY')?.enabled === false,
    `${resultView?.result?.status ?? 'none'}, records ${String(resultView?.records.length)}`,
  );

  const summary = Object.freeze({
    checks: checks.length,
    passed: checks.filter((entry) => entry.pass).length,
    pass: checks.every((entry) => entry.pass),
  });

  return Object.freeze({
    version: LIVE_CHALLENGES_REPORT_VERSION,
    liveVersion: LIVE_CHALLENGES_VERSION,
    generatedBy: 'npm run challenges:live',
    checks: Object.freeze(checks),
    summary,
    offer: Object.freeze({
      visibleOffers: offered.counters.offers,
      liveInstances: offered.active === null ? 0 : 1,
      offerWindowTicks: CHALLENGE_DIRECTOR_LIMITS.offerWindowTicks,
      cooldownTicks: CHALLENGE_DIRECTOR_LIMITS.cooldownTicks,
      acceptedTaxi: accepted.status === 'ACCEPTED' ? accepted.reservation.taxiId : null,
      reservationSuspended:
        accepted.status === 'ACCEPTED' && accepted.reservation.dispatchSuspended,
      passengerRefusal: passengerRefusal.status === 'REFUSED' ? passengerRefusal.code : null,
      passengerPreserved: passengerHarness.state.passengerAboard === false,
    }),
    refusal: Object.freeze({
      code: infeasible.lastOfferRefusal?.code ?? null,
      detail: infeasible.lastOfferRefusal?.detail ?? Object.freeze([]),
      displayed: infeasible.offer !== null,
    }),
    destruction: Object.freeze({
      offerRefused: destructionRead.offer === null,
      code: destructionRead.lastOfferRefusal?.code ?? null,
      detail: destructionRead.lastOfferRefusal?.detail ?? Object.freeze([]),
      reasons: demolitionReasons,
    }),
    reward: Object.freeze({
      firstXp: firstLedger.xpBalance,
      firstEntries: firstLedger.entries.length,
      firstComparison: first.lastResult?.recordComparison ?? null,
      secondXp: secondLedger.xpBalance,
      secondEntries: secondLedger.entries.length,
      secondComparison: second.lastResult?.recordComparison ?? null,
      rewardKey,
      rewardKeyFamily: decoded?.family ?? null,
      rewardKeyDate: decoded?.dailyDate ?? null,
    }),
    records: Object.freeze({
      rows: first.records,
      bestProgress: firstRecord.best?.score.progress ?? null,
      attempts: firstRecord.attempts,
      completions: firstRecord.completions,
    }),
    chaos: Object.freeze({
      xp: chaosRead.xpBalance,
      entries: chaosRead.ledgerEntries,
      records: chaosRead.records,
      comparison: chaosRead.lastResult?.recordComparison ?? null,
      xpLabel: chaosView?.result?.xpLabel ?? '',
    }),
    reload: Object.freeze({
      restored: restored.restored,
      records: restored.records,
      xp: restored.xpBalance,
      entries: restored.ledgerEntries,
      creditedXp: restored.lastResult?.creditedXp ?? null,
      sameRecord: restored.records === reloadRead.records,
    }),
    facts: Object.freeze({
      checkpointTicks: checkpointMeasured?.checkpointsReached ?? 0,
      parkingTicks: firstRecord.completions,
      zoneVisits: checkpointMeasured?.samplesExamined ?? 0,
      paused: false,
      unsupportedObjectiveKinds: Object.entries(liveFactSources())
        .filter(([, source]) => source === 'UNAVAILABLE')
        .map(([kind]) => kind)
        .sort(),
    }),
    ui: Object.freeze({
      offerActions: offerView?.actions.map((entry) => entry.action) ?? Object.freeze([]),
      resultActions: resultView?.actions.map((entry) => entry.action) ?? Object.freeze([]),
      retryEnabled: resultView?.actions.find((entry) => entry.action === 'RETRY')?.enabled ?? false,
      records: resultView?.records.length ?? 0,
      dailyPicks: resultView?.daily?.picks.length ?? 0,
      globalListeners: 0 as const,
    }),
    storage: Object.freeze({ checkpointBytes: bytes, persistence: restored.persistence }),
    performance: Object.freeze({
      evaluationHz: 60 / 6,
      tickWork: 'BOUNDED_FACTS_ONLY' as const,
      perTickDomWork: 0 as const,
      frameMeasured: 'NOT_MEASURED' as const,
    }),
    limitations: Object.freeze([
      'The browser probe is separate; this report is Node-only.',
      'Drift and zone-order evaluators have live fact collection but no browser completion evidence.',
      'TIMED_DROPOFF, COMFORT, DISTRUCTION and LEARNING remain without a live fact source; they are excluded before display.',
      'A tab reload is sessionStorage, not the durable savefile owned by PBI 278.',
      'FPS/GPU/hardware are not measured; the report states structural tick work only.',
    ]),
  });
}

function liveFactSources(): Readonly<Record<string, 'LIVE' | 'UNAVAILABLE'>> {
  return Object.freeze({
    CHECKPOINTS: 'LIVE',
    ZONE_ORDER: 'LIVE',
    PARKING: 'LIVE',
    DRIFT: 'LIVE',
    TIMED_DROPOFF: 'UNAVAILABLE',
    COMFORT: 'UNAVAILABLE',
    DISTRUCTION: 'UNAVAILABLE',
    LEARNING: 'UNAVAILABLE',
  });
}

export function liveChallengesReportMarkdown(report: LiveChallengesReport): string {
  const rows = report.checks
    .map((entry) => `- \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — ${entry.detail}`)
    .join('\n');
  return `# 277 live random challenges report

Generated by \`${report.generatedBy}\` for \`${report.liveVersion}\`.

Checks: ${report.summary.passed}/${report.summary.checks}
Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}

## Offer and refusal

- One visible offer / one live instance: ${report.offer.visibleOffers} / ${report.offer.liveInstances}
- Offer window: ${report.offer.offerWindowTicks} ticks; cooldown: ${report.offer.cooldownTicks} ticks
- Accepted taxi: \`${report.offer.acceptedTaxi ?? 'none'}\`; dispatch suspended: ${report.offer.reservationSuspended}
- Passenger refusal: ${report.offer.passengerRefusal ?? 'none'}; passenger preserved: ${report.offer.passengerPreserved}
- Infeasible offer: ${report.refusal.code ?? 'none'} (${report.refusal.detail.join(', ') || 'no detail'})
- Destruction offer refused: ${report.destruction.offerRefused}; reasons: ${report.destruction.reasons.join(', ')}
- Destruction refusal: ${report.destruction.code ?? 'none'} (${report.destruction.detail.join(', ') || 'no detail'})

## Rewards, records and reload

- First Academy completion: ${report.reward.firstXp} XP, ${report.reward.firstEntries} ledger row, ${report.reward.firstComparison}
- Same family again: ${report.reward.secondXp} XP, ${report.reward.secondEntries} ledger row, ${report.reward.secondComparison}
- Reward key: \`${report.reward.rewardKey ?? 'none'}\` (${report.reward.rewardKeyFamily ?? 'none'} / ${report.reward.rewardKeyDate ?? 'none'})
- Records: ${report.records.rows}; best progress ${String(report.records.bestProgress)}; attempts ${report.records.attempts}; completions ${report.records.completions}
- Chaos: ${report.chaos.xp} XP, ${report.chaos.entries} entries, ${report.chaos.records} record, ${report.chaos.comparison}; label “${report.chaos.xpLabel}”
- Reload: restored ${report.reload.restored}; records ${report.reload.records}; ${report.reload.xp} XP; ${report.reload.entries} ledger row; last credit ${String(report.reload.creditedXp)}

## Panel and persistence

- Offer actions: ${report.ui.offerActions.join(', ')}
- Result actions: ${report.ui.resultActions.join(', ')}; retry enabled ${report.ui.retryEnabled}
- Records in panel: ${report.ui.records}; daily picks: ${report.ui.dailyPicks}; global listeners: ${report.ui.globalListeners}
- Checkpoint: ${report.storage.checkpointBytes} code units; persistence ${report.storage.persistence}
- Tick work: ${report.performance.tickWork}; evaluations ${report.performance.evaluationHz} Hz; per-tick DOM ${report.performance.perTickDomWork}; frame ${report.performance.frameMeasured}

## Checks

${rows}

## Limitations

${report.limitations.map((entry) => `- ${entry}`).join('\n')}
`;
}
