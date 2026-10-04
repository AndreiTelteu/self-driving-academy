---
id: "029"
title: "Avarie și stare de vehicul blocat"
status: "To Do"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["028","024"]
owner: null
started_at: null
completed_at: null
---

# 029 Avarie și stare de vehicul blocat

## Obiectiv

Modelează consecințe simple de avarie și disponibilitate pentru flotă.

## Context și plan

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 028 trebuie să existe în Done înainte de începere.
- PBI 024 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Un vehicul avariat are stare explicită și efect documentat asupra mișcării.
- [ ] Recuperarea nu șterge istoricul incidentului.

## Verificare

Testează praguri de avarie și imposibilitate de deplasare.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '029' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
