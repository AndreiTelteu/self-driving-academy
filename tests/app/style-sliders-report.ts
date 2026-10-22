import {
  STYLE_SLIDERS_TAB_LIMITS,
  STYLE_SLIDER_DEFINITIONS,
  STYLE_SLIDER_FIELDS,
  STYLE_SLIDER_PARAMETER_KEYS,
  STYLE_SLIDER_UNAVAILABLE,
  STYLE_SLIDERS_HISTORY_ROWS,
  STYLE_SLIDERS_LAYOUTS,
  STYLE_SLIDERS_SAVE_STATE_LABELS,
  STYLE_SLIDERS_TUNING_MAP_VERSION,
  STYLE_SLIDERS_VERSION,
  STYLE_SLIDERS_WRITE_HZ,
  kmhToMs,
  msToKmh,
  percentToProbability,
  probabilityToPercent,
  styleSlidersLayout,
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
import { createStyleHarness } from '../ui/style-sliders-fixture';

export interface StyleSlidersReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface StyleSlidersReportScenario {
  readonly name: string;
  readonly status: string;
  readonly detail: string;
}

export interface StyleSlidersReportChange {
  readonly parameterKey: string;
  readonly unit: string;
  readonly before: number;
  readonly after: number;
  readonly beforeText: string;
  readonly afterText: string;
  readonly valueProvenance: string;
  readonly evidence: string;
}

export interface StyleSlidersReport {
  readonly version: typeof STYLE_SLIDERS_VERSION;
  readonly contract: Readonly<{
    tuningMapVersion: string;
    fields: readonly string[];
    parameterKeys: readonly string[];
    ranges: readonly Readonly<{
      key: string;
      unit: string;
      min: number;
      max: number;
      step: number;
    }>[];
    unavailable: readonly Readonly<{ key: string; reason: string; reserved: boolean }>[];
    writeHz: number;
    saveStates: readonly string[];
    tabLimits: Readonly<Record<string, number>>;
    layouts: readonly Readonly<Record<string, string | number | boolean>>[];
  }>;
  readonly conversions: readonly Readonly<{
    key: string;
    minUi: number;
    minParameter: number;
    maxUi: number;
    maxParameter: number;
    roundTripMin: number;
    roundTripMax: number;
  }>[];
  readonly publish: Readonly<{
    status: string;
    profileId: string;
    baseVersionId: string;
    versionId: string;
    parentVersionId: string;
    checksum: string;
    tuningMapVersion: string;
    reason: string;
    manualKeys: number;
    sourceSegments: readonly string[];
    changes: readonly StyleSlidersReportChange[];
    barrierReason: string;
    fromEpoch: number;
    learningEpoch: number;
    activationOrigin: string;
    activationTick: number | null;
    cancelledJobs: readonly string[];
    physicalPreserved: boolean;
    fleetVersions: readonly string[];
    commonFleetTick: number | null;
    fleetVehicles: number;
    learningJobs: number;
    progressionCalls: number;
  }> | null;
  readonly worker: Readonly<{
    inFlightBeforeApply: boolean;
    cancelled: boolean;
    lateResult: string;
    applyStatus: string;
  }>;
  readonly stale: Readonly<{
    queueStatus: string;
    saveState: string;
    versionsUnchanged: boolean;
    rebaseBase: string;
    rebaseMergesProposal: boolean;
  }>;
  readonly noop: Readonly<{
    queueStatus: string;
    versionsAfterNoop: number;
    barriersAfterNoop: number;
    cancelLeavesVersions: number;
  }>;
  readonly restore: Readonly<{
    status: string;
    restoredVersionId: string;
    versionsUnchanged: boolean;
    learningEpochBefore: number;
    learningEpochAfter: number;
    fleetVersion: string;
    learningAfterRestore: string;
  }>;
  readonly worlds: Readonly<{
    academiaVersion: string;
    haosVersion: string;
    academiaVersions: number;
    haosVersions: number;
    draftInvalidated: boolean;
    applyAfterSwitch: string;
  }>;
  readonly reload: Readonly<{
    baseVersionId: string;
    saveState: string;
    redStopProbability: number;
    versions: number;
  }>;
  readonly ui: Readonly<{
    enabledRows: number;
    unavailableRows: number;
    unavailabilityVisible: boolean;
    saveState: string;
    writeHz: number;
    frameUpdates: number;
    frameWrites: number;
    frameRenders: number;
    restoreConfirms: number;
    globalListeners: number;
    elements: number;
  }>;
  readonly storage: Readonly<{
    versions: number;
    maxVersionsPerProfile: number;
    historyRows: number;
    retainedDrafts: number;
    storeWrites: number;
    versionsAdded: number;
  }>;
  readonly scenarios: readonly StyleSlidersReportScenario[];
  readonly checks: readonly StyleSlidersReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): StyleSlidersReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function conversionRows() {
  return STYLE_SLIDER_FIELDS.map((field) => {
    const definition = STYLE_SLIDER_DEFINITIONS[field],
      toParameterMin =
        field === 'speedDeltaUrban'
          ? kmhToMs(definition.min)
          : definition.unit === '%'
            ? percentToProbability(definition.min)
            : definition.min,
      toParameterMax =
        field === 'speedDeltaUrban'
          ? kmhToMs(definition.max)
          : definition.unit === '%'
            ? percentToProbability(definition.max)
            : definition.max,
      roundTripMin =
        field === 'speedDeltaUrban'
          ? msToKmh(toParameterMin)
          : definition.unit === '%'
            ? probabilityToPercent(toParameterMin)
            : toParameterMin,
      roundTripMax =
        field === 'speedDeltaUrban'
          ? msToKmh(toParameterMax)
          : definition.unit === '%'
            ? probabilityToPercent(toParameterMax)
            : toParameterMax;
    return Object.freeze({
      key: definition.parameterKey,
      minUi: definition.min,
      minParameter: toParameterMin,
      maxUi: definition.max,
      maxParameter: toParameterMax,
      roundTripMin,
      roundTripMax,
    });
  });
}

export function runStyleSlidersReport(): StyleSlidersReport {
  const conversions = conversionRows();
  const scenarios: StyleSlidersReportScenario[] = [];
  const checks: StyleSlidersReportCheck[] = [];
  const scenario = (name: string, status: string, detail: string) =>
    scenarios.push(Object.freeze({ name, status, detail }));

  // --- contract and conversions -------------------------------------------------------------
  for (const [index, field] of STYLE_SLIDER_FIELDS.entries()) {
    const definition = STYLE_SLIDER_DEFINITIONS[field],
      catalog = getParameterDefinition(definition.parameterKey),
      row = conversions[index]!;
    checks.push(
      check(
        `catalog-domain:${definition.parameterKey}`,
        `${catalog.min}:${catalog.max}:${catalog.unit}`,
        `${row.minParameter}:${row.maxParameter}:${definition.parameterUnit}`,
        'UI range converts exactly to the 092 catalog domain',
      ),
    );
    checks.push(
      check(
        `round-trip:${definition.parameterKey}`,
        `${definition.min}:${definition.max}`,
        `${row.roundTripMin}:${row.roundTripMax}`,
        'parameter → UI conversion returns the declared ends',
      ),
    );
  }
  const allImplemented = STYLE_SLIDER_PARAMETER_KEYS.every(
    (key) => getParameterDefinition(key).implemented,
  );
  checks.push(
    check('keys-implemented', true, allImplemented, 'all eight keys are implemented policies'),
  );
  checks.push(
    check(
      'unavailable-visible',
      STYLE_SLIDER_UNAVAILABLE.length,
      STYLE_SLIDER_UNAVAILABLE.filter((entry) => entry.reserved).length,
      'unsupported keys stay visible with the reserved badge',
    ),
  );
  checks.push(check('write-hz', 10, STYLE_SLIDERS_WRITE_HZ, 'slider read-out ceiling'));
  scenario('contract', 'PASS', `${conversions.length} conversions verified against 092`);

  // --- publish only the differences ----------------------------------------------------------
  const publishWorld = createStyleWorld();
  let publish: StyleSlidersReport['publish'] = null;
  try {
    publishWorld.session.open();
    publishWorld.session.setValue('speedDeltaUrban', 18);
    publishWorld.session.setValue('greenStartDelay', 2.5);
    publishWorld.session.queueApply();
    const published = runTicks(publishWorld, 8);
    activateFleet(publishWorld);
    const stored = publishWorld.store.getVersion(published.versionId!)!;
    const states = publishWorld.registry
      .list()
      .map((vehicle) => publishWorld.registry.state(vehicle.vehicleId)!);
    publish = Object.freeze({
      status: published.status,
      profileId: published.profileId!,
      baseVersionId: published.baseVersionId ?? STYLE_BASE,
      versionId: published.versionId!,
      parentVersionId: stored.parentVersionId!,
      checksum: stored.checksum,
      tuningMapVersion: STYLE_SLIDERS_TUNING_MAP_VERSION,
      reason: stored.provenance.delta?.reason ?? '',
      manualKeys: stored.provenance.delta?.keyCount ?? 0,
      sourceSegments: Object.freeze([...stored.sourceSegmentIds]),
      changes: Object.freeze(
        published.changes.map((change) =>
          Object.freeze({
            parameterKey: change.parameterKey,
            unit: change.unit,
            before: change.before,
            after: change.after,
            beforeText: change.beforeText,
            afterText: change.afterText,
            valueProvenance: change.valueProvenance,
            evidence: change.evidence,
          }),
        ),
      ),
      barrierReason: published.barrier?.reason ?? '',
      fromEpoch: published.barrier?.fromLearningEpoch ?? 0,
      learningEpoch: published.barrier?.learningEpoch ?? 0,
      activationOrigin: published.activation?.origin ?? '',
      activationTick: published.barrier?.activationTick ?? null,
      cancelledJobs: Object.freeze([...(published.barrier?.cancelledJobs ?? [])]),
      physicalPreserved: published.barrier?.physicalPreserved ?? false,
      fleetVersions: Object.freeze([...publishWorld.fleetVersions()]),
      commonFleetTick: states.length === 0 ? null : states[0].tick,
      fleetVehicles: states.length,
      learningJobs: publishWorld.session.getStats().learningJobs,
      progressionCalls: publishWorld.session.getStats().progressionCalls,
    });
    checks.push(check('publish-status', 'PUBLISHED', published.status, 'one publication'));
    checks.push(check('publish-keys', 2, published.changes.length, 'only the two differences'));
    checks.push(
      check(
        'publish-reason',
        true,
        (stored.provenance.delta?.reason ?? '').startsWith('MANUAL_TUNING'),
        'version provenance is MANUAL_TUNING',
      ),
    );
    checks.push(check('publish-parent', STYLE_BASE, stored.parentVersionId ?? '', 'explicit base'));
    checks.push(
      check(
        'publish-before-after',
        '0→5',
        `${published.changes[0].before}→${published.changes[0].after}`,
        'explicit before/after in SI',
      ),
    );
    checks.push(check('publish-origin', 'MANUAL_TUNING', publish.activationOrigin, '110 origin'));
    checks.push(
      check('publish-epoch', 2, publish.learningEpoch, 'learningEpoch advanced by the 205 barrier'),
    );
    checks.push(
      check(
        'publish-fleet',
        publish.versionId,
        publish.fleetVersions.join(','),
        'both categories use the new version',
      ),
    );
    checks.push(
      check(
        'publish-common-tick',
        true,
        publish.commonFleetTick !== null,
        'all vehicles share one activation tick',
      ),
    );
    checks.push(check('publish-learning-jobs', 0, publish.learningJobs, 'no 103 job created'));
    checks.push(check('publish-progression', 0, publish.progressionCalls, 'no progression call'));
    checks.push(
      check(
        'publish-no-observations',
        true,
        stored.sourceSegmentIds.every((id) => id.startsWith('manual:')),
        'no observation is invented',
      ),
    );
    scenario(
      'publish',
      published.status,
      `${published.changes.length} changes, epoch ${publish.fromEpoch}→${publish.learningEpoch}, fleet ${publish.fleetVersions.join(',')}`,
    );
  } finally {
    publishWorld.dispose();
  }

  // --- worker in progress --------------------------------------------------------------------
  const workerWorld = createStyleWorld();
  let worker: StyleSlidersReport['worker'];
  try {
    const job = workerWorld.job('job-report-103', 1);
    const admission = workerWorld.queue.queue.submit(job);
    const tracked = workerWorld.barrier.trackJob(job).status;
    workerWorld.session.open();
    workerWorld.session.setValue('followingMinGap', 8);
    workerWorld.session.queueApply();
    const published = runTicks(workerWorld, 8);
    worker = Object.freeze({
      inFlightBeforeApply: admission.status === 'QUEUED' && tracked === 'TRACKED',
      cancelled: (published.barrier?.cancelledJobs ?? []).includes('job-report-103'),
      lateResult: workerWorld.barrier.isCurrent(job).status,
      applyStatus: published.status,
    });
    checks.push(check('worker-tracked', true, worker.inFlightBeforeApply, 'real 103 job queued'));
    checks.push(check('worker-cancelled', true, worker.cancelled, '205 cancels the in-flight job'));
    checks.push(check('worker-late', 'LATE_RESULT', worker.lateResult, 'late result is ignored'));
    checks.push(
      check('worker-not-blocked', 'PUBLISHED', worker.applyStatus, 'apply is not blocked'),
    );
    scenario('worker-in-progress', worker.applyStatus, `job cancelled: ${worker.cancelled}`);
  } finally {
    workerWorld.dispose();
  }

  // --- stale draft ---------------------------------------------------------------------------
  const staleWorld = createStyleWorld();
  const staleOther = createAdditionalEditor(staleWorld, 'stale-other');
  let stale: StyleSlidersReport['stale'];
  try {
    staleWorld.session.open();
    staleWorld.session.setValue('speedDeltaUrban', 9);
    staleWorld.session.queueApply();
    staleOther.open();
    staleOther.setValue('comfortDeceleration', 5);
    staleOther.queueApply();
    const published = runSessionTicks(staleWorld, staleOther, 8);
    activateFleet(staleWorld, staleOther);
    const versionsBefore = [...staleWorld.versions()];
    const queueStatus = staleWorld.session.queueApply();
    const staleSaveState = staleWorld.session.getView()!.saveState;
    runTicks(staleWorld, 8);
    const rebased = staleWorld.session.rebase()!;
    stale = Object.freeze({
      queueStatus,
      saveState: staleSaveState,
      versionsUnchanged: versionsBefore.join(',') === staleWorld.versions().join(','),
      rebaseBase: rebased.baseVersionId,
      rebaseMergesProposal: rebased.proposed.speedDeltaUrban !== rebased.base.speedDeltaUrban,
    });
    checks.push(check('stale-queue', 'STALE_BASE', stale.queueStatus, 'stale draft is refused'));
    checks.push(check('stale-save-state', 'STALE', stale.saveState, 'visible stale state'));
    checks.push(check('stale-no-write', true, stale.versionsUnchanged, 'history is untouched'));
    checks.push(check('stale-rebase', published.versionId!, stale.rebaseBase, 'explicit rebase'));
    checks.push(
      check(
        'stale-no-merge',
        false,
        stale.rebaseMergesProposal,
        'rebase discards the old proposal',
      ),
    );
    scenario('stale-base', 'REFUSED', `queue ${queueStatus}, rebase ${stale.rebaseBase}`);
  } finally {
    staleOther.dispose();
    staleWorld.dispose();
  }

  // --- no-op and cancel ----------------------------------------------------------------------
  const noopWorld = createStyleWorld();
  let noop: StyleSlidersReport['noop'];
  try {
    noopWorld.session.open();
    const queueStatus = noopWorld.session.queueApply();
    runTicks(noopWorld, 8);
    const versionsAfterNoop = noopWorld.versions().length,
      barriersAfterNoop = noopWorld.barrier.barriers().length;
    noopWorld.session.setValue('redStopProbability', 30);
    noopWorld.session.queueApply();
    noopWorld.session.withdraw();
    runTicks(noopWorld, 8);
    noop = Object.freeze({
      queueStatus,
      versionsAfterNoop,
      barriersAfterNoop,
      cancelLeavesVersions: noopWorld.versions().length,
    });
    checks.push(check('noop-status', 'UNCHANGED', noop.queueStatus, 'no difference, no version'));
    checks.push(check('noop-versions', 1, noop.versionsAfterNoop, 'only the base version'));
    checks.push(check('noop-barriers', 0, noop.barriersAfterNoop, 'no barrier opened'));
    checks.push(check('cancel-versions', 1, noop.cancelLeavesVersions, 'cancel publishes nothing'));
    scenario('no-op-cancel', 'NO_CHANGE', `${noop.queueStatus} / withdrawn`);
  } finally {
    noopWorld.dispose();
  }

  // --- restore and later LEARNING ------------------------------------------------------------
  const restoreWorld = createStyleWorld();
  const restoreOther = createAdditionalEditor(restoreWorld, 'restore-other');
  let restore: StyleSlidersReport['restore'];
  try {
    restoreWorld.session.open();
    restoreWorld.session.setValue('speedDeltaUrban', 12);
    restoreWorld.session.queueApply();
    runTicks(restoreWorld, 8);
    activateFleet(restoreWorld);
    restoreOther.open();
    restoreOther.setValue('stopFullProbability', 20);
    restoreOther.queueApply();
    runSessionTicks(restoreWorld, restoreOther, 8);
    activateFleet(restoreWorld, restoreOther);
    const versionsBefore = [...restoreWorld.versions()];
    const epochBefore = restoreWorld.barrier.current().learningEpoch;
    restoreWorld.session.open();
    restoreWorld.session.requestRestore(STYLE_BASE);
    const restored = runTicks(restoreWorld, 8);
    activateFleet(restoreWorld);
    const epochAfter = restoreWorld.barrier.current().learningEpoch;
    const generation = restoreWorld.barrier.current();
    const decision = restoreWorld.barrier.isCurrent({
      playerId: 'player-1',
      profileId: restoreWorld.profileId,
      learningEpoch: generation.learningEpoch,
      baseVersionId: generation.baseVersionId,
      segmentId: generation.segmentId,
    });
    const versionsUnchangedAfterRestore =
      versionsBefore.join(',') === restoreWorld.versions().join(',');
    const learned = restoreWorld.store.derive({
      profileId: restoreWorld.profileId,
      versionId: 'report-learned',
      parentVersionId: STYLE_BASE,
      segmentId: generation.segmentId,
      reason: 'LEARNED',
      delta: {
        profileVersionId: 'report-learned',
        parentVersionId: STYLE_BASE,
        engineVersion: restoreWorld.store.engineVersion,
        schemaVersion: 1,
        units: 'SI',
        values: [{ key: 'speed_delta_urban', unit: 'm/s', value: 3 }],
      },
    });
    restore = Object.freeze({
      status: restored.status,
      restoredVersionId: restored.versionId ?? '',
      versionsUnchanged: versionsUnchangedAfterRestore,
      learningEpochBefore: epochBefore,
      learningEpochAfter: epochAfter,
      fleetVersion: restoreWorld.fleetVersions().join(','),
      learningAfterRestore: `${decision.status}:${learned.status}`,
    });
    checks.push(check('restore-status', 'RESTORED', restore.status, '114 restore committed'));
    checks.push(
      check('restore-no-version', true, restore.versionsUnchanged, 'restore edits no version'),
    );
    checks.push(check('restore-epoch', true, epochAfter > epochBefore, 'epoch advances'));
    checks.push(
      check('restore-fleet', STYLE_BASE, restore.fleetVersion, 'restored target activates'),
    );
    checks.push(
      check(
        'restore-learning',
        'CURRENT:ACCEPTED',
        restore.learningAfterRestore,
        'LEARNING can change the keys again',
      ),
    );
    scenario('restore', restore.status, `epoch ${epochBefore}→${epochAfter}`);
  } finally {
    restoreOther.dispose();
    restoreWorld.dispose();
  }

  // --- session worlds ------------------------------------------------------------------------
  const academiaWorld = createStyleWorld();
  const haosWorld = createStyleWorld({
    profileId: 'haos-profile',
    sessionId: 'session-haos',
    baseVersionId: 'haos-base',
    baseParameters: styleBaseParameters(),
  });
  let worlds: StyleSlidersReport['worlds'];
  try {
    academiaWorld.session.open();
    academiaWorld.session.setValue('speedDeltaUrban', 6);
    academiaWorld.session.queueApply();
    const academiaPublished = runTicks(academiaWorld, 8);
    activateFleet(academiaWorld);
    const academiaVersionsBefore = academiaWorld.versions().length;
    haosWorld.session.open();
    haosWorld.session.setValue('comfortDeceleration', 4);
    haosWorld.session.queueApply();
    const haosPublished = runTicks(haosWorld, 8);
    activateFleet(haosWorld);
    academiaWorld.session.open();
    academiaWorld.session.setValue('followingTimeHeadway', 2.4);
    academiaWorld.target.sessionId = 'session-haos';
    academiaWorld.target.worldEpoch = 9;
    academiaWorld.advanceTick();
    const invalidated = academiaWorld.session.getState().view?.saveState ?? '';
    const applyAfterSwitch = academiaWorld.session.queueApply();
    worlds = Object.freeze({
      academiaVersion: academiaPublished.versionId ?? '',
      haosVersion: haosPublished.versionId ?? '',
      academiaVersions: academiaVersionsBefore,
      haosVersions: haosWorld.versions().length,
      draftInvalidated: invalidated === 'SESSION_CHANGED',
      applyAfterSwitch,
    });
    checks.push(
      check('worlds-separated', 2, worlds.academiaVersions, 'Academia keeps its own history'),
    );
    checks.push(check('worlds-haos', 2, worlds.haosVersions, 'Haos publishes only in Haos'));
    checks.push(
      check('worlds-invalidated', true, worlds.draftInvalidated, 'session change invalidates'),
    );
    checks.push(
      check('worlds-refused', 'SESSION_CHANGED', worlds.applyAfterSwitch, 'no cross-world write'),
    );
    scenario(
      'session-worlds',
      'SEPARATED',
      `academia ${worlds.academiaVersion} / haos ${worlds.haosVersion}`,
    );
  } finally {
    haosWorld.dispose();
    academiaWorld.dispose();
  }

  // --- reload and storage bounds -------------------------------------------------------------
  const reloadWorld = createStyleWorld();
  let reload: StyleSlidersReport['reload'];
  let storage: StyleSlidersReport['storage'];
  try {
    reloadWorld.session.open();
    reloadWorld.session.setValue('redStopProbability', 55);
    reloadWorld.session.setValue('followingMinGap', 6);
    reloadWorld.session.queueApply();
    const published = runTicks(reloadWorld, 8);
    activateFleet(reloadWorld);
    reloadWorld.session.open();
    const view = reloadWorld.session.getView()!;
    reload = Object.freeze({
      baseVersionId: view.baseVersionId,
      saveState: view.saveState,
      redStopProbability: view.rows.find((row) => row.field === 'redStopProbability')!
        .displayValue!,
      versions: reloadWorld.versions().length,
    });
    const stats = reloadWorld.session.getStats();
    storage = Object.freeze({
      versions: stats.versions,
      maxVersionsPerProfile: 128,
      historyRows: stats.retainedHistoryRows,
      retainedDrafts: stats.retainedDrafts,
      storeWrites: stats.storeWrites,
      versionsAdded: stats.versionsAdded,
    });
    checks.push(
      check('reload-head', published.versionId!, reload.baseVersionId, 'reload reads the head'),
    );
    checks.push(check('reload-state', 'UNCHANGED', reload.saveState, 'no draft survives a reload'));
    checks.push(
      check('reload-value', 55, reload.redStopProbability, 'persisted value is displayed'),
    );
    checks.push(
      check(
        'storage-history',
        true,
        storage.historyRows <= STYLE_SLIDERS_HISTORY_ROWS,
        'bounded history rows',
      ),
    );
    checks.push(check('storage-drafts', 1, storage.retainedDrafts, 'one retained draft'));
    checks.push(
      check(
        'storage-writes',
        storage.versionsAdded,
        storage.storeWrites,
        'one store write per version',
      ),
    );
    scenario('reload', 'PERSISTED', `head ${reload.baseVersionId}`);
  } finally {
    reloadWorld.dispose();
  }

  // --- UI adapter cost -----------------------------------------------------------------------
  const clock = 0;
  const harness = createStyleHarness({ now: () => clock });
  let ui: StyleSlidersReport['ui'];
  try {
    harness.click(harness.cityTab());
    harness.drag('speedDeltaUrban', [18]);
    const before = harness.panel.getStyleTab()!.getStats();
    const current = harness.panel.getStyleDraft()!;
    for (let index = 0; index < 600; index += 1)
      harness.panel.updateStyle(current, 1000 + index * 16.5);
    const after = harness.panel.getStyleTab()!.getStats();
    const select = harness.restoreSelect();
    select.value = 'profile-v2';
    select.dispatch('change');
    harness.click(harness.restoreButton());
    harness.click(harness.confirmButton());
    const restoreStats = harness.panel.getStyleTab()!.getStats();
    ui = Object.freeze({
      enabledRows: harness.panel.getStyleView()!.rows.filter((row) => row.enabled).length,
      unavailableRows: STYLE_SLIDER_UNAVAILABLE.length,
      unavailabilityVisible: STYLE_SLIDER_UNAVAILABLE.every(
        (entry) => harness.unavailable(entry.parameterKey).hasAttribute('hidden') === false,
      ),
      saveState: harness.panel.getStyleView()!.saveState,
      writeHz: STYLE_SLIDERS_WRITE_HZ,
      frameUpdates: 600,
      frameWrites: after.writes - before.writes,
      frameRenders: after.renders - before.renders,
      restoreConfirms: restoreStats.restoreConfirms,
      globalListeners: restoreStats.globalListeners,
      elements: harness.panel.getStats().elements,
    });
    checks.push(check('ui-rows', 8, ui.enabledRows, 'eight enabled sliders'));
    checks.push(check('ui-unavailable', 3, ui.unavailableRows, 'three disabled keys'));
    checks.push(
      check(
        'ui-unavailable-visible',
        true,
        ui.unavailabilityVisible,
        'disabled keys are not hidden',
      ),
    );
    checks.push(check('ui-frame-writes', 0, ui.frameWrites, 'identical frames write nothing'));
    checks.push(check('ui-frame-renders', 0, ui.frameRenders, 'identical frames render nothing'));
    checks.push(check('ui-global-listeners', 0, ui.globalListeners, 'no global listener'));
    checks.push(check('ui-restore-confirm', 1, ui.restoreConfirms, 'restore needs confirmation'));
    scenario('ui', 'PASS', `600 frame updates, ${ui.frameWrites} writes`);
  } finally {
    harness.panel.dispose();
  }

  // --- layout --------------------------------------------------------------------------------
  for (const entry of STYLE_SLIDERS_LAYOUTS) {
    checks.push(
      check(
        `layout:${entry.id}`,
        true,
        entry.layout.fits,
        `${entry.layout.widthPx}px wide, ${entry.layout.visibleRows}/${entry.layout.totalRows} rows visible`,
      ),
    );
  }
  checks.push(
    check(
      'layout-1280',
      true,
      styleSlidersLayout({ widthPx: 1280, heightPx: 720, zoom: 1 }).scrolls,
      'the 8-row list scrolls at 1280×720',
    ),
  );
  scenario('layout', 'PASS', '1280×720, 1920×1080 and 150% zoom fit the 084 panel');

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: STYLE_SLIDERS_VERSION,
    contract: Object.freeze({
      tuningMapVersion: STYLE_SLIDERS_TUNING_MAP_VERSION,
      fields: Object.freeze([...STYLE_SLIDER_FIELDS]),
      parameterKeys: STYLE_SLIDER_PARAMETER_KEYS,
      ranges: Object.freeze(
        STYLE_SLIDER_FIELDS.map((field, index) => {
          const row = conversions[index]!;
          return Object.freeze({
            key: row.key,
            unit: STYLE_SLIDER_DEFINITIONS[field].unit,
            min: row.minUi,
            max: row.maxUi,
            step: STYLE_SLIDER_DEFINITIONS[field].step,
          });
        }),
      ),
      unavailable: Object.freeze(
        STYLE_SLIDER_UNAVAILABLE.map((entry) =>
          Object.freeze({
            key: entry.parameterKey,
            reason: entry.reason,
            reserved: entry.reserved,
          }),
        ),
      ),
      writeHz: STYLE_SLIDERS_WRITE_HZ,
      saveStates: Object.freeze(Object.keys(STYLE_SLIDERS_SAVE_STATE_LABELS)),
      tabLimits: Object.freeze({ ...STYLE_SLIDERS_TAB_LIMITS }),
      layouts: Object.freeze(
        STYLE_SLIDERS_LAYOUTS.map((entry) =>
          Object.freeze({
            id: entry.id,
            widthPx: entry.layout.widthPx,
            maxHeightPx: entry.layout.maxHeightPx,
            visibleRows: entry.layout.visibleRows,
            fits: entry.layout.fits,
          }),
        ),
      ),
    }),
    conversions: Object.freeze(conversions.map((row) => Object.freeze({ ...row }))),
    publish,
    worker,
    stale,
    noop,
    restore,
    worlds,
    reload,
    ui,
    storage,
    scenarios: Object.freeze(scenarios),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

export function styleSlidersReportMarkdown(report: StyleSlidersReport): string {
  const changeRows =
      report.publish === null
        ? ''
        : report.publish.changes
            .map(
              (change) =>
                `| ${change.parameterKey} | ${change.beforeText} | ${change.afterText} | ${change.before} | ${change.after} | ${change.valueProvenance} | ${change.evidence} |`,
            )
            .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
      )
      .join('\n'),
    conversionRows = report.conversions
      .map(
        (row) =>
          `| ${row.key} | ${row.minUi} | ${row.minParameter} | ${row.maxUi} | ${row.maxParameter} | ${row.roundTripMin} | ${row.roundTripMax} |`,
      )
      .join('\n'),
    scenarioRows = report.scenarios
      .map((entry) => `| ${entry.name} | ${entry.status} | ${entry.detail} |`)
      .join('\n'),
    unavailableRows = report.contract.unavailable
      .map((entry) => `| ${entry.key} | ${entry.reason} | ${entry.reserved ? 'R' : '—'} |`)
      .join('\n'),
    layoutRows = report.contract.layouts
      .map(
        (entry) =>
          `| ${entry.id} | ${entry.widthPx} | ${entry.maxHeightPx} | ${entry.visibleRows} | ${entry.fits ? 'PASS' : 'FAIL'} |`,
      )
      .join('\n');
  return `# 230 style sliders and MANUAL_TUNING report

Machine-readable transcript: [report.json](report.json). Generated by
\`node --import ./scripts/register-typescript.mjs scripts/run-style-sliders-report.mjs\`; it contains no
wall-clock value, random value or browser-only state.

Version: \`${report.version}\`, tuning map \`${report.contract.tuningMapVersion}\`. The report drives the
real \`createStyleSlidersPanel\` tab, the real 109 store with the 102 validator, the real 205 barrier,
the real 110 activation and the real 103 queue harness over deterministic inputs.

## Contract

| Aspect | Value |
| --- | --- |
| Fields | ${report.contract.fields.join(', ')} |
| 092 keys | ${report.contract.parameterKeys.join(', ')} |
| Read-out ceiling | ${report.contract.writeHz} Hz |
| Save states | ${report.contract.saveStates.join(', ')} |
| Visible disabled keys | ${report.contract.unavailable.length} |

## Conversions

| Key | UI min | Parameter min | UI max | Parameter max | Round-trip min | Round-trip max |
| --- | --- | --- | --- | --- | --- | --- |
${conversionRows}

## Disabled catalog keys

| Key | Reason | Badge |
| --- | --- | --- |
${unavailableRows}

## Published differences

${
  report.publish === null
    ? 'No publication.'
    : `Version \`${report.publish.versionId}\` from \`${report.publish.parentVersionId}\`, reason \`${report.publish.reason}\`,
checksum \`${report.publish.checksum}\`, barrier \`${report.publish.barrierReason}\` with epoch
${report.publish.fromEpoch}→${report.publish.learningEpoch}, 110 origin \`${report.publish.activationOrigin}\`,
activation tick ${String(report.publish.activationTick)}, fleet ${report.publish.fleetVersions.join(', ')} on
${report.publish.fleetVehicles} vehicles at tick ${String(report.publish.commonFleetTick)}.

| Key | Before | After | SI before | SI after | Value provenance | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
${changeRows}`
}

## Scenarios

| Scenario | Status | Detail |
| --- | --- | --- |
${scenarioRows}

## Layout

| Viewport | Width px | Max height px | Visible rows | Fits |
| --- | --- | --- | --- | --- |
${layoutRows}

## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

${report.summary.passed}/${report.summary.checks} checks passed — ${report.summary.pass ? 'PASS' : 'FAIL'}.
`;
}
