# PBI 095 evidence

Implemented `estimateAccelerationParameters` in `src/learning/acceleration-estimator.ts`. It
consumes 093 read models, 087 eligibility and reaction evidence, 088 artifact records, and 089
normalized intent features. Results are immutable candidates only. There is no mutation, profile,
delta, publication or activation path. 092 remains unchanged; every `estimable` flag remains false.

## Behavior checks

`tests/learning/acceleration-estimator.test.ts` (3/3):

- Three smooth windows plus 20 collision/impact windows produced identical preferred deceleration
  and jerk; the 20 collision windows were counted as excluded artifacts.
- Sedan and compact observations with equal 0.5 normalized acceleration demand produced the same
  `2.3214285714m/s²` candidate. A saturated 089 capability-limited observation produced no value
  and incremented `excludedCapabilityLowerBounds`. The class breakdown reports equal normalized
  p50 values (0.5/0.5) and different raw SI p50 acceleration (2.3/1.9m/s²), preserving the class
  distinction for inspection.
- Three accepted 087 same-window responses of six ticks each produced `0.1s`. With no accepted
  stimulus response, the candidate remained `UNOBSERVED` with a null value.

The tests are intentionally constructed so raw SI acceleration differs by class ceiling while the
normalized fraction is equal; using raw acceleration as style would fail the class comparison.
Adding impact impulse/deceleration/jerk would fail the smooth-vs-collision equality. Treating absent
reaction evidence as zero or slow would fail the explicit null assertion.

## Commands run (Node 24.21.0 / npm 11.19.0)

```text
volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck
PASS (tsc --noEmit; tests typecheck)

volta run --node 24.21.0 --npm 11.19.0 -- npm run lint
PASS (ESLint, zero warnings)

volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check
PASS (all matched files use Prettier code style)

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture
PASS (164 TypeScript files; 6 + 4 + 3 negative probes)

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog
PASS (Parameter catalog is synchronized)

volta run --node 24.21.0 --npm 11.19.0 -- npm test
PASS (1037/1037; baseline 1032 plus 5 new)

volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs --test tests/parameters/registry.test.ts
PASS (8/8; all unsupported LEARNED publication is refused)
```

An early estimator test exposed an incorrect expected decimal (2.3 vs the sedan reference formula
2.3214285714); the assertion was corrected to the formula-derived value. An initial PowerShell loop
also passed `run typecheck` as one npm subcommand; it was not counted as a check, and every requested
command was rerun individually with the exact command shown above.

## Limits

Inputs are composed by a caller; these estimators are not wired into the live simulation or worker.
The jerk sample producer must supply authoritative tick-to-tick SI jerk derived from 085 samples.
The reaction candidate requires 087 accepted same-window response evidence; unobservable cases stay
null. No browser, hardware or performance claim is made. The orchestrator prohibits moving PBI files,
so this task remains In Progress.
