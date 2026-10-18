# PBI068 STEADY v3 — SOURCE ONLY

This distinct proposal addresses V2 first warm callback sharing the initial RAF stamp. No test, build, native world, server or browser has been run for v3. V1 and V2 FULL remain FAILED. No product, old source or capture changes.

## Minimal changed protocol

Original initialization RAF, warmStarted and all30/120s origins remain. At most one repeated timestamp is allowed only before first positive warm frame, with actual initial nativeSerial/controllerTick0, debtSeconds0 and activeRealSeconds0. Its actual request/returned stamp/callback read/counters are retained separately; no render/loop call/native sample/frame percentile is invented. Exactly one followup RAF request has a250ms timer. Timer cancels only that RAF once and preserves outcome TIMEOUT, actual timeout observation, returnedStamp/callback/counterAfter null. Late callbacks cannot manufacture success. Successful followup requires cumulative original-stamp gap>0<=250 and actual request-to-read<=250. Second/later/measurement duplicate and regressing time fail explicitly; visibility/focus/async guards unchanged.

Entry callback array has fixed capacity2 (one normal entry or duplicate+positive); actualCallbackCount increments only after actual delivered awaits. Offline validation binds returned rows, counters0, debt0, origins, delivery and count=initial+positiveWarm+positiveMeasured+duplicate. Existing allRAF native array remains one entry per positive fixed-clock frame with0..4 steps; zero callback is distinct and never included in frame percentiles. Measured rejected repeated/regressing callback preserves bounded actual clocks/counters before failure; its added clocks/reads are observer overhead inside both OFF/ON measured windows. Extra entry-row objects/snapshot reads are bounded but object RAM not exact; original typed raw bytes and caps unchanged.

Gates unchanged: genuine30/120s, .98 simulation/wall both phases,250ms gap/debt, max4 native steps/frame,70physical cars,29 exact300..8700 checkpoints and variable final endpoints, original absolute/relative CPU/frame/JS-proxy heap gates,20arms/backend and BOTH required. No clipped delta, extra native tick, origin reset, selective arm resume or historical PASS reinterpretation.

## Paths / provenance

Browser root tests/browser/vehicle-selection-steady-v3, assigned port5216, absent .pbi-validation-068/build-steady-v3-01 and Evidence/browser-steady-v3-01. Server Vite root and ./main.ts/index ownv3. Actual domain/native commonad32 and historical source imports retain previous source derivation historical-steady-derivation-v2-01.json BYTE EXACT; do not execute new derive-historical-steady-v3.mjs (unused copy). Numeric/source readers newv3. Original V1 reader+proof reused exact; new verify-steady-original-failure-v3 pins exact V2 metadata, two ordinals/raw parts/terminal sets, ZIP/native/allarchivedsource and both FAILED markers. It does not reinterpret successful world0 as full PASS.

V2 failure007d96cb5350f7a933c89b9ceda6586c2c6cc2657ac61b91ea406cb4a2261201; world0 36da9cd7da0ab69d0483c8b07ba0a8bfd7f2728d40477c0d827539ae2cc23ad6; world1 85c11176b44087c7f9d23c52f8efb2a012ebf4f32393efc2b6c5900b74a629df. Exact proof literal cardinality and hashes, no arbitrary empty rows=>arms claim.

## Proposed later commands (separate grants required)

- Scoped formatter NEW v3 source/evidence files only; npm run typecheck; configured browser TS eslint --max-warnings0; explicit new MJS syntax. Docs/helpers MJS no repo lint config, disclose scope.
- node --import ./scripts/register-typescript.mjs --test Docs/Evidence/068-vehicle-switch/initial-callback-checks-v3.test.mjs tests/browser/vehicle-selection-steady-v3/initial-callback.test.ts (eight validator adverse cases+two timeout/cancel/Window-receiver tests), plus copied numeric/warmpure regression tests if parent grants.
- node --input-type=module -e "import {verifyOriginalSteadyFailure} from './Docs/Evidence/068-vehicle-switch/verify-steady-original-failure-v3.mjs';console.log(await verifyOriginalSteadyFailure())" (read-only no world).
- ONE build later: node tests/browser/vehicle-selection-steady-v3/server.mjs 5216 then archive-browser-steady-v3.mjs before capture, strict verify-browser-steady-v3-build.mjs CURRENT. Existing server builder starts listening; parent owns scheduling/launch.
- Both actual full captures then verify-browser-steady-v3.mjs CURRENT; user physical foreground requirement remains separate, no readiness inferred from artifacts.

Primary scheduling contract: HTML animation frame callback algorithm supplies same now to callbacks in a run; it does not promise per-callback strict timestamps. https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#run-the-animation-frame-callbacks . Actual V2 repeatedstamp is observed, browser scheduling cause unknown. This protocol narrows allowance to proven zero-debt entry; later zero dt may drain retained debt in generic fixed-tick and is never assumed native0.

## Peer SOURCE repair (unexecuted)

Window scheduling ports now use explicit target.requestAnimationFrame/cancelAnimationFrame/setTimeout/clearTimeout closures through windowRafPorts(window), never raw Window functions invoked with a ports object receiver. Pure injected strict-receiver test covers success clear and timeout cancel.

Every measured await retains latestMeasuredCallback immediately after actual request/returned stamp/callback read/counters, BEFORE surface/focus, asynchronous failure, endpoint and positive-gap250ms guards. One bounded overwrite-only row includes exact gap; invalid row stays outside acceptedpositive-frame quantiles/raw counter admission. Existing rejectedCallback additionallylabels nonpositive stamp; positivegap250+ or endpoint failures retain their actual latest point together with original cause. No inferred deliverycause. This percallback snapshot/read overhead exists in OFF/ON inside original measured windows; optional object RAM unknown, bounded retention1 row. Existing clock origin/30/120/.98/250/max4/raw/failure gates unchanged.
