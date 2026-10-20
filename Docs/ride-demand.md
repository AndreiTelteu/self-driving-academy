# Cereri de curse și program de scenariu 059

Status: implementare și validare funcțională locală. Contractul este pur: fără DOM, browser, Babylon, Rapier, renderer sau ceas de perete. Boardul canonic, mutarea în Done și publicarea rămân ale părintelui.

`src/fleet/ride-demand.ts` transformă un program de scenariu și un seed într-o listă deterministă de cereri de cursă. Fiecare cerere are un ID stabil 006, zonă de pickup și zonă de dropoff din harta reală 032, tick de apariție, nivel de cerere și acces `TAXI`. Modulul validează cererile cu plannerul real 041 înainte ca acestea să intre în coada dispecerului și nu creează curse, taxiuri, rute proprii sau alocări.

## API

```typescript
const demand = createRideDemand({
  plan,                       // RideDemandPlan sau date necunoscute validate
  map,                        // harta 032 validată; plan.mapId trebuie să coincidă
  graph,                      // opțional; graful 033 al aceleiași hărți
  planner,                    // opțional; plannerul 041 al apelantului
  graphVersion: '033-lane-graph-v1',
  costVersion: 'route-cost-v1',
  queueLimit: 64,             // opțional, plafonat la RIDE_DEMAND_LIMITS.pendingRequests
});

demand.plan;                  // plan canonic înghețat
demand.requests();            // toate cererile generate, inclusiv cele imposibile
demand.validation(requestId); // RideRequestValidation | undefined
demand.rejections();          // INVALID_REQUEST sau QUEUE_OVERFLOW
demand.pending();             // cereri valide, încă nepreluate, în ordine stabilă
demand.advance(tick);         // admite cererile cu spawnTick <= tick
demand.dequeue();             // FIFO; undefined când coada este goală
demand.stats();               // contoare și ownership
demand.reset({ preserveStats }); // graniță de scenariu 065: cursor și coadă rewindate
demand.dispose();             // idempotent, readuce starea la zero
```

`parseRideDemandPlan(value)` validează și îngheață programul. `rideRequestId(namespace, windowId, ordinal)` și `rideRequestSpawnTick(window, ordinal)` sunt exportate pentru integrări și probe, dar identitatea și programul rămân definite într-un singur loc.

## Programul de scenariu

```typescript
interface RideDemandPlan {
  schemaVersion: 1;
  units: 'SI';
  scenarioId: string;
  mapId: string;
  seed: number;               // uint32
  namespace: string;
  windows: readonly RideDemandWindow[];
}

interface RideDemandWindow {
  windowId: string;           // cheie semantică, nu poziție în array
  startTick: number;
  endTick: number;            // exclusiv
  demandLevel: 'LOW' | 'NORMAL' | 'HIGH';
  requestCount: number;       // 1..256
  originZoneId: string | null;
  destinationZoneId: string | null;
}
```

Ferestrele sunt sortate canonic după `startTick`, apoi `windowId`; ordinea array-ului de intrare nu contează. `windowId` trebuie să fie unic. `endTick > startTick`, iar fiecare cerere primește un tick în `[startTick, endTick)`. Distribuția este deterministă și fără pierdere de precizie: cu `span = endTick - startTick`, `q = floor(span / requestCount)`, `r = span % requestCount`, offsetul este `min(span - 1, q * ordinal + min(ordinal, r))`.

O fereastră poate fixa `originZoneId` și/sau `destinationZoneId`. Altfel zonele sunt alese determinist din `map.serviceZones`, cu `deriveScenarioSeed(seed, scenarioId)` și eșantioane adresate de `windowId` + ordinal. Originea este o zonă `TAXI` care nu este `DROPOFF`; destinația este o zonă `TAXI` care nu este `PICKUP`. O cerere generată nu are aceeași zonă la ambele capete când există alternativă; dacă programul forțează aceeași zonă, cererea este respinsă explicit, nu corectată pe ascuns.

ID-ul este `createStableId('ride-request', namespace, [windowId, 'r0000'])`. Nu depinde de seed, de ordinea de admitere sau de un contor global de evenimente.

## Validarea înainte de alocare

`createRideDemand` validează fiecare cerere imediat. `validation(requestId).status` este un vocabular închis:

| Status | Cauză |
| --- | --- |
| `READY` | zone reale, acces `TAXI`, tip pickup/dropoff corect, traseu 041 `READY` |
| `UNKNOWN_ORIGIN` | originea nu există în `map.serviceZones` |
| `UNKNOWN_DESTINATION` | destinația nu există în `map.serviceZones` |
| `NOT_PICKUP_ZONE` | originea are `kind: 'DROPOFF'` |
| `NOT_DROPOFF_ZONE` | destinația are `kind: 'PICKUP'` |
| `ACCESS_MISMATCH` | una dintre zone nu admite `TAXI` |
| `SAME_ZONE` | pickup și dropoff sunt aceeași zonă |
| `NO_ROUTE` | plannerul 041 a răspuns `BLOCKED`, `UNREACHABLE` sau `BUDGET_EXHAUSTED` |

Pentru `READY`, `routeStatus`, `costSeconds` și `laneCount` păstrează răspunsul real al plannerului. Orice altă cerere apare în `rejections()` cu `reason: 'INVALID_REQUEST'`, nu intră în `pending()` și nu poate fi alocată de 060.

Validarea este un snapshot la crearea generatorului. Dispecerul 060 trebuie să replanifice la alocare, deoarece blocaje, versiuni de graf/cost sau trafic se pot schimba între cerere și asignare. Modulul nu rezervă taxiuri și nu garantează că o rută validă la creare rămâne validă.

## Coadă plafonată și overflow explicit

Coada `pending` este FIFO, ordonată după `spawnTick`, apoi `requestId`. Plafonul implicit este 64 (`RIDE_DEMAND_LIMITS.pendingRequests`) și poate fi redus prin `queueLimit`; valorile din afara `[1, 64]` sunt respinse.

Politica este explicită: `REJECT_NEWEST`. Când o cerere validă este admisă la un tick, dar coada este plină, cererea nu este pusă în coadă, `stats().overflow` crește, iar `rejections()` primește `reason: 'QUEUE_OVERFLOW'`. Cererile respinse nu sunt resurrectate de un `dequeue()` ulterior. `advance(atTick)` acceptă numai tick-uri întregi, nenegative și monotonice; un tick mai mic decât ultimul tick autoritativ aruncă `Stale ride demand tick`. Nu există `setTimeout`, `Date`, `performance.now` sau `Math.random`.

## Limite

| Limită | Valoare |
| --- | ---: |
| Ferestre per program | 256 |
| Cereri per program | 1024 |
| Cereri per fereastră | 256 |
| Cereri în coadă | 64 |
| Code units per ID de cerere | 256 |
| Code units per `windowId` | 64 |

Harta trebuie să aibă cel puțin o zonă `TAXI` de pickup și una de dropoff. `plan.mapId` trebuie să fie identic cu `map.mapId`. Un planner injectat trebuie să poată rezolva zonele hărții ca `ZONE`; altfel crearea eșuează explicit.

## Ownership și disposal

Generatorul deține lista de cereri, validările, respingerile, coada și, când nu primește un planner, plannerul 041 construit intern. Nu deține taxiuri, curse, corpuri Rapier, mesh-uri, listeners sau timere. `dispose()` este idempotent: golește toate cele patru structuri, readuce contoarele la zero, eliberează plannerul deținut și marchează `stats().disposed`. Un planner injectat rămâne al apelantului și nu este eliberat. După disposal, `advance` și `dequeue` aruncă, iar citirile returnează liste goale/zero.

`reset({ preserveStats })` este granița de scenariu 065: rewindează cursorul programului și golește coada, păstrând planul, validările și plannerul. Respingerile de overflow și contoarele `admitted`/`dequeued`/`overflow` sunt resetate, iar respingerile permanente de validare rămân; `preserveStats` păstrează numai contoarele cumulative. Resetul nu creează cereri noi și nu schimbă identitățile 006.

## Verificare

`tests/fleet/ride-demand.test.ts` acoperă: program fix, seed identic/diferit, ordine de ferestre inversată, granularitate diferită de `advance`, ID-uri unice, zone reale și accesibile, tip pickup/dropoff, respingerea destinației invalide/necunoscute/aceleiași zone, rută blocată, planner real 041, coadă plafonată cu overflow explicit, absența ceasului de perete, parsarea strictă și disposal-ul la zero. Raportul execută același program și păstrează 31 de verificări.

```powershell
npm run ride:demand
npm run ride:demand -- --check
```

Runnerul scrie [report.json](Evidence/059-ride-demand/report.json) și [report.md](Evidence/059-ride-demand/report.md). `--check` eșuează dacă transcriptul comis diferă; `npm test` include aceeași comparație.

## Ce NU este

- Nu este dispecerul 060: nu alege taxiuri, nu calculează ETA și nu alocă curse.
- Nu este lifecycle-ul 061–063: nu creează `Ride`, pickup/dropoff fizic sau rezultate comerciale.
- Nu implementează feedback rating→cerere și nu inventează cerere ascunsă din revenue; programul rămâne scenariul controlat din V1.
- Nu este fizică, trafic live, semafor sau rutare nouă. Refolosește harta 032, graful 033 și plannerul 041.
- Raportul este o probă funcțională deterministă, nu o măsurătoare de FPS/GPU/Rapier/hardware.
