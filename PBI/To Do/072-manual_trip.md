---
id: "072"
title: "Cursă completă și intervenție scurtă manuală"
status: "To Do"
release: "V1"
module: "Control manual"
depends_on: ["071","063"]
owner: null
started_at: null
completed_at: null
---

# 072 Cursă completă și intervenție scurtă manuală

## Obiectiv

Livrează cursa integrală în MANUAL fără learning și demonstrația scurtă în LEARNING.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 071 trebuie să existe în Done înainte de începere.
- PBI 063 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] MANUAL produce rezultatul cursei și telemetrie, fără schimbarea valorilor sau dovezilor profilului.
- [ ] LEARNING poate publica doar parametrii observați; schimbarea controlului păstrează pasagerul și destinația.

## Verificare

Parcurge în browser o cursă completă și o intervenție parțială.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '072' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
