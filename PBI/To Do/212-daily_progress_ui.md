---
id: "212"
title: "Progres și interfață pentru misiunile zilei"
status: "To Do"
release: "V1"
module: "Misiuni"
depends_on: ["211","126","063","209"]
owner: null
started_at: null
completed_at: null
---

# 212 Progres și interfață pentru misiunile zilei

## Obiectiv

Afișează cele trei obiective și urmărește evenimente live cu expirare și reward unic.

## Context și plan

- [23-misiuni-zilnice-si-experienta.md](../../Docs/23-misiuni-zilnice-si-experienta.md)
- [13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 211 trebuie să existe în Done înainte de începere.
- PBI 126 trebuie să existe în Done înainte de începere.
- PBI 063 trebuie să existe în Done înainte de începere.
- PBI 209 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Obiectivele verifică modul/intervalele cursei; replay-ul și experimentele nu contribuie.
- [ ] Recompensa se produce o singură dată; expirarea și evenimentele de la limita zilei sunt coerente.
- [ ] UI arată obiective, progres, XP promis, fus/reset și motivul neeligibilității.

- [ ] Consumatorul filtrează sessionId/worldEpoch; Haos/replay nu îndeplinesc daily Academie.

## Verificare

Testează finalizare, duplicate, reluare, cursă mixtă, expirare și event înainte de reset cu commit ulterior.

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

Verificare finală: Validate-Board.ps1 -RequireDone '212'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.
