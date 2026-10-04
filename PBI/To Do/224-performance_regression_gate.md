---
id: "224"
title: "Gate de regresii performanță CI și soak complet"
status: "To Do"
release: "V1"
module: "Validare"
depends_on: ["159","220","221","222","223","218"]
performance_checks: ["frame", "memory", "workers", "storage", "assets", "soak"]
owner: null
started_at: null
completed_at: null
---

# 224 Gate de regresii performanță CI și soak complet

## Obiectiv

Implementează comenzile și jobul CI de regresii care leagă probele portabile și măsurătorile hardware ale aceleiași revizii de un gate obligatoriu. PBI 160 integrează apoi acest gate în pipeline-ul complet de livrare.

## Context și plan

- [Contracte de performanță și benchmark](../../Docs/25-performanta-contracte-si-benchmark.md)
- [WebGPU și performanță](../../Docs/17-webgpu-si-performanta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 159 trebuie să existe în Done înainte de începere.
- PBI 220 trebuie să existe în Done înainte de începere.
- PBI 221 trebuie să existe în Done înainte de începere.
- PBI 222 trebuie să existe în Done înainte de începere.
- PBI 223 trebuie să existe în Done înainte de începere.
- PBI 218 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] CI respinge depășiri de capacitate/bundle și regresii confirmate conform bugetelor; un runner fără GPU real nu închide gate-ul FPS.
- [ ] Gameplay cu learning, recorder, autosave, KPIs și XP A/B trece probele pe workload maxim V1 și pe ambele backenduri.
- [ ] Soak-ul de minimum 60 minute include 20 de cicluri de lifecycle și încălzirea laptopului; memoria/cozile ajung la platou, iar baseline-ul nu se actualizează automat.

## Verificare

Demonstrează detecția unei regresii controlate și revenirea după eliminare; păstrează cinci repetări, trace-uri, raportul soak, artefactele CI și hardware-ul real.

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

Verificare finală: Validate-Board.ps1 -RequireDone '224'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.4; implementarea nu a început.
