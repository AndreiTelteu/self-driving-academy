---
id: "049"
title: "Controller lateral și urmărirea benzii"
status: "To Do"
release: "V1"
module: "Autonomie"
depends_on: ["045","024","033"]
owner: null
started_at: null
completed_at: null
---

# 049 Controller lateral și urmărirea benzii

## Obiectiv

Transformă geometria traseului în direcție și limite de viraj.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 045 trebuie să existe în Done înainte de începere.
- PBI 024 trebuie să existe în Done înainte de începere.
- PBI 033 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Mașina urmează viraje fezabile fără teleportare.
- [ ] Controlul lateral păstrează aceeași fizică ca manualul.

## Verificare

Parcurge curbe și viraje la viteze diferite.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '049' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
