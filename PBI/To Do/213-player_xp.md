---
id: "213"
title: "XP din misiuni și timp activ al jucătorului"
status: "To Do"
release: "V1"
module: "Progres"
depends_on: ["212","125","008","009","209"]
owner: null
started_at: null
completed_at: null
---

# 213 XP din misiuni și timp activ al jucătorului

## Obiectiv

Implementează PlayerProgress și ledger XP separat de DrivingProfile.

## Context și plan

- [23-misiuni-zilnice-si-experienta.md](../../Docs/23-misiuni-zilnice-si-experienta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 212 trebuie să existe în Done înainte de începere.
- PBI 125 trebuie să existe în Done înainte de începere.
- PBI 008 trebuie să existe în Done înainte de începere.
- PBI 009 trebuie să existe în Done înainte de începere.
- PBI 209 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Misiunile acordă XP o singură dată; minutele reale active păstrează fracțiunile și identitatea creditelor.
- [ ] Pauză/background/AFK/replay/experimente/offline nu acordă XP; AUTO activ poate conta.
- [ ] Soldul, nivelul și istoricul sunt explicabile; resetul/importul stilului nu resetează XP.

## Verificare

Testează minut fracționar, activitate AUTO, pause/AFK, recompensă duplicată și profil de driving nou.

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

Verificare finală: Validate-Board.ps1 -RequireDone '213'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.
