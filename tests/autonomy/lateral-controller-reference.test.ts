import assert from 'node:assert/strict';
import test from 'node:test';
import { createLaneGraph } from '../../src/world/lane-graph';
import {
  fixtureSpeedCommand,
  lateralFixture,
  referenceLateral,
} from './lateral-controller-reference';

test('049 preproduction reference uses actual033 directed geometry and explicit separate speed fixture', () => {
  const graphs = Array.from({ length: 110 }, (_, i) => createLaneGraph(lateralFixture(1, i)));
  assert.equal(graphs.length, 110);
  assert(graphs.every((graph) => graph.getStats().lanes === 1));
  const graph = graphs[0];
  const path = graph.getDirectedPath('lane-0')!;
  assert.equal(path.points.length, 65);
  assert.deepEqual(graph.getTurnConnections('lane-0', 'CIVIL'), []);
  assert.equal(graph.getLane('lane-0', 'CIVIL')?.geometryId, 'geometry-0');
  const result = referenceLateral(path.points, path.points[0], { x: 0, z: 1 }, 3, 2.7, 0.45);
  assert(result.steering < 0 && result.steering > -1);
  assert.equal(result.crossTrackM, 0);
  assert(Math.abs(result.curvaturePerM + 1 / 16) < 0.005);
  assert.deepEqual(fixtureSpeedCommand(3, 4), { throttle: 0, brake: 0.3 });
  assert(fixtureSpeedCommand(3, 2).throttle > 0);
});
