import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CITY_LAYOUT_DEFAULTS,
  createCityLayout,
  createCityLayoutReport,
  createLaneGraph,
  createNeighbourhoodMap,
  parseRoadMap,
  verifyCityAlignment,
} from '../../src/world';
import type { CityLayout, CityPlanarElement } from '../../src/world';

const map = createNeighbourhoodMap();
const layout = createCityLayout(map);

function cloneLayout(source: CityLayout): CityLayout {
  const parsed = JSON.parse(JSON.stringify(source)) as CityLayout;
  return parsed;
}
function marked(layoutValue: CityLayout): CityPlanarElement[] {
  return layoutValue.elements.filter(
    (element): element is CityPlanarElement => element.kind === 'LANE_MARKING',
  );
}

test('every rendered element is derived from the real 032 entities and no phantom geometry exists', () => {
  const report = createCityLayoutReport(layout);
  assert.equal(report.mapId, map.mapId);
  assert.equal(report.elements, layout.elements.length);
  assert.equal(report.phantomElementIds.length, 0);
  assert.equal(report.sourceCounts.LANE, map.lanes.length);
  assert.equal(report.sourceCounts.INTERSECTION, map.intersections.length);
  assert.equal(report.sourceCounts.SIGNAL, map.signals.length);
  assert.equal(report.sourceCounts.STOP_LINE, map.stopLines.length);
  assert.equal(report.sourceCounts.CROSSWALK, map.crosswalks.length);
  assert.equal(report.sourceCounts.SERVICE_ZONE, map.serviceZones.length);
  const unresolvedByType = new Map<string, number>();
  for (const entry of report.unrendered)
    unresolvedByType.set(entry.sourceType, (unresolvedByType.get(entry.sourceType) ?? 0) + 1);
  assert.deepEqual([...unresolvedByType.keys()].sort(), [
    'CONFLICT_ZONE',
    'MOVEMENT',
    'RECOVERY_POINT',
  ]);
  assert.equal(
    report.unrendered.every((entry) => entry.reason === 'SEMANTIC_ONLY'),
    true,
  );
  assert.equal(
    unresolvedByType.get('CONFLICT_ZONE'),
    map.intersections.reduce((sum, junction) => sum + junction.conflictZones.length, 0),
  );
  assert.equal(unresolvedByType.get('RECOVERY_POINT'), map.recoveryPoints.length);
  // Lanes, stop lines, crosswalks, services, intersections and signals are never silently omitted.
  assert.deepEqual(
    report.unrendered.filter((entry) =>
      ['LANE', 'STOP_LINE', 'CROSSWALK', 'SERVICE_ZONE', 'INTERSECTION', 'SIGNAL'].includes(
        entry.sourceType,
      ),
    ),
    [],
  );
  // Every element's source ids resolve to a declared entity or a derived block.
  for (const element of layout.elements)
    assert.ok(element.sourceIds.length > 0, `${element.id} has a source`);
});

test('all intersection types are traversed with the geometry their type requires', () => {
  const report = createCityLayoutReport(layout);
  assert.deepEqual(report.intersectionTypes, {
    SIGNALIZED: 4,
    STOP_CONTROLLED: 4,
    UNCONTROLLED: 17,
  });
  assert.deepEqual(report.roadClasses, { ARTERIAL: 32, RESIDENTIAL: 64 });
  for (const intersection of layout.intersections) {
    const stopLines = layout.elements.filter(
      (element) =>
        element.kind === 'STOP_LINE' && element.intersectionId === intersection.intersectionId,
    );
    const stopSigns = stopLines.filter(
      (element) => element.kind === 'STOP_LINE' && element.stopKind === 'STOP',
    );
    const signalLines = stopLines.filter(
      (element) => element.kind === 'STOP_LINE' && element.stopKind === 'SIGNAL',
    );
    if (intersection.type === 'SIGNALIZED') {
      assert.ok(intersection.signalId);
      assert.equal(signalLines.length, intersection.incomingLaneIds.length);
      assert.equal(stopSigns.length, 0);
      assert.equal(
        intersection.signalHeadIds.length,
        intersection.incomingLaneIds.length,
        'one head per incoming lane',
      );
      for (const headId of intersection.signalHeadIds) {
        const head = layout.elements.find((element) => element.id === headId);
        assert.equal(head?.kind, 'SIGNAL_HEAD');
      }
    } else if (intersection.type === 'STOP_CONTROLLED') {
      assert.equal(intersection.signalId, null);
      assert.equal(stopSigns.length, intersection.incomingLaneIds.length);
      assert.equal(signalLines.length, 0);
      assert.equal(intersection.signalHeadIds.length, 0);
    } else {
      assert.equal(intersection.signalId, null);
      assert.equal(stopLines.length, 0);
    }
    assert.ok(intersection.surfaceElementId.startsWith('surface:'));
    // Every crossing declares fourth-side crosswalks; bands and stop lines exist per leg.
    assert.ok(intersection.incomingLaneIds.length > 0);
  }
  const crosswalkLanes = new Set<string>();
  for (const element of layout.elements)
    if (element.kind === 'CROSSWALK') {
      const crosswalk = map.crosswalks.find((candidate) => candidate.id === element.crosswalkId)!;
      for (const laneId of crosswalk.laneIds) crosswalkLanes.add(laneId);
      assert.ok(element.stripeCount >= 2);
    }
  assert.equal(crosswalkLanes.size, map.lanes.length, 'every lane participates in a crossing');
});

test('rendered geometry matches the map, lane graph and signal placement within 1e-6 m', () => {
  const issues = verifyCityAlignment(map, layout);
  assert.deepEqual(issues, []);
  // The lane graph is an independent source: every marking centre projects back onto its lane.
  const graph = createLaneGraph(map);
  let markings = 0;
  for (const element of marked(layout)) {
    const laneId = element.laneId!;
    const path = graph.getDirectedPath(laneId);
    assert.ok(path, `${laneId} exists in the lane graph`);
    const center = element.footprintM.reduce(
      (sum, vertex) => ({
        x: sum.x + vertex.x / element.footprintM.length,
        z: sum.z + vertex.z / element.footprintM.length,
      }),
      { x: 0, z: 0 },
    );
    if (element.markingRole === 'CENTER_LINE') {
      // The centre line belongs to the opposing pair and lives in the painted buffer between them.
      const partnerId = element.sourceIds.find((id) => id !== laneId)!;
      const partner = graph.getDirectedPath(partnerId)!;
      const distanceTo = (points: readonly { x: number; z: number }[]): number => {
        const a = points[0]!;
        const b = points[points.length - 1]!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const length = Math.hypot(dx, dz);
        return Math.abs(((center.x - a.x) * dz - (center.z - a.z) * dx) / length);
      };
      const ownDistance = distanceTo(path.points);
      const partnerDistance = distanceTo(partner.points);
      const ownLane = map.lanes.find((candidate) => candidate.id === laneId)!;
      assert.ok(
        Math.abs(ownDistance - Math.abs(element.lateralOffsetM ?? 0)) <= 1e-6,
        `${element.id} lateral offset is the distance to its lane`,
      );
      assert.ok(
        ownDistance >= ownLane.widthM / 2 - 1e-6,
        `${element.id} stays outside the lane surface`,
      );
      assert.ok(
        Math.abs(ownDistance - partnerDistance) <= ownLane.widthM * 2,
        `${element.id} lies between the opposing pair`,
      );
      markings += 1;
      continue;
    }
    const projection = graph.projectOnLane(laneId, {
      positionM: { x: center.x, y: 0, z: center.z },
      access: 'CIVIL',
    });
    assert.ok(projection, `${element.id} projects onto ${laneId}`);
    assert.ok(
      Math.abs((projection.lateralOffsetM ?? Number.NaN) - (element.lateralOffsetM ?? 0)) <= 1e-6,
      `${element.id} lateral offset`,
    );
    assert.ok(
      projection.longitudinalM >= -1e-6 && projection.longitudinalM <= path.lengthM + 1e-6,
      `${element.id} lies inside the lane length`,
    );
    const lane = map.lanes.find((candidate) => candidate.id === laneId)!;
    assert.ok(Math.abs(element.lateralOffsetM ?? 0) <= lane.widthM / 2 + 1e-6);
    markings += 1;
  }
  assert.ok(markings > 0);
});

test('alignment verification fails on an offset lane, a wrong-lane marking and a missing/moved head', () => {
  const laneOffset = cloneLayout(layout);
  const surface = laneOffset.elements.find(
    (element) => element.kind === 'LANE_SURFACE' && element.laneId === 'lane:20E0',
  ) as CityPlanarElement;
  (surface as { footprintM: unknown }).footprintM = surface.footprintM.map((vertex) =>
    Object.freeze({ ...vertex, z: vertex.z + 0.05 }),
  );
  const offsetIssues = verifyCityAlignment(map, laneOffset);
  assert.ok(offsetIssues.some((issue) => issue.code === 'LANE_SURFACE_OFFSET'));

  const wrongLane = cloneLayout(layout);
  const marking = marked(wrongLane).find((element) => element.markingRole === 'EDGE_LINE')!;
  const otherLane = map.lanes.find((lane) => lane.id !== marking.laneId)!;
  (marking as { laneId: string }).laneId = otherLane.id;
  const wrongIssues = verifyCityAlignment(map, wrongLane);
  assert.ok(
    wrongIssues.some(
      (issue) => issue.code === 'MARKING_WRONG_LANE' || issue.code === 'MARKING_OUTSIDE_LANE',
    ),
  );

  const missingHead = cloneLayout(layout);
  const head = missingHead.elements.find((element) => element.kind === 'SIGNAL_HEAD')!;
  (missingHead as unknown as { elements: unknown[] }).elements = missingHead.elements.filter(
    (element) => element.id !== head.id,
  );
  const missingIssues = verifyCityAlignment(map, missingHead);
  assert.ok(missingIssues.some((issue) => issue.code === 'SIGNAL_HEAD_COUNT'));

  const movedHead = cloneLayout(layout);
  const moved = movedHead.elements.find((element) => element.kind === 'SIGNAL_HEAD')!;
  (moved as { positionM: unknown }).positionM = Object.freeze({
    x: (moved as { positionM: { x: number; z: number } }).positionM.x + 0.2,
    y: 0,
    z: (moved as { positionM: { x: number; z: number } }).positionM.z,
  });
  const movedIssues = verifyCityAlignment(map, movedHead);
  assert.ok(movedIssues.some((issue) => issue.code === 'SIGNAL_HEAD_OFFSET'));

  const phantom = cloneLayout(layout);
  (phantom.elements[0] as { sourceIds: unknown }).sourceIds = Object.freeze([
    'lane:does-not-exist',
  ]);
  assert.equal(createCityLayoutReport(phantom).phantomElementIds.length, 1);
});

test('buildings and sidewalks stay clear of the drivable surface', () => {
  const report = createCityLayoutReport(layout);
  assert.equal(report.blocks, 16);
  assert.ok(report.buildings >= 40, `buildings ${report.buildings}`);
  const boxes = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }>();
  const boxOf = (element: CityPlanarElement) => ({
    minX: Math.min(...element.footprintM.map((vertex) => vertex.x)),
    maxX: Math.max(...element.footprintM.map((vertex) => vertex.x)),
    minZ: Math.min(...element.footprintM.map((vertex) => vertex.z)),
    maxZ: Math.max(...element.footprintM.map((vertex) => vertex.z)),
  });
  for (const element of layout.elements)
    if (element.kind === 'LANE_SURFACE' || element.kind === 'INTERSECTION_SURFACE')
      boxes.set(element.id, boxOf(element));
  let checked = 0;
  for (const element of layout.elements) {
    if (element.kind !== 'BUILDING') continue;
    const box = boxOf(element);
    for (const drivable of boxes.values())
      assert.ok(
        box.minX >= drivable.maxX ||
          box.maxX <= drivable.minX ||
          box.minZ >= drivable.maxZ ||
          box.maxZ <= drivable.minZ,
        `${element.id} overlaps drivable surface`,
      );
    checked += 1;
  }
  assert.equal(checked, report.buildings);
  assert.ok(layout.elements.some((element) => element.kind === 'SIDEWALK'));
  assert.ok(layout.elements.some((element) => element.kind === 'CURB'));
  for (const block of layout.blocks)
    assert.equal(
      layout.elements.filter(
        (element) => element.kind === 'SIDEWALK' && element.blockId === block.blockId,
      ).length,
      4,
    );
});

test('layout derivation is deterministic, frozen and rejects invalid options', () => {
  const again = createCityLayout(parseRoadMap(map));
  assert.equal(JSON.stringify(again), JSON.stringify(layout));
  assert.equal(Object.isFrozen(layout), true);
  assert.equal(Object.isFrozen(layout.elements[0]), true);
  assert.equal(new Set(layout.elements.map((element) => element.id)).size, layout.elements.length);
  assert.equal(
    JSON.stringify(
      createCityLayoutReport(
        layout,
        layout.elements.map((element) => element.id),
      ).missingRenderedElementIds,
    ),
    '[]',
  );
  const narrowed = createCityLayout(map, { markingWidthM: 0.3 });
  assert.equal(narrowed.options.markingWidthM, 0.3);
  assert.equal(layout.options.markingWidthM, CITY_LAYOUT_DEFAULTS.markingWidthM);
  const widened = layout.elements.find(
    (element) => element.kind === 'LANE_MARKING' && element.markingRole === 'EDGE_LINE',
  ) as CityPlanarElement;
  const original = again.elements.find((element) => element.id === widened.id) as CityPlanarElement;
  assert.notEqual(widened.footprintM.length, 0);
  assert.ok(original.footprintM.length > 0);
  assert.throws(() => createCityLayout(map, { markingWidthM: -1 }));
  assert.throws(() => createCityLayout(map, { unknownOption: 1 } as never));
  const partial = createCityLayoutReport(
    layout,
    layout.elements.slice(0, 5).map((element) => element.id),
  );
  assert.equal(partial.missingRenderedElementIds.length, layout.elements.length - 5);
  const phantomRendered = createCityLayoutReport(layout, ['phantom']);
  assert.deepEqual(phantomRendered.unknownRenderedElementIds, ['phantom']);
});
