import {
  CHALLENGE_DIRECTOR_LIMITS,
  CHALLENGE_DIRECTOR_STATE_VERSION,
  CHALLENGE_DIRECTOR_TRANSITIONS,
  CHALLENGE_DIRECTOR_VERSION,
  challengeCancellationReasons,
  challengeDirectorRefusals,
  challengeInstanceStates,
  createChallengeDirector,
} from '../../src/missions';
import type { ChallengeDirector, ChallengeDirectorInstance } from '../../src/missions';
import {
  DIRECTOR_FIXTURE_SEED,
  DIRECTOR_SESSION_ID,
  DIRECTOR_TAXI_ID,
  DIRECTOR_WORLD_EPOCH,
  createDirectorFixture,
  directorFacts,
  directorRoutes,
  directorWorld,
  directorWorldAt,
} from './challenge-director-fixture';

/**
 * Deterministic report for PBI 232.
 *
 * No wall clock, no random source and no browser participate. The director seed, the simulated tick
 * and every route estimate are explicit, so the transcript is byte-stable and `--check` can prove
 * the committed report is current.
 */
export const CHALLENGE_DIRECTOR_REPORT_VERSION = '232-challenge-director-report-v1' as const;

export interface ChallengeDirectorCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ChallengeDirectorScenarioRow {
  readonly name: string;
  readonly status: 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'ACTIVE' | 'REFUSED';
  readonly code: string | null;
  readonly detail: readonly string[];
}

export interface ChallengeDirectorLifecycleRow {
  readonly templateId: string;
  readonly family: string;
  readonly seed: number;
  readonly attempt: number;
  readonly state: string;
  readonly reason: string | null;
  readonly startedTick: number | null;
  readonly deadlineTick: number;
  readonly durationTicks: number;
  readonly completedAtTick: number | null;
  readonly xpEligible: boolean;
  readonly academyXp: number;
  readonly transitions: number;
}

function fail(message: string): never {
  throw new Error(message);
}

function offered(director: ChallengeDirector, seed?: number): ChallengeDirectorInstance {
  const result = director.offer({
    world: directorWorldAt(director),
    ...(seed === undefined ? {} : { seed }),
  });
  if (result.status !== 'OFFERED') fail(`Expected an offer, got ${result.code}`);
  return result.instance;
}

function acceptInstance(
  director: ChallengeDirector,
  instanceId: string,
): ChallengeDirectorInstance {
  const result = director.accept({
    instanceId,
    taxi: { taxiId: DIRECTOR_TAXI_ID, status: 'AVAILABLE', freeTaxis: 3 },
    assignment: null,
    passengerAboard: false,
  });
  if (result.status !== 'ACCEPTED') fail(`Expected an acceptance, got ${result.code}`);
  return result.instance;
}

function activateInstance(
  director: ChallengeDirector,
  instanceId: string,
): ChallengeDirectorInstance {
  const result = director.activate({ instanceId });
  if (result.status !== 'ACTIVE') fail(`Expected activation, got ${result.code}`);
  return result.instance;
}

function row(instance: ChallengeDirectorInstance): ChallengeDirectorLifecycleRow {
  return Object.freeze({
    templateId: instance.templateId,
    family: instance.family,
    seed: instance.seed,
    attempt: instance.attempt,
    state: instance.state,
    reason: instance.outcome === null ? null : instance.outcome.reason,
    startedTick: instance.activatedAtTick,
    deadlineTick: instance.objective.deadlineTick,
    durationTicks: instance.durationTicks,
    completedAtTick: instance.endedAtTick,
    xpEligible: instance.outcome === null ? false : instance.outcome.reward.xpEligible,
    academyXp: instance.outcome === null ? 0 : instance.outcome.reward.academyXp,
    transitions: instance.transitions.length,
  });
}

type ScenarioInput = Omit<ChallengeDirectorScenarioRow, 'name'>;

function refusalOf(code: string | null, detail: readonly string[] = []): ScenarioInput {
  return Object.freeze({
    status: 'REFUSED' as const,
    code,
    detail: Object.freeze([...detail]),
  });
}

function scenario(name: string, result: ScenarioInput): ChallengeDirectorScenarioRow {
  return Object.freeze({ ...result, name });
}

function runPreflightScenarios(): readonly ChallengeDirectorScenarioRow[] {
  const rows: ChallengeDirectorScenarioRow[] = [];

  {
    const director = createDirectorFixture();
    const offer = director.offer({
      world: directorWorldAt(director, {
        taxiStatus: 'ASSIGNED',
        freeTaxis: 2,
        passengerAboard: true,
        assignment: {
          assignmentId: 'assignment:fixture:1',
          requestId: 'request:fixture:1',
          taxiId: DIRECTOR_TAXI_ID,
          customerId: 'customer:fixture:1',
        },
      }),
    });
    rows.push(
      scenario(
        'offer_during_ride',
        offer.status === 'OFFERED'
          ? {
              status: 'OFFERED',
              code: null,
              detail: [
                `ride:${offer.interruption.ride}`,
                `passenger:${offer.interruption.passenger}`,
                `cancelled:${String(offer.interruption.rideCancelled)}`,
              ],
            }
          : { status: 'REFUSED', code: offer.code, detail: offer.detail },
      ),
    );
    const refusal =
      offer.status === 'OFFERED'
        ? director.accept({
            instanceId: offer.instance.instanceId,
            taxi: { taxiId: DIRECTOR_TAXI_ID, status: 'ASSIGNED', freeTaxis: 2 },
            assignment: {
              assignmentId: 'assignment:fixture:1',
              requestId: 'request:fixture:1',
              taxiId: DIRECTOR_TAXI_ID,
              customerId: 'customer:fixture:1',
            },
            passengerAboard: true,
          })
        : null;
    rows.push(
      scenario(
        'accept_passenger_aboard',
        refusal !== null && refusal.status === 'REFUSED'
          ? refusalOf(refusal.code, refusal.detail)
          : refusalOf(null, ['unexpected:accepted']),
      ),
    );
  }

  {
    const director = createDirectorFixture();
    const offer = offered(director);
    const second = director.offer({ world: directorWorldAt(director) });
    rows.push(
      scenario(
        'duplicate_offer',
        second.status === 'REFUSED' ? refusalOf(second.code, second.detail) : refusalOf(null),
      ),
    );
    acceptInstance(director, offer.instanceId);
    activateInstance(director, offer.instanceId);
    const third = director.offer({ world: directorWorldAt(director) });
    rows.push(
      scenario(
        'duplicate_instance',
        third.status === 'REFUSED' ? refusalOf(third.code, third.detail) : refusalOf(null),
      ),
    );
    const duplicateAccept = director.accept({
      instanceId: offer.instanceId,
      taxi: { taxiId: DIRECTOR_TAXI_ID, status: 'AVAILABLE', freeTaxis: 3 },
      assignment: null,
      passengerAboard: false,
    });
    rows.push(
      scenario('duplicate_accept', {
        status: 'ACCEPTED',
        code:
          duplicateAccept.status === 'ACCEPTED' && duplicateAccept.duplicate ? 'DUPLICATE' : null,
        detail: [],
      }),
    );
  }

  {
    const director = createDirectorFixture();
    const offer = offered(director);
    const assigned = director.accept({
      instanceId: offer.instanceId,
      taxi: { taxiId: DIRECTOR_TAXI_ID, status: 'ASSIGNED', freeTaxis: 1 },
      assignment: {
        assignmentId: 'assignment:fixture:2',
        requestId: 'request:fixture:2',
        taxiId: DIRECTOR_TAXI_ID,
        customerId: 'customer:fixture:2',
      },
      passengerAboard: false,
    });
    rows.push(
      scenario(
        'accept_taxi_assigned',
        assigned.status === 'REFUSED' ? refusalOf(assigned.code, assigned.detail) : refusalOf(null),
      ),
    );
  }

  {
    const director = createDirectorFixture();
    const offer = offered(director);
    director.decline({ instanceId: offer.instanceId });
    const blocked = director.offer({ world: directorWorldAt(director) });
    rows.push(
      scenario(
        'cooldown_after_decline',
        blocked.status === 'REFUSED' ? refusalOf(blocked.code, blocked.detail) : refusalOf(null),
      ),
    );
  }

  {
    const director = createDirectorFixture();
    const offer = offered(director);
    director.setOffersEnabled({ enabled: false });
    const disabled = director.offer({ world: directorWorldAt(director) });
    rows.push(
      scenario(
        'toggle_off',
        disabled.status === 'REFUSED' ? refusalOf(disabled.code, disabled.detail) : refusalOf(null),
      ),
    );
    director.setOffersEnabled({ enabled: true });
    const retracted = director.instance(offer.instanceId);
    rows.push(
      scenario('toggle_retracts_offer', {
        status: 'REFUSED',
        code: retracted === undefined ? null : retracted.state,
        detail: [],
      }),
    );
  }

  {
    const director = createDirectorFixture();
    const offer = offered(director);
    director.decline({ instanceId: offer.instanceId });
    const transfer = director.offer({
      world: directorWorldAt(director, { transferInProgress: true }),
    });
    rows.push(
      scenario(
        'session_transfer',
        transfer.status === 'REFUSED' ? refusalOf(transfer.code, transfer.detail) : refusalOf(null),
      ),
    );
    const mismatch = director.offer({
      world: directorWorldAt(director, { sessionId: 'session:other', worldEpoch: 2 }),
    });
    rows.push(
      scenario(
        'session_mismatch',
        mismatch.status === 'REFUSED' ? refusalOf(mismatch.code, mismatch.detail) : refusalOf(null),
      ),
    );
    director.advance({ ticks: CHALLENGE_DIRECTOR_LIMITS.cooldownTicks, paused: false });
    const noTaxi = director.offer({
      world: directorWorldAt(director, { taxiStatus: 'OFFLINE', freeTaxis: 0 }),
    });
    rows.push(
      scenario(
        'no_free_taxi',
        noTaxi.status === 'REFUSED' ? refusalOf(noTaxi.code, noTaxi.detail) : refusalOf(null),
      ),
    );
  }

  {
    const unreachable = createDirectorFixture({ routes: directorRoutes({ reachable: false }) });
    const blocked = unreachable.offer({ world: directorWorldAt(unreachable) });
    rows.push(
      scenario(
        'route_unreachable',
        blocked.status === 'REFUSED' ? refusalOf(blocked.code, blocked.detail) : refusalOf(null),
      ),
    );
    const slow = createDirectorFixture({ routes: directorRoutes({ seconds: 900 }) });
    const infeasible = slow.offer({ world: directorWorldAt(slow) });
    rows.push(
      scenario(
        'deadline_infeasible',
        infeasible.status === 'REFUSED'
          ? refusalOf(infeasible.code, infeasible.detail)
          : refusalOf(null),
      ),
    );
  }

  {
    const director = createDirectorFixture();
    const offer = offered(director);
    acceptInstance(director, offer.instanceId);
    activateInstance(director, offer.instanceId);
    const otherTaxi = director.changeVehicle({
      instanceId: offer.instanceId,
      taxiId: 'taxi:other',
    });
    rows.push(
      scenario(
        'bound_to_taxi',
        otherTaxi.status === 'REFUSED'
          ? refusalOf(otherTaxi.code, otherTaxi.detail)
          : refusalOf(null),
      ),
    );
    const cancelled = director.cancel({ instanceId: offer.instanceId, reason: 'PLAYER_CANCELLED' });
    const revived = director.activate({ instanceId: offer.instanceId });
    rows.push(
      scenario(
        'terminal_is_final',
        cancelled.status === 'CANCELLED' && revived.status === 'REFUSED'
          ? refusalOf(revived.code, revived.detail)
          : refusalOf(null),
      ),
    );
  }

  {
    const director = createDirectorFixture();
    const offer = offered(director);
    acceptInstance(director, offer.instanceId);
    let active = activateInstance(director, offer.instanceId);
    for (let attempt = 2; attempt <= CHALLENGE_DIRECTOR_LIMITS.attemptsPerTemplate; attempt += 1) {
      const restarted = director.restart({
        instanceId: active.instanceId,
        capabilities: directorWorld().capabilities,
        seed: 2_000 + attempt,
      });
      if (restarted.status !== 'ACTIVE') fail(`Expected restart ${String(attempt)}`);
      active = restarted.instance;
    }
    const refused = director.restart({
      instanceId: active.instanceId,
      capabilities: directorWorld().capabilities,
    });
    rows.push(
      scenario(
        'attempt_limit',
        refused.status === 'REFUSED' ? refusalOf(refused.code, refused.detail) : refusalOf(null),
      ),
    );
  }

  return Object.freeze(rows);
}

interface LifecycleOutcome {
  readonly rows: readonly ChallengeDirectorLifecycleRow[];
  readonly totals: Readonly<Record<string, number>>;
  readonly completed: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly declined: number;
  readonly expired: number;
  readonly rewardKeys: number;
  readonly academyXp: number;
}

function runLifecycle(): LifecycleOutcome {
  const director = createDirectorFixture();
  const rows: ChallengeDirectorLifecycleRow[] = [];

  // Three declined offers, each separated by the real cooldown.
  for (let index = 0; index < 3; index += 1) {
    const offer = offered(director);
    const result = director.decline({ instanceId: offer.instanceId });
    if (result.status !== 'DECLINED') fail('Expected a decline');
    rows.push(row(director.instance(offer.instanceId)!));
    director.advance({ ticks: CHALLENGE_DIRECTOR_LIMITS.cooldownTicks, paused: false });
  }

  // One completion with the real evaluator.
  const completedOffer = offered(director);
  acceptInstance(director, completedOffer.instanceId);
  const active = activateInstance(director, completedOffer.instanceId);
  const completed = director.evaluate({
    instanceId: completedOffer.instanceId,
    facts: directorFacts(active, { endedTick: active.objective.deadlineTick }),
  });
  if (completed.status !== 'COMPLETED') fail(`Expected completion, got ${completed.status}`);
  rows.push(row(director.instance(completedOffer.instanceId)!));
  director.advance({ ticks: CHALLENGE_DIRECTOR_LIMITS.cooldownTicks, paused: false });

  // One deadline failure inside the real simulated clock.
  const failedOffer = offered(director);
  acceptInstance(director, failedOffer.instanceId);
  const failedActive = activateInstance(director, failedOffer.instanceId);
  director.advance({ ticks: failedActive.objective.deadlineTick, paused: false });
  rows.push(row(director.instance(failedOffer.instanceId)!));
  director.advance({ ticks: CHALLENGE_DIRECTOR_LIMITS.cooldownTicks, paused: false });

  // One explicit cancellation.
  const cancelledOffer = offered(director);
  acceptInstance(director, cancelledOffer.instanceId);
  activateInstance(director, cancelledOffer.instanceId);
  const cancelled = director.cancel({
    instanceId: cancelledOffer.instanceId,
    reason: 'PLAYER_CANCELLED',
  });
  if (cancelled.status !== 'CANCELLED') fail('Expected a cancellation');
  rows.push(row(director.instance(cancelledOffer.instanceId)!));
  director.advance({ ticks: CHALLENGE_DIRECTOR_LIMITS.cooldownTicks, paused: false });

  // One unanswered offer that expires.
  const expiredOffer = offered(director);
  director.advance({ ticks: CHALLENGE_DIRECTOR_LIMITS.offerWindowTicks, paused: false });
  rows.push(row(director.instance(expiredOffer.instanceId)!));

  const stats = director.stats();
  const rewardKeys = rows.filter((entry) => entry.xpEligible).length;
  return Object.freeze({
    rows: Object.freeze(rows),
    totals: stats.totals,
    completed: stats.completed,
    failed: stats.failed,
    cancelled: stats.cancelled,
    declined: stats.declined,
    expired: stats.expiredOffers,
    rewardKeys,
    academyXp: rows.reduce((total, entry) => total + entry.academyXp, 0),
  });
}

interface ReloadOutcome {
  readonly instanceId: string;
  readonly templateId: string;
  readonly seed: number;
  readonly samePlan: boolean;
  readonly sameDeadline: boolean;
  readonly sameFingerprint: boolean;
  readonly sameRewardKey: boolean;
  readonly snapshotBytes: number;
}

function runReload(): ReloadOutcome {
  const director = createDirectorFixture();
  const offer = offered(director, 987_654);
  acceptInstance(director, offer.instanceId);
  activateInstance(director, offer.instanceId);
  director.advance({ ticks: 600, paused: false });
  const before = director.instance(offer.instanceId)!;
  const snapshot = director.snapshot();
  const reloaded = createChallengeDirector({
    seed: DIRECTOR_FIXTURE_SEED,
    routes: directorRoutes(),
  });
  const restored = reloaded.restore(JSON.parse(JSON.stringify(snapshot)) as unknown);
  if (restored.status !== 'RESTORED') fail('Expected a restored snapshot');
  const after = reloaded.instance(offer.instanceId)!;
  const facts = directorFacts(after);
  const original = director.evaluate({ instanceId: before.instanceId, facts });
  const replayed = reloaded.evaluate({ instanceId: after.instanceId, facts });
  if (original.status !== 'COMPLETED' || replayed.status !== 'COMPLETED')
    fail('Expected both reload runs to complete');
  return Object.freeze({
    instanceId: after.instanceId,
    templateId: after.templateId,
    seed: after.seed,
    samePlan: JSON.stringify(before.objective) === JSON.stringify(after.objective),
    sameDeadline: before.durationTicks === after.durationTicks,
    sameFingerprint: original.verdict!.fingerprint === replayed.verdict!.fingerprint,
    sameRewardKey:
      original.instance.outcome!.reward.rewardKey === replayed.instance.outcome!.reward.rewardKey,
    snapshotBytes: Buffer.byteLength(JSON.stringify(snapshot)),
  });
}

interface HistoryOutcome {
  readonly entries: number;
  readonly dropped: number;
  readonly codeUnits: number;
  readonly capEntries: number;
  readonly capCodeUnits: number;
  readonly distinctTemplates: number;
  readonly bytes: number;
}

function runHistory(): HistoryOutcome {
  const director = createDirectorFixture();
  for (let index = 0; index < CHALLENGE_DIRECTOR_LIMITS.historyEntries + 6; index += 1) {
    const offer = offered(director);
    director.decline({ instanceId: offer.instanceId });
    director.advance({ ticks: CHALLENGE_DIRECTOR_LIMITS.cooldownTicks, paused: false });
  }
  const stats = director.stats();
  return Object.freeze({
    entries: stats.history,
    dropped: stats.droppedHistory,
    codeUnits: stats.historyCodeUnits,
    capEntries: CHALLENGE_DIRECTOR_LIMITS.historyEntries,
    capCodeUnits: CHALLENGE_DIRECTOR_LIMITS.historyCodeUnits,
    distinctTemplates: new Set(director.history().map((entry) => entry.templateId)).size,
    bytes: Buffer.byteLength(JSON.stringify(director.history())),
  });
}

interface ProbeOutcome {
  readonly offers: number;
  readonly routeProbes: number;
  readonly maxProbesPerOffer: number;
  readonly attemptsWithoutProbe: number;
}

function runProbes(): ProbeOutcome {
  const calls = { count: 0 };
  const director = createDirectorFixture({ routes: directorRoutes({ calls }) });
  let maxProbesPerOffer = 0;
  let offers = 0;
  for (let index = 0; index < 6; index += 1) {
    const before = calls.count;
    const offer = offered(director);
    offers += 1;
    maxProbesPerOffer = Math.max(maxProbesPerOffer, calls.count - before);
    director.decline({ instanceId: offer.instanceId });
    director.advance({ ticks: CHALLENGE_DIRECTOR_LIMITS.cooldownTicks, paused: false });
  }
  const afterOffers = calls.count;
  director.advance({ ticks: 10_000, paused: false });
  return Object.freeze({
    offers,
    routeProbes: afterOffers,
    maxProbesPerOffer,
    attemptsWithoutProbe: calls.count - afterOffers,
  });
}

export interface ChallengeDirectorReport {
  readonly version: typeof CHALLENGE_DIRECTOR_REPORT_VERSION;
  readonly contract: Readonly<{
    directorVersion: string;
    stateVersion: string;
    seed: number;
    sessionId: string;
    worldEpoch: number;
    tickHz: number;
    states: readonly string[];
    terminalStates: readonly string[];
    refusals: readonly string[];
    cancellationReasons: readonly string[];
    transitions: Readonly<Record<string, readonly string[]>>;
    limits: Readonly<{
      activeOffers: number;
      activeInstances: number;
      cooldownTicks: number;
      offerWindowTicks: number;
      recentTemplates: number;
      historyEntries: number;
      historyCodeUnits: number;
      retainedOutcomes: number;
      outcomeCodeUnits: number;
      routeProbesPerOffer: number;
      attemptsPerTemplate: number;
      feasibilitySlackSeconds: number;
      transitionsPerInstance: number;
    }>;
  }>;
  readonly preflight: readonly ChallengeDirectorScenarioRow[];
  readonly lifecycle: Readonly<{
    rows: readonly ChallengeDirectorLifecycleRow[];
    totals: Readonly<Record<string, number>>;
    completed: number;
    failed: number;
    cancelled: number;
    declined: number;
    expired: number;
    rewardKeys: number;
    academyXp: number;
  }>;
  readonly reload: ReloadOutcome;
  readonly history: HistoryOutcome;
  readonly probes: ProbeOutcome;
  readonly performance: Readonly<{
    readonly simulation: Readonly<{
      offers: number;
      refusals: number;
      routeProbes: number;
      maxProbesPerOffer: number;
      clock: 'NOT_MEASURED';
    }>;
    readonly memory: Readonly<{
      snapshotBytes: number;
      historyBytes: number;
      historyEntries: number;
      historyCodeUnits: number;
      retainedOutcomesCap: number;
      manifestHistoryBudget: 'NULL_IN_MANIFEST';
      admissionCap: 'PROVISIONAL_FINITE';
    }>;
    readonly storage: Readonly<{
      snapshotFields: number;
      instanceFields: number;
      stateVersion: string;
      reloadIdentity: string;
      clock: 'NOT_MEASURED';
    }>;
  }>;
  readonly checks: readonly ChallengeDirectorCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): ChallengeDirectorCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function countRefusals(rows: readonly ChallengeDirectorScenarioRow[]): number {
  return rows.filter((entry) => entry.status === 'REFUSED').length;
}

function scenarioRow(
  rows: readonly ChallengeDirectorScenarioRow[],
  name: string,
): ChallengeDirectorScenarioRow {
  const found = rows.find((entry) => entry.name === name);
  if (found === undefined) fail(`Missing preflight scenario: ${name}`);
  return found;
}

export function runChallengeDirectorReport(): ChallengeDirectorReport {
  const preflight = runPreflightScenarios();
  const lifecycle = runLifecycle();
  const reload = runReload();
  const history = runHistory();
  const probes = runProbes();
  const refusalCodes = new Set(
    preflight.map((entry) => entry.code).filter((code): code is string => code !== null),
  );

  const checks: ChallengeDirectorCheck[] = [];
  checks.push(
    check(
      'director-version',
      '232-challenge-director-v1',
      CHALLENGE_DIRECTOR_VERSION,
      'versioned contract',
    ),
    check(
      'state-version',
      '232-challenge-director-state-v1',
      CHALLENGE_DIRECTOR_STATE_VERSION,
      'versioned snapshot',
    ),
    check('states', 8, challengeInstanceStates.length, 'closed lifecycle states'),
    check('one-visible-offer', 1, CHALLENGE_DIRECTOR_LIMITS.activeOffers, 'at most one offer'),
    check(
      'one-live-instance',
      1,
      CHALLENGE_DIRECTOR_LIMITS.activeInstances,
      'at most one instance',
    ),
    check(
      'cooldown',
      10_800,
      CHALLENGE_DIRECTOR_LIMITS.cooldownTicks,
      'three active minutes at 60 Hz',
    ),
    check(
      'offer-window',
      2_700,
      CHALLENGE_DIRECTOR_LIMITS.offerWindowTicks,
      'forty-five active seconds',
    ),
    check(
      'recent-templates',
      3,
      CHALLENGE_DIRECTOR_LIMITS.recentTemplates,
      'anti-repetition window',
    ),
    check('history-cap', 24, history.capEntries, 'finite history entries'),
    check('history-units', 4_096, history.capCodeUnits, 'finite history code units'),
    check('attempt-cap', 8, CHALLENGE_DIRECTOR_LIMITS.attemptsPerTemplate, 'per-template attempts'),
  );

  checks.push(
    check(
      'offer-during-ride',
      'OFFERED',
      scenarioRow(preflight, 'offer_during_ride').status,
      'an offer never interrupts a ride',
    ),
    check(
      'offer-during-ride-ride',
      'ride:assignment:fixture:1',
      scenarioRow(preflight, 'offer_during_ride').detail[0] ?? null,
      'the real assignment is echoed unchanged',
    ),
    check(
      'offer-during-ride-passenger',
      'passenger:customer:fixture:1',
      scenarioRow(preflight, 'offer_during_ride').detail[1] ?? null,
      'the real passenger is echoed unchanged',
    ),
    check(
      'accept-passenger-aboard',
      'PASSENGER_ABOARD',
      scenarioRow(preflight, 'accept_passenger_aboard').code,
      'the existing passenger is never abandoned',
    ),
    check(
      'duplicate-offer',
      'OFFER_ALREADY_ACTIVE',
      scenarioRow(preflight, 'duplicate_offer').code,
      'a second offer is refused explicitly',
    ),
    check(
      'duplicate-instance',
      'INSTANCE_ALREADY_ACTIVE',
      scenarioRow(preflight, 'duplicate_instance').code,
      'a second live instance is refused',
    ),
    check(
      'duplicate-accept',
      'DUPLICATE',
      scenarioRow(preflight, 'duplicate_accept').code,
      'accepting twice reserves nothing twice',
    ),
    check(
      'cooldown',
      'COOLDOWN_ACTIVE',
      scenarioRow(preflight, 'cooldown_after_decline').code,
      'the cooldown blocks the next offer',
    ),
    check(
      'toggle-off',
      'OFFERS_DISABLED',
      scenarioRow(preflight, 'toggle_off').code,
      'the toggle stops offers',
    ),
    check(
      'toggle-retract',
      'EXPIRED',
      scenarioRow(preflight, 'toggle_retracts_offer').code,
      'disabling retracts the visible offer',
    ),
    check(
      'session-transfer',
      'SESSION_TRANSFER_IN_PROGRESS',
      scenarioRow(preflight, 'session_transfer').code,
      'a transfer blocks generation',
    ),
    check(
      'session-mismatch',
      'SESSION_INVALID',
      scenarioRow(preflight, 'session_mismatch').code,
      'the session is checked',
    ),
    check(
      'no-free-taxi',
      'NO_FREE_TAXI',
      scenarioRow(preflight, 'no_free_taxi').code,
      'a dispatch is never interrupted',
    ),
    check(
      'accept-taxi-assigned',
      'TAXI_ASSIGNED',
      scenarioRow(preflight, 'accept_taxi_assigned').code,
      'the existing assignment is never replaced',
    ),
    check(
      'route-unreachable',
      'NO_ELIGIBLE_TEMPLATE',
      scenarioRow(preflight, 'route_unreachable').code,
      'an unreachable route excludes every candidate',
    ),
    check(
      'route-unreachable-detail',
      true,
      scenarioRow(preflight, 'route_unreachable').detail.some((entry) =>
        entry.startsWith('ROUTE_UNREACHABLE:'),
      ),
      'the refusal names the template and zone',
    ),
    check(
      'deadline-infeasible',
      'NO_ELIGIBLE_TEMPLATE',
      scenarioRow(preflight, 'deadline_infeasible').code,
      'an infeasible deadline excludes every candidate',
    ),
    check(
      'deadline-infeasible-detail',
      true,
      scenarioRow(preflight, 'deadline_infeasible').detail.some((entry) =>
        entry.startsWith('DEADLINE_INFEASIBLE:'),
      ),
      'the refusal names the real estimate',
    ),
    check(
      'bound-to-taxi',
      'BOUND_TO_TAXI',
      scenarioRow(preflight, 'bound_to_taxi').code,
      'a change of car never duplicates',
    ),
    check(
      'terminal-is-final',
      'INVALID_STATE',
      scenarioRow(preflight, 'terminal_is_final').code,
      'a cancelled instance cannot restart',
    ),
    check(
      'attempt-limit',
      'ATTEMPT_LIMIT',
      scenarioRow(preflight, 'attempt_limit').code,
      'R is bounded per template',
    ),
    check(
      'refusal-codes-exercised',
      true,
      refusalCodes.size >= 12,
      'the report exercises the closed refusal vocabulary',
    ),
  );

  checks.push(
    check(
      'lifecycle-rows',
      7,
      lifecycle.rows.length,
      'decline, completion, failure, cancel, expiry',
    ),
    check('declined', 3, lifecycle.declined, 'three real declines'),
    check('completed', 1, lifecycle.completed, 'one real evaluator completion'),
    check('failed', 1, lifecycle.failed, 'one real deadline failure'),
    check('cancelled', 1, lifecycle.cancelled, 'one explicit cancellation'),
    check('expired', 1, lifecycle.expired, 'one unanswered offer'),
    check('totals-offered', 7, lifecycle.totals.OFFERED, 'every lifecycle started from an offer'),
    check('totals-accepted', 3, lifecycle.totals.ACCEPTED, 'three offers were accepted'),
    check('totals-active', 3, lifecycle.totals.ACTIVE, 'three instances started'),
    check('reward-keys', 1, lifecycle.rewardKeys, 'only the completion is XP-eligible'),
    check('academy-xp', true, lifecycle.academyXp > 0, 'the authored XP is recorded, not paid'),
  );

  checks.push(
    check('reload-plan', true, reload.samePlan, 'the objective snapshot is byte-identical'),
    check(
      'reload-deadline',
      true,
      reload.sameDeadline,
      'the remaining simulated time is identical',
    ),
    check(
      'reload-fingerprint',
      true,
      reload.sameFingerprint,
      'the verdict fingerprint is identical',
    ),
    check('reload-reward-key', true, reload.sameRewardKey, 'the reward identity is identical'),
    check('reload-seed', 987_654, reload.seed, 'the saved seed is preserved'),
    check('reload-snapshot-bounded', true, reload.snapshotBytes < 16_384, 'bounded snapshot bytes'),
  );

  checks.push(
    check('history-cap', 24, history.entries, 'the history never exceeds its cap'),
    check('history-dropped', 6, history.dropped, 'older entries are dropped explicitly'),
    check(
      'history-units-bound',
      true,
      history.codeUnits <= history.capCodeUnits,
      'the code-unit budget is respected',
    ),
    check(
      'history-variety',
      true,
      history.distinctTemplates >= 3,
      'the anti-repetition window keeps the offers varied',
    ),
    check(
      'probe-budget',
      true,
      probes.maxProbesPerOffer <= CHALLENGE_DIRECTOR_LIMITS.routeProbesPerOffer,
      'one bounded walk per offer',
    ),
    check('no-probe-after-offer', 0, probes.attemptsWithoutProbe, 'advancing never probes a route'),
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: CHALLENGE_DIRECTOR_REPORT_VERSION,
    contract: Object.freeze({
      directorVersion: CHALLENGE_DIRECTOR_VERSION,
      stateVersion: CHALLENGE_DIRECTOR_STATE_VERSION,
      seed: DIRECTOR_FIXTURE_SEED,
      sessionId: DIRECTOR_SESSION_ID,
      worldEpoch: DIRECTOR_WORLD_EPOCH,
      tickHz: CHALLENGE_DIRECTOR_LIMITS.tickHz,
      states: Object.freeze([...challengeInstanceStates]),
      terminalStates: Object.freeze(['COMPLETED', 'FAILED', 'CANCELLED', 'DECLINED', 'EXPIRED']),
      refusals: Object.freeze([...challengeDirectorRefusals]),
      cancellationReasons: Object.freeze([...challengeCancellationReasons]),
      transitions: Object.freeze(
        Object.fromEntries(
          Object.entries(CHALLENGE_DIRECTOR_TRANSITIONS).map(([state, targets]) => [
            state,
            Object.freeze([...targets]),
          ]),
        ),
      ),
      limits: Object.freeze({
        activeOffers: CHALLENGE_DIRECTOR_LIMITS.activeOffers,
        activeInstances: CHALLENGE_DIRECTOR_LIMITS.activeInstances,
        cooldownTicks: CHALLENGE_DIRECTOR_LIMITS.cooldownTicks,
        offerWindowTicks: CHALLENGE_DIRECTOR_LIMITS.offerWindowTicks,
        recentTemplates: CHALLENGE_DIRECTOR_LIMITS.recentTemplates,
        historyEntries: CHALLENGE_DIRECTOR_LIMITS.historyEntries,
        historyCodeUnits: CHALLENGE_DIRECTOR_LIMITS.historyCodeUnits,
        retainedOutcomes: CHALLENGE_DIRECTOR_LIMITS.retainedOutcomes,
        outcomeCodeUnits: CHALLENGE_DIRECTOR_LIMITS.outcomeCodeUnits,
        routeProbesPerOffer: CHALLENGE_DIRECTOR_LIMITS.routeProbesPerOffer,
        attemptsPerTemplate: CHALLENGE_DIRECTOR_LIMITS.attemptsPerTemplate,
        feasibilitySlackSeconds: CHALLENGE_DIRECTOR_LIMITS.feasibilitySlackSeconds,
        transitionsPerInstance: CHALLENGE_DIRECTOR_LIMITS.transitionsPerInstance,
      }),
    }),
    preflight,
    lifecycle: Object.freeze({
      rows: lifecycle.rows,
      totals: lifecycle.totals,
      completed: lifecycle.completed,
      failed: lifecycle.failed,
      cancelled: lifecycle.cancelled,
      declined: lifecycle.declined,
      expired: lifecycle.expired,
      rewardKeys: lifecycle.rewardKeys,
      academyXp: lifecycle.academyXp,
    }),
    reload,
    history,
    probes,
    performance: Object.freeze({
      simulation: Object.freeze({
        offers: probes.offers,
        refusals: countRefusals(preflight),
        routeProbes: probes.routeProbes,
        maxProbesPerOffer: probes.maxProbesPerOffer,
        clock: 'NOT_MEASURED' as const,
      }),
      memory: Object.freeze({
        snapshotBytes: reload.snapshotBytes,
        historyBytes: history.bytes,
        historyEntries: history.entries,
        historyCodeUnits: history.codeUnits,
        retainedOutcomesCap: CHALLENGE_DIRECTOR_LIMITS.retainedOutcomes,
        manifestHistoryBudget: 'NULL_IN_MANIFEST' as const,
        admissionCap: 'PROVISIONAL_FINITE' as const,
      }),
      storage: Object.freeze({
        snapshotFields: 16,
        instanceFields: 27,
        stateVersion: CHALLENGE_DIRECTOR_STATE_VERSION,
        reloadIdentity: reload.instanceId,
        clock: 'NOT_MEASURED' as const,
      }),
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
  });
}

const BACKTICK = '`';

function code(value: string | number | boolean | null): string {
  return `${BACKTICK}${String(value)}${BACKTICK}`;
}

function cell(value: string | number | boolean | null): string {
  return value === null ? '—' : String(value).replaceAll('|', '\\|');
}

export function challengeDirectorReportMarkdown(report: ChallengeDirectorReport): string {
  const lines: string[] = [];
  lines.push(
    '# 232 challenge director report',
    '',
    'Machine-readable transcript: [report.json](report.json). Generated by ' +
      code('npm run missions:challenge-director') +
      '; no wall clock, random source or browser state participates. Version: ' +
      code(report.version) +
      '.',
    '',
    '## Contract',
    '',
    '- Director: ' + code(report.contract.directorVersion) + '.',
    '- Snapshot: ' + code(report.contract.stateVersion) + '.',
    '- States: ' + report.contract.states.map((entry) => code(entry)).join(' → ') + '.',
    '- Terminal: ' + report.contract.terminalStates.map((entry) => code(entry)).join(', ') + '.',
    '- Saved seed: ' +
      String(report.contract.seed) +
      '; session ' +
      code(report.contract.sessionId) +
      ' at world epoch ' +
      String(report.contract.worldEpoch) +
      '.',
    '- Authoritative tick: ' + String(report.contract.tickHz) + ' Hz.',
    '- Limits: one offer, one instance, cooldown ' +
      String(report.contract.limits.cooldownTicks) +
      ' ticks, offer window ' +
      String(report.contract.limits.offerWindowTicks) +
      ' ticks, history ' +
      String(report.contract.limits.historyEntries) +
      ' entries / ' +
      String(report.contract.limits.historyCodeUnits) +
      ' code units, attempts ' +
      String(report.contract.limits.attemptsPerTemplate) +
      ', route probes ' +
      String(report.contract.limits.routeProbesPerOffer) +
      '.',
    '',
    '## Closed transition graph',
    '',
    '| From | Allowed |',
    '| --- | --- |',
    ...Object.entries(report.contract.transitions).map(
      ([state, targets]) =>
        `| ${state} | ${targets.length === 0 ? '— (final)' : targets.join(', ')} |`,
    ),
    '',
    '## Preflight scenarios',
    '',
    '| Scenario | Status | Code | Detail |',
    '| --- | --- | --- | --- |',
    ...report.preflight.map(
      (entry) =>
        `| ${entry.name} | ${entry.status} | ${cell(entry.code)} | ${entry.detail.join(', ') || '—'} |`,
    ),
    '',
    '## Lifecycle numbers',
    '',
    '| Template | Family | Seed | Attempt | State | Reason | Start | Deadline | Duration | Ended | XP eligible | XP | Transitions |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.lifecycle.rows.map(
      (entry) =>
        `| ${entry.templateId} | ${entry.family} | ${entry.seed} | ${entry.attempt} | ${entry.state} | ${entry.reason ?? '—'} | ${entry.startedTick ?? '—'} | ${entry.deadlineTick} | ${entry.durationTicks} | ${entry.completedAtTick ?? '—'} | ${String(entry.xpEligible)} | ${entry.academyXp} | ${entry.transitions} |`,
    ),
    '',
    'Per-state totals: ' +
      Object.entries(report.lifecycle.totals)
        .map(([state, count]) => `${state}=${String(count)}`)
        .join(', ') +
      '.',
    '',
    '### Seed and reload',
    '',
    '- Instance: ' + code(report.reload.instanceId) + ' on ' + code(report.reload.templateId) + '.',
    '- Saved seed: ' + String(report.reload.seed) + '.',
    '- Identical objective snapshot: ' + String(report.reload.samePlan) + '.',
    '- Identical remaining simulated time: ' + String(report.reload.sameDeadline) + '.',
    '- Identical verdict fingerprint: ' + String(report.reload.sameFingerprint) + '.',
    '- Identical reward identity: ' + String(report.reload.sameRewardKey) + '.',
    '',
    '## Bounded history',
    '',
    '- Entries: ' +
      String(report.history.entries) +
      ' of ' +
      String(report.history.capEntries) +
      '; dropped oldest: ' +
      String(report.history.dropped) +
      '.',
    '- Code units: ' +
      String(report.history.codeUnits) +
      ' of ' +
      String(report.history.capCodeUnits) +
      '; distinct templates: ' +
      String(report.history.distinctTemplates) +
      '.',
    '',
    '## Performance',
    '',
    '- simulation: ' +
      String(report.performance.simulation.offers) +
      ' offers, ' +
      String(report.performance.simulation.refusals) +
      ' refusals, ' +
      String(report.performance.simulation.routeProbes) +
      ' route probes, at most ' +
      String(report.performance.simulation.maxProbesPerOffer) +
      ' per offer. Wall clock: ' +
      code(report.performance.simulation.clock) +
      '.',
    '- memory: snapshot ' +
      String(report.performance.memory.snapshotBytes) +
      ' bytes, history ' +
      String(report.performance.memory.historyBytes) +
      ' bytes, retained outcomes cap ' +
      String(report.performance.memory.retainedOutcomesCap) +
      '.',
    '- storage: state version ' +
      code(report.performance.storage.stateVersion) +
      ', ' +
      String(report.performance.storage.snapshotFields) +
      ' snapshot fields, ' +
      String(report.performance.storage.instanceFields) +
      ' instance fields. Wall clock: ' +
      code(report.performance.storage.clock) +
      '.',
    '- The manifest field `challengeHistoryEntries` is `null`; this PBI establishes the finite admission cap above and reports the calibration gap instead of claiming a calibrated budget.',
    '',
    '## Refusal vocabulary',
    '',
    report.contract.refusals.map((entry) => code(entry)).join(', ') + '.',
    '',
    '## Checks',
    '',
    '| Check | Expected | Actual | Result | Detail |',
    '| --- | --- | --- | --- | --- |',
    ...report.checks.map(
      (entry) =>
        `| ${entry.name} | ${cell(entry.expected)} | ${cell(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
    ),
    '',
    '## Summary',
    '',
    '- Checks: ' + String(report.summary.passed) + '/' + String(report.summary.checks),
    '- Overall: ' + (report.summary.pass ? 'PASS' : 'FAIL'),
    '',
  );
  return lines.join('\n');
}
