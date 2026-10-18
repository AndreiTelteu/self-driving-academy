---
id: "210"
title: "Buton KPIs și grafice istorice ale flotei"
status: "To Do"
release: "V1"
module: "UI"
depends_on: ["209","075","082","084"]
performance_checks: ["ui", "frame"]
owner: null
started_at: null
completed_at: null
---

# 210 Buton KPIs și grafice istorice ale flotei

## Obiectiv

Deschide prin buton KPIs/K un pop-up detaliat pentru revenue lunar, ratings și agregări zilnice.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

- [22-kpi-economie-si-review-uri.md](../../Docs/22-kpi-economie-si-review-uri.md)
- [08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 209 trebuie să existe în Done înainte de începere.
- PBI 075 trebuie să existe în Done înainte de începere.
- PBI 082 trebuie să existe în Done înainte de începere.
- PBI 084 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Graficele arată revenue lunar efectiv/proiectat, curse/zi, review-uri/zi, media și distribuția notelor.
- [ ] Media ponderată, zero/lipsă date, luni parțiale și sample count sunt afișate corect.
- [ ] Focusul, tabelul accesibil, Escape și pauza MANUAL/LEARNING funcționează la rezoluțiile țintă.

- [ ] Istoricul de 12 luni este paginat/downsampled numai vizual, fără medii greșite; panoul închis nu reconstruiește grafice.

## Verificare

Inspectează grafice pe date cunoscute, perioade fără review-uri, limite de lună și operare cu tastatura.

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

Verificare finală: Validate-Board.ps1 -RequireDone '210'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
