---
id: "222"
title: "Pipeline plafonat pentru recorder checkpoint și autosave"
status: "To Do"
release: "V1"
module: "Persistență"
depends_on: ["090","206","207","221","218"]
performance_checks: ["storage", "memory", "frame"]
owner: null
started_at: null
completed_at: null
---

# 222 Pipeline plafonat pentru recorder checkpoint și autosave

## Obiectiv

Integrează chunkuri, captură coerentă măsurată, encode/commit etapizat și backpressure fără blocări periodice ale condusului.

## Context și plan

- [Contracte de performanță și benchmark](../../Docs/25-performanta-contracte-si-benchmark.md)
- [WebGPU și performanță](../../Docs/17-webgpu-si-performanta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 090 trebuie să existe în Done înainte de începere.
- PBI 206 trebuie să existe în Done înainte de începere.
- PBI 207 trebuie să existe în Done înainte de începere.
- PBI 221 trebuie să existe în Done înainte de începere.
- PBI 218 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Captura sincronă a fizicii/stării la un tick și costul de encode/copie/transfer/commit sunt măsurate separat în buget.
- [ ] Există cel mult o generație în pregătire și una în commit; coalescingul nu pierde evenimente comerciale, rewards sau invalidări de learning.
- [ ] Buffer-ele și retenția au limite în bytes; replay-ul opțional poate deveni parțial, iar datele protejate și tick-urile oportunităților rămân intacte.

## Verificare

Condu cu recorder/autosave simultan, intervenție lungă, 30/40 vehicule, stocare lentă, quota plină și crash între generații; măsoară sacadarea, memorie și vârsta commitului.

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

Verificare finală: Validate-Board.ps1 -RequireDone '222'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.4; implementarea nu a început.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
