import { access, mkdir, writeFile } from 'node:fs/promises';
import { calibrateWheels } from '../tests/vehicles/wheel-dynamics-fixture.ts';
const destination = `Docs/Evidence/026-wheel-dynamics/${process.argv[2] ?? 'calibration-v2.json'}`;
try {
  await access(destination);
  throw new Error('Immutable wheel calibration already exists');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const runs = [];
for (const classId of ['sedan', 'compact'])
  for (const surface of ['dry-asphalt', 'reduced-adhesion']) {
    for (const speed of [10, 20, 30])
      runs.push(await calibrateWheels(classId, surface, speed, 'braking'));
    for (const speed of [8, 20])
      runs.push(await calibrateWheels(classId, surface, speed, 'turning'));
    for (const scenario of ['curb', 'airborne'])
      runs.push(await calibrateWheels(classId, surface, 10, scenario));
  }
await mkdir('Docs/Evidence/026-wheel-dynamics', { recursive: true });
await writeFile(
  destination,
  JSON.stringify(
    { capturedAt: new Date().toISOString(), fixture: '026-flat-surfaces-calibration-v1', runs },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    runs.map(
      ({
        classId,
        surface,
        speedMps,
        scenario,
        brakingDistanceM,
        maxLateralMps,
        maxHeightM,
        minContacts,
        maxContacts,
      }) => ({
        classId,
        surface,
        speedMps,
        scenario,
        brakingDistanceM,
        maxLateralMps,
        maxHeightM,
        minContacts,
        maxContacts,
      }),
    ),
    null,
    2,
  ),
);
