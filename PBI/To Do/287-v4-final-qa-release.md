---
id: "287"
title: "Gate V4, QA final, playtest și release verificat"
status: "To Do"
release: "V4"
module: "Release"
depends_on: ["259","260","261","262","263","264","265","266","267","268","269","270","271","272","273","274","275","276","277","278","279","280","281","282","283","284","285","286"]
performance_checks: ["frame","memory","workers","storage","assets","soak"]
owner: null
started_at: null
completed_at: null
---

# 287 Gate V4, QA final, playtest și release verificat

## Obiectiv

Jocul complet este verificat vizual, funcțional și pe performanță, iar release-ul este declarat numai cu dovezi reale, fără criterii deschise ascunse.

## Starea actuală și ce lipsește

- Nu există un playtest end-to-end al Academiei în browser.
- FPS/frame pe hardware real rămâne `NOT_VALIDATED`.
- Capturile V4 nu acoperă toate preseturile și backendurile.
- Release checklist-ul vechi are FAIL/NOT_RUN și nu mai corespunde boardului.
- Nu există soak cu toate sistemele montate.
- Nu există o regulă care să împiedice marcarea Done cu criterii deschise.

## Context și plan

- [Calitate vizuală V4](../../Docs/30-calitate-vizuala-v4.md)
- [Validare și release](../../Docs/18-validare-si-release.md)
- [Contracte de performanță](../../Docs/25-performanta-contracte-si-benchmark.md)
- [Politica de validare](../../Docs/validation-policy.md)
- [Harness de performanță](../../Docs/performance-harness.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 259 trebuie să fie Done înainte de începere.
- 260 trebuie să fie Done înainte de începere.
- 261 trebuie să fie Done înainte de începere.
- 262 trebuie să fie Done înainte de începere.
- 263 trebuie să fie Done înainte de începere.
- 264 trebuie să fie Done înainte de începere.
- 265 trebuie să fie Done înainte de începere.
- 266 trebuie să fie Done înainte de începere.
- 267 trebuie să fie Done înainte de începere.
- 268 trebuie să fie Done înainte de începere.
- 269 trebuie să fie Done înainte de începere.
- 270 trebuie să fie Done înainte de începere.
- 271 trebuie să fie Done înainte de începere.
- 272 trebuie să fie Done înainte de începere.
- 273 trebuie să fie Done înainte de începere.
- 274 trebuie să fie Done înainte de începere.
- 275 trebuie să fie Done înainte de începere.
- 276 trebuie să fie Done înainte de începere.
- 277 trebuie să fie Done înainte de începere.
- 278 trebuie să fie Done înainte de începere.
- 279 trebuie să fie Done înainte de începere.
- 280 trebuie să fie Done înainte de începere.
- 281 trebuie să fie Done înainte de începere.
- 282 trebuie să fie Done înainte de începere.
- 283 trebuie să fie Done înainte de începere.
- 284 trebuie să fie Done înainte de începere.
- 285 trebuie să fie Done înainte de începere.
- 286 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Toate capturile V4 sunt comparate pe LOW/MEDIUM/HIGH și pe WebGPU/WebGL2, fără regresii vizuale neexplicate.
- [ ] Bugetele de frame, memorie, asseturi, workers și storage sunt măsurate pe buildul canditatului.
- [ ] Un playtest uman cu minimum cinci participanți acoperă Academie, LEARNING, curse, provocări și Haos; dacă nu poate fi executat, PBI rămâne In Progress.
- [ ] FPS/frame pe hardware real este măsurat pe aceeași revizie; lipsa lui blochează release-ul.
- [ ] Soak-ul și ciclurile de reset/sesiune nu cresc memoria sau numărul de resurse.
- [ ] Release checklist-ul este PASS sau are numai `NOT_RUN` justificat; niciun FAIL nu este ascuns sub Done.

## Verificare

- `npm run build`, `npm test`, `npm run perf:gate`, `npm run qa:fun`, `npm run release:checklist`.
- Capturi și playtest în browser real pe hardware/backend agreat.
- Verifică boardul cu `Validate-Board.ps1` și `loop-pbi validate`.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '287'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
