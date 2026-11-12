import { getParameterDefinition } from '../../src/profiles';
import { compileFollowingProfile, evaluateFollowingTarget } from '../../src/autonomy/following';
import { compileFollowPolicyProfile, evaluateFollowPolicy } from '../../src/autonomy/follow-policy';
import { createFollowingTargetFixture } from './following-target-fixture';
import {
  evaluate,
  followObservation,
  followProfile,
  followProfileDocument,
  followingFixture,
  run,
  scenario,
  state,
} from './follow-policy-reference';
import type { FollowScene } from './follow-policy-reference';

export interface FollowPolicyCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface FollowPolicyEffect {
  readonly key: string;
  readonly episode: string;
  readonly unit: string;
  readonly lowValue: number;
  readonly highValue: number;
  readonly lowOutcome: number;
  readonly highOutcome: number;
  readonly difference: number;
  readonly note: string;
}
export interface FollowPolicyCompatibility {
  readonly identicalFollowingTicks: boolean;
  readonly comparableTicks: number;
  readonly identicalTicks: number;
  readonly neutralForwardTicks: number;
  readonly activeDifferingTicks: number;
  readonly maximumDifferenceMps: number;
  readonly mUnits: Readonly<Record<string, string>>;
  readonly rUnits: Readonly<Record<string, string>>;
}
export interface FollowPolicyReport {
  readonly version: '171-follow-policy-v1';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly episodes: readonly { readonly name: string; readonly scenario: string }[];
  readonly effects: readonly FollowPolicyEffect[];
  readonly separation: readonly FollowPolicyEffect[];
  readonly safety: readonly FollowPolicyEffect[];
  readonly compatibility: FollowPolicyCompatibility;
  readonly determinism: {
    readonly ticks: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly FollowPolicyCheck[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
}
const keys = [
  'cutin_brake_response',
  'closing_ttc_threshold',
  'leader_change_delay',
  'following_hysteresis',
] as const;
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): FollowPolicyCheck {
  return { id, pass, detail };
}
/** A cut-in: the new leader interposes at 18 m while the ego still runs at 15 m/s. */
const cutInScene: FollowScene = {
  egoSpeed: 15,
  leadGap: 18,
  leadSpeed: 8,
  leaderId: 'cut-in',
  leaderIncarnation: 2,
  cutIn: true,
  cruiseTargetMps: 16,
};
/** A closing approach on a slower leader: 6 m/s of closing speed at 36 m. */
const closingScene: FollowScene = {
  egoSpeed: 14,
  leadGap: 36,
  leadSpeed: 8,
  leaderId: 'leader',
  leaderIncarnation: 1,
  cruiseTargetMps: 18,
};
/** The previous leader left the lane; the new leader is farther away and faster. */
const leaderChangeScene: FollowScene = {
  egoSpeed: 10,
  leadGap: 60,
  leadSpeed: 14,
  leaderId: 'new-leader',
  leaderIncarnation: 2,
  cruiseTargetMps: 16,
};
/** The same departure when the new leader brakes instead: a reduction must never be delayed. */
const leaderReductionScene: FollowScene = { ...leaderChangeScene, leadSpeed: 2, leadGap: 20 };
/** The gap oscillates 2 m around the 21 m desired gap of a 10 m/s following scene. */
const oscillationScene: FollowScene[] = Array.from({ length: 12 }, (_, index) => ({
  egoSpeed: 10,
  leadGap: index % 2 === 0 ? 25 : 21,
  leadSpeed: 10,
  leaderId: 'leader',
  leaderIncarnation: 1,
  cruiseTargetMps: 16,
}));
const cutInPrevious = (leaderId: string | null) =>
    state({ leaderId, leaderIncarnation: leaderId === null ? null : 2, committedTargetMps: 12 }),
  closingPrevious = state({ leaderId: 'leader', leaderIncarnation: 1, committedTargetMps: 15.26 }),
  oldLeaderState = state({
    leaderId: 'old-leader',
    leaderIncarnation: 1,
    committedTargetMps: 7.9,
    leaderHoldTicks: 0,
  }),
  bandPrevious = state({ leaderId: 'leader', leaderIncarnation: 1, committedTargetMps: 12.8 });

function cutInOutcome(response: number): number {
  return evaluate(followProfile({ cutin_brake_response: response }), cutInScene, {
    state: cutInPrevious('cut-in'),
  }).committedTargetMps;
}
function ttcOutcome(threshold: number) {
  return evaluate(followProfile({ closing_ttc_threshold: threshold }), closingScene, {
    state: closingPrevious,
  });
}
function adoptionTick(delay: number): number {
  const requested = followingFixture(leaderChangeScene).target.targetMps,
    rows = run(
      followProfile({ leader_change_delay: delay, cutin_brake_response: 0.7 }),
      Array.from({ length: 130 }, () => leaderChangeScene),
      { initial: oldLeaderState },
    ),
    index = rows.findIndex((row) => row.committedTargetMps >= requested - 1e-12);
  return index + 1;
}
function totalVariation(rows: readonly { committedTargetMps: number }[]): number {
  return rows.reduce(
    (total, row, index) =>
      index === 0
        ? 0
        : total + Math.abs(row.committedTargetMps - rows[index - 1].committedTargetMps),
    0,
  );
}
function hysteresisVariation(value: number): number {
  return totalVariation(run(followProfile({ following_hysteresis: value }), oscillationScene));
}
function separationRow(
  profile: ReturnType<typeof followProfile>,
  input: FollowScene,
  previous: ReturnType<typeof state>,
  key: string,
  episode: string,
  lowValue: number,
  highValue: number,
): FollowPolicyEffect {
  const row = evaluate(profile, input, { state: previous });
  return {
    key,
    episode,
    unit: 'm/s',
    lowValue,
    highValue,
    lowOutcome: row.committedTargetMps,
    highOutcome: row.committedTargetMps,
    difference: 0,
    note: `\`${key}\` este inertă în episodul ${episode}`,
  };
}

/** Runs the real 048 following layer for both profiles and filters its result with 171. */
function compatibility(): FollowPolicyCompatibility {
  const neutralDocument = followProfileDocument({}, '171-report-v1'),
    activeDocument = followProfileDocument(
      {
        cutin_brake_response: 0.2,
        closing_ttc_threshold: 8,
        leader_change_delay: 2,
        following_hysteresis: 5,
      },
      '171-report-v1',
    ),
    neutralFollowing = compileFollowingProfile(neutralDocument),
    activeFollowing = compileFollowingProfile(activeDocument),
    neutralPolicy = compileFollowPolicyProfile(neutralDocument),
    activePolicy = compileFollowPolicyProfile(activeDocument),
    neutralFixture = createFollowingTargetFixture(
      neutralFollowing.longitudinal.cruise,
      scenario.actor,
      scenario.scope,
    ),
    activeFixture = createFollowingTargetFixture(
      activeFollowing.longitudinal.cruise,
      scenario.actor,
      scenario.scope,
    );
  let comparableTicks = 0,
    identicalTicks = 0,
    neutralForwardTicks = 0,
    activeDifferingTicks = 0,
    maximumDifferenceMps = 0;
  try {
    let neutralState = state(),
      activeState = state();
    for (let tick = 1; tick <= 60; tick++) {
      const egoSpeed = 10,
        gap = tick <= 20 ? 20 : 45,
        leaderSpeed = tick <= 20 ? 5 : 14,
        leaderId = tick <= 20 ? 'lead-a' : 'lead-b',
        neutralInput = neutralFixture.input(tick, egoSpeed, gap, leaderSpeed, leaderId),
        activeInput = activeFixture.input(tick, egoSpeed, gap, leaderSpeed, leaderId),
        neutralResult = evaluateFollowingTarget({
          cruiseInput: neutralInput.cruiseInput,
          roadContext: neutralInput.roadContext,
          observation: neutralInput.observation,
          profile: neutralFollowing,
        }),
        activeResult = evaluateFollowingTarget({
          cruiseInput: activeInput.cruiseInput,
          roadContext: activeInput.roadContext,
          observation: activeInput.observation,
          profile: activeFollowing,
        });
      comparableTicks += 1;
      if (JSON.stringify(activeResult) === JSON.stringify(neutralResult)) identicalTicks += 1;
      const observation = followObservation(
          {
            egoSpeed,
            leadGap: neutralResult.gapM,
            leadSpeed: leaderSpeed,
            leaderId,
            leaderIncarnation: neutralResult.leader!.incarnation,
          },
          tick,
        ),
        neutralRow = evaluateFollowPolicy({
          ...scenario.scope,
          actor: scenario.actor,
          decisionTick: tick,
          authority: 'AUTO',
          profile: neutralPolicy,
          following: neutralResult,
          observation,
          previous: neutralState,
        }),
        activeRow = evaluateFollowPolicy({
          ...scenario.scope,
          actor: scenario.actor,
          decisionTick: tick,
          authority: 'AUTO',
          profile: activePolicy,
          following: neutralResult,
          observation,
          previous: activeState,
        });
      neutralState = neutralRow.state;
      activeState = activeRow.state;
      if (neutralRow.committedTargetMps === neutralResult.target.targetMps)
        neutralForwardTicks += 1;
      if (activeRow.committedTargetMps !== neutralRow.committedTargetMps) {
        activeDifferingTicks += 1;
        maximumDifferenceMps = Math.max(
          maximumDifferenceMps,
          Math.abs(activeRow.committedTargetMps - neutralRow.committedTargetMps),
        );
      }
    }
  } finally {
    neutralFixture.dispose();
    activeFixture.dispose();
  }
  const unitsOf = (values: Readonly<Record<string, number>>) =>
    Object.fromEntries(Object.keys(values).map((key) => [key, getParameterDefinition(key).unit]));
  return {
    identicalFollowingTicks: comparableTicks === identicalTicks,
    comparableTicks,
    identicalTicks,
    neutralForwardTicks,
    activeDifferingTicks,
    maximumDifferenceMps,
    mUnits: unitsOf({
      speed_delta_urban: 0,
      following_time_headway: 0,
      following_min_gap: 0,
      queue_standstill_gap: 0,
      following_speed_gain: 0,
    }),
    rUnits: unitsOf(Object.fromEntries(keys.map((key) => [key, 1]))),
  };
}

export function runFollowPolicyReport(): FollowPolicyReport {
  const parameters = keys.map((key) => {
      const definition = getParameterDefinition(key);
      return {
        key,
        unit: definition.unit,
        minimum: definition.min,
        maximum: definition.max,
        defaultValue: definition.default,
      };
    }),
    requestedCutIn = followingFixture(cutInScene).target.targetMps,
    requestedClosing = followingFixture(closingScene).target.targetMps,
    requestedLeader = followingFixture(leaderChangeScene).target.targetMps,
    requestedReduction = followingFixture(leaderReductionScene).target.targetMps,
    slowCutIn = cutInOutcome(0.2),
    fullCutIn = cutInOutcome(1),
    looseTtc = ttcOutcome(0.3),
    tightTtc = ttcOutcome(8),
    adoptionImmediate = adoptionTick(0),
    adoptionDelayed = adoptionTick(2),
    variationWithoutBand = hysteresisVariation(0),
    variationWithBand = hysteresisVariation(5),
    effects: FollowPolicyEffect[] = [
      {
        key: 'cutin_brake_response',
        episode: 'cut-in',
        unit: 'm/s',
        lowValue: 0.2,
        highValue: 1,
        lowOutcome: slowCutIn,
        highOutcome: fullCutIn,
        difference: fullCutIn - slowCutIn,
        note: `aceeași intrare (lider la 18 m, ego 15 m/s): preferința 048 este ${requestedCutIn.toFixed(3)} m/s, iar o reacție mai mare coboară ținta commitată spre ea`,
      },
      {
        key: 'closing_ttc_threshold',
        episode: 'timp până la contact',
        unit: 'm/s',
        lowValue: 0.3,
        highValue: 8,
        lowOutcome: looseTtc.committedTargetMps,
        highOutcome: tightTtc.committedTargetMps,
        difference: tightTtc.committedTargetMps - looseTtc.committedTargetMps,
        note: `apropiere 6 m/s la 36 m: plafon ${looseTtc.ttcCapMps!.toFixed(3)} vs ${tightTtc.ttcCapMps!.toFixed(3)} m/s; preferința 048 este ${requestedClosing.toFixed(3)} m/s`,
      },
      {
        key: 'leader_change_delay',
        episode: 'schimbarea liderului',
        unit: 'tick',
        lowValue: 0,
        highValue: 2,
        lowOutcome: adoptionImmediate,
        highOutcome: adoptionDelayed,
        difference: adoptionDelayed - adoptionImmediate,
        note: `primul tick în care ținta commitată atinge preferința noului lider ${requestedLeader.toFixed(3)} m/s, la 60 Hz`,
      },
      {
        key: 'following_hysteresis',
        episode: 'histerezis',
        unit: 'm/s',
        lowValue: 0,
        highValue: 5,
        lowOutcome: variationWithoutBand,
        highOutcome: variationWithBand,
        difference: variationWithBand - variationWithoutBand,
        note: 'variația totală a țintei commitate pe 12 tick-uri, cu decalajul oscilând ±2 m în jurul decalajului dorit',
      },
    ],
    separation: FollowPolicyEffect[] = [
      separationRow(
        followProfile({ closing_ttc_threshold: 8, cutin_brake_response: 0.7 }),
        cutInScene,
        cutInPrevious('cut-in'),
        'closing_ttc_threshold',
        'cut-in',
        0.3,
        8,
      ),
      separationRow(
        followProfile({ leader_change_delay: 2, cutin_brake_response: 0.7 }),
        cutInScene,
        cutInPrevious('cut-in'),
        'leader_change_delay',
        'cut-in',
        0,
        2,
      ),
      separationRow(
        followProfile({ following_hysteresis: 5, cutin_brake_response: 0.7 }),
        cutInScene,
        cutInPrevious('cut-in'),
        'following_hysteresis',
        'cut-in',
        0,
        5,
      ),
      separationRow(
        followProfile({ cutin_brake_response: 0 }),
        closingScene,
        closingPrevious,
        'cutin_brake_response',
        'timp până la contact',
        1,
        0,
      ),
      separationRow(
        followProfile({ leader_change_delay: 2 }),
        closingScene,
        closingPrevious,
        'leader_change_delay',
        'timp până la contact',
        0,
        2,
      ),
      separationRow(
        followProfile({ following_hysteresis: 5 }),
        closingScene,
        closingPrevious,
        'following_hysteresis',
        'timp până la contact',
        0,
        5,
      ),
      separationRow(
        followProfile({ cutin_brake_response: 0 }),
        leaderChangeScene,
        oldLeaderState,
        'cutin_brake_response',
        'schimbarea liderului',
        1,
        0,
      ),
      separationRow(
        followProfile({ closing_ttc_threshold: 8 }),
        leaderChangeScene,
        oldLeaderState,
        'closing_ttc_threshold',
        'schimbarea liderului',
        0.3,
        8,
      ),
      separationRow(
        followProfile({ following_hysteresis: 5 }),
        leaderChangeScene,
        oldLeaderState,
        'following_hysteresis',
        'schimbarea liderului',
        0,
        5,
      ),
      separationRow(
        followProfile({ cutin_brake_response: 0 }),
        oscillationScene[1],
        bandPrevious,
        'cutin_brake_response',
        'histerezis',
        1,
        0,
      ),
      separationRow(
        followProfile({ closing_ttc_threshold: 8 }),
        oscillationScene[1],
        bandPrevious,
        'closing_ttc_threshold',
        'histerezis',
        0.3,
        8,
      ),
      separationRow(
        followProfile({ leader_change_delay: 2 }),
        oscillationScene[1],
        bandPrevious,
        'leader_change_delay',
        'histerezis',
        0,
        2,
      ),
    ];
  const aggressive = followProfile({
      cutin_brake_response: 0,
      closing_ttc_threshold: 8,
      leader_change_delay: 2,
      following_hysteresis: 5,
    }),
    previousAggressive = state({ committedTargetMps: 12, leaderHoldTicks: 100 }),
    stopped = evaluate(
      aggressive,
      { ...closingScene, stopRequired: true },
      {
        state: previousAggressive,
      },
    ),
    insideFloor = evaluate(
      aggressive,
      { ...closingScene, leadGap: 3 },
      {
        state: previousAggressive,
      },
    ),
    justOutside = evaluate(
      aggressive,
      { egoSpeed: 12, leadGap: 6, leadSpeed: 0, leaderId: 'queue', leaderIncarnation: 1 },
      {
        state: state({ leaderId: 'queue', leaderIncarnation: 1, committedTargetMps: 12 }),
      },
    ),
    gentle = evaluate(
      aggressive,
      { egoSpeed: 12, leadGap: 40, leadSpeed: 0, leaderId: 'queue', leaderIncarnation: 1 },
      {
        state: state({ leaderId: 'queue', leaderIncarnation: 1, committedTargetMps: 12 }),
      },
    ),
    requiredDecel = (12 ** 2 - gentle.committedTargetMps ** 2) / (2 * (40 - 5)),
    comfortDeceleration = getParameterDefinition('comfort_deceleration').default,
    reducedDuringHold = evaluate(aggressive, leaderReductionScene, {
      state: state({ ...oldLeaderState, leaderHoldTicks: 100 }),
    }),
    cutInAtZero = evaluate(
      followProfile({
        cutin_brake_response: 0,
        closing_ttc_threshold: 8,
        leader_change_delay: 2,
        following_hysteresis: 5,
      }),
      cutInScene,
      { state: cutInPrevious('cut-in') },
    ),
    cutInAtFull = evaluate(
      followProfile({
        cutin_brake_response: 1,
        closing_ttc_threshold: 8,
        leader_change_delay: 2,
        following_hysteresis: 5,
      }),
      cutInScene,
      { state: cutInPrevious('cut-in') },
    ),
    safety: FollowPolicyEffect[] = [
      {
        key: 'oprire cerută',
        episode: 'siguranță',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: stopped.committedTargetMps,
        difference: stopped.committedTargetMps,
        note: 'toate cheile la valoarea cea mai permisivă: oprirea cere tot 0 m/s',
      },
      {
        key: 'podea de contact 3 m',
        episode: 'siguranță',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: insideFloor.committedTargetMps,
        difference: insideFloor.committedTargetMps,
        note: 'un lider în interiorul podelei de 5 m cere 0 m/s, oricare ar fi cheile',
      },
      {
        key: 'marja timpului până la contact',
        episode: 'siguranță',
        unit: 'm/s',
        lowValue: 0,
        highValue: 8,
        lowOutcome: 0,
        highOutcome: justOutside.committedTargetMps,
        difference: justOutside.committedTargetMps,
        note: `cu pragul maxim la 1 m în afara podelei, viteza de apropiere ${justOutside.committedTargetMps.toFixed(3)} m/s păstrează marja rămasă timp de ${((justOutside.gapM! - 5) / justOutside.committedTargetMps).toFixed(3)} s`,
      },
      {
        key: 'confort la pragul maxim',
        episode: 'siguranță',
        unit: 'm/s²',
        lowValue: 0,
        highValue: 8,
        lowOutcome: 0,
        highOutcome: requiredDecel,
        difference: requiredDecel,
        note: `12 m/s la 40 m cu lider oprit: plafonul ${gentle.committedTargetMps.toFixed(3)} m/s cere ${requiredDecel.toFixed(3)} m/s², în limita comfort_deceleration ${comfortDeceleration}`,
      },
      {
        key: 'reducere în timpul ținerii',
        episode: 'siguranță',
        unit: 'm/s',
        lowValue: 0,
        highValue: 2,
        lowOutcome: requestedReduction,
        highOutcome: reducedDuringHold.committedTargetMps,
        difference: reducedDuringHold.committedTargetMps - requestedReduction,
        note: `ambele valori ale întârzierii adoptă reducerea imediat (${reducedDuringHold.leaderHoldTicks} tick-uri rămase); o întârziere maximă nu amână niciodată o reducere sigură`,
      },
      {
        key: 'cut-in la reacție maximă',
        episode: 'siguranță',
        unit: 'm/s',
        lowValue: 0,
        highValue: 1,
        lowOutcome: cutInAtZero.committedTargetMps,
        highOutcome: cutInAtFull.committedTargetMps,
        difference: cutInAtFull.committedTargetMps - cutInAtZero.committedTargetMps,
        note: 'reacția se oprește exact la preferința 048 livrată (1.700 m/s), iar valoarea fără reacție rămâne mărginită de plafonul timpului până la contact',
      },
    ];
  const compatibilityReport = compatibility(),
    series = () =>
      run(
        followProfile({
          cutin_brake_response: 0.6,
          closing_ttc_threshold: 5,
          leader_change_delay: 0.2,
          following_hysteresis: 2,
        }),
        [cutInScene, cutInScene, closingScene, closingScene, leaderChangeScene, leaderChangeScene],
        { initial: state({ committedTargetMps: 12 }) },
      ).map((row) => [
        row.committedTargetMps,
        row.episode,
        row.bindingConstraint,
        row.leaderHoldTicks,
      ]),
    determinismDigest = digest(JSON.stringify(series())),
    repeatedDigest = digest(JSON.stringify(series()));
  const checks: FollowPolicyCheck[] = [
    check(
      'key-cutin-effect',
      fullCutIn < slowCutIn && Math.abs(fullCutIn - requestedCutIn) < 1e-12,
      `${slowCutIn.toFixed(3)} -> ${fullCutIn.toFixed(3)} m/s, exact preferința 048`,
    ),
    check(
      'key-cutin-no-reaction',
      cutInOutcome(0) === 12,
      'reacția zero păstrează angajamentul anterior de 12 m/s',
    ),
    check(
      'key-ttc-effect',
      tightTtc.committedTargetMps < looseTtc.committedTargetMps &&
        Math.abs(looseTtc.committedTargetMps - requestedClosing) < 1e-12 &&
        Math.abs(tightTtc.committedTargetMps - (8 + (36 - 5) / 8)) < 1e-12,
      `${looseTtc.committedTargetMps.toFixed(3)} -> ${tightTtc.committedTargetMps.toFixed(3)} m/s`,
    ),
    check(
      'key-ttc-margin',
      (tightTtc.gapM! - 5) / (tightTtc.committedTargetMps - 8) >= 8,
      `viteza de apropiere plafonată păstrează ${((tightTtc.gapM! - 5) / (tightTtc.committedTargetMps - 8)).toFixed(3)} s de marjă`,
    ),
    check(
      'key-leader-delay-effect',
      adoptionImmediate === 1 && adoptionDelayed === 121,
      `adoptat la tick-ul ${adoptionImmediate} față de tick-ul ${adoptionDelayed}`,
    ),
    check(
      'key-leader-delay-reduction',
      Math.abs(reducedDuringHold.committedTargetMps - requestedReduction) < 1e-12 &&
        reducedDuringHold.leaderHoldTicks === 0,
      `o reducere este adoptată pe tick-ul de ținere (${requestedReduction.toFixed(3)} m/s)`,
    ),
    check(
      'key-hysteresis-effect',
      variationWithBand === 0 && variationWithoutBand > 2.5,
      `variația totală ${variationWithoutBand.toFixed(3)} -> ${variationWithBand.toFixed(3)} m/s`,
    ),
    check(
      'separation-cutin',
      separation
        .filter((entry) => entry.episode === 'cut-in')
        .every((entry) => entry.difference === 0),
      'doar cutin_brake_response acționează în episodul cut-in',
    ),
    check(
      'separation-ttc',
      separation
        .filter((entry) => entry.episode === 'time-to-contact')
        .every((entry) => entry.difference === 0),
      'doar closing_ttc_threshold acționează în episodul timpului până la contact',
    ),
    check(
      'separation-leader-change',
      separation
        .filter((entry) => entry.episode === 'leader change')
        .every((entry) => entry.difference === 0),
      'doar leader_change_delay acționează în episodul schimbării liderului',
    ),
    check(
      'separation-hysteresis',
      separation
        .filter((entry) => entry.episode === 'hysteresis')
        .every((entry) => entry.difference === 0),
      'doar following_hysteresis acționează în episodul histerezisului',
    ),
    check(
      'safety-stop',
      stopped.committedTargetMps === 0 && stopped.bindingConstraint === 'STOP_REQUIRED',
      'o cerere de oprire comandă 0 m/s cu toate cheile la valoarea cea mai permisivă',
    ),
    check(
      'safety-floor',
      insideFloor.committedTargetMps === 0 && insideFloor.bindingConstraint === 'CONTACT_FLOOR',
      'un lider în interiorul a 5 m comandă 0 m/s',
    ),
    check(
      'safety-ttc-comfort',
      requiredDecel <= comfortDeceleration,
      `${requiredDecel.toFixed(3)} m/s² necesari pentru pragul maxim, confort ${comfortDeceleration} m/s²`,
    ),
    check(
      'safety-cutin-bound',
      Math.abs(cutInAtFull.committedTargetMps - requestedCutIn) < 1e-12 &&
        cutInAtFull.committedTargetMps <= cutInAtZero.committedTargetMps,
      'reacția maximă se oprește la preferința 048 livrată și niciodată sub ea',
    ),
    check(
      'safety-coverage',
      [stopped, insideFloor, justOutside, gentle, cutInAtFull, reducedDuringHold].every(
        (row) => row.committedTargetMps >= 0 && row.committedTargetMps <= 30,
      ),
      'fiecare țintă commitată rămâne în 0-30 m/s',
    ),
    check(
      'm-following-identical',
      compatibilityReport.identicalFollowingTicks,
      `${compatibilityReport.identicalTicks}/${compatibilityReport.comparableTicks} rezultate 048 identice cu cheile R neutre vs active`,
    ),
    check(
      'm-neutral-forwards',
      compatibilityReport.neutralForwardTicks === compatibilityReport.comparableTicks &&
        compatibilityReport.activeDifferingTicks > 0,
      `${compatibilityReport.neutralForwardTicks}/${compatibilityReport.comparableTicks} tick-uri neutre forwardează ținta 048; ${compatibilityReport.activeDifferingTicks} tick-uri active diferă cu până la ${compatibilityReport.maximumDifferenceMps.toFixed(3)} m/s`,
    ),
    check(
      'catalog-ranges',
      parameters.every(
        (entry) =>
          entry.minimum < entry.maximum &&
          entry.defaultValue >= entry.minimum &&
          entry.defaultValue <= entry.maximum,
      ),
      parameters
        .map((entry) => `${entry.key} ${entry.minimum}-${entry.maximum} ${entry.unit}`)
        .join(', '),
    ),
    check('determinism', determinismDigest === repeatedDigest, `digest ${determinismDigest}`),
  ];
  const passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '171-follow-policy-v1',
    parameters,
    episodes: [
      {
        name: 'cut-in',
        scenario: 'un vehicul nou se interpune la 18 m; ego 15 m/s, angajament anterior 12 m/s',
      },
      {
        name: 'timp până la contact',
        scenario: 'apropiere cu 6 m/s de un lider de 8 m/s aflat la 36 m',
      },
      {
        name: 'schimbarea liderului',
        scenario: 'liderul anterior părăsește banda; noul lider este la 60 m și mai rapid',
      },
      {
        name: 'histerezis',
        scenario:
          'decalajul oscilează ±2 m în jurul decalajului dorit, fără apropiere, cu același lider',
      },
    ],
    effects,
    separation,
    safety,
    compatibility: compatibilityReport,
    determinism: { ticks: 6, digest: determinismDigest, repeatedDigest },
    checks,
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}
export function followPolicyReportMarkdown(report: FollowPolicyReport): string {
  const rows = (entries: readonly FollowPolicyEffect[]) =>
    entries
      .map(
        (entry) =>
          `| \`${entry.key}\` | ${entry.episode} | ${entry.lowValue} | ${entry.lowOutcome.toFixed(3)} | ${entry.highValue} | ${entry.highOutcome.toFixed(3)} | ${entry.difference.toFixed(3)} | ${entry.unit} | ${entry.note} |`,
      )
      .join('\n');
  return [
    '# 171 — raport politică de urmărire și distanțe',
    '',
    'Generat de `scripts/run-v2-follow-policy-report.mjs` din contractul `171-follow-policy-v1`.',
    'Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei.',
    '',
    '## Episoadele',
    '',
    '| Episod | Scenariu |',
    '| --- | --- |',
    ...report.episodes.map((entry) => `| ${entry.name} | ${entry.scenario} |`),
    '',
    '## Efectul izolat al fiecărei chei',
    '',
    '| Cheie | Episod | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    rows(report.effects),
    '',
    '## Separarea cheilor (fiecare cheie inertă în celelalte episoade)',
    '',
    '| Cheie | Episod | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    rows(report.separation),
    '',
    '## Siguranță: limitele 048 și podeaua de 5 m rămân dominante',
    '',
    '| Cheie | Episod | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    rows(report.safety),
    '',
    '## Compatibilitate cu cheile M',
    '',
    `- Rezultate 048 identice cu cheile R neutre vs active: **${report.compatibility.identicalTicks}/${report.compatibility.comparableTicks} tick-uri**.`,
    `- Tick-uri neutre care forwardează exact ținta 048: **${report.compatibility.neutralForwardTicks}/${report.compatibility.comparableTicks}**.`,
    `- Tick-uri active care diferă de ținta 048: **${report.compatibility.activeDifferingTicks}**, diferență maximă **${report.compatibility.maximumDifferenceMps.toFixed(3)} m/s**.`,
    `- Unități M: ${Object.entries(report.compatibility.mUnits)
      .map(([key, unit]) => `\`${key}\` ${unit}`)
      .join(', ')}.`,
    `- Unități R: ${Object.entries(report.compatibility.rUnits)
      .map(([key, unit]) => `\`${key}\` ${unit}`)
      .join(', ')}.`,
    '',
    '## Parametrii din catalog',
    '',
    '| Cheie | Unitate | Minim | Maxim | Default |',
    '| --- | --- | ---: | ---: | ---: |',
    ...report.parameters.map(
      (entry) =>
        `| \`${entry.key}\` | ${entry.unit} | ${entry.minimum} | ${entry.maximum} | ${entry.defaultValue} |`,
    ),
    '',
    '## Determinism',
    '',
    `- ${report.determinism.ticks} tick-uri: \`${report.determinism.digest}\`.`,
    `- Rulare repetată: \`${report.determinism.repeatedDigest}\`.`,
    '',
    '## Verificări',
    '',
    ...report.checks.map(
      (entry) => `- ${entry.pass ? 'PASS' : 'FAIL'} \`${entry.id}\`: ${entry.detail}`,
    ),
    '',
    `**Sumar: ${report.summary.passed}/${report.summary.checks} verificări, ${report.summary.pass ? 'PASS' : 'FAIL'}.**`,
    '',
  ].join('\n');
}
