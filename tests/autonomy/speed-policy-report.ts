import { getParameterDefinition } from '../../src/profiles';
import { compileCruiseProfile } from '../../src/autonomy/cruise-targets';
import { compileSpeedPolicyProfile } from '../../src/autonomy/speed-policy';
import { createFollowingTargetFixture } from './following-target-fixture';
import {
  cruiseTargetFixture,
  evaluate,
  scene,
  speedMValues,
  speedProfile,
  speedProfileDocument,
  sweep,
} from './speed-policy-reference';

export interface SpeedPolicyCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface SpeedPolicyEffect {
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
export interface SpeedPolicyReport {
  readonly version: '167-speed-policy-v1';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly effects: readonly SpeedPolicyEffect[];
  readonly separation: readonly SpeedPolicyEffect[];
  readonly compatibility: {
    readonly mTargetMps: number;
    readonly tempoTargetMps: number;
    readonly identical: boolean;
    readonly units: Readonly<Record<string, string>>;
  };
  readonly determinism: {
    readonly seed: number;
    readonly ticks: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly SpeedPolicyCheck[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
}
const keys = [
  'speed_delta_arterial',
  'cruise_speed_variability',
  'overtake_speed_bonus',
  'cruise_accel_deadband',
] as const;
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): SpeedPolicyCheck {
  return { id, pass, detail };
}
export function runSpeedPolicyReport(): SpeedPolicyReport {
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
    arterialLow = evaluate(speedProfile({ speed_delta_arterial: -10 }), {
      target: null,
      observation: { roadKind: 'ARTERIAL' },
    }),
    arterialHigh = evaluate(speedProfile({ speed_delta_arterial: 20 }), {
      target: null,
      observation: { roadKind: 'ARTERIAL' },
    }),
    arterialUrban = evaluate(speedProfile({ speed_delta_arterial: 20 }), {
      target: cruiseTargetFixture(),
    }),
    calm = sweep(speedProfile({ cruise_speed_variability: 0.3 })),
    restless = sweep(speedProfile({ cruise_speed_variability: 3 })),
    bonusNone = evaluate(speedProfile({ overtake_speed_bonus: 0 }), {
      observation: { overtaking: true },
    }),
    bonusTwo = evaluate(speedProfile({ overtake_speed_bonus: 2 }), {
      observation: { overtaking: true },
    }),
    bonusMaximum = evaluate(speedProfile({ overtake_speed_bonus: 10 }), {
      observation: { overtaking: true },
    }),
    bonusIdle = evaluate(speedProfile({ overtake_speed_bonus: 10 }), {
      observation: { overtaking: false },
    }),
    tightBand = evaluate(speedProfile({ cruise_accel_deadband: 0.05 }), {
      observation: { longitudinalSpeedMps: 9.6 },
      previousCommittedMps: 10.5,
    }),
    looseBand = evaluate(speedProfile({ cruise_accel_deadband: 2 }), {
      observation: { longitudinalSpeedMps: 9.6 },
      previousCommittedMps: 10.5,
    }),
    maximumTempo = speedProfile({ cruise_speed_variability: 3, overtake_speed_bonus: 10 }),
    minimalTempo = speedProfile(),
    trafficClose = evaluate(maximumTempo, {
      observation: { leadGapM: 8, leadSpeedMps: 9, overtaking: true },
    }),
    trafficNeutral = evaluate(minimalTempo, {
      observation: { leadGapM: 8, leadSpeedMps: 9, overtaking: true },
    }),
    trafficTooClose = evaluate(maximumTempo, {
      observation: { leadGapM: 3, leadSpeedMps: 9, overtaking: true },
    }),
    trafficTooCloseNeutral = evaluate(minimalTempo, {
      observation: { leadGapM: 3, leadSpeedMps: 9, overtaking: true },
    }),
    signal = evaluate(maximumTempo, {
      observation: { stopRequired: true },
      previousCommittedMps: 12,
    }),
    signalNeutral = evaluate(minimalTempo, {
      observation: { stopRequired: true },
      previousCommittedMps: 12,
    }),
    curve = evaluate(maximumTempo, {
      target: cruiseTargetFixture({
        targetMps: 8,
        preferredCurveMps: 8,
        reason: 'CURVE_PREFERENCE',
      }),
      observation: { overtaking: true },
    }),
    curveNeutral = evaluate(minimalTempo, {
      target: cruiseTargetFixture({
        targetMps: 8,
        preferredCurveMps: 8,
        reason: 'CURVE_PREFERENCE',
      }),
      observation: { overtaking: true },
    }),
    effects: SpeedPolicyEffect[] = [
      {
        key: 'speed_delta_arterial',
        scenario: 'arterial 13.9 m/s posted, no lead vehicle, tempo keys neutral',
        unit: 'm/s',
        lowValue: -10,
        highValue: 20,
        lowOutcome: arterialLow.committedTargetMps,
        highOutcome: arterialHigh.committedTargetMps,
        difference: arterialHigh.committedTargetMps - arterialLow.committedTargetMps,
        note: `arterial delta inert on URBAN: ${arterialUrban.committedTargetMps.toFixed(2)} m/s`,
      },
      {
        key: 'cruise_speed_variability',
        scenario: 'urban target 10.9 m/s, posted 13.9 m/s, 600 ticks, deadband 0.05 m/s',
        unit: 'm/s',
        lowValue: 0.3,
        highValue: 3,
        lowOutcome: calm.peakToPeakMps,
        highOutcome: restless.peakToPeakMps,
        difference: restless.peakToPeakMps - calm.peakToPeakMps,
        note: `peak-to-peak of the committed target; changes ${calm.changes} vs ${restless.changes}, max ${restless.maximumMps.toFixed(2)} m/s`,
      },
      {
        key: 'overtake_speed_bonus',
        scenario: 'urban target 10.9 m/s, overtaking an observed lead, tempo keys neutral',
        unit: 'm/s',
        lowValue: 0,
        highValue: 2,
        lowOutcome: bonusNone.committedTargetMps,
        highOutcome: bonusTwo.committedTargetMps,
        difference: bonusTwo.committedTargetMps - bonusNone.committedTargetMps,
        note: `10 m/s bonus saturates at ${bonusMaximum.committedTargetMps.toFixed(2)} m/s; not overtaking keeps ${bonusIdle.committedTargetMps.toFixed(2)} m/s`,
      },
      {
        key: 'cruise_accel_deadband',
        scenario: 'urban target 10.9 m/s, speed 9.6 m/s, previous commit 10.5 m/s',
        unit: 'm/s',
        lowValue: 0.05,
        highValue: 2,
        lowOutcome: tightBand.committedTargetMps,
        highOutcome: looseBand.committedTargetMps,
        difference: tightBand.committedTargetMps - looseBand.committedTargetMps,
        note: `request ${tightBand.throttleRequest} vs ${looseBand.throttleRequest}`,
      },
    ],
    separation: SpeedPolicyEffect[] = [
      {
        key: 'traffic gap',
        scenario: 'lead at 9 m/s, 8 m gap, maximum tempo keys vs minimal tempo keys',
        unit: 'm/s',
        lowValue: 0,
        highValue: 10,
        lowOutcome: trafficNeutral.committedTargetMps,
        highOutcome: trafficClose.committedTargetMps,
        difference: trafficClose.committedTargetMps - trafficNeutral.committedTargetMps,
        note: `binding ${trafficClose.bindingConstraint}`,
      },
      {
        key: 'traffic gap',
        scenario: 'lead at 9 m/s, 3 m gap (inside the 5 m minimum), maximum tempo keys vs minimal',
        unit: 'm/s',
        lowValue: 0,
        highValue: 10,
        lowOutcome: trafficTooCloseNeutral.committedTargetMps,
        highOutcome: trafficTooClose.committedTargetMps,
        difference: trafficTooClose.committedTargetMps - trafficTooCloseNeutral.committedTargetMps,
        note: 'hard traffic constraint commands 0 m/s',
      },
      {
        key: 'signal',
        scenario: 'stop required, previous commit 12 m/s, deadband 2 m/s',
        unit: 'm/s',
        lowValue: 0,
        highValue: 10,
        lowOutcome: signalNeutral.committedTargetMps,
        highOutcome: signal.committedTargetMps,
        difference: signal.committedTargetMps - signalNeutral.committedTargetMps,
        note: `binding ${signal.bindingConstraint}, deadband cannot delay the stop`,
      },
      {
        key: 'curve',
        scenario: '046 curve preference 8 m/s, maximum overtake bonus vs minimal tempo keys',
        unit: 'm/s',
        lowValue: 0,
        highValue: 10,
        lowOutcome: curveNeutral.committedTargetMps,
        highOutcome: curve.committedTargetMps,
        difference: curve.committedTargetMps - curveNeutral.committedTargetMps,
        note: `binding ${curve.bindingConstraint}`,
      },
      {
        key: 'legal ceiling',
        scenario: 'urban target 10.9 m/s, posted 13.9 m/s, maximum overtake bonus vs minimal',
        unit: 'm/s',
        lowValue: 0,
        highValue: 10,
        lowOutcome: bonusNone.committedTargetMps,
        highOutcome: bonusMaximum.committedTargetMps,
        difference: bonusMaximum.committedTargetMps - bonusNone.committedTargetMps,
        note: `binding ${bonusMaximum.bindingConstraint}, posted ${scene.postedLimitMps} m/s`,
      },
    ],
    neutralDocument = speedProfileDocument(speedMValues, {}, '167-report-v1'),
    tempoDocument = speedProfileDocument(
      speedMValues,
      {
        speed_delta_arterial: 20,
        cruise_speed_variability: 3,
        overtake_speed_bonus: 10,
        cruise_accel_deadband: 2,
      },
      '167-report-v1',
    ),
    neutralCruise = compileCruiseProfile(neutralDocument),
    neutralProfile = compileSpeedPolicyProfile(neutralDocument),
    tempoCruise = compileCruiseProfile(tempoDocument),
    neutralFixture = createFollowingTargetFixture(neutralCruise, scene.actor, scene.scope),
    tempoFixture = createFollowingTargetFixture(tempoCruise, scene.actor, scene.scope);
  let mTargetMps = 0,
    tempoTargetMps = 0,
    units: Record<string, string> = {};
  let mCompatibilityCheck: SpeedPolicyCheck | null = null;
  try {
    const neutralInput = neutralFixture.input(1, 5, 20, 6),
      tempoInput = tempoFixture.input(1, 5, 20, 6);
    mTargetMps = neutralInput.cruise.targetMps;
    tempoTargetMps = tempoInput.cruise.targetMps;
    units = {
      speed_delta_urban: neutralCruise.units.speed_delta_urban,
      speed_delta_residential: neutralCruise.units.speed_delta_residential,
      curve_lateral_accel: neutralCruise.units.curve_lateral_accel,
      intersection_approach_speed: neutralCruise.units.intersection_approach_speed,
      ...Object.fromEntries(keys.map((key) => [key, getParameterDefinition(key).unit])),
    };
    const command = evaluate(neutralProfile, {
      target: neutralInput.cruise,
      observation: {
        tick: 1,
        postedLimitMps: neutralInput.cruiseInput.facts!.postedLimitMps,
      },
    });
    mCompatibilityCheck = check(
      'm-compat-target',
      mTargetMps === tempoTargetMps && command.committedTargetMps === mTargetMps,
      `046 target ${mTargetMps} m/s with R neutral and ${tempoTargetMps} m/s with R active; tempo-neutral commit ${command.committedTargetMps} m/s`,
    );
  } finally {
    neutralFixture.dispose();
    tempoFixture.dispose();
  }
  const determinismSeries = (seed: number) =>
      Array.from({ length: 60 }, (_, index) => {
        const command = evaluate(
          speedProfile({ cruise_speed_variability: 1.2, cruise_accel_deadband: 0.3 }),
          { offset: index, seed },
        );
        return [command.committedTargetMps, command.variabilityOffsetMps, command.throttleRequest];
      }),
    determinismDigest = digest(JSON.stringify(determinismSeries(7))),
    repeatedDigest = digest(JSON.stringify(determinismSeries(7)));
  const checks: SpeedPolicyCheck[] = [
    mCompatibilityCheck ??
      check('m-compat-target', false, 'compatibility fixture was not evaluated'),
    check(
      'key-arterial-effect',
      arterialHigh.committedTargetMps - arterialLow.committedTargetMps > 26,
      `${arterialLow.committedTargetMps.toFixed(2)} -> ${arterialHigh.committedTargetMps.toFixed(2)} m/s`,
    ),
    check(
      'key-arterial-scope',
      arterialUrban.committedTargetMps === scene.urbanTargetMps,
      `urban commit ${arterialUrban.committedTargetMps.toFixed(2)} m/s with arterial delta 20`,
    ),
    check(
      'key-variability-effect',
      restless.peakToPeakMps - calm.peakToPeakMps > 4,
      `peak-to-peak ${calm.peakToPeakMps.toFixed(2)} vs ${restless.peakToPeakMps.toFixed(2)} m/s`,
    ),
    check(
      'key-variability-bounded',
      restless.maximumMps <= scene.postedLimitMps,
      `maximum ${restless.maximumMps.toFixed(2)} m/s <= posted ${scene.postedLimitMps} m/s`,
    ),
    check(
      'key-bonus-effect',
      bonusTwo.committedTargetMps - bonusNone.committedTargetMps === 2,
      `${bonusNone.committedTargetMps.toFixed(2)} -> ${bonusTwo.committedTargetMps.toFixed(2)} m/s`,
    ),
    check(
      'key-bonus-overtake-only',
      bonusIdle.committedTargetMps === scene.urbanTargetMps,
      `not overtaking commit ${bonusIdle.committedTargetMps.toFixed(2)} m/s`,
    ),
    check(
      'key-bonus-legal-ceiling',
      bonusMaximum.committedTargetMps <= scene.postedLimitMps,
      `10 m/s bonus commits ${bonusMaximum.committedTargetMps.toFixed(2)} m/s against posted ${scene.postedLimitMps} m/s`,
    ),
    check(
      'key-deadband-request',
      tightBand.throttleRequest === 'ACCELERATE' && looseBand.throttleRequest === 'HOLD',
      `${tightBand.throttleRequest} vs ${looseBand.throttleRequest}`,
    ),
    check(
      'key-deadband-hold',
      tightBand.committedTargetMps === scene.urbanTargetMps &&
        looseBand.committedTargetMps === 10.5,
      `${tightBand.committedTargetMps.toFixed(2)} vs ${looseBand.committedTargetMps.toFixed(2)} m/s`,
    ),
    check(
      'separation-traffic',
      trafficClose.committedTargetMps === trafficNeutral.committedTargetMps &&
        trafficClose.bindingConstraint === 'TRAFFIC',
      `maximum ${trafficClose.committedTargetMps.toFixed(2)} m/s, minimal ${trafficNeutral.committedTargetMps.toFixed(2)} m/s`,
    ),
    check(
      'separation-gap-floor',
      trafficTooClose.committedTargetMps === 0 && trafficTooCloseNeutral.committedTargetMps === 0,
      'inside the 5 m minimum both variants commit 0 m/s',
    ),
    check(
      'separation-signal',
      signal.committedTargetMps === 0 && signalNeutral.committedTargetMps === 0,
      `deadband 2 m/s still commits ${signal.committedTargetMps.toFixed(2)} m/s`,
    ),
    check(
      'separation-curve',
      curve.committedTargetMps === 8 && curveNeutral.committedTargetMps === 8,
      `curve cap holds ${curve.committedTargetMps.toFixed(2)} m/s`,
    ),
    check(
      'catalog-ranges',
      parameters.every(
        (entry) =>
          entry.unit === 'm/s' &&
          entry.minimum < entry.maximum &&
          entry.defaultValue >= entry.minimum &&
          entry.defaultValue <= entry.maximum,
      ),
      parameters.map((entry) => `${entry.key} ${entry.minimum}-${entry.maximum} m/s`).join(', '),
    ),
    check('determinism', determinismDigest === repeatedDigest, `digest ${determinismDigest}`),
  ];
  const passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '167-speed-policy-v1',
    parameters,
    effects,
    separation,
    compatibility: { mTargetMps, tempoTargetMps, identical: mTargetMps === tempoTargetMps, units },
    determinism: { seed: 7, ticks: 60, digest: determinismDigest, repeatedDigest },
    checks,
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}
export function speedPolicyReportMarkdown(report: SpeedPolicyReport): string {
  const rows = (entries: readonly SpeedPolicyEffect[]) =>
    entries
      .map(
        (entry) =>
          `| \`${entry.key}\` | ${entry.scenario} | ${entry.lowValue} | ${entry.lowOutcome.toFixed(2)} | ${entry.highValue} | ${entry.highOutcome.toFixed(2)} | ${entry.difference.toFixed(2)} | ${entry.unit} | ${entry.note} |`,
      )
      .join('\n');
  return [
    '# 167 — raport politică de viteză și ritm',
    '',
    'Generat de `scripts/run-v2-speed-policy-report.mjs` din contractul `167-speed-policy-v1`.',
    'Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei.',
    '',
    '## Efectul izolat al fiecărei chei',
    '',
    '| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    rows(report.effects),
    '',
    '## Separarea de constrângerile traficului',
    '',
    '| Constrângere | Scenariu | Cheie joasă | Rezultat | Cheie ridicată | Rezultat | Diferență | Unitate | Notă |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    rows(report.separation),
    '',
    '## Compatibilitate cu cheile M',
    '',
    `- Ținta 046 cu cheile 167 neutre: **${report.compatibility.mTargetMps} m/s**.`,
    `- Ținta 046 cu cheile 167 active: **${report.compatibility.tempoTargetMps} m/s**.`,
    `- Identice: **${report.compatibility.identical ? 'da' : 'nu'}**.`,
    `- Unități: ${Object.entries(report.compatibility.units)
      .map(([key, unit]) => `\`${key}\` ${unit}`)
      .join(', ')}.`,
    '',
    '## Determinism',
    '',
    `- Seed ${report.determinism.seed}, ${report.determinism.ticks} tick-uri: \`${report.determinism.digest}\`.`,
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
