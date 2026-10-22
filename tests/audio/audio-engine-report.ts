import {
  AUDIO_CUES,
  AUDIO_LIMITS,
  attachCollisionAudio,
  createAudioEngine,
  createFakeAudioBackend,
} from '../../src/audio';
import type { FakeAudioBackend, VehicleAudioSample } from '../../src/audio';
import { createEventBus } from '../../src/simulation';

export interface AudioReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface AudioReportScenario {
  readonly name: string;
  readonly detail: string;
  readonly data: Readonly<Record<string, string | number | boolean>>;
}

export interface AudioEngineReport {
  readonly version: string;
  readonly contract: Readonly<{
    readonly limits: Readonly<Record<string, number | string>>;
    readonly categories: readonly string[];
    readonly cues: readonly Readonly<{ cueId: string; category: string; loop: boolean }>[];
    readonly placeholderAssets: string;
  }>;
  readonly scenarios: readonly AudioReportScenario[];
  readonly checks: readonly AudioReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function sample(entityId: string, over: Partial<VehicleAudioSample> = {}): VehicleAudioSample {
  return {
    entityId,
    speedMps: 10,
    loadFactor: 0.8,
    brakeFactor: 0,
    slipFactor: 0,
    distanceM: 5,
    ...over,
  };
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): AudioReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function publishCollision(
  bus: ReturnType<typeof createEventBus>,
  eventId: string,
  tick: number,
  impulseNs = 4_000_000,
): void {
  bus.publish({
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'audio-report',
    worldEpoch: 1,
    eventId,
    tick,
    entityIds: ['taxi-1', 'wall-1'],
    type: 'COLLISION',
    payload: { vehicleId: 'taxi-1', otherEntityId: 'wall-1', impulseNs },
  });
}

export function runAudioEngineReport(): AudioEngineReport {
  const scenarios: AudioReportScenario[] = [];
  const checks: AudioReportCheck[] = [];

  // 1. The audio graph starts only from a player gesture.
  const gestureBackend = createFakeAudioBackend();
  const gestureEngine = createAudioEngine({ backend: gestureBackend });
  const beforeGesture = gestureEngine.updateVehicle(sample('taxi-1'));
  const refusedImpact = gestureEngine.handleImpact({
    eventId: 'collision-refused',
    tick: 0,
    vehicleId: 'taxi-1',
    otherEntityId: 'wall-1',
    impulseNs: 4_000_000,
    distanceM: 3,
  });
  const gestureStats = gestureEngine.getStats();
  const contextsBeforeGesture = gestureBackend.getCounters().contextsCreated;
  gestureEngine.startFromUserGesture('POINTER');
  const afterGesture = gestureEngine.updateVehicle(sample('taxi-1'));
  scenarios.push(
    Object.freeze({
      name: 'gesture-start',
      detail:
        'Before the gesture the engine is IDLE and refuses the cues; the gesture creates the context.',
      data: Object.freeze({
        stateBeforeGesture: gestureStats.state,
        contextsBeforeGesture,
        cueBeforeGesture: beforeGesture.voice,
        impactBeforeGesture: refusedImpact.reason,
        stateAfterGesture: gestureEngine.getStats().state,
        contextsAfterGesture: gestureBackend.getCounters().contextsCreated,
        cueAfterGesture: afterGesture.voice,
      }),
    }),
  );
  checks.push(
    check('gesture/state-before', 'IDLE', gestureStats.state, 'The engine waits for the gesture.'),
    check(
      'gesture/contexts-before',
      0,
      contextsBeforeGesture,
      'No audio context exists before the gesture.',
    ),
    check(
      'gesture/impact-refused',
      'AWAITING_GESTURE',
      refusedImpact.reason,
      'A collision before the gesture is refused, not played in the background.',
    ),
    check(
      'gesture/contexts-after',
      1,
      gestureBackend.getCounters().contextsCreated,
      'The gesture creates exactly one audio context.',
    ),
    check(
      'gesture/cue-after',
      'ALLOCATED',
      afterGesture.voice,
      'The first vehicle allocates its engine voice after the gesture.',
    ),
  );
  gestureEngine.dispose();

  // 2. The mute switch silences the output only.
  const muteBackend = createFakeAudioBackend();
  const muteEngine = createAudioEngine({ backend: muteBackend });
  muteEngine.startFromUserGesture('KEYBOARD');
  muteEngine.updateVehicle(sample('taxi-1'));
  const muteBus = createEventBus({ sessionId: 'audio-report', worldEpoch: 1 });
  const delivered: string[] = [];
  muteBus.subscribe((event) => {
    delivered.push(event.type);
  });
  const muteBridge = attachCollisionAudio({ engine: muteEngine, eventBus: muteBus });
  publishCollision(muteBus, 'collision-1', 1);
  const unmuted = muteEngine.getStats();
  muteEngine.setMuted(true);
  const muted = muteEngine.getStats();
  publishCollision(muteBus, 'collision-2', 2);
  muteEngine.updateVehicle(sample('taxi-1', { distanceM: 6 }));
  const mutedAfter = muteEngine.getStats();
  scenarios.push(
    Object.freeze({
      name: 'mute-isolation',
      detail:
        'Mute sets the master gain to zero; the events, the ticks and the voice work continue.',
      data: Object.freeze({
        eventsDelivered: delivered.length,
        impactsUnmuted: unmuted.impactsPlayed,
        impactsMuted: mutedAfter.impactsPlayed,
        masterGainMuted: muted.masterGain,
        effectiveEngineGainMuted: muted.effectiveGains.engine,
        categoryEngineGainUnchanged: muted.categoryGains.engine === unmuted.categoryGains.engine,
        voicesStillActive: mutedAfter.activeVoices,
        gainUpdates: mutedAfter.gainUpdates,
      }),
    }),
  );
  checks.push(
    check(
      'mute/effective-gain-zero',
      0,
      muted.effectiveGains.engine,
      'Mute zeroes the output gain.',
    ),
    check(
      'mute/category-gain-untouched',
      true,
      muted.categoryGains.engine === unmuted.categoryGains.engine,
      'Mute does not rewrite the mixer levels.',
    ),
    check(
      'mute/events-still-delivered',
      2,
      delivered.length,
      'The simulation events keep flowing while the audio is muted.',
    ),
    check(
      'mute/impact-still-processed',
      2,
      mutedAfter.impactsPlayed,
      'The muted engine still processes the impacts.',
    ),
    check(
      'mute/voices-still-active',
      true,
      mutedAfter.activeVoices > 0,
      'The voices are kept alive; only the output gain is zero.',
    ),
  );
  muteBridge.dispose();
  muteEngine.dispose();

  // 3. The collision events of 028 drive the impact bus.
  const impactBackend = createFakeAudioBackend();
  const impactEngine = createAudioEngine({ backend: impactBackend });
  const impactBus = createEventBus({ sessionId: 'audio-report', worldEpoch: 1 });
  const impactBridge = attachCollisionAudio({
    engine: impactEngine,
    eventBus: impactBus,
    distanceM: () => 4,
  });
  impactEngine.startFromUserGesture('POINTER');
  publishCollision(impactBus, 'collision-impact', 3);
  const impactStats = impactEngine.getStats();
  const impactVoices = impactBackend.getVoices();
  scenarios.push(
    Object.freeze({
      name: 'impact-028',
      detail: 'A COLLISION event of the 028 adapter becomes an impact cue on the impact bus.',
      data: Object.freeze({
        handled: impactBridge.handled,
        impactsPlayed: impactStats.impactsPlayed,
        impactVoices: impactStats.voicesByCategory.impact,
        engineVoices: impactStats.voicesByCategory.engine,
        cue: impactVoices[0]?.cueId ?? 'none',
        owner: impactVoices[0]?.ownerId ?? 'none',
      }),
    }),
  );
  checks.push(
    check('impact/handled', 1, impactBridge.handled, 'The bridge consumed the collision event.'),
    check('impact/voices', 1, impactStats.voicesByCategory.impact, 'The impact bus owns the cue.'),
    check(
      'impact/engine-bus-untouched',
      0,
      impactStats.voicesByCategory.engine,
      'The engine bus is not used.',
    ),
    check('impact/cue', 'impact', impactVoices[0]?.cueId ?? 'none', 'The impact cue was played.'),
  );
  impactBridge.dispose();
  impactEngine.dispose();

  // 4. The voice pool is capped and the stealing is deterministic.
  const capBackend = createFakeAudioBackend();
  const capEngine = createAudioEngine({
    backend: capBackend,
    limits: { ...AUDIO_LIMITS, engineVoices: 2, maxAudibleVehicles: 4 },
  });
  capEngine.startFromUserGesture('POINTER');
  capEngine.updateVehicle(sample('distant', { distanceM: 10 }));
  capEngine.updateVehicle(sample('near', { distanceM: 2 }));
  capEngine.updateVehicle(sample('middle', { distanceM: 6 }));
  capEngine.updateVehicle(sample('quiet', { distanceM: 8 }));
  const capStats = capEngine.getStats();
  const capOwners = capBackend
    .getVoices()
    .filter((voice) => !voice.stopped)
    .map((voice) => voice.ownerId)
    .sort();
  scenarios.push(
    Object.freeze({
      name: 'voice-cap',
      detail: 'The category cap bounds the pool; a louder vehicle steals a quieter slot.',
      data: Object.freeze({
        engineVoiceCap: 2,
        activeVoices: capStats.activeVoices,
        stolenVoices: capStats.stolenVoices,
        droppedCues: capStats.droppedCues,
        owners: capOwners.join(','),
        totalVoiceCap: AUDIO_LIMITS.totalVoices,
      }),
    }),
  );
  checks.push(
    check('cap/active-voices', 2, capStats.activeVoices, 'The pool respects the category cap.'),
    check('cap/stolen', 1, capStats.stolenVoices, 'The louder vehicle stole the quieter slot.'),
    check('cap/dropped', 1, capStats.droppedCues, 'The quietest cue was dropped instead.'),
    check(
      'cap/owners',
      'middle,near',
      capOwners.join(','),
      'The stolen voice released its ownership.',
    ),
  );
  capEngine.dispose();

  // 5. The inaudible vehicles never reach the pool.
  const inaudibleBackend = createFakeAudioBackend();
  const inaudibleEngine = createAudioEngine({ backend: inaudibleBackend });
  inaudibleEngine.startFromUserGesture('POINTER');
  for (let index = 0; index < 30; index += 1) {
    inaudibleEngine.updateVehicle(sample(`far-${index}`, { distanceM: 90, speedMps: 3 }));
  }
  const inaudibleStats = inaudibleEngine.getStats();
  const startsBefore = inaudibleBackend.getCounters().voicesStarted;
  inaudibleEngine.updateVehicle(sample('close', { distanceM: 3, speedMps: 12 }));
  const startsAfter = inaudibleBackend.getCounters().voicesStarted;
  scenarios.push(
    Object.freeze({
      name: 'inaudible-vs-audible',
      detail:
        'Thirty vehicles out of reach allocate no voice; one close vehicle allocates exactly one.',
      data: Object.freeze({
        vehicleUpdates: inaudibleStats.vehicleUpdates,
        audibleUpdates: inaudibleStats.audibleUpdates,
        inaudibleUpdates: inaudibleStats.inaudibleUpdates,
        voicesForInaudibleFleet: startsBefore,
        voicesAfterAudibleVehicle: startsAfter - startsBefore,
        buffers: inaudibleStats.buffers,
        bufferBytes: inaudibleStats.bufferBytes,
      }),
    }),
  );
  checks.push(
    check('inaudible/no-voice', 0, startsBefore, 'The out of reach fleet starts no voice.'),
    check(
      'inaudible/one-voice',
      1,
      startsAfter - startsBefore,
      'The close vehicle starts exactly one voice.',
    ),
    check(
      'inaudible/buffer-lazy',
      0,
      inaudibleStats.buffers,
      'No audio buffer is created for an inaudible fleet.',
    ),
    check(
      'inaudible/buffer-cap',
      true,
      inaudibleStats.bufferBytes <= AUDIO_LIMITS.maxBufferBytes,
      'The owned buffer bytes stay under the explicit cap.',
    ),
  );
  inaudibleEngine.dispose();

  // 6. The disposal releases the voices, the ownership and the context.
  const disposeBackend = createFakeAudioBackend();
  const disposeEngine = createAudioEngine({ backend: disposeBackend });
  disposeEngine.startFromUserGesture('TOUCH');
  disposeEngine.updateVehicle(sample('taxi-1'));
  disposeEngine.updateVehicle(sample('taxi-2', { distanceM: 7 }));
  const released = disposeEngine.releaseVehicle('taxi-1');
  disposeEngine.dispose();
  disposeEngine.dispose();
  const disposeStats = disposeEngine.getStats();
  scenarios.push(
    Object.freeze({
      name: 'disposal',
      detail: 'The disposal releases every voice, the ownership and the audio context, once.',
      data: Object.freeze({
        releasedByOwnership: released,
        state: disposeStats.state,
        activeVoices: disposeStats.activeVoices,
        audibleVehicles: disposeStats.audibleVehicles,
        backendState: disposeBackend.state,
        stoppedVoices: disposeBackend.getVoices().filter((voice) => voice.stopped).length,
      }),
    }),
  );
  checks.push(
    check('disposal/released', 1, released, 'The ownership release frees one voice.'),
    check('disposal/state', 'CLOSED', disposeStats.state, 'The engine is closed.'),
    check('disposal/voices', 0, disposeStats.activeVoices, 'No voice survives the disposal.'),
    check('disposal/context', 'closed', disposeBackend.state, 'The audio context is closed.'),
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: '148-audio-v1',
    contract: Object.freeze({
      limits: Object.freeze({
        version: AUDIO_LIMITS.version,
        engineVoices: AUDIO_LIMITS.engineVoices,
        impactVoices: AUDIO_LIMITS.impactVoices,
        uiVoices: AUDIO_LIMITS.uiVoices,
        totalVoices: AUDIO_LIMITS.totalVoices,
        maxAudibleVehicles: AUDIO_LIMITS.maxAudibleVehicles,
        audibleGainThreshold: AUDIO_LIMITS.audibleGainThreshold,
        audibleDistanceM: AUDIO_LIMITS.audibleDistanceM,
        maxBuffers: AUDIO_LIMITS.maxBuffers,
        maxBufferBytes: AUDIO_LIMITS.maxBufferBytes,
        oneShotCooldownS: AUDIO_LIMITS.oneShotCooldownS,
      }),
      categories: Object.freeze(['engine', 'impact', 'ui']),
      cues: Object.freeze(
        Object.values(AUDIO_CUES).map((cue) =>
          Object.freeze({ cueId: cue.cueId, category: cue.category, loop: cue.loop }),
        ),
      ),
      placeholderAssets:
        'The cue buffers are procedural placeholders generated by a deterministic synthesiser; ' +
        'they are not the final recorded assets of module 16.',
    }),
    scenarios: Object.freeze(scenarios),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

export function audioEngineReportMarkdown(report: AudioEngineReport): string {
  const lines: string[] = [];
  lines.push('# Raport motor audio 148');
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
  lines.push(`- categorii: ${report.contract.categories.join(', ')}`);
  lines.push(`- cue-uri: ${report.contract.cues.map((cue) => cue.cueId).join(', ')}`);
  lines.push(`- asseturi: ${report.contract.placeholderAssets}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export type { FakeAudioBackend };
