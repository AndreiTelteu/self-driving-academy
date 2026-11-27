import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAmbientTraffic,
  createCompositionWorld,
  createLiveModeSegments,
  createLiveTelemetryComposition,
  createV3Composition,
  type AmbientTraffic,
  type CompositionWorld,
  type LiveModeSegments,
  type LiveTelemetryComposition,
  type V3Composition,
} from '../../src/app';
import { createDefaultSettings } from '../../src/settings';

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '272-live-composition',
  worldEpoch: 2,
});

interface Fixture {
  readonly world: CompositionWorld;
  readonly ambient: AmbientTraffic;
  readonly segments: LiveModeSegments;
  readonly model: V3Composition;
  readonly telemetry: LiveTelemetryComposition;
}

function fixture(): Fixture {
  const world = createCompositionWorld();
  const ambient = createAmbientTraffic({
    map: world.map,
    graph: world.graph,
    context: CONTEXT,
    seed: 272,
    focus: { x: world.spawn.x, z: world.spawn.z },
    avoid: [
      { x: world.spawn.x, z: world.spawn.z },
      ...world.vehicles.map((vehicle) => ({
        x: vehicle.positionM.x,
        z: vehicle.positionM.z,
      })),
    ],
  });
  const modelRef: { current: V3Composition | undefined } = { current: undefined };
  const segments = createLiveModeSegments({
    context: CONTEXT,
    playerId: 'player-272',
    profileId: 'profile-272',
    baseVersionId: 'profile-272@1',
    learningEpoch: 0,
    controlPreferencesVersion: 'control-272',
    engineVersion: 'engine-272',
    mapVersion: world.map.mapId,
    learningEligible: true,
    readAuthority: () => {
      if (modelRef.current === undefined)
        return { tick: 0, playerVehicleId: null, mode: 'AUTO' as const, suspended: false };
      return modelRef.current.modeAuthority();
    },
  });
  const model = createV3Composition({
    layout: world.layout,
    start: world.spawn,
    control: createDefaultSettings('272-live').input.control,
    context: CONTEXT,
    vehicles: world.vehicles,
    traffic: ambient.traffic,
    map: world.map,
    graph: world.graph,
  });
  modelRef.current = model;
  model.attachModeSegments(segments);
  const telemetry = createLiveTelemetryComposition({
    context: CONTEXT,
    map: world.map,
    graph: world.graph,
    playerId: 'player-272',
    modeSegments: () => segments,
    worldCapacity: 16_384,
  });
  return { world, ambient, segments, model, telemetry };
}

function close(fixture: Fixture): void {
  fixture.telemetry.dispose();
  fixture.segments.dispose();
  fixture.model.dispose();
  fixture.ambient.dispose();
}

function step(fixture: Fixture, atTick: number): void {
  fixture.model.step({ tick: atTick });
  fixture.telemetry.step(fixture.model.frame);
}

test('272 all 58 live taxis and civilians contribute independent of camera or selection', () => {
  const f = fixture();
  try {
    for (let tick = 1; tick <= 180; tick += 1) step(f, tick);
    const stats = f.telemetry.getStats();
    assert.equal(stats.vehiclesObserved, 58);
    assert.equal(stats.worldSamplesWritten, 58 * 180);
    assert.equal(stats.worldSamplesRetained, 58 * 180);
    const ids = new Set(
      f.telemetry.readWorldSamples({ limit: 58 * 180 }).map((sample) => sample.vehicleId),
    );
    assert.equal(ids.size, 58);
    assert.ok(ids.has('taxi-01'));
    assert.ok(ids.has('civil-01'));
    const taxis = f.telemetry
      .readWorldSamples({ limit: 58 * 180 })
      .filter((sample) => sample.driverKind === 'TAXI');
    const civilians = f.telemetry
      .readWorldSamples({ limit: 58 * 180 })
      .filter((sample) => sample.driverKind === 'CIVILIAN');
    assert.ok(taxis.length > 0);
    assert.ok(civilians.length > 0);
    assert.ok(taxis.some((sample) => sample.vehicleId !== f.model.frame.selectedVehicleId));
    assert.equal(f.model.frame.selectedVehicleId, null);
    assert.equal(f.model.frame.playerVehicleId, null);
    assert.ok(f.telemetry.readFollowEpisodes().length > 0);
  } finally {
    close(f);
  }
});

test('272 a live MANUAL -> LEARNING -> AUTO segment exposes closed telemetry to 273', () => {
  const f = fixture();
  try {
    step(f, 1);
    const target = f.ambient.list().find((actor) => actor.driverKind === 'TAXI' && !actor.blocked);
    assert.ok(target);
    const vehicleId = target.vehicleId;
    f.model.selectVehicle(vehicleId);
    assert.equal(f.model.requestModeAction('M'), true);
    let tick = 2;
    step(f, tick);
    let state = f.segments.observe();
    assert.equal(state.active?.mode, 'MANUAL');
    assert.equal(f.telemetry.learningExposure().closedSegments, 0);
    f.model.port.setAction('throttle', true);
    for (let index = 0; index < 120; index += 1) {
      tick += 1;
      step(f, tick);
    }
    f.model.port.setAction('throttle', false);
    const manualId = f.segments.observe().active!.segmentId;
    const manualSamples = f.telemetry.getStats().samplesRecorded;
    assert.ok(manualSamples > 0);
    assert.equal(f.telemetry.read().activeSegment?.controlMode, 'MANUAL');
    assert.equal(f.telemetry.read().activeSegment?.learningEligible, false);
    // Focus loss produces an artifact and excludes ongoing windows; the live loop is suspended.
    f.telemetry.noteSuspension('FOCUS_LOST', tick);
    const suspended = f.telemetry.read();
    assert.ok(suspended.activeSegment !== null);
    // The live loop is suspended by 070: no composition tick is admitted. Resume happens at the
    // next authoritative tick, so the fixed tick counter remains consecutive.
    tick += 1;
    f.telemetry.noteResume(tick);
    f.model.requestModeAction('L');
    step(f, tick);
    state = f.segments.observe();
    assert.equal(state.active?.mode, 'LEARNING');
    const learningId = state.active!.segmentId;
    assert.notEqual(learningId, manualId);
    for (let index = 0; index < 90; index += 1) {
      tick += 1;
      step(f, tick);
    }
    const beforeAuto = f.telemetry.read();
    assert.equal(beforeAuto.activeSegment?.controlMode, 'LEARNING');
    assert.equal(beforeAuto.activeSegment?.learningEligible, true);
    assert.ok((beforeAuto.activeSegment?.samples ?? 0) > 0);
    f.model.requestModeAction('M');
    tick += 1;
    step(f, tick);
    const afterAuto = f.telemetry.read();
    assert.equal(afterAuto.activeSegment, null);
    assert.ok(afterAuto.closedSegments.length >= 2);
    const closedLearning = afterAuto.closedSegments.find(
      (segment) => segment.segmentId === learningId,
    )!;
    assert.equal(closedLearning.controlMode, 'LEARNING');
    assert.equal(closedLearning.learningEligible, true);
    assert.ok(closedLearning.samples > 0);
    const read = f.telemetry.readClosedSegment(learningId);
    assert.ok(read !== null);
    assert.ok(read.samples.length > 0);
    assert.equal(read.summary.learningEligible, true);
    assert.equal(read.demonstrations, 0);
    assert.equal(read.profilePublications, 0);
    assert.ok(read.windows.every((window) => window.controlMode === 'LEARNING'));
    assert.equal(f.telemetry.learningExposure().workspace, 'TELEMETRY_272');
    assert.equal(f.telemetry.learningExposure().profilePublications, 0);
    assert.equal(f.telemetry.learningExposure().jobs, 0);
    assert.equal(afterAuto.evidence.profilePublications, 0);
    assert.equal(afterAuto.evidence.learningJobs, 0);
    assert.equal(f.telemetry.getStats().recoveries, 0);
  } finally {
    close(f);
  }
});

test('272 teleport artifacts stay out of style evidence and the closed segment keeps its prefix', () => {
  const f = fixture();
  try {
    step(f, 1);
    const target = f.ambient.list().find((actor) => actor.driverKind === 'TAXI')!;
    f.model.selectVehicle(target.vehicleId);
    f.model.requestModeAction('L');
    let tick = 2;
    step(f, tick);
    for (let index = 0; index < 90; index += 1) {
      tick += 1;
      step(f, tick);
    }
    const active = f.segments.observe().active!;
    f.telemetry.noteRecovery({
      tick,
      vehicleId: target.vehicleId,
      operationId: '272-live-recovery',
      status: 'ADMITTED',
      pointId: '272-point',
      mapId: f.world.mapId,
      laneId: target.laneId,
      mode: 'LEARNING',
      validatedTick: tick,
    });
    tick += 1;
    step(f, tick);
    f.model.requestModeAction('M');
    tick += 1;
    step(f, tick);
    const read = f.telemetry.readClosedSegment(active.segmentId)!;
    assert.ok(read !== null);
    const artifactWindow = read.artifactWindow!;
    assert.ok(
      artifactWindow.artifacts.some(
        (artifact) =>
          artifact.kind === 'TELEPORT' &&
          artifact.cause === 'RECOVERY_TELEPORT' &&
          artifact.operationId === '272-live-recovery',
      ),
    );
    assert.ok((artifactWindow.prefix?.ticks ?? 0) > 0);
    assert.equal(f.telemetry.getStats().recoveries, 1);
    assert.equal(read.demonstrations, 0);
    assert.equal(f.telemetry.read().evidence.learningJobs, 0);
  } finally {
    close(f);
  }
});
