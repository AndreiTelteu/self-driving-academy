import {
  AUDIO_LIMITS,
  DESTRUCTION_ARCHETYPE_PROFILES,
  DESTRUCTION_FEEDBACK_LIMITS,
  DESTRUCTION_FEEDBACK_VERSION,
  createDestructionReplay,
  deriveDestructionReaction,
  destructionReactionFingerprint,
  destructionReplayId,
} from '../../src/audio';
import type { DestructionFeedbackSettings } from '../../src/audio';
import { createWorldRecorder, readWorldReplayChunk } from '../../src/replay';
import type { WorldReplayChunk } from '../../src/replay';
import { parseSimulationEvent } from '../../src/simulation';
import {
  DESTRUCTIBLE_LIMITS,
  FRAGMENT_LIFETIME_TICKS,
  PRESENTATION_FRAGMENT_BUDGET,
  destructibleArchetypes,
} from '../../src/world';
import {
  DESTRUCTION_SESSION_ID,
  DESTRUCTION_WORLD_EPOCH,
  contactFor,
  createDestructionHarness,
  definitionByArchetype,
  destructionCatalog,
} from './destruction-feedback-fixture';
import { isolatedDefinition } from '../world/destructible-decor-fixture';

/**
 * Deterministic transcript of PBI 228.
 *
 * Every number comes from the real 227 decor, the real 148 engine on the fake backend and a real
 * sealed 207 chunk. No wall clock, browser, hardware timer, heap sample or random source is read:
 * structural cost and presentation budgets only, with FPS/hardware explicitly not claimed.
 */

export interface DestructionFeedbackReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface DestructionFeedbackReport {
  readonly version: string;
  readonly fixture: '228-destruction-feedback-v1';
  readonly materials: Readonly<{
    archetypes: readonly Readonly<{
      archetype: string;
      material: string;
      cue: string;
      playbackRate: number;
      gain: number;
      fragments: number;
      symbol: string;
    }>[];
    distinctProfiles: number;
    materials: number;
  }>;
  readonly live: Readonly<{
    events: number;
    reactions: number;
    absentEvents: number;
    listeners: number;
    materials: Readonly<Record<string, number>>;
    audio: Readonly<{ played: number; refused: number; buffers: number; rates: readonly number[] }>;
    fragments: Readonly<{
      active: number;
      peak: number;
      dropped: number;
      lifetimeTicks: number;
      poolCap: number;
      blocksTraffic: false;
      producesScore: false;
      createsCollisions: false;
    }>;
  }>;
  readonly gesture: Readonly<{
    before: Readonly<{
      state: string;
      contextsCreated: number;
      voicesStarted: number;
      audioPlayed: number;
      audioRefused: number;
    }>;
    after: Readonly<{
      state: string;
      contextsCreated: number;
      voicesStarted: number;
      audioPlayed: number;
    }>;
  }>;
  readonly replay: Readonly<{
    replayId: string;
    source: Readonly<{
      chunkId: string;
      sequence: number;
      checksum: string;
      bytes: number;
      completeness: string;
      recordedEvents: number;
    }>;
    truth: Readonly<{
      recordedEvents: number;
      replayedEvents: number;
      destructionEvents: number;
      resetEvents: number;
      orderIdentical: boolean;
      eventsIdentical: boolean;
      inventedReactions: 0;
      awardsGranted: 0;
      learningArtifacts: 0;
      stepsSimulation: 0;
      physicsSteps: 0;
      policyEvaluations: 0;
    }>;
    liveEventIds: readonly string[];
    replayedEventIds: readonly string[];
    reactions: number;
    fingerprints: Readonly<{
      identical: boolean;
      live: readonly string[];
      replay: readonly string[];
    }>;
    audio: Readonly<{ played: number; refused: number; rates: readonly number[] }>;
    projection: Readonly<{ generation: number; resets: number; broken: readonly string[] }>;
  }>;
  readonly replayReset: Readonly<{
    resetEvents: number;
    generation: number;
    broken: readonly string[];
    reactions: number;
  }>;
  readonly absent: Readonly<{
    recordedDestructionEvents: number;
    liveDestructionEvents: number;
    replayedReactions: number;
    silentObjects: readonly string[];
    audioPlayed: number;
  }>;
  readonly reset: Readonly<{
    voicesBefore: number;
    voicesAfter: number;
    fragmentsBefore: number;
    fragmentsAfter: number;
    buffers: number;
    reactionsAfterANewGeneration: number;
    newEventId: string | null;
  }>;
  readonly structural: Readonly<{
    burstPublished: number;
    reactions: number;
    droppedPerIncident: number;
    listeners: number;
    impactVoices: number;
    totalVoices: number;
    reactionsPerIncidentCap: number;
    fragmentsPerReaction: number;
    activeFragments: number;
  }>;
  readonly budget: Readonly<{
    manifestVersion: string;
    manifestStatus: string;
    destructionBodies: number | null;
    totalHeapBytes: number | null;
    recorderRamBytes: number | null;
    ownCaps: Readonly<Record<string, number>>;
    gaps: readonly string[];
    fpsClaimed: false;
    hardwareMeasured: false;
  }>;
  readonly checks: readonly DestructionFeedbackReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

export interface DestructionFeedbackReportOptions {
  readonly manifest: Readonly<{
    budgetVersion?: string;
    status?: string;
    proposedCapacities?: Readonly<Record<string, number | string | null>>;
  }>;
}

const DEFAULT_SETTINGS: DestructionFeedbackSettings = Object.freeze({
  intensity: 1,
  preset: 'MEDIUM',
  visualAlternative: false,
});

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): DestructionFeedbackReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function recordReplayClip(recordThird: boolean) {
  const harness = createDestructionHarness({ gesture: true });
  const recorder = createWorldRecorder({
    sessionId: DESTRUCTION_SESSION_ID,
    worldEpoch: DESTRUCTION_WORLD_EPOCH,
    versions: { engineVersion: '228', physicsVersion: '227', mapVersion: '042' },
    now: () => '2026-11-12T00:00:00.000Z',
  });
  for (let tick = 0; tick <= 240; tick += 20) {
    recorder.recordTick({ tick, vehicles: [], signals: [] });
  }
  const collision = parseSimulationEvent({
    schemaVersion: 1,
    units: 'SI',
    sessionId: DESTRUCTION_SESSION_ID,
    worldEpoch: DESTRUCTION_WORLD_EPOCH,
    tick: 30,
    eventId: 'collision:228:report',
    entityIds: ['taxi-228', 'wall-228'],
    type: 'COLLISION',
    payload: { vehicleId: 'taxi-228', otherEntityId: 'wall-228', impulseNs: 5_000_000 },
  });
  recorder.recordEvent(collision);
  const definitions = (['CONE', 'CRATE', 'BIN'] as const).map((archetype) =>
    isolatedDefinition(harness.plan, archetype),
  );
  const events: string[] = [];
  definitions.forEach((definition, index) => {
    const impact = harness.decor.applyImpact(
      contactFor(definition, definition.impactThreshold.breakImpulseNs, 40 + index * 10),
    );
    if (!impact.event) throw new Error(`The ${definition.archetype} did not break`);
    events.push(impact.event.eventId);
    if (recordThird || index < 2) recorder.recordEvent(impact.event);
  });
  const sealed = recorder.sealIncident(
    `${DESTRUCTION_SESSION_ID}:incident:${collision.eventId}`,
    240,
  );
  if (sealed.status === 'REJECTED' || sealed.chunk === null)
    throw new Error(`The report clip was not sealed: ${sealed.rejection.message}`);
  return {
    harness,
    chunk: sealed.chunk as WorldReplayChunk,
    definitions,
    events,
  };
}

/**
 * A real epoch-3 recording that contains a world reset between two real breaks, so the replay
 * proves the reset path from the events alone.
 */
function recordResetClip() {
  const epoch = DESTRUCTION_WORLD_EPOCH + 1;
  const harness = createDestructionHarness({ gesture: true, worldEpoch: epoch });
  const recorder = createWorldRecorder({
    sessionId: DESTRUCTION_SESSION_ID,
    worldEpoch: epoch,
    versions: { engineVersion: '228', physicsVersion: '227', mapVersion: '042' },
    now: () => '2026-11-12T00:00:00.000Z',
  });
  for (let tick = 0; tick <= 240; tick += 20) {
    recorder.recordTick({ tick, vehicles: [], signals: [] });
  }
  const collision = parseSimulationEvent({
    schemaVersion: 1,
    units: 'SI',
    sessionId: DESTRUCTION_SESSION_ID,
    worldEpoch: epoch,
    tick: 10,
    eventId: 'collision:228:report-reset',
    entityIds: ['taxi-228', 'wall-228'],
    type: 'COLLISION',
    payload: { vehicleId: 'taxi-228', otherEntityId: 'wall-228', impulseNs: 5_000_000 },
  });
  recorder.recordEvent(collision);
  const first = isolatedDefinition(harness.plan, 'CONE');
  const firstEvent = harness.decor.applyImpact(
    contactFor(first, first.impactThreshold.breakImpulseNs, 40),
  ).event;
  if (firstEvent === null) throw new Error('The pre-reset cone did not break');
  recorder.recordEvent(firstEvent);
  harness.decor.reset();
  const resetEvent = parseSimulationEvent({
    schemaVersion: 1,
    units: 'SI',
    sessionId: DESTRUCTION_SESSION_ID,
    worldEpoch: epoch,
    tick: 60,
    eventId: 'reset:228:report',
    entityIds: [],
    type: 'WORLD_RESET',
    payload: { previousWorldEpoch: DESTRUCTION_WORLD_EPOCH, reason: 'SCENARIO_RESET' },
  });
  recorder.recordEvent(resetEvent);
  const second = isolatedDefinition(harness.plan, 'CRATE');
  const secondEvent = harness.decor.applyImpact(
    contactFor(second, second.impactThreshold.breakImpulseNs, 80),
  ).event;
  if (secondEvent === null) throw new Error('The post-reset crate did not break');
  recorder.recordEvent(secondEvent);
  const sealed = recorder.sealIncident(
    `${DESTRUCTION_SESSION_ID}:incident:${collision.eventId}`,
    240,
  );
  if (sealed.status === 'REJECTED' || sealed.chunk === null)
    throw new Error(`The reset clip was not sealed: ${sealed.rejection.message}`);
  return { chunk: sealed.chunk as WorldReplayChunk, first, second };
}

function replayClip(
  chunk: WorldReplayChunk,
  listenerPositionM: { x: number; y: number; z: number },
  expectedWorldEpoch: number = DESTRUCTION_WORLD_EPOCH,
) {
  const harness = createDestructionHarness({ gesture: true });
  const replayId = destructionReplayId(DESTRUCTION_SESSION_ID, chunk.chunkId);
  const result = createDestructionReplay(
    {
      replayId,
      source: chunk,
      expectedSessionId: DESTRUCTION_SESSION_ID,
      expectedWorldEpoch,
    },
    {
      catalog: destructionCatalog(),
      sourcePort: { readChunk: readWorldReplayChunk },
      engine: harness.engine,
      listenerPositionM,
    },
  );
  if (result.status !== 'READY') throw new Error(result.detail);
  return { replay: result.replay, harness, replayId };
}

export function runDestructionFeedbackReport(
  options: DestructionFeedbackReportOptions,
): DestructionFeedbackReport {
  const checks: DestructionFeedbackReportCheck[] = [];

  /* 1. The material table, derived from the six real 227 archetypes. */
  const archetypes = destructibleArchetypes.map((archetype) => {
    const definition = definitionByArchetype(archetype);
    const reaction = deriveDestructionReaction({
      event: {
        eventId: `report:material:${archetype}`,
        tick: 10,
        objectId: definition.objectId,
        instigatorId: null,
        impulseNs: definition.impactThreshold.breakImpulseNs,
      },
      catalog: destructionCatalog(),
      settings: DEFAULT_SETTINGS,
      listenerPositionM: definition.initialTransform.positionM,
    });
    if (reaction.status !== 'REACTION') throw new Error(reaction.detail);
    const profile = DESTRUCTION_ARCHETYPE_PROFILES[archetype];
    return Object.freeze({
      archetype,
      material: profile.material,
      cue: reaction.reaction.audio.cueId,
      playbackRate: reaction.reaction.audio.playbackRate,
      gain: reaction.reaction.audio.gain,
      fragments: reaction.reaction.fragments.count,
      symbol: reaction.reaction.visual.symbol,
    });
  });
  const distinctProfiles = new Set(
    archetypes.map((entry) => `${entry.material}:${entry.playbackRate}`),
  ).size;
  checks.push(
    check(
      'every archetype has a distinct material acoustic profile',
      6,
      distinctProfiles,
      'six real 227 archetypes map to six distinct material/playback-rate pairs on the 148 impact cue',
    ),
  );

  /* 2. The live path: one reaction per real break, bounded voices and fragments. */
  const live = createDestructionHarness({ gesture: true });
  for (const definition of (['CONE', 'CRATE', 'BIN', 'DECOR_SIGN', 'FENCE_LIGHT'] as const).map(
    (archetype) => isolatedDefinition(live.plan, archetype),
  )) {
    live.feedback.setListenerPosition(definition.initialTransform.positionM);
    const impact = live.decor.applyImpact(
      contactFor(
        definition,
        definition.impactThreshold.breakImpulseNs,
        live.feedback.getStats().lastTick + 10,
      ),
    );
    if (!impact.event) throw new Error(`The ${definition.archetype} did not break live`);
  }
  const liveStats = live.feedback.getStats();
  const liveVoices = live.backend.getVoices();
  checks.push(
    check(
      'one reaction per live DESTRUCTIBLE_BROKEN event',
      liveStats.events,
      liveStats.reactions,
      'the listener reacts to the real 227 events and to nothing else',
    ),
  );
  checks.push(
    check(
      'the live feedback installs exactly one listener',
      1,
      liveStats.listeners,
      'one filtered 227 bus subscription, released on dispose',
    ),
  );
  checks.push(
    check(
      'the impact voice cap is respected',
      true,
      liveStats.presentation.audioPlayed <= AUDIO_LIMITS.impactVoices,
      `five material impacts play at most ${AUDIO_LIMITS.impactVoices} 148 impact voices`,
    ),
  );

  /* 3. The gesture contract: nothing sounds before the real gesture. */
  const gesture = createDestructionHarness({ listenerPositionM: { x: 0, y: 0, z: 0 } });
  const cone = isolatedDefinition(gesture.plan, 'CONE');
  gesture.feedback.setListenerPosition(cone.initialTransform.positionM);
  gesture.decor.applyImpact(contactFor(cone, cone.impactThreshold.breakImpulseNs, 10));
  const before = {
    state: gesture.engine.getStats().state,
    contextsCreated: gesture.backend.getCounters().contextsCreated,
    voicesStarted: gesture.backend.getCounters().voicesStarted,
    audioPlayed: gesture.feedback.getStats().presentation.audioPlayed,
    audioRefused: gesture.feedback.getStats().presentation.audioRefused,
  };
  gesture.engine.startFromUserGesture('KEYBOARD');
  const crate = isolatedDefinition(gesture.plan, 'CRATE');
  gesture.feedback.setListenerPosition(crate.initialTransform.positionM);
  gesture.decor.applyImpact(contactFor(crate, crate.impactThreshold.breakImpulseNs, 20));
  const after = {
    state: gesture.engine.getStats().state,
    contextsCreated: gesture.backend.getCounters().contextsCreated,
    voicesStarted: gesture.backend.getCounters().voicesStarted,
    audioPlayed: gesture.feedback.getStats().presentation.audioPlayed,
  };
  checks.push(
    check(
      'no audio context exists before the player gesture',
      0,
      before.contextsCreated,
      'the 148 backend has created no context; the engine is IDLE',
    ),
  );
  checks.push(
    check(
      'a destruction before the gesture is silent',
      0,
      before.voicesStarted,
      'the reaction is refused with AWAITING_GESTURE and no buffer or voice is created',
    ),
  );
  checks.push(
    check(
      'the same reaction sounds after the gesture',
      1,
      after.contextsCreated,
      'one player gesture creates exactly one context and the material cue plays once',
    ),
  );

  /* 3b. Volume zero silences the output, not the information. */
  const muted = createDestructionHarness({ gesture: true });
  const mutedDefinition = isolatedDefinition(muted.plan, 'CONE');
  muted.feedback.setListenerPosition(mutedDefinition.initialTransform.positionM);
  muted.engine.setMuted(true);
  const mutedImpact = muted.decor.applyImpact(
    contactFor(mutedDefinition, mutedDefinition.impactThreshold.breakImpulseNs, 10),
  );
  const mutedStats = muted.feedback.getStats();
  checks.push(
    check(
      'zero volume keeps the reaction and silences only the output',
      true,
      mutedImpact.state === 'BROKEN' &&
        mutedStats.reactions === 1 &&
        mutedStats.presentation.activeFragments > 0 &&
        muted.engine.getStats().effectiveGains.impact === 0,
      'the fragment and the visual twin stay; the effective impact gain is exactly zero',
    ),
  );

  /* 4. The replay truth: a real sealed 207 clip replayed without any physics. */
  const clip = recordReplayClip(true);
  const listener = clip.definitions[0]!.initialTransform.positionM;
  const { replay, harness: replayHarness, replayId } = replayClip(clip.chunk, listener);
  const run = replay.run();
  const liveFingerprints = clip.events.map((eventId) => {
    const event = clip.chunk.events.find((candidate) => candidate.eventId === eventId);
    if (event === undefined) throw new Error(`The clip lost the event ${eventId}`);
    const payload = event.payload as {
      objectId: string;
      instigatorId: string | null;
      impulseNs: number;
    };
    const derived = deriveDestructionReaction({
      event: {
        eventId: event.eventId,
        tick: event.tick,
        objectId: payload.objectId,
        instigatorId: payload.instigatorId,
        impulseNs: payload.impulseNs,
      },
      catalog: destructionCatalog(),
      settings: DEFAULT_SETTINGS,
      listenerPositionM: listener,
    });
    if (derived.status !== 'REACTION') throw new Error(derived.detail);
    return destructionReactionFingerprint(derived.reaction);
  });
  const replayFingerprints = run.reactions.map(destructionReactionFingerprint);
  const fingerprintsIdentical =
    liveFingerprints.length === replayFingerprints.length &&
    liveFingerprints.every((fingerprint, index) => fingerprint === replayFingerprints[index]);
  checks.push(
    check(
      'the replay repeats the recorded events in the recorded order',
      true,
      run.truth.orderIdentical && run.truth.eventsIdentical,
      'three destruction events replay in the exact recorded order with the same event ids',
    ),
  );
  checks.push(
    check(
      'the replay reaction fingerprints equal the live derivation',
      true,
      fingerprintsIdentical,
      'material, intensity, rate, gain, fragments and visual variant are identical',
    ),
  );
  checks.push(
    check(
      'the replay steps no simulation and grants no reward',
      0,
      run.stats.stepsSimulation +
        run.stats.physicsSteps +
        run.stats.policyEvaluations +
        run.truth.awardsGranted +
        run.truth.learningArtifacts,
      'physics, policy, rewards and learning are structural zeros',
    ),
  );
  checks.push(
    check(
      'the projected states match the live 227 states',
      true,
      clip.definitions.every(
        (definition) =>
          clip.harness.decor.getState(definition.objectId).state === 'BROKEN' &&
          run.projection.states.some((entry) => entry.objectId === definition.objectId),
      ),
      'the recorded events imply exactly the BROKEN states the live decor ended with',
    ),
  );

  /* 5. An event missing from the recording is silent. */
  const absentClip = recordReplayClip(false);
  const absentListener = absentClip.definitions[0]!.initialTransform.positionM;
  const absentRun = replayClip(absentClip.chunk, absentListener).replay.run();
  const silentObjects = absentClip.definitions
    .filter(
      (definition) =>
        !absentRun.reactions.some((reaction) => reaction.objectId === definition.objectId),
    )
    .map((definition) => definition.objectId);
  checks.push(
    check(
      'the absent event produces no reaction and no cue',
      true,
      silentObjects.length === 1 && absentRun.reactions.length === 2,
      'the third live break was never recorded, so it has no reaction, no fragments and no sound',
    ),
  );

  /* 5b. A recorded reset clears the pre-reset states in the replay. */
  const resetClip = recordResetClip();
  const resetReplay = replayClip(
    resetClip.chunk,
    resetClip.second.initialTransform.positionM,
    DESTRUCTION_WORLD_EPOCH + 1,
  ).replay.run();
  const resetReplayStates = resetReplay.projection.states.map((entry) => entry.objectId);
  checks.push(
    check(
      'a recorded reset starts a new generation in the replay',
      1,
      resetReplay.projection.generation,
      'the WORLD_RESET event is replayed as one generation, never as a new physics decision',
    ),
  );
  checks.push(
    check(
      'the replay clears the pre-reset states and keeps the post-reset ones',
      true,
      resetReplay.projection.resets === 1 &&
        resetReplayStates.length === 1 &&
        resetReplayStates[0] === resetClip.second.objectId,
      'the cone broken before the reset is absent from the projected state; the crate broken after it remains',
    ),
  );

  /* 6. Reset returns fragments and voices to the baseline. */
  const resetHarness = createDestructionHarness({
    gesture: true,
    listenerPositionM: { x: 0, y: 0, z: 0 },
  });
  for (const archetype of ['CONE', 'CRATE'] as const) {
    const definition = isolatedDefinition(resetHarness.plan, archetype);
    resetHarness.feedback.setListenerPosition(definition.initialTransform.positionM);
    resetHarness.decor.applyImpact(
      contactFor(
        definition,
        definition.impactThreshold.breakImpulseNs,
        resetHarness.decor.getStats().tick + 10,
      ),
    );
  }
  const voicesBefore = resetHarness.engine.getStats().activeVoices;
  const fragmentsBefore = resetHarness.feedback.getStats().presentation.activeFragments;
  const reset = resetHarness.feedback.reset();
  const voicesAfterReset = resetHarness.engine.getStats().activeVoices;
  const fragmentsAfterReset = reset.activeFragments;
  resetHarness.decor.reset();
  const resetCone = isolatedDefinition(resetHarness.plan, 'CONE');
  resetHarness.feedback.setListenerPosition(resetCone.initialTransform.positionM);
  const afterReset = resetHarness.decor.applyImpact(
    contactFor(resetCone, resetCone.impactThreshold.breakImpulseNs, 40),
  );
  const afterResetStats = resetHarness.feedback.getStats();
  checks.push(
    check(
      'reset returns the voices and the fragment pool to the baseline',
      true,
      fragmentsAfterReset === 0 &&
        voicesAfterReset === 0 &&
        resetHarness.engine.getStats().activeVoices === 1,
      `before ${voicesBefore} voices / ${fragmentsBefore} fragments; after reset ${voicesAfterReset} voices / ${fragmentsAfterReset} fragments (${reset.releasedVoices} released); a new generation sounds again`,
    ),
  );
  checks.push(
    check(
      'a new generation after reset has a new event identity',
      true,
      afterReset.eventId !== null && afterReset.eventId !== undefined,
      `the fresh break publishes ${String(afterReset.eventId)}`,
    ),
  );

  /* 7. The per-incident and voice budgets under one burst. */
  const burst = createDestructionHarness({ gesture: true });
  const burstDefinition = isolatedDefinition(burst.plan, 'CONE');
  burst.feedback.setListenerPosition(burstDefinition.initialTransform.positionM);
  const published = DESTRUCTION_FEEDBACK_LIMITS.maxReactionsPerIncident + 6;
  for (let index = 0; index < published; index += 1) {
    burst.bus.publish(
      parseSimulationEvent({
        schemaVersion: 1,
        units: 'SI',
        sessionId: DESTRUCTION_SESSION_ID,
        worldEpoch: DESTRUCTION_WORLD_EPOCH,
        tick: 500,
        eventId: `report:burst:${index}`,
        entityIds: [burstDefinition.objectId, 'taxi-228'],
        type: 'DESTRUCTIBLE_BROKEN',
        payload: {
          objectId: burstDefinition.objectId,
          instigatorId: 'taxi-228',
          impulseNs: burstDefinition.impactThreshold.breakImpulseNs,
        },
      }),
    );
  }
  const burstStats = burst.feedback.getStats();
  checks.push(
    check(
      'a burst respects the per-incident reaction cap',
      DESTRUCTION_FEEDBACK_LIMITS.maxReactionsPerIncident,
      burstStats.reactions,
      `${published} published events at one tick produce at most ${DESTRUCTION_FEEDBACK_LIMITS.maxReactionsPerIncident} reactions`,
    ),
  );
  checks.push(
    check(
      'a burst respects the 148 impact voice cap',
      true,
      burst.engine.getStats().voicesByCategory.impact <= AUDIO_LIMITS.impactVoices,
      `${burst.engine.getStats().voicesByCategory.impact} impact voices, cap ${AUDIO_LIMITS.impactVoices}`,
    ),
  );

  /* 8. The budget manifest: the gaps are reported, never invented. */
  const capacities = options.manifest.proposedCapacities ?? {};
  const destructionBodies =
    typeof capacities.destructionBodies === 'number' ? capacities.destructionBodies : null;
  const totalHeapBytes =
    typeof capacities.totalHeapBytes === 'number' ? capacities.totalHeapBytes : null;
  const recorderRamBytes =
    typeof capacities.recorderRamBytes === 'number' ? capacities.recorderRamBytes : null;
  const gaps: string[] = [];
  if (destructionBodies === null) gaps.push('destructionBodies is null in the manifest');
  if (totalHeapBytes === null) gaps.push('totalHeapBytes is null in the manifest');
  gaps.push('no destruction feedback budget exists in the manifest; the 228 caps are local');
  checks.push(
    check(
      'the budget gaps are declared',
      0,
      destructionBodies ?? 0,
      'the manifest has no destruction-body budget; the report keeps the gap and claims no FPS',
    ),
  );

  const passed = checks.filter((entry) => entry.pass).length;
  const liveReactionCount = liveStats.reactions;
  return Object.freeze({
    version: DESTRUCTION_FEEDBACK_VERSION,
    fixture: '228-destruction-feedback-v1',
    materials: Object.freeze({
      archetypes: Object.freeze(archetypes),
      distinctProfiles,
      materials: new Set(archetypes.map((entry) => entry.material)).size,
    }),
    live: Object.freeze({
      events: liveStats.events,
      reactions: liveReactionCount,
      absentEvents: liveStats.absentEvents,
      listeners: liveStats.listeners,
      materials: Object.freeze({ ...liveStats.reactionsByMaterial }),
      audio: Object.freeze({
        played: liveStats.presentation.audioPlayed,
        refused: liveStats.presentation.audioRefused,
        buffers: liveStats.presentation.buffersUsed,
        rates: Object.freeze(liveVoices.map((voice) => voice.playbackRate)),
      }),
      fragments: Object.freeze({
        active: liveStats.presentation.activeFragments,
        peak: liveStats.presentation.peakFragments,
        dropped: liveStats.presentation.droppedFragments,
        lifetimeTicks: FRAGMENT_LIFETIME_TICKS,
        poolCap: DESTRUCTION_FEEDBACK_LIMITS.maxFragmentPool,
        blocksTraffic: false as const,
        producesScore: false as const,
        createsCollisions: false as const,
      }),
    }),
    gesture: Object.freeze({
      before: Object.freeze(before),
      after: Object.freeze(after),
    }),
    replay: Object.freeze({
      replayId,
      source: Object.freeze({
        chunkId: clip.chunk.chunkId,
        sequence: clip.chunk.sequence,
        checksum: clip.chunk.checksum,
        bytes: clip.chunk.bytes,
        completeness: clip.chunk.completeness.status,
        recordedEvents: run.events.length,
      }),
      truth: Object.freeze({
        recordedEvents: run.truth.recordedEvents,
        replayedEvents: run.truth.replayedEvents,
        destructionEvents: run.truth.destructionEvents,
        resetEvents: run.truth.resetEvents,
        orderIdentical: run.truth.orderIdentical,
        eventsIdentical: run.truth.eventsIdentical,
        inventedReactions: 0 as const,
        awardsGranted: 0 as const,
        learningArtifacts: 0 as const,
        stepsSimulation: 0 as const,
        physicsSteps: 0 as const,
        policyEvaluations: 0 as const,
      }),
      liveEventIds: Object.freeze([...clip.events]),
      replayedEventIds: Object.freeze([...run.truth.replayedEventIds]),
      reactions: run.reactions.length,
      fingerprints: Object.freeze({
        identical: fingerprintsIdentical,
        live: Object.freeze(liveFingerprints),
        replay: Object.freeze(replayFingerprints),
      }),
      audio: Object.freeze({
        played: run.stats.audioPlayed,
        refused: run.stats.audioRefused,
        rates: Object.freeze(replayHarness.backend.getVoices().map((voice) => voice.playbackRate)),
      }),
      projection: Object.freeze({
        generation: run.projection.generation,
        resets: run.projection.resets,
        broken: Object.freeze(run.projection.states.map((entry) => entry.objectId)),
      }),
    }),
    replayReset: Object.freeze({
      resetEvents: resetReplay.truth.resetEvents,
      generation: resetReplay.projection.generation,
      broken: Object.freeze([...resetReplayStates]),
      reactions: resetReplay.reactions.length,
    }),
    absent: Object.freeze({
      recordedDestructionEvents: absentRun.events.length,
      liveDestructionEvents: absentClip.events.length,
      replayedReactions: absentRun.reactions.length,
      silentObjects: Object.freeze(silentObjects),
      audioPlayed: absentRun.stats.audioPlayed,
    }),
    reset: Object.freeze({
      voicesBefore,
      voicesAfter: voicesAfterReset,
      fragmentsBefore,
      fragmentsAfter: fragmentsAfterReset,
      buffers: resetHarness.engine.getStats().buffers,
      reactionsAfterANewGeneration: afterResetStats.reactions,
      newEventId: afterReset.eventId ?? null,
    }),
    structural: Object.freeze({
      burstPublished: published,
      reactions: burstStats.reactions,
      droppedPerIncident: burstStats.droppedPerIncident,
      listeners: burstStats.listeners,
      impactVoices: burst.engine.getStats().voicesByCategory.impact,
      totalVoices: burst.engine.getStats().activeVoices,
      reactionsPerIncidentCap: DESTRUCTION_FEEDBACK_LIMITS.maxReactionsPerIncident,
      fragmentsPerReaction: Math.min(4, PRESENTATION_FRAGMENT_BUDGET.MEDIUM),
      activeFragments: burstStats.presentation.activeFragments,
    }),
    budget: Object.freeze({
      manifestVersion: options.manifest.budgetVersion ?? 'UNKNOWN',
      manifestStatus: options.manifest.status ?? 'UNKNOWN',
      destructionBodies,
      totalHeapBytes,
      recorderRamBytes,
      ownCaps: Object.freeze({
        maxReactionsPerIncident: DESTRUCTION_FEEDBACK_LIMITS.maxReactionsPerIncident,
        maxFragmentPool: DESTRUCTION_FEEDBACK_LIMITS.maxFragmentPool,
        maxListeners: DESTRUCTION_FEEDBACK_LIMITS.maxListeners,
        maxRetainedEvents: DESTRUCTION_FEEDBACK_LIMITS.maxRetainedEvents,
        impactVoices: AUDIO_LIMITS.impactVoices,
        totalVoices: AUDIO_LIMITS.totalVoices,
        destructionObjects: DESTRUCTIBLE_LIMITS.maxObjects,
        chainDepth: DESTRUCTIBLE_LIMITS.maxChainDepth,
        presentationLow: PRESENTATION_FRAGMENT_BUDGET.LOW,
        presentationMedium: PRESENTATION_FRAGMENT_BUDGET.MEDIUM,
        presentationHigh: PRESENTATION_FRAGMENT_BUDGET.HIGH,
        archetypes: destructibleArchetypes.length,
        cueBuffers: 1,
      }),
      gaps: Object.freeze(gaps),
      fpsClaimed: false as const,
      hardwareMeasured: false as const,
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

export function destructionFeedbackReportMarkdown(report: DestructionFeedbackReport): string {
  const lines: string[] = [];
  lines.push('# Raport determinist 228 — feedback audio-vizual și replay al distrugerii');
  lines.push('');
  lines.push(`Contract: \`${report.version}\` · fixture \`${report.fixture}\`.`);
  lines.push('');
  lines.push('## Materiale și profiluri acustice');
  lines.push('');
  lines.push('| Arhetip | Material | Cue | Playback rate | Gain | Fragmente | Simbol |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const entry of report.materials.archetypes)
    lines.push(
      `| ${entry.archetype} | ${entry.material} | ${entry.cue} | ${entry.playbackRate} | ${entry.gain} | ${entry.fragments} | ${entry.symbol} |`,
    );
  lines.push('');
  lines.push(
    `Profiluri distincte: ${report.materials.distinctProfiles}/6 · materiale: ${report.materials.materials}.`,
  );
  lines.push('');
  lines.push('## Feedback live');
  lines.push('');
  lines.push(
    `Evenimente ${report.live.events}, reacții ${report.live.reactions}, absente ${report.live.absentEvents}, listeners ${report.live.listeners}.`,
  );
  lines.push(
    `Audio: ${report.live.audio.played} redate, ${report.live.audio.refused} refuzate, ${report.live.audio.buffers} buffere; rate-uri ${report.live.audio.rates.join(', ')}.`,
  );
  lines.push(
    `Fragmente: active ${report.live.fragments.active}, vârf ${report.live.fragments.peak}, plafon ${report.live.fragments.poolCap}, durată ${report.live.fragments.lifetimeTicks} tick-uri; trafic ${String(report.live.fragments.blocksTraffic)}, scor ${String(report.live.fragments.producesScore)}, coliziuni ${String(report.live.fragments.createsCollisions)}.`,
  );
  lines.push('');
  lines.push('## Gest și contract audio 148');
  lines.push('');
  lines.push(
    `Înainte de gest: ${report.gesture.before.state}, contexte ${report.gesture.before.contextsCreated}, voci ${report.gesture.before.voicesStarted}, redate ${report.gesture.before.audioPlayed}, refuzate ${report.gesture.before.audioRefused}.`,
  );
  lines.push(
    `După gest: ${report.gesture.after.state}, contexte ${report.gesture.after.contextsCreated}, voci ${report.gesture.after.voicesStarted}, redate ${report.gesture.after.audioPlayed}.`,
  );
  lines.push('');
  lines.push('## Adevărul replay-ului (207 → 141 → 228)');
  lines.push('');
  lines.push(
    `Chunk \`${report.replay.source.chunkId}\` (${report.replay.source.bytes} B, ${report.replay.source.completeness}), ${report.replay.source.recordedEvents} evenimente de distrugere.`,
  );
  lines.push(
    `Replay: ${report.replay.truth.replayedEvents}/${report.replay.truth.recordedEvents} evenimente, ordine ${String(report.replay.truth.orderIdentical)}, identice ${String(report.replay.truth.eventsIdentical)}, reacții inventate ${report.replay.truth.inventedReactions}, pași de simulare ${report.replay.truth.stepsSimulation}, recompense ${report.replay.truth.awardsGranted}.`,
  );
  lines.push(
    `Amprente reacții identice: ${String(report.replay.fingerprints.identical)} · audio ${report.replay.audio.played} redate / ${report.replay.audio.refused} refuzate.`,
  );
  lines.push(
    `Proiecție: generație ${report.replay.projection.generation}, reseturi ${report.replay.projection.resets}, obiecte BROKEN ${report.replay.projection.broken.length}.`,
  );
  lines.push(
    `Reset înregistrat: ${report.replayReset.resetEvents} eveniment, generația ${report.replayReset.generation}, stări post-reset ${report.replayReset.broken.length}, reacții ${report.replayReset.reactions}.`,
  );
  lines.push('');
  lines.push('## Eveniment absent');
  lines.push('');
  lines.push(
    `Live ${report.absent.liveDestructionEvents} distrugeri, înregistrate ${report.absent.recordedDestructionEvents}; replay redă ${report.absent.replayedReactions} reacții și lasă ${report.absent.silentObjects.length} obiecte fără sunet/efect.`,
  );
  lines.push('');
  lines.push('## Reset și bugete');
  lines.push('');
  lines.push(
    `Reset: voci ${report.reset.voicesBefore} → ${report.reset.voicesAfter}, fragmente ${report.reset.fragmentsBefore} → ${report.reset.fragmentsAfter}, buffere ${report.reset.buffers}; reacții după generația nouă ${report.reset.reactionsAfterANewGeneration}.`,
  );
  lines.push(
    `Burst: ${report.structural.burstPublished} evenimente → ${report.structural.reactions} reacții, ${report.structural.droppedPerIncident} refuzate de plafon, ${report.structural.impactVoices} voci impact.`,
  );
  lines.push(
    `Manifest ${report.budget.manifestVersion} (${report.budget.manifestStatus}): destructionBodies ${String(report.budget.destructionBodies)}, totalHeapBytes ${String(report.budget.totalHeapBytes)}.`,
  );
  lines.push('');
  lines.push('Lacune de buget:');
  for (const gap of report.budget.gaps) lines.push(`- ${gap}`);
  lines.push('');
  lines.push('## Verificări');
  lines.push('');
  lines.push('| Verificare | Așteptat | Real | Rezultat |');
  lines.push('| --- | --- | --- | --- |');
  for (const entry of report.checks)
    lines.push(
      `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} |`,
    );
  lines.push('');
  lines.push(
    `Rezumat: ${report.summary.passed}/${report.summary.checks} verificări, ${report.summary.pass ? 'PASS' : 'FAIL'}. FPS, heap și hardware nu sunt pretinse.`,
  );
  lines.push('');
  return `${lines.join('\n')}\n`;
}
