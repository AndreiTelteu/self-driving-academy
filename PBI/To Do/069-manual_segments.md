---
id: "069"
title: "Lifecycle de intervenție manuală"
status: "To Do"
release: "V1"
module: "Control manual"
depends_on: ["068","005","007"]
owner: null
started_at: null
completed_at: null
---

# 069 Lifecycle de intervenție manuală

## Obiectiv

Deschide și închide segmente la toggle, schimbare, final de cursă și recuperare.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 068 trebuie să existe în Done înainte de începere.
- PBI 005 trebuie să existe în Done înainte de începere.
- PBI 007 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Fiecare segment are motiv și interval clar; pauza îl suspendă.
- [ ] Finalul cursei în manual închide și redeschide segmentul fără a forța AUTO.

## Verificare

Testează toate cauzele de închidere și segment fără mișcare.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '069' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
