---
id: "067"
title: "Hotkey M și starea vizibilă de control"
status: "To Do"
release: "V1"
module: "Control manual"
depends_on: ["066","009"]
owner: null
started_at: null
completed_at: null
---

# 067 Hotkey M și starea vizibilă de control

## Obiectiv

Implementează comutarea M și evenimentele pentru mod.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 066 trebuie să existe în Done înainte de începere.
- PBI 009 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Modul HUD corespunde autorității motorului.
- [ ] Tasta nu comută când un input text sau dialog are focus.

## Verificare

Testează toggle rapid, key repeat și focus UI.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '067' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
