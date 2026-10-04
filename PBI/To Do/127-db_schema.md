---
id: "127"
title: "Schema IndexedDB și repository local"
status: "To Do"
release: "V1"
module: "Persistență"
depends_on: ["005","109","116"]
owner: null
started_at: null
completed_at: null
---

# 127 Schema IndexedDB și repository local

## Obiectiv

Creează stores pentru profile, segmente, scenarii, progres și setări.

## Context și plan

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 005 trebuie să existe în Done înainte de începere.
- PBI 109 trebuie să existe în Done înainte de începere.
- PBI 116 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Schema include stores de stil/progres și checkpointuri, cu tranzacții coerente și migrare explicită.
- [ ] Un singur tab deține dreptul de scriere; al doilea tab și DB upgrade blocat au stări explicite.

## Verificare

Testează DB nouă, upgrade, două taburi, transfer de writer și eroare de deschidere.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Nu declara verificări trecute fără execuție.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '127' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
