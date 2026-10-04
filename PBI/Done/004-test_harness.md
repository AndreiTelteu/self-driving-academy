---
id: "004"
title: "Infrastructură de teste și scenarii"
status: "Done"
release: "V1"
module: "Fundație"
depends_on: ["001","002"]
owner: "Codex /root/pbi004_test_harness"
started_at: "2026-10-05T00:09:07.1725693+03:00"
completed_at: "2026-10-05T00:15:40.2994613+03:00"
---

# 004 Infrastructură de teste și scenarii

## Obiectiv

Configurează teste de domeniu și harness browser pentru scenarii cu seed.

## Context și plan

[02-arhitectura-si-contracte.md](../../Docs/02-arhitectura-si-contracte.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 001 trebuie să existe în Done înainte de începere.
- PBI 002 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Un test headless poate avansa un număr fix de tick-uri fără renderer.
- [x] Un scenariu browser poate captura stări și evenimente verificabile.

## Verificare

Rulează un exemplu de domeniu și unul de integrare browser.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: runner generic ScenarioDefinition/ScenarioAdapter avansează exact N tick-uri fără renderer și capturează copii defensive ale stărilor/evenimentelor; exemplu aritmetic cu seed și oracle independent partajat între Node și browser.

Verificări executate și rezultat: npm run test:domain — exit 0, 4/4 teste; npm run check — exit 0 (typecheck aplicație + Node tests, lint, format, arhitectură și teste); npm run build — exit 0. Browser real T3 la localhost:5173/tests/browser/: seed 41/12 tick-uri → 13 stări, final 36, event tick 4/value 12; repetare identică; seed 42 → final 12, event tick 10/value 10. Limita UI 10000 a respins 10001 nativ și la runtime. Dovezi: Docs/Evidence/004-test-harness/README.md, loguri, browser.json și browser.png.

Fișiere și documente actualizate: tests/harness, tests/scenarios, tests/browser; scripts/register-typescript.mjs și verify-architecture.mjs; package.json/package-lock.json, tsconfig.json/tsconfig.tests.json, eslint.config.js; README.md și Docs/test-harness.md.

Limitări sau follow-up: fixture-ul este exclusiv de test, nu gameplay, RNG sau sistem fixed tick de producție; 006/008 rămân separate. Harnessul browser este în dev, nu în bundle-ul produsului; npm test nu lansează browserul automat. Loaderul Node folosește API experimental stripTypeScriptTypes, sintaxă TS erasable, cu verificare semantică separată tsc.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '004' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.


- 2026-10-05T00:15:40.2994613+03:00: Implementare și verificări Node/browser reale finalizate; mutare în Done și validare obligatorie.
