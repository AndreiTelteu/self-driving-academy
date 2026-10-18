# PBI052 V7 R4 source handoff

2026-10-07. SOURCE_ONLY / UNEXECUTED. Terminal round R4; no child agents or continuation of a previous delegated task. This is a reviewable source handoff before any checks, preparation, build or hardware run. No performance PASS or PBI Done.

Every terminal command used explicit cwd `F:/Sites/self-driving-academy/.worktrees/yield-policy-01`. Direct `.git`/HEAD data identify `loop-pbi/yield-policy-01`. Read canonical root PBI/AGENTS.md and PBI/In Progress/052, module06, full Docs25, manifest203 and relevant local contracts, prior resume-source-review/source-handoff, and finite-checks01/02 reports as data. The checkout's older To Do PBI is not canonical. Board/Git/shared product sources remain root-owned; neither board copy was edited. Root069 owns the exclusive finite CPU slot, root040 product SOURCE,026 idle pending user.

Prior evidence, not this round's execution:19/19 pure PASS and three final static gates PASS, after corrected absolute installed CLI paths and `--ignoreConfig`; first tool-resolution/TS5112 failures remain preserved. CPU release was2026-10-07T18:42:51.4519288Z. All new code below is unexecuted. No test/type/formatter/lint/AST/world/native/CIM/build/server/browser/Git/board validator/subagent command ran. Only file/source/document reads, source writes, and finite byte fingerprints ran.

## Smallest semantic change and exact files

Nine new sources, all under `tests/browser/yield-policy-v7/`:

| File | Change relative to V6 or new responsibility |
| --- | --- |
| main.ts | Retains V6 pacing, rendering, actual-counter reads, raw channels, full windows and gates. Adds one-shot boundary owner at the two possible arrival sites, callback/start/read-clock observations and bounded longtask ownership/export. |
| runtime.ts | V6 runtime bytes retained except one explanatory V7 header comment. No physical, scheduling, clock or phase callback logic change. |
| diagnostics.ts | V6 bounded latest observations/four-cost ring plus optional actual RAF callback and continuation-start/counter-read clocks. |
| observations.ts | Pure injected RAF callback observation, one-shot exact checked boundary integration, and bounded longtask drain/disconnect owner. |
| observations.test.ts | Eleven authored pure adversaries; no execution result. |
| protocol.ts | Re-exports the original frozen V5 full protocol/functions/capacities. Adds strict optional diagnostic metadata semantics and a distinct observation revision. |
| index.html | V7 diagnostic identity text only; same canvas, backend choices, full30/120 and smoke1/3 controls. |
| server.mjs | V6 loader/build/archive/transport patterns with distinct V7 entrypoints/root/cache/evidence prefix, revision metadata and proposed port5217. Adds wx for new live manifest/hardware files. |
| verify.mjs | V6 full source/artifact/native/ZIP/inventory/parity/absolute/relative checks retained. Requires V7 revisions and diagnostic semantics for every retained completed arm before the inherited full proof. |

The two existing V7 boundary sources were not edited. V6/clock-proof/raw/captures/old reports were not edited. No wholesale source/archive copy outside the owned V7 directory. This unique evidence directory contains only this report and three small source inventories. `source-inventory.json` and `source-inventory-final.json` preserve earlier authoring snapshots. `source-inventory-reviewed.json` is authoritative after source review corrected the reader's successful-boundary/later-partial prefix relation. None of the inventories is a test/build result.

## Actual boundary and failure retention

`warmBoundaryObservation.check()` returns without attempting when either actual point is absent. It sets its one-shot flag before calling the already-checked `assertActualWarmBoundary` and retains `WarmBoundaryRejection.diagnostic` before propagating. A subsequent call cannot retry even after rejection. No later previous point is chosen.

Main still selects `previousRaf = lastRaf` exactly once, after appending the first measured frame with the original attempted raw rows. If ENTRY already exists, the check runs there with that RAF's actual counter and recorded count. If the original previous point exists first, the check runs synchronously in the actual ENTRY callback before admitting the next measured native step, with ENTRY's actual counter. The helper applies the frozen inclusive +/-4 predicate without substituting nominal target ticks. Native/controller parity remains required.

The existing failure path still disposes native/renderer ownership and exports INCOMPLETE metadata plus the exact caller-owned raw prefix in original channel parts. Metadata adds the scalar boundary result/current actual trigger. No completion, tail, report, acceptance or synthetic rows are fabricated. Existing guard failures before raw append retain the observed triggering wait/return separately. Generic parity errors retain their original partial/native diagnostic path; they are not relabelled as boundary rejection.

## Callback versus continuation

`observeRaf` takes `performance.now()` inside the actual callback before resolving its Promise. The original RAF stamp is returned unchanged. Main retains the existing `start = performance.now()` after await as `continuationStartMs`, then retains the original actual-counter `observedAtMs` as both old `callbackReadMs` and explicit `continuationReadMs`. The old name keeps its actual V6 meaning; it is not retroactively a callback read.

Callback and continuation-start are stored before attempting the actual counter read, so they also survive a counter-read exception. Counter-read time remains unavailable in that case. Original per-frame raw RAF stamps, raw counter-read clocks, native ENTRY/COMPLETION times, debt guards and timing channels remain intact. New callback timestamps are latest diagnostic observations, not an added unbounded per-frame channel or a reconstructed history. Main-work measurement still begins at the original continuation start and includes the extra diagnostic copies.

## Longtask observations and unknown coverage

Retain at most1024 scalar `{startTime,duration}` entries including setup/warmup. Existing steady-state count/max filtering remains `firstWall >0 && startTime >= firstWall + warmupSeconds*1000`. Delivered count, retained entries, overflow and invalid counts are separate. Every overflow/invalid item is explicitly accounted for; completion rejects any overflow/invalid data. Summary count/max still include valid overflow items, so overflow cannot hide an observed maximum. No exact heap/observer-cost claim.

`finish()` takes queued records before disconnect, once. It attempts disconnect even if drain fails, preserves both errors through AggregateError if both fail, and exports actual acquired/attempted/drained/disconnected flags. On success it runs before result snapshot; on failure the existing lifetime release drains/disconnects before partialSnapshot. Repeated disposal does not retry either operation. Unsupported API, failed drain/disconnect and late undelivered records remain distinguishable from zero delivered tasks.

Coverage is explicitly `delivered callbacks plus takeRecords before disconnect; later delivery unknown`, with cause UNKNOWN and diagnostic acceptance false. Empty delivered entries do not prove absence of a blocking cause. No GC/OS/compositor attribution, no stall waiver.

The reader checks bounded accounting, retained/overflow summary consistency, disposal flags, measured-start identity, callback/continuation chronology and the old read-clock alias. Boundary metadata must match the original ENTRY/previous and attempted raw prefix count. Diagnostics are optional for historical schemas, mandatory for distinct V7 completed captures. Failed inventory still fails the original full reader; the exported pure metadata reader can inspect partial semantics with `complete=false` and does not grant acceptance. The original store remains unchanged and still owns immutable submitted/rejected/raw transport and full gates. V7 metadata checking is an additional read-only verification gate, not a replacement admission path.

## Authored pure adversaries

Eleven new tests cover both observation arrival orders; rejection with unchanged original prefix/current trigger and no later-previous retry; successful one-shot predicate; callback before Promise resolution versus delayed continuation; callback/start retention on failed counter read; partial queued-record drain order and detached export; combined callback+drain overflow with honest summary and rejected completion; drain failure, disconnect failure and combined-error ownership with no retry; unsupported/invalid observations; exact inherited full-validator function identity; completed diagnostic corruption of previous-point identity, old clock alias and disposal flags; and a longer later partial prefix after a successful boundary check. For boundary REJECTED, recorded count must equal the failure prefix exactly; a successful earlier boundary count may be smaller than a later partial prefix. Existing boundary6/clock-proof8/V6diagnostics5 tests remain available and unchanged. These are synthetic source adversaries, not new actual timing evidence.

## Source fingerprints and closed imports

Final aggregate candidate source SHA256:

```text
90de66c8daea1c7dc06a254a9e0bdbb4ab8f37e568d190d0a7a1b3265580f8e8
```

This hashes92 current input paths and bytes using the original builder's sorted ordinal path+bytes scheme. The input list inherits the original captured89-input closure, replaces its six V6 owned entries with V7 counterparts, and adds boundary/observations/protocol. No AST/build scanner was executed; this is a manual inherited closure fingerprint, not a prepared build identity or proof that concurrently root-owned sources are frozen. A future separately authorized builder must discover/reconcile its actual closed input list and rehash before building.

New executable local edges are closed: main -> V7 observations/diagnostics/runtime/protocol; observations -> unchanged V7 boundary -> frozen V5 clock-proof; protocol -> observations and frozen V5 protocol/clock-proof; verify -> V7 protocol; server -> unchanged V5 store/V2 transport. Runtime/public Babylon/Rapier/product dependencies retain the original import patterns and are enumerated with byte hashes in the final inventory. No V7 production entry imports V6 collector sources or the source tests. The server includes itself/verifier/HTML/loader/package lock/budget manifest in provenance just as V6 did. Test closure is Node test/assert plus erasable TS loader, V7 pure files and frozen pure protocol/clock-proof/diagnostics; no server, renderer or world import.

Exact new-file SHA256:

```text
main.ts              39cd0f09347ccb959393155f3673d25d3e715007a1a15063977c99a69e893890
runtime.ts           e6a1a603787233d41b8a0c1d766178e75be22ef080ec0bb5024575cb7dd7fbce
diagnostics.ts       4c305de356cd9a2468907878f726c45578a1c401666691270a3e21d590e620f7
index.html           e142b371509df7d94e836c22ca5a9774bb897852ab0aa1f8e820357a8d4311e2
protocol.ts          c2b392a19342e940a2773d1e16cef1fdee58c3b2497a8968f85b001c71725c39
server.mjs           5b68191a7b1fb4d6bf3a2dbc8b9ab4389b08021a568c37f4cd175c710ddb2ea3
verify.mjs           231cd90b47b6710e293824c3147591bfc5ddce7796545c516e94cee923297ae3
observations.ts      97658ae9cd0457fb070719a983196a7f362e6eb1d78004886e343be8138d1713
observations.test.ts 3b0e295a287348a081d4f17dafe20df2b073c9eb9af3256025ab40160046bf09
```

The three current/captured V6 guards retain main88d7d802, runtime1a1a8ba8 and diagnosticsdaf5b6a6; frozen clock-proof remainsb7c921f0. Unedited boundary remainsc97f8fb4 and boundary.test2e5d699b. Full hashes are in the inventories. No old raw/archive rehash occurred, and no raw/archive integrity result is newly claimed.

## Design objections before checks/preparation/build

1. Exact boundary rejection may terminate V7 near ENTRY, long before the original tick3801 stall. That is an existing necessary rejection, not a scheduling repair. Do not use a V7 full retry as an implicit stall diagnostic or replace the selected previous point.
2. Extra callback reads, bounded observer entries/copies and drain have unmeasured overhead. All original budgets still apply.1024 is a declared conservative diagnostic capacity; overflow is an explicit failure even if another timing gate would pass. No silent drop or automatic capacity adjustment.
3. The manual92-input aggregate must be reconciled with actual scanner discovery under a later CPU/build grant and with root-owned source stability. Port5217 is proposed only; root must reserve it before any execution. Build/source/artifact/capture identities are distinct via V7 paths, revision, source hash, absent build/cache root and wx archive/capture files. No V7 artifact/capture exists yet.
4. New formatting, TypeScript, lint and runtime compatibility are unverified. The unchanged V6 erasable-TypeScript loader is used; new source uses no parameter properties or runtime enum. No new package/install is required. This report precedes all checks, including syntax-only execution.

## Proposed finite commands — NOT RUN

Root retains authorization/CPU ownership. Each command needs its own external60000ms process deadline, structured argv/output receipt and stop-at-first-failure policy, always the assigned absolute cwd. Existing pure/static outcomes do not validate these new sources. No install, npm-wide check, AST, native/world/server/build/browser command is proposed in this finite batch.

```powershell
node --import ./scripts/register-typescript.mjs --test --test-timeout=10000 tests/browser/yield-policy-v7/observations.test.ts tests/browser/yield-policy-v7/boundary.test.ts tests/browser/yield-policy-v5/clock-proof.test.ts tests/browser/yield-policy-v6/diagnostics.test.ts

node F:/Sites/self-driving-academy/node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022 --types node tests/browser/yield-policy-v7/observations.test.ts tests/browser/yield-policy-v7/boundary.test.ts

node F:/Sites/self-driving-academy/node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --noUnusedLocals --noUnusedParameters --noFallthroughCasesInSwitch --isolatedModules --allowImportingTsExtensions --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM,DOM.Iterable --types vite/client tests/browser/yield-policy-v7/main.ts tests/browser/yield-policy-v7/runtime.ts tests/browser/yield-policy-v7/diagnostics.ts tests/browser/yield-policy-v7/observations.ts tests/browser/yield-policy-v7/protocol.ts

node F:/Sites/self-driving-academy/node_modules/eslint/bin/eslint.js tests/browser/yield-policy-v7/main.ts tests/browser/yield-policy-v7/runtime.ts tests/browser/yield-policy-v7/diagnostics.ts tests/browser/yield-policy-v7/observations.ts tests/browser/yield-policy-v7/observations.test.ts tests/browser/yield-policy-v7/protocol.ts tests/browser/yield-policy-v7/server.mjs tests/browser/yield-policy-v7/verify.mjs --max-warnings 0

node F:/Sites/self-driving-academy/node_modules/prettier/bin/prettier.cjs --check --ignore-path Docs/Evidence/052-yield-policy/v7-boundary-scoped-checks-02/empty.prettierignore tests/browser/yield-policy-v7/main.ts tests/browser/yield-policy-v7/runtime.ts tests/browser/yield-policy-v7/diagnostics.ts tests/browser/yield-policy-v7/observations.ts tests/browser/yield-policy-v7/observations.test.ts tests/browser/yield-policy-v7/protocol.ts tests/browser/yield-policy-v7/index.html tests/browser/yield-policy-v7/server.mjs tests/browser/yield-policy-v7/verify.mjs Docs/Evidence/052-yield-policy/v7-source-handoff-r4/report.md
```

Scoped collector tsc includes its real product dependency types but executes none of them. If a tool fails, preserve its first output and stop; no broadening/retry/format write is authorized by this report. Future source formatting changes invalidate these source hashes and need a new fingerprint. There is no build/run command in this handoff.

## Conditional short diagnostic plan, not a run instruction

Only after root reviews new observability and separately authorizes its pure/static results, distinct preparation/build and foreground slot: consider one distinct isolation diagnostic per actual WEBGPU and WEBGL2 backend with an actual native phase of70s and at least4200 committed60Hz ticks (3801 is63.35 simulated seconds). End only after both actual native duration>=70s and tick coverage are satisfied; record failure/partial instead of extending a failed phase, and retain finite wall/debt limits. Keep existing preceding isolation phases bounded, setup/warm observations and actual zero cleanup. Preserve backend/hardware/source/artifact/capture identity, original stamp/counter-read clocks, new callback/start/read clocks and bounded drained longtasks.

The justification is precisely the new callback-versus-continuation split and failed-arm drained longtask coverage, plus the previous isolated native phase ending at2400ticks/40s. A distinct isolation fixture has different coverage/scene/overhead and is DIAGNOSTIC_ONLY, never full acceptance. It must not suppress the V7 full collector's warm-boundary/debt/clock gates, change dt, pacing or scheduling, or exclude a stall. Root should reject this optional plan if that coverage gain is insufficient. No automatic run/full retry; no causality inferred from reproduction or non-reproduction alone.

## Original gates and unresolved outcome

Full30s warm/120s measured, five alternating pairs per backend; both real foreground hardware backends1920x1080/DPR1; max4 recovery/debt250ms; positive raw intervals<=250ms; both actual native and matchedRAF ratios>=0.98; original frame p95<=18.5/p99<=25, main<=10, authoritative tick<=5.5, step<=3ms; supported steady longtask<=50ms; confirmed>=3/5 regressions exceeding both10% and1ms fail, alongside every absolute gate. Raw completeness, parity, immutable identity and actual zero cleanup remain mandatory. GPU/heap/WASM unavailable stay null.

Original V6 remains FAIL/INCOMPLETE: actual1658.6000000238419ms await/continuation gap and positive1660ms RAF-stamp advance. Callback delivery timing for that original failure is unknown. Boundary mismatch remains a separate necessary rejection. No GC/OS cause, scheduling fix, adaptive dt, stall waiver, performance/full acceptance or PBI closure. Canonical052 remains In Progress. R4 has no child tasks and stops at this source handoff; any independent review is a newly delegated review round, not a continuation through a previous childThreadId.
