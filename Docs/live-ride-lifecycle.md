# Ciclul live al cursei 265: pickup, dropoff, pasager, ETA și HUD

Status: implementare și validare live locală. Contractele fleet sunt pure (fără DOM, Babylon,
renderer sau ceas de perete); compunerea de browser adaugă read-model-urile 147/073 și portul de
markeri. Boardul canonic, mutarea în Done și publicarea rămân ale orchestratorului.

`src/fleet/live-ride-lifecycle.ts` este composition root-ul dintre asignările reale 264 și
lifecycle-ul real 061, pickup-ul 062, dropoff-ul 063 și ETA 064. `src/app/live-ride-composition.ts`
adaugă pasagerul 147 și HUD-ul 073; `src/main.ts` montează portul `rides`, panoul `Curse` și stratul
de markeri proiectați în lume. Nu există un al doilea model de cursă, taxi, zonă, rută, ledger sau
store: fiecare cursă pornește din `dispatcher.assignmentFor(requestId)` și folosește exact zonele,
costurile și traseele asignării 060.

## API

```typescript
const lifecycle = createLiveRideLifecycle({ live, map }); // live = createLiveRides(...)
lifecycle.step({ tick, vehicles, playerVehicleId });
lifecycle.setTaxiStatus(taxiId, 'BLOCKED');
lifecycle.setServiceState('CONGESTED');
lifecycle.snapshot();
lifecycle.stats();
lifecycle.reset({ tick, preserveStats });

const composition = createLiveRideComposition({ live, map, sessionId, worldEpoch, actors });
composition.step(input);
composition.snapshot(); // live + lifecycle + passenger frames + actorRoutes
composition.passenger({ taxiId, tick }); // 147
composition.hud({ taxiId, mode, tick, speedMps }); // 073
composition.actorRoutes(); // 058 route progress keyed by rideId
```

`LiveRideObservedVehicle` cere poziția autoritară 3D și viteza semnată a actorului. Modulul folosește
magnitudinea vitezei pentru pragul de staționare, iar heading-ul este normalizat înainte de ETA;
un tick care scade este refuzat. Nu există `Date`, `performance.now`, `setTimeout`, `setInterval`,
`requestAnimationFrame` sau `Math.random`.

Când este montat portul `actors` (058), compunerea comandă taxiului revendicat ruta reală. Fără port,
contractele 061–064 și dovezile lor rămân neschimbate.

## Execuția rutei pentru taxiurile AI

`CivilTraffic.assignServiceRoute(taxiId, zoneId, tick)` înlocuiește ruta ambientală cu o rută 041
reală de la banda curentă la zona 032 și calculează `stopDistanceM` pe punctul real al ancorei din
poligon. Actorul decelerează pe aceeași rută, se oprește exact la ancoră și rămâne staționar cât timp
`062`/`063` cer dwell-ul; nu există nicio poziție sărită la ancoră. La boarding, compunerea comandă
ruta de dropoff din banda curentă; la terminal, `clearServiceRoute` readuce actorul la ruta
ambientală. Un taxi condus de jucător (`MANUAL`/`LEARNING`) nu este rerutat, iar la revenirea în
`AUTO` compunerea reia etapa cerută de starea 061.

`CivilServiceRouteSnapshot` expune dovada: `path` (benzile 041), `zoneId`, `stopDistanceM`,
`distanceAlongRouteM`, `remainingToStopM`, `routeLaneIndex`, `routeLaneCount`, `speedMps`,
`positionM` și `stopped`. `composition.actorRoutes()` și `snapshot().actorRoutes` sunt read-only.

## Fluxul real

O asignare 060 creează cursa în `TO_PICKUP`. Când portul 058 este montat, taxiul asignat primește
imediat ruta reală 041 către zona de pickup; altfel observațiile vin de la host. Fiecare observație a
taxiului revendicat este evaluată de 062 sau 063 pe poligonul real al zonei 032:

- intrarea staționară în zona de pickup publică `ARRIVED_PICKUP`, astfel încât faza `PICKUP` și
  markerul `S` rămân vizibile pe toată durata dwell-ului, nu doar pe tick-ul de boarding;
- după dwell-ul cerut (implicit 180 tick-uri la 60 Hz), `PICKUP_COMPLETE` trece cursa în
  `TO_DROPOFF`; pasagerul rămâne la bord, iar markerul de destinație `D` este singurul rămas;
- intrarea staționară în zona de dropoff publică `ARRIVED_DROPOFF`, faza `DROPPING_OFF` și
  `DROPOFF_COMPLETE` închide cursa în `COMPLETED` și eliberează exact revendicarea 060.

Viteza instantanee este raportată, dar nu înlocuiește dovada de staționare. O cursă fără poziție în
cadru nu primește o poziție inventată: observația este omisă până la următorul tick valid.

## Păstrarea cursei și preluarea de jucător

`createLiveRides({ keepPlayerClaims: true })` este modul compus de 265. Un taxi preluat de jucător
rămâne revendicat și își păstrează cursa; este scos numai din candidații pentru asignări noi. Astfel
cursa supraviețuiește `AUTO → MANUAL → LEARNING`, schimbării taxiului selectat și revenirii în AUTO,
iar jucătorul poate conduce efectiv pickup-ul și dropoff-ul. Modul 264 păstrează implicit
`keepPlayerClaims: false`, deci comportamentul și dovezile lui istorice rămân neschimbate.

## Rezultate terminale și eliberare

Înainte ca pasul 264 să elibereze o revendicare pentru un taxi indisponibil, compunerea 265 închide
întâi cursa prin 061, la același tick:

| Cauză live | Stare 061 | Motiv 061 | Release 060 |
| --- | --- | --- | --- |
| `BLOCKED` | `FAILED` | `TAXI_BLOCKED` | `FAILED` |
| `DAMAGED` | `FAILED` | `TAXI_DAMAGED` | `FAILED` |
| `OFFLINE` | `FAILED` | `TAXI_REMOVED` | `FAILED` |
| `SCENARIO_RESET` | `FAILED` | `SCENARIO_RESET` | `FAILED` |
| `PLAYER_TAKEOVER` (numai `keepPlayerClaims: false`) | `CANCELLED` sau `FAILED` la `DROPOFF` | `PLAYER_CANCELLED` / `PLAYER_ABANDONED` | `CANCELLED` / `FAILED` |
| `COMPLETED` | `COMPLETED` | — | `COMPLETED` |

Fiecare curse terminală are exact un `RideRelease` real și un singur receipt; o a doua închidere
este imposibilă prin muchiile închise ale 061. `reset({ tick })` închide fiecare cursă activă cu
`SCENARIO_RESET`, apoi rewindează 264, 061, 062/063/064 și read-model-urile, fără asignări duplicate.

## Pasager, HUD și panou

- `composition.passenger` citește 147: `WAITING_PICKUP` are markerul `P`; `BOARDING` are `P` și `S`
  la ancora reală; `ONBOARD`/`DROPPING_OFF` au `D` și ocupare 1; terminalul este `NONE` cu reset.
- `composition.hud` citește 073: etapa, obiectivul pickup/dropoff, ETA cu interval, progresul
  certificat și motivul indisponibil. `ETA ARRIVED` este „La pasager”/„La destinație”, niciodată `0 s`.
- panoul `Curse` primește opțional read-model-ul 265 și afișează etapa, pasagerul, ETA, progresul și
  motivul terminal. Fără al doilea argument, contractul 264 rămâne funcțional.
- markerii 147 sunt proiectați în lume de `createLiveRideMarkerLayer`; un marker din spatele camerei
  este ascuns, nu mutat la o coordonată inventată.

## Verificare

```powershell
npm run ride:live:lifecycle
npm run ride:live:lifecycle -- --check
npm run ride:live:lifecycle:probe
```

Raportul determinist scrie [report.json](Evidence/265-ride-lifecycle/report.json) și
[report.md](Evidence/265-ride-lifecycle/report.md): 66 de verificări pe flota reală, inclusiv cursa
completă MANUAL cu dwell 180/180, o cursă completă AUTO condusă de actorul 058 pe rutele 041 reale
(fără override, cu oprire în ambele zone), pasagerul în toate fazele, HUD-ul,
`FAILED/TAXI_BLOCKED`, supraviețuirea preluării de jucător, ETA `SERVICE_BLOCKED` și resetul. Proba
de browser scrie [browser.json](Evidence/265-ride-lifecycle/browser.json),
[browser.md](Evidence/265-ride-lifecycle/browser.md) și zece capturi: cursa AUTO la pickup, la bord,
la dropoff și completă, preluarea taxiului revendicat, condusul manual la ancore, oprirea pentru
dwell, `COMPLETED` cu o singură eliberare, `FAILED/TAXI_BLOCKED` și panoul cu ambele rânduri.

## Limite

| Limită | Valoare |
| --- | ---: |
| Vehicule per cadru | 128 |
| Receipts terminale reținute | 128 |
| Dwell implicit | 180 tick-uri (3 s la 60 Hz) |
| Prag de viteză | 0.3 m/s |
| Toleranță de deplasare | 0.05 m |
| Decelerație oprire rută | 2.4 m/s² |
| Toleranță oprire rută | 0.01 m |
| Code units per identitate | 512 |

Cursa AUTO folosește execuția reală 058/041 și nu primește nicio poziție de fixture. Geometria 058
rămâne discretă la traversarea intersecțiilor (o bandă se termină la bordura intersecției, următoarea
începe după ea), deci poziția poate sări peste carosabilul intersecției; progresul pe rută rămâne
continuu și nu există teleport la ancoră. Proba manuală folosește tastatura reală. Tarifarea,
review-ul și KPI-urile rămân PBI 266. Proba nu măsoară FPS/GPU/hardware și nu înlocuiește gate-ul 287.

## Ce NU este

- Nu creează a doua simulare, al doilea registry, un al doilea ledger sau un al doilea model de cursă.
- Nu conduce taxiul prin alt model: execuția rutei aparține actorului 058 și planificatorului 041.
- Nu decide tarifarea, review-ul, XP-ul sau KPI-urile; acelea rămân 266–270.
- Nu persistă singur în savefile; snapshot-ul și migrarea rămân PBI-urilor de persistență.
