# 236 — compunerea în browser a lanțului V3

Implementarea PBI 236 transformă contractele V3 191–198 într-o singură compunere care rulează în
browser: personajul se mișcă din taste reale, camera third person urmărește aceeași entitate, clipul
se alege din viteza măsurată, intrarea și ieșirea din taxi trec prin autoritatea unică, iar HUD-ul
arată entitatea controlată și modul. Până la acest PBI, `src/main.ts` nu avea nicio referință la
`character`, `authority` sau `walker`.

## Ce s-a implementat

### Ordinea unui tick (singurul punct de adevăr)

`src/app/walking-composition.ts` (`236-v3-composition-v1`) cheamă, în această ordine, exact
contractele livrate:

1. intenția reală intră prin portul 193 (`KeyboardDrivePort` din 066, cu filtrul de focus, câmpuri
   de text și dialoguri);
2. tranziția cerută explicit — 195 `decideVehicleEntry` sau 196 `decideVehicleExit`;
3. 193 `arbiter.step` → `arbiter.deliver` către **exact un** consumator;
4. consumatorul: `walker.step` (192) pentru personaj sau adaptorul de conducere pentru mașină;
5. 194 `camera.step` cu `authorityEntityId`-ul tick-ului;
6. 198 `segments.step` (WALK pe jos, ENTER/EXIT la tranziție, FOCUS cât timp ești în mașină);
7. proiecția HUD (entitate, mod, clip, viteză, camera).

Modulul este pur: fără DOM, fără Babylon, fără ceas, fără `Math.random`. Nu rescrie nicio regulă:
tranzițiile sunt exact 195/196, comanda este exact cea produsă de 193, iar poziția personajului
aparține exclusiv walker-ului 192.

### Autoritatea unică la tranziții

- După TAKE, `setAuthority` este chemat înainte de `step`, tastele ținute rămân neutralizate, iar
  walker-ul nu este pașit: poziția și tick-ul lui rămân bit-identice.
- După RETURN, comanda merge exclusiv la personaj, iar mașina eliberată nu mai este pașită: poziția
  și viteza ei rămân înghețate.
- O a doua livrare în același tick este refuzată de arbitraj cu `DOUBLE_DELIVERY_REFUSED`; refuzul
  este dovedit prin `arbiter.deliver` pe ultimul rezultat, nu printr-o regulă a compunerii.
- O a doua cerere de intrare cât timp ești în mașină este ignorată explicit (`ENTRY_IGNORED`).

### Ieșirea fără teleportare și animația care nu scrie poziția

196 furnizează exact `WalkerOptions.start`; compunerea creează un walker nou la acel punct, cu
aceeași entitate. `CharacterRenderFrame` copiază poziția autoritară, iar writer-ul 191 refuză
`writeEntityPositionM` și `writeRootMotionM` cu `AUTHORITY_WRITE_REFUSED` (verificat pe 60/60 de
cadre de render bit-identice).

### Vizual și HUD

- `src/rendering/babylon/character-scene.ts` construiește mesh-urile exclusiv din
  `buildCharacterVisual` (191): 17 articulații, 17 cutii, 4 grupuri de material, 4 draw calls.
- `src/rendering/babylon/v3-composition-scene.ts` compune orașul 042 (`createCityScene`), decorul
  146, mașinile 145, daylight 157 și camera 194. Nu pașește tick-uri și nu decide autoritate.
- `src/ui/character-hud.ts` arată entitatea controlată, modul, clipul (sau „vehicul”), viteza și
  entitatea urmărită de cameră; se actualizează la 10 Hz, imediat la schimbarea entității sau a
  modului.
- `src/main.ts` leagă compunerea de bucla fixă existentă (60 Hz), de butoanele Pornește/Pauză și de
  inputul real. Taste noi, în afara celor șapte 066: `F` = sprint (canalul 193 `sprint`), `G` =
  intrare/ieșire.

### Conducerea

Mașina condusă consumă exact comanda 024 (`source: 'PLAYER'`) și mecanica 023 (masă, forță
tractivă, frână, ampatament, unghi de bracaj). Limita de viteză este cea mai restrictivă valoare
autorată în hartă (11,2 m/s). Fizica completă Rapier 022/024 **nu** este compusă aici; vezi
Limitări.

### Două decizii de compunere, documentate

1. **198 nu are pas DRIVE.** Cât timp jucătorul stă în mașină, modelul este ținut în pas cu tick-ul
   printr-un `FOCUS` pe vehiculul condus — exact comanda 198 care nu schimbă autoritatea și a cărei
   țintă de cameră este mașina. Contorul `focus` este raportat explicit (264 în proba de browser).
2. **Camera nu este ocluzionată de un plafon sub înălțimea ochilor.** Un plafon de mașină aflat sub
   ancora camerei (ochii personajului, 1,645 m) nu poate bloca o cameră ancorată la acea înălțime;
   altfel ieșirea pe flancul de la bordură ar lipi camera de propria mașină. Compunerea mai rotește
   intenția de orbită cu 90° la 0,1 s dacă 194 raportează totuși camera complet blocată sub
   distanța minimă.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | PASS (0 erori, 0 warnings) |
| `npm run format:check` | PASS |
| `npm run check:architecture` | PASS (416 fișiere TypeScript, toate probele negative) |
| `npm run check:parameter-catalog` | PASS (catalog neschimbat) |
| `npm test` | PASS — vezi numerele din raportul final al PBI-ului |
| `npm run build` | PASS |
| `npm run composition:report` | 6 secvențe, **42/42 verificări**, digest `f375524661172633ff68d1186b865f1023317ebb5136a9b1db1b78ca4c2156fb` |
| `npm run composition:report -- --check` | PASS (raportul și markdown-ul sunt actuale) |
| `npm run composition:report -- --browser` | **PASS**, backend **WEBGL2**, 0 erori de pagină, 0 erori de consolă |

Bugetele de performanță nu au fost modificate: `Docs/performance-budgets.json` are SHA-256
`10d78ab5c999215684c821a1f32fd7045392f0f6d8c140c54115d0f73475a21c`, identic cu baza.

### Proba de browser (reală, nu simulată)

- Chromium 159.0.8154.6, headless, `--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader`, 1440×900 CSS, canvas 640×360.
- Backend efectiv: **WEBGL2**, `WebGL 2.0 (OpenGL ES 3.0 Chromium)`, ANGLE
  `Vulkan 1.3.0 (SwiftShader Device (Subzero))`, driver SwiftShader.
- Taste reale trimise de Playwright către document: `W`, `W+F`, `G`, `W`, `S`, `G`, `W`.
- Capturi: `screenshots/01-start.png` … `screenshots/07-revenire.png`.

| Secvență | Taste | Entitate controlată | Mod | Clip | Poziție (x,z) | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| start | — | `CHARACTER:player-character` | MANUAL | idle | 9.80, 3.20 | PASS |
| mers | `W` | `CHARACTER:player-character` | MANUAL | walk | 11.78, 3.20 | PASS |
| alergare | `W+F` | `CHARACTER:player-character` | MANUAL | run | 15.87, 3.20 | PASS |
| intrare în taxi | `G` | `VEHICLE:taxi-01` | MANUAL | — | 9.80, 2.05 | PASS |
| conducere | `W` | `VEHICLE:taxi-01` | MANUAL | — | 19.16, 2.05 | PASS |
| frânare până la oprire | `S` | `VEHICLE:taxi-01` | MANUAL | — | 28.00, 2.05 | PASS |
| ieșire din taxi | `G` | `CHARACTER:player-character` | MANUAL | idle | 28.00, 3.10 | PASS |
| revenire la mers | `W` | `CHARACTER:player-character` | MANUAL | walk | 28.00, 4.37 | PASS |

Camera a raportat `player-character` la mers/alergare/ieșire și `taxi-01` la intrare/conducere, în
același tick cu tranziția. `probeDoubleDelivery()` a întors `DOUBLE_DELIVERY_REFUSED`. Livrările
finale: 375 către personaj, 265 către vehicul, 0 tick-uri fără livrare.

### Cost măsurat în browser

| Metrică | eșantioane | medie ms | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tick de compunere | 600 | 0,60 | 0,50 | **1,10** | 17,90 |
| Prezentare (personaj + mașini + cameră + HUD) | 507 | 0,33 | 0,20 | **1,20** | 8,40 |
| Interval între cadre | 506 | 22,42 | 20,90 | 30,00 | 713,40 |

Tick-ul de compunere este sub bugetul provizoriu de 8 ms/tick din contractul 25. Backendul este
**software** (SwiftShader), deci intervalul de cadru **nu** este o măsurătoare FPS hardware și nu
este comparat cu bugetul de GPU; maximul de 17,9/713,4 ms include încălzirea JIT și un cadru lung de
compilare, nu regimul normal (p95 este metrică).

## Fișiere

Create:
- `src/app/walking-composition.ts` — compunerea pură și proiecția HUD;
- `src/app/composition-world.ts` — așezarea deterministă în orașul real (spawn, taxi, civil);
- `src/rendering/babylon/character-scene.ts` — mesh-urile 191 în Babylon;
- `src/rendering/babylon/v3-composition-scene.ts` — oraș + decor + mașini + cameră;
- `src/rendering/babylon/v3-browser-composition.ts` — rădăcina de browser (input, HUD, cost);
- `src/ui/character-hud.ts` — HUD-ul de personaj;
- `tests/character/walking-composition.test.ts`, `walking-composition-report.test.ts`,
  `walking-composition-suite.ts`;
- `scripts/run-v3-composition-report.mjs`;
- `Docs/Evidence/236-browser-composition/{report.json,report.md,browser.json,screenshots/}`.

Modificate:
- `src/main.ts` (compunerea în aplicația reală, canvas 16:9, diagnostice read-only);
- `src/app/index.ts`, `src/rendering/babylon/index.ts`, `src/ui/index.ts` (exporturi);
- `package.json` (ultimul script: `composition:report`);
- `Docs/20-extensii-si-mers-pe-jos.md` (secțiune nouă la final);
- `Docs/Evidence/216-v1-regression/report.{json,md}` (regenerat de `npm run qa:v1-regression`: boardul are acum 236 noduri, D2 numără 236 muchii și noduri în loc de 235; nicio valoare de comportament nu s-a schimbat);
- `Docs/Evidence/163-v2-contexts/report.{json,md}` (regenerat de `npm run v2:contexts`: citează SHA-256-ul raportului 216, care s-a schimbat odată cu boardul; digestul propriu `cde3c9d34bd3cac453fba2c346cf9c840976e796afa1765af92ba3269270df7e` este cel comis).

Neatinse: `src/character`, `src/simulation`, `src/missions`, `src/learning`, `src/profiles`,
`src/persistence`, `src/world`, `src/vehicles`, `src/autonomy`, `Docs/11`, `Docs/13`, `Docs/18`,
`Docs/25`, `Docs/performance-budgets.json`, boardul canonic și `Docs/README.md`.

## Limitări declarate (NOT_RUN / neacoperit)

- **FPS hardware — NOT_RUN.** Browserul de probă rulează pe SwiftShader (software). Nu raportăm
  FPS hardware; gate-ul rămâne al proprietarului 224, pe GPU real.
- **Fizica completă a mașinii — necompusă.** Comanda 024 este reală, iar mișcarea folosește
  parametrii mecanici 023, dar Rapier 022/024 nu este compus aici; mașina nu are coliziune de
  caroserie în această compunere. Este o limitare a scope-ului, nu o a doua fizică de domeniu.
- **198 FOCUS ca ținător de tick.** Contractul 198 nu are pas DRIVE; `focus` crește cu tick-urile
  petrecute în mașină (264 în probă) și este raportat explicit, nu ascuns.
- **Resetarea de scenariu.** `resetScenario()` este o facilitate a probei (walker nou la spawn),
  nu o funcție de joc; este folosită între mers/alergare și intrare pentru ca aceleași taste reale
  să fie probate din poziția de start.
- **Salvarea V3 (200) nu este cablată** în această compunere; poziția, camera și autoritatea nu
  sunt persistate la reload. Rămâne un pas de compunere separat.
- **Artefactul de release 202 rămâne istoric.** Tabelul generat încă marchează capabilitățile ca
  `HEADLESS_CONTRACT` și `in-game-composition` ca `NOT_RUN`; poate fi regenerat numai de
  proprietarul 202. `Docs/18`, `Docs/25` și bugetele nu au fost modificate.

## Rețeta manuală

`npm run dev`, deschide pagina, apasă „Pornește”, apoi:

- `W` mers, `W`+`F` alergare, `A`/`D` virează, `S` frână/înapoi, `Space` frână de mână;
- `G` intră în taxi când ești lângă ușă, `W` conduce, `S` oprește, `G` iese și revii la mers.

HUD-ul din stânga jos arată entitatea controlată, modul, clipul, viteza și camera.
