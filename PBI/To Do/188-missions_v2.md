---
id: "188"
title: "Provocări pentru comportamentele extinse"
status: "To Do"
release: "V2"
module: "Misiuni V2"
depends_on: ["187","125"]
owner: null
started_at: null
completed_at: null
---

# 188 Provocări pentru comportamentele extinse

## Obiectiv

Adaugă provocări de pietoni, rutare, semnalizare, pericole și serviciu.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 187 trebuie să existe în Done înainte de începere.
- PBI 125 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Provocările furnizează contextele pentru noile chei și explicațiile lor.
- [ ] Progresul V1 și accesul la vehicule sunt păstrate.

## Verificare

Playtest provocările și importul progresului V1.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '188' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
