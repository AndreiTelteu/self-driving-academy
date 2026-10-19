// COPY diagnostic only. Inclusive nested windows, never summed as exclusive CPU.
export const STAGES = Object.freeze([
  'bytewalk',
  'parse005',
  'immutability',
  'cachehit',
  'append',
  'bridge',
  'authorityStats',
  'controllerStats',
]);
let active = false,
  observed = false,
  index = -1;
let counts = STAGES.map(() => new Float64Array(600)),
  times = STAGES.map(() => new Float64Array(600));
export const OWNED_STAGE_BYTES = 8 * 2 * 600 * 8;
export function resetStages(on = false) {
  active = false;
  observed = on;
  counts = STAGES.map(() => new Float64Array(600));
  times = STAGES.map(() => new Float64Array(600));
}
export function enterStages(on, tick) {
  observed = on;
  index = tick - 181;
  active = index >= 0 && index < 600;
}
export function recordStage(name, action) {
  if (!active) return action();
  const ordinal = STAGES.indexOf(name);
  if (ordinal < 0) throw Error('Unknown diagnostic stage');
  if (counts[ordinal][index] >= 1e7) throw Error('Diagnostic call-count bound');
  counts[ordinal][index]++;
  const start = observed ? performance.now() : 0;
  try {
    return action();
  } finally {
    if (observed) times[ordinal][index] += performance.now() - start;
  }
}
export function finishStages() {
  active = false;
  return {
    ownedBytes: OWNED_STAGE_BYTES,
    scope: 'INCLUSIVE_NESTED_NOT_ADDITIVE',
    observer: observed,
    counts: Object.fromEntries(STAGES.map((s, i) => [s, Array.from(counts[i])])),
    times: Object.fromEntries(STAGES.map((s, i) => [s, observed ? Array.from(times[i]) : null])),
  };
}
