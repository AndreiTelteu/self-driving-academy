# Calitate vizuală V4

Versiune 0.1 · 16 noiembrie 2026. Parte din [planul complet](README.md).

## Decizia utilizatorului

La 16 noiembrie 2026 utilizatorul a jucat compunerea V3 și a cerut explicit ca jocul să arate mai realist, mai curat, clar și în HD, cu shadere, lumină și umbre reale. Aspectul actual a fost considerat inacceptabil. Decizia schimbă direcția din [Babylon.js](03-babylon-engine.md) („materiale simple sau PBR moderat”) și din [Asseturi](16-asseturi-vizual-si-audio.md) („forme și texturi stilizate”). Noua țintă este **realism stilizat curat**: proporții reale, materiale PBR, lumină fizică, umbre, atmosferă și imagine HD. Orașul rămâne original, american și lizibil. Fotorealismul complet nu este o cerință; o imagine plată, fără umbre, de tip machetă, nu mai este acceptată.

Simularea, fizica, learning-ul, KPI/XP și contractele de autoritate nu se schimbă. V4 schimbă doar prezentarea, cu o excepție declarată în 242: limita hărții pentru mașina condusă.

## Auditul vizual de pornire

Capturile din [auditul din 16 noiembrie 2026](Evidence/visual-audit-2026-11-16/README.md) provin de pe build-ul `vite preview` cu WebGPU (renderer `rdna-2`), jucat cu taste reale. Problemele observate, cu cauza găsită în cod:

| # | Problemă vizibilă | Cauză în cod | PBI |
| --- | --- | --- | --- |
| 1 | Jocul este o fereastră mică de 640×360 în pagină, pixelată | `canvas { width: min(100%, 40rem); height: 20rem }` în `src/style.css`; viewportul transmis din `src/main.ts` este dimensiunea CSS | 240 |
| 2 | Margini zimțate peste tot | `antialias: false` pentru WebGPU și WebGL2 în `backend.ts`; nu există FXAA/MSAA în pipeline | 241 |
| 3 | Trotuarul este alb ars, iar culorile sunt plate | tone mappingul ACES este pus numai pe materialele `daylight-*`; materialele orașului, decorului, vehiculelor și personajului nu au image processing; lumina hemisferică 0,75 plus soarele 1,1 saturează albedo-ul 0,62 | 241 |
| 4 | Nicio umbră în joc | `daylight.addShadowCaster` nu este apelat nicăieri în compunere; contractul 157 exclude clădirile și decorul din shadow map | 244 |
| 5 | Dungă albastru-deschis pe carosabil, de culoarea cerului | gol în geometria suprafeței de drum, prin care se vede `clearColor` | 242 |
| 6 | Mașina iese de pe hartă într-un vid albastru | terenul există doar sub oraș; nu există limită fizică sau fundal după margine | 242 |
| 7 | Cer uniform, orizont tăiat drept, fără adâncime | `clearColor` fix, fără skybox, ceață sau perspectivă atmosferică | 243 |
| 8 | Asfalt, iarbă și trotuar dintr-o singură culoare | `StandardMaterial` cu `diffuseColor`, fără texturi, fără variație, specular negru | 245 |
| 9 | Marcajele strălucesc ca neonul | marcajele folosesc `disableLighting` și culoare emisivă | 245 |
| 10 | Clădiri ca niște cutii maro fără ferestre | geometria 042 este o extrudare simplă cu un singur material `building` | 246 |
| 11 | Taxiul este bleumarin închis, greu de citit pe asfalt, cu stopuri ca dreptunghiuri roșii | paleta din culori de vârf, material alb fără specular, fără sticlă, jante sau reflexii | 247 |
| 12 | Personajul arată ca din cuburi | personaj procedural din cutii, materiale plate | 248 |
| 13 | Copaci din conuri și decor din cutii | decorul 146 folosește cutii, cilindri și conuri cu 8 segmente | 249 |
| 14 | Perspectivă deformată, unghi larg, cameră prea joasă | FOV inițial 1,4 rad (~80°); orbitarea verticală nu răspunde | 250 |
| 15 | Titlu HTML uriaș deasupra jocului, butoane gri implicite, panou text de debug | layoutul bootstrap din `index.html`/`style.css`; HUD-ul 236 este minimal | 251 |

## Principii

- **Bugetele se respectă pe preset.** Fiecare efect are o valoare pentru LOW, MEDIUM și HIGH în `quality-policy`. Pentru LOW, ținta rămâne bugetul 224 pe hardware-ul de referință. Un efect fără variantă LOW este dezactivat pe LOW, iar jocul rămâne lizibil.
- **Prezentarea nu scrie în simulare.** Shaderele, LOD-ul și post-procesarea citesc numai snapshoturi. Calitatea nu schimbă colliderele.
- **Asseturile sunt originale.** Geometria și texturile sunt procedurale sau create pentru proiect, cu sursa și licența în inventarul 150. Nu se copiază un joc existent.
- **Fiecare PBI are o dovadă înainte/după.** Harnessul de capturi 239 produce aceleași cadre, cu aceeași cameră și seed, înainte și după schimbare. Comparația este inclusă în dovezi.
- **WebGPU și WebGL2 rămân coerente.** Tone mappingul și spațiul de culoare dau aceeași imagine pe ambele backenduri, conform [WebGPU și performanță](17-webgpu-si-performanta.md).

## Harnessul de capturi (PBI 239)

239 nu rezolvă niciuna dintre problemele 1–15 de mai sus; măsoară starea de pornire ca restul PBI-urilor să poată arăta înainte/după.

- **Mod de captură.** `?capture=1[&preset=LOW|MEDIUM|HIGH][&backend=webgpu|webgl2]` instalează `window.__visualCapture` (`ready()`, `views()`, `go(viewId)`, `info()`). Fără `capture=1` nu se instalează nimic, iar presetul și backendul rămân cele implicite (verificat în browser: `__visualCapture` este `undefined`, canvasul rămâne 640×360). Controllerul nu pașește simularea și nu apasă „Pornește”: aplicația rămâne în READY, deci poziția personajului și a vehiculelor (inclusiv cele cerute de vedere) este fixă. Soarele este cel constant din `daylight.ts`; nu există încă ciclu zi/noapte (252), iar manifestul înregistrează această ipoteză.
- **Vederi ca date.** `src/rendering/visual-capture.ts` conține `CAPTURE_VIEWS`: id, categorie, poziție/țintă/FOV ale camerei și opțional plasarea personajului, a vehiculelor scenariului și a unor mașini suplimentare. Un PBI nou adaugă o intrare; ordinea este ordinea capturii. Cele 13 vederi de pornire: `character-close`, `taxi-front-three-quarter`, `taxi-rear-driving`, `street-eye-level`, `intersection-crosswalk`, `facades-close`, `city-aerial`, `horizon`, `decor-tree-bench`, `decor-lamp-shelter`, `civil-cars`, `map-edge`, `ui-hud`. Până la 240, vederile 3D forțează canvasul pe tot viewportul 1920×1080; `ui-hud` fotografiază pagina reală.
- **Captură.** `npm run visual:capture -- --out <dir> --preset LOW|MEDIUM|HIGH [--backend webgpu|webgl2|auto] [--port n] [--views id,id] [--headed] [--software]`. Construiește aplicația într-un director temporar, pornește `vite preview` pe un port liber (sau `--port`), lansează Chromium la 1920×1080 cu DPR 1 și scrie `<id>.png` și `manifest.json` (commit, `sourceDirty`, backend cerut/obținut, renderer, adaptor WebGPU, marcaj `software`, preset, viewport, versiunea browserului, flagurile, seed, ora fixă, erorile din consolă și timpii per vedere). Serverul, browserul și directorul temporar sunt eliberate și la eroare sau SIGINT. Dacă backendul cerut nu este cel obținut, scriptul eșuează (cu `--allow-backend-fallback` îl înregistrează). Dacă rendererul este software (SwiftShader), manifestul spune asta; timpii nu sunt atunci hardware.
- **Playwright.** Fără dependențe noi: `PLAYWRIGHT_MODULE`, apoi modulul `playwright`, apoi cea mai nouă instalare din cache-ul `npx`. Se folosește `channel: 'chromium'` (noul headless) cu `--enable-unsafe-webgpu --ignore-gpu-blocklist --enable-gpu`; pe această mașină dă WebGPU real (`amd rdna-2`). Chromium headless-shell a eșuat la crearea dispozitivului WebGPU (`dxcompiler.dll`, eroare 87) și a căzut pe WebGL2.
- **Timpi.** `cpuRenderMs` este costul CPU al `scene.render()`; `frameIntervalMs` este intervalul dintre cadre și este plafonat de vsync (≈16,7 ms), deci nu măsoară costul GPU. Nu sunt substitut pentru probele de performanță din 224/253.
- **Comparație.** `npm run visual:compare -- <before> <after> [--out dir] [--tolerance 4] [--max-percent 0.5]` scrie `compare.html` (perechi alăturate, hartă de diferențe, procent per cadru, CPU render) și `compare.json`. Un pixel diferă când cea mai mare diferență pe canal depășește toleranța (4/255). Decodorul PNG folosește doar `node:zlib`.
- **Baseline.** [`Evidence/239-visual-baseline/`](Evidence/239-visual-baseline/): `high-webgpu`, `low-webgpu`, `high-webgl2`, `low-webgl2` (13 PNG fiecare, ≈0,6 MB per set), plus `high-webgpu-repeat` și `compare-high-webgpu-repeat/compare.html`. Aceeași revizie rulată de două ori: 0,000% pixeli diferiți pe toate cele 13 cadre (pragul de zgomot este 0,5%). Observații de pornire: HIGH și LOW sunt identice pixel cu pixel (presetul nu schimbă încă nimic vizibil; umbrele sunt 244), iar WebGPU și WebGL2 diferă sub 0,01% pe 12 cadre și cu 0,878% pe `city-aerial`. Baseline-ul a fost capturat cu codul modului de captură prezent (nu schimbă imaginea) peste commit-ul de la începutul PBI-ului.

## Ordinea de lucru

1. **Fundația imaginii:** 239 (direcție și capturi), 240 (ecran complet HD), 241 (AA, tone mapping și post-procesare).
2. **Lumea:** 242 (găuri și margine), 243 (cer, ceață și IBL), 244 (umbre și AO).
3. **Materiale și modele:** 245 (suprafețe PBR), 246 (clădiri), 247 (vehicule), 248 (personaj), 249 (vegetație și decor).
4. **Prezentarea:** 250 (cameră), 251 (UI și HUD), 252 (ora din zi și iluminatul stradal).
5. **Gate:** 253 compară toate capturile, măsoară bugetele pe toate preseturile și închide V4.

## PBI-uri

| ID | Task |
| --- | --- |
| 239 | Direcția vizuală V4 și harness de capturi înainte/după |
| 240 | Randare pe tot ecranul, la rezoluție HD și DPR real |
| 241 | Antialiasing, tone mapping unitar și post-procesare |
| 242 | Suprafață de drum fără goluri, teren până la orizont și limita hărții |
| 243 | Cer, ceață atmosferică și iluminare din mediu (IBL) |
| 244 | Umbre reale pentru toată scena și ambient occlusion |
| 245 | Materiale PBR pentru asfalt, marcaje, trotuar, borduri și iarbă |
| 246 | Clădiri cu fațade, ferestre, acoperișuri și variație |
| 247 | Vehicule detaliate: caroserie, sticlă, jante, lumini și taxi recognoscibil |
| 248 | Personaj uman credibil: proporții, materiale și animație |
| 249 | Vegetație și mobilier stradal realiste |
| 250 | Încadrarea camerei: FOV, înălțime, orbitare verticală și netezire |
| 251 | Ecran de start, HUD de joc și eliminarea layoutului de debug |
| 252 | Ora din zi, iluminat stradal și faruri |
| 253 | Gate V4: calitate vizuală și performanță pe toate preseturile |
