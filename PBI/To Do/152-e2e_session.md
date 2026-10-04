---
id: "152"
title: "Test integral de sesiune și progres"
status: "To Do"
release: "V1"
module: "Validare și release"
depends_on: ["151"]
owner: null
started_at: null
completed_at: null
---

# 152 Test integral de sesiune și progres

## Obiectiv

Parcurge manual, AUTO, publicare, misiuni, export și restart.

## Context și plan

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 151 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Profilul flotei și progresul sunt păstrate după restart.
- [ ] Schimbarea vehiculului nu pierde cursa sau istoricul intervenției.

## Verificare

Rulează sesiunea în browser din profil nou.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '152' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
