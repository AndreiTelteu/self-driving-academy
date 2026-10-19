# PBI 097 — signal estimator evidence

Implemented `estimateSignalParameters` in `src/learning/signal-estimator.ts`. It consumes 093 descriptive read models, 086 cumulative opportunity denominators, 087 eligibility, 088 filtered windows and real timing facts. It returns immutable candidates only; it does not mutate a ledger or create a profile/delta/publication. 092 remains unchanged and unsupported LEARNED publication is refused.

## Behavior evidence

`tests/learning/signal-estimator.test.ts` (3/3):

- Three certain RED opportunities use `learningEligibleCertain=3` from 086. Ten repeated frames for the first ID are ignored; one truncated RED is reported as incomplete, never enters success/failure, and does not enter the ratio. The ratio remains 1.0. An implementation counting frames or treating the truncated opportunity as failure fails.
- Two unblocked departures at exact green onset/departure tick pairs contribute 30/60 ticks = 0.5 s. A third departure blocked by a leader increments the blocked counter and does not affect the delay. Treating blocked time as a slow reaction fails.
- Zero certain denominator returns `REFUSED`, null, and `ZERO_CERTAIN_RED_DENOMINATOR`. If supplied certain RED facts do not cover the 086 denominator, the ratio stays null with `INCOMPLETE_086_RED_DENOMINATOR_FACTS`; missing records are never counted as failures. The result exposes total, certain, and truncated RED counts. Unknown evidence keys throw; a LEADER-context RED approach produces no offset candidate. Invalid departure-before-onset contributes no reaction value.

Stop-line offset and late-red brake facts are drawn from unique eligible RED or STOP approaches. Values are never derived from frame count or traveled distance.

## Commands

Node 24.21.0 / npm 11.19.0. Exact outputs are in [checks.txt](checks.txt). `npm test` passed 1043/1043: 1037 baseline plus six estimator tests (three per PBI). The registry suite passed 8/8, preserving 092 flags and the LEARNED publication refusal.

## Limitations

The caller supplies the authoritative cumulative denominator and tick/approach facts; the estimator cannot recover producer events that were never supplied. Means are outlier-sensitive and tick conversion assumes the configured 60 Hz fixed step. No worker/profile wiring, live calibration, gameplay capture, browser/GPU/FPS measurement, performance probe, board validator, or Validate-Plan run is claimed. Per orchestration instructions, PBI files remain in their current columns.
