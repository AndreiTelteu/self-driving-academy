---
id: "126"
title: "Panoul misiunilor și obiective live"
status: "To Do"
release: "V1"
module: "Misiuni"
depends_on: ["125","084"]
owner: null
started_at: null
completed_at: null
---

# 126 Panoul misiunilor și obiective live

## Obiectiv

Afișează obiective, progres, motive de eșec și opțiuni de reluare.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 125 trebuie să existe în Done înainte de începere.
- PBI 084 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Textul corespunde evaluării reale și versiunii misiunii.
- [ ] Un obiectiv blocat poate fi inspectat fără pierderea progresului.

## Verificare

Parcurge campania și verifică fiecare stare UI.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '126' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
