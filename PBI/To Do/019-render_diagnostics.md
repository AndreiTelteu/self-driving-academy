---
id: "019"
title: "Diagnostic Babylon și resurse"
status: "To Do"
release: "V1"
module: "Babylon"
depends_on: ["011","014"]
owner: null
started_at: null
completed_at: null
---

# 019 Diagnostic Babylon și resurse

## Obiectiv

Expune backend, timpi, draw calls și resurse; inspector doar în dezvoltare.

## Context și plan

[03-babylon-engine.md](../../Docs/03-babylon-engine.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 011 trebuie să existe în Done înainte de începere.
- PBI 014 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Diagnosticarea nu actualizează întregul HUD în fiecare frame.
- [ ] Buildul de producție exclude inspectorul și codul de debug nefolosit.

## Verificare

Compară bundle dev/producție și profilul costului de UI.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '019' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
