import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DESTRUCTION_ARCHETYPE_PROFILES,
  DESTRUCTION_FEEDBACK_LIMITS,
  DESTRUCTION_MATERIALS,
  createDestructionCatalog,
  createDestructionReplay,
  deriveDestructionReaction,
  destructionReactionFingerprint,
  destructionReplayId,
} from '../../src/audio';
import type {
  DestructionFeedbackSettings,
  DestructionReplay,
  DestructionReplayChunkView,
} from '../../src/audio';
import { ContractValidationError } from '../../src/sessions';
import { parseSimulationEvent } from '../../src/simulation';
import { createWorldRecorder, readWorldReplayChunk } from '../../src/replay';
import type { WorldReplayChunk } from '../../src/replay';
import {
  DESTRUCTIBLE_ARCHETYPES,
  DESTRUCTIBLE_BROKEN_EVENT,
  destructibleArchetypes,
} from '../../src/world';
import type { DestructibleDefinition } from '../../src/world';
import {
  DESTRUCTION_SESSION_ID,
  DESTRUCTION_WORLD_EPOCH,
  contactFor,
  createDestructionHarness,
  definitionByArchetype,
  destructionCatalog,
  listenerAt,
} from './destruction-feedback-fixture';
import { isolatedDefinition } from '../world/destructible-decor-fixture';

function eventFor(definition: DestructibleDefinition, impulseNs: number, tick = 10, id = 'evt') {
  return {
    eventId: id,
    tick,
    objectId: definition.objectId,
    instigatorId: 'taxi-228',
    impulseNs,
  };
}

function settings(patch: Partial<DestructionFeedbackSettings>): DestructionFeedbackSettings {
  return { intensity: 1, preset: 'MEDIUM', visualAlternative: false, ...patch };
}

function expectReady(result: ReturnType<typeof createDestructionReplay>): DestructionReplay {
  if (result.status !== 'READY') throw new Error(result.detail);
  return result.replay;
}

/**
 * Records a real 207 clip around a real collision: the 227 decor publishes the destruction events
 * on the bus and the recorder ingests them, so the replay source is a genuine recording.
 */
function recordClip(options: { readonly recordSecond: boolean }) {
  const harness = createDestructionHarness({
    gesture: true,
    listenerPositionM: { x: 0, y: 0, z: 0 },
  });
  const recorder = createWorldRecorder({
    sessionId: DESTRUCTION_SESSION_ID,
    worldEpoch: DESTRUCTION_WORLD_EPOCH,
    versions: { engineVersion: '228', physicsVersion: '227', mapVersion: '042' },
    now: () => '2026-11-12T00:00:00.000Z',
  });
  for (let tick = 0; tick <= 220; tick += 20) {
    recorder.recordTick({ tick, vehicles: [], signals: [] });
  }
  const collision = parseSimulationEvent({
    schemaVersion: 1,
    units: 'SI',
    sessionId: DESTRUCTION_SESSION_ID,
    worldEpoch: DESTRUCTION_WORLD_EPOCH,
    tick: 30,
    eventId: 'collision:228:recording',
    entityIds: ['taxi-228', 'wall-228'],
    type: 'COLLISION',
    payload: { vehicleId: 'taxi-228', otherEntityId: 'wall-228', impulseNs: 5_000_000 },
  });
  /* The collision is a real 028 event recorded by the 207 recorder; it is not published on the
     decor bus, whose watermark belongs to the 227 state machine. */
  recorder.recordEvent(collision);
  const first = isolatedDefinition(harness.plan, 'CONE');
  const second = isolatedDefinition(harness.plan, 'CRATE');
  const firstImpact = harness.decor.applyImpact(
    contactFor(first, first.impactThreshold.breakImpulseNs, 40),
  );
  const firstEvent = firstImpact.event;
  assert.ok(firstEvent);
  recorder.recordEvent(firstEvent);
  const secondImpact = harness.decor.applyImpact(
    contactFor(second, second.impactThreshold.breakImpulseNs, 60),
  );
  const secondEvent = secondImpact.event;
  assert.ok(secondEvent);
  /* The second break is real; only its recording may be deliberately omitted. */
  if (options.recordSecond) recorder.recordEvent(secondEvent);
  const sealed = recorder.sealIncident(
    `${DESTRUCTION_SESSION_ID}:incident:${collision.eventId}`,
    220,
  );
  assert.notEqual(sealed.status, 'REJECTED');
  assert.ok(sealed.chunk);
  return {
    harness,
    chunk: sealed.chunk as WorldReplayChunk,
    first,
    second,
    firstEvent,
    secondEvent,
  };
}

function replayChunk(
  chunk: unknown,
  options: {
    readonly expectedSessionId?: string;
    readonly listenerPositionM?: { x: number; y: number; z: number } | null;
  } = {},
) {
  const harness = createDestructionHarness({ gesture: true });
  const result = createDestructionReplay(
    {
      replayId: 'replay:228:test',
      source: chunk,
      expectedSessionId: options.expectedSessionId ?? DESTRUCTION_SESSION_ID,
      expectedWorldEpoch: DESTRUCTION_WORLD_EPOCH,
    },
    {
      catalog: destructionCatalog(),
      sourcePort: { readChunk: readWorldReplayChunk },
      engine: harness.engine,
      listenerPositionM: options.listenerPositionM ?? null,
    },
  );
  return { result, harness };
}

test('228 derives the material reaction from the real event and the 227 catalog', () => {
  const catalog = destructionCatalog();
  const identifiers = new Set<string>();
  for (const archetype of destructibleArchetypes) {
    const definition = definitionByArchetype(archetype);
    const event = eventFor(
      definition,
      definition.impactThreshold.breakImpulseNs,
      5,
      `evt:${archetype}`,
    );
    const first = deriveDestructionReaction({ event, catalog, settings: settings({}) });
    const second = deriveDestructionReaction({ event, catalog, settings: settings({}) });
    assert.equal(first.status, 'REACTION');
    assert.equal(second.status, 'REACTION');
    if (first.status !== 'REACTION' || second.status !== 'REACTION') return;
    assert.equal(
      destructionReactionFingerprint(first.reaction),
      destructionReactionFingerprint(second.reaction),
      `${archetype} reaction is not deterministic`,
    );
    const profile = DESTRUCTION_ARCHETYPE_PROFILES[archetype];
    assert.equal(first.reaction.archetype, archetype);
    assert.equal(first.reaction.material, profile.material);
    assert.equal(first.reaction.audio.cueId, 'impact');
    assert.equal(first.reaction.audio.playbackRate, profile.playbackRate);
    assert.deepEqual(first.reaction.positionM, definition.initialTransform.positionM);
    assert.equal(first.reaction.intensity.tier, 'HEAVY');
    assert.equal(first.reaction.intensity.normalized, 1);
    assert.equal(first.reaction.audio.reason, 'NO_LISTENER');
    assert.equal(first.reaction.audio.ready, false);
    assert.equal(first.reaction.fragments.blocksTraffic, false);
    assert.equal(first.reaction.fragments.producesScore, false);
    assert.equal(first.reaction.fragments.createsCollisions, false);
    identifiers.add(`${profile.material}:${profile.playbackRate}`);
  }
  assert.equal(
    identifiers.size,
    destructibleArchetypes.length,
    'every archetype is acoustically distinct',
  );

  const weak = deriveDestructionReaction({
    event: eventFor(definitionByArchetype('CONE'), 1, 5, 'evt:weak'),
    catalog,
    settings: settings({}),
  });
  assert.equal(weak.status, 'REACTION');
  if (weak.status === 'REACTION') {
    assert.equal(weak.reaction.intensity.normalized, 0.027);
    assert.equal(weak.reaction.intensity.tier, 'LIGHT');
  }

  const unknown = deriveDestructionReaction({
    event: {
      eventId: 'evt:unknown',
      tick: 5,
      objectId: 'destructible:not:in:the:catalog',
      instigatorId: null,
      impulseNs: 10,
    },
    catalog,
    settings: settings({}),
  });
  assert.equal(unknown.status, 'ABSENT');
  if (unknown.status === 'ABSENT') assert.equal(unknown.reason, 'UNKNOWN_OBJECT');

  const noCatalog = deriveDestructionReaction({
    event: eventFor(definitionByArchetype('CONE'), 40, 5, 'evt:none'),
    catalog: createDestructionCatalog([]),
    settings: settings({}),
  });
  assert.equal(noCatalog.status, 'ABSENT');
  if (noCatalog.status === 'ABSENT') assert.equal(noCatalog.reason, 'NO_CATALOG');
});

test('228 stays silent before the player gesture and plays the material rate after it', () => {
  const cone = isolatedDefinition(createDestructionHarness().plan, 'CONE');
  const harness = createDestructionHarness({ listenerPositionM: listenerAt(cone) });
  const first = harness.decor.applyImpact(
    contactFor(cone, cone.impactThreshold.breakImpulseNs, 10),
  );
  assert.equal(first.state, 'BROKEN');
  assert.equal(harness.engine.getStats().state, 'IDLE');
  assert.equal(harness.engine.getStats().impactsPlayed, 0);
  assert.equal(harness.backend.getCounters().contextsCreated, 0);
  assert.equal(harness.backend.getCounters().voicesStarted, 0);
  const beforeGesture = harness.feedback.getStats();
  assert.equal(beforeGesture.reactions, 1);
  assert.equal(beforeGesture.presentation.audioPlayed, 0);
  assert.equal(beforeGesture.presentation.audioRefused, 1);

  harness.engine.startFromUserGesture('POINTER');
  const crate = isolatedDefinition(harness.plan, 'CRATE');
  harness.feedback.setListenerPosition(listenerAt(crate));
  const second = harness.decor.applyImpact(
    contactFor(crate, crate.impactThreshold.breakImpulseNs, 20),
  );
  assert.equal(second.state, 'BROKEN');
  assert.equal(harness.backend.getCounters().contextsCreated, 1);
  const voices = harness.backend.getVoices();
  assert.equal(voices.length, 1);
  assert.equal(voices[0]?.cueId, 'impact');
  assert.equal(voices[0]?.playbackRate, DESTRUCTION_ARCHETYPE_PROFILES.CRATE.playbackRate);
  assert.equal(voices[0]?.category, 'impact');
  const afterGesture = harness.feedback.getStats();
  assert.equal(afterGesture.presentation.audioPlayed, 1);
  assert.equal(afterGesture.reactionsByMaterial.WOOD, 1);
  assert.equal(afterGesture.reactionsByMaterial.PLASTIC, 1);
  assert.equal(afterGesture.listeners, 1);
  assert.equal(harness.bus.getStats().listeners, 1);
});

test('228 fragments are a bounded cosmetic pool with lifetime and no gameplay effect', () => {
  const cone = isolatedDefinition(createDestructionHarness().plan, 'CONE');
  const harness = createDestructionHarness({
    gesture: true,
    listenerPositionM: listenerAt(cone),
    fragmentPoolCapacity: 3,
  });
  const targets = (['CONE', 'CRATE', 'BIN'] as const).map((archetype) =>
    isolatedDefinition(harness.plan, archetype),
  );
  for (const [index, definition] of targets.entries()) {
    const result = harness.decor.applyImpact(
      contactFor(definition, definition.impactThreshold.breakImpulseNs, 10 + index),
    );
    assert.equal(result.state, 'BROKEN');
  }
  const stats = harness.feedback.getStats();
  assert.equal(stats.reactions, 3);
  assert.equal(stats.presentation.fragmentPoolCap, 3);
  assert.equal(stats.presentation.activeFragments, 3);
  assert.equal(stats.presentation.peakFragments, 3);
  assert.equal(stats.presentation.droppedFragments, 3);
  assert.equal(stats.presentation.fragmentLifetimeTicks, 120);

  const expired = harness.feedback.advance(200);
  assert.equal(expired, 3);
  assert.equal(harness.feedback.getStats().presentation.activeFragments, 0);
  assert.equal(harness.feedback.getStats().presentation.expiredFragments, 3);
});

test('228 replay repeats the recorded destruction events, states and order', () => {
  const clip = recordClip({ recordSecond: true });
  const { result, harness } = replayChunk(clip.chunk, {
    listenerPositionM: clip.first.initialTransform.positionM,
  });
  const replay = expectReady(result);
  const run = replay.run();
  assert.equal(run.truth.recordedEvents, 2);
  assert.equal(run.truth.destructionEvents, 2);
  assert.equal(run.truth.resetEvents, 0);
  assert.deepEqual(run.truth.replayedEventIds, [
    clip.firstEvent.eventId,
    clip.secondEvent!.eventId,
  ]);
  assert.equal(run.truth.orderIdentical, true);
  assert.equal(run.truth.eventsIdentical, true);
  assert.equal(run.truth.inventedReactions, 0);
  assert.equal(run.truth.awardsGranted, 0);
  assert.equal(run.truth.learningArtifacts, 0);
  assert.equal(run.truth.reDecidedPhysics, false);
  assert.equal(run.stats.stepsSimulation, 0);
  assert.equal(run.stats.physicsSteps, 0);
  assert.equal(run.stats.policyEvaluations, 0);
  assert.equal(run.stats.listeners, 1);

  // The states the recording implies are exactly the live 227 states at the end of the clip.
  const expectedObjects = [clip.first.objectId, clip.second.objectId].sort();
  assert.deepEqual(
    run.projection.states.map((entry) => entry.objectId),
    expectedObjects,
  );
  for (const definition of [clip.first, clip.second]) {
    assert.equal(clip.harness.decor.getState(definition.objectId).state, 'BROKEN');
    assert.equal(
      run.projection.states.find((entry) => entry.objectId === definition.objectId)?.state,
      'BROKEN',
    );
  }

  // The reactions are the same materials and intensities the live path derives from the events.
  assert.equal(run.reactions.length, 2);
  for (const reaction of run.reactions) {
    const event = [clip.firstEvent, clip.secondEvent!].find(
      (candidate) => candidate.eventId === reaction.eventId,
    );
    assert.ok(event);
    const live = deriveDestructionReaction({
      event: {
        eventId: event.eventId,
        tick: event.tick,
        objectId: (event.payload as { objectId: string }).objectId,
        instigatorId: (event.payload as { instigatorId: string | null }).instigatorId,
        impulseNs: (event.payload as { impulseNs: number }).impulseNs,
      },
      catalog: destructionCatalog(),
      settings: settings({}),
      listenerPositionM: clip.first.initialTransform.positionM,
    });
    assert.equal(live.status, 'REACTION');
    if (live.status === 'REACTION')
      assert.equal(
        destructionReactionFingerprint(live.reaction),
        destructionReactionFingerprint(reaction),
      );
  }

  // The real 148 engine received the material playback rates of the replayed events.
  const replayVoices = harness.backend.getVoices();
  assert.ok(replayVoices.length >= 1);
  for (const voice of replayVoices) {
    assert.equal(voice.cueId, 'impact');
    assert.ok([0.7, 1.25].includes(voice.playbackRate));
  }
});

test('228 an event that is absent from the recording produces no reaction and no sound', () => {
  const clip = recordClip({ recordSecond: false });
  const listener = clip.first.initialTransform.positionM;
  const { result, harness } = replayChunk(clip.chunk, { listenerPositionM: listener });
  const replay = expectReady(result);
  const run = replay.run();
  assert.equal(clip.harness.decor.getState(clip.second.objectId).state, 'BROKEN');
  assert.equal(run.truth.recordedEvents, 1);
  assert.equal(run.reactions.length, 1);
  assert.equal(run.reactions[0]?.objectId, clip.first.objectId);
  assert.equal(
    run.reactions.some((reaction) => reaction.objectId === clip.second.objectId),
    false,
    'the live break of the second object was never recorded, so it must stay silent',
  );
  assert.deepEqual(
    run.projection.states.map((entry) => entry.objectId),
    [clip.first.objectId],
  );
  assert.equal(run.stats.audioPlayed, 1);
  assert.equal(run.stats.audioRefused, 0);
  assert.equal(harness.backend.getVoices().length, 1);
});

test('228 a recording without destruction events stays completely silent', () => {
  const harness = createDestructionHarness({ gesture: true });
  const recorder = createWorldRecorder({
    sessionId: DESTRUCTION_SESSION_ID,
    worldEpoch: DESTRUCTION_WORLD_EPOCH,
    versions: { engineVersion: '228', physicsVersion: '227', mapVersion: '042' },
    now: () => '2026-11-12T00:00:00.000Z',
  });
  for (let tick = 0; tick <= 120; tick += 20) {
    recorder.recordTick({ tick, vehicles: [], signals: [] });
  }
  const collision = parseSimulationEvent({
    schemaVersion: 1,
    units: 'SI',
    sessionId: DESTRUCTION_SESSION_ID,
    worldEpoch: DESTRUCTION_WORLD_EPOCH,
    tick: 30,
    eventId: 'collision:228:quiet',
    entityIds: ['taxi-228', 'wall-228'],
    type: 'COLLISION',
    payload: { vehicleId: 'taxi-228', otherEntityId: 'wall-228', impulseNs: 4_000_000 },
  });
  recorder.recordEvent(collision);
  const sealed = recorder.sealIncident(
    `${DESTRUCTION_SESSION_ID}:incident:${collision.eventId}`,
    120,
  );
  assert.ok(sealed.chunk);
  const replay = expectReady(
    createDestructionReplay(
      {
        replayId: 'replay:228:quiet',
        source: sealed.chunk,
        expectedSessionId: DESTRUCTION_SESSION_ID,
        expectedWorldEpoch: DESTRUCTION_WORLD_EPOCH,
      },
      {
        catalog: destructionCatalog(),
        sourcePort: { readChunk: readWorldReplayChunk },
        engine: harness.engine,
        listenerPositionM: { x: 0, y: 0, z: 0 },
      },
    ),
  );
  const run = replay.run();
  assert.equal(run.events.length, 0);
  assert.equal(run.reactions.length, 0);
  assert.equal(run.absent.length, 0);
  assert.equal(run.truth.inventedReactions, 0);
  assert.equal(harness.backend.getVoices().length, 0);
  assert.equal(harness.backend.getCounters().voicesStarted, 0);
});

test('228 replay refuses a foreign, a tampered and an unordered recording', () => {
  const clip = recordClip({ recordSecond: true });
  const foreign = replayChunk(clip.chunk, { expectedSessionId: 'session-foreign' }).result;
  assert.equal(foreign.status, 'REFUSED');
  if (foreign.status === 'REFUSED') assert.equal(foreign.codes[0], 'FOREIGN_SOURCE');

  const tampered = {
    ...clip.chunk,
    events: [...clip.chunk.events, { ...clip.chunk.events[1]! }],
  };
  const tamperedResult = replayChunk(tampered).result;
  assert.equal(tamperedResult.status, 'REFUSED');
  if (tamperedResult.status === 'REFUSED')
    assert.ok(['CHECKSUM_MISMATCH', 'INVALID_SOURCE'].includes(tamperedResult.codes[0]!));

  const view = clip.chunk as unknown as DestructionReplayChunkView;
  const unordered = createDestructionReplay(
    {
      replayId: 'replay:228:unordered',
      source: 'unordered',
      expectedSessionId: DESTRUCTION_SESSION_ID,
      expectedWorldEpoch: DESTRUCTION_WORLD_EPOCH,
    },
    {
      catalog: destructionCatalog(),
      sourcePort: {
        readChunk: () => ({
          status: 'ACCEPTED',
          chunk: { ...view, events: [...view.events].reverse() },
          checksum: view.checksum,
          bytes: view.bytes,
        }),
      },
    },
  );
  assert.equal(unordered.status, 'REFUSED');
  if (unordered.status === 'REFUSED')
    assert.ok(['EVENT_ORDER', 'INVALID_SOURCE'].includes(unordered.codes[0]!));

  const refusedSource = replayChunk({ broken: true }).result;
  assert.equal(refusedSource.status, 'REFUSED');
  if (refusedSource.status === 'REFUSED') assert.equal(refusedSource.codes[0], 'INVALID_SOURCE');
});

test('228 presentation settings change the reaction, never the event or the state', () => {
  const cone = definitionByArchetype('CONE');
  const event = eventFor(cone, cone.impactThreshold.breakImpulseNs, 7, 'evt:presentation');
  const low = deriveDestructionReaction({
    event,
    catalog: destructionCatalog(),
    settings: settings({ preset: 'LOW', intensity: 0.2 }),
  });
  const high = deriveDestructionReaction({
    event,
    catalog: destructionCatalog(),
    settings: settings({ preset: 'HIGH', intensity: 1 }),
  });
  const alternative = deriveDestructionReaction({
    event,
    catalog: destructionCatalog(),
    settings: settings({ visualAlternative: true }),
  });
  assert.equal(low.status, 'REACTION');
  assert.equal(high.status, 'REACTION');
  assert.equal(alternative.status, 'REACTION');
  if (low.status !== 'REACTION' || high.status !== 'REACTION' || alternative.status !== 'REACTION')
    return;
  assert.equal(low.reaction.eventId, high.reaction.eventId);
  assert.equal(low.reaction.objectId, high.reaction.objectId);
  assert.equal(low.reaction.archetype, high.reaction.archetype);
  assert.equal(low.reaction.material, high.reaction.material);
  assert.ok(low.reaction.audio.gain < high.reaction.audio.gain);
  assert.ok(low.reaction.fragments.count <= high.reaction.fragments.count);
  assert.equal(alternative.reaction.visual.variant, 'SHOCK_RING');
  assert.equal(alternative.reaction.fragments.count, 0);
  assert.ok(alternative.reaction.visual.attributes.some(([key]) => key === 'data-variant'));

  const harness = createDestructionHarness({ gesture: true, settings: { preset: 'LOW' } });
  const isolated = isolatedDefinition(harness.plan, 'CONE');
  const broken = harness.decor.applyImpact(
    contactFor(isolated, isolated.impactThreshold.breakImpulseNs, 12),
  );
  assert.equal(broken.state, 'BROKEN');
  harness.feedback.setSettings({ preset: 'HIGH', visualAlternative: true });
  assert.equal(harness.feedback.getStats().settings.visualAlternative, true);
  assert.equal(harness.feedback.getStats().reactions, 1);
});

test('228 reset returns the cosmetic pools and the voices to the baseline', () => {
  const cone = isolatedDefinition(createDestructionHarness().plan, 'CONE');
  const crate = isolatedDefinition(createDestructionHarness().plan, 'CRATE');
  const harness = createDestructionHarness({ gesture: true, listenerPositionM: listenerAt(cone) });
  harness.decor.applyImpact(contactFor(cone, cone.impactThreshold.breakImpulseNs, 10));
  harness.feedback.setListenerPosition(listenerAt(crate));
  harness.decor.applyImpact(contactFor(crate, crate.impactThreshold.breakImpulseNs, 20));
  assert.equal(harness.engine.getStats().activeVoices, 2);
  assert.ok(harness.feedback.getStats().presentation.activeFragments > 0);

  const reset = harness.feedback.reset();
  assert.equal(reset.activeFragments, 0);
  assert.equal(reset.releasedVoices, 2);
  assert.equal(harness.feedback.getStats().presentation.activeFragments, 0);
  assert.equal(harness.engine.getStats().activeVoices, 0);
  assert.ok(harness.backend.getVoices().every((voice) => voice.stopped));
  // The impact buffer is cached by the 148 engine; it is not a leaked voice.
  assert.equal(harness.engine.getStats().buffers, 1);

  harness.decor.reset();
  const again = isolatedDefinition(harness.plan, 'CONE');
  harness.feedback.setListenerPosition(listenerAt(again));
  const broken = harness.decor.applyImpact(
    contactFor(again, again.impactThreshold.breakImpulseNs, 30),
  );
  assert.equal(broken.state, 'BROKEN');
  assert.ok(broken.eventId);
  const stats = harness.feedback.getStats();
  assert.equal(stats.reactions, 3);
  assert.equal(harness.engine.getStats().activeVoices, 1);
});

test('228 replay reproduces a recorded reset as a new generation', () => {
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
    eventId: 'collision:228:reset',
    entityIds: ['taxi-228', 'wall-228'],
    type: 'COLLISION',
    payload: { vehicleId: 'taxi-228', otherEntityId: 'wall-228', impulseNs: 5_000_000 },
  });
  recorder.recordEvent(collision);
  const first = isolatedDefinition(harness.plan, 'CONE');
  const firstEvent = harness.decor.applyImpact(
    contactFor(first, first.impactThreshold.breakImpulseNs, 40),
  ).event;
  assert.ok(firstEvent);
  recorder.recordEvent(firstEvent);
  harness.decor.reset();
  const resetEvent = parseSimulationEvent({
    schemaVersion: 1,
    units: 'SI',
    sessionId: DESTRUCTION_SESSION_ID,
    worldEpoch: epoch,
    tick: 60,
    eventId: 'reset:228:recording',
    entityIds: [],
    type: 'WORLD_RESET',
    payload: { previousWorldEpoch: DESTRUCTION_WORLD_EPOCH, reason: 'SCENARIO_RESET' },
  });
  recorder.recordEvent(resetEvent);
  const second = isolatedDefinition(harness.plan, 'CRATE');
  const secondEvent = harness.decor.applyImpact(
    contactFor(second, second.impactThreshold.breakImpulseNs, 80),
  ).event;
  assert.ok(secondEvent);
  recorder.recordEvent(secondEvent);
  const sealed = recorder.sealIncident(
    `${DESTRUCTION_SESSION_ID}:incident:${collision.eventId}`,
    240,
  );
  assert.ok(sealed.chunk);
  const replay = expectReady(
    createDestructionReplay(
      {
        replayId: 'replay:228:reset',
        source: sealed.chunk,
        expectedSessionId: DESTRUCTION_SESSION_ID,
        expectedWorldEpoch: epoch,
      },
      {
        catalog: destructionCatalog(),
        sourcePort: { readChunk: readWorldReplayChunk },
        engine: harness.engine,
      },
    ),
  );
  const run = replay.run();
  assert.deepEqual(run.truth.replayedEventIds, [
    firstEvent.eventId,
    resetEvent.eventId,
    secondEvent.eventId,
  ]);
  assert.equal(run.truth.resetEvents, 1);
  assert.equal(run.projection.generation, 1);
  assert.equal(run.projection.resets, 1);
  assert.deepEqual(
    run.projection.states.map((entry) => entry.objectId),
    [second.objectId],
    'the pre-reset break is cleared and only the post-reset break remains',
  );
  assert.equal(run.reactions.length, 2);
  assert.equal(run.truth.awardsGranted, 0);
});

test('228 muting silences the output without touching reactions or fragments', () => {
  const cone = isolatedDefinition(createDestructionHarness().plan, 'CONE');
  const harness = createDestructionHarness({ gesture: true, listenerPositionM: listenerAt(cone) });
  harness.engine.setMuted(true);
  const impact = harness.decor.applyImpact(
    contactFor(cone, cone.impactThreshold.breakImpulseNs, 10),
  );
  assert.equal(impact.state, 'BROKEN');
  const stats = harness.feedback.getStats();
  assert.equal(stats.reactions, 1);
  assert.ok(stats.presentation.activeFragments > 0);
  assert.equal(harness.engine.getStats().effectiveGains.impact, 0);
  assert.equal(harness.engine.getStats().activeVoices, 1);
});

test('228 incremental replay produces the same reactions as the full run', () => {
  const clip = recordClip({ recordSecond: true });
  const { result } = replayChunk(clip.chunk, {
    listenerPositionM: clip.first.initialTransform.positionM,
  });
  const replay = expectReady(result);
  const incremental: string[] = [];
  for (let step = 0; step < 2; step += 1) {
    const next = replay.playNext();
    assert.equal(next.status, 'ADVANCED');
    assert.equal(next.entry?.status, 'REACTION');
    if (next.entry?.status === 'REACTION')
      incremental.push(destructionReactionFingerprint(next.entry.reaction));
    assert.ok(next.applied?.reactionId);
  }
  assert.equal(replay.playNext().status, 'AT_END');
  const incrementalStats = replay.stats();
  assert.equal(incrementalStats.reactions, 2);
  assert.equal(incrementalStats.position, 2);
  const full = replay.run();
  assert.deepEqual(
    full.reactions.map(destructionReactionFingerprint),
    incremental,
    'stepping and a full run replay the same recorded reactions in the same order',
  );
});

test('228 refuses invalid inputs instead of inventing feedback', () => {
  assert.throws(
    () => createDestructionCatalog([definitionByArchetype('CONE'), definitionByArchetype('CONE')]),
    ContractValidationError,
  );
  assert.throws(
    () =>
      deriveDestructionReaction({
        event: eventFor(definitionByArchetype('CONE'), -1, 3, 'evt:negative'),
        catalog: destructionCatalog(),
      }),
    ContractValidationError,
  );
  assert.throws(
    () =>
      deriveDestructionReaction({
        event: eventFor(definitionByArchetype('CONE'), 40, 3, 'evt:intensity'),
        catalog: destructionCatalog(),
        settings: { intensity: 2 },
      }),
    ContractValidationError,
  );
  assert.throws(
    () =>
      deriveDestructionReaction({
        event: eventFor(definitionByArchetype('CONE'), 40, 3, 'evt:boolean'),
        catalog: destructionCatalog(),
        settings: { visualAlternative: 'yes' as unknown as boolean },
      }),
    ContractValidationError,
  );
  const harness = createDestructionHarness();
  assert.throws(
    () =>
      harness.engine.playDestructionImpact({
        ownerId: 'destruction:rate',
        impulseNs: 40,
        distanceM: 1,
        playbackRate: 0,
        gain: 1,
      }),
    ContractValidationError,
  );
  assert.equal(harness.backend.getCounters().contextsCreated, 0);
  assert.ok(DESTRUCTION_FEEDBACK_LIMITS.maxFragmentPool <= 192);
  assert.equal(DESTRUCTION_MATERIALS.length, 4);
  assert.equal(new Set(destructibleArchetypes).size, 6);
  assert.equal(DESTRUCTIBLE_ARCHETYPES.CONE.fragmentCount, 3);
  assert.equal(DESTRUCTIBLE_BROKEN_EVENT, 'DESTRUCTIBLE_BROKEN');
  assert.equal(
    destructionReplayId(DESTRUCTION_SESSION_ID, 'chunk:1'),
    destructionReplayId(DESTRUCTION_SESSION_ID, 'chunk:1'),
  );
  assert.notEqual(
    destructionReplayId(DESTRUCTION_SESSION_ID, 'chunk:1'),
    destructionReplayId(DESTRUCTION_SESSION_ID, 'chunk:2'),
  );
});
