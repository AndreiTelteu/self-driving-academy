# Dovezi 059 — cereri de curse și program de scenariu

Status: implementare și validare funcțională locală PASS. Boardul canonic, mutarea în Done și publicarea rămân ale părintelui. Nivel de validare: `functional` (politica 2026-10-08); nu se revendică browser, FPS, soak, Rapier sau hardware.

## Ce s-a livrat

- `src/fleet/ride-demand.ts` — generator determinist de cereri peste programul de scenariu, zonele reale 032 și plannerul 041, cu validare înainte de alocare, coadă plafonată și disposal la zero.
- `src/fleet/index.ts` — export public al contractului.
- `tests/fleet/ride-demand.test.ts` — 11 teste țintite.
- `tests/fleet/ride-demand-fixture.ts` — programul de scenariu și fixture-ul hărții/planner-ului real.
- `tests/fleet/ride-demand-report.ts` + `scripts/run-ride-demand-report.mjs` + `npm run ride:demand` — raportul mașină-citibil, programul executat și tabelul uman.
- [Docs/ride-demand.md](../../ride-demand.md) — API, reguli de program/seed, validare, overflow, limite și ownership.
- [Docs/07-flota-si-curse.md](../../07-flota-si-curse.md) și [Docs/README.md](../../README.md) — paragrafele de integrare.

## Rezultat

- Programul fix are 3 ferestre și 32 de cereri: 12 `NORMAL`, 12 `HIGH`, 8 `LOW`, între tick-urile 0 și 1425.
- Toate cele 32 de ID-uri sunt unice și respectă identitatea 006; ordinea este `spawnTick`, apoi `requestId`.
- Toate originile și destinațiile sunt ID-uri reale din `map.serviceZones`: pickup accesibil `TAXI`, dropoff accesibil `TAXI`, zone distincte.
- Toate cele 32 de cereri sunt validate `READY` de plannerul real 041; raportul numără 32 de căutări.
- Același seed și program produc exact aceleași cereri; alt seed schimbă perechile de zone; inversarea array-ului de ferestre nu schimbă nimic.
- Un singur `advance(1500)` și 215 pași mărunți admit aceeași coadă; un tick descrescător este respins.
- Destinația CIVIL-only, destinația necunoscută, aceeași zonă și ruta blocată sunt respinse înainte de alocare cu motive închise.
- 100 de cereri într-un tick cu `queueLimit: 4` produc 4 admise și 96 de respingeri explicite `QUEUE_OVERFLOW`, fără depășirea plafonului.
- `dispose()` readuce cererile, coada, validările și plannerul deținut la zero; plannerul injectat rămâne al apelantului.
- Sursa nu conține `Date`, `performance.now`, timere, `Math.random`, DOM, Babylon sau Rapier.

Raportul complet are [31/31 verificări](report.json), tabelul uman și programul sunt în [report.md](report.md), iar ieșirea brută a testelor 059 este în [tests.txt](tests.txt).

## Reguli verificate

- **Program și seed:** fereastra dă nivelul, intervalul și numărul; seed-ul alege zonele prin `deriveScenarioSeed` + eșantioane adresate de `windowId` + ordinal. Ordinea array-ului de ferestre este canonicizată.
- **Tick de apariție:** fiecare cerere are un tick în `[startTick, endTick)`, calculat cu cât/rest, fără precizie pierdută; `advance` nu admite niciodată o cerere viitoare.
- **Identitate:** `createStableId('ride-request', namespace, [windowId, rNNNN])`; duplicatele de `windowId` sunt respinse, iar ID-urile nu depind de seed sau de ordinea de admitere.
- **Zone reale:** nu există o listă paralelă de zone; ID-urile sunt exact cele din harta 032, iar `plan.mapId` trebuie să coincidă cu `map.mapId`.
- **Validare înainte de alocare:** `UNKNOWN_ORIGIN`, `UNKNOWN_DESTINATION`, `NOT_PICKUP_ZONE`, `NOT_DROPOFF_ZONE`, `ACCESS_MISMATCH`, `SAME_ZONE`, `NO_ROUTE` sau `READY`; numai `READY` intră în coadă.
- **Planner real:** fiecare cerere validă este verificată cu `findRoute` 041; `routeStatus`, costul și numărul de benzi sunt păstrate în validare.
- **Coadă plafonată:** FIFO după `spawnTick` și `requestId`, maximum 64; politica explicită `REJECT_NEWEST` nu resurrectează cererile respinse.
- **Fără ceas/renderer:** sursa nu citește timp de perete și nu importă DOM/Babylon/Rapier; testul rulează cu `Date.now` schimbat și obține același rezultat.
- **Ownership:** disposal idempotent la zero; plannerul construit intern este eliberat, cel injectat nu.

## Comenzi și rezultate exacte

```powershell
volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run lint
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check
# All matched files use Prettier code style! exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture
# Architecture imports: PASS (183 TypeScript files); negative probes 6+4+3; exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog
# Parameter catalog is synchronized. exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm test
# tests 1190, pass 1190, fail 0 (baseline 1179/1179 înainte de 059)

volta run --node 24.21.0 --npm 11.19.0 -- npm run ride:demand -- --check
# SUMMARY checks 31/31, requests 32, overflow 96, overall PASS
# Ride demand report is current: Docs/Evidence/059-ride-demand/report.json
```

Logul complet al comenzilor este în [checks.txt](checks.txt). Rularea fără `--check` rescrie [report.json](report.json) și [report.md](report.md).

## Limite

- Nu este dispecerul 060: nu alege taxiuri, nu rezervă vehicule și nu calculează ETA. Coada este doar intrarea validată pentru 060.
- Validarea de rută este un snapshot la crearea generatorului. 060 trebuie să replanifice la asignare, deoarece blocaje, trafic și versiuni de graf/cost se pot schimba.
- Nu implementează lifecycle-ul 061–063, pickup/dropoff fizic, review-uri, revenue sau XP.
- Nu creează corpuri Rapier, mesh-uri, materiale, listeners sau timere; compoziția și randarea rămân composition root.
- Raportul este o probă funcțională deterministă, nu o măsurătoare de FPS/GPU/Rapier/hardware.
