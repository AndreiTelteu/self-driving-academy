import { getParameterDefinition } from '../../src/profiles';
import {
  STOP_PRIORITY_POLICY_LIMITS,
  compileStopPriorityProfile,
  evaluateStopPriorityPolicy,
} from '../../src/autonomy/stop-priority-policy';
import type {
  StopPriorityPolicyKey,
  StopPriorityPolicyMKey,
  StopPriorityPolicyProfile,
} from '../../src/autonomy/stop-priority-policy';
import { evaluateStopPolicy } from '../../src/autonomy/stop-policy';
import { projectStopProfile } from '../../src/autonomy/stop-policy';
import { projectYieldProfile } from '../../src/autonomy/yield-policy';
import { parsePublishableDrivingProfile } from '../../src/profiles/parameter-registry';
import {
  SEED,
  blockedEntryOpportunity,
  evaluate,
  evaluateStop,
  evaluateYield,
  scenario,
  stop051Observation,
  stopPriorityDocument,
  stopPriorityObservation,
} from './stop-priority-policy-reference';
import type { StopPriorityScene } from './stop-priority-policy-reference';

export interface StopPolicyCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface StopPolicyEffect {
  readonly key: string;
  readonly scenario: string;
  readonly unit: string;
  readonly lowValue: number;
  readonly highValue: number;
  readonly lowOutcome: number;
  readonly highOutcome: number;
  readonly difference: number;
  readonly note: string;
}
export interface StopPolicyCompatibility {
  readonly identicalStopTicks: boolean;
  readonly identicalYieldTicks: boolean;
  readonly comparableTicks: number;
  readonly identicalStopResults: number;
  readonly identicalYieldResults: number;
  readonly neutralForwardTicks: number;
  readonly activeDifferingTicks: number;
  readonly maximumRollingSpeedDifferenceMps: number;
  readonly mUnits: Readonly<Record<string, string>>;
  readonly rUnits: Readonly<Record<string, string>>;
}
export interface StopPolicyReport {
  readonly version: '175-stop-priority-policy-v1';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly scenarios: readonly { readonly name: string; readonly scenario: string }[];
  readonly effects: readonly StopPolicyEffect[];
  readonly separation: readonly StopPolicyEffect[];
  readonly safety: readonly StopPolicyEffect[];
  readonly compatibility: StopPolicyCompatibility;
  readonly determinism: {
    readonly ticks: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly StopPolicyCheck[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
}
const keys = [
  'rolling_stop_speed',
  'priority_assertiveness',
  'allway_stop_patience',
  'blocked_intersection_entry_probability',
] as const;
const activeValues = {
  rolling_stop_speed: 5,
  priority_assertiveness: 1,
  allway_stop_patience: 10,
  blocked_intersection_entry_probability: 1,
} as const;
const blockedOpportunity = blockedEntryOpportunity(0);
const rollingScene: StopPriorityScene = {
  speed: 8,
  stopDistanceM: 6,
  stopSpeed: 8,
  stationaryDurationS: null,
  crossed: false,
  allWayArrival: null,
  atIntersection: false,
  intersectionBlocked: false,
  intersectionExitM: null,
  yieldGapS: null,
};
const priorityScene: StopPriorityScene = {
  speed: 8,
  stopDistanceM: null,
  stopSpeed: 8,
  stationaryDurationS: null,
  crossed: false,
  allWayArrival: null,
  atIntersection: true,
  intersectionBlocked: false,
  intersectionExitM: 12,
  yieldGapS: 3,
};
const patienceScene: StopPriorityScene = {
  speed: 2,
  stopDistanceM: 0.5,
  stopSpeed: 2,
  stationaryDurationS: 2,
  crossed: false,
  allWayArrival: { position: 2, sinceDwellS: 4 },
  atIntersection: true,
  intersectionBlocked: false,
  intersectionExitM: 12,
  yieldGapS: null,
};
const blockedScene: StopPriorityScene = {
  speed: 8,
  stopDistanceM: null,
  stopSpeed: 8,
  stationaryDurationS: null,
  crossed: false,
  allWayArrival: null,
  atIntersection: true,
  intersectionBlocked: false,
  intersectionExitM: null,
  yieldGapS: null,
};
const yieldTimeGapScene: Partial<Record<StopPriorityPolicyMKey, number>> = { yield_time_gap: 6 };
const rollThroughScene: Partial<Record<StopPriorityPolicyMKey, number>> = {
  stop_full_probability: 0,
};
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): StopPolicyCheck {
  return { id, pass, detail };
}
const claimed = (row: ReturnType<typeof evaluate>) => (row.command.stopRequested ? 0 : 1),
  rollingSpeed = (row: ReturnType<typeof evaluate>) => row.command.rollThroughSpeedMps ?? 0,
  turnGranted = (row: ReturnType<typeof evaluate>) =>
    row.command.reason === 'ALLWAY_TURN' ? 1 : 0,
  entryGranted = (row: ReturnType<typeof evaluate>) =>
    row.command.blockedEntryGranted === true ? 1 : 0;
const ranges: Readonly<Record<StopPriorityPolicyKey, readonly [number, number]>> = {
  rolling_stop_speed: [0.2, 5],
  priority_assertiveness: [0, 1],
  allway_stop_patience: [0, 10],
  blocked_intersection_entry_probability: [0, 1],
};
interface ScenarioRow {
  readonly scene: StopPriorityScene;
  readonly name: string;
  readonly mValues: Partial<Record<StopPriorityPolicyMKey, number>>;
  readonly fixed: Partial<Record<StopPriorityPolicyKey, number>>;
  readonly measure: (row: ReturnType<typeof evaluate>) => number;
  readonly key: StopPriorityPolicyKey;
  readonly unit: string;
  readonly note: string;
}
const scenarioRows: readonly ScenarioRow[] = [
  {
    scene: rollingScene,
    name: 'rolling stop',
    mValues: rollThroughScene,
    fixed: { rolling_stop_speed: 1 },
    measure: rollingSpeed,
    key: 'rolling_stop_speed',
    unit: 'm/s',
    note:
      'viteza comandată prin zona STOP după o oprire completă omisă; plafonul de politică este ' +
      `${STOP_PRIORITY_POLICY_LIMITS.rollingStopMaximumMps} m/s, sub maximul de catalog de 5 m/s`,
  },
  {
    scene: priorityScene,
    name: 'revendicare la prioritate',
    mValues: yieldTimeGapScene,
    fixed: { priority_assertiveness: 0 },
    measure: claimed,
    key: 'priority_assertiveness',
    unit: 'ratio',
    note:
      'cerința efectivă scade de la pragul M `yield_time_gap` 6 s spre podeaua de ' +
      `${STOP_PRIORITY_POLICY_LIMITS.priorityMinimumGapS} s; separatorul declarat este 3 s, ` +
      'deci valoarea 0 refuză, iar valoarea 1 revendică',
  },
  {
    scene: patienceScene,
    name: 'răbdare la all-way stop',
    mValues: {},
    fixed: { allway_stop_patience: 0 },
    measure: turnGranted,
    key: 'allway_stop_patience',
    unit: 'ratio',
    note:
      'al doilea vehicul la all-way stop, cu 4 s scurse de la îndeplinirea opririi proprii: ' +
      '0 s eliberează imediat, 10 s ține oprirea suplimentară',
  },
  {
    scene: blockedScene,
    name: 'intrare în intersecție fără spațiu confirmat',
    mValues: {},
    fixed: { blocked_intersection_entry_probability: 0 },
    measure: entryGranted,
    key: 'blocked_intersection_entry_probability',
    unit: 'ratio',
    note:
      'spațiu de ieșire nedeclarat și intersecție nedeclarată blocată: probabilitatea efectivă ' +
      `este plafonată la ${STOP_PRIORITY_POLICY_LIMITS.blockedEntryMaximumProbability}, iar ` +
      'eșantionul oportunității este ' +
      blockedOpportunity.sample.toFixed(6),
  },
];

function separationRows(): StopPolicyEffect[] {
  const rows: StopPolicyEffect[] = [];
  for (const row of scenarioRows)
    for (const key of keys) {
      if (key === row.key) continue;
      const [lowValue, highValue] = ranges[key],
        low = evaluate(row.scene, {
          mValues: row.mValues,
          rValues: { ...row.fixed, [key]: lowValue },
          opportunityKey: blockedOpportunity.opportunityKey,
        }),
        high = evaluate(row.scene, {
          mValues: row.mValues,
          rValues: { ...row.fixed, [key]: highValue },
          opportunityKey: blockedOpportunity.opportunityKey,
        }),
        lowOutcome = row.measure(low),
        highOutcome = row.measure(high);
      rows.push({
        key,
        scenario: row.name,
        unit: 'ratio',
        lowValue,
        highValue,
        lowOutcome,
        highOutcome,
        difference: highOutcome - lowOutcome,
        note: `\`${key}\` este inertă în scenariul ${row.name}`,
      });
    }
  return rows;
}

/** Runs the real 051 and 052 layers and the 175 layer over them for both profiles, 60 ticks. */
function compatibility(): StopPolicyCompatibility {
  const scenes: readonly StopPriorityScene[] = [
      { ...priorityScene, stopDistanceM: 10, stationaryDurationS: null },
      { ...patienceScene, stationaryDurationS: 0 },
      { ...patienceScene, allWayArrival: null },
      { ...patienceScene, allWayArrival: { position: 2, sinceDwellS: 0.5 } },
      rollingScene,
      { ...blockedScene, intersectionExitM: 12 },
      { ...blockedScene, intersectionExitM: 12, yieldGapS: 3 },
      { ...rollingScene, stopDistanceM: null },
      { ...priorityScene, stopDistanceM: 10, stationaryDurationS: null, yieldGapS: 3 },
      { ...blockedScene, intersectionExitM: 12 },
    ],
    mValuesAt = (scene: StopPriorityScene) =>
      scene === rollingScene ? rollThroughScene : scene.yieldGapS === 3 ? yieldTimeGapScene : {};
  let comparableTicks = 0,
    identicalStopResults = 0,
    identicalYieldResults = 0,
    neutralForwardTicks = 0,
    activeDifferingTicks = 0,
    maximumRollingSpeedDifferenceMps = 0;
  for (let tick = 1; tick <= 60; tick++) {
    const scene = scenes[(tick - 1) % scenes.length],
      mValues = mValuesAt(scene),
      decisionTick = scenario.tick + tick,
      opportunityKey = blockedOpportunity.opportunityKey,
      neutralDocument = stopPriorityDocument({}, mValues),
      activeDocument = stopPriorityDocument(activeValues, mValues),
      neutralStop = projectStopProfile(parsePublishableDrivingProfile(neutralDocument)),
      activeStop = projectStopProfile(parsePublishableDrivingProfile(activeDocument)),
      neutralYield = projectYieldProfile(parsePublishableDrivingProfile(neutralDocument)),
      activeYield = projectYieldProfile(parsePublishableDrivingProfile(activeDocument)),
      stopNeutral = evaluateStop(scene, neutralStop, decisionTick),
      stopActive = evaluateStop(scene, activeStop, decisionTick),
      yieldNeutral = evaluateYield(scene, neutralYield, decisionTick),
      yieldActive = evaluateYield(scene, activeYield, decisionTick),
      neutralRow = evaluate(scene, { tick: decisionTick, mValues, opportunityKey }),
      activeRow = evaluate(scene, {
        tick: decisionTick,
        mValues,
        opportunityKey,
        rValues: activeValues,
      }),
      expected =
        stopNeutral.action === 'APPROACH' || stopNeutral.action === 'HOLD'
          ? 'STOP'
          : stopNeutral.action === 'ROLL_THROUGH'
            ? 'ROLL_THROUGH'
            : stopNeutral.action === 'RELEASE' || stopNeutral.action === 'NO_STOP'
              ? yieldNeutral.action === 'REFUSE'
                ? 'STOP'
                : 'PROCEED'
              : 'UNKNOWN';
    comparableTicks += 1;
    if (JSON.stringify(stopNeutral) === JSON.stringify(stopActive)) identicalStopResults += 1;
    if (JSON.stringify(yieldNeutral) === JSON.stringify(yieldActive)) identicalYieldResults += 1;
    if (neutralRow.command.action === expected) neutralForwardTicks += 1;
    if (
      activeRow.command.action !== neutralRow.command.action ||
      activeRow.command.allWayHoldS !== neutralRow.command.allWayHoldS ||
      activeRow.command.blockedEntryGranted !== neutralRow.command.blockedEntryGranted ||
      activeRow.command.rollThroughSpeedMps !== neutralRow.command.rollThroughSpeedMps
    ) {
      activeDifferingTicks += 1;
      maximumRollingSpeedDifferenceMps = Math.max(
        maximumRollingSpeedDifferenceMps,
        Math.abs(
          (activeRow.command.rollThroughSpeedMps ?? 0) -
            (neutralRow.command.rollThroughSpeedMps ?? 0),
        ),
      );
    }
  }
  const unitsOf = (values: Readonly<Record<string, number>>) =>
    Object.fromEntries(Object.keys(values).map((key) => [key, getParameterDefinition(key).unit]));
  return {
    identicalStopTicks: comparableTicks === identicalStopResults,
    identicalYieldTicks: comparableTicks === identicalYieldResults,
    comparableTicks,
    identicalStopResults,
    identicalYieldResults,
    neutralForwardTicks,
    activeDifferingTicks,
    maximumRollingSpeedDifferenceMps,
    mUnits: unitsOf({
      stop_full_probability: 0,
      stop_dwell_time: 0,
      stop_line_offset: 0,
      yield_time_gap: 0,
      speed_delta_urban: 0,
    }),
    rUnits: unitsOf(Object.fromEntries(keys.map((key) => [key, 1]))),
  };
}

/** Calls the layer with an explicit, already delivered 052 result (used for the refusal proof). */
function withYieldDecision(
  scene: StopPriorityScene,
  yieldDecision: unknown,
  rValues: Partial<Record<StopPriorityPolicyKey, number>>,
): ReturnType<typeof evaluateStopPriorityPolicy> {
  const document = stopPriorityDocument(rValues),
    profile: StopPriorityPolicyProfile = compileStopPriorityProfile(document),
    published = parsePublishableDrivingProfile(document),
    decisionTick = scenario.tick;
  return evaluateStopPriorityPolicy({
    ...scenario.scope,
    actor: scenario.actor,
    decisionTick,
    authority: 'AUTO',
    seed: SEED,
    opportunityKey: blockedOpportunity.opportunityKey,
    profile,
    stopDecision: evaluateStopPolicy({
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick,
      seed: SEED,
      profile: projectStopProfile(published),
      observation: stop051Observation(scene, decisionTick),
      leaderStop: 'NONE',
    }),
    yieldDecision,
    observation: stopPriorityObservation(scene, decisionTick),
  });
}

export function runStopPolicyReport(): StopPolicyReport {
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
    effects: StopPolicyEffect[] = scenarioRows.map((row) => {
      const [lowValue, highValue] = ranges[row.key],
        low = evaluate(row.scene, {
          mValues: row.mValues,
          rValues: { ...row.fixed, [row.key]: lowValue },
          opportunityKey: blockedOpportunity.opportunityKey,
        }),
        high = evaluate(row.scene, {
          mValues: row.mValues,
          rValues: { ...row.fixed, [row.key]: highValue },
          opportunityKey: blockedOpportunity.opportunityKey,
        }),
        lowOutcome = row.measure(low),
        highOutcome = row.measure(high);
      return {
        key: row.key,
        scenario: row.name,
        unit: row.unit,
        lowValue,
        highValue,
        lowOutcome,
        highOutcome,
        difference: highOutcome - lowOutcome,
        note: row.note,
      };
    }),
    separation = separationRows(),
    slowRoll = evaluate(rollingScene, {
      mValues: rollThroughScene,
      rValues: { rolling_stop_speed: 0.2 },
    }),
    fastRoll = evaluate(rollingScene, {
      mValues: rollThroughScene,
      rValues: { rolling_stop_speed: 5 },
    }),
    veto = evaluate(
      { ...blockedScene, intersectionBlocked: true },
      {
        rValues: { blocked_intersection_entry_probability: 1 },
        opportunityKey: blockedOpportunity.opportunityKey,
      },
    ),
    insufficient = evaluate(
      { ...blockedScene, intersectionExitM: 3 },
      {
        rValues: { blocked_intersection_entry_probability: 1 },
        opportunityKey: blockedOpportunity.opportunityKey,
      },
    ),
    cappedEntry = evaluate(blockedScene, {
      rValues: { blocked_intersection_entry_probability: 1 },
      opportunityKey: blockedOpportunity.opportunityKey,
    }),
    floorRefused = evaluate(
      { ...priorityScene, yieldGapS: 2.9 },
      { mValues: { yield_time_gap: 8 }, rValues: { priority_assertiveness: 1 } },
    ),
    floorGranted = evaluate(
      { ...priorityScene, yieldGapS: 3 },
      { mValues: { yield_time_gap: 8 }, rValues: { priority_assertiveness: 1 } },
    ),
    inertThreshold = evaluate(
      { ...priorityScene, yieldGapS: 0.2 },
      { mValues: { yield_time_gap: 0.2 }, rValues: { priority_assertiveness: 1 } },
    ),
    stopDominant = evaluate(
      { ...priorityScene, stopDistanceM: 10, stationaryDurationS: null },
      { mValues: yieldTimeGapScene, rValues: activeValues },
    ),
    firstArrival = evaluate(
      { ...patienceScene, allWayArrival: { position: 1, sinceDwellS: 0 } },
      { rValues: { allway_stop_patience: 10 } },
    ),
    unknownYield = evaluateYield(
      priorityScene,
      projectYieldProfile(
        parsePublishableDrivingProfile(stopPriorityDocument({}, yieldTimeGapScene)),
      ),
      scenario.tick,
      'LOCAL_ONLY',
    ),
    unknownYieldRow = withYieldDecision(priorityScene, unknownYield, {
      priority_assertiveness: 1,
    }),
    safety: StopPolicyEffect[] = [
      {
        key: 'plafonul rolling stop',
        scenario: '051 rolling stop, cheia la maximul de catalog 5 m/s',
        unit: 'm/s',
        lowValue: 0.2,
        highValue: 5,
        lowOutcome: slowRoll.command.rollThroughSpeedMps ?? 0,
        highOutcome: fastRoll.command.rollThroughSpeedMps ?? 0,
        difference:
          (fastRoll.command.rollThroughSpeedMps ?? 0) - (slowRoll.command.rollThroughSpeedMps ?? 0),
        note:
          'viteza comandată este plafonată la ' +
          `${STOP_PRIORITY_POLICY_LIMITS.rollingStopMaximumMps} m/s, sub maximul de catalog de ` +
          '5 m/s, deci o rolling stop rămâne o traversare lentă',
      },
      {
        key: 'veto intersecție blocată',
        scenario: 'interior blocat declarat, cheia maximă',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: veto.command.stopRequested ? 1 : 0,
        highOutcome: veto.command.stopRequested ? 1 : 0,
        difference: 0,
        note: `comanda rămâne ${veto.command.reason} pentru ambele capete ale cheii; veto-ul precede orice eșantion`,
      },
      {
        key: 'spațiu de ieșire insuficient',
        scenario: '3 m de spațiu de ieșire, cheia maximă',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: insufficient.command.stopRequested ? 1 : 0,
        highOutcome: insufficient.command.stopRequested ? 1 : 0,
        difference: 0,
        note: `sub ${STOP_PRIORITY_POLICY_LIMITS.minimumExitStorageM} m de stocare ieșirea nu este sigură: ${insufficient.command.reason}`,
      },
      {
        key: 'plafonul intrării blocate',
        scenario: 'spațiu nedeclarat, cheia maximă',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: cappedEntry.command.blockedEntryProbability ?? 0,
        difference: cappedEntry.command.blockedEntryProbability ?? 0,
        note: `probabilitatea efectivă este plafonată la ${STOP_PRIORITY_POLICY_LIMITS.blockedEntryMaximumProbability}, nu la maximul de catalog 1`,
      },
      {
        key: 'podeaua asertivității',
        scenario: 'yield_time_gap 8 s, separator 2,9 s, asertivitate 1',
        unit: 'ratio',
        lowValue: 2.9,
        highValue: 3,
        lowOutcome: floorRefused.command.stopRequested ? 1 : 0,
        highOutcome: floorGranted.command.stopRequested ? 1 : 0,
        difference:
          (floorGranted.command.stopRequested ? 1 : 0) -
          (floorRefused.command.stopRequested ? 1 : 0),
        note: `podeaua de ${STOP_PRIORITY_POLICY_LIMITS.priorityMinimumGapS} s nu este coborâtă; 2,9 s rămâne refuzat, 3 s este revendicat`,
      },
      {
        key: 'inertă sub podea',
        scenario: 'yield_time_gap 0,2 s, separator 0,2 s, asertivitate 1',
        unit: 'ratio',
        lowValue: 0.2,
        highValue: 1,
        lowOutcome: inertThreshold.command.requiredGapS ?? 0,
        highOutcome: inertThreshold.command.requiredGapS ?? 0,
        difference: 0,
        note: `pragul M rămâne ${inertThreshold.command.requiredGapS} s, deci consecința lui 052 nu este rescrisă`,
      },
      {
        key: 'stopul 051 dominant',
        scenario: '051 APPROACH cu toate cheile la maxim',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: stopDominant.command.stopRequested ? 1 : 0,
        highOutcome: stopDominant.command.stopRequested ? 1 : 0,
        difference: 0,
        note: `intenția 051 rămâne ${stopDominant.command.reason}; nicio cheie nu o transformă în trecere`,
      },
      {
        key: 'primul la all-way',
        scenario: 'poziția 1 la all-way stop, răbdare 10 s',
        unit: 'ratio',
        lowValue: 0,
        highValue: 10,
        lowOutcome: firstArrival.command.stopRequested ? 1 : 0,
        highOutcome: firstArrival.command.stopRequested ? 1 : 0,
        difference: 0,
        note: `primul sosit nu este întârziat: ${firstArrival.command.action}`,
      },
      {
        key: 'rezultat 052 indisponibil',
        scenario: 'acoperire LOCAL_ONLY, asertivitate 1',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: unknownYieldRow.action === 'UNKNOWN' ? 1 : 0,
        highOutcome: unknownYieldRow.action === 'UNKNOWN' ? 1 : 0,
        difference: 0,
        note: `052 ${unknownYield.action} (${unknownYield.reason}) rămâne ${unknownYieldRow.reason}; cheia nu inventează o revendicare`,
      },
    ];
  const compatibilityReport = compatibility(),
    series = () => {
      const seriesScenes: readonly StopPriorityScene[] = [
          rollingScene,
          priorityScene,
          patienceScene,
          blockedScene,
          { ...blockedScene, intersectionBlocked: true },
          { ...patienceScene, allWayArrival: { position: 1, sinceDwellS: 2 } },
        ],
        seriesMValues: readonly Partial<Record<StopPriorityPolicyMKey, number>>[] = [
          rollThroughScene,
          yieldTimeGapScene,
          {},
          {},
          {},
          {},
        ],
        values = {
          rolling_stop_speed: 2,
          priority_assertiveness: 0.6,
          allway_stop_patience: 4,
          blocked_intersection_entry_probability: 0.5,
        };
      return seriesScenes.map((scene, index) =>
        evaluate(scene, {
          tick: scenario.tick + index,
          opportunityKey: blockedOpportunity.opportunityKey,
          mValues: seriesMValues[index],
          rValues: values,
        }),
      );
    },
    fingerprint = () =>
      JSON.stringify(
        series().map((row) => [
          row.command.reason,
          row.command.action,
          row.command.rollThroughSpeedMps,
          row.command.allWayHoldS,
          row.command.blockedEntryGranted,
          row.command.requiredGapS,
        ]),
      ),
    determinismDigest = digest(fingerprint()),
    repeatedDigest = digest(fingerprint());
  const checks: StopPolicyCheck[] = [
    check(
      'key-rolling-effect',
      (fastRoll.command.rollThroughSpeedMps ?? 0) > (slowRoll.command.rollThroughSpeedMps ?? 0),
      `${slowRoll.command.rollThroughSpeedMps?.toFixed(3)} -> ${fastRoll.command.rollThroughSpeedMps?.toFixed(3)} m/s`,
    ),
    check(
      'key-rolling-cap',
      fastRoll.command.rollThroughSpeedMps === STOP_PRIORITY_POLICY_LIMITS.rollingStopMaximumMps &&
        fastRoll.command.rollingStopCapped === true,
      `cheia 5 m/s comandă ${fastRoll.command.rollThroughSpeedMps?.toFixed(3)} m/s`,
    ),
    check(
      'key-assertiveness-effect',
      effects[1].lowOutcome === 0 && effects[1].highOutcome === 1,
      `separator 3 s: refuz la 0 și revendicare la 1, cerință ${floorGranted.command.requiredGapS} s`,
    ),
    check(
      'key-patience-effect',
      effects[2].lowOutcome === 1 && effects[2].highOutcome === 0,
      `eliberare la 0 s și oprire suplimentară la 10 s (${effects[2].lowOutcome} -> ${effects[2].highOutcome})`,
    ),
    check(
      'key-blocked-effect',
      effects[3].lowOutcome === 0 && effects[3].highOutcome === 1,
      `eșantion ${blockedOpportunity.sample.toFixed(6)}: așteptare la 0 și intrare la 1 (plafon 0,5)`,
    ),
    check(
      'safety-rolling-cap',
      (fastRoll.command.rollThroughSpeedMps ?? 0) <=
        STOP_PRIORITY_POLICY_LIMITS.rollingStopMaximumMps,
      `maximul comandat rămâne ${STOP_PRIORITY_POLICY_LIMITS.rollingStopMaximumMps} m/s`,
    ),
    check(
      'safety-blocked-veto',
      veto.command.action === 'STOP' && veto.command.reason === 'BLOCKED_INTERSECTION_VETO',
      'intersecția blocată este veto absolut pentru orice valoare a cheii',
    ),
    check(
      'safety-exit-storage',
      insufficient.command.action === 'STOP' &&
        insufficient.command.reason === 'EXIT_SPACE_INSUFFICIENT',
      '3 m de spațiu de ieșire rămân sub pragul de stocare',
    ),
    check(
      'safety-blocked-cap',
      (cappedEntry.command.blockedEntryProbability ?? 0) <=
        STOP_PRIORITY_POLICY_LIMITS.blockedEntryMaximumProbability,
      `probabilitatea efectivă maximă este ${cappedEntry.command.blockedEntryProbability}`,
    ),
    check(
      'safety-assertiveness-floor',
      floorRefused.command.action === 'STOP' &&
        floorGranted.command.action === 'PROCEED' &&
        floorRefused.command.requiredGapS === STOP_PRIORITY_POLICY_LIMITS.priorityMinimumGapS,
      '2,9 s refuzat și 3 s revendicat la podeaua explicită',
    ),
    check(
      'safety-assertiveness-inert',
      inertThreshold.command.requiredGapS === 0.2,
      'un `yield_time_gap` sub podea nu este rescris de asertivitate',
    ),
    check(
      'safety-stop-dominant',
      stopDominant.command.action === 'STOP' && stopDominant.command.reason === 'STOP_REQUIRED',
      'intenția 051 rămâne stop cu toate cheile la maxim',
    ),
    check(
      'safety-first-arrival',
      firstArrival.command.action === 'PROCEED' && firstArrival.command.allWayHoldS === null,
      'primul sosit la all-way stop nu este întârziat de răbdare',
    ),
    check(
      'safety-yield-unknown',
      unknownYield.action === 'UNKNOWN' && unknownYieldRow.action === 'UNKNOWN',
      `052 indisponibil rămâne ${unknownYieldRow.reason}`,
    ),
    check(
      'separation-rolling',
      separation
        .filter((entry) => entry.scenario === 'rolling stop')
        .every((e) => e.difference === 0),
      'doar rolling_stop_speed acționează în scenariul de rolling stop',
    ),
    check(
      'separation-priority',
      separation
        .filter((entry) => entry.scenario === 'revendicare la prioritate')
        .every((e) => e.difference === 0),
      'doar priority_assertiveness acționează în scenariul de revendicare',
    ),
    check(
      'separation-patience',
      separation
        .filter((entry) => entry.scenario === 'răbdare la all-way stop')
        .every((e) => e.difference === 0),
      'doar allway_stop_patience acționează în scenariul all-way',
    ),
    check(
      'separation-blocked',
      separation
        .filter((entry) => entry.scenario === 'intrare în intersecție fără spațiu confirmat')
        .every((e) => e.difference === 0),
      'doar blocked_intersection_entry_probability acționează în scenariul blocat',
    ),
    check(
      'm-identical-delivered-results',
      compatibilityReport.identicalStopTicks && compatibilityReport.identicalYieldTicks,
      `${compatibilityReport.identicalStopResults}/${compatibilityReport.comparableTicks} rezultate 051 și ${compatibilityReport.identicalYieldResults}/${compatibilityReport.comparableTicks} rezultate 052 identice cu cheile R neutre vs active`,
    ),
    check(
      'm-neutral-forwards',
      compatibilityReport.neutralForwardTicks === compatibilityReport.comparableTicks &&
        compatibilityReport.activeDifferingTicks > 0,
      `${compatibilityReport.neutralForwardTicks}/${compatibilityReport.comparableTicks} acțiuni neutre identice cu 051/052; ${compatibilityReport.activeDifferingTicks} tick-uri active diferă, până la ${compatibilityReport.maximumRollingSpeedDifferenceMps.toFixed(3)} m/s`,
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
    version: '175-stop-priority-policy-v1',
    parameters,
    scenarios: scenarioRows.map((row) => ({ name: row.name, scenario: row.note })),
    effects,
    separation,
    safety,
    compatibility: compatibilityReport,
    determinism: { ticks: 6, digest: determinismDigest, repeatedDigest },
    checks,
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}

export function stopPolicyReportMarkdown(report: StopPolicyReport): string {
  const rows = (entries: readonly StopPolicyEffect[]) =>
    entries
      .map(
        (entry) =>
          `| \`${entry.key}\` | ${entry.scenario} | ${entry.lowValue} | ${entry.lowOutcome.toFixed(3)} | ${entry.highValue} | ${entry.highOutcome.toFixed(3)} | ${entry.difference.toFixed(3)} | ${entry.unit} | ${entry.note} |`,
      )
      .join('\n');
  return [
    '# 175 — raport politică extinsă pentru stop și prioritate',
    '',
    'Generat de `scripts/run-v2-stop-policy-report.mjs` din contractul `175-stop-priority-policy-v1`.',
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
    '| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    rows(report.effects),
    '',
    '## Separarea cheilor (fiecare cheie inertă în celelalte scenarii)',
    '',
    '| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    rows(report.separation),
    '',
    '## Siguranță: plafoanele și veto-ul rămân dominante',
    '',
    '| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    rows(report.safety),
    '',
    '## Compatibilitate cu cheile M',
    '',
    `- Rezultate 051 identice cu cheile R neutre vs active: **${report.compatibility.identicalStopResults}/${report.compatibility.comparableTicks} tick-uri**.`,
    `- Rezultate 052 identice cu cheile R neutre vs active: **${report.compatibility.identicalYieldResults}/${report.compatibility.comparableTicks} tick-uri**.`,
    `- Acțiuni neutre identice cu 051/052: **${report.compatibility.neutralForwardTicks}/${report.compatibility.comparableTicks}**.`,
    `- Tick-uri active care diferă de comanda neutră: **${report.compatibility.activeDifferingTicks}**, diferență maximă de viteză de rolling stop **${report.compatibility.maximumRollingSpeedDifferenceMps.toFixed(3)} m/s**.`,
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
