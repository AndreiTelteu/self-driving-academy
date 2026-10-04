---
id: "164"
title: "Pietoni autonomi și traversări"
status: "To Do"
release: "V2"
module: "Extindere V2"
depends_on: ["163","039","022"]
owner: null
started_at: null
completed_at: null
---

# 164 Pietoni autonomi și traversări

## Obiectiv

Adaugă pietoni cu deplasare pe trotuar și traversări cu conflict.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 163 trebuie să existe în Done înainte de începere.
- PBI 039 trebuie să existe în Done înainte de începere.
- PBI 022 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Pietonii au ID, stare și oportunități de cedare reale.
- [ ] Coliziunile și opririle pot fi inspectate fără denominatoare fictive.

## Verificare

Rulează trecere liberă, pieton prezent și conflict cu vehicul.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '164' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
