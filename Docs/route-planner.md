# Rutare A* peste graful de benzi (PBI041)

`createRoutePlanner({ graph, map, graphVersion, costVersion, blocked?, trafficSeconds?, maxExpansions? })` construiește un router determinist peste [graful direcționat de benzi](lane-graph.md) și harta validată032 care îi aparține (același `mapId`). Nu importă Babylon, DOM, mesh-uri sau corpuri fizice și nu deține stare globală. `findRoute(query)` întoarce sincron un `RoutePlan`, iar `createRouteTask(request)` implementează portul cooperativ cerut de [schedulerul219](simulation-scheduling.md).

## Costul, explicit și versionat

`ROUTE_COST_MODEL` (`version: 'route-cost-v1'`) fixează modelul:

- traversarea unei benzi costă `lengthM / clamp(speedLimitMps, minSpeedMps, …)` secunde, din geometria reală a benzii directionate (metri) și limita de viteză a hărții;
- fiecare conexiune adaugă o penalizare explicită: un `TURN` declarat (Movement) costă `turnPenaltyS`, o `CONTINUATION` costă `continuationPenaltyS`;
- opțional, `trafficSeconds` (Map bandă→secunde) adaugă cost de trafic, iar `blocked` marchează benzi netraversabile. Ambele sunt intrări ale apelantului, niciodată stare ascunsă.

Heuristica A* este distanța în linie dreaptă de la capătul benzii curente la începutul benzii destinație, împărțită la viteza maximă din hartă; este admisibilă, iar nodurile pot fi redeschise, deci optimalitatea costului nu cere o heuristică consistentă. Numărul de expansiuni este plafonat, deci un graf inaccesibil sau patologic se termină.

## Sens, acces și destinații

Traversarea folosește exclusiv `getConnections(id, access)` (succesori declarați cu `TURN`/`CONTINUATION`), filtrate după acces la ambele capete. Niciodată nu se folosesc vecinii laterali ca muchii, nu se inventează muchii inverse, iar o bandă cu sens unic nu poate fi parcursă invers. Clasa TAXI/CIVIL selectează mulțimea de muchii, deci aceeași origine/destinație poate produce trasee diferite.

Destinația poate fi un `id` de bandă sau un `id` de `serviceZone` din hartă. Pentru o zonă, traseul se termină pe banda care deservește efectiv zona pentru accesul cerut; dacă zona nu permite accesul cerut, rezultatul este explicit `SERVICE_ACCESS_MISMATCH`, nu un succes mut. `resolveDestination(id, access)` expune rezolvarea (LANE/ZONE) pentru dispeceri. Originea poate fi și o zonă.

## Eșec explicit și terminare garantată

`findRoute` întoarce `RoutePlan.status` dintr-un set închis: `READY`, `BLOCKED` (origine/destinație blocată), `UNREACHABLE`, `ORIGIN_UNKNOWN`, `DESTINATION_UNKNOWN`, `SERVICE_ACCESS_MISMATCH`, `BUDGET_EXHAUSTED`. `path` este `null` pentru orice altceva decât `READY`, iar `costSeconds` este `Infinity` fără traseu. Nu există buclă infinită: `ROUTE_PLANNER_LIMITS.maxExpansions` (16384 implicit) plafonează o căutare, iar depășirea produce `BUDGET_EXHAUSTED`.

## Integrarea 219

`createRouteTask(request: ScheduledRouteRequest)` întoarce exact `{ step, dispose }`: `step({ tick, maxExpansions })` execută cel mult bugetul cerut și respectă plafonul total, `dispose()` eliberează starea privată din closures. Traseul returnat începe la `request.origin` și se termină la `request.destination`, deci portul acceptă `id`-uri de benzi; un dispecer rezolvă întâi o zonă cu `resolveDestination`. `findRoute` rămâne varianta sincronă pentru apel direct și teste.

**Coada de joburi aparține lui 219.** Plannerul nu duplică coada: se conectează prin `createRouteTask`, iar ordinea (`urgent` înaintea `normal`, apoi tick-ul cererii, id-ul actorului lexicografic și tichetul), cele 4 felii/tick cu 16 expansiuni, admiterea a 16 joburi, expirarea la 120 tick-uri și cache-ul de 64 intrări sunt exact contractul [schedulerului219](simulation-scheduling.md). Schimbarea blocajelor trebuie însoțită de o nouă `costVersion` (ca la 219), astfel încât cheia din cache-ul schedulerului să se schimbe; `createRouteTask` respinge o cerere cu versiuni diferite.

## Cache plafonat și invalidare

Plannerul păstrează un cache propriu pentru `findRoute`, plafonat la `ROUTE_PLANNER_LIMITS.cacheEntries` (64, egal cu `SCHEDULING_LIMITS.routeCache`). Cheia include `graphVersion`, `costVersion`, semnătura mulțimii blocate, semnătura greutăților de trafic, origine, destinație și acces, deci o schimbare de graf/blocaj/cost nu poate întoarce un traseu vechi. `setBlocked`, `setVersions`, `setTrafficSeconds` și `invalidate` golesc cache-ul și incrementează `invalidations`. Rezultatele negative stabile (inclusiv `null`) sunt păstrate; `BUDGET_EXHAUSTED` nu este niciodată cache-uit. Lungimea stocată a traseelor este plafonată la 256 benzi de maximum 256 unități UTF-16 fiecare. Evictarea este deterministă (cel mai vechi `lastUsed`, apoi cheia lexicografică).

`getStats()` raportează `graphVersion`, `costVersion`, `blockedSignature`, `trafficSignature`, `cacheEntries`, `cacheLimit`, `cachePathCodeUnits`, `invalidations`, `expansions`, `searches`, `hits`, `misses`, `maxExpansions` și `disposed`. `dispose()` eliberează cache-ul și starea privată, nu înregistrează listeneri și nu lasă stare globală; după disposal căutările aruncă.

## Ce NU este

Nu este fizică și nu validează fezabilitatea dinamică a unei manevre. Nu acordă permisie de trecere: un TURN static valid nu înseamnă trecere pe RED; semaforul live, STOP, prioritățile și admiterea în intersecție rămân contractele [signals](signals.md), [stop-rules](stop-rules.md) și [priority-rules](priority-rules.md). Nu este dispecerul de flotă045 și nu decide ce vehicul primește ce cursă. Nu detectează obstacole live prin senzori: blocajele sunt o intrare explicită a apelantului, nu o observare a lumii fizice. Nu prezice traficul și nu garantează o rută în afara grafului static.

[Verificarea](Evidence/041-route-planner/README.md) acoperă drum blocat, sens unic, origine/destinație în afara grafului, zone de serviciu, determinism, plafonul și invalidarea cache-ului, terminarea mărginită, filtrarea TAXI/CIVIL, paritatea de accesibilitate și optimalitatea costului față de referința219 păstrată, plus costul CPU local înainte/după.
