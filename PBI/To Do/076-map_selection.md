---
id: "076"
title: "Selectarea vehiculelor prin hartă"
status: "To Do"
release: "V1"
module: "Interfață"
depends_on: ["074","068","058"]
owner: null
started_at: null
completed_at: null
---

# 076 Selectarea vehiculelor prin hartă

## Obiectiv

Adaugă markers și selectarea taxiurilor și mașinilor civile.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 074 trebuie să existe în Done înainte de începere.
- PBI 068 trebuie să existe în Done înainte de începere.
- PBI 058 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Markerul se mapează la ID stabil chiar după actualizarea reprezentării.
- [ ] Selectarea hărții nu teleportează vehiculele.

## Verificare

Testează civil distant, taxi și marker eliminat.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '076' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
