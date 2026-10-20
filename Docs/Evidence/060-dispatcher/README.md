# Dovezi 060 — dispecerizare după disponibilitate și cost

Status: implementare și validare funcțională locală PASS. Boardul canonic, mutarea în Done și publicarea rămân ale părintelui. Nivel de validare: `functional` (politica 2026-10-08); nu se revendică browser, FPS, soak, Rapier sau hardware.

## Ce s-a livrat

- `src/fleet/dispatcher.ts` — dispecer determinist peste registry-ul real 057, coada reală 059 și plannerul real 041: cost taxi→pickup la asignare, replanificare pickup→dropoff, revendicare/eliberare explicită, motive închise și buget per pas.
- `src/fleet/index.ts` — export public al contractului.
- `tests/fleet/dispatcher.test.ts` — 11 teste țintite.
- `tests/fleet/dispatcher-fixture.ts` — flota 057 reală, harta 032, graful 033, plannerul 041, coada 059 și sursa de poziții mutabile.
- `tests/fleet/dispatcher-report.ts` + `scripts/run-dispatcher-report.mjs` + `npm run fleet:dispatch` — raportul mașină-citibil, simularea executată și tabelul uman.
- [Docs/dispatcher.md](../../dispatcher.md) — API, disponibilitate, cost/departajare, replanificare, coadă, eliberare, limite și ownership.
- [Docs/07-flota-si-curse.md](../../07-flota-si-curse.md) și [Docs/README.md](../../README.md) — paragrafele de integrare.

## Rezultat

- Simularea reală: 24 de taxiuri și 20 de civili din registry-ul 057, 32 de cereri din programul 059, 21 de taxiuri deservibile după marcarea a 3 ca `BLOCKED`/`DAMAGED`/`OFFLINE`.
- Toate cele 32 de cereri sunt asignate exact o dată; 32 de revendicări unice, 0 taxiuri cu două cereri simultane, maximum 2 revendicări concurente (sub plafonul de 21 de taxiuri deservibile), 32 de eliberări explicite.
- Taxiurile `BLOCKED`, `DAMAGED` și `OFFLINE` nu apar niciodată în asignări; civilii nu sunt candidați.
- Fiecare asignare face 1 replanificare pickup→dropoff plus câte o căutare taxi→pickup pentru candidați: 692 de căutări 041 reale. Costurile înregistrate (`pickupCostSeconds`, `tripCostSeconds`) coincid 32/32 cu interogări 041 proaspete, nu cu snapshotul 059.
- Costul minim este ales dintr-o scanare completă, iar egalitatea este departajată de ID-ul stabil al taxiului, independent de ordinea din registry sau de ordinea de inserare a pozițiilor.
- Snapshotul 059 rămas `READY` este ignorat: după blocarea benzii de dropoff, asignarea produce `TRIP_UNREACHABLE` cu `routeStatus: BLOCKED`, zero asignări și cererea este raportată explicit.
- Lipsa taxiului produce `NO_TAXI` cu zero căutări și cerere păstrată în coadă; lipsa poziției produce `NO_POSITION`; poziția blocată produce `PICKUP_UNREACHABLE` cu cererea păstrată în coadă.
- Bugetul per pas este respectat: cu 30 de căutări configurate, un pas asignează 1 cerere, face 25 de căutări și raportează `ROUTE_BUDGET_EXHAUSTED` pentru următoarea.
- Fiecare motiv de eliberare are un statut următor explicit: `COMPLETED`/`CANCELLED`/`FAILED` → `AVAILABLE`, `TAXI_BLOCKED` → `BLOCKED`, `TAXI_DAMAGED` → `DAMAGED`, `TAXI_REMOVED` → `OFFLINE`.
- `dispose()` readuce asignările, revendicările, jurnalele și contoarele la zero; registry-ul (24 taxiuri), coada (32 cereri) și plannerul injectat rămân active.
- Sursa nu conține `Date`, `performance.now`, timere, `Math.random`, DOM, Babylon sau Rapier.

Raportul complet are [28/28 verificări](report.json), tabelul uman și simularea sunt în [report.md](report.md), iar ieșirea brută a testelor 060 este în [tests.txt](tests.txt).

## Reguli verificate

- **Cost real, nu snapshot:** alegerea folosește `findRoute(taxi→pickup)` 041 la asignare; `validation(requestId).costSeconds` din 059 nu este citit. Etapa pickup→dropoff este replanificată și poate respinge cererea.
- **Disponibilitate explicită:** numai taxiurile 057 cu status `AVAILABLE` sunt candidate; `ASSIGNED` este deținut de dispecer, iar `BLOCKED`/`DAMAGED`/`OFFLINE` și civilii sunt excluși.
- **Fără dublă asignare:** o revendicare este indexată simultan după taxi și după cerere, iar cererea este scoasă FIFO din coada 059 numai după ce taxiul a fost ales; `dequeue()` este verificat că a returnat exact capul așteptat.
- **Departajare deterministă:** cost strict mai mic, apoi ID-ul lexicografic al taxiului; candidații sunt sortați după ID, iar scanarea este „tot sau nimic”.
- **Revendicare/eliberare explicită:** `release` cere un motiv închis și un tick ≥ asignare, actualizează statutul și păstrează un jurnal plafonat; `setTaxiStatus` refuză un taxi revendicat.
- **Muncă mărginită:** maximum 4 asignări implicite per pas (16 override), 30 de candidați și 128 de căutări 041 (256 maximum); un buget insuficient nu produce o alegere parțială.
- **Fără ceas/renderer:** sursa nu citește timp de perete și nu importă DOM/Babylon/Rapier; testul rulează cu `Date.now` schimbat și obține aceleași asignări.
- **Ownership:** disposal idempotent la zero; registry-ul, coada și plannerul injectate nu sunt eliberate.

## Comenzi și rezultate exacte

```powershell
volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run lint
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check
# All matched files use Prettier code style! exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture
# Architecture imports: PASS (184 TypeScript files); negative probes 6+4+3; exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog
# Parameter catalog is synchronized. exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm test
# tests 1201, pass 1201, fail 0 (baseline 1190/1190 înainte de 060)

volta run --node 24.21.0 --npm 11.19.0 -- npm run fleet:dispatch -- --check
# SUMMARY checks 28/28, assignments 32, searches 692, overall PASS
# Dispatcher report is current: Docs/Evidence/060-dispatcher/report.json
# exit 0
```

Logul complet al comenzilor este în [checks.txt](checks.txt). Rularea fără `--check` rescrie [report.json](report.json) și [report.md](report.md).

## Limite

- Nu este lifecycle-ul 061–063: nu creează `Ride`, pickup/dropoff fizic, tarif, review, revenue sau XP.
- Nu mișcă taxiurile și nu actualizează poziția după asignare; `positions.laneFor` este un port al compoziției 024/058, iar ETA live/HUD rămân 064–065.
- Politica de coadă este FIFO strict: un cap de coadă imposibil (`PICKUP_UNREACHABLE`, `NO_POSITION`, `NO_TAXI`) blochează cererile din spate până devine asignabil sau este respins permanent. Nu există reordonare ascunsă sau expirare inventată.
- Un taxi avariat sau blocat în timpul cursei este eliberat explicit de apelant cu `release(..., 'TAXI_DAMAGED' | 'TAXI_BLOCKED', tick)`; consecințele cursei aparțin lifecycle-ului.
- Nu prezice traficul și nu validează fezabilitatea dinamică a manevrei; blocajele, traficul și versiunile sunt intrări explicite.
- Raportul este o probă funcțională deterministă, nu o măsurătoare de FPS/GPU/Rapier/hardware.
