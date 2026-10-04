---
id: "208"
title: "Propagarea stilului către taxiuri și civili"
status: "To Do"
release: "V1"
module: "Autonomie"
depends_on: ["110","111","058","106"]
owner: null
started_at: null
completed_at: null
---

# 208 Propagarea stilului către taxiuri și civili

## Obiectiv

Verifică în sesiunea live profilul comun și imitația civililor, inclusiv după learning într-o mașină civilă.

## Context și plan

- [06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md)
- [12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 110 trebuie să existe în Done înainte de începere.
- PBI 111 trebuie să existe în Done înainte de începere.
- PBI 058 trebuie să existe în Done înainte de începere.
- PBI 106 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Toate vehiculele adoptă aceeași versiune la tick-ul comun, inclusiv cele create ulterior.
- [ ] Civilii păstrează rutele și limitele mecanice; nu există profil fix ascuns care anulează stilul comun.
- [ ] MANUAL civil nu schimbă profilul; LEARNING civil eligibil influențează ambele categorii.

## Verificare

Rulează activare în trafic mixt, vehicule nevizibile, spawn ulterior și eliberarea unui civil.

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

Verificare finală: Validate-Board.ps1 -RequireDone '208'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.
