---
id: "057"
title: "Registry flotă și mașini civile"
status: "To Do"
release: "V1"
module: "Flotă și curse"
depends_on: ["056","023"]
owner: null
started_at: null
completed_at: null
---

# 057 Registry flotă și mașini civile

## Obiectiv

Creează 24 de taxiuri configurabile între 20 și 30 și vehicule civile.

## Context și plan

[07-flota-si-curse.md](../../Docs/07-flota-si-curse.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 056 trebuie să existe în Done înainte de începere.
- PBI 023 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Fiecare vehicul are ID, clasă, mod și stare independentă de cameră.
- [ ] Taxiurile folosesc un stil comun, civilele profile fixe.

## Verificare

Verifică 20, 24 și 30 de taxiuri și identificatori unici.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '057' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
