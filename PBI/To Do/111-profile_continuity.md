---
id: "111"
title: "Manevre în curs și profil publicat"
status: "To Do"
release: "V1"
module: "Profiluri"
depends_on: ["110","053","050","066"]
owner: null
started_at: null
completed_at: null
---

# 111 Manevre în curs și profil publicat

## Obiectiv

Păstrează continuitatea manevrei și prioritatea comenzilor manuale.

## Context și plan

[12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 110 trebuie să existe în Done înainte de începere.
- PBI 053 trebuie să existe în Done înainte de începere.
- PBI 050 trebuie să existe în Done înainte de începere.
- PBI 066 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Publicarea nu resetează viteză sau poziție.
- [ ] Oportunitatea deja evaluată nu este reeșantionată după activare.

## Verificare

Testează activare în viraj, schimbare de bandă și la roșu.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '111' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
