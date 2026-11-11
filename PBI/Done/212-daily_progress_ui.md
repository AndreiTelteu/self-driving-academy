---
id: "212"
title: "Progres și interfață pentru misiunile zilei"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["211","126","063","209"]
owner: "loop-pbi/daily-ui-212-01"
started_at: "2026-11-11T14:37:35+02:00"
completed_at: "2026-11-11T15:08:54+02:00"
---

# 212 Progres și interfață pentru misiunile zilei

## Obiectiv

Afișează cele trei obiective și urmărește evenimente live cu expirare și reward unic.

## Context și plan

- [23-misiuni-zilnice-si-experienta.md](../../Docs/23-misiuni-zilnice-si-experienta.md)
- [13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 211 trebuie să existe în Done înainte de începere.
- PBI 126 trebuie să existe în Done înainte de începere.
- PBI 063 trebuie să existe în Done înainte de începere.
- PBI 209 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Obiectivele verifică modul/intervalele cursei; replay-ul și experimentele nu contribuie.
- [x] Recompensa se produce o singură dată; expirarea și evenimentele de la limita zilei sunt coerente.
- [x] UI arată obiective, progres, XP promis, fus/reset și motivul neeligibilității.

- [x] Consumatorul filtrează sessionId/worldEpoch; Haos/replay nu îndeplinesc daily Academie.

## Verificare

Testează finalizare, duplicate, reluare, cursă mixtă, expirare și event înainte de reset cu commit ulterior.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare: consumator `212-daily-progress-v1` în `src/missions/daily-progress.ts` (filtrare
`sessionId`/`worldEpoch` cu refuzuri numărate, intervale reale `PICKUP`..`DROPOFF` cu modul
`MANUAL`/`LEARNING`/`AUTO`/`MIXED`, fereastră și buget autorate, recompensă unică prin
`recordDailyReward` 211 și checkpoint cu restore) plus proiecția `212-daily-progress-panel-v1` în
`src/ui/daily-progress-format.ts` și panoul read-only `src/ui/daily-progress.ts`. Raport determinist:
26/26 verificări PASS, 300 XP promis / 200 acordat / 2 recompense, 4 curse numărate (3 MANUAL, 1 AUTO,
0 mixte), 5 refuzuri explicit (2 `FOREIGN_SESSION`, 1 `STALE_EPOCH`, 1 `IRRELEVANT`, 1 `NO_RIDE`),
limita zilei exclusivă (`expiresAtMs - 1` → `COMPLETED`, `expiresAtMs` → `OUTSIDE_DAY`), reload 1 → 1
recompensă cu replay `DUPLICATE`, ziua următoare `NEW_DAY` cu 3 rânduri create și 1 recompensă
păstrată, panou cu 3 listeners și 0 listeners globali, determinism 2/2.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0, 0 avertismente;
`npm run format:check` exit 0; `npm run check:architecture` PASS (332 fișiere TS); `npm run
check:parameter-catalog` sincronizat; `npm test` 2352 teste, 2352 pass, 0 fail, ~76,7 s; testele țintă
`tests/ui/daily-progress.test.ts` 16/16; `npm run missions:daily-progress` 26/26 PASS;
`npm run missions:daily-progress -- --check` exit 0.

Fișiere și documente actualizate: `src/missions/daily-progress.ts`, `src/missions/index.ts`,
`src/ui/daily-progress-format.ts`, `src/ui/daily-progress.ts`, `src/ui/index.ts`,
`tests/ui/daily-progress-fixture.ts`, `tests/ui/daily-progress.test.ts`,
`tests/ui/daily-progress-report.ts`, `scripts/run-daily-progress-report.mjs`, `package.json`
(`missions:daily-progress`, ultima intrare), `Docs/23-misiuni-zilnice-si-experienta.md`,
`Docs/08-interfata-camera-si-control.md`, `Docs/Evidence/212-daily-progress/` (README, `report.json`,
`report.md`).

Limitări sau follow-up: nivel `funcțional izolat` + cost structural UI, fără Playwright sau măsurătoare
FPS/GPU pe hardware (gate-urile 155/159/220/224 rămân deschise); consumatorul nu scrie ledgerul XP
`PlayerProgress` și nici KPI-urile 209, ci expune creditele idempotente 211; `LEARNING_ACTIVATIONS`
numără activări reale `PROFILE_ACTIVATE`, iar cheia 092 afișată este subiectul autorat, nu o valoare
re-derivată (007 nu poartă cheia de parametru); panoul nu montează butonul în HUD (`src/app/` neatins);
suma de 100 XP rămâne propunerea de calibrare a 211.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '212'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.

- 2026-11-11: Implementare livrată pe `loop-pbi/daily-ui-212-01` (consumator 212 + panou read-only,
  16 teste, raport 26/26, suita completă 2352/2352); task mutat fizic în Done.
