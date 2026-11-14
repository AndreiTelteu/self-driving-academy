/**
 * PBI 198 — deterministic evidence suite for the walking/driving segment read model.
 *
 * Every row is produced by the delivered contract itself: the authority transitions fed to it are
 * the exact `InputAuthority` records 195/196/197 produce, and the estimator decision is the 069
 * gate. The suite never writes telemetry and never launches an analysis; it measures the pure read
 * model. The real 069 lifecycle is executed separately as the cross-check of that gate.
 */
import { createHash } from 'node:crypto';
import {
  WALKING_SEGMENTS_CONTRACT_VERSION,
  WALKING_SEGMENTS_POLICY,
  createWalkingSegments,
  type WalkingSegments,
  type WalkingSegmentsStepResult,
  type WalkingSegmentsTarget,
} from '../../src/character';
import { VEHICLE_ENTRY_POLICY } from '../../src/character';
import type { InputAuthority } from '../../src/input';
import { segmentFixture } from '../telemetry/manual-segments-fixture';

export const WALKING_SEGMENTS_REPORT_CONTRACT = WALKING_SEGMENTS_CONTRACT_VERSION;
export const WALKING_SEGMENTS_REPORT_COMMAND = 'npm run walking:segments';

const CHARACTER_ID = 'character:player-character';
const TAXI_A = 'vehicle:taxi-a-198';
const TAXI_B = 'vehicle:taxi-b-198';

export const TARGET: WalkingSegmentsTarget = Object.freeze({
  sessionId: '198-tests',
  worldEpoch: 1,
  playerId: 'player',
  profileId: 'profile',
  baseVersionId: 'style-v1',
  learningEpoch: 1,
  learningEligible: true,
});

const character = (): InputAuthority =>
  Object.freeze({ consumer: 'CHARACTER' as const, characterId: CHARACTER_ID });
const vehicle = (vehicleId: string): InputAuthority =>
  Object.freeze({ consumer: 'VEHICLE' as const, vehicleId });

const authorityLabel = (authority: InputAuthority): string =>
  `${authority.consumer}:${authority.consumer === 'CHARACTER' ? authority.characterId : authority.vehicleId}`;

export interface WalkScenarioRow {
  readonly id: string;
  readonly label: string;
  readonly transitions: string;
  readonly previousMode: 'NONE' | 'MANUAL' | 'LEARNING';
  readonly authorityBefore: string;
  readonly authorityAfter: string;
  readonly closedSegmentId: string | null;
  readonly closedKind: 'MANUAL' | 'LEARNING' | null;
  readonly closeReason: string | null;
  readonly truncatedManeuver: string | null;
  readonly candidates: number;
  readonly candidateSegments: readonly string[];
  readonly openedSegmentId: string | null;
  readonly openedMode: 'MANUAL' | 'LEARNING' | null;
  readonly walkingTicks: number;
  readonly walkingDistanceM: number;
  readonly verdict: 'PASS' | 'FAIL';
  readonly failedChecks: readonly string[];
}

interface Recorder {
  readonly model: WalkingSegments;
  readonly steps: WalkingSegmentsStepResult[];
  tape: unknown[];
  failures: string[];
}

function recorder(target: WalkingSegmentsTarget = TARGET, resume?: unknown): Recorder {
  const rec: Recorder = {
    model: createWalkingSegments({ ownerId: '198', characterId: CHARACTER_ID, target, resume }),
    steps: [],
    tape: [],
    failures: [],
  };
  return rec;
}

function play(rec: Recorder, request: Parameters<WalkingSegments['step']>[0]) {
  const result = rec.model.step(request);
  rec.steps.push(result);
  rec.tape.push(result);
  return result;
}

function expect(rec: Recorder, condition: boolean, check: string) {
  if (!condition) rec.failures.push(check);
}

function lastClosed(rec: Recorder) {
  for (let index = rec.steps.length - 1; index >= 0; index -= 1) {
    const closed = rec.steps[index]!.closed;
    if (closed !== null) return closed;
  }
  return null;
}

function row(
  rec: Recorder,
  input: {
    id: string;
    label: string;
    transitions: string;
    previousMode: WalkScenarioRow['previousMode'];
    authorityBefore: InputAuthority;
    authorityAfter: InputAuthority;
  },
): WalkScenarioRow {
  const closed = lastClosed(rec);
  const opened = rec.steps.at(-1)?.opened ?? null;
  const candidates = rec.steps.flatMap((step) => step.candidates);
  return Object.freeze({
    id: input.id,
    label: input.label,
    transitions: input.transitions,
    previousMode: input.previousMode,
    authorityBefore: authorityLabel(input.authorityBefore),
    authorityAfter: authorityLabel(input.authorityAfter),
    closedSegmentId: closed?.segmentId ?? null,
    closedKind: closed?.kind ?? null,
    closeReason: closed?.closeReason ?? null,
    truncatedManeuver: closed?.truncatedManeuver ?? null,
    candidates: candidates.length,
    candidateSegments: Object.freeze(candidates.map((candidate) => candidate.segmentId)),
    openedSegmentId: opened?.segmentId ?? null,
    openedMode: opened?.kind ?? null,
    walkingTicks: rec.model.getStats().counters.walkingTicks,
    walkingDistanceM: rec.model.getStats().counters.walkingDistanceM,
    verdict: rec.failures.length === 0 ? 'PASS' : 'FAIL',
    failedChecks: Object.freeze([...rec.failures]),
  });
}

/** A long, real-speed walk: 3600 ticks at the 191 walk clip speed (1.3710 m/s ÷ 60 Hz). */
function walkScenario(): WalkScenarioRow {
  const rec = recorder();
  const perTickM = 1.371 / 60;
  let last: WalkingSegmentsStepResult | null = null;
  for (let tick = 1; tick <= 3600; tick += 1)
    last = play(rec, { tick, transition: 'WALK', authority: character(), distanceM: perTickM });
  const stats = rec.model.getStats();
  expect(rec, stats.counters.walkingTicks === 3600, '3600 walking ticks counted');
  expect(
    rec,
    Math.abs(stats.counters.walkingDistanceM - perTickM * 3600) < 1e-9,
    'distance counted',
  );
  expect(rec, stats.counters.closedSegments === 0, 'walking closes no segment');
  expect(rec, stats.counters.candidates === 0, 'walking produces no candidate');
  expect(rec, stats.counters.entries === 0, 'walking opens no segment');
  expect(rec, stats.openSegmentId === null, 'walking has no open segment');
  expect(
    rec,
    last !== null && last.closed === null && last.candidates.length === 0,
    'last step empty',
  );
  // Control: the same model does produce a real segment once authority leaves the body.
  play(rec, {
    tick: 3601,
    transition: 'ENTER',
    authority: vehicle(TAXI_A),
    previousAuthority: character(),
    vehicleId: TAXI_A,
  });
  const entered = play(rec, {
    tick: 3602,
    transition: 'EXIT',
    authority: character(),
    previousAuthority: vehicle(TAXI_A),
    vehicleId: TAXI_A,
  });
  expect(rec, entered.closed !== null, 'control: a real entry and exit close one segment');
  expect(
    rec,
    rec.model.getStats().counters.closedSegments === 1,
    'control: exactly one closed segment',
  );
  return row(rec, {
    id: 'walk-3600',
    label: '3600 tick-uri de mers la viteza reală a clipului walk (1,3710 m/s)',
    transitions: 'WALK × 3600 → ENTER → EXIT',
    previousMode: 'NONE',
    authorityBefore: character(),
    authorityAfter: character(),
  });
}

/** The "however far" bound: 1000 ticks of absurd displacement still produce no driving segment. */
function walkUnboundedScenario(): WalkScenarioRow {
  const rec = recorder();
  for (let tick = 1; tick <= 1000; tick += 1)
    play(rec, { tick, transition: 'WALK', authority: character(), distanceM: 50 });
  const stats = rec.model.getStats();
  expect(rec, stats.counters.walkingDistanceM === 50_000, 'the bound really moved 50 km');
  expect(rec, stats.counters.closedSegments === 0, 'no driving segment at 50 km walked');
  expect(rec, stats.counters.candidates === 0, 'no estimator candidate at 50 km walked');
  return row(rec, {
    id: 'walk-unbounded',
    label: '1000 tick-uri cu 50 m/tick (50 km parcurși): plafonul „oricât"',
    transitions: 'WALK × 1000',
    previousMode: 'NONE',
    authorityBefore: character(),
    authorityAfter: character(),
  });
}

function enterExitScenario(input: {
  id: string;
  label: string;
  mode?: 'MANUAL' | 'LEARNING';
  target?: WalkingSegmentsTarget;
  maneuverState?: 'LANE_CHANGING' | 'TURNING' | null;
  expectedKind: 'MANUAL' | 'LEARNING';
  expectedCandidates: number;
}): WalkScenarioRow {
  const rec = recorder(input.target);
  play(rec, {
    tick: 1,
    transition: 'ENTER',
    authority: vehicle(TAXI_A),
    previousAuthority: character(),
    vehicleId: TAXI_A,
    ...(input.mode === undefined ? {} : { mode: input.mode }),
  });
  const entered = rec.steps[0]!;
  expect(rec, entered.opened?.kind === input.expectedKind, `entry opens ${input.expectedKind}`);
  const closed = play(rec, {
    tick: 2,
    transition: 'EXIT',
    authority: character(),
    previousAuthority: vehicle(TAXI_A),
    vehicleId: TAXI_A,
    ...(input.maneuverState === undefined ? {} : { maneuverState: input.maneuverState }),
  });
  expect(rec, closed.closed?.kind === input.expectedKind, `closed kind is ${input.expectedKind}`);
  expect(
    rec,
    closed.closed?.closeReason === 'RETURN_TO_AUTO',
    'the exit closes with RETURN_TO_AUTO',
  );
  expect(rec, closed.closed?.endTick === 2, 'the segment ends at the exit tick');
  expect(rec, closed.closed?.completeness === 'CLOSED', 'an exit-truncated segment is CLOSED');
  expect(
    rec,
    closed.candidates.length === input.expectedCandidates,
    `${input.expectedCandidates} candidates`,
  );
  expect(
    rec,
    rec.model.getStats().openSegmentId === null,
    'the exit leaves the body with no segment',
  );
  return row(rec, {
    id: input.id,
    label: input.label,
    transitions: `ENTER${input.mode ? ` (${input.mode})` : ''} → EXIT`,
    previousMode: input.expectedKind,
    authorityBefore: vehicle(TAXI_A),
    authorityAfter: character(),
  });
}

function switchScenario(input: {
  id: string;
  label: string;
  firstMode?: 'MANUAL' | 'LEARNING';
  secondMode?: 'MANUAL' | 'LEARNING';
  expectedFirstKind: 'MANUAL' | 'LEARNING';
  expectedSecondMode: 'MANUAL' | 'LEARNING';
  expectedCandidates: number;
}): WalkScenarioRow {
  const rec = recorder();
  play(rec, {
    tick: 1,
    transition: 'ENTER',
    authority: vehicle(TAXI_A),
    previousAuthority: character(),
    vehicleId: TAXI_A,
    ...(input.firstMode === undefined ? {} : { mode: input.firstMode }),
  });
  const switched = play(rec, {
    tick: 2,
    transition: 'ENTER',
    authority: vehicle(TAXI_B),
    previousAuthority: vehicle(TAXI_A),
    vehicleId: TAXI_B,
    ...(input.secondMode === undefined ? {} : { mode: input.secondMode }),
  });
  expect(
    rec,
    switched.closed?.kind === input.expectedFirstKind,
    'the old car closes with its own kind',
  );
  expect(
    rec,
    switched.closed?.closeReason === 'VEHICLE_SWITCH',
    'a TAKE closes with VEHICLE_SWITCH',
  );
  expect(rec, switched.closed?.vehicleId === TAXI_A, 'the closed segment belongs to the old car');
  expect(rec, switched.opened?.vehicleId === TAXI_B, 'the new segment belongs to the new car');
  expect(
    rec,
    switched.opened?.kind === input.expectedSecondMode,
    'the new mode is exactly the explicit one',
  );
  expect(
    rec,
    switched.candidates.length === input.expectedCandidates,
    `${input.expectedCandidates} candidates`,
  );
  const stats = rec.model.getStats();
  expect(rec, stats.counters.vehicleSwitches === 1, 'one vehicle switch counted');
  expect(rec, stats.counters.closedSegments === 1, 'one segment closed');
  expect(rec, stats.openSegmentId === switched.opened?.segmentId, 'the new segment stays open');
  return row(rec, {
    id: input.id,
    label: input.label,
    transitions: `ENTER A${input.firstMode ? ` (${input.firstMode})` : ''} → ENTER B${input.secondMode ? ` (${input.secondMode})` : ''}`,
    previousMode: input.expectedFirstKind,
    authorityBefore: vehicle(TAXI_A),
    authorityAfter: vehicle(TAXI_B),
  });
}

function focusScenario(mode: 'MANUAL' | 'LEARNING'): WalkScenarioRow {
  const rec = recorder();
  play(rec, {
    tick: 1,
    transition: 'ENTER',
    authority: vehicle(TAXI_A),
    previousAuthority: character(),
    vehicleId: TAXI_A,
    mode,
  });
  const openBefore = rec.model.snapshot().open;
  const focus = play(rec, {
    tick: 2,
    transition: 'FOCUS',
    authority: vehicle(TAXI_A),
    vehicleId: TAXI_B,
  });
  const openAfter = rec.model.snapshot().open;
  expect(rec, focus.closed === null, 'FOCUS closes nothing');
  expect(rec, focus.candidates.length === 0, 'FOCUS produces no candidate');
  expect(rec, focus.focus?.authorityUnchanged === true, 'FOCUS copies the 193 authority');
  expect(
    rec,
    JSON.stringify(openBefore) === JSON.stringify(openAfter),
    'FOCUS keeps the open segment',
  );
  const exit = play(rec, {
    tick: 3,
    transition: 'EXIT',
    authority: character(),
    previousAuthority: vehicle(TAXI_A),
    vehicleId: TAXI_A,
  });
  expect(rec, exit.closed?.startTick === 1, 'the segment still starts at the real entry tick');
  expect(rec, exit.closed?.endTick === 3, 'the segment ends at the real exit tick');
  expect(rec, exit.closed?.kind === mode, 'FOCUS did not change the mode');
  expect(rec, rec.model.getStats().counters.focus === 1, 'one focus counted');
  return row(rec, {
    id: `focus-during-${mode.toLowerCase()}`,
    label: `FOCUS în timpul unui segment ${mode}`,
    transitions: `ENTER (${mode}) → FOCUS → EXIT`,
    previousMode: mode,
    authorityBefore: vehicle(TAXI_A),
    authorityAfter: character(),
  });
}

function matrixRow(
  previousMode: 'MANUAL' | 'LEARNING',
  transition: 'TAKE' | 'RETURN' | 'FOCUS',
): WalkScenarioRow {
  const rec = recorder();
  play(rec, {
    tick: 1,
    transition: 'ENTER',
    authority: vehicle(TAXI_A),
    previousAuthority: character(),
    vehicleId: TAXI_A,
    mode: previousMode,
  });
  let authorityAfter: InputAuthority = vehicle(TAXI_A);
  if (transition === 'TAKE') {
    const take = play(rec, {
      tick: 2,
      transition: 'ENTER',
      authority: vehicle(TAXI_B),
      previousAuthority: vehicle(TAXI_A),
      vehicleId: TAXI_B,
    });
    authorityAfter = vehicle(TAXI_B);
    expect(rec, take.closed?.kind === previousMode, 'TAKE closes the previous kind');
    expect(
      rec,
      take.opened?.kind === WALKING_SEGMENTS_POLICY.defaultEntryMode,
      'TAKE opens the 195 default mode',
    );
    expect(rec, take.opened?.kind === 'MANUAL', 'a TAKE never guesses LEARNING');
    expect(
      rec,
      take.candidates.length === (previousMode === 'LEARNING' ? 1 : 0),
      'candidates follow the closed kind',
    );
  } else if (transition === 'RETURN') {
    const exit = play(rec, {
      tick: 2,
      transition: 'EXIT',
      authority: character(),
      previousAuthority: vehicle(TAXI_A),
      vehicleId: TAXI_A,
    });
    authorityAfter = character();
    expect(rec, exit.closed?.kind === previousMode, 'RETURN closes the previous kind');
    expect(rec, exit.closed?.closeReason === 'RETURN_TO_AUTO', 'RETURN closes with RETURN_TO_AUTO');
    expect(rec, exit.opened === null, 'RETURN opens nothing');
    expect(
      rec,
      exit.candidates.length === (previousMode === 'LEARNING' ? 1 : 0),
      'candidates follow the closed kind',
    );
  } else {
    const focus = play(rec, {
      tick: 2,
      transition: 'FOCUS',
      authority: vehicle(TAXI_A),
      vehicleId: TAXI_B,
    });
    expect(rec, focus.closed === null, 'FOCUS closes nothing');
    expect(rec, focus.candidates.length === 0, 'FOCUS yields no candidate');
    expect(rec, rec.model.snapshot().open?.kind === previousMode, 'FOCUS keeps the explicit mode');
  }
  return row(rec, {
    id: `matrix-${previousMode.toLowerCase()}-${transition.toLowerCase()}`,
    label: `mod anterior ${previousMode} × ${transition}`,
    transitions: `ENTER (${previousMode}) → ${transition}`,
    previousMode,
    authorityBefore: vehicle(TAXI_A),
    authorityAfter,
  });
}

/** The real 069 lifecycle, closed by the same authority boundaries, as the cross-check. */
function crossCheck() {
  const manual = segmentFixture();
  const manualOpen = manual.apply('MANUAL');
  manual.apply('AUTO', 'RETURN_TO_AUTO');
  const manualClosed = manual.store.port.read(manualOpen.active!.segmentId)!;

  const learning = segmentFixture();
  const learningOpen = learning.apply('LEARNING');
  learning.apply('AUTO', 'RETURN_TO_AUTO');
  const learningClosed = learning.store.port.read(learningOpen.active!.segmentId)!;

  const ineligible = segmentFixture();
  ineligible.setTarget(Object.freeze({ ...ineligible.target(), learningEligible: false }));
  const ineligibleOpen = ineligible.apply('LEARNING');
  ineligible.apply('AUTO', 'RETURN_TO_AUTO');
  const ineligibleClosed = ineligible.store.port.read(ineligibleOpen.active!.segmentId)!;

  const frozen = segmentFixture();
  const frozenOpen = frozen.apply('LEARNING');
  frozen.setTarget(Object.freeze({ ...frozen.target(), learningEligible: false }));
  frozen.apply('AUTO', 'RETURN_TO_AUTO');
  const frozenClosed = frozen.store.port.read(frozenOpen.active!.segmentId)!;

  const truncated = segmentFixture();
  const truncatedOpen = truncated.apply('LEARNING');
  // 069 has no manoeuvre field: the exit mid-manoeuvre is the same close as any other exit.
  truncated.apply('AUTO', 'VEHICLE_SWITCH');
  const truncatedClosed = truncated.store.port.read(truncatedOpen.active!.segmentId)!;

  const dataLoss = segmentFixture();
  const dataLossOpen = dataLoss.apply('LEARNING');
  dataLoss.owner.retire(dataLoss.cause('DATA_LOSS', 'AT_LAST_ACCEPTED_TICK'));
  const dataLossClosed = dataLoss.store.port.read(dataLossOpen.active!.segmentId)!;

  const descriptor = (fixture: ReturnType<typeof segmentFixture>) => {
    const entries = fixture.intake.getStats().entries;
    return entries === 0 ? null : fixture.intake.read('tests:close:2');
  };
  return Object.freeze({
    manual: Object.freeze({
      mode: manualClosed.controlMode,
      learningEligible: manualClosed.learningEligible,
      completeness: manualClosed.completeness,
      intake: manual.intake.getStats().entries,
      descriptor: descriptor(manual),
    }),
    learning: Object.freeze({
      mode: learningClosed.controlMode,
      learningEligible: learningClosed.learningEligible,
      completeness: learningClosed.completeness,
      intake: learning.intake.getStats().entries,
      descriptor: descriptor(learning),
    }),
    ineligible: Object.freeze({
      mode: ineligibleClosed.controlMode,
      learningEligible: ineligibleClosed.learningEligible,
      completeness: ineligibleClosed.completeness,
      intake: ineligible.intake.getStats().entries,
      descriptor: descriptor(ineligible),
    }),
    frozenEligibility: Object.freeze({
      mode: frozenClosed.controlMode,
      learningEligible: frozenClosed.learningEligible,
      targetLearningEligible: frozen.target().learningEligible,
      completeness: frozenClosed.completeness,
      intake: frozen.intake.getStats().entries,
      descriptor: descriptor(frozen),
    }),
    truncatedManeuver: Object.freeze({
      mode: truncatedClosed.controlMode,
      closeReason: truncatedClosed.closeReason,
      learningEligible: truncatedClosed.learningEligible,
      completeness: truncatedClosed.completeness,
      intake: truncated.intake.getStats().entries,
      descriptor: descriptor(truncated),
    }),
    dataLoss: Object.freeze({
      mode: dataLossClosed.controlMode,
      closeReason: dataLossClosed.closeReason,
      completeness: dataLossClosed.completeness,
      learningEligible: dataLossClosed.learningEligible,
      intake: dataLoss.intake.getStats().entries,
      descriptor: descriptor(dataLoss),
    }),
  });
}

export function runWalkingSegmentsReport() {
  const first = buildWalkingSegmentsReport();
  const second = buildWalkingSegmentsReport();
  const digest = createHash('sha256').update(JSON.stringify(first.body)).digest('hex');
  const identical =
    digest === createHash('sha256').update(JSON.stringify(second.body)).digest('hex') &&
    first.pass === second.pass;
  return Object.freeze({
    ...first.body,
    summary: Object.freeze({
      ...first.body.summary,
      determinism: identical,
      pass: first.pass && identical,
    }),
    determinism: Object.freeze({ runs: 2, identical, digest }),
  });
}

function buildWalkingSegmentsReport() {
  const scenarios: WalkScenarioRow[] = [
    walkScenario(),
    walkUnboundedScenario(),
    enterExitScenario({
      id: 'manual-closed',
      label: 'segment MANUAL închis de ieșire',
      expectedKind: 'MANUAL',
      expectedCandidates: 0,
    }),
    enterExitScenario({
      id: 'learning-closed',
      label: 'segment LEARNING închis de ieșire',
      mode: 'LEARNING',
      expectedKind: 'LEARNING',
      expectedCandidates: 1,
    }),
    enterExitScenario({
      id: 'learning-ineligible',
      label: 'LEARNING deschis când ținta nu este eligibilă',
      mode: 'LEARNING',
      target: Object.freeze({ ...TARGET, learningEligible: false }),
      expectedKind: 'LEARNING',
      expectedCandidates: 0,
    }),
    enterExitScenario({
      id: 'learning-truncated-maneuver',
      label: 'LEARNING trunchiat de o ieșire în mijlocul manevrei LANE_CHANGING',
      mode: 'LEARNING',
      maneuverState: 'LANE_CHANGING',
      expectedKind: 'LEARNING',
      expectedCandidates: 1,
    }),
    switchScenario({
      id: 'take-learning-to-manual',
      label: 'TAKE dintr-un segment LEARNING nu ghicește LEARNING',
      firstMode: 'LEARNING',
      expectedFirstKind: 'LEARNING',
      expectedSecondMode: 'MANUAL',
      expectedCandidates: 1,
    }),
    switchScenario({
      id: 'take-manual-to-learning',
      label: 'TAKE cu alegere explicită LEARNING',
      secondMode: 'LEARNING',
      expectedFirstKind: 'MANUAL',
      expectedSecondMode: 'LEARNING',
      expectedCandidates: 0,
    }),
    focusScenario('LEARNING'),
    focusScenario('MANUAL'),
    ...(['MANUAL', 'LEARNING'] as const).flatMap((previousMode) =>
      (['TAKE', 'RETURN', 'FOCUS'] as const).map((transition) =>
        matrixRow(previousMode, transition),
      ),
    ),
  ];

  const matrix = (['MANUAL', 'LEARNING'] as const).flatMap((previousMode) =>
    (['TAKE', 'RETURN', 'FOCUS'] as const).map((transition) => {
      const found = scenarios.find(
        (entry) => entry.id === `matrix-${previousMode.toLowerCase()}-${transition.toLowerCase()}`,
      )!;
      return Object.freeze({
        previousMode,
        transition,
        closedKind: found.closedKind,
        closedReason: found.closeReason,
        openedMode: found.openedMode,
        candidates: found.candidates,
        verdict: found.verdict,
      });
    }),
  );

  const byId = new Map(scenarios.map((entry) => [entry.id, entry]));
  const walk = byId.get('walk-3600')!;
  const walkBound = byId.get('walk-unbounded')!;
  const manual = byId.get('manual-closed')!;
  const learning = byId.get('learning-closed')!;
  const ineligible = byId.get('learning-ineligible')!;
  const truncated = byId.get('learning-truncated-maneuver')!;
  const real = crossCheck();
  const descriptor = real.learning.descriptor;

  const crossCheckMatches =
    real.manual.intake === manual.candidates &&
    real.learning.intake === learning.candidates &&
    real.ineligible.intake === ineligible.candidates &&
    real.truncatedManeuver.intake === truncated.candidates &&
    real.frozenEligibility.intake === 1 &&
    real.dataLoss.intake === 0 &&
    descriptor !== null &&
    descriptor !== undefined &&
    descriptor.playerId === TARGET.playerId &&
    descriptor.profileId === TARGET.profileId &&
    descriptor.learningEpoch === TARGET.learningEpoch &&
    descriptor.baseVersionId === TARGET.baseVersionId &&
    descriptor.endTick === 2;

  const gate = Object.freeze({
    manualClosedCandidates: manual.candidates,
    learningClosedCandidates: learning.candidates,
    learningIneligibleCandidates: ineligible.candidates,
    truncatedLearningCandidates: truncated.candidates,
    real069: real,
    crossCheckMatches,
  });

  const body = {
    contract: WALKING_SEGMENTS_REPORT_CONTRACT,
    command: WALKING_SEGMENTS_REPORT_COMMAND,
    generatedBy: 'scripts/run-v3-walking-segments-report.mjs',
    tickHz: WALKING_SEGMENTS_POLICY.tickHz,
    policy: {
      contract: WALKING_SEGMENTS_POLICY.contract,
      tickHz: WALKING_SEGMENTS_POLICY.tickHz,
      defaultEntryMode: WALKING_SEGMENTS_POLICY.defaultEntryMode,
      entryPolicyMode: VEHICLE_ENTRY_POLICY.entryMode,
      kinds: ['MANUAL', 'LEARNING'],
      closeReasons: ['RETURN_TO_AUTO', 'VEHICLE_SWITCH'],
      gate: 'LEARNING ∧ learningEligible ∧ CLOSED ∧ same session/player/profile/epoch/baseVersion',
    },
    scenarios,
    walking: Object.freeze({
      ticks: walk.walkingTicks,
      distanceM: walk.walkingDistanceM,
      boundTicks: walkBound.walkingTicks,
      boundDistanceM: walkBound.walkingDistanceM,
      closedSegments: 0,
      candidates: 0,
      controlClosedSegments: 1,
      verdict: walk.verdict === 'PASS' && walkBound.verdict === 'PASS' ? 'PASS' : 'FAIL',
    }),
    matrix,
    gate,
    summary: Object.freeze({
      scenarios: scenarios.length,
      scenariosPassed: scenarios.filter((entry) => entry.verdict === 'PASS').length,
      walkingIsNotDriving: walk.verdict === 'PASS' && walkBound.verdict === 'PASS',
      onlyClosedLearningProducesEstimator:
        manual.verdict === 'PASS' &&
        learning.verdict === 'PASS' &&
        ineligible.verdict === 'PASS' &&
        truncated.verdict === 'PASS' &&
        crossCheckMatches,
      focusClosesNothing: matrix
        .filter((entry) => entry.transition === 'FOCUS')
        .every(
          (entry) =>
            entry.verdict === 'PASS' &&
            entry.closedKind === null &&
            entry.closedReason === null &&
            entry.openedMode === null &&
            entry.candidates === 0,
        ),
      explicitMode: matrix.every((entry) => entry.verdict === 'PASS'),
    }),
    limitations: [
      'Contractul este un read model: nu scrie în telemetrie și nu lansează analiza; consumatorul real rămâne 069.',
      'Candidatul expune intrarea în poarta 069, nu descriptorul 069: operationId și recordBytes aparțin proprietarului telemetriei.',
      'Ținta (player/profile/epoch/baseVersion) este fixă pe durata instanței; schimbările de profil sunt granițe PROFILE_CHANGE ale 069, nu ale acestui contract.',
      'Tranzițiile acceptate sunt singurele intrări: un TAKE refuzat de 195/197 nu ajunge aici, deci nu există segment pentru el.',
      'Completeness INCOMPLETE (DATA_LOSS) este modelată în poartă, dar contractul nu produce tranziții de pierdere de date.',
      'Modul nu simulează mașina: durata conducerii se citește din startTick/endTick, iar starea manevrei este cea raportată de proprietarul 024.',
    ],
  };

  const pass =
    body.summary.walkingIsNotDriving &&
    body.summary.onlyClosedLearningProducesEstimator &&
    body.summary.focusClosesNothing &&
    body.summary.explicitMode &&
    body.summary.scenariosPassed === body.summary.scenarios;
  return Object.freeze({ body, pass });
}
