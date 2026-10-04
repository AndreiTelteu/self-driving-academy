---
id: "025"
title: "Input de tastatură și filtrare"
status: "To Do"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["024","009"]
owner: null
started_at: null
completed_at: null
---

# 025 Input de tastatură și filtrare

## Obiectiv

Implementează W/S/A/D, revenirea direcției și sensibilitatea la viteză.

## Context și plan

- [27-reglaje-hud-si-camera.md](../../Docs/27-reglaje-hud-si-camera.md)

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 024 trebuie să existe în Done înainte de începere.
- PBI 009 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Inputul brut și comanda filtrată sunt disponibile separat.
- [ ] Pierderea focusului eliberează comenzile fără tastă rămasă activă.

- [ ] Filtrarea are ControlPreferences versionat cu limite calibrate, pregătit pentru popup-ul 229; input brut/comandă efectivă rămân distincte.

## Verificare

Testează apăsare, menținere, eliberare, focus și viteză mare.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '025' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.
