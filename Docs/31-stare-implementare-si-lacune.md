# Starea implementării și lacunele

Versiune 0.1 · 26 noiembrie 2026. Acest document este sursa curentă pentru întrebarea „ce se poate juca și ce lipsește”. Înlocuiește afirmațiile de stare din documentele mai vechi; acelea rămân istoric.

## Definiții

| Stare | Înseamnă |
| --- | --- |
| **Jucabil** | Comportamentul este montat în buildul din `index.html` și poate fi observat în browser. |
| **Contract** | Modulul, testele și dovezile există, dar nu este compus în jocul live. |
| **Lipsește** | Nu există nici contract, nici implementare. |

Un PBI Done în generația 001–258 înseamnă, în cele mai multe cazuri, **Contract**, nu **Jucabil**. Boardul vechi a fost resetat pentru a nu mai amesteca cele două. Boardul curent începe la 259; ID-urile 001–258 sunt istorice și nu se reutilizează.

## Ce se joacă azi

Buildul curent pornește din `src/main.ts` și oferă:

- mers, alergare, intrare/ieșire din mașină cu `G`;
- `W/S/A/D`, frână de mână și marșarier;
- `M` între AUTO și MANUAL;
- AUTO care urmează o rută 041 la ~80% din limita benzii;
- 24 de mașini AI civile cu cruise/following;
- `T` pentru ora din zi și vizualul V4;
- ecran de start, pauză, vitezometru și indicator de mod;
- meniul Academie / Joacă liberă / Haos și „Oraș proaspăt, păstrează stilul” din panoul shell-ului, cu identitate, checkpoint și pauză/AUTO separate;
- un singur composition root (260) care deține tick-ul, pauza/focusul și ordinea porturilor, plus un panou de integrare care arată explicit sistemele 262–286 încă neintegrate;
- panoul `Flotă` (263) care listează toate taxiurile și civilii live, mută doar camera la selecție și preia explicit `M` cu un singur scaun `PLAYER`;
- [economia live 266](live-economy.md) peste cursele 265: revenue, review 0–5, bucketuri KPI de zi/lună și un HUD compact cu ziua/luna simulată;
- panoul `Companie` (270) peste ledgerul 268 și evoluția 269: revenue, costuri, profit, cash, valoare de flotă, nivel, grafic și tabel lunar, detalierea costurilor și achiziții/upgrade-uri cu confirmare și refuzuri explicite;
- campania live 275 peste trackerul 116, tutorialul 117 și ledgerul 125: etapa 1 pornește automat, obiectivele se calculează din evenimente 007 reale, tutorialul are cinci pași separați de learning, iar panoul `Misiuni` arată progresul, fereastra, bugetul, motivul de eșec și reluarea;
- misiunile zilnice și XP-ul 276 peste 211/212/213/125: exact trei obiective pe ziua reală, cel puțin unul MANUAL fără learning, XP idempotent din daily, campanie și timp activ, nivel monoton și panoul `Progres` cu sold, istoric, fereastră și motivul expirării.

Nu sunt montate: provocările random (277), salvare, panourile de sistem (profil, setări), first-person, minimapa, sunet, decorul destructibil și provocările Haos, fizica Rapier și regulile de trafic. Cursele live, pickup/dropoff, pasagerul, ETA și HUD-ul de cursă sunt montate prin 265; AUTO/MANUAL/LEARNING și segmentele 069 sunt montate prin 271.

## Matricea lacunelor

| PBI | Titlu | Etapă | Dependențe |
| --- | --- | --- | --- |
| 259 | Gardă de sincronizare pentru documentația de stare și board | V1 | — |
| 260 | Shell-ul jocului și composition root pentru Academia jucabilă | V1 | — |
| 261 | Sesiuni Academie și Haos, schimbare, reset și recuperare | V1 | 260 |
| 262 | Flota live: 20–30 taxiuri și 20–40 civili, nu doar date în registry | V1 | 260 |
| 263 | Selectarea oricărui taxi sau civil, camera și un singur scaun PLAYER | V1 | 262 |
| 264 | Cereri de curse live, coadă și dispecerizare către flota reală | V1 | 262 |
| 265 | Ciclul complet al cursei: pickup, dropoff, pasager, ETA și HUD | V1 | 264 |
| 266 | Economia live: revenue, review-uri, KPI și ceasul economic | V1 | 265 |
| 267 | Panoul KPI, tabloul orașului și feedbackul consecințelor în joc | V1 | 266 |
| 268 | Modelul financiar al companiei: costuri, profit, cash și P&L | V1 | 266 |
| 269 | Evoluția companiei: nivel, achiziții de vehicule și upgrade-uri | V1 | 268 |
| 270 | Panoul companiei: profit, costuri, cash, flotă și investiții | V1 | 268, 269 |
| 271 | Cele trei moduri live: AUTO, MANUAL, LEARNING și toate tranzițiile | V1 | 260, 263 |
| 272 | Telemetrie, oportunități și eligibilitate din condusul live | V1 | 271 |
| 273 | Pipeline-ul de learning live: dovezi, worker, profil și activare | V1 | 272 |
| 274 | Interfața de learning și profil: notificări, explicații, istoric și restore | V1 | 273 |
| 275 | Campania, tutorialul și panoul de misiuni în jocul live | V1 | 260, 265, 271 |
| 276 | Trei misiuni zilnice, XP, nivel și progresul jucătorului în joc | V1 | 260, 265, 271 |
| 277 | Provocările random, directorul, panoul și reluarea în joc | V1 | 260, 265, 271 |
| 278 | Persistență live: autosave, checkpoint, savefile și recuperare | V1 | 260, 266, 276 |
| 279 | Setări, remapare taste și slidere de control/stil în joc | V1 | 260 |
| 280 | Camera first-person din poziția șoferului | V1 | 260, 263 |
| 281 | Minimapa, harta de flotă și HUD-ul complet de joc | V1 | 260, 263 |
| 282 | Fizica Rapier live pentru jucător și AI | V1 | 260, 262 |
| 283 | Regulile de trafic live: semafoare, STOP, prioritate, yield și benzi | V1 | 260, 262, 282 |
| 284 | Traficul civil complet autonom și preluarea oricărei mașini | V1 | 262, 283 |
| 285 | Decor destructibil, feedback audio și replay în joc | V1 | 282, 283 |
| 286 | Pietoni, treceri și pericole V2 în lumea live | V2 | 282, 283 |
| 287 | Gate V4, QA final, playtest și release verificat | V4 | 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286 |

## Detalii pe task

### 259 — Gardă de sincronizare pentru documentația de stare și board

**Ce lipsește:** Documentația de stare, counturile și linkurile nu au nicio verificare automată; după resetarea boardului pot diverge din nou.

- README-ul rădăcină și Docs/README conțin încă numere și afirmații din generația 001–258.
- Nu există un check care să compare numărul de taskuri, etapele, titlurile și dependențele din PBI/README cu fișierele reale.
- Docs/21 și noul Docs/31 pot rămâne în urmă fără ca cineva să observe.
- Manualul și documentele de release pot descrie funcții care nu sunt montate în joc.
- Linkurile locale din Docs și PBI nu sunt verificate într-o singură comandă de proiect.
- Nu există o regulă clară pentru ID-urile retrase 001–258 și pentru ID-urile noi 259+.

**Documentație:** [Starea implementării și lacunele](31-stare-implementare-si-lacune.md) · [Validare și release](18-validare-si-release.md) · [Contracte de performanță](25-performanta-contracte-si-benchmark.md) · [Politica de validare](validation-policy.md)

**PBI:** [259](../PBI/README.md) · **Dependențe:** niciuna.

**Stare:** Done la 26 noiembrie 2026. `npm run docs:check` și testele aferente sunt active; textul de mai sus rămâne descrierea lacunii care a justificat taskul.

### 260 — Shell-ul jocului și composition root pentru Academia jucabilă

**Ce lipsește:** Sistemele reale 261–286 nu sunt încă montate în shell; porturile lor sunt declarate și raportate ca absente.

**Ce s-a livrat:** un singur composition root montează compunerea V3 existentă pe tickul autoritar și expune explicit porturile sistemelor 261–286.

- `src/app/game-shell.ts` deține tick-ul, ordinea declarată a fazelor, pauza/focusul prin owner-ul 070 și regula „o singură lume activă”; un port absent este raportat `ABSENT`, nu simulat.
- `src/main.ts` atașează compunerea V3 ca lume autoritară, rulează un singur `step` prin shell și leagă start/pauză/reluare/focusul de același owner.
- `src/ui/game-shell-host.ts` montează Start/Pauză/Reia și un panou modal de integrare, cu focus, Escape și zero listeneri globali.
- Porturile flotei, curselor, economiei, learning-ului, misiunilor, persistenței, setărilor, camerei, HUD-ului, traficului, distrugerii și pietonilor sunt declarate și raportate ca absente până la taskurile lor.
- Proba `npm run shell:probe` rulează start → conducere → panou → reluare → reload pe WebGL2 și WebGPU, cu tickul înghețat cât timp panoul suspendă simularea și cu o singură lume/gazdă după reload.

**Ce rămâne:** sistemele reale din 261–286 nu sunt implementate aici. Flota, cursele, economia, learning-ul, misiunile, persistența, setările, camera first-person, minimapa, fizica Rapier, regulile de trafic, distrugerea și pietonii rămân dependențe ale taskurilor lor.

**Documentație:** [Shell-ul jocului și composition root](game-shell.md) · [Arhitectură și contracte](02-arhitectura-si-contracte.md) · [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Salvare și import/export](15-salvare-si-import-export.md) · [Contracte de performanță](25-performanta-contracte-si-benchmark.md)

**PBI:** [260](../PBI/README.md) · **Dependențe:** niciuna.

**Stare:** Done la 26 noiembrie 2026. Shell-ul este montat; sistemele 261–286 rămân taskurile dependente.

### 261 — Sesiuni Academie și Haos, schimbare, reset și recuperare

**Ce lipsește:** Sesiunea este hardcodată `v3-composition-236`; nu există alegere Academie/Haos, checkpoint propriu, schimbare sau reset cu stil păstrat.

**Ce s-a livrat:** `src/app/session-flow.ts` compune hostul 225 peste shell-ul 260; meniul oferă Academie și Haos, fiecare cu `sessionId`, `worldEpoch`, `learningEpoch`, profil și checkpoint propriu. `setSessionContext` adoptă identitatea în tick-ul următor, iar portul `sessions` refuză un context vechi. Schimbarea suspendă shell-ul, închide segmentul, comite un checkpoint, anulează joburile lumii vechi și pornește în `PAUSED_AUTO`; un commit refuzat păstrează lumea și epocile. „Oraș proaspăt, păstrează stilul” comite `SCENARIO_RESET` în același store înainte de a avansa epocile, păstrând profilul, XP, daily-ul, recompensele și KPI-ul. Rezultatele târzii primesc motivele închise 225. Checkpointul live este în memorie; adaptorul durabil și reluarea fizică a snapshotului rămân la 278. Proba `npm run session:probe` a trecut pe WEBGL2 și WEBGPU.

- Nu există meniu de alegere a sesiunii; `sessionId`, `playerId` și `profileId` sunt fixe în compunere.
- Nu există checkpoint propriu pentru Academie și Haos, nici izolarea daily/XP/KPI.
- Nu există „Oraș proaspăt, păstrează stilul” sau reset cu `worldEpoch`/`learningEpoch` nou.
- Nu există recuperare după salvare eșuată și nici reluare în pauză/AUTO.
- Nu există anularea joburilor lumii părăsite sau verificarea identității rezultatelor târzii.
- Nu există o probă de browser pentru două sesiuni și două checkpointuri.

**Documentație:** [Joacă liberă, Haos și distrugere](26-joaca-libera-haos-si-distrugere.md) · [Salvare și import/export](15-salvare-si-import-export.md) · [Savefile și integritate](29-savefile-si-integritate.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [261](../PBI/README.md) · **Dependențe:** 260.

**Stare:** Done la 26 noiembrie 2026. Checkpointul live este în memorie; adaptorul durabil și rehidratarea fizică rămân la 278/271.

### 262 — Flota live: 20–30 taxiuri și 20–40 civili, nu doar date în registry

**Ce lipsește:** Registry-ul creează 20 de taxiuri doar ca date; în lume există un taxi și 24 de civili AI. Nu există flotă de taxiuri simulată.

- `createAmbientTraffic` creează 20 de taxiuri în registry, dar compunerea conduce doar civilii; taxiul jucătorului este singurul actor taxi.
- Nu există taxiuri AI cu rute, curse sau pickup în lumea live.
- Nu există o separare clară între vehiculele ascunse, selectate, MANUAL, LEARNING și AUTO în compunerea browser.
- Nu există aplicarea profilului comun tuturor taxiurilor și civililor la un tick comun.
- Nu există o limită și un cost măsurat pentru 70 de vehicule în compunerea reală.
- Nu există verificarea faptului că un vehicul nou creat citește versiunea activă a profilului.

**Ce s-a livrat:** `createAmbientTraffic` creează 24 de taxiuri și 32 de civili ca actori 058 reali, fiecare cu ID stabil, clasă 023, rută 041 pe accesul categoriei și autoritate proprie. Simularea nu depinde de cameră: 54/54 actori aflați la peste 80 m de jucător se deplasează în proba de 600 tick-uri. `styleSource` leagă registry-ul și traficul de același profil activ; `refreshStyle()` este propagarea explicită, iar un vehicul nou citește versiunea curentă. Spawn-ul este determinist, fără suprapuneri cu jucătorul, vehiculele statice sau decorul, iar `dispose()` readuce ownership-ul la zero. Costul pentru 70 de vehicule este 5,82 ms/tick la p95 față de bugetul de 8 ms, cu decizii 044 fazate la 10 Hz și lider fizic la 60 Hz. Cursele, pickup-ul și selecția rămân 264/265/263.

**Documentație:** [Flotă și curse](07-flota-si-curse.md) · [Registry-ul flotei](fleet-registry.md) · [Traficul civil](civil-traffic.md) · [Stilul orașului](city-style.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [262](../PBI/README.md) · **Dependențe:** 260.

**Stare:** Done la 26 noiembrie 2026. Taxiurile AI sunt simulate, dar rămân nepreluabile până la 263/284.

### 263 — Selectarea oricărui taxi sau civil, camera și un singur scaun PLAYER

**Ce lipsește:** Nu există listă/hartă de flotă; mașinile AI refuză intrarea, iar în lume doar taxiul parcat și civilul static sunt preluabile.

- Nu există panoul flotei, lista de taxiuri, filtrele sau sortarea în jocul live.
- Nu există selecție pe minimapă/hartă și nici intenția `WORLD` către autoritate.
- Mașinile AI refuză intrarea cu `AI_TRAFFIC`; „orice mașină” din Docs/01 nu este îndeplinit.
- Nu există păstrarea rutei/cursei vehiculului părăsit și nici revenirea lui în AUTO.
- Nu există verificarea unui singur scaun `PLAYER` la tranziții rapide.
- Nu există comportament de focus, pauză și Escape pentru panoul de flotă.

**Documentație:** [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Panoul flotei](fleet-panel.md) · [Selectarea prin hartă](map-selection.md) · [Schimbarea vehiculului](vehicle-switch.md) · [Pickingul vehiculelor](vehicle-picking.md) · [Selectarea live 263](live-fleet-selection.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [263](../PBI/README.md) · **Dependențe:** 262.

**Stare:** Implementat local la 26 noiembrie 2026. Panoul `Flotă` listează toate taxiurile și civilii live, un click/Enter/Space mută doar camera, `M` preia explicit cu un singur scaun `PLAYER`, iar vehiculul părăsit revine în AUTO cu ruta/cursea reconciliată. Din 271, `L` deschide LEARNING prin owner-ul live; browserul și fizica rămân limitările de mai jos.

### 264 — Cereri de curse live, coadă și dispecerizare către flota reală

**Ce lipsește:** Nu există cereri de curse, coadă sau dispecer în joc; taxiurile nu primesc și nu execută curse.

- Modulele 059/060 există, dar nu sunt create în compunerea live.
- Nu există zone de pickup/dropoff active în lumea jucabilă.
- Nu există coadă, cursor de program, politică `REJECT_NEWEST` sau replanificare la asignare.
- Nu există excluderea taxiurilor blocate, avariate sau offline din alegere.
- Nu există legătura dintre starea de sănătate a flotei și cursa activă.
- Nu există o probă de browser cu cereri care apar în timpul condusului.

**Documentație:** [Flotă și curse](07-flota-si-curse.md) · [Cereri de curse](ride-demand.md) · [Dispecerizare](dispatcher.md) · [Sănătatea flotei](fleet-health.md) · [Cereri și dispecerizare live](live-rides.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [264](../PBI/README.md) · **Dependențe:** 262.

**Stare:** Implementat local la 26 noiembrie 2026. `src/fleet/live-rides.ts` compune 059/060 peste cele 24 de taxiuri live, cu 64 de cereri deterministe din seed, coadă plafonată, dispecerizare la 10 Hz și costul real minim 041. Portul `rides` al shell-ului și panoul `Curse` arată cererile și alocările; taxiurile blocate/avariate/offline/conduse de jucător sunt excluse, iar resetul eliberează revendicările fără duplicate. Raportul determinist are 39 de verificări, iar proba de browser a trecut pe WEBGL2 cu cereri vizibile și preluarea unui taxi alocat. Pickup/dropoff fizic, pasagerii și ETA rămân PBI 265.

- **Ce s-a livrat:** `createLiveRidePlan` și `createLiveRides` în `src/fleet/live-rides.ts`; export în `src/fleet/index.ts`; portul `rides` și panoul read-only în `src/main.ts` și `src/ui/live-rides-panel.ts`; butonul `Curse` în gazda shell-ului; teste în `tests/fleet/live-rides.test.ts` și `tests/ui/live-rides-panel.test.ts`; raport în `tests/fleet/live-rides-report.ts`.
- **Dovezi:** [raport determinist](Evidence/264-live-rides/report.json), [cost de subsistem](Evidence/264-live-rides/cost.json), [probă de browser](Evidence/264-live-rides/browser.json).

### 265 — Ciclul complet al cursei: pickup, dropoff, pasager, ETA și HUD

**Stare:** Implementat local la 26 noiembrie 2026. `src/fleet/live-ride-lifecycle.ts` compune 061–064 peste revendicările 264, iar `src/app/live-ride-composition.ts` adaugă pasagerul 147 și HUD-ul 073. Cursa urmează `TO_PICKUP → PICKUP → TO_DROPOFF → DROPOFF → COMPLETED` numai în zonele reale 032, sub pragul de viteză și după dwell-ul cerut; pickup/dropoff publică sosirea la începutul dwell-ului, deci pasagerul și markerii rămân vizibili. `keepPlayerClaims` păstrează cursa la preluarea taxiului revendicat, iar taxiurile blocate/avariate/offline închid cursa cu `FAILED` și motiv închis înainte de eliberarea exactă a revendicării 060. HUD-ul afișează etapa, obiectivul, ETA cu interval, progresul și motivul indisponibil, niciodată `0 s` inventat; panoul `Curse` afișează aceleași rânduri plus pasagerul. Resetul închide fiecare cursă activă cu `SCENARIO_RESET` fără duplicate. Raportul determinist are 53 de verificări, iar proba de browser a trecut cu 25/25 verificări, o cursă completă condusă manual și una `FAILED/TAXI_BLOCKED`.

**Ce lipsește:** Cursa autonomă completă (taxiurile AI nu primesc încă un traseu de cursă în compunere) și economia cursei (tarif, review, KPI), care rămâne PBI 266.

- **Dovezi:** [raport determinist](Evidence/265-ride-lifecycle/report.json), [probă de browser](Evidence/265-ride-lifecycle/browser.json), [README dovezi](Evidence/265-ride-lifecycle/README.md).
- **Limite:** cursa autonomă completă rămâne deschisă (taxiurile AI nu primesc încă un traseu de cursă în compunere); tarifarea, review-ul și KPI-urile rămân 266.

**Documentație:** [Flotă și curse](07-flota-si-curse.md) · [Ciclul live al cursei](live-ride-lifecycle.md) · [Lifecycle-ul cursei](ride-fsm.md) · [Pickup](pickup.md) · [Dropoff](dropoff.md) · [ETA și progres](eta.md) · [Pasageri simplificați](passenger-visual.md) · [HUD](hud.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [265](../PBI/README.md) · **Dependențe:** 264.

**Stare:** Done la 26 noiembrie 2026. Cursele MANUAL și AUTO sunt complete, pasagerul/ETA/HUD sunt live, iar taxiurile AI execută rutele pickup→dropoff. Economia rămâne 266.

### 266 — Economia live: revenue, review-uri, KPI și ceasul economic

**Stare:** Implementat local la 26 noiembrie 2026. `src/app/live-economy-composition.ts` instanțiază economia 209 peste cursele terminale 265, iar `src/main.ts` montează portul `economy` după `rides`. Fiecare sesiune are propriul ledger, review-uri și bucketuri, create numai după resetul 265, deci nu moștenesc cursele celeilalte sesiuni. Fiecare cursă terminală produce o singură decontare: `COMPLETED` încasează tariful complet, `FAILED` și `CANCELLED` fără pasager rambursează integral, `CANCELLED` cu pasager păstrează doar taxa de serviciu. Review-ul 0–5 consumă un trace real 139 cu pasager, bucketurile de zi/lună păstrează revenue, curse, review-uri, `ratingSum`, histogramă și expunere, iar `historyScans` rămâne `0`. Pauza/focusul suspendă ceasul economic (1 200 s/zi, 30 zile/lună), civilii nu intră în revenue, un duplicat nu schimbă nimic, iar resetul de sesiune pornește o epocă nouă fără să rescrie istoricul. HUD-ul live arată ziua/luna simulată; pop-up-ul KPI rămâne 267.

**Ce lipsește:** Ferestrele 088 de suprimare a artefactelor și secundele blocate 137 nu sunt încă montate live; review-ul folosește confortul real, dar raportează acei termeni ca 0. Persistarea economiei după reload rămâne 278, iar cursele închise chiar de resetul 265 cu `SCENARIO_RESET` nu mai sunt vizibile ca `RideRecord` terminal și nu sunt decontate. Proba de browser a trecut 18/18 pe Chromium 157/WEBGL2, cu o cursă manuală `COMPLETED`, un settle și un review pentru cursa țintă, revenue 9 335 SDA în sesiune (inclusiv taxiurile AI) și `historyScans: 0` înainte/după panoul `Curse`.

- **Ce s-a livrat:** `src/app/live-economy-composition.ts`, `src/economy/live-economy.ts`, `src/ui/live-economy-format.ts`, `src/ui/live-economy-hud.ts`, portul `economy` și HUD-ul din `src/main.ts`; teste în `tests/economy/live-economy.test.ts`, `tests/economy/live-economy-report.test.ts` și `tests/ui/live-economy.test.ts`; raport în `tests/economy/live-economy-report.ts`.
- **Dovezi:** [raport determinist](Evidence/266-live-economy/report.json), [probă de browser](Evidence/266-live-economy/browser.json), [README dovezi](Evidence/266-live-economy/README.md).

**Documentație:** [KPI-uri, economie și review-uri](22-kpi-economie-si-review-uri.md) · [Flotă și curse](07-flota-si-curse.md) · [Economia live](live-economy.md) · [Indicatorii de serviciu](metric-service.md) · [Indicatorii de comportament](behavior-metrics.md) · [Indicatorii de confort](comfort-metrics.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [266](../PBI/README.md) · **Dependențe:** 265.

**Stare:** Done la 26 noiembrie 2026. Economia live decontează cursele, produce review-uri cu incidente reale și KPI; popup-ul/dashboard-ul rămân 267, iar compania 268–270.

### 267 — Panoul KPI, tabloul orașului și feedbackul consecințelor în joc

**Ce lipsește:** Pop-up-ul KPI, tabloul orașului și feedbackul 214 sunt implementate ca panouri, dar nu sunt montate; nu există buton sau hotkey în joc.

- `createKpiHistory`, `createCityDashboard` și `createKpiImpactHud` nu sunt apelate din shell.
- Nu există buton „KPIs” sau hotkey `K` în jocul live.
- Nu există grafice lunare, tabel zilnic și distribuție 0–5 montate.
- Nu există tabloul orașului cu incidente, blocaje și confort.
- Nu există feedback scurt după o scădere de KPI, fără mesaj de pierdere XP.
- Nu există verificarea focusului, Escape, Tab și a costului când panoul este închis.

**Ce s-a livrat:** `src/app/kpi-dashboard.ts` (`267-kpi-dashboard-composition-v1`) compune selecția 210, feedbackul 214 și distanța reală a curselor peste read model-urile existente. `src/ui/city-dashboard-panel.ts` (`267-city-dashboard-panel-v1`) montează tabloul 082 cu focus, Tab și Escape, iar `src/ui/game-shell-host.ts` adaugă butoanele `KPIs` și `Oraș`. `K` este hotkey-ul hostului; popup-ul KPI se actualizează la 10 Hz numai cât timp este deschis, iar HUD-ul 214 scrie doar planul schimbat.

- O lună fără bucket este `NO_DATA` / „fără date”, iar un zero real rămâne `0 SDA`; luna curentă este `PARTIAL`, proiecția folosește pragurile 209, iar media este `ratingSum / reviewCount`.
- Tabloul orașului randează șapte indicatori peste 061/065 și incidentele reale 028/065; sursele live încă nemontate sunt `UNAVAILABLE`, nu zero. Distanța este suma rutelor 033 planificate.
- Feedbackul 214 apare numai după un eveniment comercial, are trei planuri separate și păstrează `xpLossMessages: 0`; planul de misiune este `NONE` până la 276.
- Panourile închise nu citesc și nu randează; `historyScans` rămâne `0`. Inputul 025 ignoră dialogurile `[hidden]`, deci tastele de condus nu mai sunt blocate după închidere.

Dovezile sunt în [Evidence/267-kpi-dashboard](Evidence/267-kpi-dashboard/README.md): raport determinist 15/15 și probă de browser 26/26 pe fixture și pe buildul live.

**Documentație:** [KPI-uri, economie și review-uri](22-kpi-economie-si-review-uri.md) · [Tabloul orașului](city-dashboard.md) · [Accesibilitatea interfeței](ui-accessibility.md) · [Layout responsive](responsive-layout.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [267](../PBI/README.md) · **Dependențe:** 266.

**Stare:** Implementat local la 27 noiembrie 2026. Panourile sunt montate în shell; 12 luni apar după ce istoricul le acoperă, iar owner-ii live 282/283/272/273, misiunea 276 și persistența 278 rămân limite explicite.

### 268 — Modelul financiar al companiei: costuri, profit, cash și P&L

**Ce lipsește:** Documentația definește doar revenue, explicit nu profit; nu există costuri de operare, cash, profit sau P&L de companie.

- Docs/22 și manualul exclud explicit costurile de operare și profitul.
- Nu există entitate `Company`, ledger de costuri, cash sau valoare de flotă.
- Nu există costuri pe cursă (energie, mentenanță, incident, serviciu) sau costuri fixe lunare.
- Nu există legătura dintre daune, kilometraj și cost.
- Nu există raport lunar revenue/costuri/profit și nici idempotență pe cursă.
- Nu există separarea formală față de XP și față de ledgerul 209.

**Documentație:** [Companie: profit și evoluție](32-companie-profit-si-evolutie.md) · [KPI-uri, economie și review-uri](22-kpi-economie-si-review-uri.md) · [Flotă și curse](07-flota-si-curse.md) · [Savefile și integritate](29-savefile-si-integritate.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [268](../PBI/README.md) · **Dependențe:** 266.

**Stare:** Done la 26 noiembrie 2026. Ledgerul de costuri/profit/cash este live; nivelul, achizițiile și upgrade-urile sunt livrate de 269, iar dashboard-ul de 270.

### 269 — Evoluția companiei: nivel, achiziții de vehicule și upgrade-uri

**Ce lipsește:** Nu există evoluție de companie: nici nivel, nici cash de investit, nici achiziții sau upgrade-uri. XP-ul jucătorului nu este evoluția companiei.

- Nu există praguri de nivel de companie sau valoare de companie.
- Nu există achiziție de vehicule noi în flotă și nici capacitate de flotă.
- Nu există upgrade-uri cu efecte măsurabile și versionate.
- Nu există refuz pentru fonduri insuficiente sau upgrade deja deținut.
- Nu există persistență pentru nivel, achiziții și upgrade-uri.
- Nu există o regulă care să împiedice un upgrade să modifice ascuns stilul învățat.

**Documentație:** [Companie: profit și evoluție](32-companie-profit-si-evolutie.md) · [Misiuni și progres](13-misiuni-si-progres.md) · [Misiuni zilnice și XP](23-misiuni-zilnice-si-experienta.md) · [Flotă și curse](07-flota-si-curse.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [269](../PBI/README.md) · **Dependențe:** 268.

**Stare:** Implementat local la 26 noiembrie 2026. Nivelul companiei, achizițiile reale în flota 057/058, upgrade-urile versionate cu efect în perioada următoare, refuzurile închise și read model-ul live sunt verificate; panoul este livrat de 270, iar fișierul/reload-ul rămân 278.

### 270 — Panoul companiei: profit, costuri, cash, flotă și investiții

**Ce lipsește:** Nu există nicio interfață pentru companie: profit, costuri, cash, valoare de flotă și investiții nu pot fi inspectate.

- Nu există buton sau dialog „Companie”.
- Nu există grafic revenue/costuri/profit pe lună și tabel pe perioade.
- Nu există detaliere pe categorie de cost și pe cursă.
- Nu există listă de achiziții/upgrade-uri cu cost, efect și stare.
- Nu există mesaje pentru fonduri insuficiente, nivel insuficient sau upgrade deținut.
- Nu există reguli de focus, Escape, Tab și cost când panoul este închis.

**Ce s-a livrat:** `src/ui/company-dashboard-format.ts` (`270-company-dashboard-v1`) proiectează read model-ul 269 în indicatori, grafic, tabele, costuri pe categorie, ultima cursă și liste de investiții. `src/ui/company-dashboard.ts` (`270-company-dashboard-panel-v1`) montează dialogul, iar `src/ui/game-shell-host.ts` montează butonul nativ `Companie`; `src/main.ts` leagă aceleași porturi 269 și suprafața 070 a shell-ului.

- O lună fără bucket este `NO_DATA` / „fără date”, nu zero; un zero real rămâne `0 SDA`, iar profitul negativ rămâne vizibil.
- Graficul și tabelul folosesc aceeași listă de luni și aceleași valori, fără medii ale mediilor.
- Fiecare achiziție/upgrade afișează costul, efectul și starea; confirmarea este în panou, iar fondurile insuficiente, nivelul insuficient și upgrade-ul deținut blochează butonul cu text explicit.
- Focusul intră în dialog, Tab/Shift+Tab se învârt în panou, Escape închide prin shell și focusul revine. Nu există listeneri globali.
- Panoul deschis citește la 10 Hz; panoul închis nu citește și nu randează (`SKIPPED_CLOSED`), iar `historyScans` rămâne `0`.
- Nu creează un al doilea ledger sau o a doua flotă: achiziția cheamă portul 269 peste registry-ul 057 existent.

Dovezile sunt în [Evidence/270-company-dashboard](Evidence/270-company-dashboard/README.md): raport determinist 33/33 și probă de browser 29/29 pe fixture și pe buildul live.

**Documentație:** [Companie: profit și evoluție](32-companie-profit-si-evolutie.md) · [KPI-uri, economie și review-uri](22-kpi-economie-si-review-uri.md) · [Accesibilitatea interfeței](ui-accessibility.md) · [Layout responsive](responsive-layout.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [270](../PBI/README.md) · **Dependențe:** 268, 269.

**Stare:** Implementat local la 27 noiembrie 2026. Panoul este montat în shell; persistența de fișier/reload și importul atomic rămân 278.

### 271 — Cele trei moduri live: AUTO, MANUAL, LEARNING și toate tranzițiile

**Ce lipsește:** Telemetria, joburile și profilul live lipsesc; cele trei moduri și segmentele 069 sunt montate.

- `applyVehicleMode` acceptă numai `AUTO` și `MANUAL`; nu există `L` sau `LEARNING`.
- Segmentele live sunt 198 de walking/takeover, nu 069 de intervenție la volan.
- Intrarea în mașină forțează `MANUAL`; nu există eligibilitate sau segment LEARNING.
- Nu există păstrarea rutei/cursei la tranziție și nici reluarea stării fizice la AUTO.
- Nu există raport de continuitate, autoritate unică sau verificare de tick pentru cele șase tranziții.
- Nu există HUD cu textele și simbolurile AUTO/MANUAL/LEARNING.

**Ce s-a livrat:** `src/app/live-three-modes.ts` compune ciclul real 069 peste compunerea V3; fiecare tick pregătește o singură graniță, compunerea aplică modul în același tick, iar 069 o închide cu poziția, ruta, clasa și profilul vehiculului. `requestModeAction` este singura cale pentru tastele `M`/`L`, butoanele HUD și butonul `L` din panoul `Flotă`; toate cele șase tranziții au fost rulate pe taxi și civil, cu un singur scaun `PLAYER`. Segmentele MANUAL au `learningEligible=false`, segmentele LEARNING sunt expuse pentru 272 fără job sau versiune de profil, iar AUTO reia poziția fizică curentă (un tick de coast, apoi reproiectarea pe graf). HUD-ul afișează „Conduce AI-ul”, „Conduci · învățare oprită” și „Conduci · orașul învață”. Pauza nu inventează tick-uri, iar schimbarea sesiunii închide segmentul cu un motiv terminal.

- Dovezi: `npm run modes:live` (12 tranziții, 4 segmente LEARNING, 0 profiluri) și `npm run modes:live:probe` (11/11 în Chrome 157/WEBGL2), în [Evidence/271-live-three-modes](Evidence/271-live-three-modes/README.md).
- Limitări: AUTO reia exact primul tick, dar reproiectarea completă pe banda grafului și reintrarea off-lane rămân 054/282; `G` intrare/ieșire rămâne traseul 195/196/198, nu deschide un segment 069; capacitatea 069 este 64 de segmente per ciclu de viață.

**Stare:** Done la 27 noiembrie 2026. Tastele și butoanele HUD folosesc aceeași intenție live, iar browserul Chrome 157 a trecut 11/11; taskul este mutat în Done și validat pe board.

**Documentație:** [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Învățarea stilului](10-invatarea-stilului.md) · [Comenzile de mod](mode-controls.md) · [Integrarea celor trei moduri](three-modes.md) · [Cursa completă și intervenția](manual-trip.md) · [Continuitatea la preluare](takeover-continuity.md) · [Autoritatea de control](control-authority.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [271](../PBI/README.md) · **Dependențe:** 260, 263.

### 272 — Telemetrie, oportunități și eligibilitate din condusul live

**Ce lipsește:** Nu se înregistrează inputul, comenzile, contextul și oportunitățile jucătorului; pipeline-ul de learning nu are date live.

- Nu există writer de telemetrie conectat la condusul jucătorului.
- Nu există oportunități STOP/semnal/urmărire/bandă din contextul real al lumii live.
- Nu există ferestre de eligibilitate și nici excluderea pauzelor, focusului și teleportărilor.
- Nu există deduplicare pe `opportunity.id + occurrence`.
- Nu există includerea taxiurilor și civililor din afara camerei.
- Nu există un cost măsurat pentru înregistrare și nici un buffer mărginit.

**Ce s-a livrat:** `createLiveTelemetry` (`src/telemetry/live-telemetry.ts`) și adaptorul `createLiveTelemetryComposition` (`src/app/live-telemetry.ts`) leagă 085–088 de tick-ul autoritar al compunerii V3 și de segmentele 069 ale 271. Segmentele MANUAL/LEARNING scriu eșantioane 085 la 60 Hz cu input brut, comandă filtrată, viteză, bandă, semnal și clasă; toate taxiurile și civilii scriu într-un inel world mărginit, indiferent de cameră sau selecție. Oportunitățile 086 provin din linia STOP a benzii, mișcarea reală a semnalului 036 și schimbarea reală între benzi vecine, iar urmărirea este contextul `LEADER` al ferestrelor 087. Deduplicarea este pe `opportunity.id + occurrence`, nu pe cadre. Pauza, focusul pierdut și teleportarea produc artefacte 088 cu prefix utilizabil; MANUAL rămâne în metrici fără demonstrație eligibilă. `readClosedSegment` și `readWorldSamples` expun datele către 273, fără job, estimator sau publicare de profil. Raportul determinist are 12/12 verificări, iar costul local p95 măsurat este în `cost.json`.

- Dovezi: `npm run telemetry:live` (12/12) și `npm run telemetry:live:cost`, în [Evidence/272-live-telemetry](Evidence/272-live-telemetry/README.md).
- Limitări: regulile live de trafic (283) nu opresc încă vehiculele la semnal; semnalul este cel al controller-ului 036 construit din harta reală. Nu există owner de ocluzie live, deci conul camerei este conservator. Recuperarea/teleportarea este dovedită prin faptul 030 injectat de host, nu printr-un producător live (282). Proba de browser este `NOT_RUN` fără Playwright. Costul este software, nu FPS/GPU/hardware.

**Documentație:** [Telemetrie și oportunități](09-telemetrie-si-oportunitati.md) · [Învățarea stilului](10-invatarea-stilului.md) · [Telemetria live](live-telemetry.md) · [Eșantioanele la tick](telemetry-samples.md) · [Dovezile de learning](learning-evidence.md) · [Indicatorii de comportament](behavior-metrics.md) · [Regresiile de intervenție](learning-edgecases.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [272](../PBI/README.md) · **Dependențe:** 271.

**Stare:** Done la 27 noiembrie 2026. Telemetria, oportunitățile, ferestrele și artefactele live sunt montate; pipeline-ul live este livrat de 273.

### 273 — Pipeline-ul de learning live: dovezi, worker, profil și activare

**Ce lipsește:** Estimatoarele, worker-ul, profilul 109 și activarea 110 există ca module, dar nu sunt conectate la segmentele live; orașul folosește un profil default.

- Nu există coadă de joburi, worker sau governor conectat la compunerea live.
- Nu există store de profil, versiune de bază sau istoric de versiuni în joc.
- Nu există activarea profilului la tick comun pentru taxiuri și civili.
- Nu există bariera `learningEpoch` la restore/import/profil nou.
- Nu există refuz pentru MANUAL, segment incomplet, job învechit sau dovezi insuficiente.
- Nu există o probă de browser în care stilul orașului se schimbă după o demonstrație.

**Ce s-a livrat:** `src/app/live-learning.ts` (`273-live-learning-v1`) consumă `readClosedSegment` din 272 și construiește un job 103 numai pentru un segment `LEARNING` închis, eligibil, din profilul și epoca curente. `src/learning/live-evidence.ts` (`273-live-evidence-v1`) proiectează faptele 085–088 în read model-ul 093, păstrează identitatea ferestrei 087 și cheamă estimatoarele reale 094/098; o singură cheie este aleasă determinist per segment (STOP, apoi viteză urbană, apoi rezidențială). Coada reală 103/221 rulează prin `src/learning/estimator-queue.ts` cu `WorkerRuntime`, governorul și taskul existente; 102 validează, 109 scrie o versiune imuabilă, iar 110 o activează la `tick + 1` pentru toată flota. Composition root-ul live actualizează sursa de stil a orașului și `refreshStyle()` după activare.

Refuzurile sunt închise: MANUAL/AUTO `SKIPPED_MANUAL`, LEARNING neeligibil `SKIPPED_INELIGIBLE`, segment incomplet `SKIPPED_INCOMPLETE`, epocă/profil străin `STALE_JOB`, dovezi insuficiente `INSUFFICIENT_EVIDENCE` fără versiune, compoziție neschimbată `NO_CHANGE`. Restore/import/profil nou folosesc bariera 205: închid generația, anulează joburile 103, incrementează epoca, publică ținta și păstrează starea fizică; un import invalid nu are niciun efect. Un rezultat târziu este `STALE_JOB` și nu publică nimic, inclusiv când sosește după ce pipeline-ul a fost eliberat.

- Dovezi: `npm run learning:live` (30/30), `npm run learning:live:cost`, `npm run learning:live:probe` (4/9, limitat de renderer), în [Evidence/273-live-learning](Evidence/273-live-learning/README.md).
- Limitări: proba de browser headless cu SwiftShader intră în pauze de overload, iar singura fereastră eligibilă apare la finalul segmentului (tick 841 din 849), prea târziu pentru prefixul de 10 s; pipeline-ul este dovedit determinist pe segmentul real 272. UI-ul de profil rămâne 274, setările 279, fizica 282 și persistența 278.

**Documentație:** [Învățarea stilului](10-invatarea-stilului.md) · [Profiluri și propagare](12-profiluri-si-propagare.md) · [Worker-ul de learning](learning-worker.md) · [Pipeline-ul de profil](profile-pipeline.md) · [Activarea profilului](profile-activation.md) · [Bariera de generație](learning-epoch.md) · [Pipeline-ul live](live-learning.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [273](../PBI/README.md) · **Dependențe:** 272.

**Stare:** Implementat local la 27 noiembrie 2026. Raportul determinist 30/30 și testele țintă trec; proba de browser este 4/9 din cauza pauzelor de overload ale renderer-ului software, nu a pipeline-ului. Taskul rămâne In Progress până la integrarea orchestratorului și dovada de browser pe hardware/browser real.

### 274 — Interfața de learning și profil: notificări, explicații, istoric și restore

**Ce lipsește:** Panourile de notificări, explicații, profil și istoric există, dar nu sunt montate; jucătorul nu vede ce a învățat orașul.

- Nu există notificări live pentru analiză, candidat, publicare, lipsă dovezi sau eroare.
- Nu există panoul profilului cu cele 80 de chei, `null` vs zero și chei R rezervate.
- Nu există istoric de versiuni, comparație părinte→copil și restore cu confirmare.
- Nu există import/export de profil în UI și nici verificarea unei versiuni incompatibile.
- Nu există explicația „ce s-a schimbat și de ce” din dovezile reale.
- Nu există reguli de focus, 10 Hz, fără listeners globali și fără citiri când panoul este închis.

**Documentație:** [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Învățarea stilului](10-invatarea-stilului.md) · [Notificările de analiză](learning-notifications.md) · [Explicația modificărilor](learning-explanation.md) · [Panoul profilului](profile-panel.md) · [Istoricul profilului](profile-history.md) · [Restaurarea și importul](profile-restore.md) · [Legarea UI la profiluri](profile-ui-binding.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [274](../PBI/README.md) · **Dependențe:** 273.

### 275 — Campania, tutorialul și panoul de misiuni în jocul live

**Ce lipsește:** Catalogul de campanie, tutorialul și panoul de misiuni există, dar nu sunt montate; nu există obiective live sau reluare.

- Nu există tracker de campanie în compunerea live.
- Nu există tutorialul de cinci pași și nici separarea lui de învățare.
- Nu există panou de misiuni montat și nici buton în shell.
- Nu există ferestre de evaluare, buget de incidente sau motive de eșec live.
- Nu există recompense idempotente și nici reluare fără dublare.
- Nu există o probă de browser pentru etapa 1 și etapa 2.

**Ce s-a livrat:** `src/app/live-missions.ts` (`275-live-missions-v1`) compune un singur tracker 116, un singur ledger 125 și un singur tutorial 117 peste faptele live: `PICKUP`/`DROPOFF` din 265, `MANUAL_START`/`MANUAL_END` din segmentele 271, `LEADER_ACQUIRED` din 272, `PROFILE_ACTIVATE` din 110/273 și `COLLISION` numai din incidente cu ambele entități reale. Etapa 1 pornește automat; următoarea etapă pornește numai după o finalizare reală, iar o misiune eșuată nu este reluată automat. Tutorialul observă cei cinci pași din selecția și modul real, inclusiv AUTO după eliberarea scaunului `PLAYER`, iar cât timp este activ hostul face segmentele LEARNING ineligibile pentru 273; tutorialul nu creează job, versiune sau scriere de profil. 125 a primit `recordAttemptFailure`, astfel încât o încercare eșuată consumă numărul real de încercare fără recompensă, iar reluarea următoare se decontează normal și fără dublare. Shell-ul montează butonul nativ `Misiuni`, panoul 126 cu focus/Tab/Escape, suprafața 070 și citiri la 10 Hz numai cât timp este deschis; panoul arată fereastra, bugetul, motivul și reluarea. `npm run missions:live` are 24/24 verificări deterministe, iar `npm run missions:live:probe` a trecut 22/22 în Chrome 157/WEBGL2: tutorial 5/5, etapa 1 `COMPLETED` cu 100 XP și 2 recompense acordate o singură dată, etapa 2 `FAILED/SCENARIO_RESET` după reset real, XP și amprenta profilului neschimbate.

**Ce rămâne:** 276 aduce XP-ul efectiv în `PlayerProgress` și misiunile zilnice; 277 aduce provocările random; 278 aduce persistența după reload. Producătorul live 028 de coliziuni nu este montat, deci bugetul de incidente este evaluat din 007 `COLLISION` numai când faptul are ambele entități; panoul afișează reluarea, dar pornirea ei rămâne a hostului, conform contractului 126.

**Documentație:** [Misiuni și progres](13-misiuni-si-progres.md) · [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [275](../PBI/README.md) · **Dependențe:** 260, 265, 271.

**Stare:** Done la 27 noiembrie 2026. Raportul determinist 24/24 și proba de browser 22/22 trec; XP-ul zilnic (276), provocările (277) și persistența (278) rămân dependențe explicite.

### 276 — Trei misiuni zilnice, XP, nivel și progresul jucătorului în joc

**Ce lipsește:** Daily-ul, XP, nivelul și panoul de progres existau ca module, dar nu erau montate; jocul nu acorda XP și nu avea misiuni zilnice.

**Ce s-a livrat:** `src/app/live-daily-progress.ts` (`276-live-daily-progress-v1`) compune exact 211/212/213/125 peste faptele live 275. La prima intrare a zilei reale există exact trei misiuni, cu cel puțin una MANUAL fără learning; seedul 211 și checkpointul de tab păstrează același set la reload. XP-ul vine din recompensele zilnice (100 XP), decontările 125 (100 XP) și timpul activ real (1 XP/minut, ferestre de maximum 30 s, fracții exacte); duplicatele și replay-ul plătesc 0, iar pauza, focusul pierdut, background-ul, AFK-ul, Haos, replay-ul și offline-ul nu acordă XP. Nivelul este derivat monoton din sold, iar KPI-ul negativ, accidentul, misiunea eșuată și ziua ratată nu au cale către ledger. Panoul nativ `Progres` arată soldul, nivelul, istoricul, cele trei obiective, fereastra, resetul, fusul și motivul expirării, cu focus/Tab/Escape și zero listeners globali. Un checkpoint `sessionStorage` rebazat pe sesiunea de recovery păstrează ziua și XP-ul la reload; fișierul durabil rămâne 278.

- CLI: `npm run progress:daily` (49/49 verificări deterministe) și `npm run progress:daily:probe` (Chrome 157 headless/WEBGL2, PASS: 2 obiective zilnice, 2 recompense, 302,524383 XP, nivel 3, reset cu amprenta neschimbată, reload cu același set și sold).
- Dovezi: [raport determinist](../Docs/Evidence/276-daily-xp-progress/report.json), [probă de browser](../Docs/Evidence/276-daily-xp-progress/browser.json), [README dovezi](../Docs/Evidence/276-daily-xp-progress/README.md).
- Limite: `FULL_STOPS`/`LANE_CHANGES` există în catalogul 211, dar 275 nu publică încă evenimentele 272 corespunzătoare, iar `FULL_STOP` 272 nu are încă durata reală cerută de `minDurationS`; obiectivele rămân active până la follow-up. Persistarea în fișier/importul rămân 278.

**Documentație:** [Misiuni zilnice și XP](23-misiuni-zilnice-si-experienta.md) · [Misiuni și progres](13-misiuni-si-progres.md) · [KPI-uri, economie și review-uri](22-kpi-economie-si-review-uri.md) · [Accesibilitatea interfeței](ui-accessibility.md) · [Layout responsive](responsive-layout.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [276](../PBI/README.md) · **Dependențe:** 260, 265, 271.

**Stare:** Done la 27 noiembrie 2026. 278 rămâne persistența durabilă.

### 277 — Provocările random, directorul, panoul și reluarea în joc

**Ce lipsește:** TIMED_DROPOFF, COMFORT, DISTRUCTION si LEARNING nu au inca producator live; 278 si 285 raman.

**Stare:** Done la 27 noiembrie 2026. `src/app/live-challenges.ts` compune 231/232/233 peste cadrul autoritar și ledgerul 213 al lui 276. O singură ofertă vizibilă și o singură instanță activă, cooldown de 10.800 tick-uri, fereastră de ofertă de 2.700 tick-uri, refuz gratuit, taxi rezervat fără a mișca pasagerul existent, verdict din fapte reale de zonă/viteză/orientare, recompensă idempotentă și record local în Haos. Panoul nativ `Provocări` are accept/refuz/„Mai încearcă”/„Continuă condusul”.

- TIMED_DROPOFF, COMFORT, DISTRUCTION și LEARNING sunt excluse înainte de ofertă: nu există încă un producător live de dropoff al cursei provocării, pasager îmbarcat, decor destructibil (285) sau observarea efectului LEARNING. Demolarea este refuzată cu `CAPABILITY:DESTRUCTIBLE_DECOR` înainte de afișare.
- Checkpoint, zonă, parcare și drift au evaluatori live; checkpointurile și zonele sunt poligoanele reale 032, parcarea cere oprire aliniată, iar driftul cere viteză, unghi de derapaj și absența impulsului de coliziune.
- Reload-ul de tab folosește un checkpoint `sessionStorage` peste snapshoturile 232/233; fișierul durabil rămâne 278.

**Documentație:** [Provocări random și revenire](28-provocari-random-si-revenire.md) ↔ [Flotă și curse](07-flota-si-curse.md) ↔ [Joacă liberă, Haos și distrugere](26-joaca-libera-haos-si-distrugere.md) ↔ [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [277](../PBI/README.md) ↔ **Dependențe:** 260, 265, 271.

**Dovezi:** [raport determinist](../Docs/Evidence/277-live-challenges/report.json), [probă de browser](../Docs/Evidence/277-live-challenges/browser.json), [README dovezi](../Docs/Evidence/277-live-challenges/README.md).

### 278 — Persistență live: autosave, checkpoint, savefile și recuperare

**Ce lipsește:** KPI-ul 209 din slotul economic este păstrat și verificat, dar ledgerul live 209 nu este rehidratat pentru că owner-ul 266 nu expune un `restore`; snapshotul complet 206 al lumii și reluarea fizică rămân în afara acestui PBI. Shutdownul nu forțează un ultim commit.

**Ce s-a livrat:** `src/persistence/live-savefile.ts` (`278-live-save-v1`) și `src/app/live-persistence.ts` (`278-live-persistence-v1`) leagă autosave-ul periodic de 900 tick-uri la un checkpoint 225 real și la un fișier `.sdasave` cu SHA-256 `SDA-CJSON-1`. Generația cuprinde identitatea sesiunii, profilul 109 activ, checkpointul 276 daily/XP, checkpointul 277 al provocărilor, compania 268/269 și snapshotul read-only 209/KPI; timpul simulat (`tick`, `lastSavedTick`, `unsavedTicks`, `nextDueTick`) este raportat separat de timpul salvării (`lastAttemptAt`, `lastSuccessAt`, `lastCommitMs`). Exportul produce fișierul cu checksum, importul cere preview și confirmarea exactă a checksum-ului, iar înlocuirea aplică owner-ii într-un rollback complet dacă orice pas e refuzat. Reload-ul pornește `PAUSED_AUTO`, numește segmentele deschise `INCOMPLETE` și are `offlineIncome: 0`, `offlineXp: 0`. Compania este reconstruită prin replay real în ledgerul 268 și jurnalul 269; un al doilea import are ΔXP 0, Δ daily 0 și același revenue. Shell-ul are butoanele native „Salvează”/„Încarcă”, cu focus, Tab și Escape în suprafața de fișier și zero listeneri globali.

- Autosave: 900 tick-uri; portul `persistence` este prezent în shell.
- Fișier: `self-driving-academy-live-<stamp>.sdasave`, checksum SHA-256, preview + confirmare.
- Reload: `PAUSED_AUTO`, segment anterior `INCOMPLETE`, fără venit offline.
- Companie/daily/XP/profil: restaurare împreună; al doilea import nu dublează nimic.
- Probe: raport determinist `npm run save:live` și browser `npm run save:live:probe`.

**Dovezi:** [raport determinist](../Docs/Evidence/278-live-persistence/report.json), [proba de browser](../Docs/Evidence/278-live-persistence/browser.json), [README dovezi](../Docs/Evidence/278-live-persistence/README.md).

**Documentație:** [Salvare și import/export](15-salvare-si-import-export.md) · [Savefile și integritate](29-savefile-si-integritate.md) · [Contracte de performanță](25-performanta-contracte-si-benchmark.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [278](../PBI/README.md) · **Dependențe:** 260, 266, 276.

**Stare:** Done la 27 noiembrie 2026. Autosave-ul, reload-ul, export/import și rollback-ul sunt verificate; snapshot-ul 206 complet și IndexedDB rămân în afara scope-ului.

### 279 — Setări, remapare taste și slidere de control/stil în joc

**Ce lipsește:** Butonul „Setări” din start și pauză face `console.log`; panourile de setări, remapare și slidere nu sunt montate.

- Butonul „Setări” din ecranul de start și meniul de pauză este TODO.
- Nu există panoul de unități, cameră, confort, grafică și audio montat.
- Nu există remapare de taste cu detectarea conflictelor.
- Nu există sliderele de control (7) și stil (8) montate.
- Nu există aplicarea `MANUAL_TUNING` prin bariera 205 și activarea 110.
- Nu există resetare cu confirmare și nici separarea setărilor de profil.

**Documentație:** [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Reglaje HUD și cameră](27-reglaje-hud-si-camera.md) · [Setările jocului](game-settings.md) · [Remaparea comenzilor](key-remapping.md) · [Accesibilitatea interfeței](ui-accessibility.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [279](../PBI/README.md) · **Dependențe:** 260.

### 280 — Camera first-person din poziția șoferului

**Ce lipsește:** Există doar camera de urmărire; `C` și camera first-person din scaunul șoferului nu sunt montate.

- Nu există binding `C` în compunerea live.
- Camera V3 este third-person/character; nu există ancoră în scaunul șoferului.
- Nu există tranziție între camere la intrare/ieșire sau schimbarea vehiculului.
- Nu există FOV/offset din setări aplicate camerei first-person.
- Nu există ocluzie și clipping pentru caroserie în first-person.
- Nu există probă în browser pe ambele backenduri.

**Documentație:** [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Reglaje HUD și cameră](27-reglaje-hud-si-camera.md) · [Camera vehiculului](vehicle-camera.md) · [Input de tastatură](keyboard-input.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [280](../PBI/README.md) · **Dependențe:** 260, 263.

### 281 — Minimapa, harta de flotă și HUD-ul complet de joc

**Ce lipsește:** HUD-ul live are doar viteză și mod; minimapa, ruta, markerii de flotă, obiectivul și sesiunea lipsesc.

- Nu există minimapă montată în joc.
- Nu există markeri pentru taxiuri/civili, rută, pickup/dropoff sau incidente.
- Nu există obiectivul curent, sesiunea sau starea cursei în HUD.
- Nu există hinturi contextuale pentru intrare, mod și recuperare.
- Nu există layout responsive și verificarea suprapunerilor.
- Nu există o probă vizuală la 1280×720 și pe zoom.

**Documentație:** [Interfață, cameră și control](08-interfata-camera-si-control.md) · [Reglaje HUD și cameră](27-reglaje-hud-si-camera.md) · [Minimapa](minimap.md) · [HUD](hud.md) · [Layout responsive](responsive-layout.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [281](../PBI/README.md) · **Dependențe:** 260, 263.

### 282 — Fizica Rapier live pentru jucător și AI

**Ce lipsește:** Mașina condusă folosește un adaptor cinematic, nu Rapier; nu există roți, suspensie, daune sau recuperare fizică în joc.

- Compunerea live folosește `driveVehicle` cinematic, nu adaptorul Rapier 022/024.
- Nu există corpuri fizice, roți, suspensie sau contacte reale în joc.
- Nu există daune, avarii sau recuperare fizică în compunerea live.
- Nu există paritate player/AI pe aceeași comandă și aceeași suprafață.
- Nu există calibrare sedan/compact în jocul live.
- Nu există o probă de browser cu impact, frânare și revenire fără penetrare.

**Documentație:** [Vehicule și fizică](05-vehicule-si-fizica.md) · [Adaptorul fizic](physics-adapter.md) · [Controllerul vehiculului](vehicle-controller.md) · [Dinamica roților](wheel-dynamics.md) · [Daunele vehiculului](vehicle-damage.md) · [Recuperarea vehiculului](vehicle-recovery.md) · [Calibrarea fizicii](physics-calibration.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [282](../PBI/README.md) · **Dependențe:** 260, 262.

### 283 — Regulile de trafic live: semafoare, STOP, prioritate, yield și benzi

**Ce lipsește:** Semaforii sunt randați, dar traficul live are `signals: []`; STOP-ul este decorativ, iar prioritatea, yield-ul și schimbările de bandă nu sunt active.

- `civil-traffic` trimite `signals: []` și `completeness.signals: false`; niciun vehicul nu oprește la roșu.
- Semnele STOP sunt decorative, nu reguli de intersecție.
- Nu există prioritate, yield, conflict de intersecție sau blocaj de rețea în joc.
- Nu există schimbări de bandă, depășiri sau cooldown în traficul live.
- Nu există încălcări observabile pentru jucător și nici consecințe în review.
- Nu există o probă de browser cu roșu, STOP și conflict.

**Documentație:** [Autonomie și trafic](06-autonomie-si-trafic.md) · [Semaforare](signals.md) · [Politica STOP](stop-policy.md) · [Regulile STOP](stop-rules.md) · [Prioritate](priority-rules.md) · [Yield](yield-policy.md) · [Schimbarea benzii](lane-change-policy.md) · [Blocaj și reintrare](blocked-recovery.md) · [Conflictele intersecțiilor](intersection-conflicts.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [283](../PBI/README.md) · **Dependențe:** 260, 262, 282.

### 284 — Traficul civil complet autonom și preluarea oricărei mașini

**Ce lipsește:** Traficul AI live folosește doar cruise/following, nu respectă semafoare și nu poate fi preluat; nu este autonomia documentată.

- Traficul civil live are context incomplet (`signals: []`, fără obstacole/zone).
- Nu folosește semafoare, STOP, prioritate, yield, benzi sau recuperare.
- Nu poate fi preluat de jucător; `requestEntry` îl refuză.
- Nu există reconcilierea rutei la preluare și nici reluarea ei la ieșire.
- Nu există paritate taxi/civil pentru profilul comun și pentru moduri.
- Nu există o probă de browser cu preluarea unui civil AI.

**Documentație:** [Flotă și curse](07-flota-si-curse.md) · [Traficul civil](civil-traffic.md) · [Traficul AI din browser](browser-ai-traffic.md) · [Schimbarea vehiculului](vehicle-switch.md) · [Cursa completă și intervenția](manual-trip.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [284](../PBI/README.md) · **Dependențe:** 262, 283.

### 285 — Decor destructibil, feedback audio și replay în joc

**Ce lipsește:** Decorul destructibil 227, feedbackul audio 228 și replay-ul nu sunt conectate la compunerea din browser.

- Decorul destructibil 227 nu este conectat la compunerea live.
- Nu există impact, fragmente, sunet sau reset al decorului.
- Nu există audio de motor, coliziune, frânare sau mediu în joc.
- Nu există replay pentru distrugeri și reseturi.
- Nu există plafoane pentru fragmente, voci și obiecte.
- Nu există o probă vizuală/audio pentru distrugere și reset.

**Documentație:** [Joacă liberă, Haos și distrugere](26-joaca-libera-haos-si-distrugere.md) · [Asseturi vizual și audio](16-asseturi-vizual-si-audio.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [285](../PBI/README.md) · **Dependențe:** 282, 283.

### 286 — Pietoni, treceri și pericole V2 în lumea live

**Ce lipsește:** Modulele V2 de pietoni, treceri și pericole există, dar nu sunt montate în lumea jucabilă.

- Nu există pietoni în lumea live.
- Nu există treceri active, faze de traversare sau yield observabil.
- Nu există obstacole/pericole cu reacție și evitare.
- Nu există contexte V2 pentru estimatoare și provocări.
- Nu există o probă de browser cu pieton, yield și obstacol.
- Nu există costul pentru 96 de pietoni/obstacole.

**Documentație:** [Extensii și mers pe jos](20-extensii-si-mers-pe-jos.md) · [Autonomie și trafic](06-autonomie-si-trafic.md) · [Zonele de trecere](crosswalk-zones.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [286](../PBI/README.md) · **Dependențe:** 282, 283.

### 287 — Gate V4, QA final, playtest și release verificat

**Ce lipsește:** Gate-ul V4 este singurul task rămas în vechiul board; nu există un release end-to-end, playtest uman sau dovadă hardware.

- Nu există un playtest end-to-end al Academiei în browser.
- FPS/frame pe hardware real rămâne `NOT_VALIDATED`.
- Capturile V4 nu acoperă toate preseturile și backendurile.
- Release checklist-ul vechi are FAIL/NOT_RUN și nu mai corespunde boardului.
- Nu există soak cu toate sistemele montate.
- Nu există o regulă care să împiedice marcarea Done cu criterii deschise.

**Documentație:** [Calitate vizuală V4](30-calitate-vizuala-v4.md) · [Validare și release](18-validare-si-release.md) · [Contracte de performanță](25-performanta-contracte-si-benchmark.md) · [Politica de validare](validation-policy.md) · [Harness de performanță](performance-harness.md) · [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)

**PBI:** [287](../PBI/README.md) · **Dependențe:** 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286.


## Legături istorice

Fișierele din `Docs/Evidence/` păstrează dovezi și linkuri către taskurile 001–258. Acele linkuri sunt **istorice**: fișierele PBI au fost retrase la resetarea boardului, iar dovezile rămân în Git. Validate-Plan exclude `Docs/Evidence` și `Docs/Archive` de la verificarea linkurilor curente, pentru a nu confunda arhiva cu planul activ.

## De ce boardul vechi inducea în eroare

- 236 declara explicit că mișcarea mașinii este un adaptor de jucabilitate, nu fizica Rapier, și că salvarea/HUD-ul final lipsesc.
- 257 declara explicit că LEARNING rămâne în afara scope-ului V3.
- 235 era Done cu C3 `FAIL` și C5 `NOT_RUN` (0/5 playtest uman).
- 162 era `NOT_VALIDATED`, cu 2 FAIL, 1 NOT_VALIDATED și 2 NOT_RUN.
- Documentele de stare erau în urmă: README spunea că nu există lume rutieră, Docs/README spunea că gameplay-ul este planificat, iar manualul descria bootstrapul ca „doar randare”.

## Ordinea recomandată

1. **259–260:** garda de documentație și shell-ul jucabil.
2. **261–265:** sesiuni, flotă, selecție și curse.
3. **266–270:** economie, KPI și companie.
4. **271–274:** moduri, telemetrie, learning și profil.
5. **275–277:** campanie, daily/XP și provocări.
6. **278–281:** persistență, setări, first-person și minimapă.
7. **282–285:** fizică, reguli de trafic, trafic civil complet și distrugere/audio/replay.
8. **286–287:** V2 și gate-ul final.

## Reguli de mentenanță

- Orice schimbare de scope actualizează Docs/21, Docs/31 și PBI/README în același commit.
- `npm run docs:check -- --check` trebuie să treacă înainte de commit; un task mutat fără index, tabel de progres și matrice actualizate este eșec.
- Un task nou primește următorul ID liber; nu se reutilizează 001–258.
- Un task nu se mută în Done fără comportament observabil, dovezi și verificarea din browser/playtest relevantă.
- Un release nu se declară închis cât timp 287 are criterii deschise.
- Documentația de stare se schimbă înaintea codului, nu după el.

## Legături

- [Backlogul curent](../PBI/README.md)
- [Acoperirea pe PBI](21-acoperire-functionalitati.md)
- [Companie: profit și evoluție](32-companie-profit-si-evolutie.md)
- [Produs și scope](01-produs-si-scope.md)
- [Validare și release](18-validare-si-release.md)
- [Manual](manual/README.md)
