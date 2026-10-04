---
id: "039"
title: "Treceri de pietoni și semantică de pericol"
status: "To Do"
release: "V1"
module: "Oraș"
depends_on: ["032"]
owner: null
started_at: null
completed_at: null
---

# 039 Treceri de pietoni și semantică de pericol

## Obiectiv

Adaugă zone și linii pentru treceri și obstacole.

## Context și plan

[04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 032 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Zonele au IDs și pot alimenta viitoarele scenarii cu pietoni.
- [ ] Absența pietonilor nu produce dovezi fictive de cedare.

## Verificare

Verifică traversări geometrice și oportunități fără pietoni.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '039' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
