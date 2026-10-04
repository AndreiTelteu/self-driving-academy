---
id: "217"
title: "Integrare AUTO MANUAL și LEARNING fără învățare accidentală"
status: "To Do"
release: "V1"
module: "Control manual"
depends_on: ["067","069","085","112","073","080"]
owner: null
started_at: null
completed_at: null
---

# 217 Integrare AUTO MANUAL și LEARNING fără învățare accidentală

## Obiectiv

Verifică cele trei moduri de la hotkey și HUD până la estimator/profil, inclusiv taxiuri și civile.

## Context și plan

- [08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md)
- [09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md)
- [10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 067 trebuie să existe în Done înainte de începere.
- PBI 069 trebuie să existe în Done înainte de începere.
- PBI 085 trebuie să existe în Done înainte de începere.
- PBI 112 trebuie să existe în Done înainte de începere.
- PBI 073 trebuie să existe în Done înainte de începere.
- PBI 080 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] MANUAL produce telemetrie pentru indicatori și istoric fără a modifica parametrii sau dovezile; LEARNING eligibil publică automat.
- [ ] Toate cele șase tranziții separă segmentele, păstrează fizica și maximum un vehicul condus de jucător.
- [ ] M/L sunt remapabile, focusul este corect, iar selecția nouă nu preia implicit controlul.

## Verificare

Parcurge matricea AUTO/MANUAL/LEARNING × taxi/civil, curse mixte, pauză, remapare și worker întârziat.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

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

Verificare finală: Validate-Board.ps1 -RequireDone '217'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.
