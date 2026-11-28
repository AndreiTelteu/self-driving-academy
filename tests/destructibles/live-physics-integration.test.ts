import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCompositionWorld } from '../../src/app/composition-world';
import { createLiveChaos } from '../../src/app/live-chaos';
import type { LiveChaos } from '../../src/app/live-chaos';
import { createLiveVehiclePhysics } from '../../src/vehicles';
import type { CollisionIncident, LiveVehiclePhysics } from '../../src/vehicles';

const world = createCompositionWorld();

function command(vehicleId: string) {
  return Object.freeze({
    vehicleId,
    source: 'AUTONOMY' as const,
    throttle: 0.25,
    brake: 0,
    steering: 0,
    handbrake: false,
    turnSignal: 'OFF' as const,
  });
}

test('285 a real 282 solver contact with a bound 227 object produces the live destruction', async () => {
  const physics: LiveVehiclePhysics = await createLiveVehiclePhysics({
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: '285-physics-integration',
      worldEpoch: 1,
    }),
    initialTick: 0,
  });
  const chaos: LiveChaos = createLiveChaos({
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: '285-physics-integration',
      worldEpoch: 1,
    }),
    layout: world.layout,
    physics,
    clock: () => 0,
    now: () => '2026-11-28T00:00:00.000Z',
  });
  try {
    const target = chaos.plan.definitions.find((entry) => entry.archetype === 'CONE')!;
    const position = target.initialTransform.positionM;
    // The alley runs along +X: start 14 m behind the cone, heading +X, rolling at 8 m/s.
    const startX = position.x - 14;
    physics.registerVehicle({
      vehicleId: 'taxi-285',
      classId: 'sedan',
      positionM: Object.freeze({ x: startX, y: 0, z: position.z }),
      yawRad: Math.PI / 2,
      speedMps: 8,
      access: 'TAXI',
      isTraffic: false,
    });
    physics.setAuthority('taxi-285', 'AUTO');
    const sample = (tick: number) => {
      const state = physics.readVehicle('taxi-285')!;
      return {
        tick,
        vehicles: [
          {
            vehicleId: 'taxi-285',
            driverKind: 'TAXI' as const,
            positionM: state.positionM,
            yawRad: state.yawRad,
            speedMps: state.speedMps,
            controlMode: 'AUTO' as const,
            isPlayer: true,
          },
        ],
        listenerPositionM: state.positionM,
      };
    };
    // Bind the nearest logical objects in the same window the composition uses.
    chaos.step(sample(1));
    let incident: CollisionIncident | null = null;
    for (let tick = 1; tick <= 240 && incident === null; tick += 1) {
      physics.step({ tick, commands: [command('taxi-285')], traffic: [], measure: false });
      const incidents = physics.readIncidents();
      chaos.step(sample(tick));
      const found = incidents.find((entry) => entry.otherEntityId.startsWith('destructible:'));
      if (found !== undefined) incident = found;
    }
    assert.notEqual(incident, null, 'the car must reach a bound object');
    const hitId = incident!.otherEntityId.slice('destructible:'.length);
    const state = chaos.decor.getState(hitId).state;
    assert.notEqual(state, 'INTACT');
    const stats = chaos.getStats();
    assert(stats.impacts >= 1);
    assert(stats.recorder.incidentsRegistered >= 1);
    assert(stats.bus.watermarkTick >= 1);
  } finally {
    chaos.dispose();
    physics.dispose();
  }
});
