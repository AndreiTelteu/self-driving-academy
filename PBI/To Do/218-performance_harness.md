---
id: "218"
title: "Harness și rapoarte versionate de performanță"
status: "To Do"
release: "V1"
module: "Fundație"
depends_on: ["004","019","203","008"]
performance_checks: ["frame", "simulation", "memory"]
owner: null
started_at: null
completed_at: null
---

# 218 Harness și rapoarte versionate de performanță

## Obiectiv

Implementează probe reproductibile, colectare plafonată și PerformanceReport de la bootstrap, înainte de extindere.

## Context și plan

- [Contracte de performanță și benchmark](../../Docs/25-performanta-contracte-si-benchmark.md)
- [WebGPU și performanță](../../Docs/17-webgpu-si-performanta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 004 trebuie să existe în Done înainte de începere.
- PBI 019 trebuie să existe în Done înainte de începere.
- PBI 203 trebuie să existe în Done înainte de începere.
- PBI 008 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Raportul identifică commit/bugete/fixture/seeds/hardware/backend/preset și separă CPU, GPU disponibil, frame time, input și debit de simulare.
- [ ] Colectorul are limite de resurse și overhead măsurat; cinci repetări, cold load și warmup sunt raportate distinct.
- [ ] Probele CPU portabile și probele de browser pe hardware au roluri separate; datele indisponibile și scope-ul încă neimplementat nu sunt inventate.

## Verificare

Rulează fixture minim și aceeași probă cu colector activ/inactiv; verifică exportul după probă, percentilele pe date cunoscute și lipsa API-ului GPU/memorie.

Păstrează comenzile, configurația, rapoartele și limitările reale. Nu declara verificări fără execuție.

## Dovezi de finalizare

Rezultat implementare: De completat.

Verificări executate și rezultat: De completat.

Fișiere și documente actualizate: De completat.

Limitări sau follow-up: De completat.

## Definition of Done

- [ ] Criterii îndeplinite și verificate.
- [ ] Dovezi completate, inclusiv rapoartele performance_checks.
- [ ] Contracte/documentație actualizate.
- [ ] Status Done și completed_at completat.
- [ ] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '218'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.4; implementarea nu a început.
