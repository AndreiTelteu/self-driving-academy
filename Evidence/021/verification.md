# Verificarea021 — Rapier raycast prototype

Proba desktop completă este capturată la2026-10-05T07:44:41.740Z după aproximativ25minute: cinci perechi collector218 oprit/pornit,30.000,5–30.000,7ms warmup și120.002,4–120.002,8ms măsurare/braț. Chrome154 headed, focus real și visibility valide; Babylon9.29.0 WebGPU pe adaptor amd/rdna-3. Identificarea CIM arată Ryzen9 7950X3D, RX7900XTX driver32.0.31041.1004, Windows11Pro26200,50.337.325.056bytes RAM, Balanced, display3840×2160/144Hz; canvasCSS/internal1920×1080,DPR1. Este desktopul high-end disponibil, nu reprezentarea unui desktop mediu generic.

Identitatea buildului: commit01b595a96d777064e82461e558f2f6473684e4fb, sourceHashacc393f4dfefd6752f179deea75a7a6cab3e9a60a6cba65de2ddf365a1e1b5ec pentru sursele necomise, artifactHash4ec244a3575d66312fab197e28d3a30e25c7b5578255aeb27094fc36bb27f132. Verifierul a citit bytes reali ai165artefacte și sursele actuale, nu doar un manifest declarat. Raportul brut păstrează identitatea originală. Contractele de admitere adăugate ulterior în manifest sunt reconciliate prin copia exactă `performance-budgets-at-capture.json`; aceasta substituie numai inputul Docs/performance-budgets.json la verificarea hashului istoric, cu diferența raportată explicit. Codul măsurat trebuie să rămână byte-identic. Pragurile/protocolul203 folosite în probă nu au fost schimbate retroactiv.

| Metrică — mediana p95 a celor cinci brațe active | Rezultat | Buget desktop provizoriu |
| --- | ---: | ---: |
| Rapier world.step |1,80ms|3ms|
| Controller și comenzi |0,40ms|inclus în tick|
|70query-uri explicite|0,20ms|inclus în tick|
| Readback bridge reprezentativ |0,10ms|inclus în tick|
| Tick probe complet |2,20ms|5,5ms|
| Fir principal incluzând proiecții/Babylon |3,40ms|10ms|
| Interval frame p95/p99 |7,00/7,10ms|18,5/25ms|

Fiecare braț păstrează70vehicule,64debris dinamice,3bariere statice și sol:134corpuri,138collidere. Au fost măsurate783–860contacte solver și7.200tick-uri/braț, fără overflow și fără suprasarcină. Raportul timp simulat/RAF este≈1 și trece0,98; Long Tasks suportat fără evenimente steady-state. Numărul1610bridge calls/tick este eșantionul12setters+11getters/car, nu toate API crossings; bridgeReadback măsoară numai11getters/car. GPU timer și memoria exactă WASM/page rămân unavailable, nu0.

Baseline-ul218 anterior este copiat byte-identic în `pre-physics-218-baseline.json`; kernel gol și engine gol: main-thread p95median0,20ms. Costul suplimentar al întregului fixture021 este≈3,20ms, incluzând fizică/proiecții/meshuri/observatori. Costurile fizice separate din tabel identifică doar partea nouă Rapier. Aceasta nu este o comparație „aceeași fizică înainte/după” când înainte nu exista fizică. Deltas collector on-off pentru cele cinci perechi sunt+0,40/-0,10/-0,20/≈0/0ms; valori negative și rezoluția ceasului nu dovedesc cost gratuit sau accelerare cauzală. Baseline-ul203 rămâne păstrat.

Calibrarea `calibration.json` include curbe de frânare10/20/30m/s, viraj8/20m/s la două grip-uri, bordură, contact auto-auto și wall CCD45m/s. Frânare grip1,3/brake8:6,09/24,24/54,00m;20m/s brake4:47,48m; grip0,6:26,47m. Proba auto-auto produce4contacte și împinge ținta; CCD oprește șasiul înaintea wall-ului subțire. Bordura produce excursia suspensiei/șasiului chiar fără solver contact al cuboidului. Curbele de viraj păstrează comportamentul observat fără a inventa slip angle fizic sau o relație monotonă grip-viteză laterală.

Note browser din10:13–10:17+03: init manual vizibil cu box șasiu, patru wheel rays pe sol, suspensie≈0,29m; frânare20m/s se stabilizează la≈24,22m; viraj20m/s reduce viteza și schimbă poziția/orientarea; bordura și auto-auto folosesc aceeași lume/controller. Au fost trimise inputuri reale Playwright către selector/reset și tastatură. Sunt observații de agent, nu aprobarea subiectivă a utilizatorului. Camera fixture-ului este fixă: capturile întârziate pot avea mașina în afara cadrului și nu demonstrează vizual momentul impactului. Capturile și HUD-ul asociat sunt păstrate în `browser/`; curbele/testele numerice sunt dovada contactelor/excursiei. Prototype UI nu este camera finală de driving.

La 11:57–11:58+03 proba vizuală a fost reluată pe artefactele de producție înghețate, fără rebuild sau modificarea surselor. Capturile `*-live.png` au fost făcute imediat după reset și inspectate: mașina este vizibilă în toate cele patru scenarii. Manual a primit ArrowUp timp de 1s. Virajul are 19,27m/s, z=15,16m și suspensie stânga/dreapta 0,28/0,30m; bordura are 9,82m/s, z=11,89m, suspensie față/spate 0,29/0,31m după traversare; contactul auto reduce viteza la 4,77m/s, z=8,90m, cu două șasiuri vizibil în contact. Camera și reprezentările box rămân cele ale prototipului. Această probă scurtă este dovadă vizuală, nu un benchmark FPS nou. Browserul și serverul temporar au fost închise după captură.

Comenzi executate:

- `node --import ./scripts/register-typescript.mjs scripts/calibrate-physics.mjs` — PASS, curbe reale salvate.
- `node --import ./scripts/register-typescript.mjs --test tests/vehicles/physics.test.ts` —6/6PASS, reluat la11:55+03; braking/grip, curb/contact/CCD, steering, aceeași proiecție după300ticks la30/60/144FPS, many contacts și admitere.
- `npm run typecheck` — PASS după finalizarea fișierelor paralele.
- `npm run check:architecture` — PASS,88fișiere, cele3probe negative Rapier și probele existente.
- ESLint și Prettier pe fișierele021 — PASS.
- `./scripts/Run-PhysicsProbe.ps1 -Port 5191` — production build PASS; Chrome smoke10brațe PASS (etichetat SMOKE), apoi full desktop10brațe exportat.
- `node scripts/verify-physics-evidence.mjs` — PASS protocol/caps/bugete prototip, source hash și bytes165artefacte; sumar separat `summary.json`.

Limitări: model raycast simplificat, un singur sedan configurabil, fără anvelope pneumatice/ABS/transmisie completă/AI/learning/gameplay. Inițializarea raportată este fresh world într-un modul deja warm, fără cache OS/driver/rețea cold controlate. Memoria exactă și GPU timer nu sunt măsurate. Caps de ownership și WASM32MiB sunt provizorii și estimative. Proba nu validează laptop, jocul complet, gate220/224/155 sau release; câmpul gameplayGate rămâneNOT_VALIDATED.

Verificarea finală a boardului: Validate-Board.ps1 -RequireDone '021' a trecut la 12:00+03, cu taskul existent numai în PBI/Done/021-physics_probe.md. Rezultatul read-only este păstrat în board-validation.json. Root a raportat și check-ul global PASS: 306 teste, typecheck, lint, format și architecture; Validate-Plan PASS, 1022 linkuri.

