# Follow-up052: proposed V7 warm-boundary fail-fast sources

2026-10-07. SOURCE_ONLY / UNEXECUTED. This handoff does not complete PBI052 or validate performance.

## Identity and scope

Every terminal call used explicit cwd `F:/Sites/self-driving-academy/.worktrees/yield-policy-01`. Identity was read directly: `.git` points to `F:/Sites/self-driving-academy/.git/worktrees/yield-policy-01`; that worktree's `HEAD` is `ref: refs/heads/loop-pbi/yield-policy-01`. No Git command ran. Canonical root PBI/AGENTS.md and full PBI/In Progress/052-auto_yield.md were read as data, alongside module06, Docs25, manifest203, yield-policy, behavior-FSM, priority-rules, simulation-scheduling and the previous [source review](resume-source-review-01.md).

Only these three new files were authored:

- `tests/browser/yield-policy-v7/boundary.ts`
- `tests/browser/yield-policy-v7/boundary.test.ts`
- This handoff.

No tests, formatter, typecheck, lint, build, CIM, browser, server, native/world execution, Git operation or subagent ran. Only source/document reads, source writes and finite SHA256 file reads occurred. Root040 retains exclusive finite CPU; 069 owns its separate COPY diagnostics sources; 026 remains idle pending the user. This round does not reuse the prior completed task or its child thread. Canonical board, product sources, all V6 sources and old archive/capture inputs were untouched. PBI052 remains In Progress.

## Source behavior and regression

`assertActualWarmBoundary` is pure, stateless and synchronous. Once the caller has both actual ENTRY and the originally selected actual previous RAF, it checks the same predicate as frozen `yield-policy-v5/clock-proof.ts`, still used by the V6 proof:

```ts
previousRaf.controllerTick <= phaseEntry.controllerTick + 4 &&
  previousRaf.controllerTick >= Math.max(0, phaseEntry.controllerTick - 4);
```

The helper reuses the existing `validateCounter` in all three contexts: ENTRY, previous RAF and current diagnostic counter. These require safe integer actual counters, controller >=0 and nativeSerial === controllerTick +180. Neither nominal attempted target ticks nor scheduler labels can replace these reads. The helper adds a safe integer recorded-prefix count in [0,60000], matching the existing RAF channel capacity. It snapshots only named scalar fields in three frozen point/counter objects and one frozen diagnostic object; no raw channel copy/history, timer, observer, async work or world import. This is a constant-size diagnostic, not a measured heap/cost claim.

Boundary rejection throws `WarmBoundaryRejection` with the exact existing predicate message and its detached diagnostic. Both possible diagnostic results have `status: DIAGNOSTIC_ONLY` and `performanceAcceptance: false`. `WITHIN_EXISTING_BOUNDARY` only answers this one counter predicate; it does not validate clock chronology, expected ENTRY tick, cadence, full arm completeness or any budget. Those remain the existing verifier's responsibility.

Six authored, unexecuted tests cover:

1. A **complete synthetic** 1800-warm/7200-measured arm with ENTRY1800/native1980, previous1789/native1969, and the original five prefix counter/stamp rows. The first interval remains173.59999999997672ms and consecutive advances remain <=4. Synthetic read times, tail and completion are explicitly test data, never added to actual evidence. The expected frozen-proof error is exactly the warm-boundary predicate, after complete channels, chronology, admission and final-RAF checks; it must not be an incomplete-report/max4 error.
2. Inclusive1796/1804 and center1800 acceptance by both the helper and the complete frozen proof.
3. One tick outside each edge (1795/1805) rejection by both, keeping each fixture's original previous point.
4. Failure export at actual ENTRY with two already-recorded prefix rows: exact ENTRY, previous point, diagnostic native/controller counter and recordedFrames2 survive JSON export alongside the unchanged caller-owned raw prefix. No phaseCompletion is needed or invented for the helper. Input mutation after rejection cannot change the scalar snapshot.
5. Native/controller parity rejection independently in ENTRY, previous RAF and diagnostic counter contexts.
6. The zero clamp, inclusive60000 count, invalid/overflow counts and invalid counters.

No execution result is claimed. Source inspection also checked compatibility with the existing erasable-TypeScript loader: the Error subclass uses an ordinary declared field and constructor assignment, not a parameter property.

## Proposed distinct V7 collector integration (design only)

No V7 main/runtime/diagnostics/launcher/build was authored here. A later reviewed implementation must use new V7 files and a distinct source/artifact/capture identity. Frozen V6 main/runtime/diagnostics and the V5 proof stay byte-exact. This design reports an already-required rejection earlier; it changes no pacing or measurement window.

1. Preserve nominal measurement collection and every attempted interval. Keep the original previousRaf selected by the first measured frame, even if ENTRY has not yet arrived. Assign it once; never choose a later preceding frame. Preserve all actual raw channels and the same capacity/overflow behavior.
2. Keep a per-arm one-shot boundary-check flag and nullable scalar diagnostic. If ENTRY arrives after previousRaf was selected, check synchronously in the ENTRY callback before admitting the next measured native tick, using that callback's actual ENTRY counter. If ENTRY existed first, check as soon as the first measured frame has been appended and its original previousRaf assigned, using the actual counter read for that RAF observation. Do not yield or insert a render to obtain a different counter. A successful predicate check sets only the one-shot flag; it is not acceptance.
3. Store `error.diagnostic` before propagating a boundary rejection. The existing terminal catch/cleanup path must retain the actual attempted prefix and diagnostics, including original ENTRY/previous, `frameCount`, current actual native/controller counter, last wait/return/render observations and current native cost ring. If a trigger has been observed but not appended by an existing guard, keep it in diagnostic fields without falsely claiming a recorded frame. An early ENTRY failure can legitimately have only the first two rows and null phaseCompletion; retain those facts.
4. Export INCOMPLETE/REJECTED with unchanged actual raw prefix channels; never synthesize a completion, pad channels, trim prefix rows or mark report/terminal/full acceptance. Export capacity failure must remain explicit, not truncate data. Native/controller parity faults still propagate and the caller's generic incomplete snapshot retains the original observations.
5. Completed arms still pass the unchanged full dual-clock proof, including its redundant boundary check and actual-counter/chronology gates. Preserve all independent parity, cleanup, source/artifact/raw identity and performance gates. Broader window/pacing changes require separate root review.

The full gate remains30s warm+120s measured, five alternating pairs/backend on actual foreground1920x1080/DPR1 hardware; max4 recovery, debt<=250ms, all raw deltas positive and <=250ms, both native/matchedRAF simulation/wall>=0.98, frame p95<=18.5/p99<=25ms, main p95<=10ms, tick<=5.5ms, step<=3ms, supported steady longtask<=50ms and >=3/5 regressions exceeding both10% and1ms fail. Unavailable GPU/heap/WASM values remain null. This helper neither waives nor measures any of these gates.

## Actual file SHA256

Read after source authoring; these identify bytes, not executed validation:

```text
tests/browser/yield-policy-v7/boundary.ts c97f8fb40112c813bbe6c9b27c679dc903e7cc518829c87f9d1eaa58a14617c0
tests/browser/yield-policy-v7/boundary.test.ts 63469d7e886ea883c3507aed33e58a7dbedd58e1839d8c6473c22213806273af
tests/browser/yield-policy-v5/clock-proof.ts b7c921f0ff4851bf087900a3e187f9fa71d8a7fdefbb9e52c233fd46ce289718
tests/browser/yield-policy-v6/main.ts 88d7d802f58ba2d94a03efec59030ebc61c62885bc6567c916d9d366241aee47
tests/browser/yield-policy-v6/runtime.ts 1a1a8ba8b0c7d282731dd6aea8a9a1668ab81e9a516d940d4107c2f3047b9287
tests/browser/yield-policy-v6/diagnostics.ts daf5b6a657c2bfa74d71c3a4dcc66484df2e5a2b1834ad833bb61f0309a8cf11
```

The three V6 current hashes were read before and after authoring and match; the three corresponding frozen files under `browser-v6-20261006T135845838Z/source/tests/browser/yield-policy-v6/` were also read and match those hashes. No full archive/raw rehash occurred, and no such result is implied. The handoff's own final hash is returned separately to avoid a self-referential hash.

## Proposed next finite CPU grant — commands NOT RUN

Root owns the separate grant and must keep each command under a finite external60s deadline, stopping at the first failure and retaining its output. Every command's cwd must be exactly `F:/Sites/self-driving-academy/.worktrees/yield-policy-01`. Use installed local tools; no install, broad npm check, world fixture, server, build or browser command is proposed.

```powershell
node --import ./scripts/register-typescript.mjs --test --test-timeout=10000 tests/browser/yield-policy-v7/boundary.test.ts tests/browser/yield-policy-v5/clock-proof.test.ts tests/browser/yield-policy-v6/diagnostics.test.ts
node ./node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022 --types node tests/browser/yield-policy-v7/boundary.ts tests/browser/yield-policy-v7/boundary.test.ts
node ./node_modules/eslint/bin/eslint.js tests/browser/yield-policy-v7/boundary.ts tests/browser/yield-policy-v7/boundary.test.ts --max-warnings 0
node ./node_modules/prettier/bin/prettier.cjs --check tests/browser/yield-policy-v7/boundary.ts tests/browser/yield-policy-v7/boundary.test.ts
```

The dependency closure for the test command is Node assertions/test runner, the existing TS loader, frozen pure clock-proof and pure diagnostics, and the new helper/test. The scoped tsc command is necessary because tsconfig.tests.json excludes tests/browser. These are proposed finite pure/static checks only; no PASS is asserted and no further workload is authorized here.

## Residual failure

The original full V6 attempt remains FAIL/INCOMPLETE with no completion/report/terminal PASS. Its actual1658.6000000238419ms await/continuation-read gap and1660ms RAF-stamp advance remain real; cause unknown. The boundary mismatch is a separate necessary proof rejection and does not explain that stall. The short separate isolation diagnostic did not reproduce it and does not establish its cause. No scheduling fix, performance PASS, hardware/full acceptance, identical rerun or PBI closure follows from this source-only change.
