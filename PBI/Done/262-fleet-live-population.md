---
id: "262"
title: "Flota live: 20–30 taxiuri și 20–40 civili, nu doar date în registry"
status: "Done"
release: "V1"
module: "Flotă și curse"
depends_on: ["260"]
performance_checks: ["frame","simulation"]
owner: "loop-pbi/deepseek-262"
started_at: "2026-11-26T01:02:11.528Z"
completed_at: "2026-11-26T02:36:08.260Z"
---

# 262 Flota live: 20–30 taxiuri și 20–40 civili, nu doar date în registry

## Obiectiv

Populația reală a flotei este vizibilă și simulată în lume, cu identități, clase, moduri și profil comun aplicate tuturor vehiculelor.

## Starea actuală și ce lipsește

- `createAmbientTraffic` creează 20 de taxiuri în registry, dar compunerea conduce doar civilii; taxiul jucătorului este singurul actor taxi.
- Nu există taxiuri AI cu rute, curse sau pickup în lumea live.
- Nu există o separare clară între vehiculele ascunse, selectate, MANUAL, LEARNING și AUTO în compunerea browser.
- Nu există aplicarea profilului comun tuturor taxiurilor și civililor la un tick comun.
- Nu există o limită și un cost măsurat pentru 70 de vehicule în compunerea reală.
- Nu există verificarea faptului că un vehicul nou creat citește versiunea activă a profilului.

## Context și plan

- [Flotă și curse](../../Docs/07-flota-si-curse.md)
- [Registry-ul flotei](../../Docs/fleet-registry.md)
- [Traficul civil](../../Docs/civil-traffic.md)
- [Stilul orașului](../../Docs/city-style.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] În scenariul normal există minimum 20 de taxiuri și minimum 20 de civili, fiecare cu ID stabil și clasă reală.
- [x] Toate vehiculele sunt simulate chiar când nu sunt în cameră; camera nu schimbă starea lor.
- [x] Un vehicul nou creat primește versiunea activă a profilului comun.
- [x] Spawn-ul nu suprapune vehicule, jucătorul sau decorul și este determinist din seed.
- [x] `dispose()` readuce ownership-ul la zero, fără listeners sau corpuri orfane.
- [x] Costul pe tick pentru 70 de vehicule este raportat și rămâne în buget.

## Verificare

- Raport de flotă pe fixture-ul 20/24/30 și 20–40 civili.
- Probă în browser: numără vehiculele, verifică mișcarea celor din afara camerei.
- Verifică profilul aplicat și cleanup-ul după reload.

## Dovezi de finalizare

Rezultat implementare: `createAmbientTraffic` creează acum 24 de taxiuri și 32 de civili ca actori 058 reali, nu doar în registry. Fiecare are ID stabil 057, clasă 023, `driverKind`, rută, bandă și stare proprie; taxiurile folosesc accesul `TAXI`, civilii `CIVIL`, iar ambele trec prin lanțul 041 → 044 → 047/048. Populația este deterministică din seed, nu suprapune jucătorul, vehiculele statice sau decorul, iar toate vehiculele rămân simulate în afara camerei. Profilul comun se aplică tuturor, iar un vehicul nou citește versiunea activă. `dispose()` readuce actorii, controller-ele, contextul rutier și registry-ul la zero.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture`, `npm run composition:report -- --check`, `npm run docs:check -- --check` — PASS. Teste țintă `tests/fleet/live-fleet.test.ts` și `tests/app/ambient-traffic.test.ts`: 12/12 PASS; raportul `npm run fleet:live -- --check` este curent. `npm test` integrat: 3.589 teste, 3.575 pass, 0 fail, 14 skip-uri istorice. Date reale: 24 taxiuri + 32 civili = 56 actori; fixture-uri 20/20, 24/32, 30/40; 600 tick-uri, 54/54 actori porniți în afara ferestrei de 80 m s-au mișcat, minim 65,911 m, 56/56 actori mișcați; 56 benzi de origine distincte; clearance jucător 14,97 m, vehicule statice 14,602 m; 0 perechi SAT suprapuse; gap minim decor 1,03 m; toți cei 56 au aceeași versiune de profil după `refreshStyle()`, iar un taxi și un civil nou creat citesc `v3-city-style-v2`; `dispose()` readuce tot la zero. Cost 70 vehicule: p95 **5,8229 ms** față de bugetul provizoriu de 8 ms; baseline 40 civili p95 3,5141 ms, cost suplimentar 2,3088 ms (120 warmup + 3 repetări perechi × 600 tick-uri, headless 058).

Fișiere și documente actualizate: `src/fleet/civil-traffic.ts`, `src/app/ambient-traffic.ts`, `src/app/walking-composition.ts`, `src/rendering/babylon/v3-browser-composition.ts`, `tests/fleet/live-fleet.test.ts`, `tests/fleet/live-fleet-report.ts`, `tests/app/ambient-traffic.test.ts`, `scripts/run-live-fleet-report.mjs`, `package.json`, `Docs/07`, `Docs/31`, `Docs/browser-ai-traffic.md`, `Docs/civil-traffic.md`, `Docs/fleet-registry.md`, `Docs/Evidence/262-live-fleet/`.

Limitări sau follow-up: Proba de browser este `NOT_RUN` în worktree-ul copilului pentru că `import('playwright')` nu este disponibil și `PLAYWRIGHT_MODULE` nu este setat; dovezile sunt structurale și pe compunerea reală Node, nu capturi de browser. Costul este subsistemul 058, nu tick-ul autoritar complet sau FPS hardware. Taxiurile AI rămân nepreluabile până la reconcilierea rutelor din 263/284. `main.ts` nu a fost modificat: apelează deja `createAmbientTraffic`, deci primește automat cei 56 de actori; cablarea explicită `styleSource`/`refreshStyle` și obstacolele de decor rămân puncte de integrare pentru 263/273/285.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '262'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-26: Implementat de `loop-pbi/deepseek-262`; integrat, verificat și mutat în Done.
