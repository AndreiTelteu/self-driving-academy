/**
 * PBI 272 — the live composition adapter for the telemetry writer.
 *
 * It joins exactly two already-authoritative owners and adds no simulation:
 *   - the V3 composition frame (the accepted vehicles, their pose/speed/lane/class and the accepted
 *     raw intent + filtered player command);
 *   - the 271 live 069 segment read model (the exact segment id, mode, profile and eligibility).
 *
 * The adapter opens the 085 segment when the 271 owner opens a real MANUAL/LEARNING segment and
 * closes it with the same 069 close reason. It never invents a mode, a segment, a sample, an
 * opportunity outcome, a learning job or a profile publication.
 */
import type { ContractContext } from '../sessions';
import {
  createLiveTelemetry,
  LIVE_TELEMETRY_VERSION,
  type LiveTelemetry,
  type LiveTelemetryRecoveryInput,
  type LiveTelemetrySegmentRead,
  type LiveTelemetryReadModel,
  type LiveTelemetryFollowEpisode,
  type LiveTelemetryStats,
  type LiveTelemetryWorldQuery,
  type LiveWorldSample,
} from '../telemetry';
import type { CompositionFrame } from './walking-composition';
import type { LiveModeSegments, LiveModeSegmentView } from './live-three-modes';
import type { LaneGraph, RoadMap } from '../world';

export const LIVE_TELEMETRY_COMPOSITION_VERSION = '272-live-telemetry-composition-v1' as const;

export type LiveTelemetryCloseReason =
  | 'RETURN_TO_AUTO'
  | 'MODE_CHANGE'
  | 'VEHICLE_SWITCH'
  | 'SESSION_CHANGE'
  | 'WORLD_RESET'
  | 'SHUTDOWN';

export interface LiveTelemetryCompositionOptions {
  readonly context: ContractContext;
  readonly map: RoadMap;
  readonly graph: LaneGraph;
  readonly playerId: string;
  /** The same 271 owner attached to the composition; never a second segment store. */
  readonly modeSegments: () => LiveModeSegments | undefined;
  readonly inputType?: 'KEYBOARD' | 'GAMEPAD';
  readonly capacity?: number;
  readonly retainedSegments?: number;
  readonly worldCapacity?: number;
  readonly maxOpportunities?: number;
  readonly maxWindows?: number;
  readonly maxArtifactWindows?: number;
  readonly dedupeEntries?: number;
}

export interface LiveTelemetryCompositionRead extends LiveTelemetryReadModel {
  readonly compositionVersion: typeof LIVE_TELEMETRY_COMPOSITION_VERSION;
}

export interface LiveTelemetryComposition {
  readonly version: typeof LIVE_TELEMETRY_COMPOSITION_VERSION;
  readonly telemetryVersion: typeof LIVE_TELEMETRY_VERSION;
  step(frame: CompositionFrame): void;
  noteSuspension(cause: 'PAUSE' | 'FOCUS_LOST', tick: number): void;
  noteResume(tick: number): void;
  noteRecovery(fact: LiveTelemetryRecoveryInput): void;
  retire(reason: LiveTelemetryCloseReason): void;
  read(): LiveTelemetryCompositionRead;
  readClosedSegment(segmentId: string): LiveTelemetrySegmentRead | null;
  readWorldSamples(query?: LiveTelemetryWorldQuery): readonly LiveWorldSample[];
  readFollowEpisodes(): readonly LiveTelemetryFollowEpisode[];
  learningExposure(): Readonly<{
    workspace: 'TELEMETRY_272';
    eligible: boolean;
    closedSegments: number;
    profilePublications: 0;
    jobs: 0;
  }>;
  getStats(): LiveTelemetryStats;
  dispose(): void;
}

const closeReasons: readonly LiveTelemetryCloseReason[] = Object.freeze([
  'RETURN_TO_AUTO',
  'MODE_CHANGE',
  'VEHICLE_SWITCH',
  'SESSION_CHANGE',
  'WORLD_RESET',
  'SHUTDOWN',
]);

function closeReasonOf(value: string | null): LiveTelemetryCloseReason {
  return value !== null && (closeReasons as readonly string[]).includes(value)
    ? (value as LiveTelemetryCloseReason)
    : 'MODE_CHANGE';
}

function segmentDescriptor(
  segment: LiveModeSegmentView,
  frame: CompositionFrame,
  inputType: 'KEYBOARD' | 'GAMEPAD',
): Parameters<LiveTelemetry['openSegment']>[0] {
  const vehicle = frame.vehicles.find((candidate) => candidate.vehicleId === segment.vehicleId);
  const classId = segment.context?.classId ?? vehicle?.classId ?? 'sedan';
  return Object.freeze({
    segmentId: segment.segmentId,
    vehicleId: segment.vehicleId,
    classId,
    controlMode: segment.mode,
    profileId: segment.profileId,
    baseVersionId: segment.baseVersionId,
    learningEpoch: segment.learningEpoch,
    learningEligible: segment.learningEligible,
    inputType,
    startTick: segment.startTick,
  });
}

export function createLiveTelemetryComposition(
  options: LiveTelemetryCompositionOptions,
): LiveTelemetryComposition {
  if (options === null || typeof options !== 'object')
    throw new Error('Live telemetry composition requires options.');
  const inputType = options.inputType ?? 'KEYBOARD';
  const core = createLiveTelemetry({
    context: options.context,
    playerId: options.playerId,
    map: options.map,
    graph: options.graph,
    ...(options.capacity === undefined ? {} : { capacity: options.capacity }),
    ...(options.retainedSegments === undefined
      ? {}
      : { retainedSegments: options.retainedSegments }),
    ...(options.worldCapacity === undefined ? {} : { worldCapacity: options.worldCapacity }),
    ...(options.maxOpportunities === undefined
      ? {}
      : { maxOpportunities: options.maxOpportunities }),
    ...(options.maxWindows === undefined ? {} : { maxWindows: options.maxWindows }),
    ...(options.maxArtifactWindows === undefined
      ? {}
      : { maxArtifactWindows: options.maxArtifactWindows }),
    ...(options.dedupeEntries === undefined ? {} : { dedupeEntries: options.dedupeEntries }),
  });
  let openSegmentId: string | null = null;
  let disposed = false;

  const syncSegment = (frame: CompositionFrame): void => {
    if (disposed) return;
    let state: ReturnType<LiveModeSegments['observe']> | null = null;
    try {
      state = options.modeSegments()?.observe() ?? null;
    } catch {
      state = null;
    }
    const active = state?.active ?? null;
    if (active !== null) {
      if (openSegmentId === active.segmentId) return;
      if (openSegmentId !== null) {
        core.closeSegment(closeReasonOf(state?.lastClosed?.closeReason ?? null));
      }
      core.openSegment(segmentDescriptor(active, frame, inputType));
      openSegmentId = active.segmentId;
      return;
    }
    if (openSegmentId === null) return;
    const closed = state?.lastClosed;
    core.closeSegment(closeReasonOf(closed?.closeReason ?? null));
    openSegmentId = null;
  };

  return Object.freeze({
    version: LIVE_TELEMETRY_COMPOSITION_VERSION,
    telemetryVersion: LIVE_TELEMETRY_VERSION,
    step(frame: CompositionFrame): void {
      if (disposed) return;
      syncSegment(frame);
      const playerVehicleId = frame.playerVehicleId;
      const intent = playerVehicleId === null ? null : frame.inputIntent;
      const exactCommand =
        playerVehicleId !== null &&
        frame.vehicleCommand !== null &&
        frame.vehicleCommand.vehicleId === playerVehicleId
          ? frame.vehicleCommand
          : null;
      const raw =
        intent === null
          ? undefined
          : Object.freeze({
              throttle: Math.max(0, Math.min(1, intent.forward)),
              brake: Math.max(0, Math.min(1, -intent.forward)),
              steering: Math.max(-1, Math.min(1, intent.turn)),
              handbrake: intent.handbrake,
            });
      const command =
        exactCommand === null
          ? undefined
          : Object.freeze({
              throttle: exactCommand.throttle,
              brake: exactCommand.brake,
              steering: exactCommand.steering,
              handbrake: exactCommand.handbrake,
              turnSignal: exactCommand.turnSignal,
              source: exactCommand.source,
            });
      const vehicles = frame.vehicles.map((vehicle) =>
        Object.freeze({
          tick: frame.tick,
          vehicleId: vehicle.vehicleId,
          driverKind: vehicle.driverKind,
          classId: vehicle.classId,
          controlMode: vehicle.controlMode,
          incarnation: `${vehicle.vehicleId}:live`,
          positionM: vehicle.positionM,
          yawRad: vehicle.yawRad,
          speedMps: vehicle.speedMps,
          laneId: vehicle.laneId,
          speedLimitMps: vehicle.speedLimitMps,
          appliedProfileVersion: vehicle.appliedProfileVersion,
          maneuverState: vehicle.maneuverState,
          ...(vehicle.vehicleId === playerVehicleId && raw !== undefined ? { raw } : {}),
          ...(vehicle.vehicleId === playerVehicleId && command !== undefined ? { command } : {}),
        }),
      );
      core.step({
        tick: frame.tick,
        vehicles,
        camera: Object.freeze({
          positionM: Object.freeze({
            x: frame.camera.positionM.x,
            y: frame.camera.positionM.y,
            z: frame.camera.positionM.z,
          }),
          lookAtM: Object.freeze({
            x: frame.camera.lookAtM.x,
            y: frame.camera.lookAtM.y,
            z: frame.camera.lookAtM.z,
          }),
          up: Object.freeze({
            x: frame.camera.up.x,
            y: frame.camera.up.y,
            z: frame.camera.up.z,
          }),
          fovRadians: frame.camera.fovRadians,
        }),
      });
    },
    noteSuspension(cause: 'PAUSE' | 'FOCUS_LOST', tick: number): void {
      if (disposed) return;
      core.noteSuspension({ tick, cause });
    },
    noteResume(tick: number): void {
      if (disposed) return;
      core.noteResume(tick);
    },
    noteRecovery(fact: LiveTelemetryRecoveryInput): void {
      if (disposed) return;
      core.noteRecovery(fact);
    },
    retire(reason: LiveTelemetryCloseReason): void {
      if (disposed) return;
      if (openSegmentId === null) return;
      core.closeSegment(reason);
      openSegmentId = null;
    },
    read(): LiveTelemetryCompositionRead {
      return Object.freeze({
        ...core.read(),
        compositionVersion: LIVE_TELEMETRY_COMPOSITION_VERSION,
      });
    },
    readClosedSegment(segmentId: string): LiveTelemetrySegmentRead | null {
      if (disposed) return null;
      return core.readClosedSegment(segmentId);
    },
    readWorldSamples(query?: LiveTelemetryWorldQuery): readonly LiveWorldSample[] {
      if (disposed) return Object.freeze([]);
      return core.readWorldSamples(query);
    },
    readFollowEpisodes() {
      if (disposed) return Object.freeze([]);
      return core.readFollowEpisodes();
    },
    learningExposure() {
      if (disposed)
        return Object.freeze({
          workspace: 'TELEMETRY_272' as const,
          eligible: false,
          closedSegments: 0,
          profilePublications: 0 as const,
          jobs: 0 as const,
        });
      const model = core.read();
      return Object.freeze({
        workspace: 'TELEMETRY_272' as const,
        eligible: model.learning.eligible,
        closedSegments: model.learning.closedSegments,
        profilePublications: 0 as const,
        jobs: 0 as const,
      });
    },
    getStats(): LiveTelemetryStats {
      return core.getStats();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      try {
        if (openSegmentId !== null) core.closeSegment('SHUTDOWN');
      } finally {
        openSegmentId = null;
        core.dispose();
      }
    },
  });
}
