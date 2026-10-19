# Telemetry demonstration fixtures — PBI 091

The native, browser independent corpus lives in `tests/telemetry/fixtures/corpus.ts`. Its exported
`fixtureManifest` names each case; `validFixtures` and `corruptedFixtures` hold the executable data.
The validator is `validateDemonstrationFixture(value)` from `src/telemetry/demonstration-fixtures.ts`,
exported from `src/telemetry/index.ts`. It returns `{ fixtureId, valid, contextLabel, reasons,
stopObservation }`. Each reason carries a closed `reasonCode`, `fieldPath`, and `offendingValue`.
`evaluateDemonstrationFixtureCorpus` is shared by the CLI and tests and marks an accepted corruption
or rejected valid fixture as a corpus failure.

Run the full corpus with:

```powershell
volta run --node 24.21.0 -- node --import ./scripts/register-typescript.mjs scripts/validate-telemetry-fixtures.mjs
```

`--valid-only` and `--corrupted-only` select one corpus half. Each fixture is independently cloned
before validation. Its tick frames pass through the 085 recorder, opportunity lifecycles through the
086 registry, facts through 087, discontinuities through 088, prerequisites through 089, and closed
segments through the 090 compactor. Vocabulary constants and parsers come from those owners.

## Corpus coverage

| Context | Class / lifecycle | Fixture IDs |
| --- | --- | --- |
| FREE_TRAFFIC | ELIGIBLE | `eligibility-free_traffic` |
| LEADER | EXTERNAL_CONSTRAINT | `eligibility-leader` |
| BLOCKED_GREEN | EXTERNAL_CONSTRAINT | `eligibility-blocked_green` |
| MECHANICAL_LIMIT | EXTERNAL_CONSTRAINT | `eligibility-mechanical_limit` |
| IMPACT | EXTERNAL_CONSTRAINT | `eligibility-impact`, `artefact-collision`, `artefact-recovery`, `artefact-incomplete` |
| PAUSE | EXCLUDED | `eligibility-pause` |
| FOCUS_LOST | EXCLUDED | `eligibility-focus_lost` |
| MANUAL_SEGMENT | EXCLUDED | `eligibility-manual_segment` |
| AUTO_SEGMENT | EXCLUDED | `eligibility-auto_segment` |
| NOT_OBSERVABLE | EXCLUDED | `eligibility-not_observable` |
| STOP | resolved / truncated | `opportunity-stop-resolved`, `opportunity-stop-truncated` |
| RED | resolved / truncated | `opportunity-red-resolved`, `opportunity-red-truncated` |
| GREEN | resolved / truncated | `opportunity-green-resolved`, `opportunity-green-truncated` |
| YIELD | resolved / truncated | `opportunity-yield-resolved`, `opportunity-yield-truncated` |
| LANE_CHANGE | resolved / truncated | `opportunity-lane_change-resolved`, `opportunity-lane_change-truncated` |
| STOP stimulus absent | NOT_OBSERVED marker | `stop-not-observed` |
| 088 artefacts | collision / recovery placement / incomplete segment | `artefact-collision`, `artefact-recovery`, `artefact-incomplete` |

The opportunity outcomes are the 086 closed outcome table. Truncated opportunities have no outcome.
The corpus does not synthesize a STOP result for the missing-STOP case: its `stopOpportunity` field
is `{ kind: 'STOP', observation: 'NOT_OBSERVED' }` while the independently observed RED opportunity
is held.

## Closed validator reason vocabulary

| Code | Meaning |
| --- | --- |
| `NON_MONOTONIC_TICK` | Tick sequence regressed or repeated. |
| `FOREIGN_ENTITY` | Entity identity differs from the frozen segment vehicle. |
| `DUPLICATE_ENTITY` | Entity identity occurs twice in the fixture segment. |
| `NON_FINITE_VALUE` | Numeric telemetry evidence is not finite. |
| `COMMAND_OUT_OF_RANGE` | Command violates 085 throttle range `[0,1]`. |
| `UNKNOWN_OPPORTUNITY_KIND` | Kind is outside the 086 vocabulary. |
| `UNKNOWN_OPPORTUNITY_STATE` | Lifecycle state is outside the 086 vocabulary. |
| `UNKNOWN_OPPORTUNITY_OUTCOME` | Resolved outcome is not allowed for its kind. |
| `DUPLICATE_OPPORTUNITY_ID` | Opportunity identity is repeated in one fixture. |
| `UNKNOWN_ELIGIBILITY_LABEL` | Label is outside the 087 vocabulary. |
| `ELIGIBILITY_FACT_CONTRADICTION` | Free traffic is paired with collision evidence. |
| `TRUNCATED_CLAIMS_COMPLETE` | 088 incomplete segment is claimed complete. |
| `NOT_OBSERVED` | STOP stimulus absence was not represented with the explicit marker. |
| `CONTRACT_REJECTED` | A real 085–090 contract refused the composed fixture. |

## Missing STOP and ratio behavior

`stopComplianceRatio(observation, successes, certain)` returns a number only for an observed STOP
with at least one certain opportunity. For `NOT_OBSERVED`, it returns `{ value: null,
refusalReason: 'NOT_OBSERVED' }`. Zero certain opportunities on an observed window return
`NO_CERTAIN_OPPORTUNITIES`; they do not imply 0% or successful compliance. A real observed denominator
can still yield 0 when it contains certain failures and no successes. The test compares the refusal
with a plausible `() => 0` implementation so substituting that implementation fails.

## What this is NOT

- Not 093's per-parameter evidence or a driver estimator.
- Not grading, compliance policy, or gameplay validation.
- Not a browser, renderer, GPU, FPS, performance, or live-loop integration claim.
- Not a replacement for the identity, eligibility, artefact, normalization, or storage owners in
  085–090; it composes their contracts for deterministic demonstrations.

## Verification and evidence

`tests/telemetry/demonstration-fixtures.test.ts` verifies valid contexts, exact corruption reasons
and paths, the NOT_OBSERVED refusal, the CLI, and defensive ownership. Exact command transcripts and
the two corpus runs are in [Evidence/091-telemetry-fixtures](Evidence/091-telemetry-fixtures/README.md).
