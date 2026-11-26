import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionFlow } from '../../src/app/session-flow';
import type { SessionFlow } from '../../src/app/session-flow';
import { createMemorySessionKindStore } from '../../src/persistence';
import type {
  MemorySessionKindStore,
  SessionKind,
  SessionLaunch,
  SessionWorldIdentity,
} from '../../src/persistence';
import {
  ACADEMY_SESSION_ID,
  CHAOS_SESSION_ID,
  chaosManualStart,
  chaosProfileCopy,
  createTestWorldPort,
  fixedClock,
  sessionEconomyFixture,
  sessionHostFixture,
  type SessionEconomyFixture,
  type TestWorldPort,
} from '../persistence/session-kinds-fixture';

interface FlowFixture {
  readonly flow: SessionFlow;
  readonly store: MemorySessionKindStore;
  readonly world: TestWorldPort;
  readonly economy: SessionEconomyFixture;
  readonly launches: readonly { launch: SessionLaunch; identity: SessionWorldIdentity }[];
  readonly kpi: { rides: number; rating: number };
}

function flowFixture(): FlowFixture {
  const economy = sessionEconomyFixture();
  const host = sessionHostFixture();
  const store = createMemorySessionKindStore();
  const world = createTestWorldPort();
  const launches: { launch: SessionLaunch; identity: SessionWorldIdentity }[] = [];
  const kpi = { rides: 3, rating: 4.5 };
  const flow = createSessionFlow({
    store,
    world,
    academyProfile: economy.profile,
    chaosProfile: chaosProfileCopy(economy.profile),
    academySessionId: ACADEMY_SESSION_ID,
    chaosSessionId: CHAOS_SESSION_ID,
    now: fixedClock(),
    ledgers: { daily: economy.daily, xp: economy.xp, campaign: economy.campaign },
    kpi: () => kpi,
    onLaunch: (launch, identity) => launches.push({ launch, identity }),
  });
  // host-ul 225 din fixture nu este folosit de flow; păstrarea lui dovedește că fixture-ul
  // pornește de la aceleași contracte reale, nu dintr-o copie paralelă.
  assert.equal(host.copy.sessionId, CHAOS_SESSION_ID);
  return { flow, store, world, economy, launches, kpi };
}

function assertPausedAuto(launch: SessionLaunch): void {
  assert.equal(launch.mode, 'PAUSED_AUTO');
  assert.equal(launch.paused, true);
  assert.equal(launch.auto, true);
  assert.equal(launch.inputReleased, true);
  assert.equal(launch.manualVehicles, 0);
}

test('261 the menu offers Academy and Chaos with distinct identity and profile', async () => {
  const f = flowFixture();
  assert.equal(f.flow.menu().live, null);
  const labels = f.flow.menu().choices.map((choice) => choice.label);
  assert.deepEqual(labels, ['Academie', 'Joacă liberă / Haos']);
  const started = await f.flow.choose('ACADEMY');
  assert.equal(started.status, 'STARTED');
  const menu = f.flow.menu();
  assert.equal(menu.live, 'ACADEMY');
  assert.equal(menu.ledgerIsolation, true);
  const academy = menu.choices.find((choice) => choice.kind === 'ACADEMY')!;
  const chaos = menu.choices.find((choice) => choice.kind === 'CHAOS')!;
  assert.equal(academy.live, true);
  assert.equal(chaos.live, false);
  assert.notEqual(academy.sessionId, chaos.sessionId);
  assert.notEqual(academy.profileId, chaos.profileId);
  assert.match(academy.profileId, /^profile-1/);
  assert.match(chaos.profileId, /^chaos:/);
  assert.equal(academy.checkpoints, 0);
  assert.equal(chaos.checkpoints, 0);
  assert.equal(f.launches.length, 1);
  assertPausedAuto(f.launches[0]!.launch);
  assert.equal(f.launches[0]!.identity.sessionKind, 'ACADEMY');
});

test('261 a switch closes the segment, commits one checkpoint, cancels old jobs and relaunches PAUSED_AUTO', async () => {
  const f = flowFixture();
  await f.flow.choose('ACADEMY');
  const before = f.flow.menu();
  const swapped = await f.flow.choose('CHAOS');
  assert.equal(swapped.status, 'SWITCHED');
  if (swapped.status !== 'SWITCHED') return;
  assert.equal(swapped.from, 'ACADEMY');
  assert.equal(swapped.to, 'CHAOS');
  assert.equal(swapped.closedSegments, 1);
  assert.equal(swapped.invalidatedJobs, 2);
  assert.equal(swapped.releasedInputs, 2);
  assertPausedAuto(swapped.launch);
  assert.equal(swapped.launch.vehiclesInAuto, 4);
  assert.equal(swapped.launch.previousManualVehicles, 1);
  assert.equal(f.launches.length, 2);
  assert.equal(f.launches[1]!.identity.sessionKind, 'CHAOS');

  const after = f.flow.menu();
  assert.equal(after.live, 'CHAOS');
  const academy = after.choices.find((choice) => choice.kind === 'ACADEMY')!;
  const chaos = after.choices.find((choice) => choice.kind === 'CHAOS')!;
  assert.equal(academy.checkpoints, 1);
  assert.equal(academy.worldEpoch, before.choices[0]!.worldEpoch + 1);
  assert.equal(chaos.checkpoints, 0);
  assert.equal(chaos.learningEpoch, 0);
  assert.equal(
    f.flow.observeTick({
      tick: 1,
      sessionId: CHAOS_SESSION_ID,
      worldEpoch: 1,
      learningEpoch: 0,
    }),
    true,
  );
  assert.equal(
    f.flow.observeTick({
      tick: 2,
      sessionId: ACADEMY_SESSION_ID,
      worldEpoch: 2,
      learningEpoch: 0,
    }),
    false,
  );
  assert.equal(f.flow.status().contextMismatches, 1);
  assert.deepEqual(f.world.orphans(), []);
  assert.equal(f.flow.status().resident.liveWorlds, 1);
  assert.equal(f.store.stats().rows.ACADEMY, 1);
  assert.equal(f.store.stats().rows.CHAOS, 0);
});

test('261 a failed save keeps the current world and does not advance the epochs', async () => {
  const f = flowFixture();
  await f.flow.choose('ACADEMY');
  f.store.failNextCommit();
  const failed = await f.flow.choose('CHAOS');
  assert.equal(failed.status, 'REJECTED');
  if (failed.status === 'REJECTED') {
    assert.equal(failed.code, 'SAVE_FAILED');
    assert.equal(failed.world, 'ACADEMY');
    assert.equal(failed.closedSegments, 1);
  }
  const menu = f.flow.menu();
  assert.equal(menu.live, 'ACADEMY');
  assert.equal(menu.choices[0]!.worldEpoch, 1);
  assert.equal(menu.choices[0]!.learningEpoch, 0);
  assert.equal(menu.choices[0]!.checkpoints, 0);
  assert.equal(f.store.stats().committed, 0);
  const live = f.world.worlds.find((world) => world.live);
  assert.ok(live !== undefined);
  assert.equal(live.jobs, 2);
  assert.equal(live.inputs, 2);
  assert.deepEqual(f.world.orphans(), []);
  assert.equal(f.launches.length, 1);

  const retry = await f.flow.choose('CHAOS');
  assert.equal(retry.status, 'SWITCHED');
  assert.equal(f.flow.menu().live, 'CHAOS');
});

test('261 a reset commits SCENARIO_RESET first, advances both epochs and preserves style/XP/daily/rewards/KPI', async () => {
  const f = flowFixture();
  await f.flow.choose('ACADEMY');
  const before = f.flow.fingerprint();
  assert.ok(before !== null);
  assert.ok(before!.counts.xpBalanceMicroXp >= 0);
  const balanceBefore = before!.counts.xpBalanceMicroXp;
  const dailyBefore = before!.counts.dailyRewards;
  const rewardsBefore = before!.counts.rewardGrants;
  const kpiBefore = f.kpi.rating;

  const reset = await f.flow.resetWorld();
  assert.equal(reset.status, 'RESET');
  if (reset.status !== 'RESET') return;
  assert.equal(reset.sessionKind, 'ACADEMY');
  assert.deepEqual(reset.previousEpochs, { worldEpoch: 1, learningEpoch: 0 });
  assert.deepEqual(reset.epochs, { worldEpoch: 2, learningEpoch: 1 });
  assert.equal(reset.checkpointId, `reset:${ACADEMY_SESSION_ID}:2`);
  assert.equal(reset.closedSegments, 1);
  assert.equal(reset.invalidatedJobs, 2);
  assert.equal(reset.releasedInputs, 2);
  assertPausedAuto(reset.launch);
  assert.equal(reset.missionCompletions, 0);
  assert.equal(reset.rewardGrants, 0);
  assert.equal(reset.preserved.xp, true);
  assert.equal(reset.preserved.daily, true);
  assert.equal(reset.preserved.rewards, true);
  assert.equal(reset.preserved.kpi, true);
  assert.equal(reset.preserved.profile, true);
  assert.equal(reset.preserved.style, true);

  const after = f.flow.fingerprint();
  assert.ok(after !== null);
  assert.equal(after!.counts.xpBalanceMicroXp, balanceBefore);
  assert.equal(after!.counts.dailyRewards, dailyBefore);
  assert.equal(after!.counts.rewardGrants, rewardsBefore);
  assert.equal(f.kpi.rating, kpiBefore);
  assert.equal(after!.daily, before!.daily);
  assert.equal(after!.xp, before!.xp);
  assert.equal(after!.campaign, before!.campaign);
  assert.equal(after!.kpi, before!.kpi);

  const menu = f.flow.menu();
  const academy = menu.choices.find((choice) => choice.kind === 'ACADEMY')!;
  assert.equal(menu.live, 'ACADEMY');
  assert.equal(academy.worldEpoch, 2);
  assert.equal(academy.learningEpoch, 1);
  assert.equal(academy.checkpoints, 1);
  assert.equal(academy.lastCheckpointId, reset.checkpointId);
  const rows = await f.store.list('ACADEMY');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.reason, 'SCENARIO_RESET');
  assert.equal(rows[0]!.worldEpoch, 2);
  assert.equal(rows[0]!.learningEpoch, 1);
  assert.equal(rows[0]!.launch, 'PAUSED_AUTO');
  assert.deepEqual(f.world.orphans(), []);
  assert.equal(f.flow.status().resets, 1);
  assert.equal(f.flow.status().lastReset?.checkpointId, reset.checkpointId);
  assert.equal(f.launches.at(-1)!.identity.worldEpoch, 2);
  assert.equal(f.launches.at(-1)!.identity.learningEpoch, 1);
});

test('261 a failed reset save keeps the world and both epochs exactly as they were', async () => {
  const f = flowFixture();
  await f.flow.choose('ACADEMY');
  f.store.failNextCommit();
  const reset = await f.flow.resetWorld();
  assert.equal(reset.status, 'REJECTED');
  if (reset.status === 'REJECTED') {
    assert.equal(reset.code, 'SAVE_FAILED');
    assert.equal(reset.world, 'ACADEMY');
    assert.equal(reset.checkpointId, `reset:${ACADEMY_SESSION_ID}:2`);
  }
  const menu = f.flow.menu();
  assert.equal(menu.live, 'ACADEMY');
  assert.equal(menu.choices[0]!.worldEpoch, 1);
  assert.equal(menu.choices[0]!.learningEpoch, 0);
  assert.equal(menu.choices[0]!.checkpoints, 0);
  assert.equal(f.store.stats().committed, 0);
  const live = f.world.worlds.find((world) => world.live);
  assert.equal(live?.jobs, 2);
  assert.equal(live?.inputs, 2);
  assert.deepEqual(f.world.orphans(), []);
});

test('261 a late result from another session is refused with a closed reason', async () => {
  const f = flowFixture();
  await f.flow.choose('ACADEMY');
  await f.flow.choose('CHAOS');
  const oldAcademy = f.flow.acceptJobResult({
    sessionKind: 'ACADEMY',
    sessionId: ACADEMY_SESSION_ID,
    worldEpoch: 1,
    learningEpoch: 0,
    jobId: 'job:late:academy',
  });
  assert.equal(oldAcademy.status, 'LATE_RESULT');
  if (oldAcademy.status === 'LATE_RESULT') assert.equal(oldAcademy.reason, 'SESSION_KIND_MISMATCH');

  const oldChaosEpoch = f.flow.acceptJobResult({
    sessionKind: 'CHAOS',
    sessionId: CHAOS_SESSION_ID,
    worldEpoch: 0,
    learningEpoch: 0,
    jobId: 'job:late:epoch',
  });
  assert.equal(oldChaosEpoch.status, 'LATE_RESULT');
  if (oldChaosEpoch.status === 'LATE_RESULT')
    assert.equal(oldChaosEpoch.reason, 'WORLD_EPOCH_MISMATCH');

  const current = f.flow.acceptJobResult({
    sessionKind: 'CHAOS',
    sessionId: CHAOS_SESSION_ID,
    worldEpoch: 1,
    learningEpoch: 0,
    jobId: 'job:live',
  });
  assert.equal(current.status, 'ACCEPTED');
});

test('261 twenty transitions leave one live world, one listener and no orphan job or input', async () => {
  const f = flowFixture();
  await f.flow.choose('ACADEMY');
  for (let index = 0; index < 20; index += 1) {
    const kind: SessionKind = index % 2 === 0 ? 'CHAOS' : 'ACADEMY';
    const result = await f.flow.choose(kind);
    assert.equal(result.status, 'SWITCHED', `transition ${index + 1}`);
    const status = f.flow.status();
    assert.equal(status.resident.liveWorlds, 1);
    assert.equal(status.resident.listeners, 1);
    assert.equal(status.resident.profileCopies, 1);
    assert.deepEqual(f.world.orphans(), []);
  }
  const status = f.flow.status();
  assert.equal(status.switches, 20);
  assert.equal(status.failedSwitches, 0);
  assert.equal(status.resident.checkpoints, 20);
  assert.equal(f.store.stats().committed, 20);
  assert.equal(f.store.stats().rows.ACADEMY, 10);
  assert.equal(f.store.stats().rows.CHAOS, 10);
  const menu = f.flow.menu();
  assert.equal(
    menu.choices.reduce((total, choice) => total + choice.checkpoints, 0),
    20,
  );
});

test('261 restore resumes the saved checkpoint in PAUSED_AUTO and leaves the other session alone', async () => {
  const f = flowFixture();
  await f.flow.choose('ACADEMY');
  await f.flow.choose('CHAOS');
  await f.flow.choose('ACADEMY');
  const chaosRows = await f.store.list('CHAOS');
  const academyRows = await f.store.list('ACADEMY');
  const restored = await f.flow.restore('CHAOS');
  assert.equal(restored.status, 'RESTORED');
  if (restored.status !== 'RESTORED') return;
  assert.equal(restored.sessionKind, 'CHAOS');
  assert.equal(restored.checkpointId, chaosRows[0]!.checkpointId);
  assertPausedAuto(restored.launch);
  assert.equal(f.flow.menu().live, 'CHAOS');
  assert.deepEqual(await f.store.list('ACADEMY'), academyRows);
  const reloaded = await f.flow.reload();
  assert.equal(reloaded.status, 'RESUMED');
  if (reloaded.status === 'RESUMED') assertPausedAuto(reloaded.launch);
});

test('261 the ledger gate delegates in Academy and isolates Chaos without changing fingerprints', () => {
  const f = flowFixture();
  const before = f.flow.fingerprint();
  assert.ok(before !== null);
  const chaos = f.flow.ledgerGate('CHAOS');
  assert.ok(chaos !== null);
  const isolated = chaos!.ingestDaily(chaosManualStart());
  assert.equal(isolated.status, 'ISOLATED');
  if (isolated.status === 'ISOLATED') assert.equal(isolated.code, 'SESSION_KIND_ISOLATED');
  const after = f.flow.fingerprint();
  assert.deepEqual(after, before);
  assert.equal(f.flow.ledgerGate('ACADEMY')!.sessionKind, 'ACADEMY');
});
