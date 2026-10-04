---
id: "063"
title: "Dropoff și finalizarea cursei"
status: "To Do"
release: "V1"
module: "Flotă și curse"
depends_on: ["062"]
owner: null
started_at: null
completed_at: null
---

# 063 Dropoff și finalizarea cursei

## Obiectiv

Finalizează livrarea prin aceleași reguli de zonă și viteză.

## Context și plan

[07-flota-si-curse.md](../../Docs/07-flota-si-curse.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 062 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] O cursă manuală integrală și una autonomă folosesc aceeași evaluare.
- [ ] Finalizarea este idempotentă și păstrează metricile cursei.

## Verificare

Testează finalizare, duplicate și întrerupere înainte de oprire.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '063' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
