/**
 * PBI 198 — the walking body is not a driving demonstration, and a transition preserves the one
 * authority and the explicitly chosen mode.
 *
 * These tests drive the delivered contract only. The real PBI 069 lifecycle is the cross-check of
 * the estimator gate in `walking-segments-report.test.ts`, so no rule is invented here.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { InputAuthority } from '../../src/input';
import {
  WALKING_SEGMENTS_POLICY,
  VEHICLE_ENTRY_POLICY,
  createWalkingSegments,
  estimatorCandidate,
  parseWalkingSegmentsState,
  type WalkingSegmentClosed,
  type WalkingSegments,
  type WalkingSegmentsTarget,
} from '../../src/character';

const CHARACTER_ID = 'character:player-character';
const TAXI_A = 'vehicle:taxi-a-198';
const TAXI_B = 'vehicle:taxi-b-198';

const TARGET: WalkingSegmentsTarget = Object.freeze({
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

function model(target: WalkingSegmentsTarget = TARGET): WalkingSegments {
  return createWalkingSegments({ ownerId: '198', characterId: CHARACTER_ID, target });
}

function enter(
  segments: WalkingSegments,
  tick: number,
  vehicleId = TAXI_A,
  input: { mode?: 'MANUAL' | 'LEARNING'; maneuverState?: 'TURNING' | 'LANE_CHANGING' } = {},
) {
  return segments.step({
    tick,
    transition: 'ENTER',
    authority: vehicle(vehicleId),
    previousAuthority: character(),
    vehicleId,
    ...input,
  });
}

function exit(
  segments: WalkingSegments,
  tick: number,
  vehicleId = TAXI_A,
  input: { maneuverState?: 'IDLE' | 'TURNING' | 'LANE_CHANGING' } = {},
) {
  return segments.step({
    tick,
    transition: 'EXIT',
    authority: character(),
    previousAuthority: vehicle(vehicleId),
    vehicleId,
    ...input,
  });
}

const errorCode = (operation: () => unknown): string => {
  try {
    operation();
  } catch (error) {
    return (error as { code?: string }).code ?? 'UNKNOWN';
  }
  return 'NO_ERROR';
};

test('198 mersul pe jos nu produce niciun segment de driving și niciun candidat', () => {
  const segments = model();
  for (let tick = 1; tick <= 5000; tick += 1)
    segments.step({ tick, transition: 'WALK', authority: character(), distanceM: 0.0485 });
  const stats = segments.getStats();
  assert.equal(stats.walking, true);
  assert.equal(stats.openSegmentId, null);
  assert.equal(stats.lastClosedSegmentId, null);
  assert.equal(stats.counters.walkingTicks, 5000);
  assert.ok(Math.abs(stats.counters.walkingDistanceM - 242.5) < 1e-9);
  assert.equal(stats.counters.closedSegments, 0);
  assert.equal(stats.counters.closedManual, 0);
  assert.equal(stats.counters.closedLearning, 0);
  assert.equal(stats.counters.candidates, 0);
  assert.equal(stats.counters.entries, 0);
  // Control: the same model really does produce a segment when the authority leaves the body.
  enter(segments, 5001);
  const closed = exit(segments, 5002);
  assert.equal(closed.closed?.kind, 'MANUAL');
  assert.equal(segments.getStats().counters.closedSegments, 1);
});

test('198 mersul nu poate rula cu autoritate de vehicul sau peste un segment deschis', () => {
  const segments = model();
  assert.equal(
    errorCode(() =>
      segments.step({ tick: 1, transition: 'WALK', authority: vehicle(TAXI_A), distanceM: 1 }),
    ),
    'INVALID_SEGMENT_AUTHORITY',
  );
  assert.equal(
    errorCode(() =>
      segments.step({ tick: 1, transition: 'WALK', authority: character(), distanceM: -1 }),
    ),
    'INVALID_SEGMENT_INPUT',
  );
  enter(segments, 1);
  assert.equal(
    errorCode(() =>
      segments.step({ tick: 2, transition: 'WALK', authority: character(), distanceM: 1 }),
    ),
    'INVALID_SEGMENT_AUTHORITY',
  );
});

test('198 numai un segment LEARNING închis produce candidatul estimatorului', () => {
  const manual = model();
  enter(manual, 1);
  const manualClosed = exit(manual, 2);
  assert.equal(manualClosed.closed?.kind, 'MANUAL');
  assert.equal(manualClosed.candidates.length, 0);
  assert.equal(manual.getStats().counters.closedLearning, 0);

  const learning = model();
  enter(learning, 1, TAXI_A, { mode: 'LEARNING' });
  const learningClosed = exit(learning, 2);
  assert.equal(learningClosed.closed?.kind, 'LEARNING');
  assert.equal(learningClosed.candidates.length, 1);
  const candidate = learningClosed.candidates[0]!;
  assert.equal(candidate.gate, '069-CLOSED-LEARNING-ELIGIBLE');
  assert.equal(candidate.wouldOpenIntake, true);
  assert.equal(candidate.controlMode, 'LEARNING');
  assert.equal(candidate.learningEligible, true);
  assert.equal(candidate.completeness, 'CLOSED');
  assert.equal(candidate.segmentId, learningClosed.closed!.segmentId);
  assert.equal(candidate.vehicleId, TAXI_A);
  assert.equal(candidate.startTick, 1);
  assert.equal(candidate.endTick, 2);
  assert.equal(candidate.playerId, TARGET.playerId);
  assert.equal(candidate.profileId, TARGET.profileId);
  assert.equal(candidate.baseVersionId, TARGET.baseVersionId);
  assert.equal(candidate.learningEpoch, TARGET.learningEpoch);
  assert.equal(learning.getStats().counters.candidates, 1);
  assert.ok(Object.isFrozen(candidate));
});

test('198 un LEARNING deschis când ținta nu este eligibilă rămâne LEARNING dar nu produce candidat', () => {
  const segments = model(Object.freeze({ ...TARGET, learningEligible: false }));
  const entered = enter(segments, 1, TAXI_A, { mode: 'LEARNING' });
  assert.equal(entered.opened?.kind, 'LEARNING');
  assert.equal(entered.opened?.learningEligible, false);
  const closed = exit(segments, 2);
  assert.equal(closed.closed?.kind, 'LEARNING');
  assert.equal(closed.closed?.learningEligible, false);
  assert.equal(closed.candidates.length, 0);
});

test('198 eligibilitatea îngheață la deschidere, ca regula reală 069', () => {
  const segments = model();
  enter(segments, 1, TAXI_A, { mode: 'LEARNING' });
  const closed = exit(segments, 2).closed!;
  // The frozen segment stays eligible even if the current target no longer is.
  assert.ok(estimatorCandidate(closed, Object.freeze({ ...TARGET, learningEligible: false })));
  // Identity mismatches still disqualify it.
  assert.equal(estimatorCandidate(closed, Object.freeze({ ...TARGET, profileId: 'other' })), null);
  assert.equal(estimatorCandidate(closed, Object.freeze({ ...TARGET, learningEpoch: 2 })), null);
  assert.equal(estimatorCandidate(closed, Object.freeze({ ...TARGET, baseVersionId: 'v2' })), null);
  assert.equal(estimatorCandidate(closed, Object.freeze({ ...TARGET, playerId: 'other' })), null);
  assert.equal(estimatorCandidate(closed, Object.freeze({ ...TARGET, worldEpoch: 2 })), null);
  // A non-CLOSED segment is exactly the 069 DATA_LOSS rule: no candidate, whatever the mode.
  const dataLoss: WalkingSegmentClosed = Object.freeze({ ...closed, completeness: 'INCOMPLETE' });
  assert.equal(estimatorCandidate(dataLoss, TARGET), null);
  const manual = model();
  enter(manual, 1);
  const manualClosed = exit(manual, 2).closed!;
  assert.equal(estimatorCandidate(manualClosed, TARGET), null);
});

test('198 un LEARNING trunchiat de o ieșire în mijlocul manevrei rămâne eligibil', () => {
  const segments = model();
  enter(segments, 1, TAXI_A, { mode: 'LEARNING' });
  const closed = exit(segments, 2, TAXI_A, { maneuverState: 'TURNING' });
  assert.equal(closed.closed?.closeReason, 'RETURN_TO_AUTO');
  assert.equal(closed.closed?.completeness, 'CLOSED');
  assert.equal(closed.closed?.maneuverState, 'TURNING');
  assert.equal(closed.closed?.truncatedManeuver, 'TURNING');
  assert.equal(closed.candidates.length, 1);
  assert.equal(closed.candidates[0]!.truncatedManeuver, 'TURNING');
  assert.equal(closed.candidates[0]!.endTick, 2);
  // A normal exit of the same segment produces the same gate decision: 069 has no manoeuvre rule.
  const plain = model();
  enter(plain, 1, TAXI_A, { mode: 'LEARNING' });
  const plainClosed = exit(plain, 2, TAXI_A, { maneuverState: 'IDLE' });
  assert.equal(plainClosed.closed?.truncatedManeuver, null);
  assert.equal(plainClosed.candidates.length, closed.candidates.length);
});

test('198 un TAKE nu ghicește LEARNING din segmentul anterior', () => {
  assert.equal(WALKING_SEGMENTS_POLICY.defaultEntryMode, 'MANUAL');
  assert.equal(WALKING_SEGMENTS_POLICY.defaultEntryMode, VEHICLE_ENTRY_POLICY.entryMode);
  const segments = model();
  enter(segments, 1, TAXI_A, { mode: 'LEARNING' });
  const taken = segments.step({
    tick: 2,
    transition: 'ENTER',
    authority: vehicle(TAXI_B),
    previousAuthority: vehicle(TAXI_A),
    vehicleId: TAXI_B,
  });
  assert.equal(taken.closed?.kind, 'LEARNING');
  assert.equal(taken.closed?.closeReason, 'VEHICLE_SWITCH');
  assert.equal(taken.candidates.length, 1);
  assert.equal(taken.opened?.kind, 'MANUAL');
  assert.equal(taken.opened?.learningEligible, false);
  assert.equal(taken.state.open?.kind, 'MANUAL');
  // An explicit LEARNING choice is the only way to open a LEARNING segment.
  const explicit = model();
  enter(explicit, 1, TAXI_A, { mode: 'MANUAL' });
  const switched = explicit.step({
    tick: 2,
    transition: 'ENTER',
    authority: vehicle(TAXI_B),
    previousAuthority: vehicle(TAXI_A),
    vehicleId: TAXI_B,
    mode: 'LEARNING',
  });
  assert.equal(switched.closed?.kind, 'MANUAL');
  assert.equal(switched.candidates.length, 0);
  assert.equal(switched.opened?.kind, 'LEARNING');
});

test('198 un FOCUS nu închide nimic și nu schimbă autoritatea sau modul', () => {
  for (const mode of ['MANUAL', 'LEARNING'] as const) {
    const segments = model();
    const entered = enter(segments, 1, TAXI_A, { mode });
    const before = segments.snapshot().open;
    const focus = segments.step({
      tick: 2,
      transition: 'FOCUS',
      authority: vehicle(TAXI_A),
      vehicleId: TAXI_B,
    });
    assert.equal(focus.closed, null);
    assert.equal(focus.candidates.length, 0);
    assert.deepEqual(focus.focus, { vehicleId: TAXI_B, authorityUnchanged: true });
    assert.deepEqual(segments.snapshot().open, before);
    assert.equal(segments.snapshot().open?.segmentId, entered.opened?.segmentId);
    const closed = exit(segments, 3);
    assert.equal(closed.closed?.kind, mode);
    assert.equal(closed.closed?.startTick, 1);
    assert.equal(closed.closed?.endTick, 3);
    assert.equal(segments.getStats().counters.focus, 1);
    assert.equal(segments.getStats().counters.closedSegments, 1);
  }
});

test('198 matricea (mod anterior × tranziție) păstrează autoritatea unică și modul explicit', () => {
  const rows: string[] = [];
  for (const previous of ['MANUAL', 'LEARNING'] as const) {
    for (const transition of ['TAKE', 'RETURN', 'FOCUS'] as const) {
      const segments = model();
      enter(segments, 1, TAXI_A, { mode: previous });
      if (transition === 'TAKE') {
        const result = segments.step({
          tick: 2,
          transition: 'ENTER',
          authority: vehicle(TAXI_B),
          previousAuthority: vehicle(TAXI_A),
          vehicleId: TAXI_B,
        });
        assert.equal(result.closed?.kind, previous, `${previous}/TAKE closes`);
        assert.equal(result.closed?.closeReason, 'VEHICLE_SWITCH');
        assert.equal(result.opened?.kind, 'MANUAL', `${previous}/TAKE opens MANUAL`);
        assert.equal(result.candidates.length, previous === 'LEARNING' ? 1 : 0);
        assert.equal(result.authority.consumer, 'VEHICLE');
        assert.equal(
          result.authority.consumer === 'VEHICLE' ? result.authority.vehicleId : null,
          TAXI_B,
        );
        rows.push(
          `${previous}/TAKE:${result.closed?.kind}->${result.opened?.kind}:${result.candidates.length}`,
        );
      } else if (transition === 'RETURN') {
        const result = exit(segments, 2);
        assert.equal(result.closed?.kind, previous, `${previous}/RETURN closes`);
        assert.equal(result.closed?.closeReason, 'RETURN_TO_AUTO');
        assert.equal(result.opened, null);
        assert.equal(result.candidates.length, previous === 'LEARNING' ? 1 : 0);
        assert.equal(result.authority.consumer, 'CHARACTER');
        rows.push(`${previous}/RETURN:${result.closed?.kind}->none:${result.candidates.length}`);
      } else {
        const result = segments.step({
          tick: 2,
          transition: 'FOCUS',
          authority: vehicle(TAXI_A),
          vehicleId: TAXI_B,
        });
        assert.equal(result.closed, null, `${previous}/FOCUS closes nothing`);
        assert.equal(result.candidates.length, 0, `${previous}/FOCUS candidates`);
        assert.equal(segments.snapshot().open?.kind, previous, `${previous}/FOCUS keeps the mode`);
        assert.equal(result.authority.consumer, 'VEHICLE');
        rows.push(`${previous}/FOCUS:none->${previous}:0`);
      }
    }
  }
  assert.deepEqual(rows, [
    'MANUAL/TAKE:MANUAL->MANUAL:0',
    'MANUAL/RETURN:MANUAL->none:0',
    'MANUAL/FOCUS:none->MANUAL:0',
    'LEARNING/TAKE:LEARNING->MANUAL:1',
    'LEARNING/RETURN:LEARNING->none:1',
    'LEARNING/FOCUS:none->LEARNING:0',
  ]);
});

test('198 autoritatea unică este validată la fiecare tranziție', () => {
  const segments = model();
  // ENTER must carry VEHICLE:<id>; a character authority is not an accepted takeover.
  assert.equal(
    errorCode(() =>
      segments.step({
        tick: 1,
        transition: 'ENTER',
        authority: character(),
        previousAuthority: character(),
        vehicleId: TAXI_A,
      }),
    ),
    'INVALID_SEGMENT_AUTHORITY',
  );
  // The previous authority must still be the player's walking authority.
  assert.equal(
    errorCode(() =>
      segments.step({
        tick: 1,
        transition: 'ENTER',
        authority: vehicle(TAXI_A),
        previousAuthority: vehicle(TAXI_B),
        vehicleId: TAXI_A,
      }),
    ),
    'INVALID_SEGMENT_AUTHORITY',
  );
  enter(segments, 1);
  // EXIT must release exactly the open car and return CHARACTER:<id>.
  assert.equal(
    errorCode(() => exit(segments, 2, TAXI_B)),
    'INVALID_SEGMENT_AUTHORITY',
  );
  assert.equal(
    errorCode(() =>
      segments.step({
        tick: 2,
        transition: 'EXIT',
        authority: vehicle(TAXI_A),
        previousAuthority: vehicle(TAXI_A),
        vehicleId: TAXI_A,
      }),
    ),
    'INVALID_SEGMENT_AUTHORITY',
  );
  // A second TAKE on the same car is not a transition.
  assert.equal(
    errorCode(() =>
      segments.step({
        tick: 2,
        transition: 'ENTER',
        authority: vehicle(TAXI_A),
        previousAuthority: vehicle(TAXI_A),
        vehicleId: TAXI_A,
      }),
    ),
    'INVALID_SEGMENT_TRANSITION',
  );
  // EXIT without an open segment is not a transition either.
  const fresh = model();
  assert.equal(
    errorCode(() => exit(fresh, 1)),
    'INVALID_SEGMENT_TRANSITION',
  );
  // FOCUS cannot copy an authority that is not the current one.
  assert.equal(
    errorCode(() =>
      segments.step({
        tick: 2,
        transition: 'FOCUS',
        authority: character(),
        vehicleId: TAXI_B,
      }),
    ),
    'INVALID_SEGMENT_AUTHORITY',
  );
  // The fixed tick is sequential, exactly like 192/193/194/195/196/197.
  assert.equal(
    errorCode(() =>
      segments.step({
        tick: 3,
        transition: 'FOCUS',
        authority: vehicle(TAXI_A),
        vehicleId: TAXI_B,
      }),
    ),
    'INVALID_SEGMENT_TICK',
  );
});

test('198 starea segmentului este serializabilă și reluabilă pentru 200', () => {
  const build = () => {
    const segments = model();
    for (let tick = 1; tick <= 12; tick += 1)
      segments.step({ tick, transition: 'WALK', authority: character(), distanceM: 0.02 });
    enter(segments, 13, TAXI_A, { mode: 'LEARNING' });
    return segments;
  };
  const original = build();
  const state = original.snapshot();
  assert.equal(state.version, '198-walking-segments-v1');
  const json = JSON.parse(JSON.stringify(state)) as unknown;
  const parsed = parseWalkingSegmentsState(json);
  assert.deepEqual(parsed, state);
  assert.ok(Object.isFrozen(parsed));
  assert.equal(parsed.open?.segmentId, '198:segment:1');

  const resumed = createWalkingSegments({
    ownerId: '198',
    characterId: CHARACTER_ID,
    target: TARGET,
    resume: json,
  });
  const continueA = exit(original, 14);
  const continueB = exit(resumed, 14);
  assert.deepEqual(continueB, continueA);
  assert.equal(continueB.closed?.segmentId, '198:segment:1');
  // The segment sequence continues from the restored value.
  enter(resumed, 15);
  assert.equal(resumed.snapshot().open?.segmentId, '198:segment:2');

  // Strict parsing refuses a tampered state instead of guessing.
  assert.equal(
    errorCode(() => parseWalkingSegmentsState({ ...(json as object), version: 'other' })),
    'INVALID_SEGMENT_STATE',
  );
  assert.equal(
    errorCode(() =>
      parseWalkingSegmentsState({
        ...(json as object),
        counters: { ...state.counters, closedSegments: 1 },
      }),
    ),
    'INVALID_SEGMENT_STATE',
  );
  assert.equal(
    errorCode(() => parseWalkingSegmentsState({ ...(json as object), tick: 0 })),
    'INVALID_SEGMENT_STATE',
  );
  assert.equal(
    errorCode(() =>
      createWalkingSegments({
        ownerId: 'other',
        characterId: CHARACTER_ID,
        target: TARGET,
        resume: json,
      }),
    ),
    'INVALID_SEGMENT_STATE',
  );
  assert.equal(
    errorCode(() =>
      createWalkingSegments({
        ownerId: '198',
        characterId: CHARACTER_ID,
        target: Object.freeze({ ...TARGET, baseVersionId: 'style-v2' }),
        resume: json,
      }),
    ),
    'INVALID_SEGMENT_STATE',
  );
});

test('198 contractul este un read model pur: fără telemetrie, fără analiză, fără ceas', () => {
  const source = readFileSync(
    new URL('../../src/character/walking-segments.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /from '\.\.\/telemetry'/);
  assert.doesNotMatch(source, /from '\.\.\/learning'/);
  assert.doesNotMatch(
    source,
    /Math\.random\(|Date\.now\(|performance\.now\(|setTimeout\(|setInterval\(/,
  );
  assert.doesNotMatch(source, /writeFile|localStorage|indexedDB/);
  // The only cross-module runtime import is the 195 entry policy it reuses on purpose.
  const runtimeImports = [...source.matchAll(/^import (?!type )[^;]+;$/gm)].map(
    (match) => match[0],
  );
  assert.deepEqual(runtimeImports, [
    "import { CHARACTER_SAMPLING_HZ } from './clips';",
    "import { VEHICLE_ENTRY_POLICY } from './enter-vehicle';",
  ]);
  // Results are frozen data, not live views into the model.
  const segments = model();
  enter(segments, 1, TAXI_A, { mode: 'LEARNING' });
  const closed = exit(segments, 2);
  assert.ok(Object.isFrozen(closed));
  assert.ok(Object.isFrozen(closed.closed));
  assert.ok(Object.isFrozen(closed.state));
  assert.ok(Object.isFrozen(closed.state.open));
  assert.ok(Object.isFrozen(closed.candidates));
});
