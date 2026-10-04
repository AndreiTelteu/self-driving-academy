---
id: "066"
title: "Arbitraj de comenzi și autoritate"
status: "To Do"
release: "V1"
module: "Control manual"
depends_on: ["024","025","007"]
owner: null
started_at: null
completed_at: null
---

# 066 Arbitraj de comenzi și autoritate

## Obiectiv

Rezolvă autoritatea AUTO sau PLAYER la fiecare tick; PLAYER are modul MANUAL sau LEARNING și nu necesită dispecerul/flota completă.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 024 trebuie să existe în Done înainte de începere.
- PBI 025 trebuie să existe în Done înainte de începere.
- PBI 007 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Maximum un vehicul este în MANUAL sau LEARNING; controllerul și limitele fizice sunt comune.
- [ ] Comenzile AI încetează la tick-ul preluării; toate tranzițiile păstrează starea fizică.

## Verificare

Testează comenzi concurente și schimbări în același tick.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '066' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
