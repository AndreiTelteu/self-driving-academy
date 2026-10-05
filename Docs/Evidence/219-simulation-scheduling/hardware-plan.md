# PBI219 headed hardware protocol and results

Both full headed backend captures pass the early physical fixture frame gate. WEBGPU capture [20261005T152901307Z](hardware/20261005T152901307Z/webgpu-independent-verification.json) and WEBGL2 capture [20261005T170121469Z](hardware/20261005T170121469Z/webgl2-independent-verification.json) each retain20non-smoke runs: five alternating observer-off/on pairs for each arm, actual30second warmup and120second measurement. Each has300exact physical-tick checkpoints, zero owned resources after disposal, minimum simulation/actual RAF wall ratio0.9999766672, no absolute budget failure and no confirmed relative regression. Durable artifact archive, current/historical deterministic verification and final global checks PASS. Coordinator-owned board/Git delivery remains separate.

## Identity and measured scope

Pinned commit `4096b8d83b6399a01e7bf0db16b28e5faae32479`,80-input source hash `995b6fbaa5d2f9cd42bca0bac4c9dc70f2dac89df85ae92c3705b7f14f78bcb3`,141-artifact aggregate hash `784022537c183d72b1c001e243fc16b5dc573f7834e7e3747a8b4beb4d51dc50`. Production artifacts total10,508,482bytes; original build manifest is27,509bytes. Both captures used actual Chrome154 on Ryzen9 7950X3D/Radeon RX7900XTX hardware, CSS/internal1920×1080,DPR1,fixed early MEDIUM presentation and adaptive quality disabled. Startup CIM records Windows11Pro build26200, driver32.0.31041.1004,48GiB installed RAM and Balanced power. Display refresh144Hz/resolution3840×2160 remain distinct from the fixed canvas. Hardware/power metadata is startup identity, not continuous thermal telemetry.

The chronological preimplementation baseline is immutable Node `before.json`. The headed UNPHASED_REFERENCE arm is a postimplementation control using the same pinned scene/source/build as ENTITY_PHASED. Each physical fixture has70mixed sedan/compact cars and67anonymous obstacles, actual024controller every60Hztick, native Rapier,022body observations,028collision guard/bus,036signals and044context. Car0 alternates MANUAL/LEARNING at addressed ticks, with equal effective commands in both arms. Decision work includes bounded synthetic033graph search;045policy/economy/learning remain absent and obstacle/zone context is explicitly incomplete. Camera never removes physical actors.

## Protocol and acceptance

A full backend capture takes approximately50minutes. Each run checks real foreground/focus, backend/device stability, fixed-step status/debt, actual simulated/RAF wall ratio≥0.98, all70physical/controller participants and disposal ownership. Foreground/device checks are protocol latches plus per-RAF guards; sparse final observations are not an external continuous OS focus trace. Normal overload is a failure with retained evidence.

Bounded frame/main-thread/optional tick/GPU distributions, observer overhead, frames over budget, Long Task support/count/max and exact physical-tick command/pose/event digests are retained. Absolute early desktop frame budgets are p95≤18.5ms,p99≤25ms,main-threadp95≤10ms and no measured application Long Task>50ms. A >10%AND>1msp95frame/main-thread regression in at least3/5matching observer runs also fails. Both backends meet these gates. WEBGL2 retains one18.6msframe and zero frames>25ms; percentile budgets still pass. Detailed per-run ranges and the summary table are in [CPU and headed evidence](cpu-report.md).

WEBGL2 GPU samples are available as asynchronous fresh timer results; first fresh boundary results were discarded. Their p95median is0.0248msreference/0.02988msphased. WEBGPU timer support was unavailable. Exact page memory and outstanding native query count remain unavailable. Optional fixture tickp95values and percentile regions are kept separate; no sum of percentile regions or whole-game5.5mstick/laptop/full-game acceptance is claimed.

## Reproduction and retained bytes

The dedicated production server command is `node scripts/scheduling-hardware-probe-server.mjs 5195`, URL`http://127.0.0.1:5195/`. The owned server was stopped after final verification; Chrome was left untouched. It follows local executable imports/reexports, identifies source/build/artifact/hardware identity and rejects source drift on every export. Exact source bytes are archived under `hardware/source-<sourceHash>/`; root evidence `.gitattributes` uses`* -text`.

Completed runs are exported immediately into immutable `hardware/<captureId>/` files. Interrupted work can resume on the identical source/build/hardware/backend through `?captureId=<id>`, skipping verified completed runs and arms. `?smoke` is a separate short protocol check, labeled SMOKE_ONLY. No shortened warmup or smoke result substitutes for a full gate.

The durable production artifact ZIP is retained as `hardware/artifacts-<artifactHash>.zip`:141original emitted files plus the original raw build manifest, fixed entry timestamps and exact byte/SHA verification. ZIP creation and exact-entry verification PASS:142entries,3,447,958compressed bytes,SHA256`58b6edd07132a0b616a8c02d20ddef71fe1d464d045f02539dc411610b725efe`. [Archive inventory](hardware/artifacts-784022537c183d72b1c001e243fc16b5dc573f7834e7e3747a8b4beb4d51dc50.json). The reusable evidence-only verifier reads ZIP entries directly through Pythonstdlib, with no extraction or renderer/build invocation:

```powershell
node scripts/verify-scheduling-hardware-evidence.mjs 20261005T152901307Z WEBGPU
node scripts/verify-scheduling-hardware-evidence.mjs 20261005T170121469Z WEBGL2
```

It checks20run identities, all30/120durations and ratio,150checkpoints per arm/300total, exact cross-arm semantics,70controllers/physical steps, zero cleanup, absolute and relative budgets, report consistency,80source bytes and141archived artifact bytes. Current and historical deterministic verification PASS for both captures; reports are retained beside their original captures. `--historical` checks archived source/build identity after later integration; it does not approve changed current production sources. Current-source equality is required by the default mode and passed before integration. Original captures remain unchanged. Final `npm run check` PASS:416/416tests,typecheck/lint/format/architecture. [Final checks](final-checks.json).

## Preserved recovery history

First manual WEBGPU smoke failed after30runningphysicalticks because fixture cleanup called live-only `world.counts()` after `world.dispose()`. Original failure/source bytes are preserved. Fixture cleanup now verifies disposed collision registry/zero owned resources and native-read rejection. A focused actual70-car physical workload lifecycle test using NullEngine presentation passes both arms, repeated zero cleanup and original factory-fault recovery; it is lifecycle evidence. [Repair record](fixture-cleanup-repair.json). The later automated WEBGPU smoke [20261005T152306050Z](hardware/20261005T152306050Z/webgpu-both-comparison-smoke.json) passes20runs with equal checkpoints and minimum ratio0.9928021842.

Sanctioned Computer Use subsequently rejected navigation because current browser URL confidence was insufficient. No UI input or alternate automation followed that denial. The user manually started WEBGL2; only read-only observation/file monitoring continued to completion. Both full protocol captures and all original CPU/memory/route evidence are preserved. PBI closure belongs to the coordinator; no Done is claimed by this preparation report.
