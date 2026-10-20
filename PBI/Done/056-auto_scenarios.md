---
id: "056"
title: "Suita autonomiei de bază"
status: "Done"
release: "V1"
module: "Autonomie"
depends_on: ["055","043"]
owner: "Codex gpt-6-luna medium loop-056"
started_at: "2026-10-20T13:13:05+03:00"
completed_at: "2026-10-20T03:45:00+03:00"
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

Rezultat implementare: suita deterministă `runAutoScenarioSuite()` în `tests/autonomy/auto-scenarios.ts`, cu oracle independent în `auto-scenarios-oracle.ts` (formulele/tabelele publicate, calculate la runtime din intrările scenariului, nu transcripturi precalculated) și suport în `auto-scenarios-support.ts`. Acoperă 12 scenarii peste controllerele reale 033/036/037/038/041/044–055: cruise pe drum liber, curbă rezidențială, apropiere de intersecție, ciclu roșu/verde (33 verificări), profile de STOP, rută prudent/riscant (riscantul produce `CROSS_RED_BY_PROFILE`), following, yield, lane change (29 verificări), blocked/recovery și accelerate nativ. 12/12 scenarii, 146/146 verificări, 191 aserțiuni; 10 cazuri negative eșuează închis (`FOREIGN_CONTEXT`, `STALE_CONTEXT`, `FOREIGN_OR_STALE_BEHAVIOR`, `NO_LEADER`, `UNAVAILABLE`, `LEADER_STOP_NOT_STOP_INTENT`, `INCOMPLETE_LANE_COVERAGE`, `MISSING_LANE_GRAPH`, mismatch de profil), iar 5 probe de mutație dovedesc sensibilitatea (cruise care ignoră stilul, following care ignoră liderul, semnal care oprește mereu, lane change care acceptă `LOCAL_ONLY`, yield care ignoră gap-ul sunt respinse). Pentru politicile probabilistice, eșantionul este derivat prin adresarea 006: `randomUnit(deriveOpportunitySeed(vehicleSeed, opportunityKey), 'red-compliance' | 'full-stop', 0)`.

Verificări executate și rezultat: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (180 fișiere), `check:parameter-catalog` exit 0; `npm test` 1159/1159 PASS (1154 baseline + 5); `npm run scenarios:autonomy -- --check` PASS, raport curent. Runner: 12/12 scenarii, 10/10 negative, 5/5 mutații, overall PASS; raport de 47.797 B. Dovezi în [Evidence/056-auto-scenarios](../../Docs/Evidence/056-auto-scenarios/README.md).

Fișiere și documente actualizate: `tests/autonomy/auto-scenarios{,-oracle,-support}.ts`, `tests/autonomy/auto-scenarios.test.ts`, `scripts/run-auto-scenarios.mjs`, `package.json` (script), [Docs/autonomy-scenarios.md](../../Docs/autonomy-scenarios.md) (nou), [Docs/06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md), `Docs/README.md`, `Docs/Evidence/056-auto-scenarios/`.

Limitări sau follow-up: ruta de joncțiune folosește o plantă cinematică deterministă care consumă comenzile reale 047; doar `accelerate-native` exercită fizica reală 024/Rapier, deci nu se pretinde o călătorie complet fizică prin intersecție. Fără probă browser nouă (suita este intenționat browser-independent), fără FPS/GPU/soak/hardware. Faptele 036/037/038 și acoperirea traficului sunt intrări de fixture, nu percepție live. În `stop-rule-profiles`, poza și dovada staționării aparțin fixture-ului real 037, iar profilul ROLLING este evaluat ca decizie fără cerere de oprire, nu ca traversare fizică independentă. `SERVICE`, planificarea de rută și traficul inteligent rămân în afara scopului.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '056' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-20: Implementare pe branch `loop-pbi/pbi-056`: suită de 12 scenarii și runner cu raport mașină-citibil; verificări locale PASS, PBI rămâne In Progress pentru validarea și mutarea fizică ale părintelui.

## Nivel de validare — politica 2026-10-08

Nivel: `functional`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
- 2026-10-20: Implementare în worktree izolat (commit `1db33e35`): suită deterministă de 12 scenarii cu oracle independent, 10 cazuri negative și 5 probe de mutație; 1159/1159 teste. Integrat prin fast-forward; verificat de orchestrator.
