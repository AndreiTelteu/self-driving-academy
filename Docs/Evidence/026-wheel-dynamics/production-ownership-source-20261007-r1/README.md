# 026 production ownership repair — SOURCE ONLY, unexecuted

Assigned worktree: `F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01`; branch `loop-pbi/wheel-dynamics-01`; read-only HEAD verification `e52e10b1170db7b8882d6581bdbd4027d2149fb6`. Root owns Git and canonical board integration. No Git mutation, board/index edit, child agent, installed-package patch, test, formatter, typecheck, lint, architecture check, build, native initialization/world, browser, server, platform/CIM or worker was run in this round. Port 5220 was not bound. All terminal calls supplied the assigned workdir. File reading, edits and byte/hash evidence inventory are the only operations performed.

Read as data: canonical AGENTS.md, PBI/AGENTS.md and In Progress/026; Docs05/25/26 and performance-budgets.json; worktree rendering/backend, GPU recovery, Babylon engine, physics prototype and adapter contracts; existing backend and physics tests; architecture policy and local installed primary sources. Canonical Docs05 includes the later029 delivery paragraph absent from this isolated branch; it was read without copying it into this worktree. Canonical/worktree documentation hashes are recorded separately in local-primary-sources.json.

## Ownership changes

| Boundary | Acquisition and release | Error behavior / remaining limit |
| --- | --- | --- |
| Backend policy | Each attempt owns its fresh canvas, then engine, then scene. Dispose fences before invoking any owner; scene → engine → canvas are each attempted once. | One cleanup failure rethrows the original object. Multiple failures form internal OwnedCleanupError; initialization retains the primary first, then each cleanup object in actual attempt order. Only internal cleanup aggregates are flattened; foreign AggregateError remains an original object. Fixed production owner lists bound the retained causes. |
| Partial Babylon9.29 WebGPU | Release fence precedes `_isDisposed`, timestamp query, main/depth textures, deferred textures/buffers, device destroy, common disposal and AbstractEngine disposal. Optional owners are inspected at release time, after asynchronous acquisition. | Each independent top-level owner is attempted even if previous cleanup throws. Device destroy remains before common/base cleanup, matching the pre-existing order. Common failure no longer skips base cleanup. Babylon internals within each owner may still be sequential; this is no claim of complete release after an internal native failure. |
| Initialized Babylon engine | Existing native `engine.dispose()` is retained and called once behind the owner fence. | The native normal disposal implementation is not rewritten. An internal native exception remains its real error; policy still attempts canvas cleanup. |
| WebGL2 constructor failure | The existing `contexts.set(target, context)` occurs before `new Engine(context, ...)`, and policy already owns that fresh canvas. No new context acquisition API was needed. | Canvas release attempts loseContext, width=0 and height=0 independently. Failed loss is retained even if dimensions succeed. The WeakMap entry is removed before attempts; dimensions alone do not prove context loss succeeded. |
| Rapier factory pre-return | World admission/increment remains immediately after successful `new World`. A synchronous internal handoff guard encompasses timestep/solver/CCD setters, ground creation, empty JS registries/maps, ray, method closures and public probe assembly. | Before handoff, World is the only native owner; Rapier0.21 free owns its child sets/colliders. Free is attempted once, reentrancy fenced. Counter decrements only after free returns. Setup failure rethrows the same primary object; failed free throws AggregateError `[primary, cleanup]` and leaves admission reserved/ownership unknown. No public counter or injection API was added. |
| Rapier successful handoff | The same once-only free closure is used at the existing end of probe.dispose. | Normal disposal order is otherwise preserved. A registry/controller removal exception can still skip World.free after disposed=true, retaining reservation. This separate existing failure path is not closed in this narrow round. |

The Rapier guard adds no await after admission; it synchronously builds and returns the same probe. No counter move, concurrency gap or capacity waiver is introduced. Empty pre-return JS registries have no subscriptions, native handles or external listeners to release separately. Ground collider belongs to World. Native constructor failure before a World object is returned remains the native constructor's ownership boundary.

Normal Rapier disposal needs a separate scope decision if full exception-safe normal cleanup is required: (a) retain the explicit existing limitation, or (b) authorize a narrow owner-list cleanup that independently attempts registries/controller removals/World.free, aggregates causes, preserves generation invalidation, and keeps failed-free capacity reserved. Do not retry a partly freed native World or decrement to manufacture known-zero ownership. No contract/API change or broad body/controller rewrite was made here.

## Nominal contracts

Physics setup values, ground geometry/friction, vehicle admission/population, tuning calculations, body/collider/controller creation/removal, native query filters, 60Hz timestep, solver8/CCD4, step/sample/projection calculations and digests are untouched. The existing setup-through-counts source text is retained inside a synchronous callback; normal cleanup replaces only free+decrement with the fenced closure. Snapshot metadata records the unchanged nominal source segment after newline normalization, with both hashes; this is source identity evidence, not execution or a native checksum result.

Rendering preferences, support check, fresh canvas per attempt, fallback rebuilding, WebGL2 validation, initialization, camera setup, scene rendering, begin/endFrame, resize and disposal no-op semantics are unchanged. Failed WebGPU never shares a context with the next WebGL2 canvas. Additional closures/owner lists are startup/cleanup work, not per-frame instrumentation. Their cost is unmeasured.

## Local primary source review and device loss

Installed ancestor packages remain Babylon9.29.0 and Rapier0.21.0. `webgpuEngine.pure.js` assigns the actual GPUDevice to `_device`, conditionally attaches `_device.lost` only when automatic context-loss handling is enabled, and defines the sequential native dispose chain. `webgpuEngine.pure.d.ts` declares `_device: GPUDevice` at216; `_isDisposed` is protected and main/depth texture fields are private, so the version-specific structural cast remains confined to the adapter. Partial cleanup uses existing names/methods, not a substitute GPU device.

Rapier installed `dist/pipeline/world.d.ts` documents free owning its fields; the corresponding installed rapier.mjs.map source shows sequential field free and vehicle controller free. A throw can leave partially released native state, which is why reservation stays occupied. Package, implementation, declarations and extracted source hashes are recorded as data in local-primary-sources.json; source excerpts are retained here without invoking either engine.

The unchanged v2 main uses `scene.getEngine()._device?.lost`, verifies it exists (`WebGPU loss promise unavailable: coverage incomplete`), then calls ownDeviceLoss. With production `doNotHandleContextLost=true`, onContextLostObservable alone is insufficient. The pinned actual Promise bridge is correct for the installed version; absent bridge must remain INCOMPLETE, never success. Lifetime owns its active fence before deliberate device destruction, so delayed loss does not resurrect/poison a closed lifetime. Existing pure promise coverage is historical r3, not actual GPU coverage for this repair. No global loss/recovery rewrite or v2 harness edit was made.

## Meaningful test drafts — all UNEXECUTED

- `tests/rendering/backend-ownership.test.ts`: eight pure tests cover successful disposal with three throwing owners and reentrant/repeated calls; primary plus all cleanup identities over both attempts; successful fresh-canvas fallback after throwing cleanup; all partial GPU owners/device/common/base throwing independently; missing optional owners; actual loseContext error with dimension cleanup; independent dimension errors preserving foreign aggregate identity; constructor failure with only canvas owned.
- `tests/vehicles/world-ownership.test.ts`: three pure guard tests cover setup failure/successful free with decrement after free and reentry; original primary+free failure identities with reservation still1 and one attempted free; successful handoff retaining ownership until caller disposal.
- `tests/vehicles/rapier-factory-ownership.test.ts`: one native test draft uses real installed World.prototype methods/setters and real captured `this`, with four failure points: ground-before, ground-after actual createCollider, timestep setter, solver setter. It verifies one actual native free, unchanged next-world admission and rejection of an additional simultaneous world; restores every patched prototype member in finally and disposes the next world. Free-failure truth is tested purely in the private production guard instead of intentionally leaking a native process.

No draft result is PASS. No test was run, including native setup. Tests exercise the policy/factory boundaries and original error references; no giant fake Babylon/Rapier capability interface or installed-package patch was introduced.

## Proposed commands after root's serial grants — all UNEXECUTED

Every command requires the assigned workdir explicitly. Capture first failure in a new immutable evidence directory; do not overwrite this snapshot after formatting or repairs.

Pure-only finite grant:

```powershell
node --import ./scripts/register-typescript.mjs --test --test-concurrency=1 tests/rendering/backend.test.ts tests/rendering/backend-ownership.test.ts tests/vehicles/world-ownership.test.ts
node F:/Sites/self-driving-academy/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node F:/Sites/self-driving-academy/node_modules/typescript/bin/tsc --noEmit -p tsconfig.tests.json
node scripts/verify-architecture.mjs
node F:/Sites/self-driving-academy/node_modules/eslint/bin/eslint.js src/rendering/backend-policy.ts src/rendering/babylon/backend.ts src/rendering/babylon/partial-cleanup.ts src/vehicles/rapier/index.ts src/vehicles/rapier/world-ownership.ts tests/rendering/backend-ownership.test.ts tests/vehicles/world-ownership.test.ts tests/vehicles/rapier-factory-ownership.test.ts --max-warnings 0
node F:/Sites/self-driving-academy/node_modules/prettier/bin/prettier.cjs --check src/rendering/backend-policy.ts src/rendering/babylon/backend.ts src/rendering/babylon/partial-cleanup.ts src/vehicles/rapier/index.ts src/vehicles/rapier/world-ownership.ts tests/rendering/backend-ownership.test.ts tests/vehicles/world-ownership.test.ts tests/vehicles/rapier-factory-ownership.test.ts
```

Separate exclusive native grant, only after finite source checks:

```powershell
node --import ./scripts/register-typescript.mjs --test --test-concurrency=1 tests/vehicles/rapier-factory-ownership.test.ts
node --import ./scripts/register-typescript.mjs --test --test-concurrency=1 tests/vehicles/physics.test.ts tests/vehicles/physics-adapter.test.ts
node --import ./scripts/register-typescript.mjs scripts/benchmark-wheel-dynamics.mjs after after-production-ownership-r1
node scripts/verify-wheel-dynamics.mjs --after-capture=after-production-ownership-r1
```

The benchmark label is a proposal; root must ensure it is new, retain full current source inputs including both new private helpers, actual native artifact, all ten runs/cleanup and compare against immutable BEFORE. Existing calibration-v2 remains historical until root decides whether unchanged-calculation proof plus fresh native regression is sufficient or a fresh calibration capture is required. No verifier result can relabel old source CURRENT.

## Evidence preservation and next protocol

before.json records a pre-edit byte/hash inventory, including all139 r3 originals, all21 current v2 harness files and the r3 evidence files themselves, plus existing dirty026 product files. after.json records their post-edit byte/hash comparisons and exact eight owned paths. Byte-exact before-source and source copies accompany the inventories; no source copies/status documents from r1/r2/r3 were modified. completion.json lists every new evidence file's bytes/hash; future-exact-paths.txt gives individual future staging paths. Root alone stages/commits; no logs were created. Any future globally ignored log must be force-staged by exact path only.

Original BEFORE `4f25789987ab81ad3bac1aa717ce11b351e9bb3860193e3772a199622e97d6e7` and AFTER-main-027 `b696b02d00956797b91e1cad5bc53263f9e765047b506f7ff73030cb26f7901f` remain immutable, both native artifacts `02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0`/4,340,292bytes. They are historical evidence after this production repair. The r3 harness source-only digest `d91a8d4b208397a3811ff0e7922838b765076941745c10d656b6a546de903fbe` and its25 pure/static test results remain historical and do not validate these new sources.

Before performance: root review → serial finite checks → serial native fault/regression checks → fresh immutable current-production native capture and reader binding → separately authorized v2 production build with complete current inputs → separately authorized instrumentation pricing → fresh real foreground WebGPU/WebGL2 protocol with immutable terminal evidence, original gates/baseline intact. The numeric reader's current AFTER binding must point to the fresh production capture; b696 must never be reused as the new AFTER. No new baseline or gate is established here.

Legacy R3/R4 RAF FAIL/INCOMPLETE and unknown stall cause remain unchanged and unwaived. These failure-path repairs do not establish stall causation or hardware acceptance. This SOURCE handoff is ready for root review; PBI026 is not complete, and canonical board integration remains root-owned. No owned process/listener or delegated work remains.
