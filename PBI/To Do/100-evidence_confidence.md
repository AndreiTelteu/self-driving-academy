---
id: "100"
title: "Incertitudine praguri și număr efectiv"
status: "To Do"
release: "V1"
module: "Învățare"
depends_on: ["094","095","096","097","098","099"]
owner: null
started_at: null
completed_at: null
---

# 100 Incertitudine praguri și număr efectiv

## Obiectiv

Definește calitatea, pragurile și indicatorii de incertitudine ai estimatorilor.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 094 trebuie să existe în Done înainte de începere.
- PBI 095 trebuie să existe în Done înainte de începere.
- PBI 096 trebuie să existe în Done înainte de începere.
- PBI 097 trebuie să existe în Done înainte de începere.
- PBI 098 trebuie să existe în Done înainte de începere.
- PBI 099 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Neobservat, dovezi slabe și valoare zero sunt stări distincte.
- [ ] Numărul efectiv nu este doar numărul eșantioanelor la 20 Hz.

## Verificare

Testează intervale scurte, episoade corelate și dovezi contradictorii.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '100' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
