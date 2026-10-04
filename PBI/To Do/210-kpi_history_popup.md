---
id: "210"
title: "Buton KPIs și grafice istorice ale flotei"
status: "To Do"
release: "V1"
module: "UI"
depends_on: ["209","075","082","084"]
owner: null
started_at: null
completed_at: null
---

# 210 Buton KPIs și grafice istorice ale flotei

## Obiectiv

Deschide prin buton KPIs/K un pop-up detaliat pentru revenue lunar, ratings și agregări zilnice.

## Context și plan

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
