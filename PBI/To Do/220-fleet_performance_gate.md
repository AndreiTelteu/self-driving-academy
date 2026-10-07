---
id: "220"
title: "Gate de performanță al flotei înainte de campanie și asseturi"
status: "To Do"
release: "V1"
module: "Validare"
depends_on: ["115","065","218","219"]
performance_checks: ["frame", "simulation", "workers", "memory"]
owner: null
started_at: null
completed_at: null
---

# 220 Gate de performanță al flotei înainte de campanie și asseturi

## Obiectiv

Măsoară flota și pipeline-ul de learning funcționale înainte de a construi campania și asseturile finale.

## Context și plan

- [Contracte de performanță și benchmark](../../Docs/25-performanta-contracte-si-benchmark.md)
- [WebGPU și performanță](../../Docs/17-webgpu-si-performanta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 115 trebuie să existe în Done înainte de începere.
- PBI 065 trebuie să existe în Done înainte de începere.
- PBI 218 trebuie să existe în Done înainte de începere.
- PBI 219 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] 20/24/30 de taxiuri și până la 40 civile trec bugetele versionate pe hardware real, inclusiv trafic agresiv, cozi/contacte și vehicule nevizibile.
- [ ] Latența inputului și learning-ului, debitul simulat și percentilele au rezultate reproductibile, nu doar FPS mediu.
- [ ] Workload-ul 30/80 este stres separat; abaterile din workload-ul V1 normal blochează extinderea și nu sunt mascate prin reducerea traficului.

## Verificare

Execută matricea modulului 25 cu build de producție, cinci repetări și preset fix; păstrează rapoarte și trace-uri înainte/după corecții.

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

Verificare finală: Validate-Board.ps1 -RequireDone '220'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.4; implementarea nu a început.

## Nivel de validare — politica 2026-10-08

Nivel: `full`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
