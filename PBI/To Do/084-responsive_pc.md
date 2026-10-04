---
id: "084"
title: "Layout la rezoluții PC și viewport mic"
status: "To Do"
release: "V1"
module: "Interfață"
depends_on: ["083","074"]
owner: null
started_at: null
completed_at: null
---

# 084 Layout la rezoluții PC și viewport mic

## Obiectiv

Adaptează HUD și paneluri la 1280×720 și 1920×1080.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 083 trebuie să existe în Done înainte de începere.
- PBI 074 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Lista de 30 de taxiuri și profilul nu se suprapun peste controale esențiale.
- [ ] Textul și scrollul rămân lizibile la zoom de browser.

## Verificare

Inspectează cele două rezoluții și zoom mărit.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '084' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
