# PBI 102 — candidate delta validation

Implemented `validateCandidateDelta`, `CANDIDATE_LEARNING_KEYS`, `candidateRejectionCodes` and
`CANDIDATE_VALIDATION_POLICY` in `src/learning/candidate-validation.ts`, exported through
`src/learning/index.ts`. The module is the numeric gate between the 094–101 candidates and any
consumer that could apply a delta. It returns either a frozen accepted delta or a closed rejection
list; it never publishes a profile/delta, never writes 092 `implemented`/`estimable` and never emits
`LEARNED`.

## Contract

`validateCandidateDelta(input, expectations?)` inspects `profileVersionId`, optional
`parentVersionId`, `engineVersion`, `schemaVersion`, `units` and `values` (`key`, `value`, `unit`).
`expectations` can pin `baseVersionId` and `engineVersion`.

Every value must satisfy all of:

- a known 092 catalog key (`KEY_UNKNOWN` otherwise);
- one of the 24 M `initial_learning_target` keys (`KEY_EXTENSION_STAGE` for R/`extension` keys);
- the exact canonical 092 unit (`UNIT_MISMATCH`);
- a finite number (`VALUE_NOT_FINITE` for NaN, ±Infinity, numeric strings and other types);
- the inclusive 092 `min`/`max` range (`VALUE_OUT_OF_RANGE`);
- one occurrence per key (`DUPLICATE_KEY`), with at least one value (`DELTA_EMPTY`).

Compatibility is checked explicitly: `PROFILE_VERSION_MISSING`, `PROFILE_SCHEMA_MISMATCH`,
`PROFILE_VERSION_SELF_PARENT`, `BASE_VERSION_MISMATCH` and `ENGINE_VERSION_MISMATCH`. A structurally
malformed input (non-object delta, non-array `values`) throws; value problems always return closed
rejections.

The result branches are exclusive:

| Branch | `status` | `delta` | `rejections` | `acceptedKeyCount` |
| --- | --- | --- | --- | --- |
| accepted | `ACCEPTED` | frozen delta | `[]` | number of values |
| rejected | `REJECTED` | `null` | every problem found | `0` |

A delta with `[valid, NaN, R key, unknown key]` returns `REJECTED`, `delta: null`,
`acceptedKeyCount: 0`, `rejectedValueCount: 3`; the valid entry is not exposed. Both branches are
frozen and carry `published: false`, `learned: false`, `behaviour: 'NOT_EVALUATED'`.

## Risky but valid values

Validation is numeric only. Possible collisions, traffic violations and aggressive styles are not
rejection reasons: `speed_delta_urban = 15`, `curve_lateral_accel = 8`,
`following_min_gap = 0.2` and `following_time_headway = 0.2` are accepted unchanged (no rounding,
no clamping), and `CANDIDATE_VALIDATION_POLICY.behaviouralGate` is `NONE`. The 092 `implemented`
flag is echoed as metadata in the accepted delta and is not a gate here; controller compatibility
remains the 092 publication boundary.

## Evidence

`tests/learning/candidate-validation.test.ts` (14/14) covers all 24 M keys, NaN, ±Infinity,
non-numeric values, both range boundaries, out-of-range, unknown key, R key, unit mismatch,
duplicate key, empty delta, mixed-delta atomicity, compatibility failures, malformed structure,
risky-but-valid acceptance, determinism, immutability and the untouched registry flags.

Full run: `npm test` → 1098 tests, 1098 pass, 0 fail (baseline 1084 plus 14 PBI 102 tests).
`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture` (172 TS
files) and `npm run check:parameter-catalog` all pass. Exact commands are in `checks.txt`; per-test
rationale is in `tests.txt`.

## Limitations

No worker, persistence, profile publication, `LEARNED` emission, checksum, `learningEpoch` barrier
or tick propagation. The module does not decide whether a delta should be applied and does not
evaluate physical consequences. Whether `yield_time_gap` (M stage, `implemented=false`) can reach a
controller stays a 092 publication decision; validation accepts the M stage as the learning gate.
The PBI file was left In Progress: this work does not run board validators or move the task to Done.
