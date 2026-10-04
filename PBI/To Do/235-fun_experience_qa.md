---
id: "235"
title: "Regresii și playtest pentru distracție și revenire"
status: "To Do"
release: "V1"
module: "Validare"
depends_on: ["216","224","226","228","229","230","233","234","084"]
performance_checks: ["frame", "simulation", "memory", "workers", "storage", "assets", "soak"]
owner: null
started_at: null
completed_at: null
---

# 235 Regresii și playtest pentru distracție și revenire

## Obiectiv

Validează împreună noile experiențe V1 și motivele de rejucare, fără a prezenta ipoteze de retenție drept rezultate măsurate.

## Context și plan

- [26-joaca-libera-haos-si-distrugere.md](../../Docs/26-joaca-libera-haos-si-distrugere.md)
- [27-reglaje-hud-si-camera.md](../../Docs/27-reglaje-hud-si-camera.md)
- [28-provocari-random-si-revenire.md](../../Docs/28-provocari-random-si-revenire.md)
- [29-savefile-si-integritate.md](../../Docs/29-savefile-si-integritate.md)
- [18-validare-si-release.md](../../Docs/18-validare-si-release.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 216 trebuie să existe în Done înainte de începere.
- PBI 224 trebuie să existe în Done înainte de începere.
- PBI 226 trebuie să existe în Done înainte de începere.
- PBI 228 trebuie să existe în Done înainte de începere.
- PBI 229 trebuie să existe în Done înainte de începere.
- PBI 230 trebuie să existe în Done înainte de începere.
- PBI 233 trebuie să existe în Done înainte de începere.
- PBI 234 trebuie să existe în Done înainte de începere.
- PBI 084 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Scenariile combinate Academie/Haos, learning/slidere, R/reset, distrugere, provocări/daily și savefile trec fără contaminarea progresului.
- [ ] XP/nivel nu scad prin accidente/KPI/eșec; evenimente duplicate, joburi stale, schimbarea zilei și importul nu dublează credite.
- [ ] HUD/camera first-person și sliderele sunt confortabile în două clase și accesibile la 1280×720; feedbackul destructibil este verificat vizual/audio.
- [ ] Benchmarkul 224 include toate noile sisteme și 20 cicluri reset/sesiune; păstrează măsurători reale, plafoane și limitări.
- [ ] Playtest cu minimum cinci participanți acoperă condus liber, prima schimbare de stil, distrugere și reluarea unei provocări; consemnează cine reîncearcă spontan și de ce.
- [ ] Eșecurile/limitările de experiență sunt explicite; rezultatele nu declară return rate fără sesiuni de revenire măsurate.

## Verificare

Execută matricea integrată, playtestul și verificările hardware; păstrează builds/scenarii/capturi/rapoarte. Gate-ul 162 depinde de acest PBI.

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

Verificare finală: Validate-Board.ps1 -RequireDone '235'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.
