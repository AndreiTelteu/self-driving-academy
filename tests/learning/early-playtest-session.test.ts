import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCELERATION_EPISODE_MAXIMUM_TICKS,
  PLAYTEST_TICK_HZ,
  buildPlaytestExport,
  createPlaytestBaseProfile,
  createPlaytestRecorder,
  evaluatePlaytestDrive,
} from '../harness/early-playtest-session';
import type {
  PlaytestAnswers,
  PlaytestDrive,
  PlaytestMode,
  PlaytestTickObservation,
} from '../harness/early-playtest-session';
import { VEHICLE_CLASSES } from '../../src/vehicles';

const MAX_ACCEL = VEHICLE_CLASSES.sedan.engineForceN / VEHICLE_CLASSES.sedan.massKg;
const BRAKE_DECEL = VEHICLE_CLASSES.sedan.brakeAcceleration;
const POSTED_LIMIT = 10;
const CRUISE = 11;
const STOP_LINES = Object.freeze([
  Object.freeze({ id: 'stop-line-01', z: 200 }),
  Object.freeze({ id: 'stop-line-02', z: 380 }),
  Object.freeze({ id: 'stop-line-03', z: 560 }),
]);

interface SimulatedDrive {
  readonly drive: PlaytestDrive;
  readonly finishTick: number;
}

/** Deterministic bang-bang driver: cruise, brake to a full STOP, dwell, launch again. */
function simulateDrive(
  mode: PlaytestMode,
  options: { readonly stopAtLines: boolean; readonly maximumTicks?: number },
): SimulatedDrive {
  const recorder = createPlaytestRecorder({
    mode,
    sessionId: `204-playtest-test-${mode}`,
    vehicleId: 'taxi-01',
    incarnation: 'taxi-01-inc-1',
    classId: 'sedan',
  });
  let z = 0;
  let speed = 0;
  let lineIndex = 0;
  let dwellTicks = 0;
  let dwelling = false;
  let committed = false;
  const maximumTicks = options.maximumTicks ?? 10_000;
  for (let tick = 1; tick <= maximumTicks; tick += 1) {
    const line = STOP_LINES[lineIndex];
    const distance = line === undefined ? null : line.z - z;
    let desired = CRUISE;
    if (options.stopAtLines && line !== undefined && !committed) {
      const brakingDistance = (speed * speed) / (2 * 7.5) + 4;
      if (dwelling) desired = 0;
      else if (distance !== null && distance <= brakingDistance) desired = 0;
    }
    let throttle = 0;
    let brake = 0;
    if (speed < desired - 0.25) throttle = 1;
    else if (speed > desired + 0.25) brake = 1;
    if (dwelling) {
      throttle = 0;
      brake = 1;
      dwellTicks += 1;
      if (dwellTicks >= 120) {
        dwelling = false;
        committed = true;
        dwellTicks = 0;
      }
    }
    const previousSpeed = speed;
    const acceleration = throttle * MAX_ACCEL - brake * BRAKE_DECEL - 0.02 * speed;
    speed = Math.max(0, speed + acceleration / PLAYTEST_TICK_HZ);
    z += speed / PLAYTEST_TICK_HZ;
    let crossed: string | null = null;
    if (line !== undefined && z >= line.z) {
      crossed = line.id;
      lineIndex += 1;
      committed = false;
    }
    if (
      options.stopAtLines &&
      !dwelling &&
      !committed &&
      line !== undefined &&
      speed <= 0.15 &&
      distance !== null &&
      distance <= 8 &&
      distance >= -1
    ) {
      dwelling = true;
      dwellTicks = 0;
    }
    const observation: PlaytestTickObservation = Object.freeze({
      tick,
      throttle,
      brake,
      steering: 0,
      speedMps: speed,
      accelerationMps2: (speed - previousSpeed) * PLAYTEST_TICK_HZ,
      distanceToStopLineM: line === undefined ? null : Math.max(-1, distance!),
      stopLineId: line?.id ?? null,
      crossedStopLineId: crossed,
      postedLimitMps: POSTED_LIMIT,
    });
    recorder.record(observation);
    if (lineIndex >= STOP_LINES.length && speed > 1)
      return { drive: recorder.finish(), finishTick: tick };
  }
  return { drive: recorder.finish(), finishTick: maximumTicks };
}

function answered(overrides: Partial<PlaytestAnswers> = {}): PlaytestAnswers {
  return {
    noticedChange: 'yes',
    distinguishesModes: 'yes',
    supportingObservation: 'stop',
    freeText: '',
    ...overrides,
  };
}

describe('204 playtest session', () => {
  it('turns a LEARNING drive into real evidence, a blended profile and AUTO tokens', () => {
    const { drive } = simulateDrive('LEARNING', { stopAtLines: true });
    assert.equal(drive.freeWindows.length >= 3, true);
    assert.equal(drive.accelerationEpisodes.length >= 3, true);
    assert.equal(drive.stopEpisodes.length, 3);
    assert.equal(
      drive.stopEpisodes.every((episode) => episode.fullStop),
      true,
    );
    const result = evaluatePlaytestDrive(drive);
    assert.equal(result.mode, 'LEARNING');
    assert.equal(result.observed.fullStops, 3);
    assert.equal(result.observed.rollingStops, 0);
    assert.equal(
      result.evidence.every((row) => row.status === 'READY'),
      true,
    );
    const speed = result.keys.find((row) => row.key === 'speed_delta_urban')!;
    const acceleration = result.keys.find((row) => row.key === 'desired_acceleration')!;
    const stop = result.keys.find((row) => row.key === 'stop_full_probability')!;
    assert(speed.candidate! > 0.5);
    assert(speed.candidate! < 1.2);
    assert(Math.abs(acceleration.candidate! - MAX_ACCEL) < 0.4);
    assert.equal(stop.candidate, 1);
    assert.equal(speed.changed, true);
    assert.equal(acceleration.changed, true);
    assert.equal(stop.changed, true);
    assert(speed.after > 0.12);
    assert(speed.after < 0.3);
    assert(Math.abs(stop.after - 0.7) < 1e-12);
    // The 25% cap and its quality are visible per key.
    assert(Math.abs(speed.blend - 0.25) < 1e-12);
    assert.equal(speed.quality, 1);
    assert.equal(result.manual, null);
    assert.equal(result.unchangedSurfaceKeys, 77);
    assert.equal(result.tokens.profile.parameters.stop_full_probability, stop.after);
    assert.equal(result.tokens.profile.parameters.speed_delta_urban, speed.after);
    assert.equal(result.tokens.profile.parameters.desired_acceleration, acceleration.after);
    // The untouched 77 keys keep the exact base values.
    for (const [key, value] of Object.entries(result.tokens.profile.parameters)) {
      if (result.keys.some((row) => row.key === key)) continue;
      assert.equal(
        value,
        result.baseProfile.parameters[key as keyof typeof result.baseProfile.parameters],
      );
    }
  });

  it('keeps MANUAL at zero evidence, zero delta and no LEARNING tokens', () => {
    const { drive } = simulateDrive('MANUAL', { stopAtLines: true });
    const result = evaluatePlaytestDrive(drive);
    assert.equal(result.mode, 'MANUAL');
    assert.equal(result.observed.fullStops, 3);
    assert.equal(result.manual?.evidenceEpisodes, 0);
    assert.equal(result.manual?.maximumParameterDelta, 0);
    assert.equal(result.manual?.profileUnchanged, true);
    assert.equal(result.manual?.learningTokensNull, true);
    assert.equal(
      result.keys.every((row) => row.changed === false),
      true,
    );
    assert.equal(
      result.keys.every((row) => row.delta === 0),
      true,
    );
    assert.equal(
      result.keys.every((row) => row.candidate === null),
      true,
    );
    assert.equal(
      result.keys.every((row) => (row.unchangedReason ?? '').startsWith('MANUAL')),
      true,
    );
    assert.equal(
      result.evidence.every((row) => row.status === 'NO_EVIDENCE'),
      true,
    );
  });

  it('leaves a key unchanged with an explicit reason when evidence is insufficient', () => {
    const { drive } = simulateDrive('LEARNING', { stopAtLines: false, maximumTicks: 900 });
    assert.equal(drive.stopEpisodes.length, 0);
    const result = evaluatePlaytestDrive(drive);
    const stop = result.keys.find((row) => row.key === 'stop_full_probability')!;
    assert.equal(stop.changed, false);
    assert.equal(stop.candidate, null);
    assert.equal(stop.evidenceStatus, 'NO_EVIDENCE');
    assert.equal(stop.unchangedReason, 'NO_QUALIFYING_EVIDENCE');
    const speed = result.keys.find((row) => row.key === 'speed_delta_urban')!;
    assert.equal(speed.changed, true);
  });

  it('rejects invalid recorder ticks instead of silently learning from them', () => {
    const recorder = createPlaytestRecorder({
      mode: 'LEARNING',
      sessionId: '204-playtest-invalid',
      vehicleId: 'taxi-01',
      incarnation: 'taxi-01-inc-1',
      classId: 'sedan',
    });
    const observation: PlaytestTickObservation = {
      tick: 2,
      throttle: 0,
      brake: 0,
      steering: 0,
      speedMps: 0,
      accelerationMps2: 0,
      distanceToStopLineM: null,
      stopLineId: null,
      crossedStopLineId: null,
      postedLimitMps: POSTED_LIMIT,
    };
    recorder.record(observation);
    assert.throws(() => recorder.record(observation), /strictly increase/);
    assert.throws(
      () => recorder.record({ ...observation, tick: 3, postedLimitMps: 0 }),
      /posted limit/,
    );
    assert.equal(recorder.progress().elapsedS, 1 / PLAYTEST_TICK_HZ);
  });

  it('builds a participant export only for slots 1..5 with complete answers', () => {
    const { drive } = simulateDrive('LEARNING', { stopAtLines: true });
    const result = evaluatePlaytestDrive(drive, createPlaytestBaseProfile());
    const startedAt = '2026-10-19T20:00:00.000Z';
    const finishedAt = '2026-10-19T20:01:00.000Z';
    const record = buildPlaytestExport({
      participantSlot: 3,
      developerSelfTest: false,
      startedAt,
      finishedAt,
      finishedBy: 'finish',
      result,
      drive,
      answers: answered(),
      autoDemo: [
        { tick: 3960, speedMps: 10.1, decision: 'APPROACH/STOP_APPROACH', stopRequested: true },
      ],
    });
    assert.equal(record.schema, '204-playtest-v2');
    assert.equal(record.participantSlot, 3);
    assert.equal(record.developerSelfTest, false);
    assert.equal(record.label, 'participant slot 3');
    assert.equal(record.durationS, 60);
    assert.equal(record.firstVisibleChangeSeconds, 60);
    assert.equal(record.answers.supportingObservation, 'stop');
    assert.equal(record.autoDemo.length, 1);
    assert.equal(record.autoDemo[0]?.decision, 'APPROACH/STOP_APPROACH');
    assert.equal(record.trace.length > 0, true);
    assert.equal(record.trace.length <= Math.ceil(drive.samples.length / 6), true);
    assert.equal(record.limitations.length, 4);
    const roundTrip = JSON.parse(JSON.stringify(record)) as typeof record;
    assert.deepEqual(roundTrip.keys, record.keys);
    assert.throws(
      () =>
        buildPlaytestExport({
          participantSlot: 0,
          developerSelfTest: false,
          startedAt,
          finishedAt,
          finishedBy: 'finish',
          result,
          drive,
          answers: answered(),
        }),
      /between 1 and 5/,
    );
    assert.throws(
      () =>
        buildPlaytestExport({
          participantSlot: 4,
          developerSelfTest: false,
          startedAt,
          finishedAt,
          finishedBy: 'finish',
          result,
          drive,
          answers: answered({ noticedChange: '' }),
        }),
      /noticedChange/,
    );
    assert.throws(
      () =>
        buildPlaytestExport({
          participantSlot: 2,
          developerSelfTest: true,
          startedAt,
          finishedAt,
          finishedBy: 'developer',
          result,
          drive,
          answers: answered(),
        }),
      /must not claim a participant slot/,
    );
  });

  it('labels a developer self-test without inventing a participant slot', () => {
    const { drive } = simulateDrive('LEARNING', { stopAtLines: true });
    const result = evaluatePlaytestDrive(drive);
    const record = buildPlaytestExport({
      participantSlot: null,
      developerSelfTest: true,
      startedAt: '2026-10-19T20:00:00.000Z',
      finishedAt: '2026-10-19T20:01:10.000Z',
      finishedBy: 'developer',
      result,
      drive,
      answers: answered({ freeText: 'developer run' }),
    });
    assert.equal(record.participantSlot, null);
    assert.equal(record.developerSelfTest, true);
    assert.equal(record.label, 'developer self-test, not a participant');
    assert.equal(record.finishedBy, 'developer');
    assert.equal(record.durationS, 70);
  });

  it('bounds an acceleration episode so one long launch cannot fabricate many', () => {
    assert.equal(ACCELERATION_EPISODE_MAXIMUM_TICKS, 300);
    assert.equal(PLAYTEST_TICK_HZ, 60);
    const { drive } = simulateDrive('LEARNING', { stopAtLines: true });
    assert.equal(
      drive.accelerationEpisodes.every(
        (episode) => episode.endTick - episode.startTick + 1 <= ACCELERATION_EPISODE_MAXIMUM_TICKS,
      ),
      true,
    );
  });
});
