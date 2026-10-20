# ETA și progresul traseului (PBI064)

Status: implementare și validare funcțională locală. Contractul este pur: fără DOM, browser, Babylon, Rapier, renderer sau ceas de perete. Boardul canonic, mutarea în Done și publicarea rămân ale părintelui.

`src/fleet/eta.ts` transformă traseul real 041 păstrat în asignarea 060 și starea reală a cursei 061 într-un ETA estimat și un progres certifiat al traseului. Modulul nu creează rute, taxiuri, curse sau identități paralele: citește exact `pickupRouteLaneIds`/`tripRouteLaneIds`, costurile reale `pickupCostSeconds`/`tripCostSeconds`, zonele și ID-urile cursei. ETA nu este o garanție: fiecare estimare are un interval declarat, iar o rută sau o poziție necertificabilă produce un motiv închis, niciodată `0` secunde.

## API

```typescript
const eta = createRideEta({
  lifecycle,              // lifecycle-ul real 061
  graph,                  // graful real 033 (geometrie, benzi, acces TAXI)
  planner,                // plannerul real 041 (versiuni + replanificare de verificare)
  tickRateHz: 60,         // opțional
  offRouteToleranceM: 4,  // opțional
  reprojectionLanes: 8,   // opțional, plafonat la 64
  serviceState: 'FREE_FLOW', // opțional
});

eta.observe({ rideId, taxiId, tick, positionM: { x, y, z }, speedMps, headingRad? });
eta.setServiceState('FREE_FLOW' | 'CONGESTED' | 'BLOCKED');
eta.currentTick();
eta.estimate(rideId);   // ultima estimare reținută, inclusiv terminală
eta.estimates();        // ordine stabilă după rideId
eta.stats();
eta.dispose();
```

`observe` întoarce un `EtaSnapshot` înghețat. Tick-ul este autoritativ și monoton: un tick mai mic decât ultimul observat sau decât `lifecycle.currentTick()` produce `STALE_TICK`; nu există ceas de perete. O viteză `NaN`, infinită sau negativă și o poziție invalidă sunt erori de contract (`ContractValidationError`), nu estimări.

## Baza de viteză și ETA

Traseul este o secvență de benzi 041. Pentru fiecare bandă se citesc geometria direcționată 033 (`getDirectedPath`) și limita reală de viteză; timpul liber al benzii este `lengthM / max(speedLimitMps, 1)`. Costul real al etapei 041 include penalizările de viraj/continuare și eventualul trafic al apelantului, deci este distribuit proporțional peste benzile etapei: `scale = costSeconds / Σ timpLiber`, iar timpul planificat al benzii este `timpLiber × scale`. Astfel, întreaga rută reproduce exact costul 041 stocat, iar fiecare bandă își păstrează limita proprie.

Distanța traseului include și golurile reale dintre poliliniile consecutive (intersecțiile), deci o poziție din intersecție rămâne pe traseu. Golurile adaugă distanță, dar nu cost planificat; timpul rămas este:

```text
plannedRemainingSeconds =
  (1 − fracțiuneBandaCurentă) × timpPlanificatBandaCurentă + Σ timpPlanificat(benzile următoare)
```

ETA nominală este `plannedRemainingSeconds / nominalSpeedFactor`, iar intervalul publicat este:

```text
etaMin = plannedRemainingSeconds / maxSpeedFactor
etaMax = plannedRemainingSeconds / minSpeedFactor
```

| Stare serviciu | Factor nominal | Factor minim | Factor maxim | Efect |
| --- | ---: | ---: | ---: | --- |
| `FREE_FLOW` | 1 | 0.9 | 1.1 | ETA nominală și interval de ±10% viteză |
| `CONGESTED` | 0.5 | 0.35 | 0.65 | ETA dublă nominal, interval larg |
| `BLOCKED` | — | — | — | indisponibil cu `SERVICE_BLOCKED` |

`plannedSpeedMps = distanța benzilor / costSeconds` este viteza medie planificată a etapei; `speedBasisMps = plannedSpeedMps × factor nominal`. Viteza instantanee observată (`speedMps`) este validată și raportată, dar nu înlocuiește baza planificată: un taxi oprit nu produce infinit și nu transformă ETA într-o promisiune. Valorile factorilor sunt provizorii și declarate, nu o predicție de trafic și nu o măsurătoare hardware.

Un cost 041 de `0` este cazul real `origine == banda destinație`; ruta este validă, timpul planificat este `0`, iar ETA este `0`. Lipsa rutei nu este confundată cu acest caz.

## Progres, segmente și reproiecție

`traveledDistanceM` este distanța certificată pe traseu, `remainingDistanceM = total − traveled`, iar `progressFraction = traveled / total`. Snapshotul raportează și segmentul curent: `segmentIndex`, `segmentLaneId`, `segmentKind` (`LANE` sau `CONNECTION` pentru golul de intersecție) și `segmentProgressFraction`.

Regula de poziționare este forward-only:

1. `graph.locateLane` identifică banda reală a poziției. Dacă banda apare în traseu la indexul curent sau înainte, proiecția pe acea bandă este certificată direct (`reprojected: false`).
2. Altfel, poziția poate fi reproiectată numai pe segmente din fereastra înainte `[indexCurent, indexCurent + reprojectionLanes]`, în limita `offRouteToleranceM` și numai dacă segmentul candidat nu merge în sens opus direcției benzii reale. O bandă vecină paralelă sau golul unei intersecții este acceptat cu `reprojected: true` și `offRouteDistanceM`; un segment orientat invers nu este acceptat.
3. O bandă reală fără segment candidat produce `OFF_ROUTE`; o poziție fără bandă reală și fără segment de traseu produce `POSITION_INVALID`.
4. Progresul este plafonat la valoarea deja certificată: `traveled = max(traveledAnterior, traveledNou)`, deci o observație întârziată sau o proiecție în urmă nu poate readuce progresul. Reproiecția nu sare pe un segment anterior și nu alege o apariție ulterioară ambiguă a aceleiași benzi decât dacă banda reală o confirmă.

O observație aflată în urma progresului certificat este refuzată (`OFF_ROUTE`) și păstrează progresul; ETA devine indisponibilă pentru acel tick. Starea `PICKUP`/`DROPOFF` este dovada de sosire a lifecycle-ului: raportează `ARRIVED`, progres `1`, distanță rămasă `0` și ETA `0`, fără să inventeze un traseu.

## Motive închise

| Motiv | Când |
| --- | --- |
| `ROUTE_MISSING` | etapa nu are traseu, o bandă lipsește sau nu este o bandă TAXI reală |
| `ROUTE_STALE` | intrările plannerului s-au schimbat după crearea ETA, traseul nu mai este exact planul 041 curent sau secvența de benzi nu este conectată |
| `ROUTE_INVALID` | cost 041 negativ/non-finit ori geometrie fără timp planificat |
| `POSITION_INVALID` | poziția nu este pe nicio bandă reală și nici lângă traseul din fereastra înainte |
| `OFF_ROUTE` | poziția este pe o bandă reală, dar nu pe traseul curent sau înainte |
| `SERVICE_BLOCKED` | apelantul a declarat serviciul blocat |
| `STALE_TICK` | tick mai mic decât ultimul observat sau decât tick-ul lifecycle-ului |
| `WRONG_RIDE` | cursa nu există |
| `FOREIGN_VEHICLE` | taxiul observat nu este taxiul revendicat de cursă |
| `RIDE_TERMINAL` | cursa este terminală |

Pentru `ROUTE_MISSING`, `ROUTE_STALE` și `ROUTE_INVALID`, câmpurile de traseu sunt `null`, inclusiv `remainingDistanceM`, deci lipsa rutei nu poate fi afișată ca `0` secunde certe. Pentru `OFF_ROUTE`, `POSITION_INVALID` și `SERVICE_BLOCKED`, ruta este încă lizibilă: se raportează totalul și ultimul progres certificat, dar `etaSeconds` este `null` și poziția nu avansează progresul.

## Prospețime și replanificare

ETA capturează semnătura intrărilor plannerului la creare: `graphVersion`, `costVersion`, `blockedSignature`, `trafficSignature`. Orice schimbare ulterioară produce `ROUTE_STALE`, pentru că traseul stocat a fost planificat cu alte intrări. Suplimentar, la încărcarea unei etape, plannerul este întrebat din nou:

- etapa pickup pornește, prin contractul 041, de la prima bandă a traseului și merge la zona de pickup;
- etapa trip pornește de la zona de pickup și merge la zona de dropoff.

Dacă planul curent nu este `READY`, nu este exact aceeași secvență de benzi sau costul lui nu este exact costul stocat al etapei, traseul este `ROUTE_STALE`. Astfel, un ETA creat după o replanificare nu refolosește traseul vechi, iar o rută devenită imposibilă nu este prezentată ca estimare. `061` nu retargetează o cursă activă: o rerutare reală este o asignare nouă, cu traseu nou; ETA pornește de la progresul noii curse, nu moștenește progresul celei vechi.

## Limite

| Limită | Valoare |
| --- | ---: |
| Estimări active reținute | 64 |
| Benzi per traseu | 256 |
| Code units per identitate | 512 |
| Fereastră de reproiecție | 8 benzi (maximum 64) |
| Toleranță laterală | 4 m |

`dispose()` este idempotent, golește traseele, progresul, estimările și contoarele și nu eliberează lifecycle-ul, graful sau plannerul injectate. Când o cursă devine terminală, traseul și progresul ei sunt eliberate imediat; rămâne numai estimarea plafonată, pentru panoul flotei. După disposal, `observe`/`setServiceState` aruncă, iar citirile întorc liste goale sau zero.

## Verificare

`tests/fleet/eta.test.ts` acoperă: ETA pe ruta reală 041 și intervalul documentat, scăderea ETA cu distanța rămasă (nu costul întregii etape), monotonia progresului și refuzul unei poziții în urmă, reproiecția unei benzi paralele și a golului de intersecție, refuzul unei poziții off-route în locul unei segmente greșite, lipsa rutei fără `0` cert, ruta devenită stale după replanificare și ETA creată după replanificare, invalidarea costului/continuității, starea serviciului (liber, congestionat, blocat), sosirea/cursele terminale, validarea vitezei/poziției/tick-ului, puritatea, determinismul și disposal-ul la zero. Raportul execută aceleași reguli pe flota și programul real și păstrează 24 de verificări, inclusiv simularea celor 32 de cereri cu ETA pe ambele etape.

```powershell
npm run ride:eta
npm run ride:eta -- --check
```

Runnerul scrie [report.json](Evidence/064-eta/report.json) și [report.md](Evidence/064-eta/report.md). `--check` eșuează dacă transcriptul comis diferă; `npm test` include aceeași comparație.

## Ce NU este

- Nu este planner 041: nu creează, nu modifică și nu replanifică traseul cursei; citește traseul real al asignării 060.
- Nu este pickup/dropoff 062–063: nu decide oprirea, boarding-ul sau livrarea.
- Nu este HUD 073–075 și nu formatează text pentru jucător; oferă valori pure pentru compoziție.
- Nu prezice traficul: `FREE_FLOW`/`CONGESTED`/`BLOCKED` sunt intrări explicite ale apelantului, iar factorii de incertitudine sunt provizorii.
- Nu măsoară FPS/GPU/Rapier/hardware și nu certifică performanța jocului integrat.
