---
id: "253"
title: "Gate V4: calitate vizuală și performanță pe toate preseturile"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["239","240","241","242","243","244","245","246","247","248","249","250","251","252"]
performance_checks: ["frame","memory","assets","loading","soak"]
owner: null
started_at: null
completed_at: null
---

# 253 Gate V4: calitate vizuală și performanță pe toate preseturile

## Obiectiv

Închide V4 numai dacă jocul arată vizibil mai bine în toate cadrele și rămâne în bugetele de performanță pe toate preseturile, fără regresii de gameplay.

## Context și plan

Toate PBI-urile 239–252 au dovezi înainte/după. Acest gate compară cadrele finale cu baseline-ul 239 și reia probele de performanță ale [contractului 25](../../Docs/25-performanta-contracte-si-benchmark.md) cu aceeași metodă ca 224. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md).

## Dependențe

- PBI 239–252 trebuie să fie în Done.

## Criterii de acceptare

- [ ] Pagina de comparație 239 baseline → final este generată pentru HIGH, MEDIUM și LOW, pe WebGPU și WebGL2, și este inclusă în dovezi.
- [ ] Fiecare problemă 1–15 din tabelul documentului 30 este marcată rezolvată, cu cadrul care o dovedește, sau deschisă, cu motiv și PBI nou.
- [ ] Un playtest independent (agent sau om care nu a implementat V4) joacă cel puțin 10 minute (mers, intrare în taxi, condus, intersecții, margine de hartă) și raportează defectele vizuale; defectele blocante sunt reparate înainte de Done.
- [ ] Bugetele 224 de frame, memorie, asseturi și încărcare sunt respectate pe fiecare preset; un soak de 30 de minute pe HIGH nu are creștere de memorie GPU sau JS peste prag.
- [ ] Regresiile V1, V2 și V3 (`qa:v1-regression`, `qa:v2-regression`, `qa:v3-validation`) și `npm test` trec.

## Verificare

`npm run visual:capture` și `npm run visual:compare` pe toate preseturile; `npm run perf:gate`; `npm run perf:soak`; regresiile V1–V3; `npm test`. Toate rezultatele sunt păstrate exact în dovezi.

## Dovezi de finalizare

De completat la finalizare.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '253' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat ca gate de închidere pentru calitatea vizuală V4.
