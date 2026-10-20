# Dispecerizarea flotei 060

Status: implementare și validare funcțională locală. Contractul este pur: fără DOM, browser, Babylon, Rapier, renderer sau ceas de perete. Boardul canonic, mutarea în Done și publicarea rămân ale părintelui.

`src/fleet/dispatcher.ts` leagă coada reală 059 de registry-ul real 057 și de plannerul real 041. La fiecare pas alege taxiul disponibil cu cel mai mic cost real taxi→pickup, replanifică la asignare ambele etape (taxi→pickup și pickup→dropoff), revendică explicit taxiul și abia apoi scoate cererea din coadă. Modulul nu creează taxiuri, cereri, rute paralele sau identități noi: folosește exact ID-urile 057 și 059.

## API

```typescript
const dispatcher = createRideDispatcher({
  registry,                   // registry-ul real 057
  demand,                     // coada reală 059
  planner,                    // plannerul real 041 al apelantului
  map,                        // harta 032; demand.plan.mapId trebuie să coincidă
  positions,                  // port { laneFor(taxiId): string | null }
  maxAssignmentsPerStep: 4,   // opțional, plafonat la 16
  maxTaxiCandidates: 30,      // opțional, plafonat la 30
  maxRouteSearchesPerStep: 128,// opțional, plafonat la 256
});

dispatcher.step({ tick, maxAssignments }); // { assigned, rejected, blocked, availableCount, plannerSearches, budgetExhausted }
dispatcher.assignments();     // revendicări active, sortate după taxiId apoi requestId
dispatcher.assignmentFor(requestId);
dispatcher.availableTaxis();
dispatcher.taxiStatus(taxiId);
dispatcher.setTaxiStatus(taxiId, 'BLOCKED' | 'DAMAGED' | 'OFFLINE' | 'AVAILABLE', tick);
dispatcher.release(taxiId, reason, tick);
dispatcher.rejections();      // respingeri permanente, în ordine stabilă
dispatcher.releases();        // jurnal plafonat de eliberări
dispatcher.stats();
dispatcher.dispose();
```

`dispatchAssignmentId(namespace, requestId, taxiId)` este identitatea 006 stabilă a unei asignări; namespace-ul este `demand.plan.namespace`, deci asignarea nu inventează o a doua sursă de adevăr. `positions` aparține compoziției lumii (024/058) și întoarce o bandă sau o zonă reală; un taxi fără poziție nu este asignat.

## Disponibilitate

| Status | Cine îl publică | Semnificație |
| --- | --- | --- |
| `AVAILABLE` | apelant (implicit) | poate primi o cerere |
| `ASSIGNED` | exclusiv dispecerul | revendicare activă; nu se setează direct |
| `BLOCKED` | apelant | blocat în trafic sau imobilizat 029 |
| `DAMAGED` | apelant | avariat 029 |
| `OFFLINE` | apelant | scos din serviciu |

Taxiurile vin din `registry.list()` filtrat `driverKind: 'TAXI'` și sortat după ID; civilii nu sunt niciodată candidați, iar un ID de civil este refuzat de `setTaxiStatus`. `BLOCKED`, `DAMAGED` și `OFFLINE` nu apar în `availableTaxis()` și nu pot fi asignate. O revendicare activă este vizibilă ca `ASSIGNED`; `setTaxiStatus` refuză schimbarea statutului unui taxi revendicat, deci nu există o cale de a ascunde o ocupare. Dacă un taxi revendicat dispare din registry, pasul următor eșuează explicit, nu eliberează silent.

## Cost, replanificare și departajare

- Costul de dispecerizare este `pickupCostSeconds` = costul real 041 al traseului taxi→zona de pickup, calculat **la asignare**. Snapshotul `costSeconds` din validarea 059 nu este niciodată citit.
- Etapa pickup→dropoff este replanificată la asignare (`tripCostSeconds`); dacă nu mai este `READY`, cererea este respinsă explicit, chiar dacă validarea 059 încă spune `READY`.
- `totalCostSeconds = pickupCostSeconds + tripCostSeconds` este păstrat pentru lifecycle și ETA; alegerea taxiului folosește costul până la pickup, conform [modulului 07](07-flota-si-curse.md).
- Candidații sunt parcurși în ordinea stabilă a ID-ului. Câștigă costul strict mai mic; la cost egal câștigă ID-ul lexicografic mai mic. Rezultatul nu depinde de ordinea din `Map`, de ordinea de inserare a pozițiilor sau de ordinea din registry.
- Scanarea candidaților este „tot sau nimic”: dacă bugetul de căutări nu acoperă întreaga listă, pasul nu asignează și raportează `ROUTE_BUDGET_EXHAUSTED`, ca un cost minim să nu depindă de locul în care s-a terminat bugetul.
- Asignarea păstrează traseele reale (`pickupRouteLaneIds`, `tripRouteLaneIds`) și versiunile `graphVersion`/`costVersion`.

## Coadă și motive închise

Cererile sunt luate strict FIFO din `demand.pending()`, adică ordinea 059 `spawnTick` apoi `requestId`. Capul cozii este revendicat numai după ce traseul a fost replanificat și taxiul a fost ales; `demand.dequeue()` este verificat că a returnat exact cererea așteptată.

| Motiv | Efect |
| --- | --- |
| `NO_TAXI` | niciun taxi disponibil; cererea rămâne în coadă, zero căutări |
| `NO_POSITION` | taxiurile disponibile nu au poziție reală; cererea rămâne în coadă |
| `PICKUP_UNREACHABLE` | plannerul 041 nu găsește taxi→pickup `READY`; cererea rămâne în coadă |
| `TRIP_UNREACHABLE` | pickup→dropoff nu mai este `READY`; cererea este scoasă din coadă și înregistrată cu `routeStatus` brut |
| `ROUTE_BUDGET_EXHAUSTED` | bugetul pasului nu acoperă scanarea completă; cererea rămâne în coadă |

`blocked` descrie un blocaj tranzitoriu al capului cozii, iar `rejected` listează respingerile permanente ale pasului. Blocajul tranzitoriu nu este resurrectat automat: cererea rămâne în coada 059 și este reîncercată la pasul următor. Politica FIFO strictă înseamnă că un cap de coadă imposibil blochează cererile din spate până când devine asignabil sau este respins permanent; nu există reordonare ascunsă a cozii.

## Revendicare și eliberare

O revendicare activă este ținută simultan după taxi și după cerere, deci o cerere nu poate primi două taxiuri și un taxi nu poate primi două cereri. Eliberarea este explicită:

| Motiv | Statut următor |
| --- | --- |
| `COMPLETED`, `CANCELLED`, `FAILED` | `AVAILABLE` |
| `TAXI_BLOCKED` | `BLOCKED` |
| `TAXI_DAMAGED` | `DAMAGED` |
| `TAXI_REMOVED` | `OFFLINE` |

`release` întoarce asignarea eliberată sau `null` pentru un taxi neassignat, cere un tick mai mare sau egal cu asignarea și păstrează un jurnal plafonat. Tick-ul pasului este monoton; un tick descrescător este refuzat.

## Limite

| Limită | Valoare |
| --- | ---: |
| Asignări per pas | 4 (override maximum 16) |
| Candidați taxi per cerere | 30 |
| Căutări 041 per pas | 128 (maximum 256) |
| Intrări în jurnalul de eliberări | 128 |
| Intrări în jurnalul de respingeri | 128 |
| Cereri asignate dintr-un plan | capacitatea 059 (1024) |

## Ownership și disposal

Dispecerul deține numai harta de statusuri, revendicările active, setul de cereri deja dispecerizate și cele două jurnale plafonate. Registry-ul, coada și plannerul sunt injectate și rămân ale apelantului; `dispose()` este idempotent, readuce toate structurile și contoarele la zero și nu eliberează contractele injectate. După disposal, `step`, `release` și `setTaxiStatus` aruncă, iar citirile întorc liste goale sau zero.

## Verificare

`tests/fleet/dispatcher.test.ts` acoperă: alegerea după costul real 041 (nu după distanță sau snapshot), replanificarea ambelor etape, respingerea unei rute devenite blocate, egalitatea de cost cu departajare stabilă independentă de ordinea registry-ului, taxiurile blocate/avariate/offline/busy/civile, lipsa taxiului, lipsa poziției, asignarea unică, eliberarea explicită pentru fiecare motiv, bugetul per pas, absența ceasului de perete și disposal-ul la zero. Raportul execută aceleași reguli pe programul real 059 și păstrează 28 de verificări.

```powershell
npm run fleet:dispatch
npm run fleet:dispatch -- --check
```

Runnerul scrie [report.json](Evidence/060-dispatcher/report.json) și [report.md](Evidence/060-dispatcher/report.md). `--check` eșuează dacă transcriptul comis diferă; `npm test` include aceeași comparație.

## Ce NU este

- Nu este lifecycle-ul 061–063: nu creează `Ride`, nu produce pickup/dropoff fizic, tarif, review sau KPI.
- Nu este planner nou și nu prezice traficul: blocajele, traficul și versiunile sunt intrări explicite ale apelantului.
- Nu mișcă taxiurile și nu actualizează poziția după asignare; poziția rămâne a compoziției 024/058, iar ETA live și HUD rămân PBI-urilor 064–065.
- Nu rezolvă revendicarea unui taxi avariat în timpul cursei; apelantul folosește `release(..., 'TAXI_DAMAGED', tick)`, iar consecințele cursei aparțin lifecycle-ului.
- Raportul este o probă funcțională deterministă, nu o măsurătoare de FPS/GPU/Rapier/hardware.
