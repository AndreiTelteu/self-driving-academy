---
id: "140"
title: "Snapshot complet pentru experiment"
status: "To Do"
release: "V1"
module: "Experimente și indicatori"
depends_on: ["138","139","136","206"]
owner: null
started_at: null
completed_at: null
---

# 140 Snapshot complet pentru experiment

## Obiectiv

Folosește SessionCheckpoint complet pentru experiment: fizică, memorie FSM/controller, oportunități, RNG, semnale, vehicule și dispecer; izolează ledger-ele live.

## Context și plan

[14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 138 trebuie să existe în Done înainte de începere.
- PBI 139 trebuie să existe în Done înainte de începere.
- PBI 136 trebuie să existe în Done înainte de începere.
- PBI 206 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Snapshotul poate fi validat și încărcat la același tick.
- [ ] Compatibilitatea engine/physics/map este verificată.

## Verificare

Compară starea înainte și după roundtrip.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '140' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
