import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deriveLiveLearningPayload,
  LIVE_EVIDENCE_VERSION,
  liveEvidenceKeys,
} from '../../src/learning';
import { createLiveLearningFixture } from '../harness/live-learning-fixture';

test('273 live evidence projects the real 272 segment into the 093/094/098 pipeline', () => {
  const fixture = createLiveLearningFixture();
  try {
    const segment = fixture.drive({
      segmentId: 'evidence-speed',
      startDistanceM: 130,
      ticks: 1080,
      speed: (tick, total) => (tick < total - 180 ? 10 : 2),
    });
    const payload = deriveLiveLearningPayload(segment, { baseValue: () => 0 });
    assert.equal(payload.version, LIVE_EVIDENCE_VERSION);
    assert.ok(liveEvidenceKeys.includes(payload.key as never));
    assert.equal(payload.evidence.status, 'READY');
    assert.equal(payload.candidate.status, 'CANDIDATE');
    assert.equal(payload.insufficient, false);
    assert.equal(payload.observations.eligibleWindows, 1);
    assert.equal(payload.observations.speedWindows, 1);
    assert.equal(payload.evidence.distinctEpisodes, payload.episodes.length);
    assert.equal(payload.episodes[0]?.ageSeconds, 0);
    assert.ok((payload.candidate.value ?? 0) <= 0);
    assert.equal(payload.evidence.unchanged, true);
  } finally {
    fixture.dispose();
  }
});

test('273 live evidence never turns an unobservable window into a demonstration', () => {
  const fixture = createLiveLearningFixture();
  try {
    const segment = fixture.drive({
      segmentId: 'evidence-not-observable',
      startDistanceM: 130,
      ticks: 1080,
      camera: false,
    });
    const payload = deriveLiveLearningPayload(segment, { baseValue: () => 0 });
    assert.equal(payload.evidence.status, 'NO_EVIDENCE');
    assert.equal(payload.candidate.value, null);
    assert.equal(payload.insufficient, true);
    assert.equal(payload.episodes.length, 0);
    assert.equal(payload.observations.eligibleWindows, 0);
  } finally {
    fixture.dispose();
  }
});

test('273 live evidence refuses a manual segment and an incomplete context', () => {
  const fixture = createLiveLearningFixture();
  try {
    const manual = fixture.drive({ segmentId: 'evidence-manual', mode: 'MANUAL', ticks: 600 });
    assert.throws(
      () => deriveLiveLearningPayload(manual, { baseValue: () => 0 }),
      /closed eligible LEARNING segment/,
    );
  } finally {
    fixture.dispose();
  }
});

test('273 live evidence keeps a single STOP below the 093 threshold instead of inventing a habit', () => {
  const fixture = createLiveLearningFixture();
  try {
    const segment = fixture.drive({
      segmentId: 'evidence-one-stop',
      startDistanceM: 130,
      ticks: 300,
      speed: () => 9,
    });
    const payload = deriveLiveLearningPayload(segment, { baseValue: () => 1 });
    assert.equal(payload.key, 'stop_full_probability');
    assert.equal(payload.evidence.status, 'INSUFFICIENT');
    assert.equal(payload.evidence.distinctEpisodes, 1);
    assert.equal(payload.candidate.status, 'UNOBSERVED');
    assert.equal(payload.candidate.value, null);
    assert.equal(payload.insufficient, true);
    assert.equal(payload.observations.stopOpportunities, 1);
  } finally {
    fixture.dispose();
  }
});
