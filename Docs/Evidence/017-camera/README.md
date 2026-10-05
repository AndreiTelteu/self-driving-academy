# PBI017 verificări și blocaj de host

Implementarea și probele camerei sunt pregătite; PBI017 rămâne In Progress deoarece captura reală a mouse-ului nu poate fi validată în hostul T3. Nu este declarat Done și completed_at rămâne null.

## Build și hardware

5 octombrie 2026; baseline înainte de implementare pe HEAD ca999ee și working tree taskuri paralele; buildul fixture-ului017 este versiunea locală necomisă. Windows 11 Pro 10.0.26200, AMD Ryzen 9 7950X3D, RAM50337325056 bytes, AMD Radeon RX7900XTX driver32.0.31041.1004. Browserul exact/GPU/backendul efectiv sunt păstrate în JSON. Alimentarea/refresh rate nu au fost colectate; inspectorul este închis. Canvas640×360/DPR1; presetul este fixture de cameră, fără preset gameplay.

`baseline-webgl2.json` și `baseline-webgpu.json` sunt probe reale executate înainte de implementare pe fixture-ul bootstrap013. `webgl2.json` și `webgpu.json` folosesc buildul de producție înghețat prin `npx vite build --config tests/browser/vehicle-camera/vite.config.mjs`, preview5177, tab_b. Buildul propriu evită reload-urile HMR și cache-ul shaderelor invalidat de lucrul concurent. O primă probă dev a întâmpinat504 shader și un prag de test greșit pentru grosimea peretelui; a fost corectată și rezultatul dev a fost înlocuit de probele de producție. Screenshoturile finale arată meshuri efectiv randate, nu o scenă goală.

## Performanță provizorie

Metoda existentă bootstrap: cinci repetări, fiecare30 iterații warmup și120 măsurate, pacing timer5ms. Nu este protocolul gameplay120sec și nu validează FPS/GPU/headless. Baseline inițial p95CPU median GL~0,1ms/GPU~0,3ms; bootstrap repetat în buildul fixture GL~0,2ms/GPU~0,3ms. Același decor și cameră, fără/ cu update017: GL~0,3→0,4ms, GPU~0,4→0,5ms. Costul camerei cu3 obstacole este aproximativ+0,1ms p95, la rezoluția timerului de~0,1ms. Costul total față de bootstrap include cele11meshuri și este raportat separat; nu se atribuie întregul delta controllerului.

Contoarele before/after sunt identice:11meshuri,11geometrii,2noduri,6materiale incluzând implicitul Babylon,0texturi. Camera deține o singură cameră suplimentară și un map bounded de shelluri ale unei singure ținte; nu reține snapshoturi sau istoric. Inputul are7listeners deținuți. GPU time/memorie exactă/FPS sunt null. Pragurile Docs25 sunt provizorii; micul fixture este sub p95CPU10ms desktop, fără a valida gameplayul de70vehicule. Broad-phase al obstacolelor orașului și hardware-gate203/218 rămân scope viitor.

## Verificări trecute

-6/6 teste Node: selecție fără scrieri în autoritate, damping dependent de timp, zero-motion, distanță/viteză/frână, eye calibrat cu yaw/roll, look/recenter, reutilizare ID, thin-wall sweep și start penetration, date invalide/null safe.
-`npm run check` PASS185: typecheck/lint/format/architecture64fișiere+6probe negative și toate testele. `npm run build` PASS, avertismentul existent chunk>500kB. Validate-Plan PASS.
-Babylon WebGL2 și WebGPU reale: wall clearance0,2m; eye(-0,35,1,15,0,2) în cabină, minZ0,05; shell ascuns/cabina păstrată; viraj și pose de impact; depenetrare; schimbare de țintă și restaurarea vizibilității; snapshoturile înghețate rămân identice.
-T3 taste/clickuri reale: C comută CHASE→FIRST_PERSON și settingsMode reflectă schimbarea; slider FOV cu End ajunge100°; motion cu Home ajunge0; butoanele Turn/Brake/Impact/Select actualizează camera și proiecția vizuală. `interactive-webgl2.json` păstrează starea după select; nu reprezintă comenzi ale fizicii de gameplay.
-Dispose real urmat de eveniment keyboard sintetic pentru verificarea listenerilor: controllerul nu se mai comută și camera Babylon este disposed, în `disposal.json`. Testul de cleanup sintetic nu înlocuiește verificarea capturii reale.

## Limitarea inițială a hostului T3

Pe pagina proaspătă a buildului frozen, exact un click T3 pe butonul Capture a fost trusted. La `requestPointerLock`: canvas.isConnected=true, ownerDocument===document=true, document.hasFocus=true și visibility=visible. Browserul a respins totuși cu `WrongDocumentError: The root document of this element is not valid for pointer lock.` Diagnosticul complet este în `pointerlock-host-error-webgl2.json`; WebGPU reproduce aceeași eroare în `pointerlock-host-error-webgpu.json`. Nu există captură automată sau fallback fictiv. Escape a fost apăsat real, dar nu poate demonstra eliberarea unei capturi care nu a fost acordată. La acel moment, mouse look sub pointer lock și release Escape rămâneau nevalidate; proba Chrome de mai jos închide verificarea.

Blocajul hostului a fost rezolvat pentru verificare prin autorizarea explicită a utilizatorului de a folosi Chrome.


## Verificare finală în Chrome autorizat

2026-10-05: Chrome 154, headed, Playwright CLI, același build de producție fix la portul 5177. Două pagini proaspete cu backend explicit WebGL2 și WebGPU au trecut: C comută în FIRST_PERSON, click Capture trusted cu canvas conectat/focus acordă pointer lock, două mișcări reale Playwright schimbă yaw/pitch, Escape eliberează captura, click Recenter readuce ambele unghiuri la zero. Proiecția autoritară a vehiculului este identică înainte și după privire. Nu s-au injectat evenimente de mouse/keyboard sintetice pentru aceste criterii.

Stările complete, browserul și rapoartele backendului sunt în [Chrome WebGL2](chrome-webgl2.json) și [Chrome WebGPU](chrome-webgpu.json); capturile [WebGL2](chrome-webgl2.png) și [WebGPU](chrome-webgpu.png) au fost inspectate. Aserțiunile separate asupra JSON-urilor au trecut pentru lock/look/release/recenter/autoritate pe ambele backenduri. O eroare favicon404 în WebGL2 nu afectează proba; WebGPU nu a avut eroare de captură. Browserul de test a fost închis după probă.

Limitarea T3 este păstrată ca observație a hostului, nu ca funcționalitate lipsă a implementării. Aceste probe sunt funcționale; nu recalibrează bugetele hardware.

Verificarea finală a indexului exact pregătit pentru commit (checkout izolat): `npm run check` PASS 186/186, `npm run build` PASS; `Validate-Board -RequireDone '017'` și `Validate-Plan` PASS. Loguri: [check](staged-check.txt), [build](staged-build.txt). Avertismentul Vite despre chunkuri mari rămâne informativ.
