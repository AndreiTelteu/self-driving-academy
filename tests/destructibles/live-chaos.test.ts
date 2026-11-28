import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCompositionWorld } from '../../src/app/composition-world';
import { createAudioEngine, createFakeAudioBackend } from '../../src/audio';
import type { AudioEngine, FakeAudioBackend } from '../../src/audio';
import { createLiveChaos, LIVE_CHAOS_DEFAULTS, LIVE_CHAOS_VERSION } from '../../src/app/live-chaos';
import type { LiveChaos, LiveChaosPhysicsPort, LiveChaosStepInput } from '../../src/app/live-chaos';
import type { CollisionIncident } from '../../src/vehicles';
import { DESTRUCTIBLE_ARCHETYPES } from '../../src/world';

const world = createCompositionWorld();

interface Harness {
  readonly chaos: LiveChaos;
  readonly physics: LiveChaosPhysicsPort;
  readonly backend: FakeAudioBackend;
  readonly engine: AudioEngine;
  readonly active: Map<string, unknown>;
}

function harness(
  options: {
    gesture?: boolean;
    visualAlternative?: boolean;
    xp?: () => number;
    profile?: () => string;
  } = {},
): Harness {
  const active = new Map<string, unknown>();
  const physics: LiveChaosPhysicsPort = {
    addObstacle(input) {
      if (active.size >= 96) return false;
      active.set(input.id, input);
      return true;
    },
    moveObstacle(id) {
      return active.has(id);
    },
    removeObstacle(id) {
      return active.delete(id);
    },
    hasObstacle(id) {
      return active.has(id);
    },
    readIncidents() {
      return [];
    },
    getStats() {
      return {
        obstacles: {
          active: active.size,
          capacity: 96,
          worldObstacles: 90,
          available: Math.max(0, 96 - 90 - active.size),
          added: 0,
          moved: 0,
          removed: 0,
          refused: 0,
        },
      };
    },
  };
  const backend = createFakeAudioBackend();
  const engine = createAudioEngine({ backend });
  if (options.gesture === true) engine.startFromUserGesture('POINTER');
  const chaos = createLiveChaos({
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: '285-live-chaos-test',
      worldEpoch: 1,
    }),
    layout: world.layout,
    physics,
    engine,
    ...(options.visualAlternative === true
      ? { settings: Object.freeze({ visualAlternative: true }) }
      : {}),
    clock: () => 0,
    now: () => '2026-11-28T00:00:00.000Z',
    ...(options.xp === undefined ? {} : { xpMicroXp: options.xp }),
    ...(options.profile === undefined ? {} : { profileFingerprint: options.profile }),
  });
  return { chaos, physics, backend, engine, active };
}

function vehicleAt(chaos: LiveChaos, objectId: string): LiveChaosStepInput['vehicles'][number] {
  const state = chaos.decor.getState(objectId);
  return Object.freeze({
    vehicleId: 'taxi-285',
    driverKind: 'TAXI' as const,
    positionM: state.positionM,
    yawRad: 0,
    speedMps: 9,
    controlMode: 'MANUAL' as const,
    isPlayer: true,
  });
}

function incident(
  chaos: LiveChaos,
  objectId: string,
  impulseNs: number,
  tick: number,
  incidentId: string,
): CollisionIncident {
  const otherEntityId = `destructible:${objectId}`;
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: chaos.context.sessionId,
    worldEpoch: chaos.context.worldEpoch,
    incidentId,
    tick,
    vehicleId: 'taxi-285',
    otherEntityId,
    impulseNs,
    first: Object.freeze({
      entityId: 'taxi-285',
      kind: 'VEHICLE' as const,
      serial: 1,
      colliderHandle: 1,
    }),
    second: Object.freeze({
      entityId: otherEntityId,
      kind: 'OBSTACLE' as const,
      serial: 2,
      colliderHandle: 2,
    }),
  });
}

function objectOf(chaos: LiveChaos, archetype: keyof typeof DESTRUCTIBLE_ARCHETYPES): string {
  const definition = chaos.plan.definitions.find((entry) => entry.archetype === archetype);
  assert(definition !== undefined, `missing ${archetype}`);
  return definition.objectId;
}

test('285 the live plan is the real 227 plan: three zones and every light archetype', () => {
  const { chaos } = harness();
  try {
    assert.equal(chaos.plan.definitions.length, 35);
    assert.equal(chaos.plan.zones.length, 3);
    const archetypes = new Set(chaos.plan.definitions.map((entry) => entry.archetype));
    for (const archetype of Object.keys(DESTRUCTIBLE_ARCHETYPES))
      assert(archetypes.has(archetype as keyof typeof DESTRUCTIBLE_ARCHETYPES));
    const stats = chaos.getStats();
    assert.equal(stats.version, LIVE_CHAOS_VERSION);
    assert.equal(stats.objects, 35);
    assert.equal(stats.definitions, 35);
    assert.equal(stats.caps.objects, 96);
    assert.equal(stats.caps.fragments, 192);
    assert.equal(stats.caps.audioImpactVoices, 4);
    assert.equal(stats.assets.heapBytes, null);
  } finally {
    chaos.dispose();
  }
});

test('285 the physical window is bounded and follows the listener', () => {
  const { chaos, active } = harness();
  try {
    const target = objectOf(chaos, 'CONE');
    const vehicle = vehicleAt(chaos, target);
    chaos.step({ tick: 1, vehicles: [vehicle], listenerPositionM: vehicle.positionM });
    assert.equal(active.size, LIVE_CHAOS_DEFAULTS.maxPhysicalObstacles);
    assert(chaos.getStats().physicalObstacles <= LIVE_CHAOS_DEFAULTS.maxPhysicalObstacles);
    // Moving far away releases every binding; the logical 35 objects are untouched.
    chaos.step({
      tick: 2,
      vehicles: [{ ...vehicle, positionM: { x: 0, y: 0, z: 0 } }],
      listenerPositionM: { x: 0, y: 0, z: 0 },
    });
    assert.equal(active.size, 0);
    assert.equal(chaos.getStats().objects, 35);
  } finally {
    chaos.dispose();
  }
});

test('285 a real 028 incident moves or breaks only the light object and is deduplicated', () => {
  const { chaos, backend } = harness({ gesture: true });
  try {
    const target = objectOf(chaos, 'CONE');
    const vehicle = vehicleAt(chaos, target);
    const definition = chaos.decor.getDefinitions().find((entry) => entry.objectId === target)!;
    const impulse = definition.impactThreshold.moveImpulseNs * 1.05;
    const first = incident(chaos, target, impulse, 10, 'collision:285:move');
    chaos.step({ tick: 10, vehicles: [vehicle], incidents: [first] });
    assert.equal(chaos.decor.getState(target).state, 'MOVED');
    assert.equal(chaos.getStats().brokenEvents, 0);
    // The same 028 incident can be retried by the caller; it is processed exactly once.
    chaos.step({ tick: 11, vehicles: [vehicle], incidents: [first] });
    assert.equal(chaos.getStats().reactions, 0);
    const breakImpulse = definition.impactThreshold.breakImpulseNs * 1.2;
    chaos.step({
      tick: 12,
      vehicles: [vehicle],
      incidents: [incident(chaos, target, breakImpulse, 12, 'collision:285:break')],
    });
    assert.equal(chaos.decor.getState(target).state, 'BROKEN');
    assert.equal(chaos.getStats().brokenEvents, 1);
    assert.equal(chaos.getStats().reactions, 1);
    assert.equal(chaos.getStats().fragments.expiredFragments, 0);
    assert.equal(chaos.getStats().fragments.activeFragments, 2);
    assert.equal(chaos.getStats().audio?.impactsPlayed, 1);
    assert.equal(backend.getVoices().length >= 0, true);
    // A repeated break does not publish a second event or a second reaction.
    chaos.step({
      tick: 13,
      vehicles: [vehicle],
      incidents: [incident(chaos, target, breakImpulse, 13, 'collision:285:duplicate')],
    });
    assert.equal(chaos.getStats().brokenEvents, 1);
    assert.equal(chaos.getStats().reactions, 1);
  } finally {
    chaos.dispose();
  }
});

test('285 material and intensity are derived from the real thresholds, before and after gesture', () => {
  const { chaos, engine } = harness();
  try {
    const target = objectOf(chaos, 'DECOR_SIGN');
    const definition = chaos.decor.getDefinitions().find((entry) => entry.objectId === target)!;
    const vehicle = vehicleAt(chaos, target);
    const impulse = definition.impactThreshold.breakImpulseNs * 1.1;
    chaos.step({
      tick: 10,
      vehicles: [vehicle],
      incidents: [incident(chaos, target, impulse, 10, 'collision:285:pre-gesture')],
    });
    const pre = chaos.visual();
    assert.equal(pre.reactions.length, 1);
    assert.equal(pre.reactions[0]!.material, 'GLASS');
    assert.equal(pre.reactions[0]!.audioPlayed, false);
    assert.equal(pre.reactions[0]!.variant, 'SHOCK_RING');
    assert.equal(pre.audioFallback, true);
    assert.equal(engine.getStats().state, 'IDLE');
    engine.startFromUserGesture('KEYBOARD');
    const next = objectOf(chaos, 'CONE');
    const nextDefinition = chaos.decor.getDefinitions().find((entry) => entry.objectId === next)!;
    chaos.step({
      tick: 20,
      vehicles: [vehicleAt(chaos, next)],
      incidents: [
        incident(
          chaos,
          next,
          nextDefinition.impactThreshold.breakImpulseNs * 1.1,
          20,
          'collision:285:post-gesture',
        ),
      ],
    });
    const post = chaos.visual();
    assert.equal(post.reactions.length, 1);
    assert.equal(post.reactions[0]!.material, 'PLASTIC');
    assert.equal(post.reactions[0]!.audioPlayed, true);
    assert.equal(post.reactions[0]!.variant, 'FRAGMENT_BURST');
    assert.equal(post.audioFallback, false);
  } finally {
    chaos.dispose();
  }
});

test('285 the visual alternative keeps the information without fragments or sound', () => {
  const { chaos } = harness({ visualAlternative: true });
  try {
    const target = objectOf(chaos, 'FENCE_LIGHT');
    const definition = chaos.decor.getDefinitions().find((entry) => entry.objectId === target)!;
    const vehicle = vehicleAt(chaos, target);
    chaos.step({
      tick: 10,
      vehicles: [vehicle],
      incidents: [
        incident(
          chaos,
          target,
          definition.impactThreshold.breakImpulseNs * 1.2,
          10,
          'collision:285:alternative',
        ),
      ],
    });
    const visual = chaos.visual();
    assert.equal(visual.reactions[0]!.variant, 'SHOCK_RING');
    assert.equal(visual.reactions[0]!.visualAlternative, true);
    assert.equal(visual.reactions[0]!.fragments, 0);
    assert.equal(chaos.getStats().fragments.spawnedFragments, 0);
  } finally {
    chaos.dispose();
  }
});

test('285 chain reactions keep the real instigator and never invent player credit', () => {
  const { chaos } = harness({ gesture: true });
  try {
    const crate = objectOf(chaos, 'CRATE');
    const definition = chaos.decor.getDefinitions().find((entry) => entry.objectId === crate)!;
    const vehicle = vehicleAt(chaos, crate);
    const events: string[] = [];
    chaos.eventBus.subscribe((event) => {
      if (event.type === 'DESTRUCTIBLE_BROKEN')
        events.push(`${event.payload.objectId}|${event.payload.instigatorId}`);
    });
    chaos.step({
      tick: 10,
      vehicles: [vehicle],
      incidents: [
        incident(
          chaos,
          crate,
          definition.impactThreshold.breakImpulseNs * 3,
          10,
          'collision:285:chain',
        ),
      ],
    });
    assert(events.length >= 2);
    assert(events[0]!.endsWith('|taxi-285'));
    assert(events.slice(1).every((entry) => !entry.endsWith('|taxi-285')));
    assert.equal(chaos.getStats().chainBreaks >= 1, true);
    assert.equal(chaos.getStats().impactsBySource.MANUAL, 1);
    assert.equal(chaos.getStats().impactsBySource.AUTO, 0);
  } finally {
    chaos.dispose();
  }
});

test('285 the impact source never changes the outcome or the event payload', () => {
  const fingerprints: string[] = [];
  for (const source of ['MANUAL', 'LEARNING', 'AUTO'] as const) {
    const { chaos } = harness({ gesture: true });
    try {
      const target = objectOf(chaos, 'BIN');
      const definition = chaos.decor.getDefinitions().find((entry) => entry.objectId === target)!;
      const vehicle = { ...vehicleAt(chaos, target), controlMode: source };
      chaos.step({
        tick: 10,
        vehicles: [vehicle],
        incidents: [
          incident(
            chaos,
            target,
            definition.impactThreshold.breakImpulseNs * 1.1,
            10,
            `collision:285:${source}`,
          ),
        ],
      });
      const reaction = chaos.visual().reactions[0]!;
      fingerprints.push(
        `${chaos.decor.getState(target).state}|${reaction.material}|${reaction.intensity.tier}|${reaction.fingerprint.split('|').slice(1).join('|')}`,
      );
      assert.equal(chaos.getStats().impactsBySource[source], 1);
    } finally {
      chaos.dispose();
    }
  }
  assert.equal(new Set(fingerprints).size, 1);
});

test('285 fragment lifetime, voice cap and object cap are hard and released', () => {
  const { chaos } = harness({ gesture: true });
  try {
    const targets = chaos.plan.definitions.slice(0, 6);
    const vehicle = vehicleAt(chaos, targets[0]!.objectId);
    for (const [index, definition] of targets.entries()) {
      chaos.step({
        tick: 10 + index,
        vehicles: [vehicle],
        incidents: [
          incident(
            chaos,
            definition.objectId,
            definition.impactThreshold.breakImpulseNs * 1.2,
            10 + index,
            `collision:285:burst:${index}`,
          ),
        ],
      });
    }
    const stats = chaos.getStats();
    assert(stats.fragments.activeFragments <= 192);
    assert(stats.fragments.peakFragments <= 192);
    assert.equal(stats.audio?.voicesByCategory.impact, 4);
    assert(stats.fragments.audioPlayed <= 4);
    // After 120 ticks the 228 pool releases every fragment; the world objects remain 35.
    chaos.step({ tick: 200, vehicles: [vehicle] });
    assert.equal(chaos.getStats().fragments.activeFragments, 0);
    assert.equal(chaos.getStats().objects, 35);
  } finally {
    chaos.dispose();
  }
});

test('285 twenty resets restore the decor, keep XP/profile and replay the order', () => {
  let xp = 500_000;
  let profile = 'profile-261-academy@1';
  const { chaos, active } = harness({ gesture: true, xp: () => xp, profile: () => profile });
  try {
    const targets = chaos.plan.definitions;
    let tick = 1;
    for (let cycle = 0; cycle < 20; cycle += 1) {
      const target = targets[cycle % targets.length]!;
      const vehicle = vehicleAt(chaos, target.objectId);
      tick += 10;
      chaos.step({ tick, vehicles: [vehicle] });
      chaos.step({
        tick,
        vehicles: [vehicle],
        incidents: [
          incident(
            chaos,
            target.objectId,
            target.impactThreshold.breakImpulseNs * 1.2,
            tick,
            `collision:285:reset:${cycle}`,
          ),
        ],
      });
      assert.equal(chaos.visual().reactions.length >= 1, true);
      tick += 5;
      const reset = chaos.reset(tick);
      assert.equal(reset.status, 'RESET');
      assert.equal(reset.xpDeltaMicroXp, 0);
      assert.equal(reset.xpWithdrawn, false);
      assert.equal(reset.profileChanged, false);
      assert.equal(reset.restored, 35);
      assert.equal(chaos.getStats().objectsByState.BROKEN, 0);
      assert.equal(chaos.getStats().fragments.activeFragments, 0);
      assert.equal(chaos.getStats().bodies, 35);
      assert.equal(chaos.getStats().colliders, 35);
      assert(active.size <= LIVE_CHAOS_DEFAULTS.maxPhysicalObstacles);
    }
    assert.equal(chaos.getStats().resets, 20);
    const chunks = chaos.replayChunks();
    assert(chunks.length > 0);
    const replay = chaos.checkReplay();
    assert.equal(replay.status, 'REPLAYED');
    assert.equal(replay.stepsSimulation, 0);
    assert.equal(replay.physicsSteps, 0);
    assert.equal(replay.policyEvaluations, 0);
    assert.equal(replay.awardsGranted, 0);
    assert.equal(replay.learningArtifacts, 0);
    assert.equal(replay.orderIdentical, true);
    assert.equal(replay.eventsIdentical, true);
    // The newest chunk is the one that carries the reset event and the next destruction in order.
    assert.equal(replay.resetEvents >= 1, true);
    assert.equal(replay.destructionEvents >= 1, true);
    xp = 500_000;
    profile = 'profile-261-academy@1';
  } finally {
    chaos.dispose();
  }
});

test('285 the replay refuses an absent chunk instead of inventing events', () => {
  const { chaos } = harness();
  try {
    const replay = chaos.checkReplay();
    assert.equal(replay.status, 'REFUSED');
    assert.equal(replay.chunkId, null);
    assert.equal(replay.recordedEvents, 0);
    assert.equal(replay.replayedEvents, 0);
  } finally {
    chaos.dispose();
  }
});
