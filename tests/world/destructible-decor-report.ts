import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DESTRUCTIBLE_ARCHETYPES,
  DESTRUCTIBLE_LIMITS,
  DESTRUCTIBLE_DECOR_VERSION,
  createDestructibleDecor,
  destructibleArchetypes,
  verifyStructuralBoundary,
} from '../../src/world';
import type { DestructibleDefinition } from '../../src/world';
import {
  DESTRUCTIBLE_CONTEXT,
  brokenPayload,
  createHarness,
  definitionOf,
  destructibleWorld,
  drivableSurfaceAt,
  isolatedDefinition,
  nearestLaneTarget,
  planWith,
} from './destructible-decor-fixture';

/**
 * Deterministic transcript of PBI 227.
 *
 * Every number comes from the real neighbourhood layout and the real state machine. No wall clock,
 * browser, hardware timer, heap sample or `Math.random` is read here: frame/FPS and heap stay
 * `NOT_MEASURED`/`null`, and only the deterministic structural cost is claimed.
 */

export interface DestructibleDecorReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
}
export interface DestructibleDecorReport {
  readonly version: typeof DESTRUCTIBLE_DECOR_VERSION;
  readonly fixture: '227-destructible-decor-v1';
  readonly mapId: string;
  readonly playground: Readonly<{
    zones: number;
    zonesByKind: Readonly<Record<string, number>>;
    entries: number;
    routes: number;
    drivableEntries: number;
    landmarks: number;
    destructibles: number;
    archetypes: number;
    ramp: Readonly<{ lengthM: number; widthM: number; riseM: number }> | null;
    alley: Readonly<{ zoneId: string; destructibles: number }> | null;
    issues: readonly string[];
  }>;
  readonly calibration: Readonly<{
    label: 'PROVISIONAL_UNCALIBRATED';
    formula: 'impulse = massKg * objectSpeed';
    archetypes: readonly Readonly<{
      archetype: string;
      massKg: number;
      obstacleClass: string;
      moveImpulseNs: number;
      breakImpulseNs: number;
      fragments: number;
    }>[];
  }>;
  readonly transitions: Readonly<{
    weak: Readonly<{ state: string; damageNs: number; event: boolean }>;
    continuous: readonly string[];
    strong: Readonly<{ state: string; damageNs: number; event: string }>;
    terminal: boolean;
    duplicateBreaks: number;
  }>;
  readonly controlSourceParity: Readonly<{
    sources: readonly string[];
    identical: boolean;
    fingerprint: string;
    counts: Readonly<Record<string, number>>;
  }>;
  readonly chain: Readonly<{
    parent: string;
    child: string;
    childState: string;
    instigator: string | null;
    entityIds: readonly string[];
    events: number;
  }>;
  readonly dedupe: Readonly<{
    attempts: number;
    events: number;
    busRetained: number;
    repeatStatus: string;
    duplicateBreaks: number;
  }>;
  readonly lightReaction: Readonly<{
    archetype: string;
    impulseNs: number;
    reactionImpulseNs: number;
    vehicleDeltaVMps: number;
    blocking: boolean;
  }>;
  readonly largeObstacle: Readonly<{
    objectId: string;
    state: string;
    displacementM: number;
    laneId: string | null;
    reported: boolean;
    cameraInputAccepted: boolean;
  }>;
  readonly structural: Readonly<{
    structuralIds: number;
    destructibleIds: number;
    overlaps: number;
    untouched: boolean;
    cycles: number;
  }>;
  readonly checkpoint: Readonly<{
    bytes: number;
    checksum: string;
    broken: number;
    moved: number;
    restoredBroken: number;
    restoredMoved: number;
    generation: number;
    bodiesBefore: number;
    bodiesAfterReset: number;
  }>;
  readonly resetCycles: Readonly<{
    cycles: number;
    bodies: readonly number[];
    colliders: readonly number[];
    fragments: readonly number[];
    indexEntries: readonly number[];
    distinctEvents: number;
    distinctChecksums: number;
  }>;
  readonly presets: Readonly<{
    low: Readonly<{ state: string; fragments: number; eventId: string | null }>;
    high: Readonly<{ state: string; fragments: number; eventId: string | null }>;
    gameplayIdentical: boolean;
  }>;
  readonly performance: Readonly<{
    simulation: Readonly<{
      objects: number;
      bodies: number;
      colliders: number;
      evaluatedObjects: number;
      indexEntries: number;
      indexCells: number;
      chainEvents: number;
    }>;
    assets: Readonly<{ textures: number; meshes: number; note: string }>;
    memory: Readonly<{
      snapshotBytes: number;
      bodies: number;
      colliders: number;
      fragments: number;
      heapBytes: null;
    }>;
    frame: Readonly<{ status: 'NOT_MEASURED'; note: string }>;
    budgets: Readonly<{
      destructionBodies: number | null;
      physicsObstacles: number;
      physicsBodies: number;
      physicsColliders: number;
      maxObjects: number;
      status: string;
    }>;
  }>;
  readonly refusals: Readonly<Record<string, string>>;
  readonly checks: readonly DestructibleDecorReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

interface BudgetDocument {
  readonly proposedCapacities: { readonly destructionBodies: number | null };
  readonly resourceAdmissionContracts: {
    readonly physics: {
      readonly obstacles: number;
      readonly bodies: number;
      readonly colliders: number;
    };
  };
}

function readBudgets(): BudgetDocument {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'Docs', 'performance-budgets.json'), 'utf8'),
  ) as BudgetDocument;
}

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  pass = JSON.stringify(expected) === JSON.stringify(actual),
): DestructibleDecorReportCheck {
  return Object.freeze({ name, expected, actual, pass });
}

function contact(
  definition: DestructibleDefinition,
  impulseNs: number,
  tick: number,
  controlSource: 'MANUAL' | 'LEARNING' | 'AUTO',
  offsetX = -0.6,
) {
  const base = definition.initialTransform.positionM;
  return {
    tick,
    objectId: definition.objectId,
    impulseNs,
    pointM: { x: base.x + offsetX, y: 0.4, z: base.z },
    instigatorId: 'taxi-227',
    controlSource,
  };
}

function errorMessage(run: () => unknown): string {
  try {
    run();
    return 'NOT_REFUSED';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
/** Short readable digest of a fingerprint, so the evidence table stays reviewable. */
function digest(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function runDestructibleDecorReport(): DestructibleDecorReport {
  const { layout, plan, report: verification } = destructibleWorld();
  const budgets = readBudgets();
  const checks: DestructibleDecorReportCheck[] = [];

  const alley = plan.zones.find((zone) => zone.kind === 'DEMOLITION_ALLEY');
  const ramp = plan.zones.find((zone) => zone.kind === 'RAMP');
  checks.push(check('playground zones', 3, verification.zones));
  checks.push(
    check(
      'every zone entry is drivable without walking',
      plan.stats.entries,
      verification.drivableEntries,
    ),
  );
  checks.push(check('playground verification issues', [], verification.issues));
  checks.push(
    check(
      'destructible archetypes',
      destructibleArchetypes.length,
      new Set(plan.definitions.map((entry) => entry.archetype)).size,
    ),
  );

  const isolatedCone = isolatedDefinition(plan, 'CONE');
  const isolatedCrate = isolatedDefinition(plan, 'CRATE');
  const transitions = createHarness();
  const weak = transitions.decor.applyImpact(contact(isolatedCone, 0.5, 1, 'MANUAL'));
  const continuous: string[] = [];
  for (let index = 0; index < 3; index += 1)
    continuous.push(
      transitions.decor.applyImpact(contact(isolatedCone, 0.5, 2 + index, 'MANUAL')).state,
    );
  const strong = transitions.decor.applyImpact(contact(isolatedCone, 40, 5, 'MANUAL'));
  const terminal = transitions.decor.applyImpact(contact(isolatedCone, 400, 6, 'MANUAL'));
  checks.push(check('weak impact leaves the object intact', 'INTACT', weak.state));
  checks.push(
    check(
      'continuous impact reaches MOVED deterministically',
      'MOVED',
      continuous[continuous.length - 1],
    ),
  );
  checks.push(check('strong impact breaks once', 'BROKEN', strong.state));
  checks.push(
    check(
      'BROKEN is terminal inside a generation',
      [null, 1],
      [terminal.eventId, transitions.decor.getStats().duplicateBreaks],
    ),
  );

  const parityRuns = (['MANUAL', 'LEARNING', 'AUTO'] as const).map((source) => {
    const run = createHarness();
    const result = run.decor.applyImpact(contact(isolatedCrate, 120, 1, source));
    return {
      fingerprint: JSON.stringify({
        state: result.state,
        damageNs: result.damageNs,
        eventId: result.eventId,
        payload: result.event?.payload,
        reaction: result.reaction,
      }),
      state: result.state,
      eventId: result.eventId,
    };
  });
  const parityFingerprint = parityRuns[0]!.fingerprint;
  const parityDigest = digest(parityFingerprint);
  checks.push(
    check(
      'MANUAL/LEARNING/AUTO produce one identical outcome',
      [parityDigest, parityDigest, parityDigest],
      parityRuns.map((entry) => digest(entry.fingerprint)),
    ),
  );

  const pair = plan.definitions
    .flatMap((left, index) => plan.definitions.slice(index + 1).map((right) => ({ left, right })))
    .find(
      (candidate) =>
        (candidate.left.archetype === 'CONE' || candidate.left.archetype === 'BIN') &&
        Math.hypot(
          candidate.left.initialTransform.positionM.x -
            candidate.right.initialTransform.positionM.x,
          candidate.left.initialTransform.positionM.z -
            candidate.right.initialTransform.positionM.z,
        ) < DESTRUCTIBLE_LIMITS.chainRadiusM,
    );
  if (!pair) throw new Error('The playground has no bundled pair to demonstrate a chain');
  const chainRun = createHarness();
  const chainResult = chainRun.decor.applyImpact(contact(pair.left, 600, 1, 'LEARNING'));
  const chainChild =
    chainResult.chain.find((entry) => entry.state === 'BROKEN') ?? chainResult.chain[0];
  if (!chainChild) throw new Error('The chain contact produced no neighbour outcome');
  checks.push(
    check(
      'chain instigator is the real object',
      pair.left.objectId,
      brokenPayload(chainChild.event)?.instigatorId ?? null,
    ),
  );
  checks.push(
    check(
      'chain event references both objects',
      true,
      (chainChild.event?.entityIds.length ?? 0) >= 2,
    ),
  );

  const dedupeRun = createHarness();
  const direct = isolatedDefinition(plan, 'CRATE');
  const first = dedupeRun.decor.applyImpact(contact(direct, 120, 1, 'MANUAL'));
  for (let index = 0; index < 3; index += 1)
    dedupeRun.decor.applyImpact(contact(direct, 500, 2 + index, 'AUTO'));
  const repeatStatus = dedupeRun.bus.publish(first.event!).status;
  checks.push(
    check(
      'one DESTRUCTIBLE_BROKEN per object and generation',
      1,
      dedupeRun.bus.getStats().retainedEvents,
    ),
  );
  checks.push(check('a repeated publication is a duplicate', 'duplicate', repeatStatus));

  const lightRun = createHarness();
  const light = lightRun.decor.applyImpact(contact(isolatedCone, 60, 1, 'AUTO'));
  checks.push(
    check(
      'light object cannot act as an invisible wall',
      [false, true],
      [light.reaction.blocking, light.reaction.vehicleDeltaVMps < 0.1],
    ),
  );

  const obstacleRun = createHarness();
  const fence = isolatedDefinition(plan, 'FENCE_LIGHT');
  const fenceStart = fence.initialTransform.positionM;
  const lane = nearestLaneTarget(layout, fenceStart);
  const distance = Math.hypot(lane.positionM.x - fenceStart.x, lane.positionM.z - fenceStart.z);
  const direction = {
    x: (lane.positionM.x - fenceStart.x) / distance,
    z: (lane.positionM.z - fenceStart.z) / distance,
  };
  const moved = obstacleRun.decor.applyImpact({
    tick: 1,
    objectId: fence.objectId,
    impulseNs: fence.impactThreshold.breakImpulseNs - 1,
    pointM: {
      x: fenceStart.x - direction.x * 0.6,
      y: 0.4,
      z: fenceStart.z - direction.z * 0.6,
    },
    instigatorId: 'taxi-227',
    controlSource: 'AUTO',
  });
  const movedState = obstacleRun.decor.getState(fence.objectId);
  const reported = obstacleRun.decor
    .queryObstacles({ centerM: { x: 0, y: 0, z: 0 }, radiusM: 1e6 })
    .find((entry) => entry.objectId === fence.objectId);
  const cameraMessage = errorMessage(() =>
    obstacleRun.decor.queryObstacles({
      centerM: { x: 0, y: 0, z: 0 },
      radiusM: 10,
      camera: 'chase',
    } as never),
  );
  checks.push(
    check(
      'a large object yields but stays an obstacle',
      ['MOVED', true],
      [moved.state, reported?.displaced ?? false],
    ),
  );
  checks.push(
    check(
      'the displaced obstacle lands on the drivable surface',
      true,
      drivableSurfaceAt(layout, movedState.positionM) !== null,
    ),
  );
  checks.push(
    check(
      'the obstacle query accepts no camera input',
      'REFUSED',
      cameraMessage === 'NOT_REFUSED' ? 'ACCEPTED' : 'REFUSED',
    ),
  );

  const structuralRun = createHarness();
  const before = JSON.stringify(layout);
  for (let cycle = 0; cycle < 20; cycle += 1) {
    structuralRun.decor.applyImpact(contact(isolatedCone, 500, cycle + 1, 'MANUAL'));
    structuralRun.decor.reset();
  }
  const structural = verifyStructuralBoundary(layout, structuralRun.decor, before);
  checks.push(
    check(
      'buildings, lanes and STOP/signal rules stay structural',
      [0, true],
      [structural.overlaps.length, structural.untouched],
    ),
  );

  const checkpointRun = createHarness();
  const checkpointCone = isolatedDefinition(plan, 'CONE');
  const checkpointCrate = isolatedDefinition(plan, 'CRATE');
  checkpointRun.decor.applyImpact(contact(checkpointCone, 60, 1, 'MANUAL'));
  checkpointRun.decor.applyImpact(contact(checkpointCrate, 20, 2, 'MANUAL'));
  const snapshot = checkpointRun.decor.capture();
  const bodiesBefore = checkpointRun.decor.getStats().bodies;
  const resetReport = checkpointRun.decor.reset();
  const restored = checkpointRun.decor.restore(snapshot);
  checks.push(
    check(
      'reload restores moved and broken decor exactly',
      [1, 1],
      [
        restored.filter((entry) => entry.state === 'BROKEN').length,
        restored.filter((entry) => entry.state === 'MOVED').length,
      ],
    ),
  );
  checks.push(
    check(
      'reset rebuilds the baseline body count',
      bodiesBefore + snapshot.objects.filter((entry) => entry.state !== 'INTACT').length,
      resetReport.bodies,
    ),
  );

  const cycleRun = createHarness();
  const cycleTarget = plan.definitions[0]!;
  const bodies = new Set<number>();
  const colliders = new Set<number>();
  const fragments = new Set<number>();
  const indexEntries = new Set<number>();
  const eventIds = new Set<string>();
  const checksums = new Set<string>();
  for (let cycle = 0; cycle < 20; cycle += 1) {
    const result = cycleRun.decor.applyImpact(contact(cycleTarget, 500, cycle + 1, 'AUTO'));
    if (result.eventId !== null) eventIds.add(result.eventId);
    const reset = cycleRun.decor.reset();
    bodies.add(reset.bodies);
    colliders.add(reset.colliders);
    fragments.add(reset.fragments);
    indexEntries.add(cycleRun.decor.getStats().indexEntries);
    checksums.add(cycleRun.decor.capture().checksum);
  }
  checks.push(
    check(
      'twenty reset cycles keep bodies, colliders and fragments at the baseline',
      [1, 1, 1, 1, 20],
      [bodies.size, colliders.size, fragments.size, indexEntries.size, eventIds.size],
    ),
  );
  checks.push(check('reset returns to one baseline decor fingerprint', 1, checksums.size));

  const low = createHarness({ preset: 'LOW' });
  const high = createHarness({ preset: 'HIGH' });
  const lowResult = low.decor.applyImpact(contact(isolatedCone, 60, 1, 'AUTO'));
  const highResult = high.decor.applyImpact(contact(isolatedCone, 60, 1, 'AUTO'));
  checks.push(
    check(
      'presentation presets change fragments only',
      [true, true],
      [
        lowResult.state === highResult.state && lowResult.eventId === highResult.eventId,
        low.decor.getStats().fragments < high.decor.getStats().fragments,
      ],
    ),
  );

  const refusals: Record<string, string> = {
    duplicateObjectId: errorMessage(() =>
      createDestructibleDecor({
        context: DESTRUCTIBLE_CONTEXT,
        eventBus: createHarness().bus,
        layout,
        plan: planWith(plan, [...plan.definitions, plan.definitions[0]!]),
      }),
    ),
    structuralObject: errorMessage(() => {
      const building = layout.elements.find((element) => element.kind === 'BUILDING')!;
      return createDestructibleDecor({
        context: DESTRUCTIBLE_CONTEXT,
        eventBus: createHarness().bus,
        layout,
        plan: planWith(plan, [
          ...plan.definitions,
          { ...plan.definitions[0]!, objectId: building.id },
        ]),
      });
    }),
    unknownZone: errorMessage(() =>
      createDestructibleDecor({
        context: DESTRUCTIBLE_CONTEXT,
        eventBus: createHarness().bus,
        layout,
        plan: planWith(plan, [
          ...plan.definitions,
          {
            ...plan.definitions[0]!,
            objectId: 'destructible:probe:unknown-zone',
            zoneId: 'zone:none',
          },
        ]),
      }),
    ),
    offSurface: errorMessage(() =>
      createDestructibleDecor({
        context: DESTRUCTIBLE_CONTEXT,
        eventBus: createHarness().bus,
        layout,
        plan: planWith(plan, [
          ...plan.definitions,
          {
            ...plan.definitions[0]!,
            objectId: 'destructible:probe:off-surface',
            initialTransform: {
              positionM: { x: -500, y: 0, z: -500 },
              headingRad: 0,
            },
          },
        ]),
      }),
    ),
    invalidThreshold: errorMessage(() =>
      createDestructibleDecor({
        context: DESTRUCTIBLE_CONTEXT,
        eventBus: createHarness().bus,
        layout,
        plan: planWith(plan, [
          ...plan.definitions,
          {
            ...plan.definitions[0]!,
            objectId: 'destructible:probe:bad-threshold',
            impactThreshold: { moveImpulseNs: 50, breakImpulseNs: 10 },
          },
        ]),
      }),
    ),
    capacity: errorMessage(() =>
      createDestructibleDecor({
        context: DESTRUCTIBLE_CONTEXT,
        eventBus: createHarness().bus,
        layout,
        plan: planWith(
          plan,
          Array.from({ length: DESTRUCTIBLE_LIMITS.maxObjects + 1 }, (_, index) => ({
            ...plan.definitions[0]!,
            objectId: `destructible:probe:overflow:${index}`,
          })),
        ),
      }),
    ),
  };
  checks.push(
    check(
      'invalid input is refused',
      6,
      Object.values(refusals).filter((message) => message !== 'NOT_REFUSED').length,
    ),
  );

  const parityCount = parityRuns.filter((entry) => entry.fingerprint === parityFingerprint).length;
  const stats = chainRun.decor.getStats();
  const snapshotJson = JSON.stringify(snapshot);
  const report: DestructibleDecorReport = {
    version: DESTRUCTIBLE_DECOR_VERSION,
    fixture: '227-destructible-decor-v1',
    mapId: layout.mapId,
    playground: {
      zones: plan.stats.zones,
      zonesByKind: plan.stats.zonesByKind,
      entries: plan.stats.entries,
      routes: plan.stats.routes,
      drivableEntries: plan.stats.drivableEntries,
      landmarks: plan.stats.landmarks,
      destructibles: plan.stats.destructibles,
      archetypes: new Set(plan.definitions.map((entry) => entry.archetype)).size,
      ramp: ramp?.ramp
        ? { lengthM: ramp.ramp.lengthM, widthM: ramp.ramp.widthM, riseM: ramp.ramp.riseM }
        : null,
      alley: alley ? { zoneId: alley.zoneId, destructibles: alley.destructibleIds.length } : null,
      issues: verification.issues,
    },
    calibration: {
      label: 'PROVISIONAL_UNCALIBRATED',
      formula: 'impulse = massKg * objectSpeed',
      archetypes: destructibleArchetypes.map((archetype) => {
        const spec = DESTRUCTIBLE_ARCHETYPES[archetype];
        const definition = definitionOf(plan, archetype);
        return {
          archetype,
          massKg: spec.massKg,
          obstacleClass: spec.obstacleClass,
          moveImpulseNs: definition.impactThreshold.moveImpulseNs,
          breakImpulseNs: definition.impactThreshold.breakImpulseNs,
          fragments: spec.fragmentCount,
        };
      }),
    },
    transitions: {
      weak: { state: weak.state, damageNs: weak.damageNs, event: weak.eventId !== null },
      continuous,
      strong: {
        state: strong.state,
        damageNs: strong.damageNs,
        event: strong.eventId === null ? 'NONE' : 'DESTRUCTIBLE_BROKEN',
      },
      terminal: terminal.eventId === null && terminal.changedState === false,
      duplicateBreaks: transitions.decor.getStats().duplicateBreaks,
    },
    controlSourceParity: {
      sources: ['MANUAL', 'LEARNING', 'AUTO'],
      identical: parityCount === 3,
      fingerprint: parityFingerprint,
      counts: { MANUAL: 1, LEARNING: 1, AUTO: 1 },
    },
    chain: {
      parent: pair.left.objectId,
      child: chainChild.objectId,
      childState: chainChild.state,
      instigator: brokenPayload(chainChild.event)?.instigatorId ?? null,
      entityIds: chainChild.event?.entityIds ?? [],
      events: chainResult.chain.filter((entry) => entry.eventId !== null).length,
    },
    dedupe: {
      attempts: 4,
      events: dedupeRun.decor.getStats().brokenEvents,
      busRetained: dedupeRun.bus.getStats().retainedEvents,
      repeatStatus,
      duplicateBreaks: dedupeRun.decor.getStats().duplicateBreaks,
    },
    lightReaction: {
      archetype: 'CONE',
      impulseNs: 60,
      reactionImpulseNs: light.reaction.impulseNs,
      vehicleDeltaVMps: light.reaction.vehicleDeltaVMps,
      blocking: light.reaction.blocking,
    },
    largeObstacle: {
      objectId: fence.objectId,
      state: movedState.state,
      displacementM: movedState.displacementM,
      laneId: drivableSurfaceAt(layout, movedState.positionM)?.laneId ?? null,
      reported: reported !== undefined,
      cameraInputAccepted: cameraMessage === 'NOT_REFUSED',
    },
    structural: {
      structuralIds: structural.structuralIds,
      destructibleIds: structural.destructibleIds,
      overlaps: structural.overlaps.length,
      untouched: structural.untouched,
      cycles: 20,
    },
    checkpoint: {
      bytes: Buffer.byteLength(snapshotJson, 'utf8'),
      checksum: snapshot.checksum,
      broken: snapshot.objects.filter((entry) => entry.state === 'BROKEN').length,
      moved: snapshot.objects.filter((entry) => entry.state === 'MOVED').length,
      restoredBroken: restored.filter((entry) => entry.state === 'BROKEN').length,
      restoredMoved: restored.filter((entry) => entry.state === 'MOVED').length,
      generation: checkpointRun.decor.getStats().generation,
      bodiesBefore,
      bodiesAfterReset: resetReport.bodies,
    },
    resetCycles: {
      cycles: 20,
      bodies: [...bodies],
      colliders: [...colliders],
      fragments: [...fragments],
      indexEntries: [...indexEntries],
      distinctEvents: eventIds.size,
      distinctChecksums: checksums.size,
    },
    presets: {
      low: {
        state: lowResult.state,
        fragments: low.decor.getStats().fragments,
        eventId: lowResult.eventId,
      },
      high: {
        state: highResult.state,
        fragments: high.decor.getStats().fragments,
        eventId: highResult.eventId,
      },
      gameplayIdentical:
        lowResult.state === highResult.state && lowResult.eventId === highResult.eventId,
    },
    performance: {
      simulation: {
        objects: stats.objects,
        bodies: stats.bodies,
        colliders: stats.colliders,
        evaluatedObjects: stats.evaluatedObjects,
        indexEntries: stats.indexEntries,
        indexCells: stats.indexCells,
        chainEvents: stats.chainBreaks,
      },
      assets: {
        textures: 0,
        meshes: 0,
        note: 'No texture, mesh or material is added by PBI 227; fragment presets are presentation budgets owned with 146/228.',
      },
      memory: {
        snapshotBytes: Buffer.byteLength(snapshotJson, 'utf8'),
        bodies: resetReport.bodies,
        colliders: resetReport.colliders,
        fragments: resetReport.fragments,
        heapBytes: null,
      },
      frame: {
        status: 'NOT_MEASURED',
        note: 'No browser, hardware or FPS measurement was executed; the deterministic structural cost is reported instead.',
      },
      budgets: {
        destructionBodies: budgets.proposedCapacities.destructionBodies,
        physicsObstacles: budgets.resourceAdmissionContracts.physics.obstacles,
        physicsBodies: budgets.resourceAdmissionContracts.physics.bodies,
        physicsColliders: budgets.resourceAdmissionContracts.physics.colliders,
        maxObjects: DESTRUCTIBLE_LIMITS.maxObjects,
        status: 'FINITE_PROVISIONAL_ADMISSION_NOT_GAMEPLAY_CALIBRATION',
      },
    },
    refusals,
    checks,
    summary: {
      checks: checks.length,
      passed: checks.filter((entry) => entry.pass).length,
      pass: checks.every((entry) => entry.pass),
    },
  };
  return report;
}

export function destructibleDecorReportMarkdown(report: DestructibleDecorReport): string {
  const rows = report.checks
    .map(
      (entry) =>
        `| ${entry.name} | ${JSON.stringify(entry.expected)} | ${JSON.stringify(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} |`,
    )
    .join('\n');
  const archetypes = report.calibration.archetypes
    .map(
      (entry) =>
        `| ${entry.archetype} | ${entry.massKg} | ${entry.moveImpulseNs} | ${entry.breakImpulseNs} | ${entry.obstacleClass} |`,
    )
    .join('\n');
  return `# Raport determinist PBI 227 — decor destructibil și zone de joacă

Fixture: \`${report.fixture}\` · mapă: \`${report.mapId}\` · contract: \`${report.version}\`.

## Zone de joacă (date derivate din layout)

- Zone: ${report.playground.zones} (${Object.entries(report.playground.zonesByKind)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(', ')})
- Intrări: ${report.playground.entries}, rute: ${report.playground.routes}, intrări accesibile fără mers pe jos: ${report.playground.drivableEntries}
- Repere: ${report.playground.landmarks}, destructibile: ${report.playground.destructibles}, arhetipuri: ${report.playground.archetypes}
- Rampă: ${report.playground.ramp ? `${report.playground.ramp.lengthM} m lungime, ${report.playground.ramp.widthM} m lățime, ${report.playground.ramp.riseM} m înălțime` : 'absentă'}
- Alee: ${report.playground.alley?.zoneId ?? 'absentă'}
- Probleme de verificare: ${report.playground.issues.length}

## Calibrare provizorie (impuls = masă × viteză a obiectului)

| Arhetip | Masă (kg) | Prag deplasare (N·s) | Prag rupere (N·s) | Clasă |
| --- | --- | --- | --- | --- |
${archetypes}

## Tranziții

- Impact slab: ${report.transitions.weak.state} (${report.transitions.weak.damageNs} N·s), eveniment: ${report.transitions.weak.event}
- Impact continuu: ${report.transitions.continuous.join(' → ')}
- Impact puternic: ${report.transitions.strong.state} (${report.transitions.strong.damageNs} N·s), eveniment: ${report.transitions.strong.event}
- Terminal după rupere: ${report.transitions.terminal}, duplicate: ${report.transitions.duplicateBreaks}

## Aceeași fizică pentru toate sursele de control

- Surse: ${report.controlSourceParity.sources.join(', ')}, identice: ${report.controlSourceParity.identical}
- Amprentă comună: \`${report.controlSourceParity.fingerprint}\`

## Lanț și deduplicare

- Lanț: ${report.chain.parent} → ${report.chain.child} (${report.chain.childState}), instigator real: ${report.chain.instigator}
- ${report.dedupe.attempts} impacturi, ${report.dedupe.events} evenimente, bus păstrează ${report.dedupe.busRetained}, reluare: ${report.dedupe.repeatStatus}

## Obiecte ușoare și obstacole mari

- Reacție con: ${report.lightReaction.reactionImpulseNs} N·s → ${report.lightReaction.vehicleDeltaVMps} m/s pe 1400 kg, blocant: ${report.lightReaction.blocking}
- Gard deplasat: ${report.largeObstacle.displacementM} m, bandă: ${report.largeObstacle.laneId ?? 'n/a'}, raportat: ${report.largeObstacle.reported}, cameră acceptată: ${report.largeObstacle.cameraInputAccepted}

## Structural, checkpoint și reset

- IDs structurale: ${report.structural.structuralIds}, destructibile: ${report.structural.destructibleIds}, suprapuneri: ${report.structural.overlaps}, layout neatins: ${report.structural.untouched}
- Snapshot: ${report.checkpoint.bytes} bytes, ${report.checkpoint.checksum}; refăcute: ${report.checkpoint.restoredBroken} BROKEN, ${report.checkpoint.restoredMoved} MOVED
- Reset: corpuri ${report.checkpoint.bodiesBefore} → ${report.checkpoint.bodiesAfterReset}
- 20 cicluri: corpuri ${report.resetCycles.bodies.join('/')}, collidere ${report.resetCycles.colliders.join('/')}, fragmente ${report.resetCycles.fragments.join('/')}, evenimente distincte ${report.resetCycles.distinctEvents}, amprente ${report.resetCycles.distinctChecksums}
- Preseturi: LOW ${report.presets.low.state} (${report.presets.low.fragments} fragmente) vs HIGH ${report.presets.high.state} (${report.presets.high.fragments}), gameplay identic: ${report.presets.gameplayIdentical}

## Performanță structurală

- simulation: ${report.performance.simulation.objects} obiecte, ${report.performance.simulation.bodies} corpuri, ${report.performance.simulation.colliders} collidere, ${report.performance.simulation.evaluatedObjects} obiecte evaluate, ${report.performance.simulation.indexEntries} intrări în index (${report.performance.simulation.indexCells} celule)
- assets: ${report.performance.assets.textures} texturi, ${report.performance.assets.meshes} meshuri
- memory: snapshot ${report.performance.memory.snapshotBytes} bytes, heap ${String(report.performance.memory.heapBytes)}
- frame: ${report.performance.frame.status}
- buget destructionBodies: ${String(report.performance.budgets.destructionBodies)} (lacună raportată); plafon propriu: ${report.performance.budgets.maxObjects}

## Verificări

| Verificare | Așteptat | Real | Rezultat |
| --- | --- | --- | --- |
${rows}

Rezumat: ${report.summary.passed}/${report.summary.checks} verificări, ${report.summary.pass ? 'PASS' : 'FAIL'}.
`;
}
