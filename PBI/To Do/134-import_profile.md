---
id: "134"
title: "Import validat și activare de profil"
status: "To Do"
release: "V1"
module: "Persistență"
depends_on: ["133","114","092"]
owner: null
started_at: null
completed_at: null
---

# 134 Import validat și activare de profil

## Obiectiv

Validează mărime, chei, unități, intervale și compatibilitate înainte de activare.

## Context și plan

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 133 trebuie să existe în Done înainte de începere.
- PBI 114 trebuie să existe în Done înainte de începere.
- PBI 092 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Importul invalid nu modifică profilul activ și nu anulează joburile de learning curente.
- [ ] Importul valid folosește bariera learningEpoch și aceeași activare atomică pentru taxiuri și civili; rezultatele vechi sosite ulterior sunt ignorate.
- [ ] Importul unui DrivingProfile nu resetează revenue-ul, misiunile zilnice sau XP-ul jucătorului.

## Verificare

Testează NaN, versiune incompatibilă, cheie necunoscută și profil valid, inclusiv cu worker în curs și rezultat întârziat după import.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '134' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
