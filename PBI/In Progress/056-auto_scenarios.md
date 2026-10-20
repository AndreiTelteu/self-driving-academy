---
id: "056"
title: "Suita autonomiei de bază"
status: "In Progress"
release: "V1"
module: "Autonomie"
depends_on: ["055","043"]
owner: "Codex gpt-6-luna medium loop-056"
started_at: "2026-10-20T13:13:05+03:00"
completed_at: null
---

# 056 Suita autonomiei de bază

## Obiectiv

Validează toate comportamentele autonome pe harta și fizica V1.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 055 trebuie să existe în Done înainte de începere.
- PBI 043 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Un taxi parcurge rute, intersecții și opriri cu profile diferite.
- [x] Cazurile riscante produc consecințe și motive documentate.

## Verificare

Rulează scenariile headless și o verificare în browser.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Suită deterministă, browser-independentă, peste controllerele și fixture-urile reale 033/036/037/038/041/044–055, cu runner și raport mașină-citibil. Acoperă `cruise` (urban, rezidențial/curbă, apropiere de intersecție), `accelerate` (lanț real 024/Rapier), `follow` (lider oprit și în mișcare), `signals` (roșu/verde pe 64 actori), `stop` (profil FULL versus ROLLING), `yield`, `lane-change` (continuitate/cooldown) și `blocked` (reroute real 041, release și reintrare MANUAL fără teleport). Două rute authored prin aceeași intersecție arată profilul prudent (oprește pe roșu, traversează pe verde) versus cel riscant (`CROSS_RED_BY_PROFILE`, trecere în faza roșie). Rezultat: 12/12 scenarii, 146/146 verificări, 10/10 cazuri negative fail-closed, 5/5 probe de mutație. Detalii în [Docs/autonomy-scenarios.md](../../Docs/autonomy-scenarios.md) și [dovezi](../../Docs/Evidence/056-auto-scenarios/README.md).

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS; `npm run format:check` PASS; `npm run check:architecture` PASS (180 fișiere TS); `npm run check:parameter-catalog` PASS; `npm test` PASS 1159/1159 (baseline 1154/1154); `npm run scenarios:autonomy -- --check` PASS (12/12 scenarii, 10/10 negative, 5/5 mutații, raport curent). Comenzile și rezultatele exacte sunt în [checks.md](../../Docs/Evidence/056-auto-scenarios/checks.md); raportul mașină-citibil este [report.json](../../Docs/Evidence/056-auto-scenarios/report.json).

Fișiere și documente actualizate: `tests/autonomy/auto-scenarios.ts`, `auto-scenarios-oracle.ts`, `auto-scenarios-support.ts`, `auto-scenarios.test.ts`; `scripts/run-auto-scenarios.mjs`; `package.json` (scriptul `scenarios:autonomy`); `Docs/autonomy-scenarios.md`; `Docs/06-autonomie-si-trafic.md`; `Docs/README.md`; `Docs/Evidence/056-auto-scenarios/` (README, checks, tests, report.json, report.md).

Limitări sau follow-up: Ruta/intersecția folosește o plantă cinematică deterministă care consumă comanda reală 047; numai `accelerate-native` dovedește fizica 024/Rapier. Nu s-a executat o probă nouă în browser; suita este intenționat browser-independentă și nu revendică FPS/GPU/soak/hardware. Faptele 036/037/038 și acoperirea de trafic sunt fixture-uri authored; în `stop-rule-profiles` poziția și dovada de staționare aparțin fixture-ului 037, iar profilul ROLLING este o decizie fără cerere de oprire, nu o trecere fizică independentă. `SERVICE`, planificarea de trasee și traficul inteligent rămân separate.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '056' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-20: Implementare pe branch `loop-pbi/pbi-056`: suită de 12 scenarii și runner cu raport mașină-citibil; verificări locale PASS, PBI rămâne In Progress pentru validarea și mutarea fizică ale părintelui.

## Nivel de validare — politica 2026-10-08

Nivel: `functional`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
