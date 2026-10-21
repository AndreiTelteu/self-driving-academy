import {
  PROFILE_PIPELINE_LIMITS,
  PROFILE_PIPELINE_VERSION,
  profilePipelineReasons,
  profilePipelineStatuses,
} from '../../src/app';
import {
  PIPELINE_BASE_VERSION,
  PIPELINE_PROFILE_ID,
  createPipelineWorld,
  pipelineFold,
  pipelineSegment,
} from '../harness/profile-pipeline-fixture';

/**
 * Deterministic end-to-end report for PBI 112.
 *
 * Every scenario builds the real 103 queue (with the real 221 governor and 101/102 composition), the
 * real 109 store and the real 110 activation over a deterministic fleet registry. Only the worker
 * transport is a documented port: it answers a dispatched request with the real `blendProfileValue`
 * result, so no estimator, composition or validation logic is duplicated here.
 */
export interface ProfilePipelineScenario {
  readonly name: string;
  readonly status: string;
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ProfilePipelineCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ProfilePipelineReport {
  readonly version: typeof PROFILE_PIPELINE_VERSION;
  readonly contract: Readonly<{
    statuses: readonly string[];
    reasons: readonly string[];
    history: number;
    ledger: number;
    statusCount: number;
    reasonCount: number;
  }>;
  readonly scenarios: readonly ProfilePipelineScenario[];
  readonly checks: readonly ProfilePipelineCheck[];
  readonly summary: Readonly<{
    scenarios: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): ProfilePipelineCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function scenario(
  name: string,
  status: string,
  detail: Record<string, string | number | boolean | null>,
): ProfilePipelineScenario {
  return Object.freeze({ name, status, detail: Object.freeze(detail) });
}

export async function runProfilePipelineReport(): Promise<ProfilePipelineReport> {
  const scenarios: ProfilePipelineScenario[] = [];
  const checks: ProfilePipelineCheck[] = [];

  checks.push(
    check(
      'contract-version',
      '112-profile-pipeline-v1',
      PROFILE_PIPELINE_VERSION,
      'pipeline contract',
    ),
    check('status-count', 8, profilePipelineStatuses.length, 'closed result vocabulary'),
    check('reason-count', 15, profilePipelineReasons.length, 'closed pipeline reason vocabulary'),
    check('history-limit', 16, PROFILE_PIPELINE_LIMITS.history, 'bounded retained results'),
    check('ledger-limit', 64, PROFILE_PIPELINE_LIMITS.ledger, 'bounded segment ledger'),
  );

  // 1-3. Walk two consecutive eligible LEARNING interventions on one world.
  const walked = createPipelineWorld();
  try {
    const first = await walked.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'walk-1', order: 1 }),
    );
    const firstVersion = first.versionId;
    const versionAfterFirst = walked.store.listVersions(PIPELINE_PROFILE_ID).length;
    scenarios.push(
      scenario('first eligible LEARNING segment', first.status, {
        versionId: first.versionId,
        parentVersionId: first.parentVersionId,
        versionBefore: first.composition?.baseValue ?? null,
        versionAfter: first.composition?.value ?? null,
        jobSubmitted: first.jobSubmitted,
        activateAtTick: first.activation?.activateAtTick ?? null,
        storeVersions: versionAfterFirst,
      }),
    );
    checks.push(
      check('walk1-status', 'COMPOSED', first.status, 'one accepted composition published'),
      check('walk1-version', 'walk-1~112', String(first.versionId), 'deterministic version id'),
      check('walk1-parent', PIPELINE_BASE_VERSION, String(first.parentVersionId), 'explicit base'),
      check('walk1-value', pipelineFold(1.5, 4), first.composition?.value ?? -1, 'real 101 fold'),
      check('walk1-activate-tick', 1, first.activation?.activateAtTick ?? -1, 'next common tick'),
      check('walk1-store-versions', 2, versionAfterFirst, 'base plus one derived version'),
    );

    walked.advanceTick();
    const second = await walked.pipeline.onSegmentClosed(
      pipelineSegment({
        segmentId: 'walk-2',
        order: 2,
        baseValue: pipelineFold(1.5, 4),
      }),
    );
    walked.advanceTick();
    const appliedSecond = walked.pipeline.advance();
    const chain = walked.store.getHistory(PIPELINE_PROFILE_ID);
    scenarios.push(
      scenario('second eligible LEARNING segment', second.status, {
        versionId: second.versionId,
        parentVersionId: second.parentVersionId,
        chain: chain.map((version) => version.versionId).join(' -> '),
        depth: chain.map((version) => version.depth).join(','),
        sourceSegments: chain[2]?.provenance.sourceSegmentIds.join(',') ?? null,
        appliedTick: appliedSecond?.appliedTick ?? null,
        fleetVersions: walked.fleetVersions().join(','),
      }),
    );
    checks.push(
      check('walk2-status', 'COMPOSED', second.status, 'second change published'),
      check('walk2-version', 'walk-2~112', String(second.versionId), 'second version id'),
      check('walk2-parent', String(firstVersion), String(second.parentVersionId), 'parent is v1'),
      check(
        'walk2-chain',
        `${PIPELINE_BASE_VERSION} -> walk-1~112 -> walk-2~112`,
        chain.map((version) => version.versionId).join(' -> '),
        'base-to-tip history',
      ),
      check(
        'walk2-depth',
        '0,1,2',
        chain.map((version) => version.depth).join(','),
        'one derivation per segment',
      ),
      check(
        'walk2-provenance',
        'walk-1,walk-2',
        chain[2]?.provenance.sourceSegmentIds.join(',') ?? '',
        'cumulative provenance',
      ),
      check('walk2-applied-tick', 2, appliedSecond?.appliedTick ?? -1, 'common tick of v2'),
      check(
        'walk2-fleet',
        'walk-2~112',
        walked.fleetVersions().join(','),
        'the whole fleet adopted v2',
      ),
      check('walk2-commands', 2, walked.activation.commands().length, 'one command per version'),
      check(
        'walk2-applied',
        2,
        walked.pipeline.stats().activationsApplied,
        'both commands applied',
      ),
    );

    // 3. MANUAL on the same world: no job, no version, no activation.
    const queueStartsBefore = walked.queue.starts.length;
    const commandsBefore = walked.activation.commands().length;
    const manual = await walked.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'walk-manual', order: 3, mode: 'MANUAL' }),
    );
    scenarios.push(
      scenario('MANUAL intervention', manual.status, {
        reason: manual.reason ?? null,
        jobSubmitted: manual.jobSubmitted,
        queueStarts: walked.queue.starts.length,
        storeVersions: walked.store.listVersions(PIPELINE_PROFILE_ID).length,
        activationCommands: walked.activation.commands().length,
      }),
    );
    checks.push(
      check('manual-status', 'SKIPPED_MANUAL', manual.status, 'MANUAL is never learned'),
      check('manual-no-job', 0, walked.queue.starts.length - queueStartsBefore, 'no 103 job'),
      check(
        'manual-no-version',
        3,
        walked.store.listVersions(PIPELINE_PROFILE_ID).length,
        'store keeps base plus two versions',
      ),
      check(
        'manual-no-activation',
        0,
        walked.activation.commands().length - commandsBefore,
        'no 110 command',
      ),
    );
  } finally {
    walked.dispose();
  }

  // 4. LEARNING with no actual change.
  const flat = createPipelineWorld();
  try {
    const noChange = await flat.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'flat-1', order: 1, candidateValue: 1.5 }),
    );
    const duplicate = await flat.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'flat-1', order: 1, candidateValue: 1.5 }),
    );
    scenarios.push(
      scenario('LEARNING with no change', noChange.status, {
        reason: noChange.reason ?? null,
        composedValue: noChange.composition?.value ?? null,
        versionId: noChange.versionId,
        storeVersions: flat.store.listVersions(PIPELINE_PROFILE_ID).length,
        activationCommands: flat.activation.commands().length,
        duplicateStatus: duplicate.status,
        queueStarts: flat.queue.starts.length,
      }),
    );
    checks.push(
      check('nochange-status', 'NO_CHANGE', noChange.status, 'composed but unchanged'),
      check('nochange-no-version', null, noChange.versionId, 'no version for a no-op'),
      check(
        'nochange-store',
        1,
        flat.store.listVersions(PIPELINE_PROFILE_ID).length,
        'only the base version exists',
      ),
      check('nochange-commands', 0, flat.activation.commands().length, 'nothing published'),
      check('nochange-duplicate', 'NO_CHANGE', duplicate.status, 'duplicate keeps NO_CHANGE'),
      check('nochange-duplicate-job', 1, flat.queue.starts.length, 'duplicate is not queued'),
    );
  } finally {
    flat.dispose();
  }

  // 5. A superseded same-generation result is explicitly recomposed.
  const superseded = createPipelineWorld();
  try {
    const late = await superseded.pipeline.onSegmentClosed(
      pipelineSegment({
        segmentId: 'stale-late',
        order: 2,
        candidateValue: -2,
        baseVersionId: PIPELINE_BASE_VERSION,
      }),
    );
    const versionsBefore = superseded.store.listVersions(PIPELINE_PROFILE_ID).length;
    superseded.advanceTick();
    const recomposed = await superseded.pipeline.onSegmentClosed(
      pipelineSegment({
        segmentId: 'stale-early',
        order: 1,
        candidateValue: 4,
        baseVersionId: PIPELINE_BASE_VERSION,
      }),
    );
    const versionsAfter = superseded.store.listVersions(PIPELINE_PROFILE_ID).length;
    scenarios.push(
      scenario('superseded same-generation result', recomposed.status, {
        firstStatus: late.status,
        appliedOrders: recomposed.composition?.appliedOrders.join(',') ?? null,
        appliedSegments: recomposed.composition?.appliedSegments.join(',') ?? null,
        recomposed: recomposed.composition?.recomposed ?? null,
        value: recomposed.composition?.value ?? null,
        versionId: recomposed.versionId,
        activationStatus: recomposed.activation?.status ?? null,
        newVersions: versionsAfter - versionsBefore,
      }),
    );
    checks.push(
      check('recompose-first', 'COMPOSED', late.status, 'the later order composed first'),
      check('recompose-status', 'RECOMPOSED', recomposed.status, 'explicit recomposition'),
      check('recompose-flag', true, recomposed.composition?.recomposed ?? false, 'ledger folded'),
      check(
        'recompose-orders',
        '1,2',
        recomposed.composition?.appliedOrders.join(',') ?? '',
        'intervention order restored',
      ),
      check(
        'recompose-segments',
        'stale-early,stale-late',
        recomposed.composition?.appliedSegments.join(',') ?? '',
        'both proposals in the latest composition',
      ),
      check(
        'recompose-value',
        pipelineFold(pipelineFold(1.5, 4), -2),
        recomposed.composition?.value ?? -1,
        'serial fold in intervention order',
      ),
      check('recompose-one-version', 1, versionsAfter - versionsBefore, 'exactly one new version'),
      check(
        'recompose-activation',
        'PENDING',
        recomposed.activation?.status ?? 'MISSING',
        'the recomposed version targets the next common tick',
      ),
      check(
        'recompose-counter',
        1,
        superseded.pipeline.stats().recomposed,
        'recomposition counted explicitly',
      ),
    );
  } finally {
    superseded.dispose();
  }

  // 6. A real estimator error fails without a version.
  const failed = createPipelineWorld();
  try {
    failed.queue.plan('error-1', 'error');
    const failure = await failed.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'error-1', order: 1 }),
    );
    scenarios.push(
      scenario('estimator error', failure.status, {
        reason: failure.reason ?? null,
        code: failure.code ?? null,
        detail: failure.detail,
        versionId: failure.versionId,
        storeVersions: failed.store.listVersions(PIPELINE_PROFILE_ID).length,
        activationCommands: failed.activation.commands().length,
      }),
    );
    checks.push(
      check('error-status', 'FAILED', failure.status, 'a worker error is never a publication'),
      check('error-reason', 'LEARNING_JOB_FAILED', failure.reason ?? '', 'closed pipeline reason'),
      check('error-code', 'RESULT_INVALID', failure.code ?? '', 'real 103 outcome code'),
      check('error-no-version', null, failure.versionId, 'nothing derived'),
      check(
        'error-store',
        1,
        failed.store.listVersions(PIPELINE_PROFILE_ID).length,
        'only the base version exists',
      ),
      check('error-commands', 0, failed.activation.commands().length, 'nothing published'),
    );
  } finally {
    failed.dispose();
  }

  // 7. Repeating a segment id is idempotent.
  const duplicate = createPipelineWorld();
  try {
    const first = await duplicate.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'dup-1', order: 1 }),
    );
    const again = await duplicate.pipeline.onSegmentClosed(
      pipelineSegment({ segmentId: 'dup-1', order: 1 }),
    );
    scenarios.push(
      scenario('duplicate segment', again.status, {
        firstVersionId: first.versionId,
        duplicateVersionId: again.versionId,
        deduplicated: again.deduplicated,
        jobSubmitted: again.jobSubmitted,
        queueStarts: duplicate.queue.starts.length,
        storeVersions: duplicate.store.listVersions(PIPELINE_PROFILE_ID).length,
        storeDeduplicated: duplicate.store.stats().deduplicated,
        publicationCommands: duplicate.activation.commands().length,
      }),
    );
    checks.push(
      check('duplicate-status', 'DEDUPLICATED', again.status, 'the store answered the retry'),
      check(
        'duplicate-version',
        String(first.versionId),
        String(again.versionId),
        'same version id',
      ),
      check('duplicate-flag', true, again.deduplicated, 'explicit deduplication'),
      check('duplicate-no-job', 1, duplicate.queue.starts.length, 'no second 103 job'),
      check(
        'duplicate-store',
        2,
        duplicate.store.listVersions(PIPELINE_PROFILE_ID).length,
        'no duplicate version',
      ),
      check(
        'duplicate-store-counter',
        1,
        duplicate.store.stats().deduplicated,
        '109 retry counter',
      ),
      check(
        'duplicate-commands',
        1,
        duplicate.activation.commands().length,
        'no duplicate activation',
      ),
    );
  } finally {
    duplicate.dispose();
  }

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: PROFILE_PIPELINE_VERSION,
    contract: Object.freeze({
      statuses: Object.freeze([...profilePipelineStatuses]),
      reasons: Object.freeze([...profilePipelineReasons]),
      history: PROFILE_PIPELINE_LIMITS.history,
      ledger: PROFILE_PIPELINE_LIMITS.ledger,
      statusCount: profilePipelineStatuses.length,
      reasonCount: profilePipelineReasons.length,
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

function code(value: string | number | boolean | null): string {
  return `${BACKTICK}${String(value)}${BACKTICK}`;
}

function cell(value: string | number | boolean | null): string {
  return value === null ? '—' : String(value).replaceAll('|', '\\|');
}

function checkCell(value: string | number | boolean | null): string {
  return String(value).replaceAll('|', '\\|');
}

export function profilePipelineReportMarkdown(report: ProfilePipelineReport): string {
  const lines: string[] = [];
  lines.push(
    '# 112 profile pipeline report',
    '',
    'Machine-readable transcript: [report.json](report.json). Generated by ' +
      code('npm run profile:pipeline') +
      ';',
    'no wall-clock value, random source or browser state participates. Version: ' +
      code(report.version) +
      '.',
    '',
    '## Contract',
    '',
    '- Statuses: ' + report.contract.statuses.map((status) => code(status)).join(', '),
    '- Reasons: ' + report.contract.reasons.map((reason) => code(reason)).join(', '),
    '- Retained results: ' +
      String(report.contract.history) +
      '; ledger: ' +
      String(report.contract.ledger) +
      '.',
    '',
    'The pipeline is fed a closed 069/103 segment. Only eligible LEARNING reaches the real 103',
    'queue; MANUAL, AUTO and ineligible LEARNING stop before admission. A composed candidate is',
    'derived into the real 109 store with an explicit parent, and the new version is published to',
    'the real 110 controller for the next common tick.',
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
    '  101 `blendProfileValue` result. The real queue, governor, 102 composition, 109 store and 110',
    '  activation are executed; no `worker_threads` thread and no browser are involved.',
    '- No FPS, frame, GPU or hardware measurement is claimed, and there is no browser capture.',
    '- The fleet is the deterministic registry fixture (24 taxis, 40 civilians); this report does',
    '  not certify the integrated game loop, physics continuity or a real participant session.',
    '- The 108 gate is not a prerequisite: this evidence exercises the integration path, not the',
    '  24-key coverage gate.',
    '',
  );
  return lines.join('\n');
}
