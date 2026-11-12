---
id: "160"
title: "Build producție CI și livrare statică"
status: "Done"
release: "V1"
module: "Validare și release"
depends_on: ["159","003","151","224"]
performance_checks: ["assets", "frame"]
owner: "loop-pbi/build-160-01"
started_at: "2026-11-12T14:12:25+02:00"
completed_at: "2026-11-12T14:53:08+02:00"
---

# 160 Build producție CI și livrare statică

## Obiectiv

Configurează pipeline de verificare și build static cu asseturi și WASM.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 159 trebuie să existe în Done înainte de începere.
- PBI 003 trebuie să existe în Done înainte de începere.
- PBI 151 trebuie să existe în Done înainte de începere.
- PBI 224 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Buildul include asseturi/WASM și exclude debug; CI rulează și Validate-Plan.ps1.
- [x] CI eșuează la verificări obligatorii și nu livrează un rezultat eșuat.

- [x] Pipeline-ul include gate-ul 224; lipsa rezultatului pe hardware real nu este substituită de FPS headless/software.

## Verificare

Rulează pipeline-ul și servește local buildul rezultat.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Buildul de producție are configurație explicită în `vite.config.ts` (`base: './'`, `sourcemap: false`, `emptyOutDir`) și produce 130 de artefacte: 3 478 683 B JS, 2 646 596 B WASM, 43 917 B CSS și 2 882 B HTML (6 172 078 B total, 1 769 518 B gzip). `scripts/build-report.mjs` construiește de două ori (digest identic `81e33b1d8c54a53b…`), enumeră artefactele, verifică excluderile (0 source maps, 0 `debugger`, 0 console de debug, 0 inspector, 0 `import.meta.env`) și servește `dist/` prin HTTP: 132 de cereri, 130 artefacte verificate pe status/mărime/SHA-256/MIME, 0 eșecuri. WASM-ul (glslang 943 680 B, twgsl 1 702 916 B) este identic byte cu pachetul și cu manifestul 150 (`IDENTITY`), iar JS-ul lor de încărcare este emis și referit prin `new URL(..., import.meta.url)`. `scripts/ci/run-release-pipeline.mjs` rulează verificările obligatorii, `Validate-Plan.ps1`, `Validate-Board.ps1`, manifestul de asseturi, gate-ul 224, buildul și livrarea, cu `fail fast`; livrarea este ultima și nu rulează după un eșec. Verdict: `PASSED_WITH_PLAN_DEBT`, gate 224 structural `PASS`, release `NOT_VALIDATED`, livrare `STATIC_VERIFIED`. Buget assets: 6 125 279 B JS+WASM din 8 388 608 B (73,02 %), identic cu măsurătoarea 224 a reviziei — cost suplimentar 0 B. Frame: `NOT_VALIDATED`, preluat de gate-ul 224 pe hardware real.

Verificări executate și rezultat: `npm run ci:verify` exit 0 (typecheck 0, lint 0, format 0, arhitectură 0, catalog 0, `npm test` 2 888/2 888 pass și 0 fail, plan exit 1 clasificat `DEBT` preexistent, board 0, manifest asseturi 0 cu 17/17, gate 224 0 cu structural `PASS` și release `NOT_VALIDATED`, build 0, livrare statică 0). `npm run build:report -- --check` exit 0 (raport curent). Dovada negativă: un fișier neformatat oprește pipeline-ul la `preflight:format` cu exit 1, `FAILED`, `NOT_DELIVERED`, fără build și fără livrare. `pwsh ./PBI/Validate-Board.ps1` exit 0. `pwsh ./PBI/Validate-Plan.ps1` exit 1 exclusiv pe linkul preexistent `Docs/map-integrity.md` (datorie documentată, neatinsă de acest PBI); un link rupt într-un fișier modificat aici a fost blocant în timpul lucrului.

Fișiere și documente actualizate: `vite.config.ts`, `scripts/build-report.mjs`, `scripts/ci/run-release-pipeline.mjs`, `package.json` (intrări la finalul blocului `"scripts"`: `build:report`, `ci:verify`, `ci:release`), `Docs/18-validare-si-release.md` (secțiune nouă la final), `Docs/Evidence/160-build-delivery/` (README, `report.json`, `report.md`, `ci-pipeline.json`, `negative/ci-pipeline.json`).

Limitări sau follow-up: FPS/frame/GPU pe hardware real rămân `NOT_VALIDATED` la 224; verificarea livrării este la nivel HTTP, nu o rulare de browser cu GPU; `dist/` este reproductibil, nu comis; datoria de plan (șase linkuri preexistente, dintre care trei în `PBI/Done` și unul într-un fișier `.log` necomis) rămâne la PBI-urile care dețin fișierele.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '160' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-11-12: Implementare finalizată pe branch `loop-pbi/build-160-01`: build de producție reproductibil cu WASM și fără debug, livrare statică verificată prin HTTP (132 cereri, 130 artefacte), pipeline CI cu gate 224 și dovadă negativă. Dovezi în `Docs/Evidence/160-build-delivery/`.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
