---
id: "022"
title: "Adaptor fizică și conversii de coordonate"
status: "To Do"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["021","005","013"]
owner: null
started_at: null
completed_at: null
---

# 022 Adaptor fizică și conversii de coordonate

## Obiectiv

Conectează corpurile Rapier la entityId și convențiile de axe/unități.

## Context și plan

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 021 trebuie să existe în Done înainte de începere.
- PBI 005 trebuie să existe în Done înainte de începere.
- PBI 013 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Pozițiile, rotațiile și vitezele se convertesc consistent în Babylon.
- [ ] Corpurile eliminate nu lasă mapări sau callbacks active.

## Verificare

Verifică un corp rotit și deplasat și un ciclu create/dispose.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '022' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
