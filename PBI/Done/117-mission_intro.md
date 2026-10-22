---
id: "117"
title: "Misiunea primul taxi și tutorialul de control"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["116","073"]
owner: "loop-pbi/mission-chain-117-121-01 (cpa/deepseek/deepseek-v4.1-flash)"
started_at: "2026-10-22T09:01:49+03:00"
completed_at: "2026-10-22T09:33:21+03:00"
---

# 117 Misiunea primul taxi și tutorialul de control

## Obiectiv

Creează tutorial pentru selecție, M/L, AUTO/MANUAL/LEARNING și cursă completă fără learning accidental.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 116 trebuie să existe în Done înainte de începere.
- PBI 073 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Tutorialul poate fi parcurs cu tastatură și mouse.
- [x] Accesul la celelalte taxiuri nu este blocat de progres.

## Verificare

Parcurge tutorialul și verifică skip/resume.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/missions/tutorial.ts` (`117-mission-tutorial-v1`, ID stabil `tutorial-first-taxi-controls`) definește cinci pași fixați — `SELECT_TAXI`, `MODE_MANUAL`, `MODE_LEARNING`, `MODE_AUTO`, `COMPLETE_RIDE` — și avansează numai din fapte reale: selecția 068 tip `TAXI`, proiecția acceptată 067 (`mode` + `learningEligible`) și evenimentele 007 `PICKUP`/`DROPOFF` pentru taxiul selectat. Fără învățare accidentală: pasul LEARNING cere `learningEligible === false`, iar orice observație `LEARNING` cu eligibilitate `true` sau `null` este refuzată cu eroare de contract (`refusedLearning`), indiferent de pas; contractul nu are API de job/versiune/profil, iar `stats()` raportează structural `learningJobs: 0` și `profileVersions: 0`; un `PROFILE_ACTIVATE` de pe bus este doar evidență. Accesul la taxiuri nu este condiționat: orice taxi poate fi selectat în orice pas, `canSelectTaxi` răspunde `allowed: true`, `blockedSelections` este 0, iar schimbarea taxiului păstrează pașii satisfăcuți. Selecția civilă este `NOT_A_TAXI`; cursa cere `PICKUP` real pentru taxiul selectat (alt taxi → `FOREIGN_VEHICLE`, fără îmbarcare sau alt `rideId` → `RIDE_NOT_BOARDED`). `skip` (pas sau `ALL`), `pause`/`resume` păstrează progresul, iar tick-urile vechi aruncă. `src/ui/mission-tutorial-format.ts` (`117-mission-tutorial-ui-v1`) parsează strict un snapshot și proiectează textele; `src/ui/mission-tutorial.ts` randează patru butoane native `<button type="button">` cu patru intenții (Pauză, Reia, Sari peste pas, Sari peste tutorial), fără listener global, deci clic și Enter/Space focalizat folosesc același drum, iar tastele de condus rămân neatinse.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!” exit 0; `npm run check:architecture` PASS (266 fișiere TypeScript; probe negative 6+4+3) exit 0; `npm test` **1904/1904 pass, 0 fail** (duration_ms 66.3 s). Teste țintite `tests/missions/mission-intro.test.ts` + `tests/ui/mission-tutorial.test.ts`: **19/19 pass**. Raport determinist `scripts/run-mission-intro-report.mjs`: **40/40 verificări**, 5 pași, 0 joburi de learning, `--check` curent. Parcurs complet: selecție → M → L → M → pickup → dropoff → `COMPLETED` (`completedBy: PLAY`), toți pașii `SATISFIED`, 0 activări observate; refuz `LEARNING` eligibil/`null` fără avansare; alt taxi selectabil la orice pas și continuare fără reset; skip pas + skip ALL (`SKIP`), pauză ignoră observațiile, reluare continuă la pasul reținut; bus 007 real conduce cursa, iar o lume străină este refuzată. Playtest scurt în Chromium 156.0.8078.4 pe portul **5117** (închis după): **14/14 verificări**, 4 capturi — Tab→`Pauză`+Enter→`PAUSED`, Tab→`Reia`+Space→`ACTIVE`, tasta `M` nu schimbă starea, clic pe „Sari peste tutorial”→`COMPLETED` cu toate butoanele dezactivate. Dovezi în [Evidence/117-mission-intro](../../Docs/Evidence/117-mission-intro/README.md) (`report.json`, `report.md`, `playtest.json`, 4 PNG, `checks.txt`, `tests.txt`).

Fișiere și documente actualizate: `src/missions/tutorial.ts`, `src/ui/mission-tutorial-format.ts`, `src/ui/mission-tutorial.ts` (noi), `src/missions/index.ts`, `src/ui/index.ts`, `tests/missions/tutorial-fixture.ts`, `tests/missions/mission-intro.test.ts`, `tests/missions/mission-intro-report.ts`, `tests/ui/mission-tutorial.test.ts`, `scripts/run-mission-intro-report.mjs`, `scripts/capture-mission-tutorial.mjs`, [Docs/13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md), `Docs/Evidence/117-mission-intro/`.

Limitări sau follow-up: panoul nu este montat în `main.ts`/vertical slice (compunerea și ecranul de misiuni rămân în PBI-urile de UI), nu există XP, persistare între sesiuni sau blocare intenționată de taxiuri; testul de browser montează panoul real cu un host de probă determinist, nu jocul complet, și nu măsoară FPS/memorie/hardware; tutorialul nu citește singur 067/068 și nu înlocuiește control authority.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '117' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-22: Revendicat în worktree izolat `mission-chain-117-121-01` (owner `loop-pbi/mission-chain-117-121-01 (cpa/deepseek/deepseek-v4.1-flash)`); mutat fizic To Do → In Progress după `npm ci`.

- 2026-10-22: Implementat contractul tutorialului, panoul UI, 19 teste, raportul determinist cu 40 de verificări și playtest-ul Chromium pe portul 5117 (14/14). Criterii bifate după execuție, dovezi și Docs/13 actualizate; mutat fizic In Progress → Done după `Validate-Board.ps1 -RequireDone '117'`.
