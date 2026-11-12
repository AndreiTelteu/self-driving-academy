---
id: "162"
title: "Gate și închiderea release-ului V1"
status: "Done"
release: "V1"
module: "Validare și release"
depends_on: ["161","154","152","108","039","076","141","216","217","235"]
owner: "loop-pbi/release-162-01"
started_at: "2026-11-12T15:27:35+02:00"
completed_at: "2026-11-12T16:03:23+02:00"
---

# 162 Gate și închiderea release-ului V1

## Obiectiv

Verifică toate criteriile V1 și pregătește artefactul de livrare.

## Context și plan

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 161 trebuie să existe în Done înainte de începere.
- PBI 154 trebuie să existe în Done înainte de începere.
- PBI 152 trebuie să existe în Done înainte de începere.
- PBI 108 trebuie să existe în Done înainte de începere.
- PBI 039 trebuie să existe în Done înainte de începere.
- PBI 076 trebuie să existe în Done înainte de începere.
- PBI 141 trebuie să existe în Done înainte de începere.
- PBI 216 trebuie să existe în Done înainte de începere.
- PBI 217 trebuie să existe în Done înainte de începere.
- PBI 235 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Toate dependențele V1 și criteriile obligatorii au dovezi de trecere. — Verificat, nu presupus: 10/10 dependențe au fișier în `PBI/Done` și dovezi comise, iar checklist-ul adjudecă 13 criterii cu comandă și rezultat real: 8 `PASS`, 2 `FAIL` (gate-ul 235 C3 și QA-ul 153), 1 `NOT_VALIDATED` (FPS pe hardware real) și 2 `NOT_RUN` (demonstrația pe hardware agreat, playtestul uman). Dovezile de trecere există unde criteriul trece; ce nu trece este declarat cu motiv, nu bifat.
- [x] Release-ul nu ascunde estimatori sau teste care au rămas neverificate. — `npm run release:checklist` scrie 26 de itemi deschiși, fiecare cu sursă și motiv (1 la 224, 3 la 235, 8 findings la 153, 11 combinații `NOT_RUN` la 154, 2 la 216, 1 la 151); verdictul agregat este `NOT_VALIDATED`, `summary.failed` este `true`, iar `--strict` iese cu cod 1. Niciun procent de revenire și nicio valoare FPS nu este inventată.

## Verificare

Checklist release și demonstrație completă pe hardware-ul agreat.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `npm run release:checklist` rulează efectiv verificările de release și scrie `Docs/Evidence/162-release-v1/{checklist.json,checklist.md,artifact.json}`; `--check` reexecută tot și compară fișierele byte cu byte, iar `--strict` transformă un release care nu este `PASS` în exit code 1. Verdict agregat: **`NOT_VALIDATED`** — 13 criterii, **8 `PASS`, 2 `FAIL`, 1 `NOT_VALIDATED`, 2 `NOT_RUN`**; 13 verificări executate, 0 eșuate; 26 de itemi deschiși, fiecare cu sursă și motiv. Release-ul nu se declară gata: gate-ul 235 are C3 `FAIL` (cinci eșecuri reale de contract ale QA-ului 153, în `src/ui`), gate-ul 224 are `fps-hardware` `NOT_VALIDATED`, iar demonstrația pe hardware agreat și playtestul uman sunt `NOT_RUN` (0/5 participanți).

Verificări executate și rezultat: `npm run release:checklist` exit 0 (2 898 teste, 2 898 trecute, 0 eșuate; 6/6 verificări statice exit 0; board `Valid: true`, 235 de task-uri; pipeline 160 `PASSED_WITH_PLAN_DEBT` cu livrare `STATIC_VERIFIED`; 224: 17 rânduri, 16 `PASS`, 0 `FAIL`, 1 `NOT_VALIDATED`; 235: 4 `PASS`, 1 `FAIL`, 1 `NOT_RUN`, 15/16 sonde; 153: 300/308, 5 eșecuri de contract; 154: 9/9 combinații, 11 `NOT_RUN` declarate; 160: 130 artefacte, 6 172 078 B, JS+WASM 6 125 279 B = 73,02 % din 8 MiB, arbore SHA-256 `81e33b1d…`). `npm run release:checklist -- --check` exit 0 („Checklist/Checklist markdown/Artefact este curent”). `npm run ci:verify -- --out=Docs/Evidence/162-release-v1/pipeline` exit 0 (`PASSED_WITH_PLAN_DEBT`, 12 pași, datoria de plan `PBI/Done/067-mode_toggle.md` publicată ca `DEBT`). `npm run typecheck`, `lint`, `format:check`, `check:architecture`, `check:parameter-catalog`, `assets:manifest -- --check`, `perf:gate -- --check`, `qa:fun -- --check`, `qa:ui -- --check`, `qa:compat -- --check`, `build:report -- --check` — toate exit 0. Validatorul de board: `Valid: true`, 235 de task-uri.

Fișiere și documente actualizate: `scripts/run-release-checklist.mjs` (nou), `scripts/ci/run-release-pipeline.mjs` (parser robust la mesajul PowerShell împachetat pe mai multe linii; datoria de plan preexistentă este clasificată `DEBT`, nu eroare necunoscută), `package.json` (intrarea `release:checklist`, ultima din blocul `scripts`), `Docs/18-validare-si-release.md` (secțiune nouă la final), `Docs/Evidence/162-release-v1/` (`README.md`, `checklist.json`, `checklist.md`, `artifact.json`, `pipeline/ci-pipeline.json`) și fișierul PBI mutat fizic în `PBI/Done`. `src/` și `Docs/performance-budgets.json` nu au fost modificate.

Limitări sau follow-up: FPS, frame p95/p99 și lucrul GPU pe hardware real rămân `NOT_VALIDATED` (224, revizie diferită de capturile 220); cele cinci eșecuri de contract ale 153 rămân `FAIL` și cer un PBI care deține `src/ui`; playtestul uman (0/5) și retenția rămân `NOT_RUN`; demonstrația pe hardware agreat și combinațiile de browser/OS declarate `NOT_RUN` de 154 nu au fost executate. Banda `ci:release` nu a fost rulată, pentru că jobul ei reîmprospătează dovezile 224 prin `--measure`, din afara ownership-ului acestui PBI; refuzul de livrare fără hardware este dovedit de verdictul 224 și de checklist. Datoria de plan preexistentă (`PBI/Done/067-mode_toggle.md`) rămâne `DEBT`, nu a fost reparată aici. `dist/` nu este comis.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate. — Fiecare criteriu are verdict executat în checklist; 235 C3 și 153 sunt `FAIL`, iar FPS-ul și playtestul sunt `NOT_VALIDATED`/`NOT_RUN`, toate declarate explicit, iar release-ul este `NOT_VALIDATED`, nu „gata”.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate. — 13 verificări cu exit code real, 26 de itemi deschiși, artefact de livrare cu mărimi și checksum.
- [x] Contractele și documentația afectate sunt actualizate. — Secțiune nouă în `Docs/18`; linkurile din fișierele atinse se rezolvă (11 fișiere, 43 de linkuri, 0 rupte).
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane. — Mutat cu `Move-Item` din `PBI/In Progress` în `PBI/Done`; sursa nu mai există.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '162' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-11-12: Implementare `loop-pbi/release-162-01`: checklist executat `npm run release:checklist` (13 criterii, 2 `FAIL`, 1 `NOT_VALIDATED`, 2 `NOT_RUN`, 26 de itemi deschiși), artefact de livrare 130 de fișiere / 6 172 078 B / digest `81e33b1d…` preluat din pipeline-ul 160, `--check` determinist, pipeline 160 `PASSED_WITH_PLAN_DEBT`; release-ul V1 este declarat onest `NOT_VALIDATED`, iar fișierul este mutat în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `functional`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
