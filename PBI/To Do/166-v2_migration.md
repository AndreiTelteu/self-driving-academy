---
id: "166"
title: "Activarea schemelor și suportului V2"
status: "To Do"
release: "V2"
module: "Extindere V2"
depends_on: ["165","136","092"]
owner: null
started_at: null
completed_at: null
---

# 166 Activarea schemelor și suportului V2

## Obiectiv

Versionează suportul noilor chei și migrează profilele V1 fără estimări fabricate.

## Context și plan

[12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 165 trebuie să existe în Done înainte de începere.
- PBI 136 trebuie să existe în Done înainte de începere.
- PBI 092 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Un profil V1 rămâne utilizabil cu default pentru cheile noi.
- [ ] UI declară suportul și dovezile fiecărei chei.

## Verificare

Testează import V1, migrare și rollback la profil compatibil.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '166' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
