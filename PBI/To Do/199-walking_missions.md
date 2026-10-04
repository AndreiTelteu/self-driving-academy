---
id: "199"
title: "Tutorial și misiuni pentru mers și vehicule"
status: "To Do"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["198","188"]
owner: null
started_at: null
completed_at: null
---

# 199 Tutorial și misiuni pentru mers și vehicule

## Obiectiv

Adaugă tutorialul de mers, intrare și ieșire fără a bloca flota.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 198 trebuie să existe în Done înainte de începere.
- PBI 188 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Misiunile existente rămân realizabile din perspectiva veche.
- [ ] Noile obiective sunt derivate din evenimente de control.

## Verificare

Playtest tutorial și reluarea unei misiuni V1.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: De completat.

Verificări executate și rezultat: De completat.

Fișiere și documente actualizate: De completat.

Limitări sau follow-up: De completat.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '199' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
