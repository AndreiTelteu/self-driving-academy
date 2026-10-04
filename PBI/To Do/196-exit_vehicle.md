---
id: "196"
title: "Ieșirea din mașină și punct valid"
status: "To Do"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["195","040"]
owner: null
started_at: null
completed_at: null
---

# 196 Ieșirea din mașină și punct valid

## Obiectiv

Alege poziție fizic validă și transferă autoritatea către personaj.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 195 trebuie să existe în Done înainte de începere.
- PBI 040 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Personajul nu apare în collider sau sub hartă.
- [ ] Mașina eliberată reia politica și traseul potrivite.

## Verificare

Testează uși blocate, mașină în mișcare și zonă ocupată.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '196' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
