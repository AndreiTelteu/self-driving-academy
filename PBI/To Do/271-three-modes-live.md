---
id: "271"
title: "Cele trei moduri live: AUTO, MANUAL, LEARNING și toate tranzițiile"
status: "To Do"
release: "V1"
module: "Moduri și learning"
depends_on: ["260","263"]
performance_checks: ["simulation","frame"]
owner: null
started_at: null
completed_at: null
---

# 271 Cele trei moduri live: AUTO, MANUAL, LEARNING și toate tranzițiile

## Obiectiv

Jucătorul comută între AUTO, MANUAL și LEARNING cu `M`/`L`, iar fiecare tranziție deschide sau închide segmentul corect, fără teleport și fără gol de input.

## Starea actuală și ce lipsește

- `applyVehicleMode` acceptă numai `AUTO` și `MANUAL`; nu există `L` sau `LEARNING`.
- Segmentele live sunt 198 de walking/takeover, nu 069 de intervenție la volan.
- Intrarea în mașină forțează `MANUAL`; nu există eligibilitate sau segment LEARNING.
- Nu există păstrarea rutei/cursei la tranziție și nici reluarea stării fizice la AUTO.
- Nu există raport de continuitate, autoritate unică sau verificare de tick pentru cele șase tranziții.
- Nu există HUD cu textele și simbolurile AUTO/MANUAL/LEARNING.

## Context și plan

- [Interfață, cameră și control](../../Docs/08-interfata-camera-si-control.md)
- [Învățarea stilului](../../Docs/10-invatarea-stilului.md)
- [Comenzile de mod](../../Docs/mode-controls.md)
- [Integrarea celor trei moduri](../../Docs/three-modes.md)
- [Cursa completă și intervenția](../../Docs/manual-trip.md)
- [Continuitatea la preluare](../../Docs/takeover-continuity.md)
- [Autoritatea de control](../../Docs/control-authority.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 263 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Toate cele șase tranziții AUTO/MANUAL/LEARNING funcționează din tastele reale și din butoanele HUD.
- [ ] AUTO → MANUAL/LEARNING deschide un segment cu mod, eligibilitate, poziție, rută, clasă și profil.
- [ ] MANUAL ↔ LEARNING închide și deschide segmentul la același tick, fără salt fizic sau gol de input.
- [ ] LEARNING → AUTO închide segmentul și permite pipeline-ului să decidă; MANUAL nu produce job.
- [ ] Maximum un scaun `PLAYER` există la orice tick, iar un vehicul părăsit revine în AUTO cu ruta/cursea păstrată.
- [ ] Pauza, focusul și reload-ul nu creează segmente orfane sau comenzi ținute.

## Verificare

- Matricea celor șase tranziții pe taxi și civil, în Node și browser.
- Verifică poziția, viteza, yaw-ul și ruta înainte/după fiecare tranziție.
- Verifică numărul de segmente, joburi și scaune `PLAYER`.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '271'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
