---
id: "216"
title: "Regresii V1 pentru moduri KPI-uri daily și XP"
status: "To Do"
release: "V1"
module: "Validare"
depends_on: ["215","141","108","208","217","205"]
performance_checks: ["frame", "memory"]
owner: null
started_at: null
completed_at: null
---

# 216 Regresii V1 pentru moduri KPI-uri daily și XP

## Obiectiv

Verifică împreună corecțiile auditului și noile mecanici înaintea suitei/release-ului V1.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

- [18-validare-si-release.md](../../Docs/18-validare-si-release.md)
- [24-milestone-timpuriu-si-contracte.md](../../Docs/24-milestone-timpuriu-si-contracte.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 215 trebuie să existe în Done înainte de începere.
- PBI 141 trebuie să existe în Done înainte de începere.
- PBI 108 trebuie să existe în Done înainte de începere.
- PBI 208 trebuie să existe în Done înainte de începere.
- PBI 217 trebuie să existe în Done înainte de începere.
- PBI 205 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Cele trei moduri, propagarea taxi/civil și bariera de learning trec scenariile pozitive/negative.
- [ ] KPI-uri, grafice, daily, XP fără pierderi, checkpoint și replay trec scenariile modulelor 22–23.
- [ ] Playtestul confirmă explicațiile și benchmarkul raportează costurile noi; limitările nerezolvate nu sunt ascunse.

- [ ] Probele combinate ale modulului 25 raportează efectul learning+recorder+autosave+KPI+XP asupra condusului, nu doar componente izolate.

- [ ] Regresia confirmă lipsa pierderilor XP; extensiile 225–234 au gate separat 235, fără dependență inversă care să formeze ciclu.

## Verificare

Execută matricea completă de regresii și playtest; păstrează dovezi, versiuni, rezultate și limitări.

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

Verificare finală: Validate-Board.ps1 -RequireDone '216'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
