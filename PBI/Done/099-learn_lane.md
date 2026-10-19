---
id: "099"
title: "Estimator schimbare de bandă V1"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["093","053"]
parameter_role: "estimator"
parameter_keys: ["lane_change_front_gap","lane_change_back_gap","lane_change_speed_gain","lane_change_cooldown"]
owner: "Codex gpt-6-luna medium stop-lane-estimators-01"
started_at: "2026-10-19T18:17:14+03:00"
completed_at: "2026-10-19T18:43:10+03:00"
---

# 099 Estimator schimbare de bandă V1

## Obiectiv

Estimează gap față/spate, avantaj necesar și cooldown din manevre.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 093 trebuie să existe în Done înainte de începere.
- PBI 053 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Manevrele forțate de ruta obligatorie sunt separate de schimbările opționale.
- [x] Pragurile cer oportunități variate, nu doar manevre reușite.

## Verificare

Rulează scenarii controlate cu spații și avantaje diferite.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `estimateLaneChangeParameters` în `src/learning/lane-estimator.ts`, exportat prin `src/learning/index.ts`, estimează cele patru chei de schimbare de bandă. Manevrele forțate de ruta obligatorie sunt marcate de apelant, contorizate și excluse din dovezile de preferință; `lane_change_speed_gain` și `lane_change_cooldown` folosesc exclusiv manevre opționale. Gap-urile față/spate și avantajul necesar raportează o limită observată când există doar manevre reușite și un interval `[cel mai mare refuzat, cel mai mic acceptat]` când există și oportunități refuzate/abortate, fără să pretindă un prag punctual din succesuri singulare. Cooldown-ul folosește tick-urile măsurate furnizate de apelant. Rezultatul verifică identitatea 086/087/088, deduplică pe oportunitate și este candidat-only.

Verificări executate și rezultat:
- Implementator: `npm run typecheck`, `lint`, `format:check`, `check:architecture`, `check:parameter-catalog` exit 0; `npm test` 1047/1047 PASS.
- Orchestrator, pe starea integrată după 099 (`7fd77240`): `npm run check` EXIT 0 — 1047 teste, 1047 pass, 0 fail; `npm run check:parameter-catalog` EXIT 0.
- Testele 099 acoperă separarea manevrelor forțate de cele opționale, limita observată la doar succesuri, intervalul la succesuri plus refuzuri, cooldown din tick-uri măsurate și refuzul contextelor străine.
- Dovezi: [Evidence/099-lane-estimator](../../Docs/Evidence/099-lane-estimator/README.md).

Fișiere și documente actualizate: `src/learning/lane-estimator.ts` (nou), `src/learning/index.ts`, `tests/learning/lane-estimator.test.ts` (nou), [Docs/lane-estimator.md](../../Docs/lane-estimator.md) (nou), [Docs/10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md), `Docs/Evidence/099-lane-estimator/`.

Limitări sau follow-up: Clasificarea „forțat de rută”, gap-urile, avantajul și cooldown-ul sunt fapte furnizate de apelant din 053/085–087; estimatorul verifică identitatea și fereastra, dar nu le derivează. Intervalul este o limită observată, nu un prag statistic. Candidat-only, necablat în bucla live, fără publicare de profil și fără probe browser/GPU/FPS.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '099' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Implementare în worktree izolat (commit `7fd77240`): manevre forțate separate de opționale, praguri ca limită observată sau interval, cooldown din tick-uri. Integrat prin merge (baza era vârful 098 pre-integrare); verificat de orchestrator cu 1047/1047 teste.
