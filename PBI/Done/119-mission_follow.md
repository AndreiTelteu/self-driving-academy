---
id: "119"
title: "Provocarea a două stiluri de urmărire"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["118","096"]
owner: "loop-pbi/missions-118-120-01 (opencode/deepseek-v4.1-flash-free)"
started_at: "2026-10-22T20:27:52+03:00"
completed_at: "2026-10-22T20:44:51+03:00"
---

# 119 Provocarea a două stiluri de urmărire

## Obiectiv

Creează scenarii cu viteze și distanțe care separă headway și gap.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 118 trebuie să existe în Done înainte de începere.
- PBI 096 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Jucătorul poate compara două profile în contexte cunoscute.
- [x] Misiunea nu cere estimarea coeficienților dintr-o singură viteză.

## Verificare

Playtest două stiluri cu aceleași condiții de lider.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

Verificarea s-a făcut determinist, prin contract: patru contexte autorate cu aceleași fapte de lider pentru ambele stiluri, gap-ul măsurat de politica reală 048 și coeficienții derivați de estimatorul real 096. Nu a fost necesar un playtest de browser, pentru că PBI-ul livrează un contract de domeniu fără UI sau efect în `main.ts`.

## Dovezi de finalizare

Rezultat implementare: `src/missions/follow.ts` (schema `119-mission-follow-v1`) compară exact două profiluri pe aceleași contexte autorate (4/8/12/20 m/s, distanțe 12/14/16/30 m). Gap-ul fiecărui stil este `desiredGapM` raportat de politica livrată 048, iar `following_time_headway` și `following_min_gap` sunt derivate exclusiv de estimatorul 096 din observațiile reale 086/087/088/093. Stările sunt `SEPARATED`/`IDENTICAL`/`UNIDENTIFIED`, separarea `HEADWAY`/`MINIMUM_GAP`/`BOTH`/`NONE`/`UNIDENTIFIED`, toleranțele 0,1 s și 0,5 m, iar poarta `followingMissionGate` acordă `PROGRESS` numai pentru `SEPARATED`. Refuzul pe o singură viteză este executabil: setul de un context produce `UNIDENTIFIED` cu `SINGLE_SPEED_CANNOT_IDENTIFY`, deși gap-urile măsurate diferă (23,2 m vs 8,8 m). Structurul raportează `profileWrites: 0` și `learningJobs: 0`.

Verificări executate și rezultat:
- `npx tsc --noEmit` — exit 0, fără output.
- `npm run lint` — exit 0, fără avertismente.
- `npm run format:check` — `All matched files use Prettier code style!`, exit 0.
- `npm run check:architecture` — `Architecture imports: PASS (300 TypeScript files)`, probe negative PASS, exit 0.
- `npm run check:parameter-catalog` — `Parameter catalog is synchronized.`, exit 0.
- `npm test` — 2081 teste, 2081 pass, 0 fail, 72,8 s, exit 0.
- `node --import ./scripts/register-typescript.mjs --test "tests/missions/mission-follow.test.ts"` — 7 teste, 7 pass, 0 fail.
- `npm run missions:follow` — `SUMMARY checks 48/48, scenarios 5, overall PASS`.
- `npm run missions:follow -- --check` — `Mission follow report is current`, exit 0.

Fișiere și documente actualizate: `src/missions/follow.ts`, `src/missions/index.ts`, `tests/missions/mission-follow-fixture.ts`, `tests/missions/mission-follow.test.ts`, `tests/missions/mission-follow-report.ts`, `scripts/run-mission-follow-report.mjs`, `package.json`, `Docs/13-misiuni-si-progres.md`, `Docs/Evidence/119-mission-follow/README.md`, `Docs/Evidence/119-mission-follow/report.json`, `Docs/Evidence/119-mission-follow/report.md`.

Limitări sau follow-up: rulare Node deterministă, fără browser/renderer/sesiune umană; identitățile fereastră 087 și 088 folosesc încă două scheme, iar fixture-ul leagă fereastra reală 088 de fereastra reală 087 a aceleiași oportunități fără să inventeze valori; faptele de lider autorate sunt un set de calibrare controlat, nu trafic înregistrat. Nu se revendică FPS, GPU sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '119' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-22T20:27:52+03:00: preluat de `loop-pbi/missions-118-120-01 (opencode/deepseek-v4.1-flash-free)`, status In Progress, fișier mutat în `PBI/In Progress`.
- 2026-10-22T20:44:51+03:00: implementare și verificare finalizate; contract `119-mission-follow-v1`, 7 teste țintă PASS, raport 48/48 PASS, suită completă 2081/2081 PASS. Status Done, fișier mutat fizic în `PBI/Done`.
