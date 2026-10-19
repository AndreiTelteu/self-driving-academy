import type { OpportunityRecord } from './opportunities';
import type { TickSampleRecorder } from './tick-samples';

export const SEGMENT_COMPACTION_VERSION = '090-segment-compaction-v1' as const;
export const SEGMENT_COMPACTION_DEFAULTS = Object.freeze({
  tickHz: 60,
  analysisHz: 20,
  chunkByteCap: 4 * 1024,
  retainedChunkCap: 64,
  retainedByteCap: 4 * 1024 * 1024,
  maxOpportunities: 4096,
  maxEvents: 4096,
  pendingWorkerPayloadBytes: 16 * 1024 * 1024,
  finalizeItemsPerStep: 32,
});
const SAMPLE_BYTES = 32;
const SAMPLE_ARRAYS = [
  'ticks',
  'speedMps',
  'throttle',
  'brake',
  'steering',
  'longitudinalAccelerationMps2',
  'lateralAccelerationMps2',
] as const;
type ArrayName = (typeof SAMPLE_ARRAYS)[number];
type SampleArrays = Record<ArrayName, Float64Array | Float32Array>;
export type SegmentTerminalReason =
  'SOURCE_INCOMPLETE' | 'CAPACITY_EXCEEDED' | 'DISPOSED' | 'INVALID_SOURCE';
export type SegmentState = 'OPEN' | 'FINALIZING' | 'FINALIZED' | 'INCOMPLETE';
export interface SegmentCompactionOptions {
  readonly tickHz?: number;
  readonly analysisHz?: number;
  readonly chunkByteCap?: number;
  readonly retainedChunkCap?: number;
  readonly retainedByteCap?: number;
  readonly maxOpportunities?: number;
  readonly maxEvents?: number;
  readonly pendingWorkerPayloadBytes?: number;
  readonly finalizeItemsPerStep?: number;
}
export interface SegmentCompactionInput {
  readonly recorder: TickSampleRecorder;
  readonly segmentId: string;
  readonly options?: SegmentCompactionOptions;
}
export interface CompactOpportunity {
  readonly id: string;
  readonly kind: OpportunityRecord['kind'];
  readonly state: OpportunityRecord['state'];
  readonly openedTick: number;
  readonly resolvedTick: number | null;
  readonly truncationReason: OpportunityRecord['truncationReason'];
}
export interface CompactEvent {
  readonly id: string;
  readonly kind: string;
  readonly tick: number;
}
export interface TransferableSegmentChunk {
  readonly segmentId: string;
  readonly sequence: number;
  readonly firstTick: number;
  readonly lastTick: number;
  readonly previousSequence: number | null;
  readonly nextSequence: number | null;
  readonly hasGap: boolean;
  readonly gapCount: number;
  readonly ownership: 'COMPACTOR_OWNED' | 'READ_COPY' | 'TRANSFER_COPY';
  readonly samples: SampleArrays;
  readonly opportunities: readonly CompactOpportunity[];
  readonly events: readonly CompactEvent[];
  readonly payloadBytes: number;
}
export interface SegmentCompaction {
  readonly state: SegmentState;
  recordOpportunity(record: OpportunityRecord): boolean;
  recordEvent(event: CompactEvent): boolean;
  compactAvailable(maxItems?: number): { processedItems: number; sampled: number; done: boolean };
  beginFinalize(): boolean;
  finalizeStep(maxItems?: number): { processedItems: number; state: SegmentState; done: boolean };
  getChunks(): readonly TransferableSegmentChunk[];
  acquireTransfer(sequence: number): TransferableSegmentChunk | null;
  getStats(): Readonly<Record<string, number | boolean | string | null>>;
  dispose(): void;
}

function arrays(capacity: number): SampleArrays {
  return {
    ticks: new Float64Array(capacity),
    speedMps: new Float32Array(capacity),
    throttle: new Float32Array(capacity),
    brake: new Float32Array(capacity),
    steering: new Float32Array(capacity),
    longitudinalAccelerationMps2: new Float32Array(capacity),
    lateralAccelerationMps2: new Float32Array(capacity),
  };
}
function bytes(value: SampleArrays): number {
  return Object.values(value).reduce((sum, array) => sum + array.byteLength, 0);
}
function compactRecord(record: OpportunityRecord): CompactOpportunity {
  return Object.freeze({
    id: record.id,
    kind: record.kind,
    state: record.state,
    openedTick: record.openedTick,
    resolvedTick: record.resolvedTick,
    truncationReason: record.truncationReason,
  });
}

/** Bounded 090 compactor. Reads real 085 rows incrementally and accepts immutable facts from 086. */
export function createSegmentCompaction(input: SegmentCompactionInput): SegmentCompaction {
  const config = { ...SEGMENT_COMPACTION_DEFAULTS, ...input.options };
  const integer = (value: number) => Number.isSafeInteger(value) && value > 0;
  if (
    !input.recorder ||
    typeof input.segmentId !== 'string' ||
    !input.segmentId ||
    !integer(config.tickHz) ||
    !integer(config.analysisHz) ||
    config.analysisHz > config.tickHz ||
    config.tickHz % config.analysisHz !== 0 ||
    !integer(config.chunkByteCap) ||
    config.chunkByteCap < 2048 + SAMPLE_BYTES ||
    config.chunkByteCap > 256 * 1024 ||
    !integer(config.retainedChunkCap) ||
    config.retainedChunkCap > 64 ||
    !integer(config.retainedByteCap) ||
    config.retainedByteCap > 4 * 1024 * 1024 ||
    !integer(config.maxOpportunities) ||
    config.maxOpportunities > 4096 ||
    !integer(config.maxEvents) ||
    config.maxEvents > 4096 ||
    !integer(config.pendingWorkerPayloadBytes) ||
    config.pendingWorkerPayloadBytes > 16 * 1024 * 1024 ||
    !integer(config.finalizeItemsPerStep) ||
    config.finalizeItemsPerStep > 256
  )
    throw new Error('INVALID_SOURCE');
  const summary = input.recorder.getSegment(input.segmentId);
  if (!summary) throw new Error('INVALID_SOURCE');
  const latestSummary = () => input.recorder.getSegment(input.segmentId);
  const period = config.tickHz / config.analysisHz;
  const chunkSamples = Math.floor((config.chunkByteCap - 2048) / SAMPLE_BYTES);
  const chunks: TransferableSegmentChunk[] = [];
  const current: CompactOpportunity[] = [];
  const opportunities = new Map<string, CompactOpportunity>();
  const eventFacts = new Map<string, CompactEvent>();
  const counters = {
    disposed: false,
    state: 'OPEN' as SegmentState,
    reason: null as SegmentTerminalReason | null,
    sourceRows: summary.sampleCount,
    sourceRead: 0,
    samplesRetained: 0,
    opportunitiesAccepted: 0,
    unresolvedOpportunities: 0,
    truncatedOpportunities: 0,
    rejectedOpportunities: 0,
    eventsAccepted: 0,
    eventsRejected: 0,
    droppedSamples: 0,
    rolloverCount: 0,
    retainedBytes: 0,
    transferPayloadBytes: 0,
    transferCount: 0,
    nextTransferSequence: 0,
    finalizeCalls: 0,
    maxFinalizeItems: 0,
  };
  let workArrays = arrays(chunkSamples);
  let workCount = 0;
  let sampledTotal = 0;
  let chunkStartTick: number | null = null;
  let lastSourceTick: number | null = null;
  let firstObservedTick: number | null = null;
  let lastObservedTick: number | null = null;
  let gapCount = 0;
  let finalizeIterator: Iterator<[string, CompactOpportunity]> | null = null;
  let finalizeVisited = 0;
  const opportunityChunk = new Map<string, number>();

  const closeChunk = (allowEventsOnly = false) => {
    if (workCount === 0 && (!allowEventsOnly || (current.length === 0 && eventFacts.size === 0)))
      return;
    const cropped = {} as SampleArrays;
    for (const name of SAMPLE_ARRAYS) {
      const source = workArrays[name];
      cropped[name] = source.slice(0, workCount) as never;
    }
    const take = current.filter(
      (record) =>
        record.openedTick <= (lastObservedTick ?? record.openedTick) &&
        (chunks.length === 0 || record.openedTick > chunks[chunks.length - 1]!.lastTick),
    );
    for (const item of take) current.splice(current.indexOf(item), 1);
    const lowerTick = chunks.length === 0 ? -1 : chunks[chunks.length - 1]!.lastTick;
    const upperTick = lastObservedTick ?? Number.MAX_SAFE_INTEGER;
    const takeEvents = [...eventFacts.values()].filter(
      (event) => event.tick > lowerTick && event.tick <= upperTick,
    );
    for (const event of takeEvents) eventFacts.delete(event.id);
    const sequence = chunks.length;
    const chunk: TransferableSegmentChunk = Object.freeze({
      segmentId: input.segmentId,
      sequence,
      firstTick:
        firstObservedTick ?? take[0]?.openedTick ?? takeEvents[0]?.tick ?? chunkStartTick ?? 0,
      lastTick:
        lastObservedTick ??
        take[take.length - 1]?.openedTick ??
        takeEvents[takeEvents.length - 1]?.tick ??
        0,
      previousSequence: sequence ? sequence - 1 : null,
      nextSequence: null,
      hasGap: gapCount > 0,
      gapCount,
      ownership: 'COMPACTOR_OWNED',
      samples: cropped,
      opportunities: Object.freeze(take),
      events: Object.freeze(takeEvents),
      payloadBytes:
        bytes(cropped) +
        new TextEncoder().encode(JSON.stringify({ opportunities: take, events: takeEvents }))
          .byteLength,
    });
    if (
      chunks.length >= config.retainedChunkCap ||
      counters.retainedBytes + chunk.payloadBytes > config.retainedByteCap ||
      chunk.payloadBytes > config.chunkByteCap ||
      chunk.payloadBytes > config.pendingWorkerPayloadBytes
    ) {
      counters.droppedSamples += workCount;
      counters.rejectedOpportunities += take.length;
      counters.eventsRejected += takeEvents.length;
      counters.reason = 'CAPACITY_EXCEEDED';
      counters.state = 'INCOMPLETE';
      return;
    }
    if (chunks.length) {
      const previous = chunks[chunks.length - 1]!;
      chunks[chunks.length - 1] = Object.freeze({ ...previous, nextSequence: sequence });
    }
    chunks.push(chunk);
    for (const item of take) opportunityChunk.set(item.id, sequence);
    counters.retainedBytes += chunk.payloadBytes;
    counters.samplesRetained += workCount;
    if (chunks.length > 1) counters.rolloverCount += 1;
    workArrays = arrays(chunkSamples);
    workCount = 0;
    firstObservedTick = null;
    gapCount = 0;
  };
  const fail = (reason: SegmentTerminalReason) => {
    counters.reason = reason;
    counters.state = 'INCOMPLETE';
  };
  const isIncomplete = () => counters.state === 'INCOMPLETE';
  const isFinalizing = () => counters.state === 'FINALIZING';
  const requestedItems = (value?: number) => {
    const count = value ?? config.finalizeItemsPerStep;
    if (!integer(count) || count > config.finalizeItemsPerStep) throw new Error('INVALID_SOURCE');
    return count;
  };
  return Object.freeze({
    get state() {
      return counters.state;
    },
    recordOpportunity(record: OpportunityRecord): boolean {
      if (counters.disposed || counters.state !== 'OPEN') {
        counters.rejectedOpportunities++;
        return false;
      }
      if (
        !record ||
        typeof record.id !== 'string' ||
        !Number.isSafeInteger(record.openedTick) ||
        (record.resolvedTick !== null && !Number.isSafeInteger(record.resolvedTick))
      ) {
        fail('INVALID_SOURCE');
        return false;
      }
      const existing = opportunities.get(record.id);
      if (existing) {
        if (existing.kind !== record.kind || existing.openedTick !== record.openedTick) {
          counters.rejectedOpportunities++;
          fail('INVALID_SOURCE');
          return false;
        }
        const updated = compactRecord(record);
        const position = current.indexOf(existing);
        if (position >= 0) current[position] = updated;
        else {
          const sequence = opportunityChunk.get(record.id);
          if (sequence !== undefined) {
            const previous = chunks[sequence];
            if (!previous) {
              fail('INVALID_SOURCE');
              return false;
            }
            const updatedOpportunities = previous.opportunities.map((item) =>
              item.id === record.id ? updated : item,
            );
            const payloadBytes =
              bytes(previous.samples) +
              new TextEncoder().encode(
                JSON.stringify({ opportunities: updatedOpportunities, events: previous.events }),
              ).byteLength;
            if (payloadBytes > config.chunkByteCap) {
              fail('CAPACITY_EXCEEDED');
              return false;
            }
            chunks[sequence] = Object.freeze({
              ...previous,
              opportunities: Object.freeze(updatedOpportunities),
              payloadBytes,
            });
            counters.retainedBytes += payloadBytes - previous.payloadBytes;
          }
        }
        opportunities.set(record.id, updated);
        if (existing.state === 'ENTERED' && updated.state !== 'ENTERED')
          counters.unresolvedOpportunities = Math.max(0, counters.unresolvedOpportunities - 1);
        if (updated.state === 'TRUNCATED' && existing.state !== 'TRUNCATED')
          counters.truncatedOpportunities++;
        return true;
      }
      if (opportunities.size >= config.maxOpportunities) {
        counters.rejectedOpportunities++;
        fail('CAPACITY_EXCEEDED');
        return false;
      }
      const item = compactRecord(record);
      opportunities.set(record.id, item);
      current.push(item);
      counters.opportunitiesAccepted++;
      if (record.state === 'ENTERED') counters.unresolvedOpportunities++;
      if (record.state === 'TRUNCATED') counters.truncatedOpportunities++;
      return true;
    },
    recordEvent(event: CompactEvent): boolean {
      if (counters.disposed || counters.state !== 'OPEN') {
        counters.eventsRejected++;
        return false;
      }
      if (
        !event ||
        typeof event.id !== 'string' ||
        !event.id ||
        event.id.length > 256 ||
        typeof event.kind !== 'string' ||
        !event.kind ||
        event.kind.length > 64 ||
        !Number.isSafeInteger(event.tick) ||
        event.tick < 0
      ) {
        fail('INVALID_SOURCE');
        return false;
      }
      const existing = eventFacts.get(event.id);
      if (existing) {
        if (existing.kind !== event.kind || existing.tick !== event.tick) {
          counters.eventsRejected++;
          fail('INVALID_SOURCE');
          return false;
        }
        return true;
      }
      if (eventFacts.size >= config.maxEvents) {
        counters.eventsRejected++;
        fail('CAPACITY_EXCEEDED');
        return false;
      }
      eventFacts.set(event.id, Object.freeze({ id: event.id, kind: event.kind, tick: event.tick }));
      counters.eventsAccepted++;
      return true;
    },
    compactAvailable(maxItems?: number) {
      if (counters.disposed || counters.state !== 'OPEN')
        return { processedItems: 0, sampled: 0, done: true };
      const amount = maxItems ?? config.finalizeItemsPerStep;
      if (!integer(amount) || amount > 256) throw new Error('INVALID_SOURCE');
      let processed = 0;
      let sampled = 0;
      let source = latestSummary();
      if (!source) {
        fail('INVALID_SOURCE');
        return { processedItems: 0, sampled: 0, done: true };
      }
      counters.sourceRows = source.sampleCount;
      while (processed < amount && counters.sourceRead < source.sampleCount) {
        let row;
        try {
          row = input.recorder.readSample(input.segmentId, counters.sourceRead++);
        } catch {
          fail('SOURCE_INCOMPLETE');
          break;
        }
        const observation = row.observation;
        processed++;
        if (lastSourceTick !== null && observation.tick !== lastSourceTick + 1) gapCount++;
        lastSourceTick = observation.tick;
        if ((observation.tick - summary.startTick) % period !== 0) continue;
        if (workCount === chunkSamples) closeChunk();
        if (isIncomplete()) break;
        if (workCount === 0) {
          firstObservedTick = observation.tick;
          chunkStartTick = observation.tick;
        }
        const state = observation.state;
        const speed = Math.hypot(state.velocityMps.x, state.velocityMps.y, state.velocityMps.z);
        workArrays.ticks[workCount] = observation.tick;
        workArrays.speedMps[workCount] = speed;
        workArrays.throttle[workCount] = observation.command.throttle;
        workArrays.brake[workCount] = observation.command.brake;
        workArrays.steering[workCount] = observation.command.steering;
        workArrays.longitudinalAccelerationMps2[workCount] =
          observation.physics.longitudinalAccelerationMps2;
        workArrays.lateralAccelerationMps2[workCount] = observation.physics.lateralAccelerationMps2;
        workCount++;
        sampled++;
        sampledTotal++;
        lastObservedTick = observation.tick;
      }
      source = latestSummary();
      if (!source) {
        fail('INVALID_SOURCE');
        return { processedItems: processed, sampled, done: true };
      }
      counters.sourceRows = source.sampleCount;
      return {
        processedItems: processed,
        sampled,
        done:
          isIncomplete() ||
          (source.completeness === 'CLOSED' && counters.sourceRead >= source.sampleCount),
      };
    },
    beginFinalize() {
      if (counters.disposed || counters.state !== 'OPEN') return false;
      const source = latestSummary();
      if (!source) {
        fail('INVALID_SOURCE');
        return false;
      }
      counters.sourceRows = source.sampleCount;
      if (source.completeness !== 'CLOSED' || counters.sourceRead !== source.sampleCount)
        return false;
      if (source.overwrittenSamples || source.rejectedSamples) fail('SOURCE_INCOMPLETE');
      else counters.state = 'FINALIZING';
      return counters.state === 'FINALIZING';
    },
    finalizeStep(maxItems?: number) {
      if (counters.disposed || counters.state !== 'FINALIZING')
        return { processedItems: 0, state: counters.state, done: true };
      const amount = requestedItems(maxItems);
      let processed = 0;
      if (!finalizeIterator) finalizeIterator = opportunities.entries();
      while (processed < amount && finalizeVisited < opportunities.size) {
        const next = finalizeIterator.next();
        if (next.done) break;
        finalizeVisited++;
        processed++;
      }
      if (
        finalizeVisited === opportunities.size &&
        processed < amount &&
        (workCount || current.length)
      ) {
        closeChunk(true);
        processed++;
      }
      counters.finalizeCalls++;
      counters.maxFinalizeItems = Math.max(counters.maxFinalizeItems, processed);
      if (
        isFinalizing() &&
        finalizeVisited === opportunities.size &&
        workCount === 0 &&
        current.length === 0
      )
        counters.state = 'FINALIZED';
      return {
        processedItems: processed,
        state: counters.state,
        done: counters.state === 'FINALIZED' || isIncomplete(),
      };
    },
    getChunks: () =>
      Object.freeze(
        chunks.map((chunk) => {
          const samples = {} as SampleArrays;
          for (const name of SAMPLE_ARRAYS) samples[name] = chunk.samples[name].slice() as never;
          return Object.freeze({ ...chunk, samples, ownership: 'READ_COPY' as const });
        }),
      ),
    acquireTransfer(sequence: number) {
      const original = chunks[sequence];
      if (
        !original ||
        sequence !== counters.nextTransferSequence ||
        counters.disposed ||
        counters.state !== 'FINALIZED'
      )
        return null;
      const samples = {} as SampleArrays;
      for (const name of SAMPLE_ARRAYS) samples[name] = original.samples[name].slice() as never;
      const copy = Object.freeze({ ...original, samples, ownership: 'TRANSFER_COPY' as const });
      counters.nextTransferSequence = sequence + 1;
      counters.transferCount++;
      counters.transferPayloadBytes += copy.payloadBytes;
      return copy;
    },
    getStats: () =>
      Object.freeze({
        version: SEGMENT_COMPACTION_VERSION,
        state: counters.state,
        reason: counters.reason,
        sourceRows: counters.sourceRows,
        sourceRead: counters.sourceRead,
        sampledRows: sampledTotal,
        samplesRetained: counters.samplesRetained,
        opportunitiesAccepted: counters.opportunitiesAccepted,
        unresolvedOpportunities: counters.unresolvedOpportunities,
        truncatedOpportunities: counters.truncatedOpportunities,
        rejectedOpportunities: counters.rejectedOpportunities,
        eventsAccepted: counters.eventsAccepted,
        eventsRejected: counters.eventsRejected,
        droppedSamples: counters.droppedSamples,
        rolloverCount: counters.rolloverCount,
        chunksRetained: chunks.length,
        retainedBytes: counters.retainedBytes,
        transferPayloadBytes: counters.transferPayloadBytes,
        transferCount: counters.transferCount,
        pendingWorkerPayloadBytes: config.pendingWorkerPayloadBytes,
        chunkByteCap: config.chunkByteCap,
        finalizeCalls: counters.finalizeCalls,
        maxFinalizeItems: counters.maxFinalizeItems,
        finalizeItemsPerStep: config.finalizeItemsPerStep,
        analysisHz: config.analysisHz,
        tickHz: config.tickHz,
        disposed: counters.disposed,
      }),
    dispose() {
      if (counters.disposed) return;
      counters.disposed = true;
      counters.state = 'INCOMPLETE';
      counters.reason = 'DISPOSED';
      chunks.length = 0;
      opportunities.clear();
      opportunityChunk.clear();
      eventFacts.clear();
      current.length = 0;
      workArrays = arrays(0);
      workCount = 0;
      counters.retainedBytes = 0;
      counters.samplesRetained = 0;
    },
  });
}
