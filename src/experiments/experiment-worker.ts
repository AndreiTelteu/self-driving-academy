/**
 * 144 — experiment batches in a worker: admission, work slices, progress and cancellation.
 *
 * The batch engine does not own experiment mathematics: a batch is a list of *run cells* (one
 * scenario seed per slice) executed by an injected `ExperimentRunPort`. What this contract owns is
 * everything the PBI is responsible for:
 *
 * 1. **Budgets come from the manifest.** `readExperimentWorkerBudgets` reads the real
 *    `Docs/performance-budgets.json` (`221-synthetic-1` + `workerSchedulingProposal`) and refuses
 *    with `BUDGET_MISSING`/`BUDGET_INVALID` instead of inventing a number. Values the manifest does
 *    not calibrate are reported as `gaps`, never filled in.
 * 2. **Admission goes through 221.** Every slice is one job submitted to the shared
 *    `WorkerResourceGovernor` (see `experiment-worker-governor.ts`); the refusal of that coordinator
 *    is explicit (`CAPACITY_INSUFFICIENT`, `SESSION_SUSPENDED`) and counted, never retried in a
 *    private queue. A single world lease per batch enforces `residentExperimentWorlds`.
 * 3. **One slice at a time, with progress after each slice.** Progress is incremental and bounded by
 *    the manifest's `progressHzMaximum`; the engine never runs a synchronous loop on the caller's
 *    turn, so the UI loop keeps servicing messages between slices.
 * 4. **Cancellation is cooperative.** The port is asked to stop at its next slice step; results
 *    already produced are kept and labelled `PARTIAL` with a closed reason code, never presented as
 *    a complete batch.
 * 5. **Learning interrupts a batch.** `interruptForLearning` pauses the batch at a slice boundary and
 *    `resumeAfterLearning` continues it; the reason and the slice index are recorded. 221 preempting
 *    the slice job itself is reported as a separate fact (`preempted`, `cancellationMs`).
 * 6. **A simplified model is never presented as full physics.** A `SIMPLIFIED` declaration always
 *    reports `physicsFidelity: false`, and a request that claims fidelity for it is refused with
 *    `SIMPLIFIED_CLAIMS_FIDELITY`.
 */

export const EXPERIMENT_WORKER_VERSION = '144-experiment-worker-v1' as const;

/* ------------------------------------------------------------------ budgets */

/** Closed reasons why a budget read cannot be used; the missing path is always named. */
export const experimentWorkerBudgetCodes = ['BUDGET_MISSING', 'BUDGET_INVALID'] as const;
export type ExperimentWorkerBudgetCode = (typeof experimentWorkerBudgetCodes)[number];

/** A value the manifest does not calibrate. It is reported, never replaced with a default. */
export interface ExperimentWorkerBudgetGap {
  readonly path: string;
  readonly detail: string;
}

/** The finite numbers the batch engine may consume; every one of them comes from the manifest. */
export interface ExperimentWorkerBudgets {
  readonly version: string;
  readonly source: string;
  readonly residentWorlds: number;
  readonly executionJobs: number;
  readonly activeHeavyJobs: number;
  readonly ownedPendingPayloadBytes: number;
  readonly sliceMaximumMs: number;
  readonly progressIntervalMinimumMs: number;
  readonly progressHzMaximum: number;
  readonly cancellationTargetMaximumMs: number;
}

export interface ExperimentWorkerBudgetsReady {
  readonly status: 'READY';
  readonly version: typeof EXPERIMENT_WORKER_VERSION;
  readonly budgets: ExperimentWorkerBudgets;
  readonly gaps: readonly ExperimentWorkerBudgetGap[];
}

export interface ExperimentWorkerBudgetsRefused {
  readonly status: 'REFUSED';
  readonly version: typeof EXPERIMENT_WORKER_VERSION;
  readonly codes: readonly ExperimentWorkerBudgetCode[];
  readonly paths: readonly string[];
  readonly detail: string;
  readonly gaps: readonly ExperimentWorkerBudgetGap[];
}

export type ExperimentWorkerBudgetRead =
  ExperimentWorkerBudgetsReady | ExperimentWorkerBudgetsRefused;

interface Located {
  readonly found: boolean;
  readonly value: unknown;
  readonly path: string;
}

function locate(source: unknown, keys: readonly string[]): Located {
  let value: unknown = source;
  const walked: string[] = [];
  for (const key of keys) {
    walked.push(key);
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return { found: false, value: undefined, path: walked.join('.') };
    const record = value as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, key))
      return { found: false, value: undefined, path: walked.join('.') };
    value = record[key];
  }
  return { found: true, value, path: walked.join('.') };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

interface BudgetIssue {
  readonly code: ExperimentWorkerBudgetCode;
  readonly path: string;
  readonly detail: string;
}

/**
 * Reads the experiment batch budgets from the fixed performance manifest.
 *
 * Required numbers: the worker admission contract (`executionJobs`, `ownedPendingPayloadBytes`,
 * `activeHeavyJobs`, `residentExperimentWorlds`, `sliceMaximumMs`, `progressIntervalMinimumMs`,
 * `cancellationTargetMaximumMs`) and the scheduling proposal (`residentExperimentWorlds`,
 * `sliceMaximumMs`, `progressHzMaximum`, `cancellationResponseMaximumMs`). The two sources must
 * agree; a disagreement is `BUDGET_INVALID`, not a silent pick.
 */
export function readExperimentWorkerBudgets(manifest: unknown): ExperimentWorkerBudgetRead {
  const issues: BudgetIssue[] = [];
  const gaps: ExperimentWorkerBudgetGap[] = [];
  const workersAt = ['resourceAdmissionContracts', 'workers'];

  const readText = (keys: readonly string[], minimum: number): string | null => {
    const located = locate(manifest, keys);
    if (!located.found || typeof located.value !== 'string' || located.value.length < minimum) {
      issues.push({
        code: 'BUDGET_MISSING',
        path: located.path,
        detail: 'The manifest has no usable text for this budget field',
      });
      return null;
    }
    return located.value;
  };
  const readNumber = (keys: readonly string[], positive: boolean): number | null => {
    const located = locate(manifest, keys);
    if (
      !located.found ||
      typeof located.value !== 'number' ||
      !Number.isFinite(located.value) ||
      (positive && located.value <= 0)
    ) {
      issues.push({
        code: 'BUDGET_MISSING',
        path: located.path,
        detail: 'The manifest has no finite budget here; no default is invented',
      });
      return null;
    }
    return located.value;
  };

  const version = readText([...workersAt, 'version'], 1);
  const source = readText([...workersAt, 'source'], 1);
  const executionJobs = readNumber([...workersAt, 'executionJobs'], true);
  const ownedPendingPayloadBytes = readNumber([...workersAt, 'ownedPendingPayloadBytes'], true);
  const activeHeavyJobs = readNumber([...workersAt, 'activeHeavyJobs'], true);
  const residentWorlds = readNumber([...workersAt, 'residentExperimentWorlds'], true);
  const sliceMaximumMs = readNumber([...workersAt, 'sliceMaximumMs'], true);
  const progressIntervalMinimumMs = readNumber([...workersAt, 'progressIntervalMinimumMs'], true);
  const cancellationTargetMaximumMs = readNumber(
    [...workersAt, 'cancellationTargetMaximumMs'],
    true,
  );

  const schedulingWorlds = readNumber(
    ['workerSchedulingProposal', 'residentExperimentWorlds'],
    true,
  );
  const schedulingSliceMs = readNumber(['workerSchedulingProposal', 'sliceMaximumMs'], true);
  const progressHzMaximum = readNumber(['workerSchedulingProposal', 'progressHzMaximum'], true);
  const schedulingCancellationMs = readNumber(
    ['workerSchedulingProposal', 'cancellationResponseMaximumMs'],
    true,
  );

  const agree = (
    path: string,
    left: number | null,
    right: number | null,
    leftPath: string,
    rightPath: string,
  ): void => {
    if (left === null || right === null || left === right) return;
    issues.push({
      code: 'BUDGET_INVALID',
      path,
      detail: `${leftPath} is ${left}, but ${rightPath} is ${right}`,
    });
  };
  agree(
    'workerSchedulingProposal.residentExperimentWorlds',
    residentWorlds,
    schedulingWorlds,
    `${workersAt.join('.')}.residentExperimentWorlds`,
    'workerSchedulingProposal.residentExperimentWorlds',
  );
  agree(
    'workerSchedulingProposal.sliceMaximumMs',
    sliceMaximumMs,
    schedulingSliceMs,
    `${workersAt.join('.')}.sliceMaximumMs`,
    'workerSchedulingProposal.sliceMaximumMs',
  );
  agree(
    'workerSchedulingProposal.cancellationResponseMaximumMs',
    cancellationTargetMaximumMs,
    schedulingCancellationMs,
    `${workersAt.join('.')}.cancellationTargetMaximumMs`,
    'workerSchedulingProposal.cancellationResponseMaximumMs',
  );
  if (
    progressIntervalMinimumMs !== null &&
    progressHzMaximum !== null &&
    Math.round(1000 / progressIntervalMinimumMs) !== progressHzMaximum
  ) {
    issues.push({
      code: 'BUDGET_INVALID',
      path: 'workerSchedulingProposal.progressHzMaximum',
      detail: `A ${progressIntervalMinimumMs} ms progress interval is ${Math.round(1000 / progressIntervalMinimumMs)} Hz, not ${progressHzMaximum} Hz`,
    });
  }
  if (residentWorlds !== null && residentWorlds !== 1) {
    issues.push({
      code: 'BUDGET_INVALID',
      path: `${workersAt.join('.')}.residentExperimentWorlds`,
      detail: `This contract admits exactly one resident experiment world, not ${residentWorlds}`,
    });
  }
  if (activeHeavyJobs !== null && activeHeavyJobs !== 1) {
    issues.push({
      code: 'BUDGET_INVALID',
      path: `${workersAt.join('.')}.activeHeavyJobs`,
      detail: `This contract runs one heavy job at a time, not ${activeHeavyJobs}`,
    });
  }

  const queue = locate(manifest, ['workerSchedulingProposal', 'queueCountAndAge']);
  if (!queue.found || typeof queue.value !== 'number')
    gaps.push({
      path: queue.path,
      detail: `Queue count and age are not calibrated yet (${String(queue.value ?? 'absent')})`,
    });
  for (const key of ['totalHeapBytes', 'wasmBytes'] as const) {
    const located = locate(manifest, ['proposedCapacities', key]);
    if (!located.found || typeof located.value !== 'number')
      gaps.push({
        path: located.path,
        detail:
          'The manifest declares this capacity as unavailable; ownership counters are not a heap measurement',
      });
  }
  const suballocations = locate(manifest, ['capacityValidation', 'additionalSuballocations']);
  if (suballocations.found)
    gaps.push({
      path: suballocations.path,
      detail: 'Sub-allocations remain gate-owned proposals, not fixed numbers',
    });

  if (
    issues.length > 0 ||
    version === null ||
    source === null ||
    executionJobs === null ||
    ownedPendingPayloadBytes === null ||
    activeHeavyJobs === null ||
    residentWorlds === null ||
    sliceMaximumMs === null ||
    progressIntervalMinimumMs === null ||
    progressHzMaximum === null ||
    cancellationTargetMaximumMs === null
  ) {
    const codes: ExperimentWorkerBudgetCode[] = [
      ...new Set(issues.map((issue) => issue.code)),
    ].sort();
    if (codes.length === 0) codes.push('BUDGET_MISSING');
    return Object.freeze({
      status: 'REFUSED' as const,
      version: EXPERIMENT_WORKER_VERSION,
      codes: Object.freeze(codes),
      paths: Object.freeze([...new Set(issues.map((issue) => issue.path))].sort()),
      detail:
        issues.length === 0
          ? 'The manifest does not carry every required experiment worker budget'
          : issues.map((issue) => `${issue.code} at ${issue.path}: ${issue.detail}`).join('; '),
      gaps: Object.freeze(gaps),
    });
  }

  return Object.freeze({
    status: 'READY' as const,
    version: EXPERIMENT_WORKER_VERSION,
    budgets: Object.freeze({
      version,
      source,
      residentWorlds,
      executionJobs,
      activeHeavyJobs,
      ownedPendingPayloadBytes,
      sliceMaximumMs,
      progressIntervalMinimumMs,
      progressHzMaximum,
      cancellationTargetMaximumMs,
    }),
    gaps: Object.freeze(gaps),
  });
}

/* ------------------------------------------------- single resident world */

export interface ExperimentWorldGrant {
  readonly status: 'GRANTED';
  readonly worldKey: string;
  readonly owner: string;
}

export interface ExperimentWorldRefusal {
  readonly status: 'REFUSED';
  readonly code: 'WORLD_RESERVED';
  readonly worldKey: string;
  readonly owner: string;
  readonly holder: string;
  readonly detail: string;
}

export type ExperimentWorldLease = ExperimentWorldGrant | ExperimentWorldRefusal;

/**
 * The single-resident-world guard. The manifest allows one experiment world at a time, so the
 * second batch is refused with the holder's name instead of quietly sharing or cloning the world.
 */
export class ExperimentWorldRegistry {
  private holders = new Map<string, string>();
  private grants = 0;
  private refusalCount = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw new Error('The world registry needs a finite positive capacity');
    this.capacity = capacity;
  }

  get usage(): Readonly<{
    capacity: number;
    active: number;
    grants: number;
    refusals: Readonly<{ total: number; byCode: Readonly<Record<'WORLD_RESERVED', number>> }>;
  }> {
    return Object.freeze({
      capacity: this.capacity,
      active: this.holders.size,
      grants: this.grants,
      refusals: Object.freeze({
        total: this.refusalCount,
        byCode: Object.freeze({ WORLD_RESERVED: this.refusalCount }),
      }),
    });
  }

  get active(): readonly Readonly<{ worldKey: string; owner: string }>[] {
    return Object.freeze(
      [...this.holders.entries()].map(([worldKey, owner]) => Object.freeze({ worldKey, owner })),
    );
  }

  acquire(worldKey: string, owner: string): ExperimentWorldLease {
    const holder = this.holders.get(worldKey);
    if (holder === owner) return Object.freeze({ status: 'GRANTED', worldKey, owner });
    if (holder !== undefined) {
      this.refusalCount += 1;
      return Object.freeze({
        status: 'REFUSED',
        code: 'WORLD_RESERVED',
        worldKey,
        owner,
        holder,
        detail: `The experiment world ${worldKey} is already active for ${holder}`,
      });
    }
    if (this.holders.size >= this.capacity) {
      this.refusalCount += 1;
      const other = [...this.holders.entries()][0];
      return Object.freeze({
        status: 'REFUSED',
        code: 'WORLD_RESERVED',
        worldKey,
        owner,
        holder: other?.[1] ?? 'unknown',
        detail: `The manifest admits ${this.capacity} resident experiment world(s), and one is active`,
      });
    }
    this.holders.set(worldKey, owner);
    this.grants += 1;
    return Object.freeze({ status: 'GRANTED', worldKey, owner });
  }

  release(worldKey: string, owner: string): boolean {
    if (this.holders.get(worldKey) !== owner) return false;
    this.holders.delete(worldKey);
    return true;
  }
}

/* ---------------------------------------------------------------- the model */

export const experimentModelKinds = ['FULL', 'SIMPLIFIED'] as const;
export type ExperimentModelKind = (typeof experimentModelKinds)[number];

/**
 * What the caller declares about the physics behind the batch. `SIMPLIFIED` must name its
 * approximation and what is not validated; it may never declare `physicsFidelity: true`.
 */
export interface ExperimentModelDeclaration {
  readonly kind: ExperimentModelKind;
  readonly approximation?: string;
  readonly notValidated?: readonly string[];
  readonly physicsFidelity?: boolean;
}

export interface ExperimentModelLabel {
  readonly kind: ExperimentModelKind;
  /** Structural: only `FULL` may claim physics fidelity. */
  readonly physicsFidelity: boolean;
  readonly approximation: string | null;
  readonly notValidated: readonly string[];
  readonly disclaimer: string;
}

/* ------------------------------------------------------------- batch shape */

/** Closed refusal codes; every one names a real condition, never a fallback. */
export const experimentBatchRefusalCodes = [
  /** Another batch holds the single resident experiment world. */
  'WORLD_RESERVED',
  /** This batch id is already running or finished in this runner. */
  'BATCH_DUPLICATE',
  /** The batch has no run cell to execute. */
  'SLICE_PLAN_EMPTY',
  /** The batch plan is malformed (duplicate seed, fewer than two profiles, bad tick horizon). */
  'SLICE_PLAN_INVALID',
  /** A `SIMPLIFIED` model lacks its approximation or its unvalidated list. */
  'MODEL_NOT_DECLARED',
  /** A `FULL` model declared that it does not carry physics fidelity. */
  'MODEL_INCONSISTENT',
  /** A `SIMPLIFIED` model tried to claim full physics fidelity. */
  'SIMPLIFIED_CLAIMS_FIDELITY',
  /** 221 refused the slice: capacity is insufficient for an optional comparison. */
  'CAPACITY_INSUFFICIENT',
  /** 221 suspended the session because protected evidence could not be retained. */
  'SESSION_SUSPENDED',
  /** 221 rejected the slice as stale (target changed or job expired). */
  'STALE_ADMISSION',
  /** The worker reported an error for the slice. */
  'SLICE_FAILED',
] as const;
export type ExperimentBatchRefusalCode = (typeof experimentBatchRefusalCodes)[number];

/** Why results that exist are not a complete batch. */
export const experimentPartialReasons = [
  'CANCELLED_BY_REQUEST',
  'CANCELLED_WHILE_PAUSED',
  'SLICE_FAILED',
  'CAPACITY_INSUFFICIENT',
  'SESSION_SUSPENDED',
  'STALE_ADMISSION',
] as const;
export type ExperimentPartialReason = (typeof experimentPartialReasons)[number];

export const experimentBatchStates = [
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
  'REFUSED',
  'FAILED',
  'SUSPENDED',
] as const;
export type ExperimentBatchState = (typeof experimentBatchStates)[number];

export interface ExperimentBatchRequest {
  /** Stable batch identity; one batch is one world and one admitted slice sequence. */
  readonly batchId: string;
  readonly worldKey: string;
  readonly model: ExperimentModelDeclaration;
  readonly scenario: Readonly<{ scenarioId: string; ticks: number }>;
  /** The two profile versions the run cell compares; 140/142 require a real pair. */
  readonly profileVersionIds: readonly string[];
  /** One slice per base seed: worlds and seeds run sequentially, never concurrently. */
  readonly baseSeeds: readonly number[];
}

/** One run cell, i.e. one work slice of the batch. */
export interface ExperimentSlice {
  readonly sliceId: string;
  readonly runId: string;
  readonly batchId: string;
  readonly worldKey: string;
  readonly scenarioId: string;
  readonly ticks: number;
  readonly profileVersionIds: readonly string[];
  readonly baseSeed: number;
  readonly model: ExperimentModelKind;
  readonly sliceBudgetMs: number;
}

export interface ExperimentSliceControl {
  readonly batchId: string;
  readonly sliceId: string;
  /** True once the batch asked to stop; a cooperative port returns at its next step. */
  readonly cancelled: () => boolean;
  /** The per-slice budget the manifest allows. */
  readonly sliceBudgetMs: number;
}

export const experimentRowLabels = ['COMPLETE', 'PARTIAL'] as const;
export type ExperimentRowLabel = (typeof experimentRowLabels)[number];

/** One real run cell result, copied from the experiment contract that produced it. */
export interface ExperimentBatchRow {
  readonly sliceId: string;
  readonly runId: string;
  readonly baseSeed: number;
  readonly profileVersionIds: readonly string[];
  readonly decisions: number;
  readonly identical: number;
  readonly divergent: number;
  readonly causes: Readonly<Record<string, number>>;
  readonly parameters: readonly string[];
  readonly model: ExperimentModelKind;
  readonly label: ExperimentRowLabel;
  readonly partialReason: ExperimentPartialReason | null;
}

export interface ExperimentSliceExecution {
  readonly status: 'COMPLETED' | 'CANCELLED' | 'ERROR' | 'REFUSED' | 'SUSPENDED' | 'STALE';
  readonly code?: ExperimentBatchRefusalCode;
  readonly reason?: string;
  readonly rows?: readonly ExperimentBatchRow[];
  /** Longest synchronous step the port took for this slice, in milliseconds. */
  readonly stepMs?: number;
  /** True when the shared 221 coordinator preempted this slice for higher-priority work. */
  readonly preempted?: boolean;
  /** Milliseconds from the preemption request to the slice boundary, as 221 measured it. */
  readonly cancellationMs?: number | null;
}

/** Executes one bounded slice; the composition supplies the real 221 adapter. */
export interface ExperimentRunPort {
  run(slice: ExperimentSlice, control: ExperimentSliceControl): Promise<ExperimentSliceExecution>;
  /** Cooperative cancel of a slice in flight; it must stop at the next slice step. */
  cancel(sliceId: string): void;
}

export interface ExperimentBatchProgress {
  readonly batchId: string;
  readonly state: ExperimentBatchState;
  readonly sequence: number;
  readonly completedSlices: number;
  readonly totalSlices: number;
  /** `completedSlices / totalSlices`, rounded to six decimals; `0` before the first slice. */
  readonly fraction: number;
  readonly sliceIndex: number | null;
  readonly sliceId: string | null;
  readonly discardedSlices: number;
  /** The injected clock, so the transcript stays deterministic. */
  readonly at: number;
}

export interface ExperimentLearningInterrupt {
  readonly learningEpoch: number;
  readonly segmentId: string;
  /** The slice index the batch was on when the interrupt arrived. */
  readonly atSliceIndex: number;
  readonly atSliceId: string | null;
  /** True when the interrupt landed while a slice was still executing. */
  readonly inFlight: boolean;
  readonly pausedAt: number;
  readonly resumedAt: number | null;
  readonly resumeAtSliceIndex: number | null;
  readonly status: 'PAUSED' | 'RESUMED';
}

export interface ExperimentSliceRecord {
  readonly sliceId: string;
  readonly runId: string;
  readonly baseSeed: number;
  readonly attempts: number;
  readonly status: 'COMPLETED' | 'CANCELLED' | 'ERROR' | 'REFUSED' | 'SUSPENDED' | 'STALE';
  readonly stepMs: number | null;
  /** `stepMs > sliceBudgetMs`: reported with the real number, never silently accepted. */
  readonly overBudget: boolean;
  readonly preempted: boolean;
  readonly cancellationMs: number | null;
  readonly reason: string | null;
}

export interface ExperimentBatchResult {
  readonly version: typeof EXPERIMENT_WORKER_VERSION;
  readonly batchId: string;
  readonly worldKey: string;
  readonly status: 'COMPLETED' | 'CANCELLED' | 'REFUSED' | 'FAILED' | 'SUSPENDED';
  readonly codes: readonly ExperimentBatchRefusalCode[];
  readonly detail: string;
  readonly model: ExperimentModelLabel;
  readonly budgets: ExperimentWorkerBudgets;
  readonly progress: Readonly<{
    totalSlices: number;
    completedSlices: number;
    fraction: number;
    events: readonly ExperimentBatchProgress[];
  }>;
  readonly results: Readonly<{
    complete: readonly ExperimentBatchRow[];
    partial: readonly ExperimentBatchRow[];
    partialReason: ExperimentPartialReason | null;
  }>;
  readonly summary: Readonly<{
    runs: number;
    decisions: number;
    identical: number;
    divergent: number;
    causes: Readonly<Record<string, number>>;
    parameters: readonly string[];
  }>;
  readonly cancellation: Readonly<{
    requested: boolean;
    requestedAt: number | null;
    atSliceIndex: number | null;
    stoppedAtSliceIndex: number | null;
    responseMs: number | null;
    discardedSlices: number;
  }>;
  readonly learning: Readonly<{
    pauseCount: number;
    resumeCount: number;
    preemptedSlices: number;
    cancellationMsMax: number | null;
    interrupts: readonly ExperimentLearningInterrupt[];
  }>;
  readonly slices: readonly ExperimentSliceRecord[];
  readonly refusals: Readonly<{
    total: number;
    byCode: Readonly<Partial<Record<ExperimentBatchRefusalCode, number>>>;
  }>;
  readonly world: Readonly<{
    worldKey: string;
    active: boolean;
    grants: number;
    refusals: number;
  }>;
  readonly wall: Readonly<{ startedAt: number; endedAt: number; elapsedMs: number }>;
}

export class ExperimentWorkerError extends Error {
  readonly code: 'INVALID_REQUEST';
  readonly path: string;

  constructor(message: string, path: string) {
    super(message);
    this.name = 'ExperimentWorkerError';
    this.code = 'INVALID_REQUEST';
    this.path = path;
  }
}

/* ------------------------------------------------------------------ parsing */

function boundedText(value: unknown, path: string, maximum = 128): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value)
    throw new ExperimentWorkerError('Expected bounded text', path);
  if (value.length > maximum)
    throw new ExperimentWorkerError(`Expected at most ${maximum} characters`, path);
  return value;
}

function safeCount(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum)
    throw new ExperimentWorkerError(`Expected a safe integer >= ${minimum}`, path);
  return value;
}

function readModel(declaration: unknown, issues: BatchIssue[]): ExperimentModelLabel {
  if (!isPlainRecord(declaration)) {
    issues.push({
      code: 'MODEL_NOT_DECLARED',
      path: 'model',
      detail: 'A batch declares what physics it runs',
    });
    return Object.freeze({
      kind: 'SIMPLIFIED' as const,
      physicsFidelity: false,
      approximation: null,
      notValidated: Object.freeze(['the model declaration is missing']),
      disclaimer: 'SIMPLIFIED: the physics behind this batch is not declared',
    });
  }
  const kindValue = declaration.kind;
  if (!(experimentModelKinds as readonly string[]).includes(String(kindValue))) {
    issues.push({
      code: 'MODEL_NOT_DECLARED',
      path: 'model.kind',
      detail: `Expected one of ${experimentModelKinds.join(', ')}`,
    });
    return Object.freeze({
      kind: 'SIMPLIFIED' as const,
      physicsFidelity: false,
      approximation: null,
      notValidated: Object.freeze(['the model kind is not declared']),
      disclaimer: 'SIMPLIFIED: the physics behind this batch is not declared',
    });
  }
  const kind = kindValue as ExperimentModelKind;
  if (kind === 'FULL') {
    if (declaration.physicsFidelity === false)
      issues.push({
        code: 'MODEL_INCONSISTENT',
        path: 'model.physicsFidelity',
        detail: 'A FULL model cannot declare that it has no physics fidelity',
      });
    if (declaration.approximation !== undefined || declaration.notValidated !== undefined)
      issues.push({
        code: 'MODEL_INCONSISTENT',
        path: 'model',
        detail: 'A FULL model has no approximation or unvalidated list to declare',
      });
    return Object.freeze({
      kind: 'FULL' as const,
      physicsFidelity: true,
      approximation: null,
      notValidated: Object.freeze([]),
      disclaimer: 'FULL: the batch runs the validated physics',
    });
  }
  const approximation =
    typeof declaration.approximation === 'string' ? declaration.approximation.trim() : '';
  const notValidated = Array.isArray(declaration.notValidated)
    ? declaration.notValidated.filter(
        (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
      )
    : [];
  if (approximation.length === 0)
    issues.push({
      code: 'MODEL_NOT_DECLARED',
      path: 'model.approximation',
      detail: 'A SIMPLIFIED model must say what the approximation is',
    });
  if (notValidated.length === 0)
    issues.push({
      code: 'MODEL_NOT_DECLARED',
      path: 'model.notValidated',
      detail: 'A SIMPLIFIED model must say what is not validated',
    });
  if (declaration.physicsFidelity === true)
    issues.push({
      code: 'SIMPLIFIED_CLAIMS_FIDELITY',
      path: 'model.physicsFidelity',
      detail: 'An approximation cannot be reported as the same physics without validation',
    });
  return Object.freeze({
    kind: 'SIMPLIFIED' as const,
    physicsFidelity: false,
    approximation: approximation.length === 0 ? null : approximation,
    notValidated: Object.freeze(notValidated),
    disclaimer:
      approximation.length === 0
        ? 'SIMPLIFIED: the physics behind this batch is not declared'
        : `SIMPLIFIED: ${approximation}; not validated for ${notValidated.join(', ') || 'any behaviour'}`,
  });
}

interface BatchIssue {
  readonly code: ExperimentBatchRefusalCode;
  readonly path: string;
  readonly detail: string;
}

interface ParsedBatch {
  readonly request: ExperimentBatchRequest;
  readonly model: ExperimentModelLabel;
  readonly issues: readonly BatchIssue[];
}

function parseRequest(value: unknown): ParsedBatch {
  if (!isPlainRecord(value))
    throw new ExperimentWorkerError('Expected a batch request object', 'request');
  const batchId = boundedText(value.batchId, 'request.batchId');
  const worldKey = boundedText(value.worldKey, 'request.worldKey');
  const issues: BatchIssue[] = [];
  const model = readModel(value.model, issues);
  if (!isPlainRecord(value.scenario))
    throw new ExperimentWorkerError('Expected a scenario object', 'request.scenario');
  const scenarioId = boundedText(value.scenario.scenarioId, 'request.scenario.scenarioId');
  const ticks = safeCount(value.scenario.ticks, 'request.scenario.ticks', 1);
  if (!Array.isArray(value.profileVersionIds))
    throw new ExperimentWorkerError('Expected a profile version list', 'request.profileVersionIds');
  const profileVersionIds = value.profileVersionIds.map((entry, index) =>
    boundedText(entry, `request.profileVersionIds[${index}]`),
  );
  if (!Array.isArray(value.baseSeeds))
    throw new ExperimentWorkerError('Expected a base seed list', 'request.baseSeeds');
  const baseSeeds = value.baseSeeds.map((entry, index) =>
    safeCount(entry, `request.baseSeeds[${index}]`),
  );
  if (baseSeeds.length === 0)
    issues.push({
      code: 'SLICE_PLAN_EMPTY',
      path: 'request.baseSeeds',
      detail: 'A batch runs at least one seed',
    });
  if (new Set(baseSeeds).size !== baseSeeds.length)
    issues.push({
      code: 'SLICE_PLAN_INVALID',
      path: 'request.baseSeeds',
      detail: 'A batch cannot run the same seed twice',
    });
  if (profileVersionIds.length < 2)
    issues.push({
      code: 'SLICE_PLAN_INVALID',
      path: 'request.profileVersionIds',
      detail: 'A run cell compares at least two profile versions',
    });
  if (new Set(profileVersionIds).size !== profileVersionIds.length)
    issues.push({
      code: 'SLICE_PLAN_INVALID',
      path: 'request.profileVersionIds',
      detail: 'The compared profile versions must be distinct',
    });
  if (profileVersionIds.length > 2)
    issues.push({
      code: 'SLICE_PLAN_INVALID',
      path: 'request.profileVersionIds',
      detail: 'This contract runs one pairwise comparison per slice',
    });
  return Object.freeze({
    request: Object.freeze({
      batchId,
      worldKey,
      model: Object.freeze({
        kind: model.kind,
        approximation: model.approximation ?? undefined,
        notValidated: model.notValidated,
      }),
      scenario: Object.freeze({ scenarioId, ticks }),
      profileVersionIds: Object.freeze(profileVersionIds),
      baseSeeds: Object.freeze(baseSeeds),
    }),
    model,
    issues: Object.freeze(issues),
  });
}

/* ------------------------------------------------------------------ the batch */

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

interface Batch {
  readonly request: ExperimentBatchRequest;
  readonly model: ExperimentModelLabel;
  readonly slices: readonly ExperimentSlice[];
  readonly events: ExperimentBatchProgress[];
  readonly records: ExperimentSliceRecord[];
  readonly rows: ExperimentBatchRow[];
  readonly interrupts: ExperimentLearningInterrupt[];
  readonly refusals: Map<ExperimentBatchRefusalCode, number>;
  readonly startedAt: number;
  status: ExperimentBatchState;
  index: number;
  completedSlices: number;
  discardedSlices: number;
  attempts: Map<string, number>;
  rowsThisSlice: ExperimentBatchRow[];
  inFlight: ExperimentSlice | null;
  cancelRequested: boolean;
  cancelRequestedAt: number | null;
  cancelAtSlice: number | null;
  sliceFailed: boolean;
  failedCode: ExperimentBatchRefusalCode | null;
  failureDetail: string;
  partialReason: ExperimentPartialReason | null;
  pauseCount: number;
  resumeCount: number;
  preemptedSlices: number;
  cancellationMsMax: number | null;
  waiters: (() => void)[];
  sequence: number;
  settled: boolean;
  readonly resolve: (result: ExperimentBatchResult) => void;
}

export interface ExperimentBatchRunnerOptions {
  readonly port: ExperimentRunPort;
  readonly budgets: ExperimentWorkerBudgets;
  /** Shared single-world guard; the runner never creates a second one. */
  readonly worlds: ExperimentWorldRegistry;
  readonly now?: () => number;
  /** Incremental progress observer; exceptions cannot own the batch lifecycle. */
  readonly onProgress?: (progress: ExperimentBatchProgress) => void;
}

/**
 * Serial batch runner over the shared 221 admission.
 *
 * One batch at a time per world; every slice is dispatched as its own admitted job, progress is
 * emitted after each slice, cancellation stops the sequence at a slice boundary, and learning
 * pauses the sequence between slices. The caller's turn is never blocked: `start()` returns at once
 * and every slice is awaited.
 */
export class ExperimentBatchRunner {
  private readonly port: ExperimentRunPort;
  private readonly budgets: ExperimentWorkerBudgets;
  private readonly worlds: ExperimentWorldRegistry;
  private readonly now: () => number;
  private readonly onProgress: (progress: ExperimentBatchProgress) => void;
  private readonly batches = new Map<string, Batch>();
  private readonly refusalCounts = new Map<ExperimentBatchRefusalCode, number>();
  private disposed = false;

  constructor(options: ExperimentBatchRunnerOptions) {
    this.port = options.port;
    this.budgets = options.budgets;
    this.worlds = options.worlds;
    this.now = options.now ?? (() => performance.now());
    this.onProgress = options.onProgress ?? (() => {});
  }

  get usage(): Readonly<{
    version: typeof EXPERIMENT_WORKER_VERSION;
    batches: number;
    running: number;
    refusals: Readonly<{
      total: number;
      byCode: Readonly<Partial<Record<ExperimentBatchRefusalCode, number>>>;
    }>;
    worlds: ExperimentWorldRegistry['usage'];
  }> {
    const running = [...this.batches.values()].filter(
      (batch) => batch.status === 'RUNNING' || batch.status === 'PAUSED',
    ).length;
    return Object.freeze({
      version: EXPERIMENT_WORKER_VERSION,
      batches: this.batches.size,
      running,
      refusals: Object.freeze({
        total: [...this.refusalCounts.values()].reduce((total, count) => total + count, 0),
        byCode: Object.freeze(Object.fromEntries(this.refusalCounts)),
      }),
      worlds: this.worlds.usage,
    });
  }

  /** The live snapshot the UI reads; never blocks and never starts work. */
  state(batchId: string): ExperimentBatchProgress | null {
    const batch = this.batches.get(batchId);
    if (!batch) return null;
    return this.progressOf(batch, batch.inFlight?.sliceId ?? null);
  }

  /**
   * Starts a batch and resolves only when it stops. A duplicate batch id, a busy world or a
   * malformed plan resolves as a `REFUSED` result; only a non-object request throws.
   */
  start(value: unknown): Promise<ExperimentBatchResult> {
    const parsed = parseRequest(value);
    if (this.disposed)
      return Promise.resolve(
        this.refuse(parsed, [
          { code: 'CAPACITY_INSUFFICIENT', path: 'runner', detail: 'disposed' },
        ]),
      );
    if (this.batches.has(parsed.request.batchId)) {
      const existing = this.batches.get(parsed.request.batchId)!;
      if (existing.status === 'RUNNING' || existing.status === 'PAUSED')
        return Promise.resolve(
          this.refuse(parsed, [
            {
              code: 'BATCH_DUPLICATE',
              path: 'request.batchId',
              detail: `The batch ${parsed.request.batchId} is already running in this runner`,
            },
          ]),
        );
    }
    if (parsed.issues.length > 0) return Promise.resolve(this.refuse(parsed, [...parsed.issues]));
    const lease = this.worlds.acquire(parsed.request.worldKey, parsed.request.batchId);
    if (lease.status === 'REFUSED')
      return Promise.resolve(
        this.refuse(parsed, [
          { code: 'WORLD_RESERVED', path: 'request.worldKey', detail: lease.detail },
        ]),
      );

    const startedAt = this.now();
    const slices = Object.freeze(
      parsed.request.baseSeeds.map((baseSeed, index) =>
        Object.freeze({
          sliceId: `${parsed.request.batchId}#${index}`,
          runId: `${parsed.request.scenario.scenarioId}@${baseSeed}`,
          batchId: parsed.request.batchId,
          worldKey: parsed.request.worldKey,
          scenarioId: parsed.request.scenario.scenarioId,
          ticks: parsed.request.scenario.ticks,
          profileVersionIds: parsed.request.profileVersionIds,
          baseSeed,
          model: parsed.model.kind,
          sliceBudgetMs: this.budgets.sliceMaximumMs,
        }),
      ),
    );
    let resolve!: (result: ExperimentBatchResult) => void;
    const settled = new Promise<ExperimentBatchResult>((done) => {
      resolve = done;
    });
    const batch: Batch = {
      request: parsed.request,
      model: parsed.model,
      slices,
      events: [],
      records: [],
      rows: [],
      interrupts: [],
      refusals: new Map(),
      startedAt,
      status: 'RUNNING',
      index: 0,
      completedSlices: 0,
      discardedSlices: 0,
      attempts: new Map(),
      rowsThisSlice: [],
      inFlight: null,
      cancelRequested: false,
      cancelRequestedAt: null,
      cancelAtSlice: null,
      sliceFailed: false,
      failedCode: null,
      failureDetail: '',
      partialReason: null,
      pauseCount: 0,
      resumeCount: 0,
      preemptedSlices: 0,
      cancellationMsMax: null,
      waiters: [],
      sequence: 0,
      settled: false,
      resolve,
    };
    this.batches.set(parsed.request.batchId, batch);
    this.emit(batch, 0, null);
    void this.drive(batch);
    return settled;
  }

  /** Cooperative cancellation: the in-flight slice is asked to stop at its next step. */
  cancel(batchId: string, reason?: string): boolean {
    const batch = this.batches.get(batchId);
    if (!batch || batch.settled || batch.cancelRequested) return false;
    batch.cancelRequested = true;
    batch.cancelRequestedAt = this.now();
    if (batch.status === 'PAUSED') {
      batch.status = 'CANCELLED';
      batch.partialReason = 'CANCELLED_WHILE_PAUSED';
      batch.cancelAtSlice = batch.index;
      this.emit(batch, batch.index, batch.inFlight?.sliceId ?? null);
      this.wake(batch);
      return true;
    }
    batch.failureDetail = reason ?? 'The caller cancelled the batch';
    if (batch.inFlight) this.port.cancel(batch.inFlight.sliceId);
    return true;
  }

  /** Learning arrives: the batch holds at the next slice boundary until it is resumed. */
  interruptForLearning(
    batchId: string,
    event: Readonly<{ learningEpoch: number; segmentId: string }>,
  ): boolean {
    const batch = this.batches.get(batchId);
    if (!batch || batch.settled || batch.status !== 'RUNNING') return false;
    const at = this.now();
    batch.status = 'PAUSED';
    batch.pauseCount += 1;
    batch.interrupts.push(
      Object.freeze({
        learningEpoch: event.learningEpoch,
        segmentId: event.segmentId,
        atSliceIndex: batch.index,
        atSliceId: batch.inFlight?.sliceId ?? batch.slices[batch.index]?.sliceId ?? null,
        inFlight: batch.inFlight !== null,
        pausedAt: at,
        resumedAt: null,
        resumeAtSliceIndex: null,
        status: 'PAUSED' as const,
      }),
    );
    this.emit(batch, batch.index, batch.inFlight?.sliceId ?? null);
    return true;
  }

  /** Learning finished: the batch continues at the held slice boundary. */
  resumeAfterLearning(batchId: string, event: Readonly<{ learningEpoch: number }>): boolean {
    const batch = this.batches.get(batchId);
    if (!batch || batch.settled || batch.status !== 'PAUSED') return false;
    const at = this.now();
    const last = batch.interrupts[batch.interrupts.length - 1];
    if (last !== undefined && last.learningEpoch === event.learningEpoch) {
      batch.interrupts[batch.interrupts.length - 1] = Object.freeze({
        ...last,
        resumedAt: at,
        resumeAtSliceIndex: batch.index,
        status: 'RESUMED' as const,
      });
    }
    batch.status = 'RUNNING';
    batch.resumeCount += 1;
    this.emit(batch, batch.index, null);
    this.wake(batch);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const batch of this.batches.values()) {
      if (batch.settled) continue;
      batch.cancelRequested = true;
      batch.cancelRequestedAt = this.now();
      if (batch.status === 'PAUSED') batch.status = 'CANCELLED';
      batch.failureDetail = 'The runner was disposed';
      if (batch.inFlight) this.port.cancel(batch.inFlight.sliceId);
      this.wake(batch);
    }
  }

  private async drive(batch: Batch): Promise<void> {
    for (;;) {
      if (batch.status === 'PAUSED') {
        await this.waitForResume(batch);
        continue;
      }
      if (batch.status !== 'RUNNING') break;
      if (batch.cancelRequested) {
        batch.status = 'CANCELLED';
        batch.partialReason = batch.partialReason ?? 'CANCELLED_BY_REQUEST';
        batch.cancelAtSlice = batch.cancelAtSlice ?? batch.index;
        break;
      }
      if (batch.index >= batch.slices.length) {
        batch.status = 'COMPLETED';
        break;
      }
      const slice = batch.slices[batch.index];
      if (slice === undefined) {
        batch.status = 'FAILED';
        batch.failureDetail = 'The slice plan is misaligned';
        break;
      }
      batch.attempts.set(slice.sliceId, (batch.attempts.get(slice.sliceId) ?? 0) + 1);
      batch.inFlight = slice;
      let execution: ExperimentSliceExecution;
      try {
        execution = await this.port.run(slice, {
          batchId: batch.request.batchId,
          sliceId: slice.sliceId,
          cancelled: () => batch.cancelRequested || this.disposed,
          sliceBudgetMs: slice.sliceBudgetMs,
        });
      } catch (error) {
        execution = {
          status: 'ERROR',
          reason: error instanceof Error ? error.message : 'The slice port threw',
        };
      } finally {
        batch.inFlight = null;
      }
      const attempts = batch.attempts.get(slice.sliceId) ?? 1;
      const stepMs =
        typeof execution.stepMs === 'number' && Number.isFinite(execution.stepMs)
          ? round6(execution.stepMs)
          : null;
      batch.records.push(
        Object.freeze({
          sliceId: slice.sliceId,
          runId: slice.runId,
          baseSeed: slice.baseSeed,
          attempts,
          status: execution.status,
          stepMs,
          overBudget: stepMs !== null && stepMs > slice.sliceBudgetMs,
          preempted: execution.preempted === true,
          cancellationMs:
            typeof execution.cancellationMs === 'number' ? round6(execution.cancellationMs) : null,
          reason: execution.reason ?? null,
        }),
      );
      if (execution.preempted === true) batch.preemptedSlices += 1;
      if (typeof execution.cancellationMs === 'number')
        batch.cancellationMsMax = Math.max(
          batch.cancellationMsMax ?? 0,
          round6(execution.cancellationMs),
        );
      if (execution.status === 'COMPLETED') {
        batch.rowsThisSlice = [...(execution.rows ?? [])];
        batch.rows.push(...batch.rowsThisSlice);
        batch.rowsThisSlice = [];
        batch.index += 1;
        batch.completedSlices += 1;
        this.emit(batch, batch.index - 1, slice.sliceId);
        continue;
      }
      if (execution.status === 'CANCELLED') {
        batch.discardedSlices += 1;
        batch.status = 'CANCELLED';
        batch.partialReason = batch.partialReason ?? 'CANCELLED_BY_REQUEST';
        batch.cancelAtSlice = batch.index;
        break;
      }
      this.recordRefusal(batch, execution.code ?? this.codeFor(execution.status));
      if (execution.status === 'ERROR') {
        batch.status = 'FAILED';
        batch.sliceFailed = true;
        batch.failedCode = 'SLICE_FAILED';
        batch.failureDetail = execution.reason ?? 'The worker reported an error';
        batch.partialReason = 'SLICE_FAILED';
        break;
      }
      if (execution.status === 'REFUSED') {
        batch.status = 'REFUSED';
        batch.failedCode = execution.code ?? 'CAPACITY_INSUFFICIENT';
        batch.failureDetail = execution.reason ?? '221 refused the slice';
        batch.partialReason =
          batch.failedCode === 'CAPACITY_INSUFFICIENT'
            ? 'CAPACITY_INSUFFICIENT'
            : 'STALE_ADMISSION';
        break;
      }
      if (execution.status === 'SUSPENDED') {
        batch.status = 'SUSPENDED';
        batch.failedCode = 'SESSION_SUSPENDED';
        batch.failureDetail = execution.reason ?? '221 suspended the session';
        batch.partialReason = 'SESSION_SUSPENDED';
        break;
      }
      batch.status = 'REFUSED';
      batch.failedCode = 'STALE_ADMISSION';
      batch.failureDetail = execution.reason ?? '221 rejected the slice as stale';
      batch.partialReason = 'STALE_ADMISSION';
      break;
    }
    this.finish(batch);
  }

  private codeFor(status: ExperimentSliceExecution['status']): ExperimentBatchRefusalCode {
    switch (status) {
      case 'SUSPENDED':
        return 'SESSION_SUSPENDED';
      case 'REFUSED':
        return 'CAPACITY_INSUFFICIENT';
      case 'STALE':
        return 'STALE_ADMISSION';
      case 'ERROR':
        return 'SLICE_FAILED';
      default:
        return 'SLICE_FAILED';
    }
  }

  private recordRefusal(batch: Batch, code: ExperimentBatchRefusalCode): void {
    batch.refusals.set(code, (batch.refusals.get(code) ?? 0) + 1);
    this.refusalCounts.set(code, (this.refusalCounts.get(code) ?? 0) + 1);
  }

  private refuse(parsed: ParsedBatch, issues: readonly BatchIssue[]): ExperimentBatchResult {
    const codes = Object.freeze(
      [...new Set(issues.map((issue) => issue.code))].sort() as ExperimentBatchRefusalCode[],
    );
    const refusals = new Map<ExperimentBatchRefusalCode, number>();
    for (const code of codes) {
      refusals.set(code, 1);
      this.refusalCounts.set(code, (this.refusalCounts.get(code) ?? 0) + 1);
    }
    const now = this.now();
    return Object.freeze({
      version: EXPERIMENT_WORKER_VERSION,
      batchId: parsed.request.batchId,
      worldKey: parsed.request.worldKey,
      status: 'REFUSED' as const,
      codes,
      detail: issues.map((issue) => `${issue.code} at ${issue.path}: ${issue.detail}`).join('; '),
      model: parsed.model,
      budgets: this.budgets,
      progress: Object.freeze({
        totalSlices: parsed.request.baseSeeds.length,
        completedSlices: 0,
        fraction: 0,
        events: Object.freeze([]) as readonly ExperimentBatchProgress[],
      }),
      results: Object.freeze({
        complete: Object.freeze([]) as readonly ExperimentBatchRow[],
        partial: Object.freeze([]) as readonly ExperimentBatchRow[],
        partialReason: null,
      }),
      summary: Object.freeze({
        runs: 0,
        decisions: 0,
        identical: 0,
        divergent: 0,
        causes: Object.freeze({}),
        parameters: Object.freeze([]),
      }),
      cancellation: Object.freeze({
        requested: false,
        requestedAt: null,
        atSliceIndex: null,
        stoppedAtSliceIndex: null,
        responseMs: null,
        discardedSlices: 0,
      }),
      learning: Object.freeze({
        pauseCount: 0,
        resumeCount: 0,
        preemptedSlices: 0,
        cancellationMsMax: null,
        interrupts: Object.freeze([]) as readonly ExperimentLearningInterrupt[],
      }),
      slices: Object.freeze([]),
      refusals: Object.freeze({
        total: codes.length,
        byCode: Object.freeze(Object.fromEntries(refusals)),
      }),
      world: Object.freeze({
        worldKey: parsed.request.worldKey,
        active: false,
        grants: this.worlds.usage.grants,
        refusals: this.worlds.usage.refusals.total,
      }),
      wall: Object.freeze({ startedAt: now, endedAt: now, elapsedMs: 0 }),
    });
  }

  private finish(batch: Batch): void {
    if (batch.settled) return;
    batch.settled = true;
    const endedAt = this.now();
    const complete = batch.status === 'COMPLETED';
    const rows = complete
      ? batch.rows.map((row) =>
          Object.freeze({ ...row, label: 'COMPLETE' as const, partialReason: null }),
        )
      : batch.rows.map((row) =>
          Object.freeze({
            ...row,
            label: 'PARTIAL' as const,
            partialReason: batch.partialReason,
          }),
        );
    const summary = summarize(rows);
    const codes = Object.freeze([...(batch.failedCode === null ? [] : [batch.failedCode])]);
    this.worlds.release(batch.request.worldKey, batch.request.batchId);
    const result: ExperimentBatchResult = Object.freeze({
      version: EXPERIMENT_WORKER_VERSION,
      batchId: batch.request.batchId,
      worldKey: batch.request.worldKey,
      status: finalStatus(batch.status),
      codes,
      detail:
        batch.failureDetail ||
        (complete
          ? `The batch completed ${batch.completedSlices} slice(s)`
          : `The batch stopped after ${batch.completedSlices} of ${batch.slices.length} slice(s)`),
      model: batch.model,
      budgets: this.budgets,
      progress: Object.freeze({
        totalSlices: batch.slices.length,
        completedSlices: batch.completedSlices,
        fraction: share(batch.completedSlices, batch.slices.length),
        events: Object.freeze([...batch.events]),
      }),
      results: Object.freeze({
        complete: Object.freeze(complete ? rows : []),
        partial: Object.freeze(complete ? [] : rows),
        partialReason: complete ? null : batch.partialReason,
      }),
      summary,
      cancellation: Object.freeze({
        requested: batch.cancelRequested,
        requestedAt: batch.cancelRequestedAt,
        atSliceIndex: batch.cancelAtSlice,
        stoppedAtSliceIndex: batch.cancelAtSlice,
        responseMs:
          batch.cancelRequestedAt === null || batch.cancelAtSlice === null
            ? null
            : round6(endedAt - batch.cancelRequestedAt),
        discardedSlices: batch.discardedSlices,
      }),
      learning: Object.freeze({
        pauseCount: batch.pauseCount,
        resumeCount: batch.resumeCount,
        preemptedSlices: batch.preemptedSlices,
        cancellationMsMax: batch.cancellationMsMax,
        interrupts: Object.freeze([...batch.interrupts]),
      }),
      slices: Object.freeze([...batch.records]),
      refusals: Object.freeze({
        total: [...batch.refusals.values()].reduce((total, count) => total + count, 0),
        byCode: Object.freeze(Object.fromEntries(batch.refusals)),
      }),
      world: Object.freeze({
        worldKey: batch.request.worldKey,
        active: this.worlds.active.some((entry) => entry.worldKey === batch.request.worldKey),
        grants: this.worlds.usage.grants,
        refusals: this.worlds.usage.refusals.total,
      }),
      wall: Object.freeze({
        startedAt: batch.startedAt,
        endedAt,
        elapsedMs: round6(endedAt - batch.startedAt),
      }),
    });
    batch.resolve(result);
  }

  private progressOf(batch: Batch, sliceId: string | null): ExperimentBatchProgress {
    return Object.freeze({
      batchId: batch.request.batchId,
      state: batch.status,
      sequence: batch.sequence,
      completedSlices: batch.completedSlices,
      totalSlices: batch.slices.length,
      fraction: share(batch.completedSlices, batch.slices.length),
      sliceIndex: batch.index < batch.slices.length ? batch.index : null,
      sliceId,
      discardedSlices: batch.discardedSlices,
      at: this.now(),
    });
  }

  private emit(batch: Batch, sliceIndex: number, sliceId: string | null): void {
    batch.sequence += 1;
    const progress = Object.freeze({
      batchId: batch.request.batchId,
      state: batch.status,
      sequence: batch.sequence,
      completedSlices: batch.completedSlices,
      totalSlices: batch.slices.length,
      fraction: share(batch.completedSlices, batch.slices.length),
      sliceIndex: sliceIndex < batch.slices.length ? sliceIndex : null,
      sliceId,
      discardedSlices: batch.discardedSlices,
      at: this.now(),
    });
    batch.events.push(progress);
    try {
      this.onProgress(progress);
    } catch {
      /* The observer cannot own the batch lifecycle. */
    }
  }

  private waitForResume(batch: Batch): Promise<void> {
    if (batch.status !== 'PAUSED' || batch.settled) return Promise.resolve();
    return new Promise<void>((resolve) => {
      batch.waiters.push(resolve);
    });
  }

  private wake(batch: Batch): void {
    const waiters = batch.waiters;
    batch.waiters = [];
    for (const resolve of waiters) resolve();
  }
}

function share(count: number, total: number): number {
  return total === 0 ? 0 : round6(count / total);
}

/** A batch that stopped before its last slice is never reported as completed. */
function finalStatus(state: ExperimentBatchState): ExperimentBatchResult['status'] {
  if (state === 'COMPLETED' || state === 'REFUSED' || state === 'FAILED' || state === 'SUSPENDED')
    return state;
  return 'CANCELLED';
}

function summarize(rows: readonly ExperimentBatchRow[]): ExperimentBatchResult['summary'] {
  const causes: Record<string, number> = {};
  const parameters = new Set<string>();
  let decisions = 0;
  let identical = 0;
  let divergent = 0;
  for (const row of rows) {
    decisions += row.decisions;
    identical += row.identical;
    divergent += row.divergent;
    for (const [cause, count] of Object.entries(row.causes))
      causes[cause] = (causes[cause] ?? 0) + count;
    for (const parameter of row.parameters) parameters.add(parameter);
  }
  return Object.freeze({
    runs: rows.length,
    decisions,
    identical,
    divergent,
    causes: Object.freeze(causes),
    parameters: Object.freeze([...parameters].sort()),
  });
}

/**
 * The label a report must print for a batch: a `SIMPLIFIED` batch is never reportable as full
 * physics, whatever the caller asked for.
 */
export function experimentReportLabel(result: ExperimentBatchResult): Readonly<{
  label: ExperimentRowLabel;
  model: ExperimentModelKind;
  physicsFidelity: boolean;
  text: string;
}> {
  const label: ExperimentRowLabel = result.results.partial.length > 0 ? 'PARTIAL' : 'COMPLETE';
  return Object.freeze({
    label,
    model: result.model.kind,
    physicsFidelity: result.model.physicsFidelity,
    text:
      result.model.kind === 'SIMPLIFIED'
        ? `${label} · SIMPLIFIED · ${result.model.disclaimer}`
        : `${label} · FULL physics`,
  });
}
