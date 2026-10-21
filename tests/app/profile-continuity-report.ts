import { PROFILE_CONTINUITY_VERSION, createOpportunityDecisionMemo } from '../../src/fleet';
import type { OpportunityDecisionMemo, OpportunityMemoInput } from '../../src/fleet';
import {
  PROFILE_CONTINUITY_APP_VERSION,
  applyActivationDuringManeuver,
  createSignalDecisionSampler,
  profileContinuityAppErrors,
  readManeuverSnapshot,
} from '../../src/app';
import type { SignalDecisionSampler } from '../../src/app';
import { signalOpportunityKey } from '../../src/autonomy';
import type { SignalPolicyDecision } from '../../src/autonomy';
import {
  CONTINUITY_BASE_VERSION,
  CONTINUITY_NEXT_VERSION,
  CONTINUITY_SEED,
  CONTINUITY_SESSION,
  continuityFixture,
  laneChangeRead,
  manualRead,
  redObservation,
  signalProfile,
} from './profile-continuity-fixture';
import type { ContinuityFixture } from './profile-continuity-fixture';

export interface ProfileContinuityScenario {
  readonly name: string;
  readonly status: string;
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ProfileContinuityCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ProfileContinuityReport {
  readonly version: typeof PROFILE_CONTINUITY_VERSION;
  readonly appVersion: typeof PROFILE_CONTINUITY_APP_VERSION;
  readonly contract: Readonly<{
    violations: readonly string[];
    appErrors: readonly string[];
    memoCapacity: number;
  }>;
  readonly scenarios: readonly ProfileContinuityScenario[];
  readonly checks: readonly ProfileContinuityCheck[];
  readonly summary: Readonly<{
    scenarios: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): ProfileContinuityCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function opportunity(phaseStartedTick: number, vehicleId: string): string {
  return signalOpportunityKey({
    sessionId: CONTINUITY_SESSION,
    worldEpoch: 1,
    vehicleId,
    incarnation: 1,
    intersectionId: 'junction',
    movementId: 'west-straight',
    phaseStartedTick,
  });
}

function signalSampler(
  fixture: ContinuityFixture,
  versionId: string,
  counter: { calls: number },
  observation = redObservation(),
): SignalDecisionSampler {
  const base = createSignalDecisionSampler({
    seed: CONTINUITY_SEED,
    scope: { sessionId: CONTINUITY_SESSION, worldEpoch: 1 },
    profile: signalProfile(versionId),
    observation,
    speedMps: fixture.motion.speedMps,
    incarnation: 1,
  });
  return (input: OpportunityMemoInput) => {
    counter.calls += 1;
    return base(input);
  };
}

interface RedSetup {
  readonly memo: OpportunityDecisionMemo<SignalPolicyDecision>;
  readonly sampler: SignalDecisionSampler;
  readonly counter: { calls: number };
  readonly opportunityId: string;
  readonly sample: ReturnType<OpportunityDecisionMemo<SignalPolicyDecision>['decideOnce']>;
}

function redSetup(fixture: ContinuityFixture): RedSetup {
  const counter = { calls: 0 };
  const memo = createOpportunityDecisionMemo<SignalPolicyDecision>();
  const sampler = signalSampler(fixture, CONTINUITY_BASE_VERSION, counter);
  const opportunityId = opportunity(0, fixture.vehicleId);
  const sample = memo.decideOnce(
    {
      vehicleId: fixture.vehicleId,
      opportunityId,
      occurrence: 1,
      tick: 0,
      profileVersion: CONTINUITY_BASE_VERSION,
    },
    sampler,
  );
  fixture.signal.current = {
    opportunityId,
    occurrence: 1,
    decision: sample.decision,
    sampledTick: sample.sampledTick,
    profileVersion: sample.profileVersion,
  };
  return { memo, sampler, counter, opportunityId, sample };
}

function activatedFixture(): ContinuityFixture {
  const fixture = continuityFixture();
  fixture.publish();
  fixture.setTick(1);
  return fixture;
}

export function runProfileContinuityReport(): ProfileContinuityReport {
  const scenarios: ProfileContinuityScenario[] = [];
  const checks: ProfileContinuityCheck[] = [];

  // 1. Activation during a turn.
  const turn = activatedFixture();
  const turnBefore = readManeuverSnapshot(turn.sources, 0);
  const turnResult = applyActivationDuringManeuver({
    ...turn.sources,
    activation: turn.activation,
    tick: 1,
  });
  scenarios.push(
    Object.freeze({
      name: 'turn',
      status: turnResult.status,
      detail: Object.freeze({
        headingRad: turnResult.after?.headingRad ?? -1,
        speedMps: turnResult.after?.speedMps ?? -1,
        positionX: turnResult.after?.positionM.x ?? -1,
        version: turnResult.after?.appliedProfileVersion ?? 'missing',
        violations: turnResult.violations.join(',') || 'none',
      }),
    }),
  );
  checks.push(
    check('turn-status', 'APPLIED', turnResult.status, 'activation is applied during the turn'),
    check(
      'turn-position',
      JSON.stringify(turnBefore?.positionM),
      JSON.stringify(turnResult.after?.positionM),
      'no teleport at the common tick',
    ),
    check(
      'turn-speed',
      turnBefore?.speedMps ?? -1,
      turnResult.after?.speedMps ?? -2,
      'speed is not reset',
    ),
    check(
      'turn-heading',
      turnBefore?.headingRad ?? -1,
      turnResult.after?.headingRad ?? -2,
      'heading is not rewritten',
    ),
    check(
      'turn-version',
      CONTINUITY_NEXT_VERSION,
      turnResult.after?.appliedProfileVersion ?? 'missing',
      'the new version is applied',
    ),
    check('turn-violations', 0, turnResult.violations.length, 'no continuity violation'),
  );

  // 2. Activation during a lane change.
  const lane = activatedFixture();
  lane.laneChange.current = laneChangeRead('COMMITTED', 0.4);
  const laneBefore = readManeuverSnapshot(lane.sources, 0);
  const laneResult = applyActivationDuringManeuver({
    ...lane.sources,
    activation: lane.activation,
    tick: 1,
  });
  scenarios.push(
    Object.freeze({
      name: 'lane change',
      status: laneResult.status,
      detail: Object.freeze({
        phase: laneResult.after?.laneChange?.phase ?? 'missing',
        targetLaneId: laneResult.after?.laneChange?.targetLaneId ?? 'missing',
        progress: laneResult.after?.laneChange?.progress ?? -1,
        startedTick: laneResult.after?.laneChange?.startedTick ?? -1,
        violations: laneResult.violations.join(',') || 'none',
      }),
    }),
  );
  checks.push(
    check('lane-status', 'APPLIED', laneResult.status, 'the lane change is not blocked'),
    check(
      'lane-phase',
      laneBefore?.laneChange?.phase ?? 'missing',
      laneResult.after?.laneChange?.phase ?? 'changed',
      'the committed phase survives',
    ),
    check(
      'lane-target',
      laneBefore?.laneChange?.targetLaneId ?? 'missing',
      laneResult.after?.laneChange?.targetLaneId ?? 'changed',
      'the target lane is not reset',
    ),
    check(
      'lane-progress',
      laneBefore?.laneChange?.progress ?? -1,
      laneResult.after?.laneChange?.progress ?? -2,
      'progress is not restarted',
    ),
    check(
      'lane-start',
      laneBefore?.laneChange?.startedTick ?? -1,
      laneResult.after?.laneChange?.startedTick ?? -2,
      'the manoeuvre start tick is unchanged',
    ),
    check(
      'lane-not-cancelled',
      false,
      laneResult.violations.includes('LANE_CHANGE_CANCELLED'),
      'no cancellation is reported',
    ),
  );

  // 3. Red light: an already evaluated opportunity keeps its decision.
  const red = activatedFixture();
  red.authority.current = manualRead();
  const redSetupResult = redSetup(red);
  const redBefore = readManeuverSnapshot(red.sources, 0);
  const redResult = applyActivationDuringManeuver({
    ...red.sources,
    activation: red.activation,
    tick: 1,
    memo: redSetupResult.memo,
    sampler: redSetupResult.sampler,
  });
  scenarios.push(
    Object.freeze({
      name: 'red opportunity cached',
      status: redResult.status,
      detail: Object.freeze({
        opportunityId: redSetupResult.opportunityId,
        decision: redResult.after?.signalOpportunity?.decision ?? 'missing',
        sampledTick: redResult.after?.signalOpportunity?.sampledTick ?? -1,
        sampledVersion: redResult.after?.signalOpportunity?.profileVersion ?? 'missing',
        samplerCalls: redSetupResult.counter.calls,
        cached: redSetupResult.memo.stats().cached,
      }),
    }),
  );
  checks.push(
    check('red-status', 'APPLIED', redResult.status, 'the activation is applied at the red light'),
    check(
      'red-before-decision',
      redSetupResult.sample.signature,
      redBefore?.signalOpportunity?.decision ?? 'missing',
      'the accepted snapshot already carries the evaluated decision',
    ),
    check(
      'red-decision',
      redSetupResult.sample.signature,
      redResult.after?.signalOpportunity?.decision ?? 'missing',
      'the evaluated decision is unchanged',
    ),
    check(
      'red-sampled-tick',
      redSetupResult.sample.sampledTick,
      redResult.after?.signalOpportunity?.sampledTick ?? -1,
      'the original sample tick is kept',
    ),
    check(
      'red-sampled-version',
      CONTINUITY_BASE_VERSION,
      redResult.after?.signalOpportunity?.profileVersion ?? 'missing',
      'the sample keeps the version that produced it',
    ),
    check(
      'red-sampler-calls',
      1,
      redSetupResult.counter.calls,
      'the policy is sampled exactly once',
    ),
    check(
      'red-cached',
      true,
      redSetupResult.memo.stats().cached >= 1,
      'the activation probe is a cache hit',
    ),
    check(
      'red-no-resample',
      false,
      redResult.violations.includes('OPPORTUNITY_RESAMPLED'),
      'no resampling violation',
    ),
  );

  // 4. A new opportunity after activation samples with the new active version.
  const counterV2 = { calls: 0 };
  const samplerV2 = signalSampler(red, CONTINUITY_NEXT_VERSION, counterV2, {
    ...redObservation(),
    tick: 60,
  });
  const nextOpportunityId = opportunity(600, red.vehicleId);
  const next = redSetupResult.memo.decideOnce(
    {
      vehicleId: red.vehicleId,
      opportunityId: nextOpportunityId,
      occurrence: 2,
      tick: 61,
      profileVersion: CONTINUITY_NEXT_VERSION,
    },
    samplerV2,
  );
  const old = redSetupResult.memo.peek({
    vehicleId: red.vehicleId,
    opportunityId: redSetupResult.opportunityId,
    occurrence: 1,
    tick: 0,
    profileVersion: CONTINUITY_BASE_VERSION,
  });
  scenarios.push(
    Object.freeze({
      name: 'new opportunity resampled',
      status: next.decision.profileVersionId ?? 'missing',
      detail: Object.freeze({
        newOpportunityId: nextOpportunityId,
        oldOpportunityId: redSetupResult.opportunityId,
        decision: next.signature,
        sampledVersion: next.profileVersion,
        samplerCalls: counterV2.calls,
      }),
    }),
  );
  checks.push(
    check(
      'new-distinct-opportunity',
      true,
      nextOpportunityId !== redSetupResult.opportunityId,
      'a new phase occurrence is a new identity',
    ),
    check('new-sampler-calls', 1, counterV2.calls, 'the new opportunity is sampled once'),
    check(
      'new-profile-version',
      CONTINUITY_NEXT_VERSION,
      next.profileVersion,
      'the new opportunity uses the new version',
    ),
    check(
      'new-decision-version',
      CONTINUITY_NEXT_VERSION,
      next.decision.profileVersionId ?? 'missing',
      'the real policy reports the new version',
    ),
    check(
      'new-decision',
      'STOP:STOP_LINE_APPROACH',
      next.signature,
      'the new opportunity is really evaluated by the 050 policy',
    ),
    check(
      'old-profile-version',
      CONTINUITY_BASE_VERSION,
      old?.profileVersion ?? 'missing',
      'the old opportunity keeps its version',
    ),
  );

  // 5. Manual priority: the seat and held command survive.
  const manual = activatedFixture();
  manual.registry.updateState(manual.vehicleId, { tick: 0, controlMode: 'MANUAL' });
  manual.authority.current = manualRead();
  const manualBefore = readManeuverSnapshot(manual.sources, 0);
  const manualResult = applyActivationDuringManeuver({
    ...manual.sources,
    activation: manual.activation,
    tick: 1,
  });
  scenarios.push(
    Object.freeze({
      name: 'manual priority',
      status: manualResult.status,
      detail: Object.freeze({
        controlMode: manualResult.after?.controlMode ?? 'missing',
        seat: manualResult.after?.manual?.seat ?? 'missing',
        commandId: manualResult.after?.manual?.command?.commandId ?? 'missing',
        throttle: manualResult.after?.manual?.command?.throttle ?? -1,
        manualPreserved: manualResult.manualPreserved,
      }),
    }),
  );
  checks.push(
    check(
      'manual-control-mode',
      'MANUAL',
      manualResult.after?.controlMode ?? 'missing',
      'the control mode is not changed',
    ),
    check(
      'manual-seat',
      manualBefore?.manual?.seat ?? 'missing',
      manualResult.after?.manual?.seat ?? 'changed',
      'the PLAYER seat is preserved',
    ),
    check(
      'manual-mode',
      manualBefore?.manual?.mode ?? 'missing',
      manualResult.after?.manual?.mode ?? 'changed',
      'the MANUAL authority mode is preserved',
    ),
    check(
      'manual-command',
      manualBefore?.manual?.command?.commandId ?? 'missing',
      manualResult.after?.manual?.command?.commandId ?? 'changed',
      'the held command still exists',
    ),
    check(
      'manual-throttle',
      manualBefore?.manual?.command?.throttle ?? -1,
      manualResult.after?.manual?.command?.throttle ?? -2,
      'the held input is not reset',
    ),
    check('manual-preserved', true, manualResult.manualPreserved, 'activation is not a takeover'),
    check(
      'manual-no-override',
      false,
      manualResult.violations.includes('MANUAL_COMMAND_OVERRIDDEN'),
      'no manual override is reported',
    ),
  );

  // 6. Injected speed reset is reported, never repaired.
  const reset = activatedFixture();
  let reads = 0;
  const resetResult = applyActivationDuringManeuver({
    ...reset.sources,
    vehicle: {
      vehicleId: reset.vehicleId,
      read: () => {
        reads += 1;
        return reads === 1 ? reset.motion : { ...reset.motion, speedMps: 0 };
      },
    },
    activation: reset.activation,
    tick: 1,
  });
  scenarios.push(
    Object.freeze({
      name: 'injected speed reset',
      status: resetResult.status,
      detail: Object.freeze({
        reportStatus: resetResult.report?.status ?? 'missing',
        violations: resetResult.violations.join(',') || 'none',
        readbackSpeedMps: resetResult.after?.speedMps ?? -1,
        version: resetResult.after?.appliedProfileVersion ?? 'missing',
      }),
    }),
  );
  checks.push(
    check('reset-blocked', 'BLOCKED', resetResult.status, 'a violated continuity is not certified'),
    check(
      'reset-violation',
      'SPEED_CHANGED',
      resetResult.violations[0] ?? 'missing',
      'the injected reset is the reported violation',
    ),
    check(
      'reset-report',
      'APPLIED',
      resetResult.report?.status ?? 'missing',
      'the real 110 result is kept, not repaired',
    ),
    check('reset-speed', 0, resetResult.after?.speedMps ?? -1, 'the real reset is visible'),
    check(
      'reset-version',
      CONTINUITY_NEXT_VERSION,
      resetResult.after?.appliedProfileVersion ?? 'missing',
      'the activation still reached the vehicle',
    ),
  );

  // 7. Sixty frames after the activation: no reapplication and no drift.
  const frames = activatedFixture();
  frames.laneChange.current = laneChangeRead('COMMITTED', 0.4);
  const frameRed = redSetup(frames);
  const frameResult = applyActivationDuringManeuver({
    ...frames.sources,
    activation: frames.activation,
    tick: 1,
    memo: frameRed.memo,
    sampler: frameRed.sampler,
  });
  const reference = frameResult.after;
  let idle = 0;
  let drift = 0;
  let changedDecisions = 0;
  for (let tick = 2; tick <= 60; tick += 1) {
    frames.setTick(tick);
    if (frames.activation.applyAt(tick).status === 'IDLE') idle += 1;
    const sample = frameRed.memo.decideOnce(
      {
        vehicleId: frames.vehicleId,
        opportunityId: frameRed.opportunityId,
        occurrence: 1,
        tick,
        profileVersion: CONTINUITY_NEXT_VERSION,
      },
      frameRed.sampler,
    );
    if (sample.sampledTick !== frameRed.sample.sampledTick) changedDecisions += 1;
    const snapshot = readManeuverSnapshot(frames.sources, tick);
    if (
      JSON.stringify(snapshot?.positionM) !== JSON.stringify(reference?.positionM) ||
      snapshot?.speedMps !== reference?.speedMps ||
      snapshot?.headingRad !== reference?.headingRad ||
      JSON.stringify(snapshot?.laneChange) !== JSON.stringify(reference?.laneChange) ||
      JSON.stringify(snapshot?.signalOpportunity) !== JSON.stringify(reference?.signalOpportunity)
    )
      drift += 1;
  }
  scenarios.push(
    Object.freeze({
      name: 'sixty frames',
      status: frameResult.status,
      detail: Object.freeze({
        idleFrames: idle,
        driftFrames: drift,
        samplerCalls: frameRed.counter.calls,
        cached: frameRed.memo.stats().cached,
        applied: frames.activation.stats().applied,
        vehiclesUpdated: frames.activation.stats().vehiclesUpdated,
      }),
    }),
  );
  checks.push(
    check('frames-idle', 59, idle, 'every frame after the common tick is idle'),
    check('frames-drift', 0, drift, 'no state drifts after activation'),
    check(
      'frames-sampler-calls',
      1,
      frameRed.counter.calls,
      'no frame re-samples the evaluated opportunity',
    ),
    check('frames-decisions', 0, changedDecisions, 'the cached decision never changes'),
    check(
      'frames-applied',
      1,
      frames.activation.stats().applied,
      'the command applies exactly once',
    ),
    check(
      'frames-writes',
      64,
      frames.activation.stats().vehiclesUpdated,
      'later frames write no vehicle',
    ),
    check(
      'frames-version',
      CONTINUITY_NEXT_VERSION,
      frames.registry.state(frames.vehicleId)?.appliedProfileVersion ?? 'missing',
      'the last frame still reads the applied version',
    ),
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: PROFILE_CONTINUITY_VERSION,
    appVersion: PROFILE_CONTINUITY_APP_VERSION,
    contract: Object.freeze({
      violations: Object.freeze([
        'POSITION_CHANGED',
        'SPEED_CHANGED',
        'HEADING_CHANGED',
        'CONTROL_MODE_CHANGED',
        'LANE_CHANGE_CANCELLED',
        'MANUAL_COMMAND_OVERRIDDEN',
        'OPPORTUNITY_RESAMPLED',
        'VERSION_NOT_APPLIED',
      ]),
      appErrors: Object.freeze([...profileContinuityAppErrors]),
      memoCapacity: createOpportunityDecisionMemo().capacity,
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

export function profileContinuityReportMarkdown(report: ProfileContinuityReport): string {
  const scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

Status: \`${entry.status}\`

| Field | Value |
| --- | --- |
${Object.entries(entry.detail)
  .map(([key, value]) => `| ${key} | ${String(value)} |`)
  .join('\n')}
`,
      )
      .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
      )
      .join('\n');
  return `# 111 profile continuity report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run profile:continuity\`;
it contains no wall-clock value, random value or browser-only state.

Version: \`${report.version}\`; composition: \`${report.appVersion}\`.

## Contract

Closed violations: ${report.contract.violations.join(', ')}.
Composition errors: ${report.contract.appErrors.join(', ')}.
Bounded opportunity memo: ${report.contract.memoCapacity} decisions.

${scenarioSections}
## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Scenarios: ${report.summary.scenarios}
- Checks: ${report.summary.passed}/${report.summary.checks}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}
