# Verificarea PBI 223 — 5 octombrie 2026

Admiterea asseturilor, batchurile locale/LOD, maparea atomică de picking și limitele exclusiv vizuale sunt implementate. Capurile `223-initial-1` sunt finite și provizorii în contextul `203-initial-1`, în `resourceAdmissionContracts.rendering` din manifest. Rezultatul validează fixture-ul timpuriu, fără a calibra jocul complet sau laptopul.

## Protocol și proveniență

Build Vite de producție, Babylon 9.29.0, Chrome 154 real headed, inspector închis, foreground și focus verificate la fiecare cadru, fără înlocuirea RAF/visibility/focus. Desktopul este Ryzen 9 7950X3D, RX 7900 XTX, Windows 11 Pro, aproximativ 48 GB RAM, driver 32.0.31041.1004, display 3840×2160/144 Hz, Balanced. [Confirmarea hardware de la final](hardware-end.json) păstrează separat momentul capturii; nu este telemetrie termică sau de alimentare continuă. WebGL2 identifică efectiv RX 7900 XTX prin ANGLE/D3D11; WebGPU raportează AMD/RDNA3.

Comparația folosește 1024 obiecte statice și 70 proiecții de vehicule, aceeași geometrie și cameră, MEDIUM fix, 1920×1080 CSS și intern, DPR efectiv 1. Cinci perechi alternează `global-normal` (mecanismele existente 015/016/018) și `local-thin`: 30 s warmup + minimum 120 s măsurate per braț. `local-normal` și `global-thin` au separat câte cinci probe auxiliare de 1 s + 3 s. Smoke-urile sunt etichetate și nu înlocuiesc aceste măsurători.

Rapoartele brute [WebGPU](webgpu.json) și [WebGL2](webgl2.json) identifică HEAD `ca41dae7bdb83a7b6c48d59b428445256cc63ef9`, sursa completă a inputurilor `3497fec074453395202b94fa863268875f80d596c4e8751972ce23819db3467f` și [manifestul buildului măsurat](measured-build-manifest.json), artifact hash `fba02c65f4c21cd5975f4a5c03b67cc548cbbf2f8ab3eca7da7c9ec46ffccb38`. WebGPU a terminat la 09:33:38 UTC; WebGL2 a urmat în același Chrome/hardware exclusiv. Bundle-ul critic conservator include toate chunkurile JS/WASM emise: 6.005.394 bytes, sub 8 MiB.

## Rezultate

[Rezumatul verificat](summary.json) păstrează toate repetările, medianele și confirmările de regresie.

| Metrică | WebGPU baseline → local-thin | WebGL2 baseline → local-thin | Gate |
| --- | --- | --- | --- |
| Frame p95 | 7 → 7 ms | 7 → 7 ms | ≤18,5 ms |
| Frame p99, mediană | 7,1 → 7,1 ms | 7,1 → 7,1 ms | ≤25 ms |
| Lucru CPU p95, mediană | 0,9 → 1 ms | 0,8 → 0,8 ms | ≤10 ms |
| Draw calls maxim | 4 → 19 | 4 → 19 | ≤128 |
| Contoare obiecte Babylon | 95 → 140 | 95 → 140 | ≤4096 |
| Buffere matrici deținute | 65.536 → 140.032 bytes | 65.536 → 140.032 bytes | ≤2 MiB |
| Long Tasks în steady-state | 0 | 0 | Nicio blocare >50 ms |
| Cold registry, mediană | 5,2 ms | 6,3 ms | Decode și shader separat ≤2000 ms |
| Warm registry, mediană | 0,9 ms | 0,8 ms | Container reutilizat |
| Prima utilizare CPU maximă | 11,8 ms | 11,3 ms | ≤50 ms |

Niciun braț optimizat nu depășește pragurile absolute. Nu există confirmări de regresie CPU/frame >10% și >1 ms în trei din cinci perechi, nici pentru bufferele urmărite >10% și >5 MiB. Costul suplimentar al hosturilor/materialelor/geometriei locale este raportat explicit: draw calls și numărul obiectelor cresc în această scenă. Nu pretindem un câștig universal al thin instances sau memorie GPU totală din aceste contoare.

Pe fiecare backend: picking apropiat, după mișcare, după reorder/removal și la schimbarea LOD; semafor mutabil; LOW la 960×540 intern și restaurare MEDIUM la 1920×1080; 20 cicluri dispose cu resurse revenite exact la baseline. Adaptarea are separat input GPU-bound sintetic etichetat, ferestre/histerezis/cooldown și control readonly nemodificat. Manifestul supra-buget este diagnosticat; un GLB cu geometrie peste declarație este respins înaintea decodării (`decodeLoads=0`). [Consola completă după remediere](full-console.txt) nu conține erori sau warnings GPU.

Capturi inspectate vizual, realizate numai în warmup: [WebGPU baseline](webgpu-baseline.png), [WebGPU local](webgpu-local.png), [WebGL2 baseline](webgl2-baseline.png), [WebGL2 local](webgl2-local.png). Geometria/camera și cele 70 de proiecții corespund pe ambele backenduri.

## Remedieri și corecția metadatelor

Smoke-ul inițial a detectat erori GPU la 14→13→14 instanțe: clonele Babylon partajau Geometry, iar hosturile suprascriau atributele de matrici ale vecinilor/LOD. Fiecare host primește acum Geometry proprie și invalidează draw cache la înlocuirea bufferului; uploadul exclusiv pentru mișcare reutilizează bufferul. Testul și smoke-urile curate au precedat toate probele complete. Raportul și [logul inițial](webgpu-before-cache-fix.txt) sunt păstrate și nu sunt gate-uri trecute.

Exporterul citea CSS de pe canvasul inițial, detașat de `freshCanvas`; câmpul brut al probelor complete este `[0,0]`. Aceste rapoarte **nu au fost editate**. Corecția citește `backend.canvas`, în obiectul serializat după toate buclele măsurate și cleanup. Descrierea bundle-ului a fost clarificată pentru chunkurile lazy Babylon. [Dovada corecției](metadata-correction.json) reconstruiește SHA256-ul întregului set măsurat prin inversarea exact a acestor două schimbări; rendererul, workload-ul temporizat, CSS-ul, camera, rezoluția, loaderul și capurile rămân identice. [HTML-ul original verificat prin hash](measured-index.html), cele patru capturi și smoke-urile corectate pe ambele backenduri confirmă CSS 1920×1080. Sursa metadatelor corectate este `007db44751f0ab1d32201934210f9f2b82e53da65e2c9f03157d6adc41e2e533`; probele scurte nu sunt prezentate drept repetarea celor 50 de minute. [Consola smoke finală](metadata-smoke-console.txt) are numai favicon404, fără erori GPU.

## Comenzi și limite

```powershell
node --import ./scripts/register-typescript.mjs --test tests/rendering/render-asset-budgets.test.ts
npm run typecheck
node scripts/render-asset-budgets-server.mjs 5195
# Chrome real: runRenderBudgetProbe('WEBGPU', false), apoi ('WEBGL2', false)
node scripts/verify-render-asset-evidence.mjs
node scripts/summarize-render-asset-budgets.mjs
```

Cele cinci teste relevante acoperă bugete cumulate, limite de capacitate, geometrie/texturi separate, ownership, LOD conservator pentru scale/shear, remap, admitere atomică și 20 cicluri de cleanup. Typecheck, ESLint și Prettier pentru fișierele afectate trec. Validarea fizică a boardului este consemnată în PBI după mutarea în Done.

GLB-ul original CC0 folosește Blob URL: cold înseamnă registry gol, nu cache HTTP/OS/driver purjat. Rețeaua 25 Mbit/s/RTT40 ms nu este simulată. GPU timing/memorie exactă, heap total și workspace nativ sunt indisponibile; WASM-ul decoderelor de extensie este 0 pe calea core GLB, iar compiler-ele backendului intră în transferul critic JS/WASM. Bufferele de matrici urmărite nu includ toate alocările interne Babylon. Fixture-ul nu reprezintă fizica, learning-ul, KPI/XP sau orașul cu asseturi finale; lipsa unui port de autoritate și controalele readonly verifică izolarea prezentării, nu un playtest viitor. Gate-urile 145/146/150/220/224 și laptopul rămân de executat în scope-urile lor.
