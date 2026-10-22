import type { ContractContext } from '../sessions';
import type { ParameterKey } from '../profiles';
import type { BodyIdentity, ControlMode } from '../vehicles';
import type { VehicleSelectionKind } from '../input';

/**
 * 217 AUTO / MANUAL / LEARNING integration harness.
 *
 * The harness reimplements no mode, seat, segment, queue or profile rule. It drives the injected
 * real 066 authority, 067 mode intents, 068 selection, 069 segments, 070 pause/focus, 080 remapping,
 * 103 queue and 112 pipeline one accepted tick at a time, then checks the observable contract:
 *
 * - every one of the six transitions closes the previous segment and opens the next with the right
 *   mode and eligibility while the physical readback keeps position/speed/heading continuous;
 * - at most one `PLAYER` seat exists, and a camera selection never takes control;
 * - MANUAL records telemetry/history but never produces a learning job, a parameter change or
 *   evidence, while an eligible closed LEARNING segment publishes through the real 112 pipeline and
 *   an ineligible one is skipped.
 *
 * The module owns no clock, no DOM and no physics. The host supplies the scene factory, the real
 * module instances and the authoritative readback. The latency probe is local and provisional.
 */
export const THREE_MODES_VERSION = '217-three-modes-v1' as const;

export const THREE_MODES_LIMITS = Object.freeze({
  version: THREE_MODES_VERSION,
  tickHz: 60,
  dtSeconds: 1 / 60,
  /** Bounded local sample sizes of the provisional latency probe. */
  modeSamples: 48,
  selectionSamples: 200,
  admissionSamples: 200,
  /** 069 protects 64 segment records; one admission scene stays well below that. */
  segmentsPerLatencyScene: 50,
  positionEpsilonM: 1e-6,
  motionEpsilon: 1e-9,
});

export const THREE_MODE_NAMES = Object.freeze(['AUTO', 'MANUAL', 'LEARNING'] as const);
export const THREE_MODE_KINDS = Object.freeze(['TAXI', 'CIVIL'] as const);
export type ThreeModeKind = (typeof THREE_MODE_KINDS)[number];

/** The single learning key the deterministic 102/103 composition exercises in this harness. */
export const THREE_MODES_LEARNING_KEY: ParameterKey = 'speed_delta_urban';

export type ThreeModeCloseReason = 'MODE_CHANGE' | 'RETURN_TO_AUTO';

export interface ThreeModeTransition {
  readonly id: string;
  readonly from: ControlMode;
  readonly to: ControlMode;
  readonly action: 'M' | 'L';
  /** `null` for the two transitions that start from AUTO, where no segment exists to close. */
  readonly closeReason: ThreeModeCloseReason | null;
}

export const THREE_MODE_TRANSITIONS: readonly ThreeModeTransition[] = Object.freeze([
  Object.freeze({
    id: 'AUTO->MANUAL',
    from: 'AUTO' as const,
    to: 'MANUAL' as const,
    action: 'M' as const,
    closeReason: null,
  }),
  Object.freeze({
    id: 'AUTO->LEARNING',
    from: 'AUTO' as const,
    to: 'LEARNING' as const,
    action: 'L' as const,
    closeReason: null,
  }),
  Object.freeze({
    id: 'MANUAL->AUTO',
    from: 'MANUAL' as const,
    to: 'AUTO' as const,
    action: 'M' as const,
    closeReason: 'RETURN_TO_AUTO' as const,
  }),
  Object.freeze({
    id: 'MANUAL->LEARNING',
    from: 'MANUAL' as const,
    to: 'LEARNING' as const,
    action: 'L' as const,
    closeReason: 'MODE_CHANGE' as const,
  }),
  Object.freeze({
    id: 'LEARNING->AUTO',
    from: 'LEARNING' as const,
    to: 'AUTO' as const,
    action: 'M' as const,
    closeReason: 'RETURN_TO_AUTO' as const,
  }),
  Object.freeze({
    id: 'LEARNING->MANUAL',
    from: 'LEARNING' as const,
    to: 'MANUAL' as const,
    action: 'L' as const,
    closeReason: 'MODE_CHANGE' as const,
  }),
]);

export interface ThreeModeVehicleRef {
  readonly identity: BodyIdentity;
  readonly kind: VehicleSelectionKind;
}

export interface ThreeModesPhysicsSnapshot {
  readonly tick: number;
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly speedMps: number;
  readonly headingRad: number;
}

export interface ThreeModesSegmentSnapshot {
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly mode: ControlMode;
  readonly learningEligible: boolean;
  readonly startTick: number;
  readonly endTick: number | null;
  readonly completeness: 'OPEN' | 'CLOSED' | 'INCOMPLETE';
  readonly closeReason: string | null;
  readonly samples: number;
}

export interface ThreeModesClosedSegment {
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly mode: ControlMode;
  readonly learningEligible: boolean;
  readonly startTick: number;
  readonly endTick: number;
  readonly closeReason: string;
  readonly samples: number;
}

export interface ThreeModesLearningResultView {
  readonly segmentId: string;
  readonly mode: string;
  readonly status: string;
  readonly reason: string | null;
  readonly versionId: string | null;
  readonly jobSubmitted: boolean;
  readonly compositionKey: string | null;
  readonly compositionValue: number | null;
}

export interface ThreeModesLearningView {
  readonly segments: number;
  readonly jobs: number;
  readonly versions: number;
  readonly manualSkipped: number;
  readonly ineligibleSkipped: number;
  readonly noChange: number;
  readonly failed: number;
  readonly stale: number;
  readonly deduplicated: number;
  readonly headVersionId: string;
  readonly storeVersions: number;
  readonly headParameters: Readonly<Record<string, number>>;
  readonly queueStarts: number;
  readonly queueActive: number;
  readonly queuePending: number;
  readonly results: readonly ThreeModesLearningResultView[];
}

export interface ThreeModesHudView {
  readonly symbol: string;
  readonly label: string;
  readonly subject: string;
  readonly eligibility: string;
  readonly actionSubject: string;
}

export interface ThreeModesScenarioRequest {
  readonly scenarioId: string;
  readonly primary: ThreeModeVehicleRef;
  readonly secondary: ThreeModeVehicleRef | null;
  readonly learningEligible: boolean | null;
}

/** Real modules wired by the host for one scene. Every mutation goes through the real module. */
export interface ThreeModesWorld {
  readonly request: ThreeModesScenarioRequest;
  tick(): number;
  mode(): ControlMode;
  seat(): Readonly<{ identity: BodyIdentity; mode: 'MANUAL' | 'LEARNING' }> | null;
  cameraTarget(): BodyIdentity | null;
  bindings(): Readonly<{ manualMode: string; learningMode: string }>;
  hud(): ThreeModesHudView;
  /** Real 080 binding plus real 067 intent through the injected keyboard surface. */
  pressKey(action: 'M' | 'L'): boolean;
  /** Raw physical code test: only the currently bound code may be accepted. */
  keyDown(code: string): boolean;
  remap(manualMode: string, learningMode: string): void;
  /** 068 intention only; the camera target moves on the accepted tick, the seat never does. */
  select(identity: BodyIdentity | null): void;
  /** One accepted tick through the real 066/067/068/069 bridge. */
  step(): void;
  pause(): void;
  resume(): void;
  focusLost(lost: boolean): void;
  paused(): boolean;
  heldKeys(): number;
  physics(identity: BodyIdentity): ThreeModesPhysicsSnapshot;
  segments(): readonly ThreeModesSegmentSnapshot[];
  /** Removes and returns the segments closed since the previous call. */
  takeClosed(): readonly ThreeModesClosedSegment[];
  /** Feeds one closed segment to the real 112 pipeline; never fabricates a job. */
  submitSegment(closed: ThreeModesClosedSegment): Promise<ThreeModesLearningResultView>;
  /** Occupies the real serial queue with a secondary 103 job, without touching the pipeline. */
  occupyQueue(segmentId: string): Promise<void>;
  learning(): ThreeModesLearningView;
  setLearningEligible(value: boolean | null): void;
  dispose(): void;
}

export interface ThreeModesServices {
  readonly context: ContractContext;
  readonly vehicles: Readonly<Record<ThreeModeKind, ThreeModeVehicleRef>>;
  /** Builds one fresh scene over the real modules; never reuses accepted state. */
  createWorld(request: ThreeModesScenarioRequest): ThreeModesWorld;
  /** Host profile read model the harness proves untouched; never written by the harness. */
  readonly profileBaseline: Readonly<{
    values: Readonly<Record<string, number>>;
    proofs: Readonly<Record<string, number>>;
  }>;
}

export interface ThreeModeTransitionObservation {
  readonly transition: ThreeModeTransition;
  readonly kind: ThreeModeKind;
  readonly scenarioId: string;
  readonly previousTick: number;
  readonly atTick: number;
  readonly eligible: boolean | null;
  /** Active segment before the accepted tick; `null` when the world was in AUTO. */
  readonly expectedClosedSegmentId: string | null;
  readonly closed: ThreeModesClosedSegment | null;
  readonly opened: ThreeModesSegmentSnapshot | null;
  readonly beforePhysics: ThreeModesPhysicsSnapshot;
  readonly afterPhysics: ThreeModesPhysicsSnapshot;
  readonly seatCount: number;
  readonly seat: Readonly<{ identity: BodyIdentity; mode: 'MANUAL' | 'LEARNING' }> | null;
  readonly controlledIdentity: BodyIdentity;
}

export type ThreeModesFailureKind =
  | 'MISSING_CLOSED_SEGMENT'
  | 'UNEXPECTED_CLOSED_SEGMENT'
  | 'WRONG_CLOSED_SEGMENT'
  | 'OLD_SEGMENT_END_TICK'
  | 'OLD_SEGMENT_MODE'
  | 'OLD_SEGMENT_CLOSE_REASON'
  | 'OLD_SEGMENT_MISSING_SAMPLES'
  | 'MISSING_OPEN_SEGMENT'
  | 'UNEXPECTED_OPEN_SEGMENT'
  | 'OPEN_SEGMENT_START_TICK'
  | 'OPEN_SEGMENT_MODE'
  | 'OPEN_SEGMENT_COMPLETENESS'
  | 'OPEN_SEGMENT_ELIGIBILITY'
  | 'PHYSICS_TICK'
  | 'PHYSICS_SPEED'
  | 'PHYSICS_HEADING'
  | 'PHYSICS_POSITION_STEP'
  | 'MULTIPLE_PLAYER_SEATS'
  | 'PLAYER_SEAT_MODE'
  | 'PLAYER_SEAT_IDENTITY';

export interface ThreeModesTransitionFailure {
  readonly kind: ThreeModesFailureKind;
  readonly detail: string;
}

/**
 * Pure transition contract check. An injected discontinuity, extra seat or missing segment fails
 * with a closed failure kind instead of being absorbed into a passing row.
 */
export function transitionFailures(
  input: ThreeModeTransitionObservation,
): readonly ThreeModesTransitionFailure[] {
  const failures: ThreeModesTransitionFailure[] = [];
  const fail = (kind: ThreeModesFailureKind, detail: string) => failures.push({ kind, detail });
  const transition = input.transition;
  const closed = input.closed;
  const opened = input.opened;
  if (input.expectedClosedSegmentId === null) {
    if (closed !== null)
      fail('UNEXPECTED_CLOSED_SEGMENT', `AUTO start closed ${closed.segmentId} at ${input.atTick}`);
  } else if (closed === null) {
    fail('MISSING_CLOSED_SEGMENT', `No segment closed for ${transition.id}`);
  } else {
    if (closed.segmentId !== input.expectedClosedSegmentId)
      fail(
        'WRONG_CLOSED_SEGMENT',
        `Closed ${closed.segmentId}, expected ${input.expectedClosedSegmentId}`,
      );
    if (closed.endTick !== input.atTick)
      fail('OLD_SEGMENT_END_TICK', `Closed at ${closed.endTick}, expected ${input.atTick}`);
    if (closed.mode !== transition.from)
      fail('OLD_SEGMENT_MODE', `Closed ${closed.mode}, expected ${transition.from}`);
    if (transition.closeReason !== null && closed.closeReason !== transition.closeReason)
      fail(
        'OLD_SEGMENT_CLOSE_REASON',
        `Closed as ${closed.closeReason}, expected ${transition.closeReason}`,
      );
    if (closed.startTick >= closed.endTick)
      fail(
        'OLD_SEGMENT_END_TICK',
        `Segment ${closed.segmentId} closed at ${closed.endTick} before/at ${closed.startTick}`,
      );
    if (closed.samples <= 0)
      fail('OLD_SEGMENT_MISSING_SAMPLES', 'A player segment must carry telemetry samples');
  }
  if (transition.to === 'AUTO') {
    if (opened !== null) fail('UNEXPECTED_OPEN_SEGMENT', `AUTO opened ${opened.segmentId}`);
  } else if (opened === null) {
    fail('MISSING_OPEN_SEGMENT', `No ${transition.to} segment opened at ${input.atTick}`);
  } else {
    if (opened.startTick !== input.atTick)
      fail('OPEN_SEGMENT_START_TICK', `Opened at ${opened.startTick}, expected ${input.atTick}`);
    if (opened.mode !== transition.to)
      fail('OPEN_SEGMENT_MODE', `Opened ${opened.mode}, expected ${transition.to}`);
    if (opened.completeness !== 'OPEN')
      fail('OPEN_SEGMENT_COMPLETENESS', `Opened as ${opened.completeness}`);
    const expectedEligible = transition.to === 'LEARNING' && input.eligible === true;
    if (opened.learningEligible !== expectedEligible)
      fail(
        'OPEN_SEGMENT_ELIGIBILITY',
        `learningEligible=${opened.learningEligible}, expected ${expectedEligible}`,
      );
  }
  if (input.beforePhysics.tick !== input.previousTick || input.afterPhysics.tick !== input.atTick)
    fail(
      'PHYSICS_TICK',
      `Physics ticks ${input.beforePhysics.tick}/${input.afterPhysics.tick} do not match ${input.previousTick}/${input.atTick}`,
    );
  if (
    Math.abs(input.afterPhysics.speedMps - input.beforePhysics.speedMps) >
    THREE_MODES_LIMITS.motionEpsilon
  )
    fail(
      'PHYSICS_SPEED',
      `Speed changed ${input.beforePhysics.speedMps}->${input.afterPhysics.speedMps}`,
    );
  if (
    Math.abs(input.afterPhysics.headingRad - input.beforePhysics.headingRad) >
    THREE_MODES_LIMITS.motionEpsilon
  )
    fail(
      'PHYSICS_HEADING',
      `Heading changed ${input.beforePhysics.headingRad}->${input.afterPhysics.headingRad}`,
    );
  const expectedStep = input.beforePhysics.speedMps * THREE_MODES_LIMITS.dtSeconds;
  const actualStep = Math.hypot(
    input.afterPhysics.positionM.x - input.beforePhysics.positionM.x,
    input.afterPhysics.positionM.y - input.beforePhysics.positionM.y,
    input.afterPhysics.positionM.z - input.beforePhysics.positionM.z,
  );
  if (Math.abs(actualStep - expectedStep) > THREE_MODES_LIMITS.positionEpsilonM)
    fail(
      'PHYSICS_POSITION_STEP',
      `Position step ${actualStep} m, expected ${expectedStep} m for speed ${input.beforePhysics.speedMps}`,
    );
  if (input.seatCount > 1)
    fail('MULTIPLE_PLAYER_SEATS', `${input.seatCount} PLAYER seats exist at ${input.atTick}`);
  if (transition.to === 'AUTO') {
    if (input.seat !== null) fail('PLAYER_SEAT_MODE', `AUTO kept a ${input.seat.mode} seat`);
  } else if (input.seat === null) {
    fail('PLAYER_SEAT_MODE', `${transition.to} has no PLAYER seat`);
  } else {
    if (input.seat.mode !== transition.to)
      fail('PLAYER_SEAT_MODE', `Seat is ${input.seat.mode}, expected ${transition.to}`);
    if (input.seat.identity !== input.controlledIdentity)
      fail(
        'PLAYER_SEAT_IDENTITY',
        `Seat is ${input.seat.identity.entityId}, expected ${input.controlledIdentity.entityId}`,
      );
  }
  return Object.freeze(failures);
}

/** Throwing form used by the harness and by the injected-fault negative probes. */
export function assertTransition(input: ThreeModeTransitionObservation): void {
  const failures = transitionFailures(input);
  if (failures.length > 0)
    throw new Error(
      `217 ${input.transition.id} ${input.kind} failure(s): ${failures
        .map((entry) => `${entry.kind} ${entry.detail}`)
        .join('; ')}`,
    );
}

export interface ThreeModesPhysicsSummary {
  readonly preserved: boolean;
  readonly expectedStepM: number;
  readonly actualStepM: number;
  readonly positionStepErrorM: number;
  readonly speedDeltaMps: number;
  readonly headingDeltaRad: number;
}

export interface ThreeModesLearningSummary {
  readonly status: string | null;
  readonly reason: string | null;
  readonly jobSubmitted: boolean;
  readonly versionId: string | null;
  readonly compositionKey: string | null;
  readonly compositionValue: number | null;
  readonly parametersChanged: boolean;
  readonly evidenceRecorded: boolean;
}

export interface ThreeModesMatrixRow {
  readonly transition: string;
  readonly action: 'M' | 'L';
  readonly kind: ThreeModeKind;
  readonly scenarioId: string;
  readonly from: ControlMode;
  readonly to: ControlMode;
  readonly previousTick: number;
  readonly atTick: number;
  readonly eligible: boolean;
  readonly seat: Readonly<{ identity: string | null; mode: ControlMode | null; count: number }>;
  readonly physics: ThreeModesPhysicsSummary;
  readonly closed: Readonly<{
    segmentId: string | null;
    mode: ControlMode | null;
    endTick: number | null;
    closeReason: string | null;
    samples: number;
  }>;
  readonly opened: Readonly<{
    segmentId: string | null;
    mode: ControlMode | null;
    startTick: number | null;
    learningEligible: boolean | null;
  }>;
  readonly learning: ThreeModesLearningSummary;
  readonly hud: Readonly<{ symbol: string; label: string; eligibility: string }>;
  readonly failures: readonly string[];
  readonly ok: boolean;
}

export interface ThreeModesCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ThreeModesScenarioCase {
  readonly id: string;
  readonly description: string;
  readonly checks: readonly ThreeModesCheck[];
  readonly ok: boolean;
}

export interface ThreeModesCounts {
  readonly transitions: number;
  readonly transitionRows: number;
  readonly scenarios: number;
  readonly segments: number;
  readonly closedSegments: number;
  readonly manualClosed: number;
  readonly learningClosed: number;
  readonly maxPlayerSeats: number;
  readonly learningJobs: number;
  readonly profileVersions: number;
  readonly manualPublications: number;
}

export interface ThreeModesMatrixReport {
  readonly version: typeof THREE_MODES_VERSION;
  readonly oracleRule: string;
  readonly limits: typeof THREE_MODES_LIMITS;
  readonly transitions: readonly ThreeModeTransition[];
  readonly rows: readonly ThreeModesMatrixRow[];
  readonly cases: readonly ThreeModesScenarioCase[];
  readonly counts: ThreeModesCounts;
  readonly failures: readonly string[];
  readonly pass: boolean;
}

export interface ThreeModeLatencyStats {
  readonly samples: number;
  readonly minMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly meanMs: number;
}

export interface ThreeModesLatencyReport {
  readonly version: typeof THREE_MODES_VERSION;
  readonly level: 'full';
  readonly scope: 'LOCAL_NODE_SINGLE_PROCESS';
  readonly provisional: true;
  readonly hardwareClaim: 'NOT_MEASURED';
  readonly fpsClaim: 'NOT_MEASURED';
  readonly gpuClaim: 'NOT_MEASURED';
  readonly rule: string;
  readonly modeIntentToAcceptedTransition: ThreeModeLatencyStats;
  readonly selectionChangeToCameraTarget: ThreeModeLatencyStats;
  readonly learningSegmentCloseToQueueAdmission: ThreeModeLatencyStats & {
    readonly busyWorker: true;
    readonly busySamples: number;
    readonly admissions: number;
    readonly duplicateJobs: number;
  };
  /** Informational only: a local observation, never a pass/fail gate or a hardware claim. */
  readonly budget: Readonly<{
    readonly tickMs: number;
    readonly modeIntentWithinTick: boolean;
    readonly selectionChangeWithinTick: boolean;
    readonly note: string;
  }>;
  readonly failures: readonly string[];
}

function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

function statsOf(values: readonly number[], label: string): ThreeModeLatencyStats {
  if (values.length === 0) throw new Error(`217 latency probe has no ${label} sample`);
  const sorted = [...values].sort((left, right) => left - right);
  const at = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))]!;
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
  return Object.freeze({
    samples: sorted.length,
    minMs: round4(sorted[0]!),
    p50Ms: round4(at(0.5)),
    p95Ms: round4(at(0.95)),
    maxMs: round4(sorted[sorted.length - 1]!),
    meanMs: round4(mean),
  });
}

function now(): number {
  return performance.now();
}

function check(name: string, expected: unknown, actual: unknown, detail: string): ThreeModesCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function physicsSummary(
  before: ThreeModesPhysicsSnapshot,
  after: ThreeModesPhysicsSnapshot,
): ThreeModesPhysicsSummary {
  const expectedStep = before.speedMps * THREE_MODES_LIMITS.dtSeconds;
  const actualStep = Math.hypot(
    after.positionM.x - before.positionM.x,
    after.positionM.y - before.positionM.y,
    after.positionM.z - before.positionM.z,
  );
  const speedDelta = Math.abs(after.speedMps - before.speedMps);
  const headingDelta = Math.abs(after.headingRad - before.headingRad);
  const positionStepError = Math.abs(actualStep - expectedStep);
  return Object.freeze({
    preserved:
      speedDelta <= THREE_MODES_LIMITS.motionEpsilon &&
      headingDelta <= THREE_MODES_LIMITS.motionEpsilon &&
      positionStepError <= THREE_MODES_LIMITS.positionEpsilonM,
    expectedStepM: round4(expectedStep),
    actualStepM: round4(actualStep),
    positionStepErrorM: round4(positionStepError),
    speedDeltaMps: round4(speedDelta),
    headingDeltaRad: round4(headingDelta),
  });
}

function learningSummary(
  result: ThreeModesLearningResultView | null,
  closed: ThreeModesClosedSegment | null,
  parametersChanged: boolean,
): ThreeModesLearningSummary {
  return Object.freeze({
    status: result?.status ?? null,
    reason: result?.reason ?? null,
    jobSubmitted: result?.jobSubmitted ?? false,
    versionId: result?.versionId ?? null,
    compositionKey: result?.compositionKey ?? null,
    compositionValue: result?.compositionValue ?? null,
    parametersChanged,
    evidenceRecorded: (closed?.samples ?? 0) > 0,
  });
}

async function feedClosed(
  world: ThreeModesWorld,
  closed: readonly ThreeModesClosedSegment[],
): Promise<readonly ThreeModesLearningResultView[]> {
  const results: ThreeModesLearningResultView[] = [];
  for (const segment of closed) results.push(await world.submitSegment(segment));
  return Object.freeze(results);
}

async function runTransition(
  services: ThreeModesServices,
  kind: ThreeModeKind,
  transition: ThreeModeTransition,
): Promise<ThreeModesMatrixRow> {
  const primary = services.vehicles[kind];
  const scenarioId = `matrix:${kind.toLowerCase()}:${transition.id}`;
  const world = services.createWorld({
    scenarioId,
    primary,
    secondary: null,
    learningEligible: true,
  });
  try {
    for (let index = 0; index < 3; index += 1) world.step();
    if (transition.from !== 'AUTO') {
      const setupKey = transition.from === 'MANUAL' ? 'M' : 'L';
      if (!world.pressKey(setupKey))
        throw new Error(`217 ${transition.id} setup intent was refused`);
      world.step();
      const setupClosed = world.takeClosed();
      if (setupClosed.length > 0)
        throw new Error(`217 ${transition.id} setup closed ${setupClosed.length} segment(s)`);
      if (world.mode() !== transition.from)
        throw new Error(`217 ${transition.id} setup reached ${world.mode()}`);
    }
    const activeBefore = world
      .segments()
      .filter((segment) => segment.completeness === 'OPEN')
      .at(0);
    const expectedClosedSegmentId = activeBefore?.segmentId ?? null;
    const previousTick = world.tick();
    const beforePhysics = world.physics(primary.identity);
    if (!world.pressKey(transition.action))
      throw new Error(`217 ${transition.id} intent was refused by the real 067/080 adapter`);
    world.step();
    const atTick = world.tick();
    const afterPhysics = world.physics(primary.identity);
    const closedAll = world.takeClosed();
    if (closedAll.length > 1)
      throw new Error(`217 ${transition.id} closed ${closedAll.length} segments in one tick`);
    const closed = closedAll[0] ?? null;
    const opened =
      world
        .segments()
        .filter(
          (segment) =>
            segment.completeness === 'OPEN' && segment.segmentId !== expectedClosedSegmentId,
        )
        .at(0) ?? null;
    const seat = world.seat();
    const observation: ThreeModeTransitionObservation = {
      transition,
      kind,
      scenarioId,
      previousTick,
      atTick,
      eligible: true,
      expectedClosedSegmentId,
      closed,
      opened,
      beforePhysics,
      afterPhysics,
      seatCount: seat === null ? 0 : 1,
      seat,
      controlledIdentity: primary.identity,
    };
    const failures = transitionFailures(observation).map(
      (entry) => `${entry.kind}: ${entry.detail}`,
    );
    const before = world.learning();
    const results = await feedClosed(world, closed === null ? [] : [closed]);
    const after = world.learning();
    const learning = results[0] ?? null;
    return Object.freeze({
      transition: transition.id,
      action: transition.action,
      kind,
      scenarioId,
      from: transition.from,
      to: transition.to,
      previousTick,
      atTick,
      eligible: true,
      seat: Object.freeze({
        identity: seat?.identity.entityId ?? null,
        mode: seat?.mode ?? null,
        count: seat === null ? 0 : 1,
      }),
      physics: physicsSummary(beforePhysics, afterPhysics),
      closed: Object.freeze({
        segmentId: closed?.segmentId ?? null,
        mode: closed?.mode ?? null,
        endTick: closed?.endTick ?? null,
        closeReason: closed?.closeReason ?? null,
        samples: closed?.samples ?? 0,
      }),
      opened: Object.freeze({
        segmentId: opened?.segmentId ?? null,
        mode: opened?.mode ?? null,
        startTick: opened?.startTick ?? null,
        learningEligible: opened?.learningEligible ?? null,
      }),
      learning: learningSummary(
        learning,
        closed,
        after.headParameters[learning?.compositionKey ?? ''] !==
          before.headParameters[learning?.compositionKey ?? ''],
      ),
      hud: Object.freeze({
        symbol: world.hud().symbol,
        label: world.hud().label,
        eligibility: world.hud().eligibility,
      }),
      failures: Object.freeze(failures),
      ok: failures.length === 0,
    });
  } finally {
    world.dispose();
  }
}

function failedRow(
  kind: ThreeModeKind,
  transition: ThreeModeTransition,
  message: string,
): ThreeModesMatrixRow {
  return Object.freeze({
    transition: transition.id,
    action: transition.action,
    kind,
    scenarioId: `matrix:${kind.toLowerCase()}:${transition.id}`,
    from: transition.from,
    to: transition.to,
    previousTick: -1,
    atTick: -1,
    eligible: true,
    seat: Object.freeze({ identity: null, mode: null, count: 0 }),
    physics: Object.freeze({
      preserved: false,
      expectedStepM: 0,
      actualStepM: 0,
      positionStepErrorM: 0,
      speedDeltaMps: 0,
      headingDeltaRad: 0,
    }),
    closed: Object.freeze({
      segmentId: null,
      mode: null,
      endTick: null,
      closeReason: null,
      samples: 0,
    }),
    opened: Object.freeze({
      segmentId: null,
      mode: null,
      startTick: null,
      learningEligible: null,
    }),
    learning: Object.freeze({
      status: null,
      reason: null,
      jobSubmitted: false,
      versionId: null,
      compositionKey: null,
      compositionValue: null,
      parametersChanged: false,
      evidenceRecorded: false,
    }),
    hud: Object.freeze({ symbol: '', label: '', eligibility: '' }),
    failures: Object.freeze([message]),
    ok: false,
  });
}

interface CaseSummary {
  readonly cases: readonly ThreeModesScenarioCase[];
  readonly failures: readonly string[];
  readonly learningJobs: number;
  readonly profileVersions: number;
  readonly manualPublications: number;
}

function caseOf(
  id: string,
  description: string,
  checks: readonly ThreeModesCheck[],
): ThreeModesScenarioCase {
  return Object.freeze({
    id,
    description,
    checks: Object.freeze([...checks]),
    ok: checks.every((entry) => entry.pass),
  });
}

/** AUTO -> MANUAL taxi, explicit selection of the civil, LEARNING civil, back to AUTO. */
async function mixedRideCase(services: ThreeModesServices): Promise<{
  readonly scenario: ThreeModesScenarioCase;
  readonly learning: readonly ThreeModesLearningResultView[];
}> {
  const taxi = services.vehicles.TAXI;
  const civil = services.vehicles.CIVIL;
  const world = services.createWorld({
    scenarioId: 'case:mixed-ride',
    primary: taxi,
    secondary: civil,
    learningEligible: true,
  });
  try {
    for (let index = 0; index < 3; index += 1) world.step();
    if (!world.pressKey('M')) throw new Error('217 mixed ride could not enter MANUAL');
    world.step();
    for (let index = 0; index < 2; index += 1) world.step();
    const taxiBefore = world.physics(taxi.identity);
    const taxiSegment = world
      .segments()
      .filter((entry) => entry.mode === 'MANUAL')
      .at(0);

    world.select(civil.identity);
    world.step();
    const taxiAfter = world.physics(taxi.identity);
    const closedBySelection = world.takeClosed();
    const cameraAfterSelection = world.cameraTarget();
    const seatAfterSelection = world.seat();
    const civilSegmentsAfterSelection = world
      .segments()
      .filter((entry) => entry.vehicleId === civil.identity.entityId).length;

    if (!world.pressKey('L')) throw new Error('217 mixed ride could not take control of the civil');
    world.step();
    for (let index = 0; index < 2; index += 1) world.step();
    const civilBefore = world.physics(civil.identity);
    const civilSegment = world
      .segments()
      .filter((entry) => entry.mode === 'LEARNING')
      .at(0);
    if (!world.pressKey('M')) throw new Error('217 mixed ride could not return to AUTO');
    world.step();
    const civilAfter = world.physics(civil.identity);
    const closedAll = [...closedBySelection, ...world.takeClosed()];
    const results = await feedClosed(world, closedAll);
    const after = world.learning();
    const seatCount = world.seat() === null ? 0 : 1;
    const taxiMotion = physicsSummary(taxiBefore, taxiAfter);
    const civilMotion = physicsSummary(civilBefore, civilAfter);
    const manualResult = results.filter((entry) => entry.mode === 'MANUAL').at(0) ?? null;
    const learningResult = results.filter((entry) => entry.mode === 'LEARNING').at(0) ?? null;
    return {
      scenario: caseOf(
        'mixed-ride',
        'One session rides a taxi in MANUAL, explicitly selects a civil, drives it in LEARNING and returns to AUTO.',
        [
          check(
            'mixed-taxi-segment',
            { mode: 'MANUAL', opened: true },
            { mode: taxiSegment?.mode ?? null, opened: taxiSegment !== undefined },
            'The taxi segment is a real 069 MANUAL record.',
          ),
          check(
            'mixed-selection-closes-taxi',
            { count: 1, mode: 'MANUAL', reason: 'VEHICLE_SWITCH' },
            {
              count: closedBySelection.length,
              mode: closedBySelection[0]?.mode ?? null,
              reason: closedBySelection[0]?.closeReason ?? null,
            },
            'The 068 camera switch closes the departing MANUAL segment with VEHICLE_SWITCH.',
          ),
          check(
            'mixed-selection-no-takeover',
            { camera: civil.identity.entityId, seat: null, civilSegments: 0 },
            {
              camera: cameraAfterSelection?.entityId ?? null,
              seat: seatAfterSelection,
              civilSegments: civilSegmentsAfterSelection,
            },
            'A new selection moves only the camera; the civil stays in AUTO, unseated.',
          ),
          check(
            'mixed-learning-segment',
            { mode: 'LEARNING', eligible: true },
            { mode: civilSegment?.mode ?? null, eligible: civilSegment?.learningEligible ?? null },
            'The explicit L intent opens a real eligible LEARNING segment on the civil.',
          ),
          check(
            'mixed-manual-not-learned',
            { status: 'SKIPPED_MANUAL', jobs: false, version: null },
            {
              status: manualResult?.status ?? null,
              jobs: manualResult?.jobSubmitted ?? null,
              version: manualResult?.versionId ?? null,
            },
            'The MANUAL segment never becomes a learning job or a version.',
          ),
          check(
            'mixed-learning-version',
            { job: true, version: true },
            {
              job: learningResult?.jobSubmitted ?? false,
              version: (learningResult?.versionId ?? null) !== null,
            },
            'The closed eligible LEARNING segment produced a real 112 version.',
          ),
          check(
            'mixed-physics',
            { taxi: true, civil: true },
            { taxi: taxiMotion.preserved, civil: civilMotion.preserved },
            'Both vehicles keep their speed, heading and per-tick position step.',
          ),
          check(
            'mixed-seats',
            { after: 0, max: 1 },
            { after: seatCount, max: 1 },
            'At most one seat.',
          ),
          check(
            'mixed-profile-manual',
            { manualSkipped: 1, jobs: 1 },
            { manualSkipped: after.manualSkipped, jobs: after.jobs },
            'Only the eligible LEARNING close reached the 103 queue.',
          ),
        ],
      ),
      learning: results,
    };
  } finally {
    world.dispose();
  }
}

/** Pause/focus in MANUAL: the queued intent and held key are dropped without a tick gap. */
function pauseCase(services: ThreeModesServices): ThreeModesScenarioCase {
  const taxi = services.vehicles.TAXI;
  const world = services.createWorld({
    scenarioId: 'case:pause-focus',
    primary: taxi,
    secondary: null,
    learningEligible: true,
  });
  try {
    for (let index = 0; index < 3; index += 1) world.step();
    if (!world.pressKey('M')) throw new Error('217 pause case could not enter MANUAL');
    world.step();
    world.step();
    const openBefore = world
      .segments()
      .filter((entry) => entry.completeness === 'OPEN')
      .at(0);
    const tickBefore = world.tick();
    if (!world.keyDown(world.bindings().manualMode))
      throw new Error('217 pause case held key was refused');
    const heldBefore = world.heldKeys();
    world.pause();
    const pausedTick = world.tick();
    const heldWhilePaused = world.heldKeys();
    const suspendedWhilePaused = world.paused();
    let steppedWhilePaused = false;
    try {
      world.step();
      steppedWhilePaused = true;
    } catch {
      steppedWhilePaused = false;
    }
    world.resume();
    const pausedAfter = world.paused();
    world.step();
    const tickAfter = world.tick();
    const modeAfter = world.mode();
    const openAfter = world
      .segments()
      .filter((entry) => entry.completeness === 'OPEN')
      .at(0);
    const closed = world.takeClosed();
    const tickBeforeFocus = world.tick();
    world.focusLost(true);
    const focusSuspended = world.paused();
    const focusHeld = world.heldKeys();
    world.focusLost(false);
    const focusResumed = world.paused();
    const tickAfterFocus = world.tick();
    return caseOf(
      'pause-focus',
      'A paused MANUAL world drops the held M/L key and pending intent and resumes with contiguous ticks.',
      [
        check(
          'pause-holds-key',
          { held: 1 },
          { held: heldBefore },
          'The real 067 keyboard keeps exactly one held code before the pause.',
        ),
        check(
          'pause-resets-held',
          { held: 0, suspended: true },
          { held: heldWhilePaused, suspended: suspendedWhilePaused },
          '070 suspension clears the held code through the injected reset port.',
        ),
        check(
          'pause-stops-ticks',
          { tick: tickBefore, stepped: false },
          { tick: pausedTick, stepped: steppedWhilePaused },
          'A suspended world executes zero physical ticks.',
        ),
        check(
          'pause-resume',
          { paused: false, gap: 1 },
          { paused: pausedAfter, gap: tickAfter - tickBefore },
          'The resumed tick is exactly the next accepted tick: no gap, no duplicate.',
        ),
        check(
          'pause-clears-intent',
          { mode: 'MANUAL', autoSegments: 0, closed: 0 },
          { mode: modeAfter, autoSegments: closed.length, closed: closed.length },
          'The intent queued before the pause is cleared, so no AUTO transition is applied.',
        ),
        check(
          'pause-keeps-segment',
          { segmentId: openBefore?.segmentId ?? null, startTick: openBefore?.startTick ?? null },
          { segmentId: openAfter?.segmentId ?? null, startTick: openAfter?.startTick ?? null },
          'The suspended MANUAL segment stays open and is not re-opened.',
        ),
        check(
          'focus-suspends',
          { suspended: true, held: 0, resumed: false, tickGap: 0 },
          {
            suspended: focusSuspended,
            held: focusHeld,
            resumed: focusResumed,
            tickGap: tickAfterFocus - tickBeforeFocus,
          },
          'Browser focus loss suspends through 070 in every mode and resuming restores the same tick.',
        ),
      ],
    );
  } finally {
    world.dispose();
  }
}

/** Real 080 remap: the old codes stop working and the persisted new codes drive the modes. */
function remapCase(services: ThreeModesServices): ThreeModesScenarioCase {
  const taxi = services.vehicles.TAXI;
  const world = services.createWorld({
    scenarioId: 'case:remap',
    primary: taxi,
    secondary: null,
    learningEligible: true,
  });
  try {
    for (let index = 0; index < 2; index += 1) world.step();
    const before = world.bindings();
    world.remap('Digit1', 'Digit2');
    const after = world.bindings();
    const oldManual = world.keyDown('KeyM');
    world.step();
    const modeAfterOld = world.mode();
    const segmentsAfterOld = world.segments().length;
    const newManual = world.keyDown('Digit1');
    world.step();
    const manualMode = world.mode();
    const newLearning = world.keyDown('Digit2');
    world.step();
    const learningMode = world.mode();
    return caseOf(
      'remap',
      'M/L come from the persisted 080 bindings; the previous physical codes are ignored.',
      [
        check(
          'remap-saved',
          { manual: 'Digit1', learning: 'Digit2', changed: true },
          {
            manual: after.manualMode,
            learning: after.learningMode,
            changed: after.manualMode !== before.manualMode,
          },
          'The 080 draft was saved through the real settings store and applied to the keyboard and HUD.',
        ),
        check(
          'remap-old-code-ignored',
          { accepted: false, mode: 'AUTO', segments: 0 },
          { accepted: oldManual, mode: modeAfterOld, segments: segmentsAfterOld },
          'KeyM is no longer bound, so it queues nothing.',
        ),
        check(
          'remap-new-code-accepted',
          { manual: true, learning: true },
          { manual: newManual, learning: newLearning },
          'The remapped physical codes are accepted by the real 067 adapter.',
        ),
        check(
          'remap-modes',
          { manual: 'MANUAL', learning: 'LEARNING' },
          { manual: manualMode, learning: learningMode },
          'The remapped keys drive the documented transitions.',
        ),
      ],
    );
  } finally {
    world.dispose();
  }
}

/** Selection changes only the camera target; the seat is taken only by an explicit M/L intent. */
function selectionCase(services: ThreeModesServices): ThreeModesScenarioCase {
  const taxi = services.vehicles.TAXI;
  const civil = services.vehicles.CIVIL;
  const world = services.createWorld({
    scenarioId: 'case:selection',
    primary: taxi,
    secondary: civil,
    learningEligible: true,
  });
  try {
    for (let index = 0; index < 3; index += 1) world.step();
    world.select(civil.identity);
    world.step();
    const seatAfterSelection = world.seat();
    const cameraAfterSelection = world.cameraTarget();
    const segmentsAfterSelection = world.segments().length;
    if (!world.pressKey('M')) throw new Error('217 selection case could not take control');
    world.step();
    const seatAfterTakeover = world.seat();
    const civilOpen = world
      .segments()
      .filter(
        (entry) => entry.vehicleId === civil.identity.entityId && entry.completeness === 'OPEN',
      )
      .at(0);
    world.select(taxi.identity);
    world.step();
    const closed = world.takeClosed();
    const seatAfterSwitch = world.seat();
    const cameraAfterSwitch = world.cameraTarget();
    const civilSegments = world
      .segments()
      .filter((entry) => entry.vehicleId === civil.identity.entityId).length;
    return caseOf(
      'selection-no-takeover',
      'Changing the camera target never takes control; an explicit M intent does, and switching releases the old seat.',
      [
        check(
          'selection-camera-only',
          { camera: civil.identity.entityId, seat: null, segments: 0 },
          {
            camera: cameraAfterSelection?.entityId ?? null,
            seat: seatAfterSelection === null ? null : seatAfterSelection.identity.entityId,
            segments: segmentsAfterSelection,
          },
          '068 moves the camera target only; no PLAYER seat and no segment exist.',
        ),
        check(
          'selection-explicit-takeover',
          { identity: civil.identity.entityId, mode: 'MANUAL' },
          {
            identity: seatAfterTakeover?.identity.entityId ?? null,
            mode: seatAfterTakeover?.mode ?? null,
          },
          'The explicit M intent claims the selected civil in MANUAL.',
        ),
        check(
          'selection-leaves-old-car',
          { closed: 1, reason: 'VEHICLE_SWITCH', seat: null, oldSegments: 1 },
          {
            closed: closed.length,
            reason: closed[0]?.closeReason ?? null,
            seat: seatAfterSwitch,
            oldSegments: civilSegments,
          },
          'Switching to the taxi releases the civil seat and closes its segment, without taking the taxi.',
        ),
        check(
          'selection-camera-target',
          { target: taxi.identity.entityId, civilOpen: true },
          {
            target: cameraAfterSwitch?.entityId ?? null,
            civilOpen: civilOpen !== undefined,
          },
          'The camera follows the new target while the old vehicle keeps its closed record.',
        ),
      ],
    );
  } finally {
    world.dispose();
  }
}

/** A busy serial worker must not delay the mode/selection input path or duplicate jobs. */
async function busyCase(services: ThreeModesServices): Promise<{
  readonly scenario: ThreeModesScenarioCase;
  readonly learning: readonly ThreeModesLearningResultView[];
}> {
  const taxi = services.vehicles.TAXI;
  const world = services.createWorld({
    scenarioId: 'case:busy-worker',
    primary: taxi,
    secondary: null,
    learningEligible: true,
  });
  try {
    for (let index = 0; index < 3; index += 1) world.step();
    if (!world.pressKey('L')) throw new Error('217 busy case could not enter LEARNING');
    world.step();
    await world.occupyQueue('secondary:busy');
    const busyNow = world.learning();
    if (!world.pressKey('M')) throw new Error('217 busy case could not close LEARNING');
    world.step();
    const closed = world.takeClosed();
    if (closed.length !== 1) throw new Error('217 busy case did not close exactly one segment');
    const result = await world.submitSegment(closed[0]!);
    const after = world.learning();
    const resubmitted = await world.submitSegment(closed[0]!);
    const afterDuplicate = world.learning();
    return {
      scenario: caseOf(
        'busy-worker',
        'A LEARNING close is admitted while the serial 103 worker is busy with a secondary job.',
        [
          check(
            'busy-worker-active',
            { active: 1 },
            { active: busyNow.queueActive },
            'A real secondary 103 job occupies the serial queue at admission time.',
          ),
          check(
            'busy-admission',
            { job: true, version: true },
            {
              job: result.jobSubmitted,
              version: result.versionId !== null,
            },
            'The closed segment is admitted by the real 112 pipeline while the serial worker is busy.',
          ),
          check(
            'busy-no-duplicate',
            { starts: after.queueStarts, deduplicated: 'DEDUPLICATED' },
            { starts: afterDuplicate.queueStarts, deduplicated: resubmitted.status },
            'A replayed segment is deduplicated by the real pipeline ledger; no second job starts.',
          ),
          check(
            'busy-one-job',
            { jobs: 1 },
            { jobs: after.jobs },
            'Only the real closed LEARNING segment reached the queue.',
          ),
        ],
      ),
      learning: [result, resubmitted],
    };
  } finally {
    world.dispose();
  }
}

/** The three mandated HUD labels and the separate eligibility/subject fields. */
function hudCase(services: ThreeModesServices): ThreeModesScenarioCase {
  const taxi = services.vehicles.TAXI;
  const world = services.createWorld({
    scenarioId: 'case:hud-labels',
    primary: taxi,
    secondary: null,
    learningEligible: true,
  });
  try {
    world.step();
    const auto = world.hud();
    if (!world.pressKey('M')) throw new Error('217 HUD case could not enter MANUAL');
    world.step();
    const manual = world.hud();
    if (!world.pressKey('L')) throw new Error('217 HUD case could not enter LEARNING');
    world.step();
    const learning = world.hud();
    return caseOf(
      'hud-labels',
      'The HUD states the mandated AUTO/MANUAL/LEARNING labels with separate eligibility and subject.',
      [
        check(
          'hud-auto',
          { symbol: 'A', label: 'Conduce AI-ul', eligibility: 'Învățare neeligibilă' },
          { symbol: auto.symbol, label: auto.label, eligibility: auto.eligibility },
          'AUTO is labelled as the AI driving, with LEARNING ineligible.',
        ),
        check(
          'hud-manual',
          { symbol: 'M', label: 'Conduci · învățare oprită' },
          { symbol: manual.symbol, label: manual.label },
          'MANUAL states that learning is off.',
        ),
        check(
          'hud-learning',
          {
            symbol: 'L',
            label: 'Conduci · orașul învață',
            eligibility: 'Eligibil pentru învățare',
          },
          { symbol: learning.symbol, label: learning.label, eligibility: learning.eligibility },
          'LEARNING states that the city learns and shows the accepted eligibility fact.',
        ),
        check(
          'hud-subject',
          { subject: `Vehicul: ${taxi.identity.entityId}`, buttons: taxi.identity.entityId },
          {
            subject: learning.subject,
            buttons: learning.actionSubject.replace('Butoanele M/L: ', ''),
          },
          'The controlled subject and the M/L button target stay separate and named.',
        ),
      ],
    );
  } finally {
    world.dispose();
  }
}

/** MANUAL records telemetry only; eligible LEARNING publishes; ineligible LEARNING is skipped. */
async function profileEvidenceCase(services: ThreeModesServices): Promise<ThreeModesScenarioCase> {
  const taxi = services.vehicles.TAXI;
  const baseline = services.profileBaseline;

  const manualWorld = services.createWorld({
    scenarioId: 'case:profile-manual',
    primary: taxi,
    secondary: null,
    learningEligible: true,
  });
  let manualClosed: ThreeModesClosedSegment | null = null;
  let manualResult: ThreeModesLearningResultView | null = null;
  let manualLearning: ThreeModesLearningView | null = null;
  try {
    manualWorld.step();
    manualWorld.step();
    if (!manualWorld.pressKey('M')) throw new Error('217 manual evidence could not enter MANUAL');
    manualWorld.step();
    manualWorld.step();
    if (!manualWorld.pressKey('M')) throw new Error('217 manual evidence could not return to AUTO');
    manualWorld.step();
    manualClosed = manualWorld.takeClosed().at(0) ?? null;
    if (manualClosed === null) throw new Error('217 manual evidence closed no segment');
    manualResult = await manualWorld.submitSegment(manualClosed);
    manualLearning = manualWorld.learning();
  } finally {
    manualWorld.dispose();
  }

  const eligibleWorld = services.createWorld({
    scenarioId: 'case:profile-eligible',
    primary: taxi,
    secondary: null,
    learningEligible: true,
  });
  let eligibleResult: ThreeModesLearningResultView | null = null;
  let eligibleLearning: ThreeModesLearningView | null = null;
  try {
    eligibleWorld.step();
    if (!eligibleWorld.pressKey('L'))
      throw new Error('217 eligible evidence could not enter LEARNING');
    eligibleWorld.step();
    eligibleWorld.step();
    if (!eligibleWorld.pressKey('M'))
      throw new Error('217 eligible evidence could not close LEARNING');
    eligibleWorld.step();
    const closed = eligibleWorld.takeClosed().at(0) ?? null;
    if (closed === null) throw new Error('217 eligible evidence closed no segment');
    eligibleResult = await eligibleWorld.submitSegment(closed);
    eligibleLearning = eligibleWorld.learning();
  } finally {
    eligibleWorld.dispose();
  }

  const ineligibleWorld = services.createWorld({
    scenarioId: 'case:profile-ineligible',
    primary: taxi,
    secondary: null,
    learningEligible: false,
  });
  let ineligibleOpenEligible: boolean | null = null;
  let ineligibleResult: ThreeModesLearningResultView | null = null;
  let ineligibleLearning: ThreeModesLearningView | null = null;
  try {
    ineligibleWorld.step();
    if (!ineligibleWorld.pressKey('L'))
      throw new Error('217 ineligible evidence could not enter LEARNING');
    ineligibleWorld.step();
    ineligibleOpenEligible =
      ineligibleWorld
        .segments()
        .filter((entry) => entry.completeness === 'OPEN')
        .at(0)?.learningEligible ?? null;
    if (!ineligibleWorld.pressKey('M'))
      throw new Error('217 ineligible evidence could not close LEARNING');
    ineligibleWorld.step();
    const closed = ineligibleWorld.takeClosed().at(0) ?? null;
    if (closed === null) throw new Error('217 ineligible evidence closed no segment');
    ineligibleResult = await ineligibleWorld.submitSegment(closed);
    ineligibleLearning = ineligibleWorld.learning();
  } finally {
    ineligibleWorld.dispose();
  }

  return caseOf(
    'profile-evidence',
    'MANUAL records telemetry without learning, an eligible LEARNING segment publishes automatically and an ineligible one is skipped.',
    [
      check(
        'evidence-manual-record',
        { mode: 'MANUAL', eligible: false, samples: true },
        {
          mode: manualClosed?.mode ?? null,
          eligible: manualClosed?.learningEligible ?? null,
          samples: (manualClosed?.samples ?? 0) > 0,
        },
        'The MANUAL close is a real record with telemetry and learningEligible=false.',
      ),
      check(
        'evidence-manual-skip',
        {
          status: 'SKIPPED_MANUAL',
          reason: 'MANUAL_SEGMENT_NOT_LEARNABLE',
          job: false,
          version: null,
        },
        {
          status: manualResult?.status ?? null,
          reason: manualResult?.reason ?? null,
          job: manualResult?.jobSubmitted ?? null,
          version: manualResult?.versionId ?? null,
        },
        'The real 112 pipeline skips the MANUAL segment without a job or a version.',
      ),
      check(
        'evidence-manual-profile',
        {
          jobs: 0,
          versions: 0,
          parametersUnchanged: true,
        },
        {
          jobs: manualLearning?.jobs ?? null,
          versions: manualLearning?.versions ?? null,
          parametersUnchanged:
            manualLearning?.headParameters.speed_delta_urban ===
              baseline.values.speed_delta_urban && (manualLearning?.storeVersions ?? 0) === 1,
        },
        'No parameter, version or evidence left the MANUAL segment.',
      ),
      check(
        'evidence-eligible-version',
        { status: 'COMPOSED', job: true, version: true, versions: 1 },
        {
          status: eligibleResult?.status ?? null,
          job: eligibleResult?.jobSubmitted ?? false,
          version: eligibleResult?.versionId !== null && eligibleResult !== null,
          versions: eligibleLearning?.versions ?? null,
        },
        'The real 112 pipeline composed and stored a version for the eligible LEARNING segment.',
      ),
      check(
        'evidence-eligible-value',
        { changed: true, key: THREE_MODES_LEARNING_KEY, compositions: 1 },
        {
          changed:
            (eligibleLearning?.headParameters.speed_delta_urban ??
              baseline.values.speed_delta_urban) !== baseline.values.speed_delta_urban,
          key: eligibleResult?.compositionKey ?? null,
          compositions: eligibleLearning?.storeVersions === 2 ? 1 : 0,
        },
        'The published version carries the composed learning value against the real base version.',
      ),
      check(
        'evidence-ineligible-skip',
        { openEligible: false, status: 'SKIPPED_INELIGIBLE', jobs: 0, versions: 0 },
        {
          openEligible: ineligibleOpenEligible,
          status: ineligibleResult?.status ?? null,
          jobs: ineligibleLearning?.jobs ?? null,
          versions: ineligibleLearning?.versions ?? null,
        },
        'An ineligible LEARNING segment opens and closes without a learning job.',
      ),
    ],
  );
}

async function runScenarioCases(services: ThreeModesServices): Promise<CaseSummary> {
  const cases: ThreeModesScenarioCase[] = [];
  const failures: string[] = [];
  const learning: ThreeModesLearningResultView[] = [];
  const mixed = await mixedRideCase(services);
  cases.push(mixed.scenario);
  learning.push(...mixed.learning);
  cases.push(pauseCase(services));
  cases.push(remapCase(services));
  cases.push(selectionCase(services));
  cases.push(hudCase(services));
  cases.push(await profileEvidenceCase(services));
  const busy = await busyCase(services);
  cases.push(busy.scenario);
  learning.push(...busy.learning);
  for (const entry of cases) {
    if (!entry.ok) failures.push(`case:${entry.id} failed`);
    for (const checkEntry of entry.checks)
      if (!checkEntry.pass)
        failures.push(
          `case:${entry.id}:${checkEntry.name} expected ${JSON.stringify(checkEntry.expected)} got ${JSON.stringify(checkEntry.actual)}`,
        );
  }
  return Object.freeze({
    cases: Object.freeze(cases),
    failures: Object.freeze(failures),
    learningJobs: learning.filter((entry) => entry.jobSubmitted).length,
    profileVersions: new Set(
      learning
        .map((entry) => entry.versionId)
        .filter((versionId): versionId is string => versionId !== null),
    ).size,
    manualPublications: learning.filter(
      (entry) => entry.mode === 'MANUAL' && entry.versionId !== null,
    ).length,
  });
}

const ORACLE_RULE =
  'The harness drives the real 066 seat, real 067 M/L intents from the real 080 bindings, real 068 selection, real 069 segments, real 070 pause/focus, real 103 queue and real 112 pipeline one accepted tick at a time. Every transition must close the previous segment and open the next one with the right mode/eligibility without changing speed, heading or the per-tick position step, and must leave at most one PLAYER seat. MANUAL records telemetry but never a learning job, parameter change or evidence; an eligible closed LEARNING segment publishes through the real 112 pipeline and an ineligible one is skipped. The latency probe is a local single-process measurement over bounded samples, not an FPS, GPU or hardware result.';

export async function runThreeModesMatrix(
  services: ThreeModesServices,
): Promise<ThreeModesMatrixReport> {
  const rows: ThreeModesMatrixRow[] = [];
  const failures: string[] = [];
  for (const kind of THREE_MODE_KINDS) {
    for (const transition of THREE_MODE_TRANSITIONS) {
      try {
        const row = await runTransition(services, kind, transition);
        rows.push(row);
        if (!row.ok) for (const failure of row.failures) failures.push(`${kind}:${failure}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${kind}:${transition.id}: ${message}`);
        rows.push(failedRow(kind, transition, message));
      }
    }
  }
  const summary = await runScenarioCases(services);
  failures.push(...summary.failures);
  const counts: ThreeModesCounts = Object.freeze({
    transitions: THREE_MODE_TRANSITIONS.length,
    transitionRows: rows.length,
    scenarios: summary.cases.length,
    segments: rows.filter((row) => row.closed.segmentId !== null || row.opened.segmentId !== null)
      .length,
    closedSegments: rows.filter((row) => row.closed.segmentId !== null).length,
    manualClosed: rows.filter((row) => row.closed.mode === 'MANUAL').length,
    learningClosed: rows.filter((row) => row.closed.mode === 'LEARNING').length,
    maxPlayerSeats: rows.reduce((max, row) => Math.max(max, row.seat.count), 0),
    learningJobs: summary.learningJobs,
    profileVersions: summary.profileVersions,
    manualPublications: summary.manualPublications,
  });
  return Object.freeze({
    version: THREE_MODES_VERSION,
    oracleRule: ORACLE_RULE,
    limits: THREE_MODES_LIMITS,
    transitions: THREE_MODE_TRANSITIONS,
    rows: Object.freeze(rows),
    cases: summary.cases,
    counts,
    failures: Object.freeze(failures),
    pass: failures.length === 0 && rows.every((row) => row.ok),
  });
}

/**
 * Local, provisional input-latency probe.
 *
 * Measures, in one Node process and with no parallel work: mode intent -> accepted transition tick,
 * selection change -> accepted camera target, and LEARNING segment close -> 103 queue admission
 * while the worker is busy with a secondary job. It never claims FPS, GPU or hardware numbers.
 */
export async function measureThreeModeLatency(
  services: ThreeModesServices,
): Promise<ThreeModesLatencyReport> {
  const failures: string[] = [];
  const taxi = services.vehicles.TAXI;
  const civil = services.vehicles.CIVIL;

  const modeSamples: number[] = [];
  {
    const world = services.createWorld({
      scenarioId: 'latency:mode-intent',
      primary: taxi,
      secondary: null,
      learningEligible: true,
    });
    try {
      world.step();
      for (let index = 0; index < THREE_MODES_LIMITS.modeSamples; index += 1) {
        const before = world.mode();
        const startedAt = now();
        const accepted = world.pressKey('M');
        world.step();
        const elapsed = now() - startedAt;
        if (!accepted) failures.push(`latency:mode-intent refused at sample ${index}`);
        if (world.mode() === before)
          failures.push(`latency:mode-intent did not change at ${index}`);
        modeSamples.push(elapsed);
      }
      world.takeClosed();
    } finally {
      world.dispose();
    }
  }

  const selectionSamples: number[] = [];
  {
    const world = services.createWorld({
      scenarioId: 'latency:selection',
      primary: taxi,
      secondary: civil,
      learningEligible: true,
    });
    try {
      world.step();
      for (let index = 0; index < THREE_MODES_LIMITS.selectionSamples; index += 1) {
        const target = index % 2 === 0 ? civil.identity : taxi.identity;
        const startedAt = now();
        world.select(target);
        world.step();
        const elapsed = now() - startedAt;
        if (world.cameraTarget() !== target)
          failures.push(`latency:selection did not reach the target at sample ${index}`);
        if (world.seat() !== null)
          failures.push(`latency:selection took a seat at sample ${index}`);
        selectionSamples.push(elapsed);
      }
      world.takeClosed();
    } finally {
      world.dispose();
    }
  }

  const admissionSamples: number[] = [];
  let busySamples = 0;
  let admissions = 0;
  let duplicateJobs = 0;
  let scene = 0;
  while (admissionSamples.length < THREE_MODES_LIMITS.admissionSamples) {
    scene += 1;
    const world = services.createWorld({
      scenarioId: `latency:admission:${scene}`,
      primary: taxi,
      secondary: null,
      learningEligible: true,
    });
    try {
      world.step();
      const remaining = THREE_MODES_LIMITS.admissionSamples - admissionSamples.length;
      const perScene = Math.min(THREE_MODES_LIMITS.segmentsPerLatencyScene, remaining);
      for (let index = 0; index < perScene; index += 1) {
        if (!world.pressKey('L')) throw new Error('217 admission probe could not open LEARNING');
        world.step();
        world.step();
        await world.occupyQueue(`secondary:${scene}:${index}`);
        const busy = world.learning();
        if (busy.queueActive !== 1)
          failures.push(`latency:admission worker was not busy in scene ${scene} sample ${index}`);
        else busySamples += 1;
        if (!world.pressKey('M')) throw new Error('217 admission probe could not close LEARNING');
        world.step();
        const closed = world.takeClosed().filter((entry) => entry.mode === 'LEARNING');
        if (closed.length !== 1)
          throw new Error('217 admission probe closed a non-LEARNING segment');
        const startedAt = now();
        const promise = world.submitSegment(closed[0]!);
        const elapsed = now() - startedAt;
        const result = await promise;
        if (!result.jobSubmitted)
          failures.push(`latency:admission not admitted in scene ${scene} sample ${index}`);
        else admissions += 1;
        admissionSamples.push(elapsed);
        const before = world.learning();
        const replay = await world.submitSegment(closed[0]!);
        const after = world.learning();
        const replayed = replay.status === 'DEDUPLICATED' || replay.reason === 'DUPLICATE_SEGMENT';
        if (!replayed)
          failures.push(
            `latency:admission replay was ${replay.status}/${replay.reason ?? ''} in scene ${scene}`,
          );
        if (after.queueStarts !== before.queueStarts)
          failures.push(`latency:admission replay started a job in scene ${scene}`);
        duplicateJobs += after.queueStarts - before.queueStarts;
      }
      world.takeClosed();
    } finally {
      world.dispose();
    }
  }

  const modeStats = statsOf(modeSamples, 'mode intent');
  const selectionStats = statsOf(selectionSamples, 'selection change');
  const admissionStats = statsOf(admissionSamples, 'queue admission');
  const tickMs = 1000 / THREE_MODES_LIMITS.tickHz;
  return Object.freeze({
    version: THREE_MODES_VERSION,
    level: 'full' as const,
    scope: 'LOCAL_NODE_SINGLE_PROCESS' as const,
    provisional: true as const,
    hardwareClaim: 'NOT_MEASURED' as const,
    fpsClaim: 'NOT_MEASURED' as const,
    gpuClaim: 'NOT_MEASURED' as const,
    rule: 'Local deterministic probe: mode intent -> accepted transition tick, selection change -> accepted camera target and LEARNING close -> 103 queue admission with a busy serial worker. Bounded samples, single process, no parallel hardware probe, no FPS/GPU/hardware claim.',
    modeIntentToAcceptedTransition: modeStats,
    selectionChangeToCameraTarget: selectionStats,
    learningSegmentCloseToQueueAdmission: Object.freeze({
      ...admissionStats,
      busyWorker: true as const,
      busySamples,
      admissions,
      duplicateJobs,
    }),
    budget: Object.freeze({
      tickMs: round4(tickMs),
      modeIntentWithinTick: modeStats.p95Ms < tickMs,
      selectionChangeWithinTick: selectionStats.p95Ms < tickMs,
      note: 'Informational local observation only: p95 below one 60 Hz tick on this machine is not an FPS, GPU or hardware result and is never a pass/fail gate.',
    }),
    failures: Object.freeze(failures),
  });
}
