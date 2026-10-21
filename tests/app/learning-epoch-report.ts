import {
  LEARNING_EPOCH_LIMITS,
  LEARNING_EPOCH_VERSION,
  learningBarrierStatuses,
  learningChangeReasons,
  learningEpochDecisionStatuses,
  learningEpochRejectionCodes,
  learningGenerationStatuses,
} from '../../src/app';
import { PIPELINE_BASE_VERSION, PIPELINE_PROFILE_ID } from '../harness/profile-pipeline-fixture';
import { createEpochWorld } from '../harness/learning-epoch-fixture';

/**
 * Deterministic report for PBI 205.
 *
 * Every scenario composes the real 103 queue (real 221 governor and 101/102 composition), the real
 * 109 store and the real 110 activation over the deterministic fleet fixture. Only the 069 segment
 * binding and the worker transport are injected ports: they report the segment identity and the
 * real 101 result, so no barrier rule is duplicated here.
 */
export interface LearningEpochScenario {
  readonly name: string;
  readonly status: string;
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
}

export interface LearningEpochCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LearningEpochReport {
  readonly version: typeof LEARNING_EPOCH_VERSION;
  readonly contract: Readonly<{
    changeReasons: readonly string[];
    generationStatuses: readonly string[];
    barrierStatuses: readonly string[];
    rejectionCodes: readonly string[];
    decisionStatuses: readonly string[];
    history: number;
    trackedJobs: number;
    seenResults: number;
  }>;
  readonly scenarios: readonly LearningEpochScenario[];
  readonly checks: readonly LearningEpochCheck[];
  readonly summary: Readonly<{
    scenarios: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

type ReportValue = string | number | boolean | null;

function check(name: string, expected: ReportValue, actual: ReportValue, detail: string) {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function scenario(name: string, status: string, detail: Record<string, ReportValue>) {
  return Object.freeze({ name, status, detail: Object.freeze(detail) });
}

export async function runLearningEpochReport(): Promise<LearningEpochReport> {
  const scenarios: LearningEpochScenario[] = [];
  const checks: LearningEpochCheck[] = [];

  checks.push(
    check('contract-version', '205-learning-epoch-v1', LEARNING_EPOCH_VERSION, 'barrier contract'),
    check('change-reasons', 3, learningChangeReasons.length, 'RESTORE, IMPORT, NEW_PROFILE'),
    check('generation-statuses', 3, learningGenerationStatuses.length, 'OPEN, CLOSED, CANCELLED'),
    check('barrier-statuses', 3, learningBarrierStatuses.length, 'PENDING, COMMITTED, ROLLED_BACK'),
    check('decision-statuses', 5, learningEpochDecisionStatuses.length, 'closed generation gate'),
    check('rejection-codes', 16, learningEpochRejectionCodes.length, 'closed rejection vocabulary'),
    check('history-limit', 16, LEARNING_EPOCH_LIMITS.history, 'bounded barrier history'),
    check('tracked-jobs-limit', 64, LEARNING_EPOCH_LIMITS.trackedJobs, 'bounded job capture'),
  );

  // 1. Restore while a 103 job is still queued.
  const restore = createEpochWorld();
  try {
    const job = restore.job({ segmentId: 'restore-job', order: 1 });
    const admission = restore.queue.queue.submit(job);
    if (admission.status !== 'QUEUED' || admission.ticket === null)
      throw new Error(`Restore scenario did not queue its job: ${admission.status}`);
    restore.barrier.trackJob(job);
    const versionsBefore = restore.store.listVersions(PIPELINE_PROFILE_ID).length;
    const request = restore.barrier.requestChange({
      reason: 'RESTORE',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: restore.targetVersionId,
      importValid: true,
    });
    const pendingAtRequest = restore.barrier.pending() !== null;
    restore.advanceTick();
    const applied = restore.barrier.resolve();
    const outcome = await admission.ticket.outcome;
    const late = restore.barrier.isCurrent(job);
    const stats = restore.barrier.stats();
    scenarios.push(
      scenario('restore with an in-progress job', applied.status, {
        request: request.status,
        epoch: applied.generation.learningEpoch,
        baseVersionId: applied.generation.baseVersionId,
        segmentId: applied.generation.segmentId,
        cancelledJobs: applied.barrier?.cancelledJobs.join(',') ?? null,
        jobOutcome: outcome.status,
        lateResult: late.status,
        versions: restore.store.listVersions(PIPELINE_PROFILE_ID).length,
        activation: applied.barrier?.activationCommandId ?? null,
      }),
    );
    checks.push(
      check('restore-request', 'PENDING', request.status, 'the request waits for the tick'),
      check('restore-applied', 'APPLIED', applied.status, 'the barrier committed at the boundary'),
      check('restore-pending-at-request', true, pendingAtRequest, 'one pending barrier'),
      check('restore-epoch', 2, applied.generation.learningEpoch, 'epoch advanced by one'),
      check(
        'restore-base',
        restore.targetVersionId,
        applied.generation.baseVersionId,
        'the target is the new base',
      ),
      check(
        'restore-cancelled-job',
        'restore-job',
        applied.barrier?.cancelledJobs.join(',') ?? '',
        'the 103 job was cancelled',
      ),
      check('restore-job-outcome', 'cancelled', outcome.status, 'real 103 cancellation'),
      check('restore-late-result', 'LATE_RESULT', late.status, 'explicit late result'),
      check('restore-invalidated-jobs', 1, stats.invalidatedJobs, 'one invalidated job'),
      check(
        'restore-no-version',
        versionsBefore,
        restore.store.listVersions(PIPELINE_PROFILE_ID).length,
        'the barrier created no version',
      ),
      check('restore-changes', 1, stats.changes, 'one committed change'),
    );
  } finally {
    restore.dispose();
  }

  // 2. A validated import publishes the target for the next common tick.
  const imported = createEpochWorld();
  try {
    imported.barrier.requestChange({
      reason: 'IMPORT',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: imported.targetVersionId,
      importValid: true,
    });
    imported.advanceTick();
    const applied = imported.barrier.resolve();
    const pending = imported.activation.pending();
    const fleetBefore = imported.fleetVersions().join(',');
    imported.advanceTick();
    const report = imported.activation.applyAt(imported.tick.value);
    scenarios.push(
      scenario('valid import', applied.status, {
        reason: applied.barrier?.reason ?? null,
        epoch: applied.generation.learningEpoch,
        activationCommand: applied.barrier?.activationCommandId ?? null,
        activationTick: pending?.activateAtTick ?? null,
        origin: imported.activation.commands()[0]?.origin ?? null,
        fleetBefore,
        fleetAfter: imported.fleetVersions().join(','),
        appliedAt: report.appliedTick,
      }),
    );
    checks.push(
      check('import-applied', 'APPLIED', applied.status, 'the import committed'),
      check('import-reason', 'IMPORT', applied.barrier?.reason ?? '', 'explicit import reason'),
      check(
        'import-command',
        'activation-0001',
        applied.barrier?.activationCommandId ?? '',
        'one real 110 command',
      ),
      check('import-activate-tick', 2, pending?.activateAtTick ?? -1, 'next common tick'),
      check(
        'import-origin',
        'IMPORT',
        imported.activation.commands()[0]?.origin ?? '',
        '110 origin',
      ),
      check(
        'import-fleet-before',
        PIPELINE_BASE_VERSION,
        fleetBefore,
        'not applied before the tick',
      ),
      check(
        'import-fleet-after',
        'profile-v2',
        imported.fleetVersions().join(','),
        'fleet adopted it',
      ),
      check('import-applied-tick', 2, report.appliedTick, 'common tick of the activation'),
    );
  } finally {
    imported.dispose();
  }

  // 3. An invalid import never opens the barrier.
  const invalid = createEpochWorld();
  try {
    const job = invalid.job({ segmentId: 'invalid-job', order: 1 });
    if (invalid.queue.queue.submit(job).status !== 'QUEUED')
      throw new Error('Invalid import scenario did not queue its job');
    const rejected = invalid.barrier.requestChange({
      reason: 'IMPORT',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: invalid.targetVersionId,
      importValid: false,
    });
    scenarios.push(
      scenario('invalid import', rejected.status, {
        code: rejected.code,
        barriers: invalid.barrier.barriers().length,
        pending: invalid.barrier.pending() !== null,
        epoch: invalid.barrier.current().learningEpoch,
        segment: invalid.barrier.current().segmentId,
        queuePending: invalid.queue.queue.usage.pending,
        closeCalls: invalid.segments.closeCalls(),
        openCalls: invalid.segments.openCalls(),
        activationCommands: invalid.activation.commands().length,
      }),
    );
    checks.push(
      check('invalid-status', 'REJECTED', rejected.status, 'the import was refused'),
      check('invalid-code', 'IMPORT_INVALID', rejected.code ?? '', 'closed import reason'),
      check('invalid-no-barrier', 0, invalid.barrier.barriers().length, 'no barrier record'),
      check('invalid-no-pending', false, invalid.barrier.pending() !== null, 'nothing scheduled'),
      check('invalid-epoch', 1, invalid.barrier.current().learningEpoch, 'epoch unchanged'),
      check('invalid-segment', 'segment-g1', invalid.barrier.current().segmentId, 'segment kept'),
      check('invalid-queue', 1, invalid.queue.queue.usage.pending, 'the job stays queued'),
      check('invalid-closes', 0, invalid.segments.closeCalls(), 'no segment close'),
      check('invalid-opens', 0, invalid.segments.openCalls(), 'no segment open'),
      check('invalid-activations', 0, invalid.activation.commands().length, 'no publication'),
    );
    invalid.queue.queue.cancel('invalid-job');
  } finally {
    invalid.dispose();
  }

  // 4. A new profile advances the epoch only monotonically and rotates the segment identity.
  const newProfile = createEpochWorld();
  try {
    const physicalBefore = newProfile.segments.port.physical();
    newProfile.barrier.requestChange({
      reason: 'NEW_PROFILE',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: newProfile.targetVersionId,
      importValid: true,
    });
    newProfile.advanceTick();
    const first = newProfile.barrier.resolve();
    newProfile.barrier.requestChange({
      reason: 'NEW_PROFILE',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: newProfile.nextVersionId,
      importValid: true,
    });
    newProfile.advanceTick();
    const second = newProfile.barrier.resolve();
    const statuses = newProfile.barrier
      .generations()
      .map((entry) => entry.status)
      .join(',');
    scenarios.push(
      scenario('new profile', second.status, {
        firstEpoch: first.generation.learningEpoch,
        secondEpoch: second.generation.learningEpoch,
        firstSegment: first.generation.segmentId,
        secondSegment: second.generation.segmentId,
        baseVersionId: second.generation.baseVersionId,
        statuses,
        closeReason: newProfile.segments.records[0]?.closeReason ?? null,
        physicalPreserved: first.barrier?.physicalPreserved ?? null,
        invalidatedActivations: second.barrier?.invalidatedActivations ?? null,
      }),
    );
    checks.push(
      check('newprofile-first-epoch', 2, first.generation.learningEpoch, 'first increment'),
      check('newprofile-second-epoch', 3, second.generation.learningEpoch, 'second increment'),
      check(
        'newprofile-monotonic',
        true,
        second.generation.learningEpoch > first.generation.learningEpoch,
        'the epoch strictly grows',
      ),
      check(
        'newprofile-first-segment',
        'city-profile:g2',
        first.generation.segmentId,
        'stable new identity',
      ),
      check(
        'newprofile-second-segment',
        'city-profile:g3',
        second.generation.segmentId,
        'a second identity',
      ),
      check(
        'newprofile-base',
        newProfile.nextVersionId,
        second.generation.baseVersionId,
        'the target is the base',
      ),
      check(
        'newprofile-statuses',
        'CANCELLED_BY_PROFILE_CHANGE,CANCELLED_BY_PROFILE_CHANGE,OPEN',
        statuses,
        'old evidence is cancelled explicitly',
      ),
      check(
        'newprofile-close-reason',
        'PROFILE_CHANGE',
        newProfile.segments.records[0]?.closeReason ?? '',
        '069 close reason',
      ),
      check(
        'newprofile-physical',
        physicalBefore,
        newProfile.segments.port.physical(),
        'physical state preserved',
      ),
      check(
        'newprofile-settled-activation',
        1,
        second.barrier?.invalidatedActivations ?? -1,
        'the superseded activation was settled at the boundary',
      ),
    );
  } finally {
    newProfile.dispose();
  }

  // 5. A result arriving after the cancellation.
  const lateWorld = createEpochWorld();
  try {
    const job = lateWorld.job({ segmentId: 'late-job', order: 1 });
    if (lateWorld.queue.queue.submit(job).status !== 'QUEUED')
      throw new Error('Late result scenario did not queue its job');
    lateWorld.barrier.trackJob(job);
    lateWorld.barrier.requestChange({
      reason: 'RESTORE',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: lateWorld.targetVersionId,
      importValid: true,
    });
    lateWorld.advanceTick();
    lateWorld.barrier.resolve();
    const versionsAfter = lateWorld.store.listVersions(PIPELINE_PROFILE_ID).length;
    const late = lateWorld.barrier.isCurrent(job);
    scenarios.push(
      scenario('late result', late.status, {
        reason: late.reason,
        ignored: late.ignored,
        accepted: late.accepted,
        versionId: late.versionId,
        versions: lateWorld.store.listVersions(PIPELINE_PROFILE_ID).length,
        lateResults: lateWorld.barrier.stats().lateResults,
      }),
    );
    checks.push(
      check('late-status', 'LATE_RESULT', late.status, 'late result is explicit'),
      check('late-reason', 'CANCELLED_BY_PROFILE_CHANGE', late.reason ?? '', 'old evidence status'),
      check('late-ignored', true, late.ignored, 'never composed'),
      check('late-version', null, late.versionId, 'no version identity'),
      check(
        'late-no-version',
        versionsAfter,
        lateWorld.store.listVersions(PIPELINE_PROFILE_ID).length,
        'store unchanged',
      ),
      check('late-counter', 1, lateWorld.barrier.stats().lateResults, 'counted once'),
    );
  } finally {
    lateWorld.dispose();
  }

  // 6. The same result delivered twice.
  const duplicate = createEpochWorld();
  try {
    const result = duplicate.job({ segmentId: 'segment-g1', order: 1 });
    const first = duplicate.barrier.isCurrent(result);
    const second = duplicate.barrier.isCurrent(result);
    scenarios.push(
      scenario('duplicate result', second.status, {
        first: first.status,
        second: second.status,
        reason: second.reason,
        duplicates: duplicate.barrier.stats().duplicates,
        versions: duplicate.store.listVersions(PIPELINE_PROFILE_ID).length,
      }),
    );
    checks.push(
      check('duplicate-first', 'CURRENT', first.status, 'the first delivery is current'),
      check('duplicate-second', 'DUPLICATE', second.status, 'the second is deduplicated'),
      check('duplicate-reason', 'DUPLICATE_RESULT', second.reason ?? '', 'closed duplicate reason'),
      check('duplicate-version', null, second.versionId, 'no version identity'),
      check('duplicate-ignored', true, second.ignored, 'ignored'),
      check(
        'duplicate-no-version',
        3,
        duplicate.store.listVersions(PIPELINE_PROFILE_ID).length,
        'base plus two fixture targets',
      ),
      check('duplicate-counter', 1, duplicate.barrier.stats().duplicates, 'counted once'),
    );
  } finally {
    duplicate.dispose();
  }

  // 7. Activation failure: rollback without a half-committed barrier.
  const rollback = createEpochWorld();
  try {
    rollback.activation.dispose();
    const versionsBefore = rollback.store.listVersions(PIPELINE_PROFILE_ID).length;
    const fleetBefore = rollback.fleetVersions().join(',');
    rollback.barrier.requestChange({
      reason: 'RESTORE',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: rollback.targetVersionId,
      importValid: true,
    });
    rollback.advanceTick();
    const rolled = rollback.barrier.resolve();
    scenarios.push(
      scenario('rollback', rolled.status, {
        code: rolled.code,
        barrierStatus: rolled.barrier?.status ?? null,
        exact: rolled.barrier?.rollback?.exact ?? null,
        segmentRestored: rolled.barrier?.rollback?.segmentRestored ?? null,
        activationPublished: rolled.barrier?.rollback?.activationPublished ?? null,
        epoch: rollback.barrier.current().learningEpoch,
        segment: rollback.barrier.current().segmentId,
        status: rollback.segments.records.at(-1)?.status ?? null,
        versions: rollback.store.listVersions(PIPELINE_PROFILE_ID).length,
        fleet: rollback.fleetVersions().join(','),
        changes: rollback.barrier.stats().changes,
        rollbacks: rollback.barrier.stats().rollbacks,
      }),
    );
    checks.push(
      check('rollback-status', 'ROLLED_BACK', rolled.status, 'explicit rollback'),
      check('rollback-code', 'ACTIVATION_REJECTED', rolled.code ?? '', '110 refusal kept'),
      check(
        'rollback-barrier',
        'ROLLED_BACK',
        rolled.barrier?.status ?? '',
        'no committed barrier',
      ),
      check('rollback-exact', true, rolled.barrier?.rollback?.exact ?? false, 'no side effect'),
      check(
        'rollback-segment',
        true,
        rolled.barrier?.rollback?.segmentRestored ?? false,
        'reopened',
      ),
      check(
        'rollback-activation',
        false,
        rolled.barrier?.rollback?.activationPublished ?? true,
        'nothing published',
      ),
      check('rollback-epoch', 1, rollback.barrier.current().learningEpoch, 'epoch unchanged'),
      check(
        'rollback-generation',
        'segment-g1',
        rollback.barrier.current().segmentId,
        'same segment',
      ),
      check(
        'rollback-segment-status',
        'OPEN',
        rollback.segments.records.at(-1)?.status ?? '',
        'reopened',
      ),
      check(
        'rollback-no-version',
        versionsBefore,
        rollback.store.listVersions(PIPELINE_PROFILE_ID).length,
        'store untouched',
      ),
      check('rollback-fleet', fleetBefore, rollback.fleetVersions().join(','), 'fleet untouched'),
      check('rollback-changes', 0, rollback.barrier.stats().changes, 'no committed change'),
      check('rollback-count', 1, rollback.barrier.stats().rollbacks, 'one rollback'),
    );
  } finally {
    rollback.dispose();
  }

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: LEARNING_EPOCH_VERSION,
    contract: Object.freeze({
      changeReasons: Object.freeze([...learningChangeReasons]),
      generationStatuses: Object.freeze([...learningGenerationStatuses]),
      barrierStatuses: Object.freeze([...learningBarrierStatuses]),
      rejectionCodes: Object.freeze([...learningEpochRejectionCodes]),
      decisionStatuses: Object.freeze([...learningEpochDecisionStatuses]),
      history: LEARNING_EPOCH_LIMITS.history,
      trackedJobs: LEARNING_EPOCH_LIMITS.trackedJobs,
      seenResults: LEARNING_EPOCH_LIMITS.seenResults,
    }),
    scenarios: Object.freeze(scenarios),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      scenarios: scenarios.length,
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
  });
}

const BACKTICK = '`';

function code(value: ReportValue): string {
  return `${BACKTICK}${String(value)}${BACKTICK}`;
}

function cell(value: ReportValue): string {
  return value === null ? '—' : String(value).replaceAll('|', '\\|');
}

function checkCell(value: ReportValue): string {
  return String(value).replaceAll('|', '\\|');
}

export function learningEpochReportMarkdown(report: LearningEpochReport): string {
  const lines: string[] = [];
  lines.push(
    '# 205 learning epoch barrier report',
    '',
    'Machine-readable transcript: [report.json](report.json). Generated by ' +
      code('npm run learning:epoch') +
      ';',
    'no wall-clock value, random source or browser state participates. Version: ' +
      code(report.version) +
      '.',
    '',
    '## Contract',
    '',
    '- Change reasons: ' + report.contract.changeReasons.map((value) => code(value)).join(', '),
    '- Generation statuses: ' +
      report.contract.generationStatuses.map((value) => code(value)).join(', '),
    '- Barrier statuses: ' + report.contract.barrierStatuses.map((value) => code(value)).join(', '),
    '- Decision statuses: ' +
      report.contract.decisionStatuses.map((value) => code(value)).join(', '),
    '- Rejection codes: ' + report.contract.rejectionCodes.map((value) => code(value)).join(', '),
    '- Bounds: history ' +
      String(report.contract.history) +
      ', tracked jobs ' +
      String(report.contract.trackedJobs) +
      ', seen results ' +
      String(report.contract.seenResults) +
      '.',
    '',
    'A restore, a validated import or an explicit new profile is requested explicitly and resolved',
    'only at the next tick boundary. The barrier closes the current 069 segment with',
    '`PROFILE_CHANGE`, cancels the unpublished 103 jobs of the old generation, settles an old',
    'pending 110 command, publishes the target and opens the next segment with a new identity and',
    'the next epoch. An invalid import writes nothing. A result from another generation is ignored,',
    'and a duplicate or late result never creates a version.',
    '',
    '## Scenarios',
    '',
    '| Scenario | Status | Detail |',
    '| --- | --- | --- |',
    ...report.scenarios.map(
      (entry) =>
        `| ${entry.name} | ${code(entry.status)} | ${Object.entries(entry.detail)
          .map(([key, value]) => `${key}=${cell(value)}`)
          .join('; ')} |`,
    ),
    '',
    '## Checks',
    '',
    '| Check | Expected | Actual | Result | Detail |',
    '| --- | --- | --- | --- | --- |',
    ...report.checks.map(
      (entry) =>
        `| ${entry.name} | ${checkCell(entry.expected)} | ${checkCell(entry.actual)} | ${
          entry.pass ? 'PASS' : 'FAIL'
        } | ${entry.detail} |`,
    ),
    '',
    '## Summary',
    '',
    '- Scenarios: ' + String(report.summary.scenarios),
    '- Checks: ' + String(report.summary.passed) + '/' + String(report.summary.checks),
    '- Overall: ' + (report.summary.pass ? 'PASS' : 'FAIL'),
    '',
    '## Limitations',
    '',
    '- Deterministic Node run: the worker transport is an injected port that answers with the real',
    '  101 `blendProfileValue` result. The real 103 queue, 221 governor, 102 composition, 109 store',
    '  and 110 activation run; no `worker_threads` thread and no browser are involved.',
    '- The 069 segment binding is an injected in-memory port that records close/open identity and a',
    '  physical readback. It is not the native 069 record store, and it does not prove native frame',
    '  timing or input continuity.',
    '- The barrier history and the activation command journal are RAM-only; there is no savefile,',
    '  IndexedDB or crash-recovery journal in this scope.',
    '- The fleet is the deterministic 057 fixture (24 taxis, 40 civilians); this report does not',
    '  certify the integrated game loop, physics or a real participant session.',
    '- No FPS, frame, GPU or hardware measurement is claimed, and there is no browser capture.',
    '- PBI 205 remains in the board column owned by the orchestrator; this report does not move it.',
    '',
  );
  return lines.join('\n');
}
