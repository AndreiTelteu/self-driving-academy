import type { RideState } from '../../src/fleet';
import {
  beginFirstRide,
  createRideLifecycleWorld,
  disposeRideLifecycleWorld,
} from '../fleet/ride-fsm-fixture';
import type { RideLifecycleWorld } from '../fleet/ride-fsm-fixture';
import {
  SCENARIO_SUITE_SEED,
  absoluteTolerance,
  checkExact,
  checkNumber,
  checkTrue,
  scenarioOutcome,
} from './scenario-suite-support';
import type { ScenarioCheck, ScenarioOutcome } from './scenario-suite-support';

/**
 * Rides family: the 061 ride lifecycle driven by the real 057 fleet, 059 schedule and 060 dispatch.
 *
 * The scenarios use the delivered fixture world (24 taxis, fixed window and seed) and only author
 * which real lifecycle events happen. A full ride releases the claim exactly once; a second terminal
 * event is idempotent; an illegal dropoff before pickup is refused without moving state.
 */

const PATH = ['ARRIVED_PICKUP', 'PICKUP_COMPLETE', 'ARRIVED_DROPOFF', 'DROPOFF_COMPLETE'] as const;
const EXPECTED_STATES: readonly RideState[] = Object.freeze([
  'TO_PICKUP',
  'PICKUP',
  'TO_DROPOFF',
  'DROPOFF',
  'COMPLETED',
]);

function rideFacts(world: RideLifecycleWorld, rideId: string) {
  const ride = world.lifecycle.ride(rideId);
  if (ride === undefined) throw new Error(`Ride ${rideId} is missing`);
  return ride;
}

export function runRideScenarios(): readonly ScenarioOutcome[] {
  const outcomes: ScenarioOutcome[] = [];

  // --- positive: full lifecycle -------------------------------------------------------------
  {
    const world = createRideLifecycleWorld();
    try {
      const { assignment, result } = beginFirstRide(world);
      const states: RideState[] = [result.ride.state];
      let ride = result.ride;
      for (const [index, event] of PATH.entries()) {
        const applied = world.lifecycle.apply({
          rideId: ride.rideId,
          eventId: `151:${event}`,
          event,
          tick: 11 + index,
        });
        ride = applied.ride;
        states.push(ride.state);
      }
      const final = rideFacts(world, ride.rideId);
      const stats = world.lifecycle.stats();
      const taxiStatus = world.dispatcherWorld.dispatcher.taxiStatus(assignment.taxiId);
      const releases = world.dispatcherWorld.dispatcher.releases();
      const checks: ScenarioCheck[] = [
        checkExact('ride state path', [...EXPECTED_STATES], states, 'traseul publicat de 061'),
        checkExact('ride terminal', true, final.terminal, 'DROPOFF_COMPLETE închide cursa'),
        checkExact(
          'ride terminal reason',
          null,
          final.reason,
          'o cursă completă nu are motiv de eșec',
        ),
        checkNumber(
          'ride transitions',
          5,
          final.transitions.length,
          absoluteTolerance(0, 'tranziții', 'numărul de tranziții este exact'),
          'created + patru evenimente de traseu',
        ),
        checkExact(
          'release reason',
          'COMPLETED',
          final.release?.reason,
          'claim-ul 060 este eliberat',
        ),
        checkNumber(
          'release tick',
          14,
          final.release?.tick ?? Number.NaN,
          absoluteTolerance(0, 'tick', 'tick-ul este exact'),
          'ultimul eveniment este aplicat la tick 14',
        ),
        checkNumber(
          'dispatcher releases',
          1,
          releases.length,
          absoluteTolerance(0, 'eliberări', 'o singură eliberare pentru o cursă'),
          'claim-ul este eliberat exact o dată',
        ),
        checkExact(
          'taxi status after ride',
          'AVAILABLE',
          taxiStatus,
          'taxiul reintră în dispecerat',
        ),
        checkTrue(
          'taxi available again',
          world.dispatcherWorld.dispatcher.availableTaxis().includes(assignment.taxiId),
          assignment.taxiId,
          'taxiul poate primi o cursă nouă',
        ),
        checkNumber(
          'lifecycle completed',
          1,
          stats.completed,
          absoluteTolerance(0, 'curse', 'contorul este exact'),
          'o cursă finalizată',
        ),
        checkNumber(
          'lifecycle active',
          0,
          stats.active,
          absoluteTolerance(0, 'curse', 'contorul este exact'),
          'nicio cursă activă după terminal',
        ),
      ];
      outcomes.push(
        scenarioOutcome({
          id: 'rides-full-lifecycle',
          family: 'RIDES',
          polarity: 'POSITIVE',
          title: 'O cursă completă trece pickup, dropoff și eliberează taxiul o singură dată',
          contract: '061-ride-fsm-v1 + 060 dispatcher claim',
          seed: SCENARIO_SUITE_SEED,
          steps: PATH.length + 1,
          input: {
            events: [...PATH],
            startTick: 10,
            taxiId: assignment.taxiId,
            pickupZoneId: assignment.pickupZoneId,
          },
          expected: {
            states: [...EXPECTED_STATES],
            transitions: 5,
            releases: 1,
            taxiStatus: 'AVAILABLE',
            completed: 1,
          },
          actual: {
            states,
            transitions: final.transitions.length,
            releases: releases.length,
            taxiStatus,
            completed: stats.completed,
          },
          checks,
          note: 'Cursa folosește dispeceratul real și eliberează claim-ul exact la tick-ul terminal.',
        }),
      );
    } finally {
      disposeRideLifecycleWorld(world);
    }
  }

  // --- positive: idempotent terminal event --------------------------------------------------
  {
    const world = createRideLifecycleWorld();
    try {
      const { result } = beginFirstRide(world);
      let ride = result.ride;
      for (const [index, event] of PATH.entries()) {
        ride = world.lifecycle.apply({
          rideId: ride.rideId,
          eventId: `151:replay:${event}`,
          event,
          tick: 11 + index,
        }).ride;
      }
      const replay = world.lifecycle.apply({
        rideId: ride.rideId,
        eventId: '151:replay:DROPOFF_COMPLETE',
        event: 'DROPOFF_COMPLETE',
        tick: 14,
      });
      const stats = world.lifecycle.stats();
      outcomes.push(
        scenarioOutcome({
          id: 'rides-duplicate-terminal-event',
          family: 'RIDES',
          polarity: 'POSITIVE',
          title: 'Rejucarea evenimentului terminal este idempotentă și nu dublează recompensa',
          contract: '061-ride-fsm-v1 (idempotență pe eventId)',
          seed: SCENARIO_SUITE_SEED,
          steps: PATH.length + 2,
          input: {
            events: [...PATH, 'DROPOFF_COMPLETE'],
            duplicateEventId: '151:replay:DROPOFF_COMPLETE',
            taxiId: result.ride.taxiId,
          },
          expected: { duplicate: true, releases: 1, completed: 1, transitions: 5 },
          actual: {
            duplicate: replay.duplicate,
            releases: stats.releases,
            completed: stats.completed,
            transitions: ride.transitions.length,
          },
          checks: [
            checkExact(
              'duplicate flagged',
              true,
              replay.duplicate,
              'al doilea terminal este marcat duplicat',
            ),
            checkNumber(
              'duplicate releases',
              1,
              stats.releases,
              absoluteTolerance(0, 'eliberări', 'un singur claim eliberat'),
              'idempotența nu eliberează de două ori',
            ),
            checkNumber(
              'duplicate completed',
              1,
              stats.completed,
              absoluteTolerance(0, 'curse', 'contorul este exact'),
              'cursa este numărată o singură dată',
            ),
            checkNumber(
              'duplicate transitions',
              5,
              ride.transitions.length,
              absoluteTolerance(0, 'tranziții', 'istoricul nu crește'),
              'istoricul rămâne cel al primei execuții',
            ),
          ],
          note: 'Același eventId este respins ca duplicat, fără o a doua scriere în dispecerat.',
        }),
      );
    } finally {
      disposeRideLifecycleWorld(world);
    }
  }

  // --- negative: illegal transition ---------------------------------------------------------
  {
    const world = createRideLifecycleWorld();
    try {
      const { assignment, result } = beginFirstRide(world);
      let message = '';
      try {
        world.lifecycle.apply({
          rideId: result.ride.rideId,
          eventId: '151:illegal:DROPOFF_COMPLETE',
          event: 'DROPOFF_COMPLETE',
          tick: 11,
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      const ride = rideFacts(world, result.ride.rideId);
      const stats = world.lifecycle.stats();
      const taxiStatus = world.dispatcherWorld.dispatcher.taxiStatus(assignment.taxiId);
      outcomes.push(
        scenarioOutcome({
          id: 'rides-illegal-dropoff-before-pickup',
          family: 'RIDES',
          polarity: 'NEGATIVE',
          title: 'Dropoff-ul înainte de pickup este refuzat fără a muta starea sau claim-ul',
          contract: '061-ride-fsm-v1 (tabel de tranziții)',
          seed: SCENARIO_SUITE_SEED,
          steps: 2,
          input: {
            event: 'DROPOFF_COMPLETE',
            fromState: 'TO_PICKUP',
            tick: 11,
          },
          expected: {
            refused: true,
            message: 'Illegal ride transition',
            state: 'TO_PICKUP',
            transitions: 1,
            releases: 0,
            taxiStatus: 'ASSIGNED',
          },
          actual: {
            refused: message.includes('Illegal ride transition'),
            message,
            state: ride.state,
            transitions: ride.transitions.length,
            releases: stats.releases,
            taxiStatus,
          },
          checks: [
            checkTrue(
              'illegal transition refused',
              message.includes('Illegal ride transition'),
              message,
              'FSM-ul aruncă un refuz explicit',
            ),
            checkExact('state unchanged', 'TO_PICKUP', ride.state, 'starea rămâne cea de dinainte'),
            checkNumber(
              'history unchanged',
              1,
              ride.transitions.length,
              absoluteTolerance(0, 'tranziții', 'istoricul nu primește o tranziție refuzată'),
              'doar tranziția de assign este în istoric',
            ),
            checkNumber(
              'no release on refusal',
              0,
              stats.releases,
              absoluteTolerance(0, 'eliberări', 'un refuz nu eliberează claim-ul'),
              'taxiul rămâne alocat cursei',
            ),
            checkExact('taxi still assigned', 'ASSIGNED', taxiStatus, 'claim-ul 060 rămâne activ'),
          ],
          note: 'Un eveniment ilegal nu produce stare parțială și nu eliberează taxiul.',
        }),
      );
    } finally {
      disposeRideLifecycleWorld(world);
    }
  }

  return Object.freeze(outcomes);
}
