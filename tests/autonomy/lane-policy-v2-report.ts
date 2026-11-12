import { getParameterDefinition } from '../../src/profiles';
import { parsePublishableDrivingProfile } from '../../src/profiles/parameter-registry';
import { projectLaneChangeProfile } from '../../src/autonomy/lane-change-policy';
import { LANE_POLICY_V2_KEYS, LANE_POLICY_V2_LIMITS } from '../../src/autonomy/lane-policy-v2';
import type { LanePolicyV2Command, LanePolicyV2Key } from '../../src/autonomy/lane-policy-v2';
import {
  evaluate,
  evaluateLaneChange053,
  laneOpportunity,
  lanePolicyDocument,
  lanePolicyProfile,
  neutralLanePolicyValues,
  progressAfterStart,
  rightPassOpportunity,
  run,
  scenario,
} from './lane-policy-v2-reference';
import type { LanePolicyScene } from './lane-policy-v2-reference';

export interface LanePolicyCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface LanePolicyEffect {
  readonly key: string;
  readonly scenario: string;
  readonly keyUnit: string;
  readonly unit: string;
  readonly lowValue: number;
  readonly highValue: number;
  readonly lowOutcome: number;
  readonly highOutcome: number;
  readonly difference: number;
  readonly note: string;
}
export interface LanePolicyDependency {
  readonly key: string;
  readonly scenario: string;
  readonly difference: number;
  readonly note: string;
}
export interface LanePolicyCompatibility {
  readonly identicalLaneChangeTicks: boolean;
  readonly comparableTicks: number;
  readonly identicalLaneChangeResults: number;
  readonly forwardCheckedTicks: number;
  readonly neutralForwardTicks: number;
  readonly rightPassRefusedTicks: number;
  readonly activeDifferingTicks: number;
  readonly maximumProgressDifference: number;
  readonly mUnits: Readonly<Record<string, string>>;
  readonly rUnits: Readonly<Record<string, string>>;
}
export interface LanePolicyReport {
  readonly version: '177-lane-policy-v2';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly scenarios: readonly { readonly name: string; readonly scenario: string }[];
  readonly effects: readonly LanePolicyEffect[];
  readonly separation: readonly LanePolicyEffect[];
  readonly dependencies: readonly LanePolicyDependency[];
  readonly safety: readonly LanePolicyEffect[];
  readonly compatibility: LanePolicyCompatibility;
  readonly determinism: {
    readonly ticks: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly LanePolicyCheck[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
}

const opportunity = laneOpportunity(0),
  passOpportunity = rightPassOpportunity(0),
  signalOff = { signal_use_probability: 0 } as const,
  leftScene: LanePolicyScene = {
    currentLaneId: 'lane-a',
    lanes: [{ laneId: 'lane-left', side: 'LEFT' }],
    targetLaneId: 'lane-left',
    overtake: true,
    rightOvertake: 'UNKNOWN',
    rightLaneSpaceM: null,
    coverage: 'COMPLETE',
    frontGapM: 20,
    backGapM: 18,
    targetLaneSpeedMps: 12,
    speedMps: 8,
    ownLaneLeaderSpeedMps: 6,
    intent: 'OPTIONAL_OVERTAKE',
  },
  rightScene: LanePolicyScene = {
    ...leftScene,
    lanes: [{ laneId: 'lane-right', side: 'RIGHT' }],
    targetLaneId: 'lane-right',
    rightOvertake: 'PERMITTED',
    rightLaneSpaceM: 30,
  },
  activeValues = {
    lane_change_duration: 5,
    signal_lead_time: 5,
    signal_use_probability: 1,
    pass_on_right_probability: 1,
  } as const,
  ranges: Readonly<Record<LanePolicyV2Key, readonly [number, number]>> = {
    lane_change_duration: [0.5, 5],
    signal_lead_time: [0, 5],
    signal_use_probability: [0, 1],
    pass_on_right_probability: [0, 1],
  };

/** Ticks between the decision and the first lateral movement of the manoeuvre. */
function startDelayTicks(rValues: Readonly<Record<string, number>>): number {
  const started = run(leftScene, {
    rValues,
    opportunityKey: opportunity.opportunityKey,
    ticks: 400,
    stopWhen: (command) => command.action === 'LANE_CHANGE',
  });
  return started.commands.length - 1;
}
function indicatorGranted(rValues: Readonly<Record<string, number>>): number {
  return evaluate(leftScene, {
    rValues,
    opportunityKey: opportunity.opportunityKey,
  }).command.signalUsed
    ? 1
    : 0;
}
function rightPassGranted(rValues: Readonly<Record<string, number>>): number {
  return evaluate(rightScene, {
    rValues,
    opportunityKey: passOpportunity.opportunityKey,
  }).command.rightOvertakeGranted === true
    ? 1
    : 0;
}
function durationProgress(rValues: Readonly<Record<string, number>>): number {
  return progressAfterStart(leftScene, { rValues, advanceTicks: 30 }).progress;
}

interface ScenarioRow {
  readonly name: string;
  readonly description: string;
  readonly fixed: Readonly<Record<string, number>>;
  readonly key: LanePolicyV2Key;
  readonly unit: string;
  readonly note: string;
  readonly measure: (rValues: Readonly<Record<string, number>>) => number;
}
const scenarioRows: readonly ScenarioRow[] = [
  {
    name: 'durata manevrei',
    description:
      'schimbare validată pe banda stângă, fără semnalizare: progresul lateral măsurat 30 de ' +
      'tick-uri după începutul manevrei (0 = banda de plecare, 1 = banda țintă)',
    fixed: { ...signalOff, signal_lead_time: 0, lane_change_duration: 2 },
    key: 'lane_change_duration',
    unit: 'ratio',
    measure: durationProgress,
    note:
      'durata efectivă este `max(cheie, 1 s)`; la 30 de tick-uri după start, 0,5 s (plafonat la ' +
      '60 de tick-uri) dă 0,500, iar 5 s (300 de tick-uri) dă 0,100',
  },
  {
    name: 'semnalizare înainte de manevră',
    description:
      'schimbare validată pe banda stângă, cu semnalizarea folosită: numărul de tick-uri dintre ' +
      'decizie și prima mișcare laterală',
    fixed: { signal_use_probability: 1, lane_change_duration: 2, signal_lead_time: 5 },
    key: 'signal_lead_time',
    unit: 'ticks',
    measure: startDelayTicks,
    note:
      'avansul se aplică numai când semnalizarea este folosită; 0 s pornește manevra în același ' +
      'tick, 5 s o ține 300 de tick-uri, cu progres lateral 0',
  },
  {
    name: 'folosirea semnalizării',
    description:
      'schimbare validată pe banda stângă, fără avans de semnalizare: indicatorul este pornit sau nu',
    fixed: { signal_lead_time: 0, lane_change_duration: 2, signal_use_probability: 1 },
    key: 'signal_use_probability',
    unit: 'ratio',
    measure: indicatorGranted,
    note:
      'un singur eșantion determinist per oportunitate; eșantionul acestei oportunități este ' +
      opportunity.signalSample.toFixed(6),
  },
  {
    name: 'depășire prin dreapta',
    description:
      'schimbare validată pe banda dreaptă, cu harta care permite depășirea prin dreapta și 30 m ' +
      'de spațiu liber: dacă oportunitatea de depășire este acceptată',
    fixed: {
      ...signalOff,
      signal_lead_time: 0,
      lane_change_duration: 2,
      pass_on_right_probability: 1,
    },
    key: 'pass_on_right_probability',
    unit: 'ratio',
    measure: rightPassGranted,
    note:
      'eșantionul oportunității este ' +
      passOpportunity.passSample.toFixed(6) +
      '; probabilitatea este consultată numai după ce harta permite și spațiul acoperă ' +
      '`lane_change_front_gap`',
  },
];

function effectRow(row: ScenarioRow, lowValue: number, highValue: number): LanePolicyEffect {
  const lowOutcome = row.measure({ ...row.fixed, [row.key]: lowValue }),
    highOutcome = row.measure({ ...row.fixed, [row.key]: highValue });
  return {
    key: row.key,
    scenario: row.name,
    keyUnit: getParameterDefinition(row.key).unit,
    unit: row.unit,
    lowValue,
    highValue,
    lowOutcome,
    highOutcome,
    difference: highOutcome - lowOutcome,
    note: row.note,
  };
}

function separationRow(
  row: ScenarioRow,
  key: LanePolicyV2Key,
  lowValue: number,
  highValue: number,
): LanePolicyEffect {
  const lowOutcome = row.measure({ ...row.fixed, [key]: lowValue }),
    highOutcome = row.measure({ ...row.fixed, [key]: highValue });
  return {
    key,
    scenario: row.name,
    keyUnit: getParameterDefinition(key).unit,
    unit: row.unit,
    lowValue,
    highValue,
    lowOutcome,
    highOutcome,
    difference: highOutcome - lowOutcome,
    note: `\`${key}\` este inertă în scenariul ${row.name}`,
  };
}

/** Largest lateral-progress gap between the neutral and the active profile during one manoeuvre. */
function progressDivergence(): number {
  const neutral = run(leftScene, {
      rValues: neutralLanePolicyValues,
      opportunityKey: opportunity.opportunityKey,
      ticks: 60,
    }),
    active = run(leftScene, {
      rValues: activeValues,
      opportunityKey: opportunity.opportunityKey,
      ticks: 60,
    });
  let maximum = 0;
  for (let index = 0; index < 60; index++)
    maximum = Math.max(
      maximum,
      Math.abs(
        (active.commands[index]?.lateralProgress ?? 0) -
          (neutral.commands[index]?.lateralProgress ?? 0),
      ),
    );
  return maximum;
}

/** Runs the real 053 layer and the 177 layer over it for both profiles. */
function compatibility(): LanePolicyCompatibility {
  const scenes: readonly LanePolicyScene[] = [
      leftScene,
      { ...leftScene, frontGapM: 4 },
      { ...leftScene, coverage: 'LOCAL_ONLY' },
      { ...leftScene, targetLaneId: 'lane-absent' },
      { ...rightScene, overtake: false },
      { ...rightScene, overtake: true },
    ],
    document = lanePolicyDocument(),
    neutral053 = projectLaneChangeProfile(parsePublishableDrivingProfile(document)),
    active053 = projectLaneChangeProfile(
      parsePublishableDrivingProfile(lanePolicyDocument(activeValues)),
    );
  let comparableTicks = 0,
    identicalLaneChangeResults = 0,
    forwardCheckedTicks = 0,
    neutralForwardTicks = 0,
    rightPassRefusedTicks = 0,
    activeDifferingTicks = 0;
  for (let tick = 1; tick <= 60; tick++) {
    const scene = scenes[(tick - 1) % scenes.length],
      decisionTick = scenario.tick + tick,
      neutralChange = evaluateLaneChange053(scene, neutral053, decisionTick),
      activeChange = evaluateLaneChange053(scene, active053, decisionTick),
      neutral = evaluate(scene, { tick: decisionTick, laneChange: neutralChange }),
      live = evaluate(scene, {
        tick: decisionTick,
        laneChange: activeChange,
        rValues: activeValues,
      }),
      rightOvertake = scene.overtake && scene.targetLaneId === 'lane-right';
    comparableTicks += 1;
    if (JSON.stringify(neutralChange) === JSON.stringify(activeChange))
      identicalLaneChangeResults += 1;
    if (rightOvertake) {
      // The delivered default `pass_on_right_probability = 0` refuses the right pass, which is an
      // R consequence of the neutral configuration and not a change to the 053 result.
      if (neutral.command.action === 'NO_CHANGE' && neutral.command.rightOvertakeGranted === false)
        rightPassRefusedTicks += 1;
    } else {
      forwardCheckedTicks += 1;
      if (
        neutral.command.action === (neutralChange.action === 'CHANGE' ? 'LANE_CHANGE' : 'NO_CHANGE')
      )
        neutralForwardTicks += 1;
    }
    if (
      live.command.action !== neutral.command.action ||
      live.command.signalUsed !== neutral.command.signalUsed ||
      live.command.lateralProgress !== neutral.command.lateralProgress
    ) {
      activeDifferingTicks += 1;
    }
  }
  const unitsOf = (values: Readonly<Record<string, number>>) =>
    Object.fromEntries(Object.keys(values).map((key) => [key, getParameterDefinition(key).unit]));
  return {
    identicalLaneChangeTicks: comparableTicks === identicalLaneChangeResults,
    comparableTicks,
    identicalLaneChangeResults,
    forwardCheckedTicks,
    neutralForwardTicks,
    rightPassRefusedTicks,
    activeDifferingTicks,
    maximumProgressDifference: progressDivergence(),
    mUnits: unitsOf({
      lane_change_front_gap: 0,
      lane_change_back_gap: 0,
      lane_change_speed_gain: 0,
      lane_change_cooldown: 0,
    }),
    rUnits: unitsOf(Object.fromEntries(LANE_POLICY_V2_KEYS.map((key) => [key, 1]))),
  };
}

/** Feeds the layer a 053 continuity result while the lead interval runs. */
function staleLead(): { readonly stale: LanePolicyV2Command; readonly fresh: LanePolicyV2Command } {
  const first = evaluate(leftScene, {
      rValues: { signal_use_probability: 1, signal_lead_time: 2 },
      opportunityKey: opportunity.opportunityKey,
    }),
    continuity = evaluateLaneChange053(
      leftScene,
      projectLaneChangeProfile(parsePublishableDrivingProfile(lanePolicyDocument())),
      first.decisionTick + 1,
      first.change.state,
    ),
    stale = evaluate(leftScene, {
      rValues: { signal_use_probability: 1, signal_lead_time: 2 },
      opportunityKey: opportunity.opportunityKey,
      tick: first.decisionTick + 1,
      state: first.command.state,
      laneChange: continuity,
    }).command,
    fresh = evaluate(leftScene, {
      rValues: { signal_use_probability: 1, signal_lead_time: 2 },
      opportunityKey: opportunity.opportunityKey,
      tick: first.decisionTick + 1,
      state: first.command.state,
    }).command;
  return { stale, fresh };
}

function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): LanePolicyCheck {
  return { id, pass, detail };
}
const admitDuration = (value: number): number => {
  try {
    lanePolicyProfile({ lane_change_duration: value });
    return 1;
  } catch {
    return 0;
  }
};

export function runLanePolicyReport(): LanePolicyReport {
  const parameters = LANE_POLICY_V2_KEYS.map((key) => {
      const definition = getParameterDefinition(key);
      return {
        key,
        unit: definition.unit,
        minimum: definition.min,
        maximum: definition.max,
        defaultValue: definition.default,
      };
    }),
    effects = scenarioRows.map((row) => {
      const [low, high] = ranges[row.key];
      return effectRow(row, low, high);
    }),
    separation: LanePolicyEffect[] = [],
    dependencies: LanePolicyDependency[] = [];
  for (const row of scenarioRows)
    for (const key of LANE_POLICY_V2_KEYS) {
      if (key === row.key) continue;
      const [low, high] = ranges[key],
        entry = separationRow(row, key, low, high);
      if (entry.difference === 0) separation.push(entry);
      else
        dependencies.push({
          key,
          scenario: row.name,
          difference: entry.difference,
          note:
            'avansul de semnalizare există numai când semnalizarea este folosită; fără indicator ' +
            'manevra pornește în tick-ul validării, deci cheia de semnalizare deblochează avansul',
        });
    }
  const slowDuration = progressAfterStart(leftScene, {
      rValues: { ...signalOff, lane_change_duration: 0.5 },
      advanceTicks: 0,
    }),
    fastDuration = progressAfterStart(leftScene, {
      rValues: { ...signalOff, lane_change_duration: 5 },
      advanceTicks: 0,
    }),
    forbidden = evaluate(
      { ...rightScene, rightOvertake: 'FORBIDDEN' },
      {
        rValues: { ...signalOff, pass_on_right_probability: 1 },
        opportunityKey: passOpportunity.opportunityKey,
      },
    ).command,
    unknownMap = evaluate(
      { ...rightScene, rightOvertake: 'UNKNOWN' },
      {
        rValues: { ...signalOff, pass_on_right_probability: 1 },
        opportunityKey: passOpportunity.opportunityKey,
      },
    ).command,
    noSpace = evaluate(
      { ...rightScene, rightLaneSpaceM: 8 },
      {
        rValues: { ...signalOff, pass_on_right_probability: 1 },
        opportunityKey: passOpportunity.opportunityKey,
      },
    ).command,
    undeclaredSpace = evaluate(
      { ...rightScene, rightLaneSpaceM: null },
      {
        rValues: { ...signalOff, pass_on_right_probability: 1 },
        opportunityKey: passOpportunity.opportunityKey,
      },
    ).command,
    leftWithRightKey = evaluate(leftScene, {
      rValues: { ...signalOff, pass_on_right_probability: 1 },
      opportunityKey: passOpportunity.opportunityKey,
    }).command,
    lead = staleLead(),
    cancelled = evaluate(leftScene, {
      rValues: { signal_use_probability: 1, signal_lead_time: 5 },
      opportunityKey: opportunity.opportunityKey,
      tick: scenario.tick + 10,
      state: {
        targetLaneId: 'lane-left',
        signalTick: scenario.tick,
        signalUsed: true,
        manoeuvreStartTick: null,
      },
      laneChange: evaluate({ ...leftScene, frontGapM: 4 }, { tick: scenario.tick + 10 }).change,
    }).command,
    stopDominant = evaluate(
      { ...leftScene, frontGapM: 4 },
      { rValues: activeValues, opportunityKey: opportunity.opportunityKey },
    ).command,
    unknownLaneChange = evaluate(leftScene, {
      laneChange: evaluateLaneChange053(leftScene, null),
    }).command,
    abandoned = evaluate(leftScene, {
      rValues: { ...signalOff, lane_change_duration: 5 },
      opportunityKey: opportunity.opportunityKey,
      tick: scenario.tick + 10,
      state: {
        targetLaneId: 'lane-left',
        signalTick: null,
        signalUsed: false,
        manoeuvreStartTick: scenario.tick,
      },
      laneChange: evaluate({ ...leftScene, frontGapM: 4 }, { tick: scenario.tick + 10 }).change,
    }).command,
    safety: LanePolicyEffect[] = [
      {
        key: 'podeaua duratei',
        scenario: 'durata efectivă a manevrei la minimul de catalog 0,5 s și la maximul de 5 s',
        keyUnit: 's',
        unit: 'ticks',
        lowValue: 0.5,
        highValue: 5,
        lowOutcome: slowDuration.durationTicks,
        highOutcome: fastDuration.durationTicks,
        difference: fastDuration.durationTicks - slowDuration.durationTicks,
        note:
          'durata efectivă este `max(cheie, 1 s)`: 60 de tick-uri la 0,5 s și 300 la 5 s, deci ' +
          'nicio valoare admisă nu schimbă banda instantaneu',
      },
      {
        key: 'durata zero refuzată',
        scenario: 'cheia 0 s (sub minimul de catalog) și 0,5 s',
        keyUnit: 's',
        unit: 'ratio',
        lowValue: 0,
        highValue: 0.5,
        lowOutcome: admitDuration(0),
        highOutcome: admitDuration(0.5),
        difference: admitDuration(0.5) - admitDuration(0),
        note: '0 s nu este o durată admisibilă; podeaua de politică rămâne 1 s',
      },
      {
        key: 'dreapta interzisă',
        scenario: 'harta declară depășirea prin dreapta interzisă, cheia maximă',
        keyUnit: 'probability',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: forbidden.action === 'LANE_CHANGE' ? 1 : 0,
        difference: forbidden.action === 'LANE_CHANGE' ? 1 : 0,
        note: `comanda rămâne ${forbidden.reason}, fără eșantion (${forbidden.rightOvertakeSample})`,
      },
      {
        key: 'dreapta nedeclarată',
        scenario: 'harta nu declară permisiunea, cheia maximă',
        keyUnit: 'probability',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: unknownMap.action === 'LANE_CHANGE' ? 1 : 0,
        difference: unknownMap.action === 'LANE_CHANGE' ? 1 : 0,
        note: `necunoscutul este refuzat ca și interdicția: ${unknownMap.reason}`,
      },
      {
        key: 'dreapta fără spațiu',
        scenario: '8 m liberi în banda dreaptă, sub `lane_change_front_gap` 12 m, cheia maximă',
        keyUnit: 'probability',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: noSpace.action === 'LANE_CHANGE' ? 1 : 0,
        difference: noSpace.action === 'LANE_CHANGE' ? 1 : 0,
        note: `${noSpace.reason}; spațiul cerut este ${noSpace.requiredRightSpaceM} m`,
      },
      {
        key: 'dreapta fără spațiu declarat',
        scenario: 'spațiul din banda dreaptă nedeclarat, cheia maximă',
        keyUnit: 'probability',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: undeclaredSpace.action === 'LANE_CHANGE' ? 1 : 0,
        difference: undeclaredSpace.action === 'LANE_CHANGE' ? 1 : 0,
        note: `${undeclaredSpace.reason}; un spațiu necunoscut nu este tratat ca liber`,
      },
      {
        key: 'stânga nu consultă cheia de dreapta',
        scenario: 'schimbare validată pe banda stângă, cheia maximă',
        keyUnit: 'probability',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 1,
        highOutcome: leftWithRightKey.action === 'LANE_CHANGE' ? 1 : 0,
        difference: (leftWithRightKey.action === 'LANE_CHANGE' ? 1 : 0) - 1,
        note: `manevra pornește fără eșantion de dreapta: requested ${leftWithRightKey.rightOvertakeRequested}, sample ${leftWithRightKey.rightOvertakeSample}`,
      },
      {
        key: 'avansul nu pornește pe continuitate',
        scenario: '053 raportează `COMMITTED_CONTINUITY` în timpul avansului de 2 s',
        keyUnit: 's',
        unit: 'ratio',
        lowValue: 0,
        highValue: 2,
        lowOutcome: lead.stale.lateralProgress === 0 ? 0 : 1,
        highOutcome: 0,
        difference: 0,
        note: `${lead.stale.reason}; validarea proaspătă din același tick rămâne ${lead.fresh.reason}`,
      },
      {
        key: 'avansul anulat de 053',
        scenario: '053 refuză în timpul avansului, cu cheile la maxim',
        keyUnit: 'probability',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: cancelled.action === 'LANE_CHANGE' ? 1 : 0,
        difference: cancelled.action === 'LANE_CHANGE' ? 1 : 0,
        note: `${cancelled.reason}; latch-ul este eliberat (${cancelled.state.targetLaneId})`,
      },
      {
        key: '053 domină toate cheile',
        scenario: '053 refuză cu `INSUFFICIENT_FRONT_GAP`, toate cheile la maxim',
        keyUnit: 'probability',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: stopDominant.action === 'LANE_CHANGE' ? 1 : 0,
        difference: stopDominant.action === 'LANE_CHANGE' ? 1 : 0,
        note: `${stopDominant.reason} (${stopDominant.laneChangeReason}); nicio cheie nu pornește manevra`,
      },
      {
        key: '053 indisponibil',
        scenario: 'rezultat 053 `UNKNOWN`, cheile la maxim',
        keyUnit: 'probability',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: unknownLaneChange.action === 'UNKNOWN' ? 1 : 0,
        highOutcome: unknownLaneChange.action === 'UNKNOWN' ? 1 : 0,
        difference: 0,
        note: `${unknownLaneChange.reason}; stratul nu inventează o manevră`,
      },
      {
        key: 'manevra abandonată',
        scenario: '053 nu mai validează în timpul manevrei, după 10 tick-uri',
        keyUnit: 's',
        unit: 'ratio',
        lowValue: 0,
        highValue: 5,
        lowOutcome: 0,
        highOutcome: abandoned.action === 'LANE_CHANGE' ? 1 : 0,
        difference: abandoned.action === 'LANE_CHANGE' ? 1 : 0,
        note: `${abandoned.reason}; progresul raportat la abandon este ${abandoned.lateralProgress?.toFixed(3)}`,
      },
    ],
    compatibilityReport = compatibility(),
    series = () => {
      const seriesScenes: readonly LanePolicyScene[] = [
          leftScene,
          { ...leftScene, ownLaneLeaderSpeedMps: null },
          rightScene,
          { ...rightScene, rightOvertake: 'FORBIDDEN' },
          { ...leftScene, frontGapM: 4 },
          { ...rightScene, overtake: false },
        ],
        values = {
          lane_change_duration: 2.5,
          signal_lead_time: 1,
          signal_use_probability: 0.6,
          pass_on_right_probability: 0.5,
        };
      return seriesScenes.map((scene, index) =>
        evaluate(scene, {
          tick: scenario.tick + index,
          opportunityKey: passOpportunity.opportunityKey,
          rValues: values,
        }),
      );
    },
    fingerprint = () =>
      JSON.stringify(
        series().map((row) => [
          row.command.reason,
          row.command.action,
          row.command.lateralProgress,
          row.command.signalUsed,
          row.command.manoeuvreDurationTicks,
          row.command.rightOvertakeGranted,
          row.command.state.manoeuvreStartTick,
        ]),
      ),
    determinismDigest = digest(fingerprint()),
    repeatedDigest = digest(fingerprint());
  const durationEffect = effects[0],
    leadEffect = effects[1],
    signalEffect = effects[2],
    rightEffect = effects[3],
    checks: LanePolicyCheck[] = [
      check(
        'key-duration-effect',
        durationEffect.difference < 0,
        `progres după 30 de tick-uri: ${durationEffect.lowValue} s -> ${durationEffect.lowOutcome.toFixed(3)}, ${durationEffect.highValue} s -> ${durationEffect.highOutcome.toFixed(3)}`,
      ),
      check(
        'key-duration-floor',
        slowDuration.durationTicks === LANE_POLICY_V2_LIMITS.minimumManoeuvreDurationS * 60 &&
          slowDuration.started.lateralProgress === 0,
        `durata efectivă la 0,5 s este ${slowDuration.durationTicks} tick-uri, progres 0 la start`,
      ),
      check(
        'key-duration-not-instant',
        admitDuration(0) === 0 && admitDuration(0.5) === 1,
        '0 s este refuzat de catalog, iar 0,5 s este ridicat la podeaua de 1 s',
      ),
      check(
        'key-lead-effect',
        leadEffect.lowOutcome === 0 && leadEffect.highOutcome === 300,
        `întârziere ${leadEffect.lowOutcome} -> ${leadEffect.highOutcome} tick-uri`,
      ),
      check(
        'key-signal-effect',
        signalEffect.lowOutcome === 0 && signalEffect.highOutcome === 1,
        `indicator ${signalEffect.lowOutcome} -> ${signalEffect.highOutcome}, eșantion ${opportunity.signalSample.toFixed(6)}`,
      ),
      check(
        'key-right-effect',
        rightEffect.lowOutcome === 0 && rightEffect.highOutcome === 1,
        `depășire prin dreapta ${rightEffect.lowOutcome} -> ${rightEffect.highOutcome}, eșantion ${passOpportunity.passSample.toFixed(6)}`,
      ),
      check(
        'safety-right-forbidden',
        forbidden.action === 'NO_CHANGE' &&
          forbidden.reason === 'RIGHT_OVERTAKE_FORBIDDEN' &&
          forbidden.rightOvertakeSample === null,
        'harta interzice: refuz înaintea eșantionului',
      ),
      check(
        'safety-right-unknown',
        unknownMap.action === 'NO_CHANGE' &&
          unknownMap.reason === 'RIGHT_OVERTAKE_FORBIDDEN' &&
          unknownMap.rightOvertakeSample === null,
        'permisiunea nedeclarată este refuzată închis',
      ),
      check(
        'safety-right-space',
        noSpace.action === 'NO_CHANGE' &&
          noSpace.reason === 'RIGHT_OVERTAKE_NO_SPACE' &&
          undeclaredSpace.reason === 'RIGHT_OVERTAKE_NO_SPACE',
        `8 m și spațiul nedeclarat refuză cheia 1; cerința ${noSpace.requiredRightSpaceM} m`,
      ),
      check(
        'safety-right-left-inert',
        leftWithRightKey.action === 'LANE_CHANGE' &&
          leftWithRightKey.rightOvertakeRequested === false &&
          leftWithRightKey.rightOvertakeSample === null,
        'o schimbare pe stânga nu este depășire prin dreapta',
      ),
      check(
        'safety-lead-stale',
        lead.stale.reason === 'SIGNAL_LEAD_STALE' &&
          lead.stale.lateralProgress === 0 &&
          lead.stale.state.manoeuvreStartTick === null,
        'avansul nu pornește manevra pe un latch 053 vechi',
      ),
      check(
        'safety-lead-fresh',
        lead.fresh.action === 'SIGNAL_ONLY' && lead.fresh.reason === 'SIGNAL_LEAD',
        'aceeași stare cu validare proaspătă rămâne în avans',
      ),
      check(
        'safety-lead-cancelled',
        cancelled.action === 'NO_CHANGE' &&
          cancelled.reason === 'SIGNAL_CANCELLED' &&
          cancelled.state.targetLaneId === null,
        'refuzul 053 anulează avansul și eliberează latch-ul',
      ),
      check(
        'safety-lane-change-dominant',
        stopDominant.action === 'NO_CHANGE' && stopDominant.reason === 'NO_LANE_CHANGE',
        'refuzul 053 rămâne dominant cu toate cheile la maxim',
      ),
      check(
        'safety-lane-change-unknown',
        unknownLaneChange.action === 'UNKNOWN' &&
          unknownLaneChange.reason === 'LANE_CHANGE_UNAVAILABLE',
        'rezultatul 053 indisponibil rămâne UNKNOWN',
      ),
      check(
        'safety-manoeuvre-abandoned',
        abandoned.action === 'NO_CHANGE' && abandoned.reason === 'MANOEUVRE_ABANDONED',
        'o manevră începută este abandonată când 053 nu mai validează',
      ),
      check(
        'separation-independent',
        dependencies.length === 1 &&
          dependencies[0].key === 'signal_use_probability' &&
          dependencies[0].scenario === 'semnalizare înainte de manevră' &&
          dependencies[0].difference === 300 &&
          separation.every((entry) => entry.difference === 0),
        `${separation.length} perechi inerte cu diferența 0, plus dependența explicită signal_use_probability -> signal_lead_time (300 tick-uri)`,
      ),
      check(
        'm-identical-delivered-results',
        compatibilityReport.identicalLaneChangeTicks,
        `${compatibilityReport.identicalLaneChangeResults}/${compatibilityReport.comparableTicks} rezultate 053 identice cu cheile R neutre vs active`,
      ),
      check(
        'm-neutral-forwards',
        compatibilityReport.neutralForwardTicks === compatibilityReport.forwardCheckedTicks &&
          compatibilityReport.activeDifferingTicks > 0,
        `${compatibilityReport.neutralForwardTicks}/${compatibilityReport.forwardCheckedTicks} comenzi neutre identice cu 053; ${compatibilityReport.rightPassRefusedTicks} depășiri prin dreapta refuzate de cheia neutră 0; ${compatibilityReport.activeDifferingTicks} tick-uri active diferă`,
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
      check(
        'units',
        parameters.every(
          (entry) => entry.unit === (entry.key.endsWith('_probability') ? 'probability' : 's'),
        ),
        parameters.map((entry) => `${entry.key} ${entry.unit}`).join(', '),
      ),
      check('determinism', determinismDigest === repeatedDigest, `digest ${determinismDigest}`),
    ];
  const passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '177-lane-policy-v2',
    parameters,
    scenarios: scenarioRows.map((row) => ({ name: row.name, scenario: row.description })),
    effects,
    separation,
    dependencies,
    safety,
    compatibility: compatibilityReport,
    determinism: { ticks: 6, digest: determinismDigest, repeatedDigest },
    checks,
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}

export function lanePolicyReportMarkdown(report: LanePolicyReport): string {
  const rows = (entries: readonly LanePolicyEffect[]) =>
      entries
        .map(
          (entry) =>
            `| \`${entry.key}\` | ${entry.scenario} | ${entry.lowValue} | ${entry.lowOutcome.toFixed(3)} | ${entry.highValue} | ${entry.highOutcome.toFixed(3)} | ${entry.difference.toFixed(3)} | ${entry.unit} | ${entry.note} |`,
        )
        .join('\n'),
    header = [
      '| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ];
  return [
    '# 177 — raport politică extinsă pentru schimbare de bandă și depășire',
    '',
    'Generat de `scripts/run-v2-lane-policy-report.mjs` din contractul `177-lane-policy-v2`.',
    'Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei.',
    '',
    '## Scenariile',
    '',
    '| Scenariu | Descriere |',
    '| --- | --- |',
    ...report.scenarios.map((entry) => `| ${entry.name} | ${entry.scenario} |`),
    '',
    '## Efectul izolat al fiecărei chei',
    '',
    ...header,
    rows(report.effects),
    '',
    '## Separarea cheilor (fiecare cheie inertă în celelalte scenarii)',
    '',
    ...header,
    rows(report.separation),
    '',
    '## Dependența explicită dintre chei',
    '',
    '| Cheie | Scenariu | Diferență | Motiv |',
    '| --- | --- | ---: | --- |',
    ...report.dependencies.map(
      (entry) =>
        `| \`${entry.key}\` | ${entry.scenario} | ${entry.difference.toFixed(3)} | ${entry.note} |`,
    ),
    '',
    '## Siguranță: plafoanele, avansul și subordonarea rămân dominante',
    '',
    ...header,
    rows(report.safety),
    '',
    '## Compatibilitate cu cheile M',
    '',
    `- Rezultate 053 identice cu cheile R neutre vs active: **${report.compatibility.identicalLaneChangeResults}/${report.compatibility.comparableTicks} tick-uri**.`,
    `- Comenzi neutre identice cu 053: **${report.compatibility.neutralForwardTicks}/${report.compatibility.forwardCheckedTicks}** (schimbări pe stânga și schimbări pe dreapta care nu sunt depășiri).`,
    `- Depășiri prin dreapta refuzate de cheia neutră 0: **${report.compatibility.rightPassRefusedTicks}** tick-uri.`,
    `- Tick-uri active care diferă de comanda neutră: **${report.compatibility.activeDifferingTicks}**, diferență maximă de progres lateral **${report.compatibility.maximumProgressDifference.toFixed(3)}**.`,
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
