/** Authored069 chronological fixture ONLY. No production lifecycle/recorder/estimator. */
import { parseInterventionSegment, parseTelemetrySample } from '../../src/telemetry';
import type { InterventionSegment, TelemetrySample } from '../../src/telemetry';
import type { ContractContext } from '../../src/sessions';
import type { BodyIdentity, ControlMode, VehicleCommand } from '../../src/vehicles';

export const MANUAL_REFERENCE = Object.freeze({
  version: '069-chronological-reference-v1' as const,
  hz: 60, warmupTicks: 180, measuredTicks: 600, pairs: 5,
  populations: Object.freeze([70, 110]),
  metadataRecords: 64, metadataBytes: 256 * 1024,
  recordBytes: 64 * 1024, samples: 32, events: 8,
  idCodeUnits: 256,
});
export function manualReferencePhase(tick: number) {
  if (!Number.isSafeInteger(tick) || tick < 1 || tick > 780) throw Error('Reference tick');
  const phase = (tick - 1) % 120 + 1;
  return Object.freeze({
    phase,
    desiredMode: phase === 1 || phase === 61 || phase === 83 || phase === 111
      ? 'MANUAL' as const : phase === 31 ? 'LEARNING' as const
        : phase === 101 ? 'AUTO' as const : null,
    selectOrdinal: phase === 81 ? 1 : phase === 82 ? 0 : null,
    boundary: phase === 51 ? 'RIDE_COMPLETED' as const
      : phase === 71 ? 'PROFILE_CHANGE' as const : null,
    throttleHeld: phase <= 80,
    brakeHeld: phase > 80 && phase <= 100,
    steerRightHeld: phase >= 30 && phase < 60,
    steerLeftHeld: phase >= 60 && phase < 80,
  });
}
export function referenceModeAction(current: ControlMode, desired: ControlMode) {
  if (current === desired) return null;
  return desired === 'LEARNING' ? 'L' as const
    : desired === 'AUTO' || current === 'AUTO' ? 'M' as const : 'L' as const;
}
export function referenceTime(context: ContractContext, tick: number,
  version: '066-control-authority-v1' | '067-mode-controls-v1' | '068-vehicle-selection-v1') {
  return Object.freeze({ ...context, version, tick, dtSeconds: 1 / 60 });
}

/** Known constructed fixture records only; admission/cardinality before005 array cloning. */
export function boundedFixtureRecord(value: unknown) {
  const bytes = referencePreparseBytes(value);
  return { record: parseInterventionSegment(value), bytes };
}
/** Fixture-only bounded traversal; never evaluates accessors or serializes an unbounded whole input. */
export function referencePreparseBytes(value: unknown) {
  const encoder = new TextEncoder(); let nodes = 0, bytes = 0;
  function add(n: number) { bytes += n; if (bytes > MANUAL_REFERENCE.recordBytes) throw Error('Reference record byte capacity'); }
  function literal(v: string | number | boolean | null) { add(encoder.encode(JSON.stringify(v)).byteLength); }
  function visit(v: unknown, depth: number, name: string) {
    if (++nodes > 8192 || depth > 16) throw Error('Reference record traversal capacity');
    if (v === null || typeof v === 'boolean') { literal(v); return; }
    if (typeof v === 'number') { if (!Number.isFinite(v)) throw Error('Reference finite numbers'); literal(v); return; }
    if (typeof v === 'string') { if (v.length > 256) throw Error('Reference string capacity'); literal(v); return; }
    if (typeof v !== 'object' || v === null) throw Error('Reference plain JSON data');
    const array = Array.isArray(v), prototype: unknown = Object.getPrototypeOf(v);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
      throw Error('Reference data prototype');
    const keys = Reflect.ownKeys(v);
    if (array) {
      const length = Object.getOwnPropertyDescriptor(v, 'length');
      if (!length || !('value' in length) || !Number.isSafeInteger(length.value) || length.value < 0)
        throw Error('Reference array length');
      const n = length.value as number, cap = name === 'events' || name === 'conflictEntityIds' ? 8 : 32;
      if (n > cap || keys.length !== n + 1) throw Error('Reference array cardinality');
      add(2 + Math.max(0, n - 1));
      for (let i = 0; i < n; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !('value' in d) || !d.enumerable) throw Error('Reference dense data array');
        visit(d.value, depth + 1, name);
      }
    } else {
      if (keys.length > 64) throw Error('Reference field capacity');
      add(2 + Math.max(0, keys.length - 1));
      for (const key of keys) {
        if (typeof key !== 'string' || key.length > 256) throw Error('Reference data key');
        const d = Object.getOwnPropertyDescriptor(v, key);
        if (!d || !('value' in d) || !d.enumerable) throw Error('Reference own data descriptor');
        literal(key); add(1); visit(d.value, depth + 1, key);
      }
    }
  }
  visit(value, 0, 'root'); return bytes;
}
/** Explicit SYNTHETIC_SCHEMA_STRESS; not genuine observed conflicts/events or learning evidence. */
export function referenceSchemaStress(source: InterventionSegment) {
  if (source.samples.length !== 32) throw Error('Stress source needs32 actualnative samples');
  const raw = structuredClone(source) as unknown as Record<string, unknown>;
  raw.learningEligible = false;
  const samples = raw.samples as Record<string, unknown>[];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]!;
    const context = sample.context as Record<string, unknown>;
    context.conflictEntityIds = Array.from({ length: 8 }, (_, j) => 'schema-conflict-' + i + '-' + j);
  }
  raw.events = Array.from({ length: 8 }, (_, i) => ({
    schemaVersion: source.schemaVersion, units: source.units, sessionId: source.sessionId,
    worldEpoch: source.worldEpoch, eventId: 'schema-event-' + i, tick: source.samples[0]!.tick,
    type: 'MANUAL_START', entityIds: [source.vehicleId],
    payload: { vehicleId: source.vehicleId, controlMode: source.controlMode },
  }));
  const slots: { container: string[]; index: number }[] = [];
  for (const sample of samples) {
    const list = (sample.context as Record<string, unknown>).conflictEntityIds as string[];
    for (let index = 0; index < list.length; index++) slots.push({container:list,index});
  }
  // Maximise bounded escaped/UTF8 diagnostic shape without claiming physical conflict provenance.
  for (const slot of slots) {
    const prefix = slot.container[slot.index]!;
    let low = 0, high = 256 - prefix.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      slot.container[slot.index] = prefix + '"'.repeat(middle);
      try { referencePreparseBytes(raw); low = middle; } catch { high = middle - 1; }
    }
    slot.container[slot.index] = prefix + '"'.repeat(low);
  }
  // An ASCII suffix fills any remaining odd byte; still bounded to256 code units.
  for (const slot of slots) {
    while (slot.container[slot.index]!.length < 256 && referencePreparseBytes(raw) < 65536) {
      const prior = slot.container[slot.index]!; slot.container[slot.index] = prior + 'x';
      try { referencePreparseBytes(raw); } catch { slot.container[slot.index] = prior; break; }
    }
  }
  const prepared = boundedFixtureRecord(raw);
  if (prepared.bytes !== 65536) throw Error('Stress fixture must hit exact admitted byte boundary');
  return prepared;
}
export function createManualReferenceStore(context: ContractContext) {
  let current: { identity: BodyIdentity; segment: InterventionSegment } | null = null;
  let closed: InterventionSegment[] = [];
  let sequence = 0, learningEpoch = 0, disposed = false;
  function live() { if (disposed) throw Error('Reference store disposed'); }
  function open(identity: BodyIdentity, mode: 'MANUAL' | 'LEARNING', tick: number) {
    live();
    if (current?.segment.completeness === 'OPEN') throw Error('Reference OPEN already held');
    const segment = parseInterventionSegment({
      ...context, segmentId: 'manual-reference-' + ++sequence,
      vehicleId: identity.entityId, controlMode: mode, learningEligible: false,
      playerId: 'reference-player', profileId: 'reference-profile',
      baseVersionId: 'reference-base-' + learningEpoch, learningEpoch,
      controlPreferencesVersion: '025-keyboard-v1', startTick: tick, endTick: null,
      closeReason: null, engineVersion: 'published-d8e5756', mapVersion: '069-authored-native-fixture-v1',
      inputType: 'KEYBOARD', samples: [], events: [], completeness: 'OPEN',
    });
    current = Object.freeze({ identity, segment });
    return current;
  }
  return {
    open,
    close(identity: BodyIdentity, tick: number, reason: NonNullable<InterventionSegment['closeReason']>) {
      live();
      if (!current || current.identity !== identity || current.segment.completeness !== 'OPEN')
        throw Error('Reference close identity/state');
      const prepared = boundedFixtureRecord({ ...current.segment, endTick: tick,
        closeReason: reason, completeness: 'CLOSED' });
      const next = [...closed, prepared.record];
      const bytes = new TextEncoder().encode(JSON.stringify(next)).byteLength;
      if (next.length > MANUAL_REFERENCE.metadataRecords || bytes > MANUAL_REFERENCE.metadataBytes)
        throw Error('Reference protected archive admission');
      closed = next;
      current = Object.freeze({ identity, segment: prepared.record });
      return current;
    },
    append(sample: TelemetrySample) {
      live();
      if (!current || current.segment.completeness !== 'OPEN') throw Error('Reference sample without OPEN');
      if (current.segment.samples.length >= MANUAL_REFERENCE.samples) throw Error('Reference sample capacity');
      const next = boundedFixtureRecord({ ...current.segment,
        samples: [...current.segment.samples, parseTelemetrySample(sample)] });
      current = Object.freeze({ identity: current.identity, segment: next.record });
    },
    read() { live(); return current; },
    archive() { live(); return Object.freeze([...closed]); },
    incrementEpoch() {
      live();
      if (current?.segment.completeness === 'OPEN') throw Error('Reference target barrier requires closed segment');
      if (!Number.isSafeInteger(learningEpoch + 1)) throw Error('Reference epoch exhausted');
      return ++learningEpoch;
    },
    getStats() { return Object.freeze({ disposed, open: current?.segment.completeness === 'OPEN' ? 1 : 0,
      retainedRecords: closed.length, currentRecords: current ? 1 : 0, learningEpoch,
      archivedUtf8Bytes: new TextEncoder().encode(JSON.stringify(closed)).byteLength,
      intakeRecords: 0, scope: 'INELIGIBLE_REFERENCE_NO_ESTIMATOR' as const }); },
    dispose() { if (disposed) return; disposed = true; current = null; closed = []; },
  };
}

/** Sample fields must originate in actual native/command readbacks supplied by the runner. */
export function nativeReferenceSample(context: ContractContext, options: {
  tick: number; identity: BodyIdentity; mode: 'MANUAL' | 'LEARNING';
  classId: string; baseVersionId: string;
  transform: TelemetrySample['state']['transform'];
  velocityMps: TelemetrySample['state']['velocityMps']; command: VehicleCommand;
  rawInput: TelemetrySample['rawInput'];
  longitudinalAccelerationMps2: number; lateralAccelerationMps2: number;
  capabilities: TelemetrySample['capabilities'];
  incident: boolean;
}) {
  return parseTelemetrySample({ tick: options.tick,
    state: { ...context, vehicleId: options.identity.entityId, classId: options.classId,
      tick: options.tick, transform: options.transform, velocityMps: options.velocityMps,
      laneId: null, controlMode: options.mode, appliedProfileVersion: options.baseVersionId,
      maneuverState: 'FOLLOWING' },
    command: options.command, rawInput: options.rawInput,
    longitudinalAccelerationMps2: options.longitudinalAccelerationMps2,
    lateralAccelerationMps2: options.lateralAccelerationMps2,
    capabilities: options.capabilities,
    context: { roadType: 'URBAN', speedLimitMps: 13.88888888888889,
      curvaturePerM: 0, leaderId: null, leaderGapM: null, signalId: null,
      signalState: null, stopLineId: null, distanceToStopLineM: null,
      conflictEntityIds: [], rideId: null },
    excludedReason: options.incident ? 'COLLISION_IMPULSE' : null,
  });
}
