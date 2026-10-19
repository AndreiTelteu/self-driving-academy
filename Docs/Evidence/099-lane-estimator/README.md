# PBI 099 — lane-change estimator V1 evidence

Implemented `estimateLaneChangeParameters` in `src/learning/lane-estimator.ts`, exported through `src/learning/index.ts`. It consumes 093 read models and 086 opportunity identity/outcome facts with matched 087/088 records. It returns immutable candidates only; no profile, value/delta publication, or activation is produced.

## Behavioral evidence

`tests/learning/lane-estimator.test.ts` (2/2):

- Three optional completed opportunities with different front/back gaps and speed advantages produce observed lower bounds. A route-forced opportunity carrying much smaller gaps, advantage, and cooldown is separately counted and cannot move any optional candidate; measured optional cooldowns are averaged from exact ticks. A mixed forced/optional estimator would fail.
- One rejected and two completed opportunities produce intervals `[8,12]`, `[6,10]`, and `[1,3]` for front gap, back gap, and speed advantage. An implementation using only successes as an exact threshold, pooling dimensions, or ignoring refusals fails.

Opportunity/window/segment/vehicle/incarnation/mode/outcome identities are checked, frames deduplicate by `id + occurrence`, and negative distances/invalid exact tick measurements are rejected. The source rows are never mutated.

## Checks

Exact commands and results are in [checks.txt](checks.txt). Node 24.21.0 and npm 11.19.0 were selected through Volta. The full project suite passed 1047/1047. The dedicated estimator tests passed 4/4 and the parameter registry passed 8/8, preserving the 092 capability and publication rules. No generated catalog or registry file changed.

## Limitations

The caller supplies authoritative route-required classification, attempt outcome and gap/advantage measurements; the estimator does not derive them from lane geometry or physics. `lane_change_cooldown` is only as representative as supplied elapsed ticks between optional completed manoeuvres. Successful-only data yields an observed lower bound rather than an exact threshold. No worker/profile integration, gameplay capture, browser/GPU/FPS claim, or performance probe is included.
