---
id: "215"
title: "Persistență pentru KPI-uri misiuni zilnice și XP"
status: "To Do"
release: "V1"
module: "Persistență"
depends_on: ["214","210","212","131","136"]
performance_checks: ["storage", "memory"]
owner: null
started_at: null
completed_at: null
---

# 215 Persistență pentru KPI-uri misiuni zilnice și XP

## Obiectiv

Extinde checkpointul/exportul de sesiune cu calendar economic/daily, ledger comercial, review-uri, bucketuri și XP.

## Context și plan

- [29-savefile-si-integritate.md](../../Docs/29-savefile-si-integritate.md)

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

- [15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md)
- [22-kpi-economie-si-review-uri.md](../../Docs/22-kpi-economie-si-review-uri.md)
- [23-misiuni-zilnice-si-experienta.md](../../Docs/23-misiuni-zilnice-si-experienta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 214 trebuie să existe în Done înainte de începere.
- PBI 210 trebuie să existe în Done înainte de începere.
- PBI 212 trebuie să existe în Done înainte de începere.
- PBI 131 trebuie să existe în Done înainte de începere.
- PBI 136 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Reload/migrarea păstrează sumele, media, daily set și XP fără duplicate.
- [ ] Commitul lumii și ledger-elor este coerent; exportul de DrivingProfile nu transferă progres.
- [ ] Cota plină, importul invalid și clock rollback nu corup sau dublează recompensele.

- [ ] Commiturile comerciale/XP respectă pipeline-ul 222; datele sintetice de istoric și storage lent au costuri și limite măsurate.

- [ ] XP persistat conține credite nenegative și nicio evaluare de penalizare; savefile complet verificat este extensia 234.

## Verificare

Roundtrip sesiune și crash la review/reward/credit XP, migrare din schema anterioară, două taburi și quota.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare: De completat.

Verificări executate și rezultat: De completat.

Fișiere și documente actualizate: De completat.

Limitări sau follow-up: De completat.

## Definition of Done

- [ ] Criterii îndeplinite și verificate.
- [ ] Dovezi completate și documentație actualizată.
- [ ] Status Done și completed_at completat.
- [ ] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '215'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.
