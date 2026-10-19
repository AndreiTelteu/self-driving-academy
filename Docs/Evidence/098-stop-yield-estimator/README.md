# PBI 098 — STOP and priority acceptance estimator evidence

Implemented `estimateStopYieldParameters` in `src/learning/stop-yield-estimator.ts`, exported from `src/learning/index.ts`. It reads 093 specs/read models and the cumulative 086 denominator and returns frozen candidate-only records. No profile, value/delta publication, or activation is performed.

## Behavioral evidence

`tests/learning/stop-yield-estimator.test.ts` (2/2):

- The STOP scenario supplies four certain FREE_TRAFFIC/STOP_LINE decisions (three full stops with exact 90/120/150 dwell ticks and one rolling stop) plus a queue-induced LEADER stop covered by 086 but excluded from the compliance denominator. It expects full-stop probability 0.75, dwell mean 2 seconds, rolling count one, traffic exclusion count one, and line offset mean 2.5 m. A frame-based ratio, treating the queue stop as a violation, confusing rolling with full, or deriving dwell from frame count fails these assertions. Three eligible opportunities are required by 093.
- Zero 086 certain STOP denominator produces `REFUSED/ZERO_CERTAIN_STOP_DENOMINATOR`. Three accepted-to-proceed opportunities at gaps 2/3/4 expose only lower bound 2; adding a refused (`YIELDED`) 1.5-second opportunity produces interval `[1.5, 2]` and no point value. An implementation that reverses 086's `PROCEEDED`/`YIELDED` meanings, uses successes as an exact threshold, or counts frames fails.

Identity checks include opportunity/window/segment/vehicle/incarnation/mode/learning facts and duplicate identity is `id + occurrence`; truncated/non-prefix observations do not contribute. Inputs are only read and results/candidate maps are frozen.

## Checks

Exact command outputs are recorded in [checks.txt](checks.txt). Node 24.21.0 and npm 11.19.0 were selected through Volta. Full project tests passed 1047/1047 after adding the four 098/099 scenario tests. The registry suite passed 8/8, preserving the existing 092 catalog/publication rules. No generated catalog or parameter registry file changed.

## Limitations

The caller supplies authoritative STOP cause, exact dwell ticks, stop-line offset, and signed YIELD gap facts; missing producer facts cannot be recovered. An incomplete set of concrete STOP facts relative to the 086 learning-eligible certain denominator refuses the ratio. Dwell conversion assumes the documented 60 Hz tick. This is not connected to a worker/live profile and makes no gameplay, browser, GPU, FPS, or performance claim.
