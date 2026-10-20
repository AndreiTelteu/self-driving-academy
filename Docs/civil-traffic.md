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
});

traffic.list(); // CivilActorSnapshot[] ordonat după vehicleId
traffic.get(vehicleId); // CivilActorSnapshot | undefined
traffic.step({ tick, dtSeconds, vehicles }); // un tick, cel mult 1/60 s
traffic.setAuthority(vehicleId, 'MANUAL' | 'LEARNING', tick);
traffic.resume(vehicleId, tick); // AUTO: păstrează ruta, recitește stilul comun
traffic.refreshStyle(); // actualizare explicită a tuturor actorilor
traffic.report();
traffic.getStats();
traffic.dispose();
```

`vehicles` este lista opțională de observații externe (`vehicleId`, `driverKind`, poziție, heading, viteză, rază) folosită pentru taxiurile și civilii care nu aparțin acestui modul. Ea intră în același cadru 044, deci un taxi aflat în față devine lider semantic și produce frânare prin 048/047. Un actor civil nu poate apărea și în listă.

## Rute și determinism

La creare, civilii sunt luați din `registry.list()` filtrat cu `driverKind === 'CIVILIAN'`, în ordinea stabilă a ID-urilor. Pentru fiecare vehicul:

1. seed-ul de scenă este `deriveScenarioSeed(config.seed, config.scenarioId)`;
2. seed-ul vehiculului este `deriveVehicleSeed(sceneSeed, vehicleId)`;
3. banda de origine se alege determinist din benzile cu acces `CIVIL`, fără ca două vehicule să pornească pe aceeași bandă;
4. destinația se alege determinist, iar `planner.findRoute({ origin, destination, access: 'CIVIL' })` este singura sursă a traseului.

Un rezultat `READY` cu un path nenul și de maximum `CIVIL_TRAFFIC_LIMITS.routeLanes` (256, limita publică 041) este acceptat. Nu există un router local, un path construit din vecini laterali sau muchii inverse. Planul, `costSeconds`, `costVersion` și `graphVersion` sunt păstrate în snapshot. Când un actor ajunge la capătul rutei, următoarea rută pornește de la o conexiune declarată a ultimei benzi și trece tot prin 041; eșecul este raportat ca `blocked`, nu ascuns.

Aceeași configurație, populație și seed produc aceleași rute, poziții și viteze, independent de ordinea de creare a array-urilor. Nu se citește ceasul de perete.

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

`tests/fleet/civil-traffic.test.ts` acoperă populația 057, rutele 041 identice cu planul real, determinismul, stilul comun versus un profil de jucător, independența stării, aderența la bandă, liderul taxi cu gap fizic, limitele, lipsa dependenței de cameră/renderer și disposal-ul la zero. `tests/fleet/civil-traffic-report.ts` + `scripts/run-civil-traffic-report.mjs` produc raportul mașină-citibil.

```powershell
npm test
npm run civil:traffic
npm run civil:traffic -- --check
```

Raportul comis este [Docs/Evidence/058-civil-traffic/report.json](Evidence/058-civil-traffic/report.json), cu tabelul uman în [report.md](Evidence/058-civil-traffic/report.md).

## Limite

- Nu creează corpuri Rapier, mesh-uri sau materiale. Pozițiile și vitezele sunt contractul de simulare pe care composition root le poate lega la 022/024; legarea fizică și randarea rămân în afara 058.
- Nu implementează semafoare live, priorități de intersecție, STOP sau yield ca actuatoare noi. Acestea rămân contractele 036/037/038/045/050–054; 058 le poate consuma prin același lanț 044/045 când composition root le furnizează.
- Nu este dispecer, nu creează curse, ETA sau KPI și nu generează încasări pentru civili.
- Nu pretinde FPS, soak, browser sau acceptare hardware; raportul este o probă funcțională deterministă.
