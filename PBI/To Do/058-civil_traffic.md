---
id: "058"
title: "Trafic civil cu rute și profiluri fixe"
status: "To Do"
release: "V1"
module: "Flotă și curse"
depends_on: ["057","041"]
owner: null
started_at: null
completed_at: null
---

# 058 Trafic civil cu rute și profiluri fixe

## Obiectiv

Generează rute civile și reluarea lor după eliberarea mașinii.

## Context și plan

[07-flota-si-curse.md](../../Docs/07-flota-si-curse.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 057 trebuie să existe în Done înainte de începere.
- PBI 041 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Vehiculele civile interacționează fizic și semantic cu taxiurile.
- [ ] Stilul învățat al flotei nu suprascrie profilele civile.

## Verificare

Rulează intersecții mixte și reluarea unei rute civile.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '058' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
