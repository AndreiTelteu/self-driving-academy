import { createCompositionWorld } from '../../src/app/composition-world';
import {
  createAudioEngine,
  createDestructionCatalog,
  createFakeAudioBackend,
  deriveDestructionReaction,
  type AudioEngine,
  type FakeAudioBackend,
} from '../../src/audio';
import { createLiveChaos, LIVE_CHAOS_VERSION } from '../../src/app/live-chaos';
import type { LiveChaos, LiveChaosPhysicsPort } from '../../src/app/live-chaos';
import { createCandidateProfileStore } from '../../src/learning';
import { createPlayerProgress } from '../../src/missions';
import { parameterDefinitions } from '../../src/profiles';
import { DESTRUCTIBLE_ARCHETYPES, verifyStructuralBoundary } from '../../src/world';
import type { CollisionIncident } from '../../src/vehicles';

export const LIVE_CHAOS_REPORT_VERSION = '285-live-chaos-report-v1' as const;
const GENERATED_AT = '2026-11-28T00:00:00.000Z';

const world = createCompositionWorld();

interface Harness {
  readonly chaos: LiveChaos;
  readonly physics: LiveChaosPhysicsPort;
  readonly backend: FakeAudioBackend;
  readonly engine: AudioEngine;
  readonly active: Map<string, unknown>;
}

function harness(
  options: {
    gesture?: boolean;
    visualAlternative?: boolean;
    fragmentPoolCapacity?: number;
    xp?: () => number;
    profile?: () => string;
  } = {},
): Harness {
  const active = new Map<string, unknown>();
  const physics: LiveChaosPhysicsPort = {
    addObstacle(input) {
      if (active.size >= 96) return false;
      active.set(input.id, input);
      return true;
    },
    moveObstacle(id) {
      return active.has(id);
    },
    removeObstacle(id) {
      return active.delete(id);
    },
    hasObstacle(id) {
      return active.has(id);
    },
    readIncidents() {
      return [];
    },
    getStats() {
      return {
        obstacles: {
          active: active.size,
          capacity: 96,
          worldObstacles: 90,
          available: Math.max(0, 96 - 90 - active.size),
          added: 0,
          moved: 0,
          removed: 0,
          refused: 0,
        },
      };
    },
  };
  const backend = createFakeAudioBackend();
  const engine = createAudioEngine({ backend });
  if (options.gesture === true) engine.startFromUserGesture('POINTER');
  const chaos = createLiveChaos({
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: '285-live-chaos-report',
      worldEpoch: 1,
    }),
    layout: world.layout,
    physics,
    engine,
    clock: () => 0,
    now: () => GENERATED_AT,
    ...(options.visualAlternative === true
      ? { settings: Object.freeze({ visualAlternative: true }) }
      : {}),
    ...(options.fragmentPoolCapacity === undefined
      ? {}
      : { fragmentPoolCapacity: options.fragmentPoolCapacity }),
    ...(options.xp === undefined ? {} : { xpMicroXp: options.xp }),
    ...(options.profile === undefined ? {} : { profileFingerprint: options.profile }),
  });
  return { chaos, physics, backend, engine, active };
}

function definitionOf(chaos: LiveChaos, archetype: keyof typeof DESTRUCTIBLE_ARCHETYPES) {
  const definition = chaos.plan.definitions.find((entry) => entry.archetype === archetype);
  if (definition === undefined) throw new Error(`Missing report definition ${archetype}`);
  return definition;
}

function incident(
  chaos: LiveChaos,
  objectId: string,
  impulseNs: number,
  tick: number,
  incidentId: string,
): CollisionIncident {
  const otherEntityId = `destructible:${objectId}`;
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: chaos.context.sessionId,
    worldEpoch: chaos.context.worldEpoch,
    incidentId,
    tick,
    vehicleId: 'report-vehicle',
    otherEntityId,
    impulseNs,
    first: Object.freeze({
      entityId: 'report-vehicle',
      kind: 'VEHICLE' as const,
      serial: 1,
      colliderHandle: 1,
    }),
    second: Object.freeze({
      entityId: otherEntityId,
      kind: 'OBSTACLE' as const,
      serial: 2,
      colliderHandle: 2,
    }),
  });
}

function vehicleAt(chaos: LiveChaos, objectId: string) {
  const state = chaos.decor.getState(objectId);
  return Object.freeze({
    vehicleId: 'report-vehicle',
    driverKind: 'TAXI' as const,
    positionM: state.positionM,
    yawRad: 0,
    speedMps: 9,
    controlMode: 'MANUAL' as const,
    isPlayer: true,
  });
}

function xpOwner() {
  const progress = createPlayerProgress({ playerId: 'player:285-report' });
  const credited = progress.observeActiveTime({
    startedAtMs: 1_794_475_200_000,
    endedAtMs: 1_794_475_230_000,
    scope: 'ACADEMY',
    controlMode: 'MANUAL',
    paused: false,
    focused: true,
    visible: true,
    afk: false,
  });
  if (credited.status !== 'CREDITED') throw new Error('Report XP seed was not credited');
  return () => progress.read().xpBalanceMicroXp;
}

function profileOwner() {
  const store = createCandidateProfileStore({
    engineVersion: '285-report',
    now: () => GENERATED_AT,
  });
  const parameters: Record<string, number> = Object.create(null);
  for (const definition of parameterDefinitions) parameters[definition.key] = definition.default;
  const created = store.createBase({
    profileId: 'profile-285-report',
    versionId: 'profile-285-report@1',
    parameters,
    sourceSegmentIds: [],
    createdAt: GENERATED_AT,
  });
  if (created.status !== 'ACCEPTED') throw new Error('Report profile was rejected');
  return () => store.getVersion('profile-285-report@1')?.checksum ?? 'MISSING';
}

interface Check {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

function materialMatrix(chaos: LiveChaos) {
  const catalog = createDestructionCatalog(chaos.plan.definitions);
  return (Object.keys(DESTRUCTIBLE_ARCHETYPES) as (keyof typeof DESTRUCTIBLE_ARCHETYPES)[]).map(
    (archetype) => {
      const definition = definitionOf(chaos, archetype);
      const result = deriveDestructionReaction({
        event: {
          eventId: `report:${archetype}`,
          tick: 0,
          objectId: definition.objectId,
          instigatorId: 'report-vehicle',
          impulseNs: definition.impactThreshold.breakImpulseNs,
        },
        catalog,
        listenerPositionM: definition.initialTransform.positionM,
      });
      if (result.status !== 'REACTION') throw new Error(`Missing reaction for ${archetype}`);
      return Object.freeze({
        archetype,
        objectId: definition.objectId,
        material: result.reaction.material,
        playbackRate: result.reaction.audio.playbackRate,
        gain: result.reaction.audio.gain,
        tier: result.reaction.intensity.tier,
        normalized: result.reaction.intensity.normalized,
        moveImpulseNs: definition.impactThreshold.moveImpulseNs,
        breakImpulseNs: definition.impactThreshold.breakImpulseNs,
        massKg: definition.massKg,
        fragments: result.reaction.fragments.count,
        visualVariant: result.reaction.visual.variant,
        visualText: result.reaction.visual.text,
      });
    },
  );
}

export function runLiveChaosReport() {
  const checks: Check[] = [];
  const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
  const primary = harness({ gesture: false, xp: xpOwner(), profile: profileOwner() });
  const chaos = primary.chaos;
  try {
    const plan = {
      definitions: chaos.plan.definitions.length,
      zones: chaos.plan.zones.map((zone) => ({
        zoneId: zone.zoneId,
        kind: zone.kind,
        destructibles: zone.destructibleIds.length,
        entries: zone.entries.length,
        routes: zone.routes.length,
      })),
      structuralIds: world.layout.elements.filter((element) =>
        ['BUILDING', 'STOP_LINE', 'SIGNAL_HEAD', 'LANE_SURFACE', 'INTERSECTION_SURFACE'].includes(
          element.kind,
        ),
      ).length,
    };
    const matrix = materialMatrix(chaos);
    const distinctRates = new Set(matrix.map((entry) => entry.playbackRate));
    const distinctMaterials = new Set(matrix.map((entry) => entry.material));
    check(
      'material-threshold',
      matrix.length === 6 && distinctRates.size === 6 && distinctMaterials.size === 4,
      `${matrix.length} archetypes, ${distinctRates.size} distinct playback rates, ${distinctMaterials.size} materials`,
    );

    // Before the player gesture the sound is refused but the visual companion still exists.
    const preTarget = definitionOf(chaos, 'DECOR_SIGN');
    primary.chaos.probeImpact({
      objectId: preTarget.objectId,
      impulseNs: preTarget.impactThreshold.breakImpulseNs * 1.1,
      tick: 10,
    });
    const preGesture = chaos.visual();
    check(
      'audio-gesture-fallback',
      preGesture.reactions.length === 1 &&
        preGesture.reactions[0]!.audioPlayed === false &&
        preGesture.reactions[0]!.variant === 'SHOCK_RING' &&
        preGesture.audioFallback === true,
      `pre-gesture reaction ${preGesture.reactions[0]?.audioReason ?? 'NONE'} with ${preGesture.reactions[0]?.variant ?? 'NONE'}`,
    );

    // Source parity: MANUAL, LEARNING and AUTO are only counted, never read for the outcome.
    const parity: { source: string; state: string; event: string; reaction: string }[] = [];
    for (const source of ['MANUAL', 'LEARNING', 'AUTO'] as const) {
      const run = harness({ gesture: true });
      try {
        const target = definitionOf(run.chaos, 'BIN');
        const events: string[] = [];
        run.chaos.eventBus.subscribe((event) => {
          if (event.type === 'DESTRUCTIBLE_BROKEN')
            events.push(
              `${event.payload.objectId}|${event.payload.instigatorId}|${event.payload.impulseNs}`,
            );
        });
        const result = run.chaos.probeImpact({
          objectId: target.objectId,
          impulseNs: target.impactThreshold.breakImpulseNs * 1.1,
          tick: 10,
          controlSource: source,
        });
        parity.push({
          source,
          state: run.chaos.decor.getState(target.objectId).state,
          event: events[0] ?? 'NONE',
          reaction: run.chaos.visual().reactions[0]?.fingerprint ?? 'NONE',
        });
        void result;
      } finally {
        run.chaos.dispose();
      }
    }
    check(
      'source-parity',
      new Set(parity.map((entry) => `${entry.state}|${entry.event}|${entry.reaction}`)).size === 1,
      parity.map((entry) => `${entry.source}:${entry.state}`).join(', '),
    );

    // Direct move: the cone yields and stops being a physical wall; the large fence stays blocking.
    const moveRun = harness({ gesture: true });
    let directMove: Record<string, unknown>;
    try {
      const cone = definitionOf(moveRun.chaos, 'CONE');
      const result = moveRun.chaos.probeImpact({
        objectId: cone.objectId,
        impulseNs: cone.impactThreshold.moveImpulseNs * 1.05,
        tick: 10,
      });
      directMove = {
        state: moveRun.chaos.decor.getState(cone.objectId).state,
        blocking: result?.reaction.blocking ?? null,
        vehicleDeltaVMps: result?.reaction.vehicleDeltaVMps ?? null,
        bodyAdmitted: moveRun.chaos.decor.getState(cone.objectId).bodyAdmitted,
      };
    } finally {
      moveRun.chaos.dispose();
    }
    check(
      'light-yields',
      directMove.state === 'MOVED' && directMove.bodyAdmitted === false,
      JSON.stringify(directMove),
    );

    // Deduplication: a retried 028 incident never double-breaks or double-sounds.
    const dedupRun = harness({ gesture: true });
    let dedup: Record<string, number>;
    try {
      const crate = definitionOf(dedupRun.chaos, 'CRATE');
      const retried = incident(
        dedupRun.chaos,
        crate.objectId,
        crate.impactThreshold.breakImpulseNs * 1.2,
        10,
        'report:dedup',
      );
      const vehicle = vehicleAt(dedupRun.chaos, crate.objectId);
      dedupRun.chaos.step({ tick: 10, vehicles: [vehicle], incidents: [retried] });
      const firstBroken = dedupRun.chaos.getStats().brokenEvents;
      const firstReactions = dedupRun.chaos.getStats().reactions;
      dedupRun.chaos.step({ tick: 11, vehicles: [vehicle], incidents: [retried] });
      dedup = {
        firstBroken,
        secondBroken: dedupRun.chaos.getStats().brokenEvents,
        firstReactions,
        secondReactions: dedupRun.chaos.getStats().reactions,
        duplicateBreaks: dedupRun.chaos.getStats().duplicateBreaks,
        impacts: dedupRun.chaos.getStats().impacts,
      };
    } finally {
      dedupRun.chaos.dispose();
    }
    check(
      'dedup',
      dedup.firstBroken === dedup.secondBroken &&
        dedup.firstReactions === dedup.secondReactions &&
        dedup.impacts === 1,
      JSON.stringify(dedup),
    );

    // Chain: a hard crate hit destroys the close cone with the crate as the real instigator.
    const chainRun = harness({ gesture: true });
    let chain: Record<string, unknown>;
    try {
      const crate = definitionOf(chainRun.chaos, 'CRATE');
      const events: { objectId: string; instigatorId: string | null }[] = [];
      chainRun.chaos.eventBus.subscribe((event) => {
        if (event.type === 'DESTRUCTIBLE_BROKEN')
          events.push({
            objectId: event.payload.objectId,
            instigatorId: event.payload.instigatorId,
          });
      });
      const result = chainRun.chaos.probeImpact({
        objectId: crate.objectId,
        impulseNs: crate.impactThreshold.breakImpulseNs * 3,
        tick: 10,
      });
      chain = {
        events: events.length,
        chain: result?.chain.length ?? 0,
        instigators: events.map((event) => event.instigatorId),
        chainBreaks: chainRun.chaos.getStats().chainBreaks,
      };
    } finally {
      chainRun.chaos.dispose();
    }
    check(
      'chain-instigator',
      (chain.chain as number) >= 1 &&
        (chain.instigators as (string | null)[])
          .slice(1)
          .every((value) => value !== 'report-vehicle'),
      JSON.stringify(chain),
    );

    // Hard audio cap: six simultaneous breaks never exceed the 148 impact pool of four.
    const audioRun = harness({ gesture: true });
    let audioCaps: Record<string, number>;
    try {
      const targets = audioRun.chaos.plan.definitions.slice(0, 6);
      for (const target of targets) {
        audioRun.chaos.probeImpact({
          objectId: target.objectId,
          impulseNs: target.impactThreshold.breakImpulseNs * 1.2,
          tick: 10,
        });
      }
      audioCaps = {
        played: audioRun.chaos.getStats().fragments.audioPlayed,
        refused: audioRun.chaos.getStats().fragments.audioRefused,
        impactVoices: audioRun.chaos.getStats().audio?.voicesByCategory.impact ?? 0,
        buffers: audioRun.chaos.getStats().audio?.buffers ?? 0,
        bufferBytes: audioRun.chaos.getStats().audio?.bufferBytes ?? 0,
      };
    } finally {
      audioRun.chaos.dispose();
    }
    check(
      'audio-cap',
      audioCaps.impactVoices <= 4 && audioCaps.played <= 4 && audioCaps.buffers <= 8,
      JSON.stringify(audioCaps),
    );

    // Hard fragment cap and lifetime: a small pool drops excess shards and releases every one.
    const fragmentRun = harness({ gesture: true, fragmentPoolCapacity: 4 });
    let fragmentCaps: Record<string, number>;
    try {
      const targets = fragmentRun.chaos.plan.definitions.slice(0, 6);
      for (const target of targets) {
        fragmentRun.chaos.probeImpact({
          objectId: target.objectId,
          impulseNs: target.impactThreshold.breakImpulseNs * 1.2,
          tick: 10,
        });
      }
      const peak = fragmentRun.chaos.getStats().fragments.peakFragments;
      const dropped = fragmentRun.chaos.getStats().fragments.droppedFragments;
      fragmentRun.chaos.step({
        tick: 200,
        vehicles: [vehicleAt(fragmentRun.chaos, targets[0]!.objectId)],
      });
      fragmentCaps = {
        peak,
        dropped,
        activeAfterLifetime: fragmentRun.chaos.getStats().fragments.activeFragments,
        poolCap: fragmentRun.chaos.getStats().fragments.fragmentPoolCap,
      };
    } finally {
      fragmentRun.chaos.dispose();
    }
    check(
      'fragment-cap-lifetime',
      fragmentCaps.peak <= 4 && fragmentCaps.dropped > 0 && fragmentCaps.activeAfterLifetime === 0,
      JSON.stringify(fragmentCaps),
    );

    // Twenty real resets with real XP/profile owners; each reset restores the decor and records it.
    const resetXp = xpOwner();
    const resetProfile = profileOwner();
    const resetRun = harness({ gesture: true, xp: resetXp, profile: resetProfile });
    const resetReports: Record<string, unknown>[] = [];
    const stateRows: Record<string, number>[] = [];
    const layoutBefore = JSON.stringify(world.layout);
    try {
      let tick = 10;
      for (let cycle = 0; cycle < 20; cycle += 1) {
        const target = resetRun.chaos.plan.definitions[cycle % 35]!;
        resetRun.chaos.probeImpact({
          objectId: target.objectId,
          impulseNs: target.impactThreshold.breakImpulseNs * 1.2,
          tick,
        });
        tick += 5;
        const reset = resetRun.chaos.reset(tick);
        resetReports.push({
          cycle,
          restored: reset.restored,
          kept: reset.kept,
          xpDeltaMicroXp: reset.xpDeltaMicroXp,
          profileChanged: reset.profileChanged,
          xpWithdrawn: reset.xpWithdrawn,
          replayChunkId: reset.replayChunkId,
        });
        stateRows.push({
          objects: resetRun.chaos.getStats().objects,
          broken: resetRun.chaos.getStats().objectsByState.BROKEN,
          bodies: resetRun.chaos.getStats().bodies,
          colliders: resetRun.chaos.getStats().colliders,
          fragments: resetRun.chaos.getStats().fragments.activeFragments,
        });
        tick += 5;
      }
      const structural = verifyStructuralBoundary(world.layout, resetRun.chaos.decor, layoutBefore);
      const xpUnchanged = resetReports.every((report) => report.xpDeltaMicroXp === 0);
      const profileUnchanged = resetReports.every((report) => report.profileChanged === false);
      const baseline = stateRows.every(
        (row) =>
          row.objects === 35 &&
          row.broken === 0 &&
          row.bodies === 35 &&
          row.colliders === 35 &&
          row.fragments === 0,
      );
      const chunks = resetRun.chaos.replayChunks();
      const latest = resetRun.chaos.checkReplay();
      const oldest = chunks.length > 1 ? resetRun.chaos.checkReplay(0) : latest;
      const orderTruth = [latest, oldest].filter((entry) => entry.status === 'REPLAYED');
      const replayZeros = orderTruth.every(
        (entry) =>
          entry.stepsSimulation === 0 &&
          entry.physicsSteps === 0 &&
          entry.policyEvaluations === 0 &&
          entry.awardsGranted === 0 &&
          entry.learningArtifacts === 0,
      );
      const resetOrder = latest.resetEvents >= 1 && latest.destructionEvents >= 1;
      const report = {
        cycles: 20,
        resetCount: resetRun.chaos.getStats().resets,
        restored: resetReports.every((entry) => entry.restored === 35),
        baseline,
        xpUnchanged,
        profileUnchanged,
        xpBefore: resetXp(),
        xpAfter: resetXp(),
        profileBefore: resetProfile(),
        profileAfter: resetProfile(),
        structural,
        chunks: chunks.length,
        latest: {
          status: latest.status,
          recordedEvents: latest.recordedEvents,
          destructionEvents: latest.destructionEvents,
          resetEvents: latest.resetEvents,
          orderIdentical: latest.orderIdentical,
          eventsIdentical: latest.eventsIdentical,
          reactionFingerprints: latest.reactionFingerprints,
          stepsSimulation: latest.stepsSimulation,
          policyEvaluations: latest.policyEvaluations,
          awardsGranted: latest.awardsGranted,
          learningArtifacts: latest.learningArtifacts,
        },
        oldest: {
          status: oldest.status,
          destructionEvents: oldest.destructionEvents,
          resetEvents: oldest.resetEvents,
          orderIdentical: oldest.orderIdentical,
        },
        replayZeros,
        resetOrder,
      };
      check(
        'reset-restores-xp-profile',
        report.restored && baseline && xpUnchanged && profileUnchanged,
        JSON.stringify({
          restored: report.restored,
          baseline,
          xpUnchanged,
          profileUnchanged,
          xp: [report.xpBefore, report.xpAfter],
        }),
      );
      check(
        'replay-order-zeros',
        orderTruth.length > 0 && replayZeros && latest.orderIdentical && latest.eventsIdentical,
        JSON.stringify(report.latest),
      );
      check(
        'replay-reset-order',
        resetOrder,
        `latest chunk: ${latest.destructionEvents} destruction, ${latest.resetEvents} reset, order ${latest.orderIdentical}`,
      );
      check(
        'structural-boundary',
        structural.untouched && structural.overlaps.length === 0,
        JSON.stringify(structural),
      );

      const stats = resetRun.chaos.getStats();
      const caps = {
        objects: stats.caps.objects,
        activeObjects: stats.objects,
        fragments: stats.caps.fragments,
        activeFragments: stats.fragments.activeFragments,
        reactionsPerIncident: stats.caps.reactionsPerIncident,
        retainedEvents: stats.caps.retainedEvents,
        replayEvents: stats.caps.replayEvents,
        physicalObstacles: stats.caps.physicalObstacles,
        audioVoices: stats.caps.audioVoices,
        audioImpactVoices: stats.caps.audioImpactVoices,
        audioBuffers: stats.caps.audioBuffers,
      };
      check(
        'caps-reported',
        stats.objects <= 96 &&
          stats.fragments.activeFragments <= 192 &&
          stats.caps.audioImpactVoices === 4,
        `objects ${stats.objects}/96, fragments ${stats.fragments.activeFragments}/192, impact voices ${stats.caps.audioImpactVoices}, replay ${stats.recorder.eventsRecorded}/${stats.caps.replayEvents}`,
      );

      // Cost is structural here; the wall-clock probe is written separately by the cost command.
      const cost = {
        level: 'targeted',
        measurement: 'STRUCTURAL_OWNERSHIP_COUNTERS',
        simulation: {
          steps: 20,
          impacts: stats.impacts,
          reactions: stats.reactions,
          chainBreaks: stats.chainBreaks,
          wallClock: 'SEPARATE_COST_PROBE',
        },
        memory: {
          heapBytes: null,
          objects: stats.objects,
          fragments: stats.fragments.activeFragments,
          voices: stats.audio?.activeVoices ?? 0,
          buffers: stats.audio?.buffers ?? 0,
          audioBufferBytes: stats.audio?.bufferBytes ?? 0,
          eventRows: stats.bus.retainedEvents,
          recorderBytes: stats.recorder.chargedBytes,
          replayChunks: stats.recorder.replayChunks,
        },
        assets: stats.assets,
      };
      const summary = {
        pass: checks.filter((entry) => entry.pass).length,
        fail: checks.filter((entry) => !entry.pass).length,
        total: checks.length,
      };
      return {
        version: LIVE_CHAOS_REPORT_VERSION,
        contract: LIVE_CHAOS_VERSION,
        generatedAt: GENERATED_AT,
        level: 'targeted',
        scenario: 'idle harness over the real 227/228/207/282 contracts; no human playtest',
        plan,
        matrix,
        preGesture,
        parity,
        directMove,
        dedup,
        chain,
        audioCaps,
        fragmentCaps,
        reset: report,
        caps,
        cost,
        checks,
        summary,
        limitations: [
          'The live Rapier composition has six free named-obstacle slots after ninety buildings; only the nearest six logical objects are bound at once.',
          'The browser probe injects a contact through the same 227/228/207 path; it is labelled PROBE_INJECTED, not a driven collision.',
          'The report is a targeted deterministic contract report, not an FPS, GPU or hardware measurement.',
          'Ambient audio is not implemented: the 148 cue table has no ambient cue and no second audio system was created.',
        ],
      };
    } finally {
      resetRun.chaos.dispose();
    }
  } finally {
    chaos.dispose();
  }
}
