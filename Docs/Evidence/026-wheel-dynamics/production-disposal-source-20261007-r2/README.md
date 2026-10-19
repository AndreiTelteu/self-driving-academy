# PBI026 normal Rapier disposal — SOURCE ONLY, all checks UNEXECUTED

Workdir: `F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01`. Read-only Git root/branch inspection confirmed this worktree and `loop-pbi/wheel-dynamics-01`. Root owns Git, canonical board and shared indexes. No child, commit/push, board move, package modification, runtime execution, formatter, typecheck, lint, test, native initialization/world, build, browser, server, worker or platform probe was performed. File reads, source edits and byte/hash inventories only; no CPU grant was used.

Read canonical AGENTS.md, PBI/AGENTS.md and In Progress/026 as task data, with Docs05/25/26, data/vehicle contracts and physics-adapter contract. Prior r1 ownership snapshot/inventories remain immutable. This round implements root's narrow normal-disposal decision and does not start or close any other PBI.

## Source change

`src/vehicles/rapier/probe-cleanup.ts` is a private seam imported only by the Rapier adapter, not exported through the public vehicles entry point. Its disposer checks mutable admission first, fences once, sets the existing probe disposed flag, then independently attempts collision registry disposal → named box clear → vehicle/body registry disposal → each owned controller removal in original Map insertion order → cars clear → dynamic collider JS clear → existing freeWorld closure. Rejected mutable admission leaves disposal retryable. All release callbacks run after the fence; reentrant/repeated calls return without native access. Only this probe's private admitted owners are supplied; no borrowed World is released.

A single failure is rethrown as the original object. Multiple failures produce AggregateError with original objects in attempt order, without flattening foreign aggregates or adding history. The private car Map's existing maximum110 admitted vehicles bounds causes to116 (six fixed release operations plus each controller); the helper trusts the native private Map iterator, not an external capability/iterator. This list adds startup/cleanup work only; its cost is UNMEASURED. The actual nominal registry order/generation invalidation and existing assertMutable restriction remain. No registry internals, body/controller remove path, admission, tuning, query filters, calculations or public API were rewritten.

`initializeOwnedWorld` remains byte-identical to r1: World.free is attempted once; reservation decrements only if actual free returns; failed free leaves ownership UNKNOWN and reservation occupied, with no retry. Normal disposal now reaches that closure despite preceding caught release faults. **Native engine/world internal partial exceptions remain UNKNOWN.** An individual registry dispose that fails internally may leave JS entries/listeners or identity cleanup incomplete; independent attempts are not proof every internal owner completed. Actual World.free may itself partially release and throw. Constructor pre-return native failures remain native ownership boundaries. No successful release, retention benefit, checksum, performance or acceptance claim is made from this SOURCE draft.

The setup-through-counts text before disposal is compared after newline normalization against this round's exact before-source. Rendering sources and pre-return guard remain byte-identical. after.json gives individual hashes and a SOURCE-only aggregate for all ten owned source paths; it is not a build/native/browser identity.

## Meaningful drafts — UNEXECUTED

Five new pure tests in `tests/vehicles/probe-cleanup.test.ts` exercise actual private cleanup/once-world helpers: nominal insertion order and reentry at every owner; each single fault (including a foreign AggregateError) with original identity and all later attempts; all nine fixture owners throwing with ordered references; first/last controller faults with middle controller still attempted and successful reservation release; mutable rejection followed by permitted disposal. The pure world-free fault retains capacity without intentionally leaking a native world. These join eleven existing r1 pure drafts (total16); none has been executed against the new source.

One added native test in `tests/vehicles/rapier-factory-ownership.test.ts` drafts six serial actual-probe scenarios: success, collision registry error after real registry cleanup, body registry error after real cleanup, controller fault before removal, controller fault after real removal, and combined faults. It checks each of three controller attempts, exact errors, reentrant disposal/admission fencing, token/subscription cleanup, one real World.free, then unchanged next-world admission. Fault/reentry seams patch test-process prototypes and restore in finally; installed packages remain untouched. Every free calls the original native free. World.free owns any controller left by the before-removal fault. No native free failure is injected. This joins the prior pre-return native draft (total2 tests; four old plus six new scenarios). These drafts cannot prove native internal partial failures safe.

## Proposed finite commands — NONE EXECUTED

Root review and an explicit serial grant precede each group. Every invocation must set the assigned workdir. Preserve first failure/new exact sources in a new immutable directory; never overwrite this r2 snapshot after any repair or formatting.

Pure/static group:

```powershell
node --import ./scripts/register-typescript.mjs --test --test-concurrency=1 tests/rendering/backend.test.ts tests/rendering/backend-ownership.test.ts tests/vehicles/world-ownership.test.ts tests/vehicles/probe-cleanup.test.ts
node F:/Sites/self-driving-academy/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node F:/Sites/self-driving-academy/node_modules/typescript/bin/tsc --noEmit -p tsconfig.tests.json
node scripts/verify-architecture.mjs
node F:/Sites/self-driving-academy/node_modules/eslint/bin/eslint.js src/rendering/backend-policy.ts src/rendering/babylon/backend.ts src/rendering/babylon/partial-cleanup.ts src/vehicles/rapier/index.ts src/vehicles/rapier/world-ownership.ts src/vehicles/rapier/probe-cleanup.ts tests/rendering/backend-ownership.test.ts tests/vehicles/world-ownership.test.ts tests/vehicles/probe-cleanup.test.ts tests/vehicles/rapier-factory-ownership.test.ts --max-warnings 0
node F:/Sites/self-driving-academy/node_modules/prettier/bin/prettier.cjs --check src/rendering/backend-policy.ts src/rendering/babylon/backend.ts src/rendering/babylon/partial-cleanup.ts src/vehicles/rapier/index.ts src/vehicles/rapier/world-ownership.ts src/vehicles/rapier/probe-cleanup.ts tests/rendering/backend-ownership.test.ts tests/vehicles/world-ownership.test.ts tests/vehicles/probe-cleanup.test.ts tests/vehicles/rapier-factory-ownership.test.ts
```

Separate exclusive native grant after source checks:

```powershell
node --import ./scripts/register-typescript.mjs --test --test-concurrency=1 tests/vehicles/rapier-factory-ownership.test.ts
node --import ./scripts/register-typescript.mjs --test --test-concurrency=1 tests/vehicles/physics.test.ts tests/vehicles/physics-adapter.test.ts
node --import ./scripts/register-typescript.mjs scripts/benchmark-wheel-dynamics.mjs after after-production-disposal-r2
node scripts/verify-wheel-dynamics.mjs --after-capture=after-production-disposal-r2
```

Root must verify the capture label is new and its closure includes both world-ownership.ts and probe-cleanup.ts; archive actual artifacts and all ten runs/cleanup, bind the numeric reader to this fresh production AFTER, and compare immutable BEFORE. Historical AFTER-main-027 b696 and historical r3/v2 finite25PASS do not represent this source. New build, instrumentation pricing and actual foreground WebGPU/WebGL2 acceptance require separate grants, retaining original thresholds/calculations/baseline. Legacy RAF stall cause remains UNKNOWN and all gates unchanged/unwaived.

## Immutable handoff

before.json inventories ten owned paths (two new paths absent) and protected historical originals/r1/r3/v2 snapshots plus current21-file v2 harness before edits. Exact eight old sources are in before-source; ten current source files are in source. after.json records byte/hash preservation, unchanged nominal segment hashes and exact current files. completion.json inventories handoff files; future-exact-paths.txt lists exact future staging paths for root only. No prior evidence file or v2 harness source changed. No board/index update or PBI completion occurred. No processes or delegated work owned; stop idle for root review, then any finite grant.
