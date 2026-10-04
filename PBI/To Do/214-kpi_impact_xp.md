---
id: "214"
title: "Atribuirea impactului intervenției și penalizarea XP"
status: "To Do"
release: "V1"
module: "Progres"
depends_on: ["213","144","209","206","207"]
owner: null
started_at: null
completed_at: null
---

# 214 Atribuirea impactului intervenției și penalizarea XP

## Obiectiv

Evaluează efectele directe/indirecte ale MANUAL/LEARNING pe revenue și ratings și aplică pierderea XP numai cu dovezi.

## Context și plan

- [23-misiuni-zilnice-si-experienta.md](../../Docs/23-misiuni-zilnice-si-experienta.md)
- [14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 213 trebuie să existe în Done înainte de începere.
- PBI 144 trebuie să existe în Done înainte de începere.
- PBI 209 trebuie să existe în Done înainte de începere.
- PBI 206 trebuie să existe în Done înainte de începere.
- PBI 207 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Controlul/tratamentul au checkpoint, cerere, seeds și expuneri comparabile; eșantionul insuficient nu este penalizat.
- [ ] Scăderea atribuibilă a oricăruia dintre cei doi KPI produce pierdere, fără compensare ascunsă de celălalt.
- [ ] Intervențiile suprapuse sunt grupate; aceeași cauză/incident nu este penalizată direct și indirect de două ori.
- [ ] Ledgerul și UI păstrează formulele, pragurile, cauzele și dovezile, cu worker anulabil.

## Verificare

Testează revenue↑/rating↓, inversul, ambele↓, zgomot, lipsă date, civil MANUAL, learning publicat, suprapuneri și rezultat duplicat.

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

Verificare finală: Validate-Board.ps1 -RequireDone '214'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.
