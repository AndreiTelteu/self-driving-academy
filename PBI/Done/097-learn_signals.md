---
id: "097"
title: "Estimator conformare roșu și reacție verde"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["093","050"]
parameter_role: "estimator"
parameter_keys: ["red_stop_probability","green_start_delay","red_stop_line_offset","late_red_brake_threshold"]
owner: "Codex gpt-6-luna medium follow-signal-estimators-01"
started_at: "2026-10-19T17:35:30+03:00"
completed_at: "2026-10-19T18:14:16+03:00"
---

# 097 Estimator conformare roșu și reacție verde

## Obiectiv

Estimează cele patru chei M de semafor și timpi de frânare.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 093 trebuie să existe în Done înainte de începere.
- PBI 050 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Denominatorul de conformare este numărul oportunităților eligibile.
- [x] Reacția la verde exclude plecările blocate de lider.

## Verificare

Testează treceri repetate pe roșu, verde liber și coadă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `estimateSignalParameters` în `src/learning/signal-estimator.ts`, exportat prin `src/learning/index.ts`, estimează cele patru chei de semafor și frânare. Conformarea la roșu folosește denominatorul 086 (`total`, subsetul cert eligibil pentru learning și subsetul incomplet), nu numărul de cadre sau distanța; un denominator cert zero este refuzat explicit (`REFUSED`/`ZERO_CERTAIN_RED_DENOMINATOR`), iar dacă observațiile nu acoperă exact subsetul cert, estimatorul refuză cu `INCOMPLETE_086_RED_DENOMINATOR_FACTS` în loc să calculeze un raport parțial. Observațiile sunt deduplicate pe `opportunity.id + occurrence`, deci zece cadre ale aceleiași apropieri rămân o oportunitate, iar o oportunitate trunchiată nu este nici succes, nici eșec. `green_start_delay` folosește exclusiv plecări verzi neblocate, cu tick-ul exact al verdeței și al plecării; plecările blocate de lider sunt contorizate și excluse, nu tratate ca reacții lente. Offsetul liniei de oprire și pragul de frânare târzie provin doar din apropieri RED/STOP eligibile. Rezultatul este candidat-only, cu breakdown și contoare de cadre duplicate/blocaje.

Verificări executate și rezultat:
- Implementator: `npm run typecheck`, `lint`, `format:check`, `check:architecture`, `check:parameter-catalog` exit 0; `npm test` 1043/1043 PASS; suita 092 8/8 PASS.
- Orchestrator, pe starea integrată (`43d61378`): `npm run check` EXIT 0 — 1043 teste, 1043 pass, 0 fail; `npm run check:parameter-catalog` EXIT 0.
- Testele 097 (3/3): zece cadre repetate = o oportunitate; oportunitatea trunchiată este exclusă din subsetul cert; două plecări neblocate contribuie cu exact 0,5 s; o plecare blocată de lider este contorizată și exclusă; denominatorul cert zero refuză raportul.
- Dovezi: [Evidence/097-signal-estimator](../../Docs/Evidence/097-signal-estimator/README.md).

Fișiere și documente actualizate: `src/learning/signal-estimator.ts` (nou), `src/learning/index.ts`, `tests/learning/signal-estimator.test.ts` (nou), [Docs/signal-estimator.md](../../Docs/signal-estimator.md) (nou), [Docs/10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md), `Docs/Evidence/097-signal-estimator/`.

Limitări sau follow-up: Tick-urile de verde/plecare, offsetul liniei și pragul de frânare sunt furnizate de apelant din faptele 085–087; estimatorul verifică identitatea și fereastra, dar nu derivează aceste mărimi. Conversia folosește tick-ul fix de 60 Hz. Conformarea depinde de faptul că denominatorul 086 este cel autoritativ; dacă apelantul trimite un subset incomplet, estimatorul refuză, nu corectează. Candidat-only, necablat în bucla live, fără publicare de profil și fără probe browser/GPU/FPS.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '097' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Implementare în worktree izolat (commit `ef9b4605`): conformare pe denominatorul 086 cu refuz la subset incomplet, dedup pe oportunitate, reacție verde doar din plecări neblocate cu tick exact. Integrat prin merge (baza era vârful 096 pre-integrare); verificat de orchestrator cu 1043/1043 teste.
