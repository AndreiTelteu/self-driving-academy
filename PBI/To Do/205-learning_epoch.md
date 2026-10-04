---
id: "205"
title: "Barieră pentru learning la restore import și profil nou"
status: "To Do"
release: "V1"
module: "Profiluri"
depends_on: ["103","109","110","069"]
owner: null
started_at: null
completed_at: null
---

# 205 Barieră pentru learning la restore import și profil nou

## Obiectiv

Invalidează joburi/activări nepublicate din vechea generație la schimbarea explicită a țintei de profil.

## Context și plan

- [12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 103 trebuie să existe în Done înainte de începere.
- PBI 109 trebuie să existe în Done înainte de începere.
- PBI 110 trebuie să existe în Done înainte de începere.
- PBI 069 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] profileId și learningEpoch sunt capturate în segmente și joburi; rezultatele din altă generație sunt ignorate.
- [ ] Importul invalid păstrează coada; rezultatele duplicate și cele sosite după anulare nu publică versiuni.
- [ ] Segmentul curent se închide și se redeschide în generația nouă fără pierdere fizică.

## Verificare

Testează restore cu job în curs, import valid/invalid, profil nou, rezultat întârziat și duplicate.

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

Verificare finală: Validate-Board.ps1 -RequireDone '205'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.
