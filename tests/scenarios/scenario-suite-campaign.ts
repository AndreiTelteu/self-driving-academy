import { campaignOrder, createMissionRewardsLedger } from '../../src/missions';
import type { MissionRewardsLedger } from '../../src/missions';
import { completeMission, createRewardsTracker } from '../missions/mission-rewards-fixture';
import {
  SCENARIO_SUITE_SEED,
  absoluteTolerance,
  checkExact,
  checkNumber,
  scenarioOutcome,
} from './scenario-suite-support';
import type { ScenarioCheck, ScenarioOutcome } from './scenario-suite-support';

/**
 * Campaign family: the real 116 mission lifecycle and the 125 campaign/reward ledger.
 *
 * The first authored mission is completed through its real objective events, settled once and then
 * settled a second time. The scenarios prove the order of the campaign, the single payment of the
 * authored reward and the explicit duplicate refusal, without re-testing the daily set or the XP
 * ledger that the 216 matrix already covers.
 */

const FIRST_MISSION = 'campaign-1-first-taxi';
const START_TICK = 100;

function ledgerOf(tracker: ReturnType<typeof createRewardsTracker>): MissionRewardsLedger {
  return createMissionRewardsLedger({ catalog: tracker.catalog() });
}

export function runCampaignScenarios(): readonly ScenarioOutcome[] {
  const tracker = createRewardsTracker();
  const ledger = ledgerOf(tracker);
  const order = campaignOrder(tracker.catalog());
  const initial = ledger.progress();
  const instance = completeMission(tracker, FIRST_MISSION, START_TICK);
  const settled = ledger.settle({ instance });
  const progress = ledger.progress();
  const rewards = ledger.rewards();
  const repeat = ledger.settle({ instance });
  const afterRepeat = ledger.rewards();

  const first = progress.missions[0]!;
  const second = progress.missions[1]!;
  const third = progress.missions[2]!;

  const orderedChecks: ScenarioCheck[] = [
    checkNumber(
      'campaign mission count',
      8,
      initial.counts.missions,
      absoluteTolerance(0, 'misiuni', 'catalogul authorează 8 misiuni'),
      'catalogul de campanie este cel livrat',
    ),
    checkExact(
      'campaign order starts with the first taxi',
      FIRST_MISSION,
      order[0],
      'ordinea publicată începe cu prima misiune',
    ),
    checkNumber(
      'campaign initial available',
      1,
      initial.counts.available,
      absoluteTolerance(0, 'misiuni', 'o singură misiune este deblocată la început'),
      'misiunea 1 este disponibilă',
    ),
    checkNumber(
      'campaign initial locked',
      7,
      initial.counts.locked,
      absoluteTolerance(0, 'misiuni', 'restul sunt blocate de prerechizite'),
      'șapte misiuni așteaptă prerechizite',
    ),
    checkExact(
      'campaign next mission',
      FIRST_MISSION,
      initial.nextMissionId,
      'următoarea misiune este prima',
    ),
  ];

  const settleChecks: ScenarioCheck[] = [
    checkExact('settlement status', 'GRANTED', settled.status, 'prima finalizare este plătită'),
    checkNumber(
      'rewards granted',
      2,
      settled.rewardsGranted,
      absoluteTolerance(0, 'recompense', 'misiunea authorează două recompense'),
      'recompensele misiunii 1',
    ),
    checkNumber(
      'rewards duplicated',
      0,
      settled.rewardsDuplicate,
      absoluteTolerance(0, 'recompense', 'prima plată nu are duplicate'),
      'nicio recompensă nu este duplicată la prima plată',
    ),
    checkNumber(
      'xp granted',
      100,
      settled.xpGranted,
      absoluteTolerance(0, 'XP', 'suma authorează este plătită integral'),
      'XP-ul misiunii 1 este plătit o singură dată',
    ),
    checkExact(
      'unlock granted',
      ['challenge:first-demonstration'],
      [...settled.unlocked],
      'deblocarea authorează este raportată',
    ),
    checkNumber(
      'ledger granted total',
      2,
      rewards.totals.granted,
      absoluteTolerance(0, 'recompense', 'totalul ledgerului este exact'),
      'ledger-ul 125 înregistrează două recompense',
    ),
    checkNumber(
      'ledger xp total',
      100,
      rewards.totals.xp,
      absoluteTolerance(0, 'XP', 'totalul ledgerului este exact'),
      'ledger-ul 125 înregistrează 100 XP',
    ),
    checkNumber(
      'campaign completed',
      1,
      progress.counts.completed,
      absoluteTolerance(0, 'misiuni', 'o misiune finalizată'),
      'prima misiune este finalizată',
    ),
    checkExact('first mission state', 'COMPLETED', first.state, 'progresul misiunii 1'),
    checkNumber(
      'first mission attempts',
      1,
      first.attempts,
      absoluteTolerance(0, 'încercări', 'o singură încercare'),
      'finalizarea este prima încercare',
    ),
  ];

  const chainChecks: ScenarioCheck[] = [
    checkExact(
      'second mission available',
      'AVAILABLE',
      second.state,
      'prerechizita este îndeplinită',
    ),
    checkExact('third mission locked', 'LOCKED', third.state, 'lanțul cere misiunea 2'),
    checkExact(
      'third mission prerequisite',
      ['campaign-2-first-demonstration'],
      [...third.missingPrerequisites],
      'prerechizita lipsă este cea publicată',
    ),
    checkNumber(
      'campaign available after first',
      1,
      progress.counts.available,
      absoluteTolerance(0, 'misiuni', 'exact o misiune nouă este disponibilă'),
      'lanțul avansează cu exact o misiune',
    ),
  ];

  const duplicateChecks: ScenarioCheck[] = [
    checkExact(
      'duplicate status',
      'DUPLICATE',
      repeat.status,
      'rejucarea aceleiași finalizări este refuzată',
    ),
    checkNumber(
      'duplicate rewards granted',
      0,
      repeat.rewardsGranted,
      absoluteTolerance(0, 'recompense', 'un duplicat nu plătește'),
      'nicio recompensă nouă',
    ),
    checkNumber(
      'duplicate xp granted',
      0,
      repeat.xpGranted,
      absoluteTolerance(0, 'XP', 'un duplicat nu plătește XP'),
      'niciun XP nou',
    ),
    checkExact(
      'duplicate reasons',
      ['COMPLETION_ALREADY_SETTLED'],
      [...repeat.duplicateReasons],
      'motivul refuzului este cel publicat',
    ),
    checkExact('duplicate unlocks nothing', [], [...repeat.unlocked], 'un duplicat nu deblochează'),
    checkNumber(
      'ledger total unchanged',
      100,
      afterRepeat.totals.xp,
      absoluteTolerance(0, 'XP', 'totalul rămâne cel al primei plăți'),
      'contorul de XP nu crește',
    ),
    checkNumber(
      'ledger grant count unchanged',
      2,
      afterRepeat.totals.granted,
      absoluteTolerance(0, 'recompense', 'totalul de recompense nu crește'),
      'nicio recompensă dublă în ledger',
    ),
    checkNumber(
      'duplicate rows counted, not paid',
      2,
      afterRepeat.totals.duplicates,
      absoluteTolerance(
        0,
        'rânduri',
        'ambele recompense ale finalizării sunt raportate ca duplicate',
      ),
      'refuzul este numărat separat, fără plată',
    ),
  ];

  return Object.freeze([
    scenarioOutcome({
      id: 'campaign-first-mission',
      family: 'CAMPAIGN',
      polarity: 'POSITIVE',
      title: 'Prima misiune de campanie plătește două recompense și 100 XP o singură dată',
      contract: '125-mission-rewards-v1 + 116 mission lifecycle',
      seed: SCENARIO_SUITE_SEED,
      steps: 1,
      input: { missionId: FIRST_MISSION, startTick: START_TICK, order: [...order] },
      expected: {
        status: 'GRANTED',
        rewardsGranted: 2,
        xpGranted: 100,
        unlocked: ['challenge:first-demonstration'],
      },
      actual: {
        status: settled.status,
        rewardsGranted: settled.rewardsGranted,
        xpGranted: settled.xpGranted,
        unlocked: [...settled.unlocked],
      },
      checks: [...orderedChecks, ...settleChecks],
      note: 'Finalizarea vine din tracker-ul real 116, nu dintr-un obiect de test construit manual.',
    }),
    scenarioOutcome({
      id: 'campaign-chain-unlocks-next',
      family: 'CAMPAIGN',
      polarity: 'POSITIVE',
      title: 'Finalizarea primei misiuni deblochează exact următoarea verigă a campaniei',
      contract: '125-mission-rewards-v1 (CampaignProgress)',
      seed: SCENARIO_SUITE_SEED,
      steps: 1,
      input: { missionId: FIRST_MISSION, completedThrough: FIRST_MISSION },
      expected: {
        completed: 1,
        available: 1,
        second: 'AVAILABLE',
        third: 'LOCKED',
        thirdPrerequisite: ['campaign-2-first-demonstration'],
      },
      actual: {
        completed: progress.counts.completed,
        available: progress.counts.available,
        second: second.state,
        third: third.state,
        thirdPrerequisite: [...third.missingPrerequisites],
      },
      checks: chainChecks,
      note: 'Lanțul de campanie respectă ordinea authorează și prerechizitele fiecărei misiuni.',
    }),
    scenarioOutcome({
      id: 'campaign-duplicate-settlement-refused',
      family: 'CAMPAIGN',
      polarity: 'NEGATIVE',
      title: 'Aceeași finalizare rejucată este refuzată ca duplicat, fără XP sau recompensă nouă',
      contract: '125-mission-rewards-v1 (identitatea recompensei)',
      seed: SCENARIO_SUITE_SEED,
      steps: 2,
      input: { missionId: FIRST_MISSION, completionId: instance.instanceId, settleCount: 2 },
      expected: {
        status: 'DUPLICATE',
        rewardsGranted: 0,
        xpGranted: 0,
        duplicateReasons: ['COMPLETION_ALREADY_SETTLED'],
        totals: { granted: 2, xp: 100 },
      },
      actual: {
        status: repeat.status,
        rewardsGranted: repeat.rewardsGranted,
        xpGranted: repeat.xpGranted,
        duplicateReasons: [...repeat.duplicateReasons],
        totals: { granted: afterRepeat.totals.granted, xp: afterRepeat.totals.xp },
      },
      checks: duplicateChecks,
      note: 'Recompensele nu se acordă de două ori pentru aceeași finalizare a aceleiași versiuni.',
    }),
  ]);
}
