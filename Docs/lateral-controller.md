# Lateral controller 049

The isolated 049 implementation has verified native CPU/ownership/calibration and real foreground Chrome WebGPU/WebGL2 driving evidence. The implementation commit does not close the canonical PBI: parent owns integration, physical board movement, RequireDone validation and publication. Babylon.js and the published024/027 actuation path remain unchanged.

## Contract and ownership

`compileLateralTrajectory(map, request)` validates the032 map and033 directed links, then copies selected continuous authored geometry. A TURN uses the exact validated movement.geometryId points; missing connectors are rejected. `createLateralController(world)` consumes actual body observation and an explicit requested speed at60Hz, returning normalized steering, feasibility reason and an advisory physical corner-speed limit. It owns no clock or actuation and never writes pose, velocity, throttle or brake. Posted speed metadata remains separate from physical feasibility and the explicit longitudinal/style owner. A045 STOP can remove a route only through explicit caller action; future lane/service mechanics are not claimed.

Session/epoch/map/version, incarnation/class, authority and monotonic tick fences reject stale work. Missing, stale, future and discontinuous observations fail closed. Authority changes clear route/current projection while retaining the tick fence; actor reuse requires a higher incarnation. Reset/disposal release strong route/current/identity ownership. Caps are110 actors,256 vertices/trajectory,28,160 logical retained vertices and1024 protected identity records with no silent tombstone eviction or history. Caller-held opaque compiled tokens remain caller ownership; WeakSet provenance does not count them or promise exact GC/heap bytes.

Compilation temporarily owns two parsed maps and one graph within032 limits8192 domain entries/65,536 aggregate array entries and033 limit32,768 references, bounded lookups and at most256 output vertices. No full map is retained in the controller. Setup cost is reported separately. Per-step validation captures descriptor.value snapshots without later untrusted property reads or mutable-caller identity caches; getter, symbol, extra-field, exotic-prototype, proxy/reentrant and TOCTOU guards remain tested. Only admitted immutable class mechanics and route-derived advisory scalar are cached. Final frozen scalar projection ownership is unchanged.

Feasibility reasons distinguish unsupported grade, sharp geometry, mechanically impossible curvature, corridor exit, reverse motion, height/heading mismatch, requested/actual overspeed and route end. An infeasible result returns steering0 and an explicit reason; it does not claim following that trajectory. Tested candidate margins are endpoint continuity1e-6m, heading step20 degrees, grade0.08, corner acceleration3.5m/s² and preview3+0.45×speed metres. Empirical validation covers the authored fixtures and tested mechanics/speeds, not all roads, weather or tyre conditions.

## Native performance and calibration

The independent original BEFORE sourceeee89fc531866a3b1888047d4b3072e38d61579c72d1bf13dffb77284a301ac2 was captured before049 production on the pre027 checkout. After published027 dependency update, current preproduction BEFORE-v3 sourcea9d1039fe08d245427dfa162c9f295ec93cb6545a1af050b43e73dce78f9757b was accepted before algorithm authoring. Both archives remain immutable; original absence verifiers deliberately do not approve the current production checkout. The dependency refresh is not a049 improvement or causal timing claim.

ONE optimized AFTER-v2 source726b4f10b816aae0735b7b0278132c1535ed03479f9a730e3e2268eb001af32c passed current and historical strict verifiers. Twenty native worlds use70normal/110overload, five alternating observerON/OFF pairs each,180warm/600measured ticks. Four solo worlds additionally prove actual024 MANUAL/AUTO parity for sedan and compact. Commands, all60tick numeric checkpoints, tracking envelopes and final physical hashes match BOTH immutable baselines exactly. Measured driving has zero pose/velocity writes. Two600Float64 channels own9600bytes ON/zero OFF; all native/controller/lateral resources release.

Normal70 ONtick p95 is2.1530/2.1633/2.0751/2.0936/2.0487ms, median2.0936ms; every run meets5.5ms. Overload110 is3.4135/3.2928/3.3706/3.4259/3.2527ms, median3.3706ms, reported separately. All four population/baseline comparisons have0/5 confirmed relative regressions (above10% AND1ms). Own110fleet-stage p95 is0.8594/0.8418/0.8702/0.9390/0.8162ms, versus the preserved failed1.2532/1.2076/1.2163/1.2799/1.2253ms. Full authoritative tick includes controller/physics; no separate physics-step percentile channel was captured.

Calibration-v3 source44a85d9a586a42d6d89a91fa4500b125d2e80260a1ef1e970ad5eb5d9ae6595a passed22 actual native arms: both classes at3/5/7m/s on straight/LEFT/RIGHT authored geometry, plus7.3m/s LEFT/RIGHT near the radius16 envelope. Four infeasible arms explicitly reject requested12m/s and radius2 geometry without actuation. Maximum cross-track0.556134m; maximum actual boundary speed7.452111m/s is below advisorysqrt(3.5×16)=7.483315m/s. The explicit fixture governor has disclosed positive steady-state bias; actual speeds are read from native bodies. Mechanics checks exactly match native f32 grip/radius/half-coordinate wheelbase/track and derived turning radius, with integer mass and stored JS power unchanged.

Actual4,340,292byte Rapier ESM SHA25602dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0 is durably archived before each run set, with start/end source/native guards. Archive .gitattributes preserves raw bytes through Git; no rewritten capture or backdated native archive is claimed.

## Real browser driving

Parent ran six visible real Rapier arms on each actual AMD Chrome backend: sedan straight5/LEFT3/RIGHT7, compact straight5/LEFT7/RIGHT3m/s. Both WEBGPU and WEBGL2 reports PASS, and the independent current/historical driving verifier checks source, durable built bytes, foreground focus, CSS/internal1920×1080/DPR1,30 renderwarm frames before physics, zero fixed-tick overload, continuous finite motion, actual authored TURN traversal, tracking envelope and cleanup. Each backend performs approximately60 seconds of authoritative60Hz driving. These are short physical driving probes, not fleet rendering benchmarks.

WebGPU reports vendoramd/rdna-3. WebGL2 reports ANGLE AMD Radeon RX7900XTX Direct3D11; startup CIM hardware is separately archived. Frozen runtime source2de345e932deba57167c61214c0c72c3d83ca76ca9684993ff1826932d7d6877 contains80 byte-exact inputs. Artifact88709e69f22b7a17ccc17e06d729122ba71668c4f64a7dc30193b8667a8ae1f5 covers142 emitted files; durable ZIP035ff2faab6a428f35c575945b054b8228e5c2314bece26cc925f3f0a61479d9 independently rehashes actual files plus manifest/hardware. Raw drive-webgpu.json and drive-webgl2.json remain intact. The owned5200 fixture server was stopped after accepted captures; the user Chrome window was untouched.

## Preserved failures

- Preparation initially violated032 service-zone/reachability constraints; correction and both failures are recorded in preparation-failures.md. Circular reference lanes alone were never claimed as authored TURN proof.
- Dependency BEFORE-v2 failed comparing native SI/DI prototypes against decoded plain JSON after all20+4 worlds. Sourcec554c3b68cf53a0d313d934ea15732f3bbe1300a026127a97da4a71c8a1ea1bb and FAIL remain; a separate exact numeric diagnostic and distinctv3 serialized both full shapes without tolerance or dropped fields.
- First AFTER source3c8237fc17e7d159b75bd32dab3f8584fd3e59dd9c58e4051aa3afcef981db82 had exact physical integrity but confirmed110relative CPU regression3/5 versusv3. One approved descriptor-copy optimization produced distinct AFTER-v2; its verifier rehashes and preserves that earlier failed acceptance, with no baseline waiver.
- Calibration sourcesb4953819c14b35b3c47307b2e10b89a800ab93de7fca7bbc523195d35dbb1fb0 andbb959bd0c4bd0a311eedd4f30a656431b94a707291bf80c881c47c7d72fb305e retainFAIL from exact JS-vs-nativef32 grip/wheel guards. Adapter-reviewed distinctv3 uses exact expected native representation, with no physics/tolerance change.
- The first real Chrome AUTO attempt similarly failed its stale JS grip guard after the first maneuver. The failure, sourceabaf/artifact2ec/ZIPa2a9 and logs are intact under initial-browser-mechanics-guard-failure. Browser-only guard repair preserves native production/AFTER/calibration bytes. Initial draft lint/architecture/type/test failures and their identified repairs also remain in raw logs.

## Reproduction and scope

Latest `npm run check` covers type/lint/format/architecture and457 meaningful tests. Evidence verification commands from the checkout:

- `node Docs/Evidence/049-lateral-controller/verify-after-v2.mjs` (also `--historical`).
- `node Docs/Evidence/049-lateral-controller/verify-calibration-v3.mjs` (also `--historical`).
- `node Docs/Evidence/049-lateral-controller/verify-driving-v3.mjs` (also `--historical`).
- `powershell.exe -NoProfile -File Docs/Evidence/049-lateral-controller/artifact-archive.ps1`; optional readonly `-EvidenceDirectory` verifies the preserved failed-build folder.

No fleetFPS, laptop, full game, exact heap/GC count, regulatory-style override, autonomous longitudinal policy, universal feasibility or future lane/service behavior mechanics is inferred. Parent integration must independently audit main Git-index bytes and disclose any checkout-EOL-only differences rather than relabel strict current hashes. This delivery leaves physical Done validation to the parent.
