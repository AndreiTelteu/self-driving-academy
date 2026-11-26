import { createLiveEconomyComposition } from '../../src/app';
import type { LiveEconomyComposition, LiveEconomyStepResult } from '../../src/app';
import type { LiveRideLifecycleRideView } from '../../src/fleet';
import {
  createLiveRideLifecycleFixture,
  type LiveRideLifecycleFixture,
} from '../fleet/live-ride-lifecycle-fixture';

/**
 * 266 test fixture: the real 265 lifecycle fixture plus the live economy composition.
 *
 * Every `step` first advances the real world/rides (the same call the shell makes), then feeds the
 * resulting authoritative frame to the economy port. The taxi class comes from the real 057
 * registry, so the 139 lateral capability is the vehicle's own, never a constant.
 */
export interface LiveEconomyFixtureOptions {
  readonly dwellTicks?: number;
  readonly civilianCount?: number;
  readonly seed?: number;
  readonly sampleIntervalTicks?: number;
}

export interface LiveEconomyTarget {
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly pickupAnchor: Readonly<{ x: number; y: number; z: number }>;
  readonly dropoffAnchor: Readonly<{ x: number; y: number; z: number }>;
  readonly pickupRouteLaneIds: readonly string[];
  readonly tripRouteLaneIds: readonly string[];
}

export interface LiveEconomyFixture extends LiveRideLifecycleFixture {
  readonly economy: LiveEconomyComposition;
  economyStep(): LiveEconomyStepResult;
  /** Selects the first assigned ride and returns its real target, without boarding it. */
  firstTarget(): LiveEconomyTarget;
  /** Drives the taxi to the real pickup anchor and waits for boarding. */
  board(target: LiveEconomyTarget): LiveRideLifecycleRideView;
  /** Drives the taxi to the real dropoff anchor and waits for COMPLETED. */
  complete(target: LiveEconomyTarget): LiveRideLifecycleRideView;
  ride(rideId: string): LiveRideLifecycleRideView;
}

export function createLiveEconomyFixture(
  options: LiveEconomyFixtureOptions = {},
): LiveEconomyFixture {
  const rides = createLiveRideLifecycleFixture({
    ...(options.dwellTicks === undefined ? {} : { dwellTicks: options.dwellTicks }),
    ...(options.civilianCount === undefined ? {} : { civilianCount: options.civilianCount }),
    ...(options.seed === undefined ? {} : { seed: options.seed }),
  });
  const economy = createLiveEconomyComposition({
    lifecycle: rides.composition.lifecycle.lifecycle,
    graph: rides.world.graph,
    sampleIntervalTicks: options.sampleIntervalTicks ?? 6,
  });

  const observed = () =>
    rides.frame().map((vehicle) => ({
      vehicleId: vehicle.vehicleId,
      speedMps: Math.abs(vehicle.speedMps),
      controlMode: vehicle.controlMode,
      ...(rides.ambient.registry.get(vehicle.vehicleId)?.classId === undefined
        ? {}
        : { classId: rides.ambient.registry.get(vehicle.vehicleId)!.classId }),
      ...(vehicle.headingRad === undefined ? {} : { headingRad: vehicle.headingRad }),
    }));

  const ride = (rideId: string): LiveRideLifecycleRideView => {
    const view = rides.snapshot().rides.rides.find((entry) => entry.rideId === rideId);
    if (view === undefined) throw new Error(`Missing live ride ${rideId}`);
    return view;
  };

  const fixture: LiveEconomyFixture = {
    ...rides,
    economy,
    step(atTick = rides.currentTick() + 1) {
      const result = rides.step(atTick);
      economy.step({ tick: result.tick, vehicles: observed() });
      return result;
    },
    economyStep: () => economy.step({ tick: rides.currentTick(), vehicles: observed() }),
    firstTarget(): LiveEconomyTarget {
      const assignment = rides.snapshot().live.assignments[0];
      if (assignment === undefined) throw new Error('No live assignment');
      const view = rides
        .snapshot()
        .rides.rides.find((entry) => entry.requestId === assignment.requestId);
      if (view === undefined) throw new Error('No live ride for the assignment');
      return Object.freeze({
        rideId: view.rideId,
        requestId: assignment.requestId,
        taxiId: assignment.taxiId,
        pickupAnchor: rides.anchorFor(assignment.pickupZoneId),
        dropoffAnchor: rides.anchorFor(assignment.dropoffZoneId),
        pickupRouteLaneIds: assignment.pickupRouteLaneIds,
        tripRouteLaneIds: assignment.tripRouteLaneIds,
      });
    },
    board(target): LiveRideLifecycleRideView {
      rides.driveTo(target.taxiId, target.pickupAnchor, 0);
      let tick = rides.currentTick();
      for (;;) {
        const current = ride(target.rideId);
        if (current.boardingTick !== null) return current;
        tick += 1;
        if (tick > rides.currentTick() + 400) throw new Error('Ride did not board');
        fixture.step(tick);
      }
    },
    complete(target): LiveRideLifecycleRideView {
      rides.driveTo(target.taxiId, target.dropoffAnchor, 0);
      let tick = rides.currentTick(),
        dropping = false;
      for (;;) {
        const current = ride(target.rideId);
        if (current.terminal) return current;
        if (!dropping && current.state === 'DROPOFF') dropping = true;
        tick += 1;
        if (dropping && tick > rides.currentTick() + 300) throw new Error('Ride did not complete');
        if (!dropping && tick > rides.currentTick() + 30)
          throw new Error('Ride did not reach DROPOFF');
        fixture.step(tick);
      }
    },
    ride,
    dispose(): void {
      economy.dispose();
      rides.dispose();
    },
  };
  return fixture;
}
