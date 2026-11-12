import { getParameterDefinition } from '../../src/profiles';
import {
  LATERAL_POLICY_V2_KEYS,
  LATERAL_POLICY_V2_LIMITS,
  LATERAL_POLICY_V2_M_KEYS,
} from '../../src/autonomy/lateral-policy-v2';
import type {
  LateralPolicyV2Command,
  LateralPolicyV2Key,
} from '../../src/autonomy/lateral-policy-v2';
import {
  baseSteeringRad,
  evaluate,
  firstMovement,
  neutralLateralPolicyValues,
  projectionAt,
  run,
  scenario,
  turnState,
} from './lateral-policy-v2-reference';
import type { LateralPolicyScene } from './lateral-policy-v2-reference';

export interface LateralPolicyCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface LateralPolicyEffect {
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
export interface LateralPolicyCompatibility {
  readonly comparableTicks: number;
  readonly identicalProjectionTicks: number;
  readonly neutralBaseTicks: number;
  readonly activeDifferingTicks: number;
  readonly maximumSteeringDifference: number;
  readonly curveAccelCeilings: readonly { readonly key: number; readonly ceiling: number }[];
  readonly exitCaps: readonly { readonly key: number; readonly cap: number }[];
  readonly mUnits: Readonly<Record<string, string>>;
  readonly rUnits: Readonly<Record<string, string>>;
}
export interface LateralPolicyReport {
  readonly version: '179-lateral-policy-v2';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly scenarios: readonly { readonly name: string; readonly scenario: string }[];
  readonly effects: readonly LateralPolicyEffect[];
  readonly separation: readonly LateralPolicyEffect[];
  readonly safety: readonly LateralPolicyEffect[];
  readonly compatibility: LateralPolicyCompatibility;
  readonly determinism: {
    readonly ticks: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly LateralPolicyCheck[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
}

const turnScene: LateralPolicyScene = {
    name: 'viraj',
    geometry: 'turn',
    laneWidthM: 4,
    lateralDeviationM: 0,
    speedMps: 6,
    obstacle: null,
  },
  straightScene: LateralPolicyScene = { ...turnScene, name: 'drept', geometry: 'straight' },
  deviationScene: LateralPolicyScene = { ...turnScene, name: 'abatere', lateralDeviationM: 0.3 },
  obstacleScene: LateralPolicyScene = {
    ...turnScene,
    name: 'obstacol',
    obstacle: { side: 'RIGHT', lateralOffsetM: 4, widthM: 1 },
  },
  exitState = turnState(turnScene),
  activeValues = {
    lane_center_offset: 0.6,
    steering_response_time: 1.5,
    steering_rate_limit: 0.1,
    turn_entry_speed: 1,
    turn_exit_acceleration: 0.2,
    corner_cutting_bias: 1,
    lateral_clearance: 3,
    lateral_correction_deadband: 0,
  } as const,
  ranges: Readonly<Record<LateralPolicyV2Key, readonly [number, number]>> = {
    lane_center_offset: [-1, 1],
    steering_response_time: [0.05, 1.5],
    steering_rate_limit: [0.1, 4],
    turn_entry_speed: [1, 18],
    turn_exit_acceleration: [0.2, 6],
    corner_cutting_bias: [0, 1],
    lateral_clearance: [0.1, 3],
    lateral_correction_deadband: [0, 0.6],
  };

interface ScenarioRow {
  readonly name: string;
  readonly description: string;
  /** Scene and caller state the row measures; every other key is held at its fixed value. */
  readonly scene: LateralPolicyScene;
  readonly state?: ReturnType<typeof turnState>;
  readonly fixed: Readonly<Record<string, number>>;
  readonly key: LateralPolicyV2Key;
  readonly unit: string;
  readonly note: string;
  readonly measure: (
    rValues: Readonly<Record<string, number>>,
    state: ReturnType<typeof turnState> | undefined,
    scene: LateralPolicyScene,
  ) => number;
}
const scenarioRows: readonly ScenarioRow[] = [
  {
    name: 'deplasare față de centrul benzii',
    description:
      'bandă autorată de 4 m pe un drum drept, fără abatere laterală: deplasarea țintă față de ' +
      'centrul benzii, în metri',
    scene: straightScene,
    fixed: { ...neutralLateralPolicyValues, lane_center_offset: 0 },
    key: 'lane_center_offset',
    unit: 'm',
    measure: (rValues, _state, scene) => evaluate(scene, { rValues }).command.laneOffsetTargetM,
    note:
      'coridorul 049 este `4/2 − 1,8/2 − 0,2 = 0,9 m`, deci și −1 m și +1 m sunt plafonate la ' +
      '±0,9 m: roțile nu părăsesc banda autorată',
  },
  {
    name: 'răspunsul comenzii de direcție',
    description:
      'viraj autorat de 15,7 m, cu 049 cerând −0,170 rad la roată și starea pornind de la 0: ' +
      'numărul de tick-uri până la prima mișcare a direcției',
    scene: turnScene,
    fixed: { ...neutralLateralPolicyValues, steering_response_time: 0.05 },
    key: 'steering_response_time',
    unit: 'ticks',
    measure: (rValues) => firstMovement(turnScene, { rValues }).delayTicks,
    note:
      'intervalul mort este `max(1, ceil(cheie · 60))`: 0,05 s ține comanda 3 tick-uri, 1,5 s o ' +
      'ține 90 de tick-uri, iar limita de rată nu schimbă momentul primei mișcări',
  },
  {
    name: 'limita de viteză a comenzii de direcție',
    description:
      'același viraj, cu răspunsul la minim: pasul de unghi la roată aplicat la prima mișcare, ' +
      'în radiani pe tick',
    scene: turnScene,
    fixed: { ...neutralLateralPolicyValues, steering_rate_limit: 0.1 },
    key: 'steering_rate_limit',
    unit: 'rad',
    measure: (rValues) => firstMovement(turnScene, { rValues }).stepRad,
    note:
      'pasul este `min(cheie, 1,5 rad/s) / 60`: 0,1 rad/s dă 0,001667 rad/tick, iar 4 rad/s este ' +
      'plafonat la 1,5 rad/s, adică 0,025 rad/tick',
  },
  {
    name: 'viteza de intrare în viraj',
    description:
      'viraj autorat de 15,7 m cu `curve_lateral_accel` 2,5 m/s²: viteza de intrare comandată, ' +
      'în m/s',
    scene: turnScene,
    fixed: { ...neutralLateralPolicyValues, turn_entry_speed: 1 },
    key: 'turn_entry_speed',
    unit: 'm/s',
    measure: (rValues, _state, scene) =>
      evaluate(scene, { rValues }).command.turnSpeedLimitMps ?? 0,
    note:
      'plafonul de aderență este `min(sqrt(2,5 · 15,719), avizul 049)` = 6,269 m/s: cheia de 18 m/s ' +
      'nu poate intra în viraj peste limita fizică',
  },
  {
    name: 'accelerația la ieșirea din viraj',
    description:
      'ieșirea din viraj pe drumul drept, cu latch-ul de viraj purtat din tick-ul anterior: ' +
      'accelerația preferată la ieșire, în m/s²',
    scene: straightScene,
    state: exitState,
    fixed: { ...neutralLateralPolicyValues, turn_exit_acceleration: 0.2 },
    key: 'turn_exit_acceleration',
    unit: 'm/s²',
    measure: (rValues, state, scene) =>
      evaluate(scene, { rValues, state }).command.exitAccelerationMps2,
    note:
      'accelerația este plafonată de cheia M `desired_acceleration` (1,5 m/s²): cheia de 6 m/s² ' +
      'nu cere niciodată mai mult decât stilul deja livrat de 047',
  },
  {
    name: 'tăierea virajului',
    description:
      'viraj autorat de 15,7 m: deplasarea spre interiorul curbei, în metri (magnitudine)',
    scene: turnScene,
    fixed: { ...neutralLateralPolicyValues, corner_cutting_bias: 0 },
    key: 'corner_cutting_bias',
    unit: 'm',
    measure: (rValues, _state, scene) => Math.abs(evaluate(scene, { rValues }).command.cornerCutM),
    note:
      'tăierea este `cheie · coridor` (0,9 m) spre interiorul curbei, în același coridor ca ' +
      'deplasarea de bandă; virajul autorat este la stânga, deci deplasarea este negativă',
  },
  {
    name: 'spațiul lateral liber',
    description:
      'obstacol declarat la 4 m de centrul benzii, lat de 1 m, deci 2,6 m liberi între caroserie ' +
      'și obstacol: dacă manevra laterală este permisă',
    scene: obstacleScene,
    fixed: { ...neutralLateralPolicyValues, lateral_clearance: 0.1 },
    key: 'lateral_clearance',
    unit: 'ratio',
    measure: (rValues, _state, scene) =>
      evaluate(scene, { rValues }).command.manoeuvrePermitted ? 1 : 0,
    note:
      'spațiul efectiv este `max(cheie, 1,8 + 0,2)` = 2,0 m la minimum și 3,0 m la maximum; ' +
      '2,6 m liberi permit trecerea la 2,0 m și o interzic la 3,0 m',
  },
  {
    name: 'banda moartă a corecției',
    description:
      'viraj autorat cu abatere laterală de 0,3 m: dacă corecția de cross-track este activă',
    scene: deviationScene,
    fixed: { ...neutralLateralPolicyValues, lateral_correction_deadband: 0 },
    key: 'lateral_correction_deadband',
    unit: 'ratio',
    measure: (rValues, _state, scene) =>
      evaluate(scene, { rValues }).command.correctionActive ? 1 : 0,
    note:
      'abaterea de 0,3 m este sub banda de 0,6 m, deci corecția se oprește; peste bandă rămâne ' +
      'numai urmărirea de geometrie a lui 049',
  },
];

function effectRow(row: ScenarioRow, lowValue: number, highValue: number): LateralPolicyEffect {
  const lowOutcome = row.measure({ ...row.fixed, [row.key]: lowValue }, row.state, row.scene),
    highOutcome = row.measure({ ...row.fixed, [row.key]: highValue }, row.state, row.scene);
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
  key: LateralPolicyV2Key,
  lowValue: number,
  highValue: number,
): LateralPolicyEffect {
  const lowOutcome = row.measure({ ...row.fixed, [key]: lowValue }, row.state, row.scene),
    highOutcome = row.measure({ ...row.fixed, [key]: highValue }, row.state, row.scene);
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
/** The genuine 049 projections and the two profiles over 60 ticks, alternating scenes. */
function compatibility(): LateralPolicyCompatibility {
  const scenes: readonly LateralPolicyScene[] = [
      turnScene,
      straightScene,
      deviationScene,
      obstacleScene,
      { ...turnScene, lateralDeviationM: -0.3 },
      { ...turnScene, obstacle: { side: 'LEFT', lateralOffsetM: -4, widthM: 1 } },
    ],
    neutral: LateralPolicyV2Command[] = [],
    active: LateralPolicyV2Command[] = [],
    neutralProjections: string[] = [],
    activeProjections: string[] = [];
  let neutralState = undefined as ReturnType<typeof run>['state'] | undefined,
    activeState = undefined as ReturnType<typeof run>['state'] | undefined;
  for (let index = 0; index < 60; index++) {
    const scene = scenes[index % scenes.length],
      tick = scenario.tick + index,
      neutralRow = run(scene, {
        ticks: 1,
        tick,
        state: neutralState,
        rValues: neutralLateralPolicyValues,
      }),
      activeRow = run(scene, { ticks: 1, tick, state: activeState, rValues: activeValues });
    neutralState = neutralRow.state;
    activeState = activeRow.state;
    neutral.push(neutralRow.commands[0]);
    active.push(activeRow.commands[0]);
    neutralProjections.push(JSON.stringify(projectionAt(scene, tick)));
    activeProjections.push(JSON.stringify(projectionAt(scene, tick)));
  }
  let comparableTicks = 0,
    identicalProjectionTicks = 0,
    activeDifferingTicks = 0,
    maximumSteeringDifference = 0;
  for (let index = 0; index < 60; index++) {
    comparableTicks += 1;
    if (neutralProjections[index] === activeProjections[index]) identicalProjectionTicks += 1;
    const difference = Math.abs(active[index].steeringRad - neutral[index].steeringRad);
    maximumSteeringDifference = Math.max(maximumSteeringDifference, difference);
    if (
      difference > 0 ||
      active[index].desiredOffsetM !== neutral[index].desiredOffsetM ||
      active[index].turnSpeedLimitMps !== neutral[index].turnSpeedLimitMps ||
      active[index].manoeuvrePermitted !== neutral[index].manoeuvrePermitted
    )
      activeDifferingTicks += 1;
  }
  const neutralBaseTicks = run(straightScene, {
      ticks: 60,
      rValues: neutralLateralPolicyValues,
    }).commands.filter((command) => command.steeringRad === command.baseSteeringRad).length,
    unitsOf = (values: readonly string[]) =>
      Object.fromEntries(values.map((key) => [key, getParameterDefinition(key).unit]));
  return {
    comparableTicks,
    identicalProjectionTicks,
    neutralBaseTicks,
    activeDifferingTicks,
    maximumSteeringDifference,
    curveAccelCeilings: [2.5, 8].map((key) => ({
      key,
      ceiling:
        evaluate(turnScene, {
          rValues: { turn_entry_speed: 18 },
          mValues: { curve_lateral_accel: key },
        }).command.turnSpeedLimitMps ?? 0,
    })),
    exitCaps: [1.5, 4].map((key) => ({
      key,
      cap: evaluate(straightScene, {
        state: exitState,
        rValues: { turn_exit_acceleration: 6 },
        mValues: { desired_acceleration: key },
      }).command.exitAccelerationMps2,
    })),
    mUnits: unitsOf(LATERAL_POLICY_V2_M_KEYS),
    rUnits: unitsOf(LATERAL_POLICY_V2_KEYS),
  };
}
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): LateralPolicyCheck {
  return { id, pass, detail };
}
const admit = (key: LateralPolicyV2Key, value: number): number => {
  try {
    evaluate(straightScene, { rValues: { [key]: value } });
    return 1;
  } catch {
    return 0;
  }
};
const round = (value: number, digits = 3): number =>
  Math.round(value * 10 ** digits) / 10 ** digits;
const close = (left: number, right: number): boolean => Math.abs(left - right) < 1e-9;

export function runLateralPolicyReport(): LateralPolicyReport {
  const parameters = LATERAL_POLICY_V2_KEYS.map((key) => {
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
    separation: LateralPolicyEffect[] = [];
  for (const row of scenarioRows)
    for (const key of LATERAL_POLICY_V2_KEYS) {
      if (key === row.key) continue;
      const [low, high] = ranges[key];
      separation.push(separationRow(row, key, low, high));
    }
  const offsetClamp = evaluate(straightScene, { rValues: { lane_center_offset: 1 } }).command,
    compactClamp = evaluate(straightScene, {
      rValues: { lane_center_offset: 1 },
      classId: 'compact',
    }).command,
    rateCap = firstMovement(turnScene, {
      rValues: { steering_response_time: 0.05, steering_rate_limit: 4 },
    }),
    clearanceFloor = evaluate(obstacleScene, { rValues: { lateral_clearance: 0.1 } }).command,
    compactFloor = evaluate(obstacleScene, {
      rValues: { lateral_clearance: 0.1 },
      classId: 'compact',
    }).command,
    tightClearance = evaluate(
      {
        ...turnScene,
        obstacle: { side: 'RIGHT', lateralOffsetM: 3, widthM: 1.2 },
      },
      { rValues: { lateral_clearance: 0.1 } },
    ).command,
    ceilingGrid = Array.from({ length: 18 }, (_, index) => index + 1).map(
      (key) =>
        evaluate(turnScene, { rValues: { turn_entry_speed: key } }).command.turnSpeedLimitMps ??
        Infinity,
    ),
    maximumGridLimit = Math.max(...ceilingGrid),
    unusable = evaluate(
      { ...turnScene, discontinuity: true },
      {
        rValues: {
          lane_center_offset: 1,
          steering_response_time: 1.5,
          steering_rate_limit: 4,
          turn_entry_speed: 18,
          turn_exit_acceleration: 6,
          corner_cutting_bias: 1,
          lateral_clearance: 3,
          lateral_correction_deadband: 0,
        },
      },
    ).command,
    staleProjection = evaluate(turnScene, {
      tick: scenario.tick + 2,
      lateral: projectionAt(turnScene, scenario.tick),
    }).command,
    foreignActor = evaluate(turnScene, {
      lateral: {
        ...projectionAt(turnScene, scenario.tick),
        actor: { id: 'other', incarnation: 1 },
      },
    }).command,
    deadbandTracking = run(deviationScene, {
      ticks: 12,
      rValues: { ...neutralLateralPolicyValues, lateral_correction_deadband: 0.6 },
    }).commands.at(-1),
    deadbandCorrection = run(deviationScene, {
      ticks: 12,
      rValues: { ...neutralLateralPolicyValues, lateral_correction_deadband: 0 },
    }).commands.at(-1),
    slowRateStep = firstMovement(turnScene, {
      rValues: { steering_response_time: 0.05, steering_rate_limit: 0.1 },
    }),
    floorLow = evaluate(obstacleScene, { rValues: { lateral_clearance: 0.1 } }).command,
    floorHigh = evaluate(obstacleScene, { rValues: { lateral_clearance: 3 } }).command,
    safety: LateralPolicyEffect[] = [
      {
        key: 'plafonul deplasării de bandă',
        scenario: 'banda de 4 m, cheia +1 m, sedan (coridor 0,9 m)',
        keyUnit: 'm',
        unit: 'm',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: offsetClamp.laneOffsetTargetM,
        difference: offsetClamp.laneOffsetTargetM,
        note: `deplasarea este plafonată la coridorul 049 de ${offsetClamp.laneCorridorM.toFixed(6)} m; pe clasa compact coridorul este ${compactClamp.laneCorridorM.toFixed(6)} m, deci cheia de 1 m încape fără plafonare`,
      },
      {
        key: 'plafonul de rată al direcției',
        scenario: 'cheia 0,1 rad/s și cheia 4 rad/s, răspuns la minim: pasul aplicat',
        keyUnit: 'rad/s',
        unit: 'rad',
        lowValue: 0.1,
        highValue: 4,
        lowOutcome: slowRateStep.stepRad,
        highOutcome: rateCap.stepRad,
        difference: rateCap.stepRad - slowRateStep.stepRad,
        note: `rata efectivă la cheia 4 rad/s este ${LATERAL_POLICY_V2_LIMITS.maximumSteeringRateRadPerS} rad/s, deci pasul rămâne ${rateCap.stepRad.toFixed(6)} rad/tick, nu ${(4 / 60).toFixed(6)}; comanda nu devine un salt`,
      },
      {
        key: 'minimul de spațiu lateral (sedan)',
        scenario: 'cheia minimă 0,1 m și maximă 3 m, clasa sedan: spațiul efectiv',
        keyUnit: 'm',
        unit: 'm',
        lowValue: 0.1,
        highValue: 3,
        lowOutcome: floorLow.effectiveClearanceM,
        highOutcome: floorHigh.effectiveClearanceM,
        difference: floorHigh.effectiveClearanceM - floorLow.effectiveClearanceM,
        note: `minimul este lățimea de cale plus marjă (1,8 + 0,2 = 2,0 m): cheia de 0,1 m nu poate coborî sub el, iar 3 m urcă peste`,
      },
      {
        key: 'minimul de spațiu lateral (compact)',
        scenario: 'cheia minimă 0,1 m, clasa compact: spațiul efectiv',
        keyUnit: 'm',
        unit: 'm',
        lowValue: 0.1,
        highValue: 0.1,
        lowOutcome: compactFloor.effectiveClearanceM,
        highOutcome: compactFloor.effectiveClearanceM,
        difference: 0,
        note: `pentru compact minimul este 1,6 + 0,2 = 1,8 m, derivat din geometria clasei și nu dintr-o constantă globală`,
      },
      {
        key: 'vetoul de spațiu lateral',
        scenario: '1,5 m liberi între caroserie și obstacol, cheia minimă 0,1 m',
        keyUnit: 'm',
        unit: 'ratio',
        lowValue: 0.1,
        highValue: 3,
        lowOutcome: tightClearance.manoeuvrePermitted ? 1 : 0,
        highOutcome: tightClearance.manoeuvrePermitted ? 1 : 0,
        difference: 0,
        note: `${tightClearance.reason}: ${tightClearance.availableClearanceM?.toFixed(3)} m liberi sub minimul efectiv ${tightClearance.effectiveClearanceM.toFixed(3)} m, deci nici cheia minimă nu permite trecerea`,
      },
      {
        key: 'plafonul de aderență la intrarea în viraj',
        scenario: 'grilă de 18 valori ale cheii pe virajul de 15,7 m',
        keyUnit: 'm/s',
        unit: 'm/s',
        lowValue: 1,
        highValue: 18,
        lowOutcome: Math.min(...ceilingGrid),
        highOutcome: maximumGridLimit,
        difference: maximumGridLimit - Math.min(...ceilingGrid),
        note: `niciuna din cele 18 valori nu depășește plafonul de aderență ${maximumGridLimit.toFixed(6)} m/s, sub cheia maximă de 18 m/s`,
      },
      {
        key: 'proiecția 049 inutilizabilă',
        scenario: 'observație discontinuă, toate cheile la maxim',
        keyUnit: 'ratio',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: unusable.action === 'UNAVAILABLE' ? 1 : 0,
        difference: unusable.action === 'UNAVAILABLE' ? 1 : 0,
        note: `${unusable.reason} (${unusable.projectionReason}); direcția rămâne ${unusable.steeringRad.toFixed(6)} rad și nicio cheie nu inventează o comandă`,
      },
      {
        key: 'proiecție veche refuzată',
        scenario: 'proiecția 049 din alt tick, cheile neutre',
        keyUnit: 'ratio',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: staleProjection.action === 'UNAVAILABLE' ? 1 : 0,
        difference: staleProjection.action === 'UNAVAILABLE' ? 1 : 0,
        note: `${staleProjection.reason}; un rezultat 049 care nu aparține tick-ului nu este acceptat`,
      },
      {
        key: 'proiecție străină refuzată',
        scenario: 'proiecția 049 a altui actor, cheile neutre',
        keyUnit: 'ratio',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: foreignActor.action === 'UNAVAILABLE' ? 1 : 0,
        difference: foreignActor.action === 'UNAVAILABLE' ? 1 : 0,
        note: `${foreignActor.reason}; actorul proiecției trebuie să fie subiectul deciziei`,
      },
      {
        key: 'banda moartă nu oprește urmărirea',
        scenario: 'abatere 0,3 m, banda moartă 0 și 0,6 m, 12 tick-uri',
        keyUnit: 'm',
        unit: 'rad',
        lowValue: 0,
        highValue: 0.6,
        lowOutcome: deadbandCorrection?.steeringRad ?? 0,
        highOutcome: deadbandTracking?.steeringRad ?? 0,
        difference: (deadbandTracking?.steeringRad ?? 0) - (deadbandCorrection?.steeringRad ?? 0),
        note: `cu banda 0,6 m corecția este ${deadbandTracking?.correctionActive} și direcția urmărește exact geometria 049 (${(deadbandTracking?.steeringRad ?? 0).toFixed(6)} rad); cu banda 0 corecția adaugă deviația și direcția ajunge la ${(deadbandCorrection?.steeringRad ?? 0).toFixed(6)} rad`,
      },
      {
        key: 'valorile din afara catalogului',
        scenario: 'cheia `lane_center_offset` la 2 m și la 1 m',
        keyUnit: 'm',
        unit: 'ratio',
        lowValue: 2,
        highValue: 1,
        lowOutcome: admit('lane_center_offset', 2),
        highOutcome: admit('lane_center_offset', 1),
        difference: admit('lane_center_offset', 1) - admit('lane_center_offset', 2),
        note: '2 m este refuzat de catalog înainte de orice efect; 1 m este admis și plafonat la coridor',
      },
    ],
    compatibilityReport = compatibility(),
    series = () => {
      const seriesScenes: readonly LateralPolicyScene[] = [
          turnScene,
          straightScene,
          deviationScene,
          obstacleScene,
          { ...turnScene, lateralDeviationM: -0.3 },
          { ...turnScene, obstacle: { side: 'LEFT', lateralOffsetM: -4, widthM: 1 } },
          { ...straightScene, lateralDeviationM: 0.6 },
          turnScene,
        ],
        values = {
          lane_center_offset: 0.4,
          steering_response_time: 0.5,
          steering_rate_limit: 0.6,
          turn_entry_speed: 4,
          turn_exit_acceleration: 1,
          corner_cutting_bias: 0.5,
          lateral_clearance: 1.2,
          lateral_correction_deadband: 0.05,
        };
      let state = undefined as ReturnType<typeof run>['state'] | undefined;
      return seriesScenes.map((scene, index) => {
        const row = run(scene, {
          ticks: 1,
          tick: scenario.tick + index,
          state,
          rValues: values,
        });
        state = row.state;
        return row.commands[0];
      });
    },
    fingerprint = () =>
      JSON.stringify(
        series().map((command) => [
          command.reason,
          command.action,
          command.laneOffsetTargetM,
          command.cornerCutM,
          command.desiredOffsetM,
          command.deviationErrorM,
          command.correctionActive,
          command.rawSteeringRad,
          command.steeringRad,
          command.steeringStepRad,
          command.holdTicksRemaining,
          command.turnSpeedLimitMps,
          command.exitAccelerationMps2,
          command.effectiveClearanceM,
          command.manoeuvrePermitted,
          command.state,
        ]),
      ),
    determinismDigest = digest(fingerprint()),
    repeatedDigest = digest(fingerprint()),
    checks: LateralPolicyCheck[] = [
      check(
        'key-lane-center-offset',
        close(effects[0].lowOutcome, -0.9) && close(effects[0].highOutcome, 0.9),
        `deplasare țintă ${effects[0].lowOutcome.toFixed(3)} -> ${effects[0].highOutcome.toFixed(3)} m`,
      ),
      check(
        'key-steering-response-time',
        effects[1].lowOutcome === 3 && effects[1].highOutcome === 90,
        `prima mișcare după ${effects[1].lowOutcome} -> ${effects[1].highOutcome} tick-uri`,
      ),
      check(
        'key-steering-rate-limit',
        effects[2].lowOutcome < effects[2].highOutcome &&
          round(effects[2].highOutcome, 6) === round(1.5 / 60, 6),
        `pas ${effects[2].lowOutcome.toFixed(6)} -> ${effects[2].highOutcome.toFixed(6)} rad/tick`,
      ),
      check(
        'key-turn-entry-speed',
        effects[3].lowOutcome === 1 &&
          effects[3].highOutcome < 18 &&
          Math.abs(effects[3].highOutcome - 6.268769) < 0.001,
        `viteză ${effects[3].lowOutcome.toFixed(3)} -> ${effects[3].highOutcome.toFixed(3)} m/s`,
      ),
      check(
        'key-turn-exit-acceleration',
        effects[4].lowOutcome === 0.2 && effects[4].highOutcome === 1.5,
        `accelerație ${effects[4].lowOutcome.toFixed(3)} -> ${effects[4].highOutcome.toFixed(3)} m/s²`,
      ),
      check(
        'key-corner-cutting-bias',
        effects[5].lowOutcome === 0 && close(effects[5].highOutcome, 0.9),
        `tăiere ${effects[5].lowOutcome.toFixed(3)} -> ${effects[5].highOutcome.toFixed(3)} m`,
      ),
      check(
        'key-lateral-clearance',
        effects[6].lowOutcome === 1 && effects[6].highOutcome === 0,
        `manevră permisă ${effects[6].lowOutcome} -> ${effects[6].highOutcome}`,
      ),
      check(
        'key-lateral-correction-deadband',
        effects[7].lowOutcome === 1 && effects[7].highOutcome === 0,
        `corecție activă ${effects[7].lowOutcome} -> ${effects[7].highOutcome}`,
      ),
      check(
        'safety-offset-corridor',
        close(offsetClamp.laneOffsetTargetM, 0.9) &&
          close(compactClamp.laneOffsetTargetM, 1) &&
          compactClamp.laneOffsetTargetM > offsetClamp.laneOffsetTargetM,
        `sedan ${offsetClamp.laneOffsetTargetM.toFixed(3)} m din 1 m; compact ${compactClamp.laneOffsetTargetM.toFixed(3)} m din 1 m`,
      ),
      check(
        'safety-steering-rate-ceiling',
        round(rateCap.stepRad, 6) === round(1.5 / 60, 6) && rateCap.stepRad < 4 / 60,
        `4 rad/s este plafonat: pas ${rateCap.stepRad.toFixed(6)} rad/tick, nu ${(4 / 60).toFixed(6)}`,
      ),
      check(
        'safety-clearance-floor',
        clearanceFloor.effectiveClearanceM === 2 &&
          compactFloor.effectiveClearanceM === 1.8 &&
          tightClearance.manoeuvrePermitted === false,
        `minim ${clearanceFloor.effectiveClearanceM} m sedan / ${compactFloor.effectiveClearanceM} m compact; 1,5 m liberi sunt refuzați`,
      ),
      check(
        'safety-adherence-ceiling',
        maximumGridLimit < 18 &&
          Math.abs(maximumGridLimit - 6.268769) < 0.001 &&
          compatibilityReport.curveAccelCeilings[1].ceiling > maximumGridLimit,
        `maxim pe grilă ${maximumGridLimit.toFixed(6)} m/s; cu ` +
          `curve_lateral_accel 8 m/s² plafonul urcă la ${compatibilityReport.curveAccelCeilings[1].ceiling.toFixed(6)} m/s, tot sub 18`,
      ),
      check(
        'safety-projection-dominant',
        unusable.action === 'UNAVAILABLE' &&
          unusable.reason === 'PROJECTION_UNUSABLE' &&
          unusable.steeringRad === 0 &&
          staleProjection.reason === 'FOREIGN_OR_STALE_PROJECTION' &&
          foreignActor.reason === 'FOREIGN_OR_STALE_PROJECTION',
        `proiecția inutilizabilă, veche sau străină este refuzată înaintea oricărei chei`,
      ),
      check(
        'safety-deadband-keeps-tracking',
        deadbandTracking !== undefined &&
          deadbandTracking.correctionActive === false &&
          Math.abs(deadbandTracking.steeringRad - baseSteeringRad(deviationScene)) < 1e-9,
        `corecția este oprită, dar direcția atinge ${(deadbandTracking?.steeringRad ?? 0).toFixed(6)} rad, exact geometria 049`,
      ),
      check(
        'keys-separated',
        separation.length === 56 && separation.every((entry) => entry.difference === 0),
        `${separation.length} perechi de separare, toate cu diferența 0`,
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
        parameters.every((entry) => entry.unit === expectedUnits[entry.key]),
        parameters.map((entry) => `${entry.key} ${entry.unit}`).join(', '),
      ),
      check(
        'm-compatible',
        compatibilityReport.identicalProjectionTicks === compatibilityReport.comparableTicks &&
          compatibilityReport.neutralBaseTicks === 60 &&
          compatibilityReport.activeDifferingTicks > 0 &&
          Math.abs(compatibilityReport.exitCaps[0].cap - 1.5) < 1e-9 &&
          Math.abs(compatibilityReport.exitCaps[1].cap - 4) < 1e-9,
        `${compatibilityReport.identicalProjectionTicks}/${compatibilityReport.comparableTicks} proiecții 049 identice; ${compatibilityReport.neutralBaseTicks}/60 comenzi neutre reproduc direcția 049; ${compatibilityReport.activeDifferingTicks} tick-uri active diferă; plafonul de ieșire urmează cheia M 1,5 -> 4 m/s²`,
      ),
      check('determinism', determinismDigest === repeatedDigest, `digest ${determinismDigest}`),
    ];
  const passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '179-lateral-policy-v2',
    parameters,
    scenarios: scenarioRows.map((row) => ({ name: row.name, scenario: row.description })),
    effects,
    separation,
    safety,
    compatibility: compatibilityReport,
    determinism: { ticks: 8, digest: determinismDigest, repeatedDigest },
    checks,
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}

const expectedUnits: Readonly<Record<LateralPolicyV2Key, string>> = Object.freeze({
  lane_center_offset: 'm',
  steering_response_time: 's',
  steering_rate_limit: 'rad/s',
  turn_entry_speed: 'm/s',
  turn_exit_acceleration: 'm/s²',
  corner_cutting_bias: 'ratio',
  lateral_clearance: 'm',
  lateral_correction_deadband: 'm',
});

export function lateralPolicyReportMarkdown(report: LateralPolicyReport): string {
  const rows = (entries: readonly LateralPolicyEffect[]) =>
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
    '# 179 — raport politică extinsă pentru control lateral și viraje',
    '',
    'Generat de `scripts/run-v2-lateral-policy-report.mjs` din contractul `179-lateral-policy-v2`.',
    'Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei,',
    'peste proiecția reală `049-lateral-v1` a tick-ului.',
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
    '## Siguranță: coridor, rată, minim de spațiu, aderență și dominanța 049',
    '',
    ...header,
    rows(report.safety),
    '',
    '## Compatibilitate cu cheile M',
    '',
    `- Proiecții 049 identice cu cheile R neutre vs active: **${report.compatibility.identicalProjectionTicks}/${report.compatibility.comparableTicks} tick-uri**.`,
    `- Comenzi neutre care reproduc exact direcția 049 pe drumul drept: **${report.compatibility.neutralBaseTicks} tick-uri**.`,
    `- Tick-uri active care diferă de comanda neutră: **${report.compatibility.activeDifferingTicks}**, diferență maximă de unghi **${report.compatibility.maximumSteeringDifference.toFixed(6)} rad**.`,
    `- Plafonul de aderență urmează \`curve_lateral_accel\`: ${report.compatibility.curveAccelCeilings
      .map((entry) => `${entry.key} m/s² -> ${entry.ceiling.toFixed(6)} m/s`)
      .join(', ')}.`,
    `- Plafonul de ieșire urmează \`desired_acceleration\`: ${report.compatibility.exitCaps
      .map((entry) => `${entry.key} m/s² -> ${entry.cap.toFixed(6)} m/s²`)
      .join(', ')}.`,
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
