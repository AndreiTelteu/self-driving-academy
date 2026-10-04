---
id: "138"
title: "Indicatori de stil și încălcări"
status: "To Do"
release: "V1"
module: "Experimente și indicatori"
depends_on: ["137","086"]
owner: null
started_at: null
completed_at: null
---

# 138 Indicatori de stil și încălcări

## Obiectiv

Calculează probabilități de conformare, viteze, distanțe și reacții.

## Context și plan

[14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 137 trebuie să existe în Done înainte de începere.
- PBI 086 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] STOP și roșu se raportează per oportunitate eligibilă.
- [ ] Cadrele duplicate nu schimbă denominatorul.

## Verificare

Compară date cu framerate-uri și oportunități diferite.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '138' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
