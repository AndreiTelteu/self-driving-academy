import { manyContacts } from '../../vehicles/physics-fixture';

/** Compatibility arm is the unchanged 022 workload. Mixed arm uses explicit 023 classes. */
export async function classContacts(mode: 'default' | 'mixed') {
  const fixture = await manyContacts(70);
  if (mode === 'mixed') {
    for (let i = 0; i < 70; i++) fixture.world.removeBody(fixture.world.bodyIdentity(`car-${i}`)!);
    for (let i = 0; i < 70; i++)
      fixture.world.addClassCar(
        `car-${i}`,
        {
          x: (i % 10) * 2.2 - 10,
          y: 0.8,
          z: Math.floor(i / 10) * 4.15,
        },
        i % 2 ? 'compact' : 'sedan',
      );
  }
  return fixture;
}
