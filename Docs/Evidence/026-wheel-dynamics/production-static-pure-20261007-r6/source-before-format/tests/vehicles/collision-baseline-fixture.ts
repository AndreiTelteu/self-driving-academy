import { manyContacts } from './physics-fixture';

/** Existing native021 workload, unchanged for before/after contact-query comparison. */
export const COLLISION_FIXTURE = Object.freeze({
  version: '028-legacy-native-contacts-v1',
  warmupTicks: 100,
  measuredTicks: 600,
  repetitions: 5,
  sampleCapacity: 600,
  normalVehicles: 70,
  denseVehicles: 110,
  anonymousObstacles: 67,
});

export async function collisionBaselineFixture(dense: boolean) {
  const vehicles = dense ? COLLISION_FIXTURE.denseVehicles : COLLISION_FIXTURE.normalVehicles;
  const fixture = await manyContacts(vehicles);
  const counts = fixture.world.counts();
  if (
    counts.vehicles !== vehicles ||
    counts.bodies !== vehicles + 64 ||
    counts.colliders !== vehicles + 68
  ) {
    fixture.world.dispose();
    throw new Error('028 legacy fixture admission changed');
  }
  return fixture;
}
