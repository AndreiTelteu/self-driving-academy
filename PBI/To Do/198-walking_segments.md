---
id: "198"
title: "Intervenții și telemetrie cu personaj"
status: "To Do"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["197","069"]
owner: null
started_at: null
completed_at: null
---

# 198 Intervenții și telemetrie cu personaj

## Obiectiv

Leagă intrarea/ieșirea de închiderea segmentelor de condus.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 197 trebuie să existe în Done înainte de începere.
- PBI 069 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Mersul nu este demonstrație de driving; numai LEARNING închis produce estimator.
- [ ] Intrarea/ieșirea și selectarea distantă păstrează autoritatea unică și modurile explicit alese.

## Verificare

Testează intrare, ieșire și schimbare rapidă după câteva străzi.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '198' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
