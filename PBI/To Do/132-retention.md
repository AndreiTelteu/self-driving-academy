---
id: "132"
title: "Retenția datelor și cote locale"
status: "To Do"
release: "V1"
module: "Persistență"
depends_on: ["131","207"]
performance_checks: ["storage", "memory"]
owner: null
started_at: null
completed_at: null
---

# 132 Retenția datelor și cote locale

## Obiectiv

Gestionează separat retenția telemetriei intervențiilor și recorderului lumii, cu cote și segmente/chunkuri fixate.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 131 trebuie să existe în Done înainte de începere.
- PBI 207 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Cota plină oferă export și curățare selectivă; clipurile parțiale sunt declarate.
- [ ] Profilul, progresul, checkpointul activ și ledger-ele necesare deduplicării nu sunt șterse automat.

- [ ] Limitele RAM/DB și retenția sunt în bytes, nu doar durate; la capacitate sunt protejate cauzele/ledger-ele și replay-ul parțial este declarat.

## Verificare

Simulează quota exceeded și segmente protejate.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '132' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.
