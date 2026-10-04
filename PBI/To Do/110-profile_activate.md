---
id: "110"
title: "Activare atomică în întreaga flotă"
status: "To Do"
release: "V1"
module: "Profiluri"
depends_on: ["109","057","008"]
owner: null
started_at: null
completed_at: null
---

# 110 Activare atomică în întreaga flotă

## Obiectiv

Publică activarea la un tick comun tuturor taxiurilor și civililor.

## Context și plan

[12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 109 trebuie să existe în Done înainte de începere.
- PBI 057 trebuie să existe în Done înainte de începere.
- PBI 008 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] După tick toate vehiculele existente raportează aceeași versiune, inclusiv cele nevizibile și conduse de jucător.
- [ ] Vehiculele create ulterior primesc versiunea curentă; rutele și stările fizice sunt păstrate.

## Verificare

Verifică lista întregii flote înainte și după activare.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '110' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
