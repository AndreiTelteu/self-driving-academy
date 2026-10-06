# 029 current signed hardware harness — source review snapshot

This is source preparation, not permission to execute. Production remains bf78ad85 with current chronological CPU capture241fa88 PASS; old v2–v5 failures, raw heap flags and diagnostics remain immutable. The repair scoped CPU slot is terminal and released. Native/browser/memory acceptance remains pending; the parent separately granted exactly one frozen build, which is not a native or hardware probe.

Earlier finite grant: six collector unit tests PASS6/6, scoped formatting/lint and typecheck exit0; first typecheck failure retained and corrected precise types. Published027 provenance preparer ran once:22 executed runtime files are exactly byte-identical to publishedf1 Git blobs, no EOL-only differences. Logs collector-checks-02.txt, collector-typecheck-01/02.txt, collector-lint-02.txt, reference-proof-01.txt and reference-provenance.json. Subsequent finite scoped grant completed: owned full harness sources formatted, global typecheck exit0, scoped lint exit0 and10 pure tests PASS10/10 in206.69ms (hardware-*-02 logs). Initial hardware-typecheck-01 and hardware-tests-01 failures are retained: Node-only helper type visibility and an adversarial test with stale histogram-buffer accounting were repaired without production/shared configuration changes. No native/build/server/browser/global-full-test execution occurred, and the wx provenance proof was not rerun.

## Source map

| Source under tests/browser/vehicle-damage | Responsibility |
| --- | --- |
| hardware-collector.ts / hardware-parts.ts / hardware-protocol.ts | Eleven frozen metric IDs,4096×.025ms counters, counted finite overflow, nearest-rank intervals, joint relative/absolute uncertainty, canonical full20run order, part/identity bounds |
| hardware-workload.ts / hardware-reference.ts | Actual native70-car physical fixture/common Babylon renderer; actual archived/published027 versus current029AVAILABLE, both027opt-in; class/mechanics/token/control/native-input/checkpoint codec |
| hardware-runner.ts / hardware-entry.ts / hardware.html | Manual single-backend normal5pairs/arm OFF/ON;30s warm/120s measured; actual AMD1920×1080/DPR1/focus/context/60Hz guards; immediate unsorted memory endpoint; bounded per-run exports, no automatic retry/resume |
| hardware-run-manifest.ts / hardware-verifier.ts | Required timing presence and RAF/tick correlation, all70 actor counts, exact phase/memory/cleanup, recomputed quantile ranks/counts and58 fixed checkpoints; current/reference budgets and honest OFF/ON perturbation |
| hardware-transport.ts / hardware-store.ts / hardware-server.mjs | Actual shared origin/content-type/streaming128KiB seam; serialized deterministic wx parts,16/run/320/backend, full manifest acknowledgment, frozen source/native/artifact guard, no listener except explicitly started loopback server |
| hardware-functional.ts / hardware-functional-store.ts / hardware-functional-verifier.ts | Twelve actual class×PLAYER/AUTONOMY×0/3/12m/s collision cases, signed magnitude/native readback, IMMOBILIZED/minimum brake/dwell, recovery physical equality/history prefix, service/handbrake/lateral/suspend guards;20 real engine/scene/canvas/native owner cycles |
| prepare-hardware-build.mjs | Future single production build; archives actual runtime/current/published/common fixture closure, provenance, installed native bytes and every emitted artifact byte before first world; failure archive preserved |
| hardware-archive.mjs / verify-hardware.mjs / verify-functional.mjs | Independent current or historical archive verification, all source/artifact/native hashes and sizes,22 published Git blob identities with separate EOL facts; hardware distributions/parts/comparison recomputed; functional32 cases/chronology/readback/recovery/cleanup independently checked |

## Frozen protocol and bounded memory

OFF observes common RAF histogram + fixed raw heap endpoints + physical/focus guards only. ON adds full timings and1Hz observed JS-heap sampling. Missing external-input latency and unavailable/incomplete full-window GPU timing are null/UNVALIDATED; they cannot turn into zero or whole-protocol PASS. RequiredCPU/frame/memory verdict is separate from optional timing coverage.

Normal full sequence is20 runs/backend:5 pairs, OFF/ON for each published027/current029 arm, each30/120 real-wall seconds. Both actual backends require separate reviewed runs (about50min/backend). No automatic backend switch or selective successful-arm resume. Preserve any partial attempt and review original source/protocol/chronology before another run.

Common exact checkpoints are58 absolute physical ticks1920..8760 in120tick increments. Both warmup and measured simulation/real-wall ratios must be≥.98; their physical tick minimums imply final8760 is reached without post-window tail stepping. Actual variable measured-end tick/hash is separately retained and never substituted into cross-arm exact equality. Each checkpoint hashes all70 binary16-scalar physical/native-input records plus explicit token generation/handle, actual class/mechanics, suspension, authority, raw/effective command, target tick and drivetrain data. Negative zero and nonfinite numbers are handled explicitly. Three-car raw trace remains bounded; all58 checkpoint hashes are exported. Hash draining and exports happen after the immediate raw end-memory endpoint.

Actual persistent typed-buffer accounting is written into each run and independently recomputed: current9 non-null histograms ON189464bytes / OFF50200bytes. This includes trace24576bytes,70 actor counters280bytes and one8960byte physical-hash scratch; ON heap8192bytes, OFF heap0bytes. Maximum11 histogram persistent ceiling222232bytes; reserved but unallocated256byte endpoint allowance raises declared maximum ceiling222488 ON /50456 OFF. Endpoints are three bounded JS records, not an allocated typed array.

Checkpoint command/mechanics encoding is separately capped128KiB per checkpoint, with≤64 pending checkpoint promises. WebCrypto copied inputs and temporarily live encoded buffers are separate transient retention; conservative encoded-buffer capacity64×128KiB, native scratch-copy capacity64×8960bytes, plus implementation-dependent internal copies and JS/promise overhead. These are disclosed limits, not measured exactRAM, and OFF/ON share the same checkpoint/hash observer. No64 retained full70-car state graphs are advertised as one8960byte scratch. Observed heap peaks remain lower bounds on true Chrome JS-heap peaks; native/WASM/totalRAM stay unavailable rather than being summed or given a fake PASS.

## Checklist before execution

- Scoped formatter/type/lint and16 pure tests PASS under the latest repair grant; these are not native/hardware acceptance. The tests are six collector, two manifest, two transport/storage, five failure-boundary and one phase tamper test. Transport tests cover exact128KiB boundary, streamed overflow, wrong/null origin, content type, immutable wx duplicate, wrong canonical next arm and source drift. They do not start a server or native world.
- Native/functional builder lifecycle errors preserve original and cleanup causes; old capture files are untouched. Check factory/dispose/failure export paths in source review.
- Build preparer must freeze the complete closure and every emitted artifact byte; independent verifier must recompute combined source/artifact hashes and installed/archive native identity. Merely passing source tests does not validate the production build or hardware.
- Review nullGPU/input scope explicitly; no whole-protocol performance PASS is emitted while these are UNVALIDATED. Current scoped heap acceptance also remains UNVALIDATED until available actual matched endpoints/observed peaks are reviewed.
- After a separate build/browser grant, functional smoke/full32case protocol first, then normal full hardware backend protocol with immutable parts/ack. Both actual backends, raw heap review and final global integration remain pending. Lifecycle20 cycles are scoped029 evidence, not224/159 soak.

## Commands for a later granted slot (not executed here)

All commands start in F:/Sites/self-driving-academy/.worktrees/vehicle-damage-01 on loop-pbi/vehicle-damage-01; verify cwd/branch first. No native/performance run is hidden in the unit tests.

```powershell
node --import ./scripts/register-typescript.mjs --test tests/vehicles/damage-hardware-collector.test.ts tests/vehicles/damage-hardware-manifest.test.ts tests/vehicles/damage-hardware-transport.test.ts tests/vehicles/damage-hardware-boundaries.test.ts tests/vehicles/damage-hardware-phases.test.ts
npx prettier --write 'tests/browser/vehicle-damage/hardware-*.ts' 'tests/browser/vehicle-damage/*.mjs' tests/browser/vehicle-damage/hardware.html 'tests/vehicles/damage-hardware-*.test.ts'
npm run typecheck
npx eslint 'tests/browser/vehicle-damage/hardware-*.ts' 'tests/browser/vehicle-damage/*.mjs' 'tests/vehicles/damage-hardware-*.test.ts' --max-warnings 0
```

The existing wx provenance proof must not be blindly regenerated. Build/server require their own explicit grant:

```powershell
node tests/browser/vehicle-damage/prepare-hardware-build.mjs
node --import ./scripts/register-typescript.mjs tests/browser/vehicle-damage/hardware-server.mjs Docs/Evidence/029-vehicle-damage/hardware-TIMESTAMP/build-manifest.json 5199
```

Actual emitted manifest path comes from the builder; TIMESTAMP is a placeholder, not existing evidence. Server serves http://127.0.0.1:5199/hardware.html with one normal backend attempt. Restart the server against the SAME frozen manifest only after parent review; no implicit permission to rerun a failed capture or change source. Independent read-only verification after captures:

```powershell
node --import ./scripts/register-typescript.mjs tests/browser/vehicle-damage/verify-hardware.mjs Docs/Evidence/029-vehicle-damage/hardware-TIMESTAMP/captures/CAPTURE_ID
node --import ./scripts/register-typescript.mjs tests/browser/vehicle-damage/verify-functional.mjs Docs/Evidence/029-vehicle-damage/hardware-TIMESTAMP/captures/functional/CAPTURE_ID
```

Add --historical only for clearly labeled archived-source verification after integration; CURRENT equality is required for the actual source being tested now. Verification PASS means byte/protocol/recomputation integrity; it is distinct from the hardware comparison verdict, which may be FAIL or UNVALIDATED.


## Seven harness review repairs and scoped results

These changes affect harness source only. Production controller SHA256 remains2b2e98e329cd4e87f868128e646b3f1dd6f91468aae8253c76a8710b256ff587, chronological currentCPU241fa88 and all earlier raw failures/diagnostics remain immutable.

| Finding | Actual source disposition |
| --- | --- |
| Static headers before missing-file read | hardware-static-response loads bytes before200; ENOENT404, other read failures500; already-sent responses destroy rather than write another header. Shared server seam tested missing404 then valid200. |
| Original/cleanup/export errors and double disposal | hardware-lifetime owns each acquired resource once, attempts all owners, preserves32 bounded cause messages (2048chars each) and total/omitted counts. Runner/cases/cycles/failure exports use the ledger; no outer repeated native disposal. Disposal/readback/export failures cannot replace initial cause. |
| Readiness leak | Runner registers actual workload before scene-ready await via awaitOwnedReadiness. Injected readiness rejection +both disposer failures +export failure test uses that exact seam; no native world. |
| Rejected raw functional case lost | Valid capture/expected ordinal bounds are checked before deterministic paths. Source/actual identity failure marks terminal and wx-preserves rejected-case-EXPECTED.json raw body plus bounded rejected.json reason; does not advance normalcase. One rejectedcase maximum, payload128KiB. |
| Missing independent phase evidence | Functional-only callback captures at most64 compact actual per-tick raw/effective/native/drivetrain/velocity readbacks. First six reverse, service-brake, handbrake, lateral and resume-neutral ticks, plus recovery when required, are mandatory. Actual near-zero transition records prove six consecutive at-rest/brake-released dwell ticks wherever native dwell occurs; no assumption that pose reset immediately settles. Suspension retains actual before/after body and rejected call. Offline verifier rejects missing/tampered phase/source/dwell/motion/suspend/brake fields. Synthetic verifier tests prove rejection, not native acceptance. |
| Old valid runs concealing terminal failure | Independent hardware verifier rejects failure/rejected/incomplete markers before source/protocol verification, in CURRENT and historical modes alike. |
| Available optional timings failing silently | ON GPU>12ms/input>50ms interval absolute FAIL propagates optional and overall FAIL. Missing or ambiguous optional channels stay UNVALIDATED; required CPU/frame/memory verdict remains separate. |

Setup errors before a named result exists retain terminal ordinal and bounded acquired-resource/error ledger, not a completed named-case record. Creation failures have no fabricated native readback. Functional-case payload cap128KiB remains enforced; added phase sampling is outside measured hardware windows and does not alter original CPU or hardware performance gates.

Actual final logs: hardware-repair-format-check-02.log exit0; hardware-repair-typecheck-05.log exit0; hardware-repair-lint-02.log exit0; hardware-repair-tests-03.log16/16 PASS257.4381ms; final affected phase test hardware-repair-phases-final-01.log1/1 PASS146.5679ms. Earlier repair logs remain immutable, including unsupported strip-only constructor parameter properties, incomplete test interval types/read-only mutations, a duplicate unreachable phase assertion and EOL formatting. The loader-compatible explicit-property constructor and precise test fixtures repaired causes. No native world/server/browser/profiler/global-full-test/Git operation occurred in this scoped slot. Published wx22file provenance proof was not regenerated.


## First frozen hardware build — actual build only

The separately authorized ONE prepare-hardware-build.mjs execution exited0 (hardware-build-01.log), without native worlds/server/browser/Git or provenance regeneration. Manifest: hardware-20261006T032726912Z/build-manifest.json. ArchivedAt: 2026-10-06T03:27:29.289Z. Actual source closure71inputs/604429bytes; durable emitted47artifacts/8671887bytes; native4340292bytes. SourceSHA256 83aecf5bcda8fbda03bacc2822d51b076dd01fd5f3b48bf4e2d980aef85c3370; artifactSHA256 ff09439b0853190dd9fb0acfab0ba9fdff82cd3fbf196736aa58650f93aee520; nativeSHA256 02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0. Vite built in2.06s; large-chunk warning is preserved. This is build/archive success, not hardware/native/heap acceptance. All build processes are terminal and CPU released; later execution still requires the coordinator's separate grant. No frozen runtime source is changed by this documentation update.


## Actual first AUTO functional attempt and material registration repair

The parent launched real Chrome AUTO FUNCTIONAL against the first frozen build. Capture hardware-20261006T032726912Z/captures/functional/20261006T033201784Z is terminal FAILED: actual WEBGPU, sedan/PLAYER/0m/s, simulation tick0, phaseReadbacks empty. Scene readiness rejected with `StandardMaterial needs to be imported before as it contains a side-effect required by your code.` Immutable files start.json18525bytes, case-0.json1657bytes and failure.json408bytes preserve the original cause. Six acquired owners were each attempted once; all native body/subscription/collision/controller/damage counters, scene/engine/mesh/material/texture counts are zero, canvas count1 and disposed native read rejection true. This cleanup proves the failed case boundary, not twelve native successes or twenty ownership cycles.

Parent reported actual Chrome hardware context with AMD and used temporary1920×1080/DPR1 emulation, then cleared those metrics and stopped only the owned server. The failed case did not reach the in-loop hardware/motion gates, so it supplies no successful physical/performance/heap/keyboard evidence. No human-key hold proof is claimed.

Installed Babylon9.29.0 `scene.pure.js` begins with a throwing Scene.DefaultMaterialFactory. Actual `Materials/standardMaterial.js` imports and calls RegisterStandardMaterial, whose pure implementation registers the actual default material and image-processing parser. Installed package.json explicitly retains Materials/standardMaterial.js in sideEffects. Existing actual027/028 browser harnesses import StandardMaterial too. The correction is an explicit side-effect import in common hardware-entry.ts, before either FUNCTIONAL or STEADY run; no renderer mock, production change or alternative physical fixture. Shared imported run modules create no scene at module evaluation, so registration precedes every scene/material readiness/render call. StandardMaterial's normal GLSL/WGSL dynamic shader loaders remain Babylon-owned and must be included/verified in the next distinct emitted artifact archive.

New entrySHA25604d6d4b3eabead20d916717f6079ec0962df23c93bd1b2b3d45e018b8ac88fce; production controller SHA remains2b2e98e329cd4e87f868128e646b3f1dd6f91468aae8253c76a8710b256ff587. Scoped hardware-material-format-01.log, hardware-material-typecheck-01.log and hardware-material-lint-01.log all exit0. No import-mirroring unit test was added; no native/server/browser/build/Git execution occurred during repair. CPU released. Original build/source83aecf5b/artifactff09439b/capture remain immutable. A future distinct reviewed build is required; static success does not establish that emitted registration/shaders or actual backend playtests passed.


Distinct reviewed material build20261006T033445456Z succeeded exactly once; archivedAt2026-10-06T03:34:46.583Z. Actual71sources604570bytes/58artifacts9064156bytes; sourceff7f45ea1642cfc8c326d02a5eae5b9e59954938518f77680b12d989305ce7d3; artifact7d7687d2447c4bac2b3f4d8e703f8229dd54460032291cd0a31910ca3b25a1f4; native02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0 unchanged4340292bytes. Raw hardware-material-build-01.log exit0 (846ms, retained chunk warning). Independent CURRENT verifyFrozenArchive checks71source/current rows,58durable artifact rows, native/archive bytes and22published Git identities: hardware-material-archive-01.log PASS. Byte inspection separately shows emitted actual DefaultMaterialFactory new StandardMaterial registration plus its retained call and four default GLSL/WGSL shader chunks; hardware-material-build-inspection-01.json and hardware-material-registration-call-01.json preserve bounded snippets/counts. These are emitted dependency/archive checks, not execution of scene/native/browser. CPU released; no server/native/browser/Git/provenance rerun. Earlier failed material build/capture remain immutable; actual fresh functional and steady/memory evidence still pending.


## Second actual AUTO attempt: interrupted dwell selection

Real Chrome AUTO functional capture20261006T033725315Z against frozen ff7f45ea/7d7687d2 is terminal FAILED at finish ordinal32. All32 immutable case files, start and failure remain saved. The original verifier selected the first counter1 and demanded that incomplete attempt be immediately1..6. Actual sedan initial ticks361..366 had counters1,2,3,0,0,0 as native total motion exceeded0.2m/s, then later373..378 completed six at-rest ticks; compact likewise first1,2 then reset and later375..380 completed six. IMMOBILIZED recovery completed781..786. Original errors, resets and physical motion are retained; no physics/setups/thresholds or captures were changed. Parent stopped owned server67729/PID106032 and cleared temporary metrics; hardware/CPU released.

The verifier-only correction requires a genuinely completed attempt, not the first incomplete prefix. Before completion it validates each retained counter increment/reset, native total velocity, original requested reverse, forward engagement/no thrust and actual shift braking. Reset0 requires motion above0.2 or braking;1..6 requires at-rest/brake-released contiguous native ticks; completed6 must engage REVERSE with the unchanged expected signed magnitude. All earlier rows remain evidence. Meaningful pure tests reject missing/later-gap tick, early gear/thrust, tampered velocity/reset and no completed attempt. hardware-dwell-format-01/typecheck-01/lint-01 logs exit0; hardware-dwell-tests-01.log2/2 PASS135.6274ms. No native/build/server/browser/Git ran during repair.

Supplemental corrected-current verifier applied to preserved32rawcase rows is NOT acceptance of that failed frozen attempt. First supplemental execution stopped at a separate exact setup-readback assertion: native Rapier float32 stores y0.8 as0.800000011920929; original expected literal0.8. hardware-dwell-supplemental-01.log retains this failure. Proposed exact Math.fround(0.8) expected value is pending separate coordinator scope review, not a tolerance/physics/threshold change. Original failed capture and failure marker stay FAILED. A distinct future reviewed build/browser attempt remains required; current productionCPU241 remains unchanged.


The coordinator separately approved the exact native float32 expectation: Math.fround(0.8), with x/z exactly0. No epsilon/tolerance, setter, physical setup, production source or numerical acceptance limit changed. hardware-dwell-f32-format-01/typecheck-01/lint-01 all exit0. Supplemental hardware-dwell-supplemental-02.log/json now validates12 actual native cases and20 ownership cycles under the corrected current verifier and independently verifies old frozen71source/58artifact/native/22published identities in HISTORICAL_ARCHIVE_ONLY mode. Completed actual dwell ticks: sedan373..378, compact375..380, IMMOBILIZED recovery781..786; original interrupted first-attempt rows remain included. Case ordinal/hash/byte-size rows are preserved in the supplemental JSON.

This does not accept the original failed frozen capture: failure.json stays present, official independent verifier continues to reject failed attempts, and its original frozen verifier remains unchanged. The first supplemental01f32 failure remains intact. Current phase-verifierSHA256b00e19f8bb2ffdd2df1ee3f43f9cef1e351797a6367b1a8b1c77de802933bb6a; case-verifierSHA2561cb4ce4f61eb7645350cdcab9fb993cb6d44057be32d42b66c87bd556c74972d. CPU released; new build/native/server/browser/Git remain unexecuted/ungranted for these verifier corrections. Parent/wheel source closure review precedes any distinct frozen-build/browser attempt.


Third distinct frozen build20261006T034626897Z executed once and exited0 (hardware-dwell-build-01.log615ms, chunk warning retained); archivedAt2026-10-06T03:46:27.799Z. Sourcebd02a51853838ad2a9375d044699bd604082518538ee09360b2a5dca0fbd2c4a,71inputs606289bytes. Artifact7d7687d2447c4bac2b3f4d8e703f8229dd54460032291cd0a31910ca3b25a1f4,58files9064156bytes; native02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0 unchanged4340292bytes. CURRENT source/archive/artifact/native plus22published Git identities PASS (hardware-dwell-archive-01.log). Independent hardware-dwell-build-comparison-01.json verifies every58artifact byte identical to the previous material build: only server/offline hardware-functional-phases.ts and hardware-functional-verifier.ts changed in the71source closure. Artifact equality is expected because those runtime validators are server/offline, not executed page code. Both earlier failed builds/captures/markers remain immutable. CPU released; this build slot had no native/server/browser/Git mutation/global checks or provenance regeneration. Current distinct functional/browser acceptance is still pending.


## Additive terminal readiness update — 2026-10-06

The prior proposal/repair chronology above remains historical. Both distinct final frozen functional captures and both full20-run actual AMD Chrome backends now passed strict CURRENT verification for required CPU/frame/JS-memory gates. Individual failed endpoint pairs and GPU/input NOT_MEASURED optional/global UNVALIDATED remain explicit. See [current-delivery-summary.md](current-delivery-summary.md) for exact identities, commands, raw comparisons, failed markers and parent-owned remaining integration/board checks. No measured71source/native/artifact changed in this documentation update.
