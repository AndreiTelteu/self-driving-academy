---
id: "027"
title: "Frânare frână de mână și marșarier"
status: "To Do"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["024","025"]
owner: null
started_at: null
completed_at: null
---

# 027 Frânare frână de mână și marșarier

## Obiectiv

Definește tranzițiile frânare–marșarier și comenzile la viteză aproape zero.

## Context și plan

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 024 trebuie să existe în Done înainte de începere.
- PBI 025 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Marșarierul nu este activat instant din mers înainte.
- [ ] Frâna de mână are efect fizic fără instabilitate numerică.

## Verificare

Testează oprire, inversare și frână de mână în viraj.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '027' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
