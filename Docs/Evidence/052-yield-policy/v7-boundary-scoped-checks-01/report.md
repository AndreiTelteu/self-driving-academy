# PBI052 V7 boundary finite scoped checks 01

2026-10-07. PARTIAL_CHECKS / STOPPED_AT_TOOL_RESOLUTION_FAILURE. CPU RELEASE after the final child process exited at 2026-10-07T18:39:07.6223222Z. No ongoing test process or delegated child remains from this round.

Every terminal call used explicit cwd `F:/Sites/self-driving-academy/.worktrees/yield-policy-01`. Direct file reads verified `.git` points to `F:/Sites/self-driving-academy/.git/worktrees/yield-policy-01` and its HEAD names `refs/heads/loop-pbi/yield-policy-01`. No Git command ran. Canonical root PBI/AGENTS.md and PBI/In Progress/052-auto_yield.md were read as data, alongside module06, Docs25/manifest203, yield-policy, behavior/priority/scheduling contracts and the prior resume-source-review-01 and follow-up052-v7-boundary-source-handoff documents. The worktree's older To Do copy is not the canonical board. Neither copy was changed.

## Actual execution

The evidence runner `run-checks.ps1` starts each proposed Node command directly with a structured argument list and explicit working directory, asynchronously drains stdout/stderr, applies an external 60000ms process deadline and would kill that process tree on timeout. It stops after the first nonzero exit or timeout. Exact executable/argv, start/end UTC, exit, timeout flag, output file names and full source-before/source-after fingerprints are retained in each command JSON and `commands.json`. Both executed commands finished normally before their external deadline.

| Command | Start UTC | End UTC | Exit | Actual result |
| --- | --- | --- | --- | --- |
| Pure boundary + frozen clock-proof + diagnostics tests | 18:39:07.1782890 | 18:39:07.5113551 | 0 | 19 tests passed: 6 boundary, 8 clock-proof, 5 diagnostics; 0 failed/cancelled/skipped/todo; runner reports 0 suites, 215.7343ms |
| Targeted strict tsc | 18:39:07.5353207 | 18:39:07.6223222 | 1 | MODULE_NOT_FOUND before TypeScript loaded |
| Scoped lint | — | — | — | NOT EXECUTED after failure |
| Scoped Prettier write, two new TS files + source handoff only | — | — | — | NOT EXECUTED after failure |
| Same scoped Prettier check | — | — | — | NOT EXECUTED after failure |

The test stream contains three Node `ExperimentalWarning: stripTypeScriptTypes` notices (one per test-file process). These are retained in the actual output; they are not test failures. There are no failed test assertions. Node reports v24.21.0 in the failed tsc error.

The exact failure is inability to resolve `F:\Sites\self-driving-academy\.worktrees\yield-policy-01\node_modules\typescript\bin\tsc`. This is the proposed tool path failing to load, not a TypeScript diagnostic and not a demonstrated boundary source bug. No installation, tool-path substitution, source fix, rerun or further checks were attempted. The original stdout/stderr and failure are preserved. Static validity, lint cleanliness and formatting remain unverified in this round.

## Final fingerprints and unchanged guards

All entries in `before.json` equal `after.json`, and each executed command has matching per-command fingerprints. The two new source files and the source handoff are unchanged:

```text
tests/browser/yield-policy-v7/boundary.ts c97f8fb40112c813bbe6c9b27c679dc903e7cc518829c87f9d1eaa58a14617c0
tests/browser/yield-policy-v7/boundary.test.ts 63469d7e886ea883c3507aed33e58a7dbedd58e1839d8c6473c22213806273af
Docs/Evidence/052-yield-policy/follow-up052-v7-boundary-source-handoff.md e44d8ee4e568d4c52c85b339e69115ff58a01d69f7a9b87b42079538d2be115c
tests/browser/yield-policy-v5/clock-proof.ts b7c921f0ff4851bf087900a3e187f9fa71d8a7fdefbb9e52c233fd46ce289718
tests/browser/yield-policy-v6/main.ts 88d7d802f58ba2d94a03efec59030ebc61c62885bc6567c916d9d366241aee47
tests/browser/yield-policy-v6/runtime.ts 1a1a8ba8b0c7d282731dd6aea8a9a1668ab81e9a516d940d4107c2f3047b9287
tests/browser/yield-policy-v6/diagnostics.ts daf5b6a657c2bfa74d71c3a4dcc66484df2e5a2b1834ad833bb61f0309a8cf11
```

The three captured V6 files under `browser-v6-20261006T135845838Z/source/tests/browser/yield-policy-v6/` match the corresponding current V6 hashes before/after. Frozen clock-proof.test.ts and diagnostics.test.ts also match before/after. This is a finite source guard, not a full archive/raw rehash. Old archives/raw and all product/clock-proof/V6 sources were not modified. Only this fresh evidence directory was written.

## Limits and ownership

No native/world, CPU benchmark, CIM, build, browser, server, preparation, Git, board validation/mutation or subagent work ran. The authorized pure Node test command used its test-runner processes; none were agent children. Root040 product SOURCE and 069 SOURCE02 ownership remain separate, and 026 remains idle with no Run.

The passing synthetic tests demonstrate the exact inclusive ±4 predicate, reject the retained 1789/ENTRY1800 prefix, cover both one-tick outside edges, detached failure export, parity and count/counter limits. They do not integrate a V7 collector, repair scheduling or explain the original stall.

The original V6 full attempt remains FAIL/INCOMPLETE; its 1658.6000000238419ms await/continuation gap and 1660ms RAF-stamp advance remain actual, with cause unknown. No completion/report/terminal or performance PASS is inferred. Actual foreground hardware dual-backend 30s warm/120s measured, five alternating pairs, raw clock/debt/frame/main/tick/step/longtask and cleanup/identity gates remain unexecuted here. Unavailable GPU/heap/WASM remain null. PBI052 remains canonically In Progress; no Done claim or board operation.
