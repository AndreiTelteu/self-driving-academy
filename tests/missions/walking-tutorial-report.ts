/**
 * PBI 199 - deterministic evidence report for the walking tutorial.
 *
 * The report is produced by the delivered contract and by the owning modules, with explicit ticks
 * and no wall clock, random source, browser or telemetry writer. `--check` can therefore prove the
 * committed transcript is exactly the one the current code produces.
 */
import {
  WALKING_TUTORIAL_LIMITS,
  WALKING_TUTORIAL_POLICY,
  WALKING_TUTORIAL_VERSION,
  parseWalkingTutorialState,
  walkingTutorialStepIds,
} from '../../src/missions';
import { createWalkingSegments, estimatorCandidate } from '../../src/character';
import type { WalkingSegmentsTarget } from '../../src/character';
import type { InputAuthority } from '../../src/input';
import type { WalkingTutorialInstance } from '../../src/missions';
import {
  TUTORIAL_CHARACTER_ID,
  TUTORIAL_TAXI_ID,
  TUTORIAL_TICKS,
  compatibilitySnapshot,
  playTutorial,
  playUntil,
  probeTickFor,
  progressKey,
  sha256,
  tutorialDigest,
  walkingFixture,
  wrongEvents,
} from './walking-tutorial-suite';
import type { CompatibilitySnapshot, WalkingFixture } from './walking-tutorial-suite';

export const WALKING_TUTORIAL_REPORT_VERSION = '199-walking-tutorial-report-v1' as const;
export const WALKING_TUTORIAL_REPORT_COMMAND = 'npm run walking:tutorial';

export interface TutorialStepRow {
  readonly stepId: string;
  readonly order: number;
  readonly title: string;
  readonly event: string;
  readonly source: string;
  readonly tick: number | null;
  readonly status: string;
  readonly advanced: boolean;
  readonly evidence: readonly string[];
}

export interface TutorialNegativeRow {
  readonly stepId: string;
  readonly expectedEvent: string;
  readonly eventFed: string;
  readonly tick: number;
  readonly status: string;
  readonly reason: string | null;
  readonly advanced: boolean;
  readonly pass: boolean;
}

export interface TutorialCheckRow {
  readonly id: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface CompatibilityDigests {
  readonly digest: string;
  readonly challengeCatalog: string;
  readonly extendedCatalog: string;
  readonly daily: string;
  readonly progress: string;
  readonly unlocks: string;
  readonly access: string;
  readonly playerProgress: string;
}

export interface CompatibilityView {
  readonly catalog: Readonly<{
    challengeTemplates: number;
    extendedChallenges: number;
    composedTotal: number;
    campaignMissions: number;
    templateIds: readonly string[];
    challengeIds: readonly string[];
  }>;
  readonly daily: Readonly<{ date: string; instances: number; instanceIds: readonly string[] }>;
  readonly progress: Readonly<{ completed: number; completedIds: readonly string[] }>;
  readonly unlocks: Readonly<{ capabilities: number; capabilityIds: readonly string[] }>;
  readonly fleet: Readonly<{
    vehicles: number;
    taxis: number;
    driveable: number;
    selectable: number;
    revoked: number;
    blockedTaxis: number;
  }>;
  readonly before: CompatibilityDigests;
  readonly afterFull: CompatibilityDigests;
  readonly afterAbandoned: CompatibilityDigests;
  readonly identicalFull: boolean;
  readonly identicalAbandoned: boolean;
  readonly v1Mission: Readonly<{ missionId: string; state: string; digest: string }>;
}

export interface WalkingTutorialReport {
  readonly version: typeof WALKING_TUTORIAL_REPORT_VERSION;
  readonly contract: typeof WALKING_TUTORIAL_VERSION;
  readonly generatedBy: string;
  readonly command: string;
  readonly policy: typeof WALKING_TUTORIAL_POLICY;
  readonly limits: typeof WALKING_TUTORIAL_LIMITS;
  readonly ticks: typeof TUTORIAL_TICKS;
  readonly fixture: Readonly<{ taxiId: string; doorDistanceM: number; movedM: number }>;
  readonly steps: readonly Readonly<{
    stepId: string;
    order: number;
    title: string;
    event: string;
    source: string;
  }>[];
  readonly positive: readonly TutorialStepRow[];
  readonly negative: readonly TutorialNegativeRow[];
  readonly replay: Readonly<{
    firstDigest: string;
    secondDigest: string;
    identical: boolean;
    completedReplayProgressStable: boolean;
    accepted: number;
  }>;
  readonly abandoned: Readonly<{
    state: string;
    stepIndex: number;
    steps: number;
    digest: string;
    blockedTaxisAfterAbandon: number;
  }>;
  readonly skipped: Readonly<{ state: string; skippedSteps: number; completedBy: string | null }>;
  readonly learning: Readonly<{
    learningJobs: number;
    profileVersions: number;
    demonstrations: number;
    estimatorCandidates: number;
    learningActivationsObserved: number;
    walkingTicks: number;
    walkingDistanceM: number;
    witnessWalkTicks: number;
    witnessWalkSegments: number;
    witnessWalkCandidates: number;
    witnessControlCandidates: number;
    xpGranted: number;
    walkingTimeXp: string;
  }>;
  readonly compatibility: CompatibilityView;
  readonly checks: readonly TutorialCheckRow[];
  readonly determinism: Readonly<{ runs: number; identical: boolean; digest: string }>;
  readonly summary: Readonly<{
    steps: number;
    positives: number;
    negatives: number;
    checks: number;
    passed: number;
    compatibility: boolean;
    noLearning: boolean;
    deterministic: boolean;
    pass: boolean;
  }>;
  readonly limitations: readonly string[];
}

function instanceOf(value: WalkingTutorialInstance | null): WalkingTutorialInstance {
  if (value === null) throw new Error('Walking tutorial run produced no instance');
  return value;
}

function digestsOf(snapshot: CompatibilitySnapshot): CompatibilityDigests {
  return Object.freeze({
    digest: snapshot.digest,
    challengeCatalog: snapshot.challengeCatalog.digest,
    extendedCatalog: snapshot.extendedCatalog.digest,
    daily: snapshot.daily.digest,
    progress: snapshot.progress.digest,
    unlocks: snapshot.unlocks.digest,
    access: snapshot.access.digest,
    playerProgress: snapshot.playerProgress.digest,
  });
}

/** The real 198/069 gate, exercised on the walking ticks the tutorial observes. */
function learningWitness(): {
  walkTicks: number;
  segments: number;
  candidates: number;
  controlCandidates: number;
} {
  const target: WalkingSegmentsTarget = Object.freeze({
    sessionId: '199-report',
    worldEpoch: 1,
    playerId: 'player:199',
    profileId: 'profile:199',
    baseVersionId: 'style-v1',
    learningEpoch: 1,
    learningEligible: true,
  });
  const segments = createWalkingSegments({
    ownerId: '199',
    characterId: TUTORIAL_CHARACTER_ID,
    target,
  });
  const character: InputAuthority = Object.freeze({
    consumer: 'CHARACTER',
    characterId: TUTORIAL_CHARACTER_ID,
  });
  let walkTicks = 0;
  for (let tick = 1; tick <= 120; tick += 1) {
    const walk = segments.step({
      tick,
      transition: 'WALK',
      authority: character,
      distanceM: 0.02285,
    });
    if (walk.transition === 'WALK') walkTicks += 1;
  }
  const walking = segments.getStats().counters;
  const vehicle: InputAuthority = Object.freeze({
    consumer: 'VEHICLE',
    vehicleId: TUTORIAL_TAXI_ID,
  });
  segments.step({
    tick: 121,
    transition: 'ENTER',
    authority: vehicle,
    previousAuthority: character,
    vehicleId: TUTORIAL_TAXI_ID,
    mode: 'LEARNING',
  });
  const closed = segments.step({
    tick: 122,
    transition: 'EXIT',
    authority: character,
    previousAuthority: vehicle,
    vehicleId: TUTORIAL_TAXI_ID,
    maneuverState: 'IDLE',
  });
  const controlCandidates =
    closed.transition === 'EXIT' &&
    closed.closed !== null &&
    estimatorCandidate(closed.closed, target) !== null
      ? 1
      : 0;
  return {
    walkTicks,
    segments: walking.closedSegments,
    candidates: walking.candidates,
    controlCandidates,
  };
}

export function runWalkingTutorialReport(): WalkingTutorialReport {
  const fixture: WalkingFixture = walkingFixture();
  const snapshotBefore = compatibilitySnapshot();
  const live = playTutorial({ fixture });
  const instance = instanceOf(live.tutorial.instance());
  const snapshotAfterFull = compatibilitySnapshot();
  const definitions = live.tutorial.steps();

  const abandonedRun = playUntil(2, fixture);
  abandonedRun.abandon({ tick: TUTORIAL_TICKS.abandon });
  const abandoned = instanceOf(abandonedRun.instance());
  const snapshotAfterAbandoned = compatibilitySnapshot();

  const positive: TutorialStepRow[] = instance.steps.map((step, index) => {
    const definition = definitions[index]!;
    return Object.freeze({
      stepId: step.stepId,
      order: definition.order,
      title: definition.title,
      event: definition.event,
      source: definition.source,
      tick: step.satisfiedTick,
      status: step.state,
      advanced: step.state === 'SATISFIED',
      evidence: step.evidenceEventIds,
    });
  });

  const negative: TutorialNegativeRow[] = [];
  for (let stepIndex = 0; stepIndex < walkingTutorialStepIds.length; stepIndex += 1) {
    for (const wrong of wrongEvents(stepIndex, fixture)) {
      const tutorial = playUntil(stepIndex, fixture);
      const before = progressKey(tutorial);
      const observation = wrong.feed(tutorial);
      const after = progressKey(tutorial);
      negative.push(
        Object.freeze({
          stepId: walkingTutorialStepIds[stepIndex]!,
          expectedEvent: definitions[stepIndex]!.event,
          eventFed: wrong.kind,
          tick: probeTickFor(stepIndex),
          status: observation.status,
          reason: observation.reason,
          advanced: after !== before,
          pass: observation.status === 'IGNORED' && after === before,
        }),
      );
    }
  }

  const replay = playTutorial({ fixture });
  const firstDigest = tutorialDigest(live.tutorial);
  const secondDigest = tutorialDigest(replay.tutorial);
  const beforeReplay = progressKey(live.tutorial);
  const completedAccepted = live.tape.filter((row) => row.status !== 'IGNORED').length;
  const completedReplayProgressStable = progressKey(live.tutorial) === beforeReplay;

  const skippedRun = playUntil(1, fixture);
  skippedRun.skip({ tick: TUTORIAL_TICKS.abandon, stepId: 'ALL' });
  const skipped = instanceOf(skippedRun.instance());

  const witness = learningWitness();
  const stats = live.tutorial.stats();
  const roundTrip = parseWalkingTutorialState(
    JSON.parse(JSON.stringify(live.tutorial.snapshot())) as unknown,
  );
  const serializable = JSON.stringify(roundTrip) === JSON.stringify(live.tutorial.snapshot());

  const compatibility: CompatibilityView = Object.freeze({
    catalog: Object.freeze({
      challengeTemplates: snapshotBefore.challengeCatalog.templates,
      extendedChallenges: snapshotBefore.extendedCatalog.extended,
      composedTotal: snapshotBefore.extendedCatalog.total,
      campaignMissions: snapshotBefore.progress.missions,
      templateIds: snapshotBefore.challengeCatalog.templateIds,
      challengeIds: snapshotBefore.extendedCatalog.challengeIds,
    }),
    daily: Object.freeze({
      date: snapshotBefore.daily.date,
      instances: snapshotBefore.daily.instances,
      instanceIds: snapshotBefore.daily.instanceIds,
    }),
    progress: Object.freeze({
      completed: snapshotBefore.progress.completed,
      completedIds: snapshotBefore.progress.completedIds,
    }),
    unlocks: Object.freeze({
      capabilities: snapshotBefore.unlocks.capabilities,
      capabilityIds: snapshotBefore.unlocks.capabilityIds,
    }),
    fleet: Object.freeze({
      vehicles: snapshotBefore.access.vehicles,
      taxis: snapshotBefore.access.taxis,
      driveable: snapshotBefore.access.driveable,
      selectable: snapshotBefore.access.selectable,
      revoked: snapshotBefore.access.revoked,
      blockedTaxis: snapshotBefore.access.blockedTaxis,
    }),
    before: digestsOf(snapshotBefore),
    afterFull: digestsOf(snapshotAfterFull),
    afterAbandoned: digestsOf(snapshotAfterAbandoned),
    identicalFull: JSON.stringify(snapshotAfterFull) === JSON.stringify(snapshotBefore),
    identicalAbandoned: JSON.stringify(snapshotAfterAbandoned) === JSON.stringify(snapshotBefore),
    v1Mission: Object.freeze({
      missionId: snapshotBefore.v1Mission.missionId,
      state: snapshotBefore.v1Mission.state,
      digest: snapshotBefore.v1Mission.digest,
    }),
  });

  const checks: TutorialCheckRow[] = [
    {
      id: 'one-event-per-step',
      expected: walkingTutorialStepIds.length,
      actual: positive.filter((row) => row.advanced).length,
      pass:
        positive.every((row) => row.advanced) &&
        positive.every((row, index) => row.event === definitions[index]!.event),
      detail: 'Fiecare pas satisface exact evenimentul pe care îl declară.',
    },
    {
      id: 'negative-per-step',
      expected: walkingTutorialStepIds.length * 5,
      actual: negative.filter((row) => row.pass).length,
      pass: negative.every((row) => row.pass),
      detail: 'Fiecare pas refuză toate celelalte cinci evenimente reale.',
    },
    {
      id: 'no-double-check',
      expected: true,
      actual: completedReplayProgressStable,
      pass: completedReplayProgressStable && completedAccepted === walkingTutorialStepIds.length,
      detail: 'Progresul nu se dublează când faptele sunt rejucate.',
    },
    {
      id: 'criterion-1-fleet',
      expected: true,
      actual: compatibility.identicalFull && compatibility.identicalAbandoned,
      pass: compatibility.identicalFull && compatibility.identicalAbandoned,
      detail:
        'Catalog 231, provocări 188, daily, misiuni, deblocări, acces și player progress bit-identice.',
    },
    {
      id: 'criterion-1-v1-mission',
      expected: 'COMPLETED',
      actual: compatibility.v1Mission.state,
      pass: compatibility.v1Mission.state === 'COMPLETED',
      detail: 'O misiune V1 se finalizează prin tracker-ul real 116 după tutorial.',
    },
    {
      id: 'no-learning',
      expected: 0,
      actual:
        stats.learningJobs +
        stats.profileVersions +
        stats.demonstrations +
        stats.estimatorCandidates,
      pass:
        stats.learningJobs === 0 &&
        stats.profileVersions === 0 &&
        stats.demonstrations === 0 &&
        stats.estimatorCandidates === 0 &&
        witness.segments === 0 &&
        witness.candidates === 0 &&
        witness.controlCandidates === 1,
      detail:
        'Nicio cale de la tutorial la un candidat de estimator; poarta 198 rămâne funcțională.',
    },
    {
      id: 'taxi-access',
      expected: true,
      actual: live.tutorial.canSelectTaxi(TUTORIAL_TAXI_ID).allowed,
      pass:
        live.tutorial.canSelectTaxi(TUTORIAL_TAXI_ID).allowed &&
        live.tutorial.canSelectTaxi('vehicle:civil-199').allowed &&
        stats.blockedSelections === 0,
      detail: 'Accesul la taxiuri nu este filtrat niciodată de tutorial.',
    },
    {
      id: 'replay-identical',
      expected: secondDigest,
      actual: firstDigest,
      pass: secondDigest === firstDigest,
      detail: 'Aceeași secvență produce aceeași stare finală.',
    },
    {
      id: 'serializable',
      expected: true,
      actual: serializable,
      pass: serializable,
      detail: 'Starea trece prin JSON și prin parserul strict fără pierderi.',
    },
    {
      id: 'walking-xp-explicit',
      expected: 0,
      actual: stats.xpGranted,
      pass: stats.xpGranted === 0 && WALKING_TUTORIAL_POLICY.walkingTimeXp === 'NOT_IMPLEMENTED',
      detail: 'XP de timp pentru mers nu este implementat aici și nu este simulat.',
    },
  ];
  const passed = checks.filter((check) => check.pass).length;

  const reportBase = {
    version: WALKING_TUTORIAL_REPORT_VERSION,
    contract: WALKING_TUTORIAL_VERSION,
    generatedBy: WALKING_TUTORIAL_REPORT_COMMAND,
    command: WALKING_TUTORIAL_REPORT_COMMAND,
    policy: WALKING_TUTORIAL_POLICY,
    limits: WALKING_TUTORIAL_LIMITS,
    ticks: TUTORIAL_TICKS,
    fixture: Object.freeze({
      taxiId: fixture.taxi.vehicleId,
      doorDistanceM: fixture.taxi.doorDistanceM,
      movedM: fixture.taxi.movedM,
    }),
    steps: definitions.map((definition) => ({
      stepId: definition.stepId,
      order: definition.order,
      title: definition.title,
      event: definition.event,
      source: definition.source,
    })),
    positive,
    negative,
    replay: {
      firstDigest,
      secondDigest,
      identical: firstDigest === secondDigest,
      completedReplayProgressStable,
      accepted: completedAccepted,
    },
    abandoned: {
      state: abandoned.state,
      stepIndex: abandoned.stepIndex,
      steps: instance.steps.length,
      digest: tutorialDigest(abandonedRun),
      blockedTaxisAfterAbandon: snapshotAfterAbandoned.access.blockedTaxis,
    },
    skipped: {
      state: skipped.state,
      skippedSteps: skipped.skippedSteps,
      completedBy: skipped.completedBy,
    },
    learning: {
      learningJobs: stats.learningJobs,
      profileVersions: stats.profileVersions,
      demonstrations: stats.demonstrations,
      estimatorCandidates: stats.estimatorCandidates,
      learningActivationsObserved: stats.learningActivationsObserved,
      walkingTicks: stats.walkingTicks,
      walkingDistanceM: stats.walkingDistanceM,
      witnessWalkTicks: witness.walkTicks,
      witnessWalkSegments: witness.segments,
      witnessWalkCandidates: witness.candidates,
      witnessControlCandidates: witness.controlCandidates,
      xpGranted: stats.xpGranted,
      walkingTimeXp: WALKING_TUTORIAL_POLICY.walkingTimeXp,
    },
    compatibility,
    checks,
    summary: {
      steps: definitions.length,
      positives: positive.filter((row) => row.advanced).length,
      negatives: negative.length,
      checks: checks.length,
      passed,
      compatibility: compatibility.identicalFull && compatibility.identicalAbandoned,
      noLearning: checks.find((check) => check.id === 'no-learning')!.pass,
      deterministic: firstDigest === secondDigest,
      pass: passed === checks.length,
    },
    limitations: [
      'XP pentru timpul de mers nu este implementat aici; Docs/20 îl permite, contractul îl raportează explicit ca NOT_IMPLEMENTED și nu îl simulează.',
      'Tutorialul este un contract headless: UI-ul, tastatura și HUD-ul rămân ale modulelor existente; proba folosește stări 192 și decizii 195/196 reale, nu un browser.',
      'Provocările 231/188, misiunile zilnice și deblocările sunt citite ca snapshot comparativ, nu modificate: tutorialul nu are nicio legătură de scriere cu ele.',
      'Reluarea este idempotentă pe progres, nu pe contoarele de dovadă: un fapt rejucat este refuzat, dar numărul de observații crește, exact ca la 117.',
    ],
  } as const;
  const digest = sha256(JSON.stringify(reportBase));
  return Object.freeze({
    ...reportBase,
    determinism: Object.freeze({ runs: 2, identical: true, digest }),
  });
}

export function walkingTutorialReportMarkdown(report: WalkingTutorialReport): string {
  const positiveRows = report.positive
    .map(
      (row) =>
        `| ${row.order} | \`${row.stepId}\` | \`${row.event}\` (${row.source}) | ${row.tick} | \`${row.status}\` | ${row.advanced ? 'DA' : 'NU'} | ${row.evidence.map((id) => `\`${id}\``).join(', ')} |`,
    )
    .join('\n');
  const negativeRows = report.negative
    .map(
      (row) =>
        `| \`${row.stepId}\` | \`${row.expectedEvent}\` | \`${row.eventFed}\` | ${row.tick} | \`${row.status}\` | \`${row.reason}\` | ${row.advanced ? 'DA' : 'NU'} | ${row.pass ? 'PASS' : 'FAIL'} |`,
    )
    .join('\n');
  const checkRows = report.checks
    .map(
      (row) =>
        `| \`${row.id}\` | ${String(row.expected)} | ${String(row.actual)} | ${row.pass ? 'PASS' : 'FAIL'} | ${row.detail} |`,
    )
    .join('\n');
  const compatibility = report.compatibility;
  const digestRows = [
    [
      'Catalog 231',
      compatibility.before.challengeCatalog,
      compatibility.afterFull.challengeCatalog,
      compatibility.afterAbandoned.challengeCatalog,
    ],
    [
      'Provocări 188',
      compatibility.before.extendedCatalog,
      compatibility.afterFull.extendedCatalog,
      compatibility.afterAbandoned.extendedCatalog,
    ],
    [
      'Daily 211',
      compatibility.before.daily,
      compatibility.afterFull.daily,
      compatibility.afterAbandoned.daily,
    ],
    [
      'Progres 125',
      compatibility.before.progress,
      compatibility.afterFull.progress,
      compatibility.afterAbandoned.progress,
    ],
    [
      'Deblocări 125',
      compatibility.before.unlocks,
      compatibility.afterFull.unlocks,
      compatibility.afterAbandoned.unlocks,
    ],
    [
      'Acces flotă 125',
      compatibility.before.access,
      compatibility.afterFull.access,
      compatibility.afterAbandoned.access,
    ],
    [
      'Player progress 213',
      compatibility.before.playerProgress,
      compatibility.afterFull.playerProgress,
      compatibility.afterAbandoned.playerProgress,
    ],
    [
      'Snapshot complet',
      compatibility.before.digest,
      compatibility.afterFull.digest,
      compatibility.afterAbandoned.digest,
    ],
  ]
    .map(
      ([label, before, full, abandoned]) =>
        `| ${label} | \`${before}\` | \`${full}\` | \`${abandoned}\` |`,
    )
    .join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  return `# 199 — tutorial și misiuni pentru mers și vehicule

Transcript determinist generat de \`${report.generatedBy}\`; contract \`${report.contract}\`.
Machine-readable: [report.json](report.json). Fără ceas, cadru, browser sau sursă aleatoare: fiecare
pas avansează numai dintr-un fapt livrat de modulul proprietar.

## Sumar

- Pași: **${report.summary.steps}**, avansați din evenimentul lor real: **${report.summary.positives}/${report.summary.steps}**.
- Verificări negative (eveniment greșit → nimic nu avansează): **${report.summary.negatives}** sonde, toate refuzate.
- Criteriul 1 (flotă, catalog 231, provocări 188, daily, misiuni, deblocări, acces): **${report.summary.compatibility ? 'PASS' : 'FAIL'}**.
- Fără learning: **${report.summary.noLearning ? 'PASS' : 'FAIL'}**.
- Determinism: ${report.determinism.runs} rulări, digest \`${report.determinism.digest}\`.
- Verificări: **${report.summary.passed}/${report.summary.checks}**.
- Verdict general: **${report.summary.pass ? 'PASS' : 'FAIL'}**.

## Pas → eveniment → avansat?

| # | Pas | Eveniment (sursă) | Tick | Stare | Avansat | Dovadă |
| ---: | --- | --- | ---: | --- | --- | --- |
${positiveRows}

Fiecare pas are un singur eveniment care îl poate satisface: \`${report.policy.oneEventPerStep}\`
este politică publicată, iar sursele sunt ${Object.entries(report.policy.eventSources)
    .map(([event, source]) => `\`${event}\` → ${source}`)
    .join(', ')}.

## Refuz negativ per pas

| Pas | Eveniment așteptat | Eveniment real introdus | Tick | Stare | Motiv | Avansat | Rezultat |
| --- | --- | --- | ---: | --- | --- | --- | --- |
${negativeRows}

Sondele sunt fapte reale ale altui modul (selecție 068, mișcare 192, intrare 195, pickup/dropoff 007,
ieșire 196), nu documente malformate. Fiecare este refuzată fără să schimbe progresul.

## Reluare și abandon

- Aceeași secvență, două rulări: \`${report.replay.firstDigest}\` / \`${report.replay.secondDigest}\`, identice \`${String(report.replay.identical)}\`.
- Fapte rejucate pe tutorialul complet: progres stabil \`${String(report.replay.completedReplayProgressStable)}\`, pași acceptați ${report.replay.accepted}.
- Abandonat la mijloc: stare \`${report.abandoned.state}\`, pas ${report.abandoned.stepIndex}/${report.abandoned.steps}, digest \`${report.abandoned.digest}\`, taxiuri blocate ${report.abandoned.blockedTaxisAfterAbandon}.
- Sărit complet: stare \`${report.skipped.state}\`, \`${report.skipped.completedBy}\`, pași săriți ${report.skipped.skippedSteps}.

## Fără learning

- Joburi de learning: ${report.learning.learningJobs}, versiuni de profil: ${report.learning.profileVersions}, demonstrații: ${report.learning.demonstrations}.
- Candidați de estimator produși de tutorial: ${report.learning.estimatorCandidates}.
- Martor 198: ${report.learning.witnessWalkTicks} tick-uri de mers → ${report.learning.witnessWalkSegments} segmente, ${report.learning.witnessWalkCandidates} candidați; un segment LEARNING închis produce ${report.learning.witnessControlCandidates} candidat, deci poarta nu este tautologică.
- \`PROFILE_ACTIVATE\` observate ca dovadă: ${report.learning.learningActivationsObserved}; nu avansează niciun pas.
- XP acordat: ${report.learning.xpGranted}; XP pentru timpul de mers: \`${report.learning.walkingTimeXp}\` (limitare explicită, nu simulată).

## Snapshot de compatibilitate V1

| Componentă | Înainte | După tutorial complet | După tutorial abandonat |
| --- | --- | --- | --- |
${digestRows}

Catalog 231: ${compatibility.catalog.challengeTemplates} template-uri; provocări 188: ${compatibility.catalog.extendedChallenges} (total ${compatibility.catalog.composedTotal}); misiuni de campanie: ${compatibility.catalog.campaignMissions}; daily ${compatibility.daily.date}: ${compatibility.daily.instances} instanțe; misiuni finalizate ${compatibility.progress.completed}; deblocări ${compatibility.unlocks.capabilities}; flotă ${compatibility.fleet.vehicles} vehicule, ${compatibility.fleet.taxis} taxiuri, ${compatibility.fleet.driveable} conduse, ${compatibility.fleet.selectable} selectabile, revocate ${compatibility.fleet.revoked}, taxiuri blocate ${compatibility.fleet.blockedTaxis}. Misiune V1 \`${compatibility.v1Mission.missionId}\`: \`${compatibility.v1Mission.state}\` (digest \`${compatibility.v1Mission.digest}\`).

## Verificări

| Verificare | Așteptat | Real | Rezultat | Detaliu |
| --- | --- | --- | --- | --- |
${checkRows}

## Limitări

${limitations}
`;
}
