import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STYLE_SLIDER_DEFINITIONS,
  kmhToMs,
  msToKmh,
  percentToProbability,
  probabilityToPercent,
} from '../../src/ui';
import { getParameterDefinition } from '../../src/profiles';
import {
  STYLE_BASE,
  activateFleet,
  createAdditionalEditor,
  createStyleWorld,
  runSessionTicks,
  runTicks,
  styleBaseParameters,
} from './style-sliders-fixture';

const CHANGE_TICKS = 8;

test('230 opens on the active immutable version and converts UI values exactly', () => {
  const world = createStyleWorld();
  try {
    assert.equal(world.session.open(), 'OPENED');
    const draft = world.session.getDraft();
    assert.notEqual(draft, null);
    assert.equal(draft!.baseVersionId, STYLE_BASE);
    assert.equal(draft!.headVersionId, STYLE_BASE);

    // 18 km/h is exactly 5 m/s; 40 % is exactly 0.4.
    world.session.setValue('speedDeltaUrban', 18);
    world.session.setValue('redStopProbability', 40);
    world.session.setValue('desiredAcceleration', 3.4);
    const view = world.session.getView()!;
    assert.equal(view.rows.find((row) => row.field === 'speedDeltaUrban')!.parameterValue, 5);
    assert.equal(view.rows.find((row) => row.field === 'speedDeltaUrban')!.displayValue, 18);
    assert.equal(view.rows.find((row) => row.field === 'redStopProbability')!.parameterValue, 0.4);
    assert.equal(view.rows.find((row) => row.field === 'redStopProbability')!.displayValue, 40);
    assert.equal(view.rows.find((row) => row.field === 'desiredAcceleration')!.parameterValue, 3.4);
    assert.equal(view.saveState, 'DIRTY');
    assert.equal(view.canApply, true);
    assert.deepEqual(
      [...view.changedFields],
      ['speedDeltaUrban', 'desiredAcceleration', 'redStopProbability'],
    );

    // The eight mappings convert the real 092 domain exactly, from both directions.
    for (const [field, definition] of Object.entries(STYLE_SLIDER_DEFINITIONS)) {
      const catalog = getParameterDefinition(definition.parameterKey);
      assert.equal(catalog.min, definition.parameterMin, field);
      assert.equal(catalog.max, definition.parameterMax, field);
      assert.equal(catalog.unit, definition.parameterUnit, field);
      const toParameter =
        field === 'speedDeltaUrban'
          ? kmhToMs(definition.min)
          : definition.unit === '%'
            ? percentToProbability(definition.min)
            : definition.min;
      const toParameterMax =
        field === 'speedDeltaUrban'
          ? kmhToMs(definition.max)
          : definition.unit === '%'
            ? percentToProbability(definition.max)
            : definition.max;
      assert.equal(toParameter, definition.parameterMin, `${field} min`);
      assert.equal(toParameterMax, definition.parameterMax, `${field} max`);
    }
    assert.equal(kmhToMs(54), 15);
    assert.equal(msToKmh(-8), -28.8);
    assert.equal(percentToProbability(100), 1);
    assert.equal(probabilityToPercent(0.6), 60);
  } finally {
    world.dispose();
  }
});

test('230 publishes only the differences as MANUAL_TUNING through 205 and 110', () => {
  const world = createStyleWorld();
  try {
    assert.equal(world.session.open(), 'OPENED');
    world.session.setValue('speedDeltaUrban', 18);
    world.session.setValue('greenStartDelay', 2.5);
    assert.equal(world.session.queueApply(), 'QUEUED');
    const published = runTicks(world, CHANGE_TICKS);
    assert.equal(published.status, 'PUBLISHED');
    assert.equal(published.versionId, `manual-${world.sessionId}-1`);
    assert.equal(published.changes.length, 2);
    assert.deepEqual(published.changes.map((change) => change.parameterKey).sort(), [
      'green_start_delay',
      'speed_delta_urban',
    ]);
    const urban = published.changes.find((change) => change.parameterKey === 'speed_delta_urban')!;
    assert.equal(urban.before, 0);
    assert.equal(urban.after, 5);
    assert.equal(urban.beforeText, '0 km/h');
    assert.equal(urban.afterText, '+18 km/h');
    assert.equal(urban.valueProvenance, 'MANUAL_TUNING');
    assert.equal(urban.evidence, 'HISTORICAL_ONLY');

    // 205 records the change as one generation step; 110 publishes the MANUAL_TUNING origin.
    assert.equal(published.barrier?.reason, 'NEW_PROFILE');
    assert.equal(published.barrier?.fromLearningEpoch, 1);
    assert.equal(published.barrier?.learningEpoch, 2);
    assert.equal(published.barrier?.physicalPreserved, true);
    assert.equal(published.activation?.origin, 'MANUAL_TUNING');
    assert.notEqual(published.activation?.commandId, null);
    assert.deepEqual([...world.versions()], [STYLE_BASE, published.versionId]);

    const stored = world.store.getVersion(published.versionId!)!;
    assert.equal(stored.parentVersionId, STYLE_BASE);
    assert.equal(stored.provenance.origin, 'DERIVED');
    assert.equal(stored.provenance.delta?.keyCount, 2);
    assert.equal(stored.provenance.delta?.baseVersionId, STYLE_BASE);
    assert.match(stored.provenance.delta?.reason ?? '', /^MANUAL_TUNING 230-style-map-v1/);
    // No observation, learning segment or confidence is invented by a manual tune.
    assert.equal(stored.sourceSegmentIds.length, 1);
    assert.deepEqual([...stored.sourceSegmentIds], [`manual:${published.versionId}`]);
    assert.deepEqual([...stored.provenance.sourceSegmentIds], [`manual:${published.versionId}`]);
    assert.ok(stored.sourceSegmentIds.every((id) => id.startsWith('manual:')));
    assert.equal(stored.provenance.delta?.validationVersion, '102-candidate-validation-v1');

    // The common activation reaches both taxis and civilians at one tick.
    assert.equal(activateFleet(world), true);
    const states = world.registry.list().map((vehicle) => world.registry.state(vehicle.vehicleId)!);
    assert.equal(new Set(states.map((state) => state.appliedProfileVersion)).size, 1);
    assert.equal(states[0].appliedProfileVersion, published.versionId);
    assert.equal(new Set(states.map((state) => state.tick)).size, 1);
    assert.deepEqual([...world.fleetVersions()], [published.versionId!]);
    assert.equal(world.session.getStats().learningJobs, 0);
    assert.equal(world.session.getStats().progressionCalls, 0);
    assert.equal(world.progression.calls(), 0);
  } finally {
    world.dispose();
  }
});

test('230 does not block or confuse an in-flight 103 worker', async () => {
  const world = createStyleWorld();
  try {
    const job = world.job('job-style-103', 1);
    const admission = world.queue.queue.submit(job);
    assert.equal(admission.status, 'QUEUED');
    assert.equal(world.barrier.trackJob(job).status, 'TRACKED');
    const physicalBefore = world.segments.port.physical();

    assert.equal(world.session.open(), 'OPENED');
    world.session.setValue('followingMinGap', 8);
    assert.equal(world.session.queueApply(), 'QUEUED');
    const published = runTicks(world, CHANGE_TICKS);
    assert.equal(published.status, 'PUBLISHED');
    assert.deepEqual([...published.barrier!.cancelledJobs], ['job-style-103']);
    assert.equal(world.segments.port.physical(), physicalBefore);
    assert.equal(published.barrier?.physicalPreserved, true);
    const late = world.barrier.isCurrent(job);
    assert.equal(late.status, 'LATE_RESULT');
    assert.equal(late.reason, 'CANCELLED_BY_PROFILE_CHANGE');
    const outcome = await admission.ticket?.outcome;
    assert.equal(outcome?.status, 'cancelled');
  } finally {
    world.dispose();
  }
});

test('230 refuses a stale draft instead of overwriting a newer version', () => {
  const world = createStyleWorld();
  const other = createAdditionalEditor(world, 'other-editor');
  try {
    assert.equal(world.session.open(), 'OPENED');
    world.session.setValue('speedDeltaUrban', 9);
    assert.equal(world.session.queueApply(), 'QUEUED');

    // Another intervention publishes a real version while the first draft is still open.
    assert.equal(other.open(), 'OPENED');
    other.setValue('comfortDeceleration', 5);
    assert.equal(other.queueApply(), 'QUEUED');
    const published = runSessionTicks(world, other, CHANGE_TICKS);
    assert.equal(published.status, 'PUBLISHED');
    activateFleet(world, other);
    const newerVersion = published.versionId;
    const versionsBefore = [...world.versions()];
    assert.equal(versionsBefore.length, 2);

    // The first draft still points at the base; its apply must be refused, with no write.
    const status = world.session.queueApply();
    assert.equal(status, 'STALE_BASE');
    assert.equal(world.session.getView()!.saveState, 'STALE');
    assert.equal(world.session.getView()!.canApply, false);
    assert.notEqual(runTicks(world, CHANGE_TICKS).status, 'PUBLISHED');
    assert.deepEqual([...world.versions()], versionsBefore);

    // Explicit rebase adopts the new head and discards the old proposal; no merge happens.
    const rebased = world.session.rebase()!;
    assert.equal(rebased.baseVersionId, newerVersion);
    assert.equal(rebased.proposed.speedDeltaUrban, rebased.base.speedDeltaUrban);
    assert.equal(world.session.getView()!.saveState, 'UNCHANGED');
  } finally {
    other.dispose();
    world.dispose();
  }
});

test('230 no-op and cancel publish nothing', () => {
  const world = createStyleWorld();
  try {
    assert.equal(world.session.open(), 'OPENED');
    assert.equal(world.session.queueApply(), 'UNCHANGED');
    runTicks(world, CHANGE_TICKS);
    assert.deepEqual([...world.versions()], [STYLE_BASE]);
    assert.equal(world.barrier.barriers().length, 0);

    world.session.setValue('redStopProbability', 30);
    assert.equal(world.session.queueApply(), 'QUEUED');
    assert.equal(world.session.withdraw(), true);
    runTicks(world, CHANGE_TICKS);
    assert.deepEqual([...world.versions()], [STYLE_BASE]);
    assert.equal(world.barrier.barriers().length, 0);
    assert.deepEqual([...world.fleetVersions()], [STYLE_BASE]);

    // „Anulează” only drops the local proposal.
    world.session.revert();
    assert.equal(world.session.getView()!.saveState, 'UNCHANGED');
  } finally {
    world.dispose();
  }
});

test('230 restore is functional, keeps history and lets LEARNING change the keys again', () => {
  const world = createStyleWorld();
  const other = createAdditionalEditor(world, 'restore-editor');
  try {
    assert.equal(world.session.open(), 'OPENED');
    world.session.setValue('speedDeltaUrban', 12);
    world.session.queueApply();
    const first = runTicks(world, CHANGE_TICKS);
    assert.equal(first.status, 'PUBLISHED');
    activateFleet(world);
    const tunedVersion = first.versionId!;

    assert.equal(other.open(), 'OPENED');
    other.setValue('stopFullProbability', 20);
    assert.equal(other.queueApply(), 'QUEUED');
    const second = runSessionTicks(world, other, CHANGE_TICKS);
    assert.equal(second.status, 'PUBLISHED');
    activateFleet(world, other);
    const secondVersion = second.versionId!;
    assert.deepEqual([...world.versions()], [STYLE_BASE, tunedVersion, secondVersion]);

    // A new editor sees the whole bounded history and restores the base version.
    assert.equal(world.session.open(), 'OPENED');
    const view = world.session.getView()!;
    assert.deepEqual(
      view.history.map((entry) => entry.versionId),
      [secondVersion, tunedVersion, STYLE_BASE],
    );
    assert.equal(view.history.filter((entry) => entry.current).length, 1);
    assert.equal(world.session.requestRestore(STYLE_BASE), 'QUEUED');
    const restored = runTicks(world, CHANGE_TICKS);
    assert.equal(restored.status, 'RESTORED');
    const restoreActivated = activateFleet(world);
    assert.equal(restoreActivated, true);
    assert.equal(world.barrier.current().baseVersionId, STYLE_BASE);
    assert.equal(world.barrier.current().learningEpoch, 4);
    // Restore edits no version: exactly the same three immutable records.
    assert.deepEqual([...world.versions()], [STYLE_BASE, tunedVersion, secondVersion]);
    assert.deepEqual([...world.fleetVersions()], [STYLE_BASE]);

    // A later LEARNING result of the new generation may change the same keys again.
    const generation = world.barrier.current();
    const decision = world.barrier.isCurrent({
      playerId: 'player-1',
      profileId: world.profileId,
      learningEpoch: generation.learningEpoch,
      baseVersionId: generation.baseVersionId,
      segmentId: generation.segmentId,
    });
    assert.equal(decision.status, 'CURRENT');
    const learned = world.store.derive({
      profileId: world.profileId,
      versionId: 'learned-v4',
      parentVersionId: STYLE_BASE,
      segmentId: generation.segmentId,
      reason: 'LEARNED',
      delta: {
        profileVersionId: 'learned-v4',
        parentVersionId: STYLE_BASE,
        engineVersion: world.store.engineVersion,
        schemaVersion: 1,
        units: 'SI',
        values: [{ key: 'speed_delta_urban', unit: 'm/s', value: 3 }],
      },
    });
    assert.equal(learned.status, 'ACCEPTED');
    assert.equal(world.store.getVersion('learned-v4')!.parameters.speed_delta_urban, 3);
    assert.notEqual(world.store.getVersion('learned-v4')!.parameters.speed_delta_urban, 0);
  } finally {
    other.dispose();
    world.dispose();
  }
});

test('230 targets the active session: Haos does not touch Academia and a session change invalidates the draft', () => {
  const academia = createStyleWorld();
  const haos = createStyleWorld({
    profileId: 'haos-profile',
    sessionId: 'session-haos',
    baseVersionId: 'haos-base',
    baseParameters: styleBaseParameters(),
  });
  try {
    assert.equal(academia.session.open(), 'OPENED');
    academia.session.setValue('speedDeltaUrban', 6);
    assert.equal(academia.session.queueApply(), 'QUEUED');
    const academiaPublished = runTicks(academia, CHANGE_TICKS);
    assert.equal(academiaPublished.status, 'PUBLISHED');
    activateFleet(academia);
    const academiaVersions = [...academia.versions()];
    assert.equal(academiaVersions.length, 2);

    // The Haos editor publishes only inside its own profile/world.
    assert.equal(haos.session.open(), 'OPENED');
    haos.session.setValue('comfortDeceleration', 4);
    assert.equal(haos.session.queueApply(), 'QUEUED');
    const haosPublished = runTicks(haos, CHANGE_TICKS);
    assert.equal(haosPublished.status, 'PUBLISHED');
    activateFleet(haos);
    assert.deepEqual([...haos.versions()], ['haos-base', haosPublished.versionId]);
    assert.deepEqual([...academia.versions()], academiaVersions);
    assert.deepEqual([...academia.fleetVersions()], [academiaPublished.versionId]);
    assert.deepEqual([...haos.fleetVersions()], [haosPublished.versionId!]);

    // Switching the active session invalidates the open draft instead of crossing worlds.
    assert.equal(academia.session.open(), 'OPENED');
    academia.session.setValue('followingTimeHeadway', 2.4);
    academia.target.sessionId = 'session-haos';
    academia.target.worldEpoch = 9;
    academia.advanceTick();
    const state = academia.session.getState();
    assert.equal(state.messageCode, 'SESSION_CHANGED');
    assert.equal(state.view!.saveState, 'SESSION_CHANGED');
    assert.equal(state.view!.canApply, false);
    const before = [...academia.versions()];
    assert.equal(academia.session.queueApply(), 'SESSION_CHANGED');
    runTicks(academia, CHANGE_TICKS);
    assert.deepEqual([...academia.versions()], before);
    assert.equal(academia.session.getStats().sessionChanged, 1);
  } finally {
    haos.dispose();
    academia.dispose();
  }
});

test('230 reload reads the published version back from the store and the draft never grows', () => {
  const world = createStyleWorld();
  try {
    assert.equal(world.session.open(), 'OPENED');
    world.session.setValue('redStopProbability', 55);
    world.session.setValue('followingMinGap', 6);
    world.session.queueApply();
    const published = runTicks(world, CHANGE_TICKS);
    assert.equal(published.status, 'PUBLISHED');
    const stored = world.store.getVersion(published.versionId!)!;
    assert.equal(stored.parameters.red_stop_probability, 0.55);
    assert.equal(stored.parameters.following_min_gap, 6);

    // A reopen after the reload reads the same immutable head and no draft survives.
    assert.equal(world.session.getDraft(), null);
    assert.equal(world.session.open(), 'OPENED');
    const reopened = world.session.getView()!;
    assert.equal(reopened.baseVersionId, published.versionId);
    assert.equal(
      reopened.rows.find((row) => row.field === 'redStopProbability')!.parameterValue,
      0.55,
    );
    assert.equal(reopened.rows.find((row) => row.field === 'redStopProbability')!.displayValue, 55);
    assert.equal(reopened.saveState, 'UNCHANGED');
    assert.equal(world.session.getStats().retainedDrafts, 1);
    assert.ok(world.session.getStats().retainedHistoryRows <= 8);
    assert.ok(world.session.getStats().versions <= 128);
    // Manual tuning never grows a second shadow history: exactly one version per apply.
    assert.equal(world.store.listVersions(world.profileId).length, 2);
    assert.equal(reopened.policy.awardsLearningProgress, false);
    assert.equal(reopened.policy.inventedObservations, false);
    assert.equal(reopened.policy.inventedConfidence, false);
  } finally {
    world.dispose();
  }
});

test('230 a stale queue never reaches the store or the barrier', () => {
  const world = createStyleWorld();
  try {
    assert.equal(world.session.open(), 'OPENED');
    world.session.setValue('speedDeltaUrban', 4);
    assert.equal(world.session.queueApply(), 'QUEUED');
    // Simulate another publication before the tick boundary by deriving and activating directly.
    const derived = world.store.derive({
      profileId: world.profileId,
      versionId: 'external-v2',
      parentVersionId: STYLE_BASE,
      segmentId: 'external-segment',
      reason: 'MANUAL_TUNING external',
      delta: {
        profileVersionId: 'external-v2',
        parentVersionId: STYLE_BASE,
        engineVersion: world.store.engineVersion,
        schemaVersion: 1,
        units: 'SI',
        values: [{ key: 'following_min_gap', unit: 'm', value: 4 }],
      },
    });
    assert.equal(derived.status, 'ACCEPTED');
    const requested = world.barrier.requestChange({
      reason: 'NEW_PROFILE',
      targetProfileId: world.profileId,
      targetVersionId: 'external-v2',
      importValid: true,
    });
    assert.equal(requested.status, 'PENDING');
    world.advanceTick();
    assert.equal(world.barrier.resolve().status, 'APPLIED');
    const versionsBefore = [...world.versions()];

    world.advanceTick();
    const result = world.session.applyAtTick(world.tick.value);
    assert.equal(result.status, 'STALE_BASE');
    assert.deepEqual([...world.versions()], versionsBefore);
    assert.equal(world.session.getView()!.saveState, 'STALE');
  } finally {
    world.dispose();
  }
});
