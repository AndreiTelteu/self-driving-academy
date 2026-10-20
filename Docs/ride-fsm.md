# Lifecycle-ul curselor 061

Status: implementare și validare funcțională locală. Contractul este pur: fără DOM, browser, Babylon, Rapier, renderer sau ceas de perete. Boardul canonic, mutarea în Done și publicarea rămân ale părintelui.

`src/fleet/ride-fsm.ts` transformă o asignare reală 060 într-o cursă cu stări explicite, tranziții închise, evenimente idempotente și eliberare explicită a taxiului revendicat. Modulul nu creează taxiuri, cereri, rute, asignări sau identități paralele: folosește `requestId` 059, `assignmentId`/`taxiId` 057+060 și namespace-ul real al dispecerului.

## API

```typescript
const lifecycle = createRideLifecycle({
  dispatcher, // dispecerul real 060; deține revendicările și eliberările
});

lifecycle.begin({ requestId, eventId, tick }); // creează cursa din revendicarea 060
lifecycle.apply({ rideId, eventId, event, tick, reason? }); // o tranziție, idempotentă
lifecycle.advance(tick); // tick autoritativ monoton
lifecycle.currentTick();
lifecycle.ride(rideId); // RideRecord | undefined
lifecycle.rideFor(requestId); // RideRecord | undefined
lifecycle.active(); // curse neterminate, ordine stabilă
lifecycle.terminal(); // curse închise, ordine stabilă
lifecycle.snapshot(); // numai curse active, pentru restart
lifecycle.snapshotRide(rideId); // intrarea oricărei curse reținute, inclusiv închise
lifecycle.restore(snapshot); // refuză cursele terminale sau fără revendicare
lifecycle.reset({ tick, preserveStats }); // graniță de scenariu 065; raportează cursele încă deschise
lifecycle.stats();
lifecycle.dispose();
```

`rideLifecycleId(namespace, requestId)` este `createStableId('ride', namespace, [requestId])`, iar `rideTransitionId(namespace, rideId, eventId)` este `createStableId('ride-transition', namespace, [rideId, eventId])`. Ambele sunt exportate pentru integrări și probe; identitatea rămâne definită într-un singur loc.

## Stări și tranziții

O cursă începe în `TO_PICKUP`, nu în `AVAILABLE`: `AVAILABLE` este statut de taxi 060, iar cursa există numai după ce dispecerul a revendicat un taxi. Fluxul este `TO_PICKUP → PICKUP → TO_DROPOFF → DROPOFF → COMPLETED`, cu `FAILED` și `CANCELLED` ca rezultate explicite.

| Din | Trecere permisă către |
| --- | --- |
| `TO_PICKUP` | `PICKUP`, `FAILED`, `CANCELLED` |
| `PICKUP` | `TO_DROPOFF`, `FAILED`, `CANCELLED` |
| `TO_DROPOFF` | `DROPOFF`, `FAILED`, `CANCELLED` |
| `DROPOFF` | `COMPLETED`, `FAILED` |
| `COMPLETED` | — terminal |
| `FAILED` | — terminal |
| `CANCELLED` | — terminal |

`RIDE_TRANSITIONS` publică exact acest tabel. O tranziție care nu apare în el este refuzată înainte de orice schimbare de stare. După `DROPOFF` cursa nu mai poate fi anulată, pentru că pasagerul a ajuns la destinație; poate doar să se încheie sau să eșueze explicit. Stările terminale nu au muchii de ieșire, deci un al doilea rezultat terminal este imposibil, nu doar ignorat.

## Evenimente

Fiecare tranziție este un eveniment numit, cu un singur rezultat posibil:

| Eveniment | Din | Către |
| --- | --- | --- |
| `ASSIGNED` | — (creare) | `TO_PICKUP` |
| `ARRIVED_PICKUP` | `TO_PICKUP` | `PICKUP` |
| `PICKUP_COMPLETE` | `PICKUP` | `TO_DROPOFF` |
| `ARRIVED_DROPOFF` | `TO_DROPOFF` | `DROPOFF` |
| `DROPOFF_COMPLETE` | `DROPOFF` | `COMPLETED` |
| `CANCELLED` | `TO_PICKUP`, `PICKUP`, `TO_DROPOFF` | `CANCELLED` |
| `FAILED` | `TO_PICKUP`, `PICKUP`, `TO_DROPOFF`, `DROPOFF` | `FAILED` |

Apelantul furnizează `eventId`, o identitate semantică stabilă (de exemplu `pickup:<requestId>`), nu o poziție în array și nu un ceas. O tranziție primește `transitionId` derivat din `(rideId, eventId)`. Rejucarea aceluiași `eventId` cu același eveniment și același motiv întoarce tranziția originală cu `duplicate: true`, fără nicio schimbare de stare și fără eliberare. Rejucarea aceluiași `eventId` cu alt eveniment sau alt motiv aruncă `Ride event id conflict`, deci un eveniment nu poate fi rescris pe ascuns. Rejucarea `begin` cu același `eventId` este de asemenea idempotentă; un al doilea `begin` cu alt `eventId` pentru aceeași cerere este refuzat.

## Motive terminale

`FAILED` cere un motiv din `RIDE_FAILURE_REASONS`:

| Motiv | Semnificație |
| --- | --- |
| `TAXI_BLOCKED` | taxiul a fost imobilizat în trafic |
| `TAXI_DAMAGED` | taxiul a fost avariat |
| `TAXI_REMOVED` | taxiul a ieșit din flotă |
| `ROUTE_UNAVAILABLE` | traseul a devenit imposibil |
| `SERVICE_TIMEOUT` | serviciul nu a fost finalizat în fereastra permisă |
| `PLAYER_ABANDONED` | jucătorul a abandonat cursa cu pasager |
| `SCENARIO_RESET` | refacerea lumii a închis cursa, o singură dată |

`CANCELLED` cere un motiv din `RIDE_CANCEL_REASONS`: `PLAYER_CANCELLED`, `PASSENGER_CANCELLED`, `DISPATCH_WITHDRAWN`. Celelalte evenimente refuză orice `reason`. Vocabularele sunt închise, iar un motiv din lista greșită este respins.

## Tick și monotonie

Nu există `Date`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame` sau `Math.random`. `advance(tick)` acceptă numai tick-uri întregi, nenegative și nescăzătoare; un tick mai mic aruncă `RangeError('Stale ride tick')`. Fiecare eveniment nou trebuie să aibă un tick cel puțin egal cu ultimul tick autoritativ și cu tick-ul cursei. O rejucare idempotentă este recunoscută după `eventId` înainte de verificarea de prospețime, deci un replay nu este confundat cu un eveniment nou întârziat.

## Ownership, revendicare și eliberare

Cursa copiază din asignarea 060 `taxiId`, `assignmentId`, zonele de pickup/dropoff, costurile reale și traseele. Nu are API de retargetare: taxiul selectat în lume sau în HUD nu este o intrare a lifecycle-ului și nu poate anula ori muta cursa. Un câmp `taxiId` trimis într-un eveniment este respins ca „Unknown ride event field”.

Fiecare stare terminală urmează aceeași ordine verificabilă:

1. Se validează starea curentă, muchia, motivul, tick-ul și istoricul.
2. Se citește `dispatcher.assignmentFor(requestId)` și se cere ca `assignmentId` și `taxiId` să fie exact cele ale cursei.
3. Se apelează `dispatcher.release(taxiId, COMPLETED | CANCELLED | FAILED, tick)`.
4. Se cere ca eliberarea să întoarcă exact asignarea cursei; altfel tranziția este refuzată.
5. Abia apoi se înregistrează tranziția terminală și `RideRelease` în cursă.

Astfel, o stare terminală fără eliberare reală este imposibilă: dacă revendicarea lipsește (de exemplu a fost eliberată extern), `DROPOFF_COMPLETE` aruncă `Ride taxi claim is missing` și cursa rămâne `DROPOFF`, nu devine `COMPLETED`. După eliberare, 060 aplică tabelul propriu: `COMPLETED`/`CANCELLED`/`FAILED` readuc taxiul la `AVAILABLE`. Sănătatea flotei 065 poate remarka ulterior taxiul ca `BLOCKED`/`DAMAGED`; lifecycle-ul nu inventează un statut de sănătate.

## Restart și snapshot

`snapshot()` conține numai cursele active, în ordine stabilă după `rideId`, plus tick-ul autoritativ. `restore(snapshot)` cere un lifecycle gol și verifică:

- versiunea și tick-ul snapshot-ului;
- că fiecare intrare este o stare neterminală;
- că lanțul de tranziții este continuu, începe cu `ASSIGNED`, respectă `RIDE_TRANSITIONS` și are tick-uri nescăzătoare;
- că `updatedTick` și `appliedEventIds` corespund exact ultimei tranziții;
- că `transitionId` este identitatea stabilă 006 derivată din `(rideId, eventId)`, nu un id forjat;
- că dispecerul încă deține revendicarea exactă pentru `requestId`.

O cursă terminală din snapshot este refuzată explicit (`Cannot restore a terminal ride as active`), la fel o cursă a cărei revendicare a dispărut. `appliedEventIds` este restaurat, deci rejucarea unui eveniment anterior rămâne idempotentă după restart. `snapshotRide(rideId)` expune intrarea oricărei curse reținute, inclusiv închise, pentru dovezi și pentru PBI-urile 063/209 care au nevoie de rezultatul terminal.

## Limite

| Limită | Valoare |
| --- | ---: |
| Curse active simultan | 64 |
| Înregistrări terminale reținute | 128 |
| Evenimente per cursă | 16 |
| Code units per `requestId` | 256 |
| Code units per `rideId` | 512 |
| Code units per `eventId` | 256 |

Înregistrările terminale peste plafon sunt eliminate în ordine stabilă și raportate prin `stats().droppedTerminal`; eliminarea nu inventează o eliberare și nu readuce cursa în `active()`. `dispose()` este idempotent, golește cursele, tranzițiile, snapshot-urile și contoarele și nu eliberează revendicările dispecerului injectat, pentru că aceea ar fi o eliberare fără motiv de business. După disposal, mutațiile aruncă, iar citirile întorc liste goale sau zero.

`reset({ tick, preserveStats })` este granița de scenariu 065: golește cursele reținute (inclusiv terminale) și memoria de evenimente, păstrează tick-ul monoton și resetează contoarele numai când `preserveStats` este absent. El raportează `discardedActive` pentru orice cursă încă deschisă, astfel încât compoziția 065 să poată demonstra că a închis întâi fiecare cursă cu `SCENARIO_RESET`; resetul nu eliberează singur nicio revendicare.

## Verificare

`tests/fleet/ride-fsm.test.ts` acoperă: cursa completă și eliberarea exactă a revendicării, fiecare muchie ilegală, al doilea rezultat terminal, starea terminală fără revendicare, motivele obligatorii și vocabularele închise, idempotența și conflictul de `eventId`, tick-urile stale, schimbarea taxiului selectat fără anulare, snapshot/restore cu id-uri stabile, refuzul cursei terminale sau fără revendicare, absența ceasului/renderer-ului și disposal-ul la zero. Raportul execută aceleași reguli pe programul real 059 și păstrează 26 de verificări.

```powershell
npm run ride:lifecycle
npm run ride:lifecycle -- --check
```

Runnerul scrie [report.json](Evidence/061-ride-fsm/report.json) și [report.md](Evidence/061-ride-fsm/report.md). `--check` eșuează dacă transcriptul comis diferă; `npm test` include aceeași comparație.

## Ce NU este

- Nu este pickup/dropoff fizic 062–063: nu citește poziția, viteza sau zona reală și nu decide oprirea; acelea emit evenimentele lifecycle-ului.
- Nu este ETA live 064, HUD 075, tarif/review/KPI 209 sau sănătatea flotei 065.
- Nu alege taxiuri, nu replanifică rute și nu modifică asignarea 060; un taxi schimbat în UI nu este o tranziție.
- Nu persistă singur în savefile și nu citește ceasul de perete; snapshot-ul este o valoare pură oferită compoziției.
- Raportul este o probă funcțională deterministă, nu o măsurătoare de FPS/GPU/Rapier/hardware.
