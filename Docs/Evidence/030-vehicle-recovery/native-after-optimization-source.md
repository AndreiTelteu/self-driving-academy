# PBI030: bounded native AFTER optimization — SOURCE ONLY

The immutable first AFTER remains FAILED. Its 20 physical/control/checkpoint digests match the original BEFORE, cleanup is zero, but whole CPU cost fails the normal absolute budget and all five relative comparisons in each population. This change has not been executed or measured. No performance improvement is claimed.

## Reviewed production boundary

- `src/vehicles/controller-port.ts` and `src/vehicles/controller.ts`: optional `readBoundary()` returns current context, accepted tick, suspension, disposal and actual fault without traversing the vehicle registry. `getStats()` remains unchanged.
- `src/vehicles/recovery-state.ts`: each existing fence reads that fresh boundary, falling back to the original `getStats()` for legacy ports. Context parsing is skipped only for an exact initially strict-audited, frozen own-data reference. Four scalar values are still compared. Mutable and replacement contexts take the original strict parser. All post-host-callback fences remain.
- `src/vehicles/rapier/index.ts`: replaces exported `other.shape` intersection with public live `other.intersectsShape(...)`. Every inspection still propagates body positions, traverses every collider, counts and caps them, checks fresh finite translation/rotation, and retains original ground, sensor, own-body, chassis, wheel, support and native-serial guards. No broad rejection, cached geometry, early exit, additional step or altered physics.
- `tests/browser/vehicle-recovery-after.mjs`: its authority adapter uses the same optional scalar readback with legacy fallback. The original failed capture archived the old adapter; it remains historical and immutable. A new capture must use a distinct folder after a separate grant, with the original BEFORE and unchanged 20-world protocol/gates.

## Drafted validation; UNEXECUTED

`tests/vehicles/recovery-owner.test.ts` adds nine pure cases: actual accepted tick/suspension/disposal, actual actuation fault with unchanged accepted tick, fault/context/token changes during a road host callback for both scalar and legacy paths, and mutation of a nonfrozen context. Fleet-stat assertions separate authority step reads from recovery fence reads; authority behavior is unchanged.

`tests/vehicles/recovery-native.test.ts` extends the existing actual anonymous-collider test. At one unchanged native serial it moves, resizes, rotates and toggles a sensor on the actual unmapped collider. It compares the previous public shape intersection expression against the live collider expression, checks complete collider count, and verifies recovery remains blocked or safe as appropriate. Existing partial-setter, class-placement and lifecycle checks remain.

## Proposed finite commands; NOT RUN

Run scoped formatter/check over these seven source files and this document, both TypeScript configurations, scoped ESLint, architecture and syntax check for the changed MJS. Then run the owner pure test and the existing native suites serially under a parent CPU grant. Archive actual current source/native bytes before any newly authorized native world. No second AFTER capture, build, server or browser is authorized by this document.

Preserve `after-01`, `native-after-checks-01`, `native-after-checks-02`, original CPU/browser BEFORE, native calibration and every failed sizing/check attempt byte-exact. Any original CURRENT source check after these edits must use its explicit historical mode; archive identity is the historical authority. The additive failed-analysis result does not waive either CPU gate or close browser/memory/functional acceptance.
