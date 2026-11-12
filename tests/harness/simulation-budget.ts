import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { cpus, platform, release, totalmem } from 'node:os';
import { createRoadContext } from '../../src/autonomy';
import { createSignalController } from '../../src/world';
import { createEventBus } from '../../src/simulation';
import { getParameterDefinition } from '../../src/profiles';
import type { ParameterKey } from '../../src/profiles';
import {
  LEARNING_ESTIMATE_VERSION,
  blendProfileValue,
  decodeLearningEstimateRequest,
  decodeLearningEstimateResult,
  encodeLearningEstimateRequest,
  encodeLearningEstimateResult,
} from '../../src/learning';
import type { LearningEstimateRequest } from '../../src/learning';
import { parsePacket, sendPacket } from '../../src/workers';
import type { Packet, Transport } from '../../src/workers';
import { control } from '../../src/workers/protocol';
import { roadContextFixture } from '../autonomy/road-context-reference';
import { summarize, percentile, round } from './hardware-budget';
import type { StatisticSummary, Verdict } from './hardware-budget';
import { learningTestJob } from './learning-estimator-fixture';

/**
 * PBI 158 deterministic measurement contract.
 *
 * Three components are measured separately on the same committed fixture: decisions (044 context at
 * the 10 Hz cadence), estimation (103 request → worker blend → result) and transfer (221 packets and
 * encoded payloads). Every component also produces a SHA-256 digest of all outputs; baseline and
 * optimized runs must agree, which is the semantic-equivalence evidence. Timings are wall-clock and
 * therefore re-measured, never invented; the digests are not.
 */
export const SIMULATION_BUDGET_VERSION = '158-simulation-budget-v1' as const;
export const SIMULATION_FIXTURE_VERSION = '158-simulation-v1' as const;
export const SIMULATION_BASELINE_COMMIT = '546fa29e' as const;

export const DECISION_WARMUP_TICKS = 120;
export const DECISION_MEASURED_TICKS = 360;
export const DECISION_REPEATS = 3;
export const DECISION_PASSES = 3;
export const DECISION_PUBLICATION_PERIOD_TICKS = 6;
/** The 219 scheduler distributes decisions deterministically over six tick slots. */
export const DECISION_SLOTS = 6;
export const ESTIMATE_WARMUP_ITERATIONS = 20;
export const ESTIMATE_MEASURED_ITERATIONS = 200;
export const ESTIMATE_REPEATS = 3;
export const ESTIMATE_EPISODES = 16;
export const ESTIMATE_LARGE_EPISODES = 4096;
export const TRANSFER_MESSAGES = 1000;
export const TRANSFER_REPEATS = 3;

const ESTIMATE_KEYS: readonly ParameterKey[] = Object.freeze([
  'speed_delta_urban',
  'desired_acceleration',
  'stop_full_probability',
] as const);

class Sha256Digest {
  private readonly hash = createHash('sha256');
  private entries = 0;
  add(value: unknown): void {
    this.hash.update(JSON.stringify(value) ?? 'null').update('\n');
    this.entries++;
  }
  get length(): number {
    return this.entries;
  }
  finish(): string {
    return this.hash.digest('hex');
  }
}

export interface DecisionsMeasurement {
  readonly dense: boolean;
  readonly vehicles: number;
  readonly obstacles: number;
  readonly zones: number;
  readonly ticks: number;
  readonly publications: number;
  readonly contextReads: number;
  /** One 044 publication (frame admission + index build) at the 10 Hz decision cadence. */
  readonly publicationMs: StatisticSummary;
  /** Contexts derived for the vehicles whose 219 slot owns this tick. */
  readonly slotDeriveMs: StatisticSummary;
  /** Full decision tick: publication when due plus the slot's decision contexts. */
  readonly tickMs: StatisticSummary;
  readonly peakCachedContexts: number;
  readonly digest: string;
  readonly digestEntries: number;
}

export interface EstimationMeasurement {
  readonly key: string;
  readonly episodesPerEstimate: number;
  readonly estimates: number;
  /** Synchronous main-thread work for one estimate (request validation + encoding). */
  readonly mainThreadSubmitMs: StatisticSummary;
  /** Worker-side slice: request decode, real 101 blend and result encoding. */
  readonly workerStepMs: StatisticSummary;
  /** Main-thread result decode for one proposal. */
  readonly resultDecodeMs: StatisticSummary;
  readonly roundTripMs: StatisticSummary;
  readonly requestBytes: number;
  readonly resultBytes: number;
  readonly largeEpisodes: number;
  readonly largeRequestBytes: number;
  readonly largeMainThreadSubmitMs: StatisticSummary;
  /** Full-payload `ArrayBuffer.prototype.slice` copies performed by the estimation path. */
  readonly payloadSlices: number;
  readonly payloadCopiedBytes: number;
  readonly payloadSlicesPerEstimate: number;
  readonly payloadCopiedBytesPerEstimate: number;
  readonly digest: string;
  readonly digestEntries: number;
}

export interface TransferMeasurement {
  readonly messages: number;
  readonly sendMs: StatisticSummary;
  readonly receiveMs: StatisticSummary;
  readonly controlMs: StatisticSummary;
  readonly perMessageMs: StatisticSummary;
  readonly deliveredPayloadBytes: number;
  readonly transferredPayloadBytes: number;
  readonly controlPayloadBytes: number;
  /** Two control packets share one zero-length buffer instead of allocating one each. */
  readonly controlSharesEmptyBuffer: boolean;
  readonly digest: string;
  readonly digestEntries: number;
}

export interface SimulationBudgetMeasurement {
  readonly version: typeof SIMULATION_BUDGET_VERSION;
  readonly fixtureVersion: typeof SIMULATION_FIXTURE_VERSION;
  readonly capturedAt: string;
  readonly commit: string;
  readonly runtime: string;
  readonly hardware: Readonly<{
    cpu: string;
    logicalCpus: number;
    ramBytes: number;
    os: string;
  }>;
  readonly protocol: Readonly<{
    decisionWarmupTicks: number;
    decisionMeasuredTicks: number;
    decisionRepeats: number;
    decisionPublicationPeriodTicks: number;
    decisionSlots: number;
    estimateWarmupIterations: number;
    estimateMeasuredIterations: number;
    estimateRepeats: number;
    transferMessages: number;
    transferRepeats: number;
    passes: number;
    statistic: 'median-of-repetition-percentiles';
    backend: string;
  }>;
  readonly workload: Readonly<{
    vehicles: number;
    obstacles: number;
    zones: number;
    decisionsPerTick: number;
    episodesPerEstimate: number;
    estimates: number;
    messages: number;
  }>;
  readonly decisions: DecisionsMeasurement;
  readonly estimation: EstimationMeasurement;
  readonly transfer: TransferMeasurement;
  readonly digests: Readonly<{
    decisions: string;
    estimation: string;
    transfer: string;
  }>;
}

export interface MeasureSimulationBudgetOptions {
  readonly commit?: string;
  readonly capturedAt?: string;
  readonly decisionWarmupTicks?: number;
  readonly decisionMeasuredTicks?: number;
  readonly decisionRepeats?: number;
  readonly passes?: number;
  readonly estimateWarmupIterations?: number;
  readonly estimateMeasuredIterations?: number;
  readonly estimateRepeats?: number;
  readonly transferMessages?: number;
  readonly transferRepeats?: number;
}

function hardware(): SimulationBudgetMeasurement['hardware'] {
  return Object.freeze({
    cpu: (cpus()[0]?.model ?? 'unknown').trim().replace(/\s+/g, ' '),
    logicalCpus: cpus().length,
    ramBytes: totalmem(),
    os: `${platform()} ${release()}`,
  });
}

/**
 * Protocol of 155/156/220: every repetition keeps its own distribution and the reported value is
 * the median of the per-repetition statistic. A single loaded sample cannot move the gate number.
 */
function medianSummary(summaries: readonly StatisticSummary[]): StatisticSummary {
  if (summaries.length < 1) throw new RangeError('A median summary needs at least one repetition');
  const median = (key: 'p50' | 'p95' | 'p99' | 'min' | 'max' | 'mean') =>
    round(
      percentile(
        summaries.map((entry) => entry[key]),
        0.5,
      ),
      4,
    );
  return Object.freeze({
    count: summaries.reduce((total, entry) => total + entry.count, 0),
    p50: median('p50'),
    p95: median('p95'),
    p99: median('p99'),
    min: median('min'),
    max: median('max'),
    mean: median('mean'),
  });
}

/** Counts the full-payload buffer copies the measured path performs, without changing its code. */
function countSlices(run: () => void): { slices: number; bytes: number } {
  const descriptor = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'slice')!;
  const original = descriptor.value as (
    this: ArrayBuffer,
    start?: number,
    end?: number,
  ) => ArrayBuffer;
  let slices = 0;
  let bytes = 0;
  Object.defineProperty(ArrayBuffer.prototype, 'slice', {
    ...descriptor,
    value(this: ArrayBuffer, start?: number, end?: number): ArrayBuffer {
      slices++;
      const copy = original.call(this, start, end);
      bytes += copy.byteLength;
      return copy;
    },
  });
  try {
    run();
  } finally {
    Object.defineProperty(ArrayBuffer.prototype, 'slice', descriptor);
  }
  return { slices, bytes };
}

/** 044 decision cost on the committed 110/96/256 fixture, shaped by the real 219 cadence. */
export function measureDecisionCost(
  options: Pick<
    MeasureSimulationBudgetOptions,
    'decisionWarmupTicks' | 'decisionMeasuredTicks' | 'decisionRepeats'
  > = {},
): DecisionsMeasurement {
  const warmupTicks = options.decisionWarmupTicks ?? DECISION_WARMUP_TICKS;
  const measuredTicks = options.decisionMeasuredTicks ?? DECISION_MEASURED_TICKS;
  const repeats = options.decisionRepeats ?? DECISION_REPEATS;
  const publicationSamples: StatisticSummary[] = [];
  const slotSamples: StatisticSummary[] = [];
  const tickSamples: StatisticSummary[] = [];
  const digest = new Sha256Digest();
  let contextReads = 0;
  let publications = 0;
  let peakCachedContexts = 0;
  let vehicles = 0;
  let obstacles = 0;
  let zones = 0;
  for (let repeat = 0; repeat < repeats; repeat++) {
    const { map, policy, frame } = roadContextFixture(true);
    vehicles = frame.vehicles.length;
    obstacles = frame.obstacles.length;
    zones = frame.zones.length;
    const context = {
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: frame.sessionId,
      worldEpoch: frame.worldEpoch,
    };
    const bus = createEventBus(context);
    const signals = createSignalController(map, { context, eventBus: bus });
    const engine = createRoadContext(map, {
      priorityPolicy: policy,
      decisionPeriodTicks: DECISION_PUBLICATION_PERIOD_TICKS,
      queryRadiusM: 60,
    });
    try {
      const repeatPublication: number[] = [];
      const repeatSlot: number[] = [];
      const repeatTick: number[] = [];
      for (let tick = 0; tick < warmupTicks + measuredTicks; tick++) {
        if (tick > 0) signals.step(tick);
        const publish = tick % DECISION_PUBLICATION_PERIOD_TICKS === 0;
        let publicationMs = 0;
        if (publish) {
          frame.tick = tick;
          frame.signals = map.intersections[0].movements.map((movement) =>
            signals.getMovementSignal('junction', movement.id)!,
          );
          const actor = frame.vehicles[(tick / DECISION_PUBLICATION_PERIOD_TICKS) % vehicles];
          actor.positionM = {
            ...actor.positionM,
            x: actor.positionM.x + (tick % 12 === 0 ? 0.1 : -0.1),
          };
          if (tick % 30 === 0) actor.incarnation++;
          const publicationStart = performance.now();
          engine.updateFrame(frame);
          publicationMs = performance.now() - publicationStart;
        }
        const slotStart = performance.now();
        for (let index = tick % DECISION_SLOTS; index < vehicles; index += DECISION_SLOTS) {
          const value = engine.getContext(frame.vehicles[index].id, { force: true })!;
          digest.add(value);
          contextReads++;
        }
        const slotMs = performance.now() - slotStart;
        peakCachedContexts = Math.max(peakCachedContexts, engine.getStats().cachedContexts);
        if (publish) publications++;
        if (tick >= warmupTicks) {
          if (publish) repeatPublication.push(publicationMs);
          repeatSlot.push(slotMs);
          repeatTick.push(publicationMs + slotMs);
        }
      }
      publicationSamples.push(summarize(repeatPublication, 4));
      slotSamples.push(summarize(repeatSlot, 4));
      tickSamples.push(summarize(repeatTick, 4));
    } finally {
      engine.dispose();
      signals.dispose();
      bus.dispose();
    }
  }
  return Object.freeze({
    dense: true,
    vehicles,
    obstacles,
    zones,
    ticks: warmupTicks + measuredTicks,
    publications,
    contextReads,
    publicationMs: medianSummary(publicationSamples),
    slotDeriveMs: medianSummary(slotSamples),
    tickMs: medianSummary(tickSamples),
    peakCachedContexts,
    digest: digest.finish(),
    digestEntries: digest.length,
  });
}

function requestFor(
  key: ParameterKey,
  segmentId: string,
  order: number,
  episodes: number,
): LearningEstimateRequest {
  const job = learningTestJob({ segmentId, order, key, episodeCount: episodes });
  return {
    version: LEARNING_ESTIMATE_VERSION,
    key: job.key,
    baseVersionId: job.baseVersionId,
    segmentId: job.segmentId,
    learningEpoch: job.learningEpoch,
    baseValue: job.baseValue,
    evidence: job.evidence,
    episodes: job.episodes,
    candidate: job.candidate,
  };
}

/** 103 estimation cost on the real encode/decode/blend path; the digest covers proposals and blends. */
export function measureEstimationCost(
  options: Pick<
    MeasureSimulationBudgetOptions,
    'estimateWarmupIterations' | 'estimateMeasuredIterations' | 'estimateRepeats'
  > = {},
): EstimationMeasurement {
  const warmup = options.estimateWarmupIterations ?? ESTIMATE_WARMUP_ITERATIONS;
  const measured = options.estimateMeasuredIterations ?? ESTIMATE_MEASURED_ITERATIONS;
  const repeats = options.estimateRepeats ?? ESTIMATE_REPEATS;
  const submitSamples: StatisticSummary[] = [];
  const workerSamples: StatisticSummary[] = [];
  const decodeSamples: StatisticSummary[] = [];
  const roundTripSamples: StatisticSummary[] = [];
  const digest = new Sha256Digest();
  let requestBytes = 0;
  let resultBytes = 0;
  let estimates = 0;
  const copyAccounting = countSlices(() => {
    for (let repeat = 0; repeat < repeats; repeat++) {
      const repeatSubmit: number[] = [];
      const repeatWorker: number[] = [];
      const repeatDecode: number[] = [];
      const repeatRoundTrip: number[] = [];
      for (let iteration = 0; iteration < warmup + measured; iteration++) {
        const key = ESTIMATE_KEYS[iteration % ESTIMATE_KEYS.length];
        const request = requestFor(
          key,
          `sim-158-${repeat}-${iteration}`,
          iteration + 1,
          ESTIMATE_EPISODES,
        );
        const submitStart = performance.now();
        const buffer = encodeLearningEstimateRequest(request);
        const submitMs = performance.now() - submitStart;
        const workerStart = performance.now();
        const decoded = decodeLearningEstimateRequest(buffer);
        const blended = blendProfileValue({
          key: decoded.key,
          oldValue: decoded.baseValue,
          evidence: decoded.evidence,
          episodes: decoded.episodes,
          candidate: decoded.candidate,
        });
        const definition = getParameterDefinition(decoded.key);
        const resultBuffer = encodeLearningEstimateResult({
          version: LEARNING_ESTIMATE_VERSION,
          key: decoded.key,
          baseVersionId: decoded.baseVersionId,
          segmentId: decoded.segmentId,
          learningEpoch: decoded.learningEpoch,
          estimate: blended.estimate,
          learningWeight: blended.learningWeight,
          resolution: blended.resolution,
          changed: blended.changed,
          min: definition.min,
          max: definition.max,
        });
        const workerMs = performance.now() - workerStart;
        const decodeStart = performance.now();
        const result = decodeLearningEstimateResult(resultBuffer);
        const decodeMs = performance.now() - decodeStart;
        digest.add(blended);
        digest.add(result);
        requestBytes = buffer.byteLength;
        resultBytes = resultBuffer.byteLength;
        estimates++;
        if (iteration >= warmup) {
          repeatSubmit.push(submitMs);
          repeatWorker.push(workerMs);
          repeatDecode.push(decodeMs);
          repeatRoundTrip.push(submitMs + workerMs + decodeMs);
        }
      }
      submitSamples.push(summarize(repeatSubmit, 5));
      workerSamples.push(summarize(repeatWorker, 5));
      decodeSamples.push(summarize(repeatDecode, 5));
      roundTripSamples.push(summarize(repeatRoundTrip, 5));
    }
  });
  const largeRequest = requestFor(ESTIMATE_KEYS[0], 'sim-158-large', 1, ESTIMATE_LARGE_EPISODES);
  const largeSamples: number[] = [];
  let largeRequestBytes = 0;
  for (let sample = 0; sample < 3; sample++) {
    const start = performance.now();
    const buffer = encodeLearningEstimateRequest(largeRequest);
    largeSamples.push(performance.now() - start);
    largeRequestBytes = buffer.byteLength;
  }
  const reportedCopySlices = copyAccounting.slices;
  return Object.freeze({
    key: ESTIMATE_KEYS.join(','),
    episodesPerEstimate: ESTIMATE_EPISODES,
    estimates,
    mainThreadSubmitMs: medianSummary(submitSamples),
    workerStepMs: medianSummary(workerSamples),
    resultDecodeMs: medianSummary(decodeSamples),
    roundTripMs: medianSummary(roundTripSamples),
    requestBytes,
    resultBytes,
    largeEpisodes: ESTIMATE_LARGE_EPISODES,
    largeRequestBytes,
    largeMainThreadSubmitMs: summarize(largeSamples, 4),
    payloadSlices: reportedCopySlices,
    payloadCopiedBytes: copyAccounting.bytes,
    payloadSlicesPerEstimate: Math.round((reportedCopySlices / estimates) * 1000) / 1000,
    payloadCopiedBytesPerEstimate: Math.round((copyAccounting.bytes / estimates) * 1000) / 1000,
    digest: digest.finish(),
    digestEntries: digest.length,
  });
}

function rawStart(index: number, payloadBytes: number): Record<string, unknown> {
  const buffer = new ArrayBuffer(payloadBytes);
  new Uint8Array(buffer).fill(index % 251);
  return {
    type: 'start',
    jobId: String(index + 1),
    segmentId: `sim-158-${index}`,
    baseVersionId: 'profile-v1',
    profileId: 'profile-1',
    learningEpoch: 1,
    sessionId: 'session-1',
    worldEpoch: 1,
    sequence: 0,
    payloadBytes,
    ownership: 'copy',
    priority: 'interactive',
    buffer,
  };
}

/** 221 packet path: main-thread send, receive parsing and control creation. */
export function measureTransferCost(
  options: Pick<MeasureSimulationBudgetOptions, 'transferMessages' | 'transferRepeats'> = {},
): TransferMeasurement {
  const messages = options.transferMessages ?? TRANSFER_MESSAGES;
  const repeats = options.transferRepeats ?? TRANSFER_REPEATS;
  const digest = new Sha256Digest();
  const sendSamples: StatisticSummary[] = [];
  const receiveSamples: StatisticSummary[] = [];
  const controlSamples: StatisticSummary[] = [];
  const perMessageSamples: StatisticSummary[] = [];
  let deliveredPayloadBytes = 0;
  let transferredPayloadBytes = 0;
  let controlPayloadBytes = 0;
  const delivered: Packet[] = [];
  const port: Transport = {
    send(packet, transfer) {
      delivered.push(packet);
      transferredPayloadBytes += transfer.reduce((total, buffer) => total + buffer.byteLength, 0);
    },
    listen() {
      return () => {};
    },
  };
  const firstControl = control(parsePacket(rawStart(0, 16)), 'progress', 1, 0.5);
  const secondControl = control(parsePacket(rawStart(1, 16)), 'progress', 1, 0.5);
  const controlSharesEmptyBuffer = firstControl.buffer === secondControl.buffer;
  for (let repeat = 0; repeat < repeats; repeat++) {
    const repeatSend: number[] = [];
    const repeatReceive: number[] = [];
    const repeatControl: number[] = [];
    const repeatMessage: number[] = [];
    for (let index = 0; index < messages; index++) {
      const start = performance.now();
      const parsed = parsePacket(rawStart(index, 256));
      sendPacket(port, parsed);
      const sent = performance.now() - start;
      const receiveStart = performance.now();
      const received = parsePacket(delivered[delivered.length - 1]);
      const receivedMs = performance.now() - receiveStart;
      const controlStart = performance.now();
      const progress = control(received, 'progress', index + 1, (index % 100) / 100);
      const cancelled = control(received, 'cancelled', index + 2);
      const controlMs = performance.now() - controlStart;
      controlPayloadBytes += cancelled.payloadBytes;
      deliveredPayloadBytes += received.payloadBytes;
      digest.add([
        received.jobId,
        received.segmentId,
        received.type,
        received.sequence,
        received.payloadBytes,
        received.ownership,
        received.priority,
        progress.type,
        progress.progress,
        cancelled.type,
        cancelled.sequence,
        cancelled.payloadBytes,
      ]);
      // Buffer contents stay outside the packet digest; a byte sum proves the same payload arrived.
      digest.add(
        new Uint8Array(received.buffer).reduce((total, byte) => (total + byte) % 65521, 0),
      );
      repeatSend.push(sent);
      repeatReceive.push(receivedMs);
      repeatControl.push(controlMs);
      repeatMessage.push(sent + receivedMs + controlMs);
    }
    sendSamples.push(summarize(repeatSend, 5));
    receiveSamples.push(summarize(repeatReceive, 5));
    controlSamples.push(summarize(repeatControl, 5));
    perMessageSamples.push(summarize(repeatMessage, 5));
  }
  return Object.freeze({
    messages: messages * repeats,
    sendMs: medianSummary(sendSamples),
    receiveMs: medianSummary(receiveSamples),
    controlMs: medianSummary(controlSamples),
    perMessageMs: medianSummary(perMessageSamples),
    deliveredPayloadBytes,
    transferredPayloadBytes,
    controlPayloadBytes,
    controlSharesEmptyBuffer,
    digest: digest.finish(),
    digestEntries: digest.length,
  });
}

/** Every pass must reproduce the same outputs; only then are its timings allowed to be pooled. */
function requireSameDigest(passes: readonly { digest: string }[], label: string): void {
  const expected = passes[0]?.digest;
  for (const pass of passes)
    if (pass.digest !== expected)
      throw new Error(`Pass outputs differ for ${label}: ${expected} ≠ ${pass.digest}`);
}

function combineDecisions(runs: readonly DecisionsMeasurement[]): DecisionsMeasurement {
  if (runs.length < 1) throw new RangeError('At least one decision pass is required');
  requireSameDigest(runs, 'decisions');
  const first = runs[0];
  return Object.freeze({
    ...first,
    ticks: runs.reduce((total, run) => total + run.ticks, 0),
    publications: runs.reduce((total, run) => total + run.publications, 0),
    contextReads: runs.reduce((total, run) => total + run.contextReads, 0),
    publicationMs: medianSummary(runs.map((run) => run.publicationMs)),
    slotDeriveMs: medianSummary(runs.map((run) => run.slotDeriveMs)),
    tickMs: medianSummary(runs.map((run) => run.tickMs)),
    peakCachedContexts: Math.max(...runs.map((run) => run.peakCachedContexts)),
  });
}

function combineEstimation(runs: readonly EstimationMeasurement[]): EstimationMeasurement {
  if (runs.length < 1) throw new RangeError('At least one estimation pass is required');
  requireSameDigest(runs, 'estimation');
  const first = runs[0];
  const estimates = runs.reduce((total, run) => total + run.estimates, 0);
  const slices = runs.reduce((total, run) => total + run.payloadSlices, 0);
  const copiedBytes = runs.reduce((total, run) => total + run.payloadCopiedBytes, 0);
  return Object.freeze({
    ...first,
    estimates,
    mainThreadSubmitMs: medianSummary(runs.map((run) => run.mainThreadSubmitMs)),
    workerStepMs: medianSummary(runs.map((run) => run.workerStepMs)),
    resultDecodeMs: medianSummary(runs.map((run) => run.resultDecodeMs)),
    roundTripMs: medianSummary(runs.map((run) => run.roundTripMs)),
    largeMainThreadSubmitMs: medianSummary(runs.map((run) => run.largeMainThreadSubmitMs)),
    payloadSlices: slices,
    payloadCopiedBytes: copiedBytes,
    payloadSlicesPerEstimate: Math.round((slices / estimates) * 1000) / 1000,
    payloadCopiedBytesPerEstimate: Math.round((copiedBytes / estimates) * 1000) / 1000,
  });
}

function combineTransfer(runs: readonly TransferMeasurement[]): TransferMeasurement {
  if (runs.length < 1) throw new RangeError('At least one transfer pass is required');
  requireSameDigest(runs, 'transfer');
  const first = runs[0];
  for (const run of runs)
    if (run.controlSharesEmptyBuffer !== first.controlSharesEmptyBuffer)
      throw new Error('Control buffer ownership changed between passes');
  return Object.freeze({
    ...first,
    messages: runs.reduce((total, run) => total + run.messages, 0),
    sendMs: medianSummary(runs.map((run) => run.sendMs)),
    receiveMs: medianSummary(runs.map((run) => run.receiveMs)),
    controlMs: medianSummary(runs.map((run) => run.controlMs)),
    perMessageMs: medianSummary(runs.map((run) => run.perMessageMs)),
    deliveredPayloadBytes: runs.reduce((total, run) => total + run.deliveredPayloadBytes, 0),
    transferredPayloadBytes: runs.reduce((total, run) => total + run.transferredPayloadBytes, 0),
    controlPayloadBytes: runs.reduce((total, run) => total + run.controlPayloadBytes, 0),
  });
}

export function measureSimulationBudget(
  options: MeasureSimulationBudgetOptions = {},
): SimulationBudgetMeasurement {
  const passes = Math.max(1, options.passes ?? 1);
  const decisions: DecisionsMeasurement[] = [];
  const estimations: EstimationMeasurement[] = [];
  const transfers: TransferMeasurement[] = [];
  for (let pass = 0; pass < passes; pass++) {
    decisions.push(measureDecisionCost(options));
    estimations.push(measureEstimationCost(options));
    transfers.push(measureTransferCost(options));
  }
  const decision = combineDecisions(decisions);
  const estimation = combineEstimation(estimations);
  const transfer = combineTransfer(transfers);
  return Object.freeze({
    version: SIMULATION_BUDGET_VERSION,
    fixtureVersion: SIMULATION_FIXTURE_VERSION,
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    commit: options.commit ?? '',
    runtime: process.version,
    hardware: hardware(),
    protocol: Object.freeze({
      decisionWarmupTicks: options.decisionWarmupTicks ?? DECISION_WARMUP_TICKS,
      decisionMeasuredTicks: options.decisionMeasuredTicks ?? DECISION_MEASURED_TICKS,
      decisionRepeats: options.decisionRepeats ?? DECISION_REPEATS,
      decisionPublicationPeriodTicks: DECISION_PUBLICATION_PERIOD_TICKS,
      decisionSlots: DECISION_SLOTS,
      estimateWarmupIterations: options.estimateWarmupIterations ?? ESTIMATE_WARMUP_ITERATIONS,
      estimateMeasuredIterations:
        options.estimateMeasuredIterations ?? ESTIMATE_MEASURED_ITERATIONS,
      estimateRepeats: options.estimateRepeats ?? ESTIMATE_REPEATS,
      transferMessages: options.transferMessages ?? TRANSFER_MESSAGES,
      transferRepeats: options.transferRepeats ?? TRANSFER_REPEATS,
      passes,
      statistic: 'median-of-repetition-percentiles',
      backend: 'Node CPU; no renderer, browser, GPU or frame pacing in this probe',
    }),
    workload: Object.freeze({
      vehicles: decision.vehicles,
      obstacles: decision.obstacles,
      zones: decision.zones,
      decisionsPerTick: Math.ceil(decision.vehicles / DECISION_SLOTS),
      episodesPerEstimate: estimation.episodesPerEstimate,
      estimates: estimation.estimates,
      messages: transfer.messages,
    }),
    decisions: decision,
    estimation,
    transfer,
    digests: Object.freeze({
      decisions: decision.digest,
      estimation: estimation.digest,
      transfer: transfer.digest,
    }),
  });
}

/** Budget facts the 203 manifest fixes outside `proposedBudgets`; read, never invented. */
export interface SimulationBudgetLimits {
  readonly sliceMaximumMs: number;
  readonly pendingWorkerPayloadBytes: number;
  readonly maxWorkerPayloadBytes: number;
}

export interface SimulationBudgetReportInput {
  readonly manifest: {
    readonly budgetVersion: string;
    readonly proposedBudgets: {
      readonly desktop: {
        readonly mainThreadP95Ms: number;
        readonly authoritativeTickP95Ms: number;
      };
      readonly laptop: {
        readonly mainThreadP95Ms: number;
        readonly authoritativeTickP95Ms: number;
      };
    };
  };
  readonly limits: SimulationBudgetLimits;
  readonly baseline: SimulationBudgetMeasurement;
  readonly after: SimulationBudgetMeasurement;
}

export type SimulationComponentId = 'decisions' | 'estimation' | 'transfer';

export interface SimulationBudgetRow {
  readonly id: string;
  readonly component: SimulationComponentId;
  readonly metric: string;
  readonly unit: 'ms' | 'bytes' | 'count' | 'ratio';
  readonly before: number | null;
  readonly after: number | null;
  readonly budget: Readonly<{
    value: number;
    direction: 'maximum' | 'minimum';
    source: string;
  }> | null;
  readonly verdict: Verdict;
  readonly note: string;
}

export interface SimulationEquivalence {
  readonly component: SimulationComponentId;
  readonly before: string;
  readonly after: string;
  readonly entries: number;
  readonly status: 'IDENTICAL' | 'DIFFERENT';
}

export interface SimulationBudgetReport {
  readonly version: typeof SIMULATION_BUDGET_VERSION;
  readonly budgetVersion: string;
  readonly fixtureVersion: string;
  readonly baseline: Readonly<{ commit: string; capturedAt: string }>;
  readonly after: Readonly<{ commit: string; capturedAt: string }>;
  readonly hardware: SimulationBudgetMeasurement['hardware'];
  readonly protocol: SimulationBudgetMeasurement['protocol'];
  readonly workload: SimulationBudgetMeasurement['workload'];
  readonly equivalence: readonly SimulationEquivalence[];
  readonly rows: readonly SimulationBudgetRow[];
  readonly verdicts: Readonly<Record<SimulationComponentId | 'equivalence' | 'overall', Verdict>>;
  readonly limitations: readonly string[];
}

const REGRESSION_RELATIVE = 0.1;
const REGRESSION_ABSOLUTE_MS = 1;

function maximumRow(input: {
  id: string;
  component: SimulationComponentId;
  metric: string;
  unit: SimulationBudgetRow['unit'];
  before: number | null;
  after: number | null;
  budget: SimulationBudgetRow['budget'];
  strictBelowBefore?: boolean;
  note?: string;
}): SimulationBudgetRow {
  const after = input.after;
  let verdict: Verdict;
  if (after === null) verdict = 'NOT_MEASURED';
  else if (input.budget === null) verdict = 'REPORTED';
  else if (input.strictBelowBefore && input.before !== null && !(after < input.before))
    verdict = 'FAIL';
  else
    verdict =
      input.budget.direction === 'maximum'
        ? after <= input.budget.value
          ? 'PASS'
          : 'FAIL'
        : after >= input.budget.value
          ? 'PASS'
          : 'FAIL';
  const before = input.before;
  const note =
    input.note ??
    (before === null || after === null
      ? 'fără valoare de comparație'
      : `înainte ${before} → după ${after} ${
          before === 0
            ? '(fără copii înainte)'
            : `(${Math.round(((after - before) / before) * 1000) / 10}%)`
        }`);
  return Object.freeze({
    id: input.id,
    component: input.component,
    metric: input.metric,
    unit: input.unit,
    before,
    after,
    budget: input.budget,
    verdict,
    note,
  });
}

function regression(before: number, after: number): boolean {
  return after - before > REGRESSION_ABSOLUTE_MS && after > before * (1 + REGRESSION_RELATIVE);
}

function rowVerdict(
  rows: readonly SimulationBudgetRow[],
  component: SimulationComponentId,
): Verdict {
  const own = rows.filter((row) => row.component === component);
  if (own.some((row) => row.verdict === 'FAIL')) return 'FAIL';
  if (own.some((row) => row.verdict === 'NOT_MEASURED')) return 'NOT_MEASURED';
  return 'PASS';
}

/** Deterministic derivation: identical inputs always produce an identical report. */
export function buildSimulationBudgetReport(
  input: SimulationBudgetReportInput,
): SimulationBudgetReport {
  const { manifest, limits, baseline, after } = input;
  if (baseline.fixtureVersion !== after.fixtureVersion)
    throw new Error('Baseline and optimized runs used different fixtures');
  const laptop = manifest.proposedBudgets.laptop;
  const source = (path: string) =>
    `Docs/performance-budgets.json (${manifest.budgetVersion}) ${path}`;
  const rows: SimulationBudgetRow[] = [];
  rows.push(
    maximumRow({
      id: 'decisions.tickP95Ms',
      component: 'decisions',
      metric: 'Tick de decizii (publicare 044 când e rândul + slotul 219) p95',
      unit: 'ms',
      before: baseline.decisions.tickMs.p95,
      after: after.decisions.tickMs.p95,
      budget: {
        value: laptop.authoritativeTickP95Ms,
        direction: 'maximum',
        source: source('proposedBudgets.laptop.authoritativeTickP95Ms'),
      },
      note: 'Costul componentei de decizii pe cadentța reală (fazare pe 6 tick-uri, publicare la 10 Hz), nu tick-ul autoritar complet; bugetul de tick acoperă întregul tick, deci limita este superioară.',
    }),
    maximumRow({
      id: 'decisions.publicationP95Ms',
      component: 'decisions',
      metric: 'Publicare context 044 (admitere cadru + index) p95',
      unit: 'ms',
      before: baseline.decisions.publicationMs.p95,
      after: after.decisions.publicationMs.p95,
      budget: null,
    }),
    maximumRow({
      id: 'decisions.slotDeriveP95Ms',
      component: 'decisions',
      metric: 'Derivare contexte pentru slotul de decizie (≈18 vehicule) p95',
      unit: 'ms',
      before: baseline.decisions.slotDeriveMs.p95,
      after: after.decisions.slotDeriveMs.p95,
      budget: null,
    }),
    maximumRow({
      id: 'estimation.mainThreadSubmitP95Ms',
      component: 'estimation',
      metric: 'Estimare: cost sincron pe firul principal per cerere p95',
      unit: 'ms',
      before: baseline.estimation.mainThreadSubmitMs.p95,
      after: after.estimation.mainThreadSubmitMs.p95,
      budget: {
        value: laptop.mainThreadP95Ms,
        direction: 'maximum',
        source: source('proposedBudgets.laptop.mainThreadP95Ms'),
      },
      note: 'Criteriul „estimarea nu blochează inputul”: costul sincron de admitere, comparat cu bugetul de main-thread.',
    }),
    maximumRow({
      id: 'estimation.workerStepP95Ms',
      component: 'estimation',
      metric: 'Estimare: felie worker (decode + blend 101 + encode) p95',
      unit: 'ms',
      before: baseline.estimation.workerStepMs.p95,
      after: after.estimation.workerStepMs.p95,
      budget: {
        value: limits.sliceMaximumMs,
        direction: 'maximum',
        source: source('resourceAdmissionContracts.workers.sliceMaximumMs'),
      },
    }),
    maximumRow({
      id: 'estimation.largeSubmitP95Ms',
      component: 'estimation',
      metric: `Estimare: admitere sincronă pentru ${after.estimation.largeEpisodes} episoade p95`,
      unit: 'ms',
      before: baseline.estimation.largeMainThreadSubmitMs.p95,
      after: after.estimation.largeMainThreadSubmitMs.p95,
      budget: {
        value: limits.sliceMaximumMs,
        direction: 'maximum',
        source: source('resourceAdmissionContracts.workers.sliceMaximumMs'),
      },
      note: 'Plafonul de admitere (4096 episoade) trebuie să rămână sub felia de 10 ms.',
    }),
    maximumRow({
      id: 'transfer.payloadCopiesPerEstimate',
      component: 'transfer',
      metric: 'Copii de payload per estimare (slice de ArrayBuffer)',
      unit: 'count',
      before: baseline.estimation.payloadSlicesPerEstimate,
      after: after.estimation.payloadSlicesPerEstimate,
      budget: {
        value: baseline.estimation.payloadSlicesPerEstimate,
        direction: 'maximum',
        source: 'PBI 158: zero copii de payload; se compară cu baseline-ul măsurat',
      },
      strictBelowBefore: true,
      note: 'Aceleași date livrate (digest identic), dar fără copierea suplimentară a bufferului de cerere/rezultat.',
    }),
    maximumRow({
      id: 'transfer.payloadCopiedBytesPerEstimate',
      component: 'transfer',
      metric: 'Bytes copiați per estimare',
      unit: 'bytes',
      before: baseline.estimation.payloadCopiedBytesPerEstimate,
      after: after.estimation.payloadCopiedBytesPerEstimate,
      budget: {
        value: baseline.estimation.payloadCopiedBytesPerEstimate,
        direction: 'maximum',
        source: 'PBI 158: zero bytes copiați; se compară cu baseline-ul măsurat',
      },
      strictBelowBefore: true,
    }),
    maximumRow({
      id: 'transfer.requestBytes',
      component: 'transfer',
      metric: 'Payload de cerere per estimare',
      unit: 'bytes',
      before: baseline.estimation.requestBytes,
      after: after.estimation.requestBytes,
      budget: {
        value: limits.pendingWorkerPayloadBytes,
        direction: 'maximum',
        source: source('proposedCapacities.pendingWorkerPayloadBytes'),
      },
    }),
    maximumRow({
      id: 'transfer.deliveredPayloadBytes',
      component: 'transfer',
      metric: 'Bytes de date livrate în proba de transfer',
      unit: 'bytes',
      before: baseline.transfer.deliveredPayloadBytes,
      after: after.transfer.deliveredPayloadBytes,
      budget: {
        value: limits.pendingWorkerPayloadBytes,
        direction: 'maximum',
        source: source('proposedCapacities.pendingWorkerPayloadBytes'),
      },
      note: 'Trebuie să rămână identic: optimizarea reduce copiile, nu datele.',
    }),
    maximumRow({
      id: 'transfer.perMessageP95Ms',
      component: 'transfer',
      metric: 'Cost per mesaj worker (send + receive + control) p95',
      unit: 'ms',
      before: baseline.transfer.perMessageMs.p95,
      after: after.transfer.perMessageMs.p95,
      budget: null,
    }),
  );
  const controlAllocationsBefore = baseline.transfer.controlSharesEmptyBuffer ? 0 : 1;
  const controlAllocationsAfter = after.transfer.controlSharesEmptyBuffer ? 0 : 1;
  rows.push(
    maximumRow({
      id: 'transfer.controlBufferAllocations',
      component: 'transfer',
      metric: 'Alocări de buffer per pachet de control',
      unit: 'count',
      before: controlAllocationsBefore,
      after: controlAllocationsAfter,
      budget: {
        value: 0,
        direction: 'maximum',
        source: 'PBI 158: buffer zero partajat, fără alocare per mesaj',
      },
    }),
  );
  const equivalence: SimulationEquivalence[] = (
    ['decisions', 'estimation', 'transfer'] as const
  ).map((component) => {
    const entries =
      component === 'decisions'
        ? baseline.decisions.digestEntries
        : component === 'estimation'
          ? baseline.estimation.digestEntries
          : baseline.transfer.digestEntries;
    return Object.freeze({
      component,
      before: baseline.digests[component],
      after: after.digests[component],
      entries,
      status: baseline.digests[component] === after.digests[component] ? 'IDENTICAL' : 'DIFFERENT',
    });
  });
  const verdicts = {
    decisions: rowVerdict(rows, 'decisions'),
    estimation: rowVerdict(rows, 'estimation'),
    transfer: rowVerdict(rows, 'transfer'),
    equivalence: equivalence.every((entry) => entry.status === 'IDENTICAL')
      ? ('PASS' as const)
      : ('FAIL' as const),
    overall: 'PASS' as Verdict,
  };
  const regressions = [
    ['decisions', baseline.decisions.tickMs.p95, after.decisions.tickMs.p95],
    ['estimation', baseline.estimation.workerStepMs.p95, after.estimation.workerStepMs.p95],
    ['transfer', baseline.transfer.perMessageMs.p95, after.transfer.perMessageMs.p95],
  ] as const;
  const regressed = regressions.filter(([, before, value]) => regression(before, value));
  verdicts.overall =
    verdicts.decisions === 'PASS' &&
    verdicts.estimation === 'PASS' &&
    verdicts.transfer === 'PASS' &&
    verdicts.equivalence === 'PASS' &&
    regressed.length === 0
      ? 'PASS'
      : 'FAIL';
  return Object.freeze({
    version: SIMULATION_BUDGET_VERSION,
    budgetVersion: manifest.budgetVersion,
    fixtureVersion: after.fixtureVersion,
    baseline: Object.freeze({ commit: baseline.commit, capturedAt: baseline.capturedAt }),
    after: Object.freeze({ commit: after.commit, capturedAt: after.capturedAt }),
    hardware: after.hardware,
    protocol: after.protocol,
    workload: after.workload,
    equivalence: Object.freeze(equivalence),
    rows: Object.freeze(rows),
    verdicts: Object.freeze(verdicts),
    limitations: Object.freeze([
      'Proba este headless (Node): nu măsoară randare, frame, GPU sau pacing real.',
      'Costurile sunt per componentă pe fixture-ul de 110 vehicule/96 obstacole/256 zone, nu tick-ul complet al jocului.',
      'Baseline-ul este o măsurătoare reală dinaintea optimizării; nu se reexecută pe codul optimizat și nu se reclasifică.',
      'Timpii de perete sunt re-măsurați la fiecare rulare; digests și bytes sunt deterministe.',
      'Fiecare metrică este mediana a 3 treceri independente × repetările din trecere, ca în protocolul 155/156/220; o singură rulare încărcată nu mută verdictul.',
      'Coloana `laptop` a manifestului este aplicată; coloana `desktop` nu se împrumută.',
      `Pragul relativ de regresie (${REGRESSION_RELATIVE * 100}% și ${REGRESSION_ABSOLUTE_MS} ms) este cel din manifest.`,
    ]),
  });
}

/** Rejects a report that claims a pass without measured equivalence or with an invented budget. */
export function verifySimulationBudgetReport(report: SimulationBudgetReport): readonly string[] {
  const problems: string[] = [];
  if (!report.rows.length) problems.push('Raportul nu conține rânduri măsurate');
  for (const equivalence of report.equivalence)
    if (equivalence.status !== 'IDENTICAL')
      problems.push(
        `Echivalența ${equivalence.component} diferă: ${equivalence.before} ≠ ${equivalence.after}`,
      );
  for (const row of report.rows) {
    if (row.verdict === 'PASS' && (row.before === null || row.after === null))
      problems.push(`${row.id}: PASS fără valoare înainte/după`);
    if (row.budget && !Number.isFinite(row.budget.value)) problems.push(`${row.id}: buget nevalid`);
    if (
      row.budget &&
      !row.budget.source.includes('performance-budgets.json') &&
      !row.budget.source.startsWith('PBI 158')
    )
      problems.push(`${row.id}: sursa bugetului nu este manifestul sau contractul PBI 158`);
  }
  const required: readonly SimulationComponentId[] = ['decisions', 'estimation', 'transfer'];
  for (const component of required)
    if (!report.rows.some((row) => row.component === component))
      problems.push(`Lipsește componenta ${component}`);
  if (report.verdicts.overall === 'PASS') {
    for (const component of required)
      if (report.verdicts[component] !== 'PASS')
        problems.push(`Verdict general PASS cu ${component} ${report.verdicts[component]}`);
    if (report.verdicts.equivalence !== 'PASS')
      problems.push('Verdict general PASS cu echivalență FAIL');
  }
  return Object.freeze(problems);
}

function tableRow(row: SimulationBudgetRow): string {
  const value = (input: number | null) => (input === null ? '—' : String(input));
  const budget = row.budget ? `${row.budget.value} (${row.budget.direction})` : '—';
  return `| ${row.id} | ${row.metric} | ${value(row.before)} | ${value(row.after)} | ${budget} | ${row.verdict} | ${row.note} |`;
}

export function simulationBudgetMarkdown(report: SimulationBudgetReport): string {
  const lines = [
    '# PBI 158 — buget de simulare și estimare',
    '',
    `- Contract: \`${report.version}\`, fixture \`${report.fixtureVersion}\`, bugete \`${report.budgetVersion}\``,
    `- Baseline: commit \`${report.baseline.commit}\`, capturat \`${report.baseline.capturedAt}\``,
    `- După optimizare: commit \`${report.after.commit}\`, capturat \`${report.after.capturedAt}\``,
    `- Hardware: ${report.hardware.cpu}, ${report.hardware.logicalCpus} fire logice, ${report.hardware.os}`,
    `- Protocol: ${report.protocol.passes} treceri × ${report.protocol.decisionRepeats} repetări × (${report.protocol.decisionWarmupTicks} warmup + ${report.protocol.decisionMeasuredTicks} tick-uri măsurate, publicare la ${report.protocol.decisionPublicationPeriodTicks} tick-uri, ${report.protocol.decisionSlots} sloturi de decizie); ${report.protocol.estimateRepeats} × (${report.protocol.estimateWarmupIterations} + ${report.protocol.estimateMeasuredIterations}) estimări; ${report.protocol.transferMessages} × ${report.protocol.transferRepeats} mesaje; valoarea raportată este mediana`,
    '',
    '## Echivalență semantică (SHA-256 peste toate ieșirile)',
    '',
    '| Componentă | Înainte | După | Intrări | Status |',
    '| --- | --- | --- | ---: | --- |',
    ...report.equivalence.map(
      (entry) =>
        `| ${entry.component} | \`${entry.before}\` | \`${entry.after}\` | ${entry.entries} | ${entry.status} |`,
    ),
    '',
    '## Metrici',
    '',
    '| ID | Metrică | Înainte | După | Buget | Verdict | Notă |',
    '| --- | --- | ---: | ---: | --- | --- | --- |',
    ...report.rows.map(tableRow),
    '',
    '## Verdicte',
    '',
    `- decizii: **${report.verdicts.decisions}**`,
    `- estimare: **${report.verdicts.estimation}**`,
    `- transferuri: **${report.verdicts.transfer}**`,
    `- echivalență: **${report.verdicts.equivalence}**`,
    `- general: **${report.verdicts.overall}**`,
    '',
    '## Limitări',
    '',
    ...report.limitations.map((limitation) => `- ${limitation}`),
    '',
  ];
  return lines.join('\n');
}
