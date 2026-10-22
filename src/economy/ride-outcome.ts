import { RIDE_TERMINAL_STATES } from '../fleet';
import type { RideRecord, RideTerminalState, RideTransition } from '../fleet';
import type { ComfortMetricsSnapshot } from '../experiments';
import { number, requireContract, text, tick } from '../sessions';
import type { LaneGraph } from '../world';
import { ECONOMY_CLOCK } from './kpi';
import type { ReviewFacts } from './reviews';

/**
 * 209 ride-outcome adapter: the real 061 terminal ride becomes the only source of the economic
 * facts of that ride.
 *
 * The adapter never scores, never stores and never reads a clock. It derives:
 *
 * - the planned trip distance from the real 060 route lanes the ride record carries
 *   (`tripRouteLaneIds`, resolved through the real 032 lane graph);
 * - the reference trip duration from the real 061 `tripCostSeconds`;
 * - the passenger presence from the real `PICKUP_COMPLETE` transition;
 * - the measured trip duration from the same transition to the terminal transition.
 *
 * A ride record whose route cannot be resolved is refused instead of being priced with an invented
 * distance, so a mis-wired graph can never silently mint revenue.
 */
export const RIDE_OUTCOME_VERSION = '209-ride-outcome-v1' as const;

export interface RideEconomicOutcome {
  readonly version: string;
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  /** Simulated customer of the request; the game never implies a real person wrote the review. */
  readonly customerId: string;
  readonly terminalState: RideTerminalState;
  readonly terminalTick: number;
  /** `true` only when the real `PICKUP_COMPLETE` transition happened before the terminal state. */
  readonly passengerAboard: boolean;
  readonly pickupTick: number | null;
  /** Planned trip distance, summed from the real 060 route lanes of the ride record. */
  readonly plannedDistanceMeters: number;
  readonly plannedDistanceSource: 'LANE_GRAPH';
  readonly routeLanes: number;
  readonly referenceTripDurationSeconds: number;
  /** Measured pickup-to-terminal duration; `null` when the passenger never boarded. */
  readonly actualTripDurationSeconds: number | null;
}

export type ReviewRideFacts = Pick<
  ReviewFacts,
  | 'rideId'
  | 'customerId'
  | 'terminalState'
  | 'terminalTick'
  | 'passengerAboard'
  | 'referenceTripDurationSeconds'
  | 'actualTripDurationSeconds'
>;

export interface RideOutcomeOptions {
  /** Real 139 read model scoped to this ride; `null` when no passenger telemetry exists. */
  readonly comfort?: ComfortMetricsSnapshot | null;
  /** Real 137 blocked seconds with the passenger aboard. */
  readonly blockedSeconds?: number;
  readonly profileVersions?: readonly string[];
  readonly preferenceSeed?: string;
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function isTerminalState(state: string): state is RideTerminalState {
  return (RIDE_TERMINAL_STATES as readonly string[]).includes(state);
}

/** The deterministic settlement event id of a ride: one terminal ride, one economic event. */
export function rideSettlementEventId(rideId: string): string {
  return `ride-settled:${text(rideId)}`;
}

/** The deterministic review event id of a ride; a reissue must pass its own explicit id. */
export function rideReviewEventId(rideId: string): string {
  return `ride-reviewed:${text(rideId)}`;
}

/** Stable simulated customer identity of one real 059 request. */
export function simulatedCustomerId(requestId: string): string {
  return `customer:${text(requestId)}`;
}

function terminalTransition(ride: RideRecord): RideTransition {
  const transitions = ride.transitions;
  requireContract(
    Array.isArray(transitions) && transitions.length > 0,
    'Ride outcome requires a real transition history',
  );
  const last = transitions[transitions.length - 1]!;
  requireContract(
    last.to === ride.state,
    'Ride outcome transition does not reach the current state',
  );
  requireContract(
    last.tick === ride.updatedTick,
    'Ride outcome terminal tick does not match the last transition',
  );
  return last;
}

function pickupTransition(ride: RideRecord): RideTransition | null {
  let found: RideTransition | null = null;
  for (const transition of ride.transitions) {
    if (transition.event !== 'PICKUP_COMPLETE') continue;
    requireContract(found === null, 'Ride outcome found two PICKUP_COMPLETE transitions');
    found = transition;
  }
  return found;
}

/** Sums the real 032 lane lengths of the planned route; a missing lane is a contract error. */
export function plannedDistanceMeters(ride: RideRecord, graph: LaneGraph): number {
  requireContract(
    typeof graph === 'object' && graph !== null && typeof graph.getDirectedPath === 'function',
    'Ride outcome requires the real lane graph',
  );
  const lanes = ride.tripRouteLaneIds;
  requireContract(
    Array.isArray(lanes) && lanes.length > 0,
    'Ride outcome requires the planned route of the real 060 assignment',
  );
  let total = 0;
  for (const laneId of lanes) {
    const path = graph.getDirectedPath(laneId);
    requireContract(path !== null, `Planned route lane is unknown to the lane graph: ${laneId}`);
    total += path.lengthM;
  }
  requireContract(
    Number.isFinite(total) && total > 0 && total <= 1_000_000,
    'Planned route distance is outside the economic contract',
  );
  return round(total);
}

/**
 * Reads the economic facts of one terminal 061 ride. The function is total over a real terminal
 * record and refuses everything else, so a caller cannot settle an open ride.
 */
export function readRideEconomicOutcome(ride: RideRecord, graph: LaneGraph): RideEconomicOutcome {
  requireContract(
    typeof ride === 'object' && ride !== null && !Array.isArray(ride),
    'Ride outcome requires a real ride record',
  );
  const state = typeof ride.state === 'string' ? ride.state : '';
  requireContract(isTerminalState(state), 'Only a terminal ride produces an economic outcome');
  requireContract(ride.terminal === true, 'Only a terminal ride produces an economic outcome');
  const last = terminalTransition(ride),
    pickup = pickupTransition(ride),
    passengerAboard = pickup !== null,
    terminalTick = tick(last.tick),
    referenceTripDurationSeconds = number(ride.tripCostSeconds, 0, 86_400);
  requireContract(last.to === state, 'Ride outcome terminal transition and ride state disagree');
  if (state === 'COMPLETED')
    requireContract(passengerAboard, 'A completed ride must have carried the passenger');
  let actualTripDurationSeconds: number | null = null;
  if (pickup !== null) {
    requireContract(
      Number.isSafeInteger(pickup.tick) && pickup.tick <= terminalTick,
      'Ride outcome pickup tick is not before the terminal tick',
    );
    actualTripDurationSeconds = round((terminalTick - tick(pickup.tick)) / ECONOMY_CLOCK.tickHz);
  }
  return Object.freeze({
    version: RIDE_OUTCOME_VERSION,
    rideId: text(ride.rideId),
    requestId: text(ride.requestId),
    taxiId: text(ride.taxiId),
    customerId: simulatedCustomerId(ride.requestId),
    terminalState: state,
    terminalTick,
    passengerAboard,
    pickupTick: pickup === null ? null : tick(pickup.tick),
    plannedDistanceMeters: plannedDistanceMeters(ride, graph),
    plannedDistanceSource: 'LANE_GRAPH' as const,
    routeLanes: ride.tripRouteLaneIds.length,
    referenceTripDurationSeconds,
    actualTripDurationSeconds,
  });
}

/** The review facts of the same terminal ride, with the optional real telemetry attached. */
export function reviewFactsForRide(
  outcome: RideEconomicOutcome,
  options: RideOutcomeOptions = {},
): ReviewFacts {
  const facts: ReviewFacts = {
    rideId: outcome.rideId,
    customerId: outcome.customerId,
    terminalState: outcome.terminalState,
    terminalTick: outcome.terminalTick,
    passengerAboard: outcome.passengerAboard,
    referenceTripDurationSeconds: outcome.referenceTripDurationSeconds,
    actualTripDurationSeconds: outcome.actualTripDurationSeconds,
    comfort: options.comfort ?? null,
    ...(options.blockedSeconds === undefined ? {} : { blockedSeconds: options.blockedSeconds }),
    ...(options.profileVersions === undefined ? {} : { profileVersions: options.profileVersions }),
    ...(options.preferenceSeed === undefined ? {} : { preferenceSeed: options.preferenceSeed }),
  };
  return Object.freeze(facts);
}
