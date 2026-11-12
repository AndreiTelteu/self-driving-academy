import {
  evaluateSignalPolicy,
  projectSignalProfile,
  signalBehaviorFacts,
  signalOpportunityKey,
} from '../../src/autonomy';
import type { SignalPolicyDecision, SignalPolicyObservation } from '../../src/autonomy';
import { getParameterDefinition } from '../../src/profiles';
import { autoScenarioProfile, baseFacts } from '../autonomy/auto-scenarios-support';
import {
  SCENARIO_SUITE_SEED,
  absoluteTolerance,
  checkExact,
  checkNumber,
  checkTrue,
  scenarioOutcome,
} from './scenario-suite-support';
import type { ScenarioCheck, ScenarioOutcome } from './scenario-suite-support';

/**
 * Autonomy family: the 050 signal policy drives a real decision from an authored observation.
 *
 * The scenarios exercise the green start delay and its inclusive boundary, plus the fail-closed
 * path of a stale observation. The red/green stop-line matrix already lives in the 056 suite and is
 * quoted as reused evidence instead of being duplicated here.
 */

const SESSION_ID = 'session:151-autonomy';
const WORLD_EPOCH = 1;
const VEHICLE_ID = 'taxi:151-autonomy';
const INCARNATION = 1;
const OPPORTUNITY_KEY = signalOpportunityKey({
  sessionId: SESSION_ID,
  worldEpoch: WORLD_EPOCH,
  vehicleId: VEHICLE_ID,
  incarnation: INCARNATION,
  intersectionId: 'intersection:151',
  movementId: 'movement:151',
  phaseStartedTick: 60,
});

const profile = projectSignalProfile(autoScenarioProfile({}, '151-autonomy-v1'));
const greenStartDelayS = getParameterDefinition('green_start_delay').default;
const redStopLineOffsetM = getParameterDefinition('red_stop_line_offset').default;

function observation(
  state: 'RED' | 'YELLOW' | 'GREEN',
  tick: number,
  phaseElapsedS: number,
): SignalPolicyObservation {
  return Object.freeze({
    version: '050-signal-observation-v1' as const,
    units: 'SI' as const,
    tick,
    signalId: 'signal:151',
    intersectionId: 'intersection:151',
    movementId: 'movement:151',
    phaseId: `phase:151:${tick}`,
    state,
    phaseElapsedS,
    distanceToStopLineM: 20,
  });
}

function decide(input: {
  readonly decisionTick: number;
  readonly speedMps: number;
  readonly read: SignalPolicyObservation | null;
}): SignalPolicyDecision {
  return evaluateSignalPolicy({
    sessionId: SESSION_ID,
    worldEpoch: WORLD_EPOCH,
    actor: { id: VEHICLE_ID, incarnation: INCARNATION },
    decisionTick: input.decisionTick,
    speedMps: input.speedMps,
    seed: SCENARIO_SUITE_SEED,
    opportunityKey: OPPORTUNITY_KEY,
    profile,
    observation: input.read,
  });
}

function greenChecks(
  decision: SignalPolicyDecision,
  expected: 'START_DELAY' | 'PROCEED',
): ScenarioCheck[] {
  const startDelay = expected === 'START_DELAY';
  return [
    checkExact(
      'green action',
      expected,
      decision.action,
      startDelay
        ? 'viteza sub 0,1 m/s și faza sub green_start_delay cer întârziere de pornire'
        : 'la borna green_start_delay (strict mai mic) pornirea nu mai este întârziată',
    ),
    checkExact(
      'green reason',
      startDelay ? 'GREEN_START_DELAY' : 'GREEN_RELEASE',
      decision.reason,
      'motivul este cel publicat de contractul 050',
    ),
    checkExact(
      'green stop requested',
      startDelay,
      decision.stopRequested,
      'START_DELAY ține frâna, GREEN_RELEASE o eliberează',
    ),
    checkExact('green state', 'GREEN', decision.signalState, 'starea observată este verde'),
    checkNumber(
      'green start delay echo',
      greenStartDelayS,
      decision.greenStartDelayS ?? Number.NaN,
      absoluteTolerance(1e-12, 's', 'profilul este proiectat din registrul de parametri'),
      'valoarea de profil folosită de politică',
    ),
    checkExact(
      'green reason has no stop-line distance',
      null,
      decision.remainingToStopPointM,
      'calea verde nu raportează distanță rămasă la linia de STOP',
    ),
  ];
}

export function runAutonomyScenarios(): readonly ScenarioOutcome[] {
  const belowDelayS = greenStartDelayS / 2;
  const startDelay = decide({
    decisionTick: 100,
    speedMps: 0,
    read: observation('GREEN', 100, belowDelayS),
  });
  const atDelay = decide({
    decisionTick: 100,
    speedMps: 0,
    read: observation('GREEN', 100, greenStartDelayS),
  });

  const staleTick = 100;
  const decisionTick = 120;
  const staleRead = observation('RED', staleTick, 5);
  const stale = decide({ decisionTick, speedMps: 8, read: staleRead });
  const staleFacts = signalBehaviorFacts(baseFacts(profile.versionId), stale);

  return Object.freeze([
    scenarioOutcome({
      id: 'autonomy-green-start-delay',
      family: 'AUTONOMY',
      polarity: 'POSITIVE',
      title: 'Un taxi oprit la verde așteaptă green_start_delay înainte să pornească',
      contract: '050-signal-policy-v1 + Docs/18 (control)',
      seed: SCENARIO_SUITE_SEED,
      steps: 1,
      input: {
        state: 'GREEN',
        speedMps: 0,
        phaseElapsedS: belowDelayS,
        greenStartDelayS,
        decisionTick: 100,
      },
      expected: {
        action: 'START_DELAY',
        reason: 'GREEN_START_DELAY',
        stopRequested: true,
      },
      actual: {
        action: startDelay.action,
        reason: startDelay.reason,
        stopRequested: startDelay.stopRequested,
      },
      checks: greenChecks(startDelay, 'START_DELAY'),
      note: 'Faza verde este la jumătatea întârzierii configurate, deci pornirea este amânată.',
    }),
    scenarioOutcome({
      id: 'autonomy-green-delay-boundary',
      family: 'AUTONOMY',
      polarity: 'POSITIVE',
      title: 'La borna exactă a întârzierii pornirea este eliberată',
      contract: '050-signal-policy-v1 + Docs/18 (control)',
      seed: SCENARIO_SUITE_SEED,
      steps: 1,
      input: {
        state: 'GREEN',
        speedMps: 0,
        phaseElapsedS: greenStartDelayS,
        greenStartDelayS,
        decisionTick: 100,
      },
      expected: {
        action: 'PROCEED',
        reason: 'GREEN_RELEASE',
        stopRequested: false,
      },
      actual: {
        action: atDelay.action,
        reason: atDelay.reason,
        stopRequested: atDelay.stopRequested,
      },
      checks: greenChecks(atDelay, 'PROCEED'),
      note: 'Contractul compară strict `phaseElapsedS < green_start_delay`, deci borna exactă eliberează.',
    }),
    scenarioOutcome({
      id: 'autonomy-stale-observation',
      family: 'AUTONOMY',
      polarity: 'NEGATIVE',
      title: 'O observație de semafor mai veche de 6 tick-uri este refuzată explicit',
      contract: '050-signal-policy-v1 (fereastră de observație)',
      seed: SCENARIO_SUITE_SEED,
      steps: 1,
      input: {
        state: 'RED',
        observationTick: staleTick,
        decisionTick,
        ageTicks: decisionTick - staleTick,
        speedMps: 8,
      },
      expected: {
        action: 'UNKNOWN',
        reason: 'UNAVAILABLE',
        stopRequested: false,
        sampledUnit: null,
        behaviorFacts: null,
      },
      actual: {
        action: stale.action,
        reason: stale.reason,
        stopRequested: stale.stopRequested,
        sampledUnit: stale.sampledUnit,
        behaviorFacts: staleFacts,
      },
      checks: [
        checkExact(
          'stale action',
          'UNKNOWN',
          stale.action,
          'observația expirată nu produce decizie',
        ),
        checkExact('stale reason', 'UNAVAILABLE', stale.reason, 'motivul refuzului este explicit'),
        checkTrue(
          'stale age exceeds the observed window',
          decisionTick - staleTick > 6,
          decisionTick - staleTick,
          'fereastra publicată este de maximum 6 tick-uri',
        ),
        checkExact(
          'stale sample not drawn',
          null,
          stale.sampledUnit,
          'un refuz nu consumă eșantionul de conformitate',
        ),
        checkExact(
          'stale fact not fabricated',
          null,
          staleFacts,
          'refuzul nu inventează un fapt STOP pentru FSM',
        ),
        checkNumber(
          'red stop-line offset echo',
          redStopLineOffsetM,
          stale.redStopLineOffsetM ?? Number.NaN,
          absoluteTolerance(1e-12, 'm', 'profilul este proiectat din registrul de parametri'),
          'profilul rămâne citibil și când observația este refuzată',
        ),
      ],
      note: 'Nicio decizie de circulație nu este derivată dintr-o observație expirată.',
    }),
  ]);
}
