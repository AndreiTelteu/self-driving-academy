# Pickup cu zonă, viteză și staționare 062

Status: implementare și validare funcțională locală. Contractul este pur: fără DOM, browser, Babylon, Rapier, renderer sau ceas de perete. Boardul canonic, mutarea în Done și publicarea rămân ale părintelui.

`src/fleet/pickup.ts` validează pickup-ul fizic peste asignarea reală 060 și lifecycle-ul 061. Modulul nu creează taxiuri, cereri, zone, rute sau identități paralele: folosește `rideId`, `requestId`, `taxiId`, `pickupZoneId` și poligoanele reale ale hărții 032. Nu citește poziția din renderer și nu decide cum ajunge taxiul acolo.

## API

```typescript
const pickup = createRidePickup({
  map, // harta 032 validată, cu serviceZones și geometria reală
  lifecycle, // lifecycle-ul 061 peste dispecerul 060
  // opțional: tickRateHz, speedThresholdMps, dwellTicks, displacementToleranceM
});

pickup.observe({
  rideId,
  taxiId,
  tick,
  positionM: { x, y, z },
  speedMps,
}); // PickupDecision
pickup.attempt(rideId);
pickup.boardings();
pickup.currentTick();
pickup.stats();
pickup.dispose();
```

`pickupArrivedEventId(requestId)` este `pickup-arrived:<requestId>`, iar `pickupBoardedEventId(requestId)` este `pickup-boarded:<requestId>`. Ambele sunt derivate din cererea reală 059, nu dintr-o poziție în array sau dintr-un ceas.

## Zona reală de pickup

Zona este exact `ride.pickupZoneId` din asignarea 060, adică un id real din `map.serviceZones`. Modulul citește aria `geometryId` și nodurile ei din harta validată 032 și testează punctul în poligonul XZ, cu marginea inclusă. Nu folosește o rază în jurul markerului și nu inventează un id de zonă.

O zonă este eligibilă numai dacă permite accesul `TAXI` și nu este exclusiv `DROPOFF`. Un punct în altă zonă de serviciu, chiar dacă este o zonă validă de pickup pentru altă cursă, este refuzat cu `WRONG_ZONE`; un punct în afara oricărei zone este refuzat cu `NOT_AT_PICKUP`. Un id de zonă lipsă sau incompatibil este de asemenea `WRONG_ZONE`.

## Viteză și staționare

| Regulă | Valoare implicită | Semnificație |
| --- | ---: | --- |
| `tickRateHz` | 60 | Timpul este exclusiv tick simulat. |
| `speedThresholdMps` | 0.3 | Viteza maximă la pickup, comparată inclusiv. |
| `dwellTicks` | 180 | 3 s la 60 Hz; se măsoară în intervale de tick. |
| `displacementToleranceM` | 0.05 | Deplasarea XZ maximă între două observații consecutive. |

Prima observație staționară în zonă începe dovada la 0. Dovada continuă numai dacă observațiile aceluiași taxi sunt pe tick-uri consecutive, viteza rămâne sub prag și deplasarea dintre ele nu depășește toleranța. La 180 de intervale împlinite se emite boarding-ul; 179 de intervale nu sunt suficiente. Ieșirea din zonă, depășirea vitezei, o deplasare peste toleranță, un tick lipsă sau un tick vechi resetează dovada. Repetarea aceleiași observații în același tick întoarce decizia anterioară fără să numere de două ori.

Pragurile sunt reguli de serviciu provizorii, separate de preferințele de stil `pickup_*` din catalogul de parametri. Calibrarea pe fizica reală și playtest rămâne deschisă.

## Motive închise

Fiecare observație neacceptată poartă exact un motiv:

| Motiv | Status | Când |
| --- | --- | --- |
| `STALE_TICK` | `REJECTED` | tick mai mic decât ultimul observat sau decât tick-ul autoritativ 061 |
| `WRONG_RIDE` | `REJECTED` | cursă necunoscută, terminală sau care nu mai așteaptă pickup |
| `FOREIGN_VEHICLE` | `REJECTED` | `taxiId` diferă de taxiul revendicat de cursă |
| `WRONG_ZONE` | `REJECTED` | zona cursei lipsește/este incompatibilă sau poziția este în altă zonă reală |
| `NOT_AT_PICKUP` | `REJECTED` | poziția este în afara oricărei zone de serviciu |
| `TOO_FAST` | `REJECTED` | taxiul este în zonă, dar peste pragul de viteză |
| `NOT_STATIONARY` | `PENDING` | taxiul este în zonă și sub prag, dar dovada de staționare nu este completă |

Ordinea de verificare este: prospețimea tick-ului, existența cursei, taxiul revendicat, boarding-ul deja înregistrat, starea cursei, zona, viteza, apoi staționarea. Astfel, un taxi străin nu poate consuma dovada altei curse, iar o cursă anulată înainte de pickup nu poate primi `PICKUP_COMPLETE`.

## Integrare cu lifecycle-ul 061

O observație validă scrie, la același tick:

- `ARRIVED_PICKUP` din `TO_PICKUP` în `PICKUP`, numai dacă modulul este primul care o face;
- `PICKUP_COMPLETE` din `PICKUP` în `TO_DROPOFF`.

Nicio observație `TOO_FAST`, `NOT_STATIONARY`, `WRONG_ZONE`, `NOT_AT_PICKUP`, `WRONG_RIDE`, `STALE_TICK` sau `FOREIGN_VEHICLE` nu scrie `PICKUP_COMPLETE`. După boarding, taxiul rămâne revendicat de cursă și trece la `TO_DROPOFF`; modulul nu eliberează revendicarea 060. Rejucarea observației de boarding, inclusiv după ce cursa a avansat sau s-a încheiat, întoarce `duplicate: true` cu aceeași tranziție și fără un al doilea eveniment. Idempotența reală este cea a 061 după `(rideId, eventId)`.

## Tick, limite și disposal

Nu există `Date`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame` sau `Math.random`. Tick-ul este furnizat de apelant și nu poate scădea; `observe` nu avansează singur lifecycle-ul, dar refuză un tick mai mic decât `lifecycle.currentTick()`.

Limite: 64 de încercări active (aceeași plafonare ca a curselor active 061), 128 de boarding-uri reținute pentru replay, 256 de vertexuri per poligon și 512 code units per identitate. `dispose()` este idempotent, golește încercările, boarding-urile și contoarele și nu eliberează revendicarea dispecerului injectat. După disposal, mutațiile aruncă, iar citirile întorc liste goale sau zero.

## Verificare

`tests/fleet/pickup.test.ts` acoperă: boarding exact la tick-ul de dwell, trecere rapidă, punct în afara zonei, altă zonă reală, zonă exclusiv `DROPOFF`, margine inclusă, reset la părăsire, cursă necunoscută/străină/anulată, tick vechi, repetare în același tick, dublu boarding, progres după boarding, sosire externă în `PICKUP` care este completată numai după dwell, absența ceasului/renderer-ului, validarea opțiunilor și disposal-ul la zero.

```powershell
npm run ride:pickup
npm run ride:pickup -- --check
```

Runnerul scrie [report.json](Evidence/062-pickup/report.json) și [report.md](Evidence/062-pickup/report.md). `--check` eșuează dacă transcriptul comis diferă; `npm test` include aceeași comparație. Raportul are 19 verificări, inclusiv simularea celor 32 de cereri reale 059 cu asignări 060 și zone 032.

## Ce NU este

- Nu este dropoff fizic 063, ETA 064, HUD 075, tarif/review/KPI 209 sau sănătatea flotei 065.
- Nu conduce taxiul, nu frânează, nu schimbă banda și nu alege ruta; poziția și viteza sunt observații autoritare ale apelantului.
- Nu ocupă fizic zona și nu inspectează native spațiul sau coliziunile; acelea aparțin contractelor 030/040. Un catalog separat 040 nu este prezent în acest arbore, deci 062 citește direct poligoanele validate 032, fără a forka id-urile zonelor.
- Nu persistă singur în savefile și nu citește ceasul de perete; snapshot-ul și migrarea rămân PBI-urilor de persistență.
- Raportul este o probă funcțională deterministă, nu o măsurătoare de FPS/GPU/Rapier/hardware.
