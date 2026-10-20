# Dovezi 058 — trafic civil cu rute proprii și stilul comun

Status: implementare și validare funcțională locală PASS. Boardul canonic, mutarea în Done și publicarea rămân ale părintelui. Nivel de validare: `functional` (politica 2026-10-08); nu se revendică browser, FPS, soak, Rapier sau hardware.

## Ce s-a livrat

- `src/fleet/civil-traffic.ts` — trafic civil determinist peste registry-ul 057, plannerul 041, graful 033 și lanțul 044/046/047/048, cu profilul comun al orașului.
- `src/fleet/index.ts` — export public al contractului.
- `tests/fleet/civil-traffic.test.ts` — 11 teste țintite.
- `tests/fleet/civil-traffic-fixture.ts` — profilul comun construit din valorile reale 092 și fixture-ul hărții/planner-ului.
- `tests/fleet/civil-traffic-report.ts` + `scripts/run-civil-traffic-report.mjs` + `npm run civil:traffic` — raportul mașină-citibil și tabelul uman.
- [Docs/civil-traffic.md](../../civil-traffic.md) — API, reguli de rută/stil, limite și ownership.
- [Docs/07-flota-si-curse.md](../../07-flota-si-curse.md), [Docs/06-autonomie-si-trafic.md](../../06-autonomie-si-trafic.md) și [Docs/README.md](../../README.md) — paragrafele de integrare.

## Rezultat

- 40 de civili din registry-ul 057, fiecare cu ID propriu, rută `READY` și origine distinctă la spawn.
- Toate cele 40 de rute sunt exact planurile reale 041 pe muchii `CIVIL`, cu `path[0] = originLaneId` și ultimul element `destinationLaneId`.
- Toate pozițiile de spawn se proiectează pe banda proprie cu distanță sub 0,001 m; rularea mixtă păstrează 7200/7200 cadre actor-pe-bandă.
- Toți civilii raportează `city-profile` / versiunea comună activă; profilul de jucător `player-style-v9` nu apare niciodată.
- Un taxi aflat în față este lider 044, iar viteza urmăritorului scade sub martorul fără taxi; gap-ul minim rămâne peste limita fizică.
- `setAuthority(MANUAL)` îngheață doar actorul adresat; `resume` păstrează exact ruta, recitește stilul comun v2 și readuce registry-ul pe `AUTO`.
- `dispose()` este idempotent și readuce la zero actorii, controllerul 047, contextul 044 și plannerul deținut.

Raportul complet are [30/30 verificări](report.json), tabelul uman este în [report.md](report.md), iar ieșirea brută a testelor 058 este în [tests.txt](tests.txt).

## Reguli verificate

- **Rută reală:** `source: '041-route-planner'`, plan identic cu `planner.findRoute`, cost/versiuni păstrate; un path inventat sau o rută doar cu originea nu trece.
- **Stil comun:** exact un `style` sau un `styleSource`, `profileId` identic cu cel al flotei, doar chei 092 reale; profilurile per jucător/vehicul sunt absente din API.
- **Determinism:** seed de scenă → seed de vehicul → origine/destinație; două lumi cu același seed sunt identice la spawn și după 20 de tick-uri.
- **Independență:** fiecare actor are propriul obiect de progres și propria versiune aplicată; oprirea unuia nu mișcă ceilalți.
- **Bandă și gap:** poziția provine din path-ul direcționat, gap-ul fizic este plafonat, iar intrarea pe o bandă ocupată așteaptă la capătul benzii curente.
- **Limite:** 40 de actori, maximum 110 vehicule într-un cadru 044 (V1: 40 + 30), exact un pas de 60 Hz (`dtSeconds ≤ 1/60`) și tick-uri consecutive; depășirile sunt respinse închis.
- **Fără cameră/renderer:** sursa nu conține Babylon, DOM, renderer sau cameră; snapshotul nu expune selecție, mesh sau vizibilitate.
- **Ownership:** disposal la zero, fără istoric (`retainedHistory: 0`), fără listeners sau timere.

## Comenzi și rezultate exacte

```powershell
volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run lint
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check
# All matched files use Prettier code style! exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture
# PASS (182 TypeScript files), negative probes 6+4+3, exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog
# Parameter catalog is synchronized. exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm test
# tests 1179, pass 1179, fail 0 (baseline 1168/1168 înainte de 058)

volta run --node 24.21.0 --npm 11.19.0 -- npm run civil:traffic -- --check
# SUMMARY checks 30/30, mixed 7200 on-lane frames, overall PASS
# Civil traffic report is current: Docs/Evidence/058-civil-traffic/report.json
```

Logul complet al comenzilor este în [checks.txt](checks.txt). Rularea fără `--check` rescrie [report.json](report.json) și [report.md](report.md).

## Limite

- Nu creează corpuri Rapier, mesh-uri sau materiale. Oferă poziții/viteze deterministe și gap fizic în spațiul benzilor; legarea la 022/024 și randarea rămân composition root.
- Nu implementează semafoare live, priorități de intersecție, STOP sau yield ca actuatoare noi; acestea rămân 036/037/038/045/050–054. Rularea mixtă verifică prin-intersecție, aderența la bandă, liderul taxi și gap-ul, nu certifică toate regulile de prioritate.
- Nu este dispecer, nu creează curse/ETA/KPI și nu generează încasări pentru civili.
- Raportul este o probă funcțională deterministă, nu o măsurătoare de FPS/GPU/Rapier/hardware.
