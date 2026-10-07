import type { ContractContext } from '../../src/sessions';
import type { BodyIdentity, ControlMode } from '../../src/vehicles';
import { parseInterventionSegment, type InterventionSegment } from '../../src/telemetry/contracts';

export const SELECTION_REFERENCE = Object.freeze({
  version: '068-published067-selection-reference-v1',
  warmupTicks: 180,
  measuredTicks: 600,
  populations: Object.freeze([70, 110]),
  pairs: 5,
  hz: 60,
  retainedSegments: 1,
  retainedAssignments: 110,
  history: 0,
});
export type SelectionKind = 'TAXI' | 'CIVIL';
export type SelectionSource = 'WORLD' | 'FLEET';
/** Authored fixture schedule, independent of the upcoming068 implementation. */
export function referenceSelectionPhase(tick: number, fixedMode?: ControlMode) {
  const phase = (tick - 1) % 60;
  const cycle = Math.floor((tick - 1) / 60);
  return Object.freeze({
    mode: fixedMode ?? (['AUTO', 'MANUAL', 'LEARNING'] as const)[cycle % 3],
    claim: phase === 0,
    depart: phase === 20,
    returnCamera: phase === 40,
    source: cycle % 2 === 0 ? ('WORLD' as const) : ('FLEET' as const),
  });
}
/** WORLD requires the actually presented exact native token;FLEET admits offscreen taxis. */
export function referenceSelectionAdmission(
  native: BodyIdentity | undefined,
  presented: BodyIdentity | undefined,
  source: SelectionSource,
  kind: SelectionKind,
  visible: boolean,
  selectable: boolean,
): boolean {
  if (!native || !presented || native !== presented) return false;
  return source === 'FLEET' ? kind === 'TAXI' : visible && selectable;
}
export interface FixtureSegmentBoundary {
  readonly identity: BodyIdentity;
  readonly segment: InterventionSegment;
}
/** Actual bounded005 records;empty samples explicitly mean no069 recorder/training service. */
export function createFixtureSegmentStore(context: ContractContext) {
  let boundary: FixtureSegmentBoundary | null = null;
  let opened = 0;
  let closed = 0;
  let disposed = false;
  return {
    open(identity: BodyIdentity, mode: 'MANUAL' | 'LEARNING', tick: number) {
      if (disposed || boundary?.segment.completeness === 'OPEN')
        throw new Error('Segment owner not ready');
      boundary = Object.freeze({
        identity,
        segment: parseInterventionSegment({
          ...context,
          segmentId: 'selection-segment-' + ++opened,
          vehicleId: identity.entityId,
          controlMode: mode,
          learningEligible: false,
          playerId: 'fixture-player',
          profileId: 'fixture-profile',
          baseVersionId: 'fixture-base',
          learningEpoch: 0,
          controlPreferencesVersion: '025-control-v1',
          startTick: tick,
          endTick: null,
          closeReason: null,
          engineVersion: 'fixture-engine',
          mapVersion: 'fixture-map',
          inputType: 'KEYBOARD',
          samples: [],
          events: [],
          completeness: 'OPEN',
        }),
      });
      return boundary;
    },
    read() {
      return boundary;
    },
    close(identity: BodyIdentity, tick: number) {
      if (
        disposed ||
        !boundary ||
        boundary.identity !== identity ||
        boundary.segment.completeness !== 'OPEN'
      )
        throw new Error('Segment boundary mismatch');
      boundary = Object.freeze({
        identity,
        segment: parseInterventionSegment({
          ...boundary.segment,
          endTick: tick,
          closeReason: 'VEHICLE_SWITCH',
          completeness: 'CLOSED',
        }),
      });
      closed++;
    },
    getStats() {
      return { opened, closed, retainedSegments: boundary ? 1 : 0, disposed, retainedHistory: 0 };
    },
    dispose() {
      boundary = null;
      disposed = true;
    },
  };
}

export interface ReferenceCleanupFailure {
  readonly resource: string;
  readonly phase: 'DISPOSE' | 'READBACK';
  readonly message: string;
}
/** Fixture-only acquisition scope. Every registered release runs once;readbacks never invent zeros. */
export function createReferenceResourceScope() {
  const resources: { name: string; release: () => void }[] = [];
  const readers = new Map<string, () => unknown>();
  let closed = false;
  return {
    own(name: string, release: () => void, read?: () => unknown) {
      if (closed || resources.some((v) => v.name === name) || resources.length >= 9)
        throw new Error('Reference resource scope capacity/state');
      resources.push({ name, release });
      if (read) readers.set(name, read);
    },
    inspect(name: string, read: () => unknown) {
      if (closed || readers.has(name) || readers.size >= 12)
        throw new Error('Reference resource reader capacity/state');
      readers.set(name, read);
    },
    close() {
      if (closed) throw new Error('Reference resource scope already closed');
      closed = true;
      const errors: ReferenceCleanupFailure[] = [];
      const attempts: string[] = [];
      const snapshots: Record<string, unknown> = {};
      for (const resource of [...resources].reverse()) {
        attempts.push(resource.name);
        try {
          resource.release();
        } catch (error) {
          errors.push({ resource: resource.name, phase: 'DISPOSE', message: String(error) });
        }
      }
      for (const [name, read] of readers) {
        try {
          snapshots[name] = read();
        } catch (error) {
          snapshots[name] = null;
          errors.push({ resource: name, phase: 'READBACK', message: String(error) });
        }
      }
      return { snapshots, errors, attempts };
    },
  };
}
