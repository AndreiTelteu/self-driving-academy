import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  blendProfileValue,
  PROFILE_BLEND_POLICY,
  PROFILE_BLEND_VERSION,
} from '../../src/learning/profile-blend';
import type { ProfileBlendEpisode } from '../../src/learning/profile-blend';
import type { ConfidenceCandidate } from '../../src/learning/evidence-confidence';
import type { ParameterEvidenceReadModel } from '../../src/learning/parameter-evidence';
import { parameterRegistry } from '../../src/profiles';
import type { ParameterKey } from '../../src/profiles';

const DAY = 24 * 60 * 60;

function read(
  key: ParameterKey,
  distinctEpisodes: number,
  status: ParameterEvidenceReadModel['status'] = 'READY',
): ParameterEvidenceReadModel {
  return {
    key,
    status,
    distinctEpisodes,
    contextBreakdown: [],
    sampleCount: distinctEpisodes,
    quality: status === 'READY' ? 1 : 0,
    uncertainty: status === 'READY' ? 'MODERATE' : 'HIGH',
    unchanged: true,
    noEstimate:
      status === 'NO_EVIDENCE'
        ? 'NO_QUALIFYING_EVIDENCE'
        : status === 'INSUFFICIENT'
          ? 'INSUFFICIENT_DISTINCT_EPISODES_OR_VARIATION'
          : null,
  } as ParameterEvidenceReadModel;
}

function episode(
  id: string,
  value: number,
  options: {
    readonly ticks?: number;
    readonly ageSeconds?: number;
    readonly speed?: number;
    readonly occurrence?: number;
    readonly correlatedWith?: string;
  } = {},
): ProfileBlendEpisode {
  return {
    opportunityId: id,
    occurrence: options.occurrence ?? 1,
    observedTicks: options.ticks ?? 60,
    ageSeconds: options.ageSeconds ?? 0,
    value,
    ...(options.speed === undefined ? {} : { speedMps: options.speed }),
    ...(options.correlatedWith === undefined ? {} : { correlatedWith: options.correlatedWith }),
  };
}

function series(
  count: number,
  value: number,
  options: {
    readonly ticks?: number;
    readonly ageSeconds?: number;
    readonly idPrefix?: string;
    readonly speed?: (index: number) => number;
  } = {},
): ProfileBlendEpisode[] {
  const idPrefix = options.idPrefix ?? 'occ';
  return Array.from({ length: count }, (_, index) =>
    episode(`${idPrefix}-${index + 1}`, value, {
      ...(options.ticks === undefined ? {} : { ticks: options.ticks }),
      ...(options.ageSeconds === undefined ? {} : { ageSeconds: options.ageSeconds }),
      ...(options.speed ? { speed: options.speed(index) } : {}),
    }),
  );
}

function candidate(key: ParameterKey, value: number | null): ConfidenceCandidate {
  return { key, status: 'CANDIDATE', value };
}

function near(actual: number, expected: number, tolerance = 1e-3): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('101 one noisy episode is bounded instead of rewriting the profile', () => {
  const result = blendProfileValue({
    key: 'speed_delta_urban',
    oldValue: 1.5,
    evidence: read('speed_delta_urban', 1),
    episodes: [episode('free-1', 4, { ticks: 600 })],
    candidate: candidate('speed_delta_urban', 4),
  });

  assert.equal(result.resolution, 'APPLIED');
  assert.equal(result.changed, true);
  assert.equal(result.learningWeight, PROFILE_BLEND_POLICY.novelEvidenceWeightCap);
  near(result.value, 1.875);
  assert.ok(
    result.value - 1.5 < 0.25 * (4 - 1.5),
    'a single demonstration must move less than a quarter of the observed gap',
  );
  assert.ok(result.value < 2, 'one noisy episode would otherwise jump straight to the estimate');
});

test('101 repeated consistent episodes move the profile strongly', () => {
  const episodes = series(16, 4, { ticks: 600 });
  const first = blendProfileValue({
    key: 'speed_delta_urban',
    oldValue: 1.5,
    evidence: read('speed_delta_urban', 16),
    episodes,
    candidate: candidate('speed_delta_urban', 4),
  });
  assert.equal(first.learningWeight, PROFILE_BLEND_POLICY.maxUpdateWeight);
  near(first.value, 3);

  const single = blendProfileValue({
    key: 'speed_delta_urban',
    oldValue: 1.5,
    evidence: read('speed_delta_urban', 1),
    episodes: [episode('free-1', 4, { ticks: 600 })],
    candidate: candidate('speed_delta_urban', 4),
  });
  assert.ok(first.value - single.value > 0.8, 'repetition must outweigh one demonstration');

  let chained = first;
  for (let index = 0; index < 4; index += 1) {
    chained = blendProfileValue({
      key: 'speed_delta_urban',
      oldValue: chained.value,
      evidence: read('speed_delta_urban', 16),
      episodes,
      candidate: candidate('speed_delta_urban', 4),
      history: chained.history,
    });
  }
  assert.ok(chained.value > 3.95, 'repeated consistent style must converge on the estimate');
  assert.equal(chained.history.length, 5);
});

test('101 observed zero is applied as a real value, not skipped', () => {
  const result = blendProfileValue({
    key: 'stop_full_probability',
    oldValue: 1,
    evidence: read('stop_full_probability', 3),
    episodes: series(3, 0),
    candidate: candidate('stop_full_probability', 0),
  });

  assert.equal(result.estimate, 0);
  assert.equal(result.resolution, 'APPLIED');
  assert.equal(result.changed, true);
  assert.ok(result.learningWeight > 0.4, 'zero evidence must carry a real learning weight');
  near(result.value, 1 - result.learningWeight);
  assert.ok(result.value < 0.6);
});

test('101 unobserved and weak evidence leave the exact old value', () => {
  const unobserved = blendProfileValue({
    key: 'speed_delta_residential',
    oldValue: 1.7,
    evidence: read('speed_delta_residential', 0, 'NO_EVIDENCE'),
    episodes: [],
    candidate: candidate('speed_delta_residential', 5),
  });
  assert.equal(unobserved.resolution, 'HELD_UNOBSERVED');
  assert.equal(unobserved.value, 1.7);
  assert.equal(unobserved.learningWeight, 0);
  assert.equal(unobserved.changed, false);
  assert.equal(unobserved.unchanged, true);

  const weak = blendProfileValue({
    key: 'curve_lateral_accel',
    oldValue: 2.5,
    evidence: read('curve_lateral_accel', 1, 'INSUFFICIENT'),
    episodes: [episode('curve-1', 5)],
    candidate: candidate('curve_lateral_accel', 5),
  });
  assert.equal(weak.resolution, 'HELD_WEAK');
  assert.equal(weak.value, 2.5);
  assert.equal(weak.learningWeight, 0);
  assert.equal(weak.changed, false);
});

test('101 severe contradiction holds the value and keeps the observed interval', () => {
  const result = blendProfileValue({
    key: 'curve_lateral_accel',
    oldValue: 2.5,
    evidence: read('curve_lateral_accel', 3),
    episodes: [episode('curve-1', 1), episode('curve-2', 7), episode('curve-3', 4)],
    candidate: candidate('curve_lateral_accel', 4),
  });

  assert.equal(result.resolution, 'HELD_CONTRADICTION');
  assert.equal(result.value, 2.5);
  assert.equal(result.learningWeight, 0);
  assert.deepEqual(result.interval, [1, 7]);
  assert.equal(result.contradiction.severity, 'SEVERE');
  assert.equal(result.estimate, null, 'contradictory evidence must not expose an averaged point');
});

test('101 moderate dispersion is applied at reduced weight with the interval retained', () => {
  const result = blendProfileValue({
    key: 'following_time_headway',
    oldValue: 2.4,
    evidence: read('following_time_headway', 3),
    episodes: [
      episode('lead-1', 1.0, { speed: 4 }),
      episode('lead-2', 1.6, { speed: 10 }),
      episode('lead-3', 2.0, { speed: 20 }),
    ],
    candidate: candidate('following_time_headway', 1.5),
  });

  assert.equal(result.contradiction.severity, 'MODERATE');
  assert.equal(result.resolution, 'APPLIED_WITH_INTERVAL');
  assert.deepEqual(result.interval, [1, 2]);
  assert.ok(result.learningWeight > 0 && result.learningWeight < 0.15);
  assert.ok(result.value > 2.2, 'the moderate penalty keeps the step smaller than plain quality');
  assert.ok(result.value < 2.4);
  assert.equal(result.changed, true);
});

test('101 consistent risky evidence is not dragged toward a safe base', () => {
  const result = blendProfileValue({
    key: 'curve_lateral_accel',
    oldValue: 6.5,
    evidence: read('curve_lateral_accel', 4),
    episodes: series(4, 6.8),
    candidate: candidate('curve_lateral_accel', 6.8),
  });

  assert.equal(result.resolution, 'APPLIED');
  assert.ok(
    result.value > 6.5,
    'a risky style supported by evidence must move toward the estimate',
  );
  assert.ok(result.value > 6.6);
  near(result.value, 6.65);
  assert.ok(
    result.value > parameterRegistry.curve_lateral_accel.default,
    'no hidden shrink toward the safe default is allowed',
  );
});

test('101 bounded regularization does not erase a consistently extreme style', () => {
  const noisy = blendProfileValue({
    key: 'speed_delta_urban',
    oldValue: 12,
    evidence: read('speed_delta_urban', 1),
    episodes: [episode('free-1', 2, { ticks: 600 })],
    candidate: candidate('speed_delta_urban', 2),
  });
  assert.equal(noisy.learningWeight, PROFILE_BLEND_POLICY.novelEvidenceWeightCap);
  assert.ok(noisy.value >= 10, 'one low demonstration must not erase an established extreme');
  assert.ok(noisy.value < 12);

  const consistent = series(12, 12.5, { ticks: 600 });
  let result = noisy;
  for (let index = 0; index < 4; index += 1) {
    result = blendProfileValue({
      key: 'speed_delta_urban',
      oldValue: result.value,
      evidence: read('speed_delta_urban', 12),
      episodes: consistent,
      candidate: candidate('speed_delta_urban', 12.5),
      history: result.history,
    });
  }
  assert.equal(result.learningWeight, PROFILE_BLEND_POLICY.maxUpdateWeight);
  assert.ok(result.value > 12.3, 'repeated extreme evidence must keep the extreme style');
  assert.ok(result.value < 12.5);
});

test('101 recency gives recent episodes more weight without erasing old ones', () => {
  const episodes = series(12, 3, { ticks: 600 });
  const recent = blendProfileValue({
    key: 'speed_delta_urban',
    oldValue: 1.5,
    evidence: read('speed_delta_urban', 12),
    episodes,
    candidate: candidate('speed_delta_urban', 3),
  });
  const old = blendProfileValue({
    key: 'speed_delta_urban',
    oldValue: 1.5,
    evidence: read('speed_delta_urban', 12),
    episodes: series(12, 3, { ticks: 600, ageSeconds: 30 * DAY }),
    candidate: candidate('speed_delta_urban', 3),
  });

  assert.equal(recent.update.newestAgeSeconds, 0);
  assert.equal(old.update.oldestAgeSeconds, 30 * DAY);
  assert.ok(
    recent.learningWeight > old.learningWeight * 10,
    'ignoring age would give identical weights',
  );
  assert.ok(old.learningWeight > 0, 'very old evidence is decayed, not discarded');
  assert.ok(old.value > 1.5 && old.value < 1.7);
  assert.ok(recent.value > old.value + 0.5);
});

test('101 a style change accumulates from recent episodes after an old habit', () => {
  const oldHabit = series(12, 1.5, { ticks: 600, ageSeconds: 30 * DAY });
  const first = blendProfileValue({
    key: 'speed_delta_urban',
    oldValue: 3,
    evidence: read('speed_delta_urban', 12),
    episodes: oldHabit,
    candidate: candidate('speed_delta_urban', 1.5),
  });
  assert.ok(first.value > 2.9, 'old evidence must not rewrite the profile in one step');
  assert.ok(first.value < 3);

  const changedStyle = [...oldHabit, ...series(24, 3.4, { ticks: 600, idPrefix: 'new' })];
  let result = first;
  for (let index = 0; index < 3; index += 1) {
    result = blendProfileValue({
      key: 'speed_delta_urban',
      oldValue: result.value,
      evidence: read('speed_delta_urban', 36),
      episodes: changedStyle,
      candidate: candidate('speed_delta_urban', 3.4),
      history: result.history,
    });
  }
  assert.equal(result.learningWeight, PROFILE_BLEND_POLICY.maxUpdateWeight);
  assert.ok(result.value > 3.35, 'a repeated new style must be able to replace the old habit');
  assert.ok(result.value < 3.4);
});

test('101 provenance history records each update and never publishes', () => {
  const implementedBefore = parameterRegistry.speed_delta_urban.implemented;
  const estimableBefore = parameterRegistry.speed_delta_urban.estimable;
  const episodes = [episode('free-1', 4, { ticks: 600 })];
  const first = blendProfileValue({
    key: 'speed_delta_urban',
    oldValue: 1.5,
    evidence: read('speed_delta_urban', 1),
    episodes,
    candidate: candidate('speed_delta_urban', 4),
  });
  const second = blendProfileValue({
    key: 'speed_delta_urban',
    oldValue: first.value,
    evidence: read('speed_delta_urban', 1),
    episodes,
    candidate: candidate('speed_delta_urban', 4),
    history: first.history,
  });

  assert.equal(PROFILE_BLEND_VERSION, '101-profile-blend-v1');
  assert.equal(second.history.length, 2);
  assert.deepEqual(
    second.history.map((entry) => entry.sequence),
    [0, 1],
  );
  assert.equal(second.update.previousValue, first.value);
  near(second.value, first.value + first.learningWeight * (4 - first.value));
  assert.deepEqual(second.update.episodeIdentities, ['free-1#1']);
  assert.equal(second.published, false);
  assert.equal(second.learned, false);
  assert.equal(parameterRegistry.speed_delta_urban.implemented, implementedBefore);
  assert.equal(parameterRegistry.speed_delta_urban.estimable, estimableBefore);
  assert.ok(Object.isFrozen(second));
  assert.ok(Object.isFrozen(second.history));
  assert.ok(Object.isFrozen(second.history[1]));
  assert.ok(Object.isFrozen(second.update.episodeIdentities));
});

test('101 updates are bounded and invalid inputs are rejected', () => {
  const inRange = blendProfileValue({
    key: 'speed_delta_urban',
    oldValue: 1.5,
    evidence: read('speed_delta_urban', 12),
    episodes: series(12, 15, { ticks: 600 }),
    candidate: candidate('speed_delta_urban', 15),
  });
  assert.equal(inRange.learningWeight, PROFILE_BLEND_POLICY.maxUpdateWeight);
  near(inRange.value, 9.6, 1e-3);
  assert.ok(inRange.value < 10, 'weight 1 would jump straight to 15');
  assert.equal(inRange.clampedToBounds, false);

  const beyond = blendProfileValue({
    key: 'speed_delta_urban',
    oldValue: 1.5,
    evidence: read('speed_delta_urban', 12),
    episodes: series(12, 1000, { ticks: 600 }),
    candidate: candidate('speed_delta_urban', 1000),
  });
  assert.equal(beyond.value, 15);
  assert.equal(beyond.clampedToBounds, true);
  assert.equal(beyond.estimate, 1000);

  const otherKey = blendProfileValue({
    key: 'stop_full_probability',
    oldValue: 1,
    evidence: read('stop_full_probability', 0, 'NO_EVIDENCE'),
    episodes: [],
    candidate: candidate('stop_full_probability', 0),
  });

  assert.throws(() =>
    blendProfileValue({
      key: 'speed_delta_urban',
      oldValue: Number.NaN,
      evidence: read('speed_delta_urban', 1),
      episodes: [episode('free-1', 4, { ticks: 600 })],
      candidate: candidate('speed_delta_urban', 4),
    }),
  );
  assert.throws(() =>
    blendProfileValue({
      key: 'speed_delta_urban',
      oldValue: 1.5,
      evidence: read('speed_delta_urban', 1),
      episodes: [episode('free-1', 4, { ticks: 600, ageSeconds: -1 })],
      candidate: candidate('speed_delta_urban', 4),
    }),
  );
  assert.throws(() =>
    blendProfileValue({
      key: 'speed_delta_urban',
      oldValue: 1.5,
      evidence: read('speed_delta_urban', 1),
      episodes: [episode('free-1', 4, { ticks: 600 })],
      candidate: candidate('speed_delta_urban', 4),
      history: otherKey.history,
    }),
  );
});
