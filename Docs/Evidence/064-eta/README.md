# Dovezi 064 — ETA și progresul traseului

Status: implementare și validare funcțională locală PASS. Boardul canonic, mutarea în Done și publicarea rămân ale orchestratorului. Nivel de validare: `functional` (politica 2026-10-08); nu se revendică browser, FPS, soak, Rapier sau hardware.

## Ce s-a livrat

- `src/fleet/eta.ts` — ETA și progres pur peste traseul real 041 al asignării 060 și lifecycle-ul 061: profil de timp pe benzi, distanță rămasă, segment curent, interval de incertitudine declarat, progres forward-only, reproiecție documentată și motive închise.
- `src/fleet/index.ts` — export public aditiv.
- `tests/fleet/eta.test.ts` — 13 teste țintite.
- `tests/fleet/eta-fixture.ts` — flota 057, harta 032, plannerul 041, coada 059, asignările 060 și lifecycle-ul 061; plus o rută reală cu asignare stub pentru cazurile de rută lipsă/invalidă.
- `tests/fleet/eta-report.ts` + `scripts/run-eta-report.mjs` + `npm run ride:eta` — raport mașină-citibil, simularea reală și tabelul uman.
- [Docs/eta.md](../../eta.md) — API, model de timp, incertitudine, progres/reproiecție, motive, prospețime, limite și ownership.
- [Docs/07-flota-si-curse.md](../../07-flota-si-curse.md) — paragraful de integrare.
- [report.json](report.json), [report.md](report.md), [checks.txt](checks.txt), [tests.txt](tests.txt) — transcripturile.

## Rezultat

- ETA la progres 0 reproduce exact costul real 041 al etapei (`83.776386 s` pentru cursa de bază), iar intervalul publicat este ordonat: `76.160351 s ≤ 83.776386 s ≤ 93.084873 s` în trafic liber. Viteza medie planificată este `12.258824 m/s` din `1067.884216 m` de traseu real.
- ETA scade cu distanța rămasă: la mijlocul ultimei benzi, când progresul este `0.91928`, ETA este `7.230957 s`, adică `8.63%` din ETA completă. O implementare care ar întoarce costul întregii etape nu poate trece acest probe.
- Progresul este strict forward-only: o observație în urmă (`lane:00E0` după progres la `lane:10S0`) produce `OFF_ROUTE`, păstrează `0.417806` și `etaSeconds: null`; o observație înainte avansează la `0.588066`.
- Reproiecția acceptă o bandă paralelă reală (`lane:20N1` față de `lane:20N0`) la `3.7 m`, în fereastra înainte, și o raportează pe segmentul corect (`segmentIndex 2`), cu `reprojected: true`. Golul real dintre două benzi (`lane:00E0 → lane:10E0`) este acceptat ca `CONNECTION` la `0 m` lateral, cu progres `0.164999` și ETA `69.314472 s` (golul adaugă distanță, nu cost planificat).
- O poziție din urmă, după progresul la `0.91928`, nu este „snapped” pe un segment anterior: `OFF_ROUTE`, progres neschimbat, ETA indisponibilă. O poziție fără nicio bandă reală produce `POSITION_INVALID`.
- Lipsa rutei produce `UNAVAILABLE`/`ROUTE_MISSING` cu `etaSeconds`, `remainingDistanceM`, `progressFraction` și `routeLaneIds` toate `null`; nu există `0` secunde cert. Un cost negativ produce `ROUTE_INVALID`, iar o secvență de benzi neconectată produce `ROUTE_STALE`.
- După o replanificare (`setBlocked` pe o bandă din traseu), ETA veche devine `ROUTE_STALE` imediat, cu toate câmpurile de traseu `null`; după eliminarea blocajului, aceeași rută redevine `ESTIMATED` și progresul certificat nu scade. Un ETA creat abia după replanificare refuză și el traseul vechi (`ROUTE_STALE`, `lateCreatedEta: null`).
- Starea serviciului schimbă rezultatul: `FREE_FLOW` `62.238703 s`, `CONGESTED` `124.477407 s` (raport `2`, interval `95.751851–177.824867 s`), `BLOCKED` `SERVICE_BLOCKED` cu `etaSeconds: null` dar progresul continuă. Revenirea la `FREE_FLOW` produce din nou ETA.
- Rerutarea reală: blocarea a două benzi arteriale forțează 060 să replanifice etapa de la 6 benzi/`83.776386 s` la 8 benzi/`110.428305 s`; ETA nouă este `110.428305 s`, iar traseul vechi raportează `ROUTE_STALE`.
- Sosirea este autoritativă: `PICKUP` și `DROPOFF` raportează `ARRIVED`, progres `1`, distanță rămasă `0`, ETA `0`; o cursă `COMPLETED` raportează `RIDE_TERMINAL` cu `etaSeconds: null`.
- Viteza `NaN`, infinită sau negativă, poziția `NaN`, tick-ul fracționar și câmpurile necunoscute sunt erori de contract; un tick în urmă produce `STALE_TICK` fără să schimbe progresul.
- Simularea reală: 24 de taxiuri și 20 de civili din registry-ul 057, 32 de cereri 059, asignări 060, pickup 062 și dropoff 063 reale. Toate cele 32 de curse sunt estimate pe ambele etape: 311 eșantioane (141 pickup, 170 trip), zero violări de monotonie, zero inversiuni de ETA, zero poziții off-route/invalide, 64 de încărcări de traseu (2 etape × 32 curse), ETA minimă `0` și maximă `105.164269 s`.
- Cele 4 eșantioane cu ETA `0` sunt rute 041 reale cu cost `0` (`origine == banda destinație`, taxiul deja pe banda zonei de pickup); nu sunt rute lipsă și nu sunt confundate cu ele. Simularea raportează separat `zeroCostSamples: 4`.
- Sursa nu conține `Date`, `performance.now`, timere, `Math.random`, DOM, Babylon sau Rapier.
- `dispose()` readuce observațiile, estimările, sosirile, indisponibilitățile, încărcările de traseu și tick-ul la zero fără a elibera revendicarea 060.

Raportul complet are [24/24 verificări](report.json), tabelul uman și simularea sunt în [report.md](report.md), iar ieșirile brute sunt în [checks.txt](checks.txt) și [tests.txt](tests.txt).

## Reguli verificate

- **Rută reală:** exact `ride.pickupRouteLaneIds`/`ride.tripRouteLaneIds` și `pickupCostSeconds`/`tripCostSeconds` din asignarea 060; fără id-uri, rute sau costuri paralele.
- **Timp:** profilul de timp al benzilor 041 (lungime reală / limita reală de viteză), distribuit proporțional pe costul real al etapei, plus golurile de intersecție ca distanță fără cost. Fără ceas de perete.
- **Incertitudine:** factori declarați pe starea serviciului; `etaMin ≤ eta ≤ etaMax`. Sunt provizorii, nu o predicție de trafic.
- **Progres:** forward-only; `traveled = max(anterior, nou)`; nicio observație nu readuce progresul.
- **Reproiecție:** numai în fereastra înainte (8 benzi), în toleranța laterală (4 m), niciodată pe un segment cu sens opus; banda reală 033 ancorează segmentul curent.
- **Motive închise:** `ROUTE_MISSING`, `ROUTE_STALE`, `ROUTE_INVALID`, `POSITION_INVALID`, `OFF_ROUTE`, `SERVICE_BLOCKED`, `STALE_TICK`, `WRONG_RIDE`, `FOREIGN_VEHICLE`, `RIDE_TERMINAL`.
- **Prospețime:** semnătura intrărilor plannerului (`graphVersion`, `costVersion`, `blockedSignature`, `trafficSignature`) plus replanificarea de verificare a etapei față de 041 (aceeași secvență de benzi și același cost); orice diferență este `ROUTE_STALE`.
- **Ownership:** modulul nu deține și nu eliberează taxiul, cursa, traseul, graful sau plannerul; `dispose()` eliberează numai starea proprie.

## Comenzi și rezultate exacte

```powershell
volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run lint
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check
# All matched files use Prettier code style! exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture
# Architecture imports: PASS (188 TypeScript files); negative probes 6+4+3; exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog
# Parameter catalog is synchronized. exit 0

volta run --node 24.21.0 -- node --import ./scripts/register-typescript.mjs --test tests/fleet/eta.test.ts
# 13/13 pass, exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm test
# 1252/1252 pass, exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run ride:eta
# 24/24 checks, completed 32, samples 311, overall PASS
volta run --node 24.21.0 --npm 11.19.0 -- npm run ride:eta -- --check
# Eta report is current, exit 0
```

## Limitări

- Viteza instantanee nu este baza ETA; ETA folosește viteza planificată a rutei 041 și factorul explicit al stării serviciului. Un taxi oprit nu produce infinit, dar nici ETA nu devine o promisiune.
- Factorii `FREE_FLOW`/`CONGESTED` sunt provizorii și nu sunt calibrați pe trafic real; nu există predicție de trafic.
- Capătul rutei 041 este banda care deservește zona, nu poligonul exact al zonei; un cost `0` (`origine == banda destinație`) produce ETA `0` deși pickup/dropoff fizic 062–063 poate cere încă dwell în poligon.
- `061` nu retargetează o cursă activă: o rerutare reală este o asignare nouă. Un traseu vechi este refuzat cu `ROUTE_STALE`, nu rescris.
- O teleportare/recuperare 030 în urmă în cadrul aceleiași etape poate produce `OFF_ROUTE` până la o poziție dinaintea progresului certificat; progresul nu este rescris automat. Resetarea progresului se face numai la o etapă/cursă nouă.
- Verificarea de prospețime a etapei pickup refolosește prima bandă a traseului ca origine 041; dacă un apelant ar forja o rută cu altă origine, este refuzată ca `ROUTE_STALE`.
- Plannerul este întrebat la încărcarea unei etape, nu la fiecare tick; costul este mărginit de curse × etape, nu de frecvența observațiilor.
- Nu există integrare HUD, browser sau renderer; valorile sunt pure, pentru compoziția 073–075.
- Nu se măsoară FPS/GPU/Rapier/hardware și nu se certifică performanța jocului integrat.
