# Dropoff și finalizarea cursei 063

Status: implementare și validare funcțională locală. Contractul este pur: fără DOM, browser, Babylon, Rapier, renderer sau ceas de perete. Boardul canonic, mutarea în Done și publicarea rămân ale părintelui.

`src/fleet/dropoff.ts` validează livrarea fizică peste asignarea reală 060, lifecycle-ul 061 și geometria reală a hărții 032. Modulul nu creează taxiuri, cereri, zone, rute sau identități paralele: folosește `rideId`, `requestId`, `taxiId`, `dropoffZoneId` și poligoanele reale ale hărții. Nu citește poziția din renderer și nu decide cum ajunge taxiul la destinație. Evaluarea este unică pentru toate modurile de control: `observe` nu are câmp de mod, iar un câmp necunoscut este refuzat.

## API

```typescript
const dropoff = createRideDropoff({
  map, // harta 032 validată, cu serviceZones și geometria reală
  lifecycle, // lifecycle-ul 061 peste dispecerul 060
  // opțional: tickRateHz, speedThresholdMps, dwellTicks, displacementToleranceM
});

dropoff.observe({
  rideId,
  taxiId,
  tick,
  positionM: { x, y, z },
  speedMps,
}); // DropoffDecision
dropoff.attempt(rideId);
dropoff.completions();
dropoff.currentTick();
dropoff.stats();
dropoff.dispose();
```

`dropoffArrivedEventId(requestId)` este `dropoff-arrived:<requestId>`, iar `dropoffCompleteEventId(requestId)` este `dropoff-complete:<requestId>`. Ambele sunt derivate din cererea reală 059, nu dintr-o poziție în array sau dintr-un ceas.

`DropoffCompletion` păstrează `dwellTicks`, starea de intrare/ieșire, cele două event id-uri, `release`-ul real 060 și o copie `metrics` a cursei: `startedTick`, `completedTick`, `pickupZoneId`, `dropoffZoneId`, `pickupCostSeconds`, `tripCostSeconds`, `totalCostSeconds`, rutele de pickup/traseu și numărul de tranziții.

## Zona reală de destinație

Zona este exact `ride.dropoffZoneId` din asignarea 060, adică un id real din `map.serviceZones`. Modulul citește aria `geometryId` și nodurile ei din harta validată 032 și testează punctul în poligonul XZ, cu marginea inclusă. Nu folosește o rază în jurul markerului și nu inventează un id de zonă.

O zonă este eligibilă numai dacă permite accesul `TAXI` și nu este exclusiv `PICKUP`. Un punct în altă zonă de serviciu, chiar dacă este o zonă validă de dropoff pentru altă cursă, este refuzat cu `WRONG_ZONE`; un punct în afara oricărei zone este refuzat cu `NOT_AT_DROPOFF`. Un id de zonă lipsă sau incompatibil este de asemenea `WRONG_ZONE`, înainte de orice dovadă de staționare.

## Viteză și staționare

| Regulă | Valoare implicită | Semnificație |
| --- | ---: | --- |
| `tickRateHz` | 60 | Timpul este exclusiv tick simulat. |
| `speedThresholdMps` | 0.3 | Viteza maximă la destinație, comparată inclusiv. |
| `dwellTicks` | 180 | 3 s la 60 Hz; se măsoară în intervale de tick. |
| `displacementToleranceM` | 0.05 | Deplasarea XZ maximă între două observații consecutive. |

Valorile sunt identice cu regulile de pickup 062 și sunt verificate printr-un test care compară cele două tabele; o recalibrare viitoare a uneia dintre reguli nu poate schimba tacit cealaltă.

Prima observație staționară în zonă începe dovada la 0. Dovada continuă numai dacă observațiile aceluiași taxi sunt pe tick-uri consecutive, viteza rămâne sub prag și deplasarea dintre ele nu depășește toleranța. La 180 de intervale împlinite se finalizează livrarea; 179 de intervale nu sunt suficiente. Ieșirea din zonă, depășirea vitezei, o deplasare peste toleranță, un tick lipsă sau un tick vechi resetează dovada. Repetarea aceleiași observații în același tick întoarce decizia anterioară fără să numere de două ori.

Pragurile sunt reguli de serviciu provizorii, separate de preferințele de stil `pickup_*` din catalogul de parametri. Calibrarea pe fizica reală și playtest rămâne deschisă.

## Motive închise

Fiecare observație neacceptată poartă exact un motiv:

| Motiv | Status | Când |
| --- | --- | --- |
| `STALE_TICK` | `REJECTED` | tick mai mic decât ultimul observat sau decât tick-ul autoritativ 061 |
| `WRONG_RIDE` | `REJECTED` | cursă necunoscută sau terminală (`COMPLETED`, `FAILED`, `CANCELLED`) |
| `FOREIGN_VEHICLE` | `REJECTED` | `taxiId` diferă de taxiul revendicat de cursă |
| `RIDE_NOT_ON_TRIP` | `REJECTED` | cursa există și este activă, dar nu a ajuns încă la `TO_DROPOFF`/`DROPOFF` |
| `WRONG_ZONE` | `REJECTED` | zona cursei lipsește/este incompatibilă sau poziția este în altă zonă reală |
| `NOT_AT_DROPOFF` | `REJECTED` | poziția este în afara oricărei zone de serviciu |
| `TOO_FAST` | `REJECTED` | taxiul este în zonă, dar peste pragul de viteză |
| `NOT_STATIONARY` | `PENDING` | taxiul este în zonă și sub prag, dar dovada de staționare nu este completă |

Ordinea de verificare este: prospețimea tick-ului, existența cursei, taxiul revendicat, finalizarea deja înregistrată, starea terminală, starea de călătorie, zona, viteza, apoi staționarea. Astfel, un taxi străin nu poate consuma dovada altei curse, iar o cursă anulată sau eșuată înainte de destinație nu poate primi `DROPOFF_COMPLETE`.

## Integrare cu lifecycle-ul 061

O observație validă scrie, la același tick:

- `ARRIVED_DROPOFF` din `TO_DROPOFF` în `DROPOFF`, numai dacă modulul este primul care o face;
- `DROPOFF_COMPLETE` din `DROPOFF` în `COMPLETED`.

`DROPOFF_COMPLETE` este tranziția terminală a 061: ea citește revendicarea reală 060 și apelează `dispatcher.release(taxiId, COMPLETED, tick)`. Modulul nu eliberează singur taxiul și nu inventează un `RideRelease`. Dacă revendicarea lipsește, 061 aruncă `Ride taxi claim is missing`, cursa rămâne `DROPOFF`, iar modulul nu înregistrează nicio finalizare. După succes, taxiul revine la `AVAILABLE` prin tabelul 060.

Nicio observație `TOO_FAST`, `NOT_STATIONARY`, `WRONG_ZONE`, `NOT_AT_DROPOFF`, `WRONG_RIDE`, `RIDE_NOT_ON_TRIP`, `STALE_TICK` sau `FOREIGN_VEHICLE` nu scrie `DROPOFF_COMPLETE`. Rejucarea observației de finalizare, inclusiv după ce cursa s-a închis sau modulul a fost recreat peste un lifecycle restaurat, întoarce `duplicate: true` cu aceeași tranziție, fără un al doilea eveniment și fără o a doua eliberare. Idempotența reală este cea a 061 după `(rideId, eventId)`.

Finalizarea nu modifică metricile cursei: costurile, zonele și rutele copiate din asignarea 060 rămân exact cele de dinaintea tranziției terminale, iar `DropoffCompletion.metrics` păstrează aceeași valoare.

## Tick, limite și disposal

Nu există `Date`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame` sau `Math.random`. Tick-ul este furnizat de apelant și nu poate scădea; `observe` nu avansează singur lifecycle-ul, dar refuză un tick mai mic decât `lifecycle.currentTick()`.

Limite: 64 de încercări active (aceeași plafonare ca a curselor active 061), 128 de finalizări reținute pentru replay, 256 de vertexuri per poligon și 512 code units per identitate. O finalizare evacuată este reconstruită din tranziția 061 cu event id-ul stabil, deci replay-ul rămâne idempotent cât timp cursa terminală este reținută. `dispose()` este idempotent, golește încercările, finalizările și contoarele și nu eliberează revendicarea dispecerului injectat. După disposal, mutațiile aruncă, iar citirile întorc liste goale sau zero.

## Verificare

`tests/fleet/dropoff.test.ts` acoperă: finalizare exact la tick-ul de dwell, trecere rapidă, punct în afara zonei, altă zonă reală, zonă exclusiv `PICKUP`, id de zonă incompatibil, margine inclusă, reset la părăsire, cursă necunoscută/străină/terminală/înainte de `TO_DROPOFF`, tick vechi, repetare în același tick, dublă finalizare, finalizare refuzată fără revendicare, echivalența manual/autonom, păstrarea metricilor, absența ceasului/renderer-ului, validarea opțiunilor și disposal-ul la zero.

```powershell
npm run ride:dropoff
npm run ride:dropoff -- --check
```

Runnerul scrie [report.json](Evidence/063-dropoff/report.json) și [report.md](Evidence/063-dropoff/report.md). `--check` eșuează dacă transcriptul comis diferă; `npm test` include aceeași comparație. Raportul are 22 de verificări, inclusiv simularea celor 32 de cereri reale 059 cu pickup 062, asignări 060 și zone 032.

## Ce NU este

- Nu este ETA 064, HUD 075, tarif/review/KPI 209 sau sănătatea flotei 065.
- Nu conduce taxiul, nu frânează, nu schimbă banda și nu alege ruta; poziția și viteza sunt observații autoritare ale apelantului.
- Nu ocupă fizic zona și nu inspectează native spațiul sau coliziunile; acelea aparțin contractelor 030/040. Catalogul separat 040 nu este prezent în acest arbore, deci 063 citește direct poligoanele validate 032, fără a forka id-urile zonelor.
- Nu persistă singur în savefile și nu citește ceasul de perete; snapshot-ul și migrarea rămân PBI-urilor de persistență. Reconstrucția unei finalizări după restart folosește tranzițiile 061 restaurate.
- Raportul este o probă funcțională deterministă, nu o măsurătoare de FPS/GPU/Rapier/hardware.
