import { choice, record, requireContract, text, tick as readTick } from '../sessions';
import { parseCityProfileReference } from './registry';
import type {
  CityProfileReference,
  CityProfileSource,
  FleetRegistry,
  FleetVehicleState,
} from './registry';

/**
 * Atomic common-tick profile activation for PBI 110.
 *
 * One immutable command is published per activation and applied at the next common fixed tick to
 * every vehicle already in the 057 registry, including hidden, selected, player-driven, MANUAL and
 * LEARNING ones. The controller owns no physics, route, ride, camera or selection state: it writes
 * only `FleetVehicleState.appliedProfileVersion` and `tick` through `registry.updateState`, and
 * never touches `controlMode`.
 *
 * The complete fleet plan is validated before the first write. If a later write throws, every
 * already-written vehicle is restored and the command is rejected, so the fleet never ends up with
 * two profile versions. The 057 registry deliberately refuses to rewind `tick`; the rollback
 * therefore restores the exact previous version and control mode and reports whether the monotonic
 * tick could also be restored (`exact`).
 *
 * This module never imports `src/profiles`: the 109 store and its `ProfileVersion` records stay in
 * the composition root (`src/app/profile-activation.ts`). Tick readback is an injected port, so no
 * simulation internals are imported either.
 */
export const PROFILE_ACTIVATION_VERSION = '110-profile-activation-v1' as const;

export const profileActivationOrigins = ['LEARNED', 'MANUAL_TUNING', 'RESTORE', 'IMPORT'] as const;
export type ProfileActivationOrigin = (typeof profileActivationOrigins)[number];

export const profileActivationCommandStatuses = ['PENDING', 'APPLIED', 'REJECTED'] as const;
export type ProfileActivationCommandStatus = (typeof profileActivationCommandStatuses)[number];

export const profileActivationReportStatuses = ['IDLE', 'PENDING', 'APPLIED', 'REJECTED'] as const;
export type ProfileActivationReportStatus = (typeof profileActivationReportStatuses)[number];

/** Closed publication rejection vocabulary; apply failures are reported separately. */
export const profileActivationRejectionCodes = [
  'INVALID_VERSION',
  'PROFILE_MISMATCH',
  'ENGINE_MISMATCH',
  'STALE_VERSION',
  'TICK_NOT_ADVANCING',
  'ACTIVATION_PENDING',
  'DISPOSED',
] as const;
export type ProfileActivationRejectionCode = (typeof profileActivationRejectionCodes)[number];

export const PROFILE_ACTIVATION_LIMITS = Object.freeze({
  /** Retained command history; the pending command is never evicted. */
  commands: 16,
  maxConfiguredCommands: 256,
  idCodeUnits: 256,
  reasonCodeUnits: 240,
});

export interface ProfileActivationCommand {
  readonly version: typeof PROFILE_ACTIVATION_VERSION;
  readonly commandId: string;
  readonly profileId: string;
  readonly versionId: string;
  readonly engineVersion: string;
  readonly publishedAtTick: number;
  readonly activateAtTick: number;
  /** Audit metadata only; scheduling and every report use the fixed tick, never wall-clock. */
  readonly publishedAtIso: string;
  readonly reason: string;
  readonly origin: ProfileActivationOrigin;
  readonly idempotencyKey: string;
  readonly status: ProfileActivationCommandStatus;
}

export interface ProfileActivationRejection {
  readonly code: ProfileActivationRejectionCode;
  readonly message: string;
}

export interface ProfileActivationPublication {
  readonly version: typeof PROFILE_ACTIVATION_VERSION;
  readonly status: 'ACCEPTED' | 'REJECTED';
  readonly command: ProfileActivationCommand | null;
  /** `true` when an identical idempotency key returned the existing command. */
  readonly duplicate: boolean;
  readonly rejection: ProfileActivationRejection | null;
}

export interface ProfileActivationFailure {
  /** `PLAN` writes nothing; `APPLY` was rolled back; `ROLLBACK` could not finish cleanly. */
  readonly stage: 'PLAN' | 'APPLY' | 'ROLLBACK';
  readonly message: string;
}

export interface ProfileActivationReport {
  readonly version: typeof PROFILE_ACTIVATION_VERSION;
  readonly status: ProfileActivationReportStatus;
  /** Tick supplied by the caller of `applyAt`. */
  readonly tick: number;
  readonly commandId: string | null;
  readonly profileId: string | null;
  readonly versionId: string | null;
  /** Scheduled common tick of the command; `null` when nothing is pending or applied. */
  readonly activationTick: number | null;
  /** Tick actually written to every vehicle; `null` until an activation is applied. */
  readonly appliedTick: number | null;
  /** Applied-version histogram of the whole fleet before the plan ran. */
  readonly before: Readonly<Record<string, number>>;
  /** Applied-version histogram of the whole fleet after the plan or rollback ran. */
  readonly after: Readonly<Record<string, number>>;
  /** Vehicle ids written by this activation, in stable registry order. */
  readonly updated: readonly string[];
  readonly rolledBack: boolean;
  /** Vehicles restored to their previous version/mode by the rollback. */
  readonly restored: number;
  /** `true` when the rollback also restored every vehicle tick exactly. */
  readonly exact: boolean;
  readonly rejection: ProfileActivationRejection | null;
  readonly failure: ProfileActivationFailure | null;
}

export interface ProfileActivationStats {
  readonly version: typeof PROFILE_ACTIVATION_VERSION;
  readonly disposed: boolean;
  readonly profileId: string;
  readonly engineVersion: string | null;
  /** Retained commands (bounded). */
  readonly commands: number;
  readonly pending: number;
  /** Cumulative applied activations. */
  readonly applied: number;
  /** Cumulative closed rejections (publication and apply). */
  readonly rejected: number;
  readonly rollbacks: number;
  readonly droppedCommands: number;
  /** Cumulative vehicle state writes from successful activations. */
  readonly vehiclesUpdated: number;
  readonly lastAppliedTick: number | null;
}

/** A `CityProfileSource` whose reference the controller can advance for later `addVehicle` calls. */
export interface ProfileActivationSource extends CityProfileSource {
  set(reference: unknown): CityProfileReference;
}

export interface ProfileActivationOptions {
  readonly registry?: unknown;
  /** Writable source handed to `createFleetRegistry` so later vehicles read the live target. */
  readonly source?: unknown;
  /** Expected engine version; pinned from the first publication when omitted. */
  readonly engineVersion?: unknown;
  /** Fixed-tick readback. Defaults to the highest tick already present in the fleet. */
  readonly clock?: unknown;
  /** Wall-clock audit timestamp for commands; never used for scheduling. */
  readonly now?: unknown;
  readonly maxCommands?: unknown;
}

export interface ProfileActivation {
  readonly version: typeof PROFILE_ACTIVATION_VERSION;
  readonly profileId: string;
  readonly engineVersion: string | null;
  /** Read-only port for the fleet composition; later vehicles get the pending/applied target. */
  readonly source: CityProfileSource;
  publish(input: unknown): ProfileActivationPublication;
  applyAt(tick: unknown): ProfileActivationReport;
  /** Alias of `applyAt` for the fixed-tick step callback. */
  advance(tick: unknown): ProfileActivationReport;
  pending(): ProfileActivationCommand | null;
  activeProfile(): CityProfileReference;
  commands(): readonly ProfileActivationCommand[];
  stats(): ProfileActivationStats;
  dispose(): void;
}

interface CommandRecord {
  readonly commandId: string;
  readonly profileId: string;
  readonly versionId: string;
  readonly engineVersion: string;
  readonly publishedAtTick: number;
  readonly activateAtTick: number;
  readonly publishedAtIso: string;
  readonly reason: string;
  readonly origin: ProfileActivationOrigin;
  readonly idempotencyKey: string;
  status: ProfileActivationCommandStatus;
}

interface PlanEntry {
  readonly vehicleId: string;
  readonly previous: FleetVehicleState;
}

const publishFields = [
  'profileId',
  'versionId',
  'engineVersion',
  'publishedAtTick',
  'activateAtTick',
  'reason',
  'origin',
  'idempotencyKey',
] as const;

const optionFields = [
  'registry',
  'source',
  'engineVersion',
  'clock',
  'now',
  'maxCommands',
] as const;

/** Creates the writable source used for the registry and for later vehicle insertion. */
export function createProfileActivationSource(initial: unknown): ProfileActivationSource {
  let reference = parseCityProfileReference(initial);
  return Object.freeze({
    activeProfile: () => reference,
    set(next: unknown): CityProfileReference {
      reference = parseCityProfileReference(next);
      return reference;
    },
  });
}

function readRegistry(value: unknown): FleetRegistry {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as FleetRegistry).configuration === 'object' &&
      (value as FleetRegistry).configuration !== null &&
      typeof (value as FleetRegistry).configuration.profile?.versionId === 'string' &&
      typeof (value as FleetRegistry).list === 'function' &&
      typeof (value as FleetRegistry).state === 'function' &&
      typeof (value as FleetRegistry).updateState === 'function',
    'Profile activation requires a real fleet registry',
  );
  return value as FleetRegistry;
}

function readSource(value: unknown): ProfileActivationSource {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as ProfileActivationSource).activeProfile === 'function' &&
      typeof (value as ProfileActivationSource).set === 'function',
    'Profile activation requires a writable city profile source',
  );
  return value as ProfileActivationSource;
}

function readRequest(
  value: unknown,
  allowed: readonly string[],
  contract: string,
): Record<string, unknown> {
  const data = record(value);
  const allowedFields = new Set(allowed);
  for (const key of Object.keys(data))
    requireContract(allowedFields.has(key), `Unknown ${contract} field: ${key}`);
  for (const key of allowed) requireContract(data[key] !== undefined, `Missing ${contract} field`);
  return data;
}

/** Options reader: unknown keys are rejected, optional keys are simply absent. */
function readOptions(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  const data = record(value);
  const allowedFields = new Set(allowed);
  for (const key of Object.keys(data))
    requireContract(allowedFields.has(key), `Unknown profile activation option: ${key}`);
  requireContract(data.registry !== undefined, 'Profile activation requires a registry');
  return data;
}

function boundedText(value: unknown, field: string, maximum: number): string {
  const raw = text(value);
  requireContract(
    raw.trim() === raw && raw.length <= maximum,
    `${field} exceeds ${maximum} characters or carries outer whitespace`,
  );
  return raw;
}

/** Returns `null` for an unusable version identity, which is the closed `INVALID_VERSION` reason. */
function readVersionId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > PROFILE_ACTIVATION_LIMITS.idCodeUnits) return null;
  if (value.trim() !== value || /\s/.test(value)) return null;
  return value;
}

function readLimit(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  requireContract(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 1 &&
      value <= PROFILE_ACTIVATION_LIMITS.maxConfiguredCommands,
    'Invalid profile activation command limit',
  );
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function frozenCounts(counts: Map<string, number>): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const key of [...counts.keys()].sort(compareText)) result[key] = counts.get(key) ?? 0;
  return Object.freeze(result);
}

export function createProfileActivation(options: ProfileActivationOptions): ProfileActivation {
  const data = readOptions(options, optionFields);
  const registry = readRegistry(data.registry);
  const configurationProfile = parseCityProfileReference(registry.configuration.profile);
  const source =
    data.source === undefined
      ? createProfileActivationSource(configurationProfile)
      : readSource(data.source);
  requireContract(
    source.activeProfile().profileId === configurationProfile.profileId,
    'Profile activation source identity mismatch',
  );
  const expectedEngine =
    data.engineVersion === undefined
      ? null
      : boundedText(data.engineVersion, 'engineVersion', PROFILE_ACTIVATION_LIMITS.idCodeUnits);
  requireContract(
    data.clock === undefined || typeof data.clock === 'function',
    'Profile activation clock must be a function',
  );
  requireContract(
    data.now === undefined || typeof data.now === 'function',
    'Profile activation now must be a function',
  );
  const clock =
    data.clock === undefined
      ? (): number => {
          let maximum = 0;
          for (const vehicle of registry.list()) {
            const state = registry.state(vehicle.vehicleId);
            if (state !== undefined) maximum = Math.max(maximum, state.tick);
          }
          return maximum;
        }
      : (data.clock as () => number);
  const now =
    data.now === undefined ? (): string => new Date().toISOString() : (data.now as () => string);
  const maxCommands = readLimit(data.maxCommands, PROFILE_ACTIVATION_LIMITS.commands);

  const history: CommandRecord[] = [];
  let sequence = 0;
  let appliedTotal = 0;
  let rejectedTotal = 0;
  let rollbackTotal = 0;
  let droppedCommands = 0;
  let vehiclesUpdated = 0;
  let lastAppliedTick: number | null = null;
  let lastAppliedReference: CityProfileReference = parseCityProfileReference(
    source.activeProfile(),
  );
  let observedTick = readTick(clock());
  let disposed = false;

  function currentTick(): number {
    return Math.max(observedTick, readTick(clock()));
  }

  function commandOf(record: CommandRecord): ProfileActivationCommand {
    return Object.freeze({
      version: PROFILE_ACTIVATION_VERSION,
      commandId: record.commandId,
      profileId: record.profileId,
      versionId: record.versionId,
      engineVersion: record.engineVersion,
      publishedAtTick: record.publishedAtTick,
      activateAtTick: record.activateAtTick,
      publishedAtIso: record.publishedAtIso,
      reason: record.reason,
      origin: record.origin,
      idempotencyKey: record.idempotencyKey,
      status: record.status,
    });
  }

  function commandOrNull(record: CommandRecord | null): ProfileActivationCommand | null {
    return record === null ? null : commandOf(record);
  }

  function rejectPublication(
    code: ProfileActivationRejectionCode,
    message: string,
  ): ProfileActivationPublication {
    rejectedTotal += 1;
    return Object.freeze({
      version: PROFILE_ACTIVATION_VERSION,
      status: 'REJECTED' as const,
      command: null,
      duplicate: false,
      rejection: Object.freeze({ code, message }),
    });
  }

  function acceptPublication(
    record: CommandRecord,
    duplicate: boolean,
  ): ProfileActivationPublication {
    return Object.freeze({
      version: PROFILE_ACTIVATION_VERSION,
      status: 'ACCEPTED' as const,
      command: commandOf(record),
      duplicate,
      rejection: null,
    });
  }

  function countVersions(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const vehicle of registry.list()) {
      const state = registry.state(vehicle.vehicleId);
      if (state === undefined) continue;
      counts.set(state.appliedProfileVersion, (counts.get(state.appliedProfileVersion) ?? 0) + 1);
    }
    return counts;
  }

  function trimHistory(): void {
    while (history.length > maxCommands) {
      const index = history.findIndex((entry) => entry.status !== 'PENDING');
      if (index === -1) break;
      history.splice(index, 1);
      droppedCommands += 1;
    }
  }

  function publish(input: unknown): ProfileActivationPublication {
    if (disposed) return rejectPublication('DISPOSED', 'The profile activation was disposed');
    const request = readRequest(input, publishFields, 'profile activation');
    const profileId = boundedText(
      request.profileId,
      'profileId',
      PROFILE_ACTIVATION_LIMITS.idCodeUnits,
    );
    const versionId = readVersionId(request.versionId);
    if (versionId === null)
      return rejectPublication(
        'INVALID_VERSION',
        'A profile activation needs a usable version identity',
      );
    const engineVersion = boundedText(
      request.engineVersion,
      'engineVersion',
      PROFILE_ACTIVATION_LIMITS.idCodeUnits,
    );
    const publishedAtTick = readTick(request.publishedAtTick);
    const activateAtTick = readTick(request.activateAtTick);
    const reason = boundedText(request.reason, 'reason', PROFILE_ACTIVATION_LIMITS.reasonCodeUnits);
    const origin = choice(request.origin, profileActivationOrigins);
    const idempotencyKey = boundedText(
      request.idempotencyKey,
      'idempotencyKey',
      PROFILE_ACTIVATION_LIMITS.idCodeUnits,
    );
    const publishedAtIso = text(now());
    const current = currentTick();

    if (profileId !== configurationProfile.profileId)
      return rejectPublication(
        'PROFILE_MISMATCH',
        `The fleet profile is ${configurationProfile.profileId}, not ${profileId}`,
      );
    if (expectedEngine !== null && engineVersion !== expectedEngine)
      return rejectPublication(
        'ENGINE_MISMATCH',
        `The activation must target engine version ${expectedEngine}`,
      );
    if (publishedAtTick < current || activateAtTick <= current || activateAtTick <= publishedAtTick)
      return rejectPublication(
        'TICK_NOT_ADVANCING',
        `The activation needs a common tick after ${current}, published no later than it`,
      );

    const duplicate = history.find((entry) => entry.idempotencyKey === idempotencyKey);
    if (duplicate !== undefined) {
      const identical =
        duplicate.profileId === profileId &&
        duplicate.versionId === versionId &&
        duplicate.engineVersion === engineVersion &&
        duplicate.activateAtTick === activateAtTick;
      if (!identical)
        return rejectPublication(
          'STALE_VERSION',
          `Idempotency key ${idempotencyKey} is already bound to another activation target`,
        );
      return acceptPublication(duplicate, true);
    }

    if (history.some((entry) => entry.status === 'PENDING'))
      return rejectPublication(
        'ACTIVATION_PENDING',
        'Another activation is already scheduled for the common tick',
      );
    if (source.activeProfile().versionId === versionId)
      return rejectPublication(
        'STALE_VERSION',
        `Version ${versionId} is already the active fleet version`,
      );

    sequence += 1;
    const record: CommandRecord = {
      commandId: `activation-${String(sequence).padStart(4, '0')}`,
      profileId,
      versionId,
      engineVersion,
      publishedAtTick,
      activateAtTick,
      publishedAtIso,
      reason,
      origin,
      idempotencyKey,
      status: 'PENDING',
    };
    history.push(record);
    trimHistory();
    source.set({ profileId, versionId });
    return acceptPublication(record, false);
  }

  function reportOf(fields: {
    readonly status: ProfileActivationReportStatus;
    readonly tick: number;
    readonly command: CommandRecord | null;
    readonly activationTick: number | null;
    readonly appliedTick: number | null;
    readonly before: Readonly<Record<string, number>>;
    readonly after: Readonly<Record<string, number>>;
    readonly updated: readonly string[];
    readonly rolledBack: boolean;
    readonly restored: number;
    readonly exact: boolean;
    readonly rejection: ProfileActivationRejection | null;
    readonly failure: ProfileActivationFailure | null;
  }): ProfileActivationReport {
    return Object.freeze({
      version: PROFILE_ACTIVATION_VERSION,
      status: fields.status,
      tick: fields.tick,
      commandId: fields.command?.commandId ?? null,
      profileId: fields.command?.profileId ?? null,
      versionId: fields.command?.versionId ?? null,
      activationTick: fields.activationTick,
      appliedTick: fields.appliedTick,
      before: fields.before,
      after: fields.after,
      updated: Object.freeze([...fields.updated]),
      rolledBack: fields.rolledBack,
      restored: fields.restored,
      exact: fields.exact,
      rejection: fields.rejection,
      failure: fields.failure,
    });
  }

  function reportWithCounts(
    status: ProfileActivationReportStatus,
    atTick: number,
    command: CommandRecord | null,
    counts: Readonly<Record<string, number>>,
    extra: {
      readonly activationTick?: number | null;
      readonly appliedTick?: number | null;
      readonly updated?: readonly string[];
      readonly rolledBack?: boolean;
      readonly restored?: number;
      readonly exact?: boolean;
      readonly rejection?: ProfileActivationRejection | null;
      readonly failure?: ProfileActivationFailure | null;
    } = {},
  ): ProfileActivationReport {
    return reportOf({
      status,
      tick: atTick,
      command,
      activationTick: extra.activationTick ?? null,
      appliedTick: extra.appliedTick ?? null,
      before: counts,
      after: counts,
      updated: extra.updated ?? [],
      rolledBack: extra.rolledBack ?? false,
      restored: extra.restored ?? 0,
      exact: extra.exact ?? true,
      rejection: extra.rejection ?? null,
      failure: extra.failure ?? null,
    });
  }

  /**
   * Restores every already-written vehicle. The 057 registry never rewinds a tick, so the version
   * and control mode are restored first; only the monotonic tick may stay advanced, which is
   * reported through `exact` instead of being hidden.
   */
  function restore(applied: readonly PlanEntry[]): { restored: number; exact: boolean } {
    let restored = 0;
    let exact = true;
    for (let index = applied.length - 1; index >= 0; index -= 1) {
      const entry = applied[index];
      if (entry === undefined) continue;
      try {
        registry.updateState(entry.vehicleId, {
          tick: entry.previous.tick,
          controlMode: entry.previous.controlMode,
          appliedProfileVersion: entry.previous.appliedProfileVersion,
        });
        restored += 1;
        continue;
      } catch {
        exact = false;
      }
      const current = registry.state(entry.vehicleId);
      if (current === undefined) continue;
      try {
        registry.updateState(entry.vehicleId, {
          tick: current.tick,
          controlMode: entry.previous.controlMode,
          appliedProfileVersion: entry.previous.appliedProfileVersion,
        });
        restored += 1;
      } catch {
        // Leave the vehicle visible to the caller through the after-histogram; never hide it.
      }
    }
    return { restored, exact };
  }

  function applyAt(input: unknown): ProfileActivationReport {
    const atTick = readTick(input);
    if (disposed) {
      rejectedTotal += 1;
      return reportWithCounts('REJECTED', atTick, null, frozenCounts(new Map()), {
        rejection: Object.freeze({
          code: 'DISPOSED' as const,
          message: 'The profile activation was disposed',
        }),
      });
    }
    const current = currentTick();
    if (atTick < current) {
      rejectedTotal += 1;
      return reportWithCounts('REJECTED', atTick, null, frozenCounts(countVersions()), {
        rejection: Object.freeze({
          code: 'TICK_NOT_ADVANCING' as const,
          message: `Tick ${atTick} is behind the accepted tick ${current}`,
        }),
      });
    }
    observedTick = Math.max(observedTick, atTick);

    const command = history.find((entry) => entry.status === 'PENDING') ?? null;
    if (command === null)
      return reportWithCounts('IDLE', atTick, null, frozenCounts(countVersions()));
    if (atTick < command.activateAtTick)
      return reportWithCounts('PENDING', atTick, command, frozenCounts(countVersions()), {
        activationTick: command.activateAtTick,
      });

    const before = frozenCounts(countVersions());
    const plan: PlanEntry[] = [];
    for (const vehicle of registry.list()) {
      const state = registry.state(vehicle.vehicleId);
      if (state === undefined)
        return rejectCommand(command, atTick, before, {
          stage: 'PLAN',
          message: `Unknown fleet vehicle state: ${vehicle.vehicleId}`,
        });
      plan.push({ vehicleId: vehicle.vehicleId, previous: state });
    }
    let commonTick = command.activateAtTick;
    for (const entry of plan) commonTick = Math.max(commonTick, entry.previous.tick);
    if (!Number.isSafeInteger(commonTick))
      return rejectCommand(command, atTick, before, {
        stage: 'PLAN',
        message: 'The common activation tick is not a safe integer',
      });

    const applied: PlanEntry[] = [];
    try {
      for (const entry of plan) {
        registry.updateState(entry.vehicleId, {
          tick: commonTick,
          appliedProfileVersion: command.versionId,
        });
        applied.push(entry);
      }
      for (const entry of plan) {
        const state = registry.state(entry.vehicleId);
        requireContract(
          state !== undefined &&
            state.appliedProfileVersion === command.versionId &&
            state.tick === commonTick,
          'Fleet activation verification failed',
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const rolledBack = restore(applied);
      command.status = 'REJECTED';
      rejectedTotal += 1;
      rollbackTotal += 1;
      source.set(lastAppliedReference);
      return reportOf({
        status: 'REJECTED',
        tick: atTick,
        command,
        activationTick: command.activateAtTick,
        appliedTick: null,
        before,
        after: frozenCounts(countVersions()),
        updated: [],
        rolledBack: true,
        restored: rolledBack.restored,
        exact: rolledBack.exact,
        rejection: null,
        failure: Object.freeze({ stage: 'APPLY' as const, message }),
      });
    }

    command.status = 'APPLIED';
    appliedTotal += 1;
    vehiclesUpdated += applied.length;
    observedTick = Math.max(observedTick, commonTick);
    lastAppliedTick = commonTick;
    lastAppliedReference = source.set({
      profileId: command.profileId,
      versionId: command.versionId,
    });
    return reportOf({
      status: 'APPLIED',
      tick: atTick,
      command,
      activationTick: command.activateAtTick,
      appliedTick: commonTick,
      before,
      after: frozenCounts(countVersions()),
      updated: applied.map((entry) => entry.vehicleId),
      rolledBack: false,
      restored: 0,
      exact: true,
      rejection: null,
      failure: null,
    });
  }

  function rejectCommand(
    command: CommandRecord,
    atTick: number,
    before: Readonly<Record<string, number>>,
    failure: ProfileActivationFailure,
  ): ProfileActivationReport {
    command.status = 'REJECTED';
    rejectedTotal += 1;
    source.set(lastAppliedReference);
    return reportOf({
      status: 'REJECTED',
      tick: atTick,
      command,
      activationTick: command.activateAtTick,
      appliedTick: null,
      before,
      after: frozenCounts(countVersions()),
      updated: [],
      rolledBack: false,
      restored: 0,
      exact: true,
      rejection: null,
      failure,
    });
  }

  function activeProfile(): CityProfileReference {
    const reference = source.activeProfile();
    return Object.freeze({ profileId: reference.profileId, versionId: reference.versionId });
  }

  return Object.freeze({
    version: PROFILE_ACTIVATION_VERSION,
    profileId: configurationProfile.profileId,
    get engineVersion(): string | null {
      return expectedEngine;
    },
    get source(): CityProfileSource {
      return Object.freeze({ activeProfile });
    },
    publish,
    applyAt,
    advance: applyAt,
    pending(): ProfileActivationCommand | null {
      return commandOrNull(history.find((entry) => entry.status === 'PENDING') ?? null);
    },
    activeProfile,
    commands(): readonly ProfileActivationCommand[] {
      return Object.freeze(history.map(commandOf));
    },
    stats(): ProfileActivationStats {
      return Object.freeze({
        version: PROFILE_ACTIVATION_VERSION,
        disposed,
        profileId: configurationProfile.profileId,
        engineVersion: expectedEngine,
        commands: history.length,
        pending: history.filter((entry) => entry.status === 'PENDING').length,
        applied: appliedTotal,
        rejected: rejectedTotal,
        rollbacks: rollbackTotal,
        droppedCommands,
        vehiclesUpdated,
        lastAppliedTick,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      history.length = 0;
      sequence = 0;
      appliedTotal = 0;
      rejectedTotal = 0;
      rollbackTotal = 0;
      droppedCommands = 0;
      vehiclesUpdated = 0;
      lastAppliedTick = null;
      observedTick = 0;
    },
  });
}
