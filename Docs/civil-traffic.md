# Trafic civil cu rute proprii (PBI058)

Status: implementare și validare funcțională locală. Contractul este pur: fără DOM, browser, Babylon, Rapier sau ceas de perete. Boardul canonic și publicarea rămân ale părintelui.

`src/fleet/civil-traffic.ts` transformă civilii din [registry-ul 057](fleet-registry.md) în actori de trafic cu rută proprie. Fiecare rută este produsă de [plannerul 041](route-planner.md) peste [graful real de benzi 033](lane-graph.md), iar urmărirea folosește lanțul real de autonomie [044](road-context.md) → [046](cruise-targets.md) → [047](longitudinal-control.md) → [048](following.md). Profilul de stil este un singur profil comun al orașului; modulul nu acceptă profiluri per vehicul sau per jucător.

## API

```typescript
const traffic = createCivilTraffic({
  registry, // FleetRegistry 057, caller-owned
  map, // harta 032 validată
  graph, // opțional, 033; trebuie să aibă același mapId
  planner, // opțional, 041; caller-owned când este injectat
  style: cityProfile, // DrivingProfile comun, sau
  styleSource: { activeStyle: () => cityProfile }, // sursa activă a orașului
  seed, // opțional; implicit seed-ul registry-ului
  spawnLanes, // opțional: benzile primelor actori, în ordinea stabilă a ID-urilor
  spawnOffsetsM, // opțional: distanța inițială pe rută, aliniată cu spawnLanes
});

traffic.list(); // CivilActorSnapshot[] ordonat după vehicleId
traffic.get(vehicleId); // CivilActorSnapshot | undefined
traffic.addVehicle(vehicleId, { avoid, clearanceM }); // 269/284, fără ID duplicat sau spawn peste jucător
traffic.step({ tick, dtSeconds, vehicles }); // un tick, cel mult 1/60 s
traffic.setAuthority(vehicleId, 'MANUAL' | 'LEARNING', tick); // suspendă ruta, nu o duplică
traffic.reconcile(vehicleId, { positionM, headingRad, speedMps }, tick); // poza condusă, proiectată pe 033
traffic.resume(vehicleId, tick); // AUTO: păstrează ruta, recitește stilul comun
traffic.refreshStyle(); // actualizare explicită a tuturor actorilor
traffic.report();
traffic.getStats();
traffic.dispose();
```

`vehicles` este lista opțională de observații externe (`vehicleId`, `driverKind`, poziție, heading, viteză, rază) folosită pentru taxiurile și civilii care nu aparțin acestui modul. Ea intră în același cadru 044, deci un taxi aflat în față devine lider semantic și produce frânare prin 048/047. Un actor civil nu poate apărea și în listă.

## Taxiuri și flota live (PBI 262)

Modulul acceptă opțional `driverKinds: ['TAXI', 'CIVILIAN']` și `spawnLanesByKind`/`spawnOffsetsMByKind`. Taxiurile sunt actori ai aceluiași contract: primesc rute 041 cu acces `TAXI`, intră în același cadru 044, folosesc aceeași clasă mecanică 023 și aceeași buclă 047/048. Snapshot-ul publică `driverKind` real, `route.access`, clasa și autoritatea; nu există un al doilea model de simulare pentru taxiuri. Implicit, fără opțiuni, comportamentul 058 rămâne exact civilii (testele și raportul comis nu se schimbă).

`contextRefresh: 'DECISION_PERIOD'` folosește cadența reală de decizii 10 Hz din Docs/25, păstrând controller-ul la 60 Hz. Liderul fizic este recalculat la fiecare tick din pozițiile curente, deci gap-ul 048 rămâne actual chiar între decizii. `'EVERY_TICK'` rămâne implicit și păstrează comportamentul istoric 058.

Flota live folosește `'DECISION_PERIOD'`; costul măsurat pentru 70 de vehicule este raportat în [Evidence/262-live-fleet/cost.json](Evidence/262-live-fleet/cost.json).

## Preluare, suspendare și reluare (PBI 284)

Orice actor taxi sau civil poate fi preluat de jucător, fie prin `M` din panoul `Flotă`, fie prin
intrarea directă `G` când ușa este în rază. La preluare, compunerea cheamă `setAuthority(..., 'MANUAL')`
sau `'LEARNING'` și îngheață exact progresul curent al rutei; nu creează o a doua rută, un al doilea
actor sau o a doua autoritate. `step` nu avansează un actor cu autoritate non-AUTO, deci ruta rămâne
suspendată cât timp jucătorul conduce.

La ieșire, compunerea trimite poza condusă prin `reconcile`: dacă banda este încă pe rută, progresul
este proiectat pe ea și ruta rămâne identică; dacă jucătorul a părăsit ruta, plannerul 041 produce o
continuare către aceeași destinație. Apoi `resume` revine în AUTO și recitește stilul comun. Proiecția cere o bandă reală din graful 033;
pe drum, poza condusă este păstrată, iar când ieșirea este off-graph actorul revine în AUTO la ultima
poză reconciliată pe bandă, iar evenimentul `EXIT_ACCEPTED` raportează motivul. Această margine poate
repoziționa mașina pe bandă; ea nu este raportată ca un handoff fără teleport.
`reconcile` și `resume` sunt singurele căi de handoff; ele păstrează `vehicleId`, clasa și destinația.

`addVehicle` acceptă opțional `avoid: [{ x, z, radiusM }]` și `clearanceM`. Un vehicul creat după
start (achiziție 269) alege o origine reală `CIVIL`/`TAXI`, cere ruta tot prin 041 și păstrează
distanța cerută față de jucător, mașinile existente și decor; dacă nu există o bandă complet liberă,
alege determinist originea cu cea mai mare distanță. Nu inventează o poziție în afara path-ului.

Contextul 044 publicat de 058 include semnalele reale 036 și amprentele 032 ale zonelor de serviciu.
Obstacolele destructibile rămân sursa 285, iar pietonii 286; absența lor nu este raportată ca un
context complet inventat.

## Rute și determinism

La creare, civilii sunt luați din `registry.list()` filtrat cu `driverKind === 'CIVILIAN'`, în ordinea stabilă a ID-urilor. Pentru fiecare vehicul:

1. seed-ul de scenă este `deriveScenarioSeed(config.seed, config.scenarioId)`;
2. seed-ul vehiculului este `deriveVehicleSeed(sceneSeed, vehicleId)`;
3. banda de origine se alege determinist din benzile cu acces `CIVIL`, fără ca două vehicule să pornească pe aceeași bandă;
4. destinația se alege determinist, iar `planner.findRoute({ origin, destination, access: 'CIVIL' })` este singura sursă a traseului.

Un rezultat `READY` cu un path nenul și de maximum `CIVIL_TRAFFIC_LIMITS.routeLanes` (256, limita publică 041) este acceptat. Nu există un router local, un path construit din vecini laterali sau muchii inverse. Planul, `costSeconds`, `costVersion` și `graphVersion` sunt păstrate în snapshot. Când un actor ajunge la capătul rutei, următoarea rută pornește de la o conexiune declarată a ultimei benzi și trece tot prin 041; eșecul este raportat ca `blocked`, nu ascuns.

Aceeași configurație, populație și seed produc aceleași rute, poziții și viteze, independent de ordinea de creare a array-urilor. Nu se citește ceasul de perete.

`spawnLanes` este o extensie opțională pentru composition root: primii actori, în ordinea stabilă a
ID-urilor, încearcă originile date. Fiecare bandă trebuie să fie `CIVIL` și unică; dacă planner-ul
041 nu găsește o rută din ea, actorul revine la căutarea deterministă de origine. `spawnOffsetsM`
este aliniat cu `spawnLanes` și mută actorul pe aceeași rută cu distanța dată, plafonată la lungimea
rutei; nu inventează o poziție în afara path-ului. Nu este un al doilea router și nu ocolește
`findRoute`; folosirea lor în joc este documentată în
[traficul AI din browser](browser-ai-traffic.md).

## Stilul comun al orașului

Modulul cere exact una dintre cele două intrări: `style` (un `DrivingProfile` publicat) sau `styleSource` (portul activ al orașului). Profilul trebuie să aibă `profileId`-ul din configurația flotei; un profil străin este respins. Toate cheile consumate sunt parametri reali din registry-ul 092: cele patru chei 046, cele patru chei 047, cele patru chei 048, plus cheile politicilor 050–053 folosite de lanțul de autonomie.

Fiecare civil păstrează versiunea aplicată în propriul snapshot. La `resume`, versiunea activă a orașului este recitită și recompilată; ruta rămasă neschimbată, iar `appliedProfileVersion` din registry este actualizată. `refreshStyle()` este singura propagare explicită către toți actorii. Nu există profil fix ascuns, profil per jucător sau personalitate derivată din clasă.

## Urmărire, interacțiuni și limite pe tick

La fiecare apel se construiește un cadru 044 cu toți civilii și cu observațiile externe, sortat după ID. Pentru fiecare actor:

- contextul compact 045 este proiectat din 044;
- faptele rutiere 046 folosesc banda, limita reală și apropierea de capătul benzii;
- `evaluateFollowingTarget` (048) reduce ținta după liderul din aceeași bandă;
- `createLongitudinalController` (047) produce accelerația la 60 Hz;
- planta cinematică integrează accelerația și avansează pe path-ul direcționat al benzii.

Un lider este raportat cu ID, tip (`TAXI`/`CIVILIAN`), gap și viteză. Gap-ul fizic minim este păstrat prin limitarea avansului la `leader.gapM - minimumGapM`; la schimbarea benzii, un actor așteaptă la capătul benzii curente dacă banda următoare are deja un vehicul în primii 6 m. Astfel, doi civili nu împart aceeași poziție și un taxi aflat în față nu este traversat.

Limitele sunt fixe: maximum 40 de actori (limita 057), maximum 110 vehicule într-un cadru 044 (V1: 40 de civili plus cel mult 30 de taxiuri), exact un pas de 60 Hz (`dtSeconds ≤ 1/60`, un singur apel per tick) și cel mult o bandă nouă pe tick. Tick-urile trebuie să fie consecutive, la fel ca în 047; schimbarea de autoritate se face la ultimul tick simulat. Nu există istoric de decizii, coadă proprie sau buclă de timp.

## Ownership și disposal

Traficul deține stările civililor, controllerul longitudinal 047, motorul 044 și, dacă nu a fost injectat, plannerul 041. Registry-ul 057 rămâne al apelantului. `dispose()` este idempotent, golește actorii, controllerul, contextul rutier și plannerul deținut; după disposal orice mutație este respinsă, iar statisticile raportează zero. Nu se creează corpuri Rapier, mesh-uri, materiale, listeners, timere sau referințe către cameră/renderer.

## Verificare

`tests/fleet/civil-traffic.test.ts` acoperă populația 057, rutele 041 identice cu planul real, determinismul, stilul comun versus un profil de jucător, independența stării, aderența la bandă, liderul taxi cu gap fizic, limitele, `spawnLanes`, lipsa dependenței de cameră/renderer și disposal-ul la zero (12 teste). `tests/fleet/civil-traffic-report.ts` + `scripts/run-civil-traffic-report.mjs` produc raportul mașină-citibil.

```powershell
npm test
npm run civil:traffic
npm run civil:traffic -- --check
npm run civil:autonomy
npm run civil:autonomy -- --check
npm run civil:autonomy:cost
```

Raportul comis 058 este [Docs/Evidence/058-civil-traffic/report.json](Evidence/058-civil-traffic/report.json), cu tabelul uman în [report.md](Evidence/058-civil-traffic/report.md). Dovezile 284 pentru autonomia completă, preluare, reluare, profil, spawn și cost sunt în [Evidence/284-civil-autonomy](Evidence/284-civil-autonomy/README.md).

## Limite

- Nu creează corpuri Rapier, mesh-uri sau materiale. Pozițiile și vitezele sunt contractul de simulare pe care composition root le poate lega la 022/024; legarea fizică și randarea rămân în afara 058.
- Nu implementează semafoare live, priorități de intersecție, STOP sau yield ca actuatoare noi. Acestea rămân contractele 036/037/038/045/050–054; 058 le poate consuma prin același lanț 044/045 când composition root le furnizează.
- Nu este dispecer, nu creează curse, ETA sau KPI și nu generează încasări pentru civili.
- Preluarea și reluarea sunt dovedite în compunerea reală Node și într-un fixture Chromium; shell-ul Babylon complet randat rămâne proba 287, nu o afirmație a acestui contract.
- Obstacolele destructibile (285) și pietonii (286) nu sunt surse de context încă; 058 nu le inventează.
- Nu pretinde FPS, soak, browser hardware sau acceptare hardware; raportul este o probă funcțională deterministă.
