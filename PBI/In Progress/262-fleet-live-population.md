---
id: "262"
title: "Flota live: 20–30 taxiuri și 20–40 civili, nu doar date în registry"
status: "In Progress"
release: "V1"
module: "Flotă și curse"
depends_on: ["260"]
performance_checks: ["frame","simulation"]
owner: "loop-pbi/deepseek-262"
started_at: "2026-11-26T01:02:11.528Z"
completed_at: null
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

- [ ] În scenariul normal există minimum 20 de taxiuri și minimum 20 de civili, fiecare cu ID stabil și clasă reală.
- [ ] Toate vehiculele sunt simulate chiar când nu sunt în cameră; camera nu schimbă starea lor.
- [ ] Un vehicul nou creat primește versiunea activă a profilului comun.
- [ ] Spawn-ul nu suprapune vehicule, jucătorul sau decorul și este determinist din seed.
- [ ] `dispose()` readuce ownership-ul la zero, fără listeners sau corpuri orfane.
- [ ] Costul pe tick pentru 70 de vehicule este raportat și rămâne în buget.

## Verificare

- Raport de flotă pe fixture-ul 20/24/30 și 20–40 civili.
- Probă în browser: numără vehiculele, verifică mișcarea celor din afara camerei.
- Verifică profilul aplicat și cleanup-ul după reload.

## Dovezi de finalizare

Rezultat implementare: De completat.

Verificări executate și rezultat: De completat.

Fișiere și documente actualizate: De completat.

Limitări sau follow-up: De completat.

## Definition of Done

- [ ] Criterii îndeplinite și verificate.
- [ ] Dovezi completate și documentație actualizată.
- [ ] Status Done și completed_at completat.
- [ ] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '262'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
