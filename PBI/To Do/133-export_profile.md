---
id: "133"
title: "Export JSON de profil"
status: "To Do"
release: "V1"
module: "Persistență"
depends_on: ["128"]
owner: null
started_at: null
completed_at: null
---

# 133 Export JSON de profil

## Obiectiv

Generează export cu schemă, versiuni, valori și dovezi agregate.

## Context și plan

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 128 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Exportul nu include automat toată telemetria brută.
- [ ] Fișierul poate fi validat și reimportat fără pierderea parametrilor.

## Verificare

Testează roundtrip și profil cu chei rezervate.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '133' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
