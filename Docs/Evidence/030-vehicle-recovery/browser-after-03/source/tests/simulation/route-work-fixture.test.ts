import test from 'node:test';
import assert from 'node:assert/strict';
import { roadContextFixture } from '../autonomy/road-context-reference';
import { syntheticRouteSearch } from './scheduling-reference';
import { syntheticRouteTask } from './route-work-fixture';

test('cooperative synthetic route jobs match original exact path/blocked reference across all fixture lane pairs', () => {
  const fixture = roadContextFixture(false),
    lanes = fixture.map.lanes.map((lane) => lane.id);
  for (const blocked of [new Set<string>(), new Set([lanes[3]])])
    for (const origin of lanes)
      for (const destination of lanes) {
        const task = syntheticRouteTask(fixture.graph, origin, destination, blocked);
        let result: ReturnType<typeof task.step> = { done: false, path: null };
        try {
          for (let tick = 1; tick <= 64 && !result.done; tick++)
            result = task.step({ tick, maxExpansions: 1 });
          assert.equal(result.done, true);
          assert.deepEqual(
            result.path,
            syntheticRouteSearch(fixture.graph, origin, destination, blocked),
          );
        } finally {
          task.dispose();
        }
        assert.throws(() => task.step({ tick: 65, maxExpansions: 1 }));
      }
});
