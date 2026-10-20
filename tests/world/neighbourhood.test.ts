import assert from 'node:assert/strict';
import test from 'node:test';
import { createNeighbourhoodMap, parseRoadMap } from '../../src/world';
import type { RoadAccess } from '../../src/world';
import { createEventBus } from '../../src/simulation';
import { createSignalController } from '../../src/world/signals';

const context = {
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'neighbourhood-test',
  worldEpoch: 0,
};

test('authored neighbourhood is a deterministic, valid PBI032 document', () => {
  const first = createNeighbourhoodMap();
  const second = createNeighbourhoodMap();
  assert.equal(JSON.stringify(first), JSON.stringify(second), 'generation is deterministic');
  assert.deepEqual(parseRoadMap(first), first, 'document is already validated/frozen');
  assert.equal(first.mapId, 'neighbourhood-compact-v1');
  assert.equal(first.lanes.length, 96);
  assert.equal(first.intersections.length, 25);
  assert.equal(first.signals.length, 4);
  assert.equal(first.crosswalks.length, 80);
  assert.equal(first.serviceZones.length, 16);
  assert.ok(first.stopLines.length >= 100);
  assert.equal(new Set(first.lanes.map((lane) => lane.id)).size, first.lanes.length);
});

test('road contexts are derivable from map data for arterial and residential streets', () => {
  const map = createNeighbourhoodMap();
  const speeds = new Set(map.lanes.map((lane) => lane.speedLimitMps));
  assert.deepEqual(
    [...speeds].sort((a, b) => a - b),
    [11.2, 13.4],
  );
  const arterial = map.lanes.filter(
    (lane) => lane.neighbors.left !== null || lane.neighbors.right !== null,
  );
  assert.equal(arterial.length, 32, 'two-lane arterial segments declare lateral neighbours');
  for (const lane of arterial) assert.equal(lane.widthM, 3.4);
  // Opposite directions never share the same centre line.
  const pairs = new Map<string, number[]>();
  for (const lane of map.lanes) {
    const path = map.geometry.paths.find((candidate) => candidate.id === lane.geometryId)!;
    const nodes = path.nodeIds.map(
      (id) => map.geometry.nodes.find((node) => node.id === id)!.positionM,
    );
    const start = nodes[0]!;
    const end = nodes[nodes.length - 1]!;
    const horizontal = Math.abs(end.x - start.x) > Math.abs(end.z - start.z);
    const key = [lane.fromIntersectionId, lane.toIntersectionId].sort().join('|');
    const values = pairs.get(key) ?? [];
    values.push(horizontal ? start.z : start.x);
    pairs.set(key, values);
  }
  for (const values of pairs.values()) {
    const sorted = [...values].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index += 1)
      assert.ok(sorted[index]! - sorted[index - 1]! >= 3.4, 'lane centres never overlap');
  }
});

test('every intersection type exists and stop/signal lines match the declared controller', () => {
  const map = createNeighbourhoodMap();
  const classify = (intersectionId: string): string => {
    const signal = map.signals.some((candidate) => candidate.intersectionId === intersectionId);
    if (signal) return 'SIGNALIZED';
    const stop = map.stopLines.some(
      (line) =>
        line.intersectionId === intersectionId && (line.kind === 'STOP' || line.kind === 'SIGNAL'),
    );
    return stop ? 'STOP_CONTROLLED' : 'UNCONTROLLED';
  };
  const counts = { SIGNALIZED: 0, STOP_CONTROLLED: 0, UNCONTROLLED: 0 };
  for (const intersection of map.intersections)
    counts[classify(intersection.id) as keyof typeof counts] += 1;
  assert.deepEqual(counts, { SIGNALIZED: 4, STOP_CONTROLLED: 4, UNCONTROLLED: 17 });
  for (const signal of map.signals) {
    const intersection = map.intersections.find(
      (candidate) => candidate.id === signal.intersectionId,
    )!;
    const signalLines = map.stopLines.filter(
      (line) => line.intersectionId === intersection.id && line.kind === 'SIGNAL',
    );
    assert.equal(signalLines.length, intersection.incomingLaneIds.length);
    for (const line of signalLines) assert.equal(line.signalId, signal.id);
  }
  for (const [index, intersection] of map.intersections.entries()) {
    if (classify(intersection.id) !== 'STOP_CONTROLLED') continue;
    const stopLines = map.stopLines.filter((line) => line.intersectionId === intersection.id);
    assert.equal(stopLines.length, intersection.incomingLaneIds.length);
    for (const line of stopLines) {
      assert.equal(line.kind, 'STOP');
      assert.equal(line.signalId, null);
    }
    assert.equal(index >= 0, true);
  }
});

test('the signal controller accepts every authored program and greens each movement once', () => {
  const map = createNeighbourhoodMap();
  const controller = createSignalController(map, {
    context,
    eventBus: createEventBus(context),
  });
  const stats = controller.getStats();
  assert.equal(stats.signals, 4);
  assert.ok(stats.phases >= 4);
  const greenPhases = new Map<string, number>();
  for (const signal of map.signals)
    for (const phase of signal.phases)
      for (const state of phase.movementStates)
        if (state.state === 'GREEN')
          greenPhases.set(state.movementId, (greenPhases.get(state.movementId) ?? 0) + 1);
  const signalizedMovements = map.intersections
    .filter((intersection) =>
      map.signals.some((signal) => signal.intersectionId === intersection.id),
    )
    .flatMap((intersection) => intersection.movements.map((movement) => movement.id));
  assert.ok(signalizedMovements.length > 0);
  for (const movementId of signalizedMovements)
    assert.equal(greenPhases.get(movementId), 1, `${movementId} has one GREEN phase`);
  assert.ok(Math.max(...greenPhases.values()) === 1);
  for (const intersection of map.intersections) {
    const signal = map.signals.find((candidate) => candidate.intersectionId === intersection.id);
    if (!signal) continue;
    for (const phase of signal.phases)
      assert.equal(phase.movementStates.length, intersection.movements.length);
    // Tick zero states are readable per movement and match the authored first phase.
    const firstPhase = signal.phases[0]!;
    for (const state of firstPhase.movementStates) {
      const query = controller.getMovementSignal(intersection.id, state.movementId);
      assert.equal(query?.state, state.state);
    }
  }
  assert.equal(
    controller.getMovementSignal(map.intersections[0]!.id, 'unknown'),
    null,
    'unknown movement never defaults to GREEN',
  );
});

test('both access classes can reach every service zone through authored successors', () => {
  const map = createNeighbourhoodMap();
  const reverse = new Map<string, string[]>();
  for (const lane of map.lanes) reverse.set(lane.id, []);
  for (const lane of map.lanes)
    for (const next of lane.successorIds) reverse.get(next)?.push(lane.id);
  for (const access of ['TAXI', 'CIVIL'] as const satisfies readonly RoadAccess[]) {
    const allowed = new Set(
      map.lanes.filter((lane) => lane.access.includes(access)).map((lane) => lane.id),
    );
    for (const zone of map.serviceZones) {
      if (!zone.access.includes(access)) continue;
      const seen = new Set([zone.laneId]);
      const queue = [zone.laneId];
      for (let head = 0; head < queue.length; head += 1)
        for (const previous of reverse.get(queue[head]!)!) {
          if (!allowed.has(previous) || seen.has(previous)) continue;
          seen.add(previous);
          queue.push(previous);
        }
      assert.equal(seen.size, allowed.size, `${zone.id} reachable for ${access}`);
    }
  }
  const kinds = new Set(map.serviceZones.map((zone) => zone.kind));
  assert.deepEqual([...kinds].sort(), ['BOTH', 'DROPOFF', 'PICKUP']);
  const access = new Set(map.serviceZones.map((zone) => zone.access.join('+')));
  assert.ok(access.has('TAXI+CIVIL') && access.has('TAXI') && access.has('CIVIL'));
});
