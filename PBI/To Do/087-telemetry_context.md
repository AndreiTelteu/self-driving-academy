---
id: "087"
title: "Ferestre eligibile și constrângeri externe"
status: "To Do"
release: "V1"
module: "Telemetrie"
depends_on: ["086","048"]
owner: null
started_at: null
completed_at: null
---

# 087 Ferestre eligibile și constrângeri externe

## Obiectiv

Etichetează trafic liber, lider, verde blocat, limită mecanică și impact.

## Context și plan

[09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 086 trebuie să existe în Done înainte de începere.
- PBI 048 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Verdele blocat, limita mecanică și impactul nu sunt interpretate ca preferințe personale.
- [ ] Timpii de reacție cer un stimul observabil din camera jucătorului sau fixture controlat.

## Verificare

Testează context eligibil, stimul ascuns, coadă, impact și limitare mecanică.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '087' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
