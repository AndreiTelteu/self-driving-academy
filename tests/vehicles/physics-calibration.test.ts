import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calibrateController } from './physics-calibration-fixture';
import { calibrateWheels } from './wheel-dynamics-fixture';

for (const classId of ['sedan', 'compact'] as const) {
  test(`031 ${classId}: controller braking preserves026 physical reference and source parity`, async () => {
    const reference = await calibrateWheels(classId, 'dry-asphalt', 20, 'braking');
    const player = await calibrateController(classId, 'dry-asphalt', 'braking', 20, 'PLAYER');
    const autonomy = await calibrateController(classId, 'dry-asphalt', 'braking', 20, 'AUTONOMY');
    assert.deepEqual(player.final, reference.final);
    assert.deepEqual(player.trace, autonomy.trace);
    assert(
      player.trace.every(
        (row) => row.effective.throttle === 0 && row.drivetrain?.physicalInput.brake === 1,
      ),
    );
    assert.equal(player.cleanup.bodies.entities, 0);
    assert.equal(autonomy.cleanup.collisions.colliders, 0);
  });
  test(`031 ${classId}: native lane-change/contact parity includes entire second-body response`, async () => {
    for (const scenario of ['lane-change', 'two-cars'] as const) {
      const speed = scenario === 'lane-change' ? 8 : 10;
      const player = await calibrateController(
        classId,
        'reduced-adhesion',
        scenario,
        speed,
        'PLAYER',
      );
      const autonomy = await calibrateController(
        classId,
        'reduced-adhesion',
        scenario,
        speed,
        'AUTONOMY',
      );
      assert.deepEqual(player.trace, autonomy.trace);
      if (scenario === 'two-cars') {
        assert(player.contactImpulseNs > player.mechanics.massKg);
        assert(
          player.trace.some((row) =>
            row.contacts.contacts.some(
              (contact) => contact.first.entityId === 'car' && contact.second.entityId === 'other',
            ),
          ),
        );
        assert(player.trace.at(-1)!.other!.position.z > 12);
      } else assert(player.displacementM.x > 0.5 && Math.abs(player.headingRad) < 0.6);
    }
  });
}
