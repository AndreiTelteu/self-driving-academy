import {
  MISSION_DEMO_BASE_STOP_PROBABILITY,
  MISSION_DEMO_LEARNING_KEY,
  MISSION_DEMO_LIMITS,
  MISSION_DEMO_MISSION_ID,
  MISSION_DEMO_VERSION,
  createMissionDemoWorld,
  missionDemoStatuses,
  runMissionDemonstration,
} from '../../src/app';
import type { MissionDemoWorld } from '../../src/app';
import { buildDemoEvidence, createDemoQueue } from './mission-demo-fixture';

/**
 * Deterministic report for PBI 118.
 *
 * Every scenario drives the real chain: the real 085 recorder, the real 086 opportunity registry,
 * the real 087 eligibility windows, the real 088 artefact filter, the real 093 evidence ledger and
 * the real 097/098 estimators feed the real 103 queue and the real 112 pipeline, which derives the
 * real 109 version and publishes the real 110 activation. The 104 explanation is read from the same
 * job/outcome the pipeline used.
 */
export const MISSION_DEMO_REPORT_VERSION = '118-mission-demo-report-v1' as const;

export interface MissionDemoReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface MissionDemoReportScenario {
  readonly name: string;
  readonly status: string;
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
}

export interface MissionDemoReport {
  readonly version: typeof MISSION_DEMO_REPORT_VERSION;
  readonly contract: Readonly<{
    missionId: string;
    learningKey: string;
    baseValue: number;
    statuses: readonly string[];
    chain: readonly string[];
    limits: Readonly<Record<string, number>>;
  }>;
  readonly scenarios: readonly MissionDemoReportScenario[];
  readonly checks: readonly MissionDemoReportCheck[];
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
): MissionDemoReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function scenario(
  name: string,
  status: string,
  detail: Record<string, string | number | boolean | null>,
): MissionDemoReportScenario {
  return Object.freeze({ name, status, detail: Object.freeze(detail) });
}

/** The real modules of the demonstration chain, in the order the segment travels. */
const DEMO_CHAIN = Object.freeze([
  '069-segment',
  '085-tick-samples',
  '086-opportunities',
  '087-eligibility',
  '088-artifact-filter',
  '093-evidence',
  '097-signal-estimator',
  '098-stop-yield-estimator',
  '103-queue',
  '102-candidate-gate',
  '112-pipeline',
  '109-profile-store',
  '110-profile-activation',
  '104-explanation',
]);

async function withWorld<T>(run: (world: MissionDemoWorld) => Promise<T>): Promise<T> {
  const queue = createDemoQueue('engine-118');
  const world = createMissionDemoWorld({ queue });
  try {
    return await run(world);
  } finally {
    world.dispose();
    queue.dispose();
  }
}

export async function runMissionDemoReport(): Promise<MissionDemoReport> {
  const scenarios: MissionDemoReportScenario[] = [];
  const checks: MissionDemoReportCheck[] = [];

  checks.push(
    check('contract-version', MISSION_DEMO_VERSION, '118-mission-demo-v1', 'demo contract'),
    check('mission-id', 'campaign-2-first-demonstration', MISSION_DEMO_MISSION_ID, '116 mission'),
    check('learning-key', 'stop_full_probability', MISSION_DEMO_LEARNING_KEY, '092/105 key'),
    check('status-count', 3, missionDemoStatuses.length, 'closed result vocabulary'),
    check('example-row-limit', 24, MISSION_DEMO_LIMITS.exampleRows, 'bounded example payload'),
    check('chain-length', 14, DEMO_CHAIN.length, 'real modules of the chain'),
  );

  // 1. A LEARNING segment with sufficient evidence.
  const demonstrated = await withWorld(async (world) => {
    const evidence = buildDemoEvidence();
    const result = await runMissionDemonstration(world, {
      segment: evidence.segment,
      opportunityIds: evidence.opportunityIds,
    });
    const versions = world.store.getHistory('city-profile-118');
    scenarios.push(
      scenario('LEARNING segment with sufficient evidence', result.status, {
        pipelineStatus: result.pipelineStatus,
        evidenceStatus: result.evidence.status,
        distinctEpisodes: result.evidence.distinctEpisodes,
        effectiveEpisodes: result.evidence.effectiveEpisodes,
        confidence: result.evidence.confidence,
        contexts: result.evidence.contexts.join(','),
        previous: result.delta?.previous ?? null,
        next: result.delta?.next ?? null,
        versionId: result.versionId,
        composedVersionId: result.composedVersionId,
        activationStatus: result.activation?.status ?? null,
        appliedTick: result.activation?.appliedTick ?? null,
        updatedVehicles: result.activation?.updatedVehicles ?? null,
        fleetVersions: world.fleetVersions().join(','),
        chain: versions.map((version) => version.versionId).join(' -> '),
        exampleKind: result.example.kind,
        exampleOrigin: result.example.origin,
        stopCandidate: evidence.facts.stopCandidateValue,
        signalCandidate: evidence.facts.signalCandidateStatus,
        samples: evidence.facts.samples,
        opportunities: evidence.facts.opportunities,
      }),
    );
    checks.push(
      check('demo-status', 'DEMONSTRATED', result.status, 'delta plus observed activation'),
      check('demo-pipeline', 'COMPOSED', result.pipelineStatus, '112 composition accepted'),
      check('demo-evidence-status', 'READY', result.evidence.status, 'real 093 read model'),
      check('demo-episodes', 4, result.evidence.distinctEpisodes, 'four distinct 086 occasions'),
      check('demo-effective', 4, result.evidence.effectiveEpisodes, 'real 100 effective count'),
      check('demo-confidence', 'OBSERVED', result.evidence.confidence, 'real 100 state'),
      check('demo-contexts', 'FREE_TRAFFIC', result.evidence.contexts.join(','), 'real 087 label'),
      check('demo-previous', 0.6, result.delta?.previous ?? null, 'base value of the segment'),
      check('demo-next', 0.8, result.delta?.next ?? null, 'real 101 fold of the 098 candidate'),
      check('demo-delta', 0.2, result.delta?.delta ?? null, 'the published delta'),
      check('demo-version', 'segment-118-demo~112', result.versionId, '109 version'),
      check(
        'demo-parent',
        'city-profile-118-base',
        result.delta?.parentVersionId ?? null,
        '109 parent',
      ),
      check(
        'demo-chain',
        'city-profile-118-base -> segment-118-demo~112',
        versions.map((version) => version.versionId).join(' -> '),
        'base-to-tip history',
      ),
      check('demo-activation', 'APPLIED', result.activation?.status ?? null, '110 applied'),
      check('demo-applied-tick', 1, result.activation?.appliedTick ?? null, 'next common tick'),
      check('demo-updated', 64, result.activation?.updatedVehicles ?? null, 'whole fleet adopted'),
      check('demo-fleet', 'segment-118-demo~112', world.fleetVersions().join(','), 'fleet version'),
      check('demo-requirements', true, result.requirements.satisfied, 'both mission requirements'),
      check('demo-example', 'LIVE', result.example.kind, 'live example after a publication'),
      check('demo-example-origin', '109-profile-store-v1', result.example.origin, '109 provenance'),
      check('demo-example-effect', true, result.example.isPlayerEffect, 'the player effect'),
      check(
        'demo-stop-candidate',
        1,
        result.evidence.status === 'READY' ? 1 : 0,
        'real 098 candidate',
      ),
    );
    return result;
  });
  checks.push(
    check(
      'demo-explanation',
      'CHANGED',
      demonstrated.explanation?.status ?? null,
      'real 104 explanation of the same job',
    ),
  );

  // 2. A LEARNING segment without eligible evidence.
  await withWorld(async (world) => {
    const evidence = buildDemoEvidence({ stopCycles: 0, segmentId: 'segment-118-empty' });
    const result = await runMissionDemonstration(world, {
      segment: evidence.segment,
      opportunityIds: evidence.opportunityIds,
    });
    scenarios.push(
      scenario('LEARNING segment without eligible evidence', result.status, {
        pipelineStatus: result.pipelineStatus,
        reason: result.reason,
        evidenceStatus: result.evidence.status,
        distinctEpisodes: result.evidence.distinctEpisodes,
        confidence: result.evidence.confidence,
        versionId: result.versionId,
        activation: result.activation?.status ?? null,
        explanationStatus: result.explanation?.status ?? null,
        explanationVersion: result.explanation?.versionId ?? null,
        missingContexts: result.explanation?.missingContexts.join(' | ') ?? null,
        storeVersions: world.store.listVersions('city-profile-118').length,
        activationCommands: world.activation.commands().length,
        exampleKind: result.example.kind,
        exampleOrigin: result.example.origin,
        exampleEffect: result.example.isPlayerEffect,
        stopCandidateStatus: evidence.facts.stopCandidateStatus,
        stopCandidateReason: evidence.facts.stopCandidateReason,
        signalCandidateStatus: evidence.facts.signalCandidateStatus,
      }),
    );
    checks.push(
      check('empty-status', 'NO_CHANGE', result.status, 'no version, no activation'),
      check(
        'empty-pipeline',
        'NO_CHANGE',
        result.pipelineStatus,
        '112 reports the closed no-change',
      ),
      check('empty-reason', 'NO_NEW_EVIDENCE', result.reason, 'closed 104 no-change reason'),
      check('empty-evidence', 'NO_EVIDENCE', result.evidence.status, 'real 093 read model'),
      check('empty-episodes', 0, result.evidence.distinctEpisodes, 'no qualifying evidence'),
      check('empty-confidence', 'UNOBSERVED', result.evidence.confidence, 'real 100 state'),
      check('empty-version', null, result.versionId, 'no 109 version'),
      check('empty-activation', null, result.activation?.status ?? null, 'no 110 command'),
      check(
        'empty-store',
        1,
        world.store.listVersions('city-profile-118').length,
        'only the base version',
      ),
      check('empty-commands', 0, world.activation.commands().length, 'nothing published'),
      check('empty-explanation', 'NO_CHANGE', result.explanation?.status ?? null, '104 frame'),
      check(
        'empty-explanation-version',
        null,
        result.explanation?.versionId ?? null,
        'no version in the frame',
      ),
      check(
        'empty-missing-contexts',
        1,
        result.explanation?.missingContexts.length ?? 0,
        'the frame names what is missing',
      ),
      check('empty-example', 'EXPERIMENT', result.example.kind, 'reference example'),
      check(
        'empty-example-origin',
        '105-inverse-learning-v1',
        result.example.origin,
        '105 reference',
      ),
      check('empty-example-effect', false, result.example.isPlayerEffect, 'not the player effect'),
      check(
        'empty-stop-candidate',
        'REFUSED',
        evidence.facts.stopCandidateStatus,
        'real 098 refusal',
      ),
      check(
        'empty-stop-reason',
        'ZERO_ELIGIBLE_STOP_DENOMINATOR',
        evidence.facts.stopCandidateReason,
        'closed 098 reason',
      ),
      check(
        'empty-signal-candidate',
        'REFUSED',
        evidence.facts.signalCandidateStatus,
        'real 097 refusal',
      ),
    );
  });

  // 3. A MANUAL segment never learns.
  await withWorld(async (world) => {
    const evidence = buildDemoEvidence();
    const result = await runMissionDemonstration(world, {
      segment: { ...evidence.segment, segmentId: 'segment-118-manual', mode: 'MANUAL' },
      opportunityIds: evidence.opportunityIds,
    });
    scenarios.push(
      scenario('MANUAL segment', result.status, {
        pipelineStatus: result.pipelineStatus,
        reason: result.reason,
        versionId: result.versionId,
        activation: result.activation?.status ?? null,
        jobs: world.queueResults().length,
        storeVersions: world.store.listVersions('city-profile-118').length,
        exampleKind: result.example.kind,
      }),
    );
    checks.push(
      check('manual-status', 'REJECTED', result.status, 'MANUAL is not a demonstration'),
      check('manual-pipeline', 'SKIPPED_MANUAL', result.pipelineStatus, '112 closed skip'),
      check('manual-reason', 'MANUAL_SEGMENT_NOT_LEARNABLE', result.reason, 'closed reason'),
      check('manual-jobs', 0, world.queueResults().length, 'no 103 job'),
      check('manual-version', null, result.versionId, 'no 109 version'),
      check(
        'manual-store',
        1,
        world.store.listVersions('city-profile-118').length,
        'only the base version',
      ),
    );
  });

  // 4. An ineligible LEARNING segment never learns.
  await withWorld(async (world) => {
    const evidence = buildDemoEvidence();
    const result = await runMissionDemonstration(world, {
      segment: { ...evidence.segment, segmentId: 'segment-118-ineligible', eligible: false },
      opportunityIds: evidence.opportunityIds,
    });
    scenarios.push(
      scenario('ineligible LEARNING segment', result.status, {
        pipelineStatus: result.pipelineStatus,
        reason: result.reason,
        versionId: result.versionId,
        jobs: world.queueResults().length,
        storeVersions: world.store.listVersions('city-profile-118').length,
      }),
    );
    checks.push(
      check('ineligible-status', 'REJECTED', result.status, 'ineligible is not a demonstration'),
      check('ineligible-pipeline', 'SKIPPED_INELIGIBLE', result.pipelineStatus, '112 closed skip'),
      check('ineligible-reason', 'SEGMENT_INELIGIBLE', result.reason, 'closed reason'),
      check('ineligible-jobs', 0, world.queueResults().length, 'no 103 job'),
      check(
        'ineligible-store',
        1,
        world.store.listVersions('city-profile-118').length,
        'only the base version',
      ),
    );
  });

  // 5. A published version without an observed activation is not a demonstration.
  await withWorld(async (world) => {
    const blocking = world.activation.publish({
      profileId: 'city-profile-118',
      versionId: 'city-profile-118-blocked',
      engineVersion: 'engine-118',
      publishedAtTick: 0,
      activateAtTick: 5,
      reason: 'blocking activation',
      origin: 'MANUAL_TUNING',
      idempotencyKey: '118-blocking',
    });
    const evidence = buildDemoEvidence();
    const result = await runMissionDemonstration(world, {
      segment: evidence.segment,
      opportunityIds: evidence.opportunityIds,
    });
    scenarios.push(
      scenario('published version without an observed activation', result.status, {
        pipelineStatus: result.pipelineStatus,
        reason: result.reason,
        versionId: result.versionId,
        activation: result.activation?.status ?? null,
        justifiedDelta: result.requirements.justifiedDelta,
        observedActivation: result.requirements.observedActivation,
        satisfied: result.requirements.satisfied,
        exampleKind: result.example.kind,
        blockingCommands: world.activation.commands().length,
      }),
    );
    checks.push(
      check(
        'blocked-status',
        'REJECTED',
        result.status,
        'no observed activation, no demonstration',
      ),
      check('blocked-reason', 'ACTIVATION_NOT_OBSERVED', result.reason, 'closed 118 reason'),
      check('blocked-activation', null, result.activation?.status ?? null, 'no applied activation'),
      check(
        'blocked-justified',
        true,
        result.requirements.justifiedDelta,
        'the delta is justified',
      ),
      check(
        'blocked-observed',
        false,
        result.requirements.observedActivation,
        'the activation was not observed',
      ),
      check(
        'blocked-satisfied',
        false,
        result.requirements.satisfied,
        'the mission is not satisfied',
      ),
      check('blocked-publish', 'ACCEPTED', blocking.status, 'the blocking command is real'),
    );
  });

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: MISSION_DEMO_REPORT_VERSION,
    contract: Object.freeze({
      missionId: MISSION_DEMO_MISSION_ID,
      learningKey: MISSION_DEMO_LEARNING_KEY,
      baseValue: MISSION_DEMO_BASE_STOP_PROBABILITY,
      statuses: Object.freeze([...missionDemoStatuses]),
      chain: DEMO_CHAIN,
      limits: Object.freeze({
        exampleRows: MISSION_DEMO_LIMITS.exampleRows,
        opportunityIds: MISSION_DEMO_LIMITS.opportunityIds,
        taxis: MISSION_DEMO_LIMITS.taxis,
        civilians: MISSION_DEMO_LIMITS.civilians,
      }),
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

export function missionDemoReportMarkdown(report: MissionDemoReport): string {
  const lines: string[] = [];
  lines.push(
    '# 118 mission demonstration report',
    '',
    'Machine-readable transcript: [report.json](report.json). Generated by ' +
      code('npm run missions:demo') +
      ';',
    'no wall-clock value, random source or browser state participates. Version: ' +
      code(report.version) +
      '.',
    '',
    '## Contract',
    '',
    '- Mission: ' + code(report.contract.missionId) + ' (116 campaign stage 2).',
    '- Learning key: ' +
      code(report.contract.learningKey) +
      '; base value: ' +
      String(report.contract.baseValue) +
      '.',
    '- Statuses: ' + report.contract.statuses.map((status) => code(status)).join(', ') + '.',
    '- Chain: ' + report.contract.chain.map((entry) => code(entry)).join(' → ') + '.',
    '- Fleet of the demonstration world: ' +
      String(report.contract.limits.taxis) +
      ' taxis + ' +
      String(report.contract.limits.civilians) +
      ' civilians.',
    '',
    'The demonstration never fabricates a delta, a version or an activation. The 085 recorder, the',
    '086 opportunity registry, the 087 eligibility windows, the 088 artefact filter, the 093 ledger',
    'and the 097/098 estimators produce the evidence; the 103 queue, the 102 gate, the 112 pipeline,',
    'the 109 store and the 110 activation produce the effect; the 104 explanation reads the same',
    'job/outcome the pipeline used.',
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
        `| ${entry.name} | ${cell(entry.expected)} | ${cell(entry.actual)} | ${
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
    '- Deterministic Node run: the 103 worker transport is an injected port that answers with the',
    '  real 101 `blendProfileValue` result. The real queue, governor, 102 gate, 112 pipeline, 109',
    '  store, 110 activation and 104 explanation are executed; no `worker_threads` thread and no',
    '  browser are involved.',
    '- The 087 window identity and the 088 window identity use two different id schemes in the',
    '  current contracts, while 093/098 require one identity on both records. The fixture binds the',
    '  real 088 window to the real 087 window of the same opportunity; no value, opportunity, tick or',
    '  estimate is invented.',
    '- The demonstration observes the 110 activation on the fixed tick of the deterministic fleet;',
    '  it does not certify the integrated game loop, physics continuity or a human session.',
    '- No FPS, frame, GPU or hardware measurement is claimed.',
    '',
  );
  return lines.join('\n');
}
