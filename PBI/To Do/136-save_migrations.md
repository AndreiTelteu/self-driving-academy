---
id: "136"
title: "Migrare și restaurare după restart"
status: "To Do"
release: "V1"
module: "Persistență"
depends_on: ["135","132","206"]
owner: null
started_at: null
completed_at: null
---

# 136 Migrare și restaurare după restart

## Obiectiv

Implementează migrarea schemelor și continuarea sesiunii.

## Context și plan

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 135 trebuie să existe în Done înainte de începere.
- PBI 132 trebuie să existe în Done înainte de începere.
- PBI 206 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Restartul reia pozițiile, cursele, pasagerii și ledger-ele din ultimul checkpoint valid; pornește în pauză/AUTO.
- [ ] Segmentele active devin incomplete, inputul este eliberat și joburile sunt reluate numai în learningEpoch valid.
- [ ] Migrarea eșuată oferă export și recuperare fără corupere.

## Verificare

Testează versiune veche, migrare eșuată și startup nou.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '136' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
