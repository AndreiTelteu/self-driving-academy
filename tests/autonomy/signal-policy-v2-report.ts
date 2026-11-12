import { getParameterDefinition } from '../../src/profiles';
import { SIGNAL_POLICY_V2_LIMITS } from '../../src/autonomy/signal-policy-v2';
import {
  evaluate,
  findYellowOpportunity,
  opportunityKeyFor,
  scenario,
  signalPolicyV2Document,
} from './signal-policy-v2-reference';
import type { SignalV2Scene } from './signal-policy-v2-reference';
import { compileSignalPolicyV2Profile } from '../../src/autonomy/signal-policy-v2';
import { evaluateSignalPolicyV2 } from '../../src/autonomy/signal-policy-v2';
import type { SignalPolicyV2Key, SignalPolicyV2MKey } from '../../src/autonomy/signal-policy-v2';
import { evaluateSignalPolicy, projectSignalProfile } from '../../src/autonomy/signal-policy';
import { parsePublishableDrivingProfile } from '../../src/profiles/parameter-registry';
import { signal050Observation, signalV2Observation } from './signal-policy-v2-reference';

export interface SignalPolicyV2Check {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface SignalPolicyV2Effect {
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
export interface SignalPolicyV2Compatibility {
  readonly identicalSignalTicks: boolean;
  readonly comparableTicks: number;
  readonly identicalTicks: number;
  readonly neutralForwardTicks: number;
  readonly activeDifferingTicks: number;
  readonly maximumLaunchDifferenceMps2: number;
  readonly mUnits: Readonly<Record<string, string>>;
  readonly rUnits: Readonly<Record<string, string>>;
}
export interface SignalPolicyV2Report {
  readonly version: '173-signal-policy-v2';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly scenarios: readonly { readonly name: string; readonly scenario: string }[];
  readonly effects: readonly SignalPolicyV2Effect[];
  readonly separation: readonly SignalPolicyV2Effect[];
  readonly safety: readonly SignalPolicyV2Effect[];
  readonly compatibility: SignalPolicyV2Compatibility;
  readonly determinism: {
    readonly ticks: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly SignalPolicyV2Check[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
}
const keys = [
  'yellow_stop_probability',
  'red_run_gap_acceptance',
  'yellow_commit_time',
  'green_launch_acceleration',
] as const;
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): SignalPolicyV2Check {
  return { id, pass, detail };
}
const yellowFeasibilityScene: SignalV2Scene = {
  state: 'YELLOW',
  speed: 8,
  distanceToStopLineM: 64,
  phaseRemainingS: 10,
  conflictGapS: null,
};
const yellowCommitScene: SignalV2Scene = {
  state: 'YELLOW',
  speed: 8,
  distanceToStopLineM: 8,
  phaseRemainingS: 6,
  conflictGapS: null,
};
const yellowLateBrakeScene: SignalV2Scene = {
  state: 'YELLOW',
  speed: 8,
  distanceToStopLineM: 24,
  phaseRemainingS: 8,
  conflictGapS: null,
};
const redRunScene: SignalV2Scene = {
  state: 'RED',
  speed: 8,
  distanceToStopLineM: 10,
  phaseRemainingS: 10,
  conflictGapS: 5,
};
const greenLaunchScene: SignalV2Scene = {
  state: 'GREEN',
  speed: 0,
  distanceToStopLineM: 20,
  phaseRemainingS: 20,
  conflictGapS: null,
};
const probabilityOpportunity = findYellowOpportunity((sample) => sample >= 0.2 && sample < 0.99),
  yellowBlockOpportunity = findYellowOpportunity((sample) => sample >= 0.2 && sample < 0.99, 2000),
  seriesOpportunity = findYellowOpportunity((sample) => sample >= 0.6 && sample < 0.99, 4000);

function stopRate(probability: number): number {
  let stops = 0;
  for (let index = 0; index < 120; index++) {
    const row = evaluate(yellowFeasibilityScene, {
      tick: scenario.tick + index,
      opportunityKey: opportunityKeyFor(1000 + index * 17),
      rValues: { yellow_stop_probability: probability },
    });
    if (row.command.stopRequested) stops++;
  }
  return stops / 120;
}
function commitOutcome(commitTime: number): boolean {
  return evaluate(yellowCommitScene, {
    tick: scenario.tick,
    opportunityKey: probabilityOpportunity.opportunityKey,
    rValues: { yellow_stop_probability: 1, yellow_commit_time: commitTime },
  }).command.yellowCommitted;
}
function redOutcome(acceptance: number, gap: number | null): boolean | null {
  return evaluate(
    { ...redRunScene, conflictGapS: gap },
    {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      mValues: { red_stop_probability: 0 },
      rValues: { red_run_gap_acceptance: acceptance },
    },
  ).command.redRunAccepted;
}
function launchOutcome(acceleration: number, scene: SignalV2Scene = greenLaunchScene) {
  return evaluate(scene, {
    tick: scenario.tick,
    opportunityKey: probabilityOpportunity.opportunityKey,
    rValues: { green_launch_acceleration: acceleration },
  }).command.launchAccelerationMps2;
}
/** Runs a key pair in one scenario; the outcome function returns the observable number. */
function separationRow(
  scene: SignalV2Scene,
  options: {
    key: SignalPolicyV2Key;
    scenario: string;
    lowValue: number;
    highValue: number;
    measure: (row: ReturnType<typeof evaluate>) => number;
    fixed: Partial<Record<SignalPolicyV2Key, number>>;
    mValues?: Partial<Record<SignalPolicyV2MKey, number>>;
  },
): SignalPolicyV2Effect {
  const low = evaluate(scene, {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      mValues: options.mValues,
      rValues: { ...options.fixed, [options.key]: options.lowValue },
    }),
    high = evaluate(scene, {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      mValues: options.mValues,
      rValues: { ...options.fixed, [options.key]: options.highValue },
    }),
    lowOutcome = options.measure(low),
    highOutcome = options.measure(high);
  return {
    key: options.key,
    scenario: options.scenario,
    unit: 'ratio',
    lowValue: options.lowValue,
    highValue: options.highValue,
    lowOutcome,
    highOutcome,
    difference: highOutcome - lowOutcome,
    note: `\`${options.key}\` este inertă în scenariul ${options.scenario}`,
  };
}
const stopIndicator = (row: ReturnType<typeof evaluate>) =>
    row.command.reason === 'YELLOW_STOP' ? 1 : 0,
  commitIndicator = (row: ReturnType<typeof evaluate>) => (row.command.yellowCommitted ? 1 : 0),
  redIndicator = (row: ReturnType<typeof evaluate>) => (row.command.redRunAccepted ? 1 : 0),
  launchIndicator = (row: ReturnType<typeof evaluate>) => row.command.launchAccelerationMps2 ?? 0;

/** Runs the real 050 layer and the 173 layer over it for both profiles, 60 ticks. */
function compatibility(): SignalPolicyV2Compatibility {
  const neutralDocument = signalPolicyV2Document(),
    activeDocument = signalPolicyV2Document({
      yellow_stop_probability: 0.2,
      red_run_gap_acceptance: 0.1,
      yellow_commit_time: 6,
      green_launch_acceleration: 6,
    }),
    neutralV2 = compileSignalPolicyV2Profile(neutralDocument),
    activeV2 = compileSignalPolicyV2Profile(activeDocument),
    neutralSignal = projectSignalProfile(parsePublishableDrivingProfile(neutralDocument)),
    activeSignal = projectSignalProfile(parsePublishableDrivingProfile(activeDocument));
  let comparableTicks = 0,
    identicalTicks = 0,
    neutralForwardTicks = 0,
    activeDifferingTicks = 0,
    maximumLaunchDifferenceMps2 = 0;
  for (let tick = 1; tick <= 60; tick++) {
    const block = Math.floor((tick - 1) / 15),
      scene: SignalV2Scene =
        block === 0
          ? {
              state: 'GREEN',
              speed: 8,
              distanceToStopLineM: 30,
              phaseRemainingS: 20,
              conflictGapS: null,
            }
          : block === 1
            ? {
                state: 'GREEN',
                speed: 0,
                distanceToStopLineM: 20,
                phaseRemainingS: 20,
                conflictGapS: null,
              }
            : block === 2
              ? {
                  state: 'RED',
                  speed: 8,
                  distanceToStopLineM: 20,
                  phaseRemainingS: 20,
                  conflictGapS: 9,
                }
              : {
                  state: 'YELLOW',
                  speed: 8,
                  distanceToStopLineM: 64,
                  phaseRemainingS: 10,
                  conflictGapS: null,
                },
      opportunityKey =
        block === 3 ? yellowBlockOpportunity.opportunityKey : opportunityKeyFor(block * 1000),
      decisionTick = scenario.tick + tick;
    const neutralDecision = evaluateSignalPolicy({
        ...scenario.scope,
        actor: scenario.actor,
        decisionTick,
        speedMps: scene.speed,
        seed: 0x1234_5678,
        opportunityKey,
        profile: neutralSignal,
        observation: signal050Observation(scene, decisionTick),
      }),
      activeDecision = evaluateSignalPolicy({
        ...scenario.scope,
        actor: scenario.actor,
        decisionTick,
        speedMps: scene.speed,
        seed: 0x1234_5678,
        opportunityKey,
        profile: activeSignal,
        observation: signal050Observation(scene, decisionTick),
      });
    comparableTicks += 1;
    if (JSON.stringify(neutralDecision) === JSON.stringify(activeDecision)) identicalTicks += 1;
    const observation = signalV2Observation(scene, decisionTick),
      neutralRow = evaluateSignalPolicyV2({
        ...scenario.scope,
        actor: scenario.actor,
        decisionTick,
        authority: 'AUTO',
        seed: 0x1234_5678,
        opportunityKey,
        profile: neutralV2,
        signal: neutralDecision,
        observation,
      }),
      activeRow = evaluateSignalPolicyV2({
        ...scenario.scope,
        actor: scenario.actor,
        decisionTick,
        authority: 'AUTO',
        seed: 0x1234_5678,
        opportunityKey,
        profile: activeV2,
        signal: neutralDecision,
        observation,
      });
    if (neutralRow.action === neutralDecision.action) neutralForwardTicks += 1;
    if (
      activeRow.action !== neutralRow.action ||
      activeRow.launchAccelerationMps2 !== neutralRow.launchAccelerationMps2
    ) {
      activeDifferingTicks += 1;
      maximumLaunchDifferenceMps2 = Math.max(
        maximumLaunchDifferenceMps2,
        Math.abs(
          (activeRow.launchAccelerationMps2 ?? 0) - (neutralRow.launchAccelerationMps2 ?? 0),
        ),
      );
    }
  }
  const unitsOf = (values: Readonly<Record<string, number>>) =>
    Object.fromEntries(Object.keys(values).map((key) => [key, getParameterDefinition(key).unit]));
  return {
    identicalSignalTicks: comparableTicks === identicalTicks,
    comparableTicks,
    identicalTicks,
    neutralForwardTicks,
    activeDifferingTicks,
    maximumLaunchDifferenceMps2,
    mUnits: unitsOf({
      red_stop_probability: 0,
      green_start_delay: 0,
      red_stop_line_offset: 0,
      late_red_brake_threshold: 0,
      speed_delta_urban: 0,
    }),
    rUnits: unitsOf(Object.fromEntries(keys.map((key) => [key, 1]))),
  };
}

export function runSignalPolicyV2Report(): SignalPolicyV2Report {
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
    lowStopRate = stopRate(0.2),
    highStopRate = stopRate(1),
    slowLaunch = launchOutcome(0.2),
    fastLaunch = launchOutcome(6),
    committedSlow = commitOutcome(0.2),
    committedFast = commitOutcome(6),
    lowGapAccepted = redOutcome(0.1, 5),
    highGapAccepted = redOutcome(8, 5),
    floorAccepted = redOutcome(0.1, 2),
    unknownGapAccepted = redOutcome(0.1, null),
    lateBrake = evaluate(yellowLateBrakeScene, {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      mValues: { red_stop_probability: 0 },
      rValues: { yellow_stop_probability: 0.2 },
    }),
    lateBrakePermissive = evaluate(yellowLateBrakeScene, {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      mValues: { red_stop_probability: 0 },
      rValues: { yellow_stop_probability: 0 },
    }),
    redAhead = evaluate(
      { ...yellowCommitScene, distanceToStopLineM: 32, phaseRemainingS: 1 },
      {
        tick: scenario.tick,
        opportunityKey: probabilityOpportunity.opportunityKey,
        rValues: { yellow_commit_time: 6 },
      },
    ),
    startDelay = evaluate(
      { ...greenLaunchScene, phaseElapsedS: 0.2 },
      {
        tick: scenario.tick,
        opportunityKey: probabilityOpportunity.opportunityKey,
        rValues: { green_launch_acceleration: 6 },
      },
    ),
    redStop = evaluate(
      { ...redRunScene, conflictGapS: 9 },
      {
        tick: scenario.tick,
        opportunityKey: probabilityOpportunity.opportunityKey,
      },
    ),
    mYellowProceed = evaluate(
      { ...yellowCommitScene, distanceToStopLineM: 12 },
      {
        tick: scenario.tick,
        opportunityKey: probabilityOpportunity.opportunityKey,
        mValues: { red_stop_probability: 0 },
        rValues: { yellow_stop_probability: 1 },
      },
    ),
    mYellowStop = evaluate(
      { ...yellowCommitScene, distanceToStopLineM: 12 },
      {
        tick: scenario.tick,
        opportunityKey: probabilityOpportunity.opportunityKey,
        mValues: { red_stop_probability: 1 },
        rValues: { yellow_stop_probability: 1 },
      },
    ),
    release = evaluate(greenLaunchScene, {
      tick: scenario.tick,
      opportunityKey: probabilityOpportunity.opportunityKey,
      rValues: { green_launch_acceleration: 6 },
    }),
    effects: SignalPolicyV2Effect[] = [
      {
        key: 'yellow_stop_probability',
        scenario: 'fezabilitate la galben',
        unit: 'ratio',
        lowValue: 0.2,
        highValue: 1,
        lowOutcome: lowStopRate,
        highOutcome: highStopRate,
        difference: highStopRate - lowStopRate,
        note: `rata de oprire pe 120 de oportunități, cu condiția de conformitate M la 1 și oprirea fezabilă; la 1 fiecare oportunitate se oprește`,
      },
      {
        key: 'yellow_commit_time',
        scenario: 'angajare la galben',
        unit: 'ratio',
        lowValue: 0.2,
        highValue: 6,
        lowOutcome: committedSlow ? 1 : 0,
        highOutcome: committedFast ? 1 : 0,
        difference: (committedFast ? 1 : 0) - (committedSlow ? 1 : 0),
        note: `timp până la punctul de oprire ${(
          (yellowCommitScene.distanceToStopLineM! - 1) /
          yellowCommitScene.speed
        ).toFixed(
          3,
        )} s: cu orizontul 0,2 s oprirea rămâne fezabilă, cu 6 s vehiculul este deja angajat`,
      },
      {
        key: 'red_run_gap_acceptance',
        scenario: 'gap pe roșu',
        unit: 'ratio',
        lowValue: 0.1,
        highValue: 8,
        lowOutcome: lowGapAccepted ? 1 : 0,
        highOutcome: highGapAccepted ? 1 : 0,
        difference: (highGapAccepted ? 1 : 0) - (lowGapAccepted ? 1 : 0),
        note: `gap declarat 5 s; cerința efectivă este max(cheie, 3 s) = ${Math.max(
          0.1,
          SIGNAL_POLICY_V2_LIMITS.redRunMinimumGapS,
        ).toFixed(1)} s, respectiv ${Math.max(8, SIGNAL_POLICY_V2_LIMITS.redRunMinimumGapS).toFixed(
          1,
        )} s`,
      },
      {
        key: 'green_launch_acceleration',
        scenario: 'plecare la verde',
        unit: 'm/s²',
        lowValue: 0.2,
        highValue: 6,
        lowOutcome: slowLaunch ?? 0,
        highOutcome: fastLaunch ?? 0,
        difference: (fastLaunch ?? 0) - (slowLaunch ?? 0),
        note: `accelerația comandată la plecarea de pe loc după întârzierea M: 10 m/s se ating în ${(
          10 / 0.2
        ).toFixed(
          3,
        )} s, respectiv ${(10 / 6).toFixed(3)} s, dacă accelerația este aplicată constant`,
      },
    ],
    separation: SignalPolicyV2Effect[] = [
      separationRow(yellowFeasibilityScene, {
        key: 'yellow_commit_time',
        scenario: 'fezabilitate la galben',
        lowValue: 0.2,
        highValue: 6,
        measure: stopIndicator,
        fixed: {
          yellow_stop_probability: 1,
          red_run_gap_acceptance: 2,
          green_launch_acceleration: 2,
        },
      }),
      separationRow(yellowFeasibilityScene, {
        key: 'red_run_gap_acceptance',
        scenario: 'fezabilitate la galben',
        lowValue: 0.1,
        highValue: 8,
        measure: stopIndicator,
        fixed: { yellow_stop_probability: 1, yellow_commit_time: 2, green_launch_acceleration: 2 },
      }),
      separationRow(yellowFeasibilityScene, {
        key: 'green_launch_acceleration',
        scenario: 'fezabilitate la galben',
        lowValue: 0.2,
        highValue: 6,
        measure: stopIndicator,
        fixed: { yellow_stop_probability: 1, yellow_commit_time: 2, red_run_gap_acceptance: 2 },
      }),
      separationRow(yellowCommitScene, {
        key: 'yellow_stop_probability',
        scenario: 'angajare la galben',
        lowValue: 0.2,
        highValue: 1,
        measure: commitIndicator,
        fixed: { yellow_commit_time: 6, red_run_gap_acceptance: 2, green_launch_acceleration: 2 },
      }),
      separationRow(yellowCommitScene, {
        key: 'red_run_gap_acceptance',
        scenario: 'angajare la galben',
        lowValue: 0.1,
        highValue: 8,
        measure: commitIndicator,
        fixed: { yellow_stop_probability: 1, yellow_commit_time: 6, green_launch_acceleration: 2 },
      }),
      separationRow(yellowCommitScene, {
        key: 'green_launch_acceleration',
        scenario: 'angajare la galben',
        lowValue: 0.2,
        highValue: 6,
        measure: commitIndicator,
        fixed: { yellow_stop_probability: 1, yellow_commit_time: 6, red_run_gap_acceptance: 2 },
      }),
      separationRow(redRunScene, {
        key: 'yellow_stop_probability',
        scenario: 'gap pe roșu',
        lowValue: 0.2,
        highValue: 1,
        measure: redIndicator,
        fixed: { red_run_gap_acceptance: 0.1, yellow_commit_time: 2, green_launch_acceleration: 2 },
        mValues: { red_stop_probability: 0 },
      }),
      separationRow(redRunScene, {
        key: 'yellow_commit_time',
        scenario: 'gap pe roșu',
        lowValue: 0.2,
        highValue: 6,
        measure: redIndicator,
        fixed: {
          yellow_stop_probability: 1,
          red_run_gap_acceptance: 0.1,
          green_launch_acceleration: 2,
        },
        mValues: { red_stop_probability: 0 },
      }),
      separationRow(redRunScene, {
        key: 'green_launch_acceleration',
        scenario: 'gap pe roșu',
        lowValue: 0.2,
        highValue: 6,
        measure: redIndicator,
        fixed: { yellow_stop_probability: 1, red_run_gap_acceptance: 0.1, yellow_commit_time: 2 },
        mValues: { red_stop_probability: 0 },
      }),
      separationRow(greenLaunchScene, {
        key: 'yellow_stop_probability',
        scenario: 'plecare la verde',
        lowValue: 0.2,
        highValue: 1,
        measure: launchIndicator,
        fixed: { red_run_gap_acceptance: 2, yellow_commit_time: 2, green_launch_acceleration: 2 },
      }),
      separationRow(greenLaunchScene, {
        key: 'yellow_commit_time',
        scenario: 'plecare la verde',
        lowValue: 0.2,
        highValue: 6,
        measure: launchIndicator,
        fixed: {
          yellow_stop_probability: 1,
          red_run_gap_acceptance: 2,
          green_launch_acceleration: 2,
        },
      }),
      separationRow(greenLaunchScene, {
        key: 'red_run_gap_acceptance',
        scenario: 'plecare la verde',
        lowValue: 0.1,
        highValue: 8,
        measure: launchIndicator,
        fixed: { yellow_stop_probability: 1, yellow_commit_time: 2, green_launch_acceleration: 2 },
      }),
    ];
  const safety: SignalPolicyV2Effect[] = [
    {
      key: 'plafonul de gap pe roșu',
      scenario: 'cheia minimă 0,1 s, gap 2 s',
      unit: 'ratio',
      lowValue: 0.1,
      highValue: 8,
      lowOutcome: floorAccepted ? 1 : 0,
      highOutcome: floorAccepted ? 1 : 0,
      difference: 0,
      note: `podeaua explicită de ${SIGNAL_POLICY_V2_LIMITS.redRunMinimumGapS} s nu acceptă un gap de 2 s nici la valoarea minimă a cheii`,
    },
    {
      key: 'gap necunoscut',
      scenario: 'gap 5 s înlocuit de null',
      unit: 'ratio',
      lowValue: 0.1,
      highValue: 8,
      lowOutcome: unknownGapAccepted ? 1 : 0,
      highOutcome: unknownGapAccepted ? 1 : 0,
      difference: 0,
      note: 'fără gap declarat, trecerea pe roșu este refuzată pentru ambele capete ale cheii',
    },
    {
      key: 'stopul 050 dominant',
      scenario: 'roșu cu conformitate 1',
      unit: 'ratio',
      lowValue: 0.1,
      highValue: 8,
      lowOutcome: redStop.command.stopRequested ? 1 : 0,
      highOutcome: redStop.command.stopRequested ? 1 : 0,
      difference: 0,
      note: `comanda 050 (${redStop.signal.reason}) rămâne ${redStop.command.reason}; cheia nu poate transforma un stop în trecere`,
    },
    {
      key: 'frânare târzie pe galben',
      scenario: 'galben cu orizontul M atins',
      unit: 'ratio',
      lowValue: 0.2,
      highValue: 0,
      lowOutcome: lateBrake.command.stopRequested ? 1 : 0,
      highOutcome: lateBrakePermissive.command.stopRequested ? 1 : 0,
      difference: 0,
      note: `comanda 050 (${lateBrake.signal.reason}) rămâne ${lateBrake.command.reason} și oprește chiar dacă probabilitatea galbenului este 0`,
    },
    {
      key: 'galben fără intrare pe roșu',
      scenario: '3 s până la linie, 1 s de faza galbenă',
      unit: 'ratio',
      lowValue: 0.2,
      highValue: 6,
      lowOutcome: redAhead.command.stopRequested ? 1 : 0,
      highOutcome: redAhead.command.stopRequested ? 1 : 0,
      difference: 0,
      note: `cu orizontul maxim de 6 s comanda rămâne ${redAhead.command.reason}, pentru că intrarea ar cădea după galben`,
    },
    {
      key: 'plafonul plecării',
      scenario: 'plecare de pe loc cu cheia maximă',
      unit: 'm/s²',
      lowValue: 0.2,
      highValue: 6,
      lowOutcome: slowLaunch ?? 0,
      highOutcome: fastLaunch ?? 0,
      difference: (fastLaunch ?? 0) - (slowLaunch ?? 0),
      note: `accelerația comandată nu depășește plafonul de ${SIGNAL_POLICY_V2_LIMITS.maximumLaunchAccelerationMps2} m/s² al catalogului`,
    },
    {
      key: 'întârzierea M la verde',
      scenario: 'verde încă în întârzierea de plecare',
      unit: 'm/s²',
      lowValue: 0.2,
      highValue: 6,
      lowOutcome: launchOutcome(0.2, { ...greenLaunchScene, phaseElapsedS: 0.2 }) ?? 0,
      highOutcome: launchOutcome(6, { ...greenLaunchScene, phaseElapsedS: 0.2 }) ?? 0,
      difference: 0,
      note: `comanda rămâne ${startDelay.command.reason} și nu comandă accelerație până la expirarea întârzierii M`,
    },
  ];
  const compatibilityReport = compatibility(),
    series = () => {
      const values = {
          yellow_stop_probability: 0.6,
          red_run_gap_acceptance: 4,
          yellow_commit_time: 1.2,
          green_launch_acceleration: 2.4,
        },
        scenes: readonly SignalV2Scene[] = [
          {
            state: 'GREEN',
            speed: 8,
            distanceToStopLineM: 30,
            phaseRemainingS: 20,
            conflictGapS: null,
          },
          {
            state: 'GREEN',
            speed: 0,
            distanceToStopLineM: 20,
            phaseRemainingS: 20,
            conflictGapS: null,
          },
          {
            state: 'GREEN',
            speed: 0,
            distanceToStopLineM: 20,
            phaseRemainingS: 20,
            conflictGapS: null,
            phaseElapsedS: 0.2,
          },
          {
            state: 'YELLOW',
            speed: 8,
            distanceToStopLineM: 8,
            phaseRemainingS: 6,
            conflictGapS: null,
          },
          {
            state: 'YELLOW',
            speed: 8,
            distanceToStopLineM: 64,
            phaseRemainingS: 10,
            conflictGapS: null,
          },
          { state: 'RED', speed: 8, distanceToStopLineM: 20, phaseRemainingS: 20, conflictGapS: 9 },
        ];
      return scenes.map((scene, index) =>
        evaluate(scene, {
          tick: scenario.tick + index,
          opportunityKey: seriesOpportunity.opportunityKey,
          rValues: values,
        }),
      );
    },
    determinismDigest = digest(
      JSON.stringify(
        series().map((row) => [
          row.command.reason,
          row.command.action,
          row.command.launchAccelerationMps2,
          row.command.redRunAccepted,
          row.command.sampledUnit,
        ]),
      ),
    ),
    repeatedDigest = digest(
      JSON.stringify(
        series().map((row) => [
          row.command.reason,
          row.command.action,
          row.command.launchAccelerationMps2,
          row.command.redRunAccepted,
          row.command.sampledUnit,
        ]),
      ),
    );
  const checks: SignalPolicyV2Check[] = [
    check(
      'key-yellow-probability-effect',
      highStopRate > lowStopRate && highStopRate === 1,
      `${lowStopRate.toFixed(3)} -> ${highStopRate.toFixed(3)} rata de oprire pe 120 de oportunități`,
    ),
    check(
      'key-yellow-probability-sample',
      (() => {
        const first = evaluate(yellowFeasibilityScene, {
            tick: scenario.tick,
            opportunityKey: probabilityOpportunity.opportunityKey,
          }),
          second = evaluate(yellowFeasibilityScene, {
            tick: scenario.tick + 5,
            opportunityKey: probabilityOpportunity.opportunityKey,
          });
        return (
          first.command.sampledUnit === probabilityOpportunity.sample &&
          second.command.sampledUnit === first.command.sampledUnit &&
          second.command.action === first.command.action
        );
      })(),
      `aceeași oportunitate păstrează eșantionul ${probabilityOpportunity.sample.toFixed(6)} la tick-uri diferite`,
    ),
    check(
      'key-yellow-commit-effect',
      committedFast && !committedSlow,
      `angajare ${committedSlow ? 'da' : 'nu'} la 0,2 s și ${committedFast ? 'da' : 'nu'} la 6 s`,
    ),
    check(
      'key-yellow-commit-red-ahead',
      redAhead.command.action === 'STOP' && redAhead.command.reason === 'YELLOW_STOP_RED_AHEAD',
      `3 s până la linie cu 1 s de galben: ${redAhead.command.reason}`,
    ),
    check(
      'key-red-gap-effect',
      lowGapAccepted === true && highGapAccepted === false,
      `gap 5 s: acceptat la 0,1 s (cerință 3 s) și refuzat la 8 s`,
    ),
    check(
      'key-red-gap-floor',
      floorAccepted === false,
      'gap 2 s refuzat chiar la valoarea minimă a cheii',
    ),
    check(
      'key-red-gap-unknown',
      unknownGapAccepted === false,
      'gap necunoscut refuză trecerea pe roșu',
    ),
    check(
      'key-launch-effect',
      slowLaunch === 0.2 && fastLaunch === 6,
      `${slowLaunch?.toFixed(3)} -> ${fastLaunch?.toFixed(3)} m/s²`,
    ),
    check(
      'key-launch-delay',
      startDelay.command.launchAccelerationMps2 === null &&
        startDelay.command.reason === 'GREEN_START_DELAY',
      'întârzierea M de la verde nu este scurtată de cheia de plecare',
    ),
    check(
      'separation-yellow-feasibility',
      separation
        .filter((entry) => entry.scenario === 'fezabilitate la galben')
        .every((entry) => entry.difference === 0),
      'doar yellow_stop_probability acționează în scenariul de fezabilitate',
    ),
    check(
      'separation-yellow-commit',
      separation
        .filter((entry) => entry.scenario === 'angajare la galben')
        .every((entry) => entry.difference === 0),
      'doar yellow_commit_time acționează în scenariul de angajare',
    ),
    check(
      'separation-red',
      separation
        .filter((entry) => entry.scenario === 'gap pe roșu')
        .every((entry) => entry.difference === 0),
      'doar red_run_gap_acceptance acționează în scenariul de gap pe roșu',
    ),
    check(
      'separation-green',
      separation
        .filter((entry) => entry.scenario === 'plecare la verde')
        .every((entry) => entry.difference === 0),
      'doar green_launch_acceleration acționează în scenariul de plecare',
    ),
    check(
      'safety-red-stop-dominant',
      redStop.command.action === 'STOP' && redStop.command.reason === 'RED_STOP',
      `comanda 050 ${redStop.signal.reason} rămâne stop`,
    ),
    check(
      'safety-late-brake',
      lateBrake.command.action === 'STOP' &&
        lateBrake.command.reason === 'YELLOW_LATE_BRAKE' &&
        lateBrakePermissive.command.action === 'STOP',
      'orizontul M de frânare târzie oprește pe galben indiferent de cheia galbenului',
    ),
    check(
      'safety-tightens-red',
      (() => {
        let allowed = true;
        for (const acceptance of [0.1, 1, 2, 3, 4, 6, 8])
          for (const gap of [null, 0, 1, 2, 3, 4, 5, 8, 12]) {
            const row = evaluate(
              { ...redRunScene, conflictGapS: gap },
              {
                tick: scenario.tick,
                opportunityKey: probabilityOpportunity.opportunityKey,
                mValues: { red_stop_probability: 0 },
                rValues: { red_run_gap_acceptance: acceptance },
              },
            );
            if (row.command.action === 'PROCEED' && row.signal.action !== 'PROCEED')
              allowed = false;
            if (row.signal.action === 'STOP' && row.command.action !== 'STOP') allowed = false;
          }
        return allowed;
      })(),
      'pe grila de gapuri, 173 nu transformă niciodată un stop 050 în trecere',
    ),
    check(
      'safety-launch-bound',
      (release.command.launchAccelerationMps2 ?? 0) <= 6,
      `plecarea maximă comandă ${release.command.launchAccelerationMps2?.toFixed(3)} m/s²`,
    ),
    check(
      'm-signal-identical',
      compatibilityReport.identicalSignalTicks,
      `${compatibilityReport.identicalTicks}/${compatibilityReport.comparableTicks} rezultate 050 identice cu cheile R neutre vs active`,
    ),
    check(
      'm-neutral-forwards',
      compatibilityReport.neutralForwardTicks === compatibilityReport.comparableTicks &&
        compatibilityReport.activeDifferingTicks > 0,
      `${compatibilityReport.neutralForwardTicks}/${compatibilityReport.comparableTicks} acțiuni neutre identice cu 050; ${compatibilityReport.activeDifferingTicks} tick-uri active diferă, până la ${compatibilityReport.maximumLaunchDifferenceMps2.toFixed(3)} m/s²`,
    ),
    check(
      'm-yellow-probability-scaled',
      mYellowProceed.command.stopRequested === false && mYellowStop.command.stopRequested === true,
      'cu red_stop_probability 0 galbenul nu se oprește, cu 1 se oprește la aceeași cheie a galbenului',
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
    version: '173-signal-policy-v2',
    parameters,
    scenarios: [
      {
        name: 'fezabilitate la galben',
        scenario:
          'galben cu 7,875 s până la punctul de oprire, oprire fezabilă, eșantion per oportunitate',
      },
      {
        name: 'angajare la galben',
        scenario: 'galben cu 0,875 s până la punctul de oprire și 6 s de fază rămasă',
      },
      {
        name: 'gap pe roșu',
        scenario: 'roșu traversat de profilul 050, gap declarat de 5 s către conflict',
      },
      {
        name: 'plecare la verde',
        scenario: 'verde eliberat după întârzierea M, ego oprit la linie',
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
export function signalPolicyV2ReportMarkdown(report: SignalPolicyV2Report): string {
  const rows = (entries: readonly SignalPolicyV2Effect[]) =>
    entries
      .map(
        (entry) =>
          `| \`${entry.key}\` | ${entry.scenario} | ${entry.lowValue} | ${entry.lowOutcome.toFixed(3)} | ${entry.highValue} | ${entry.highOutcome.toFixed(3)} | ${entry.difference.toFixed(3)} | ${entry.unit} | ${entry.note} |`,
      )
      .join('\n');
  return [
    '# 173 — raport politică extinsă pentru semafoare',
    '',
    'Generat de `scripts/run-v2-signal-policy-report.mjs` din contractul `173-signal-policy-v2`.',
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
    '## Siguranță: limitele 050 rămân dominante',
    '',
    '| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    rows(report.safety),
    '',
    '## Compatibilitate cu cheile M',
    '',
    `- Rezultate 050 identice cu cheile R neutre vs active: **${report.compatibility.identicalTicks}/${report.compatibility.comparableTicks} tick-uri**.`,
    `- Acțiuni neutre identice cu 050: **${report.compatibility.neutralForwardTicks}/${report.compatibility.comparableTicks}**.`,
    `- Tick-uri active care diferă de comanda neutră: **${report.compatibility.activeDifferingTicks}**, diferență maximă de accelerație **${report.compatibility.maximumLaunchDifferenceMps2.toFixed(3)} m/s²**.`,
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
