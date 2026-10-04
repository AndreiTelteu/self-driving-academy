---
id: "122"
title: "Misiunea orașul te copiază"
status: "To Do"
release: "V1"
module: "Misiuni"
depends_on: ["119","120","115"]
owner: null
started_at: null
completed_at: null
---

# 122 Misiunea orașul te copiază

## Obiectiv

Evaluează întreaga flotă cu profilul jucătorului.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 119 trebuie să existe în Done înainte de începere.
- PBI 120 trebuie să existe în Done înainte de începere.
- PBI 115 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Rezultatul include taxiurile nevizibile și expunerea lor.
- [ ] Consecințele sunt distincte de succesul imitației.

## Verificare

Observă o rulare de flotă prudentă și una riscantă.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '122' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
