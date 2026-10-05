# Verificare PBI016

Data: 2026-10-05, Europe/Bucharest. Buildul, commitul și SHA256 pentru surse/bundle sunt în build-manifest.json. Node 24.21.0 / Babylon 9.29.0, Windows; browser T3 Code Nightly 0.0.46 / Chromium 152 / Electron 44.4.2. WebGL2 a raportat AMD Radeon RX 7900 XTX prin ANGLE/D3D11; WebGPU a raportat amd rdna-3. Alimentarea, versiunea exactă a driverului, timerul GPU și memoria GPU exactă sunt indisponibile.

## Browser și cost suplimentar

Înaintea schimbării au fost executate `lightingBaseline('WEBGL2')` și `lightingBaseline('WEBGPU')` în Vite dev, localhost:5173. Proba existentă 013-empty-v1 are canvas intern 640×360, DPR 1 și zero mesh/material/textură; cinci repetări. Mediana CPU render p95: GL 0,2 ms / GPU 0,3 ms. baseline-webgl2.json și baseline-webgpu.json sunt păstrate fără înlocuire.

Probele finale au folosit buildul de producție izolat, http://127.0.0.1:5176/tests/browser/lighting/, în tab propriu tab_a. Modificările concurente ale altor PBI-uri reîncărcau pagina dev în timpul probei, motiv pentru folosirea buildului fără HMR. Codul baseline 013 a rămas identic. Aceeași probă goală a fost repetată în buildul final: CPU p95 median GL 0,2 / GPU 0,2 ms. Dev → production este o diferență declarată de mediu; comparația nu închide un gate de regresie hardware.

`lightingProbe(backend,preset)` a randat scena reală 016-road-signals-v1: 21 mesh-uri, 7 materiale, 2 lumini; LOW fără texturi/umbre, MEDIUM cu o hartă de umbre 1024² și doi casters. CSS și canvas intern: 640×360, DPR fizic 1, scale 1, preset fix, adaptive false. Cele patru capturi au fost păstrate și inspectate. Marcajele centrale și crosswalk sunt deschise pe asfalt închis; lămpile roșu/amber/verde sunt vizual distincte pe ambele backenduri și preseturi. WebGPU a fost efectiv WEBGPU, fără fallback.

| Backend | Preset | CPU render p95 median | Diferență față de baseline final în același build |
| --- | --- | --- | --- |
| WebGL2 | LOW | 0,5 ms | +0,3 ms |
| WebGL2 | MEDIUM | 0,6 ms | +0,4 ms |
| WebGPU | LOW | 0,8 ms | +0,6 ms |
| WebGPU | MEDIUM | 1,1 ms | +0,9 ms |

Costul nou include scena de calibrare completă: lumini, materiale, mesh-uri și umbre. Sunt cinci repetări, fiecare cu 30 frames de warmup și 120 frames măsurate, timer de 5 ms și buffere plafonate. Percentilele CPU și intervalele de timer nu sunt FPS hardware. Prima randare este raportată separat după whenReadyAsync; nu reprezintă durata cold-start sau compilarea shaderelor. Bugete propuse înainte de 203: main-thread p95 ≤10 ms, interval de cadru p95 ≤18,5 ms pe desktop. Proba compactă este sub pragul CPU, dar nu acoperă steady-state de 120 s, jocul complet sau gate-urile 203/218–224. Adaptarea este oprită în probele comparate.

După MEDIUM/WebGPU, `daylight.resize({width:640,height:360,dpr:2})` a raportat DPR efectiv 1,5 și dimensiuni interne reale 960×540. Contoarele înainte/după au rămas lights 2 / materials 7 / shadowMaps 1 / retainedCasters 2. Inputul DPR 2 este sintetic și explicit; DPR fizic a rămas 1.

build-manifest.json leagă sursele finale de bundle-ul măsurat. Outputul temporar .pbi-validation-016/dist este ignored. Capturile sunt webgl2-low.png, webgl2-medium.png, webgpu-low.png și webgpu-medium.png; JSON-urile păstrează fiecare repetare. Încercările inițiale dev au întâlnit HMR reload, OptimizeDep 504 și timeout de tab. Rezultatele și capturile finale provin din buildul stabil.

## Software și board

`node --import ./scripts/register-typescript.mjs --test tests/rendering/lighting.test.ts`: 6/6 PASS. Sunt acoperite DPR/scale și valori invalide, histerezis/cooldown/manual, GPU necunoscut/CPU-bound, portul automat care schimbă efectiv presetul și resursele, 20 de schimbări LOW/MEDIUM fără acumulare, identitatea materialelor, limitele 96/48 cu refill determinist, mesh/scene foreign sau disposed, resize și disposal idempotent cu contoare zero.

`npm run check` a trecut integral cu 185 de teste înaintea adăugării ultimului test integrat. Verificarea finală a trecut typecheck și lint, apoi s-a oprit la format:check pentru trei fișiere PBI019 aflate în lucru; detalii în project-check.txt. Toate fișierele PBI016 trec verificarea Prettier separată. `npm test` final: 186 PASS, în project-tests.txt. `npm run build` și buildul izolat al fixture-ului au trecut, cu avertismentul existent privind chunkurile Babylon >500 kB. Validatorul final este în board-validation.json.

Fixture-ul nu conține încă fizică. Paritatea rezultă din portul exclusiv de randare, fără autoritate/import runtime asupra simulării, păstrarea datelor și lipsa modificărilor de dt/populație/rewards. Gameplayul complet și enforcement-ul asseturilor 223 nu sunt declarate verificate.
