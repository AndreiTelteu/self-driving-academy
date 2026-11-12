import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DESTRUCTIBLE_ARCHETYPES,
  DESTRUCTIBLE_BROKEN_EVENT,
  DESTRUCTIBLE_LIMITS,
  FRAGMENT_LIFETIME_TICKS,
  REFERENCE_VEHICLE_MASS_KG,
  createDestructibleDecor,
  destructibleArchetypes,
  verifyDestructiblePlayground,
  verifyStructuralBoundary,
} from '../../src/world';
import type {
  DestructibleDefinition,
  DestructiblePlayZone,
  DestructibleSnapshot,
} from '../../src/world';
import {
  DESTRUCTIBLE_CONTEXT,
  createHarness,
  decorOf,
  definitionOf,
  destructibleWorld,
  drivableSurfaceAt,
  brokenPayload,
  isolatedDefinition,
  nearestLaneTarget,
  planWith,
} from './destructible-decor-fixture';

const IMPACT_POINT_OFFSET_M = 0.6;

function contactFor(
  definition: DestructibleDefinition,
  impulseNs: number,
  tick: number,
  controlSource: 'MANUAL' | 'LEARNING' | 'AUTO',
  offsetX = -IMPACT_POINT_OFFSET_M,
  offsetZ = 0,
) {
  const base = definition.initialTransform.positionM;
  return {
    tick,
    objectId: definition.objectId,
    impulseNs,
    pointM: { x: base.x + offsetX, y: 0.4, z: base.z + offsetZ },
    instigatorId: 'taxi-227',
    controlSource,
  };
}

test('227 the playground is data derived from the real layout: three zones, entries, routes and edges', () => {
  const { layout, plan, report } = destructibleWorld();
  assert.deepEqual(report.issues, []);
  assert.equal(plan.mapId, layout.mapId);
  assert.deepEqual(plan.stats.zonesByKind, {
    DRIFT_PAD: 1,
    RAMP: 1,
    DEMOLITION_ALLEY: 1,
  });
  assert.equal(plan.stats.entries, 6);
  assert.equal(plan.stats.routes, 6);
  assert.equal(plan.stats.drivableEntries, 6, 'every entry is reachable without walking');
  assert.equal(plan.stats.landmarks, 3);
  assert.ok(plan.stats.destructibles >= 6);
  const byKind = new Map(plan.zones.map((zone) => [zone.kind, zone]));
  assert.equal(byKind.get('DRIFT_PAD')?.edgePolicy, 'REDIRECT_TO_ENTRY');
  assert.equal(byKind.get('RAMP')?.edgePolicy, 'CONTINUE_IN_LANE');
  assert.equal(byKind.get('DEMOLITION_ALLEY')?.edgePolicy, 'STOP_AT_EDGE');
  const ramp = byKind.get('RAMP')!;
  assert.ok(ramp.ramp);
  assert.equal(ramp.ramp!.lengthM, 12);
  assert.equal(ramp.ramp!.widthM, 3.2);
  assert.equal(ramp.ramp!.riseM, 0.6);
  assert.equal(ramp.ramp!.approachHeadingRad, ramp.headingRad);
  const alley = byKind.get('DEMOLITION_ALLEY')!;
  assert.equal(alley.destructibleIds.length, plan.definitions.length);
  assert.equal(
    [...new Set(plan.definitions.map((definition) => definition.archetype))].sort().join(','),
    [...destructibleArchetypes].sort().join(','),
    'the alley covers every destructible archetype',
  );
  for (const zone of plan.zones) {
    for (const entry of zone.entries) assert.ok(drivableSurfaceAt(layout, entry.positionM));
    assert.ok(zone.landmarks.length > 0);
    assert.ok(zone.routes.every((route) => route.waypointsM.length >= 2));
  }
  // Invalid zone data is refused instead of silently producing an unreachable playground.
  const unreachable: DestructiblePlayZone = {
    ...ramp,
    entries: [
      {
        entryId: 'entry:off-road',
        laneId: null,
        positionM: { x: -500, y: 0, z: -500 },
        headingRad: 0,
      },
    ],
  };
  const tampered = {
    ...plan,
    zones: plan.zones.map((zone) => (zone.kind === 'RAMP' ? unreachable : zone)),
  };
  assert.ok(
    verifyDestructiblePlayground(tampered, layout).issues.some((issue) =>
      issue.includes('not on a drivable surface'),
    ),
  );
  assert.throws(
    () =>
      createDestructibleDecor({
        context: DESTRUCTIBLE_CONTEXT,
        eventBus: createHarness().bus,
        layout,
        plan: tampered,
      }),
    /not reachable by car/,
  );
});

test('227 thresholds are calibrated from mass and speed and the state machine only closes forward', () => {
  const { plan } = destructibleWorld();
  for (const archetype of destructibleArchetypes) {
    const spec = DESTRUCTIBLE_ARCHETYPES[archetype];
    const definition = definitionOf(plan, archetype);
    assert.equal(definition.massKg, spec.massKg);
    assert.equal(
      definition.impactThreshold.moveImpulseNs,
      Number((spec.massKg * spec.moveSpeedMps).toFixed(3)),
    );
    assert.equal(
      definition.impactThreshold.breakImpulseNs,
      Number((spec.massKg * spec.breakSpeedMps).toFixed(3)),
    );
    assert.ok(definition.impactThreshold.moveImpulseNs < definition.impactThreshold.breakImpulseNs);
    assert.equal(definition.responseKind, 'DISPLACE_THEN_BREAK');
    assert.equal(definition.resetPolicy, 'RESET_TO_INITIAL');
  }
  assert.ok(
    DESTRUCTIBLE_ARCHETYPES.STREET_FURNITURE.massKg *
      DESTRUCTIBLE_ARCHETYPES.STREET_FURNITURE.breakSpeedMps >
      DESTRUCTIBLE_ARCHETYPES.CONE.massKg * DESTRUCTIBLE_ARCHETYPES.CONE.breakSpeedMps,
    'a heavier object needs more impulse to break',
  );
  const { decor } = createHarness();
  const cone = isolatedDefinition(plan, 'CONE');
  const weak = decor.applyImpact(contactFor(cone, 0.5, 1, 'MANUAL'));
  assert.equal(weak.previousState, 'INTACT');
  assert.equal(weak.state, 'INTACT');
  assert.equal(weak.changedState, false);
  assert.equal(weak.damageNs, 0.5);
  assert.equal(weak.eventId, null);
  const continuous = decor.applyImpact(contactFor(cone, 0.5, 2, 'MANUAL'));
  assert.equal(continuous.state, 'INTACT');
  const moves = decor.applyImpact(contactFor(cone, 0.5, 3, 'MANUAL'));
  assert.equal(moves.state, 'MOVED');
  assert.equal(moves.changedState, true);
  assert.equal(moves.damageNs, 1.5);
  assert.equal(moves.eventId, null, 'a displaced object is not a broken object');
  const stays = decor.applyImpact(contactFor(cone, 1, 4, 'MANUAL'));
  assert.equal(stays.state, 'MOVED');
  assert.equal(stays.changedState, false);
  const breaks = decor.applyImpact(contactFor(cone, 40, 5, 'MANUAL'));
  assert.equal(breaks.state, 'BROKEN');
  assert.equal(breaks.changedState, true);
  assert.equal(breaks.publication?.status, 'delivered');
  const after = decor.applyImpact(contactFor(cone, 400, 6, 'MANUAL'));
  assert.equal(after.state, 'BROKEN');
  assert.equal(after.changedState, false);
  assert.equal(after.eventId, null);
  assert.equal(decor.getStats().duplicateBreaks, 1);
  assert.equal(Object.isFrozen(breaks.reaction), true);
});

test('227 MANUAL, LEARNING and AUTO produce the same outcome from the same contact', () => {
  const sources = ['MANUAL', 'LEARNING', 'AUTO'] as const;
  const signatures = sources.map((source) => {
    const { plan, decor } = createHarness();
    const crate = definitionOf(plan, 'CRATE');
    const result = decor.applyImpact(contactFor(crate, 120, 1, source));
    return {
      state: result.state,
      damageNs: result.damageNs,
      eventId: result.eventId,
      event: result.event,
      reaction: result.reaction,
      chain: result.chain.map((entry) => [entry.objectId, entry.state, entry.eventId]),
      stats: decor.getStats().states,
      source: decor.getStats().impactsBySource,
    };
  });
  assert.equal(signatures[0]!.state, 'BROKEN');
  assert.ok(signatures[0]!.eventId);
  assert.equal(signatures[0]!.eventId, signatures[1]!.eventId);
  assert.equal(signatures[0]!.eventId, signatures[2]!.eventId);
  assert.deepEqual(signatures[0]!.event, signatures[1]!.event);
  assert.deepEqual(signatures[0]!.event, signatures[2]!.event);
  assert.deepEqual(signatures[0]!.reaction, signatures[1]!.reaction);
  assert.deepEqual(signatures[0]!.reaction, signatures[2]!.reaction);
  assert.deepEqual(signatures[0]!.stats, signatures[1]!.stats);
  assert.deepEqual(signatures[0]!.stats, signatures[2]!.stats);
  assert.deepEqual(signatures[0]!.chain, signatures[1]!.chain);
  for (const [index, source] of sources.entries())
    assert.deepEqual(signatures[index]!.source, {
      MANUAL: source === 'MANUAL' ? 1 : 0,
      LEARNING: source === 'LEARNING' ? 1 : 0,
      AUTO: source === 'AUTO' ? 1 : 0,
    });
});

test('227 DESTRUCTIBLE_BROKEN is deduplicated and keeps the real instigator, including chains', () => {
  const { plan, decor, bus } = createHarness();
  const direct = isolatedDefinition(plan, 'CRATE');
  const first = decor.applyImpact(contactFor(direct, 120, 1, 'MANUAL'));
  assert.equal(first.state, 'BROKEN');
  assert.equal(first.event?.type, DESTRUCTIBLE_BROKEN_EVENT);
  assert.equal(first.eventId, first.event?.eventId);
  assert.equal(brokenPayload(first.event)?.instigatorId, 'taxi-227');
  assert.deepEqual(first.event?.entityIds, [direct.objectId, 'taxi-227']);
  assert.equal(first.publication?.status, 'delivered');
  for (let index = 0; index < 3; index += 1)
    assert.equal(decor.applyImpact(contactFor(direct, 500, 2 + index, 'AUTO')).eventId, null);
  assert.equal(bus.getStats().retainedEvents, 1, 'one broken event per object and generation');
  assert.equal(bus.publish(first.event!).status, 'duplicate');
  assert.equal(decor.getStats().brokenEvents, 1);

  // Chain: the instigator is the object that physically hit the neighbour, not the player.
  const pair = plan.definitions
    .flatMap((left, index) => plan.definitions.slice(index + 1).map((right) => ({ left, right })))
    .find(
      (pair) =>
        (pair.left.archetype === 'CONE' || pair.left.archetype === 'BIN') &&
        Math.hypot(
          pair.left.initialTransform.positionM.x - pair.right.initialTransform.positionM.x,
          pair.left.initialTransform.positionM.z - pair.right.initialTransform.positionM.z,
        ) < DESTRUCTIBLE_LIMITS.chainRadiusM,
    );
  assert.ok(pair, 'the alley contains a tight bundle for a chain contact');
  const chainRun = createHarness();
  const result = chainRun.decor.applyImpact(contactFor(pair.left, 600, 1, 'LEARNING'));
  assert.equal(result.state, 'BROKEN');
  assert.ok(result.chain.length >= 1);
  const brokenChild = result.chain.find((entry) => entry.state === 'BROKEN');
  assert.ok(brokenChild, 'the chain reaches a real break');
  assert.equal(brokenPayload(brokenChild.event)?.instigatorId, pair.left.objectId);
  assert.deepEqual(brokenChild.event?.entityIds, [brokenChild.objectId, pair.left.objectId]);
  assert.ok(chainRun.decor.getStats().chainBreaks >= 1);
  assert.ok(chainRun.decor.getStats().evaluatedObjects >= 1);
});

test('227 light objects yield instead of acting as invisible walls, large ones stay obstacles', () => {
  const { plan, decor } = createHarness();
  const cone = isolatedDefinition(plan, 'CONE');
  const coneSpec = DESTRUCTIBLE_ARCHETYPES.CONE;
  const result = decor.applyImpact(contactFor(cone, 60, 1, 'AUTO'));
  assert.equal(result.state, 'BROKEN');
  assert.equal(result.reaction.blocking, false);
  assert.ok(result.reaction.impulseNs <= coneSpec.massKg * DESTRUCTIBLE_LIMITS.maxReleaseSpeedMps);
  assert.ok(
    result.reaction.vehicleDeltaVMps < 0.1,
    `a 1400 kg car loses ${result.reaction.vehicleDeltaVMps} m/s`,
  );
  assert.ok(
    result.reaction.impulseNs < REFERENCE_VEHICLE_MASS_KG * 1,
    'the released momentum is the object momentum, not a full stop',
  );
  const fence = isolatedDefinition(plan, 'FENCE_LIGHT');
  const fenceResult = decor.applyImpact(contactFor(fence, 30, 2, 'AUTO'));
  assert.equal(fenceResult.state, 'MOVED');
  assert.equal(fenceResult.reaction.blocking, true);
  const states = decor.getStats().states;
  assert.equal(states.BROKEN, 1);
  assert.equal(states.MOVED, 1);
  const stats = decor.getStats();
  assert.equal(
    stats.bodies,
    stats.objects - 1,
    'a broken body is released, a large moved one stays',
  );
  assert.equal(stats.colliders, stats.bodies);
});

test('227 a large object displaced onto the lane is reported to autonomy without any camera', () => {
  const { layout, plan, decor } = createHarness();
  const definition = isolatedDefinition(plan, 'FENCE_LIGHT');
  const start = definition.initialTransform.positionM;
  const lane = nearestLaneTarget(layout, start);
  const distance = Math.hypot(lane.positionM.x - start.x, lane.positionM.z - start.z);
  const direction = {
    x: (lane.positionM.x - start.x) / distance,
    z: (lane.positionM.z - start.z) / distance,
  };
  const result = decor.applyImpact({
    tick: 1,
    objectId: definition.objectId,
    impulseNs: definition.impactThreshold.breakImpulseNs - 1,
    pointM: {
      x: start.x - direction.x * IMPACT_POINT_OFFSET_M,
      y: 0.4,
      z: start.z - direction.z * IMPACT_POINT_OFFSET_M,
    },
    instigatorId: 'taxi-227',
    controlSource: 'AUTO',
  });
  assert.equal(result.state, 'MOVED');
  const moved = decor.getState(definition.objectId);
  assert.ok(moved.displacementM > 1, `displacement ${moved.displacementM} m`);
  assert.ok(
    drivableSurfaceAt(layout, moved.positionM) !== null,
    'the displaced obstacle is on the drivable surface',
  );
  const reported = decor.queryObstacles({ centerM: { x: 0, y: 0, z: 0 }, radiusM: 1e6 });
  const entry = reported.find((candidate) => candidate.objectId === definition.objectId);
  assert.ok(entry);
  assert.equal(entry.state, 'MOVED');
  assert.equal(entry.displaced, true);
  assert.ok(entry.displacementM > 1);
  // The contract has no camera, viewport or occlusion input at all.
  assert.throws(
    () =>
      decor.queryObstacles({
        centerM: { x: 0, y: 0, z: 0 },
        radiusM: 10,
        camera: 'chase',
      } as never),
    /Missing or unknown contract fields/,
  );
});

test('227 buildings, lanes and STOP/signal rules stay structural and are never destructible', () => {
  const { layout, plan } = destructibleWorld();
  const { decor, bus } = createHarness();
  const building = layout.elements.find((element) => element.kind === 'BUILDING')!;
  const stopLine = layout.elements.find((element) => element.kind === 'STOP_LINE')!;
  const signalHead = layout.elements.find((element) => element.kind === 'SIGNAL_HEAD')!;
  const build = (objectId: string) =>
    planWith(plan, [...plan.definitions, { ...plan.definitions[0]!, objectId }]);
  for (const id of [building.id, stopLine.id, signalHead.id])
    assert.throws(
      () =>
        createDestructibleDecor({
          context: DESTRUCTIBLE_CONTEXT,
          eventBus: bus,
          layout,
          plan: build(id),
        }),
      /Structural objects are not destructible/,
    );
  assert.throws(
    () =>
      createDestructibleDecor({
        context: DESTRUCTIBLE_CONTEXT,
        eventBus: bus,
        layout,
        plan: planWith(plan, [...plan.definitions, plan.definitions[0]!]),
      }),
    /Duplicate destructible object id/,
  );
  const before = JSON.stringify(layout);
  const check = verifyStructuralBoundary(layout, decor, before);
  assert.deepEqual(check.overlaps, []);
  assert.equal(check.untouched, true);
  for (let cycle = 0; cycle < 20; cycle += 1) {
    decor.applyImpact(contactFor(plan.definitions[0]!, 500, cycle + 1, 'MANUAL'));
    decor.reset();
  }
  assert.equal(verifyStructuralBoundary(layout, decor, before).untouched, true);
});

test('227 reload restores the decor and reset rebuilds the baseline without leaking bodies', () => {
  const { plan, decor } = createHarness();
  const cone = isolatedDefinition(plan, 'CONE');
  const crate = isolatedDefinition(plan, 'CRATE');
  const baseline = decor.getStats();
  decor.applyImpact(contactFor(cone, 60, 1, 'MANUAL'));
  decor.applyImpact(contactFor(crate, 20, 2, 'MANUAL'));
  const snapshot: DestructibleSnapshot = decor.capture();
  assert.equal(typeof snapshot.checksum, 'string');
  assert.match(snapshot.checksum, /^fnv1a32:[0-9a-f]{8}$/);
  assert.equal(snapshot.objects.filter((entry) => entry.state === 'BROKEN').length, 1);
  assert.equal(snapshot.objects.filter((entry) => entry.state === 'MOVED').length, 1);
  assert.ok(JSON.stringify(snapshot).length <= DESTRUCTIBLE_LIMITS.maxSnapshotCodeUnits);
  const reset = decor.reset();
  assert.equal(reset.generation, snapshot.generation + 1);
  assert.equal(reset.restored, baseline.objects);
  assert.equal(reset.fragments, 0);
  assert.equal(reset.bodies, baseline.objects);
  assert.equal(decor.getStats().states.INTACT, baseline.objects);
  const restored = decor.restore(snapshot);
  assert.equal(restored.filter((entry) => entry.state === 'BROKEN').length, 1);
  assert.equal(restored.filter((entry) => entry.state === 'MOVED').length, 1);
  assert.equal(decor.capture().checksum, snapshot.checksum);
  assert.equal(decor.getStats().generation, snapshot.generation + 1);
  // Tampered or inconsistent checkpoints are refused, never partially applied.
  assert.throws(
    () => decor.restore({ ...snapshot, checksum: 'fnv1a32:00000000' }),
    /checksum mismatch/,
  );
  assert.throws(
    () => decor.restore({ ...snapshot, objects: snapshot.objects.slice(1) }),
    /cover every destructible object/,
  );
  assert.throws(
    () =>
      decor.restore({
        ...snapshot,
        objects: snapshot.objects.map((entry) =>
          entry.objectId === cone.objectId ? { ...entry, state: 'INTACT', damageNs: 60 } : entry,
        ),
      }),
    /Inconsistent INTACT damage/,
  );
  // KEEP_STATE is a real policy, not a comment.
  const keep = { ...plan.definitions[1]!, resetPolicy: 'KEEP_STATE' as const };
  const keepPlan = planWith(
    plan,
    plan.definitions.map((entry, index) => (index === 1 ? keep : entry)),
  );
  const kept = decorOf(keepPlan);
  kept.decor.applyImpact(contactFor(keep, 500, 1, 'MANUAL'));
  const keptReset = kept.decor.reset();
  assert.equal(keptReset.kept, 1);
  assert.equal(kept.decor.getState(keep.objectId).state, 'BROKEN');
});

test('227 twenty reset cycles keep bodies, colliders and fragments at the measured baseline', () => {
  const { plan, decor } = createHarness();
  const target = plan.definitions[0]!;
  const baseline = decor.getStats();
  const bodies = new Set<number>();
  const colliders = new Set<number>();
  const fragments = new Set<number>();
  const indexEntries = new Set<number>();
  const events = new Set<string>();
  const snapshots: string[] = [];
  let tick = 0;
  for (let cycle = 0; cycle < 20; cycle += 1) {
    tick += 1;
    const result = decor.applyImpact(contactFor(target, 500, tick, 'AUTO'));
    assert.ok(result.eventId);
    events.add(result.eventId);
    assert.ok(decor.getStats().fragments > 0);
    const reset = decor.reset();
    bodies.add(reset.bodies);
    colliders.add(reset.colliders);
    fragments.add(reset.fragments);
    indexEntries.add(decor.getStats().indexEntries);
    snapshots.push(decor.capture().checksum);
  }
  assert.equal(events.size, 20, 'every new attempt publishes its own broken event');
  assert.deepEqual([...bodies], [baseline.objects]);
  assert.deepEqual([...colliders], [baseline.objects]);
  assert.deepEqual([...fragments], [0]);
  assert.equal(indexEntries.size, 1);
  assert.equal(snapshots.length, 20);
  assert.equal(new Set(snapshots).size, 1, 'reset returns to the identical baseline fingerprint');
  assert.ok(decor.advance(tick + FRAGMENT_LIFETIME_TICKS * 2) >= 0);
});

test('227 presentation presets reduce only fragments, never gameplay', () => {
  const low = createHarness({ preset: 'LOW' });
  const high = createHarness({ preset: 'HIGH' });
  const cone = definitionOf(low.plan, 'CONE');
  const lowResult = low.decor.applyImpact(contactFor(cone, 60, 1, 'AUTO'));
  const highResult = high.decor.applyImpact(contactFor(cone, 60, 1, 'AUTO'));
  assert.equal(lowResult.state, highResult.state);
  assert.equal(lowResult.damageNs, highResult.damageNs);
  assert.equal(lowResult.eventId, highResult.eventId);
  assert.deepEqual(lowResult.reaction, highResult.reaction);
  assert.deepEqual(low.decor.getStats().states, high.decor.getStats().states);
  assert.ok(low.decor.getStats().fragments < high.decor.getStats().fragments);
  assert.equal(low.decor.getStats().bodies, high.decor.getStats().bodies);
  high.decor.setPresentationPreset('LOW');
  assert.equal(high.decor.getState(cone.objectId).state, 'BROKEN');
  assert.equal(high.decor.getStats().preset, 'LOW');
});

test('227 the structural cost of an impact is bounded and measured, not claimed', () => {
  const { plan, decor } = createHarness();
  const target = plan.definitions.find((candidate) => candidate.archetype === 'CONE')!;
  const result = decor.applyImpact(contactFor(target, 600, 1, 'AUTO'));
  const stats = decor.getStats();
  assert.ok(stats.evaluatedObjects >= 1);
  assert.ok(stats.evaluatedObjects <= DESTRUCTIBLE_LIMITS.maxObjects);
  assert.ok(stats.chainBreaks >= 1);
  assert.ok(stats.bodies <= DESTRUCTIBLE_LIMITS.maxBodies);
  assert.equal(stats.colliders, stats.bodies * DESTRUCTIBLE_LIMITS.maxCollidersPerObject);
  assert.ok(stats.indexEntries >= stats.bodies);
  assert.ok(stats.fragments <= DESTRUCTIBLE_LIMITS.maxActiveFragments);
  assert.ok(result.chain.length <= DESTRUCTIBLE_LIMITS.maxChainNeighbors);
  // Admission is finite: the 97th object is refused before it can own a body.
  const clones: DestructibleDefinition[] = [];
  for (let index = 0; index < DESTRUCTIBLE_LIMITS.maxObjects + 1; index += 1)
    clones.push({
      ...plan.definitions[0]!,
      objectId: `destructible:overflow:${index}`,
    });
  assert.throws(
    () =>
      createDestructibleDecor({
        context: DESTRUCTIBLE_CONTEXT,
        eventBus: createHarness().bus,
        layout: destructibleWorld().layout,
        plan: planWith(plan, clones),
      }),
    /capacity exceeded/,
  );
});
