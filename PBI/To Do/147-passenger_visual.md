---
id: "147"
title: "Pasageri simplificați și markers"
status: "To Do"
release: "V1"
module: "Asseturi și audio"
depends_on: ["062","063","015"]
owner: null
started_at: null
completed_at: null
---

# 147 Pasageri simplificați și markers

## Obiectiv

Reprezintă pickup/dropoff și ocuparea mașinii.

## Context și plan

[16-asseturi-vizual-si-audio.md](../../Docs/16-asseturi-vizual-si-audio.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 062 trebuie să existe în Done înainte de începere.
- PBI 063 trebuie să existe în Done înainte de începere.
- PBI 015 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Starea vizuală urmează cursa și nu declanșează ea însăși finalizarea.
- [ ] Pasagerii simpli V1 nu generează dovezi fictive de pietoni în trafic.

## Verificare

Testează serviciu complet și reset de cursă.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '147' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
