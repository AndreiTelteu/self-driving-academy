# SOURCE16 root-review handoff — unexecuted

Workdir F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01; read-only verified branch loop-pbi/wheel-dynamics-01 and HEAD e52e10b1170db7b8882d6581bdbd4027d2149fb6. Canonical PBI026 remains In Progress. No board/Git/production/native/fixture/gate/capture modifications, child agents, or executable checks were performed. Source reads and the explicitly requested bounded byte inventory are the only audit work.

## Reviewable source

Ten paths, 68,191 bytes, captured under source/. Authoritative source-manifest-corrected.json SHA256 3b5b5e566c03401baf0bfd2d1106fef5e4e6835bc8bca2a4853433500e034960. The original source-manifest.json is preserved: its totalBytes was accidentally null because PowerShell Measure-Object did not sum the ordered dictionary entries. The correction changes that inventory field only; this was a manifest-generation error, never a capture/test failure. Both immutable manifests remain available.

current-native-reference.before.mjs is the pre-edit null-pin module. Only the four authorized pins changed in current-native-reference.mjs; labels/version/native identity are unchanged. AFTER source c293c6f8baa9ec4279793a53a4a1c70d920976fe3cdb1208f6678852cec146a0; AFTER report 290484a09790afb731bc461917877fffaf4ff16a90b757d3e99a03d50fcf9fe8. Calibration source is the same c293 hash; calibration report 08e6eaaa2b299616bc8d03448f0950534faeb6b02ef6cacb4d634b70b084e7d3. These are supplied root-reviewed native identities, not hardware/PBI acceptance. No automatic pin derivation or current-source fixed point was introduced.

readCurrentNative was read, not executed. It compares archived input integrity and current production/package bytes, and derives the browser production closure. It does not demand current equality for auxiliary main/lifetime/reference files. No validator changes were necessary or made. Both captured source archives retain their original null-pin modules.

safe-diagnostic.mjs / .d.mts are browser-safe and have no Node/browser imports. Diagnostics inspect at most one guarded own message descriptor, accept only string data there, and otherwise use UNKNOWN. Primitive undefined/null/boolean/number text is preserved; bigint/symbol/object conversion is never attempted. No getters, object converters, iterators, toJSON, nested causes or error graphs are traversed/retained. Descriptor/proxy traps are caught. Text is capped at 1024 UTF16 code units, stage at 128; omittedCodeUnits reflects text truncation only and never invents a count for unreadable objects. A hostile trap that never returns cannot be preempted synchronously; no claim of a runtime deadline for such a trap is made.

CaptureLifetime.cause retains stage/error/omittedCodeUnits/at shape. A throwing/nonfinite diagnostic clock produces at:null while failed remains true. Teardown continues all owners/readbacks and keeps its existing once/reentry promise. Stage labels use safe text. Frame finish now tracks failure separately from error truthiness; fail(stage, error) forwards the exact value to the pending rejection, including undefined/false/null. Cleanup failures cannot replace an existing primary value. fail remains the existing nonthrowing cancellation API (declaration void), so runOwned and asynchronous callback failure paths still reach teardown; the original error is thrown/rejected by the caller/frame rather than replaced by serialization. Callback/continuation clock throws are routed into failure and cancellation. Watchdog clock inspection stays inside its existing guard. No numeric/timing limits changed.

main.ts late-error export and ledger.mjs frozenStatus use the same safe helper. Supplemental failures stay FAILED_UNKNOWN; main still rethrows the original caught value. Ordinary ledger verification still rejects the original value; a failed supplemental verification records bounded FAILED_UNKNOWN text. Error text intentionally becomes the own message without an inherited Error name prefix; unreadable objects become UNKNOWN.

Draft tests: safe-diagnostic.test.mjs covers getters/converters/proxies/revocation, primitive text and exact string caps. lifetime.test.mjs adds adverse cleanup/readback, clock, callback rejection, cancellation diagnostics, run/export and once-only cases. ledger-diagnostic.test.mjs uses only an injected in-memory filesystem for supplemental frozen failure and ordinary original-value rejection. No hostile object is returned from a Promise rejection observer (avoids Promise then assimilation). Existing tests were retained. All new/changed tests are UNEXECUTED; syntax/types/lint/format are also UNEXECUTED.

## Bounded protected inventory

protected-capture-references.json records both actual 80-input manifests with archived and current hashes, native references, original null-pin archived modules, raw.partial/terminal/archive metadata when present, and R14/R15 root review references. Archived inputs: zero byte/hash drift in both sets. Current nonauxiliary inputs: zero drift. Six intentional current auxiliary differences are reference/lifetime/main in each capture. Native installed/archive bytes were hashed without loading/importing the artifact. No full Babylon copies were made. This source inventory does not repeat numeric/native/calibration validation. Historical SOURCE08–10/R11–15 and original captures/raw files were not modified; prior independent review mistakes remain evidence and never became capture failures/reruns.

## Proposed finite commands — source text only, require separate root grant

Run serially from this workdir only after root approves the final source revision and grants offline checks. Capture immutable actual stdout/stderr/exit/source inventory before declaring results. The following are proposals, not executions or permission:

- node --test tests/browser/wheel-dynamics-v2/safe-diagnostic.test.mjs tests/browser/wheel-dynamics-v2/lifetime.test.mjs tests/browser/wheel-dynamics-v2/ledger-diagnostic.test.mjs
- node --test tests/browser/wheel-dynamics-v2/numeric-reader.test.mjs (historical/offline reader suite; no world creation)
- node --check on each of the eight changed/new .mjs paths individually
- npm run typecheck (both existing configurations)
- Scoped existing lint and prettier --check against the ten listed source paths, no --write before reviewing any changes
- npm run check:architecture
- Separate root-owned offline readCurrentNative() and numeric parity review, with the final source inventory pinned before launch; no native initialization, new worlds or fresh captures

The existing ledger.test.mjs contains HTTP/server tests and is intentionally excluded from this no-server proposal. Build requires an independent subsequent root grant; no build/server/browser command is launched or implicitly authorized here. Browser/full hardware acceptance remains outstanding. Stop for root review; PBI026 stays In Progress.