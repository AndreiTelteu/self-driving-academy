# PBI 137 — indicatori de serviciu și expunere

Implementat în `src/experiments/metric-service.ts` (`137-metric-service-v1`) și
`src/app/metric-service.ts` (`137-metric-service-app-v1`), exportate aditiv prin
`src/experiments/index.ts` și `src/app/index.ts`. Modulul de domeniu acumulează exclusiv contoare, sume
și limite min/max din evenimente idempotente; composition root-ul compune sursele reale 061/028/065 și
un adaptor pentru valorile `CityMetric` 082, fără să atingă fizica, cursele, profilul, camera sau
store-ul.

## Contract

- `createMetricService({ retainedKeys? })` — `ingest`, `ingestMany`, `snapshot`, `getStats`, `reset`,
  `dispose`.
- Evenimente închise: `RIDE_TERMINAL` (061), `VEHICLE_DISTANCE`, `BLOCKED_INTERVAL` (065),
  `COLLISION` (028), `VIOLATION` (086 opportunity). Fiecare are `eventId` de idempotență.
- `snapshot({ fleet, tick, simulatedSeconds, distanceAvailable, opportunities? })` — 17 indicatori cu
  unitate, stare, valoare, eșantion și motiv închis.
- `readMetricSnapshot({ metrics, fleet }, frame)` — snapshot înghețat, fără rescanare.
- `ingestRideTerminal(service, ride, distanceM?)` — doar curse terminale 061, idempotent după
  `(rideId, state)`; o cursă activă este sărită cu `null`.
- `ingestCollision(service, incident)` — incident 028 real, idempotent după `incidentId`.
- `ingestBlockedInterval(service, { entry, blockedSeconds })` — fapt 065 `TRAFFIC_BLOCK`/
  `IMMOBILIZATION`, numai cu durată reală; altfel skip explicit.
- `toCityDashboardMetrics(snapshot)` — `completedRides`, `averageRideSeconds`, `totalDistanceM`,
  `collisions`, `blockages`; încălcările și confortul rămân `SOURCE_MISSING` pentru 138/139.

## Reguli demonstrate

- **Flota întreagă**: numitorii vin din `fleet.counts()` — 24 taxiuri + 40 civile, inclusiv vehicule
  ascunse/neselectate. Snapshotul nu apelează `list()` sau `get()`; testul folosește un port cu capcane
  care ar eșua dacă ar fi citite. `fleetVehicleSeconds = vehicles × simulatedSeconds`.
- **Expunere zero**: `blockedFraction` și `blockedSeconds` sunt `UNAVAILABLE` cu `value: null` și
  `reason: 'NO_EXPOSURE'`; `completionRate` este `UNAVAILABLE`/`NO_RIDES`. O flotă goală produce
  `NO_FLEET`.
- **Zero real**: 0 coliziuni cu distanță măsurată este `AVAILABLE` cu `value: 0`; 0 curse finalizate
  este un `0` real, nu un `0` care ascunde lipsa numitorului.
- **Distanță**: `distanceAvailable: false` face indisponibile `totalDistanceM`, `vehicleKilometres`,
  `rideDistanceM` și rata la 100 km (`NO_DISTANCE`). `totalDistanceM` este odometrul flotei;
  `rideDistanceM` este separat ca să nu se numere aceeași deplasare de două ori.
- **Idempotență**: același `eventId` este `DUPLICATE` și nu schimbă niciun acumulator; memoria este
  plafonată la 8192 chei FIFO (`droppedKeys` raportează eliminările). Payloadul este parsat înainte de
  deduplicare.
- **Incremental**: fără istoric de evenimente; `getStats().historyScans` și `snapshot.historyScans`
  sunt structural `0`. 101 snapshoturi peste aceleași date produc indicatori identici.
- **Ordine**: evenimentele pot veni în orice ordine; sumele/numărătorile/min/max dau rezultat identic,
  iar `minTick`/`maxTick` raportează intervalul acceptat.
- **Unități**: `count`, `seconds`, `metres`, `km`, `ratio`, `per100km`, `percentage`; fiecare
  identitate are exact o unitate, iar `completionRate` este procent, `collisionsPer100VehicleKm` este
  `per100km`.

## Dovezi

`tests/experiments/metric-service.test.ts` — 20 teste, 20 pass. Acoperă contractul închis,
deduplicarea, toate tipurile de evenimente, expunere zero vs zero real, numitorii pe flota 24+40,
lipsa curselor/distanței, rata de finalizare, mediile, rata la 100 km, fracția blocată, ordinea
inversă, evenimente invalide/negative/duplicate, memoria mărginită, `historyScans = 0`, snapshot
înghețat, reset/dispose idempotent, adaptoarele reale 061/028/065 și forma 082.

`tests/experiments/metric-service-report.ts` + `scripts/run-metric-service-report.mjs` — 7 scenarii,
44 verificări, 44 PASS. Transcript: [report.json](report.json) / [report.md](report.md).

## Probă locală de debit (provizorie)

Măsurată pe această mașină de către `npm run metrics:service`, într-o singură rulare secvențială, fără
paralelizare:

| Măsurătoare | Valoare |
| --- | ---: |
| Evenimente mixte ingerate | 20 000 |
| Timp ingest | 47,1481 ms |
| Cost per eveniment | 0,002357405 ms (≈2,36 µs) |
| Evenimente/secundă | 424 195 |
| Snapshoturi citite | 2 000 |
| Timp snapshoturi | 6,2841 ms |
| Cost per snapshot | 0,00314205 ms (≈3,14 µs) |

Valorile sunt locale și provizorii: nu sunt buget, FPS sau dovadă hardware și nu certifică jocul
integrat. `--check` compară transcriptul cu blocul `performance` anulat, ca să rămână un test real de
actualitate fără să pretindă reproductibilitate hardware.

## Comenzi (rulate din rădăcină)

| Comandă | Rezultat |
| --- | --- |
| `npm test` (preflight, înainte de modificare) | exit 0, `tests 1533`, `pass 1533`, `fail 0` |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!” |
| `npm run check:architecture` | exit 0, `Architecture imports: PASS (232 TypeScript files)` |
| `npm test` (după modificare) | exit 0, `tests 1553`, `pass 1553`, `fail 0` |
| `npm run metrics:service` | exit 0, `SUMMARY checks 44/44, scenarios 7, overall PASS` |
| `npm run metrics:service -- --check` | exit 0, `Metric service report is current` |

## Fișiere

Adăugate: `src/experiments/metric-service.ts`, `src/app/metric-service.ts`,
`tests/experiments/metric-service.test.ts`, `tests/experiments/metric-service-report.ts`,
`scripts/run-metric-service-report.mjs`, `Docs/metric-service.md`,
`Docs/Evidence/137-metric-service/{README.md,report.json,report.md}`.

Modificate aditiv: `src/experiments/index.ts`, `src/app/index.ts`, `package.json` (un script),
`Docs/README.md`, `Docs/14-experimente-si-indicatori.md`.

## Limite

- Fără UI, captură de browser, FPS, GPU sau măsurătoare hardware; proba de debit este locală și
  provizorie.
- Fereastra de idempotență este mărginită (8192 chei FIFO). O rejucare a unui eveniment foarte vechi,
  ieșit din fereastră, poate fi numărată din nou; serviciul nu persistă cheile între sesiuni.
- Istoricul 065 nu conține durata blocajului, deci hostul trebuie să o măsoare; altfel
  `ingestBlockedInterval` sare explicit și nu inventează secunde.
- Numitorul de oportunități este declarat de apelantul 086 la snapshot; PBI-ul nu clasifică singur
  oportunitățile și nu decide vinovăția (138/139).
- Nu persistă ledgerul, review-urile sau bucketurile istorice (209/210) și nu modifică contractul 082.
- PBI-ul rămâne în responsabilitatea orchestratorului pentru board și Git; acest raport nu îl mută în
  `Done` și nu rulează validatorul de board.
