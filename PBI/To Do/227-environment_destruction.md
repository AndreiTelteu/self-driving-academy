---
id: "227"
title: "Decor destructibil și zone de joacă"
status: "To Do"
release: "V1"
module: "Oraș și fizică"
depends_on: ["226","028","042","044","223"]
performance_checks: ["simulation", "assets", "memory", "frame"]
owner: null
started_at: null
completed_at: null
---

# 227 Decor destructibil și zone de joacă

## Obiectiv

Adaugă obiecte care cedează la impact și locuri pentru drift, rampă și demolare, în aceeași fizică pentru toate sursele de control.

## Context și plan

- [26-joaca-libera-haos-si-distrugere.md](../../Docs/26-joaca-libera-haos-si-distrugere.md)
- [04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 226 trebuie să existe în Done înainte de începere.
- PBI 028 trebuie să existe în Done înainte de începere.
- PBI 042 trebuie să existe în Done înainte de începere.
- PBI 044 trebuie să existe în Done înainte de începere.
- PBI 223 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Garduri ușoare/conuri/lăzi/pubele/indicatoare decorative/mobilier au stări INTACT/MOVED/BROKEN și praguri calibrate.
- [ ] DESTRUCTIBLE_BROKEN este deduplicat și păstrează instigatorul real; obiectele ușoare nu funcționează ca ziduri invizibile.
- [ ] Clădirile și regulile STOP/semafor rămân structurale; obstacolele mari deplasate sunt detectate de autonomie, indiferent de cameră.
- [ ] Rampa, parcarea și aleea destructibilă sunt accesibile fără mers pe jos și oferă trasee pentru încercări succesive.
- [ ] Checkpoint/reload/reset păstrează sau refac corect decorul; corpurile/colliderele au plafoane și cleanup măsurate, fără schimbarea gameplay pe Low.

## Verificare

Testează impact slab/puternic/continuu, reacție în lanț, contact AI nevizibil, obiect deplasat pe bandă, reload și reset; playtest senzația impactului și benchmark contactele.

Păstrează scenariile, comenzile, playtesturile și rapoartele reale; nu declara trecerea fără execuție.

## Dovezi de finalizare

Rezultat implementare: De completat.

Verificări executate și rezultat: De completat.

Fișiere și documente actualizate: De completat.

Limitări sau follow-up: De completat.

## Definition of Done

- [ ] Criterii îndeplinite și verificate.
- [ ] Dovezi completate, inclusiv performance_checks și verificarea vizuală relevantă.
- [ ] Contracte/documentație actualizate.
- [ ] Status Done și completed_at completat.
- [ ] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '227'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.
