---
id: "221"
title: "Buget comun priorități și backpressure pentru workers"
status: "To Do"
release: "V1"
module: "Fundație"
depends_on: ["010","203","218"]
performance_checks: ["workers", "memory", "frame"]
owner: null
started_at: null
completed_at: null
---

# 221 Buget comun priorități și backpressure pentru workers

## Obiectiv

Implementează admitere globală, priorități logice, felii de lucru și ownership de payload pentru learning, encode/hash și comparații.

## Context și plan

- [Contracte de performanță și benchmark](../../Docs/25-performanta-contracte-si-benchmark.md)
- [WebGPU și performanță](../../Docs/17-webgpu-si-performanta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 010 trebuie să existe în Done înainte de începere.
- PBI 203 trebuie să existe în Done înainte de începere.
- PBI 218 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Limitele de joburi/lumi/bytes sunt versionate; learning-ul interactiv poate întrerupe cooperativ un lot secundar fără ordine greșită sau publicare duplicată.
- [ ] Anularea/progresul și timpul de coadă sunt măsurate; transferul de ArrayBuffer nu detașează starea live sau dovezi încă folosite.
- [ ] Presiunea nu pierde dovezi learning, credite XP sau date protejate; PENDING, reluarea în idle/pauză și capacitatea insuficientă sunt explicite.

## Verificare

Folosește joburi sintetice lungi/scurte pentru a măsura admiterea unui job interactiv în timpul unui lot secundar, anulare, restart, payload detașat și RAM/cozi plafonate. Integrarea learning/A/B real se verifică ulterior în 103/144/234/224, care depind de acest protocol; nu condiționa protocolul de implementarea lor.

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

Verificare finală: Validate-Board.ps1 -RequireDone '221'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.4; implementarea nu a început.
