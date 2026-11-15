import assert from 'node:assert/strict';
import test from 'node:test';
import { characterPositionBits, createCharacterAsset } from '../../src/character';
import {
  COMPOSITION_SPAWN_CURB_OFFSET_M,
  COMPOSITION_TAXI_CURB_OFFSET_M,
  V3_COMPOSITION_VERSION,
  compositionHudLine,
  createCompositionWorld,
  createV3Composition,
} from '../../src/app';
import { createDefaultSettings } from '../../src/settings';

function composition() {
  const world = createCompositionWorld();
  return {
    world,
    composition: createV3Composition({
      layout: world.layout,
      start: world.spawn,
      control: createDefaultSettings('236-test').input.control,
      context: Object.freeze({
        schemaVersion: 1 as const,
        units: 'SI' as const,
        sessionId: '236-test',
        worldEpoch: 1,
      }),
      vehicles: world.vehicles,
    }),
  };
}

test('compunerea refuză un tick care nu este următorul tick fix', () => {
  const { composition: model } = composition();
  assert.throws(() => model.step({ tick: 2 }), /tick-ul următor \(1\)/);
  const frame = model.step({ tick: 1 });
  assert.equal(frame.tick, 1);
  assert.throws(() => model.step({ tick: 1 }), /tick-ul următor \(2\)/);
  assert.throws(() => model.step({ tick: 4 }), /tick-ul următor \(2\)/);
  model.dispose();
});

test('fiecare tick are exact o livrare, iar HUD-ul arată entitatea și modul', () => {
  const { composition: model } = composition();
  model.port.setAction('throttle', true);
  let frame = model.step({ tick: 1 });
  for (let tick = 2; tick <= 60; tick += 1) frame = model.step({ tick });
  assert.equal(frame.stats.deliveries.CHARACTER + frame.stats.deliveries.VEHICLE, 60);
  assert.equal(frame.stats.ticksWithoutDelivery, 0);
  assert.equal(frame.hud.controlledKind, 'CHARACTER');
  assert.equal(frame.hud.controlledEntityId, 'player-character');
  assert.equal(frame.hud.mode, 'MANUAL');
  assert.equal(frame.hud.cameraEntityId, 'player-character');
  assert.equal(frame.hud.cameraDivergent, false);
  assert.equal(frame.hud.clipId, 'walk');
  assert.match(compositionHudLine(frame.hud), /Personaj player-character · MANUAL · walk/);
  model.dispose();
});

test('intrarea cere o mașină existentă și nu schimbă autoritatea la refuz', () => {
  const { composition: model } = composition();
  model.port.setAction('throttle', true);
  model.step({ tick: 1 });
  model.requestEntry('nu-exista');
  model.port.setAction('throttle', false);
  const frame = model.step({ tick: 2 });
  const refusal = frame.events.find((event) => event.kind === 'ENTER_REFUSED');
  assert.ok(refusal, 'refuzul este jurnalizat');
  assert.equal(frame.authority.consumer, 'CHARACTER');
  assert.equal(frame.stats.entryAttempts, 1);
  model.dispose();
});

test('ieșirea cerută cât timp ești pe jos este ignorată, nu inventată', () => {
  const { composition: model } = composition();
  model.requestExit();
  const frame = model.step({ tick: 1 });
  assert.equal(frame.events.at(-1)?.kind, 'EXIT_IGNORED');
  assert.equal(frame.authority.consumer, 'CHARACTER');
  assert.equal(frame.stats.exitAttempts, 0);
  model.dispose();
});

test('resetarea de scenariu readuce walker-ul la spawn fără să cloneze entitatea', () => {
  const { world, composition: model } = composition();
  model.port.setAction('throttle', true);
  for (let tick = 1; tick <= 30; tick += 1) model.step({ tick });
  const moved = model.character();
  assert.notEqual(
    moved.positionBits,
    characterPositionBits({
      x: world.spawn.x,
      y: world.walkWorld.surfaceAt(world.spawn.x, world.spawn.z),
      z: world.spawn.z,
    }),
  );
  model.resetScenario();
  const reset = model.character();
  assert.equal(reset.entityId, 'player-character');
  assert.equal(reset.tick, 0);
  assert.equal(
    reset.positionBits,
    characterPositionBits({
      x: world.spawn.x,
      y: world.walkWorld.surfaceAt(world.spawn.x, world.spawn.z),
      z: world.spawn.z,
    }),
  );
  model.dispose();
});

test('locul de start respectă distanțele reale față de bordură și de ușa taxiului', () => {
  const world = createCompositionWorld();
  assert.ok(world.side === 'S' || world.side === 'N' || world.side === 'W' || world.side === 'E');
  assert.equal(world.curbHeightM, 0.14);
  assert.equal(world.vehicles.length, 2);
  const taxi = world.vehicles[0]!;
  assert.equal(taxi.vehicleId, 'taxi-01');
  assert.equal(taxi.driverKind, 'TAXI');
  assert.equal(taxi.classId, 'sedan');
  assert.ok(COMPOSITION_SPAWN_CURB_OFFSET_M < COMPOSITION_TAXI_CURB_OFFSET_M);
  const surface = world.walkWorld.surfaceAt(world.spawn.x, world.spawn.z);
  assert.equal(surface, 0);
  assert.equal(world.walkWorld.blockingAt(world.spawn.x, world.spawn.z).length, 0);
  const doorDistance =
    Math.hypot(taxi.positionM.x - world.spawn.x, taxi.positionM.z - world.spawn.z) - 0.85;
  assert.ok(doorDistance <= 0.89, `ușa este la ${doorDistance.toFixed(3)} m`);
  assert.equal(world.vehicles[1]!.vehicleId, 'civil-01');
  assert.equal(V3_COMPOSITION_VERSION, '236-v3-composition-v1');
  const asset = createCharacterAsset();
  assert.ok(asset.measured.eyeHeightM > 1.4);
  const { composition: model } = composition();
  model.dispose();
});

test('compunerea nu poate fi pașită după eliberare', () => {
  const { composition: model } = composition();
  model.dispose();
  assert.throws(() => model.step({ tick: 1 }), /eliberată/);
  model.dispose();
});

test('D virează la dreapta din taste, simetric cu A', () => {
  const { composition: right } = composition();
  right.port.setAction('throttle', true);
  right.port.setAction('steerRight', true);
  for (let tick = 1; tick <= 30; tick += 1) right.step({ tick });
  const rightYaw = right.character().yawRad;
  right.dispose();

  const { composition: left } = composition();
  left.port.setAction('throttle', true);
  left.port.setAction('steerLeft', true);
  for (let tick = 1; tick <= 30; tick += 1) left.step({ tick });
  const leftYaw = left.character().yawRad;
  left.dispose();

  const start = Math.PI / 2;
  assert.ok(rightYaw > start + 1, `dreapta: yaw ${rightYaw}`);
  assert.ok(leftYaw < start - 1, `stânga: yaw ${leftYaw}`);
  assert.ok(Math.abs(rightYaw - start - (start - leftYaw)) < 1e-9);
});
