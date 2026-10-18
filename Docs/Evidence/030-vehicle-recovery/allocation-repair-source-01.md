# PBI030 allocation repair — SOURCE ONLY, UNEXECUTED

The original CPU/browser BEFORE and both native AFTER failures remain unchanged. AFTER2 remains FAILED on all five original relative comparisons for both populations. No AFTER3, check, formatter, native world, benchmark, build or browser has run for this source revision.

## Exact source boundary

`src/vehicles/rapier/index.ts` retains the same live collider translation call, translation-finite rejection before rotation access, live rotation call, rotation-finite rejection, and live `intersectsShape` call. It removes only the immediately discarded copied/frozen translation vector and temporary finite-check arrays. Errors remain `RangeError('Invalid body vector')` and `Error('Invalid native collider rotation')`. Every collider is still visited/counted, with deferred errors keeping borrowed traversal resources balanced; count/cap, support/ground, sensor/own-body exclusions and post-query token/serial checks remain. Every inspection still propagates body positions. No native call or physical query is removed.

`src/vehicles/recovery-port.ts` adds one private WeakSet containing only exact outputs created after the original complete own-data descriptor/number/quaternion/upright-yaw validation and deep-frozen copy. Passing that output again returns the same immutable top-level/vector/quaternion references. An externally frozen object, shallow copy, replacement, mutable object, inherited object or getter-bearing object has no brand and takes the original parser. The first parse still returns copies independent of the caller. Native geometry/results and mutable contexts are never cached.

`src/vehicles/recovery-state.ts` constructs its candidate with that parser once, before the road host callback. The adapter, native request parser and footprint validator can reuse the exact immutable parsed candidate. All raw scalar values, yaw calculation, cohort scheduling, road lookup, contact/upright admission and every fresh pre/post-host owner/native/context/token fence remain. No physics, timestep, native population, query count or threshold changes.

Only reference identity on repeated parsing of this parser's exact immutable output changes; first parsing of any external input still makes independent copies. Serialized transforms and retained physical/control records remain identical in intent, pending actual tests/parity verification. No CPU benefit is claimed.

## Meaningful drafted tests; UNEXECUTED

`tests/vehicles/recovery-pure.test.ts` adds three cases: independently copied first parse plus exact immutable reuse and mutable replacement; externally frozen/copy/getter/prototype/unknown-field/malformed nested rejection with zero accessor invocation; every nonfinite position/quaternion component for NaN and both infinities.

`tests/vehicles/recovery-native.test.ts` retains the previously verified same-serial anonymous movement/resize/orientation/sensor query-equivalence checks. Its candidate is now an actual parser output. An additional bounded seam injects invalid native getter readbacks for all seven vector/quaternion components and all three nonfinite values. It asserts the original error, complete three-collider traversal, no invalid collider intersection, translation-before-rotation rejection, unchanged native serial and restored prototypes. These are deliberately injected getter failures, not measured invalid physical states or fake native setters. Successful current-state inspection follows restoration; existing partial-setter/full-placement/lifetime cleanup checks remain.

## Proposed finite commands; require separate parent CPU grant

Use the existing ancestor-installed Prettier on the three changed production files, two changed test files and this document; both TypeScript configurations; scoped ESLint on the five TS files; architecture verification. Run pure owner, recovery-pure and functional proof suites. If all pass, archive exact current source/native bytes before serially running the same three native suite files (10 top-level native cases). Preserve first error/output/source snapshot and all actual command exits in a new namespace. Do not execute `vehicle-recovery-after.mjs`: its output is still the already failed `after-02`, and no later capture is authorized here.

After these source edits, old finite native archives and AFTER captures are historical source closures. Their archives and raw records remain authoritative; no old CURRENT identity or PASS is inferred from this source draft.
