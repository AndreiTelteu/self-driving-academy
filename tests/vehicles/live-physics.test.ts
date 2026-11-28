import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createLiveVehiclePhysics,
  issueRecoveryRoad,
  type LiveVehiclePhysics,
  type LiveVehiclePhysicsOptions,
  type LiveVehicleRegistration,
} from '../../src/vehicles';
import type { ContractContext } from '../../src/sessions';

const CONTEXT: ContractContext = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '282-live-physics-test',
  worldEpoch: 1,
});

async function withWorld<T>(
  work: (physics: LiveVehiclePhysics) => T | Promise<T>,
  options: Partial<Omit<LiveVehiclePhysicsOptions, 'context' | 'initialTick'>> = {},
): Promise<T> {
  const physics = await createLiveVehiclePhysics({ context: CONTEXT, initialTick: 0, ...options });
  try {
    return await work(physics);
  } finally {
    physics.dispose();
  }
}

function registration(
  vehicleId: string,
  classId: 'sedan' | 'compact',
  z: number,
  options: Partial<LiveVehicleRegistration> = {},
): LiveVehicleRegistration {
  return Object.freeze({
    vehicleId,
    classId,
    positionM: Object.freeze({ x: 0, y: 0, z }),
    yawRad: 0,
    speedMps: 0,
    access: 'TAXI' as const,
    isTraffic: false,
    ...options,
  });
}

function command(
  vehicleId: string,
  source: 'PLAYER' | 'AUTONOMY',
  values: Partial<{
    throttle: number;
    brake: number;
    steering: number;
    handbrake: boolean;
  }> = {},
) {
  return Object.freeze({
    vehicleId,
    source,
    throttle: 0,
    brake: 0,
    steering: 0,
    handbrake: false,
    turnSignal: 'OFF' as const,
    ...values,
  });
}

test('PLAYER and AUTONOMY supply bit-identical commands through the same controller', async () => {
  const run = async (source: 'PLAYER' | 'AUTONOMY', mode: 'MANUAL' | 'AUTO') =>
    withWorld((physics) => {
      physics.registerVehicle(registration('car', 'sedan', 0));
      physics.setAuthority('car', mode);
      const trace: number[][] = [];
      for (let tick = 1; tick <= 360; tick++) {
        const values = {
          throttle: tick < 100 ? 0.8 : 0,
          brake: tick >= 150 && tick < 210 ? 0.9 : 0,
          steering: tick >= 100 && tick < 160 ? 0.35 : tick >= 220 && tick < 260 ? -0.4 : 0,
        };
        const frame = physics.step({
          tick,
          commands: [command('car', source, values)],
          traffic: [],
          measure: false,
        });
        const v = frame.vehicles[0]!;
        trace.push([
          v.positionM.x,
          v.positionM.z,
          v.yawRad,
          v.speedMps,
          v.wheelContacts,
          ...v.wheels.map((wheel) => wheel.spinRad),
        ]);
        assert.equal(v.availability, 'AVAILABLE');
      }
      assert.equal(physics.getStats().controller.fault, null);
      return trace;
    });
  const play = await run('PLAYER', 'MANUAL');
  const auto = await run('AUTONOMY', 'AUTO');
  assert.deepEqual(play, auto);
});

test('sedan and compact differ in braking and turning on the same dry surface', async () => {
  const measurements: Record<string, { brake: number; yaw: number }> = {};
  for (const classId of ['sedan', 'compact'] as const) {
    const brake = await withWorld((physics) => {
      physics.registerVehicle(registration('car', classId, 0, { speedMps: 20 }));
      physics.setAuthority('car', 'MANUAL');
      const origin = physics.readVehicle('car')!.positionM;
      let tick = physics.getStats().tick,
        brakeTicks = 0;
      while (physics.readVehicle('car')!.speedMps > 0.1 && brakeTicks < 1800) {
        tick += 1;
        brakeTicks += 1;
        physics.step({
          tick,
          commands: [command('car', 'PLAYER', { brake: 1 })],
          traffic: [],
          measure: false,
        });
      }
      const braked = physics.readVehicle('car')!;
      return Math.hypot(braked.positionM.x - origin.x, braked.positionM.z - origin.z);
    });
    const turn = await withWorld((physics) => {
      physics.registerVehicle(registration('car', classId, 0, { speedMps: 12 }));
      physics.setAuthority('car', 'MANUAL');
      const yawBefore = physics.readVehicle('car')!.yawRad;
      let turnTick = physics.getStats().tick;
      for (let index = 0; index < 180; index++) {
        turnTick += 1;
        physics.step({
          tick: turnTick,
          commands: [command('car', 'PLAYER', { steering: 0.35 })],
          traffic: [],
          measure: false,
        });
      }
      return Math.abs(physics.readVehicle('car')!.yawRad - yawBefore);
    });
    measurements[classId] = { brake, yaw: turn };
  }
  assert(measurements.sedan!.brake > measurements.compact!.brake);
  assert(measurements.compact!.yaw > measurements.sedan!.yaw);
  assert(measurements.sedan!.brake > 1);
  assert(measurements.compact!.brake > 1);
});

test('real contact produces damage without pass-through or teleport', async () => {
  await withWorld((physics) => {
    physics.registerVehicle(registration('rear', 'sedan', 0, { speedMps: 14 }));
    physics.registerVehicle(registration('front', 'compact', 10));
    physics.setAuthority('rear', 'MANUAL');
    let tick = physics.getStats().tick,
      incidentTick = -1,
      maxContacts = 0;
    for (let index = 0; index < 300 && incidentTick < 0; index++) {
      tick += 1;
      const frame = physics.step({
        tick,
        commands: [command('rear', 'PLAYER', { throttle: 0.2 })],
        traffic: [],
        measure: false,
      });
      maxContacts = Math.max(maxContacts, frame.collisions.contacts);
      if (frame.collisions.incidents > 0) incidentTick = tick;
    }
    assert(incidentTick > 0);
    assert(maxContacts > 0);
    const rear = physics.readVehicle('rear')!,
      front = physics.readVehicle('front')!;
    assert.notEqual(rear.availability, 'AVAILABLE');
    assert.notEqual(front.availability, 'AVAILABLE');
    assert(rear.damage.lastIncidentId !== null);
    const gap = Math.abs(front.positionM.z - rear.positionM.z);
    assert(gap > 3.7, `center gap ${gap.toFixed(3)} m`);
    assert.equal(rear.wheelContacts, 4);
    assert.equal(front.wheelContacts, 4);
  });
});

test('static building contact is a named incident and damages the car', async () => {
  await withWorld(
    (physics) => {
      physics.registerVehicle(registration('car', 'sedan', 0, { speedMps: 12 }));
      physics.setAuthority('car', 'MANUAL');
      let tick = physics.getStats().tick,
        incident = 0;
      for (let index = 0; index < 240 && incident === 0; index++) {
        tick += 1;
        const frame = physics.step({
          tick,
          commands: [command('car', 'PLAYER', { throttle: 0.4 })],
          traffic: [],
          measure: false,
        });
        incident = frame.collisions.incidents;
      }
      assert(incident > 0);
      const car = physics.readVehicle('car')!;
      assert.notEqual(car.availability, 'AVAILABLE');
      assert(car.positionM.z < 10);
      assert.equal(car.wheelContacts, 4);
    },
    {
      staticBoxes: [
        {
          id: 'wall',
          centerM: { x: 0, y: 1, z: 10 },
          halfExtentsM: { x: 4, y: 1, z: 0.2 },
        },
      ],
    },
  );
});

test('explicit recovery is a native lane placement, zeroes velocity and records 029/030 history', async () => {
  const road = issueRecoveryRoad({
    mapId: '282-test-map',
    laneId: 'lane-east',
    access: 'TAXI',
    start: { x: -40, y: 0, z: 0 },
    end: { x: 40, y: 0, z: 0 },
    widthM: 6,
  });
  await withWorld(
    (physics) => {
      physics.registerVehicle(
        registration('car', 'sedan', 0, { yawRad: Math.PI / 2, speedMps: 8 }),
      );
      physics.setAuthority('car', 'MANUAL');
      let tick = physics.getStats().tick;
      for (let index = 0; index < 30; index++) {
        tick += 1;
        physics.step({
          tick,
          commands: [command('car', 'PLAYER', { throttle: 0.3, steering: 0.25 })],
          traffic: [],
          measure: false,
        });
      }
      assert(physics.requestRecovery({ vehicleId: 'car', mode: 'MANUAL', tick, origin: 'R' }));
      const result = physics.commitRecovery(tick);
      assert(result?.status === 'COMPLETED', result?.failure ?? 'no result');
      assert.equal(result?.record?.status, 'COMPLETED');
      assert.equal(result?.record?.kind, 'TELEPORT');
      assert.equal(result?.record?.learningEligible, false);
      const after = physics.readVehicle('car')!;
      assert(Math.abs(after.speedMps) < 0.01);
      assert(Math.abs(after.positionM.z) < 0.05);
      assert.equal(after.availability, 'AVAILABLE');
      assert.equal(physics.readRecoveryHistory().length, 1);
      assert.equal(physics.readRecovery().status, 'COMPLETED');
      assert.equal(physics.getStats().damage.historyRecords, 1);
    },
    { recovery: { locate: () => road } },
  );
});

test('nearest kinematic 058 proxy blocks the dynamic car without a body pass-through', async () => {
  await withWorld((physics) => {
    physics.registerVehicle(registration('car', 'sedan', 0, { speedMps: 10 }));
    physics.setAuthority('car', 'MANUAL');
    let tick = physics.getStats().tick;
    for (let index = 0; index < 180; index++) {
      tick += 1;
      physics.step({
        tick,
        commands: [command('car', 'PLAYER', { throttle: 0.5 })],
        traffic: [
          {
            vehicleId: 'civil-proxy',
            positionM: { x: 0, y: 0, z: 10 },
            yawRad: 0,
          },
        ],
        focusPositionM: { x: 0, y: 0, z: 0 },
        measure: false,
      });
    }
    const car = physics.readVehicle('car')!;
    assert(car.positionM.z < 9.5, `proxy overlap at z=${car.positionM.z}`);
    assert(car.positionM.z > 5.5, `passed through the proxy at z=${car.positionM.z}`);
    assert.equal(physics.getStats().trafficProxies, 1);
  });
});
