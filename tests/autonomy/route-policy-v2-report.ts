import { getParameterDefinition } from '../../src/profiles';
import {
  ROUTE_POLICY_V2_KEYS,
  ROUTE_POLICY_V2_LIMITS,
  ROUTE_POLICY_V2_M_KEYS,
} from '../../src/autonomy/route-policy-v2';
import type { RoutePolicyV2Command, RoutePolicyV2Key } from '../../src/autonomy/route-policy-v2';
import {
  CORRIDORS,
  chosenRoute,
  defaultRoutePolicyValues,
  evaluate,
  routeAlternative,
  routeFacts,
  scenario,
  scenarioRows,
} from './route-policy-v2-reference';
import type { RoutePolicyScene } from './route-policy-v2-reference';

export interface RoutePolicyCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}
export interface RoutePolicyEffect {
  readonly key: string;
  readonly scenario: string;
  readonly keyUnit: string;
  readonly unit: string;
  readonly lowValue: number;
  readonly highValue: number;
  readonly lowOutcome: number;
  readonly highOutcome: number;
  readonly lowChoice: string | null;
  readonly highChoice: string | null;
  readonly difference: number;
  readonly coupling: boolean;
  readonly note: string;
}
export interface RoutePolicyRouteFact {
  readonly id: string;
  readonly lengthM: number;
  readonly travelTimeS: number;
  readonly freeFlowSpeedMps: number;
  readonly derivedTurns: number;
  readonly signals: number;
  readonly congestionDelayS: number;
  readonly costSeconds: number;
  readonly penaltySeconds: number;
  readonly continuationPenaltyS: number;
  readonly pathLanes: number;
}
export interface RoutePolicyCompatibility {
  readonly routes: readonly RoutePolicyRouteFact[];
  readonly identityRoutes: number;
  readonly shareSum: number;
  readonly mStyleTimes: readonly {
    readonly route: string;
    readonly roadClass: string;
    readonly delta: number;
    readonly deliveredTravelTimeS: number;
    readonly styleTimeS: number;
  }[];
  readonly mChoice: readonly { readonly delta: number; readonly candidate: string | null }[];
  readonly mUnits: Readonly<Record<string, string>>;
  readonly rUnits: Readonly<Record<string, string>>;
}
export interface RoutePolicyNormalization {
  readonly scaleFactors: readonly number[];
  readonly coefficients: readonly {
    readonly factor: number;
    readonly time: number;
    readonly distance: number;
    readonly turn: number;
    readonly signal: number;
    readonly congestion: number;
  }[];
  readonly comparedDecisions: number;
  readonly identicalDecisions: number;
  readonly nearTie: {
    readonly congestionDifferenceS: number;
    readonly rawImprovement: number;
    readonly scaledRawImprovement: number;
    readonly naiveEpsilon: number;
    readonly naiveBase: string;
    readonly naiveScaled: string;
    readonly policyBase: string | null;
    readonly policyScaled: string | null;
    readonly policyDecisionBase: string;
    readonly policyDecisionScaled: string;
  };
}
export interface RoutePolicyReport {
  readonly version: '181-route-policy-v2';
  readonly parameters: readonly {
    readonly key: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultValue: number;
  }[];
  readonly scenarios: readonly { readonly name: string; readonly scenario: string }[];
  readonly effects: readonly RoutePolicyEffect[];
  readonly separation: readonly RoutePolicyEffect[];
  readonly couplings: readonly RoutePolicyEffect[];
  readonly safety: readonly RoutePolicyEffect[];
  readonly compatibility: RoutePolicyCompatibility;
  readonly normalization: RoutePolicyNormalization;
  readonly determinism: {
    readonly decisions: number;
    readonly digest: string;
    readonly repeatedDigest: string;
  };
  readonly checks: readonly RoutePolicyCheck[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
}

const ranges: Readonly<Record<RoutePolicyV2Key, readonly [number, number]>> = Object.freeze({
  route_time_weight: [0, 1],
  route_distance_weight: [0, 1],
  route_turn_penalty: [0, 20],
  route_signal_penalty: [0, 60],
  route_congestion_penalty: [0, 2],
  reroute_patience: [2, 120],
  u_turn_willingness: [0, 1],
  reverse_recovery_duration: [0, 8],
});
export const expectedUnits: Readonly<Record<RoutePolicyV2Key, string>> = Object.freeze({
  route_time_weight: 'weight',
  route_distance_weight: 'weight',
  route_turn_penalty: 's',
  route_signal_penalty: 's',
  route_congestion_penalty: 'ratio',
  reroute_patience: 's',
  u_turn_willingness: 'probability',
  reverse_recovery_duration: 's',
});
/** Whole-weight scale family: the base is one tenth of the catalog defaults, factors reach ×10. */
const baseWeights = Object.freeze({
    route_time_weight: 0.06,
    route_distance_weight: 0.03,
    route_turn_penalty: 0.2,
    route_signal_penalty: 0.5,
    route_congestion_penalty: 0.05,
  }),
  scaleFactors = Object.freeze([0.5, 1, 2, 5, 10]);
function scaled(factor: number): Partial<Record<RoutePolicyV2Key, number>> {
  return {
    route_time_weight: baseWeights.route_time_weight * factor,
    route_distance_weight: baseWeights.route_distance_weight * factor,
    route_turn_penalty: baseWeights.route_turn_penalty * factor,
    route_signal_penalty: baseWeights.route_signal_penalty * factor,
    route_congestion_penalty: baseWeights.route_congestion_penalty * factor,
  };
}
function effectRow(
  scene: RoutePolicyScene,
  key: RoutePolicyV2Key,
  lowValue: number,
  highValue: number,
  unit: string,
  note: string,
  measure: (command: RoutePolicyV2Command) => number,
  coupling = false,
): RoutePolicyEffect {
  const low = evaluate(scene, { rValues: { [key]: lowValue } }).command,
    high = evaluate(scene, { rValues: { [key]: highValue } }).command,
    lowOutcome = measure(low),
    highOutcome = measure(high);
  return {
    key,
    scenario: scene.name,
    keyUnit: getParameterDefinition(key).unit,
    unit,
    lowValue,
    highValue,
    lowOutcome,
    highOutcome,
    lowChoice: low.candidateRouteId,
    highChoice: high.candidateRouteId,
    difference: highOutcome - lowOutcome,
    coupling,
    note,
  };
}
/** The chosen route's fact a scoring scenario reports. */
function chosenFact(
  field: 'travelTimeS' | 'lengthM' | 'turns' | 'signals' | 'congestionDelayS',
): (command: RoutePolicyV2Command) => number {
  return (command) => chosenRoute(command)?.[field] ?? 0;
}
const recoverySeconds = (command: RoutePolicyV2Command): number => command.recovery.durationS ?? 0;
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function check(id: string, pass: boolean, detail: string): RoutePolicyCheck {
  return { id, pass, detail };
}
const round = (value: number, digits = 3): number =>
  Math.round(value * 10 ** digits) / 10 ** digits;
/** The mixed-unit total a naive implementation compares against a fixed epsilon. */
function rawScore(
  route: {
    readonly travelTimeS: number;
    readonly lengthM: number;
    readonly turns: number;
    readonly signals: number;
    readonly congestionDelayS: number;
  },
  weights: Readonly<Record<string, number>>,
): number {
  return (
    weights.route_time_weight * route.travelTimeS +
    weights.route_distance_weight * route.lengthM +
    weights.route_turn_penalty * route.turns +
    weights.route_signal_penalty * route.signals +
    weights.route_congestion_penalty * route.congestionDelayS
  );
}

export function runRoutePolicyReport(): RoutePolicyReport {
  const parameters = ROUTE_POLICY_V2_KEYS.map((key) => {
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
      return effectRow(row.scene, row.key, low, high, row.unit, row.note, row.measure);
    }),
    separation: RoutePolicyEffect[] = [];
  for (const row of scenarioRows) {
    // The row's own key stays at its catalog default, so a coupling can surface in both directions.
    const own = defaultRoutePolicyValues[row.key];
    for (const key of ROUTE_POLICY_V2_KEYS) {
      if (key === row.key) continue;
      const [low, high] = ranges[key],
        otherLow = evaluate(row.scene, { rValues: { [row.key]: own, [key]: low } }).command,
        otherHigh = evaluate(row.scene, { rValues: { [row.key]: own, [key]: high } }).command,
        // The outcome of the row is measured with the row's own measure, so the unit is stable.
        lowOutcome = row.measure(otherLow),
        highOutcome = row.measure(otherHigh),
        coupling = lowOutcome !== highOutcome;
      separation.push({
        key,
        scenario: row.name,
        keyUnit: getParameterDefinition(key).unit,
        unit: row.unit,
        lowValue: low,
        highValue: high,
        lowOutcome,
        highOutcome,
        lowChoice: otherLow.candidateRouteId,
        highChoice: otherHigh.candidateRouteId,
        difference: highOutcome - lowOutcome,
        coupling,
        note: coupling
          ? `cuplaj explicit: \`${key}\` decide în scenariul ${row.name} pentru că preferințele de timp și distanță sunt în opoziție`
          : `\`${key}\` este inertă în scenariul ${row.name}`,
      });
    }
  }
  const couplings = separation.filter((entry) => entry.coupling),
    forbiddenScene: RoutePolicyScene = {
      name: 'întoarcere interzisă',
      description: 'aceeași rută cu întoarcere în U, dar harta declară întoarcerea interzisă',
      routes: [{ id: 'route-direct' }, { id: 'route-uturn' }],
      uTurn: 'FORBIDDEN',
    },
    unknownScene: RoutePolicyScene = {
      ...forbiddenScene,
      name: 'întoarcere nedeclarată',
      uTurn: 'UNKNOWN',
    },
    recoveryScene: RoutePolicyScene = {
      name: 'recuperare',
      description: 'recuperare prin marșarier cerută, cu spațiul din spate declarat liber',
      routes: [{ id: 'route-direct' }],
      recovery: { required: true, reverseClear: true },
    },
    blockedScene: RoutePolicyScene = {
      name: 'recuperare blocată',
      description: 'recuperare cerută, dar spațiul din spate nu este declarat liber',
      routes: [{ id: 'route-direct' }],
      recovery: { required: true, reverseClear: false },
    },
    safety: RoutePolicyEffect[] = [
      effectRow(
        forbiddenScene,
        'u_turn_willingness',
        0,
        1,
        's',
        'cu întoarcerea interzisă, cheia este inertă la ambele extremități: ruta cu U nu este admisă niciodată',
        chosenFact('travelTimeS'),
      ),
      effectRow(
        unknownScene,
        'u_turn_willingness',
        0,
        1,
        's',
        'o permisiune nedeclarată este tratată ca o interdicție: cheia rămâne inertă',
        chosenFact('travelTimeS'),
      ),
      effectRow(
        recoveryScene,
        'reverse_recovery_duration',
        2,
        8,
        's',
        'minimul de catalog de 0 s este ridicat la podeaua de 2,5 s (150 de tick-uri, 3 m)',
        recoverySeconds,
      ),
      effectRow(
        blockedScene,
        'reverse_recovery_duration',
        2,
        8,
        's',
        'fără spațiu liber declarat în spate, nicio valoare nu comandă manevra',
        recoverySeconds,
      ),
    ],
    floorRow = evaluate(recoveryScene, { rValues: { reverse_recovery_duration: 0 } }).command
      .recovery,
    topRow = evaluate(recoveryScene, { rValues: { reverse_recovery_duration: 8 } }).command
      .recovery,
    blockedRow = evaluate(blockedScene, { rValues: { reverse_recovery_duration: 8 } }).command,
    patienceRow = scenarioRows.find((row) => row.key === 'reroute_patience')!,
    patienceLow = evaluate(patienceRow.scene, { rValues: { reroute_patience: 2 } }).command,
    patienceHigh = evaluate(patienceRow.scene, { rValues: { reroute_patience: 120 } }).command,
    patienceElapsed = evaluate(
      { ...patienceRow.scene, waitingSinceTick: scenario.tick - 200 },
      { rValues: { reroute_patience: 2 } },
    ).command,
    forcedReroute = evaluate(
      {
        ...forbiddenScene,
        name: 'rută curentă indisponibilă',
        uTurn: 'FORBIDDEN',
        currentRouteId: 'route-uturn',
      },
      { rValues: { reroute_patience: 120 } },
    ).command,
    firstDecision = evaluate(
      { ...patienceRow.scene, currentRouteId: null },
      { rValues: { reroute_patience: 120 } },
    ).command,
    keptRoute = evaluate(
      { ...patienceRow.scene, currentRouteId: 'route-direct' },
      { rValues: { reroute_patience: 120 } },
    ).command,
    compatibilityRoutes: RoutePolicyRouteFact[] = CORRIDORS.map((corridor) => {
      const fact = routeFacts(corridor.id);
      return {
        id: corridor.id,
        lengthM: round(fact.lengthM, 6),
        travelTimeS: round(fact.travelTimeS, 6),
        freeFlowSpeedMps: round(fact.freeFlowSpeedMps, 6),
        derivedTurns: fact.derivedTurns,
        signals: fact.signals,
        congestionDelayS: fact.congestionDelayS,
        costSeconds: round(fact.costSeconds, 6),
        penaltySeconds: round(fact.penaltySeconds, 6),
        continuationPenaltyS: round(fact.continuationPenaltyS, 6),
        pathLanes: fact.path.length,
      };
    }),
    timeScene = scenarioRows[0].scene,
    styleTime = (routeId: string, delta: number): number => {
      const corridor = CORRIDORS.find((entry) => entry.id === routeId)!,
        deltaKey = corridor.roadClass === 'URBAN' ? 'speed_delta_urban' : 'speed_delta_residential',
        command = evaluate(
          {
            name: `stil ${routeId}`,
            description: 'o singură rută, pentru timpul de stil',
            routes: [{ id: routeId }],
          },
          { mValues: { [deltaKey]: delta } },
        ).command;
      return round(command.routes.find((route) => route.id === routeId)?.styleTimeS ?? 0, 6);
    },
    compatibility: RoutePolicyCompatibility = {
      routes: compatibilityRoutes,
      identityRoutes: compatibilityRoutes.filter(
        (route) => Math.abs(route.penaltySeconds - route.continuationPenaltyS) < 1e-9,
      ).length,
      shareSum: round(
        Object.values(
          evaluate(timeScene, {}).command.weights ?? {
            time: 0,
            distance: 0,
            turn: 0,
            signal: 0,
            congestion: 0,
          },
        ).reduce((total, share) => total + share, 0),
        9,
      ),
      mStyleTimes: [
        { route: 'route-short', roadClass: 'URBAN', delta: 0 },
        { route: 'route-short', roadClass: 'URBAN', delta: 15 },
        { route: 'route-slow', roadClass: 'RESIDENTIAL', delta: 0 },
        { route: 'route-slow', roadClass: 'RESIDENTIAL', delta: 12 },
      ].map((entry) => ({
        ...entry,
        deliveredTravelTimeS: round(routeFacts(entry.route).travelTimeS, 6),
        styleTimeS: styleTime(entry.route, entry.delta),
      })),
      mChoice: [{ delta: 0 }, { delta: 15 }].map((entry) => ({
        delta: entry.delta,
        candidate: evaluate(timeScene, {
          mValues: { speed_delta_urban: entry.delta },
        }).command.candidateRouteId,
      })),
      mUnits: Object.fromEntries(
        ROUTE_POLICY_V2_M_KEYS.map((key) => [key, getParameterDefinition(key).unit]),
      ),
      rUnits: Object.fromEntries(
        ROUTE_POLICY_V2_KEYS.map((key) => [key, getParameterDefinition(key).unit]),
      ),
    },
    coefficients = scaleFactors.map((factor) => {
      const weights = evaluate(timeScene, { rValues: scaled(factor) }).command.weights!;
      return {
        factor,
        time: weights.time,
        distance: weights.distance,
        turn: weights.turn,
        signal: weights.signal,
        congestion: weights.congestion,
      };
    }),
    decisions = scenarioRows.flatMap((row) =>
      scaleFactors.map((factor) => evaluate(row.scene, { rValues: scaled(factor) }).command),
    ),
    identicalDecisions = scenarioRows.filter((row) => {
      const candidates = scaleFactors.map(
        (factor) => evaluate(row.scene, { rValues: scaled(factor) }).command.candidateRouteId,
      );
      return candidates.every((candidate) => candidate === candidates[0]);
    }).length,
    nearTieScene: RoutePolicyScene = {
      name: 'aproape egalitate',
      description:
        'probă de sensibilitate: două coridoare identice, cu 12 ms de întârziere de congestie declarată pe primul',
      routes: [{ id: 'route-north', congestionDelayS: 0.012 }, { id: 'route-south' }],
      currentRouteId: 'route-north',
      waitingSinceTick: scenario.tick,
    },
    probe = evaluate(nearTieScene, {}).command,
    scaledProbe = evaluate(nearTieScene, { rValues: scaled(10) }).command,
    northAlternative = routeAlternative({ id: 'route-north', congestionDelayS: 0.012 }),
    southAlternative = routeAlternative({ id: 'route-south' }),
    naiveEpsilon = 0.01,
    rawImprovement =
      rawScore(northAlternative, defaultRoutePolicyValues) -
      rawScore(southAlternative, defaultRoutePolicyValues),
    scaledWeights = Object.fromEntries(
      Object.entries(defaultRoutePolicyValues).map(([key, value]) => [key, value * 10]),
    ),
    scaledRawImprovement =
      rawScore(northAlternative, scaledWeights) - rawScore(southAlternative, scaledWeights),
    normalization: RoutePolicyNormalization = {
      scaleFactors,
      coefficients,
      comparedDecisions: decisions.length,
      identicalDecisions,
      nearTie: {
        congestionDifferenceS: 0.012,
        rawImprovement: round(rawImprovement, 9),
        scaledRawImprovement: round(scaledRawImprovement, 9),
        naiveEpsilon,
        naiveBase: rawImprovement > naiveEpsilon ? 'SWITCH' : 'KEEP',
        naiveScaled: scaledRawImprovement > naiveEpsilon ? 'SWITCH' : 'KEEP',
        policyBase: probe.candidateRouteId,
        policyScaled: scaledProbe.candidateRouteId,
        policyDecisionBase: probe.reroute.decision,
        policyDecisionScaled: scaledProbe.reroute.decision,
      },
    };
  const fingerprint = () =>
      JSON.stringify(
        scenarioRows.flatMap((row) => {
          const [low, high] = ranges[row.key];
          return [
            evaluate(row.scene, { rValues: { [row.key]: low } }).command,
            evaluate(row.scene, { rValues: { [row.key]: high } }).command,
          ];
        }),
      ),
    determinismDigest = digest(fingerprint()),
    repeatedDigest = digest(fingerprint()),
    manual = evaluate(timeScene, { authority: 'MANUAL' }).command,
    foreign = evaluate(timeScene, {
      observation: { ...evaluate(timeScene).input.observation, tick: scenario.tick + 1 },
    }).command,
    noAlternatives = evaluate({ ...timeScene, routes: [] }).command,
    duplicate = evaluate({
      ...timeScene,
      routes: [{ id: 'route-short' }, { id: 'route-short' }],
    }).command,
    missingProfile = evaluate(timeScene, { profile: null }).command,
    foreignProfile = (() => {
      try {
        evaluate(timeScene, { profile: { ...evaluate(timeScene).profile } });
        return 'ADMITTED';
      } catch {
        return 'REFUSED';
      }
    })(),
    futureWait = (() => {
      try {
        evaluate({ ...patienceRow.scene, waitingSinceTick: scenario.tick + 1 });
        return 'ADMITTED';
      } catch {
        return 'REFUSED';
      }
    })(),
    checks: readonly RoutePolicyCheck[] = [
      check(
        'catalog',
        parameters.length === 8 &&
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
        parameters.every((entry) => entry.unit === expectedUnits[entry.key as RoutePolicyV2Key]),
        parameters.map((entry) => `${entry.key} ${entry.unit}`).join(', '),
      ),
      check(
        'effects',
        effects.length === 8 && effects.every((entry) => entry.difference !== 0),
        effects
          .map(
            (entry) =>
              `${entry.key} ${entry.lowOutcome.toFixed(3)} -> ${entry.highOutcome.toFixed(3)}`,
          )
          .join('; '),
      ),
      check(
        'separation',
        separation.length === 56 && couplings.length === 2,
        `${separation.length - couplings.length}/${separation.length} perechi inerte, ${couplings.length} cuplaje (${couplings
          .map((entry) => `${entry.key} în ${entry.scenario}`)
          .join(', ')})`,
      ),
      check(
        'normalization',
        coefficients.every(
          (entry) =>
            entry.time === coefficients[0].time &&
            entry.distance === coefficients[0].distance &&
            entry.turn === coefficients[0].turn &&
            entry.signal === coefficients[0].signal &&
            entry.congestion === coefficients[0].congestion,
        ) &&
          Math.abs(
            coefficients[0].time +
              coefficients[0].distance +
              coefficients[0].turn +
              coefficients[0].signal +
              coefficients[0].congestion -
              1,
          ) < 1e-9,
        `coeficienți identici pe factorii ${scaleFactors.join('/')} (×10 dă exact aceiași coeficienți); suma ${compatibility.shareSum}`,
      ),
      check(
        'scale-invariance',
        identicalDecisions === scenarioRows.length,
        `${identicalDecisions}/${scenarioRows.length} scenarii aleg aceeași rută la toți factorii ${scaleFactors.join('/')} (${decisions.length} decizii)`,
      ),
      check(
        'scale-teeth',
        normalization.nearTie.naiveBase !== normalization.nearTie.naiveScaled &&
          normalization.nearTie.policyBase === normalization.nearTie.policyScaled &&
          normalization.nearTie.policyDecisionBase === normalization.nearTie.policyDecisionScaled,
        `regula naivă (epsilon absolut ${naiveEpsilon}) trece de la ${normalization.nearTie.naiveBase} la ${normalization.nearTie.naiveScaled} la ×10; politica alege ${normalization.nearTie.policyBase} și decide ${normalization.nearTie.policyDecisionBase} la ambele scări`,
      ),
      check(
        'u-turn-forbidden',
        safety[0].difference === 0 &&
          safety[1].difference === 0 &&
          safety[0].lowChoice === 'route-direct' &&
          safety[1].highChoice === 'route-direct',
        `interzis ${safety[0].lowChoice}/${safety[0].highChoice}, nedeclarat ${safety[1].lowChoice}/${safety[1].highChoice}`,
      ),
      check(
        'reverse-floor',
        floorRow.committed &&
          floorRow.durationS === ROUTE_POLICY_V2_LIMITS.minimumReverseRecoveryS &&
          floorRow.floored === true &&
          floorRow.ticks === 150 &&
          Math.abs((floorRow.distanceM ?? 0) - 3) < 1e-9 &&
          topRow.durationS === 8 &&
          topRow.ticks === 480 &&
          Math.abs((topRow.distanceM ?? 0) - 9.6) < 1e-9,
        `0 s -> ${floorRow.durationS} s / ${floorRow.ticks} tick-uri / ${floorRow.distanceM?.toFixed(3)} m; 8 s -> ${topRow.durationS} s / ${topRow.ticks} tick-uri / ${topRow.distanceM?.toFixed(3)} m`,
      ),
      check(
        'reverse-blocked',
        !blockedRow.recovery.committed &&
          blockedRow.action === 'HOLD' &&
          safety[3].difference === 0,
        `fără spațiu liber: acțiune ${blockedRow.action}, durată ${blockedRow.recovery.durationS}`,
      ),
      check(
        'reroute',
        patienceLow.reroute.patienceTicks === 120 &&
          patienceHigh.reroute.patienceTicks === 7200 &&
          patienceLow.reroute.decision === 'WAIT' &&
          patienceHigh.reroute.decision === 'WAIT' &&
          patienceElapsed.reroute.decision === 'COMMIT' &&
          forcedReroute.reroute.decision === 'FORCED' &&
          firstDecision.reroute.decision === 'COMMIT' &&
          keptRoute.reroute.decision === 'KEPT',
        `răbdare 2 s -> ${patienceLow.reroute.patienceTicks} tick-uri (rămân ${patienceLow.reroute.remainingTicks}), 120 s -> ${patienceHigh.reroute.patienceTicks} tick-uri (rămân ${patienceHigh.reroute.remainingTicks}); la 200 de tick-uri scurse: ${patienceElapsed.reroute.decision}; rută indisponibilă: ${forcedReroute.reroute.decision}; rută curentă optimă: ${keptRoute.reroute.decision}`,
      ),
      check(
        'm-compatible',
        compatibility.mStyleTimes
          .filter((entry) => entry.delta === 0)
          .every(
            (entry) =>
              Math.abs(entry.deliveredTravelTimeS - entry.styleTimeS) < 1e-6 &&
              entry.deliveredTravelTimeS ===
                compatibility.mStyleTimes.find(
                  (other) => other.route === entry.route && other.delta !== 0,
                )?.deliveredTravelTimeS,
          ) &&
          compatibility.mStyleTimes.some(
            (entry) => entry.delta !== 0 && entry.styleTimeS < entry.deliveredTravelTimeS,
          ) &&
          compatibility.mUnits.speed_delta_urban === 'm/s' &&
          compatibility.mUnits.speed_delta_residential === 'm/s',
        `timp livrat neschimbat de M; timp de stil ${compatibility.mStyleTimes
          .map((entry) => `${entry.route}@${entry.delta}=${entry.styleTimeS}`)
          .join(', ')}; unități M ${Object.values(compatibility.mUnits).join('/')}`,
      ),
      check(
        'planner-identity',
        compatibility.identityRoutes === compatibility.routes.length,
        `${compatibility.identityRoutes}/${compatibility.routes.length} rute respectă identitatea 041 (cost − timp de bandă = 0,5 s × legături)`,
      ),
      check('determinism', determinismDigest === repeatedDigest, `digest ${determinismDigest}`),
      check(
        'admission',
        manual.reason === 'NO_AUTO_AUTHORITY' &&
          manual.action === 'UNAVAILABLE' &&
          foreign.reason === 'FOREIGN_OR_STALE_OBSERVATION' &&
          noAlternatives.reason === 'NO_ALTERNATIVES' &&
          duplicate.reason === 'DUPLICATE_ALTERNATIVE' &&
          missingProfile.reason === 'MISSING_PROFILE' &&
          foreignProfile === 'REFUSED' &&
          futureWait === 'REFUSED',
        `manual ${manual.reason}, observație veche ${foreign.reason}, fără alternative ${noAlternatives.reason}, duplicate ${duplicate.reason}, profil lipsă ${missingProfile.reason}, token străin ${foreignProfile}, așteptare în viitor ${futureWait}`,
      ),
    ];
  const passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '181-route-policy-v2',
    parameters,
    scenarios: scenarioRows.map((row) => ({ name: row.name, scenario: row.scene.description })),
    effects,
    separation,
    couplings,
    safety,
    compatibility,
    normalization,
    determinism: {
      decisions: scenarioRows.length * 2,
      digest: determinismDigest,
      repeatedDigest,
    },
    checks,
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}

export function routePolicyReportMarkdown(report: RoutePolicyReport): string {
  const separationRows = (entries: readonly RoutePolicyEffect[]) =>
      entries
        .map(
          (entry) =>
            `| \`${entry.key}\` | ${entry.scenario} | ${entry.lowValue} | ${entry.lowOutcome.toFixed(3)} (${entry.lowChoice ?? '—'}) | ${entry.highValue} | ${entry.highOutcome.toFixed(3)} (${entry.highChoice ?? '—'}) | ${entry.difference.toFixed(3)} | ${entry.unit} | ${entry.coupling ? '**cuplaj**' : 'inertă'} |`,
        )
        .join('\n'),
    effectRows = (entries: readonly RoutePolicyEffect[]) =>
      entries
        .map(
          (entry) =>
            `| \`${entry.key}\` | ${entry.scenario} | ${entry.lowValue} | ${entry.lowOutcome.toFixed(3)} (${entry.lowChoice ?? '—'}) | ${entry.highValue} | ${entry.highOutcome.toFixed(3)} (${entry.highChoice ?? '—'}) | ${entry.difference.toFixed(3)} | ${entry.unit} |`,
        )
        .join('\n'),
    effectHeader = [
      '| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ],
    separationHeader = [
      '| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Separată |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ];
  return [
    '# 181 — raport politică extinsă pentru trasee și recuperare',
    '',
    'Generat de `scripts/run-v2-route-policy-report.mjs` din contractul `181-route-policy-v2`.',
    'Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei,',
    'peste alternative reale produse de planificatorul livrat 041 (aceeași origine, aceeași destinație).',
    '',
    '## Scenariile',
    '',
    '| Scenariu | Descriere |',
    '| --- | --- |',
    ...report.scenarios.map((entry) => `| ${entry.name} | ${entry.scenario} |`),
    '',
    '## Efectul izolat al fiecărei chei',
    '',
    ...effectHeader,
    effectRows(report.effects),
    '',
    '## Separarea cheilor',
    '',
    'Cheia scenariului rămâne la valoarea implicită din catalog, iar fiecare altă cheie este dusă de la',
    'minim la maxim. 54 de perechi sunt inerte; cele două cuplaje sunt schimbul explicit dintre',
    'preferința de timp și cea de distanță.',
    '',
    ...separationHeader,
    separationRows(report.separation),
    '',
    '## Siguranță: interdicția de întoarcere în U și minimul de recuperare',
    '',
    ...effectHeader,
    effectRows(report.safety),
    '',
    `- Podeaua de recuperare este **${ROUTE_POLICY_V2_LIMITS.minimumReverseRecoveryS} s** (150 de tick-uri, 3 m la ${ROUTE_POLICY_V2_LIMITS.reverseSpeedMps} m/s): niciun minim de catalog nu permite o recuperare instantanee.`,
    '- O întoarcere în U interzisă sau nedeclarată nu este admisă la nicio valoare a cheii; un spațiu din spate nedeclarat liber ține manevra.',
    '',
    '## Normalizarea ponderilor și invarianța la scalare',
    '',
    `- Coeficienții sunt cote dintr-un buget comun, cuantizate la 1e-12; suma este ${report.compatibility.shareSum}.`,
    `- Factori de scară aplicați tuturor celor cinci ponderi: ${report.normalization.scaleFactors.join(', ')}.`,
    '',
    '| Factor | timp | distanță | viraj | semafor | congestie |',
    '| ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.normalization.coefficients.map(
      (entry) =>
        `| ${entry.factor} | ${entry.time} | ${entry.distance} | ${entry.turn} | ${entry.signal} | ${entry.congestion} |`,
    ),
    '',
    `- Decizii comparate: **${report.normalization.comparedDecisions}**, cu alegere identică: **${report.normalization.identicalDecisions} scenarii din ${report.scenarios.length}**.`,
    `- Probă de aproape-egalitate (${report.normalization.nearTie.congestionDifferenceS} s diferență de congestie):`,
    `  îmbunătățirea brută este ${report.normalization.nearTie.rawImprovement} la scara de bază și`,
    `  ${report.normalization.nearTie.scaledRawImprovement} la ×10; regula naivă cu epsilon absolut`,
    `  ${report.normalization.nearTie.naiveEpsilon} dă ${report.normalization.nearTie.naiveBase} / ${report.normalization.nearTie.naiveScaled} (se schimbă),`,
    `  iar politica alege ${report.normalization.nearTie.policyBase} / ${report.normalization.nearTie.policyScaled} și decide`,
    `  ${report.normalization.nearTie.policyDecisionBase} / ${report.normalization.nearTie.policyDecisionScaled} (nu se schimbă).`,
    '',
    '## Compatibilitate cu cheile M',
    '',
    '| Rută | Lungime (m) | Timp livrat (s) | Viteză liberă (m/s) | Viraje | Semafoare | Cost 041 (s) | Penalizări 041 (s) | Benzi |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.compatibility.routes.map(
      (entry) =>
        `| ${entry.id} | ${entry.lengthM} | ${entry.travelTimeS} | ${entry.freeFlowSpeedMps} | ${entry.derivedTurns} | ${entry.signals} | ${entry.costSeconds} | ${entry.penaltySeconds} | ${entry.pathLanes} |`,
    ),
    '',
    ...report.compatibility.mStyleTimes.map(
      (entry) =>
        `- \`${entry.route}\` (${entry.roadClass}) cu delta ${entry.delta} m/s: timp livrat ${entry.deliveredTravelTimeS} s, timp de stil ${entry.styleTimeS} s.`,
    ),
    `- Alegerea pe perechea timp/distanță urmează delta M: ${report.compatibility.mChoice
      .map((entry) => `${entry.delta} m/s -> ${entry.candidate ?? '—'}`)
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
    `- ${report.determinism.decisions} decizii: \`${report.determinism.digest}\`.`,
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
