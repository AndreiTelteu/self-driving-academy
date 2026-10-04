---
id: "207"
title: "Recorder pentru replay taxiuri civile și incidente AUTO"
status: "To Do"
release: "V1"
module: "Experimente"
depends_on: ["014","065","028","007","206"]
owner: null
started_at: null
completed_at: null
---

# 207 Recorder pentru replay taxiuri civile și incidente AUTO

## Obiectiv

Înregistrează întreaga lume într-un buffer limitat, cu chunkuri fixate în jurul incidentelor.

## Context și plan

- [14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md)
- [09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 014 trebuie să existe în Done înainte de începere.
- PBI 065 trebuie să existe în Done înainte de începere.
- PBI 028 trebuie să existe în Done înainte de începere.
- PBI 007 trebuie să existe în Done înainte de începere.
- PBI 206 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Entitățile nevizibile, AUTO, fazele și crearea/eliminarea au date suficiente pentru replay.
- [ ] Evenimentele păstrează tick exact; interpolarea și ferestrele parțiale sunt declarate.
- [ ] Bufferul circular și salvarea chunkurilor au limite de resurse și nu devin demonstrații LEARNING.

## Verificare

Înregistrează un incident numai AUTO în afara camerei; verifică retenție, crash și chunk parțial.

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

Verificare finală: Validate-Board.ps1 -RequireDone '207'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.
