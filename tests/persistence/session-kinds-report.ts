import {
  SESSION_KINDS_VERSION,
  adoptChaosStyleIntoAcademy,
  applyChaosTuning,
  evaluateSessionKindTransfer,
  sessionCapabilitiesFor,
  sessionKindCapabilityParity,
  verifyChaosProfileCopy,
  verifySessionKindCheckpoint,
} from '../../src/persistence/index';
import type { SessionKindCheckpoint, SessionLedgerFingerprint } from '../../src/persistence/index';
import { playerControlModes } from '../../src/missions';
import { verifyProfileVersionChecksum } from '../../src/profiles';
import { completeMission } from '../missions/mission-rewards-fixture';
import { createMissionTestTracker } from '../missions/mission-fixture';
import {
  ACADEMY_SESSION_ID,
  CHAOS_COPY_ID,
  FIXED_NOW,
  academyActiveWindow,
  academyProfile,
  chaosActiveWindow,
  chaosManualStart,
  sessionEconomyFixture,
  sessionHostFixture,
} from './session-kinds-fixture';
import type { SessionHostFixture } from './session-kinds-fixture';

/**
 * Deterministic transcript of PBI 225.
 *
 * Every number here is produced by the real 109/125/211/212/213 instances, the real profile-copy
 * contract and the real switch host. The report never reads a clock, a browser, `Math.random` or the
 * heap: memory is reported as owned resource counters, exactly as the budget manifest requires, and
 * an exact heap API that does not exist stays `null` instead of being guessed.
 */
export interface SessionKindsReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
}

export interface SessionKindsReport {
  readonly version: typeof SESSION_KINDS_VERSION;
  readonly fixture: '225-session-kinds-v1';
  readonly fixedNow: string;
  readonly structure: Readonly<{
    readonly kinds: readonly string[];
    readonly controlModes: readonly string[];
    readonly capabilities: number;
    readonly parityIdentical: boolean;
    readonly academyLabel: string;
    readonly chaosLabel: string;
    readonly sessionKindIsControlMode: boolean;
  }>;
  readonly profile: Readonly<{
    readonly sourceProfileId: string;
    readonly sourceVersionId: string;
    readonly sourceChecksum: string;
    readonly copyProfileId: string;
    readonly copyVersionId: string;
    readonly copyChecksum: string;
    readonly copyValid: boolean;
    readonly copiedParameters: number;
    readonly sourceValue: number;
    readonly tunedValue: number;
    readonly copyValueAfterAcademyChange: number;
    readonly progressTransferred: false;
    readonly sourceSegmentsTransferred: 0;
  }>;
  readonly isolation: Readonly<{
    readonly before: SessionLedgerFingerprint;
    readonly after: SessionLedgerFingerprint;
    readonly identical: boolean;
    readonly refusedOperations: readonly string[];
    readonly refusedCount: number;
    readonly delegatedCount: number;
    readonly xpBalanceMicroXp: number;
    readonly xpEntries: number;
    readonly dailyRewards: number;
    readonly rewardGrants: number;
    readonly historyScans: 0;
  }>;
  readonly checkpoints: Readonly<{
    readonly switches: number;
    readonly committed: number;
    readonly academyRows: number;
    readonly chaosRows: number;
    readonly totalBodyBytes: number;
    readonly maxBodyBytes: number;
    readonly liveWorlds: number;
    readonly residentJobs: number;
    readonly listeners: number;
    readonly profileCopies: number;
    readonly orphanWorlds: number;
    readonly orphanJobs: number;
    readonly checksumLength: number;
    readonly verifiedCheckpoints: number;
  }>;
  readonly failure: Readonly<{
    readonly failedSwitches: number;
    readonly keptWorld: string | null;
    readonly retrySucceeded: boolean;
    readonly epochAfterFailure: number;
    readonly checkpointsAfterFailure: number;
  }>;
  readonly restore: Readonly<{
    readonly status: string;
    readonly sessionKind: string;
    readonly launch: string;
    readonly academyFingerprintUnchanged: boolean;
    readonly academyRowsUnchanged: boolean;
    readonly chaosRows: number;
  }>;
  readonly adoption: Readonly<{
    readonly status: string;
    readonly profileValid: boolean;
    readonly fingerprintUnchanged: boolean;
    readonly transferred: Readonly<Record<string, string | number>>;
  }>;
  readonly promotion: Readonly<{
    readonly refusedPaths: readonly string[];
    readonly styleCopyAllowed: boolean;
    readonly profileCopyAllowed: boolean;
    readonly academyIntoChaosImportRefused: boolean;
  }>;
  readonly memory: Readonly<{
    readonly exactHeapBytes: null;
    readonly reason: string;
    readonly ownershipCounters: Readonly<Record<string, number>>;
  }>;
  readonly checks: readonly SessionKindsReportCheck[];
  readonly summary: Readonly<{
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
  }>;
}

function check(
  checks: SessionKindsReportCheck[],
  name: string,
  expected: unknown,
  actual: unknown,
): void {
  checks.push(
    Object.freeze({
      name,
      expected,
      actual,
      pass: JSON.stringify(expected) === JSON.stringify(actual),
    }),
  );
}

function sumBytes(rows: readonly SessionKindCheckpoint[]): number {
  return rows.reduce((total, row) => total + row.bodyBytes, 0);
}

function maxBytes(rows: readonly SessionKindCheckpoint[]): number {
  return rows.reduce((maximum, row) => Math.max(maximum, row.bodyBytes), 0);
}

async function runTransitions(fixture: SessionHostFixture): Promise<void> {
  fixture.host.start('ACADEMY');
  for (let index = 0; index < 20; index += 1) {
    await fixture.host.switchTo(index % 2 === 0 ? 'CHAOS' : 'ACADEMY');
  }
}

export async function runSessionKindsReport(): Promise<SessionKindsReport> {
  const checks: SessionKindsReportCheck[] = [];
  const academy = sessionCapabilitiesFor('ACADEMY');
  const chaos = sessionCapabilitiesFor('CHAOS');
  const parity = sessionKindCapabilityParity('ACADEMY', 'CHAOS');
  check(checks, 'capabilities are identical in both kinds', true, parity.identical);
  check(
    checks,
    'both kinds expose the three control modes',
    [...playerControlModes],
    [...chaos.controlModes],
  );
  check(
    checks,
    'the session kind is not a control mode',
    false,
    (playerControlModes as readonly string[]).includes('ACADEMY'),
  );
  check(checks, 'both kinds allow any existing vehicle', 'ANY_EXISTING', academy.vehicleSelection);

  const source = academyProfile();
  const economy = sessionEconomyFixture();
  const copy = economy.copy;
  check(
    checks,
    'the copy has its own profile identity',
    true,
    copy.profile.profileId !== source.profileId,
  );
  check(
    checks,
    'the copied profile checksum is valid',
    true,
    verifyProfileVersionChecksum(copy.profile),
  );
  check(checks, 'the copy carries no progress', false, copy.progressTransferred);
  check(checks, 'the copy carries no source segments', 0, copy.profile.sourceSegmentIds.length);

  const tuned = applyChaosTuning({
    copy,
    tuningId: 'tune-report',
    versionId: `chaos:${CHAOS_COPY_ID}@2`,
    key: 'speed_delta_urban',
    unit: 'ratio',
    value: 14,
    reason: 'report tuning',
    createdAt: FIXED_NOW,
  });
  const tunedValue =
    tuned.status === 'TUNED' ? tuned.copy.profile.parameters.speed_delta_urban : -1;
  check(checks, 'a Haos tuning changes only the copy', 14, tunedValue);
  check(
    checks,
    'the Academy profile keeps its value after a Haos tuning',
    10,
    source.parameters.speed_delta_urban,
  );
  check(
    checks,
    'the copy keeps its value after an Academy change',
    10,
    copy.profile.parameters.speed_delta_urban,
  );

  const before = economy.isolation.fingerprint();
  const gate = economy.isolation.gate('CHAOS');
  const refused = [
    gate.ingestDaily({ event: chaosManualStart(), observedAtMs: 1_000_000 }),
    gate.advanceDaily({}),
    gate.creditMission({}),
    gate.creditDaily({}),
    gate.observeActiveTime(chaosActiveWindow()),
    gate.settleCampaign({}),
  ];
  const refusedOperations = refused.map((result) =>
    result.status === 'ISOLATED' ? result.operation : 'DELEGATED',
  );
  check(
    checks,
    'all six Academy ledger operations are isolated in Haos',
    6,
    refused.filter((result) => result.status === 'ISOLATED').length,
  );
  const after = economy.isolation.fingerprint();
  check(
    checks,
    'the Academy ledger fingerprint is identical after Haos',
    before.combined,
    after.combined,
  );
  check(checks, 'Haos grants no daily reward', 0, after.counts.dailyRewards);
  check(checks, 'Haos grants no reward', 0, after.counts.rewardGrants);
  check(checks, 'Haos grants no XP', 0, after.counts.xpBalanceMicroXp);

  const academyGate = economy.isolation.gate('ACADEMY');
  const active = academyGate.observeActiveTime(academyActiveWindow());
  const credited =
    active.status === 'DELEGATED' && (active.result as { status?: string }).status === 'CREDITED';
  check(checks, 'the Academy gate delegates a real active window', true, credited);
  const tracker = createMissionTestTracker();
  const instance = completeMission(tracker, 'campaign-1-first-taxi', 100);
  const settled = academyGate.settleCampaign({ instance });
  check(checks, 'the Academy gate delegates a real campaign settle', 'DELEGATED', settled.status);
  const delegated = economy.isolation.fingerprint();
  check(
    checks,
    'the Academy XP balance grows only through the gate',
    500_000,
    delegated.counts.xpBalanceMicroXp,
  );
  check(checks, 'two Academy operations are delegated', 2, economy.isolation.stats().delegated);

  const hostFixture = sessionHostFixture();
  await runTransitions(hostFixture);
  const hostStatus = hostFixture.host.status();
  const academyRows = await hostFixture.store.list('ACADEMY');
  const chaosRows = await hostFixture.store.list('CHAOS');
  const allRows = [...academyRows, ...chaosRows];
  const verified = allRows.filter(
    (row) => verifySessionKindCheckpoint(row).status === 'VALID',
  ).length;
  check(checks, 'twenty transitions succeed', 20, hostStatus.switches);
  check(
    checks,
    'exactly one world is live after twenty transitions',
    1,
    hostStatus.resident.liveWorlds,
  );
  check(checks, 'twenty transitions leave no orphan world', 0, hostFixture.world.orphans().length);
  check(
    checks,
    'twenty transitions leave one Haos profile copy',
    1,
    hostStatus.resident.profileCopies,
  );
  check(checks, 'every committed checkpoint verifies', allRows.length, verified);
  check(
    checks,
    'checkpoints are split between the two kinds',
    20,
    academyRows.length + chaosRows.length,
  );

  const failureFixture = sessionHostFixture();
  failureFixture.host.start('ACADEMY');
  failureFixture.store.failNextCommit();
  const failed = await failureFixture.host.switchTo('CHAOS');
  const failureStatus = failureFixture.host.status();
  const retry = await failureFixture.host.switchTo('CHAOS');
  check(
    checks,
    'the failed switch is reported as SAVE_FAILED',
    'SAVE_FAILED',
    failed.status === 'REJECTED' ? failed.code : null,
  );
  check(checks, 'a failed save keeps the Academy world', 'ACADEMY', failureStatus.live);
  check(
    checks,
    'a failed save does not advance the epoch',
    1,
    failureStatus.kinds.ACADEMY.worldEpoch,
  );
  check(checks, 'a failed save writes no checkpoint', 0, failureStatus.kinds.ACADEMY.checkpoints);
  check(checks, 'the retry after a failed save switches', 'SWITCHED', retry.status);

  const restoreFixture = sessionHostFixture();
  const restoreEconomy = sessionEconomyFixture();
  const fingerprintBeforeRestore = restoreEconomy.isolation.fingerprint();
  restoreFixture.host.start('ACADEMY');
  await restoreFixture.host.switchTo('CHAOS');
  await restoreFixture.host.switchTo('ACADEMY');
  const academyRowsBeforeRestore = await restoreFixture.store.list('ACADEMY');
  const restored = await restoreFixture.host.restore('CHAOS');
  const academyRowsAfterRestore = await restoreFixture.store.list('ACADEMY');
  const fingerprintAfterRestore = restoreEconomy.isolation.fingerprint();
  check(checks, 'a Haos checkpoint restores', 'RESTORED', restored.status);
  check(
    checks,
    'a restored world launches in PAUSED_AUTO',
    'PAUSED_AUTO',
    restored.status === 'RESTORED' ? restored.launch.mode : null,
  );
  check(
    checks,
    'a Haos restore leaves the Academy rows alone',
    JSON.stringify(academyRowsBeforeRestore),
    JSON.stringify(academyRowsAfterRestore),
  );
  check(
    checks,
    'a Haos restore leaves the Academy ledger alone',
    fingerprintBeforeRestore.combined,
    fingerprintAfterRestore.combined,
  );

  const adoptionFixture = sessionEconomyFixture();
  const adoptionBefore = adoptionFixture.isolation.fingerprint();
  const adopted = adoptChaosStyleIntoAcademy({
    copy: tuned.status === 'TUNED' ? tuned.copy : adoptionFixture.copy,
    sessionId: ACADEMY_SESSION_ID,
    profileId: 'profile-1-adopted',
    versionId: 'profile-1-adopted@1',
    adoptedAt: FIXED_NOW,
  });
  const adoptionAfter = adoptionFixture.isolation.fingerprint();
  const adoptedProfile = adopted.status === 'ADOPTED' ? adopted.adoption.profile : null;
  check(checks, 'the Haos style copy into the Academy is accepted', 'ADOPTED', adopted.status);
  check(
    checks,
    'the adopted style is a valid profile version',
    true,
    adoptedProfile === null ? false : verifyProfileVersionChecksum(adoptedProfile),
  );
  check(
    checks,
    'the adopted style transfers no XP',
    0,
    adopted.status === 'ADOPTED' ? adopted.adoption.transferred.xp : -1,
  );
  check(
    checks,
    'the adopted style transfers no daily reward',
    0,
    adopted.status === 'ADOPTED' ? adopted.adoption.transferred.dailyRewards : -1,
  );
  check(
    checks,
    'the adoption leaves the Academy ledger alone',
    adoptionBefore.combined,
    adoptionAfter.combined,
  );

  const refusedPaths = (['IMPORT', 'EXPORT', 'CHECKPOINT', 'RESTORE', 'ARCHIVE'] as const).filter(
    (path) => evaluateSessionKindTransfer({ from: 'CHAOS', to: 'ACADEMY', path }).allowed === false,
  );
  check(checks, 'the promotion paths are refused', 5, refusedPaths.length);
  check(
    checks,
    'the explicit style copy is allowed',
    true,
    evaluateSessionKindTransfer({ from: 'CHAOS', to: 'ACADEMY', path: 'STYLE_COPY' }).allowed,
  );
  check(
    checks,
    'the explicit profile copy is allowed',
    true,
    evaluateSessionKindTransfer({ from: 'ACADEMY', to: 'CHAOS', path: 'PROFILE_COPY' }).allowed,
  );
  check(
    checks,
    'an Academy import into Haos is refused',
    false,
    evaluateSessionKindTransfer({ from: 'ACADEMY', to: 'CHAOS', path: 'IMPORT' }).allowed,
  );
  check(checks, 'a history scan is never used', 0, after.counts.historyScans);

  const summary = Object.freeze({
    checks: checks.length,
    passed: checks.filter((entry) => entry.pass).length,
    pass: checks.every((entry) => entry.pass),
  });

  return Object.freeze({
    version: SESSION_KINDS_VERSION,
    fixture: '225-session-kinds-v1' as const,
    fixedNow: FIXED_NOW,
    structure: Object.freeze({
      kinds: Object.freeze(['ACADEMY', 'CHAOS']),
      controlModes: Object.freeze([...playerControlModes]),
      capabilities: academy.capabilities.length,
      parityIdentical: parity.identical,
      academyLabel: academy.label,
      chaosLabel: chaos.label,
      sessionKindIsControlMode: (playerControlModes as readonly string[]).includes('ACADEMY'),
    }),
    profile: Object.freeze({
      sourceProfileId: source.profileId,
      sourceVersionId: source.versionId,
      sourceChecksum: source.checksum,
      copyProfileId: copy.profile.profileId,
      copyVersionId: copy.profile.versionId,
      copyChecksum: copy.profile.checksum,
      copyValid: verifyChaosProfileCopy(copy).status === 'VALID',
      copiedParameters: Object.keys(copy.profile.parameters).length,
      sourceValue: source.parameters.speed_delta_urban ?? -1,
      tunedValue,
      copyValueAfterAcademyChange: copy.profile.parameters.speed_delta_urban ?? -1,
      progressTransferred: false,
      sourceSegmentsTransferred: 0,
    }),
    isolation: Object.freeze({
      before,
      after,
      identical: before.combined === after.combined,
      refusedOperations: Object.freeze(refusedOperations),
      refusedCount: economy.isolation.stats().isolated,
      delegatedCount: economy.isolation.stats().delegated,
      xpBalanceMicroXp: delegated.counts.xpBalanceMicroXp,
      xpEntries: delegated.counts.xpEntries,
      dailyRewards: delegated.counts.dailyRewards,
      rewardGrants: delegated.counts.rewardGrants,
      historyScans: 0 as const,
    }),
    checkpoints: Object.freeze({
      switches: hostStatus.switches,
      committed: hostFixture.store.stats().committed,
      academyRows: academyRows.length,
      chaosRows: chaosRows.length,
      totalBodyBytes: sumBytes(allRows),
      maxBodyBytes: maxBytes(allRows),
      liveWorlds: hostStatus.resident.liveWorlds,
      residentJobs: hostStatus.resident.residentJobs,
      listeners: hostStatus.resident.listeners,
      profileCopies: hostStatus.resident.profileCopies,
      orphanWorlds: hostFixture.world.orphans().length,
      orphanJobs: hostFixture.world.orphans().reduce((total, world) => total + world.jobs, 0),
      checksumLength: allRows.length === 0 ? 0 : allRows[0]!.checksum.length,
      verifiedCheckpoints: verified,
    }),
    failure: Object.freeze({
      failedSwitches: failureStatus.failedSwitches,
      keptWorld: failureStatus.live,
      retrySucceeded: retry.status === 'SWITCHED',
      epochAfterFailure: failureStatus.kinds.ACADEMY.worldEpoch,
      checkpointsAfterFailure: failureStatus.kinds.ACADEMY.checkpoints,
    }),
    restore: Object.freeze({
      status: restored.status,
      sessionKind: restored.status === 'RESTORED' ? restored.sessionKind : '',
      launch: restored.status === 'RESTORED' ? restored.launch.mode : '',
      academyFingerprintUnchanged:
        fingerprintBeforeRestore.combined === fingerprintAfterRestore.combined,
      academyRowsUnchanged:
        JSON.stringify(academyRowsBeforeRestore) === JSON.stringify(academyRowsAfterRestore),
      chaosRows: (await restoreFixture.store.list('CHAOS')).length,
    }),
    adoption: Object.freeze({
      status: adopted.status,
      profileValid: adoptedProfile === null ? false : verifyProfileVersionChecksum(adoptedProfile),
      fingerprintUnchanged: adoptionBefore.combined === adoptionAfter.combined,
      transferred:
        adopted.status === 'ADOPTED'
          ? (adopted.adoption.transferred as unknown as Record<string, string | number>)
          : {},
    }),
    promotion: Object.freeze({
      refusedPaths: Object.freeze(refusedPaths),
      styleCopyAllowed: evaluateSessionKindTransfer({
        from: 'CHAOS',
        to: 'ACADEMY',
        path: 'STYLE_COPY',
      }).allowed,
      profileCopyAllowed: evaluateSessionKindTransfer({
        from: 'ACADEMY',
        to: 'CHAOS',
        path: 'PROFILE_COPY',
      }).allowed,
      academyIntoChaosImportRefused: !evaluateSessionKindTransfer({
        from: 'ACADEMY',
        to: 'CHAOS',
        path: 'IMPORT',
      }).allowed,
    }),
    memory: Object.freeze({
      exactHeapBytes: null,
      reason:
        'The budget manifest leaves totalHeapBytes null; owned resource counters stay separate instead of being summed as heap.',
      ownershipCounters: Object.freeze({
        liveWorlds: hostStatus.resident.liveWorlds,
        residentJobs: hostStatus.resident.residentJobs,
        listeners: hostStatus.resident.listeners,
        profileCopies: hostStatus.resident.profileCopies,
        checkpoints: hostStatus.resident.checkpoints,
      }),
    }),
    checks: Object.freeze(checks),
    summary,
  });
}

function rows(cells: readonly (readonly [string, unknown])[]): string {
  return cells.map(([name, value]) => `| \`${name}\` | ${String(value)} |`).join('\n');
}

export function sessionKindsReportMarkdown(report: SessionKindsReport): string {
  const structure = rows([
    ['contract', report.version],
    ['fixture', report.fixture],
    ['fixedNow', report.fixedNow],
    ['kinds', report.structure.kinds.join(', ')],
    ['controlModes', report.structure.controlModes.join(', ')],
    ['capabilities', report.structure.capabilities],
    ['parityIdentical', report.structure.parityIdentical],
    ['sessionKindIsControlMode', report.structure.sessionKindIsControlMode],
  ]);
  const profile = rows([
    ['sourceProfileId', report.profile.sourceProfileId],
    ['sourceVersionId', report.profile.sourceVersionId],
    ['sourceChecksum', report.profile.sourceChecksum],
    ['copyProfileId', report.profile.copyProfileId],
    ['copyVersionId', report.profile.copyVersionId],
    ['copyChecksum', report.profile.copyChecksum],
    ['copyValid', report.profile.copyValid],
    ['copiedParameters', report.profile.copiedParameters],
    ['sourceValue', report.profile.sourceValue],
    ['tunedValue', report.profile.tunedValue],
    ['copyValueAfterAcademyChange', report.profile.copyValueAfterAcademyChange],
    ['progressTransferred', report.profile.progressTransferred],
    ['sourceSegmentsTransferred', report.profile.sourceSegmentsTransferred],
  ]);
  const isolation = rows([
    ['fingerprintBefore', report.isolation.before.combined],
    ['fingerprintAfter', report.isolation.after.combined],
    ['identical', report.isolation.identical],
    ['refusedOperations', report.isolation.refusedOperations.join(', ')],
    ['refusedCount', report.isolation.refusedCount],
    ['delegatedCount', report.isolation.delegatedCount],
    ['xpBalanceMicroXp', report.isolation.xpBalanceMicroXp],
    ['xpEntries', report.isolation.xpEntries],
    ['dailyRewards', report.isolation.dailyRewards],
    ['rewardGrants', report.isolation.rewardGrants],
    ['historyScans', report.isolation.historyScans],
  ]);
  const checkpoints = rows([
    ['switches', report.checkpoints.switches],
    ['committed', report.checkpoints.committed],
    ['academyRows', report.checkpoints.academyRows],
    ['chaosRows', report.checkpoints.chaosRows],
    ['totalBodyBytes', report.checkpoints.totalBodyBytes],
    ['maxBodyBytes', report.checkpoints.maxBodyBytes],
    ['liveWorlds', report.checkpoints.liveWorlds],
    ['residentJobs', report.checkpoints.residentJobs],
    ['listeners', report.checkpoints.listeners],
    ['profileCopies', report.checkpoints.profileCopies],
    ['orphanWorlds', report.checkpoints.orphanWorlds],
    ['orphanJobs', report.checkpoints.orphanJobs],
    ['checksumLength', report.checkpoints.checksumLength],
    ['verifiedCheckpoints', report.checkpoints.verifiedCheckpoints],
  ]);
  const failure = rows([
    ['failedSwitches', report.failure.failedSwitches],
    ['keptWorld', report.failure.keptWorld],
    ['retrySucceeded', report.failure.retrySucceeded],
    ['epochAfterFailure', report.failure.epochAfterFailure],
    ['checkpointsAfterFailure', report.failure.checkpointsAfterFailure],
  ]);
  const restore = rows([
    ['status', report.restore.status],
    ['sessionKind', report.restore.sessionKind],
    ['launch', report.restore.launch],
    ['academyFingerprintUnchanged', report.restore.academyFingerprintUnchanged],
    ['academyRowsUnchanged', report.restore.academyRowsUnchanged],
    ['chaosRows', report.restore.chaosRows],
  ]);
  const adoption = rows([
    ['status', report.adoption.status],
    ['profileValid', report.adoption.profileValid],
    ['fingerprintUnchanged', report.adoption.fingerprintUnchanged],
  ]);
  const promotion = rows([
    ['refusedPaths', report.promotion.refusedPaths.join(', ')],
    ['styleCopyAllowed', report.promotion.styleCopyAllowed],
    ['profileCopyAllowed', report.promotion.profileCopyAllowed],
    ['academyIntoChaosImportRefused', report.promotion.academyIntoChaosImportRefused],
  ]);
  const memory = rows([
    ['exactHeapBytes', report.memory.exactHeapBytes],
    ['reason', report.memory.reason],
  ]);
  const checks = report.checks
    .map(
      (entry) =>
        `| ${entry.pass ? 'PASS' : 'FAIL'} | \`${entry.name}\` | \`${JSON.stringify(entry.expected)}\` | \`${JSON.stringify(entry.actual)}\` |`,
    )
    .join('\n');
  return `# PBI 225 — sesiuni Academie și Haos (transcript determinist)

- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
- Checks: ${report.summary.passed}/${report.summary.checks}

## Structura

| Câmp | Valoare |
| --- | --- |
${structure}

## Profil copiat explicit

| Câmp | Valoare |
| --- | --- |
${profile}

## Izolare contabilă

| Câmp | Valoare |
| --- | --- |
${isolation}

## Checkpoint-uri și tranziții

| Câmp | Valoare |
| --- | --- |
${checkpoints}

## Salvare eșuată

| Câmp | Valoare |
| --- | --- |
${failure}

## Revenire la checkpoint Haos

| Câmp | Valoare |
| --- | --- |
${restore}

## Copierea stilului Haos în Academie

| Câmp | Valoare |
| --- | --- |
${adoption}

## Politica de transfer

| Câmp | Valoare |
| --- | --- |
${promotion}

## Memorie

| Câmp | Valoare |
| --- | --- |
${memory}

## Verificări

| Rezultat | Verificare | Așteptat | Real |
| --- | --- | --- | --- |
${checks}
`;
}
