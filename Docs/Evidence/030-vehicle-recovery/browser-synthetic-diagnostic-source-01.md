# PBI030 synthetic diagnostic source handoff

SOURCE ONLY. All new checks/build/world/browser actions UNEXECUTED. Root owns CUA Start. Existing production, V4 original trusted proof/artifacts and diagnostic01/02 remain unchanged.

Owned new directory: `tests/browser/vehicle-recovery-synthetic-diagnostic`. Port5225, absent output `.pbi-validation-030/build-synthetic-diagnostic-01`, absent evidence `Docs/Evidence/030-vehicle-recovery/browser-synthetic-diagnostic-01`. Builder selects this exact directory/browser.html and archives actual current src/tests, imported helpers, native, emitted artifacts and whole ZIP before any future world. Manifest revision `030-SYNTHETIC_DIAGNOSTIC_ONLY-v1`, fresh UUID. Both manifest and strict functional result explicitly physicalAcceptance=false/performanceAcceptance=false. This is a new diagnostic artifact, not an original V4 acceptance or chronological baseline.

The original production025/030 adapters accept DOM events without testing isTrusted. Only COPIED harness predicates/core-proof replace physical trust with explicit isTrusted===false; original physical proof untouched. Each emitted KeyboardEvent/MouseEvent remains genuinely untrusted, never rewritten/monkeypatched. Private WeakSet verifies exact driver-owned event; foreign keyboard/pointer records a lifetime cause and returns (DOM listener exceptions are not relied upon). Existing RAF entry throws recorded lifetime failure before continuing. Root CUA ordinary button click starts the driver. Persistent terminal button latch prevents masking first status.

Driver64events/class is bounded and lossless; capacity exhaustion is failure, no dropped event. Held-key release attempts every held key independently; failed release remains held in snapshot and records original cleanup causes. Once ownership registers driver before first dispatch. Both success and failure finally retain driver transcript in one existing bounded setupWrites entry (`SYNTHETIC_DRIVER_LEDGER`), outside native rows. Source observes actual authority tick and nullable seat generation; AUTO_REJECT correctly retains null seat, never fabricates subject generation.

Concrete ordering:

- NO_POINT/RECOVER/BLOCKED/REMAP_NEW/native-owner-fault: down after existing input arm, production event adapter, original beforePhysicsTick/native/history bracket, then up. No new native step.
- W+D: actual down before original driving-key guard; held throughout existing180 driving steps, actual up before collision setup. Fixed394total ticks unchanged.
- REPEAT: first down, original beforePhysicsTick and history snapshot, then repeat+up on next ALREADY EXISTING RAF in repeat loop. No extra tick/RAF to manufacture a history result.
- Old R/remapped T, actual focused current HUD and stale HUD clicks, AUTO R and native setter-fault phase execute in original matrix order. Synthetic click focuses actual connected button, invokes actualproduction HUD listener, records isTrusted=false.
- Display explicitly says automated diagnostic; no human-key guide or fake trusted input. Actual source retains legacy fixture context/stage strings solely to preserve original IDs and mechanics, not as input-origin proof.

New core-proof preserves all original command/context/identity/raw/native/history/005/007/394tick/250ms/90s/cap/cleanup/gameplay assertions; changes only diagnostic version, trust predicates and verdict labels. Wrapper retains V4 nextOPEN005 validation and additionally cross-binds the driver transcript to actual observed keys, AUTO null seat and HUD pointer clocks. Original DTO boundaries and2MiB limit remain active. Original store retains submitted raw BEFORE validation; rejection/failure stays immutable. Diagnostic HTTP denies performance capture routes. No performance verdict is exposed.

Four new meaningful pure drafts: actual false-trust event ownership+hold/repeat/up, independent failed keyup releasing later keys, capacity exhaustion preserving unreleased state, and driver provenance/missing-row/trust-upgrade/unreleased tampering. They are NOT native or physical acceptance. Existing original pure suites cannot simply treat synthetic reports as physical-positive fixtures. New runtime/report has additional bounded transcript; actual source/type/pure/transport checks are pending, as is hardware diagnostic execution.

Proposed finite commands after source review: Prettier only new owned files, both source/test TypeScript configs, scoped new TS/MJS ESLint max0, syntax new MJS, architecture, serial new driver.test.ts/driver-proof.test.ts with existing TS loader plus affected existing diagnostic/store tests. Preserve first failures; fix only owned diagnostic structural issues. No native/world tests.

Separate future ONE build then strict build-only:

```text
node --import ./scripts/register-typescript.mjs tests/browser/vehicle-recovery-synthetic-diagnostic/prepare-browser-build.mjs
node --import ./scripts/register-typescript.mjs tests/browser/vehicle-recovery-synthetic-diagnostic/verify-build-only.mjs Docs/Evidence/030-vehicle-recovery/browser-synthetic-diagnostic-01/build-manifest.json
```

Future serve existing immutable build only:

```text
node --import ./scripts/register-typescript.mjs tests/browser/vehicle-recovery-synthetic-diagnostic/browser-server.mjs Docs/Evidence/030-vehicle-recovery/browser-synthetic-diagnostic-01/build-manifest.json
```

Full synthetic BOTH reader is separate `verify-functional.mjs` against the new manifest and requires both complete immutable backend reports/no failed siblings. A diagnostic pass never satisfies trusted physical-R PBI acceptance. Original diagnostic02 stopped at repeat because momentary CUA lacks hold/repeat; original first01 RAF stall and all V4 failures remain failures.
