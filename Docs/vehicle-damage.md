# Vehicle damage029

Implementation is authored, validation pending. This document describes the intended contract; no native motion/browser/performance PASS is claimed yet.

`createVehicleDamage(context, identityPort, historyCapacity?)` owns a pure availability projection for at most110 exact current BodyIdentity registrations. The caller registers each vehicle with its immutable mechanical mass in kilograms. Inputs come from028 CollisionIncident onset events in the same session/epoch with both exact current collision identities. Registered vehicle participants are updated together. The simple model takes each incident independently; minor onsets never accumulate hidden damage.

`029-onset-impulse-v1` uses native normal solver impulse in N*s divided by each participant mass in kg. This impulse-equivalent velocity change is a gameplay damage calibration, not a measured actual velocity change or real crash model. The2m/s damaged and8m/s immobilized inclusive thresholds are bracketed by the preserved native1/3 and6/12m/s wall-impact probes for sedan/compact. The calibration records actual impulse; collision force is never substituted.

| Availability | Command realization |
| --- | --- |
| AVAILABLE | Propulsion magnitude limit1, minimum service brake0 |
| DAMAGED | Propulsion magnitude limit0.5, minimum service brake0 |
| IMMOBILIZED | Propulsion0, existing native service brake1 |

The optional fourth024 constructor options object has `availability: VehicleAvailabilityProvider`. Its `readAvailability(identity, context, tick)` returns `{throttleMagnitudeLimit, minimumBrake}`. The controller applies the effect before the single physical step and publishes the resulting effective command separately from raw. Existing brake/handbrake precedence remains. With options absent, legacy024 behavior is preserved.027 integrates signed direction first, then the availability magnitude limit; neither direction nor authority bypasses damage.

This changes propulsive commands and uses the existing service-brake mechanic. It does not modify mass, tire grip, power, solver, CCD or60Hz dt, remove/freeze the native body, erase external collision momentum, or promise zero motion against outside forces. Actual flat-ground propulsion stopping/reduced acceleration must be tested on both classes before acceptance.

`recover(identity, {context, operationId, tick})` restores AVAILABLE only and appends an explicit RECOVERY record. `lastIncidentId` and prior records remain. It neither relocates the car nor clears native velocity. Recovery-point validation/teleport, passengers, economy and challenge outcomes belong to226 and later gameplay. It is a labeled operation, not learned driver behavior.

## Identity, retention and failures

IDs/context are copied and bounded. Body references must be the actual frozen own-data current token; cloned/removed/reused/other-world tokens are rejected. Tick order is monotonic for new operations. Matching operation retries are idempotent; conflicting same IDs fail. Malformed or overflow admission does not apply a prefix. Mutation/reentrant disposal is rejected; errors propagate synchronously. The controller's existing terminal physical-actuation fault contract remains.

At most4096 compact INCIDENT/RECOVERY history records and4096 operation IDs are retained, additionally capped at4MiB of serialized UTF-8 full history array including brackets and commas (not exact JS heap); caller may lower the cap. Pages contain at most64 records. Records keep scalar IDs/generations/serials/impulse/context, never native handles or arbitrary error graphs. Capacity exhaustion explicitly backpressures028 publication before applying damage; the owner must pause/preserve/export history. There is no eviction or automatic recovery retry. Durable storage/import and continuing beyond the early owner capacity are future integration work, not silently implemented here.

Remove releases active state while preserving history. A same-session higher-epoch `reset` replaces the identity source, removes active registrations and resets world tick while preserving historical records. New session uses a new owner. `dispose` releases active entries, history, operation IDs and port references; the composition root must preserve/export any required history before disposing. This resource cleanup is distinct from recovery.

## Evidence and pending validation

Chronological native BEFORE at base d80bf721e536ff1400dc48e1656169ac2fecfa61 has sourceHash5d848563c377b3cad492d61757e9e5af5e873ed2d4c68c2c1d255eeff9f4cd82. Ten70-car worlds,180/600ticks, five alternating observers have identical physical/input/intermediate traces and zero cleanup. The installed actual Rapier ESM with inlined WASM is archived,4,340,292bytes, SHA25602dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0. Unpaced NodeCPU is supplemental and proves no hardware FPS or120-second steady-state result.

Eight actual named-wall028 calibration runs passed. Sedan1400kg onset impulses at1/3/6/12m/s:1411.13/4188.72/8629.51/19603.25N*s; compact1100kg:1108.74/3291.13/6780.33/15402.55N*s. Failed initial publisher callback and immutable original source are retained; separate repairedv2 callback explicitly returns undefined and verifies publication drained.

Pending: native damage-motion tests, recovery/history/capacity/token/epoch/parity/lifecycle tests; same-fixture AFTER incremental CPU comparison; ownership/memory measurements; actual foreground Chrome WebGPU/WebGL2 functional playtest with1920x1080CSS/internal/DPR1; global checks and parent integration/board validation. The full game, durable savefile, laptop and maximum-fleet hardware budgets are not proven by early functional/native probes.
Optimization draft after CPU regression: at most110 exact identity entries avoid reparsing already admitted immutable tokens; every availability read still checks native physical token equality. One exact plain frozen own-DATA context may be cached after full validation; accessors/unknown fields/prototype objects are rejected, mutable contexts always revalidated, reset/dispose clear the cache. Three immutable mobility constants avoid repeated allocation. Tests authored for frozen changing getters and mutable epoch changes; optimized checks/probes remain pending CPU grant.

## Current validation disposition

Current v4 production: typecheck/scoped lint and24 damage/controller tests PASS, including actual native high-impact/blocked propulsion/recovery for both classes,20x110 native lifecycle cleanup, own-data immutable cache and exact full-history UTF-8 cap. These results do not close performance or browser acceptance.

Original chronological whole-controller CPU comparison FAIL: v2 confirms5/5, v3 confirms3/5, v4 confirms4/5 joint >10% AND >1ms increases. All captures/source/native archives and failures remain immutable. Absolute5.5ms alone is insufficient. Controlled same-process archived024/current029 diagnostic has0/5 relative CPU flags, but cannot replace the baseline or prove host causality; unchanged native physics does not exclude GC/allocation/JIT effects caused indirectly by new code.

Independent review029-performance-r1 is CHANGES_REQUIRED. Controlled observer-on heap endpoints exceed reference by6,797,600/7,269,352/5,621,472/7,037,216/5,651,336bytes, allfive >10% AND >5MiB. Endpoint phase is uncontrolled GC while worlds are live; this is a runtime-memory red flag, not exact owner RAM or proof of a leak. Small post-disposal forced-GC deltas support cleanup but do not clear runtime pressure.

A separate bounded live-memory/GC diagnostic is authored, NOT EXECUTED: both arms use identical live-world GC endpoints outside the measured window, immediate raw heap before sorting,10 cadence samples/run and bounded4096 Node GC events with exact window attribution and asynchronous delivery drained outside timing. Its observer/GC changes are explicit; it cannot retroactively mark failed gates PASS. Any later allocation fix needs new source evidence and same unchanged acceptance checks. Hardware functional playtests/current production5199 build, signed027 integration and final global checks remain pending.
Live-memory/GC diagnostic currentv4 executed20runs: exact physical/input/intermediate traces, zero cleanup; live-world post-GC observer-ON current/reference differences+6776/-600/+37376/-25976/+45120bytes. Raw immediate heap differences remain-853128/+13815968/+4217464/+4292512/+4161120bytes. This distinguishes live retained endpoint from uncollected raw process heap without attributing causal sites or accepting the original failed gate.333 measured-window GC event details are preserved;232 outside-window events are counted but their details were not serialized, limiting carryover analysis. A distinct v2 harness serializing ALL bounded raw GC events is authored, NOT EXECUTED; the original capture is preserved.