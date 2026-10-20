import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkMapIntegrity,
  createNeighbourhoodMap,
  MAP_INTEGRITY_CHECKS,
  MAP_INTEGRITY_REASONS,
  MAP_INTEGRITY_VERSION,
} from '../../src/world';
import type { MapIntegrityIssue } from '../../src/world';

interface MutableLane {
  id: string;
  geometryId: string;
  direction: string;
  widthM: number;
  speedLimitMps: number;
  access: string[];
  neighbors: { left: string | null; right: string | null };
  successorIds: string[];
  fromIntersectionId: string | null;
  toIntersectionId: string | null;
}

interface MutableSignal {
  id: string;
  intersectionId: string;
  phases: {
    id: string;
    durationS: number;
    movementStates: { movementId: string; state: string }[];
  }[];
}

interface MutableServiceZone {
  id: string;
  geometryId: string;
  laneId: string;
  anchorNodeId: string;
  access: string[];
  kind: string;
}

interface MutableMap {
  schemaVersion: number;
  mapId: string;
  lanes: MutableLane[];
  signals: MutableSignal[];
  serviceZones: MutableServiceZone[];
}

const authored = createNeighbourhoodMap();

function mutable(): MutableMap {
  return JSON.parse(JSON.stringify(authored)) as MutableMap;
}

function reportFor(map: unknown) {
  return checkMapIntegrity(map, { maxIssues: 256 });
}

function findIssue(
  issues: readonly MapIntegrityIssue[],
  reason: MapIntegrityIssue['reason'],
  path?: string,
): MapIntegrityIssue {
  const match = issues.find(
    (issue) => issue.reason === reason && (path === undefined || issue.path === path),
  );
  assert.ok(match, `expected ${reason}${path ? ` at ${path}` : ''}; got ${JSON.stringify(issues)}`);
  return match;
}

test('the authored neighbourhood passes every integrity check with full scenario coverage', () => {
  const report = reportFor(authored);
  assert.equal(report.version, MAP_INTEGRITY_VERSION);
  assert.equal(report.mapId, 'neighbourhood-compact-v1');
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.schemaError, null);
  assert.equal(report.ok, true);
  assert.equal(report.issueCount, 0);
  assert.deepEqual(report.issues, []);
  assert.deepEqual(report.errorsByReason, {});
  assert.equal(report.truncated, false);

  assert.equal(report.coverage.checks.length, MAP_INTEGRITY_CHECKS.length);
  for (const check of report.coverage.checks) {
    assert.equal(check.status, 'PASS', `${check.id} must pass`);
    assert.ok(check.examined > 0, `${check.id} must examine authored data`);
    assert.equal(check.issues, 0);
  }

  assert.equal(report.coverage.entityCounts.lanes, 96);
  assert.equal(report.coverage.entityCounts.intersections, 25);
  assert.equal(report.coverage.entityCounts.signals, 4);
  assert.equal(report.coverage.entityCounts.crosswalks, 80);
  assert.equal(report.coverage.entityCounts.serviceZones, 16);
  assert.equal(report.coverage.entityCounts.stopLines, 234);
  assert.equal(report.coverage.entityCounts.recoveryPoints, 6);
  assert.equal(
    report.coverage.entityCounts.movements,
    authored.intersections.reduce((sum, junction) => sum + junction.movements.length, 0),
  );
  assert.equal(report.coverage.entityCounts.nodes, authored.geometry.nodes.length);
  assert.equal(report.coverage.entityCounts.paths, authored.geometry.paths.length);
  assert.equal(report.coverage.entityCounts.areas, authored.geometry.areas.length);

  assert.deepEqual(report.coverage.scenarios.intersectionTypes, {
    SIGNALIZED: 4,
    STOP_CONTROLLED: 4,
    UNCONTROLLED: 17,
  });
  assert.deepEqual(report.coverage.scenarios.roadClasses, { ARTERIAL: 32, RESIDENTIAL: 64 });
  assert.deepEqual(report.coverage.scenarios.stopLineKinds, {
    STOP: 16,
    SIGNAL: 26,
    CROSSWALK: 192,
  });
  assert.deepEqual(report.coverage.scenarios.serviceZoneAccess, {
    TAXI: 1,
    CIVIL: 1,
    'TAXI+CIVIL': 14,
  });
  assert.equal(report.coverage.scenarios.pickupDropoffZones, 16);
  assert.equal(report.coverage.scenarios.routablePickupDropoffZones, 16);
  assert.equal(report.coverage.scenarios.recoveryPoints, 6);

  assert.equal(report.coverage.connectivity.stronglyConnectedComponents, 1);
  assert.equal(report.coverage.connectivity.weaklyConnectedComponents, 1);
  assert.equal(report.coverage.connectivity.largestComponentLanes, 96);
  assert.deepEqual(report.coverage.connectivity.disconnectedLaneIds, []);
  for (const access of ['TAXI', 'CIVIL'] as const) {
    const coverage = report.coverage.connectivity.byAccess[access];
    assert.equal(coverage.lanes, 96);
    assert.equal(coverage.unreachableLaneZonePairs, 0);
    assert.deepEqual(coverage.unreachableLaneIds, []);
  }

  assert.equal(report.coverage.routing.requested, 2880);
  assert.equal(report.coverage.routing.ready, 2880);
  assert.equal(report.coverage.routing.failed, 0);
  assert.equal(report.coverage.routing.routablePickupDropoffZones.length, 16);
  assert.deepEqual(report.coverage.routing.unroutablePickupDropoffZones, []);
  assert.equal(report.coverage.references.missing, 0);

  assert.equal(
    JSON.stringify(report),
    JSON.stringify(reportFor(createNeighbourhoodMap())),
    'report is deterministic for the same authored document',
  );
});

test('a dangling successor reference is reported with lane id, field path and position', () => {
  const map = mutable();
  const lane = map.lanes[0]!;
  const missingId = 'lane:does-not-exist';
  lane.successorIds.push(missingId);
  const report = reportFor(map);

  assert.equal(report.ok, false);
  const issue = findIssue(
    report.issues,
    'MISSING_REFERENCE',
    `map.lanes[0].successorIds[${lane.successorIds.length - 1}]`,
  );
  assert.equal(issue.entityId, lane.id);
  assert.equal(issue.relatedId, missingId);
  assert.ok(issue.positionM, 'lane issues carry a position');
  assert.equal(issue.check, 'LANE_REFERENCES');
  assert.ok((report.errorsByReason.MISSING_REFERENCE ?? 0) >= 1);
  assert.ok(report.schemaError);
});

test('a missing signal reference is reported at the signal field path', () => {
  const map = mutable();
  const signal = map.signals[0]!;
  signal.intersectionId = 'ix:missing';
  const report = reportFor(map);

  assert.equal(report.ok, false);
  const issue = findIssue(report.issues, 'MISSING_REFERENCE', 'map.signals[0].intersectionId');
  assert.equal(issue.entityId, signal.id);
  assert.equal(issue.relatedId, 'ix:missing');
  assert.equal(issue.check, 'SIGNALS');
  const signalsCheck = report.coverage.checks.find((check) => check.id === 'SIGNALS')!;
  assert.equal(signalsCheck.status, 'FAIL');
  assert.ok(signalsCheck.issues >= 1);
});

test('an overlapping service-zone footprint is rejected with both IDs and positions', () => {
  const map = mutable();
  const first = map.serviceZones[0]!;
  const second = map.serviceZones[1]!;
  second.geometryId = first.geometryId;
  const report = reportFor(map);

  assert.equal(report.ok, false);
  const issue = findIssue(report.issues, 'SERVICE_ZONE_OVERLAP', 'map.serviceZones[1]');
  assert.equal(issue.entityId, second.id);
  assert.equal(issue.relatedId, first.id);
  assert.ok(issue.positionM, 'zone overlap carries a position');
  assert.equal(issue.check, 'SERVICE_ZONES');
  assert.equal(
    report.coverage.checks.find((check) => check.id === 'SERVICE_ZONES')!.status,
    'FAIL',
  );
});

test('a duplicate lane id is reported once per offending path', () => {
  const map = mutable();
  map.lanes[1]!.id = map.lanes[0]!.id;
  const report = reportFor(map);

  assert.equal(report.ok, false);
  const issue = findIssue(report.issues, 'DUPLICATE_ID', 'map.lanes[1].id');
  assert.equal(issue.entityId, map.lanes[0]!.id);
  assert.equal(issue.relatedId, 'map.lanes[0].id');
  assert.equal(issue.check, 'DUPLICATE_IDS');
  assert.equal(
    report.coverage.checks.find((check) => check.id === 'DUPLICATE_IDS')!.status,
    'FAIL',
  );
  assert.ok(report.schemaError, 'the PBI032 parser also rejects the duplicate ID');
});

test('an implausible lane width corrupts the authored corridor and fails the geometry check', () => {
  const map = mutable();
  const lane = map.lanes.find(
    (candidate) => candidate.neighbors.left !== null || candidate.neighbors.right !== null,
  );
  assert.ok(lane, 'the authored arterial declares lateral neighbours');
  lane.widthM = 6;
  const report = reportFor(map);

  assert.equal(report.ok, false);
  const issue = findIssue(report.issues, 'LANE_CORRIDOR_OVERLAP');
  assert.equal(issue.entityId, lane.id);
  assert.ok(issue.relatedId);
  assert.match(issue.message, /overlaps/u);
  assert.match(issue.message, /threshold/u);
  assert.ok(issue.positionM, 'corridor overlap carries a position');
  assert.equal(
    report.coverage.checks.find((check) => check.id === 'LANE_GEOMETRY')!.status,
    'FAIL',
  );
});

test('a disconnected directed component is rejected without collapsing the coverage report', () => {
  const map = mutable();
  map.lanes[0]!.successorIds = [];
  const report = reportFor(map);

  assert.equal(report.ok, false);
  const issue = findIssue(report.issues, 'CONNECTIVITY_DISCONNECTED', 'map.lanes');
  assert.equal(issue.check, 'CONNECTIVITY');
  assert.ok(report.coverage.connectivity.stronglyConnectedComponents > 1);
  assert.ok(report.coverage.connectivity.largestComponentLanes < 96);
  assert.ok(report.coverage.connectivity.disconnectedLaneIds.length > 0);
  assert.equal(report.coverage.checks.find((check) => check.id === 'CONNECTIVITY')!.status, 'FAIL');
});

test('a schema-version corruption and a reversed one-way lane use closed reasons', () => {
  const schemaMap = mutable();
  schemaMap.schemaVersion = 2;
  const schemaReport = reportFor(schemaMap);
  assert.equal(schemaReport.ok, false);
  const schemaIssue = findIssue(schemaReport.issues, 'SCHEMA_INVALID', 'map.schemaVersion');
  assert.match(schemaIssue.message, /schemaVersion/u);
  assert.ok(schemaReport.schemaError);

  const directionMap = mutable();
  const through = directionMap.lanes.find(
    (lane) => lane.fromIntersectionId !== null && lane.toIntersectionId !== null,
  );
  assert.ok(through);
  through.direction = 'REVERSE';
  const directionReport = reportFor(directionMap);
  assert.equal(directionReport.ok, false);
  const directionIssue = findIssue(directionReport.issues, 'ONE_WAY_INCONSISTENT');
  assert.equal(directionIssue.entityId, through.id);
  assert.equal(directionIssue.path, `map.lanes[${directionMap.lanes.indexOf(through)}].direction`);
});

test('a lane that ends without successor, service or recovery is dangling', () => {
  const map = mutable();
  const lane = map.lanes[0]!;
  lane.successorIds = [];
  lane.toIntersectionId = null;
  const report = reportFor(map);

  assert.equal(report.ok, false);
  const issue = findIssue(report.issues, 'DANGLING_LANE', 'map.lanes[0]');
  assert.equal(issue.entityId, lane.id);
  assert.equal(issue.check, 'LANE_REFERENCES');
  assert.ok(issue.positionM);
});

test('every emitted issue stays inside the closed reason and check vocabularies', () => {
  const map = mutable();
  map.lanes[1]!.id = map.lanes[0]!.id;
  map.lanes[0]!.successorIds.push('lane:missing');
  map.signals[0]!.intersectionId = 'ix:missing';
  map.serviceZones[1]!.geometryId = map.serviceZones[0]!.geometryId;
  map.schemaVersion = 2;
  const report = reportFor(map);

  assert.equal(report.ok, false);
  const reasons = new Set<string>(MAP_INTEGRITY_REASONS);
  const checks = new Set<string>(MAP_INTEGRITY_CHECKS);
  for (const issue of report.issues) {
    assert.ok(reasons.has(issue.reason), `unknown reason ${issue.reason}`);
    assert.ok(checks.has(issue.check), `unknown check ${issue.check}`);
    assert.ok(issue.path.startsWith('map'), `unstable path ${issue.path}`);
    assert.ok(issue.message.length > 0);
    if (issue.positionM)
      for (const value of [issue.positionM.x, issue.positionM.y, issue.positionM.z])
        assert.ok(Number.isFinite(value));
  }
  for (const reason of Object.keys(report.errorsByReason))
    assert.ok(reasons.has(reason), `errorsByReason contains ${reason}`);
  assert.ok(report.issueCount >= report.issues.length);
  assert.equal(
    Object.values(report.errorsByReason).reduce((sum, count) => sum + (count ?? 0), 0),
    report.issueCount,
  );
});

test('the validator accepts an unknown document without throwing and reports schema invalid', () => {
  const report = reportFor({ schemaVersion: 'one' });
  assert.equal(report.ok, false);
  assert.equal(report.mapId, null);
  assert.equal(report.coverage.entityCounts.lanes, 0);
  findIssue(report.issues, 'SCHEMA_INVALID', 'map.schemaVersion');
  assert.ok(report.schemaError);
  const notObject = checkMapIntegrity('not-a-map' satisfies unknown);
  assert.equal(notObject.ok, false);
  findIssue(notObject.issues, 'SCHEMA_INVALID', 'map');
});
