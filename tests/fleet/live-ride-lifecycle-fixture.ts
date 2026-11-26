import {
  createAmbientTraffic,
  createCompositionWorld,
  createLiveRideComposition,
} from '../../src/app';
import type { LiveRideComposition, LiveRideCompositionSnapshot } from '../../src/app';
import { createLiveRides } from '../../src/fleet';
import type { LiveRides, LiveRideObservedVehicle } from '../../src/fleet';

export interface LiveRideLifecycleFixtureOptions {
  readonly dwellTicks?: number;
  readonly tickRateHz?: number;
  readonly speedThresholdMps?: number;
  readonly taxiCount?: number;
  readonly civilianCount?: number;
  readonly seed?: number;
}

export interface LiveRidePositionOverride {
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly speedMps: number;
}

export interface LiveRideLifecycleFixture {
  readonly world: ReturnType<typeof createCompositionWorld>;
  readonly ambient: ReturnType<typeof createAmbientTraffic>;
  readonly live: LiveRides;
  readonly composition: LiveRideComposition;
  readonly player: { value: string | null };
  readonly blocked: Set<string>;
  readonly overrides: Map<string, LiveRidePositionOverride>;
  currentTick(): number;
  frame(): readonly LiveRideObservedVehicle[];
  step(atTick?: number): ReturnType<LiveRideComposition['step']>;
  runTo(target: number): void;
  snapshot(): LiveRideCompositionSnapshot;
  anchorFor(zoneId: string): Readonly<{ x: number; y: number; z: number }>;
  driveTo(
    taxiId: string,
    positionM: Readonly<{ x: number; y: number; z: number }>,
    speedMps?: number,
  ): void;
  clearOverride(taxiId: string): void;
  takeover(taxiId: string, mode?: 'MANUAL' | 'LEARNING'): void;
  releasePlayer(): void;
  dispose(): void;
}

export const LIFECYCLE_CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'session-265-lifecycle',
  worldEpoch: 1,
});

export function createLiveRideLifecycleFixture(
  options: LiveRideLifecycleFixtureOptions = {},
): LiveRideLifecycleFixture {
  const world = createCompositionWorld();
  const ambient = createAmbientTraffic({
    map: world.map,
    graph: world.graph,
    context: LIFECYCLE_CONTEXT,
    seed: options.seed ?? 262,
    taxiCount: options.taxiCount ?? 24,
    civilianCount: options.civilianCount ?? 20,
    focus: { x: world.spawn.x, z: world.spawn.z },
  });
  const live = createLiveRides({
    registry: ambient.registry,
    map: world.map,
    graph: world.graph,
    seed: ambient.seed,
    scenarioId: 'v3-live-city-265-fixture',
    namespace: 'test:265:rides',
    keepPlayerClaims: true,
  });
  const composition = createLiveRideComposition({
    live,
    map: world.map,
    graph: world.graph,
    actors: ambient.traffic,
    sessionId: LIFECYCLE_CONTEXT.sessionId,
    worldEpoch: LIFECYCLE_CONTEXT.worldEpoch,
    ...(options.dwellTicks === undefined ? {} : { dwellTicks: options.dwellTicks }),
    ...(options.tickRateHz === undefined ? {} : { tickRateHz: options.tickRateHz }),
    ...(options.speedThresholdMps === undefined
      ? {}
      : { speedThresholdMps: options.speedThresholdMps }),
  });
  const player: { value: string | null } = { value: null };
  const blocked = new Set<string>();
  const overrides = new Map<string, LiveRidePositionOverride>();
  let tick = 0;

  const frame = (): readonly LiveRideObservedVehicle[] =>
    ambient.list().map((actor) => {
      const override = overrides.get(actor.vehicleId);
      return Object.freeze({
        vehicleId: actor.vehicleId,
        driverKind: actor.driverKind,
        laneId: actor.laneId,
        blocked: blocked.has(actor.vehicleId) || actor.blocked,
        controlMode: actor.authority,
        positionM: override?.positionM ?? actor.positionM,
        speedMps: override?.speedMps ?? actor.speedMps,
        headingRad: actor.headingRad,
      });
    });

  return {
    world,
    ambient,
    live,
    composition,
    player,
    blocked,
    overrides,
    currentTick: () => tick,
    frame,
    step(atTick = tick + 1): ReturnType<LiveRideComposition['step']> {
      if (atTick <= tick) throw new Error(`Fixture tick ${atTick} after ${tick}`);
      ambient.traffic.step({ tick: atTick, dtSeconds: 1 / 60, vehicles: [] });
      tick = atTick;
      return composition.step({ tick: atTick, vehicles: frame(), playerVehicleId: player.value });
    },
    runTo(target: number): void {
      while (tick < target) this.step(tick + 1);
    },
    snapshot: () => composition.snapshot(),
    anchorFor(zoneId: string): Readonly<{ x: number; y: number; z: number }> {
      const zone = world.map.serviceZones.find((entry) => entry.id === zoneId);
      if (zone === undefined) throw new Error(`Unknown service zone ${zoneId}`);
      const anchor = world.map.geometry.nodes.find((node) => node.id === zone.anchorNodeId);
      if (anchor === undefined) throw new Error(`Missing anchor for ${zoneId}`);
      return anchor.positionM;
    },
    driveTo(taxiId, positionM, speedMps = 0): void {
      overrides.set(
        taxiId,
        Object.freeze({ positionM: Object.freeze({ ...positionM }), speedMps }),
      );
    },
    clearOverride(taxiId: string): void {
      overrides.delete(taxiId);
    },
    takeover(taxiId: string, mode: 'MANUAL' | 'LEARNING' = 'MANUAL'): void {
      ambient.traffic.setAuthority(taxiId, mode, tick);
      player.value = taxiId;
    },
    releasePlayer(): void {
      if (player.value === null) return;
      ambient.traffic.setAuthority(player.value, 'AUTO', tick);
      player.value = null;
    },
    dispose(): void {
      composition.dispose();
      live.dispose();
      ambient.dispose();
    },
  };
}

export const FIXTURE_CONTEXT = LIFECYCLE_CONTEXT;
