import { number } from '../sessions';
export interface PriorityArrival {
  readonly state: 'APPROACHING' | 'OCCUPYING' | 'CLEARED' | 'STATIONARY';
  readonly timeToEntryS: number | null;
  readonly timeToExitS: number | null;
}
/** Signed route distance metres / nonnegative speed metres-per-second. null is not zero. */
export function predictPriorityArrival(
  distanceM: number,
  clearanceM: number,
  speedMps: number,
): PriorityArrival {
  number(distanceM, -1e6, 1e6);
  number(clearanceM, 0.001, 100);
  number(speedMps, 0, 100);
  if (distanceM + clearanceM <= 0)
    return Object.freeze({ state: 'CLEARED', timeToEntryS: null, timeToExitS: null });
  if (distanceM <= 0)
    return Object.freeze({
      state: 'OCCUPYING',
      timeToEntryS: 0,
      timeToExitS: speedMps > 0.01 ? (distanceM + clearanceM) / speedMps : null,
    });
  if (speedMps <= 0.01)
    return Object.freeze({ state: 'STATIONARY', timeToEntryS: null, timeToExitS: null });
  return Object.freeze({
    state: 'APPROACHING',
    timeToEntryS: distanceM / speedMps,
    timeToExitS: (distanceM + clearanceM) / speedMps,
  });
}
