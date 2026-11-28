import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { createCompositionWorld } from '../../../src/app/composition-world';
import { createAudioEngine, createWebAudioBackend } from '../../../src/audio';
import { createLiveChaos } from '../../../src/app/live-chaos';
import type { LiveChaosPhysicsPort } from '../../../src/app/live-chaos';
import { createDestructibleDecorScene } from '../../../src/rendering/babylon/destructible-decor-scene';

/**
 * PBI 285 browser fixture. It runs the real 227 state machine, the real 228 feedback/replay, the
 * real 207 recorder, the real 148 Web Audio engine and the real Babylon destructible scene. The
 * contact is injected through `probeImpact` (the same path as a 028 incident, but not a driven
 * collision); the fixture labels it PROBE_INJECTED in the evidence.
 */
const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const notice = document.querySelector<HTMLDivElement>('#notice');
const unlock = document.querySelector<HTMLButtonElement>('#unlock');
if (!canvas || !notice || !unlock) throw new Error('Missing fixture elements');

const engine3d = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine3d);
scene.clearColor = new Color3(0.05, 0.06, 0.08).toColor4();
const camera = new FreeCamera('probe-camera', new Vector3(620, 26, 120), scene);
camera.setTarget(new Vector3(650, 0, 175));
camera.minZ = 0.1;
camera.maxZ = 2000;
scene.activeCamera = camera;
const light = new HemisphericLight('probe-light', new Vector3(0.4, 1, 0.2), scene);
light.intensity = 0.95;
light.groundColor = new Color3(0.2, 0.2, 0.2);
const ground = CreateGround('probe-ground', { width: 260, height: 80 }, scene);
ground.position.set(650, -0.02, 175);

const world = createCompositionWorld();
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

let audioEngine: ReturnType<typeof createAudioEngine> | null = null;
try {
  audioEngine = createAudioEngine({ backend: createWebAudioBackend() });
} catch {
  audioEngine = null;
}
const audioState = () => audioEngine?.getStats().state ?? 'ABSENT';
unlock.addEventListener('click', () => {
  try {
    audioEngine?.startFromUserGesture('POINTER');
  } catch (error) {
    console.error('Audio unlock failed', error);
  }
  unlock.textContent = `Audio: ${audioState()}`;
});

const fixtureXp = { value: 500_000 };
const fixtureProfile = { value: 'fixture-profile@1' };
const chaos = createLiveChaos({
  context: Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: 'session-285-browser',
    worldEpoch: 1,
  }),
  layout: world.layout,
  physics,
  ...(audioEngine === null ? {} : { engine: audioEngine }),
  xpMicroXp: () => fixtureXp.value,
  profileFingerprint: () => fixtureProfile.value,
  onReaction: (reaction) => {
    notice.hidden = false;
    notice.textContent = `${reaction.symbol} ${reaction.text} · ${
      reaction.audioPlayed ? 'audio' : `efect vizual (${reaction.audioReason})`
    }`;
    notice.dataset.event = reaction.eventId;
    notice.dataset.material = reaction.material;
    notice.dataset.intensity = reaction.intensity.tier;
    notice.dataset.variant = reaction.variant;
    notice.dataset.audio = reaction.audioPlayed ? 'PLAYED' : reaction.audioReason;
  },
});
const visual = createDestructibleDecorScene(scene, chaos.plan);
const targets = chaos.plan.definitions.slice(0, 8).map((definition) => ({
  objectId: definition.objectId,
  archetype: definition.archetype,
  positionM: definition.initialTransform.positionM,
}));
const target = chaos.plan.definitions.find((definition) => definition.archetype === 'CONE')!;
const focus = (objectId: string) => {
  const definition = chaos.plan.definitions.find((entry) => entry.objectId === objectId);
  if (definition === undefined) return false;
  const position = definition.initialTransform.positionM;
  camera.position.set(position.x - 7, 2.8, position.z - 6);
  camera.setTarget(new Vector3(position.x, 0.6, position.z));
  return true;
};

function impact(objectId = target.objectId, impulseNs?: number) {
  const definition = chaos.plan.definitions.find((entry) => entry.objectId === objectId);
  if (definition === undefined) return null;
  const tick = Math.max(10, chaos.getStats().tick + 1);
  const result = chaos.probeImpact({
    objectId,
    impulseNs: impulseNs ?? definition.impactThreshold.breakImpulseNs * 1.2,
    tick,
    vehicleId: 'probe-vehicle',
    controlSource: 'MANUAL',
  });
  return {
    accepted: result !== null,
    state: chaos.decor.getState(objectId).state,
    stats: chaos.getStats(),
  };
}

engine3d.runRenderLoop(() => {
  visual.apply(chaos.visual());
  scene.render();
});

const read = () => ({
  audioState: audioState(),
  stats: chaos.getStats(),
  scene: visual.stats(),
  targets,
  notice: {
    hidden: notice.hidden,
    text: notice.textContent,
    audio: notice.dataset.audio ?? null,
    variant: notice.dataset.variant ?? null,
    material: notice.dataset.material ?? null,
  },
  xp: fixtureXp.value,
  profile: fixtureProfile.value,
});

Object.defineProperty(globalThis, '__destructibleChaosProbe', {
  value: Object.freeze({
    ready: true,
    version: '285-browser-fixture-v1',
    impact,
    focus,
    reset: () => chaos.reset(Math.max(20, chaos.getStats().tick + 5)),
    replay: () => chaos.checkReplay(),
    replayChunks: () => chaos.replayChunks(),
    unlockAudio: () => {
      audioEngine?.startFromUserGesture('POINTER');
      return audioState();
    },
    read,
    dispose: () => {
      visual.dispose();
      chaos.dispose();
      audioEngine?.dispose();
      engine3d.dispose();
    },
  }),
});
