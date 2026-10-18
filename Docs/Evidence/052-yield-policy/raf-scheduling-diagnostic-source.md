# RAF scheduling diagnostic — finite source handoff

Diagnostic only: no hardware/performance/PBI acceptance, no replacement baseline. Original V2–V6 captures/archives remain immutable; failed captures remain FAIL. Assigned worktree F:/Sites/self-driving-academy/.worktrees/yield-policy-01, branch loop-pbi/yield-policy-01. AGENTS/PBI052/Docs25/manifest/loop-pbi read. Parent owns Git, board and all browser Run actions.

## Motivation and API scope
V6 FULL arm4 tick3801 observed RAF wait1658.6ms, zero native step advancement3981/3801. Prior completed render1.7ms, last native costs2.1/1.8/1.8/1.5ms. This locates the observed gap inside awaitedRAF; GC/OS/compositor/throttling causes remain UNKNOWN. Parent reported distinct068 first-warm RAF/zero-native-step failure, context only.

New diagnostic records real requestAnimationFrame timestamp separately from performance.now callback and native read start/end; no identical-clock assumption. Longtask PerformanceObserver is used only if supported, with observererror and overflow disclosed.50ms timer due/fired samples offer event-loop delivery evidence. Longtask overlap means correlation, never GC/OS cause. GC/OS/DevToolsTracing remain null; no Tracing capability assumed. All diagnostic observer/timer/allocation overhead is explicitly included and unsuitable as product performance evidence.

## Owned source and fixture
Eight new files tests/browser/raf-scheduling-diagnostic/{index.html,main.ts,protocol.ts,protocol.test.ts,server.mjs,store.mjs,store.test.mjs,verify.mjs}. Sorted basename+bytes fingerprint b244ad9f15829dee2b31e1950f12d9889dafff3d2d99e0f6d64c2e37cf0e36c7.

Three40-second phases, nominal120seconds plus setup: RAF_ONLY before asynchronous backend creation; EMPTY_RENDERER; NATIVE70+renderer using immutable V6 native runtime. Subject/priority/parked-i IDs reread and exact.70 actual bodies, existing60Hz mechanics/control/solver/CCD unchanged; native250ms debt/max4 catchup guards remain, overload terminates INCOMPLETE. Four-second RAF watchdog marks missingcallback diagnostic, never waives native250ms. High-refresh/cap overflow likewise explicitly INCOMPLETE, never deletes original measured rows. No claim of exact full V6 timing-protocol equivalence, reference/current parity or performance acceptance from this isolation fixture.

FIRST versus steady callbacks retain warm/setup observations. FIRST_NATIVE_BEFORE_STEP is an actual beforeTick1 owner callback; nativeanchor is onTick after the first physicalstep, truthfully labeled. Latest/pre-first native snapshots include actual counters and read endpoints; SETUP actualserial/controller readback separate. Shader/setup/render/anchor stage ordering recorded. Sticky focus listeners installed before first async START, actual ownedlistener cleanup count0; renderer/native resources once-disposed with protected actual cleanup/error readbacks. Caller-owned output snapshots remain separately bounded.

## Evidence/transport bounds
Canonical waits and longtasks are each exported once; duplicated correlatedStalls field was removed. Offline correlation can inspect one canonicalwait against bounded4096tasks, without exporting a crossproduct. Bounds:24000waits,4000heartbeat rows,4096longtasks,20stages; cleanup and nativeCleanup each262144encodedbytes; error summary16384characters and observererror2048; build256paths≤512codeunits, with actualsource/native/artifact identities.

Initial30000wait worstshape test FAILED at18652106bytes, preserved. Derived24000wait signedmax-finite-number shape includes all actualreportfields, outstandingsinglewait, both preNative snapshots, APIavailability, stage/errorledger/build fields and additional2×256KiB cleanupreserve. Actual encoded maximum-shape15952213bytes <16MiB16777216, margin825003bytes. Object/array/JSON transients are additional memory and not a totalheap claim. At144Hz120seconds roughly17280waits; very high refresh may exceedcap and yields explicitINCOMPLETE. This is diagnostic admission, not a gameplay gate change.

/start records immutableoneAUTO/WEBGL2attempt before observations. Actual source/native checked atstart, server-returned artifactidentity validated byclient and retained inreport. /diagnostic persists submittedrawbytes+SHA/receivedAt before CURRENT sourceguard/shape checks; source/artifact/native all match actualmanifest. Duplicate attempts cannot overwrite. Oversize streamedbody stops16MiB; bounded body-read-failure marker preserves headerattemptedcaptureID and observedbytes/statusINCOMPLETE_TRANSPORT, without retaining unboundedbody. Validation rejection retains submitteddata and rejectedmarker. No autoresume/retry.

## Actual finite verification
Logs/sourcebefore/firstfailure/finalsource/result: raf-diagnostic-checks-01/. Firsttransportshape failure and30000source preserved. Final8/8puretests PASS237.1145ms: realoverlap vs priorrender, absentcallback, capacityoverflow, onceattempt/fullidentity, rawbeforeguardreject, oversizedstreamcapturemarker/nooverwrite, worstshape, oversizedcleanupretainraw. Typecheck, scoped3TS lintmax0,3MJSsyntax and scoped8filePrettier check EXIT0. Correctedactual30000→26000→24000admission never changed product or hardware thresholds. V2/V3/V4/V5/V6 all CURRENT/archive rawsource hashes+native+wholeZIP byte guards PASS86/86/88/90/89inputs. No worlds/native benchmarks/build/server/browser/Git executed.

## Proposed ONE launch after parent review
Distinctport5215 (5213actual068;5214reserved219). Builder/staticserver source prepared, NOT executed. Exact assignedroot/branch and absent .pbi-validation-raf-scheduling/build guard; actualtransitive executable-import source scanner, wx rawsource/native archive before futureworld, actualemittedartifacts and wholeZIP; compiler injects actualsourceHash/nativeHash/diagnosticOnly. Manifest validationRevision diagnostic-transport-v1-no-performance-acceptance. Staticread occurs BEFOREheaders; sameorigin/typeguard retained.

Future separately authorized commands from assignedabsolute worktree:
1. node --import ./scripts/register-typescript.mjs tests/browser/raf-scheduling-diagnostic/server.mjs 5215
2. node --import ./scripts/register-typescript.mjs tests/browser/raf-scheduling-diagnostic/verify.mjs <ACTUAL_NEW_EVIDENCE_FOLDER> --build-only

Verifier accepts BUILD_ONLY only: actualCURRENT/archive/source/native/emitted/ZIP/startupAMD integrity, explicit falseperformance/full; historical V2–V6failedSHA disclosed. Runtimecapture has diagnostic status and rawobservations, never hardwarePASS. Parent independent review and fresh physicalforeground confirmation precede any controlledshort Run. No new build/capture grant is inferred from these commands.
