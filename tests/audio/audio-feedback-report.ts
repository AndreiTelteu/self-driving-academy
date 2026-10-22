import {
  AUDIO_CUES,
  AUDIO_FEEDBACK_LIMITS,
  AUDIO_FEEDBACK_VERSION,
  AUDIO_LIMITS,
} from '../../src/audio';
import { learningNotificationGenerationKey, learningNotificationJobKey } from '../../src/app';
import { notificationFromPublication } from '../../src/app';
import { createLearningNotifications } from '../../src/ui';
import { createMissionTracker, parseMissionCatalog } from '../../src/missions';
import { createHudDocument, createHudHost } from '../ui/hud-dom';
import { learningJob } from '../ui/learning-notifications-fixture';
import {
  AUDIO_FEEDBACK_SESSION_ID,
  AUDIO_FEEDBACK_WORLD_EPOCH,
  createAudioFeedbackHarness,
  dropoffEvent,
  manualStartEvent,
  profileActivateEvent,
} from './audio-feedback-fixture';

export interface AudioFeedbackReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface AudioFeedbackReportScenario {
  readonly name: string;
  readonly detail: string;
  readonly data: Readonly<Record<string, string | number | boolean>>;
}

export interface AudioFeedbackReport {
  readonly version: string;
  readonly contract: Readonly<{
    readonly limits: Readonly<Record<string, number | string>>;
    readonly cues: readonly Readonly<{ cueId: string; category: string; usedBy: string }>[];
    readonly families: readonly Readonly<{ kind: string; cue: string; event: string }>[];
    readonly visual: string;
  }>;
  readonly scenarios: readonly AudioFeedbackReportScenario[];
  readonly checks: readonly AudioFeedbackReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): AudioFeedbackReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function missionTracker(): ReturnType<typeof createMissionTracker> {
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
            label: 'Finalizeaza o cursa',
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

/**
 * Deterministic report of the 149 feedback: the real engine on the fake backend, the real 007 bus,
 * the real 116 tracker and the real 079 notification contract.
 */
export function runAudioFeedbackReport(): AudioFeedbackReport {
  const scenarios: AudioFeedbackReportScenario[] = [];
  const checks: AudioFeedbackReportCheck[] = [];

  // 1. Before the player gesture nothing sounds, but the information stays visible.
  const silent = createAudioFeedbackHarness({ gesture: false });
  const refused = silent.feedback.publishTakeover({
    eventId: 'report:takeover:refused',
    tick: 1,
    vehicleId: 'taxi-1',
    controlMode: 'MANUAL',
  });
  scenarios.push(
    Object.freeze({
      name: 'gesture-required',
      detail:
        'Without a player gesture the engine refuses the cue; the visual twin of the takeover is still shown.',
      data: Object.freeze({
        status: refused.status,
        voices: silent.playingVoices().length,
        visuals: silent.visuals.length,
        awaitingGesture: silent.feedback.getStats().awaitingGesture,
      }),
    }),
  );
  checks.push(
    check(
      'gesture/status',
      'AWAITING_GESTURE',
      refused.status,
      'The 148 engine refuses the cue before the gesture.',
    ),
    check(
      'gesture/no-voice',
      0,
      silent.playingVoices().length,
      'No voice exists before the gesture.',
    ),
    check(
      'gesture/visual-shown',
      1,
      silent.visuals.length,
      'The information never depends on the sound: the visual twin is shown anyway.',
    ),
  );
  silent.dispose();

  // 2. The takeover of the 066/068 seat sounds once.
  const takeover = createAudioFeedbackHarness();
  takeover.bus.publish(manualStartEvent('report:takeover:1', 10, 'taxi-2'));
  const takeoverRelayed = takeover.bus.publish(manualStartEvent('report:takeover:1', 10, 'taxi-2'));
  const takeoverDirect = takeover.feedback.publishTakeover({
    eventId: 'report:takeover:1',
    tick: 10,
    vehicleId: 'taxi-2',
    controlMode: 'MANUAL',
  });
  scenarios.push(
    Object.freeze({
      name: 'takeover',
      detail:
        'The real 007 MANUAL_START event becomes one takeover cue; the relayed and the direct repetition sound nothing.',
      data: Object.freeze({
        cues: takeover.playedCues().join(','),
        busStatus: takeoverRelayed.status,
        directStatus: takeoverDirect.status,
        duplicates: takeover.feedback.getStats().duplicates,
        visual: takeover.visuals[0]?.text ?? '',
      }),
    }),
  );
  checks.push(
    check(
      'takeover/cue',
      'takeover-notice',
      takeover.playedCues()[0] ?? 'none',
      'The takeover cue played.',
    ),
    check('takeover/one-voice', 1, takeover.playedCues().length, 'Exactly one voice was started.'),
    check(
      'takeover/bus-duplicate',
      'duplicate',
      takeoverRelayed.status,
      'The 007 bus refuses the repeated event.',
    ),
    check(
      'takeover/direct-duplicate',
      'DUPLICATE',
      takeoverDirect.status,
      'The idempotency key refuses the repeated event.',
    ),
    check(
      'takeover/visual',
      true,
      takeover.visuals[0]?.text.includes('taxi-2') ?? false,
      'The visual twin names the vehicle of the real event.',
    ),
  );
  takeover.dispose();

  // 3. The publication sounds once for the activation and for its 079 notification.
  const publication = createAudioFeedbackHarness();
  publication.bus.publish(
    profileActivateEvent('report:activation:1', 30, 'style:149', 'style:149:v3'),
  );
  const job = learningJob();
  const notification = notificationFromPublication(
    {
      publicationVersionId: 'style:149:v3',
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
      tick: 30,
    },
    { eventId: '079:publication:style:149:v3' },
  );
  const notificationResult = publication.feedback.publishLearningNotification(notification);
  scenarios.push(
    Object.freeze({
      name: 'publication',
      detail:
        'The 007 PROFILE_ACTIVATE event and the 079 publication notification share one key: the profile sounds once.',
      data: Object.freeze({
        cues: publication.playedCues().join(','),
        notificationStatus: notificationResult.status,
        duplicates: publication.feedback.getStats().duplicates,
        visual: publication.visuals[0]?.text ?? '',
      }),
    }),
  );
  checks.push(
    check(
      'publication/cue',
      'profile-notice',
      publication.playedCues()[0] ?? 'none',
      'The publication cue played.',
    ),
    check(
      'publication/one-voice',
      1,
      publication.playedCues().length,
      'The activation and the notification produced a single sound.',
    ),
    check(
      'publication/notification-duplicate',
      'DUPLICATE',
      notificationResult.status,
      'The 079 notification shares the publication key.',
    ),
    check(
      'publication/visual',
      true,
      publication.visuals[0]?.text.includes('style:149:v3') ?? false,
      'The visual twin names the published version.',
    ),
  );
  publication.dispose();

  // 4. A late result sounds its own real outcome.
  const late = createAudioFeedbackHarness();
  late.bus.publish(manualStartEvent('report:takeover:2', 10, 'taxi-3'));
  const analysis = late.feedback.publishLearningNotification({
    eventId: '079:result:report',
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
  const publicationCuesBeforeLate = late
    .playedCues()
    .filter((cue) => cue === 'profile-notice').length;
  const latePublication = late.feedback.publishPublication({
    eventId: 'report:publication:late',
    tick: 5,
    publicationVersionId: 'style:149:v9',
    profileId: 'style:149',
    published: true,
  });
  scenarios.push(
    Object.freeze({
      name: 'late-result',
      detail:
        'A validated candidate is an analysis result, not a publication; the late publication sounds its own real outcome.',
      data: Object.freeze({
        cues: late.playedCues().join(','),
        analysisCue: analysis.cueId ?? 'none',
        lateFlag: latePublication.late,
        lateCue: latePublication.cueId ?? 'none',
      }),
    }),
  );
  checks.push(
    check(
      'late/no-publication-for-candidate',
      0,
      publicationCuesBeforeLate,
      'A validated candidate never sounds like a published profile.',
    ),
    check(
      'late/analysis-cue',
      'ui-tick',
      analysis.cueId ?? 'none',
      'The analysis result has its own cue.',
    ),
    check('late/late-flag', true, latePublication.late, 'The late publication is marked as late.'),
    check(
      'late/own-outcome',
      'profile-notice',
      latePublication.cueId ?? 'none',
      'The late publication sounds the real outcome, not the anticipated state.',
    ),
  );
  late.dispose();

  // 5. A rapid mute and category toggle stays bounded.
  const toggle = createAudioFeedbackHarness();
  toggle.bus.publish(manualStartEvent('report:takeover:3', 5, 'taxi-4'));
  const beforeToggle = toggle.playingVoices().length;
  for (let index = 0; index < 60; index += 1) {
    toggle.engine.setMuted(index % 2 === 0);
    toggle.engine.applyPreferences({
      schemaVersion: 1,
      master: 0.8,
      engine: 0.5,
      impact: 0.4,
      ui: 0.6,
      muted: index % 2 === 0,
    });
  }
  for (let index = 0; index < 10; index += 1)
    toggle.bus.publish(manualStartEvent(`report:takeover:burst:${index}`, 6, 'taxi-4'));
  const toggleStats = toggle.engine.getStats();
  scenarios.push(
    Object.freeze({
      name: 'rapid-toggle',
      detail:
        'Sixty mute and category toggles and a burst of ten takeovers never create a second voice nor an orphan one.',
      data: Object.freeze({
        voicesBefore: beforeToggle,
        voicesAfter: toggle.playingVoices().length,
        activeVoices: toggleStats.activeVoices,
        uiVoices: toggleStats.voicesByCategory.ui,
        totalVoiceCap: AUDIO_LIMITS.totalVoices,
        cooldownSkips: toggleStats.cooldownSkips,
        buffers: toggleStats.buffers,
        maxBuffers: AUDIO_LIMITS.maxBuffers,
      }),
    }),
  );
  checks.push(
    check(
      'toggle/no-extra-voice',
      beforeToggle,
      toggle.playingVoices().length,
      'The toggles and the burst create no additional voice.',
    ),
    check(
      'toggle/within-total-cap',
      true,
      toggleStats.activeVoices <= AUDIO_LIMITS.totalVoices,
      'The active voices stay under the total cap.',
    ),
    check(
      'toggle/within-ui-cap',
      true,
      toggleStats.voicesByCategory.ui <= AUDIO_LIMITS.uiVoices,
      'The ui voices stay under the category cap.',
    ),
    check(
      'toggle/buffer-cap',
      true,
      toggleStats.buffers <= AUDIO_LIMITS.maxBuffers,
      'The buffers stay under the explicit cap.',
    ),
    check(
      'toggle/cooldown-counted',
      true,
      toggleStats.cooldownSkips > 0,
      'The burst is bounded by the 148 cooldown of the family.',
    ),
  );
  toggle.dispose();

  // 6. The mission state sounds once per real 116 instance.
  const tracker = missionTracker();
  const mission = createAudioFeedbackHarness({ missions: tracker });
  const started = tracker.start({ missionId: 'mission-149', tick: 1, difficulty: 'NORMAL' });
  const instanceId = started.instance.instanceId;
  mission.feedback.publishMissionState(instanceId);
  const repeated = mission.feedback.publishMissionState(instanceId);
  tracker.ingest(dropoffEvent('report:dropoff:1', 4, 'taxi-5', 'ride-5'));
  mission.backend.advance(AUDIO_LIMITS.oneShotCooldownS + 0.1);
  const completed = mission.feedback.publishMissionState(instanceId);
  const unknown = mission.feedback.publishMissionState('mission-149:unknown');
  scenarios.push(
    Object.freeze({
      name: 'mission-state',
      detail:
        'The mission state is read from the real 116 tracker: one sound per real state, nothing for an unknown instance.',
      data: Object.freeze({
        instanceId,
        cues: mission.playedCues().join(','),
        repeatedStatus: repeated.status,
        completedStatus: completed.status,
        completedVisual: completed.visual?.text ?? '',
        unknownStatus: unknown.status,
        unknownMissions: mission.feedback.getStats().unknownMissions,
      }),
    }),
  );
  checks.push(
    check(
      'mission/cues',
      'ui-tick,ui-tick',
      mission.playedCues().join(','),
      'The mission cues played.',
    ),
    check('mission/repeated', 'DUPLICATE', repeated.status, 'The repeated state sounds nothing.'),
    check(
      'mission/completed',
      'PLAYED',
      completed.status,
      'The completion of the real tracker sounds.',
    ),
    check(
      'mission/visual',
      true,
      completed.visual?.text.includes('Misiune completată') ?? false,
      'The visual twin names the completed mission.',
    ),
    check(
      'mission/unknown',
      'UNKNOWN_MISSION',
      unknown.status,
      'An unknown instance never sounds.',
    ),
  );
  mission.dispose();
  tracker.dispose();

  // 7. Every sound has a visual twin: the indicator and the 079 rows.
  const doc = createHudDocument();
  const host = createHudHost(doc);
  const notifications = createLearningNotifications(host as unknown as HTMLElement);
  const visual = createAudioFeedbackHarness();
  visual.bus.publish(manualStartEvent('report:takeover:4', 10, 'taxi-6'));
  visual.bus.publish(profileActivateEvent('report:activation:2', 20, 'style:149', 'style:149:v5'));
  const published = notificationFromPublication(
    {
      publicationVersionId: 'style:149:v5',
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
      tick: 20,
    },
    { eventId: '079:publication:style:149:v5' },
  );
  const pushed = notifications.push(published, 20);
  const rows = notifications.getView().notifications;
  const indicatorRoot = visual.indicatorRoot();
  scenarios.push(
    Object.freeze({
      name: 'visual-equivalent',
      detail:
        'The indicator mirrors the last sound and the 079 infrastructure keeps the detailed publication row.',
      data: Object.freeze({
        visuals: visual.visuals.length,
        indicatorKind: indicatorRoot.getAttribute('data-kind') ?? 'none',
        indicatorText: indicatorRoot.getAttribute('data-text') ?? '',
        notificationStatus: pushed.status,
        notificationRows: rows.length,
        notificationKind: rows[0]?.kind ?? 'none',
        notificationSymbol: rows[0]?.symbol ?? 'none',
      }),
    }),
  );
  checks.push(
    check('visual/one-twin-per-sound', 2, visual.visuals.length, 'Both sounds have a visual twin.'),
    check(
      'visual/indicator-kind',
      'PUBLICATION',
      indicatorRoot.getAttribute('data-kind') ?? 'none',
      'The indicator shows the kind of the last sound.',
    ),
    check(
      'visual/indicator-text',
      true,
      (indicatorRoot.getAttribute('data-text') ?? '').includes('Profil publicat'),
      'The indicator shows the text of the publication.',
    ),
    check('visual/notification-accepted', 'ACCEPTED', pushed.status, 'The 079 row is accepted.'),
    check(
      'visual/notification-kind',
      'PUBLISHED',
      rows[0]?.kind ?? 'none',
      'The 079 row is the publication.',
    ),
    check(
      'visual/notification-symbol',
      '★',
      rows[0]?.symbol ?? 'none',
      'The 079 row carries the symbol.',
    ),
  );
  notifications.dispose();
  visual.dispose();

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: AUDIO_FEEDBACK_VERSION,
    contract: Object.freeze({
      limits: Object.freeze({
        version: AUDIO_FEEDBACK_LIMITS.version,
        emittedKeys: AUDIO_FEEDBACK_LIMITS.emittedKeys,
        keyCodeUnits: AUDIO_FEEDBACK_LIMITS.keyCodeUnits,
        idCodeUnits: AUDIO_FEEDBACK_LIMITS.idCodeUnits,
        textCodeUnits: AUDIO_FEEDBACK_LIMITS.textCodeUnits,
        retainedVisuals: AUDIO_FEEDBACK_LIMITS.retainedVisuals,
      }),
      cues: Object.freeze(
        (['takeover-notice', 'profile-notice', 'ui-tick'] as const).map((cueId) =>
          Object.freeze({
            cueId,
            category: AUDIO_CUES[cueId].category,
            usedBy:
              cueId === 'takeover-notice'
                ? 'TAKEOVER'
                : cueId === 'profile-notice'
                  ? 'PUBLICATION'
                  : 'MISSION,LEARNING',
          }),
        ),
      ),
      families: Object.freeze([
        Object.freeze({ kind: 'TAKEOVER', cue: 'takeover-notice', event: '007 MANUAL_START' }),
        Object.freeze({
          kind: 'PUBLICATION',
          cue: 'profile-notice',
          event: '007 PROFILE_ACTIVATE',
        }),
        Object.freeze({ kind: 'MISSION', cue: 'ui-tick', event: '116 mission instance' }),
        Object.freeze({ kind: 'LEARNING', cue: 'ui-tick', event: '079 notification' }),
      ]),
      visual:
        'Every accepted sound has a visual twin: the 149 indicator (one bounded status line) and, ' +
        'for the learning and the publication, the real 079 notification rows.',
    }),
    scenarios: Object.freeze(scenarios),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

export function audioFeedbackReportMarkdown(report: AudioFeedbackReport): string {
  const lines: string[] = [];
  lines.push('# Raport feedback audio 149');
  lines.push('');
  lines.push(`Versiune contract: \`${report.version}\`.`);
  lines.push('');
  lines.push('## Scenarii');
  lines.push('');
  for (const scenario of report.scenarios) {
    lines.push(`### ${scenario.name}`);
    lines.push('');
    lines.push(scenario.detail);
    lines.push('');
    for (const [key, value] of Object.entries(scenario.data)) lines.push(`- ${key}: ${value}`);
    lines.push('');
  }
  lines.push('## Verificări');
  lines.push('');
  lines.push('| Verificare | Așteptat | Obținut | Rezultat |');
  lines.push('| --- | --- | --- | --- |');
  for (const entry of report.checks)
    lines.push(
      `| ${entry.name} | ${entry.expected} | ${entry.actual} | ${entry.pass ? 'PASS' : 'FAIL'} |`,
    );
  lines.push('');
  lines.push(
    `Rezultat: ${report.summary.passed}/${report.summary.checks} verificări, ${
      report.summary.pass ? 'PASS' : 'FAIL'
    }.`,
  );
  lines.push('');
  lines.push('## Contract');
  lines.push('');
  for (const [key, value] of Object.entries(report.contract.limits))
    lines.push(`- ${key}: ${value}`);
  lines.push('');
  for (const family of report.contract.families)
    lines.push(`- ${family.kind}: ${family.cue} <- ${family.event}`);
  lines.push(`- echivalent vizual: ${report.contract.visual}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}
