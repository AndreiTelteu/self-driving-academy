---
id: "119"
title: "Provocarea a două stiluri de urmărire"
status: "To Do"
release: "V1"
module: "Misiuni"
depends_on: ["118","096"]
owner: null
started_at: null
completed_at: null
---

# 119 Provocarea a două stiluri de urmărire

## Obiectiv

Creează scenarii cu viteze și distanțe care separă headway și gap.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 118 trebuie să existe în Done înainte de începere.
- PBI 096 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Jucătorul poate compara două profile în contexte cunoscute.
- [ ] Misiunea nu cere estimarea coeficienților dintr-o singură viteză.

## Verificare

Playtest două stiluri cu aceleași condiții de lider.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '119' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
