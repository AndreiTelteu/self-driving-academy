---
id: "086"
title: "Oportunități unice și denominatoare"
status: "To Do"
release: "V1"
module: "Telemetrie"
depends_on: ["085","006","036","037"]
owner: null
started_at: null
completed_at: null
---

# 086 Oportunități unice și denominatoare

## Obiectiv

Definește IDs și lifecycle pentru STOP, roșu, verde, yield și lane change.

## Context și plan

[09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 085 trebuie să existe în Done înainte de începere.
- PBI 006 trebuie să existe în Done înainte de începere.
- PBI 036 trebuie să existe în Done înainte de începere.
- PBI 037 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] O oportunitate este numărată o dată, independent de framerate.
- [ ] Rezultatele incomplete sunt marcate și nu intră ca succes sau eșec cert.

## Verificare

Testează apropieri repetate, segment închis devreme și semnal schimbat.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '086' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
