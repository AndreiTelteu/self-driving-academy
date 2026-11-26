# Cereri și dispecerizare live 264

Status: implementare live locală și probe funcționale. Modulul de compunere este pur (fără DOM, Babylon, renderer sau ceas de perete); tick-ul și cadrul flotei sunt intrări explicite. Boardul canonic, mutarea în Done și publicarea rămân ale părintelui.

`src/fleet/live-rides.ts` este composition root-ul dintre programul real 059, coada reală 059, dispecerul real 060 și cele 24 de taxiuri live 057/058. Nu creează o a doua simulare, un al doilea registry, curse 061, pasageri, pickup/dropoff fizic sau ETA: asignările rămân revendicări 060, iar taxiurile rămân actorii compunerii. Modulul alege numai ce cereri intră în coadă și ce taxi disponibil primește fiecare cerere, cu costul real 041.

## API

```typescript
const live = createLiveRides({
  registry,                 // registry-ul real 057 al flotei live
  map,                      // harta reală 032
  graph,                    // graful real 033 (opțional; derivat din hartă)
  planner,                  // plannerul real 041 (opțional; altfel modulul deține unul)
  seed: 262,                // seed-ul scenariului, de regulă seed-ul real al flotei 262
  scenarioId: 'v3-live-city-264',
  namespace: 'v3:city:rides',
  queueLimit: 64,           // opțional, plafonat la capacitatea 059
  firstSpawnTick: 60,       // opțional, planul live
  windowSpanTicks: 60,
  windows: 8,
  requestsPerWindow: 8,
  dispatchEveryTicks: 6,    // decizii la 10 Hz
  assignmentsPerDispatch: 2,
  maxRouteSearchesPerDispatch: 128,
});

live.step({ tick, vehicles, playerVehicleId }); // cadrul compunerii după pasul autoritar
live.setTaxiStatus(taxiId, 'DAMAGED');           // fapt extern 029/030/065, aplicat la pasul următor
live.snapshot();                                 // read model-ul cererilor, cozii și alocărilor
live.stats();                                    // contoare compacte
live.reset({ tick, preserveStats });             // granița de scenariu 065
live.dispose();
```

`createLiveRidePlan({ map, seed, scenarioId, namespace, ... })` produce planul de scenariu pe harta reală. Ferestrele au `originZoneId` și `destinationZoneId` `null`, iar generatorul 059 alege zonele reale `TAXI` determinist din seed; planul nu inventează zone și nu fixează aceeași zonă la ambele capete. Primul request apare la tickul 60, apoi opt ferestre de câte opt request-uri (64 în total) în primele nouă secunde simulate.

Pentru integrarea 265, `live.demand` și `live.dispatcher` sunt expuse ca exact contractele 059/060 create de compunere; lifecycle-ul poate porni din revendicările 060 fără un al doilea store. `live.setTaxiStatus` rămâne singurul port de fapte de sănătate al compunerii, iar `live.step` nu creează `Ride`.

## Cadrul live

`step` primește exact cadrul publicat de compunere după pasul lumii:

```typescript
{
  tick,
  vehicles: [{ vehicleId, driverKind, laneId, blocked, controlMode }],
  playerVehicleId,          // singurul scaun PLAYER 263, altfel null
}
```

- `laneId` este poziția reală a actorului 058 și devine sursa de poziție a dispecerului 060.
- `blocked` este blocajul real 058, nu este dedus din viteză.
- `playerVehicleId` și orice `controlMode` diferit de `AUTO` scot taxiul din vista dispecerului; nu i se inventează un status 060.

## Disponibilitate și excludere

Ordinea este explicită și verificabilă:

1. Un taxi condus de jucător (`playerVehicleId` sau `controlMode !== 'AUTO'`) este scos din registry-ul filtrat al dispecerului. Dacă avea o revendicare, este eliberată cu `CANCELLED` și cauza live `PLAYER_TAKEOVER`.
2. Faptele externe publicate prin `setTaxiStatus` și blocajul real 058 sunt fuzionate cu precedență `OFFLINE > DAMAGED > BLOCKED > AVAILABLE`.
3. Un taxi revendicat care devine indisponibil este eliberat înainte de pasul 060, cu motivul închis corespunzător:

| Cauză live | Motiv 060 | Status următor |
| --- | --- | --- |
| `PLAYER_TAKEOVER` | `CANCELLED` | `AVAILABLE` (dar exclus din vista live) |
| `BLOCKED` | `TAXI_BLOCKED` | `BLOCKED` |
| `DAMAGED` | `TAXI_DAMAGED` | `DAMAGED` |
| `OFFLINE` | `TAXI_REMOVED` | `OFFLINE` |
| `SCENARIO_RESET` | `CANCELLED` | `AVAILABLE` |

4. Pentru fiecare taxi neclaimat și neexclus, modulul publică statusul efectiv înainte ca 060 să aleagă candidații. `availableTaxis()` al dispecerului nu conține niciodată un taxi blocat, avariat, offline sau condus de jucător.

## Dispecerizare, cost și replanificare

La fiecare `dispatchEveryTicks` (implicit 6 tick-uri, 10 Hz), modulul apelează exact `dispatcher.step` din 060:

- cererile sunt luate FIFO din coada 059;
- etapa pickup→dropoff este replanificată la asignare;
- fiecare taxi candidat este evaluat cu costul real 041 taxi→pickup la asignarea curentă;
- câștigă costul strict mai mic, apoi ID-ul lexicografic mai mic;
- ambele trasee și costurile sunt păstrate în asignare, cu `graphVersion` și `costVersion`;
- o cerere nu poate primi două taxiuri și un taxi nu poate primi două cereri.

Bugetul este plafonat de 060: maximum 128 de căutări 041 pe pas și maximum 2 asignări pe pas în compunerea live. `snapshot().totals` raportează căutările ultimului pas, maximul, numărul de pași și asignările. Când toate taxiurile sunt revendicate, pasul următor raportează `NO_TAXI` cu zero căutări, fără a inventa candidați.

## Read model

`snapshot()` proiectează starea completă, deterministă:

- `counts`: ferestre, cereri valide/invalide, coadă, asignări, taxiuri disponibile, jucător, blocate, avariate, offline;
- `totals`: admitere, dequeue, overflow, asignări, eliberări pe cauză, pași de dispecerizare, căutări 041;
- `queue`: limita, politica `REJECT_NEWEST`, cadența și bugetul;
- `requests`: fiecare cerere 059 cu ID, fereastră, tick, zone, status de validare, stare live, taxi, costuri și cauza eliberării;
- `assignments`: revendicările 060 active, cu slotul taxiului;
- `releases`, `rejections`: jurnale plafonate.

Stările unei cereri sunt un vocabular închis: `SCHEDULED`, `PENDING`, `ASSIGNED`, `RELEASED`, `REJECTED_INVALID`, `REJECTED_QUEUE`, `REJECTED_NO_ROUTE`. `CONSUMED` este o gardă de invariantă: o cerere admisă nu poate dispărea fără urmă, iar raportul cere zero astfel de intrări.

## Integrarea în shell și UI

`src/main.ts` montează modulul o singură dată, după compunerea V3 și înainte de atașarea lumii, și înregistrează portul `rides` (`POST_WORLD`) în shell-ul 260:

- portul citește cadrul autoritar după `world.step`, verifică egalitatea tick-ului și trimite pozițiile reale;
- panoul `Curse` (`src/ui/live-rides-panel.ts`) este read-only, se actualizează la 10 Hz când este deschis și afișează cererile, coada, taxiurile alocate și costurile;
- shell-ul suspendă simularea cât timp un panou este deschis în MANUAL, ca orice suprafață 070;
- `reset` este granița de scenariu: eliberează fiecare revendicare activă cu `CANCELLED`/`SCENARIO_RESET`, golește statusurile, faptele și jurnalele și rewindează 059/060. Un al doilea scenariu refolosește exact aceleași ID-uri 006 fără asignări duplicate.

## Limite

| Limită | Valoare |
| --- | ---: |
| Ferestre live per scenariu | 8 |
| Cereri live per scenariu | 64 |
| Cereri în coadă | 64 (`REJECT_NEWEST`) |
| Asignări per pas | 2 |
| Căutări 041 per pas | 128 |
| Cadență de dispecerizare | 6 tick-uri (10 Hz) |
| Intrări în jurnalul de eliberări | 128 |
| Intrări în jurnalul de respingeri | 128 |

## Verificare

`tests/fleet/live-rides.test.ts` acoperă: plan determinist din seed cu zone reale, overflow `REJECT_NEWEST`, costul real minim și departajarea, replanificarea ambelor etape, costul per pas plafonat, excluderea taxiurilor blocate/avariate/offline/conduse de jucător, eliberarea cu motive, asignarea unică, resetul fără duplicate, read model-ul și disposal-ul. `tests/ui/live-rides-panel.test.ts` acoperă panoul read-only, cadența de 10 Hz și focusul. `tests/fleet/live-rides-report.ts` rulează aceleași reguli pe flota reală 24/32 și păstrează 39 de verificări.

```powershell
npm run ride:live
npm run ride:live -- --check
npm run ride:live -- --measure
npm run ride:live:probe
```

Runnerul scrie [report.json](Evidence/264-live-rides/report.json), [report.md](Evidence/264-live-rides/report.md), [cost.json](Evidence/264-live-rides/cost.json) și probei de browser [browser.json](Evidence/264-live-rides/browser.json). `--check` eșuează dacă transcriptul determinist diferă; `npm test` include aceeași comparație. Proba de browser folosește Playwright dacă este disponibil și raportează `NOT_RUN` cu motivul real altfel.

Costul măsurat este un pas de subsistem în Node, pe flota reală, nu un cadru de browser sau un certificat hardware: p95 pentru `live.step` și pentru pașii de dispecerizare, raportat separat de bugetul de 8 ms al tick-ului laptop din [Docs/25](25-performanta-contracte-si-benchmark.md). Nu înlocuiește gate-ul 287.

## Ce NU este

- Nu este lifecycle-ul 061–064: nu creează `Ride`, pickup/dropoff fizic, pasager, ETA sau tarif. Acestea rămân PBI 265.
- Nu detectează avarii sau blocaje: primește fapte explicite de la 029/030/065 și `blocked` de la 058.
- Nu mișcă taxiurile și nu schimbă ruta AI a flotei după asignare; poziția rămâne a compunerii 058, iar executarea fizică a cursei aparține 265.
- Nu creează un al doilea model de cerere, taxi, ledger sau store. Refolosește exact 032/033/041/057/058/059/060.
- Panoul este read-only; nu acceptă, nu anulează și nu mută curse.
