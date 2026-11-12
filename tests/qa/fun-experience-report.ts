import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PerformanceGateReport } from '../harness/performance-gate';
import { verifyPerformanceGateReport } from '../harness/performance-gate';
import { runControlSlidersReport } from '../app/control-sliders-report';
import { runResponsiveLayoutReport } from '../app/responsive-layout-report';
import { runStyleSlidersReport } from '../app/style-sliders-report';
import { runUiAccessibilityReport } from '../app/ui-accessibility-report';
import { runDestructionFeedbackReport } from '../audio/destruction-feedback-report';
import { runE2ESession } from '../e2e/session-e2e';
import { runChallengeExperienceReport } from '../missions/challenge-experience-report';
import { runSaveFileReport } from '../persistence/savefile-report';
import { runSessionKindsReport } from '../persistence/session-kinds-report';
import { runWorldRecoveryReport } from '../persistence/world-recovery-report';
import { runScenarioSuite } from '../scenarios/v1-suite';
import { runDailyProgressReport } from '../ui/daily-progress-report';
import { runDestructibleDecorReport } from '../world/destructible-decor-report';
import { runV1RegressionReport } from './v1-regression-report';

/**
 * The integrated fun/return verification of PBI 235.
 *
 * The snapshot re-executes every dependent probe in this process and records its real numbers.
 * The report turns that snapshot into six criterion verdicts and five replay motives. The replay
 * motives are split in two columns that must never be merged: `mechanism` is what the probes
 * proved, `retention` is what no probe measured. No return rate, percentage or player count is
 * invented anywhere in this file.
 */

export const FUN_EXPERIENCE_VERSION = '235-fun-qa-v1' as const;
export const FUN_EXPERIENCE_SNAPSHOT_VERSION = '235-fun-qa-probes-v1' as const;
export const FUN_EXPERIENCE_COMMAND = 'npm run qa:fun' as const;
export const FUN_EXPERIENCE_PLAYTEST_PARTICIPANTS = 5 as const;

const REPORT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export type FunVerdict = 'PASS' | 'FAIL' | 'NOT_RUN';

export interface FunProbe {
  readonly id: string;
  readonly pbi: string;
  readonly title: string;
  readonly command: string;
  readonly verdict: FunVerdict;
  readonly checks: number;
  readonly passed: number;
  readonly detail: string;
}

/** Cross-cutting numbers from the live probes. They are typed so a missing extraction fails. */
export interface FunFacts {
  readonly e2eSteps: number;
  readonly e2eChecks: number;
  readonly e2eXpBefore: number;
  readonly e2eXpAfter: number;
  readonly e2eLevelBefore: number;
  readonly e2eLevelAfter: number;
  readonly scenarioExecuted: number;
  readonly scenarioPassed: number;
  readonly scenarioNotRun: number;
  readonly scenarioFamilies: number;
  readonly regressionRows: number;
  readonly regressionFail: number;
  readonly regressionNotRun: number;
  readonly xpLosses: number;
  readonly xpDebits: number;
  readonly xpFingerprintIdentical: boolean;
  readonly dailyChecks: number;
  readonly dailyRejected: number;
  readonly dailyRewards: number;
  readonly challengeChecks: number;
  readonly challengeCredits: number;
  readonly challengeDuplicateDelta: number;
  readonly challengeCalendarRollback: string;
  readonly challengeRetryStatus: string;
  readonly challengeRetryAttempt: number;
  readonly challengeRetrySameTemplate: boolean;
  readonly challengeRetryNewIdentity: boolean;
  readonly challengeRetryXpDelta: number;
  readonly challengeRetryRefusal: string;
  readonly challengeRecords: number;
  readonly challengeRecordImprovedOnFaster: boolean;
  readonly challengeRecordKeptOnSlower: boolean;
  readonly challengeDailyTemplates: number;
  readonly challengeDailyFamilies: number;
  readonly challengeExpressible: number;
  readonly sessionTransitions: number;
  readonly sessionAcademyRows: number;
  readonly sessionChaosRows: number;
  readonly sessionOrphanWorlds: number;
  readonly sessionOrphanJobs: number;
  readonly sessionProfileCopies: number;
  readonly sessionLiveWorlds: number;
  readonly sessionCommittedCheckpoints: number;
  readonly resets: number;
  readonly failedResets: number;
  readonly resetBodies: number;
  readonly resetListeners: number;
  readonly resetJobs: number;
  readonly resetCheckpoints: number;
  readonly resetEconomySeries: number;
  readonly resetSceneClosures: number;
  readonly resetXpMicroXp: number;
  readonly xpDecreased: boolean;
  readonly profileChecksumStable: boolean;
  readonly rewardsUnchanged: boolean;
  readonly stalePlanRefused: boolean;
  readonly recoveryStatus: string;
  readonly recoveryTicksToMobility: number;
  readonly invalidatedJobs: number;
  readonly destroyedObjects: number;
  readonly playgroundZones: number;
  readonly destructionResetCycles: number;
  readonly destructionChecksums: number;
  readonly destructionEvents: number;
  readonly controlSourceParity: boolean;
  readonly materials: number;
  readonly reactionsPerIncident: number;
  readonly impactVoices: number;
  readonly replayRecordedEvents: number;
  readonly replayReplayedEvents: number;
  readonly replayInventedReactions: number;
  readonly replayStepsSimulation: number;
  readonly savefileChecks: number;
  readonly savefileBytes: number;
  readonly savefileMaxBytes: number;
  readonly checksumLength: number;
  readonly savefileSessions: number;
  readonly savefileDecor: number;
  readonly importXpDelta: number;
  readonly secondImportXpDelta: number;
  readonly controlChecks: number;
  readonly controlPassed: number;
  readonly styleChecks: number;
  readonly stylePassed: number;
  readonly controlClasses: number;
  readonly cameraMode: string;
  readonly cameraStable: boolean;
  readonly layout1280Fits: boolean;
  readonly layout1280Scrolls: boolean;
  readonly contrastMin: number;
  readonly contrastRequired: number;
  readonly responsiveChecks: number;
  readonly accessibilityChecks: number;
}

export interface FunGateSnapshot {
  readonly reportVersion: string;
  readonly commit: string;
  readonly budgetVersion: string;
  readonly manifestModified: boolean;
  readonly structural: string;
  readonly release: string;
  readonly pass: number;
  readonly fail: number;
  readonly notValidated: number;
  readonly rows: readonly Readonly<{ id: string; verdict: string; detail: string }>[];
  readonly requiredRows: readonly string[];
  readonly missingRequiredRows: readonly string[];
  readonly unpassedRequiredRows: readonly string[];
  readonly issues: readonly string[];
  readonly soakMinutes: number;
  readonly soakRequiredMinutes: number;
  readonly soakCycles: number;
  readonly soakRequiredCycles: number;
  readonly soakVerdict: string;
}

export interface FunExperienceFailure {
  readonly id: string;
  readonly tier: string;
  readonly surface: string;
  readonly viewport: string;
  readonly check: string;
  readonly summary: string;
}

export interface FunUiQaSnapshot {
  readonly command: string;
  readonly verdict: string;
  readonly checks: number;
  readonly passed: number;
  readonly contractFailed: number;
  readonly findings: readonly FunExperienceFailure[];
}

export interface FunExperienceSnapshot {
  readonly version: typeof FUN_EXPERIENCE_SNAPSHOT_VERSION;
  readonly generatedBy: 'scripts/run-fun-qa-report.mjs';
  readonly command: typeof FUN_EXPERIENCE_COMMAND;
  readonly budgetVersion: string;
  readonly probes: readonly FunProbe[];
  readonly facts: FunFacts;
  readonly gate: FunGateSnapshot;
  readonly uiQa: FunUiQaSnapshot;
  readonly limitations: readonly string[];
}

export interface FunCriterionCheck {
  readonly name: string;
  readonly verdict: FunVerdict;
  readonly detail: string;
}

export interface FunCriterion {
  readonly id: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';
  readonly title: string;
  readonly verdict: FunVerdict;
  readonly probes: readonly string[];
  readonly checks: readonly FunCriterionCheck[];
  readonly note: string;
}

export type FunReplayMotiveId =
  'HAOS_DESTRUCTION' | 'CHALLENGES' | 'DAILY' | 'RECORDS' | 'QUICK_RESTART';

export interface FunReplayMotive {
  readonly id: FunReplayMotiveId;
  readonly mechanism: 'TESTED';
  readonly mechanismEvidence: string;
  readonly probes: readonly string[];
  readonly retention: 'NOT_RUN';
  readonly hypothesis: string;
  readonly wouldNeed: string;
}

export interface FunExperienceReport {
  readonly version: typeof FUN_EXPERIENCE_VERSION;
  readonly generatedBy: 'scripts/run-fun-qa-report.mjs';
  readonly command: typeof FUN_EXPERIENCE_COMMAND;
  readonly budgetVersion: string;
  readonly oracleRule: string;
  readonly validation: Readonly<{
    level: 'soak';
    playtest: 'NOT_RUN';
    retention: 'NOT_RUN';
    frame: 'NOT_VALIDATED';
    reason: string;
  }>;
  readonly probes: readonly FunProbe[];
  readonly criteria: readonly FunCriterion[];
  readonly summary: Readonly<{
    criteria: number;
    pass: number;
    fail: number;
    notRun: number;
    probes: number;
    probePass: number;
    probeFail: number;
    probeNotRun: number;
  }>;
  readonly replayMotives: readonly FunReplayMotive[];
  readonly experienceFailures: readonly FunExperienceFailure[];
  readonly notMeasured: readonly string[];
  readonly playtest: Readonly<{
    status: 'NOT_RUN';
    participants: 0;
    requiredParticipants: 5;
    flows: readonly string[];
    wouldNeed: readonly string[];
  }>;
  readonly gate: FunGateSnapshot;
  readonly limitations: readonly string[];
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function checkPass(
  checks: readonly Readonly<{ name: string; pass: boolean }>[],
  name: string,
): boolean {
  return checks.find((entry) => entry.name === name)?.pass === true;
}

function probeVerdict(pass: boolean): FunVerdict {
  return pass ? 'PASS' : 'FAIL';
}

export async function collectFunExperienceProbes(): Promise<FunExperienceSnapshot> {
  const manifest = readJson<{
    budgetVersion?: string;
    status?: string;
    proposedCapacities?: Readonly<Record<string, number | string | null>>;
  }>(join(REPORT_ROOT, 'Docs', 'performance-budgets.json'));
  const regression = await runV1RegressionReport();
  const scenarios = runScenarioSuite();
  const savefile = await runSaveFileReport();
  const challenges = runChallengeExperienceReport();
  const destructible = runDestructibleDecorReport();
  const feedback = runDestructionFeedbackReport({ manifest });
  const sessionKinds = await runSessionKindsReport();
  const recovery = await runWorldRecoveryReport();
  const control = runControlSlidersReport();
  const style = runStyleSlidersReport();
  const responsive = runResponsiveLayoutReport();
  const accessibility = runUiAccessibilityReport();
  const daily = runDailyProgressReport();

  const gateReport = readJson<PerformanceGateReport>(
    join(REPORT_ROOT, 'Docs', 'Evidence', '224-performance-gate', 'report.json'),
  );
  const soak = readJson<{
    duration: { actualMinutes: number; requiredMinutes: number };
    lifecycle: { cycles: number; requiredCycles: number };
    verdict: { status: string };
  }>(join(REPORT_ROOT, 'Docs', 'Evidence', '224-performance-gate', 'soak', 'report.json'));
  const uiQa = readJson<{
    browser: string;
    summary: {
      checks: number;
      passed: number;
      contractFailed: number;
      verdict: string;
    };
    findings: readonly {
      id: string;
      tier: string;
      surface: string;
      viewport: string;
      check: string;
      summary: string;
    }[];
  }>(join(REPORT_ROOT, 'Docs', 'Evidence', '153-ui-qa', 'report.json'));

  const e2e = await runE2ESession();
  const duplicates = challenges.credit.filter((row) => row.status === 'DUPLICATE');
  const calendarRollback = challenges.credit.find((row) => row.calendar === 'ROLLBACK');
  const restart = challenges.retry.rows.find((row) => row.status === 'RESTARTED');
  const retryRefusal = challenges.retry.rows.find((row) => row.status === 'REFUSED');
  const fasterRecord = challenges.records.rows.find((row) => row.comparison === 'BETTER');
  const slowerRecord = challenges.records.rows.find((row) => row.comparison === 'WORSE');
  const contrastPairs = control.contract.contrast.filter((pair) => pair.required >= 4.5);
  const contrastMin = contrastPairs.reduce(
    (minimum, pair) => Math.min(minimum, pair.ratio),
    Number.POSITIVE_INFINITY,
  );

  const requiredRows = [
    'destruction-effects-audio',
    'challenge-director',
    'savefile-integrity',
    'academy-chaos-cycles',
    'soak-60min',
    'gameplay-systems-max-v1',
    'fps-hardware',
  ] as const;

  const facts: FunFacts = {
    e2eSteps: e2e.summary.steps,
    e2eChecks: e2e.summary.checks,
    e2eXpBefore: e2e.restart.xpBefore.balanceXp,
    e2eXpAfter: e2e.restart.xpAfter.balanceXp,
    e2eLevelBefore: e2e.restart.xpBefore.level,
    e2eLevelAfter: e2e.restart.xpAfter.level,
    scenarioExecuted: scenarios.summary.executed,
    scenarioPassed: scenarios.summary.passed,
    scenarioNotRun: scenarios.summary.notRun,
    scenarioFamilies: scenarios.summary.families,
    regressionRows: regression.summary.rows,
    regressionFail: regression.summary.fail,
    regressionNotRun: regression.summary.notRun,
    xpLosses: regression.xp.losses,
    xpDebits: regression.xp.debits,
    xpFingerprintIdentical: regression.xp.fingerprintBefore === regression.xp.fingerprintAfter,
    dailyChecks: daily.summary.checks,
    dailyRejected: daily.refusals.rejected,
    dailyRewards: daily.day.retainedRewards,
    challengeChecks: challenges.summary.checks,
    challengeCredits: challenges.credit.filter((row) => row.status === 'CREDITED').length,
    challengeDuplicateDelta: duplicates.reduce((total, row) => total + row.creditedXp, 0),
    challengeCalendarRollback: calendarRollback?.status ?? 'ABSENT',
    challengeRetryStatus: restart?.status ?? 'ABSENT',
    challengeRetryAttempt: restart?.attempt ?? 0,
    challengeRetrySameTemplate: restart?.sameTemplate ?? false,
    challengeRetryNewIdentity: restart?.newIdentity ?? false,
    challengeRetryXpDelta: restart?.xpDelta ?? Number.NaN,
    challengeRetryRefusal: retryRefusal?.code ?? 'ABSENT',
    challengeRecords: challenges.records.rows.length,
    challengeRecordImprovedOnFaster: fasterRecord?.improved ?? false,
    challengeRecordKeptOnSlower: slowerRecord?.improved === false,
    challengeDailyTemplates: challenges.daily[0]?.templates.length ?? 0,
    challengeDailyFamilies: challenges.daily[0]?.families ?? 0,
    challengeExpressible: challenges.connection.expressible,
    sessionTransitions: sessionKinds.checkpoints.switches,
    sessionAcademyRows: sessionKinds.checkpoints.academyRows,
    sessionChaosRows: sessionKinds.checkpoints.chaosRows,
    sessionOrphanWorlds: sessionKinds.checkpoints.orphanWorlds,
    sessionOrphanJobs: sessionKinds.checkpoints.orphanJobs,
    sessionProfileCopies: sessionKinds.checkpoints.profileCopies,
    sessionLiveWorlds: sessionKinds.checkpoints.liveWorlds,
    sessionCommittedCheckpoints: sessionKinds.checkpoints.committed,
    resets: recovery.repeated.resets,
    failedResets: recovery.repeated.failedResets,
    resetBodies: recovery.repeated.bodies[0] ?? 0,
    resetListeners: recovery.repeated.listeners[0] ?? 0,
    resetJobs: recovery.repeated.jobs[0] ?? 0,
    resetCheckpoints: recovery.repeated.checkpoints,
    resetEconomySeries: recovery.repeated.economySeries,
    resetSceneClosures: recovery.repeated.sceneClosures,
    resetXpMicroXp: recovery.repeated.xpMicroXp,
    xpDecreased: recovery.repeated.xpDecreased,
    profileChecksumStable: recovery.repeated.profileChecksumStable,
    rewardsUnchanged: recovery.repeated.rewardsUnchanged,
    stalePlanRefused:
      checkPass(style.checks, 'stale-no-write') &&
      checkPass(style.checks, 'stale-rebase') &&
      checkPass(style.checks, 'stale-save-state'),
    recoveryStatus: recovery.recovery.status,
    recoveryTicksToMobility: recovery.recovery.ticksToMobility,
    invalidatedJobs: recovery.reset.invalidatedJobs,
    destroyedObjects: destructible.playground.destructibles,
    playgroundZones: destructible.playground.zones,
    destructionResetCycles: destructible.resetCycles.cycles,
    destructionChecksums: destructible.resetCycles.distinctChecksums,
    destructionEvents: destructible.resetCycles.distinctEvents,
    controlSourceParity: destructible.controlSourceParity.identical,
    materials: feedback.materials.distinctProfiles,
    reactionsPerIncident: feedback.structural.reactionsPerIncidentCap,
    impactVoices: feedback.structural.impactVoices,
    replayRecordedEvents: feedback.replay.truth.recordedEvents,
    replayReplayedEvents: feedback.replay.truth.replayedEvents,
    replayInventedReactions: feedback.replay.truth.inventedReactions,
    replayStepsSimulation: feedback.replay.truth.stepsSimulation,
    savefileChecks: savefile.summary.checks,
    savefileBytes: savefile.structure.bytes,
    savefileMaxBytes: savefile.structure.maxFileBytes,
    checksumLength: savefile.structure.checksumLength,
    savefileSessions: savefile.roundTrip.sessionsPresent,
    savefileDecor: savefile.roundTrip.decorObjects,
    importXpDelta: savefile.import.xpDelta,
    secondImportXpDelta: savefile.import.secondXpDelta,
    controlChecks: control.summary.checks,
    controlPassed: control.summary.passed,
    styleChecks: style.summary.checks,
    stylePassed: style.summary.passed,
    controlClasses: ['sedan-extremes', 'compact-extremes'].filter((name) =>
      checkPass(control.checks, name),
    ).length,
    cameraMode: control.applied?.cameraMode ?? 'UNKNOWN',
    cameraStable: checkPass(control.checks, 'camera-stable'),
    layout1280Fits: checkPass(control.checks, 'layout-1280-fits'),
    layout1280Scrolls: checkPass(control.checks, 'layout-1280-scrolls'),
    contrastMin,
    contrastRequired: 4.5,
    responsiveChecks: responsive.summary.checks,
    accessibilityChecks: accessibility.summary.checks,
  };

  const probes: readonly FunProbe[] = [
    {
      id: 'qa-216',
      pbi: '216',
      title: 'Regresia V1: moduri, KPI, daily, XP, replay',
      command: 'npm run qa:v1-regression',
      verdict: probeVerdict(regression.summary.fail === 0),
      checks: regression.summary.rows,
      passed: regression.summary.pass,
      detail: `${regression.summary.rows} rânduri, ${regression.summary.pass} PASS, ${regression.summary.fail} FAIL, ${regression.summary.notRun} NOT_RUN; XP ${regression.xp.before.balance} → ${regression.xp.after.balance}, pierderi ${regression.xp.losses}, debitări ${regression.xp.debits}`,
    },
    {
      id: 'scenarios-151',
      pbi: '151',
      title: 'Suita de scenarii V1 pe patru familii',
      command: 'npm run scenarios:v1',
      verdict: probeVerdict(scenarios.summary.pass),
      checks: scenarios.summary.executed,
      passed: scenarios.summary.passed,
      detail: `${scenarios.summary.scenarios} scenarii, ${scenarios.summary.executed} executate, ${scenarios.summary.passed} PASS, ${scenarios.summary.fail} FAIL, ${scenarios.summary.notRun} NOT_RUN; seed fix, fără ceas de perete`,
    },
    {
      id: 'e2e-152',
      pbi: '152',
      title: 'Sesiunea integrală: profil → cursă → learning → KPI → daily → XP → export → restart',
      command: 'npm run e2e:session',
      verdict: probeVerdict(e2e.summary.pass),
      checks: e2e.summary.checks,
      passed: e2e.summary.checks - e2e.summary.failChecks.length,
      detail: `${e2e.summary.steps} pași, ${e2e.summary.checks} verificări, ${e2e.summary.fail} FAIL; restart XP ${e2e.restart.xpBefore.balanceXp} → ${e2e.restart.xpAfter.balanceXp}, nivel ${e2e.restart.xpBefore.level} → ${e2e.restart.xpAfter.level}`,
    },
    {
      id: 'gate-224',
      pbi: '224',
      title: 'Gate de performanță și soak: toate sistemele noi',
      command: 'npm run perf:gate',
      verdict:
        gateReport.summary.fail === 0 && gateReport.summary.structural === 'PASS' ? 'PASS' : 'FAIL',
      checks: gateReport.rows.length,
      passed: gateReport.summary.pass,
      detail: `${gateReport.rows.length} rânduri, ${gateReport.summary.pass} PASS, ${gateReport.summary.fail} FAIL, ${gateReport.summary.notValidated} NOT_VALIDATED; structural ${gateReport.summary.structural}, release ${gateReport.summary.release}; soak ${soak.duration.actualMinutes} min / ${soak.lifecycle.cycles} cicluri`,
    },
    {
      id: 'session-kinds-225',
      pbi: '225',
      title: 'Academie și Haos: două sesiuni separate',
      command: 'npm run session:kinds',
      verdict: probeVerdict(sessionKinds.summary.pass),
      checks: sessionKinds.summary.checks,
      passed: sessionKinds.summary.passed,
      detail: `${sessionKinds.checkpoints.switches} tranziții (${sessionKinds.checkpoints.academyRows} Academie / ${sessionKinds.checkpoints.chaosRows} Haos), ${sessionKinds.checkpoints.committed} checkpointuri comise, lumi orfane ${sessionKinds.checkpoints.orphanWorlds}, joburi orfane ${sessionKinds.checkpoints.orphanJobs}`,
    },
    {
      id: 'world-recovery-226',
      pbi: '226',
      title: 'R, resetul orașului și restaurarea stilului',
      command: 'npm run world:recovery',
      verdict: probeVerdict(recovery.summary.pass),
      checks: recovery.summary.checks,
      passed: recovery.summary.passed,
      detail: `${recovery.recovery.status} în ${recovery.recovery.ticksToMobility} tick-uri; ${recovery.repeated.resets} reseturi, ${recovery.repeated.failedResets} eșuate, corpuri ${recovery.repeated.bodies.join('/')}, XP ${recovery.repeated.xpMicroXp} micro-XP neschimbat`,
    },
    {
      id: 'destructible-227',
      pbi: '227',
      title: 'Decor destructibil și zone de joacă',
      command: 'npm run world:destructibles',
      verdict: probeVerdict(destructible.summary.pass),
      checks: destructible.summary.checks,
      passed: destructible.summary.passed,
      detail: `${destructible.playground.zones} zone, ${destructible.playground.destructibles} obiecte, ${destructible.resetCycles.cycles} cicluri de reset cu ${destructible.resetCycles.distinctChecksums} checksum distinct`,
    },
    {
      id: 'destruction-feedback-228',
      pbi: '228',
      title: 'Feedback audio-vizual și replay al distrugerii',
      command: 'npm run world:destruction-feedback',
      verdict: probeVerdict(feedback.summary.pass),
      checks: feedback.summary.checks,
      passed: feedback.summary.passed,
      detail: `${feedback.materials.distinctProfiles} profiluri de material, ${feedback.structural.reactionsPerIncidentCap} reacții/incident, ${feedback.structural.impactVoices} voci impact; replay ${feedback.replay.truth.replayedEvents}/${feedback.replay.truth.recordedEvents} evenimente, ${feedback.replay.truth.inventedReactions} inventate, ${feedback.replay.truth.stepsSimulation} pași de simulare`,
    },
    {
      id: 'challenge-233',
      pbi: '233',
      title: 'Reluare, recorduri, recompense și daily pentru provocări',
      command: 'npm run missions:challenge-experience',
      verdict: probeVerdict(challenges.summary.pass),
      checks: challenges.summary.checks,
      passed: challenges.summary.passed,
      detail: `${challenges.credit.filter((row) => row.status === 'CREDITED').length} credit, ${challenges.credit.filter((row) => row.status === 'DUPLICATE').length} duplicat cu 0 XP, ${challenges.records.rows.length} rânduri de record, reluare ${restart?.status ?? 'ABSENT'} la încercarea ${restart?.attempt ?? 0}`,
    },
    {
      id: 'savefile-234',
      pbi: '234',
      title: 'Savefile cu checksum și încărcare atomică',
      command: 'npm run save:file',
      verdict: probeVerdict(savefile.summary.pass),
      checks: savefile.summary.checks,
      passed: savefile.summary.passed,
      detail: `${savefile.summary.checks} verificări, ${savefile.structure.bytes} B din ${savefile.structure.maxFileBytes} B, checksum ${savefile.structure.checksumLength} caractere, ${savefile.roundTrip.sessionsPresent} sesiuni, ${savefile.roundTrip.decorObjects} obiecte de decor`,
    },
    {
      id: 'control-sliders-229',
      pbi: '229',
      title: 'Sliderele de control și camera first-person',
      command: 'npm run ui:control-sliders',
      verdict: probeVerdict(control.summary.pass),
      checks: control.summary.checks,
      passed: control.summary.passed,
      detail: `${control.summary.checks} verificări, camera ${control.applied?.cameraMode ?? 'UNKNOWN'}, două clase (sedan + compact), layout 1280×720, contrast minim ${contrastMin.toFixed(2)}:1`,
    },
    {
      id: 'style-sliders-230',
      pbi: '230',
      title: 'Sliderele de stil, publicare, stale și separarea sesiunilor',
      command: 'npm run ui:style-sliders',
      verdict: probeVerdict(style.summary.pass),
      checks: style.summary.checks,
      passed: style.summary.passed,
      detail: `${style.summary.checks} verificări, ${style.worlds.academiaVersions} versiuni Academie / ${style.worlds.haosVersions} Haos, draft invalidat la schimbarea sesiunii`,
    },
    {
      id: 'daily-212',
      pbi: '212',
      title: 'Daily: ofertă, refuzuri și schimbarea zilei',
      command: 'npm run missions:daily-progress',
      verdict: probeVerdict(daily.summary.pass),
      checks: daily.summary.checks,
      passed: daily.summary.passed,
      detail: `${daily.summary.checks} verificări, ${daily.day.retainedRewards} recompense reținute, ${daily.refusals.rejected} refuzuri, ${daily.day.grantedXp} XP acordat`,
    },
    {
      id: 'responsive-084',
      pbi: '084',
      title: 'Layout responsive la 1280×720 și 1920×1080',
      command: 'npm run ui:responsive',
      verdict: probeVerdict(responsive.summary.pass),
      checks: responsive.summary.checks,
      passed: responsive.summary.passed,
      detail: `${responsive.summary.checks} verificări de layout responsive, ${responsive.summary.passed} trecute`,
    },
    {
      id: 'accessibility-083',
      pbi: '083',
      title: 'Contractul de accesibilitate al suprafețelor UI',
      command: 'npm run ui:accessibility',
      verdict: probeVerdict(accessibility.summary.overall),
      checks: accessibility.summary.checks,
      passed: accessibility.summary.passed,
      detail: `${accessibility.summary.checks} verificări pe ${accessibility.summary.scenarios} scenarii; contrast, focus, tab, Escape`,
    },
    {
      id: 'ui-qa-153',
      pbi: '153',
      title: 'QA vizual și accesibilitate pe componentele reale din Chromium',
      command: 'npm run qa:ui',
      verdict: probeVerdict(uiQa.summary.verdict === 'PASS'),
      checks: uiQa.summary.checks,
      passed: uiQa.summary.passed,
      detail: `${uiQa.summary.checks} verificări în ${uiQa.browser}, ${uiQa.summary.contractFailed} verificări de contract eșuate, verdict ${uiQa.summary.verdict}`,
    },
  ];

  const gate: FunGateSnapshot = {
    reportVersion: gateReport.version,
    commit: gateReport.commit,
    budgetVersion: gateReport.budgetVersion,
    manifestModified: gateReport.manifest.modified,
    structural: gateReport.summary.structural,
    release: gateReport.summary.release,
    pass: gateReport.summary.pass,
    fail: gateReport.summary.fail,
    notValidated: gateReport.summary.notValidated,
    rows: gateReport.rows.map((row) => ({
      id: row.id,
      verdict: row.verdict,
      detail: row.detail,
    })),
    requiredRows,
    missingRequiredRows: requiredRows.filter(
      (id) => gateReport.rows.find((row) => row.id === id) === undefined,
    ),
    unpassedRequiredRows: requiredRows.filter((id) => {
      const row = gateReport.rows.find((entry) => entry.id === id);
      return row === undefined || (row.verdict !== 'PASS' && row.verdict !== 'NOT_VALIDATED');
    }),
    issues: verifyPerformanceGateReport(gateReport),
    soakMinutes: soak.duration.actualMinutes,
    soakRequiredMinutes: soak.duration.requiredMinutes,
    soakCycles: soak.lifecycle.cycles,
    soakRequiredCycles: soak.lifecycle.requiredCycles,
    soakVerdict: soak.verdict.status,
  };

  return {
    version: FUN_EXPERIENCE_SNAPSHOT_VERSION,
    generatedBy: 'scripts/run-fun-qa-report.mjs',
    command: FUN_EXPERIENCE_COMMAND,
    budgetVersion: gateReport.budgetVersion,
    probes,
    facts,
    gate,
    uiQa: {
      command: 'npm run qa:ui',
      verdict: uiQa.summary.verdict,
      checks: uiQa.summary.checks,
      passed: uiQa.summary.passed,
      contractFailed: uiQa.summary.contractFailed,
      findings: uiQa.findings.map((finding) => ({
        id: finding.id,
        tier: finding.tier,
        surface: finding.surface,
        viewport: finding.viewport,
        check: finding.check,
        summary: finding.summary,
      })),
    },
    limitations: [
      'Nivel `soak` declarat de PBI, dar playtestul uman și retenția rămân `NOT_RUN`: niciun jucător real nu a fost observat.',
      'FPS/frame p95/p99 pe hardware real rămân `NOT_VALIDATED` în gate-ul 224; capturile 220 sunt pe alt build.',
      'Textul și contrastul din 153 sunt măsurate pe capturile comise de 153, nu recapturate aici (fără Playwright în worktree).',
      'Costurile de memorie sunt contoare de ownership, nu heap total; `totalHeapBytes` este `null` în manifest.',
    ],
  };
}

function criterionVerdict(checks: readonly FunCriterionCheck[]): FunVerdict {
  if (checks.some((check) => check.verdict === 'FAIL')) return 'FAIL';
  if (checks.some((check) => check.verdict === 'NOT_RUN')) return 'NOT_RUN';
  return 'PASS';
}

export function buildFunExperienceReport(snapshot: FunExperienceSnapshot): FunExperienceReport {
  const f = snapshot.facts;
  const probe = (id: string): FunProbe => {
    const found = snapshot.probes.find((entry) => entry.id === id);
    if (found === undefined) throw new Error(`Sonda ${id} lipsește din snapshot`);
    return found;
  };
  const allPass = (...ids: readonly string[]): boolean =>
    ids.every((id) => probe(id).verdict === 'PASS');

  const c1Checks: FunCriterionCheck[] = [
    {
      name: 'Academie/Haos fără contaminare',
      verdict:
        allPass('session-kinds-225') && f.sessionOrphanWorlds === 0 && f.sessionOrphanJobs === 0
          ? 'PASS'
          : 'FAIL',
      detail: `${f.sessionTransitions} tranziții (${f.sessionAcademyRows} Academie / ${f.sessionChaosRows} Haos), lumi orfane ${f.sessionOrphanWorlds}, joburi orfane ${f.sessionOrphanJobs}, ${f.sessionProfileCopies} copie de profil`,
    },
    {
      name: 'R/reset separate de stil',
      verdict:
        allPass('world-recovery-226') &&
        f.recoveryStatus === 'RECOVERED' &&
        f.recoveryTicksToMobility === 0
          ? 'PASS'
          : 'FAIL',
      detail: `${f.recoveryStatus} la tick-ul cererii (${f.recoveryTicksToMobility} tick-uri până la mobilitate), ${f.resetSceneClosures} închidere de scenă la ${f.resets} reseturi`,
    },
    {
      name: 'Learning/slidere fără schimbarea mașinii',
      verdict: allPass('control-sliders-229', 'style-sliders-230') ? 'PASS' : 'FAIL',
      detail: `${f.controlChecks} + ${f.styleChecks} verificări; mașina, frânarea, aderența și stilul AI rămân neschimbate`,
    },
    {
      name: 'Distrugere și replay',
      verdict:
        allPass('destructible-227', 'destruction-feedback-228') &&
        f.controlSourceParity &&
        f.replayInventedReactions === 0
          ? 'PASS'
          : 'FAIL',
      detail: `${f.destroyedObjects} obiecte în ${f.playgroundZones} zone; aceeași amprentă pentru MANUAL/LEARNING/AUTO; replay ${f.replayReplayedEvents}/${f.replayRecordedEvents} evenimente din înregistrare`,
    },
    {
      name: 'Provocări și daily',
      verdict: allPass('challenge-233', 'daily-212') ? 'PASS' : 'FAIL',
      detail: `${f.challengeChecks} verificări de provocări, ${f.challengeDailyTemplates} șabloane/zi în ${f.challengeDailyFamilies} familii; daily ${f.dailyChecks} verificări`,
    },
    {
      name: 'Savefile fără coruperea sesiunii',
      verdict:
        allPass('savefile-234') && f.savefileSessions === 2 && f.secondImportXpDelta === 0
          ? 'PASS'
          : 'FAIL',
      detail: `${f.savefileChecks} verificări, ${f.savefileBytes} B, ${f.savefileSessions} sesiuni, ${f.savefileDecor} obiecte de decor; al doilea import ${f.secondImportXpDelta} XP`,
    },
    {
      name: 'Sesiunea integrală și regresia V1',
      verdict:
        allPass('e2e-152', 'qa-216', 'scenarios-151') &&
        f.regressionFail === 0 &&
        f.e2eXpAfter === f.e2eXpBefore
          ? 'PASS'
          : 'FAIL',
      detail: `e2e ${f.e2eSteps} pași/${f.e2eChecks} verificări, XP ${f.e2eXpBefore} → ${f.e2eXpAfter}; regresie ${f.regressionRows} rânduri, ${f.regressionFail} FAIL; scenarii ${f.scenarioPassed}/${f.scenarioExecuted} executate în ${f.scenarioFamilies} familii`,
    },
  ];

  const c2Checks: FunCriterionCheck[] = [
    {
      name: 'XP fără pierderi',
      verdict: f.xpLosses === 0 && f.xpDebits === 0 && f.xpFingerprintIdentical ? 'PASS' : 'FAIL',
      detail: `pierderi ${f.xpLosses}, debitări ${f.xpDebits}, amprentă identică ${String(f.xpFingerprintIdentical)}`,
    },
    {
      name: 'Resetul nu scade XP',
      verdict:
        f.xpDecreased === false &&
        f.profileChecksumStable &&
        f.rewardsUnchanged &&
        f.e2eLevelAfter === f.e2eLevelBefore
          ? 'PASS'
          : 'FAIL',
      detail: `XP ${f.resetXpMicroXp} micro-XP după ${f.resets} reseturi, scădere ${String(f.xpDecreased)}, profil ${String(f.profileChecksumStable)}`,
    },
    {
      name: 'Recompense duplicate refuzate',
      verdict: f.challengeDuplicateDelta === 0 && f.dailyRejected > 0 ? 'PASS' : 'FAIL',
      detail: `duplicat de provocare ${f.challengeDuplicateDelta} XP; daily ${f.dailyRejected} refuzuri, ${f.dailyRewards} recompense`,
    },
    {
      name: 'Schimbarea zilei și rollback-ul nu dublează',
      verdict: f.challengeCalendarRollback === 'SKIPPED' ? 'PASS' : 'FAIL',
      detail: `rollback de calendar ${f.challengeCalendarRollback}; recompensa rămâne pe identitatea familie/zi`,
    },
    {
      name: 'Joburi stale și importuri repetate',
      verdict:
        f.stalePlanRefused && f.secondImportXpDelta === 0 && f.invalidatedJobs > 0
          ? 'PASS'
          : 'FAIL',
      detail: `stale respins fără scriere ${String(f.stalePlanRefused)}; ${f.invalidatedJobs} joburi invalidate la reset; al doilea import ${f.secondImportXpDelta} XP`,
    },
  ];

  const c3Checks: FunCriterionCheck[] = [
    {
      name: 'Două clase și camera first-person',
      verdict:
        f.controlClasses === 2 && f.cameraMode === 'FIRST_PERSON' && f.cameraStable
          ? 'PASS'
          : 'FAIL',
      detail: `${f.controlClasses}/2 clase la extreme, camera ${f.cameraMode}, stabilă ${String(f.cameraStable)}`,
    },
    {
      name: 'Layout 1280×720',
      verdict: f.layout1280Fits && f.layout1280Scrolls ? 'PASS' : 'FAIL',
      detail: `încape ${String(f.layout1280Fits)}, derulează ${String(f.layout1280Scrolls)}; responsive ${f.responsiveChecks} verificări`,
    },
    {
      name: 'Contrast',
      verdict: f.contrastMin >= f.contrastRequired ? 'PASS' : 'FAIL',
      detail: `minim ${f.contrastMin.toFixed(2)}:1 din ${f.contrastRequired}:1`,
    },
    {
      name: 'Feedback destructibil vizual/audio',
      verdict:
        f.materials === 6 && f.reactionsPerIncident === 24 && f.impactVoices === 4
          ? 'PASS'
          : 'FAIL',
      detail: `${f.materials} profiluri acustice, plafon ${f.reactionsPerIncident} reacții/incident, ${f.impactVoices} voci impact`,
    },
    {
      name: 'Text lizibil la 1280×720 (153)',
      verdict: snapshot.uiQa.contractFailed === 0 ? 'PASS' : 'FAIL',
      detail:
        snapshot.uiQa.contractFailed === 0
          ? `toate cele ${snapshot.uiQa.checks} verificări de contract trec`
          : `${snapshot.uiQa.contractFailed} verificări de contract eșuate în ${snapshot.uiQa.command}: ${snapshot.uiQa.findings
              .filter((finding) => finding.tier === 'CONTRACT')
              .map(
                (finding) =>
                  `${finding.id}/${finding.surface}/${finding.viewport}/${finding.check}`,
              )
              .join(', ')}`,
    },
  ];

  const c4Checks: FunCriterionCheck[] = [
    {
      name: 'Rândurile sistemelor noi în gate',
      verdict:
        snapshot.gate.missingRequiredRows.length === 0 &&
        snapshot.gate.unpassedRequiredRows.length === 0
          ? 'PASS'
          : 'FAIL',
      detail: `rânduri cerute: ${snapshot.gate.requiredRows.join(', ')}; lipsă ${snapshot.gate.missingRequiredRows.length}, neconforme ${snapshot.gate.unpassedRequiredRows.length}`,
    },
    {
      name: 'Raportul gate se verifică',
      verdict: snapshot.gate.issues.length === 0 ? 'PASS' : 'FAIL',
      detail:
        snapshot.gate.issues.length === 0
          ? `contractul 224 acceptă raportul (${snapshot.gate.pass} PASS, ${snapshot.gate.fail} FAIL, ${snapshot.gate.notValidated} NOT_VALIDATED)`
          : snapshot.gate.issues.join('; '),
    },
    {
      name: 'Soak 60 de minute și 20 de cicluri',
      verdict:
        snapshot.gate.soakMinutes >= snapshot.gate.soakRequiredMinutes &&
        snapshot.gate.soakCycles >= snapshot.gate.soakRequiredCycles
          ? 'PASS'
          : 'FAIL',
      detail: `${snapshot.gate.soakMinutes} min din ${snapshot.gate.soakRequiredMinutes}, ${snapshot.gate.soakCycles} cicluri din ${snapshot.gate.soakRequiredCycles}, verdict ${snapshot.gate.soakVerdict}`,
    },
    {
      name: 'Baseline neschimbat',
      verdict:
        snapshot.gate.manifestModified === false &&
        snapshot.gate.budgetVersion === snapshot.budgetVersion
          ? 'PASS'
          : 'FAIL',
      detail: `manifest ${snapshot.gate.budgetVersion}, modificat ${String(snapshot.gate.manifestModified)}`,
    },
    {
      name: 'Sistemele noi reexecutate în acest raport',
      verdict: allPass(
        'destructible-227',
        'destruction-feedback-228',
        'challenge-233',
        'savefile-234',
        'session-kinds-225',
        'world-recovery-226',
      )
        ? 'PASS'
        : 'FAIL',
      detail: `${f.destructionResetCycles} cicluri de distrugere (${f.destructionChecksums} checksum), ${f.challengeChecks} verificări de provocări, ${f.savefileChecks} de savefile, ${f.sessionTransitions} tranziții, ${f.resets} reseturi`,
    },
  ];

  const c5Checks: FunCriterionCheck[] = [
    {
      name: 'Playtest cu minimum 5 participanți',
      verdict: 'NOT_RUN',
      detail: '0/5 participanți: niciun jucător real nu a fost observat în acest PBI',
    },
    {
      name: 'Condus liber, prima schimbare de stil, distrugere, reluarea unei provocări',
      verdict: 'NOT_RUN',
      detail: 'fluxurile sunt acoperite mecanic (225–233), dar nu au fost jucate de oameni',
    },
    {
      name: 'Cine reîncearcă spontan și de ce',
      verdict: 'NOT_RUN',
      detail: 'nu există observație de sesiune umană; nu se inventează motive sau procente',
    },
  ];

  const c6Checks: FunCriterionCheck[] = [
    {
      name: 'Eșecuri de experiență explicite',
      verdict:
        snapshot.uiQa.contractFailed === 0 || snapshot.uiQa.findings.length > 0 ? 'PASS' : 'FAIL',
      detail:
        snapshot.uiQa.findings.length === 0
          ? 'nicio verificare de contract eșuată în probele reexecutate'
          : `${snapshot.uiQa.findings.length} findings din 153, inclusiv ${snapshot.uiQa.contractFailed} de contract, raportate cu captură și reproducere`,
    },
    {
      name: 'Fără return rate inventat',
      verdict: 'PASS',
      detail:
        'toate motivele de rejucare au `retention: NOT_RUN`; raportul nu conține procente sau rata de revenire',
    },
    {
      name: 'Limitările neacoperite sunt enumerate',
      verdict: snapshot.limitations.length > 0 ? 'PASS' : 'FAIL',
      detail: `${snapshot.limitations.length} limitări declarate; vezi secțiunea „Ce nu s-a măsurat”`,
    },
  ];

  const criteria: readonly FunCriterion[] = [
    {
      id: 'C1',
      title:
        'Scenariile combinate Academie/Haos, learning/slidere, R/reset, distrugere, provocări/daily și savefile trec fără contaminarea progresului',
      verdict: criterionVerdict(c1Checks),
      probes: [
        'qa-216',
        'scenarios-151',
        'e2e-152',
        'session-kinds-225',
        'world-recovery-226',
        'control-sliders-229',
        'style-sliders-230',
        'destructible-227',
        'destruction-feedback-228',
        'challenge-233',
        'daily-212',
        'savefile-234',
      ],
      checks: c1Checks,
      note: 'Progresul este citit prin amprente reale (profil, XP, daily, recompense, misiuni, dovezi) înainte și după fiecare tranziție.',
    },
    {
      id: 'C2',
      title:
        'XP/nivel nu scad prin accidente/KPI/eșec; evenimente duplicate, joburi stale, schimbarea zilei și importul nu dublează credite',
      verdict: criterionVerdict(c2Checks),
      probes: [
        'qa-216',
        'e2e-152',
        'world-recovery-226',
        'challenge-233',
        'daily-212',
        'style-sliders-230',
        'savefile-234',
      ],
      checks: c2Checks,
      note: 'Amprenta XP și contoarele de refuz sunt separate: un duplicat refuzat poate crește un contor fără să plătească sau să scadă XP.',
    },
    {
      id: 'C3',
      title:
        'HUD/camera first-person și sliderele sunt confortabile în două clase și accesibile la 1280×720; feedbackul destructibil este verificat vizual/audio',
      verdict: criterionVerdict(c3Checks),
      probes: [
        'control-sliders-229',
        'style-sliders-230',
        'responsive-084',
        'accessibility-083',
        'destruction-feedback-228',
        'ui-qa-153',
      ],
      checks: c3Checks,
      note: 'Confortul subiectiv rămâne neexecutat (vezi C5). Verificările de contract ale 153 sunt citite din dovezile comise: 5 eșecuri reale de text (11,52 px pe panoul camerei, 11 px și 4 etichete tăiate în pop-up-ul KPI).',
    },
    {
      id: 'C4',
      title:
        'Benchmarkul 224 include toate noile sisteme și 20 de cicluri reset/sesiune; păstrează măsurători reale, plafoane și limitări',
      verdict: criterionVerdict(c4Checks),
      probes: [
        'gate-224',
        'destructible-227',
        'destruction-feedback-228',
        'challenge-233',
        'savefile-234',
        'session-kinds-225',
        'world-recovery-226',
      ],
      checks: c4Checks,
      note: `Gate-ul 224 rămâne cu release \`${snapshot.gate.release}\`: FPS pe hardware real este \`NOT_VALIDATED\` și este raportat ca atare, nu dedus.`,
    },
    {
      id: 'C5',
      title:
        'Playtest cu minimum cinci participanți acoperă condus liber, prima schimbare de stil, distrugere și reluarea unei provocări; consemnează cine reîncearcă spontan și de ce',
      verdict: criterionVerdict(c5Checks),
      probes: [],
      checks: c5Checks,
      note: 'Nu se pretinde playtest: 0 participanți. Ce ar fi nevoie este în secțiunea „Playtest” a raportului.',
    },
    {
      id: 'C6',
      title:
        'Eșecurile/limitările de experiență sunt explicite; rezultatele nu declară return rate fără sesiuni de revenire măsurate',
      verdict: criterionVerdict(c6Checks),
      probes: ['ui-qa-153'],
      checks: c6Checks,
      note: 'Motivele de rejucare au două coloane separate: mecanismul dovedit și ipoteza de retenție `NOT_RUN`.',
    },
  ];

  const replayMotives: readonly FunReplayMotive[] = [
    {
      id: 'HAOS_DESTRUCTION',
      mechanism: 'TESTED',
      mechanismEvidence: `${f.sessionTransitions} tranziții Academie/Haos fără lumi orfane; ${f.destroyedObjects} obiecte în ${f.playgroundZones} zone, ${f.destructionResetCycles} cicluri de reset cu ${f.destructionChecksums} checksum; ${f.materials} profiluri de material și ${f.reactionsPerIncident} reacții/incident cu ${f.impactVoices} voci`,
      probes: ['session-kinds-225', 'destructible-227', 'destruction-feedback-228'],
      retention: 'NOT_RUN',
      hypothesis:
        'Ipoteză neverificată: distrugerea oferă o sesiune scurtă de joacă liberă după o cursă serioasă.',
      wouldNeed:
        'Minimum cinci participanți în Haos, cu observarea primei distrugeri și a revenirii în Academie, plus o sesiune de revenire la 24 de ore pentru a putea vorbi despre revenire.',
    },
    {
      id: 'CHALLENGES',
      mechanism: 'TESTED',
      mechanismEvidence: `${f.challengeChecks} verificări de provocări, ${f.challengeCredits} credit XP, ${f.challengeExpressible} șabloane exprimabile în daily; panoul are 0 listeners globali și o citire pe deschidere`,
      probes: ['challenge-233', 'daily-212'],
      retention: 'NOT_RUN',
      hypothesis:
        'Ipoteză neverificată: o provocare scurtă oferă un punct de intrare pentru o sesiune de cinci minute.',
      wouldNeed:
        'Playtest cu ofertă reală de provocare și măsurarea alegerii voluntare, nu doar existența catalogului.',
    },
    {
      id: 'DAILY',
      mechanism: 'TESTED',
      mechanismEvidence: `${f.challengeDailyTemplates} șabloane pe zi în ${f.challengeDailyFamilies} familii, determinist pe dată; ${f.dailyChecks} verificări daily, ${f.dailyRewards} recompense, ${f.dailyRejected} refuzuri`,
      probes: ['challenge-233', 'daily-212'],
      retention: 'NOT_RUN',
      hypothesis:
        'Ipoteză neverificată: cele trei misiuni zilnice aduc jucătorul înapoi a doua zi.',
      wouldNeed:
        'Sesiuni de revenire măsurate la 24 de ore și la 7 zile, cu același participant și aceeași ofertă zilnică.',
    },
    {
      id: 'RECORDS',
      mechanism: 'TESTED',
      mechanismEvidence: `${f.challengeRecords} rânduri de record: o rulare mai rapidă îmbunătățește recordul (${String(f.challengeRecordImprovedOnFaster)}), una mai lentă sau egală nu îl scade (${String(f.challengeRecordKeptOnSlower)})`,
      probes: ['challenge-233'],
      retention: 'NOT_RUN',
      hypothesis:
        'Ipoteză neverificată: recordul personal îl determină pe jucător să reîncerce aceeași provocare.',
      wouldNeed:
        'Observarea reluărilor spontane după un record, cu numărul de încercări per participant; nu se deduce din existența clasamentului.',
    },
    {
      id: 'QUICK_RESTART',
      mechanism: 'TESTED',
      mechanismEvidence: `reluarea unei provocări eșuate produce \`${f.challengeRetryStatus}\` la încercarea ${f.challengeRetryAttempt}, același șablon ${String(f.challengeRetrySameTemplate)}, identitate nouă ${String(f.challengeRetryNewIdentity)}, ${f.challengeRetryXpDelta} XP; o provocare neeșuată este refuzată cu \`${f.challengeRetryRefusal}\``,
      probes: ['challenge-233'],
      retention: 'NOT_RUN',
      hypothesis: 'Ipoteză neverificată: reluarea în doi pași reduce abandonul după un eșec.',
      wouldNeed:
        'Măsurarea abandonului și a reluării într-un playtest cu eșec provocat, nu doar apelul de restart al directorului.',
    },
  ];

  const summary = {
    criteria: criteria.length,
    pass: criteria.filter((criterion) => criterion.verdict === 'PASS').length,
    fail: criteria.filter((criterion) => criterion.verdict === 'FAIL').length,
    notRun: criteria.filter((criterion) => criterion.verdict === 'NOT_RUN').length,
    probes: snapshot.probes.length,
    probePass: snapshot.probes.filter((entry) => entry.verdict === 'PASS').length,
    probeFail: snapshot.probes.filter((entry) => entry.verdict === 'FAIL').length,
    probeNotRun: snapshot.probes.filter((entry) => entry.verdict === 'NOT_RUN').length,
  };

  return {
    version: FUN_EXPERIENCE_VERSION,
    generatedBy: 'scripts/run-fun-qa-report.mjs',
    command: FUN_EXPERIENCE_COMMAND,
    budgetVersion: snapshot.budgetVersion,
    oracleRule:
      'Fiecare verdict este derivat din raportul real al probei citate, nu din copierea unei valori observate; mecanismul dovedit și ipoteza de retenție sunt coloane separate, iar `NOT_RUN` nu se transformă niciodată în procent.',
    validation: {
      level: 'soak',
      playtest: 'NOT_RUN',
      retention: 'NOT_RUN',
      frame: 'NOT_VALIDATED',
      reason:
        'Politica de validare 2026-10-08: PBI-ul cere soak pentru stabilitate, dar playtestul uman și retenția nu pot fi executate de un agent. Gate-ul 224 păstrează FPS-ul pe hardware real `NOT_VALIDATED`.',
    },
    probes: snapshot.probes,
    criteria,
    summary,
    replayMotives,
    experienceFailures: snapshot.uiQa.findings,
    notMeasured: [
      'Playtest uman cu minimum cinci participanți: condus liber, prima schimbare de stil, distrugere și reluarea unei provocări — `NOT_RUN`, 0/5.',
      'Cine reîncearcă spontan și de ce — `NOT_RUN`; nu există observație de sesiune.',
      'Return rate / retenție la 24 de ore și 7 zile — `NOT_RUN`; nu se raportează niciun procent.',
      `FPS, frame p95/p99 și lucrul GPU pe hardware real, ambele backenduri — \`NOT_VALIDATED\` în gate-ul 224 (release \`${snapshot.gate.release}\`).`,
      'Memoria exactă a paginii și a GPU — `totalHeapBytes` este `null`; probele raportează contoare de ownership.',
      'Latența audio reală și plăcerea sunetului — 228 dovedește planul de reacție și plafoanele, nu mixerul pe hardware.',
      'Confortul subiectiv al camerei (motion sickness) și senzația de condus — fără jucător uman.',
      'Textul din 153 nu a fost recapturat aici: worktree-ul nu are Playwright, deci findings-urile D4–D8 sunt citite din dovezile comise.',
    ],
    playtest: {
      status: 'NOT_RUN',
      participants: 0,
      requiredParticipants: FUN_EXPERIENCE_PLAYTEST_PARTICIPANTS,
      flows: [
        'condus liber în Academie și Haos',
        'prima schimbare de stil din popup-ul de reglaje',
        'distrugere în zonele de joacă',
        'reluarea unei provocări eșuate',
      ],
      wouldNeed: [
        'Minimum cinci participanți, fiecare cu o sesiune de minimum 20 de minute.',
        'Un observator care notează prima schimbare de stil, prima distrugere și decizia de a relua o provocare.',
        'O sesiune de revenire la 24 de ore (și ideal la 7 zile) pentru orice afirmație despre revenire.',
        'Consimțământ și stocare locală a notițelor; fără telemetrie de identificare personală.',
      ],
    },
    gate: snapshot.gate,
    limitations: snapshot.limitations,
  };
}

/** Problems that make the report unusable as evidence. An empty list means the report is valid. */
export function verifyFunExperienceReport(report: FunExperienceReport): readonly string[] {
  const issues: string[] = [];
  if (report.version !== FUN_EXPERIENCE_VERSION)
    issues.push(`versiune necunoscută ${report.version}`);
  const ids = report.criteria.map((criterion) => criterion.id);
  for (const id of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] as const) {
    if (!ids.includes(id)) issues.push(`criteriul ${id} lipsește`);
  }
  if (new Set(ids).size !== ids.length) issues.push('criterii duplicate');
  const probeIds = new Set(report.probes.map((entry) => entry.id));
  for (const criterion of report.criteria) {
    if (criterion.verdict !== criterionVerdict(criterion.checks))
      issues.push(`criteriul ${criterion.id} nu corespunde verificărilor lui`);
    for (const id of criterion.probes)
      if (!probeIds.has(id)) issues.push(`criteriul ${criterion.id} citează sonda lipsă ${id}`);
    if (criterion.id !== 'C5' && criterion.probes.length === 0)
      issues.push(`criteriul ${criterion.id} nu are probe`);
  }
  const counted = report.summary.pass + report.summary.fail + report.summary.notRun;
  if (counted !== report.criteria.length)
    issues.push(`sumarul numără ${counted} criterii, raportul are ${report.criteria.length}`);
  const c5 = report.criteria.find((criterion) => criterion.id === 'C5');
  if (c5?.verdict !== 'NOT_RUN')
    issues.push('C5 nu poate fi altceva decât NOT_RUN fără un playtest uman');
  if (report.playtest.status !== 'NOT_RUN' || report.playtest.participants !== 0)
    issues.push('playtestul este declarat rulat fără participanți măsurați');
  if (report.validation.retention !== 'NOT_RUN')
    issues.push('retenția este declarată măsurată fără sesiuni de revenire');
  for (const motive of report.replayMotives) {
    if (motive.retention !== 'NOT_RUN')
      issues.push(`motivul ${motive.id} pretinde retenție măsurată`);
    if (motive.mechanism !== 'TESTED') issues.push(`motivul ${motive.id} nu are mecanism dovedit`);
    if (motive.hypothesis.trim().length === 0)
      issues.push(`motivul ${motive.id} nu are ipoteză explicită`);
    if (/%/.test(motive.mechanismEvidence) || /%/.test(motive.hypothesis))
      issues.push(`motivul ${motive.id} conține un procent de retenție`);
  }
  if (report.notMeasured.length === 0) issues.push('lista „ce nu s-a măsurat” este goală');
  if (report.experienceFailures.length > 0 && !report.criteria.some((c) => c.verdict === 'FAIL'))
    issues.push('există eșecuri de experiență, dar niciun criteriu nu este FAIL');
  if (report.gate.issues.length > 0)
    issues.push(`gate-ul 224 are probleme: ${report.gate.issues.join('; ')}`);
  if (report.gate.release === 'PASS' && report.gate.notValidated > 0)
    issues.push('gate-ul declară release PASS cu rânduri nevalidate');
  return issues;
}

export function funExperienceReportMarkdown(report: FunExperienceReport): string {
  const probeRows = report.probes
    .map(
      (probe) =>
        `| ${probe.id} | ${probe.pbi} | ${probe.title} | \`${probe.command}\` | ${probe.verdict} | ${probe.passed}/${probe.checks} | ${probe.detail} |`,
    )
    .join('\n');
  const criteriaRows = report.criteria
    .map(
      (criterion) =>
        `| ${criterion.id} | ${criterion.verdict} | ${criterion.title} | ${criterion.probes.length} |`,
    )
    .join('\n');
  const criteriaDetail = report.criteria
    .map((criterion) => {
      const checks = criterion.checks
        .map((check) => `  - **${check.verdict}** ${check.name}: ${check.detail}`)
        .join('\n');
      return `### ${criterion.id} — ${criterion.verdict}\n\n${criterion.title}\n\n${checks}\n\n${criterion.note}`;
    })
    .join('\n\n');
  const motiveRows = report.replayMotives
    .map(
      (motive) =>
        `| ${motive.id} | ${motive.mechanism} | ${motive.mechanismEvidence} | ${motive.retention} |`,
    )
    .join('\n');
  const motiveHypotheses = report.replayMotives
    .map(
      (motive) => `- **${motive.id}**: ${motive.hypothesis} *Ce ar fi nevoie:* ${motive.wouldNeed}`,
    )
    .join('\n');
  const failures =
    report.experienceFailures.length === 0
      ? 'Niciun eșec de contract în probele reexecutate.'
      : report.experienceFailures
          .map(
            (finding) =>
              `- **${finding.id}** (${finding.tier}) ${finding.surface}/${finding.viewport}, \`${finding.check}\`: ${finding.summary}`,
          )
          .join('\n');
  const notMeasured = report.notMeasured.map((entry) => `- ${entry}`).join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  const wouldNeed = report.playtest.wouldNeed.map((entry) => `- ${entry}`).join('\n');
  const gateRows = report.gate.rows
    .map((row) => `| ${row.id} | ${row.verdict} | ${row.detail} |`)
    .join('\n');

  return `# 235 — regresii și playtest pentru distracție și revenire

Raport determinist generat de \`${report.generatedBy}\` cu \`${report.command}\`.
Machine-readable: [report.json](report.json); măsurătorile reale ale sondelor: [probes.json](probes.json).

${report.oracleRule}

## Verdictul agregat

**${report.summary.criteria} criterii: ${report.summary.pass} PASS, ${report.summary.fail} FAIL, ${report.summary.notRun} NOT_RUN.**
**${report.summary.probes} sonde: ${report.summary.probePass} PASS, ${report.summary.probeFail} FAIL, ${report.summary.probeNotRun} NOT_RUN.**

Nivel de validare: \`${report.validation.level}\`; playtest \`${report.validation.playtest}\`; retenție \`${report.validation.retention}\`; frame \`${report.validation.frame}\`.
${report.validation.reason}

| ID | Verdict | Criteriu | Sonde |
| --- | --- | --- | ---: |
${criteriaRows}

## Sondele executate

| Sondă | PBI | Ce acoperă | Comandă | Verdict | Trecute | Rezultat real |
| --- | --- | --- | --- | --- | --- | --- |
${probeRows}

## Verdict per criteriu

${criteriaDetail}

## Motive de rejucare: mecanism dovedit vs. retenție nemăsurată

Coloana „mecanism” este ce au dovedit probele. Coloana „retenție” este ce **nu** s-a măsurat: nu există
sesiuni de revenire, deci nu există procent, rată sau număr de jucători care să fie raportat.

| Motiv | Mecanism | Dovada mecanismului | Retenție |
| --- | --- | --- | --- |
${motiveRows}

${motiveHypotheses}

## Playtest — NOT_RUN

Obiectivul cere minimum ${report.playtest.requiredParticipants} participanți. Rularea a avut
**${report.playtest.participants}**. Fluxurile cerute sunt: ${report.playtest.flows.join('; ')}.

Ce ar fi nevoie:

${wouldNeed}

## Eșecuri de experiență raportate

${failures}

## Gate-ul 224 citat

Raportul gate-ului (commit \`${report.gate.commit.slice(0, 12)}\`, manifest \`${report.gate.budgetVersion}\`,
modificat ${String(report.gate.manifestModified)}): **structural ${report.gate.structural}, release ${report.gate.release}** —
${report.gate.pass} PASS, ${report.gate.fail} FAIL, ${report.gate.notValidated} NOT_VALIDATED. Soak:
${report.gate.soakMinutes} min din ${report.gate.soakRequiredMinutes}, ${report.gate.soakCycles} cicluri din
${report.gate.soakRequiredCycles}, verdict \`${report.gate.soakVerdict}\`.

| Rând | Verdict | Detaliu |
| --- | --- | --- |
${gateRows}

## Ce nu s-a măsurat

${notMeasured}

## Limitări

${limitations}
`;
}
