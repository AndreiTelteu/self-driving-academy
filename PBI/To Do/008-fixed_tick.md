---
id: "008"
title: "Buclă de simulare cu pas fix"
status: "To Do"
release: "V1"
module: "Fundație"
depends_on: ["005","007"]
owner: null
started_at: null
completed_at: null
---

# 008 Buclă de simulare cu pas fix

## Obiectiv

Creează accumulator, tick-uri la 60 Hz și snapshoturi interpolate.

## Context și plan

[02-arhitectura-si-contracte.md](../../Docs/02-arhitectura-si-contracte.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 005 trebuie să existe în Done înainte de începere.
- PBI 007 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Framerate-uri diferite nu schimbă timpul simulat al aceleiași secvențe de comenzi.
- [ ] Pauzele lungi nu produc un pas de fizică uriaș.

## Verificare

Compară rulări cu render la 30 și 60 FPS și o pauză.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '008' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
