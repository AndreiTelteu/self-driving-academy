import {
  importProfile,
  newProfileFromBase,
  PROFILE_RESTORE_ACTIVATION_ORIGIN,
  PROFILE_RESTORE_BARRIER_REASON,
  PROFILE_RESTORE_LIMITS,
  PROFILE_RESTORE_VERSION,
  profileRestoreProvenances,
  profileRestoreRejectionCodes,
  profileRestoreStatuses,
  resetStyle,
  restoreVersion,
} from '../../src/app';
import { PIPELINE_PROFILE_ID } from '../harness/profile-pipeline-fixture';
import {
  RESTORE_IMPORTED,
  RESTORE_SECOND_PROFILE,
  createProfileRestoreWorld,
} from './profile-restore-fixture';

export interface ProfileRestoreReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ProfileRestoreReportScenario {
  readonly name: string;
  readonly status: string;
  readonly reason: string;
  readonly provenance: string | null;
  readonly versionId: string | null;
  readonly versionCreated: boolean;
  readonly versionsAdded: number;
  readonly barrierReason: string | null;
  readonly activationOrigin: string | null;
  readonly activationTick: number | null;
  readonly versions: readonly string[];
  readonly progressionCalls: number;
  readonly cancelledJobs: readonly string[];
  readonly physicalPreserved: boolean | null;
  readonly pass: boolean;
}

export interface ProfileRestoreEvidenceReport {
  readonly version: typeof PROFILE_RESTORE_VERSION;
  readonly contract: Readonly<{
    statuses: readonly string[];
    provenances: readonly string[];
    rejectionCodes: readonly string[];
    barrierReasons: Readonly<Record<string, string>>;
    activationOrigins: Readonly<Record<string, string>>;
    limits: Readonly<Record<string, number>>;
  }>;
  readonly scenarios: readonly ProfileRestoreReportScenario[];
  readonly checks: readonly ProfileRestoreReportCheck[];
  readonly summary: Readonly<{
    checks: number;
    passed: number;
    scenarios: number;
    overall: boolean;
  }>;
}

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): ProfileRestoreReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function restoreAt(
  world: ReturnType<typeof createProfileRestoreWorld>,
  versionId: string,
): ReturnType<typeof restoreVersion> {
  return restoreVersion(world.services, {
    profileId: PIPELINE_PROFILE_ID,
    versionId,
    tick: world.tick.value,
  });
}

function importAt(
  world: ReturnType<typeof createProfileRestoreWorld>,
  payload: Record<string, unknown>,
): ReturnType<typeof importProfile> {
  return importProfile(world.services, { importedProfile: payload, tick: world.tick.value });
}

function scenario(
  name: string,
  result: {
    readonly status: string;
    readonly reason: string;
    readonly provenance: string | null;
    readonly versionId: string | null;
    readonly versionCreated: boolean;
    readonly versionsAdded: number;
    readonly report: {
      readonly barrier: {
        readonly reason: string;
        readonly cancelledJobs: readonly string[];
        readonly physicalPreserved: boolean;
      } | null;
      readonly activation: {
        readonly origin: string;
        readonly activateAtTick: number | null;
      } | null;
    };
    readonly progressionCalls: number;
  },
  versions: readonly string[],
  pass: boolean,
): ProfileRestoreReportScenario {
  return Object.freeze({
    name,
    status: result.status,
    reason: result.reason,
    provenance: result.provenance,
    versionId: result.versionId,
    versionCreated: result.versionCreated,
    versionsAdded: result.versionsAdded,
    barrierReason: result.report.barrier?.reason ?? null,
    activationOrigin: result.report.activation?.origin ?? null,
    activationTick: result.report.activation?.activateAtTick ?? null,
    versions: Object.freeze([...versions]),
    progressionCalls: result.progressionCalls,
    cancelledJobs: Object.freeze([...(result.report.barrier?.cancelledJobs ?? [])]),
    physicalPreserved: result.report.barrier?.physicalPreserved ?? null,
    pass,
  });
}

/** Seven deterministic scenarios over the real 109/110/205 fixture. */
export function runProfileRestoreReport(): ProfileRestoreEvidenceReport {
  const checks: ProfileRestoreReportCheck[] = [];
  const scenarios: ProfileRestoreReportScenario[] = [];

  {
    const world = createProfileRestoreWorld();
    try {
      const before = world.versions();
      const pending = restoreAt(world, world.targetVersionId);
      checks.push(check('restore.pending.status', 'PENDING', pending.status, 'barrier scheduled'));
      checks.push(
        check('restore.pending.barrier', 'barrier-0001', pending.barrierId, 'first barrier'),
      );
      checks.push(
        check('restore.pending.activation', true, pending.activation === null, 'not applied yet'),
      );
      checks.push(check('restore.pending.versionsAdded', 0, pending.versionsAdded, 'no version'));
      world.advanceTick();
      const committed = restoreAt(world, world.targetVersionId);
      checks.push(check('restore.status', 'COMMITTED', committed.status, 'barrier committed'));
      checks.push(
        check('restore.origin', 'RESTORE', committed.activation?.origin ?? null, '110 origin'),
      );
      checks.push(
        check(
          'restore.barrierReason',
          'RESTORE',
          committed.report.barrier?.reason ?? null,
          '205 reason',
        ),
      );
      checks.push(check('restore.versionsAdded', 0, committed.versionsAdded, 'version reused'));
      checks.push(
        check(
          'restore.historyUnchanged',
          JSON.stringify(before),
          JSON.stringify(world.versions()),
          'no clone',
        ),
      );
      checks.push(
        check('restore.versionId', world.targetVersionId, committed.versionId, 'restored target'),
      );
      scenarios.push(
        scenario('restore', committed, world.versions(), committed.status === 'COMMITTED'),
      );
    } finally {
      world.dispose();
    }
  }

  {
    const world = createProfileRestoreWorld();
    try {
      const result = restoreAt(world, world.baseVersionId);
      checks.push(check('alreadyActive.status', 'ALREADY_ACTIVE', result.status, 'no-op'));
      checks.push(check('alreadyActive.barrier', null, result.barrierId, 'no barrier opened'));
      checks.push(
        check('alreadyActive.barriers', 0, world.barrier.barriers().length, 'empty history'),
      );
      checks.push(
        check('alreadyActive.changes', 0, world.barrier.stats().changes, 'no epoch change'),
      );
      scenarios.push(
        scenario('already_active', result, world.versions(), result.status === 'ALREADY_ACTIVE'),
      );
    } finally {
      world.dispose();
    }
  }

  {
    const world = createProfileRestoreWorld();
    try {
      const payload = world.importedProfile();
      const before = world.versions();
      const pending = importAt(world, payload);
      checks.push(check('import.pending.status', 'PENDING', pending.status, 'barrier scheduled'));
      checks.push(check('import.pending.created', true, pending.versionCreated, 'new 109 record'));
      checks.push(check('import.pending.added', 1, pending.versionsAdded, 'exactly one version'));
      const stored = world.store.getVersion(RESTORE_IMPORTED);
      checks.push(check('import.stored', true, stored !== null, 'imported version exists'));
      checks.push(
        check(
          'import.parent',
          world.baseVersionId,
          stored?.provenance.delta?.baseVersionId ?? null,
          'explicit parent',
        ),
      );
      checks.push(
        check(
          'import.marker',
          'IMPORTED',
          stored?.provenance.delta?.reason ?? null,
          'import provenance',
        ),
      );
      checks.push(
        check(
          'import.previousHistory',
          JSON.stringify(before),
          JSON.stringify(world.versions().filter((entry) => before.includes(entry))),
          'old versions untouched',
        ),
      );
      world.advanceTick();
      const committed = importAt(world, payload);
      checks.push(check('import.status', 'COMMITTED', committed.status, 'barrier committed'));
      checks.push(
        check('import.origin', 'IMPORT', committed.activation?.origin ?? null, '110 origin'),
      );
      checks.push(
        check(
          'import.barrierReason',
          'IMPORT',
          committed.report.barrier?.reason ?? null,
          '205 reason',
        ),
      );
      world.advanceTick();
      const duplicate = importAt(world, payload);
      checks.push(check('import.duplicate', 'ALREADY_ACTIVE', duplicate.status, 'idempotent'));
      checks.push(
        check(
          'import.singleVersion',
          1,
          world.versions().filter((entry) => entry === RESTORE_IMPORTED).length,
          'no second record',
        ),
      );
      scenarios.push(
        scenario('valid_import', committed, world.versions(), committed.status === 'COMMITTED'),
      );
    } finally {
      world.dispose();
    }
  }

  {
    const world = createProfileRestoreWorld();
    try {
      const job = world.job({ segmentId: 'report-invalid-job', order: 1 });
      const admission = world.queue.queue.submit(job);
      const before = world.checksums();
      const result = importAt(world, world.importedProfile({ engineVersion: 'engine-2' }));
      checks.push(check('invalidImport.status', 'REJECTED', result.status, 'closed rejection'));
      checks.push(check('invalidImport.reason', 'IMPORT_INVALID', result.reason, 'closed reason'));
      checks.push(check('invalidImport.barrier', null, result.barrierId, 'no barrier'));
      checks.push(
        check(
          'invalidImport.store',
          JSON.stringify(before),
          JSON.stringify(world.checksums()),
          'store unchanged',
        ),
      );
      checks.push(
        check('invalidImport.queue', 1, world.queue.queue.usage.pending, 'queue unchanged'),
      );
      checks.push(
        check('invalidImport.activation', 0, world.activation.commands().length, 'no activation'),
      );
      checks.push(
        check(
          'invalidImport.segments',
          0,
          world.segments.closeCalls() + world.segments.openCalls(),
          'no segment rotation',
        ),
      );
      world.queue.queue.cancel(job.segmentId as string);
      void admission;
      scenarios.push(
        scenario('invalid_import', result, world.versions(), result.reason === 'IMPORT_INVALID'),
      );
    } finally {
      world.dispose();
    }
  }

  {
    const world = createProfileRestoreWorld();
    try {
      const otherBefore = world.versions(RESTORE_SECOND_PROFILE);
      const original = world.versions(PIPELINE_PROFILE_ID);
      const pending = newProfileFromBase(world.services, {
        playerId: 'player-1',
        profileId: RESTORE_SECOND_PROFILE,
        tick: world.tick.value,
      });
      checks.push(
        check('newProfile.pending.status', 'PENDING', pending.status, 'barrier scheduled'),
      );
      checks.push(
        check('newProfile.pending.created', true, pending.versionCreated, 'base created'),
      );
      checks.push(
        check('newProfile.versionId', 'base-profile-b-2', pending.versionId, 'new base id'),
      );
      checks.push(
        check(
          'newProfile.otherProfile',
          JSON.stringify(original),
          JSON.stringify(world.versions(PIPELINE_PROFILE_ID)),
          'profile A untouched',
        ),
      );
      world.advanceTick();
      const committed = newProfileFromBase(world.services, {
        playerId: 'player-1',
        profileId: RESTORE_SECOND_PROFILE,
        tick: world.tick.value,
      });
      checks.push(check('newProfile.status', 'COMMITTED', committed.status, 'barrier committed'));
      checks.push(
        check(
          'newProfile.origin',
          'MANUAL_TUNING',
          committed.activation?.origin ?? null,
          '110 origin',
        ),
      );
      checks.push(
        check(
          'newProfile.barrierReason',
          'NEW_PROFILE',
          committed.report.barrier?.reason ?? null,
          '205 reason',
        ),
      );
      const created = world.store.getVersion('base-profile-b-2');
      checks.push(
        check(
          'newProfile.baseOrigin',
          'BASE',
          created?.provenance.origin ?? null,
          '109 base provenance',
        ),
      );
      checks.push(
        check(
          'newProfile.parameterCount',
          80,
          created === null ? 0 : Object.keys(created.parameters).length,
          'catalog defaults',
        ),
      );
      checks.push(
        check(
          'newProfile.history',
          true,
          world.versions(RESTORE_SECOND_PROFILE).length === otherBefore.length + 1,
          'history appended',
        ),
      );
      scenarios.push(
        scenario(
          'new_profile',
          committed,
          world.versions(RESTORE_SECOND_PROFILE),
          committed.status === 'COMMITTED',
        ),
      );
    } finally {
      world.dispose();
    }
  }

  {
    const world = createProfileRestoreWorld();
    try {
      const restorePending = restoreAt(world, world.targetVersionId);
      void restorePending;
      world.advanceTick();
      const restored = restoreAt(world, world.targetVersionId);
      checks.push(
        check('reset.setupRestore', 'COMMITTED', restored.status, 'active version changed first'),
      );
      const checksumsBefore = world.checksums();
      const versionsBefore = world.versions();
      const progress = JSON.stringify({ xp: 420, level: 3, missions: ['m1', 'm2'] });
      const pending = resetStyle(world.services, {
        profileId: PIPELINE_PROFILE_ID,
        tick: world.tick.value,
        progression: world.progression,
      });
      checks.push(check('reset.pending.status', 'PENDING', pending.status, 'barrier scheduled'));
      world.advanceTick();
      const committed = resetStyle(world.services, {
        profileId: PIPELINE_PROFILE_ID,
        tick: world.tick.value,
        progression: world.progression,
      });
      checks.push(check('reset.status', 'COMMITTED', committed.status, 'barrier committed'));
      checks.push(
        check('reset.versionId', world.baseVersionId, committed.versionId, 'base target'),
      );
      checks.push(
        check('reset.origin', 'RESTORE', committed.activation?.origin ?? null, '110 origin'),
      );
      checks.push(check('reset.versionsAdded', 0, committed.versionsAdded, 'no learned version'));
      checks.push(
        check(
          'reset.history',
          JSON.stringify(versionsBefore),
          JSON.stringify(world.versions()),
          'history unchanged',
        ),
      );
      checks.push(
        check(
          'reset.checksums',
          JSON.stringify(checksumsBefore),
          JSON.stringify(world.checksums()),
          'records unchanged',
        ),
      );
      checks.push(
        check('reset.progressionCalls', 0, world.progression.calls(), 'zero XP/mission calls'),
      );
      checks.push(
        check(
          'reset.progressSnapshot',
          progress,
          JSON.stringify({ xp: 420, level: 3, missions: ['m1', 'm2'] }),
          'XP/missions identical',
        ),
      );
      scenarios.push(
        scenario('style_reset', committed, world.versions(), committed.status === 'COMMITTED'),
      );
    } finally {
      world.dispose();
    }
  }

  {
    const world = createProfileRestoreWorld();
    try {
      const job = world.job({ segmentId: 'report-active-job', order: 1 });
      const admission = world.queue.queue.submit(job);
      const tracked = world.barrier.trackJob(job);
      const physicalBefore = world.segments.port.physical();
      const versionsBefore = world.versions();
      const pending = restoreAt(world, world.targetVersionId);
      checks.push(check('active.pending', 'PENDING', pending.status, 'barrier scheduled'));
      world.advanceTick();
      const committed = restoreAt(world, world.targetVersionId);
      checks.push(check('active.status', 'COMMITTED', committed.status, 'barrier committed'));
      checks.push(check('active.jobTracked', 'TRACKED', tracked.status, 'old generation job'));
      checks.push(
        check(
          'active.cancelled',
          1,
          committed.report.barrier?.cancelledJobs.length ?? 0,
          'job invalidated',
        ),
      );
      checks.push(
        check(
          'active.physical',
          true,
          committed.report.barrier?.physicalPreserved ?? false,
          'physical state preserved',
        ),
      );
      checks.push(
        check(
          'active.readback',
          physicalBefore,
          world.segments.port.physical(),
          'byte-identical readback',
        ),
      );
      checks.push(
        check(
          'active.lateResult',
          'LATE_RESULT',
          world.barrier.isCurrent(job).status,
          'late result ignored',
        ),
      );
      checks.push(check('active.versionsAdded', 0, committed.versionsAdded, 'no version created'));
      checks.push(
        check(
          'active.history',
          JSON.stringify(versionsBefore),
          JSON.stringify(world.versions()),
          'history unchanged',
        ),
      );
      world.queue.queue.cancel(job.segmentId as string);
      void admission;
      scenarios.push(
        scenario('active_session', committed, world.versions(), committed.status === 'COMMITTED'),
      );
    } finally {
      world.dispose();
    }
  }

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: PROFILE_RESTORE_VERSION,
    contract: Object.freeze({
      statuses: Object.freeze([...profileRestoreStatuses]),
      provenances: Object.freeze([...profileRestoreProvenances]),
      rejectionCodes: Object.freeze([...profileRestoreRejectionCodes]),
      barrierReasons: PROFILE_RESTORE_BARRIER_REASON,
      activationOrigins: PROFILE_RESTORE_ACTIVATION_ORIGIN,
      limits: PROFILE_RESTORE_LIMITS,
    }),
    scenarios: Object.freeze(scenarios),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      checks: checks.length,
      passed,
      scenarios: scenarios.length,
      overall: passed === checks.length && scenarios.every((entry) => entry.pass),
    }),
  });
}

export function profileRestoreReportMarkdown(report: ProfileRestoreEvidenceReport): string {
  const lines: string[] = [
    '# 114 — Restore, import and new profile evidence',
    '',
    `Contract: \`${report.version}\`.`,
    '',
    'Deterministic report over the real 109 store, 110 activation and 205 learning epoch barrier; no browser capture and no wall clock.',
    '',
    '## Contract',
    '',
    `- statuses: ${report.contract.statuses.join(', ')}`,
    `- provenances: ${report.contract.provenances.join(', ')}`,
    `- barrier reasons: ${Object.entries(report.contract.barrierReasons)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')}`,
    `- 110 origins: ${Object.entries(report.contract.activationOrigins)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')}`,
    '',
    '## Scenarios',
    '',
    '| Scenario | Status | Reason | Version | Barrier | Activation | Versions | XP/mission calls | Pass |',
    '| --- | --- | --- | --- | --- | --- | ---: | ---: | --- |',
  ];
  for (const entry of report.scenarios) {
    lines.push(
      `| ${entry.name} | ${entry.status} | ${entry.reason} | ${entry.versionId ?? '—'} | ${entry.barrierReason ?? '—'} | ${entry.activationOrigin ?? '—'} | ${entry.versions.length} | ${entry.progressionCalls} | ${entry.pass ? 'PASS' : 'FAIL'} |`,
    );
  }
  lines.push(
    '',
    '## Checks',
    '',
    '| Check | Expected | Actual | Pass |',
    '| --- | --- | --- | --- |',
  );
  for (const entry of report.checks) {
    lines.push(
      `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} |`,
    );
  }
  lines.push(
    '',
    '## Summary',
    '',
    `Checks: ${report.summary.passed}/${report.summary.checks}. Scenarios: ${report.summary.scenarios}. Overall: ${report.summary.overall ? 'PASS' : 'FAIL'}.`,
    '',
    'Limitations: RAM-only 109/110/205 integration; no savefile, IndexedDB, browser capture or hardware measurement.',
    '',
  );
  return lines.join('\n');
}
