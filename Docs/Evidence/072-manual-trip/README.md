# Evidence 072 - complete manual trip and short intervention

Targeted validation (`targeted-validation-v1`) for PBI 072. No browser, renderer, GPU, frame or
hardware probe is included: the trip driver is a pure Node composition of the real ride and control
modules, and the UI/HUD arm stays owed to 074/075/153/224/235.

## What was delivered

- `src/app/manual-trip.ts` - `createManualTrip` / `manualTripContractFacts`, version
  `072-manual-trip-v1`: the composition root of one real 061 ride across AUTO/MANUAL/LEARNING, using
  the real 060 claim, 062 pickup, 063 dropoff, 066 authority, 067 mode intents, 068 selection, 069
  segments and 071 continuity.
- `src/app/index.ts` - additive public export.
- `tests/app/manual-trip-fixture.ts` - real 057/059/060/061/062/063 world plus real 066/067/068/069
  composition; a host-controlled physical readback can inject a discontinuity.
- `tests/app/manual-trip.test.ts` - 14 targeted tests.
- `tests/app/manual-trip-report.ts` + `scripts/run-manual-trip-report.mjs` + `npm run trip:manual` -
  deterministic end-to-end transcript and human table.
- `Docs/manual-trip.md` - API, ownership, trip/segment/continuity rules and limitations.
- `Docs/07-flota-si-curse.md` and `Docs/08-interfata-camera-si-control.md` - integration paragraphs.
- `report.json`, `report.md`, `checks.txt`, `tests.txt`, `tests-full-raw.txt` - transcripts.

## Trip and intervention rules verified

- One real 061 ride: a mode change never calls `begin`; `rideId`, `requestId`, `assignmentId`,
  `taxiId`, both zones, both routes, both costs and `startedTick` are unchanged across the switch.
- The 060 claim stays `ASSIGNED` across the switch and is released exactly once at completion.
- AUTO resumes the same ride from its current state; no second ride, request, assignment or
  completion is created.
- The real 062/063 proofs survive: `boardingTick` 191, `completionTick` 907 and their 180-tick dwells
  are the real receipts. A replayed dropoff observation is a duplicate, with one `DROPOFF_COMPLETE`,
  one lifecycle release and one completion.
- MANUAL is service telemetry: `learningEligible` false, 32 capped samples, zero intake entries, zero
  publications. The 4-tick mixed intervention records 4 samples and publishes nothing.
- LEARNING publishes only the host-observed keys: the demonstration queues 1 real intake and
  publishes `desired_acceleration` and `speed_delta_urban`, leaving the other 22 target parameters
  unobserved. Profile `values`/`proofs` are byte-identical after every scenario.
- Deterministic ticks: a step must be exactly `currentTick + 1`; a mode intent must be at the exact
  current accepted tick; every refused call leaves the tick and the ride untouched.
- Closed refusals: `NO_ACTIVE_RIDE`, `DUPLICATE_RIDE`, `RIDE_TERMINAL`, `RIDE_MISMATCH`,
  `TAXI_MISMATCH`, `TICK_NOT_CURRENT`, `TICK_NOT_NEXT`, `UNKNOWN_MODE`, `ALREADY_IN_MODE`,
  `INTENT_ALREADY_QUEUED`, `LEARNING_UNAVAILABLE`, `TARGET_UNAVAILABLE`, `AUTHORITY_SUSPENDED`,
  `AUTHORITY_FAULT`, `MODE_QUEUE_CONFLICT`.
- Completion while MANUAL closes the first segment with `RIDE_COMPLETED` and opens a new MANUAL
  segment without changing the mode.
- Disposal retires an open segment with `SHUTDOWN` and does not release the host ride or claim.

## Test sensitivity (mutation probes)

Each probe was applied temporarily to `src/app/manual-trip.ts`, the named test was executed alone, and
the original file was restored byte-for-byte. The failures are real output, not expectations.

| Plausible wrong implementation | Mutation | Test that failed | Observed failure |
| --- | --- | --- | --- |
| MANUAL counted as learning evidence | track `learningEligible` forced to `true` | `072 MANUAL segments are MANUAL telemetry, never learning evidence` | actual `true`, expected `false` |
| Lost pickup proof | `boardingTick` forced to `null` | `072 returning to AUTO resumes the same ride without a second ride or completion` | actual `null`, expected `191` |
| Lost dropoff proof | `completionTick` forced to `null` | `072 a complete MANUAL ride produces the result with unchanged profile values and proofs` | actual `null`, expected `907` |
| State/handover not measured | 071 decision suppressed | `072 the control switch preserves the ride, passenger and destination` | handover undefined |
| AUTO not resuming the same ride / second ride | `rideId` forked on a mode request | `072 mixed trip keeps one ride and one MANUAL segment, then AUTO finishes the same ride` | actual `undefined`, expected the real ride id |

The duplicate completion is protected by the real 063 idempotency and asserted end-to-end: a replayed
`dropoff.observe` returns `duplicate: true`, the ride keeps one `DROPOFF_COMPLETE`, one release and one
completion receipt. The committed report test additionally fails if `report.json` is stale.

## Commands and exact results

All commands ran in the worktree root with Node v24.21.0 (`volta run --node 24.21.0`).

| Command | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | `All matched files use Prettier code style!`, exit 0 |
| `npm run check:architecture` | PASS (191 TypeScript files); negative probes 6 + 4 + 3 PASS; exit 0 |
| `npm run check:parameter-catalog` | `Parameter catalog is synchronized.`, exit 0 |
| `node --import ./scripts/register-typescript.mjs --test tests/app/manual-trip.test.ts` | 14/14 pass, 0 fail, 13623.0358 ms, exit 0 |
| `npm test` | 1279/1279 pass (1265 baseline + 14 new), 0 fail, 53177.9838 ms, exit 0 |
| `npm run trip:manual` | 19/19 checks, overall PASS, wrote `report.json` and `report.md` |
| `npm run trip:manual -- --check` | `Manual trip report is current`, exit 0 |

The known unrelated flake `tests/workers/protocol.test.ts` did not appear in this run, so no re-run was
needed. Raw stdout is in `tests.txt` and `tests-full-raw.txt`; the command log is in `checks.txt`.

## Report scenarios

| Scenario | Result |
| --- | --- |
| Mixed AUTO -> MANUAL (4 ticks) -> AUTO | 1 segment, MANUAL, `RETURN_TO_AUTO`, ride `COMPLETED`, 1 ride, 1 release, 5 transitions, 0 intake |
| Complete MANUAL trip | 897 MANUAL ticks, 32 capped samples / 865 skipped, ride `COMPLETED` at 907, 0 intake, then `RETURN_TO_AUTO` |
| Short LEARNING demonstration | 1 LEARNING segment, 1 real intake, 1 publication with 2 observed keys and 22 unobserved |
| Completion while MANUAL | 2 MANUAL segments, first closed `RIDE_COMPLETED`, second OPEN, mode stays MANUAL |

The report runs the mixed scenario twice and compares the two JSON values; no wall-clock value is
recorded, so the transcript is reproducible.

## Limitations

1. The fixture authors the authoritative 005 state and the pickup/drive/dropoff timeline; it does not
   run a native Rapier world, a native 021/024 integration or a real collision/recovery event.
2. The optional 054 re-entry observation is not supplied, so 071 measures the physical continuity but
   abstains on re-entry (`REENTRY_ABSTAINED`). The continuity bounds and command-step bound are the
   frozen provisional 071 constants, not calibrated profile parameters.
3. No headed browser, HUD, camera, frame, GPU or hardware measurement is included; visual acceptance
   remains owed to 074/075/153/224/235.
4. No fare, review, XP, KPI, savegame, worker or estimator publication is implemented; a LEARNING
   publication ends at the real 069 intake descriptor.
5. The mode intervention is driven through the real 067/066 path but the physical keyboard/HUD events
   are outside this fixture; 067/070 already own that adapter and are exercised by their own tests.
