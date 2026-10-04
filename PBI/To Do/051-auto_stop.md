---
id: "051"
title: "Politica STOP și opriri incomplete"
status: "To Do"
release: "V1"
module: "Autonomie"
depends_on: ["047","037","006"]
owner: null
started_at: null
completed_at: null
---

# 051 Politica STOP și opriri incomplete

## Obiectiv

Aplică probabilitatea opririi complete, durata și offsetul STOP.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 047 trebuie să existe în Done înainte de începere.
- PBI 037 trebuie să existe în Done înainte de începere.
- PBI 006 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Profilurile prudente și cele cu rolling stop au rezultate distincte.
- [ ] O oprire provocată de lider nu este confundată cu intenția STOP.

## Verificare

Rulează STOP liber și STOP cu coadă.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '051' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
