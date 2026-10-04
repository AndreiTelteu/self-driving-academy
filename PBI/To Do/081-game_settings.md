---
id: "081"
title: "Setări unități cameră grafică și audio"
status: "To Do"
release: "V1"
module: "Interfață"
depends_on: ["080","016","017"]
owner: null
started_at: null
completed_at: null
---

# 081 Setări unități cameră grafică și audio

## Obiectiv

Creează panoul de preferințe și aplicare coerentă.

## Context și plan

- [27-reglaje-hud-si-camera.md](../../Docs/27-reglaje-hud-si-camera.md)

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 080 trebuie să existe în Done înainte de începere.
- PBI 016 trebuie să existe în Done înainte de începere.
- PBI 017 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Unitățile de afișare nu schimbă SI în simulare.
- [ ] Modificarea camerei sau graficii nu modifică stilul flotei.

- [ ] Preferințele de confort/cameră și schema ControlPreferences sunt persistabile; editorul de stil este distinct și nu schimbă AI-ul prin acest panou.

## Verificare

Testează mph/kmh și schimbări în timpul unei sesiuni.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '081' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.
