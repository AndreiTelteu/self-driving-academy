---
id: "219"
title: "Scheduler de simulare și protecție la suprasarcină"
status: "To Do"
release: "V1"
module: "Fundație"
depends_on: ["008","010","044","218"]
performance_checks: ["simulation", "frame"]
owner: null
started_at: null
completed_at: null
---

# 219 Scheduler de simulare și protecție la suprasarcină

## Obiectiv

Distribuie determinist deciziile de trafic și bugetează tick-uri/context/rutare fără a schimba timpul sau stilul.

## Context și plan

- [Contracte de performanță și benchmark](../../Docs/25-performanta-contracte-si-benchmark.md)
- [WebGPU și performanță](../../Docs/17-webgpu-si-performanta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 008 trebuie să existe în Done înainte de începere.
- PBI 010 trebuie să existe în Done înainte de începere.
- PBI 044 trebuie să existe în Done înainte de începere.
- PBI 218 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Fizica/controllerul rămân la 60 Hz; deciziile 10 Hz sunt distribuite după entityId, iar inputul și evenimentele urgente nu așteaptă slotul periodic.
- [ ] Recuperarea are plafon de pași și păstrează datoria; suprasarcina produce pauză explicită, fără dt mărit, tick-uri sărite sau revenue/XP fictiv.
- [ ] Cozile/cache-urile au limite, invalidare și ordonare reproductibilă; camera nu schimbă simularea sau vecinii relevanți.

## Verificare

Testează 30/60/120 FPS, hitch, background, toate deciziile scadente simultan, semnal urgent, selecție și blocaje de rutare; compară evenimentele și debitul de simulare.

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

Verificare finală: Validate-Board.ps1 -RequireDone '219'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.4; implementarea nu a început.
