---
id: "071"
title: "Continuitatea fizică la preluare și revenire"
status: "To Do"
release: "V1"
module: "Control manual"
depends_on: ["069","054","070"]
owner: null
started_at: null
completed_at: null
---

# 071 Continuitatea fizică la preluare și revenire

## Obiectiv

Verifică viteza, comanda și traiectoria la tranziția dintre surse.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 069 trebuie să existe în Done înainte de începere.
- PBI 054 trebuie să existe în Done înainte de începere.
- PBI 070 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Revenirea în autonomie păstrează starea fizică și caută reintrare validă.
- [ ] Un vehicul fără reintrare devine BLOCKED cu motiv.

## Verificare

Testează tranziție în viraj, în afara drumului și în coliziune.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '071' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
