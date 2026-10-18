# PBI052 V7 collector finite pure/static checks 01

2026-10-18. `SCOPED_STATIC_PASS` with the first failure preserved. All commands used explicit cwd
`C:/Users/aandr/Sites/self-driving-academy/.worktrees/yield-policy-01`, the installed local tools from the
repository root (the worktree has no `node_modules` of its own), and stop-at-first-failure ordering.

This round implements exactly the finite pure/static batch proposed by the R4 source handoff
(`../v7-source-handoff-r4/report.md`, "Proposed finite commands"). It does not run any build, preparation,
server, native/world, browser or Git command, and it does not claim performance or hardware acceptance.

## Actual execution

Seven serial static tool invocations: six exit0, one exit1, zero timeouts. The single failure is the initial
`05-scoped-prettier-check` on six authored sources; formatting was then written and re-checked. Every check
after the write passes.

| Command | Exit | Notes |
| --- | --- | --- |
| 01-pure-tests | 0 | 30/30 pass (boundary 6 + clock-proof 8 + V6 diagnostics 5 + V7 observations 11) |
| 02-targeted-tsc-tests | 0 | strict `--ignoreConfig` tsc over observations/boundary tests |
| 03-targeted-tsc-collector | 0 | strict collector tsc over main/runtime/diagnostics/observations/protocol |
| 04-scoped-lint | 0 | ESLint `--max-warnings 0` over the seven TS/MJS sources |
| 05-scoped-prettier-check | 1 | FAILED: style issues in main/diagnostics/observations/observations.test/protocol/server.mjs |
| 06-scoped-prettier-write | 0 | writes only the nine authorized V7 files |
| 07-scoped-prettier-recheck | 0 | PASS after the write |

The first failure is retained byte-exact in `05-scoped-prettier-check.{json,stdout.txt,stderr.txt}`. As in the
earlier boundary rounds, `Docs/` is excluded by the repository `.prettierignore`, so an empty ignore file
(`empty.prettierignore`) is passed explicitly to check the handoff-adjacent sources.

Each JSON receipt in `commands.json` / `commands-remaining.json` records executable, exact argv, explicit cwd,
start/end UTC, exit code, timeout flag and the stdout/stderr stream filenames.

## Source hashes after formatting

Formatting changed six files, so the R4 handoff's provisional fingerprints for those files are superseded.

```text
boundary.ts          c97f8fb40112c813bbe6c9b27c679dc903e7cc518829c87f9d1eaa58a14617c0  (unchanged, R4)
boundary.test.ts     2e5d699bfd78c33190c0119162fee41b6c56891eec5ea6e22b7161f774cc9b19  (unchanged, R4)
runtime.ts           e6a1a603787233d41b8a0c1d766178e75be22ef080ec0bb5024575cb7dd7fbce  (unchanged, R4)
index.html           e142b371509df7d94e836c22ca5a9774bb897852ab0aa1f8e820357a8d4311e2  (unchanged, R4)
verify.mjs           231cd90b47b6710e293824c3147591bfc5ddce7796545c516e94cee923297ae3  (unchanged, R4)
main.ts              30ff52dbe420f6649ca3fa9d29816de36673621ff833ae136e18fea06b70d20c  (formatted)
diagnostics.ts       32eaa9fe0828e2878149c9b62a739eb25369a5e823ee84766a5eb8ee98964ca8  (formatted)
observations.ts      fcec9019d774597c6e5dff9169a1ed280f16b475f945bd03e653195b1fc1bf0d  (formatted)
observations.test.ts d1e5386cdbe9973c4ee564ad289da25b2971f93b29804709048c80a25487f67d  (formatted)
protocol.ts          2b64dfa0c678cb9c00038fbad069ef85ab22fb55a5da5c5f268655f08a2d4f7f  (formatted)
server.mjs           b64eeb4a64452ff2a2f009227f75fd14b85d7e653eafd965cb68ceb513a92a3f  (formatted)
```

Only whitespace/Prettier changes were applied; no logic was edited. The R4 aggregate 92-input fingerprint
`90de66c8…` is therefore stale for any future preparation/build identity and must be recomputed by the future
authorized builder against its own discovered input closure.

## Limits

This is a finite pure/static result. It does not validate the collector's runtime behaviour, the browser
harness, the native fixture, the hardware performance gates or the scheduling stall.

- Original V6 remains FAIL/INCOMPLETE: actual `1658.6000000238419 ms` await/continuation gap and `1660 ms`
  RAF-stamp advance, cause unknown. Boundary mismatch remains a separate necessary rejection.
- No native/world/browser/build/server/preparation command ran. GPU/heap/WASM unavailable values stay null.
- Canonical PBI052 remains In Progress; no criterion is checked and no Done is claimed.

## Next authorized step (not run)

After this static pass, the remaining work is runtime and hardware:

1. A distinct V7 preparation/build (reconciling the real closed input list and rehashing) under a separate
   CPU grant, then
2. the distinct V7 short smoke / full foreground slot per `Docs/yield-policy.md` ("Browser acceptance
   remaining") and the targeted-validation policy, which requires operator foreground presence.
