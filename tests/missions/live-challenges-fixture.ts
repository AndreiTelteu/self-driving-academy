import {
  createLiveChallenges,
  type LiveChallengeFrameFact,
  type LiveChallengeOptions,
  type LiveChallengeStorage,
  type LiveChallengeVehicleFact,
  type LiveChallengeZoneFact,
  type LiveChallenges,
} from '../../src/app';
import { createPlayerProgress } from '../../src/missions';
import type {
  ChallengeAssignmentEcho,
  ChallengeRoutePort,
  ChallengeSessionKind,
  DailyCalendarInput,
  PlayerProgress,
} from '../../src/missions';
import type { ChallengeZoneKind } from '../../src/missions';

/**
 * Deterministic 277 fixture: a 16-zone grid over fake 032-shaped polygons, one mutable authoritative
 * taxi and the real 213 ledger. Nothing here reads a clock, a browser or a random source.
 */

export const LIVE_FIXTURE_SESSION = 'session:277:fixture' as const;
export const LIVE_FIXTURE_EPOCH = 1 as const;
export const LIVE_FIXTURE_TAXI = 'taxi:277' as const;
export const LIVE_FIXTURE_NOW = 1_760_000_000_000;

const ROLE_SEQUENCE: readonly ChallengeZoneKind[] = Object.freeze([
  'PARKING',
  'CHECKPOINT',
  'CHECKPOINT',
  'CHECKPOINT',
  'TOILET',
  'TOILET',
  'TOILET',
  'LANDMARK',
  'LANDMARK',
  'DRIFT_PAD',
  'DEMOLITION_ALLEY',
  'CHECKPOINT',
  'CHECKPOINT',
  'CHECKPOINT',
  'LANDMARK',
  'LANDMARK',
]);

function polygonFor(x: number, z: number): readonly Readonly<{ x: number; z: number }>[] {
  const half = 8;
  return Object.freeze([
    Object.freeze({ x: x - half, z: z - half }),
    Object.freeze({ x: x + half, z: z - half }),
    Object.freeze({ x: x + half, z: z + half }),
    Object.freeze({ x: x - half, z: z + half }),
  ]);
}

export const LIVE_FIXTURE_ZONES: readonly LiveChallengeZoneFact[] = Object.freeze(
  Array.from({ length: 16 }, (_, index) => {
    const x = index * 20;
    return Object.freeze({
      zoneId: `zone:${String(index).padStart(2, '0')}`,
      kind: ROLE_SEQUENCE[index]!,
      anchorM: Object.freeze({ x, z: 0 }),
      polygonM: polygonFor(x, 0),
      laneId: `lane:${index}`,
      headingRad: 0,
    });
  }),
);

export const LIVE_FIXTURE_CALENDAR: DailyCalendarInput = Object.freeze({
  timeZone: 'Europe/Bucharest',
  observedAtMs: LIVE_FIXTURE_NOW,
  utcOffsetSeconds: 7_200,
  dayLengthSeconds: 86_400,
});

export interface LiveChallengeFrameState {
  tick: number;
  sessionId: string;
  worldEpoch: number;
  sessionKind: ChallengeSessionKind;
  playerVehicleId: string | null;
  selectedVehicleId: string | null;
  taxiId: string;
  positionM: { x: number; z: number };
  yawRad: number;
  speedMps: number;
  laneId: string | null;
  controlMode: 'MANUAL' | 'LEARNING' | 'AUTO';
  status: 'AVAILABLE' | 'ASSIGNED' | 'BLOCKED' | 'DAMAGED' | 'OFFLINE';
  passengerAboard: boolean;
  assignment: ChallengeAssignmentEcho | null;
  freeTaxis: number;
}

export function liveFixtureFrameState(
  overrides: Partial<LiveChallengeFrameState> = {},
): LiveChallengeFrameState {
  return {
    tick: 0,
    sessionId: LIVE_FIXTURE_SESSION,
    worldEpoch: LIVE_FIXTURE_EPOCH,
    sessionKind: 'ACADEMY',
    playerVehicleId: LIVE_FIXTURE_TAXI,
    selectedVehicleId: LIVE_FIXTURE_TAXI,
    taxiId: LIVE_FIXTURE_TAXI,
    positionM: { x: 0, z: 0 },
    yawRad: 0,
    speedMps: 0,
    laneId: 'lane:0',
    controlMode: 'MANUAL',
    status: 'AVAILABLE',
    passengerAboard: false,
    assignment: null,
    freeTaxis: 3,
    ...overrides,
  };
}

export interface LiveChallengeHarness {
  readonly live: LiveChallenges;
  readonly state: LiveChallengeFrameState;
  readonly ledger: PlayerProgress;
  readonly storage: LiveChallengeStorage;
  readonly route: { seconds: number; reachable: boolean; calls: number };
  setPassenger(aboard: boolean): void;
  setAssignment(assignment: ChallengeAssignmentEcho | null): void;
  zone(id: string): LiveChallengeZoneFact;
  moveToZone(id: string): void;
  moveTo(x: number, z: number): void;
  setYaw(yaw: number): void;
  setSpeed(speed: number): void;
  step(ticks?: number): void;
  offer(templateId: string, seed?: number): string | null;
  completeParking(templateId?: string): ReturnType<LiveChallenges['read']>;
  dispose(): void;
}

export interface LiveChallengeHarnessOptions {
  readonly sessionKind?: ChallengeSessionKind;
  readonly storage?: LiveChallengeStorage;
  readonly routeSeconds?: number;
  readonly routeReachable?: boolean;
  readonly ledger?: PlayerProgress;
  readonly offersAllowed?: boolean;
  readonly seed?: number;
}

export function memoryLiveChallengeStorage(): LiveChallengeStorage & { value: string | null } {
  const box = {
    value: null as string | null,
    load: () => box.value,
    save: (value: string) => {
      box.value = value;
    },
    clear: () => {
      box.value = null;
    },
  };
  return box;
}

export function createLiveChallengeHarness(
  options: LiveChallengeHarnessOptions = {},
): LiveChallengeHarness {
  const sessionKind = options.sessionKind ?? 'ACADEMY';
  const state = liveFixtureFrameState({ sessionKind });
  const ledger = options.ledger ?? createPlayerProgress({ playerId: 'player:277' });
  const route = {
    seconds: options.routeSeconds ?? 20,
    reachable: options.routeReachable ?? true,
    calls: 0,
  };
  const storage = options.storage ?? memoryLiveChallengeStorage();
  const frame = (): LiveChallengeFrameFact => {
    const vehicle: LiveChallengeVehicleFact = Object.freeze({
      vehicleId: state.taxiId,
      driverKind: 'TAXI' as const,
      laneId: state.laneId,
      positionM: Object.freeze({ ...state.positionM }),
      yawRad: state.yawRad,
      speedMps: state.speedMps,
      controlMode: state.controlMode,
      classId: 'sedan',
      status: state.status,
      passengerAboard: state.passengerAboard,
    });
    return Object.freeze({
      tick: state.tick,
      paused: false,
      playerVehicleId: state.playerVehicleId,
      selectedVehicleId: state.selectedVehicleId,
      vehicles: Object.freeze([vehicle]),
      assignment: state.assignment,
      freeTaxis: state.freeTaxis,
    });
  };
  const routePort: ChallengeRoutePort = Object.freeze({
    estimate() {
      route.calls += 1;
      return Object.freeze({
        reachable: route.reachable,
        seconds: route.seconds,
        graphVersion: 'fixture-277-graph',
      });
    },
  });
  const live = createLiveChallenges({
    sessionId: state.sessionId,
    worldEpoch: state.worldEpoch,
    sessionKind,
    playerId: 'player:277',
    seed: options.seed ?? 277,
    timeZone: LIVE_FIXTURE_CALENDAR.timeZone,
    ledger,
    storage,
    now: () => LIVE_FIXTURE_NOW,
    calendar: () => LIVE_FIXTURE_CALENDAR,
    ports: {
      frame,
      zones: () => LIVE_FIXTURE_ZONES,
      route: routePort,
      offersAllowed: () => options.offersAllowed ?? false,
      campaignCompleted: () => 0,
      vehicleClasses: () => ['sedan'],
    },
  } satisfies LiveChallengeOptions);
  live.beginSession({
    sessionId: state.sessionId,
    worldEpoch: state.worldEpoch,
    sessionKind,
    tick: state.tick,
  });
  const zone = (id: string): LiveChallengeZoneFact => {
    const found = LIVE_FIXTURE_ZONES.find((entry) => entry.zoneId === id);
    if (found === undefined) throw new Error(`Missing fixture zone ${id}`);
    return found;
  };
  const moveToZone = (id: string): void => {
    const target = zone(id);
    state.positionM = { x: target.anchorM.x, z: target.anchorM.z };
    state.laneId = target.laneId;
    state.yawRad = target.headingRad;
  };
  return {
    live,
    state,
    ledger,
    storage,
    route,
    setPassenger: (aboard) => {
      state.passengerAboard = aboard;
    },
    setAssignment: (assignment) => {
      state.assignment = assignment;
    },
    zone,
    moveToZone,
    moveTo: (x, z) => {
      state.positionM = { x, z };
      state.laneId = null;
    },
    setYaw: (yaw) => {
      state.yawRad = yaw;
    },
    setSpeed: (speed) => {
      state.speedMps = speed;
    },
    step: (ticks = 1) => {
      for (let index = 0; index < ticks; index += 1) {
        state.tick += 1;
        live.step({ tick: state.tick });
      }
    },
    offer: (templateId, seed = 277) => {
      const instance = live.offerNow({ templateId, seed });
      return instance?.instanceId ?? null;
    },
    completeParking: (templateId = 'challenge-valet-with-style') => {
      moveToZone('zone:00');
      state.speedMps = 0;
      state.yawRad = 0;
      const offer = live.offerNow({ templateId, seed: 277 });
      if (offer === null) throw new Error('The parking offer was refused');
      const accepted = live.accept();
      if (accepted.status !== 'ACCEPTED') throw new Error(`Accept failed: ${accepted.status}`);
      for (let index = 0; index < 120; index += 1) {
        state.tick += 1;
        live.step({ tick: state.tick });
      }
      return live.read();
    },
    dispose: () => live.dispose(),
  };
}
