# Evidence 070 — pause focus and input modality

Targeted validation (`targeted-validation-v1`) for PBI 070. `performance_checks: simulation, memory`
as widened by the orchestrator before implementation. No browser, renderer, GPU or frame probe is
included: the 052 record documents an unresolved WebGPU presentation stall on this laptop, there is
no headed browser available in this environment, and Docs/25 forbids declaring an unmeasurable cost
as accepted. The UI/frame arm therefore stays **owed** to 153/224/235 and is listed as a limitation.

## What was measured

| Item | Value |
| --- | --- |
| Runtime | Node **v24.21.0** / npm 11.19.0 (via `volta run --node 24.21.0 --npm 11.19.0`); ambient Node is v24.19.0 and was not used |
| Hardware | AMD Ryzen 7 7735U with Radeon Graphics, 16 logical CPUs, 14,702,026,752 B RAM, win32 10.0.26300 |
| Measured commit | `c2ee8c168ffdaa72dbc680fa34c3e4a10c7f00a9` (probe committed, then both arms captured sequentially) |
| Fixture | `070-pause-focus-native-v1`: real 012 application lifecycle + real 008 fixed-tick loop + optional real 070 owner; CPU Node mock renderer, tick-only snapshot |
| Harness | one new probe `scripts/benchmark-pause-focus.mjs`; no second harness forked |
| Protocol | 5 repetitions, sequential, one arm at a time, warmup = one identical unmeasured pass per probe; 10,000 frames per live/suspended arm, 2,000 suspension edges and 10,000 `getState()` reads per repetition, bounded 10,000-sample CPU observer |
| Budget version | `203-initial-1`, `PROVISIONAL_UNCALIBRATED` |

BEFORE (`--baseline`) is the **same commit with the 070 runtime path disabled** (012 + 008 only),
not a historical revision: 070 is purely additive. The authoritative added-cost figures are the
paired deltas below.

## Results — added cost

| Arm | BEFORE | AFTER | Added |
| --- | --- | --- | --- |
| Live, 10,000 frames (median wall) | 20.0943 ms | 21.3885 ms | +1.2942 ms (**+6.44 %**) |
| Live, per-frame observer p50 / p95 / p99 | 1.9 / 2.3 / 4.2 µs | 2.0 / 2.1 / 2.4 µs | no p95/p99 regression; −0.2 µs p95, −1.8 µs p99 |
| Transition (suspend+frame+resume) p50 / p95 / p99 | 2.8 / 3.1 / 4.4 µs | 3.1 / 3.5 / 5.5 µs | +0.3 / +0.4 / +1.1 µs per edge |
| `getState()` p50 / p95 | n/a (no owner) | 0.2 / 0.2 µs | 0.2 µs per read |

The per-frame observer p95 is **not** worse in the AFTER arm; the +1.29 ms live wall difference is
run-to-run noise on a ~2 µs/frame fixture and is reported only for transparency, because the owner
does **no per-frame work** in the live path (nothing polls it inside the loop). The only measurable
added cost is **per suspension edge** (p95 ≈ 0.4 µs) and **per state read** (p95 0.2 µs).

Paired relative gate (Docs/25: a regression needs **>10 % and >1 ms** p95 increase in ≥3/5 pairs):

- per-frame p95 pairs µs B→A: 4.1→4.6, 2.3→2.1, 2.1→2.1, 3.1→2.1, 2.1→2.0 → **0/5 violating pairs**
  (the single increase is +0.5 µs, the instrument's own resolution).
- transition p95 pairs µs B→A: 3.2→3.9, 3.2→3.5, 3.1→3.4, 3.0→3.2, 3.0→4.1 → **0/5 violating pairs**.
  Reported honestly: the relative increase exceeds 10 % in two of the five pairs (+22 % and +37 %;
  the other three rise 7–10 %), but the absolute increase is 0.2–1.1 µs, three orders of magnitude
  below the 1 ms half of the gate, and the fixture's whole transition stage is ~3 µs. This is the real
  added cost of the feature.

## Results — the suspended arm (the point of a pause)

| Arm | Frames | Ticks advanced | Wall |
| --- | --- | --- | --- |
| AFTER live (AUTO, panel + diagnostic open) | 10,000 | 10,000 | 21.3885 ms |
| AFTER suspended (MANUAL, panel open) | 10,000 | **0** | 0.1967 ms |
| BEFORE suspended (012 `pause('manual')`) | 10,000 | **0** | 0.1760 ms |

Suspension removes **21.19 ms of 21.39 ms (99.1 %)** of this CPU fixture's frame work while
rendering keeps running (`renders = 10,000` in both arms). This is honest for a fixture whose frame
is dominated by the authoritative tick and its snapshot capture; the Babylon/GPU render cost that a
real suspended frame still pays is **not** measured here.

## Results — self-check (probe-asserted, `selfCheck.passed = true`)

- Live arm advances ticks; the suspended arm advances **0** ticks and still renders every frame.
- During all 1,000 suspension edges, **0** ticks advanced.
- The authoritative tick sequence across suspensions is contiguous and distinct in every repetition
  — nothing fabricated, nothing silently skipped (this is exactly the sequence a 085 recorder sees).
- AFTER edges: 1,000 suspensions, 1,000 resumes, 1,000 held-command resets, i.e. no flapping.
- Memory: 20 create/use/dispose cycles all returned held commands, the held panel action and the
  disposed flag to zero; the owner owns no typed arrays.

## Results — exact owned memory

| Item | Value |
| --- | --- |
| Held-command capacity | 16 (bounded; overflow rejects the newest command) |
| Surface flags | 3 (`panel`, `menu`, `diagnostic`) |
| Preallocated buffer bytes | **0** |
| Retained typed arrays | **0** |
| Retained history entries | **0** |
| After `dispose()` | held commands 0, held panel action `null`, mutation rejected |
| Manifest `recorderRamBytes` | 33,554,432 B — not applicable: the owner allocates no persisted buffer |

`heapUsed`/`arrayBuffers` are recorded in the JSON as
`DIAGNOSTIC_NOT_COMPARABLE_ACROSS_JIT_GC` and are **not** a metric; the exact figure is the
ownership counter set above, whose only unbounded-looking member (held commands) is capped at 16.

## Checks and tests

- `checks.txt` — typecheck, lint, format:check, check:architecture (154 files, all negative probes
  PASS), check:parameter-catalog; every one `exit=0`.
- `tests.txt` — `tests/app/pause-focus.test.ts` **10/10 PASS**; full `npm test` **961/961 PASS**
  (951 pre-existing + 10 new), `exit=0`. Complete stdout: `tests-full-raw.txt`.
- Probe arms: `before-01.json` (070 path disabled) and `after-01.json` (070 composed), raw stdout,
  both `selfCheck.passed = true`.

## Limitations

1. **The UI/frame arm is not measured.** No headed browser probe exists in this environment and
   Docs/25 forbids calling an unmeasurable cost accepted. Babylon render cost, GPU time, real frame
   p95/p99, input→command latency and visual alt-tab behaviour are **NOT_VALIDATED** and stay owed to
   153/224/235. The suspended arm measures CPU loop work, not GPU work.
2. Validate-only fixture: the renderer is a CPU mock, the snapshot is a tick counter, and there is
   no physics, traffic, learning, panel DOM or camera. It closes no absolute budget row.
3. The BEFORE arm is the same commit with the 070 path disabled, not a pre-070 revision; the 012
   pause-reason vocabulary therefore already includes the host causes in both arms.
4. The transitions arm measures the owner plus 012 `pause`/`play`; it is not a full-tick measurement
   and no causal speedup is claimed.
5. `heapUsed`/`arrayBuffers` are diagnostic and noisy; only the ownership counters are exact.
6. Wall-clock figures are single-process Node on this laptop; thermal/power state was not instrumented.

## Files

- `before-01.json`, `after-01.json` — raw probe stdout for the two arms (+ `.stderr.txt`).
- `checks.txt`, `tests.txt`, `tests-full-raw.txt` — verbatim command output.
