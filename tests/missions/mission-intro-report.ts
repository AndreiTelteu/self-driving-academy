import { TUTORIAL_VERSION, createTutorial, tutorialStepIds } from '../../src/missions';
import type { Tutorial } from '../../src/missions';
import { TUTORIAL_PANEL_VERSION, projectTutorialPanel } from '../../src/ui';
import type { TutorialPanelSnapshot } from '../../src/ui';
import {
  TUTORIAL_CIVIL,
  TUTORIAL_CONTEXT,
  TUTORIAL_OTHER_TAXI,
  TUTORIAL_RIDE,
  TUTORIAL_TAXI,
  control,
  createTutorialFixture,
  playFullTutorial,
  selection,
} from './tutorial-fixture';
import { MISSION_WORLD_EPOCH, dropoff, pickup } from './mission-fixture';

export interface MissionIntroCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface MissionIntroReport {
  readonly version: typeof TUTORIAL_VERSION;
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly steps: readonly {
    readonly stepId: string;
    readonly order: number;
    readonly requirement: string;
    readonly mode: string | null;
    readonly title: string;
  }[];
  readonly playthrough: Readonly<{
    steps: readonly string[];
    state: string;
    completedBy: string | null;
    completedTick: number | null;
    skippedSteps: number;
    blockedSelections: 0;
    learningJobs: 0;
    profileVersions: 0;
    learningActivationsObserved: number;
  }>;
  readonly skipResume: Readonly<{
    afterStepSkip: readonly string[];
    skippedSteps: number;
    stateAfterSkipAll: string;
    completedBy: string | null;
    pausedState: string;
    ignoredWhilePaused: string | null;
    resumedStepIndex: number;
    resumedStatus: string;
  }>;
  readonly learning: Readonly<{
    refusedEligibleLearning: boolean;
    refusedNullEligibility: boolean;
    refusedLearning: number;
    stepIndexAfterRefusal: number;
    learningJobs: 0;
    profileVersions: 0;
  }>;
  readonly taxiAccess: Readonly<{
    alwaysAllowed: boolean;
    blockedSelections: 0;
    otherTaxiContinue: string | null;
    civilSelection: string | null;
  }>;
  readonly ride: Readonly<{
    foreignDropoff: string | null;
    dropoffWithoutPickup: string | null;
    wrongRide: string | null;
    completedByDropoff: boolean;
  }>;
  readonly bus: Readonly<{
    attachedCompletion: boolean;
    activationsObserved: number;
    foreignWorldRefused: boolean;
  }>;
  readonly ui: Readonly<{
    version: typeof TUTORIAL_PANEL_VERSION;
    activeProgress: string;
    activeButtons: readonly string[];
    completedProgress: string;
    completedButtons: readonly string[];
    keyboardPaths: readonly string[];
    globalListeners: number;
  }>;
  readonly checks: readonly MissionIntroCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  checks: MissionIntroCheck[],
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): void {
  checks.push(
    Object.freeze({
      name,
      expected,
      actual,
      pass: JSON.stringify(expected) === JSON.stringify(actual),
      detail,
    }),
  );
}

function throwsWith(action: () => unknown, pattern: RegExp): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && pattern.test(error.message);
  }
}

function started(): Tutorial {
  const tutorial = createTutorial({ context: TUTORIAL_CONTEXT });
  tutorial.start({ tick: 0 });
  return tutorial;
}

function activeSnapshot(tutorial: Tutorial): TutorialPanelSnapshot {
  const instance = tutorial.instance()!;
  const complete = instance.state === 'COMPLETED';
  const step = complete ? null : instance.steps[instance.stepIndex]!;
  const definition =
    step === null
      ? tutorial.steps()[tutorial.steps().length - 1]!
      : tutorial.steps()[step.order - 1]!;
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'session-117-report',
    worldEpoch: 1,
    version: TUTORIAL_PANEL_VERSION,
    tick: instance.updatedTick,
    state: instance.state,
    stepId: complete ? null : step!.stepId,
    stepIndex: instance.stepIndex,
    stepCount: instance.steps.length,
    title: definition.title,
    instruction: definition.instruction,
    taxiId: instance.taxiId,
  };
}

export function runMissionIntroReport(): MissionIntroReport {
  const checks: MissionIntroCheck[] = [];
  const steps = createTutorial().steps();

  check(
    checks,
    'step-count-and-order',
    [...tutorialStepIds],
    steps.map((step) => step.stepId),
    'Fixed authored path; no dynamic step can be added at runtime.',
  );
  check(
    checks,
    'step-orders',
    [1, 2, 3, 4, 5],
    steps.map((step) => step.order),
    'The order is authored, not derived from a clock or a frame.',
  );

  const full = createTutorialFixture();
  const run = playFullTutorial(full.tutorial);
  const instance = full.tutorial.instance()!;
  check(
    checks,
    'playthrough-statuses',
    6,
    run.steps.length,
    'Selection, M, L, M, pickup, dropoff.',
  );
  check(
    checks,
    'playthrough-completed',
    true,
    run.completed,
    'A full path completes the tutorial.',
  );
  check(
    checks,
    'playthrough-state',
    'COMPLETED',
    instance.state,
    'The terminal state is explicit.',
  );
  check(checks, 'playthrough-completed-by', 'PLAY', instance.completedBy, 'Completed by playing.');
  check(
    checks,
    'playthrough-steps-satisfied',
    ['SATISFIED', 'SATISFIED', 'SATISFIED', 'SATISFIED', 'SATISFIED'],
    instance.steps.map((step) => step.state),
    'Every step was satisfied by a real observation.',
  );
  check(
    checks,
    'learning-jobs',
    0,
    run.study.learningJobs,
    'The tutorial creates no learning job.',
  );
  check(
    checks,
    'profile-versions',
    0,
    run.study.profileVersions,
    'The tutorial publishes no profile version.',
  );
  check(
    checks,
    'activations-observed',
    0,
    run.study.learningActivationsObserved,
    'A clean tutorial observes no PROFILE_ACTIVATE.',
  );
  check(
    checks,
    'blocked-selections',
    0,
    run.study.blockedSelections,
    'Selections are never blocked by tutorial progress.',
  );

  const learning = started();
  learning.observeSelection(selection(1));
  const refusedEligible = throwsWith(
    () => learning.observeControl(control(2, 'LEARNING', true)),
    /Tutorial LEARNING must stay ineligible/,
  );
  const refusedNull = throwsWith(
    () => learning.observeControl(control(2, 'LEARNING', null)),
    /Tutorial LEARNING must stay ineligible/,
  );
  check(checks, 'eligible-learning-refused', true, refusedEligible, 'Eligible LEARNING is a bug.');
  check(
    checks,
    'null-eligibility-refused',
    true,
    refusedNull,
    'Unknown eligibility is refused too.',
  );
  check(
    checks,
    'refused-learning-counter',
    2,
    learning.stats().refusedLearning,
    'Bounded counter.',
  );
  check(
    checks,
    'refusal-keeps-step',
    1,
    learning.instance()!.stepIndex,
    'A refusal cannot advance the tutorial.',
  );
  check(
    checks,
    'accepted-after-refusal',
    'ACCEPTED',
    learning.observeControl(control(3, 'MANUAL')).status,
    'The ineligible path still works after the refusals.',
  );

  const access = started();
  access.observeSelection(selection(1, TUTORIAL_TAXI));
  access.observeControl(control(2, 'MANUAL'));
  const otherTaxi = access.observeSelection(selection(3, TUTORIAL_OTHER_TAXI));
  const stepAfterSwitch = access.instance()!.stepIndex;
  const firstStepAfterSwitch = access.instance()!.steps[0]!.state;
  const otherAllowed = access.canSelectTaxi(TUTORIAL_OTHER_TAXI).allowed;
  const otherContinue = access.observeControl(control(4, 'LEARNING', false, TUTORIAL_OTHER_TAXI));
  check(checks, 'other-taxi-allowed', true, otherAllowed, 'Access is never gated.');
  check(
    checks,
    'other-taxi-does-not-reset',
    [2, 'SATISFIED'],
    [stepAfterSwitch, firstStepAfterSwitch],
    'Progress survives a taxi change.',
  );
  check(
    checks,
    'other-taxi-observation',
    'WRONG_STEP',
    otherTaxi.reason,
    'A selection in a mode step is ignored, not rejected.',
  );
  check(checks, 'other-taxi-continues', 'ACCEPTED', otherContinue.status, 'New taxi continues.');
  check(checks, 'blocked-selections-counter', 0, access.stats().blockedSelections, 'Always zero.');

  const civil = started();
  const civilResult = civil.observeSelection(selection(1, TUTORIAL_CIVIL, 'CIVIL'));
  check(checks, 'civil-ignored', 'NOT_A_TAXI', civilResult.reason, 'A civil is not a taxi.');
  check(checks, 'civil-does-not-advance', 0, civil.instance()!.stepIndex, 'No step is satisfied.');

  const skip = started();
  skip.observeSelection(selection(1));
  skip.skip({ tick: 2, stepId: 'MODE_MANUAL' });
  const afterStepSkip = skip.instance()!;
  const afterLearning = skip.observeControl(control(3, 'LEARNING', false)).status;
  skip.observeControl(control(4, 'AUTO'));
  skip.skip({ tick: 5, stepId: 'COMPLETE_RIDE' });
  const skippedAll = started();
  skippedAll.observeSelection(selection(1));
  skippedAll.skip({ tick: 2, stepId: 'ALL' });
  check(
    checks,
    'skip-step-continues',
    [2, 'SKIPPED', 'ACCEPTED'],
    [afterStepSkip.stepIndex, afterStepSkip.steps[1]!.state, afterLearning],
    'A skipped step advances to the next one.',
  );
  check(
    checks,
    'skip-all-completes',
    ['COMPLETED', 'SKIP', 4],
    [
      skippedAll.instance()!.state,
      skippedAll.instance()!.completedBy,
      skippedAll.instance()!.skippedSteps,
    ],
    'Skip-all is explicit and counted.',
  );

  const pause = started();
  pause.observeSelection(selection(1));
  pause.observeControl(control(2, 'MANUAL'));
  const paused = pause.pause({ tick: 3 });
  const ignored = pause.observeControl(control(4, 'LEARNING', false));
  const resumed = pause.resume({ tick: 5 });
  const resumedStatus = pause.observeControl(control(6, 'LEARNING', false)).status;
  check(checks, 'pause-state', 'PAUSED', paused.state, 'Pause is explicit.');
  check(
    checks,
    'paused-ignores-input',
    'TUTORIAL_PAUSED',
    ignored.reason,
    'No progress while paused.',
  );
  check(
    checks,
    'resume-retains-step',
    [2, 'ACTIVE', 'ACCEPTED'],
    [resumed.stepIndex, resumed.state, resumedStatus],
    'Resume continues at the retained step.',
  );

  const ride = started();
  ride.observeSelection(selection(1));
  ride.observeControl(control(2, 'MANUAL'));
  ride.observeControl(control(3, 'LEARNING', false));
  ride.observeControl(control(4, 'AUTO'));
  const foreign = ride.ingest(dropoff('dropoff:foreign', 10, TUTORIAL_OTHER_TAXI, TUTORIAL_RIDE));
  const noPickup = ride.ingest(dropoff('dropoff:no-pickup', 11, TUTORIAL_TAXI, TUTORIAL_RIDE));
  ride.ingest(pickup('pickup:ok', 12, TUTORIAL_TAXI, TUTORIAL_RIDE));
  const wrongRide = ride.ingest(dropoff('dropoff:other', 13, TUTORIAL_TAXI, 'ride:other'));
  const done = ride.ingest(dropoff('dropoff:ok', 14, TUTORIAL_TAXI, TUTORIAL_RIDE));
  check(
    checks,
    'foreign-dropoff',
    'FOREIGN_VEHICLE',
    foreign.reason,
    'Other taxis are not counted.',
  );
  check(
    checks,
    'dropoff-without-pickup',
    'RIDE_NOT_BOARDED',
    noPickup.reason,
    'No passenger, no ride.',
  );
  check(checks, 'wrong-ride', 'RIDE_NOT_BOARDED', wrongRide.reason, 'The ride id must match.');
  check(
    checks,
    'dropoff-completes',
    'COMPLETED',
    done.status,
    'A real pickup plus dropoff completes.',
  );

  const busFixture = createTutorialFixture();
  const stop = busFixture.tutorial.attachBus(busFixture.bus);
  busFixture.tutorial.start({ tick: 0 });
  busFixture.tutorial.observeSelection(selection(1, TUTORIAL_TAXI));
  busFixture.tutorial.observeControl(control(2, 'MANUAL'));
  busFixture.tutorial.observeControl(control(3, 'LEARNING', false));
  busFixture.tutorial.observeControl(control(4, 'AUTO'));
  busFixture.bus.publish(pickup('pickup:bus', 11, TUTORIAL_TAXI, TUTORIAL_RIDE));
  busFixture.bus.publish(dropoff('dropoff:bus', 12, TUTORIAL_TAXI, TUTORIAL_RIDE));
  stop();
  const foreignWorld = (() => {
    try {
      createTutorial({ context: TUTORIAL_CONTEXT }).attachBus({
        publish: () => ({ status: 'delivered', failures: [] }),
        subscribe: () => () => undefined,
        getStats: () => ({ sessionId: 'session-other', worldEpoch: MISSION_WORLD_EPOCH }),
      } as unknown as Parameters<Tutorial['attachBus']>[0]);
      return false;
    } catch (error) {
      return (
        error instanceof Error &&
        /Foreign tutorial bus world|Foreign tutorial event bus world/.test(error.message)
      );
    }
  })();
  check(
    checks,
    'bus-completes',
    'COMPLETED',
    busFixture.tutorial.instance()!.state,
    'The real 007 bus drives the ride steps.',
  );
  check(
    checks,
    'bus-foreign-world-refused',
    true,
    foreignWorld,
    'A bus from another session cannot feed the tutorial.',
  );

  const uiSource = started();
  const activeProjection = projectTutorialPanel(activeSnapshot(uiSource));
  const completedTutorial = createTutorialFixture();
  playFullTutorial(completedTutorial.tutorial);
  const completedProjection = projectTutorialPanel(activeSnapshot(completedTutorial.tutorial));
  const enabled = (buttons: typeof activeProjection.buttons): readonly string[] =>
    buttons.filter((button) => !button.disabled).map((button) => button.action);
  check(
    checks,
    'ui-active-buttons',
    ['PAUSE', 'SKIP_STEP', 'SKIP_ALL'],
    enabled(activeProjection.buttons),
    'Mouse and keyboard share the native buttons.',
  );
  check(checks, 'ui-active-progress', 'Pasul 1 din 5', activeProjection.progress, 'Progress text.');
  check(
    checks,
    'ui-completed-progress',
    'Tutorial finalizat',
    completedProjection.progress,
    'Done.',
  );
  check(
    checks,
    'ui-completed-buttons',
    [],
    enabled(completedProjection.buttons),
    'A completed tutorial disables every action.',
  );
  check(
    checks,
    'ui-paused-buttons',
    ['RESUME'],
    enabled(
      projectTutorialPanel({
        ...activeSnapshot(uiSource),
        state: 'PAUSED',
      }).buttons,
    ),
    'Paused shows only Resume.',
  );
  check(
    checks,
    'ui-keyboard-paths',
    ['Enter Space', 'Enter Space', 'Enter Space', 'Enter Space'],
    activeProjection.buttons.map((button) => button.ariaKeyshortcuts),
    'Native button activation is documented for every action.',
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: TUTORIAL_VERSION,
    generatedBy: 'scripts/run-mission-intro-report.mjs',
    oracleRule:
      'A step advances only from a validated 067/068 observation or a real 007 event; LEARNING must be ineligible, and no taxi access is ever gated.',
    steps: Object.freeze(
      steps.map((step) =>
        Object.freeze({
          stepId: step.stepId,
          order: step.order,
          requirement: step.requirement,
          mode: step.mode,
          title: step.title,
        }),
      ),
    ),
    playthrough: Object.freeze({
      steps: run.steps,
      state: instance.state,
      completedBy: instance.completedBy,
      completedTick: instance.completedTick,
      skippedSteps: instance.skippedSteps,
      blockedSelections: run.study.blockedSelections,
      learningJobs: run.study.learningJobs,
      profileVersions: run.study.profileVersions,
      learningActivationsObserved: run.study.learningActivationsObserved,
    }),
    skipResume: Object.freeze({
      afterStepSkip: afterStepSkip.steps.map((step) => step.state),
      skippedSteps: skippedAll.instance()!.skippedSteps,
      stateAfterSkipAll: skippedAll.instance()!.state,
      completedBy: skippedAll.instance()!.completedBy,
      pausedState: paused.state,
      ignoredWhilePaused: ignored.reason,
      resumedStepIndex: resumed.stepIndex,
      resumedStatus,
    }),
    learning: Object.freeze({
      refusedEligibleLearning: refusedEligible,
      refusedNullEligibility: refusedNull,
      refusedLearning: learning.stats().refusedLearning,
      stepIndexAfterRefusal: learning.instance()!.stepIndex,
      learningJobs: learning.stats().learningJobs,
      profileVersions: learning.stats().profileVersions,
    }),
    taxiAccess: Object.freeze({
      alwaysAllowed: otherAllowed,
      blockedSelections: access.stats().blockedSelections,
      otherTaxiContinue: otherContinue.status,
      civilSelection: civilResult.reason,
    }),
    ride: Object.freeze({
      foreignDropoff: foreign.reason,
      dropoffWithoutPickup: noPickup.reason,
      wrongRide: wrongRide.reason,
      completedByDropoff: done.status === 'COMPLETED',
    }),
    bus: Object.freeze({
      attachedCompletion: busFixture.tutorial.instance()!.state === 'COMPLETED',
      activationsObserved: busFixture.tutorial.stats().learningActivationsObserved,
      foreignWorldRefused: foreignWorld,
    }),
    ui: Object.freeze({
      version: TUTORIAL_PANEL_VERSION,
      activeProgress: activeProjection.progress,
      activeButtons: enabled(activeProjection.buttons),
      completedProgress: completedProjection.progress,
      completedButtons: enabled(completedProjection.buttons),
      keyboardPaths: activeProjection.buttons.map((button) => button.ariaKeyshortcuts),
      globalListeners: 0 as number,
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}
