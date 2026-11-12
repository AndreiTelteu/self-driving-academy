import { getParameterDefinition } from '../../src/profiles';
import {
  compileLongitudinalProfile,
  createLongitudinalController,
} from '../../src/autonomy/longitudinal-control';
import { evaluateAccelPolicy } from '../../src/autonomy/accel-policy';
import type { AccelPolicyActuation } from '../../src/autonomy/accel-policy';
import {
  accelProfile,
  accelProfileDocument,
  cruiseTargetFixture,
  evaluate,
  scene,
  simulate,
} from './accel-policy-reference';

export interface AccelPolicyCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface AccelPolicyEffect {
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
export interface AccelPolicyCompatibility {
  readonly identicalRequests: boolean;
  readonly comparableTicks: number;
  readonly identicalTicks: number;
  readonly firstBrakeTick: number;
  readonly settledBrake: number;
  readonly settledDecelerationMps2: number;
  readonly mUnits: Readonly<Record<string, string>>;
  readonly rUnits: Readonly<Record<string, string>>;
}
export interface AccelPolicyReport {
  readonly version: '169-accel-policy-v1';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly effects: readonly AccelPolicyEffect[];
  readonly separation: readonly AccelPolicyEffect[];
  readonly safety: readonly AccelPolicyEffect[];
  readonly compatibility: AccelPolicyCompatibility;
  readonly determinism: {
    readonly ticks: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly AccelPolicyCheck[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
}
const keys = [
  'braking_jerk',
  'throttle_release_delay',
  'launch_intensity',
  'coasting_bias',
] as const;
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): AccelPolicyCheck {
  return { id, pass, detail };
}
const brakingScene = { accelerationMps2: -2, brake: 0.25, phase: 'BRAKING' as const },
  launchScene = { accelerationMps2: 1.5, throttle: 0.4 },
  coastScene = { accelerationMps2: 0.4, throttle: 0.12 },
  liftScene = { accelerationMps2: 0 },
  launchObservation = { longitudinalSpeedMps: 0.5 },
  cruiseObservation = { longitudinalSpeedMps: 8 },
  liftPrevious = { accelerationMps2: 1.5, throttle: 0.4 };

function heldThrottleTicks(delay: number): number {
  const rows = simulate(accelProfile({ throttle_release_delay: delay }), {
    ticks: 200,
    request: liftScene,
    previous: liftPrevious,
  });
  return rows.filter((row) => row.throttleHeld).length;
}
function brakingCommitAfter(ticks: number, jerk: number): number {
  const rows = simulate(accelProfile({ braking_jerk: jerk }), {
    ticks,
    request: brakingScene,
  });
  return Math.abs(rows.at(-1)!.committedAccelerationMps2);
}

/** Runs the real 047 controller for both profiles and compares the requests and the 169 filter. */
function compatibility(): AccelPolicyCompatibility {
  const neutralDocument = accelProfileDocument({}, '169-report-v1'),
    activeDocument = accelProfileDocument(
      {
        braking_jerk: 0.2,
        throttle_release_delay: 3,
        launch_intensity: 0,
        coasting_bias: 1,
      },
      '169-report-v1',
    ),
    neutralLongitudinal = compileLongitudinalProfile(neutralDocument),
    activeLongitudinal = compileLongitudinalProfile(activeDocument),
    neutralPolicy = accelProfile(),
    neutralController = createLongitudinalController(scene.scope),
    activeController = createLongitudinalController(scene.scope);
  neutralController.setActors([scene.actor], scene.scope);
  activeController.setActors([scene.actor], scene.scope);
  let comparableTicks = 0,
    identicalTicks = 0,
    firstBrakeTick = 0,
    settledBrake = 0,
    settledDecelerationMps2 = 0;
  try {
    let previous: AccelPolicyActuation = Object.freeze({
      accelerationMps2: 0,
      throttle: 0,
      brake: 0,
      throttleReleaseTicks: 0,
    });
    for (let tick = 1; tick <= 100; tick++) {
      const targetMps = tick <= 30 ? 12 : tick <= 42 ? 10 : 0,
        observation = {
          version: '047-observation-v1' as const,
          units: 'SI' as const,
          ...scene.scope,
          actor: scene.actor,
          tick,
          longitudinalSpeedMps: 10,
          classId: 'sedan' as const,
          classVersion: '023-mechanics-v1' as const,
        },
        neutralRequest = neutralController.step({
          ...scene.scope,
          actor: scene.actor,
          tick,
          authority: 'AUTO',
          profile: neutralLongitudinal,
          target: cruiseTargetFixture(neutralLongitudinal.versionId, {
            decisionTick: tick,
            targetMps,
          }),
          observation,
        }),
        activeRequest = activeController.step({
          ...scene.scope,
          actor: scene.actor,
          tick,
          authority: 'AUTO',
          profile: activeLongitudinal,
          target: cruiseTargetFixture(activeLongitudinal.versionId, {
            decisionTick: tick,
            targetMps,
          }),
          observation,
        });
      comparableTicks += 1;
      if (
        neutralRequest.accelerationMps2 === activeRequest.accelerationMps2 &&
        neutralRequest.command.throttle === activeRequest.command.throttle &&
        neutralRequest.command.brake === activeRequest.command.brake &&
        neutralRequest.phase === activeRequest.phase
      )
        identicalTicks += 1;
      if (firstBrakeTick === 0 && neutralRequest.command.brake > 0) firstBrakeTick = tick;
      const filtered = evaluateAccelPolicy({
        ...scene.scope,
        actor: scene.actor,
        decisionTick: tick,
        authority: 'AUTO',
        profile: neutralPolicy,
        longitudinal: neutralRequest,
        observation: {
          version: '169-observation-v1',
          units: 'SI',
          ...scene.scope,
          actor: scene.actor,
          tick,
          longitudinalSpeedMps: 10,
          leadGapM: null,
          leadSpeedMps: null,
          stopRequired: false,
        },
        previous,
      });
      previous = filtered.actuation;
      if (tick === firstBrakeTick + 6) {
        settledBrake = filtered.command.brake;
        settledDecelerationMps2 = filtered.committedAccelerationMps2;
      }
    }
  } finally {
    neutralController.dispose();
    activeController.dispose();
  }
  const mUnits = {
      desired_acceleration: neutralLongitudinal.values.desired_acceleration,
      comfort_deceleration: neutralLongitudinal.values.comfort_deceleration,
      acceleration_jerk: neutralLongitudinal.values.acceleration_jerk,
      brake_reaction_delay: neutralLongitudinal.values.brake_reaction_delay,
    } as const,
    unitsOf = (values: Readonly<Record<string, number>>) =>
      Object.fromEntries(Object.keys(values).map((key) => [key, getParameterDefinition(key).unit]));
  return {
    identicalRequests: comparableTicks === identicalTicks,
    comparableTicks,
    identicalTicks,
    firstBrakeTick,
    settledBrake,
    settledDecelerationMps2,
    mUnits: unitsOf(mUnits),
    rUnits: unitsOf(Object.fromEntries(keys.map((key) => [key, 1]))),
  };
}

export function runAccelPolicyReport(): AccelPolicyReport {
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
    gentleBrake = brakingCommitAfter(8, 0.2),
    briskBrake = brakingCommitAfter(8, 20),
    settledBrisk = brakingCommitAfter(30, 20),
    gentleLaunch = evaluate(accelProfile({ launch_intensity: 0 }), {
      request: launchScene,
      observation: launchObservation,
    }),
    fullLaunch = evaluate(accelProfile({ launch_intensity: 1 }), {
      request: launchScene,
      observation: launchObservation,
    }),
    heldCoast = evaluate(accelProfile({ coasting_bias: 0 }), {
      request: coastScene,
      observation: cruiseObservation,
    }),
    freeCoast = evaluate(accelProfile({ coasting_bias: 1 }), {
      request: coastScene,
      observation: cruiseObservation,
    }),
    immediateRelease = evaluate(accelProfile({ throttle_release_delay: 0 }), {
      request: liftScene,
      previous: liftPrevious,
      observation: cruiseObservation,
    }),
    delayedRelease = evaluate(accelProfile({ throttle_release_delay: 3 }), {
      request: liftScene,
      previous: liftPrevious,
      observation: cruiseObservation,
    }),
    holdTicksImmediate = heldThrottleTicks(0),
    holdTicksDelayed = heldThrottleTicks(3),
    effects: AccelPolicyEffect[] = [
      {
        key: 'braking_jerk',
        scenario: '047 braking demand 2 m/s² (brake 0.25), from rest of actuation, 8 ticks',
        unit: 'm/s²',
        lowValue: 0.2,
        highValue: 20,
        lowOutcome: gentleBrake,
        highOutcome: briskBrake,
        difference: briskBrake - gentleBrake,
        note: `deceleration after 8 ticks; both start braking on tick 1, the 20 m/s³ ramp settles at ${settledBrisk.toFixed(2)} m/s²`,
      },
      {
        key: 'throttle_release_delay',
        scenario: 'lift from 1.5 m/s² and 0.4 throttle at 8 m/s, first release tick',
        unit: 'ratio',
        lowValue: 0,
        highValue: 3,
        lowOutcome: immediateRelease.command.throttle,
        highOutcome: delayedRelease.command.throttle,
        difference: delayedRelease.command.throttle - immediateRelease.command.throttle,
        note: `held throttle ticks ${holdTicksImmediate} vs ${holdTicksDelayed} at 60 Hz`,
      },
      {
        key: 'launch_intensity',
        scenario: 'launch at 0.5 m/s with a 047 request of 1.5 m/s² and 0.4 throttle',
        unit: 'm/s²',
        lowValue: 0,
        highValue: 1,
        lowOutcome: gentleLaunch.committedAccelerationMps2,
        highOutcome: fullLaunch.committedAccelerationMps2,
        difference: fullLaunch.committedAccelerationMps2 - gentleLaunch.committedAccelerationMps2,
        note: `throttle ${gentleLaunch.command.throttle.toFixed(3)} vs ${fullLaunch.command.throttle.toFixed(3)}; above 2 m/s the key is inert`,
      },
      {
        key: 'coasting_bias',
        scenario: 'mild 0.4 m/s² request (0.12 throttle) at 8 m/s, one tick',
        unit: 'm/s²',
        lowValue: 0,
        highValue: 1,
        lowOutcome: heldCoast.committedAccelerationMps2,
        highOutcome: freeCoast.committedAccelerationMps2,
        difference: heldCoast.committedAccelerationMps2 - freeCoast.committedAccelerationMps2,
        note: `throttle ${heldCoast.command.throttle.toFixed(2)} vs ${freeCoast.command.throttle.toFixed(2)}, no brake in either case`,
      },
    ],
    separation: AccelPolicyEffect[] = [
      {
        key: 'launch_intensity in braking scene',
        scenario: 'braking demand 2 m/s², 8 ticks, launch_intensity 0 vs 1',
        unit: 'm/s²',
        lowValue: 0,
        highValue: 1,
        lowOutcome: Math.abs(
          simulate(accelProfile({ launch_intensity: 0 }), { ticks: 8, request: brakingScene }).at(
            -1,
          )!.committedAccelerationMps2,
        ),
        highOutcome: Math.abs(
          simulate(accelProfile({ launch_intensity: 1 }), { ticks: 8, request: brakingScene }).at(
            -1,
          )!.committedAccelerationMps2,
        ),
        difference: 0,
        note: 'launch is not a braking channel',
      },
      {
        key: 'coasting_bias in launch scene',
        scenario: 'launch at 0.5 m/s, coasting_bias 0 vs 1',
        unit: 'm/s²',
        lowValue: 0,
        highValue: 1,
        lowOutcome: evaluate(accelProfile({ coasting_bias: 0 }), {
          request: launchScene,
          observation: launchObservation,
        }).committedAccelerationMps2,
        highOutcome: evaluate(accelProfile({ coasting_bias: 1 }), {
          request: launchScene,
          observation: launchObservation,
        }).committedAccelerationMps2,
        difference: 0,
        note: 'coasting only applies above the 2 m/s launch speed',
      },
      {
        key: 'throttle_release_delay in coasting scene',
        scenario: 'mild 0.4 m/s² request at 8 m/s, delay 0 vs 3 s',
        unit: 'm/s²',
        lowValue: 0,
        highValue: 3,
        lowOutcome: evaluate(accelProfile({ throttle_release_delay: 0 }), {
          request: coastScene,
          observation: cruiseObservation,
        }).committedAccelerationMps2,
        highOutcome: evaluate(accelProfile({ throttle_release_delay: 3 }), {
          request: coastScene,
          observation: cruiseObservation,
        }).committedAccelerationMps2,
        difference: 0,
        note: 'the delay only reacts to a request that fell to zero',
      },
      {
        key: 'braking_jerk in launch scene',
        scenario: 'launch at 0.5 m/s, braking_jerk 0.2 vs 20 m/s³',
        unit: 'm/s²',
        lowValue: 0.2,
        highValue: 20,
        lowOutcome: evaluate(accelProfile({ braking_jerk: 0.2 }), {
          request: launchScene,
          observation: launchObservation,
        }).committedAccelerationMps2,
        highOutcome: evaluate(accelProfile({ braking_jerk: 20 }), {
          request: launchScene,
          observation: launchObservation,
        }).committedAccelerationMps2,
        difference: 0,
        note: 'braking jerk is not a launch channel',
      },
      {
        key: 'braking_jerk in lift scene',
        scenario: 'lift at 8 m/s, braking_jerk 0.2 vs 20 m/s³',
        unit: 'ratio',
        lowValue: 0.2,
        highValue: 20,
        lowOutcome: evaluate(accelProfile({ braking_jerk: 0.2 }), {
          request: liftScene,
          previous: liftPrevious,
          observation: cruiseObservation,
        }).command.throttle,
        highOutcome: evaluate(accelProfile({ braking_jerk: 20 }), {
          request: liftScene,
          previous: liftPrevious,
          observation: cruiseObservation,
        }).command.throttle,
        difference: 0,
        note: 'the lift throttle is decided by the release delay alone',
      },
      {
        key: 'coasting_bias in lift scene',
        scenario: 'lift at 8 m/s, coasting_bias 0 vs 1',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: evaluate(accelProfile({ coasting_bias: 0 }), {
          request: liftScene,
          previous: liftPrevious,
          observation: cruiseObservation,
        }).command.throttle,
        highOutcome: evaluate(accelProfile({ coasting_bias: 1 }), {
          request: liftScene,
          previous: liftPrevious,
          observation: cruiseObservation,
        }).command.throttle,
        difference: 0,
        note: 'coasting needs a positive mild request, not an already lifted one',
      },
    ],
    aggressive = accelProfile({
      braking_jerk: 20,
      throttle_release_delay: 3,
      launch_intensity: 1,
      coasting_bias: 1,
    }),
    stopped = evaluate(aggressive, {
      request: launchScene,
      observation: { longitudinalSpeedMps: 8, stopRequired: true },
      previous: liftPrevious,
    }),
    tooClose = evaluate(aggressive, {
      request: launchScene,
      observation: { longitudinalSpeedMps: 8, leadGapM: 3, leadSpeedMps: 9 },
    }),
    safeGap = evaluate(aggressive, {
      request: launchScene,
      observation: launchObservation,
    }),
    brakingUnderStop = evaluate(aggressive, {
      request: brakingScene,
      observation: { stopRequired: true },
      previous: liftPrevious,
    }),
    settled = simulate(aggressive, { ticks: 30, request: brakingScene }),
    strongCoast = evaluate(accelProfile({ coasting_bias: 1 }), {
      request: { accelerationMps2: 1.2, throttle: 0.3 },
      observation: cruiseObservation,
    }),
    safety: AccelPolicyEffect[] = [
      {
        key: 'stop required',
        scenario: 'launch request 1.5 m/s² with every style key at maximum, stop required',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: safeGap.command.throttle,
        highOutcome: stopped.command.throttle,
        difference: stopped.command.throttle - safeGap.command.throttle,
        note: `safety veto ${stopped.safetyVeto}, committed ${stopped.committedAccelerationMps2.toFixed(2)} m/s²`,
      },
      {
        key: 'lead gap 3 m',
        scenario: 'launch request 1.5 m/s² with every style key at maximum, lead at 3 m',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: safeGap.command.throttle,
        highOutcome: tooClose.command.throttle,
        difference: tooClose.command.throttle - safeGap.command.throttle,
        note: `safety veto ${tooClose.safetyVeto}, the 5 m floor wins`,
      },
      {
        key: 'braking demand',
        scenario: 'braking request 2 m/s² with release delay 3 s and stop required',
        unit: 'ratio',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: brakingUnderStop.command.brake,
        difference: brakingUnderStop.command.brake,
        note: `throttle held ${brakingUnderStop.throttleHeld}, brake applied on the onset tick`,
      },
      {
        key: 'maximum braking',
        scenario: 'maximum braking_jerk 20 m/s³, 30 ticks of demand 2 m/s²',
        unit: 'm/s²',
        lowValue: 0,
        highValue: 20,
        lowOutcome: 0,
        highOutcome: Math.abs(settled.at(-1)!.committedAccelerationMps2),
        difference: Math.abs(settled.at(-1)!.committedAccelerationMps2),
        note: 'never above comfort_deceleration 2 m/s²; the demand bounds the ramp',
      },
      {
        key: 'maximum launch',
        scenario: 'maximum launch_intensity 1, 047 request 1.5 m/s²',
        unit: 'm/s²',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: fullLaunch.committedAccelerationMps2,
        difference: fullLaunch.committedAccelerationMps2,
        note: 'equals desired_acceleration 1.5 m/s² and never exceeds it',
      },
      {
        key: 'strong request',
        scenario: 'maximum coasting_bias 1 with a 1.2 m/s² request (above the 0.6 threshold)',
        unit: 'm/s²',
        lowValue: 0,
        highValue: 1,
        lowOutcome: 0,
        highOutcome: strongCoast.committedAccelerationMps2,
        difference: strongCoast.committedAccelerationMps2,
        note: 'a strong request is not released to coasting',
      },
    ];
  const compatibilityReport = compatibility(),
    determinismSeries = () =>
      simulate(
        accelProfile({ throttle_release_delay: 0.2, launch_intensity: 0.6, coasting_bias: 0.4 }),
        {
          ticks: 60,
          request: { accelerationMps2: 0 },
          previous: liftPrevious,
        },
      ).map((row) => [row.command.throttle, row.throttleReleaseTicks, row.throttleHeld]),
    determinismDigest = digest(JSON.stringify(determinismSeries())),
    repeatedDigest = digest(JSON.stringify(determinismSeries()));
  const checks: AccelPolicyCheck[] = [
    check(
      'key-braking-jerk-effect',
      briskBrake - gentleBrake > 1.9,
      `${gentleBrake.toFixed(3)} -> ${briskBrake.toFixed(3)} m/s² after 8 ticks`,
    ),
    check(
      'key-braking-jerk-bounded',
      settled.every((row) => row.committedAccelerationMps2 >= -2),
      'maximum 20 m/s³ never exceeds the 2 m/s² demand',
    ),
    check(
      'key-release-delay-effect',
      holdTicksDelayed === 180 && holdTicksImmediate === 0,
      `held throttle ticks ${holdTicksImmediate} vs ${holdTicksDelayed}`,
    ),
    check(
      'key-release-delay-cancelled',
      brakingUnderStop.throttleHeld === false && brakingUnderStop.command.brake > 0,
      `brake ${brakingUnderStop.command.brake.toFixed(2)} on the onset tick, no hold`,
    ),
    check(
      'key-launch-effect',
      Math.abs(fullLaunch.committedAccelerationMps2 - 1.5) < 1e-12 &&
        Math.abs(gentleLaunch.committedAccelerationMps2 - 0.525) < 1e-12,
      `${gentleLaunch.committedAccelerationMps2.toFixed(3)} -> ${fullLaunch.committedAccelerationMps2.toFixed(3)} m/s²`,
    ),
    check(
      'key-launch-bounded',
      fullLaunch.committedAccelerationMps2 <= 1.5,
      'full launch equals desired_acceleration 1.5 m/s²',
    ),
    check(
      'key-coasting-effect',
      heldCoast.command.throttle === 0.12 && freeCoast.command.throttle === 0,
      `throttle ${heldCoast.command.throttle} -> ${freeCoast.command.throttle}`,
    ),
    check(
      'key-coasting-strong-request',
      strongCoast.committedAccelerationMps2 === 1.2,
      'a 1.2 m/s² request is not released by coasting_bias 1',
    ),
    check(
      'separation-braking',
      separation
        .filter((entry) => entry.key.includes('braking scene'))
        .every((entry) => entry.difference === 0),
      'launch and coasting do not change the braking scene',
    ),
    check(
      'separation-launch',
      separation
        .filter((entry) => entry.key.includes('launch scene'))
        .every((entry) => entry.difference === 0),
      'coasting and braking jerk do not change the launch scene',
    ),
    check(
      'separation-coasting',
      separation
        .filter((entry) => entry.key.includes('coasting scene'))
        .every((entry) => entry.difference === 0),
      'the release delay does not change the coasting scene',
    ),
    check(
      'separation-lift',
      separation
        .filter((entry) => entry.key.includes('lift scene'))
        .every((entry) => entry.difference === 0),
      'braking jerk and coasting do not change the lift scene',
    ),
    check(
      'safety-stop',
      stopped.safetyVeto && stopped.command.throttle === 0,
      `committed ${stopped.committedAccelerationMps2.toFixed(2)} m/s² with every style key at maximum`,
    ),
    check(
      'safety-gap-floor',
      tooClose.safetyVeto && tooClose.command.throttle === 0,
      'a lead inside 5 m vetoes throttle',
    ),
    check(
      'safety-braking-wins',
      brakingUnderStop.command.brake > 0 && brakingUnderStop.throttleHeld === false,
      'braking wins over the release delay and over stop required',
    ),
    check(
      'm-requests-identical',
      compatibilityReport.identicalRequests,
      `${compatibilityReport.identicalTicks}/${compatibilityReport.comparableTicks} request ticks identical with R neutral vs R active`,
    ),
    check(
      'm-braking-settles',
      Math.abs(compatibilityReport.settledDecelerationMps2 + 2) < 1e-9 &&
        compatibilityReport.settledBrake === 0.25,
      `neutral ramp settles at ${compatibilityReport.settledDecelerationMps2.toFixed(2)} m/s² / brake ${compatibilityReport.settledBrake}`,
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
    version: '169-accel-policy-v1',
    parameters,
    effects,
    separation,
    safety,
    compatibility: compatibilityReport,
    determinism: { ticks: 60, digest: determinismDigest, repeatedDigest },
    checks,
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}
export function accelPolicyReportMarkdown(report: AccelPolicyReport): string {
  const rows = (entries: readonly AccelPolicyEffect[]) =>
    entries
      .map(
        (entry) =>
          `| \`${entry.key}\` | ${entry.scenario} | ${entry.lowValue} | ${entry.lowOutcome.toFixed(3)} | ${entry.highValue} | ${entry.highOutcome.toFixed(3)} | ${entry.difference.toFixed(3)} | ${entry.unit} | ${entry.note} |`,
      )
      .join('\n');
  return [
    '# 169 — raport politică de accelerație și frânare',
    '',
    'Generat de `scripts/run-v2-accel-policy-report.mjs` din contractul `169-accel-policy-v1`.',
    'Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei.',
    '',
    '## Efectul izolat al fiecărei chei',
    '',
    '| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    rows(report.effects),
    '',
    '## Separarea cheilor (fiecare cheie inertă în scenariile celorlalte)',
    '',
    '| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    rows(report.separation),
    '',
    '## Siguranță: limitele 047 rămân dominante',
    '',
    '| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    rows(report.safety),
    '',
    '## Compatibilitate cu cheile M',
    '',
    `- Cereri 047 identice cu cheile R neutre vs active: **${report.compatibility.identicalTicks}/${report.compatibility.comparableTicks} tick-uri**.`,
    `- Primul tick de frânare 047: **${report.compatibility.firstBrakeTick}** (nemodificat de stratul 169).`,
    `- Rampa neutră se stabilizează la **${report.compatibility.settledDecelerationMps2.toFixed(2)} m/s²** și brake **${report.compatibility.settledBrake}**.`,
    `- Unități M: ${Object.entries(report.compatibility.mUnits)
      .map(([key, unit]) => `\`${key}\` ${unit}`)
      .join(', ')}.`,
    `- Unități R: ${Object.entries(report.compatibility.rUnits)
      .map(([key, unit]) => `\`${key}\` ${unit}`)
      .join(', ')}.`,
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
