import { choice, createStableId, requireContract, text, tick } from '../sessions';
import { parseSimulationEvent } from '../simulation';
import type { EventBus, SimulationEvent } from '../simulation';
import { controlModes } from '../vehicles';
import type { ControlMode } from '../vehicles';
import { boundedId, plainFields, requireRequired } from './contracts';

/**
 * 117 control tutorial for the first taxi mission.
 *
 * The tutorial is a mission-like progress contract with one explicit promise: it teaches the
 * controls **without producing learning**. It owns no clock, DOM, renderer, profile store, learning
 * job or profile version. It advances only from:
 *
 * 1. a real vehicle selection intention observed from 068 (any taxi is accepted, in any step);
 * 2. the accepted 067 control-mode projection (`mode` plus `learningEligible`);
 * 3. validated 007 simulation events for the ride (`PICKUP`/`DROPOFF`).
 *
 * A `LEARNING` observation is only accepted while eligibility is explicitly `false`, so the
 * tutorial cannot silently turn into a demonstration or publish a profile version. Access to every
 * taxi stays open: the tutorial never gates, filters or disables a selection, and `canSelectTaxi`
 * answers `allowed: true` for every identity.
 */
export const TUTORIAL_VERSION = '117-mission-tutorial-v1' as const;
export const TUTORIAL_ID = 'tutorial-first-taxi-controls' as const;
export const TUTORIAL_NAMESPACE = 'tutorial:117' as const;

export const TUTORIAL_LIMITS = Object.freeze({
  version: TUTORIAL_VERSION,
  /** Fixed authored steps; the tutorial cannot grow its own history. */
  steps: 5,
  /** Evidence event ids retained per step. */
  evidencePerStep: 4,
  /** Authored id/label code units. */
  idCodeUnits: 256,
  instanceIdCodeUnits: 512,
});

export const tutorialStepIds = [
  'SELECT_TAXI',
  'MODE_MANUAL',
  'MODE_LEARNING',
  'MODE_AUTO',
  'COMPLETE_RIDE',
] as const;
export type TutorialStepId = (typeof tutorialStepIds)[number];

export const tutorialStates = ['ACTIVE', 'PAUSED', 'COMPLETED'] as const;
export type TutorialState = (typeof tutorialStates)[number];

export const tutorialStepStates = ['PENDING', 'SATISFIED', 'SKIPPED'] as const;
export type TutorialStepState = (typeof tutorialStepStates)[number];

/** Closed vocabulary for an observation that did not advance the tutorial. */
export const tutorialIgnoreReasons = [
  'TUTORIAL_NOT_ACTIVE',
  'TUTORIAL_PAUSED',
  'NOT_A_TAXI',
  'NO_SELECTED_TAXI',
  'FOREIGN_VEHICLE',
  'WRONG_STEP',
  'WRONG_MODE',
  'RIDE_NOT_BOARDED',
  'UNRELATED_EVENT',
] as const;
export type TutorialIgnoreReason = (typeof tutorialIgnoreReasons)[number];

export interface TutorialStepDefinition {
  readonly stepId: TutorialStepId;
  readonly order: number;
  readonly title: string;
  readonly instruction: string;
  readonly requirement: 'SELECTION' | 'CONTROL_MODE' | 'RIDE';
  /** Control mode the step teaches; `null` for selection and ride steps. */
  readonly mode: ControlMode | null;
}

export interface TutorialStepView {
  readonly stepId: TutorialStepId;
  readonly order: number;
  readonly state: TutorialStepState;
  readonly satisfiedTick: number | null;
  readonly evidenceEventIds: readonly string[];
}

export interface TutorialInstance {
  readonly instanceId: string;
  readonly tutorialId: string;
  readonly version: string;
  readonly attempt: 1;
  readonly state: TutorialState;
  /** Index of the current step; equals the step count when the tutorial is complete. */
  readonly stepIndex: number;
  readonly steps: readonly TutorialStepView[];
  readonly startedTick: number;
  readonly updatedTick: number;
  readonly pausedTick: number | null;
  readonly completedTick: number | null;
  /** How the tutorial finished; `null` while it is not complete. */
  readonly completedBy: 'PLAY' | 'SKIP' | null;
  /** Currently selected taxi, or `null` before the first taxi selection. */
  readonly taxiId: string | null;
  /** Boarded ride for the current taxi, or `null` when no passenger is aboard. */
  readonly rideId: string | null;
  readonly skippedSteps: number;
}

export interface TutorialStartResult {
  readonly instance: TutorialInstance;
  readonly duplicate: boolean;
}

export interface TutorialObservation {
  readonly status: 'ACCEPTED' | 'IGNORED' | 'COMPLETED';
  readonly reason: TutorialIgnoreReason | null;
  readonly stepId: TutorialStepId | null;
  readonly instance: TutorialInstance | null;
}

export interface TutorialTaxiAccess {
  readonly vehicleId: string;
  readonly allowed: true;
  readonly reason: 'TUTORIAL_NEVER_GATES_TAXI_ACCESS';
}

export interface TutorialStats {
  readonly version: string;
  readonly namespace: string;
  readonly tutorialId: string;
  readonly state: TutorialState | null;
  readonly stepIndex: number;
  readonly steps: number;
  readonly observations: number;
  readonly accepted: number;
  readonly ignored: number;
  readonly skippedSteps: number;
  /** Selections refused by the tutorial. Structurally always zero: access is never gated. */
  readonly blockedSelections: 0;
  /** Learning jobs created by the tutorial. Structurally always zero. */
  readonly learningJobs: 0;
  /** Profile versions published by the tutorial. Structurally always zero. */
  readonly profileVersions: 0;
  /** `PROFILE_ACTIVATE` events observed while the tutorial was attached; evidence, not progress. */
  readonly learningActivationsObserved: number;
  /** Eligible LEARNING observations refused with a contract error. */
  readonly refusedLearning: number;
  readonly retainedInstances: number;
  readonly disposed: boolean;
}

export interface TutorialOptions {
  readonly namespace?: string;
  readonly context?: unknown;
}

export interface Tutorial {
  readonly tutorialId: string;
  readonly version: string;
  readonly namespace: string;
  steps(): readonly TutorialStepDefinition[];
  start(input: unknown): TutorialStartResult;
  observeSelection(input: unknown): TutorialObservation;
  observeControl(input: unknown): TutorialObservation;
  ingest(value: unknown): TutorialObservation;
  skip(input: unknown): TutorialInstance;
  pause(input: unknown): TutorialInstance;
  resume(input: unknown): TutorialInstance;
  instance(): TutorialInstance | null;
  canSelectTaxi(vehicleId: unknown): TutorialTaxiAccess;
  stats(): TutorialStats;
  attachBus(bus: EventBus): () => void;
  dispose(): void;
}

interface MutableStep {
  readonly definition: TutorialStepDefinition;
  state: TutorialStepState;
  satisfiedTick: number | null;
  readonly evidenceEventIds: string[];
}

interface MutableInstance {
  readonly instanceId: string;
  state: TutorialState;
  stepIndex: number;
  readonly steps: MutableStep[];
  readonly startedTick: number;
  updatedTick: number;
  pausedTick: number | null;
  completedTick: number | null;
  completedBy: 'PLAY' | 'SKIP' | null;
  taxiId: string | null;
  rideId: string | null;
  skippedSteps: number;
}

const stepDefinitions: readonly TutorialStepDefinition[] = Object.freeze([
  Object.freeze({
    stepId: 'SELECT_TAXI' as const,
    order: 1,
    title: 'Alege un taxi',
    instruction:
      'Alege orice taxi din flotă. Toate taxiurile rămân disponibile, indiferent de progresul tutorialului.',
    requirement: 'SELECTION' as const,
    mode: null,
  }),
  Object.freeze({
    stepId: 'MODE_MANUAL' as const,
    order: 2,
    title: 'Preia controlul',
    instruction: 'Apasă M (sau butonul Manual) ca să conduci manual.',
    requirement: 'CONTROL_MODE' as const,
    mode: 'MANUAL' as const,
  }),
  Object.freeze({
    stepId: 'MODE_LEARNING' as const,
    order: 3,
    title: 'Vezi LEARNING fără învățare',
    instruction:
      'Apasă L (sau butonul Learning). În tutorial eligibilitatea este oprită, deci nu se creează job sau versiune de profil.',
    requirement: 'CONTROL_MODE' as const,
    mode: 'LEARNING' as const,
  }),
  Object.freeze({
    stepId: 'MODE_AUTO' as const,
    order: 4,
    title: 'Revino în AUTO',
    instruction: 'Apasă M ca să dai controlul înapoi AI-ului.',
    requirement: 'CONTROL_MODE' as const,
    mode: 'AUTO' as const,
  }),
  Object.freeze({
    stepId: 'COMPLETE_RIDE' as const,
    order: 5,
    title: 'Finalizează o cursă',
    instruction: 'Ia pasagerul și du-l la destinație: cursă completă.',
    requirement: 'RIDE' as const,
    mode: null,
  }),
]);

const vehicleKinds = ['TAXI', 'CIVIL'] as const;

const startFields = ['tick'] as const;
const selectionFields = ['tick', 'vehicleId', 'kind'] as const;
const controlFields = ['tick', 'vehicleId', 'mode', 'learningEligible'] as const;
const skipFields = ['tick', 'stepId'] as const;
const timeFields = ['tick'] as const;
const optionFields = ['namespace', 'context'] as const;
const contextFields = ['sessionId', 'worldEpoch'] as const;

function stepView(step: MutableStep): TutorialStepView {
  return Object.freeze({
    stepId: step.definition.stepId,
    order: step.definition.order,
    state: step.state,
    satisfiedTick: step.satisfiedTick,
    evidenceEventIds: Object.freeze([...step.evidenceEventIds]),
  });
}

function instanceView(instance: MutableInstance): TutorialInstance {
  return Object.freeze({
    instanceId: instance.instanceId,
    tutorialId: TUTORIAL_ID,
    version: TUTORIAL_VERSION,
    attempt: 1 as const,
    state: instance.state,
    stepIndex: instance.stepIndex,
    steps: Object.freeze(instance.steps.map(stepView)),
    startedTick: instance.startedTick,
    updatedTick: instance.updatedTick,
    pausedTick: instance.pausedTick,
    completedTick: instance.completedTick,
    completedBy: instance.completedBy,
    taxiId: instance.taxiId,
    rideId: instance.rideId,
    skippedSteps: instance.skippedSteps,
  });
}

function tutorialInstanceId(namespace: string): string {
  const id = createStableId('mission-tutorial', namespace, [TUTORIAL_ID, 'a0001']);
  requireContract(
    id.length <= TUTORIAL_LIMITS.instanceIdCodeUnits,
    'Tutorial instance identity exceeds the code-unit limit',
  );
  return id;
}

export function createTutorial(options: unknown = {}): Tutorial {
  const option = plainFields(options, optionFields, 'tutorial option');
  const namespace =
    option.namespace === undefined
      ? TUTORIAL_NAMESPACE
      : boundedId(option.namespace, TUTORIAL_LIMITS.idCodeUnits, 'tutorial namespace');
  let expectedContext: { readonly sessionId: string; readonly worldEpoch: number } | null = null;
  if (option.context !== undefined) {
    const data = plainFields(option.context, contextFields, 'tutorial context');
    for (const key of contextFields) requireRequired(data, key, 'tutorial context');
    expectedContext = Object.freeze({
      sessionId: text(data.sessionId),
      worldEpoch: tick(data.worldEpoch),
    });
  }

  let instance: MutableInstance | null = null;
  let lastTick = 0;
  let observations = 0;
  let accepted = 0;
  let ignored = 0;
  let refusedLearning = 0;
  let learningActivationsObserved = 0;
  let unsubscribe: (() => void) | null = null;
  let disposed = false;
  let busy = false;

  const mutate = <T>(operation: () => T): T => {
    requireContract(!busy, 'Tutorial mutation reentrant');
    requireContract(!disposed, 'Tutorial disposed');
    busy = true;
    try {
      return operation();
    } finally {
      busy = false;
    }
  };

  const assertTick = (value: unknown): number => {
    const atTick = tick(value);
    if (atTick < lastTick) throw new RangeError('Stale tutorial tick');
    lastTick = atTick;
    return atTick;
  };

  const currentStep = (): MutableStep | null =>
    instance === null || instance.stepIndex >= instance.steps.length
      ? null
      : instance.steps[instance.stepIndex]!;

  const rememberEvidence = (step: MutableStep, eventId: string): void => {
    if (step.evidenceEventIds.includes(eventId)) return;
    step.evidenceEventIds.push(eventId);
    while (step.evidenceEventIds.length > TUTORIAL_LIMITS.evidencePerStep)
      step.evidenceEventIds.shift();
  };

  const complete = (completedBy: 'PLAY' | 'SKIP', atTick: number): void => {
    const live = instance!;
    live.state = 'COMPLETED';
    live.stepIndex = live.steps.length;
    live.completedBy = completedBy;
    live.completedTick = atTick;
    live.updatedTick = atTick;
    live.pausedTick = null;
    live.rideId = null;
  };

  const advance = (step: MutableStep, atTick: number, evidenceId: string): boolean => {
    const live = instance!;
    requireContract(step.state === 'PENDING', 'Tutorial step already resolved');
    step.state = 'SATISFIED';
    step.satisfiedTick = atTick;
    rememberEvidence(step, evidenceId);
    live.updatedTick = atTick;
    live.stepIndex += 1;
    if (live.stepIndex >= live.steps.length) {
      complete('PLAY', atTick);
      return true;
    }
    return false;
  };

  const ignoredResult = (reason: TutorialIgnoreReason): TutorialObservation => {
    ignored += 1;
    return Object.freeze({
      status: 'IGNORED' as const,
      reason,
      stepId: currentStep()?.definition.stepId ?? null,
      instance: instance === null ? null : instanceView(instance),
    });
  };

  const idleResult = (reason: TutorialIgnoreReason): TutorialObservation => {
    ignored += 1;
    return Object.freeze({
      status: 'IGNORED' as const,
      reason,
      stepId: null,
      instance: null,
    });
  };

  const acceptedResult = (stepId: TutorialStepId, completed: boolean): TutorialObservation => {
    accepted += 1;
    return Object.freeze({
      status: completed ? ('COMPLETED' as const) : ('ACCEPTED' as const),
      reason: null,
      stepId,
      instance: instance === null ? null : instanceView(instance),
    });
  };

  function start(input: unknown): TutorialStartResult {
    return mutate(() => {
      const data = plainFields(input, startFields, 'tutorial start');
      requireRequired(data, 'tick', 'tutorial start');
      const atTick = assertTick(data.tick);
      if (instance !== null) {
        requireContract(instance.state !== 'COMPLETED', 'Tutorial is already complete');
        return Object.freeze({ instance: instanceView(instance), duplicate: true });
      }
      instance = {
        instanceId: tutorialInstanceId(namespace),
        state: 'ACTIVE',
        stepIndex: 0,
        steps: stepDefinitions.map((definition) => ({
          definition,
          state: 'PENDING' as const,
          satisfiedTick: null,
          evidenceEventIds: [],
        })),
        startedTick: atTick,
        updatedTick: atTick,
        pausedTick: null,
        completedTick: null,
        completedBy: null,
        taxiId: null,
        rideId: null,
        skippedSteps: 0,
      };
      return Object.freeze({ instance: instanceView(instance), duplicate: false });
    });
  }

  function observeSelection(input: unknown): TutorialObservation {
    return mutate(() => {
      const data = plainFields(input, selectionFields, 'tutorial selection');
      for (const key of selectionFields) requireRequired(data, key, 'tutorial selection');
      const atTick = assertTick(data.tick);
      const vehicleId = boundedId(data.vehicleId, TUTORIAL_LIMITS.idCodeUnits, 'tutorial vehicle');
      const kind = choice(data.kind, vehicleKinds);
      observations += 1;
      const live = instance;
      if (live === null) return idleResult('TUTORIAL_NOT_ACTIVE');
      if (live.state === 'PAUSED') return ignoredResult('TUTORIAL_PAUSED');
      if (live.state !== 'ACTIVE') return ignoredResult('TUTORIAL_NOT_ACTIVE');
      if (kind === 'CIVIL') return ignoredResult('NOT_A_TAXI');
      const changedTaxi = live.taxiId !== vehicleId;
      live.taxiId = vehicleId;
      if (changedTaxi) live.rideId = null;
      const step = currentStep();
      if (step === null) return ignoredResult('TUTORIAL_NOT_ACTIVE');
      if (step.definition.requirement !== 'SELECTION') return ignoredResult('WRONG_STEP');
      const completed = advance(step, atTick, `selection:${vehicleId}`);
      return acceptedResult(step.definition.stepId, completed);
    });
  }

  function observeControl(input: unknown): TutorialObservation {
    return mutate(() => {
      const data = plainFields(input, controlFields, 'tutorial control');
      for (const key of controlFields) requireRequired(data, key, 'tutorial control');
      const atTick = assertTick(data.tick);
      const vehicleId = boundedId(data.vehicleId, TUTORIAL_LIMITS.idCodeUnits, 'tutorial vehicle');
      const mode = choice(data.mode, controlModes);
      const eligible = data.learningEligible;
      requireContract(
        eligible === null || typeof eligible === 'boolean',
        'Tutorial learning eligibility must be a boolean or null',
      );
      observations += 1;
      // Accidental learning is refused for every step, not only the LEARNING one.
      if (mode === 'LEARNING' && eligible !== false) {
        refusedLearning += 1;
        requireContract(
          false,
          'Tutorial LEARNING must stay ineligible; no job or profile version is allowed',
        );
      }
      if (mode !== 'LEARNING') requireContract(eligible === false, 'Tutorial mode eligibility');
      const live = instance;
      if (live === null) return idleResult('TUTORIAL_NOT_ACTIVE');
      if (live.state === 'PAUSED') return ignoredResult('TUTORIAL_PAUSED');
      if (live.state !== 'ACTIVE') return ignoredResult('TUTORIAL_NOT_ACTIVE');
      if (live.taxiId === null) return ignoredResult('NO_SELECTED_TAXI');
      if (live.taxiId !== vehicleId) return ignoredResult('FOREIGN_VEHICLE');
      const step = currentStep();
      if (step === null) return ignoredResult('TUTORIAL_NOT_ACTIVE');
      if (step.definition.requirement !== 'CONTROL_MODE' || step.definition.mode !== mode)
        return ignoredResult(
          step.definition.requirement === 'CONTROL_MODE' ? 'WRONG_MODE' : 'WRONG_STEP',
        );
      const completed = advance(step, atTick, `mode:${mode}:${vehicleId}`);
      return acceptedResult(step.definition.stepId, completed);
    });
  }

  function ingest(value: unknown): TutorialObservation {
    return mutate(() => {
      const event = parseSimulationEvent(value);
      if (expectedContext !== null)
        requireContract(
          event.sessionId === expectedContext.sessionId &&
            event.worldEpoch === expectedContext.worldEpoch,
          'Foreign tutorial event world',
        );
      const atTick = assertTick(event.tick);
      observations += 1;
      if (event.type === 'PROFILE_ACTIVATE') learningActivationsObserved += 1;
      const live = instance;
      if (live === null) return idleResult('TUTORIAL_NOT_ACTIVE');
      if (live.state === 'PAUSED') return ignoredResult('TUTORIAL_PAUSED');
      if (live.state !== 'ACTIVE') return ignoredResult('TUTORIAL_NOT_ACTIVE');
      if (live.taxiId === null) return ignoredResult('NO_SELECTED_TAXI');
      if (event.type !== 'PICKUP' && event.type !== 'DROPOFF')
        return ignoredResult('UNRELATED_EVENT');
      if (event.payload.vehicleId !== live.taxiId) return ignoredResult('FOREIGN_VEHICLE');
      const step = currentStep();
      if (event.type === 'PICKUP') {
        live.rideId = event.payload.rideId;
        live.updatedTick = atTick;
        return step === null
          ? ignoredResult('TUTORIAL_NOT_ACTIVE')
          : acceptedResult(step.definition.stepId, false);
      }
      if (live.rideId === null || live.rideId !== event.payload.rideId)
        return ignoredResult('RIDE_NOT_BOARDED');
      if (step === null) return ignoredResult('TUTORIAL_NOT_ACTIVE');
      if (step.definition.requirement !== 'RIDE') return ignoredResult('WRONG_STEP');
      const completed = advance(step, atTick, event.eventId);
      return acceptedResult(step.definition.stepId, completed);
    });
  }

  function skip(input: unknown): TutorialInstance {
    return mutate(() => {
      const data = plainFields(input, skipFields, 'tutorial skip');
      for (const key of skipFields) requireRequired(data, key, 'tutorial skip');
      const atTick = assertTick(data.tick);
      const live = instance;
      requireContract(live !== null, 'Tutorial has not started');
      requireContract(live.state === 'ACTIVE', 'Only an active tutorial can skip');
      if (data.stepId === 'ALL') {
        for (let index = live.stepIndex; index < live.steps.length; index += 1) {
          const step = live.steps[index]!;
          step.state = 'SKIPPED';
          step.satisfiedTick = atTick;
          live.skippedSteps += 1;
        }
        complete('SKIP', atTick);
        return instanceView(live);
      }
      const stepId = choice(data.stepId, tutorialStepIds);
      const step = currentStep();
      requireContract(step !== null, 'Tutorial has no current step');
      requireContract(step.definition.stepId === stepId, 'Only the current tutorial step can skip');
      step.state = 'SKIPPED';
      step.satisfiedTick = atTick;
      live.skippedSteps += 1;
      live.updatedTick = atTick;
      live.stepIndex += 1;
      if (live.stepIndex >= live.steps.length) complete('SKIP', atTick);
      return instanceView(live);
    });
  }

  function pause(input: unknown): TutorialInstance {
    return mutate(() => {
      const data = plainFields(input, timeFields, 'tutorial pause');
      requireRequired(data, 'tick', 'tutorial pause');
      const atTick = assertTick(data.tick);
      const live = instance;
      requireContract(live !== null, 'Tutorial has not started');
      requireContract(live.state === 'ACTIVE', 'Only an active tutorial can pause');
      live.state = 'PAUSED';
      live.pausedTick = atTick;
      live.updatedTick = atTick;
      return instanceView(live);
    });
  }

  function resume(input: unknown): TutorialInstance {
    return mutate(() => {
      const data = plainFields(input, timeFields, 'tutorial resume');
      requireRequired(data, 'tick', 'tutorial resume');
      const atTick = assertTick(data.tick);
      const live = instance;
      requireContract(live !== null, 'Tutorial has not started');
      requireContract(live.state === 'PAUSED', 'Only a paused tutorial can resume');
      live.state = 'ACTIVE';
      live.pausedTick = null;
      live.updatedTick = atTick;
      return instanceView(live);
    });
  }

  function stats(): TutorialStats {
    return Object.freeze({
      version: TUTORIAL_VERSION,
      namespace,
      tutorialId: TUTORIAL_ID,
      state: disposed || instance === null ? null : instance.state,
      stepIndex: disposed || instance === null ? 0 : instance.stepIndex,
      steps: TUTORIAL_LIMITS.steps,
      observations: disposed ? 0 : observations,
      accepted: disposed ? 0 : accepted,
      ignored: disposed ? 0 : ignored,
      skippedSteps: disposed || instance === null ? 0 : instance.skippedSteps,
      blockedSelections: 0 as const,
      learningJobs: 0 as const,
      profileVersions: 0 as const,
      learningActivationsObserved: disposed ? 0 : learningActivationsObserved,
      refusedLearning: disposed ? 0 : refusedLearning,
      retainedInstances: disposed || instance === null ? 0 : 1,
      disposed,
    });
  }

  return Object.freeze({
    tutorialId: TUTORIAL_ID,
    version: TUTORIAL_VERSION,
    namespace,
    steps: () => stepDefinitions,
    start,
    observeSelection,
    observeControl,
    ingest,
    skip,
    pause,
    resume,
    instance: () => (disposed || instance === null ? null : instanceView(instance)),
    canSelectTaxi(vehicleId: unknown): TutorialTaxiAccess {
      requireContract(!disposed, 'Tutorial disposed');
      const id = boundedId(vehicleId, TUTORIAL_LIMITS.idCodeUnits, 'tutorial vehicle');
      return Object.freeze({
        vehicleId: id,
        allowed: true as const,
        reason: 'TUTORIAL_NEVER_GATES_TAXI_ACCESS' as const,
      });
    },
    stats,
    attachBus(bus: EventBus): () => void {
      requireContract(!disposed, 'Tutorial disposed');
      requireContract(unsubscribe === null, 'Tutorial is already attached to a bus');
      requireContract(
        typeof bus === 'object' &&
          bus !== null &&
          typeof bus.publish === 'function' &&
          typeof bus.subscribe === 'function' &&
          typeof bus.getStats === 'function',
        'Tutorial requires a real 007 event bus',
      );
      if (expectedContext !== null) {
        const busStats = bus.getStats();
        requireContract(
          busStats.sessionId === expectedContext.sessionId &&
            busStats.worldEpoch === expectedContext.worldEpoch,
          'Foreign tutorial event bus world',
        );
      }
      const stop = bus.subscribe((event: SimulationEvent) => {
        ingest(event);
        return undefined;
      });
      unsubscribe = () => {
        stop();
        unsubscribe = null;
      };
      return unsubscribe;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (unsubscribe !== null) {
        const stop = unsubscribe;
        unsubscribe = null;
        stop();
      }
      instance = null;
    },
  });
}
