---
id: "223"
title: "Bugete de asseturi randare și calitate adaptivă"
status: "To Do"
release: "V1"
module: "Babylon"
depends_on: ["015","016","018","203","218"]
performance_checks: ["assets", "loading", "frame", "memory"]
owner: null
started_at: null
completed_at: null
---

# 223 Bugete de asseturi randare și calitate adaptivă

## Obiectiv

Introduce de la scenele mici bugete de asseturi, batchuri locale, cache/disposal și adaptare exclusiv vizuală.

## Context și plan

- [Contracte de performanță și benchmark](../../Docs/25-performanta-contracte-si-benchmark.md)
- [WebGPU și performanță](../../Docs/17-webgpu-si-performanta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 015 trebuie să existe în Done înainte de începere.
- PBI 016 trebuie să existe în Done înainte de începere.
- PBI 018 trebuie să existe în Done înainte de începere.
- PBI 203 trebuie să existe în Done înainte de începere.
- PBI 218 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Manifestul și verificarea asseturilor separă transferul, decode/WASM, resursele GPU estimate și costul primei utilizări; depășirile au diagnostic.
- [ ] Instanțierea pe celule, LOD și materialele statice păstrează pickingul/entityId, semafoarele și mișcarea vehiculelor pe ambele backenduri.
- [ ] DPR/rezoluția/umbrele și adaptarea cu histerezis sunt raportate; calitatea nu modifică fizica, mașinile, learning-ul, KPI-urile sau XP-ul.

## Verificare

Compară batch global/local și instanțe dinamice, cold/warm load, primele shadere, selecție distantă, schimbare de calitate și cicluri de dispose; verifică manifest supra-buget.

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

Verificare finală: Validate-Board.ps1 -RequireDone '223'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.4; implementarea nu a început.
