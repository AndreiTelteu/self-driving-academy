---
id: "078"
title: "Istoric și restaurare profil în UI"
status: "To Do"
release: "V1"
module: "Interfață"
depends_on: ["077"]
owner: null
started_at: null
completed_at: null
---

# 078 Istoric și restaurare profil în UI

## Obiectiv

Construiește selecția versiunilor și previewul schimbărilor.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 077 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Istoricul folosește versionId și nu editează o versiune existentă.
- [ ] Acțiunea de restaurare este explicită și poate raporta incompatibilitatea.

## Verificare

Verifică istoric gol, versiuni multiple și incompatibilitate.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '078' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
