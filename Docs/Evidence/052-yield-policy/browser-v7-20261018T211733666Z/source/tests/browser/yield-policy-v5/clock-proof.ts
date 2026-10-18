/** Pure draft. Actual owner reads supply counters; no target tick is a counter. */
export interface NativeCounter {
  nativeSerial: number;
  controllerTick: number;
}
export interface ClockPoint extends NativeCounter {
  timeMs: number;
}
export interface RafPoint extends ClockPoint {
  observedAtMs: number;
}
export interface DualClockProof {
  phaseEntry: ClockPoint;
  phaseCompletion: ClockPoint;
  previousRaf: RafPoint;
  nativePhaseRatio: number;
  matchedRafRatio: number;
}
const check = (value: boolean, message: string) => {
  if (!value) throw new Error(message);
};
export function validateCounter(value: NativeCounter) {
  check(
    Number.isSafeInteger(value.nativeSerial) &&
      Number.isSafeInteger(value.controllerTick) &&
      value.controllerTick >= 0 &&
      value.nativeSerial === value.controllerTick + 180,
    '052 actual native/controller counter disagreement',
  );
}
export function validateDualClock(
  proof: DualClockProof,
  raw: {
    frame: readonly number[];
    rafTime: readonly number[];
    rafReadTime: readonly number[];
    nativeSerial: readonly number[];
    controllerTick: readonly number[];
  },
  warmTicks: number,
  measuredTicks: number,
) {
  for (const point of [proof.phaseEntry, proof.phaseCompletion, proof.previousRaf]) {
    validateCounter(point);
    check(Number.isFinite(point.timeMs) && point.timeMs >= 0, '052 finite actual clock');
  }
  check(
    proof.phaseEntry.controllerTick === warmTicks &&
      proof.phaseCompletion.controllerTick === warmTicks + measuredTicks,
    '052 actual measured native phase boundaries',
  );
  const phaseMs = proof.phaseCompletion.timeMs - proof.phaseEntry.timeMs;
  check(phaseMs > 0, '052 positive native phase duration');
  check(
    raw.frame.length > 0 &&
      raw.frame.length <= 60000 &&
      [raw.rafTime, raw.rafReadTime, raw.nativeSerial, raw.controllerTick].every(
        (values) => values.length === raw.frame.length,
      ),
    '052 complete actual RAF counter channels',
  );
  // Cross-API representation consistency only: reuse the existing 1e-6ms
  // numerical equality allowance. Same-clock chronology below remains strict.
  const chronology = (point: RafPoint) => {
    check(
      Number.isFinite(point.observedAtMs) &&
        (point.observedAtMs >= point.timeMs || Math.abs(point.observedAtMs - point.timeMs) <= 1e-6),
      '052 RAF callback clock precedes RAF timestamp',
    );
    check(
      point.controllerTick <= proof.phaseEntry.controllerTick
        ? point.observedAtMs <= proof.phaseEntry.timeMs
        : point.observedAtMs >= proof.phaseEntry.timeMs,
      '052 phase entry versus actual RAF counter chronology',
    );
    check(
      point.controllerTick < proof.phaseCompletion.controllerTick
        ? point.observedAtMs <= proof.phaseCompletion.timeMs
        : point.observedAtMs >= proof.phaseCompletion.timeMs,
      '052 phase completion versus actual RAF counter chronology',
    );
  };
  chronology(proof.previousRaf);
  let previous = proof.previousRaf;
  let span = 0;
  for (let i = 0; i < raw.frame.length; i++) {
    const point = {
      timeMs: raw.rafTime[i]!,
      observedAtMs: raw.rafReadTime[i]!,
      nativeSerial: raw.nativeSerial[i]!,
      controllerTick: raw.controllerTick[i]!,
    };
    validateCounter(point);
    chronology(point);
    check(point.observedAtMs >= previous.observedAtMs, '052 monotonic actual RAF callback clocks');
    const delta = point.timeMs - previous.timeMs;
    check(
      Number.isFinite(delta) &&
        delta > 0 &&
        delta <= 250 &&
        Math.abs(delta - raw.frame[i]!) <= 1e-6,
      '052 untrimmed actual RAF delta',
    );
    check(
      point.controllerTick >= previous.controllerTick &&
        point.controllerTick - previous.controllerTick <= 4 &&
        point.controllerTick <= proof.phaseCompletion.controllerTick,
      '052 actual RAF counter admission/max4',
    );
    previous = point;
    span += delta;
  }
  check(
    previous.controllerTick === proof.phaseCompletion.controllerTick,
    '052 final RAF retains final completed native work',
  );
  check(
    proof.previousRaf.controllerTick <= proof.phaseEntry.controllerTick + 4 &&
      proof.previousRaf.controllerTick >= Math.max(0, proof.phaseEntry.controllerTick - 4),
    '052 actual warm-boundary native counter',
  );
  const phaseTicks = proof.phaseCompletion.nativeSerial - proof.phaseEntry.nativeSerial;
  const rafTicks = previous.nativeSerial - proof.previousRaf.nativeSerial;
  check(phaseTicks === measuredTicks && rafTicks > 0, '052 actual matched native deltas');
  const nativeRatio = phaseTicks / 60 / (phaseMs / 1000);
  const rafRatio = rafTicks / 60 / (span / 1000);
  check(
    Math.abs(proof.nativePhaseRatio - nativeRatio) <= 1e-12 &&
      Math.abs(proof.matchedRafRatio - rafRatio) <= 1e-12,
    '052 actual dual cadence recomputation',
  );
  check(nativeRatio >= 0.98, '052 native phase simulation/wall ratio');
  check(rafRatio >= 0.98, '052 matched RAF simulation/wall ratio');
  return { nativeRatio, rafRatio, phaseMs, rafMs: span, phaseTicks, rafTicks };
}
