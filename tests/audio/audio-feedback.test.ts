import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUDIO_LIMITS, AUDIO_FEEDBACK_LIMITS, AUDIO_FEEDBACK_VERSION } from '../../src/audio';
import { createMissionTracker, parseMissionCatalog } from '../../src/missions';
import type { MissionTracker } from '../../src/missions';
import { learningNotificationGenerationKey, learningNotificationJobKey } from '../../src/app';
import { notificationFromPublication } from '../../src/app';
import { createLearningNotifications } from '../../src/ui';
import type { LearningNotificationEvent } from '../../src/ui';
import {
  AUDIO_FEEDBACK_SESSION_ID,
  AUDIO_FEEDBACK_WORLD_EPOCH,
  createAudioFeedbackHarness,
  dropoffEvent,
  manualStartEvent,
  profileActivateEvent,
} from './audio-feedback-fixture';
import { createHudDocument, createHudHost } from '../ui/hud-dom';
import { learningJob } from '../ui/learning-notifications-fixture';

function missionTracker(): MissionTracker {
  const catalog = parseMissionCatalog({
    schemaVersion: 1,
    units: 'SI',
    version: '116-mission-schema-v1',
    namespace: 'missions:149',
    missions: [
      {
        schemaVersion: 1,
        units: 'SI',
        missionId: 'mission-149',
        version: '1',
        title: 'Misiune de test 149',
        objectives: [
          {
            objectiveId: 'dropoffs',
            kind: 'DROPOFFS',
            label: 'Finalizează o cursă',
            target: 1,
            difficultyTargets: { NORMAL: 1 },
            minDurationS: null,
            profileId: null,
          },
        ],
        rewards: [{ rewardId: 'xp', kind: 'XP', amount: 10, unlockId: null }],
        replay: {
          profileSource: 'CURRENT',
          snapshotId: null,
          scenarioId: null,
          comparisonProfileIds: [],
        },
        windowTicks: null,
        incidentBudget: null,
        prerequisites: [],
      },
    ],
  });
  return createMissionTracker({
    catalog,
    context: { sessionId: AUDIO_FEEDBACK_SESSION_ID, worldEpoch: AUDIO_FEEDBACK_WORLD_EPOCH },
  });
}

/** The real 079 publication notification of an explicit 110/112 payload. */
function publishedNotification(versionId: string, tick: number): LearningNotificationEvent {
  const job = learningJob();
  return notificationFromPublication(
    {
      publicationVersionId: versionId,
      published: true,
      profileId: job.profileId,
      key: job.key,
      previousValue: job.baseValue,
      value: job.baseValue - 0.2,
      segmentId: job.segmentId,
      jobKey: learningNotificationJobKey(job),
      generationKey: learningNotificationGenerationKey(job),
      learningEpoch: job.learningEpoch,
      order: job.order,
      mode: job.mode,
      sessionId: job.sessionId,
      worldEpoch: job.worldEpoch,
      tick,
    },
    { eventId: `079:publication:${versionId}` },
  );
}

test('149 the takeover of the 066/068 seat sounds once and never twice', () => {
  const harness = createAudioFeedbackHarness();
  try {
    const published = harness.bus.publish(manualStartEvent('event:149:takeover:1', 10, 'taxi-1'));
    assert.equal(published.status, 'delivered');
    assert.deepEqual(harness.playedCues(), ['takeover-notice']);
    const voice = harness.playingVoices()[0]!;
    assert.equal(voice.ownerId, 'feedback:TAKEOVER');
    assert.equal(voice.category, 'ui');

    // The same real event, relayed by the host: the bus already refuses it.
    const relayed = harness.bus.publish(manualStartEvent('event:149:takeover:1', 10, 'taxi-1'));
    assert.equal(relayed.status, 'duplicate');

    // The same real event, delivered directly to the feedback: the key refuses it.
    const direct = harness.feedback.publishTakeover({
      eventId: 'event:149:takeover:1',
      tick: 10,
      vehicleId: 'taxi-1',
      controlMode: 'MANUAL',
    });
    assert.equal(direct.status, 'DUPLICATE');
    assert.equal(harness.playedCues().length, 1);
    assert.equal(harness.feedback.getStats().duplicates, 1);
    assert.equal(harness.feedback.getStats().played, 1);
  } finally {
    harness.dispose();
  }
});

test('149 the publication sounds once for the activation and its 079 notification', () => {
  const harness = createAudioFeedbackHarness();
  try {
    const published = harness.bus.publish(
      profileActivateEvent('event:149:activation:1', 30, 'style:079', 'style:079:v3'),
    );
    assert.equal(published.status, 'delivered');
    assert.deepEqual(harness.playedCues(), ['profile-notice']);

    // The 079 notification of the same publication shares the publication key.
    const notification = publishedNotification('style:079:v3', 30);
    const result = harness.feedback.publishLearningNotification(notification);
    assert.equal(result.status, 'DUPLICATE');
    assert.equal(harness.playedCues().length, 1);

    // Another publication is a new version and a new sound. The 148 cooldown is applied on the
    // real clock, so the second publication happens after the cooldown of the family.
    harness.backend.advance(AUDIO_LIMITS.oneShotCooldownS + 0.1);
    harness.bus.publish(
      profileActivateEvent('event:149:activation:2', 40, 'style:079', 'style:079:v4'),
    );
    assert.deepEqual(harness.playedCues(), ['profile-notice', 'profile-notice']);
  } finally {
    harness.dispose();
  }
});

test('149 a late result sounds the real outcome and never the anticipated state', () => {
  const harness = createAudioFeedbackHarness();
  try {
    harness.bus.publish(manualStartEvent('event:149:takeover:2', 10, 'taxi-2'));
    assert.deepEqual(harness.playedCues(), ['takeover-notice']);

    // A candidate validated but not published is an analysis result, not a publication.
    const job = learningJob();
    const analysis = harness.feedback.publishLearningNotification({
      eventId: '079:result:1',
      sessionId: job.sessionId,
      worldEpoch: job.worldEpoch,
      segmentId: job.segmentId,
      jobKey: learningNotificationJobKey(job),
      generationKey: learningNotificationGenerationKey(job),
      profileId: job.profileId,
      learningEpoch: job.learningEpoch,
      tick: 20,
      mode: job.mode,
      key: job.key,
      order: job.order,
      kind: 'RESULT',
      label: 'Distanța de urmărire',
      unit: 's',
      previousValue: job.baseValue,
      value: job.baseValue - 0.1,
    });
    assert.equal(analysis.status, 'PLAYED');
    assert.equal(analysis.cueId, 'ui-tick');
    assert.equal(
      harness.playedCues().filter((cue) => cue === 'profile-notice').length,
      0,
      'a validated candidate is not a published profile',
    );

    // The publication arrives after the state changed: it sounds its own real outcome.
    const late = harness.feedback.publishPublication({
      eventId: 'event:149:publication:late',
      tick: 5,
      publicationVersionId: 'style:079:v9',
      profileId: 'style:079',
      published: true,
    });
    assert.equal(late.status, 'PLAYED');
    assert.equal(late.cueId, 'profile-notice');
    assert.equal(late.late, true);
    assert.deepEqual(harness.playedCues(), ['takeover-notice', 'ui-tick', 'profile-notice']);

    // A late learning notification is quiet: the 079 kind carries no sound descriptor.
    const stale = harness.feedback.publishLearningNotification({
      eventId: '079:stale:1',
      sessionId: job.sessionId,
      worldEpoch: job.worldEpoch,
      segmentId: job.segmentId,
      jobKey: learningNotificationJobKey(job),
      generationKey: learningNotificationGenerationKey(job),
      profileId: job.profileId,
      learningEpoch: job.learningEpoch,
      tick: 3,
      mode: job.mode,
      key: job.key,
      order: job.order,
      kind: 'STALE',
      reason: 'LATE_RESULT',
      detail: 'Rezultatul nu mai aparține jobului curent (RESULT).',
    });
    assert.equal(stale.status, 'SILENT');
    assert.equal(harness.playedCues().length, 3);
  } finally {
    harness.dispose();
  }
});

test('149 a rapid mute and category toggle keeps the voices bounded and orphaned free', () => {
  const harness = createAudioFeedbackHarness();
  try {
    harness.bus.publish(manualStartEvent('event:149:takeover:3', 5, 'taxi-3'));
    const voicesAfterTakeover = harness.playingVoices().length;
    assert.equal(voicesAfterTakeover, 1);

    for (let index = 0; index < 60; index += 1) {
      harness.engine.setMuted(index % 2 === 0);
      harness.engine.applyPreferences({
        schemaVersion: 1,
        master: 0.8,
        engine: 0.5,
        impact: 0.4,
        ui: 0.6,
        muted: index % 2 === 0,
      });
    }

    const stats = harness.engine.getStats();
    assert.equal(stats.muted, false);
    assert.ok(stats.activeVoices <= AUDIO_LIMITS.totalVoices);
    assert.ok(stats.voicesByCategory.ui <= AUDIO_LIMITS.uiVoices);
    assert.ok(stats.bufferBytes <= AUDIO_LIMITS.maxBufferBytes);
    assert.ok(stats.buffers <= AUDIO_LIMITS.maxBuffers);

    // The toggle loop never creates a voice and never releases one.
    assert.equal(harness.playingVoices().length, voicesAfterTakeover);

    // A burst of takeovers inside the cooldown of the engine sounds once.
    for (let index = 0; index < 10; index += 1)
      harness.bus.publish(manualStartEvent(`event:149:takeover:burst:${index}`, 6, 'taxi-3'));
    assert.equal(harness.playingVoices().length, voicesAfterTakeover);
    assert.ok(harness.engine.getStats().cooldownSkips > 0);

    // The one-shot expires on its own: no orphan voice survives the burst.
    harness.backend.advance(AUDIO_LIMITS.oneShotCooldownS + 1);
    harness.engine.updateVehicle({
      entityId: 'taxi-3',
      speedMps: 0,
      loadFactor: 0,
      brakeFactor: 0,
      slipFactor: 0,
      distanceM: 0,
    });
    assert.equal(harness.playingVoices().length, 0);
  } finally {
    harness.dispose();
  }
});

test('149 the mission state sounds once per real 116 instance', () => {
  const tracker = missionTracker();
  const harness = createAudioFeedbackHarness({ missions: tracker });
  try {
    const started = tracker.start({ missionId: 'mission-149', tick: 1, difficulty: 'NORMAL' });
    assert.equal(started.duplicate, false);
    const instanceId = started.instance.instanceId;

    const active = harness.feedback.publishMissionState(instanceId);
    assert.equal(active.status, 'PLAYED');
    assert.equal(active.cueId, 'ui-tick');
    assert.deepEqual(harness.playedCues(), ['ui-tick']);

    // The same active instance, observed again, never sounds twice.
    const repeated = harness.feedback.publishMissionState(instanceId);
    assert.equal(repeated.status, 'DUPLICATE');
    assert.equal(harness.playedCues().length, 1);

    tracker.ingest(dropoffEvent('event:149:dropoff:1', 4, 'taxi-4', 'ride-4'));
    const instance = tracker.instance(instanceId)!;
    assert.equal(instance.state, 'COMPLETED');

    // The completion happens after the cooldown of the mission family.
    harness.backend.advance(AUDIO_LIMITS.oneShotCooldownS + 0.1);
    const completed = harness.feedback.publishMissionState(instanceId);
    assert.equal(completed.status, 'PLAYED');
    assert.equal(completed.visual?.text.includes('Misiune completată'), true);
    assert.equal(harness.playedCues().length, 2);

    const again = harness.feedback.publishMissionState(instanceId);
    assert.equal(again.status, 'DUPLICATE');
    assert.equal(harness.playedCues().length, 2);

    // An instance the real tracker does not know never sounds.
    const unknown = harness.feedback.publishMissionState('mission-149:unknown');
    assert.equal(unknown.status, 'UNKNOWN_MISSION');
    assert.equal(harness.playedCues().length, 2);
    assert.equal(harness.feedback.getStats().unknownMissions, 1);
  } finally {
    tracker.dispose();
    harness.dispose();
  }
});

test('149 every sound has a visual twin in the indicator and in the 079 rows', () => {
  const harness = createAudioFeedbackHarness();
  const doc = createHudDocument();
  const host = createHudHost(doc);
  const notifications = createLearningNotifications(host as unknown as HTMLElement);
  try {
    harness.bus.publish(manualStartEvent('event:149:takeover:4', 10, 'taxi-5'));
    harness.bus.publish(
      profileActivateEvent('event:149:activation:3', 20, 'style:079', 'style:079:v5'),
    );

    // The indicator shows the visual twin of the last sound.
    const root = harness.indicatorRoot();
    assert.equal(root.getAttribute('data-kind'), 'PUBLICATION');
    assert.equal(root.getAttribute('data-version'), 'style:079:v5');
    assert.equal(root.getAttribute('data-published'), 'true');
    assert.ok(root.textContent.includes('Profil publicat'));

    // Every accepted sound has a visual companion.
    assert.equal(harness.visuals.length, 2);
    assert.equal(harness.visuals[0]?.text.includes('taxi-5'), true);
    assert.equal(harness.visuals[1]?.text.includes('style:079:v5'), true);
    assert.equal(harness.feedback.getStats().visualShown, 2);

    // The 079 infrastructure keeps the detailed publication message.
    const notification = publishedNotification('style:079:v5', 20);
    const pushed = notifications.push(notification, 20);
    assert.equal(pushed.status, 'ACCEPTED');
    const rows = notifications.getView().notifications;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.kind, 'PUBLISHED');
    assert.equal(rows[0]?.symbol, '★');
    assert.equal(rows[0]?.published, true);
    assert.ok(rows[0]?.text.includes('Profil publicat'));

    // The bounded registry of the feedback keeps its own limit.
    assert.ok(AUDIO_FEEDBACK_LIMITS.emittedKeys > 0);
    assert.equal(harness.feedback.getStats().retainedKeys, 2);
    assert.equal(harness.feedback.getStats().version, AUDIO_FEEDBACK_VERSION);
  } finally {
    notifications.dispose();
    harness.dispose();
  }
});

test('149 the visual twin is shown even when the engine refuses the sound', () => {
  const harness = createAudioFeedbackHarness({ gesture: false });
  try {
    const result = harness.feedback.publishTakeover({
      eventId: 'event:149:takeover:5',
      tick: 1,
      vehicleId: 'taxi-6',
      controlMode: 'LEARNING',
    });
    assert.equal(result.status, 'AWAITING_GESTURE');
    assert.equal(result.visual?.text.includes('taxi-6'), true);
    assert.equal(harness.visuals.length, 1);
    assert.equal(harness.feedback.getStats().awaitingGesture, 1);
    assert.equal(harness.playedCues().length, 0);
  } finally {
    harness.dispose();
  }
});
