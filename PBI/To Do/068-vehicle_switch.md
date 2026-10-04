---
id: "068"
title: "Schimbare rapidă între taxiuri și civile"
status: "To Do"
release: "V1"
module: "Control manual"
depends_on: ["067","018","017"]
owner: null
started_at: null
completed_at: null
---

# 068 Schimbare rapidă între taxiuri și civile

## Obiectiv

Leagă selectarea din lume și din flotă de vehiculul urmărit.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 067 trebuie să existe în Done înainte de începere.
- PBI 018 trebuie să existe în Done înainte de începere.
- PBI 017 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Selecția schimbă doar ținta camerei; vehiculul nou rămâne AUTO până la M/L explicit.
- [ ] Vehiculul părăsit în MANUAL/LEARNING închide segmentul și reia AUTO, cu ruta/cursa păstrată.
- [ ] Nu există teleportare și maximum un vehicul primește inputul jucătorului.

## Verificare

Testează selectare în AUTO, MANUAL și LEARNING, taxi–taxi, taxi–civil și entitate nevizibilă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Nu declara verificări trecute fără execuție.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '068' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
