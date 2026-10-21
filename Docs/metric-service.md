# Indicatori de serviciu și expunere 137

Status: implementare și validare funcțională locală (`targeted`). `src/experiments/metric-service.ts`
deține contractul, parserul închis și acumulatorii incrementali; `src/app/metric-service.ts` compune
sursele reale 061/028/065 și adaptorul pentru tabloul 082. Modulul nu creează curse, incidente,
blocaje, distanțe sau oportunități și nu atinge fizica, profilul, camera sau store-ul.

## Ce calculează

| Indicator | Unitate | Formulă | Numitor / eșantion |
| --- | --- | --- | --- |
| `completedRides` | `count` | curse terminale `COMPLETED` | fapte, fără numitor |
| `failedRides` | `count` | curse terminale `FAILED` | fapte, fără numitor |
| `cancelledRides` | `count` | curse terminale `CANCELLED` | fapte, fără numitor |
| `terminalRides` | `count` | `completed + failed + cancelled` | fapte, fără numitor |
| `completionRate` | `percentage` | `completed / terminalRides × 100` | curse terminale; `NO_RIDES` la zero |
| `averagePickupSeconds` | `seconds` | `Σ pickupSeconds / eșantioane` | curse cu durată de pickup |
| `averageTripSeconds` | `seconds` | `Σ tripSeconds / eșantioane` | curse cu durată de cursă |
| `totalDistanceM` | `metres` | `Σ VEHICLE_DISTANCE.distanceM` | odometrul flotei; `NO_FLEET`/`NO_DISTANCE`/`NO_EXPOSURE` |
| `vehicleKilometres` | `km` | `totalDistanceM / 1000` | același numitor ca `totalDistanceM` |
| `rideDistanceM` | `metres` | `Σ RIDE_TERMINAL.distanceM` | curse cu distanță măsurată |
| `blockedIntervals` | `count` | intervale de blocaj acceptate | fapte, fără numitor |
| `blockedSeconds` | `seconds` | `Σ blockedSeconds` | secunde-vehicul blocate |
| `blockedFraction` | `ratio` | `blockedSeconds / (vehicule × simulatedSeconds)` | secunde-vehicul ale flotei |
| `collisions` | `count` | evenimente `COLLISION` | fapte, fără numitor |
| `collisionsPer100VehicleKm` | `per100km` | `collisions / vehicleKilometres × 100` | kilometri-vehicul; `NO_DISTANCE` la zero |
| `violations` | `count` | evenimente `VIOLATION` | fapte, fără numitor |
| `violationsPerOpportunity` | `ratio` | `violations / opportunities` | oportunități 086; `NO_OPPORTUNITIES` la zero |

Două reguli de distanță sunt intenționate:

- `totalDistanceM`/`vehicleKilometres` sunt **odometrul flotei** (`VEHICLE_DISTANCE`). Distanța unei
  curse nu se adună la ele, ca să nu fie numărată de două ori când ambele surse descriu aceeași
  deplasare.
- `rideDistanceM` este suma distanțelor măsurate pe cursele terminale. Este un indicator separat, cu
  propriul eșantion.

## Expunere și numitori

- Numitorii de flotă folosesc **întreaga flotă** din `fleet.counts()`: `vehicles`, `taxis` și
  `civilians`, inclusiv vehiculele ascunse, neselectate sau din afara camerei. Snapshotul nu citește
  `list()`, `get()`, selecția, camera sau o istorie.
- `fleetVehicleSeconds = vehicles × simulatedSeconds`. `simulatedSeconds` este expunerea declarată de
  apelant, nu un ceas intern.
- `opportunities` este numitorul 086 declarat la snapshot. Absent sau zero înseamnă
  `NO_OPPORTUNITIES`, nu o rată perfectă.
- O flotă cu `vehicles = 0` produce `NO_FLEET`; `counts()` trebuie să fie coerent
  (`vehicles = taxis + civilians`), altfel snapshotul este respins.

## Indisponibil vs zero

| Situație | Contract |
| --- | --- |
| `vehicles = 0` | `UNAVAILABLE`, `value: null`, `reason: 'NO_FLEET'` |
| `simulatedSeconds = 0` | `UNAVAILABLE`, `value: null`, `reason: 'NO_EXPOSURE'` |
| nicio cursă terminală / niciun eșantion de durată | `UNAVAILABLE`, `value: null`, `reason: 'NO_RIDES'` |
| `distanceAvailable: false` sau zero kilometri-vehicul | `UNAVAILABLE`, `value: null`, `reason: 'NO_DISTANCE'` |
| `opportunities` absent sau `0` | `UNAVAILABLE`, `value: null`, `reason: 'NO_OPPORTUNITIES'` |
| zero real cu numitor real (ex. 0 coliziuni la distanță > 0) | `AVAILABLE`, `value: 0`, `reason: null` |

Un indicator indisponibil are `value: null` și `sampleSize: null`. Un zero real are `value: 0` și un
`sampleSize` numeric. Numărătorii (curse, coliziuni, încălcări, intervale) sunt fapte cumulative și
rămân `AVAILABLE` cu `0` chiar înainte de prima observație; ratele lor cer un numitor real.

## Evenimente și idempotență

Cinci tipuri închise, fiecare cu `eventId` obligatoriu:

| `kind` | Câmpuri | Reguli |
| --- | --- | --- |
| `RIDE_TERMINAL` | `rideId`, `taxiId`, `state`, `tick`, `pickupSeconds`, `tripSeconds`, `distanceM?` | `state` ∈ `COMPLETED`/`FAILED`/`CANCELLED`; durate finite în `[0, 86 400]`; `distanceM` finit `≥ 0` sau absent |
| `VEHICLE_DISTANCE` | `vehicleId`, `tick`, `distanceM` | `distanceM` finit, strict pozitiv, `≤ 10 000 000 m` |
| `BLOCKED_INTERVAL` | `vehicleId`, `tick`, `blockedSeconds`, `reason` | durată finită, strict pozitivă; `reason` ∈ `TRAFFIC_BLOCK`/`IMMOBILIZATION` |
| `COLLISION` | `vehicleId`, `tick`, `incidentId` | identități mărginite |
| `VIOLATION` | `vehicleId`, `tick`, `opportunityId`, `violationKind` | `violationKind` ∈ `RED`/`STOP`/`YIELD` |

- Parserul este închis: câmpuri necunoscute, valori nefinite, negative, identități peste 1024 code
  units și vocabulare necunoscute sunt `REJECTED` cu un motiv închis
  (`INVALID_SHAPE`, `UNKNOWN_FIELD`, `UNKNOWN_KIND`, `INVALID_IDENTITY`, `INVALID_NUMBER`,
  `LIMIT_EXCEEDED`). Un eveniment respins nu schimbă niciun acumulator.
- `eventId` este cheia de idempotență. Re-ingestia aceluiași `eventId` este `DUPLICATE` și nu dublează
  nimic. Payloadul este parsat înainte de deduplicare, deci un payload invalid rămâne `REJECTED`.
- Memoria de chei este plafonată la `8192` (FIFO, cea mai veche cheie este eliminată prima).
  `droppedKeys` raportează eliminările; o rejucare în afara ferestrei retenției poate fi numărată din
  nou. Apelantul nu reia istoric vechi.
- Tick-urile pot veni în orice ordine. Toate agregatele sunt sume/numărători/min/max, deci snapshotul
  este independent de ordine; `minTick`/`maxTick` raportează intervalul acceptat, fără să impună
  monotonie.

## Agregări incrementale

Serviciul păstrează numai contoare, sume, min/max și setul mărginit de chei. Nu există istoric de
evenimente, iar `snapshot()` citește exclusiv acumulatorii și `fleet.counts()`.

- `getStats().historyScans` este structural `0`.
- `snapshotCalls` numără citirile; un refresh HUD repetat produce același rezultat fără nicio
  rescanare.
- `ingestMany(events)` este calea de lot și întoarce
  `{ events, accepted, duplicates, rejected }`.

## API

```ts
import { createMetricService } from './experiments';
import {
  ingestBlockedInterval,
  ingestCollision,
  ingestRideTerminal,
  readMetricSnapshot,
  toCityDashboardMetrics,
} from './app';

const metrics = createMetricService();

ingestRideTerminal(metrics, ride); // doar curse terminale 061; `null` pentru o cursă activă
ingestRideTerminal(metrics, ride, distanceM); // distanță opțională, niciodată inventată
ingestCollision(metrics, incident); // 028 real, idempotent după `incidentId`
ingestBlockedInterval(metrics, { entry, blockedSeconds }); // 065 real + durată măsurată

const snapshot = readMetricSnapshot(
  { metrics, fleet: registry }, // doar `counts()`
  { tick, simulatedSeconds, distanceAvailable: true, opportunities },
);
const dashboardMetrics = toCityDashboardMetrics(snapshot); // `CityMetric[]` pentru 082
```

`ingestBlockedInterval` sare explicit (`null`) pentru un fapt care nu este `TRAFFIC_BLOCK` sau
`IMMOBILIZATION`, pentru o durată absentă și pentru o durată `≤ 0`. Istoricul 065 nu conține durata
blocajului, deci hostul o măsoară; modulul nu inventează secunde.

## Snapshot

`MetricSnapshot` este înghețat și are câmpuri exacte: `schemaVersion` (`1`), `units` (`SI`),
`version` (`137-metric-service-v1`), `tick`, `simulatedSeconds`, `distanceAvailable`, `fleet`,
`fleetVehicleSeconds`, `opportunities`, `metrics`, `historyScans` (`0`) și `snapshotCalls`.

| Câmp | Regulă |
| --- | --- |
| `fleet` | `{ vehicles, taxis, civilians }` citit din `counts()`, coerent și nenegativ |
| `metrics[].id` | set închis de 17 identități, în ordinea canonică |
| `metrics[].unit` | unitate închisă, obligatoriu cea a identității |
| `metrics[].value` | finit, nenegativ; `null` exact când starea este `UNAVAILABLE` |
| `metrics[].sampleSize` | întreg nenegativ când starea este `AVAILABLE`, `null` altfel |
| `metrics[].reason` | motiv închis doar când starea este `UNAVAILABLE` |

## Adaptorul 082

`toCityDashboardMetrics(snapshot)` produce numai indicatorii deținuți de 137:

| 082 | Sursă 137 | Unitate 082 |
| --- | --- | --- |
| `completedRides` | `completedRides` | `rides` |
| `averageRideSeconds` | `averageTripSeconds` | `s` |
| `totalDistanceM` | `totalDistanceM` | `m` |
| `collisions` | `collisions` | `count` |
| `blockages` | `blockedIntervals` | `count` |

Încălcările și confortul rămân în afara adaptorului (`source: null`), deci 082 continuă să le arate
`SOURCE_MISSING` până la 138/139. Motivele 137 sunt mapate în vocabularul închis 082:
`NO_EXPOSURE`/`NO_RIDES`/`NO_OPPORTUNITIES` → `NO_EXPOSURE`, `NO_DISTANCE` → `SOURCE_MISSING`,
`NO_FLEET` → `NOT_CERTIFIED`. Un `UNAVAILABLE` rămâne `value: null`, niciodată `0`.

## Limite

| Limită | Valoare |
| --- | ---: |
| Chei de idempotență reținute | 8192 |
| Code units per identitate | 1024 |
| Durată maximă per eveniment | 86 400 s |
| Distanță maximă per eveniment | 10 000 000 m |
| Istoric de evenimente păstrat | 0 |
| Scanări de istoric per snapshot | 0 |
| Indicatori în setul închis | 17 |

## Verificare

```powershell
npm test
npm run metrics:service
npm run metrics:service -- --check
```

`tests/experiments/metric-service.test.ts` — 20 de teste: contract închis, deduplicare, toate
tipurile de evenimente, expunere zero vs zero real, numitori pe flota 24+40 cu vehicule ascunse,
lipsa curselor și a distanței, rata de finalizare, mediile, rata la 100 km, fracția blocată, ordinea
inversă a evenimentelor, evenimente invalide/negative/duplicate, memorie de chei mărginită,
`historyScans = 0`, refresh HUD repetat, snapshot înghețat, reset/dispose, adaptoarele reale 061/028/065
și forma 082.

`tests/experiments/metric-service-report.ts` + `scripts/run-metric-service-report.mjs` —
7 scenarii, 44 de verificări. Transcriptul este în
[Docs/Evidence/137-metric-service](Evidence/137-metric-service/README.md). Proba de debit locală
(20 000 de evenimente mixte + 2 000 de snapshoturi) este raportată cu valorile măsurate pe această
mașină și este marcată provizorie: nu este un buget, FPS sau o dovadă hardware.

## Ce NU este

- Nu este 061/028/065: nu creează, nu avansează și nu repară curse, incidente, blocaje sau sănătatea
  flotei.
- Nu este 138/139: nu decide vinovăția, nu clasifică oportunități și nu calculează confortul.
- Nu este 209/210: nu persistă ledgerul, review-urile sau bucketurile istorice.
- Nu este 074/082 UI: nu desenează, nu formatează și nu scrie în DOM; adaptorul întoarce valori
  `CityMetric` validate de contractul 082 existent.
- Nu măsoară FPS, GPU sau hardware și nu certifică performanța jocului integrat.
