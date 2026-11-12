---
id: "159"
title: "Sesiune lungă memorie și stabilitatea flotei"
status: "Done"
release: "V1"
module: "Validare și release"
depends_on: ["157","158"]
performance_checks: ["soak", "memory", "storage", "workers"]
owner: "loop-pbi/soak-159-01"
started_at: "2026-11-12T08:54:08+02:00"
completed_at: "2026-11-12T11:52:18+02:00"
---

# 159 Sesiune lungă memorie și stabilitatea flotei

## Obiectiv

Rulează cel puțin 60 de minute cu curse, intervenții, reseturi și cicluri de lifecycle.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 157 trebuie să existe în Done înainte de începere.
- PBI 158 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Nu există creștere necontrolată de resurse sau cozi blocate.
- [x] Blocajele flotei și quota sunt raportate și recuperabile.

- [x] Soak-ul durează minimum 60 minute și include 20 de cicluri lifecycle; memoria/cozile/retention ajung la platou și throttlingul laptopului este raportat.

## Verificare

Raport de soak cu memorie, incidente și jobs: `npm run perf:soak` (raport determinist cu `--check`; `--measure` reexecută soak-ul real).

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: soak real de **60,002 minute** de timp de perete (3 600 092 ms), cu **20 de cicluri lifecycle** (start → curse → intervenții → reset → reload), **215 434 tick-uri** la 60 Hz real (3 590,572 s simulați) și 120 de eșantioane la 30 s. Verdict determinist `SOAK_PASS`: 14 verificări `PASS`, 3 `NOT_MEASURED` declarate, 7 tendințe `PLATEAU`, 87 de incidente toate recuperate. Memoria: baseline cald 43,72 MiB heap / 315,05 MiB RSS → final 45,53 MiB / 319,43 MiB (**+1,81 MiB heap**, fereastra finală variază cu 0,11 MiB; prag 5 MiB). Cozi: maximum 1 job / 4 B în governor, 0 la fiecare închidere de ciclu, anulare explicită răspuns maxim 84 ms (buget 100 ms). Retenție: cotă 128 MiB atinsă în ciclul 8, 13 evacuări `OLDEST_FIRST` de 17,4 MiB, platou la 121,95 MiB cu 7 artefacte; recorder 17,42 MiB din 32 MiB. Blocaje: 72 de flotă (52 `NO_PROGRESS_OFF_GRAPH`, 20 `NO_PROGRESS_UNEXPLAINED`, cerere `REQUEST_REROUTE`, recuperate prin plasare la portul 030) și 2 lease-uri de 30 s expirate, reclamate la 0 joburi. Throttling `OBSERVED` prin variația p95 a tick-ului 5,16–8,85 ms (raport 1,72), frecvență OS constantă 2 695 MHz, derivă maximă 77 ms. Dovezi: [Docs/Evidence/159-soak](../../Docs/Evidence/159-soak/README.md) (`measurement.json`, `report.json`, `report.md`, `soak-run.txt`).

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0 (0 erori, 0 warning-uri); `npm run format:check` exit 0 („All matched files use Prettier code style!”); `npm run check:architecture` exit 0 („Architecture imports: PASS (365 TypeScript files)”, probe negative 6+4+3); `npm run check:parameter-catalog` exit 0 („Parameter catalog is synchronized.”); `node --import ./scripts/register-typescript.mjs --test "tests/harness/soak-report.test.ts"` 14 teste, 14 trecute, 0 eșuate; `npm run perf:soak -- --measure --commit=917a7de9` 60,002 min, 20 cicluri, 120 eșantioane; `npm run perf:soak` `SOAK_PASS` (87/87 incidente recuperate); `npm run perf:soak -- --check` raport și markdown actuale; `npm test` **2 874 teste, 2 874 trecute, 0 eșuate, 0 sărite, 95 343 ms**.

Fișiere și documente actualizate: `tests/harness/soak-session.ts`, `tests/harness/soak-report.ts`, `tests/harness/soak-report.test.ts`, `scripts/run-soak-report.mjs` (noi); `package.json` (intrarea `perf:soak`, ultima din `"scripts"`); `Docs/25-performanta-contracte-si-benchmark.md` (secțiune nouă la final); `Docs/Evidence/159-soak/` (README, `measurement.json`, `report.json`, `report.md`, `soak-run.txt`, `.gitattributes`); fișierul PBI mutat în `PBI/Done`. `src/` și `Docs/performance-budgets.json` nu au fost modificate.

Limitări sau follow-up: proba este headless — FPS, GPU, layout/paint DOM și memoria exactă a paginii rămân `NOT_MEASURED` (fără renderer, fără timer GPU, `totalHeapBytes` este `null` în manifest). Transportul worker-ului este loopback în proces peste `WorkerRuntime` real, nu `Worker` de browser; store-ul de commit 222 este un dublu de test cu graniță asincronă reală, nu IndexedDB durabil. Recorder-ul nu a sigilat chunk-uri de incident; retenția durabilă este fereastra deținută predată ledger-ului 132 (mapping declarat). Stiva de UI 005/066/067 nu este exercitată: intervenția este la nivel de comandă `PLAYER` plus segmente 112. Throttling-ul termic nu poate fi atribuit sau exclus fără senzor. Soak-ul nu înlocuiește gate-ul de release 224 și nici integrarea cu asseturile finale (155/223); gate-ul hardware al jocului complet rămâne `NOT_VALIDATED`.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '159' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-11-12: Implementare finalizată. Soak real de 60,002 min cu 20 de cicluri lifecycle, 215 434 tick-uri, 120 de eșantioane; `SOAK_PASS` cu 87/87 incidente recuperate, memorie +1,81 MiB heap peste baseline-ul cald, retenție la platou 121,95 MiB sub cota de 128 MiB, throttling raportat prin variația p95. Suita completă: 2 874 teste trecute.

## Nivel de validare — politica 2026-10-08

Nivel: `soak`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
