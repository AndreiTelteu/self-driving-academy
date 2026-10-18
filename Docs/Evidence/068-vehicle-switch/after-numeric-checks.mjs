// Independent full numeric verifier. Frozen BEFORE assertion functions copied, not edited.
// Original strict verifier SHA256: a9ceef10de831949f86c5f6bca5a31f263dde0fc3eded93ce765bd6f40a5dd10
import assert from 'node:assert/strict';
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];
function cleanup(c) {
  if (c.selection) disposedSelection(c.selection);
  if (c.retiredAdmission) disposedSelection(c.retiredAdmission);
  assert.deepEqual(c.errors, []);
  assert.equal(new Set(c.attempts).size, c.attempts.length);
  for (const key of ['vehicles', 'targets', 'projections', 'players'])
    assert.equal(c.controller[key], 0);
  assert.equal(c.controller.disposed, true);
  assert.equal(c.controller.retainedBatches, 0);
  assert.equal(c.authority.vehicles, 0);
  assert.equal(c.authority.players, 0);
  assert.equal(c.authority.seat, null);
  assert.equal(c.authority.disposed, true);
  assert.equal(c.authority.retainedHistory, 0);
  assert.equal(c.authority.retainedBatches, 0);
  assert.equal(c.keyboard.heldKeys, 0);
  assert.equal(c.keyboard.retainedFrames, 0);
  assert.equal(c.keyboard.pendingPreferences, false);
  assert.equal(c.keyboard.disposed, true);
  assert.equal(c.body.entities, 0);
  assert.equal(c.body.subscriptions, 0);
  assert.equal(c.collision.colliders, 0);
  assert.equal(c.collision.vehicles, 0);
  assert.equal(c.collision.obstacles, 0);
  assert.equal(c.collision.disposed, true);
  assert.equal(c.segment.retainedSegments, 0);
  assert.equal(c.segment.disposed, true);
  assert.equal(c.segment.retainedHistory, 0);
}
function guard(g, count, steps, proofs) {
  assert(/^[a-f0-9]{64}$/.test(g.nativeInputDigest));
  assert.equal(g.nativeSteps, steps);
  assert.equal(g.selectionStepAttempts, 0);
  assert.equal(g.selectionProofs.length, proofs);
  assert.deepEqual(
    Object.keys(g.drivingCalls).sort(),
    [
      'setPose',
      'setBodyVelocity',
      'setVelocity',
      'addCar',
      'addClassCar',
      'addBox',
      'addNamedBox',
      'removeBody',
      'removeCollisionEntity',
      'subscribeBody',
      'publishBodies',
      'dispose',
    ].sort(),
  );
  for (const value of Object.values(g.drivingCalls)) assert.equal(value, 0);
  assert(g.setupCalls.length <= 256);
  const readers = [
    'collisionIdentity',
    'collisionForColliderHandle',
    'collisionStepSerial',
    'collisionResources',
    'readVehicleMechanics',
    'readCollisionContacts',
    'bodyIdentity',
    'entityForBodyHandle',
    'readBody',
    'bodyResources',
    'project',
    'contacts',
    'counts',
  ];
  assert.deepEqual(g.auditedMethods, [...Object.keys(g.drivingCalls), ...readers, 'step'].sort());
  assert(g.modeSettlementProofs.length <= 13);
  for (const proof of [...g.selectionProofs, ...g.modeSettlementProofs]) {
    assert.equal(proof.bodies, count);
    assert.equal(proof.nativeStepSerial, proof.tick);
    assert.equal(proof.beforeHash, proof.afterHash);
    assert(/^[a-f0-9]{64}$/.test(proof.beforeHash));
  }
}
function validate(r) {
  cleanup(r.cleanup);
  assert.deepEqual(r.cleanup.attempts, [
    'selection',
    'assignments',
    'cameraTarget',
    'segment',
    'mode',
    'authority',
    'keyboard',
    'controller',
    'world',
  ]);
  assert(Number.isInteger(r.count) && r.count >= 2 && r.count <= 110);
  const cycles =
    r.fixedMode === null
      ? { AUTO: 5, MANUAL: 4, LEARNING: 4 }
      : {
          AUTO: r.fixedMode === 'AUTO' ? 13 : 0,
          MANUAL: r.fixedMode === 'MANUAL' ? 13 : 0,
          LEARNING: r.fixedMode === 'LEARNING' ? 13 : 0,
        };
  const controlled = cycles.MANUAL + cycles.LEARNING;
  assert.equal(r.mutationGuard.modeSettlementProofs.length, controlled);
  const claimTicks = Array.from({ length: 13 }, (_, i) => i)
    .filter((i) => (r.fixedMode ?? ['AUTO', 'MANUAL', 'LEARNING'][i % 3]) !== 'AUTO')
    .map((i) => 1 + 60 * i);
  assert.deepEqual(
    r.mutationGuard.modeSettlementProofs.map((p) => p.tick),
    claimTicks,
  );
  for (const proof of r.mutationGuard.modeSettlementProofs) assert.equal(proof.selected, 'car-0');
  const expectedSetup = Array.from({ length: r.count }, (_, i) => ({
    label: 'INITIAL_FIXTURE',
    path: r.classId === null ? 'addCar' : 'addClassCar',
    entityId: 'car-' + i,
    classId: r.classId,
    nativeStepSerial: 0,
  }));
  if (r.classId === null)
    for (let i = 0; i < 67; i++)
      expectedSetup.push({
        label: 'INITIAL_FIXTURE',
        path: 'addBox',
        entityId: null,
        classId: null,
        nativeStepSerial: 0,
      });
  assert.deepEqual(r.mutationGuard.setupCalls, expectedSetup);
  assert.equal(r.explicitClaims, controlled);
  assert.equal(r.oldFilterClears, controlled);
  assert.equal(r.owned.segment.opened, controlled);
  assert.equal(r.owned.segment.closed, controlled);
  assert.equal(r.cleanup.segment.opened, controlled);
  assert.equal(r.cleanup.segment.closed, controlled);
  assert.equal(r.owned.segment.retainedSegments, controlled ? 1 : 0);
  assert.deepEqual(r.modeCounts, {
    AUTO: cycles.AUTO * 60 + controlled * 40,
    MANUAL: cycles.MANUAL * 20,
    LEARNING: cycles.LEARNING * 20,
  });
  assert.equal(r.maximumPlayers, controlled ? 1 : 0);
  assert.equal(r.owned.controller.vehicles, r.count);
  assert.equal(r.owned.controller.tick, 780);
  assert.equal(r.owned.controller.disposed, false);
  assert.equal(r.owned.controller.players, 0);
  assert.equal(r.owned.authority.vehicles, r.count);
  assert.equal(r.owned.authority.tick, 780);
  assert.equal(r.owned.body.entities, r.count);
  assert.equal(r.owned.body.subscriptions, 0);
  assert.equal(r.owned.assignments, r.count);
  assert.equal(r.owned.collision.vehicles, r.count);
  assert(r.owned.collision.colliders <= 256);
  assert(r.owned.collision.obstacles <= 96);
  assert(r.classId === null || ['sedan', 'compact'].includes(r.classId));
  assert(['TAXI', 'CIVIL'].includes(r.targetKind));

  assert.equal(r.warmupTicks, 180);
  assert.equal(r.measuredTicks, 600);
  assert.equal(r.physicalTicks, 780);
  assert(r.maximumPlayers <= 1);
  assert.equal(r.selections, 26);
  assert.equal(r.cameraUpdates, 780);
  assert(Number.isFinite(r.maxDisplacementM) && r.maxDisplacementM >= 0);
  assert(Number.isFinite(r.maxSpeedMps) && r.maxSpeedMps >= 0);
  guard(r.mutationGuard, r.count, 780, 26);
  assert.deepEqual(
    r.mutationGuard.selectionProofs.map((p) => ({ tick: p.tick, selected: p.selected })),
    Array.from({ length: 13 }, (_, i) => [
      { tick: i * 60 + 21, selected: 'car-1' },
      { tick: i * 60 + 41, selected: 'car-0' },
    ]).flat(),
  );
  assert.equal(r.drivingPoseWrites, 0);
  assert.equal(r.drivingVelocityWrites, 0);
  assert.equal(r.checkpoints.length, 13);
  r.checkpoints.forEach((c, i) => assert.equal(c.tick, (i + 1) * 60));
  assert.equal(r.selectionTrace.length, 26);
  for (let cycle = 0; cycle < 13; cycle++) {
    const depart = r.selectionTrace[cycle * 2],
      back = r.selectionTrace[cycle * 2 + 1];
    assert.equal(depart.tick, cycle * 60 + 21);
    assert.equal(back.tick, cycle * 60 + 41);
    assert.equal(depart.selected, 'car-1');
    assert.equal(back.selected, 'car-0');
    assert.equal(depart.seat, null);
    assert.equal(back.seat, null);
    assert.equal(depart.assignmentDigest, r.assignmentDigest);
    assert.equal(back.assignmentDigest, r.assignmentDigest);
  }
  assert.equal(r.initialMechanics.length, r.count);
  assert.equal(r.finalMechanics.length, r.count);
  for (const mechanics of [...r.initialMechanics, ...r.finalMechanics])
    assert.equal(mechanics.classId, r.classId);
  const immutable = (mechanics) =>
    Object.fromEntries(
      Object.entries(mechanics).filter(
        ([key]) =>
          !['appliedEngineForceN', 'appliedSteeringRadians', 'wheelBrakeImpulseLimitNs'].includes(
            key,
          ),
      ),
    );
  assert.deepEqual(r.initialMechanics.map(immutable), r.finalMechanics.map(immutable));
  assert.equal(r.cleanup.body.entities, 0);
  assert.equal(r.cleanup.collision.colliders, 0);
  assert.equal(r.cleanup.segment.retainedSegments, 0);
  assert.equal(r.cleanup.mode.intents, 0);
  assert.equal(r.cleanup.mode.inFlight, 0);
  assert.equal(r.cleanup.mode.disposed, true);
  assert.equal(r.cleanup.cameraTarget, null);
  assert.equal(r.cleanup.assignments, 0);
  validateRawChannels(r);
}

const channelPairs = [
  ['tickMs', 'tickMs'],
  ['authorityMs', 'existingAuthorityMs'],
  ['referenceSelectionMs', 'referenceSelectionMs'],
  ['vehicleSelectionMs', 'vehicleSelectionMs'],
];
export function validateRawChannels(r) {
  if (!r.observer) {
    assert.equal(r.sampleBytes, 0);
    assert.equal(r.rawTimings, null);
    for (const [, summary] of channelPairs) assert.equal(r[summary], null);
    return;
  }
  assert.equal(r.sampleBytes, 600 * 4 * 8);
  assert.deepEqual(Object.keys(r.rawTimings).sort(), channelPairs.map(([key]) => key).sort());
  for (const [key, summary] of channelPairs) {
    const raw = r.rawTimings[key];
    assert(Array.isArray(raw));
    assert.equal(raw.length, 600);
    assert(raw.every((v) => Number.isFinite(v) && v >= 0));
    assert.deepEqual(
      r[summary],
      { p50: percentile(raw, 0.5), p95: percentile(raw, 0.95), p99: percentile(raw, 0.99) },
      'Independent raw percentile ' + key,
    );
  }
}
export function recomputeRelative(after, before) {
  const result = [];
  for (const count of [70, 110]) {
    const pairs = [];
    for (let pair = 0; pair < 5; pair++) {
      const a = after.filter((r) => r.count === count && r.pair === pair && r.observer),
        b = before.filter((r) => r.count === count && r.pair === pair && r.observer);
      assert.equal(a.length, 1);
      assert.equal(b.length, 1);
      const ap = percentile(a[0].rawTimings.tickMs, 0.95),
        bp = percentile(b[0].rawTimings.tickMs, 0.95);
      assert(Number.isFinite(ap) && Number.isFinite(bp) && bp > 0);
      const deltaMs = ap - bp;
      pairs.push({
        pair,
        beforeP95: bp,
        afterP95: ap,
        deltaMs,
        ratio: ap / bp,
        regression: deltaMs > 1 && ap > bp * 1.1,
      });
    }
    const failures = pairs.filter((p) => p.regression).length;
    result.push({ count, pairs, failures });
    assert(failures < 3, 'Unchanged relative >10%AND>1ms >=3/5 gate ' + count);
  }
  return result;
}
function disposedSelection(s) {
  assert.equal(s.vehicles, 0);
  assert.equal(s.pending, 0);
  assert.equal(s.inFlight, 0);
  assert.equal(s.projection, null);
  assert.equal(s.conflict, false);
  assert.equal(s.disposed, true);
  assert.equal(s.retainedHistory, 0);
}
function liveSelection(s, count, tick, { pending = 0, inFlight = 0 } = {}) {
  assert.equal(s.vehicles, count);
  assert.equal(s.pending, pending);
  assert.equal(s.inFlight, inFlight);
  assert.equal(s.conflict, false);
  assert.equal(s.disposed, false);
  assert.equal(s.fault, null);
  assert.equal(s.retainedHistory, 0);
  assert(s.projection);
  assert.equal(s.projection.tick, tick);
  assert.equal(s.projection.version, '068-selection-view-v1');
  assert.equal(s.projection.seat, null);
  assert.equal(s.projection.suspended, false);
  assert.equal(s.projection.fault, null);
  assert.equal(s.projection.selectedIdentity.entityId, 'car-0');
  assert.equal(s.projection.pendingIdentity?.entityId ?? null, pending ? 'car-1' : null);
}
const parityKeys = [
  'count',
  'pair',
  'observer',
  'classId',
  'fixedMode',
  'targetKind',
  'warmupTicks',
  'measuredTicks',
  'physicalTicks',
  'decisionDigest',
  'rawPlayerDigest',
  'packetDigest',
  'selectionDigest',
  'assignmentDigest',
  'finalPhysicalHash',
  'checkpoints',
  'selectionTrace',
  'modeCounts',
  'maximumPlayers',
  'selections',
  'cameraUpdates',
  'explicitClaims',
  'oldFilterClears',
  'maxDisplacementM',
  'maxSpeedMps',
  'initialMechanics',
  'finalMechanics',
  'drivingPoseWrites',
  'drivingVelocityWrites',
  'mutationGuard',
];
function physicalCheckpoints(r) {
  for (const c of r.checkpoints) {
    assert.equal(c.physical.length, r.count);
    c.physical.forEach((s, i) => {
      assert.deepEqual(
        Object.keys(s).sort(),
        ['id', 'position', 'rotation', 'velocity', 'speed', 'suspension', 'wheelContacts'].sort(),
      );
      assert.equal(s.id, 'car-' + i);
      for (const key of ['position', 'velocity', 'rotation']) {
        const keys = key === 'rotation' ? ['x', 'y', 'z', 'w'] : ['x', 'y', 'z'];
        assert.deepEqual(Object.keys(s[key]).sort(), keys.sort());
        for (const component of keys) assert(Number.isFinite(s[key][component]));
      }
      assert(Number.isFinite(s.speed) && s.speed >= 0);
      assert.equal(s.suspension.length, 4);
      assert(s.suspension.every(Number.isFinite));
      assert(Number.isSafeInteger(s.wheelContacts) && s.wheelContacts >= 0 && s.wheelContacts <= 4);
    });
    assert.equal(c.camera.entityId, c.tick % 60 >= 21 && c.tick % 60 < 41 ? 'car-1' : 'car-0');
    for (const point of [c.camera.positionM, c.camera.lookAtM, c.camera.up]) {
      assert(point);
      for (const key of ['x', 'y', 'z']) assert(Number.isFinite(point[key]));
    }
    assert(Number.isFinite(c.camera.fovRadians));
  }
}
export function validateAfterReports(r, b) {
  assert.equal(r.status, 'PASS');
  assert.equal(b.status, 'PASS');
  assert.equal(r.baselineSourceHash, b.sourceHash);
  assert.equal(b.sourceHash, 'fcb9a71661d7630cfbb137ba08b176fef1a6ed0927ed50c4e438b0d12809cace');
  assert.equal(r.budgetVersion, '203-initial-1');
  assert.equal(r.runs.length, 20);
  assert.equal(r.scenarios.length, 12);
  assert.equal(r.guards.length, 2);
  for (const category of ['runs', 'scenarios'])
    for (let i = 0; i < r[category].length; i++) {
      const a = r[category][i],
        old = b[category][i];
      validate(a);
      physicalCheckpoints(a);
      for (const key of parityKeys)
        assert.deepEqual(a[key], old[key], category + '/' + i + '/' + key);
      for (const view of [a.ownedDuringDriving, a.owned]) {
        liveSelection(view.selection, a.count, 780);
        assert.equal(view.controller.vehicles, a.count);
        assert.equal(view.controller.tick, 780);
        assert.equal(view.controller.disposed, false);
        assert.equal(view.authority.tick, 780);
        assert.equal(view.authority.players, 0);
        assert.equal(view.authority.retainedHistory, 0);
        assert.equal(view.authority.retainedBatches, 0);
        for (const key of ['body', 'collision', 'keyboard', 'segment'])
          assert.deepEqual(view[key], old.owned[key], 'Actual live ' + key + ' provenance');
      }
      assert.equal(a.lifecycle.length, 20);
      for (let cycle = 0; cycle < 20; cycle++) {
        const c = a.lifecycle[cycle];
        assert.equal(c.cycle, cycle);
        assert.equal(c.liveRegistered.vehicles, a.count);
        assert.equal(c.liveRegistered.disposed, false);
        assert.equal(c.liveRegistered.pending, 0);
        assert.equal(c.liveRegistered.inFlight, 0);
        assert.equal(c.liveRegistered.projection, null);
        assert.equal(c.liveRegistered.retainedHistory, 0);
        liveSelection(c.livePrepared, a.count, 780, { pending: 1, inFlight: 1 });
        assert.deepEqual(c.cleanup.errors, []);
        assert.deepEqual(c.cleanup.attempts, ['selection']);
        assert.deepEqual(Object.keys(c.cleanup.snapshots), ['selection']);
        disposedSelection(c.cleanup.snapshots.selection);
      }
      if (a.count === 70 && a.observer)
        assert(a.tickMs.p95 <= 5.5, '70 normal absolute cap;110 separately stress');
    }
  for (let i = 0; i < 2; i++) {
    const a = r.guards[i],
      old = b.guards[i];
    for (const key of [
      'classId',
      'mutationGuard',
      'hiddenRejected',
      'civilFleetRejected',
      'retiredGenerationRejected',
      'boundaryMismatchBeforePhysicsRejected',
      'pausedPhysicalTicks',
      'acceptedReleaseBeforeClosureFault',
      'trace',
      'finalPhysicalHash',
      'drivingPoseWrites',
      'drivingVelocityWrites',
    ])
      assert.deepEqual(a[key], old[key], 'guard/' + i + '/' + key);
    cleanup(a.cleanup);
    guard(a.mutationGuard, 2, 4, 1);
    assert.deepEqual(a.cleanup.attempts, [
      'retiredAdmission',
      'selection',
      'cameraTarget',
      'segment',
      'authority',
      'keyboard',
      'controller',
      'world',
    ]);
    assert.equal(a.cleanup.segment.opened, 2);
    assert.equal(a.cleanup.segment.closed, 1);
    assert.equal(a.cleanup.authority.tick, 4);
    assert.equal(a.retiredGenerationEvidence.owner, 'actual068-independent-admission-owner');
    assert.equal(a.retiredGenerationEvidence.authorityTick, 4);
    assert.equal(a.retiredGenerationEvidence.nativeSteps, 4);
    assert.notEqual(
      a.retiredGenerationEvidence.currentGeneration,
      a.retiredGenerationEvidence.retiredGeneration,
    );
    assert(
      Number.isSafeInteger(a.retiredGenerationEvidence.currentGeneration) &&
        a.retiredGenerationEvidence.currentGeneration >= 1,
    );
    assert(
      Number.isSafeInteger(a.retiredGenerationEvidence.retiredGeneration) &&
        a.retiredGenerationEvidence.retiredGeneration >= 1,
    );
  }
  const relative = recomputeRelative(r.runs, b.runs);
  assert.deepEqual(r.relativeGate, relative);
  return {
    worlds: 34,
    normal70P95: r.runs.filter((v) => v.count === 70 && v.observer).map((v) => v.tickMs.p95),
    overload110StressP95: r.runs
      .filter((v) => v.count === 110 && v.observer)
      .map((v) => v.tickMs.p95),
    relative,
    memoryScope:
      'Actual live-owner/native-resource/raw-Float64 counters and20cycles; no exact JS heap/GPU/fleetFPS claim',
  };
}
