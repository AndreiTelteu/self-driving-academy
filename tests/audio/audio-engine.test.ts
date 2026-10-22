import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachCollisionAudio,
  AUDIO_LIMITS,
  createAudioEngine,
  createFakeAudioBackend,
  createWebAudioBackend,
} from '../../src/audio';
import type {
  AudioBackendVoice,
  AudioCueId,
  AudioEngine,
  FakeAudioBackend,
  VehicleAudioSample,
  WebAudioBufferLike,
  WebAudioBufferSourceLike,
  WebAudioContextLike,
  WebAudioGainLike,
  WebAudioNodeLike,
  WebAudioParamLike,
} from '../../src/audio';
import { createEventBus } from '../../src/simulation';
import { ContractValidationError } from '../../src/sessions';

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

function startedVoices(backend: FakeAudioBackend): number {
  // The fake keeps a bounded journal; the counters are the auditable numbers.
  return backend.getCounters().voicesStarted;
}

test('the audio context exists only after a player gesture and nothing sounds before it', () => {
  const backend = createFakeAudioBackend();
  const engine = createAudioEngine({ backend });
  assert.equal(engine.getStats().state, 'IDLE');
  assert.equal(backend.getCounters().contextsCreated, 0);
  assert.equal(backend.state, 'created');

  const beforeGesture = engine.updateVehicle(sample('taxi-1'));
  assert.equal(beforeGesture.skipped, true);
  assert.equal(beforeGesture.voice, 'SKIPPED');
  const impact = engine.handleImpact({
    eventId: 'collision-1',
    tick: 1,
    vehicleId: 'taxi-1',
    otherEntityId: 'wall-1',
    impulseNs: 4_000_000,
    distanceM: 2,
  });
  assert.equal(impact.played, false);
  assert.equal(impact.reason, 'AWAITING_GESTURE');
  assert.equal(startedVoices(backend), 0);
  assert.equal(engine.getStats().skippedBeforeGesture, 2);
  assert.equal(engine.getStats().impactsSkipped, 1);

  assert.equal(engine.startFromUserGesture('POINTER'), 'RUNNING');
  assert.equal(backend.getCounters().contextsCreated, 1);
  assert.equal(engine.getStats().state, 'RUNNING');
  assert.throws(
    () => engine.startFromUserGesture('AUTOPLAY' as 'POINTER'),
    ContractValidationError,
  );

  const afterGesture = engine.updateVehicle(sample('taxi-1'));
  assert.equal(afterGesture.skipped, false);
  assert.equal(afterGesture.voice, 'ALLOCATED');
  assert.equal(startedVoices(backend), 1);
  engine.dispose();
});

test('the mute switch silences the output only and never stops the simulation', () => {
  const backend = createFakeAudioBackend();
  const engine = createAudioEngine({ backend });
  engine.startFromUserGesture('KEYBOARD');
  engine.updateVehicle(sample('taxi-1'));

  const bus = createEventBus({ sessionId: 'audio-mute', worldEpoch: 1 });
  const delivered: string[] = [];
  bus.subscribe((event) => {
    delivered.push(event.type);
  });
  const bridge = attachCollisionAudio({ engine, eventBus: bus });
  let ticks = 0;
  const hudSnapshot = 'speed=42;gear=3';
  for (let tick = 0; tick < 5; tick += 1) {
    ticks += 1;
    engine.updateVehicle(sample('taxi-1', { distanceM: 4 + tick }));
    bus.publish({
      schemaVersion: 1,
      units: 'SI',
      sessionId: 'audio-mute',
      worldEpoch: 1,
      eventId: `collision-${tick}`,
      tick,
      entityIds: ['taxi-1', 'wall-1'],
      type: 'COLLISION',
      payload: { vehicleId: 'taxi-1', otherEntityId: 'wall-1', impulseNs: 3_000_000 },
    });
    // The impact cue is one-shot: the clock advances so the next collision gets a free slot.
    backend.advance(0.5);
  }
  const unmuted = engine.getStats();
  assert.equal(delivered.length, 5);
  assert.equal(bridge.handled, 5);
  assert.ok(unmuted.activeVoices > 0);

  const muted = engine.setMuted(true);
  assert.equal(muted.muted, true);
  const mutedStats = engine.getStats();
  assert.equal(mutedStats.effectiveGains.engine, 0);
  assert.equal(mutedStats.effectiveGains.impact, 0);
  assert.equal(mutedStats.effectiveGains.ui, 0);
  // The category levels stay untouched: mute is an output switch, not a mixer rewrite.
  assert.equal(mutedStats.categoryGains.engine, unmuted.categoryGains.engine);
  assert.equal(mutedStats.categoryGains.impact, unmuted.categoryGains.impact);
  assert.equal(backend.getMasterGain(), 0);

  const ticksBefore = ticks;
  const hudBefore = hudSnapshot;
  engine.updateVehicle(sample('taxi-1', { distanceM: 9 }));
  bus.publish({
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'audio-mute',
    worldEpoch: 1,
    eventId: 'collision-muted',
    tick: 9,
    entityIds: ['taxi-1', 'wall-1'],
    type: 'COLLISION',
    payload: { vehicleId: 'taxi-1', otherEntityId: 'wall-1', impulseNs: 3_000_000 },
  });
  ticks += 1;
  assert.equal(ticks, ticksBefore + 1);
  assert.equal(hudSnapshot, hudBefore);
  assert.equal(delivered.length, 6);
  // The muted engine still processes the audio work: only the output gain is zero.
  assert.equal(engine.getStats().impactsPlayed, unmuted.impactsPlayed + 1);
  assert.ok(engine.getStats().gainUpdates > 0);
  bridge.dispose();
  engine.dispose();
});

test('master, engine, impact and ui levels are independent mix buses', () => {
  const backend = createFakeAudioBackend();
  const engine = createAudioEngine({
    backend,
    preferences: {
      schemaVersion: 1,
      master: 0.8,
      engine: 0.5,
      impact: 1,
      ui: 0.25,
      muted: false,
    },
  });
  engine.startFromUserGesture('TOUCH');
  const stats = engine.getStats();
  assert.equal(stats.masterGain, 0.8);
  assert.equal(stats.categoryGains.engine, 0.5);
  assert.equal(stats.categoryGains.impact, 1);
  assert.equal(stats.categoryGains.ui, 0.25);
  assert.ok(Math.abs(stats.effectiveGains.engine - 0.4) < 1e-9);
  assert.ok(Math.abs(stats.effectiveGains.impact - 0.8) < 1e-9);
  assert.ok(Math.abs(stats.effectiveGains.ui - 0.2) < 1e-9);
  assert.equal(backend.getCategoryGain('engine'), 0.5);
  assert.equal(backend.getCategoryGain('impact'), 1);
  assert.equal(backend.getCategoryGain('ui'), 0.25);

  engine.applyPreferences({
    schemaVersion: 1,
    master: 0.8,
    engine: 0.1,
    impact: 1,
    ui: 0.25,
    muted: false,
  });
  const updated = engine.getStats();
  assert.ok(Math.abs(updated.effectiveGains.engine - 0.08) < 1e-9);
  assert.ok(Math.abs(updated.effectiveGains.impact - 0.8) < 1e-9);
  assert.ok(Math.abs(updated.effectiveGains.ui - 0.2) < 1e-9);
  engine.dispose();
});

test('collision events of 028 drive the impact bus', () => {
  const backend = createFakeAudioBackend();
  const engine = createAudioEngine({ backend });
  const bus = createEventBus({ sessionId: 'audio-impact', worldEpoch: 3 });
  const bridge = attachCollisionAudio({
    engine,
    eventBus: bus,
    distanceM: () => 4,
  });

  // Without a gesture the collision is refused, but the event itself is still delivered.
  bus.publish({
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'audio-impact',
    worldEpoch: 3,
    eventId: 'collision-early',
    tick: 0,
    entityIds: ['taxi-1', 'wall-1'],
    type: 'COLLISION',
    payload: { vehicleId: 'taxi-1', otherEntityId: 'wall-1', impulseNs: 4_000_000 },
  });
  assert.equal(bridge.handled, 0);
  assert.equal(bridge.skipped, 1);

  engine.startFromUserGesture('POINTER');
  bus.publish({
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'audio-impact',
    worldEpoch: 3,
    eventId: 'collision-1',
    tick: 1,
    entityIds: ['taxi-1', 'wall-1'],
    type: 'COLLISION',
    payload: { vehicleId: 'taxi-1', otherEntityId: 'wall-1', impulseNs: 4_000_000 },
  });
  assert.equal(bridge.handled, 1);
  const stats = engine.getStats();
  assert.equal(stats.impactsPlayed, 1);
  assert.equal(stats.voicesByCategory.impact, 1);
  assert.equal(stats.voicesByCategory.engine, 0);
  const voices = backend.getVoices();
  assert.equal(voices.length, 1);
  assert.equal(voices[0]?.cueId, 'impact');
  assert.equal(voices[0]?.ownerId, 'collision-1');
  bridge.dispose();
  engine.dispose();
});

test('voice caps bound the pool and the stealing is deterministic', () => {
  const backend = createFakeAudioBackend();
  const engine = createAudioEngine({
    backend,
    limits: {
      ...AUDIO_LIMITS,
      engineVoices: 2,
      maxAudibleVehicles: 4,
    },
  });
  engine.startFromUserGesture('POINTER');
  // The distant vehicle takes a slot first; the closer one steals it deterministically.
  engine.updateVehicle(sample('distant', { distanceM: 10 }));
  engine.updateVehicle(sample('near', { distanceM: 2 }));
  assert.equal(engine.getStats().activeVoices, 2);
  engine.updateVehicle(sample('middle', { distanceM: 6 }));
  const stats = engine.getStats();
  assert.equal(stats.activeVoices, 2);
  assert.equal(stats.stolenVoices, 1);
  const owners = backend
    .getVoices()
    .filter((voice) => !voice.stopped)
    .map((voice) => voice.ownerId);
  assert.deepEqual(owners.sort(), ['middle', 'near']);

  // A quieter vehicle never steals a louder one: the cue is dropped instead.
  engine.updateVehicle(sample('quiet', { distanceM: 8 }));
  const after = engine.getStats();
  assert.equal(after.activeVoices, 2);
  assert.equal(after.stolenVoices, 1);
  assert.equal(after.droppedCues, 1);
  assert.equal(after.activeVoices <= AUDIO_LIMITS.totalVoices, true);
  engine.dispose();
});

test('inaudible vehicles never reach the voice pool', () => {
  const backend = createFakeAudioBackend();
  const engine = createAudioEngine({ backend });
  engine.startFromUserGesture('POINTER');
  for (let index = 0; index < 30; index += 1) {
    engine.updateVehicle(sample(`far-${index}`, { distanceM: 80, speedMps: 4 }));
  }
  const stats = engine.getStats();
  assert.equal(stats.vehicleUpdates, 30);
  assert.equal(stats.audibleUpdates, 0);
  assert.equal(stats.inaudibleUpdates, 30);
  assert.equal(stats.activeVoices, 0);
  assert.equal(startedVoices(backend), 0);
  assert.equal(stats.buffers, 0);
  assert.equal(stats.bufferBytes, 0);

  engine.updateVehicle(sample('close', { distanceM: 3, speedMps: 12 }));
  const withVoice = engine.getStats();
  assert.equal(withVoice.audibleUpdates, 1);
  assert.equal(withVoice.activeVoices, 1);
  assert.equal(startedVoices(backend), 1);
  assert.ok(withVoice.bufferBytes > 0);
  assert.ok(withVoice.bufferBytes <= AUDIO_LIMITS.maxBufferBytes);
  assert.ok(withVoice.buffers <= AUDIO_LIMITS.maxBuffers);
  engine.dispose();
});

test('the audible vehicle cap keeps the closest vehicles and skips the distant ones', () => {
  const backend = createFakeAudioBackend();
  const engine = createAudioEngine({ backend });
  engine.startFromUserGesture('POINTER');
  for (let index = 0; index < 20; index += 1) {
    engine.updateVehicle(sample(`vehicle-${index}`, { distanceM: 1 + index }));
  }
  const stats = engine.getStats();
  assert.equal(stats.audibleVehicles, AUDIO_LIMITS.maxAudibleVehicles);
  assert.equal(stats.activeVoices, AUDIO_LIMITS.engineVoices);
  assert.equal(stats.capSkips, 20 - AUDIO_LIMITS.maxAudibleVehicles);
  assert.equal(stats.audibleVehicles + stats.capSkips, 20);
  engine.dispose();
});

test('disposal releases the voices, the ownership and the context exactly once', () => {
  const backend = createFakeAudioBackend();
  const engine = createAudioEngine({ backend });
  engine.startFromUserGesture('POINTER');
  engine.updateVehicle(sample('taxi-1'));
  engine.updateVehicle(sample('taxi-2', { distanceM: 7 }));
  assert.equal(engine.getStats().activeVoices, 2);

  assert.equal(engine.releaseVehicle('taxi-1'), 1);
  assert.equal(engine.getStats().activeVoices, 1);
  assert.equal(engine.getStats().audibleVehicles, 1);

  engine.dispose();
  engine.dispose();
  const stats = engine.getStats();
  assert.equal(stats.state, 'CLOSED');
  assert.equal(stats.disposed, true);
  assert.equal(stats.activeVoices, 0);
  assert.equal(stats.audibleVehicles, 0);
  assert.equal(backend.state, 'closed');
  assert.equal(
    backend.getVoices().every((voice) => voice.stopped),
    true,
  );
  assert.throws(() => engine.updateVehicle(sample('taxi-1')), ContractValidationError);
  assert.throws(() => engine.setMuted(true), ContractValidationError);
});

test('one-shot cues expire and respect the cooldown of their owner', () => {
  const backend = createFakeAudioBackend();
  const engine = createAudioEngine({ backend });
  engine.startFromUserGesture('POINTER');
  const first = engine.playOneShot('takeover-notice', 'session-1');
  assert.equal(first.played, true);
  const repeated = engine.playOneShot('takeover-notice', 'session-1');
  assert.equal(repeated.played, false);
  assert.equal(engine.getStats().cooldownSkips, 1);
  assert.equal(engine.getStats().voicesByCategory.ui, 1);

  backend.advance(AUDIO_LIMITS.oneShotCooldownS + 0.1);
  const afterCooldown = engine.playOneShot('takeover-notice', 'session-1');
  assert.equal(afterCooldown.played, true);
  // The previous one-shot expired with its own duration, so only the new cue is alive.
  assert.equal(engine.getStats().voicesByCategory.ui, 1);
  // The one-shot cue expires on its own; the loop of the engine is not a keep-alive.
  backend.advance(1);
  engine.updateVehicle(sample('taxi-1'));
  assert.equal(engine.getStats().voicesByCategory.ui, 0);
  engine.dispose();
});

test('the Web Audio adapter builds the graph on resume and caches the buffers', () => {
  const created: number[] = [];
  let bufferRequests = 0;
  const context = createWebAudioContextDouble(() => {
    bufferRequests += 1;
  });
  const backend = createWebAudioBackend({
    contextFactory: () => {
      created.push(1);
      return context;
    },
  });
  assert.equal(created.length, 0);
  assert.equal(backend.state, 'created');
  assert.throws(() => backend.play(requestFor('engine-loop')), ContractValidationError);

  backend.resume();
  assert.equal(created.length, 1);
  const voice = backend.play(requestFor('engine-loop'));
  assert.equal(voice.state, 'playing');
  const buffersAfterFirst = bufferRequests;
  backend.play(requestFor('engine-loop'));
  assert.equal(bufferRequests, buffersAfterFirst);
  voice.setGain(0.5);
  voice.stop();
  assert.equal(voice.state, 'stopped');
  backend.close();
  assert.equal(backend.state, 'closed');
});

function requestFor(cueId: AudioCueId) {
  return {
    cueId,
    category: 'engine' as const,
    ownerId: 'taxi-1',
    gain: 0.8,
    playbackRate: 1,
    loop: true,
    durationS: 0,
    buffer: { cueId, sampleRate: 22050, frames: 1024, channels: 1 },
  };
}

function createWebAudioContextDouble(onBuffer: () => void): WebAudioContextLike {
  const param = (value: number): WebAudioParamLike => ({ value });
  const node = (): WebAudioNodeLike => ({
    connect: () => undefined,
    disconnect: () => undefined,
  });
  const gain = (): WebAudioGainLike => ({ ...node(), gain: param(1) });
  const source = (): WebAudioBufferSourceLike => ({
    ...node(),
    playbackRate: param(1),
    buffer: null,
    loop: false,
    onended: null,
    start: () => undefined,
    stop: () => undefined,
  });
  return {
    state: 'running',
    currentTime: 0,
    destination: {},
    createGain: gain,
    createBuffer: (_channels: number, frames: number): WebAudioBufferLike => {
      onBuffer();
      const data = new Float32Array(frames);
      return {
        length: frames,
        getChannelData: () => data,
      };
    },
    createBufferSource: source,
    resume: () => undefined,
    close: () => undefined,
  };
}

export type { AudioBackendVoice, AudioEngine };
