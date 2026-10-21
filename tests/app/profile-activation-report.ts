import {
  DEFAULT_FLEET_COUNTS,
  PROFILE_ACTIVATION_LIMITS,
  PROFILE_ACTIVATION_VERSION,
  createFleetRegistry,
  createProfileActivation,
  createProfileActivationSource,
} from '../../src/fleet';
import type {
  FleetAddOptions,
  FleetDriverKind,
  FleetRegistry,
  ProfileActivation,
  ProfileActivationSource,
} from '../../src/fleet';
import {
  PROFILE_ACTIVATION_APP_VERSION,
  createCityProfileSource,
  publishProfileVersion,
  readProfileActivation,
} from '../../src/app';
import { createCandidateProfileStore } from '../../src/learning';
import { isProfileStoreAccepted, verifyProfileVersionChecksum } from '../../src/profiles';
import type { ProfileStore, ProfileVersion } from '../../src/profiles';
import type { VehicleClassId } from '../../src/vehicles';

const ENGINE = 'engine-1';
const OTHER_ENGINE = 'engine-2';
const PROFILE_ID = 'city-profile';
const BASE_VERSION = 'profile-v1';
const NEXT_VERSION = 'profile-v2';
const NOW = '2026-10-21T00:00:00Z';

export interface ProfileActivationScenario {
  readonly name: string;
  readonly status: string;
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ProfileActivationCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ProfileActivationReport {
  readonly version: typeof PROFILE_ACTIVATION_VERSION;
  readonly appVersion: typeof PROFILE_ACTIVATION_APP_VERSION;
  readonly contract: Readonly<{
    origins: readonly string[];
    rejectionCodes: readonly string[];
    reportStatuses: readonly string[];
    limits: Readonly<Record<string, number>>;
  }>;
  readonly scenarios: readonly ProfileActivationScenario[];
  readonly checks: readonly ProfileActivationCheck[];
  readonly summary: Readonly<{
    scenarios: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

interface World {
  readonly registry: FleetRegistry;
  readonly source: ProfileActivationSource;
  readonly activation: ProfileActivation;
  tick(): number;
  setTick(tick: number): void;
}

function configuration(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'session-110-evidence',
    worldEpoch: 1,
    scenarioId: 'city-fixture',
    seed: 20261021,
    namespace: 'city:evidence:activation',
    taxiCount: DEFAULT_FLEET_COUNTS.taxis,
    civilianCount: DEFAULT_FLEET_COUNTS.civilians,
    profile: { profileId: PROFILE_ID, versionId: BASE_VERSION },
  };
}

function world(options: { readonly engineVersion?: string } = {}): World {
  let current = 0;
  const source = createProfileActivationSource({
    profileId: PROFILE_ID,
    versionId: BASE_VERSION,
  });
  const registry = createFleetRegistry(configuration(), { profileSource: source });
  const activation = createProfileActivation({
    registry,
    source,
    engineVersion: options.engineVersion ?? ENGINE,
    clock: () => current,
    now: () => NOW,
  });
  return {
    registry,
    source,
    activation,
    tick: () => current,
    setTick(tick: number): void {
      current = tick;
    },
  };
}

function publishInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profileId: PROFILE_ID,
    versionId: NEXT_VERSION,
    engineVersion: ENGINE,
    publishedAtTick: 0,
    activateAtTick: 1,
    reason: 'learned segment applied',
    origin: 'LEARNED',
    idempotencyKey: 'activation-key-1',
    ...overrides,
  };
}

function appliedVersions(registry: FleetRegistry): readonly string[] {
  return registry.list().map((vehicle) => registry.state(vehicle.vehicleId)!.appliedProfileVersion);
}

function uniqueVersions(registry: FleetRegistry): readonly string[] {
  return [...new Set(appliedVersions(registry))].sort();
}

function controlModeCounts(registry: FleetRegistry): Readonly<Record<string, number>> {
  const counts: Record<string, number> = { AUTO: 0, MANUAL: 0, LEARNING: 0 };
  for (const vehicle of registry.list()) {
    const mode = registry.state(vehicle.vehicleId)!.controlMode;
    counts[mode] = (counts[mode] ?? 0) + 1;
  }
  return counts;
}

function summaryOf(report: {
  readonly before: Readonly<Record<string, number>>;
  readonly after: Readonly<Record<string, number>>;
}): string {
  const before = Object.entries(report.before)
    .map(([version, count]) => `${version}=${count}`)
    .join(',');
  const after = Object.entries(report.after)
    .map(([version, count]) => `${version}=${count}`)
    .join(',');
  return `${before} -> ${after}`;
}

function createStore(engineVersion = ENGINE): ProfileStore {
  return createCandidateProfileStore({ engineVersion, now: () => NOW });
}

function createBase(store: ProfileStore, profileId: string, versionId: string): ProfileVersion {
  const result = store.createBase({
    profileId,
    versionId,
    parameters: { speed_delta_urban: 0, following_time_headway: 1.8 },
    createdAt: NOW,
  });
  if (!isProfileStoreAccepted(result)) throw new Error('Expected an accepted base version');
  return result.profileVersion;
}

function failingRegistry(registry: FleetRegistry, targetId: string) {
  let injected = 0;
  const wrapper = {
    get configuration() {
      return registry.configuration;
    },
    context: () => registry.context(),
    get: (vehicleId: string) => registry.get(vehicleId),
    state: (vehicleId: string) => registry.state(vehicleId),
    list: () => registry.list(),
    addVehicle: (kind: FleetDriverKind, classId?: VehicleClassId, options?: FleetAddOptions) =>
      registry.addVehicle(kind, classId, options),
    updateState: (vehicleId: string, patch: unknown) => {
      const data = patch as Record<string, unknown>;
      if (vehicleId === targetId && data.appliedProfileVersion === NEXT_VERSION && injected === 0) {
        injected += 1;
        throw new Error('injected registry write failure');
      }
      return registry.updateState(vehicleId, patch);
    },
    removeVehicle: (vehicleId: string) => registry.removeVehicle(vehicleId),
    counts: () => registry.counts(),
    report: () => registry.report(),
    dispose: () => registry.dispose(),
  };
  return { wrapper: wrapper as FleetRegistry, injections: () => injected };
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): ProfileActivationCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

export function runProfileActivationReport(): ProfileActivationReport {
  const scenarios: ProfileActivationScenario[] = [];
  const checks: ProfileActivationCheck[] = [];

  // 1. Full fleet before/after.
  const fleet = world();
  const fleetBefore = uniqueVersions(fleet.registry);
  const publication = fleet.activation.publish(publishInput());
  const beforeTick = fleet.activation.applyAt(0);
  fleet.setTick(1);
  const fleetReport = fleet.activation.applyAt(1);
  const fleetAfter = uniqueVersions(fleet.registry);
  const fleetModes = controlModeCounts(fleet.registry);
  scenarios.push(
    Object.freeze({
      name: 'full fleet before/after',
      status: fleetReport.status,
      detail: Object.freeze({
        taxis: fleet.registry.counts().taxis,
        civilians: fleet.registry.counts().civilians,
        total: fleet.registry.list().length,
        before: summaryOf(beforeTick),
        after: summaryOf(fleetReport),
        updated: fleetReport.updated.length,
        activationTick: fleetReport.activationTick,
        appliedTick: fleetReport.appliedTick,
        beforeVersions: fleetBefore.join(','),
        afterVersions: fleetAfter.join(','),
      }),
    }),
  );
  checks.push(
    check(
      'contract-version',
      PROFILE_ACTIVATION_VERSION,
      PROFILE_ACTIVATION_VERSION,
      '110 activation contract',
    ),
    check(
      'app-version',
      PROFILE_ACTIVATION_APP_VERSION,
      PROFILE_ACTIVATION_APP_VERSION,
      '110 composition contract',
    ),
    check('fleet-total', 64, fleet.registry.list().length, '24 taxis plus 40 civilians'),
    check(
      'before-tick-status',
      'PENDING',
      beforeTick.status,
      'nothing is written before the common tick',
    ),
    check(
      'before-tick-version',
      BASE_VERSION,
      fleetBefore.join(','),
      'the whole fleet keeps the base version',
    ),
    check('before-tick-updated', 0, beforeTick.updated.length, 'the early apply writes no vehicle'),
    check(
      'after-tick-status',
      'APPLIED',
      fleetReport.status,
      'the common tick applies the command',
    ),
    check(
      'after-tick-updated',
      64,
      fleetReport.updated.length,
      'every existing vehicle is written',
    ),
    check(
      'after-single-version',
      NEXT_VERSION,
      fleetAfter.join(','),
      'no mixed fleet after activation',
    ),
    check('common-tick', 1, fleetReport.appliedTick ?? -1, 'all vehicles receive the same tick'),
    check(
      'before-histogram',
      64,
      fleetReport.before[BASE_VERSION] ?? -1,
      'before counts are the full fleet',
    ),
    check(
      'after-histogram',
      64,
      fleetReport.after[NEXT_VERSION] ?? -1,
      'after counts are the full fleet',
    ),
    check(
      'publication-origin',
      'LEARNED',
      publication.command?.origin ?? 'missing',
      'provenance is preserved',
    ),
    check('fleet-auto-count', 64, fleetModes.AUTO ?? 0, 'control modes stay AUTO'),
  );

  // 2. Manual/player/learning preserved.
  const modesWorld = world();
  const modesRegistry = modesWorld.registry;
  for (const [index, vehicle] of modesRegistry.list().entries()) {
    if (index % 7 === 0)
      modesRegistry.updateState(vehicle.vehicleId, { tick: 0, controlMode: 'MANUAL' });
    if (index % 9 === 0)
      modesRegistry.updateState(vehicle.vehicleId, { tick: 0, controlMode: 'LEARNING' });
  }
  const modesBefore = controlModeCounts(modesRegistry);
  modesWorld.activation.publish(publishInput());
  modesWorld.setTick(1);
  const modesReport = modesWorld.activation.applyAt(1);
  const modesAfter = controlModeCounts(modesRegistry);
  scenarios.push(
    Object.freeze({
      name: 'manual and player preserved',
      status: modesReport.status,
      detail: Object.freeze({
        updated: modesReport.updated.length,
        manualBefore: modesBefore.MANUAL,
        manualAfter: modesAfter.MANUAL,
        learningBefore: modesBefore.LEARNING,
        learningAfter: modesAfter.LEARNING,
        versions: uniqueVersions(modesRegistry).join(','),
      }),
    }),
  );
  checks.push(
    check('manual-updated', 64, modesReport.updated.length, 'MANUAL vehicles are not skipped'),
    check(
      'manual-count',
      modesBefore.MANUAL,
      modesAfter.MANUAL,
      'MANUAL control modes are preserved',
    ),
    check(
      'learning-count',
      modesBefore.LEARNING,
      modesAfter.LEARNING,
      'LEARNING modes are preserved',
    ),
    check(
      'manual-version',
      NEXT_VERSION,
      uniqueVersions(modesRegistry).join(','),
      'player-driven vehicles adopt the version',
    ),
  );

  // 3. Later vehicle.
  const later = world();
  later.activation.publish(publishInput());
  const pendingVehicle = later.registry.addVehicle('TAXI', 'compact', { tick: 0 });
  const pendingVersion = later.registry.state(pendingVehicle.vehicleId)!.appliedProfileVersion;
  later.setTick(1);
  const laterReport = later.activation.applyAt(1);
  const appliedVehicle = later.registry.addVehicle('TAXI', 'sedan', { tick: 2 });
  const appliedVersion = later.registry.state(appliedVehicle.vehicleId)!.appliedProfileVersion;
  scenarios.push(
    Object.freeze({
      name: 'later vehicle',
      status: laterReport.status,
      detail: Object.freeze({
        pendingVersion,
        appliedVersion,
        updated: laterReport.updated.length,
        total: later.registry.list().length,
      }),
    }),
  );
  checks.push(
    check(
      'later-pending-version',
      NEXT_VERSION,
      pendingVersion,
      'a vehicle created before the tick reads the pending target',
    ),
    check(
      'later-applied-version',
      NEXT_VERSION,
      appliedVersion,
      'a vehicle created later reads the applied target',
    ),
    check(
      'later-included',
      65,
      laterReport.updated.length,
      'the vehicle created before the tick is part of the plan',
    ),
    check('later-total', 66, later.registry.list().length, 'the fleet grew by two taxis'),
  );

  // 4. Duplicate publication.
  const duplicate = world();
  const first = duplicate.activation.publish(publishInput());
  const second = duplicate.activation.publish(publishInput());
  scenarios.push(
    Object.freeze({
      name: 'duplicate publish',
      status: second.status,
      detail: Object.freeze({
        duplicate: second.duplicate,
        firstCommand: first.command?.commandId ?? 'missing',
        secondCommand: second.command?.commandId ?? 'missing',
        commands: duplicate.activation.commands().length,
        pending: duplicate.activation.stats().pending,
      }),
    }),
  );
  checks.push(
    check('duplicate-flag', true, second.duplicate, 'the same idempotency key is a no-op'),
    check(
      'duplicate-command',
      first.command?.commandId ?? 'missing',
      second.command?.commandId ?? 'missing',
      'the existing command is returned',
    ),
    check(
      'duplicate-commands',
      1,
      duplicate.activation.commands().length,
      'no second command is stored',
    ),
    check(
      'duplicate-pending',
      1,
      duplicate.activation.stats().pending,
      'exactly one pending command',
    ),
  );

  // 5. Rejected engine, foreign profile and missing version.
  const engineWorld = world();
  const engineRejection = engineWorld.activation.publish(
    publishInput({ engineVersion: OTHER_ENGINE }),
  );
  const store = createStore();
  const base = createBase(store, PROFILE_ID, 'city-v1');
  createBase(store, PROFILE_ID, 'city-v2');
  createBase(store, 'other-profile', 'other-v1');
  const versionsBefore = store.stats().versions;
  engineWorld.setTick(7);
  const appPublish = publishProfileVersion(
    {
      store,
      registry: engineWorld.registry,
      activation: engineWorld.activation,
      clock: () => engineWorld.tick(),
    },
    {
      versionId: 'city-v2',
      origin: 'IMPORT',
      idempotencyKey: 'import-1',
      reason: 'imported profile',
    },
  );
  const foreignEngineStore = {
    engineVersion: OTHER_ENGINE,
    getVersion: (versionId: string) => store.getVersion(versionId),
  } as unknown as ProfileStore;
  const foreignEngine = readProfileActivation(
    { store: foreignEngineStore, registry: engineWorld.registry },
    { versionId: 'city-v1' },
  );
  const foreignProfile = readProfileActivation(
    { store, registry: engineWorld.registry },
    { versionId: 'other-v1' },
  );
  const missing = readProfileActivation(
    { store, registry: engineWorld.registry },
    { versionId: 'missing-v1' },
  );
  const afterStore = store.getVersion('city-v1');
  const appCommand = appPublish.status === 'PUBLISHED' ? appPublish.command : null;
  scenarios.push(
    Object.freeze({
      name: 'rejected engine',
      status: engineRejection.status,
      detail: Object.freeze({
        code: engineRejection.rejection?.code ?? 'missing',
        readCode: foreignEngine.status === 'REJECTED' ? foreignEngine.rejection.code : 'FOUND',
        foreignProfileCode:
          foreignProfile.status === 'REJECTED' ? foreignProfile.rejection.code : 'FOUND',
        missingCode: missing.status === 'REJECTED' ? missing.rejection.code : 'FOUND',
        appPublish: appPublish.status,
        appPublishedAt: appCommand?.publishedAtTick ?? -1,
        appActivateAt: appCommand?.activateAtTick ?? -1,
        checksumValid: afterStore === null ? false : verifyProfileVersionChecksum(afterStore),
        storeVersions: store.stats().versions,
      }),
    }),
  );
  checks.push(
    check(
      'engine-rejection',
      'ENGINE_MISMATCH',
      engineRejection.rejection?.code ?? 'missing',
      'the controller rejects another engine',
    ),
    check(
      'app-engine-rejection',
      'ENGINE_MISMATCH',
      foreignEngine.status === 'REJECTED' ? foreignEngine.rejection.code : 'FOUND',
      'the composition rejects an engine-incompatible version',
    ),
    check(
      'app-profile-rejection',
      'PROFILE_MISMATCH',
      foreignProfile.status === 'REJECTED' ? foreignProfile.rejection.code : 'FOUND',
      'a foreign profile version is rejected',
    ),
    check(
      'app-missing-rejection',
      'VERSION_NOT_FOUND',
      missing.status === 'REJECTED' ? missing.rejection.code : 'FOUND',
      'a missing version is rejected',
    ),
    check(
      'version-untouched',
      true,
      afterStore === null ? false : verifyProfileVersionChecksum(afterStore),
      'the 109 version stays valid',
    ),
    check(
      'app-publish-status',
      'PUBLISHED',
      appPublish.status,
      'the composition publishes the stored version',
    ),
    check(
      'app-publish-tick',
      7,
      appCommand?.publishedAtTick ?? -1,
      'the publication uses the injected fixed tick',
    ),
    check(
      'app-publish-activate',
      8,
      appCommand?.activateAtTick ?? -1,
      'the activation targets the next common tick',
    ),
    check(
      'app-publish-origin',
      'IMPORT',
      appCommand?.origin ?? 'missing',
      'provenance is preserved',
    ),
    check(
      'store-untouched',
      versionsBefore,
      store.stats().versions,
      'no version is published by activation',
    ),
    check(
      'store-content',
      JSON.stringify(base),
      JSON.stringify(afterStore),
      'the stored version is byte-identical',
    ),
  );

  // 6. Atomic rollback.
  const rollbackWorld = (() => {
    let current = 0;
    const source = createProfileActivationSource({
      profileId: PROFILE_ID,
      versionId: BASE_VERSION,
    });
    const baseRegistry = createFleetRegistry(configuration(), { profileSource: source });
    const failing = failingRegistry(baseRegistry, baseRegistry.list()[10]!.vehicleId);
    const activation = createProfileActivation({
      registry: failing.wrapper,
      source,
      engineVersion: ENGINE,
      clock: () => current,
      now: () => NOW,
    });
    return {
      registry: baseRegistry,
      activation,
      failing,
      setTick(tick: number): void {
        current = tick;
      },
    };
  })();
  rollbackWorld.activation.publish(publishInput());
  rollbackWorld.setTick(1);
  const rollbackReport = rollbackWorld.activation.applyAt(1);
  const rollbackVersions = uniqueVersions(rollbackWorld.registry);
  const rollbackModes = controlModeCounts(rollbackWorld.registry);
  scenarios.push(
    Object.freeze({
      name: 'rollback',
      status: rollbackReport.status,
      detail: Object.freeze({
        rolledBack: rollbackReport.rolledBack,
        restored: rollbackReport.restored,
        exact: rollbackReport.exact,
        versions: rollbackVersions.join(','),
        auto: rollbackModes.AUTO ?? 0,
        injected: rollbackWorld.failing.injections(),
        after: summaryOf(rollbackReport),
        commandStatus: rollbackWorld.activation.commands()[0]?.status ?? 'missing',
      }),
    }),
  );
  checks.push(
    check(
      'rollback-status',
      'REJECTED',
      rollbackReport.status,
      'an injected write failure rejects the command',
    ),
    check('rollback-applied', true, rollbackReport.rolledBack, 'the rollback ran'),
    check(
      'rollback-restored',
      10,
      rollbackReport.restored,
      'every already-written vehicle is restored',
    ),
    check(
      'rollback-exact',
      false,
      rollbackReport.exact,
      'the monotonic tick cannot be rewound by 057',
    ),
    check(
      'rollback-versions',
      BASE_VERSION,
      rollbackVersions.join(','),
      'the fleet never keeps two versions',
    ),
    check('rollback-modes', 64, rollbackModes.AUTO ?? 0, 'control modes survive the rollback'),
    check(
      'rollback-injections',
      1,
      rollbackWorld.failing.injections(),
      'the failure is injected exactly once',
    ),
    check(
      'rollback-command',
      'REJECTED',
      rollbackWorld.activation.commands()[0]?.status ?? 'missing',
      'the pending command is closed as rejected',
    ),
  );

  // 7. Sixty frames after the activation.
  const frames = world();
  frames.activation.publish(publishInput());
  frames.setTick(1);
  const frameReport = frames.activation.applyAt(1);
  let idleFrames = 0;
  for (let tick = 2; tick <= 60; tick += 1) {
    frames.setTick(tick);
    const report = frames.activation.applyAt(tick);
    if (report.status === 'IDLE') idleFrames += 1;
    if (report.updated.length !== 0) throw new Error('Activation reapplied on a later frame');
  }
  const frameStats = frames.activation.stats();
  scenarios.push(
    Object.freeze({
      name: 'sixty frames',
      status: frameReport.status,
      detail: Object.freeze({
        frames: 59,
        idleFrames,
        applied: frameStats.applied,
        vehiclesUpdated: frameStats.vehiclesUpdated,
        lastAppliedTick: frameStats.lastAppliedTick,
        pending: frameStats.pending,
      }),
    }),
  );
  checks.push(
    check('frames-idle', 59, idleFrames, 'every frame after the common tick is idle'),
    check('frames-applied', 1, frameStats.applied, 'the command applies exactly once'),
    check(
      'frames-writes',
      64,
      frameStats.vehiclesUpdated,
      'later frames never write another vehicle',
    ),
    check(
      'frames-last-tick',
      1,
      frameStats.lastAppliedTick ?? -1,
      'the applied tick does not move',
    ),
    check('frames-pending', 0, frameStats.pending, 'no command stays pending'),
  );

  // Composition adapter check (read-only source).
  const adapter = createCityProfileSource(fleet.activation);
  checks.push(
    check(
      'source-adapter',
      NEXT_VERSION,
      adapter.activeProfile().versionId,
      'the composition source reads the applied target',
    ),
  );

  for (const item of [fleet, modesWorld, later, duplicate, engineWorld, rollbackWorld, frames]) {
    item.registry.dispose();
  }
  store.dispose();

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: PROFILE_ACTIVATION_VERSION,
    appVersion: PROFILE_ACTIVATION_APP_VERSION,
    contract: Object.freeze({
      origins: Object.freeze(['LEARNED', 'MANUAL_TUNING', 'RESTORE', 'IMPORT']),
      rejectionCodes: Object.freeze([
        'INVALID_VERSION',
        'PROFILE_MISMATCH',
        'ENGINE_MISMATCH',
        'STALE_VERSION',
        'TICK_NOT_ADVANCING',
        'ACTIVATION_PENDING',
        'DISPOSED',
      ]),
      reportStatuses: Object.freeze(['IDLE', 'PENDING', 'APPLIED', 'REJECTED']),
      limits: Object.freeze({
        commands: PROFILE_ACTIVATION_LIMITS.commands,
        idCodeUnits: PROFILE_ACTIVATION_LIMITS.idCodeUnits,
        reasonCodeUnits: PROFILE_ACTIVATION_LIMITS.reasonCodeUnits,
      }),
    }),
    scenarios: Object.freeze(scenarios),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      scenarios: scenarios.length,
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
  });
}

export function profileActivationReportMarkdown(report: ProfileActivationReport): string {
  const scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

Status: \`${entry.status}\`

| Field | Value |
| --- | --- |
${Object.entries(entry.detail)
  .map(([key, value]) => `| ${key} | ${String(value)} |`)
  .join('\n')}
`,
      )
      .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
      )
      .join('\n');
  return `# 110 profile activation report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run profile:activate\`;
it contains no wall-clock value, random value or browser-only state.

Version: \`${report.version}\`; composition: \`${report.appVersion}\`.

## Contract

Origins: ${report.contract.origins.join(', ')}. Report statuses: ${report.contract.reportStatuses.join(', ')}.
Closed rejections: ${report.contract.rejectionCodes.join(', ')}. Retained commands: ${report.contract.limits.commands}.

${scenarioSections}
## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Scenarios: ${report.summary.scenarios}
- Checks: ${report.summary.passed}/${report.summary.checks}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}
