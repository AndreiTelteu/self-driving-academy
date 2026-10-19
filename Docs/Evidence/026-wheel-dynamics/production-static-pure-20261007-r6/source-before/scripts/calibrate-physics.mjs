import { braking, turning, impact } from '../tests/vehicles/physics-fixture.ts';
import { SEDAN } from '../src/vehicles/index.ts';
import { mkdir, writeFile } from 'node:fs/promises';
const brakes = [];
for (const grip of [1.3, 0.6])
  for (const speed of [10, 20, 30]) brakes.push(await braking(speed, { ...SEDAN, grip }));
brakes.push(await braking(20, { ...SEDAN, brakeAcceleration: 4 }));
const turns = [];
for (const grip of [1.3, 0.6]) for (const speed of [8, 20]) turns.push(await turning(speed, grip));
const impacts = [];
for (const kind of ['curb', 'cars', 'wall']) impacts.push(await impact(kind));
await mkdir('Evidence/021', { recursive: true });
await writeFile(
  'Evidence/021/calibration.json',
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      physics: '0.21.0',
      fixture: '021-calibration-v1',
      brakes,
      turns,
      impacts,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      brakes: brakes.map(({ speed, tuning, distance, stopped }) => ({
        speed,
        grip: tuning.grip,
        brake: tuning.brakeAcceleration,
        distance,
        stopped,
      })),
      turns: turns.map(({ initialSpeed, grip, maxLateralSpeed }) => ({
        initialSpeed,
        grip,
        maxLateralSpeed,
      })),
      impacts: impacts.map(({ kind, maxHeight, maxContacts, final }) => ({
        kind,
        maxHeight,
        maxContacts,
        z: final.position.z,
      })),
    },
    null,
    2,
  ),
);
