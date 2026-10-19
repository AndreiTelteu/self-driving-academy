# Evidence 071 — takeover/return continuity

Targeted validation (`targeted-validation-v1`) for PBI 071. `performance_checks: simulation, memory`
as widened by the orchestrator before implementation. No browser, renderer, GPU or frame probe is
included: the 052 record documents an unresolved WebGPU presentation stall on this laptop, no headed
browser is available here, and Docs/25 forbids declaring an unmeasurable cost as accepted. The
UI/frame arm therefore stays **owed** to 153/224/235 and is listed as a limitation.

## What was measured

| Item | Value |
| --- | --- |
| Runtime | Node **v24.21.0** / npm 11.19.0 (via `volta run --node 24.21.0 --npm 11.19.0`); ambient Node is v24.19.0 and was **not** used |
| Hardware | AMD Ryzen 7 7735U with Radeon Graphics, win32 10.0.26300 |
| Measured commit | `f5536108f402247d395bafa0b0d142d87d64275b` (probe committed first, then both arms captured sequentially and alone) |
| Fixture | `071-targeted-takeover-v1`: real 033 lane graph + real 044 road context + real 045 FSM + real 041 planner + 054's real `evaluateAuthorityReentry` |
| Harness | the **existing** shared probe `scripts/benchmark-autonomy-policies.mjs` (new `--pbi 071` arm); no second harness was forked |
| Protocol | 1 warmup + 5 repetitions; one arm per invocation; 1,200 ticks/360 decision slices at 10 Hz after a 180-tick warmup; 170 measured decision costs per repetition; bounded 20-cycle memory arm |
| Budget version | `203-initial-1`, `PROVISIONAL_UNCALIBRATED` |

Both arms evaluate the **same real 054 re-entry decision** and the **same real 045 FSM** on the same
fixture and cadence. BEFORE is the pre-071 caller (054's `evaluateAuthorityReentry` directly, no
continuity measurement); AFTER is `evaluateTakeoverContinuity`, which measures and bounds the physical
and command continuity and raises the 045 fact. The delta therefore isolates the 071 layer alone.

The authored physical truth is a rolling vehicle on `lane-in` at 8 m/s that drifts 1.4 m off the lane
centre after 5 s and is driven off the 033 graph after 15 s, so the measured slices cover the real
`ON_LANE` → `DRIVE_TO_LANE` → `REQUEST_RECOVERY`/blocked paths (100 drives, 51 blocked, 51 escalations
per repetition).

## Results — added cost

| Arm | p50 | p95 | p99 |
| --- | --- | --- | --- |
| BEFORE (in-process paired arm) | 0.0285 | 0.0550 | 0.1259 |
| AFTER | 0.0424 | 0.0782 | 0.1329 |
| **ADDED** (paired, AFTER run) | **+0.0139** | **+0.0232** | +0.0070 |

ms per **10 Hz decision slice**. The standalone BEFORE arm (`before.json`) measures
p50 0.0298 / p95 0.0707 / p99 0.1398, i.e. the added cost against the separate arm is
p50 +0.0126 / p95 +0.0075 / p99 −0.0069 — the same order within run-to-run noise of a ~0.05 ms
fixture. The paired delta above is the authoritative figure.

Paired relative gate (Docs/25: a regression needs **>10 % and >1 ms** p95 increase in ≥3/5 pairs):

- paired p95 **BEFORE** ms: 0.1164, 0.0527, 0.0550, 0.0492, 0.0645
- paired p95 **AFTER** ms: 0.0724, 0.0934, 0.1174, 0.0782, 0.0669
- → **0/5 violating pairs**. Reported honestly: 3/5 pairs exceed the 10 % half of the gate
  (+77 %, +113 %, +59 %), but every absolute increase is ≤ 0.063 ms — at least 16× below the 1 ms
  half, which the rule requires together with the relative increase. One pair even falls.

Budget (`Docs/performance-budgets.json`, `budgetVersion` `203-initial-1`,
`calibration: PROVISIONAL_UNCALIBRATED`): the decision runs at 10 Hz, so the AFTER p95 of
0.0782 ms/decision amortises to ≈0.0130 ms per 60 Hz tick, i.e. **0.24 %** of the absolute
`authoritativeTickP95Ms` budget (5.5 ms desktop / 8 ms laptop); the added p95 of 0.0232 ms/decision is
≈0.0039 ms/tick, i.e. **0.07 %** of it. The absolute budget still applies; this local probe does not
certify the integrated budget.

## Results — self-check (identical in every repetition)

| Signal | BEFORE | AFTER |
| --- | --- | --- |
| Decision slices per repetition | 200 | 200 |
| Blocked (045 fact raised) | 51 | 51 |
| `DRIVE_TO_LANE` plans | 100 | 100 |
| 030 recovery requests | 51 | 51 |
| Decision checksum | **103147** | **103147** |
| State preserved | not measured | **200 / 200** |

The **identical checksum and identical counters** across arms are the strongest available proof that
071 re-exposes the 054 decision verbatim and perturbs nothing: the deterministic decision trace is
identical, only the added continuity measurement is new. `statePreserved` is 200/200 on the real
033/041/044/045 chain — including the 1.4 m off-centre slices and the off-graph slices — because the
authored before/after pair is exactly one integrated step of the authored physical truth.

## Results — exact owned memory

| Item | Value |
| --- | --- |
| Cycles | 20 `build → drive → dispose → gc → counters` (gc available: **true**) |
| `getTakeoverContinuityStats()` in all 20 cycles | `evaluating:false, retainedActors:0, retainedHandovers:0, retainedHistory:0` |
| Retained actors / handovers / history | **0 / 0 / 0** — the module keeps no map at all; the caller holds the inputs |
| Preallocated buffers / typed arrays | **0** |
| `heapUsed` after gc | 12.55–12.95 MB (diagnostic only, `DIAGNOSTIC_NOT_COMPARABLE_ACROSS_JIT_GC`) |
| Manifest `recorderRamBytes` | 33,554,432 B — not applicable: the module allocates no persisted buffer |

`heapUsed` is recorded but is **not** a metric; the exact figure is the ownership counter set above,
whose only members are all zero because 071 is a pure function with no retained state.

## Checks and tests

- `checks.txt` — `npm run typecheck`, `lint`, `format:check`, `check:architecture`
  (155 TypeScript files, all negative probes PASS), `check:parameter-catalog`; every one `exit=0`.
- `tests.txt` — `tests/autonomy/takeover-continuity.test.ts` **9/9 PASS**; full `npm test`
  **970/970 PASS** (961 pre-existing + 9 new), `exit=0`. Complete stdout: `tests-full-raw.txt`.
- Probe arms: `before.json` and `after.json` (+ `before-run.txt`, `after-run.txt`), both
  `selfCheck`-equivalent above; the AFTER report carries the paired delta, the 5 repetitions and the
  20-cycle memory arm.

## Limitations

1. **The UI/frame arm is not measured.** No headed browser probe exists in this environment and
   Docs/25 forbids calling an unmeasurable cost accepted. Babylon render cost, GPU time, real frame
   p95/p99 and visual behaviour across a takeover are **NOT_VALIDATED** and stay owed to 153/224/235.
2. The fixture is a validate-only Node CPU fixture: the physics body is an **authored** physical truth,
   so no native Rapier world, collision solver or 030 placement is exercised. The 030 recovery
   escalation is verified against its descriptor/road-proof contract, not against a native world.
3. The BEFORE arm is the same commit with the 071 layer absent (054 directly), not a pre-071 revision;
   054 is a completed dependency, so its cost is present in both arms.
4. The continuity bounds and the command-step bound (`maximumCommandStepPerTick` 0.5) are **frozen
   provisional constants** that still need calibration on the real city map; they are not profile
   parameters. The collision exemption is a caller-declared 028 flag and is only as honest as that
   report.
5. `heapUsed` is diagnostic and noisy; only the ownership counters are exact.
6. Wall-clock figures are single-process Node on this laptop; thermal/power state was not instrumented.

## Files

- `before.json`, `after.json` — raw probe stdout for the two arms (+ `before-run.txt`, `after-run.txt`).
- `checks.txt`, `tests.txt`, `tests-full-raw.txt` — verbatim command output.
- Module doc: [`Docs/takeover-continuity.md`](../../takeover-continuity.md).
