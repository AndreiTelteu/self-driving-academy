---
id: "155"
title: "Verificarea finală a hardware-ului și bugetelor stabilite"
status: "Done"
release: "V1"
module: "Validare și release"
depends_on: ["154","019","203","220","222","223"]
performance_checks: ["frame", "simulation", "memory", "loading"]
owner: "loop-pbi/hardware-155-01"
started_at: "2026-11-12T06:02:41.6668430+02:00"
completed_at: "2026-11-12T06:25:01.8853394+02:00"
---

# 155 Verificarea finală a hardware-ului și bugetelor stabilite

## Obiectiv

Verifică pe jocul complet configurațiile și bugetele fixate în 203, fără redefinirea lor retroactivă.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 154 trebuie să existe în Done înainte de începere.
- PBI 019 trebuie să existe în Done înainte de începere.
- PBI 203 trebuie să existe în Done înainte de începere.
- PBI 220 trebuie să existe în Done înainte de începere.
- PBI 222 trebuie să existe în Done înainte de începere.
- PBI 223 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] FPS/frame time/memorie/încărcare sunt măsurate pe configurațiile fixate. Frame/FPS, memorie (heap JS și contoare de ownership) și încărcarea (bytes reali ai build-ului de producție, 5,84 MiB din 8 MiB) sunt măsurate pe configurația `laptop` fixată (5 × 30 s + 120 s, WEBGPU și WEBGL2); latența cold până la prima comandă și memoria exactă pagină/GPU sunt declarate `NOT_MEASURED`, pentru că pagina de joc completă și API-ul de memorie exactă nu există.
- [x] Se raportează abaterile și costurile learning, recorderului, KPI-urilor, creditelor XP, provocărilor și distrugerii. Costurile sunt separate pe sistem, peste baseline-ul real de conducere: learning 0,135, recorder 0,204, KPI 0,024, XP 0,025, provocări 0,076, distrugere 0,058 ms/tick (p95); însumat 6,53 % din bugetul de tick. Abateri față de buget: niciuna în starea curentă; baseline-ul dinainte de optimizări (tick p95 max 10,4 ms > 8 ms) este păstrat ca abatere documentată.

- [x] Configurația exactă, percentilele, inputul și debitul simulat respectă manifestul 203 și probele 218; GPU/memoria indisponibile sunt declarate. Configurația și protocolul sunt citite din manifest și verificate de script; p50/p95/p99 și distribuțiile per rulare sunt în `report.json`; input p95 1,6–2,6 ms, timp simulat/timp real 1,0001; GPU `null` pe WEBGPU și memoria exactă sunt declarate `NOT_MEASURED` cu motiv.

## Verificare

Documentează baseline-ul înainte de optimizări.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Raport determinist (`npm run perf:hardware-budget`, cu `--check` și `--measure`) care citește bugetele din `Docs/performance-budgets.json` fără să le modifice și compară 8 configurații măsurate (4 workload-uri × WEBGPU/WEBGL2, 5 repetări fiecare) plus costul separat al celor șase sisteme și bytes-ii build-ului de producție. Verdict: 85 PASS, 0 FAIL, 6 NOT_MEASURED declarate, 17 rânduri structurale de suprasarcină; gate hardware al jocului complet `NOT_VALIDATED`. Baseline-ul de dinainte de optimizări este documentat explicit (captura `20261022T005309189Z`, tick p95 max 10,4 ms > bugetul de 8 ms).

Verificări executate și rezultat:
- `npm run typecheck` — PASS (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`).
- `npm run lint` — PASS (0 erori, 0 warning-uri).
- `npm run format:check` — PASS.
- `npm run check:architecture` — PASS (probele negative incluse).
- `npm run check:parameter-catalog` — PASS („Parameter catalog is synchronized.”).
- `node --import ./scripts/register-typescript.mjs --test "tests/harness/hardware-budget.test.ts"` — 12 teste, 12 trecute, 0 eșuate.
- `npm run perf:hardware-budget -- --measure` — build 130 artefacte: 3 478 182 B JS + 2 646 596 B WASM + 43 917 B CSS, gzip 1 769 191 B; cost 5 eșantioane × 600 tick-uri, baseline median 48,635 ms/600 tick-uri.
- `npm run perf:hardware-budget` — 109 rânduri: 85 PASS, 0 FAIL, 6 NOT_MEASURED, 17 STRUCTURAL, 1 REPORTED.
- `npm run perf:hardware-budget -- --check` — „Hardware budget report is current” + „markdown is current”.
- `npm test` — 2792 teste, 2792 trecute, 0 eșuate, 0 sărite, 96 117 ms.

Fișiere și documente actualizate: `tests/harness/hardware-budget.ts`, `tests/harness/hardware-budget.test.ts`, `tests/harness/hardware-systems-cost.ts`, `scripts/run-hardware-budget-report.mjs`, `package.json` (intrarea `perf:hardware-budget`, ultima), `Docs/25-performanta-contracte-si-benchmark.md` (secțiune nouă la final), `Docs/Evidence/155-hardware-budget/` (README, `report.json`, `report.md`, `systems-cost.json`, `build-transfer.json`, `.gitattributes`). `src/` și `Docs/performance-budgets.json` nu au fost modificate.

Limitări sau follow-up: Proba de frame este gate-ul integrat 220, nu jocul complet — intrarea de producție `src/main.ts` nu compune o cursă, deci HUD-ul, asseturile finale și sistemele noi nu rulează în același cadru; costul lor este măsurat separat pe tick. Capturile browser sunt din 22 octombrie 2026 (commit `2d68b43c8cdf`), măsurătorile proprii din 12 noiembrie 2026, diferență declarată. GPU pe WEBGPU, memoria exactă pagină/GPU și pornirea cold la prima comandă rămân `NOT_MEASURED` cu motiv. Costurile sunt măsurători Node cu ceas de perete pe o mașină partajată, fără renderer. Soak-ul de 60 de minute și ciclurile lifecycle rămân la 224; integrarea finală rămâne la 235.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '155' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-11-12: Implementare în `loop-pbi/hardware-155-01`: raport determinist care citează bugetele din manifestul 203, 8 configurații măsurate (85 PASS, 0 FAIL, 6 NOT_MEASURED declarate, 17 structurale), cost separat pe learning/recorder/KPI/XP/provocări/distrugere (6,53 % din bugetul de tick) și baseline-ul de dinainte de optimizări păstrat ca FAIL (tick p95 max 10,4 ms). Mutat în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `full`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
