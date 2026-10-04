---
id: "020"
title: "Resize disposal și recuperare GPU"
status: "To Do"
release: "V1"
module: "Babylon"
depends_on: ["012","015","014"]
owner: null
started_at: null
completed_at: null
---

# 020 Resize disposal și recuperare GPU

## Obiectiv

Implementează resize, cleanup și reconstrucția scenei din snapshot după pierderea dispozitivului.

## Context și plan

[03-babylon-engine.md](../../Docs/03-babylon-engine.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 012 trebuie să existe în Done înainte de începere.
- PBI 015 trebuie să existe în Done înainte de începere.
- PBI 014 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Resursele vechi sunt eliberate, iar sesiunea este păstrată la recuperare.
- [ ] Un eșec repetat oferă reluare fără pierderea profilului salvat.

## Verificare

Testează resize repetat, disposal și pierdere GPU simulată.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '020' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
