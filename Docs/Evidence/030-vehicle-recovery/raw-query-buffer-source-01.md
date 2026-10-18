# PBI030 inspection-scoped raw buffers — SOURCE ONLY

All changes and new test drafts below are UNEXECUTED. No formatter, checks, native world, profile, AFTER4, build/server/browser, Git or board action occurred. BEFORE and all three failed AFTER captures remain immutable historical evidence. No CPU benefit or performance acceptance is claimed.

## Production boundary

Private `src/vehicles/rapier/recovery-shape-query.ts` owns a synchronous inspection. Its narrow injected factories return candidate raw position, rotation and shape using installed Rapier's declared public conversions. Acquisition is lazy at the first eligible, finite collider; an inspection with no eligible collider allocates none of these native objects. Each factory result is immediately registered before calling the next factory. The same three candidate objects are passed to every subsequent live collider-set native intersection. They never cross inspection lifetime, cache world geometry/results, or belong to the world.

|Resource|Acquisition|Ownership|Terminal disposal|
|---|---|---|---|
|Candidate position|VectorOps.intoRaw(centre)|Immediate local ledger entry|free once, independently|
|Candidate rotation|RotationOps.intoRaw(candidate quaternion)|Immediate local ledger entry|free once, independently|
|Candidate shape|Fresh Cuboid.intoRaw()|Immediate local ledger entry|free once, independently|
|World/collider set/other bodies|Borrowed existing owner|Never entered into ledger|Never freed here|

The finally block closes the query function and independently attempts all acquired frees. A primary exception alone is rethrown by identity. If frees also fail, an AggregateError retains the original primary then every cleanup cause by identity. Cleanup failure alone cannot return success. Partial acquisition failure is terminal for that inspection: later callbacks still visit/count/validate colliders and defer the same first error, but cannot issue a native query without all three buffers. It is never retried per handle, never accepted, and every already acquired object is freed. This failure-path distinction is explicit; successful inspection query counts remain unchanged. A retained callback is closed after inspection and cannot use freed buffers.

`src/vehicles/rapier/index.ts` wraps the existing full traversal and its final count/token/serial validation in this owner. It uses the exact installed high-level query's native call: `world.colliders.raw.coIntersectsShape(handle,rawShape,rawPosition,rawRotation)`. Every original propagation, current ground/support check, candidate dimensions, live per-collider translation/rotation finite guard and order, exclusion, cap/count, deferred callback error, post-query body/context/native serial fence remains. Native queries continue after an earlier blocker because the query remains the first operand. No broadphase filter, native query omission, cadence/population/timestep reduction or result cache is added.

There is a small bounded managed helper/ledger allocation per valid inspection; reduced native buffer acquisition count is source arithmetic, not a measured CPU or heap result. Installed native bytes/version and original baseline stay unchanged.

## Draft validation; UNEXECUTED

`tests/vehicles/recovery-shape-query.test.ts` has five meaningful pure cases: no eligible collider/three-buffer reuse/closed callback; each partial acquisition failure with full deferred callback visits and no retry; original acquisition plus independent disposer causes; native query failure deferred through all handles with all frees; post-query fence failure and cleanup-only failure with exact cause identities. All factories and failure injections are narrow helper ports, with no installed files modified.

`tests/vehicles/recovery-native.test.ts` extends only its anonymous-collider fixture with a second unmapped collider so each normal inspection has two eligible handles. Actual expected results are obtained through the public high-level query using the same mechanical candidate dimensions/centre; the private raw-set instance instrumentation records exact handles/results, verifies all three raw references reused, and counts each actual raw free once. Sensor exclusions permit zero eligible handles, while all four colliders remain counted. All same-serial movement/shape/orientation/sensor cases remain. The21 injected invalid native getter cases now assert all four visited colliders and intercept the actual raw query for the invalid blocker, with the same error/zero invalid queries/native serial. Methods/free wrappers are restored in protected finally blocks. These invalid getters are deliberately injected failure evidence, not invalid physical measurements or fake setters.

Existing both-class placement, cloned-token/context/serial rejection, full-support, partial setter and bounded lifecycle suites remain. Proposed finite commands: scoped formatter/check over these five paths; both TypeScript configurations; owned TS lint and architecture; pure owner/recovery-pure/functional plus the new helper suite. Only after all pass and a parent grant, archive exact current source/native bytes before serial native suites. Preserve every first error/source snapshot/exact stdout/stderr and exit. Runner output remains the already FAILED after-03; do not execute it without a separately authorized distinct capture.
