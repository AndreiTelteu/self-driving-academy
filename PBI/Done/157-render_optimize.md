---
id: "157"
title: "Optimizare Babylon instanțiere LOD și umbre"
status: "Done"
release: "V1"
module: "Validare și release"
depends_on: ["156","150","223"]
performance_checks: ["frame", "assets"]
owner: "loop-pbi/render-157-01"
started_at: "2026-11-12T07:53:25+02:00"
completed_at: "2026-11-12T08:37:12+02:00"
---

# 157 Optimizare Babylon instanțiere LOD și umbre

## Obiectiv

Reduce costul vizual bazat pe măsurători și verifică pickingul.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 156 trebuie să existe în Done înainte de începere.
- PBI 150 trebuie să existe în Done înainte de începere.
- PBI 223 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Optimizările nu modifică starea simulării sau profilele.
- [x] Câștigurile sunt măsurate pe scenele de referință.

- [x] Instanțierea locală, materialele statice și calitatea adaptivă păstrează pickingul, semnalele, spawn/despawn și presetul declarat.

## Verificare

Compară frame time și selecția înainte/după.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: costul vizual este redus pe contractele reale de prezentare, cu aceleași date de layout și aceeași semantică. Proba structurală deterministă (`npm run perf:render-budget`, fixture real 042 + decor 146) dă, pe aceeași scenă: **155 → 12 draw calls** pentru layout-ul 042 (plafon indicativ 128), **155 → 12 obiecte Babylon**, **0 → 78 instanțe thin**, **191 → 48 draw calls** totale cu decorul inclus. Benzile (96) sunt fuzionate într-un mesh de asfalt cu interval de vârfuri per element; stâlpii, carcasele și lămpile celor 26 de semafoare sunt instanțe thin ale unei cutii unitare, cu matrice `T · R · S` identice cu cutiile coapte anterior (abatere maximă a limitelor unui element 2,9 × 10⁻⁵ m, limita `float32`). LOD-ul are contract declarat (`src/rendering/lod-policy.ts`): prag `lodDistance` (45/90/150 m) la marginea cea mai apropiată, histerezis 5 m, proxy îndepărtat respins sub 95 % din sfera sursei, zero oscilații la dither în bandă și un batch lat își păstrează detaliul. Umbrele au buget explicit pe prioritate (esențial → standard → opțional) plus lista declarată a ce nu intră în hartă; taxiul selectat, înregistrat ultimul dintre 71 de casters, intră acum în harta de 48 de la MEDIUM (înainte lipsea). Pickingul este verificat dedicat: 48 de raze rezolvă aceleași ID-uri pe 70 de vehicule ca mesh-uri și ca instanțe thin, inclusiv după reordonare, eliminare și comutare LOD.

Verificări executate și rezultat: `npm run perf:render-budget` → **17 PASS, 0 FAIL, 2 NOT_MEASURED**, gate `STRUCTURAL_PASS`; `--check` → captura și rapoartele curente (exit 0); `npm run typecheck` fără erori; `npm run lint` fără erori (`--max-warnings 0`); `npm run format:check` conform; `npm run check:architecture` PASS (365 fișiere TS); `npm run check:parameter-catalog` sincronizat; `npm test` → **2849 teste, 2849 pass, 0 fail**. Frame p95/p99 și lucrul GPU rămân `NOT_MEASURED` cu motiv (probă `NullEngine`, fără renderer hardware; un cadru software nu dovedește FPS). Rezultatele, baseline-ul `546fa29e` și limitele sunt în [Docs/Evidence/157-render-budget](../../Docs/Evidence/157-render-budget/README.md).

Fișiere și documente actualizate: `src/rendering/babylon/city-scene.ts` (fuzionare benzi, semafoare instanțiate, materiale statice înghețate, API de identitate `elementGeometry`/`instanceIndexFor`/`signalHostFor`/`elementBounds`), `src/rendering/lod-policy.ts` (nou), `src/rendering/babylon/cell-batches.ts`, `src/rendering/babylon/daylight.ts` (priorități și `getShadowBudget`), exporturile din `src/rendering/{index,babylon/index}.ts`, `tests/harness/render-budget.ts` + test (nou), `tests/rendering/{city-scene,lighting}.test.ts` (contracte actualizate), `tests/rendering/lod-policy.test.ts` + `tests/rendering/render-instancing.test.ts` (noi), `scripts/run-render-budget-report.mjs` (nou) și `package.json` (`perf:render-budget`, ultima intrare), `Docs/city-visual.md`, `Docs/17-webgpu-si-performanta.md`, `Docs/lighting-quality.md`.

Limitări sau follow-up: măsurarea este structurală, deci gate-ul hardware al jocului complet rămâne `NOT_VALIDATED` (224/159); starea lămpii unui semafor este per host thin și nu se schimbă per instanță la runtime (semafoarele rămân statice în layout, ca înainte); LOD-ul rămâne la nivel de batch, deci un batch cu o singură siluetă mare nu comută niciodată (comportament intenționat, documentat); decorul 146 nu a fost modificat (era deja fuzionat pe celulă); instanțierea flotei rămâne la composition root, contractele fiind verificate.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '157' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-11-12: Implementat și verificat în `loop-pbi/render-157-01`. Instanțiere thin pentru semafoare și fuzionare benzi (155 → 12 draw calls, 78 instanțe), contract LOD declarat cu histerezis și admiterea proxy-ului, buget de umbre pe prioritate (taxiul selectat nu mai e scos din harta MEDIUM), test de echivalență a pickingului pe 48 de raze. `npm test` 2849/2849; proba structurală 17 PASS, 0 FAIL, 2 NOT_MEASURED (frame/GPU, fără renderer hardware). Dovezi: `Docs/Evidence/157-render-budget/`.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
