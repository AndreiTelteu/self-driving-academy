import {
  MISSION_BASE_CAPABILITIES,
  MISSION_REWARD_IDENTITY,
  REWARDS_LIMITS,
  REWARDS_SCHEMA_VERSION,
  campaignMissionStates,
  campaignOrder,
  createCampaignMissionCatalog,
  createMissionRewardsLedger,
  missionCapabilityKinds,
  missionDuplicateReasons,
  missionRewardGrantStatuses,
  missionRewardId,
  missionSettlementStatuses,
  missionVehicleAccess,
} from '../../src/missions';
import type {
  CampaignProgress,
  MissionCompletionResult,
  MissionRewardsSnapshot,
  MissionUnlockSnapshot,
  MissionVehicleAccess,
} from '../../src/missions';
import { createMissionTestTracker } from './mission-fixture';
import {
  completeCampaign,
  completeMission,
  completionTick,
  createRewardsFleet,
  createRewardsTracker,
  replayMission,
  upgradedCampaignCatalog,
} from './mission-rewards-fixture';

/**
 * Deterministic report for PBI 125.
 *
 * Every number comes from the real 116 lifecycle (a mission completes only through its authored
 * objective and validated 007 events), the real 057 fleet and the real 125 read models. The fixture
 * authors only which real events happen; no wall clock, random source or browser participates. The
 * sequential scenario is executed twice and the two transcripts must be byte-identical.
 */
export const MISSION_REWARDS_REPORT_VERSION = '125-mission-rewards-report-v1' as const;

export interface MissionRewardsReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface MissionRewardsReportCompletion {
  readonly missionId: string;
  readonly attempt: number;
  readonly status: string;
  readonly rewardsGranted: number;
  readonly rewardsDuplicate: number;
  readonly xpGranted: number;
  readonly unlocked: readonly string[];
  readonly campaignState: string;
  readonly xpTotal: number;
  readonly grantsTotal: number;
  readonly capabilitiesTotal: number;
}

export interface MissionRewardsReportAccess {
  readonly checkpoint: string;
  readonly capabilities: number;
  readonly taxis: number;
  readonly taxisSelectable: number;
  readonly vehicles: number;
  readonly vehiclesDriveable: number;
  readonly civilians: number;
  readonly revoked: number;
  readonly blockedTaxis: number;
  readonly baseCapabilitiesPresent: boolean;
}

export interface MissionRewardsReportReset {
  readonly missionId: string;
  readonly clearedCompletions: number;
  readonly resets: number;
  readonly rewardsRetained: number;
  readonly unlocksRetained: number;
  readonly state: string;
  readonly attempts: number;
  readonly nextAttempt: number | null;
  readonly playable: boolean;
  readonly xpTotal: number;
  readonly grantsTotal: number;
}

interface SequentialTranscript {
  readonly completions: readonly MissionRewardsReportCompletion[];
  readonly repeats: readonly MissionRewardsReportCompletion[];
  readonly access: readonly MissionRewardsReportAccess[];
  readonly unlockOrder: readonly string[];
  readonly grantedRewards: number;
  readonly duplicateRewards: number;
  readonly xp: number;
  readonly unlocks: number;
  readonly profileWrites: number;
  readonly learningJobs: number;
}

export interface MissionRewardsReport {
  readonly version: typeof MISSION_REWARDS_REPORT_VERSION;
  readonly contract: Readonly<{
    schema: string;
    campaignOrder: readonly string[];
    states: readonly string[];
    settlementStatuses: readonly string[];
    rewardStatuses: readonly string[];
    duplicateReasons: readonly string[];
    capabilityKinds: readonly string[];
    baseCapabilities: readonly string[];
    identity: Readonly<{
      id: string;
      rewardKey: string;
      completionKey: string;
      xpScope: string;
      unlockScope: string;
      replayGrants: boolean;
    }>;
    limits: Readonly<{
      missions: number;
      completionsPerMission: number;
      completions: number;
      rewards: number;
      capabilities: number;
      vehicles: number;
    }>;
  }>;
  readonly completions: readonly MissionRewardsReportCompletion[];
  readonly repeats: readonly MissionRewardsReportCompletion[];
  readonly access: readonly MissionRewardsReportAccess[];
  readonly resets: readonly MissionRewardsReportReset[];
  readonly upgraded: Readonly<{
    definitionVersion: string;
    status: string;
    xpGranted: number;
    rewardIdChanged: boolean;
  }>;
  readonly totals: Readonly<{
    settlements: number;
    grantedRewards: number;
    duplicateRewards: number;
    xp: number;
    unlocks: number;
    profileWrites: number;
    learningJobs: number;
  }>;
  readonly checks: readonly MissionRewardsReportCheck[];
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
): MissionRewardsReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function progressState(progress: CampaignProgress, missionId: string): string {
  return progress.missions.find((mission) => mission.missionId === missionId)?.state ?? 'MISSING';
}

function completionRow(
  result: MissionCompletionResult,
  progress: CampaignProgress,
  rewards: MissionRewardsSnapshot,
  unlocks: MissionUnlockSnapshot,
): MissionRewardsReportCompletion {
  return Object.freeze({
    missionId: result.missionId,
    attempt: result.attempt,
    status: result.status,
    rewardsGranted: result.rewardsGranted,
    rewardsDuplicate: result.rewardsDuplicate,
    xpGranted: result.xpGranted,
    unlocked: result.unlocked,
    campaignState: progressState(progress, result.missionId),
    xpTotal: rewards.totals.xp,
    grantsTotal: rewards.totals.granted,
    capabilitiesTotal: unlocks.counts.granted,
  });
}

function accessRow(
  checkpoint: string,
  unlocks: MissionUnlockSnapshot,
  access: MissionVehicleAccess,
): MissionRewardsReportAccess {
  return Object.freeze({
    checkpoint,
    capabilities: unlocks.counts.granted,
    taxis: access.taxis,
    taxisSelectable: access.taxisSelectable,
    vehicles: access.vehicles,
    vehiclesDriveable: access.vehiclesDriveable,
    civilians: access.civilians,
    revoked: access.revoked.length,
    blockedTaxis: access.blockedTaxis.length,
    baseCapabilitiesPresent: access.baseCapabilitiesPresent,
  });
}

/** One full campaign plus one real replay, on a fresh 116 tracker and a fresh 057 fleet. */
function sequentialTranscript(): SequentialTranscript {
  const tracker = createRewardsTracker();
  const ledger = createMissionRewardsLedger({ catalog: tracker.catalog() });
  const fleet = createRewardsFleet();
  const completions: MissionRewardsReportCompletion[] = [];
  const repeats: MissionRewardsReportCompletion[] = [];
  const access: MissionRewardsReportAccess[] = [];
  let grantedRewards = 0;
  let duplicateRewards = 0;
  let xp = 0;
  let profileWrites = 0;
  let learningJobs = 0;
  try {
    access.push(
      accessRow(
        'before any mission',
        ledger.unlocks(),
        missionVehicleAccess(ledger.unlocks(), fleet.list()),
      ),
    );
    const ids = campaignOrder(tracker.catalog());
    let nextTick = 100;
    let first = null as ReturnType<typeof completeMission> | null;
    for (const missionId of ids) {
      const instance = completeMission(tracker, missionId, nextTick);
      nextTick = completionTick(instance) + 10;
      first = first ?? instance;
      const result = ledger.settle({ instance });
      grantedRewards += result.rewardsGranted;
      duplicateRewards += result.rewardsDuplicate;
      xp += result.xpGranted;
      profileWrites += result.profileWrites;
      learningJobs += result.learningJobs;
      completions.push(
        completionRow(result, ledger.progress(), ledger.rewards(), ledger.unlocks()),
      );
      access.push(
        accessRow(
          `after ${missionId}`,
          ledger.unlocks(),
          missionVehicleAccess(ledger.unlocks(), fleet.list()),
        ),
      );
    }
    if (first === null) throw new Error('The 125 report completed no mission');
    // A real 116 replay: a new completion with the same authored reward identity.
    const replay = replayMission(tracker, first, nextTick);
    const replayResult = ledger.settle({ instance: replay });
    grantedRewards += replayResult.rewardsGranted;
    duplicateRewards += replayResult.rewardsDuplicate;
    xp += replayResult.xpGranted;
    profileWrites += replayResult.profileWrites;
    learningJobs += replayResult.learningJobs;
    repeats.push(
      completionRow(replayResult, ledger.progress(), ledger.rewards(), ledger.unlocks()),
    );
    return {
      completions: Object.freeze(completions),
      repeats: Object.freeze(repeats),
      access: Object.freeze(access),
      unlockOrder: Object.freeze(
        ledger.unlocks().capabilities.map((capability) => capability.capabilityId),
      ),
      grantedRewards,
      duplicateRewards,
      xp,
      unlocks: ledger.unlocks().counts.granted,
      profileWrites,
      learningJobs,
    };
  } finally {
    fleet.dispose();
    tracker.dispose();
  }
}

export async function runMissionRewardsReport(): Promise<MissionRewardsReport> {
  const sequential = sequentialTranscript();
  const secondRun = sequentialTranscript();
  const deterministic =
    JSON.stringify(sequential) === JSON.stringify(secondRun) &&
    sequential.completions.length === 8 &&
    sequential.repeats.length === 1;

  const resets: MissionRewardsReportReset[] = [];
  const resetTracker = createRewardsTracker();
  const resetLedger = createMissionRewardsLedger({ catalog: resetTracker.catalog() });
  let resetXp = 0;
  let resetGrants = 0;
  let regrant: MissionCompletionResult | null = null;
  let regrantXp = 0;
  let resetProfileWrites = 0;
  try {
    const run = completeCampaign(resetTracker, { through: 'campaign-5-passenger' });
    for (const completion of run.completions) {
      const settled = resetLedger.settle({ instance: completion.instance });
      resetProfileWrites += settled.profileWrites;
    }
    resetXp = resetLedger.rewards().totals.xp;
    resetGrants = resetLedger.rewards().totals.granted;
    const last = completionTick(run.completions.at(-1)!.instance);
    for (const [missionId, atTick] of [
      ['campaign-5-passenger', last + 1],
      ['campaign-1-first-taxi', last + 2],
    ] as const) {
      const reset = resetLedger.resetMission({ missionId, tick: atTick });
      resetProfileWrites += reset.profileWrites;
      resets.push(
        Object.freeze({
          missionId: reset.missionId,
          clearedCompletions: reset.clearedCompletions,
          resets: reset.resets,
          rewardsRetained: reset.rewardsRetained,
          unlocksRetained: reset.unlocksRetained,
          state: reset.progress.state,
          attempts: reset.progress.attempts,
          nextAttempt: reset.progress.nextAttempt,
          playable: reset.progress.playable,
          xpTotal: resetLedger.rewards().totals.xp,
          grantsTotal: resetLedger.rewards().totals.granted,
        }),
      );
    }
    // Scenario boundary: both the 116 tracker and the reset 125 mission start over.
    resetTracker.reset({ tick: 900 });
    const again = completeMission(resetTracker, 'campaign-1-first-taxi', 1_000);
    regrant = resetLedger.settle({ instance: again });
    regrantXp = resetLedger.rewards().totals.xp;
  } finally {
    resetTracker.dispose();
  }

  const upgraded = upgradedCampaignCatalog();
  const upgradedLedger = createMissionRewardsLedger({ catalog: upgraded });
  const upgradedTracker = createMissionTestTracker({ catalog: upgraded });
  let upgradedStatus = 'MISSING';
  let upgradedXp = 0;
  let upgradedProfileWrites = 0;
  let rewardIdChanged = false;
  try {
    const instance = completeMission(upgradedTracker, 'campaign-1-first-taxi', 100);
    const result = upgradedLedger.settle({ instance });
    upgradedStatus = result.status;
    upgradedXp = result.xpGranted;
    upgradedProfileWrites += result.profileWrites;
    // The expected identities are computed from the same stable 116 rule the ledger uses.
    const contractNamespace = upgraded.namespace;
    const v1 = missionRewardId(contractNamespace, 'campaign-1-first-taxi', '1', 'xp');
    const v2 = missionRewardId(contractNamespace, 'campaign-1-first-taxi', '2', 'xp');
    const grant = upgradedLedger
      .rewards()
      .grants.find((candidate) => candidate.definitionRewardId === 'xp');
    rewardIdChanged = v1 !== v2 && grant !== undefined && grant.rewardId === v2;
  } finally {
    upgradedTracker.dispose();
  }

  const contractCatalog = createCampaignMissionCatalog();
  const order = campaignOrder(contractCatalog);
  const authoredUnlocks = order.flatMap((missionId) => {
    const definition = contractCatalog.missions.find((mission) => mission.missionId === missionId);
    if (definition === undefined) throw new Error(`Unknown campaign mission ${missionId}`);
    return definition.rewards
      .map((reward) => reward.unlockId)
      .filter((unlockId): unlockId is string => unlockId !== null);
  });
  const firstCompletion = sequential.completions[0]!;
  const lastCompletion = sequential.completions.at(-1)!;
  const replayRow = sequential.repeats[0]!;
  const checks: readonly MissionRewardsReportCheck[] = Object.freeze([
    check('campaign-missions', 8, sequential.completions.length, 'the full 116 campaign completed'),
    check(
      'campaign-order',
      order.join(','),
      sequential.completions.map((row) => row.missionId).join(','),
      'completions follow the prerequisite DAG',
    ),
    check(
      'base-capabilities',
      4,
      MISSION_BASE_CAPABILITIES.length,
      'two access capabilities plus two real 023 classes',
    ),
    check('first-status', 'GRANTED', firstCompletion.status, 'the first completion pays'),
    check('first-xp', 100, firstCompletion.xpGranted, 'the authored XP amount'),
    check(
      'first-unlocked',
      'challenge:first-demonstration',
      firstCompletion.unlocked.join(','),
      'the authored challenge',
    ),
    check('last-state', 'COMPLETED', lastCompletion.campaignState, 'the campaign ends completed'),
    check('total-grants', 16, sequential.grantedRewards, 'eight missions times two rewards'),
    check('total-xp', 800, sequential.xp, 'eight authored XP rewards'),
    check('total-unlocks', 8, sequential.unlocks, 'one unlock per mission'),
    check(
      'unlock-order',
      authoredUnlocks.join(','),
      sequential.unlockOrder.join(','),
      'unlocks are appended in campaign order',
    ),
    check(
      'replay-status',
      'NO_REWARD',
      replayRow.status,
      'a replay is a new completion that pays nothing',
    ),
    check('replay-granted', 0, replayRow.rewardsGranted, 'no reward is granted twice'),
    check(
      'replay-duplicates',
      2,
      replayRow.rewardsDuplicate,
      'both authored rewards are duplicates',
    ),
    check('replay-attempt', 2, replayRow.attempt, 'the real 116 replay is the second attempt'),
    check('replay-xp', 800, replayRow.xpTotal, 'the XP total did not change'),
    check('replay-grants', 16, replayRow.grantsTotal, 'no extra grant row'),
    check('replay-capabilities', 8, replayRow.capabilitiesTotal, 'the unlock list did not change'),
    check(
      'access-checkpoints',
      9,
      sequential.access.length,
      'base access and one checkpoint after every unlock',
    ),
    check(
      'access-taxis',
      true,
      sequential.access.every((row) => row.taxis === 24 && row.taxisSelectable === 24),
      'all 24 real taxis stay selectable at every checkpoint',
    ),
    check(
      'access-vehicles',
      true,
      sequential.access.every((row) => row.vehicles === 64 && row.vehiclesDriveable === 64),
      'all 64 real vehicles stay driveable at every checkpoint',
    ),
    check(
      'access-revoked',
      0,
      sequential.access.reduce((total, row) => total + row.revoked, 0),
      'no access is ever revoked',
    ),
    check(
      'access-blocked-taxis',
      0,
      sequential.access.reduce((total, row) => total + row.blockedTaxis, 0),
      'no taxi is ever blocked',
    ),
    check(
      'access-base-present',
      true,
      sequential.access.every((row) => row.baseCapabilitiesPresent),
      'base capabilities are present at every checkpoint',
    ),
    check(
      'access-classes',
      true,
      sequential.access.every((row) => row.vehiclesDriveable === row.vehicles),
      'every real class keeps every vehicle',
    ),
    check('reset-count', 2, resets.length, 'two missions reset'),
    check(
      'reset-cleared',
      1,
      resets[0]?.clearedCompletions ?? null,
      'one completion record per mission',
    ),
    check(
      'reset-state',
      'AVAILABLE',
      resets[0]?.state ?? null,
      'the reset mission is playable again',
    ),
    check('reset-attempts', 0, resets[0]?.attempts ?? null, 'the attempt counter starts over'),
    check(
      'reset-next-attempt',
      1,
      resets[0]?.nextAttempt ?? null,
      'the next attempt is the first one',
    ),
    check(
      'reset-rewards-retained',
      resetGrants,
      resets.at(-1)?.rewardsRetained ?? null,
      'every granted reward is kept',
    ),
    check(
      'reset-unlocks-retained',
      5,
      resets.at(-1)?.unlocksRetained ?? null,
      'every unlock is kept',
    ),
    check('reset-xp', 500, resetXp, 'the XP total before the resets'),
    check(
      'reset-keeps-xp',
      500,
      resets.at(-1)?.xpTotal ?? null,
      'the XP total survives both resets',
    ),
    check(
      'reset-no-regrant',
      'NO_REWARD',
      regrant === null ? 'MISSING' : regrant.status,
      're-completing after the reset grants nothing new',
    ),
    check('reset-no-regrant-xp', 500, regrantXp, 'the XP total is unchanged by the re-completion'),
    check(
      'upgraded-status',
      'GRANTED',
      upgradedStatus,
      'a new definition version is a new authored reward',
    ),
    check('upgraded-xp', 100, upgradedXp, 'the new version pays its own XP'),
    check(
      'upgraded-identity',
      true,
      rewardIdChanged,
      'the reward identity changes with the version',
    ),
    check(
      'structural-read-only',
      0,
      sequential.profileWrites +
        sequential.learningJobs +
        resetProfileWrites +
        upgradedProfileWrites +
        (regrant === null ? 1 : regrant.profileWrites + regrant.learningJobs),
      'no profile write and no learning job anywhere',
    ),
    check('determinism', true, deterministic, 'two independent transcripts are byte-identical'),
  ]);

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: MISSION_REWARDS_REPORT_VERSION,
    contract: Object.freeze({
      schema: REWARDS_SCHEMA_VERSION,
      campaignOrder: order,
      states: Object.freeze([...campaignMissionStates]),
      settlementStatuses: Object.freeze([...missionSettlementStatuses]),
      rewardStatuses: Object.freeze([...missionRewardGrantStatuses]),
      duplicateReasons: Object.freeze([...missionDuplicateReasons]),
      capabilityKinds: Object.freeze([...missionCapabilityKinds]),
      baseCapabilities: Object.freeze(
        MISSION_BASE_CAPABILITIES.map((capability) => capability.capabilityId),
      ),
      identity: Object.freeze({
        id: MISSION_REWARD_IDENTITY.id,
        rewardKey: MISSION_REWARD_IDENTITY.rewardKey,
        completionKey: MISSION_REWARD_IDENTITY.completionKey,
        xpScope: MISSION_REWARD_IDENTITY.xpScope,
        unlockScope: MISSION_REWARD_IDENTITY.unlockScope,
        replayGrants: MISSION_REWARD_IDENTITY.replayGrants,
      }),
      limits: Object.freeze({
        missions: REWARDS_LIMITS.missions,
        completionsPerMission: REWARDS_LIMITS.completionsPerMission,
        completions: REWARDS_LIMITS.completions,
        rewards: REWARDS_LIMITS.rewards,
        capabilities: REWARDS_LIMITS.capabilities,
        vehicles: REWARDS_LIMITS.vehicles,
      }),
    }),
    completions: sequential.completions,
    repeats: sequential.repeats,
    access: sequential.access,
    resets: Object.freeze(resets),
    upgraded: Object.freeze({
      definitionVersion: '2',
      status: upgradedStatus,
      xpGranted: upgradedXp,
      rewardIdChanged,
    }),
    totals: Object.freeze({
      settlements: sequential.completions.length + sequential.repeats.length,
      grantedRewards: sequential.grantedRewards,
      duplicateRewards: sequential.duplicateRewards,
      xp: sequential.xp,
      unlocks: sequential.unlocks,
      profileWrites: sequential.profileWrites + resetProfileWrites + upgradedProfileWrites,
      learningJobs: sequential.learningJobs,
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      scenarios: 3,
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

export function missionRewardsReportMarkdown(report: MissionRewardsReport): string {
  const lines: string[] = [];
  lines.push(
    '# 125 "progress, rewards and unlocks" report',
    '',
    'Machine-readable transcript: [report.json](report.json). Generated by ' +
      code('npm run missions:rewards') +
      '; no wall clock, random source or browser state participates. Version: ' +
      code(report.version) +
      '.',
    '',
    '## Contract',
    '',
    `Schema ${code(report.contract.schema)}. Reward identity ${code(report.contract.identity.id)}: ` +
      `${code(report.contract.identity.rewardKey)}; completion identity: ` +
      `${code(report.contract.identity.completionKey)}.`,
    '',
    `Base capabilities: ${report.contract.baseCapabilities.map((id) => code(id)).join(', ')}.`,
    '',
    '## Campaign completions',
    '',
    '| Mission | Attempt | Status | Granted | Duplicate | XP | Unlocked | State | XP total | Grants | Capabilities |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.completions.map(
      (row) =>
        `| ${row.missionId} | ${row.attempt} | ${code(row.status)} | ${row.rewardsGranted} | ${row.rewardsDuplicate} | ${row.xpGranted} | ${row.unlocked.join(', ') || '—'} | ${code(row.campaignState)} | ${row.xpTotal} | ${row.grantsTotal} | ${row.capabilitiesTotal} |`,
    ),
    '',
    '## Repeated and replayed completions',
    '',
    '| Mission | Attempt | Status | Granted | Duplicate | XP total | Grants total | Capabilities total |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.repeats.map(
      (row) =>
        `| ${row.missionId} | ${row.attempt} | ${code(row.status)} | ${row.rewardsGranted} | ${row.rewardsDuplicate} | ${row.xpTotal} | ${row.grantsTotal} | ${row.capabilitiesTotal} |`,
    ),
    '',
    '## Access after every unlock',
    '',
    '| Checkpoint | Capabilities | Taxis | Selectable taxis | Vehicles | Driveable | Civilians | Revoked | Blocked taxis | Base present |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.access.map(
      (row) =>
        `| ${row.checkpoint} | ${row.capabilities} | ${row.taxis} | ${row.taxisSelectable} | ${row.vehicles} | ${row.vehiclesDriveable} | ${row.civilians} | ${row.revoked} | ${row.blockedTaxis} | ${row.baseCapabilitiesPresent ? 'yes' : 'no'} |`,
    ),
    '',
    '## Mission resets',
    '',
    '| Mission | Cleared completions | Resets | Rewards retained | Unlocks retained | State | Attempts | Next attempt | Playable | XP total | Grants total |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.resets.map(
      (row) =>
        `| ${row.missionId} | ${row.clearedCompletions} | ${row.resets} | ${row.rewardsRetained} | ${row.unlocksRetained} | ${code(row.state)} | ${row.attempts} | ${cell(row.nextAttempt)} | ${row.playable ? 'yes' : 'no'} | ${row.xpTotal} | ${row.grantsTotal} |`,
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
    '- Deterministic Node run: every completion comes from the real 116 tracker and every vehicle',
    '  from the real 057 registry, but there is no browser, renderer or human session.',
    '- The authored part is the player behaviour: which real 007 events satisfy each objective.',
    '- The module is a domain contract: it has no HUD, panel or `main.ts` composition.',
    '- Persistence of the reward ledger in a savefile is out of scope (127-136).',
    '- No FPS, frame, GPU or hardware measurement is claimed.',
    '',
  );
  return lines.join('\n');
}
