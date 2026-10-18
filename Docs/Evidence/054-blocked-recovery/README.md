# Dovezi PBI054 — blocaje, rerutare și reintrare după manual

Nivel `targeted` (Docs/validation-policy.md): corectitudine izolată + lanț real 219/044/045/033/041 +
cost local înainte/după + memorie (performance_checks `simulation`, `memory`). Nu se pretinde FPS,
hardware, plasare fizică nativă sau bugetul jocului integrat.

## Rezultat implementare

Politica 054 detectează lipsa de progres din viteza longitudinală autoritativă plus localizarea reală
033 și o transformă în starea BLOCKED a 045 (`BehaviorFacts.routeBlocked`), cu un motiv distinct și o
politică de recuperare explicită: `WAIT` mărginit, `REQUEST_REROUTE` către plannerul real 041 (set de
benzi blocate + `costVersion` derivat, aplicat prin portul real 219), `REQUEST_RECOVERY` a cărui dovadă
de drum este exact `RecoveryRoadProof` a 030 (derivată din traseul directionat 033) sau `STAY_BLOCKED`
cu limitarea numită. Reintrarea după MANUAL localizează banda reală, produce un plan `DRIVE_TO_LANE`
sau o cerere explicită 030 și nu are nicio cale de scriere a pozei autoritative, deci nu teleportează
implicit vehiculul. Escaladarea într-un episod este monotonă, iar eliberarea cere un prag de progres
declarat, ceea ce elimină oscilația blocked↔recovering la granularitatea feliilor de decizie.

## Verificări executate și rezultat

- `npm test` — **840 PASS / 0 FAIL** (832 existente + 7 teste izolate 054 + 1 test de lanț real), la
  commit `9038013e1188022e1854012b3d2acb025a060081`, runtime `v24.21.0` ([tests.txt](tests.txt)).
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture`
  (`141 TypeScript files`), `npm run check:parameter-catalog` — exit 0 ([checks.txt](checks.txt)).
- Testele PBI054 izolate ([tests.txt](tests.txt)) — **7 PASS / 0 FAIL**: abstinență la observație
  lipsă/învechită fără fapte inventate, plafonul cozii (standstill peste prag, apoi rerutare reală,
  mărginită), banda blocată înainte care schimbă efectiv traseul prin plannerul 041, toate cauzele
  structurale distinse (inclusiv „fără succesor fezabil" vs. sosire validă), histerezis
  (blip de progres nu resetează episodul, eliberare doar după pragul declarat) și reintrarea
  imposibilă (eșec explicit, mărginit, fără buclă și fără succes mut).
- Lanț real 219/044/045/033/041: subiectul blocat structural la tick3 → `BLOCKED`/`BLOCKED_ROUTE` în
  045, cerere de rerutare aplicată plannerului real 041 și pas cu pas prin portul real 219
  (`['lane-in','lane-b','lane-out']`, deci traseul chiar se schimbă), episod eliberat la trecerea
  fizică la 8 m/s, apoi fereastră MANUAL (045 nu păstrează nicio decizie AUTO) și plan de reintrare
  `DRIVE_TO_LANE` cu decalajul lateral real 1.4 m și poza autoritativă neschimbată.

## Probe înainte/final și costul nou

Native, secvențial și singur (`PBI_AUTONOMY_CPU_LEASE=parent-approved-exclusive`), un singur braț per
invocare:

```powershell
volta run --node 24.21.0 node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-autonomy-policies.mjs --pbi 054 --before
volta run --node 24.21.0 node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-autonomy-policies.mjs --pbi 054 --after
```

- Fixture: `054-targeted-blocked-v1` — coridor real 033 cu două continuări legale (lane-a scurtă,
  lane-b lungă), context 044 real, FSM 045 real, planner 041 real și portul de rutare 219 real;
  200 decizii pe repetiție, coadă în standstill eliberată fizic după 600 tick-uri.
- Protocol: 1 încălzire + 5 repetări; cost pe fiecare tick de decizie (10 Hz) după 180 tick-uri de
  încălzire (mediana celor 5 repetări). Toate repetările sunt păstrate în JSON.
- Distribuții (ms/decizie): BEFORE p50 0.0171, p95 0.0353, p99 0.0593 —
  AFTER p50 0.0351, p95 0.0502, p99 0.1484.
- **Cost suplimentar** (AFTER − BEFORE): p50 **+0.0179**, p95 **+0.0148**, p99 **+0.0759** ms/decizie.
  Repetările AFTER p95: 0.0552 / 0.0483 / 0.0502 / 0.0669 / 0.0420.
- Fără brațul politicii nu se încarcă modulul nou: BEFORE este exact același fixture, aceeași cadență
  și același planner, iar apelantul cunoaște banda blocată și înlocuiește versiunea o singură dată.
- Determinism măsurat: fiecare repetiție are 200 decizii, 80 felii blocate, 2 cereri de rerutare
  mărginite, alternativă legală acceptată și checksum identic `114128`.

Buget ([Docs/performance-budgets.json](../../performance-budgets.json), `budgetVersion` `203-initial-1`,
`calibration: PROVISIONAL_UNCALIBRATED`): o decizie rulează la 10 Hz, deci costul adăugat p95 de
0.0148 ms/decizie se amortizează la ≈0.0025 ms per tick de 60 Hz, adică sub 0.05 % din bugetul absolut
`authoritativeTickP95Ms` (5.5 desktop / 8 laptop); p95 absolut al brațului AFTER (0.0502 ms/decizie)
este sub 1 % din același buget. Pragul de regresie relativă (>10 % **și** >1 ms p95, minimum 3 din 5
confirmări) nu este atins: creșterea absolută este ≈0.015 ms, cu mult sub 1 ms. Bugetul absolut rămâne
aplicabil; această probă locală nu certifică bugetul integrat.

## Memorie

[after.json](after.json) conține 20 de cicluri `build → drive → dispose → gc → counters`
(`gcAvailable: true`, `heapUsed` 12.54–12.86 MB după `gc`) cu contoarele existente: `behavior.getStats()`
și `context.getStats()` pentru 044, plus `blockedRecovery.getStats()` al modulului nou. Modulul 054 nu
deține nicio hartă de actori, episoade sau decizii: latch-ul este al apelantului și are nouă câmpuri
primitive, iar după `dispose()` contoarele raportează `retainedActors: 0`, `retainedEpisodes: 0`,
`retainedHistory: 0`. Nu se inventează un agregat de memorie.

## Reproducere și limite

- [before.json](before.json), [after.json](after.json) și jurnalele brute
  [before-run.txt](before-run.txt)/[after-run.txt](after-run.txt) păstrează commit-ul
  `9038013e1188022e1854012b3d2acb025a060081`, CPU (`AMD Ryzen 7 7735U with Radeon Graphics`),
  OS (`win32 10.0.26300`), runtime (`v24.21.0`), `fixtureVersion` și protocolul
  (`warmupTicks` 180, `measuredTicks` 1200, `repetitions` 5, `cadenceHz` 10, `tickHz` 60), plus
  `fixtureSourceSha256` `f5994af678a467c249f014af840eba36e859bd57c310e3cb50915d616677d5c5`.
  Scrierea folosește `flag: "wx"`; o reluare cere ștergerea explicită a dovezii vechi.
- Limite: pragurile de standstill/asteptare/cooldown/eliberare și toleranța laterală de reintrare sunt
  constante înghețate provizorii, nu parametri de profil, și trebuie calibrate pe harta reală; setul de
  benzi blocate al unei cereri este plafonat la 64. Modulul cere, nu execută: mutarea fizică a
  vehiculului rămâne a lanțului 046–049/024 (`DRIVE_TO_LANE`), plasarea fizică rămâne a portului nativ
  030 (`REQUEST_RECOVERY`, care la rândul lui cere un scaun MANUAL/LEARNING explicit, deci hostul
  decide dacă escaladarea este permisă), iar rerutarea rămâne a plannerului 041 și a cozii 219.
  Escaladarea 030 nu este exercitată aici pe o lume Rapier reală; se verifică descriptorul și dovada de
  drum față de contractul 030. Ponderea de trafic 041 nu este modificată, deci o coadă cauzată de
  congestie este doar re-interogată. Proba este Node CPU-only pe o mașină de tip laptop, fără browser,
  GPU, FPS sau soak; toate etichetele de calibrare rămân provizorii, iar proba de browser rămâne
  neexecutată și este consemnată ca atare.
