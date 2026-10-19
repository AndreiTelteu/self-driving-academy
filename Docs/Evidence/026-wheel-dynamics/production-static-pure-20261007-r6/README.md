# PBI026 finite CPU STATIC/PURE handoff

Assigned workdir: `F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01`; initial read-only Git root/branch inspection confirmed `loop-pbi/wheel-dynamics-01`. Canonical AGENTS/PBI AGENTS/IP026 and referenced Docs05/25/26, wheel-dynamics, physics-adapter and vehicle contracts were read as task data. This round exercised only the explicit finite CPU static/pure grant. No native initialization/world/native-factory execution, benchmark, build, browser, server, platform probe, worker, Git mutation, board/index update, child delegation, commit or push occurred. Full root npm check was not required or executed.

## Actual results

The exact command catalog, root-installed binary paths/hashes and node executable hash were preserved in commands-before.json before the first check. Each product command ran sequentially using spawnSync with explicit cwd, no shell, and a 60-second timeout; all reached normal terminal exits without a timeout/signal. Its individual JSON records actual UTC start/end, elapsed milliseconds, executable/arguments/workdir, exit, source hash, and raw stdout/stderr byte counts/SHA256. Experimental TypeScript-loader warnings remain in the actual streams.

| Check | First exit | Final exit | Result |
| --- | --- | --- | --- |
| Four-path pure test command | 0 | 0 | 22/22 PASS: existing backend 6, backend ownership 8, world ownership 3, probe cleanup 5; no failures/skips/cancellations |
| tsconfig.json | 0 | 0 | PASS |
| tsconfig.tests.json | 0 | 0 | PASS; native factory test parsed/types only |
| Ten owned TS ESLint, max warnings 0 | 1 | 0 | First prefer-const error preserved; narrow fix verified |
| Ten owned TS Prettier check | 1 | 0 | First seven file warnings preserved; scoped write exit 0 |
| Architecture | 0 | 0 | 111 source files; 6 dependency, 4 inspector and 3 Rapier negative probes; pure injection/lifecycle assertions PASS |

The first source was archived before checks in source-before, including all 319 selected source/test/script/config inputs. First lint/format failures refer to those exact bytes. The sole declaration repair removes the forward `let dispose` and initializes `const dispose` where the helper is created; its callbacks still close over that declaration and reentry assertions remain intact. source-before-format preserves this exact narrow repair before formatting. Prettier wrote only the ten authorized paths; seven changed and three remained exact. source-final preserves final bytes. Verification confirms each final owned file is exactly Prettier's output from source-before-format, the declaration fix matches the two intended text edits, and all 309 selected inputs outside the ten owned paths remain unchanged. No assertion, gate, contract, physics, tuning, query or public API change was made.

Initial ten-path SOURCE hash: `edc931025108e0469eef9c9cf0593615c67d0cd4d7018ff741a5bf4ea57de0ad` (matches r2). Final ten-path SOURCE hash: `1256a2441becc63a7d8765236a0772fd4bc0570721f1bef7fb666d1ff3c00cd0`. Algorithm: sorted UTF8 relative path followed by raw file bytes, SHA256. This is a scoped SOURCE identity, not a current native/build/browser closure or performance claim.

## Preservation

protected-before.json and protected-after.json rehash all 1,052 pre-existing files under this PBI's evidence tree plus the current v2 harness; zero mismatches. Explicit manifest checks confirm all r2 protected304 entries, all139 originals declared by r1, and current21 v2 harness files. Original r1/r2 byte copies/completions and all historical/v2 evidence remain untouched. The small v2 handoff preserved-originals.json contains eight entries (verified separately); it is not the139-entry inventory, which is independently verified from r1 after.json in terminal-handoff.json.

The additional evidence verifier initially failed before execution because its Windows absolute ESM import needed a file URL. Its original source is retained in finalize.mjs; finalize-first-failure.txt honestly preserves the tool-returned error text and exit/time, rather than claiming raw bytes. finalize-r2.mjs changes only that import and passed the independent source/preservation assertions. Product first failures and all product command streams retain raw-byte capture.

CPU released after terminal checks and static verification. No owned process remains active. PBI026 is not Done.

## Remaining work and proposed separate native commands

Two native factory tests covering ten serial scenarios remain UNEXECUTED. Native engine/world internal partial failures remain UNKNOWN; the pure free fault proves capacity is retained by the JS guard, not native release safety. No hardware cause, retention benefit or performance acceptance is established. Historical r3 harness25PASS and AFTER-main-027 b696 remain HISTORICAL.

Proposals only, requiring a separate exclusive native grant, each with explicit assigned workdir and new immutable command/source/stream evidence before execution:

```powershell
# workdir: F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01
node --import ./scripts/register-typescript.mjs --test --test-concurrency=1 tests/vehicles/rapier-factory-ownership.test.ts
node --import ./scripts/register-typescript.mjs --test --test-concurrency=1 tests/vehicles/physics.test.ts tests/vehicles/physics-adapter.test.ts
```

The r2 benchmark/verify proposal is not part of this grant and must not run yet. The legacy reader/server still pin b696 and calibration-v2. Root SOURCE review must first establish a distinct CURRENT native provenance binding, capture chronology and raw failure-envelope preservation without replacing original baseline/pins or weakening gates. Fresh native capture/calibration, new production build, instrumentation pricing and foreground WebGPU/WebGL2 acceptance remain separate work and require their own grants. No alternative perf/build command is approved here.

terminal-handoff.json contains actual final command records, individual source hashes, change/preservation details and explicit CPU release. completion.json inventories every other file in this new handoff directory; previous handoffs remain immutable.
