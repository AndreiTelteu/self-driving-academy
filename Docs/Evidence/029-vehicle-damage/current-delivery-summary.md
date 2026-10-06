# 029 delivery readiness — actual evidence

Owner branch loop-pbi/vehicle-damage-01 has implementation snapshot1cc8947 and signed027 merge bf78ad85bb0b32e63d065e663829c6aa8cad2fb1, preserving published027 f1c6428034c1d52ae0eb3e88857fb6f61ffd43ce ancestry. This document records readiness, not canonical Done. Parent owns integration, global final checks, physical board move and commit/push.

## Acceptance and identities

Explicit AVAILABLE/DAMAGED/IMMOBILIZED states use independently calibrated onset impulse-equivalent2/8m/s thresholds; DAMAGED caps propulsive magnitude0.5, IMMOBILIZED sets0 and native service brake1, recovery appends history without erasing the incident prefix. Both classes/authorities preserve signed027 gear and brake/dwell fences. Native combined tests38/38 passed ([log](merge-tests-01.txt)); the exact original current-source CPU comparison after027 passed0/5 regressions ([comparison](cpu-comparison-current027.json), [strict verifier](verify-current-cpu.mjs)). Source241fa88 is not a causal explanation of old v5 failure.

Frozen final [build manifest](hardware-20261006T034626897Z/build-manifest.json):71 source inputs606289B,58 artifacts9064156B; source bd02a51853838ad2a9375d044699bd604082518538ee09360b2a5dca0fbd2c4a, artifact7d7687d2447c4bac2b3f4d8e703f8229dd54460032291cd0a31910ca3b25a1f4; native ESM/inlinedWASM4340292B SHA02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0. Strict CURRENT independently matches all actual current/archive bytes and22 reference bytes to published027 Git blobs. Evidence uses '* -text'; no EOL transformation claim substitutes for actual hashes. Artifacts are durably stored under the build artifacts directory, not only transient build output.

## Actual Chrome functional captures

| Backend/capture | Independent evidence | Result |
| --- | --- | --- |
| AUTO/WEBGPU20261006T034738523Z | [CURRENT log](hardware-functional-auto-current-01.log), [inspection](hardware-functional-auto-inspection-01.json), [raw capture](hardware-20261006T034626897Z/captures/functional/20261006T034738523Z/start.json) |12 native cases +20 ownership cycles PASS |
| WEBGL220261006T035249070Z | [CURRENT log](hardware-functional-webgl2-current-01.log), [inspection](hardware-functional-webgl2-inspection-01.json), [raw capture](hardware-20261006T034626897Z/captures/functional/20261006T035249070Z/start.json) |12 native cases +20 ownership cycles PASS |

Actual case/phase readbacks include damage/immobilization/recovery history prefixes, interrupted then completed six-tick at-rest dwell, service/handbrake/lateral/suspend fences and zero disposal counters. Scripted inputs do not prove trusted human-key input. Temporary CDP dimensions1920×1080/DPR1 were used for the actual AMD hardware surface and cleared after terminal observations.

## Full required hardware gates

Each backend ran all20 original normal runs: published027/current029, five alternating OFF/ON pairs per arm,30s warmup/120s measured,70 physical cars, fixed60Hz physics. Full-window4096-bin0.025ms histograms retain conservative quantile intervals, not fake exact midpoint percentiles; all samples count. OFF has matching interval/hash/endpoint observers; ON adds complete CPU channels and1Hz JS-heap observed peaks. No forced GC, selective resume, ignored frame or relaxed threshold.

| Backend/capture | CURRENT verification and independent pairs | Raw comparison |
| --- | --- | --- |
| WEBGPU20261006T093158558Z | [log](hardware-webgpu-full-current-01.log), [all CPU/memory pairs](hardware-webgpu-full-independent-01.json), [all20 guards/cleanup](hardware-webgpu-full-guards-independent-01.json) | [comparison](hardware-20261006T034626897Z/captures/20261006T093158558Z/comparison.json), SHAba36fcd9822224180cd84ec2e0cae946ca3695701df23fb7cc8b805607ae2590 |
| WEBGL220261006T102935092Z | [log](hardware-webgl2-full-current-01.log), [all CPU/memory pairs and20 guards/cleanup](hardware-webgl2-full-independent-01.json) | [comparison](hardware-20261006T034626897Z/captures/20261006T102935092Z/comparison.json), SHA4a89930630a0a8b471f50038d14c88a1b305fe46ed244b38a1ab9e15acfda281 |

Both strict commands exited0:20 runs/160 parts/580 exact cross-arm checkpoints each,70×7200 measured actor ticks each run, zero vehicles/subscriptions/collision/controller/damage/history cleanup counters and disposed-read rejection. WEBGPU202 files1289425B, WEBGL2202 files1289303B, maximum file47846B each. Minimum simulation/wall ratios .9999766672110961 and .9999791671006855. All relative CPU pairs and70 required absolute gates pass.

The memory rule remains joint>10% AND>5MiB in at least3/5 pairs. Failed individual endpoint pairs (zero-based) remain raw:

| Backend/observer/pair | Reference→current JS endpoint bytes | Delta |
| --- | --- | --- |
| WEBGPU ON1 |27887004→38358835 |+10471831B/+37.55% FAIL |
| WEBGPU ON2 |24996856→38163660 |+13166804B/+52.67% FAIL |
| WEBGL2 OFF1 |27312779→45062919 |+17750140B/+64.99% FAIL |
| WEBGL2 OFF2 |33394495→48395637 |+15001142B/+44.92% FAIL |
| WEBGL2 ON0 |37763018→46078847 |+8315829B/+22.02% FAIL |

WEBGPU OFF0/5 andON2/5 failures, WEBGL2 OFF2/5 andON1/5 failures: each aggregate passes the unchanged threshold. All ON observed-peak pairs pass. RequiredCpuFrameMemoryVerdict is PASS; optionalTimingVerdict and global verdict are UNVALIDATED because GPU/input are NOT_MEASURED by the harness, not demonstrated unsupported. JS endpoints/1Hz lower-bound peaks do not establish true/native/WASM/total RAM, allocation causality, fullgame/laptop or224/159 soak. PBI029 performance scope is simulation,memory; optional limitations stay explicit, no wholecollector PASS is claimed.

## Reproducible independent verification

Run from F:/Sites/self-driving-academy/.worktrees/vehicle-damage-01 on loop-pbi/vehicle-damage-01 before canonical integration:

```powershell
node --import ./scripts/register-typescript.mjs tests/browser/vehicle-damage/verify-functional.mjs Docs/Evidence/029-vehicle-damage/hardware-20261006T034626897Z/captures/functional/20261006T034738523Z
node --import ./scripts/register-typescript.mjs tests/browser/vehicle-damage/verify-functional.mjs Docs/Evidence/029-vehicle-damage/hardware-20261006T034626897Z/captures/functional/20261006T035249070Z
node --import ./scripts/register-typescript.mjs tests/browser/vehicle-damage/verify-hardware.mjs Docs/Evidence/029-vehicle-damage/hardware-20261006T034626897Z/captures/20261006T093158558Z
node --import ./scripts/register-typescript.mjs tests/browser/vehicle-damage/verify-hardware.mjs Docs/Evidence/029-vehicle-damage/hardware-20261006T034626897Z/captures/20261006T102935092Z
```

After legitimate main integration changes the reachable runtime closure, append --historical to verify immutable archive identities without pretending current checkout equality; final main project/combined behavior checks remain necessary. Each verifier rejects failure/rejected/incomplete markers and independently recomputes counts, ranks, intervals, identities, native/provenance and comparisons.

## Preserved failures and causal limits

Original chronological [BEFORE](before-node.json), [v3](cpu-comparison-v3.json), [v4](cpu-comparison-v4.json), [v5](cpu-comparison-v5.json), raw heap flags5/5, GC/allocation/final-stage diagnostics and reviews remain immutable. Current CPU and hardware success neither erases these nor demonstrates why old v5 failed. [Memory matrix](current-evidence-memory-matrix.md) distinguishes runtime proxies from ownership and post-GC diagnostics.

The first actual functional attempt failed beforetick0 on Babylon StandardMaterial registration: [raw failure](hardware-20261006T032726912Z/captures/functional/20261006T033201784Z/failure.json). The second attempt preserved all32 rows but failed its original first-prefix dwell validator: [raw failure](hardware-20261006T033445456Z/captures/functional/20261006T033725315Z/failure.json). Corrected supplemental validation is not acceptance of either failed attempt. Both frozen sources/artifacts/markers remain; official successful captures use the distinct final build above. Original scoped-check failures and repairs remain in logs. No permission or performance waiver derives from an artifact.
