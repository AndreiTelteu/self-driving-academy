import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_FLEET_COUNTS,
  PROFILE_ACTIVATION_LIMITS,
  PROFILE_ACTIVATION_VERSION,
  createFleetRegistry,
  createProfileActivation,
  createProfileActivationSource,
  profileActivationOrigins,
  profileActivationRejectionCodes,
} from '../../src/fleet';
import type {
  FleetAddOptions,
  FleetDriverKind,
  FleetRegistry,
  FleetVehicleState,
  ProfileActivation,
  ProfileActivationSource,
  ProfileActivationPublication,
  ProfileActivationReport,
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
const PROFILE_ID = 'city-profile';
const BASE_VERSION = 'profile-v1';
const NEXT_VERSION = 'profile-v2';
const NOW = '2026-10-21T00:00:00Z';

interface Fixture {
  readonly registry: FleetRegistry;
  readonly source: ProfileActivationSource;
  readonly activation: ProfileActivation;
  tick(): number;
  setTick(tick: number): void;
}

function configuration(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'session-110',
    worldEpoch: 1,
    scenarioId: 'city-fixture',
    seed: 20261021,
    namespace: 'city:fixture:activation',
    taxiCount: DEFAULT_FLEET_COUNTS.taxis,
    civilianCount: DEFAULT_FLEET_COUNTS.civilians,
    profile: { profileId: PROFILE_ID, versionId: BASE_VERSION },
    ...overrides,
  };
}

function fixture(
  overrides: Record<string, unknown> = {},
  options: {
    readonly profile?: { readonly profileId: string; readonly versionId: string };
    readonly engineVersion?: string;
    readonly maxCommands?: number;
    readonly wrap?: (registry: FleetRegistry) => FleetRegistry;
  } = {},
): Fixture {
  let current = 0;
  const profile = options.profile ?? { profileId: PROFILE_ID, versionId: BASE_VERSION };
  const source = createProfileActivationSource(profile);
  const base = createFleetRegistry(configuration({ ...overrides, profile }), {
    profileSource: source,
  });
  const registry = options.wrap === undefined ? base : options.wrap(base);
  const activation = createProfileActivation({
    registry,
    source,
    engineVersion: options.engineVersion ?? ENGINE,
    clock: () => current,
    now: () => NOW,
    ...(options.maxCommands === undefined ? {} : { maxCommands: options.maxCommands }),
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

function rejectionOf(publication: ProfileActivationPublication): string {
  assert.equal(publication.status, 'REJECTED');
  assert.equal(publication.command, null);
  assert.notEqual(publication.rejection, null);
  return publication.rejection?.code ?? 'missing';
}

function applied(report: ProfileActivationReport): void {
  assert.equal(report.status, 'APPLIED');
  assert.equal(report.rolledBack, false);
  assert.equal(report.failure, null);
}

function statesOf(registry: FleetRegistry): readonly FleetVehicleState[] {
  return Object.freeze(
    registry.list().map((vehicle) => {
      const state = registry.state(vehicle.vehicleId);
      assert.notEqual(state, undefined);
      return state as FleetVehicleState;
    }),
  );
}

function recorded(registry: FleetRegistry) {
  const patches: { readonly vehicleId: string; readonly keys: readonly string[] }[] = [];
  const calls: string[] = [];
  const wrapper = {
    get configuration() {
      return registry.configuration;
    },
    context() {
      calls.push('context');
      return registry.context();
    },
    get(vehicleId: string) {
      calls.push('get');
      return registry.get(vehicleId);
    },
    state(vehicleId: string) {
      return registry.state(vehicleId);
    },
    list() {
      return registry.list();
    },
    addVehicle(kind: FleetDriverKind, classId?: VehicleClassId, options?: FleetAddOptions) {
      calls.push('addVehicle');
      return registry.addVehicle(kind, classId, options);
    },
    updateState(vehicleId: string, patch: unknown) {
      patches.push({ vehicleId, keys: Object.keys(patch as Record<string, unknown>).sort() });
      return registry.updateState(vehicleId, patch);
    },
    removeVehicle(vehicleId: string) {
      calls.push('removeVehicle');
      return registry.removeVehicle(vehicleId);
    },
    counts() {
      return registry.counts();
    },
    report() {
      return registry.report();
    },
    dispose() {
      calls.push('dispose');
      registry.dispose();
    },
  };
  return { wrapper: wrapper as FleetRegistry, patches, calls };
}

function failingRegistry(registry: FleetRegistry, targetId: string, versionId: string) {
  let injected = 0;
  const forwardKeys: string[] = [];
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
    updateState(vehicleId: string, patch: unknown) {
      const data = patch as Record<string, unknown>;
      forwardKeys.push(Object.keys(data).sort().join(','));
      if (vehicleId === targetId && data.appliedProfileVersion === versionId && injected === 0) {
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
  return { wrapper: wrapper as FleetRegistry, injections: () => injected, forwardKeys };
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
  assert.equal(result.status, 'ACCEPTED');
  if (!isProfileStoreAccepted(result)) throw new Error('expected an accepted base version');
  return result.profileVersion;
}

test('110 activates one common version for all 24 taxis and 40 civilians only at the common tick', () => {
  const world = fixture();
  assert.equal(world.registry.list().length, 64);
  for (const state of statesOf(world.registry)) {
    assert.equal(state.appliedProfileVersion, BASE_VERSION);
    assert.equal(state.tick, 0);
  }

  const publication = world.activation.publish(publishInput());
  assert.equal(publication.status, 'ACCEPTED');
  assert.equal(publication.duplicate, false);
  assert.equal(publication.command?.status, 'PENDING');
  assert.equal(publication.command?.activateAtTick, 1);
  assert.equal(publication.command?.publishedAtTick, 0);
  assert.equal(publication.command?.origin, 'LEARNED');
  assert.equal(publication.command?.reason, 'learned segment applied');

  const beforeTick = world.activation.applyAt(0);
  assert.equal(beforeTick.status, 'PENDING');
  assert.deepEqual(beforeTick.before, { [BASE_VERSION]: 64 });
  assert.deepEqual(beforeTick.after, { [BASE_VERSION]: 64 });
  assert.deepEqual(beforeTick.updated, []);
  assert.equal(beforeTick.appliedTick, null);
  assert.equal(beforeTick.activationTick, 1);
  for (const state of statesOf(world.registry)) {
    assert.equal(state.appliedProfileVersion, BASE_VERSION);
    assert.equal(state.tick, 0);
  }

  world.setTick(1);
  const report = world.activation.applyAt(1);
  applied(report);
  assert.deepEqual(report.before, { [BASE_VERSION]: 64 });
  assert.deepEqual(report.after, { [NEXT_VERSION]: 64 });
  assert.equal(report.updated.length, 64);
  assert.equal(report.activationTick, 1);
  assert.equal(report.appliedTick, 1);
  assert.equal(new Set(report.updated).size, 64);
  for (const state of statesOf(world.registry)) {
    assert.equal(state.appliedProfileVersion, NEXT_VERSION);
    assert.equal(state.tick, 1);
  }
  assert.equal(world.activation.pending(), null);
  const stats = world.activation.stats();
  assert.equal(stats.applied, 1);
  assert.equal(stats.pending, 0);
  assert.equal(stats.vehiclesUpdated, 64);
  assert.equal(stats.lastAppliedTick, 1);
  assert.equal(world.activation.commands()[0]?.status, 'APPLIED');
  world.registry.dispose();
});

test('110 includes MANUAL/LEARNING and unselected vehicles and preserves their control mode', () => {
  const world = fixture();
  const vehicles = world.registry.list();
  const manual = vehicles.filter((_vehicle, index) => index % 7 === 0).map((v) => v.vehicleId);
  const learning = vehicles.filter((_vehicle, index) => index % 9 === 0).map((v) => v.vehicleId);
  for (const vehicleId of manual)
    world.registry.updateState(vehicleId, { tick: 0, controlMode: 'MANUAL' });
  for (const vehicleId of learning)
    world.registry.updateState(vehicleId, { tick: 0, controlMode: 'LEARNING' });
  const expectedModes = new Map(
    world.registry
      .list()
      .map((vehicle) => [vehicle.vehicleId, world.registry.state(vehicle.vehicleId)!.controlMode]),
  );
  assert.ok([...expectedModes.values()].includes('MANUAL'));
  assert.ok([...expectedModes.values()].includes('LEARNING'));

  assert.equal(world.activation.publish(publishInput()).status, 'ACCEPTED');
  world.setTick(1);
  const report = world.activation.applyAt(1);
  applied(report);
  assert.equal(report.updated.length, 64);
  for (const vehicleId of world.registry.list().map((vehicle) => vehicle.vehicleId)) {
    const state = world.registry.state(vehicleId)!;
    assert.equal(state.appliedProfileVersion, NEXT_VERSION);
    assert.equal(state.controlMode, expectedModes.get(vehicleId));
    assert.ok(report.updated.includes(vehicleId));
  }
  // Presentation-only "hidden/selected/player" flags cannot filter a registry row.
  assert.equal(report.updated.length, world.registry.list().length);
  world.registry.dispose();
});

test('110 writes only tick and appliedProfileVersion and keeps routes, rides and fleet state intact', () => {
  const source = createProfileActivationSource({ profileId: PROFILE_ID, versionId: BASE_VERSION });
  const base = createFleetRegistry(configuration(), { profileSource: source });
  const recorder = recorded(base);
  let current = 0;
  const activation = createProfileActivation({
    registry: recorder.wrapper,
    source,
    engineVersion: ENGINE,
    clock: () => current,
    now: () => NOW,
  });
  const beforeVehicles = recorder.wrapper.list();
  const beforeStates = statesOf(recorder.wrapper);
  const beforeReport = recorder.wrapper.report();

  assert.equal(activation.publish(publishInput()).status, 'ACCEPTED');
  current = 1;
  const report = activation.applyAt(1);
  applied(report);

  assert.equal(recorder.patches.length, 64);
  for (const patch of recorder.patches)
    assert.deepEqual(patch.keys, ['appliedProfileVersion', 'tick']);
  assert.deepEqual(recorder.calls, []);
  assert.deepEqual(recorder.wrapper.list(), beforeVehicles);
  assert.deepEqual(recorder.wrapper.report(), beforeReport);
  const afterStates = statesOf(recorder.wrapper);
  for (const [index, state] of afterStates.entries()) {
    const previous = beforeStates[index]!;
    assert.equal(state.controlMode, previous.controlMode);
    assert.equal(state.tick, 1);
    assert.equal(state.appliedProfileVersion, NEXT_VERSION);
    assert.equal(previous.appliedProfileVersion, BASE_VERSION);
  }
  base.dispose();
});

test('110 gives a vehicle created later the applied version and a pending target before the tick', () => {
  const world = fixture();
  assert.equal(world.activation.publish(publishInput()).status, 'ACCEPTED');
  const pendingVehicle = world.registry.addVehicle('TAXI', 'compact', { tick: 0 });
  assert.equal(world.registry.state(pendingVehicle.vehicleId)!.appliedProfileVersion, NEXT_VERSION);
  world.setTick(1);
  assert.equal(world.activation.applyAt(1).updated.length, 65);
  const laterVehicle = world.registry.addVehicle('TAXI', 'sedan', { tick: 2 });
  assert.equal(world.registry.state(laterVehicle.vehicleId)!.appliedProfileVersion, NEXT_VERSION);
  assert.equal(world.registry.state(laterVehicle.vehicleId)!.controlMode, 'AUTO');

  // A later activation includes the vehicles created after the previous one.
  world.setTick(2);
  assert.equal(
    world.activation.publish(
      publishInput({
        versionId: 'profile-v3',
        publishedAtTick: 2,
        activateAtTick: 3,
        idempotencyKey: 'activation-key-2',
      }),
    ).status,
    'ACCEPTED',
  );
  world.setTick(3);
  const report = world.activation.applyAt(3);
  applied(report);
  assert.equal(report.updated.length, 66);
  assert.ok(report.updated.includes(laterVehicle.vehicleId));
  assert.deepEqual(report.after, { 'profile-v3': 66 });
  world.registry.dispose();
});

test('110 returns the existing command for a duplicate idempotency key', () => {
  const world = fixture();
  const first = world.activation.publish(publishInput());
  const second = world.activation.publish(publishInput());
  assert.equal(first.status, 'ACCEPTED');
  assert.equal(second.status, 'ACCEPTED');
  assert.equal(second.duplicate, true);
  assert.equal(second.command?.commandId, first.command?.commandId);
  assert.equal(world.activation.commands().length, 1);
  assert.equal(world.activation.stats().pending, 1);
  assert.equal(world.activation.stats().rejected, 0);
  world.registry.dispose();
});

test('110 rejects a second distinct pending command until the common tick is applied', () => {
  const world = fixture();
  assert.equal(world.activation.publish(publishInput()).status, 'ACCEPTED');
  const second = world.activation.publish(
    publishInput({
      versionId: 'profile-v3',
      idempotencyKey: 'activation-key-2',
    }),
  );
  assert.equal(rejectionOf(second), 'ACTIVATION_PENDING');
  assert.equal(world.activation.commands().length, 1);
  assert.equal(world.activation.pending()?.versionId, NEXT_VERSION);
  assert.equal(world.activation.stats().rejected, 1);
  assert.equal(world.activation.activeProfile().versionId, NEXT_VERSION);
  world.registry.dispose();
});

test('110 rejects stale, non-advancing and regressing ticks', () => {
  const world = fixture();
  world.setTick(5);
  assert.equal(world.activation.applyAt(5).status, 'IDLE');
  assert.equal(
    rejectionOf(world.activation.publish(publishInput({ publishedAtTick: 4, activateAtTick: 7 }))),
    'TICK_NOT_ADVANCING',
  );
  assert.equal(
    rejectionOf(world.activation.publish(publishInput({ publishedAtTick: 5, activateAtTick: 5 }))),
    'TICK_NOT_ADVANCING',
  );
  assert.equal(
    rejectionOf(
      world.activation.publish(
        publishInput({ idempotencyKey: 'k2', publishedAtTick: 6, activateAtTick: 6 }),
      ),
    ),
    'TICK_NOT_ADVANCING',
  );
  const valid = world.activation.publish(publishInput({ publishedAtTick: 5, activateAtTick: 6 }));
  assert.equal(valid.status, 'ACCEPTED');
  assert.equal(valid.command?.activateAtTick, 6);
  const regressed = world.activation.applyAt(4);
  assert.equal(regressed.status, 'REJECTED');
  assert.equal(regressed.rejection?.code, 'TICK_NOT_ADVANCING');
  world.registry.dispose();
});

test('110 rejects invalid version identities, foreign profiles, engine mismatches and the active version', () => {
  const world = fixture();
  assert.equal(
    rejectionOf(world.activation.publish(publishInput({ versionId: '  ' }))),
    'INVALID_VERSION',
  );
  assert.equal(
    rejectionOf(world.activation.publish(publishInput({ versionId: 'v 2' }))),
    'INVALID_VERSION',
  );
  assert.equal(
    rejectionOf(world.activation.publish(publishInput({ profileId: 'other-profile' }))),
    'PROFILE_MISMATCH',
  );
  assert.equal(
    rejectionOf(world.activation.publish(publishInput({ engineVersion: 'engine-2' }))),
    'ENGINE_MISMATCH',
  );
  assert.equal(
    rejectionOf(world.activation.publish(publishInput({ versionId: BASE_VERSION }))),
    'STALE_VERSION',
  );
  const accepted = world.activation.publish(publishInput());
  assert.equal(accepted.status, 'ACCEPTED');
  assert.equal(
    rejectionOf(
      world.activation.publish(
        publishInput({ versionId: 'profile-v3', idempotencyKey: 'activation-key-1' }),
      ),
    ),
    'STALE_VERSION',
  );
  assert.equal(world.activation.publish(publishInput()).duplicate, true);
  assert.throws(() => world.activation.publish({ ...publishInput(), extra: true }), /Unknown/);
  assert.throws(() => world.activation.publish(publishInput({ reason: '' })), /nonempty|contract/i);
  world.registry.dispose();
});

test('110 publishes an immutable 109 version through the composition root without mutating the store', () => {
  const world = fixture({}, { profile: { profileId: 'academy', versionId: 'academy-v1' } });
  const store = createStore();
  const base = createBase(store, 'academy', 'academy-v1');
  createBase(store, 'academy', 'academy-v2');
  createBase(store, 'haos', 'haos-v1');
  const versionsBefore = store.stats().versions;

  const read = readProfileActivation(
    { store, registry: world.registry, activation: world.activation },
    { versionId: 'academy-v1' },
  );
  assert.equal(read.status, 'FOUND');
  assert.equal(read.status === 'FOUND' ? read.profileId : null, 'academy');
  assert.equal(read.status === 'FOUND' ? read.engineVersion : null, ENGINE);
  assert.equal(
    read.status === 'FOUND' ? verifyProfileVersionChecksum(read.profileVersion) : false,
    true,
  );

  const missing = readProfileActivation({ store, registry: world.registry }, { versionId: 'nope' });
  assert.equal(missing.status, 'REJECTED');
  assert.equal(missing.status === 'REJECTED' ? missing.rejection.code : null, 'VERSION_NOT_FOUND');

  const foreign = readProfileActivation(
    { store, registry: world.registry },
    { versionId: 'haos-v1' },
  );
  assert.equal(foreign.status === 'REJECTED' ? foreign.rejection.code : null, 'PROFILE_MISMATCH');

  const foreignEngine = {
    engineVersion: 'engine-2',
    getVersion: (versionId: string) => store.getVersion(versionId),
  } as unknown as ProfileStore;
  const engineMismatch = readProfileActivation(
    { store: foreignEngine, registry: world.registry },
    { versionId: 'academy-v1' },
  );
  assert.equal(
    engineMismatch.status === 'REJECTED' ? engineMismatch.rejection.code : null,
    'ENGINE_MISMATCH',
  );

  world.setTick(20);
  world.activation.applyAt(20);
  const stale = publishProfileVersion(
    { store, registry: world.registry, activation: world.activation, clock: () => 10 },
    {
      versionId: 'academy-v1',
      origin: 'MANUAL_TUNING',
      idempotencyKey: 'manual-1',
      reason: 'slider tuning',
    },
  );
  assert.equal(stale.status, 'REJECTED');
  assert.equal(stale.status === 'REJECTED' ? stale.rejection.code : null, 'STALE_TICK');
  assert.equal(
    stale.status === 'REJECTED' ? stale.rejection.activationCode : null,
    'TICK_NOT_ADVANCING',
  );

  const published = publishProfileVersion(
    { store, registry: world.registry, activation: world.activation, clock: () => 20 },
    {
      versionId: 'academy-v2',
      origin: 'MANUAL_TUNING',
      idempotencyKey: 'manual-1',
      reason: 'slider tuning',
    },
  );
  assert.equal(published.status, 'PUBLISHED');
  assert.equal(published.status === 'PUBLISHED' ? published.command.activateAtTick : null, 21);
  assert.equal(published.status === 'PUBLISHED' ? published.command.publishedAtTick : null, 20);
  assert.equal(published.status === 'PUBLISHED' ? published.duplicate : null, false);
  assert.equal(store.stats().versions, versionsBefore);
  const after = store.getVersion('academy-v1');
  assert.deepEqual(after, base);
  assert.equal(after !== null ? verifyProfileVersionChecksum(after) : false, true);
  world.registry.dispose();
});

test('110 rolls back an injected write failure without leaving a mixed fleet', () => {
  let current = 0;
  const source = createProfileActivationSource({ profileId: PROFILE_ID, versionId: BASE_VERSION });
  const base = createFleetRegistry(configuration(), { profileSource: source });
  const targetId = base.list()[10]!.vehicleId;
  const failing = failingRegistry(base, targetId, NEXT_VERSION);
  const activation = createProfileActivation({
    registry: failing.wrapper,
    source,
    engineVersion: ENGINE,
    clock: () => current,
    now: () => NOW,
  });
  assert.equal(activation.publish(publishInput()).status, 'ACCEPTED');
  current = 1;
  const report = activation.applyAt(1);
  assert.equal(report.status, 'REJECTED');
  assert.equal(report.rolledBack, true);
  assert.equal(report.restored, 10);
  assert.equal(report.exact, false);
  assert.equal(report.failure?.stage, 'APPLY');
  assert.match(report.failure?.message ?? '', /injected registry write failure/);
  assert.deepEqual(report.after, { [BASE_VERSION]: 64 });
  assert.equal(failing.injections(), 1);

  for (const vehicle of base.list()) {
    const state = base.state(vehicle.vehicleId)!;
    assert.equal(state.appliedProfileVersion, BASE_VERSION);
    assert.equal(state.controlMode, 'AUTO');
    assert.notEqual(state.appliedProfileVersion, NEXT_VERSION);
  }
  assert.equal(activation.pending(), null);
  const stats = activation.stats();
  assert.equal(stats.rollbacks, 1);
  assert.equal(stats.rejected, 1);
  assert.equal(stats.applied, 0);
  assert.equal(stats.commands, 1);
  assert.deepEqual(
    activation.commands().map((command) => command.status),
    ['REJECTED'],
  );

  // The fleet stays usable: the next publication is not blocked by a pending command.
  current = 1;
  assert.equal(
    activation.publish(
      publishInput({ idempotencyKey: 'after-rollback', publishedAtTick: 1, activateAtTick: 2 }),
    ).status,
    'ACCEPTED',
  );
  current = 2;
  const retried = activation.applyAt(2);
  applied(retried);
  assert.deepEqual(retried.after, { [NEXT_VERSION]: 64 });
  base.dispose();
});

test('110 bounds the command history and counts dropped commands', () => {
  const world = fixture({}, { maxCommands: 4 });
  let tick = 0;
  for (let index = 1; index <= 8; index += 1) {
    world.setTick(tick);
    const publication = world.activation.publish(
      publishInput({
        versionId: `profile-v${index + 1}`,
        idempotencyKey: `key-${index}`,
        publishedAtTick: tick,
        activateAtTick: tick + 1,
      }),
    );
    assert.equal(publication.status, 'ACCEPTED');
    world.setTick(tick + 1);
    applied(world.activation.applyAt(tick + 1));
    tick += 2;
  }
  const commands = world.activation.commands();
  assert.equal(commands.length, 4);
  assert.equal(world.activation.stats().commands, 4);
  assert.equal(world.activation.stats().droppedCommands, 4);
  assert.equal(world.activation.stats().applied, 8);
  assert.deepEqual(
    commands.map((command) => command.versionId),
    ['profile-v6', 'profile-v7', 'profile-v8', 'profile-v9'],
  );
  world.registry.dispose();
});

test('110 exposes the pending then applied profile reference for later vehicles', () => {
  const world = fixture();
  const adapter = createCityProfileSource(world.activation);
  assert.deepEqual(adapter.activeProfile(), { profileId: PROFILE_ID, versionId: BASE_VERSION });
  assert.equal(world.activation.publish(publishInput()).status, 'ACCEPTED');
  assert.deepEqual(world.activation.activeProfile(), {
    profileId: PROFILE_ID,
    versionId: NEXT_VERSION,
  });
  assert.deepEqual(world.source.activeProfile(), {
    profileId: PROFILE_ID,
    versionId: NEXT_VERSION,
  });
  assert.deepEqual(adapter.activeProfile(), world.activation.activeProfile());
  assert.ok(Object.isFrozen(adapter.activeProfile()));
  world.setTick(1);
  assert.equal(world.activation.applyAt(1).status, 'APPLIED');
  assert.deepEqual(world.activation.activeProfile(), {
    profileId: PROFILE_ID,
    versionId: NEXT_VERSION,
  });
  world.registry.dispose();
});

test('110 applies once and never reapplies on later ticks or frames', () => {
  const world = fixture();
  assert.equal(world.activation.publish(publishInput()).status, 'ACCEPTED');
  world.setTick(1);
  assert.equal(world.activation.applyAt(1).status, 'APPLIED');
  for (let tick = 2; tick <= 62; tick += 1) {
    world.setTick(tick);
    const report = world.activation.applyAt(tick);
    assert.equal(report.status, 'IDLE');
    assert.deepEqual(report.updated, []);
    assert.deepEqual(report.after, { [NEXT_VERSION]: 64 });
  }
  assert.equal(world.activation.stats().applied, 1);
  assert.equal(world.activation.stats().vehiclesUpdated, 64);
  world.registry.dispose();
});

test('110 keeps the audit timestamp out of scheduling and preserves provenance', () => {
  const world = fixture();
  const publication = world.activation.publish(
    publishInput({ origin: 'RESTORE', reason: 'restore previous accepted style' }),
  );
  assert.equal(publication.status, 'ACCEPTED');
  assert.equal(publication.command?.publishedAtIso, NOW);
  assert.equal(publication.command?.publishedAtTick, 0);
  assert.equal(publication.command?.activateAtTick, 1);
  assert.equal(publication.command?.origin, 'RESTORE');
  assert.equal(publication.command?.reason, 'restore previous accepted style');
  world.setTick(1);
  const report = world.activation.applyAt(1);
  assert.equal(report.appliedTick, 1);
  assert.equal(report.activationTick, 1);
  world.registry.dispose();
});

test('110 disposes idempotently and rejects later publications', () => {
  const world = fixture();
  assert.equal(world.activation.publish(publishInput()).status, 'ACCEPTED');
  world.setTick(1);
  assert.equal(world.activation.applyAt(1).status, 'APPLIED');
  world.activation.dispose();
  world.activation.dispose();
  const stats = world.activation.stats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.commands, 0);
  assert.equal(stats.lastAppliedTick, null);
  assert.deepEqual(world.activation.commands(), []);
  assert.equal(world.activation.pending(), null);
  assert.equal(rejectionOf(world.activation.publish(publishInput())), 'DISPOSED');
  const afterDispose = world.activation.applyAt(2);
  assert.equal(afterDispose.status, 'REJECTED');
  assert.equal(afterDispose.rejection?.code, 'DISPOSED');
  assert.deepEqual(world.activation.activeProfile(), {
    profileId: PROFILE_ID,
    versionId: NEXT_VERSION,
  });
  world.registry.dispose();
});

test('110 keeps a closed contract vocabulary and a bounded command history', () => {
  assert.equal(PROFILE_ACTIVATION_VERSION, '110-profile-activation-v1');
  assert.equal(PROFILE_ACTIVATION_APP_VERSION, '110-profile-activation-app-v1');
  assert.deepEqual(
    [...profileActivationOrigins],
    ['LEARNED', 'MANUAL_TUNING', 'RESTORE', 'IMPORT'],
  );
  assert.deepEqual(
    [...profileActivationRejectionCodes],
    [
      'INVALID_VERSION',
      'PROFILE_MISMATCH',
      'ENGINE_MISMATCH',
      'STALE_VERSION',
      'TICK_NOT_ADVANCING',
      'ACTIVATION_PENDING',
      'DISPOSED',
    ],
  );
  assert.equal(PROFILE_ACTIVATION_LIMITS.commands, 16);
  assert.ok(PROFILE_ACTIVATION_LIMITS.commands <= PROFILE_ACTIVATION_LIMITS.maxConfiguredCommands);
});
